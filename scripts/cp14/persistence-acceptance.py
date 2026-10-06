"""Synthetic, network-isolated CP14 PostgreSQL acceptance. No provider/hosted access.
Run only against the task-owned disposable container after exact1→83 replay.
"""
from pathlib import Path
import subprocess,json,uuid,hashlib,copy,concurrent.futures
ROOT=Path(__file__).resolve().parents[2]
CONTAINER='otr-cp14-acceptance'
assert subprocess.check_output(['docker','inspect',CONTAINER,'--format','{{.HostConfig.NetworkMode}}'],text=True).strip()=='none'
checks=0

def sql(body,user='postgres',allow_error=False):
 r=subprocess.run(['docker','exec','-i',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d','postgres'],input=body,text=True,capture_output=True)
 if r.returncode and not allow_error:raise AssertionError(r.stderr[-2200:])
 return r

def equal(actual,expected,label):
 global checks
 assert actual==expected,(label,actual,expected)
 checks+=1

def scalar(q):return sql(q).stdout.strip()
def uid():return str(uuid.uuid4())
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def literal(v):return "'"+json.dumps(v,separators=(',',':')).replace("'","''")+"'::jsonb"
actor=uid();other=uid();client=uid();H='a'*64;NOW='2000-01-01T00:00:00Z';FUTURE='2070-01-01T00:00:00Z'
# No passwords or authenticating users: synthetic auth FK identities only.
sql(f"insert into auth.users(id) values('{actor}'),('{other}');insert into public.profiles(id,display_name) values('{actor}','CP14 synthetic owner'),('{other}','CP14 synthetic other');",'supabase_admin')
for permission in ['CONFIG_ADMIN','SECURITY_ADMIN','COST_READER','SUPPORT_RECOVERY']:
 sql(f"insert into public.external_integration_admin_grants(admin_grant_id,actor_id,environment,permission,expires_at,created_at,created_by) values('{uid()}','{actor}','TEST','{permission}','{FUTURE}','{NOW}','{actor}');")

def row(table):
 columns=json.loads(scalar("select json_agg(json_build_object('name',column_name,'type',udt_name,'nullable',is_nullable) order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='"+table+"';"))
 result={}
 for c in columns:
  k=c['name'];typ=c['type']
  if c['nullable']=='YES':value=None
  elif typ=='uuid':value=uid()
  elif typ in ['int8','int2']:value=1
  elif typ=='numeric':value='0'
  elif typ=='bool':value=False
  elif typ=='_text':value=[]
  elif typ=='jsonb':value={}
  elif typ=='timestamptz':value=NOW
  elif k.endswith('sha256') or k=='subject_digest':value=H
  else:value='fixture'
  result[k]=value
 return result

def request(kind,fields,gateway='admin_gateway',principal='OTR_ADMIN',ctx_updates=None,request_id=None):
 cmd={'version':1,'environment':'TEST','request_id':request_id or uid(),**fields};cmd['request_sha256']=digest({'domain':'otr-cp14-command-v1','command':cmd})
 ctx={'version':1,'principal_kind':principal,'verified_actor_id':actor,'verified_client_identity':client,'verified_external_subject':{'issuer_namespace':'synthetic','subject_digest':H},'verified_account_id':actor,'verified_environment':'TEST','auth_source':'TEST_ONLY_INJECTED_VERIFIER','auth_config_version':1,'auth_session_reference':'vault:synthetic-session','verified_at':NOW,'expires_at':FUTURE,'revoked':False,'request_id':cmd['request_id'],'request_sha256':cmd['request_sha256'],'command_kind':kind,'gateway_identity':'otr_external_integration_'+gateway}
 if ctx_updates:ctx.update(ctx_updates)
 return cmd,ctx

def invoke(kind,fields,gateway='admin_gateway',principal='OTR_ADMIN',ctx_updates=None,request_id=None,expect_error=None,role=None):
 cmd,ctx=request(kind,fields,gateway,principal,ctx_updates,request_id)
 body=f"set session authorization {role or ctx['gateway_identity']};select public.{kind}({literal(ctx)},{literal(cmd)});"
 # Superuser is used ONLY to establish a disposable NOLOGIN gateway session.
 r=sql(body,'supabase_admin',allow_error=True)
 if expect_error:
  equal(r.returncode!=0,True,expect_error+' rejected')
  if expect_error!='ANY':assert expect_error in r.stderr,r.stderr
  return None
 if r.returncode:raise AssertionError(kind+' '+r.stderr)
 return json.loads(r.stdout.strip().splitlines()[-1])

equal(scalar("select count(*) from public.external_integration_environment_state where kill_switch and not runtime_enabled;"),'3','closed environments')
spec_tables=['external_integration_environment_state','external_integrations','intelligence_provider_configs','external_integration_price_schedules','external_integration_price_schedule_units','external_integration_calls','external_integration_usage_events','external_integration_config_audit','external_integration_health_observations','external_client_identities','external_client_grants','inbound_ai_import_reservations','inbound_ai_invocations','inbound_ai_review_decisions','external_integration_admin_grants']
for table in spec_tables:
 equal(scalar(f"select relrowsecurity and relforcerowsecurity and relowner='postgres'::regrole from pg_class where oid='public.{table}'::regclass;"),'t',table+' FORCE RLS/owner')
 for role in ['anon','authenticated','service_role']:
  equal(scalar(f"select has_table_privilege('{role}','public.{table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');"),'f',role+' no table authority')
  equal(sql(f'set session authorization {role};select * from public.{table};','supabase_admin',True).returncode!=0,True,role+' actual SELECT denied')
for table in spec_tables:
 equal(scalar(f"select count(*) from pg_class c cross join lateral aclexplode(c.relacl) acl where c.oid='public.{table}'::regclass and acl.grantee=0;"),'0',table+' PUBLIC ACL empty')
for role in ['admin_gateway','call_gateway','inbound_gateway','reporting_gateway','recovery_gateway']:
 equal(scalar(f"select count(*) from information_schema.role_table_grants where grantee='otr_external_integration_{role}' and table_name=any(array["+','.join("'"+t+"'" for t in spec_tables)+"]);"),'0',role+' zero table grants')
 equal(scalar(f"select has_schema_privilege('otr_external_integration_{role}','public','CREATE');"),'f',role+' no schema CREATE')
equal(scalar("select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'cp14_%' and (has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE') or has_function_privilege('service_role',oid,'EXECUTE'));"),'0','private validators and triggers not API executable')
equal(scalar("select count(*) from pg_roles where rolname like 'otr_external_integration_%' and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls or rolreplication);"),'0','isolated role flags')
equal(scalar("select count(*) from pg_auth_members where member in(select oid from pg_roles where rolname like 'otr_external_integration_%') or (roleid in(select oid from pg_roles where rolname like 'otr_external_integration_%') and (member<>'postgres'::regrole or inherit_option or set_option));"),'0','no runtime membership/SET/INHERIT edges')
for role in ['anon','authenticated','service_role','authenticator']:
 equal(scalar(f"select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('external_integration_configure','external_integration_set_kill','intelligence_provider_config_append','external_integration_price_append','external_integration_health_observe','external_integration_reserve_call','external_integration_mark_dispatch','external_integration_usage_append','external_integration_observe_call','external_client_authorize_grant','external_client_revoke_grant','inbound_ai_reserve_package','inbound_ai_attach_material','inbound_ai_reserve_invocation','inbound_ai_complete_invocation','inbound_ai_reserve_review','inbound_ai_observe_review','inbound_ai_status','external_integration_admin_report','external_integration_recover_exact') and has_function_privilege('{role}',oid,'EXECUTE');"),'0',role+' no protected roots')
for role in ['config_writer','meter_writer','inbound_writer','reader','admin_gateway','call_gateway','inbound_gateway','reporting_gateway','recovery_gateway']:
 for table in ['itinerary_events','itinerary_transport_services','journey_members']:
  equal(scalar(f"select has_table_privilege('otr_external_integration_{role}','public.{table}','INSERT,UPDATE,DELETE');"),'f',role+' no canonical rights')

# TARGETED F3: CONFIG-only actor cannot own kill state, including creation.
sql(f"insert into public.external_integration_admin_grants(admin_grant_id,actor_id,environment,permission,expires_at,created_at,created_by) values('{uid()}','{other}','TEST','CONFIG_ADMIN','{FUTURE}','{NOW}','{actor}');")
config_context={'verified_actor_id':other,'verified_account_id':other}
security_row=row('external_integrations');security_row.update(integration_id='f3-config-only',category='WEATHER',vendor_namespace='synthetic',environment='TEST',admin_label='F3',enabled=True,kill_switch=False,health_state='UNKNOWN',created_by=other,updated_by=other)
f3_fields={'actor_id':other,'integration_id':security_row['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','row':security_row}
invoke('external_integration_configure',f3_fields,ctx_updates=config_context,expect_error='CP14_SECURITY_OWNED')
security_row['kill_switch']=True
invoke('external_integration_configure',f3_fields,ctx_updates=config_context)
equal(scalar("select kill_switch from public.external_integrations where integration_id='f3-config-only';"),'t','F3 killed creation default')
f3_next={**security_row,'config_version':2,'kill_switch':False}
invoke('external_integration_configure',{**f3_fields,'expected_version':1,'row':f3_next},ctx_updates=config_context,expect_error='CP14_SECURITY_OWNED')
f3_kill={'actor_id':other,'integration_id':security_row['integration_id'],'expected_version':1,'audit_id':uid(),'reason_code':'SYNTHETIC','kill_switch':False}
invoke('external_integration_set_kill',f3_kill,ctx_updates=config_context,expect_error='CP14_ADMIN_FORBIDDEN')
sql(f"insert into public.external_integration_admin_grants(admin_grant_id,actor_id,environment,permission,expires_at,created_at,created_by) values('{uid()}','{other}','TEST','SECURITY_ADMIN','{FUTURE}','{NOW}','{actor}');")
invoke('external_integration_set_kill',f3_kill,ctx_updates=config_context)
f3_current=json.loads(scalar("select to_jsonb(i) from public.external_integrations i where integration_id='f3-config-only';"))
invoke('external_integration_configure',{**f3_fields,'expected_version':2,'row':{**f3_current,'config_version':3,'kill_switch':True}},ctx_updates=config_context,expect_error='CP14_SECURITY_OWNED')
f3_next={**f3_current,'config_version':3,'admin_label':'Updated'}
invoke('external_integration_configure',{**f3_fields,'expected_version':2,'audit_id':uid(),'row':f3_next},ctx_updates=config_context)
equal(scalar("select kill_switch from public.external_integrations where integration_id='f3-config-only';"),'f','F3 unrelated config preserves security state')
equal(scalar("select change_type||':'||admin_actor_id::text from public.external_integration_config_audit where entity_kind='kill' and integration_id='f3-config-only';"),'KILL:'+other,'F3 dedicated security audit')

integration=row('external_integrations');integration.update(integration_id='synthetic-outbound',category='INTELLIGENCE_OUTBOUND',vendor_namespace='synthetic',environment='TEST',admin_label='Synthetic',enabled=True,kill_switch=True,config_version=1,capabilities=['EXTRACT'],quota_limit=2,quota_window_seconds=60,rate_per_minute=10,health_state='UNKNOWN',created_by=actor,updated_by=actor)
fields={'actor_id':actor,'integration_id':integration['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','row':integration}
first_id=uid();first=invoke('external_integration_configure',fields,request_id=first_id);equal(first['version'],1,'configure admission');equal(invoke('external_integration_configure',fields,request_id=first_id),first,'configuration exact replay')
changed=copy.deepcopy(fields);changed['row']['admin_label']='Changed';invoke('external_integration_configure',changed,request_id=first_id,expect_error='CP14_CHANGED_REQUEST')
for role in ['authenticated','service_role']:
 invoke('external_integration_configure',fields,role=role,expect_error='ANY')
invoke('external_integration_configure',{**fields,'actor_id':other},expect_error='CP14_SCOPE_FORBIDDEN')
invoke('external_integration_configure',fields,ctx_updates={'verified_environment':'DEV'},expect_error='CP14_CONTEXT_FORBIDDEN')
invoke('external_integration_configure',fields,ctx_updates={'expires_at':NOW},expect_error='CP14_CONTEXT_FORBIDDEN')
invoke('external_integration_configure',fields,ctx_updates={'revoked':True},expect_error='CP14_CONTEXT_FORBIDDEN')
# Durable admin expiry, independently of host proof.
sql(f"update public.external_integration_admin_grants set expires_at='{NOW}',grant_revision=grant_revision+1 where actor_id='{actor}' and permission='CONFIG_ADMIN';")
invoke('external_integration_configure',fields,expect_error='CP14_ADMIN_FORBIDDEN')
sql(f"update public.external_integration_admin_grants set expires_at='{FUTURE}',grant_revision=grant_revision+1 where actor_id='{actor}' and permission='CONFIG_ADMIN';")
invoke('external_integration_set_kill',{'actor_id':actor,'integration_id':None,'expected_version':1,'audit_id':uid(),'reason_code':'SYNTHETIC','kill_switch':False})
# Concurrent integration CAS: one winner, no LWW.
def configure_next(label):
 r=copy.deepcopy(integration);r.update(config_version=2,admin_label=label,config_sha256=digest(label));f={**fields,'expected_version':1,'audit_id':uid(),'row':r};cmd,ctx=request('external_integration_configure',f);return sql(f"set session authorization otr_external_integration_admin_gateway;select public.external_integration_configure({literal(ctx)},{literal(cmd)});",'supabase_admin',True).returncode
with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(configure_next,['winner-a','winner-b']))
equal(sum(x==0 for x in results),1,'concurrent config CAS')
invoke('external_integration_set_kill',{'actor_id':actor,'integration_id':'synthetic-outbound','expected_version':2,'audit_id':uid(),'reason_code':'SYNTHETIC','kill_switch':False})
integration=json.loads(scalar("select to_jsonb(i) from public.external_integrations i where integration_id='synthetic-outbound';"))
provider=row('intelligence_provider_configs');provider.update(integration_id='synthetic-outbound',provider_id='synthetic',model_id='synthetic',model_version='v1',adapter_version='v1',provider_class='DETERMINISTIC',capabilities=['EXTRACT'],modalities=['TEXT'],schema_contracts=[{'id':'flight','version':1,'dialect':'otr'}],privacy_policy='LOCAL_ONLY',network_required=False,routing_class='LOCAL',routing_eligibility='ELIGIBLE',replay_support='UNSUPPORTED',created_by=actor)
invoke('intelligence_provider_config_append',{'actor_id':actor,'integration_id':'synthetic-outbound','expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','row':provider})
new_provider={**provider,'provider_config_id':uid(),'config_version':2,'routing_eligibility':'DISABLED'}
invoke('intelligence_provider_config_append',{'actor_id':actor,'integration_id':'synthetic-outbound','expected_version':1,'audit_id':uid(),'reason_code':'SYNTHETIC','row':new_provider})

# Immutable price intervals: supersession clips old history and cannot revive it.
price=row('external_integration_price_schedules');price.update(integration_id='synthetic-outbound',schedule_version='v1',currency='USD',effective_from='2000-01-01T00:00:00Z',rounding_policy='SUM_THEN_CEIL_NANOS_V1',created_by=actor)
def price_fields(r,expected):
 unit={'price_schedule_id':r['price_schedule_id'],'unit_key':'call_count','measurement_unit':'call','unit_quantity':3,'price_per_quantity':'1.000000000000000001','unit_definition':{'version':1,'relationship':'DISJOINT','included_in':None,'billable':True}}
 return {'actor_id':actor,'integration_id':r['integration_id'],'expected_version':expected,'audit_id':uid(),'reason_code':'SYNTHETIC','row':r,'units':[unit]}
pfields=price_fields(price,None);pid=uid();invoke('external_integration_price_append',pfields,request_id=pid);equal(invoke('external_integration_price_append',pfields,request_id=pid)['version'],1,'price exact replay')
overlap={**price,'price_schedule_id':uid(),'schedule_version':'bad','effective_from':'2010-01-01T00:00:00Z'}
invoke('external_integration_price_append',price_fields(overlap,'v1'),expect_error='CP14_PRICE_OVERLAP')
newprice={**overlap,'schedule_version':'v2','supersedes_schedule_id':price['price_schedule_id'],'effective_until':'2060-01-01T00:00:00Z'}
invoke('external_integration_price_append',price_fields(newprice,'v1'))
revival={**newprice,'price_schedule_id':uid(),'schedule_version':'bad-revival','effective_from':'2061-01-01T00:00:00Z'}
invoke('external_integration_price_append',price_fields(revival,'v2'),expect_error='CP14_PRICE_SUPERSESSION')
equal(scalar("select effective_until is null from public.external_integration_price_schedules where schedule_version='v1';"),'t','supersession does not rewrite history')
# Different currencies are independent; no FX or rewriting old call price pins.
eur={**price,'price_schedule_id':uid(),'schedule_version':'eur-v1','currency':'EUR'}
invoke('external_integration_price_append',price_fields(eur,None))
equal(scalar("select count(distinct currency) from public.external_integration_price_schedules;"),'2','currency scopes independent')
# Old-config health remains history while current projection remains current.
for seq,version,state in [(1,integration['config_version'],'HEALTHY'),(2,1,'UNAVAILABLE')]:
 health=row('external_integration_health_observations');health.update(integration_id='synthetic-outbound',config_version=version,health_state=state,observation_sequence=seq,observer_principal_id=actor)
 invoke('external_integration_health_observe',{'integration_id':'synthetic-outbound','expected_version':integration['config_version'],'row':health},'call_gateway','TRUSTED_WORKLOAD')
equal(scalar("select health_state from public.external_integrations where integration_id='synthetic-outbound';"),'HEALTHY','old config health cannot overwrite current')

def call_and_start(invocation=None,integration_row=integration,provider_row=None):
 call=row('external_integration_calls');call.update(integration_id=integration_row['integration_id'],environment='TEST',config_version=integration_row['config_version'],configuration_sha256=integration_row['config_sha256'],account_id=actor,user_id=actor,call_kind='INBOUND_TOOL' if invocation else 'GENERIC_API',dispatch_state='RESERVED',execution_certainty='NOT_STARTED',shadow=False,invocation_id=invocation)
 if provider_row:call.update(call_kind='OUTBOUND_MODEL',provider_config_id=provider_row['provider_config_id'],provider_id=provider_row['provider_id'],model_id=provider_row['model_id'],model_version=provider_row['model_version'],adapter_version=provider_row['adapter_version'],task_id=uid(),attempt_id=uid(),attempt_sequence=1,fallback_chain_id=uid(),request_sha256=H,input_sha256=H,schema_sha256=H)
 start=row('external_integration_usage_events');start.update(call_id=call['call_id'],observation_key='start',observation_kind='START',measurement_mode='NONE',status='STARTED',usage_quality='UNKNOWN',cost_quality='UNKNOWN')
 return call,start
call,start=call_and_start(provider_row=provider)
invoke('external_integration_reserve_call',{'account_id':actor,'integration_id':'synthetic-outbound','row':call,'start':start},'call_gateway','TRUSTED_WORKLOAD',request_id=call['request_id'],expect_error='CP14_PROVIDER_INELIGIBLE')
# Both environment and integration kill switches reject fresh admission.
kill_probe,_=call_and_start()
invoke('external_integration_set_kill',{'actor_id':actor,'integration_id':None,'expected_version':2,'audit_id':uid(),'reason_code':'SYNTHETIC','kill_switch':True})
invoke('external_integration_reserve_call',{'account_id':actor,'integration_id':'synthetic-outbound','row':kill_probe,'start':start},'call_gateway','TRUSTED_WORKLOAD',request_id=kill_probe['request_id'],expect_error='CP14_ADMISSION_CLOSED')
invoke('external_integration_set_kill',{'actor_id':actor,'integration_id':None,'expected_version':3,'audit_id':uid(),'reason_code':'SYNTHETIC','kill_switch':False})
for killed,version in [(True,3),(False,4)]:
 invoke('external_integration_set_kill',{'actor_id':actor,'integration_id':'synthetic-outbound','expected_version':version,'audit_id':uid(),'reason_code':'SYNTHETIC','kill_switch':killed})
 integration.update(json.loads(scalar("select to_jsonb(i) from public.external_integrations i where integration_id='synthetic-outbound';")))
 if killed:
  probe,probe_start=call_and_start();invoke('external_integration_reserve_call',{'account_id':actor,'integration_id':'synthetic-outbound','row':probe,'start':probe_start},'call_gateway','TRUSTED_WORKLOAD',request_id=probe['request_id'],expect_error='CP14_ADMISSION_CLOSED')
# Concurrent quota reservations count RESERVED calls, no timeout refunds.
records=[]
for _ in range(3):records.append(call_and_start())
def reserve(pair):
 c,start=pair;cmd,ctx=request('external_integration_reserve_call',{'account_id':actor,'integration_id':'synthetic-outbound','row':c,'start':start},'call_gateway','TRUSTED_WORKLOAD',request_id=c['request_id']);return sql(f"set session authorization otr_external_integration_call_gateway;select public.external_integration_reserve_call({literal(ctx)},{literal(cmd)});",'supabase_admin',True)
with concurrent.futures.ThreadPoolExecutor(3) as pool:results=list(pool.map(reserve,records))
equal(sum(r.returncode==0 for r in results),2,'concurrent reservation quota')
chosen=next(pair for pair,r in zip(records,results) if r.returncode==0);c,start=chosen
same=invoke('external_integration_reserve_call',{'account_id':actor,'integration_id':'synthetic-outbound','row':c,'start':start},'call_gateway','TRUSTED_WORKLOAD',request_id=c['request_id']);equal(same['call_id'],c['call_id'],'lost START ack exact recovery')
changed_start={**start,'observation_key':'changed-start'}
invoke('external_integration_reserve_call',{'account_id':actor,'integration_id':'synthetic-outbound','row':c,'start':changed_start},'call_gateway','TRUSTED_WORKLOAD',request_id=c['request_id'],expect_error='CP14_CHANGED_REQUEST')
invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':start},'call_gateway','EXTERNAL_CLIENT',expect_error='CP14_CONTEXT_FORBIDDEN')
invoke('external_integration_mark_dispatch',{'account_id':actor,'integration_id':'synthetic-outbound','call_id':c['call_id'],'expected_revision':1,'publication_fence':1},'call_gateway','TRUSTED_WORKLOAD',expect_error='CP14_RUNTIME_CLOSED')
equal(scalar('select count(*) from public.external_integration_environment_state where runtime_enabled;'),'0','runtime remains closed')
# Append streaming observations: final replaces cumulative, unknown units stay null.
for n in [4,9]:
 u=row('external_integration_usage_events');u.update(call_id=c['call_id'],observation_key='progress-'+str(n),observation_kind='PROGRESS',measurement_mode='CUMULATIVE',status='PARTIAL',input_tokens=n,usage_quality='ACTUAL_REPORTED',cost_quality='UNKNOWN',received_at=f'2000-01-01T00:00:{n:02d}Z')
 fields_u={'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':u};answer=invoke('external_integration_usage_append',fields_u,'call_gateway','TRUSTED_WORKLOAD');equal(answer['input_tokens'],n,'usage retained');equal(invoke('external_integration_usage_append',fields_u,'call_gateway','TRUSTED_WORKLOAD')['observation_id'],u['observation_id'],'stream dedup')
 changed_u={**u,'input_tokens':10};invoke('external_integration_usage_append',{**fields_u,'row':changed_u},'call_gateway','TRUSTED_WORKLOAD',expect_error='CP14_CHANGED_OBSERVATION')
report=invoke('external_integration_admin_report',{'actor_id':actor,'integration_id':'synthetic-outbound'},'reporting_gateway');projection=next(x['projection'] for x in report['usage'] if x['call_id']==c['call_id']);equal(projection['units']['input_tokens']['quantity'],9,'cumulative snapshots not summed');equal(projection['units']['output_tokens']['quantity'],None,'missing output remains UNKNOWN');equal(projection['cost_nanos'],None,'unpriced cost UNKNOWN')
final=row('external_integration_usage_events');final.update(call_id=c['call_id'],observation_key='final',observation_kind='COMPLETION',measurement_mode='NONE',status='SUCCEEDED',response_sha256=H,usage_quality='UNKNOWN',cost_quality='UNKNOWN')
invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':final},'call_gateway','TRUSTED_WORKLOAD')
# Estimated cost is replaced by actual independently of usage quality.
for n,quality,cost in [(10,'ESTIMATED','100'),(11,'ACTUAL_REPORTED','7')]:
 u=row('external_integration_usage_events');u.update(call_id=c['call_id'],observation_key='cost-'+str(n),observation_kind='COST_RECONCILIATION',measurement_mode='NONE',status='SUCCEEDED',usage_quality='UNKNOWN',cost_quality=quality,cost_nanos=cost,currency='USD',received_at=f'2000-01-01T00:00:{n:02d}Z')
 invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':u},'call_gateway','TRUSTED_WORKLOAD')
report=invoke('external_integration_admin_report',{'actor_id':actor,'integration_id':'synthetic-outbound'},'reporting_gateway');projection=next(x['projection'] for x in report['usage'] if x['call_id']==c['call_id']);equal(projection['cost_nanos'],'7','actual cost replaces estimated');equal(projection['units']['input_tokens']['quantity'],9,'cost does not rewrite usage')
# UNKNOWN never allows ordinary terminal proof; exact recovery is separately admitted.
observation={'integration_id':'synthetic-outbound','call_id':c['call_id'],'expected_revision':1,'publication_fence':1,'dispatch_state':'UNKNOWN','execution_certainty':'NOT_STARTED','safe_reason':'ACK_LOST','recovery_sha256':None}
unknown=invoke('external_integration_observe_call',observation,'call_gateway','TRUSTED_WORKLOAD')
terminal={**observation,'expected_revision':unknown['row_revision'],'publication_fence':unknown['publication_fence'],'dispatch_state':'TERMINAL','recovery_sha256':H}
invoke('external_integration_observe_call',terminal,'call_gateway','TRUSTED_WORKLOAD',expect_error='CP14_OBSERVATION_FENCE')
invoke('external_integration_observe_call',{**terminal,'recovery_sha256':None},'recovery_gateway','TRUSTED_WORKLOAD',expect_error='CP14_OBSERVATION_FENCE')
equal(invoke('external_integration_observe_call',terminal,'recovery_gateway','TRUSTED_WORKLOAD')['dispatch_state'],'TERMINAL','exact trusted recovery')
# Late delta units are independent, deduplicated, and can be corrected explicitly.
for n in [2,3]:
 u=row('external_integration_usage_events');u.update(call_id=c['call_id'],observation_key='delta-'+str(n),observation_kind='RECOVERY',measurement_mode='DELTA',status='SUCCEEDED',bytes=n,usage_quality='ACTUAL_REPORTED',cost_quality='UNKNOWN')
 invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':u},'call_gateway','TRUSTED_WORKLOAD')
last=u
correction={**last,'observation_id':uid(),'observation_key':'delta-correction','bytes':8,'supersedes_observation_id':last['observation_id']}
invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':correction},'call_gateway','TRUSTED_WORKLOAD')
report=invoke('external_integration_admin_report',{'actor_id':actor,'integration_id':'synthetic-outbound'},'reporting_gateway');projection=next(x['projection'] for x in report['usage'] if x['call_id']==c['call_id']);equal(projection['units']['bytes']['quantity'],10,'deduplicated deltas and corrections after terminal')
# NULL CAS and caller context never authorize writes.
invoke('external_integration_observe_call',{**terminal,'expected_revision':None},'recovery_gateway','TRUSTED_WORKLOAD',expect_error='CP14_INVALID_COMMAND')
invoke('external_integration_configure',fields,ctx_updates={'principal_kind':None},expect_error='CP14_CONTEXT_FORBIDDEN')
# Bounded numeric extensions use the same cumulative/delta/UNKNOWN semantics.
for n in [2,5]:
 ext=row('external_integration_usage_events');ext.update(call_id=c['call_id'],observation_key='extension-'+str(n),observation_kind='RECOVERY',measurement_mode='CUMULATIVE',status='SUCCEEDED',other_units={'compute_units':n},usage_quality='ACTUAL_REPORTED',cost_quality='UNKNOWN',received_at=f'2000-01-01T00:00:{n+20:02d}Z')
 invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':ext},'call_gateway','TRUSTED_WORKLOAD')
for n in [3,7]:
 ext=row('external_integration_usage_events');ext.update(call_id=c['call_id'],observation_key='vendor-'+str(n),observation_kind='RECOVERY',measurement_mode='DELTA',status='SUCCEEDED',provider_extension={'worker_ms':n},usage_quality='ACTUAL_REPORTED',cost_quality='UNKNOWN')
 invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':ext},'call_gateway','TRUSTED_WORKLOAD')
report=invoke('external_integration_admin_report',{'actor_id':actor,'integration_id':'synthetic-outbound'},'reporting_gateway');projection=next(x['projection'] for x in report['usage'] if x['call_id']==c['call_id']);equal(projection['units']['other_units.compute_units']['quantity'],5,'extension cumulative not summed');equal(projection['units']['provider_extension.worker_ms']['quantity'],10,'extension delta dedup')
unqualified={**ext,'observation_id':uid(),'observation_key':'unknown-extension','measurement_mode':'CUMULATIVE','other_units':{'unqualified':8},'provider_extension':{},'unit_quality':{'unqualified':'UNKNOWN'}}
invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':unqualified},'call_gateway','TRUSTED_WORKLOAD')
report=invoke('external_integration_admin_report',{'actor_id':actor,'integration_id':'synthetic-outbound'},'reporting_gateway');projection=next(x['projection'] for x in report['usage'] if x['call_id']==c['call_id']);equal(projection['units']['other_units.unqualified']['quantity'],None,'extension quality UNKNOWN remains null')
invalid={**ext,'observation_id':uid(),'observation_key':'mixed-extension','other_units':{'compute_units':1},'provider_extension':{}}
invoke('external_integration_usage_append',{'integration_id':'synthetic-outbound','call_id':c['call_id'],'row':invalid},'call_gateway','TRUSTED_WORKLOAD',expect_error='CP14_MIXED_MEASUREMENTS')
# History immutability under actual private session/function owner.
for table in ['external_integration_usage_events','intelligence_provider_configs','external_integration_config_audit']:
 equal(sql(f"set session authorization service_role;delete from public.{table};",'supabase_admin',True).returncode!=0,True,table+' immutable/API denied')

# Per-minute rate admission is independently serialized from quota admission.
rate_registry=row('external_integrations');rate_registry.update(integration_id='synthetic-rate',category='WEATHER',vendor_namespace='synthetic',environment='TEST',admin_label='Synthetic rate',enabled=True,kill_switch=True,config_version=1,capabilities=['READ'],health_state='UNKNOWN',rate_per_minute=1,created_by=actor,updated_by=actor)
invoke('external_integration_configure',{'actor_id':actor,'integration_id':rate_registry['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','row':rate_registry})
invoke('external_integration_set_kill',{'actor_id':actor,'integration_id':rate_registry['integration_id'],'expected_version':1,'audit_id':uid(),'reason_code':'SYNTHETIC','kill_switch':False})
rate_registry.update(json.loads(scalar("select to_jsonb(i) from public.external_integrations i where integration_id='"+rate_registry['integration_id']+"';")))
def reserve_rate(_):
 rc,rs=call_and_start(integration_row=rate_registry);cmd,ctx=request('external_integration_reserve_call',{'account_id':actor,'integration_id':rate_registry['integration_id'],'row':rc,'start':rs},'call_gateway','TRUSTED_WORKLOAD',request_id=rc['request_id']);return sql(f"set session authorization otr_external_integration_call_gateway;select public.external_integration_reserve_call({literal(ctx)},{literal(cmd)});",'supabase_admin',True)
with concurrent.futures.ThreadPoolExecutor(2) as pool:rate_results=list(pool.map(reserve_rate,range(2)))
equal(sum(x.returncode==0 for x in rate_results),1,'concurrent rate single winner');equal(any('CP14_RATE' in x.stderr for x in rate_results),True,'independent rate ceiling')
# TARGETED F2/F4/F6: retained owner, explicit coverage, durable request identity.
f2_u=row('external_integration_usage_events');f2_u.update(call_id=c['call_id'],observation_key='f2-owner',observation_kind='RECOVERY',measurement_mode='NONE',status='UNKNOWN',usage_quality='UNKNOWN',cost_quality='UNKNOWN')
f2_fields={'integration_id':c['integration_id'],'call_id':c['call_id'],'row':f2_u}
for gateway in ['call_gateway','recovery_gateway']:
 invoke('external_integration_usage_append',f2_fields,gateway,'TRUSTED_WORKLOAD',ctx_updates={'verified_actor_id':other,'verified_account_id':other},expect_error='CP14_SCOPE_FORBIDDEN')
 invoke('external_integration_observe_call',terminal,gateway,'TRUSTED_WORKLOAD',ctx_updates={'verified_actor_id':other,'verified_account_id':other},expect_error='CP14_SCOPE_FORBIDDEN')
for mismatch in [{'verified_actor_id':other},{'verified_account_id':other}]:
 invoke('external_integration_usage_append',f2_fields,'call_gateway','TRUSTED_WORKLOAD',ctx_updates=mismatch,expect_error='CP14_SCOPE_FORBIDDEN')
 invoke('external_integration_observe_call',terminal,'recovery_gateway','TRUSTED_WORKLOAD',ctx_updates=mismatch,expect_error='CP14_SCOPE_FORBIDDEN')
invoke('external_integration_usage_append',f2_fields,'recovery_gateway','TRUSTED_WORKLOAD')
equal(invoke('external_integration_observe_call',terminal,'recovery_gateway','TRUSTED_WORKLOAD')['call_id'],c['call_id'],'F2 correct owner late recovery')
invoke('external_integration_usage_append',{**f2_fields,'integration_id':'synthetic-rate'},'call_gateway','TRUSTED_WORKLOAD',expect_error='CP14_SCOPE_FORBIDDEN')
cmd,ctx=request('external_integration_usage_append',f2_fields,'call_gateway','TRUSTED_WORKLOAD');cmd['environment']='DEV';cmd['request_sha256']=digest({'domain':'otr-cp14-command-v1','command':{k:v for k,v in cmd.items() if k!='request_sha256'}});ctx.update(verified_environment='DEV',request_sha256=cmd['request_sha256'])
equal(sql(f"set session authorization otr_external_integration_call_gateway;select public.external_integration_usage_append({literal(ctx)},{literal(cmd)});",'supabase_admin',True).returncode!=0,True,'F2 wrong retained environment rejects')
invoke('external_integration_usage_append',f2_fields,'recovery_gateway','OTR_ADMIN',expect_error='CP14_CONTEXT_FORBIDDEN')
recovery_fields={'actor_id':actor,'integration_id':c['integration_id'],'call_id':c['call_id'],'reservation_id':None}
equal(invoke('external_integration_recover_exact',recovery_fields,'recovery_gateway',ctx_updates={'verified_account_id':other})['call'],None,'F2 support recovery wrong Account minimized')

measure_sequence=0
def append_measure(key,n,mode='DELTA',quality='ACTUAL_REPORTED',predecessor=None,channel='f4-delta',expect_error=None):
 global measure_sequence
 measure_sequence+=1
 u=row('external_integration_usage_events');u.update(call_id=c['call_id'],observation_key=key,observation_kind='RECOVERY',measurement_mode=mode,status='SUCCEEDED',other_units={channel:n},usage_quality=quality,cost_quality='UNKNOWN',supersedes_observation_id=predecessor,received_at=f'2000-01-01T00:01:00.{measure_sequence:06d}Z')
 answer=invoke('external_integration_usage_append',{'integration_id':c['integration_id'],'call_id':c['call_id'],'row':u},'recovery_gateway','TRUSTED_WORKLOAD',expect_error=expect_error)
 if not expect_error:equal(invoke('external_integration_usage_append',{'integration_id':c['integration_id'],'call_id':c['call_id'],'row':u},'recovery_gateway','TRUSTED_WORKLOAD')['observation_id'],u['observation_id'],'F4 independent observation-key replay')
 return u

def projected(channel):
 report=invoke('external_integration_admin_report',{'actor_id':actor,'integration_id':c['integration_id']},'reporting_gateway')
 return next(x['projection'] for x in report['usage'] if x['call_id']==c['call_id'])['units']['other_units.'+channel]['quantity']
for n in [100,150,200]:append_measure('f4-cum-'+str(n),n,'CUMULATIVE',channel='f4-cumulative')
equal(projected('f4-cumulative'),200,'F4 cumulative100→150→200 exactly200')
for i,n in enumerate([100,50,50]):append_measure('f4-delta-'+str(i),n)
equal(projected('f4-delta'),200,'F4 independent DELTA100+50+50 exactly200')
estimate=append_measure('f4-estimate',100,quality='ESTIMATED',channel='f4-replacement')
append_measure('f4-ambiguous',150,channel='f4-replacement',expect_error='CP14_AMBIGUOUS_DELTA')
actual=append_measure('f4-actual',150,predecessor=estimate['observation_id'],channel='f4-replacement')
equal(projected('f4-replacement'),150,'F4 explicit DELTA estimate100→actual150 exactly150')
root=append_measure('f4-root',100,channel='f4-chain')
correction=append_measure('f4-correct110',110,predecessor=root['observation_id'],channel='f4-chain')
append_measure('f4-branch120',120,predecessor=root['observation_id'],channel='f4-chain',expect_error='CP14_INVALID_CORRECTION')
append_measure('f4-correct120',120,predecessor=correction['observation_id'],channel='f4-chain')
equal(projected('f4-chain'),120,'F4 admitted correction chain root100→110→120 exactly120')
append_measure('f4-wrong-coverage',1,predecessor=actual['observation_id'],channel='f4-other',expect_error='CP14_CORRECTION_COVERAGE')
equal(projected('f4-delta'),200,'F4 unrelated units retained independently')
# Every mutation root reaches the same durable request binding; observation keys are separate.
f6=row('external_integration_usage_events');f6.update(call_id=c['call_id'],observation_key='f6-exact',observation_kind='RECOVERY',measurement_mode='NONE',status='UNKNOWN',usage_quality='UNKNOWN',cost_quality='UNKNOWN')
f6_fields={'integration_id':c['integration_id'],'call_id':c['call_id'],'row':f6};f6_id=uid()
first=invoke('external_integration_usage_append',f6_fields,'call_gateway','TRUSTED_WORKLOAD',request_id=f6_id)
equal(invoke('external_integration_usage_append',f6_fields,'call_gateway','TRUSTED_WORKLOAD',request_id=f6_id),first,'F6 exact request replay')
f6_changed={**f6,'observation_id':uid(),'observation_key':'f6-changed','status':'PARTIAL'}
invoke('external_integration_usage_append',{**f6_fields,'row':f6_changed},'call_gateway','TRUSTED_WORKLOAD',request_id=f6_id,expect_error='CP14_CHANGED_REQUEST')
other_call=next(pair[0] for pair,r in zip(records,results) if r.returncode==0 and pair[0]['call_id']!=c['call_id'])
invoke('external_integration_usage_append',{**f6_fields,'call_id':other_call['call_id'],'row':{**f6,'call_id':other_call['call_id']}},'call_gateway','TRUSTED_WORKLOAD',request_id=f6_id,expect_error='CP14_CHANGED_REQUEST')
invoke('external_integration_usage_append',f6_fields,'call_gateway','TRUSTED_WORKLOAD',request_id=f6_id,ctx_updates={'verified_actor_id':other,'verified_account_id':other},expect_error='CP14_CHANGED_REQUEST')
invoke('external_integration_usage_append',f6_fields,'recovery_gateway','TRUSTED_WORKLOAD',request_id=f6_id,expect_error='CP14_CHANGED_REQUEST')
invoke('external_integration_observe_call',terminal,'call_gateway','TRUSTED_WORKLOAD',request_id=f6_id,expect_error='CP14_CHANGED_REQUEST')
observe_id=uid();invoke('external_integration_observe_call',terminal,'recovery_gateway','TRUSTED_WORKLOAD',request_id=observe_id)
invoke('external_integration_observe_call',{**terminal,'safe_reason':'CHANGED'},'recovery_gateway','TRUSTED_WORKLOAD',request_id=observe_id,expect_error='CP14_CHANGED_REQUEST')
invoke('external_integration_usage_append',f6_fields,'recovery_gateway','TRUSTED_WORKLOAD')
equal(scalar(f"select count(*) from public.external_integration_config_audit where command_id='{f6_id}' and change_type='REQUEST_BINDING';"),'1','F6 append-only journal exact request once')

# F6 sibling health observations bind command identity, not merely observation identity.
h=json.loads(scalar("select to_jsonb(h) from public.external_integration_health_observations h where integration_id='synthetic-outbound' and observation_sequence=1;"));hf={'integration_id':c['integration_id'],'expected_version':integration['config_version'],'row':h};hid=uid()
invoke('external_integration_health_observe',hf,'call_gateway','TRUSTED_WORKLOAD',request_id=hid)
invoke('external_integration_health_observe',{**hf,'row':{**h,'health_observation_id':uid(),'observation_sequence':3}},'call_gateway','TRUSTED_WORKLOAD',request_id=hid,expect_error='CP14_CHANGED_REQUEST')
invoke('external_integration_usage_append',f6_fields,'call_gateway','TRUSTED_WORKLOAD',request_id=f6_id,ctx_updates={'verified_client_identity':uid()},expect_error='CP14_CHANGED_REQUEST')
# Competing correction successors serialize on the retained call; exactly one wins.
fanroot=append_measure('f4-concurrent-root',100,channel='f4-concurrent')
def successor(n):
 u={**fanroot,'observation_id':uid(),'observation_key':'f4-concurrent-'+str(n),'other_units':{'f4-concurrent':n},'supersedes_observation_id':fanroot['observation_id']}
 cmd,ctx=request('external_integration_usage_append',{'integration_id':c['integration_id'],'call_id':c['call_id'],'row':u},'recovery_gateway','TRUSTED_WORKLOAD')
 return sql(f"set session authorization otr_external_integration_recovery_gateway;select public.external_integration_usage_append({literal(ctx)},{literal(cmd)});",'supabase_admin',True)
with concurrent.futures.ThreadPoolExecutor(2) as pool:fanout=list(pool.map(successor,[110,120]))
equal(sum(x.returncode==0 for x in fanout),1,'F4 concurrent correction one successor')
equal(any('CP14_INVALID_CORRECTION' in x.stderr for x in fanout),True,'F4 concurrent fanout rejects')

# Closed inbound synthetic host custody metadata; no material store is created.
inbound=row('external_integrations');inbound.update(integration_id='synthetic-inbound',category='AI_CLIENT_INBOUND',vendor_namespace='synthetic',environment='TEST',admin_label='Synthetic inbound',enabled=True,kill_switch=True,capabilities=['SUBMIT','STATUS','REVIEW'],health_state='UNKNOWN',created_by=actor,updated_by=actor)
invoke('external_integration_configure',{'actor_id':actor,'integration_id':inbound['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','row':inbound})
invoke('external_integration_set_kill',{'actor_id':actor,'integration_id':inbound['integration_id'],'expected_version':1,'audit_id':uid(),'reason_code':'SYNTHETIC','kill_switch':False})
inbound.update(json.loads(scalar("select to_jsonb(i) from public.external_integrations i where integration_id='"+inbound['integration_id']+"';")))
identity=row('external_client_identities');identity.update(client_identity_id=client,integration_id=inbound['integration_id'],issuer_namespace='synthetic',subject_digest=H,auth_config_reference='authcfg:synthetic-v1',enabled=True)
grant=row('external_client_grants');grant.update(integration_id=inbound['integration_id'],client_identity_id=client,account_id=actor,user_id=actor,scope_kind='ACCOUNT_STAGING',actions=['SUBMIT','STATUS','REVIEW'],auth_session_reference='vault:synthetic-session',expires_at=FUTURE,authorized_by=actor)
invoke('external_client_authorize_grant',{'actor_id':actor,'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','identity':identity,'row':grant},'inbound_gateway','OTR_USER')
pkg=row('inbound_ai_import_reservations');pkg.update(integration_id=inbound['integration_id'],client_identity_id=client,account_id=actor,user_id=actor,grant_id=grant['grant_id'],admitted_grant_revision=1,contract_version='otr-inbound-import-v1',package_bytes=12,trip_intent_kind='SELECT',publication_refs=[],state='RESERVED',recovery_disposition='EXACT_RECOVERY_REQUIRED')
scope={'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'grant_id':grant['grant_id'],'grant_revision':1,'trip_id':None,'package_id':pkg['package_id']}
reserved=invoke('inbound_ai_reserve_package',{**scope,'row':pkg},'inbound_gateway','EXTERNAL_CLIENT');equal(reserved['reservation_id'],pkg['reservation_id'],'package reservation');equal(invoke('inbound_ai_reserve_package',{**scope,'row':pkg},'inbound_gateway','EXTERNAL_CLIENT')['reservation_id'],pkg['reservation_id'],'package same key/digest replay')
invoke('inbound_ai_reserve_package',{**scope,'row':{**pkg,'package_sha256':'b'*64}},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_CHANGED_PACKAGE')
invoke('inbound_ai_reserve_package',{**scope,'client_identity_id':uid(),'row':pkg},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_SCOPE_FORBIDDEN')
invoke('inbound_ai_reserve_package',{**scope,'account_id':other,'row':pkg},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_SCOPE_FORBIDDEN')
attached=invoke('inbound_ai_attach_material',{**scope,'reservation_id':pkg['reservation_id'],'expected_revision':1,'material_reference':uid(),'material_sha256':H,'material_admission_sha256':H},'inbound_gateway','EXTERNAL_CLIENT');equal(attached['state'],'MATERIAL_PENDING','custody metadata only')
inv=row('inbound_ai_invocations');inv.update(reservation_id=pkg['reservation_id'],integration_id=inbound['integration_id'],client_identity_id=client,account_id=actor,user_id=actor,grant_id=grant['grant_id'],admitted_grant_revision=1,action='SUBMIT',request_sha256=H,state='RESERVED')
ic,istart=call_and_start(inv['invocation_id'],inbound);inv['call_id']=ic['call_id'];ic['request_id']=inv['request_id']
invfields={**scope,'row':inv,'call':ic,'start':istart};first_inv=invoke('inbound_ai_reserve_invocation',invfields,'inbound_gateway','EXTERNAL_CLIENT',request_id=inv['request_id']);equal(invoke('inbound_ai_reserve_invocation',invfields,'inbound_gateway','EXTERNAL_CLIENT',request_id=inv['request_id'])['call_id'],first_inv['call_id'],'invocation response loss no second call')
invoke('inbound_ai_reserve_invocation',{**invfields,'start':{**istart,'observation_key':'changed-inbound-start'}},'inbound_gateway','EXTERNAL_CLIENT',request_id=inv['request_id'],expect_error='CP14_CHANGED_REQUEST')
response={'version':1,'state':'COMPLETE','reservation_id':pkg['reservation_id']}
complete_fields={**scope,'invocation_id':inv['invocation_id'],'expected_revision':1,'publication_fence':1,'state':'COMPLETE','response_version':1,'response_sha256':digest({'domain':'otr-cp14-safe-response-v1','response':response}),'safe_response':response}
reservation_result={'version':1,'state':'COMPLETE','reservation_id':pkg['reservation_id']}
complete_fields['reservation_update']={'expected_revision':2,'publication_fence':1,'state':'COMPLETE','import_id':uid(),'task_id':uid(),'publication_refs':[],'review_version':1,'result_version':1,'result_sha256':digest({'domain':'otr-cp14-reservation-result-v1','result':reservation_result}),'safe_result':reservation_result,'safe_reason':None}
completion=row('external_integration_usage_events');completion.update(call_id=ic['call_id'],observation_key='inbound-completion',observation_kind='COMPLETION',measurement_mode='NONE',status='SUCCEEDED',response_sha256=complete_fields['response_sha256'],usage_quality='UNKNOWN',cost_quality='UNKNOWN')
complete_fields['completion']=completion
complete=invoke('inbound_ai_complete_invocation',complete_fields,'inbound_gateway','EXTERNAL_CLIENT');equal(complete['safe_response'],response,'sealed safe response');equal(invoke('inbound_ai_complete_invocation',complete_fields,'inbound_gateway','EXTERNAL_CLIENT')['safe_response'],response,'sealed replay')
review=row('inbound_ai_review_decisions');review.update(reservation_id=pkg['reservation_id'],package_sha256=H,review_version=1,candidate_sha256=H,disposition='ACCEPT',confirmed_user_id=actor,confirmation_source='EXPLICIT_USER',confirmation_scope='EXACT_REVIEW_DECISION',confirmation_id=uid(),slot_id=uid(),operation_key=uid(),intended_event_id=uid(),input_identity_map={},state='RESERVED')
review_result=invoke('inbound_ai_reserve_review',{**scope,'row':review},'inbound_gateway','OTR_USER');replayed=invoke('inbound_ai_reserve_review',{**scope,'row':{**review,'confirmation_id':uid(),'slot_id':uid(),'operation_key':uid(),'intended_event_id':uid()}},'inbound_gateway','OTR_USER');equal(replayed['confirmation_id'],review_result['confirmation_id'],'generated confirmation IDs retained');equal(replayed['operation_key'],review_result['operation_key'],'generated operation key retained')
equal(invoke('inbound_ai_status',{**scope,'reservation_id':pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT')['state'],'COMPLETE','safe reservation result projection; not Event acceptance')
equal(scalar("select count(*) from public.external_integration_usage_events where observation_key='inbound-completion';"),'1','completion meter replay without transport repetition')
# An external sender cannot fabricate an authenticated user confirmation.
invoke('inbound_ai_reserve_review',{**scope,'row':{**review,'review_key':uid(),'review_decision_id':uid()}},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_CONFIRMATION_REQUIRED')
invoke('inbound_ai_status',{**scope,'reservation_id':pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',ctx_updates={'verified_external_subject':{'issuer_namespace':'wrong','subject_digest':H}},expect_error='CP14_INBOUND_CLOSED')
invoke('inbound_ai_status',{**scope,'reservation_id':pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',ctx_updates={'auth_config_version':2},expect_error='CP14_GRANT_FORBIDDEN')
invoke('inbound_ai_status',{**scope,'trip_id':uid(),'reservation_id':pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')
result={'version':1,'state':'PREPARED','review_decision_id':review['review_decision_id'],'confirmation_id':review['confirmation_id'],'slot_id':review['slot_id'],'operation_key':review['operation_key'],'event_id':review['intended_event_id']}
rfields={**scope,'review_decision_id':review['review_decision_id'],'expected_revision':1,'publication_fence':1,'state':'PREPARED','preparation_sha256':H,'result_sha256':digest({'domain':'otr-cp14-safe-review-result-v1','result':result}),'safe_result':result}
equal(invoke('inbound_ai_observe_review',rfields,'inbound_gateway','OTR_USER')['safe_result'],result,'review result sealed correlation')
equal(invoke('inbound_ai_observe_review',rfields,'inbound_gateway','OTR_USER')['safe_result'],result,'review response exact replay')
# Generic inbound calls do not attribute external AI tokens.
report=invoke('external_integration_admin_report',{'actor_id':actor,'integration_id':'synthetic-inbound'},'reporting_gateway');equal(report['usage'][0]['projection']['units']['input_tokens']['quantity'],None,'no invented inbound AI tokens')
# SINGLE_TRIP delegation requires current Trip permission on every disclosure.
trip=uid();sql(f"insert into public.trips(id,name,created_by) values('{trip}','CP14 synthetic Trip','{actor}');",'supabase_admin')
trip_grant={**grant,'grant_id':uid(),'scope_kind':'SINGLE_TRIP','trip_id':trip}
invoke('external_client_authorize_grant',{'actor_id':actor,'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','identity':identity,'row':trip_grant},'inbound_gateway','OTR_USER')
trip_pkg={**pkg,'reservation_id':uid(),'package_id':uid(),'idempotency_key':uid(),'grant_id':trip_grant['grant_id'],'trip_id':trip,'trip_intent_kind':'KNOWN'}
trip_scope={**scope,'grant_id':trip_grant['grant_id'],'trip_id':trip,'package_id':trip_pkg['package_id']}
equal(invoke('inbound_ai_reserve_package',{**trip_scope,'row':trip_pkg},'inbound_gateway','EXTERNAL_CLIENT')['trip_id'],trip,'single Trip admitted')
invoke('inbound_ai_status',{**trip_scope,'trip_id':uid(),'reservation_id':trip_pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')
# TARGETED F1/F5: retained parent scope and exact typed selection projection.
trip_review={**review,'review_decision_id':uid(),'reservation_id':trip_pkg['reservation_id'],'review_key':uid(),'candidate_id':uid()}
invoke('inbound_ai_reserve_review',{**trip_scope,'row':trip_review},'inbound_gateway','OTR_USER')
trip_result={**result,'review_decision_id':trip_review['review_decision_id']}
trip_observe={**rfields,**trip_scope,'review_decision_id':trip_review['review_decision_id'],'safe_result':trip_result,'result_sha256':digest({'domain':'otr-cp14-safe-review-result-v1','result':trip_result})}
equal(invoke('inbound_ai_observe_review',trip_observe,'inbound_gateway','OTR_USER')['safe_result'],trip_result,'F1 exact retained Trip review passes')
trip_inv={**inv,'invocation_id':uid(),'reservation_id':trip_pkg['reservation_id'],'grant_id':trip_grant['grant_id'],'request_id':uid()}
tic,tstart=call_and_start(trip_inv['invocation_id'],inbound);tic.update(trip_id=trip,request_id=trip_inv['request_id']);trip_inv['call_id']=tic['call_id']
trip_invfields={**trip_scope,'row':trip_inv,'call':tic,'start':tstart}
invoke('inbound_ai_reserve_invocation',trip_invfields,'inbound_gateway','EXTERNAL_CLIENT',request_id=trip_inv['request_id'])
# Package P2 grant must not authorize retained P1 review even when claims use P2.
p2=uid();p2_grant={**grant,'grant_id':uid(),'package_id':p2}
invoke('external_client_authorize_grant',{'actor_id':actor,'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','identity':identity,'row':p2_grant},'inbound_gateway','OTR_USER')
invoke('inbound_ai_observe_review',{**rfields,'grant_id':p2_grant['grant_id'],'package_id':p2},'inbound_gateway','OTR_USER',expect_error='CP14_GRANT_FORBIDDEN')
# Same-scope current replacement may recover a sealed result, without rewriting admission grants.
replacement={**grant,'grant_id':uid()}
invoke('external_client_authorize_grant',{'actor_id':actor,'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','identity':identity,'row':replacement},'inbound_gateway','OTR_USER')
equal(invoke('inbound_ai_observe_review',{**rfields,'grant_id':replacement['grant_id']},'inbound_gateway','OTR_USER')['safe_result'],result,'F1 same-scope replacement exact sealed recovery')
equal(scalar(f"select grant_id::text from public.inbound_ai_import_reservations where reservation_id='{pkg['reservation_id']}';"),grant['grant_id'],'F1 historical grant pins retained')
# Typed results reject private text, malformed digests, missing/extra or uncorrelated IDs before sealed replay.
for bad in [{**result,'confirmation_id':'RAW-TICKET-TEXT'},{**result,'event_id':'PNR-AB12CD'},{**result,'result_sha256':'not-a-digest'},{**result,'confirmation_id':uid()},{k:v for k,v in result.items() if k!='operation_key'},{**result,'publication_id':uid()},{**result,'safe_reason':'PRIVATE-TICKET-CODE'}]:
 invoke('inbound_ai_observe_review',{**rfields,'safe_result':bad,'result_sha256':digest({'domain':'otr-cp14-safe-review-result-v1','result':bad})},'inbound_gateway','OTR_USER',expect_error='CP14_SAFE_REVIEW')
for disposition,state in [('REJECT','REJECTED'),('DEFER','DEFERRED')]:
 d={**review,'review_decision_id':uid(),'review_key':uid(),'candidate_id':uid(),'disposition':disposition,'confirmation_id':None,'slot_id':None,'operation_key':None,'intended_event_id':None}
 invoke('inbound_ai_reserve_review',{**scope,'row':d},'inbound_gateway','OTR_USER')
 bad={**result,'review_decision_id':d['review_decision_id']}
 invoke('inbound_ai_observe_review',{**rfields,'review_decision_id':d['review_decision_id'],'safe_result':bad,'result_sha256':digest({'domain':'otr-cp14-safe-review-result-v1','result':bad})},'inbound_gateway','OTR_USER',expect_error='CP14_SAFE_REVIEW')
 good={'version':1,'state':state,'review_decision_id':d['review_decision_id']}
 good_fields={**rfields,'review_decision_id':d['review_decision_id'],'state':state,'preparation_sha256':None,'safe_result':good,'result_sha256':digest({'domain':'otr-cp14-safe-review-result-v1','result':good})}
 invoke('inbound_ai_observe_review',{**good_fields,'safe_result':{**good,'event_id':uid()}},'inbound_gateway','OTR_USER',expect_error='CP14_SAFE_REVIEW')
 equal(invoke('inbound_ai_observe_review',good_fields,'inbound_gateway','OTR_USER')['safe_result'],good,'F5 exact nonaccept projection')
for bad_response in [{**response,'reservation_id':uid()},{**response,'confirmation_id':uid()},{**response,'state':'REJECTED'},{**response,'safe_reason':'PNR-AB12CD'}]:
 invoke('inbound_ai_complete_invocation',{**complete_fields,'safe_response':bad_response,'response_sha256':digest({'domain':'otr-cp14-safe-response-v1','response':bad_response})},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_SAFE_RESPONSE')
# Each retained allocated ID is independently required and exact.
for field in ['confirmation_id','slot_id','operation_key','event_id']:
 for bad in [{**result,field:uid()},{k:v for k,v in result.items() if k!=field}]:
  invoke('inbound_ai_observe_review',{**rfields,'safe_result':bad,'result_sha256':digest({'domain':'otr-cp14-safe-review-result-v1','result':bad})},'inbound_gateway','OTR_USER',expect_error='CP14_SAFE_REVIEW')
# Completion replay must retain the exact request bytes independently of sealed response bytes.
completion_id=uid();invoke('inbound_ai_complete_invocation',complete_fields,'inbound_gateway','EXTERNAL_CLIENT',request_id=completion_id)
invoke('inbound_ai_complete_invocation',{**complete_fields,'expected_revision':2},'inbound_gateway','EXTERNAL_CLIENT',request_id=completion_id,expect_error='CP14_CHANGED_REQUEST')
review_observation_id=uid();invoke('inbound_ai_observe_review',rfields,'inbound_gateway','OTR_USER',request_id=review_observation_id)
invoke('inbound_ai_observe_review',{**rfields,'preparation_sha256':'b'*64},'inbound_gateway','OTR_USER',request_id=review_observation_id,expect_error='CP14_CHANGED_REQUEST')

# A T2 grant cannot target retained T1 even if caller claims T2.
trip2=uid();sql(f"insert into public.trips(id,name,created_by) values('{trip2}','CP14 second synthetic Trip','{actor}');",'supabase_admin')
t2_grant={**trip_grant,'grant_id':uid(),'trip_id':trip2}
invoke('external_client_authorize_grant',{'actor_id':actor,'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','identity':identity,'row':t2_grant},'inbound_gateway','OTR_USER')
invoke('inbound_ai_status',{**trip_scope,'grant_id':t2_grant['grant_id'],'trip_id':trip2,'reservation_id':trip_pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')

sql(f"update public.trips set created_by='{other}' where id='{trip}';delete from public.journey_members where trip_id='{trip}' and user_id='{actor}';",'supabase_admin')
invoke('inbound_ai_status',{**trip_scope,'reservation_id':trip_pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')
# Removed Trip access cannot be substituted by a valid ACCOUNT_STAGING grant.
staging_target={**scope,'package_id':trip_pkg['package_id']}
invoke('inbound_ai_status',{**staging_target,'reservation_id':trip_pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')
invoke('inbound_ai_reserve_review',{**staging_target,'row':{**trip_review,'review_decision_id':uid(),'review_key':uid()}},'inbound_gateway','OTR_USER',expect_error='CP14_GRANT_FORBIDDEN')
invoke('inbound_ai_observe_review',{**trip_observe,**staging_target},'inbound_gateway','OTR_USER',expect_error='CP14_GRANT_FORBIDDEN')
invoke('inbound_ai_reserve_invocation',{**trip_invfields,**staging_target},'inbound_gateway','EXTERNAL_CLIENT',request_id=uid(),expect_error='CP14_GRANT_FORBIDDEN')
invoke('inbound_ai_attach_material',{**staging_target,'reservation_id':trip_pkg['reservation_id'],'expected_revision':1,'material_reference':uid(),'material_sha256':H,'material_admission_sha256':H},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')
trip_response={'version':1,'state':'COMPLETE','reservation_id':trip_pkg['reservation_id']}
invoke('inbound_ai_complete_invocation',{**staging_target,'invocation_id':trip_inv['invocation_id'],'expected_revision':1,'publication_fence':1,'state':'COMPLETE','response_version':1,'response_sha256':digest({'domain':'otr-cp14-safe-response-v1','response':trip_response}),'safe_response':trip_response},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')

# FINAL F5/F6 RESIDUALS: sibling reservation reasons and all protected reads.
residual_start=checks
safe_reasons=['INVALID_PACKAGE','STALE_REVIEW','ACCESS_REVOKED','MATERIAL_UNAVAILABLE','EXACT_RECOVERY_REQUIRED','USER_REJECTED','USER_DEFERRED']
for bad_reason in ['PNR-AB12CD','RAW-TICKET-TEXT','provider/user free text','UNAPPROVED_CODE',123]:
 probe={**pkg,'reservation_id':uid(),'package_id':uid(),'idempotency_key':uid(),'safe_reason':bad_reason}
 invoke('inbound_ai_reserve_package',{**scope,'package_id':probe['package_id'],'row':probe},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_SAFE_REASON')
for reason in safe_reasons:
 probe={**pkg,'reservation_id':uid(),'package_id':uid(),'idempotency_key':uid(),'safe_reason':reason}
 probe_scope={**scope,'package_id':probe['package_id']};probe_fields={**probe_scope,'row':probe};probe_id=uid()
 answer=invoke('inbound_ai_reserve_package',probe_fields,'inbound_gateway','EXTERNAL_CLIENT',request_id=probe_id)
 equal(answer['safe_reason'],reason,'F5 finite initial reservation reason')
 equal(invoke('inbound_ai_reserve_package',probe_fields,'inbound_gateway','EXTERNAL_CLIENT',request_id=probe_id)['safe_reason'],reason,'F5 exact valid reason replay')
 changed_reason=next(x for x in safe_reasons if x!=reason)
 invoke('inbound_ai_reserve_package',{**probe_fields,'row':{**probe,'safe_reason':changed_reason}},'inbound_gateway','EXTERNAL_CLIENT',request_id=probe_id,expect_error='CP14_CHANGED_REQUEST')
# Real retained unsealed invocation exercises update admission, not only an early sealed-response return.
reason_pkg={**pkg,'reservation_id':uid(),'package_id':uid(),'idempotency_key':uid()}
reason_scope={**scope,'package_id':reason_pkg['package_id']}
invoke('inbound_ai_reserve_package',{**reason_scope,'row':reason_pkg},'inbound_gateway','EXTERNAL_CLIENT')
reason_inv={**inv,'invocation_id':uid(),'reservation_id':reason_pkg['reservation_id'],'request_id':uid()}
reason_call,reason_start=call_and_start(reason_inv['invocation_id'],inbound);reason_call['request_id']=reason_inv['request_id'];reason_inv['call_id']=reason_call['call_id']
invoke('inbound_ai_reserve_invocation',{**reason_scope,'row':reason_inv,'call':reason_call,'start':reason_start},'inbound_gateway','EXTERNAL_CLIENT',request_id=reason_inv['request_id'])
reason_result={'version':1,'state':'COMPLETE','reservation_id':reason_pkg['reservation_id']}
reason_update={**complete_fields['reservation_update'],'expected_revision':1,'safe_result':reason_result,'result_sha256':digest({'domain':'otr-cp14-reservation-result-v1','result':reason_result}),'safe_reason':'USER_DEFERRED'}
reason_complete={**reason_scope,'invocation_id':reason_inv['invocation_id'],'expected_revision':1,'publication_fence':1,'state':'COMPLETE','response_version':1,'response_sha256':digest({'domain':'otr-cp14-safe-response-v1','response':reason_result}),'safe_response':reason_result,'reservation_update':reason_update}
for bad_reason in ['PNR-AB12CD','RAW-TICKET-TEXT','provider/user free text','UNAPPROVED_CODE',123]:
 invoke('inbound_ai_complete_invocation',{**reason_complete,'reservation_update':{**reason_update,'safe_reason':bad_reason}},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_SAFE_REASON')
reason_request=uid();invoke('inbound_ai_complete_invocation',reason_complete,'inbound_gateway','EXTERNAL_CLIENT',request_id=reason_request)
equal(scalar(f"select safe_reason from public.inbound_ai_import_reservations where reservation_id='{reason_pkg['reservation_id']}';"),'USER_DEFERRED','F5 finite completion persists')
equal(invoke('inbound_ai_complete_invocation',reason_complete,'inbound_gateway','EXTERNAL_CLIENT',request_id=reason_request)['safe_response'],reason_result,'F5 valid sealed reason replay')
invoke('inbound_ai_complete_invocation',{**reason_complete,'reservation_update':{**reason_update,'safe_reason':'USER_REJECTED'}},'inbound_gateway','EXTERNAL_CLIENT',request_id=reason_request,expect_error='CP14_CHANGED_REQUEST')
# Sealed replay/recovery also validates reason grammar before returning stored response.
for gateway in ['inbound_gateway','recovery_gateway']:
 invoke('inbound_ai_complete_invocation',{**reason_complete,'reservation_update':{**reason_update,'safe_reason':'PNR-AB12CD'}},gateway,'EXTERNAL_CLIENT',expect_error='CP14_SAFE_REASON')
equal(invoke('inbound_ai_complete_invocation',reason_complete,'recovery_gateway','EXTERNAL_CLIENT')['safe_response'],reason_result,'F5 valid retained recovery')
# Storage constraint protects every reservation update path, with no generic K escape.
equal(scalar("select count(*) from pg_constraint where conrelid='public.inbound_ai_import_reservations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%safe_reason%' and pg_get_constraintdef(oid) like '%USER_DEFERRED%';"),'1','F5 finite storage CHECK')
read_specs=[
 ('inbound_ai_status',{**scope,'reservation_id':pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT'),
 ('external_integration_admin_report',{'actor_id':actor,'integration_id':'synthetic-outbound'},'reporting_gateway','OTR_ADMIN'),
 ('external_integration_recover_exact',{'actor_id':actor,'integration_id':'synthetic-outbound','call_id':c['call_id'],'reservation_id':None},'recovery_gateway','OTR_ADMIN')]
read_ids=[]
for kind,read_fields,gateway,principal in read_specs:
 rid=uid();read_ids.append(rid)
 first_read=invoke(kind,read_fields,gateway,principal,request_id=rid)
 equal(invoke(kind,read_fields,gateway,principal,request_id=rid),first_read,'F6 exact read replay '+kind)
 changed_body={**read_fields}
 if kind=='inbound_ai_status':changed_body['reservation_id']=reason_pkg['reservation_id'];changed_body['package_id']=reason_pkg['package_id']
 elif kind=='external_integration_admin_report':changed_body['integration_id']='synthetic-rate'
 else:changed_body['call_id']=other_call['call_id']
 invoke(kind,changed_body,gateway,principal,request_id=rid,expect_error='CP14_CHANGED_REQUEST')
 invoke(kind,read_fields,gateway,principal,request_id=f6_id,expect_error='CP14_CHANGED_REQUEST')
 changed_client=uid();client_fields={**read_fields,'client_identity_id':changed_client} if kind=='inbound_ai_status' else read_fields
 invoke(kind,client_fields,gateway,principal,request_id=rid,ctx_updates={'verified_client_identity':changed_client},expect_error='CP14_CHANGED_REQUEST')
 if kind=='inbound_ai_status':
  invoke(kind,read_fields,gateway,'OTR_USER',request_id=rid,expect_error='CP14_CHANGED_REQUEST')
  wrong_account={**read_fields,'account_id':other}
 else:wrong_account=read_fields
 invoke(kind,wrong_account,gateway,principal,request_id=rid,ctx_updates={'verified_account_id':other},expect_error='CP14_CHANGED_REQUEST')
 invoke(kind,read_fields,gateway,principal,request_id=rid,ctx_updates={'gateway_identity':'otr_external_integration_call_gateway'},role='otr_external_integration_'+gateway,expect_error='CP14_CONTEXT_FORBIDDEN')
 equal(invoke(kind,read_fields,gateway,principal),first_read,'F6 new authorized read ID '+kind)
 equal(scalar(f"select count(*) from public.external_integration_config_audit where command_id='{rid}' and change_type='REQUEST_BINDING';"),'1','F6 durable read journal '+kind)
for i,(kind,read_fields,gateway,principal) in enumerate(read_specs):
 invoke(kind,read_fields,gateway,principal,request_id=read_ids[(i+1)%3],expect_error='CP14_CHANGED_REQUEST')
 invoke('external_integration_usage_append',f6_fields,'call_gateway','TRUSTED_WORKLOAD',request_id=read_ids[i],expect_error='CP14_CHANGED_REQUEST')
for gateway in ['admin_gateway','call_gateway','inbound_gateway','reporting_gateway','recovery_gateway']:
 cmd,ctx=request('external_integration_admin_report',read_specs[1][1],gateway,'OTR_ADMIN')
 equal(sql(f"set session authorization otr_external_integration_{gateway};select public.cp14_bind_request({literal(ctx)},{literal(cmd)});",'supabase_admin',True).returncode!=0,True,'F6 gateway no direct binding helper '+gateway)
equal(scalar("select has_table_privilege('otr_external_integration_reader','public.external_integration_config_audit','INSERT,UPDATE,DELETE,TRUNCATE');"),'f','F6 reader no audit DML grant')
residual_checks=checks-residual_start

# A STATUS-only fresh grant cannot submit or review; expired admission cannot authorize.
status_grant={**grant,'grant_id':uid(),'actions':['STATUS']}
invoke('external_client_authorize_grant',{'actor_id':actor,'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','identity':identity,'row':status_grant},'inbound_gateway','OTR_USER')
invoke('inbound_ai_reserve_package',{**scope,'grant_id':status_grant['grant_id'],'row':{**pkg,'grant_id':status_grant['grant_id']}},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')
# Disposable administrator fixture expires a separate grant; no product expiry bypass.
sql(f"alter table public.external_client_grants disable trigger user;update public.external_client_grants set expires_at='{NOW}' where grant_id='{status_grant['grant_id']}';alter table public.external_client_grants enable trigger user;",'supabase_admin')
invoke('inbound_ai_status',{**scope,'grant_id':status_grant['grant_id'],'reservation_id':pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')
expired_grant={**grant,'grant_id':uid(),'expires_at':NOW}
invoke('external_client_authorize_grant',{'actor_id':actor,'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'expected_version':None,'audit_id':uid(),'reason_code':'SYNTHETIC','identity':identity,'row':expired_grant},'inbound_gateway','OTR_USER',expect_error='CP14_GRANT_SCOPE')
invoke('external_client_revoke_grant',{'actor_id':actor,'account_id':actor,'client_identity_id':client,'integration_id':inbound['integration_id'],'grant_id':grant['grant_id'],'expected_version':1,'audit_id':uid(),'reason_code':'SYNTHETIC'},'inbound_gateway','OTR_USER')
invoke('inbound_ai_status',{**scope,'reservation_id':pkg['reservation_id']},'inbound_gateway','EXTERNAL_CLIENT',expect_error='CP14_GRANT_FORBIDDEN')
for role in ['anon','authenticated','service_role']:
 for table in spec_tables:
  for dml in [f"update public.{table} set "+next(iter(row(table)))+"="+next(iter(row(table)))+" where false;",f"delete from public.{table} where false;",f"truncate public.{table};"]:
   equal(sql(f"set session authorization {role};"+dml,'supabase_admin',True).returncode!=0,True,role+' actual write denied')
 equal(scalar(f"select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('external_integration_reserve_inbound_call','external_integration_complete_inbound_call') and has_function_privilege('{role}',oid,'EXECUTE');"),'0',role+' no bridge EXECUTE')
# Persist only safe aggregate results; no credentials/material/packages in output.
print(json.dumps({'checks':checks,'status':'PASS','gates':'CLOSED','container':CONTAINER,'residual_checks':residual_checks}))
