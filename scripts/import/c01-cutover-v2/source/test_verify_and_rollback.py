import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import verify_and_rollback as runner


class Ledger:
    plan = {"T": 1, "host": {"baselineCID": "baseline"}, "verification": {"hardEnd": 500, "keeperAt": 100}}

    def __init__(self):
        self.rows = {}
        self.events = []
        self.pending = set()

    def verify_ledger(self):
        if self.pending:
            raise ValueError("VERIFY_RECONCILE_ONLY")

    def claim(self, action):
        self.pending.add(action)
        self.events.append(action)

    def finish(self, action):
        self.pending.remove(action)
        self.rows[action + ".receipt"] = True

    def read(self, path):
        return self.rows.get(path)

    def write(self, path, row):
        self.rows[path] = row

    def receipt(self, action):
        return self.read(action + ".receipt")


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.journal = Ledger()
        self.host = SimpleNamespace(
            preflight=lambda: True, fence=lambda: True, verify_fence=lambda: True,
            drain=lambda: True, verify_preserved=lambda _: True, reverse=lambda: True,
            verify_preimage=lambda: True, verify_restored_read=lambda: True, ops=SimpleNamespace(running_baseline=lambda: True),
        )
        self.pg = SimpleNamespace(verify=lambda *_: True, apply=lambda *_: True)

    def run_role(self, role, at=None):
        with patch.object(runner.time, "time", return_value=at or (10 if role == "dispatch" else 120)):
            return runner.execute(self.journal, self.host, self.pg, role)

    def test_only_validation_actions_and_reversal(self):
        self.assertEqual(self.run_role("dispatch"), "VERIFIED_AND_RESTORED")
        self.assertEqual(self.journal.events, ["host-fence", "pg-fence", "host-reverse", "pg-reverse"])
        self.assertEqual(self.run_role("keeper"), "ALREADY_TERMINAL")
        for action in ("stage-candidate", "stop-baseline", "v5-forward", "v5-inverse"):
            with self.assertRaisesRegex(ValueError, "VERIFY_ACTION_NOT_ALLOWED"):
                runner.VerificationWriter._verify_record(action, "a" * 64)

    def test_read_timeout_restores_known_controls(self):
        def timed_out():
            raise subprocess.TimeoutExpired("observer", 5)

        self.host.drain = timed_out
        self.assertEqual(self.run_role("dispatch"), "RESTORED_PROOF_INCOMPLETE")
        self.assertEqual(self.journal.events[-2:], ["host-reverse", "pg-reverse"])

    def test_keeper_due_and_terminal_requires_restored_old_read(self):
        with self.assertRaisesRegex(ValueError, "VERIFY_ROLE_NOT_DUE"):
            self.run_role("keeper", at=10)
        self.host.verify_restored_read = lambda: False
        with self.assertRaisesRegex(ValueError, "VERIFY_RESTORATION_UNPROVED"):
            self.run_role("dispatch")
        self.assertNotIn("verify-terminal.json", self.journal.rows)
        self.host.verify_restored_read = lambda: True
        self.assertEqual(self.run_role("keeper"), "VERIFIED_AND_RESTORED")
        self.assertEqual(len(self.journal.events), 4)

    def test_unknown_write_stops_dispatch_and_keeper(self):
        self.pg.apply = lambda *_: False
        with self.assertRaisesRegex(ValueError, "VERIFY_ACTION_OUTCOME_UNPROVED"):
            self.run_role("dispatch")
        with self.assertRaisesRegex(ValueError, "VERIFY_RECONCILE_ONLY"):
            self.run_role("keeper")
        self.assertEqual(self.journal.events, ["host-fence", "pg-fence"])


if __name__ == "__main__":
    unittest.main()
