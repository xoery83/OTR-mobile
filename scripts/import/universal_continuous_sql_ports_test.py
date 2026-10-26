from universal_continuous_transition import sha
from pathlib import Path
"""Pure SQL text/port composition fixtures, not DEV/SQL-install/E2E receipts."""
import copy
import unittest
import uuid
import universal_continuous_transition_test as transition_fixture
import universal_continuous_commands_test as commands_fixture
from universal_continuous_commands import bind
from universal_continuous_sql_ports import (
    ACTOR, SQL_HASHES, SOURCE_FUNCTIONS, PROVIDER_FUNCTIONS, DEPENDENCY,
    validate_sql_plan, disable_policy_sql, close_roles_sql, read_sql_metadata,
    create_sql_ports, observe_sql,
)
from universal_config_control import context_scope_hash


class SqlPortsTests(unittest.TestCase):
    def setUp(self):
        f = transition_fixture.TransitionTests(); f.setUp(); self.addCleanup(f.doCleanups)
        b = commands_fixture.CommandsTests(); b.setUp()
        self.plan = copy.deepcopy(f.plan)
        self.plan['expiresAt'] = '2026-10-25T06:11:00Z'
        a = {'actorId': ACTOR, 'integrationId': 'otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d',
             'startsAt': self.plan['startsAt'], 'expiresAt': '2026-10-25T06:15:00Z'}
        a['role'] = {'name': 'otr_external_integration_admin_gateway', 'priorCanLogin': False, 'expiresAt': a['expiresAt']}
        a['temporaryGrants'] = [{'admin_grant_id': str(uuid.uuid4()), 'actor_id': ACTOR, 'environment': 'DEV', 'permission': p,
                                 'grant_revision': 1, 'expires_at': a['expiresAt'], 'revoked_at': None,
                                 'created_at': a['startsAt'], 'created_by': ACTOR} for p in ['CONFIG_ADMIN', 'SECURITY_ADMIN']]
        self.plan['adminControl'] = a
        self.plan['providerControl'] = bind(self.plan, b.facts, b.auth, lambda kind, row: ('d' if kind == 'scope' else 'e') * 64)
        self.plan['policyActiveRow'] = {'actor_account_id': ACTOR, 'enabled': True, 'adoption_cutoff': self.plan['startsAt'], 'revoked_at': None, 'universal_import_enabled': True}
        self.plan['installedFunctionHashes'] = {s: 'a' * 64 for s in SOURCE_FUNCTIONS + PROVIDER_FUNCTIONS}
        self.plan['functionPreimages'] = {s: None for s in SOURCE_FUNCTIONS + PROVIDER_FUNCTIONS}
        self.plan['functionPreimages'][DEPENDENCY] = 'b' * 64
        self.observation = {'scopeState': 'ABSENT', 'grantState': 'ABSENT', 'integration': {'config_version': 11, 'kill_switch': True},
                            'environment': {'config_version': 11, 'kill_switch': True, 'runtime_enabled': False}, 'audits': []}
        self.invoked = []
        self.metadata = {'functionHashes': {**self.plan['installedFunctionHashes'], DEPENDENCY: 'b' * 64},
                         'sourceMeterLogins': copy.deepcopy(f.sql['sourceMeterLogins']),
                         'sourceMeterSessions': copy.deepcopy(f.sql['sourceMeterSessions']), 'sourceMeterRestricted': True,
                         'catalog': copy.deepcopy(self.plan['catalogBaseline']), 'unsafe': False}
        self.management_calls = []
        def management(text):
            self.management_calls.append(text)
            if ' AS observation;' in text: return [{'observation': copy.deepcopy(self.observation)}]
            if ' AS metadata;' in text: return [{'metadata': copy.deepcopy(self.metadata)}]
            if ' AS source;' in text: return [{'source': {'policyEnabled': False}}]
            if ' AS closed;' in text: return [{'closed': True}]
            if ' AS admin;' in text: return [{'admin': {'permissionsActive': False, 'loginEnabled': False, 'sessions': 0}}]
            return []
        self.management = management
        self.ports = create_sql_ports(self.plan, management, self.invoke, clock=lambda: f.end - 1)

    def receipt(self, x):
        c = x['command']
        return {'command_id': c['request_id'], 'admin_actor_id': ACTOR,
                'new_version': 1 if x['kind'] == 'external_integration_price_append' else (c['expected_version'] or 0) + 1,
                'safe_diff': {'request_sha256': c['request_sha256'], 'command_kind': x['kind'], 'scope_sha256': context_scope_hash(x['context'])}}

    def active(self, indices=(0, 1, 2, 3, 4)):
        self.observation['audits'] = [self.receipt(self.plan['providerControl']['activationCommands'][i]) for i in indices]
        self.observation.update(scopeState='ACTIVE' if 3 in indices else 'ABSENT', grantState='ACTIVE' if 4 in indices else 'ABSENT')
        for i, key in ((1, 'integration'), (2, 'environment')):
            if i in indices: self.observation[key].update(config_version=12, kill_switch=False)

    def invoke(self, x):
        self.invoked.append(x['command']['request_id'])
        index = self.plan['providerControl']['closeCommands'].index(x)
        if index == 0: self.observation['grantState'] = 'CLOSED'
        elif index == 1: self.observation['scopeState'] = 'CLOSED'
        else: self.observation['integration' if index == 2 else 'environment'].update(config_version=x['command']['expected_version'] + 1, kill_switch=True)
        self.observation['audits'].append(self.receipt(x))

    def test_exact_plan_and_no_transport_on_construction(self):
        validate_sql_plan(self.plan)
        self.assertEqual(self.management_calls, [])
        self.assertEqual(self.invoked, [])

    def test_bad_identity_hash_admin_tail_or_provider_scope_rejected(self):
        mutations = [lambda p: p.update(actorId='wrong'), lambda p: p['adminControl'].update(expiresAt=p['expiresAt']),
                     lambda p: p['policyActiveRow'].update(actor_account_id='wrong'),
                     lambda p: p['providerControl']['closeCommands'][0]['command'].update(actor_id='wrong'),
                     lambda p: p['providerControl']['scopeActiveRow'].update(scope_id=str(uuid.uuid4())),
                     lambda p: p['installedFunctionHashes'].pop(SOURCE_FUNCTIONS[0])]
        for change in mutations:
            p = copy.deepcopy(self.plan); change(p)
            with self.assertRaises(ValueError): validate_sql_plan(p)

    def test_policy_closure_only_changes_one_flag_on_fixed_actor(self):
        text = disable_policy_sql(self.plan)
        self.assertIn('SET universal_import_enabled=false WHERE actor_account_id=$1', text)
        self.assertIn(ACTOR, text)
        self.assertNotIn('DELETE ', text)
        self.assertNotIn('SET enabled=', text)
        self.assertNotIn('SET adoption_cutoff=', text)
        self.assertIn('UNIVERSAL_POLICY_DRIFT', text)

    def test_role_close_never_changes_catalog_and_rejects_foreign_sessions(self):
        text = close_roles_sql(self.plan)
        self.assertNotIn('otr_trip_publication_catalog_reader', text)
        self.assertEqual(text.count('ALTER ROLE '), 2)
        self.assertIn('UNIVERSAL_FOREIGN_SERVICE_SESSION', text)
        self.assertIn(self.plan['adminControl']['expiresAt'], text)

    def test_provider_never_activated_requires_no_mutation(self):
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(self.invoked, [])
        self.assertTrue(all(text.startswith('BEGIN READ ONLY;') for text in self.management_calls))

    def test_partial_setup_only_closes_receipted_active_states(self):
        self.active((0, 1, 2, 3))  # Account grant has not been installed.
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(self.invoked, [x['command']['request_id'] for x in self.plan['providerControl']['closeCommands'][1:]])
        count = len(self.invoked)
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(len(self.invoked), count)
        self.assertFalse(any('UPDATE public.flight_' in text for text in self.management_calls))

    def test_unknown_protected_command_reconciles_but_never_resends(self):
        self.active()
        def unknown(x):
            self.invoke(x)
            raise TimeoutError('PRIVATE_NOT_LOGGED')
        ports = create_sql_ports(self.plan, self.management, unknown, clock=lambda: 1792908800)
        ports['revoke_provider'](self.plan)
        self.assertEqual(len(self.invoked), 4)
        self.assertEqual(len(set(self.invoked)), 4)

    def test_unknown_without_receipt_stops_before_second_command(self):
        self.active()
        sent = []
        def unknown(x):
            sent.append(x)
            raise TimeoutError('PRIVATE_NOT_LOGGED')
        ports = create_sql_ports(self.plan, self.management, unknown, clock=lambda: 1792908800)
        with self.assertRaisesRegex(RuntimeError, 'UNKNOWN'): ports['revoke_provider'](self.plan)
        self.assertEqual(len(sent), 1)

    def test_unreceipted_or_foreign_state_never_invokes_admin(self):
        self.active(); self.observation['audits'] = []
        with self.assertRaisesRegex(ValueError, 'DRIFT'): self.ports['revoke_provider'](self.plan)
        self.assertEqual(self.invoked, [])
        self.observation['scopeState'] = 'DRIFT'
        with self.assertRaises(ValueError): self.ports['read_sql'](self.plan)

    def test_function_images_are_actual_proof_not_artifact_hash_assumptions(self):
        result = self.ports['read_sql'](self.plan)
        self.assertEqual(result['installedSqlHashes'], SQL_HASHES)
        self.metadata['functionHashes'][SOURCE_FUNCTIONS[0]] = 'c' * 64
        result = self.ports['read_sql'](self.plan)
        self.assertNotIn(next(iter(SQL_HASHES)), result['installedSqlHashes'])
        self.assertTrue(result['unexpectedAuthorityActive'])
        text = read_sql_metadata(self.plan)
        for name in ['pg_get_functiondef', 'aclexplode', 'rolpassword', 'pg_stat_activity']: self.assertIn(name, text)
        self.assertNotIn('SELECT rolpassword', text)

    def test_admin_closure_reuses_exact_grants_and_no_other_identity(self):
        self.ports['revoke_admin'](self.plan)
        text = self.management_calls[-1]
        for grant in self.plan['adminControl']['temporaryGrants']: self.assertIn(grant['admin_grant_id'], text)
        self.assertIn('ADMIN_FOREIGN_GRANT', text)
        self.assertEqual(self.ports['read_admin'](self.plan), {'permissionsActive': False, 'loginEnabled': False, 'sessions': 0})

    def renewal_plan(self):
        p = copy.deepcopy(self.plan)
        a = p['adminControl']
        a['grantRenewalPreimages'] = {}
        for g in a['temporaryGrants']:
            g.update(created_at='2026-10-25T05:40:00+00:00', grant_revision=3)
            a['grantRenewalPreimages'][g['permission']] = {**g, 'grant_revision': 2,
                'expires_at': '2026-10-25T05:55:00+00:00', 'revoked_at': '2026-10-25T05:50:00+00:00'}
        return p

    def test_exact_revoked_grants_renew_without_changing_authority_and_close_reuses_prior_cas(self):
        from universal_config_control import grant_preimage_sql, revoke_sql
        p = self.renewal_plan()
        validate_sql_plan(p)
        text = revoke_sql(p['adminControl'])
        for prior in p['adminControl']['grantRenewalPreimages'].values():
            self.assertIn(grant_preimage_sql(prior), text)
        self.assertNotIn('GRANT ', text)
        self.assertNotIn('otr_trip_publication_catalog_reader', text)

    def test_renewal_requires_both_exact_closed_preimages_and_odd_successor(self):
        mutations = [
            lambda a: a['grantRenewalPreimages'].pop('SECURITY_ADMIN'),
            lambda a: a['grantRenewalPreimages'].update(PRICE_WRITE={}),
            lambda a: a['grantRenewalPreimages'].update(CONFIG_ADMIN=None),
            lambda a: a['grantRenewalPreimages']['CONFIG_ADMIN'].update(grant_revision=3),
            lambda a: a['grantRenewalPreimages']['CONFIG_ADMIN'].update(grant_revision=2147483646),
            lambda a: a['grantRenewalPreimages']['CONFIG_ADMIN'].update(revoked_at=None),
            lambda a: a['grantRenewalPreimages']['CONFIG_ADMIN'].update(revoked_at='2026-10-25T06:01:00Z'),
            lambda a: a['grantRenewalPreimages']['CONFIG_ADMIN'].update(created_at='2026-10-25T05:51:00Z'),
            lambda a: a['grantRenewalPreimages']['CONFIG_ADMIN'].update(expires_at='2026-10-25T05:39:00Z'),
            lambda a: a['temporaryGrants'][0].update(grant_revision=1),
            lambda a: a['temporaryGrants'][0].update(admin_grant_id=str(uuid.uuid4())),
            lambda a: a['temporaryGrants'][0].update(created_by=str(uuid.uuid4())),
            lambda a: a['temporaryGrants'][0].update(created_at=a['startsAt']),
            lambda a: a['temporaryGrants'][0].update(expires_at='2026-10-25T06:16:00Z'),
        ]
        for change in mutations:
            p = self.renewal_plan()
            change(p['adminControl'])
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_sql_plan(p)

    def setup_provider_recovery(self, closed_revision=2):
        b = commands_fixture.CommandsTests(); b.setUp()
        partial, facts, auth = b.recovery_fixture()
        if closed_revision==4:
            r=partial['recoveryPreimages'];r['scope'].update(revision=4,integration_version=14);r['grant']['revision']=4
            r['integration']['config_version']=15;r['environment']['config_version']=15;facts.update(copy.deepcopy(r))
            self.plan['approvedResumeGateSHA256']=sha((Path(__file__).resolve().parents[2]/'docs/ops/universal-stage2-20261025/actual-execution/cleanup-20261026/STAGE_II_CONSOLIDATED_RESUME_GATE.md').read_bytes())
        self.plan.update(startsAt=partial['startsAt'], expiresAt=partial['expiresAt'], providerExpiresAt=partial['providerExpiresAt'], recoveryPreimages=partial['recoveryPreimages'])
        # The local Source/Runtime fixture uses the same scope identity as this plan.
        self.plan['scopeId'] = partial['scopeId']
        a = self.plan['adminControl']
        a.update(startsAt=self.plan['startsAt'], expiresAt=auth['expires_at'])
        a['role']['expiresAt'] = a['expiresAt']
        for g in a['temporaryGrants']: g.update(created_at=a['startsAt'], expires_at=a['expiresAt'])
        self.plan['providerControl'] = bind(self.plan, facts, auth, lambda table, row: 'd' * 64)
        self.observation = {'scopeState': 'PREVIOUS_CLOSED', 'grantState': 'PREVIOUS_CLOSED',
                            'integration': {'config_version': 13 if closed_revision==2 else 15, 'kill_switch': True},
                            'environment': {'config_version': 13 if closed_revision==2 else 15, 'kill_switch': True, 'runtime_enabled': False}, 'audits': []}
        self.ports = create_sql_ports(self.plan, self.management, self.invoke, clock=lambda: 1792922700)

    def test_post_cleanup_revision4_uses_own_new_receipts_and_exact_15_16_17_cas(self):
        self.setup_provider_recovery(4)
        validate_sql_plan(self.plan)
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(self.invoked,[])
        self.observation.update(scopeState='ACTIVE',grantState='ACTIVE')
        self.observation['integration'].update(config_version=16,kill_switch=False)
        self.observation['environment'].update(config_version=16,kill_switch=False)
        with self.assertRaises(ValueError):self.ports['read_sql'](self.plan)
        self.observation['audits']=[self.receipt(x) for x in self.plan['providerControl']['activationCommands']]
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(len(self.invoked),4)
        self.assertEqual(self.observation['integration']['config_version'],17)
        self.assertEqual(self.observation['scopeState'],'CLOSED')
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(len(self.invoked),4)

    def test_recovery_previous_closed_rows_need_no_new_receipt_or_mutation(self):
        self.setup_provider_recovery()
        validate_sql_plan(self.plan)
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(self.invoked, [])
        text = __import__('universal_continuous_sql_ports').observe_sql(self.plan)
        self.assertIn('PREVIOUS_CLOSED', text)
        self.assertIn(self.plan['recoveryPreimages']['scope']['scope_sha256'], text)
        self.observation['scopeState'] = 'ABSENT'
        with self.assertRaises(ValueError): self.ports['read_sql'](self.plan)

    def test_recovery_active_and_closed_states_require_own_new_receipts_and_monotonic_cas(self):
        self.setup_provider_recovery()
        activation = self.plan['providerControl']['activationCommands']
        self.observation.update(scopeState='ACTIVE', grantState='ACTIVE')
        self.observation['integration'].update(config_version=14, kill_switch=False)
        self.observation['environment'].update(config_version=14, kill_switch=False)
        with self.assertRaises(ValueError): self.ports['read_sql'](self.plan)
        self.observation['audits'] = [self.receipt(x) for x in activation]
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(len(self.invoked), 4)
        self.assertEqual(self.observation['scopeState'], 'CLOSED')
        self.assertEqual(self.observation['integration']['config_version'], 15)
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(len(self.invoked), 4)

    def test_recovery_partial_kill_activation_closes_only_receipted_changes(self):
        self.setup_provider_recovery()
        opening = self.plan['providerControl']['activationCommands'][0]
        self.observation['integration'].update(config_version=14, kill_switch=False)
        self.observation['audits'] = [self.receipt(opening)]
        self.ports['revoke_provider'](self.plan)
        self.assertEqual(self.invoked, [self.plan['providerControl']['closeCommands'][2]['command']['request_id']])
        p = copy.deepcopy(self.plan)
        p['providerControl']['scopeActiveRow']['account_daily'] = 3
        with self.assertRaises(ValueError): validate_sql_plan(p)

    def test_changed_plan_cannot_reuse_captured_ports(self):
        altered = copy.deepcopy(self.plan); altered['scopeId'] = str(uuid.uuid4())
        with self.assertRaisesRegex(ValueError, 'SEALED_PLAN'): self.ports['read_source'](altered)
        self.assertEqual(self.management_calls, [])


if __name__ == '__main__': unittest.main()


class ClosedSourceProbeTests(unittest.TestCase):
    def test_policy_closed_readback_never_requires_closed_authenticated_runtime(self):
        f=SqlPortsTests();f.setUp()
        self.addCleanup(f.doCleanups)
        def unavailable(_): raise RuntimeError('SOURCE_RUNTIME_CLOSED')
        ports=create_sql_ports(f.plan,f.management,f.invoke,normal_service_probe=unavailable)
        self.assertEqual(ports['read_source'](f.plan),{'policyEnabled':False,'normalServiceVerified':False})
        def active(query):
            if ' AS source;' in query:return [{'source':{'policyEnabled':True}}]
            return f.management(query)
        ports=create_sql_ports(f.plan,active,f.invoke,normal_service_probe=unavailable)
        with self.assertRaisesRegex(RuntimeError,'SOURCE_RUNTIME_CLOSED'):ports['read_source'](f.plan)
