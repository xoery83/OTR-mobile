#!/usr/bin/env python3
"""Owner-local hidden handoff for DEV postgres; never authenticates or provisions.

--prepare creates empty, separate root-private custody; --check reads metadata only.
--handoff requires an empty prepared store and a real Terminal. A pending file is
UNKNOWN: never overwrite/replay it. STAGED certifies storage, not authentication.
Trusted root/cooperative flock is DEV-only, not exclusion of privileged writers.
"""
import base64
import getpass
import hashlib
import os
from pathlib import Path
import resource
import shlex
import stat
import subprocess
import sys
import warnings

HOST = "178.105.151.143"
HOST_PIN = "NnqffvJzKNpA4VScovHRQeVf6PVw53xW2RjwnxjU60s"
REMOTE = r'''
import ctypes, fcntl, os, resource, stat, sys
DIRECTORY = '/opt/otr/dev-postgres-admin'

def checked(s, mode, directory=False):
    if (s.st_uid != 0 or s.st_gid != 0 or stat.S_IMODE(s.st_mode) != mode
        or not (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode))
        or (not directory and s.st_nlink != 1)):
        raise RuntimeError()

def inventory(fd):
    checked(os.fstat(fd), 0o700, True)
    names = set(os.listdir(fd))
    if not names <= {'lock', 'password', 'password.pending'} or 'lock' not in names:
        raise RuntimeError()
    if {'password', 'password.pending'} <= names:
        raise RuntimeError()
    result = {}
    for name in names:
        s = os.stat(name, dir_fd=fd, follow_symlinks=False)
        checked(s, 0o600)
        if (name == 'lock' and s.st_size != 0) or s.st_size > 4096:
            raise RuntimeError()
        if name == 'password' and s.st_size == 0:
            raise RuntimeError()
        result[name] = (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    return result

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('prepare', 'check', 'stage'):
        raise RuntimeError()
    if sys.platform != 'linux' or os.geteuid() != 0 or os.getegid() != 0:
        raise RuntimeError()
    if any(k.startswith('PG') or 'PASSWORD' in k or k.startswith('LD_') for k in os.environ):
        raise RuntimeError()
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    libc = ctypes.CDLL(None)
    if libc.prctl(4, 0, 0, 0, 0) != 0 or libc.prctl(3, 0, 0, 0, 0) != 0:
        raise RuntimeError()
    os.umask(0o077)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    lock = secret = None
    buffer = ctypes.create_string_buffer(4097)
    try:
        for part in DIRECTORY.strip('/').split('/'):
            if part == 'dev-postgres-admin' and sys.argv[1] == 'prepare':
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                    os.fsync(fd)
                except FileExistsError:
                    pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
            s = os.fstat(fd)
            if s.st_uid != 0 or s.st_gid != 0 or stat.S_IMODE(s.st_mode) & 0o022:
                raise RuntimeError()
        checked(os.fstat(fd), 0o700, True)
        if sys.argv[1] == 'prepare' and not os.listdir(fd):
            lock = os.open('lock', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
            os.fsync(lock)
            os.fsync(fd)
        else:
            lock = os.open('lock', os.O_RDWR | os.O_NOFOLLOW, dir_fd=fd)
        checked(os.fstat(lock), 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = inventory(fd)
        if before['lock'][:2] != (os.fstat(lock).st_dev, os.fstat(lock).st_ino):
            raise RuntimeError()
        if sys.argv[1] == 'stage':
            if set(before) != {'lock'}:
                raise RuntimeError()
            # Durable attempt marker precedes input; a failed attempt cannot be replayed.
            secret = os.open('password.pending', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
            checked(os.fstat(secret), 0o600)
            os.fsync(fd)
            pending = inventory(fd)
            ps = os.fstat(secret)
            if pending['password.pending'] != (ps.st_dev, ps.st_ino, ps.st_size, ps.st_mtime_ns, ps.st_ctime_ns):
                raise RuntimeError()
            if pending['lock'] != before['lock'] or set(pending) != {'lock', 'password.pending'}:
                raise RuntimeError()
            view = memoryview(buffer).cast('B')
            length = 0
            while length < len(view):
                n = sys.stdin.buffer.readinto(view[length:])
                if not n:
                    break
                length += n
            if not 1 <= length <= 4096 or any(view[i] in (0, 10, 13) for i in range(length)):
                raise RuntimeError()
            if inventory(fd) != pending:
                raise RuntimeError()
            written = 0
            while written < length:
                n = os.write(secret, view[written:length])
                if n <= 0:
                    raise RuntimeError()
                written += n
            os.fsync(secret)
            after = inventory(fd)
            s = os.fstat(secret)
            if (after['lock'] != before['lock'] or set(after) != set(pending)
                or after['password.pending'] != (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
                or s.st_size != length):
                raise RuntimeError()
            os.rename('password.pending', 'password', src_dir_fd=fd, dst_dir_fd=fd)
            os.fsync(fd)
            final = inventory(fd)
            s = os.fstat(secret)
            if (set(final) != {'lock', 'password'} or final['lock'] != before['lock']
                or final['password'] != (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)):
                raise RuntimeError()
            before = final
        if inventory(fd) != before:
            raise RuntimeError()
        # The pathname must still refer to the inspected directory under cooperative locking.
        s = os.stat(DIRECTORY, follow_symlinks=False)
        checked(s, 0o700, True)
        if (s.st_dev, s.st_ino) != (os.fstat(fd).st_dev, os.fstat(fd).st_ino):
            raise RuntimeError()
        print('UNKNOWN' if 'password.pending' in before else 'STAGED' if 'password' in before else 'EMPTY')
    finally:
        ctypes.memset(ctypes.addressof(buffer), 0, ctypes.sizeof(buffer))
        if secret is not None:
            os.close(secret)
        if lock is not None:
            os.close(lock)
        os.close(fd)

try:
    main()
except BaseException:
    print('UNAVAILABLE')
    sys.exit(1)
'''


