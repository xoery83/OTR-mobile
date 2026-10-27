#!/usr/bin/env python3
"""Root-only exact sustained closure entry. Default prepare; close requires prepared SHA.
Reuses reviewed SQL renderer and existing c-execution service.remote restore.
"""
import argparse
import importlib.util
import inspect
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).parent))
import sustained_transition_watchdog as watch
import sustained_sql_prepare as renderer

PROJECT = 'tuqigdxrvrerfewsxqgm'
CLI = '/private/tmp/otr-c-execution-prep-20261023/node_modules/.bin/supabase'
LINKED = '/Users/xoery/Project/otr-mobile-canonical'
HOST = 'root@178.105.151.143'
IMAGE = 'sha256:6b11b6ba350cdf0cf72a9776c4420f129cc51bcab1a74a82456994588738cc95'
BUNDLE = 'a221ab978039fad46f7eb69914153692228c467ee2cd559280da1463b3ee02d9'
CUTOFF = '2026-10-24T01:41:25.160Z'
SQL_PACKET = Path('/private/tmp/otr-sustained-native-execution-20261024/sql')


def bound_file(path, digest):
    file = Path(path)
    if not file.is_absolute() or file.is_symlink() or watch.sha(file.read_bytes()) != digest:
        raise ValueError('CLOSURE_FILE_BINDING_DRIFT')
    return file


def validate(config):
    if config['project'] != PROJECT or config['actorId'] != watch.ACTOR or config['approvedGateSHA256'] != watch.GATE:
        raise ValueError('CLOSURE_AUTHORITY_SCOPE')
    if str(__import__('uuid').UUID(config['transitionId'])) != config['transitionId']:
        raise ValueError('CLOSURE_TRANSITION_ID')
    if config['adoptionCutoff'] != CUTOFF:
        raise ValueError('IMMUTABLE_ACTUAL_CUTOFF')
    watch.instant(config['adoptionCutoff'])
    bound_file(config['gatePath'], watch.GATE)
    bound_file(config['rendererPath'], config['rendererSHA256'])
    if Path(config['rendererPath']).resolve() != Path(renderer.__file__).resolve():
        raise ValueError('REVIEWED_RENDERER_PATH')
    renderer.binding(config['actorId'], config['adoptionCutoff'], Path(config['gatePath']), watch.GATE)
    service = bound_file(config['servicePath'], config['serviceSHA256'])
    for name in ('control.py',):
        bound_file(service.with_name(name), config['dependencyHashes'][name])
    bound_file(service.parents[2] / 'dev' / 'metadata_closed_retry.py', config['dependencyHashes']['metadata_closed_retry.py'])
    runtime_file = bound_file(config['runtimePlanPath'], config['runtimePlanSHA256'])
    runtime = json.loads(runtime_file.read_text())
    if runtime.get('ownerAuthorized') is not True or runtime.get('runtimeKind') != 'SUSTAINED_TRIP_P1' or runtime.get('approvedGateSHA256') != watch.GATE or runtime.get('image') != IMAGE or runtime.get('bundle') != BUNDLE:
        raise ValueError('RUNTIME_RESTORE_SCOPE')
    if len(runtime.get('baseline', {}).get('mounts', [])) != 3:
        raise ValueError('RUNTIME_BASELINE_MOUNTS')
    manifest = json.loads(watch.private(SQL_PACKET / 'manifest.json').read_text())
    for key in ('project', 'actorId', 'adoptionCutoff', 'approvedGateSHA256'):
        if manifest[key] != config[key]:
            raise ValueError('SQL_PACKET_BINDING')
    identity = renderer.binding(config['actorId'], config['adoptionCutoff'], Path(config['gatePath']), watch.GATE)
    rendered = renderer.render(identity)
    for name in ('close.sql', 'verify-closed.sql'):
        data = watch.private(SQL_PACKET / name).read_bytes()
        if watch.sha(data) != manifest['artifacts'][name] or data.decode() != rendered[name]:
            raise ValueError('EXACT_SQL_CLOSURE_DRIFT')
    return runtime


def prepare(input_path, run_dir):
    config = json.loads(Path(input_path).read_text())
    validate(config)
    run_dir = Path(run_dir)
    run_dir.mkdir(mode=0o700)
    watch.private(run_dir, True)
    watch.write_private(run_dir / 'close-plan.json', config)
    digest = watch.sha(watch.canonical(config))
    watch.write_private(run_dir / 'prepared.json', {'status': 'PREPARED_NOT_EXECUTED', 'closePlanSHA256': digest})
    return digest


