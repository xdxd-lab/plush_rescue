# Plush Rescue QA

Not a runtime folder: GitHub Pages serves it, but the game never loads it and
`runtime-manifest.json` does not list it. Requires Node.js 22 LTS or newer (built-in test
runner, no install) and Python 3 for the export tools. The root `.js` modules have no `package.json`, so Node must
detect ES module syntax: as of v12.1.1 (`ef9d208`), Node 20.18.0 fails without `--experimental-detect-module`
("is a CommonJS module") and passes with it; Node 24.22.1 needs no flag; Node 18 is not supported. See the table in
the root `README.md`.

| Command (from the repository root) | Covers |
|---|---|
| `node --test qa/*.test.mjs` | layout rules per viewport, invariants (V11-unchanged modules, weapon-visuals drawing identical to V11, V8/V10/V11 markers, manifest, portraits, P2 warning), ui.js helpers, keyboard, tap-to-pick (core, tap detection and timing, DROP_GEOMETRY measured against every model, ring/item/full-label hit area, shape–viewport intersection incl. portrait edges and far-plane cuts, overlap ranking, HUD cover), remembered settings, and gameplay signatures proving core.js matches V11 (`sim-signature.mjs`) |
| `node --test qa/equip-slots.test.mjs` | focused pickup choices, main/off-hand replacement and separate magic charge, two-handed equip/stow/toggle, repeated cannon pickups, sequential pickups and firing behavior |
| `node --test qa/hover-pickup.test.mjs` | mouse hover timing, target changes, hidden blink grace, long stalls, reset and repeat prevention |
| `node qa/ui-smoke.mjs` | DOM/renderer stub with the real Game: hero cards and `#heroSelect`, pause/settings, pickup, level-up (incl. 1–4 keys), cannon, notices, boss clock, V8 drag, records, blocked storage, two-finger tap-to-pick, on-screen taps in four viewports (label ends, far drops, partly visible drops at the portrait edge, HUD cover, expiry and blink dark/bright beats, slow mouse), five pause/settings/resume rounds, settings reload |
| `node qa/browser-chrome.mjs [--shots=DIR] [--views=WxH,...] [--dialogs] [--no-pickup] [--self-test=MODE]` | optional, needs Google Chrome and Node 22+ (Node 20: add `--experimental-websocket`): headless Chrome with SwiftShader WebGL, real CSS layout and DevTools-protocol mouse/touch input with explicit timestamps — boot, ring/item/label-end taps, far drops (auto-chosen visible, uncovered spot), real HUD cover, five real pause/settings/resume rounds with a per-round check of the stats checkbox and `localStorage`, slow and busy-thread mouse clicks, drag guard, second finger, reload, separate profile, blocked storage. Default views 1280×720, 390×844, 360×640, 844×390; `--views` also takes 568×320 and 800×600. `--dialogs` measures start/pause dialog reachability (wheel or touch drag to the end, Tab into view, Enter). Prints one line per check as it finishes. Slow: a full run takes many minutes. Lifecycle: see below |
| `python3 qa/regenerate-manifest.py` | rewrite runtime sizes/hashes after accepting changes |
| `python3 verify-export.py` | hashes, non-root URLs, JS syntax (when Node is present) |

Only `browser-chrome.mjs` launches a browser (Chrome only). Safari/WebKit, Firefox, screenshots (360×640, 390×844, 844×390,
568×320, 1440×900), touch devices and phone FPS are separate manual checks.

`browser-chrome.mjs` lifecycle. A running check cannot be cancelled in place: `Promise.race` only stops
waiting, while the check's CDP calls and timers would keep going. So a check that exceeds `CHECK_TIMEOUT_MS`
(default 240000) aborts the whole run: pending and later DevTools requests are rejected (nothing more reaches the
browser), the connection is closed, Chrome's process group is killed, and the run exits 1. Checks that are
reached after the abort are reported as `not run`; page work between checks (screenshots, closing or opening a
page) is refused as well, which ends the schedule, so checks that are never reached are not listed — the report
still carries `aborted` and `fatal`. Each DevTools request also has its own limit, `CDP_TIMEOUT_MS` (default
60000; loading the game in SwiftShader can keep one request busy for several seconds), with the same abort.
Setup is bounded too: `SETUP_TIMEOUT_MS` (default 15000) for the DevTools `/json/version` request and for the
WebSocket handshake. A failed assertion only fails its own check. Chrome, the local server and the temporary
profile are removed on success, failed checks, setup errors, uncaught errors and SIGINT/SIGTERM/SIGHUP; a SIGKILL
of the Node process cannot be cleaned up. `--self-test=timeout|cdp|assert|setup|handshake-http|handshake-ws|signal`
exercises these paths without the game checks.

