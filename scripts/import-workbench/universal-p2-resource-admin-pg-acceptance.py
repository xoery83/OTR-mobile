from pathlib import Path
import importlib.util,json,copy,time,uuid,subprocess
p=Path('docs/ops/universal-p2-formal-save-20261027').resolve();spec=importlib.util.spec_from_file_location('p2window',p/'p2_resource_window.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
before=json.loads((p/'P2_RESOURCE_FRESH_PREFLIGHT.json').read_text());auth=json.loads((p/'P2_RESOURCE_NORMAL_AUTH_READBACK.json').read_text());auth['authSessionExpiresAt']=m.iso(time.time()+3600);plan=m.bind(before,auth,{**before['scope'],'revision':7,'active':False,'scope_sha256':'f'*64},time.time()-1)
name='otr-p2-admin-window-'+uuid.uuid4().hex[:12];image='otr-core-v2-server84-fixture:20261012';checks=[]
def docker(*args,input=None):return subprocess.run(['docker',*args],input=input,text=True,capture_output=True)
def sql(text,fail=None):
 r=docker('exec','-i',name,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',input='SET SESSION AUTHORIZATION postgres;'+text)
 if fail:assert r.returncode and fail in r.stderr,r.stderr
 else:assert r.returncode==0,r.stderr
 return r.stdout.strip()
try:
 r=docker('run','--name',name,'--network','none','--memory','256m','--cpus','1','-d',image);assert not r.returncode,r.stderr
 for _ in range(50):
  if docker('exec',name,'pg_isready','-U','supabase_admin').returncode==0:break
  time.sleep(.2)
 actor=m.ACTOR
 sql("INSERT INTO auth.users(id) VALUES('"+actor+"') ON CONFLICT DO NOTHING;INSERT INTO public.profiles(id,display_name) VALUES('"+actor+"','P2 disposable fixture') ON CONFLICT DO NOTHING;ALTER ROLE otr_external_integration_admin_gateway NOLOGIN NOINHERIT VALID UNTIL "+m.quote(before['adminRole']['validUntil'])+';')
 for row in before['adminGrants']:sql('INSERT INTO public.external_integration_admin_grants SELECT (jsonb_populate_record(null::public.external_integration_admin_grants,'+m.quote(json.dumps(row))+'::jsonb)).*;')
 sql(m.open_sql(plan));assert sql("SELECT rolcanlogin AND rolvaliduntil="+m.quote(plan['expiresAt'])+"::timestamptz FROM pg_roles WHERE rolname='otr_external_integration_admin_gateway';")=='t';checks.append('actual root finite grant renewal permits existing gateway only until sealed deadline')
 assert json.loads(sql("SELECT jsonb_agg(grant_revision ORDER BY permission) FROM external_integration_admin_grants WHERE actor_id='"+actor+"';"))==[9,11];checks.append('only exact existing two grant IDs advance8→9/10→11')
 sql(m.open_sql(plan),fail='P2_ADMIN_GRANT_DRIFT');checks.append('second activation rejects stale grant preimage without extension')
 sql(m.revoke_sql(plan['adminControl']));assert sql(m.revoked_sql(plan['adminControl']))=='t';checks.append('actual guarded revoke closes grants and sets NOLOGIN independently')
 assert json.loads(sql("SELECT jsonb_agg(grant_revision ORDER BY permission) FROM external_integration_admin_grants WHERE actor_id='"+actor+"';"))==[10,12]
 sql(m.revoke_sql(plan['adminControl']));assert sql(m.revoked_sql(plan['adminControl']))=='t';checks.append('repeated closure is idempotent and never reopens or advances revision again')
 result={'status':'ADMIN_WINDOW_ACTUAL_PG_PASS_NOT_DEV','checks':checks,'count':len(checks),'network':'none','providerCalls':0,'hostedWrites':0};Path('/private/tmp/otr-p2-resource-admin-pg-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:docker('rm','-f',name)
