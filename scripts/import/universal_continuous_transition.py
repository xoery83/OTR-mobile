#!/usr/bin/env python3
"""Bounded transition orchestration only. No transport, credentials or default execution.
Root supplies reviewed SQL/Auth/SSH ports; tests use isolated fixtures, never L3.
"""
import importlib.util
import json
from pathlib import Path
import time
import uuid


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_BASE = Path(__file__).resolve().parents[1]
_watchdog = _load('otr_sustained_watchdog', _BASE / 'trip/sustained_transition_watchdog.py')
_runtime = _load('otr_universal_runtime_close', Path(__file__).with_name('universal_runtime_close.py'))
canonical, sha, instant = _watchdog.canonical, _watchdog.sha, _watchdog.instant
private, write_private = _watchdog.private, _watchdog.write_private
# Owner authorized one replacement identity; actual normal Auth receipt is NEW_QA_AUTH_RECEIPT.json.
ACTOR = 'f4b059c5-8241-4ffb-aa15-37fa25474543'
PROJECT = 'tuqigdxrvrerfewsxqgm'
GATE = 'a9fe994f9b1356b56db1405eb1156c15081c939c34bca18156f1231771c19d0f'
AMENDMENT = 'f823e9397ba6c9d67e5c2df9e4559e9bd827dec251e26e5d0d59de6e82eddaa6'
SQL_HASHES = {
    'universal_sustained_source_candidate.sql': '58194b16e3af5b38d86924b29e74c2f690a1a871c5eac4915375b0cb6695b991',
    'universal_sustained_provider_candidate.sql': '5d89fac2d6c8379beeded821b12d901e0976f4dd3c5ab41345c58f57ba45d8a1',
}
ROLES = ('otr_trip_source_command_gateway', 'otr_external_integration_call_gateway')
IMAGE = 'sha256:109caf2cc18a710aa28f81951a7971a1cee182561c7281649cea2f5996a37926'
BASE_IMAGE = 'sha256:8d9a81d58c0d2fb4cb888315b30db066065ad6785c813fba791585e62516ba67'


def _hash(value):
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def validate(plan):
    if (type(plan.get('version')) is not int or plan['version'] != 1 or plan.get('actorId') != ACTOR or plan.get('project') != PROJECT
            or plan.get('approvedGateSHA256') != GATE or plan.get('approvedAmendmentSHA256') != AMENDMENT
            or plan.get('sqlHashes') != SQL_HASHES):
        raise ValueError('EXACT_APPROVED_PLAN_REQUIRED')
    if str(uuid.UUID(plan['transitionId'])) != plan['transitionId'] or str(uuid.UUID(plan['scopeId'])) != plan['scopeId']:
        raise ValueError('TRANSITION_SCOPE_ID')
    start, end = instant(plan['startsAt']), instant(plan['expiresAt'])
    if not 0 < end - start <= 900 or not 0 < instant(plan['providerExpiresAt']) - start <= 7 * 86400:
        raise ValueError('FINITE_APPROVED_WINDOW_REQUIRED')
    if not _role_values(plan.get('sourceMeterBaseline'), False):
        raise ValueError('SOURCE_METER_NOLOGIN_PREIMAGE_REQUIRED')
    if not _role_values(plan.get('sourceMeterSessionBaseline'), 0):
        raise ValueError('SOURCE_METER_NO_EXISTING_SESSION_REQUIRED')
    catalog = plan.get('catalogBaseline', {})
    if (set(catalog) != {'login', 'connectionLimit', 'validUntil', 'credentialSHA256'}
            or catalog['login'] is not True or type(catalog['connectionLimit']) is not int or catalog['connectionLimit'] != 1
            or catalog['validUntil'] != '2027-01-09T02:03:36.084144Z' or not _hash(catalog['credentialSHA256'])):
        raise ValueError('EXACT_UNCHANGED_CATALOG_REQUIRED')
    r = plan.get('runtime', {})
    if (r.get('container') != 'otr-dev-backend' or r.get('imageId') != IMAGE
            or r.get('baselineImageId') != BASE_IMAGE or not _hash(r.get('originalContainerId'))
            or r.get('backupContainerName') != 'otr-universal-original-' + plan['transitionId']):
        raise ValueError('RETAINED_RUNTIME_REQUIRED')
    for key in ('baselineConfigSHA256', 'baselineHostConfigSHA256', 'baselineMountsSHA256', 'activeConfigSHA256', 'activeHostConfigSHA256', 'activeMountsSHA256', 'stagedContainerId'):
        if not _hash(r.get(key)):
            raise ValueError('RUNTIME_PREIMAGE_REQUIRED')
    if plan.get('budget') != {'callsPerUtcDay': 2, 'callCostNanos': '50000000', 'dailyCostNanos': '100000000', 'totalCostNanos': '1000000000'}:
        raise ValueError('EXACT_APPROVED_BUDGET_REQUIRED')
    return end


