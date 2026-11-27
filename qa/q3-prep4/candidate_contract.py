"""No-browser provenance gate for the current Q3 diagnostic runtime."""
import hashlib
import json

EXPECTED_PRODUCT_MAIN = 'b53a74e5390ab80a7ddbeefe9bc145e4103ceb06'
EXPECTED_CODE = '3213067b88e5f8474eb71a9580cb00d45c48a22d'
EXPECTED_VERSION = '12.6.2'
EXPECTED_REVISION = 'v12.6.2-paused-render-r1'
EXPECTED_SOURCE = 'bd791180888d120eb1eadc59cc71d694c938fe6d'
EXPECTED_MANIFEST_SHA256 = '4f4c0991982e0f53edd2a9258becf682da554ae51177ac39dcf9966ec6cc6734'


def validate_runtime(root):
    """Reject source drift before allocating a server, profile or browser."""
    manifest_bytes = (root / 'runtime-manifest.json').read_bytes()
    if hashlib.sha256(manifest_bytes).hexdigest() != EXPECTED_MANIFEST_SHA256:
        raise ValueError('fixed runtime manifest digest mismatch')
    manifest = json.loads(manifest_bytes)
    entries = manifest['files']
    if len(entries) != 43 or len({entry['path'] for entry in entries}) != 43:
        raise ValueError('expected exactly 43 distinct manifest entries')
    for entry in entries:
        data = (root / entry['path']).read_bytes()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('runtime integrity mismatch: ' + entry['path'])
    build = json.loads((root / 'build-info.json').read_bytes())
    expected = {'version': EXPECTED_VERSION, 'revision': EXPECTED_REVISION,
                'source_commit': EXPECTED_SOURCE}
    if any(build.get(key) != value for key, value in expected.items()):
        raise ValueError('build-info provenance mismatch')
    return build