V12.2.1 hover follow-up: Node 24.22.1 passed 82 tests and the DOM smoke passed 75 checks. A focused
Chrome 156 / SwiftShader run used real CDP mouse input to check the visible progress ring, leaving and
re-entering a drop, pickup after re-entry and a HUD-covered drop; all passed. Desktop click and 390×844
emulated touch pickup checks also passed. This is not a real phone or hardware GPU test.

CDP touch semantics used by `browser-chrome.mjs` (observed in Chrome 156): `touchStart`/`touchMove` list the points that are down;
`touchEnd` lists the points being released (an empty list releases all). Without explicit `timestamp`s, a slow
software-rendered frame makes an 80 ms tap arrive as a ~500 ms one.

CDP key semantics (observed in Chrome 156, headless): a `rawKeyDown` Enter turns the page `visibilityState`
`'hidden'` and stops `requestAnimationFrame` (synchronous evaluation still answers at once; it also happens on a
blank page and without a `char` event), so the next frame wait times out. `browser-chrome.mjs` sends Enter as one
`keyDown` with `text:'\r'`, which keeps the page visible; Tab stays `rawKeyDown`.

Isolation: each default/extra viewport runs in its own browser context. With one shared context the viewports
shared `localStorage` on the same origin, and the five settings rounds toggle stats an odd number of times, so every
second viewport started from the opposite value and its reload check saw `stats:false` (the game restored exactly
what had been stored). The reload check now first asserts that the reloaded settings equal what was stored.

Version identifier: the tests read `version`/`revision` from `build-info.json` and never repeat them;
`qa/invariants.test.mjs` asserts that `main.js`, `index.html` and `runtime-manifest.json` carry the same values,
including `source_commit` in the manifest. See
the release steps in the root `README.md` (版本識別與標注慣例).

Browser-check status.

V12.2.0 follow-up (2026-10-27, based on `17eb077`, Chrome 156, Node 24): an identical minimal Chrome
launch aborted with `SIGABRT` inside the tool sandbox but succeeded in a less restricted execution environment.
The macOS crash report places the abort during application registration, before DevTools or game checks; the
specific sandbox restriction is unknown. In the latter environment, `node qa/browser-chrome.mjs --dialogs`
passed 56/56 checks (32 game and storage, 24 dialogs), with zero failures, skipped checks or console errors.
`--no-pickup --dialogs` independently passed 24/24 and `--views=1280x720` passed 9/9. No Chrome process or
temporary profile remained. The initial full run found three stale exact settings expectations missing V12.2.0's
`autoChoose:false`; an assertion failure also left two extra browser contexts and pages alive. After correcting
the expectations and always attempting both cleanup steps, the full storage-to-dialog run passed. The first
run's later CDP timeout is consistent with interference from those live pages, but its exact Chrome mechanism
was not established. These checks do not cover real phones, Safari/WebKit, Firefox or a hardware GPU.

Further investigation (2026-10-28): five Chrome crash reports show `SIGABRT` during macOS application
registration. System logs for the same process IDs record sandbox-denied Mach service lookups immediately
before the crashes, including `com.apple.coreservices.launchservicesd` and `com.apple.windowserver.active`;
`com.apple.CoreServices.coreservicesd` was also denied in some captured cases. For example, PID 11717 had
denials at 04:14:38.057–.058 and the crash report was captured at 04:14:38.0637 (+0800). The timing and
the successful less-restricted launch support a connection to sandbox restrictions, but do not identify which
denial caused the abort or prove the source of the policy.

Historical V12.1.1 browser checks (as of `84363c8`, Chrome 156, Node 24): every run below exited 0 with no
console errors and no Chrome process or temporary profile left behind.

- `node qa/browser-chrome.mjs --dialogs`: one single run of the four default views, the storage contexts and the
  dialogs of all six views, 56/56 (32 game, 24 dialog), 559 s.
- `node qa/browser-chrome.mjs`: one continuous run of the four default views plus the storage contexts, 32/32
  (1280×720 9, 390×844 / 360×640 / 844×390 7 each, separate profile 1, blocked storage 1), 365 s.
- `--views=568x320,800x600`: 16/16 (7 and 9), 155 s.
- `--dialogs --no-pickup`, in four batches (`--views=800x600`, `1280x720`, `844x390,568x320`, `390x844,360x640`):
  24/24, 45–87 s each. Primary button initially out of view or partly visible: 800×600 start (0 px) and pause,
  844×390 pause, 568×320 pause (0 px); reached by wheel / touch drag and by Tab in every case.
- Lifecycle: `--self-test` modes (all seven on 2026-10-24; `setup`, `handshake-http`, `handshake-ws` again on
  2026-10-25), plus one real abort: before the Enter fix a `--dialogs` run hit `CDP_TIMEOUT_MS`, reported the 22
  remaining checks as `not run`, exited 1 and cleaned up.
- Not done: Safari/WebKit, Firefox, phones, real GPUs.
