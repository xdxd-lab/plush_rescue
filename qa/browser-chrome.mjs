// Real-browser check in headless Google Chrome: real WebGL (SwiftShader), real
// CSS layout, real pointer/touch events sent through the DevTools protocol.
// It covers what the Node stubs cannot: HUD boxes from real layout, label-end
// taps against the real render, slow mouse clicks, a busy main thread, settings
// rounds through the real pause menu, reloads and blocked/separate storage.
// Not covered: Safari/WebKit, Firefox, physical phones, GPU drivers, native
// <select> popups (changed by setting value + dispatching change).
//
// Needs Google Chrome and Node 22+ (global WebSocket); on Node 20 add
// --experimental-websocket. Run from the repository root:
//   node qa/browser-chrome.mjs [--shots=DIR] [--views=WxH,...] [--dialogs] [--no-pickup]
// Default: the four main viewports (1280x720, 390x844, 360x640, 844x390) plus the
// storage contexts. --views also accepts the extra sizes 568x320 and 800x600.
// --dialogs adds the dialog reachability measurements; --no-pickup skips the rest.
//
// Lifecycle: a running check cannot be cancelled in place (its CDP calls and timers keep
// going), so a check that exceeds CHECK_TIMEOUT_MS (default 240000) aborts the whole run:
// pending and later DevTools requests are rejected, the connection is closed, Chrome's
// process group is killed, the remaining checks are reported as not run, and the run exits 1.
// Every DevTools request has its own limit, CDP_TIMEOUT_MS (default 60000), with the same
// abort. Checks reached after an abort are reported as not run; page work between checks
// (screenshots, closing or opening pages) is refused too, which ends the schedule, so checks
// never reached are not listed (the report still carries "aborted" and "fatal"). Setup is
// bounded by SETUP_TIMEOUT_MS (default 15000) for the DevTools /json/version request and the
// WebSocket handshake. Chrome, the local server and the temporary profile are removed on
// every exit path the process can observe: success, failed assertions, setup errors,
// uncaught errors and SIGINT/SIGTERM/SIGHUP (not SIGKILL).
// --self-test=timeout|cdp|assert|setup|handshake-http|handshake-ws|signal runs a short
// lifecycle probe instead of the game checks.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const CHROME=process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shots=process.argv.find(a=>a.startsWith('--shots='))?.slice(8);
// --views=390x844,844x390 limits the per-viewport part to the named sizes.
const onlyViews=process.argv.find(a=>a.startsWith('--views='))?.slice(8).split(',');
const runDialogs=process.argv.includes('--dialogs'),runPickup=!process.argv.includes('--no-pickup');
const CHECK_TIMEOUT_MS=Number(process.env.CHECK_TIMEOUT_MS||240000),CDP_TIMEOUT_MS=Number(process.env.CDP_TIMEOUT_MS||60000),SETUP_TIMEOUT_MS=Number(process.env.SETUP_TIMEOUT_MS||15000);
const selfTest=process.argv.find(a=>a.startsWith('--self-test='))?.slice(12);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(typeof WebSocket!=='function'){console.error('Needs a global WebSocket: Node 22+, or Node 20 with --experimental-websocket');process.exit(2);}
if(!fs.existsSync(CHROME)){console.error('Google Chrome not found; set CHROME=/path/to/chrome');process.exit(2);}

// ---- lifecycle: one abort switch, one idempotent cleanup -----------------------------------
let server=null,chrome=null,profile=null,ws=null,origin=null,seq=0,blackhole=null;
const pending=new Map(),listeners=new Set(),run={aborted:null,cdpAfterAbort:0};
function rejectPending(reason){for(const p of pending.values())p.reject(new Error(reason));pending.clear();}
const exited=(child,ms)=>new Promise(r=>{if(child.exitCode!==null||child.signalCode!==null)return r(true);const t=setTimeout(()=>r(false),ms);child.once('exit',()=>{clearTimeout(t);r(true);});});
async function stopBrowser(){
 rejectPending(`run stopped${run.aborted?': '+run.aborted:''}`);
 try{ws?.close();}catch{}
 if(chrome&&chrome.exitCode===null&&chrome.signalCode===null){
  // Chrome runs in its own process group (detached), so helpers go with the browser.
  try{process.kill(-chrome.pid,'SIGTERM');}catch{}
  if(!await exited(chrome,3000)){try{process.kill(-chrome.pid,'SIGKILL');}catch{}await exited(chrome,2000);}
 }
 // Helpers can outlive the browser for a moment and still write to the profile: kill the
 // rest of the group and wait until it is empty (kill(-pgid, 0) fails once nothing is left).
 if(chrome){try{process.kill(-chrome.pid,'SIGKILL');}catch{}for(let i=0;i<30;i++){try{process.kill(-chrome.pid,0);}catch{break;}await sleep(100);}}
}
// Stop everything the run started; later CDP calls from a still-running check are refused.
async function abortRun(reason){if(run.aborted)return;run.aborted=reason;console.error(`ABORT ${reason}`);await stopBrowser();}
let cleaning=null;
function cleanup(){
 return cleaning??=(async()=>{
  await stopBrowser();
  if(server){server.closeAllConnections?.();await new Promise(r=>server.close(()=>r()));}
  if(blackhole){for(const sock of blackhole.sockets)sock.destroy();await new Promise(r=>blackhole.close(()=>r()));}
  // Chrome may still be writing while it exits; remove until the directory is really gone.
  const removeProfile=async()=>{for(let i=0;profile&&i<10&&fs.existsSync(profile);i++){try{fs.rmSync(profile,{recursive:true,force:true});}catch{}if(fs.existsSync(profile))await sleep(300);}};
  await removeProfile();if(profile){await sleep(500);await removeProfile();}
  if(profile&&fs.existsSync(profile))console.error('could not remove '+profile);
 })();
}
for(const sig of ['SIGINT','SIGTERM','SIGHUP'])process.on(sig,()=>{console.error(`signal ${sig}: cleaning up`);run.aborted??=`signal ${sig}`;cleanup().finally(()=>process.exit(130));});
for(const ev of ['uncaughtException','unhandledRejection'])process.on(ev,e=>{console.error(`${ev}: ${e?.stack||e}`);run.aborted??=ev;cleanup().finally(()=>process.exit(1));});

