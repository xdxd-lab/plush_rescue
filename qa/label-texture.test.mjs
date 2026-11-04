// Drop label texture: larger text within the same 384x112 canvas, no "walk near
// to pick up" subtitle (tap and hover also pick up), and text that fits without
// the canvas squeezing it. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createWeaponVisuals,LABEL_FONT} from '../weapon-visuals.js';

// A fake 2D canvas that records what is drawn. Widths use 1em per full-width
// character, an upper bound for the CJK text on the labels.
function drawLabels(){
 const calls=[],sizes=[];let font='';
 const context=new Proxy({},{get:(o,k)=>k==='fillText'?(text,x,y,max)=>calls.push({text:String(text),x,y,max,font}):k in o?o[k]:()=>{},set:(o,k,v)=>{if(k==='font')font=v;o[k]=v;return true;}});
 const saved=globalThis.document;
 globalThis.document={createElement:()=>{const c={width:0,height:0,getContext:()=>context};sizes.push(c);return c;}};
 try{createWeaponVisuals(THREE,new THREE.Scene());}finally{if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
 return {calls,sizes};
}

test('labels keep the 384x112 canvas and use the larger text',()=>{
 const {calls,sizes}=drawLabels();
 assert.ok(sizes.length>=12,'every catalog label has a canvas');
 for(const c of sizes)assert.deepEqual([c.width,c.height],[384,LABEL_FONT.canvasHeight]);
 assert.ok(calls.every(c=>c.font===`bold ${LABEL_FONT.title}px sans-serif`||c.font===`bold ${LABEL_FONT.subtitle}px sans-serif`),'only the two sizes');
 assert.ok(calls.some(c=>c.font.includes(`${LABEL_FONT.title}px`)));assert.ok(calls.some(c=>c.font.includes(`${LABEL_FONT.subtitle}px`)));
});

test('no label says "walk near": tap and hover pick up too',()=>{
 const {calls}=drawLabels();
 assert.equal(calls.some(c=>c.text.includes('靠近')),false,calls.map(c=>c.text).join(' | '));
 assert.ok(calls.some(c=>c.text==='主武器'));assert.ok(calls.some(c=>c.text==='副手魔法'));
 assert.ok(calls.some(c=>c.text==='雙手魔能砲'));assert.ok(calls.some(c=>c.text==='技能強化'));
});

test('every line fits the canvas without being squeezed, and lines stay inside the frame',()=>{
 const {calls}=drawLabels();
 for(const c of calls){
  const size=Number(c.font.match(/(\d+)px/)[1]);
  assert.ok([...c.text].length*size<=c.max,`${c.text}: ${[...c.text].length} characters at ${size}px`);
  assert.ok(c.y-size/2>=3&&c.y+size/2<=109,`${c.text}: inside the frame at y ${c.y}`);
 }
});

test('labels are not fogged, so a dark map cannot dim them',()=>{
 const scene=new THREE.Scene(),wv=createWeaponVisuals(THREE,scene);
 wv.sync({drops:[{id:1,kind:'weapon',weaponId:'shotgun',x:0,z:0,life:30}],bombs:[],player:{x:5,z:5},loadout:{main:'pulse',offhand:'moonfan'},weaponLevels:{},magic:{},enemies:[]},new THREE.Group());
 let label=null;scene.traverse(o=>{if(o.isSprite)label=o;});
 assert.equal(label.material.fog,false);
});
