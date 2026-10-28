#!/usr/bin/env python3
"""Pure SQL renderer. No subprocess, network, credentials, deployment or execution mode."""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'tuqigdxrvrerfewsxqgm'
SQL_DIR = ROOT / 'supabase/dev-forward/trip-sustained-sync'
FILES = {
    '20261024000200_trip_sustained_dev.sql': 'c9215ce88face89967cb5d3e32b6609498168cfb45112e7d53697442304f3009',
    '20261024000300_trip_person_cloud_create.sql': 'bdac8861e65a73af72ff27c39161be40e21dadd10fb9c269c79289d5f12a5f09',
}
ROLES = ('otr_trip_create_gateway', 'otr_trip_metadata_gateway', 'otr_trip_core_v2_gateway', 'otr_trip_person_command_gateway')
ROLE_LIST = ','.join("'" + role + "'" for role in ROLES)
CLOSED = """NOT EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled)
AND NOT EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled)
AND NOT EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled OR source_review_enabled)
AND NOT EXISTS(SELECT 1 FROM public.trip_source_command_gate WHERE enabled)
AND NOT EXISTS(SELECT 1 FROM public.trip_source_pdf_gate WHERE enabled)
AND NOT EXISTS(SELECT 1 FROM public.trip_person_command_gate WHERE enabled)"""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def binding(actor, cutoff, gate, gate_sha):
    if str(uuid.UUID(actor)) != actor:
        raise ValueError('NONCANONICAL_ACTOR')
    instant = dt.datetime.fromisoformat(cutoff.replace('Z', '+00:00'))
    if not cutoff.endswith('Z') or instant.utcoffset() != dt.timedelta(0):
        raise ValueError('UTC_CUTOFF_REQUIRED')
    if sha(gate.read_bytes()) != gate_sha:
        raise ValueError('APPROVED_GATE_HASH_MISMATCH')
    text = gate.read_text()
    if PROJECT not in text or any(value not in text for value in FILES.values()):
        raise ValueError('GATE_ARTIFACT_SCOPE_MISMATCH')
    for name, expected in FILES.items():
        if sha((SQL_DIR / name).read_bytes()) != expected:
            raise ValueError('SQL_ARTIFACT_HASH_MISMATCH:' + name)
    return {'project': PROJECT, 'actorId': actor, 'adoptionCutoff': cutoff, 'approvedGateSHA256': gate_sha, 'sqlHashes': FILES}


