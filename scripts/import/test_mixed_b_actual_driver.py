"""One disposable local PostgreSQL plus the actual Backend Source TLS driver."""
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
DOCKER = "/opt/homebrew/bin/docker"
IMAGE = "sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb"
NAME = "otr-b-driver-" + uuid.uuid4().hex[:10]
NETWORK = NAME + "-local"


def docker(*args, data=None, check=True):
    p = subprocess.run([DOCKER, *args], input=data, text=True, capture_output=True, timeout=50)
    if check and p.returncode:
        raise RuntimeError(p.stderr[-2000:])
    return p


def main():
    material_seam = sys.argv[1:] == ["--material-seam"]
    assert not sys.argv[1:] or material_seam
    assert docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}").stdout.strip().startswith("unix://")
    assert not os.environ.get("DOCKER_HOST") or os.environ["DOCKER_HOST"].startswith("unix://")
    container_created = False
    network_created = False
    try:
        docker("image", "inspect", IMAGE)
        docker("network", "create", "--driver", "bridge", "--opt",
               "com.docker.network.bridge.enable_ip_masquerade=false", NETWORK)
        network_created = True
        docker(
            "run", "--pull=never", "--rm", "--network", NETWORK, "-p", "127.0.0.1::5432",
            "--cpus", "1", "--memory", "512m", "--tmpfs", "/var/lib/postgresql/data",
            "--name", NAME, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-d", IMAGE,
            "-c", "shared_buffers=32MB", "-c", "max_connections=8",
            "-c", "listen_addresses=*",
        )
        container_created = True
        for _ in range(60):
            if docker("exec", NAME, "pg_isready", "-h", "127.0.0.1", "-U", "supabase_admin", check=False).returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("LOCAL_PG_START_TIMEOUT")
        address = docker("inspect", "--format",
                         "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
                         NAME).stdout.strip()
        assert ipaddress.ip_address(address).is_private
        assert docker("exec", NAME, "psql", "-h", address, "-U", "supabase_admin",
                      "-d", "postgres", "-XqAt", "-c", "SELECT 1;").stdout.strip() == "1"
        port = docker("port", NAME, "5432/tcp").stdout.strip()
        assert port.startswith("127.0.0.1:") and port.count(":") == 1
        assert docker("network", "inspect", "--format",
                      '{{index .Options "com.docker.network.bridge.enable_ip_masquerade"}}',
                      NETWORK).stdout.strip() == "false"
        with tempfile.TemporaryDirectory(prefix="otr-b-driver-ca-") as directory:
            cert, key = (Path(directory) / name for name in ("server.crt", "server.key"))
            subprocess.run(
                ["/opt/homebrew/bin/openssl", "req", "-x509", "-newkey", "rsa:2048",
                 "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
                 "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost", "-keyout", str(key), "-out", str(cert)],
                check=True, capture_output=True, timeout=10,
            )
            docker("cp", str(cert), NAME + ":/tmp/otr-local-server.crt")
            docker("cp", str(key), NAME + ":/tmp/otr-local-server.key")
            docker("exec", "-u", "root", NAME, "chown", "postgres:postgres", "/tmp/otr-local-server.crt", "/tmp/otr-local-server.key")
            docker("exec", "-u", "root", NAME, "chmod", "600", "/tmp/otr-local-server.key")
            docker("exec", "-i", NAME, "psql", "-h", "127.0.0.1", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", data="""
ALTER SYSTEM SET ssl='on';
ALTER SYSTEM SET ssl_cert_file='/tmp/otr-local-server.crt';
ALTER SYSTEM SET ssl_key_file='/tmp/otr-local-server.key';
SELECT pg_reload_conf();
""" + ("" if material_seam else """
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_source_command_gateway') THEN
  CREATE ROLE otr_trip_source_command_gateway LOGIN;
 END IF;
END $$;
ALTER ROLE otr_trip_source_command_gateway LOGIN PASSWORD 'otr-c01-local-fixture';
"""))
            for _ in range(40):
                result = docker("exec", NAME, "psql", "-h", "127.0.0.1", "-U", "supabase_admin",
                                "-d", "postgres", "-XqAt", "-c", "SHOW ssl;")
                if result.stdout.strip() == "on":
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError("LOCAL_TLS_START_TIMEOUT")
            env = {key: os.environ[key] for key in ("PATH", "HOME", "TMPDIR", "LANG", "CI") if key in os.environ}
            env.update(FORCE_COLOR="0", OTR_C01_FIXTURE_PG_PORT=port.split(":")[-1], OTR_C01_FIXTURE_PG_CA=str(cert))
            def run_test(name, extra=None):
                subprocess.run(
                    [str(ROOT / "node_modules/.bin/vitest"), "run",
                     "backend/src/universalMixedBTaskReservation.test.ts", "-t", name],
                    cwd=ROOT, env={**env, **(extra or {})}, check=True, timeout=40,
                )
            if material_seam:
                import test_mixed_b_pristine as fixture
                fixture.NAME = NAME
                def joined(witness):
                    path = Path(directory) / "synthetic-material.json"
                    path.write_text(json.dumps(witness))
                    run_test("actual Source material proof after ambiguous local commit",
                             {"OTR_C01_FIXTURE_MATERIAL": str(path)})
                def ordered(witness):
                    path = Path(directory) / "synthetic-ordered.json"
                    path.write_text(json.dumps(witness))
                    run_test("actual TLS normal original HTTP", {"OTR_C01_FIXTURE_ORDERED": str(path)})
                checks = []
                fixture.qualify(checks, joined, ordered)
                print(json.dumps({"status":"LOCAL_SYNTHETIC_TLS_FRESH_ADMISSION_PASS", "checks":checks}))
            else:
                run_test("actual Source driver lease loss")
    finally:
        if container_created:
            docker("rm", "-f", NAME, check=False)
        if network_created:
            docker("network", "rm", NETWORK, check=False)


if __name__ == "__main__":
    main()
