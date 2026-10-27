// Drop label policy: within labelDistance, show only the nearest few labels
// (3 portrait, 5 landscape), none on top of the hero, none overlapping, with a
// small hysteresis. Uses the real game camera. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createWeaponVisuals,DROP_GEOMETRY as G,LABEL_POLICY as L} from '../weapon-visuals.js';
import {createGameCamera,cameraFocus,cameraOffset} from '../camera.js';
import * as ui from '../ui.js';

const VIEWS={portrait:[390,844],small:[360,640],landscape:[844,390],desktop:[1280,720]};
function view(width,height,player={x:0,z:0}){
 const camera=createGameCamera(width,height),focus=cameraFocus(player,width,height),offset=cameraOffset();
 camera.position.set(focus.x+offset.x,focus.y+offset.y,focus.z+offset.z);camera.lookAt(focus.x,focus.y,focus.z);camera.updateMatrixWorld();
 return camera;
}
function scene(drops,camera,player={x:0,z:0}){
 const s=new THREE.Scene(),wv=createWeaponVisuals(THREE,s),hero=new THREE.Group();
 const game={drops:drops.map((d,i)=>({id:i+1,kind:'weapon',weaponId:['shotgun','burst','ember','bomber','frostwand','cannon'][i%6],life:30,...d})),bombs:[],player,loadout:{main:'pulse',offhand:'moonfan'},weaponLevels:{},magic:{},enemies:[]};
 // Like the game loop: update (camera) runs before sync.
 const frame=()=>{wv.update(0,[],game,camera);wv.sync(game,hero);};frame();
 const labels=()=>[...wv.drawnDrops()].filter(([,v])=>v.labelVisible).map(([id])=>id);
 return {wv,game,frame,labels};
}
// Screen rectangles (CSS pixels) of the shown labels, from ui.js's hit shapes.
function labelRects(t,camera,width,height){
 const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize(),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();
 const project=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).project(camera);return {x:(v.x+1)/2*width,y:(1-v.y)/2*height,z:v.z};};
 return t.labels().map(id=>{const drop=t.game.drops.find(d=>d.id===id),s=ui.dropHitShape(drop,project,{right,up},{left:0,top:0,width,height},{labelVisible:true});
  const poly=s.parts.find(p=>p.kind==='label').poly;return {id,left:Math.min(...poly.map(p=>p.x)),right:Math.max(...poly.map(p=>p.x)),top:Math.min(...poly.map(p=>p.y)),bottom:Math.max(...poly.map(p=>p.y))};});
}
// Twelve drops in a ring of radii 2–7 around the player: a crowded opening.
const crowd=()=>Array.from({length:12},(_,i)=>{const a=i*2.4,r=2+i*.42;return {x:Math.sin(a)*r,z:Math.cos(a)*r};});

test('a crowded frame shows at most 3 labels in portrait and 5 in landscape, never overlapping',()=>{
 for(const [name,[w,h]] of Object.entries(VIEWS)){
  const camera=view(w,h),t=scene(crowd(),camera),shown=t.labels(),budget=h>w?L.portrait:L.landscape;
  assert.ok(shown.length>=2&&shown.length<=budget,`${name}: ${shown.length} labels`);
  const rects=labelRects(t,camera,w,h);
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];
   assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`${name}: labels ${a.id} and ${b.id} overlap`);}
 }
});

test('the nearest drops get the labels; drops without one stay drawn',()=>{
 const camera=view(390,844),t=scene([{x:0,z:2},{x:-2.5,z:-1},{x:3,z:3},{x:-6,z:4},{x:5,z:-5}],camera);
 assert.deepEqual(t.labels().sort(),[1,2,3]);assert.equal(t.wv.drawnDrops().size,5,'every drop is still drawn');
});

test('a drop right next to the hero shows no label; the label returns as it moves away',()=>{
 const camera=view(390,844),t=scene([{x:.9,z:.4}],camera);
 assert.deepEqual(t.labels(),[]);assert.deepEqual([...t.wv.drawnDrops()],[[1,{labelVisible:false}]]);
 t.game.drops[0].x=2;t.frame();assert.deepEqual(t.labels(),[1]);
});

test('labels keep the V11 distance limit',()=>{
 const camera=view(1280,720),t=scene([{x:0,z:8.4},{x:0,z:-8.6}],camera);
 assert.ok(!t.labels().includes(2),'beyond labelDistance');
});

test('a label already shown keeps its place over a slightly nearer newcomer (no flicker)',()=>{
 const camera=view(390,844),drops=[{x:-2.2,z:1.2},{x:2.4,z:1.5},{x:0,z:-3},{x:3,z:-4.6}],t=scene(drops,camera);
 assert.deepEqual(t.labels().sort(),[1,2,3]);
 // Drop 4 comes a little nearer than drop 3 (within the keep margin): no swap.
 const d3=Math.hypot(0,-3),d4=t.game.drops[3];const k=(d3-L.keep/2)/Math.hypot(d4.x,d4.z);d4.x*=k;d4.z*=k;t.frame();
 assert.deepEqual(t.labels().sort(),[1,2,3]);
 // Clearly nearer: it takes the place.
 d4.x*=.6;d4.z*=.6;t.frame();assert.ok(t.labels().includes(4));
});

