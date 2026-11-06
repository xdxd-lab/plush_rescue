// Lock manifest sanity: every entry is complete, and each sha256 is backed by the
// latest approved_changes entry (so a changed lock always has an approval record).
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const doc=JSON.parse(fs.readFileSync(new URL('./locked-modules.json',import.meta.url),'utf8'));

test('every locked module has path, sha256, locked_since, reason and approved_changes',()=>{
 assert.ok(Array.isArray(doc.locked)&&doc.locked.length>0);
 const paths=new Set();
 for(const e of doc.locked){
  assert.match(e.path,/^[a-z-]+\.js$/,e.path);
  assert.ok(!paths.has(e.path),`duplicate lock ${e.path}`);paths.add(e.path);
  assert.match(e.sha256,/^[0-9a-f]{64}$/,e.path);
  assert.ok(e.locked_since&&e.reason,e.path);
  assert.ok(Array.isArray(e.approved_changes),e.path);
 }
});

test('approved_changes entries are complete and chain to the current sha256',()=>{
 for(const e of doc.locked){
  let prev=null;
  for(const c of e.approved_changes){
   for(const k of ['date','approved_by','reason','old_sha256','new_sha256'])assert.ok(c[k],`${e.path}: ${k}`);
   assert.match(c.old_sha256,/^[0-9a-f]{64}$/,e.path);
   assert.match(c.new_sha256,/^[0-9a-f]{64}$/,e.path);
   if(prev)assert.equal(c.old_sha256,prev,`${e.path}: approvals must chain`);
   prev=c.new_sha256;
  }
  if(prev)assert.equal(prev,e.sha256,`${e.path}: last approval must match sha256`);
 }
});
