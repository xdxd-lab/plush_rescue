// core.js gameplay is unchanged from V11 even though takeDrop()/tapPickup() were
// added: six scripted 6-minute sessions (three seeds, manual and auto equip,
// bosses, drops, serialized pickups, level-ups) hash to the signatures that
// V11's core.js (cbfa10e) produced. Run: node --test qa/*.test.mjs
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
for(const [key,expected] of Object.entries(V11_SIGNATURES)){
 const [seed,auto]=key.split(':');
 test(`gameplay signature matches V11: seed ${seed}, auto-equip ${auto}`,()=>{
  assert.equal(signature(Game,Number(seed),{autoEquip:auto==='true'}),expected);
 });
}
