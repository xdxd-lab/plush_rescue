import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {WEAPONS} from '../weapons.js';
import {groundWeaponParts,LOOT_WEAPON_MOTIFS} from '../loot-weapon-detail.js';
import {createWeaponVisuals,DROP_GEOMETRY as D} from '../weapon-visuals.js';

const motifs={
  cannon:['ring','meteor','seam'],pulse:['fabricStar','bottle','arrow'],
  shotgun:['bobbin','petal','bow'],burst:['spoke','arrow','meteor'],
  ember:['jaw','bottle','flare','petal'],bomber:['ring','pip','spoke','shortDisc'],
  moonfan:['leaf','crescent','bow'],frostwand:['lens','meteor','shortDisc']
};
const previousTotal=24910,previousWorst=6988;
const triangles=g=>(g.index?.count??g.attributes.position.count)/3;
test('ground weapons use eight different cut patterns with actual identifying geometry',()=>{
 assert.deepEqual(Object.keys(LOOT_WEAPON_MOTIFS),Object.keys(WEAPONS));
 const shapeKeys=new Set();
 for(const id of Object.keys(WEAPONS)){
   const root=groundWeaponParts(T,id),shapes=root.children.map(o=>o.name);
   for(const motif of motifs[id])assert.ok(shapes.includes(motif),`${id}: missing actual ${motif} geometry`);
   // Salt-free signature: same geometry pieces in the same arrangement but
   // recoloured doesn't count as a second design.
   shapeKeys.add(JSON.stringify(root.children.map(o=>[o.name,o.position.toArray(),o.scale.toArray(),o.quaternion.toArray()])));
 }
 assert.equal(shapeKeys.size,8);
 const twin=groundWeaponParts(T,'shotgun').children.filter(o=>o.name==='bobbin');
 assert.equal(twin.length,2);
 const bow=groundWeaponParts(T,'burst').children.filter(o=>o.name==='arrow');
 assert.equal(bow.length,3);
 const sewingHoles=groundWeaponParts(T,'bomber').children.filter(o=>o.name==='pip');
 assert.equal(sewingHoles.length,4);
});

test('all baked weapons share two draws, fit old click geometry and stay below v12.9 worst/batch budget',()=>{
 const scene=new T.Scene(),v=createWeaponVisuals(T,scene),ids=Object.keys(WEAPONS);
 const drops=ids.map((weaponId,i)=>({id:i+1,kind:'weapon',weaponId,x:i*4,z:0,life:35}));
 v.sync({drops,enemies:[],player:{x:0,z:0}});
 const p=new T.Vector3(),q=new T.Vector3(),r=new T.Vector3();
 let total=0;const catalogMats=new Set();
 const world=scene.children.find(o=>o.name.startsWith('V4 weapon pickups'));
 for(const [i,id] of ids.entries()){
   const root=world.children.find(o=>o.userData.weaponId===id),model=root.children[0].children.find(o=>o.isGroup);
   assert.ok(model);assert.equal(model.children.length,2,id);
   model.updateMatrix();let count=0;
   for(const mesh of model.children){
     catalogMats.add(mesh.material);const g=mesh.geometry,points=g.attributes.position,idx=g.index.array;
     count+=triangles(g);assert.equal(points.count,g.attributes.uv.count);
     for(let t=0;t<idx.length;t+=3){
       p.fromBufferAttribute(points,idx[t]);q.fromBufferAttribute(points,idx[t+1]);r.fromBufferAttribute(points,idx[t+2]);
       assert.ok(q.sub(p).cross(r.sub(p)).lengthSq()>1e-20,`${id}: degenerate triangles`);
     }
     for(let j=0;j<points.count;j++){
       p.fromBufferAttribute(points,j).applyMatrix4(model.matrix);
       assert.ok(Math.hypot(p.x,p.z)<=D.floatRadius,`${id}: outside pickup radius`);
       assert.ok(p.y>=D.floatBottom&&p.y<=D.floatTop,`${id}: outside pickup height`);
     }
   }
   assert.ok(count<previousWorst,`${id}: ${count} exceeds previous maximal weapon count`);
   total+=count;
 }
 assert.ok(total<previousTotal,`${total} exceeds previous whole weapon batch budget`);
 assert.equal(catalogMats.size,2);
});
