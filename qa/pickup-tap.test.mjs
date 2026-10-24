// V12.1: tap-to-pick, tap detection, projected hit-testing and remembered settings.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {Game,TAP_PICKUP_RANGE} from '../core.js';
import {WEAPONS} from '../weapons.js';
import {createGameCamera,fitGameCamera,cameraFocus,cameraOffset} from '../camera.js';
import * as ui from '../ui.js';

function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function running({autoEquip=false,seed=7}={}){const g=new Game({random:seeded(seed),map:0,autoEquip});g.status='running';g.player.x=0;g.player.z=0;return g;}
const weapon=(id,x,z)=>({kind:'weapon',weaponId:id,x,z});
const snapshot=g=>JSON.stringify({status:g.status,drops:g.drops.map(d=>d.id),pending:g.pendingPickup&&{id:g.pendingPickup.id,w:g.pendingPickup.weaponId,l:g.pendingPickup.levelChange},levels:g.weaponLevels,loadout:g.loadout,two:g.twoHandedWeapon,power:g.power,hp:[g.player.hp,g.player.maxHp],events:g.events});

// The pre-V12.1 collectDrops body, kept here as the behavioural reference.
function referenceCollect(g){
 if(g.status!=='running')return;
 for(let i=0;i<g.drops.length;){const drop=g.drops[i];if(Math.hypot(drop.x-g.player.x,drop.z-g.player.z)>.95){i++;continue;}
  g.drops.splice(i,1);
  if(drop.kind==='upgrade'){g.applyUpgrade(drop.upgradeId);g.events.push({kind:'skill',x:drop.x,z:drop.z,upgradeId:drop.upgradeId});continue;}
  const levelChange=g.strengthenWeapon(drop.weaponId);
  if(g.autoEquip){g.equipWeapon(drop.weaponId);continue;}
  g.pendingPickup={...drop,levelChange,slot:WEAPONS[drop.weaponId].slot};g.status='pickup';return;
 }
}

test('refactored collectDrops matches the pre-V12.1 behaviour across mixed drop layouts',()=>{
 const ids=Object.keys(WEAPONS),upgrades=['power','rate','speed','heart'];
 for(let seed=1;seed<=60;seed++){
  const rand=seeded(seed*97),autoEquip=seed%2===0;
  const a=running({autoEquip,seed}),b=running({autoEquip,seed});
  for(let i=0;i<10;i++){
   const near=rand()<.6,x=near?(rand()-.5)*1.4:(rand()-.5)*14,z=near?(rand()-.5)*1.4:(rand()-.5)*14;
   const data=rand()<.3?{kind:'upgrade',upgradeId:upgrades[Math.floor(rand()*4)],x,z}:weapon(ids[Math.floor(rand()*ids.length)],x,z);
   a.addDrop({...data});b.addDrop({...data});
  }
  // Resolve serialized pickups until nothing is pending, on both implementations.
  for(let round=0;round<12;round++){
   referenceCollect(a);b.collectDrops();
   assert.equal(snapshot(b),snapshot(a),`seed ${seed} round ${round}`);
   if(a.status==='pickup'){const replace=round%2===0;a.resolvePickup(replace);b.resolvePickup(replace);a.events.length=b.events.length=0;}
   else break;
  }
 }
});

test('tapPickup takes one drop within range through the same reward flow',()=>{
 const g=running();const near=g.addDrop(weapon('shotgun',TAP_PICKUP_RANGE-.1,0)),other=g.addDrop(weapon('burst',2,2));
 assert.equal(g.tapPickup(near.id),true);
 assert.equal(g.status,'pickup');assert.equal(g.pendingPickup.weaponId,'shotgun');assert.deepEqual(g.pendingPickup.levelChange,{before:0,after:1});
 assert.equal(g.weaponLevels.shotgun,1);assert.deepEqual(g.drops.map(d=>d.id),[other.id],'only the tapped drop is taken');
 g.resolvePickup(true);assert.equal(g.loadout.main,'shotgun');assert.equal(g.status,'running');
});

test('tapPickup honours auto-equip, skill drops and the exact range',()=>{
 const auto=running({autoEquip:true}),drop=auto.addDrop(weapon('ember',3,3));
 assert.equal(auto.tapPickup(drop.id),true);assert.equal(auto.status,'running');assert.equal(auto.loadout.main,'ember');assert.equal(auto.weaponLevels.ember,1);
 const g=running(),skill=g.addDrop({kind:'upgrade',upgradeId:'power',x:0,z:-4}),power=g.power;
 assert.equal(g.tapPickup(skill.id),true);assert.ok(g.power>power);assert.deepEqual(g.events.map(e=>e.kind),['skill']);
 const far=g.addDrop(weapon('burst',TAP_PICKUP_RANGE+.2,0));
 assert.equal(g.tapPickup(far.id),false);assert.ok(g.drops.some(d=>d.id===far.id),'out-of-range drop stays');
 assert.equal(TAP_PICKUP_RANGE,6);
});

