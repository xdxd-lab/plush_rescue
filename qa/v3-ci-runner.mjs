import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {supervise} from './v3-supervisor.mjs';
import {validateOutcome,validateImages,ownedIdentityMatches} from './v3-ci-validation.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length!==1||!args[0].startsWith('--output='))throw new Error('pass exactly --output=DIR');
if(process.platform!=='linux')throw new Error('V3 CI supervisor requires Linux ownership evidence');
const output=path.resolve(args[0].slice(9));
// Never reuse screenshots or overwrite an earlier run. Workflow metadata lives outside this directory.
fs.mkdirSync(output,{recursive:false});
const shots=path.join(output,'screenshots');fs.mkdirSync(shots);
const summary={started:new Date().toISOString(),success:false,visualReviewPending:true,
 sha:process.env.GITHUB_SHA??null,runId:process.env.GITHUB_RUN_ID??null,node:process.version,
 font:{status:process.env.V3_FONT_STATUS??'unreported',version:process.env.V3_FONT_VERSION??null},
 limits:{workMs:720000,cleanupMs:30000,jobMinutes:15},ownership:null};
const write=()=>{const p=path.join(output,'summary.json');fs.writeFileSync(p+'.tmp',JSON.stringify(summary,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
write();
let stderr='',stdout='',runnerPid=null,runnerStart=null,runnerDone=false,ownership=null,forced=false;
const gone=pid=>{if(!Number.isInteger(pid)||pid<=1)return false;try{process.kill(-pid,0);return false;}catch(e){return e.code==='ESRCH';}};
function identity(pid){
 try{const stat=fs.readFileSync(`/proc/${pid}/stat`,'utf8').split(') ').slice(1).join(') ').split(' ');
  return {group:Number(stat[2]),start:stat[19],cmd:fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0')};
 }catch{return null;}
}
function captureOwner(){
 if(ownership)return;
 const p=stderr.match(/^profile (.+)$/m)?.[1],pid=Number(stderr.match(/^chrome pid (\d+)$/m)?.[1]);
 if(!p||!Number.isInteger(pid)||pid<=1)return;
 const profile=path.resolve(p),id=identity(pid);
 if(path.dirname(profile)!==os.tmpdir()||!path.basename(profile).startsWith('plush-chrome-'))return;
 if(ownedIdentityMatches(id,{pid,profile,start:id?.start})){
  ownership={pid,profile,start:id.start};summary.ownership=ownership;write();
 }
}
function stopOwned(){
 if(!ownership)return;
 const id=identity(ownership.pid);
 if(ownedIdentityMatches(id,ownership)){
  forced=true;try{process.kill(-ownership.pid,'SIGKILL');}catch{}
 }
 // If the original leader identity cannot be verified, never signal a guessed/reused PID.
}
const deadline=setTimeout(()=>{
 if(!runnerDone&&runnerPid&&identity(runnerPid)?.start===runnerStart)try{process.kill(runnerPid,'SIGKILL');}catch{}
 stopOwned();summary.error='total 750s supervisor deadline';summary.forced=forced;summary.finished=new Date().toISOString();write();process.exit(1);
},750000);
function released(port){return new Promise(resolve=>{
 if(!Number.isInteger(port)||port<1||port>65535)return resolve({port:null,refused:false,bindable:false});
 const result={port,refused:false,bindable:false};const socket=net.connect({host:'127.0.0.1',port});let probed=false;
 const probe=()=>{if(probed)return;probed=true;socket.destroy();const server=net.createServer();
  const finish=()=>{clearTimeout(timer);if(server.listening)server.close(()=>resolve(result));else resolve(result);};
  const timer=setTimeout(()=>{server.close();resolve(result);},2000);
  server.once('error',finish);server.listen(port,'127.0.0.1',()=>{result.bindable=true;finish();});
 };
 socket.setTimeout(2000,probe);socket.once('connect',probe);socket.once('error',e=>{result.refused=e.code==='ECONNREFUSED';probe();});
 });}
try{
 summary.actualSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000}).trim();
 if(!/^[a-f0-9]{40}$/.test(summary.sha??'')||summary.actualSha!==summary.sha)throw new Error('checkout SHA must match GITHUB_SHA');
 if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8',timeout:5000}).trim())throw new Error('tracked checkout is dirty');
 const chrome=process.env.CHROME;if(!chrome||!fs.existsSync(chrome))throw new Error('CHROME missing');
 summary.chromeVersion=execFileSync(chrome,['--version'],{encoding:'utf8',timeout:5000}).trim();
 summary.command=[process.execPath,'qa/browser-chrome.mjs','--v3-audio','--no-pickup','--views=1280x720,390x844,360x640','--require-swiftshader',`--shots=${shots}`];write();
 const result=await supervise(summary.command[0],summary.command.slice(1),{cwd:root,
  env:{...process.env,CHECK_TIMEOUT_MS:'240000',CDP_TIMEOUT_MS:'60000',SETUP_TIMEOUT_MS:'15000'},
  onSpawn:pid=>{runnerPid=pid;runnerStart=identity(pid)?.start??null;summary.runnerPid=pid;write();},
  onData:(stream,chunk)=>{fs.appendFileSync(path.join(output,stream==='stdout'?'report.json':'stderr.log'),chunk);
   if(stream==='stdout')stdout+=chunk;else{stderr+=chunk;captureOwner();}},
  onStop:reason=>{summary.stopReason=reason;if(reason==='hard-kill')stopOwned();write();}
 });
 runnerDone=true;
 summary.process=result;
 const pidAbsent=()=>{try{process.kill(runnerPid,0);return false;}catch(e){return e.code==='ESRCH';}};
 const http=Number(stderr.match(/^loopback origin http:\/\/127\.0\.0\.1:(\d+)$/m)?.[1]);
 const cdp=Number(stderr.match(/^devtools port (\d+)$/m)?.[1]);
 const ports=await Promise.all([released(http),released(cdp)]);
 const browserGroupGone=!!ownership&&gone(ownership.pid);
 summary.cleanup={runnerExited:pidAbsent(),browserOwned:!!ownership,browserGroupGone,
  profileRemoved:!!ownership&&!fs.existsSync(ownership.profile),ports,forced:forced||result.forced};
 if(!browserGroupGone)stopOwned(); // cleanup cannot convert a failed harness into a pass
 summary.cleanup.forced=forced||result.forced;
 const report=JSON.parse(stdout);const images={};
 for(const name of fs.readdirSync(shots)){
  const file=path.join(shots,name);if(!fs.lstatSync(file).isFile())throw new Error('non-file image artifact');
  images[name]=fs.readFileSync(file);
 }
 summary.images=validateImages(images);
 validateOutcome({...result,report,cleanup:summary.cleanup,images,font:summary.font});
 summary.success=true;
}catch(error){summary.error=String(error.stack||error);stopOwned();}
finally{clearTimeout(deadline);summary.finished=new Date().toISOString();summary.forced=forced;write();}
process.exitCode=summary.success?0:1;
