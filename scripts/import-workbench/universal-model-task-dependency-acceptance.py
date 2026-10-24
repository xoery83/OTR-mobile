"""Only a task-owned disposable network-none PG; no DEV connection or credentials."""
from pathlib import Path
import subprocess,uuid,time,json
ROOT=Path(__file__).resolve().parents[2]
name='otr-universal-model-dependency-'+uuid.uuid4().hex[:10]
checks=[]
def docker(*args):return subprocess.run(['docker',*args],capture_output=True,text=True)
def sql(q,user='postgres',error=None):
 p=subprocess.run(['docker','exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d','postgres'],input=q,capture_output=True,text=True)
 if error:assert p.returncode and error in p.stderr,p.stderr
 else:assert not p.returncode,p.stderr
 return p.stdout.strip()
def edges():return sql("select coalesce(jsonb_agg(jsonb_build_array(roleid,member,grantor,admin_option,inherit_option,set_option) order by grantor),'[]') from pg_auth_members where roleid='otr_external_integration_meter_writer'::regrole and member='postgres'::regrole;")
created=False
try:
 p=docker('run','--name',name,'--network','none','-d','otr-core-v2-server84-fixture:20261012');assert not p.returncode,p.stderr;created=True
 for _ in range(50):
  if docker('exec',name,'pg_isready','-U','supabase_admin').returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('FIXTURE_NOT_READY')
 # Mirror the observed two grantors/options without touching a live role.
 sql('grant otr_external_integration_meter_writer to postgres with admin true,inherit false,set false;','supabase_admin')
 sql('grant otr_external_integration_meter_writer to postgres with admin false,inherit false,set false;')
 before=edges();assert len(json.loads(before))==2
 candidate=(ROOT/'backend/sql/universal_model_task_dependency_candidate.sql').read_text()
 # No partial install when an existing root drifts.
 drift="do $$declare d text;b text;begin select pg_get_functiondef(oid),prosrc into d,b from pg_proc where oid='public.external_integration_mark_dispatch(jsonb,jsonb)'::regprocedure;execute replace(d,b,b||E'\\n-- drift');end$$;"
 sql(drift,'supabase_admin');sql(candidate,error='MODEL_DEPENDENCY_ROOT_PREIMAGE')
 assert sql("select to_regclass('public.model_task_admissions') is null;")=='t'
 checks.append('unknown root rejected atomically without table or membership change')
 assert edges()==before
 # Restore exact existing fixture root, not an invented implementation.
 import re
 foundation=(ROOT/'supabase/migrations/20261007000100_flight_dev_dispatch_foundation.sql').read_text()
 definition=re.search(r'create or replace function public.external_integration_mark_dispatch\(.*?end\$\$;',foundation,re.S).group(0)
 sql(definition,'supabase_admin')
 sql(candidate)
 assert edges()==before;checks.append('both observed grantor edges/options preserved after install')
 assert sql("select not has_schema_privilege('otr_external_integration_meter_writer','public','CREATE');")=='t';checks.append('temporary public CREATE revoked')
 assert sql("select relrowsecurity and relforcerowsecurity from pg_class where oid='public.model_task_admissions'::regclass;")=='t'
 assert sql('select count(*) from public.model_task_admissions;')=='0';checks.append('owning empty admission table FORCE RLS; no business write')
 for role in ['anon','authenticated','service_role','authenticator']:
  assert sql("select not has_table_privilege('"+role+"','public.model_task_admissions','SELECT,INSERT,UPDATE,DELETE');")=='t'
 checks.append('public clients receive no admission data/mutation rights')
 assert sql("select kill_switch and not runtime_enabled from public.external_integration_environment_state where environment='DEV';")=='t';checks.append('environment remains dormant')
 sql(candidate,error='MODEL_DEPENDENCY_ALREADY_PRESENT');assert edges()==before;checks.append('reapply refuses installed state without side effects')
 print(json.dumps({'status':'LOCAL_ISOLATED_MODEL_TASK_DEPENDENCY_PASS','checks':checks,'hostedWrites':0,'providerCalls':0},indent=2))
finally:
 if created:docker('rm','-f',name)
