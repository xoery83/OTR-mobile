"""Plan-bound SQL/owning-command ports. No transport defaults or network execution.
Management SQL uses existing SqlTransport; protected CP15 mutations must use Root's
normal-Auth/dedicated-admin command invoker. Isolated tests are not L3 evidence.
"""
import copy
import time
import uuid
from pathlib import Path
from universal_continuous_transition import ACTOR, SQL_HASHES, ROLES, validate, instant, canonical, sha
from universal_config_control import command_sql, receipted, revoke_sql, revoked_sql, ADMIN, grant_instant
from universal_scope_close import quote
from build_universal_admin_plan import command_hash
from universal_continuous_commands import validate_recovery_preimages

INTEGRATION = 'otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d'
SOURCE_FUNCTIONS = (
    'public.trip_sustained_universal_allowed(uuid,uuid)',
    'public.trip_source_sustained_run_row(text,text,jsonb)',
    'public.trip_source_universal_original_pin()',
    'public.trip_source_begin_universal_inputs(uuid,uuid,text)',
    'public.trip_source_run_only_row(text,text,jsonb)',
    'public.trip_source_begin_sustained_universal_inputs(uuid,uuid,text)',
    'public.trip_source_find_sustained_universal_binding(uuid,uuid,uuid)',
    'public.trip_source_read_sustained_universal_inputs(uuid,uuid,uuid,uuid,uuid)',
)
PROVIDER_FUNCTIONS = (
    'public.universal_import_source_current(uuid,uuid,uuid,uuid,text)',
    'public.universal_import_source_started(uuid,uuid,uuid,uuid,text)',
    'public.universal_import_check_continuous_scope(public.flight_activation_scopes)',
    'public.universal_import_select_continuous(uuid,uuid,text)',
    'public.universal_import_continuous_scope(public.external_integration_calls,jsonb,text,boolean)',
    'public.universal_import_read_continuous_scope(jsonb,jsonb,text)',
    'public.universal_import_mark_continuous_dispatch(jsonb,jsonb)',
    'public.universal_import_read_admitted_price(uuid,uuid,uuid,uuid)',
    'public.flight_activation_select(jsonb,jsonb)',
    'public.universal_import_validate_binding(jsonb,public.external_integration_calls,boolean)',
    'public.cp15_flight_admission(public.external_integration_calls,public.flight_activation_scopes,public.flight_activation_account_grants,jsonb)',
    'public.universal_import_mark_dispatch(jsonb,jsonb)',
)
DEPENDENCY = 'public.external_integration_mark_dispatch(jsonb,jsonb)'
GROUPS = dict(zip(SQL_HASHES, (SOURCE_FUNCTIONS, PROVIDER_FUNCTIONS)))


def _uuid(value):
    if str(uuid.UUID(value)) != value:
        raise ValueError('LOWERCASE_UUID_REQUIRED')


def _digest(value):
    if not isinstance(value, str) or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
        raise ValueError('EXACT_DIGEST_REQUIRED')


