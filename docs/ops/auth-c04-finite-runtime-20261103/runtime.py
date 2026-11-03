"""Default-closed Root-only runtime control. No SQL, credentials or business IO."""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shlex
import time
import uuid

HERE = Path(__file__).resolve().parent
REUSE = HERE / 'auth-phase2-runtime.py'
if not REUSE.exists():
    REUSE = HERE.parent / 'auth-phase2-20261028/finite-qa-window/runtime.py'
assert hashlib.sha256(REUSE.read_bytes()).hexdigest() == '014844d487ba4fb32d9abc42c22d533195831be3114d47a2b253d465d44b5444'
spec = importlib.util.spec_from_file_location('auth_phase2_runtime_control', REUSE)
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
canonical, sha, instant = legacy.canonical, legacy.sha, legacy.instant
private, save, call, inspect = legacy.private, legacy.save, legacy.call, legacy.inspect
env, mounts, Docker, locked = legacy.env, legacy.mounts, legacy.Docker, legacy.locked
wait_healthy = legacy.wait_healthy
SELECTOR = 'OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG'
MODE = 'OTR_DEV_AUTH_MEMBER_CLAIM_QA_MODE'
raw = (HERE / 'QA_CASE_TEMPLATE.json').read_bytes()
assert hashlib.sha256(raw).hexdigest() == '98cc4472819c038a997715863257b2b2729daa5c26c0938c6fc866d82b5f72b4'
CASE = json.loads(raw)['qaCase']


def digest(value):
    assert isinstance(value, str) and re.fullmatch('[a-f0-9]{64}', value) and value != '0' * 64
    return value


def validate(p, now=None, starting=False):
    assert p['version'] == 1 and str(uuid.UUID(p['windowId'])) == p['windowId']
    assert p['root'] == '/opt/otr/dev-backend/releases/auth-c04-qa-' + p['windowId']
    assert p.get('executionMode') in (None, 'RECOVERY_ONLY'), 'UNKNOWN_EXECUTION_MODE'
    qa = p['qaCase']
    assert set(qa) == set(CASE) | {'opensAt', 'inviteExpiresAt', 'closesAt'}
    assert {k: qa[k] for k in CASE} == CASE, 'EXACT_A_B_CASE_REQUIRED'
    opening, invite, closing = (instant(qa[k]) for k in ('opensAt', 'inviteExpiresAt', 'closesAt'))
    assert 0 < closing - opening <= 1800 and 0 < invite - opening <= 600 and invite <= closing
    if p.get('executionMode') == 'RECOVERY_ONLY':
        assert 120 < closing - opening <= 900, 'RECOVERY_WINDOW_LIMIT'
    assert p['ownerAuthorized'] is True and p['executionQualified'] is True, 'EXECUTION_NOT_QUALIFIED'
    for key in ('approvedGateSHA256', 'ownerApprovalSHA256', 'qualifiedPreflightSHA256', 'runtimeSHA256'):
        digest(p[key])
    b = p['baseline']
    digest(b['containerId'])
    assert re.fullmatch('sha256:[a-f0-9]{64}', b['image'])
    for key in ('configSHA256', 'hostConfigSHA256', 'environmentSHA256', 'mountsSHA256'):
        digest(b[key])
    for name in ('configHashes', 'mountedFileHashes'):
        assert isinstance(b[name], dict)
        for path, value in b[name].items():
            assert Path(path).is_absolute()
            digest(value)
    if starting:
        moment = time.time() if now is None else now
        assert math.isfinite(moment) and opening <= moment < invite and moment < closing, 'WINDOW_NOT_OPEN'
    return p


def names(p):
    return ('otr-auth-c04-qa-' + p['windowId'], 'otr-auth-c04-default-' + p['windowId'],
            'otr-auth-c04-closed-' + p['windowId'])


