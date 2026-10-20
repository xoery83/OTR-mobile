"""Actual protected Server84 roots on synthetic network-none fixtures only."""
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=(root/'scripts/cp14/persistence-acceptance.py').read_text().split('equal(scalar("select count(*) from public.external_integration_environment_state')[0]
source=source.replace("CONTAINER='otr-cp14-acceptance'","CONTAINER='otr-cp15-acceptance'").replace("'environment':'TEST'","'environment':'DEV'").replace("'verified_environment':'TEST'","'verified_environment':cmd['environment']")
source=source.replace("return result\n\ndef request","result.pop('provider_request_id',None)\n return result\n\ndef request")
exec(compile(source,str(root/'scripts/cp14/persistence-acceptance.py'),'exec'))
# All monetary values below are synthetic fixture policy, never live policy.
for permission in ['CONFIG_ADMIN','SECURITY_ADMIN','COST_READER','SUPPORT_RECOVERY']:
 sql(f"insert into public.external_integration_admin_grants(admin_grant_id,actor_id,environment,permission,expires_at,created_at,created_by) values('{uid()}','{actor}','DEV','{permission}','{FUTURE}','{NOW}','{actor}');")
sql(f"insert into public.external_integration_admin_grants(admin_grant_id,actor_id,environment,permission,expires_at,created_at,created_by) values('{uid()}','{other}','DEV','CONFIG_ADMIN','{FUTURE}','{NOW}','{actor}');")
def admin(**f):return {'actor_id':actor,'integration_id':None,'expected_version':1,'audit_id':uid(),'reason_code':'SYNTHETIC',**f}
for env in ['TEST','PRODUCTION']:
 invoke('flight_activation_runtime',admin(environment=env,runtime_enabled=True),expect_error='CP15_INVALID_COMMAND')
 structural=sql(f"begin;alter table public.external_integration_environment_state disable trigger cp14_guard;update public.external_integration_environment_state set runtime_enabled=true where environment='{env}';rollback;",allow_error=True);equal(structural.returncode!=0,True,'structural '+env);assert 'cp15_dev_runtime_only' in structural.stderr,structural.stderr
for role in ['anon','authenticated','service_role','authenticator','otr_external_integration_admin_gateway','otr_external_integration_call_gateway']:
 equal(sql(f"set session authorization {role};update public.external_integration_environment_state set runtime_enabled=true where environment='DEV';",'supabase_admin',True).returncode!=0,True,'runtime direct denial '+role)
for table in ['flight_activation_scopes','flight_activation_account_grants','flight_call_resource_holds']:
 equal(scalar(f"select relrowsecurity and relforcerowsecurity and relowner='postgres'::regrole from pg_class where oid='public.{table}'::regclass;"),'t','FORCE RLS '+table)
 for role in ['anon','authenticated','service_role','authenticator','otr_external_integration_admin_gateway','otr_external_integration_call_gateway']:
  equal(scalar(f"select has_table_privilege('{role}','public.{table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE');"),'f','no direct rights '+role+'/'+table)