// ---- static server for the repository root -------------------------------------------
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.txt':'text/plain; charset=utf-8'};
async function setup(){
server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/,'')||'index.html',file=path.join(root,rel);
 if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
origin=`http://127.0.0.1:${server.address().port}`;

// ---- Chrome + DevTools protocol -------------------------------------------------------
profile=fs.mkdtempSync(path.join(os.tmpdir(),'plush-chrome-'));console.error(`profile ${profile}`);
chrome=spawn(CHROME,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check','--disable-breakpad','--disable-crash-reporter','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank'],{stdio:'ignore',detached:true});
let port=null;for(let i=0;i<100&&!port;i++){await sleep(100);try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{}}
assert.ok(port,'Chrome did not open a DevTools port');
// Both handshake steps are bounded; a failure throws and the caller's finally cleans up.
// --self-test=handshake-http / handshake-ws point one step at a socket that never answers.
if(selfTest?.startsWith('handshake-')){blackhole=net.createServer(sock=>blackhole.sockets.add(sock));blackhole.sockets=new Set();await new Promise(r=>blackhole.listen(0,'127.0.0.1',r));}
const hole=blackhole&&`127.0.0.1:${blackhole.address().port}`;
const version=await fetch(`http://${selfTest==='handshake-http'?hole:'127.0.0.1:'+port}/json/version`,{signal:AbortSignal.timeout(SETUP_TIMEOUT_MS)}).then(r=>r.json()).catch(e=>{throw new Error(`DevTools /json/version failed within ${SETUP_TIMEOUT_MS} ms: ${e.message}`);});
const wsUrl=selfTest==='handshake-ws'?`ws://${hole}/devtools/browser/x`:version.webSocketDebuggerUrl;
ws=new WebSocket(wsUrl);
await new Promise((r,j)=>{const t=setTimeout(()=>j(new Error(`DevTools WebSocket did not open within ${SETUP_TIMEOUT_MS} ms`)),SETUP_TIMEOUT_MS);ws.onopen=()=>{clearTimeout(t);r();};ws.onerror=()=>{clearTimeout(t);j(new Error('DevTools WebSocket failed to open'));};});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(p.method+' '+m.error.message)):p.resolve(m.result);}else for(const l of listeners)l(m);};
ws.onclose=()=>{rejectPending('DevTools connection closed');if(!cleaning&&!run.aborted)abortRun('DevTools connection closed');};
if(selfTest==='setup')throw new Error('self-test: setup failure after Chrome started');
}
// Every request is bounded; a request that times out means the connection can no longer be
// trusted, so the whole run is aborted. Nothing is sent once the run is aborted.
function send(method,params={},sessionId){
 if(run.aborted){run.cdpAfterAbort++;return Promise.reject(new Error(`${method} refused: run aborted (${run.aborted})`));}
 return new Promise((resolve,reject)=>{const id=++seq;
  const timer=setTimeout(()=>{if(!pending.has(id))return;pending.delete(id);reject(new Error(`${method} timed out after ${CDP_TIMEOUT_MS} ms`));abortRun(`CDP ${method} timed out after ${CDP_TIMEOUT_MS} ms`);},CDP_TIMEOUT_MS);
  pending.set(id,{method,resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  try{ws.send(JSON.stringify({id,method,params,sessionId}));}catch(e){pending.get(id)?.reject(e);pending.delete(id);}
 });
}

const errors=[],scrolled=new Set();
async function openPage({width,height,mobile=false,scale=1,context=null,blockStorage=false}){
 const {targetId}=await send('Target.createTarget',{url:'about:blank',...(context?{browserContextId:context}:{})});
 const {sessionId:s}=await send('Target.attachToTarget',{targetId,flatten:true});
 listeners.add(m=>{if(m.sessionId!==s)return;
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value??a.description).join(' '));});
 await send('Runtime.enable',{},s);await send('Page.enable',{},s);
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile},s);
 if(mobile)await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},s);
 if(blockStorage)await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}});"},s);
 const page={s,targetId,
  eval:async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},s);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;},
  async load(){await send('Page.navigate',{url:origin+'/index.html'},s);await page.ready();},
  async reload(){await send('Page.reload',{ignoreCache:true},s);await sleep(200);await page.ready();},
  async ready(){for(let i=0;i<150;i++){if(run.aborted)throw new Error(`page not ready: run aborted (${run.aborted})`);try{if(await page.eval("document.readyState==='complete'&&!!window.__PLUSH_QA__"))break;}catch{}await sleep(100);}await page.eval(HELPERS+";0");await page.frames(3);},
  frames:(n=2)=>page.eval(`new Promise(r=>{let k=${n};const f=()=>--k<=0?r():requestAnimationFrame(f);requestAnimationFrame(f);})`),
  // Input carries explicit hardware-style timestamps (seconds since epoch), as real
  // devices do; otherwise Chrome stamps each event when it gets through a slow
  // software-rendered frame, which would turn an 80 ms tap into a 500 ms one.
  async mouse(x,y,{holdMs=0}={}){
   const t0=Date.now()/1000,hold=holdMs||80;
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,timestamp:t0-.02},s);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1,timestamp:t0},s);
   const left=t0*1000+hold-Date.now();if(left>0)await sleep(left);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1,timestamp:t0+hold/1000},s);
  },
  // CDP touch semantics (verified in Chrome 156): touchStart/touchMove list the points that
  // are down; touchEnd lists the points being released (an empty list releases all).
  async touch(points,type,timestamp=Date.now()/1000){await send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id})),timestamp},s);},
  async tap(x,y,{holdMs=0,id=7}={}){
   const t0=Date.now()/1000,hold=holdMs||80;await page.touch([[x,y,id]],'touchStart',t0);
   const left=t0*1000+hold-Date.now();if(left>0)await sleep(left);await page.touch([[x,y,id]],'touchEnd',t0+hold/1000);
  },
  // Dialog buttons are scrolled into view first, as a user would; record when that was needed.
  async click(selector){const r=await page.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});let b=e.getBoundingClientRect();const hidden=b.bottom>innerHeight||b.top<0;if(hidden){e.scrollIntoView({block:'nearest'});b=e.getBoundingClientRect();}return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,hidden};})()`);assert.ok(r.w>0,selector+' is laid out');
   if(r.hidden)scrolled.add(`${width}x${height} ${selector}`);
   if(mobile)await page.tap(r.x,r.y,{id:11});else await page.mouse(r.x,r.y);await page.frames(2);},
  async shot(name){if(!shots)return;fs.mkdirSync(shots,{recursive:true});const {data}=await send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync(path.join(shots,name+'.png'),Buffer.from(data,'base64'));},
  close:()=>send('Target.closeTarget',{targetId}),
 };
 await page.load();return page;
}

// In-page helpers: projection with the live camera, ground picking, a quiet arena.
const HELPERS=`window.__T={
 G:{ringY:.09,ringRadius:.58,floatY:.70,labelY:1.48,labelWidth:2.5,labelHeight:.73},
 get qa(){return window.__PLUSH_QA__},
 V(x=0,y=0,z=0){return new (this.qa.camera.position.constructor)(x,y,z)},
 rect(){return document.querySelector('#world').getBoundingClientRect()},
 calm(){const g=this.qa.game;g.enemies.length=0;g.drops.length=0;g.spawn=1e9;g.dropTimer=1e9;g.invuln=1e9;g.nextBossMinute=1e9;},
 add(id,x,z){return this.qa.game.addDrop({kind:'weapon',weaponId:id,x,z})},
 near(id,dx,dz){const p=this.qa.game.player;return this.add(id,p.x+dx,p.z+dz)},
 screen(x,y,z){const c=this.qa.camera,r=this.rect(),v=this.V(x,y,z).project(c);return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height}},
 label(d,fx,fy=0){const c=this.qa.camera,R=this.V().setFromMatrixColumn(c.matrixWorld,0).normalize(),U=this.V().setFromMatrixColumn(c.matrixWorld,1).normalize(),w=fx*this.G.labelWidth/2,h=fy*this.G.labelHeight/2;
  return this.screen(d.x+R.x*w+U.x*h,this.G.labelY+R.y*w+U.y*h,d.z+R.z*w+U.z*h)},
 ground(px,py,y){const c=this.qa.camera,r=this.rect(),p=this.V((px-r.left)/r.width*2-1,-(py-r.top)/r.height*2+1,.5).unproject(c),d=p.sub(c.position).normalize(),t=(y-c.position.y)/d.y;return {x:c.position.x+d.x*t,z:c.position.z+d.z*t}},
 state(){const g=this.qa.game;return {status:g.status,pending:g.pendingPickup?.id??null,drops:g.drops.map(d=>d.id)}},
 box(sel){const b=document.querySelector(sel).getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}},
};`;

const results=[],dialogs=[];let lastDiag=null;
// A check that fails an assertion just fails. A check that exceeds CHECK_TIMEOUT_MS cannot be
// cancelled (Promise.race only stops waiting), so the run is aborted: its browser work is cut
// off and no later check starts on a page it may still be touching.
class CheckTimeout extends Error{}
async function check(name,fn){
 if(run.aborted){results.push({name,ok:false,notRun:true,error:`not run: ${run.aborted}`});console.error(`SKIP ${name} (not run: ${run.aborted})`);return;}
 const t0=Date.now();lastDiag=null;let timer;
 const work=Promise.resolve().then(fn);work.catch(()=>{});
 try{await Promise.race([work,new Promise((_,j)=>{timer=setTimeout(()=>j(new CheckTimeout(`timed out after ${CHECK_TIMEOUT_MS} ms`)),CHECK_TIMEOUT_MS);})]);results.push({name,ok:true,ms:Date.now()-t0});}
 catch(e){results.push({name,ok:false,error:e.message,diag:lastDiag,ms:Date.now()-t0});if(e instanceof CheckTimeout)await abortRun(`check "${name}" timed out after ${CHECK_TIMEOUT_MS} ms`);}
 finally{clearTimeout(timer);const r=results.at(-1);console.error(`${r.ok?'ok  ':'FAIL'} ${r.ms??''}ms ${r.name}${r.ok?'':' :: '+String(r.error).split('\n')[0]}`);}}
async function begin(page,mobile){await page.click('#start');assert.equal(await page.eval('__T.qa.game.status'),'running','game started by a real click/tap');await page.eval('__T.calm()');await page.frames(2);}
async function settle(page){if(await page.eval("__T.qa.game.status==='pickup'"))await page.click('#keepWeapon');assert.equal(await page.eval('__T.qa.game.status'),'running');}
async function tapAt(page,p,{mobile,holdMs=0}={}){
 if(mobile)await page.tap(p.x,p.y,{holdMs});
 else await page.mouse(p.x,p.y,{holdMs});
 await page.frames(3);return page.eval('__T.state()');
}
// Drop placed, drawn, then tapped at `where`; returns whether that drop was taken.
async function tapDrop(page,{mobile,dx=2,dz=1.5,where='labelRight',holdMs=0,weapon='shotgun'}){
 const id=await page.eval(`__T.near('${weapon}',${dx},${dz}).id`);await page.frames(3);
 const p=await page.eval(`(()=>{const d=__T.qa.game.drops.find(d=>d.id===${id});return ${JSON.stringify(where)}==='ring'?__T.screen(d.x+__T.G.ringRadius*.7,__T.G.ringY,d.z):${JSON.stringify(where)}==='item'?__T.screen(d.x,__T.G.floatY,d.z):__T.label(d,${where==='labelLeft'?-.95:where==='labelRight'?.95:0});})()`);
 const st=await tapAt(page,p,{mobile,holdMs});const taken=st.pending===id||(!st.drops.includes(id)&&st.status==='running');
 if(!taken)lastDiag=await page.eval(`(async()=>{const ui=await import('/ui.js'),g=__T.qa.game,d=g.drops.find(d=>d.id===${id}),covers=[...document.querySelectorAll(ui.HUD_OCCLUDERS)],q=${JSON.stringify(p)};
  return {where:${JSON.stringify(where)},tap:q,player:{x:g.player.x,z:g.player.z},drop:d&&{x:d.x,z:d.z,life:d.life},drawn:d?__T.qa.weaponVisuals.drawnDrops().get(d.id)??null:'gone',coveredBy:covers.filter(e=>ui.pointCovered(q,[e])).map(e=>e.id||e.className),hit:document.elementFromPoint(q.x,q.y)?.id,state:__T.state()}})()`);
 await settle(page);await page.eval('__T.qa.game.drops.length=0');await page.frames(2);return taken;
}

async function runAll(){
const VIEWS=[{name:'desktop 1280x720',width:1280,height:720},{name:'portrait 390x844',width:390,height:844,mobile:true,scale:3},{name:'small portrait 360x640',width:360,height:640,mobile:true,scale:2},{name:'landscape 844x390',width:844,height:390,mobile:true,scale:3},
 {name:'small landscape 568x320',width:568,height:320,mobile:true,scale:2,extra:true},{name:'short laptop 800x600',width:800,height:600,extra:true}];

for(const view of runPickup?VIEWS.filter(v=>onlyViews?onlyViews.includes(`${v.width}x${v.height}`):!v.extra):[]){
 // Each viewport gets its own browser context: localStorage is per context and origin, and the
 // settings rounds below toggle stats an odd number of times, so a shared context would hand
 // the next viewport the opposite starting value.
 const {browserContextId}=await send('Target.createBrowserContext');
 const page=await openPage({...view,context:browserContextId}),mobile=!!view.mobile;
 await check(`${view.name}: boots with WebGL, revision and no errors`,async()=>{
  const info=await page.eval("({rev:__T.qa.revision,build:document.querySelector('#game').dataset.build,gl:!!document.querySelector('#world').getContext('webgl2')||!!__T.qa.renderer.getContext(),w:document.querySelector('#world').clientWidth,h:document.querySelector('#world').clientHeight})");
  const {revision}=JSON.parse(fs.readFileSync(path.join(root,'build-info.json'),'utf8'));
  assert.equal(info.rev,revision);assert.equal(info.build,revision);assert.ok(info.gl);assert.equal(info.w,view.width);assert.equal(info.h,view.height);
 });
 await page.shot(view.name.split(' ')[0]+'-title');
 await check(`${view.name}: start, then ring, item and both label ends are tappable`,async()=>{
  await begin(page,mobile);
  for(const where of ['ring','item','labelLeft','labelRight'])assert.ok(await tapDrop(page,{mobile,where}),where);
 });
 await check(`${view.name}: far drop on screen (label hidden) is tappable`,async()=>{
  // Find an offset beyond the 8.5-unit label distance whose item is on screen, clear of the
  // edges and of every opaque HUD panel, so the case works in every framing.
  const far=await page.eval(`(async()=>{const ui=await import('/ui.js'),r=__T.rect(),p=__T.qa.game.player,covers=[...document.querySelectorAll(ui.HUD_OCCLUDERS)];
   for(let k=9;k<=16;k+=.5)for(let a=0;a<24;a++){const dx=Math.cos(a/24*Math.PI*2)*k,dz=Math.sin(a/24*Math.PI*2)*k;
    const s=__T.screen(p.x+dx,__T.G.floatY,p.z+dz),g=__T.screen(p.x+dx,__T.G.ringY,p.z+dz),m=24;
    if([s,g].every(q=>q.x>m&&q.x<r.width-m&&q.y>m&&q.y<r.height-m)&&!ui.pointCovered(s,covers))return [dx,dz];}
   return null;})()`);
  assert.ok(far,'a visible, uncovered spot beyond 8.5 units exists');
  assert.ok(await tapDrop(page,{mobile,dx:far[0],dz:far[1],where:'item',weapon:'burst'}));
 });
 await check(`${view.name}: opaque weapon card blocks the drop under it, the uncovered part still works`,async()=>{
  const card=await page.eval("__T.box('.weapon-card')");assert.ok(card.width>0&&card.height>0,'card laid out');
  const x=card.left+card.width/2,at=await page.eval(`__T.ground(${x},${card.top},__T.G.floatY)`);
  const id=await page.eval(`__T.add('ember',${at.x},${at.z}).id`);await page.frames(3);
  // Exact pixels on the drop's real hit area: one inside the card, one just above it.
  const spots=await page.eval(`(async()=>{const ui=await import('/ui.js'),c=__T.qa.camera,r=__T.rect(),d=__T.qa.game.drops.find(d=>d.id===${id});
   const project=(x,y,z)=>{const v=__T.V(x,y,z).project(c);return v.z>1||v.z<-1?null:{x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height,z:v.z}};
   const axes={right:__T.V().setFromMatrixColumn(c.matrixWorld,0).normalize(),up:__T.V().setFromMatrixColumn(c.matrixWorld,1).normalize()};
   const shape=ui.dropHitShape(d,project,axes,{left:r.left,top:r.top,width:r.width,height:r.height},{labelVisible:Math.hypot(d.x-__T.qa.game.player.x,d.z-__T.qa.game.player.z)<8.5});
   const covers=[...document.querySelectorAll(ui.HUD_OCCLUDERS)],on=q=>ui.pickDropAt({...q,type:'touch'},[shape],{margin:0});
   let inside=null,above=null;
   for(let y=${card.top}+3;y<${card.bottom}&&!inside;y++){const q={x:${x},y};if(on(q))inside=q;}
   for(let y=${card.top}-3;y>${card.top}-120&&!above;y--){const q={x:${x},y};if(on(q)&&!ui.pointCovered(q,covers))above=q;}
   return {inside,above};})()`);
  assert.ok(spots.inside&&spots.above,JSON.stringify(spots));
  let st=await tapAt(page,spots.inside,{mobile});assert.ok(st.drops.includes(id)&&st.status==='running','covered tap ignored');
  st=await tapAt(page,spots.above,{mobile});assert.equal(st.pending??(st.drops.includes(id)?null:id),id,'uncovered tap above the card');
  await settle(page);await page.eval('__T.qa.game.drops.length=0');
 });
 await page.shot(view.name.split(' ')[0]+'-game');
 await check(`${view.name}: five rounds of pause, settings and resume through the real menu`,async()=>{
  const qualities=['high','low','balanced','high','low'];
  for(let round=0;round<5;round++){
   if(round%2)await page.eval("window.dispatchEvent(new Event('blur'))");else await page.click('#pause');
   assert.equal(await page.eval('__T.qa.game.status'),'paused',`round ${round} paused`);
   await page.eval(`(()=>{const q=document.querySelector('#quality');q.value='${qualities[round]}';q.dispatchEvent(new Event('change'));const h=document.querySelector('#nextHero');h.value='${round%2?'pudding':'polar'}';h.dispatchEvent(new Event('change'));})()`);
   // Each tap on the checkbox must toggle it once and store the new value right away.
   const before=await page.eval("document.querySelector('#showStats').checked");
   await page.eval("(()=>{window.__w=[];if(Storage.prototype.__wrapped)return;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){(window.__w||[]).push([k,v,Math.round(performance.now())]);return set.call(this,k,v)};Storage.prototype.__wrapped=1;})()");
   await page.click('#showStats');
   const after=await page.eval("({checked:document.querySelector('#showStats').checked,stored:JSON.parse(localStorage.getItem('plush-rescue:settings')||'{}').stats,writes:__w,box:(()=>{const b=document.querySelector('#showStats').getBoundingClientRect();return [Math.round(b.top),Math.round(b.bottom)]})()})");
   if(after.checked===before||after.stored!==after.checked)lastDiag={round,before,...after};
   assert.equal(after.checked,!before,`round ${round}: the tap toggled the checkbox once`);
   assert.equal(after.stored,after.checked,`round ${round}: stored stats matches the checkbox`);
   await page.click('#resume');assert.equal(await page.eval('__T.qa.game.status'),'running',`round ${round} resumed`);
   const [dx,dz]=[[2,1.5],[-2.5,1],[1.8,-1.8],[-1.6,2],[2.4,-1.2]][round];
   assert.ok(await tapDrop(page,{mobile,where:round%2?'labelLeft':'labelRight',dx,dz}),`round ${round} tap`);
  }
  const saved=await page.eval('__T.qa.settings');assert.deepEqual({q:saved.quality,h:saved.hero},{q:'low',h:'polar'});
 });
 if(!mobile){
  await check(`${view.name}: a slow 600 ms mouse click picks; a 900 ms hold does not`,async()=>{
   assert.ok(await tapDrop(page,{mobile,where:'item',holdMs:600}),'600 ms');
   assert.equal(await tapDrop(page,{mobile,where:'item',holdMs:900}),false,'900 ms');
  });
  await check(`${view.name}: a quick click is still a click while the main thread is blocked for 900 ms`,async()=>{
   const id=await page.eval("__T.near('shotgun',2,1.5).id");await page.frames(3);
   const p=await page.eval(`__T.screen(__T.qa.game.drops[0].x,__T.G.floatY,__T.qa.game.drops[0].z)`);
   await page.eval("window.__lag=[];addEventListener('pointerdown',e=>{__lag.push(['down',e.timeStamp,performance.now()]);setTimeout(()=>{const t=performance.now();while(performance.now()-t<900);},0);},{once:true,capture:true});addEventListener('pointerup',e=>__lag.push(['up',e.timeStamp,performance.now()]),{once:true,capture:true});");
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y},page.s);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1},page.s);
   await sleep(120);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,clickCount:1},page.s);
   await page.frames(3);const lag=await page.eval('__lag');const st=await page.eval('__T.state()');
   const byStamp=lag[1][1]-lag[0][1],byHandler=lag[1][2]-lag[0][2];
   results.push({name:'  timing evidence',ok:true,note:`timeStamp ${byStamp.toFixed(0)} ms vs handler time ${byHandler.toFixed(0)} ms`});
   assert.ok(byHandler>700,'the handler really ran late');assert.ok(byStamp<700,'input time stayed short');assert.equal(st.pending,id);
   await settle(page);await page.eval('__T.qa.game.drops.length=0');
  });
  await check(`${view.name}: a 15 px mouse drag from a drop does not pick it`,async()=>{
   const id=await page.eval("__T.near('shotgun',2,1.5).id");await page.frames(3);
   const p=await page.eval('__T.screen(__T.qa.game.drops[0].x,__T.G.floatY,__T.qa.game.drops[0].z)');
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1},page.s);
   for(let i=1;i<=3;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+i*5,y:p.y,buttons:1},page.s);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+15,y:p.y,button:'left',buttons:0,clickCount:1},page.s);
   await page.frames(3);const st=await page.eval('__T.state()');assert.ok(st.drops.includes(id)&&st.status==='running');await page.eval('__T.qa.game.drops.length=0');
  });
 }else{
  await check(`${view.name}: second finger taps a label end while the first finger keeps the stick`,async()=>{
   // Auto-equip, so no dialog opens (a dialog clears the stick by design, as in the Node smoke).
   // The first finger holds still while the second taps, so the camera does not move between
   // reading the label position and the tap on a slow software-rendered frame.
   await page.eval('__T.qa.game.autoEquip=true');
   const id=await page.eval("__T.near('shotgun',2,1.5).id");await page.frames(3);
   const a={x:40,y:view.height*.62};
   await page.touch([[a.x,a.y,1]],'touchStart');await page.frames(2);
   try{
    const p=await page.eval('__T.label(__T.qa.game.drops[0],.95)'),t0=Date.now()/1000;
    await page.touch([[a.x,a.y,1],[p.x,p.y,2]],'touchStart',t0);await page.touch([[p.x,p.y,2]],'touchEnd',t0+.08);await page.frames(3);
    const st=await page.eval("({...__T.state(),main:__T.qa.game.loadout.main,stick:document.querySelector('#stick').style.display})");
    assert.ok(!st.drops.includes(id)&&st.status==='running'&&st.main==='shotgun',`second finger picked: ${JSON.stringify(st)}`);
    assert.equal(st.stick,'block','the first finger still holds the stick');
    const before=await page.eval('({...__T.qa.game.player})');
    await page.touch([[a.x+40,a.y+20,1]],'touchMove');await page.frames(5);
    const after=await page.eval('({...__T.qa.game.player})');
    assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.05,'first finger still moves the hero');
   }finally{await page.touch([],'touchEnd').catch(()=>{});await page.eval('__T.qa.game.autoEquip=false;__T.qa.game.drops.length=0');await page.frames(2);}
  });
 }
 await check(`${view.name}: settings and auto-equip survive a reload; the run does not`,async()=>{
  await page.click('#pause');await page.eval("(()=>{const v=document.querySelector('#volume');v.value='0.65';v.dispatchEvent(new Event('input'));})()");
  if(!await page.eval("document.querySelector('#autoEquip').checked"))await page.click('#autoEquip');
  const storedBeforeReload=await page.eval("localStorage.getItem('plush-rescue:settings')");lastDiag={storedBeforeReload};
  await page.reload();
  const s=await page.eval("({settings:__T.qa.settings,hero:document.querySelector('#heroSelect').value,auto:localStorage.getItem('plush-rescue:auto-equip'),status:__T.qa.game.status,time:__T.qa.game.time,stats:!document.querySelector('#stats').hidden})");
  // Restore first (what was stored comes back), then the expected values of this viewport's run.
  assert.deepEqual(s.settings,JSON.parse(storedBeforeReload),'reload restores what was stored');
  assert.deepEqual(s.settings,{quality:'low',volume:.65,hero:'polar',stats:true,autoChoose:false});assert.equal(s.auto,'true');assert.equal(s.status,'ready');assert.equal(s.time,0);assert.equal(s.stats,true);assert.equal(s.hero,'polar');
 });
 await page.close();await send('Target.disposeBrowserContext',{browserContextId});
}

if(runPickup&&!onlyViews)await check('a separate browser profile context starts from defaults (storage is per profile and origin)',async()=>{
 const {browserContextId}=await send('Target.createBrowserContext');let page,failed;
 try{
  page=await openPage({width:800,height:600,context:browserContextId});
  assert.deepEqual(await page.eval('__T.qa.settings'),{quality:'balanced',volume:.25,hero:'pudding',stats:false,autoChoose:false});
 }catch(e){failed=e}
 try{await page?.close();}catch(e){failed??=e}
 try{await send('Target.disposeBrowserContext',{browserContextId});}catch(e){failed??=e}
 if(failed)throw failed;
});
if(runPickup&&!onlyViews)await check('blocked localStorage: the game runs, settings work for the session, a reload falls back to defaults',async()=>{
 const {browserContextId}=await send('Target.createBrowserContext');let page,failed;
 try{
  page=await openPage({width:800,height:600,context:browserContextId,blockStorage:true});
  assert.equal(await page.eval("(()=>{try{localStorage;return 'open'}catch{return 'blocked'}})()"),'blocked');
  await begin(page,false);await page.click('#pause');await page.eval("(()=>{const q=document.querySelector('#quality');q.value='high';q.dispatchEvent(new Event('change'));})()");
  await page.click('#resume');assert.ok(await tapDrop(page,{mobile:false,where:'labelLeft'}),'taps work without storage');
  await page.reload();assert.deepEqual(await page.eval('__T.qa.settings'),{quality:'balanced',volume:.25,hero:'pudding',stats:false,autoChoose:false});
 }catch(e){failed=e}
 try{await page?.close();}catch(e){failed??=e}
 try{await send('Target.disposeBrowserContext',{browserContextId});}catch(e){failed??=e}
 if(failed)throw failed;
});

// ---- dialog reachability (--dialogs) -----------------------------------------------------
// Start and pause dialogs in short and tall windows: measure rects, then reach the end of
// the content and the primary button with the device's own gesture (wheel or touch drag),
// operate it, and check that every control tabbed to comes into view and Enter works.
const DIALOG_VIEWS_ALL=[{name:'800x600',width:800,height:600},{name:'1280x720',width:1280,height:720},{name:'844x390',width:844,height:390,mobile:true,scale:1},{name:'568x320',width:568,height:320,mobile:true,scale:1},{name:'390x844',width:390,height:844,mobile:true,scale:1},{name:'360x640',width:360,height:640,mobile:true,scale:1}];
const MEASURE=primary=>`(()=>{const d=document.querySelector('#dialog'),b=document.querySelector('${primary}'),r=b.getBoundingClientRect(),dr=d.getBoundingClientRect();
 const visTop=Math.max(r.top,dr.top,0),visBottom=Math.min(r.bottom,dr.bottom,innerHeight),cy=(visTop+visBottom)/2,hit=visBottom>visTop?document.elementFromPoint(r.left+r.width/2,cy):null;
 return {dialog:{top:Math.round(dr.top),bottom:Math.round(dr.bottom),scrollHeight:d.scrollHeight,clientHeight:d.clientHeight,scrollTop:Math.round(d.scrollTop)},
  primary:{top:Math.round(r.top),bottom:Math.round(r.bottom),visiblePx:Math.max(0,Math.round(visBottom-visTop)),fullyVisible:r.top>=dr.top-1&&r.bottom<=dr.bottom+1&&r.bottom<=innerHeight+1,hitIsPrimary:!!hit&&(hit===b||b.contains(hit))},
  focused:document.activeElement?.id||document.activeElement?.tagName}})()`;
async function pressKey(page,keyName,shift=false){
 const code={Tab:9,Enter:13}[keyName],base={key:keyName,code:keyName,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,modifiers:shift?8:0};
 // Enter goes as one keyDown with text: in headless Chrome 156 a rawKeyDown Enter turns the page
 // visibilityState 'hidden' and stops requestAnimationFrame, even on a blank page.
 if(keyName==='Enter')await send('Input.dispatchKeyEvent',{type:'keyDown',...base,text:'\r',unmodifiedText:'\r'},page.s);
 else await send('Input.dispatchKeyEvent',{type:'rawKeyDown',...base},page.s);
 await send('Input.dispatchKeyEvent',{type:'keyUp',...base},page.s);await page.frames(1);
}
async function openDialogState(page,state){
 if(state==='paused'){await page.eval("document.querySelector('#start').click();0");await page.frames(2);await page.eval('__PLUSH_QA__.pause();0');await page.frames(2);}
 assert.equal(await page.eval('__PLUSH_QA__.game.status'),state);
}
const dialogScroll=page=>page.eval("(()=>{const d=document.querySelector('#dialog');return {top:Math.round(d.scrollTop),max:d.scrollHeight-d.clientHeight}})()");
async function gestureToEnd(page,mobile){
 const c=await page.eval("(()=>{const r=document.querySelector('#dialog').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*.6,h:r.height}})()"),log=[];
 for(let i=0;i<12;i++){
  const before=await dialogScroll(page);if(before.top>=before.max-1)break;
  if(mobile){const t0=Date.now()/1000,dist=Math.min(140,c.h*.4);await page.touch([[c.x,c.y,21]],'touchStart',t0);for(let k=1;k<=6;k++)await page.touch([[c.x,c.y-dist*k/6,21]],'touchMove',t0+k*.03);await page.touch([[c.x,c.y-dist,21]],'touchEnd',t0+.2);}
  else await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:c.x,y:c.y,deltaX:0,deltaY:200,timestamp:Date.now()/1000},page.s);
  await sleep(350);await page.frames(2);const after=await dialogScroll(page);log.push(after.top);if(after.top===before.top)break;
 }
 return log;
}
const DIALOG_VIEWS=DIALOG_VIEWS_ALL.filter(v=>!onlyViews||onlyViews.includes(v.name));
for(const view of runDialogs?DIALOG_VIEWS:[]){
 const mobile=!!view.mobile;
 for(const [state,primary] of [['ready','#start'],['paused','#resume']]){
  await check(`dialog ${view.name} ${state}: ${mobile?'touch drag':'wheel'} reaches the end and ${primary} works`,async()=>{
   const page=await openPage(view);
   try{
    await openDialogState(page,state);
    const initial=await page.eval(MEASURE(primary)),steps=await gestureToEnd(page,mobile),end=await dialogScroll(page),after=await page.eval(MEASURE(primary));
    const record={view:view.name,state,primary,initial,gesture:mobile?'touch drag':'mouse wheel',scrollSteps:steps,end,after};dialogs.push(record);lastDiag=record;
    assert.ok(end.top>=end.max-1,`gesture reached the end (${end.top}/${end.max})`);
    assert.ok(after.primary.fullyVisible&&after.primary.hitIsPrimary,'primary fully visible and on top');
    const b=await page.eval(`(()=>{const r=document.querySelector('${primary}').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    if(mobile)await page.tap(b.x,b.y,{id:12});else await page.mouse(b.x,b.y);await page.frames(2);
    record.operated=await page.eval('__PLUSH_QA__.game.status');assert.equal(record.operated,'running',`${primary} works`);
   }finally{await page.close();}
  });
  await check(`dialog ${view.name} ${state}: every control tabbed to comes into view, Enter on ${primary} works`,async()=>{
   const page=await openPage(view);
   try{
    await openDialogState(page,state);
    const ids=await page.eval("[...document.querySelector('#dialog').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled):not([tabindex=\"-1\"])')].filter(e=>e.getClientRects().length).map(e=>e.id||e.className)");
    const seen={};
    for(let i=0;i<ids.length+1;i++){
     await pressKey(page,'Tab');
     const f=await page.eval("(()=>{const e=document.activeElement,d=document.querySelector('#dialog'),r=e.getBoundingClientRect(),dr=d.getBoundingClientRect();return {id:e.id||e.className,inDialog:d.contains(e),visible:r.top>=dr.top-1&&r.bottom<=dr.bottom+1&&r.bottom<=innerHeight+1&&r.top>=-1}})()");
     if(f.inDialog)seen[f.id]=f.visible;
    }
    const record={view:view.name,state,tabbed:seen};dialogs.push(record);lastDiag=record;
    for(const id of ids)assert.equal(seen[id],true,`tabbing to ${id} brings it into view`);
    for(let i=0;i<ids.length+1&&await page.eval('document.activeElement?.id')!==primary.slice(1);i++)await pressKey(page,'Tab');
    record.focusedPrimary=await page.eval(MEASURE(primary));assert.ok(record.focusedPrimary.primary.fullyVisible,'focused primary fully visible');
    await pressKey(page,'Enter');record.afterEnter=await page.eval('__PLUSH_QA__.game.status');assert.equal(record.afterEnter,'running','Enter on the primary');
   }finally{await page.close();}
  });
 }
}

}