def sql_call(text, run_dir):
    fd, name = tempfile.mkstemp(prefix='close-sql-', suffix='.sql', dir=run_dir)
    os.fchmod(fd, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
        # Existing authenticated management CLI, exact DEV ref; no token/password copied or printed.
        result = subprocess.run([CLI, 'db', 'query', '--linked', '--project-ref', PROJECT, '--file', name, '--output', 'json'],
                                cwd=LINKED, env=dict(os.environ, SUPABASE_DB_PASSWORD='DOCUMENTED_NONSECRET_MANAGEMENT_API_PLACEHOLDER'),
                                capture_output=True, text=True, timeout=20, check=False)
        if result.returncode != 0:
            raise RuntimeError('SQL_OUTCOME_UNKNOWN_RECONCILE')
        return json.loads(result.stdout)
    finally:
        os.unlink(name)


def restore_call(config, runtime):
    # Load exactly Root's reviewed service, including its mount ordering fix. No runtime secret file read.
    service_path = Path(config['servicePath'])
    old_path = list(sys.path)
    try:
        sys.path.insert(0, str(service_path.parent))
        spec = importlib.util.spec_from_file_location('root_sustained_service', service_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.path[:] = old_path
    functions = (module.redact, module.environment_projection, module.diagnostics, module.host_config, module.remote_locked, module.remote)
    code = 'import json,sys,hashlib,hmac,re,os,subprocess,time,urllib.request,datetime,fcntl,stat\nfrom pathlib import Path\n'
    code += '\n\n'.join(inspect.getsource(function) for function in functions)
    code += '\np,action,secret=json.load(sys.stdin)\nprint(json.dumps(remote(p,action,secret)))'
    result = subprocess.run(['ssh', '-oBatchMode=yes', '-oStrictHostKeyChecking=yes', '-oConnectTimeout=8', HOST,
                             'python3 -c ' + shlex.quote(code)], input=json.dumps([runtime, 'restore', {}]),
                            capture_output=True, text=True, timeout=120, check=False)
    if result.returncode != 0:
        raise RuntimeError('RUNTIME_RESTORE_UNKNOWN_RECONCILE')
    value = json.loads(result.stdout)
    if value.get('verified') is not True or value.get('restorationVerified') is not True or value.get('runtimeSecretsRemoved') is not True:
        raise RuntimeError('RUNTIME_NOT_VERIFIED_REMOVED')
    mounts = value.get('mounts')
    if not isinstance(mounts, list) or any(m.get('destination') in ('/run/otr/trip-create-runtime.json', '/run/otr/trip-metadata-runtime.json') for m in mounts):
        raise RuntimeError('RUNTIME_MOUNT_REMAINS')
    return True


def execute(run_dir, expected_sha, sql=sql_call, restore=restore_call):
    stage = 'PREFLIGHT'
    try:
        run_dir = watch.private(run_dir, True)
        config = json.loads(watch.private(run_dir / 'close-plan.json').read_text())
        if watch.sha(watch.canonical(config)) != expected_sha:
            raise ValueError('CLOSE_PLAN_HASH')
        runtime = validate(config)
        watch.write_private(run_dir / 'close-claimed.json', {'closePlanSHA256': expected_sha, 'pid': os.getpid()})
        stage = 'SQL_CLOSE'
        sql(watch.private(SQL_PACKET / 'close.sql').read_text(), run_dir)
        stage = 'INDEPENDENT_SQL_VERIFY'
        raw = sql(watch.private(SQL_PACKET / 'verify-closed.sql').read_text(), run_dir)
        rows = raw if isinstance(raw, list) else raw.get('rows') if isinstance(raw, dict) else None
        if rows != [{'closed_verified': True}]:
            raise RuntimeError('CLOSE_NOT_VERIFIED')
        stage = 'RUNTIME_RESTORE'
        if restore(config, runtime) is not True:
            raise RuntimeError('RESTORE_NOT_VERIFIED')
        receipt = {'verified': True, 'status': 'CLOSED_VERIFIED', 'sqlClosed': True, 'runtimeRemoved': True,
                   'closePlanSHA256': expected_sha, 'transitionId': config['transitionId']}
    except Exception:
        receipt = {'verified': False, 'status': 'RECONCILE_REQUIRED', 'stage': stage}
    # Never include SQL/argv/stdout/stderr/private response values in the safe stdout receipt.
    try:
        watch.write_private(Path(run_dir) / 'close-result.json', receipt)
    except Exception:
        return {'verified': False, 'status': 'RECONCILE_REQUIRED', 'stage': 'RECEIPT_PERSISTENCE'}
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', nargs='?', choices=('prepare', 'close'), default='prepare')
    parser.add_argument('--input', type=Path)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--plan-sha')
    args = parser.parse_args()
    try:
        if args.mode == 'prepare':
            if args.input is None:
                raise ValueError('INPUT_REQUIRED')
            result = {'verified': False, 'status': 'PREPARED_NOT_EXECUTED', 'closePlanSHA256': prepare(args.input, args.run_dir)}
        else:
            result = execute(args.run_dir, args.plan_sha)
    except Exception:
        result = {'verified': False, 'status': 'RECONCILE_REQUIRED', 'stage': 'PREPARATION'}
    print(json.dumps(result))
    if result['status'] == 'RECONCILE_REQUIRED':
        raise SystemExit(2)


if __name__ == '__main__':
    main()
