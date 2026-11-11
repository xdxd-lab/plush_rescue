// Lock manifest sanity: the V11 baseline and required paths are independent of
// the mutable manifest. Approvals must form a chain from that baseline.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const V11_BASELINE=Object.freeze({
 'camera.js':'7d9e02a29448d1d863c319b0ca3193907fdb1028cd8db1b69c3df65be7cea24d',
 'characters.js':'cd2aee11aeee42cd73734446ca8d768aeb4cb263be8016778958977dd6d50000',
 'crowd.js':'616a6dbff523f30d4046ec7357960ec322d97f0ed71ddafef81d1f6faba69a5a',
 'maps.js':'f582d0240116943835003799a867283a0792e37dbb10f737fc003fc72569b6d7',
 'weapons.js':'c90d851a097646455317cb5df273914b0b2cde73b0a6c24687ef78b6df25dbef',
 'lighting.js':'65e3a24751674769fa358a1971a912c5b6d81cdb390183e88a4ec76d4b116f5f',
 'effects.js':'0fc31b61cb5a7594c25fc12ed11f17f4ca74cf7f0f7cc0ab3eba1af656d5b9a0',
});
const doc=JSON.parse(fs.readFileSync(new URL('./locked-modules.json',import.meta.url),'utf8'));

function validateManifest(manifest){
 assert.ok(Array.isArray(manifest.locked),'locked must be an array');
 const paths=new Set();
 for(const e of manifest.locked){
  assert.match(e.path,/^[a-z-]+\.js$/,e.path);
  assert.ok(Object.hasOwn(V11_BASELINE,e.path),`unknown lock ${e.path}`);
  assert.ok(!paths.has(e.path),`duplicate lock ${e.path}`);paths.add(e.path);
  assert.match(e.sha256,/^[0-9a-f]{64}$/,e.path);
  assert.ok(e.locked_since&&e.reason,e.path);
  assert.ok(Array.isArray(e.approved_changes),e.path);
  let prev=V11_BASELINE[e.path];
  for(const c of e.approved_changes){
   for(const k of ['date','approved_by','reason','old_sha256','new_sha256'])assert.ok(c[k],`${e.path}: ${k}`);
   assert.match(c.old_sha256,/^[0-9a-f]{64}$/,e.path);
   assert.match(c.new_sha256,/^[0-9a-f]{64}$/,e.path);
   assert.equal(c.old_sha256,prev,`${e.path}: approvals must chain from V11`);
   prev=c.new_sha256;
  }
  assert.equal(e.sha256,prev,`${e.path}: sha256 must match baseline or last approval`);
 }
 for(const path of Object.keys(V11_BASELINE))assert.ok(paths.has(path),`missing lock ${path}`);
}

test('locked modules and approval chains match the V11 baseline',()=>validateManifest(doc));

// Synthetic copies exercise the validator without changing the real lock or any runtime file.
const fixture=()=>structuredClone(doc);
const hash=c=>c.repeat(64);
const approval=(old_sha256,new_sha256)=>({date:'2026-01-01',approved_by:'test',reason:'test',old_sha256,new_sha256});
test('rejects a missing required lock',()=>{
 const copy=fixture();copy.locked=copy.locked.filter(e=>e.path!=='camera.js');
 assert.throws(()=>validateManifest(copy),/missing lock camera\.js/);
});
test('rejects a changed hash without an approval',()=>{
 const copy=fixture(),entry=copy.locked.find(e=>e.path==='camera.js');
 entry.approved_changes=[];entry.sha256=hash('a');
 assert.throws(()=>validateManifest(copy),/sha256 must match baseline or last approval/);
});
test('rejects an approval chain starting from the wrong baseline',()=>{
 const copy=fixture(),entry=copy.locked.find(e=>e.path==='camera.js');
 entry.approved_changes=[approval(hash('b'),hash('a'))];entry.sha256=hash('a');
 assert.throws(()=>validateManifest(copy),/approvals must chain from V11/);
});
test('accepts a complete approval chain from V11 to the current hash',()=>{
 const copy=fixture(),entry=copy.locked.find(e=>e.path==='camera.js');
 entry.approved_changes=[approval(V11_BASELINE['camera.js'],hash('a')),approval(hash('a'),hash('b'))];entry.sha256=hash('b');
 assert.doesNotThrow(()=>validateManifest(copy));
});
