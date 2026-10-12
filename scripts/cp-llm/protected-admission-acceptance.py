"""Actual protected roots, UUID-named cached synthetic network-none PostgreSQL only."""
from pathlib import Path
import subprocess, json, uuid, time, copy, concurrent.futures, datetime, re
ROOT=Path(__file__).resolve().parents[2]
NAME='otr-cp-llm-r2-'+uuid.uuid4().hex[:12]
IMAGE='sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068'
created=False
checks=[]
phase="bootstrap"
def docker(*args):return subprocess.run(['docker',*args],capture_output=True,text=True,timeout=30)
try:
 result=docker('run','--name',NAME,'--network','none','-d',IMAGE)
 assert result.returncode==0,result.stderr
 created=True
 for n in range(40):
  if docker('exec',NAME,'pg_isready','-U','supabase_admin').returncode==0:break
  time.sleep(.25)
 else:raise AssertionError('fixture not ready')
 source=(ROOT/'scripts/cp15/security-acceptance.py').read_text().split("reserve(call(),expect_error='CP15_MONETARY_CLOSED')")[0]
 source=source.replace("schema_contracts=[{'id':'flight','version':1,'dialect':'otr'}],privacy_policy=","schema_contracts=[{'id':'flight','version':1,'dialect':'otr'}],schema_output=True,privacy_policy=")
 source=source.replace("'otr-cp15-acceptance'",repr(NAME)).replace("'cp15-flight'",repr('cp15-flight-r2-'+uuid.uuid4().hex[:8]))
 # Adapt only the task-owned bootstrap; preserve the shared CP15 source.
 start=source.index('rid=uid();fields=admin(runtime_enabled=True);')
 end=source.index("i=row('external_integrations');",start)
 source=source[:start]+"""initial_revision=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';"))
print(json.dumps({'phase':'bootstrap','observed_dev_revision':initial_revision}),flush=True)
rid=uid();fields=admin(runtime_enabled=True,expected_version=initial_revision)
v=invoke('flight_activation_runtime',fields,request_id=rid)
equal(v['version'],initial_revision+1,'read-and-CAS runtime initialization')
equal(invoke('flight_activation_runtime',fields,request_id=rid),v,'runtime exact replay')
invoke('flight_activation_runtime',{**fields,'runtime_enabled':False},request_id=rid,expect_error='CP14_CHANGED_REQUEST')
invoke('flight_activation_runtime',admin(runtime_enabled=False,expected_version=initial_revision),expect_error='CP15_CAS')
equal(scalar("select kill_switch from public.external_integration_environment_state where environment='DEV';"),'t','runtime does not clear kill')
invoke('external_integration_set_kill',admin(expected_version=initial_revision+1,kill_switch=False))
"""+source[end:]
 inner="exec(compile(source,str(root/'scripts/cp14/persistence-acceptance.py'),'exec'))"
 assert source.count(inner)==1
 source=source.replace(inner,"source=source.replace(\"'-v','ON_ERROR_STOP=1'\",\"'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'\")\n"+inner)
 ns={'__file__':str(ROOT/'scripts/cp15/security-acceptance.py')}
 exec(compile(source,ns['__file__'],'exec'),ns)
 globals().update({k:v for k,v in ns.items() if k not in ['ROOT','__file__','source','NAME','created','checks']})
 before_memberships=scalar("select coalesce(json_agg(json_build_array(grantor,admin_option,inherit_option,set_option) order by grantor),'[]'::json)::text from pg_auth_members where member='postgres'::regrole and roleid='otr_external_integration_meter_writer'::regrole;")
 print('pre-migration memberships '+before_memberships,flush=True)
 phase='migration install'
 sql((ROOT/'supabase/migrations/20261012000100_model_task_protected_admission.sql').read_text(),'postgres')
 phase='protected roots'
 profile=json.loads((ROOT/'scripts/cp-llm/profile-vector.json').read_text())['profile']
 policy={'version':1,'privacy':'REMOTE_ALLOWED','network_required':True,'region':p['data_region'],'route':p['routing_class'],'budget_currency':'USD','budget_nanos':'1000000000','max_attempts':1,'deadline':FUTURE}
 scope.update(revision=scope['revision']+1,monetary_approved=True,call_cost_nanos='1000000000',account_day_cost_nanos='10000000000',dev_day_cost_nanos='100000000000')
 for key in scope['pins']:
  if key in profile:scope['pins'][key]=profile[key]
 scope['pins']['policy_sha256']=digest(policy)
 scope['pins']['provider_config_sha256']=p['configuration_sha256']
 scope['pins']['price_sha256']=price['schedule_sha256']
 select(scope)
 old_call=call
 def call(account=actor,trip_id=trip):
  f=old_call(account,trip_id)
  f['row']['schema_sha256']=profile['output_schema_sha256']
  q={'contract_version':'otr-model-task-v1','task_id':f['row']['task_id'],'logical_request_id':uid(),'logical_idempotency_key':uid(),'consumer_id':'import','consumer_version':1,'input':{'reference':uid(),'sha256':H,'byte_count':1},'schema':{'id':'FLIGHT_REMOTE_OUTPUT_V1','version':1,'dialect':'OTR_TYPED_V1','sha256':profile['output_schema_sha256']},'policy_snapshot':copy.deepcopy(policy),'policy_sha256':digest(policy)}
  f['model_task_binding']={'version':1,'request':q,'request_sha256':digest(q),'profile':copy.deepcopy(profile),'profile_sha256':digest(profile)}
  return f
 def raw(f,begin=False):
  cmd,ctx=request('flight_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id'],ctx_updates={'verified_actor_id':f['account_id'],'verified_account_id':f['account_id']})
  return ('begin;' if begin else '')+f"set session authorization otr_external_integration_call_gateway;select public.flight_activation_reserve_call({literal(ctx)},{literal(cmd)});"
 def counts():return scalar("select json_build_array((select count(*) from public.external_integration_calls),(select count(*) from public.external_integration_usage_events where observation_kind='START'),(select count(*) from public.flight_call_resource_holds),(select count(*) from public.model_task_admissions));")
 def deny(f,code=None):
  before=counts();result=sql(raw(f),'supabase_admin',True)
  assert result.returncode!=0,'unexpected admission'
  if code:assert code in result.stderr,result.stderr
  assert counts()==before,'rejected admission created durable rows'
 def sibling(f):
  g=call(f['account_id'],f['row']['trip_id']);g['row']['task_id']=f['row']['task_id'];g['model_task_binding']=copy.deepcopy(f['model_task_binding']);return g
 # Real lock barriers prove both winner commit and rollback, rather than scheduling luck.
 def wait_for_sleep(name):
  for attempt in range(25):
   if scalar(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event='PgSleep';")=='1':return
   time.sleep(.02)
  raise AssertionError('holder barrier not reached')
 for finish in ['commit','rollback']:
  first=call();second=sibling(first)
  with concurrent.futures.ThreadPoolExecutor(2) as pool:
   holder=pool.submit(sql,"set application_name='model-task-holder';"+raw(first,True)+"select pg_sleep(3);"+finish+';','supabase_admin',True)
   wait_for_sleep('model-task-holder')
   waiter=pool.submit(sql,"set application_name='model-task-waiter';"+raw(second),'supabase_admin',True)
   for attempt in range(20):
    if scalar("select count(*) from pg_stat_activity where application_name='model-task-waiter' and wait_event_type='Lock';")=='1':break
    time.sleep(.02)
   else:raise AssertionError('independent caller did not contend on lock')
   hr,wr=holder.result(),waiter.result()
  assert hr.returncode==0,hr.stderr
  assert (wr.returncode==0)==(finish=='rollback'),wr.stderr
  chosen=second if finish=='rollback' else first
  c=reserve(chosen);mark(c);complete(c);deny(sibling(chosen),'MODEL_TASK_ALREADY_ADMITTED')
 checks.append('observed concurrent lock barriers: winner commit and winner rollback')
 f=call();g=sibling(f)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:rs=list(pool.map(lambda a:sql(raw(a),'supabase_admin',True),[f,g]))
 assert sum(x.returncode==0 for x in rs)==1,[x.stderr for x in rs]
 winner=next(a for a,x in zip([f,g],rs) if x.returncode==0)
 before=counts();c=reserve(winner);assert counts()==before
 deny(sibling(winner));checks.append('concurrent independent sequence1 + exact replay + no rejected rows')
 mark(c);complete(c);deny(sibling(winner));checks.append('TERMINAL lifetime uniqueness')
 f=call();c=reserve(f);mark(c)
 invoke('external_integration_observe_call',{'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':2,'publication_fence':1,'dispatch_state':'UNKNOWN','execution_certainty':'UNKNOWN','safe_reason':'SYNTHETIC_UNKNOWN','recovery_sha256':None},'call_gateway','TRUSTED_WORKLOAD')
 deny(sibling(f));checks.append('UNKNOWN lifetime uniqueness')
 # Verify persistence across a real PostgreSQL container restart before resolving UNKNOWN.
 assert docker('restart',NAME).returncode==0
 for n in range(40):
  if docker('exec',NAME,'pg_isready','-U','supabase_admin').returncode==0:break
  time.sleep(.25)
 before=counts();assert reserve(f)['call_id']==c['call_id'];assert counts()==before;deny(sibling(f));checks.append('restart exact replay and UNKNOWN retained')
 # Finish UNKNOWN responsibility only through the original recovery root, then allow next task.
 invoke('external_integration_observe_call',{'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':3,'publication_fence':1,'dispatch_state':'TERMINAL','execution_certainty':'TERMINAL','safe_reason':'SYNTHETIC_TERMINAL','recovery_sha256':H},'recovery_gateway','TRUSTED_WORKLOAD')
 # Re-signed changed snapshots remain denied even with a fresh outer command request.
 for key in ['request_sha256','profile_sha256']:
  g=copy.deepcopy(winner);g['model_task_binding'][key]='b'*64;deny(g)
 checks.append('changed snapshot digest rejected')
 # Actual transaction rollback releases every insertion, allowing the other caller.
 f=call();before=counts();result=sql(raw(f,True)+'rollback;','supabase_admin',True)
 assert result.returncode==0,result.stderr
 assert counts()==before
 c=reserve(sibling(f));mark(c);complete(c);checks.append('winner rollback + subsequent independent admission')
 for role in ['anon','authenticated','service_role','otr_external_integration_call_gateway']:
  assert sql(f"set session authorization {role};select * from public.model_task_admissions;",'supabase_admin',True).returncode!=0
 assert scalar("select relrowsecurity and relforcerowsecurity from pg_class where oid='public.model_task_admissions'::regclass;")=='t'
 for action in ['delete from public.model_task_admissions','truncate public.model_task_admissions','alter table public.model_task_admissions disable trigger all']:
  assert sql('set session authorization otr_external_integration_call_gateway;'+action,'supabase_admin',True).returncode!=0
 checks.append('FORCE RLS and role/bypass denials')
 # Fresh task and changed immutable bindings fail closed, without durable side effects.
 for section,key,value in [('request','contract_version','wrong'),('request','consumer_version',2),('profile','modality','VISION')]:
  f=call();f['model_task_binding'][section][key]=value
  f['model_task_binding'][section+'_sha256']=digest(f['model_task_binding'][section]);deny(f)
 for field in ['input','schema','policy_snapshot']:
  f=call();del f['model_task_binding']['request'][field]
  f['model_task_binding']['request_sha256']=digest(f['model_task_binding']['request']);deny(f)
 f=call();del f['model_task_binding'];deny(f)
 f=call();f['model_task_binding']['request']['policy_snapshot']['privacy']='OTR_ONLY'
 q=f['model_task_binding']['request'];q['policy_sha256']=digest(q['policy_snapshot']);f['model_task_binding']['request_sha256']=digest(q);deny(f,'MODEL_TASK_POLICY')
 checks.append('contract/profile/schema/privacy and missing binding fail closed')
 def set_policy(**changes):
  policy.update(changes);scope.update(revision=scope['revision']+1)
  scope['pins']['policy_sha256']=digest(policy);select(scope)
 # Task currency and ceiling checks retain original Server84 hold calculation.
 set_policy(budget_nanos='10239');deny(call(),'MODEL_TASK_BUDGET')
 set_policy(budget_currency='EUR');deny(call(),'MODEL_TASK_BUDGET')
 set_policy(budget_nanos='10240',budget_currency='USD')
 f=call();c=reserve(f)
 assert scalar(f"select worst_cost_nanos from public.flight_call_resource_holds where call_id='{c['call_id']}';")=='10240'
 mark(c);complete(c);checks.append('exact conservative Hold boundary and currency mismatch')
 # Rotate task policy and execution scope; historical exact replay stays metadata only.
 set_policy(budget_nanos='1000000000')
 before=counts();assert reserve(f)['call_id']==c['call_id'];assert counts()==before;deny(sibling(f))
 checks.append('scope rotation exact replay and lifetime uniqueness')
 def test_account():
  account,trip_id=uid(),uid()
  sql(f"insert into auth.users(id) values('{account}');insert into public.profiles(id,display_name) values('{account}','Model Task fixture');insert into public.trips(id,name,created_by) values('{trip_id}','Model Task fixture','{account}');",'supabase_admin')
  g={'scope_id':scope['scope_id'],'account_id':account,'revision':1,'expires_at':FUTURE,'revoked':False,'updated_by':actor}
  grant_account(g);return account,trip_id,g
 deadline=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=2)).isoformat(timespec='milliseconds').replace('+00:00','Z')
 account,trip_id,_=test_account()
 set_policy(deadline=deadline);f=call(account,trip_id);c=reserve(f)
 sql('select pg_sleep(2.1);')
 before=counts();mark(c,expect_error='MODEL_TASK_DEADLINE');assert counts()==before
 # Cancellation/revocation may block a previously reserved call but cannot release Task.
 deny(sibling(f));checks.append('deadline expires after reserve before mark; binding retained')
 # Reserved expired responsibility remains retained; use another Account for later cases.
 set_policy(deadline=FUTURE)
 account,trip_id,test_grant=test_account();f=call(account,trip_id);c=reserve(f)
 test_grant['revision']+=1;test_grant['revoked']=True;grant_account(test_grant)
 before=counts();mark(c,expect_error='CP15_ACCOUNT_CLOSED');reserve(f,expect_error='CP15_ACCOUNT_CLOSED');assert counts()==before
 test_grant['revision']+=1;test_grant['revoked']=False;grant_account(test_grant)
 # Updated grant revision fences old mark, while duplicate task allocation still fails.
 mark(c,expect_error='CP15_HOLD_PIN');deny(sibling(f));checks.append('revoked Account grant and rotation fence')
 account,trip_id,_=test_account();f=call(account,trip_id);c=reserve(f)
 sql(f"update public.trips set created_by='{other}' where id='{trip_id}';update public.journey_members set status='unlinked' where trip_id='{trip_id}' and user_id='{account}';",'supabase_admin')
 assert scalar(f"select public.cp14_trip_access('{account}','{trip_id}');")=='f'
 before=counts();mark(c,expect_error='CP14_TRIP_FORBIDDEN');reserve(f,expect_error='CP14_TRIP_FORBIDDEN');assert counts()==before
 sql(f"update public.trips set created_by='{account}' where id='{trip_id}';",'supabase_admin')
 mark(c);complete(c);checks.append('Trip authorization loss blocks mark and replay')
 # Scope rotation denies a fresh dispatch of the old reservation.
 account,trip_id,_=test_account();f=call(account,trip_id);c=reserve(f);scope['revision']+=1;select(scope)
 mark(c,expect_error='CP15_SCOPE_CLOSED');deny(sibling(f));checks.append('scope rotation fences old mark without freeing Task')
 # Original generic reserve root can retain historical Calls but cannot dispatch them.
 f=call();legacy={k:f[k] for k in ['account_id','integration_id','row','start']}
 c=invoke('external_integration_reserve_call',legacy,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id'])
 before=counts();mark(c,expect_error='CP14_RUNTIME_CLOSED');deny(f,'CP14_CHANGED_REQUEST');deny(sibling(f),'MODEL_TASK_LEGACY_UNBOUND');assert counts()==before
 recovered=invoke('external_integration_recover_exact',{'actor_id':actor,'integration_id':i['integration_id'],'call_id':c['call_id'],'reservation_id':None},'recovery_gateway','OTR_ADMIN')
 assert recovered['call']['call_id']==c['call_id'];checks.append('historical unbound Call exact recovery, no dispatch')
 # Current verified principal rejection and cancellation/fence do not release identity.
 f=call();cmd,ctx=request('flight_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id'],ctx_updates={'revoked':True})
 before=counts();r=sql(f"set session authorization otr_external_integration_call_gateway;select public.flight_activation_reserve_call({literal(ctx)},{literal(cmd)});",'supabase_admin',True)
 assert r.returncode!=0 and counts()==before
 c=reserve(f)
 invoke('external_integration_mark_dispatch',{'account_id':actor,'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':2},'call_gateway','TRUSTED_WORKLOAD',expect_error='CP14_DISPATCH_FENCE')
 deny(sibling(f),'MODEL_TASK_ALREADY_ADMITTED');mark(c);complete(c)
 checks.append('revoked verifier and canceled/stale publication fence; lifetime retained')
 # Freeze SQL/Python hashes over the exact profile vector, not only successful inserts.
 assert scalar(f"select public.cp14_hash({literal(profile)});")==json.loads((ROOT/'scripts/cp-llm/profile-vector.json').read_text())['sha256']
 task_vector=json.loads((ROOT/'scripts/cp-llm/model-task-vector.json').read_text())
 assert scalar(f"select public.cp14_hash({literal(task_vector['request'])});")==task_vector['request_sha256']
 assert scalar(f"select public.cp14_hash({literal(task_vector['request']['policy_snapshot'])});")==task_vector['policy_sha256']
 checks.append('canonical JSON and SHA256 Python/PostgreSQL vector')
 # Scope Hold day sum remains the authority, with exact boundary then next rejection.
 spent=int(scalar(f"select coalesce(sum(worst_cost_nanos),0) from public.flight_call_resource_holds where account_id='{actor}' and admission_day=(clock_timestamp() at time zone 'UTC')::date;"))
 scope.update(revision=scope['revision']+1,account_day_cost_nanos=str(spent+10240));select(scope)
 f=call();c=reserve(f);mark(c);complete(c);deny(call(),'CP15_BUDGET');checks.append('Account/day exact boundary and next Hold rejection')
 # Even the writer cannot mutate/erase admission records or disable their triggers.
 for action in ["update public.model_task_admissions set max_cost_nanos=1","delete from public.model_task_admissions","truncate public.model_task_admissions","alter table public.model_task_admissions disable trigger all"]:
  assert sql('set session authorization otr_external_integration_meter_writer;'+action,'supabase_admin',True).returncode!=0
 after_memberships=scalar("select coalesce(json_agg(json_build_array(grantor,admin_option,inherit_option,set_option) order by grantor),'[]'::json)::text from pg_auth_members where member='postgres'::regrole and roleid='otr_external_integration_meter_writer'::regrole;")
 assert after_memberships==before_memberships,(before_memberships,after_memberships)
 checks.append('immutable writer guards and migration privileges removed')
 # Tests are not allowed to leave even their synthetic runtime flags open.
 invoke('flight_activation_runtime',admin(expected_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';")),runtime_enabled=False))
 invoke('external_integration_set_kill',admin(expected_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';")),kill_switch=True))
 assert scalar("select count(*) from public.external_integration_environment_state where runtime_enabled;")=='0'
 evidence={'status':'PASS','checks':checks,'network':'none','provider_calls':0,'activation':'CLOSED','bootstrap_revision':initial_revision if 'initial_revision' in globals() else ns['initial_revision']}
 (ROOT/'docs/architecture/CP_LLM_02A_R2B_POSTGRESQL_EVIDENCE.json').write_text(json.dumps(evidence,indent=2)+'\n')
 print(json.dumps(evidence))
except Exception as error:
 evidence={'status':'FAIL','completed_checks':checks,'phase':phase,'finding':str(error)[-3500:],'provider_calls':0}
 (ROOT/'docs/architecture/CP_LLM_02A_R2B_POSTGRESQL_EVIDENCE.json').write_text(json.dumps(evidence,indent=2)+'\n')
 print(json.dumps(evidence))
 raise
finally:
 if created:assert docker('rm','-f',NAME).returncode==0