def check_base(p, s, healthy=False):
    b = p['baseline']
    assert s['Id'] == b['containerId'] and s['Image'] == b['image'], 'BASELINE_IDENTITY_DRIFT'
    assert sha(s['Config']) == b['configSHA256'] and sha(s['HostConfig']) == b['hostConfigSHA256']
    assert sha(env(s)) == b['environmentSHA256'] and sha(mounts(s)) == b['mountsSHA256']
    assert SELECTOR not in env(s) and MODE not in env(s), 'BASELINE_NOT_CLOSED'
    for path, expected in {**b['configHashes'], **b['mountedFileHashes']}.items():
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == expected, 'FILE_DRIFT'
    if healthy:
        assert s['State'].get('Health', {}).get('Status') == 'healthy'


def active_config(p, baseline):
    values = env(baseline)
    values[SELECTOR] = canonical(p['qaCase']).decode()
    if p.get('executionMode') == 'RECOVERY_ONLY':
        values[MODE] = 'RECOVERY_ONLY'
    return dict(baseline['Config'], Env=[k + '=' + v for k, v in values.items()])


def check_active(p, s, state):
    baseline = inspect(p['baseline']['containerId'])
    check_base(p, baseline)
    assert s['Id'] == state['candidateId'] and s['Id'] != baseline['Id']
    assert s['Image'] == baseline['Image'] and s['Config'] == active_config(p, baseline)
    assert legacy.active_host_hash(s, baseline) == p['baseline']['hostConfigSHA256']
    assert sha(mounts(s)) == p['baseline']['mountsSHA256']
    return baseline


def current():
    ids = call(['docker', 'ps', '-aq', '--no-trunc', '--filter', 'name=^/otr-dev-backend$']).splitlines()
    assert len(ids) <= 1, 'CURRENT_SERVICE_AMBIGUOUS'
    return inspect(ids[0]) if ids else None


def known(p, state):
    baseline = inspect(p['baseline']['containerId'])
    check_base(p, baseline)
    candidate = inspect(state['candidateId'])
    check_active(p, candidate, state)
    active, retained, closed = names(p)
    assert baseline['Name'] in ['/otr-dev-backend', '/' + retained]
    assert candidate['Name'] in ['/otr-dev-backend', '/' + active, '/' + closed]
    live = current()
    assert live is None or live['Id'] in [baseline['Id'], candidate['Id']], 'FOREIGN_CURRENT_SERVICE'
    return baseline, candidate, live


def verify(p):
    s = inspect('otr-dev-backend')
    check_base(p, s, healthy=True)
    assert s['Name'] == '/otr-dev-backend' and s['State']['Running']
    return {'status': 'AUTH_C04_RUNTIME_CLOSED_VERIFIED', 'runtimeClosed': True,
            'containerId': s['Id'], 'image': s['Image'], 'selectorAbsent': True,
            'environmentSHA256': sha(env(s)), 'businessOutcome': 'NOT_INFERRED'}


def close(p, state):
    baseline, candidate, _ = known(p, state)
    if candidate['State']['Running']:
        call(['docker', 'stop', '--time', '10', candidate['Id']])
    if candidate['Name'] == '/otr-dev-backend':
        call(['docker', 'rename', candidate['Id'], names(p)[2]])
    if baseline['Name'] != '/otr-dev-backend':
        call(['docker', 'rename', baseline['Id'], 'otr-dev-backend'])
    if not inspect(baseline['Id'])['State']['Running']:
        call(['docker', 'start', baseline['Id']])
    check_base(p, wait_healthy(baseline['Id']), healthy=True)
    return verify(p)  # Independent inspect after the retained process is healthy.


def stage(p):
    validate(p, starting=True)
    baseline = inspect('otr-dev-backend')
    check_base(p, baseline, healthy=True)
    assert not call(['systemctl', 'list-units', 'otr-auth-c04-close-*.timer', '--state=active', '--no-legend', '--plain']).strip(), 'OTHER_C04_TIMER_ACTIVE'
    assert not call(['docker', 'ps', '-aq', '--filter', 'name=^/' + names(p)[0] + '$']).strip(), 'CANDIDATE_EXISTS_RECONCILE'
    client = Docker('localhost', timeout=20)
    client.request('POST', '/v1.44/containers/create?name=' + names(p)[0],
                   canonical({**active_config(p, baseline), 'HostConfig': baseline['HostConfig']}),
                   {'Content-Type': 'application/json'})
    response = client.getresponse()
    raw = response.read()
    client.close()
    assert response.status == 201, 'CREATE_UNKNOWN_RECONCILE_NO_RETRY'
    state = {'candidateId': json.loads(raw)['Id']}
    try:
        candidate = inspect(state['candidateId'])
        check_active(p, candidate, state)
        assert candidate['State']['Status'] == 'created'
        save(Path(p['root']) / 'state.json', state)
    except Exception:
        close(p, state)  # Never infer rollback of an operation; the candidate was not started here.
        raise
    return {'status': 'STAGED_NOT_STARTED', **state}


