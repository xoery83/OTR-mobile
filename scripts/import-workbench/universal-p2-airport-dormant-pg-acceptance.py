"""Actual resolver/ACL on a disposable network-none clone; never installs DEV authority."""
from pathlib import Path
import json,subprocess,time,uuid,hashlib
root=Path.cwd();packet=root/'docs/ops/universal-p2-formal-save-20261027'
name='otr-p2-airports-'+uuid.uuid4().hex[:12];image='otr-core-v2-server84-fixture:20261012';checks=[]
actor='f4b059c5-8241-4ffb-aa15-37fa25474543';trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'
proposal=json.loads((packet/'P2_AIRPORT_REGISTRY_PROPOSAL.json').read_text());hashes=json.loads((packet/'P2_AIRPORT_PACKAGE_HASHES.json').read_text());sig="'public.trip_core_resolve_airport(text,text,text,date)'::regprocedure"
def docker(*args,input=None):return subprocess.run(['docker',*args],input=input,text=True,capture_output=True)
def sql(text,fail=None):
 r=docker('exec','-i',name,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',input='SET SESSION AUTHORIZATION postgres;'+text)
 if fail:assert r.returncode and fail in r.stderr,r.stderr
 else:assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(message,condition=True):assert condition,message;checks.append(message)
def resolve(a,t,code='AKL',day='2026-11-02'):
 return sql("BEGIN; SET SESSION AUTHORIZATION otr_trip_core_v2_gateway; SELECT set_config('otr.core.actor','"+a+"',true),set_config('otr.core.trip','"+t+"',true); SELECT public.trip_core_resolve_airport('IATA_AIRPORT','IATA','"+code+"','"+day+"'::date) IS NULL; ROLLBACK;").splitlines()[-1]
try:
 r=docker('run','--name',name,'--network','none','--memory','256m','--cpus','1','-d',image);assert r.returncode==0,r.stderr
 for _ in range(60):
  if docker('exec',name,'pg_isready','-U','supabase_admin').returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('PG_NOT_READY')
 for filename in ['20261011000100_trip_core_v2_foundation.sql','20261011000200_trip_core_v2_version_dispatch.sql','20261011000300_trip_core_v2_owning_session.sql','20261011000400_trip_core_v2_read_scope.sql','20261011000500_trip_core_v2_source_scope.sql','20261011000600_trip_core_v2_candidate_publication.sql']:
  sql((root/'supabase/migrations'/filename).read_text())
 check('actual DEV resolver preimage matches canonical isolated function',sql('SELECT md5(pg_get_functiondef('+sig+'));')==hashes['preMD5'])
 sql("INSERT INTO auth.users(id) VALUES('"+actor+"'); INSERT INTO profiles(id,display_name) VALUES('"+actor+"','Disposable QA registry owner'); INSERT INTO public.trips SELECT (jsonb_populate_record(NULL::public.trips,to_jsonb(t)||jsonb_build_object('id','"+trip+"','created_by','"+actor+"'))).* FROM public.trips t WHERE id='10000000-0000-4000-8000-000000000001';")
 before=sql("SELECT jsonb_build_object('oid',(SELECT oid FROM pg_proc WHERE oid="+sig+"),'owner',(SELECT proowner FROM pg_proc WHERE oid="+sig+"),'acl',(SELECT proacl FROM pg_proc WHERE oid="+sig+"));")
 install=(packet/'P2_AIRPORT_DORMANT_INSTALL.sql').read_text();rollback=(packet/'P2_AIRPORT_DORMANT_ROLLBACK.sql').read_text()
 # Fixture-only catalog NULL injection is rolled back by the expected failed transaction.
 sql("BEGIN; RESET SESSION AUTHORIZATION; UPDATE pg_proc SET proacl=NULL WHERE oid="+sig+"; SET SESSION AUTHORIZATION postgres;"+install,fail='P2_AIRPORT_FUNCTION_DRIFT');check('NULL ACL fails closed before any registry change')
 sql("BEGIN; INSERT INTO trip_core_airport_identities VALUES('IATA_AIRPORT','IATA','ZZZ','IATA_AIRPORT:ZZZ','2026-11-02','2026-11-02','"+proposal['version']+"',repeat('a',64),true);"+install,fail='P2_AIRPORT_REGISTRY_DRIFT');check('preexisting extra code under proposed registry version rejects atomically')
 sql(install)
 check('exact packaged install changes only resolver to pinned postimage',sql('SELECT md5(pg_get_functiondef('+sig+'));')==hashes['postMD5'])
 after=sql("SELECT jsonb_build_object('oid',(SELECT oid FROM pg_proc WHERE oid="+sig+"),'owner',(SELECT proowner FROM pg_proc WHERE oid="+sig+"),'acl',(SELECT proacl FROM pg_proc WHERE oid="+sig+"));")
 check('actual function OID owner and ACL remain identical',before==after)
 check('two proposed real-code rows are installed inactive',sql('SELECT count(*)=2 AND bool_and(NOT enabled) FROM trip_core_airport_identities;')=='t')
 check('owning resolver returns no authority while dormant',resolve(actor,trip)=='t')
 sql(install,fail='P2_AIRPORT_FUNCTION_DRIFT');check('second install cannot reset or reuse package')
 sql("SELECT public.trip_core_resolve_airport('IATA_AIRPORT','IATA','AKL','2026-11-02'::date);",fail='CORE_SCOPE_MISMATCH');check('administrative session cannot impersonate owning resolver')
 check('no public table read or function execution privilege',sql("SELECT NOT has_table_privilege('authenticated','trip_core_airport_identities','SELECT') AND NOT has_function_privilege('authenticated','trip_core_resolve_airport(text,text,text,date)','EXECUTE');")=='t')
 # Enable only disposable fixture rows to exercise the proposed fixed Actor/Trip/date filter.
 sql('UPDATE trip_core_airport_identities SET enabled=true;')
 check('fixture-only activation permits exact legitimate QA actor/trip/date',resolve(actor,trip)=='f' and resolve(actor,trip,'CHC')=='f')
 check('another legitimate actor/trip cannot use proposed QA identities',resolve('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001')=='t')
 check('exact actor/trip cannot transplant authority to another service date',resolve(actor,trip,day='2026-11-03')=='t')
 sql(rollback,fail='P2_AIRPORT_ROLLBACK_ACTIVE_OR_DRIFT');check('rollback refuses to overwrite a later active window')
 sql("INSERT INTO trip_core_airport_identities VALUES('IATA_AIRPORT','IATA','WLG','IATA_AIRPORT:WLG','2026-01-01',NULL,'disposable-existing-registry',repeat('a',64),true);")
 check('existing unrelated registry remains available under original owning contract',resolve('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','WLG')=='f')
 sql("UPDATE trip_core_airport_identities SET enabled=false WHERE registry_version='"+proposal['version']+"';")
 sql("BEGIN; INSERT INTO trip_core_airport_identities VALUES('IATA_AIRPORT','IATA','ZZZ','IATA_AIRPORT:ZZZ','2026-11-02','2026-11-02','"+proposal['version']+"',repeat('a',64),false);"+rollback,fail='P2_AIRPORT_ROLLBACK_ACTIVE_OR_DRIFT');check('rollback rejects extra or drifted registry-version rows')
 sql(rollback)
 check('exact reverse-hash rollback restores original function',sql('SELECT md5(pg_get_functiondef('+sig+'));')==hashes['preMD5'])
 check('rollback retains both immutable proposed rows inactive',sql("SELECT count(*)=2 AND bool_and(NOT enabled) FROM trip_core_airport_identities WHERE registry_version='"+proposal['version']+"';")=='t')
 sql(rollback);check('rollback is idempotent without deleting evidence or reopening authority')
 result={'status':'P2_AIRPORT_DORMANT_ISOLATED_PG_PASS_NOT_DEV','count':len(checks),'checks':checks,'network':'none','memory':'256m','hostedWrites':0,'providerCalls':0,'fixtureOnlyActivation':True}
 Path('/private/tmp/otr-p2-airport-dormant-pg-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:docker('rm','-f',name)
