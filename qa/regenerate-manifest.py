#!/usr/bin/env python3
"""Rewrite runtime-manifest.json sizes/hashes for the current runtime files.

Run only after intentionally accepting a new version. qa/ and repository
metadata are not runtime files. Python 3 stdlib only.
Usage (from the repository root): python3 qa/regenerate-manifest.py
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = [
    'assets/polar-portrait.png', 'assets/pudding-portrait.png',
    'boss-visuals.js', 'build-info.json', 'camera.js', 'characters.js', 'core.js',
    'crowd.js', 'effects.js', 'index.html', 'keyboard.js', 'lighting.js', 'main.js',
    'maps.js', 'style.css', 'ui.js',
    'vendor/THREE-LICENSE.txt', 'vendor/three.core.js', 'vendor/three.module.js',
    'weapon-visuals.js', 'weapons.js',
]

LAYOUT = ('Static V12.1.1 export based on V12.1 (dd01898); on-screen tap-to-pick with full '
          'ring/item/label hit area and HUD cover, remembered settings, commercial HUD/dialog '
          'redesign, SVG icons and 256px portraits.')

manifest_path = ROOT / 'runtime-manifest.json'
manifest = json.loads(manifest_path.read_text())
info = json.loads((ROOT / 'build-info.json').read_text())
manifest['version'] = info['version']
manifest['revision'] = info['revision']
manifest['source_commit'] = info['source_commit']
manifest['layout'] = LAYOUT
files = []
for name in RUNTIME:
    data = (ROOT / name).read_bytes()
    files.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
manifest['files'] = files
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
print(f'Wrote {len(files)} runtime entries for {manifest["version"]} / {manifest["revision"]}.')
