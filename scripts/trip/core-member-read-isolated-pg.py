#!/usr/bin/env python3
"""Bounded local-only acceptance of the Core member READ candidate.

Private live preimages are supplied by --preimages and never copied into Git.
The fixture seeds synthetic users/membership/Create provenance; it does not
exercise Hosted Auth, actual member Claim, Trip creation or the HTTP Reader.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid


ROOT = Path(__file__).resolve().parents[2]
IMAGE = "otr-core-v2-server84-fixture:20261012"
IMAGE_SHA = "sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068"
DOCKER = ["/opt/homebrew/bin/docker", "--context", "colima"]
FUNCTIONS = {
    "trip_core_finite_scope_allowed": ("uuid,uuid", "3339e0dce619dbd8d92651c3ccf213eb"),
    "trip_sustained_core_capabilities": ("uuid,uuid", "85ddf997f6984bbf771f22c728843553"),
    "trip_sustained_dev_scope_allowed": ("uuid,uuid,uuid,text", "2ffdada2e9916df010b960e84f77bffb"),
}
HELPER = "public.trip_sustained_core_read_scope_allowed(uuid,uuid)"
TRIP = "10000000-0000-4000-8000-000000000001"
GATE = "otr_trip_core_v2_gateway"


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preimages", type=Path, required=True)
    args = parser.parse_args()
    for key in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
        if os.environ.get(key):
            raise RuntimeError("LOCAL_COLIMA_CONTEXT_REQUIRED:" + key)
    endpoint = subprocess.check_output(DOCKER + ["context", "inspect", "colima", "--format", "{{.Endpoints.docker.Host}}"], text=True).strip()
    if endpoint != "unix:///Users/xoery/.colima/default/docker.sock":
        raise RuntimeError("LOCAL_COLIMA_ENDPOINT_REQUIRED")
    preimages = {}
    for name, (_, expected) in FUNCTIONS.items():
        text = (args.preimages / (name + ".sql")).read_text()
        # pg_get_functiondef's dollar delimiter encloses exactly prosrc.
        body = text.split("AS $function$", 1)[1].rsplit("$function$", 1)[0]
        if hashlib.md5(body.encode()).hexdigest() != expected:
            raise RuntimeError("PRIVATE_PREIMAGE_MD5_MISMATCH:" + name)
        preimages[name] = text
    candidate = (ROOT / "docs/ops/core-member-read-20261104/INSTALL_CANDIDATE.sql").read_text()
    rollback = (ROOT / "docs/ops/core-member-read-20261104/ROLLBACK_CANDIDATE.sql").read_text()
    result_path = ROOT / "docs/ops/core-member-read-20261104/ISOLATED_PG_RESULT.json"
    previous_evidence = []
    if result_path.exists():
        previous = json.loads(result_path.read_text())
        previous_evidence = previous.get("priorEvidence", []) + [{
            "status": previous["status"], "checks": len(previous["checks"]),
            "stdoutPath": previous["stdoutPath"],
            "resultSHA256": hashlib.sha256(result_path.read_bytes()).hexdigest(),
        }]
    stamp = uuid.uuid4().hex[:12]
    name = "otr-core-member-read-" + stamp
    artifact_dir = Path("/private/tmp") / name
    artifact_dir.mkdir(mode=0o700)
    log = artifact_dir / "stdout.log"
    log.touch(mode=0o600)
    checks = []
    created = removed = False
    started = time.monotonic()
    phase = "create-owned-container"
    a = b = c = None

    def sql(text, role="supabase_admin", *, expect_error=None, bootstrap=False):
        command = DOCKER + ["exec", "-i", name, "psql", "-XqAt", "-h", "127.0.0.1", "-U", role, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
        if role == "supabase_admin" and not bootstrap:
            text = "SET ROLE postgres;\n" + text
        result = subprocess.run(command, input=text, text=True, capture_output=True, timeout=35)
        with log.open("a") as output:
            output.write("\n[" + phase + "]\n" + result.stdout + result.stderr)
        if expect_error:
            if result.returncode == 0 or expect_error not in result.stderr:
                raise RuntimeError("EXPECTED_DENIAL_MISSING:" + expect_error)
        elif result.returncode:
            raise RuntimeError("SQL_FAILED:" + phase + ":" + result.stderr[:1500])
        return result.stdout.strip()

    def check(label, condition=True):
        if not condition:
            raise AssertionError(label)
        checks.append({"name": label, "passed": True})

    def member_read(actor=None, trip=TRIP, *, guc_actor=None, guc_trip=None, suffix=""):
        actor = actor or b
        return sql(
            "BEGIN;SELECT set_config('otr.core.actor'," + quote(guc_actor or actor) + ",true),set_config('otr.core.trip'," + quote(guc_trip or trip) + ",true);"
            "SELECT " + HELPER.split("(")[0] + "(" + quote(actor) + "::uuid," + quote(trip) + "::uuid);" + suffix + "ROLLBACK;",
            GATE,
        ).splitlines()[-1]

    def fingerprints():
        refs = ",".join(quote("public." + n + "(" + sig + ")") + "::regprocedure" for n, (sig, _) in FUNCTIONS.items())
        return json.loads(sql("SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'oid',oid,'bodyMD5',md5(prosrc),'owner',proowner,'acl',proacl,'config',proconfig,'securityDefiner',prosecdef) ORDER BY oid) FROM pg_proc WHERE oid IN (" + refs + ");"))

    def private_table_acls():
        tables = ("auth.users", "public.trips", "public.journey_members", "public.journey_removed_users", "public.trip_sustained_dev_policy", "public.trip_create_receipts")
        refs = ",".join(quote(table) + "::regclass" for table in tables)
        return json.loads(sql("SELECT jsonb_agg(jsonb_build_object('oid',oid,'acl',relacl,'owner',relowner,'rls',relrowsecurity,'forceRls',relforcerowsecurity) ORDER BY oid) FROM pg_class WHERE oid IN (" + refs + ");"))

    try:
        subprocess.run(DOCKER + ["run", "--detach", "--pull=never", "--network", "none", "--memory", "256m", "--cpus", "1", "--label", "otr.core.fixture=member-read", "--name", name, IMAGE], check=True, capture_output=True, timeout=30)
        created = True
        if subprocess.check_output(DOCKER + ["inspect", "--format", "{{.Image}}", name], text=True).strip() != IMAGE_SHA:
            raise RuntimeError("FIXTURE_IMAGE_MISMATCH")
        for _ in range(40):
            if subprocess.run(DOCKER + ["exec", name, "pg_isready", "-U", "supabase_admin"], capture_output=True, timeout=5).returncode == 0:
                break
            time.sleep(.25)
        else:
            raise RuntimeError("OWNED_FIXTURE_NOT_READY")
        phase = "install-four-Core-migrations-and-Trip-owning-port"
        for migration in ("20261011000100_trip_core_v2_foundation.sql", "20261011000200_trip_core_v2_version_dispatch.sql", "20261011000300_trip_core_v2_owning_session.sql", "20261011000400_trip_core_v2_read_scope.sql", "20261013000500_trip_create_owning_port.sql"):
            sql((ROOT / "supabase/migrations" / migration).read_text())
        phase = "synthetic-fixture-principals-policy-and-provenance"
        a = sql("SELECT created_by FROM public.trips WHERE id=" + quote(TRIP) + "::uuid;")
        if not a:
            raise RuntimeError("FIXTURE_TRIP_OWNER_MISSING")
        b, c = str(uuid.uuid4()), str(uuid.uuid4())
        sql("""
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER ROLE otr_trip_core_v2_gateway LOGIN CONNECTION LIMIT 1 VALID UNTIL 'infinity';
GRANT otr_trip_core_v2_gateway TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
""", bootstrap=True)
        sql("""
