#!/usr/bin/env python3
"""Full desktop Firefox Q3 pass for the frozen Plush Rescue candidate.

Uses only Python's standard library, geckodriver and the candidate's public QA hook.
Gameplay-changing setup via __PLUSH_QA__ is logged as setup; clicks, key input and
hover input are dispatched through W3C WebDriver and checked for isTrusted=true.
This runner deliberately uses a normal visible Firefox window and mouse input at both
viewports. 390x844 is a narrow desktop viewport, not a phone or touch test.
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
DRIVER = HERE / "bin" / "geckodriver"
FIREFOX = HERE / "Firefox.app" / "Contents" / "MacOS" / "firefox"
PROFILE_ROOT = HERE / "profile-root"
DEFAULT_CANDIDATE = HERE.parents[1]
TIMEOUT = 45

class StaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if self.server.access_log:
            self.server.access_log.write((self.log_date_time_string()+" "+fmt%args+"\n").encode())
            self.server.access_log.flush()
    def do_POST(self):
        if self.path != "/__q3/report":
            self.send_error(404); return
        try:
            length=int(self.headers.get("Content-Length","0"))
            payload=self.rfile.read(min(length,2_000_000))
            json.loads(payload)
            with self.server.report_log.open("ab") as f: f.write(payload+b"\n")
            self.send_response(204); self.end_headers()
        except Exception as e:
            self.send_error(400,str(e))

def http(url, method="GET", body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            raw = res.read(4_000_001)
            if len(raw)>4_000_000:raise RuntimeError("WebDriver response exceeds 4MB")
    except urllib.error.HTTPError as e:
        body=e.read(16384).decode('utf-8','replace')
        raise RuntimeError(f"WebDriver HTTP {e.code} {method} {url}: {body}") from e
    value=json.loads(raw) if raw else {}
    if isinstance(value,dict) and isinstance(value.get('value'),dict) and value['value'].get('error'):
        raise RuntimeError(f"WebDriver error {method} {url}: {value['value']}")
    return value

class WebDriver:
    def __init__(self, base, session): self.base, self.session = base, session
    def cmd(self, path, method="GET", body=None): return http(self.base+path, method, body)
    def script(self, source, args=None): return self.cmd(f"/session/{self.session}/execute/sync", "POST", {"script":source,"args":args or []}).get("value")
    def element(self, selector): return self.cmd(f"/session/{self.session}/element", "POST", {"using":"css selector","value":selector}).get("value",{}).get("element-6066-11e4-a52e-4f735466cecf")
    def click(self, selector):
        el=self.element(selector)
        if not el: raise AssertionError("element not found: "+selector)
        self.cmd(f"/session/{self.session}/element/{el}/click", "POST", {})
    def key(self, value):
        self.cmd(f"/session/{self.session}/actions", "POST", {"actions":[{"type":"key","id":"q3-key","actions":[{"type":"keyDown","value":value},{"type":"keyUp","value":value}]}]})
    def keys(self, value, count=1):
        for _ in range(count): self.key(value)
    def pointer(self, x, y, click=False):
        actions=[{"type":"pointerMove","duration":80,"x":int(x),"y":int(y)}]
        if click: actions += [{"type":"pointerDown","button":0},{"type":"pause","duration":90},{"type":"pointerUp","button":0}]
        self.cmd(f"/session/{self.session}/actions", "POST", {"actions":[{"type":"pointer","id":"q3-mouse","parameters":{"pointerType":"mouse"},"actions":actions}]})
    def refresh(self): self.cmd(f"/session/{self.session}/refresh", "POST", {})
    def screenshot(self, path):
        value=self.cmd(f"/session/{self.session}/screenshot").get("value","")
        import base64
        path.write_bytes(base64.b64decode(value))

def must(condition, message):
    if not condition: raise AssertionError(message)

def js_wait(driver, expr, timeout=8):
    deadline=time.time()+timeout
    while time.time()<deadline:
        try:
            v=driver.script("return ("+expr+");")
            if v: return v
        except Exception as error:
            driver.wait_errors=getattr(driver,'wait_errors',[])[-15:]+[{'t':time.monotonic(),'expr':expr,'error':str(error)[:4096]}]
        time.sleep(.1)
    raise TimeoutError("Timed out waiting for: "+expr)

def wait_new_document(driver, marker, previous_time_origin, timeout=20):
    # Inline a JSON-encoded marker in js_wait's expression: js_wait supplies no args.
    js_wait(driver,"document.readyState==='complete' && window.name==="+json.dumps(marker)+" && !!window.__PLUSH_QA__ && !!window.__PLUSH_QA__.game && !!window.__PLUSH_QA__.renderer",timeout)
    js_wait(driver,"window.__PLUSH_QA__.shaderWarmup.ready || !!window.__PLUSH_QA__.shaderWarmup.error",timeout)
    nav=driver.script("return {marker:window.name,timeOrigin:performance.timeOrigin}")
    must(nav['marker']==marker and nav['timeOrigin']!=previous_time_origin,"navigation did not reach a new document")
    return nav

def set_viewport(driver, width, height):
    # Firefox's window rect includes browser chrome; correct it against measured inner size.
    rect=driver.cmd(f"/session/{driver.session}/window/rect") .get("value",{})
    driver.cmd(f"/session/{driver.session}/window/rect", "POST", {"width":width+80,"height":height+150,"x":max(0,rect.get("x",0)),"y":max(0,rect.get("y",0))})
    for _ in range(5):
        got=driver.script("return [innerWidth,innerHeight]")
        if got==[width,height]: return
        rect=driver.cmd(f"/session/{driver.session}/window/rect").get("value",{})
        driver.cmd(f"/session/{driver.session}/window/rect", "POST", {"width":rect.get("width",width+80)+width-got[0],"height":rect.get("height",height+150)+height-got[1],"x":rect.get("x",0),"y":rect.get("y",0)})
        time.sleep(.2)
    got=driver.script("return [innerWidth,innerHeight]")
    must(got==[width,height], f"viewport {got} did not reach {width}x{height}")

class DiagnosticComplete(Exception):
    pass

def add_capture(driver):
    driver.script("""window.__Q3_INPUTS=[];window.__Q3_ERRORS=[];