test('tapPickup is refused outside a running game, for stale ids, and never double-awards',()=>{
 const g=running(),d=g.addDrop(weapon('shotgun',2,0));
 assert.equal(g.tapPickup(99999),false);
 for(const status of ['paused','pickup','upgrade','ended','ready']){g.status=status;assert.equal(g.tapPickup(d.id),false,status);assert.equal(g.weaponLevels.shotgun,0);}
 g.status='running';assert.equal(g.tapPickup(d.id),true);g.status='running';
 assert.equal(g.tapPickup(d.id),false,'already taken');assert.equal(g.weaponLevels.shotgun,1);
});

test('proximity pickup is unchanged and still beats nothing: a drop at 0.95 is collected, 1.0 is not',()=>{
 const g=running();g.addDrop(weapon('burst',.9,0));g.addDrop(weapon('ember',1.2,0));
 g.collectDrops();assert.equal(g.status,'pickup');assert.equal(g.pendingPickup.weaponId,'burst');assert.equal(g.drops.length,1);
});

test('tap tracker accepts short, small taps per pointer and rejects drags, holds and cancels',()=>{
 const t=ui.createTapTracker();
 t.begin(1,100,100,0,'touch');assert.deepEqual(t.end(1,104,103,120),{x:104,y:103,type:'touch'});
 t.begin(2,100,100,0,'touch');t.move(2,140,100);assert.equal(t.end(2,100,100,100),null,'moved away and back is still a drag');
 t.begin(3,100,100,0,'touch');assert.equal(t.end(3,101,100,351),null,'too slow');
 t.begin(4,100,100,0,'touch');assert.ok(t.end(4,100,100,350),'350ms is the limit');
 t.begin(5,100,100,0,'touch');t.cancel(5);assert.equal(t.end(5,100,100,10),null);
 t.begin(6,100,100,0,'mouse');assert.equal(t.end(6,108,100,50),null,'mouse tolerance is tighter');
 t.begin(7,100,100,0,'touch');assert.ok(t.end(7,110,100,50),'touch tolerance is looser');
 assert.equal(t.end(8,0,0,0),null,'unknown pointer');
});

test('tap tracker judges two fingers independently and is bounded',()=>{
 const t=ui.createTapTracker({maxPointers:3});
 t.begin(1,10,10,0);t.begin(2,200,200,5);t.move(1,300,300);
 assert.equal(t.end(1,300,300,50),null,'first finger dragged');assert.ok(t.end(2,201,200,60),'second finger still taps');
 for(let i=0;i<10;i++)t.begin(100+i,0,0,0);assert.ok(t.size<=3);t.clear();assert.equal(t.size,0);
});

function view(width,height,player={x:0,z:4}){
 const camera=createGameCamera(width,height);fitGameCamera(camera,width,height);
 const focus=cameraFocus(player,width,height),off=cameraOffset();
 camera.position.set(focus.x+off.x,focus.y+off.y,focus.z+off.z);camera.lookAt(new THREE.Vector3(focus.x,focus.y,focus.z));camera.updateMatrixWorld();
 const v=new THREE.Vector3();
 return {camera,project:(x,y,z)=>{v.set(x,y,z).project(camera);return v.z>1?null:{x:(v.x+1)/2*width,y:(1-v.y)/2*height};}};
}
const VIEWS=[[390,844,'portrait phone'],[360,640,'small portrait phone'],[844,390,'landscape phone'],[1440,900,'desktop']];

test('hit-testing covers the visible stack (ring, crystal, label) in portrait, landscape and desktop',()=>{
 for(const [w,h,name] of VIEWS){
  const {project}=view(w,h),drop={id:1,x:2,z:5};
  const ring=project(2,ui.DROP_VISUAL.ringY,5),label=project(2,ui.DROP_VISUAL.labelY,5),crystal=project(2,.7,5);
  for(const [spot,where] of [[ring,'ring'],[crystal,'crystal'],[label,'label']])
   assert.equal(ui.pickDropAt({...spot,type:'touch'},[drop],project)?.id,1,`${name}: ${where}`);
  assert.equal(ui.pickDropAt({x:ring.x+140,y:ring.y,type:'touch'},[drop],project),null,`${name}: far sideways`);
  assert.equal(ui.pickDropAt({x:label.x,y:label.y-120,type:'touch'},[drop],project),null,`${name}: far above the label`);
 }
});

