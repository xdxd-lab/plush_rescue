"""Bounded cleanup evidence helpers; no real I/O at import time."""
import datetime as dt
import errno
import socket


class ObservationError(RuntimeError):
    def __init__(self, phase, pid=None, cause=None, os_errno=None):
        self.evidence = error_record(cause, phase, pid=pid)
        if os_errno is not None:
            self.evidence['errno'] = os_errno
        super().__init__('ownership observation failed: ' + phase)


def error_record(error, phase, **resource):
    record = {'phase': phase, **resource, 'ok': False}
    if error is not None:
        record.update(errorType=type(error).__name__, errno=getattr(error, 'errno', None),
                      timeoutSeconds=getattr(error, 'timeout', None),
                      returncode=getattr(error, 'returncode', None))
        if hasattr(error, 'evidence'):
            record['observation'] = error.evidence
    return record


def tracked_identity(expected, observe, same_process, presence):
    """Observation only. Never signal; unknown must remain distinct from absent."""
    pid = expected.get('pid')
    record = {'phase': 'tracked-identity', 'pid': pid, 'ok': False}
    if type(pid) is not int or pid <= 1:
        return {**record, 'state': 'invalid-identity'}
    observed = observe(pid)
    if same_process(expected, observed):
        return {**record, 'state': 'matching', 'ok': True}
    try:
        presence(pid, 0)
    except ProcessLookupError:
        return {**record, 'state': 'absent', 'ok': True}
    except OSError as error:
        return {**record, 'state': 'presence-unavailable',
                'error': error_record(error, 'signal-zero', pid=pid)}
    return {**record, 'state': 'identity-unavailable-or-mismatch'}


def probe_ports(ports, emit, socket_factory=socket.socket):
    """One connect and bind per exact port, no retry, sleep or socket options."""
    all_clean = bool(ports)
    for name, number in ports.items():
        context = {'resource': name, 'host': '127.0.0.1', 'port': number}
        record = {'phase': 'port-connect', **context, 'ok': False}
        emit({**record, 'state': 'begin'})
        try:
            with socket_factory() as sock:
                sock.settimeout(1)
                result = sock.connect_ex(('127.0.0.1', number))
            record.update(connectErrno=result, ok=result == errno.ECONNREFUSED)
        except OSError as error:
            record.update(error_record(error, 'port-connect', **context))
        emit(record)
        if not record['ok']:
            all_clean = False
        bind = {'phase': 'port-bind', **context, 'ok': False}
        emit({**bind, 'state': 'begin'})
        try:
            with socket_factory() as sock:
                sock.bind(('127.0.0.1', number))
            bind['ok'] = True
        except OSError as error:
            bind.update(error_record(error, 'port-bind', **context))
        emit(bind)
        if not bind['ok']:
            all_clean = False
    return all_clean


def record_cleanup(report, path, persist, record):
    report.setdefault('cleanupEvidence', []).append(record)
    del report['cleanupEvidence'][:-256]
    try:
        append_record(path, record)
    except OSError as error:
        report.setdefault('cleanupErrors', []).append('cleanup journal unavailable: ' + type(error).__name__)
    try:
        persist()
    except OSError as error:
        report.setdefault('cleanupErrors', []).append('cleanup checkpoint unavailable: ' + type(error).__name__)


def remove_profile(profile, report, begin, emit, remove):
    """A failed evidence write must preserve the exact owned profile for audit."""
    if report.get('cleanupErrors'):
        return
    begin('profile-remove')
    if report.get('cleanupErrors'):
        return
    try:
        remove(profile)
        report['profileRemoved'] = not profile.exists()
        if not report['profileRemoved']:
            report.setdefault('cleanupErrors', []).append('profile still exists after removal')
        emit({'phase': 'profile-remove', 'ok': report['profileRemoved']})
    except Exception as error:
        report.setdefault('cleanupErrors', []).append('profile removal failed: ' + type(error).__name__)
        emit(error_record(error, 'profile-remove'))


def append_record(path, record):
    """Persist each transition independently of the final report/checkpoint."""
    import json
    import os
    with path.open('a') as stream:
        stream.write(json.dumps({'at': dt.datetime.now(dt.timezone.utc).isoformat(),
                                 **record}, ensure_ascii=False) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
