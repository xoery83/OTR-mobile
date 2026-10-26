"""Isolated no-network orchestration fixtures. Not DEV/closure/E2E receipts."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('continuous_transition', Path(__file__).with_name('universal_continuous_transition.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class TransitionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.plan = {
            'version': 1, 'actorId': m.ACTOR, 'project': m.PROJECT,
            'approvedGateSHA256': m.GATE, 'approvedAmendmentSHA256': m.AMENDMENT, 'sqlHashes': dict(m.SQL_HASHES),
            'transitionId': '10000000-0000-4000-8000-000000000001', 'scopeId': '10000000-0000-4000-8000-000000000002',
            'startsAt': '2026-10-25T06:00:00Z', 'expiresAt': '2026-10-25T06:15:00Z', 'providerExpiresAt': '2026-11-01T06:00:00Z',
            'sourceMeterBaseline': dict.fromkeys(m.ROLES, False),
            'sourceMeterSessionBaseline': dict.fromkeys(m.ROLES, 0),
            'catalogBaseline': {'login': True, 'connectionLimit': 1, 'validUntil': '2027-01-09T02:03:36.084144Z', 'credentialSHA256': 'a' * 64},
            'runtime': {'container': 'otr-dev-backend', 'imageId': m.IMAGE, 'baselineImageId': m.BASE_IMAGE,
                        'originalContainerId': 'b' * 64, 'backupContainerName': 'otr-universal-original-10000000-0000-4000-8000-000000000001',
                        'baselineConfigSHA256': 'c' * 64, 'baselineHostConfigSHA256': 'd' * 64,
                        'baselineMountsSHA256': 'e' * 64, 'activeConfigSHA256': 'f' * 64, 'activeHostConfigSHA256': '1'*64, 'activeMountsSHA256': '2'*64, 'stagedContainerId': '3'*64},
            'budget': {'callsPerUtcDay': 2, 'callCostNanos': '50000000', 'dailyCostNanos': '100000000', 'totalCostNanos': '1000000000'},
        }
        self.run = Path(self.tmp.name) / 'run'
        self.digest = m.prepare(self.plan, self.run)
        self.calls = []
        self.source = {'policyEnabled': True, 'normalServiceVerified': True}
        self.sql = {'providerScopeActive': True, 'providerGrantActive': True, 'sourceMeterLogins': dict.fromkeys(m.ROLES, True),
                    'sourceMeterSessions': dict.fromkeys(m.ROLES, 1), 'catalog': copy.deepcopy(self.plan['catalogBaseline']),
                    'installedSqlHashes': dict(m.SQL_HASHES), 'unexpectedAuthorityActive': False, 'sourceMeterRestricted': True}
        self.admin = {'permissionsActive': True, 'loginEnabled': True, 'sessions': 1}
        self.runtime = {'imageId': m.IMAGE, 'healthy': True, 'configSHA256': self.plan['runtime']['activeConfigSHA256'], 'hostConfigSHA256': self.plan['runtime']['activeHostConfigSHA256'], 'mountsSHA256': self.plan['runtime']['activeMountsSHA256'], 'containerId': self.plan['runtime']['stagedContainerId']}
        self.budget = {'scopeId': self.plan['scopeId'], 'expiresAt': self.plan['providerExpiresAt'],
                       'bounds': self.plan['budget'], 'sourceAndUsageBindingVerified': True}
        def action(name, change):
            def execute(plan):
                self.assertEqual(plan, self.plan)
                self.calls.append(name)
                change()
            return execute
        def restore():
            self.runtime = {'containerId': self.plan['runtime']['originalContainerId'], 'imageId': m.BASE_IMAGE,
                            'configSHA256': self.plan['runtime']['baselineConfigSHA256'], 'hostConfigSHA256': self.plan['runtime']['baselineHostConfigSHA256'],
                            'mountsSHA256': self.plan['runtime']['baselineMountsSHA256'], 'healthy': True}
        self.ports = {
            'disable_policy': action('policy', lambda: self.source.update(policyEnabled=False)),
            'revoke_provider': action('provider', lambda: self.sql.update(providerScopeActive=False, providerGrantActive=False)),
            'revoke_admin': action('admin', lambda: self.admin.update(permissionsActive=False, loginEnabled=False, sessions=0)),
            'close_source_meter': action('roles', lambda: self.sql.update(sourceMeterLogins=dict.fromkeys(m.ROLES, False), sourceMeterSessions=dict.fromkeys(m.ROLES, 0))),
            'restore_retained': action('runtime', restore),
            'read_source': lambda _: copy.deepcopy(self.source), 'read_sql': lambda _: copy.deepcopy(self.sql),
            'read_admin': lambda _: copy.deepcopy(self.admin), 'read_runtime': lambda _: copy.deepcopy(self.runtime),
            'read_budget': lambda _: copy.deepcopy(self.budget),
        }
        self.end = m.instant(self.plan['expiresAt'])

    def test_close_only_rescue_requires_four_fresh_strict_booleans(self):
        self.ports['revoke_provider'] = lambda _: None
        self.ports['rescue_cleanup'] = lambda _: {'status':'CLOSED_VERIFIED','checks':dict.fromkeys(['source','sql','admin','runtime'],True)}
        result=m.close_transition(self.plan,self.run,self.ports)
        self.assertEqual(result['status'],'CLOSED_VERIFIED')
        self.assertIn('security_close_contingency',[x['step'] for x in result['steps']])

    def test_close_only_rescue_status_or_truthy_values_are_not_proof(self):
        self.ports['revoke_provider'] = lambda _: None
        self.ports['rescue_cleanup'] = lambda _: {'status':'CLOSED_VERIFIED','checks':dict.fromkeys(['source','sql','admin','runtime'],1)}
        result=m.close_transition(self.plan,self.run,self.ports)
        self.assertEqual(result['status'],'RECONCILE_REQUIRED')

    def test_provider_window_can_narrow_but_never_extend_or_expire(self):
        p = copy.deepcopy(self.plan)
        p['providerExpiresAt'] = '2026-10-31T06:00:00Z'
        m.validate(p)
        for end in ['2026-11-02T06:00:00Z', p['startsAt']]:
            p['providerExpiresAt'] = end
            with self.assertRaises(ValueError): m.validate(p)

    def test_prepare_is_private_and_has_zero_transport(self):
        self.assertEqual(self.calls, [])
        self.assertEqual((self.run / 'plan.json').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.run.stat().st_mode & 0o777, 0o700)

    def test_rejects_scope_hash_role_catalog_budget_and_long_window(self):
        for field, value in [('actorId', 'wrong'), ('project', 'production'), ('approvedAmendmentSHA256', '0' * 64),
                             ('sqlHashes', {}), ('sourceMeterBaseline', dict.fromkeys(m.ROLES, True)),
                             ('catalogBaseline', {**self.plan['catalogBaseline'], 'login': False}),
                             ('sourceMeterSessionBaseline', dict.fromkeys(m.ROLES, 1)),
                             ('budget', {**self.plan['budget'], 'callsPerUtcDay': 3}), ('expiresAt', '2026-10-25T06:16:00Z')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                m.validate({**self.plan, field: value})

    def test_timeout_closes_in_order_and_every_component_is_read_back(self):
        result = m.watch(self.run, self.digest, self.ports, clock=lambda: self.end)
        self.assertEqual(result['status'], 'CLOSED_VERIFIED')
        self.assertEqual(self.calls, ['policy', 'provider', 'admin', 'roles', 'runtime'])
        self.assertEqual(self.sql['catalog'], self.plan['catalogBaseline'])
        with self.assertRaises(FileExistsError):
            m.watch(self.run, self.digest, self.ports, clock=lambda: self.end)
        self.assertEqual(len(self.calls), 5)

    def test_unknown_mutation_is_reconciled_without_retry(self):
        underlying = self.ports['disable_policy']
        def unknown(plan):
            underlying(plan)
            raise TimeoutError('PRIVATE_TRANSPORT_VALUE')
        self.ports['disable_policy'] = unknown
        result = m.close_transition(self.plan, self.run, self.ports)
        self.assertEqual(result['status'], 'CLOSED_VERIFIED')
        self.assertEqual(self.calls.count('policy'), 1)
        self.assertEqual(result['steps'][0]['outcome'], 'UNKNOWN')
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_unconfirmed_policy_still_closes_other_capabilities_but_does_not_restore(self):
        self.ports['disable_policy'] = lambda _: self.calls.append('policy')
        result = m.close_transition(self.plan, self.run, self.ports)
        self.assertEqual(result['status'], 'RECONCILE_REQUIRED')
        self.assertEqual(self.calls, ['policy', 'provider', 'admin', 'roles'])

    def test_catalog_drift_blocks_restore_and_never_calls_a_catalog_mutator(self):
        self.sql['catalog']['login'] = False
        result = m.close_transition(self.plan, self.run, self.ports)
        self.assertEqual(result['status'], 'RECONCILE_REQUIRED')
        self.assertNotIn('runtime', self.calls)
        self.assertFalse(any('catalog' in name for name in self.calls))

    def test_runtime_unknown_success_requires_independent_exact_restore(self):
        underlying = self.ports['restore_retained']
        def unknown(plan):
            underlying(plan)
            raise TimeoutError('UNKNOWN_RESTORE')
        self.ports['restore_retained'] = unknown
        self.assertEqual(m.close_transition(self.plan, self.run, self.ports)['status'], 'CLOSED_VERIFIED')
        self.assertEqual(self.calls.count('runtime'), 1)

    def test_runtime_health_without_baseline_identity_is_not_a_restore(self):
        self.ports['restore_retained'] = lambda _: self.calls.append('runtime')
        self.assertEqual(m.close_transition(self.plan, self.run, self.ports)['status'], 'RECONCILE_REQUIRED')
        with self.assertRaises(FileExistsError):
            m.close_transition(self.plan, self.run, self.ports)
        self.assertEqual(self.calls.count('runtime'), 1)

    def test_verified_handoff_preserves_normal_service_after_admin_closes(self):
        self.admin.update(permissionsActive=False, loginEnabled=False, sessions=0)
        m.handoff(self.plan, self.run, self.ports, clock=lambda: self.end - 1)
        result = m.watch(self.run, self.digest, self.ports, clock=lambda: self.end - 1)
        self.assertEqual(result['status'], 'SUSTAINED_HANDOFF_VERIFIED')
        self.assertEqual(self.calls, [])

    def test_actual_driver_audit_does_not_overwrite_handoff_marker(self):
        import ast, contextlib, io, os, time
        driver = Path(__file__).parents[2] / 'docs/ops/universal-stage2-20261025/actual-execution/continuous-recovery/EXECUTION_DRIVER.py'
        body = ast.parse(driver.read_text())
        function = next(n for n in body.body if isinstance(n, ast.FunctionDef) and n.name == 'record')
        namespace = {'run': self.run, 'canonical': m.canonical, 'json': json, 'os': os, 'time': time}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(driver), 'exec'), namespace)
        self.admin.update(permissionsActive=False, loginEnabled=False, sessions=0)
        marker = m.handoff(self.plan, self.run, self.ports, clock=lambda: self.end - 1)
        with contextlib.redirect_stdout(io.StringIO()):
            namespace['record']('handoff', marker)
        now = [self.end - 1]
        result = m.watch(self.run, self.digest, self.ports, clock=lambda: now[0],
                         pause=lambda seconds: now.__setitem__(0, now[0] + seconds))
        self.assertEqual(result['status'], 'SUSTAINED_HANDOFF_VERIFIED')
        self.assertEqual(self.calls, [])
        self.assertEqual(json.loads((self.run / 'handoff.json').read_text()), marker)

    def test_marker_at_or_after_deadline_does_not_cancel_closure(self):
        self.admin.update(permissionsActive=False, loginEnabled=False, sessions=0)
        m.handoff(self.plan, self.run, self.ports, clock=lambda: self.end - 1)
        self.assertEqual(m.watch(self.run, self.digest, self.ports, clock=lambda: self.end)['status'], 'CLOSED_VERIFIED')

    def test_handoff_rejects_each_wrong_running_container_host_or_mount_pin(self):
        self.admin.update(permissionsActive=False, loginEnabled=False, sessions=0)
        for key in ['containerId', 'hostConfigSHA256', 'mountsSHA256']:
            prior = self.runtime[key]
            self.runtime[key] = '0' * 64
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'HANDOFF_NOT_VERIFIED'):
                m.handoff(self.plan, self.run, self.ports, clock=lambda: self.end - 1)
            self.assertFalse((self.run / 'handoff.json').exists())
            self.runtime[key] = prior

    def test_handoff_rejects_live_admin_or_bad_budget(self):
        with self.assertRaisesRegex(ValueError, 'NOT_VERIFIED'):
            m.handoff(self.plan, self.run, self.ports, clock=lambda: self.end - 1)
        self.admin.update(permissionsActive=False, loginEnabled=False, sessions=0)
        self.budget['bounds'] = {**self.plan['budget'], 'callsPerUtcDay': 3}
        with self.assertRaisesRegex(ValueError, 'NOT_VERIFIED'):
            m.handoff(self.plan, self.run, self.ports, clock=lambda: self.end - 1)

    def test_marker_does_not_override_later_permission_revocation(self):
        self.admin.update(permissionsActive=False, loginEnabled=False, sessions=0)
        m.handoff(self.plan, self.run, self.ports, clock=lambda: self.end - 1)
        self.sql['providerGrantActive'] = False
        now = [self.end - 1]
        result = m.watch(self.run, self.digest, self.ports, clock=lambda: now[0], pause=lambda seconds: now.__setitem__(0, now[0] + seconds))
        self.assertEqual(result['status'], 'CLOSED_VERIFIED')
        self.assertEqual(self.calls, ['policy', 'provider', 'admin', 'roles', 'runtime'])

    def test_unknown_readback_cannot_produce_closed_verified(self):
        def unavailable(_):
            raise TimeoutError('PRIVATE_READER_DETAIL')
        self.ports['read_admin'] = unavailable
        result = m.close_transition(self.plan, self.run, self.ports)
        self.assertEqual(result['status'], 'RECONCILE_REQUIRED')
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_close_and_handoff_are_bound_to_prepared_plan(self):
        other = copy.deepcopy(self.plan)
        other['scopeId'] = '10000000-0000-4000-8000-000000000003'
        with self.assertRaisesRegex(ValueError, 'PREPARED_PLAN_MISMATCH'):
            m.close_transition(other, self.run, self.ports)
        with self.assertRaisesRegex(ValueError, 'PREPARED_PLAN_MISMATCH'):
            m.handoff(other, self.run, self.ports, clock=lambda: self.end - 1)
        self.assertEqual(self.calls, [])

    def test_restoration_delegates_to_existing_retained_container_helper(self):
        call, check = object(), object()
        with patch.object(m._runtime, 'restore_retained', return_value=None) as restore:
            m.restore_with_existing(self.plan, call, check, read_only=True)
            restore.assert_called_once_with(self.plan, call, check, True)

    def test_false_role_and_zero_session_proofs_are_strictly_typed(self):
        self.ports['close_source_meter'] = lambda _: self.sql.update(sourceMeterLogins=dict.fromkeys(m.ROLES, 0), sourceMeterSessions=dict.fromkeys(m.ROLES, False))
        result = m.close_transition(self.plan, self.run, self.ports)
        self.assertEqual(result['status'], 'RECONCILE_REQUIRED')
        self.assertNotIn('runtime', self.calls)


if __name__ == '__main__':
    unittest.main()
