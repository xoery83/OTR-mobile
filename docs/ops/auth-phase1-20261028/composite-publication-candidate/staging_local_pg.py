"""Owned network-none PostgreSQL probe; never uses Hosted credentials or Sessions."""
from pathlib import Path
import hashlib, json, subprocess, time, uuid
from concurrent.futures import ThreadPoolExecutor
ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
NAME = 'otr-auth-composite-' + uuid.uuid4().hex[:12]
DATABASE = 'otr_auth_composite_' + uuid.uuid4().hex[:12]
checks = []
def docker(*args, input=None):
    return subprocess.run(['docker', *args], input=input, text=True, capture_output=True, timeout=60)
def sql(text, database=DATABASE, error=None):
    result = docker('exec', '-i', NAME, 'psql', '-XqAt', '-U', 'supabase_admin', '-d', database,
                    '-v', 'ON_ERROR_STOP=1', input=text)
    if error:
        assert result.returncode and error in result.stderr, 'EXPECTED_SQL_REJECTION:' + error
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()
def quote(value): return "'" + str(value).replace("'", "''") + "'"
def canonical(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
def sha(text): return hashlib.sha256(text.encode()).hexdigest()
def insertion(plan):
    body = json.loads(plan['canonicalText']); grant = body['grant']
    values = [grant['adoptionId'], grant['targetAccountId'], grant['sourceGuestLocalId'], grant['grantId'],
              grant['inventorySha256'], body['preparation']['sha256'], plan['sha256'], plan['canonicalText']]
    return ('INSERT INTO otr_auth_guest_composite.sealed_stages(adoption_id,actor_account_id,source_guest_local_id,grant_id,inventory_sha256,preparation_sha256,plan_sha256,plan_text) VALUES('
            + ','.join(map(quote, values)) + ') ON CONFLICT(adoption_id) DO NOTHING;')
def alter(plan, **fields):
    body = json.loads(plan['canonicalText']); prepared = json.loads(body['preparation']['canonicalText'])
    for key, value in fields.items():
        body['grant'][key] = value
        if key in prepared: prepared[key] = value
    text = canonical(prepared)
    body['preparation'] = {'canonicalText': text, 'sha256': sha(text), 'bytes': len(text.encode())}
    text = canonical(body)
    return {'canonicalText': text, 'sha256': sha(text)}
try:
    launched = docker('run', '--name', NAME, '--network', 'none', '--memory', '256m', '--cpus', '1', '-d',
                      'otr-core-v2-server84-fixture:20261012')
    assert launched.returncode == 0, launched.stderr
    for _ in range(80):
        if docker('exec', NAME, 'pg_isready', '-U', 'supabase_admin').returncode == 0: break
        time.sleep(.2)
    else: raise RuntimeError('OWNED_PG_START_TIMEOUT')
    roles = "SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls,rolconnlimit) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_core_v2_writer');"
    before = sql(roles, database='postgres')
    candidate = (HERE/'staging.local.sql').read_text()
    sql(candidate, database='postgres', error='AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED')
    checks.append('candidate refuses default database before any DDL')
    sql('CREATE DATABASE ' + DATABASE + ' OWNER postgres TEMPLATE template0;', database='postgres')
    sql(candidate, error='AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED')
    checks.append('candidate also requires explicit disposable fixture marker')
    sql("SET ROLE postgres; SET otr.auth.composite_fixture='LOCAL_DISPOSABLE';" + candidate)
    checks.append('private immutable staging table installs only in owned disposable database')
    generated = subprocess.run(['node', '--import', 'tsx', '-e', "const {fixture,draftEntries}=require('./backend/src/guestAdoptionCompositePlan.fixture.ts'); const {prepareGuestAdoptionCompositePlan}=require('./backend/src/guestAdoptionCompositePlan.ts'); (async()=>{const f=fixture(),p=await f.source(); const plan=await prepareGuestAdoptionCompositePlan(f.user,{grant:f.grant,preparationSha256:p.sha256},p);const d=fixture(),entries=draftEntries(d);d.grant.resources.liveDrafts=entries.length;const q=await d.source(entries);const drafts=await prepareGuestAdoptionCompositePlan(d.user,{grant:d.grant,preparationSha256:q.sha256},q);process.stdout.write(JSON.stringify({saved:plan,drafts}));})().catch(()=>{process.exitCode=1;});"], cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert generated.returncode == 0, 'SYNTHETIC_PLAN_GENERATION_FAILED'
    generated_plans = json.loads(generated.stdout)
    plan = generated_plans['saved']
    sql('SET ROLE postgres;' + insertion(plan))
    sql('SET ROLE postgres;' + insertion(plan))
    assert sql('SET ROLE postgres;SELECT count(*) FROM otr_auth_guest_composite.sealed_stages;') == '1'
    checks.append('actual validated synthetic plan persists once; exact duplicate is idempotent')
    changed = alter(plan, targetAccountId=str(uuid.uuid4()), grantId=str(uuid.uuid4()))
    sql('SET ROLE postgres;' + insertion(changed))
    actor = json.loads(changed['canonicalText'])['grant']['targetAccountId']
    assert sql('SET ROLE postgres;SELECT count(*) FROM otr_auth_guest_composite.sealed_stages WHERE actor_account_id=' + quote(actor) + '::uuid;') == '0'
    checks.append('foreign Account colliding adoption cannot replace the stored actor or read its own result')
    sql("SET ROLE postgres;UPDATE otr_auth_guest_composite.sealed_stages SET inventory_sha256=repeat('c',64);", error='AUTH_COMPOSITE_STAGE_IMMUTABLE')
    sql('SET ROLE postgres;DELETE FROM otr_auth_guest_composite.sealed_stages;', error='AUTH_COMPOSITE_STAGE_IMMUTABLE')
    checks.append('UPDATE and DELETE of accepted staging source are refused')
    bad = alter(plan, adoptionId=str(uuid.uuid4()), grantId=str(uuid.uuid4()))
    bad['sha256'] = 'c'*64
    sql('SET ROLE postgres;' + insertion(bad), error='check constraint')
    checks.append('SQL independently rejects changed exact plan hash')
    incomplete = alter(plan, adoptionId=str(uuid.uuid4()), grantId=str(uuid.uuid4()))
    body = json.loads(incomplete['canonicalText']); del body['preparation']['canonicalText']
    incomplete['canonicalText'] = canonical(body); incomplete['sha256'] = sha(incomplete['canonicalText'])
    sql('SET ROLE postgres;' + insertion(incomplete), error='check constraint')
    checks.append('missing preparation text fails closed rather than passing NULL CHECK')
    pending = alter(plan, adoptionId=str(uuid.uuid4()), grantId=str(uuid.uuid4()))
    sql('SET ROLE postgres;BEGIN;' + insertion(pending) + 'ROLLBACK;')
    assert sql('SET ROLE postgres;SELECT count(*) FROM otr_auth_guest_composite.sealed_stages;') == '1'
    checks.append('stage insert rolls back without creating a durable partial record')
    denied_roles, absent_roles = [], []
    for role in ('anon','authenticated','service_role','otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway'):
        if sql('SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=' + quote(role) + ');') != 't':
            absent_roles.append(role)
            continue
        result = docker('exec','-i',NAME,'psql','-XqAt','-U','supabase_admin','-d',DATABASE,'-v','ON_ERROR_STOP=1',
                        input='SET ROLE ' + role + ';SELECT plan_text FROM otr_auth_guest_composite.sealed_stages;')
        assert result.returncode and 'permission denied' in result.stderr, 'ROLE_REJECTION_FAILED:' + role + ':' + result.stderr[:300]
        denied_roles.append(role)
    checks.append('existing local roles denied staging read: ' + ','.join(denied_roles))
    checks.append('fixture lacks roles (not created or claimed tested): ' + ','.join(absent_roles))
    assert sql('SELECT relrowsecurity AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid) FROM pg_class c WHERE c.oid=\'otr_auth_guest_composite.sealed_stages\'::regclass;') == 't'
    assert sql(roles, database='postgres') == before
    checks.append('RLS enabled with no policy; existing Gateway/Writer role attributes unchanged')
    race_id = str(uuid.uuid4())
    left = alter(plan, adoptionId=race_id, grantId=str(uuid.uuid4()))
    right = alter(plan, adoptionId=race_id, grantId=str(uuid.uuid4()), targetAccountId=str(uuid.uuid4()))
    with ThreadPoolExecutor(max_workers=2) as pool:
        runs = [pool.submit(sql, 'SET ROLE postgres;' + insertion(p)) for p in (left, right)]
        for run in runs: run.result()
    assert sql('SET ROLE postgres;SELECT count(*) FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id=' + quote(race_id) + '::uuid;') == '1'
    checks.append('concurrent cross-Account same-adoption inserts retain exactly one immutable stage')
    drafts_plan = generated_plans['drafts']
    sql('SET ROLE postgres;' + insertion(drafts_plan))
    draft_actor = json.loads(drafts_plan['canonicalText'])['grant']['targetAccountId']
    retained = json.loads(sql('SET ROLE postgres;SELECT to_jsonb(plan_text) FROM otr_auth_guest_composite.sealed_stages WHERE actor_account_id=' + quote(draft_actor) + '::uuid;'))
    assert retained == drafts_plan['canonicalText']
    prepared = json.loads(json.loads(retained)['preparation']['canonicalText'])
    assert len(prepared['drafts']) == 3
    assert json.loads(prepared['drafts'][0]['canonicalText'])['fields']['title'] == '  未提交 Å  '
    assert len(prepared['tripIds']) == 1
    checks.append('version2 exact P1/Trip Create/Edit draft bytes survive independent PG read without creating a Trip shell')
    result = {'status':'LOCAL_PRIVATE_STAGE_PG_PASS_NOT_AUTHORITY_OR_ADOPTION', 'checks':checks,
              'network':'none', 'hostedWrites':0, 'providerCalls':0, 'businessTripWrites':0,
              'candidateSha256':sha(candidate), 'testCount':len(checks)}
    (HERE/'STAGING_LOCAL_PG_RESULT.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result))
finally:
    docker('rm', '-f', '-v', NAME)
