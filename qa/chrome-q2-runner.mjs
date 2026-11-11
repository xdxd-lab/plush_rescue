// Branch-only Linux diagnostic: two real 1280x720 Chrome runs and bounded
// lifecycle failure probes. Uses only Node's standard library.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {matrixNames,matrixComplete,matrixCaseValid,lifecycleValid,completeDiagnostic,expectedCaseNames,parseMatrixRuns} from './chrome-q2-validation.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const outputArg=process.argv.find(a=>a.startsWith('--output='));
if(!outputArg)throw new Error('pass --output=DIR');
const matrixRuns=parseMatrixRuns(process.argv);
const output=path.resolve(outputArg.slice(9));
const chrome=process.env.CHROME;
if(!chrome||!fs.existsSync(chrome))throw new Error('set CHROME to the runner-installed Google Chrome executable');
fs.mkdirSync(output,{recursive:true});
const environment={node:process.version,platform:process.platform,release:os.release(),arch:process.arch,
 chromePath:chrome,chromeVersion:execFileSync(chrome,['--version'],{encoding:'utf8'}).trim(),
 runnerImage:process.env.ImageOS??null,runnerImageVersion:process.env.ImageVersion??null,
 fontPackage:'fonts-noto-cjk',fontStatus:process.env.Q2_FONT_STATUS??'unreported',
 fontVersion:process.env.Q2_FONT_VERSION??null,
 runId:process.env.GITHUB_RUN_ID??null,sha:process.env.GITHUB_SHA??null};
fs.writeFileSync(path.join(output,'environment.json'),JSON.stringify(environment,null,2)+'\n');
const summary={environment,matrixRuns,expectedCaseCount:expectedCaseNames(matrixRuns).length,
 cases:[],success:false};
function groupGone(pid){if(!pid)return false;try{process.kill(-pid,0);return false;}catch(e){return e.code==='ESRCH';}}
function requireResult(ok,message){if(!ok)throw new Error(message);}
function validPort(value){const port=Number(value);return Number.isInteger(port)&&port>0&&port<=65535?port:null;}
function refusedConnection(port){return new Promise(resolve=>{
 const socket=net.connect({host:'127.0.0.1',port});let done=false;
 const finish=(result)=>{if(done)return;done=true;socket.destroy();resolve(result);};
 socket.setTimeout(2000,()=>finish({refused:false,error:'connect timeout'}));
 socket.once('connect',()=>finish({refused:false,error:'connection accepted'}));
 socket.once('error',error=>finish({refused:error.code==='ECONNREFUSED',error:error.code??String(error)}));
 });}
function bindAvailable(port){return new Promise(resolve=>{
 const server=net.createServer();let done=false;
 const timer=setTimeout(()=>finish({available:false,error:'bind timeout'}),2000);
 const finish=result=>{if(done)return;done=true;clearTimeout(timer);
  if(server.listening)server.close(()=>resolve(result));else resolve(result);};
 server.once('error',error=>finish({available:false,error:error.code??String(error)}));
 server.listen(port,'127.0.0.1',()=>finish({available:true,error:null}));
 });}
