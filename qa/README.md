# Plush Rescue QA

Not a runtime folder: GitHub Pages serves it, but the game never loads it and
`runtime-manifest.json` does not list it. Requires Node.js 22 LTS or newer (built-in test
runner, no install) and Python 3 for the export tools. The root `.js` modules have no `package.json`, so Node must
detect ES module syntax: as of v12.1.1 (`ef9d208`), Node 20.18.0 fails without `--experimental-detect-module`
("is a CommonJS module") and passes with it; Node 24.22.1 needs no flag; Node 18 is not supported. See the table in
the root `README.md`.

| Command (from the repository root) | Covers |
|---|---|
| `node --test qa/*.test.mjs` | layout rules per viewport, invariants (V11-unchanged modules, selected weapon geometry/material properties matching the V11 fixture (not pixel-identical rendering), V8/V10/V11 markers, manifest, portraits, P2 warning), ui.js helpers, keyboard, tap-to-pick (core, tap detection and timing, DROP_GEOMETRY measured against every model, ring/item/full-label hit area, shape–viewport intersection incl. portrait edges and far-plane cuts, overlap ranking, HUD cover), drop label policy, size, texture and hero slide, mine visuals, remembered settings, and gameplay signatures proving core.js matches V11 (`sim-signature.mjs`) |
| `node --test qa/equip-slots.test.mjs` | focused pickup choices, main/off-hand replacement and separate magic charge, two-handed equip/stow/toggle, repeated cannon pickups, sequential pickups and firing behavior |
| `node --test qa/hover-pickup.test.mjs` | mouse hover timing, target changes, hidden blink grace, long stalls, reset and repeat prevention |
| `node qa/ui-smoke.mjs` | DOM/renderer stub with the real Game: hero cards and `#heroSelect`, pause/settings, pickup, level-up (incl. 1–4 keys), cannon, notices, boss clock, V8 drag, records, blocked storage, two-finger tap-to-pick, on-screen taps in four viewports (label ends, far drops, partly visible drops at the portrait edge, HUD cover, expiry and blink dark/bright beats, slow mouse), five pause/settings/resume rounds, settings reload |
| `node qa/browser-chrome.mjs [--shots=DIR] [--views=WxH,...] [--dialogs] [--no-pickup] [--self-test=MODE]` | optional, needs Google Chrome and Node 22+ (Node 20: add `--experimental-websocket`): headless Chrome with SwiftShader WebGL, real CSS layout and DevTools-protocol mouse/touch input with explicit timestamps — boot, ring/item/label-end taps, far drops (auto-chosen visible, uncovered spot), real HUD cover, five real pause/settings/resume rounds with a per-round check of the stats checkbox and `localStorage`, slow and busy-thread mouse clicks, drag guard, second finger, reload, separate profile, blocked storage. Default views 1280×720, 390×844, 360×640, 844×390; `--views` also takes 568×320 and 800×600 and now limits the sticky start/resume dialog check (320×568, 360×640, 390×844, 844×390, 568×320, 800×600, 1280×720) to the named sizes too (sizes outside that list are reported on stderr as skipped); without `--views` all seven run as before. `--dialogs` measures start/pause dialog reachability (wheel or touch drag to the end, Tab into view, Enter). Prints one line per check as it finishes. Slow: a full run takes many minutes. Lifecycle: see below |
| `node --test qa/shader-warmup.test.mjs` | deterministic staging, visible-material coverage, compile/program-query error handling, stale callbacks, late program exclusion and failed-run retry policy; Node stubs, not GPU performance |
| `node --test qa/enemy-variety.test.mjs` | ranged/dash state rules, warning mesh bounds/material contrast, reduced-motion opacity and mesh cleanup; not final scene visibility |
| `python3 qa/regenerate-manifest.py` | rewrite runtime sizes/hashes after accepting changes |
| `python3 verify-export.py` | hashes, non-root URLs, JS syntax (when Node is present) |

Among the repository commands listed above, only `browser-chrome.mjs` launches a browser (Chrome only).
Firefox and Safari evidence from external Q3 tools is recorded separately by release; it is not coverage of
this Chrome command. Physical touch devices and phone FPS require separate checks.

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

V12.3.0 (boss allies and drop label policy): Node 24.22.1 passed 111 tests and the DOM smoke passed 78 checks.
`node qa/browser-chrome.mjs` (Chrome 156 headless / SwiftShader) passed 32 of 32 with no console errors. Hover
pickup with two allies present, the ally timer freezing during a pickup comparison and the 3-label portrait
budget were checked separately in headed Chrome at 390×844. This is not a real phone or hardware GPU test.

