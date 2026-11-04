// Drop label policy: within labelDistance, show only the nearest few labels
// (3 portrait, 5 landscape), none on top of the hero, none overlapping, with a
// small hysteresis. Uses the real game camera. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createWeaponVisuals,dropLabelBox,DROP_GEOMETRY as G,LABEL_FONT,LABEL_POLICY as L} from '../weapon-visuals.js';
import {createGameCamera,cameraFocus,cameraOffset} from '../camera.js';
import {makePlush} from '../characters.js';
import * as ui from '../ui.js';

const VIEWS={portrait:[390,844],small:[360,640],landscape:[844,390],desktop:[1280,720]};
function view(width,height,player={x:0,z:0}){
 const camera=createGameCamera(width,height),focus=cameraFocus(player,width,height),offset=cameraOffset();
 camera.position.set(focus.x+offset.x,focus.y+offset.y,focus.z+offset.z);camera.lookAt(focus.x,focus.y,focus.z);camera.updateMatrixWorld();
 camera.userData.viewHeight=height;
 return camera;
}
function scene(drops,camera,player={x:0,z:0}){
 const s=new THREE.Scene(),wv=createWeaponVisuals(THREE,s),hero=new THREE.Group();
 const game={drops:drops.map((d,i)=>({id:i+1,kind:'weapon',weaponId:['shotgun','burst','ember','bomber','frostwand','cannon'][i%6],life:30,...d})),bombs:[],player,loadout:{main:'pulse',offhand:'moonfan'},weaponLevels:{},magic:{},enemies:[]};
 // Like the game loop: update (camera) runs before sync.
 const frame=()=>{wv.update(0,[],game,camera,camera.userData.viewHeight);wv.sync(game,hero);};frame();
 const labels=()=>[...wv.drawnDrops()].filter(([,v])=>v.labelVisible).map(([id])=>id);
 return {wv,game,frame,labels,scene:s};
}
// Screen rectangles (CSS pixels) of the shown labels, from ui.js's hit shapes as
// the game builds them: from what drawnDrops() reports.
function labelRects(t,camera,width,height){
 const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize(),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();
 const project=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).project(camera);return {x:(v.x+1)/2*width,y:(1-v.y)/2*height,z:v.z};};
 return t.labels().map(id=>{const drop=t.game.drops.find(d=>d.id===id),s=ui.dropHitShape(drop,project,{right,up},{left:0,top:0,width,height},t.wv.drawnDrops().get(id));
  const poly=s.parts.find(p=>p.kind==='label').poly;return {id,left:Math.min(...poly.map(p=>p.x)),right:Math.max(...poly.map(p=>p.x)),top:Math.min(...poly.map(p=>p.y)),bottom:Math.max(...poly.map(p=>p.y))};});
}
// Twelve drops in a ring of radii 2–7 around the player: a crowded opening.
const crowd=()=>Array.from({length:12},(_,i)=>{const a=i*2.4,r=2+i*.42;return {x:Math.sin(a)*r,z:Math.cos(a)*r};});

