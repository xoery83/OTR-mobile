"""Two NEW network-none PostgreSQL/TLS fixtures only. Never targets Hosted.

Uses retained accepted R3/platform fixture inputs, not Hosted backups. Synthetic
LOGIN/guard-bypassing fixture inserts are confined to task-owned disposable DBs.
"""
from pathlib import Path
import ast
import textwrap
import hashlib
import json
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
R3 = Path('/private/tmp/otr-r3-lightweight-dev-rebuild/supabase/dev-baselines/r3-v1')
FORWARD = ROOT / 'supabase/dev-forward/r3-v1/202610090001_publication_catalog_reader.sql'
REVERSE = FORWARD.with_name('202610090001_publication_catalog_reader.rollback.sql')
INVENTORY = FORWARD.with_name('publication-catalog-principal-inventory.sql')
OUT = Path('/private/tmp/otr-r3a-f1-20261009/security')
READER = 'otr_trip_publication_catalog_reader'
H0 = 'c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906'
NAMES = ['otr-r3a-f1-proof-a-20261009', 'otr-r3a-f1-proof-b-20261009']
ACTOR = '00000000-0000-4000-8000-000000000001'
TRIP = '10000000-0000-4000-8000-000000000001'
PASSWORD = 'otr_r3a_disposable_only'
created = []
checks = []


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:])
    return result.stdout.strip()


def sql(c, text, user='postgres', login=False, password=PASSWORD, fail=None):
    args = ['docker', 'exec', '-i']
    if login:
        args += ['-e', 'PGPASSWORD=' + password]
    args += [c, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', user,
             '-d', 'dbname=postgres sslmode=verify-full sslrootcert=/tmp/r3a-server.crt' if login else 'postgres']
    if login:
        args += ['-h', 'localhost']
    result = subprocess.run(args, input=text, capture_output=True, text=True)
    if fail:
        assert result.returncode and fail in result.stderr, result.stderr
        return
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:])
    return result.stdout.strip()


def record(name):
    checks.append(name)


def catalog(c):
    return sql(c, 'begin read only;\n' + (R3 / 'catalog.sql').read_text() + '\nrollback;')


def commitment(c):
    expression = (R3 / 'catalog.sql').read_text().split('select ', 1)[1].rsplit(' as catalog;', 1)[0]
    return sql(c, "begin read only;set local search_path=pg_catalog;select encode(extensions.digest((" +
               expression + ")::text,'sha256'),'hex');rollback;")


def manifest(c):
    return json.loads(sql(c, 'begin read only;\n' + INVENTORY.read_text() + '\nrollback;'))


def read(c, actor=ACTOR, trip=TRIP):
    return json.loads(sql(c, f"select public.trip_source_read_import_catalogs('{actor}','{trip}');", READER, True))


def install(c):
    # Reuse the accepted Ledger rehearsal's managed-platform fixture restoration.
    original = Path('/private/tmp/cp13a-platform-schema.sql').read_text()
    body = 'set check_function_bodies=false;\n' + original[original.index('CREATE SCHEMA auth;'):]
    body = re.sub(r'^\\(?:un)?restrict.*$', '', body, flags=re.M).replace('CREATE SCHEMA extensions;', 'CREATE SCHEMA IF NOT EXISTS extensions;').replace('CREATE FUNCTION extensions.', 'CREATE OR REPLACE FUNCTION extensions.')
    body = re.sub(r'^CREATE POLICY .*?;\n', lambda m: '' if 'public.' in m[0] else m[0], body, flags=re.M | re.S)
    for role in sorted(set(re.findall(r'OWNER TO (supabase_[a-z_]+);', body))):
        sql(c, f"do $$begin if not exists(select 1 from pg_roles where rolname='{role}') then create role {role} nologin noinherit;end if;end$$;", 'supabase_admin')
    sql(c, 'drop schema if exists public,auth,storage,realtime,graphql_public,supabase_functions cascade;create schema public;alter schema public owner to pg_database_owner;grant usage on schema public to public;grant all on schema public to postgres;', 'supabase_admin')
    sql(c, body, 'supabase_admin')
    sql(c, 'ALTER ROLE supabase_functions_admin LOGIN NOINHERIT NOCREATEDB CREATEROLE; ALTER ROLE supabase_functions_admin SET search_path=supabase_functions; ALTER ROLE supabase_realtime_admin SET search_path=public, extensions, realtime; GRANT anon,authenticated,service_role TO supabase_realtime_admin WITH INHERIT FALSE, SET TRUE;', 'supabase_admin')
    sql(c, 'create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);')
    for f in sorted((ROOT / 'supabase/migrations').glob('*.sql'))[:68]:
        version, name = f.stem.split('_', 1)
        text = f.read_text().replace("'", "''")
        sql(c, f"insert into supabase_migrations.schema_migrations values('{version}',array['{text}'],'{name}');")
    baseline = (R3 / 'baseline.sql').read_bytes().decode('utf-8')
    # Preserve accepted creator ADMIN edges before test-only superuser restoration
    # of managed schemas. Candidate forward itself runs as NOSUPERUSER postgres.
    sql(c, baseline.split('grant "otr_external_integration_admin_gateway"', 1)[0])
    sql(c, 'alter role postgres superuser;', 'supabase_admin')
    sql(c, "begin;set local otr.r3.artifact_sha256='f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52';\n" + baseline + '\ncommit;')
    # Reproduce the accepted external administrator membership profile explicitly.
    roles = [r['name'] for r in json.loads((R3/'expected-catalog.json').read_text())['roles']]
    sql(c, 'grant ' + ','.join(roles) + ' to postgres with admin true, inherit false, set false;', 'supabase_admin')
    sql(c, 'alter role postgres nosuperuser;', 'supabase_admin')
    sql(c, (ROOT / 'supabase/dev-forward/r3-v1/202610080001_fresh_trip_ledger_initialization.sql').read_text())
    actual = json.loads(catalog(c))
    (OUT / (c + '-h0-catalog.json')).write_text(json.dumps(actual, indent=2) + '\n')
    observed = commitment(c)
    print('H0 observed ' + observed, flush=True)
    assert observed == H0


