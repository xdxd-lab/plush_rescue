**[https://xdxd-lab.github.io/plush_rescue/](https://xdxd-lab.github.io/plush_rescue/)**

點擊上方連結即可在瀏覽器遊玩，不需要下載或安裝。

# 布偶救援隊 · Plush Rescue V10

Standalone static GitHub Pages export. No build step, CDN, npm install, or server backend is required. `index.html` and all game modules/assets belong at the repository root.

## Publish with GitHub Pages

1. Create a new repository and add this folder’s contents to its `main` branch. Include the hidden `.nojekyll` file. Do not nest the export inside another folder.
2. In the repository, open **Settings → Pages**.
3. Select **Deploy from a branch**, then **main** and **/ (root)**, and save.
4. Wait for GitHub’s Pages deployment to finish. Open the exact website URL shown in Settings → Pages. A project site normally uses `https://OWNER.github.io/REPOSITORY/`.

GitHub Pages availability depends on account plan and repository visibility. This export does not enable Pages or change repository settings by itself.

## Local verification

Run from this folder:

```sh
python3 verify-export.py
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`. Do not open `index.html` through `file://`; JavaScript modules need HTTP. The verifier checks recorded runtime SHA-256 hashes, JavaScript syntax when Node.js is available, and relative asset/import resolution under a non-root repository URL. It includes both dynamically selected hero portraits.

Browser smoke check: choose each hero, start a run, move with WASD/arrows or the touch stick, pause/resume, open settings, and restart. The V5 baseline passed 124 Node tests and 14 DOM/renderer-stub checks; those original suites are not included in this minimal export. V6 received focused camera numerical and JavaScript syntax checks. V7 and the V8 art checkpoint received Mac WebGL checks. Final V8 cloud validation covers model and input-event regressions; a fresh cloud browser run was blocked at browser startup, so final physical-device touch and performance remain unverified.

## Version and provenance

- Version: **10.0.0** / **v10-crowd-hud-r1**
- V10 change: cache crowd part/batch discovery with topology/material/visibility invalidation; avoid redundant permanent-HUD writes; place wrapping diagnostics below equipment and list ground mines separately.
- V10 base commit: `a51197577912dec4e805989d63f37ef0ffb6240f`
- V10 verification: exact character/instance-buffer comparisons, baseline-equivalent HUD transitions, deterministic mine/count scenarios and numeric bottom-layout checks. Browser rendering and phone FPS remain unverified. Enemy spawning, limits, combat, camera and shadows are unchanged.
- V10 count clarification: enemy count includes ordinary enemies and bosses; mines are the separate game.bombs collection and never contribute to enemy count.
- V9 change: bake authored static character-local transforms and update animated local transforms only when changed; keep required descendant world transforms.
- V9 verification: exact matrix/instance comparisons across movement, rescue, pooling, heroes and weapon swaps. Cloud Node CPU microbenchmarks showed 7–13% less time in the measured character/matrix segment; this is not a phone FPS measurement. Browser/device verification remains unavailable.
- V9 base commit: `708ef19d18adbdec88faca48387328c5c79d8800`
- V9 maintenance: future edits to baked decorative position/rotation/scale must explicitly call updateMatrix(), or keep that node dynamic. Gameplay, enemy counts, touch, camera, shaders and shadows are unchanged.
- V8 change: clearer worn-plush expressions, localized bright modern facades across three maps, and fullscreen non-interactive drag movement with UI priority.
- V8 verification: 44 cloud Node input/event regressions and 17 cloud Node model/scope checks passed. Cloud Chromium launch was blocked by the execution environment; these are not real-browser or phone FPS results.
- V8 base commit: `6ea5194842d64e205b4569091f8eb88aeed727c4`
- V7 change: rescued plush appearance only; rounded silhouettes, soft ears and clear expressions. V6 camera angles and gameplay are retained.
- V7 verification: 31 focused Node regressions and 18 Mac Safari WebGL checks passed; physical-phone performance was not measured.
- Original source commit: `129b61e36b3595f81e77e7f78d8f813bf543e94d`
- V6 base export commit: `791e58ea29748ce2429733dd81207eba2565dd87`
- V6 change: camera azimuth 32° → 60° and elevation 41° → 40°. Distance 29, landscape/portrait spans 25.6/28, character scale and gameplay are unchanged.
- Runtime files: original export plus the V6 camera, V7 rescued-plush, and V8 visual/touch changes described above.
- `runtime-manifest.json` records every current runtime file’s size and SHA-256 hash.
- Vendored Three.js licensing is retained in `vendor/THREE-LICENSE.txt`.
- Character artwork and other project assets are included as provided; no additional redistribution license is implied.

For game changes, edit the upstream source and regenerate/reverify a fresh export. Update the manifest only after intentionally accepting a new version. This repository is the minimal runnable export, not the full development/test history.
