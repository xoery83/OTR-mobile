"""Actual Universal protected admission on a fresh cached, network-none PG17 clone."""
from pathlib import Path
import subprocess,json,uuid,time,copy,datetime,hashlib,re,base64,os
ROOT=Path(__file__).resolve().parents[2]
NAME='otr-universal-provider-'+uuid.uuid4().hex[:12]
IMAGE='otr-core-v2-server84-fixture:20261012'
created=False
checks=[]
def docker(*args):return subprocess.run(['docker',*args],capture_output=True,text=True)
try:
 result=docker('run','--name',NAME,'--network','none','-d',IMAGE);assert result.returncode==0,result.stderr;created=True
 for _ in range(50):
  if docker('exec',NAME,'pg_isready','-U','supabase_admin').returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('OWNED_FIXTURE_NOT_READY')
 # Reuse the accepted CP14/CP15 configuration fixtures, stopping before Flight scope creation.
 source=(ROOT/'scripts/cp15/security-acceptance.py').read_text().split('scope=dict(')[0]
 source=source.replace("'otr-cp15-acceptance'",repr(NAME))
 source=source.replace("'cp15-flight'",repr('universal-fixture-'+uuid.uuid4().hex[:8])).replace('vault:otr/dev/deepseek/flight-import-v1','vault:otr/dev/deepseek/universal-import-v1').replace('deepseek-flight-v1','deepseek-universal-v1')
 source=source.replace("schema_contracts=[{'id':'flight','version':1,'dialect':'otr'}],privacy_policy=", "schema_contracts=[{'id':'universal-import','version':1,'dialect':'otr'}],schema_output=True,privacy_policy=")
 start=source.index('rid=uid();fields=admin(runtime_enabled=True);')
 end=source.index("i=row('external_integrations');",start)
 source=source[:start]+"""revision=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';"))
invoke('external_integration_set_kill',admin(expected_version=revision,kill_switch=False))
"""+source[end:]
 ns={'__file__':str(ROOT/'scripts/cp15/security-acceptance.py')}
 exec(compile(source,ns['__file__'],'exec'),ns)
 globals().update({k:v for k,v in ns.items() if k not in ['ROOT','__file__','source','NAME','created','checks']})
 sql((ROOT/'supabase/migrations/20261012000100_model_task_protected_admission.sql').read_text(),'postgres')
 signatures=['cp_llm_validate_binding(jsonb,external_integration_calls,jsonb,boolean)','cp_llm_guard_model_task_admissions()','external_integration_mark_dispatch(jsonb,jsonb)']
 before={s:scalar("select md5(prosrc) from pg_proc where oid='public."+s+"'::regprocedure;") for s in signatures}
 sql((ROOT/'backend/sql/universal_provider_admission_candidate.sql').read_text(),'postgres')
 sql((ROOT/'backend/sql/universal_task_read_candidate.sql').read_text(),'postgres')
 for signature in signatures:
  body=base64.b64decode(scalar("select encode(convert_to(prosrc,'UTF8'),'base64') from pg_proc where oid='public."+signature+"'::regprocedure;")).decode()
  restored=hashlib.md5(re.sub(r'\n/\* UNIVERSAL_BRANCH_BEGIN \*/.*?/\* UNIVERSAL_BRANCH_END \*/\n','',body,flags=re.S).encode()).hexdigest()
  assert restored==before[signature],(signature,restored,before[signature])
 checks.append('three protected Flight bodies preserved byte-for-byte after removing Universal hooks')
 assert scalar('select count(*)=0 from universal_import_provider_scope;')=='t'
 assert scalar("select not runtime_enabled from external_integration_environment_state where environment='DEV';")=='t'
 checks.append('candidate installs CLOSED without global Provider runtime activation')
 trip=uid();sql(f"insert into public.trips(id,name,created_by) values('{trip}','Universal isolated synthetic','{actor}');",'supabase_admin')
 profile=json.loads((ROOT/'scripts/import-workbench/universal-profile-vector.json').read_text())['profile']
 assert json.loads(sql('select public.universal_import_expected_profile();','supabase_admin').stdout.strip())==profile
 deadline=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=600)).isoformat(timespec='milliseconds').replace('+00:00','Z')
 policy={'version':1,'privacy':'REMOTE_ALLOWED','network_required':True,'region':p['data_region'],'route':p['routing_class'],'budget_currency':'USD','budget_nanos':'1000000000','max_attempts':1,'deadline':deadline}
 def make():
  c=row('external_integration_calls');c.update(integration_id=i['integration_id'],environment='DEV',provider_config_id=p['provider_config_id'],provider_id='DeepSeek',model_id='deepseek-flash',model_version='DeepSeek-V4.1-Flash',adapter_version=p['adapter_version'],config_version=i['config_version'],configuration_sha256=i['config_sha256'],account_id=actor,user_id=actor,trip_id=trip,import_id=uid(),task_id=uid(),attempt_id=uid(),fallback_chain_id=uid(),attempt_sequence=1,request_sha256=H,input_sha256=H,schema_sha256=profile['output_schema_sha256'],capability='EXTRACT',task_class='UNIVERSAL_IMPORT_V1',call_kind='OUTBOUND_MODEL',shadow=False,price_schedule_id=price['price_schedule_id'],dispatch_state='RESERVED',execution_certainty='NOT_STARTED')
  s=row('external_integration_usage_events');s.update(call_id=c['call_id'],observation_key='start',observation_kind='START',measurement_mode='NONE',status='STARTED',usage_quality='UNKNOWN',cost_quality='UNKNOWN',price_schedule_id=price['price_schedule_id'],currency='USD');s.pop('provider_request_id',None)
  q={'contract_version':'otr-model-task-v1','task_id':c['task_id'],'logical_request_id':uid(),'logical_idempotency_key':uid(),'consumer_id':'import','consumer_version':1,'input':{'reference':uid(),'sha256':H,'byte_count':1},'schema':{'id':'UNIVERSAL_IMPORT_V1','version':1,'dialect':'OTR_TYPED_V1','sha256':profile['output_schema_sha256']},'policy_snapshot':copy.deepcopy(policy),'policy_sha256':digest(policy)}
  b={'version':1,'request':q,'request_sha256':digest(q),'profile':copy.deepcopy(profile),'profile_sha256':digest(profile)}
  return {'account_id':actor,'integration_id':i['integration_id'],'row':c,'start':s,'model_task_binding':b}
 def arm(f,budget='1000000000'):
  c=f['row'];b=f['model_task_binding']
  sql('delete from universal_import_provider_scope;','supabase_admin')
  sql("insert into universal_import_provider_scope values(true,"+','.join("'"+c[k]+"'::uuid" for k in ['account_id','trip_id','import_id','task_id','attempt_id','call_id'])+",'"+c['integration_id']+"','"+c['provider_config_id']+"'::uuid,'"+c['price_schedule_id']+"'::uuid,'"+c['request_sha256']+"',repeat('f',64),'"+c['input_sha256']+"',"+literal(b)+",32768,4096,"+budget+",clock_timestamp()-interval '1 second','"+deadline+"'::timestamptz);",'supabase_admin')
 def reserve(f,**kwargs):return invoke('universal_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id'],**kwargs)
 def counts():return scalar('select json_build_array((select count(*) from external_integration_calls),(select count(*) from model_task_admissions),(select count(*) from external_integration_usage_events));')
 def deny(f,code='ANY'):
  before=counts();reserve(f,expect_error=code);assert counts()==before
 f=make();deny(f,'UNIVERSAL_PROVIDER_SCOPE_CLOSED');checks.append('missing finite scope denies without writes')
 arm(f,budget='1');deny(f,'UNIVERSAL_MODEL_TASK_BUDGET');checks.append('conservative cost ceiling rejects before reservation')
 arm(f)
 wrong=copy.deepcopy(f);wrong['row']['account_id']=other;wrong['row']['user_id']=other
 deny(wrong);checks.append('cross-account call rejected')
 wrong=copy.deepcopy(f);wrong['model_task_binding']['profile']['execution_scope']='FLIGHT_IMPORT_V1';wrong['model_task_binding']['profile_sha256']=digest(wrong['model_task_binding']['profile']);deny(wrong);checks.append('Flight-only profile cannot authorize Universal')
 wrong=copy.deepcopy(f);wrong['row']['import_id']=None;deny(wrong);checks.append('null Batch binding rejected')
 # Calling generic CP14 reserve must not evade the Model Task lifetime binding.
 generic={k:v for k,v in f.items() if k!='model_task_binding'}
 before=counts();invoke('external_integration_reserve_call',generic,'call_gateway','TRUSTED_WORKLOAD',request_id=generic['row']['request_id'],expect_error='MODEL_TASK_BINDING_REQUIRED');assert counts()==before
 checks.append('old generic reserve cannot commit unbound Universal call')
 c=reserve(f);assert reserve(f)['call_id']==c['call_id'];checks.append('real one-call ModelTask admission and exact replay')
 sibling=copy.deepcopy(f);sibling['row']['attempt_id']=uid();sibling['row']['call_id']=uid();sibling['row']['request_id']=uid();arm(sibling);deny(sibling,'MODEL_TASK_ALREADY_ADMITTED');arm(f);checks.append('same Task second paid-call identity denied')
 def mark(c,**kwargs):return invoke('external_integration_mark_dispatch',{'account_id':actor,'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':1},'call_gateway','TRUSTED_WORKLOAD',**kwargs)
 sql("update universal_import_provider_scope set starts_at=clock_timestamp()-interval '120 seconds',expires_at=clock_timestamp()-interval '1 second';",'supabase_admin')
 mark(c,expect_error='UNIVERSAL_PROVIDER_SCOPE_EXPIRED');checks.append('expiry blocks actual dispatch transition')
 arm(f);marked=mark(c);assert marked['dispatch_state']=='MAY_HAVE_STARTED';checks.append('exact Universal dispatch succeeds while global runtime stays CLOSED')
 mark(c,expect_error='CP14_DISPATCH_FENCE');checks.append('duplicate dispatch rejected')
 receipt=json.loads(sql(f"set session authorization otr_external_integration_call_gateway;select model_task_read_universal_receipt('{actor}','{c['task_id']}','{c['attempt_id']}','{c['call_id']}');",'supabase_admin').stdout.strip())
 assert receipt['hasStart'] and receipt['admission']['profile_snapshot']==profile;checks.append('protected current Task/START receipt readback')
 # Kill after durable dispatch must revoke the exact scope consulted by credential acquire/send.
 rev=int(scalar("select config_version from external_integration_environment_state where environment='DEV';"))
 invoke('external_integration_set_kill',admin(expected_version=rev,kill_switch=True))
 assert sql(f"set session authorization otr_external_integration_call_gateway;select universal_import_read_scope('{actor}','{c['task_id']}','{c['attempt_id']}','{c['call_id']}');",'supabase_admin',True).returncode!=0
 rev=int(scalar("select config_version from external_integration_environment_state where environment='DEV';"))
 invoke('external_integration_set_kill',admin(expected_version=rev,kill_switch=False))
 checks.append('post-dispatch environment kill revokes credential/current-scope read before send')
 # Completion and terminal readback use the same existing CP14 usage/receipt authority.
 us=row('external_integration_usage_events');us.update(call_id=c['call_id'],observation_key='universal-completion',observation_kind='COMPLETION',measurement_mode='NONE',status='SUCCEEDED',usage_quality='UNKNOWN',cost_quality='UNKNOWN',price_schedule_id=price['price_schedule_id'],currency='USD',provider_request_id=None,response_sha256=H)
 cost=scalar("select ceil(sum(price_per_quantity*1000000000/unit_quantity*case measurement_unit when 'input_tokens' then 100 when 'output_tokens' then 20 else 0 end))::text from external_integration_price_schedule_units where price_schedule_id='"+price['price_schedule_id']+"';")
 us.update(measurement_mode='CUMULATIVE',usage_quality='ACTUAL_REPORTED',input_tokens=100,output_tokens=20,total_tokens=120,cached_input_tokens=0,reasoning_tokens=None,cost_nanos=cost,cost_quality='ESTIMATED',cost_calculation_version='SUM_THEN_CEIL_NANOS_V1')
 invoke('external_integration_usage_append',{'integration_id':i['integration_id'],'call_id':c['call_id'],'row':us},'call_gateway','TRUSTED_WORKLOAD')
 invoke('external_integration_observe_call',{'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':2,'publication_fence':1,'dispatch_state':'TERMINAL','execution_certainty':'TERMINAL','safe_reason':'SYNTHETIC_TERMINAL','recovery_sha256':None},'call_gateway','TRUSTED_WORKLOAD')
 final=json.loads(sql(f"set session authorization otr_external_integration_call_gateway;select model_task_read_universal_receipt('{actor}','{c['task_id']}','{c['attempt_id']}','{c['call_id']}');",'supabase_admin').stdout.strip())
 if os.environ.get('OTR_UNIVERSAL_TASK_RECEIPT_FIXTURE'):
  Path(os.environ['OTR_UNIVERSAL_TASK_RECEIPT_FIXTURE']).write_text(json.dumps(final,indent=2)+'\n')
 assert final['completion']['response_sha256']==H and final['call']['dispatch_state']=='TERMINAL'
 checks.append('existing CP14 completion/terminal immutable receipt independent readback')
 for role in ['anon','authenticated','service_role','otr_external_integration_call_gateway']:
  assert sql('set session authorization '+role+';select * from universal_import_provider_scope;','supabase_admin',True).returncode!=0
 checks.append('finite scope FORCE RLS and direct role access denied')
 sql('delete from universal_import_provider_scope;','supabase_admin')
 assert scalar("select not runtime_enabled from external_integration_environment_state where environment='DEV';")=='t'
 checks.append('finite capability removed and global runtime remains CLOSED')
 print(json.dumps({'status':'ISOLATED_PG_UNIVERSAL_ADMISSION_PASS','checks':checks,'fixture':NAME,'providerCalls':0,'hostedWrites':0},indent=2))
finally:
 if created:docker('rm','-f',NAME)