def seed_rows(c, table, rows):
    # TEST ONLY admin fixture setup; never an application authority or Hosted seed.
    text = json.dumps(rows).replace("'", "''")
    sql(c, "begin;set local session_replication_role=replica;insert into public." + table +
        " select * from jsonb_populate_recordset(null::public." + table + ", '" + text + "'::jsonb);commit;", 'supabase_admin')


SECURITY = FORWARD.with_name('publication-catalog-security-commitment.sql')
REVIEW_RUNNER = Path('/private/tmp/otr-r3a-independent-20261009/sql-review-data-final.py')
assert hashlib.sha256(REVIEW_RUNNER.read_bytes()).hexdigest() == '511898861afa134d6bc380337435c73fa034c686878a5984589617a767b03df2', 'accepted independent probes changed'
review_source = REVIEW_RUNNER.read_text()
# Reuse unchanged independent SQL probes/failure injections; retain their evidence.
for node in ast.parse(review_source).body:
    if isinstance(node, ast.FunctionDef) and node.name in ['raw_state', 'transitions', 'default_acl_challenge', 'business_rows']:
        exec(compile(ast.get_source_segment(review_source, node), str(REVIEW_RUNNER), 'exec'))


def security_commitment(c):
    return sql(c, 'begin read only;'+SECURITY.read_text()+'rollback;')


def defaults(c, owner='postgres', schema='public', kind='tables', privilege='select', recipient='public', action='grant'):
    scope = '' if schema is None else ' in schema '+schema
    return 'alter default privileges for role '+owner+scope+' '+action+' '+privilege+' on '+kind+(' to ' if action=='grant' else ' from ')+recipient+';'


