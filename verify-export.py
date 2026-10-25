#!/usr/bin/env python3
"""Verify the runtime against runtime-manifest.json (sizes, SHA-256), project-site URL
routing (relative, in-repository, case-exact references) and JavaScript syntax when Node
is available. Python 3 stdlib only.

History: originally written for the V5 export; the checks are not tied to a version.
"""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parent
BASE = 'https://example.invalid/a-nonroot-repository/'
manifest = json.loads((ROOT / 'runtime-manifest.json').read_text())
paths = {entry['path'] for entry in manifest['files']}
references = []

for entry in manifest['files']:
    path = ROOT / entry['path']
    data = path.read_bytes()
    assert len(data) == entry['bytes'], f"Size mismatch: {entry['path']}"
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], f"Hash mismatch: {entry['path']}"
    assert not path.is_symlink(), f"Unexpected symlink: {entry['path']}"

class ResourceParser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        assert tag != 'base', 'Unexpected HTML base URL'
        for attr in ('src', 'href', 'poster'):
            if attrs.get(attr):
                references.append(('index.html', attrs[attr]))
        assert 'srcset' not in attrs, 'Review new srcset before exporting'

ResourceParser().feed((ROOT / 'index.html').read_text())
for filename in sorted(paths):
    if filename.endswith('.js'):
        code = (ROOT / filename).read_text()
        # Captures static imports/exports, side-effect imports and literal dynamic imports.
        pattern = r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"\n]+)['"]'''
        references.extend((filename, url) for url in re.findall(pattern, code))
        # Application code has one dynamic resource expression: hero portrait selection.
        # Vendored Three.js includes generic loaders, unused by this game's local geometry.
        if not filename.startswith('vendor/'):
            assert not re.search(r'\bfetch\s*\(|\.load\s*\(|\bnew\s+URL\s*\(', code), \
                f'Review additional dynamic resource loader in {filename}'
    elif filename.endswith('.css'):
        code = (ROOT / filename).read_text()
        references.extend((filename, url.strip().strip('\"\''))
                          for url in re.findall(r'url\(\s*([^)]*?)\s*\)', code))
        assert '@import' not in code, 'Review CSS imports before exporting'

main = (ROOT / 'main.js').read_text()
assert "'assets/'+game.heroId+'-portrait.png'" in main, 'Review changed portrait expression'
for hero in ('pudding', 'polar'):
    references.append(('index.html', f'assets/{hero}-portrait.png'))

for origin, target in references:
    assert not target.startswith('/'), f'Absolute-root resource: {origin} -> {target}'
    url = urlsplit(urljoin(urljoin(BASE, origin), target))
    assert url.netloc == 'example.invalid' and url.scheme == 'https', \
        f'External resource: {origin} -> {target}'
    prefix = urlsplit(BASE).path
    assert url.path.startswith(prefix), f'Resource escapes repository: {origin} -> {target}'
    local = unquote(url.path[len(prefix):])
    assert local in paths, f'Missing or case-mismatched resource: {origin} -> {target}'
    assert (ROOT / local).is_file(), f'Missing file: {local}'

node = shutil.which('node')
jsfiles = sorted(name for name in paths if name.endswith('.js'))
if node:
    for filename in jsfiles:
        subprocess.run([node, '--input-type=module', '--check'],
                       input=(ROOT / filename).read_bytes(), check=True, capture_output=True)
    syntax = f'{len(jsfiles)} JavaScript modules parsed'
else:
    syntax = 'JavaScript syntax NOT checked: install Node.js to include this check'
print(f"PASS: {len(paths)} runtime hashes; {len(references)} non-root resource references; {syntax}.")
print('Browser/WebGL rendering is a separate manual check; this verifier does not launch a browser.')