def render(identity):
    actor, cutoff = literal(identity['actorId']) + '::uuid', literal(identity['adoptionCutoff']) + '::timestamptz'
    safe = f"""IF current_user<>'postgres' OR NOT ({CLOSED}) THEN RAISE EXCEPTION 'SUSTAINED_PARENT_GATE_DRIFT';END IF;
IF (SELECT count(*) FROM pg_roles WHERE rolname IN ({ROLE_LIST}))<>4 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ({ROLE_LIST}) AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)) THEN RAISE EXCEPTION 'SUSTAINED_ROLE_FLAGS_DRIFT';END IF;
"""
    preflight = f"""BEGIN READ ONLY;
SELECT ({CLOSED}) AS old_gates_closed;
SELECT rolname,rolcanlogin,rolconnlimit,rolvaliduntil,rolsuper,rolinherit,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname IN ({ROLE_LIST}) ORDER BY rolname;
SELECT count(*) AS active_service_sessions FROM pg_stat_activity WHERE usename IN ({ROLE_LIST});
ROLLBACK;
"""
    # Both reviewed migrations run as one atomic installation, preserving their existing preimage/ACL assertions.
    bodies = []
    for name in FILES:
        body = (SQL_DIR / name).read_text()
        first, last = body.index('BEGIN;'), body.rindex('COMMIT;')
        bodies.append(body[first + len('BEGIN;'):last])
    install = 'BEGIN;\nSET LOCAL lock_timeout=\'5s\';\nDO $$BEGIN\n' + safe + f"IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ({ROLE_LIST}) AND rolcanlogin) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ({ROLE_LIST})) THEN RAISE EXCEPTION 'INSTALL_REQUIRES_STOPPED_SERVICE';END IF;\nEND$$;\n" + '\n'.join(bodies) + '\nCOMMIT;\n'
    postimage_checks = []
    for filename in ('20261024000200_trip_sustained_dev.rollback.sql', '20261024000300_trip_person_cloud_create.rollback.sql'):
        for signature, expected in re.findall(r"md5\(pg_get_functiondef\('([^']+)'::regprocedure\)\)<>\'([a-f0-9]{32})\'", (SQL_DIR / filename).read_text()):
            postimage_checks.append(f"IF md5(pg_get_functiondef({literal(signature)}::regprocedure)) IS DISTINCT FROM {literal(expected)} THEN RAISE EXCEPTION 'ACTIVATION_POSTIMAGE_DRIFT';END IF;")
    if len(postimage_checks) != 13:
        raise ValueError('POSTIMAGE_SET_INCOMPLETE')
    postimages = '\n'.join(postimage_checks)
    # No password is generated or included. Root must first provision reviewed service-managed credentials privately.
    activation = f"""BEGIN;SET LOCAL lock_timeout='5s';SELECT pg_advisory_xact_lock(714022,24);
DO $$BEGIN
{safe}
{postimages}
IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ({ROLE_LIST}) AND rolcanlogin) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ({ROLE_LIST})) THEN RAISE EXCEPTION 'ACTIVATION_REQUIRES_STOPPED_SERVICE';END IF;
IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id={actor}) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id={actor}) THEN RAISE EXCEPTION 'SYNTHETIC_AUTH_PROFILE_REQUIRED';END IF;
IF {cutoff}>clock_timestamp() OR EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE enabled OR actor_account_id<>{actor}) THEN RAISE EXCEPTION 'POLICY_SCOPE_DRIFT';END IF;
IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor} AND adoption_cutoff IS DISTINCT FROM {cutoff}) THEN RAISE EXCEPTION 'IMMUTABLE_CUTOFF_DRIFT';END IF;
IF (SELECT count(*) FROM pg_authid WHERE rolname IN ({ROLE_LIST}) AND rolpassword LIKE 'SCRAM-SHA-256$%')<>4 THEN RAISE EXCEPTION 'PRIVATE_SERVICE_CREDENTIALS_REQUIRED';END IF;
END$$;
INSERT INTO public.trip_sustained_dev_policy(actor_account_id,enabled,adoption_cutoff,revoked_at) VALUES({actor},true,{cutoff},NULL)
ON CONFLICT(actor_account_id) DO UPDATE SET enabled=true,revoked_at=NULL;
""" + '\n'.join(f'ALTER ROLE {role} LOGIN CONNECTION LIMIT 1 VALID UNTIL \'infinity\';' for role in ROLES) + '\nCOMMIT;\n'
    closure = f"""BEGIN;SET LOCAL lock_timeout='5s';SELECT pg_advisory_xact_lock(714022,24);
DO $$BEGIN
{safe}
IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE enabled AND actor_account_id<>{actor}) OR EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor} AND adoption_cutoff IS DISTINCT FROM {cutoff}) THEN RAISE EXCEPTION 'CLOSURE_SCOPE_DRIFT';END IF;
END$$;
""" + '\n'.join(f'ALTER ROLE {role} NOLOGIN;' for role in ROLES) + f"""
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename IN ({ROLE_LIST}) AND pid<>pg_backend_pid();
UPDATE public.trip_sustained_dev_policy SET enabled=false,revoked_at=clock_timestamp() WHERE actor_account_id={actor} AND adoption_cutoff={cutoff};
COMMIT;
"""
    verify = f"""BEGIN READ ONLY;
SELECT ({CLOSED}) AND NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE enabled) AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ({ROLE_LIST}) AND rolcanlogin) AND NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ({ROLE_LIST})) AS closed_verified;
ROLLBACK;
"""
    return {'preflight.sql': preflight, 'install.sql': install, 'activate.sql': activation, 'close.sql': closure, 'verify-closed.sql': verify}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--actor', required=True)
    parser.add_argument('--adoption-cutoff', required=True)
    parser.add_argument('--gate', type=Path, required=True)
    parser.add_argument('--approved-gate-sha', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    identity = binding(args.actor, args.adoption_cutoff, args.gate, args.approved_gate_sha)
    artifacts = render(identity)
    args.output.mkdir(mode=0o700)  # Must be new; never overwrite an earlier execution packet.
    for name, text in artifacts.items():
        fd = os.open(args.output / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
    packet = {**identity, 'mode': 'PREPARED_NOT_EXECUTED', 'artifacts': {name: sha(text.encode()) for name, text in artifacts.items()}}
    (args.output / 'manifest.json').write_text(json.dumps(packet, indent=2) + '\n')
    os.chmod(args.output / 'manifest.json', 0o600)
    print(json.dumps({'status': 'PREPARED_NOT_EXECUTED', 'manifestSHA256': sha((args.output / 'manifest.json').read_bytes())}))


if __name__ == '__main__':
    main()
