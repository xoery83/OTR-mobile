"""One cached, network-none/256MiB PG fixture; no Hosted access or business schema."""
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
ROOT = Path(__file__).resolve().parents[2]
NAME = 'otr-source-serial-' + uuid.uuid4().hex[:12]
DOCKER = '/opt/homebrew/bin/docker'
def docker(*args):
    result = subprocess.run([DOCKER, *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    return result
created = False
try:
    docker('run', '--name', NAME, '--network', 'none', '--memory', '256m', '--cpus', '1', '-d', 'otr-core-v2-server84-fixture:20261012')
    created = True
    for _ in range(50):
        if subprocess.run([DOCKER, 'exec', NAME, 'pg_isready', '-U', 'supabase_admin'], capture_output=True).returncode == 0:
            break
        time.sleep(.2)
    else:
        raise RuntimeError('OWNED_FIXTURE_NOT_READY')
    docker('exec', NAME, 'psql', '-XqAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='otr_trip_source_command_gateway') THEN CREATE ROLE otr_trip_source_command_gateway; END IF; END $$; ALTER ROLE otr_trip_source_command_gateway LOGIN PASSWORD 'source-synthetic-only' CONNECTION LIMIT 1; ALTER ROLE otr_trip_source_command_gateway NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;")
    limit = docker('exec', NAME, 'psql', '-XqAt', '-U', 'supabase_admin', '-d', 'postgres', '-c', "SELECT rolconnlimit=1 AND NOT rolsuper FROM pg_roles WHERE rolname='otr_trip_source_command_gateway';").stdout.strip()
    assert limit == 't'
    result = subprocess.run([str(ROOT/'node_modules/.bin/vitest'), 'run', '--maxWorkers=1', 'backend/src/universalSourceConnection.test.ts', 'backend/src/universalContinuousRuntime.test.ts'], cwd=ROOT, env={**os.environ, 'OTR_UNIVERSAL_SOURCE_QUEUE_SQL_FIXTURE': NAME}, capture_output=True, text=True, timeout=60)
    print(result.stdout)
    assert result.returncode == 0, result.stderr
    print(json.dumps({'status': 'SOURCE_SERIAL_PG_PASS_NOT_DEV', 'network': 'none', 'memory': '256m', 'sourceRoleConnectionLimit': 1, 'businessWrites': 0}))
finally:
    if created:
        docker('rm', '-f', NAME)
