#!/usr/bin/env python3
"""Prepared narrow-frame Q3 runner primitives; does not launch anything by default.

When explicitly enabled after the Q5 GPU handoff, connect to a separately prepared
Firefox WebDriver session and wrapper URL. Pointer input is used only after the
trusted client-coordinate calibration passes. No mobile/touch claim is implied.
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
TOOLS = HERE.parent
sys.path.insert(0, str(TOOLS))
import q3_runner as q3

INPUT_HOOK = r"""window.__Q3_NARROW_INPUTS=[];
for(const type of ['pointermove','pointerdown','pointerup','click','keydown','keyup'])
 addEventListener(type,e=>window.__Q3_NARROW_INPUTS.push({type,trusted:e.isTrusted,
 clientX:e.clientX??null,clientY:e.clientY??null,key:e.key||'',time:performance.now()}),true);"""


def request(url, method='GET', body=None, timeout=10):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'WebDriver HTTP {exc.code} {method} {url}: {exc.read().decode(errors="replace")}') from exc
    return json.loads(raw) if raw else {}


def command(driver, path, method='GET', body=None):
    return driver.cmd(path, method, body)


def attach_frame(driver):
    """Focus the iframe in top context, then switch into its child browsing context."""
    driver.cmd(f'/session/{driver.session}/frame', 'POST', {'id': None})
    frame_id = driver.element('#game-frame')
    if not frame_id:
        raise AssertionError('wrapper iframe #game-frame is missing')
    driver.script("document.querySelector('#game-frame').focus()")
    element_ref = {'element-6066-11e4-a52e-4f735466cecf': frame_id}
    driver.cmd(f'/session/{driver.session}/frame', 'POST', {'id': element_ref})


def viewport_evidence(driver):
    child = driver.script("""const q=window.__PLUSH_QA__,c=q?.renderer?.getContext();
return {inner:[innerWidth,innerHeight],dpr:devicePixelRatio,build:document.querySelector('#game')?.dataset.build,
revision:q?.revision,frameDocument:location.href,timeOrigin:performance.timeOrigin,
canvas:c?[c.drawingBufferWidth,c.drawingBufferHeight]:null};""")
    driver.cmd(f'/session/{driver.session}/frame', 'POST', {'id': None})
    outer = driver.script("""const f=document.querySelector('#game-frame'),r=f.getBoundingClientRect();
return {requested:f.dataset.requestedViewport,rect:{x:r.x,y:r.y,width:r.width,height:r.height},dpr:devicePixelRatio};""")
    # Keep context in child for following calls.
    attach_frame(driver)
    return {'child': child, 'outer': outer}


def install_input_hook(driver):
    driver.script(INPUT_HOOK)


def trusted_pointer_calibration(driver, x=80, y=80, tolerance=2):
    """Send a real W3C move and require captured child client coordinates to match."""
    install_input_hook(driver)
    driver.pointer(x, y)
    deadline = time.monotonic() + 2
    event = None
    while time.monotonic() < deadline:
        event = driver.script("return window.__Q3_NARROW_INPUTS.findLast?.(e=>e.type==='pointermove')||null")
        if event:
            break
        time.sleep(.05)
    if not event or not event.get('trusted'):
        raise AssertionError(f'trusted pointer calibration event not observed: {event!r}')
    if abs(event['clientX'] - x) > tolerance or abs(event['clientY'] - y) > tolerance:
        raise AssertionError(f'pointer coordinate calibration mismatch: requested=({x},{y}) observed=({event["clientX"]},{event["clientY"]})')
    return {'requested': {'clientX': x, 'clientY': y}, 'observed': event, 'tolerance': tolerance, 'passed': True}


def navigate_child_and_wait(driver, url, marker, previous_time_origin, timeout=30):
    """Navigate current child frame normally, then verify new document and warmup."""
    driver.cmd('/url', 'POST', {'url': url})
    q3.wait_new_document(driver, marker, previous_time_origin, timeout)
    install_input_hook(driver)
    return q3.q3_state(driver)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--execute', action='store_true', help='reserved explicit gate; requires an externally launched isolated WebDriver and wrapper URL')
    ap.add_argument('--webdriver', help='WebDriver base URL, e.g. http://127.0.0.1:PORT')
    ap.add_argument('--session', help='existing isolated WebDriver session id')
    ap.add_argument('--wrapper-url', help='same-origin wrapper URL with app= and size= query parameters')
    args = ap.parse_args()
    if not args.execute:
        print('Prepared only. No browser, server, candidate, or GPU work started. Pass --execute only after Q5 handoff and with an isolated session.')
        return 0
    if not (args.webdriver and args.session and args.wrapper_url):
        ap.error('--execute requires --webdriver, --session, and --wrapper-url; this runner does not launch a browser or server')
    wd = q3.WebDriver(args.webdriver.rstrip('/'), args.session)
    wd.cmd('/url', 'POST', {'url': args.wrapper_url})
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            if wd.script("return !!window.__Q3_NARROW__?.frame?.contentDocument?.readyState"):
                break
        except Exception:
            pass
        time.sleep(.1)
    else:
        raise TimeoutError('narrow wrapper or child frame did not become ready')
    attach_frame(wd)
    marker = 'q3-narrow-' + str(time.time_ns())
    wd.script('window.name=arguments[0]', [marker])
    evidence = viewport_evidence(wd)
    expected = evidence['outer']['requested']
    if evidence['child']['inner'] != [int(expected.split('x')[0]), int(expected.split('x')[1])]:
        raise AssertionError(f'child viewport mismatch: {evidence!r}')
    calibration = trusted_pointer_calibration(wd)
    print(json.dumps({'viewport': evidence, 'pointerCalibration': calibration}, indent=2))

if __name__=='__main__':raise SystemExit('Support module only; use supervisor.mjs')
