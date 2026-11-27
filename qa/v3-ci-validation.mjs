import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {v3Sizes,v3ShotNames,assertV3State} from './v3-ui-contracts.mjs';

export const v3CheckNames=v3Sizes.map(size=>`${size}: start and resume are fully visible on open; every other control stays reachable`);
export function ownedIdentityMatches(id,owner){
 return Boolean(owner&&Number.isInteger(owner.pid)&&owner.pid>1&&typeof owner.start==='string'&&/^\d+$/.test(owner.start)&&
  typeof owner.profile==='string'&&owner.profile.length>0&&id&&id.group===owner.pid&&id.start===owner.start&&
  Array.isArray(id.cmd)&&id.cmd.includes(`--user-data-dir=${owner.profile}`));
}
export function validateReport(r){
 assert.ok(r&&r.fatal===null&&r.aborted===null&&!r.selfTest);
 assert.equal(r.passed,3);assert.equal(r.failed,0);assert.equal(r.notRun,0);
 assert.deepEqual(r.consoleErrors,[]);
 assert.deepEqual(r.results.map(x=>x.name),v3CheckNames);
 for(const result of r.results){assert.equal(result.ok,true);assert.ok(!result.notRun&&!result.note);}
 assert.deepEqual(r.v3Evidence.map(x=>x.view),v3Sizes);
 for(const e of r.v3Evidence){assertV3State(e.before,false);assertV3State(e.muted,true);assertV3State(e.restored,false);}
 assert.deepEqual(r.webglDiagnostics.map(x=>x.view),v3Sizes);
 for(const [i,e] of r.webglDiagnostics.entries()){
  assert.match(e.renderer,/SwiftShader/i);assert.match(e.version,/WebGL/);
  assert.deepEqual([e.width,e.height],v3Sizes[i].split('x').map(Number));
 }
 return true;
}
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// Decode the complete non-interlaced 8-bit RGB/RGBA PNG scanline stream emitted by CDP.
// This checks integrity, not visual correctness (QA2 must review the original images).
export function validatePng(bytes,width,height){
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length>40&&bytes.length<=16000000);
 assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 let offset=8,header=null,ended=false,idatEnded=false;const chunks=[];
 while(offset<bytes.length){
  assert.ok(offset+12<=bytes.length);const len=bytes.readUInt32BE(offset);
  assert.ok(len<=16000000&&offset+12+len<=bytes.length);
  const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+len);
  assert.match(type,/^[A-Za-z]{4}$/);assert.equal(type[2],type[2].toUpperCase(),'PNG reserved chunk bit');
  assert.equal(crc32(bytes.subarray(offset+4,offset+8+len)),bytes.readUInt32BE(offset+8+len),'PNG CRC');
  if(!header){assert.equal(type,'IHDR');assert.equal(len,13);header=data;
   assert.equal(data.readUInt32BE(0),width);assert.equal(data.readUInt32BE(4),height);
   assert.equal(data[8],8);assert.ok([2,6].includes(data[9]));assert.equal(data[10],0);assert.equal(data[11],0);assert.equal(data[12],0);
  }else if(type==='IDAT'){assert.ok(!idatEnded);chunks.push(data);}
  else if(type==='IEND'){assert.equal(len,0);ended=true;offset+=12;break;}
  else{assert.notEqual(type,'IHDR');assert.ok(type[0]===type[0].toLowerCase(),'unknown critical PNG chunk');if(chunks.length)idatEnded=true;}
  offset+=12+len;
 }
 assert.ok(ended&&chunks.length&&offset===bytes.length);
 const row=width*(header[9]===6?4:3)+1;
 const pixels=inflateSync(Buffer.concat(chunks),{maxOutputLength:row*height});
 assert.equal(pixels.length,row*height);for(let y=0;y<height;y++)assert.ok(pixels[y*row]<=4,'PNG row filter');
 return {width,height,bytes:bytes.length};
}
export function validateImages(files){
 assert.deepEqual(Object.keys(files).sort(),[...v3ShotNames].sort());
 return Object.fromEntries(v3ShotNames.map(name=>{
  const [,w,h]=/^v3-(\d+)x(\d+)-/.exec(name);return [name,{...validatePng(files[name],Number(w),Number(h)),sha256:createHash('sha256').update(files[name]).digest('hex')}];
 }));
}
export function validateCleanup(c){
 assert.ok(c&&c.runnerExited===true&&c.browserOwned===true&&c.browserGroupGone===true&&c.profileRemoved===true);
 assert.equal(c.forced,false);assert.equal(c.ports.length,2);
 assert.notEqual(c.ports[0].port,c.ports[1].port);
 for(const p of c.ports){assert.ok(Number.isInteger(p.port)&&p.port>0&&p.port<65536);assert.equal(p.refused,true);assert.equal(p.bindable,true);}
 return true;
}
export function validateOutcome({exit,timedOut,interrupted,overflow,report,cleanup,images,font}){
 assert.equal(exit.code,0);assert.equal(exit.signal,null);assert.equal(timedOut,false);assert.equal(interrupted,false);assert.equal(overflow,false);
 assert.equal(font.status,'installed');assert.ok(typeof font.version==='string'&&font.version.trim());
 validateReport(report);validateCleanup(cleanup);validateImages(images);return true;
}
