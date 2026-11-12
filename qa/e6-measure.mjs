// E6 diagnostic, not a gate. Node 22+, Chrome, no packages.
// Run: CHROME=/path/to/Google\ Chrome node qa/e6-measure.mjs --backend=hardware --output=/tmp/e6.json
// A new browser/profile and fixed scene are used for each run. The samples
// distinguish rAF intervals, CPU time inside renderer.render, and WebGL counters.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const chromePath=process.env.CHROME;
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
const requestedBackend=process.argv.find(a=>a.startsWith('--backend='))?.slice(10);
if(!output||!chromePath||!fs.existsSync(chromePath))throw new Error('set CHROME and --output=FILE');
if(!['hardware','swiftshader'].includes(requestedBackend))throw new Error('pass --backend=hardware|swiftshader');
if(typeof WebSocket!=='function')throw new Error('Node 22+ global WebSocket required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const config={viewport:[1280,720],dpr:1,quality:'balanced',seed:20261112,warmupFrames:60,sampleFrames:180,runs:3,requestedBackend};
const scenarios=['ready','dense'];
const source={node:process.version,os:os.platform()+' '+os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model??null,
 chrome:execFileSync(chromePath,['--version'],{encoding:'utf8'}).trim(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
const report={schema:'e6-frame-v1',config,source,actualBackend:null,scenarios:[],limits:{rafP95Ms:16.7,kind:'provisional 60 Hz target; not a hardware acceptance gate'},hardwareBudget:'undetermined'};
function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];}
function summarize(samples){
 const fields=['rafIntervalMs','renderCpuMs','calls','triangles'];
 return Object.fromEntries(fields.map(key=>{const v=samples.map(x=>x[key]);return [key,{median:percentile(v,.5),p95:percentile(v,.95),p99:percentile(v,.99),max:Math.max(...v)}]}));
}
function fixtureScript(scenario){return `(()=>{
 const q=window.__PLUSH_QA__;if(!q||!q.renderer?.getContext())throw Error('game WebGL unavailable');
 q.setMap(0);q.quality('balanced');
 const g=q.game;let x=20261112;g.random=()=>((x=(Math.imul(1664525,x)+1013904223)>>>0)/4294967296);
 if(${JSON.stringify(scenario)}==='dense'){
  g.time=180;for(let i=0;i<24;i++){g.spawnEnemy();const e=g.enemies.at(-1);if(!e)throw Error('enemy spawn failed');const a=i*2.399963,r=2+(i%5);e.x=g.player.x+Math.cos(a)*r;e.z=g.player.z+Math.sin(a)*r;}
  for(const kind of ['mini','big'])if(!g.spawnBoss(kind,3))throw Error('boss spawn failed');
  const owners=g.enemies.filter(e=>e.boss);for(const owner of owners){g.addHazard(owner,owner.x,owner.z);g.addAlly(owner,0);}
  for(let i=0;i<8;i++)g.rescued.push({id:++g.serial,type:i%4,x:g.player.x+Math.cos(i)*2,z:g.player.z+Math.sin(i)*2,angle:0,life:3});
  g.events.length=0;
 }
 const counts={enemies:g.enemies.length,bosses:g.enemies.filter(e=>e.boss).length,hazards:g.hazards.length,allies:g.allies.length,rescued:g.rescued.length};
 if(${JSON.stringify(scenario)}==='dense'&&!(counts.enemies>=26&&counts.bosses===2&&counts.hazards===2&&counts.allies===2&&counts.rescued===8))throw Error('dense fixture incomplete '+JSON.stringify(counts));
 if(${JSON.stringify(scenario)}==='ready'&&counts.enemies!==0)throw Error('ready fixture not empty');
 g.step=()=>{};g.status='running';q.renderOnce();
 const gl=q.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 const backend={version:gl.getParameter(gl.VERSION),vendor:gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
 const samples=[],renderer=q.renderer,render=renderer.render.bind(renderer);let last=null,frame=0;
 renderer.render=(...args)=>{const t=performance.now(),interval=last===null?null:t-last;last=t;render(...args);const elapsed=performance.now()-t;
  if(frame++>=${config.warmupFrames}&&samples.length<${config.sampleFrames})samples.push({rafIntervalMs:interval,renderCpuMs:elapsed,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});};
 window.__E6__={counts,backend,samples,done:()=>samples.length===${config.sampleFrames}};
 return {counts,backend};
})()`;}
async function measure(scenario,run){
 let server,chrome,profile,ws,chromeLog='';const pending=new Map();let seq=0;
 try{
  server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/, '')||'index.html';const file=path.resolve(root,rel);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.setHeader('Cache-Control','no-store');fs.createReadStream(file).pipe(res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  profile=fs.mkdtempSync(path.join(os.tmpdir(),'plush-e6-'));
  const args=['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'];
  if(requestedBackend==='swiftshader')args.splice(3,0,'--use-angle=swiftshader','--enable-unsafe-swiftshader');
  chrome=spawn(chromePath,args,{stdio:['ignore','ignore','pipe'],detached:true});
  chrome.stderr.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-4000);});
  let port;for(let i=0;i<100&&!port;i++){await sleep(100);try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}}
  if(!port)throw Error(`Chrome DevTools port unavailable (exit=${chrome.exitCode}, signal=${chrome.signalCode}); stderr=${chromeLog.slice(-1000)}`);
  const version=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
  ws=new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('DevTools connection timeout')),10000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(Error('DevTools connection failed'));};});
  ws.onmessage=e=>{const msg=JSON.parse(e.data),p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);};
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,sessionId}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Page.enable',{},sessionId);await send('Runtime.enable',{},sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false},sessionId);
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`},sessionId);
  let ready=false;for(let i=0;i<150;i++){ready=await evaluate('Boolean(window.__PLUSH_QA__)').catch(()=>false);if(ready)break;await sleep(100);}if(!ready)throw Error('game did not boot');
  const fixture=await evaluate(fixtureScript(scenario));
  for(let i=0;i<450;i++){if(await evaluate('window.__E6__.done()'))break;await sleep(100);}
  const samples=await evaluate('window.__E6__.samples');
  if(samples.length!==config.sampleFrames)throw Error(`incomplete samples ${samples.length}/${config.sampleFrames}`);
  if(samples.some(s=>!Object.values(s).every(Number.isFinite)||s.calls<=0||s.triangles<=0))throw Error('invalid/empty render samples');
  if(fixture.backend.buffer.join('x')!=='1280x720')throw Error('drawing buffer mismatch');
  if(!fixture.backend.version?.includes('WebGL')||!fixture.backend.renderer)throw Error('actual WebGL backend unavailable');
  const finalCounts=await evaluate("(()=>{const g=__PLUSH_QA__.game;return {enemies:g.enemies.length,bosses:g.enemies.filter(e=>e.boss).length,hazards:g.hazards.length,allies:g.allies.length,rescued:g.rescued.length}})()");
  if(JSON.stringify(finalCounts)!==JSON.stringify(fixture.counts))throw Error('fixture changed during sampling');
  return {scenario,run,fixture:fixture.counts,actualGL:fixture.backend,samples,summary:summarize(samples)};
 }finally{
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closing'));}pending.clear();
  try{ws?.close();}catch{}
  if(chrome?.pid){try{process.kill(-chrome.pid,'SIGTERM');}catch{}await sleep(500);try{process.kill(-chrome.pid,'SIGKILL');}catch{}}
  if(server){server.closeAllConnections?.();await new Promise(r=>server.close(r));}
  if(profile)fs.rmSync(profile,{recursive:true,force:true});
 }
}
try{
 for(const scenario of scenarios)for(let run=1;run<=config.runs;run++){
  const result=await measure(scenario,run);report.scenarios.push(result);report.actualBackend??=result.actualGL;
  if(JSON.stringify(result.actualGL)!==JSON.stringify(report.actualBackend))throw Error('actual backend changed across runs');
  console.error(`${scenario} run ${run}: ${result.samples.length} samples; renderer=${result.actualGL.renderer}`);
 }
 report.actualBackendClass=/swiftshader|llvmpipe|software rasterizer/i.test(report.actualBackend.renderer)?'software-or-emulated':'reported-hardware-renderer';
 report.hardwareBudget=report.actualBackendClass==='reported-hardware-renderer'?'observed on this desktop only; budget thresholds require review':'undetermined: no hardware-renderer measurements';
 report.success=true;
}catch(error){report.error=String(error?.stack??error);process.exitCode=1;}
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`${report.success?'PASS':'FAIL'} E6: ${report.scenarios.length}/${scenarios.length*config.runs} runs; ${output}`);