test('a crowded frame shows at most 3 labels in portrait or a short window and 5 otherwise, never overlapping',()=>{
 for(const [name,[w,h]] of Object.entries(VIEWS)){
  const camera=view(w,h),t=scene(crowd(),camera),shown=t.labels(),budget=h<L.shortHeight?L.short:h>w?L.portrait:L.landscape;
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
 // Up the screen from the hero, so the label is clear of it.
 t.game.drops[0].x=-2.6;t.game.drops[0].z=-1.5;t.frame();assert.deepEqual(t.labels(),[1]);
});

test('labels keep the V11 distance limit',()=>{
 const camera=view(1280,720),t=scene([{x:0,z:8.4},{x:0,z:-8.6}],camera);
 assert.ok(!t.labels().includes(2),'beyond labelDistance');
});

// Portrait frame: drop 1 nearest (2.51), then 2 (2.83) and 3 (3.40), drop 4 farther
// (5.50). No label meets another, so each test here is only about the label choice.
const four=()=>[{x:-1.85,z:1.7},{x:.61,z:-2.76},{x:-2.95,z:-1.7},{x:0,z:5.5}];

test('a label already shown keeps its place over a slightly nearer newcomer (no flicker)',()=>{
 const camera=view(390,844),t=scene(four(),camera);
 assert.deepEqual(t.labels().sort(),[1,2,3]);
 // Drop 4 comes a little nearer than drop 3 (within the keep margin): no swap.
 const d3=Math.hypot(t.game.drops[2].x,t.game.drops[2].z),d4=t.game.drops[3];const k=(d3-L.keep/2)/Math.hypot(d4.x,d4.z);d4.x*=k;d4.z*=k;t.frame();
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
  const a={x:-3.5,z:-2.5},b={x:a.x+right.x*G.labelWidth*.6,z:a.z+right.z*G.labelWidth*.6};
  const t=scene([a,b],camera);assert.deepEqual(t.labels(),[Math.hypot(a.x,a.z)<Math.hypot(b.x,b.z)?1:2],name);
  assert.equal(t.wv.drawnDrops().size,2,`${name}: both drops are still drawn`);
 }
});

// Steps the visuals clock to the middle of a dark (sin<0) or bright (sin>0)
// beat of the 13 rad/s expiry blink, then syncs like the game loop.
function beat(t,camera,dark){
 const target=(Math.floor(t.now*13/(2*Math.PI))+1)*2*Math.PI+(dark?1.5:.5)*Math.PI;
 const dt=target/13-t.now;t.now+=dt;t.wv.update(dt,[],t.game,camera,camera.userData.viewHeight);t.wv.sync(t.game,new THREE.Group());
}

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
  const a={x:-3.5,z:-2.5},b={x:a.x+right.x*G.labelWidth*.6,z:a.z+right.z*G.labelWidth*.6};
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

// ---- on-screen size ---------------------------------------------------------------
const WINDOWS=[[390,844],[360,640],[844,390],[568,320],[1280,720]];
// The rectangle the GPU draws for a sprite, worked out from the sprite itself
// (position, scale, center) as the sprite vertex shader does, not from dropLabelBox.
function spriteRect(sprite,camera,width,height){
 const origin=new THREE.Vector3().setFromMatrixPosition(sprite.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
 const pts=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>{
  const q=new THREE.Vector3(origin.x+(u-sprite.center.x)*sprite.scale.x,origin.y+(v-sprite.center.y)*sprite.scale.y,origin.z).applyMatrix4(camera.projectionMatrix);
  return {x:(q.x+1)/2*width,y:(1-q.y)/2*height};});
 return {left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};
}
function shownSprites(t){
 t.scene.updateMatrixWorld(true);const out=new Map();
 t.scene.traverse(o=>{if(o.isSprite&&o.visible&&o.parent?.visible){const drop=t.game.drops.find(d=>d.x===o.parent.position.x&&d.z===o.parent.position.z);if(drop)out.set(drop.id,o);}});
 return out;
}

test('a shown label is at least minHeight tall on screen, near or far, in every window',()=>{
 for(const [w,h] of WINDOWS){
  const camera=view(w,h),t=scene(crowd(),camera),rects=labelRects(t,camera,w,h);assert.ok(rects.length>=1,`${w}x${h}`);
  for(const r of rects)assert.ok(r.bottom-r.top>=L.minHeight-.01,`${w}x${h} label ${r.id}: ${(r.bottom-r.top).toFixed(1)} px`);
 }
 // Perspective draws the far side smaller, so each drop gets its own scale.
 const camera=view(844,390),t=scene([{x:-6,z:-5.5}],camera),u=scene([{x:5.5,z:6}],camera);
 const far=t.wv.drawnDrops().get(1),near=u.wv.drawnDrops().get(1);
 assert.ok(far.labelVisible&&near.labelVisible);assert.ok(Math.abs(far.labelScale-near.labelScale)>.1,`scales ${far.labelScale} and ${near.labelScale}`);
});

