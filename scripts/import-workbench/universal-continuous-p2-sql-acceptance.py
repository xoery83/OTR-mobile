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
 sql('set role postgres;'+';\\n'.join(candidate.values())+';')
 # No new airport records or date/issuer scope; only original two disabled identities exist.
 check('P2 registry defaults disabled',sql("SELECT count(*) FROM public.trip_core_airport_identities WHERE registry_version='otr-dev-universal-p2-airports/20261027/1' AND enabled;")=='0')
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
