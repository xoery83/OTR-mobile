#!/usr/bin/env python3
import json,subprocess,time,uuid,pathlib,hashlib
import argparse
parser=argparse.ArgumentParser(description="Owned local PG check of the exact read-state Claim fence repair; never connects to Hosted.")
parser.add_argument('--preimages',required=True,type=pathlib.Path)
parser.add_argument('--artifacts',required=True,type=pathlib.Path)
args=parser.parse_args()
P=args.artifacts;P.mkdir(mode=0o700,parents=True,exist_ok=True)
LIVE=args.preimages
ROOT=pathlib.Path(__file__).resolve().parents[2]
D=['/opt/homebrew/bin/docker','--context','colima'];name='otr-core-normal-p1-'+uuid.uuid4().hex[:12];image='otr-core-v2-server84-fixture:20261012';phase='start';created=False
q=lambda s:"'"+str(s).replace("'","''")+"'"
log=P/'ISOLATED_PG.private.log'
def sql(text,role='supabase_admin',allow=False):
 r=subprocess.run(D+['exec','-i',name,'psql','-XqAt','-h','127.0.0.1','-U',role,'-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=text,text=True,capture_output=True,timeout=40)
 with log.open('a') as f:f.write('\n['+phase+']\n'+r.stdout+r.stderr)
 if r.returncode and not allow:raise RuntimeError(phase+':'+r.stderr[:1700])
 return r
try:
 subprocess.run(D+['run','--detach','--pull=never','--network','none','--memory','256m','--cpus','1','--label','otr.core.fixture=normal-p1-denial','--name',name,image],capture_output=True,check=True,timeout=30);created=True
 assert subprocess.check_output(D+['inspect','--format','{{.Image}}',name],text=True).strip()=='sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068'
 for _ in range(40):
  if subprocess.run(D+['exec',name,'pg_isready','-U','supabase_admin'],capture_output=True,timeout=5).returncode==0:break
  time.sleep(.25)
 else:raise RuntimeError('NOT_READY')
 phase='actual-Core-foundation-and-owning-role'
 for m in ['20261011000100_trip_core_v2_foundation.sql','20261011000200_trip_core_v2_version_dispatch.sql','20261011000300_trip_core_v2_owning_session.sql','20261011000400_trip_core_v2_read_scope.sql','20261013000500_trip_create_owning_port.sql']:sql('SET ROLE postgres;'+(ROOT/'supabase/migrations'/m).read_text())
 trip='10000000-0000-4000-8000-000000000001';actor=sql('SELECT created_by FROM public.trips WHERE id='+q(trip)+'::uuid;').stdout.strip();assert actor
 phase='synthetic-normal-owner-provenance-no-adoption'
 sql('''ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;
 ALTER ROLE otr_trip_core_v2_gateway LOGIN CONNECTION LIMIT 1 VALID UNTIL 'infinity';
 GRANT otr_trip_core_v2_gateway TO postgres WITH ADMIN TRUE,INHERIT FALSE,SET FALSE;
 SET ROLE postgres;
 GRANT otr_trip_core_v2_writer TO otr_trip_core_v2_gateway WITH ADMIN FALSE,INHERIT FALSE,SET TRUE;
 CREATE SCHEMA IF NOT EXISTS otr_auth_guest_composite;
 CREATE FUNCTION otr_auth_guest_composite.has_scope() RETURNS boolean LANGUAGE sql AS 'SELECT false';
 CREATE FUNCTION otr_auth_guest_composite.scope_allowed(uuid,uuid,uuid,text) RETURNS boolean LANGUAGE sql AS 'SELECT false';
 CREATE FUNCTION otr_auth_guest_composite.read_state_allowed(uuid,text) RETURNS boolean LANGUAGE sql AS 'SELECT false';
 CREATE TABLE otr_auth_guest_composite.transaction_scopes(adoption_id uuid,backend_pid integer,transaction_id xid8);
 CREATE TABLE otr_auth_guest_composite.terminal_receipts(adoption_id uuid);
 CREATE TABLE IF NOT EXISTS public.journey_removed_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid,user_id uuid);
 CREATE TABLE public.trip_sustained_dev_policy(actor_account_id uuid PRIMARY KEY,enabled boolean DEFAULT true,adoption_cutoff timestamptz DEFAULT clock_timestamp(),revoked_at timestamptz);
 GRANT USAGE ON SCHEMA otr_auth_guest_composite TO otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
 '''+'UPDATE auth.users SET is_anonymous=false WHERE id='+q(actor)+'::uuid;'+
 'UPDATE public.journey_members SET status=\'linked\',role=\'owner\' WHERE trip_id='+q(trip)+'::uuid AND user_id='+q(actor)+'::uuid;'+
 'INSERT INTO public.journey_members(id,trip_id,user_id,display_name,role,status) SELECT gen_random_uuid(),'+q(trip)+'::uuid,'+q(actor)+"::uuid,'Synthetic owner','owner','linked' WHERE NOT EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id="+q(trip)+'::uuid AND user_id='+q(actor)+'::uuid);'+
 'INSERT INTO public.trip_create_receipts(operation_id,trip_id,actor_account_id,request_payload) VALUES(gen_random_uuid(),'+q(trip)+'::uuid,'+q(actor)+'::uuid,\'{"formatVersion":2}\');')
 phase='install-private-current-guard-and-finite-direct-dependencies'
 meta=json.loads((LIVE/'SAFE_HANDOFF.json').read_text())['functions']+json.loads((LIVE/'GUEST_MUTATION_GUARD_SAFE_HANDOFF.json').read_text())['functions']
 for f in meta:
  if f['oid'] not in ['65712','66180','66408','65713','67419']:continue
  raw=pathlib.Path(f['privateDefinitionPath']).read_bytes();assert hashlib.sha256(raw).hexdigest()==f['definitionSHA256']
  existing=sql("SELECT format('ALTER FUNCTION %s OWNER TO postgres;',oid::regprocedure) FROM pg_proc WHERE proname="+q(f['name'])+" AND pronamespace="+q(f.get('schema','public'))+"::regnamespace;").stdout.strip()
  if existing:sql(existing)
  sql('SET ROLE postgres;SET check_function_bodies=off;'+raw.decode())
  schema=f.get('schema','public');sig=schema+'.'+f['name']+'('+','.join(part.strip().split()[-1] for part in f['args'].split(',')) +')' if f['args'] else schema+'.'+f['name']+'()'
  # Only reproduce existing public/gateway/writer execute bits, no new runtime qualification.
  sql('SET ROLE postgres;REVOKE ALL ON FUNCTION '+sig+' FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;'+''.join('GRANT EXECUTE ON FUNCTION '+sig+' TO '+role+';' for role,key in [('otr_trip_core_v2_gateway','gatewayExecute'),('otr_trip_core_v2_writer','writerExecute')] if f[key]))
 event={'id':str(uuid.uuid4())}
 scope="SELECT set_config('otr.core.actor',"+q(actor)+",true),set_config('otr.core.trip',"+q(trip)+",true),set_config('otr.core.command','CREATE_ITEM',true),set_config('otr.core.family','P1',true),set_config('otr.core.admission','MANUAL',true),set_config('otr.core.target_item',"+q(event['id'])+",true),set_config('otr.core.operation','f5e13639-4240-4817-bf43-c60a1ea46361',true);"
 sql("SET ROLE postgres;INSERT INTO public.trip_core_read_state(trip_id) VALUES("+q(trip)+"::uuid) ON CONFLICT(trip_id) DO NOTHING;")
 sql('SET ROLE postgres;DROP TRIGGER IF EXISTS finite_core_read_state_scope ON public.trip_core_read_state;CREATE TRIGGER finite_core_read_state_scope BEFORE INSERT OR UPDATE OR DELETE ON public.trip_core_read_state FOR EACH ROW EXECUTE FUNCTION public.trip_core_finite_read_state_guard();')
 phase='normal-qualification-read-state-upsert-real-predicates'
 statement='BEGIN;'+scope+'SELECT public.trip_core_finite_scope_allowed('+q(actor)+'::uuid,'+q(trip)+"::uuid);SET LOCAL ROLE otr_trip_core_v2_writer;INSERT INTO public.trip_core_read_state(trip_id) VALUES("+q(trip)+'::uuid) ON CONFLICT(trip_id) DO UPDATE SET revision=trip_core_read_state.revision+1;ROLLBACK;'
 before_meta=sql("SELECT jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,'secdef',prosecdef) FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure;").stdout.strip()
 state_before=sql("SELECT to_jsonb(s) FROM public.trip_core_read_state s WHERE trip_id="+q(trip)+"::uuid;").stdout.strip()
 before=sql(statement,'otr_trip_core_v2_gateway',allow=True)
 assert before.returncode and 'permission denied for function trip_member_claim_read_state_allowed' in before.stderr
 guard_oid=sql("SELECT 'public.trip_core_finite_read_state_guard()'::regprocedure::oid;").stdout.strip()
 helper_oid=sql("SELECT 'public.trip_member_claim_read_state_allowed(uuid)'::regprocedure::oid;").stdout.strip()
 def fixture_cas(name):return (P/'fixed-packet'/name).read_text().replace('65713::oid',guard_oid+'::oid').replace('67419::oid',helper_oid+'::oid')
 install=fixture_cas('INSTALL.private.sql')
 diag=sql("SELECT jsonb_agg(jsonb_build_object('oid',oid,'name',proname,'owner',proowner::regrole,'acl',proacl,'config',proconfig,'secdef',prosecdef,'bodyMD5',md5(prosrc),'definitionSHA',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'))) FROM pg_proc WHERE oid IN ('public.trip_core_finite_read_state_guard()'::regprocedure,'public.trip_member_claim_read_state_allowed(uuid)'::regprocedure);").stdout.strip();(P/'CAS_FIXTURE_DIAGNOSTIC.json').write_text(diag)
 bad=sql('SET ROLE postgres;'+install.replace('5e7decd9c757920210013bf7de8004f7ef13945414f1580a18c6dfefea3f921d','0'*64,1),allow=True);assert bad.returncode and 'CORE_GUARD_CAS_DRIFT' in bad.stderr
 sql('SET ROLE postgres;'+install)
 after=sql(statement,'otr_trip_core_v2_gateway',allow=True)
 assert after.returncode==0,after.stderr
 denied=sql(statement.replace(q(actor),q(str(uuid.uuid4()))),'otr_trip_core_v2_gateway',allow=True)
 assert denied.returncode and 'CORE_V2_CAPABILITY_CLOSED' in denied.stderr
 acl=sql("SELECT has_function_privilege('otr_trip_core_v2_writer','public.trip_member_claim_read_state_allowed(uuid)','EXECUTE');").stdout.strip();assert acl=='f'
 after_meta=sql("SELECT jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,'secdef',prosecdef) FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure;").stdout.strip();assert before_meta==after_meta
 state_after=sql("SELECT to_jsonb(s) FROM public.trip_core_read_state s WHERE trip_id="+q(trip)+"::uuid;").stdout.strip();assert state_before==state_after
 sql('SET ROLE postgres;'+fixture_cas('ROLLBACK.private.sql'))
 rollback=sql(statement,'otr_trip_core_v2_gateway',allow=True);assert rollback.returncode and 'permission denied for function trip_member_claim_read_state_allowed' in rollback.stderr
 result={'generatedCasInstallAndRollback':True,'faultPreimageCasRollsBack':True,'fixtureOidRebindingOnly':'Generated SQL literal OIDs rebound to owned fixture OIDs; production packet remains frozen65713/67419','metadataUnchanged':before_meta==after_meta,'readStateUnchangedAfterRolledBackTests':state_before==state_after,'reverseRestoresExactPriorDenial':True,'fixtureImage':'sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068','fixtureLimits':'network none /256MiB /1CPU; removed in finally','phase':phase,'before':{'returncode':before.returncode,'error':before.stderr},'after':{'returncode':after.returncode,'stdout':after.stdout},'foreignActor':{'returncode':denied.returncode,'error':denied.stderr},'helperWriterExecuteStillFalse':True,'scope':'ISOLATED_TRUE_GATEWAY_LOGIN_REAL_FINITE_AND_SUSTAINED_SCOPE_CURRENT_READ_STATE_GUARD; synthetic existing fixture Owner/Trip/v2provenance, only deny Guest seams, no full Item+receipt mutation or Hosted claim','positiveScopeStubs':0,'hostedActions':0}
 (P/'POSITIVE_READ_STATE_RESULT.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
finally:
 if created:subprocess.run(D+['rm','--force',name],capture_output=True,check=True,timeout=15)
