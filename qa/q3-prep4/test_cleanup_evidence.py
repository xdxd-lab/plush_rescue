"""Offline cleanup positive/negative cases; no real processes or sockets."""
import errno
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import cleanup_evidence as evidence
import ownership


def fake_socket(connect=errno.ECONNREFUSED, bind_error=None):
    sock = Mock()
    sock.__enter__ = Mock(return_value=sock)
    sock.__exit__ = Mock(return_value=False)
    sock.connect_ex.return_value = connect
    if bind_error:
        sock.bind.side_effect = bind_error
    return sock


class CleanupEvidenceTests(unittest.TestCase):
    def test_no_allocated_port_is_not_cleanup_proof(self):
        factory = Mock()
        self.assertFalse(evidence.probe_ports({}, Mock(), factory))
        factory.assert_not_called()

    def test_evidence_write_failure_is_failed_without_interrupting_cleanup_caller(self):
        report = {}
        checkpoint = Mock(side_effect=OSError(errno.ENOSPC, 'full'))
        with patch.object(evidence, 'append_record', side_effect=OSError(errno.ENOSPC, 'full')):
            evidence.record_cleanup(report, pathlib.Path('/not-used'), checkpoint, {'phase': 'http-shutdown'})
        self.assertEqual(len(report['cleanupErrors']), 2)
        checkpoint.assert_called_once()
        self.assertEqual(report['cleanupEvidence'][0]['phase'], 'http-shutdown')

    def test_phase_write_failure_preserves_profile_and_failed_removal_never_passes(self):
        profile = Mock()
        profile.exists.return_value = True
        remove = Mock()
        report = {}
        def failed_begin(_phase):
            report['cleanupErrors'] = ['checkpoint unavailable']
        evidence.remove_profile(profile, report, failed_begin, Mock(), remove)
        remove.assert_not_called()
        report = {}
        evidence.remove_profile(profile, report, Mock(), Mock(), remove)
        self.assertFalse(report['profileRemoved'])
        self.assertTrue(report['cleanupErrors'])

    def test_refused_and_bindable_ports_pass_with_each_phase(self):
        records = []
        factory = Mock(side_effect=[fake_socket() for _ in range(4)])
        self.assertTrue(evidence.probe_ports({'http': 1234, 'webdriver': 1235}, records.append, factory))
        complete = [row for row in records if row.get('state') != 'begin']
        self.assertEqual([(row['phase'], row['port'], row['ok']) for row in complete],
                         [('port-connect', 1234, True), ('port-bind', 1234, True),
                          ('port-connect', 1235, True), ('port-bind', 1235, True)])

    def test_bind_failure_records_exact_port_errno_and_continues_other_port(self):
        records = []
        factory = Mock(side_effect=[fake_socket(), fake_socket(bind_error=OSError(errno.EADDRINUSE, 'busy')),
                                    fake_socket(), fake_socket()])
        self.assertFalse(evidence.probe_ports({'http': 1234, 'webdriver': 1235}, records.append, factory))
        failure = next(row for row in records if row.get('errno') == errno.EADDRINUSE)
        self.assertEqual((failure['phase'], failure['resource'], failure['port']), ('port-bind', 'http', 1234))
        self.assertTrue(records[-1]['ok'])
        self.assertEqual(records[-1]['port'], 1235)

    def test_listener_and_unknown_connect_errors_never_count_clean(self):
        for connect in (0, errno.ETIMEDOUT, errno.EACCES):
            with self.subTest(connect=connect):
                records = []
                self.assertFalse(evidence.probe_ports({'webdriver': 1235}, records.append,
                                                      Mock(side_effect=[fake_socket(connect), fake_socket()])))
                self.assertEqual(records[1]['connectErrno'], connect)
                self.assertFalse(records[1]['ok'])

    def test_connect_exception_is_structured_without_skipping_bind(self):
        records = []
        sock = fake_socket()
        sock.connect_ex.side_effect = PermissionError(errno.EACCES, 'denied')
        self.assertFalse(evidence.probe_ports({'http': 1234}, records.append,
                                              Mock(side_effect=[sock, fake_socket()])))
        self.assertEqual(records[1]['errno'], errno.EACCES)
        self.assertTrue(records[-1]['ok'])

    def test_tracked_match_absent_and_unavailable_are_distinct(self):
        expected = {'pid': 4242, 'start': 'unique', 'argv': ['firefox', '/profile'], 'profile': '/profile'}
        presence = Mock()
        record = evidence.tracked_identity(expected, Mock(return_value=expected), ownership.same_process, presence)
        self.assertEqual(record['state'], 'matching')
        presence.assert_not_called()
        presence.side_effect = ProcessLookupError()
        record = evidence.tracked_identity(expected, Mock(return_value=None), ownership.same_process, presence)
        self.assertEqual(record['state'], 'absent')
        self.assertTrue(record['ok'])
        presence.assert_called_with(4242, 0)
        presence.side_effect = None
        self.assertFalse(evidence.tracked_identity(expected, Mock(return_value=None), ownership.same_process, presence)['ok'])
        presence.side_effect = PermissionError(errno.EPERM, 'denied')
        record = evidence.tracked_identity(expected, Mock(return_value=None), ownership.same_process, presence)
        self.assertEqual(record['state'], 'presence-unavailable')
        self.assertEqual(record['error']['errno'], errno.EPERM)

    def test_process_list_timeout_has_phase_and_original_limit(self):
        with patch('subprocess.run', side_effect=subprocess.TimeoutExpired('ps', 3)):
            with self.assertRaises(evidence.ObservationError) as caught:
                ownership.profile_processes('/profile', '/firefox')
        self.assertEqual(caught.exception.evidence['phase'], 'process-list')
        self.assertEqual(caught.exception.evidence['timeoutSeconds'], 3)

    def test_executable_unavailable_records_only_pid_and_stage(self):
        result = Mock(stdout='4242 firefox\n')
        lib = Mock()
        lib.proc_pidpath.return_value = 0
        with patch('subprocess.run', return_value=result), patch('ctypes.CDLL', return_value=lib):
            with self.assertRaises(evidence.ObservationError) as caught:
                ownership.profile_processes('/profile', '/firefox')
        record = caught.exception.evidence
        self.assertEqual((record['phase'], record['pid']), ('proc-pidpath', 4242))
        self.assertNotIn('argv', record)

    def test_append_record_persists_independent_transitions(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = pathlib.Path(temporary) / 'cleanup.jsonl'
            evidence.append_record(path, {'phase': 'port-bind', 'port': 1234, 'state': 'begin'})
            evidence.append_record(path, {'phase': 'port-bind', 'port': 1234, 'ok': False, 'errno': errno.EADDRINUSE})
            rows = [json.loads(line) for line in path.read_text().splitlines()]
            self.assertEqual(len(rows), 2)
            self.assertIn('at', rows[0])
            self.assertEqual(rows[1]['errno'], errno.EADDRINUSE)


if __name__ == '__main__':
    unittest.main()
