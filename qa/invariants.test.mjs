// V12 invariants: gameplay, camera, models and crowd modules are byte-identical
// to V11; V8/V10/V11 behaviour markers remain; the runtime manifest matches
// disk; the P2 warning polish reuses existing meshes/materials.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {createBossVisuals} from '../boss-visuals.js';
const root=new URL('../',import.meta.url);
const read=(path,enc)=>fs.readFileSync(new URL(path,root),enc);
const sha=path=>crypto.createHash('sha256').update(read(path)).digest('hex');

// SHA-256 from the V11 runtime-manifest (cbfa10e). Any change here is a gameplay,
// camera, model, crowd, lighting or effects change and is outside V12's scope.
const V11_UNCHANGED={
 'core.js':'8460ab92928f03d62de9e8057811ad02bd2a9dcd44023610e02c541d2fabfe76',
 'camera.js':'7d9e02a29448d1d863c319b0ca3193907fdb1028cd8db1b69c3df65be7cea24d',
 'characters.js':'cd2aee11aeee42cd73734446ca8d768aeb4cb263be8016778958977dd6d50000',
 'crowd.js':'616a6dbff523f30d4046ec7357960ec322d97f0ed71ddafef81d1f6faba69a5a',
 'maps.js':'f582d0240116943835003799a867283a0792e37dbb10f737fc003fc72569b6d7',
 'weapons.js':'c90d851a097646455317cb5df273914b0b2cde73b0a6c24687ef78b6df25dbef',
 'weapon-visuals.js':'e27a995be4d031827f660f340f95d1c094debfc1f86312e13a662d881317b445',
 'lighting.js':'65e3a24751674769fa358a1971a912c5b6d81cdb390183e88a4ec76d4b116f5f',
 'effects.js':'0fc31b61cb5a7594c25fc12ed11f17f4ca74cf7f0f7cc0ab3eba1af656d5b9a0',
};
test('gameplay, camera, model, crowd, lighting and effects modules are unchanged from V11',()=>{
 for(const [file,hash] of Object.entries(V11_UNCHANGED))assert.equal(sha(file),hash,file);
});

test('V8 fullscreen drag, V10 HUD diff writes and V11 rescued-boss scale remain in main.js',()=>{
 const main=read('main.js','utf8');
 for(const marker of [
  "document.addEventListener('pointerdown'",
  "isInteractiveTarget(e.target)",
  "try{canvas.setPointerCapture(e.pointerId);}catch{stick.reset();",
  "(e.pointerType==='mouse'&&(e.buttons&1)===0)",
  "if(type==='lostpointercapture'&&e.target!==canvas)return;",
  "function hudWrite(el,key,value,apply)",
  "bossVisualScale(e,o.mesh.userData.radius)",
  "footer",
  "'assets/'+game.heroId+'-portrait.png'",
 ])assert.ok(main.includes(marker),marker);
 // Hurt blinking is unchanged unless the player asks for reduced motion.
 assert.match(main,/hero\.visible=game\.invuln===0\|\|reduceMotion\(\)\|\|Math\.floor\(game\.time\*12\)%2===0;/);
});

test('runtime manifest matches every file on disk and lists the new ui.js module',()=>{
 const manifest=JSON.parse(read('runtime-manifest.json','utf8'));
 assert.equal(manifest.version,'12.0.0');assert.equal(manifest.revision,'v12-commercial-ui-r1');
 const paths=manifest.files.map(f=>f.path);
 assert.ok(paths.includes('ui.js'));assert.ok(!paths.some(p=>p.startsWith('qa/')),'qa/ is not a runtime file');
 for(const f of manifest.files){const data=read(f.path);assert.equal(data.length,f.bytes,f.path);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),f.sha256,f.path);}
 const info=JSON.parse(read('build-info.json','utf8'));assert.equal(info.version,'12.0.0');assert.equal(info.revision,'v12-commercial-ui-r1');
});

test('hero portraits are compact square RGBA PNGs at the same paths',()=>{
 for(const hero of ['pudding','polar']){
  const png=read(`assets/${hero}-portrait.png`);
  assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);assert.equal(png[25],6,'RGBA colour type');
  assert.ok(png.length<200_000,`${hero} portrait ${png.length} bytes`);
 }
});

test('P2 warning polish: last 20% of a windup shows the strike colour, using pooled meshes only',()=>{
 const scene=new THREE.Scene(),visuals=createBossVisuals(THREE,scene),hazard={id:1,x:0,z:0,radius:2,age:0,windup:1.2,duration:.55,ownerId:1},game={time:0,enemies:[],hazards:[hazard]};
 visuals.sync(game);const baseline={...visuals.stats};
 const warning=scene.getObjectByName('Grounded boss attack warning'),edge=warning.getObjectByName('Exact attack-radius boundary'),emblem=warning.getObjectByName('Stitched warning star');
 hazard.age=.6;visuals.sync(game);assert.equal(warning.userData.imminent,false);assert.equal(edge.material.color.getHex(),0xffdb8f);const midScale=emblem.scale.x;
 hazard.age=1.0;visuals.sync(game);assert.equal(warning.userData.imminent,true);assert.equal(edge.material.color.getHex(),0xff817a);assert.ok(emblem.scale.x>midScale);
 hazard.age=1.3;visuals.sync(game);assert.equal(warning.userData.active,true);assert.equal(warning.userData.imminent,false);
 for(const key of ['bossPool','hazardPool','geometries','materials'])assert.equal(visuals.stats[key],baseline[key],key);
});