def validate_sql_plan(plan):
    validate(plan)
    a, p = plan['adminControl'], plan['providerControl']
    if (p['actorId'] != ACTOR or p['integrationId'] != INTEGRATION or a['actorId'] != ACTOR
            or a['integrationId'] != INTEGRATION or a['startsAt'] != plan['startsAt']
            or not instant(plan['expiresAt']) + 240 <= instant(a['expiresAt']) <= instant(a['startsAt']) + 900
            or a['role'] != {'name': ADMIN, 'priorCanLogin': False, 'expiresAt': a['expiresAt']}):
        raise ValueError('FINITE_ADMIN_CLOSURE_TAIL_REQUIRED')
    grants = a['temporaryGrants']
    if len(grants) != 2 or {g['permission'] for g in grants} != {'CONFIG_ADMIN', 'SECURITY_ADMIN'}:
        raise ValueError('EXACT_TWO_TEMP_GRANTS_REQUIRED')
    preimages = a.get('grantRenewalPreimages', {})
    if not isinstance(preimages, dict) or ('grantRenewalPreimages' in a and set(preimages) != {'CONFIG_ADMIN', 'SECURITY_ADMIN'}):
        raise ValueError('EXACT_TWO_RENEWAL_PREIMAGES_REQUIRED')
    grant_keys = {'admin_grant_id', 'actor_id', 'environment', 'permission', 'grant_revision', 'expires_at', 'revoked_at', 'created_at', 'created_by'}
    for g in grants:
        _uuid(g['admin_grant_id'])
        prior = preimages.get(g['permission'])
        if 'grantRenewalPreimages' in a and not isinstance(prior, dict):
            raise ValueError('EXACT_REVOKED_GRANT_PREIMAGE_REQUIRED')
        revision, created = 1, grant_instant(a['startsAt'])
        if prior is not None:
            if (not isinstance(prior, dict) or set(prior) != grant_keys or type(prior['grant_revision']) is not int
                    or prior['grant_revision'] < 2 or prior['grant_revision'] % 2 or prior['grant_revision'] >= 2147483646
                    or prior['revoked_at'] is None):
                raise ValueError('EXACT_REVOKED_GRANT_PREIMAGE_REQUIRED')
            if (not grant_instant(prior['created_at']) <= grant_instant(prior['revoked_at']) <= instant(a['startsAt'])
                    or grant_instant(prior['expires_at']) <= grant_instant(prior['created_at'])):
                raise ValueError('GRANT_PREIMAGE_TIME_DRIFT')
            if {k: v for k, v in prior.items() if k not in ['grant_revision', 'expires_at', 'revoked_at']} != {k: v for k, v in g.items() if k not in ['grant_revision', 'expires_at', 'revoked_at']}:
                raise ValueError('GRANT_RENEWAL_IDENTITY_DRIFT')
            revision, created = prior['grant_revision'] + 1, grant_instant(prior['created_at'])
        if (set(g) != grant_keys or g['actor_id'] != ACTOR or g['environment'] != 'DEV' or g['created_by'] != ACTOR
                or grant_instant(g['created_at']) != created or g['expires_at'] != a['expiresAt']
                or g['revoked_at'] is not None or type(g['grant_revision']) is not int or g['grant_revision'] != revision):
            raise ValueError('EXACT_NEW_QA_ADMIN_GRANT_REQUIRED')
    if len({g['admin_grant_id'] for g in grants}) != 2:
        raise ValueError('ADMIN_GRANT_ID_REUSED')
    active = plan['policyActiveRow']
    if (active.get('actor_account_id') != ACTOR or active.get('universal_import_enabled') is not True
            or active.get('enabled') is not True or active.get('revoked_at') is not None):
        raise ValueError('EXACT_POLICY_REQUIRED')
    instant(active['adoption_cutoff'].replace('+00:00', 'Z'))
    if set(plan['installedFunctionHashes']) != set(SOURCE_FUNCTIONS + PROVIDER_FUNCTIONS) or set(plan['functionPreimages']) != set(SOURCE_FUNCTIONS + PROVIDER_FUNCTIONS + (DEPENDENCY,)):
        raise ValueError('COMPLETE_FUNCTION_IMAGES_REQUIRED')
    for h in plan['installedFunctionHashes'].values():
        _digest(h)
    for h in plan['functionPreimages'].values():
        if h is not None:
            _digest(h)
    _digest(plan['functionPreimages'][DEPENDENCY])
    recovery = validate_recovery_preimages(plan) if 'recoveryPreimages' in plan else None
    if recovery is not None and recovery['scope']['revision']==4:
        gate=Path(__file__).resolve().parents[2]/'docs/ops/universal-stage2-20261025/actual-execution/cleanup-20261026/STAGE_II_CONSOLIDATED_RESUME_GATE.md'
        if plan.get('approvedResumeGateSHA256')!=sha(gate.read_bytes()):
            raise ValueError('EXACT_CONSOLIDATED_RESUME_GATE_REQUIRED')
    revision, baseline = (recovery['scope']['revision']+1,recovery['integration']['config_version']) if recovery is not None else (1,11)
    scope, grant = p['scopeActiveRow'], p['grantActiveRow']
    if (scope.get('scope_id') != plan['scopeId'] or scope.get('integration_id') != INTEGRATION
            or scope.get('workload') != 'UNIVERSAL_IMPORT_V1' or scope.get('revision') != revision or scope.get('active') is not True
            or grant != {'scope_id': plan['scopeId'], 'account_id': ACTOR, 'revision': revision,
                         'expires_at': (recovery['grant']['expires_at'] if recovery is not None else plan['providerExpiresAt']), 'revoked': False, 'updated_by': ACTOR}):
        raise ValueError('EXACT_PROVIDER_CONTROL_REQUIRED')
    if recovery is not None:
        expected = {**recovery['scope'], 'revision': revision, 'active': True, 'integration_version': baseline+1, 'scope_sha256': scope['scope_sha256']}
        if scope != expected:
            raise ValueError('RECOVERY_SCOPE_IMMUTABLE_FIELD_DRIFT')
    _digest(scope['scope_sha256'])
    activation, close = p['activationCommands'], p['closeCommands']
    kinds = ['external_integration_set_kill', 'external_integration_set_kill', 'flight_activation_select', 'flight_activation_account_grant']
    if [x['kind'] for x in activation] != ([] if recovery is not None else ['external_integration_price_append']) + kinds or [x['kind'] for x in close] != ['flight_activation_account_grant', 'flight_activation_select', 'external_integration_set_kill', 'external_integration_set_kill']:
        raise ValueError('EXACT_COMMAND_ORDER_REQUIRED')
    seen = set()
    for x in activation + close:
        c, v = x['command'], x['context']
        _uuid(c['request_id']); _uuid(c['audit_id'])
        if c['request_id'] in seen:
            raise ValueError('COMMAND_ID_REUSED')
        seen.add(c['request_id'])
        if (c['actor_id'] != ACTOR or c['environment'] != 'DEV'
                or c['request_sha256'] != command_hash({k: y for k, y in c.items() if k != 'request_sha256'})
                or v.get('verified_actor_id') != ACTOR or v.get('verified_account_id') != ACTOR
                or v.get('principal_kind') != 'OTR_ADMIN' or v.get('gateway_identity') != ADMIN
                or v.get('command_kind') != x['kind'] or v.get('request_id') != c['request_id']
                or v.get('request_sha256') != c['request_sha256'] or v.get('revoked') is not False
                or instant(v['expires_at']) != instant(a['expiresAt'])):
            raise ValueError('NORMAL_AUTH_COMMAND_BINDING_REQUIRED')
    if activation[-2]['command']['row'] != scope or activation[-1]['command']['row'] != grant:
        raise ValueError('ACTIVE_ROW_BINDING')
    for x, target in zip(activation[-2:], (scope, grant)):
        if x['command']['expected_version'] != revision - 1 or x['command']['integration_id'] != INTEGRATION:
            raise ValueError('EXACT_ACTIVE_CAS_REQUIRED')
    for x, target in zip(activation[-4:-2], (INTEGRATION, None)):
        if x['command']['integration_id'] != target or x['command']['kill_switch'] is not False or x['command']['expected_version'] != baseline:
            raise ValueError('EXACT_OPEN_ENVIRONMENT_REQUIRED')
    for x, target in zip(close[:2], (grant, scope)):
        row = x['command']['row']; expected = {**target, 'revision': revision + 1}
        if x['kind'] == 'flight_activation_account_grant': expected['revoked'] = True
        else:
            expected['active'] = False
            expected['scope_sha256'] = row.get('scope_sha256')
            _digest(expected['scope_sha256'])
        if row != expected or x['command']['expected_version'] != revision or x['command']['integration_id'] != INTEGRATION:
            raise ValueError('EXACT_CLOSE_ROW_REQUIRED')
    for x, target in zip(close[2:], (INTEGRATION, None)):
        if x['command']['integration_id'] != target or x['command']['kill_switch'] is not True or x['command']['expected_version'] != baseline + 1:
            raise ValueError('EXACT_CLOSED_ENVIRONMENT_REQUIRED')
    return a, p


