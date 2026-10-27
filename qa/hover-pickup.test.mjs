// V12.2.1: timing and reset rules of the mouse hover pickup tracker.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHoverTracker,HOVER_LIMITS} from '../ui.js';

const hit=(t,dtMs,id=1,moved=false)=>t.update({hitId:id,dtMs,moved});
// Enter drop 1 with the mouse moving (armed), then feed frames.
function entered(){const t=createHoverTracker();hit(t,16,1,true);return t;}

test('limits: 0.5 s hold, slow frames count in full, a stall of 1000 ms resets, no edge grace, long dark-beat holds expire',()=>{
 assert.deepEqual({...HOVER_LIMITS},{holdMs:500,stallMs:1000,maxHoldMs:600});
});

test('499 ms does not pick and 500 ms does, counted from the first frame on the drop',()=>{
 const a=entered();assert.equal(hit(a,250).fire,null);assert.equal(hit(a,249).fire,null);
 const b=entered();hit(b,250);assert.equal(hit(b,250).fire,1);
 const c=entered();for(let i=0;i<49;i++)assert.equal(hit(c,10).fire,null);assert.equal(hit(c,10).fire,1,'50 x 10 ms');
 const d=entered();for(let i=0;i<49;i++)hit(d,10);assert.equal(hit(d,9).fire,null,'499 ms in 50 frames');
});

test('the entering frame itself adds no time, and progress rises to 1 only at the pick',()=>{
 const t=createHoverTracker();assert.equal(hit(t,200,1,true).progress,0);
 assert.equal(hit(t,100).progress,.2);assert.equal(hit(t,150).progress,.5);assert.equal(hit(t,249).progress,.998);
 const s=hit(t,10);assert.equal(s.fire,1);assert.equal(s.progress,0);
});

test('armed is reported from the entering frame on, so feedback does not wait for counted time',()=>{
 const t=createHoverTracker();
 const enter=hit(t,16,1,true);assert.equal(enter.armed,true);assert.equal(enter.progress,0);assert.equal(enter.id,1);
 const u=createHoverTracker();assert.equal(hit(u,16,1,false).armed,false,'a drop under a resting cursor shows nothing');
 assert.equal(hit(u,16,1,true).armed,true,'a later move arms it');
 assert.equal(u.update({hitId:null,dtMs:16}).armed,false);
 const v=entered();hit(v,250);assert.equal(v.update({hitId:null,hiddenId:1,dtMs:16}).armed,true,'a dark-beat hold keeps showing it');
 assert.equal(hit(v,1000).armed,false,'a stalled frame resets');
});

test('a drop that appears under a resting cursor never starts; moving over it does',()=>{
 const t=createHoverTracker();
 for(let i=0;i<20;i++)assert.equal(hit(t,100,1,false).fire,null);
 assert.equal(hit(t,100,1,true).fire,null,'the move arms it');
 hit(t,250);assert.equal(hit(t,250).fire,1,'500 ms after arming');
});

test('the move that arms a hover can come after the entering frame',()=>{
 const t=createHoverTracker();hit(t,16,1,false);hit(t,250);hit(t,250);
 assert.equal(hit(t,100,1,true).progress,0,'armed now, counting from here');
 hit(t,250);assert.equal(hit(t,250).fire,1);
});

test('slow frames count in full: 267, 400 and 999 ms frames reach 0.5 s',()=>{
 const a=entered();assert.equal(hit(a,267).fire,null);assert.equal(hit(a,267).fire,1,'two 267 ms frames');
 const b=entered();assert.equal(hit(b,400).fire,null);assert.equal(hit(b,400).fire,1,'400 + 400 ms');
 const c=entered();assert.equal(hit(c,200).progress,.4);assert.equal(hit(c,200).progress,.8);assert.equal(hit(c,200).fire,1);
 const d=entered();assert.equal(hit(d,999).fire,1,'a single 999 ms frame is still a frame, not a stall');
 const e=entered();hit(e,267);assert.equal(hit(e,232).fire,null,'499 ms');assert.equal(hit(e,1).fire,1,'500 ms');
});

test('a stall resets the hover: 999 ms does not, 1000 ms and more do, and nothing is left pending',()=>{
 const t=entered();hit(t,200);
 const r=hit(t,1000);assert.equal(r.fire,null);assert.equal(r.id,null);assert.equal(r.progress,0);assert.equal(r.armed,false);assert.equal(t.id,null);
 for(let i=0;i<10;i++)assert.equal(hit(t,100).fire,null,'unarmed again: only a pointer move restarts it');
 const u=entered();hit(u,250);assert.equal(hit(u,60000).fire,null);assert.equal(u.id,null);
 hit(u,16,1,true);hit(u,250);assert.equal(hit(u,249).fire,null,'the 250 ms before the stall are gone');assert.equal(hit(u,1).fire,1);
 const v=entered();hit(v,300);assert.equal(hit(v,999).fire,1,'999 ms after 300 ms: counted (not a stall)');
 const w=entered();hit(w,300);hit(w,1000);assert.equal(w.id,null,'1000 ms right after 300 ms: reset, never a pick');
 for(const stall of [1000,1001,5000,3600000]){const x=entered();hit(x,400);assert.equal(hit(x,stall).fire,null,String(stall));assert.equal(x.id,null);}
});

