// World-item art geometry budget. Labels, ground markers and held weapons are separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {UPGRADES} from '../core.js';
import {WEAPONS} from '../weapons.js';
import {createWeaponVisuals} from '../weapon-visuals.js';

function setup(){
  const scene=new T.Scene(),v=createWeaponVisuals(T,scene),game={drops:[],enemies:[],player:{x:0,z:0}};
  const add=(item,i)=>({id:i+1,x:2+i,z:2,life:30,...(WEAPONS[item]?{kind:'weapon',weaponId:item}:{kind:'upgrade',upgradeId:item})});
  const set=items=>{game.drops=items.map(add);v.sync(game);};
  const roots=()=>scene.children[0].children.filter(o=>o.name.endsWith('pickup'));
  return {set,v,roots};
}
const tris=g=>(g.index?.count??g.attributes.position.count)/3;
test('16 actual drops have genuine high-detail non-degenerate geometry; each rigid toy takes at most two draws',()=>{
 const {set,roots}=setup(),ids=[...Object.keys(WEAPONS),...UPGRADES.map(u=>u.id)];set(ids);
 let total=0,markers=0;const glyphs=new Set(),p=new T.Vector3(),q=new T.Vector3(),r=new T.Vector3();
 for(const group of roots()){
   const id=group.userData.weaponId||group.userData.upgradeId;let meshes=0,count=0;
   group.children[0].traverseVisible(mesh=>{
     if(!mesh.isMesh)return;
     const g=mesh.geometry, attr=g.attributes.position,indices=g.index?.array;
     for(let j=0;j<tris(g)*3;j+=3){
       p.fromBufferAttribute(attr,indices?indices[j]:j);q.fromBufferAttribute(attr,indices?indices[j+1]:j+1);r.fromBufferAttribute(attr,indices?indices[j+2]:j+2);
       assert.ok(q.sub(p).cross(r.sub(p)).lengthSq()>1e-20,`${id} contains a degenerate triangle`);
     }
     meshes++; count+=tris(g);
   });
   assert.equal(meshes,2,id);assert.ok(count>350 && count<7000,`${id}: ${count}`);total+=count;
   markers+=tris(group.getObjectByName('Pickup ground marker').geometry);
   if(!WEAPONS[id])glyphs.add(group.getObjectByName('Skill symbol').geometry);
 }
 assert.equal(glyphs.size,8);assert.equal(roots().length,16);
 assert.ok(total<=40000,`${total} triangles exceeds the 16-item art budget`);assert.equal(markers,3520*8);
});
test('copies of a dropped weapon share baked geometry; switching kind does not leak old pieces or affect held toys',()=>{
 const {set,v,roots}=setup();set(['cannon','cannon']);
 function visible(root){const meshes=[];root.children[0].traverseVisible(o=>{if(o.isMesh)meshes.push(o)});return meshes;}
 const first=visible(roots()[0]),second=visible(roots()[1]);assert.deepEqual(first.map(m=>m.geometry.uuid),second.map(m=>m.geometry.uuid));
 const relief=first[0].material.bumpMap;
 assert.equal(relief.image.width,512);assert.equal(relief.image.height,512);assert.equal(relief.image.data.length,512*512);assert.equal(relief.format,T.RedFormat);
 assert.ok(relief.image.data.some(h=>h>180));assert.ok(relief.image.data.some(h=>h<122),'actual stitch relief, not a blank upsample');
 assert.equal(first[1].material.bumpMap,relief,'one tile for both physical finishes');
 for(const mesh of first)assert.equal(mesh.geometry.attributes.uv.count,mesh.geometry.attributes.position.count);
 const preGuard=v.stats.geometries;
 set(['guard','cannon']);assert.deepEqual(visible(roots()[0]).map(m=>m.name),['Pickup glowing center','Skill symbol']);assert.equal(visible(roots()[0])[0].material.bumpMap,relief);
 const count=v.stats.geometries;assert.equal(count,preGuard+2,'one cached geometry pair per reward');
 assert.equal(visible(roots()[0])[1].material.bumpMap,relief);
 set(['cannon','cannon']);assert.equal(v.stats.geometries,count);assert.equal(visible(roots()[0])[0],first[0],'slot handles reused');
 v.clear();assert.equal(v.stats.drops,0);set(['cannon']);assert.equal(v.stats.geometries,count);
});
