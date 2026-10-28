"""New continuous Sparse P2 with fresh synthetic identities in existing network-none PG.
No Hosted call, model send, installed policy or real QA data mutation.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
base=ROOT/'scripts/import-workbench/universal-p6-source-sql-acceptance.py'
source=base.read_text()
start=source.index(' import os\n env=')
end=source.index("\n'''+source[source.index",start)
body=r'''
 candidate=json.loads((MAIN_ROOT/'docs/ops/universal-product-20261028/authority/CONTINUOUS_REVIEW_POSTIMAGES_CANDIDATE.json').read_text())
 native_dependencies=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/NATIVE_P3_DEPENDENCY_BASELINE.sql').read_text()
 sql('set role postgres;'+native_dependencies)
 check('Native four-function approved P3 dependency postimage loaded for compatibility')
 native=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/NATIVE_READ_STATE_BASELINE.sql').read_text()
 sql('set role postgres;'+native+';')
 installer=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/CONTINUOUS_REVIEW_INSTALL_CANDIDATE.sql').read_text()
 bad_installer=installer.replace('9f01606ec37c03662c7d9d828cae9ef9','0'*32,1)
 assert bad_installer!=installer
 sql('set role postgres;'+bad_installer,failure='CONTINUOUS_POSTIMAGE_DRIFT')
 check('failed postimage check rolls back all function replacements')
 sql('set role postgres;'+installer)
 sql('set role postgres;'+installer,failure='CONTINUOUS_PREIMAGE_DRIFT')
 check('closed installer verifies full preimages postimages owner ACL and unchanged OIDs; repeated install fails closed')
 # No new airport records or date/issuer scope; only original two disabled identities exist.
 check('P2 registry defaults disabled',sql("SELECT count(*) FROM public.trip_core_airport_identities WHERE registry_version='otr-dev-universal-p2-airports/20261027/1' AND enabled;")=='0')

 # Bring the older disposable fixture's policy columns up to the already-observed DEV intake shape.
 sql('set role postgres;ALTER TABLE public.trip_sustained_dev_policy ADD COLUMN IF NOT EXISTS universal_import_enabled boolean NOT NULL DEFAULT true;')
 activate=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/CONTINUOUS_POLICY_ACTIVATE_CANDIDATE.sql').read_text()
 close=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/CONTINUOUS_POLICY_CLOSE_CANDIDATE.sql').read_text()
 sql('set role postgres;'+activate)
 sql('set role postgres;'+activate,failure='CONTINUOUS_REQUIRES_CLOSED_POLICY')
 check('exact continuous activation is one CAS from closed, not a repeated rearm')
 sql('set role postgres;'+close)
 sql('set role postgres;'+close)
 assert sql("SELECT universal_import_enabled AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543';")=='t'
 assert sql("SELECT count(*) FROM public.trip_core_airport_identities WHERE registry_version='otr-dev-universal-p2-airports/20261027/1' AND enabled;")=='0'
 check('close is idempotent, disables Save/airports, and preserves existing Source intake')
 sql("set role postgres;UPDATE public.trip_sustained_dev_policy SET universal_p1_review_scope=jsonb_build_object('mode','OTHER') WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543';")
 sql('set role postgres;'+close,failure='CONTINUOUS_CLOSE_SCOPE_DRIFT')
 sql("set role postgres;UPDATE public.trip_sustained_dev_policy SET universal_p1_review_scope=NULL WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543';")
 check('close does not overwrite a different owning scope')

 native=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/NATIVE_READ_STATE_BASELINE.sql').read_text()
 read_state=candidate['trip_core_finite_read_state_guard()']
 assert "'CORE_P3'" in native and "'CORE_P3'" in read_state and "IS NOT DISTINCT FROM 'SET_STAY_DETAILS'" in read_state
 check('Native fixed P3 read-state arm retained')
 import os
 env={**os.environ,'OTR_UNIVERSAL_P2_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_CONTINUOUS_P2_SQL_FIXTURE':NAME}
 result=subprocess.run([str(MAIN_ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','--maxWorkers=1','backend/src/universalP2SourcePg.sql.test.ts'],cwd=MAIN_ROOT,env=env,capture_output=True,text=True,timeout=150)
 print(result.stdout);assert result.returncode==0,result.stdout+result.stderr
 check('fresh non-Batch9 P2 uses normal reviewed Source Plan Core receipt closed recovery and replay')
 print(json.dumps({'status':'CONTINUOUS_P2_PG_PASS_NOT_DEV','network':'none','memory':'256m','checks':checks}))
'''
source=source[:start]+body+source[end:]
exec(compile(source,str(base),'exec'),{'__file__':str(base),'__name__':'__main__'})
