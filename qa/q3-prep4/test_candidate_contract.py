"""Offline provenance negatives; never invoke a server or browser."""
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import candidate_contract as contract


class CandidateContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        source = HERE.parents[1]
        manifest = (source / 'runtime-manifest.json').read_bytes()
        (self.root / 'runtime-manifest.json').write_bytes(manifest)
        for entry in json.loads(manifest)['files']:
            target = self.root / entry['path']
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((source / entry['path']).read_bytes())

    def test_current_runtime_is_accepted(self):
        self.assertEqual(contract.validate_runtime(self.root)['version'], '12.6.2')

    def test_manifest_changed_even_if_json_equivalent_is_rejected(self):
        path = self.root / 'runtime-manifest.json'
        path.write_bytes(path.read_bytes() + b'\n')
        with self.assertRaisesRegex(ValueError, 'manifest digest'):
            contract.validate_runtime(self.root)

    def test_runtime_same_size_tamper_and_missing_file_are_rejected(self):
        path = self.root / 'main.js'
        original = path.read_bytes()
        path.write_bytes(bytes([original[0] ^ 1]) + original[1:])
        with self.assertRaisesRegex(ValueError, 'integrity mismatch: main.js'):
            contract.validate_runtime(self.root)
        path.unlink()
        with self.assertRaises(FileNotFoundError):
            contract.validate_runtime(self.root)

    def test_expected_provenance_is_required_even_with_intact_files(self):
        for name in ('EXPECTED_VERSION', 'EXPECTED_REVISION', 'EXPECTED_SOURCE'):
            with self.subTest(name=name), patch.object(contract, name, 'wrong-source'):
                with self.assertRaisesRegex(ValueError, 'provenance mismatch'):
                    contract.validate_runtime(self.root)


if __name__ == '__main__':
    unittest.main()
