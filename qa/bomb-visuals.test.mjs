// Mine visuals: no countdown digits at any size; the blast ring switches to a
// bright gold-white material for the last 30% of the fuse, and the normal ring
// keeps sharing the bomber palette. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createWeaponVisuals,BOMB_VISUAL} from '../weapon-visuals.js';

const bombGame=bombs=>({drops:[],bombs,player:{x:0,z:0},loadout:{main:'bomber',offhand:'moonfan'},weaponLevels:{},magic:{},enemies:[]});
function setup(bombs){
 const scene=new THREE.Scene(),wv=createWeaponVisuals(THREE,scene),game=bombGame(bombs),hero=new THREE.Group();
 wv.sync(game,hero);
 const find=name=>{const out=[];scene.traverse(o=>{if(o.name===name)out.push(o);});return out;};
 return {scene,wv,game,hero,find,groups:()=>find('Toy bomb with countdown and safe-distance ring')};
}
const ringOf=group=>group.children.find(c=>c.name==='Explosion radius warning');

test('a mine shows no number: no sprite on the mine and no digit textures are made',()=>{
 const drawn=[];
 const context=new Proxy({},{get:(o,k)=>k==='fillText'?t=>drawn.push(String(t)):k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const canvas=()=>({width:0,height:0,getContext:()=>context});
 const saved=globalThis.document;globalThis.document={createElement:canvas};
 try{
  const t=setup([{id:1,x:0,z:0,life:1.2,radius:2.5}]),[group]=t.groups();
  let sprites=0;group.traverse(o=>{if(o.isSprite)sprites++;});
  assert.equal(sprites,0,'nothing on the mine is a sprite');
  assert.equal(group.children.some(c=>c.name==='Shrinking fuse timer'),true,'the fuse arc stays');
  assert.equal(drawn.some(text=>/^\d$|即將綻放/.test(text)),false,`no digit label is drawn: ${drawn.join(',')}`);
 }finally{if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
});

test('the blast ring turns bright gold-white for the last 30% of the fuse only',()=>{
 const bomb={id:1,x:0,z:0,life:1.2,totalLife:1.2,radius:2.5},t=setup([bomb]),[group]=t.groups(),ring=ringOf(group),normal=ring.material;
 assert.equal(group.userData.imminent,false);
 bomb.life=1.2*.31;t.wv.sync(t.game,t.hero);
 assert.equal(group.userData.imminent,false,'31% left: not yet');assert.equal(ring.material,normal);
 bomb.life=1.2*.29;t.wv.sync(t.game,t.hero);
 assert.equal(group.userData.imminent,true,'29% left');assert.notEqual(ring.material,normal);
 assert.equal(ring.material.color.getHexString(),new THREE.Color(BOMB_VISUAL.ringColor).getHexString());
 assert.equal(ring.scale.x,2.5,'the ring keeps the exact blast radius');
 assert.equal(normal.color.getHexString(),new THREE.Color('#f6b44d').getHexString(),'the shared palette colour is not changed');
});

test('a pooled mine starts with the normal ring again, and mines at different fuse stages differ',()=>{
 const a={id:1,x:0,z:0,life:.2,totalLife:1.2,radius:2.5},b={id:2,x:6,z:0,life:1.1,totalLife:1.2,radius:2.5},t=setup([a,b]),[ga,gb]=t.groups();
 assert.equal(ga.userData.imminent,true);assert.equal(gb.userData.imminent,false);
 assert.notEqual(ringOf(ga).material,ringOf(gb).material);
 const normal=ringOf(gb).material;
 t.game.bombs=[{id:3,x:2,z:2,life:1.2,totalLife:1.2,radius:2.5}];t.wv.sync(t.game,t.hero);
 const live=t.groups().filter(g=>g.parent);assert.equal(live.length,1);assert.equal(ringOf(live[0]).material,normal,'reused slot is back to normal');
 assert.equal(t.wv.stats.bombPool,2,'the pool did not grow');
});

test('the ring change only swaps one shared material: 12 mines add no per-mine ring material',()=>{
 const bombs=Array.from({length:12},(_,i)=>({id:i+1,x:i,z:0,life:.1,totalLife:1.2,radius:2.5})),t=setup(bombs);
 assert.equal(new Set(t.groups().map(g=>ringOf(g).material)).size,1);
});
