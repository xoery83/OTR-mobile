"""Run Core85–92 on an owned synthetic Server84 clone; TEXT transport uses a loopback TLS port."""
import argparse
import json
import pathlib
import subprocess
import time
import uuid
import tempfile

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
group.add_argument("--text-runtime", action="store_true", help="Run real local HTTP/pg/TLS TEXT acceptance")
group.add_argument("--pdf-authority", action="store_true", help="Run CLOSED Source PDF authority acceptance")
group.add_argument("--native-flight", action="store_true", help="Run native PDF Source authority rejection in a disposable CLOSED fixture")
group.add_argument("--native-installed", action="store_true", help="Verify exact installed Simulator packet remains owning REVIEW")
parser.add_argument("--with-llm", action="store_true", help="Install current CLOSED LLM protected admission before PDF authority")
parser.add_argument("--with-pdf-authority", action="store_true", help="Install CLOSED PDF authority while testing a non-PDF scenario")
args = parser.parse_args()
install_pdf = args.pdf_authority or args.with_pdf_authority
llm_roots = {"flight_activation_reserve_call(jsonb,jsonb)", "external_integration_mark_dispatch(jsonb,jsonb)"}
llm_changes = []
scenario = "backend/src/nativeFlightInstalledReview.sql.test.ts" if args.native_installed else "src/data/repositories/captureFlightNativeRepository.test.ts" if args.native_flight else "backend/src/captureFlightCoreV2.sql.test.ts" if args.pdf_authority else "backend/src/flightTextDevBackend.runtime.test.ts" if args.text_runtime else "backend/src/captureFlightCoreV2.sql.test.ts" if args.flight else "backend/src/tripCoreV2SourcePgStorage.sql.test.ts" if args.source else "backend/src/tripCoreV2PgStorage.sql.test.ts"
created = False
network_created = False
private = tempfile.TemporaryDirectory(prefix="otr-flight-text-")
network = NAME + "-network"
try:
    docker("image", "inspect", IMAGE)  # Never pull, read secrets, reset or access a hosted DB.
    if args.text_runtime:
        docker("network", "create", network)
        network_created = True
        docker("run", "--name", NAME, "--network", network, "-p", "127.0.0.1::5432", "-d", IMAGE)
    else:
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
    core_after = json.loads(sql(FINGERPRINTS))
    assert all(core_after.get(name) == digest for name, digest in before.items()), "Core changed historical functions"
    installed = core_after
    if args.with_llm:
        sql((ROOT / "supabase/migrations/20261012000100_model_task_protected_admission.sql").read_text())
        installed = json.loads(sql(FINGERPRINTS))
        llm_changes = [name for name, digest in core_after.items() if installed.get(name) != digest]
        assert set(llm_changes) == llm_roots, "Unexpected LLM protected-root changes: " + repr(llm_changes)
        assert sql("select not runtime_enabled from external_integration_environment_state where environment='DEV';").strip() == "t"
    before_pdf = installed
    if install_pdf:
        sql((ROOT / "supabase/migrations/20261012000200_source_pdf_derivative_authority.sql").read_text())
        assert sql("select not enabled from trip_source_pdf_gate;").strip() == "t"
        sql((ROOT / "supabase/tests/source-pdf/authority.sql").read_text())
        installed = json.loads(sql(FINGERPRINTS))
        assert all(installed.get(name) == digest for name, digest in before_pdf.items()), "PDF authority changed preexisting functions"
    sql((ROOT / "supabase/tests/core-v2/foundation.sql").read_text())
    sql((ROOT / "supabase/tests/core-v2/candidate-publication.sql").read_text())
    assert sql("select not runtime_enabled and enabled_commands='{}' and enabled_families='{}' and enabled_admission_modes='{}' from trip_core_activation_gate;").strip() == "t"
    import os
    env = dict(os.environ, OTR_CORE_OWNED_SQL_FIXTURE=NAME)
    if args.pdf_authority:
        env["OTR_CORE_PDF_AUTHORITY"] = "1"
    if args.text_runtime:
        cert = pathlib.Path(private.name) / "server.crt"
        key = pathlib.Path(private.name) / "server.key"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", str(key), "-out", str(cert)], check=True, capture_output=True)
        docker("cp", str(cert), NAME + ":/tmp/flight-server.crt")
        docker("cp", str(key), NAME + ":/tmp/flight-server.key")
        docker("exec", "-u", "root", NAME, "chown", "postgres:postgres", "/tmp/flight-server.key", "/tmp/flight-server.crt")
        docker("exec", "-u", "root", NAME, "chmod", "600", "/tmp/flight-server.key")
        sql("ALTER SYSTEM SET ssl='on'; ALTER SYSTEM SET ssl_cert_file='/tmp/flight-server.crt'; ALTER SYSTEM SET ssl_key_file='/tmp/flight-server.key'; SELECT pg_reload_conf();")
        # Entirely synthetic passwords and LOGIN changes in this owned disposable clone only.
        sql("ALTER ROLE otr_trip_core_v2_gateway LOGIN PASSWORD 'synthetic-core-text'; ALTER ROLE otr_trip_source_command_gateway LOGIN PASSWORD 'synthetic-source-text';")
        port = docker("port", NAME, "5432/tcp").strip()
        assert port.startswith("127.0.0.1:"), "Fixture exposed beyond loopback"
        env.update(OTR_FLIGHT_TEXT_PORT=port.split(":")[-1], OTR_FLIGHT_TEXT_CA=str(cert))
    native_items_before = sql("select count(*) from public.itinerary_events;").strip() if args.native_flight or args.native_installed else None
    subprocess.run([str(ROOT / "node_modules/.bin/vitest"), "run", scenario, "--disableConsoleIntercept"], cwd=ROOT, env=env, check=True)
    if native_items_before is not None:
        assert sql("select count(*) from public.itinerary_events;").strip() == native_items_before, "Native REVIEW created unauthorized canonical Items"
        if install_pdf:
            assert sql("select count(*) from public.trip_source_pdf_seals;").strip() == "0", "Native declared its own derivative seal"
        print(json.dumps({"classification": "JOINED_NATIVE_AUTHORITY_FENCE", "unauthorizedCanonicalItems": 0, "nativeSeals": 0 if install_pdf else None}))
    if args.text_runtime:
        assert sql("select not enabled from trip_source_command_gate;").strip() == "t"
        assert sql("select not flight_admission_enabled from trip_import_admission_gate;").strip() == "t"
    if install_pdf:
        assert sql("select not enabled from trip_source_pdf_gate;").strip() == "t"
    # Positive fixture scenarios retain disabled allowlists; reset only this owned clone.
    sql("update trip_core_activation_gate set runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}';")
    assert sql("select not runtime_enabled and enabled_commands='{}' and enabled_families='{}' and enabled_admission_modes='{}' from trip_core_activation_gate;").strip() == "t", "Fixture activation gate was not restored CLOSED"
    after_scenario = json.loads(sql(FINGERPRINTS))
    changed = [name for name, digest in installed.items() if after_scenario.get(name) != digest]
    assert not changed, "Historical function changes during scenario: " + repr(changed)
    print(json.dumps({"classification": "ISOLATED_SYNTHETIC_SQL", "migrations": [85, 86, 87, 88, 89, 90, 91, 92] + (["20261012000100_model_task_protected_admission"] if args.with_llm else []) + (["20261012000200_source_pdf_derivative_authority"] if install_pdf else []), "coreHistoricalFunctionsPreserved": len(before), "llmApprovedChangedRoots": llm_changes, "pdfPreexistingFunctionsPreserved": len(before_pdf) if install_pdf else None, "installedFunctionsPreservedDuringScenario": len(installed), "rlsAndClosedGate": "PASS", "activation": "CLOSED"}))
finally:
    try:
        if created:
            docker("rm", "-f", NAME)  # Only the UUID-named container created by this invocation.
    finally:
        try:
            if network_created:
                docker("network", "rm", network)
        finally:
            private.cleanup()
