"""P3 owning Source/Core qualification in an owned network-none disposable PG fixture."""
import pathlib, os
ROOT=pathlib.Path(__file__).resolve().parents[2]
fixture_root=pathlib.Path(os.environ['OTR_UNIVERSAL_EXISTING_SQL_FIXTURE_ROOT']).resolve()
base=fixture_root/'scripts/trip/trip-sustained-sync-acceptance.py'
source=base.read_text()
cut=source.index('\n sql("update public.trip_sustained_dev_policy set enabled=false,revoked_at=clock_timestamp() where actor_account_id=')
end=source.index('\nfinally:')
source=source[:cut]+'''
 sql("ALTER TABLE public.trip_source_runs ADD COLUMN capture_batch_id uuid,ADD COLUMN interpretation_task_id uuid,ADD COLUMN capture_submission_sha256 text;")
 sql('set role postgres;'+(ROOT/'backend/sql/universal_p1_source_admission_candidate.sql').read_text())
 packet_root=MAIN_ROOT/'docs/ops/universal-p3-formal-save-20261026'
 post=json.loads((packet_root/'P3_REVIEW_FUNCTION_POSTIMAGES.json').read_text())
 pre=json.loads((packet_root/'P3_REVIEW_FUNCTION_PREIMAGES.json').read_text())
 sql('set role postgres;'+';\\n'.join(pre.values())+';')
 acl_before=sql("select jsonb_agg(jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl) order by oid) from pg_proc where oid in ('public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure,'public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure,'public.trip_core_guard_historical_source_association()'::regprocedure);")
 sql('set role postgres;'+(packet_root/'P3_REVIEW_DEV_INSTALL.sql').read_text())
 sql('set role postgres;'+(packet_root/'P3_REVIEW_DEV_INSTALL.sql').read_text(),failure='P3_FUNCTION_DRIFT')
 sql('set role postgres;'+(packet_root/'P3_REVIEW_DEV_ROLLBACK.sql').read_text())
 import hashlib
 for key,signature in {'capabilities':'trip_sustained_import_p1_capabilities(uuid,uuid)','guard':'trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)','association':'trip_core_guard_historical_source_association()'}.items():
  assert sql("select md5(pg_get_functiondef("+literal('public.'+signature)+"::regprocedure));")==hashlib.md5(pre[key].encode()).hexdigest()
 check('exact packaged installer/rollback restore all function preimages; repeated install drift rejected')
 sql('set role postgres;'+(packet_root/'P3_REVIEW_DEV_INSTALL.sql').read_text())
 assert acl_before==sql("select jsonb_agg(jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl) order by oid) from pg_proc where oid in ('public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure,'public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure,'public.trip_core_guard_historical_source_association()'::regprocedure);")
 check('function owners and ACL unchanged by package')
 import os
 env={**os.environ,'OTR_UNIVERSAL_P3_OWNED_SQL_FIXTURE':'1','OTR_UNIVERSAL_P1_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_FIXTURE_ACTOR':ACTOR,'OTR_UNIVERSAL_P1_FIXTURE_TRIP':TRIP}
 result=subprocess.run([str(MAIN_ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','backend/src/universalP1SourcePg.sql.test.ts'],cwd=MAIN_ROOT,env=env,capture_output=True,text=True,timeout=180)
 print(result.stdout);assert result.returncode==0,result.stdout+result.stderr
 check('P3 owning Review/Source Plan/Core receipt/association/idempotency actual PG fixture')
 print(json.dumps({'status':'P3_SOURCE_ISOLATED_SQL_PASS_NOT_DEV','network':'none','checks':checks,'count':len(checks)}))
'''+source[end:]
source=source.replace("packet=ROOT/'docs/ops/trip-p1-sustained-sync-20261024'","packet=pathlib.Path('/private/tmp')/('otr-p3-source-fixture-preimage-'+uuid.uuid4().hex[:12])")
source=source.replace("ROOT=pathlib.Path(__file__).resolve().parents[2]",'ROOT=pathlib.Path('+repr(str(fixture_root))+')')
exec(compile(source,str(base),'exec'),{'__file__':str(base),'__name__':'__main__','MAIN_ROOT':ROOT})