V12.3.1 (30-second allies, label hover through dark beats): Node 24.22.1 passed 111 tests and the DOM smoke
passed 79 checks after the version update. `node qa/browser-chrome.mjs` passed 32 of 32 on 4801d51, before
the version-only update; the 30-second notice and ring scale were checked in headed Chrome at 390×844. Desktop
Safari passed start, move, pickup, upgrade, pause and reload on v12.3.0 (reported by the main agent), not on
12.3.1 and not on a phone.

V12.3.2 (main-weapon trails and hit feedback): Node 24.22.1 passed 118 tests and the DOM smoke passed 80 checks
after the version update. `node qa/browser-chrome.mjs` passed 32 of 32 on d500422 (after the trail-start fix,
before the version-only update); it does not check the trails or hit effects themselves. The before/after
screenshots in headed Chrome at 390×844 were taken before the trail-start fix. Reduced motion and low quality
were checked in Node only. Not tested in Safari, Firefox, on a phone or on a hardware GPU.

V12.3.3 (brand assets): Node 24.22.1 passed 118 tests and the DOM smoke passed 80 checks after the version
update. `node qa/browser-chrome.mjs` passed 32 of 32 on 2938c73, before the version-only update; the dialog
buttons that need scrolling are the same as in V12.3.2. Start and pause dialog heights were measured unchanged
in headed Chrome at 360×640, 390×844, 844×390 and 1280×720. Not tested in Safari, Firefox or on a phone.

V12.3.4 (start and resume visible in short dialogs): Node 24.22.1 passed 119 tests and the DOM smoke passed 80
checks after the version update. On da86f2f, before the version-only update, bounded headless runs passed:
`--no-pickup --dialogs` 35/35 and `--views=844x390,568x320` 21/21, both with no console errors. An earlier
unbounded full run on b1efecb was stopped by SIGTERM during the dialog checks; the full pickup suite at
1280x720, 390x844 and 360x640 was not rerun after da86f2f before the release. After the release, on f3e171e,
one bounded run per size (150 s per check) passed `--views=1280x720` 16/16, `--views=390x844` 14/14 and
`--views=360x640` 14/14 with no console errors; `--dialogs` and the other sizes were not rerun. An independent
Claude in Chrome check by another agent found start and resume visible and tappable on open at 11 sizes
(300x400 to 1280x720), with real Tab and Enter only at 360x640. Not tested in Safari, Firefox or on a phone.

V12.3.5 (readable drop labels, mine fuse ring): Node 24.22.1 passed 147 tests and the DOM smoke passed 83
checks after the version update. On 14aee6a, before the version-only update, Chrome 157 headless passed
`--dialogs` 67/67 and `--dialogs --views=844x390,568x320` 29/29, with no console errors. Label taps now need a
drawn label and must miss once it is removed, because the older checks passed on small landscape windows through
the item's tap margin. One full run on 0a64950 found a new page already running at 390x844 and 800x600 and a
60 s Enter timeout at 1280x720; repeat runs did not reproduce these and the cause is unknown, so the dialog
button checks now record page inputs. Not tested in Safari, Firefox, on a phone or a hardware GPU, and label
legibility at low quality was not checked.

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

V12.4.0 (more upgrades, telegraphed spitter and dasher enemies, touch feedback): Node 24.22.1 passed 180 tests and
the DOM smoke passed 85 checks after the version update; `node qa/browser-chrome.mjs --dialogs` passed 68 of 68 with
no console errors on the release files. Pickup regression at 1280x720, 390x844 and 360x640 passed 16/14/14 on
3f72408. Enemy warnings were screenshotted on 4f4a3d2 with a separate script outside the repository (`game.step`
driven); the dasher lane has low contrast in grayscale on the dark map. Not tested in Safari, Firefox, on a phone or
a hardware GPU.

V12.5.0 (2026-11-11, shader warm-up and clearer dash lanes): final Node checks passed 207 tests and the DOM
smoke passed 88 checks. Export verification passed 36 hashes / 68 references / 24 JS modules. The complete
Chrome 157 headless / SwiftShader `--dialogs` run passed 68/68 with no console errors. The three maps, wind-up
progress, grayscale and reduced-motion dash lanes were compared against the prior release in a separate capture
harness; the lane is fully in frame, while local character/label overlap can still occur. A single Apple M4 Max
Metal performance sample is documented in the root CHANGELOG, including driver-cache and diagnostic-setting
confounders; it is not a phone FPS result.

