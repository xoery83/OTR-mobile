"""Exercise LOCAL_ONLY metadata/link through the existing network-none Core fixture."""
from pathlib import Path
import tempfile


def install_core_local_document(root, sql):
    """Layer existing read authorization and the V3 candidate into disposable PG."""
    auth_root = root / "docs/ops/auth-phase1-20261028/composite-publication-candidate"
    staging = (auth_root / "staging.local.sql").read_text()
    authority = (auth_root / "authority.local.sql").read_text()
    schemas = staging[staging.index("CREATE SCHEMA"):staging.index("ALTER TABLE otr_auth_guest_composite.sealed_stages OWNER")]
    scopes = authority[authority.index("CREATE TABLE otr_auth_guest_composite.transaction_scopes"):authority.index("ALTER TABLE otr_auth_guest_composite.policy")]
    has_scope = authority[authority.index("CREATE FUNCTION otr_auth_guest_composite.has_scope"):authority.index("-- DML-only fence")]
    sql("set role postgres;" + schemas + scopes + has_scope)
    read = (root / "docs/ops/core-member-read-20261104/INSTALL_CANDIDATE.sql").read_text()
    body = read[read.index("CREATE FUNCTION public.trip_sustained_core_read_scope_allowed"):read.index("DO $post$")]
    sql("set role postgres;" + body)
    for path in (
        "supabase/migrations/20261014000200_trip_document_private_reference_custody.sql",
        "supabase/migrations/20261110000100_trip_document_local_only_metadata.sql",
        "backend/sql/core_v3_local_document_capabilities_candidate.sql",
    ):
        sql("set role postgres;" + (root / path).read_text())


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    base = root / "scripts/trip/trip-sustained-sync-acceptance.py"
    source = base.read_text()
    source = source[:source.index(" person_id=str(uuid.uuid4())")]
    source = source.replace("'otr-trip-sustained-'", "'otr-core-v2-test-'")
    source = source.replace("docker('run','--name'", "docker('run','--pull=never','--name'")
    source = source.replace("packet=ROOT/'docs/ops/trip-p1-sustained-sync-20261024'", "packet=pathlib.Path(temporary)")
    source += """
 install_core_local_document(ROOT,sql)
 import os
 env=dict(os.environ, OTR_CORE_OWNED_SQL_FIXTURE=NAME, OTR_CORE_V3_FIXTURE_ACTOR=ACTOR, OTR_CORE_V3_FIXTURE_TRIP=TRIP)
 result=subprocess.run([str(ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','--no-cache',
   'backend/src/tripCoreLocalDocument.sql.test.ts'],cwd=ROOT,env=env,timeout=45)
 assert result.returncode==0
finally:
 if created:docker('rm','-f',NAME)
"""
    with tempfile.TemporaryDirectory(prefix="otr-core-v3-fixture-") as temporary:
        exec(compile(source, str(base), "exec"), {
            "__file__": str(base),
            "temporary": temporary,
            "install_core_local_document": install_core_local_document,
        })
