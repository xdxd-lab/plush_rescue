# Kenney atlas source and rebuild

The 18 versioned PNGs in `sources/` are audited 256×256 RGBA inputs for
`reference/particles.png`. They are selected, resized candidate images from
locally preserved Kenney packages, **not the upstream original-resolution files**.
`reference/particles.json` records the reproducible output, ordered cells,
SHA and generation version. Each input name, byte count, SHA-256 and dimension
matches [materials-selection.json](../../docs/materials-selection.json).
The three package `License.txt` files also match the recorded SHA-256 and the
public copies in `docs/licenses/`. A separate safety copy was verified outside
the worktree; the versioned copies here make recovery portable.

Run with Pillow installed:

```sh
python3 tools/atlas/rebuild.py --output-dir /tmp/plush-atlas-rebuilt
```

`--source-root` can point to another copy with the same three pack directories.
The tool rejects existing output files and refuses to write inside the source
or reference directory. It checks each source SHA, license SHA, item order,
cell coordinates and six-decimal image-space UV against the public selection.
It compares every RGBA byte of the **whole** 2048×1024 atlas against the
reference, including transparent RGB and padding. Pillow 13.0.0 produced the
same PNG bytes and SHA-256 `ca39797b59dd36bb3f7fac4a49d44ce119849ed129f9bb8a3734c034e9addf07`.
Other Pillow encoders may produce different PNG bytes with identical pixels.

Atlas layout: 256px cells, 2px inset, 260px pitch, eight columns, 18 items in
the order of the selection file. UV metadata uses image-space origin at top
left; with Three.js `flipY=true`, use `v_gl=1-v`. `shape_a` is a solid light
shape; it is not a soft `circle_05` glow. No atlas cells are treated as original
source images.

The sources are Kenney Particle Pack, Light Masks and Smoke Particles under the
package CC0 notices preserved here. Particle Pack is labelled 1.1 in the
package while the website update label was recorded as 1.0. The official
asset pages could not be reopened during this audit; these credits rely on the
previous S1 record and the matching package notices. Project or character
commercial rights are separate from these asset notices.

Generated metadata records `source_selection_sha256` for the selection JSON read by that particular build. Later audit-document edits can change that input-file hash without changing the selected pixels or UVs; preserve the generated metadata as a dated snapshot rather than updating its hash in place.
