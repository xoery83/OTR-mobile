import json
import tempfile
import unittest
from pathlib import Path
from read_recovery_allowance import reserve, LIMIT


class AllowanceTests(unittest.TestCase):
    def test_persist_and_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            for i in range(LIMIT):
                self.assertEqual(reserve(path, 'CORE_RESULT'), i + 1)
            before = (path / 'operator-read-ledger.json').read_bytes()
            with self.assertRaisesRegex(ValueError, 'EXHAUSTED'):
                reserve(path, 'CORE_RESULT')
            self.assertEqual(before, (path / 'operator-read-ledger.json').read_bytes())

    def test_lock_or_bad_identity_is_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            (path / 'operator-read.lock').write_text('')
            with self.assertRaises(FileExistsError):
                reserve(path, 'CORE_RESULT')
            (path / 'operator-read.lock').unlink()
            (path / 'operator-read-ledger.json').write_text(json.dumps({'runId': 'foreign', 'maximum': 24}))
            with self.assertRaisesRegex(ValueError, 'IDENTITY'):
                reserve(path, 'CORE_RESULT')

    def test_corrupt_ledger_and_unknown_purpose_are_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            (path / 'operator-read-ledger.json').write_text('bad json')
            with self.assertRaises(ValueError):
                reserve(path, 'CORE_RESULT')
            with self.assertRaisesRegex(ValueError, 'PURPOSE'):
                reserve(path, 'anything')

    def test_universal_append_cap_and_policy_fence(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            for ordinal in range(1, 33):
                self.assertEqual(reserve(path, 'SOURCE_RESULT', 'UNIVERSAL_20261025'), ordinal)
            before = (path / 'operator-read-ledger.json').read_bytes()
            with self.assertRaisesRegex(ValueError, 'EXHAUSTED'):
                reserve(path, 'TASK_RESULT', 'UNIVERSAL_20261025')
            with self.assertRaisesRegex(ValueError, 'IDENTITY'):
                reserve(path, 'CORE_RESULT')
            with self.assertRaisesRegex(ValueError, 'PURPOSE'):
                reserve(path, 'CORE_RESULT', 'UNIVERSAL_20261025')
            self.assertEqual(before, (path / 'operator-read-ledger.json').read_bytes())
