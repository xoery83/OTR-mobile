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
 definitions=[patch(state,'read-state'),patch(write,'write')]
 sql('SET ROLE postgres;'+(ROOT/'backend/sql/tripCoreMemberAccess.sql').read_text())
 for raw in definitions:sql('SET ROLE postgres;SET check_function_bodies=off;'+raw.decode())
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
 forbidden=call('RECEIPT',{'operationId':q['operationId']},b,fail=True);assert forbidden.returncode and 'NOT_VISIBLE' in forbidden.stderr;checks.append('B_RECEIPT_DENIED')
 delete=sql('SET ROLE postgres;DELETE FROM public.journey_removed_users WHERE trip_id='+quote(trip)+'::uuid AND user_id='+quote(b)+'::uuid;',fail=True);assert delete.returncode and 'MEMBER_REGRANT_NOT_AUTHORIZED' in delete.stderr;checks.append('LEGACY_MARKER_ERASE_DENIED')
 result={'status':'LOCAL_PG_PASS','checks':checks,'receipt':out,'loss':loss,'fixtureImage':'sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068','hostedActions':0,'limits':'Actual Core tables and write/read-state guards with real SQL Owner/target/policy and local synthetic Auth; no Hosted install or consumer E2E.'}
 (OUT/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':checks},indent=2))
finally:
 if created:subprocess.run(D+['rm','--force',name],capture_output=True,check=True,timeout=15)
