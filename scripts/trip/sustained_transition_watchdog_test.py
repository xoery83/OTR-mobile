import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('watchdog', Path(__file__).with_name('sustained_transition_watchdog.py'))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class WatchTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.base = Path(self.folder.name)
        self.entry = self.base / 'root-close.py'
        self.entry.write_text('print(\'{"verified":true,"status":"CLOSED_VERIFIED"}\')\n')
        self.plan = {'approvedGateSHA256': m.GATE, 'actorId': m.ACTOR,
                     'adoptionCutoff': '2026-10-24T01:00:00Z', 'transitionId': '10000000-0000-4000-8000-000000000001',
                     'startsAt': '2026-10-24T01:00:00Z', 'expiresAt': '2026-10-24T01:15:00Z',
                     'closeCommand': {'argv': [sys.executable, str(self.entry)], 'entryFile': str(self.entry), 'entrySHA256': m.sha(self.entry.read_bytes())}}
        self.plan_file = self.base / 'input.json'
        self.plan_file.write_text(json.dumps(self.plan))
        self.run = self.base / 'run'
        self.digest = m.prepare(self.plan_file, self.run)
        self.expiry = m.instant(self.plan['expiresAt'])

    def marker(self, **change):
        value = {'status': 'SUSTAINED_HANDOFF_VERIFIED', 'planSHA256': self.digest,
                 'approvedGateSHA256': m.GATE, 'actorId': m.ACTOR,
                 'adoptionCutoff': self.plan['adoptionCutoff'], 'transitionId': self.plan['transitionId'],
                 'serviceAndPolicyVerified': True, **change}
        m.write_private(self.run / 'handoff.json', value)

    def test_default_prepare_private_no_execution(self):
        self.assertEqual(self.run.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.run / 'plan.json').stat().st_mode & 0o777, 0o600)
        self.assertFalse((self.run / 'watch-claimed.json').exists())

    def test_exact_handoff_retains_service_without_closure(self):
        self.marker()
        out = m.watch(self.run, self.digest, clock=lambda: self.expiry - 10, closer=lambda _: self.fail('no closure'))
        self.assertEqual(out['status'], 'SUSTAINED_HANDOFF_VERIFIED')
        self.assertEqual(out['closureAttempts'], 0)

    def test_timeout_closes_once(self):
        calls = []
        out = m.watch(self.run, self.digest, clock=lambda: self.expiry, closer=lambda p: calls.append(p) or True)
        self.assertEqual(len(calls), 1)
        self.assertEqual(out['status'], 'CLOSED_VERIFIED')
        with self.assertRaises(FileExistsError):
            m.watch(self.run, self.digest, clock=lambda: self.expiry, closer=lambda p: calls.append(p) or True)
        self.assertEqual(len(calls), 1)

    def test_foreign_marker_does_not_keep_service(self):
        self.marker(transitionId='wrong')
        now = [self.expiry - 1]
        out = m.watch(self.run, self.digest, clock=lambda: now[0], pause=lambda seconds: now.__setitem__(0, now[0] + seconds), closer=lambda _: True)
        self.assertEqual(out['status'], 'CLOSED_VERIFIED')

    def test_deadline_crossing_during_marker_read_closes_once(self):
        self.marker()
        times = iter([self.expiry - .001, self.expiry + .001, self.expiry + .001, self.expiry + .001, self.expiry + .001, self.expiry + .001])
        out = m.watch(self.run, self.digest, clock=lambda: next(times), pause=lambda _: None, closer=lambda _: True)
        self.assertEqual(out['status'], 'CLOSED_VERIFIED')
        self.assertEqual(out['closureAttempts'], 1)

    def test_late_marker_never_cancels_closure(self):
        self.marker()
        out = m.watch(self.run, self.digest, clock=lambda: self.expiry, closer=lambda _: True)
        self.assertEqual(out['closureAttempts'], 1)

    def test_failed_closure_has_no_retry_or_secret_output(self):
        calls = []
        def failed(_):
            calls.append(1)
            raise RuntimeError('SECRET_NOT_FOR_RECEIPT')
        out = m.watch(self.run, self.digest, clock=lambda: self.expiry, closer=failed)
        self.assertEqual(len(calls), 1)
        self.assertEqual(out['status'], 'RECONCILE_REQUIRED')
        self.assertNotIn('SECRET', json.dumps(out))

    def test_tampered_plan_or_entry_rejected(self):
        with self.assertRaisesRegex(ValueError, 'PLAN_HASH'):
            m.watch(self.run, 'wrong')
        self.entry.write_text('print("wrong")')
        with self.assertRaisesRegex(ValueError, 'ENTRY_HASH'):
            m.watch(self.run, self.digest)

    def test_bad_authority_window_shell_rejected(self):
        for change in ({'actorId': 'wrong'}, {'approvedGateSHA256': 'wrong'}, {'expiresAt': '2026-10-24T01:16:00Z'}, {'closeCommand': {**self.plan['closeCommand'], 'argv': ['/bin/sh', str(self.entry)]}}):
            with self.assertRaises(ValueError):
                m.validate({**self.plan, **change})

    def test_actual_local_child_result_is_strict(self):
        self.assertTrue(m.close_once(self.plan))
        self.entry.write_text('print(\'{"verified":false,"status":"CLOSED_VERIFIED"}\')\n')
        plan = {**self.plan, 'closeCommand': {**self.plan['closeCommand'], 'entrySHA256': m.sha(self.entry.read_bytes())}}
        self.assertFalse(m.close_once(plan))


if __name__ == '__main__':
    unittest.main()
