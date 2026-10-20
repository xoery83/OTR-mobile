"""Local-only correction rehearsal. Requires two NEW network-none containers.
Never contacts Hosted or modifies retained R3 artifacts. No protected settings seed.
"""
from pathlib import Path
import hashlib, json, re, subprocess

ROOT = Path(__file__).resolve().parents[2]
R3 = Path('/private/tmp/otr-r3-lightweight-dev-rebuild/supabase/dev-baselines/r3-v1')
FORWARD = ROOT / 'supabase/dev-forward/r3-v1/202610080001_fresh_trip_ledger_initialization.sql'
OUT = ROOT / 'supabase/dev-forward/r3-v1/local-validation.json'
CONTAINERS = ['otr-r3-ledger-init-a', 'otr-r3-ledger-init-b']

def run(args, **kwargs):
    result=subprocess.run(args, text=True, capture_output=True, **kwargs)
    if result.returncode:
        print(result.stderr[-2000:],flush=True)
        raise subprocess.CalledProcessError(result.returncode,args,result.stdout,result.stderr)
    return result.stdout.strip()

def sql(container, body, user='postgres'):
    return run(['docker', 'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', 'postgres'], input=body)

def catalog(c):
    return json.loads(sql(c, 'begin read only;\n'+(R3/'catalog.sql').read_text()+'\nrollback;'))

def managed(c):
    # Full managed schema dump, including privileges/policies, plus synthetic data.
    return run(['docker','exec',c,'pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=auth','--schema=storage','--schema=realtime','--schema=extensions']).split('\n')

def normalize_dump(lines):
    return [x for x in lines if not x.startswith(('\\restrict','\\unrestrict'))]

