# V3-A1 audio prototype offline validation

Date: 2026-11-12. Branch: `feat/v3-audio-a-20261112`. This note records QA-only validation against the approved A prototype design. It does not claim audible quality or browser playback acceptance.

## Full offline Node suite

Node 24.22.1.

```sh
node --test qa/*.test.mjs
```

Exit status: 0. Result: **248 tests passed, 0 failed**.

## DOM smoke

```sh
node qa/ui-smoke.mjs
```

Exit status: 0. Result: **89 checks passed**. This uses Node DOM/renderer stubs, not a browser or WebGL verification.

The first smoke attempt exposed a stale QA hook: it intercepted `audio.play`, while the prototype submits events through `playEvents`. The test was updated to capture the batch API and verify the same event array, event count, and rescue events remain available to the visual path. A later smoke attempt exposed legacy expected settings objects without the new `muted` default; those QA fixtures were updated to include `muted: false` or test strict sanitization. No runtime defect was found.

## Coverage

- Strict boolean `muted` validation; legacy settings without `muted`; exact preservation of `volume: 0`; storage read/write failures retain session preferences.
- Audio context is not constructed while muted or at zero volume. Constructor and synchronous/asynchronous `resume()` failures degrade quietly; rejected resume produces no unhandled rejection.
- Fake AudioParams cover master gain initialization, change-only ramp scheduling, fade/stop, and per-voice gain. Oscillator `onended` releases voices.
- Event whitelist excludes `hit`, ally events, unknown, and inherited property names. Event batches are deduplicated, sorted by priority, and leave the caller's event list and order untouched. Tests cover 4 total voices, at most 3 lower-priority voices, audio-time cooldowns, hard-cap behavior, and no queue after pause.
- Pause fades continue to occupy slots until `onended`; rapid resume cannot exceed the cap. A suspended context rejects new voices while paused voices stay capped until `onended`; rapid mute/pause transitions do not schedule duplicate fade stops. Master mute/zero-volume stops voices.
- An offline DOM stub invokes the actual dialog mute and slider handlers, checking the semantic button, `aria-pressed`, readable label, persistence, unchanged volume across mute, slider changes that do not unmute, and no context while muted.
- An input-controller stub routes Escape resume through the common resume callback. The UI smoke verifies audio receives the same event batch while the visual event collection remains intact.
- Existing pickup/settings cases were updated for the new schema; runtime-manifest and locked-module invariants passed.

## Syntax and export checks

All six changed runtime modules passed Node syntax checks: `audio.js`, `dialogs.js`, `input-controller.js`, `main.js`, `settings-store.js`, and `ui.js`.

```sh
PATH="<Node 24 bin>:$PATH" python3 verify-export.py
```

Exit status: 0. Output: `PASS: 42 runtime hashes; 84 non-root resource references; 29 JavaScript modules parsed.`

## Limits

No browser, Web Audio device, sound playback, or audible evaluation was started. The AudioContext, AudioParams, oscillators, DOM, and input routing are fakes/stubs. These checks do not validate real browser gesture policy, audible balance, perceived priority, fatigue, real page focus behavior, or performance. The runtime edits were present in the shared worktree before this QA task; this task changed QA tests and this validation note only, and did not commit.
