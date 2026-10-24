#!/usr/bin/env python3
"""Finite transition watchdog; successful verified handoff preserves sustained service.
Default is prepare. No SQL, credentials, deployment or implicit closure implementation.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

GATE = '0f6c8bf72e41c17a939424cbf821770ac355b7b235ce300abbb7eb6e46058bf0'
ACTOR = '1f65e932-b6d8-4ea4-9cc9-fe9da331b424'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def instant(value):
    if not isinstance(value, str) or not value.endswith('Z'):
        raise ValueError('UTC_REQUIRED')
    result = dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    if not 0 < result < 32503680000:
        raise ValueError('FINITE_UTC_REQUIRED')
    return result


def private(path, directory=False):
    path = Path(path)
    stat = path.lstat()
    if path.is_symlink() or stat.st_uid != os.getuid() or stat.st_mode & 0o777 != (0o700 if directory else 0o600):
        raise ValueError('PRIVATE_PATH_REQUIRED')
    if directory != path.is_dir():
        raise ValueError('PRIVATE_PATH_TYPE')
    return path


def validate(plan):
    if plan['approvedGateSHA256'] != GATE or plan['actorId'] != ACTOR:
        raise ValueError('AUTHORITY_BINDING')
    if str(uuid.UUID(plan['transitionId'])) != plan['transitionId']:
        raise ValueError('TRANSITION_ID')
    instant(plan['adoptionCutoff'])
    start, end = instant(plan['startsAt']), instant(plan['expiresAt'])
    if not 0 < end - start <= 900:
        raise ValueError('TRANSITION_WINDOW')
    argv = plan['closeCommand']['argv']
    entry = Path(plan['closeCommand']['entryFile'])
    if not isinstance(argv, list) or not argv or any(not isinstance(a, str) or '\x00' in a for a in argv):
        raise ValueError('CLOSE_ARGV')
    if not Path(argv[0]).is_absolute() or not entry.is_absolute() or str(entry) not in argv:
        raise ValueError('CLOSE_ENTRY_BINDING')
    if Path(argv[0]).name in ('sh', 'bash', 'zsh', 'dash', 'env'):
        raise ValueError('SHELL_FORBIDDEN')
    if entry.is_symlink() or sha(entry.read_bytes()) != plan['closeCommand']['entrySHA256']:
        raise ValueError('CLOSE_ENTRY_HASH')
    return end


def write_private(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())


def prepare(plan_file, run_dir):
    plan = json.loads(Path(plan_file).read_text())
    validate(plan)
    run_dir = Path(run_dir)
    run_dir.mkdir(mode=0o700)
    private(run_dir, True)
    write_private(run_dir / 'plan.json', plan)
    digest = sha(canonical(plan))
    write_private(run_dir / 'prepared.json', {'status': 'PREPARED_NOT_STARTED', 'planSHA256': digest})
    return digest


def valid_marker(run_dir, plan, digest):
    marker = Path(run_dir) / 'handoff.json'
    if not marker.exists():
        return False
    try:
        value = json.loads(private(marker).read_text())
        return value == {'status': 'SUSTAINED_HANDOFF_VERIFIED', 'planSHA256': digest,
                         'approvedGateSHA256': GATE, 'actorId': ACTOR,
                         'adoptionCutoff': plan['adoptionCutoff'], 'transitionId': plan['transitionId'],
                         'serviceAndPolicyVerified': True}
    except (ValueError, OSError):
        return False


def close_once(plan):
    # The Root-owned fixed entry implements SQL/role/policy closure AND runtime recovery.
    # Never retain stdout/stderr; only accept its small verified result.
    validate(plan)
    result = subprocess.run(plan['closeCommand']['argv'], capture_output=True, text=True, timeout=180, check=False)
    if result.returncode != 0:
        return False
    try:
        value = json.loads(result.stdout)
        return value.get('verified') is True and value.get('status') == 'CLOSED_VERIFIED'
    except (ValueError, AttributeError):
        return False


def watch(run_dir, expected_sha, clock=time.time, pause=time.sleep, closer=close_once):
    run_dir = private(run_dir, True)
    plan = json.loads(private(run_dir / 'plan.json').read_text())
    digest = sha(canonical(plan))
    if digest != expected_sha:
        raise ValueError('PLAN_HASH_MISMATCH')
    deadline = validate(plan)
    # Exclusive claim prevents two watchdogs from issuing the same closure. Never auto-retry a failed claim.
    write_private(run_dir / 'watch-claimed.json', {'planSHA256': digest, 'pid': os.getpid()})
    attempts = 0
    status = 'RECONCILE_REQUIRED'
    while clock() < deadline:
        if clock() >= instant(plan['startsAt']) and valid_marker(run_dir, plan, digest) and clock() < deadline:
            status = 'SUSTAINED_HANDOFF_VERIFIED'
            break
        pause(min(1, max(0, deadline - clock())))
    if status != 'SUSTAINED_HANDOFF_VERIFIED':
        # A marker arriving at/after expiry does not cancel closure.
        attempts = 1
        try:
            status = 'CLOSED_VERIFIED' if closer(plan) is True else 'RECONCILE_REQUIRED'
        except Exception:
            status = 'RECONCILE_REQUIRED'
    receipt = {'status': status, 'planSHA256': digest, 'transitionId': plan['transitionId'],
               'closureAttempts': attempts, 'sustainedServiceRetained': status == 'SUSTAINED_HANDOFF_VERIFIED'}
    write_private(run_dir / 'watch-result.json', receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', nargs='?', choices=('prepare', 'watch'), default='prepare')
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--plan-sha')
    args = parser.parse_args()
    if args.mode == 'prepare':
        if args.plan is None:
            parser.error('--plan required for prepare')
        print(json.dumps({'status': 'PREPARED_NOT_STARTED', 'planSHA256': prepare(args.plan, args.run_dir)}))
    else:
        if args.plan_sha is None:
            parser.error('--plan-sha required for watch')
        result = watch(args.run_dir, args.plan_sha)
        print(json.dumps(result))
        if result['status'] == 'RECONCILE_REQUIRED':
            raise SystemExit(2)


if __name__ == '__main__':
    main()
