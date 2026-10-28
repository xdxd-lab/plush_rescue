// Main-weapon trails and hit feedback: bounded instanced batches, trails that
// never reach back past the muzzle, reduced motion and low quality without
// flying puffs, and a core 'hit' event that changes no gameplay.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createShotVisuals,SHOT_VISUAL as S} from '../shot-visuals.js';
import {Game,PROJECTILE} from '../core.js';
import {WEAPONS} from '../weapons.js';

function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const setup=()=>{const scene=new THREE.Scene(),v=createShotVisuals(THREE,scene);return {scene,v,batch:name=>scene.getObjectByName(name)};};
const bolt=(id,x,z,weaponId='pulse',vx=0,vz=24)=>({id,weaponId,x,y:.65,z,vx,vz});
const scaleOf=(mesh,i)=>{const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);return new THREE.Vector3().setFromMatrixScale(m);};

test('without a life, a trail grows from where the bolt was first drawn to its full length',()=>{
 const {v,batch}=setup(),trails=batch('Main weapon bolt trails');
 v.sync([bolt(1,0,0)]);assert.equal(v.stats.trails,0,'no trail on the spawn frame');assert.equal(trails.visible,false);
 v.sync([bolt(1,0,.4)]);assert.equal(v.stats.trails,1);assert.ok(Math.abs(scaleOf(trails,0).z-.4)<1e-6,'only as long as the distance flown');
 v.sync([bolt(1,0,5)]);assert.ok(Math.abs(scaleOf(trails,0).z-S.trail.pulse.length)<1e-6,'then the full length');
 v.sync([]);assert.equal(v.stats.trails,0);assert.equal(trails.visible,false);
});

test('a bolt first drawn after its first step already trails back exactly to the muzzle',()=>{
 const g=new Game({random:seeded(9),map:0});g.start();g.enemies.length=0;g.spawn=1e9;g.fire=1e9;g.player.angle=.7;
 g.fireMain();const born=g.bullets.map(b=>({id:b.id,x:b.x,z:b.z}));assert.equal(born.length,1);
 g.step(.05,{x:0,z:0});const b=g.bullets[0],flown=Math.hypot(b.x-born[0].x,b.z-born[0].z);assert.ok(flown>.5,'moved before its first draw');
 const {v,batch}=setup();v.sync(g.bullets);assert.equal(v.stats.trails,1,'trail on its very first drawn frame');
 assert.ok(Math.abs(scaleOf(batch('Main weapon bolt trails'),0).z-flown)<1e-6,'length equals the path from the muzzle');
 const old={...b,life:PROJECTILE.life-1};v.sync([old]);assert.ok(Math.abs(scaleOf(batch('Main weapon bolt trails'),0).z-S.trail.pulse.length)<1e-6,'capped at full length');
});

test('trails take the weapon colour and size; a fresh bolt id restarts from its own muzzle',()=>{
 const {v,batch}=setup(),trails=batch('Main weapon bolt trails');
 v.sync([bolt(1,0,0,'ember'),bolt(2,1,0,'cannon')]);v.sync([bolt(1,0,3,'ember'),bolt(2,1,3,'cannon')]);
 const c=new THREE.Color();trails.getColorAt(0,c);assert.equal(c.getHexString(),new THREE.Color(WEAPONS.ember.color).getHexString());
 assert.ok(Math.abs(scaleOf(trails,1).x-S.trail.cannon.width)<1e-6);
 v.sync([bolt(3,0,3)]);assert.equal(v.stats.trails,0,'new id: starts at zero length again');
});

test('a hit shows a flash and a few cotton puffs that fade out',()=>{
 const {v}=setup();v.hit({kind:'hit',weaponId:'pulse',x:1,z:2,vx:0,vz:24});v.update(0);
 assert.equal(v.stats.flashes,1);assert.equal(v.stats.puffs,S.puffsPerHit);
 v.update(S.flashLife+.01);assert.equal(v.stats.flashes,0);assert.ok(v.stats.puffs>0,'puffs outlive the flash');
 v.update(S.puffLife);assert.equal(v.stats.puffs,0);
});

test('reduced motion: a steady flash and no flying puffs; low quality: no puffs',()=>{
 const {v,batch}=setup(),flashes=batch('Main weapon hit flashes');
 v.hit({kind:'hit',weaponId:'pulse',x:0,z:0},{reduceMotion:true});v.update(0);const a=scaleOf(flashes,0).x;
 v.update(S.flashLife/2);assert.equal(scaleOf(flashes,0).x,a,'size does not change');assert.equal(v.stats.puffs,0);
 const u=setup().v;u.hit({kind:'hit',weaponId:'pulse',x:0,z:0},{quality:'low'});u.update(0);assert.equal(u.stats.flashes,1);assert.equal(u.stats.puffs,0);
});

test('capacity is fixed: a flood of hits and bolts never grows the batches',()=>{
 const {v,batch}=setup();
 for(let i=0;i<500;i++)v.hit({kind:'hit',weaponId:'shotgun',x:i%7,z:i%5});v.update(0);
 assert.equal(v.stats.flashes,S.flashes);assert.equal(v.stats.puffs,S.puffs);
 const many=Array.from({length:300},(_,i)=>bolt(i+1,i*.01,0));v.sync(many);v.sync(many.map(b=>({...b,z:3})));assert.equal(v.stats.trails,S.trails);
 for(const name of ['Main weapon bolt trails','Main weapon hit flashes','Main weapon hit cotton puffs'])assert.ok(batch(name).count<=batch(name).instanceMatrix.count,name);
 v.clear();assert.deepEqual(v.stats,{trails:0,flashes:0,puffs:0});
});

test('the core reports each bolt hit with its weapon, on the enemy surface facing the bolt',()=>{
 const g=new Game({random:seeded(5),map:0});g.start();g.drops.length=0;g.spawn=1e9;g.dropTimer=1e9;g.nextBossMinute=1e9;g.nextExp=1e9;g.invuln=1e9;g.magicFire=1e9;
 g.enemies.length=0;const e={id:++g.serial,x:g.player.x,z:g.player.z+4,hp:1e9,type:0,speed:0,angle:0};g.enemies.push(e);g.player.angle=0;
 let hits=[];for(let i=0;i<40&&!hits.length;i++){g.step(.05,{x:0,z:0});hits=g.events.filter(x=>x.kind==='hit');}
 assert.equal(hits.length,1);const h=hits[0];assert.equal(h.weaponId,'pulse');
 assert.ok(Math.abs(Math.hypot(h.x-e.x,h.z-e.z)-.38)<1e-6,'on the surface');assert.ok(h.z<e.z,'on the side the bolt came from');
});
