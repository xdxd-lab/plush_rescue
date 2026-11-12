# V3 silent UI screenshot mode

This opt-in mode adds no workflow, required gate or deployment change. Existing Q2 invocation and result-count contract remain unchanged. Its three exact full-settings expectations now include `muted:false`, as returned by the product settings schema.

Prepared command (not yet browser-validated):

```sh
node qa/browser-chrome.mjs --v3-audio --no-pickup --views=1280x720,390x844,360x640 --require-swiftshader --shots=v3-artifacts/screenshots > v3-artifacts/report.json
```

Create the artifact directory before invoking. Chrome must be available through `CHROME`. The existing harness launches headless Chrome without an output-mute flag. This mode is silent through isolated volume-zero settings established before Start in every viewport; it does not change system sound or the default Q2 launch flags. Existing dialog reachability assertions remain in force. Additional assertions require pause state, persisted mute value, unchanged zero volume, button text, aria-pressed and unobscured visibility before/after a trusted mouse or touch click; a second click restores unmuted state. Screenshots capture each state. Fixture setup and scrolling are scripted, not a claim of all-human interaction. This does not test audible audio or fatigue.

Expected six original PNG files:

- `v3-1280x720-unmuted.png`, `v3-1280x720-muted.png`
- `v3-390x844-unmuted.png`, `v3-390x844-muted.png`
- `v3-360x640-unmuted.png`, `v3-360x640-muted.png`

The existing per-check 240s, CDP 60s and setup 15s limits remain unchanged. The V3 path stops after the first failed viewport. Existing cleanup owns Chrome process group, server and temporary profile. A future CI invocation must additionally impose a whole-process limit and independently retain cleanup evidence and all failed logs, as with the existing Q2 wrapper; that execution route is **not implemented or authorized here**. A bare success exit or PNG presence must not replace a strict report/cleanup validator and QA2 visual review.

Current CI only calls the desktop Q2 path. Therefore these six artifacts are **not yet available from CI**. Enabling this command, uploading its report/images, and making Pages depend on it requires a separately approved workflow proposal. Do not label the mode as CI-passed or the prototype as release-ready.
