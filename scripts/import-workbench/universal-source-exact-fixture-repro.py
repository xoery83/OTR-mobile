"""Exact synthetic Source metadata reproduction on owned network-none PG only."""
import argparse,json,pathlib
args=argparse.ArgumentParser();args.add_argument('--fixture',required=True);args.add_argument('--request',required=True);args.add_argument('--all-candidates',action='store_true');a=args.parse_args()
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
 result=json.loads(sql(gateway('select public.trip_source_begin_universal_inputs('+lit(actor)+'::uuid,'+lit(trip)+'::uuid,'+lit(json.dumps(request))+');')))
 assert result['id']==request['runId'] and result['state']=='PENDING'
 manifest=json.loads(sql(gateway('select public.trip_source_read_universal_inputs('+','.join(lit(v)+'::uuid' for v in [actor,trip,scope['batch_id'],scope['task_id'],scope['run_id']])+');')))
 assert len(manifest['representations'])==3
 assert json.loads(sql(gateway('select public.trip_source_begin_universal_inputs('+lit(actor)+'::uuid,'+lit(trip)+'::uuid,'+lit(json.dumps(request))+');')))['id']==request['runId']
 print(json.dumps({'status':'EXACT_SYNTHETIC_SOURCE_SQL_PASS','fixtureSHA256':hashlib.sha256(fixture_path.read_bytes()).hexdigest(),'requestSHA256':hashlib.sha256(request_path.read_bytes()).hexdigest(),'owningInputSHA256':actual_input_sha,'checks':['same three exact Source/revision/representation rows; only local FK fixtures and capability UTC changed','actual input_valid true for three pins','same Run/Batch/Task begin creates one PENDING Run and three Inputs','same owning retained Source read returns three materials','exact replay returns same Run'],'hostedWrites':0,'providerCalls':0,'notAuthOrActualRuntimePASS':True,'installedCandidates':installed,'pdfPrivateDependencies':'CLOSED fixture sentinels; exact observed four roots, no PDF Runtime claim' if all_candidates else 'not installed'},indent=2))
finally:
 if created:docker('rm','-f',NAME)
'''
exec(compile(prefix+body,str(base),'exec'),{'__file__':str(base),'actual':actual,'request':request,'fixture_path':fixture_path,'request_path':request_path,'all_candidates':a.all_candidates})
