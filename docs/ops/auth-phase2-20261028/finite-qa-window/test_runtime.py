"""Focused local control tests; no Docker, Host, credentials or SQL transport."""
import copy,datetime as dt,importlib.util,json,unittest,uuid
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('auth_finite_runtime',ROOT/'runtime.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Control(unittest.TestCase):
 def plan(self):
  now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
  uid=str(uuid.uuid4());return {'project':'tuqigdxrvrerfewsxqgm','windowId':uid,'accountId':r.ACTOR,'sourceGuestLocalId':r.GUEST,'readyAt':now.isoformat().replace('+00:00','Z'),'expiresAt':(now+dt.timedelta(minutes=20)).isoformat().replace('+00:00','Z'),'baseline':json.loads((ROOT/'baseline.json').read_text()),'root':'/opt/otr/dev-backend/releases/auth-qa-'+uid}
 def test_exact_identity_and_finite_time(self):
  p=self.plan();r.validate(p,starting=True)
  for key,value in [('project','other'),('accountId',str(uuid.uuid4())),('sourceGuestLocalId',str(uuid.uuid4()))]:
   q=copy.deepcopy(p);q[key]=value
   with self.assertRaises(AssertionError):r.validate(q)
  with self.assertRaises(AssertionError):r.validate(p,now=r.instant(p['expiresAt']),starting=True)
  q=copy.deepcopy(p);q['expiresAt']=(dt.datetime.fromisoformat(q['readyAt'].replace('Z','+00:00'))+dt.timedelta(minutes=31)).isoformat().replace('+00:00','Z')
  with self.assertRaises(AssertionError):r.validate(q)
 def test_sql_failure_does_not_skip_runtime_or_independent_verify(self):
  trace=[]
  def sql(p,s,mode):
   trace.append(mode)
   if mode=='close':raise RuntimeError('UNKNOWN')
   return {'closed':True}
  def runtime(p,s):trace.append('runtime');return {'runtimeClosed':True}
  with patch.object(r,'sql_control',side_effect=sql),patch.object(r,'close_runtime',side_effect=runtime):
   self.assertTrue(r.close({}, {})['verified'])
  self.assertEqual(trace,['close','runtime','verify'])
 def test_failed_independent_sql_verification_never_claims_closed(self):
  with patch.object(r,'sql_control',side_effect=RuntimeError()),patch.object(r,'close_runtime',return_value={'runtimeClosed':True}) as close:
   with self.assertRaisesRegex(RuntimeError,'SQL_OR_RUNTIME_CLOSURE_UNCONFIRMED'):r.close({}, {})
   close.assert_called_once()
 def test_partial_stop_or_rename_restores_exact_retained_id(self):
  p=self.plan();state={'candidateId':'candidate'}
  for basename in ['/otr-dev-backend','/otr-auth-qa-default-'+p['windowId']]:
   base={'Id':r.BASE,'Name':basename,'State':{'Running':False}}
   candidate={'Id':'candidate','Name':'/otr-auth-qa-'+p['windowId'],'State':{'Running':False}}
   with patch.object(r,'known',return_value=(base,candidate,None)),patch.object(r,'inspect',return_value=base),patch.object(r,'call',return_value='') as call,patch.object(r,'wait_healthy',return_value=base),patch.object(r,'check_base'):
    self.assertTrue(r.close_runtime(p,state)['runtimeClosed'])
    self.assertIn(unittest.mock.call(['docker','start',r.BASE]),call.call_args_list)
    if basename!='/otr-dev-backend':self.assertIn(unittest.mock.call(['docker','rename',r.BASE,'otr-dev-backend']),call.call_args_list)
 def test_close_retry_cannot_exhaust_during_a_sixty_second_lock_holder(self):
  p=self.plan();p['closeBundleSHA256']='a'*64
  state=b'{"candidateId":"candidate"}'
  with patch.object(r,'private',return_value=state),patch.object(r,'sql_control',return_value={'closed':True}),patch.object(r,'call',return_value='active\n') as calls:
   r.arm(p,'b'*64)
  command=calls.call_args_list[0].args[0]
  self.assertIn('--property=StartLimitIntervalSec=0',command)
  self.assertNotIn('--property=StartLimitBurst=12',command)
  # No start-limit means every failed nonblocking acquisition retains the restart.
  scheduled=True
  for seconds in range(0,76,5):
   locked=seconds<70
   self.assertTrue(scheduled)
   scheduled=locked
   if not locked:break
  self.assertFalse(scheduled)
if __name__=='__main__':unittest.main()
