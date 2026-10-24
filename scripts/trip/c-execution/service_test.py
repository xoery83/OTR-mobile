"""Service transport/host simulation only. Never contacts Docker/SSH/DEV."""
import copy, datetime, hashlib, json, os, pathlib, subprocess, tempfile, time, types, unittest, urllib.request
from unittest.mock import patch
import service, control
from control_test import plan

class Tests(unittest.TestCase):
 def fixture(self,action='activate',wrong_mount=False,health_failure=False,diagnostic_failure=False,exited=False,wait_expiry=False,persist_failure=False,nonalphabetical=False,bad_ca=False,bad_second=False,broken_second=False,sustained=False,bad_runtime=False,mount_order=False):
  temporary=tempfile.TemporaryDirectory();root=pathlib.Path(temporary.name)
  p=plan();p['ownerAuthorized']=True;p['payloads']=control.PAYLOADS
  p['databaseCA']=pathlib.Path(__file__).with_name('supabase-prod-ca-2021.crt').read_text()
  if bad_ca:p['databaseCA']='untrusted peer certificate'
  runtime_config={'version':3,'enabled':True,**{key:{'host':'db.tuqigdxrvrerfewsxqgm.supabase.co','port':5432,'database':'postgres','password':'SYNTHETIC_PRIVATE_RUNTIME_SECRET_'+key,'ca':p['databaseCA']}for key in ('tripPg','metadataPg','corePg','personPg')}}
  if sustained:
   p.update(runtimeKind='SUSTAINED_TRIP_P1',approvedGateSHA256='0f6c8bf72e41c17a939424cbf821770ac355b7b235ce300abbb7eb6e46058bf0',sustainedRuntimeSHA256=hashlib.sha256(json.dumps(runtime_config,sort_keys=True,separators=(',',':')).encode()).hexdigest())
   if bad_runtime: runtime_config['personPg']['host']='foreign.invalid'
  if wait_expiry:p['expiresAt']=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=.1)).isoformat()
  composeCalls=0
  mounts=[{'source':'/fixture/a','destination':'/run/otr/catalog-reader.json','rw':False},{'source':'/fixture/b','destination':'/run/otr/capture-custody.json','rw':False},{'source':'/fixture/c','destination':'/var/lib/otr/capture-custody','rw':True}]
  env={'OTR_DEV_SUPABASE_URL':'https://tuqigdxrvrerfewsxqgm.supabase.co','A_SECRET':'fixture-env-secret'}
  hc={'Binds':['a','b','c'],'NetworkMode':'host','Mounts':[{'Source':m['source'],'Target':m['destination'],'ReadOnly':not m['rw'],'Type':'bind'}for m in mounts]};basefile=root/('z-base.yml'if nonalphabetical else'base.yml');basefile.write_text('fixture baseline')
  basefiles=[basefile]
  if nonalphabetical:
   override=root/'a-last-override.yml';override.write_text('fixture override');basefiles.append(override)
  custody=root/'custody.json';custody.write_text(json.dumps({'expiresAt':'2020-01-01T00:00:00Z'}))
  realhash=hashlib.sha256
  p['baseline']={'mounts':mounts,'hostConfig':hc,'environmentSHA256':'cf397ec1ef52c1960f2dfc2a13dd45f4f4a43309d95a3254fe429dde05f9854f','custodySHA256':realhash(custody.read_bytes()).hexdigest(),'configHashes':{str(f):realhash(f.read_bytes()).hexdigest()for f in sorted(basefiles)},'composeFiles':[str(f)for f in basefiles]}
  base={'image':control.IMAGE,'command':['node','server-capture.mjs'],'volumes':[{'source':m['source'],'target':m['destination'],'read_only':not m['rw']} for m in mounts]}
  state={'Image':control.IMAGE,'Config':{'User':'otr','Cmd':['node','server-capture.mjs'],'Env':[k+'='+v for k,v in env.items()],'Labels':{'com.docker.compose.project.config_files':','.join(str(f)for f in basefiles)}},'Mounts':[{'Source':m['source'],'Destination':m['destination'],'RW':m['rw']} for m in mounts],'HostConfig':hc,'State':{'Status':'running','Running':True,'Health':{'Status':'healthy'}}}
  if mount_order:state['HostConfig']={**hc,'Mounts':list(reversed(copy.deepcopy(hc['Mounts'])))}
  prefix='/opt/otr/dev-backend/env/c-finite-'+p['windowId']; remote_root=root/'finite'
  def path(v):
   text=str(v)
   if text=='/run/lock/otr-c-finite-service.lock':return root/'service.lock'
   if text.startswith(prefix):return pathlib.Path(str(remote_root)+text[len(prefix):])
   if text=='/opt/otr/dev-backend/env/capture-custody.json':return custody
   return pathlib.Path(v)
  def sha(v=b''):
   fake={json.dumps(env,sort_keys=True,separators=(',',':')).encode():'cf397ec1ef52c1960f2dfc2a13dd45f4f4a43309d95a3254fe429dde05f9854f',json.dumps(hc,sort_keys=True,separators=(',',':')).encode():('2ea3f3786cae510e0c6b4f8509df83d8a1afd612d72fc8ab7ace2f3f9d9a0d6a'if sustained else'f07262129504a60512ee369db9ac89f3cc666c473f68e7128b4ecfa8c66142e0'),b'fixture bundle':control.BUNDLE}
   return types.SimpleNamespace(hexdigest=lambda:fake[v]) if v in fake else realhash(v)
  def output(args,**kw):
   if args[:2]==['docker','inspect']:return json.dumps([state])
   if args[:2]==['docker','exec']:
    if state['State']['Status']=='exited':raise RuntimeError('cannot exec stopped container')
    return b'fixture bundle'
   if 'config' in args:
    assert '--no-env-resolution'in args and '--no-interpolate'not in args
    files=[args[i+1] for i,x in enumerate(args) if x=='-f'];assert files[:len(basefiles)]==[str(f)for f in basefiles]
    rendered=copy.deepcopy(base)
    files=[args[i+1] for i,x in enumerate(args) if x=='-f']
    if len(files)>len(basefiles):rendered['volumes']+=json.loads(path(files[-1]).read_text())['services']['backend']['volumes']
    return json.dumps({'services':{'backend':rendered}}).encode()
   raise AssertionError(args)
  def run(args,**kw):
   nonlocal composeCalls
   if args[:2]==['docker','logs'] and diagnostic_failure:raise RuntimeError('fixture diagnostic failure')
   if args[:2]==['docker','logs']:return subprocess.CompletedProcess(args,0,stdout='{"password":"SYNTHETIC_PRIVATE_RUNTIME_SECRET"}',stderr='')
   composeCalls+=1
   if not diagnostic_failure and not persist_failure:
    persisted=list(remote_root.glob('before-*.json'));assert persisted
    assert all('SYNTHETIC_PRIVATE_RUNTIME_SECRET' not in f.read_text() for f in persisted)
   files=[args[i+1] for i,x in enumerate(args) if x=='-f'];volumes=copy.deepcopy(base['volumes'])
   if len(files)>len(basefiles):volumes+=json.loads(path(files[-1]).read_text())['services']['backend']['volumes']
   state['State']={'Status':'running','Running':True,'ExitCode':0,'Health':{'Status':'healthy'}}
   state['Mounts']=[{'Source':v['source'],'Destination':v['target'],'RW':not v['read_only']} for v in volumes]
   state['HostConfig']={**hc,'Binds':hc['Binds']+[v['source']+':'+v['target']+':ro' for v in volumes[3:]]}
   if sustained:
    state['HostConfig']={**hc,'Mounts':hc['Mounts']+[{'Type':'bind','Source':v['source'],'Target':v['target'],'ReadOnly':v['read_only'],'BindOptions':{}}for v in volumes[3:]]}
   if wrong_mount and len(state['Mounts'])>3:state['Mounts'][-1]['Destination']='/wrong-target'
   return subprocess.CompletedProcess(args,0,stdout='',stderr='')
  import io
  service.Path=path;service.datetime=datetime;service.time=time;service.urllib=urllib
  realstat=os.stat
  realfstat=os.fstat
  def fstat(fd):
   value=realfstat(fd)
   if (value.st_mode&0o777)==0o440:
    parts=list(value);parts[4]=0;parts[5]=999;return os.stat_result(parts)
   return value
  def stat(p,*args,**kwargs):
   value=realstat(p,*args,**kwargs)
   if str(p).endswith('/create.json'):
    parts=list(value);parts[4]=0;parts[5]=999;return os.stat_result(parts)
   return value
  with patch.object(service.os,'fsync',side_effect=RuntimeError('fixture persist gap')) if persist_failure else patch.object(service.os,'fsync',wraps=os.fsync),patch.object(service.os,'fstat',fstat),patch.object(service.os,'stat',stat),patch.object(service.hashlib,'sha256',sha),patch.object(service.subprocess,'check_output',output),patch.object(service.subprocess,'run',run),patch.object(service.urllib.request,'urlopen',lambda *a,**k:io.BytesIO(json.dumps({'status':'broken' if health_failure else 'ok','environment':'development'}).encode())),patch.object(service.os,'chown',lambda *a:None):
   if wait_expiry:
    import concurrent.futures,fcntl
    lockfd=os.open(root/'service.lock',os.O_CREAT|os.O_RDWR,0o600);fcntl.flock(lockfd,fcntl.LOCK_EX)
    try:
     with concurrent.futures.ThreadPoolExecutor(1) as pool:
      future=pool.submit(service.remote,p,'activate',{'kind':'create','password':'SYNTHETIC_PRIVATE_RUNTIME_SECRET'});time.sleep(.15);fcntl.flock(lockfd,fcntl.LOCK_UN);result=future.result(2)
    finally:os.close(lockfd)
   else:result=service.remote(p,'restore' if action=='restore-only' else 'activate',{'kind':'create','password':'SYNTHETIC_PRIVATE_RUNTIME_SECRET',**({'runtime':runtime_config}if sustained else{})})
   self.assertNotIn('SYNTHETIC_PRIVATE_RUNTIME_SECRET',json.dumps(result))
   if action=='restore' and result['verified']:
    if exited:state['State']={'Status':'exited','Running':False,'ExitCode':42,'Health':{'Status':'unhealthy'}}
    result=service.remote(p,'restore',{})
   if action=='reconcile'and result['verified']:
    create=remote_root/'create.json';metadata=remote_root/'metadata.json';body=json.loads(create.read_text());body['request']=p['payloads']['editProposal']['body'];body['metadataPg']=body.pop('tripPg')
    if bad_second:body['actorAccountId']='foreign-actor'
    if broken_second:metadata.symlink_to(remote_root/'missing-private-target')
    else:metadata.write_text(json.dumps(body));metadata.chmod(0o440)
    state['Mounts']=[{'Source':m['source'],'Destination':m['destination'],'RW':m['rw']}for m in mounts];state['HostConfig']=copy.deepcopy(hc);state['HostConfig']['Mounts'].reverse()
    beforecalls=composeCalls
    try:
     result=service.remote(p,'reconcile',{})
     self.assertFalse(create.exists());self.assertFalse(metadata.exists());self.assertTrue(result['runtimeSecretsRemoved'])
    except (AssertionError,OSError):
     self.assertTrue(bad_second or broken_second);self.assertTrue(create.exists());self.assertTrue(metadata.exists()or metadata.is_symlink());result={'verified':False,'invalidSecondPreservedBoth':True}
    self.assertEqual(composeCalls,beforecalls)
  result["fixtureComposeCalls"]=composeCalls
  temporary.cleanup();return result
 def test_sustained_accepts_only_mount_order_difference(self):self.assertTrue(self.fixture('restore',sustained=True,mount_order=True)['verified'])
 def test_sustained_private_v3_mount_and_exact_restore(self):self.assertTrue(self.fixture('restore',sustained=True)['verified'])
 def test_sustained_wrong_runtime_hash_fails_without_success(self):self.assertFalse(self.fixture(sustained=True,bad_runtime=True)['verified'])
 def test_non_alphabetical_compose_order_survives_sorted_hash_map(self):self.assertTrue(self.fixture('restore',nonalphabetical=True)['verified'])
 def test_exact_mounts_and_runtime_then_restore(self):self.assertTrue(self.fixture('restore')['verified'])
 def test_untrusted_ca_cannot_activate(self):
  with self.assertRaises(AssertionError):self.fixture(bad_ca=True)
 def test_hostconfig_normalizes_only_mount_order_preserving_every_value(self):
  a={'Other':{'keep':True},'Mounts':[{'Source':'a','ReadOnly':True},{'Source':'b','ReadOnly':False}]};b=copy.deepcopy(a);b['Mounts'].reverse()
  self.assertEqual(service.host_config(a),service.host_config(b));self.assertNotEqual(a,b)
  b['Mounts'][0]['ReadOnly']=True;self.assertNotEqual(service.host_config(a),service.host_config(b))
  b=copy.deepcopy(a);b['Other']['keep']=False;self.assertNotEqual(service.host_config(a),service.host_config(b))
  b=copy.deepcopy(a);b['Mounts'].append(copy.deepcopy(b['Mounts'][0]));self.assertNotEqual(service.host_config(a),service.host_config(b))
 def test_persist_failure_still_restores_but_cannot_pass(self):
  result=self.fixture("restore-only",persist_failure=True);self.assertTrue(result["restorationVerified"]);self.assertFalse(result["verified"]);self.assertFalse(result["beforeDiagnosticPersisted"]);self.assertEqual(result["fixtureComposeCalls"],1)
 def test_actual_activation_waits_lock_then_rejects_expired_without_compose(self):
  result=self.fixture(wait_expiry=True);self.assertFalse(result["verified"]);self.assertEqual(result["fixtureComposeCalls"],0)
 def test_stopped_candidate_captured_before_restore_without_preexec(self):
  result=self.fixture('restore',exited=True);self.assertTrue(result['verified']);self.assertEqual(result['beforeDiagnostic']['state']['ExitCode'],42);self.assertEqual(result['bundleSHA256'],control.BUNDLE)
 def test_same_count_wrong_target_fails(self):self.assertFalse(self.fixture(wrong_mount=True)['verified'])
 def test_reconcile_no_compose_removes_only_two_exact_unmounted_runtime_files(self):self.assertTrue(self.fixture('reconcile')['verified'])
 def test_second_foreign_runtime_prevents_deleting_first(self):self.assertTrue(self.fixture('reconcile',bad_second=True)['invalidSecondPreservedBoth'])
 def test_second_broken_symlink_prevents_deleting_first(self):self.assertTrue(self.fixture('reconcile',broken_second=True)['invalidSecondPreservedBoth'])
 def test_diagnostic_failure_not_pass(self):self.assertFalse(self.fixture(diagnostic_failure=True)['verified'])
 def test_http_health_failure_not_pass(self):self.assertFalse(self.fixture(health_failure=True)['verified'])
if __name__=='__main__':unittest.main()
