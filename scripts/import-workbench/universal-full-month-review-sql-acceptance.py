# Existing network-none/256MiB fixture; no Hosted connection or model call.
import ast
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ['OTR_UNIVERSAL_EXISTING_SQL_FIXTURE_ROOT'] = str(ROOT)
base = ROOT / 'scripts/import-workbench/universal-continuous-p2-sql-acceptance.py'
source = base.read_text()
native = ast.parse((ROOT / 'scripts/import-workbench/universal-continuous-native-p4-sql-acceptance.py').read_text())
addition = next(ast.literal_eval(n.value) for n in native.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'addition' for t in n.targets))
needle = " sql('set role postgres;'+activate)"
assert source.count(needle) == 1
source = source.replace(needle, addition + needle)
start = source.index(' import os\n env=')
end = source.index("\n'''", start)
body = r'''
 import os
 delta=json.loads((MAIN_ROOT/'docs/ops/universal-product-20261028/authority/FULL_MONTH_REVIEW_DELTA.json').read_text())
 install=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/FULL_MONTH_REVIEW_INSTALL_CANDIDATE.sql').read_text()
 reverse=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/FULL_MONTH_REVIEW_ROLLBACK_CANDIDATE.sql').read_text()
 signature=delta['signature']
 def fingerprint():
  return sql("SELECT oid::text||':'||proowner::text||':'||coalesce(proacl::text,'') FROM pg_proc WHERE oid="+literal(signature)+"::regprocedure;")
 metadata=fingerprint()
 env={**os.environ,'OTR_UNIVERSAL_P1_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P6_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_CONTINUOUS_REVIEW_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_FULL_MONTH_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_FIXTURE_ACTOR':ACTOR,'OTR_UNIVERSAL_P1_FIXTURE_TRIP':TRIP}
 def run_case():
  return subprocess.run([str(MAIN_ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','--maxWorkers=1','backend/src/universalP1SourcePg.sql.test.ts'],cwd=MAIN_ROOT,env=env,capture_output=True,text=True,timeout=150)
 red=run_case()
 print('FULL_MONTH_OWNING_PG_RED',red.stdout)
 assert red.returncode != 0 and 'P1_SOURCE_EVIDENCE_INVALID' in red.stdout+red.stderr,red.stdout+red.stderr
 check('actual installed guard rejects full-month original at owning candidate evidence INSERT before any Item')
 sql("SET ROLE postgres;UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false,universal_p1_review_scope=NULL WHERE actor_account_id="+literal(ACTOR)+"::uuid;UPDATE public.trip_core_airport_identities SET enabled=false WHERE registry_version='otr-dev-universal-p2-airports/20261027/1';")
 bad=install.rsplit(delta['afterMd5'],1)
 sql('SET ROLE postgres;'+bad[0]+'0'*32+bad[1],failure='FULL_MONTH_POSTIMAGE_DRIFT')
 assert sql('SELECT md5(pg_get_functiondef('+literal(signature)+'::regprocedure));')==delta['beforeMd5']
 check('failed postimage transaction restores original function atomically')
 sql('SET ROLE postgres;'+install)
 assert fingerprint()==metadata
 assert sql('SELECT md5(pg_get_functiondef('+literal(signature)+'::regprocedure));')==delta['afterMd5']
 sql('SET ROLE postgres;'+install,failure='FULL_MONTH_FUNCTION_DRIFT')
 check('single-function exact CAS install preserves OID Owner ACL and denies repeat installation')
 compatible=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/FULL_MONTH_POLICY_ACTIVATE_CANDIDATE.sql').read_text()
 sql('SET ROLE postgres;'+compatible)
 sql('SET ROLE postgres;'+compatible,failure='CONTINUOUS_REQUIRES_CLOSED_POLICY')
 sql('SET ROLE postgres;'+close)
 check('new guard hash activation retains exact scope expiry and idempotent close')
 green=run_case()
 print('FULL_MONTH_OWNING_PG_GREEN',green.stdout)
 assert green.returncode==0,green.stdout+green.stderr
 check('full-month Source Review Plan Admission Core receipt closed recovery replay and protected rollback PASS')
 assert fingerprint()==metadata
 assert sql('SELECT md5(pg_get_functiondef('+literal(signature)+'::regprocedure));')==delta['beforeMd5']
 assert sql("SELECT md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure));")=='f1378cb07c1f1882651a558dbe612909'
 sql('SET ROLE postgres;'+install)
 sql('SET ROLE postgres;'+reverse)
 assert fingerprint()==metadata
 check('reverse hash rollback retains accepted Item and Native P4 read-state OID Owner ACL')
 print(json.dumps({'status':'FULL_MONTH_SOURCE_PG_PASS_NOT_DEV','network':'none','memory':'256m','checks':checks}))
'''
source = source[:start] + body + source[end:]
exec(compile(source, str(base), 'exec'), {'__file__': str(base), '__name__': '__main__'})