As of V12.5.0, Firefox 160 headless, attached with geckodriver 0.37.1 / Marionette and a disposable profile, passed the core
interaction matrix at actual 1280x720. The requested 390x844 headless matrix was not run because content width
bottomed at 500; native Firefox had only partial checks at a 390x844 iframe. Safari only reached the title page,
with WebGL and gameplay interaction unverified. These were one-off external test tools, not new repository or
CI commands. This is the V12.5.0 snapshot; see that CHANGELOG section for exact coverage and setup/input distinctions.
Subsequent V12.5.1 and [V12.6.0 verification](../docs/validation-v12.6.0.md) completed the Firefox core matrix
at 1280×720, 360×640 and 390×844 using actual same-origin iframe dimensions. Q3 remains open for Safari,
whose automation session requires Allow remote automation; no setting was changed. These are not phone tests.
The V12.4.0 count of 85 above is a historical snapshot, not the current smoke total.

## Locked modules (lock manifest)

`qa/locked-modules.json` lists the modules frozen since V11 (`cbfa10e`): `camera.js`, `characters.js`, `crowd.js`,
`maps.js`, `weapons.js`, `lighting.js`, `effects.js`. Each entry records `path`, `sha256`, `locked_since`, `reason` and
`approved_changes`. `qa/invariants.test.mjs` compares every locked file's SHA-256 with its entry, and
`qa/locked-modules.test.mjs` checks the manifest itself against an independent V11 baseline: all seven paths must be
present, an empty approval history must retain the V11 hash, and approvals must chain from that hash through to the
current `sha256`. Its synthetic cases also check rejection of missing entries and broken or absent approval chains.

A failing lock check means a locked file changed. To change one:

