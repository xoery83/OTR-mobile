"""Reuse the accepted sustained P1 fixture for P3, network-none and synthetic only."""
import hashlib
import re
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='otr-manual-p3-pg-') as folder:
    private = pathlib.Path(folder)
    source = (ROOT / 'scripts/trip/trip-sustained-sync-acceptance.py').read_text()
    # Keep its exact owning schema/bootstrap/CreateTrip setup; omit later tests/rollback-file generation.
    prefix = source[:source.index(" changed={**req,'name':'collision'}")]
    prefix = prefix.replace("ROOT=pathlib.Path(__file__).resolve().parents[2]", 'ROOT=pathlib.Path(' + repr(str(ROOT)) + ')')
    prefix = prefix.replace("packet=ROOT/'docs/ops/trip-p1-sustained-sync-20261024'", 'packet=pathlib.Path(' + repr(str(private)) + ')')
    install = ROOT / 'supabase/dev-forward/manual-cloud/20261028000100_manual_p3_dev.sql'
    # Original definitions are retained inside the rollback; use them to align the disposable clone only.
    rollback = (install.with_name('20261028000100_manual_p3_dev.rollback.sql')).read_text()
    originals = rollback[rollback.index('CREATE OR REPLACE FUNCTION'):rollback.rindex('COMMIT;')]
    fixture = (ROOT / 'scripts/trip/sustained-p1-owned-fixture.mts').read_text()
    fixture = fixture.replace('"../../', '"' + str(ROOT) + '/')
    fixture = fixture.replace('["P1"]);', '["P1", "P3"]);')
    fixture = fixture.replace('  "SET_ITEM_PARTICIPATION",\n]);', '  "SET_ITEM_PARTICIPATION",\n  "SET_STAY_DETAILS",\n]);')
    fixture = fixture.replace('family: "P1",', 'family: "P3",').replace('schedule: { start: coreDateBoundary("2026-11-02") },', 'schedule: { start: coreDateBoundary("2026-11-02"), end: coreDateBoundary("2026-11-04") },').replace('{ schedule: { start: coreDateBoundary("2026-11-03") } },', '{ schedule: { start: coreDateBoundary("2026-11-03"), end: coreDateBoundary("2026-11-05") } },')
    fixture = fixture.replace('const collection = await reader.collection', 'await execute("SET_STAY_DETAILS", { details: { property_name: "QA Stay edited" }, rooms: [] }, 5);\nconst collection = await reader.collection')
    fixture = fixture.replace('row.semantic_revision, 5', 'row.semantic_revision, 6').replace('ISOLATED_PG_P1_PASS_NOT_DEV_OR_NATIVE', 'ISOLATED_PG_P3_PASS_NOT_DEV_OR_NATIVE')
    fixture = fixture.replace('checks.push("owning full collection', 'assert.equal(verified.graph.trip_stay_details.find((detail) => detail.event_id === item)?.property_name, "QA Stay edited");\nchecks.push("owning full collection')
    fixture = fixture.replace('const wrong = await reader.capabilities', r"""
for (const missing of ["family", "admission"] as const) {
  await assert.rejects(connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true),set_config('otr.core.operation',$3,true),set_config('otr.core.target_item',$4,true),set_config('otr.core.command','SET_STAY_DETAILS',true)", [actor,trip,randomUUID(),item]);
    if (missing !== "family") await lease.query("SELECT set_config('otr.core.family','P3',true)");
    if (missing !== "admission") await lease.query("SELECT set_config('otr.core.admission','MANUAL',true)");
    await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
    await lease.query("UPDATE public.trip_core_read_state SET revision=revision+1 WHERE trip_id=$1::uuid",[trip]);
  }), /CORE_V2_CAPABILITY_CLOSED/);
}
await assert.rejects(connection.withLease(async (lease) => {
  await lease.query("BEGIN");
  await lease.query("SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true),set_config('otr.core.operation',$3,true),set_config('otr.core.target_item',$4,true),set_config('otr.core.command','CREATE_ITEM',true),set_config('otr.core.admission','MANUAL',true)",[actor,trip,randomUUID(),item]);
  await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
  await lease.query("INSERT INTO public.trip_core_command_receipts SELECT * FROM public.trip_core_command_receipts WHERE trip_id=$1::uuid LIMIT 1",[trip]);
}), /CORE_V2_CAPABILITY_CLOSED/);
checks.push("missing family/admission cannot write read-state or receipts");
const wrong = await reader.capabilities""")
    fixture = fixture.replace('edited P1 revision 5', 'edited P3 revision 6').replace('cross-Account P1', 'cross-Account P3')
    fixture_path = private / 'p3.mts'
    fixture_path.write_text(fixture)
    suffix = r'''
 sql("CREATE FUNCTION public.trip_sustained_import_p1_capabilities(uuid,uuid) RETURNS TABLE(runtime_enabled boolean,enabled_commands text[],enabled_families text[],enabled_admission_modes text[]) LANGUAGE sql AS 'SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[]';")
 sql('set role postgres;'+ORIGINALS)
 candidate=CANDIDATE.read_text().replace('3f7e964e-79d3-4028-a585-470e798e41ec',ACTOR)
 identities=sql("select jsonb_agg(jsonb_build_object('oid',oid,'name',proname,'owner',proowner,'acl',proacl) order by oid) from pg_proc where oid in ('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure,'public.trip_sustained_core_capabilities(uuid,uuid)'::regprocedure,'public.trip_core_guard_write()'::regprocedure,'public.trip_core_finite_read_state_guard()'::regprocedure);")
 sql('set role postgres;'+candidate)
 node=subprocess.run([str(ROOT/'node_modules/.bin/tsx'),str(FIXTURE),NAME,ACTOR,TRIP,create_id],cwd=ROOT,capture_output=True,text=True,timeout=90)
 assert node.returncode==0,node.stdout+node.stderr
 print(node.stdout.strip())
 check('P3 exact replay, same-ID edits, Accepted Reader and cross-Account denial')
 rollback=CANDIDATE.with_name('20261028000100_manual_p3_dev.rollback.sql').read_text()
 import re,hashlib
 for block in re.findall(r'CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$[\s\S]*?\$function\$',candidate):
  name=re.search(r'FUNCTION public\.(\w+)',block)[1]
  sig=name+'(uuid,uuid)' if name=='trip_sustained_core_capabilities' else name+'(uuid,uuid,uuid,text)' if name=='trip_sustained_dev_scope_allowed' else name+'()'
  pattern=r"(pg_get_functiondef\('public\."+re.escape(sig)+r"'::regprocedure\)\) <> ')[0-9a-f]{32}"
  rollback=re.sub(pattern,lambda m:m[1]+hashlib.md5((block+'\n').encode()).hexdigest(),rollback)
 count_before=sql("select count(*) from public.itinerary_events where trip_id="+literal(TRIP)+";")
 sql('set role postgres;'+rollback)
 check('rollback retains P3 accepted facts',sql("select count(*) from public.itinerary_events where trip_id="+literal(TRIP)+";")==count_before)
 check('function OID owner ACL preserved',identities==sql("select jsonb_agg(jsonb_build_object('oid',oid,'name',proname,'owner',proowner,'acl',proacl) order by oid) from pg_proc where oid in ('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure,'public.trip_sustained_core_capabilities(uuid,uuid)'::regprocedure,'public.trip_core_guard_write()'::regprocedure,'public.trip_core_finite_read_state_guard()'::regprocedure);"))
 print(json.dumps({'checks':checks,'network':'none','devTouched':False}))
finally:
 if created:docker('rm','-f',NAME,check=False)
'''
    code = 'ORIGINALS=' + repr(originals) + '\nCANDIDATE=__import__("pathlib").Path(' + repr(str(install)) + ')\nFIXTURE=' + repr(str(fixture_path)) + '\n' + prefix + suffix
    harness = private / 'run.py'
    harness.write_text(code)
    result = subprocess.run(['python3', str(harness)], cwd=ROOT, capture_output=True, text=True, timeout=180)
    print(result.stdout)
    if result.returncode:
        raise RuntimeError(result.stderr[-8000:])