invoke('flight_activation_runtime',admin(actor_id=other,runtime_enabled=True),ctx_updates={'verified_actor_id':other,'verified_account_id':other},expect_error='CP14_ADMIN_FORBIDDEN')
rid=uid();fields=admin(runtime_enabled=True);v=invoke('flight_activation_runtime',fields,request_id=rid);equal(v['version'],2,'DEV runtime command');equal(invoke('flight_activation_runtime',fields,request_id=rid),v,'runtime replay')
invoke('flight_activation_runtime',{**fields,'runtime_enabled':False},request_id=rid,expect_error='CP14_CHANGED_REQUEST')
invoke('flight_activation_runtime',admin(runtime_enabled=False,expected_version=1),expect_error='CP15_CAS')
equal(scalar("select kill_switch from public.external_integration_environment_state where environment='DEV';"),'t','runtime does not clear kill')
invoke('external_integration_set_kill',admin(expected_version=2,kill_switch=False))
i=row('external_integrations');i.update(integration_id='cp15-flight',category='INTELLIGENCE_OUTBOUND',vendor_namespace='DeepSeek',environment='DEV',enabled=True,kill_switch=True,config_version=1,capabilities=['EXTRACT'],health_state='UNKNOWN',credential_reference='vault:otr/dev/deepseek/flight-import-v1',created_by=actor,updated_by=actor)
invoke('external_integration_configure',admin(integration_id=i['integration_id'],expected_version=None,row=i))
invoke('external_integration_set_kill',admin(integration_id=i['integration_id'],kill_switch=False))
i=json.loads(scalar("select to_jsonb(i) from public.external_integrations i where integration_id='cp15-flight';"))
p=row('intelligence_provider_configs');p.update(integration_id=i['integration_id'],provider_id='DeepSeek',model_id='deepseek-flash',model_version='DeepSeek-V4.1-Flash',adapter_version='deepseek-flight-v1',provider_class='COMMERCIAL_REMOTE',capabilities=['EXTRACT'],modalities=['TEXT'],schema_contracts=[{'id':'flight','version':1,'dialect':'otr'}],privacy_policy='REMOTE_ALLOWED',network_required=True,routing_class='COMMERCIAL_REMOTE',routing_eligibility='ELIGIBLE',replay_support='UNSUPPORTED',created_by=actor)
invoke('intelligence_provider_config_append',admin(integration_id=i['integration_id'],expected_version=None,row=p))
price=row('external_integration_price_schedules');price.update(integration_id=i['integration_id'],provider_id='DeepSeek',model_id='deepseek-flash',schedule_version='synthetic-v1',currency='USD',effective_from=NOW,rounding_policy='SUM_THEN_CEIL_NANOS_V1',created_by=actor)
units=[{'price_schedule_id':price['price_schedule_id'],'unit_key':k,'measurement_unit':k,'unit_quantity':1000,'price_per_quantity':'0.000001','unit_definition':{'version':1,'relationship':'DISJOINT','included_in':None,'billable':True}} for k in ['input_tokens','cached_input_tokens','output_tokens']]
invoke('external_integration_price_append',admin(integration_id=i['integration_id'],expected_version=None,row=price,units=units))
scope=dict(scope_id=uid(),revision=1,environment='DEV',workload='FLIGHT_IMPORT_V1',provider_id='DeepSeek',model_id='deepseek-flash',expected_family='DeepSeek-V4.1-Flash',shadow=False,active=True,integration_id=i['integration_id'],integration_version=i['config_version'],configuration_sha256=i['config_sha256'],provider_config_id=p['provider_config_id'],price_schedule_id=price['price_schedule_id'],pins={**{k:H for k in ['prompt_sha256','envelope_sha256','output_schema_sha256','minimizer_sha256','privacy_sha256','policy_sha256','price_sha256','provider_config_sha256']},'adapter_version':p['adapter_version'],'envelope_version':'FLIGHT_REMOTE_TEXT_V1','minimizer_version':'OTR_FLIGHT_WHITELIST_UTF8_V1','privacy_profile':'REMOTE_ALLOWED_MINIMIZED_TEXT_V1'},scope_sha256=H,expires_at=FUTURE,input_ceiling=8192,output_ceiling=2048,concurrent_account=1,account_daily=20,dev_daily=100,provider_daily=100,max_attempts=1,monetary_approved=False,currency='USD',call_cost_nanos=None,account_day_cost_nanos=None,dev_day_cost_nanos=None,created_by=actor,created_at=NOW)
def seal(s):s['scope_sha256']=scalar(f"select public.cp14_hash(to_jsonb(jsonb_populate_record(null::public.flight_activation_scopes,{literal(s)}))-'scope_sha256');");return s
scope=seal(scope)
def select(s,expected=None,**kwargs):return invoke('flight_activation_select',admin(integration_id=i['integration_id'],expected_version=s['revision']-1 if expected is None else expected,row=seal(s)),**kwargs)
select(scope)
select(scope,ctx_updates={'verified_actor_id':other,'verified_account_id':other},expect_error='CP14_SCOPE_FORBIDDEN')
grant={'scope_id':scope['scope_id'],'account_id':actor,'revision':1,'expires_at':FUTURE,'revoked':False,'updated_by':actor}
def grant_account(g,**kwargs):return invoke('flight_activation_account_grant',admin(integration_id=i['integration_id'],expected_version=g['revision']-1,row=g),**kwargs)
grant_account(grant)
trip=uid();sql(f"insert into public.trips(id,name,created_by) values('{trip}','Synthetic CP15','{actor}');")
def call(account=actor,trip_id=trip):
 c=row('external_integration_calls');c.update(integration_id=i['integration_id'],environment='DEV',provider_config_id=p['provider_config_id'],provider_id='DeepSeek',model_id='deepseek-flash',model_version='DeepSeek-V4.1-Flash',adapter_version=p['adapter_version'],config_version=i['config_version'],configuration_sha256=i['config_sha256'],account_id=account,user_id=account,trip_id=trip_id,import_id=uid(),task_id=uid(),attempt_id=uid(),fallback_chain_id=uid(),attempt_sequence=1,request_sha256=H,input_sha256=H,schema_sha256=H,capability='EXTRACT',task_class='FLIGHT_IMPORT_V1',call_kind='OUTBOUND_MODEL',shadow=False,price_schedule_id=price['price_schedule_id'],dispatch_state='RESERVED',execution_certainty='NOT_STARTED')
 s=row('external_integration_usage_events');s.update(call_id=c['call_id'],observation_key='start',observation_kind='START',measurement_mode='NONE',status='STARTED',usage_quality='UNKNOWN',cost_quality='UNKNOWN',price_schedule_id=price['price_schedule_id'],currency='USD')
 return {'account_id':account,'integration_id':i['integration_id'],'row':c,'start':s,'scope_id':scope['scope_id'],'scope_revision':scope['revision'],'scope_sha256':scope['scope_sha256'],'grant_revision':grant['revision'] if account==actor else 1,'input_ceiling':8192,'output_ceiling':2048,'execution_pins':copy.deepcopy(scope['pins']),'execution_pins_sha256':digest(scope['pins'])}
