"""Actual owning Source registration/Run/Input on one network-none disposable PG.
No DEV/Auth/Provider/Native acceptance. Reuses existing Trip/SQL fixture setup.
"""
from pathlib import Path
import os
import tempfile
root=Path(__file__).resolve().parents[2]
base=root/'scripts/trip/trip-sustained-sync-acceptance.py'
s=base.read_text();s=s[:s.index(' person_id=str(uuid.uuid4())')].replace("docker('run','--name'","docker('run','--pull=never','--name'")
s=s.replace("packet=ROOT/'docs/ops/trip-p1-sustained-sync-20261024'", "packet=pathlib.Path(tempfile.mkdtemp(prefix='otr-continuous-source-preimage-'))")
original=(root/'scripts/import-workbench/universal-original-source-sql-acceptance.py').read_text()
command=original[original.index('canon=lambda'):original.index('created=False')]
addition=r'''
 sql('set role postgres;'+(ROOT/'backend/sql/universal_source_host_candidate.sql').read_text())
 sql('set role postgres;'+(ROOT/'backend/sql/universal_original_source_candidate.sql').read_text())
 sql('set role postgres;'+(ROOT/'backend/sql/universal_original_result_candidate.sql').read_text())
 # Existing DEV guard body, with unavailable PDF paths kept closed. Normal Source
 # is tested through its actual registration functions, never seeded Source JSON.
 sql("create function public.trip_source_pdf_upload_v4_scope() returns jsonb language plpgsql as $$begin raise exception 'PDF_CLOSED_FIXTURE';end$$;")
 sql('set role postgres;GRANT otr_trip_source_writer TO postgres WITH INHERIT TRUE,SET TRUE;GRANT CREATE ON SCHEMA public TO otr_trip_source_writer;'+(ROOT/'docs/ops/universal-dev-execution-20261024/runtime-recovery-20261025/ACTUAL_PDF_ONLY_RUN_GUARD.sql').read_text()+';ALTER FUNCTION public.trip_source_run_only_row(text,text,jsonb) OWNER TO otr_trip_source_writer;REVOKE ALL ON FUNCTION public.trip_source_run_only_row(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,authenticator;REVOKE CREATE ON SCHEMA public FROM otr_trip_source_writer;')
 # Install the accepted guard BODY on the cached isolated fixture. The cached
 # trigger differs from DEV: this tests behavior, not deployed preimage fitness.
 # The production candidate and its strict installation preflight are unchanged.
 guard=(ROOT/'backend/sql/universal_run_only_guard_candidate.sql').read_text()
 insertion=guard.split('addition text:=$universal$',1)[1].split('$universal$;',1)[0]
 helper=(ROOT/'docs/ops/universal-dev-execution-20261024/runtime-recovery-20261025/ACTUAL_PDF_ONLY_RUN_GUARD.sql').read_text()
 helper=helper.replace('begin\n q:=public.trip_source_pdf_upload_v4_scope();','begin\n'+insertion+' q:=public.trip_source_pdf_upload_v4_scope();')
 sql('set role postgres;GRANT CREATE ON SCHEMA public TO otr_trip_source_writer;'+helper+';ALTER FUNCTION public.trip_source_run_only_row(text,text,jsonb) OWNER TO otr_trip_source_writer;REVOKE ALL ON FUNCTION public.trip_source_run_only_row(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,authenticator;REVOKE CREATE ON SCHEMA public FROM otr_trip_source_writer;')
 # Existing import trigger delegates to the identical owning guard before its
 # older fixture checks, mirroring the real trigger dispatch boundary.
 sql("do $patch$declare def text;body text;begin select pg_get_functiondef(oid),prosrc into def,body from pg_proc where oid='public.trip_import_catalog_write_guard()'::regprocedure;execute replace(def,body,replace(body,E'begin\n',E'begin\n perform public.trip_source_run_only_row(tg_table_name,tg_op,to_jsonb(new));\n'));end $patch$;")
 sql('set role postgres;'+(ROOT/'backend/sql/universal_sustained_source_candidate.sql').read_text())
 sql('set role postgres;'+(ROOT/'supabase/migrations/20261012000100_model_task_protected_admission.sql').read_text().replace('revoke otr_external_integration_meter_writer from postgres;','-- Preserve cached fixture owner edge; original legacy installer tested separately.'))
 sql('set role postgres;'+(ROOT/'backend/sql/universal_provider_admission_candidate.sql').read_text())
 sql('set role postgres;'+(ROOT/'backend/sql/universal_task_read_candidate.sql').read_text())
 sql('set role postgres;'+(ROOT/'backend/sql/universal_sustained_provider_candidate.sql').read_text())
 import os
 cost_guard_mode=os.environ.get('OTR_TEST_AI_COST_GUARD')
 v3_mode=os.environ.get('OTR_TEST_IMPORT_V3')=='1'
 if v3_mode and cost_guard_mode!='off':raise RuntimeError('V3_FIXTURE_EXPECTS_DEV_OFF')
 cost_guard_off=cost_guard_mode=='off'
 if cost_guard_mode in ('on','off'):
  sql((ROOT/'backend/sql/universal_ai_cost_guard_candidate.sql').read_text())
  sql((ROOT/'backend/sql/universal_ai_cost_guard_finite_nullable_candidate.sql').read_text())
 if v3_mode:
  sql('set role postgres;'+(ROOT/'backend/sql/universal_v3_task_read_candidate.sql').read_text())
  sql('set role postgres;'+(ROOT/'backend/sql/universal_v3_provider_admission_candidate.sql').read_text())
 check('normal Provider candidate installs while Source policy remains CLOSED')
 sql("alter role otr_trip_source_command_gateway login connection limit 1 valid until 'infinity';")
 def source(q):return sql('set session authorization otr_trip_source_command_gateway;'+q)
 sql("set session authorization otr_trip_source_command_gateway;select public.trip_source_find_sustained_universal_binding('"+ACTOR+"','"+TRIP+"','"+str(uuid.uuid4())+"');",failure='UNIVERSAL_SOURCE_CLOSED');check('normal Source capability installs default CLOSED')
 sql("update public.trip_sustained_dev_policy set universal_import_enabled=true where actor_account_id='"+ACTOR+"';")
 # Exact DEV metadata: two owner-grant rows, no SET/INHERIT on either.
 # Disposable fixture only; installation itself must preserve memberships.
 sql("GRANT otr_trip_source_command_gateway TO postgres WITH ADMIN TRUE,INHERIT FALSE,SET FALSE GRANTED BY supabase_admin;SET ROLE postgres;GRANT otr_trip_source_command_gateway TO postgres WITH ADMIN FALSE,INHERIT FALSE,SET FALSE GRANTED BY postgres;")
 check('old strict predicate rejects exact retained redundant owner edge',sql("SELECT count(*) FROM pg_auth_members m WHERE m.roleid='otr_trip_source_command_gateway'::regrole AND NOT (m.member='postgres'::regrole AND m.admin_option AND NOT m.inherit_option);")=='1')
 check('compatible owning predicate accepts exact nonprivileged DEV pair',source("select public.trip_source_find_sustained_universal_binding('"+ACTOR+"','"+TRIP+"','"+str(uuid.uuid4())+"');")=='')
 for option in ['SET','INHERIT']:
  sql('SET ROLE postgres;GRANT otr_trip_source_command_gateway TO postgres WITH '+option+' TRUE GRANTED BY postgres;')
  sql("set session authorization otr_trip_source_command_gateway;select public.trip_source_find_sustained_universal_binding('"+ACTOR+"','"+TRIP+"','"+str(uuid.uuid4())+"');",failure='UNIVERSAL_SOURCE_CLOSED')
  sql('SET ROLE postgres;GRANT otr_trip_source_command_gateway TO postgres WITH '+option+' FALSE GRANTED BY postgres;')
  check('redundant owner '+option+' privilege remains rejected')
 sql('CREATE ROLE foreign_member;GRANT otr_trip_source_command_gateway TO foreign_member WITH ADMIN FALSE,INHERIT FALSE,SET FALSE;')
 sql("set session authorization otr_trip_source_command_gateway;select public.trip_source_find_sustained_universal_binding('"+ACTOR+"','"+TRIP+"','"+str(uuid.uuid4())+"');",failure='UNIVERSAL_SOURCE_CLOSED')
 sql('REVOKE otr_trip_source_command_gateway FROM foreign_member;');check('foreign membership remains rejected')

 check('actual adopted V2 Trip qualifies explicit Source policy',source("select public.trip_source_find_sustained_universal_binding('"+ACTOR+"','"+TRIP+"','"+str(uuid.uuid4())+"');")=='')
'''
# Reuse exact owning command codec vectors; actor/trip are the freshly created
# normal Trip from the existing setup, not the original fixture UUIDs.
addition+='\n import hashlib,datetime\n lit=literal\n'+''.join(' '+line+'\n' for line in command.splitlines())
addition+=r'''
 records=[command('\ufeff中文 Synthetic original\r\nStay: 2026-11-03','行程.TXT'),command('Activity: Museum walk\n2026-11-03',None)]
 for q,p in records:
  wire=canon(q)
  check('exact unknown Source result is absent',source("select public.trip_source_lookup_universal_original('"+ACTOR+"',"+literal(wire)+");")=='')
  first=json.loads(source(acquire(q)));check('actual original registers with immutable APPLIED receipt',first['outcome']=='APPLIED')
  check('exact original replay returns same receipt',json.loads(source(acquire(q)))==first)
 check('no finite QA scope was installed',sql('select count(*) from public.trip_source_universal_scope;')=='0')
 batch,task,run=[str(uuid.uuid4()) for _ in range(3)]
 inputs=[{'id':str(uuid.uuid4()),'source_id':q['source_id'],'material_revision':1,'representation_id':q['payload']['original']['id'],'payload_sha256':q['payload']['original']['payload_sha256'],'byte_count':q['payload']['original']['byte_count'],'observed_source_row_revision':1,'historical_selection':False} for q,p in records]
 q={'runId':run,'taskId':task,'batchId':batch,'submissionSha256':'a'*64,'inputs':inputs}
 begin="select public.trip_source_begin_sustained_universal_inputs('"+ACTOR+"','"+TRIP+"',"+literal(canon(q))+");"
 first=json.loads(source(begin));check('real normal Run stays immutable PENDING',first['state']=='PENDING')
 check('normal same Batch replay reuses same Run',json.loads(source(begin))==first)
 read="select public.trip_source_find_sustained_universal_binding('"+ACTOR+"','"+TRIP+"','"+batch+"');"
 binding=json.loads(source(read));check('readback uses persisted real Source pins',binding['taskId']==task and len(binding['inputs'])==2)
 check('original payload read is retained UTF8, not fake Snapshot',len(json.loads(source("select public.trip_source_read_sustained_universal_inputs('"+ACTOR+"','"+TRIP+"','"+batch+"','"+task+"','"+run+"');"))['representations'])==2)
 # Existing CP14/15 synthetic admin fixture installs actual configuration through
 # owning commands. No external authentication, network or Provider call occurs.
 fixture_source=(ROOT/'scripts/import-workbench/universal-provider-sql-acceptance.py').read_text()
 setup=fixture_source[fixture_source.index(' # Reuse the accepted CP14/CP15'):fixture_source.index(" sql((ROOT/'supabase/migrations/20261012000100",fixture_source.index(' # Reuse the accepted CP14/CP15'))]
 setup='\n'.join(line[1:] if line.startswith(' ') else line for line in setup.splitlines())
 setup=setup[:setup.index('globals().update')].replace('vault:otr/dev/deepseek/universal-import-v1','vault:otr/dev/backend/OTR_DEV_DEEPSEEK_API_KEY')
 if v3_mode:
  needle="capabilities=['EXTRACT'],modalities=['TEXT']"
  expanded="capabilities=['EXTRACT'],modalities=['TEXT','IMAGE']"
  setup=setup.replace("ns={'__file__':",f"source=source.replace({needle!r},{expanded!r})\nns={{'__file__':")
  setup=setup.replace("{'id':'universal-import','version':1,'dialect':'otr'}", "{'id':'universal-import','version':1,'dialect':'otr'},{'id':'universal-import','version':3,'dialect':'otr'}")
 provision={'ROOT':ROOT,'NAME':NAME,'json':json,'uuid':uuid}
 exec(compile(setup,'existing-cp15-synthetic-fixture','exec'),provision)
 P=provision['ns'];row,invoke,digest=P['row'],P['invoke'],P['digest'];i,p,price=P['i'],P['p'],P['price'];admin=P['admin'];pliteral=P['literal']
 profile=json.loads((ROOT/'scripts/import-workbench/universal-profile-vector.json').read_text())['profile']
 sql("alter role otr_external_integration_call_gateway login connection limit 1 valid until 'infinity';")
 sql("GRANT otr_external_integration_call_gateway TO postgres WITH ADMIN TRUE,INHERIT FALSE,SET FALSE GRANTED BY supabase_admin;SET ROLE postgres;GRANT otr_external_integration_call_gateway TO postgres WITH ADMIN FALSE,INHERIT FALSE,SET FALSE GRANTED BY postgres;")
 check('Meter principal retains exact DEV nonprivileged redundant owner edge',sql("SELECT count(*) FROM pg_auth_members WHERE roleid='otr_external_integration_call_gateway'::regrole AND member='postgres'::regrole AND NOT admin_option AND NOT inherit_option AND NOT set_option;")=='1')

 scope=row('flight_activation_scopes');scope.update(environment='DEV',workload='UNIVERSAL_IMPORT_V1',provider_id='DeepSeek',model_id='deepseek-flash',expected_family='DeepSeek-V4.1-Flash',shadow=False,active=True,integration_id=i['integration_id'],integration_version=i['config_version'],configuration_sha256=i['config_sha256'],provider_config_id=p['provider_config_id'],price_schedule_id=price['price_schedule_id'],pins={'adapter_version':p['adapter_version'],'prompt_sha256':profile['prompt_sha256'],'output_schema_sha256':profile['output_schema_sha256'],'profile_sha256':digest(profile),'task_lifetime_ms':600000,'price_sha256':price['schedule_sha256'],'provider_config_sha256':p['configuration_sha256']},expires_at=P['FUTURE'],input_ceiling=32768,output_ceiling=4096,concurrent_account=1,account_daily=20,dev_daily=100,provider_daily=100,max_attempts=1,monetary_approved=True,currency='USD',call_cost_nanos='1000000000',account_day_cost_nanos='10000000000',dev_day_cost_nanos='100000000000',created_by=P['actor'],created_at=P['NOW'])
 scope['scope_sha256']=json.loads(P['scalar']("select to_jsonb(public.cp14_hash(to_jsonb(jsonb_populate_record(null::public.flight_activation_scopes,"+pliteral(scope)+"))-'scope_sha256'));"))
 invoke('flight_activation_select',admin(integration_id=i['integration_id'],expected_version=0,row=scope))
 grant={'scope_id':scope['scope_id'],'account_id':ACTOR,'revision':1,'expires_at':P['FUTURE'],'revoked':False,'updated_by':P['actor']}
 invoke('flight_activation_account_grant',admin(integration_id=i['integration_id'],expected_version=0,row=grant))
 def meter(q):return sql('set session authorization otr_external_integration_call_gateway;'+q)
 selection_sql="select public.universal_import_select_continuous('"+ACTOR+"','"+TRIP+"','"+i['integration_id']+"');"
 selected=json.loads(meter(selection_sql))
 if cost_guard_off:
  default_meter=meter
  def meter(q):return default_meter("SET otr.ai_cost_guard='off';"+q)
  check('default keeps the price pin; OFF returns no price pin',
        selected['priceScheduleId']==price['price_schedule_id'] and json.loads(meter(selection_sql))['priceScheduleId'] is None)
 check('real CP15 selection uses explicit Universal profile without Flight-global runtime',selected['modelId']=='deepseek-flash' and P['scalar']("select not runtime_enabled from external_integration_environment_state where environment='DEV';")=='t')
 inputpins=[{'kind':'SOURCE','source_id':q['source_id'],'material_revision':1,'representation_id':q['payload']['original']['id'],'payload_sha256':q['payload']['original']['payload_sha256'],'byte_count':q['payload']['original']['byte_count'],'input_id':pin['id'],'transform_sha256':None} for (q,_),pin in zip(records,inputs)]
 inputpins.sort(key=lambda q:q['input_id']);inputsha=digest(inputpins)
 started=json.loads(source(read))['createdAt'];deadline=(datetime.datetime.fromisoformat(started.replace('Z','+00:00'))+datetime.timedelta(seconds=600)).isoformat(timespec='milliseconds').replace('+00:00','Z')
 policy={'version':1,'privacy':'REMOTE_ALLOWED','network_required':True,'region':p['data_region'],'route':p['routing_class'],'budget_currency':'USD','budget_nanos':'1000000000','max_attempts':1,'deadline':deadline}
 c=row('external_integration_calls');c.update(integration_id=i['integration_id'],environment='DEV',provider_config_id=p['provider_config_id'],provider_id='DeepSeek',model_id='deepseek-flash',model_version='DeepSeek-V4.1-Flash',adapter_version=p['adapter_version'],config_version=i['config_version'],configuration_sha256=i['config_sha256'],account_id=ACTOR,user_id=ACTOR,trip_id=TRIP,import_id=batch,task_id=task,attempt_id=str(uuid.uuid4()),fallback_chain_id=str(uuid.uuid4()),attempt_sequence=1,request_sha256='a'*64,input_sha256=inputsha,schema_sha256=profile['output_schema_sha256'],capability='EXTRACT',task_class='UNIVERSAL_IMPORT_V1',call_kind='OUTBOUND_MODEL',shadow=False,price_schedule_id=price['price_schedule_id'],dispatch_state='RESERVED',execution_certainty='NOT_STARTED')
 usage=row('external_integration_usage_events');usage.update(call_id=c['call_id'],observation_key='start',observation_kind='START',measurement_mode='NONE',status='STARTED',usage_quality='UNKNOWN',cost_quality='UNKNOWN',price_schedule_id=price['price_schedule_id'],currency='USD');usage.pop('provider_request_id',None)
 req={'contract_version':'otr-model-task-v1','task_id':task,'logical_request_id':str(uuid.uuid4()),'logical_idempotency_key':str(uuid.uuid4()),'consumer_id':'import','consumer_version':1,'input':{'reference':str(uuid.uuid4()),'sha256':inputsha,'byte_count':sum(x['byte_count'] for x in inputs)},'schema':{'id':'UNIVERSAL_IMPORT_V1','version':1,'dialect':'OTR_TYPED_V1','sha256':profile['output_schema_sha256']},'policy_snapshot':policy,'policy_sha256':digest(policy)}
 binding={'version':1,'request':req,'request_sha256':digest(req),'profile':profile,'profile_sha256':digest(profile)}
 if cost_guard_off:
  c['price_schedule_id']=None
  usage.update(price_schedule_id=None,currency=None)
  scope_query="select public.universal_import_read_continuous_scope("+pliteral(c)+','+pliteral(binding)+",repeat('f',64));"
  sql('set session authorization otr_external_integration_call_gateway;'+scope_query,failure='UNIVERSAL_MODEL_TASK_BINDING')
  live=json.loads(meter(scope_query))
  check('OFF retains Source/Task proof with no price units',live['price_schedule_id'] is None and live['priceUnits'] is None)
  context={'verified_actor_id':ACTOR,'verified_account_id':ACTOR}
  def off_command(kind,fields,request_id=None):
   cmd,ctx=P['request'](kind,fields,'call_gateway','TRUSTED_WORKLOAD',context,request_id)
   return json.loads(meter(f'select public.{kind}({pliteral(ctx)},{pliteral(cmd)});'))
  fields={'account_id':ACTOR,'integration_id':i['integration_id'],'row':c,'start':usage,'model_task_binding':binding}
  accepted=off_command('universal_activation_reserve_call',fields,c['request_id'])
  check('durable call and START admit exactly once without a monetary hold',
        accepted['call_id']==c['call_id'] and off_command('universal_activation_reserve_call',fields,c['request_id'])['call_id']==c['call_id']
        and sql("select count(*) from public.flight_call_resource_holds where call_id='"+c['call_id']+"';")=='0')
  mark={'account_id':ACTOR,'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':1}
  marked=off_command('external_integration_mark_dispatch',mark)
  check('existing dispatch fence marks the unpriced call',marked['dispatch_state']=='MAY_HAVE_STARTED')
  completion=row('external_integration_usage_events')
  completion.update(call_id=c['call_id'],observation_key='universal-completion',observation_kind='COMPLETION',
    measurement_mode='CUMULATIVE',status='SUCCEEDED',usage_quality='ACTUAL_REPORTED',cost_quality='UNKNOWN',
    input_tokens=100,output_tokens=20,total_tokens=120,cached_input_tokens=0,response_sha256='a'*64)
  invoke('external_integration_usage_append',{'integration_id':i['integration_id'],'call_id':c['call_id'],'row':completion},
    'call_gateway','TRUSTED_WORKLOAD',ctx_updates=context)
  invoke('external_integration_observe_call',{'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':2,
    'publication_fence':1,'dispatch_state':'TERMINAL','execution_certainty':'TERMINAL','safe_reason':None,'recovery_sha256':None},
    'call_gateway','TRUSTED_WORKLOAD',ctx_updates=context)
  receipt_args="('"+ACTOR+"','"+task+"','"+c['attempt_id']+"','"+c['call_id']+"');"
  receipt=json.loads(default_meter('select public.model_task_read_universal_receipt'+receipt_args))
  check('ON or cold read still sees actual usage, unknown cost and terminal result',
    receipt['completion']['input_tokens']==100 and receipt['completion']['cost_nanos'] is None
    and receipt['call']['dispatch_state']=='TERMINAL'
    and json.loads(default_meter('select public.universal_import_read_admitted_price'+receipt_args))==[])
  c['price_schedule_id']=price['price_schedule_id']
 else:
  live=json.loads(meter("select public.universal_import_read_continuous_scope("+pliteral(c)+','+pliteral(binding)+",repeat('f',64));"))
  fields={'account_id':ACTOR,'integration_id':i['integration_id'],'scope_id':scope['scope_id'],'scope_revision':scope['revision'],'scope_sha256':scope['scope_sha256'],'grant_revision':1,'input_ceiling':32768,'output_ceiling':4096,'execution_pins':live['execution_pins'],'execution_pins_sha256':digest(live['execution_pins']),'row':c,'start':usage,'model_task_binding':binding}
  ctx={'verified_actor_id':ACTOR,'verified_account_id':ACTOR}
  reserve=lambda f:invoke('flight_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=c['request_id'],ctx_updates=ctx)
  accepted=reserve(fields);check('real protected Model Task + CP15 hold admission succeeds',accepted['call_id']==c['call_id'])
  check('same protected reservation replays exact Call',reserve(fields)['call_id']==c['call_id'])
  marked=invoke('external_integration_mark_dispatch',{'account_id':ACTOR,'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':1},'call_gateway','TRUSTED_WORKLOAD',ctx_updates=ctx)
  check('existing CP15 dispatch fence permits explicitly qualified Universal',marked['dispatch_state']=='MAY_HAVE_STARTED')
  check('actual immutable admitted price remains readable',len(json.loads(meter("select public.universal_import_read_admitted_price('"+ACTOR+"','"+task+"','"+c['attempt_id']+"','"+c['call_id']+"');")))==3)
 sql("set session authorization otr_external_integration_call_gateway;select public.universal_import_select_continuous('"+P['other']+"','"+TRIP+"','"+i['integration_id']+"');",failure='UNIVERSAL_PROVIDER_CLOSED');check('cross Account cannot select a normal Universal scope')
 sql("set session authorization otr_external_integration_call_gateway;select public.universal_import_read_continuous_scope("+pliteral(c)+','+pliteral(binding)+",null);",failure='UNIVERSAL_SCOPE_INVALID');check('missing exact Provider payload hash rejects')
 changed=dict(c);changed['task_id']=str(uuid.uuid4())
 sql("set session authorization otr_external_integration_call_gateway;select public.universal_import_read_continuous_scope("+pliteral(changed)+','+pliteral(binding)+",repeat('f',64));",failure='UNIVERSAL_SOURCE_CLOSED');check('unowned Task DTO cannot replace real Source binding')
 changed_binding=json.loads(json.dumps(binding));changed_binding['profile']['execution_scope']='FLIGHT_IMPORT_V1'
 sql("set session authorization otr_external_integration_call_gateway;select public.universal_import_read_continuous_scope("+pliteral(c)+','+pliteral(changed_binding)+",repeat('f',64));",failure='UNIVERSAL_MODEL_TASK_BINDING');check('Flight profile cannot stand in for Universal')
 check('owning SourceRun remains PENDING after Model Task admission',json.loads(source(read))['taskId']==task and sql("select state from trip_source_runs where id='"+run+"';")=='PENDING')
 check('Meter gateway has no Source table read privilege',sql("select has_table_privilege('otr_external_integration_call_gateway','public.trip_source_representations','SELECT');")=='f')
 if v3_mode:
  profile_v3=json.loads(sql('select public.universal_import_v3_profile();'))
  v3c=dict(c)
  for key in ['call_id','task_id','import_id','attempt_id','request_id','idempotency_key','fallback_chain_id']:
   v3c[key]=str(uuid.uuid4())
  v3c.update(price_schedule_id=None,schema_sha256=profile_v3['output_schema_sha256'],request_sha256='d'*64)
  v3policy={**policy,'deadline':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=595)).isoformat(timespec='milliseconds').replace('+00:00','Z')}
  v3req={**req,'task_id':v3c['task_id'],'logical_request_id':str(uuid.uuid4()),'logical_idempotency_key':str(uuid.uuid4()),
   'consumer_version':3,'schema':{**req['schema'],'id':profile_v3['execution_scope'],'sha256':profile_v3['output_schema_sha256']},
   'policy_snapshot':v3policy,'policy_sha256':digest(v3policy)}
  v3binding={'version':1,'request':v3req,'request_sha256':digest(v3req),'profile':profile_v3,'profile_sha256':digest(profile_v3)}
  v3read="select public.universal_import_read_continuous_scope("+pliteral(v3c)+','+pliteral(v3binding)+",repeat('d',64));"
  check('V3 qualified current scope has no Source Run',json.loads(meter(v3read))['batch_id']==v3c['import_id'] and
   sql("select count(*) from public.trip_source_runs where capture_batch_id='"+v3c['import_id']+"' or interpretation_task_id='"+v3c['task_id']+"';")=='0')
  sql("set session authorization otr_external_integration_call_gateway;SET otr.ai_cost_guard='off';"+v3read.replace("repeat('d',64)","repeat('c',64)"),failure='UNIVERSAL_MODEL_TASK_BINDING')
  wrong_trip=dict(v3c,trip_id=str(uuid.uuid4()))
  sql("set session authorization otr_external_integration_call_gateway;SET otr.ai_cost_guard='off';"+
   v3read.replace(pliteral(v3c),pliteral(wrong_trip)),failure='UNIVERSAL_SOURCE_CLOSED')
  check('V3 same outbound digest cannot authorize another Trip',True)
  v3fields={**fields,'row':v3c,'start':{**usage,'call_id':v3c['call_id'],'observation_id':v3c['call_id']},'model_task_binding':v3binding}
  check('V3 uses existing durable ModelTask admission exactly once',
   off_command('universal_activation_reserve_call',v3fields,v3c['request_id'])['call_id']==v3c['call_id']
   and off_command('universal_activation_reserve_call',v3fields,v3c['request_id'])['call_id']==v3c['call_id'])
  wrong_req={**v3req,'input':{**v3req['input'],'sha256':'b'*64}}
  wrong_binding={**v3binding,'request':wrong_req,'request_sha256':digest(wrong_req)}
  wrong_fields={**v3fields,'model_task_binding':wrong_binding}
  wrong_cmd,wrong_ctx=P['request']('universal_activation_reserve_call',wrong_fields,'call_gateway',
    'TRUSTED_WORKLOAD',context,v3c['request_id'])
  sql("set session authorization otr_external_integration_call_gateway;SET otr.ai_cost_guard='off';"
    +f"select public.universal_activation_reserve_call({pliteral(wrong_ctx)},{pliteral(wrong_cmd)});",
    failure='CP14_CHANGED_REQUEST')
  check('V3 fixed Task and Call refuse a changed request material digest',True)
  check('V3 dispatch uses the existing mark fence',
   off_command('external_integration_mark_dispatch',{**mark,'call_id':v3c['call_id']})['dispatch_state']=='MAY_HAVE_STARTED')
  v3args="('"+ACTOR+"','"+v3c['task_id']+"','"+v3c['attempt_id']+"','"+v3c['call_id']+"');"
  v3receipt=json.loads(default_meter('select public.model_task_read_universal_v3_receipt'+v3args))
  check('independent V3 reader binds the durable V3 profile and START',
   v3receipt['hasStart'] and v3receipt['admission']['profile_snapshot']==profile_v3
   and default_meter('select public.model_task_read_universal_receipt'+v3args)=='')
  v3completion={**completion,'observation_id':str(uuid.uuid4()),'call_id':v3c['call_id']}
  invoke('external_integration_usage_append',{'integration_id':i['integration_id'],'call_id':v3c['call_id'],'row':v3completion},
   'call_gateway','TRUSTED_WORKLOAD',ctx_updates=context)
  invoke('external_integration_observe_call',{'integration_id':i['integration_id'],'call_id':v3c['call_id'],'expected_revision':2,
   'publication_fence':1,'dispatch_state':'TERMINAL','execution_certainty':'TERMINAL','safe_reason':None,'recovery_sha256':None},
   'call_gateway','TRUSTED_WORKLOAD',ctx_updates=context)
  v3receipt=json.loads(default_meter('select public.model_task_read_universal_v3_receipt'+v3args))
  check('independent V3 receipt retains usage and terminal response binding',
   v3receipt['completion']['response_sha256']=='a'*64 and v3receipt['call']['dispatch_state']=='TERMINAL')
  if os.environ.get('OTR_TEST_IMPORT_V3_HTTP')=='1':
   import runpy
   core_fixture=runpy.run_path(str(ROOT/'scripts/trip/core-v3-local-document-acceptance.py'))
   core_fixture['install_core_local_document'](ROOT,sql)

   env=dict(os.environ,OTR_V3_PROVIDER_FIXTURE=NAME,OTR_V3_FIXTURE_ACTOR=ACTOR,OTR_V3_FIXTURE_TRIP=TRIP,OTR_V3_FIXTURE_INTEGRATION=i['integration_id'])
   result=subprocess.run([str(ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','--no-cache',
    'backend/src/universalV3Execution.sql.test.ts'],cwd=ROOT,env=env,timeout=45)
   assert result.returncode==0
   check('V3 HTTP mixed-model review, Core save, independent readback and Native SQLite reopen complete')

 # Optional combined Stage II installer regression on this same disposable DB.
 import os
 if os.environ.get('OTR_UNIVERSAL_INCLUDE_P1_SQL')=='1':
  sql('set role postgres;'+(ROOT/'backend/sql/universal_p1_source_admission_candidate.sql').read_text())
  env={**os.environ,'OTR_UNIVERSAL_P1_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_FIXTURE_ACTOR':ACTOR,'OTR_UNIVERSAL_P1_FIXTURE_TRIP':TRIP}
  checked=subprocess.run([str(ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','backend/src/universalP1SourcePg.sql.test.ts'],cwd=ROOT,env=env,capture_output=True,text=True,timeout=120)
  print(checked.stdout);assert checked.returncode==0,checked.stdout+checked.stderr
  check('combined normal Source/CP15 and P1 Source Prepare/Core/finalizer coexist')
 sql("update public.trip_sustained_dev_policy set universal_import_enabled=false where actor_account_id='"+ACTOR+"';")
 sql('set session authorization otr_trip_source_command_gateway;'+read,failure='UNIVERSAL_SOURCE_CLOSED');check('policy revoke closes normal owning read')
 if cost_guard_off:
  import copy
  finite=copy.deepcopy(fields)
  fc=finite['row']
  fc['price_schedule_id']=None
  for key in ('call_id','task_id','attempt_id','request_id'):
   fc[key]=str(uuid.uuid4())
  finite['start'].update(call_id=fc['call_id'],observation_id=fc['call_id'])
  fr=finite['model_task_binding']['request']
  fr.update(task_id=fc['task_id'],logical_request_id=str(uuid.uuid4()),logical_idempotency_key=str(uuid.uuid4()))
  finite['model_task_binding']['request_sha256']=digest(fr)
  literal_scope=pliteral(dict(singleton=True,actor_id=ACTOR,trip_id=TRIP,batch_id=fc['import_id'],
    task_id=fc['task_id'],attempt_id=fc['attempt_id'],call_id=fc['call_id'],integration_id=i['integration_id'],
    provider_config_id=p['provider_config_id'],price_schedule_id=price['price_schedule_id'],
    request_sha256=fc['request_sha256'],provider_request_sha256='f'*64,input_sha256=fc['input_sha256'],
    model_binding=finite['model_task_binding'],input_ceiling=32768,output_ceiling=4096,max_cost_nanos=1,
    starts_at=started,expires_at=deadline))
  sql("insert into public.universal_import_provider_scope select * from jsonb_populate_record(null::public.universal_import_provider_scope,"+literal_scope+");")
  priced=copy.deepcopy(finite)
  priced['row']['price_schedule_id']=price['price_schedule_id']
  priced['start'].update(price_schedule_id=price['price_schedule_id'],currency='USD')
  invoke('universal_activation_reserve_call',priced,'call_gateway','TRUSTED_WORKLOAD',request_id=fc['request_id'],
    ctx_updates=context,expect_error='UNIVERSAL_MODEL_TASK_BUDGET')
  sql("update public.universal_import_provider_scope set price_schedule_id=null;")
  invoke('universal_activation_reserve_call',finite,'call_gateway','TRUSTED_WORKLOAD',request_id=fc['request_id'],
    ctx_updates=context,expect_error='UNIVERSAL_PRICE_UNAVAILABLE')
  finite_args="('"+ACTOR+"','"+fc['task_id']+"','"+fc['attempt_id']+"','"+fc['call_id']+"');"
  finite_read=json.loads(meter('select public.universal_import_read_scope'+finite_args))
  check('finite OFF returns exact scope without price and skips a budget that blocks ON',
    finite_read['price_schedule_id'] is None and finite_read['priceUnits'] is None
    and off_command('universal_activation_reserve_call',finite,fc['request_id'])['call_id']==fc['call_id'])
  check('finite OFF retains actual mark-dispatch identity',
    off_command('external_integration_mark_dispatch',{**mark,'call_id':fc['call_id']})['dispatch_state']=='MAY_HAVE_STARTED')
  inverse=(ROOT/'backend/sql/universal_ai_cost_guard_finite_nullable_inverse.sql').read_text()
  sql(inverse,failure='23502')
  sql('delete from public.universal_import_provider_scope;')
  sql(inverse)
  check('finite DDL inverse requires scope closure and preserves the accepted call',
    sql("select price_schedule_id is null from public.external_integration_calls where call_id='"+fc['call_id']+"';")=='t')
 print(json.dumps({'status':'CONTINUOUS_SOURCE_PROVIDER_ISOLATED_PG_ONLY','checks':checks,'hostedWrites':0,'providerCalls':0},indent=2))
finally:
 if created:docker('rm','-f',NAME)
'''
if os.environ.get('OTR_TEST_IMPORT_V3_PRICED')=='1':
 # Retain only the owning SQL and CP14/CP15 setup before the joined V3 run.
 setup=addition[:addition.index(" check('normal Provider candidate installs")]
 setup=setup.replace("os.environ.get('OTR_TEST_AI_COST_GUARD')", "'on'")
 setup=setup.replace("os.environ.get('OTR_TEST_IMPORT_V3')=='1'", 'True')
 setup=setup.replace(" if v3_mode and cost_guard_mode!='off':raise RuntimeError('V3_FIXTURE_EXPECTS_DEV_OFF')\n",'')
 setup+=" sql(\"update public.trip_sustained_dev_policy set universal_import_enabled=true where actor_account_id='\"+ACTOR+\"';\")\n"
 provision=addition[addition.index(' # Existing CP14/15 synthetic admin fixture'):addition.index(' def meter(q):')]
 provision=provision.replace(" provision={'ROOT'", r""" rate_old="'unit_quantity':1000,'price_per_quantity':'0.000001'"
 rate_new="'unit_quantity':1000000,'price_per_quantity':{'input_tokens':'0.30','cached_input_tokens':'0.006','output_tokens':'1.20'}[k]"
 setup=setup.replace("ns={'__file__':", "source=source.replace("+repr(rate_old)+","+repr(rate_new)+")\nns={'__file__':")
 provision={'ROOT'""")
 provision=provision.replace("call_cost_nanos='1000000000'","call_cost_nanos='500000000'")
 addition=setup+provision+r'''
 import runpy
 core_fixture=runpy.run_path(str(ROOT/'scripts/trip/core-v3-local-document-acceptance.py'))
 core_fixture['install_core_local_document'](ROOT,sql)
 env=dict(os.environ,OTR_V3_PROVIDER_FIXTURE=NAME,OTR_V3_FIXTURE_ACTOR=ACTOR,OTR_V3_FIXTURE_TRIP=TRIP,
  OTR_V3_FIXTURE_INTEGRATION=i['integration_id'],OTR_V3_FIXTURE_PRICE=price['price_schedule_id'])
 result=subprocess.run([str(ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','--no-cache',
  'backend/src/universalV3Execution.sql.test.ts'],cwd=ROOT,env=env,timeout=45)
 assert result.returncode==0
 print(json.dumps({'status':'V3_PRICED_MULTI_IMAGE_CORE_SAVE_COLD_RESTORE_ISOLATED',
  'realDecoders':bool(os.environ.get('OTR_V3_FIXTURE_DECODER_IMAGE')),'hostedWrites':0,'providerCalls':0}))
finally:
 if created:docker('rm','-f',NAME)
'''
s+=addition
exec(compile(s,str(base),'exec'),{'__file__':str(base),'__name__':'__main__','tempfile':tempfile})
