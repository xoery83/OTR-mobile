"""Run Core85–92 on an owned, network-isolated copy of the synthetic Server84 image."""
import argparse
import json
import pathlib
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOCKER = "/opt/homebrew/bin/docker"
IMAGE = "otr-core-v2-server84-fixture:20261012"
NAME = "otr-core-v2-test-" + uuid.uuid4().hex[:12]


def docker(*args, input=None):
    result = subprocess.run([DOCKER, *args], input=input, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.decode()[-4000:])
    return result.stdout.decode()


def sql(text):
    return docker("exec", "-i", NAME, "psql", "-U", "supabase_admin", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", input=text.encode())


FINGERPRINTS = """SELECT jsonb_object_agg(p.oid::regprocedure::text,
 encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')) FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f';"""
parser = argparse.ArgumentParser(description=__doc__)
group = parser.add_mutually_exclusive_group()
group.add_argument("--flight", action="store_true", help="Run Capture to Core Flight SQL acceptance")
group.add_argument("--source", action="store_true", help="Run the owning Source SQL scenario in a separate fresh clone")
args = parser.parse_args()
scenario = "backend/src/captureFlightCoreV2.sql.test.ts" if args.flight else "backend/src/tripCoreV2SourcePgStorage.sql.test.ts" if args.source else "backend/src/tripCoreV2PgStorage.sql.test.ts"
created = False
try:
    docker("image", "inspect", IMAGE)  # Never pull, read secrets, reset or access a hosted DB.
    docker("run", "--name", NAME, "--network", "none", "-d", IMAGE)
    created = True
    for attempt in range(50):
        ready = subprocess.run([DOCKER, "exec", NAME, "pg_isready", "-U", "supabase_admin"], capture_output=True)
        if ready.returncode == 0:
            break
        time.sleep(0.2)
    else:
        raise RuntimeError("Owned PostgreSQL fixture did not become ready")
    before = json.loads(sql(FINGERPRINTS))
    assert "guard_trip_event_semantics()" in before, "Not the accepted Server84 fixture"
    assert sql("select to_regclass('public.trip_core_activation_gate') is null;").strip() == "t", "Base image already contains Core85"
    for filename in ("20261011000100_trip_core_v2_foundation.sql", "20261011000200_trip_core_v2_version_dispatch.sql", "20261011000300_trip_core_v2_owning_session.sql", "20261011000400_trip_core_v2_read_scope.sql", "20261011000500_trip_core_v2_source_scope.sql", "20261011000600_trip_core_v2_candidate_publication.sql", "20261011000700_trip_core_v2_legacy_claim_fence.sql", "20261011000800_trip_core_v2_retained_claim_fence.sql"):
        sql((ROOT / "supabase/migrations" / filename).read_text())
    after = json.loads(sql(FINGERPRINTS))
    changed = [name for name, digest in before.items() if after.get(name) != digest]
    assert not changed, "Historical function changes: " + repr(changed)
    sql((ROOT / "supabase/tests/core-v2/foundation.sql").read_text())
    sql((ROOT / "supabase/tests/core-v2/candidate-publication.sql").read_text())
    assert sql("select not runtime_enabled and enabled_commands='{}' and enabled_families='{}' and enabled_admission_modes='{}' from trip_core_activation_gate;").strip() == "t"
    import os
    env = dict(os.environ, OTR_CORE_OWNED_SQL_FIXTURE=NAME)
    subprocess.run([str(ROOT / "node_modules/.bin/vitest"), "run", scenario, "--disableConsoleIntercept"], cwd=ROOT, env=env, check=True)
    # Positive fixture scenarios retain disabled allowlists; reset only this owned clone.
    sql("update trip_core_activation_gate set runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}';")
    assert sql("select not runtime_enabled and enabled_commands='{}' and enabled_families='{}' and enabled_admission_modes='{}' from trip_core_activation_gate;").strip() == "t", "Fixture activation gate was not restored CLOSED"
    after_scenario = json.loads(sql(FINGERPRINTS))
    changed = [name for name, digest in before.items() if after_scenario.get(name) != digest]
    assert not changed, "Historical function changes during scenario: " + repr(changed)
    print(json.dumps({"classification": "ISOLATED_SYNTHETIC_SQL", "migrations": [85, 86, 87, 88, 89, 90, 91, 92], "historicalFunctionsPreserved": len(before), "rlsAndClosedGate": "PASS", "activation": "CLOSED"}))
finally:
    if created:
        docker("rm", "-f", NAME)  # Only the UUID-named container created by this invocation.
