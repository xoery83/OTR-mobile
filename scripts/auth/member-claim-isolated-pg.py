"""Run only the Member Claim candidate against an owned, network-none PG fixture."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "docs/ops/auth-c04-20261103/pg-candidate"
RECEIPT = FOLDER / "ISOLATED_PG_RESULT.json"
DOCKER = ["/opt/homebrew/bin/docker", "--context", "colima"]
IMAGE = "sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068"
name = "otr-core-v2-test-" + uuid.uuid4().hex[:12]
if any(os.environ.get(key) for key in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]):
    raise RuntimeError("DOCKER_ENVIRONMENT_OVERRIDE_DENIED")
endpoint = subprocess.check_output(DOCKER + ["context", "inspect", "colima", "--format", "{{.Endpoints.docker.Host}}"], text=True).strip()
if endpoint != "unix:///Users/xoery/.colima/default/docker.sock":
    raise RuntimeError("LOCAL_COLIMA_ENDPOINT_REQUIRED")
created = passed = removed = False
started = time.monotonic()
sql_hash = hashlib.sha256((FOLDER / "MEMBER_CLAIM_CANDIDATE.sql").read_bytes()).hexdigest()
RECEIPT.write_text(json.dumps({"status": "RUNNING", "candidateSQLSHA256": sql_hash}) + "\n")
try:
    subprocess.run(DOCKER + ["run", "--detach", "--pull=never", "--network", "none",
                    "--memory", "256m", "--cpus", "1", "--label", "otr.auth.fixture=member-claim",
                    "--name", name, "otr-core-v2-server84-fixture:20261012"],
                   check=True, capture_output=True, timeout=30)
    created = True
    actual = subprocess.check_output(DOCKER + ["inspect", "--format", "{{.Image}}", name], text=True).strip()
    if actual != IMAGE:
        raise RuntimeError("OWNED_FIXTURE_IMAGE_MISMATCH")
    for _ in range(40):
        if subprocess.run(DOCKER + ["exec", name, "pg_isready", "-U", "supabase_admin"],
                          capture_output=True, timeout=5).returncode == 0:
            break
        time.sleep(0.25)
    else:
        raise RuntimeError("OWNED_FIXTURE_NOT_READY")
    result = subprocess.run(["node_modules/.bin/vitest", "run", "backend/src/tripMemberClaimPg.pg.test.ts"],
                            cwd=ROOT, env={**os.environ, "DOCKER_CONTEXT": "colima", "OTR_MEMBER_CLAIM_PG_FIXTURE": name}, timeout=130)
    passed = result.returncode == 0
    if not passed:
        raise SystemExit(result.returncode)
finally:
    try:
        if created:
            subprocess.run(DOCKER + ["rm", "--force", name], capture_output=True, check=True, timeout=20)
            removed = True
    finally:
        receipt = json.loads(RECEIPT.read_text()) if passed else {"status": "RUN_FAILED"}
        if passed and not removed:
            receipt["status"] = "CLEANUP_UNCONFIRMED"
        receipt.update(candidateSQLSHA256=sql_hash, fixtureImageSHA256=IMAGE,
                       dockerContext="colima", daemonEndpoint=endpoint,
                       ownedFixtureRemoved=removed, elapsedSeconds=round(time.monotonic()-started, 3))
        RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
