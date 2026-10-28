"""Verify Native-approved P4 precondition compatibility in the existing isolated PG fixture."""
from pathlib import Path
import os
ROOT = Path(__file__).resolve().parents[2]
os.environ['OTR_UNIVERSAL_EXISTING_SQL_FIXTURE_ROOT'] = str(ROOT)
base = ROOT / 'scripts/import-workbench/universal-continuous-p2-sql-acceptance.py'
source = base.read_text()
needle = " sql('set role postgres;'+activate)"
assert source.count(needle) == 1
addition = r'''
 import hashlib
 native_p4=(MAIN_ROOT/'supabase/dev-forward/manual-cloud/20261028000200_manual_p4_dev.sql').read_text()
 assert hashlib.sha256(native_p4.encode()).hexdigest()=='5eb86f885e799d8fd77c736fb5c189d54b73f2e9e274519154f21d73f3453e35'
 before=sql("select oid::text||':'||proowner::text||':'||coalesce(proacl::text,'') from pg_proc where oid='public.trip_core_finite_read_state_guard()'::regprocedure;")
 sql('set role postgres;'+native_p4)
 check('exact separately approved Native P4 package applies over continuous default-closed postimage')
 assert sql("select md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure));")=='f1378cb07c1f1882651a558dbe612909'
 assert before==sql("select oid::text||':'||proowner::text||':'||coalesce(proacl::text,'') from pg_proc where oid='public.trip_core_finite_read_state_guard()'::regprocedure;")
 sql('set role postgres;'+activate,failure='CONTINUOUS_FUNCTION_DRIFT')
 check('original approved activation aborts on Native P4 hash drift')
 compatible=(MAIN_ROOT/'docs/ops/universal-product-20261028/authority/CONTINUOUS_POLICY_ACTIVATE_NATIVE_P4_CANDIDATE.sql').read_text()
 assert compatible==activate.replace('c8d64a12edd7e92a738a536e34071fb4','f1378cb07c1f1882651a558dbe612909')
 activate=compatible
 check('compatible activation changes only read-state CAS; scope expiry commands and close unchanged')
'''
source=source.replace(needle,addition+needle)
exec(compile(source,str(base),'exec'),{'__file__':str(base),'__name__':'__main__'})
