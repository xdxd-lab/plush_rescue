// V12.1/V12.1.1: tap-to-pick, tap detection, projected hit area and remembered settings.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {Game} from '../core.js';
import {createWeaponVisuals,DROP_GEOMETRY} from '../weapon-visuals.js';
import {WEAPONS} from '../weapons.js';
import {createGameCamera,fitGameCamera,cameraFocus,cameraOffset,CAMERA} from '../camera.js';
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

test('tapPickup takes one drop at any distance through the same reward flow',()=>{
 const g=running();const far=g.addDrop(weapon('shotgun',18,-9)),other=g.addDrop(weapon('burst',2,2));
 assert.equal(g.tapPickup(far.id),true,'V12.1.1: no world-unit limit; the screen decides what can be tapped');
 assert.equal(g.status,'pickup');assert.equal(g.pendingPickup.weaponId,'shotgun');assert.deepEqual(g.pendingPickup.levelChange,{before:0,after:1});
 assert.equal(g.weaponLevels.shotgun,1);assert.deepEqual(g.drops.map(d=>d.id),[other.id],'only the tapped drop is taken');
 g.resolvePickup(true);assert.equal(g.loadout.main,'shotgun');assert.equal(g.status,'running');
});

test('tapPickup honours auto-equip and skill drops, and never takes an expired drop',()=>{
 const auto=running({autoEquip:true}),drop=auto.addDrop(weapon('ember',3,3));
 assert.equal(auto.tapPickup(drop.id),true);assert.equal(auto.status,'running');assert.equal(auto.loadout.main,'ember');assert.equal(auto.weaponLevels.ember,1);
 const g=running(),skill=g.addDrop({kind:'upgrade',upgradeId:'power',x:0,z:-4}),power=g.power;
 assert.equal(g.tapPickup(skill.id),true);assert.ok(g.power>power);assert.deepEqual(g.events.map(e=>e.kind),['skill']);
 for(const life of [0,-.1,NaN]){const d=g.addDrop(weapon('burst',2,0));d.life=life;assert.equal(g.tapPickup(d.id),false,String(life));assert.equal(g.weaponLevels.burst,0);}
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

test('tap tracker: fingers keep 12 px / 350 ms, the mouse gets 10 px / 700 ms; real drags never tap',()=>{
 const t=ui.createTapTracker();
 assert.deepEqual(ui.TAP_LIMITS,{touchMove:12,touchMs:350,mouseMove:10,mouseMs:700});
 t.begin(1,100,100,0,'touch');assert.deepEqual(t.end(1,104,103,120),{x:104,y:103,type:'touch'});
 t.begin(2,100,100,0,'touch');t.move(2,140,100);assert.equal(t.end(2,100,100,100),null,'moved away and back is still a drag');
 t.begin(3,100,100,0,'touch');assert.equal(t.end(3,101,100,351),null,'finger too slow');
 t.begin(4,100,100,0,'touch');assert.ok(t.end(4,100,100,350),'350ms is the finger limit');
 t.begin(5,100,100,0,'touch');t.cancel(5);assert.equal(t.end(5,100,100,10),null);
 t.begin(6,100,100,0,'mouse');assert.ok(t.end(6,108,100,50),'8 px of mouse jitter is still a click');
 t.begin(7,100,100,0,'mouse');assert.equal(t.end(7,111,100,50),null,'11 px is a drag');
 t.begin(8,100,100,0,'mouse');t.move(8,103,104);t.move(8,106,102);assert.ok(t.end(8,104,101,600),'a slow 600 ms click with small wobble taps');
 t.begin(9,100,100,0,'mouse');assert.ok(t.end(9,100,100,700),'700ms is the mouse limit');
 t.begin(10,100,100,0,'mouse');assert.equal(t.end(10,100,100,701),null,'a mouse hold is not a tap');
 t.begin(11,100,100,0,'mouse');t.move(11,130,100);assert.equal(t.end(11,100,100,90),null,'a mouse that travelled is a drag');
 t.begin(12,100,100,0,'touch');assert.ok(t.end(12,110,100,50),'touch tolerance is looser');
 assert.equal(t.end(99,0,0,0),null,'unknown pointer');
});

test('tap timing prefers the event timeStamp, so a busy frame cannot make a quick click slow',()=>{
 let clock=1000;const now=()=>clock;
 assert.equal(ui.eventTime({timeStamp:250.5},now),250.5);
 for(const bad of [{},{timeStamp:0},{timeStamp:NaN},{timeStamp:'5'},null])assert.equal(ui.eventTime(bad,now),1000,JSON.stringify(bad));
 // Pressed at 100 ms, released at 300 ms, but the handlers ran 500 ms later.
 const t=ui.createTapTracker();
 t.begin(1,0,0,ui.eventTime({timeStamp:100},now),'mouse');clock=1800;
 assert.ok(t.end(1,0,0,ui.eventTime({timeStamp:300},now)),'judged on input time');
});

test('tap tracker judges two fingers independently and is bounded',()=>{
 const t=ui.createTapTracker({maxPointers:3});
 t.begin(1,10,10,0);t.begin(2,200,200,5);t.move(1,300,300);
 assert.equal(t.end(1,300,300,50),null,'first finger dragged');assert.ok(t.end(2,201,200,60),'second finger still taps');
 for(let i=0;i<10;i++)t.begin(100+i,0,0,0);assert.ok(t.size<=3);t.clear();assert.equal(t.size,0);
});

// ---- hit area -----------------------------------------------------------------------
const G=DROP_GEOMETRY;
function view(width,height,player={x:0,z:4}){
 const camera=createGameCamera(width,height);fitGameCamera(camera,width,height);
 const focus=cameraFocus(player,width,height),off=cameraOffset();
 camera.position.set(focus.x+off.x,focus.y+off.y,focus.z+off.z);camera.lookAt(new THREE.Vector3(focus.x,focus.y,focus.z));camera.updateMatrixWorld();
 const v=new THREE.Vector3(),viewport={left:0,top:0,width,height};
 const axes={right:new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize(),up:new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize()};
 const project=(x,y,z)=>{v.set(x,y,z).project(camera);return v.z>1||v.z<-1?null:{x:(v.x+1)/2*width,y:(1-v.y)/2*height,z:v.z};};
 const shape=(drop,labelVisible=true)=>ui.dropHitShape(drop,project,axes,viewport,{labelVisible});
 // A world point on the label plane, offset along the camera right/up axes.
 const onLabel=(drop,sx,sy)=>project(drop.x+axes.right.x*sx+axes.up.x*sy,G.labelY+axes.right.y*sx+axes.up.y*sy,drop.z+axes.right.z*sx+axes.up.z*sy);
 return {camera,project,axes,viewport,shape,onLabel};
}
const VIEWS=[[390,844,'portrait phone'],[360,640,'small portrait phone'],[844,390,'landscape phone'],[1440,900,'desktop']];
const tap=(p,type='touch')=>({x:p.x,y:p.y,type});

test('DROP_GEOMETRY bounds cover every real pickup model, and only just',()=>{
 const scene=new THREE.Scene(),wv=createWeaponVisuals(THREE,scene),ids=Object.keys(WEAPONS),skills=['power','rate','speed','heart'];
 const drops=[...ids.map((w,i)=>({id:i+1,kind:'weapon',weaponId:w,x:i*10,z:0,life:30})),...skills.map((u,i)=>({id:50+i,kind:'upgrade',upgradeId:u,x:i*10,z:40,life:30}))];
 wv.sync({drops,bombs:[],player:{x:0,z:0},loadout:{main:'pulse',offhand:'moonfan'},weaponLevels:{},magic:{},enemies:[]},new THREE.Group());
 const groups=[];scene.traverse(o=>{if(o.isGroup&&/pickup$/.test(o.name))groups.push(o);});
 assert.equal(groups.length,drops.length);
 const v=new THREE.Vector3(),seen={r:0,lo:Infinity,hi:-Infinity,ring:0};
 for(const group of groups){
  const float=group.children.find(c=>c.isGroup);float.position.y=0;float.rotation.set(0,0,0);group.updateMatrixWorld(true);
  const inv=group.matrixWorld.clone().invert();
  float.traverse(o=>{
   for(let q=o;q&&q!==float;q=q.parent)if(!q.visible)return;
   if(!o.isMesh)return;const pos=o.geometry.attributes.position;
   for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);seen.r=Math.max(seen.r,Math.hypot(v.x,v.z));seen.lo=Math.min(seen.lo,v.y);seen.hi=Math.max(seen.hi,v.y);}
  });
  const ring=group.children.find(c=>c.name==='Pickup ground marker'),pos=ring.geometry.attributes.position;
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(ring.matrixWorld).applyMatrix4(inv);seen.ring=Math.max(seen.ring,Math.hypot(v.x,v.z));}
 }
 assert.ok(seen.r<=G.floatRadius&&seen.r>G.floatRadius-.03,`item radius ${seen.r}`);
 assert.ok(seen.lo>=G.floatBottom&&seen.lo<G.floatBottom+.03,`item bottom ${seen.lo}`);
 assert.ok(seen.hi<=G.floatTop&&seen.hi>G.floatTop-.03,`item top ${seen.hi}`);
 assert.ok(seen.ring<=G.ringRadius&&seen.ring>G.ringRadius-.03,`ring radius ${seen.ring}`);
});

