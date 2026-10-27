import json,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
from universal_scope_close import SqlTransport

class SafeDiagnosticTests(unittest.TestCase):
 def test_rejected_sql_never_retains_secret_echo(self):
  cases=[('duplicate key value violates unique constraint "external_integration_admin_grants_pkey"','SQL_DUPLICATE_KEY'),('permission denied for function','SQL_PERMISSION_REJECTED'),('FINITE_CLOSED_PREIMAGE_DRIFT','SQL_GUARD_REJECTED'),('connection timed out','TRANSPORT_UNKNOWN')]
  for message,category in cases:
   with self.subTest(category=category),tempfile.TemporaryDirectory() as d:
    result=types.SimpleNamespace(returncode=1,stderr=message+" SQL ALTER ROLE password 'SECRET_PRIVATE_PASSWORD'",stdout='PRIVATE_BEARER')
    with patch('universal_scope_close.subprocess.run',return_value=result):
     with self.assertRaisesRegex(RuntimeError,category):SqlTransport('/cli','/cwd',d)("ALTER ROLE password 'SECRET_PRIVATE_PASSWORD'")
    files=list(Path(d).iterdir());self.assertEqual(len(files),1)
    body=files[0].read_text();self.assertNotIn('SECRET_PRIVATE_PASSWORD',body);self.assertNotIn('PRIVATE_BEARER',body)
    self.assertEqual(json.loads(body)['category'],category);self.assertEqual(files[0].stat().st_mode&0o777,0o600)
 def test_success_is_unchanged_no_error_artifact(self):
  with tempfile.TemporaryDirectory() as d,patch('universal_scope_close.subprocess.run',return_value=types.SimpleNamespace(returncode=0,stdout='{"rows":[{"ok":true}]}')):
   self.assertEqual(SqlTransport('/cli','/cwd',d)('SELECT true'),{'rows':[{'ok':True}]});self.assertEqual(list(Path(d).iterdir()),[])
if __name__=='__main__':unittest.main()