def ssh_command(verb):
    if verb not in ('prepare', 'check', 'stage'):
        raise RuntimeError()
    known = Path.home() / '.ssh' / 'known_hosts'
    s = known.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_mode & 0o022:
        raise RuntimeError()
    records = subprocess.run(
        ['ssh-keygen', '-F', HOST, '-f', str(known)], stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, check=True, timeout=5,
    ).stdout.decode('ascii').splitlines()
    pins = []
    for record in records:
        parts = record.split()
        if len(parts) == 3 and parts[1] == 'ssh-ed25519':
            pins.append(base64.b64encode(hashlib.sha256(base64.b64decode(parts[2], validate=True)).digest()).decode().rstrip('='))
    if not pins or set(pins) != {HOST_PIN}:
        raise RuntimeError()
    return [
        'ssh', '-F', '/dev/null', '-T', '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=yes', '-o', 'HostKeyAlgorithms=ssh-ed25519',
        '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'UserKnownHostsFile=' + str(known),
        '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes',
        '-o', 'LogLevel=ERROR', '-o', 'ConnectTimeout=10', 'root@' + HOST,
        'python3 -c ' + shlex.quote(REMOTE) + ' ' + verb,
    ]


def run_remote(verb, password=None):
    result = subprocess.run(ssh_command(verb), input=password if password is not None else b'',
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30)
    if result.returncode != 0 or result.stdout not in (b'EMPTY\n', b'STAGED\n', b'UNKNOWN\n'):
        raise RuntimeError()
    return result.stdout.decode('ascii').strip()


def hidden_input():
    with open('/dev/tty', 'w') as tty:
        if not tty.isatty() or not sys.stdin.isatty() or not sys.stdout.isatty():
            raise RuntimeError()
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            password = bytearray(getpass.getpass('Existing DEV postgres database password (hidden): ', stream=tty), 'utf-8')
    if not 1 <= len(password) <= 4096 or any(c in (0, 10, 13) for c in password):
        password[:] = b'\0' * len(password)
        raise RuntimeError()
    return password


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('--prepare', '--check', '--handoff'):
        print('Use --prepare, --check or --handoff; never supply a password argument.')
        return 1
    password = None
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        mode = sys.argv[1]
        state = run_remote('prepare' if mode == '--prepare' else 'check')
        if mode == '--handoff':
            if state != 'EMPTY':
                raise RuntimeError()
            password = hidden_input()
            if run_remote('stage', password) != 'STAGED':
                raise RuntimeError()
            print('STAGED: separate root-private DEV administrator custody; authentication not tested.')
        else:
            print(state + ': pinned DEV SSH; administrator custody metadata only.')
        return 0
    except BaseException:
        print('CLOSED: no diagnostics emitted. Do not replay handoff; use --check to reconcile metadata.')
        return 1
    finally:
        if password is not None:
            password[:] = b'\0' * len(password)


if __name__ == '__main__':
    sys.exit(main())