def default_matrix(c, artifact, installed=False):
    cases = [
        [('postgres','public','tables','select','public')],
        [('postgres',None,'tables','select','public')],
        [('postgres','auth','tables','update','public')],
        [('postgres','extensions','tables','maintain','public')],
        [('postgres',None,'sequences','usage','public')],
        [('postgres','public','sequences','select,update','public')],
        [('supabase_admin','public','tables','all','public')],
        [('supabase_admin',None,'sequences','all','public')],
        [('otr_trip_source_writer','public','tables','select','public')],
        [('otr_trip_source_writer',None,'sequences','select','public')],
        [('postgres',None,'tables','select','public'),('postgres','public','tables','insert','public')],
        [('postgres',None,'sequences','usage','public'),('postgres','public','sequences','update','public')],
    ]
    if installed:
        cases += [[('postgres',schema,kind,'all',READER)] for schema in [None,'public','auth','extensions'] for kind in ['tables','sequences']]
    original = artifact.read_text()
    baseline_security = security_commitment(c)
    for i, entries in enumerate(cases):
        for row in entries: sql(c, defaults(c,*row), 'supabase_admin')
        if len(entries)>1:
            # An IN SCHEMA REVOKE cannot mask the global positive grant.
            sql(c, defaults(c,'postgres','public',entries[0][2],entries[0][3],action='revoke'))
        state = raw_state(c)
        forensic=SECURITY.read_text().split('end $default_boundary$;',1)[1]
        unsafe_hash=sql(c,'begin read only;'+forensic+'rollback;')
        assert unsafe_hash != baseline_security
        (OUT/(c+'-'+('reverse' if installed else 'forward')+'-default-'+str(i)+'.json')).write_text(json.dumps({'entries':entries,'unsafe_digest':unsafe_hash,'state_sha256':hashlib.sha256(state.encode()).hexdigest()})+'\n')
        sql(c, original, fail='R3_CATALOG_READER_UNSAFE_DEFAULT_ACL')
        assert raw_state(c)==state
        sql(c, 'begin read only;'+SECURITY.read_text()+'rollback;', fail='R3_CATALOG_READER_UNSAFE_DEFAULT_ACL')
        assert raw_state(c)==state
        record(('reverse' if installed else 'forward')+' unsafe global/schema defaults atomic '+str(i))
        for row in entries: sql(c, defaults(c,*row,action='revoke'), 'supabase_admin')
    # Grant drift after the precondition must also be caught at the postcondition.
    for recipient in ['public', READER]:
        for kind in ['tables','sequences']:
            for schema in [None,'public']:
                injected = original.replace('do $postcondition$ begin', defaults(c,schema=schema,kind=kind,privilege='all',recipient=recipient)+'\n'+'do $postcondition$ begin',1)
                state = raw_state(c)
                sql(c, injected, fail='R3_CATALOG_READER_UNSAFE_DEFAULT_ACL')
                assert raw_state(c)==state
                record(('reverse' if installed else 'forward')+' postcondition future '+kind+' '+recipient+' '+str(schema)+' atomic')


def original_install_probe(c):
    # Body of the accepted independent probe is unchanged; corrected forward rejects.
    baseline=raw_state(c)
    try:
        default_acl_challenge(c)
        raise AssertionError('original unsafe install accepted')
    except RuntimeError as error:
        assert 'R3_CATALOG_READER_UNSAFE_DEFAULT_ACL' in str(error)
    sql(c, defaults(c,action='revoke'))
    assert raw_state(c)==baseline
    record('unchanged independent preexisting PUBLIC SELECT probe rejected')


def safe_defaults(c):
    # Harmless managed recipients and PUBLIC routine/type usage are preserved.
    safe = [defaults(c,'supabase_admin','public','tables','select','service_role'),
            defaults(c,'supabase_admin',None,'sequences','usage','authenticated'),
            defaults(c,'postgres','auth','functions','execute','public'),
            defaults(c,'postgres','auth','types','usage','public')]
    undo = [x.replace(' grant ',' revoke ').replace(' to ',' from ') for x in safe]
    for statement in safe: sql(c, statement, 'supabase_admin')
    state=raw_state(c)
    before_defaults=sql(c,'select jsonb_agg(to_jsonb(d) order by oid) from pg_default_acl d;')
    query=FORWARD.read_text().rsplit('commit;',1)[0]+REVERSE.read_text().replace('begin;','',1).rsplit('commit;',1)[0]+'rollback;'
    sql(c,query)
    assert raw_state(c)==state
    assert sql(c,'select jsonb_agg(to_jsonb(d) order by oid) from pg_default_acl d;')==before_defaults
    record('harmless managed table/sequence recipients and PUBLIC routine/type defaults survive forward/reverse')
    for statement in undo: sql(c, statement, 'supabase_admin')


def future_objects(c):
    safe = [defaults(c,'postgres','public','tables','select','service_role'),defaults(c,'postgres',None,'sequences','usage','authenticated')]
    for statement in safe:sql(c,statement)
    old=security_commitment(c)
    sql(c,'create table public.r3a_f1_future(secret text);insert into public.r3a_f1_future values(\'synthetic\');create sequence public.r3a_f1_future_seq;')
    for statement in ['select * from public.r3a_f1_future;','insert into public.r3a_f1_future values(\'x\');',"select nextval('public.r3a_f1_future_seq');","select last_value from public.r3a_f1_future_seq;","select setval('public.r3a_f1_future_seq',5);"]:
        sql(c,'begin read write;'+statement,READER,True,fail='42501')
    assert sql(c,"select has_table_privilege('service_role','public.r3a_f1_future','SELECT'),has_sequence_privilege('authenticated','public.r3a_f1_future_seq','USAGE');")=='t|t'
    sql(c,'drop table public.r3a_f1_future;drop sequence public.r3a_f1_future_seq;')
    assert security_commitment(c)==old
    for statement in safe:sql(c,statement.replace(' grant ',' revoke ').replace(' to ',' from '))
    record('actual future table/sequence READ WRITE Reader denials; harmless recipient grants retained')


