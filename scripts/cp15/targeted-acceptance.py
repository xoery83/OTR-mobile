"""F2/F3 actual PostgreSQL barriers; synthetic network-none Server84 only."""
from pathlib import Path
import subprocess,selectors,os,time,json,copy,sys
root=Path(__file__).resolve().parents[2]
assert not sys.argv[1:] or sys.argv[1:]==['targeted']
CONTAINER='otr-cp15-targeted' if sys.argv[1:]==['targeted'] else 'otr-cp15-seeded'
source=(root/'scripts/cp15/security-acceptance.py').read_text().split('# Two concurrent transactions')[0].replace("otr-cp15-acceptance",CONTAINER)
exec(compile(source,str(root/'scripts/cp15/security-acceptance.py'),'exec'))
command=['docker','exec','-i',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres']
def launch(body,name):
 process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 process.stdin.write((f"set application_name='{name}';"+body+'\n').encode());process.stdin.flush()
 return process
processes=[]
def barrier(body,label):
 p=launch('begin;'+body+f"select '{label}';",label);processes.append(p)
 reader=selectors.DefaultSelector();reader.register(p.stdout,selectors.EVENT_READ);output=b'';deadline=time.monotonic()+8
 while time.monotonic()<deadline:
  if reader.select(.05):
   chunk=os.read(p.stdout.fileno(),8192)
   if not chunk:raise AssertionError(p.stderr.read().decode())
   output+=chunk
   if label.encode()+b'\n' in output:return p
 raise AssertionError('barrier not reached '+label)
def finish(p,commit=True):
 p.stdin.write(('commit;' if commit else 'rollback;').encode()+b'\n\\q\n');p.stdin.close()
 assert p.wait(timeout=8)==0,p.stderr.read().decode()
def wait_locked(name):
 deadline=time.monotonic()+2
 while time.monotonic()<deadline:
  if scalar(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';")=='1':return
  time.sleep(.01)
 raise AssertionError('expected blocked '+name)
def mark_sql(c):
 cmd,ctx=request('external_integration_mark_dispatch',{'account_id':actor,'integration_id':i['integration_id'],'call_id':c['call_id'],'expected_revision':1,'publication_fence':1},'call_gateway','TRUSTED_WORKLOAD')
 return f"set session authorization otr_external_integration_call_gateway;select public.external_integration_mark_dispatch({literal(ctx)},{literal(cmd)});"
def reap(p,success,error=None):
 p.stdin.close();out,err=p.stdout.read().decode(),p.stderr.read().decode();code=p.wait(timeout=8)
 equal(code==0,success,'barrier outcome');assert 'deadlock detected' not in err,err
 if error:assert error in err,err
 return out
def restore():sql(f"update public.trips set created_by='{actor}' where id='{trip}';update public.journey_members set status='linked' where trip_id='{trip}' and user_id='{actor}';",'supabase_admin')
revoke=f"update public.trips set created_by='{other}' where id='{trip}';update public.journey_members set status='unlinked' where trip_id='{trip}' and user_id='{actor}';"
try:
 # Each mutated actual execution fact is carried in the signed command.
 for key in scope['pins']:
  f=call();f['execution_pins'][key]='b'*64 if key.endswith('sha256') else 'wrong-version';f['execution_pins_sha256']=digest(f['execution_pins'])
  reserve(f,expect_error='CP15_EXECUTION_PIN');print('PASS wrong actual pin',key,flush=True)
 for key in ['adapter_version','provider_config_sha256','price_sha256']:
  new=copy.deepcopy(scope);new['revision']+=1;new['pins'][key]='wrong' if key=='adapter_version' else 'b'*64;select(new,expect_error='ANY');print('PASS selected invalid config/price pin',key,flush=True)
 # Scope rotation is temporary/rollback-only: new reserve and old mark both deny.
 c=reserve(call());historic=json.loads(scalar(f"select to_jsonb(h) from public.flight_call_resource_holds h where call_id='{c['call_id']}';"))
 for key in ['prompt_sha256','envelope_sha256','output_schema_sha256','minimizer_sha256','privacy_sha256','policy_sha256']:
  new=copy.deepcopy(scope);new['revision']+=1;new['pins'][key]='b'*64;seal(new)
  ac,ax=request('flight_activation_select',admin(integration_id=i['integration_id'],expected_version=scope['revision'],row=new))
  prefix=f"begin;set session authorization otr_external_integration_admin_gateway;select public.flight_activation_select({literal(ax)},{literal(ac)});"
  result=sql(prefix+mark_sql(c),'supabase_admin',True);equal(result.returncode!=0,True,'selected pin mark denial');assert 'CP15_SCOPE_CLOSED' in result.stderr,result.stderr
  f=call();f.update(scope_revision=new['revision'],scope_sha256=new['scope_sha256']);rc,rx=request('flight_activation_reserve_call',f,'call_gateway','TRUSTED_WORKLOAD',request_id=f['row']['request_id'])
  result=sql(prefix+f"set session authorization otr_external_integration_call_gateway;select public.flight_activation_reserve_call({literal(rx)},{literal(rc)});",'supabase_admin',True);equal(result.returncode!=0,True,'selected pin reserve denial');assert 'CP15_EXECUTION_PIN' in result.stderr or 'CP15_SCOPE_CLOSED' in result.stderr,result.stderr
  equal(json.loads(scalar(f"select to_jsonb(h) from public.flight_call_resource_holds h where call_id='{c['call_id']}';")),historic,'historic admitted pins retained')
  print('PASS selected pin rotation',key,flush=True)
 mark(c);complete(c)
 # Revoke wins serialization: mark waits and rejects when revoke commits.
 for label,rev,rollback in [('owner-revoke',revoke,False),('membership-revoke',f"update public.journey_members set status='unlinked' where trip_id='{trip}' and user_id='{actor}';",False),('revoke-rollback',revoke,True)]:
  if label=='membership-revoke':sql(f"update public.trips set created_by='{other}' where id='{trip}';",'supabase_admin')
  c=reserve(call());holder=barrier(rev,label);waiter=launch(mark_sql(c),'f2-mark');processes.append(waiter);wait_locked('f2-mark');finish(holder,not rollback)
  reap(waiter,rollback,None if rollback else 'CP14_TRIP_FORBIDDEN')
  if rollback:complete(c)
  else:
   equal(scalar(f"select dispatch_state from public.external_integration_calls where call_id='{c['call_id']}';"),'RESERVED','revoke winning denies durable mark');restore();mark(c);complete(c)
  restore();print('PASS',label,flush=True)
 # Mark wins serialization, membership/owner revoke waits; no assertion provider stopped.
 for rollback in [False,True]:
  c=reserve(call());holder=barrier(mark_sql(c),'f2-mark-first');waiter=launch(revoke,'f2-revoke');processes.append(waiter);wait_locked('f2-revoke');finish(holder,not rollback);reap(waiter,True)
  equal(scalar(f"select dispatch_state from public.external_integration_calls where call_id='{c['call_id']}';"),'RESERVED' if rollback else 'MAY_HAVE_STARTED','mark winner responsibility / rollback')
  equal(scalar(f"select public.cp14_trip_access('{actor}','{trip}');"),'f','current disclosure authority revoked')
  restore()
  if rollback:mark(c)
  complete(c);print('PASS mark first / rollback',rollback,flush=True)
 # Kill → revoke → mark contention: env lock never creates a Trip→env cycle.
 c=reserve(call());holder=barrier(revoke,'f2-revoke-kill');waiter=launch(mark_sql(c),'f2-mark-kill');processes.append(waiter);wait_locked('f2-mark-kill')
 ac,ax=request('external_integration_set_kill',admin(expected_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';")),kill_switch=True))
 killer=launch(f"set session authorization otr_external_integration_admin_gateway;select public.external_integration_set_kill({literal(ax)},{literal(ac)});",'f2-kill');processes.append(killer);wait_locked('f2-kill');finish(holder);reap(waiter,False,'CP14_TRIP_FORBIDDEN');reap(killer,True);restore()
 invoke('external_integration_set_kill',admin(expected_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';")),kill_switch=False));mark(c);complete(c);print('PASS concurrent kill/revoke/mark; no deadlock',flush=True)
 # Explicit admitted billing evidence supersedes estimated cost in the existing journal.
 def cost(kind,quality,value,key):
  u=row('external_integration_usage_events');u.update(call_id=c['call_id'],observation_kind=kind,observation_key=key,status='SUCCEEDED',measurement_mode='NONE',usage_quality='UNKNOWN',cost_quality=quality,cost_nanos=value,currency='USD',price_schedule_id=price['price_schedule_id'])
  fields={'integration_id':i['integration_id'],'call_id':c['call_id'],'row':u};rid=uid();observed=invoke('external_integration_usage_append',fields,'call_gateway','TRUSTED_WORKLOAD',request_id=rid);equal(invoke('external_integration_usage_append',fields,'call_gateway','TRUSTED_WORKLOAD',request_id=rid),observed,'exact cost replay');return observed
 estimated=cost('COST_RECONCILIATION','ESTIMATED','9','estimate');actual=cost('COST_RECONCILIATION','ACTUAL_REPORTED','7','confirmed-billing')
 report=invoke('external_integration_admin_report',{'actor_id':actor,'integration_id':i['integration_id']},'reporting_gateway');projection=next(x['projection'] for x in report['usage'] if x['call_id']==c['call_id']);equal(projection['cost_nanos'],'7','late actual billing supersedes estimate')
 scope.update(revision=scope['revision']+1,active=False);select(scope)
 invoke('flight_activation_runtime',admin(expected_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';")),runtime_enabled=False))
 invoke('external_integration_set_kill',admin(expected_version=int(scalar("select config_version from public.external_integration_environment_state where environment='DEV';")),kill_switch=True))
 print(json.dumps({'status':'PASS','checks':checks,'provider_calls':0,'gates':'CLOSED','tests':'F2 barriers / F3 pins / F4 journal'}))
finally:
 for p in processes:
  if p.poll() is None:p.kill();p.wait()
