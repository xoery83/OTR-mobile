#!/usr/bin/env python3
"""One network-none synthetic PG fixture. No Hosted/credentials/runtime installation."""
import concurrent.futures, hashlib, json, pathlib, re, subprocess, time, uuid
ROOT=pathlib.Path(__file__).resolve().parents[4]
OUT=pathlib.Path(__file__).resolve().parent
D=['/opt/homebrew/bin/docker','--context','colima']; NAME='otr-self-nickname-'+uuid.uuid4().hex[:12]
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
 subprocess.run(D+['run','--detach','--pull=never','--network','none','--memory','256m','--cpus','1','--label','otr.core.fixture=self-nickname','--name',NAME,IMAGE],capture_output=True,check=True,timeout=30); created=True
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
 CREATE OR REPLACE FUNCTION otr_auth_guest_composite.has_scope() RETURNS boolean LANGUAGE sql SET search_path=pg_catalog AS $$SELECT EXISTS(SELECT 1 FROM otr_auth_guest_composite.transaction_scopes WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id())$$;
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
 phase='source-default-closed-install-local-only'
 source=(ROOT/'backend/sql/tripPersonSelfNickname.sql').read_text()
 sql("SET ROLE postgres;SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.core.self_nickname_install_gate='OTR_SELF_NICKNAME_V1_DEFAULT_CLOSED';"+source)
 # Only this synthetic fixture grants the candidate RPC to its real normal gateway.
 sql('SET ROLE postgres;GRANT EXECUTE ON FUNCTION public.trip_person_self_nickname(uuid,uuid,uuid,text,jsonb) TO otr_trip_core_v2_gateway;')
 def command(rev=0,value=None,op=None):
  c={'contractVersion':1,'command':'SET_SELF_TRIP_NICKNAME','operationId':op or str(uuid.uuid4()),'tripId':trip,'personId':person,'expectedNicknameRevision':rev,'nickname':value}
  c['intentDigest']=hashlib.sha256(('otr-self-trip-nickname-intent-v1\n'+canon([1,c['command'],c['operationId'],actor,trip,person,str(rev),value])).encode()).hexdigest();return c
 def call(method,payload,who=actor,pid=person,fail=False,prefix='',admin_session=False):
  s=('SET SESSION AUTHORIZATION otr_trip_core_v2_gateway;' if admin_session else '')+'BEGIN;SELECT set_config(\'otr.core.actor\','+q(who)+',true),set_config(\'otr.core.trip\','+q(trip)+',true);'+prefix+'SELECT public.trip_person_self_nickname('+q(who)+'::uuid,'+q(trip)+'::uuid,'+q(pid)+'::uuid,'+q(method)+','+q(canon(payload))+'::jsonb);COMMIT;'
  p=sql(s,'supabase_admin' if admin_session else 'otr_trip_core_v2_gateway',failure=fail)
  if p.returncode:return p
  return json.loads(p.stdout.strip().splitlines()[-1])
 def denied(method,payload,**kw):
  p=call(method,payload,fail=True,**kw);assert isinstance(p,subprocess.CompletedProcess) and p.returncode;return p
 c=command()
 denied('EXECUTE',c);checks.append('DEFAULT_CLOSED_REAL_GATEWAY')
 assert call('READ',{})['nickname']==' old '*100;checks.append('NONOWNER_NONCREATOR_SELF_READ_LEGACY_UNBOUNDED')
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET self_nickname_enabled=true,scope_actor_account_id='+q(actor)+'::uuid,scope_trip_id='+q(trip)+"::uuid,scope_started_at=clock_timestamp()-interval '1 minute',scope_expires_at=clock_timestamp()+interval '5 minutes';")
 phase='self-clear-and-history'
 r=call('EXECUTE',c);assert r['receipt']['outcome']=='APPLIED' and r['receipt']['resulting']=={'nickname':None,'nicknameRevision':1};checks.append('CLEAR_LONG_LEGACY_ATOMIC_REVISION1')
 replay=call('EXECUTE',c);assert replay['receipt']==r['receipt'] and replay['idempotentReplay'];checks.append('EXACT_ORIGINAL_REPLAY_NO_ADVANCE')
 assert call('EXECUTE',command(0,'stale'))['receipt']['outcome']=='REVISION_CONFLICT';checks.append('STALE_REVISION_CONFLICT_NO_REBASE')
 assert call('EXECUTE',command(1))['receipt']['outcome']=='UNCHANGED';checks.append('UNCHANGED_CLEAR_NO_ADVANCE')
 denied('EXECUTE',command(1,'tamper',c['operationId']));checks.append('OPERATION_REUSE_CHANGED_INTENT_DENIED')
 denied('READ',{},who=other,pid=person);checks.append('OWNER_CANNOT_EDIT_OR_READ_OTHERS_SELF_PORT')
 denied('READ',{},pid=other_person);checks.append('FOREIGN_PERSON_DENIED')
 before=call('READ',{})
 bad=sql('SET ROLE postgres;UPDATE public.journey_members SET display_name=\'profile refill\' WHERE id='+q(person)+'::uuid;',failure=True);assert bad.returncode;assert call('READ',{})==before or call('READ',{})['nicknameRevision']==1;checks.append('LINKED_PROFILE_REFILL_BLOCKED')
 claimant=str(uuid.uuid4())
 sql("SET ROLE postgres;INSERT INTO auth.users(id,is_anonymous) VALUES("+q(claimant)+"::uuid,false);INSERT INTO public.profiles(id,display_name) VALUES("+q(claimant)+"::uuid,'Claimant');")
 sql('SET ROLE postgres;UPDATE public.journey_members SET display_name=\'First Claim Name\',status=\'linked\',user_id='+q(claimant)+'::uuid WHERE id='+q(unlinked)+'::uuid;')
 assert sql('SELECT nickname_revision FROM public.journey_members WHERE id='+q(unlinked)+'::uuid;').stdout.strip()=='1';checks.append('EXISTING_UNLINKED_FIRST_CLAIM_NAME_CHANGE_COUNTER_ONLY')
 # Return fixture to a unique current linked identity after checking preserved legacy update.
 sql('SET ROLE postgres;UPDATE public.journey_members SET user_id=NULL,status=\'unlinked\' WHERE id='+q(unlinked)+'::uuid;')
 phase='closure-and-original-recovery'
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET self_nickname_enabled=false;')
 assert call('RECEIPT',{'operationId':c['operationId'],'intentDigest':c['intentDigest']})=={'kind':'EXACT_RECEIPT','receipt':r['receipt']};checks.append('RECOVER_AFTER_WRITE_CLOSE_NO_CURRENT_STATE_SUBSTITUTION')
 assert call('RECEIPT',{'operationId':str(uuid.uuid4()),'intentDigest':'0'*64})=={'kind':'ABSENT_UNCONFIRMED'};checks.append('ABSENT_UNCONFIRMED_NOT_SAFE_RETRY')
 denied('EXECUTE',command(1,'closed'));checks.append('NEW_MUTATION_AFTER_CLOSE_DENIED')
 phase='concurrency-rollback'
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET self_nickname_enabled=true;')
 # Concurrent local sessions use actual gateway session authorization; this is SQL
 # row-lock testing, not a claim about the production single-connection pool.
 cmds=[command(1,'one'),command(1,'two')]
 with concurrent.futures.ThreadPoolExecutor(2) as pool:outs=list(pool.map(lambda x:call('EXECUTE',x,admin_session=True),cmds))
 assert sorted(x['receipt']['outcome'] for x in outs)==['APPLIED','REVISION_CONFLICT'];checks.append('CONCURRENT_SAME_BASE_ONE_APPLIED_ONE_CONFLICT')
 current=call('READ',{});rollback=command(current['nicknameRevision'],'rollback')
 p=call('EXECUTE',rollback,fail=True,prefix='SET LOCAL statement_timeout=\'10s\';',admin_session=False)
 assert p['receipt']['outcome']=='APPLIED'
 # Force error after RPC within same real transaction; rollback must remove both.
 rollback2=command(current['nicknameRevision']+1,'fault')
 raw='BEGIN;SELECT set_config(\'otr.core.actor\','+q(actor)+',true),set_config(\'otr.core.trip\','+q(trip)+',true);SELECT public.trip_person_self_nickname('+q(actor)+'::uuid,'+q(trip)+'::uuid,'+q(person)+'::uuid,\'EXECUTE\','+q(canon(rollback2))+'::jsonb);SELECT 1/0;COMMIT;'
 assert sql(raw,'otr_trip_core_v2_gateway',failure=True).returncode
 assert call('RECEIPT',{'operationId':rollback2['operationId'],'intentDigest':rollback2['intentDigest']})['kind']=='ABSENT_UNCONFIRMED';checks.append('POST_RPC_FAULT_ROLLS_BACK_ROW_AND_RECEIPT')
 phase='bounded-scope-counter-and-privilege-negatives'
 for patch in ["scope_expires_at='infinity'::timestamptz", "scope_expires_at=clock_timestamp()-interval '1 second'", "scope_trip_id=gen_random_uuid()", "scope_actor_account_id=gen_random_uuid()"]:
  sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET '+patch+';')
  denied('EXECUTE',command(3,'scope must not write'))
  sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET scope_actor_account_id='+q(actor)+'::uuid,scope_trip_id='+q(trip)+"::uuid,scope_expires_at=clock_timestamp()+interval '5 minutes';")
 checks.append('NONFINITE_EXPIRED_WRONG_TRIP_WRONG_ACTOR_SCOPE_DENIED')
 for query in ['UPDATE public.journey_members SET nickname_revision=nickname_revision+1 WHERE id='+q(person)+'::uuid', "UPDATE public.trip_person_nickname_receipts SET result_payload='{}'::jsonb", 'DELETE FROM public.trip_person_nickname_receipts', 'TRUNCATE public.trip_person_nickname_receipts']:
  assert sql('SET ROLE postgres;'+query+';',failure=True).returncode
 checks.append('COUNTER_TAMPER_AND_RECEIPT_UPDATE_DELETE_TRUNCATE_DENIED')
 assert sql('SELECT * FROM public.trip_person_nickname_receipts;','otr_trip_core_v2_gateway',failure=True).returncode
 checks.append('GATEWAY_NO_DIRECT_RECEIPT_TABLE_ACCESS')
 live=call('READ',{}); unicode=command(live['nicknameRevision'],'旅人 Jo')
 assert call('EXECUTE',unicode)['receipt']['resulting']['nickname']=='旅人 Jo';checks.append('ACTUAL_SQL_UTF8_DIGEST_MATCH')
 bad=command(live['nicknameRevision']+1,' bad ')
 denied('EXECUTE',bad);checks.append('SQL_SET_TRIM_REJECTS_WITHOUT_CHANGING_OBSERVATION')
 denied('EXECUTE',command(live['nicknameRevision']+1,'valid',op='11111111-1111-0111-0111-111111111111'));checks.append('SQL_UUID_VARIANT_MATCHES_CANONICAL_CODEC')
 phase='authorization-negative'
 sql('SET ROLE postgres;INSERT INTO public.journey_removed_users(trip_id,user_id,removed_at) VALUES('+q(trip)+'::uuid,'+q(actor)+'::uuid,clock_timestamp());')
 denied('READ',{});denied('RECEIPT',{'operationId':c['operationId'],'intentDigest':c['intentDigest']});checks.append('REVOKED_SELF_READ_AND_RECOVERY_DENIED_NO_NEW_WRITE')
 result={'status':'LOCAL_ISOLATED_PG_PASS_NOT_HOSTED','checks':checks,'imageId':IMAGE_ID,'scope':'minimal synthetic dependency fixture with actual normal admission function body, no Actor=true stub; production Root2 preimages/ACL/runtime not qualified','sourceSha256':hashlib.sha256(source.encode()).hexdigest()}
 (OUT/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:
 if created:
  subprocess.run(D+['stop','--time','2',NAME],capture_output=True,timeout=15)
  subprocess.run(D+['rm',NAME],capture_output=True,timeout=15)
