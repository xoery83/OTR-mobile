"""Pure command binding; neither real Auth nor DEV execution evidence."""
import copy
import unittest
from universal_continuous_commands import bind, ACTOR, PROVIDER, RECOVERY_SCOPE_ID
from build_universal_admin_plan import command_hash


class CommandsTests(unittest.TestCase):
    def setUp(self):
        self.plan = {'actorId': ACTOR, 'scopeId': '10000000-0000-4000-8000-000000000001',
                     'startsAt': '2026-10-25T06:00:00Z', 'expiresAt': '2026-10-25T06:13:00Z',
                     'providerExpiresAt': '2026-11-01T06:00:00Z'}
        self.facts = {'scope': None, 'integration': {'config_version': 11, 'kill_switch': True},
                      'environment': {'config_version': 11, 'kill_switch': True, 'runtime_enabled': False},
                      'providerConfigId': PROVIDER, 'configurationSHA256': 'a' * 64,
                      'profileSHA256': 'b' * 64, 'profile': {'prompt_sha256': 'c' * 64, 'output_schema_sha256': 'd' * 64},
                      'price': {'price_schedule_id': '0fbd87bc-2f6b-4be4-812a-ca03a77cf136',
                                'schedule_version': 'old', 'effective_until': '2026-10-24T22:52:36+00:00'}}
        self.auth = {'verified_actor_id': ACTOR, 'verified_account_id': ACTOR, 'principal_kind': 'OTR_ADMIN',
                     'revoked': False, 'verified_environment': 'DEV', 'auth_session_reference': 'vault:otr/dev/qa/session',
                     'verified_at': '2026-10-25T05:59:59Z', 'expires_at': '2026-10-25T06:15:00Z'}

    def build(self):
        return bind(self.plan, self.facts, self.auth, lambda table, row: ('e' if table == 'scope' else 'f') * 64)

    def test_exact_caps_and_hash_bound_commands(self):
        result = self.build()
        self.assertEqual(len(result['activationCommands']), 5)
        self.assertEqual(result['activationCommands'][0]['command']['row']['source_reference'], 'deepseek:official-pricing:20261025')
        self.assertEqual(len(result['closeCommands']), 4)
        scope = result['scopeActiveRow']
        self.assertEqual([scope[k] for k in ['account_daily', 'dev_daily', 'provider_daily']], [2, 2, 2])
        self.assertEqual(scope['call_cost_nanos'], '50000000')
        for value in result['activationCommands'] + result['closeCommands']:
            self.assertEqual(command_hash({k: v for k, v in value['command'].items() if k != 'request_sha256'}), value['command']['request_sha256'])
            self.assertEqual(value['context']['request_sha256'], value['command']['request_sha256'])
        self.assertFalse(any(v['kind'] == 'flight_activation_runtime' for v in result['activationCommands']))
        self.assertEqual(result['closeCommands'][0]['command']['row']['revoked'], True)
        self.assertEqual(result['closeCommands'][1]['command']['row']['active'], False)

    def recovery_fixture(self):
        initial = copy.deepcopy(self.plan)
        initial['scopeId'] = RECOVERY_SCOPE_ID
        initial.update(startsAt='2026-10-25T08:48:56Z', expiresAt='2026-10-25T08:59:56Z', providerExpiresAt='2026-11-01T08:48:56Z')
        auth = {**self.auth, 'expires_at': '2026-10-25T09:03:56Z'}
        first = bind(initial, self.facts, auth, lambda table, row: ('e' if table == 'scope' else 'f') * 64)
        previous = {'scope': first['closeCommands'][1]['command']['row'],
                    'grant': first['closeCommands'][0]['command']['row'],
                    'price': first['activationCommands'][0]['command']['row'],
                    'priceUnits': first['activationCommands'][0]['command']['units'],
                    'integration': {'integration_id': first['integrationId'], 'environment': 'DEV', 'enabled': True, 'config_version': 13, 'kill_switch': True},
                    'environment': {'environment': 'DEV', 'config_version': 13, 'kill_switch': True, 'runtime_enabled': False}}
        # Actual PG timestamp/numeric display is preserved rather than rewritten.
        for row in [previous['scope'], previous['grant'], previous['price']]:
            for k, value in list(row.items()):
                if k in ['expires_at', 'created_at', 'effective_from', 'effective_until']:
                    row[k] = value.replace('Z', '+00:00')
        previous['priceUnits'][0]['price_per_quantity'] = '0.006000000000000000'
        plan = {**initial, 'startsAt': '2026-10-25T10:00:00Z', 'expiresAt': '2026-10-25T10:11:00Z', 'recoveryPreimages': previous}
        facts = {**copy.deepcopy(self.facts), **copy.deepcopy(previous)}
        auth = {**self.auth, 'verified_at': '2026-10-25T09:59:59Z', 'expires_at': '2026-10-25T10:15:00Z'}
        return plan, facts, auth

    def test_exact_existing_scope_recovery_never_appends_price_or_resets_budget_expiry(self):
        plan, facts, auth = self.recovery_fixture()
        calls = []
        def row_hash(table, row):
            calls.append(table)
            self.assertEqual(table, 'scope')
            return 'a' * 64
        result = bind(plan, facts, auth, row_hash)
        self.assertEqual(len(result['activationCommands']), 4)
        self.assertNotIn('external_integration_price_append', [x['kind'] for x in result['activationCommands']])
        scope = result['scopeActiveRow']
        self.assertEqual(scope, {**plan['recoveryPreimages']['scope'], 'revision': 3, 'active': True, 'integration_version': 14, 'scope_sha256': 'a' * 64})
        self.assertEqual(result['grantActiveRow']['revision'], 3)
        self.assertEqual([x['command']['expected_version'] for x in result['activationCommands']], [13, 13, 2, 2])
        self.assertEqual([x['command']['expected_version'] for x in result['closeCommands']], [3, 3, 14, 14])
        self.assertEqual(result['closeCommands'][1]['command']['row']['revision'], 4)
        self.assertEqual(calls, ['scope', 'scope'])
        self.assertEqual(scope['expires_at'], '2026-11-01T08:48:56+00:00')

    def test_verified_cleanup_revision4_resume_is_cas_bound_without_new_price_or_budget(self):
        plan,facts,auth=self.recovery_fixture()
        r=plan['recoveryPreimages']
        r['scope'].update(revision=4,integration_version=14)
        r['grant']['revision']=4
        r['integration']['config_version']=15;r['environment']['config_version']=15
        facts.update(copy.deepcopy(r))
        result=bind(plan,facts,auth,lambda table,row:'a'*64)
        self.assertEqual([x['command']['expected_version'] for x in result['activationCommands']],[15,15,4,4])
        self.assertEqual([x['command']['expected_version'] for x in result['closeCommands']],[5,5,16,16])
        self.assertEqual(result['scopeActiveRow']['revision'],5)
        self.assertEqual(result['scopeActiveRow']['integration_version'],16)
        self.assertEqual(result['scopeActiveRow']['expires_at'],r['scope']['expires_at'])
        self.assertEqual(result['closeCommands'][1]['command']['row']['revision'],6)
        self.assertNotIn('external_integration_price_append',[x['kind'] for x in result['activationCommands']])
        for bad in [3,5,6,True]:
            p=copy.deepcopy(plan);p['recoveryPreimages']['scope']['revision']=bad
            with self.assertRaises(ValueError):bind(p,facts,auth,lambda table,row:'a'*64)

    def test_recovery_rejects_expiry_reset_new_identity_rights_price_profile_or_cas_drift(self):
        mutations = [
            lambda p, f: p.update(providerExpiresAt='2026-11-01T10:00:00Z'),
            lambda p, f: p['recoveryPreimages']['scope'].update(revision=4),
            lambda p, f: p['recoveryPreimages']['scope'].update(account_daily=3),
            lambda p, f: p['recoveryPreimages']['scope'].update(created_by=PROVIDER),
            lambda p, f: p['recoveryPreimages']['grant'].update(account_id=PROVIDER),
            lambda p, f: p['recoveryPreimages']['price'].update(price_schedule_id=PROVIDER),
            lambda p, f: p['recoveryPreimages']['priceUnits'][0].update(price_per_quantity='0.005'),
            lambda p, f: p['recoveryPreimages']['environment'].update(runtime_enabled=True),
            lambda p, f: p['recoveryPreimages']['integration'].update(config_version=15),
            lambda p, f: f.update(profileSHA256='f' * 64),
        ]
        for change in mutations:
            plan, facts, auth = self.recovery_fixture()
            change(plan, facts)
            with self.subTest(change=change), self.assertRaises(ValueError):
                bind(plan, facts, auth, lambda table, row: 'a' * 64)

    def test_recovery_exact_numeric_caps_preserve_int_or_string_never_bool_float_or_new_scope(self):
        for value in [50000000, '50000000']:
            plan, facts, auth = self.recovery_fixture()
            plan['recoveryPreimages']['scope']['call_cost_nanos'] = value
            facts['scope']['call_cost_nanos'] = value
            result = bind(plan, facts, auth, lambda table, row: 'a' * 64)
            self.assertIs(type(result['scopeActiveRow']['call_cost_nanos']), type(value))
        for value in [True, 50000000.0, '050000000', '5e7', 50000001]:
            plan, facts, auth = self.recovery_fixture()
            plan['recoveryPreimages']['scope']['call_cost_nanos'] = value
            facts['scope']['call_cost_nanos'] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                bind(plan, facts, auth, lambda table, row: 'a' * 64)
        plan, facts, auth = self.recovery_fixture()
        plan['scopeId'] = PROVIDER
        for rows in [plan['recoveryPreimages'], facts]:
            rows['scope']['scope_id'] = PROVIDER
            rows['grant']['scope_id'] = PROVIDER
        with self.assertRaisesRegex(ValueError, 'EXACT_EXISTING_SCOPE_ID'):
            bind(plan, facts, auth, lambda table, row: 'a' * 64)

    def test_actual_operator_preimage_projection_with_registered_frozen_profile(self):
        import json
        import subprocess
        from pathlib import Path
        projection = Path('/private/tmp/otr-universal-stage2-live-control/run6-closed-provider-preimages.json')
        if not projection.exists(): self.skipTest('Operator-local nonsecret actual preimage receipt unavailable')
        root = Path(__file__).resolve().parents[2]
        code = "import {registeredUniversalModelProfile as profile} from './backend/src/universalModelProfile.ts';import {persistenceDigest} from './backend/src/externalIntegrationPersistence.ts';console.log(JSON.stringify({profile,profileSHA256:persistenceDigest(profile)}));"
        observed = subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e', code], cwd=root, check=True, capture_output=True, text=True, timeout=15)
        frozen = json.loads(observed.stdout)
        previous = json.loads(projection.read_text())
        plan, facts, auth = self.recovery_fixture()
        plan['recoveryPreimages'] = previous
        facts = {**facts, **copy.deepcopy(previous), 'providerConfigId': PROVIDER,
                 'configurationSHA256': previous['scope']['configuration_sha256'],
                 'profileSHA256': frozen['profileSHA256'], 'profile': frozen['profile']}
        result = bind(plan, facts, auth, lambda table, row: 'a' * 64)
        active = result['scopeActiveRow']
        self.assertEqual(active, {**previous['scope'], 'revision': 3, 'active': True, 'integration_version': 14, 'scope_sha256': 'a' * 64})
        self.assertIs(type(active['call_cost_nanos']), int)
        self.assertEqual(active['scope_id'], RECOVERY_SCOPE_ID)
        self.assertEqual(len(result['activationCommands']), 4)

    def test_drifted_scope_or_environment_refused(self):
        for key, value in [('scope', {'revision': 1}), ('providerConfigId', ACTOR),
                           ('environment', {**self.facts['environment'], 'runtime_enabled': True})]:
            with self.subTest(key=key):
                previous = copy.deepcopy(self.facts)
                self.facts[key] = value
                with self.assertRaises(ValueError):
                    self.build()
                self.facts = previous

    def test_wrong_or_expired_auth_refused(self):
        for key, value in [('verified_actor_id', PROVIDER), ('revoked', True),
                           ('expires_at', '2026-10-25T06:12:00Z'), ('auth_session_reference', 'caller:unverified')]:
            previous = copy.deepcopy(self.auth)
            self.auth[key] = value
            with self.assertRaises(ValueError):
                self.build()
            self.auth = previous

    def test_no_overlapping_price_or_longer_rollout(self):
        self.facts['price']['effective_until'] = '2026-10-25T07:00:00Z'
        with self.assertRaises(ValueError):
            self.build()
        self.facts['price']['effective_until'] = '2026-10-24T22:52:36Z'
        self.plan['providerExpiresAt'] = '2026-11-02T06:00:00Z'
        with self.assertRaises(ValueError):
            self.build()