test('ring, floating item and the whole label rectangle (both ends) are tappable in every framing',()=>{
 for(const [w,h,name] of VIEWS){
  const V=view(w,h),drop={id:1,x:2,z:5},s=V.shape(drop);
  const spots={ring:V.project(2+G.ringRadius*.8,G.ringY,5),item:V.project(2,G.floatY,5),label:V.onLabel(drop,0,0),
   labelLeft:V.onLabel(drop,-G.labelWidth/2*.97,0),labelRight:V.onLabel(drop,G.labelWidth/2*.97,0),
   labelTopLeft:V.onLabel(drop,-G.labelWidth/2*.95,G.labelHeight/2*.9),labelBottomRight:V.onLabel(drop,G.labelWidth/2*.95,-G.labelHeight/2*.9)};
  for(const [where,p] of Object.entries(spots))for(const type of ['touch','mouse'])assert.equal(ui.pickDropAt(tap(p,type),[s])?.id,1,`${name}: ${where} (${type})`);
  // Just past the label's right end: the pointer margin decides, mouse tighter than touch.
  const end=V.onLabel(drop,G.labelWidth/2,0),dir=Math.sign(V.onLabel(drop,1,0).x-V.onLabel(drop,0,0).x);
  assert.ok(ui.pickDropAt({x:end.x+dir*(ui.TAP_MARGIN.touch-2),y:end.y,type:'touch'},[s]),`${name}: touch margin`);
  assert.equal(ui.pickDropAt({x:end.x+dir*(ui.TAP_MARGIN.mouse+3),y:end.y,type:'mouse'},[s]),null,`${name}: mouse margin`);
  assert.equal(ui.pickDropAt({x:end.x+dir*(ui.TAP_MARGIN.touch+3),y:end.y,type:'touch'},[s]),null,`${name}: touch margin`);
  const top=Math.min(...s.parts.flatMap(part=>part.poly.map(q=>q.y))),centre=V.onLabel(drop,0,0);
  assert.equal(ui.pickDropAt({x:centre.x,y:top-(ui.TAP_MARGIN.touch+4),type:'touch'},[s]),null,`${name}: above the whole stack`);
  // The swept item cylinder may reach a little above the label (its far side), never more than 0.25 units.
  const unit=Math.abs(V.onLabel(drop,0,1).y-centre.y);
  assert.ok(top>=V.onLabel(drop,0,G.labelHeight/2).y-.25*unit,`${name}: the hit area does not grow far above the label`);
 }
});

