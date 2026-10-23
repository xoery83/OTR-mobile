"""One actual Native QA operation through existing finite SQL/runtime/watchdog. Prepare by default."""
import argparse,ast,hashlib,json,os,pathlib,secrets,shlex,subprocess,sys,time,uuid
HERE=pathlib.Path(__file__).resolve();ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/trip/c-execution'))
import control as legacy
import service as runtime
import metadata_closed_retry as diagnostic
PROJECT=legacy.PROJECT
IMAGE='sha256:73d518d4aa573590a9fe43aa48b767b180d998d5cb6e341221ce2eed8e80ef30'
BUNDLE='95b9c8018b8bc516cf5fc27b5d6c857836d15ee3d44a4a3f092da8dc22ad3aec'
ACTOR='3a44420f-ec2b-4d7e-9770-410a5ed5e77e'
TRIP='ceae33ac-e6d5-42f3-a007-a5cef0fe7faa'
OWNER='cbf38e5690ed5fd3df5fff279ac9da32a24a55c0eb724c1d4811b26917e8b362'

def load_plan(path):
 p=json.loads(pathlib.Path(path).read_text());claimed=p['manifestSHA256'];unsigned=dict(p);del unsigned['manifestSHA256'];assert claimed==legacy.digest(unsigned)
 assert p['project']==PROJECT and p['image']==IMAGE and p['bundle']==BUNDLE and p['actorIds']=={'A':ACTOR} and p['tripId']==TRIP
 assert p['ownerAuthorizationSHA256']==OWNER and hashlib.sha256(pathlib.Path(p['ownerAuthorizationPath']).read_bytes()).hexdigest()==OWNER
 assert 0<legacy.timestamp(p['expiresAt'])-legacy.timestamp(p['startsAt'])<=900 and p['kind']in('create','metadata')
 assert p['minimumServiceChangeReserveSeconds']==240 and p['sourceHelperSHA256']==hashlib.sha256(HERE.read_bytes()).hexdigest()
 for key,file in [('legacyControlSHA256',legacy.__file__),('serviceHelperSHA256',runtime.__file__),('diagnosticHelperSHA256',diagnostic.__file__)]:assert p[key]==hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()
 deployment=pathlib.Path(p['deploymentGatePath']).read_bytes();assert hashlib.sha256(deployment).hexdigest()==p['deploymentGateSHA256']
 g=json.loads(deployment);assert g['ownerAuthorizationSHA256']==OWNER and g['candidateImage']==IMAGE and g['bundleSHA256']==BUNDLE
 forward=g['releaseDirectory']+'/compose.forward.closed.yml'
 forward_text='services:\n  backend:\n    image: "'+IMAGE+'"\n    command: ["node", "server-capture.mjs"]\n'
 expected={'image':IMAGE,'captureBundleSHA256':BUNDLE,'hostConfig':g['expectedHostConfig'],'environmentSHA256':g['beforeEnvironmentSHA256'],'mounts':[{'source':m[0],'destination':m[1],'rw':m[2]} for m in g['expectedMounts']],'composeFiles':g['beforeConfigFiles']+[forward],'configHashes':{**g['beforeConfigHashes'],forward:hashlib.sha256(forward_text.encode()).hexdigest()},'custodySHA256':g['expectedCustodySHA256']}
 assert p['baseline']==expected and p['supabaseCli']==g['supabaseCli'] and p['linkedWorktree']==g['linkedWorktree']
 evidence=pathlib.Path(p['nativeEvidencePath']).read_bytes();assert hashlib.sha256(evidence).hexdigest()==p['nativeEvidenceSHA256'];e=json.loads(evidence)
 assert e['trip']['id']==TRIP and e['trip']['account_id']==ACTOR
 op=e['operation'];assert op['trip_id']==TRIP and op['owner_user_id']==ACTOR and op['id']==op['idempotency_key']==p['operationId'];uuid.UUID(op['id'])
 assert op['operation_type']==('CREATE_TRIP'if p['kind']=='create'else'UPDATE_TRIP_METADATA') and op['attempt_count']==0 and op['status']in('PENDING','DEPENDENCY_BLOCKED')
 payload=e['payload'];assert payload['tripId']==TRIP
 if p['kind']=='create':
  assert payload['formatVersion']==2 and 'operationId'not in payload and e['trip']['accepted_at']is None
  request={**payload,'operationId':op['id']}
 else:
  assert payload['formatVersion']==3 and payload['operationId']==op['id'] and type(payload['expectedMetadataRevision'])is int
  request=payload
 assert p['request']==request and p['requestSHA256']==legacy.digest(request)
 assert p['windowId']==legacy.digest({k:p[k] for k in ('project','image','bundle','actorIds','tripId','operationId','kind','requestSHA256','startsAt','expiresAt')})
 assert hashlib.sha256(p['databaseCA'].encode()).hexdigest()=='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
 assert p['budget']=={'businessReads':8,'businessMutationAttempts':2,'newAuth':0}
 # Bound to this small actual QA request; no general-purpose large asset/config capability.
 assert len(json.dumps(request).encode())+len(p['databaseCA'].encode())+2048<=16384
 return p