def reconcile_stage(p):
    validate(p, starting=True)
    check_base(p, inspect('otr-dev-backend'), healthy=True)
    ids = call(['docker', 'ps', '-aq', '--no-trunc', '--filter', 'name=^/' + names(p)[0] + '$']).splitlines()
    assert len(ids) == 1, 'EXACT_CREATED_CANDIDATE_REQUIRED'
    state = {'candidateId': ids[0]}
    candidate = inspect(ids[0])
    check_active(p, candidate, state)
    assert candidate['State']['Status'] == 'created'
    save(Path(p['root']) / 'state.json', state)
    return {'status': 'STAGED_RECONCILED_NOT_STARTED', **state}


def timer_bindings(p):
    hard = ('otr-auth-c04-close-' + p['windowId'], instant(p['qaCase']['closesAt']))
    return [hard, ('otr-auth-c04-recovery-close-' + p['windowId'], hard[1] - 120)] if p.get('executionMode') == 'RECOVERY_ONLY' else [hard]


def verify_timers(p, plan_hash):
    expected = {'unit': 'otr-auth-c04-close-' + p['windowId'], 'planSHA256': plan_hash, 'closesAt': p['qaCase']['closesAt']}
    if p.get('executionMode') == 'RECOVERY_ONLY':
        expected['normalUnit'] = timer_bindings(p)[1][0]
    assert json.loads(private(Path(p['root']) / 'timer.json')) == expected, 'TIMER_PLAN_DRIFT'
    for unit, cutoff in timer_bindings(p):
        show = lambda name, key: call(['systemctl', 'show', name, '--property=' + key, '--value']).strip()
        assert show(unit + '.timer', 'ActiveState') == 'active', 'CLOSE_TIMER_REQUIRED'
        assert show(unit + '.timer', 'Unit') == unit + '.service', 'TIMER_SERVICE_MISMATCH'
        calendar = dt.datetime.fromtimestamp(cutoff, dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        calendars = re.findall(r'OnCalendar=([^;]+);', show(unit + '.timer', 'TimersCalendar'))
        assert len(calendars) == 1 and calendars[0].strip() == calendar, 'TIMER_CALENDAR_MISMATCH'
        observed = re.fullmatch(r'[A-Za-z]{3} (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?) UTC', show(unit + '.timer', 'NextElapseUSecRealtime'))
        assert observed and dt.datetime.fromisoformat(observed[1]).replace(tzinfo=dt.timezone.utc).timestamp() == int(cutoff), 'TIMER_DEADLINE_MISMATCH'
        argv = re.findall(r'argv\[\]=([^;]+);', show(unit + '.service', 'ExecStart'))
        assert len(argv) == 1 and shlex.split(argv[0]) == ['/usr/bin/python3', p['root'] + '/runtime.py', 'close', p['root'] + '/plan.json', plan_hash], 'TIMER_EXEC_MISMATCH'
        assert show(unit + '.service', 'User') == 'root', 'TIMER_USER_MISMATCH'


def qualify_recovery(p, state, plan_hash):
    validate(p, starting=True)
    assert p.get('executionMode') == 'RECOVERY_ONLY', 'RECOVERY_MODE_REQUIRED'
    verify_timers(p, plan_hash)
    active = inspect('otr-dev-backend')
    check_active(p, active, state)
    assert active['State'].get('Health', {}).get('Status') == 'healthy'
    assert active['State'].get('Running') is True and active['Name'] == '/otr-dev-backend', 'RECOVERY_RUNTIME_NOT_RUNNING'
    return {'status': 'AUTH_C04_RECOVERY_WINDOW_QUALIFIED', 'qaCase': p['qaCase'], 'executionMode': 'RECOVERY_ONLY', 'image': active['Image'], 'containerId': active['Id'], 'configSHA256': sha(active['Config']), 'planSHA256': plan_hash, 'businessMutationAuthorized': False}


def arm(p, plan_hash):
    validate(p, starting=True)
    state = json.loads(private(Path(p['root']) / 'state.json'))
    known(p, state)
    unit = 'otr-auth-c04-close-' + p['windowId']
    for unit_name, cutoff in timer_bindings(p):
        calendar = dt.datetime.fromtimestamp(cutoff, dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        call(['systemd-run', '--unit=' + unit_name, '--on-calendar=' + calendar,
          '--timer-property=AccuracySec=1s', '--property=Type=oneshot', '--property=TimeoutStartSec=240s',
          '--property=UMask=0077', '--property=User=root', '--property=Restart=on-failure', '--property=RestartSec=5s',
          '--property=StartLimitIntervalSec=0', '/usr/bin/python3', p['root'] + '/runtime.py',
          'close', p['root'] + '/plan.json', plan_hash])
        assert call(['systemctl', 'show', unit_name + '.timer', '--property=ActiveState', '--value']).strip() == 'active', 'TIMER_NOT_ARMED'
    record = {'unit': unit, 'planSHA256': plan_hash, 'closesAt': p['qaCase']['closesAt']}
    if p.get('executionMode') == 'RECOVERY_ONLY':
        record['normalUnit'] = timer_bindings(p)[1][0]
    save(Path(p['root']) / 'timer.json', record)
    verify_timers(p, plan_hash)
    return {'status': 'INDEPENDENT_RUNTIME_CLOSE_ARMED', 'unit': unit, 'closesAt': p['qaCase']['closesAt']}


def start(p, state, plan_hash):
    validate(p, starting=True)
    verify_timers(p, plan_hash)
    baseline, candidate, live = known(p, state)
    assert live and live['Id'] == baseline['Id'] and baseline['State']['Running']
    check_base(p, baseline, healthy=True)
    assert candidate['State']['Status'] == 'created'
    try:
        call(['docker', 'stop', '--time', '10', baseline['Id']])
        call(['docker', 'rename', baseline['Id'], names(p)[1]])
        call(['docker', 'rename', candidate['Id'], 'otr-dev-backend'])
        call(['docker', 'start', candidate['Id']])
        check_active(p, wait_healthy(candidate['Id']), state)
        validate(p, starting=True)
        return {'status': 'AUTH_C04_FINITE_RUNTIME_HEALTHY', 'closesAt': p['qaCase']['closesAt'],
                'candidateId': candidate['Id'], 'businessOutcome': 'NOT_INFERRED'}
    except Exception:
        try:
            close(p, state)
        except Exception as error:
            raise RuntimeError('RUNTIME_ROLLBACK_UNCONFIRMED') from error
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['stage', 'reconcile-stage', 'arm', 'start', 'close', 'verify', 'qualify-recovery'])
    parser.add_argument('plan', type=Path)
    parser.add_argument('sha256')
    args = parser.parse_args()
    assert legacy.os.getuid() == 0
    raw = private(args.plan)
    assert hashlib.sha256(raw).hexdigest() == args.sha256, 'PLAN_HASH'
    p = validate(json.loads(raw))
    assert args.plan == Path(p['root']) / 'plan.json'
    assert hashlib.sha256(private(Path(p['root']) / 'runtime.py')).hexdigest() == p['runtimeSHA256']
    with locked():
        if args.mode == 'stage':
            result = stage(p)
        elif args.mode == 'reconcile-stage':
            result = reconcile_stage(p)
        elif args.mode == 'arm':
            result = arm(p, args.sha256)
        elif args.mode == 'verify':
            result = verify(p)
        else:
            state = json.loads(private(Path(p['root']) / 'state.json'))
            result = qualify_recovery(p, state, args.sha256) if args.mode == 'qualify-recovery' else start(p, state, args.sha256) if args.mode == 'start' else close(p, state)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'AUTH_C04_CONTROL_UNCONFIRMED', 'reconcileRequired': True}))
        raise SystemExit(1)