test('a hidden label (beyond 8.5 units) is not a target; ring and item still are',()=>{
 const V=view(390,844),drop={id:4,x:-3,z:-3},s=V.shape(drop,false);
 for(const sx of [-1,1])assert.equal(ui.pickDropAt(tap(V.onLabel(drop,sx*G.labelWidth/2*.96,0),'mouse'),[s]),null,'label end');
 assert.equal(ui.pickDropAt(tap(V.onLabel(drop,G.labelWidth/2*.96,0),'mouse'),[V.shape(drop,true)])?.id,4,'same spot hits when the label is shown');
 assert.equal(ui.pickDropAt(tap(V.project(-3,G.floatY,-3)),[s])?.id,4);
 assert.equal(ui.pickDropAt(tap(V.project(-3,G.ringY,-3)),[s])?.id,4);
});

test('only drops on screen produce a hit area; behind-camera drops never do',()=>{
 const V=view(390,844);
 assert.ok(V.shape({id:1,x:0,z:4}),'centre of the screen');
 assert.equal(V.shape({id:2,x:60,z:4}),null,'far off to the side');
 assert.equal(V.shape({id:3,x:0,z:-80}),null,'beyond the top edge');
 assert.equal(ui.dropHitShape({id:4,x:0,z:4},()=>null,V.axes,V.viewport),null,'behind the camera');
 // A drop fully past the bottom edge: its margin may reach the screen, but none of
 // it is drawn there, so a tap at the very edge must not take it.
 let z=4;while(V.shape({id:5,x:0,z}))z+=.05;const off={id:5,x:0,z};
 assert.equal(ui.pickDropAt({x:195,y:843,type:'touch'},[V.shape(off)]),null);
});

