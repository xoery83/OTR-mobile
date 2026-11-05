#!/usr/bin/env python3
"""One network-none synthetic PG fixture. No Hosted/credentials/runtime installation."""
import hashlib, json, pathlib, re, subprocess, time, uuid, runpy
ROOT=pathlib.Path(__file__).resolve().parents[4]
OUT=pathlib.Path(__file__).resolve().parent
D=['/opt/homebrew/bin/docker','--context','colima']; NAME='otr-self-nickname-shape-'+uuid.uuid4().hex[:12]
IMAGE='otr-core-v2-server84-fixture:20261012'; IMAGE_ID='sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068'
checks=[]; created=False; phase='start'
q=lambda s:"'"+str(s).replace("'","''")+"'"
canon=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'))
def sql(s,role='supabase_admin',failure=False):
 p=subprocess.run(D+['exec','-i',NAME,'psql','-XqAt','-h','127.0.0.1','-U',role,'-d','postgres','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,timeout=30)
 with (OUT/'LOCAL_PG.log').open('a') as f:f.write('\n['+phase+']\n'+p.stdout+p.stderr)
 if p.returncode and not failure:raise RuntimeError(phase+': '+p.stderr[-1200:])
 return p

def source_function(path,name):
 s=(ROOT/path).read_text(); match=re.search(r'create function public\.'+name+r'\([\s\S]*?\$\$;',s,re.I)
 assert match,name
 return re.sub(r'^create function','CREATE OR REPLACE FUNCTION',match.group(),flags=re.I)
try:
 subprocess.run(D+['run','--detach','--pull=never','--network','none','--memory','256m','--cpus','1','--label','otr.core.fixture=self-nickname-shape','--name',NAME,IMAGE],capture_output=True,check=True,timeout=30); created=True
 assert subprocess.check_output(D+['inspect','--format','{{.Image}}',NAME],text=True).strip()==IMAGE_ID
 for _ in range(40):
  if subprocess.run(D+['exec',NAME,'pg_isready','-U','supabase_admin'],capture_output=True,timeout=5).returncode==0:break
  time.sleep(.25)
 else:raise RuntimeError('LOCAL_PG_NOT_READY')
 phase='minimal-canonical-dependency-fixture'
 # Real normal registered Actor/membership/removed-user admission, not an Actor=true stub.
 sql("""ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;
 DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_writer') THEN CREATE ROLE otr_trip_core_v2_writer NOLOGIN NOINHERIT;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_gateway') THEN CREATE ROLE otr_trip_core_v2_gateway LOGIN NOINHERIT CONNECTION LIMIT 1;END IF;END$$;
 GRANT otr_trip_core_v2_writer TO otr_trip_core_v2_gateway WITH INHERIT FALSE,SET TRUE;
 GRANT otr_trip_core_v2_gateway TO postgres WITH ADMIN TRUE,INHERIT FALSE,SET TRUE;
 SET ROLE postgres;
 CREATE SCHEMA IF NOT EXISTS otr_auth_guest_composite;
 CREATE TABLE IF NOT EXISTS otr_auth_guest_composite.transaction_scopes(backend_pid integer,transaction_id xid8);
 CREATE OR REPLACE FUNCTION otr_auth_guest_composite.has_scope() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT EXISTS(SELECT 1 FROM otr_auth_guest_composite.transaction_scopes WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id())$$;
 CREATE TABLE public.trip_sustained_dev_policy(actor_account_id uuid PRIMARY KEY REFERENCES auth.users(id),enabled boolean NOT NULL DEFAULT false,adoption_cutoff timestamptz NOT NULL,revoked_at timestamptz);
 CREATE TABLE public.trip_create_receipts(operation_id uuid PRIMARY KEY,actor_account_id uuid NOT NULL,trip_id uuid NOT NULL,request_payload jsonb NOT NULL);
 CREATE TABLE public.trip_core_activation_gate(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),scope_actor_account_id uuid,scope_trip_id uuid,scope_started_at timestamptz,scope_expires_at timestamptz);
 INSERT INTO public.trip_core_activation_gate(singleton) VALUES(true);
 """)
 event='supabase/migrations/20261004000400_trip_event_command_foundation.sql'
 for name in ['trip_event_canonical_json','trip_event_keys','trip_event_utc_timestamp']:
  sql('SET ROLE postgres;'+source_function(event,name))
 sql('SET ROLE postgres;'+source_function('supabase/migrations/20261004000600_trip_person_command_foundation.sql','trip_person_hash'))
 read=(ROOT/'docs/ops/core-member-read-20261104/INSTALL_CANDIDATE.sql').read_text()
 body=read[read.index('CREATE FUNCTION public.trip_sustained_core_read_scope_allowed'):read.index('REVOKE ALL ON FUNCTION public.trip_sustained_core_read_scope_allowed')]
 sql('SET ROLE postgres;'+body)
 actor=str(uuid.uuid4()); other=str(uuid.uuid4()); trip=str(uuid.uuid4()); person=str(uuid.uuid4()); other_person=str(uuid.uuid4()); unlinked=str(uuid.uuid4())
 sql("SET ROLE postgres;INSERT INTO auth.users(id,is_anonymous) VALUES("+q(actor)+"::uuid,false),("+q(other)+"::uuid,false);INSERT INTO public.profiles(id,display_name) VALUES("+q(actor)+"::uuid,'QA Actor'),("+q(other)+"::uuid,'QA Owner');INSERT INTO public.trips(id,created_by,name) VALUES("+q(trip)+"::uuid,"+q(other)+"::uuid,'Nickname synthetic');")
 # Canonical Trip creation trigger already creates its Owner Person.
 other_person=sql('SELECT id FROM public.journey_members WHERE trip_id='+q(trip)+'::uuid AND user_id='+q(other)+'::uuid;').stdout.strip();assert other_person
 sql("SET ROLE postgres;INSERT INTO public.journey_members(id,trip_id,user_id,display_name,role,status) VALUES("+q(person)+"::uuid,"+q(trip)+"::uuid,"+q(actor)+"::uuid,"+q(' old '*100)+",'group_member','linked'),("+q(unlinked)+"::uuid,"+q(trip)+"::uuid,NULL,'Draft','group_member','unlinked');INSERT INTO public.trip_create_receipts VALUES(gen_random_uuid(),"+q(other)+"::uuid,"+q(trip)+"::uuid,'{\"formatVersion\":2}');")
 phase='actual-seven-constraints-and-predicates'
 renderer=runpy.run_path(str(OUT/'render_shape.py'));catalog=renderer['inputs']()
 private=json.loads(pathlib.Path(catalog['observation']['privateResultPath']).read_text())
 assert hashlib.sha256(pathlib.Path(catalog['observation']['privateResultPath']).read_bytes()).hexdigest()==catalog['observation']['privateResultSHA256']
 cols=[]
 for c in private['columns']:
  cols.append('"'+c['name']+'" '+c['type']+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['notNull'] else ''))
 constraints=[ 'CONSTRAINT "'+c['name']+'" '+c['definition'] for c in catalog['allActivationConstraints']]
 sql('SET ROLE postgres;DROP TABLE public.trip_core_activation_gate;CREATE TABLE public.trip_core_activation_gate('+','.join(cols+constraints)+');INSERT INTO public.trip_core_activation_gate(singleton) VALUES(true);GRANT SELECT ON public.trip_core_activation_gate TO otr_trip_core_v2_gateway,otr_trip_core_v2_writer;')
 # Minimal unused dependent record shapes so unchanged actual predicates can be
 # planned. No positive authorization stub, airport call or Provider involved.
 sql('''SET ROLE postgres;
 ALTER TABLE public.trip_sustained_dev_policy ADD COLUMN universal_p1_import_enabled boolean DEFAULT false,ADD COLUMN universal_p1_review_scope jsonb;
 ALTER TABLE public.itinerary_events ADD COLUMN IF NOT EXISTS owner_account_id uuid,ADD COLUMN IF NOT EXISTS experience_family text,ADD COLUMN IF NOT EXISTS business_contract_version smallint;
 ALTER TABLE public.itinerary_transport_services ADD COLUMN IF NOT EXISTS trip_id uuid;
 CREATE TABLE public.trip_flight_intents(event_id uuid,trip_id uuid,qualification text);
 CREATE TABLE public.trip_booking_item_links(trip_id uuid,item_id uuid,active boolean);
 CREATE TABLE public.trip_core_command_receipts(actor_account_id uuid,trip_id uuid,operation_id uuid,outcome text,command_version int,intent_version int,receipt_version int,canonical_intent_text text,intent_sha256 text,body jsonb,receipt_sha256 text);
 CREATE TABLE public.trip_source_core_v2_slots(account_id uuid,trip_id uuid,operation_id uuid,command text,canonical_intent_text text);
 DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_create_gateway') THEN CREATE ROLE otr_trip_create_gateway NOLOGIN NOINHERIT;END IF;END$$;
 CREATE OR REPLACE FUNCTION otr_auth_guest_composite.mutation_allowed() RETURNS boolean LANGUAGE sql AS $$SELECT NOT otr_auth_guest_composite.has_scope()$$;
 ''')
 for f in catalog['functions']:
  sql('SET ROLE postgres;'+pathlib.Path(f['privateDefinitionPath']).read_text())
  sig=f['name']+'('+','.join(x.strip().split()[-1] for x in f['identityArguments'].split(','))+')' if f['identityArguments'] else f['name']+'()'
  sql('SET ROLE postgres;REVOKE ALL ON FUNCTION public.'+sig+' FROM PUBLIC,anon,authenticated,service_role;'+''.join('GRANT EXECUTE ON FUNCTION public.'+sig+' TO '+a.split('=')[0]+';' for a in f['acl']))
  observed_acl=json.loads(sql("SELECT to_json(proacl::text[]) FROM pg_proc WHERE oid='public."+sig+"'::regprocedure;").stdout);assert observed_acl==f['acl'],(f['name'],observed_acl)
  assert sql("SELECT encode(sha256(convert_to(pg_get_functiondef('public."+sig+"'::regprocedure),'UTF8')),'hex');").stdout.strip()==f['definitionSHA256']
 checks.append('ALL_7_ACTUAL_FUNCTION_BODIES_IDENTICAL')
 def constraint_hashes():
  return json.loads(sql("SELECT json_object_agg(conname,encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')) FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass;").stdout)
 expected={c['name']:c['definitionSHA256'] for c in catalog['allActivationConstraints']};assert constraint_hashes()==expected;checks.append('ALL_7_ACTUAL_CONSTRAINTS_EXACT')
 phase='nickname-source-prerequisite'
 sql("SET ROLE postgres;SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.core.self_nickname_install_gate='OTR_SELF_NICKNAME_V1_DEFAULT_CLOSED';"+(ROOT/'backend/sql/tripPersonSelfNickname.sql').read_text())
 sql('SET ROLE postgres;GRANT EXECUTE ON FUNCTION public.trip_person_self_nickname(uuid,uuid,uuid,text,jsonb) TO otr_trip_core_v2_gateway;')
 active="self_nickname_enabled=true,scope_actor_account_id="+q(actor)+"::uuid,scope_trip_id="+q(trip)+"::uuid,scope_started_at=clock_timestamp()-interval '1 second',scope_expires_at=clock_timestamp()+interval '10 minutes'"
 red=sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+active+';',failure=True);assert red.returncode and 'finite_core_scope_contract' in red.stderr;checks.append('ACTUAL_PREIMAGE_RED_NICKNAME_ONLY_SHAPE_DENIED')
 new=renderer['definition'](catalog)
 # Normalize the proposed expression with the real PG parser on a temporary
 # structure only; its exact postimage hash then pins both source renderings.
 probe=sql('SET ROLE postgres;CREATE TEMP TABLE shape_probe (LIKE public.trip_core_activation_gate);ALTER TABLE shape_probe ADD CONSTRAINT finite_core_scope_contract '+new+";SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='shape_probe'::regclass AND conname='finite_core_scope_contract';").stdout.strip()
 post=hashlib.sha256(probe.encode()).hexdigest();renderer['render'](post)
 qualify="SET ROLE postgres;SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.core.self_nickname_shape_gate='OTR_SELF_NICKNAME_ACTIVATION_SHAPE_V1';"
 phase='exact-forward-inverse-closed'
 sql(qualify+(OUT/'FORWARD_CANDIDATE.sql').read_text());expected_after={**expected,'finite_core_scope_contract':post};assert constraint_hashes()==expected_after
 sql(qualify+(OUT/'ROLLBACK_CANDIDATE.sql').read_text());assert constraint_hashes()==expected
 sql(qualify+(OUT/'FORWARD_CANDIDATE.sql').read_text());checks.append('EXACT_FORWARD_INVERSE_NO_HISTORY_RESTORES_7_CONSTRAINTS')
 # Old finite arm remains possible with nickname false; no old command is sent.
 legacy="runtime_enabled=true,enabled_commands=ARRAY['CREATE_ITEM'],enabled_families=ARRAY['P1','P3'],enabled_admission_modes=ARRAY['MANUAL'],scope_actor_account_id="+q(actor)+"::uuid,scope_trip_id="+q(trip)+"::uuid,scope_started_at=clock_timestamp(),scope_expires_at=clock_timestamp()+interval '5 minutes'"
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+legacy+';')
 assert sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET self_nickname_enabled=true;',failure=True).returncode;checks.append('OLD_FINITE_ARM_PRESERVED_NO_MIXED_NICKNAME_CORE')
 close="self_nickname_enabled=false,runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}',scope_actor_account_id=NULL,scope_trip_id=NULL,scope_started_at=NULL,scope_expires_at=NULL"
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+close+';')
 def call(method,payload,fail=False):
  p=sql('BEGIN;SELECT set_config(\'otr.core.actor\','+q(actor)+',true),set_config(\'otr.core.trip\','+q(trip)+',true);SELECT public.trip_person_self_nickname('+q(actor)+'::uuid,'+q(trip)+'::uuid,'+q(person)+'::uuid,'+q(method)+','+q(canon(payload))+'::jsonb);COMMIT;','otr_trip_core_v2_gateway',failure=fail)
  return p if p.returncode else json.loads(p.stdout.strip().splitlines()[-1])
 def query_gate(who):
  p=sql('BEGIN;SELECT set_config(\'otr.core.actor\','+q(who)+',true),set_config(\'otr.core.trip\','+q(trip)+',true);SELECT public.trip_core_finite_scope_allowed('+q(who)+'::uuid,'+q(trip)+'::uuid);COMMIT;','otr_trip_core_v2_gateway');return p.stdout.strip().splitlines()[-1]
 def owner_capabilities():
  out=sql('BEGIN;SELECT set_config(\'otr.core.actor\','+q(other)+',true),set_config(\'otr.core.trip\','+q(trip)+',true);SELECT row_to_json(c) FROM public.trip_sustained_core_capabilities('+q(other)+'::uuid,'+q(trip)+'::uuid) c;COMMIT;','otr_trip_core_v2_gateway');return json.loads(out.stdout.strip().splitlines()[-1])
 owner_before=owner_capabilities();assert owner_before['runtime_enabled'] is True
 before=query_gate(actor);assert before=='f'
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+active+';');assert query_gate(actor)==before;checks.append('NICKNAME_SCOPE_DOES_NOT_ENABLE_ACTUAL_FINITE_PREDICATE')
 for patch in ["scope_expires_at=scope_started_at+interval '16 minutes'","runtime_enabled=true","enabled_commands=ARRAY['CREATE_ITEM']","source_review_enabled=true"]:
  assert sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+patch+';',failure=True).returncode
 checks.append('NICKNAME_ARM_REJECTS_OVERLEASE_RUNTIME_COMMANDS_SOURCE_REVIEW')
 assert owner_capabilities()==owner_before;checks.append('EXISTING_NORMAL_OWNER_CAPABILITIES_UNCHANGED_NOT_GLOBALLY_DISABLED')
 # Old normal capabilities depend only on unchanged sustained policy/identity:
 # prove absent Core authority for this non-owner, rather than simulating a grant.
 for fn in ['trip_sustained_core_capabilities']:
  p=sql('BEGIN;SELECT set_config(\'otr.core.actor\','+q(actor)+',true),set_config(\'otr.core.trip\','+q(trip)+',true);SELECT * FROM public.'+fn+'('+q(actor)+'::uuid,'+q(trip)+'::uuid);ROLLBACK;','otr_trip_core_v2_gateway',failure=True)
  assert p.returncode and 'CORE_CAPABILITY_CLOSED' in p.stderr
 checks.append('ACTUAL_SUSTAINED_CAPABILITY_NONOWNER_STAYS_CLOSED')
 phase='actual-old-core-row-and-statement-guards'
 # This archived dependency only resolves a call signature in the actual guard;
 # its Source-table arm is unreachable for itinerary_events/services tests.
 sql('SET ROLE postgres;CREATE TABLE public.trip_source_core_v2_publications(publication_id uuid);'+(ROOT/'docs/ops/trip-p1-sustained-sync-20261024/DEV_SOURCE_ROW_HELPER_PREIMAGE.sql').read_text())
 sql('''SET ROLE postgres;
 GRANT USAGE ON SCHEMA otr_auth_guest_composite TO otr_trip_core_v2_writer;
 GRANT EXECUTE ON FUNCTION otr_auth_guest_composite.mutation_allowed(),otr_auth_guest_composite.has_scope() TO otr_trip_core_v2_writer;
 GRANT EXECUTE ON FUNCTION public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text),public.trip_core_finite_scope_allowed(uuid,uuid) TO otr_trip_core_v2_writer;
 GRANT INSERT ON public.itinerary_events,public.itinerary_transport_services TO otr_trip_core_v2_writer;
 CREATE TRIGGER "000_shape_actual_row_guard" BEFORE INSERT ON public.itinerary_events FOR EACH ROW EXECUTE FUNCTION public.trip_core_guard_write();
 CREATE TRIGGER "000_shape_actual_statement_guard" BEFORE INSERT ON public.itinerary_transport_services FOR EACH STATEMENT EXECUTE FUNCTION public.trip_core_service_statement_guard();
 ''')
 setup='BEGIN;SELECT set_config(\'otr.core.actor\','+q(actor)+',true),set_config(\'otr.core.trip\','+q(trip)+',true),set_config(\'otr.core.command\',\'CREATE_ITEM\',true),set_config(\'otr.core.family\',\'P1\',true),set_config(\'otr.core.admission\',\'MANUAL\',true);SET LOCAL ROLE otr_trip_core_v2_writer;'
 for insert in ['INSERT INTO public.itinerary_events(trip_id,business_contract_version,owner_account_id,experience_family) VALUES('+q(trip)+'::uuid,2,'+q(actor)+"::uuid,'P1')",'INSERT INTO public.itinerary_transport_services DEFAULT VALUES']:
  denied=sql(setup+insert+';COMMIT;','otr_trip_core_v2_gateway',failure=True)
  assert denied.returncode and 'CORE_V2_CAPABILITY_CLOSED' in denied.stderr,denied.stderr
 checks.append('ACTUAL_ROW_AND_STATEMENT_GUARDS_DENY_OLD_CORE_WRITE')

 def cmd():
  c={'contractVersion':1,'command':'SET_SELF_TRIP_NICKNAME','operationId':str(uuid.uuid4()),'tripId':trip,'personId':person,'expectedNicknameRevision':0,'nickname':None};c['intentDigest']=hashlib.sha256(('otr-self-trip-nickname-intent-v1\n'+canon([1,c['command'],c['operationId'],actor,trip,person,'0',None])).encode()).hexdigest();return c
 c=cmd()
 for patch in ["scope_expires_at=clock_timestamp()-interval '1 second'","scope_actor_account_id=gen_random_uuid()","scope_trip_id=gen_random_uuid()"]:
  sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+patch+';');assert isinstance(call('EXECUTE',c,True),subprocess.CompletedProcess)
  sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+active+';')
 checks.append('ACTUAL_FULL_SHAPE_EXPIRED_WRONG_ACTOR_TRIP_DENY')
 r=call('EXECUTE',c);assert r['receipt']['outcome']=='APPLIED';checks.append('ACTUAL_FULL_SHAPE_NICKNAME_ONLY_APPLIED')
 # Closure cannot leave new shared scope in a legacy closed row. It is one CAS
 # UPDATE of the owned bit plus its exact shared-scope fields, not runtime=true.
 assert sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET self_nickname_enabled=false;',failure=True).returncode
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+close+';')
 assert call('READ',{})['nicknameRevision']==1
 assert call('RECEIPT',{'operationId':c['operationId'],'intentDigest':c['intentDigest']})=={'kind':'EXACT_RECEIPT','receipt':r['receipt']};checks.append('ATOMIC_CLOSED_SCOPE_READ_RECOVER_RETAINED')
 inverse=sql(qualify+(OUT/'ROLLBACK_CANDIDATE.sql').read_text(),failure=True);assert inverse.returncode and 'HISTORY_FORBIDS' in inverse.stderr;assert constraint_hashes()==expected_after;checks.append('ACCEPTED_HISTORY_BLOCKS_INVERSE_NO_PARTIAL_CHANGE')
 assert len(catalog['functions'])==7
 for f in catalog['functions']:
  sig=f['name']+'('+','.join(x.strip().split()[-1] for x in f['identityArguments'].split(','))+')' if f['identityArguments'] else f['name']+'()'
  assert sql("SELECT encode(sha256(convert_to(pg_get_functiondef('public."+sig+"'::regprocedure),'UTF8')),'hex');").stdout.strip()==f['definitionSHA256']
 checks.append('ALL_7_PREDICATES_UNCHANGED_POST_SHAPE_AND_NICKNAME')
 result={'status':'LOCAL_ACTUAL_SHAPE_PASS_NOT_INSTALLED','checks':checks,'beforeDefinitionSHA256':expected['finite_core_scope_contract'],'afterDefinition':probe,'afterDefinitionSHA256':post,'allSevenFunctionHashes':{f['name']:f['definitionSHA256'] for f in catalog['functions']},'catalogReturnSHA256':renderer['EXPECTED'],'imageId':IMAGE_ID,'limits':'Real all7 constraints and all7 function bodies/ACLs loaded unchanged. Synthetic minimal dependencies, not Hosted parity. No old23 rerun.'}
 (OUT/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:
 if created:
  subprocess.run(D+['stop','--time','2',NAME],capture_output=True,timeout=15)
  subprocess.run(D+['rm',NAME],capture_output=True,timeout=15)
