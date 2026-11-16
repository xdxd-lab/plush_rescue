"""Offline contract tests for Q3 process ownership helpers."""
import importlib.util
import pathlib
import signal
import sys
import unittest
from unittest.mock import Mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("q3_ownership", HERE / "ownership.py")
ownership = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ownership)
sys.path.insert(0, str(HERE))
import q3_runner
RUNNER_SPEC = importlib.util.spec_from_file_location("q3_n1_runner", HERE / "run_q3_n1.py")
q3_n1_runner = importlib.util.module_from_spec(RUNNER_SPEC)
RUNNER_SPEC.loader.exec_module(q3_n1_runner)


def identity():
    argv = ["/opt/firefox/Firefox", "-no-remote", "-profile", "/tmp/q3-profile"]
    return {"pid": 4242, "start": "boot-7:12345", "argv": argv,
            "profile": "/tmp/q3-profile"}


class OwnershipTests(unittest.TestCase):
    def test_complete_matching_identity_signals_exactly_once(self):
        expected = identity()
        observe = Mock(return_value=dict(expected))
        send = Mock()

        result = ownership.terminate_owned(expected, observe, send)

        self.assertTrue(result["signaled"])
        self.assertEqual(result["signal"], "SIGTERM")
        observe.assert_called_once_with(expected["pid"])
        send.assert_called_once_with(expected["pid"], signal.SIGTERM)

    def test_signal_process_exit_is_reported_without_raising(self):
        expected = identity()
        send = Mock(side_effect=ProcessLookupError("process exited"))

        result = ownership.terminate_owned(expected, Mock(return_value=dict(expected)), send)

        self.assertFalse(result["signaled"])
        self.assertEqual(result["reason"], "ProcessLookupError")
        send.assert_called_once_with(expected["pid"], signal.SIGTERM)

    def test_pid_reuse_and_identity_mismatches_never_signal(self):
        expected = identity()
        variants = {
            "different pid": {**expected, "pid": expected["pid"] + 1},
            "different start time": {**expected, "start": "boot-7:99999"},
            "different argv": {**expected, "argv": expected["argv"] + ["--private"]},
            "different profile": {**expected, "profile": "/tmp/other-profile"},
            "profile absent from argv": {**expected, "argv": ["/opt/firefox/Firefox"]},
        }
        for label, observed in variants.items():
            with self.subTest(label=label):
                observe = Mock(return_value=observed)
                send = Mock()
                result = ownership.terminate_owned(expected, observe, send)
                self.assertFalse(result["signaled"])
                self.assertEqual(result["reason"], "ownership-unverified")
                observe.assert_called_once_with(expected["pid"])
                send.assert_not_called()

    def test_non_integer_observed_pid_never_signals(self):
        expected = identity()
        for pid in (float(expected["pid"]), str(expected["pid"])):
            with self.subTest(pid=pid):
                observed = {**expected, "pid": pid}
                send = Mock()
                result = ownership.terminate_owned(expected, Mock(return_value=observed), send)
                self.assertFalse(result["signaled"])
                self.assertEqual(result["reason"], "ownership-unverified")
                send.assert_not_called()

    def test_missing_identity_fields_never_signal(self):
        base = identity()
        required = ("pid", "start", "argv", "profile")
        cases = []
        for field in required:
            missing_expected = dict(base)
            missing_expected.pop(field)
            cases.append((f"expected missing {field}", missing_expected, base))
            missing_observed = dict(base)
            missing_observed.pop(field)
            cases.append((f"observed missing {field}", base, missing_observed))
        cases.extend([
            ("invalid pid", {**base, "pid": True}, base),
            ("invalid argv", {**base, "argv": " ".join(base["argv"])}, base),
            ("invalid argv element", {**base, "argv": [*base["argv"], 7]}, base),
        ])

        for label, expected, observed in cases:
            with self.subTest(label=label):
                observe = Mock(return_value=observed)
                send = Mock()
                result = ownership.terminate_owned(expected, observe, send)
                self.assertFalse(result["signaled"])
                self.assertEqual(result["reason"], "ownership-unverified")
                send.assert_not_called()

    def test_bounded_text_preserves_unicode_and_marks_truncation(self):
        text = "雪🙂abc"
        limit = len("雪🙂".encode("utf-8")) + 1

        result = ownership.bounded_text(text, limit)

        self.assertEqual(result["bytes"], len(text.encode("utf-8")))
        self.assertTrue(result["truncated"])
        self.assertLessEqual(len(result["text"].encode("utf-8")), limit)
        self.assertEqual(result["text"], "雪🙂a")

    def test_bounded_text_caps_large_output_and_marks_truncation(self):
        text = ("診斷輸出-large-" * 20_000)
        limit = 137

        result = ownership.bounded_text(text, limit)

        self.assertEqual(result["bytes"], len(text.encode("utf-8")))
        self.assertTrue(result["truncated"])
        self.assertLessEqual(len(result["text"].encode("utf-8")), limit)
        self.assertLess(len(result["text"].encode("utf-8")), result["bytes"])

    def test_diagnostic_abort_is_not_swallowed_by_js_wait(self):
        abort = q3_n1_runner.DiagnosticAbort("diagnostic deadline")

        class Driver:
            def script(self, _source):
                raise abort

        with self.assertRaises(q3_n1_runner.DiagnosticAbort):
            q3_runner.js_wait(Driver(), "true", timeout=1)


if __name__ == "__main__":
    unittest.main()
