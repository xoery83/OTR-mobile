"""Network-none real Source/CP15 reserve; fixture clock aging is never a DEV repair."""
from pathlib import Path
import os
MAIN=Path.cwd()
ROOT=Path(os.environ.get('OTR_UNIVERSAL_EXISTING_SQL_FIXTURE_ROOT','/Users/xoery/Project/otr-mobile-universal-handoff-20261026'))
wrapper=(MAIN/'scripts/import-workbench/universal-continuous-source-acceptance.py').read_text()
wrapper=wrapper.replace('root=Path(__file__).resolve().parents[2]', 'root=FIXTURE_ROOT')
def extend(s):
 s=s.replace("ACTOR,OTHER,TRIP=[str(uuid.uuid4()) for _ in range(3)]", "ACTOR,OTHER,TRIP=['f4b059c5-8241-4ffb-aa15-37fa25474543',str(uuid.uuid4()),'825f79b2-4a9d-4535-a62e-43000ca50c4a']")
 s=s.replace("'--network','none','-d',IMAGE", "'--network','none','--memory','256m','--cpus','1','-d',IMAGE")
 s=s.replace("exec(compile(setup,'existing-cp15-synthetic-fixture','exec'),provision)", "setup=setup.replace(\"repr('universal-fixture-'+uuid.uuid4().hex[:8])\",\"repr('otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d')\")\n exec(compile(setup,'existing-cp15-synthetic-fixture','exec'),provision)")
 s=s.replace("scope=row('flight_activation_scopes');scope.update(", "scope=row('flight_activation_scopes');scope['scope_id']='baac2ca8-f769-4ace-8bd4-d394a36312d6';scope.update(")
 anchor=" selected=json.loads(meter("
 pos=s.index(anchor)
 bump="""
 def append_scope(**changes):
  previous=scope['revision'];scope.update(revision=previous+1,**changes)
  scope['scope_sha256']=json.loads(P['scalar']("select to_jsonb(public.cp14_hash(to_jsonb(jsonb_populate_record(null::public.flight_activation_scopes,"+pliteral(scope)+"))-'scope_sha256'));"))
  invoke('flight_activation_select',admin(integration_id=i['integration_id'],expected_version=previous,row=scope))
 for _ in range(4):append_scope()
"""
 s=s[:pos]+bump+s[pos:]
 stop=s.index(' check(\'actual immutable admitted price remains readable\'')
 s=s[:stop]+ADDITION+s[s.index('\nfinally:',stop):]
 return s
