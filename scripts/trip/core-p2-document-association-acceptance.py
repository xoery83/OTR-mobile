"""Test only the real aggregate contract in disposable, network-none PostgreSQL.

Catalog columns/validators and a synthetic saved flight are pinned with the patch.
The scope predicate is a fixture stand-in; real Auth/ACL is verified by normal DEV Sync.
"""
from pathlib import Path
import json
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
PACKET = ROOT / 'docs/ops/b1-p2-document-20261113'
NAME = 'otr-b1-p2-' + uuid.uuid4().hex[:12]
DB = 'b1_p2_document'
checks = []


def docker(*args, text=None):
    return subprocess.run(['/opt/homebrew/bin/docker', *args], input=text,
                          capture_output=True, text=True, timeout=60)


def sql(text, error=None):
    r = docker('exec', '-i', NAME, 'psql', '-XqAt', '-U', 'supabase_admin',
               '-d', DB, '-v', 'ON_ERROR_STOP=1', text=text)
    if error:
        assert r.returncode and error in r.stderr, (error, r.stderr)
    else:
        assert r.returncode == 0, r.stderr
    return r.stdout.strip()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


fixture = json.loads((PACKET / 'fixture.json').read_text())
sample = json.loads((PACKET / 'sample.json').read_text())
item = sample['item']['id']
actor = sample['item']['owner_account_id']
trip = sample['item']['trip_id']
old = next(f['definition'] for f in fixture['functions']
           if f['name'] == 'assert_trip_core_v2_aggregate')