def original_postinstall_probe(c,h2):
    # Replay the unchanged administrator-drift demonstration, without pretending
    # transaction-local validation can prohibit a privileged later administrator.
    original=review_source.split('    # F1 disclosure demonstration uses only synthetic task-owned table/data.\n',1)[1].split('    sql(c, FORWARD.read_text(), READER',1)[0]
    state=raw_state(c)
    corrected=security_commitment(c)
    # Probe SQL/body stays unchanged; bind its commitment boundary to F1's contract.
    namespace=dict(globals(),c=c,h2=corrected,commitment=security_commitment)
    try:
        exec(compile(textwrap.dedent(original),str(REVIEW_RUNNER),'exec'),namespace)
        raise AssertionError('corrected commitment silently accepted default drift')
    except RuntimeError as error:
        assert 'R3_CATALOG_READER_UNSAFE_DEFAULT_ACL' in str(error)
    sql(c,defaults(c,action='revoke'))
    assert raw_state(c)==state
    record('unchanged independent postinstall probe rejected at corrected commitment boundary')
    # Also retain the original legacy-boundary forensic demonstration unchanged.
    namespace=dict(globals(),c=c,h2=h2)
    exec(compile(textwrap.dedent(original),str(REVIEW_RUNNER),'exec'),namespace)
    # The unchanged demonstration cleans its table/defaults and preserves legacy H2.
    sql(c,defaults(c))
    state=raw_state(c)
    sql(c,'begin read only;'+SECURITY.read_text()+'rollback;',fail='R3_CATALOG_READER_UNSAFE_DEFAULT_ACL')
    assert raw_state(c)==state
    sql(c,defaults(c,action='revoke'))
    record('postinstall privileged default drift remains possible; corrected commitment boundary rejects it')


