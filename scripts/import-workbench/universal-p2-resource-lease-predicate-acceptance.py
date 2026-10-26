import subprocess,pathlib,json,uuid,time,copy,hashlib
p=pathlib.Path('docs/ops/universal-p2-formal-save-20261027').resolve();name='otr-p2-resource-'+uuid.uuid4().hex[:12];image='otr-core-v2-server84-fixture:20261012';checks=[]
def docker(*args,input=None,ok=True):
 r=subprocess.run(['docker',*args],input=input,text=True,capture_output=True)
 if ok and r.returncode:raise RuntimeError(r.stderr[-2500:])
 return r
def sql(body,fail=None):
 r=docker('exec','-i',name,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',input='SET SESSION AUTHORIZATION postgres;'+body,ok=False)
 if fail:assert r.returncode and fail in r.stderr,(fail,r.stderr)
 else:assert r.returncode==0,r.stderr
 return r.stdout.strip()
try:
 docker('image','inspect',image)
 docker('run','--name',name,'--network','none','--memory','256m','--cpus','1','-d',image)
 for i in range(50):
  if docker('exec',name,'pg_isready','-U','supabase_admin',ok=False).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('ISOLATED_PG_NOT_READY')
 docker('exec','-i',name,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',input='GRANT otr_external_integration_meter_writer TO postgres WITH INHERIT true,SET true;')
 pre=(p/'P2_RESOURCE_LEASE_FUNCTION_PREIMAGE.sql').read_text();post=(p/'P2_RESOURCE_LEASE_FUNCTION_POSTIMAGE.sql').read_text();hashes=json.loads((p/'P2_RESOURCE_LEASE_PACKAGE_HASHES.json').read_text());sig="'public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure"
 sql('SET check_function_bodies=off;CREATE TABLE IF NOT EXISTS public.model_task_admissions(account_id uuid,integration_id text,task_id uuid,call_id uuid,deadline timestamptz,contract_version text,request_snapshot jsonb);'+pre+';ALTER FUNCTION public.flight_activation_reserve_call(jsonb,jsonb) OWNER TO otr_external_integration_meter_writer;')
 assert sql('SELECT md5(pg_get_functiondef('+sig+'));')==hashes['preimageMD5'];checks.append('actual supplied function preimage matches PG canonical definition')
 before=sql('SELECT jsonb_build_object(\'oid\',oid,\'owner\',proowner,\'acl\',proacl) FROM pg_proc WHERE oid='+sig+';')
 sql((p/'P2_RESOURCE_LEASE_DEV_INSTALL.sql').read_text());assert sql('SELECT md5(pg_get_functiondef('+sig+'));')==hashes['postimageMD5'];assert sql('SELECT jsonb_build_object(\'oid\',oid,\'owner\',proowner,\'acl\',proacl) FROM pg_proc WHERE oid='+sig+';')==before;checks.append('exact installer preserves function OID owner ACL and temporary role/schema preimages')
 sql((p/'P2_RESOURCE_LEASE_DEV_INSTALL.sql').read_text(),fail='P2_RESOURCE_LEASE_FUNCTION_DRIFT');checks.append('repeated install rejects preimage drift')
 sql((p/'P2_RESOURCE_LEASE_DEV_ROLLBACK.sql').read_text());assert sql('SELECT md5(pg_get_functiondef('+sig+'));')==hashes['preimageMD5'];checks.append('exact rollback restores original hash and privileges')
 proposal=json.loads((p/'P2_BATCH9_BACKEND_IDENTITY_PROPOSAL.json').read_text());proof=json.loads((p/'P2_EXPIRED_CALL_ADMISSION_PROOF.json').read_text())['rows'][0]['proof'];c=proof['call'];c.update(environment='DEV',task_class='UNIVERSAL_IMPORT_V1',provider_id='DeepSeek',model_id='deepseek-flash',user_id=proposal['actorId'],row_revision=c.pop('revision'))
 r={**c,'task_id':proposal['expectedTaskId'],'import_id':proposal['batchId']};sc={'scope_id':'baac2ca8-f769-4ace-8bd4-d394a36312d6','revision':6,'workload':'UNIVERSAL_IMPORT_V1','concurrent_account':1,'environment':'DEV'};m=proof['admission']
 sql('CREATE SCHEMA p2_resource_fixture;CREATE TABLE p2_resource_fixture.admissions(account_id uuid,integration_id text,task_id uuid,call_id uuid,deadline timestamptz,contract_version text,request_snapshot jsonb);')
 def lit(v):return "'"+str(v).replace("'","''")+"'"
 def admission(deadline):sql('TRUNCATE p2_resource_fixture.admissions;INSERT INTO p2_resource_fixture.admissions VALUES('+','.join(lit(m[k]) for k in ['account_id','integration_id','task_id','call_id'])+','+lit(deadline)+','+lit('otr-model-task-v1')+','+lit(json.dumps({'task_id':m['task_id'],'policy_snapshot':{'deadline':deadline}}))+'::jsonb);')
 admission(m['deadline']);pred=(p/'P2_RESOURCE_LEASE_EXCEPTION_PREDICATE.sql').read_text().replace('public.model_task_admissions','p2_resource_fixture.admissions')
 h={'scope_id':sc['scope_id'],'account_id':c['account_id'],'provider_id':'DeepSeek'}
 columns='account_id uuid,user_id uuid,trip_id uuid,import_id uuid,integration_id text,task_id uuid,attempt_id uuid,call_id uuid,environment text,task_class text,provider_id text,model_id text,dispatch_state text,execution_certainty text,row_revision bigint'
 def excluded(rr,cc,ss,hh=None):
  if hh is None:hh=h
  q='WITH r AS(SELECT * FROM jsonb_to_record('+lit(json.dumps(rr))+'::jsonb) AS r('+columns+')),c AS(SELECT * FROM jsonb_to_record('+lit(json.dumps(cc))+'::jsonb) AS c('+columns+')),sc AS(SELECT * FROM jsonb_to_record('+lit(json.dumps(ss))+'::jsonb) AS sc(scope_id uuid,revision bigint,workload text,concurrent_account integer,environment text)),h AS(SELECT * FROM jsonb_to_record('+lit(json.dumps(hh))+'::jsonb) AS h(scope_id uuid,account_id uuid,provider_id text)) SELECT coalesce(('+pred+'),false) FROM r,c,sc,h;'
  return sql(q)=='t'
 assert excluded(r,c,sc);checks.append('exact QA scope6 excludes expired immutable old lease without deleting hold')
 for target,key,value in [('new','account_id',str(uuid.uuid4())),('new','trip_id',str(uuid.uuid4())),('new','integration_id','other'),('new','environment','PRODUCTION'),('new','task_class','FLIGHT_IMPORT_V1'),('old','call_id',str(uuid.uuid4())),('old','task_id',str(uuid.uuid4())),('old','account_id',str(uuid.uuid4())),('old','trip_id',str(uuid.uuid4())),('old','integration_id','other'),('old','dispatch_state','RESERVED'),('old','execution_certainty','NOT_STARTED'),('old','call_id',None),('scope','revision',5),('scope','scope_id',str(uuid.uuid4())),('scope','concurrent_account',2),('scope','environment','PRODUCTION'),('hold','scope_id',str(uuid.uuid4())),('hold','provider_id','Other'),('hold','account_id',None)]:
  rr,cc,ss,hh=copy.deepcopy(r),copy.deepcopy(c),copy.deepcopy(sc),copy.deepcopy(h);{'new':rr,'old':cc,'scope':ss,'hold':hh}[target][key]=value;assert not excluded(rr,cc,ss,hh),(target,key);checks.append('fail closed '+target+'.'+key+'='+str(value))
 for key in ['account_id','trip_id','integration_id','environment','task_class','provider_id','model_id','dispatch_state','execution_certainty']:
  cc=copy.deepcopy(c);cc[key]=None;assert not excluded(r,cc,sc);checks.append('NULL old.'+key+' keeps counting')
 for column in ['account_id','integration_id','task_id','call_id','contract_version','deadline','request_snapshot']:
  sql('UPDATE p2_resource_fixture.admissions SET '+column+'=NULL;');assert not excluded(r,c,sc);admission(m['deadline']);checks.append('missing admission '+column+' keeps counting')
 cc=copy.deepcopy(c);cc['execution_certainty']='UNKNOWN';assert excluded(r,cc,sc);checks.append('expired UNKNOWN lease stays charged but no longer blocks concurrency')
 rr=copy.deepcopy(r);rr['task_id']=str(uuid.uuid4());rr['import_id']=str(uuid.uuid4());assert excluded(rr,c,sc);checks.append('next normal QA Task uses same scoped lease rule without perTask exception')
 admission('2099-01-01T00:00:00Z');assert not excluded(r,c,sc);checks.append('unexpired or changed admission cannot be excluded');admission(m['deadline'])
 other=copy.deepcopy(c);other['call_id']=str(uuid.uuid4());assert not excluded(r,other,sc);checks.append('another live or UNKNOWN call still occupies sole concurrency slot')
 # Freeze only the test clock to verify millisecond boundary; deployed predicate is unchanged.
 import datetime
 saved=pred;fixed=datetime.datetime(2026,10,30,tzinfo=datetime.timezone.utc)
 pred=pred.replace('clock_timestamp()',"'2026-10-30T00:00:00Z'::timestamptz")
 for seconds,expected in [(59.999,False),(60,False),(60.001,True)]:
  admission((fixed-datetime.timedelta(seconds=seconds)).isoformat());assert excluded(r,c,sc)==expected;checks.append('strict grace boundary '+str(seconds)+' seconds='+str(expected))
 pred=saved;admission(m['deadline'])
 original="(select count(*) from public.flight_call_resource_holds h join public.external_integration_calls c using(call_id) where h.account_id=r.account_id and (c.dispatch_state<>'TERMINAL' or c.execution_certainty='UNKNOWN'))";assert original in pre and original not in post
 # This is the only body replacement; daily/money/idempotency/auth locking remain byte-identical.
 new=original[:-1]+' AND NOT coalesce(('+ (p/'P2_RESOURCE_LEASE_EXCEPTION_PREDICATE.sql').read_text().rstrip() +'),false))';assert pre.replace(original,new)==post;checks.append('only concurrency count changed; budget holds, daily sums, locks and lifetime admission unchanged')
 result={'status':'ISOLATED_PG_PASS_NOT_DEV','network':'none','checks':checks,'count':len(checks),'limits':'Exact installer/rollback and predicate fixtures; full owning reserve/lock covered by separate FULL_PG_RESULT; no hosted or Provider E2E.'};(p/'P2_RESOURCE_LEASE_ISOLATED_PG_RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:
 docker('rm','-f',name,ok=False)