// ---- lifecycle self-test (--self-test=...) -------------------------------------------------
// Short, deterministic probes of the abort and cleanup paths; no game checks run.
const selfTestReport={};
async function runSelfTest(){
 if(selfTest==='cdp'){
  // One DevTools request that never answers, on a blank page (no game load, so no slow
  // request comes first): the request limit aborts the run.
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await check('self-test: a CDP request that never completes',async()=>{await send('Runtime.evaluate',{expression:'new Promise(()=>{})',awaitPromise:true},sessionId);});
  await check('self-test: later check (must not run)',async()=>{selfTestReport.laterCheckRan=true;});
  return;
 }
 const page=await openPage({width:400,height:300});
 if(selfTest==='timeout'){
  // A check that keeps sending CDP commands forever. After its timeout, none may succeed,
  // and the next check must not run on the shared page.
  selfTestReport.okAfterTimeout=0;selfTestReport.okBeforeTimeout=0;
  await check('self-test: stuck check keeps using the page',async()=>{
   for(;;){await page.eval('1+1');if(run.aborted)selfTestReport.okAfterTimeout++;else selfTestReport.okBeforeTimeout++;await sleep(50);}
  });
  await check('self-test: later check (must not run)',async()=>{selfTestReport.laterCheckRan=true;await page.eval('1');});
  await sleep(1500);
  // Work between checks (like a screenshot or closing a page) is refused after an abort, which
  // ends the schedule: the check after it is never reached and is not listed.
  selfTestReport.betweenChecks=await page.eval('1').then(()=>'ran',e=>'refused: '+e.message.split(':')[0]);
  if(selfTestReport.betweenChecks!=='ran')throw new Error('schedule ended after abort: '+selfTestReport.betweenChecks);
  await check('self-test: check after refused page work (not reached)',async()=>{selfTestReport.unreachedRan=true;});
 }else if(selfTest==='assert'){
  // An ordinary failed assertion fails one check; the run goes on.
  await check('self-test: failing assertion',async()=>{assert.equal(await page.eval('1+1'),3);});
  await check('self-test: next check still runs',async()=>{selfTestReport.laterCheckRan=true;assert.equal(await page.eval('2+2'),4);});
 }else if(selfTest==='signal'){
  console.error('READY_FOR_SIGNAL');
  await check('self-test: waits for a signal',async()=>{await sleep(60000);});
 }
}

let fatal=null;
try{await setup();if(selfTest)await runSelfTest();else await runAll();}
catch(e){fatal=e;console.error(`fatal: ${e?.stack||e}`);}
finally{await cleanup();}
const failed=results.filter(r=>!r.ok);
console.log(JSON.stringify({method:'headless Google Chrome, SwiftShader WebGL, DevTools-protocol input',chrome:CHROME,aborted:run.aborted,fatal:fatal?String(fatal.message||fatal):null,cdpRefusedAfterAbort:run.cdpAfterAbort,selfTest:selfTest?{mode:selfTest,...selfTestReport}:undefined,passed:results.filter(r=>r.ok&&!r.note).length,failed:failed.length,notRun:results.filter(r=>r.notRun).length,consoleErrors:errors,dialogButtonsNeedingScroll:[...scrolled],dialogs,results},null,1));
process.exit(fatal||run.aborted||failed.length||errors.length?1:0);