test('a drop whose centres are all off screen but one corner is drawn on screen is tappable (portrait edges)',()=>{
 for(const [w,h] of [[390,844],[360,640]]){
  const V=view(w,h),inside=p=>p&&p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h;
  const R={x:V.axes.right.x,z:V.axes.right.z},U=Math.hypot(V.axes.up.x,V.axes.up.z),F={x:V.axes.up.x/U,z:V.axes.up.z/U};
  for(const [edge,dir] of [['right',R],['left',{x:-R.x,z:-R.z}],['top',F],['bottom',{x:-F.x,z:-F.z}]]){
   let corner=null,last=null;
   for(let k=0;k<8000;k++){
    const drop={id:1,x:dir.x*k*.01,z:4+dir.z*k*.01},shape=V.shape(drop);
    if(!shape){last=drop;break;}
    const centres=[V.project(drop.x,G.ringY,drop.z),V.project(drop.x,G.floatY,drop.z),V.onLabel(drop,0,0)];
    if(!corner&&!centres.some(inside))corner={drop,shape};
   }
   assert.ok(corner,`${w}x${h} ${edge}: some position has every centre off screen yet part of the drop on screen`);
   assert.ok(last,`${w}x${h} ${edge}: the drop eventually leaves the screen`);
   // A pixel inside the viewport that lies exactly on the drawn part is a hit.
   const pts=corner.shape.parts.flatMap(part=>part.poly),x0=Math.max(0,Math.min(...pts.map(q=>q.x))),x1=Math.min(w,Math.max(...pts.map(q=>q.x))),y0=Math.max(0,Math.min(...pts.map(q=>q.y))),y1=Math.min(h,Math.max(...pts.map(q=>q.y)));
   let hit=null;
   for(let y=y0;y<=y1&&!hit;y+=.5)for(let x=x0;x<=x1&&!hit;x+=.5){const q={x,y,type:'touch'};if(ui.pickDropAt(q,[corner.shape],{margin:0}))hit=q;}
   assert.ok(hit,`${w}x${h} ${edge}: the visible corner can be tapped`);
   assert.equal(ui.pickDropAt(hit,[corner.shape])?.id,1);
   assert.equal(V.shape(last),null,`${w}x${h} ${edge}: fully off screen`);
  }
 }
});

test('shape and viewport intersect by vertex, by covering a corner, or by crossing edges',()=>{
 const r={left:0,top:0,width:100,height:100},P=pts=>pts.map(([x,y])=>({x,y}));
 assert.ok(ui.polygonMeetsRect(P([[90,90],[140,90],[140,140]]),r),'one vertex inside');
 assert.ok(ui.polygonMeetsRect(P([[-50,-50],[200,-50],[200,200],[-50,200]]),r),'covers the whole viewport, no vertex inside');
 assert.ok(ui.polygonMeetsRect(P([[-10,49],[110,49],[110,51],[-10,51]]),r),'thin strip crosses it, no vertex or corner inside');
 assert.ok(ui.polygonMeetsRect(P([[-30,20],[20,-30],[25,-25],[-25,25]]),r),'diagonal sliver clips the top-left corner');
 assert.equal(ui.polygonMeetsRect(P([[110,10],[150,10],[150,50]]),r),false,'beside it');
 assert.equal(ui.polygonMeetsRect(P([[-30,20],[20,-30],[10,-40],[-40,10]]),r),false,'near the corner but outside');
});

test('a part cut by the far plane keeps its drawn points and stays tappable',()=>{
 const V=view(390,844),drop={id:3,x:1,z:4};
 // Pretend everything beyond z<4 (the far half of the drop) lies past the far plane.
 const cut=(x,y,z)=>z<drop.z-1e-9?null:V.project(x,y,z),s=ui.dropHitShape(drop,cut,V.axes,V.viewport,{labelVisible:false});
 assert.ok(s,'still on screen');assert.deepEqual(s.parts.map(p=>p.kind),['ring','item']);
 const near=V.project(drop.x,G.ringY,drop.z+G.ringRadius*.8);assert.equal(ui.pickDropAt(tap(near),[s],{margin:0})?.id,3,'the drawn near half of the ring');
 assert.equal(ui.dropHitShape(drop,()=>null,V.axes,V.viewport),null,'nothing drawn, nothing to tap');
});

