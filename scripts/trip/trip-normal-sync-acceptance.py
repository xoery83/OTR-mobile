"""Real PG17, unique cached network-none Server84 clone; no DEV/Hosted/Auth or GUI."""
import json
import pathlib
import subprocess
import time
import uuid
ROOT=pathlib.Path(__file__).resolve().parents[2]
IMAGE='otr-core-v2-server84-fixture:20261012'
NAME='otr-trip-normal-'+uuid.uuid4().hex[:12]
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
def command(req,actor=ACTOR):return "select public.trip_metadata_update_command("+','.join([literal(req['operationId'])+'::uuid',literal(actor)+'::uuid',literal(req['tripId'])+'::uuid',literal(json.dumps(req))+'::jsonb'])+");"

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

 sql('set role postgres;'+(ROOT/'supabase/dev-forward/trip-destinations/20261023000100_trip_structured_destinations.sql').read_text())
 sql('set role postgres;'+(ROOT/'supabase/migrations/20261013000200_core_ordinary_order.sql').read_text())
 signatures=['public.trip_create_finite_scope_allowed(uuid,uuid,uuid)','public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)','public.trip_core_finite_scope_allowed(uuid,uuid)','public.trip_core_guard_write()','public.trip_core_finite_read_state_guard()','public.trip_create_command(uuid,uuid,uuid,jsonb)','public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)']
 preimage={signature:{'md5':sql('select md5(pg_get_functiondef('+literal(signature)+'::regprocedure));'),'definition':sql('select pg_get_functiondef('+literal(signature)+'::regprocedure);')} for signature in signatures}
 constraints=json.loads(sql("select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)) order by conname) from pg_constraint where contype='c' and (conrelid in ('public.trip_create_activation_gate'::regclass,'public.trip_metadata_activation_gate'::regclass) and pg_get_constraintdef(oid) like '%request_payload%' or conname='finite_core_scope_contract');"))
 packet=ROOT/'docs/ops/trip-p1-normal-sync-20261024'
 packet.mkdir(parents=True,exist_ok=True)
 (packet/'SQL_PREIMAGE.json').write_text(json.dumps({'functions':preimage,'constraints':constraints},indent=2))
 sql('set role postgres;'+(ROOT/'supabase/dev-forward/trip-normal-sync/20261024000100_trip_normal_dev_scope.sql').read_text())
 check('candidate installs dormant with no active gate',sql("select (not exists(select 1 from public.trip_create_activation_gate where enabled) and not exists(select 1 from public.trip_metadata_activation_gate where enabled) and not exists(select 1 from public.trip_core_activation_gate where runtime_enabled))::text;")=='true')
 policy="jsonb_build_object('normalDevVersion',1,'adoptionCutoff',to_char(clock_timestamp()-interval '1 second','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'))"
 for table,role in [('trip_create_activation_gate','otr_trip_create_gateway'),('trip_metadata_activation_gate',ROLE)]:
  sql("update public."+table+" set enabled=true,actor_account_id="+literal(ACTOR)+",trip_id=null,operation_id=null,request_payload="+policy+",started_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '1 hour';do $$begin execute format('alter role "+role+" login password %L connection limit 1 valid until %L','metadata-synthetic-only',(select expires_at from public."+table+"));end $$;")
 create_id=str(uuid.uuid4())
 dest=[{'destinationId':str(uuid.uuid4()),'displayLabel':'Wellington','source':'MANUAL'},{'destinationId':str(uuid.uuid4()),'displayLabel':'Auckland','source':'APPLE_PLACE_ID','provider':'apple','providerPlaceId':'fixture-identity-not-native'}]
 req={'formatVersion':2,'operationId':create_id,'tripId':TRIP,'name':'Normal new Trip','destination':None,'destinations':dest,'startDate':'2026-11-02','endDate':'2026-11-04'}
 def createcmd(req,actor=ACTOR):return 'select public.trip_create_command('+','.join([literal(req['operationId'])+'::uuid',literal(actor)+'::uuid',literal(req['tripId'])+'::uuid',literal(json.dumps(req))+'::jsonb'])+');'
 first=json.loads(sql(createcmd(req),'otr_trip_create_gateway'))
 check('normal V2 Create accepts future Trip/op without exact-request gate',first['destinations']==dest)
 check('exact replay receipt immutable',json.loads(sql(createcmd(req),'otr_trip_create_gateway'))==first)
 changed={**req,'name':'collision'}
 sql(createcmd(changed),'otr_trip_create_gateway',failure='TRIP_CREATE_COLLISION');check('same operation different request rejected')
 sql(createcmd({**req,'operationId':str(uuid.uuid4()),'tripId':str(uuid.uuid4())},OTHER),'otr_trip_create_gateway',failure='TRIP_CREATE_CLOSED');check('cross Account denied')
 before={k:req[k] for k in ['name','destination','startDate','endDate','destinations']}
 after={**before,'name':'Normal Edit','destinations':list(reversed(dest))}
 edit={'formatVersion':3,'operationId':str(uuid.uuid4()),'tripId':TRIP,'before':before,'after':after,'expectedMetadataRevision':0}
 got=json.loads(sql(command(edit),ROLE));check('normal V3 Edit full-list CAS accepts',got['after']==after and got['resultMetadataRevision']==1)
 check('metadata exact replay',json.loads(sql(command(edit),ROLE))==got)
 sql(command({**edit,'operationId':str(uuid.uuid4())}),ROLE,failure='METADATA_STALE_REVISION_OR_TUPLE');check('stale CAS rejected')
 sql(command({**edit,'tripId':LEGACY,'operationId':str(uuid.uuid4())}),ROLE,failure='METADATA_CLOSED');check('old scalar/V1 Trip excluded')
 check('independent SQL readback preserves entire list',json.loads(sql("select destinations from public.trips where id="+literal(TRIP)+";"))==after['destinations'])
 sql("update public.trip_core_activation_gate set runtime_enabled=true,scope_actor_account_id="+literal(ACTOR)+",scope_trip_id=null,scope_started_at=(select started_at from public.trip_metadata_activation_gate),scope_expires_at=(select expires_at from public.trip_metadata_activation_gate),enabled_commands=ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION'],enabled_families=ARRAY['P1'],enabled_admission_modes=ARRAY['MANUAL'];do $$begin execute format('alter role otr_trip_core_v2_gateway login password %L connection limit 1 valid until %L','metadata-synthetic-only',(select scope_expires_at from public.trip_core_activation_gate));end $$;")
 node=subprocess.run(['npx','tsx',str(ROOT/'scripts/trip/normal-p1-owned-fixture.mts'),NAME,ACTOR,TRIP],cwd=ROOT,capture_output=True,text=True,timeout=60)
 assert node.returncode==0,node.stdout+node.stderr
 print(node.stdout.strip());check('P1 Create and four Edit commands actual PG acceptance/replay')
 sql("update public.trip_metadata_activation_gate set request_payload=jsonb_set(request_payload,'{adoptionCutoff}',to_jsonb(started_at::text)),started_at=started_at;update public.trip_metadata_activation_gate set started_at=clock_timestamp()-interval '1 second',request_payload=jsonb_set(request_payload,'{adoptionCutoff}',to_jsonb((clock_timestamp()-interval '2 seconds')::text));")
 # A real expired scope must reject reads/results without making a new mutation.
 sql("update public.trip_create_activation_gate set started_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour';")
 sql('select public.trip_create_result('+literal(create_id)+'::uuid,'+literal(ACTOR)+'::uuid);','otr_trip_create_gateway',failure='TRIP_CREATE_CAPABILITY_CLOSED');check('expired normal scope rejects retained result')
 sql("update public.trip_core_activation_gate set runtime_enabled=false,scope_actor_account_id=null,scope_trip_id=null,scope_started_at=null,scope_expires_at=null,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}';alter role otr_trip_core_v2_gateway nologin;")
 for table,role in [('trip_create_activation_gate','otr_trip_create_gateway'),('trip_metadata_activation_gate',ROLE)]:
  sql("update public."+table+" set enabled=false,actor_account_id=null,trip_id=null,operation_id=null,request_payload=null,started_at=null,expires_at=null;alter role "+role+" nologin;")
 check('normal Gate closes with principals NOLOGIN',sql("select (not exists(select 1 from pg_roles where rolname in ('otr_trip_create_gateway','otr_trip_metadata_gateway') and rolcanlogin))::text;")=='true')
 rollback="BEGIN;SET LOCAL search_path=pg_catalog;DO $$BEGIN IF EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled) OR EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled) OR EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway') AND rolcanlogin) THEN RAISE EXCEPTION 'NORMAL_CLOSE_BEFORE_ROLLBACK';END IF;END$$;\n"
 for signature in signatures+['public.trip_normal_dev_scope_allowed(uuid,uuid,uuid,text)']:
  posthash=sql('select md5(pg_get_functiondef('+literal(signature)+'::regprocedure));')
  rollback+="DO $$BEGIN IF md5(pg_get_functiondef("+literal(signature)+"::regprocedure))<>"+literal(posthash)+" THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;\n"
 rollback+='\n'.join(row['definition']+';' for row in preimage.values())
 for c in constraints:rollback+='\nALTER TABLE public.'+c['table'].removeprefix('public.')+' DROP CONSTRAINT '+c['name']+', ADD CONSTRAINT '+c['name']+' '+c['definition']+';'
 rollback+='\nDROP FUNCTION public.trip_normal_dev_scope_allowed(uuid,uuid,uuid,text);COMMIT;'
 rollback=rollback.replace('\\n','\n')
 (ROOT/'supabase/dev-forward/trip-normal-sync/20261024000100_trip_normal_dev_scope.rollback.sql').write_text(rollback)
 before_data=sql("select jsonb_build_object('trip',to_jsonb(t),'coreReceiptCount',(select count(*) from public.trip_core_command_receipts where trip_id=t.id)) from public.trips t where t.id="+literal(TRIP)+";")
 sql('set role postgres;'+rollback)
 check('rollback restores original function hashes',all(sql('select md5(pg_get_functiondef('+literal(signature)+'::regprocedure));')==row['md5'] for signature,row in preimage.items()))
 check('rollback retains accepted Trip and Core receipts',before_data==sql("select jsonb_build_object('trip',to_jsonb(t),'coreReceiptCount',(select count(*) from public.trip_core_command_receipts where trip_id=t.id)) from public.trips t where t.id="+literal(TRIP)+";"))
 print(json.dumps({'status':'ISOLATED_POSTGRES_PASS_NOT_DEV_OR_NATIVE','checks':checks,'count':len(checks),'network':'none'}))
finally:
 if created:docker('rm','-f',NAME,check=False)
