"""Finite controller regressions; no DEV mutation, network or Provider."""
import importlib.util,json,os,pathlib,signal,subprocess,sys,tempfile,time,unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
PACKET=pathlib.Path(__file__).resolve().parent
def module(name):
 spec=importlib.util.spec_from_file_location(name,PACKET/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
C=module('p2_review_execution')
CLOSED={'enabled':False,'scope':None,'airportsEnabled':0}
class ControllerTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='otr-p2-control-test-');self.root=pathlib.Path(self.temp.name)
 def tearDown(self):self.temp.cleanup()
 def test_postgres_alias_is_quoted(self):
  def sql(text):
   # PostgreSQL folds an unquoted alias; this failed against actual DEV before repair.
   key='airportsEnabled' if 'AS "airportsEnabled"' in text else 'airportsenabled'
   return {'rows':[{'enabled':False,'scope':None,key:0}]}
  self.assertEqual(C.observe(sql),CLOSED)
 def test_close_is_idempotent_and_receipt_only_after_verification(self):
  with patch.object(C,'transport',return_value=lambda _: {'rows':[CLOSED]}),patch.object(C,'remote',return_value={'status':'ROLLBACK_VERIFIED'}) as remote:
   first=C.close(self.root);self.assertEqual(C.close(self.root),first);self.assertEqual(remote.call_count,1)
 def test_sql_exception_never_claims_closed(self):
  with patch.object(C,'transport',return_value=lambda _: (_ for _ in ()).throw(TimeoutError())),patch.object(C,'remote') as remote:
   with self.assertRaises(TimeoutError):C.close(self.root)
   self.assertFalse((self.root/'closed.json').exists());remote.assert_not_called()
 def test_mismatched_readback_never_claims_closed(self):
  with patch.object(C,'transport',return_value=lambda _: {'rows':[{**CLOSED,'airportsEnabled':1}]}),patch.object(C,'remote') as remote:
   with self.assertRaisesRegex(ValueError,'CLOSURE_UNCONFIRMED'):C.close(self.root)
   remote.assert_not_called();self.assertFalse((self.root/'closed.json').exists())
 def test_runtime_failure_can_reconcile_without_new_window(self):
  with patch.object(C,'transport',return_value=lambda _: {'rows':[CLOSED]}),patch.object(C,'remote',side_effect=[TimeoutError(),{'status':'ROLLBACK_VERIFIED'}]):
   with self.assertRaises(TimeoutError):C.close(self.root)
   self.assertFalse((self.root/'closed.json').exists())
   self.assertEqual(C.close(self.root)['policy'],CLOSED)
 def test_unknown_activation_is_not_reissued(self):
  C.write(self.root,'watch-claimed.json',{})
  scope=json.loads((PACKET/'P2_REVIEW_SCOPE.json').read_text());t=time.time()
  plan={'closeAt':t+2700,'deadline':t+3600,'expiresAt':C.iso(t+3600),'scope':scope}
  with patch.object(C,'transport',return_value=lambda _: (_ for _ in ()).throw(TimeoutError())):
   with self.assertRaises(TimeoutError):C.activate(self.root,plan)
   with self.assertRaises(FileExistsError):C.activate(self.root,plan)
  self.assertTrue((self.root/'activation-claimed.json').exists())
 def test_no_activation_without_cleanup_reserve(self):
  with self.assertRaisesRegex(ValueError,'CLOSURE_RESERVE'):C.activate(self.root,{'closeAt':time.time()+200})
 def test_detached_watch_survives_parent_sigterm(self):
  # Exercise the real watch loop in another session, with only its close I/O replaced.
  child=self.root/'child.py'
  child.write_text("import sys,importlib.util,pathlib,json,time\nsys.dont_write_bytecode=True\nspec=importlib.util.spec_from_file_location('c',"+repr(str(PACKET/'p2_review_execution.py'))+");c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)\nr=pathlib.Path("+repr(str(self.root))+")\nc.close=lambda root:c.write(root,'closed.json',{'test':True})\nc.watch(r,{'closeAt':time.time()+1.5,'deadline':time.time()+5})\n")
  parent=self.root/'parent.py'
  parent.write_text("import subprocess,sys,time\np=subprocess.Popen([sys.executable,"+repr(str(child))+"],start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\nprint(p.pid,flush=True)\ntime.sleep(30)\n")
  proc=subprocess.Popen([sys.executable,str(parent)],stdout=subprocess.PIPE,text=True)
  pid=int(proc.stdout.readline());proc.terminate();proc.wait(timeout=3);proc.stdout.close()
  until=time.monotonic()+5
  while time.monotonic()<until and not (self.root/'closed.json').exists():time.sleep(.1)
  self.assertTrue((self.root/'watch-claimed.json').exists())
  self.assertEqual(json.loads((self.root/'closed.json').read_text()),{'test':True})
 def test_runtime_rollback_default_and_active(self):
  r=module('p2_review_runtime');r.ROOT=self.root
  for active in (False,True):
   old={'Id':'old','Name':'/previous' if active else '/otr-dev-backend','Image':'image','State':{'Running':not active,'Status':'exited' if active else 'running','Health':{'Status':'healthy'}}}
   new={'Id':'new','Name':'/otr-dev-backend' if active else '/candidate','Image':'image','State':{'Running':active,'Status':'running' if active else 'created'}}
   states={'old':old,'new':new};calls=[]
   def call(*args):
    calls.append(args)
    if args[1]=='stop':states[args[-1]]['State'].update(Running=False,Status='exited')
    if args[1]=='rename':states[args[2]]['Name']='/'+args[3]
    if args[1]=='start':states[args[2]]['State'].update(Running=True,Status='running')
    return b''
   with patch.object(r,'snap',side_effect=lambda i:states[i]),patch.object(r,'check'),patch.object(r,'call',side_effect=call):
    result=r.rollback({'originalContainerId':'old','candidateContainerId':'new'})
   self.assertEqual(result['status'],'ROLLBACK_VERIFIED');self.assertFalse(new['State']['Running']);self.assertTrue(old['State']['Running'])
   if active:self.assertEqual(calls[0],('docker','stop','--time','10','new'))
   else:self.assertEqual(calls,[])
 def test_closed_runtime_read_requires_no_window_or_approval(self):
  import contextlib,io
  r=module('p2_review_runtime');r.ROOT=self.root;(self.root/'plan.json').write_text('{}')
  with patch.object(sys,'argv',['operator.py','closed']),patch.object(r,'verify_closed',return_value={'status':'DEFAULT_CLOSED_VERIFIED'}),contextlib.redirect_stdout(io.StringIO()) as out:r.main()
  self.assertEqual(json.loads(out.getvalue())['status'],'DEFAULT_CLOSED_VERIFIED')
  self.assertFalse((self.root/'window.json').exists())
 def test_remote_watch_retries_transient_rollback_failure(self):
  r=module('p2_review_runtime');r.ROOT=self.root
  (self.root/'plan.json').write_text('{}');(self.root/'window.json').write_text(json.dumps({'deadline':time.time()+600}))
  real_open=os.open
  def local_lock(path,*args,**kwargs):
   return real_open(self.root/'runtime.lock' if path=='/run/lock/otr-universal-finite-service.lock' else path,*args,**kwargs)
  with patch.object(sys,'argv',['operator.py','watch']),patch.object(r.time,'sleep'),patch.object(r.os,'open',side_effect=local_lock),patch.object(r,'rollback',side_effect=[TimeoutError(),{'status':'ROLLBACK_VERIFIED'}]) as rollback:
   r.main()
  self.assertEqual(rollback.call_count,2)
  self.assertEqual(json.loads((self.root/'watchdog-final.json').read_text())['status'],'ROLLBACK_VERIFIED')
 def test_runtime_stop_failure_does_not_claim_recovery(self):
  r=module('p2_review_runtime');r.ROOT=self.root
  old={'Id':'old','Name':'/previous','State':{'Running':False,'Status':'exited'}}
  new={'Id':'new','Name':'/otr-dev-backend','State':{'Running':True,'Status':'running'}}
  with patch.object(r,'snap',side_effect=lambda i:old if i=='old' else new),patch.object(r,'check'),patch.object(r,'call',side_effect=TimeoutError()):
   with self.assertRaises(TimeoutError):r.rollback({'originalContainerId':'old','candidateContainerId':'new'})
  self.assertFalse(old['State']['Running'])
if __name__=='__main__':unittest.main()