test('overlaps are resolved, never dropped: exact hit, then front-most, then closest, then stable id',()=>{
 const V=view(390,844);
 // Two labels overlapping on screen: the front one (nearer the camera) wins.
 // front sits 1.2 units further toward the camera, so the two labels overlap on screen.
 const back={id:1,x:0,z:2},front={id:2,x:back.x+Math.sin(CAMERA.azimuth)*1.2,z:back.z+Math.cos(CAMERA.azimuth)*1.2},sb=V.shape(back),sf=V.shape(front);
 const cb=V.onLabel(back,0,0),cf=V.onLabel(front,0,0);let both=null;
 for(let i=0;i<=20&&!both;i++){const q={x:cb.x+(cf.x-cb.x)*i/20,y:cb.y+(cf.y-cb.y)*i/20,type:'touch'};if(ui.pickDropAt(q,[sb],{margin:0})&&ui.pickDropAt(q,[sf],{margin:0}))both=q;}
 assert.ok(both,'a point exactly on both labels exists');
 assert.equal(ui.pickDropAt(both,[sb,sf]).id,2,'front-most wins');assert.equal(ui.pickDropAt(both,[sf,sb]).id,2,'order of input does not matter');
 // An exact hit on one beats a near miss on another, even if the other is in front.
 let edge=null;
 for(let y=0;y<844&&!edge;y+=2)for(let x=0;x<390&&!edge;x+=2){const q={x,y,type:'touch'};if(ui.pickDropAt(q,[sb],{margin:0})&&!ui.pickDropAt(q,[sf],{margin:0})&&ui.pickDropAt(q,[sf]))edge=q;}
 assert.ok(edge,'a point exactly on the back drop and just outside the front one');
 assert.equal(ui.pickDropAt(edge,[sb,sf]).id,1);assert.equal(ui.pickDropAt(edge,[sf,sb]).id,1);
 // Between two near misses the closer one wins.
 const a={id:7,x:-3,z:6},b={id:8,x:3,z:6},sa=V.shape(a,false),sb2=V.shape(b,false),ra=V.project(-3,G.ringY,6),rb=V.project(3,G.ringY,6);
 const away=Math.hypot(ra.x-rb.x,ra.y-rb.y),nearA={x:ra.x+(ra.x-rb.x)/away*60,y:ra.y+(ra.y-rb.y)/away*60,type:'touch'};
 assert.equal(ui.pickDropAt(nearA,[sa,sb2],{margin:400}).id,7);assert.equal(ui.pickDropAt(nearA,[sb2,sa],{margin:400}).id,7);
 assert.equal(ui.pickDropAt(nearA,[sa,sb2]),null,'with the normal margin a clear miss stays a miss');
 // Identical shapes tie on everything: the stable id decides, in either order.
 const twinA={id:11,x:1,z:4},twinB={id:10,x:1,z:4},p=V.project(1,G.floatY,4);
 assert.equal(ui.pickDropAt(tap(p),[V.shape(twinA),V.shape(twinB)]).id,10);assert.equal(ui.pickDropAt(tap(p),[V.shape(twinB),V.shape(twinA)]).id,10);
 assert.equal(ui.pickDropAt({x:5,y:5,type:'touch'},[]),null);assert.equal(ui.pickDropAt({x:5,y:5,type:'touch'},[null]),null);
});

test('opaque HUD panels cover the world; hidden panels and an idle notice do not',()=>{
 const el=(rect,extra={})=>({getBoundingClientRect:()=>rect,classList:{contains:c=>(extra.classes||[]).includes(c)},...extra});
 const panel=el({left:10,top:10,right:110,bottom:60,width:100,height:50}),hidden=el({left:0,top:0,right:0,bottom:0,width:0,height:0});
 assert.equal(ui.pointCovered({x:50,y:30},[panel]),true);assert.equal(ui.pointCovered({x:150,y:30},[panel]),false);
 assert.equal(ui.pointCovered({x:0,y:0},[hidden]),false);
 const notice=el({left:0,top:0,right:300,bottom:300,width:300,height:300},{id:'notice'});
 assert.equal(ui.pointCovered({x:50,y:50},[notice]),false,'idle notice is transparent');
 const shown=el({left:0,top:0,right:300,bottom:300,width:300,height:300},{id:'notice',classes:['show']});
 assert.equal(ui.pointCovered({x:50,y:50},[shown]),true);
 for(const s of ['.portrait','.health','.timer','.rescues','#bossPanel','#notice','.experience','.weapon-card','#twoHandedBar','#stats'])assert.ok(ui.HUD_OCCLUDERS.split(',').includes(s),s);
});

