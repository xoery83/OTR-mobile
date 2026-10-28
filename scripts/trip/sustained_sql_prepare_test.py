import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('sustained_sql_prepare', Path(__file__).with_name('sustained_sql_prepare.py'))
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
ACTOR = '10000000-0000-4000-8000-000000000001'
CUTOFF = '2026-10-24T00:00:00.000Z'


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.gate = Path(self.folder.name) / 'approved-gate.md'
        self.gate.write_text(module.PROJECT + '\n' + '\n'.join(module.FILES.values()))
        self.gate_hash = module.sha(self.gate.read_bytes())

    def bind(self, actor=ACTOR, cutoff=CUTOFF):
        return module.binding(actor, cutoff, self.gate, self.gate_hash)

    def test_exact_reviewed_sql_hashes(self):
        self.assertEqual(self.bind()['sqlHashes'], module.FILES)

    def test_foreign_or_modified_gate_rejected(self):
        self.gate.write_text('wrong project')
        with self.assertRaisesRegex(ValueError, 'GATE_HASH'):
            self.bind()

    def test_matching_hash_but_wrong_scope_rejected(self):
        self.gate.write_text('wrong project')
        self.gate_hash = module.sha(self.gate.read_bytes())
        with self.assertRaisesRegex(ValueError, 'GATE_ARTIFACT_SCOPE'):
            self.bind()

    def test_sql_drift_rejected(self):
        with patch.dict(module.FILES, {'20261024000300_trip_person_cloud_create.sql': '0' * 64}):
            self.gate.write_text(module.PROJECT + '\n' + '\n'.join(module.FILES.values()))
            self.gate_hash = module.sha(self.gate.read_bytes())
            with self.assertRaisesRegex(ValueError, 'SQL_ARTIFACT'):
                self.bind()

    def test_uuid_injection_and_non_utc_rejected(self):
        with self.assertRaises(ValueError):
            self.bind(actor=ACTOR + "';DROP ROLE postgres;--")
        with self.assertRaises(ValueError):
            self.bind(cutoff='2026-10-24T00:00:00+13:00')

    def test_install_is_one_atomic_transaction_and_retains_preimages(self):
        sql = module.render(self.bind())['install.sql']
        self.assertEqual(sql.count('BEGIN;'), 1)
        self.assertEqual(sql.count('COMMIT;'), 1)
        self.assertIn('c493b32972679e7aba510132103b0dd9', sql)
        self.assertIn('INSTALL_REQUIRES_STOPPED_SERVICE', sql)
        self.assertNotIn('ALTER ROLE otr_trip_create_gateway LOGIN', sql)

    def test_activation_is_bound_and_secret_free(self):
        sql = module.render(self.bind())['activate.sql']
        self.assertIn(ACTOR, sql)
        self.assertIn(CUTOFF, sql)
        self.assertEqual(sql.count('LOGIN CONNECTION LIMIT 1'), 4)
        self.assertIn('ACTIVATION_POSTIMAGE_DRIFT', sql)
        self.assertIn('PRIVATE_SERVICE_CREDENTIALS_REQUIRED', sql)
        self.assertNotIn(' PASSWORD ', sql)
        self.assertNotIn('expires_at=', sql)
        self.assertNotIn('trip_id=', sql)
        self.assertNotIn('GRANT ', sql)

    def test_cli_only_prepares_private_files_and_never_overwrites(self):
        import contextlib
        import io
        output = Path(self.folder.name) / 'packet'
        args = ['prepare', '--actor', ACTOR, '--adoption-cutoff', CUTOFF, '--gate', str(self.gate), '--approved-gate-sha', self.gate_hash, '--output', str(output)]
        with patch('sys.argv', args), contextlib.redirect_stdout(io.StringIO()):
            module.main()
        self.assertEqual(output.stat().st_mode & 0o777, 0o700)
        for file in output.iterdir():
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
        self.assertIn('PREPARED_NOT_EXECUTED', (output / 'manifest.json').read_text())
        with patch('sys.argv', args), self.assertRaises(FileExistsError):
            module.main()

    def test_closure_preserves_business_and_requires_independent_verification(self):
        packet = module.render(self.bind())
        sql = packet['close.sql']
        self.assertEqual(sql.count(' NOLOGIN;'), 4)
        self.assertIn('pg_terminate_backend', sql)
        self.assertIn('CLOSURE_SCOPE_DRIFT', sql)
        self.assertNotIn('DELETE ', sql)
        self.assertNotIn('DROP ', sql)
        self.assertIn('closed_verified', packet['verify-closed.sql'])
        self.assertIn('BEGIN READ ONLY', packet['verify-closed.sql'])


if __name__ == '__main__':
    unittest.main()
