"""Real PG17, unique cached network-none Server84 clone; no DEV/Hosted/Auth or GUI."""
import json
import pathlib
import subprocess
import time
import uuid
import concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[2]
IMAGE='otr-core-v2-server84-fixture:20261012'
NAME='otr-metadata-v2-'+uuid.uuid4().hex[:12]
ROLE='otr_trip_metadata_gateway'
ACTOR,OTHER,TRIP=[str(uuid.uuid4()) for _ in range(3)]
checks=[]
created=False

def docker(*args,text=None,check=True):
 r=subprocess.run(['/opt/homebrew/bin/docker',*args],input=text,capture_output=True,text=True)
 if check and r.returncode:raise RuntimeError(r.stderr[-3000:])
 return r

def sql(text,user='supabase_admin',failure=None):
 connection=['-h','127.0.0.1'] if user==ROLE or user=='otr_trip_create_gateway' else []
 r=docker('exec','-i','-e','PGPASSWORD=metadata-synthetic-only',NAME,'psql','-XqAt',*connection,'-U',user,'-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate',text=text,check=False)
 if failure:assert r.returncode and failure in r.stderr,(failure,r.stderr)
 else:assert r.returncode==0,r.stderr
 return r.stdout.strip()

def literal(x):return 'NULL' if x is None else "'"+str(x).replace("'","''")+"'"
def check(name,value=True):
 assert value,name
 checks.append(name)
def meta(name='Before'):return {'name':name,'destination':'Coast','startDate':None,'endDate':None}
def request(before=None,after=None,revision=0,op=None,trip=TRIP):return {'formatVersion':2,'operationId':op or str(uuid.uuid4()),'tripId':trip,'before':before or meta(),'after':after or meta('After'),'expectedMetadataRevision':revision}
def arm(req,actor=ACTOR,duration='5 minutes'):
 sql("update public.trip_metadata_activation_gate set enabled=true,actor_account_id="+literal(actor)+"::uuid,trip_id="+literal(req['tripId'])+"::uuid,operation_id="+literal(req['operationId'])+"::uuid,request_payload="+literal(json.dumps(req))+"::jsonb,started_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval "+literal(duration)+";do $$begin execute format('alter role "+ROLE+" login connection limit 1 valid until %L',(select expires_at from public.trip_metadata_activation_gate));end $$;")
def command(req,actor=ACTOR):return "select public.trip_metadata_update_command("+','.join([literal(req['operationId'])+'::uuid',literal(actor)+'::uuid',literal(req['tripId'])+'::uuid',literal(json.dumps(req))+'::jsonb'])+");"
def result(req,actor=ACTOR):return "select public.trip_metadata_update_result("+literal(req['operationId'])+"::uuid,"+literal(actor)+"::uuid);"
def snapshot(req,actor=ACTOR):return "select public.trip_metadata_snapshot("+','.join(literal(x)+'::uuid' for x in [actor,req['tripId'],req['operationId']])+");"
def close():sql("update public.trip_metadata_activation_gate set enabled=false,actor_account_id=null,trip_id=null,operation_id=null,request_payload=null,started_at=null,expires_at=null;alter role "+ROLE+" nologin;")
def state():return sql("select name||':'||metadata_revision from public.trips where id="+literal(TRIP)+";")

