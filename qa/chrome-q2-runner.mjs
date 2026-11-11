// Branch-only Linux diagnostic: two real 1280x720 Chrome runs and bounded
// lifecycle failure probes. Uses only Node's standard library.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const outputArg=process.argv.find(a=>a.startsWith('--output='));
if(!outputArg)throw new Error('pass --output=DIR');
const output=path.resolve(outputArg.slice(9));
const chrome=process.env.CHROME;
if(!chrome||!fs.existsSync(chrome))throw new Error('set CHROME to the runner-installed Google Chrome executable');
fs.mkdirSync(output,{recursive:true});
const environment={node:process.version,platform:process.platform,release:os.release(),arch:process.arch,
 chromePath:chrome,chromeVersion:execFileSync(chrome,['--version'],{encoding:'utf8'}).trim(),
 runnerImage:process.env.ImageOS??null,runnerImageVersion:process.env.ImageVersion??null,
 runId:process.env.GITHUB_RUN_ID??null,sha:process.env.GITHUB_SHA??null};
fs.writeFileSync(path.join(output,'environment.json'),JSON.stringify(environment,null,2)+'\n');
const summary={environment,cases:[],success:false};
function groupGone(pid){if(!pid)return false;try{process.kill(-pid,0);return false;}catch(e){return e.code==='ESRCH';}}
function requireResult(ok,message){if(!ok)throw new Error(message);}
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
 const evidence={name,args,elapsedMs:null,exit,outerTimedOut,profileObserved:!!profile,
  profileRemoved:harnessProfileRemoved,browserPidObserved:browserPid>0,
  browserGroupGone:harnessGroupGone,runnerForcedCleanup,
  finalProfileRemoved:!!profile&&!fs.existsSync(profile),finalBrowserGroupGone:groupGone(browserPid),
  reportParsed:!!report,
  passed:report?.passed??null,failed:report?.failed??null,notRun:report?.notRun??null,
  aborted:report?.aborted??null,fatal:report?.fatal??null,
  webglDiagnostics:report?.webglDiagnostics??[]};
 const profileSafe=evidence.profileRemoved&&evidence.browserGroupGone;
 let valid=false;
 if(expected==='matrix'){
  const names=report?.results?.map(r=>r.name)??[];
  valid=exit.code===0&&!outerTimedOut&&profileSafe&&report?.failed===0&&report?.notRun===0&&
   !report?.aborted&&!report?.fatal&&report?.consoleErrors?.length===0&&
   report?.webglDiagnostics?.length===1&&/WebGL/i.test(report.webglDiagnostics[0].version??'')&&
   Boolean(report.webglDiagnostics[0].renderer)&&
   ['start, then ring, item and both label ends','five rounds of pause, settings and resume',
    'settings and auto-equip survive a reload','a separate browser profile context starts from defaults',
    'blocked localStorage','dialog 1280x720'].every(needle=>names.some(n=>n.includes(needle)))&&
   ['desktop-title.png','desktop-game.png'].every(file=>fs.existsSync(path.join(dir,'shots',file)));
 }else if(expected==='timeout'){
  valid=exit.code!==0&&!outerTimedOut&&profileSafe&&report?.aborted?.includes('check')&&
   report?.failed>0&&report?.notRun>0&&report?.selfTest?.laterCheckRan!==true&&report?.selfTest?.okAfterTimeout===0;
 }else if(expected==='cdp'){
  valid=exit.code!==0&&!outerTimedOut&&profileSafe&&report?.aborted?.includes('CDP')&&
   report?.failed>0&&report?.notRun>0&&report?.selfTest?.laterCheckRan!==true;
 }else if(expected==='assert'){
  valid=exit.code!==0&&!outerTimedOut&&profileSafe&&!report?.aborted&&report?.failed===1&&
   report?.passed>=1&&report?.selfTest?.laterCheckRan===true;
 }else if(expected==='setup'){
  valid=exit.code!==0&&!outerTimedOut&&profileSafe&&report?.fatal?.includes('self-test: setup failure');
 }
 evidence.valid=Boolean(valid);summary.cases.push(evidence);
 fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(`${evidence.valid?'PASS':'FAIL'} ${name}: exit=${exit.code} profileRemoved=${evidence.profileRemoved} groupGone=${evidence.browserGroupGone} checks=${evidence.passed}/${evidence.failed}`);
 return evidence.valid;
}
const matrix={outer:720000,check:120000,cdp:45000,setup:15000};
const negative={outer:30000,check:1500,cdp:1500,setup:3000};
try{
 for(const name of ['matrix-1','matrix-2']){
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
 summary.success=summary.cases.length===6&&summary.cases.every(c=>c.valid);
}catch(error){summary.error=String(error?.stack||error);}
finally{fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');}
requireResult(summary.success,'Q2 Chrome diagnostic failed; inspect uploaded summary, logs and screenshots');
