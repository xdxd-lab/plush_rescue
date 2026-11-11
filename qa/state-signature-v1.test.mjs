import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../core.js';
import {signatureV1,targetedV1} from './state-signature-v1.mjs';

const goldens=JSON.parse(readFileSync(new URL('./state-signature-v1.goldens.json',import.meta.url)));
assert.equal(goldens.format,'state-v1');
assert.equal(goldens.baselineCommit,'274e5dbaf1320490df62c532b8b8322a23b31415');
for(let bits=0;bits<8;bits++)for(const autoEquip of [false,true]){
 const flags={bossAllies:!!(bits&1),upgradeVariety:!!(bits&2),enemyVariety:!!(bits&4)};
 const key=`${bits}:${autoEquip}`;
 test(`state-v1 baseline ${key}`,()=>{
  const actual=signatureV1(Game,goldens.seed,{autoEquip,...flags,steps:goldens.steps});
  assert.equal(actual.digest,goldens.cases[key].digest,`baseline state digest ${key}`);
  assert.deepEqual(actual.seen,goldens.cases[key].seen,`baseline branch counts ${key}`);
  assert.equal(actual.stepsCompleted,goldens.cases[key].stepsCompleted,`baseline completed steps ${key}`);
  assert.equal(actual.stepsCompleted,goldens.steps,`full scripted run ${key}`);
  assert.ok(actual.seen.boss>0&&actual.seen.bossHazard>0&&actual.seen.upgrade>0);
  if(flags.bossAllies)assert.ok(actual.seen.ally>0&&actual.seen.allyShot>0);
  else assert.equal(actual.seen.ally,0);
  if(flags.upgradeVariety)assert.ok(actual.seen.varietyChoice>0);
  else assert.equal(actual.seen.varietyChoice,0);
  if(flags.enemyVariety)assert.ok(actual.seen.spitter>0&&actual.seen.dasher>0&&actual.seen.spitHazard>0);
  else assert.equal(actual.seen.spitter+actual.seen.dasher+actual.seen.spitHazard,0);
  if(autoEquip)assert.equal(actual.seen.pickup,0);
  else assert.ok(actual.seen.pickup>0);
 });
}
test('state-v1 forced roles, hazard hits, dash phases and ally timers match the unformatted baseline',()=>{
 const actual=targetedV1(Game);
 assert.equal(actual.digest,goldens.targeted.digest);
 assert.deepEqual(actual.seen,goldens.targeted.seen);
 assert.ok(Object.values(actual.seen).every(Boolean),'every forced branch must be observed');
});
