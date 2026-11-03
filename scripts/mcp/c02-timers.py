"""Root-only C02 timer installation. Does not enable a runtime, issuer or business write."""
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import time

WINDOW = 'e32551d418f54fcdb02d9783eb4c2f9c'
GATE = 'c2315ce8580b7658bcf3f52c0df698981750cf5daa98cfe7b05dc307110fa157'
ROOT = Path('/opt/otr/dev-backend/build/auth-consumer-write-qa-' + WINDOW)
CLOSE_SHA = 'e2f45d0492a455d60edfcc87283049a4f096033a6d149dfcf777ed1debb52c81'
SHA = lambda raw: hashlib.sha256(raw).hexdigest()
DIGEST = lambda value: SHA(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())
EXEC = ['/usr/bin/python3', str(ROOT / 'c02-close.py'), str(ROOT)]


def units():
    return [('otr-mcp-c02-' + WINDOW + '-' + phase, key)
            for phase, key in [('normal', 'normalCloseAt'), ('hard', 'expiresAt')]]


def validate(config, pointer, restore, restore_sha, now_ms):
    assert set(config) == {'plan', 'confirmations'}
    p = config['plan']
    assert p['gateSHA256'] == GATE and p['windowId'] == 'e32551d4-18f5-4fcd-b02d-9783eb4c2f9c'
    assert p['command'] is None and config['confirmations'] == [], 'EMPTY_ONLY'
    assert all(type(p[k]) is int for k in ['startsAt', 'normalCloseAt', 'expiresAt'])
    assert 0 < p['expiresAt'] - p['startsAt'] <= 1800000
    assert p['normalCloseAt'] == p['expiresAt'] - 120000
    if now_ms is not None:
        assert p['startsAt'] <= now_ms < p['normalCloseAt'] // 1000 * 1000, 'ARM_WINDOW_CLOSED'
    assert pointer['gateSHA256'] == GATE and pointer['windowId'] == WINDOW
    assert pointer['deadlineMs'] == p['expiresAt']
    assert pointer['planSHA256'] == restore_sha
    assert pointer['defaultContainerId'] == restore['beforeContainerId']
    assert pointer['defaultConfigSHA256'] == restore['beforeConfigSHA256']
    assert restore['beforeImage'] == restore['candidateImage']
    return p