test('the title is at least 12 px wherever the label is held at minHeight',()=>{
 assert.ok(L.minHeight*LABEL_FONT.title/LABEL_FONT.canvasHeight>=12);
});

test('a window with room keeps the world size, and reports no scale',()=>{
 const camera=view(1920,1080),t=scene([{x:5.83,z:-.1}],camera);
 assert.deepEqual([...t.wv.drawnDrops()],[[1,{labelVisible:true}]]);
});

test('the hit rectangle is exactly the drawn sprite, in every window',()=>{
 for(const [w,h] of WINDOWS){
  const camera=view(w,h),t=scene(crowd(),camera),sprites=shownSprites(t),rects=labelRects(t,camera,w,h);
  assert.ok(rects.length>=1,`${w}x${h}`);
  for(const r of rects){
   const drawn=spriteRect(sprites.get(r.id),camera,w,h);
   for(const edge of ['left','right','top','bottom'])assert.ok(Math.abs(drawn[edge]-r[edge])<.01,`${w}x${h} label ${r.id} ${edge}: drawn ${drawn[edge]}, hit ${r[edge]}`);
  }
 }
});

test('an enlarged label grows upward: its bottom edge stays put, so it does not cover the item',()=>{
 const camera=view(568,320),base=dropLabelBox(),t=scene([{x:4,z:-2}],camera),[r]=labelRects(t,camera,568,320),seen=t.wv.drawnDrops().get(1);
 assert.ok(seen.labelScale>2,`scale ${seen.labelScale}`);
 const bottom=dropLabelBox(seen.labelScale);assert.ok(Math.abs((bottom.y-bottom.halfHeight)-(base.y-base.halfHeight))<1e-9);
 const v=new THREE.Vector3(4,G.labelY,-2),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();v.addScaledVector(up,-G.labelHeight/2).project(camera);
 assert.ok(Math.abs((1-v.y)/2*320-r.bottom)<.01,'drawn bottom edge is the world-size bottom edge');
});

test('a reused pool slot does not keep the scale of its last label',()=>{
 const camera=view(568,320),t=scene([{x:4,z:-2}],camera);assert.ok(t.wv.drawnDrops().get(1).labelScale>1);
 t.wv.clear();t.wv.sync(t.game,new THREE.Group());
 const sprite=[...shownSprites(t).values()][0];
 assert.deepEqual(sprite.scale.toArray(),[G.labelWidth,G.labelHeight,1],'no camera yet: world size again');assert.deepEqual(sprite.center.toArray(),[.5,.5]);
});

test('a view height is optional: without one labels keep their world size',()=>{
 const camera=view(568,320),s=new THREE.Scene(),wv=createWeaponVisuals(THREE,s);
 const game={drops:[{id:1,kind:'weapon',weaponId:'shotgun',x:4,z:-2,life:30}],bombs:[],player:{x:0,z:0},loadout:{main:'pulse',offhand:'moonfan'},weaponLevels:{},magic:{},enemies:[]};
 wv.update(0,[],game,camera);wv.sync(game,new THREE.Group());
 assert.deepEqual([...wv.drawnDrops()],[[1,{labelVisible:true}]]);
});

test('a label overlap is judged at the enlarged size',()=>{
 // Clear of each other at world size, on top of each other at 3x on a small window.
 const camera=view(568,320),right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();
 const a={x:5,z:-3},b={x:a.x+right.x*G.labelWidth*1.4,z:a.z+right.z*G.labelWidth*1.4},t=scene([a,b],camera);
 assert.equal(t.labels().length,1);
});

