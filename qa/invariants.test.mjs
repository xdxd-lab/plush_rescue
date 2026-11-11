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

// Locked modules (V11 cbfa10e): camera, model, crowd, lighting, effects, map and weapon
// data. Their SHA-256 lives in qa/locked-modules.json; changing one needs user approval
// and a registered approved_changes entry (see qa/README.md, qa/approve-lock-change.py).
const LOCKS=JSON.parse(read('qa/locked-modules.json','utf8')).locked;
const lockMessage=file=>`${file} 此檔被鎖定；若要修改，需經使用者核准，並在 approved_changes 登記後更新 sha256（見 qa/locked-modules.json、qa/README.md）`;
test('camera, model, crowd, lighting, effects, map and weapon modules are unchanged from V11',()=>{
 assert.ok(LOCKS.length>0,'qa/locked-modules.json lists no locked modules');
 for(const lock of LOCKS)assert.equal(sha(lock.path),lock.sha256,lockMessage(lock.path));
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
 const main=read('main.js','utf8'),input=read('input-controller.js','utf8'),hud=read('hud.js','utf8');
 for(const marker of [
  "document.addEventListener('pointerdown'",
  "isInteractiveTarget(e.target)",
  "try{canvas.setPointerCapture(e.pointerId);}catch{stick.reset();",
  "(e.pointerType==='mouse'&&(e.buttons&1)===0)",
  "if(type==='lostpointercapture'&&e.target!==canvas)return;",
  "bossVisualScale(e,o.mesh.userData.radius)",
 ])assert.ok((main+input).includes(marker),marker);
 // The HUD (V10 diff writes, hero portrait, hint footer row) moved from main.js to hud.js.
 for(const marker of [
  "function hudWrite(el,key,value,apply)",
  "footer",
  "'assets/'+game.heroId+'-portrait.png'",
 ])assert.ok(main.includes(marker)||hud.includes(marker),marker);
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
