"""Exact synthetic Source metadata reproduction on owned network-none PG only."""
import argparse,json,pathlib
args=argparse.ArgumentParser();args.add_argument('--fixture',required=True);args.add_argument('--request',required=True);args.add_argument('--all-candidates',action='store_true');args.add_argument('--actual-write-boundary');args.add_argument('--apply-guard-delta',action='store_true');a=args.parse_args()
fixture_path=pathlib.Path(a.fixture);request_path=pathlib.Path(a.request)
actual=json.loads(fixture_path.read_text());request=json.loads(request_path.read_text())
assert actual.get('syntheticOnly') is True and actual.get('readOnly') is True
ROOT=pathlib.Path(__file__).resolve().parents[2]
base=ROOT/'scripts/import-workbench/universal-source-sql-acceptance.py'
prefix=base.read_text().split(" text='Museum walk")[0]
body=r'''
 if all_candidates:
  observed=json.loads((ROOT/'scripts/import-workbench/fixtures/universal-pdf-v4-observed-roots.json').read_text())
  sql("create function public.trip_source_pdf_upload_v4_scope() returns jsonb language plpgsql as $$begin raise exception 'PDF_V4_FIXTURE_CLOSED';end$$;create function public.trip_source_pdf_registration_gate() returns void language plpgsql as $$begin raise exception 'PDF_REGISTRATION_FIXTURE_CLOSED';end$$;")
  for root in observed['roots']:
   sql(root['definition']+';')
   if root['name']=='trip_source_pdf_upload_v4_command(jsonb)':sql('alter function public.'+root['name']+' owner to otr_trip_source_writer;')
   assert sql("select md5(prosrc) from pg_proc where oid="+lit('public.'+root['name'])+"::regprocedure;")==root['body_md5']
  sql("DO $patch$declare d text;begin select pg_get_functiondef(oid) into d from pg_proc where oid='public.trip_source_register(text,uuid,text)'::regprocedure;execute replace(d,'perform public.trip_source_assert_gate();','perform public.trip_source_assert_gate(); perform public.trip_source_pdf_upload_v4_command(j);');end$patch$;")
  assert sql("select md5(prosrc) from pg_proc where oid='public.trip_source_register(text,uuid,text)'::regprocedure;")=='0a350c6e55e425dbd6c225a26fb3fd76'
 packet=json.loads((ROOT/'docs/ops/universal-dev-execution-20261024/EXECUTION_PACKET.proposed.json').read_text())
 ordered=packet['sqlInstallOrder'] if all_candidates else ['backend/sql/universal_source_host_candidate.sql','backend/sql/universal_original_source_candidate.sql']
 # Prefix already installed the first candidate; apply the exact remaining order.
 installed=[ordered[0]]
 for path in ordered[1:]:
  sql(('SET SESSION AUTHORIZATION postgres;' if 'model_task_dependency' in path else 'SET ROLE postgres;')+(ROOT/path).read_text());installed.append(path)

 f=actual['fixture'];scope=actual['scope'];actor=scope['actor_id'];trip=scope['trip_id']
 assert len(f['sources'])==len(f['revisions'])==len(f['representations'])==3
 assert request['runId']==scope['run_id'] and request['batchId']==scope['batch_id'] and request['taskId']==scope['task_id'] and request['submissionSha256']==scope['submission_sha256']
 account_ids=sorted({actor,f['trip']['created_by'],*[r['acquired_by'] for r in f['sources']]})
 for actor_id in account_ids:
  sql('insert into auth.users(id) values('+lit(actor_id)+');insert into public.profiles(id,display_name) values('+lit(actor_id)+",'Exact synthetic Source fixture');")
 sql('insert into public.trips(id,name,created_by) values('+lit(trip)+",'Exact synthetic Source fixture',"+lit(f['trip']['created_by'])+');')
 for m in f['members']:
  sql('insert into public.trip_members(id,trip_id,user_id) values('+','.join(lit(m[k]) for k in ['id','trip_id','user_id'])+') ON CONFLICT (trip_id,user_id) DO UPDATE SET id=excluded.id;')
 tables=['trip_sources','trip_source_revisions','trip_source_representations']
 seed='BEGIN;SET CONSTRAINTS ALL DEFERRED;'+''.join('ALTER TABLE public.'+t+' DISABLE TRIGGER USER;' for t in tables)
 for table,key in zip(tables,['sources','revisions','representations']):
  for row in f[key]:seed+='insert into public.'+table+' select (jsonb_populate_record(null::public.'+table+','+lit(json.dumps(row))+ '::jsonb)).*;'
 seed+='SET CONSTRAINTS ALL IMMEDIATE;'+''.join('ALTER TABLE public.'+t+' ENABLE TRIGGER USER;' for t in tables)+'COMMIT;'
 sql(seed)
 pins=request['inputs']
 actual_input_sha=sql('select public.trip_import_run_input_hash('+lit(json.dumps(pins))+'::jsonb);')
 assert actual_input_sha==scope['input_sha256'],(actual_input_sha,scope['input_sha256'])
 local_scope=dict(scope);local_scope['starts_at']='2000-01-01T00:00:00Z';local_scope['expires_at']='2000-01-01T00:01:00Z'
 # Only time is requalified for the disposable fixture; every identity/hash remains exact.
 sql('insert into public.trip_source_universal_scope select (jsonb_populate_record(null::public.trip_source_universal_scope,'+lit(json.dumps(local_scope))+'::jsonb)).*;')
 sql("update public.trip_source_universal_scope set starts_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '60 seconds';")
 valid=[]
 for pin in pins:
  valid.append(sql('select public.trip_import_input_valid(jsonb_populate_record(null::public.trip_source_inputs,'+lit(json.dumps({**pin,'run_id':request['runId'],'confirmation_id':None}))+'::jsonb),'+lit(actor)+'::uuid,'+lit(trip)+'::uuid,true);'))
 assert valid==['t']*3,valid

 boundary_checks=[]
 if boundary_path:
  metadata=json.loads(pathlib.Path(boundary_path).read_text())
  definitions={t['function']:t['body'] for t in metadata['triggers']}
  for definition in definitions.values():sql(definition+';')
  sql(metadata['runOnlyGuard']+';')
  sql("alter function public.trip_source_run_only_row(text,text,jsonb) owner to otr_trip_source_writer;revoke all on function public.trip_source_run_only_row(text,text,jsonb) from public,anon,authenticated,service_role,authenticator,postgres;grant execute on function public.trip_source_run_only_row(text,text,jsonb) to otr_trip_source_writer;")
  sql(gateway('select public.trip_source_begin_universal_inputs('+lit(actor)+'::uuid,'+lit(trip)+'::uuid,'+lit(json.dumps(request))+');'),error='PDF_V4_FIXTURE_CLOSED')
  assert sql('select count(*) from public.trip_source_runs where id='+lit(scope['run_id'])+';')=='0'
  boundary_checks.append('exact actual catalog write guard + private run-only guard reproduces PDF-scope refusal; Run absent after rollback')
  if not apply_delta:
   print(json.dumps({'status':'EXACT_ACTUAL_WRITE_BOUNDARY_REPRODUCED','checks':boundary_checks,'hostedWrites':0,'providerCalls':0},indent=2));raise SystemExit(0)
  before_guard=sql("select prosrc from pg_proc where oid='public.trip_source_run_only_row(text,text,jsonb)'::regprocedure;")
  before_meta=sql("select jsonb_build_array(proowner,proacl,prosecdef,proconfig) from pg_proc where oid='public.trip_source_run_only_row(text,text,jsonb)'::regprocedure;")
  sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'backend/sql/universal_run_only_guard_candidate.sql').read_text())
  after_guard=sql("select prosrc from pg_proc where oid='public.trip_source_run_only_row(text,text,jsonb)'::regprocedure;")
  import re
  assert re.sub(r' /\* UNIVERSAL_RUN_ONLY_BEGIN \*/.*? /\* UNIVERSAL_RUN_ONLY_END \*/\n','',after_guard,flags=re.S)==before_guard
  assert before_meta==sql("select jsonb_build_array(proowner,proacl,prosecdef,proconfig) from pg_proc where oid='public.trip_source_run_only_row(text,text,jsonb)'::regprocedure;")
  assert sql("select md5(prosrc) from pg_proc where oid='public.trip_import_catalog_write_guard()'::regprocedure;")=='f8d041b3f82024d9d3f5472cb0ffe363'
  boundary_checks.append('finite prefix only; PDF remainder, function owner/ACL/invoker/search_path and catalog write guard byte-preserved')
 result=json.loads(sql(gateway('select public.trip_source_begin_universal_inputs('+lit(actor)+'::uuid,'+lit(trip)+'::uuid,'+lit(json.dumps(request))+');')))
 assert result['id']==request['runId'] and result['state']=='PENDING'
 manifest=json.loads(sql(gateway('select public.trip_source_read_universal_inputs('+','.join(lit(v)+'::uuid' for v in [actor,trip,scope['batch_id'],scope['task_id'],scope['run_id']])+');')))
 assert len(manifest['representations'])==3
 assert json.loads(sql(gateway('select public.trip_source_begin_universal_inputs('+lit(actor)+'::uuid,'+lit(trip)+'::uuid,'+lit(json.dumps(request))+');')))['id']==request['runId']

 if boundary_path and apply_delta:
  sql("create function public.fixture_check_run_guard(tab text,op text,n jsonb) returns void language plpgsql security definer set search_path=pg_catalog as $$begin perform public.trip_source_run_only_row(tab,op,n);end$$;alter function public.fixture_check_run_guard(text,text,jsonb) owner to otr_trip_source_writer;")
  def guard(row,tab='trip_source_runs',op='INSERT',prefix='',error=None,as_gateway=True):
   query='select public.fixture_check_run_guard('+lit(tab)+','+lit(op)+','+lit(json.dumps(row))+'::jsonb);'
   return sql(prefix+(gateway(query) if as_gateway else query),error=error)
  row=json.loads(sql('select to_jsonb(r) from public.trip_source_runs r where id='+lit(scope['run_id'])+';'))
  guard(row)
  for key,value in [('actor_account_id',OTHER),('trip_id',TRIP),('capture_batch_id',ids['batch']),('interpretation_task_id',ids['task']),('capture_submission_sha256','0'*64),('input_sha256','0'*64),('state','RUNNING'),('retention_state','IDENTITY_ONLY'),('row_revision',2),('row_revision',None),('state',None),('created_at',None),('scope_source_ids',row['scope_source_ids'][:-1]),('extra_field',True)]:
   changed=dict(row);changed[key]=value;guard(changed,error='UNIVERSAL_RUN_WRITE_DENIED')
  guard(row,op='UPDATE',error='UNIVERSAL_RUN_WRITE_DENIED')
  guard({'run_id':scope['run_id']},tab='trip_source_candidates',error='UNIVERSAL_RUN_WRITE_DENIED')
  guard(row,as_gateway=False,error='UNIVERSAL_RUN_WRITE_DENIED')
  for update in ["delete from public.trip_source_universal_scope;","update public.trip_source_universal_scope set starts_at=clock_timestamp()-interval '120 seconds',expires_at=clock_timestamp()-interval '1 second';","update public.trip_source_universal_scope set source_command_pins=jsonb_set(source_command_pins,'{0,representationId}',to_jsonb('00000000-0000-4000-8000-000000000099'::text));"]:
   guard(row,prefix='BEGIN;'+update,error='UNIVERSAL_RUN_WRITE_DENIED')
  pinrow=json.loads(sql('select to_jsonb(i) from public.trip_source_inputs i where run_id='+lit(scope['run_id'])+' order by id limit 1;'))
  guard(pinrow,tab='trip_source_inputs')
  for key,value in [('payload_sha256','0'*64),('byte_count',pinrow['byte_count']+1),('material_revision',2),('observed_source_row_revision',2),('historical_selection',True),('historical_selection',None),('observed_source_row_revision',None),('representation_id',ids['representation']),('confirmation_id',ids['input']),('extra_field',True)]:
   changed=dict(pinrow);changed[key]=value;guard(changed,tab='trip_source_inputs',error='UNIVERSAL_RUN_WRITE_DENIED')
  guard(pinrow,tab='trip_source_inputs',op='UPDATE',error='UNIVERSAL_RUN_WRITE_DENIED')
  guard(row,prefix='BEGIN;ALTER TABLE public.trip_sources DISABLE TRIGGER USER;update public.trip_sources set lifecycle=\'DELETED\',deleted_at=clock_timestamp(),deleted_by='+lit(actor)+' where id='+lit(row['scope_source_ids'][0])+';',error='UNIVERSAL_RUN_WRITE_DENIED')
  # Non-Universal/PDF-shaped rows still reach the original CLOSED PDF scope.
  pdf=dict(row);pdf.update(extractor_key='existing-pdf-extractor',capture_batch_id=None,interpretation_task_id=None,capture_submission_sha256=None,id=ids['run'])
  guard(pdf,error='PDF_V4_FIXTURE_CLOSED')
  sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'backend/sql/universal_run_only_guard_candidate.sql').read_text(),error='UNIVERSAL_RUN_GUARD_PREIMAGE')
  boundary_checks.append('negative current/scope/expiry/Actor/Trip/Batch/Task/source/representation/hash/revision/lifecycle/op/extra-field/role cases deny; original PDF path remains CLOSED; reapply refuses')
 print(json.dumps({'status':'EXACT_SYNTHETIC_SOURCE_SQL_PASS','fixtureSHA256':hashlib.sha256(fixture_path.read_bytes()).hexdigest(),'requestSHA256':hashlib.sha256(request_path.read_bytes()).hexdigest(),'owningInputSHA256':actual_input_sha,'checks':['same three exact Source/revision/representation rows; only local FK fixtures and capability UTC changed','actual input_valid true for three pins','same Run/Batch/Task begin creates one PENDING Run and three Inputs','same owning retained Source read returns three materials','exact replay returns same Run'],'hostedWrites':0,'providerCalls':0,'notAuthOrActualRuntimePASS':True,'installedCandidates':installed,'actualWriteBoundaryChecks':boundary_checks,'pdfPrivateDependencies':'CLOSED fixture sentinels; exact observed four roots, no PDF Runtime claim' if all_candidates else 'not installed'},indent=2))
finally:
 if created:docker('rm','-f',NAME)
'''
exec(compile(prefix+body,str(base),'exec'),{'__file__':str(base),'actual':actual,'request':request,'fixture_path':fixture_path,'request_path':request_path,'all_candidates':a.all_candidates,'boundary_path':a.actual_write_boundary,'apply_delta':a.apply_guard_delta})