// ---- small windows and the hero -----------------------------------------------------
test('a window under 480 px tall shows at most three labels; 480 px keeps five',()=>{
 const spread=()=>Array.from({length:8},(_,i)=>{const a=i/8*Math.PI*2+.3;return {x:Math.sin(a)*(4+i*.5),z:Math.cos(a)*(4+i*.5)};});
 const count=(w,h)=>scene(spread(),view(w,h)).labels().length;
 assert.equal(count(1100,480),L.landscape,'480 px tall: five');
 assert.equal(count(1100,479),L.short,'479 px tall: three');
 for(const [w,h] of [[844,390],[667,375],[568,320]])assert.ok(count(w,h)<=L.short,`${w}x${h}`);
});

// The hero's box on screen, in CSS pixels.
function heroBox(camera,w,h,p={x:0,z:0}){
 const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize(),v=new THREE.Vector3();
 const pts=[[-1,0],[1,0],[1,L.heroHeight],[-1,L.heroHeight]].map(([s,y])=>{v.set(p.x,y,p.z).addScaledVector(right,s*L.heroHalfWidth).project(camera);return {x:(v.x+1)/2*w,y:(1-v.y)/2*h};});
 return {left:Math.min(...pts.map(q=>q.x)),right:Math.max(...pts.map(q=>q.x)),top:Math.min(...pts.map(q=>q.y)),bottom:Math.max(...pts.map(q=>q.y))};
}
const covers=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const rightAxis=camera=>new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();

test('the hero box holds every hero as it is drawn, at any facing, with any weapon',()=>{
 const v=new THREE.Vector3();
 for(const heroId of ['pudding','polar'])for(const [main,twoHanded] of [['pulse',null],['bomber',null],['ember',null],['shotgun','cannon']]){
  const hero=makePlush(THREE,{hero:true,heroId});hero.scale.setScalar(1.1);
  createWeaponVisuals(THREE,new THREE.Scene()).sync({drops:[],bombs:[],player:{x:0,z:0},loadout:{main,offhand:'moonfan'},twoHanded,weaponLevels:{},magic:{},enemies:[]},hero);
  hero.updateMatrixWorld(true);let radius=0,top=0;
  hero.traverse(o=>{
   for(let q=o;q;q=q.parent)if(!q.visible)return;
   if(!o.isMesh||o.isInstancedMesh)return;const pos=o.geometry.attributes.position;
   for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);radius=Math.max(radius,Math.hypot(v.x,v.z));top=Math.max(top,v.y);}
  });
  assert.ok(radius<=L.heroHalfWidth,`${heroId}/${twoHanded||main}: radius ${radius}`);assert.ok(top<=L.heroHeight,`${heroId}/${twoHanded||main}: height ${top}`);
 }
});

test('no shown label covers the hero, wherever the drops lie, in every window',()=>{
 for(const [w,h] of [...WINDOWS,[1920,1080]]){
  const camera=view(w,h),hero=heroBox(camera,w,h);let shown=0;
  for(let i=0;i<240;i++){
   const a=i*2.399963,r=1.4+(i%24)*.3,t=scene([{x:Math.sin(a)*r,z:Math.cos(a)*r},{x:Math.sin(a+1.7)*(r+1),z:Math.cos(a+1.7)*(r+1)}],camera),rects=labelRects(t,camera,w,h);
   shown+=rects.length;for(const q of rects)assert.ok(!covers(q,hero),`${w}x${h} placement ${i}: label ${q.id}`);
  }
  assert.ok(shown>200,`${w}x${h}: labels are still shown (${shown})`);
 }
});

