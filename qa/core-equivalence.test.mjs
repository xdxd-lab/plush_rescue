// core.js gameplay is unchanged from V11 apart from boss allies (switchable with
// bossAllies:false), even though takeDrop()/tapPickup() were added: six scripted
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
  assert.equal(signature(Game,Number(seed),{autoEquip:auto==='true',bossAllies:false}),expected);
 });
}
// Boss allies (default on) pinned when the feature was added; the difference
// from V11 is the ally behaviour alone (see qa/boss-allies.test.mjs).
const ALLY_SIGNATURES={
 '1:false':'bb16c65f5a9927369d90481153ea41a9f7de6e3456e3ec66ec394ca0aad9d619',
 '1:true':'2bc1711ee736a923c364c53e320f200576791e6d5c03d921a97180e120b77b65',
 '2:false':'683ab25823cf777b573ecb2d4361ad4a2f78a3530eb529a816939fef523539e0',
 '2:true':'586bcf7e64f93687f1e92a33d0891bb7786ca004cc73b81cc0df9e0fa9ad255c',
 '3:false':'985e71e233137fa473324b723fa663688be24f25c85e74b8234503928459a150',
 '3:true':'b2d9af6d8c0f7ce7fb11cf317894c958d4103e8c318ac3b74a8d96ae739b50b7',
};
for(const [key,expected] of Object.entries(ALLY_SIGNATURES)){
 const [seed,auto]=key.split(':');
 test(`gameplay signature with boss allies: seed ${seed}, auto-equip ${auto}`,()=>{
  assert.equal(signature(Game,Number(seed),{autoEquip:auto==='true'}),expected);
 });
}
