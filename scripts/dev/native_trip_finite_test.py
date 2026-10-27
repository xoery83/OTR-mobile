import copy,datetime,json,hashlib,os,subprocess,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
import native_trip_finite as native

EVIDENCE=Path('/private/tmp/otr-ad5-regression-20261024/NATIVE_CREATE_ORIGINAL.json')
DEPLOYMENT=Path('/private/tmp/otr-ad5-structured-deploy-20261023/OWNER_EXECUTION_GATE.json')

def sign(p):
 p['requestSHA256']=native.legacy.digest(p['request']);p['windowId']=native.legacy.digest({k:p[k]for k in ('project','image','bundle','actorIds','tripId','operationId','kind','requestSHA256','startsAt','expiresAt')});p.pop('manifestSHA256',None);p['manifestSHA256']=native.legacy.digest(p);return p

def plan():
 g=json.loads(DEPLOYMENT.read_text());e=json.loads(EVIDENCE.read_text());now=datetime.datetime.now(datetime.timezone.utc);forward=g['releaseDirectory']+'/compose.forward.closed.yml';text='services:\n  backend:\n    image: "'+native.IMAGE+'"\n    command: ["node", "server-capture.mjs"]\n';ca=json.loads(Path('/private/tmp/otr-c-currency-execution-20261023/C_CONTINUATION_RECOVERY.json').read_text())['databaseCA']
 return sign({'project':native.PROJECT,'image':native.IMAGE,'bundle':native.BUNDLE,'actorIds':{'A':native.ACTOR},'tripId':native.TRIP,'operationId':e['operation']['id'],'kind':'create','request':{**e['payload'],'operationId':e['operation']['id']},'startsAt':(now-datetime.timedelta(seconds=1)).isoformat(),'expiresAt':(now+datetime.timedelta(seconds=600)).isoformat(),'ownerAuthorized':False,'ownerAuthorizationPath':g['ownerAuthorizationPath'],'ownerAuthorizationSHA256':native.OWNER,'nativeEvidencePath':str(EVIDENCE),'nativeEvidenceSHA256':hashlib.sha256(EVIDENCE.read_bytes()).hexdigest(),'deploymentGatePath':str(DEPLOYMENT),'deploymentGateSHA256':hashlib.sha256(DEPLOYMENT.read_bytes()).hexdigest(),'sourceHelperSHA256':hashlib.sha256(native.HERE.read_bytes()).hexdigest(),'legacyControlSHA256':hashlib.sha256(Path(native.legacy.__file__).read_bytes()).hexdigest(),'serviceHelperSHA256':hashlib.sha256(Path(native.runtime.__file__).read_bytes()).hexdigest(),'diagnosticHelperSHA256':hashlib.sha256(Path(native.diagnostic.__file__).read_bytes()).hexdigest(),'minimumServiceChangeReserveSeconds':240,'supabaseCli':g['supabaseCli'],'linkedWorktree':g['linkedWorktree'],'databaseCA':ca,'budget':{'businessReads':8,'businessMutationAttempts':2,'newAuth':0},'baseline':{'image':native.IMAGE,'captureBundleSHA256':native.BUNDLE,'hostConfig':g['expectedHostConfig'],'environmentSHA256':g['beforeEnvironmentSHA256'],'mounts':[{'source':m[0],'destination':m[1],'rw':m[2]}for m in g['expectedMounts']],'composeFiles':g['beforeConfigFiles']+[forward],'configHashes':{**g['beforeConfigHashes'],forward:hashlib.sha256(text.encode()).hexdigest()},'custodySHA256':g['expectedCustodySHA256']}})

