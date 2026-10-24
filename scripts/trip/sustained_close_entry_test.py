import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('close_entry', Path(__file__).with_name('sustained_close_entry.py'))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
ROOT = Path('/private/tmp/otr-universal-coordinator-integration-20261024')


class ClosureTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.base = Path(self.folder.name)
        service = ROOT / 'scripts/trip/c-execution/service.py'
        runtime = ROOT / 'docs/ops/trip-p1-sustained-sync-20261024/receipts/APPROVED_RUNTIME_MOUNT_PLAN_ATTEMPT2.json'
        self.config = {'project': m.PROJECT, 'actorId': m.watch.ACTOR, 'adoptionCutoff': m.CUTOFF,
                       'approvedGateSHA256': m.watch.GATE, 'transitionId': '10000000-0000-4000-8000-000000000001',
                       'gatePath': str(ROOT / 'docs/ops/trip-p1-sustained-sync-20261024/OWNER_EXECUTION_GATE.md'),
                       'rendererPath': str(Path(m.renderer.__file__).resolve()), 'rendererSHA256': m.watch.sha(Path(m.renderer.__file__).read_bytes()),
                       'servicePath': str(service), 'serviceSHA256': m.watch.sha(service.read_bytes()),
                       'dependencyHashes': {'control.py': m.watch.sha(service.with_name('control.py').read_bytes()),
                                            'metadata_closed_retry.py': m.watch.sha((ROOT / 'scripts/dev/metadata_closed_retry.py').read_bytes())},
                       'runtimePlanPath': str(runtime), 'runtimePlanSHA256': m.watch.sha(runtime.read_bytes())}
        self.source = self.base / 'config.json'
        self.source.write_text(json.dumps(self.config))
        self.run = self.base / 'run'
        self.digest = m.prepare(self.source, self.run)

    def test_prepare_reads_only_public_plans_no_execution(self):
        self.assertEqual((self.run / 'close-plan.json').stat().st_mode & 0o777, 0o600)
        self.assertFalse((self.run / 'close-claimed.json').exists())

    def test_close_then_independent_verify_then_restore(self):
        calls = []
        def sql(text, _):
            calls.append('verify' if 'closed_verified' in text else 'close')
            return [{'closed_verified': True}]
        out = m.execute(self.run, self.digest, sql=sql, restore=lambda *_: calls.append('restore') or True)
        self.assertEqual(calls, ['close', 'verify', 'restore'])
        self.assertEqual(out['status'], 'CLOSED_VERIFIED')
        self.assertTrue(out['verified'])
        self.assertFalse(m.execute(self.run, self.digest, sql=lambda *_: self.fail('no retry'), restore=lambda *_: self.fail('no retry'))['verified'])

    def test_unknown_sql_never_retried_or_claimed_closed(self):
        calls = []
        def sql(*_):
            calls.append(1)
            raise RuntimeError('PRIVATE_NOT_TO_RETURN')
        out = m.execute(self.run, self.digest, sql=sql, restore=lambda *_: self.fail('no restore before verified SQL'))
        self.assertEqual(calls, [1])
        self.assertEqual(out['status'], 'RECONCILE_REQUIRED')
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_false_sql_verification_stops_restore(self):
        out = m.execute(self.run, self.digest, sql=lambda *_: [{'closed_verified': False}], restore=lambda *_: self.fail('no restore'))
        self.assertEqual(out['stage'], 'INDEPENDENT_SQL_VERIFY')
        self.assertFalse(out['verified'])

    def test_restore_failure_reports_reconcile_once(self):
        calls = []
        out = m.execute(self.run, self.digest, sql=lambda *_: [{'closed_verified': True}], restore=lambda *_: calls.append(1) or False)
        self.assertEqual(calls, [1])
        self.assertEqual(out['stage'], 'RUNTIME_RESTORE')
        self.assertFalse(out['verified'])

    def test_plan_hash_or_actual_cutoff_drift(self):
        out = m.execute(self.run, 'wrong', sql=lambda *_: self.fail('no SQL'))
        self.assertFalse(out['verified'])
        with self.assertRaisesRegex(ValueError, 'CUTOFF'):
            m.validate({**self.config, 'adoptionCutoff': '2026-10-24T00:00:00Z'})

    def test_service_or_runtime_file_hash_drift(self):
        for key in ('serviceSHA256', 'runtimePlanSHA256'):
            with self.assertRaisesRegex(ValueError, 'FILE_BINDING'):
                m.validate({**self.config, key: '0' * 64})


if __name__ == '__main__':
    unittest.main()