async function checkReleasedPort(port){
 if(!port)return {port:null,connectionRefused:false,bindAvailable:false,error:'missing or invalid port'};
 const connection=await refusedConnection(port),bind=await bindAvailable(port);
 return {port,connectionRefused:connection.refused,bindAvailable:bind.available,
  connectionError:connection.error,bindError:bind.error};
}
async function runCase(name,args,limits,expected){
 const dir=path.join(output,name);fs.mkdirSync(dir,{recursive:true});
 const child=spawn(process.execPath,['qa/browser-chrome.mjs',...args],{cwd:root,
  env:{...process.env,CHECK_TIMEOUT_MS:String(limits.check),CDP_TIMEOUT_MS:String(limits.cdp),SETUP_TIMEOUT_MS:String(limits.setup)},
  stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',outerTimedOut=false;
 child.stdout.on('data',chunk=>stdout+=chunk);
 child.stderr.on('data',chunk=>stderr+=chunk);
 const timer=setTimeout(()=>{outerTimedOut=true;child.kill('SIGTERM');},limits.outer);
 const hard=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},limits.outer+15000);
 const exit=await new Promise(resolve=>child.on('close',(code,signal)=>resolve({code,signal})));
 clearTimeout(timer);clearTimeout(hard);
 fs.writeFileSync(path.join(dir,'stdout.json'),stdout);
 fs.writeFileSync(path.join(dir,'stderr.log'),stderr);
 let report=null;try{report=JSON.parse(stdout.trim());}catch{}
 const profile=stderr.match(/^profile (.+)$/m)?.[1]??null;
 const browserPid=Number(stderr.match(/^chrome pid (\d+)$/m)?.[1]??0);
 const originMatch=stderr.match(/^loopback origin (http:\/\/127\.0\.0\.1:(\d+))$/m);
 const origin=originMatch?.[1]??null;
 const httpPort=validPort(originMatch?.[2]);
 const devtoolsPort=validPort(stderr.match(/^devtools port (\d+)$/m)?.[1]);
 const harnessProfileRemoved=!!profile&&!fs.existsSync(profile);
 const harnessGroupGone=groupGone(browserPid);
 let runnerForcedCleanup=false;
 if(browserPid&&!harnessGroupGone){
  runnerForcedCleanup=true;
  try{process.kill(-browserPid,'SIGKILL');}catch{}
 }
 if(profile&&!harnessProfileRemoved){
  runnerForcedCleanup=true;
  try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
 }
 // Probe only the two ports reported by this harness, after the child has exited.
 // Never terminate a process found at either port; an occupied port fails validation.
 const ports={http:await checkReleasedPort(httpPort),devtools:await checkReleasedPort(devtoolsPort)};
 const portsClean=httpPort!==devtoolsPort&&Object.values(ports).every(p=>p.connectionRefused&&p.bindAvailable);
 const evidence={name,args,elapsedMs:null,exit,outerTimedOut,profileObserved:!!profile,
  profileRemoved:harnessProfileRemoved,browserPidObserved:browserPid>0,
  browserGroupGone:harnessGroupGone,runnerForcedCleanup,
  finalProfileRemoved:!!profile&&!fs.existsSync(profile),finalBrowserGroupGone:groupGone(browserPid),
  loopbackOrigin:origin,ports,portsClean,
  reportParsed:!!report,
  passed:report?.passed??null,failed:report?.failed??null,notRun:report?.notRun??null,
  aborted:report?.aborted??null,fatal:report?.fatal??null,
  selfTestPhaseReached:report?.selfTest?.phaseReached??null,
  webglDiagnostics:report?.webglDiagnostics??[]};
 const cleanupSafe=evidence.profileRemoved&&evidence.browserGroupGone&&portsClean;
 let valid=false;
 if(expected==='matrix'){
  const names=report?.results?.map(r=>r.name)??[];
  evidence.expectedResults=matrixNames;
  evidence.actualResults=names;
  evidence.matrixComplete=matrixComplete(report);
  valid=matrixCaseValid({exit,outerTimedOut,cleanupSafe,report,
   shotsPresent:['desktop-title.png','desktop-game.png'].every(file=>fs.existsSync(path.join(dir,'shots',file)))});
 }else valid=lifecycleValid(expected,{exit,outerTimedOut,cleanupSafe,report});
 evidence.valid=Boolean(valid);summary.cases.push(evidence);
 fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(`${evidence.valid?'PASS':'FAIL'} ${name}: exit=${exit.code} profileRemoved=${evidence.profileRemoved} groupGone=${evidence.browserGroupGone} portsClean=${portsClean} checks=${evidence.passed}/${evidence.failed}`);
 return evidence.valid;
}
const matrix={outer:720000,check:120000,cdp:45000,setup:15000};
const negative={outer:120000,check:240000,cdp:60000,setup:15000};
try{
 for(let i=1;i<=matrixRuns;i++){
  const name=`matrix-${i}`;
  const started=Date.now();
  const ok=await runCase(name,['--views=1280x720','--dialogs','--storage-contexts',`--shots=${path.join(output,name,'shots')}`],matrix,'matrix');
  summary.cases.at(-1).elapsedMs=Date.now()-started;
  fs.writeFileSync(path.join(output,name,'evidence.json'),JSON.stringify(summary.cases.at(-1),null,2)+'\n');
  if(!ok)break; // An unstable run is a failure, never retried away.
 }
 for(const mode of ['timeout','cdp','assert','setup']){
  const started=Date.now();
  await runCase(`lifecycle-${mode}`,[`--self-test=${mode}`],negative,mode);
  summary.cases.at(-1).elapsedMs=Date.now()-started;
  fs.writeFileSync(path.join(output,`lifecycle-${mode}`,'evidence.json'),JSON.stringify(summary.cases.at(-1),null,2)+'\n');
 }
 summary.functionalSuccess=completeDiagnostic(summary.cases,matrixRuns);
 summary.success=summary.functionalSuccess&&environment.fontStatus==='installed';
 summary.visualReviewPending=environment.fontStatus==='installed';
}catch(error){summary.error=String(error?.stack||error);}
finally{summary.executedCaseCount=summary.cases.length;
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');}
requireResult(summary.success,environment.fontStatus==='installed'
 ?'Q2 Chrome diagnostic failed; inspect uploaded summary, logs and screenshots'
 :'Q2 CJK font unavailable: functional evidence only; inspect uploaded summary and font-package.txt');
