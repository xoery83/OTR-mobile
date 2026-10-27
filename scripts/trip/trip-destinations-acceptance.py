"""Real PG17, unique cached network-none Server84 clone; no DEV/Hosted/Auth or GUI."""
import json
import pathlib
import subprocess
import time
import uuid
import concurrent.futures
import sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'dev'))
from trip_structured_deploy import CATALOG_SQL
ROOT=pathlib.Path(__file__).resolve().parents[2]
IMAGE='otr-core-v2-server84-fixture:20261012'
NAME='otr-structured-trip-'+uuid.uuid4().hex[:12]
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
 r=docker('exec','-i','-e','PGPASSWORD=metadata-synthetic-only',NAME,'psql','-XqAt',*connection,'-U',user,'-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',text=text,check=False)
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
 sql('set role postgres;'+(ROOT/'supabase/dev-forward/trip-metadata/20261022000100_trip_metadata_v2.sql').read_text())
 LEGACY=str(uuid.uuid4());legacy_op=str(uuid.uuid4());legacy_payload={'tripId':LEGACY,'name':'Legacy QA','destination':'Coast','startDate':None,'endDate':None}
 sql("update public.trip_create_activation_gate set enabled=true,actor_account_id="+literal(ACTOR)+",trip_id="+literal(LEGACY)+",operation_id="+literal(legacy_op)+",request_payload="+literal(json.dumps(legacy_payload))+"::jsonb,started_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '5 minutes';do $$begin execute format('alter role otr_trip_create_gateway login password %L connection limit 1 valid until %L','metadata-synthetic-only',(select expires_at from public.trip_create_activation_gate));end $$;")
 sql("select public.trip_create_command("+literal(legacy_op)+"::uuid,"+literal(ACTOR)+"::uuid,"+literal(LEGACY)+"::uuid,'Legacy QA','Coast',NULL,NULL);",'otr_trip_create_gateway')
 sql("update public.trip_create_activation_gate set enabled=false,actor_account_id=null,trip_id=null,operation_id=null,request_payload=null,started_at=null,expires_at=null;alter role otr_trip_create_gateway nologin;")
 acl_before=sql("select jsonb_build_object('acl',relacl::text,'rls',relrowsecurity,'force',relforcerowsecurity) from pg_class where oid='public.trips'::regclass;")
 # This minimal clone does not install Source PDF; omit only those unrelated live checks in fixture projection.
 fixture_catalog=CATALOG_SQL.replace(" and not exists(select 1 from public.trip_source_command_gate where enabled)","").replace(" and not exists(select 1 from public.trip_source_pdf_gate where enabled)","")
 print('CATALOG_BEFORE '+sql(fixture_catalog))
 preimages=sql("select jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) from pg_proc where oid in ('public.trip_create_result(uuid,uuid)'::regprocedure,'public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure,'public.trip_metadata_revision_guard()'::regprocedure,'public.trip_metadata_snapshot(uuid,uuid,uuid)'::regprocedure,'public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)'::regprocedure);")
 print('ACCEPTED_PREIMAGES '+preimages)
 sql('set role postgres;'+(ROOT/'supabase/dev-forward/trip-destinations/20261023000100_trip_structured_destinations.sql').read_text())

 print('CATALOG_AFTER '+sql(fixture_catalog))
 check('structured migration installs on dormant accepted base')
 check('existing Trip table RLS and ACL unchanged',acl_before==sql("select jsonb_build_object('acl',relacl::text,'rls',relrowsecurity,'force',relforcerowsecurity) from pg_class where oid='public.trips'::regclass;"))
 check('preexisting scalar row remains NULL without historical backfill',sql("select (destinations IS NULL)::text from public.trips where id="+literal(LEGACY)+"::uuid;")=='true')

 sql("alter role otr_trip_metadata_gateway password 'metadata-synthetic-only';")
 D1={'destinationId':str(uuid.uuid4()),'displayLabel':'Auckland','source':'MANUAL'}
 D2={'destinationId':str(uuid.uuid4()),'displayLabel':'Nelson','source':'APPLE_PLACE_ID','provider':'apple','providerPlaceId':'apple-test-place-id'}
 D3={'destinationId':str(uuid.uuid4()),'displayLabel':'Wellington','source':'MANUAL'}
 create_op=str(uuid.uuid4());initial=[D1,D2]
 create_req={'formatVersion':2,'operationId':create_op,'tripId':TRIP,'name':'Structured QA','destination':None,'destinations':initial,'startDate':'2026-11-01','endDate':'2026-11-03'}
 def armcreate(req,actor=ACTOR):
  payload={k:v for k,v in req.items() if k!='operationId'}
  sql("update public.trip_create_activation_gate set enabled=true,actor_account_id="+literal(actor)+"::uuid,trip_id="+literal(req['tripId'])+"::uuid,operation_id="+literal(req['operationId'])+"::uuid,request_payload="+literal(json.dumps(payload))+"::jsonb,started_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '5 minutes';do $$begin execute format('alter role otr_trip_create_gateway login password %L connection limit 1 valid until %L','metadata-synthetic-only',(select expires_at from public.trip_create_activation_gate));end $$;")
 def createcmd(req,actor=ACTOR):return 'select public.trip_create_command('+','.join([literal(req['operationId'])+'::uuid',literal(actor)+'::uuid',literal(req['tripId'])+'::uuid',literal(json.dumps(req))+'::jsonb'])+');'
 armcreate(create_req);created_result=json.loads(sql(createcmd(create_req),'otr_trip_create_gateway'))
 check('CreateV2 retains stable IDs order source/place fields in immutable receipt',created_result['destinations']==initial and created_result['formatVersion']==2 and created_result['metadataRevision']==0)
 check('Create atomically initializes same Trip ledger and linked owner',sql("select (s.settlement_currency='NZD' and s.revision=1 and m.user_id="+literal(ACTOR)+"::uuid and m.role='owner' and m.status='linked')::text from public.ledger_settings s join public.journey_members m on m.trip_id=s.journey_id where s.journey_id="+literal(TRIP)+"::uuid;")=='true')
 sql('set role service_role;update public.trips set destinations='+literal(json.dumps([D1]))+'::jsonb where id='+literal(TRIP)+'::uuid;',failure='42501')
 check('unauthenticated client table scope updates no rows',sql('set role authenticated;with changed as (update public.trips set destinations='+literal(json.dumps([D1]))+'::jsonb where id='+literal(TRIP)+'::uuid returning id) select count(*) from changed;')=='0')
 check('existing service table grant cannot bypass owning structured mutation')
 check('same Create operation replays immutable receipt',json.loads(sql(createcmd(create_req),'otr_trip_create_gateway'))==created_result)
 sql("update public.trip_create_activation_gate set enabled=false,actor_account_id=null,trip_id=null,operation_id=null,request_payload=null,started_at=null,expires_at=null;alter role otr_trip_create_gateway nologin;")
 current={'name':'Structured QA','destination':None,'destinations':initial,'startDate':'2026-11-01','endDate':'2026-11-03'}
 def req3(before,after,rev,op=None):return {'formatVersion':3,'operationId':op or str(uuid.uuid4()),'tripId':TRIP,'expectedMetadataRevision':rev,'before':before,'after':after}
 add=req3(current,{**current,'destinations':[D1,D2,D3]},0);arm(add);addresult=json.loads(sql(command(add),ROLE));check('V3 adds third destination under same metadata CAS',addresult['resultMetadataRevision']==1 and addresult['after']['destinations']==[D1,D2,D3])
 check('V3 snapshot exposes same owning list and confirmed revision',json.loads(sql(snapshot(add),ROLE))['metadata']==add['after'])
 check('same-op Metadata replay is exact immutable result',json.loads(sql(command(add),ROLE))==addresult)
 reordered={**add['after'],'destinations':[{**D2,'displayLabel':'Nelson edited'},D3,D1]}
 reorder=req3(add['after'],reordered,1);arm(reorder);rr=json.loads(sql(command(reorder),ROLE));check('reorder and display label edit preserve identity/place and advance revision',rr['resultMetadataRevision']==2)
 remove=req3(reordered,{**reordered,'destinations':[D3,D1]},2);arm(remove);rm=json.loads(sql(command(remove),ROLE));check('remove retains other destination IDs/order',rm['resultMetadataRevision']==3)
 stale=req3(current,{**current,'name':'stale'},0);arm(stale);sql(command(stale),ROLE,failure='40001');check('old draft revision/tuple cannot overwrite structured edits')
 aba1=req3(remove['after'],{**remove['after'],'name':'ABA intermediate','destinations':initial},3);arm(aba1);sql(command(aba1),ROLE)
 aba2=req3(aba1['after'],current,4);arm(aba2);sql(command(aba2),ROLE)
 stale2=req3(current,{**current,'name':'ABA stale'},0);arm(stale2);sql(command(stale2),ROLE,failure='40001');check('A B A restoration does not revive stale revision')
 current_rev=5
 for bad in [[D1,D1],[D1,{**D3,'displayLabel':'ＡＵＣＫＬＡＮＤ'}],[{**D2,'provider':'other'}],[{**D1,'extra':'raw provider response'}],[{**D1,'displayLabel':' '}] ]:
  malformed=req3(current,{**current,'destinations':bad},current_rev);arm(malformed);sql(command(malformed),ROLE,failure='22023')
 check('SQL strict destination field size claim and ID validation refuses malformed lists')
 relabel=req3(current,{**current,'destinations':[D1,{**D2,'providerPlaceId':'different-place-same-id'}]},current_rev);arm(relabel);sql(command(relabel),ROLE,failure='22023');check('retained identity cannot change source/place claim')
 legacy=request(before={k:v for k,v in current.items()if k!='destinations'},after={**{k:v for k,v in current.items()if k!='destinations'},'name':'old client'},revision=current_rev);arm(legacy);sql(command(legacy),ROLE,failure='22023');check('old scalar client cannot silently edit/flatten structured Trip')
 noop=req3(current,current,current_rev);arm(noop);nr=json.loads(sql(command(noop),ROLE));check('true no-op retains revision',nr['resultMetadataRevision']==current_rev)
 sql(command(noop,OTHER),ROLE,failure='55000');sql(result(noop,OTHER),ROLE,failure='55000');check('foreign actor cannot mutate or read receipt')
 collision={**noop,'after':{**current,'name':'collision'}};arm(collision);sql(command(collision),ROLE,failure='23505');check('same operation different payload collides')
 close();legacy_edit=request(before={'name':'Legacy QA','destination':'Coast','startDate':None,'endDate':None},after={'name':'Legacy edited','destination':'Coast','startDate':None,'endDate':None},revision=0,trip=LEGACY);arm(legacy_edit);lr=json.loads(sql(command(legacy_edit),ROLE));check('old scalar Metadata V2 still works only on legacy Trip',lr['formatVersion']==2 and lr['resultMetadataRevision']==1);close();armcreate(create_req);check('Create original list/name receipt unchanged after edits',json.loads(sql('select public.trip_create_result('+literal(create_op)+'::uuid,'+literal(ACTOR)+'::uuid);','otr_trip_create_gateway'))==created_result)
 sql("update public.trip_create_activation_gate set enabled=false,actor_account_id=null,trip_id=null,operation_id=null,request_payload=null,started_at=null,expires_at=null;alter role otr_trip_create_gateway nologin;")
 for role in ['anon','authenticated','service_role','otr_trip_create_gateway','otr_trip_core_v2_gateway']:
  sql('set role '+role+';select * from public.trip_metadata_update_receipts;',failure='42501')
 check('existing internal receipts remain denied to client Backend Create and Core roles')
 check('legacy Trip rows remain nullable; no backfill',sql("select is_nullable from information_schema.columns where table_schema='public' and table_name='trips' and column_name='destinations';")=='YES')
 for bad in [None,{},[D1,D1],[{**D1,'displayLabel':'x'*257}]]:
  got=sql('set role postgres;select public.trip_destinations_valid('+literal(json.dumps(bad))+'::jsonb);');check('input-only validator rejects malformed '+str(len(checks)),got=='f')
 check('all isolated test cases completed',True)
 print(json.dumps({'status':'ISOLATED_POSTGRES_PASS_NOT_DEV_OR_NATIVE','checks':checks,'count':len(checks),'containerNetwork':'none','syntheticFixturesOnly':True}))

finally:
 if created:docker('rm','-f',NAME,check=False)
