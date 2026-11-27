#!/usr/bin/env python3
"""Extract or verify the game's single padded hit-star texture. Requires Pillow.

The original audited atlas and its reconstruction remain in tools/atlas/.
Run with no arguments to verify all RGBA channels, including transparent RGB.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "tools/atlas/reference"
RUNTIME = ROOT / "assets/hit-star.png"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", type=Path, help="write to a NEW output file")
    args = parser.parse_args()
    metadata = json.loads((REFERENCE / "particles.json").read_text())
    cell = next(item["px"] for item in metadata["items"] if item["name"] == "star_09")
    pad = metadata["pad"]
    x, y, w, h = (cell[k] for k in ("x", "y", "w", "h"))
    source = REFERENCE / "particles.png"
    if hashlib.sha256(source.read_bytes()).hexdigest() != metadata["reference_png_sha256"]:
        raise ValueError("reference atlas checksum mismatch; do not rebaseline from the candidate")
    with Image.open(source) as atlas:
        tile = atlas.crop((x-pad, y-pad, x+w+pad, y+h+pad))
    if args.write:
        with args.write.open("xb") as dest:
            tile.save(dest, format="PNG", optimize=True)
    with Image.open(args.write or RUNTIME) as runtime:
        if (runtime.mode, runtime.size, runtime.tobytes()) != (tile.mode, tile.size, tile.tobytes()):
            raise ValueError("runtime tile differs from the audited atlas (including its gutters)")
    print(f"Verified {tile.width}×{tile.height} {tile.mode} pixels, including {pad}px gutters.")


if __name__ == "__main__":
    main()