try:
 docker('image','inspect',IMAGE)
 docker('run','--name',NAME,'--network','none','-d',IMAGE);created=True
 for _ in range(50):
  if docker('exec',NAME,'pg_isready','-U','supabase_admin',check=False).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('OWNED_FIXTURE_NOT_READY')
 for suffix in ('foundation','version_dispatch','owning_session','read_scope','source_scope','candidate_publication','legacy_claim_fence','retained_claim_fence'):
  sql('set role postgres;'+next((ROOT/'supabase/migrations').glob('*trip_core_v2_'+suffix+'.sql')).read_text())
 sql('set role postgres;'+(ROOT/'supabase/migrations/20261013000500_trip_create_owning_port.sql').read_text())
 sql('set role postgres;'+(ROOT/'supabase/dev-forward/core-v2/20261014000300_trip_core_v2_finite_activation_contract.sql').read_text())
 source=(ROOT/'supabase/dev-forward/r3-v1/202610080001_fresh_trip_ledger_initialization.sql').read_text();a=source.index('CREATE OR REPLACE FUNCTION');b=source.index('$function$;',a)+len('$function$;');sql('set role postgres;'+source[a:b])
 sql('set role postgres;'+(ROOT/'supabase/dev-forward/trip-create/20261017000100_trip_create_finite_contract.sql').read_text())
 # All identities below are disposable synthetic DB fixtures. No real Auth service or Session.
 sql("insert into auth.users(id) values("+literal(ACTOR)+"),("+literal(OTHER)+");")
 sql("insert into public.profiles(id,display_name) values("+literal(ACTOR)+",'Metadata fixture A'),("+literal(OTHER)+",'Metadata fixture B');")
 create_op=str(uuid.uuid4());create_payload={'tripId':TRIP,**meta()}
 sql("update public.trip_create_activation_gate set enabled=true,actor_account_id="+literal(ACTOR)+",trip_id="+literal(TRIP)+",operation_id="+literal(create_op)+",request_payload="+literal(json.dumps(create_payload))+"::jsonb,started_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '10 minutes';do $$begin execute format('alter role otr_trip_create_gateway login password %L connection limit 1 valid until %L','metadata-synthetic-only',(select expires_at from public.trip_create_activation_gate));end $$;")
 create_command="select public.trip_create_command("+','.join(literal(x) for x in [create_op,ACTOR,TRIP,'Before','Coast'])+",null,null);"
 original_create=json.loads(sql(create_command,'otr_trip_create_gateway'))
 # Adverse creator-default grants must not expose newly-created private tables/functions.
 sql('set role postgres;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;')
 sql("update public.trip_create_activation_gate set enabled=false,actor_account_id=null,trip_id=null,operation_id=null,request_payload=null,started_at=null,expires_at=null;alter role otr_trip_create_gateway nologin;")
 sql('set role postgres;'+(ROOT/'supabase/dev-forward/trip-metadata/20261022000100_trip_metadata_v2.sql').read_text())
 sql("update public.trip_create_activation_gate set enabled=true,actor_account_id="+literal(ACTOR)+",trip_id="+literal(TRIP)+",operation_id="+literal(create_op)+",request_payload="+literal(json.dumps(create_payload))+"::jsonb,started_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '10 minutes';do $$begin execute format('alter role otr_trip_create_gateway login password %L connection limit 1 valid until %L','metadata-synthetic-only',(select expires_at from public.trip_create_activation_gate));end $$;")
 check('migration keeps Create, Core and Source closed states unchanged',sql("select not rolcanlogin from pg_roles where rolname='otr_trip_core_v2_gateway';")=='t')
 req=request();arm(req)
 observed=json.loads(sql(snapshot(req),ROLE));check('legal exact snapshot supplies owning metadata revision',observed['metadataRevision']==0 and observed['metadata']==meta())
 accepted=json.loads(sql(command(req),ROLE));check('normal Edit atomically writes revision and exact receipt',accepted['resultMetadataRevision']==1 and state()=='After:1')
 check('same operation exact replay is immutable',json.loads(sql(command(req),ROLE))==accepted and state()=='After:1')
 check('result reader returns exact immutable receipt',json.loads(sql(result(req),ROLE))==accepted)
 check('Create receipt remains original after Edit',json.loads(sql(create_command,'otr_trip_create_gateway'))==original_create)
 sql("select public.trip_metadata_update_command("+literal(req['operationId'])+","+literal(ACTOR)+","+literal(TRIP)+","+literal(json.dumps({**req,'after':meta('Tamper')}))+"::jsonb);",ROLE,failure='23505')
 changed={**req,'after':meta('Tamper')};arm(changed);sql(command(changed),ROLE,failure='23505');check('operation collision rejects changed payload without mutation',state()=='After:1')
 stale=request(before=meta('After'),after=meta('Later'),revision=0);arm(stale);sql(command(stale),ROLE,failure='40001');check('stale revision is not repaired by matching tuple',state()=='After:1')
 aba=request(before=meta('After'),after=meta('Later'),revision=1)
 sql("update public.trips set name='Away' where id="+literal(TRIP)+";update public.trips set name='After' where id="+literal(TRIP)+";");arm(aba);sql(command(aba),ROLE,failure='40001');check('outside-writer A to B to A advances monotonic revision',state()=='After:3')
 owner_aba=request(before=meta('After'),after=meta('Later'),revision=3)
 sql("update public.trips set created_by="+literal(OTHER)+" where id="+literal(TRIP)+";update public.trips set created_by="+literal(ACTOR)+" where id="+literal(TRIP)+";");arm(owner_aba);sql(command(owner_aba),ROLE,failure='40001');check('owner transfer A to B to A invalidates old baseline',state()=='After:5')
 sql("update public.trips set metadata_revision=0 where id="+literal(TRIP)+";",failure='42501');check('manual metadata revision assignment rejected')
 arm(req);sql(command(req,OTHER),ROLE,failure='55000');sql(result(req,OTHER),ROLE,failure='55000');check('foreign account cannot call command or read result')
 sql("update public.journey_members set status='unlinked' where trip_id="+literal(TRIP)+" and user_id="+literal(ACTOR)+";");sql(result(req),ROLE,failure='42501');sql(snapshot(req),ROLE,failure='42501');check('revoked membership denies historical receipt and snapshot');sql("update public.journey_members set status='linked' where trip_id="+literal(TRIP)+" and user_id="+literal(ACTOR)+";")
 sql("update public.journey_members set role='group_member' where trip_id="+literal(TRIP)+" and user_id="+literal(ACTOR)+";");sql(result(req),ROLE,failure='42501');check('non-owner linked participant cannot inherit edit authority');sql("update public.journey_members set role='owner' where trip_id="+literal(TRIP)+" and user_id="+literal(ACTOR)+";")
 for role in ['anon','authenticated','service_role','otr_trip_create_gateway','otr_trip_core_v2_gateway']:
  sql('set role '+role+';select * from public.trip_metadata_update_receipts;',failure='42501')
  sql('set role '+role+';'+result(req),failure='42501')
  sql('set role '+role+';select * from public.trip_metadata_activation_gate;',failure='42501')
 check('private table and RPC grants deny client service Create and Core roles despite defaults')
 for stmt in ["update public.trip_metadata_update_receipts set accepted_at=clock_timestamp()",'delete from public.trip_metadata_update_receipts','truncate public.trip_metadata_update_receipts']:
  sql(stmt+';',failure='42501')
 check('receipt update delete and truncate are immutable')
 for change in [{'extra':1},{'expectedMetadataRevision':9007199254740992},{'expectedMetadataRevision':-1},{'formatVersion':1},{'after':{**meta(),'startDate':'2026-02-30'}},{'after':{**meta(),'bookingRef':'FORBIDDEN'}},{'after':{**meta(),'name':123}}]:
  invalid={**request(before=meta('After'),revision=5),**change,'operationId':req['operationId']};arm(invalid) if change.get('formatVersion',2)==2 and 'extra' not in change else arm(req)
  sql(command(invalid),ROLE,failure='220')
 check('strict schema safeinteger calendar and non-metadata fields rejected')
 failed=request(before=meta('After'),after=meta('Failure'),revision=5);arm(failed)
 sql('begin;'+command(failed)+'select 1/0;',ROLE,failure='22012');check('failed transaction rolls back metadata revision and receipt',state()=='After:5' and sql("select count(*) from public.trip_metadata_update_receipts where operation_id="+literal(failed['operationId'])+";")=='0')
 arm(failed,duration='1 second');sql('begin;'+command(failed)+"select pg_sleep(1.3);commit;",ROLE,failure='55000');check('fixed default-deferred transaction rejects expiry at commit atomically',state()=='After:5')
 # Adversarial credential-holder boundary: arbitrary SQL may consume a deferred trigger early.
 arm(failed,duration='1 second');sql('begin;'+command(failed)+"set constraints all immediate;select pg_sleep(1.3);commit;",ROLE)
 check('LIMITATION arbitrary SQL can consume deferred expiry check before commit',state()=='Failure:6')
 arm(failed);recovered=json.loads(sql(command(failed),ROLE));check('stable operation recovers exact immutable result',recovered['resultMetadataRevision']==6)
 arm(req);check('old receipt survives later accepted mutation',json.loads(sql(result(req),ROLE))==accepted)
 # Two real PG sessions use fixture-only SET SESSION AUTHORIZATION to model the same SQL principal concurrently.
 # The normal direct-login connlimit=1 is unchanged and checked separately; this is not Auth/Host proof.
 concurrent_req=request(before=meta('Failure'),after=meta('Concurrent'),revision=6);arm(concurrent_req)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
  results=list(executor.map(lambda _:json.loads(sql('set session authorization '+ROLE+';'+command(concurrent_req))),range(2)))
 check('concurrent duplicate exact operation has one receipt and one mutation',results[0]==results[1] and state()=='Concurrent:7')
 # Distinct operations use serialized finite scopes: previous operation's observed revision still loses.
 next_one=request(before=meta('Concurrent'),after=meta('Winner'),revision=7);loser=request(before=meta('Concurrent'),after=meta('Loser'),revision=7);arm(next_one);sql(command(next_one),ROLE);arm(loser);sql(command(loser),ROLE,failure='40001');check('different operation same baseline cannot silently overwrite winner',state()=='Winner:8')
 # Boundary is unreachable through normal writers; controlled fixture-only disable is only for overflow setup.
 sql("alter table public.trips disable trigger trip_metadata_revision_guard;update public.trips set metadata_revision=9007199254740991 where id="+literal(TRIP)+";alter table public.trips enable trigger trip_metadata_revision_guard;")
 exhausted=request(before=meta('Winner'),after=meta('Overflow'),revision=9007199254740991);arm(exhausted);sql(command(exhausted),ROLE,failure='22023');check('safeinteger maximum cannot overflow or round')
 arm(req);sql("update public.trip_metadata_activation_gate set started_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second';");sql(result(req),ROLE,failure='55000');check('expired exact scope denies receipt recovery')
 rollback=(ROOT/'supabase/dev-forward/trip-metadata/20261022000100_trip_metadata_v2.rollback.sql').read_text();arm(req);sql('set role postgres;'+rollback,failure='P0001');close();sql('set role postgres;'+rollback)
 check('deactivation rollback retains immutable receipts and monotonic revision',sql('select count(*) from public.trip_metadata_update_receipts;')=='4' and state()=='Winner:9007199254740991')
 print(json.dumps({'status':'ISOLATED_POSTGRESQL_PASS','fixture':'network-none PG17 cached Server84','checks':checks,'checkCount':len(checks),'hostedExecuted':False,'nativeExecuted':False,'authServiceUsed':False},indent=2))
finally:
 if created:docker('rm','-f',NAME)
