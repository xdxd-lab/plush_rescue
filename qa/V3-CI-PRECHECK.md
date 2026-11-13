# V3 silent UI screenshot mode

This opt-in mode is called by an independent V3 CI job. Existing Q2 invocation, budget and result-count contract remain unchanged. Its three exact full-settings expectations now include `muted:false`, as returned by the product settings schema.

Underlying command (not yet browser-validated; CI uses the supervisor below):

```sh
node qa/browser-chrome.mjs --v3-audio --no-pickup --views=1280x720,390x844,360x640 --require-swiftshader --shots=v3-artifacts/screenshots > v3-artifacts/report.json
```

Create the artifact directory before invoking. Chrome must be available through `CHROME`. The existing harness launches headless Chrome without an output-mute flag. This mode is silent through isolated volume-zero settings established before Start in every viewport; it does not change system sound or the default Q2 launch flags. Existing dialog reachability assertions remain in force. Additional assertions require pause state, persisted mute value, unchanged zero volume, button text, aria-pressed and unobscured visibility before/after a trusted mouse or touch click; a second click restores unmuted state. Screenshots capture each state. Fixture setup and scrolling are scripted, not a claim of all-human interaction. This does not test audible audio or fatigue.

Expected six original PNG files:

- `v3-1280x720-unmuted.png`, `v3-1280x720-muted.png`
- `v3-390x844-unmuted.png`, `v3-390x844-muted.png`
- `v3-360x640-unmuted.png`, `v3-360x640-muted.png`

The existing per-check 240s, CDP 60s and setup 15s limits remain unchanged. The V3 path stops after the first failed viewport. Actual renderer and dimensions are read for each viewport and must meet the SwiftShader requirement. State evidence includes before/muted/restored values. These click/touch screenshots do not establish keyboard-focus acceptance.

## Bounded CI route

```sh
node qa/v3-ci-runner.mjs --output=v3-artifacts/run
```

The parent `v3-artifacts` directory must exist, but `run` must not exist. No prior images can be reused. The Linux-only supervisor records exact checkout SHA, command, runtime/font versions and original stdout/stderr. It allows one 720s working window, TERM then up to 10s before KILL, and a 750s total deadline including cleanup. This reserves 150s of the 15-minute job for provisioning/upload; provisioning taking longer may make the job fail rather than extend its budget. No retries. The supervisor records ownership using the Chrome PID's Linux start time, process group and unique profile command argument; forced cleanup is a failure. It never deletes a profile to make cleanup pass.

Success requires exit zero, no timeout/interruption/overflow, exactly the three ordered checks and all per-view states, real SwiftShader observations, zero errors/abort/fatal/notRun, exactly six CRC-checked/decompressed PNGs of the expected dimensions, and confirmed runner exit, owned Chrome group absence, both ports refused and bindable, and removed profile. Missing ownership or cleanup evidence fails closed. PNG integrity does not replace QA2 visual review, nor does font installation prove legibility.

The `v3-ui` job depends on `test`, has a 15-minute cap and always attempts artifact upload (including failures). Pages build depends on `test`, `chrome-smoke` and `v3-ui`. Existing push-main conditions, concurrency, permissions and freshness checks remain. The implementation is local only: **no actual CI run or six-image artifact has yet been obtained**. QA1 must verify the fixed commit's CI evidence and QA2 must inspect its six original images before PM may approve later integration. No audible listening or fatigue acceptance is implied.