def _one(value, key):
    rows = value if isinstance(value, list) else value.get('rows') if isinstance(value, dict) else None
    if not isinstance(rows, list) or len(rows) != 1 or set(rows[0]) != {key}:
        raise ValueError('INDEPENDENT_SQL_READBACK_UNAVAILABLE')
    return rows[0][key]


def _json(value):
    return quote(canonical(value).decode()) + '::jsonb'


def _same(alias, table, row):
    return 'to_jsonb(' + alias + ')=to_jsonb(jsonb_populate_record(null::public.' + table + ',' + _json(row) + '))'


def observe_sql(plan):
    _, p = validate_sql_plan(plan)
    scope, grant = p['scopeActiveRow'], p['grantActiveRow']
    closed_grant, closed_scope = [x['command']['row'] for x in p['closeCommands'][:2]]
    recovery = plan.get('recoveryPreimages')
    def state(table, alias, condition, active, closed, ordering='', prior=None):
        previous = (" WHEN " + _same(alias, table, prior) + " THEN 'PREVIOUS_CLOSED'") if prior is not None else ''
        return "COALESCE((SELECT CASE WHEN " + _same(alias, table, active) + " THEN 'ACTIVE' WHEN " + _same(alias, table, closed) + " THEN 'CLOSED'" + previous + " ELSE 'DRIFT' END FROM public." + table + ' ' + alias + ' WHERE ' + condition + ordering + " LIMIT 1),'ABSENT')"
    ids = ','.join(quote(x['command']['request_id']) + '::uuid' for x in p['activationCommands'] + p['closeCommands'])
    integration = quote(INTEGRATION)
    return ("BEGIN READ ONLY; SELECT jsonb_build_object('scopeState'," + state('flight_activation_scopes', 's', 's.integration_id=' + integration, scope, closed_scope, ' ORDER BY s.revision DESC', recovery['scope'] if recovery else None)
            + ",'grantState'," + state('flight_activation_account_grants', 'g', 'g.scope_id=' + quote(plan['scopeId']) + '::uuid AND g.account_id=' + quote(ACTOR) + '::uuid', grant, closed_grant, prior=recovery['grant'] if recovery else None)
            + ",'integration',(SELECT jsonb_build_object('config_version',config_version,'kill_switch',kill_switch) FROM public.external_integrations WHERE integration_id=" + integration + ")"
            + ",'environment',(SELECT jsonb_build_object('config_version',config_version,'kill_switch',kill_switch,'runtime_enabled',runtime_enabled) FROM public.external_integration_environment_state WHERE environment='DEV')"
            + ",'audits',COALESCE((SELECT jsonb_agg(jsonb_build_object('command_id',command_id,'admin_actor_id',admin_actor_id,'new_version',new_version,'safe_diff',safe_diff)) FROM public.external_integration_config_audit WHERE command_id IN (" + ids + ")), '[]'::jsonb)) AS observation; COMMIT;")