CREATE SCHEMA IF NOT EXISTS otr_auth_guest_composite;
CREATE OR REPLACE FUNCTION otr_auth_guest_composite.has_scope() RETURNS boolean LANGUAGE sql AS 'SELECT false';
CREATE OR REPLACE FUNCTION otr_auth_guest_composite.scope_allowed(uuid,uuid,uuid,text) RETURNS boolean LANGUAGE sql AS 'SELECT false';
CREATE TABLE IF NOT EXISTS public.journey_removed_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid NOT NULL,user_id uuid NOT NULL,removed_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.trip_sustained_dev_policy(actor_account_id uuid PRIMARY KEY,enabled boolean NOT NULL DEFAULT true,adoption_cutoff timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz);
GRANT otr_trip_core_v2_writer TO otr_trip_core_v2_gateway WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
"""
            + "INSERT INTO auth.users(id,email,is_anonymous) VALUES(" + quote(b) + "::uuid,'core-member-b@example.invalid',false),(" + quote(c) + "::uuid,'core-member-c@example.invalid',false);"
            + "INSERT INTO public.profiles(id,display_name) VALUES(" + quote(b) + "::uuid,'Synthetic Core B'),(" + quote(c) + "::uuid,'Synthetic Core C');"
            + "UPDATE auth.users SET is_anonymous=false,deleted_at=NULL,banned_until=NULL WHERE id=" + quote(a) + "::uuid;"
            + "UPDATE public.journey_members SET status='linked',role='owner' WHERE trip_id=" + quote(TRIP) + "::uuid AND user_id=" + quote(a) + "::uuid;"
            + "INSERT INTO public.journey_members(id,trip_id,user_id,display_name,role,status) SELECT gen_random_uuid()," + quote(TRIP) + "::uuid," + quote(a) + "::uuid,'Synthetic Core owner','owner','linked' WHERE NOT EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=" + quote(TRIP) + "::uuid AND user_id=" + quote(a) + "::uuid);"
            + "INSERT INTO public.journey_members(id,trip_id,user_id,display_name,role,status) VALUES(gen_random_uuid()," + quote(TRIP) + "::uuid," + quote(b) + "::uuid,'Synthetic Core member','group_member','linked');"
            + "INSERT INTO public.trip_create_receipts(operation_id,trip_id,actor_account_id,request_payload) VALUES(gen_random_uuid()," + quote(TRIP) + "::uuid," + quote(a) + "::uuid,'{\"formatVersion\":2}');")
        phase = "install-exact-private-old-functions"
        for text in preimages.values():
            sql(text)
        before = fingerprints()
        table_acls_before = private_table_acls()
        for row in before:
            short = row["signature"].split("(")[0].split(".")[-1]
            check("private prosrc MD5 exact:" + short, row["bodyMD5"] == FUNCTIONS[short][1])
        phase = "unknown-default-ACL-atomic-install-denial"
        sql("CREATE ROLE core_member_unexpected NOLOGIN;ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO core_member_unexpected;")
        marked = "SET otr.core.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.core.member_read_gate='OTR_CORE_MEMBER_READ_SCOPE_V1';\n"
        sql(marked + candidate, expect_error="CORE_MEMBER_READ_HELPER_ACL_DRIFT")
        check("unknown default ACL aborts entire install; helper absent", sql("SELECT to_regprocedure(" + quote(HELPER) + ") IS NULL;") == "t")
        sql("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM core_member_unexpected;DROP ROLE core_member_unexpected;")
        phase = "install-candidate"
        sql(marked + candidate)
        check("three shared functions OID/body/Owner/ACL/config unchanged", fingerprints() == before)
        check("all six private table ACL/Owner/RLS unchanged", private_table_acls() == table_acls_before)
        for role in ("anon", "authenticated", "service_role", "otr_trip_core_v2_writer"):
            check("no new helper EXECUTE:" + role, sql("SELECT has_function_privilege(" + quote(role) + "," + quote(HELPER) + ",'EXECUTE');") == "f")
        check("PUBLIC no helper EXECUTE", sql("SELECT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=" + quote(HELPER) + "::regprocedure AND a.grantee=0);") == "t")
        phase = "real-login-member-read-controls"
        sql("SELECT jsonb_build_object('ownerLinked',(SELECT count(*) FROM public.journey_members WHERE trip_id=" + quote(TRIP) + "::uuid AND user_id=" + quote(a) + "::uuid AND status='linked'),'gateway',(SELECT to_jsonb(r)-'rolpassword' FROM pg_roles r WHERE rolname=" + quote(GATE) + "),'roleEdges',(SELECT jsonb_agg(to_jsonb(m)) FROM pg_auth_members m WHERE m.member=" + quote(GATE) + "::regrole OR m.roleid=" + quote(GATE) + "::regrole));")
        check("A owner allowed", member_read(a) == "t")
        check("B linked member allowed", member_read(b) == "t")
        check("foreign actor denied", member_read(c) == "f")
        check("foreign trip denied", member_read(b, str(uuid.uuid4())) == "f")
        check("actor GUC mismatch denied", member_read(b, guc_actor=c) == "f")
        check("trip GUC mismatch denied", member_read(b, guc_trip=str(uuid.uuid4())) == "f")
        tests = [
            ("removed member denied", "INSERT INTO public.journey_removed_users(trip_id,user_id) VALUES(" + quote(TRIP) + "::uuid," + quote(b) + "::uuid);", "DELETE FROM public.journey_removed_users WHERE user_id=" + quote(b) + "::uuid;"),
            ("unlinked member denied", "UPDATE public.journey_members SET status='unlinked' WHERE trip_id=" + quote(TRIP) + "::uuid AND user_id=" + quote(b) + "::uuid;", "UPDATE public.journey_members SET status='linked' WHERE trip_id=" + quote(TRIP) + "::uuid AND user_id=" + quote(b) + "::uuid;"),
            ("anonymous denied", "UPDATE auth.users SET is_anonymous=true WHERE id=" + quote(b) + "::uuid;", "UPDATE auth.users SET is_anonymous=false WHERE id=" + quote(b) + "::uuid;"),
            ("disabled policy denied", "INSERT INTO public.trip_sustained_dev_policy(actor_account_id,enabled) VALUES(" + quote(b) + "::uuid,false);", "DELETE FROM public.trip_sustained_dev_policy WHERE actor_account_id=" + quote(b) + "::uuid;"),
            ("revoked policy denied", "INSERT INTO public.trip_sustained_dev_policy(actor_account_id,enabled,revoked_at) VALUES(" + quote(b) + "::uuid,true,clock_timestamp());", "DELETE FROM public.trip_sustained_dev_policy WHERE actor_account_id=" + quote(b) + "::uuid;"),
            ("banned actor denied", "UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=" + quote(b) + "::uuid;", "UPDATE auth.users SET banned_until=NULL WHERE id=" + quote(b) + "::uuid;"),
            ("deleted actor denied", "UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id=" + quote(b) + "::uuid;", "UPDATE auth.users SET deleted_at=NULL WHERE id=" + quote(b) + "::uuid;"),
            ("non-v2 provenance denied", "UPDATE public.trip_create_receipts SET request_payload='{\"formatVersion\":1}' WHERE trip_id=" + quote(TRIP) + "::uuid;", "UPDATE public.trip_create_receipts SET request_payload='{\"formatVersion\":2}' WHERE trip_id=" + quote(TRIP) + "::uuid;"),
        ]
        for label, change, undo in tests:
            phase = label
            sql(change)
            check(label, member_read(b) == "f")
            sql(undo)
            check(label + ": restored legal member", member_read(b) == "t")
        phase = "unchanged-old-write-scope-and-capabilities-deny-B"
        prefix = "BEGIN;SELECT set_config('otr.core.actor'," + quote(b) + ",true),set_config('otr.core.trip'," + quote(TRIP) + ",true);"
        check("actual old write scope still denies member B", sql(prefix + "SELECT public.trip_sustained_dev_scope_allowed(" + quote(b) + "::uuid," + quote(TRIP) + "::uuid,NULL,'CORE');ROLLBACK;", GATE).splitlines()[-1] == "f")
        sql(prefix + "SELECT * FROM public.trip_sustained_core_capabilities(" + quote(b) + "::uuid," + quote(TRIP) + "::uuid);ROLLBACK;", GATE, expect_error="CORE_CAPABILITY_CLOSED")
        check("actual old write capabilities still deny member B")
        check("actual old finite write scope still denies member B", sql(prefix + "SELECT public.trip_core_finite_scope_allowed(" + quote(b) + "::uuid," + quote(TRIP) + "::uuid);ROLLBACK;", GATE).splitlines()[-1] == "f")
        phase = "gateway-private-table-grants-and-final-fingerprints"
        for table in ("auth.users", "public.journey_members", "public.trip_sustained_dev_policy", "public.trip_create_receipts"):
            # The baseline already reads journey_members; its exact ACL, including
            # the existing Gateway capability, is compared above and below.
            if table != "public.journey_members":
                for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                    check("Gateway private table denied:" + table + ":" + privilege, sql("SELECT has_table_privilege(" + quote(GATE) + "," + quote(table) + "," + quote(privilege) + ");") == "f")
        check("shared three function fingerprints remain exact", fingerprints() == before)
        check("private table ACL/Owner/RLS final snapshot unchanged", private_table_acls() == table_acls_before)
        check("no role/schema grants in candidate", not any(word in candidate.lower() for word in ("alter role", "grant select", "grant insert", "grant update", "grant delete", "grant usage", "grant create")))
        phase = "actual-helper-only-rollback"
        history_query = (
            "SELECT jsonb_build_object('members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.journey_members m WHERE trip_id=" + quote(TRIP) + "::uuid),"
            "'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY operation_id) FROM public.trip_create_receipts r WHERE trip_id=" + quote(TRIP) + "::uuid));"
        )
        history_before = json.loads(sql(history_query))
        sql(marked + rollback)
        check("actual rollback removes only the new helper", sql("SELECT to_regprocedure(" + quote(HELPER) + ") IS NULL;") == "t")
        check("rollback preserves three shared function fingerprints and OIDs", fingerprints() == before)
        check("rollback preserves private table ACL/Owner/RLS", private_table_acls() == table_acls_before)
        check("rollback preserves exact synthetic membership and Create receipt rows", json.loads(sql(history_query)) == history_before)
        status = "PASS_LOCAL_ISOLATED_PG_MEMBER_READ_NOT_HOSTED"
    except Exception as error:
        status = "FIRST_FAIL"
        checks.append({"name": phase, "passed": False, "error": str(error)[:1800]})
    finally:
        if created:
            removed = subprocess.run(DOCKER + ["rm", "--force", name], capture_output=True, timeout=20).returncode == 0
        receipt = {
            "status": status,
            "requestId": "AUTH-C04-POST-LINK-MEMBER-READ-20261104-01",
            "fixture": {"name": name, "image": IMAGE, "imageSHA256": IMAGE_SHA, "network": "none", "memoryBytes": 268435456, "cpus": 1, "removed": removed},
            "candidateSHA256": hashlib.sha256(candidate.encode()).hexdigest(),
            "rollbackSHA256": hashlib.sha256(rollback.encode()).hexdigest(),
            "priorEvidence": previous_evidence,
            "checks": checks,
            "stdoutPath": str(log),
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "limits": ["Synthetic local users, linked member and formatVersion2 Create provenance seeded with fixture administration, not real Claim/TripCreate acceptance.", "Four actual Core migrations and actual TripCreate owning-port migration; normal Gateway uses real LOGIN connlimit1 and its original SET writer edge.", "Unrelated Guest composite functions are explicit deny-only fixture seams; no positive Source/Core write qualification stubs.", "Private preimages read only from CLI path; no raw definitions copied into tracked files.", "No Hosted/Auth HTTP/Reader/ItemVisibility/Native/Consumer E2E qualification.", "Rollback tests only actual SQL/object/ACL/data preservation. Prior Reader software restoration and active-read drain are external operational prerequisites, not proved by SQL or this fixture."],
        }
        (artifact_dir / "RESULT.json").write_text(json.dumps(receipt, indent=2) + "\n")
        result_path.write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt))
    return 0 if status.startswith("PASS_") and removed else 1


if __name__ == "__main__":
    raise SystemExit(main())
