import copy
import datetime
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('retry',Path(__file__).with_name('metadata_closed_retry.py')); retry=importlib.util.module_from_spec(spec);spec.loader.exec_module(retry)
SECRET='SYNTHETIC_PRIVATE_MOUNT_SECRET'
class RetryTests(unittest.TestCase):
 def test_redaction_all_channels_and_escaped_secret(self):
  before={'OTR_SECRET_KEY':'env"secret\\private','PUBLIC':'unchanged'}
  snapshot={'Image':'sha256:synthetic','Config':{'Env':['OTR_SECRET_KEY=newsecret']},'State':{'Error':before['OTR_SECRET_KEY'],'Health':{'Log':[{'Output':'{"password": "'+SECRET+'"} Bearer token-private'}]}}}
  output=retry.diagnostics(snapshot,'\'apiKey\': \''+SECRET+'\'\nnewsecret',before,b'private-key')
  text=json.dumps(output);self.assertNotIn(SECRET,text);self.assertNotIn('newsecret',text);self.assertNotIn('env\\"secret',text);self.assertNotIn('token-private',text)
  self.assertEqual(output['environment']['changedKeys'],['OTR_SECRET_KEY','PUBLIC'])
 def test_default_prepare_never_ssh(self):
  with tempfile.TemporaryDirectory() as d:
   gate=Path(d)/'gate.json';gate.write_text(json.dumps({'project':retry.PROJECT,'beforeImage':retry.OLD_IMAGE,'phaseCAllowed':False,'candidateImage':'sha256:proposal','ownerAuthorizedBOnly':False}))
   r=subprocess.run(['python3',str(Path(retry.__file__)),'--gate',str(gate)],capture_output=True,text=True);self.assertEqual(r.returncode,0);self.assertEqual(json.loads(r.stdout)['status'],'PREPARED_NOT_EXECUTED')
 def run_fixture(self, failure=None, modern=False):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);config=p/'old.yml';config.write_text('unchanged')
   custody=b'{"expiresAt":"2026-10-17T08:33:27.096Z"}'
   if failure=='custody-active':custody=b'{"expiresAt":"2027-10-17T08:33:27.096Z"}'
   env={'OTR_DEV_SUPABASE_URL':'https://tuqigdxrvrerfewsxqgm.supabase.co','OTR_DEV_FLIGHT_ONE_SHOT':'disabled','OTR_DEV_FLIGHT_REMOTE_TRANSPORT':'disabled','OTR_DEV_SOURCE_PDF2_TRANSPORT':'CLOSED','OTR_SECRET_KEY':'env-secret-private'}
   old={'Image':retry.OLD_IMAGE,'Config':{'Env':[k+'='+v for k,v in env.items()],'User':'otr','Cmd':['node','server.mjs'],'Labels':{'com.docker.compose.project.config_files':str(config)}},'State':{'Status':'running','Health':{'Status':'healthy','Log':[{'Output':'{"token":"'+SECRET+'"}'}]}},'Mounts':[{'Source':'a','Destination':'/run/otr/capture-custody.json','RW':False},{'Source':'b','Destination':'/run/otr/catalog-reader.json','RW':False},{'Source':'c','Destination':'/var/lib/otr/capture-custody','RW':True}],'HostConfig':{'NetworkMode':'host'}}
   candidate=copy.deepcopy(old);candidate['Image']='sha256:'+'a'*64;candidate['Config']['Env'].reverse();candidate['Config']['Cmd']=['node','server-capture.mjs']
   if failure=='unhealthy':candidate['State']['Health']['Status']='unhealthy'
   if modern:
    old['Config']['Cmd']=['node','server-capture.mjs']
    old['HostConfig']['Mounts']=[{'Target':'/a','ReadOnly':True},{'Target':'/b','ReadOnly':False}]
    candidate['HostConfig']['Mounts']=copy.deepcopy(list(reversed(old['HostConfig']['Mounts'])))
    if failure=='host-change':candidate['HostConfig']['Mounts'][0]['ReadOnly']=True
   state={'current':old};events=[];base={'image':old['Image'],'command':old['Config']['Cmd'],'volumes':['same']}
   now=datetime.datetime.now(datetime.timezone.utc)
   gate={'beforeImage':old['Image'],'candidateImage':candidate['Image'],'beforeEnvironmentSHA256':hashlib.sha256(json.dumps(env,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'beforeConfigFiles':[str(config)],'beforeConfigHashes':{str(config):hashlib.sha256(config.read_bytes()).hexdigest()},'releaseDirectory':str(p/'release'),'beforeBundleSHA256':hashlib.sha256(b'bundle').hexdigest(),'bundleSHA256':hashlib.sha256(b'bundle').hexdigest(),'expectedCustodySHA256':hashlib.sha256(custody).hexdigest(),'startsAt':(now-datetime.timedelta(seconds=30)).isoformat(),'expiresAt':(now+datetime.timedelta(minutes=5)).isoformat()}
   if modern:
    gate.update(semanticHostConfig=True,minimumServiceChangeReserveSeconds=240,expectedHostConfig=copy.deepcopy(old['HostConfig']),expectedUser='otr',expectedMounts=sorted((m['Source'],m['Destination'],m['RW']) for m in old['Mounts']),beforeBundlePath='/app/server-capture.mjs',rollbackCommand=['node','server-capture.mjs'],resolveComposeInterpolation=True,verifyProtectedRoutes=True,protectedRoutes=[['/protected-'+str(i),{}] for i in range(5)])
    if failure=='reserve':gate['expiresAt']=(now+datetime.timedelta(seconds=120)).isoformat()
   if failure=='window':gate['expiresAt']=(now-datetime.timedelta(seconds=1)).isoformat()
   original_read=Path.read_bytes;original_write=Path.write_text
   def read(path):return custody if str(path)=='/opt/otr/dev-backend/env/capture-custody.json' else original_read(path)
   def write(path,value,*args,**kwargs):
    if path.name=='candidate-diagnostic.json':
     events.append('persist-diagnostic')
     if failure=='persist':raise OSError('synthetic write failure')
    return original_write(path,value,*args,**kwargs)
   def output(args,**kwargs):
    if args[:2]==['docker','inspect']:return json.dumps([state['current']])
    if args[:3]==['docker','image','inspect']:return json.dumps([{'Id':candidate['Image']}])
    if args[:2]==['docker','exec']:
     if modern:self.assertEqual(args[-1],'/app/server-capture.mjs')
     return b'bundle'
    if 'config' in args:
     result=copy.deepcopy(base)
     if any('forward.closed' in str(v) for v in args):result.update(image=candidate['Image'],command=candidate['Config']['Cmd'])
     return json.dumps({'services':{'backend':result}})
    raise AssertionError(args)
   def run(args,**kwargs):
    if args[:2]==['docker','logs']:
     events.append('read-logs')
     if failure=='logs':raise TimeoutError('synthetic')
     return subprocess.CompletedProcess(args,0,'{"password":"'+SECRET+'"} env-secret-private','')
    rollback=any('rollback.closed' in str(v) for v in args);events.append('rollback' if rollback else 'deploy');state['current']=old if rollback else candidate
    if failure=='up-timeout' and not rollback:raise subprocess.TimeoutExpired(args,25)
    return subprocess.CompletedProcess(args,1 if rollback and failure=='rollback' else 0,'','')
   def urlopen(request,*args,**kwargs):
    if isinstance(request,retry.urllib.request.Request):raise retry.urllib.error.HTTPError(request.full_url,403 if failure=='route' else 401,'synthetic',{},None)
    return io.StringIO('{"status":"ok","environment":"development"}')
   with patch.object(retry.subprocess,'check_output',side_effect=output),patch.object(retry.subprocess,'run',side_effect=run),patch.object(retry.time,'sleep'),patch.object(retry.time,'monotonic',side_effect=iter(range(0,1000,50))),patch.object(retry.urllib.request,'urlopen',side_effect=urlopen),patch.object(Path,'read_bytes',read),patch.object(Path,'write_text',write):
    if failure in ('window','custody-active','reserve'):
     with self.assertRaises(AssertionError):retry.remote_deploy(gate)
     self.assertEqual(events,[]);return
    receipt=retry.remote_deploy(gate)
   self.assertNotIn(SECRET,json.dumps(receipt));self.assertNotIn('env-secret-private',json.dumps(receipt))
   return receipt,events
 def test_modern_capture_baseline_and_mount_order_only(self):
  r,e=self.run_fixture(modern=True);self.assertEqual(r['status'],'CLOSED_DEPLOY_PASS');self.assertNotIn('rollback',e)
 def test_modern_mount_value_change_rolls_back_capture_entry(self):
  r,e=self.run_fixture('host-change',modern=True);self.assertEqual(r['status'],'B_FAILED_ROLLED_BACK');self.assertTrue(r['rollbackVerified']);self.assertLess(e.index('read-logs'),e.index('rollback'))
 def test_modern_protected_route_failure_rolls_back(self):
  r,e=self.run_fixture('route',modern=True);self.assertEqual(r['status'],'B_FAILED_ROLLED_BACK');self.assertTrue(r['rollbackVerified'])
 def test_modern_240_second_reserve_before_mutation(self):self.run_fixture('reserve',modern=True)
 def test_success_normalized_env_and_complete_diagnostics(self):
  r,e=self.run_fixture();self.assertEqual(r['status'],'CLOSED_DEPLOY_PASS');self.assertTrue(r['diagnosticsCapturedBeforeRollback']);self.assertTrue(r['candidate']['environment']['equal']);self.assertNotIn('rollback',e)
 def test_failure_capture_persist_precedes_verified_rollback(self):
  r,e=self.run_fixture('unhealthy');self.assertEqual(r['status'],'B_FAILED_ROLLED_BACK');self.assertLess(e.index('persist-diagnostic'),e.index('rollback'));self.assertTrue(r['rollbackVerified'])
 def test_log_capture_failure_rolls_back_and_never_passes(self):
  r,e=self.run_fixture('logs');self.assertEqual(r['status'],'B_FAILED_ROLLED_BACK');self.assertFalse(r['diagnosticsCapturedBeforeRollback']);self.assertLess(e.index('read-logs'),e.index('rollback'))
 def test_diagnostic_persist_failure_rolls_back_even_if_health_was_good(self):
  r,e=self.run_fixture('persist');self.assertEqual(r['status'],'B_FAILED_ROLLED_BACK');self.assertFalse(r['diagnosticsCapturedBeforeRollback']);self.assertIn('rollback',e)
 def test_expired_remote_window_blocks_before_service_mutation(self):self.run_fixture('window')
 def test_replaced_active_custody_blocks_before_service_mutation(self):self.run_fixture('custody-active')
 def test_up_timeout_still_captures_and_rolls_back(self):
  r,e=self.run_fixture('up-timeout');self.assertEqual(r['status'],'B_FAILED_ROLLED_BACK');self.assertLess(e.index('persist-diagnostic'),e.index('rollback'))
if __name__=='__main__':unittest.main()