test('finger-sized target never shrinks below the touch radius, and mouse is tighter',()=>{
 const {project}=view(360,640),drop={id:1,x:1,z:4};
 const ring=project(1,ui.DROP_VISUAL.ringY,4),label=project(1,ui.DROP_VISUAL.labelY,4);
 const edge=(radius)=>({x:Math.max(ring.x,label.x)+radius,y:(ring.y+label.y)/2});
 assert.ok(ui.pickDropAt({...edge(33),type:'touch'},[drop],project),'33px away still hits for touch');
 assert.equal(ui.pickDropAt({...edge(33),type:'mouse'},[drop],project),null,'33px away misses for mouse');
 assert.equal(ui.pickDropAt({...edge(60),type:'touch'},[drop],project),null);
});

test('overlapping drops resolve to the closest one; behind-camera drops are ignored',()=>{
 const {project}=view(390,844),a={id:1,x:1,z:4},b={id:2,x:1.4,z:4};
 const pa=project(1,.5,4),pb=project(1.4,.5,4);
 assert.equal(ui.pickDropAt({...pa,type:'touch'},[a,b],project).id,1);
 assert.equal(ui.pickDropAt({...pb,type:'touch'},[a,b],project).id,2);
 assert.equal(ui.pickDropAt({x:10,y:10,type:'touch'},[a],()=>null),null);
 assert.equal(ui.pickDropAt({x:10,y:10,type:'touch'},[],project),null);
});

test('remembered settings round-trip and validate every field on its own',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 assert.deepEqual(ui.readSettings(storage),ui.defaultSettings());
 assert.ok(ui.writeSettings(storage,{quality:'high',volume:.6,hero:'polar',stats:true}));
 assert.deepEqual(ui.readSettings(storage),{quality:'high',volume:.6,hero:'polar',stats:true});
 store.set(ui.SETTINGS_KEY,JSON.stringify({quality:'ultra',volume:7,hero:'dragon',stats:'yes'}));
 assert.deepEqual(ui.readSettings(storage),{quality:'balanced',volume:1,hero:'pudding',stats:false});
 store.set(ui.SETTINGS_KEY,JSON.stringify({quality:'low',volume:-3,hero:'polar'}));
 assert.deepEqual(ui.readSettings(storage),{quality:'low',volume:0,hero:'polar',stats:false},'valid fields survive invalid neighbours');
 for(const raw of ['{broken','null','42','"text"','[]'])store.set(ui.SETTINGS_KEY,raw),assert.deepEqual(ui.readSettings(storage),ui.defaultSettings(),raw);
});

test('settings storage that throws or is missing degrades to defaults without errors',()=>{
 const blocked={getItem(){throw new Error('denied')},setItem(){throw new Error('quota')}};
 assert.deepEqual(ui.readSettings(blocked),ui.defaultSettings());assert.equal(ui.writeSettings(blocked,ui.defaultSettings()),false);
 assert.deepEqual(ui.readSettings(null),ui.defaultSettings());assert.deepEqual(ui.readSettings(undefined),ui.defaultSettings());
});

test('writeSettings validates every field before storing and read-back is always valid',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const written=()=>JSON.parse(store.get(ui.SETTINGS_KEY));
 const cases=[
  [{quality:'ultra',volume:NaN,hero:'x',stats:'yes'},{quality:'balanced',volume:.25,hero:'pudding',stats:false}],
  [{quality:'high',volume:Infinity,hero:'polar',stats:true},{quality:'high',volume:.25,hero:'polar',stats:true}],
  [{quality:'low',volume:9,hero:'polar',stats:false},{quality:'low',volume:1,hero:'polar',stats:false}],
  [{quality:'low',volume:-1},{quality:'low',volume:0,hero:'pudding',stats:false}],
  [{volume:'.5',extra:'ignored'},{quality:'balanced',volume:.25,hero:'pudding',stats:false}],
  [null,ui.defaultSettings()],[undefined,ui.defaultSettings()],[42,ui.defaultSettings()],
 ];
 for(const [input,expected] of cases){
  assert.equal(ui.writeSettings(storage,input),true);assert.deepEqual(written(),expected,JSON.stringify(input));
  assert.deepEqual(ui.readSettings(storage),expected,'what was written reads back unchanged');
 }
 assert.deepEqual(Object.keys(written()).sort(),['hero','quality','stats','volume'],'no stray keys are stored');
});

test('settings survive a write → read round trip for every valid combination',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 for(const quality of ui.QUALITIES)for(const hero of ui.HEROES)for(const stats of [true,false])for(const volume of [0,.05,.25,.6,1]){
  const settings={quality,volume,hero,stats};ui.writeSettings(storage,settings);assert.deepEqual(ui.readSettings(storage),settings);
 }
 assert.deepEqual(ui.sanitizeSettings({quality:'low',volume:.5,hero:'polar',stats:true}),{quality:'low',volume:.5,hero:'polar',stats:true});
});
