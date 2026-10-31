"""Owned network-none PostgreSQL fixture only. Claims below are unit fixtures, not Auth E2E."""
import hashlib
import json
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NAME = 'otr-auth-profile-' + uuid.uuid4().hex[:12]
DB = 'otr_auth_profile_' + uuid.uuid4().hex[:12]
A, B, GUEST, DISABLED = [str(uuid.uuid4()) for _ in range(4)]
OP = str(uuid.uuid4())
checks = []


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def docker(*args, input=None):
    return subprocess.run(['docker', *args], input=input, text=True,
                          capture_output=True, timeout=60)


def raw_sql(text):
    return docker('exec', '-i', NAME, 'psql', '-XqAt', '-U', 'supabase_admin',
                  '-d', DB, '-v', 'ON_ERROR_STOP=1', input=text)


def sql(text, error=None):
    result = raw_sql(text)
    if error:
        assert result.returncode and error in result.stderr, 'EXPECTED_REJECTION:' + error
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def actor(identity, extra_claims=None):
    claims = {'sub': identity, 'role': 'authenticated', 'aud': 'authenticated'}
    claims.update(extra_claims or {})
    return ('SET SESSION AUTHORIZATION authenticated;SET request.jwt.claim.sub=' + quote(identity)
            + ';SET request.jwt.claims=' + quote(json.dumps(claims)) + ';')


def save(identity, operation, revision, changes):
    return actor(identity) + 'SELECT public.account_private_profile_save(' + quote(operation) + ',' + str(revision) + ',' + quote(json.dumps(changes, ensure_ascii=False)) + '::jsonb);'