def source_functions(path,names,expected):
 body=pathlib.Path(path).read_bytes();assert hashlib.sha256(body).hexdigest()==expected
 text=body.decode();tree=ast.parse(text);functions={node.name:ast.get_source_segment(text,node) for node in tree.body if isinstance(node,ast.FunctionDef)}
 return '\n\n'.join(functions[n]for n in names)

class Operator(legacy.Operator):
 def scoped_guard(self):
  p=self.p;kind=p['kind'];req=dict(p['request']);req.pop('operationId')if kind=='create'else None
  exact=f"actor_account_id={legacy.quote(ACTOR)}::uuid AND trip_id={legacy.quote(TRIP)}::uuid AND operation_id={legacy.quote(p['operationId'])}::uuid AND request_payload={legacy.quote(json.dumps(req))}::jsonb AND started_at={legacy.quote(p['startsAt'])}::timestamptz AND expires_at={legacy.quote(p['expiresAt'])}::timestamptz"
  checks=[]
  for k,table in legacy.GATES.items():
   predicate=f'enabled AND NOT ({exact})'if k==kind else'enabled'
   checks.append(f"IF EXISTS(SELECT 1 FROM public.{table} WHERE {predicate}) THEN RAISE EXCEPTION 'NATIVE_WINDOW_SCOPE_DRIFT'; END IF;")
   role=legacy.ROLES[k]
   allowed=f"rolvaliduntil IS DISTINCT FROM {legacy.quote(p['expiresAt'])}::timestamptz"if k==kind else'true'
   checks.append(f"IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname={legacy.quote(role)} AND rolcanlogin AND ({allowed})) THEN RAISE EXCEPTION 'NATIVE_ROLE_WINDOW_DRIFT'; END IF;")
  return '\n'.join(checks)
 def activation_sql(self,kind,password):
  self.open();assert kind==self.p['kind'];p=self.p;request=dict(p['request']);request.pop('operationId')if kind=='create'else None
  return f"""BEGIN; SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714022,23);
DO $guard$ BEGIN {self.scoped_guard()}
IF EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled) OR EXISTS(SELECT 1 FROM public.trip_source_command_gate WHERE enabled) OR EXISTS(SELECT 1 FROM public.trip_source_pdf_gate WHERE enabled) THEN RAISE EXCEPTION 'NATIVE_UNRELATED_GATE_DRIFT'; END IF;
IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_core_v2_gateway','otr_trip_core_v2_writer') AND rolcanlogin) THEN RAISE EXCEPTION 'NATIVE_UNRELATED_ROLE_DRIFT';END IF;
IF clock_timestamp() < {legacy.quote(p['startsAt'])}::timestamptz OR clock_timestamp() >= {legacy.quote(p['expiresAt'])}::timestamptz THEN RAISE EXCEPTION 'NATIVE_WINDOW_CLOSED';END IF;
IF EXISTS(SELECT 1 FROM public.{legacy.GATES[kind]} WHERE enabled) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ('otr_trip_create_gateway','otr_trip_metadata_gateway')) THEN RAISE EXCEPTION 'NATIVE_CAPABILITY_NOT_DORMANT';END IF;
END $guard$;
ALTER ROLE {legacy.ROLES[kind]} LOGIN CONNECTION LIMIT 1 PASSWORD {legacy.quote(password)} VALID UNTIL {legacy.quote(p['expiresAt'])};
UPDATE public.{legacy.GATES[kind]} SET enabled=true,actor_account_id={legacy.quote(ACTOR)}::uuid,trip_id={legacy.quote(TRIP)}::uuid,operation_id={legacy.quote(p['operationId'])}::uuid,request_payload={legacy.quote(json.dumps(request))}::jsonb,started_at={legacy.quote(p['startsAt'])}::timestamptz,expires_at={legacy.quote(p['expiresAt'])}::timestamptz WHERE singleton;
COMMIT;"""
 def service(self,action,kind=None,password=None):
  p=self.p
  helpers=source_functions(diagnostic.__file__,('redact','environment_projection','diagnostics'),p['diagnosticHelperSHA256'])+'\n\n'+source_functions(runtime.__file__,('host_config','remote_locked','remote'),p['serviceHelperSHA256'])
  bound=dict(p);bound['payloads']={('create'if p['kind']=='create'else'editProposal'):{'body':p['request']}}
  prefix='import json,sys,hashlib,hmac,re,os,subprocess,time,urllib.request,datetime,fcntl,stat\nfrom pathlib import Path\n'
  code=prefix+helpers+'\np,action,secret=json.load(sys.stdin)\nprint(json.dumps(remote(p,action,secret)))'
  r=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8',diagnostic.HOST,'python3 -c '+shlex.quote(code)],input=json.dumps([bound,action,{'kind':kind,'password':password}]),capture_output=True,text=True,timeout=240)
  if r.returncode:raise RuntimeError('NATIVE_SERVICE_RECONCILE_REQUIRED')
  receipt=json.loads(r.stdout);assert receipt['verified']is True;return receipt
 def baseline_sql(self):
  if self.p['kind']=='create':
   return f"BEGIN READ ONLY;SELECT jsonb_build_object('tripAbsent',NOT EXISTS(SELECT 1 FROM public.trips WHERE id={legacy.quote(TRIP)}::uuid),'receiptAbsent',NOT EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE operation_id={legacy.quote(self.p['operationId'])}::uuid)) AS baseline;ROLLBACK;"
  return f"BEGIN READ ONLY;SELECT jsonb_build_object('tripId',id,'actorId',created_by,'revision',metadata_revision,'metadata',jsonb_build_object('name',name,'destination',destination,'destinations',destinations,'startDate',start_date,'endDate',end_date)) AS baseline FROM public.trips WHERE id={legacy.quote(TRIP)}::uuid AND created_by={legacy.quote(ACTOR)}::uuid;ROLLBACK;"
 def closed_sql(self):
  return "BEGIN READ ONLY;SELECT (NOT EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled) AND NOT EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled) AND NOT EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled) AND NOT EXISTS(SELECT 1 FROM public.trip_source_command_gate WHERE enabled) AND NOT EXISTS(SELECT 1 FROM public.trip_source_pdf_gate WHERE enabled) AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_core_v2_writer') AND rolcanlogin) AND NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_core_v2_writer'))) AS closed;ROLLBACK;"
 def assert_closed(self):
  result=self.sql(self.closed_sql());rows=result if isinstance(result,list)else result.get('rows')
  assert isinstance(rows,list)and len(rows)==1 and rows[0]=={'closed':True}
 def close(self):
  result={'windowId':self.p['windowId'],'status':'RECONCILE_REQUIRED','sqlClosed':False,'serviceRestored':False}
  try:
   self.sql(self.close_sql());self.assert_closed();result['sqlClosed']=True
   result['service']=self.service('restore');result['serviceRestored']=True
   self.assert_closed();result['status']='CLOSED_VERIFIED'
  except Exception:pass
  legacy.private_write(self.dir/('close-'+str(time.time_ns())+'.json'),result)
  return result
 def activate(self,kind):
  assert kind==self.p['kind'];self.open()
  armed=json.loads((self.dir/'watchdog-armed.json').read_text());heartbeat=json.loads((self.dir/'watchdog-heartbeat.json').read_text())
  assert armed['windowId']==heartbeat['windowId']==self.p['windowId'] and armed['pid']==heartbeat['pid'] and 0<=time.time()-heartbeat['observedAt']<2
  os.kill(armed['pid'],0);state=subprocess.check_output(['ps','-p',str(armed['pid']),'-o','state='],text=True,timeout=2).strip();assert state and not state.startswith('Z')
  assert legacy.timestamp(self.p['expiresAt'])-time.time()>=240
  legacy.private_write(self.dir/'activation.reserved',{'windowId':self.p['windowId'],'requestSHA256':self.p['requestSHA256'],'operationId':self.p['operationId']})
  fd=os.open(self.dir,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
  result=self.sql(self.baseline_sql());rows=result if isinstance(result,list)else result.get('rows')
  assert isinstance(rows,list)and len(rows)==1 and set(rows[0])=={'baseline'}
  expected={'tripAbsent':True,'receiptAbsent':True}if kind=='create'else {'tripId':TRIP,'actorId':ACTOR,'revision':self.p['request']['expectedMetadataRevision'],'metadata':self.p['request']['before']}
  legacy.private_write(self.dir/'canonical-before.json',{'windowId':self.p['windowId'],'actual':rows[0]['baseline'],'expectedMatches':rows[0]['baseline']==expected,'businessReadCharge':1})
  assert rows[0]['baseline']==expected,'NATIVE_BASELINE_MISMATCH_STOP_NO_REBASE'
  self.open();assert legacy.timestamp(self.p['expiresAt'])-time.time()>=240
  password=secrets.token_urlsafe(36)
  try:
   self.sql(self.activation_sql(kind,password));receipt=self.service('activate',kind,password)
   return {'status':'ACTIVATED','kind':kind,'windowId':self.p['windowId'],'service':receipt}
  except Exception:
   self.close();raise RuntimeError('NATIVE_ACTIVATION_FAILED_CLOSED_OR_RECONCILE')

def main():
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','arm','watch','activate','close','reconcile']);parser.add_argument('plan');parser.add_argument('run_dir');parser.add_argument('--manifest-sha');a=parser.parse_args();p=load_plan(a.plan)
 assert a.manifest_sha is None or a.manifest_sha==p['manifestSHA256'];assert pathlib.Path(a.run_dir)==pathlib.Path('/private/tmp/otr-ad5-native-'+p['windowId']) and pathlib.Path(a.run_dir).resolve()==pathlib.Path(a.run_dir);p['planPath']=str(pathlib.Path(a.plan).resolve());op=Operator(p,a.run_dir)
 if a.action=='prepare':print(json.dumps({'status':'PREPARED_NO_SQL_OR_SSH','windowId':p['windowId']}));return
 assert p['ownerAuthorized']is True
 if a.action=='arm':
  op.open();child=subprocess.Popen([sys.executable,str(HERE),'watch',a.plan,a.run_dir,'--manifest-sha',p['manifestSHA256']],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True);print(json.dumps({'status':'WATCHDOG_STARTED','pid':child.pid}));return
 if a.action=='watch':result=op.watch()
 elif a.action=='activate':result=op.activate(p['kind'])
 elif a.action=='reconcile':
  op.assert_closed();result=op.service('reconcile');result['sqlClosed']=True
 else:
  (op.dir/'close-requested').touch(mode=0o600,exist_ok=True)
  deadline=time.monotonic()+340
  while time.monotonic()<deadline:
   receipts=sorted(op.dir.glob('close-*.json'))
   if receipts:result=json.loads(receipts[-1].read_text());break
   try:os.kill(json.loads((op.dir/'watchdog-armed.json').read_text())['pid'],0)
   except (FileNotFoundError,ProcessLookupError):result=op.close();break
   time.sleep(.2)
  else:result={'status':'RECONCILE_REQUIRED'}
 print(json.dumps(result));sys.exit(0 if result.get('status')!='RECONCILE_REQUIRED'else 2)
if __name__=='__main__':
 try:main()
 except Exception:print(json.dumps({'status':'STOPPED_OR_RECONCILE_REQUIRED'}));sys.exit(2)
