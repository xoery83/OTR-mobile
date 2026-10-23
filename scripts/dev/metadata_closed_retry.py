"""B-only deployment retry template. Default prepares a plan; never provisions SQL/Auth."""
import argparse
import datetime
import hashlib
import hmac
import inspect
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import time
import urllib.request

PROJECT = 'tuqigdxrvrerfewsxqgm'
HOST = 'root@178.105.151.143'
OLD_IMAGE = 'sha256:012f2d06476af824a609f7e7b5f2985fa36ae960d903c30f8c3cd283bc4c129e'


def redact(text, environment):
    # Raw logs exist in memory only. Never write first and redact later.
    for key, value in environment.items():
        if value and re.search(r'secret|token|password|credential|cookie|key', key, re.I):
            text = text.replace(value, '[REDACTED]')
    text = re.sub(r'(?i)Bearer\s+[^\s\"\']+', 'Bearer [REDACTED]', text)
    text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]', text)
    text = re.sub(r"""(?i)(["']?[A-Za-z0-9_-]*(?:password|secret|token|api[_-]?key|credential|authorization)[A-Za-z0-9_-]*["']?\s*[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)""", r'\1"[REDACTED]"', text)
    text = re.sub(r'(?i)(https?://)[^/@\s]+:[^/@\s]+@', r'\1[REDACTED]@', text)
    return text


def environment_projection(before, after, key):
    canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
    return {
        'equal': before == after,
        'changedKeys': sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k)),
        'beforeCanonicalSHA256': hashlib.sha256(canonical(before)).hexdigest(),
        'afterCanonicalSHA256': hashlib.sha256(canonical(after)).hexdigest(),
        'afterKeyedHashes': {k: hmac.new(key, v.encode(), hashlib.sha256).hexdigest() for k, v in sorted(after.items())},
    }


def diagnostics(snapshot, log_text, before_environment, comparison_key):
    env = dict(v.split('=', 1) for v in snapshot['Config']['Env'])
    # Redact against BOTH generations, including a credential replaced during startup.
    secrets = dict(before_environment)
    secrets.update({k + '_after': v for k, v in env.items()})
    state = snapshot['State']
    health = state.get('Health', {})
    result = {
        'image': snapshot['Image'],
        'state': {k: state.get(k) for k in ('Status', 'Running', 'ExitCode', 'OOMKilled', 'Error', 'StartedAt', 'FinishedAt')},
        'health': {'status': health.get('Status'), 'failingStreak': health.get('FailingStreak'), 'log': health.get('Log', [])},
        'logs': log_text,
        'environment': environment_projection(before_environment, env, comparison_key),
    }
    # Health.Output and State.Error can also contain secrets, not just stdout/stderr.
    def clean(value):
        if isinstance(value, str):
            return redact(value, secrets)
        if isinstance(value, list):
            return [clean(v) for v in value]
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items()}
        return value
    return clean(result)


