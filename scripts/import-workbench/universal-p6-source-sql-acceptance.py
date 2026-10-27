"""P6 Source/Core in one existing, network-none 256 MiB synthetic PG fixture; no hosted access."""
import pathlib,os
ROOT=pathlib.Path(__file__).resolve().parents[2]
fixture_root=pathlib.Path(os.environ['OTR_UNIVERSAL_EXISTING_SQL_FIXTURE_ROOT']).resolve()
base=fixture_root/'scripts/trip/trip-sustained-sync-acceptance.py'
source=base.read_text();cut=source.index("\n check('normal V2 Create accepts future Trip/op")
source=source[:cut]+'''
 sql("ALTER TABLE public.trip_source_runs ADD COLUMN capture_batch_id uuid,ADD COLUMN interpretation_task_id uuid,ADD COLUMN capture_submission_sha256 text;")
 sql('set role postgres;'+(MAIN_ROOT/'backend/sql/universal_p1_source_admission_candidate.sql').read_text())
 packet_root=MAIN_ROOT/'docs/ops/universal-p2-formal-save-20261027'
 pre=json.loads((packet_root/'P2_REVIEW_FUNCTION_PREIMAGES.json').read_text())
 sql('set role postgres;'+';\\n'.join(r['definition'] for r in pre.values())+';')
 # Exact current root guard and dormant resolver are fixture setup, not additional candidate modifications.
 sql('set role postgres;'+(packet_root/'P2_CORE_WRITE_GUARD_PREIMAGE.sql').read_text())
 sql('set role postgres;'+(packet_root/'P2_AIRPORT_DORMANT_INSTALL.sql').read_text())
 sql('set role postgres;'+';\\n'.join(r for r in json.loads((packet_root/'P2_REVIEW_FUNCTION_POSTIMAGES.json').read_text()).values())+';')
 packet_root=MAIN_ROOT/'docs/ops/universal-p5-formal-save-20261028'
 sql('set role postgres;'+';\\n'.join(row for row in json.loads((packet_root/'P5_FUNCTION_POSTIMAGES.json').read_text()).values())+';')
 packet_root=MAIN_ROOT/'docs/ops/universal-p6-formal-save-20261028'
 pre=json.loads((packet_root/'P6_FUNCTION_PREIMAGES.json').read_text())
 sql('set role postgres;'+';\\n'.join(row['definition'] for row in pre.values())+';')
 before=sql("select jsonb_agg(jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl) order by oid) from pg_proc where oid=any(ARRAY["+','.join(literal('public.'+sig)+'::regprocedure::oid' for sig in pre)+"]);")
 sql('set role postgres;'+(packet_root/'P6_DEV_INSTALL.sql').read_text())
 sql('set role postgres;'+(packet_root/'P6_DEV_INSTALL.sql').read_text(),failure='P6_FUNCTION_DRIFT')
 sql('set role postgres;'+(packet_root/'P6_DEV_ROLLBACK.sql').read_text())
 for sig,row in pre.items():
  assert sql('select md5(pg_get_functiondef('+literal('public.'+sig)+'::regprocedure));')==row['md5']
 check('exact three-function reverse-hash rollback restores actual DEV preimages')
 sql('set role postgres;'+(packet_root/'P6_DEV_INSTALL.sql').read_text())
 after=sql("select jsonb_agg(jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl) order by oid) from pg_proc where oid=any(ARRAY["+','.join(literal('public.'+sig)+'::regprocedure::oid' for sig in pre)+"]);")
 assert before==after
 check('P6 candidate preserves all three OIDs owners and ACLs')
 import os
 env={**os.environ,'OTR_UNIVERSAL_P6_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_FIXTURE_ACTOR':ACTOR,'OTR_UNIVERSAL_P1_FIXTURE_TRIP':TRIP}
 result=subprocess.run([str(MAIN_ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','backend/src/universalP1SourcePg.sql.test.ts'],cwd=MAIN_ROOT,env=env,capture_output=True,text=True,timeout=240)
 print(result.stdout);assert result.returncode==0,result.stdout+result.stderr
 check('actual owning P6 publication Source Plan Core receipt finalization replay')
 print(json.dumps({'status':'P6_SOURCE_ISOLATED_PG_PASS_NOT_DEV','network':'none','memory':'256m','count':len(checks),'checks':checks}))
'''+source[source.index('\nfinally:'):]
source=source.replace("ACTOR,OTHER,TRIP=[str(uuid.uuid4()) for _ in range(3)]","ACTOR='f4b059c5-8241-4ffb-aa15-37fa25474543';OTHER=str(uuid.uuid4());TRIP='825f79b2-4a9d-4535-a62e-43000ca50c4a'")
source=source.replace("packet=ROOT/'docs/ops/trip-p1-sustained-sync-20261024'","packet=pathlib.Path('/private/tmp')/('otr-p6-source-fixture-'+uuid.uuid4().hex[:12])")
source=source.replace("ROOT=pathlib.Path(__file__).resolve().parents[2]",'ROOT=pathlib.Path('+repr(str(fixture_root))+')')
source=source.replace("'--network','none','-d',IMAGE","'--network','none','--memory','256m','--cpus','1','-d',IMAGE")
exec(compile(source,str(base),'exec'),{'__file__':str(base),'__name__':'__main__','MAIN_ROOT':ROOT})