ADDITION=r'''
 import copy,concurrent.futures
 packet=Path(MAIN_ROOT)/'docs/ops/universal-p2-formal-save-20261027'
 pre=(packet/'P2_RESOURCE_LEASE_FUNCTION_PREIMAGE.sql').read_text();post=(packet/'P2_RESOURCE_LEASE_FUNCTION_POSTIMAGE.sql').read_text()
 hashes=json.loads((packet/'P2_RESOURCE_LEASE_PACKAGE_HASHES.json').read_text())
 sig="'public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure"
 # Canonical hosted preimage used verbatim: fixture-only role owner metadata restore.
 sql('SET SESSION AUTHORIZATION postgres;'+pre+';ALTER FUNCTION public.flight_activation_reserve_call(jsonb,jsonb) OWNER TO otr_external_integration_meter_writer;REVOKE CREATE ON SCHEMA public FROM otr_external_integration_meter_writer;')
 def state():return sql("select jsonb_build_array((select count(*) from external_integration_calls),(select count(*) from flight_call_resource_holds),(select count(*) from model_task_admissions),(select coalesce(sum(worst_cost_nanos),0) from flight_call_resource_holds));")
 before=state();oldcall=c['call_id']
 def make():
  newbatch,newtask,newrun=[str(uuid.uuid4()) for _ in range(3)]
  pins=copy.deepcopy(inputs)
  for pin in pins:pin['id']=str(uuid.uuid4())
  q={'runId':newrun,'taskId':newtask,'batchId':newbatch,'submissionSha256':'a'*64,'inputs':pins}
  made=json.loads(source("select public.trip_source_begin_sustained_universal_inputs('"+ACTOR+"','"+TRIP+"',"+literal(canon(q))+");"))
  rr=copy.deepcopy(c)
  for key in ['call_id','request_id','attempt_id','fallback_chain_id','idempotency_key']:rr[key]=str(uuid.uuid4())
  rr.update(import_id=newbatch,task_id=newtask,dispatch_state='RESERVED',execution_certainty='NOT_STARTED',row_revision=1)
  ip=copy.deepcopy(inputpins)
  bysource={pin['source_id']:pin['id'] for pin in pins}
  for pin in ip:pin['input_id']=bysource[pin['source_id']]
  ip.sort(key=lambda pin:pin['input_id']);rr['input_sha256']=digest(ip)
  pp=copy.deepcopy(policy);pp['deadline']=(datetime.datetime.fromisoformat(json.loads(source("select public.trip_source_find_sustained_universal_binding('"+ACTOR+"','"+TRIP+"','"+newbatch+"');"))['createdAt'].replace('Z','+00:00'))+datetime.timedelta(seconds=600)).isoformat(timespec='milliseconds').replace('+00:00','Z')
  req2=copy.deepcopy(req);req2.update(task_id=newtask,logical_request_id=str(uuid.uuid4()),logical_idempotency_key=str(uuid.uuid4()),policy_snapshot=pp,policy_sha256=digest(pp));req2['input'].update(reference=str(uuid.uuid4()),sha256=rr['input_sha256'])
  bb={**binding,'request':req2,'request_sha256':digest(req2)}
  ll=json.loads(meter("select public.universal_import_read_continuous_scope("+pliteral(rr)+','+pliteral(bb)+",repeat('f',64));"))
  uu=copy.deepcopy(usage);uu.update(call_id=rr['call_id'],observation_id=str(uuid.uuid4()))
  return {**fields,'row':rr,'start':uu,'model_task_binding':bb,'scope_revision':scope['revision'],'scope_sha256':scope['scope_sha256'],'execution_pins':ll['execution_pins'],'execution_pins_sha256':digest(ll['execution_pins'])}
 def reserve2(f,fail=None):return invoke('flight_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id'],ctx_updates=ctx,expect_error=fail)
 def age_old(seconds,call=oldcall):
  # Test clock only: preserve guards and immutable records unchanged outside disposable PG.
  sql("SET SESSION AUTHORIZATION postgres;ALTER TABLE public.model_task_admissions DISABLE TRIGGER USER;UPDATE public.model_task_admissions SET deadline=clock_timestamp()-interval '"+str(seconds)+" seconds' WHERE call_id='"+call+"';UPDATE public.model_task_admissions SET request_snapshot=jsonb_set(request_snapshot,'{policy_snapshot,deadline}',to_jsonb(deadline)) WHERE call_id='"+call+"';UPDATE public.model_task_admissions SET policy_sha256=public.cp14_hash(request_snapshot->'policy_snapshot'),request_snapshot=jsonb_set(request_snapshot,'{policy_sha256}',to_jsonb(public.cp14_hash(request_snapshot->'policy_snapshot'))) WHERE call_id='"+call+"';UPDATE public.model_task_admissions SET request_sha256=public.cp14_hash(request_snapshot) WHERE call_id='"+call+"';ALTER TABLE public.model_task_admissions ENABLE TRIGGER USER;")
 age_old(120)
 denied=make();reserve2(denied,'CP15_RESOURCE_LIMIT');check('RED original real reserve denies new owned Task after old immutable lease expired',state()==before)
 sql('SET SESSION AUTHORIZATION postgres;'+(packet/'P2_RESOURCE_LEASE_DEV_INSTALL.sql').read_text())
 check('exact protected installer passes hosted preimage CAS',sql('SELECT md5(pg_get_functiondef('+sig+'));')==hashes['postimageMD5'])
 append_scope()
 age_old(59);fresh=make();reserve2(fresh,'CP15_RESOURCE_LIMIT');check('deadline plus60 grace still blocks before expiry',state()==before)
 age_old(61)
 first,second=make(),make()
 def raw(f):
  command2,context2=P['request']('flight_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id'],ctx_updates=ctx)
  return "set session authorization otr_external_integration_call_gateway;select public.flight_activation_reserve_call("+pliteral(context2)+','+pliteral(command2)+');'
 def worker(body):return docker('exec','-i',NAME,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',text=body,check=False)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  holder=pool.submit(worker,"begin;set application_name='p2-lease-holder';"+raw(first)+"select pg_sleep(3);commit;")
  for _ in range(80):
   if sql("select count(*) from pg_stat_activity where application_name='p2-lease-holder' and wait_event='PgSleep';")=='1':break
   time.sleep(.05)
  else:raise AssertionError('holder did not reach real reserve commit barrier')
  waiter=pool.submit(worker,"set application_name='p2-lease-waiter';"+raw(second))
  for _ in range(60):
   if sql("select count(*) from pg_stat_activity where application_name='p2-lease-waiter' and wait_event_type='Lock';")=='1':break
   time.sleep(.05)
  else:raise AssertionError('second independent reserve did not wait on actual scope lock')
  a,b2=holder.result(),waiter.result()
 assert a.returncode==0,a.stderr
 assert b2.returncode and 'CP15_RESOURCE_LIMIT' in b2.stderr,b2.stderr
 check('GREEN independent transactions contend on actual reserve lock; only one new Task admitted')
 after=state();assert json.loads(after)[:3]==[x+1 for x in json.loads(before)[:3]],(before,after)
 check('old UNKNOWN and expired hold retained alongside one new call',int(json.loads(after)[3])==int(json.loads(before)[3])+int(sql("select worst_cost_nanos from flight_call_resource_holds where call_id='"+oldcall+"';")))
 assert reserve2(first)['call_id']==first['row']['call_id'] and state()==after
 check('exact admitted Task replay preserves one START hold and call')
 reserve2(second,'CP15_RESOURCE_LIMIT');check('fresh RESERVED NOT_STARTED still occupies sole slot',state()==after)
 invoke('external_integration_mark_dispatch',{'account_id':ACTOR,'integration_id':i['integration_id'],'call_id':first['row']['call_id'],'expected_revision':1,'publication_fence':1},'call_gateway','TRUSTED_WORKLOAD',ctx_updates=ctx)
 reserve2(second,'CP15_RESOURCE_LIMIT');check('fresh MAY_HAVE_STARTED RUNNING still occupies sole slot',state()==after)
 # SQL transaction rollback scope edit is a fixture-only way to exercise unchanged monetary guard.
 age_old(61,first['row']['call_id'])
 probe=raw(second)
 ready=worker('BEGIN;'+probe+'ROLLBACK;');assert ready.returncode==0,ready.stderr
 check('both expired leases leave zero concurrency blockers and valid new owning reserve can execute',state()==after)
 for column,value,reason in [('account_daily','2','CP15_RESOURCE_LIMIT'),('account_day_cost_nanos',sql("select sum(worst_cost_nanos) from flight_call_resource_holds where account_id='"+ACTOR+"' AND admission_day=(clock_timestamp() AT TIME ZONE 'UTC')::date;"),'CP15_BUDGET')]:
  body="BEGIN;SET SESSION AUTHORIZATION postgres;ALTER TABLE public.flight_activation_scopes DISABLE TRIGGER USER;UPDATE public.flight_activation_scopes SET "+column+'='+value+" WHERE scope_id='"+scope['scope_id']+"' AND revision=6;ALTER TABLE public.flight_activation_scopes ENABLE TRIGGER USER;"+probe+'ROLLBACK;'
  result=worker(body);assert result.returncode and reason in result.stderr,result.stderr
  check('expired old hold remains in '+column+' enforcement',state()==after)
 # Close through the real existing admin command; preserve all historical scopes/holds.
 append_scope(active=False)
 result=worker(probe);assert result.returncode and 'UNIVERSAL_PROVIDER_CLOSED' in result.stderr,result.stderr
 check('real append7 closes new revision6 admission',state()==after)
 sql('SET SESSION AUTHORIZATION postgres;'+(packet/'P2_RESOURCE_LEASE_DEV_ROLLBACK.sql').read_text())
 check('protected rollback restores exact original function',sql('SELECT md5(pg_get_functiondef('+sig+'));')==hashes['preimageMD5'])
 result={'status':'ISOLATED_REAL_SOURCE_RESERVE_PASS_NOT_DEV','providerCalls':0,'hostedWrites':0,'network':'none','checks':checks,'count':len(checks),'limits':'Synthetic fixture clock aging only; no remote provider termination claim or hosted qualification.'}
 (packet/'P2_RESOURCE_LEASE_FULL_PG_RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
'''
ADDITION=ADDITION.replace('packet=Path(MAIN_ROOT)', 'packet=pathlib.Path('+repr(str(MAIN))+')')
wrapper=wrapper.replace("exec(compile(s,str(base),'exec')", "s=extend(s)\nexec(compile(s,str(base),'exec')")
exec(compile(wrapper,str(MAIN/'scripts/import-workbench/universal-continuous-source-acceptance.py'),'exec'),{'FIXTURE_ROOT':ROOT,'extend':extend,'__file__':str(MAIN/'scripts/import-workbench/universal-continuous-source-acceptance.py')})