def prepare(plan, run_dir):
    validate(plan)
    run_dir = Path(run_dir)
    run_dir.mkdir(mode=0o700)
    private(run_dir, True)
    write_private(run_dir / 'plan.json', plan)
    digest = sha(canonical(plan))
    write_private(run_dir / 'prepared.json', {'status': 'PREPARED_NOT_STARTED', 'planSHA256': digest})
    return digest


def restore_with_existing(plan, call, check, read_only=False):
    """Root can invoke this through its reviewed SSH adapter; no new restore engine."""
    validate(plan)
    return _runtime.restore_retained(plan, call, check, read_only)


def _bound_dir(plan, run_dir):
    run_dir = private(run_dir, True)
    recorded = json.loads(private(run_dir / 'plan.json').read_text())
    if canonical(recorded) != canonical(plan):
        raise ValueError('PREPARED_PLAN_MISMATCH')
    return run_dir


def _role_values(value, expected):
    return (isinstance(value, dict) and set(value) == set(ROLES)
            and all(type(v) is type(expected) and v == expected for v in value.values()))


def _source_closed(value):
    return value.get('policyEnabled') is False


def _sql_closed(plan, value):
    installed = value.get('installedSqlHashes')
    return (isinstance(installed, dict) and all(SQL_HASHES.get(k) == v for k, v in installed.items())
            and value.get('unexpectedAuthorityActive') is False
            and value.get('providerScopeActive') is False and value.get('providerGrantActive') is False
            and _role_values(value.get('sourceMeterLogins'), False)
            and _role_values(value.get('sourceMeterSessions'), 0)
            and value.get('catalog') == plan['catalogBaseline'])


def _admin_closed(value):
    return value.get('permissionsActive') is False and value.get('loginEnabled') is False and type(value.get('sessions')) is int and value['sessions'] == 0


def _runtime_restored(plan, value):
    r = plan['runtime']
    return value == {'containerId': r['originalContainerId'], 'imageId': BASE_IMAGE,
                     'configSHA256': r['baselineConfigSHA256'], 'hostConfigSHA256': r['baselineHostConfigSHA256'],
                     'mountsSHA256': r['baselineMountsSHA256'], 'healthy': True}


def _read(ports, name, plan, predicate):
    try:
        return predicate(ports[name](plan)) is True
    except Exception:
        return False  # Never serialize private errors/responses.


def closed_checks(plan, ports):
    # Separate, fresh readbacks. ACK/timeout/health alone never proves closure.
    return {'source': _read(ports, 'read_source', plan, _source_closed),
            'sql': _read(ports, 'read_sql', plan, lambda v: _sql_closed(plan, v)),
            'admin': _read(ports, 'read_admin', plan, _admin_closed),
            'runtime': _read(ports, 'read_runtime', plan, lambda v: _runtime_restored(plan, v))}


def close_transition(plan, run_dir, ports):
    validate(plan)
    run_dir = _bound_dir(plan, run_dir)
    digest = sha(canonical(plan))
    write_private(run_dir / 'close-claimed.json', {'planSHA256': digest})
    steps = []
    # Reconcile every uncertain outcome read-only. No action is automatically retried.
    for name, reader, predicate in (
        ('disable_policy', 'read_source', _source_closed),
        ('revoke_provider', 'read_sql', lambda v: v.get('providerScopeActive') is False and v.get('providerGrantActive') is False),
        ('revoke_admin', 'read_admin', _admin_closed),
        ('close_source_meter', 'read_sql', lambda v: _sql_closed(plan, v)),
    ):
        outcome = 'ACKNOWLEDGED'
        try:
            # Root adapters accept only this fixed plan. No Catalog close/terminate port exists.
            ports[name](plan)
        except Exception:
            outcome = 'UNKNOWN'
        steps.append({'step': name, 'outcome': outcome, 'readbackVerified': _read(ports, reader, plan, predicate)})
    checks = closed_checks(plan, ports)
    if all(checks[k] for k in ('source', 'sql', 'admin')):
        outcome = 'ACKNOWLEDGED'
        try:
            ports['restore_retained'](plan)
        except Exception:
            outcome = 'UNKNOWN'
        steps.append({'step': 'restore_retained', 'outcome': outcome})
        checks = closed_checks(plan, ports)
    if not all(checks.values()) and 'rescue_cleanup' in ports:
        # A separately sealed close-only scope owns its fresh readback and receipts.
        # Never reinterpret old UNKNOWN commands or repeat an uncertain write.
        try:
            rescue = ports['rescue_cleanup'](plan)
            fresh = rescue.get('checks', {})
            accepted = (rescue.get('status') == 'CLOSED_VERIFIED'
                        and set(fresh) == {'source', 'sql', 'admin', 'runtime'}
                        and all(type(v) is bool and v for v in fresh.values()))
            steps.append({'step': 'security_close_contingency', 'outcome': rescue.get('status', 'UNKNOWN')})
            if accepted: checks = fresh
        except Exception:
            steps.append({'step': 'security_close_contingency', 'outcome': 'UNKNOWN'})
    verified = all(checks.values())
    result = {'status': 'CLOSED_VERIFIED' if verified else 'RECONCILE_REQUIRED',
              'verified': verified, 'planSHA256': digest, 'transitionId': plan['transitionId'], 'checks': checks, 'steps': steps}
    write_private(run_dir / 'closure-result.json', result)
    return result


