# 布偶救援隊 · Plush Rescue V5

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

Then visit `http://localhost:8000/`. Do not open `index.html` through `file://`; JavaScript modules need HTTP. The verifier checks original runtime SHA-256 hashes, JavaScript syntax when Node.js is available, and relative asset/import resolution under a non-root repository URL. It includes both dynamically selected hero portraits.

Browser smoke check: choose each hero, start a run, move with WASD/arrows or the touch stick, pause/resume, open settings, and restart. This version’s automated tests passed 124 Node tests and 14 DOM/renderer-stub checks. Real browser/WebGL rendering has not been revalidated for this export.

## Version and provenance

- Version: **5.0.0** / **v5-qa-r1**
- Original source commit: `129b61e36b3595f81e77e7f78d8f813bf543e94d`
- Runtime files: copied byte-for-byte from that commit’s `dist/` directory, without changing gameplay or presentation.
- `runtime-manifest.json` records every original runtime file’s size and SHA-256 hash.
- Vendored Three.js licensing is retained in `vendor/THREE-LICENSE.txt`.
- Character artwork and other project assets are included as provided; no additional redistribution license is implied.

For game changes, edit the upstream source and regenerate/reverify a fresh export. Update the manifest only after intentionally accepting a new version. This repository is the minimal runnable export, not the full development/test history.
