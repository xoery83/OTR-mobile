"""Owned network-none PostgreSQL role/receipt CAS fixture. Never DEV or Native evidence."""
import datetime as dt
import json
import subprocess
import time
import uuid
from pathlib import Path
import universal_cleanup_only as c
from universal_continuous_transition import canonical
from universal_scope_close import quote
from universal_config_control import revoke_sql
ROOT=Path(__file__).resolve().parents[2];name='otr-universal-cleanup-'+uuid.uuid4().hex[:12]
image='otr-core-v2-server84-fixture:20261012'
created=False;checks=[]
def docker(*args,text=None,ok=True):
 r=subprocess.run(['/opt/homebrew/bin/docker',*args],input=text,text=True,capture_output=True,timeout=40)
 if ok and r.returncode:raise ValueError('OWNED_FIXTURE_DOCKER_FAILED')
 return r
def sql(text,fail=False):
 r=docker('exec','-i',name,'psql','-XqAt','-U','supabase_admin','-d','cleanup_fixture','-v','ON_ERROR_STOP=1',text='SET ROLE postgres;'+text,ok=False)
 if fail:
  if r.returncode==0:raise ValueError('EXPECTED_FIXTURE_REJECTION')
  return
 if r.returncode:raise ValueError('OWNED_FIXTURE_SQL_FAILED:'+next((line for line in r.stderr.splitlines() if line.startswith('ERROR:')), 'UNKNOWN')[:160])
 return r.stdout.strip()
try:
 docker('image','inspect',image)
 docker('run','--name',name,'--network','none','--memory','512m','--cpus','1','-d',image);created=True
 for _ in range(60):
  if docker('exec',name,'pg_isready','-U','supabase_admin',ok=False).returncode==0:break
  time.sleep(.2)
 else:raise ValueError('OWNED_FIXTURE_START_FAILED')
 docker('exec',name,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE cleanup_fixture OWNER postgres;')
 b=json.loads((ROOT/'scripts/import/__fixtures__/universal_cleanup_run7.json').read_text())
 grants=json.loads((ROOT/'docs/ops/universal-stage2-20261025/actual-execution/continuous-recovery/RUN7_SAFETY_READONLY.json').read_text())['grants']
 g=next(g for g in grants if g['permission']=='SECURITY_ADMIN');now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)-dt.timedelta(seconds=2)
 z=lambda d:d.isoformat().replace('+00:00','Z')
 p=c.build(b,g,z(now-dt.timedelta(seconds=1)),z(now),z(now+dt.timedelta(seconds=900)),z(now+dt.timedelta(seconds=480)))
 schema="CREATE TABLE public.external_integration_admin_grants(admin_grant_id uuid PRIMARY KEY,actor_id uuid,environment text,permission text,grant_revision integer,expires_at timestamptz,revoked_at timestamptz,created_at timestamptz,created_by uuid);CREATE TABLE public.trip_sustained_dev_policy(actor_account_id uuid PRIMARY KEY,enabled boolean,universal_import_enabled boolean,revoked_at timestamptz);"
 schema+='RESET ROLE;'
 for role in ['otr_trip_source_command_gateway','otr_external_integration_call_gateway',c.ADMIN]:
  schema+="DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname="+quote(role)+") THEN CREATE ROLE "+role+";END IF;END$$;ALTER ROLE "+role+" NOLOGIN CONNECTION LIMIT 1 NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;"
 schema+="SET ROLE postgres;INSERT INTO public.trip_sustained_dev_policy VALUES('"+c.ACTOR+"',false,false,clock_timestamp());"
 sql(schema)
 seed="DELETE FROM public.external_integration_admin_grants;INSERT INTO public.external_integration_admin_grants SELECT * FROM jsonb_populate_recordset(null::public.external_integration_admin_grants,"+quote(canonical(grants).decode())+"::jsonb);ALTER ROLE "+c.ADMIN+" NOLOGIN;"
 sql(seed);sql(c.setup_sql(p))
 assert sql("SELECT grant_revision FROM public.external_integration_admin_grants WHERE permission='SECURITY_ADMIN'")=='7'
 assert sql("SELECT grant_revision FROM public.external_integration_admin_grants WHERE permission='CONFIG_ADMIN'")=='6'
 assert sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='"+c.ADMIN+"'")=='t'
 checks.append('only existing SECURITY6to7 and AdminLOGIN')
 sql(c.setup_sql(p),True);checks.append('duplicate renewal rejected')
 sql(revoke_sql(p['adminControl']))
 assert sql("SELECT grant_revision||':'||(revoked_at IS NOT NULL)::text FROM public.external_integration_admin_grants WHERE permission='SECURITY_ADMIN'")=='8:true'
 assert sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='"+c.ADMIN+"'")=='f'
 checks.append('owning revoke returns SECURITY8 and NOLOGIN')
 for label,before,after in [
  ('CONFIG remainsrevoked',"UPDATE public.external_integration_admin_grants SET revoked_at=NULL WHERE permission='CONFIG_ADMIN';",''),
  ('SourceLOGIN refused',"ALTER ROLE otr_trip_source_command_gateway LOGIN;","ALTER ROLE otr_trip_source_command_gateway NOLOGIN;"),
  ('policy activation refused',"UPDATE public.trip_sustained_dev_policy SET universal_import_enabled=true;","UPDATE public.trip_sustained_dev_policy SET universal_import_enabled=false;"),
  ('microsecond preimage drift refused',"UPDATE public.external_integration_admin_grants SET revoked_at=revoked_at+interval '1 microsecond' WHERE permission='SECURITY_ADMIN';",'')]:
  sql(seed+before);sql(c.setup_sql(p),True);sql(after or 'SELECT 1;')
  assert sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='"+c.ADMIN+"'")=='f'
  checks.append(label)
 sql(seed)
 late=c.build(b,g,z(now-dt.timedelta(seconds=902)),z(now-dt.timedelta(seconds=901)),z(now-dt.timedelta(seconds=1)),z(now-dt.timedelta(seconds=421)))
 sql(c.setup_sql(late),True);checks.append('expiredwindow refused')
 assert sql("SELECT count(*) FROM public.external_integration_admin_grants")=='2'
 checks.append('no new grants or users created')
 print(json.dumps({'status':'OWNED_ISOLATED_PG_PASS_NOT_DEV_OR_NATIVE','checks':checks,'count':len(checks),'network':'none','memoryLimitMiB':512}))
finally:
 if created:docker('rm','-f',name,ok=False)
