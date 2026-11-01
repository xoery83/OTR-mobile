"""Disposable network-none fixture only; never connects to Hosted DEV."""
import hashlib
import json
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NAME = "otr-auth-profile-install-" + uuid.uuid4().hex[:12]
INSTALL = (ROOT / "INSTALL_CANDIDATE.sql").read_text()
APPROVAL = "SET ROLE postgres;SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.auth.private_profile_gate='OTR_PRIVATE_PROFILE_DEV_INSTALL_20261101_V1';"
CHECK_ABSENT = "SELECT to_regclass('public.account_private_profiles') IS NULL AND to_regclass('public.account_private_profile_receipts') IS NULL AND to_regprocedure('public.account_private_profile_actor()') IS NULL AND to_regprocedure('public.account_private_profile_save(uuid,bigint,jsonb)') IS NULL;"
checks = []


def docker(*args, input=None):
    return subprocess.run(["docker", *args], input=input, text=True,
                          capture_output=True, timeout=60)


def sql(text, error=None, database="postgres"):
    result = docker("exec", "-i", NAME, "psql", "-XqAt", "-U", "supabase_admin",
                    "-d", database, "-v", "ON_ERROR_STOP=1", input=text)
    if error:
        assert result.returncode != 0 and error in result.stderr, error
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


try:
    result = docker("run", "--name", NAME, "--network", "none", "--memory", "256m",
                    "--cpus", "1", "-d", "otr-core-v2-server84-fixture:20261012")
    assert result.returncode == 0, "LOCAL_FIXTURE_START_FAILED"
    for _ in range(100):
        if docker("exec", NAME, "pg_isready", "-U", "supabase_admin").returncode == 0:
            break
        time.sleep(.2)
    else:
        raise RuntimeError("LOCAL_FIXTURE_START_TIMEOUT")
    # Only this disposable container's empty target DB is replaced, never a Host DB.
    inspected = json.loads(docker("inspect", NAME).stdout)[0]
    assert inspected["Name"] == "/" + NAME and inspected["HostConfig"]["NetworkMode"] == "none"
    sql("ALTER DATABASE postgres ALLOW_CONNECTIONS false;SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres';", database="template1")
    sql("ALTER DATABASE postgres RENAME TO prior_fixture;", database="template1")
    sql("CREATE DATABASE postgres OWNER postgres TEMPLATE template0;", database="template1")
    for role in ["anon", "authenticated", "service_role", "profile_fixture_unexpected"]:
        if sql("SELECT count(*) FROM pg_roles WHERE rolname='" + role + "';") == "0":
            sql("CREATE ROLE " + role + " NOLOGIN NOSUPERUSER NOCREATEROLE NOINHERIT NOBYPASSRLS;")
    sql("""SET ROLE postgres;CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,banned_until timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
    """)
    for prefix in ["SET ROLE postgres;", APPROVAL.replace("tuqigdxrvrerfewsxqgm", "wrong-project")]:
        sql(prefix + INSTALL, error="PRIVATE_PROFILE_EXACT_DEV_GATE_REQUIRED")
        assert sql(CHECK_ABSENT) == "t"
    checks.append("missing approval and wrong DEV binding reject before all DDL")
    sql(APPROVAL + "SET ROLE anon;" + INSTALL, error="PRIVATE_PROFILE_EXACT_DEV_GATE_REQUIRED")
    assert sql(CHECK_ABSENT) == "t"
    checks.append("unprivileged role cannot execute the install even with fixture settings")
    sql("SET ROLE postgres;CREATE TABLE public.account_private_profiles(preserved text);")
    sql(APPROVAL + INSTALL, error="PRIVATE_PROFILE_EXPECTED_ABSENT_RECONCILE_NO_REINSTALL")
    assert sql("SELECT count(*) FROM public.account_private_profiles;") == "0"
    sql("SET ROLE postgres;DROP TABLE public.account_private_profiles;")
    checks.append("unexpected existing object is retained and installation stops")
    sql("SET ROLE postgres;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO profile_fixture_unexpected;")
    sql(APPROVAL + INSTALL, error="PRIVATE_PROFILE_TABLE_PRIVILEGE_POSTCONDITION")
    assert sql(CHECK_ABSENT) == "t"
    sql("SET ROLE postgres;ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM profile_fixture_unexpected;")
    checks.append("unexpected default ACL fails postconditions and rolls back all new objects")
    sql(APPROVAL + INSTALL)
    assert sql(CHECK_ABSENT) == "f"
    fingerprint = sql("SELECT md5(string_agg(pg_get_functiondef(oid),'' ORDER BY oid)) FROM pg_proc WHERE proname IN ('account_private_profile_actor','account_private_profile_save');")
    checks.append("exact reviewed install commits its two private tables and functions")
    sql(APPROVAL + INSTALL, error="PRIVATE_PROFILE_EXPECTED_ABSENT_RECONCILE_NO_REINSTALL")
    assert sql("SELECT md5(string_agg(pg_get_functiondef(oid),'' ORDER BY oid)) FROM pg_proc WHERE proname IN ('account_private_profile_actor','account_private_profile_save');") == fingerprint
    checks.append("duplicate install is rejected without replacing the installed functions")
    result = {"status": "LOCAL_INSTALL_CAS_PRIVILEGE_AND_ROLLBACK_PASS", "checks": checks,
              "installSHA256": hashlib.sha256(INSTALL.encode()).hexdigest(),
              "network": "none", "hostedWrites": 0, "runtimeWired": False,
              "claims": "installer fixture only; reuse existing unchanged-body domain/RLS proof separately"}
    (ROOT / "LOCAL_INSTALL_RESULT.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
finally:
    docker("rm", "-f", NAME)
