"""Mock IO only; execute actual close_current -> restore entry -> retained helper.
Run after Auth updates both entry/pin: python ... --expect-fixed.
No Docker/SSH/service/filesystem mutations occur in the fixture.
"""
import copy,hashlib,importlib.util,io,json,os,runpy,stat,subprocess,sys,types,unittest
from contextlib import ExitStack,redirect_stdout
from pathlib import Path
from unittest.mock import patch
import config_cas as cas
import test_protocol as base
HERE=Path(__file__).parent
FIXED='--expect-fixed' in sys.argv
if FIXED:sys.argv.remove('--expect-fixed')
CLOSE=Path(os.environ.get('OTR_TEST_CLOSE_ENTRY',str(HERE/'close_current.py')))
RESTORE=Path(os.environ.get('OTR_TEST_RESTORE_ENTRY',str(HERE/'restore.py')))
HELPER=HERE/'universal_runtime_close.py'

class RestoreEntry(unittest.TestCase):
 def execute(self,drift=False,normalized=True):
  f=base.Fixture('EMPTY');original=f.snap[base.DEFAULT]
  original['Name']='/'+f.backup;original['State']['Running']=False;original['State']['Status']='exited'
  original['HostConfig']['OomKillDisable']=None
  conf=copy.deepcopy(original['Config']);conf['Env'].append(cas.WRITE+'='+f.g['authQaConfig'])
  active=base.snapshot(base.NEW,'otr-dev-backend',conf)
  active['HostConfig']=copy.deepcopy(original['HostConfig']);active['HostConfig']['OomKillDisable']=False if normalized else None
  if drift:active['HostConfig']['NetworkMode']='unapproved-other-network'
  f.snap[base.NEW]=active
  plan={'beforeContainerId':base.DEFAULT,'beforeImage':base.IMAGE,'candidateImage':base.IMAGE,
   'beforeConfigSHA256':cas.digest(original['Config']),'expectedConfigSHA256':cas.digest(conf),
   'expectedHostConfig':copy.deepcopy(original['HostConfig']),'expectedMounts':cas.mounts(original),
   'beforeConfigHashes':{},'mountedFileHashes':{},'restoreHelperSHA256':hashlib.sha256(HELPER.read_bytes()).hexdigest(),'backupName':f.backup}
  raw=(json.dumps(plan,sort_keys=True)+'\n').encode();sha=hashlib.sha256(raw).hexdigest()
  pointer=json.dumps({'gateSHA256':cas.GATE,'windowId':base.WINDOW,'currentContainerId':base.NEW,'planSHA256':sha,'deadlineMs':base.NOW+1000}).encode()
  fake=base.DIRECTORY;restore_bytes=RESTORE.read_bytes();helper_bytes=HELPER.read_bytes()
  def filebytes(path):
   if path==fake/'deploy-plan.json':return raw
   if path==fake/'close-current.json':return pointer
   if path==fake/'restore.py':return restore_bytes
   if path==fake/'universal_runtime_close.py':return helper_bytes
   raise AssertionError('UNEXPECTED_FILE_READ')
  original_spec=importlib.util.spec_from_file_location
  def load_spec(name,path,*a,**kw):
   assert Path(path)==fake/'universal_runtime_close.py'
   return original_spec(name,HELPER,*a,**kw)
  calls=[]
  def child(args,**kwargs):
   self.assertEqual(args,[sys.executable,str(fake/'restore.py'),str(fake/'deploy-plan.json'),sha,base.NEW])
   calls.append('ACTUAL_RESTORE_ENTRY')
   try:
    with patch.object(sys,'argv',args[1:]):runpy.run_path(str(RESTORE),run_name='__main__')
   except SystemExit as error:
    if error.code:raise subprocess.CalledProcessError(error.code,args)
   return types.SimpleNamespace(returncode=0)
  stdout=io.StringIO();error=None
  with ExitStack() as st:
   st.enter_context(patch.object(cas,'private',filebytes));st.enter_context(patch.object(Path,'read_bytes',filebytes))
   st.enter_context(patch.object(Path,'lstat',lambda p:types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_uid=0,st_nlink=1,st_size=len(raw))))
   st.enter_context(patch.object(importlib.util,'spec_from_file_location',load_spec))
   st.enter_context(patch.object(subprocess,'run',child));st.enter_context(patch.object(subprocess,'check_output',lambda args,**kw:f.call(args)))
   st.enter_context(patch('os.open',return_value=999));st.enter_context(patch('os.fstat',return_value=types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_uid=0,st_nlink=1)))
   st.enter_context(patch('os.close'));st.enter_context(patch('fcntl.flock'))
   st.enter_context(patch.object(sys,'argv',[str(CLOSE),str(fake)]));st.enter_context(redirect_stdout(stdout))
   try:runpy.run_path(str(CLOSE),run_name='__main__')
   except (subprocess.CalledProcessError,SystemExit,AssertionError) as e:error=e
  return f,error,calls,stdout.getvalue()
 def test_actual_close_pointer_and_restore_entry(self):
  f,error,calls,out=self.execute()
  self.assertEqual(calls,['ACTUAL_RESTORE_ENTRY'])
  if FIXED:
   self.assertIsNone(error,out);self.assertEqual(f.inspect('otr-dev-backend')['Id'],base.DEFAULT)
   self.assertNotIn(base.NEW,f.snap);self.assertIsNone(f.inspect(base.DEFAULT)['HostConfig']['OomKillDisable'])
   self.assertNotIn(cas.WRITE,cas.environment(f.inspect(base.DEFAULT)))
  else:
   self.assertIsNotNone(error,'OLD_RESTORE_UNEXPECTEDLY_ACCEPTED')
   self.assertEqual(f.inspect('otr-dev-backend')['Id'],base.NEW)
   self.assertFalse(any(a[:2]==('docker','stop') for a in f.trace))
 def test_unchanged_host_passes_actual_entry_trust_checks(self):
  f,error,calls,out=self.execute(normalized=False)
  self.assertIsNone(error,out);self.assertEqual(calls,['ACTUAL_RESTORE_ENTRY'])
  self.assertEqual(f.inspect('otr-dev-backend')['Id'],base.DEFAULT);self.assertNotIn(base.NEW,f.snap)
 def test_other_host_drift_never_accepted(self):
  f,error,_,out=self.execute(True)
  self.assertIsNotNone(error,out);self.assertEqual(f.inspect('otr-dev-backend')['Id'],base.NEW)
  self.assertFalse(any(a[:2]==('docker','stop') for a in f.trace))

if __name__=='__main__':unittest.main()