def _handoff_checks(plan, ports):
    try:
        source, sql = ports['read_source'](plan), ports['read_sql'](plan)
        admin, runtime, budget = ports['read_admin'](plan), ports['read_runtime'](plan), ports['read_budget'](plan)
        return (source.get('normalServiceVerified') is True and source.get('policyEnabled') is True
                and sql.get('installedSqlHashes') == SQL_HASHES and sql.get('unexpectedAuthorityActive') is False
                and sql.get('sourceMeterRestricted') is True and _role_values(sql.get('sourceMeterLogins'), True)
                and sql.get('providerScopeActive') is True and sql.get('providerGrantActive') is True
                and sql.get('catalog') == plan['catalogBaseline']
                and _admin_closed(admin) and runtime.get('healthy') is True and runtime.get('imageId') == IMAGE
                and runtime.get('configSHA256') == plan['runtime']['activeConfigSHA256']
                and runtime.get('hostConfigSHA256') == plan['runtime']['activeHostConfigSHA256']
                and runtime.get('mountsSHA256') == plan['runtime']['activeMountsSHA256']
                and runtime.get('containerId') == plan['runtime']['stagedContainerId']
                and budget == {'scopeId': plan['scopeId'], 'expiresAt': plan['providerExpiresAt'],
                               'bounds': plan['budget'], 'sourceAndUsageBindingVerified': True})
    except Exception:
        return False


def handoff(plan, run_dir, ports, clock=time.time):
    end = validate(plan)
    run_dir = _bound_dir(plan, run_dir)
    if not instant(plan['startsAt']) <= clock() < end or (run_dir / 'close-claimed.json').exists():
        raise ValueError('HANDOFF_WINDOW_CLOSED')
    if not _handoff_checks(plan, ports) or clock() >= end:
        raise ValueError('HANDOFF_NOT_VERIFIED')
    marker = {'status': 'SUSTAINED_HANDOFF_VERIFIED', 'planSHA256': sha(canonical(plan)), 'transitionId': plan['transitionId']}
    write_private(run_dir / 'handoff.json', marker)
    return marker


def watch(run_dir, expected_sha, ports, clock=time.time, pause=time.sleep):
    run_dir = private(run_dir, True)
    plan = json.loads(private(run_dir / 'plan.json').read_text())
    digest = sha(canonical(plan))
    if digest != expected_sha:
        raise ValueError('PLAN_HASH_MISMATCH')
    end = validate(plan)
    write_private(run_dir / 'watch-claimed.json', {'planSHA256': digest})
    retained = False
    while clock() < end:
        marker = run_dir / 'handoff.json'
        if clock() >= instant(plan['startsAt']) and marker.exists():
            try:
                valid = json.loads(private(marker).read_text()) == {'status': 'SUSTAINED_HANDOFF_VERIFIED', 'planSHA256': digest, 'transitionId': plan['transitionId']}
            except (ValueError, OSError):
                valid = False
            if valid and _handoff_checks(plan, ports) and clock() < end and not (run_dir / 'close-claimed.json').exists():
                retained = True
                break
        pause(min(1, max(0, end - clock())))
    if retained:
        result = {'status': 'SUSTAINED_HANDOFF_VERIFIED', 'verified': True, 'planSHA256': digest}
    else:
        try:
            result = close_transition(plan, run_dir, ports)
        except FileExistsError:
            checks = closed_checks(plan, ports)
            # Never resend the previously claimed CP15 writes. Idempotent local
            # fencing is safe even when the foreground closer died mid-close.
            if not all(checks.values()) and 'rescue_cleanup' in ports:
                for name in ('disable_policy', 'revoke_admin', 'close_source_meter'):
                    try: ports[name](plan)
                    except Exception: pass
                try:
                    rescue = ports['rescue_cleanup'](plan)
                    fresh = rescue.get('checks', {})
                    if (rescue.get('status') == 'CLOSED_VERIFIED' and set(fresh) == {'source','sql','admin','runtime'}
                            and all(type(v) is bool and v for v in fresh.values())): checks = fresh
                except Exception: pass
            result = {'status': 'CLOSED_VERIFIED' if all(checks.values()) else 'RECONCILE_REQUIRED', 'verified': all(checks.values()), 'planSHA256': digest, 'checks': checks}
    write_private(run_dir / 'watch-result.json', result)
    return result
