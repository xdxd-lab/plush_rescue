# Plush Rescue QA

Not a runtime folder: GitHub Pages serves it, but the game never loads it and
`runtime-manifest.json` does not list it. Requires Node.js 18+ (built-in test
runner, no install) and Python 3 for the export tools.

| Command (from the repository root) | Covers |
|---|---|
| `node --test qa/*.test.mjs` | layout rules per viewport, invariants (V11-unchanged modules, weapon-visuals drawing identical to V11, V8/V10/V11 markers, manifest, portraits, P2 warning), ui.js helpers, keyboard, tap-to-pick (core, tap detection and timing, DROP_GEOMETRY measured against every model, ring/item/full-label hit area, shape–viewport intersection incl. portrait edges and far-plane cuts, overlap ranking, HUD cover), remembered settings, and gameplay signatures proving core.js matches V11 (`sim-signature.mjs`) |
| `node qa/ui-smoke.mjs` | DOM/renderer stub with the real Game: hero cards and `#heroSelect`, pause/settings, pickup, level-up (incl. 1–4 keys), cannon, notices, boss clock, V8 drag, records, blocked storage, two-finger tap-to-pick, on-screen taps in four viewports (label ends, far drops, partly visible drops at the portrait edge, HUD cover, expiry and blink dark/bright beats, slow mouse), five pause/settings/resume rounds, settings reload |
| `python3 qa/regenerate-manifest.py` | rewrite runtime sizes/hashes after accepting changes |
| `python3 verify-export.py` | hashes, non-root URLs, JS syntax (when Node is present) |

None of these launch a browser. Screenshots (360×640, 390×844, 844×390,
568×320, 1440×900), touch devices and phone FPS are separate manual checks.