def exercise(c):
    start = len(checks)
    # Exercise both grantor restoration branches without changing H0 authority.
    if c == NAMES[1]:
        sql(c, 'grant otr_trip_source_writer to postgres with inherit false, set false;')
        assert commitment(c) == H0
        record('preexisting administrator self-edge restoration branch')
    original_install_probe(c)
    default_matrix(c,FORWARD)
    safe_defaults(c)
    transitions(c,FORWARD,'forward')
    before = json.loads(catalog(c))
    role_edges = sql(c, "select jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option) order by roleid::regrole::text,member::regrole::text,grantor::regrole::text) from pg_auth_members where roleid in (select oid from pg_roles where rolname like 'otr_%') and roleid<>coalesce((select oid from pg_roles where rolname='otr_trip_publication_catalog_reader'),0);")
    history = sql(c, 'select jsonb_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t;')
    lineage = sql(c, 'select to_jsonb(t) from otr_dev_migrations.lineage t;')
    original_root = sql(c, "select pg_get_functiondef('public.trip_source_read_import_catalogs(uuid,uuid)'::regprocedure);")
    # Preexisting roles and whole-catalog drift reject atomically, with no repair.
    sql(c, f'create role {READER} nologin;grant create on schema public to {READER};')
    sql(c, FORWARD.read_text(), fail='R3_CATALOG_READER_ROLE_EXISTS')
    assert sql(c, f"select has_schema_privilege('{READER}','public','CREATE');") == 't'
    sql(c, f'revoke create on schema public from {READER};drop role {READER};')
    assert commitment(c) == H0
    record('polluted role rejected without sanitation')
    sql(c, 'grant execute on function public.trip_import_observation(jsonb) to otr_trip_source_command_gateway;')
    sql(c, FORWARD.read_text(), fail='R3_CATALOG_READER_CATALOG_DRIFT')
    sql(c, 'revoke execute on function public.trip_import_observation(jsonb) from otr_trip_source_command_gateway;')
    assert commitment(c) == H0
    record('H0 drift rejected atomically')
    sql(c, FORWARD.read_text())
    h1 = commitment(c)
    h1_security = security_commitment(c)
    m = manifest(c)
    assert not m['role']['login'] and m['role']['connection_limit'] == 1
    assert sql(c, f"select rolpassword is null from pg_authid where rolname='{READER}';", 'supabase_admin') == 't'
    assert all(not m['role'][x] for x in ['superuser', 'createdb', 'createrole', 'inherit', 'replication', 'bypassrls'])
    assert m['ownership_count'] == 0 and all(m['closed'].values())
    assert all(r['name'].startswith('extensions.') for r in m['relations'])
    assert not any(n['create'] for n in m['schemas'])
    assert m['default_acls'] == [] and m['future_default_acls'] == []
    assert all(x[1] == 'postgres' and x[3:] == [True, False, False] for x in m['memberships'])
    dedicated = [r for r in m['routines'] if not r['public_execute']]
    assert [r['signature'] for r in dedicated] == ['public.trip_source_read_import_catalogs(uuid,uuid)']
    assert [r['signature'] for r in m['routines'] if r['security_definer']] == ['public.trip_source_read_import_catalogs(uuid,uuid)']
    after = json.loads(catalog(c))
    (OUT / (c + '-candidate-catalog.json')).write_text(json.dumps(after, indent=2)+'\n')
    assert before['relations'] == after['relations'] and before['policies'] == after['policies'] and before['types'] == after['types']
    assert before['roles'] == [r for r in after['roles'] if r['name'] != READER]
    changed = [a for a, b in zip(before['functions'], after['functions']) if a != b]
    assert len(changed) == 1 and changed[0]['signature'] == 'public.trip_source_read_import_catalogs(uuid,uuid)'
    actual_root = sql(c, "select pg_get_functiondef('public.trip_source_read_import_catalogs(uuid,uuid)'::regprocedure);")
    assert actual_root == original_root.replace("session_user<>'otr_trip_source_command_gateway'", "session_user not in ('otr_trip_source_command_gateway','otr_trip_publication_catalog_reader')")
    (OUT / (c+'-edges-before.json')).write_text(role_edges+'\n')
    (OUT / (c+'-edges-after.json')).write_text(sql(c, "select jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option) order by roleid::regrole::text,member::regrole::text,grantor::regrole::text) from pg_auth_members where roleid in (select oid from pg_roles where rolname like 'otr_%') and roleid<>'otr_trip_publication_catalog_reader'::regrole;")+'\n')
    assert role_edges == sql(c, "select jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option) order by roleid::regrole::text,member::regrole::text,grantor::regrole::text) from pg_auth_members where roleid in (select oid from pg_roles where rolname like 'otr_%') and roleid<>'otr_trip_publication_catalog_reader'::regrole;")
    record('NOLOGIN/PASSWORD NULL, one dedicated root, unchanged raw memberships/gateway/owners/RLS/helpers')
    (OUT / (c + '-h1-manifest.json')).write_text(json.dumps(m, indent=2) + '\n')
    # Login is exclusively synthetic and disposable; the delivered artifact stays NOLOGIN.
    sql(c, f"alter role {READER} login password '{PASSWORD}' valid until '2026-11-08T00:00:00Z';")
    h2 = commitment(c)
    h2_security = security_commitment(c)
    (OUT / (c + '-h2-synthetic-manifest.json')).write_text(json.dumps(manifest(c), indent=2) + '\n')
    sql(c, 'select 1;', READER, True, password='wrong', fail='password authentication failed')
    identity = json.loads(sql(c, "select jsonb_build_array(session_user,current_user,current_setting('transaction_read_only'),pg_is_in_recovery(),(select ssl from pg_stat_ssl where pid=pg_backend_pid()));", READER, True))
    assert identity == [READER, READER, 'on', False, True]
    record('actual password-authenticated TLS login; wrong password denied; primary/read-only identity')
    future_objects(c)
    original_postinstall_probe(c,h2)
    sql(c, FORWARD.read_text(), READER, True, fail='R3_CATALOG_READER_ADMIN_REQUIRED')
    record('Reader cannot install forward artifact')
    sql(c, (R3 / 'local-test-fixture.sql').read_text())
    # Distinguish legacy-member admission from linked-member admission.
    sql(c, "delete from public.journey_members where user_id='00000000-0000-4000-8000-000000000002';")
    for actor in [ACTOR, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003']:
        assert read(c, actor)['actor_account_id'] == actor
        record('creator/legacy/linked-guest positive ' + actor[-1])
    sql(c, f"select public.trip_source_read_import_catalogs('00000000-0000-4000-8000-000000000004','{TRIP}');", READER, True, fail='FORBIDDEN')
    sql(c, f"select public.trip_source_read_import_catalogs('{ACTOR}','10000000-0000-4000-8000-000000000099');", READER, True, fail='FORBIDDEN')
    sql(c, "delete from public.trip_members where user_id='00000000-0000-4000-8000-000000000002';")
    sql(c, f"select public.trip_source_read_import_catalogs('00000000-0000-4000-8000-000000000002','{TRIP}');", READER, True, fail='FORBIDDEN')
    record('foreign actor/Trip and revoked legacy membership denied')
    sql(c, f"create role r3a_wrong login password '{PASSWORD}';grant usage on schema public to r3a_wrong;")
    call = f"select public.trip_source_read_import_catalogs('{ACTOR}','{TRIP}');"
    sql(c, call, 'r3a_wrong', True, fail='42501')
    sql(c, 'grant execute on function public.trip_source_read_import_catalogs(uuid,uuid) to r3a_wrong;', 'supabase_admin')
    sql(c, call, 'r3a_wrong', True, fail='FORBIDDEN')
    sql(c, 'revoke execute on function public.trip_source_read_import_catalogs(uuid,uuid) from r3a_wrong;revoke usage on schema public from r3a_wrong;drop role r3a_wrong;', 'supabase_admin')
    record('wrong actual LOGIN denied separately by ACL and session guard')
    roots = json.loads(sql(c, "select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'call','select public.'||quote_ident(p.proname)||'('||(select string_agg('null::'||format_type(t,null),',' order by i) from unnest(p.proargtypes) with ordinality a(t,i))||');') order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'trip_source_%' and p.proname<>'trip_source_read_import_catalogs' and has_function_privilege('otr_trip_source_command_gateway',p.oid,'EXECUTE');"))
    assert len(roots) == 13
    for r in roots:
        sql(c, 'begin read write;' + r['call'], READER, True, fail='42501')
        record('ACL denial READ WRITE ' + r['signature'])
    for text in [f"select public.trip_source_admission('{ACTOR}','{TRIP}',false);", "select public.trip_import_observation('{}');", "select public.trip_event_canonical_json('{}'::json);", 'select * from public.trip_sources;', 'insert into public.trip_sources default values;', 'update public.trip_sources set row_revision=row_revision;', 'delete from public.trip_sources;', 'create table public.r3a_attack(id int);', 'create schema r3a_attack;', f'grant otr_trip_source_writer to {READER};']:
        sql(c, 'begin read write;' + text, READER, True, fail='42501')
        record('direct business/helper/DDL/escalation denial')
    assert sql(c, 'begin read write;create temp table r3a_ambient(id int);insert into r3a_ambient values(1);select count(*) from r3a_ambient;rollback;', READER, True) == '1'
    sql(c, "select extensions.digest('synthetic','sha256');", READER, True, fail='42501')
    # Access is measured without reading private server query text.
    sql(c, 'select count(*) from extensions.pg_stat_statements_info;', READER, True, fail='42501')
    sql(c, 'select public.touch_updated_at();', READER, True, fail='trigger functions can only be called as triggers')
    record('PUBLIC TEMP allowed; extensions/statistics denied by schema USAGE; trigger direct call denied')
    fixture = json.loads((ROOT / 'src/data/repositories/__fixtures__/tripImportCatalogs.json').read_text())
    tables = [k for k, v in fixture.items() if isinstance(v, list)]
    for table in tables:
        if fixture[table]:
            seed_rows(c, table, fixture[table])
    row = {'slot_id': fixture['trip_source_output_slots'][2]['slot_id'], 'predecessor_slot_id': fixture['trip_source_output_slots'][0]['slot_id'], 'dependency_kind': 'RECEIPT_SUCCESS', 'expected_receipt_sha256': 'a' * 64, 'expected_target_id': ACTOR, 'expected_result_revision': 1}
    seed_rows(c, 'trip_source_slot_dependencies', [row])
    full = read(c)
    assert all(isinstance(full[t], list) and full[t] for t in tables)
    assert full['actor_account_id'] == ACTOR and full['trip_id'] == TRIP
    assert all(not read(c, '00000000-0000-4000-8000-000000000003')[t] for t in tables)
    text_path = OUT / (c + '-catalog.json')
    text_path.write_text(sql(c, f"select public.trip_source_read_import_catalogs('{ACTOR}','{TRIP}');", READER, True)+'\n')
    run(['node', '--import', 'tsx', str(ROOT/'scripts/supabase/test-r3-catalog-principal-text.ts'), str(text_path)], cwd=ROOT)
    record('original real SQL text admitted; five duplicate/numeric corruptions rejected')
    record('actual complete nonempty13-family, foreign admitted actor private empty, compromised-login actor trust limit')
    # Dedicated cardinality/byte stress helper below; each fixture change rolls back.
    bounds(c, full, tables)
    sql(c, f"alter role {READER} nologin password null;")
    assert commitment(c) == h1
    reverse = REVERSE.read_text()
    default_matrix(c,REVERSE,True)
    transitions(c,REVERSE,'reverse')
    before_data=business_rows(c)
    sql(c, reverse)
    assert business_rows(c)==before_data
    rollback_hash = commitment(c)
    assert sql(c, "select pg_get_functiondef('public.trip_source_read_import_catalogs(uuid,uuid)'::regprocedure);") == original_root
    assert sql(c, f"select has_function_privilege('{READER}','public.trip_source_read_import_catalogs(uuid,uuid)','EXECUTE');") == 'f'
    assert sql(c, 'select jsonb_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t;') == history
    assert sql(c, 'select to_jsonb(t) from otr_dev_migrations.lineage t;') == lineage
    record('rollback exact original root/ACL; retained unowned dormant role; history/lineage unchanged')
    return {'fixture': c, 'checks': len(checks)-start, 'H0': H0, 'H1': h1_security, 'H2_synthetic_login': h2_security, 'rollback': security_commitment(c),
            'H1_legacy_otr_catalog':h1,'H2_legacy_otr_catalog':h2,'rollback_legacy_otr_catalog':rollback_hash,
            'manifest': m, 'history_sha256': hashlib.sha256(history.encode()).hexdigest(), 'lineage_sha256': hashlib.sha256(lineage.encode()).hexdigest()}


def bounds(c, full, tables):
    # Actual SQL root under real Reader authentication. Admin stress rows isolate
    # per-family ceilings; guards/FK triggers are disabled only for synthetic setup.
    for table in tables:
        rows = []
        base = full[table][0]
        for n in range(65-len(full[table])):
            row = dict(base)
            for key in ['id', 'slot_id', 'parent_run_id', 'parent_candidate_id', 'ancestor_candidate_id', 'predecessor_slot_id']:
                if key in row and not (key == 'slot_id' and table in ('trip_source_slot_lineage_dispositions', 'trip_source_slot_dependencies')):
                    row[key] = str(uuid.UUID(int=0x83100000000040008000000000001000+n))
            for key in ['acquisition_key', 'operation_key', 'candidate_key', 'confirmation_key', 'slot_key', 'domain_operation_key']:
                if row.get(key) is not None:
                    row[key] = 'r3a-bound-' + str(n)
            if table == 'trip_source_revisions':
                row.update(material_revision=n+100, previous_revision=n+99, reason='REPLACEMENT')
            if table == 'trip_source_runs': row['generation'] = n+100
            if table == 'trip_source_inputs': row['representation_id'] = str(uuid.UUID(int=0x83100000000040008000000000002000+n))
            if table == 'trip_source_associations': row['target_id'] = str(uuid.UUID(int=0x83100000000040008000000000002000+n))
            rows.append(row)
        # Commit64, exercise Reader; add65th, exercise overflow; restore baseline rows.
        seed_rows(c, table, rows[:-1])
        assert len(read(c)[table]) == 64
        seed_rows(c, table, rows[-1:])
        sql(c, f"select public.trip_source_read_import_catalogs('{ACTOR}','{TRIP}');", READER, True, fail='IMPORT_READ_RESOURCE_LIMIT')
        retained = json.dumps(full[table]).replace("'", "''")
        sql(c, f"begin;set local session_replication_role=replica;delete from public.{table};insert into public.{table} select * from jsonb_populate_recordset(null::public.{table},'{retained}'::jsonb);commit;", 'supabase_admin')
        record('real64/65 family ' + table)

    table = 'trip_source_representations'
    base = next(r for r in full[table] if r['material_kind'] == 'TEXT')
    clones = []
    for n in range(16):
        row = dict(base)
        row['id'] = str(uuid.UUID(int=0x84100000000040008000000000001000+n))
        row['text_content'] = ''
        row['byte_count'] = 0
        row['payload_sha256'] = hashlib.sha256(b'').hexdigest()
        clones.append(row)
    seed_rows(c, table, clones)
    call = f"public.trip_source_read_import_catalogs('{ACTOR}','{TRIP}')"
    def canonical_length():
        original = sql(c, 'select '+call+';', READER, True).replace("'", "''")
        return int(sql(c, "select octet_length(public.trip_event_canonical_json('"+original+"'::json));"))
    length = canonical_length()
    # byte_count's additional digits contribute to the envelope length.
    remaining = 4194304-length-16*6
    sizes = [min(262140, remaining-i*262140) for i in range(16)]
    assert all(100000 <= n <= 262140 for n in sizes)
    for row, size in zip(clones, sizes):
        sql(c, f"begin;set local session_replication_role=replica;update public.{table} set text_content=repeat('x',{size}),byte_count={size},payload_sha256=encode(extensions.digest(repeat('x',{size}),'sha256'),'hex') where id='{row['id']}';commit;", 'supabase_admin')
    measured = canonical_length()
    # Recalculate exact envelope overhead rather than presume JSONB formatting.
    correction = 4194304-measured
    size = sizes[-1]+correction
    assert 100000 <= size < 262144
    sql(c, f"begin;set local session_replication_role=replica;update public.{table} set text_content=repeat('x',{size}),byte_count={size},payload_sha256=encode(extensions.digest(repeat('x',{size}),'sha256'),'hex') where id='{clones[-1]['id']}';commit;", 'supabase_admin')
    assert canonical_length() == 4194304
    sql(c, f"begin;set local session_replication_role=replica;update public.{table} set text_content=text_content||'x',byte_count=byte_count+1,payload_sha256=encode(extensions.digest(text_content||'x','sha256'),'hex') where id='{clones[-1]['id']}';commit;", 'supabase_admin')
    sql(c, 'select '+call+';', READER, True, fail='IMPORT_READ_RESOURCE_LIMIT')
    retained = json.dumps(full[table]).replace("'", "''")
    sql(c, f"begin;set local session_replication_role=replica;delete from public.{table};insert into public.{table} select * from jsonb_populate_recordset(null::public.{table},'{retained}'::jsonb);commit;", 'supabase_admin')
    record('real protected root4MiB exact accepts/+1 rejects')


OUT.mkdir(parents=True, exist_ok=True)
try:
    for name in NAMES:
        assert subprocess.run(['docker', 'container', 'inspect', name], capture_output=True).returncode != 0, 'Refuse existing task container'
    tls = OUT / 'tls'; tls.mkdir(exist_ok=True)
    run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', str(tls/'server.key'), '-out', str(tls/'server.crt'), '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'])
    results = []
    for c in NAMES:
        run(['docker','create','--name',c,'--network','none','-e','POSTGRES_PASSWORD='+PASSWORD,'public.ecr.aws/supabase/postgres:17.6.1.167','bash','-lc', 'install -o postgres -g postgres -m 600 /r3a-tls/server.key /tmp/r3a-server.key;install -o postgres -g postgres -m 644 /r3a-tls/server.crt /tmp/r3a-server.crt;exec /usr/local/bin/docker-entrypoint.sh postgres -c listen_addresses=localhost -c ssl=on -c ssl_cert_file=/tmp/r3a-server.crt -c ssl_key_file=/tmp/r3a-server.key'])
        created.append(c)
        run(['docker','cp',str(tls),c+':/r3a-tls']);run(['docker','start',c])
        for attempt in range(120):
            if subprocess.run(['docker','exec',c,'pg_isready','-h','localhost','-U','postgres'],capture_output=True).returncode == 0: break
            time.sleep(0.5)
        else: raise AssertionError('task PostgreSQL not ready')
        assert run(['docker','inspect',c,'--format','{{.HostConfig.NetworkMode}}']) == 'none'
        assert sql(c, "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r';") == '0'
        install(c)
        # Force real SCRAM password authentication on the task's loopback TLS path.
        run(['docker','exec',c,'bash','-lc', "p=$(psql -U supabase_admin -d postgres -Atc 'show hba_file');{ printf 'hostssl all all 127.0.0.1/32 scram-sha-256\nhostssl all all ::1/128 scram-sha-256\n';cat \"$p\";} > /tmp/r3a-hba;cat /tmp/r3a-hba > \"$p\";psql -U supabase_admin -d postgres -c 'select pg_reload_conf();'"])
        result = exercise(c);results.append(result)
        print(json.dumps({k:v for k,v in result.items() if k!='manifest'}),flush=True)
    assert results[0]['H1'] == results[1]['H1'] and results[0]['rollback'] == results[1]['rollback']
    assert results[0]['H2_synthetic_login'] == results[1]['H2_synthetic_login']
    assert results[0]['manifest'] == results[1]['manifest']
    (OUT/'sql-proof.json').write_text(json.dumps({'installs':results,'checks':checks,'input_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [R3/'baseline.sql',R3/'catalog.sql',Path('/private/tmp/cp13a-platform-schema.sql'),FORWARD,REVERSE,INVENTORY,SECURITY,REVIEW_RUNNER]}},indent=2)+'\n')
finally:
    for c in created:
        run(['docker','rm','-fv',c])
