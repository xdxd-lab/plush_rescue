#!/usr/bin/env bash
# Run from any directory; inputs are extracted from the official three npm tarball.
set -euo pipefail
[[ $# == 2 ]] || { printf 'usage: %s UPSTREAM_PACKAGE_BUILD_DIR ESBUILD_BINARY\n' "$0" >&2; exit 2; }
src=$(cd "$1" && pwd)
builder=$(realpath "$2")
root=$(cd "$(dirname "$0")/../.." && pwd)
[[ $("$builder" --version) == 0.28.0 ]]
# The renderer must stay on r186 here. A real version upgrade needs its own review.
(cd "$src" && sha256sum -c <<'SUM'
9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6  three.core.js
9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea  three.module.js
SUM
)
out=$(mktemp -d)
trap 'rm -rf -- "$out"' EXIT
# Preserve ESM module boundaries, identifiers, and license comments. No bundle,
# identifier mangling, expression optimization, or browser runtime tooling.
"$builder" "$src/three.module.js" "$src/three.core.js" \
  --format=esm --minify-whitespace --legal-comments=inline --outdir="$out"
cp "$out/three.core.js" "$out/three.module.js" "$root/vendor/"