def remote_deploy(gate):
    def command(args):
        return subprocess.check_output(args, text=True, timeout=5)
    def current():
        return json.loads(command(['docker', 'inspect', 'otr-dev-backend']))[0]
    def env(snapshot):
        return dict(v.split('=', 1) for v in snapshot['Config']['Env'])
    def mounts(snapshot):
        return sorted([(m['Source'], m['Destination'], m['RW']) for m in snapshot['Mounts']])
    before = current()
    assert before['Image'] == gate['beforeImage'] and before['State']['Health']['Status'] == 'healthy'
    assert hashlib.sha256(subprocess.check_output(['docker','exec','otr-dev-backend','cat','/app/server.mjs'],timeout=5)).hexdigest() == gate['beforeBundleSHA256'], 'BASELINE_BUNDLE_DRIFT'
    before_env = env(before)
    assert hashlib.sha256(json.dumps(before_env, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == gate['beforeEnvironmentSHA256'], 'BASELINE_ENV_DRIFT'
    assert before_env.get('OTR_DEV_SUPABASE_URL') == 'https://tuqigdxrvrerfewsxqgm.supabase.co'
    assert before_env.get('OTR_DEV_FLIGHT_ONE_SHOT') == 'disabled' and before_env.get('OTR_DEV_FLIGHT_REMOTE_TRANSPORT') == 'disabled' and before_env.get('OTR_DEV_SOURCE_PDF2_TRANSPORT') == 'CLOSED'
    files = before['Config']['Labels']['com.docker.compose.project.config_files'].split(',')
    assert files == gate['beforeConfigFiles']
    for path, digest in gate['beforeConfigHashes'].items():
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, 'CONFIG_DRIFT'
    assert len(before['Mounts']) == 3 and not any('trip-create-runtime' in m['Destination'] or 'trip-metadata-runtime' in m['Destination'] or 'source-runtime' in m['Destination'] for m in before['Mounts'])
    assert json.loads(command(['docker', 'image', 'inspect', gate['candidateImage']]))[0]['Id'] == gate['candidateImage']
    def assert_b_window_and_closed_custody():
        now = datetime.datetime.now(datetime.timezone.utc)
        start, end = [datetime.datetime.fromisoformat(gate[k].replace('Z', '+00:00')) for k in ('startsAt','expiresAt')]
        assert start <= now < end and (end-start).total_seconds() <= 900, 'B_WINDOW_CLOSED'
        path = Path('/opt/otr/dev-backend/env/capture-custody.json')
        body = path.read_bytes()  # Hash/expiry only; never persist/export body or batch.
        assert hashlib.sha256(body).hexdigest() == gate['expectedCustodySHA256'], 'CUSTODY_CONFIG_DRIFT'
        expiry = datetime.datetime.fromisoformat(json.loads(body)['expiresAt'].replace('Z','+00:00'))
        assert expiry <= now, 'B_REQUIRES_CUSTODY_CLOSED'
    assert_b_window_and_closed_custody()
    release = Path(gate['releaseDirectory'])
    release.mkdir(mode=0o700)  # Existing directory/attempt must reconcile, never rerun.
    forward = release / 'compose.forward.closed.yml'
    rollback = release / 'compose.rollback.closed.yml'
    forward.write_text('services:\n  backend:\n    image: "' + gate['candidateImage'] + '"\n    command: ["node", "server-capture.mjs"]\n')
    rollback.write_text('services:\n  backend:\n    image: "' + before['Image'] + '"\n    command: ["node", "server.mjs"]\n')
    compose_env = dict(os.environ, OTR_DEV_BACKEND_REVIEWED_IMAGE_ID=before['Image'])
    def compose(extra):
        args = ['docker', 'compose', '-p', 'dev-backend']
        for file in files + extra:
            args += ['-f', str(file)]
        return args
    def render(extra):
        return json.loads(subprocess.check_output(compose(extra) + ['config', '--no-env-resolution', '--no-interpolate', '--format', 'json'], env=compose_env, timeout=5))['services']['backend']
    base, candidate = render([]), render([forward])
    base_without = {k: v for k, v in base.items() if k not in ('image', 'command')}
    assert base_without == {k: v for k, v in candidate.items() if k not in ('image', 'command')}
    assert render([rollback]) == base
    comparison_key = os.urandom(32)  # Never stored/exported.
    report = {'phase': 'B_ONLY', 'phaseCExecuted': False, 'diagnosticsCapturedBeforeRollback': False, 'healthDeadlineSeconds': 40}
    healthy = False
    # A late precondition failure must NOT enter rollback or mutate the service.
    assert_b_window_and_closed_custody()
    try:
        run = subprocess.run(compose([forward]) + ['up', '-d', '--no-build', '--pull', 'never', 'backend'], env=compose_env, capture_output=True, text=True, timeout=25)
        deadline = time.monotonic() + 40
        while True:
            after = current()
            if after['State'].get('Health', {}).get('Status') == 'healthy' or after['State']['Status'] in ('exited', 'dead'):
                break
            if time.monotonic() >= deadline:
                break
            time.sleep(min(2, max(0, deadline-time.monotonic())))
        after = current()
        healthy = run.returncode == 0 and after['Image'] == gate['candidateImage'] and after['State'].get('Health', {}).get('Status') == 'healthy' and env(after) == before_env and mounts(after) == mounts(before) and after['HostConfig'] == before['HostConfig'] and after['Config']['User'] == before['Config']['User'] and after['Config']['Cmd'] == ['node', 'server-capture.mjs']
        if healthy:
            report['httpHealth'] = json.load(urllib.request.urlopen('http://127.0.0.1:8787/health', timeout=3))
            report['bundleSHA256'] = hashlib.sha256(subprocess.check_output(['docker', 'exec', 'otr-dev-backend', 'cat', '/app/server-capture.mjs'], timeout=5)).hexdigest()
            healthy = report['httpHealth'] == {'status': 'ok', 'environment': 'development'} and report['bundleSHA256'] == gate['bundleSHA256']
    except Exception as error:
        healthy = False
        report['attemptErrorClass'] = type(error).__name__
    finally:
        # Even wait/inspect/health errors must try diagnostics BEFORE rollback.
        try:
            after = current()
            logs = subprocess.run(['docker', 'logs', '--tail', '80', 'otr-dev-backend'], capture_output=True, text=True, timeout=5)
            report['candidate'] = diagnostics(after, logs.stdout + logs.stderr, before_env, comparison_key)
            report['logReadExit'] = logs.returncode
            if logs.returncode != 0 or after['Image'] != gate['candidateImage']:
                raise RuntimeError('CANDIDATE_DIAGNOSTIC_INCOMPLETE')
            report['diagnosticsCapturedBeforeRollback'] = True
            (release / 'candidate-diagnostic.json').write_text(json.dumps(report, indent=2) + '\n')
        except Exception as error:
            healthy = False
            report['diagnosticsCapturedBeforeRollback'] = False
            report['diagnosticGap'] = type(error).__name__
        if not healthy:
            try:
                restored = subprocess.run(compose([rollback]) + ['up', '-d', '--no-build', '--pull', 'never', 'backend'], env=compose_env, capture_output=True, text=True, timeout=25)
                deadline = time.monotonic() + 40
                while True:
                    restored_state = current()
                    if restored_state['State'].get('Health', {}).get('Status') == 'healthy':
                        break
                    if time.monotonic() >= deadline:
                        break
                    time.sleep(min(2, max(0, deadline-time.monotonic())))
                restored_state = current()
                report['rollbackExit'] = restored.returncode
                report['rollbackImage'] = restored_state['Image']
                report['rollbackVerified'] = restored.returncode == 0 and restored_state['Image'] == before['Image'] and restored_state['Config']['Cmd'] == before['Config']['Cmd'] and restored_state['State'].get('Health', {}).get('Status') == 'healthy' and env(restored_state) == before_env and mounts(restored_state) == mounts(before) and restored_state['HostConfig'] == before['HostConfig'] and restored_state['Config']['User'] == before['Config']['User'] and all(hashlib.sha256(Path(f).read_bytes()).hexdigest() == h for f,h in gate['beforeConfigHashes'].items())
                report['rollbackBundleSHA256'] = hashlib.sha256(subprocess.check_output(['docker','exec','otr-dev-backend','cat','/app/server.mjs'],timeout=5)).hexdigest()
                report['rollbackVerified'] = report['rollbackVerified'] and report['rollbackBundleSHA256'] == gate['beforeBundleSHA256']
                report['rollbackHttpHealth'] = json.load(urllib.request.urlopen('http://127.0.0.1:8787/health', timeout=3))
                report['rollbackVerified'] = report['rollbackVerified'] and report['rollbackHttpHealth'] == {'status': 'ok', 'environment': 'development'}
            except Exception as error:
                report['rollbackVerified'] = False
                report['rollbackErrorClass'] = type(error).__name__
    report['status'] = 'CLOSED_DEPLOY_PASS' if healthy else ('B_FAILED_ROLLED_BACK' if report.get('rollbackVerified') else 'RECONCILE_REQUIRED_DO_NOT_RETRY')
    (release / 'attempt-receipt.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gate', required=True)
    parser.add_argument('--execute-approved-b-only', action='store_true')
    args = parser.parse_args()
    gate = json.loads(Path(args.gate).read_text())
    assert gate['project'] == PROJECT and gate['beforeImage'] == OLD_IMAGE and gate['phaseCAllowed'] is False
    if not args.execute_approved_b_only:
        print(json.dumps({'status': 'PREPARED_NOT_EXECUTED', 'candidateImage': gate['candidateImage'], 'project': PROJECT, 'phaseCAllowed': False}))
        return
    assert gate['ownerAuthorizedBOnly'] is True, 'EXACT_OWNER_B_ONLY_APPROVAL_REQUIRED'
    now = datetime.datetime.now(datetime.timezone.utc)
    start, end = [datetime.datetime.fromisoformat(gate[k].replace('Z', '+00:00')) for k in ('startsAt', 'expiresAt')]
    assert start <= now < end and (end - start).total_seconds() <= 900
    assert re.fullmatch(r'sha256:[a-f0-9]{64}', gate['candidateImage'])
    assert re.fullmatch(r'/opt/otr/dev-backend/releases/metadata-recovery-[a-z0-9-]+', gate['releaseDirectory'])
    functions = '\n\n'.join(inspect.getsource(f) for f in (redact, environment_projection, diagnostics, remote_deploy))
    remote = 'import json,sys,pathlib,hashlib,hmac,re,os,subprocess,time,urllib.request,datetime\nfrom pathlib import Path\n' + functions + '\nprint(json.dumps(remote_deploy(json.load(sys.stdin))))'
    result = subprocess.run(['ssh', '-oBatchMode=yes', '-oStrictHostKeyChecking=yes', '-oConnectTimeout=8', HOST, 'python3 -c ' + shlex.quote(remote)], input=json.dumps(gate), capture_output=True, text=True, timeout=240)
    # Remote stdout is the sanitized receipt; stderr is not exported because arbitrary tool output may contain private values.
    if result.returncode:
        raise SystemExit('B_RETRY_TRANSPORT_OR_PRECONDITION_FAILURE_RECONCILE_WITHOUT_RETRY')
    print(result.stdout)


if __name__ == '__main__':
    main()