def disable_policy_sql(plan):
    validate_sql_plan(plan)
    active = plan['policyActiveRow']; closed = {**active, 'universal_import_enabled': False}
    # A not-yet-installed column is already closed. Nothing deletes the policy or changes Manual Trip/P1 fields.
    return ("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; DO $close$ BEGIN "
            "IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.trip_sustained_dev_policy'::regclass AND attname='universal_import_enabled' AND NOT attisdropped) THEN "
            "PERFORM 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id=" + quote(ACTOR) + "::uuid FOR UPDATE; "
            "IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy p WHERE actor_account_id=" + quote(ACTOR) + "::uuid AND NOT (" + _same('p', 'trip_sustained_dev_policy', active) + ' OR ' + _same('p', 'trip_sustained_dev_policy', closed) + ")) THEN RAISE EXCEPTION 'UNIVERSAL_POLICY_DRIFT'; END IF; "
            "EXECUTE 'UPDATE public.trip_sustained_dev_policy SET universal_import_enabled=false WHERE actor_account_id=$1' USING " + quote(ACTOR) + "::uuid; END IF; END $close$; COMMIT;")


def close_roles_sql(plan):
    validate_sql_plan(plan)
    guards, changes = [], []
    start, end = quote(plan['startsAt']), quote(plan['adminControl']['expiresAt'])
    for role in ROLES:
        q = quote(role)
        guards.append("IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=" + q + " AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls AND (NOT rolcanlogin OR (rolconnlimit=1 AND (rolvaliduntil IS NULL OR rolvaliduntil='infinity'::timestamptz)))) THEN RAISE EXCEPTION 'UNIVERSAL_SERVICE_ROLE_DRIFT'; END IF;")
        guards.append("IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=" + q + " AND (backend_start<" + start + "::timestamptz OR backend_start>=" + end + "::timestamptz)) THEN RAISE EXCEPTION 'UNIVERSAL_FOREIGN_SERVICE_SESSION'; END IF;")
        changes.append('ALTER ROLE ' + role + " NOLOGIN; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=" + q + " AND backend_start>=" + start + "::timestamptz AND backend_start<" + end + "::timestamptz AND pid<>pg_backend_pid();")
    return "BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; DO $close$ BEGIN " + ''.join(guards) + ' END $close$; ' + ''.join(changes) + ' COMMIT;'