def reserve(f,**kwargs):return invoke('flight_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id'],ctx_updates={'verified_actor_id':f['account_id'],'verified_account_id':f['account_id']},**kwargs)
def mark(c,**kwargs):return invoke('external_integration_mark_dispatch',{'account_id':c['account_id'],'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':1},'call_gateway','TRUSTED_WORKLOAD',ctx_updates={'verified_actor_id':c['account_id'],'verified_account_id':c['account_id']},**kwargs)
def complete(c):return invoke('external_integration_observe_call',{'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':2,'publication_fence':1,'dispatch_state':'TERMINAL','execution_certainty':'TERMINAL','safe_reason':'SYNTHETIC_TERMINAL','recovery_sha256':None},'call_gateway','TRUSTED_WORKLOAD',ctx_updates={'verified_actor_id':c['account_id'],'verified_account_id':c['account_id']})
reserve(call(),expect_error='CP15_MONETARY_CLOSED')
# Explicit synthetic monetary policy for isolated conformance only.
scope.update(revision=2,monetary_approved=True,call_cost_nanos='1000000000',account_day_cost_nanos='10000000000',dev_day_cost_nanos='100000000000');select(scope)
for field,value in [('environment','PRODUCTION'),('workload','OTHER'),('provider_id','Other'),('model_id','other'),('expected_family','other'),('shadow',True),('input_ceiling',8193),('output_ceiling',2049),('concurrent_account',2),('account_daily',21),('dev_daily',101),('provider_daily',101),('expires_at',NOW)]:
 bad=copy.deepcopy(scope);bad.update(revision=3,**{field:value});select(bad,expect_error='ANY')
for field,value in [('task_class','INTELLIGENCE'),('provider_id','Other'),('model_id','Other'),('shadow',True),('trip_id',uid()),('provider_config_id',uid()),('config_version',1),('adapter_version','wrong'),('schema_sha256','b'*64),('invocation_id',uid())]:
 f=call();f['row'][field]=value;reserve(f,expect_error='ANY')
for field,value in [('scope_revision',1),('scope_sha256','b'*64),('grant_revision',2),('input_ceiling',8193),('output_ceiling',2049),('input_ceiling',0)]:
 f=call();f[field]=value;reserve(f,expect_error='ANY')
# Old generic/synthetic DEV calls remain unable to dispatch, even with DEV runtime true.
for workload in ['INTELLIGENCE','FLIGHT_IMPORT_V1']:
 old=call();old['row']['task_class']=workload
 old_fields={k:old[k] for k in ['account_id','integration_id','row','start']}
 old_call=invoke('external_integration_reserve_call',old_fields,'call_gateway','TRUSTED_WORKLOAD',request_id=old['row']['request_id'])
 mark(old_call,expect_error='CP14_RUNTIME_CLOSED')
# Missing allowlist/expired/revoked grants and budget failures deny admission atomically.
probe=call();probe['row']['account_id']=other;probe['row']['user_id']=other;probe['account_id']=other
reserve(probe,expect_error='CP15_ACCOUNT_CLOSED')
for change in [{'call_cost_nanos':'1'},{'account_day_cost_nanos':'1'},{'dev_day_cost_nanos':'1'},{'monetary_approved':False}]:
 sc=copy.deepcopy(scope);sc.update(revision=scope['revision']+1,**change);select(sc);scope=sc
 reserve(call(),expect_error='ANY')
 sc=copy.deepcopy(scope);sc.update(revision=scope['revision']+1,call_cost_nanos='1000000000',account_day_cost_nanos='10000000000',dev_day_cost_nanos='100000000000',monetary_approved=True);select(sc);scope=sc
