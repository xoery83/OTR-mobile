#!/usr/bin/env python3
"""Network-none synthetic PG checks. No Hosted connection or credential access."""
import argparse,subprocess,pathlib,json,time,uuid,hashlib,runpy,concurrent.futures
p=argparse.ArgumentParser();p.add_argument('--preimages',type=pathlib.Path,required=True);p.add_argument('--artifacts',type=pathlib.Path,required=True);a=p.parse_args()
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=a.artifacts;OUT.mkdir(parents=True,exist_ok=True,mode=0o700)
D=['/opt/homebrew/bin/docker','--context','colima'];name='otr-member-revoke-'+uuid.uuid4().hex[:12];created=False;phase='start';checks=[]
quote=lambda x:"'"+str(x).replace("'","''")+"'"
canon=lambda q:json.dumps(q,sort_keys=True,separators=(',',':'),ensure_ascii=False)
hashvalue=lambda d,q:hashlib.sha256((d+'\n'+canon(q)).encode()).hexdigest()
def sql(text,role='supabase_admin',fail=False):
 r=subprocess.run(D+['exec','-i',name,'psql','-XqAt','-h','127.0.0.1','-U',role,'-d','postgres','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,timeout=30)
 with (OUT/'PG.private.log').open('a') as f:f.write('\n['+phase+']\n'+r.stdout+r.stderr)
 if r.returncode and not fail:raise RuntimeError(phase+': '+r.stderr[-1800:])
 return r
try:
 subprocess.run(D+['run','--detach','--pull=never','--network','none','--memory','256m','--cpus','1','--label','otr.core.fixture=member-revoke','--name',name,'otr-core-v2-server84-fixture:20261012'],capture_output=True,check=True,timeout=30);created=True
 assert subprocess.check_output(D+['inspect','--format','{{.Image}}',name],text=True).strip()=='sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068'
 for _ in range(40):
  if subprocess.run(D+['exec',name,'pg_isready','-U','supabase_admin'],capture_output=True,timeout=5).returncode==0:break
  time.sleep(.25)
 else:raise RuntimeError('PG_NOT_READY')
 phase='canonical-foundation'
 for m in ['20261011000100_trip_core_v2_foundation.sql','20261011000200_trip_core_v2_version_dispatch.sql','20261011000300_trip_core_v2_owning_session.sql','20261011000400_trip_core_v2_read_scope.sql']:
  sql('SET ROLE postgres;'+(ROOT/'supabase/migrations'/m).read_text())
 trip='10000000-0000-4000-8000-000000000001';actor=sql('SELECT created_by FROM public.trips WHERE id='+quote(trip)+'::uuid').stdout.strip();assert actor
 b=str(uuid.uuid4());person=str(uuid.uuid4());epoch=str(uuid.uuid4())
 phase='synthetic-owner-and-target'
 sql('''ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;
 ALTER ROLE otr_trip_core_v2_gateway LOGIN CONNECTION LIMIT 1 VALID UNTIL 'infinity';
 SET ROLE postgres;
 CREATE SCHEMA otr_auth_guest_composite;
 CREATE TABLE otr_auth_guest_composite.transaction_scopes(adoption_id uuid,backend_pid integer,transaction_id xid8);
 CREATE TABLE otr_auth_guest_composite.terminal_receipts(adoption_id uuid);
 ALTER TABLE public.trip_core_activation_gate ADD COLUMN IF NOT EXISTS scope_actor_account_id uuid, ADD COLUMN IF NOT EXISTS scope_trip_id uuid, ADD COLUMN IF NOT EXISTS scope_started_at timestamptz, ADD COLUMN IF NOT EXISTS scope_expires_at timestamptz;
 '''+'UPDATE auth.users SET is_anonymous=false WHERE id='+quote(actor)+'::uuid;'+
 'INSERT INTO auth.users(id,is_anonymous) VALUES('+quote(b)+"::uuid,false);INSERT INTO public.profiles(id,display_name) VALUES("+quote(b)+"::uuid,'Synthetic B');"+
 'UPDATE public.journey_members SET status=\'linked\',role=\'owner\' WHERE trip_id='+quote(trip)+'::uuid AND user_id='+quote(actor)+'::uuid;'+
 'INSERT INTO public.journey_members(id,trip_id,user_id,display_name,role,status) SELECT gen_random_uuid(),'+quote(trip)+'::uuid,'+quote(actor)+"::uuid,'Synthetic Owner','owner','linked' WHERE NOT EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id="+quote(trip)+'::uuid AND user_id='+quote(actor)+'::uuid);'+
 'INSERT INTO public.journey_members(id,trip_id,user_id,display_name,role,status) VALUES('+quote(person)+'::uuid,'+quote(trip)+'::uuid,'+quote(b)+"::uuid,'Synthetic B','group_member','linked');"+
 'INSERT INTO public.trip_core_read_state(trip_id,epoch,revision,access_revision) VALUES('+quote(trip)+'::uuid,'+quote(epoch)+'::uuid,10,7) ON CONFLICT(trip_id) DO UPDATE SET epoch=excluded.epoch,revision=10,access_revision=7;')
 phase='actual-guard-private-preimages'
 raw=(a.preimages/'function-67045.private.sql').read_text();sql('SET ROLE postgres;'+raw)
 # The Claim permission nesting fix is composed first; no old bytes replace it.
 repair=runpy.run_path(str(ROOT/'scripts/trip/core-read-state-claim-fence-repair.py'))['repair']
 patch=runpy.run_path(str(ROOT/'scripts/trip/core-member-access-patches.py'))['patch']
 state=repair((a.preimages/'function-65713.private.sql').read_bytes())
 write=(a.preimages/'function-65263.private.sql').read_bytes()
 actor_definition=sql("SELECT pg_get_functiondef('public.trip_core_lock_actor_scope(uuid,uuid)'::regprocedure);").stdout.rstrip()+'\n'
 # Load the unchanged exact originals before exercising the generated install/rollback CAS.
 for definition in [state,write,(a.preimages/'function-67419.private.sql').read_bytes()]:
  sql('SET ROLE postgres;SET check_function_bodies=off;'+definition.decode())
 for signature,allowed in [('public.trip_core_guard_write()','otr_trip_core_v2_writer'),('public.trip_core_finite_read_state_guard()','otr_trip_core_v2_writer'),('public.trip_member_claim_read_state_allowed(uuid)',None)]:
  sql('SET ROLE postgres;REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;'+('GRANT EXECUTE ON FUNCTION '+signature+' TO '+allowed+';' if allowed else ''))
 inputs={}
 sigs={'actor':'public.trip_core_lock_actor_scope(uuid,uuid)','write':'public.trip_core_guard_write()','read-state':'public.trip_core_finite_read_state_guard()','claim-helper':'public.trip_member_claim_read_state_allowed(uuid)'}
 for key,signature in sigs.items():
  metadata=json.loads(sql("SELECT jsonb_build_object('oid',oid::bigint,'owner',proowner::regrole::text,'securityDefiner',prosecdef,'acl',to_jsonb(proacl),'config',to_jsonb(proconfig),'definitionSHA256',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')) FROM pg_proc WHERE oid="+quote(signature)+"::regprocedure;").stdout)
  raw=(sql("SELECT pg_get_functiondef("+quote(signature)+"::regprocedure);").stdout.rstrip()+'\n').encode()
  assert hashlib.sha256(raw).hexdigest()==metadata['definitionSHA256']
  file=OUT/(key+'.private.sql');file.write_bytes(raw);metadata['privateDefinitionPath']=str(file);inputs[key]=metadata
 source_manifest=OUT/'PREIMAGES.private.json';source_manifest.write_text(json.dumps(inputs))
 generated=OUT/'package'
 subprocess.run(['python3',str(ROOT/'scripts/trip/core-member-access-install-package.py'),'--manifest',str(source_manifest),'--output-dir',str(generated)],check=True,capture_output=True,text=True)
 install=(generated/'INSTALL.private.sql').read_text();rollback=(generated/'ROLLBACK_NO_HISTORY.private.sql').read_text()
 qualify="SET ROLE postgres;SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.core.member_revoke_install_gate='OTR_MEMBER_REVOKE_V2_DEFAULT_CLOSED_INSTALL';"
 wrong=sql(qualify+install.replace(inputs['actor']['definitionSHA256'],'0'*64,1),fail=True)
 assert wrong.returncode and 'MEMBER_REVOKE_PREIMAGE_OR_METADATA_DRIFT' in wrong.stderr
 assert sql("SELECT to_regprocedure('public.trip_core_member_access(uuid,uuid,text,jsonb)') IS NULL;").stdout.strip()=='t';checks.append('GENERATED_WRONG_CAS_NO_PARTIAL_INSTALL')
 sql("CREATE ROLE member_fixture_unexpected NOLOGIN;ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO member_fixture_unexpected;")
 wrong=sql(qualify+install,fail=True);assert wrong.returncode and 'MEMBER_REVOKE_FUNCTION_ACL_DRIFT' in wrong.stderr
 assert sql("SELECT to_regprocedure('public.trip_core_member_access(uuid,uuid,text,jsonb)') IS NULL;").stdout.strip()=='t';checks.append('UNKNOWN_DEFAULT_GRANTEE_ABORTS_INSTALL')
 sql("ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM member_fixture_unexpected;DROP ROLE member_fixture_unexpected;")
 sql(qualify+install)
 sql('SET ROLE postgres;'+rollback)
 for key,signature in sigs.items():
  value=sql("SELECT encode(sha256(convert_to(pg_get_functiondef("+quote(signature)+"::regprocedure),'UTF8')),'hex');").stdout.strip();assert value==inputs[key]['definitionSHA256']
 checks.append('GENERATED_NO_HISTORY_ROLLBACK_RESTORES_ALL_ORIGINALS_AND_CLAIM_FIX')
 sql(qualify+install)
 sql('SET ROLE postgres;CREATE TRIGGER member_fixture_read_state BEFORE UPDATE ON public.trip_core_read_state FOR EACH ROW EXECUTE FUNCTION public.trip_core_finite_read_state_guard();GRANT EXECUTE ON FUNCTION public.trip_core_member_access(uuid,uuid,text,jsonb) TO otr_trip_core_v2_gateway;')
 def command(op=None,revision=7,target=b,pid=person):return {'contractVersion':2,'intentVersion':2,'operationId':op or str(uuid.uuid4()),'tripId':trip,'command':'REVOKE_LINKED_MEMBER_ACCESS','target':{'kind':'TRIP_ACCESS','id':trip},'baseVector':[{'kind':'TRIP_ACCESS','id':trip,'revision':revision}],'admission':{'mode':'MANUAL','sourceIntentId':None,'policyVersion':None},'payload':{'personId':pid,'targetAccountId':target,'coreEpoch':epoch}}
 def request(q):return {'command':q,'canonicalIntent':canon(q),'intentSha256':hashvalue('otr-trip-core-intent-v2',q)}
 def call(method,payload,who=actor,prefix='',fail=False):
  return sql(prefix+'SELECT public.trip_core_member_access('+quote(who)+'::uuid,'+quote(trip)+'::uuid,'+quote(method)+','+quote(canon(payload))+'::jsonb);','otr_trip_core_v2_gateway',fail)
 phase='closed-default'
 q=command();closed=call('EXECUTE',request(q),fail=True);assert closed.returncode and 'CORE_CAPABILITY_CLOSED' in closed.stderr;checks.append('DEFAULT_CLOSED')
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET member_revoke_enabled=true,scope_actor_account_id='+quote(actor)+'::uuid,scope_trip_id='+quote(trip)+"::uuid,scope_started_at=clock_timestamp()-interval '1 minute',scope_expires_at=clock_timestamp()+interval '5 minutes';")
 phase='positive'
 out=json.loads(call('EXECUTE',request(q)).stdout);r=out['receipt'];assert r['outcome']=='APPLIED' and r['accessTransition']['before']['revision']==10 and r['accessTransition']['before']['accessRevision']==7 and r['accessTransition']['after']['revision']==11 and r['accessTransition']['after']['accessRevision']==8
 assert r['receiptSha256']==hashvalue('otr-trip-core-receipt-v2',{k:v for k,v in r.items() if k!='receiptSha256'});checks.append('APPLIED_ATOMIC_10_7_TO_11_8')
 replay=json.loads(call('EXECUTE',request(q)).stdout);assert replay==out;checks.append('EXACT_REPLAY_SAME_RECEIPT')
 conflict=command(revision=7);assert json.loads(call('EXECUTE',request(conflict)).stdout)['receipt']['outcome']=='CONFLICT';checks.append('STALE_ACCESS_CAS_CONFLICT')
 collision=command(op=q['operationId'],revision=8);bad=call('EXECUTE',request(collision),fail=True);assert bad.returncode and 'OPERATION_REUSE_MISMATCH' in bad.stderr;checks.append('REBOUND_OPERATION_REJECTED')
 nochange=command(revision=8);assert json.loads(call('EXECUTE',request(nochange)).stdout)['receipt']['outcome']=='NO_CHANGE';checks.append('SECOND_INTENT_NO_ACCESS_ADVANCE')
 phase='closed-read-recovery'
 sql('SET ROLE postgres;UPDATE public.trip_core_activation_gate SET member_revoke_enabled=false;')
 assert json.loads(call('RECEIPT',{'operationId':q['operationId']}).stdout)==out;checks.append('RECEIPT_AFTER_WRITE_CLOSE')
 loss=json.loads(call('ACCESS_LOSS',{},b).stdout);assert loss['accountId']==b and loss['coreReference']['accessRevision']==8;checks.append('B_SELF_SCOPED_ACCESS_LOSS')
 def actor_scope(who,which):
  value=sql("BEGIN;SELECT set_config('otr.core.actor',"+quote(who)+",true),set_config('otr.core.trip',"+quote(which)+",true);SELECT public.trip_core_lock_actor_scope("+quote(who)+"::uuid,"+quote(which)+"::uuid);ROLLBACK;",'otr_trip_core_v2_gateway').stdout.strip().splitlines()[-1]
  return json.loads(value)
 assert actor_scope(b,trip)['active'] is False and actor_scope(actor,trip)['active'] is True;checks.append('ORIGINAL_CORE_ACTOR_READER_DENIES_B_KEEPS_OWNER')
 other_trip=str(uuid.uuid4())
 sql("SET ROLE postgres;INSERT INTO public.trips(id,created_by,name) VALUES("+quote(other_trip)+"::uuid,"+quote(b)+"::uuid,'Synthetic unrelated Trip');")
 assert actor_scope(b,other_trip)['active'] is True;checks.append('B_OTHER_TRIP_UNAFFECTED')

 forbidden=call('RECEIPT',{'operationId':q['operationId']},b,fail=True);assert forbidden.returncode and 'NOT_VISIBLE' in forbidden.stderr;checks.append('B_RECEIPT_DENIED')
 delete=sql('SET ROLE postgres;DELETE FROM public.journey_removed_users WHERE trip_id='+quote(trip)+'::uuid AND user_id='+quote(b)+'::uuid;',fail=True);assert delete.returncode and 'MEMBER_REGRANT_NOT_AUTHORIZED' in delete.stderr;checks.append('LEGACY_MARKER_ERASE_DENIED')

 phase='owning-negatives-and-rollback'
 # No real IDs or Accounts are used; each extra member is owned synthetic fixture data.
 def add_member():
  user=str(uuid.uuid4());pid=str(uuid.uuid4())
  sql("SET ROLE postgres;INSERT INTO auth.users(id,is_anonymous) VALUES("+quote(user)+"::uuid,false);INSERT INTO public.profiles(id,display_name) VALUES("+quote(user)+"::uuid,'Synthetic extra');INSERT INTO public.journey_members(id,trip_id,user_id,display_name,role,status) VALUES("+quote(pid)+"::uuid,"+quote(trip)+"::uuid,"+quote(user)+"::uuid,'Synthetic extra','group_member','linked');")
  return user,pid
 def state():return json.loads(sql("SELECT jsonb_build_object('revision',revision,'accessRevision',access_revision) FROM public.trip_core_read_state WHERE trip_id="+quote(trip)+"::uuid;").stdout)
 def admin_request(q,who=actor,setup='',fail=False,sleep=''):
  return sql("BEGIN;SET LOCAL ROLE postgres;"+setup+"RESET ROLE;SET LOCAL SESSION AUTHORIZATION otr_trip_core_v2_gateway;SELECT public.trip_core_member_access("+quote(who)+"::uuid,"+quote(trip)+"::uuid,'EXECUTE',"+quote(canon(request(q)))+"::jsonb);"+sleep+"COMMIT;",fail=fail)
 sql("SET ROLE postgres;UPDATE public.trip_core_activation_gate SET member_revoke_enabled=true;")
 c,cp=add_member();rev=state()['accessRevision']
 rejected=json.loads(call('EXECUTE',request(command(revision=rev,target=c,pid=person))).stdout)
 assert rejected['receipt']['outcome']=='REJECTED' and state()['accessRevision']==rev;checks.append('PERSON_ACCOUNT_MISMATCH_REJECTED_WITHOUT_MUTATION')
 owner_person=sql("SELECT id FROM public.journey_members WHERE trip_id="+quote(trip)+"::uuid AND user_id="+quote(actor)+"::uuid AND status='linked';").stdout.strip()
 self_reject=json.loads(call('EXECUTE',request(command(revision=rev,target=actor,pid=owner_person))).stdout)
 assert self_reject['receipt']['outcome']=='REJECTED';checks.append('SELF_OWNER_TARGET_PROTECTED')
 foreign=admin_request(command(revision=rev,target=b),c,"UPDATE public.trip_core_activation_gate SET scope_actor_account_id="+quote(c)+"::uuid;",True)
 assert foreign.returncode and 'NOT_VISIBLE' in foreign.stderr;checks.append('QUALIFIED_NONOWNER_DENIED')
 # Prove current Owner can act even when historical creator differs; this is fixture setup, not a transfer endpoint.
 sql("SET ROLE postgres;UPDATE public.trips SET created_by="+quote(c)+"::uuid WHERE id="+quote(trip)+"::uuid;")
 phase='same-original-operation-concurrency'
 cq=command(revision=rev,target=c,pid=cp)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  futures=[pool.submit(admin_request,cq,actor,'',False,"SELECT pg_sleep(0.15);") for _ in range(2)]
  concurrent_results=[json.loads(f.result().stdout.strip()) for f in futures]
 assert concurrent_results[0]==concurrent_results[1] and state()['accessRevision']==rev+1
 assert sql("SELECT count(*) FROM public.trip_core_command_receipts WHERE actor_account_id="+quote(actor)+"::uuid AND operation_id="+quote(cq['operationId'])+"::uuid;").stdout.strip()=='1'
 checks.extend(['CURRENT_LINKED_OWNER_NOT_CREATED_BY','CONCURRENT_IDENTICAL_OPERATION_ONE_RECEIPT_ONE_ADVANCE'])
 d,dp=add_member();base=state();dq=command(revision=base['accessRevision'],target=d,pid=dp)
 phase='post-receipt-fault-rolls-back-entire-effect'
 sql("SET ROLE postgres;CREATE FUNCTION public.member_fixture_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('otr.fixture.fail_commit',true)='yes' THEN RAISE EXCEPTION 'FIXTURE_COMMIT_FAULT';END IF;RETURN NEW;END $$;CREATE TRIGGER member_fixture_fault AFTER INSERT ON public.trip_core_command_receipts FOR EACH ROW EXECUTE FUNCTION public.member_fixture_fail_commit();")
 failure=admin_request(dq,actor,"SELECT set_config('otr.fixture.fail_commit','yes',true);",True)
 assert failure.returncode and 'FIXTURE_COMMIT_FAULT' in failure.stderr and state()==base
 assert sql("SELECT count(*) FROM public.journey_removed_users WHERE trip_id="+quote(trip)+"::uuid AND user_id="+quote(d)+"::uuid;").stdout.strip()=='0'
 assert sql("SELECT count(*) FROM public.trip_core_command_receipts WHERE operation_id="+quote(dq['operationId'])+"::uuid;").stdout.strip()=='0'
 checks.append('POST_RECEIPT_FAILURE_ROLLS_BACK_DENIAL_STATE_AND_RECEIPT')
 phase='expiry-foreign-epoch-ambiguous-owner'
 expired=admin_request(dq,actor,"UPDATE public.trip_core_activation_gate SET scope_expires_at=clock_timestamp()-interval '1 second';",True)
 assert expired.returncode and 'CORE_CAPABILITY_CLOSED' in expired.stderr and state()==base;checks.append('EXPIRED_SCOPE_NO_EFFECT')
 ambiguous=admin_request(dq,actor,"UPDATE public.journey_members SET role='owner' WHERE id="+quote(dp)+"::uuid;",True)
 assert ambiguous.returncode and 'NOT_VISIBLE' in ambiguous.stderr and state()==base;checks.append('AMBIGUOUS_OWNER_NO_EFFECT')
 eq=command(revision=base['accessRevision'],target=d,pid=dp);eq['payload']['coreEpoch']=str(uuid.uuid4())
 er=json.loads(call('EXECUTE',request(eq)).stdout);assert er['receipt']['outcome']=='CONFLICT' and state()==base;checks.append('FOREIGN_EPOCH_CONFLICT_NO_EFFECT')
 phase='ordinary-writer-cannot-forge-internal-proof'
 forged=sql("BEGIN;SET LOCAL SESSION AUTHORIZATION otr_trip_core_v2_gateway;SET LOCAL ROLE otr_trip_core_v2_writer;SELECT set_config('otr.core.member_revoke_proof','{}',true);SELECT public.trip_core_member_write_allowed('trip_core_read_state','UPDATE','{}','{}');ROLLBACK;",fail=True)
 assert forged.returncode and 'permission denied for function trip_core_member_write_allowed' in forged.stderr;checks.append('ORDINARY_WRITER_HAS_NO_INTERNAL_PROOF_EXECUTE')
 # The failed original request has no receipt; querying it never submits a replacement.
 assert call('RECEIPT',{'operationId':dq['operationId']}).stdout.strip() in ('','null');checks.append('FAULTED_ORIGINAL_RECEIPT_LOOKUP_ONLY')

 phase='legacy-join-versus-revoke-serialization'
 raceq=command(revision=state()['accessRevision'],target=d,pid=dp)
 def late_join():
  time.sleep(.05)
  return sql("BEGIN;SET LOCAL ROLE postgres;UPDATE public.journey_members SET status='linked' WHERE id="+quote(dp)+"::uuid;DELETE FROM public.journey_removed_users WHERE trip_id="+quote(trip)+"::uuid AND user_id="+quote(d)+"::uuid;COMMIT;",fail=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  first=pool.submit(admin_request,raceq,actor,'',False,"SELECT pg_sleep(0.25);")
  second=pool.submit(late_join)
  assert json.loads(first.result().stdout.strip())['receipt']['outcome']=='APPLIED'
  denied=second.result();assert denied.returncode and 'MEMBER_REGRANT_NOT_AUTHORIZED' in denied.stderr
 assert actor_scope(d,trip)['active'] is False;checks.append('LEGACY_JOIN_RACING_REVOKE_CANNOT_ERASE_DENIAL')
 sql("SET ROLE postgres;UPDATE public.trip_core_activation_gate SET member_revoke_enabled=false;")
 blocked_rollback=sql('SET ROLE postgres;'+rollback,fail=True)
 assert blocked_rollback.returncode and 'MEMBER_REVOKE_HISTORY_RETAINS_PROTECTION' in blocked_rollback.stderr
 assert actor_scope(b,trip)['active'] is False;checks.append('ACCEPTED_HISTORY_BLOCKS_REVERSE_ROLLBACK')
 result={'status':'LOCAL_PG_PASS','checks':checks,'receipt':out,'loss':loss,'fixtureImage':'sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068','hostedActions':0,'limits':'Actual Core tables and write/read-state guards with real SQL Owner/target/policy and local synthetic Auth; no Hosted install or consumer E2E.'}
 (OUT/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':checks},indent=2))
finally:
 if created:subprocess.run(D+['rm','--force',name],capture_output=True,check=True,timeout=15)