def read_source_sql(plan):
    validate_sql_plan(plan)
    return "BEGIN READ ONLY; SELECT jsonb_build_object('policyEnabled',COALESCE((SELECT (to_jsonb(p)->>'universal_import_enabled')::boolean FROM public.trip_sustained_dev_policy p WHERE actor_account_id=" + quote(ACTOR) + "::uuid),false)) AS source; COMMIT;"


def _role_object(expression):
    return 'jsonb_build_object(' + ','.join(quote(r) + ',' + expression(r) for r in ROLES) + ')'


def _function_authority_drift_sql():
    writer, meter, gateway = 'otr_trip_source_writer', 'otr_external_integration_meter_writer', 'otr_external_integration_call_gateway'
    properties = {}
    for sig in SOURCE_FUNCTIONS:
        owner = 'postgres' if sig == SOURCE_FUNCTIONS[0] else writer
        definer = sig not in (SOURCE_FUNCTIONS[1], SOURCE_FUNCTIONS[2], SOURCE_FUNCTIONS[4])
        readers = [owner]
        if sig == SOURCE_FUNCTIONS[0]: readers += [writer, meter]
        elif sig in (SOURCE_FUNCTIONS[3],) + SOURCE_FUNCTIONS[5:]: readers += ['otr_trip_source_command_gateway']
        properties[sig] = (owner, definer, readers)
    for sig in PROVIDER_FUNCTIONS + (DEPENDENCY,):
        owner = ('postgres' if sig in PROVIDER_FUNCTIONS[:2] or sig == PROVIDER_FUNCTIONS[10]
                 else 'otr_external_integration_config_writer' if sig == PROVIDER_FUNCTIONS[8] else meter)
        readers = [owner]
        if sig in PROVIDER_FUNCTIONS[:2] or sig == PROVIDER_FUNCTIONS[10]: readers += [meter]
        elif sig == PROVIDER_FUNCTIONS[2]: readers += ['otr_external_integration_config_writer']
        elif sig in (PROVIDER_FUNCTIONS[3], PROVIDER_FUNCTIONS[5], PROVIDER_FUNCTIONS[7], DEPENDENCY): readers += [gateway]
        elif sig == PROVIDER_FUNCTIONS[8]: readers += [ADMIN]
        properties[sig] = (owner, sig not in (PROVIDER_FUNCTIONS[9], PROVIDER_FUNCTIONS[10]), readers)
    checks = []
    for sig, (owner, definer, readers) in properties.items():
        allowed = ','.join(quote(r) + '::regrole' for r in set(readers))
        checks.append("EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(" + quote(sig) + ") AND (p.proowner<>" + quote(owner) + "::regrole OR p.prosecdef IS DISTINCT FROM " + ('true' if definer else 'false') + " OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[] OR EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee NOT IN (" + allowed + ") OR (acl.grantee<>p.proowner AND acl.is_grantable))))")
    return ' OR '.join(checks)


