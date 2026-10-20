"""Offline Supabase platform fixture replay. Destructive ONLY to otr-cp14-acceptance.
Requires a fresh network-none container from the local pinned Supabase17 image,
/private/tmp/cp13a-platform-schema.sql (schema only, no data/credentials) and the
existing disposable otr-cp13a-acceptance-review for hash-pinned platform functions.
Never reads or connects to any hosted database. Run acceptance after this replay.
"""
from pathlib import Path
import re,subprocess,json
root=Path(__file__).resolve().parents[2]
assert subprocess.check_output(['docker','inspect','otr-cp14-acceptance','--format','{{.HostConfig.NetworkMode}}'],text=True).strip()=='none'
def sql(body,user='supabase_admin'):
 r=subprocess.run(['docker','exec','-i','otr-cp14-acceptance','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d','postgres'],input=body,text=True,capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr[-3000:])
 return r.stdout.strip()
original=Path('/private/tmp/cp13a-platform-schema.sql').read_text();body='set check_function_bodies=false;\n'+original[original.index('CREATE SCHEMA auth;'):]
body=re.sub(r'^\\(?:un)?restrict.*$','',body,flags=re.M).replace('CREATE SCHEMA extensions;','CREATE SCHEMA IF NOT EXISTS extensions;').replace('CREATE FUNCTION extensions.','CREATE OR REPLACE FUNCTION extensions.')
body=re.sub(r'^CREATE POLICY .*?;\n',lambda m:'' if 'public.' in m[0] else m[0],body,flags=re.M|re.S)
roles=sorted(set(re.findall(r'OWNER TO (supabase_[a-z_]+);',body)))
for name in roles:sql(f"do $$begin if not exists(select 1 from pg_roles where rolname='{name}') then create role {name} nologin noinherit;end if;end$$;")
sql("do $$declare r record;begin for r in select evtname from pg_event_trigger loop execute format('drop event trigger %I',r.evtname);end loop;end$$;drop schema if exists public,auth,storage,realtime,graphql_public,supabase_functions cascade;create schema public;alter schema public owner to pg_database_owner;grant usage on schema public to public;grant all on schema public to postgres;")
sql("do $$declare r record;begin for r in select rolname from pg_roles where rolname like 'otr_trip_%' or rolname like 'otr_external_integration_%' loop execute format('drop owned by %I cascade',r.rolname);execute format('drop role %I',r.rolname);end loop;end$$;")
sql(body)
sql("ALTER ROLE supabase_functions_admin LOGIN NOINHERIT NOCREATEDB CREATEROLE; ALTER ROLE supabase_functions_admin SET search_path=supabase_functions; ALTER ROLE supabase_realtime_admin SET search_path=public, extensions, realtime; GRANT anon,authenticated,service_role TO supabase_realtime_admin WITH INHERIT FALSE, SET TRUE;")
# Match each required historical platform function against its immutable pin before restoration.
header=(root/'supabase/migrations/20261004000400_trip_event_command_foundation.sql').read_text().split('do $$',1)[0]
for sig,h in re.findall(r"\('([^']+)','([0-9a-f]{64})'\)",header):
 r=subprocess.run(['docker','exec','-i','otr-cp13a-acceptance-review','psql','-X','-qAt','-U','postgres','-d','postgres'],input=f"select json_build_object('definition',pg_get_functiondef(to_regprocedure('{sig}')),'hash',encode(extensions.digest(pg_get_functiondef(to_regprocedure('{sig}')),'sha256'),'hex'));",text=True,capture_output=True)
 d=json.loads(r.stdout)
 if d['hash']==h and not sig.startswith('public.'):sql(d['definition'])
sql("alter default privileges for role postgres in schema public grant execute on functions to postgres,anon,authenticated,service_role;alter default privileges for role supabase_admin in schema public grant execute on functions to postgres,anon,authenticated,service_role;")
before=None
for n,p in enumerate(sorted((root/'supabase/migrations').glob('*.sql')),1):
 try:sql(p.read_text(),'postgres')
 except RuntimeError as e:print('FAIL',n,p.name,e,flush=True);raise
 if n==82:
  sql("insert into auth.users(id) values('cf140000-0000-4000-8000-000000000001');",'supabase_admin')
  before=sql("select jsonb_object_agg(table_name,(select jsonb_agg(jsonb_build_array(column_name,udt_name,is_nullable,column_default) order by ordinal_position) from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name)) from information_schema.tables t where table_schema='public' and table_type='BASE TABLE';")
  old_functions=sql("select jsonb_object_agg(p.oid::regprocedure::text,encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';")
 if n==83:
  old=json.loads(before);new=json.loads(sql("select jsonb_object_agg(table_name,(select jsonb_agg(jsonb_build_array(column_name,udt_name,is_nullable,column_default) order by ordinal_position) from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name)) from information_schema.tables t where table_schema='public' and table_type='BASE TABLE';"));assert all(new[k]==v for k,v in old.items())
  prior=json.loads(old_functions);now=json.loads(sql("select jsonb_object_agg(p.oid::regprocedure::text,encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';"));assert all(now[k]==v for k,v in prior.items())
  assert sql("select count(*) from auth.users where id='cf140000-0000-4000-8000-000000000001';")=='1'
  print('PASS seeded exact82→83: old table definitions, all public function bodies and synthetic auth row unchanged',flush=True)
 if n in (1,62,74,82,83):print('PASS',n,p.name,flush=True)
