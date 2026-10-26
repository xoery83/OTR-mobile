"""Disposable network-none PG qualification. No DEV/Auth/Provider/Native activity."""
import pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
base=ROOT/'scripts/trip/trip-sustained-sync-acceptance.py'
source=base.read_text()
cut=source.index('\n sql("update public.trip_sustained_dev_policy set enabled=false,revoked_at=clock_timestamp() where actor_account_id=')
end=source.index('\nfinally:')
source=source[:cut]+'''
 # These three Run columns already belong to accepted Stage I; fixture prerequisites only.
 sql("ALTER TABLE public.trip_source_runs ADD COLUMN capture_batch_id uuid,ADD COLUMN interpretation_task_id uuid,ADD COLUMN capture_submission_sha256 text;")
 sql('set role postgres;'+(ROOT/'backend/sql/universal_p1_source_admission_candidate.sql').read_text())
 import os
 env={**os.environ,'OTR_UNIVERSAL_P1_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_FIXTURE_ACTOR':ACTOR,'OTR_UNIVERSAL_P1_FIXTURE_TRIP':TRIP}
 result=subprocess.run([str(ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','backend/src/universalP1SourcePg.sql.test.ts'],cwd=ROOT,env=env,capture_output=True,text=True,timeout=120)
 print(result.stdout);assert result.returncode==0,result.stdout+result.stderr
 check('P1 owning Source candidate/plan/Core receipt/association/recovery/negative provenance actual PG fixture')
 # Rehearse the exact packaged DDL/ACL rollback on this synthetic fixture only.
 packet_root=ROOT/'docs/ops/universal-stage2-20261025/actual-execution/resume-20261026'
 scope=json.loads(sql("select universal_p1_review_scope from public.trip_sustained_dev_policy where actor_account_id="+literal(ACTOR)+";"))
 retained=sql("select count(*) from public.trip_source_core_v2_candidates;")
 rollback=(packet_root/'P1_REVIEW_ROLLBACK.sql').read_text().replace('f4b059c5-8241-4ffb-aa15-37fa25474543',ACTOR).replace('44e7b9b4-c46d-83f4-8ad1-2c5fd08f4a67',scope['candidateId'])
 sql('set role postgres;'+rollback)
 import hashlib
 saved=json.loads((packet_root/'P1_REVIEW_DEV_PREIMAGE.json').read_text())
 for f in saved['functions']:
  if f['signature'] in ('trip_core_guard_write()','trip_core_guard_historical_source_association()'):
   assert sql("select md5(pg_get_functiondef("+literal('public.'+f['signature'])+"::regprocedure));")==hashlib.md5(f['definition'].encode()).hexdigest()
 check('packaged rollback restores exact saved DEV Core/Source guard definitions')
 check('rollback removes only new P1 columns/functions',sql("select count(*) from pg_attribute where attrelid='public.trip_sustained_dev_policy'::regclass and attname in ('universal_p1_import_enabled','universal_p1_review_scope') and not attisdropped;")=='0' and sql("select to_regprocedure('public.trip_sustained_import_p1_capabilities(uuid,uuid)') is null;")=='t')
 check('rollback restores prior Source association ACL',sql("select relacl::text from pg_class where oid='public.trip_source_associations'::regclass;")==saved['relations'][0]['acl'])
 check('rollback retains all immutable candidate/business evidence',sql("select count(*) from public.trip_source_core_v2_candidates;")==retained)
 # A concurrent legitimate Writer grant must reject the actual deployment packet before DDL.
 sql('set role postgres;GRANT SELECT ON public.trip_source_associations TO otr_trip_core_v2_writer;')
 sql('set role postgres;'+(packet_root/'P1_REVIEW_DEV_INSTALL.sql').read_text(),failure='P1_REVIEW_ACL_DRIFT')
 check('atomic exact DEV installer rejects ACL drift before any P1 DDL',sql("select count(*) from pg_attribute where attrelid='public.trip_sustained_dev_policy'::regclass and attname in ('universal_p1_import_enabled','universal_p1_review_scope') and not attisdropped;")=='0')
 sql('set role postgres;REVOKE SELECT ON public.trip_source_associations FROM otr_trip_core_v2_writer;')
 check('ACL drift negative test leaves original association ACL unchanged',sql("select relacl::text from pg_class where oid='public.trip_source_associations'::regclass;")==saved['relations'][0]['acl'])
 print(json.dumps({'status':'P1_SOURCE_ISOLATED_SQL_PASS_NOT_DEV_OR_PROVIDER','network':'none','checks':checks,'count':len(checks)}))
'''+source[end:]
source=source.replace("packet=ROOT/'docs/ops/trip-p1-sustained-sync-20261024'","packet=pathlib.Path('/private/tmp')/('otr-p1-source-fixture-preimage-'+uuid.uuid4().hex[:12])")
exec(compile(source,str(base),'exec'),{'__file__':str(base),'__name__':'__main__'})
