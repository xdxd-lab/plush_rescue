#!/usr/bin/env python3
"""Full Q3 matrix in calibrated same-origin child frames; one Firefox renderer at a time."""
import datetime as dt
import secrets
import shutil
from ownership import observe, profile_processes, terminate_owned, same_process
from candidate_contract import validate_runtime, EXPECTED_PRODUCT_MAIN, EXPECTED_CODE
from configuration import load_configuration, prepare_output
from cleanup_evidence import append_record, error_record, probe_ports, tracked_identity, record_cleanup, remove_profile
import signal
import re
import json
import os
import pathlib
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SUPPORT_NARROW = pathlib.Path(__file__).resolve().parent / 'narrow'
TOOLS = SUPPORT_NARROW.parent
HERE = SUPPORT_NARROW
sys.path.insert(0, str(SUPPORT_NARROW))
sys.path.insert(0, str(TOOLS))
import q3_runner as q3
import q3_narrow_runner as narrow

CANDIDATE = pathlib.Path(__file__).resolve().parents[2]
SIZES = [(1280, 720), (360, 640)] # Preserve the original preceding view; diagnostic stops at target hover.


class DiagnosticAbort(BaseException):pass

def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class FrameDriver(q3.WebDriver):
    """Adapter preserving q3_runner actions while routing navigations into the child frame."""
    def cmd(self, path, method='GET', body=None):
        if path.endswith('/window/rect'):
            if method == 'POST':
                # The game viewport is the fixed iframe. Never resize the containing window here.
                return {'value': {}}
            return super().cmd(path, method, body)
        if path.endswith('/url') and method == 'POST':
            self._navigate_child(body['url'])
            return {'value': None}
        if path.endswith('/refresh') and method == 'POST':
            self._reload_child()
            return {'value': None}
        return super().cmd(path, method, body)

    def _to_parent(self):
        super().cmd(f'/session/{self.session}/frame', 'POST', {'id': None})

    def _to_child(self):
        narrow.attach_frame(self)

    def _navigate_child(self, url):
        self._to_parent()
        self.script("document.querySelector('#game-frame').contentWindow.location.href=arguments[0]", [url])
        self._to_child()

    def _reload_child(self):
        self._to_parent()
        self.script("document.querySelector('#game-frame').contentWindow.location.reload()")
        self._to_child()


def current_frame_geometry(driver):
    child = driver.script("""const q=window.__PLUSH_QA__,g=document.querySelector('#game'),c=q?.renderer?.getContext();
return {inner:[innerWidth,innerHeight],dpr:devicePixelRatio,build:g?.dataset.build,revision:q?.revision,
canvas:c?[c.drawingBufferWidth,c.drawingBufferHeight]:null,timeOrigin:performance.timeOrigin};""")
    driver.cmd(f'/session/{driver.session}/frame', 'POST', {'id': None})
    outer = driver.script("""const f=document.querySelector('#game-frame'),r=f.getBoundingClientRect();
return {requested:f.dataset.requestedViewport,rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:[innerWidth,innerHeight],dpr:devicePixelRatio};""")
    narrow.attach_frame(driver)
    return {'child':child,'outer':outer}


def frame_wrapper_url(origin, width, height):
    size=f'{width}x{height}'
    app=urllib.parse.quote(origin+'/index.html',safe='')
    return f'{origin}/__q3/narrow?size={size}&app={app}'


