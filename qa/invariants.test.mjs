// V12 invariants: gameplay, camera, models and crowd modules are byte-identical
// to V11 (weapon-visuals.js: same drawn result since V12.1.1); V8/V10/V11
// behaviour markers remain; the runtime manifest matches disk; the P2 warning
// polish reuses existing meshes/materials.
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

// SHA-256 from the runtime-manifest as of v11.0.0 (cbfa10e). Any change here is a gameplay,
// camera, model, crowd, lighting or effects change and is outside V12's scope.
const V11_UNCHANGED={
 'camera.js':'7d9e02a29448d1d863c319b0ca3193907fdb1028cd8db1b69c3df65be7cea24d',
 'characters.js':'cd2aee11aeee42cd73734446ca8d768aeb4cb263be8016778958977dd6d50000',
 'crowd.js':'616a6dbff523f30d4046ec7357960ec322d97f0ed71ddafef81d1f6faba69a5a',
 'maps.js':'f582d0240116943835003799a867283a0792e37dbb10f737fc003fc72569b6d7',
 'weapons.js':'c90d851a097646455317cb5df273914b0b2cde73b0a6c24687ef78b6df25dbef',
 'lighting.js':'65e3a24751674769fa358a1971a912c5b6d81cdb390183e88a4ec76d4b116f5f',
 'effects.js':'0fc31b61cb5a7594c25fc12ed11f17f4ca74cf7f0f7cc0ab3eba1af656d5b9a0',
};
test('camera, model, crowd, lighting, effects and weapon modules are unchanged from V11',()=>{
 for(const [file,hash] of Object.entries(V11_UNCHANGED))assert.equal(sha(file),hash,file);
});

// V12.1.1 changed weapon-visuals.js on purpose: drop sizes moved into the shared
// DROP_GEOMETRY constant and a read-only drawnDrops() view was added. The drawn
// result must stay exactly the V11 one (V11 sha e27a995b…).
test('weapon-visuals.js draws drops exactly as V11 did, now from DROP_GEOMETRY',async()=>{
 const {createWeaponVisuals,DROP_GEOMETRY:G}=await import('../weapon-visuals.js');
 assert.deepEqual({ringY:G.ringY,ringScale:G.ringScale,floatY:G.floatY,floatBob:G.floatBob,labelY:G.labelY,labelWidth:G.labelWidth,labelHeight:G.labelHeight,labelDistance:G.labelDistance},
  {ringY:.09,ringScale:.54,floatY:.70,floatBob:.09,labelY:1.48,labelWidth:2.5,labelHeight:.73,labelDistance:8.5});
 const scene=new THREE.Scene(),wv=createWeaponVisuals(THREE,scene),hero=new THREE.Group();
 const game={drops:[{id:1,kind:'weapon',weaponId:'shotgun',x:0,z:8.4,life:30},{id:2,kind:'weapon',weaponId:'burst',x:0,z:8.6,life:30}],bombs:[],player:{x:0,z:0},loadout:{main:'pulse',offhand:'moonfan'},weaponLevels:{},magic:{},enemies:[]};
 wv.sync(game,hero);wv.update(0,[],game,null);
 const groups=[];scene.traverse(o=>{if(o.isGroup&&/pickup$/.test(o.name))groups.push(o);});
 assert.equal(groups.length,2);
 for(const g of groups){
  const ring=g.children.find(c=>c.name==='Pickup ground marker'),label=g.children.find(c=>c.isSprite),float=g.children.find(c=>c.isGroup);
  assert.deepEqual(ring.position.toArray(),[0,.09,0]);assert.deepEqual(ring.scale.toArray(),[.54,.54,.54]);
  assert.deepEqual(label.position.toArray(),[0,1.48,0]);assert.deepEqual(label.scale.toArray(),[2.5,.73,1]);
  assert.ok(Math.abs(float.position.y-.70)<=.09+1e-9);
 }
 assert.deepEqual([...wv.drawnDrops()],[[1,{labelVisible:true}],[2,{labelVisible:false}]],'label shows under 8.5 units only, as in V11');
 wv.clear();assert.equal(wv.drawnDrops().size,0,'nothing is reported once cleared');
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

// build-info.json is the single source of the release version; nothing in qa/ repeats it.
const BUILD=JSON.parse(read('build-info.json','utf8'));
test('build-info.json version is the one release identifier everywhere',()=>{
 assert.match(BUILD.version,/^\d+\.\d+\.\d+$/,'version is semver');
 assert.ok(BUILD.revision.startsWith(`v${BUILD.version}-`),`revision ${BUILD.revision} starts with v${BUILD.version}-`);
 assert.ok(read('main.js','utf8').includes(`revision:'${BUILD.revision}'`),'main.js __PLUSH_QA__.revision');
 assert.ok(read('index.html','utf8').includes(`data-build="${BUILD.revision}"`),'index.html #game data-build');
});

test('runtime manifest matches every file on disk and lists the new ui.js module',()=>{
 const manifest=JSON.parse(read('runtime-manifest.json','utf8'));
 assert.equal(manifest.version,BUILD.version);assert.equal(manifest.revision,BUILD.revision);
 assert.equal(manifest.source_commit,BUILD.source_commit);
 const paths=manifest.files.map(f=>f.path);
 assert.ok(paths.includes('ui.js'));assert.ok(!paths.some(p=>p.startsWith('qa/')),'qa/ is not a runtime file');
 for(const f of manifest.files){const data=read(f.path);assert.equal(data.length,f.bytes,f.path);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),f.sha256,f.path);}
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
