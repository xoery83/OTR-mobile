"""Own disposable network-none PG fixture; no DEV, Auth, Provider or business IO."""
import hashlib
import json
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NAME = 'otr-auth-parent-' + uuid.uuid4().hex[:12]
DB = 'otr_auth_parent_' + uuid.uuid4().hex[:12]
ACTOR = '10000000-0000-4000-8000-000000000001'
FOREIGN = '10000000-0000-4000-8000-000000000002'
TRIP = '20000000-0000-4000-8000-000000000001'
OP = '30000000-0000-4000-8000-000000000001'
checks = []


def docker(*args, input=None):
    return subprocess.run(['docker', *args], input=input, text=True,
                          capture_output=True, timeout=60)


def sql(text, error=None):
    result = docker('exec', '-i', NAME, 'psql', '-XqAt', '-U', 'supabase_admin',
                    '-d', DB, '-v', 'ON_ERROR_STOP=1', input=text)
    if error:
        assert result.returncode and error in result.stderr, 'EXPECTED_REJECTION:' + error
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


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
    for role in ['anon', 'authenticated', 'service_role', 'otr_trip_create_gateway']:
        if sql("SELECT count(*) FROM pg_roles WHERE rolname='" + role + "';") == '0':
            sql('CREATE ROLE ' + role + ' NOLOGIN NOSUPERUSER NOCREATEROLE NOINHERIT NOBYPASSRLS;')
    sql("""SET ROLE postgres;
      CREATE TABLE public.trip_create_receipts(operation_id uuid PRIMARY KEY,
        actor_account_id uuid NOT NULL,trip_id uuid NOT NULL,request_payload jsonb NOT NULL);
      ALTER TABLE public.trip_create_receipts ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.trip_create_receipts FROM PUBLIC,anon,authenticated,service_role,otr_trip_create_gateway;
      CREATE TABLE public.parent_test_policy(closed boolean NOT NULL);
      INSERT INTO public.parent_test_policy VALUES(false);
      CREATE FUNCTION public.trip_create_result(operation uuid,actor uuid) RETURNS jsonb
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE r record;BEGIN
        IF session_user<>'otr_trip_create_gateway' THEN RAISE EXCEPTION 'PRINCIPAL_REQUIRED';END IF;
        IF (SELECT closed FROM public.parent_test_policy) THEN
          RAISE EXCEPTION 'TRIP_CREATE_CAPABILITY_CLOSED' USING ERRCODE='55000';END IF;
        SELECT * INTO STRICT r FROM public.trip_create_receipts WHERE operation_id=operation FOR SHARE;
        IF r.actor_account_id<>actor THEN RAISE EXCEPTION 'ACTOR_MISMATCH';END IF;
        RETURN jsonb_build_object('operationId',operation,'actorAccountId',actor,
          'tripId',r.trip_id,'formatVersion',2);END $$;
      REVOKE ALL ON FUNCTION public.trip_create_result(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
      GRANT EXECUTE ON FUNCTION public.trip_create_result(uuid,uuid) TO otr_trip_create_gateway;
    """)
    sql("INSERT INTO public.trip_create_receipts VALUES('" + OP + "','" + ACTOR +
        "','" + TRIP + "','{\"formatVersion\":2}');")
    parent_hash = sql("SELECT md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure));")
    role_query = 'SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls) ORDER BY rolname) FROM pg_roles;'
    roles = sql(role_query)
    sql('SET ROLE postgres;BEGIN;' + (ROOT / 'parent-read.body.sql').read_text() + 'COMMIT;')
    gateway = 'SET SESSION AUTHORIZATION otr_trip_create_gateway;'
    call = "SELECT public.trip_create_parent_result('" + ACTOR + "','" + TRIP + "');"
    result = json.loads(sql(gateway + call))
    assert result == {'operationId': OP, 'actorAccountId': ACTOR, 'tripId': TRIP, 'formatVersion': 2}
    checks.append('real Gateway resolves one owned format2 parent through the existing owning routine')
    assert sql(gateway + "SELECT public.trip_create_parent_result('" + FOREIGN + "','" + TRIP + "') IS NULL;") == 't'
    sql(gateway + "SELECT public.trip_create_parent_result(NULL,'" + TRIP + "');", error='TRIP_CREATE_PRINCIPAL_UNAVAILABLE')
    checks.append('foreign Actor cannot discover the parent; NULL binding is rejected')
    for role in ['anon', 'authenticated', 'service_role']:
        sql('SET SESSION AUTHORIZATION ' + role + ';' + call, error='permission denied')
    sql('SET SESSION AUTHORIZATION postgres;' + call, error='TRIP_CREATE_PRINCIPAL_UNAVAILABLE')
    sql(gateway + 'SELECT * FROM public.trip_create_receipts;', error='permission denied')
    checks.append('API roles cannot execute; Gateway gains no direct table SELECT; wrong session principal is rejected')
    sql('UPDATE public.parent_test_policy SET closed=true;')
    sql(gateway + call, error='TRIP_CREATE_CAPABILITY_CLOSED')
    sql('UPDATE public.parent_test_policy SET closed=false;')
    checks.append('owning capability closure propagates instead of being translated into a missing parent')
    sql("INSERT INTO public.trip_create_receipts VALUES('30000000-0000-4000-8000-000000000002','" +
        ACTOR + "','" + TRIP + "','{\"formatVersion\":2}');")
    sql(gateway + call, error='TRIP_CREATE_PARENT_AMBIGUOUS')
    checks.append('two parent operations fail closed instead of choosing one')
    assert sql(role_query) == roles
    assert sql("SELECT md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure));") == parent_hash
    checks.append('every role flag and the delegated owning function remain unchanged')
    proof = {'status': 'LOCAL_WRAPPER_PERMISSION_AND_DELEGATION_PASS', 'checks': checks,
             'sqlSHA256': hashlib.sha256((ROOT / 'parent-read.body.sql').read_bytes()).hexdigest(),
             'owningRoutine': 'Local fixture stub; existing DEV owning authorization is not requalified here',
             'hostedWrites': 0, 'nativeOrProviderE2E': False, 'runtimeWired': False}
    (ROOT / 'LOCAL_PG_RESULT.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof))
finally:
    docker('rm', '-f', NAME)
