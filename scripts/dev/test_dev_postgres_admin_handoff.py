#!/usr/bin/env python3
"""Synthetic-only root Linux fixture tests; run in disposable network-none container."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

spec = importlib.util.spec_from_file_location('handoff', Path(__file__).with_name('dev-postgres-admin-handoff.py'))
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)
STORE = Path('/opt/otr/dev-postgres-admin')
SYNTHETIC = ' synthetic-\"$(never-execute)-é-with-spaces '.encode()


def run(mode, value=b'', expected=b'EMPTY\n', ok=True):
    result = subprocess.run([sys.executable, '-B', '-c', handoff.REMOTE, mode],
                            input=value, capture_output=True, timeout=5,
                            env={'PATH': '/usr/bin:/bin'})
    assert (result.returncode == 0) == ok
    assert result.stdout == expected and result.stderr == b''
    assert SYNTHETIC not in result.stdout
    return result


def reset():
    if STORE.exists():
        for name in STORE.iterdir():
            name.unlink()
        STORE.rmdir()
    STORE.mkdir(mode=0o700)
    (STORE / 'lock').touch(mode=0o600)


run('prepare')
run('prepare')
run('stage', SYNTHETIC, b'STAGED\n')
assert (STORE / 'password').read_bytes() == SYNTHETIC
s = (STORE / 'password').stat()
assert (s.st_uid, s.st_gid, s.st_mode & 0o777, s.st_nlink) == (0, 0, 0o600, 1)
run('check', expected=b'STAGED\n')
run('stage', b'synthetic-replay', b'UNAVAILABLE\n', False)
assert (STORE / 'password').read_bytes() == SYNTHETIC
# Metadata-only reconciliation must not open the credential for reading.
metadata_code = handoff.REMOTE.replace('try:\n    main()', """original_open = os.open
def guarded_open(path, flags, *args, **kwargs):
    if path in ('password', 'password.pending'):
        raise AssertionError()
    return original_open(path, flags, *args, **kwargs)
os.open = guarded_open
try:
    main()""")
p = subprocess.run([sys.executable, '-B', '-c', metadata_code, 'check'], capture_output=True, env={'PATH': '/usr/bin:/bin'})
assert p.returncode == 0 and p.stdout == b'STAGED\n' and p.stderr == b''
for invalid in (b'', b'\0', b'bad\nline', b'x' * 4097):
    reset()
    run('stage', invalid, b'UNAVAILABLE\n', False)
    assert (STORE / 'password.pending').exists() and not (STORE / 'password').exists()
    run('check', expected=b'UNKNOWN\n')
    run('stage', SYNTHETIC, b'UNAVAILABLE\n', False)
for name in ('backup', 'candidate', 'staging', 'temp'):
    reset()
    (STORE / name).touch(mode=0o600)
    run('check', expected=b'UNAVAILABLE\n', ok=False)
    run('stage', SYNTHETIC, b'UNAVAILABLE\n', False)
reset()
(STORE / 'password').write_bytes(b'synthetic')
os.chmod(STORE / 'password', 0o644)
run('check', expected=b'UNAVAILABLE\n', ok=False)
os.chmod(STORE / 'password', 0o600)
os.link(STORE / 'password', '/opt/otr/external-synthetic-link')
run('check', expected=b'UNAVAILABLE\n', ok=False)
os.unlink('/opt/otr/external-synthetic-link')
reset()
(STORE / 'password').symlink_to('/etc/passwd')
run('check', expected=b'UNAVAILABLE\n', ok=False)
reset()
(STORE / 'password').write_bytes(b'synthetic')
os.chmod(STORE / 'password', 0o600)
os.link(STORE / 'password', STORE / 'password.pending')
run('check', expected=b'UNAVAILABLE\n', ok=False)
reset()
os.chmod(STORE / 'lock', 0o644)
run('check', expected=b'UNAVAILABLE\n', ok=False)
reset()
os.chmod(STORE, 0o755)
run('check', expected=b'UNAVAILABLE\n', ok=False)
os.chmod(STORE, 0o700)
reset()
os.chown(STORE / 'lock', 1234, 1234)
run('check', expected=b'UNAVAILABLE\n', ok=False)
reset()
import fcntl
with open(STORE / 'lock', 'r+b') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    run('check', expected=b'UNAVAILABLE\n', ok=False)
# Simulate unexplained mutation while input is acquired under the lock.
mutating = handoff.REMOTE.replace('if inventory(fd) != pending:',
    "os.close(os.open('unexpected', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600, dir_fd=fd))\n            if inventory(fd) != pending:")
p = subprocess.run([sys.executable, '-B', '-c', mutating, 'stage'], input=SYNTHETIC,
                   capture_output=True, env={'PATH': '/usr/bin:/bin'})
assert p.returncode != 0 and p.stdout == b'UNAVAILABLE\n' and p.stderr == b''
assert (STORE / 'password.pending').stat().st_size == 0 and not (STORE / 'password').exists()
reset()
(STORE / 'lock').unlink()
(STORE / 'lock').symlink_to('/etc/passwd')
run('check', expected=b'UNAVAILABLE\n', ok=False)
reset()
(STORE / 'lock').unlink()
os.mkfifo(STORE / 'lock', 0o600)
run('check', expected=b'UNAVAILABLE\n', ok=False)
reset()
# No generic environment credential injection.
p = subprocess.run([sys.executable, '-B', '-c', handoff.REMOTE, 'check'], capture_output=True,
                   env={'PATH': '/usr/bin:/bin', 'PGPASSWORD': 'synthetic'})
assert p.returncode != 0 and p.stdout == b'UNAVAILABLE\n' and p.stderr == b''
print('PASS: synthetic staging, opaque bytes, metadata-only reconciliation, replay refusal, filesystem and mutation negatives.')
