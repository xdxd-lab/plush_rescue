// core.js gameplay is unchanged from V11 apart from boss allies, upgrade variety and enemy variety (each switchable with
// bossAllies/upgradeVariety/enemyVariety:false), even though takeDrop()/tapPickup() were added: six scripted
// 6-minute sessions (three seeds, manual and auto equip, bosses, drops, serialized
// pickups, level-ups) hash to the signatures that V11's core.js (cbfa10e) produced. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../core.js';
import {signature} from './sim-signature.mjs';

const V11_SIGNATURES={
 '1:false':'57c9958d4300dd7cab3846891a17c320a8c93f32875d2f683c46bb44b063dde5',
 '1:true':'3452d18d935afdf9deb70577277ed530b5b3f07579281aac1119164d3e78025b',
 '2:false':'9e2c774ce50278f9c91c2e5cbcdad5f30f7abf2f40b50f992195407198f87b4d',
 '2:true':'6008a9f413c16e8344dd0d87371e0baa60de559788c6a3d5847b345ccd8e813e',
 '3:false':'05fd6c9315061e2c44af4f4cf2a94d7c239a7aa78e1363c207305eb509e25018',
 '3:true':'f63fac49980879f947df4f72d61673f706dddeb39dc9152896492a713b79bef4',
};
// With boss allies switched off, every other system still hashes exactly as V11.
for(const [key,expected] of Object.entries(V11_SIGNATURES)){
 const [seed,auto]=key.split(':');
 test(`gameplay signature matches V11 without boss allies: seed ${seed}, auto-equip ${auto}`,()=>{
  assert.equal(signature(Game,Number(seed),{autoEquip:auto==='true',bossAllies:false,upgradeVariety:false,enemyVariety:false}),expected);
 });
}
// Boss allies (default on), repinned in V12.4 when ALLY.duration went from 10 to
// 30 s (no other core change); the difference from V11 is the ally behaviour
// alone (see qa/boss-allies.test.mjs).
const ALLY_SIGNATURES={
 '1:false':'7c2a0e3babd69465e0a61ededb9eaffbfb8026b7e77aad21e3721ed6e5800dc3',
 '1:true':'76d563395498619900615c3a43a570856a1792645dc7c75f410774f979f463d5',
 '2:false':'21b0161b807679669594f9c1bcab3474c6420d759f05f7cb467b25cfea64d467',
 '2:true':'e93e5af007090efcbb1a08ab6577cf9aa1192b2d1001f1a4c7708c2b78be6fdf',
 '3:false':'efe7dd804f6183d056e6af391500177714f70dfeb68049c4ac7df635cdd5d88c',
 '3:true':'f1f1f711e28b8a81919e911dc5b218e3319d65792e968cb7a7bcdba1ed0bb044',
};
for(const [key,expected] of Object.entries(ALLY_SIGNATURES)){
 const [seed,auto]=key.split(':');
 test(`gameplay signature with boss allies: seed ${seed}, auto-equip ${auto}`,()=>{
  assert.equal(signature(Game,Number(seed),{autoEquip:auto==='true',upgradeVariety:false,enemyVariety:false}),expected);
 });
}
// All defaults: boss allies, upgrade variety and enemy variety on (V12.5). The
// sets above prove each new system can be switched off bit for bit; the
// upgrade-only set lives in qa/upgrade-variety.test.mjs.
const VARIETY_SIGNATURES={
 '1:false':'768cf6f02a11ca90e2bec1d9198c8d9f40de8364251a7d5638f4967407cc825f',
 '1:true':'ce77464e05a621826ad3f562a182ab50a5ebc598578e0cbad75fe35ba0560c94',
 '2:false':'65bcaaccf5bd4f51371a5684ae401a2ace558dd27fa099f5738822468910c406',
 '2:true':'42d369cde86d820e07479193288abe4286228c6cf91b33a59e9c2ca3e5b94db9',
 '3:false':'3e980895265671a0e155911c86a699457adbf2e3b1e816034eba72abff8e7242',
 '3:true':'82b60dd89d72d1d1b6d8112b518ee970a2f83fbf93275c46cf5289898f3ed4e6',
};
for(const [key,expected] of Object.entries(VARIETY_SIGNATURES)){
 const [seed,auto]=key.split(':');
 test(`gameplay signature with every default on: seed ${seed}, auto-equip ${auto}`,()=>{
  assert.equal(signature(Game,Number(seed),{autoEquip:auto==='true'}),expected);
 });
}
