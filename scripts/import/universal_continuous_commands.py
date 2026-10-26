"""Bind the approved Universal transition to existing CP14/15 commands only.

No credentials, transport, authority issuance or execution. SQL row hashing is
supplied by the existing read-only cp14_hash/populate_record boundary.
"""
import copy
import uuid
from decimal import Decimal
from build_universal_admin_plan import command_hash
from universal_continuous_transition import ACTOR, instant
from universal_config_control import grant_instant

INTEGRATION = 'otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d'
PROVIDER = '08e8113c-41dd-47cf-8d90-fc9eba98162e'
PRICE = '56f9eee5-bee5-4ace-820d-c3a8d472ef04'


RECOVERY_EXPIRY = '2026-11-01T08:48:56Z'
RECOVERY_SCOPE_ID = 'baac2ca8-f769-4ace-8bd4-d394a36312d6'

def validate_recovery_preimages(plan):
    r = plan['recoveryPreimages']
    if not isinstance(r, dict) or set(r) != {'scope', 'grant', 'price', 'priceUnits', 'integration', 'environment'}:
        raise ValueError('EXACT_CLOSED_RECOVERY_PREIMAGES_REQUIRED')
    scope, grant, price = r['scope'], r['grant'], r['price']
    if (grant_instant(plan['providerExpiresAt']) != instant(RECOVERY_EXPIRY)
            or not 0 < instant(RECOVERY_EXPIRY) - instant(plan['startsAt']) <= 7 * 86400):
        raise ValueError('ORIGINAL_PROVIDER_EXPIRY_REQUIRED')
    if plan['scopeId'] != RECOVERY_SCOPE_ID:
        raise ValueError('EXACT_EXISTING_SCOPE_ID_REQUIRED')
    prior_revision=scope.get('revision')
    if type(prior_revision) is not int or prior_revision not in (2,4):
        raise ValueError('EXACT_VERIFIED_CLOSED_REVISION_REQUIRED')
    prior_version=13 if prior_revision==2 else 15
    fixed = {'scope_id': RECOVERY_SCOPE_ID, 'revision': prior_revision, 'environment': 'DEV',
             'workload': 'UNIVERSAL_IMPORT_V1', 'provider_id': 'DeepSeek', 'model_id': 'deepseek-flash',
             'expected_family': 'DeepSeek-V4.1-Flash', 'shadow': False, 'active': False,
             'integration_id': INTEGRATION, 'integration_version': prior_version-1, 'provider_config_id': PROVIDER,
             'price_schedule_id': PRICE, 'input_ceiling': 32768, 'output_ceiling': 4096,
             'concurrent_account': 1, 'account_daily': 2, 'dev_daily': 2, 'provider_daily': 2,
             'max_attempts': 1, 'monetary_approved': True, 'currency': 'USD', 'created_by': ACTOR}
    if (set(scope) != set(fixed) | {'configuration_sha256', 'scope_sha256', 'pins', 'expires_at', 'created_at', 'call_cost_nanos', 'account_day_cost_nanos', 'dev_day_cost_nanos'}
            or any(scope.get(k) != v for k, v in fixed.items())
            or grant_instant(scope['expires_at']) != instant(RECOVERY_EXPIRY)
            or grant_instant(scope['created_at']) != instant('2026-10-25T08:48:56Z')
            or grant != {'scope_id': plan['scopeId'], 'account_id': ACTOR, 'revision': prior_revision,
                         'expires_at': scope['expires_at'], 'revoked': True, 'updated_by': ACTOR}):
        raise ValueError('EXACT_PREVIOUS_SCOPE_GRANT_REQUIRED')
    # PostgreSQL jsonb emits scale-zero numeric as int; preserve its raw row for CAS.
    # Accept only exact integers or the original canonical decimal strings, never bool/float.
    for key, expected in [('call_cost_nanos', 50000000), ('account_day_cost_nanos', 100000000), ('dev_day_cost_nanos', 100000000)]:
        value = scope[key]
        if not (type(value) is int and value == expected or type(value) is str and value == str(expected)):
            raise ValueError('EXACT_EXISTING_MONETARY_CAP_REQUIRED')
    pins = scope['pins']
    if (set(pins) != {'adapter_version', 'prompt_sha256', 'output_schema_sha256', 'profile_sha256',
                     'task_lifetime_ms', 'price_sha256', 'provider_config_sha256'}
            or pins['adapter_version'] != 'otr-universal-deepseek-v1' or pins['task_lifetime_ms'] != 600000
            or pins['provider_config_sha256'] != scope['configuration_sha256']):
        raise ValueError('UNCHANGED_UNIVERSAL_PROFILE_REQUIRED')
    for value in [scope['scope_sha256'], scope['configuration_sha256']] + [v for k, v in pins.items() if k.endswith('sha256')]:
        if not isinstance(value, str) or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
            raise ValueError('RECOVERY_DIGEST_REQUIRED')
    expected_price = {'price_schedule_id': PRICE, 'integration_id': INTEGRATION, 'provider_id': 'DeepSeek',
        'model_id': 'deepseek-flash', 'schedule_version': 'stage2-peak-upper-bound-20261025', 'currency': 'USD',
        'source_reference': 'deepseek:official-pricing:20261025', 'source_version': 'official-peak-upper-bound-observed-20261025',
        'supersedes_schedule_id': None, 'rounding_policy': 'SUM_THEN_CEIL_NANOS_V1', 'created_by': ACTOR,
        'schedule_sha256': pins['price_sha256']}
    if (set(price) != set(expected_price) | {'effective_from', 'effective_until', 'created_at'}
            or any(price.get(k) != v for k, v in expected_price.items())
            or grant_instant(price['effective_until']) != instant(RECOVERY_EXPIRY)
            or grant_instant(price['effective_from']) != grant_instant(scope['created_at'])
            or grant_instant(price['created_at']) != grant_instant(scope['created_at'])):
        raise ValueError('IMMUTABLE_PRICE_PREIMAGE_REQUIRED')
    rates = {'cached_input_tokens': Decimal('0.006'), 'input_tokens': Decimal('0.3'), 'output_tokens': Decimal('1.2')}
    units = r['priceUnits']
    if len(units) != 3 or {u.get('unit_key') for u in units} != set(rates):
        raise ValueError('EXACT_EXISTING_PRICE_UNITS_REQUIRED')
    for u in units:
        if (set(u) != {'price_schedule_id', 'unit_key', 'measurement_unit', 'unit_quantity', 'price_per_quantity', 'unit_definition'}
                or u['price_schedule_id'] != PRICE or u['measurement_unit'] != u['unit_key'] or u['unit_quantity'] != 1000000
                or Decimal(str(u['price_per_quantity'])) != rates[u['unit_key']]
                or u['unit_definition'] != {'version': 1, 'relationship': 'DISJOINT', 'included_in': None, 'billable': True}):
            raise ValueError('EXACT_EXISTING_PRICE_UNITS_REQUIRED')
    i, e = r['integration'], r['environment']
    if (i.get('integration_id') != INTEGRATION or i.get('environment') != 'DEV' or i.get('enabled') is not True
            or i.get('config_version') != prior_version or i.get('kill_switch') is not True
            or e.get('environment') != 'DEV' or e.get('config_version') != prior_version or e.get('kill_switch') is not True
            or e.get('runtime_enabled') is not False):
        raise ValueError('EXACT_CLOSED_KILL_PREIMAGES_REQUIRED')
    return r


