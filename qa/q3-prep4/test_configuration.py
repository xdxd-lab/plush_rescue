"""Offline configuration contracts; no browser, sockets, kernel calls or spawn."""
import pathlib
import os
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from configuration import load_configuration, prepare_output


class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.firefox = self.root / 'firefox'
        self.driver = self.root / 'geckodriver'
        self.firefox.write_bytes(b'fixture, not executable')
        self.driver.write_bytes(b'fixture, not executable')
        self.settings = {'Q3_FIREFOX_BINARY': str(self.firefox), 'Q3_GECKODRIVER_BINARY': str(self.driver),
                         'Q3_REPORT_ROOT': str(self.root / 'private-results')}

    def test_explicit_configuration_resolves_without_creating_output(self):
        result = load_configuration(self.settings, self.repo)
        self.assertEqual(result['firefox'], self.firefox.resolve())
        self.assertFalse(result['report_root'].exists())

    def test_every_setting_is_required(self):
        for name in self.settings:
            with self.subTest(name=name):
                settings = dict(self.settings)
                del settings[name]
                with self.assertRaises(ValueError):
                    load_configuration(settings, self.repo)

    def test_relative_paths_are_rejected(self):
        for name in self.settings:
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    load_configuration({**self.settings, name: 'relative/path'}, self.repo)

    def test_missing_binary_is_rejected(self):
        self.driver.unlink()
        with self.assertRaisesRegex(ValueError, 'existing binary'):
            load_configuration(self.settings, self.repo)

    def test_output_inside_repository_and_symlink_into_it_are_rejected(self):
        link = self.root / 'output-link'
        link.symlink_to(self.repo, target_is_directory=True)
        for output in (self.repo, self.repo / 'results', link / 'results'):
            with self.subTest(output=output):
                with self.assertRaisesRegex(ValueError, 'outside the repository'):
                    load_configuration({**self.settings, 'Q3_REPORT_ROOT': str(output)}, self.repo)

    def test_existing_non_directory_output_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'must be a directory'):
            load_configuration({**self.settings, 'Q3_REPORT_ROOT': str(self.driver)}, self.repo)

    def test_child_symlinks_cannot_redirect_profiles_or_reports(self):
        output = pathlib.Path(self.settings['Q3_REPORT_ROOT'])
        output.mkdir(mode=0o700)
        for name in ('profiles', 'runs'):
            with self.subTest(name=name):
                link = output / name
                link.symlink_to(self.repo, target_is_directory=True)
                with self.assertRaisesRegex(ValueError, 'symlinks'):
                    load_configuration(self.settings, self.repo)
                link.unlink()

    def test_existing_root_or_child_with_shared_permissions_is_rejected(self):
        output = pathlib.Path(self.settings['Q3_REPORT_ROOT'])
        output.mkdir(mode=0o700)
        for directory in (output, output / 'profiles', output / 'runs'):
            directory.mkdir(mode=0o700, exist_ok=True)
            directory.chmod(0o755)
            with self.subTest(directory=directory):
                with self.assertRaisesRegex(ValueError, 'private'):
                    load_configuration(self.settings, self.repo)
            directory.chmod(0o700)

    def test_prepare_output_creates_private_directories_without_changing_existing_ones(self):
        output = pathlib.Path(self.settings['Q3_REPORT_ROOT'])
        prepare_output(output)
        for directory in (output, output / 'profiles', output / 'runs'):
            metadata = directory.stat()
            self.assertEqual(stat.S_IMODE(metadata.st_mode), 0o700)
            self.assertEqual(metadata.st_uid, os.getuid())
        (output / 'runs').chmod(0o755)
        with self.assertRaisesRegex(ValueError, 'private'):
            prepare_output(output)
        self.assertEqual(stat.S_IMODE((output / 'runs').stat().st_mode), 0o755)

    def test_output_owned_by_another_user_is_rejected(self):
        output = pathlib.Path(self.settings['Q3_REPORT_ROOT'])
        output.mkdir(mode=0o700)
        actual_uid = os.getuid()
        with patch('configuration.os.getuid', return_value=actual_uid + 1):
            with self.assertRaisesRegex(ValueError, 'owned by the current user'):
                load_configuration(self.settings, self.repo)


if __name__ == '__main__':
    unittest.main()
