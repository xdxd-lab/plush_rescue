// E7 controlled pause baseline, never an energy or release gate. Node 22+, Chrome, standard library only.
// CHROME=/path/to/chrome node qa/e7-measure.mjs --backend=hardware --output=/tmp/e6.json
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {classifyBackend} from './e6-backend.mjs';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const chromePath=process.env.CHROME;
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
const expectedSHA=process.argv.find(a=>a.startsWith('--expected-sha='))?.slice(15);
if(!/^[a-f0-9]{40}$/.test(expectedSHA??''))throw Error('require full --expected-sha');
const requestedBackend=process.argv.find(a=>a.startsWith('--backend='))?.slice(10);
if(!output||!chromePath||!fs.existsSync(chromePath))throw Error('set CHROME and --output=FILE');
if(!['hardware','swiftshader'].includes(requestedBackend))throw Error('pass --backend=hardware|swiftshader');
if(typeof WebSocket!=='function')throw Error('Node 22+ global WebSocket required');
if(fs.existsSync(output))throw Error('output exists; never overwrite prior evidence');
if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==expectedSHA||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('candidate SHA/clean guard failed');
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const config={viewport:[1280,720],dpr:1,quality:'balanced',seed:20261112,settleMs:2000,sampleMs:5000,sampleCap:2400,runs:3,requestedBackend,roundDeadlineMs:90000};
const scenarios=['low-load-running','dense'];
const source={node:process.version,os:os.platform()+' '+os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model??null,
 chrome:execFileSync(chromePath,['--version'],{encoding:'utf8'}).trim(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
const report={schema:'e7-pause-v1',config,source,actualBackend:null,scenarios:[],limits:{kind:'controlled presentation-only baseline; no energy, GPU-time, full-loop CPU or phone claim'},energyMeasurement:'not measured',hardwareBudget:'not applicable',success:false};
report.lifecycle=[];
const checkpoint=()=>{const temporary=output+'.tmp';fs.writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');fs.renameSync(temporary,output);};
checkpoint();
const imageBase=output.replace(/\.json$/,'');
let interrupted=null,abortCurrent=null;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{interrupted=signal;process.exitCode=signal==='SIGINT'?130:143;abortCurrent?.(signal);});
function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];}
function summarize(samples){return Object.fromEntries(['rafIntervalMs','renderCpuMs','calls','triangles'].map(key=>{const values=samples.map(s=>s[key]);return [key,{median:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:Math.max(...values)}]}));}
function fixtureScript(scenario){return `(()=>{
 const q=window.__PLUSH_QA__;if(!q||!q.renderer?.getContext())throw Error('game WebGL unavailable');
 const sheet=[...document.styleSheets].find(s=>s.href?.endsWith('/style.css'));
 const rules=sheet?.cssRules?.length??0,dialogWidth=getComputedStyle(document.querySelector('#dialog')).maxWidth;
 if(rules<20||dialogWidth!=='480px')throw Error('game CSS missing or layout invalid: '+rules+'/'+dialogWidth);
 q.setMap(0);q.quality('balanced');
 const g=q.game;let x=20261112;g.random=()=>((x=(Math.imul(1664525,x)+1013904223)>>>0)/4294967296);
 if(${JSON.stringify(scenario)}==='dense'){
  g.time=180;for(let i=0;i<24;i++){g.spawnEnemy();const e=g.enemies.at(-1);if(!e)throw Error('enemy spawn failed');const a=i*2.399963,r=2+(i%5);e.x=g.player.x+Math.cos(a)*r;e.z=g.player.z+Math.sin(a)*r;}
  for(const kind of ['mini','big'])if(!g.spawnBoss(kind,3))throw Error('boss spawn failed');
  const owners=g.enemies.filter(e=>e.boss);owners.forEach((owner,i)=>{owner.x=g.player.x+(i?3:-3);owner.z=g.player.z+3;g.addHazard(owner,owner.x,owner.z);g.addAlly(owner,0);});
  for(let i=0;i<8;i++)g.rescued.push({id:++g.serial,type:i%4,x:g.player.x+Math.cos(i)*2,z:g.player.z+Math.sin(i)*2,angle:0,life:3});
  g.events.length=0;
 }
 const counts={enemies:g.enemies.length,bosses:g.enemies.filter(e=>e.boss).length,hazards:g.hazards.length,allies:g.allies.length,rescued:g.rescued.length};
 if(${JSON.stringify(scenario)}==='dense'&&!(counts.enemies===26&&counts.bosses===2&&counts.hazards===2&&counts.allies===2&&counts.rescued===8))throw Error('dense fixture incomplete '+JSON.stringify(counts));
 if(${JSON.stringify(scenario)}==='low-load-running'&&counts.enemies!==0)throw Error('low-load fixture not empty');
 g.step=()=>{};g.status='running';q.pause();q.resume();q.renderOnce();q.camera.updateMatrixWorld();
 const projected=list=>list.map(p=>{const v=q.camera.position.clone().set(p.x,.5,p.z).project(q.camera);return {x:v.x,y:v.y,z:v.z,inViewport:Math.abs(v.x)<=1&&Math.abs(v.y)<=1&&v.z>=-1&&v.z<=1}});
 const positions={boss:projected(g.enemies.filter(e=>e.boss)),hazard:projected(g.hazards),ally:projected(g.allies)};
 // main.js exposes bossVisuals as a controller, but allyVisuals as its stats.
 const models={bosses:q.bossVisuals.stats.bosses,hazards:q.bossVisuals.stats.hazards,allies:q.allyVisuals.models};
 if(${JSON.stringify(scenario)}==='dense'&&(!positions.boss.some(p=>p.inViewport)||!positions.hazard.some(p=>p.inViewport)||!positions.ally.some(p=>p.inViewport)||models.bosses<1||models.hazards<1||models.allies<1))throw Error('dense scene not visibly populated '+JSON.stringify({positions,models}));
 const gl=q.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 const backend={version:gl.getParameter(gl.VERSION),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmaskedAvailable:!!ext,unmaskedVendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
 window.__E6_SETUP__={counts,positions,models,style:{rules,dialogWidth},backend};
 return window.__E6_SETUP__;
})()`;}
function phaseScript(phase){return `(async()=>{
 const q=__PLUSH_QA__,g=q.game,renderer=q.renderer;
 if(${JSON.stringify(phase)}==='paused')q.pause();else if(g.status==='paused')q.resume();
 const expected=${JSON.stringify(phase)}==='paused'?'paused':'running';
 await new Promise(r=>setTimeout(r,${config.settleMs}));
 const state=()=>({status:g.status,overlay:document.querySelector('#overlay').classList.contains('shown'),time:g.time,visibility:document.visibilityState,focus:document.hasFocus(),volume:q.settings.volume,audioUnlocked:q.audio.unlocked,camera:q.camera.matrixWorld.elements.slice()});
 const counts=()=>({enemies:g.enemies.length,bosses:g.enemies.filter(e=>e.boss).length,hazards:g.hazards.length,allies:g.allies.length,rescued:g.rescued.length});
 const before=state();before.counts=counts();if(before.status!==expected||before.overlay!==(expected==='paused')||before.volume!==0)throw Error('phase precondition failed '+JSON.stringify(before));
 const samples=[],transitions=[],renderErrors=[],original=renderer.render;let last=null,total=0;const started=performance.now();
 const onChange=e=>{if(transitions.length<32)transitions.push({type:e.type,t:performance.now(),visibility:document.visibilityState,focus:document.hasFocus()});};
 for(const n of ['blur','focus','visibilitychange'])window.addEventListener(n,onChange,true);
 window.__E7_PHASE__={phase:${JSON.stringify(phase)},samples,before,transitions,renderErrors};
 renderer.render=function(...args){const t=performance.now(),interval=last===null?null:t-last;last=t;let result;try{result=original.apply(this,args);}catch(e){if(renderErrors.length<16)renderErrors.push(String(e));throw e;}total++;
  if(samples.length<${config.sampleCap})samples.push({rafIntervalMs:interval,renderCpuMs:performance.now()-t,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,status:g.status});return result;};
 try{await new Promise(r=>setTimeout(r,${config.sampleMs}));}
 finally{renderer.render=original;for(const n of ['blur','focus','visibilitychange'])window.removeEventListener(n,onChange,true);}
 const elapsedMs=performance.now()-started,after=state();after.counts=counts();
 Object.assign(window.__E7_PHASE__,{elapsedMs,total,after});
 if(total>samples.length)throw Error('sample buffer overflow');
 if(renderErrors.length||transitions.length||before.focus!==after.focus||before.audioUnlocked!==after.audioUnlocked||JSON.stringify(before.counts)!==JSON.stringify(after.counts))throw Error('phase environment/scene changed');
 if(after.status!==expected||after.overlay!==(expected==='paused')||after.volume!==0||after.time!==before.time||after.visibility!==before.visibility||before.visibility!=='visible')throw Error('phase changed '+JSON.stringify({before,after}));
 return {phase:${JSON.stringify(phase)},expected,elapsedMs,total,samples,before,after,transitions,renderErrors,cameraMaxDelta:Math.max(...before.camera.map((v,i)=>Math.abs(v-after.camera[i]))),renderHz:total/(elapsedMs/1000),renderCpuMsPerSecond:samples.reduce((n,s)=>n+s.renderCpuMs,0)/(elapsedMs/1000)};
})()`;}
function phaseSummary(phase){
 const metrics={};for(const key of ['rafIntervalMs','renderCpuMs','calls','triangles']){
  const values=phase.samples.map(s=>s[key]).filter(v=>v!==null);
  metrics[key]=values.length?{median:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:Math.max(...values)}:null;
 }return metrics;
}
async function portRefused(port){
 if(!port)return true;
 return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});let done=false;const finish=value=>{if(done)return;done=true;socket.destroy();resolve(value);};
 socket.setTimeout(1000,()=>finish(false));socket.once('connect',()=>finish(false));socket.once('error',e=>finish(e.code==='ECONNREFUSED'));});
}
async function groupGone(pid){if(!pid)return true;try{process.kill(-pid,0);return false;}catch(e){return e.code==='ESRCH';}}
async function childExited(child,ms){if(!child||child.exitCode!==null||child.signalCode!==null)return true;return new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),ms);child.once('exit',()=>{clearTimeout(timer);resolve(true);});});}
async function measure(scenario,run){
 const deadline=Date.now()+config.roundDeadlineMs,remaining=()=>{if(interrupted)throw Error('interrupted '+interrupted);const ms=deadline-Date.now();if(ms<=0)throw Error('round deadline exceeded');return ms;};
 let server,chrome,profile,ws,evaluate,port=null,chromeLog='',roundError=null;const lifecycle={scenario,run,startedAt:new Date().toISOString(),runnerPid:process.pid};report.lifecycle.push(lifecycle);checkpoint();const pending=new Map();let seq=0;
 const abort=reason=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('aborted '+reason));}pending.clear();try{ws?.close();}catch{}if(chrome?.pid)try{process.kill(-chrome.pid,'SIGTERM');}catch{}};
 const roundTimer=setTimeout(()=>abort('round deadline'),config.roundDeadlineMs);
 abortCurrent=abort;
 try{
  server=http.createServer((req,res)=>{let rel,file;try{rel=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/, '')||'index.html';file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||fs.realpathSync(file).startsWith(root+path.sep)===false||!fs.statSync(file).isFile())throw Error('outside root');}catch{res.writeHead(404);res.end();return;}
   const ext=path.extname(file),mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.txt':'text/plain'}[ext]||'application/octet-stream';
   res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','no-store');fs.createReadStream(file).pipe(res);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  profile=fs.mkdtempSync(path.join(os.tmpdir(),'plush-e7-'));
  const args=['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'];
  if(requestedBackend==='swiftshader')args.splice(3,0,'--use-angle=swiftshader','--enable-unsafe-swiftshader');
  chrome=spawn(chromePath,args,{stdio:['ignore','ignore','pipe'],detached:true});
  Object.assign(lifecycle,{chromePid:chrome.pid,profile,httpPort:server.address().port,phase:'browser-started'});checkpoint();
  let spawnError=null;chrome.once('error',e=>{spawnError=e;abort('spawn error');});chrome.stderr.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-2000);});
  const bootEnd=Date.now()+Math.min(10000,remaining());
  while(Date.now()<bootEnd&&!port&&!spawnError&&!interrupted){await sleep(100);try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}}
  if(spawnError)throw spawnError;
  if(!port)throw Error(`Chrome DevTools port unavailable (exit=${chrome.exitCode}, signal=${chrome.signalCode}); stderr=${chromeLog.slice(-500)}`);
  Object.assign(lifecycle,{devToolsPort:port,phase:'devtools-ready'});checkpoint();
  const version=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(Math.min(10000,remaining()))}).then(r=>r.json());
  ws=new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('DevTools connect timeout')),Math.min(10000,remaining()));ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(Error('DevTools connection failed'));};});
  ws.onmessage=e=>{const msg=JSON.parse(e.data),p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);};
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout or round deadline'));abort(method+' timeout');},Math.min(30000,remaining()));pending.set(id,{resolve,reject,timer});try{ws.send(JSON.stringify({id,method,params,sessionId}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Page.enable',{},sessionId);await send('Runtime.enable',{},sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false},sessionId);
  evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
  await send('Page.addScriptToEvaluateOnNewDocument',{source: `localStorage.setItem('plush-rescue:settings',JSON.stringify({volume:0,quality:'balanced',hero:'pudding',stats:false}));`},sessionId);
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`},sessionId);
  const bootReadyEnd=Date.now()+Math.min(20000,remaining());let ready=false;
  while(Date.now()<bootReadyEnd){ready=await evaluate('Boolean(window.__PLUSH_QA__)').catch(()=>false);if(ready)break;remaining();await sleep(100);}if(!ready)throw Error('game did not boot within 20s');
  const fixture=await evaluate(fixtureScript(scenario));
  const warmupEnd=Date.now()+Math.min(30000,remaining());let warmup;
  while(Date.now()<warmupEnd){warmup=await evaluate('(()=>{const w=__PLUSH_QA__.shaderWarmup;return {ready:w.ready,error:w.error,runs:w.runs}})()');if(warmup.error)throw Error('shader warmup failed: '+warmup.error);if(warmup.ready)break;remaining();await sleep(100);}
  if(!warmup?.ready)throw Error('shader warmup not ready within 30s');
  const phases=[];report.partialRound={scenario,run,phases};checkpoint();
  for(const phase of ['running','paused','resumed']){
   lifecycle.phase=phase;checkpoint();
   const result=await evaluate(phaseScript(phase));
   if(result.elapsedMs<config.sampleMs||result.elapsedMs>config.sampleMs+5000||result.samples.some(s=>s.status!==result.expected||!Number.isFinite(s.renderCpuMs)||s.renderCpuMs<0||!Number.isFinite(s.calls)||!Number.isFinite(s.triangles)||s.calls<0||s.triangles<0||(s.rafIntervalMs!==null&&(!Number.isFinite(s.rafIntervalMs)||s.rafIntervalMs<0))))throw Error('invalid phase samples');
   if(phase!=='paused'&&result.total===0)throw Error('running phase produced no render samples');
   if(phases.length&&phases[0].before.audioUnlocked!==result.before.audioUnlocked)throw Error('audio context availability changed across phases');
   if(result.cameraMaxDelta>1e-5)throw Error('camera moved during phase');
   if(phases.length&&Math.max(...phases[0].before.camera.map((v,i)=>Math.abs(v-result.before.camera[i])))>1e-5)throw Error('camera differs across phases');
   phases.push({...result,summary:phaseSummary(result)});checkpoint();
   const screenshot=imageBase+'-'+scenario+'-'+run+'-'+phase+'.png';
   const png=await send('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(screenshot,Buffer.from(png.data,'base64'));
   phases.at(-1).screenshot=screenshot;checkpoint();
  }
  if(fixture.backend.buffer.join('x')!=='1280x720'||!fixture.backend.version?.includes('WebGL'))throw Error('WebGL/drawing buffer mismatch');
  const finalCounts=await evaluate("(()=>{const g=__PLUSH_QA__.game;return {enemies:g.enemies.length,bosses:g.enemies.filter(e=>e.boss).length,hazards:g.hazards.length,allies:g.allies.length,rescued:g.rescued.length}})()");
  if(JSON.stringify(finalCounts)!==JSON.stringify(fixture.counts))throw Error('fixture changed during sampling');
  return {scenario,run,fixture:fixture.counts,projection:fixture.positions,models:fixture.models,style:fixture.style,warmup,actualGL:fixture.backend,phases};
 }catch(error){roundError=error;lifecycle.error=String(error);
  if(evaluate&&Date.now()<deadline&&!interrupted)try{lifecycle.failurePhase=await evaluate('window.__E7_PHASE__||null');}catch(e){lifecycle.failureReadError=String(e);}
  checkpoint();throw error;}
 finally{
  clearTimeout(roundTimer);
  abortCurrent=null;abort('cleanup');
  const cleanupErrors=[];let browserStopped=!chrome?.pid;
  try{
   if(chrome?.pid){
    if(!await childExited(chrome,3000)){try{process.kill(-chrome.pid,'SIGKILL');}catch{}if(!await childExited(chrome,2000))cleanupErrors.push('Chrome did not exit');}
    for(let i=0;i<30&&!await groupGone(chrome.pid);i++){try{process.kill(-chrome.pid,'SIGKILL');}catch{}await sleep(100);}
    if(!await groupGone(chrome.pid))cleanupErrors.push('owned Chrome process group remains');
    for(let i=0;i<20&&!await portRefused(port);i++)await sleep(100);
    if(!await portRefused(port))cleanupErrors.push('owned DevTools port remains open');
    browserStopped=cleanupErrors.length===0;
   }
  }catch(error){cleanupErrors.push('browser cleanup: '+error.message);}
  try{
   if(server){server.closeAllConnections?.();await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('HTTP server close timeout')),3000);
    server.close(error=>{clearTimeout(timer);error?reject(error):resolve();});
   });}
  }catch(error){cleanupErrors.push('HTTP cleanup: '+error.message);}
  try{
   if(profile&&browserStopped){fs.rmSync(profile,{recursive:true,force:true});if(fs.existsSync(profile))throw Error('profile remains');}
   else if(profile)cleanupErrors.push('profile retained while Chrome or port may remain: '+profile);
  }catch(error){cleanupErrors.push('profile cleanup: '+error.message);}
  Object.assign(lifecycle,{finishedAt:new Date().toISOString(),browserStopped,chromeExitCode:chrome?.exitCode,chromeSignal:chrome?.signalCode,profileExists:profile?fs.existsSync(profile):false,cleanupErrors});checkpoint();
  if(cleanupErrors.length)throw Error(`cleanup failed: ${cleanupErrors.join('; ')}${roundError?'; original: '+roundError.message:''}`);
 }
}
try{
 for(const scenario of scenarios)for(let run=1;run<=config.runs;run++){
  if(interrupted)throw Error('interrupted '+interrupted);
  const result=await measure(scenario,run);report.scenarios.push(result);delete report.partialRound;report.actualBackend??=result.actualGL;checkpoint();
  if(JSON.stringify(result.actualGL)!==JSON.stringify(report.actualBackend))throw Error('actual backend changed across runs');
  console.error(`${scenario} run ${run}: ${result.phases.length} phases; renderer=${result.actualGL.unmaskedRenderer??result.actualGL.renderer}`);
 }
 report.actualBackendClass=classifyBackend(report.actualBackend);
 report.hardwareBudget='none: this baseline does not set energy or performance acceptance thresholds';
 report.success=true;
}catch(error){report.error=String(error?.stack??error);process.exitCode=1;}
checkpoint();
console.log(`${report.success?'PASS':'FAIL'} E7: ${report.scenarios.length}/${scenarios.length*config.runs} runs; ${output}`);