for(const n of ['click','pointerdown','pointerup','pointermove','keydown','keyup'])
 addEventListener(n,e=>{if(window.__Q3_INPUTS.length>=256)window.__Q3_INPUTS.shift();window.__Q3_INPUTS.push({type:n,trusted:e.isTrusted,target:e.target?.id||e.target?.tagName||'',key:e.key||'',pointer:e.pointerType||'',x:e.clientX??null,y:e.clientY??null,buttons:e.buttons??null,t:performance.now()});},true);
addEventListener('error',e=>window.__Q3_ERRORS.push(String(e.message||e.error)));
addEventListener('unhandledrejection',e=>window.__Q3_ERRORS.push(String(e.reason)));""")

def install_probe(driver):
    driver.script((HERE/'hover_probe.js').read_text())

def q3_state(driver):
    return driver.script("""const q=window.__PLUSH_QA__,g=q.game,c=q.renderer.getContext(),e=c.getExtension('WEBGL_debug_renderer_info');
return {build:document.querySelector('#game')?.dataset.build,hook:q.revision,status:g.status,time:g.time,hero:g.heroId,
webgl:!!c,glVersion:c.getParameter(c.VERSION),glVendor:e?c.getParameter(e.UNMASKED_VENDOR_WEBGL):null,
glRenderer:e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):null,canvas:[c.drawingBufferWidth,c.drawingBufferHeight],programs:q.shaderWarmup.programs,
gpuClass:e?(/swiftshader|llvmpipe|software/i.test(c.getParameter(e.UNMASKED_RENDERER_WEBGL))?'software-indicated':(/apple|metal/i.test(c.getParameter(e.UNMASKED_RENDERER_WEBGL))?'hardware-indicated':'renderer-reported')):'renderer-masked-or-unavailable',
warmup:q.shaderWarmup,settings:q.settings};""")

def project_drop(driver, weapon, offset=(1.6,1.1)):
    # Setup is explicit and logged; hit-testing uses the real game camera and the same
    # DROP_GEOMETRY item location as qa/browser-chrome.mjs, then W3C mouse input hits it.
    return driver.script("""return (async()=>{
const q=window.__PLUSH_QA__,g=q.game,m=await import('/weapon-visuals.js'),G=m.DROP_GEOMETRY;
g.drops.length=0;g.enemies.length=0;g.spawn=1e9;g.dropTimer=1e9;g.invuln=1e9;g.nextBossMinute=1e9;
const [dx,dz,id]=arguments,drop=g.addDrop({kind:'weapon',weaponId:id,x:g.player.x+dx,z:g.player.z+dz});
q.renderOnce();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const p=new q.camera.position.constructor(drop.x,G.floatY,drop.z).project(q.camera),r=document.querySelector('#world').getBoundingClientRect();
const result={id:drop.id,x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,z:p.z};
if(id==='frostwand')window.__Q3_HOVER_PROBE?.target(result);return result;})()""", [offset[0], offset[1], weapon])

def save_checkpoint(driver, artifacts, name, report):
    p=artifacts/(name.replace(' ','_')+'.png')
    try: driver.screenshot(p); report.setdefault('screenshots',[]).append(str(p))
    except Exception as e: report.setdefault('artifactErrors',[]).append(name+': '+str(e))

def run_view(driver, width, height, report, artifacts):
    tag=f"{width}x{height}"
    set_viewport(driver,width,height)
    first_marker=f"q3-open-{tag}-{time.time_ns()}"
    before_open=driver.script("return performance.timeOrigin")
    driver.script("window.name=arguments[0]",[first_marker])
    driver.cmd(f"/session/{driver.session}/url","POST",{"url":report['origin']+"/index.html"})
    first_nav=wait_new_document(driver,first_marker,before_open)
    must(driver.script("return !!document.querySelector('#world').getContext('webgl2')"),tag+" WebGL2 did not start")
    # wait_new_document has already waited for shader warmup to reach a terminal state.
    # Clean only this disposable WebDriver origin/profile, then use WebDriver's
    # navigation command (with pageLoadStrategy=normal) to avoid execute/sync returning
    # into the old document while location.reload() is still pending.
    marker=f"q3-{tag}-{time.time_ns()}"
    before_origin=driver.script("return performance.timeOrigin")
    driver.script("localStorage.clear();sessionStorage.clear();window.name=arguments[0]",[marker])
    driver.refresh()
    nav=wait_new_document(driver,marker,before_origin)
    add_capture(driver)
    initial=q3_state(driver)
    must(initial['build'] and initial['webgl'] and initial['programs']>0, tag+" no rendered WebGL programs")
    must(initial['warmup']['ready'] and not initial['warmup']['error'],tag+" shader warmup failed")
    report.setdefault('viewports',[]).append({"target":[width,height],"observed":driver.script("return [innerWidth,innerHeight,devicePixelRatio,navigator.userAgent]"),"initialNavigation":first_nav,"navigationAfterStorageClear":nav,"boot":initial})
    save_checkpoint(driver,artifacts,tag+"-boot",report)

    # Character 1: the actual intro card and actual Start button are user-like trusted input.
    driver.click('#heroCardPolar'); must(driver.script("return document.querySelector('#heroCardPolar').getAttribute('aria-pressed')==='true'"),"polar card did not select")
    driver.click('#start'); js_wait(driver,"window.__PLUSH_QA__.game.status==='running'")
    must(driver.script("return __PLUSH_QA__.game.heroId==='polar'"),"first run is not Polar")
    driver.script("__PLUSH_QA__.game.drops.length=0;__PLUSH_QA__.game.enemies.length=0;__PLUSH_QA__.game.spawn=1e9;__PLUSH_QA__.game.dropTimer=1e9;__PLUSH_QA__.game.invuln=1e9;__PLUSH_QA__.game.nextBossMinute=1e9")
    before=driver.script("return ({x:__PLUSH_QA__.game.player.x,z:__PLUSH_QA__.game.player.z})")
    driver.key('w'); time.sleep(.55); driver.key('w')  # keyDown/up taps, followed by held-key test below
    # A real held W key is sent as one keyDown, pause, keyUp sequence.
    driver.cmd(f"/session/{driver.session}/actions","POST",{"actions":[{"type":"key","id":"q3-hold","actions":[{"type":"keyDown","value":"w"},{"type":"pause","duration":500},{"type":"keyUp","value":"w"}]}]})
    time.sleep(.12); after=driver.script("return ({x:__PLUSH_QA__.game.player.x,z:__PLUSH_QA__.game.player.z})")
    must(abs(after['x']-before['x'])+abs(after['z']-before['z'])>.08,"trusted W input did not move the player")
    driver.click('#pause'); js_wait(driver,"__PLUSH_QA__.game.status==='paused'")
    driver.click('#quality-high'); driver.click('#nextHero-pudding'); driver.click('#showStats')
    # Use trusted keyboard input on the range: Home then 13 steps of 0.05 -> .65.
    vol=driver.element('#volume'); driver.cmd(f"/session/{driver.session}/element/{vol}/click","POST",{})
    driver.key('\ue011'); driver.keys('\ue014',13)
    settings=driver.script("return ({s:__PLUSH_QA__.settings,volume:Number(document.querySelector('#volume').value),stats:document.querySelector('#showStats').checked})")
    must(settings['s']['quality']=='high' and settings['s']['hero']=='pudding' and settings['s']['stats'] is True,"settings UI did not apply")
    must(abs(settings['volume']-.65)<.03,"volume range did not reach expected value")
    driver.click('#resume'); js_wait(driver,"__PLUSH_QA__.game.status==='running'")
    refresh_marker=f"q3-settings-{tag}-{time.time_ns()}"
    before_refresh=driver.script("return performance.timeOrigin")
    driver.script("window.name=arguments[0]",[refresh_marker])
    driver.refresh()
    after_refresh=wait_new_document(driver,refresh_marker,before_refresh)
    add_capture(driver)
    if width==360:install_probe(driver)
    persisted=q3_state(driver)
    must(persisted['status']=='ready' and persisted['settings']['quality']=='high' and persisted['settings']['hero']=='pudding' and persisted['settings']['stats'] is True,"settings did not persist after reload or run failed to reset")
    must(abs(persisted['settings']['volume']-.65)<.03,"volume did not persist after reload")
    save_checkpoint(driver,artifacts,tag+"-settings-reload",report)

    # Character 2: Pudding is loaded from the persisted next-run setting.
    driver.click('#start'); js_wait(driver,"__PLUSH_QA__.game.status==='running'")
    must(driver.script("return __PLUSH_QA__.game.heroId==='pudding'"),"second run is not Pudding")
    driver.script("__PLUSH_QA__.game.drops.length=0;__PLUSH_QA__.game.enemies.length=0;__PLUSH_QA__.game.spawn=1e9;__PLUSH_QA__.game.dropTimer=1e9;__PLUSH_QA__.game.invuln=1e9;__PLUSH_QA__.game.nextBossMinute=1e9")

    # Real click on an engine-created drop: setup uses the QA hook, pointer input is trusted.
    d=project_drop(driver,'shotgun'); must(-1<d['z']<1 and 5<d['x']<width-5 and 5<d['y']<height-5,"click pickup projected outside viewport")
    driver.pointer(d['x'],d['y'],True); js_wait(driver,"__PLUSH_QA__.game.status==='pickup'")
    st=driver.script("return ({id:__PLUSH_QA__.game.pendingPickup?.id,slot:__PLUSH_QA__.game.pendingPickup?.slot,weapon:__PLUSH_QA__.game.pendingPickup?.weaponId})")
    must(st['weapon']=='shotgun' and st['slot']=='main',"main-hand drop did not enter pickup decision")
    driver.click('#replaceWeapon'); js_wait(driver,"__PLUSH_QA__.game.status==='running'")
    must(driver.script("return __PLUSH_QA__.game.loadout.main==='shotgun'"),"main-hand replacement failed")
    save_checkpoint(driver,artifacts,tag+"-main-weapon",report)

    # Hover pickup is a real W3C mouse move and timed dwell, without a click.
    d=project_drop(driver,'frostwand',(1.2,-1.4)); report.setdefault('hoverTargets',[]).append({'viewport':tag,**d,'sentX':int(d['x']),'sentY':int(d['y'])}); must(all(__import__('math').isfinite(d[k]) for k in ('x','y','z')) and -1<d['z']<1 and 0<=int(d['x'])<width and 0<=int(d['y'])<height,'frostwand projection invalid; original hover not attempted'); driver.pointer(d['x'],d['y']); time.sleep(.8)
    js_wait(driver,"__PLUSH_QA__.game.status==='pickup'")
    must(driver.script("return __PLUSH_QA__.game.pendingPickup?.weaponId==='frostwand'"),"hover did not pick the offhand weapon")
    if width==360:
        report['hoverProbe']=driver.script("return window.__Q3_HOVER_PROBE?.read()||null")
        save_checkpoint(driver,artifacts,tag+'-hover-observed',report)
        raise DiagnosticComplete()
    driver.click('#replaceWeapon'); js_wait(driver,"__PLUSH_QA__.game.status==='running'")
    must(driver.script("return __PLUSH_QA__.game.loadout.offhand==='frostwand'"),"offhand replacement failed")

    # Two-handed substitution and switching are through the real pickup and HUD button.
    d=project_drop(driver,'cannon',(1.2,1.6)); driver.pointer(d['x'],d['y'],True); js_wait(driver,"__PLUSH_QA__.game.status==='pickup'")
    driver.click('#replaceWeapon'); js_wait(driver,"__PLUSH_QA__.game.status==='running'")
    must(driver.script("return __PLUSH_QA__.game.twoHanded==='cannon' && __PLUSH_QA__.game.loadout.main==='shotgun' && __PLUSH_QA__.game.loadout.offhand==='frostwand'"),"two-handed replacement failed to preserve hand slots")
    driver.click('#stowTwoHanded'); must(driver.script("return __PLUSH_QA__.game.twoHanded===null && document.querySelector('#stowTwoHanded').getAttribute('aria-pressed')==='false'"),"stowing did not restore main/offhand")
    driver.click('#stowTwoHanded'); must(driver.script("return __PLUSH_QA__.game.twoHanded==='cannon'"),"two-handed switch back failed")
    save_checkpoint(driver,artifacts,tag+"-weapon-slots",report)

    # Setup a legitimate level-up state through the exposed game method, then choose by real click.
    driver.script("__PLUSH_QA__.game.exp=__PLUSH_QA__.game.nextExp;__PLUSH_QA__.game.levelUp()")
    # status changes synchronously, while the choice buttons are rendered on the
    # next animation frame. Wait for the actual interactive control before clicking.
    js_wait(driver,"__PLUSH_QA__.game.status==='upgrade' && !!document.querySelector('.choice')")
    level=driver.script("return __PLUSH_QA__.game.level")
    upgrade_id=driver.script("return document.querySelector('.choice')?.dataset.upgrade")
    upgrade_before=driver.script("return ({power:__PLUSH_QA__.game.power,fireInterval:__PLUSH_QA__.game.fireInterval,speed:__PLUSH_QA__.game.player.speed,maxHp:__PLUSH_QA__.game.player.maxHp,pickupRange:__PLUSH_QA__.game.pickupRange,critChance:__PLUSH_QA__.game.critChance,magicReach:__PLUSH_QA__.game.magicReach,invulnTime:__PLUSH_QA__.game.invulnTime})")
    driver.click('.choice'); js_wait(driver,"__PLUSH_QA__.game.status==='running'")
    must(driver.script("return __PLUSH_QA__.game.level") == level,"upgrade level changed unexpectedly")
    upgrade_after=driver.script("return ({power:__PLUSH_QA__.game.power,fireInterval:__PLUSH_QA__.game.fireInterval,speed:__PLUSH_QA__.game.player.speed,maxHp:__PLUSH_QA__.game.player.maxHp,pickupRange:__PLUSH_QA__.game.pickupRange,critChance:__PLUSH_QA__.game.critChance,magicReach:__PLUSH_QA__.game.magicReach,invulnTime:__PLUSH_QA__.game.invulnTime})")
    must(upgrade_before!=upgrade_after,"selected upgrade did not change engine state")
    report.setdefault('upgradeEvidence',[]).append({"viewport":tag,"choice":upgrade_id,"before":upgrade_before,"after":upgrade_after})
    save_checkpoint(driver,artifacts,tag+"-upgrade",report)

    # Exercise the result screen through the actual syncOverlay/render/record path.
    # The terminal game state is explicitly QA setup, not a claim of a real defeat battle.
    driver.script("__PLUSH_QA__.game.end('fallen')"); js_wait(driver,"__PLUSH_QA__.game.status==='ended' && !!document.querySelector('#again')")
    must(driver.script("return document.querySelector('#dialogTitle').textContent.length>0 && __PLUSH_QA__.records.runs>0"),"settlement report/record missing")
    save_checkpoint(driver,artifacts,tag+"-settlement",report)
    driver.click('#again'); js_wait(driver,"__PLUSH_QA__.game.status==='running'")
    # Repeated real reset from the pause menu (three rounds including the post-settlement run).
    for i in range(3):
        driver.click('#pause'); js_wait(driver,"__PLUSH_QA__.game.status==='paused'")
        driver.click('#restart'); js_wait(driver,"__PLUSH_QA__.game.status==='running'")
        must(driver.script("return __PLUSH_QA__.game.time<1 && __PLUSH_QA__.game.status==='running'"),f"restart round {i+1} did not reset")
    save_checkpoint(driver,artifacts,tag+"-repeated-restart",report)
    inputs=driver.script("return window.__Q3_INPUTS||[]")
    errors=driver.script("return window.__Q3_ERRORS||[]")
    trusted=[e for e in inputs if e.get('trusted') is True]
    must(len(trusted)>=12,"expected trusted input evidence was not collected")
    must(not errors,"browser JavaScript errors: "+json.dumps(errors))
    report.setdefault('inputEvidence',[]).append({"viewport":tag,"trustedEventCount":len(trusted),"events":inputs,"javascriptErrors":errors,"programmaticSetup":["cleared initial enemies/drops/spawn timers","created drops with Game.addDrop for click/hover","called Game.levelUp after seeding exp to nextExp","called Game.end('fallen') to open result UI; not a simulated battle"]})
    save_checkpoint(driver,artifacts,tag+"-final",report)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--candidate',default=str(DEFAULT_CANDIDATE))
    ap.add_argument('--artifacts',default=str(HERE/'artifacts'))
    args=ap.parse_args()
    candidate=pathlib.Path(args.candidate).resolve(); artifacts=pathlib.Path(args.artifacts).resolve()
    if not candidate.is_dir() or not DRIVER.is_file() or not FIREFOX.is_file(): ap.error('candidate, staged Firefox or geckodriver missing')
    stamp=dt.datetime.now().strftime('%Y%m%d-%H%M%S'); artifacts=artifacts/stamp; artifacts.mkdir(parents=True,exist_ok=True)
    PROFILE_ROOT.mkdir(parents=True,exist_ok=True)
    report={"startedAt":dt.datetime.now().astimezone().isoformat(),"candidate":str(candidate),"artifacts":str(artifacts),"browser":"Firefox 160.0 headed","driver":"geckodriver 0.37.1","profileRoot":str(PROFILE_ROOT),"profileIsolation":"geckodriver-managed disposable session profile rooted here","views":[],"checks":[],"limitations":["390x844 is a narrow desktop viewport with mouse input; no phone/touch claim","quality/role/end-state setups use __PLUSH_QA__; trusted W3C click/key/hover evidence is logged separately","settlement is a forced game-end QA state, not a played-through defeat"]}
    try:
        report['candidateCommit']=subprocess.run(['git','-C',str(candidate),'rev-parse','HEAD'],check=True,capture_output=True,text=True).stdout.strip()
        report['candidateWorktreeStatus']=subprocess.run(['git','-C',str(candidate),'status','--short','--branch'],check=True,capture_output=True,text=True).stdout.splitlines()
        report['candidateBuild']=json.loads((candidate/'build-info.json').read_text())
    except Exception as e: report['candidateRevisionNote']=str(e)
    access=(artifacts/'http.log').open('wb'); server=None; driver_proc=None; wd=None
    class CandidateHandler(StaticHandler):
        def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(candidate),**kwargs)
        def translate_path(self, path):
            rel=urllib.parse.unquote(urllib.parse.urlsplit(path).path).lstrip('/')
            prefix='tools/firefox-q3/'
            if rel.startswith(prefix): return str(HERE/rel[len(prefix):])
            return super().translate_path(path)
    server=ThreadingHTTPServer(('127.0.0.1',0),CandidateHandler);server.access_log=access;server.report_log=artifacts/'harness-posts.jsonl'
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f"http://127.0.0.1:{server.server_address[1]}"; report['origin']=origin
    dlog=(artifacts/'geckodriver.log').open('w')
    env=dict(os.environ,TMPDIR=str(PROFILE_ROOT))
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',0));driver_port=probe.getsockname()[1]
    driver_proc=subprocess.Popen([str(DRIVER),'--host','127.0.0.1','--port',str(driver_port),'--profile-root',str(PROFILE_ROOT),'--log','info'],env=env,stdout=subprocess.DEVNULL,stderr=dlog)
    base=f'http://127.0.0.1:{driver_port}'; sid=None
    try:
        for _ in range(120):
            if driver_proc.poll() is not None: raise RuntimeError('geckodriver exited: '+str(driver_proc.returncode))
            try: http(base+'/status'); break
            except Exception: time.sleep(.1)
        created=http(base+'/session','POST',{"capabilities":{"alwaysMatch":{"browserName":"firefox","moz:firefoxOptions":{"binary":str(FIREFOX),"args":["-no-remote","-new-instance"],"prefs":{"browser.shell.checkDefaultBrowser":False,"browser.startup.page":0,"browser.sessionstore.resume_from_crash":False}}}}})
        value=created.get('value',{}); sid=value.get('sessionId') or created.get('sessionId')
        if not sid: raise RuntimeError('no WebDriver session id: '+repr(created))
        wd=WebDriver(base,sid); report['capabilities']=value.get('capabilities',{})
        report['safariNote']='not applicable: Firefox runner only; Safari uses a separately authorized manual/native flow.'
        for width,height in [(1280,720),(390,844)]:
            try: run_view(wd,width,height,report,artifacts); report['checks'].append({"viewport":f"{width}x{height}","ok":True})
            except Exception as e:
                report['checks'].append({"viewport":f"{width}x{height}","ok":False,"error":str(e)})
                try: save_checkpoint(wd,artifacts,f"{width}x{height}-failure",report)
                except Exception: pass
        report['finishedAt']=dt.datetime.now().astimezone().isoformat()
        report['ok']=all(x['ok'] for x in report['checks'])
    except Exception as e:
        report['fatal']=repr(e); report['ok']=False
    finally:
        if wd and sid:
            try: wd.cmd(f"/session/{sid}","DELETE",{})
            except Exception as e: report.setdefault('cleanupErrors',[]).append(str(e))
        if driver_proc:
            driver_proc.terminate()
            try: driver_proc.wait(timeout=10)
            except subprocess.TimeoutExpired: driver_proc.kill(); driver_proc.wait()
        server.shutdown();server.server_close();access.close();dlog.close()
        report.setdefault('finishedAt',dt.datetime.now().astimezone().isoformat())
        (artifacts/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({"ok":report.get('ok',False),"checks":report['checks'],"report":str(artifacts/'report.json'),"profileRoot":str(PROFILE_ROOT)},ensure_ascii=False,indent=2))
    sys.exit(0 if report.get('ok') else 1)

if __name__=='__main__':raise SystemExit('Support module only; use supervisor.mjs')
