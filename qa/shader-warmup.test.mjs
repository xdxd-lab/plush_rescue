// shader-warmup.js: the staged game holds one of everything the presentation
// draws, is the same every time and never touches Math.random. The DOM smoke
// checks that main.js stages it for one compile and restores the real game.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWarmupGame,warmupCoverage,WARMUP_EVENTS,finishWarmup} from '../shader-warmup.js';
import {WEAPONS,MAIN_WEAPONS} from '../weapons.js';
import {UPGRADES} from '../core.js';

test('the staged game covers every boss, helper, species, role, warning, drop, bolt look and effect event',()=>{
 for(const map of [0,1,2]){
  const c=warmupCoverage(createWarmupGame({map,heroId:map===1?'polar':'pudding'}));
  assert.deepEqual(c.events,[...WARMUP_EVENTS],`map ${map}: effect events`);
  assert.deepEqual(c.bosses,['big','mini']);assert.ok(c.allies>=1);
  assert.deepEqual(c.rescuedTypes,[0,1,2,3]);assert.deepEqual(c.roles,['dasher','spitter']);
  assert.deepEqual(c.hazards,{warning:true,active:true,spit:true});
  assert.deepEqual(c.drops,[...Object.keys(WEAPONS),'skill:'+UPGRADES[0].id].sort());
  assert.deepEqual(c.bolts,[...MAIN_WEAPONS.filter(id=>id!=='bomber'),'cannon'].sort());
  assert.ok(c.bombs>=1);assert.equal(c.burning,true);
 }
});

test('staging is deterministic and draws no Math.random numbers',()=>{
 const original=Math.random;let calls=0;Math.random=()=>{calls++;return original();};
 try{
  const a=createWarmupGame({map:2}),b=createWarmupGame({map:2});
  assert.equal(calls,0);
  const shape=g=>JSON.stringify([g.enemies.map(e=>[e.id,e.type,e.boss,e.role,+e.x.toFixed(6),+e.z.toFixed(6)]),g.drops.map(d=>[d.weaponId||d.upgradeId,+d.x.toFixed(6)]),g.events.map(e=>e.kind),g.hazards.length,g.bullets.length]);
  assert.equal(shape(a),shape(b));
 }finally{Math.random=original;}
});

test('the hero muzzle and map are taken from the real game; the staged game stays put',()=>{
 const g=createWarmupGame({map:1,heroId:'polar',muzzleOffset:{x:.1,y:.7,z:.5}});
 assert.equal(g.map,1);assert.equal(g.heroId,'polar');assert.deepEqual(g.muzzleOffset,{x:.1,y:.7,z:.5});
 assert.ok(g.spawn>1e8&&g.nextBossMinute>1e8&&g.nextExp>1e8,'nothing more spawns or levels up');
});


test('async warmup catches uniform query failures and compile rejections',async()=>{
 const warmup={runs:1,ready:false,error:null};
 const renderer={shadowMap:{enabled:true},info:{programs:[{getUniforms(){throw new Error('uniform failed');}}]}};
 await finishWarmup(Promise.resolve(),{warmup,renderer,run:1,shadows:true,t0:performance.now()});
 assert.equal(warmup.error,'uniform failed');assert.equal(warmup.ready,false);
 warmup.error=null;
 await finishWarmup(Promise.reject(new Error('compile failed')),{warmup,renderer,run:1,shadows:true,t0:performance.now()});
 assert.equal(warmup.error,'compile failed');assert.equal(warmup.ready,false);
});

test('older or different-shadow completions do not query programs or alter the current run',async()=>{
 let resolveOld,queries=0;const old=new Promise(resolve=>{resolveOld=resolve;});
 const warmup={runs:1,ready:false,error:null};
 const renderer={shadowMap:{enabled:true},info:{programs:[{getUniforms(){queries++;}}]}};
 const pending=finishWarmup(old,{warmup,renderer,run:1,shadows:true,t0:performance.now()});
 warmup.runs=2;renderer.shadowMap.enabled=false;
 await finishWarmup(Promise.resolve(),{warmup,renderer,run:2,shadows:false,t0:performance.now()});
 assert.equal(warmup.ready,true);assert.equal(queries,1);
 resolveOld();await pending;assert.equal(warmup.ready,true);assert.equal(warmup.error,null);assert.equal(queries,1);
 warmup.runs=3;warmup.ready=false;renderer.shadowMap.enabled=true;
 await finishWarmup(Promise.reject(new Error('stale')),{warmup,renderer,run:3,shadows:false,t0:performance.now()});
 assert.equal(warmup.ready,false);assert.equal(warmup.error,null);
});
