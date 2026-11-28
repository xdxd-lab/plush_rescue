// Exercise the same renderer entry point as the game, not detached primitives.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {UPGRADES} from '../core.js';
import {createWeaponVisuals,DROP_GEOMETRY as D} from '../weapon-visuals.js';

const ids=UPGRADES.map(s=>s.id);
function world(){
  const scene=new T.Scene(),renderer=createWeaponVisuals(T,scene),game={player:{x:0,z:0},enemies:[],drops:[]};
  const spawn=list=>{
    game.drops=list.map((upgradeId,i)=>({id:i+1,kind:'upgrade',upgradeId,x:(i+1)*.5,z:3,life:50}));
    renderer.sync(game);
  };
  const drops=()=>scene.children[0].children.filter(o=>o.visible&&o.name.endsWith('skill pickup'));
  const pieces=drop=>{const meshes=[];drop.children[0].traverseVisible(o=>{if(o.isMesh)meshes.push(o);});return meshes;};
  return {scene,renderer,game,spawn,drops,pieces};
}
test('the eight rewards are eight original paired meshes with real thickness, UVs, named labels and a yarn/enamel colour palette',()=>{
  const {spawn,drops,pieces}=world();spawn(ids);
  const soft=new Set(),hard=new Set(),surfaces=new Set(),bump=new Set();
  assert.equal(drops().length,ids.length);
  for(const root of drops()){
    const id=root.userData.upgradeId, refs=pieces(root), shades=new Set(), bb=new T.Box3();
    assert.equal(root.name,UPGRADES.find(u=>u.id===id).name+' · skill pickup');
    assert.deepEqual(refs.map(m=>m.name),['Pickup glowing center','Skill symbol']);
    for(const [i,m] of refs.entries()){
      const g=m.geometry;g.computeBoundingBox();bb.union(g.boundingBox);(i?hard:soft).add(g);
      surfaces.add(m.material);bump.add(m.material.bumpMap);
      assert.ok(g.index?.count>0);assert.ok(g.attributes.color.normalized);
      assert.equal(g.attributes.uv.count,g.attributes.position.count);
      const rgb=g.attributes.color.array;
      for(let k=0;k<rgb.length;k+=3)shades.add((rgb[k]<<16)|(rgb[k+1]<<8)|rgb[k+2]);
    }
    assert.ok(shades.size>=6,id+' palette');
    assert.ok(bb.max.z-bb.min.z>.1,id+' is not a flat decal');
    assert.ok(bb.max.y<=D.floatTop&&bb.min.y>=D.floatBottom, id+' clears the label and marker');
    assert.ok(Math.hypot(Math.max(-bb.min.x,bb.max.x),Math.max(-bb.min.z,bb.max.z))<D.floatRadius,id+' finite original pickup radius');
  }
  assert.equal(soft.size,8);assert.equal(hard.size,8);assert.equal(surfaces.size,2);assert.equal(bump.size,1);
});
test('16 simultaneous rewards reuse both halves, and shuffling/releasing/reopening slots creates no new GPU resources after warmup',()=>{
  const {spawn,drops,pieces,renderer}=world();spawn(ids.concat(ids));
  const initial=renderer.stats, byId=new Map(), resources=['materials','geometries','textures'];
  for(const r of drops()){
    const id=r.userData.upgradeId, pair=pieces(r).map(m=>m.geometry);
    if(byId.has(id))assert.deepEqual(pair,byId.get(id));
    else byId.set(id,pair);
  }
  assert.equal(drops().length,16);assert.equal(byId.size,8);
  for(let i=0;i<4;i++){
    spawn([]);assert.equal(renderer.stats.drops,0);
    spawn([...ids.slice(i),...ids.slice(0,i)].reverse());
    for(const r of drops())assert.deepEqual(pieces(r).map(m=>m.geometry),byId.get(r.userData.upgradeId));
    for(const key of resources)assert.equal(renderer.stats[key],initial[key],key+' bounded');
  }
});
