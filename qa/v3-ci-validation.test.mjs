import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validateOutcome,validatePng,validateImages,crc32,v3CheckNames,ownedIdentityMatches} from './v3-ci-validation.mjs';
import {v3Sizes,v3ShotNames} from './v3-ui-contracts.mjs';

function png(w,h){
 const chunk=(type,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;};
 const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((w*3+1)*h))),chunk('IEND',Buffer.alloc(0))]);
}
const images=Object.fromEntries(v3ShotNames.map(name=>{const [,w,h]=/^v3-(\d+)x(\d+)-/.exec(name);return [name,png(+w,+h)];}));
const state=muted=>({status:'paused',muted,volume:0,pressed:String(muted),text:muted?'已靜音':'未靜音',visible:true});
test('cleanup ownership rejects PID reuse, wrong group/profile and missing identity',()=>{
 const owner={pid:123,start:'456',profile:'/tmp/plush-chrome-owned'};
 const id={group:123,start:'456',cmd:['chrome','--user-data-dir=/tmp/plush-chrome-owned']};
 assert.equal(ownedIdentityMatches(id,owner),true);
 for(const changed of [null,{...id,start:'457'},{...id,group:124},{...id,cmd:['chrome']},{...id,cmd:['--user-data-dir=/tmp/other']}])assert.equal(ownedIdentityMatches(changed,owner),false);
 assert.equal(ownedIdentityMatches(id,{...owner,start:undefined}),false);
});
const valid=()=>({exit:{code:0,signal:null},timedOut:false,interrupted:false,overflow:false,font:{status:'installed',version:'1'},images,
 report:{fatal:null,aborted:null,passed:3,failed:0,notRun:0,consoleErrors:[],results:v3CheckNames.map(name=>({name,ok:true})),
  v3Evidence:v3Sizes.map(view=>({view,before:state(false),muted:state(true),restored:state(false)})),
  webglDiagnostics:v3Sizes.map(view=>{const [width,height]=view.split('x').map(Number);return {view,width,height,renderer:'SwiftShader',version:'WebGL 2.0'};})},
 cleanup:{runnerExited:true,browserOwned:true,browserGroupGone:true,profileRemoved:true,forced:false,ports:[{port:1234,refused:true,bindable:true},{port:1235,refused:true,bindable:true}]}});
test('valid full evidence passes; each missing/incorrect outcome component fails closed',()=>{
 assert.equal(validateOutcome(valid()),true);
 const mutations=[x=>x.exit.code=1,x=>x.exit.signal='SIGTERM',x=>x.timedOut=true,x=>x.interrupted=true,x=>x.overflow=true,
  x=>x.font.status='unavailable',x=>x.font.version='',x=>x.report.results.pop(),x=>x.report.results.reverse(),
  x=>x.report.results[0].notRun=true,x=>x.report.results[0].note=true,x=>x.report.results[0].ok=false,
  x=>x.report.failed=1,x=>x.report.passed=2,x=>x.report.notRun=1,x=>x.report.fatal='setup',x=>x.report.aborted='timeout',
  x=>x.report.consoleErrors.push('error'),x=>x.report.v3Evidence.pop(),x=>x.report.v3Evidence[0].muted.muted=false,
  x=>x.report.webglDiagnostics[0].renderer='hardware',x=>x.report.webglDiagnostics[0].width=1,
  x=>x.cleanup.browserOwned=false,x=>x.cleanup.runnerExited=false,x=>x.cleanup.browserGroupGone=false,
  x=>x.cleanup.profileRemoved=false,x=>x.cleanup.forced=true,x=>x.cleanup.ports.pop(),
  x=>x.cleanup.ports[1].port=x.cleanup.ports[0].port,x=>x.cleanup.ports[1].refused=false,x=>x.cleanup.ports[0].bindable=false];
 for(const mutate of mutations){const x=valid();mutate(x);assert.throws(()=>validateOutcome(x),String(mutate));}
});
test('PNG content is decoded, checked for CRC, dimensions, truncation and exact set',()=>{
 assert.equal(validatePng(png(2,3),2,3).height,3);
 assert.throws(()=>validatePng(png(2,3),3,2));
 const bad=png(2,3);bad[bad.length-1]^=1;assert.throws(()=>validatePng(bad,2,3));
 assert.throws(()=>validatePng(png(2,3).subarray(0,-2),2,3));
 assert.throws(()=>validatePng(Buffer.concat([png(2,3),Buffer.from([0])]),2,3));
 const missing={...images};delete missing[v3ShotNames[0]];assert.throws(()=>validateImages(missing));
 assert.throws(()=>validateImages({...images,'unexpected.png':png(2,3)}));
 assert.throws(()=>validateImages({...images,[v3ShotNames[0]]:Buffer.from('not png')}));
});

test('PNG chunk names enforce reserved bits and image summaries retain original SHA-256',()=>{
 const invalidReserved=png(2,3);invalidReserved.write('IHdR',12);invalidReserved.writeUInt32BE(crc32(invalidReserved.subarray(12,29)),29);assert.throws(()=>validatePng(invalidReserved,2,3));
 const invalidName=png(2,3);invalidName.write('IH!R',12);invalidName.writeUInt32BE(crc32(invalidName.subarray(12,29)),29);assert.throws(()=>validatePng(invalidName,2,3));
 const summaries=validateImages(images);
 for(const [name,bytes] of Object.entries(images)){assert.equal(summaries[name].sha256,createHash('sha256').update(bytes).digest('hex'));assert.match(summaries[name].sha256,/^[a-f0-9]{64}$/);}
});