test('a label that meets the hero slides away, stays over its drop, and the hit area goes with it',()=>{
 for(const [w,h] of [[844,390],[568,320],[390,844]]){
  const camera=view(w,h),right=rightAxis(camera);
  for(const side of [-1,1]){
   const t=scene([{x:right.x*side*2.6,z:right.z*side*2.6}],camera),seen=t.wv.drawnDrops().get(1);
   assert.ok(seen.labelVisible,`${w}x${h} side ${side}: still labelled`);
   assert.equal(Math.sign(seen.labelShift),side,`${w}x${h} side ${side}: away from the hero (shift ${seen.labelShift})`);
   assert.ok(Math.abs(seen.labelShift)<=dropLabelBox(seen.labelScale).halfWidth+1e-9,'the label still sits over its drop');
   t.frame();assert.ok(Math.abs(t.wv.drawnDrops().get(1).labelShift-seen.labelShift)<1e-9,'a still frame keeps the label where it is');
   const [r]=labelRects(t,camera,w,h),drawn=spriteRect(shownSprites(t).get(1),camera,w,h);
   for(const edge of ['left','right','top','bottom'])assert.ok(Math.abs(drawn[edge]-r[edge])<.01,`${w}x${h} ${edge}: drawn ${drawn[edge]}, hit ${r[edge]}`);
  }
 }
});

test('a label clear of the hero does not slide',()=>{
 const camera=view(844,390),right=rightAxis(camera),t=scene([{x:right.x*7,z:right.z*7}],camera);
 assert.equal(t.wv.drawnDrops().get(1).labelShift,undefined);
});

test('a drop straight below the hero has no room to slide: the label is hidden, the drop stays drawn',()=>{
 const camera=view(844,390),t=scene([{x:1.39,z:.8}],camera),seen=t.wv.drawnDrops().get(1);
 assert.equal(seen.labelVisible,false);assert.equal(t.wv.drawnDrops().size,1);
});

test('slid labels stop overlapping each other too: both sides of the hero keep theirs',()=>{
 const camera=view(568,320),right=rightAxis(camera),t=scene([{x:-right.x*3.2,z:-right.z*3.2},{x:right.x*3.2,z:right.z*3.2}],camera);
 assert.deepEqual(t.labels().sort(),[1,2]);
});

test('a label does not flicker at the limit of its slide while the hero edges along',()=>{
 const camera=view(844,390),right=rightAxis(camera),t=scene([{x:right.x*4,z:right.z*4}],camera);
 // Walk the drop in along the right axis to the last step the label is shown.
 let d=4,last=null;for(;d>0;d-=.01){const m=t.game.drops[0];m.x=right.x*d;m.z=right.z*d;t.frame();if(!t.labels().length)break;last=d;}
 assert.ok(last,'the label went away at some point');
 // Coming back it must pass that point by more before it returns, then stay.
 const seq=[];for(let k=0;k<40;k++){const n=d+k*.01,m=t.game.drops[0];m.x=right.x*n;m.z=right.z*n;t.frame();seq.push(t.labels().length);}
 assert.ok(seq[0]===0,'still hidden at the point it left');
 assert.equal(seq.join('').replace(/0+1+/,''),'','one clean return, no flicker');
});

// qa/browser-chrome.mjs taps these spots as label ends, with the hero where a run starts.
// Node catches a spot that loses its label before the slower browser run does.
test('the spots the browser checks tap as labels keep a label in every window',()=>{
 const hero={x:0,z:4};
 for(const [w,h] of [[1280,720],[390,844],[360,640],[844,390],[568,320],[800,600]]){
  const camera=view(w,h,hero);
  for(const [dx,dz] of [[-2,-1.5],[-2.5,1],[1.8,-1.8],[-1.6,2],[2.4,-1.2]]){
   const t=scene([{x:hero.x+dx,z:hero.z+dz}],camera,hero);
   assert.equal(t.wv.drawnDrops().get(1).labelVisible,true,`${w}x${h} at ${dx},${dz}`);
  }
 }
});

test('a drop straight below the hero loses its label, so the browser checks must not tap it as one',()=>{
 const hero={x:0,z:4};
 for(const [w,h] of [[1280,720],[390,844],[844,390]]){
  const t=scene([{x:hero.x+2,z:hero.z+1.5}],view(w,h,hero),hero);
  assert.deepEqual([...t.wv.drawnDrops()],[[1,{labelVisible:false}]],`${w}x${h}`);
 }
});