# Two concurrent transactions contend on the existing environment/integration locks.
def raw_reserve(f):
 cmd,ctx=request('flight_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id']);return sql(f"set session authorization otr_external_integration_call_gateway;select public.flight_activation_reserve_call({literal(ctx)},{literal(cmd)});",'supabase_admin',True)
f1,f2=call(),call()
with concurrent.futures.ThreadPoolExecutor(2) as pool:rs=list(pool.map(raw_reserve,[f1,f2]))
equal(sum(r.returncode==0 for r in rs),1,'concurrent account1');chosen=next(f for f,r in zip([f1,f2],rs) if r.returncode==0)
c=reserve(chosen);equal(reserve(chosen)['call_id'],c['call_id'],'exact reserve replay');equal(scalar(f"select count(*) from public.flight_call_resource_holds where call_id='{c['call_id']}';"),'1','one durable hold');equal(scalar(f"select count(*) from public.external_integration_usage_events where call_id='{c['call_id']}' and observation_kind='START';"),'1','one START')
# Kill and current Trip checks before mark: no dispatch state transition.
env_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';"))
invoke('external_integration_set_kill',admin(expected_version=env_version,kill_switch=True));mark(c,expect_error='CP14_RUNTIME_CLOSED')
invoke('external_integration_set_kill',admin(expected_version=env_version+1,kill_switch=False))
sql(f"update public.trips set created_by='{other}' where id='{trip}';update public.journey_members set status='unlinked' where trip_id='{trip}' and user_id='{actor}';",'supabase_admin');mark(c,expect_error='CP14_TRIP_FORBIDDEN');sql(f"update public.trips set created_by='{actor}' where id='{trip}';update public.journey_members set status='linked' where trip_id='{trip}' and user_id='{actor}';",'supabase_admin')
equal(scalar(f"select dispatch_state from public.external_integration_calls where call_id='{c['call_id']}';"),'RESERVED','pre-mark denials retain RESERVED')
# Current grant revision/revoke and Trip are independently checked at mark.
grant.update(revision=2,revoked=True);grant_account(grant);mark(c,expect_error='CP15_ACCOUNT_CLOSED')
grant.update(revision=3,revoked=False);grant_account(grant);mark(c,expect_error='CP15_HOLD_PIN')
# Old hold cannot become current again (revocation/regrant does not rewrite it).
reserve(call(),expect_error='CP15_RESOURCE_LIMIT')
# Retained UNKNOWN consumes concurrency and never redispatches/refunds.
u=invoke('external_integration_observe_call',{'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':1,'dispatch_state':'UNKNOWN','execution_certainty':'NOT_STARTED','safe_reason':'ACK_LOST','recovery_sha256':None},'call_gateway','TRUSTED_WORKLOAD')
mark(c,expect_error='CP14_DISPATCH_FENCE');reserve(call(),expect_error='CP15_RESOURCE_LIMIT')
equal(scalar(f"select count(*) from public.flight_call_resource_holds where call_id='{c['call_id']}';"),'1','UNKNOWN no refund')
# Trusted exact recovery closes nonexecution but the daily hold stays.
invoke('external_integration_observe_call',{'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':u['row_revision'],'publication_fence':u['publication_fence'],'dispatch_state':'TERMINAL','execution_certainty':'NOT_STARTED','safe_reason':'RECOVERED','recovery_sha256':H},'recovery_gateway','TRUSTED_WORKLOAD')
# Fresh reserve/mark races: exactly one successful mark.
f=call();c=reserve(f)
# Current scope revoke/config deselection/monetary policy change are exercised
# through actual protected admin roots in rollback-only transactions.
def changed_before_mark(kind,fields,expected_error):
 ac,ax=request(kind,fields);mc,mx=request('external_integration_mark_dispatch',{'account_id':actor,'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':1},'call_gateway','TRUSTED_WORKLOAD')
 result=sql(f"begin;set session authorization otr_external_integration_admin_gateway;select public.{kind}({literal(ax)},{literal(ac)});set session authorization otr_external_integration_call_gateway;select public.external_integration_mark_dispatch({literal(mx)},{literal(mc)});rollback;",'supabase_admin',True)
 equal(result.returncode!=0,True,kind+' before mark denied');assert expected_error in result.stderr,result.stderr