test('remembered settings round-trip and validate every field on its own',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 assert.deepEqual(ui.readSettings(storage),ui.defaultSettings());
 assert.ok(ui.writeSettings(storage,{quality:'high',volume:.6,hero:'polar',stats:true}));
 assert.deepEqual(ui.readSettings(storage),{quality:'high',volume:.6,hero:'polar',stats:true,autoChoose:false});
 store.set(ui.SETTINGS_KEY,JSON.stringify({quality:'ultra',volume:7,hero:'dragon',stats:'yes'}));
 assert.deepEqual(ui.readSettings(storage),{quality:'balanced',volume:1,hero:'pudding',stats:false,autoChoose:false});
 store.set(ui.SETTINGS_KEY,JSON.stringify({quality:'low',volume:-3,hero:'polar'}));
 assert.deepEqual(ui.readSettings(storage),{quality:'low',volume:0,hero:'polar',stats:false,autoChoose:false},'valid fields survive invalid neighbours');
 store.set(ui.SETTINGS_KEY,JSON.stringify({autoChoose:true}));assert.equal(ui.readSettings(storage).autoChoose,true);
 store.set(ui.SETTINGS_KEY,JSON.stringify({autoChoose:'yes'}));assert.equal(ui.readSettings(storage).autoChoose,false);
 for(const raw of ['{broken','null','42','"text"','[]'])store.set(ui.SETTINGS_KEY,raw),assert.deepEqual(ui.readSettings(storage),ui.defaultSettings(),raw);
});

test('automatic choice recommendations are deterministic and preserve upgraded equipment',()=>{
 const upgrades=[{id:'power'},{id:'rate'},{id:'speed'},{id:'heart'}];
 const g=running();g.status='upgrade';
 assert.equal(ui.recommendUpgrade(g,upgrades),'power','full health prefers reliable damage');
 g.player.hp=2;assert.equal(ui.recommendUpgrade(g,upgrades),'heart','critical health prioritizes recovery');
 const pickup={slot:'main',weaponId:'shotgun'};g.status='running';
 g.weaponLevels.shotgun=2;assert.equal(ui.recommendPickup(g,pickup),true,'higher-level pickup replaces a lower-level main weapon');
 g.weaponLevels.pulse=4;assert.equal(ui.recommendPickup(g,pickup),false,'lower-level pickup keeps current main weapon');
 assert.equal(ui.recommendPickup(g,{...pickup,slot:'twohand'}),false,'two-handed pickup stays a deliberate manual decision');
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
  [{quality:'ultra',volume:NaN,hero:'x',stats:'yes'},{quality:'balanced',volume:.25,hero:'pudding',stats:false,autoChoose:false}],
  [{quality:'high',volume:Infinity,hero:'polar',stats:true},{quality:'high',volume:.25,hero:'polar',stats:true,autoChoose:false}],
  [{quality:'low',volume:9,hero:'polar',stats:false},{quality:'low',volume:1,hero:'polar',stats:false,autoChoose:false}],
  [{quality:'low',volume:-1},{quality:'low',volume:0,hero:'pudding',stats:false,autoChoose:false}],
  [{volume:'.5',extra:'ignored'},{quality:'balanced',volume:.25,hero:'pudding',stats:false,autoChoose:false}],
  [null,ui.defaultSettings()],[undefined,ui.defaultSettings()],[42,ui.defaultSettings()],
 ];
 for(const [input,expected] of cases){
  assert.equal(ui.writeSettings(storage,input),true);assert.deepEqual(written(),expected,JSON.stringify(input));
  assert.deepEqual(ui.readSettings(storage),expected,'what was written reads back unchanged');
 }
 assert.deepEqual(Object.keys(written()).sort(),['autoChoose','hero','quality','stats','volume'],'no stray keys are stored');
});

test('settings survive a write → read round trip for every valid combination',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 for(const quality of ui.QUALITIES)for(const hero of ui.HEROES)for(const stats of [true,false])for(const autoChoose of [true,false])for(const volume of [0,.05,.25,.6,1]){
  const settings={quality,volume,hero,stats,autoChoose};ui.writeSettings(storage,settings);assert.deepEqual(ui.readSettings(storage),settings);
 }
 assert.deepEqual(ui.sanitizeSettings({quality:'low',volume:.5,hero:'polar',stats:true,autoChoose:true}),{quality:'low',volume:.5,hero:'polar',stats:true,autoChoose:true});
});
