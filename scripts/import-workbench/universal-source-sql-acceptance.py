"""Universal Source candidate on one owned, network-none PG17 Server84 clone only."""
import hashlib
import json
import pathlib
import subprocess
import time
import uuid
import os

ROOT=pathlib.Path(__file__).resolve().parents[2]
IMAGE='otr-core-v2-server84-fixture:20261012'
NAME='otr-universal-source-'+uuid.uuid4().hex[:12]
ACTOR='00000000-0000-4000-8000-000000000002'
OTHER='00000000-0000-4000-8000-000000000003'
TRIP='10000000-0000-4000-8000-000000000001'
ids={k:str(uuid.uuid4()) for k in ('source','representation','input','run','batch','task')}
checks=[]
def docker(*args,text=None,required=True):
 p=subprocess.run(['/opt/homebrew/bin/docker',*args],input=text,text=True,capture_output=True)
 if required and p.returncode:raise RuntimeError(p.stderr[-3000:])
 return p
def sql(text,error=None):
 p=docker('exec','-i',NAME,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',text=text,required=False)
 if error:assert p.returncode and error in p.stderr,(error,p.stderr)
 else:assert p.returncode==0,p.stderr
 return p.stdout.strip()
def lit(v):return "'"+str(v).replace("'","''")+"'"
def gateway(q):return "SET SESSION AUTHORIZATION otr_trip_source_command_gateway;"+q
def check(name):checks.append(name)
created=False
try:
 docker('image','inspect',IMAGE)
 docker('run','--name',NAME,'--network','none','-d',IMAGE);created=True
 for _ in range(50):
  if docker('exec',NAME,'pg_isready','-U','supabase_admin',required=False).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('OWNED_FIXTURE_NOT_READY')
 original=sql("select jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) from pg_proc where oid in ('public.trip_source_publish_flight_run(uuid,uuid,text)'::regprocedure,'public.trip_import_catalog_write_guard()'::regprocedure);")
 edges=sql("select coalesce(jsonb_agg(to_jsonb(m) order by m.oid), '[]') from pg_auth_members m where roleid='otr_trip_source_writer'::regrole and member='postgres'::regrole;")
 candidate=(ROOT/'backend/sql/universal_source_host_candidate.sql').read_text()
 sql('SET ROLE postgres;'+candidate)
 assert original==sql("select jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) from pg_proc where oid in ('public.trip_source_publish_flight_run(uuid,uuid,text)'::regprocedure,'public.trip_import_catalog_write_guard()'::regprocedure);")
 after_edges=sql("select coalesce(jsonb_agg(to_jsonb(m) order by m.oid), '[]') from pg_auth_members m where roleid='otr_trip_source_writer'::regrole and member='postgres'::regrole;")
 assert edges==after_edges,(edges,after_edges)
 check('historical Flight publisher/catalog guard and administrator role edge unchanged')
 assert sql('select count(*)=0 from trip_source_universal_scope;')=='t'
 assert sql("select not enabled from trip_source_command_gate;")=='t'
 assert sql("select not flight_admission_enabled and not capture_admission_enabled from trip_import_admission_gate;")=='t'
 check('install default CLOSED without opening Source/Import gates')
 text='Museum walk\nGrand Hotel\nSynthetic itinerary on 2026-11-01'
 sha=hashlib.sha256(text.encode()).hexdigest()
 s,r=ids['source'],ids['representation']
 sql("BEGIN;SET CONSTRAINTS ALL DEFERRED;"+''.join('ALTER TABLE '+t+' DISABLE TRIGGER USER;' for t in ['trip_sources','trip_source_revisions','trip_source_representations'])+
  "insert into trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) values("+','.join([lit(s),lit(TRIP),lit(ACTOR),lit(s),lit(sha),"'TEXT'","'PASTE'","'UNKNOWN'","clock_timestamp()","1","1"])+");"+
  "insert into trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) values("+','.join([lit(s),'1','clock_timestamp()',lit(ACTOR),lit(s),lit(sha),'ARRAY['+lit(r)+'::uuid]',"'AS_SUPPLIED'","'ACQUISITION'"])+");"+
  "insert into trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state) values("+','.join([lit(r),'1',lit(s),'1',"'ORIGINAL'","'TEXT'","'UTF-8'",lit(sha),str(len(text.encode())),lit(text),"'NOT_APPLICABLE'",'clock_timestamp()',"'NOT_APPLICABLE'"])+");SET CONSTRAINTS ALL IMMEDIATE;"+''.join('ALTER TABLE '+t+' ENABLE TRIGGER USER;' for t in ['trip_sources','trip_source_revisions','trip_source_representations'])+'COMMIT;')
 pin={'id':ids['input'],'source_id':s,'material_revision':1,'representation_id':r,'payload_sha256':sha,'byte_count':len(text.encode()),'observed_source_row_revision':1,'historical_selection':False}
 request={'runId':ids['run'],'batchId':ids['batch'],'taskId':ids['task'],'submissionSha256':'a'*64,'inputs':[pin]}
 def begin(q=request,actor=ACTOR):return 'select public.trip_source_begin_universal_inputs('+lit(actor)+'::uuid,'+lit(TRIP)+'::uuid,'+lit(json.dumps(q))+');'
 def read(actor=ACTOR):return 'select public.trip_source_read_universal_inputs('+','.join(lit(x)+'::uuid' for x in [actor,TRIP,ids['batch'],ids['task'],ids['run']])+');'
 sql(gateway(begin()),error='UNIVERSAL_SOURCE_SCOPE_CLOSED');check('unprovisioned begin denied')
 sql("insert into trip_source_universal_scope values(true,"+','.join(lit(x)+'::uuid' for x in [ACTOR,TRIP,ids['batch'],ids['task'],ids['run']])+",repeat('a',64),public.trip_import_run_input_hash("+lit(json.dumps([pin]))+"::jsonb),clock_timestamp()-interval '1 second',clock_timestamp()+interval '60 seconds');")
 result=json.loads(sql(gateway(begin())))
 assert result['state']=='PENDING' and result['capture_batch_id']==ids['batch'] and result['interpretation_task_id']==ids['task']
 assert json.loads(sql(gateway(read())))['representations'][0]['text']==text
 check('real Run/Input PENDING creation and retained TEXT read before any model result')
 catalog=json.loads(sql(gateway("select public.trip_source_read_import_catalogs("+lit(ACTOR)+"::uuid,"+lit(TRIP)+"::uuid);")))
 assert catalog['trip_source_runs'][0]['state']=='PENDING'
 assert 'capture_batch_id' not in catalog['trip_source_runs'][0]
 check('generic owning catalog includes PENDING Run while preserving V1 physical columns')
 if os.environ.get('OTR_UNIVERSAL_FIXTURE_SNAPSHOT'):
  pathlib.Path(os.environ['OTR_UNIVERSAL_FIXTURE_SNAPSHOT']).write_text(json.dumps({'catalog':catalog,'manifest':json.loads(sql(gateway(read()))),'run':result}))
 assert json.loads(sql(gateway(begin())))['id']==ids['run'];check('exact begin replay has one immutable Run')
 changed=json.loads(json.dumps(request));changed['submissionSha256']='b'*64
 sql(gateway(begin(changed)),error='UNIVERSAL_SOURCE_SCOPE_CLOSED');check('changed request rejected')
 sql(gateway(read(OTHER)),error='UNIVERSAL_SOURCE_RUN_UNAVAILABLE');check('cross-account material unavailable')
 sql("update trip_source_universal_scope set starts_at=clock_timestamp()-interval '120 seconds',expires_at=clock_timestamp()-interval '1 second';")
 sql(gateway(begin()),error='UNIVERSAL_SOURCE_SCOPE_CLOSED');check('expired begin capability denied')
 sql('ALTER TABLE trip_sources DISABLE TRIGGER USER;update trip_sources set lifecycle=\'DELETED\',deleted_at=clock_timestamp(),deleted_by='+lit(ACTOR)+' where id='+lit(s)+';ALTER TABLE trip_sources ENABLE TRIGGER USER;')
 sql(gateway(read()),error='INPUT_STALE');check('retention/lifecycle revocation blocks current material read')
 assert sql("select count(*)=0 from trip_source_candidates where run_id="+lit(ids['run'])+';')=='t'
 assert sql('select not enabled from trip_source_command_gate;')=='t'
 check('no Candidate/Admission and original Source gate remains CLOSED')
 print(json.dumps({'status':'ISOLATED_PG_SOURCE_PASS','schemaSha256':hashlib.sha256(candidate.encode()).hexdigest(),'fixture':NAME,'checks':checks,'hostedWrites':0,'providerCalls':0},indent=2))
finally:
 if created:docker('rm','-f',NAME)