def calendar(ms):
    # Floor to seconds: neither timer may extend the single binder deadline.
    return dt.datetime.fromtimestamp(ms // 1000, dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')


def observed_ms(value):
    m = re.fullmatch(r'[A-Za-z]{3} (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?) UTC', value.strip())
    assert m, 'TIMER_TIMESTAMP_UNCONFIRMED'
    return int(dt.datetime.fromisoformat(m[1]).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)


def call(args):
    return subprocess.check_output(args, stderr=subprocess.PIPE, timeout=5,
        env={**os.environ, 'LC_ALL': 'C', 'TZ': 'UTC'}).decode().strip()


def show(run, name, key):
    return run(['/usr/bin/systemctl', 'show', name, '--property=' + key, '--value']).strip()


def verify(p, run=call):
    rows = []
    for unit, key in units():
        assert show(run, unit + '.timer', 'ActiveState') == 'active', 'TIMER_NOT_ACTIVE'
        assert show(run, unit + '.timer', 'Unit') == unit + '.service', 'TIMER_SERVICE_MISMATCH'
        specs = re.findall(r'OnCalendar=([^;]+);', show(run, unit + '.timer', 'TimersCalendar'))
        assert len(specs) == 1 and specs[0].strip() == calendar(p[key]), 'TIMER_CALENDAR_MISMATCH'
        actual = observed_ms(show(run, unit + '.timer', 'NextElapseUSecRealtime'))
        assert actual == p[key] // 1000 * 1000, 'TIMER_DEADLINE_MISMATCH'
        raw = show(run, unit + '.service', 'ExecStart')
        argv = re.findall(r'argv\[\]=([^;]+);', raw)
        assert len(argv) == 1 and shlex.split(argv[0]) == EXEC, 'TIMER_EXEC_MISMATCH'
        assert show(run, unit + '.service', 'User') == 'root', 'TIMER_USER_MISMATCH'
        rows.append({'unit': unit + '.timer', 'deadlineMs': actual, 'exec': EXEC})
    return {'status': 'C02_BOTH_ABSOLUTE_TIMERS_VERIFIED', 'timers': rows,
            'authorityActivated': False, 'issuerArmed': False}


def arm(p, run=call):
    assert not run(['/usr/bin/systemctl', 'list-units', 'otr-mcp-c02-' + WINDOW + '-*',
                    '--all', '--no-legend', '--plain']).strip(), 'EXISTING_UNITS_RECONCILE_ONLY'
    for unit, key in units():
        run(['/usr/bin/systemd-run', '--unit=' + unit, '--on-calendar=' + calendar(p[key]),
             '--timer-property=AccuracySec=1s', '--property=Type=oneshot',
             '--property=TimeoutStartSec=240s', '--property=UMask=0077', '--property=User=root',
             '--property=Restart=on-failure', '--property=RestartSec=5s',
             '--property=StartLimitIntervalSec=0', *EXEC])
    # Partial failure leaves existing safety timers intact; never reset or start authority.
    return verify(p, run)


def disarm(run=call):
    # main permits this only after the exact retained default is independently closed.
    names = [unit + suffix for unit, _ in units() for suffix in ('.timer', '.service')]
    try:
        run(['/usr/bin/systemctl', 'stop', *names])
    except subprocess.CalledProcessError as error:
        # systemd may already have unloaded a transient service; verify every unit below.
        if error.returncode != 5:
            raise
    for name in names:
        assert show(run, name, 'ActiveState') == 'inactive', 'TIMER_STOP_UNCONFIRMED'
    return {'status': 'C02_OWN_TIMERS_DISARMED_AFTER_DEFAULT_CLOSED', 'units': names}


def require_before_serve(g, directory, read_private, now_ms, run=call):
    assert directory == ROOT
    config = json.loads(read_private(ROOT / 'C02_EMPTY_CONFIG.json'))
    pointer = json.loads(read_private(ROOT / 'close-current.json'))
    raw = read_private(ROOT / 'deploy-plan.json')
    p = validate(config, pointer, json.loads(raw), SHA(raw), now_ms)
    current = json.loads(g['authQaConfig'])['plan']
    keys = ['gateSHA256', 'windowId', 'startsAt', 'normalCloseAt', 'expiresAt']
    assert {k: current[k] for k in keys} == {k: p[k] for k in keys}, 'TIMER_WINDOW_DRIFT'
    return verify(p, run)


def private(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as f:
        s = os.fstat(f.fileno())
        assert stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1
        assert stat.S_IMODE(s.st_mode) == 0o600 and s.st_size <= 131072
        return f.read()


def main():
    assert len(sys.argv) == 3 and sys.argv[1] in ('arm', 'verify', 'disarm')
    assert os.getuid() == 0 and ROOT.resolve() == ROOT
    s = ROOT.lstat()
    assert stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and stat.S_IMODE(s.st_mode) == 0o700
    raw = private(ROOT / 'C02_EMPTY_CONFIG.json')
    assert SHA(raw) == sys.argv[2]
    close_raw = private(ROOT / 'c02-close.py')
    assert SHA(close_raw) == CLOSE_SHA
    spec = importlib.util.spec_from_file_location('pinned_c02_close', ROOT / 'c02-close.py')
    close = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(close)
    for name, expected in close.PORTS.items():
        assert SHA(private(ROOT / name)) == expected
    fd = os.open('/run/lock/otr-universal-finite-service.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        st = os.fstat(fd)
        assert stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        config = json.loads(raw)
        pointer = json.loads(private(ROOT / 'close-current.json'))
        restore_raw = private(ROOT / 'deploy-plan.json')
        restore = json.loads(restore_raw)
        now = None if sys.argv[1] == 'disarm' else int(time.time() * 1000)
        p = validate(config, pointer, restore, SHA(restore_raw), now)
        close.validate(pointer, restore, SHA(restore_raw))
        current = json.loads(call(['/usr/bin/docker', 'inspect', 'otr-dev-backend']))[0]
        assert current['Id'] == pointer['defaultContainerId'], 'ARM_BEFORE_AUTHORITY_ONLY'
        assert DIGEST(current['Config']) == pointer['defaultConfigSHA256']
        assert current['Image'] == restore['beforeImage'] and current['State']['Health']['Status'] == 'healthy'
        assert not any(k.startswith(('OTR_DEV_MCP_C02_QA_CONFIG=', 'OTR_DEV_MCP_WRITE_QA_CONFIG=',
            'OTR_DEV_MCP_READ_QA_CONFIG=', 'OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG='))
            for k in current['Config']['Env']), 'QA_ALREADY_ACTIVE'
        for path, digest in {**restore['beforeConfigHashes'], **restore['mountedFileHashes']}.items():
            assert SHA(Path(path).read_bytes()) == digest, 'CURRENT_FILES_DRIFT'
        result = arm(p) if sys.argv[1] == 'arm' else disarm() if sys.argv[1] == 'disarm' else verify(p)
        print(json.dumps(result))
    finally:
        os.close(fd)


if __name__ == '__main__':
    main()