def bind(plan, facts, auth, row_hash, identity=lambda: str(uuid.uuid4())):
    """Auth is a real verifier receipt, revalidated by the operator before send."""
    recovery = validate_recovery_preimages(plan) if 'recoveryPreimages' in plan else None
    if recovery is not None and any(facts.get(k) != v for k, v in recovery.items()):
        raise ValueError('RECOVERY_FACTS_CHANGED')
    if (plan['actorId'] != ACTOR or recovery is None and (facts['scope'] is not None
            or facts['integration'] != {'config_version': 11, 'kill_switch': True}
            or facts['environment'] != {'config_version': 11, 'kill_switch': True, 'runtime_enabled': False}
            or facts['providerConfigId'] != PROVIDER
            or facts['price']['price_schedule_id'] != '0fbd87bc-2f6b-4be4-812a-ca03a77cf136')):
        raise ValueError('EXACT_PREFLIGHT_REQUIRED')
    if facts['providerConfigId'] != PROVIDER:
        raise ValueError('EXACT_PREFLIGHT_REQUIRED')
    if (auth.get('verified_actor_id') != ACTOR or auth.get('verified_account_id') != ACTOR
            or auth.get('principal_kind') != 'OTR_ADMIN' or auth.get('revoked') is not False
            or auth.get('verified_environment') != 'DEV'
            or not auth.get('auth_session_reference', '').startswith('vault:otr/dev/')
            or instant(auth['verified_at']) > instant(plan['startsAt'])
            or instant(auth['expires_at']) < instant(plan['expiresAt'])):
        raise ValueError('CURRENT_NORMAL_AUTH_RECEIPT_REQUIRED')
    start, end = plan['startsAt'], plan['providerExpiresAt']
    if recovery is None and instant(end) - instant(start) != 7 * 86400:
        raise ValueError('APPROVED_SEVEN_DAY_LIMIT')
    price = {'price_schedule_id': PRICE, 'integration_id': INTEGRATION,
             'provider_id': 'DeepSeek', 'model_id': 'deepseek-flash',
             'schedule_version': 'stage2-peak-upper-bound-20261025', 'currency': 'USD',
             'effective_from': start, 'effective_until': end,
             'source_reference': 'deepseek:official-pricing:20261025',
             'source_version': 'official-peak-upper-bound-observed-20261025',
             'supersedes_schedule_id': None, 'rounding_policy': 'SUM_THEN_CEIL_NANOS_V1',
             'created_at': start, 'created_by': ACTOR}
    if recovery is None and instant(facts['price']['effective_until'].replace('+00:00', 'Z')) >= instant(start):
        raise ValueError('EXPIRED_PRICE_PREIMAGE_REQUIRED')
    units = [{'price_schedule_id': PRICE, 'unit_key': key, 'measurement_unit': key,
              'unit_quantity': 1000000, 'price_per_quantity': value,
              'unit_definition': {'version': 1, 'relationship': 'DISJOINT', 'included_in': None, 'billable': True}}
             for key, value in [('cached_input_tokens', '0.006'), ('input_tokens', '0.3'), ('output_tokens', '1.2')]]
    price['schedule_sha256'] = (recovery['price']['schedule_sha256'] if recovery is not None else row_hash('price', {'row': price, 'units': units}))
    profile = facts['profile']
    scope = {'scope_id': plan['scopeId'], 'revision': 1, 'environment': 'DEV',
             'workload': 'UNIVERSAL_IMPORT_V1', 'provider_id': 'DeepSeek',
             'model_id': 'deepseek-flash', 'expected_family': 'DeepSeek-V4.1-Flash',
             'shadow': False, 'active': True, 'integration_id': INTEGRATION,
             'integration_version': 12, 'configuration_sha256': facts['configurationSHA256'],
             'provider_config_id': PROVIDER, 'price_schedule_id': PRICE,
             'pins': {'adapter_version': 'otr-universal-deepseek-v1',
                      'prompt_sha256': profile['prompt_sha256'],
                      'output_schema_sha256': profile['output_schema_sha256'],
                      'profile_sha256': facts['profileSHA256'], 'task_lifetime_ms': 600000,
                      'price_sha256': price['schedule_sha256'],
                      'provider_config_sha256': facts['configurationSHA256']},
             'expires_at': end, 'input_ceiling': 32768, 'output_ceiling': 4096,
             'concurrent_account': 1, 'account_daily': 2, 'dev_daily': 2, 'provider_daily': 2,
             'max_attempts': 1, 'monetary_approved': True, 'currency': 'USD',
             'call_cost_nanos': '50000000', 'account_day_cost_nanos': '100000000',
             'dev_day_cost_nanos': '100000000', 'created_by': ACTOR, 'created_at': start}
    if recovery is not None:
        old = recovery['scope']
        if (old['configuration_sha256'] != facts['configurationSHA256']
                or old['pins']['profile_sha256'] != facts['profileSHA256']
                or old['pins']['prompt_sha256'] != profile['prompt_sha256']
                or old['pins']['output_schema_sha256'] != profile['output_schema_sha256']):
            raise ValueError('UNCHANGED_UNIVERSAL_PROFILE_REQUIRED')
        price = copy.deepcopy(recovery['price'])
        scope = {**copy.deepcopy(old), 'revision': old['revision']+1, 'active': True, 'integration_version': recovery['integration']['config_version']+1}
    scope['scope_sha256'] = row_hash('scope', {k: v for k, v in scope.items() if k != 'scope_sha256'})
    grant = {'scope_id': plan['scopeId'], 'account_id': ACTOR, 'revision': 1,
             'expires_at': end, 'revoked': False, 'updated_by': ACTOR}

    if recovery is not None:
        grant = {**copy.deepcopy(recovery['grant']), 'revision': recovery['grant']['revision']+1, 'revoked': False}

    def command(kind, expected, row=None, environment=False, **extra):
        body = {'version': 1, 'environment': 'DEV', 'request_id': identity(),
                'actor_id': ACTOR, 'integration_id': None if environment else INTEGRATION,
                'expected_version': expected, 'audit_id': identity(),
                'reason_code': 'UNIVERSAL_STAGE2_APPROVED_CONTINUOUS'}
        if row is not None:
            body['row'] = copy.deepcopy(row)
        body.update(extra)
        body['request_sha256'] = command_hash(body)
        context = {**copy.deepcopy(auth), 'request_id': body['request_id'],
                   'request_sha256': body['request_sha256'], 'command_kind': kind,
                   'gateway_identity': 'otr_external_integration_admin_gateway'}
        return {'kind': kind, 'command': body, 'context': context}

    baseline = recovery['integration']['config_version'] if recovery is not None else 11
    before_revision = recovery['scope']['revision'] if recovery is not None else 0
    activation = ([command('external_integration_price_append', facts['price']['schedule_version'], price, units=units)] if recovery is None else []) + [
        command('external_integration_set_kill', baseline, kill_switch=False),
        command('external_integration_set_kill', baseline, environment=True, kill_switch=False),
        command('flight_activation_select', before_revision, scope),
        command('flight_activation_account_grant', before_revision, grant)]
    closed_scope = {**scope, 'revision': before_revision + 2, 'active': False}
    closed_scope['scope_sha256'] = row_hash('scope', {k: v for k, v in closed_scope.items() if k != 'scope_sha256'})
    closed_grant = {**grant, 'revision': before_revision + 2, 'revoked': True}
    close = [command('flight_activation_account_grant', before_revision + 1, closed_grant),
             command('flight_activation_select', before_revision + 1, closed_scope),
             command('external_integration_set_kill', baseline + 1, kill_switch=True),
             command('external_integration_set_kill', baseline + 1, environment=True, kill_switch=True)]
    return {'actorId': ACTOR, 'integrationId': INTEGRATION,
            'scopeActiveRow': scope, 'grantActiveRow': grant,
            'activationCommands': activation, 'closeCommands': close}
