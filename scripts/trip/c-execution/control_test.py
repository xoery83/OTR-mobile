import datetime as dt, importlib.util, json, os, pathlib, tempfile, unittest
from unittest.mock import patch
import control

def plan():
 now=dt.datetime.now(dt.timezone.utc)
 p={'project':control.PROJECT,'image':control.IMAGE,'bundle':control.BUNDLE,'actorIds':{'A':'10000000-0000-4000-8000-000000000001','B':'10000000-0000-4000-8000-000000000002'},'startsAt':(now-dt.timedelta(seconds=1)).isoformat(),'expiresAt':(now+dt.timedelta(minutes=5)).isoformat(),'bodyHashes':{'create':control.PAYLOADS['create']['sha256Utf8'],'metadata':control.PAYLOADS['editProposal']['sha256Utf8'],'preview':control.PAYLOADS['currencyPreview']['sha256Utf8']},'ownerAuthorized':False,'baseline':{'marker':'never live'},'serviceHelperSHA256':'fixture'}
 p['windowId']=control.digest({k:p[k] for k in ['project','image','bundle','actorIds','startsAt','expiresAt','bodyHashes']});p['manifestSHA256']=control.digest(p);return p
class Tests(unittest.TestCase):
 def test_manifest_pins_recovery_and_scope(self):
  p=plan()
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d)/'plan.json';f.write_text(json.dumps(p));self.assertEqual(control.load_plan(f),p)
   p['baseline']['marker']='different';f.write_text(json.dumps(p))
   with self.assertRaises(AssertionError):control.load_plan(f)
 def test_strict_closed_boolean(self):
  for result,expected in [({'rows':[{'closed':True}]},'CLOSED_VERIFIED'),({'rows':[{'closed':False}],'unrelated':True},'RECONCILE_REQUIRED'),({'rows':[{'closed':True},{'closed':True}]},'RECONCILE_REQUIRED'),({'some':True},'RECONCILE_REQUIRED')]:
   with tempfile.TemporaryDirectory() as d:
    os.chmod(d,0o700);op=control.Operator(plan(),d,lambda s:result);op.service=lambda *a,**k:{'verified':True};self.assertEqual(op.close()['status'],expected)
 def test_failed_sql_never_restores_other_scope(self):
  with tempfile.TemporaryDirectory() as d:
   op=control.Operator(plan(),d,lambda s:(_ for _ in ()).throw(RuntimeError('scope drift')));op.service=lambda *a: self.fail('must not restore another scope');self.assertEqual(op.close()['status'],'RECONCILE_REQUIRED')
 def test_termination_precedes_gate_update_and_only_two_roles(self):
  with tempfile.TemporaryDirectory() as d:
   text=control.Operator(plan(),d).close_sql();self.assertLess(text.index('pg_terminate_backend'),text.index('UPDATE public.trip_create_activation_gate'));self.assertIn('backend_start >=',text);self.assertIn('C_WINDOW_SCOPE_DRIFT',text);self.assertNotIn('DELETE',text);self.assertNotIn('REVOKE',text);self.assertNotIn('otr_trip_core',text)
 def test_inactive_plan_cannot_activate(self):
  with tempfile.TemporaryDirectory() as d:
   op=control.Operator(plan(),d)
   with self.assertRaises(AssertionError):op.activation_sql('create','synthetic')
if __name__=='__main__':unittest.main()
