"""Prepare one exact DEV authority packet; never connect, install or activate."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKET = ROOT / 'docs/ops/universal-product-20261028/authority'
ACTOR = 'f4b059c5-8241-4ffb-aa15-37fa25474543'
TRIP = '825f79b2-4a9d-4535-a62e-43000ca50c4a'
REGISTRY = 'otr-dev-universal-p2-airports/20261027/1'
SCOPE = {'mode': 'CONTINUOUS_MINIMUMS', 'version': 1, 'tripId': TRIP,
         'families': ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'], 'expiresAt': '2026-11-01T08:48:56Z'}
literal = lambda value: "'" + value.replace("'", "''") + "'"


def build(post):
    assert len(post) == 6
    previous = (ROOT / 'docs/ops/universal-p2-formal-save-20261027/P2_READY_ACTIVATE.sql').read_text()
    airport_check = next(line for line in previous.splitlines() if line.startswith('IF (SELECT coalesce(jsonb_agg(to_jsonb(r)'))
    airport_check = airport_check.replace('P2_REQUIRES_EXACT_DORMANT_AIRPORTS', 'CONTINUOUS_REQUIRES_EXACT_DORMANT_AIRPORTS')
    header = "BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714028,1);\n"
    scope = literal(json.dumps(SCOPE, separators=(',', ':'))) + '::jsonb'
    checks = []
    for signature, definition in post.items():
        checks.append("IF md5(pg_get_functiondef(" + literal('public.' + signature) + "::regprocedure)) IS DISTINCT FROM " + literal(hashlib.md5(definition.encode()).hexdigest()) + " THEN RAISE EXCEPTION 'CONTINUOUS_FUNCTION_DRIFT';END IF;")
    activate = header + "DO $arm$ BEGIN\nIF clock_timestamp()>='2026-11-01T08:48:56Z'::timestamptz THEN RAISE EXCEPTION 'CONTINUOUS_EXPIRED';END IF;\nPERFORM 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id=" + literal(ACTOR) + "::uuid AND enabled AND revoked_at IS NULL AND universal_import_enabled AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL FOR UPDATE;\nIF NOT FOUND THEN RAISE EXCEPTION 'CONTINUOUS_REQUIRES_CLOSED_POLICY';END IF;\n" + airport_check + '\n' + '\n'.join(checks) + "\nUPDATE public.trip_core_airport_identities SET enabled=true WHERE registry_version=" + literal(REGISTRY) + ";\nUPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=true,universal_p1_review_scope=" + scope + " WHERE actor_account_id=" + literal(ACTOR) + "::uuid;\nEND $arm$;COMMIT;\n"
    close = header + "DO $close$ BEGIN\nIF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id=" + literal(ACTOR) + "::uuid AND universal_p1_review_scope IS NOT NULL AND universal_p1_review_scope IS DISTINCT FROM " + scope + ") THEN RAISE EXCEPTION 'CONTINUOUS_CLOSE_SCOPE_DRIFT';END IF;\nUPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false,universal_p1_review_scope=NULL WHERE actor_account_id=" + literal(ACTOR) + "::uuid;\nUPDATE public.trip_core_airport_identities SET enabled=false WHERE registry_version=" + literal(REGISTRY) + ";\nEND $close$;COMMIT;\n"
    return activate, close


if __name__ == '__main__':
    post = json.loads((PACKET / 'CONTINUOUS_REVIEW_POSTIMAGES_CANDIDATE.json').read_text())
    activate, close = build(post)
    (PACKET / 'CONTINUOUS_POLICY_ACTIVATE_CANDIDATE.sql').write_text(activate)
    (PACKET / 'CONTINUOUS_POLICY_CLOSE_CANDIDATE.sql').write_text(close)
    (PACKET / 'CONTINUOUS_POLICY_SCOPE_CANDIDATE.json').write_text(json.dumps(SCOPE, indent=2) + '\n')
    print(json.dumps({'status': 'PREPARED_NOT_AUTHORIZED_NOT_EXECUTED', 'scope': SCOPE}))
