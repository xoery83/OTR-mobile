"""Only isolated network-none PG: accepted Native postimages and existing Import authority."""
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
compatibility = r'''
 import hashlib,re
 before=sql("SELECT oid::text||':'||proowner::text||':'||coalesce(proacl::text,'') FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure;")
 sql('SET ROLE postgres;'+(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/FULL_MONTH_REVIEW_INSTALL_CANDIDATE.sql').read_text())
 native_commit='081198f01eef32cba96f0311ad66ca46d5e67050'
 def native_file(path):
  return subprocess.run(['git','show',native_commit+':'+path],cwd=MAIN_ROOT,capture_output=True,text=True,check=True).stdout
 p5=native_file('supabase/dev-forward/manual-cloud/20261029000100_manual_p5_dev.sql')
 assert hashlib.sha256(p5.encode()).hexdigest()=='fa16c2fc575543c1184101e3187b3dc999c95212e933504c1d713543b4b5df04'
 definitions=re.findall(r'CREATE OR REPLACE FUNCTION .*?[$]function[$];',p5,re.S)
 assert len(definitions)==5
 # Fixture setup only: load exact approved Native definitions, never execute its live installer.
 sql('SET ROLE postgres;'+chr(10).join(definitions))
 post=native_file('docs/ops/manual-cloud-e2e-20261028/p6-additive-after-p5/postimages.json')
 assert hashlib.sha256(post.encode()).hexdigest()=='c1fdc432d4e6d6abf48f17e2049f95bc36cd429e8c43218102a89cfda168a4d1'
 for row in json.loads(post):
  sql('SET ROLE postgres;'+row['definition'])
  assert sql('SELECT md5(pg_get_functiondef('+literal('public.'+row['signature'])+'::regprocedure));')==row['md5']
 assert before==sql("SELECT oid::text||':'||proowner::text||':'||coalesce(proacl::text,'') FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure;")
 check('accepted additive Native P5/P6 read-state retains OID Owner ACL')
 old=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/FULL_MONTH_POLICY_ACTIVATE_CANDIDATE.sql').read_text()
 sql('SET ROLE postgres;'+old,failure='CONTINUOUS_FUNCTION_DRIFT')
 compatible=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/CONTINUOUS_POLICY_ACTIVATE_NATIVE_P5_P6_CANDIDATE.sql').read_text()
 assert compatible==old.replace('f1378cb07c1f1882651a558dbe612909','20c7bc156f4d80aac889b7ed8f52ce0a')
 activate=compatible
 check('activation changes only read-state CAS; all scope limits and close remain unchanged')
'''
source = source.replace(needle, addition + compatibility + needle)
extra = r'''
 for family in ['P5','P6']:
  if sql("SELECT md5(pg_get_functiondef('public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure));")=='488f5fe1537d450b610ef7c5e22eb53b':
   sql('SET ROLE postgres;'+(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/FULL_MONTH_REVIEW_INSTALL_CANDIDATE.sql').read_text())
  env={**os.environ,'OTR_UNIVERSAL_FULL_MONTH_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_CONTINUOUS_REVIEW_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_'+family+'_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_FIXTURE_ACTOR':ACTOR,'OTR_UNIVERSAL_P1_FIXTURE_TRIP':TRIP}
  result=subprocess.run([str(MAIN_ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','--maxWorkers=1','backend/src/universalP1SourcePg.sql.test.ts'],cwd=MAIN_ROOT,env=env,capture_output=True,text=True,timeout=150)
  print(result.stdout);assert result.returncode==0,result.stdout+result.stderr
  check('reviewed Source '+family+' Save receipt closed recovery replay with accepted Native union')
'''
needle = " print(json.dumps({'status':'CONTINUOUS_P2_PG_PASS_NOT_DEV'"
assert source.count(needle) == 1
if os.environ.get('OTR_UNIVERSAL_P2_MULTI_SOURCE_SQL') != '1':
    source = source.replace(needle, extra + needle)
exec(compile(source, str(base), 'exec'), {'__file__': str(base), '__name__': '__main__'})