def read_sql_metadata(plan):
    validate_sql_plan(plan)
    funcs = SOURCE_FUNCTIONS + PROVIDER_FUNCTIONS + (DEPENDENCY,)
    hashes = 'jsonb_build_object(' + ','.join(quote(s) + ",encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(" + quote(s) + ")), 'UTF8')),'hex')" for s in funcs) + ')'
    logins = _role_object(lambda r: '(SELECT rolcanlogin FROM pg_roles WHERE rolname=' + quote(r) + ')')
    sessions = _role_object(lambda r: '(SELECT count(*) FROM pg_stat_activity WHERE usename=' + quote(r) + ')')
    restricted = ' AND '.join("EXISTS(SELECT 1 FROM pg_roles WHERE rolname=" + quote(r) + " AND rolcanlogin AND rolconnlimit=1 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls AND (rolvaliduntil IS NULL OR rolvaliduntil='infinity'::timestamptz))" for r in ROLES)
    catalog = "(SELECT jsonb_build_object('login',rolcanlogin,'connectionLimit',rolconnlimit,'validUntil',to_char(rolvaliduntil AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),'credentialSHA256',encode(sha256(convert_to(COALESCE(rolpassword,''),'UTF8')),'hex')) FROM pg_authid WHERE rolname='otr_trip_publication_catalog_reader')"
    unsafe = "EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN (" + ','.join(quote(r) for r in ROLES) + ") AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) OR EXISTS(SELECT 1 FROM public.external_integration_environment_state WHERE environment='DEV' AND runtime_enabled) OR EXISTS(SELECT 1 FROM public.external_integrations WHERE environment='DEV' AND integration_id<>" + quote(INTEGRATION) + " AND enabled AND NOT kill_switch) OR EXISTS(SELECT 1 FROM public.flight_activation_account_grants WHERE scope_id=" + quote(plan['scopeId']) + '::uuid AND account_id<>' + quote(ACTOR) + "::uuid AND NOT revoked AND expires_at>clock_timestamp())"
    unsafe += ' OR ' + _function_authority_drift_sql()
    return "BEGIN READ ONLY; SELECT jsonb_build_object('functionHashes'," + hashes + ",'sourceMeterLogins'," + logins + ",'sourceMeterSessions'," + sessions + ",'sourceMeterRestricted',(" + restricted + "),'catalog'," + catalog + ",'unsafe',(" + unsafe + ')) AS metadata; COMMIT;'


def _checked_provider_state(plan, observation):
    p = plan['providerControl']; act, close = p['activationCommands'], p['closeCommands']
    recovery = 'recoveryPreimages' in plan
    for key, opening, closing in [('grantState', act[-1], close[0]), ('scopeState', act[-2], close[1])]:
        state = observation[key]
        if state == ('PREVIOUS_CLOSED' if recovery else 'ABSENT') and not receipted(observation, opening) and not receipted(observation, closing):
            continue
        if (state == 'ACTIVE' and receipted(observation, opening)
                or state == 'CLOSED' and receipted(observation, closing)):
            continue
        raise ValueError('PROVIDER_STATE_OR_RECEIPT_DRIFT')
    baseline = plan['recoveryPreimages']['integration']['config_version'] if recovery else 11
    for key, opening, closing in [('integration', act[-4], close[2]), ('environment', act[-3], close[3])]:
        value = observation[key]
        state = {k: value[k] for k in ('config_version', 'kill_switch')}
        if key == 'environment' and value.get('runtime_enabled') is not False:
            raise ValueError('GLOBAL_RUNTIME_DRIFT')
        if state == {'config_version': baseline, 'kill_switch': True} and not receipted(observation, opening) and not receipted(observation, closing): continue
        if state == {'config_version': baseline + 1, 'kill_switch': False} and receipted(observation, opening): continue
        if state == {'config_version': baseline + 2, 'kill_switch': True} and receipted(observation, closing): continue
        raise ValueError('KILL_STATE_OR_RECEIPT_DRIFT')


