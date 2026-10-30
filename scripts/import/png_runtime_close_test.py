import json
import unittest
from types import SimpleNamespace
from pdf_runtime_close import ACTOR, TRIP, execute, sha, close_pdf
import universal_runtime_close as retained

class PngCloseTests(unittest.TestCase):
 def fixture(self):
  trace=[];bundle=b'FIXED_SYNTHETIC_CLOSE_BUNDLE';config={'Image':'SYNTHETIC','Env':['SYNTHETIC=true'],'User':'otr','Cmd':['node','server-capture.mjs'],'Labels':{'com.docker.compose.project.config_files':'/opt/otr/dev-backend/compose.yml'}}
  r={'container':'otr-dev-backend','runtimeMountTarget':'/run/otr/universal-runtime.json','originalContainerId':'a'*64,'stagedContainerId':'b'*64,'imageId':'sha256:'+'c'*64,'baselineConfigSHA256':sha(json.dumps(config,sort_keys=True).encode())}
  snap={'Id':r['originalContainerId'],'Name':'/otr-dev-backend','Image':r['imageId'],'Config':config,'HostConfig':{'NetworkMode':'host'},'Mounts':[{'Source':'/opt/otr/dev-backend/env/universal-png-runtime.json','Destination':'/run/otr/universal-png-runtime.json','RW':False}],'State':{'Running':True,'Health':{'Status':'healthy'}}}
  projection=retained.service_projection(snap)
  r.update(baselineEnvironmentSHA256=projection['environmentSHA256'],baselineHostConfigSHA256=projection['hostConfigSHA256'],baselineMountsSHA256=projection['mountsSHA256'],baselineComposeFiles=['/opt/otr/dev-backend/compose.yml'])
  plan={'project':'tuqigdxrvrerfewsxqgm','actorId':ACTOR,'tripId':TRIP,'runtime':r,'pngCloseBundleSHA256':sha(bundle)}
  runtime=SimpleNamespace(validate_runtime=lambda p:None,canonical=lambda v:json.dumps(v,sort_keys=True).encode(),service_projection=retained.service_projection,remote_close=lambda p:(_ for _ in ()).throw(ValueError('UNIVERSAL_MOUNT_REMAINS')))
  def call(argv,input=None):
   trace.append(argv)
   if argv[:2]==['docker','inspect']:return json.dumps([snap])
   if argv[:2]==['docker','exec']:
    self.assertEqual(input,bundle)
    return json.dumps({'status':'PNG_SCOPE_CLOSED_VERIFIED','closed':True})
   if argv[:2]==['systemctl','show']:return 'inactive\n'
   if argv[0]=='/usr/bin/env':return json.dumps({'status':'EMPTY_VERIFIED','terminated':True})
   return ''
  return plan,runtime,bundle,call,trace
 def test_png_reuses_existing_baseline_and_fresh_close_verify(self):
  plan,runtime,bundle,call,trace=self.fixture()
  result=execute(plan,runtime,bundle,call,'PNG')
  self.assertEqual(result['status'],'PNG_CLOSED_VERIFIED')
  self.assertTrue(result['verified'])
  self.assertEqual([a[-1] for a in trace if a[:2]==['docker','exec']],['close','verify','close','verify'])
  self.assertIn(['systemctl','stop','otr-universal-png-worker.service'],trace)
 def test_unhealthy_baseline_cannot_claim_closed_and_still_stops_worker(self):
  plan,runtime,bundle,call,trace=self.fixture()
  def unhealthy(argv,input=None):
   value=call(argv,input)
   if argv[:2]==['docker','inspect']:
    snap=json.loads(value);snap[0]['State']['Health']['Status']='unhealthy';return json.dumps(snap)
   return value
  result=execute(plan,runtime,bundle,unhealthy,'PNG')
  self.assertFalse(result['verified'])
  self.assertIn(['systemctl','stop','otr-universal-png-worker.service'],trace)
 def test_mount_drift_cannot_claim_closed(self):
  plan,runtime,bundle,call,trace=self.fixture()
  def drift(argv,input=None):
   value=call(argv,input)
   if argv[:2]==['docker','inspect']:
    snap=json.loads(value);snap[0]['Mounts'][0]['RW']=True;return json.dumps(snap)
   return value
  self.assertFalse(execute(plan,runtime,bundle,drift,'PNG')['verified'])
 def test_inactive_service_without_physical_proof_cannot_claim_closed(self):
  plan,runtime,bundle,call,trace=self.fixture()
  def unknown(argv,input=None):
   if argv[0]=='/usr/bin/env':return json.dumps({'status':'UNKNOWN','terminated':False})
   return call(argv,input)
  self.assertFalse(execute(plan,runtime,bundle,unknown,'PNG')['verified'])
 def test_cleanup_nonzero_exit_cannot_claim_closed(self):
  plan,runtime,bundle,call,trace=self.fixture()
  def failed(argv,input=None):
   if argv[0]=='/usr/bin/env':raise RuntimeError('process failed')
   return call(argv,input)
  self.assertFalse(execute(plan,runtime,bundle,failed,'PNG')['verified'])
 def test_other_account_denied_before_any_io(self):
  plan,runtime,bundle,call,trace=self.fixture();plan['actorId']='OTHER'
  with self.assertRaises(ValueError):execute(plan,runtime,bundle,call,'PNG')
  self.assertEqual(trace,[])
 def test_pdf_mount_cannot_substitute_png_compatible_baseline(self):
  plan,runtime,bundle,call,trace=self.fixture();plan['runtime']['runtimeMountTarget']='/run/otr/universal-pdf-runtime.json'
  with self.assertRaises(ValueError):execute(plan,runtime,bundle,call,'PNG')
  self.assertEqual(trace,[])
 def test_wrong_bundle_denied_before_io(self):
  plan,runtime,bundle,call,trace=self.fixture()
  with self.assertRaises(ValueError):execute(plan,runtime,b'OTHER',call,'PNG')
  self.assertEqual(trace,[])
 def test_failed_sql_does_not_skip_runtime_or_worker(self):
  trace=[]
  def broken():trace.append('SQL');raise RuntimeError()
  def restore():trace.append('RESTORE');return {'verified':True}
  def stop():trace.append('STOP');return {'verified':True}
  result=close_pdf(broken,restore,stop,'PNG')
  self.assertEqual(trace,['SQL','RESTORE','SQL','STOP']);self.assertFalse(result['verified'])

if __name__=='__main__':unittest.main()