class NativeFiniteTests(unittest.TestCase):
 def test_plan_binds_actual_native_envelope_and_existing_deployment(self):
  p=plan()
  with tempfile.TemporaryDirectory()as d:
   f=Path(d)/'plan.json';f.write_text(json.dumps(p));self.assertEqual(native.load_plan(f),p)
   for key,value in [('tripId',str(__import__('uuid').uuid4())),('image',native.legacy.IMAGE),('actorIds',{'A':str(__import__('uuid').uuid4())}),('request',{**p['request'],'name':'not actual Native'}),('nativeEvidenceSHA256','0'*64)]:
    bad=copy.deepcopy(p);bad[key]=value;sign(bad);f.write_text(json.dumps(bad))
    with self.assertRaises(AssertionError):native.load_plan(f)
 def test_baseline_mount_and_config_control_fields_cannot_change(self):
  with tempfile.TemporaryDirectory()as d:
   f=Path(d)/'plan.json'
   for section in ['hostConfig','composeFiles','configHashes']:
    p=plan();p['baseline'][section]={}if section!='composeFiles'else[];sign(p);f.write_text(json.dumps(p))
    with self.assertRaises(AssertionError):native.load_plan(f)
 def test_create_wire_has_operation_but_sql_payload_does_not(self):
  p=plan();p['ownerAuthorized']=True
  with tempfile.TemporaryDirectory()as d:
   op=native.Operator(p,d,lambda q:[]);text=op.activation_sql('create','synthetic-only')
   self.assertIn('formatVersion',text);self.assertIn('destinations',text);self.assertIn(p['operationId'],text);self.assertNotIn('"operationId":',text)
   self.assertIn('WHERE enabled',text);self.assertIn('NATIVE_UNRELATED_GATE_DRIFT',text)
   with self.assertRaises(AssertionError):op.activation_sql('metadata','no')
 def test_close_is_scoped_to_actor_trip_operation_and_window(self):
  p=plan()
  with tempfile.TemporaryDirectory()as d:
   op=native.Operator(p,d);text=op.close_sql()
   for value in [native.ACTOR,native.TRIP,p['operationId'],p['startsAt'],p['expiresAt']]:self.assertIn(value,text)
   self.assertLess(text.index('pg_terminate_backend'),text.index('UPDATE public.trip_create_activation_gate'))
 def test_default_prepare_no_sql_ssh(self):
  p=plan();folder='/private/tmp/otr-ad5-native-'+p['windowId']
  with tempfile.TemporaryDirectory()as d,patch.object(native.Operator,'sql',side_effect=AssertionError('NO_SQL')),patch.object(native.subprocess,'run',side_effect=AssertionError('NO_SSH')):
   f=Path(d)/'plan.json';f.write_text(json.dumps(p))
   with patch('sys.argv',['prepare','prepare',str(f),folder]):native.main()
  Path(folder).rmdir()
 def test_missing_or_dead_watchdog_cannot_activate(self):
  p=plan();p['ownerAuthorized']=True
  with tempfile.TemporaryDirectory()as d,patch.object(native.Operator,'sql')as sql,patch.object(native.Operator,'service')as service:
   op=native.Operator(p,d)
   with self.assertRaises(FileNotFoundError):op.activate('create')
   sql.assert_not_called();service.assert_not_called()
 def test_false_closed_projection_cannot_restore_or_pass(self):
  p=plan()
  with tempfile.TemporaryDirectory()as d:
   op=native.Operator(p,d,lambda q:[{'closed':False}])
   with patch.object(op,'service')as service:
    result=op.close();self.assertEqual(result['status'],'RECONCILE_REQUIRED');service.assert_not_called()
 def test_actual_detached_watch_survives_operator_exit_and_closes_fixture(self):
  with tempfile.TemporaryDirectory()as d:
   p=plan();p['ownerAuthorized']=True;p['expiresAt']=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=1.2)).isoformat();sign(p);f=Path(d)/'plan.json';f.write_text(json.dumps(p));child=Path(d)/'child.py'
   child.write_text('import sys,json\nfrom pathlib import Path\nsys.path.insert(0,'+repr(str(native.HERE.parent))+')\nimport native_trip_finite as n\np=json.loads(Path(sys.argv[1]).read_text())\nclass Fixture(n.Operator):\n def sql(self,q): return [{"closed":True}]\n def service(self,*a,**k): return {"verified":True,"fixtureOnly":True}\nprint(json.dumps(Fixture(p,sys.argv[2]).watch()))\n')
   parent=Path(d)/'parent.py';parent.write_text('import subprocess,sys\np=subprocess.Popen([sys.executable,sys.argv[1],sys.argv[2],sys.argv[3]],start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\nprint(p.pid)\n')
   result=subprocess.run([sys.executable,str(parent),str(child),str(f),d],capture_output=True,text=True,timeout=5);self.assertEqual(result.returncode,0);pid=int(result.stdout)
   deadline=time.monotonic()+6
   while not list(Path(d).glob('close-*.json'))and time.monotonic()<deadline:time.sleep(.05)
   receipt=json.loads(next(Path(d).glob('close-*.json')).read_text());self.assertEqual(receipt['status'],'CLOSED_VERIFIED');self.assertEqual(receipt['windowId'],p['windowId']);self.assertNotEqual(pid,os.getpid())

if __name__=='__main__':unittest.main()