1. Get the user's explicit approval for that change (the lock is a process guard, not a technical one).
2. Make the change and, if it is a runtime file, regenerate the runtime manifest (`python3 qa/regenerate-manifest.py`).
3. Register the approval: `python3 qa/approve-lock-change.py --path camera.js --reason "..." --approved-by "..."`.
   It writes the file's current SHA-256 as the new lock and appends `{date, approved_by, reason, old_sha256,
   new_sha256}` to `approved_changes`. It refuses unknown paths and files that still match their lock.
4. Run `node --test qa/*.test.mjs` and `python3 verify-export.py`, then commit the manifest change with the file change.
5. Note the unlock in CHANGELOG.md in the same release.

The script only records what was approved; it does not check approval itself. Run it only after the user has approved.

### E5 detailed state signature (version 1)

Run `node --test qa/state-signature-v1.test.mjs`. The 16 long-script cases use
seed 1, 7,200 steps, both `autoEquip` settings and all eight combinations of
`bossAllies`, `upgradeVariety`, and `enemyVariety`. The digest records a stable
five-decimal projection of enemies (role, position, HP, boss/attack timers and
dash phase), hazards (kind, owner, geometry, timing and hit), allies (life,
cooldown, position and rescues), and relevant player/combat state. The test
also compares `stepsCompleted` to the independently generated baseline value
and asserts all 7,200 `step` calls completed for every case. The 16 new
metadata values were computed by running the same signature code with the
**unformatted** 274 `Game`; existing digest and `seen` entries were checked
unchanged before writing them. A separate forced scenario
observes both enemy roles, both hazard hits, dash phases and ally timers.

`state-signature-v1.goldens.json` was generated against the **unformatted**
`core.js` at commit `274e5dbaf1320490df62c532b8b8322a23b31415`: extract that
commit's `core.js` and `weapons.js` to an isolated directory, import its `Game`,
then pass it to `signatureV1` and `targetedV1`. The baseline file was produced
before comparison with the formatted `core.js`; existing `sim-signature.mjs`,
core-equivalence and upgrade goldens are unchanged. The signature is scoped to
these deterministic scenarios, not a proof for every possible game state.

For the E5 formatting commit, Prettier 3.6.2 ran with `--single-quote
--trailing-comma none --print-width 100 --arrow-parens avoid`. Its output also
normalizes numeric literal spelling (for example `.8` to `0.8`), so the diff
is more than whitespace. Parsing original and formatted files with Prettier's
Babel parser bundled with Prettier 3.6.2, removing location/comment/raw metadata and comparing the
full AST gave identical SHA-256
`a02291a0a12e1d7822b7987b118ecd89fd4a8a0db69c99288e5029a0b1b83bec`.
No expression, statement, property, or evaluation order changed. This AST
check and the signatures give complementary evidence, with the usual limit
that the scripts exercise specific states.

E5's independent recheck extracted baseline `core.js` and `weapons.js` from
274 into a fresh scratch directory and recalculated all 16 cases plus the
forced scenario against both implementations. Digest, observed branches and
completed steps matched. The pre-existing signatures/goldens and all seven
locked modules were byte-identical to the baseline. At `bda6964`, the full
required checks from the unchanged runtime were 224 Node tests, 88 DOM smoke
checks, and export 36 hashes / 68 references / 24 modules; the final step
witness change additionally passed all 17 focused tests.

The projection is sampled every 20 steps and rounded to five decimals. The
long script deliberately keeps the player invulnerable, so observed hazard
hits do not establish damage balance. Targeted ally timer observations are
not a standalone proof of the full 30-second lifetime; existing boss-allies
tests cover that behavior. These limits matter when extending this suite.

Allocation optimization was assessed but not implemented: there is no
allocation profile establishing a bottleneck or benefit. Candidate paths
for later profiling include `steerEnemy` map/filter/sort chains, enemy array
copies in `step`, and projectile/area-hit handling. Preserve RNG and numeric
evaluation order if revisiting them; formatting and the new suite do not
by themselves demonstrate a speed or memory improvement.

## E4 controller boundaries

`main.js` composes four controllers. It remains the single RAF, reset and
shader-warmup owner; there is no reverse import from a controller to main.

| Module | Responsibility |
| --- | --- |
| `dialogs.js` | Start/pause/settings/choice/result markup and actions, stale callback guards |
| `pickup.js` | Last-render projection, drop hit shapes, queued taps and mouse hover |
| `input-controller.js` | One-time pointer/keyboard/gesture/focus listeners, input clearing and movement |
| `render-sync.js` | World pools, model synchronization and camera update |

Mutable game/hero state is obtained through live getters. A reset does not
create another input controller or register listeners again. During warmup,
main temporarily swaps the game inside its existing try/finally; render-sync
therefore observes the staged game and then the restored live game. Preserve
that lifetime, event order, pickup identity checks and last-render hit testing
when editing these modules. Existing QA keys remain compatible.

At extraction commit `47b5995`, independent checks passed: Node 224, DOM 88,
export 40 hashes / 82 references / 28 modules, no module import cycle, and
unchanged core/seven locked modules/pre-existing goldens/version identity.
DOM stubs do not establish trusted browser event dispatch or listener counts;
the release's final real-browser interaction results are recorded in
[`docs/validation-v12.5.1.md`](../docs/validation-v12.5.1.md).

## R4 / V2 atlas verification

The reproducible input tool is `tools/atlas/rebuild.py`; its README records
the tested Python/Pillow versions and source provenance. Independent normal
and optimized-Python builds matched the whole reference RGBA image, including
RGB under zero alpha. Do not replace that reference or regenerate expected
hashes from a changed candidate merely to make a test pass.

V2 uses only the star_09 hit flash. The bounded trail/puff behavior and
100/32/96 capacities remain unchanged. Pending, failed and invalid textures
must keep the full-UV CanvasTexture fallback. Generation checks prevent old
callbacks from installing stale maps; browser request coalescing is not proof
of independent HTTP callback ordering. Context restoration needs actual GPU
render evidence, not only a ready flag.

A 0.16-second flash can expire between separate CDP calls. Controlled visual
checks must settle/freeze the test page's RAF, render a same-age hit away from
HUD/labels, and compare raw before/after pixels with the actual mesh matrix
and UV. Keep natural-loop checks separate from these frozen fixtures.
Results and raw examples are in [the release validation scope](../docs/validation-v12.6.0.md).

Full macOS SwiftShader `--dialogs` runs in this audit exceeded seven minutes.
`CHECK_TIMEOUT=240s` bounds an individual check, not the entire suite. Use a
retained asynchronous Node session with bounded polling, or a sufficiently
long overall runner budget. A wrapper timeout must remain an orchestration
diagnostic; do not label it a game assertion failure or skip checks to fit it.
If a wrapper kills Node before its finally runs, verify and stop only that
test's recorded independent Chrome group/profile before starting another run.

## Q6 long-run baseline

`q6-longrun.mjs` runs a seeded, core-only 20-minute simulation across the two
heroes and three map indices. It records natural-health cases first and only
adds same-seed invulnerability diagnostics after early death. These are
repeatable simulation measurements, not browser or balance acceptance. The
scope, decision policy and interpretation limits are in
[`q6-longrun-protocol.md`](./q6-longrun-protocol.md); the compact first-run
baseline and per-minute checkpoints are in
[`q6-longrun-summary.json`](./q6-longrun-summary.json). The human playtest
sheet is deliberately unfilled until a participant is available:
[`q6-human-playtest.md`](./q6-human-playtest.md).
