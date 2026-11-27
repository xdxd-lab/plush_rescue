import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {supervise} from './v3-supervisor.mjs';

test('supervisor records ordinary success, nonzero and spawn failure without retries',async()=>{
 for(const code of [0,7]){
  let count=0;const r=await supervise(process.execPath,['-e',`process.exit(${code})`],{workMs:5000,graceMs:100,onSpawn:()=>count++});
  assert.equal(r.exit.code,code);assert.equal(count,1);assert.equal(r.timedOut,false);
 }
 const r=await supervise('/no-such-v3-test-executable',[],{workMs:5000,graceMs:100});
 assert.ok(r.spawnError);assert.notEqual(r.exit.code,0);
});
test('supervisor deadline terminates a stuck child and records timeout',async()=>{
 const stops=[];const r=await supervise(process.execPath,['-e','setInterval(()=>{},1000)'],{workMs:300,graceMs:100,onStop:x=>stops.push(x)});
 assert.equal(r.timedOut,true);assert.notEqual(r.exit.code,0);assert.ok(stops.includes('timeout'));
});
test('supervisor escalates a child that ignores TERM and refuses overflow evidence',async()=>{
 const r=await supervise(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{workMs:5000,graceMs:100});
 assert.equal(r.timedOut,true);assert.equal(r.forced,true);assert.equal(r.exit.signal,'SIGKILL');
 let bytes=0;const overflow=await supervise(process.execPath,['-e',"process.stdout.write('x'.repeat(10000));setInterval(()=>{},1000)"],{workMs:5000,graceMs:100,maxBytes:64,onData:(_,b)=>bytes+=b.length});
 assert.equal(overflow.overflow,true);assert.equal(bytes,64);assert.notEqual(overflow.exit.code,0);
});

test('supervisor records parent SIGTERM interruption and reaps its short-lived Node child',async()=>{
 const source=`import {supervise} from ${JSON.stringify(new URL('./v3-supervisor.mjs',import.meta.url).href)};const r=await supervise(process.execPath,['-e','setInterval(()=>{},1000)'],{workMs:10000,graceMs:200,onSpawn:()=>console.log('READY')});console.log(JSON.stringify({interrupted:r.interrupted,timedOut:r.timedOut,exit:r.exit}));`;
 const parent=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe']});let out='',err='';parent.stdout.setEncoding('utf8').on('data',s=>out+=s);parent.stderr.setEncoding('utf8').on('data',s=>err+=s);
 const done=new Promise((resolve,reject)=>{parent.once('error',reject);parent.once('close',(code,signal)=>resolve({code,signal}));});
 let signalled=false;parent.stdout.on('data',()=>{if(!signalled&&out.includes('READY\n')){signalled=true;parent.kill('SIGTERM');}});
 const result=await done;assert.equal(result.code,0,err);assert.equal(signalled,true);const record=JSON.parse(out.trim().split('\n').at(-1));assert.equal(record.interrupted,true);assert.equal(record.timedOut,false);assert.notEqual(record.exit.code,0);
});
test('supervisor marks and records forced cleanup when a descendant retains inherited pipes',async()=>{
 const stops=[];const r=await supervise(process.execPath,['-e',`require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},700)'],{stdio:'inherit'});process.exit(0);`],{workMs:10000,graceMs:120,onStop:x=>stops.push(x)});
 assert.equal(r.exit.code,0);assert.equal(r.timedOut,false);assert.equal(r.forced,true);assert.ok(stops.includes('pipe-drain'));
});