results=[]
for c in CONTAINERS:
    assert run(['docker','inspect',c,'--format','{{.HostConfig.NetworkMode}}']) == 'none'
    assert sql(c,"select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r';")=='0', 'Use a new empty task DB; never reset an existing one'
    original=Path('/private/tmp/cp13a-platform-schema.sql').read_text()
    body='set check_function_bodies=false;\n'+original[original.index('CREATE SCHEMA auth;'):]
    body=re.sub(r'^\\(?:un)?restrict.*$','',body,flags=re.M).replace('CREATE SCHEMA extensions;','CREATE SCHEMA IF NOT EXISTS extensions;').replace('CREATE FUNCTION extensions.','CREATE OR REPLACE FUNCTION extensions.')
    body=re.sub(r'^CREATE POLICY .*?;\n',lambda m:'' if 'public.' in m[0] else m[0],body,flags=re.M|re.S)
    for role in sorted(set(re.findall(r'OWNER TO (supabase_[a-z_]+);',body))):
        sql(c,f"do $$begin if not exists(select 1 from pg_roles where rolname='{role}') then create role {role} nologin noinherit;end if;end$$;",'supabase_admin')
    # Task-owned disposable schemas only; managed fixture restoration is test setup.
    sql(c,"drop schema if exists public,auth,storage,realtime,graphql_public,supabase_functions cascade;create schema public;alter schema public owner to pg_database_owner;grant usage on schema public to public;grant all on schema public to postgres;",'supabase_admin')
    sql(c,body,'supabase_admin')
    sql(c,"ALTER ROLE supabase_functions_admin LOGIN NOINHERIT NOCREATEDB CREATEROLE; ALTER ROLE supabase_functions_admin SET search_path=supabase_functions; ALTER ROLE supabase_realtime_admin SET search_path=public, extensions, realtime; GRANT anon,authenticated,service_role TO supabase_realtime_admin WITH INHERIT FALSE, SET TRUE;",'supabase_admin')
    sql(c,"create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);")
    for f in sorted((ROOT/'supabase/migrations').glob('*.sql'))[:68]:
        version,name=f.stem.split('_',1)
        text=f.read_bytes().decode('utf-8').replace("'","''")
        sql(c,f"insert into supabase_migrations.schema_migrations values('{version}',array['{text}'],'{name}');")
    sql(c,"begin;set local otr.r3.artifact_sha256='f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52';\n"+(R3/'baseline.sql').read_bytes().decode('utf-8')+"\ncommit;")
    before=catalog(c)
    assert before==json.loads((R3/'expected-catalog.json').read_text()), 'R3 starting catalog mismatch'
    sql(c,"insert into auth.users(id,email) values('83100000-0000-4000-8000-000000000001','ledger-init-a@otr.invalid'),('83100000-0000-4000-8000-000000000002','ledger-init-b@otr.invalid');insert into public.profiles(id,display_name) values('83100000-0000-4000-8000-000000000001','Owner A'),('83100000-0000-4000-8000-000000000002','Owner B');")
    history=sql(c,"select jsonb_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t;")
    lineage=sql(c,"select to_jsonb(t) from otr_dev_migrations.lineage t;")
    managed_before=normalize_dump(managed(c))
    managed_rows=sql(c,"select jsonb_build_array((select jsonb_agg(to_jsonb(t)) from auth.users t),(select jsonb_agg(to_jsonb(t)) from storage.objects t),(select jsonb_agg(to_jsonb(t)) from storage.buckets t));")
    bad=FORWARD.read_text().replace('6aff434d161f063678984d1f7df712c9706e52bf81d79be1ac71b0baae8ba746','0'*64)
    try: sql(c,bad)
    except subprocess.CalledProcessError as e: assert 'R3_LEDGER_INIT_FUNCTION_DRIFT' in e.stderr
    else: raise AssertionError('drift guard accepted a changed function')
    assert catalog(c)==before
    sql(c,FORWARD.read_text())
    after=catalog(c)
    changes=[]
    for key in before:
        if key!='functions': assert before[key]==after[key],key
    for old,new in zip(before['functions'],after['functions']):
        if old!=new:
            assert old['signature'].removeprefix('public.')=='add_trip_creator_as_journey_member()'
            assert {k:v for k,v in old.items() if k!='body_sha256'}=={k:v for k,v in new.items() if k!='body_sha256'}
            changes.append(new)
    assert len(before['functions'])==len(after['functions']) and len(changes)==1
    assert managed_before==normalize_dump(managed(c)), 'managed schema or ACL changed'
    assert sql(c,"select jsonb_build_array((select jsonb_agg(to_jsonb(t)) from auth.users t),(select jsonb_agg(to_jsonb(t)) from storage.objects t),(select jsonb_agg(to_jsonb(t)) from storage.buckets t));")==managed_rows
    assert sql(c,"select jsonb_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t;")==history
    assert sql(c,"select to_jsonb(t) from otr_dev_migrations.lineage t;")==lineage
    assert sql(c,"select prosecdef and proconfig=array['search_path=public'] and proowner='postgres'::regrole from pg_proc where oid='public.add_trip_creator_as_journey_member()'::regprocedure;")=='t'
    output=sql(c,(ROOT/'supabase/dev-forward/r3-v1/ledger-initialization.test.sql').read_text())
    assert 'not ok' not in output,output
    closed=sql(c,(R3/'closed-acceptance.sql').read_text())
    assert 'not ok' not in closed,closed
    # Security checks are unchanged; replace only the expected OTR catalog hash in-memory.
    new_hash=sql(c,"begin read only;set local search_path=pg_catalog;select encode(extensions.digest(("+(R3/'catalog.sql').read_text().split('select jsonb_build_object(',1)[1].rsplit(' as catalog;',1)[0].join(['jsonb_build_object(', ''])+")::jsonb::text,'sha256'),'hex');rollback;")
    verifier=(R3/'verify.sql').read_text().replace('59757774873268ad85c4ea5a5c23a4af37b19c38c96fb964d6d75c850d3d9b47',new_hash)
    sql(c,'begin read only;set local search_path=pg_catalog;\n'+verifier+'\nrollback;')
    result={'container':c,'pass':True,'sql_assertions':sum(x.startswith('ok ') for x in output.splitlines()),'closed_assertions':sum(x.startswith('ok ') for x in closed.splitlines()),'changed_functions':changes,'catalog_sha256':new_hash,'history_rows':68,'managed_schema_data_preserved':True,'baseline_lineage_preserved':True}
    results.append(result)
    print(json.dumps(result),flush=True)
OUT.write_text(json.dumps({'forward_sha256':hashlib.sha256(FORWARD.read_bytes()).hexdigest(),'installs':results},indent=2)+'\n')