def create_sql_ports(plan, management_sql, invoke_command, normal_service_probe=None, clock=time.time):
    validate_sql_plan(plan)
    bound = sha(canonical(plan))
    def same(p):
        if sha(canonical(p)) != bound: raise ValueError('SEALED_PLAN_MISMATCH')
    def observation():
        result = _one(management_sql(observe_sql(plan)), 'observation')
        _checked_provider_state(plan, result)
        return result
    def revoke_provider(p):
        same(p)
        o = observation()
        for index, key in enumerate(('grantState', 'scopeState', 'integration', 'environment')):
            active = o[key] == 'ACTIVE' if index < 2 else o[key]['kill_switch'] is False
            if not active: continue
            if not instant(plan['adminControl']['startsAt']) <= clock() < instant(plan['adminControl']['expiresAt']):
                raise ValueError('ADMIN_CLOSURE_WINDOW_EXPIRED')
            x = plan['providerControl']['closeCommands'][index]
            try: invoke_command(x)
            except Exception: pass  # The only safe next step is independent receipt/readback.
            o = observation()
            if not receipted(o, x): raise RuntimeError('PROVIDER_CLOSE_UNKNOWN')
            if index < 2 and o[key] != 'CLOSED' or index >= 2 and o[key]['kill_switch'] is not True:
                raise RuntimeError('PROVIDER_CLOSE_UNCONFIRMED')
    def read_sql(p):
        same(p)
        o, data = observation(), _one(management_sql(read_sql_metadata(plan)), 'metadata')
        installed, drift = {}, bool(data['unsafe'])
        for artifact, signatures in GROUPS.items():
            observed = {s: data['functionHashes'].get(s) for s in signatures}
            if observed == {s: plan['installedFunctionHashes'][s] for s in signatures}: installed[artifact] = SQL_HASHES[artifact]
            elif observed != {s: plan['functionPreimages'][s] for s in signatures}: drift = True
        if data['functionHashes'].get(DEPENDENCY) != plan['functionPreimages'][DEPENDENCY]: drift = True
        return {'installedSqlHashes': installed, 'unexpectedAuthorityActive': drift,
                'providerScopeActive': o['scopeState'] == 'ACTIVE', 'providerGrantActive': o['grantState'] == 'ACTIVE',
                **{k: data[k] for k in ('sourceMeterLogins', 'sourceMeterSessions', 'sourceMeterRestricted', 'catalog')}}
    def read_source(p):
        same(p)
        result = _one(management_sql(read_source_sql(plan)), 'source')
        if normal_service_probe is not None:
            result['normalServiceVerified'] = result.get('policyEnabled') is True and normal_service_probe(plan) is True
        return result
    def read_admin(p):
        same(p)
        closed = _one(management_sql(revoked_sql(plan['adminControl'])), 'closed')
        # Do not invent details from one boolean; independently obtain actual role/counts.
        detail = _one(management_sql("BEGIN READ ONLY; SELECT jsonb_build_object('permissionsActive',EXISTS(SELECT 1 FROM public.external_integration_admin_grants WHERE actor_id=" + quote(ACTOR) + "::uuid AND environment='DEV' AND revoked_at IS NULL),'loginEnabled',(SELECT rolcanlogin FROM pg_roles WHERE rolname='" + ADMIN + "'),'sessions',(SELECT count(*) FROM pg_stat_activity WHERE usename='" + ADMIN + "')) AS admin; COMMIT;"), 'admin')
        if closed is not True: detail['permissionsActive'] = True
        return detail
    return {'disable_policy': lambda p: (same(p), management_sql(disable_policy_sql(plan)))[1],
            'revoke_provider': revoke_provider, 'revoke_admin': lambda p: (same(p), management_sql(revoke_sql(plan['adminControl'])))[1],
            'close_source_meter': lambda p: (same(p), management_sql(close_roles_sql(plan)))[1],
            'read_source': read_source, 'read_sql': read_sql, 'read_admin': read_admin}
