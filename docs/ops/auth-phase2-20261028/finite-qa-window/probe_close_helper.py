"""Only an owned network-none PostgreSQL fixture. Never Hosted, OTP or Provider."""
import hashlib,json,subprocess,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
NAME='otr-auth-close-'+uuid.uuid4().hex[:12]
DB='otr_auth_close_'+uuid.uuid4().hex[:12]
checks=[]
def docker(*args,input=None):return subprocess.run(['docker',*args],input=input,text=True,capture_output=True,timeout=60)
def sql(text,error=None):
    result=docker('exec','-i',NAME,'psql','-XqAt','-U','supabase_admin','-d',DB,'-v','ON_ERROR_STOP=1',input=text)
    if error:assert result.returncode!=0 and error in result.stderr,'EXPECTED_REJECTION:'+error
    else:assert result.returncode==0,result.stderr
    return result.stdout.strip()
try:
    assert docker('run','--name',NAME,'--network','none','--memory','256m','--cpus','1','-d','otr-core-v2-server84-fixture:20261012').returncode==0
    for _ in range(100):
        if docker('exec',NAME,'pg_isready','-U','supabase_admin').returncode==0:break
        time.sleep(.2)
    else:raise RuntimeError('PG_START_TIMEOUT')
    assert docker('exec',NAME,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE '+DB+' OWNER postgres TEMPLATE template0;').returncode==0
    for role in ['anon','authenticated','service_role','otr_trip_core_v2_gateway','otr_trip_core_v2_writer']:
        if sql("SELECT count(*) FROM pg_roles WHERE rolname='"+role+"';")=='0':sql("CREATE ROLE "+role+" NOLOGIN NOSUPERUSER NOCREATEROLE NOINHERIT NOBYPASSRLS;")
    before=sql("SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls) ORDER BY rolname) FROM pg_roles;")
    sql("SET ROLE postgres; CREATE SCHEMA otr_auth_guest_composite AUTHORIZATION postgres; REVOKE ALL ON SCHEMA otr_auth_guest_composite FROM PUBLIC; GRANT USAGE ON SCHEMA otr_auth_guest_composite TO otr_trip_core_v2_gateway,otr_trip_core_v2_writer; CREATE TABLE otr_auth_guest_composite.policy(singleton boolean PRIMARY KEY CHECK(singleton),enabled boolean NOT NULL,policy_version text NOT NULL); ALTER TABLE otr_auth_guest_composite.policy ENABLE ROW LEVEL SECURITY; REVOKE ALL ON otr_auth_guest_composite.policy FROM PUBLIC; INSERT INTO otr_auth_guest_composite.policy VALUES(true,false,'otr.auth.fileless-p1.unpriced/1'); CREATE TABLE otr_auth_guest_composite.untouched_evidence(value text);INSERT INTO otr_auth_guest_composite.untouched_evidence VALUES('immutable-local-fixture');")
    sql('SET ROLE postgres;'+(ROOT/'close-helper.body.sql').read_text())
    checks.append('install only in disposable schema; no new role/membership/login or table grant')
    meta=json.loads(sql("SELECT json_build_object('definitionMd5',md5(pg_get_functiondef('otr_auth_guest_composite.close_qa_policy(boolean)'::regprocedure)),'definitionSHA256',encode(sha256(convert_to(pg_get_functiondef('otr_auth_guest_composite.close_qa_policy(boolean)'::regprocedure),'UTF8')),'hex'),'owner',pg_get_userbyid(proowner),'securityDefiner',prosecdef,'config',proconfig,'acl',proacl::text) FROM pg_proc WHERE oid='otr_auth_guest_composite.close_qa_policy(boolean)'::regprocedure;"))
    prefix='SET SESSION AUTHORIZATION otr_trip_core_v2_gateway;'
    unchanged=sql('SELECT xmin::text FROM otr_auth_guest_composite.policy;')
    assert sql(prefix+'BEGIN READ ONLY; SELECT otr_auth_guest_composite.close_qa_policy(false);COMMIT;')=='t'
    assert sql(prefix+'SELECT otr_auth_guest_composite.close_qa_policy(true);')=='t'
    assert sql('SELECT xmin::text FROM otr_auth_guest_composite.policy;')==unchanged
    checks.append('already closed verification and idempotent close do not rewrite the policy row')
    sql("SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=true;")
    assert sql(prefix+'BEGIN READ ONLY;SELECT otr_auth_guest_composite.close_qa_policy(false);COMMIT;')=='f'
    sql(prefix+'BEGIN READ ONLY;SELECT otr_auth_guest_composite.close_qa_policy(true);COMMIT;',error='read-only transaction')
    assert sql('SELECT enabled FROM otr_auth_guest_composite.policy;')=='t'
    assert sql(prefix+'SELECT otr_auth_guest_composite.close_qa_policy(true);')=='t'
    assert sql(prefix+'BEGIN READ ONLY;SELECT otr_auth_guest_composite.close_qa_policy(false);COMMIT;')=='t'
    checks.append('real Gateway closes active policy and fresh READ ONLY verifies; read-only mode cannot mutate')
    for role in ['anon','authenticated','service_role','otr_trip_core_v2_writer']:
        assert sql("SELECT has_function_privilege('"+role+"','otr_auth_guest_composite.close_qa_policy(boolean)','EXECUTE');")=='f'
        sql('SET SESSION AUTHORIZATION '+role+';SELECT otr_auth_guest_composite.close_qa_policy(true);',error='permission denied')
    for command in ['SELECT * FROM otr_auth_guest_composite.policy;','UPDATE otr_auth_guest_composite.policy SET enabled=true;']:
        sql(prefix+command,error='permission denied')
    checks.append('API/Writer EXEC denied; Gateway direct SELECT/UPDATE and activation denied')
    sql(prefix+'SELECT otr_auth_guest_composite.close_qa_policy(NULL);',error='AUTH_QA_CLOSE_PRINCIPAL_REQUIRED')
    sql("SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=true,policy_version='future-unapproved/2';")
    sql(prefix+'SELECT otr_auth_guest_composite.close_qa_policy(true);',error='AUTH_QA_CLOSE_POLICY_VERSION_REQUIRED')
    assert sql('SELECT enabled FROM otr_auth_guest_composite.policy;')=='t'
    checks.append('NULL and different future policy versions cannot be used or changed')
    assert sql('SELECT value FROM otr_auth_guest_composite.untouched_evidence;')=='immutable-local-fixture'
    assert sql("SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls) ORDER BY rolname) FROM pg_roles;")==before
    checks.append('evidence and every existing role security flag remain unchanged')
    result={'status':'LOCAL_DISPOSABLE_PG_PASS','checks':checks,'function':meta,'bodySHA256':hashlib.sha256((ROOT/'close-helper.body.sql').read_bytes()).hexdigest(),'hostedWrites':0,'nativeOrProviderE2e':False}
    (ROOT/'CLOSE_HELPER_LOCAL_PG_RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:
    docker('rm','-f',NAME)