test('a long frame during a dark-beat hold resets it; a zero, negative or NaN delta only counts nothing',()=>{
 const t=entered();hit(t,250);hit(t,100);
 t.update({hitId:null,hiddenId:1,dtMs:999});assert.equal(t.id,null,'999 ms held exceeds the 600 ms hold cap');
 const s=entered();hit(s,250);s.update({hitId:null,hiddenId:1,dtMs:1000});assert.equal(s.id,null,'a stall while held resets');
 const u=entered();hit(u,200);
 for(const bad of [NaN,-5,undefined,0])assert.equal(hit(u,bad).fire,null);
 assert.equal(hit(u,100).progress,.6);assert.equal(hit(u,200).fire,1);
});

test('a hold on a hidden drop expires after 600 ms of dark beats, and a visible frame restarts that clock',()=>{
 const t=entered();hit(t,250);
 for(let i=0;i<6;i++)assert.equal(t.update({hitId:null,hiddenId:1,dtMs:100}).id,1);
 assert.equal(t.update({hitId:null,hiddenId:1,dtMs:1}).id,null,'601 ms held');
 const u=entered();hit(u,250);
 for(let k=0;k<5;k++){for(let i=0;i<5;i++)u.update({hitId:null,hiddenId:1,dtMs:100});hit(u,1);}
 assert.equal(u.id,1,'25 hidden frames in total, but never 600 ms in a row');
});

test('499 ms, then the pointer slides off and back in: a full 500 ms is needed again',()=>{
 const t=entered();for(let i=0;i<49;i++)assert.equal(hit(t,10).fire,null);hit(t,9);
 t.update({hitId:null,dtMs:16});assert.equal(t.id,null);
 hit(t,16,1,true);
 for(let i=0;i<49;i++)assert.equal(hit(t,10).fire,null,'re-entry '+i);
 assert.equal(hit(t,9).fire,null,'499 ms after re-entry');assert.equal(hit(t,1).fire,1,'500 ms after re-entry');
});

test('another drop restarts the hover and must be entered by a move',()=>{
 const t=entered();hit(t,250);assert.equal(hit(t,16,2,false).progress,0);
 for(let i=0;i<10;i++)assert.equal(hit(t,100,2,false).fire,null,'unarmed drop 2');
 hit(t,16,2,true);hit(t,250,2);assert.equal(hit(t,250,2).fire,2);
 const u=entered();hit(u,250);hit(u,16,3,true);hit(u,250,3);assert.equal(hit(u,249,3).fire,null,'time on drop 1 was not carried over');
});

test('sliding off the drop resets at once, even for a single frame (no edge grace, long dark-beat holds expire)',()=>{
 const t=entered();hit(t,250);hit(t,200);
 const gone=t.update({hitId:null,dtMs:16});assert.equal(gone.id,null);assert.equal(gone.progress,0);assert.equal(t.id,null);
 assert.equal(hit(t,16,1,false).progress,0,'back on the drop without a move: unarmed');
 for(let i=0;i<10;i++)assert.equal(hit(t,100).fire,null);
 const u=entered();hit(u,250);hit(u,200);u.update({hitId:null,dtMs:16});hit(u,16,1,true);hit(u,100);
 assert.equal(hit(u,100).fire,null,'the 450 ms before the exit are gone');
});

test('a blink dark beat (tracked drop hidden under the cursor) keeps progress, adds no time and cannot pick',()=>{
 const t=entered();hit(t,250);hit(t,200);
 for(let i=0;i<6;i++){const r=t.update({hitId:null,hiddenId:1,dtMs:100});assert.equal(r.fire,null);assert.equal(r.id,1);assert.equal(r.progress,.9);}
 assert.equal(hit(t,49).fire,null,'still 449 ms + 49: the dark beat added nothing');assert.equal(hit(t,1).fire,1,'500 ms reached on a visible frame');
});

test('hidden is only a hold for the tracked drop: another id, or no hidden drop, resets',()=>{
 const a=entered();hit(a,250);a.update({hitId:null,hiddenId:2,dtMs:16});assert.equal(a.id,null);
 const b=entered();hit(b,250);b.update({hitId:null,hiddenId:null,dtMs:16});assert.equal(b.id,null);
 const c=createHoverTracker();assert.equal(c.update({hitId:null,hiddenId:1,dtMs:16}).id,null,'nothing tracked: nothing to hold');
});

test('reset clears progress; stale time never carries over',()=>{
 const t=entered();hit(t,400);t.reset();assert.equal(t.id,null);
 assert.equal(hit(t,16,1,true).progress,0);assert.equal(hit(t,99).fire,null);
});

test('after a pick the same id cannot fire again until the pointer left it',()=>{
 const t=entered();hit(t,250);assert.equal(hit(t,250).fire,1);
 for(let i=0;i<10;i++)assert.equal(hit(t,250,1,true).fire,null,'still blocked');
 t.update({hitId:null,dtMs:16});hit(t,16,1,true);hit(t,250);assert.equal(hit(t,250).fire,1);
});
