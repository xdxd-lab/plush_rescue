"""Fail-closed ownership decisions; no browser or process is started here."""
import os
import signal


def same_process(expected, observed):
    if not isinstance(expected, dict) or not isinstance(observed, dict):
        return False
    pid = expected.get('pid')
    if type(pid) is not int or pid <= 1:
        return False
    argv = expected.get('argv')
    if not isinstance(argv, list) or not argv or not all(isinstance(a, str) for a in argv):
        return False
    return (type(observed.get('pid')) is int
            and observed.get('pid') == pid
            and bool(expected.get('start'))
            and observed.get('start') == expected['start']
            and observed.get('argv') == argv
            and bool(expected.get('profile'))
            and expected['profile'] in argv
            and observed.get('profile') == expected['profile'])


def terminate_owned(expected, observe, send=os.kill):
    """Re-observe immediately before signaling; mismatch never signals."""
    observed = observe(expected.get('pid'))
    if not same_process(expected, observed):
        return {'signaled': False, 'reason': 'ownership-unverified', 'observed': observed}
    try:send(expected['pid'], signal.SIGTERM)
    except OSError as error:return {'signaled':False,'reason':type(error).__name__}
    return {'signaled': True, 'signal': 'SIGTERM'}


def bounded_text(value, limit=16384):
    raw = str(value).encode('utf-8', errors='replace')
    # Ignore an incomplete trailing code point so decoded output never grows past limit.
    return {'text': raw[:limit].decode('utf-8', errors='ignore'),
            'bytes': len(raw), 'truncated': len(raw) > limit}


def observe(pid, profile):
    """macOS kernel argv tokens; ps is used only for start/group metadata."""
    import ctypes
    import struct
    import subprocess
    if type(pid) is not int or pid <= 1:
        return None
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        mib = (ctypes.c_int * 3)(1, 49, pid)  # CTL_KERN / KERN_PROCARGS2
        size = ctypes.c_size_t(0)
        if libc.sysctl(mib, 3, None, ctypes.byref(size), None, 0) != 0 or size.value > 262144:
            return None
        buf = ctypes.create_string_buffer(size.value)
        if libc.sysctl(mib, 3, buf, ctypes.byref(size), None, 0) != 0:
            return None
        raw = buf.raw[:size.value]
        argc = struct.unpack_from('i', raw)[0]
        if not 0 < argc < 2048:
            return None
        pos = raw.index(b'\0', 4) + 1
        while raw[pos] == 0:
            pos += 1
        argv = []
        for _ in range(argc):
            end = raw.index(b'\0', pos)
            argv.append(os.fsdecode(raw[pos:end])); pos = end + 1
        # Kernel unique process identifier excludes same-second PID reuse.
        unique_buf=ctypes.create_string_buffer(64)
        libproc=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
        got=libproc.proc_pidinfo(pid,17,0,unique_buf,64)
        if got<16:return None
        class Identity:pass
        unique=Identity();unique.value=unique_buf.raw[:16]
        result = subprocess.run(['/bin/ps', '-p', str(pid), '-o', 'lstart=,pgid='],
                                capture_output=True, text=True, timeout=3, check=True)
        parts = result.stdout.strip().rsplit(None, 1)
        if len(parts) != 2:
            return None
        return {'pid': pid, 'start': parts[0]+':'+unique.value.hex(), 'group': int(parts[1]),
                'argv': argv, 'profile': profile}
    except (ValueError, IndexError, OSError, struct.error, subprocess.SubprocessError):
        return None


def profile_processes(profile, executable):
    """Return only exact executable and profile argv matches; never substring-kill."""
    import subprocess
    from cleanup_evidence import ObservationError
    try:
        rows = subprocess.run(['/bin/ps', '-axo', 'pid=,comm='], capture_output=True,
                              text=True, timeout=3, check=True).stdout.splitlines()
    except (OSError, subprocess.SubprocessError) as error:
        raise ObservationError('process-list', cause=error) from error
    matches = []
    for row in rows:
        fields=row.strip().split(None,1)
        if len(fields)!=2:continue
        # Only exact main Firefox executable; unrelated processes are not inspected.
        # proc_pidpath identifies the executable independently of ps comm formatting.
        import ctypes
        libproc=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
        pathbuf=ctypes.create_string_buffer(4096)
        count=libproc.proc_pidpath(int(fields[0]),pathbuf,4096)
        if count<=0:
            if 'firefox' in fields[1].lower():
                raise ObservationError('proc-pidpath', pid=int(fields[0]), os_errno=ctypes.get_errno())
            continue
        if os.fsdecode(pathbuf.value)!=executable:continue
        item = observe(int(fields[0]), profile)
        if item is None:
            raise ObservationError('profile-identity', pid=int(fields[0]))
        if item['argv'][0] == executable and profile in item['argv']:
            matches.append(item)
    return matches