next_scope=copy.deepcopy(scope);next_scope.update(revision=scope['revision']+1,active=False);seal(next_scope)
changed_before_mark('flight_activation_select',admin(integration_id=i['integration_id'],expected_version=scope['revision'],row=next_scope),'CP15_SCOPE_CLOSED')
next_scope=copy.deepcopy(scope);next_scope.update(revision=scope['revision']+1,monetary_approved=False);seal(next_scope)
changed_before_mark('flight_activation_select',admin(integration_id=i['integration_id'],expected_version=scope['revision'],row=next_scope),'CP15_SCOPE_CLOSED')
next_i={**i,'config_version':i['config_version']+1,'admin_label':'Synthetic deselection'}
changed_before_mark('external_integration_configure',admin(integration_id=i['integration_id'],expected_version=i['config_version'],row=next_i),'CP14_ADMISSION_CLOSED')
equal(scalar(f"select dispatch_state from public.external_integration_calls where call_id='{c['call_id']}';"),'RESERVED','pre-mark state after rollback-only freshness tests')
def raw_mark(_):
 cmd,ctx=request('external_integration_mark_dispatch',{'account_id':actor,'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':1},'call_gateway','TRUSTED_WORKLOAD');return sql(f"set session authorization otr_external_integration_call_gateway;select public.external_integration_mark_dispatch({literal(ctx)},{literal(cmd)});",'supabase_admin',True)
with concurrent.futures.ThreadPoolExecutor(2) as pool:rs=list(pool.map(raw_mark,range(2)))
equal(sum(r.returncode==0 for r in rs),1,'concurrent mark one ACK')
# Safe nullable provider id only on dispatched real-workload fixture call.
us=row('external_integration_usage_events');us.update(call_id=c['call_id'],observation_key='completion',observation_kind='COMPLETION',measurement_mode='NONE',status='SUCCEEDED',usage_quality='UNKNOWN',cost_quality='UNKNOWN',price_schedule_id=price['price_schedule_id'],currency='USD',provider_request_id='chatcmpl-safe-1')
invoke('external_integration_usage_append',{'integration_id':i['integration_id'],'call_id':c['call_id'],'row':us},'call_gateway','TRUSTED_WORKLOAD')
for unsafe in ['unsafe\nsecret','https://bad', 'x'*129]:
 invoke('external_integration_usage_append',{'integration_id':i['integration_id'],'call_id':c['call_id'],'row':{**us,'observation_id':uid(),'observation_key':uid(),'provider_request_id':unsafe}},'call_gateway','TRUSTED_WORKLOAD',expect_error='ANY')
complete(c)
# Exact 20/day, 100 DEV/provider daily. Each terminal call still counts.
for n in range(18):c=reserve(call());mark(c);complete(c)
reserve(call(),expect_error='CP15_RESOURCE_LIMIT')
equal(scalar(f"select count(*) from public.flight_call_resource_holds where account_id='{actor}';"),'20','20 Account holds retained')
for account_n in range(4):
 account=uid();t=uid();sql(f"insert into auth.users(id) values('{account}');insert into public.profiles(id,display_name) values('{account}','Synthetic budget');insert into public.trips(id,name,created_by) values('{t}','Synthetic','{account}');",'supabase_admin')
 grant_account({**grant,'account_id':account,'revision':1})
 for n in range(20):c=reserve(call(account,t));mark(c);complete(c)
equal(scalar("select count(*) from public.flight_call_resource_holds;"),'100','100 DEV/DeepSeek holds retained')
account=uid();t=uid();sql(f"insert into auth.users(id) values('{account}');insert into public.profiles(id,display_name) values('{account}','Synthetic');insert into public.trips(id,name,created_by) values('{t}','Synthetic','{account}');",'supabase_admin');grant_account({**grant,'account_id':account,'revision':1});reserve(call(account,t),expect_error='CP15_RESOURCE_LIMIT')
# No second cost ledger, holds cannot be updated/deleted/truncated by any runtime.
for operation in ['delete from public.flight_call_resource_holds','truncate public.flight_call_resource_holds','update public.flight_call_resource_holds set worst_cost_nanos=0']:
 equal(sql('set session authorization otr_external_integration_call_gateway;'+operation+';','supabase_admin',True).returncode!=0,True,'no refund '+operation)
# End fixture CLOSED via protected roots; no live selection survives validation.
scope.update(revision=scope['revision']+1,active=False);select(scope)
invoke('flight_activation_runtime',admin(expected_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';")),runtime_enabled=False))
invoke('external_integration_set_kill',admin(expected_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';")),kill_switch=True))
equal(scalar("select count(*) from public.external_integration_environment_state where runtime_enabled or not kill_switch;"),'0','all environments CLOSED')
print(json.dumps({'status':'PASS','checks':checks,'gates':'CLOSED','holds':100,'provider_calls':0}))