forward = (ROOT / 'supabase/dev-forward/core-v2/20261113000100_sparse_p2_document_association.sql').read_text()
new = forward[forward.index('CREATE OR REPLACE FUNCTION'):forward.index(';\nDO $post$')]
needle = "IN ('SET_AUTHORED_FLIGHT_DETAILS','SET_ITEM_PARTICIPATION')"
assert new == old.replace(needle, "IN ('SET_AUTHORED_FLIGHT_DETAILS','SET_ITEM_PARTICIPATION','RECONCILE_ITEM_DOCUMENTS')")
created = False
try:
    r = docker('run', '--pull=never', '--name', NAME, '--network', 'none', '-d',
               'otr-core-v2-server84-fixture:20261012')
    assert r.returncode == 0, r.stderr
    created = True
    for _ in range(60):
        if docker('exec', NAME, 'pg_isready', '-U', 'supabase_admin').returncode == 0:
            break
        time.sleep(.2)
    else:
        raise RuntimeError('ISOLATED_PG_NOT_READY')
    r = docker('exec', NAME, 'createdb', '-U', 'supabase_admin', '--owner=postgres', DB)
    assert r.returncode == 0, r.stderr
    setup = "CREATE ROLE otr_trip_core_v2_gateway NOLOGIN; SET ROLE postgres; CREATE TYPE public.location_resolution_status AS ENUM ('none');\n"
    tables = sorted({c['table'] for c in fixture['columns']})
    for table in tables:
        cols = [f'"{c["name"]}" {c["type"]}' for c in fixture['columns'] if c['table'] == table]
        setup += f'CREATE TABLE public."{table}"(' + ','.join(cols) + ');\n'
    setup += "CREATE FUNCTION public.assert_trip_event_aggregate(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'UNEXPECTED_LEGACY_PATH';END$$;\n"
    setup += "CREATE FUNCTION public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=" + literal(actor) + "::uuid AND $2=" + literal(trip) + "::uuid AND $4='CORE_P2_DETAILS' AND coalesce(current_setting('b1.fixture_scope',true),'on')<>'off' $$;\n"
    for f in fixture['functions']:
        if f['name'] != 'assert_trip_core_v2_aggregate':
            setup += f['definition'] + ';\n'
    setup += old + ';\n'
    for table, rows in [('itinerary_events', [sample['item']]),
                        ('itinerary_transport_endpoints', sample['endpoints']),
                        ('trip_flight_intents', [sample['intent']])]:
        for row in rows:
            setup += f'INSERT INTO public.{table} SELECT * FROM jsonb_populate_record(NULL::public.{table},' + literal(json.dumps(row)) + '::jsonb);\n'
    sql(setup)

    def case(name, mutation='', expected=None, command='RECONCILE_ITEM_DOCUMENTS',
             actor_id=actor, target=item, admission='MANUAL', session='otr_trip_core_v2_gateway'):
        settings = {'otr.core.command': command, 'otr.core.family': 'P2',
                    'otr.core.admission': admission, 'otr.core.target_item': target,
                    'otr.core.actor': actor_id, 'otr.core.trip': trip}
        query = 'BEGIN;SET ROLE postgres;' + mutation + ';RESET ROLE;SET SESSION AUTHORIZATION ' + session + ';'
        for key, value in settings.items():
            query += 'SELECT set_config(' + literal(key) + ',' + literal(value) + ',true);'
        query += 'SELECT public.assert_trip_core_v2_aggregate(' + literal(item) + '::uuid);ROLLBACK;'
        sql(query, expected)
        checks.append(name)

    case('preimage reproduces original association rejection', expected='CORE_V2_INVALID_FLIGHT')
    sql('SET ROLE postgres;' + new)
    case('valid existing authored sparse flight accepts association')
    for command in ['SET_AUTHORED_FLIGHT_DETAILS', 'SET_ITEM_PARTICIPATION']:
        case('existing command preserved: ' + command, command=command)
    case('unrelated command remains rejected', command='SET_ITEM_TEXT', expected='CORE_V2_INVALID_FLIGHT')
    case('foreign actor rejected', actor_id=str(uuid.uuid4()), expected='CORE_V2_INVALID_FLIGHT')
    case('foreign target rejected', target=str(uuid.uuid4()), expected='CORE_V2_INVALID_FLIGHT')
    case('wrong admission rejected', admission='REVIEWED_SOURCE', expected='CORE_V2_INVALID_FLIGHT')
    case('wrong execution identity rejected', session='postgres', expected='CORE_V2_INVALID_FLIGHT')
    case('foreign trip rejected', mutation="UPDATE public.itinerary_events SET trip_id='" + str(uuid.uuid4()) + "'", expected='CORE_V2_INVALID_FLIGHT')
    case('scope rejection preserved', mutation="SELECT set_config('b1.fixture_scope','off',true)", expected='CORE_V2_INVALID_FLIGHT')
    case('missing endpoint rejected', mutation="DELETE FROM public.itinerary_transport_endpoints WHERE role='DESTINATION'", expected='CORE_V2_INVALID_ENDPOINTS')
    case('missing origin date rejected', mutation="UPDATE public.itinerary_transport_endpoints SET local_date=NULL WHERE role='ORIGIN'", expected='CORE_V2_INVALID_ENDPOINTS')
    case('nonzero services rejected', mutation="INSERT INTO public.itinerary_transport_services(event_id) VALUES('" + item + "')", expected='CORE_V2_INVALID_AUTHORED_FLIGHT')
    case('missing sparse intent rejected', mutation='DELETE FROM public.trip_flight_intents', expected='CORE_V2_INVALID_AUTHORED_FLIGHT')
    for field, value in [('instant', "'2026-11-13T00:00:00Z'"), ('source_instant', "'2026-11-13T00:00:00Z'"),
                         ('interpretation_key', "'forged'"), ('provenance_refs', "'{}'::jsonb"),
                         ('civil_resolution', "'UNIQUE'"), ('basis', "'SOURCE_INSTANT'"),
                         ('resolution_offset_seconds', '0'), ('supplied_offset_seconds', '0')]:
        case('invalid endpoint ' + field + ' rejected',
             mutation='UPDATE public.itinerary_transport_endpoints SET ' + field + '=' + value + " WHERE role='ORIGIN'",
             expected='CORE_V2_INVALID_AUTHORED_FLIGHT')
    sql('SET ROLE postgres;' + old)
    case('exact inverse restores original behavior', expected='CORE_V2_INVALID_FLIGHT')
    result = {'status': 'PASS', 'postgres': sql('SELECT version()'), 'checks': checks,
              'scope': 'aggregate-contract-only; synthetic scope predicate; no DEV credentials/network'}
    (PACKET / 'isolated-result.json').write_text(json.dumps(result, indent=2) + '\n')
    print('PASS', len(checks), 'targeted PostgreSQL cases; original failure reproduced; inverse verified')
finally:
    if created:
        r = docker('rm', '-f', NAME)
        assert r.returncode == 0, 'ISOLATED_CLEANUP_FAILED'
