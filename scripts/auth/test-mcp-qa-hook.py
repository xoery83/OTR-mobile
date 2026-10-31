"""Disposable network-none PostgreSQL proof; never contacts Supabase DEV."""
import hashlib
import importlib.util
import json
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
assert sys.argv[1:] in [[], ["--write"]], "READ_OR_WRITE_TEST_MODE_REQUIRED"
write = sys.argv[1:] == ["--write"]
spec = importlib.util.spec_from_file_location("render_hook", Path(__file__).with_name("render-mcp-write-qa-hook.py" if write else "render-mcp-qa-hook.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
name = "otr-auth-oauth-hook-" + uuid4().hex[:10]
client = "d2b8167f-ee42-4ac1-b5ef-4dc003c0d141" if write else "11111111-1111-4111-8111-111111111111"
scopes = ["otr.trips.read", "otr.trips.write"] if write else ["otr.trips.read"]
qa = "1f3d7935-1bdc-4952-8d7f-0f72077368c1"
checks = []
context = subprocess.check_output(["docker", "context", "show"], text=True, timeout=10).strip()
context_info = json.loads(subprocess.check_output(["docker", "context", "inspect", context], text=True, timeout=10))[0]
assert context_info["Endpoints"]["docker"]["Host"] in {
    "unix://" + str(Path.home() / ".colima/default/docker.sock"),
    "unix://" + str(Path.home() / ".docker/run/docker.sock"),
}, "LOCAL_MACOS_DOCKER_CONTEXT_REQUIRED"


def docker(*args, input=None):
    return subprocess.run(["docker", "--context", context, *args], input=input, text=True, capture_output=True, timeout=60)


def sql(source, expected_error=None):
    result = docker("exec", "-i", name, "psql", "-XqAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", input=source)
    if expected_error:
        assert result.returncode and expected_error in result.stderr, "EXPECTED_DENIAL:" + expected_error
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def invoke(claims, role="supabase_auth_admin", error=None, user_id=None):
    payload = json.dumps({"claims": claims, "user_id": user_id or claims.get("sub"),
                          "authentication_method": "oauth_provider/authorization_code" if claims.get("client_id") else "otp"}, separators=(",", ":"))
    result = sql("SET ROLE " + role + ";SELECT public.otr_mcp_qa_access_token($payload$" + payload + "$payload$::jsonb);", error)
    return None if error else json.loads(result)["claims"]


gate = "SET ROLE postgres;SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.auth.mcp_qa_gate='OTR_MCP_OAUTH_QA_20261031_V1';"
initial_gate = gate
if write:
    gate = gate.replace("OTR_MCP_OAUTH_QA_20261031_V1", "OTR_MCP_OAUTH_WRITE_QA_20261101_V1")


def render(deadline):
    return module.render(client, deadline, started) if write else module.render(client, deadline)


try:
    result = docker("run", "--pull", "never", "--name", name, "--network", "none", "--memory", "256m", "--cpus", "1", "-d", "otr-core-v2-server84-fixture:20261012")
    assert result.returncode == 0, "FIXTURE_START_FAILED"
    for _ in range(100):
        if docker("exec", name, "pg_isready", "-U", "supabase_admin").returncode == 0:
            break
        time.sleep(.2)
    else:
        raise RuntimeError("LOCAL_PG_START_TIMEOUT")
    for role in ["anon", "authenticated", "service_role", "supabase_auth_admin"]:
        if sql("SELECT count(*) FROM pg_roles WHERE rolname='" + role + "';") == "0":
            sql("CREATE ROLE " + role + " NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOINHERIT NOREPLICATION NOBYPASSRLS;")
    deadline = (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()
    started = (datetime.now(timezone.utc) - timedelta(seconds=2)).isoformat()
    install = render(deadline)
    sql(install, "MCP_QA_EXACT_INSTALL_GATE_REQUIRED")
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    if not write:
        sql(gate + render(future), "MCP_QA_EXACT_INSTALL_GATE_REQUIRED")
    assert sql("SELECT to_regprocedure('public.otr_mcp_qa_access_token(jsonb)') IS NULL;") == "t"
    checks.append("missing exact Gate rejects with no function installed" if write else "missing exact Gate and deadline beyond 30 minutes reject with no function installed")
    sql(initial_gate + module.CLOSED_INSTALL.read_text())
    sql(initial_gate + module.CLOSED_INSTALL.read_text(), "MCP_QA_EXACT_INSTALL_GATE_REQUIRED")
    if write:
        sql(initial_gate + install, "MCP_QA_EXACT_INSTALL_GATE_REQUIRED")
        sql(gate + install.replace(deadline.replace("+00:00", "Z"), future.replace("+00:00", "Z")), "MCP_QA_EXACT_INSTALL_GATE_REQUIRED")
        checks.append("old Read Gate cannot activate Write; SQL independently rejects a tampered deadline beyond the first-intent cap")
    base = {"sub": qa, "role": "authenticated", "aud": "authenticated", "is_anonymous": False,
            "session_id": "22222222-2222-4222-8222-222222222222", "exp": int(time.time()) + 3600,
            "untouched": {"original": "unicode 名"}}
    if write:
        base["iat"] = int(time.time())
    assert invoke(base) == base
    oauth = {**base, "client_id": client}
    invoke(oauth, error="MCP_QA_OAUTH_ISSUANCE_CLOSED")
    checks.append("initial closed hook installs once; all OAuth denies before activation while Native claims pass unchanged" if write else "initial closed hook installs once; all OAuth denies before client creation while Native claims pass unchanged")
    sql(gate + install)
    sql(gate + install, "MCP_QA_EXACT_INSTALL_GATE_REQUIRED")
    assert invoke(base) == base
    checks.append("finite activation CAS requires exact closed body and leaves ordinary Native OTP/Google claim object equal")
    issued = invoke(oauth)
    assert issued == {**oauth, "aud": "https://api-dev.xoery.art/mcp", "otr_scopes": scopes, "exp": issued["exp"]}
    assert int(time.time()) < issued["exp"] <= int(time.time()) + 60
    assert invoke({**oauth, "aud": "https://api-dev.xoery.art/mcp"})["otr_scopes"] == scopes
    checks.append("only named QA/client gets resource aud and exact business scopes, at most 60 second exp; refresh aud handled")
    if write:
        for iat in [None, 0, 1.5, "bad", int(time.time()) + 60]:
            invoke({**oauth, "iat": iat}, error="ERROR:")
        checks.append("Write rejects missing/malformed, pre-floor and future issuer iat")
    for changes in [{"sub": str(uuid4())}, {"client_id": str(uuid4())}, {"is_anonymous": True},
                    {"is_anonymous": None}, {"role": "service_role"}, {"aud": "other"},
                    {"session_id": None}, {"session_id": "bad"}, {"session_id": "00000000-0000-0000-0000-000000000000"},
                    {"exp": None}, {"exp": 0}, {"exp": 1.5}]:
        invoke({**oauth, **changes}, error="ERROR:")
    invoke(oauth, user_id=str(uuid4()), error="MCP_QA_OAUTH_ISSUANCE_CLOSED")
    checks.append("foreign client/account, anonymous/unknown, wrong role/aud/session and missing/expired/malformed exp deny")
    for role in ["anon", "authenticated", "service_role"]:
        invoke(oauth, role, "permission denied")
    assert sql("SELECT NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] FROM pg_proc WHERE oid='public.otr_mcp_qa_access_token(jsonb)'::regprocedure;") == "t"
    checks.append("invoker/search_path pinned; anon/authenticated/service_role cannot execute")
    close = module.render_close(install)
    sql(gate + close)
    sql(gate + close)
    invoke(oauth, error="MCP_QA_OAUTH_ISSUANCE_CLOSED")
    assert invoke(base) == base
    checks.append("CAS close and repeat close restore deny-all OAuth with no new permission or Native claim change")
    short = render((datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat())
    # Install guard tested above. Body expiry is exercised without widening it in the candidate.
    short = short.replace("<=clock_timestamp()+interval '2 minutes'", "<=clock_timestamp()")
    sql(gate + short)
    time.sleep(1.2)
    invoke(oauth, error="MCP_QA_OAUTH_ISSUANCE_CLOSED")
    assert invoke(base) == base
    checks.append("fixture-only shortened install guard proves deadline closes OAuth while ordinary Native claims still pass unchanged")
    proof = {"status": "LOCAL_PG_WRITE_HOOK_CANDIDATE_PASS" if write else "LOCAL_PG_HOOK_CANDIDATE_PASS", "checks": checks,
             "templateSHA256": hashlib.sha256(module.TEMPLATE.read_bytes()).hexdigest(),
             "closedInstallSHA256": hashlib.sha256(module.CLOSED_INSTALL.read_bytes()).hexdigest(),
             "qualification": "JSON transformation/SQL ACL only, not signed JWT issuance; one fixture-only 2-minute installer guard substitution for fast expiry test",
             "devChanges": 0, "providerCalls": 0, "network": "none", "memory": "256m", "cpus": 1}
    proof["localDockerContext"] = context
    if write:
        proof["writeRendererSHA256"] = hashlib.sha256(Path(__file__).with_name("render-mcp-write-qa-hook.py").read_bytes()).hexdigest()
    output = "docs/ops/auth-mcp-oauth-20261031/consumer-write-candidate/LOCAL_WRITE_HOOK_PG_RESULT.json" if write else "docs/ops/auth-mcp-oauth-20261031/LOCAL_HOOK_PG_RESULT.json"
    (ROOT / output).write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps(proof))
finally:
    docker("rm", "-f", name)