try:
    assert docker('run', '--name', NAME, '--network', 'none', '--memory', '256m',
                  '--cpus', '1', '-d', 'otr-core-v2-server84-fixture:20261012').returncode == 0
    for _ in range(100):
        if docker('exec', NAME, 'pg_isready', '-U', 'supabase_admin').returncode == 0:
            break
        time.sleep(.2)
    else:
        raise RuntimeError('PG_START_TIMEOUT')
    assert docker('exec', NAME, 'psql', '-XqAt', '-U', 'supabase_admin', '-d', 'postgres',
                  '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ' + DB +
                  ' OWNER postgres TEMPLATE template0;').returncode == 0
    for role in ['anon', 'authenticated', 'service_role']:
        if sql("SELECT count(*) FROM pg_roles WHERE rolname=" + quote(role) + ';') == '0':
            sql('CREATE ROLE ' + role + ' NOLOGIN NOSUPERUSER NOCREATEROLE NOINHERIT NOBYPASSRLS;')
    sql("""SET ROLE postgres;CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean NOT NULL,banned_until timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,display_name text);
      INSERT INTO public.profiles VALUES('10000000-0000-4000-8000-000000000000','existing public fixture');
    """)
    for identity, anonymous, banned in [(A, False, False), (B, False, False), (GUEST, True, False), (DISABLED, False, True)]:
        sql('INSERT INTO auth.users VALUES(' + quote(identity) + ',' + str(anonymous).lower() + ',' + ("clock_timestamp()+interval '1 hour'" if banned else 'NULL') + ');')
    before_public = sql('SELECT md5(jsonb_agg(to_jsonb(p))::text) FROM public.profiles p;')
    role_query = 'SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls) ORDER BY rolname) FROM pg_roles;'
    roles = sql(role_query)
    sql('SET ROLE postgres;BEGIN;' + (ROOT / 'private-profile.body.sql').read_text() + 'COMMIT;')
    assert sql(actor(A) + 'SELECT count(*) FROM public.account_private_profiles;') == '0'
    changes = {'displayName': '', 'travelDocumentName': {'mode': 'UNSPLIT', 'fullName': "林 O'Neil e\u0301"}}
    first = json.loads(sql(save(A, OP, 0, changes)))
    assert first == json.loads(sql(save(A, OP, 0, changes))) and first['revision'] == 1
    assert set(first) == {'schemaId', 'accountId', 'operationId', 'revision', 'recordedAt'}
    stored = json.loads(sql(actor(A) + 'SELECT fields_json FROM public.account_private_profiles;'))
    assert stored == changes
    checks.append('optional empty display name, independent unsplit Unicode name and exact duplicate receipt survive SQL round-trip')
    resource = 'https://api-dev.xoery.art/mcp'
    for delegated in [{'client_id': str(uuid.uuid4())}, {'otr_scopes': ['otr.trips.read']},
                      {'otr_scopes': None}, {'aud': resource}, {'aud': ['authenticated', resource]}]:
        for table in ['account_private_profiles', 'account_private_profile_receipts']:
            assert sql(actor(A, delegated) + 'SELECT count(*) FROM public.' + table + ';') == '0', 'PROFILE_RESOURCE_READ_LEAK'
        command = actor(A, delegated) + 'SELECT public.account_private_profile_save(' + quote(str(uuid.uuid4())) + ",1,'{\"displayName\":\"must not apply\"}');"
        sql(command, error='PROFILE_NORMAL_ACCOUNT_REQUIRED')
    checks.append('delegated resource/client/scope markers cannot read private names or receipts or call the save RPC')
    for condition in ["banned_until=clock_timestamp()+interval '1 hour'", 'is_anonymous=true']:
        sql('UPDATE auth.users SET ' + condition + ' WHERE id=' + quote(A) + ';')
        for table in ['account_private_profiles', 'account_private_profile_receipts']:
            assert sql(actor(A) + 'SELECT count(*) FROM public.' + table + ';') == '0', 'PROFILE_INELIGIBLE_READ_LEAK'
        sql(save(A, str(uuid.uuid4()), 1, {'displayName': 'must not apply'}), error='PROFILE_NORMAL_ACCOUNT_REQUIRED')
        sql('UPDATE auth.users SET banned_until=NULL,is_anonymous=false WHERE id=' + quote(A) + ';')
    checks.append('existing private rows stay inaccessible while their Auth user is disabled or anonymous, without deleting them')
    assert sql(actor(A) + 'SELECT public.account_private_profile_actor();') == A
    for role in ['anon', 'service_role']:
        sql('SET SESSION AUTHORIZATION ' + role + ';SELECT public.account_private_profile_actor();', error='permission denied')



    assert sql(actor(B) + 'SELECT count(*) FROM public.account_private_profiles WHERE account_id=' + quote(A) + ';') == '0'
    assert sql(actor(B) + 'SELECT count(*) FROM public.account_private_profile_receipts WHERE account_id=' + quote(A) + ';') == '0'
    sql(save(B, OP, 0, {'displayName': ''}))
    assert sql('SELECT count(*) FROM public.account_private_profiles;') == '2'
    checks.append('real RLS denies foreign profile/receipt reads; duplicate names and operation IDs do not merge Accounts')
    for table in ['account_private_profiles', 'account_private_profile_receipts']:
        sql(actor(A) + 'UPDATE public.' + table + ' SET revision=7;', error='permission denied')
        sql('SET SESSION AUTHORIZATION service_role;SELECT * FROM public.' + table + ';', error='permission denied')
    sql('SET SESSION AUTHORIZATION anon;SELECT public.account_private_profile_save(' + quote(str(uuid.uuid4())) + ",0,'{}');", error='permission denied')
    for identity in [GUEST, DISABLED, '']:
        sql(save(identity, str(uuid.uuid4()), 0, {'displayName': 'not applied'}), error='PROFILE_NORMAL_ACCOUNT_REQUIRED')
    checks.append('API table mutation and service-role SELECT remain denied; Guest, disabled and absent subjects cannot save')
    sql(save(A, OP, 0, {'displayName': 'different'}), error='PROFILE_OPERATION_COLLISION')
    sql(save(A, str(uuid.uuid4()), 0, {'displayName': 'stale'}), error='PROFILE_CONFLICT')
    for invalid in [{}, {'accountId': B}, {'displayName': 7}, {'travelDocumentName': {}},
                    {'travelDocumentName': {'mode': 'UNSPLIT', 'fullName': 'A', 'familyName': 'B'}},
                    {'travelDocumentName': {'mode': 'SPLIT', 'familyName': None}}]:
        sql(save(A, str(uuid.uuid4()), 1, invalid), error='PROFILE_INVALID')
    checks.append('operation collision, stale revision and ambiguous/malformed values fail without overwriting the profile')
    sql("""SET ROLE postgres;CREATE FUNCTION public.fail_profile_receipt() RETURNS trigger LANGUAGE plpgsql AS
      $$BEGIN RAISE EXCEPTION 'INJECTED_RECEIPT_FAILURE';END$$;
      CREATE TRIGGER fail_profile_receipt BEFORE INSERT ON public.account_private_profile_receipts
      FOR EACH ROW EXECUTE FUNCTION public.fail_profile_receipt();""")
    sql(save(A, str(uuid.uuid4()), 1, {'displayName': 'must roll back'}), error='INJECTED_RECEIPT_FAILURE')
    assert json.loads(sql(actor(A) + 'SELECT fields_json FROM public.account_private_profiles;')) == changes
    assert sql(actor(A) + 'SELECT revision FROM public.account_private_profiles;') == '1'
    sql('DROP TRIGGER fail_profile_receipt ON public.account_private_profile_receipts;DROP FUNCTION public.fail_profile_receipt();')
    checks.append('receipt-insert fault rolls back both private values and revision atomically')
    commands = [save(A, str(uuid.uuid4()), 1, {'displayName': value}) for value in ['race A', 'race B']]
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(raw_sql, commands))
    assert sum(result.returncode == 0 for result in outcomes) == 1
    assert all(result.returncode == 0 or 'PROFILE_CONFLICT' in result.stderr for result in outcomes)
    assert sql(actor(A) + 'SELECT revision FROM public.account_private_profiles;') == '2'
    checks.append('two concurrent same-revision writes yield one commit and one conflict')
    sql(save(A, str(uuid.uuid4()), 2, {'displayName': None}))
    final = json.loads(sql(actor(A) + 'SELECT fields_json FROM public.account_private_profiles;'))
    assert final['displayName'] is None and final['travelDocumentName'] == changes['travelDocumentName']
    columns = sql("SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='account_private_profile_receipts';")
    assert columns == 'account_id,operation_id,revision,request_sha256,recorded_at'
    checks.append('explicit clear preserves independent document name; immutable receipts retain no plaintext name history')
    assert sql(role_query) == roles
    assert sql('SELECT md5(jsonb_agg(to_jsonb(p))::text) FROM public.profiles p;') == before_public
    checks.append('all role flags and existing public profile rows remain unchanged')
    proof = {'status': 'LOCAL_PROFILE_RLS_CAS_AND_RECOVERY_PASS', 'checks': checks,
             'sqlSHA256': hashlib.sha256((ROOT / 'private-profile.body.sql').read_bytes()).hexdigest(),
             'claims': 'local auth.uid/User-class fixtures only; not real OTP/JWT evidence',
             'hostedWrites': 0, 'runtimeWired': False, 'nativeE2E': False}
    (ROOT / 'LOCAL_PG_RESULT.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof))
finally:
    docker('rm', '-f', NAME)