def main():
    import argparse
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--run',action='store_true',help='one diagnostic: preceding1280 then360 frostwand; no retry')
    ap.add_argument('--expected-sha',help='required full 40-character SHA of the final frozen candidate')
    args=ap.parse_args()
    if not args.run:
        print('Prepared only. No browser/server/game started; after explicit GPU handoff pass --run --expected-sha <full-final-SHA>.')
        return 0
    if not args.expected_sha or not re.fullmatch(r'[0-9a-f]{40}',args.expected_sha): raise SystemExit('--expected-sha must be the full 40-character final candidate SHA')
    configuration=load_configuration(os.environ,CANDIDATE)
    DRIVER=configuration['driver'];FIREFOX=configuration['firefox'];REPORT_ROOT=configuration['report_root']
    PROFILE_BASE=REPORT_ROOT/'profiles';ARTIFACT_ROOT=REPORT_ROOT/'runs'
    if not CANDIDATE.is_dir() or not DRIVER.is_file() or not FIREFOX.is_file(): raise SystemExit('candidate, Firefox or geckodriver missing')
    if observe(os.getpid(),'identity-preflight') is None:raise SystemExit('BLOCK: kernel process identity unavailable; no server/browser started')
    import plistlib
    with (FIREFOX.parents[1]/'Info.plist').open('rb') as stream: firefox_info=plistlib.load(stream)
    if firefox_info.get('CFBundleShortVersionString')!='160.0':raise SystemExit('Firefox version drift')
    gecko=subprocess.run([str(DRIVER),'--version'],capture_output=True,text=True,check=True,timeout=3).stdout
    if not gecko.startswith('geckodriver 0.37.1 '):raise SystemExit('geckodriver version drift')
    commit=subprocess.run(['git','-C',str(CANDIDATE),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
    if commit != args.expected_sha: raise SystemExit(f'candidate SHA {commit} does not match requested full SHA {args.expected_sha}')
    build_info=validate_runtime(CANDIDATE)
    dirty=subprocess.run(['git','-C',str(CANDIDATE),'status','--porcelain=v1'],capture_output=True,text=True,check=True).stdout.strip()
    if dirty: raise SystemExit('candidate worktree is dirty; refusing to run')
    prepare_output(REPORT_ROOT)
    run_id=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(4)
    artifacts=ARTIFACT_ROOT/('matrix-'+run_id); artifacts.mkdir(mode=0o700,exist_ok=False)
    PROFILE_ROOT=PROFILE_BASE/('profile-'+run_id); PROFILE_ROOT.mkdir(mode=0o700,exist_ok=False)
    report={'startedAt':dt.datetime.now().astimezone().isoformat(),'candidate':str(CANDIDATE),'candidateCommit':commit,'candidateVersion':build_info.get('version'),'worktreeClean':True,'runId':run_id,'runnerCommand':[sys.executable,str(pathlib.Path(__file__).resolve()),'--run','--expected-sha',args.expected_sha],
            'candidateBuild':build_info,'productMain':EXPECTED_PRODUCT_MAIN,'productCode':EXPECTED_CODE,'runtimeIntegrityVerified':True,'runtimeManifestSha256':__import__('hashlib').sha256((CANDIDATE/'runtime-manifest.json').read_bytes()).hexdigest(),'browser':'Firefox 160.0 headed; isolated geckodriver profile',
            'driver':'geckodriver 0.37.1','viewports':[],'checks':[],'limitations':[
              '360x640 and 390x844 are narrow desktop viewports with mouse/keyboard, not phone/touch tests.', '1280x720 is the desktop baseline path in the same fixed-frame wrapper.',
              'Result-screen end state is forced by the QA API; it is not a naturally played-through defeat.',
              'Only one game renderer is open at a time.']}
    access=(artifacts/'http.log').open('wb'); dlog=(artifacts/'geckodriver.log').open('w')
    server=driver_proc=wd=None; sid=None; server_serving=False
    tracked_browsers={}; monitor_errors=[]; monitor_error_count=[0]; monitor_stop=threading.Event(); monitor=None
    browser_identity=None; driver_identity=None; session_profile=str(PROFILE_ROOT/'firefox'); pathlib.Path(session_profile).mkdir(mode=0o700)
    report['versions']={'firefoxBundle':firefox_info.get('CFBundleShortVersionString'),'geckodriver':gecko[:512],'python':sys.version}; report['phase']='prepared'; report['ownership']={'runner':observe(os.getpid(),str(PROFILE_ROOT)), 'profile':session_profile}
    def persist():
        tmp=artifacts/'report.tmp'; tmp.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n'); tmp.replace(artifacts/'report.json')
    persist()
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*a,**kw): super().__init__(*a,directory=str(CANDIDATE),**kw)
        def translate_path(self,path):
            rel=urllib.parse.unquote(urllib.parse.urlsplit(path).path).lstrip('/')
            if rel=='__q3/narrow': return str(SUPPORT_NARROW/'q3_narrow_wrapper.html')
            prefix='tools/firefox-q3/'
            if rel.startswith(prefix): return str(TOOLS/rel[len(prefix):])
            return super().translate_path(path)
        def log_message(self,fmt,*a):
            if (artifacts/'http-handler.log').exists() and (artifacts/'http-handler.log').stat().st_size>1048576:return
            with (artifacts/'http-handler.log').open('a') as f:f.write(self.log_date_time_string()+' '+fmt%a+'\n')
    abort_state={'raised':False}
    def abort(signum, frame):
        if abort_state['raised'] or report.get('phase')=='cleanup':return
        abort_state['raised']=True
        raise DiagnosticAbort('diagnostic observation interrupted or exceeded 600s')
    signal.signal(signal.SIGTERM,abort)
    signal.signal(signal.SIGALRM,abort)
    signal.alarm(600)
    try:
        report['phase']='server-start'; persist()
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler); server.report_log=artifacts/'harness-posts.jsonl'
        report['ports']={'http':server.server_address[1]}
        threading.Thread(target=server.serve_forever,daemon=True).start();server_serving=True; origin=f'http://127.0.0.1:{server.server_address[1]}'
        report['origin']=origin
        access.write((origin+'\n').encode()); access.flush()
        env=dict(os.environ,TMPDIR=str(PROFILE_ROOT)); port=free_port(); report['ports']={'http':server.server_address[1],'webdriver':port}; persist()
        report['phase']='driver-spawn'; persist()
        driver_proc=subprocess.Popen([str(DRIVER),'--host','127.0.0.1','--port',str(port),'--profile-root',str(PROFILE_ROOT),'--log','info'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        def drain_driver():
            count=0
            while True:
                chunk=driver_proc.stderr.read(4096)
                if not chunk:break
                count+=len(chunk)
                if count<=1048576:dlog.buffer.write(chunk); dlog.flush()
                else:
                    report['driverLogOverflow']=True
                    # Preserve failure; do not buffer unbounded driver output.
            report['driverLogBytes']=count
        drain=threading.Thread(target=drain_driver,daemon=True); drain.start()
        driver_identity=observe(driver_proc.pid,str(PROFILE_ROOT)); report['ownership']['driver']=driver_identity; persist()
        if not driver_identity: raise RuntimeError('driver ownership unavailable')
        base=f'http://127.0.0.1:{port}'
        for _ in range(120):
            if driver_proc.poll() is not None: raise RuntimeError(f'geckodriver exited {driver_proc.returncode}')
            try:q3.http(base+'/status');break
            except Exception:time.sleep(.1)
        else:raise TimeoutError('geckodriver status did not become ready')
        def track_browser():
            while not monitor_stop.is_set():
                try:
                    for item in profile_processes(session_profile,str(FIREFOX)):
                        if item['pid'] not in tracked_browsers:
                            tracked_browsers[item['pid']]=item
                            with (artifacts/'ownership.jsonl').open('a') as journal:
                                journal.write(json.dumps(item)+'\n');journal.flush();os.fsync(journal.fileno())
                except Exception as error:
                    evidence=error_record(error,'ownership-monitor')
                    monitor_error_count[0]+=1
                    monitor_errors.append(evidence); del monitor_errors[:-16]
                    try:
                        if monitor_error_count[0]<=16:append_record(artifacts/'monitor-errors.jsonl',evidence)
                    except OSError as journal_error:
                        monitor_errors.append(error_record(journal_error,'monitor-error-journal'))
                        del monitor_errors[:-16]
                monitor_stop.wait(.1)
        monitor=threading.Thread(target=track_browser,daemon=True);monitor.start()
        report['phase']='session-create'; persist()
        created=q3.http(base+'/session','POST',{'capabilities':{'alwaysMatch':{'browserName':'firefox','moz:firefoxOptions':{'binary':str(FIREFOX),'args':['-no-remote','-new-instance','-profile',session_profile],'prefs':{'browser.shell.checkDefaultBrowser':False,'browser.startup.page':0,'browser.sessionstore.resume_from_crash':False}}}}})
        value=created.get('value',{});sid=value.get('sessionId') or created.get('sessionId')
        if not sid:raise RuntimeError('no WebDriver session ID: '+repr(created))
        wd=FrameDriver(base,sid);report['capabilities']=value.get('capabilities',{})
        caps=report['capabilities']; browser_identity=observe(caps.get('moz:processID'),session_profile)
        report['ownership']['firefox']=browser_identity
        if browser_identity:tracked_browsers.setdefault(browser_identity['pid'],browser_identity)
        persist()
        if not browser_identity or browser_identity['argv'][0]!=str(FIREFOX) or session_profile not in browser_identity['argv']: raise RuntimeError('Firefox ownership unavailable')
        if caps.get('browserVersion')!='160.0' or caps.get('moz:geckodriverVersion')!='0.37.1': raise RuntimeError('browser/driver version drift')
        # Ask for a roomy outer browser window; the game dimensions remain CSS-fixed in the iframe.
        original=super(FrameDriver,wd).cmd(f'/session/{sid}/window/rect').get('value',{})
        super(FrameDriver,wd).cmd(f'/session/{sid}/window/rect','POST',{'width':1500,'height':1250,'x':max(0,original.get('x',0)),'y':max(0,original.get('y',0))})
        report['outerWindowRect']={'before':original,'requested':[1500,1250]}
        for width,height in SIZES:
            report['phase']=f'viewport-{width}'; persist()
            tag=f'{width}x{height}'; wrapper=frame_wrapper_url(origin,width,height)
            # Navigate top-level wrapper; all Q3 game commands thereafter run in its child context.
            super(FrameDriver,wd).cmd(f'/session/{sid}/url','POST',{'url':wrapper})
            deadline=time.monotonic()+25
            while time.monotonic()<deadline:
                try:
                    if super(FrameDriver,wd).script("return !!window.__Q3_NARROW__?.frame?.contentDocument?.readyState"):break
                except Exception:pass
                time.sleep(.1)
            else:raise TimeoutError(f'{tag} wrapper frame not ready')
            narrow.attach_frame(wd)
            q3.js_wait(wd,"document.readyState==='complete' && !!window.__PLUSH_QA__?.game && !!window.__PLUSH_QA__?.renderer",25)
            q3.js_wait(wd,"window.__PLUSH_QA__.shaderWarmup.ready || !!window.__PLUSH_QA__.shaderWarmup.error",25)
            geometry=current_frame_geometry(wd)
            if geometry['child']['inner'] != [width,height]:raise AssertionError(f'{tag} child inner size mismatch: {geometry}')
            if geometry['child']['canvas'] != [width,height]:raise AssertionError(f'{tag} drawing buffer mismatch: {geometry}')
            if geometry['outer']['rect']['width'] != width or geometry['outer']['rect']['height'] != height:raise AssertionError(f'{tag} frame rect mismatch: {geometry}')
            if geometry['outer']['requested'] != tag:raise AssertionError(f'{tag} wrapper requested-size marker mismatch: {geometry}')
            calibration=narrow.trusted_pointer_calibration(wd,80,80)
            report['frameGeometry'] = report.get('frameGeometry',[])+[{'target':tag,'evidence':geometry,'pointerCalibration':calibration}]
            before_checks=len(report['checks'])
            q3.run_view(wd,width,height,report,artifacts)
            # Explicit synthetic negative control after the user-like matrix: it must remain untrusted.
            before=wd.script("return (window.__Q3_INPUTS||[]).filter(e=>e.trusted===true).length")
            wd.script("window.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}))")
            synthetic=wd.script("return window.__Q3_INPUTS?.at(-1)||null")
            after=wd.script("return (window.__Q3_INPUTS||[]).filter(e=>e.trusted===true).length")
            if not synthetic or synthetic.get('trusted') is not False or before!=after:
                raise AssertionError(f'{tag} synthetic negative control invalid: {synthetic!r}, trustedCount {before}->{after}')
            report['inputEvidence'][-1]['negativeControl']={'type':'synthetic window click','observedTrusted':synthetic['trusted'],'trustedCountBefore':before,'trustedCountAfter':after,'passed':True}
            report['checks'].append({'viewport':tag,'name':'synthetic negative control rejected','ok':True})
            # q3.run_view recorded its viewport only after state/readback checks; add the independent frame rect.
            report['viewports'][-1]['frameGeometry']=geometry
            report['viewports'][-1]['pointerCalibration']=calibration
            if len(report['checks'])==before_checks:raise AssertionError(f'{tag} matrix produced no check entries')
            if width != SIZES[-1][0]:
                # Return to the top-level browsing context before loading the next wrapper.
                wd.cmd(f'/session/{sid}/frame','POST',{'id':None})
        report['ok']=True
    except q3.DiagnosticComplete:
        report['ok']=True;report['diagnosticOnly']=True;report['fullMatrixPassed']=False
        report['checks'].append({'name':'360 hover observed; later assertions intentionally not run','ok':True})
    except (Exception,DiagnosticAbort) as e:
        report['waitErrors']=getattr(wd,'wait_errors',[]) if wd else []; report['failedPhase']=report['phase']; report['fatal']=repr(e); persist();report['checks'].append({'name':'fatal','ok':False,'error':repr(e)})
        if wd:
            try:report['failureProbe']=wd.script("return window.__Q3_HOVER_PROBE?.read()||null")
            except Exception as probe_error:report['probeReadError']=repr(probe_error)
            try:report['failureInputs']=wd.script("return {inputs:window.__Q3_INPUTS||[],errors:window.__Q3_ERRORS||[]}")
            except Exception as input_error:report['inputReadError']=repr(input_error)
            try:wd.screenshot(artifacts/'failure.png')
            except Exception:pass
        persist()
    finally:
        report['phase']='cleanup'
        signal.alarm(0)
        report['cleanupStarted']=dt.datetime.now().astimezone().isoformat()
        report['cleanupVerified']=False
        report['cleanupEvidence']=[]
        cleanup_context={'phase':'monitor-stop'}
        def cleanup_record(record):
            record_cleanup(report,artifacts/'cleanup.jsonl',persist,record)
        def cleanup_phase(phase, **resource):
            cleanup_context.clear();cleanup_context.update(phase=phase,**resource)
            cleanup_record({**cleanup_context,'state':'begin'})
        monitor_stop.set()
        if monitor:monitor.join(timeout=4)
        report['ownership']['trackedFirefox']=list(tracked_browsers.values());report['monitorErrors']=monitor_errors
        report['monitorErrorCount']=monitor_error_count[0]
        report['monitorJournalTruncated']=monitor_error_count[0]>16
        if monitor_errors:report.setdefault('cleanupErrors',[]).append('ownership monitor had errors')
        # Record exact tracked ownership first; do not infer absent from a failed observation.
        for expected in list(tracked_browsers.values())+([driver_identity] if driver_identity else []):
            cleanup_phase('tracked-identity',pid=expected['pid'])
            evidence=tracked_identity(expected,lambda pid:observe(pid,expected['profile']),same_process,os.kill)
            cleanup_record(evidence)
            if not evidence['ok']:report.setdefault('cleanupErrors',[]).append('tracked identity unverified: '+str(expected['pid']))
        if wd and sid and driver_identity:
            cleanup_phase('session-delete',pid=driver_proc.pid)
            if same_process(driver_identity,observe(driver_proc.pid,str(PROFILE_ROOT))):
                try:
                    super(FrameDriver,wd).cmd(f'/session/{sid}','DELETE',{})
                    cleanup_record({**cleanup_context,'ok':True})
                except Exception as e:
                    report.setdefault('cleanupErrors',[]).append(f'session delete: {e}')
                    cleanup_record(error_record(e,**cleanup_context))
            else:
                report.setdefault('cleanupErrors',[]).append('session delete ownership unavailable; not attempted')
                cleanup_record({**cleanup_context,'ok':False,'reason':'ownership-unverified'})
        report['phase']='cleanup'; cleanup_record({'phase':'cleanup-checkpoint','state':'begin'})
        cleanup=[]
        # The explicit unique profile permits discovery even after POST/session failure.
        try:
            cleanup_phase('firefox-scan-before-terminate')
            owned=profile_processes(session_profile,str(FIREFOX))
            cleanup_record({**cleanup_context,'ok':True,'pids':[item['pid'] for item in owned]})
            if browser_identity and not any(x['pid']==browser_identity['pid'] for x in owned):
                cleanup_phase('tracked-firefox-presence',pid=browser_identity['pid'])
                try:os.kill(browser_identity['pid'],0)
                except ProcessLookupError:pass
                except OSError:raise RuntimeError('Firefox PID presence unverified')
                else:raise RuntimeError('Firefox PID exists but exact ownership unavailable')
            for item in owned:
                cleanup_phase('firefox-terminate',pid=item['pid'])
                expected=tracked_browsers.get(item['pid'])
                if not expected or not same_process(expected,item):raise RuntimeError('untracked Firefox identity; not signaled')
                result=terminate_owned(expected,lambda pid:observe(pid,session_profile)); cleanup.append(result)
                cleanup_record({**cleanup_context,**result,'ok':bool(result['signaled'])})
                if not result['signaled']: raise RuntimeError('Firefox ownership changed')
        except Exception as e:
            report.setdefault('cleanupErrors',[]).append(repr(e))
            cleanup_record(error_record(e,**cleanup_context))
        if driver_proc and driver_proc.poll() is None:
            cleanup_phase('driver-terminate',pid=driver_proc.pid)
            result=terminate_owned(driver_identity or {},lambda pid:observe(pid,str(PROFILE_ROOT)))
            cleanup.append(result)
            cleanup_record({**cleanup_context,**result,'ok':bool(result['signaled'])})
            if not result['signaled']: report.setdefault('cleanupErrors',[]).append('driver ownership unavailable; not signaled')
            else:
                try:
                    cleanup_phase('driver-wait',pid=driver_proc.pid)
                    code=driver_proc.wait(timeout=10)
                    cleanup_record({**cleanup_context,'ok':True,'returncode':code})
                except subprocess.TimeoutExpired as e:
                    report.setdefault('cleanupErrors',[]).append('driver failed TERM; not claiming cleanup')
                    cleanup_record(error_record(e,**cleanup_context))
        if server:
            cleanup_phase('http-shutdown',port=server.server_address[1])
            try:
                if server_serving:server.shutdown()
                server.server_close()
                cleanup_record({**cleanup_context,'ok':True})
            except Exception as e:
                report.setdefault('cleanupErrors',[]).append(repr(e))
                cleanup_record(error_record(e,**cleanup_context))
        time.sleep(.3)
        try:
            cleanup_phase('firefox-scan-after-terminate')
            remaining=profile_processes(session_profile,str(FIREFOX))
            report['remainingFirefox']=remaining
            cleanup_record({**cleanup_context,'ok':not remaining,'pids':[item['pid'] for item in remaining]})
            if remaining:raise RuntimeError('owned Firefox still exists')
            cleanup_phase('driver-exit',pid=driver_proc.pid if driver_proc else None)
            if driver_proc and driver_proc.poll() is None:raise RuntimeError('driver still exists')
            cleanup_phase('monitor-exit')
            if monitor and monitor.is_alive():raise RuntimeError('ownership monitor still alive')
        except Exception as e:
            report.setdefault('cleanupErrors',[]).append(repr(e))
            cleanup_record(error_record(e,**cleanup_context))
        # Probe every recorded port even if a previous resource failed; never claim cleanup.
        cleanup_phase('port-validation')
        report['portsReleased']=probe_ports(report.get('ports',{}),cleanup_record)
        if not report['portsReleased']:report.setdefault('cleanupErrors',[]).append('port validation failed; see per-port evidence')
        remove_profile(PROFILE_ROOT,report,cleanup_phase,cleanup_record,shutil.rmtree)
        report['cleanupActions']=cleanup
        if driver_proc and driver_proc.poll() is not None and 'drain' in locals(): drain.join(timeout=2)
        access.close()
        if not driver_proc or driver_proc.poll() is not None:dlog.close()
        report['finishedAt']=dt.datetime.now().astimezone().isoformat()
        report['cleanupVerified']=not report.get('cleanupErrors') and report.get('portsReleased',False) and report.get('profileRemoved',False)
        report['ok']=bool(report.get('ok')) and report['cleanupVerified'] and not report.get('fatal') and not report.get('cleanupErrors') and not report.get('driverLogOverflow') and all(c.get('ok',True) for c in report['checks'])
        report['cleanupRequiresIndependentVerification']=True; persist()
        persist()
        print(json.dumps({'ok':report['ok'],'checks':report['checks'],'report':str(artifacts/'report.json'),'candidateCommit':commit},ensure_ascii=False,indent=2))
    return 0 if report.get('ok') else 1

if __name__=='__main__':raise SystemExit(main())
