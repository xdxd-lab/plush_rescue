#!/usr/bin/env python3
"""Rebuild the audited 18-cell Kenney atlas from versioned source PNGs.

Requires Pillow. Refuses existing output files; never modifies reference or input.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCES = ROOT / 'tools/atlas/sources'
REFERENCE = ROOT / 'tools/atlas/reference/particles.png'
SELECTION = ROOT / 'docs/materials-selection.json'
CELL, PAD, PITCH, WIDTH, HEIGHT = 256, 2, 260, 2048, 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def checked_sources(source_root, selection):
    require(len(selection['sources']) == 3, 'expected exactly three source packs')
    require({pack['id'] for pack in selection['sources']} ==
            {'particle-pack', 'light-masks', 'smoke-particles'}, 'source pack IDs differ')
    require(len(selection['items']) == selection['atlas']['count'] == 18,
            'expected exactly 18 atlas items')
    sources = {}
    for pack in selection['sources']:
        license_path = source_root / pack['id'] / 'License.txt'
        require(sha(license_path.read_bytes()) == pack['license_sha256'],
                f'license SHA-256 mismatch: {pack["id"]}')
    for item in selection['items']:
        path = source_root / item['source_pack'] / (item['name'] + '.png')
        data = path.read_bytes()
        require(len(data) == item['bytes'] and sha(data) == item['sha256'],
                f'PNG size or SHA-256 mismatch: {item["name"]}')
        with Image.open(path) as image:
            require(image.size == (CELL, CELL) and image.mode == 'RGBA' and
                    tuple(item['dimensions']) == (CELL, CELL),
                    f'PNG dimensions or mode mismatch: {item["name"]}')
            sources[item['name']] = image.copy()
    require(len(sources) == 18, 'duplicate or missing source names')
    return sources


def build(sources, selection):
    atlas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    entries = []
    for index, item in enumerate(selection['items']):
        x = (index % (WIDTH // PITCH)) * PITCH + PAD
        y = (index // (WIDTH // PITCH)) * PITCH + PAD
        require(y + CELL <= HEIGHT, 'atlas cells do not fit')
        box = {'x': x, 'y': y, 'w': CELL, 'h': CELL}
        uv = {'u0': round(x / WIDTH, 6), 'v0': round(y / HEIGHT, 6),
              'u1': round((x + CELL) / WIDTH, 6), 'v1': round((y + CELL) / HEIGHT, 6)}
        require(box == item['atlas_px'] and uv == item['atlas_uv'],
                f'atlas position or UV mismatch: {item["name"]}')
        atlas.paste(sources[item['name']], (x, y))
        entries.append({'name': item['name'], 'source_pack': item['source_pack'],
                        'source': f"{item['source_pack']}/{item['name']}.png",
                        'sha256': item['sha256'], 'px': box, 'uv': uv,
                        'purpose': item['purpose'], 'blend': item['blend']})
    return atlas, entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=DEFAULT_SOURCES)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'build/atlas')
    args = parser.parse_args()
    source_root = args.source_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir == source_root or source_root in output_dir.parents or output_dir == REFERENCE.parent or REFERENCE.parent in output_dir.parents:
        parser.error('output must not overwrite sources or reference')
    png = output_dir / 'particles.png'
    metadata = output_dir / 'particles.json'
    if png.exists() or metadata.exists():
        parser.error('output files already exist; choose a fresh output directory')
    selection = json.loads(SELECTION.read_text(encoding='utf-8'))
    sources = checked_sources(source_root, selection)
    atlas, entries = build(sources, selection)
    reference_bytes = REFERENCE.read_bytes()
    require(len(reference_bytes) == selection['atlas']['bytes'] and
            sha(reference_bytes) == selection['atlas']['sha256'],
            'reference atlas byte count or SHA-256 mismatch')
    with Image.open(REFERENCE) as reference:
        require(reference.mode == 'RGBA' and reference.size == atlas.size and
                reference.size == tuple(selection['atlas']['dimensions']),
                'reference atlas dimensions or RGBA mode mismatch')
        # Compare all four channels, including RGB under zero alpha and every pad pixel.
        require(atlas.tobytes() == reference.tobytes(),
                'full RGBA atlas differs from audited reference, including transparency')
    output_dir.mkdir(parents=True, exist_ok=True)
    atlas.save(png, optimize=True)
    doc = {'format': 'plush-atlas-rebuild-v1', 'atlas': 'particles.png',
           'size': [WIDTH, HEIGHT], 'cell': CELL, 'pad': PAD, 'pitch': PITCH,
           'uv_convention': 'image space: u right, v down, origin top-left; Three.js flipY=true uses v_gl=1-v',
           'source_selection': 'docs/materials-selection.json',
           'source_selection_sha256': sha(SELECTION.read_bytes()),
           'pillow_version': PILLOW_VERSION, 'png_sha256': sha(png.read_bytes()),
           'reference_png_sha256': selection['atlas']['sha256'], 'full_rgba_equal': True,
           'items': entries}
    metadata.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"PASS: {len(entries)} source PNGs, 3 licenses, full {WIDTH}x{HEIGHT} RGBA; Pillow {PILLOW_VERSION}; PNG SHA-256 {doc['png_sha256']}")


if __name__ == '__main__':
    main()