test('without a camera (first frame) the V11 distance rule applies alone',()=>{
 const s=new THREE.Scene(),wv=createWeaponVisuals(THREE,s);
 const game={drops:[{id:1,kind:'weapon',weaponId:'shotgun',x:.5,z:.5,life:30},{id:2,kind:'weapon',weaponId:'burst',x:0,z:3,life:30}],bombs:[],player:{x:0,z:0},loadout:{main:'pulse',offhand:'moonfan'},weaponLevels:{},magic:{},enemies:[]};
 wv.sync(game,new THREE.Group());assert.deepEqual([...wv.drawnDrops()].map(([,v])=>v.labelVisible),[true,true]);
});

test('of two drops whose labels would overlap on screen, only the nearer is labelled',()=>{
 for(const [name,[w,h]] of Object.entries(VIEWS)){
  // Side by side along the camera's right axis, closer than a label width.
  const camera=view(w,h),right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();
  const a={x:2.5,z:1},b={x:a.x+right.x*G.labelWidth*.6,z:a.z+right.z*G.labelWidth*.6};
  const t=scene([a,b],camera);assert.deepEqual(t.labels(),[Math.hypot(a.x,a.z)<Math.hypot(b.x,b.z)?1:2],name);
  assert.equal(t.wv.drawnDrops().size,2,`${name}: both drops are still drawn`);
 }
});

// Steps the visuals clock to the middle of a dark (sin<0) or bright (sin>0)
// beat of the 13 rad/s expiry blink, then syncs like the game loop.
function beat(t,camera,dark){
 const target=(Math.floor(t.now*13/(2*Math.PI))+1)*2*Math.PI+(dark?1.5:.5)*Math.PI;
 const dt=target/13-t.now;t.now+=dt;t.wv.update(dt,[],t.game,camera);t.wv.sync(t.game,new THREE.Group());
}
// Portrait frame: drop 1 nearest (2.51), 2 and 3 next, drop 4 farther (5.49).
const four=()=>[{x:-2.2,z:1.2},{x:2.4,z:1.5},{x:0,z:-3},{x:3,z:-4.6}];

test('a drop in the dark beat of its expiry blink neither takes a label slot nor blocks one; it competes again when bright',()=>{
 const camera=view(390,844),t=scene(four(),camera);t.now=0;t.game.drops[0].life=1.5;
 beat(t,camera,true);
 assert.equal(t.wv.drawnDrops().has(1),false,'dark beat: not drawn');
 assert.deepEqual(t.labels().sort(),[2,3,4],'the free slot goes to the next drop');
 beat(t,camera,false);
 assert.equal(t.wv.drawnDrops().has(1),true);
 assert.deepEqual(t.labels().sort(),[1,2,3],'bright again and clearly nearer: it takes its label back');
 // Overlapping pair: when the nearer one is dark, the farther one is labelled.
 for(const [name,[w,h]] of Object.entries(VIEWS)){
  const cam=view(w,h),right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0).normalize();
  const a={x:2.5,z:1},b={x:a.x+right.x*G.labelWidth*.6,z:a.z+right.z*G.labelWidth*.6};
  const near=Math.hypot(a.x,a.z)<Math.hypot(b.x,b.z)?0:1,u=scene([a,b],cam);u.now=0;u.game.drops[near].life=1.5;
  beat(u,cam,false);assert.deepEqual(u.labels(),[near+1],`${name}: bright, the nearer is labelled`);
  beat(u,cam,true);assert.deepEqual(u.labels(),[2-near],`${name}: dark, the farther is labelled`);
 }
});

test('a newly allocated pool slot starts without the shown-label bonus',()=>{
 const camera=view(390,844),t=scene(four(),camera);
 assert.deepEqual(t.labels().sort(),[1,2,3]);
 // Drop 1 walks out of label range (keeps its slot); a new drop needs a fresh
 // slot, a little farther than drop 4 (within the keep margin).
 t.game.drops[0].x=-9;t.game.drops[0].z=0;
 t.game.drops.push({id:5,kind:'weapon',weaponId:'cannon',x:-4,z:-4,life:30});t.frame();
 assert.equal(t.wv.stats.dropPool,5,'a fresh slot was made');
 assert.deepEqual(t.labels().sort(),[2,3,4],'the nearer drop 4 wins, not the newcomer');
});

test('a reused pool slot does not pass its label bonus to the next drop',()=>{
 const camera=view(390,844),t=scene(four(),camera);
 assert.deepEqual(t.labels().sort(),[1,2,3]);
 // Drop 1 (labelled) is picked up and a new drop takes its slot in the same frame.
 t.game.drops.shift();t.game.drops.push({id:5,kind:'weapon',weaponId:'cannon',x:-4,z:-4,life:30});t.frame();
 assert.equal(t.wv.stats.dropPool,4,'the freed slot was reused');
 assert.deepEqual(t.labels().sort(),[2,3,4],'the nearer drop 4 wins, not the newcomer');
});
