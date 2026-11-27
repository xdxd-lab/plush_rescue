// Verify the true raster dimensions, CJK text fit and the GPU budget separately
// from the world-space hit rectangle (qa/label-policy.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {UPGRADES} from '../core.js';
import {WEAPONS} from '../weapons.js';
import {lootLabels,LABEL_MASTER} from '../loot-art.js';
import {createWeaponVisuals,LABEL_FONT} from '../weapon-visuals.js';

function fixture(run){
 const calls=[],sizes=[],saved=globalThis.document;
 let font='';
 const ctx={set font(v){font=v;},fillRect(){},fillText(text,x,y,max){calls.push({text,x,y,max,font});},getImageData(_,__,w,h){
   const data=new Uint8ClampedArray(w*h*4);data[0]=64;data[(h-1)*w*4]=192;return {data};
 }};
 globalThis.document={createElement:()=>{const c={getContext:()=>ctx};sizes.push(c);return c;}};
 try{return run({calls,sizes});}finally{if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
}
const drops=[...Object.keys(WEAPONS).map(weaponId=>({kind:'weapon',weaponId})),...UPGRADES.map(({id:upgradeId})=>({kind:'upgrade',upgradeId}))];
test('all weapon/skill labels draw true 1536×448 text without a proximity-only subtitle, a squeezed line, or an overflow',()=>fixture(({calls,sizes})=>{
 const s=new THREE.Scene(),v=createWeaponVisuals(THREE,s),cam=new THREE.PerspectiveCamera(45,1,.1,100);
 cam.position.set(0,6,9);cam.lookAt(0,0,0);cam.updateMatrixWorld();
 assert.equal(sizes.length,0,'no catalog-wide raster at boot');
 v.update(0,[],null,cam,720);
 for(const [i,drop] of drops.entries()){
   const game={drops:[{...drop,id:i+1,x:2,z:0,life:30}],player:{x:0,z:0},enemies:[]};v.sync(game);
   const label=s.getObjectByName('Pickup label');
   assert.ok(label.visible);assert.equal(label.material.fog,false);
   const tex=label.material.map;
   assert.equal(tex.image.width,384*4);assert.equal(tex.image.height,112*4);
   assert.equal(tex.format,THREE.RedFormat);assert.equal(tex.image.data.length,1536*448);
   assert.equal(tex.image.data[0],192);assert.equal(tex.image.data[(448-1)*1536],64,'top row is not upside down');
   assert.ok(tex.generateMipmaps);assert.ok(v.stats.textures<=10);
 }
 assert.equal(sizes.length,1,'only one reusable scratch canvas');
 assert.equal(calls.length,drops.length*2);
 for(const {text,x,y,font,max} of calls){
   const size=Number(font.match(/(\d+)px/)[1]);assert.ok(size===LABEL_FONT.title||size===LABEL_FONT.subtitle);
   assert.ok([...text].length*size<=max,`${text}: CJK width`);assert.equal(x,768);
   assert.ok(y-size/2>=12&&y+size/2<=LABEL_MASTER.height-12,`${text}: within frame`);
   assert.ok(!text.includes('靠近'));
 }
 for(const w of Object.values(WEAPONS))assert.ok(calls.some(c=>c.text.includes(w.name)));
 for(const u of UPGRADES)assert.ok(calls.some(c=>c.text.includes(u.name)));
 for(const sub of ['主武器','副手魔法','雙手魔能砲','技能強化'])assert.ok(calls.some(c=>c.text===sub));
}));
test('visible names share their texture and stale material/texture pairs are disposed together',()=>fixture(()=>{
 const labels=lootLabels(THREE,m=>m),get=i=>labels.get('key:'+i,'壹','貳','#fff');
 const first=get(0);assert.equal(get(0),first);
 let disposed=0;first.map.addEventListener('dispose',()=>disposed++);first.addEventListener('dispose',()=>disposed++);
 for(let i=1;i<=8;i++)get(i);
 assert.equal(labels.size,8);assert.equal(disposed,2);assert.notEqual(get(0),first);
}));
test('privacy-restricted pixel readback keeps a readable compact label and is not retried per key',()=>{
 const saved=globalThis.document,lines=[];let reads=0;
 const ctx={fillRect(){},fillText(text){lines.push(text);},getImageData(){reads++;throw Error('pixel readback blocked');},scale(x,y){assert.equal(x,.25);assert.equal(y,.25);}};
 globalThis.document={createElement:()=>({getContext:()=>ctx})};
 try{
   const labels=lootLabels(THREE,m=>m);
   for(const name of ['救援','冰霜']){
     const mat=labels.get(name,name,'技能強化','#fff');assert.notEqual(mat,labels.fallback);
     assert.equal(mat.map.isCanvasTexture,true);assert.deepEqual([mat.map.image.width,mat.map.image.height],[384,112]);assert.ok(lines.includes(name));
   }
   assert.equal(reads,1);
 }finally{if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
});
