"""Real Gateway principals in owned network-none PG; no Hosted/OTP/DEV/Provider."""
from pathlib import Path
import hashlib,json,subprocess,tempfile,time,uuid,sys
sys.dont_write_bytecode=True
from principal_patch import SIGNATURES,render
ROOT=Path(__file__).resolve().parents[4];HERE=Path(__file__).resolve().parent
NAME='otr-auth-authority-'+uuid.uuid4().hex[:12];DB='otr_auth_composite_'+uuid.uuid4().hex[:12]
checks=[];created=False
input_names=['authority.local.sql','staging.local.sql','terminal.local.sql','authority_local_pg.py','authority-fixture.mts','principal_patch.py','execute_local_pg.mts','receipt-journal.local.sql','verify-terminal-receipt.mts','publication.local.sql','publication-local-pg.mts']
input_bytes={name:(HERE/name).read_bytes() for name in input_names}
owning_names=['backend/src/guestAdoptionCompositePg.ts','backend/src/guestAdoptionCompositeExecute.ts','backend/src/__fixtures__/tripCoreV2Sql.ts','backend/src/tripCoreV2PgStorage.ts','backend/src/tripCreatePgStorage.ts','backend/src/tripMetadataV2PgStorage.ts','backend/src/tripPersonCloudCreatePg.ts','docs/ops/general-account-cloud-sync-20261029/normal-account-candidate/after.sql','backend/src/guestAdoptionTerminalPg.ts','src/domain/auth/guestAdoptionReceipt.ts','backend/src/guestAdoptionPublicationPg.ts','src/data/auth/guestAdoptionReceiptQualification.ts']
owning_bytes={name:(ROOT/name).read_bytes() for name in owning_names}
CORE='otr_trip_core_v2_gateway';ROLES=[CORE,'otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_person_command_gateway']
def docker(*args,input=None):
 return subprocess.run(['/opt/homebrew/bin/docker',*args],input=input,text=True,capture_output=True,timeout=60)
def sql(text,user='supabase_admin',database=None,error=None):
 args=['exec','-i','-e','PGPASSWORD=auth-composite-fixture-only',NAME,'psql','-XqAt']
 if user in ROLES:args+=['-h','127.0.0.1']
 r=docker(*args,'-U',user,'-d',database or DB,'-v','ON_ERROR_STOP=1',input=text)
 if error:assert r.returncode and error in r.stderr,(error,r.stderr)
 else:assert r.returncode==0,r.stderr
 return r.stdout.strip()
def q(v):return "'"+str(v).replace("'","''")+"'"
def node(*args):
 r=subprocess.run(['node','--import','tsx',str(HERE/'authority-fixture.mts'),*map(str,args)],cwd=ROOT,capture_output=True,text=True,timeout=30)
 assert r.returncode==0,r.stderr
 return json.loads(r.stdout)
def read(path):return (ROOT/path).read_text()
def call(name,*args):return 'SELECT otr_auth_guest_composite.'+name+'('+','.join(args)+');'
try:
 r=docker('run','--name',NAME,'--network','none','--memory','256m','--cpus','1','-d','otr-core-v2-server84-fixture:20261012');assert r.returncode==0,r.stderr;created=True
 for _ in range(80):
  if docker('exec',NAME,'pg_isready','-U','supabase_admin').returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('OWNED_PG_START_TIMEOUT')
 # Only this owned fixture's background sessions are stopped while cloning its baseline.
 sql('ALTER DATABASE postgres ALLOW_CONNECTIONS false;',database='template1')
 sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres';",database='template1')
 sql('CREATE DATABASE '+DB+' OWNER postgres TEMPLATE postgres;',database='template1')
 sql('ALTER DATABASE postgres ALLOW_CONNECTIONS true;',database='template1')
 for suffix in ('foundation','version_dispatch','owning_session','read_scope','source_scope','candidate_publication','legacy_claim_fence','retained_claim_fence'):
  sql('SET ROLE postgres;'+next((ROOT/'supabase/migrations').glob('*trip_core_v2_'+suffix+'.sql')).read_text())
 for path in ['supabase/migrations/20261013000500_trip_create_owning_port.sql','supabase/dev-forward/core-v2/20261014000300_trip_core_v2_finite_activation_contract.sql']:
  sql('SET ROLE postgres;'+read(path))
 ledger=read('supabase/dev-forward/r3-v1/202610080001_fresh_trip_ledger_initialization.sql');a=ledger.index('CREATE OR REPLACE FUNCTION');b=ledger.index('$function$;',a)+len('$function$;');sql('SET ROLE postgres;'+ledger[a:b])
 for path in ['supabase/dev-forward/trip-create/20261017000100_trip_create_finite_contract.sql','supabase/dev-forward/trip-metadata/20261022000100_trip_metadata_v2.sql','supabase/dev-forward/trip-destinations/20261023000100_trip_structured_destinations.sql','supabase/migrations/20261013000200_core_ordinary_order.sql','docs/ops/trip-p1-sustained-sync-20261024/DEV_SOURCE_ROW_HELPER_PREIMAGE.sql','docs/ops/trip-p1-sustained-sync-20261024/DEV_CORE_GUARD_PREIMAGE.sql','supabase/dev-forward/trip-sustained-sync/20261024000200_trip_sustained_dev.sql','supabase/dev-forward/trip-sustained-sync/20261024000300_trip_person_cloud_create.sql']:
  sql('SET ROLE postgres;'+read(path))
 # Accepted General Account helper: use its recorded formal postimage, not the older QA-only path.
 sql('SET ROLE postgres;'+read('docs/ops/general-account-cloud-sync-20261029/normal-account-candidate/after.sql'))
 for name in ['staging.local.sql','terminal.local.sql','authority.local.sql','receipt-journal.local.sql','publication.local.sql']:
  candidate=input_bytes[name].decode()
  sql(candidate,database='postgres',error='AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED')
  sql("SET ROLE postgres;SET otr.auth.composite_fixture='LOCAL_DISPOSABLE';"+candidate)
 checks.append('all candidates reject Hosted-like database names; isolated baseline contains real four Gateway roles')
 f=node();actor=f['user']['id'];other=str(uuid.uuid4());request=f['request'];adoption=request['adoptionId']
 sql('INSERT INTO auth.users(id,is_anonymous) VALUES('+q(actor)+',false),('+q(other)+',false);')
 sql('INSERT INTO public.profiles(id,display_name) VALUES('+q(actor)+",'QA Owner'),("+q(other)+",'QA Other');")
 sql("ALTER ROLE "+CORE+" LOGIN PASSWORD 'auth-composite-fixture-only' CONNECTION LIMIT 1 VALID UNTIL 'infinity';")
 issue=call('confirm_and_issue',q(actor)+'::uuid',q(json.dumps(request))+'::jsonb','true')
 sql(issue,CORE,error='AUTH_ADOPTION_POLICY_CLOSED');checks.append('normal real Gateway still denied by default-closed policy')
 sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=true;')
 sql(issue.replace(',true)',',false)'),CORE,error='AUTH_ADOPTION_CONFIRMATION_REQUIRED')
 checks.append('explicit target confirmation required before grant or stage upload')
 grant=json.loads(sql(issue,CORE));assert json.loads(sql(issue,CORE))==grant
 checks.append('normal Account gets one server grant; exact retry retains original grant ID and expiry')
 wrong={**request,'targetAccountId':other}
 sql(call('confirm_and_issue',q(other)+'::uuid',q(json.dumps(wrong))+'::jsonb','true'),CORE,error='AUTH_ADOPTION_GRANT_COLLISION')
 checks.append('same adoption cannot cross Account or replace grant')
 sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.grants SET grant_id=gen_random_uuid();',error='AUTH_COMPOSITE_STAGE_IMMUTABLE')
 checks.append('grants immutable after confirmation')
 # Real server cancellation receipts, both before stage and after an immutable stage.
 def terminal_request(req):return {k:v for k,v in req.items() if k!='resources'}
 def verify_cancel(receipt,req,status):
  with tempfile.TemporaryDirectory(prefix='otr-auth-terminal-') as temp:
   path=Path(temp)/'material.json';path.write_text(json.dumps({'receipt':receipt,'request':req,'status':status}))
   result=subprocess.run(['node','--import','tsx',str(HERE/'verify-terminal-receipt.mts'),str(path),NAME,DB],cwd=ROOT,capture_output=True,text=True,timeout=30)
   assert result.returncode==0,result.stderr
   return json.loads(result.stdout)
 for staged in (False,True):
  c=node();cr=c['request'];ca=cr['adoptionId'];tr=terminal_request(cr)
  # Each source fixture has its own normal synthetic local Account.
  sql('INSERT INTO auth.users(id,is_anonymous) VALUES('+q(c['user']['id'])+',false);')
  sql('INSERT INTO public.profiles(id,display_name) VALUES('+q(c['user']['id'])+",'QA Cancellation');")
  cg=json.loads(sql(call('confirm_and_issue',q(c['user']['id'])+'::uuid',q(json.dumps(cr))+'::jsonb','true'),CORE))
  cp=None
  if staged:
   with tempfile.TemporaryDirectory(prefix='otr-auth-cancel-plan-') as temp:
    path=Path(temp);(path/'fixture.json').write_text(json.dumps(c));(path/'grant.json').write_text(json.dumps(cg));cp=node(path/'fixture.json',path/'grant.json')
   sql(call('seal_stage',q(c['user']['id'])+'::uuid',q(cp['canonicalText']),q(cp['sha256'])),CORE)
  cancel=call('cancel',q(c['user']['id'])+'::uuid',q(json.dumps(tr))+'::jsonb')
  cancelled=json.loads(sql(cancel,CORE));assert json.loads(sql(cancel,CORE))==cancelled
  status=json.loads(sql(call('status',q(c['user']['id'])+'::uuid',q(json.dumps(tr))+'::jsonb'),CORE))
  verified=verify_cancel(cancelled,tr,status);assert verified['authority']=='NONE'
  assert cancelled['preparationSha256']==(c['checkpoint']['sha256'] if staged else None)
  assert cancelled['planSha256']==(cp['sha256'] if staged else None)
  read_receipt=call('receipt',q(c['user']['id'])+'::uuid',q(json.dumps(tr))+'::jsonb',q(cancelled['receiptId'])+'::uuid',q(cancelled['receiptSha256']))
  assert json.loads(sql(read_receipt,CORE))==cancelled
  sql(read_receipt.replace(q(cancelled['receiptSha256']),q('0'*64)),CORE,error='AUTH_ADOPTION_RECEIPT_NOT_FOUND')
  wrong={**tr,'targetAccountId':actor}
  sql(call('status',q(actor)+'::uuid',q(json.dumps(wrong))+'::jsonb'),CORE,error='AUTH_ADOPTION_RECOVERY_FORBIDDEN')
  sql(call('confirm_and_issue',q(c['user']['id'])+'::uuid',q(json.dumps(cr))+'::jsonb','true'),CORE,error='AUTH_ADOPTION_ALREADY_TERMINAL')
  if staged:
   sql(call('seal_stage',q(c['user']['id'])+'::uuid',q(cp['canonicalText']),q(cp['sha256'])),CORE,error='AUTH_ADOPTION_ALREADY_TERMINAL')
   sql('BEGIN;'+call('begin_scope',q(c['user']['id'])+'::uuid',q(ca)+'::uuid',q(cp['sha256'])),CORE,error='AUTH_ADOPTION_ALREADY_TERMINAL')
  sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=false;')
  assert json.loads(sql(read_receipt,CORE))==cancelled
  assert json.loads(sql(cancel,CORE))==cancelled
  sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=true;')
  sql('DELETE FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id='+q(ca)+';',error='AUTH_COMPOSITE_STAGE_IMMUTABLE')
  assert sql('SELECT count(*) FROM public.trips WHERE id='+q(json.loads(json.loads(c['checkpoint']['canonicalText'])['source']['canonicalText'])['trips'][0]['create']['tripId'])+';')=='0'
  # An already committed terminal remains recoverable after grant expiry. Seed a
  # separate expired grant as fixture data; never rewrite an immutable issued grant.
  if not staged:
   expired_request={**cr,'adoptionId':str(uuid.uuid4())};expired_binding=terminal_request(expired_request)
   expired_grant={**cg,**expired_request,'grantId':str(uuid.uuid4()),'expiresAt':'2026-01-01T00:00:00.000Z'}
   sql('INSERT INTO otr_auth_guest_composite.grants(adoption_id,actor_account_id,source_guest_local_id,inventory_sha256,grant_id,request_payload,grant_payload,expires_at) VALUES('+','.join([
    q(expired_request['adoptionId']),q(c['user']['id']),q(expired_request['sourceGuestLocalId']),q(expired_request['inventorySha256']),q(expired_grant['grantId']),q(json.dumps(expired_request))+'::jsonb',q(json.dumps(expired_grant))+'::jsonb',q(expired_grant['expiresAt'])+'::timestamptz'])+');')
   expired_cancel=json.loads(sql(call('cancel',q(c['user']['id'])+'::uuid',q(json.dumps(expired_binding))+'::jsonb'),CORE))
   expired_status=json.loads(sql(call('status',q(c['user']['id'])+'::uuid',q(json.dumps(expired_binding))+'::jsonb'),CORE))
   verify_cancel(expired_cancel,expired_binding,expired_status)
   assert json.loads(sql(call('receipt',q(c['user']['id'])+'::uuid',q(json.dumps(expired_binding))+'::jsonb',q(expired_cancel['receiptId'])+'::uuid',q(expired_cancel['receiptSha256'])),CORE))==expired_cancel
   checks.append('seeded expired local grant permits cancellation and immutable terminal recovery without granting new publication')
  sql('INSERT INTO public.trip_sustained_dev_policy(actor_account_id,enabled,adoption_cutoff) VALUES('+q(c['user']['id'])+',false,clock_timestamp());')
  sql(read_receipt,CORE,error='AUTH_ADOPTION_RECOVERY_FORBIDDEN')
  sql(cancel,CORE,error='AUTH_ADOPTION_RECOVERY_FORBIDDEN')
  checks.append('current normal Account policy revocation denies terminal reads and cancellation despite an existing server grant')
  checks.append(('after-stage' if staged else 'before-stage')+' server cancellation is immutable/idempotent; TS hash+status pointer match, foreign Account/pointer denied, no business writes, recovery survives policy OFF, no reopen')
 unknown={**terminal_request(request),'adoptionId':str(uuid.uuid4())}
 assert json.loads(sql(call('status',q(actor)+'::uuid',q(json.dumps(unknown))+'::jsonb'),CORE))['status']=='NOT_FOUND'
 sql(call('cancel',q(actor)+'::uuid',q(json.dumps(unknown))+'::jsonb'),CORE,error='AUTH_ADOPTION_REAL_GRANT_REQUIRED')
 checks.append('unknown attempt has no terminal receipt and cannot fabricate a cancellation or release authority')
 for role in ['anon','authenticated','service_role',*ROLES]:
  sql('SET ROLE '+role+';SELECT * FROM otr_auth_guest_composite.terminal_receipts;',error='permission denied')
 for role in ['anon','authenticated','service_role',*ROLES[1:]]:
  sql('SET ROLE '+role+';'+call('cancel',q(actor)+'::uuid',q(json.dumps(terminal_request(request)))+'::jsonb'),error='permission denied')
 for bad in [None,{}, {**terminal_request(request),'inventorySha256':None}, {**terminal_request(request),'sourceGuestLocalId':None}, {**terminal_request(request),'extra':'unsupported'}]:
  sql(call('status',q(actor)+'::uuid',q(json.dumps(bad))+'::jsonb'),CORE,error='AUTH_ADOPTION_RECOVERY_INVALID')
 checks.append('terminal tables remain unreadable to Auth/service/all Gateway roles; only Core Gateway function execution; null/malformed/extra-field requests rejected')




 with tempfile.TemporaryDirectory(prefix='otr-auth-authority-') as temp:
  path=Path(temp);(path/'fixture.json').write_text(json.dumps(f));(path/'grant.json').write_text(json.dumps(grant));plan=node(path/'fixture.json',path/'grant.json')
  # Keep only public synthetic fixture material for the owning adapter probe.
  fixture_material={'fixture':f,'grant':grant,'plan':plan}
  (path/'material.json').write_text(json.dumps(fixture_material))
  def tampered_source(change):
   body=json.loads(plan['canonicalText']);prep=json.loads(body['preparation']['canonicalText']);source=json.loads(prep['source']['canonicalText']);change(source)
   def seal_json(value):
    text=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
    return {'canonicalText':text,'sha256':hashlib.sha256(text.encode()).hexdigest(),'bytes':len(text.encode())}
   prep['source']=seal_json(source);body['preparation']=seal_json(prep)
   return seal_json(body)
  for change,error in [
   (lambda source:source['trips'][0]['create'].pop('tripId'),'AUTH_ADOPTION_STAGE_IDENTITY_INVALID'),
   (lambda source:source['trips'][0]['creator'].update(personId=None),'AUTH_ADOPTION_STAGE_IDENTITY_INVALID'),
   (lambda source:source['trips'][0]['people'][0].update(personId=source['trips'][0]['creator']['personId']),'AUTH_ADOPTION_STAGE_DUPLICATE_IDENTITY'),
   (lambda source:source['trips'][0]['queueOperationIds'].append(source['trips'][0]['queueOperationIds'][0]),'AUTH_ADOPTION_STAGE_DUPLICATE_IDENTITY'),
   (lambda source:source['trips'][0]['deferredMetadata'][0].update(actionId=None),'AUTH_ADOPTION_STAGE_IDENTITY_INVALID'),
   (lambda source:source['trips'][0]['queueOperationIds'].append(None),'AUTH_ADOPTION_STAGE_IDENTITY_INVALID'),
   (lambda source:source['trips'][0]['create'].update(tripId=None),'AUTH_ADOPTION_STAGE_IDENTITY_INVALID'),
   (lambda source:source['trips'][0]['create'].update(tripId='invalid'),'AUTH_ADOPTION_STAGE_IDENTITY_INVALID'),
   (lambda source:source['trips'][0]['create'].update(operationId=None),'AUTH_ADOPTION_STAGE_IDENTITY_INVALID'),
   (lambda source:source['trips'][0]['coreIntents'].append({'command':{'admission':{'mode':'MANUAL'},'operationId':str(uuid.uuid4()),'tripId':source['trips'][0]['create']['tripId']}}),'AUTH_ADOPTION_STAGE_FAMILY_UNSUPPORTED'),
   (lambda source:source['trips'][0]['people'].append(dict(source['trips'][0]['people'][0])),'AUTH_ADOPTION_STAGE_RESOURCE_MISMATCH'),
  ]:
   bad_plan=tampered_source(change)
   sql(call('seal_stage',q(actor)+'::uuid',q(bad_plan['canonicalText']),q(bad_plan['sha256'])),CORE,error=error)
  checks.append('self-consistent hashes cannot hide null/invalid Trip or operation, missing Core command, or undercounted actual People')
  seal=call('seal_stage',q(actor)+'::uuid',q(plan['canonicalText'])+'::text',q(plan['sha256'])+'::text')
  assert sql(seal,CORE)==plan['sha256'];assert sql(seal,CORE)==plan['sha256']
  checks.append('server stage requires real stored grant and exact immutable preparation/plan')
  bad=json.loads(plan['canonicalText']);bad['grant']['grantId']=str(uuid.uuid4());bad_text=json.dumps(bad,separators=(',',':'))
  sql(call('seal_stage',q(actor)+'::uuid',q(bad_text),q(hashlib.sha256(bad_text.encode()).hexdigest())),CORE,error='AUTH_ADOPTION_REAL_GRANT_REQUIRED')
  checks.append('client-made grant with self-consistent hash cannot become server stage')
  begin=call('begin_scope',q(actor)+'::uuid',q(adoption)+'::uuid',q(plan['sha256']))
  source=json.loads(json.loads(f['checkpoint']['canonicalText'])['source']['canonicalText']);trip=source['trips'][0];tripid=trip['create']['tripId'];op=trip['create']['operationId']
  allow=call('scope_allowed',q(actor)+'::uuid',q(tripid)+'::uuid',q(op)+'::uuid',q('CREATE'))
  assert sql(allow,CORE)=='f'
  forged="SET otr.core.actor="+q(actor)+";SET otr.core.trip="+q(tripid)+";SET otr.core.operation="+q(op)+";"
  assert sql(forged+allow,CORE)=='f';checks.append('GUC actor/Trip/operation alone cannot forge transaction authority')
  assert sql('BEGIN;'+begin+allow+'ROLLBACK;',CORE)=='t'
  assert sql(allow,CORE)=='f';checks.append('real scope authorizes exact operation only within its owning transaction; rollback removes it')
  sql('BEGIN;'+begin+'COMMIT;',CORE)
  assert sql(allow,CORE)=='f';checks.append('committed old scope never authorizes a new transaction or connection')
  for target,operation,account in [(str(uuid.uuid4()),op,actor),(tripid,str(uuid.uuid4()),actor),(tripid,op,other)]:
   wrong_allow=call('scope_allowed',q(account)+'::uuid',q(target)+'::uuid',q(operation)+'::uuid',q('CREATE'))
   assert sql('BEGIN;'+begin+wrong_allow+'ROLLBACK;',CORE)=='f'
  checks.append('foreign Account, unrelated Trip and unsealed operation all denied on real scoped Gateway')
  sql(call('begin_scope',q(other)+'::uuid',q(adoption)+'::uuid',q(plan['sha256'])),CORE,error='AUTH_ADOPTION_SCOPE_BINDING')
  checks.append('foreign actor cannot lock the original stage scope')
  denied_request={**request,'adoptionId':str(uuid.uuid4()),'targetAccountId':other}
  sql('INSERT INTO public.trip_sustained_dev_policy(actor_account_id,enabled,adoption_cutoff,revoked_at) VALUES('+q(other)+',false,clock_timestamp(),clock_timestamp());')
  sql(call('confirm_and_issue',q(other)+'::uuid',q(json.dumps(denied_request))+'::jsonb','true'),CORE,error='AUTH_ADOPTION_CONFIRMATION_REQUIRED')
  checks.append('Adoption cannot override an existing normal Account policy revocation')
  for role in ['anon','authenticated','service_role',*ROLES]:
   sql('SET ROLE '+role+';SELECT plan_text FROM otr_auth_guest_composite.sealed_stages;',error='permission denied')
   sql('SET ROLE '+role+';SELECT grant_payload FROM otr_auth_guest_composite.grants;',error='permission denied')
  checks.append('actual anon/authenticated/service and all four Gateway roles cannot read private source/grant tables')
  for role in ['anon','authenticated','service_role',*ROLES[1:]]:
   sql('SET ROLE '+role+';'+issue,error='permission denied')
  checks.append('ordinary Auth/service/other Gateway roles have no grant-issuer execution permission')

  sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET policy_version=\'other-policy\';')
  sql('BEGIN;'+begin,CORE,error='AUTH_ADOPTION_REAL_GRANT_REQUIRED')
  sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET policy_version=\'otr.auth.fileless-p1.unpriced/1\',enabled=false;')
  sql('BEGIN;'+begin,CORE,error='AUTH_ADOPTION_POLICY_CLOSED')
  checks.append('policy version change or disable invalidates old grant/scope, never implicitly reissues')
  sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=true;')
  definitions={signature:json.loads(sql('SELECT to_json(pg_get_functiondef('+q(signature)+'::regprocedure));')) for signature in SIGNATURES}
  patch,images=render(definitions)
  (HERE/'PRINCIPAL_LOCAL_PATCH.sql').write_text(patch)
  (HERE/'PRINCIPAL_LOCAL_PREIMAGES.json').write_text(json.dumps(images,indent=2)+'\n')
  sql(patch,database='postgres',error='AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED')
  sql("SET ROLE postgres;SET otr.auth.composite_fixture='LOCAL_DISPOSABLE';"+patch)
  checks.append('exact preimage-guarded local principal patch installs without new role, membership or business table grant')
  create=call('scope_allowed',q(actor)+'::uuid',q(tripid)+'::uuid',q(op)+'::uuid',q('CREATE'))
  create_command='SELECT public.trip_create_command('+','.join([q(op)+'::uuid',q(actor)+'::uuid',q(tripid)+'::uuid',q(json.dumps(trip['create']))+'::jsonb'])+');'
  action=trip['deferredMetadata'][0]
  metadata_request={'formatVersion':3,'operationId':action['operationId'],'tripId':tripid,'expectedMetadataRevision':0,'before':action['before'],'after':action['after']}
  metadata_command='SELECT public.trip_metadata_update_command('+','.join([q(action['operationId'])+'::uuid',q(actor)+'::uuid',q(tripid)+'::uuid',q(json.dumps(metadata_request))+'::jsonb'])+');'
  person=trip['people'][0]
  person_request={'version':1,'operationId':person['operationId'],'personId':person['personId'],'tripId':tripid,'tripCreateOperationId':op,'dataOwnership':'CLOUD_SHARED_AUTHORED','displayName':person['displayName']}
  person_command='SELECT public.trip_person_cloud_create_command('+','.join([q(actor)+'::uuid',q(tripid)+'::uuid',q(person['operationId'])+'::uuid',q(json.dumps(person_request))+'::jsonb'])+');'
  sql(create_command,CORE,error='AUTH_ADOPTION_OPERATION_NOT_SEALED')
  checks.append('new function EXECUTE grants alone cannot bypass normal principal or missing actual transaction scope')
  readback="SELECT jsonb_build_object('trip',(SELECT jsonb_build_object('name',name,'metadataRevision',metadata_revision) FROM public.trips WHERE id="+q(tripid)+"),'people',(SELECT count(*) FROM public.journey_members WHERE trip_id="+q(tripid)+"),'ledger',(SELECT jsonb_build_object('currency',settlement_currency,'scale',settlement_scale,'policy',valuation_policy) FROM public.ledger_settings WHERE journey_id="+q(tripid)+"),'core',(SELECT jsonb_build_object('revision',revision,'access',access_revision) FROM public.trip_core_read_state WHERE trip_id="+q(tripid)+"));"
  # Read business rows through owning definer readbacks; the Gateway never gets SELECT tables.
  inside='BEGIN;'+begin+create_command+metadata_command+person_command
  lines=sql(inside+'ROLLBACK;',CORE).splitlines()
  replies=[json.loads(line) for line in lines if line.startswith('{')]
  assert len(replies)==3
  assert replies[0]['actorAccountId']==actor and replies[0]['tripId']==tripid
  assert replies[1]['after']['name']=='Guest Edited retained'
  assert replies[2]['person']['userId'] is None and replies[2]['person']['status']=='unlinked'
  assert sql('SELECT count(*) FROM public.trips WHERE id='+q(tripid)+';')=='0'
  assert sql('SELECT count(*) FROM public.trip_create_receipts WHERE trip_id='+q(tripid)+';')=='0'
  assert sql('SELECT count(*) FROM public.trip_metadata_update_receipts WHERE trip_id='+q(tripid)+';')=='0'
  assert sql('SELECT count(*) FROM public.trip_person_create_receipts WHERE trip_id='+q(tripid)+';')=='0'
  checks.append('one real Core Gateway transaction runs owning Trip Create, Metadata CAS and unlinked Person; outer rollback removes all canonical rows and receipts')
  changed_create={**trip['create'],'name':'not in source'}
  changed_command=create_command.replace(q(json.dumps(trip['create'])),q(json.dumps(changed_create)))
  sql('BEGIN;'+begin+changed_command,CORE,error='AUTH_ADOPTION_OPERATION_PAYLOAD_CHANGED')
  assert sql('SELECT count(*) FROM public.trips WHERE id='+q(tripid)+';')=='0'
  checks.append('same operation UUID with changed source payload fails before any owning write')
  unknown_core_op=str(uuid.uuid4())
  public_core_check="SELECT set_config('otr.core.operation',"+q(unknown_core_op)+",true);SELECT public.trip_core_finite_scope_allowed("+q(actor)+"::uuid,"+q(tripid)+"::uuid);"
  assert sql('BEGIN;'+begin+create_command+public_core_check+'ROLLBACK;',CORE).splitlines()[-1]=='f'
  checks.append('an active Adoption transaction cannot fall back to General Account authority for an unsealed Core operation')
  wrong_metadata={**metadata_request,'expectedMetadataRevision':999}
  sql('BEGIN;'+begin+create_command+metadata_command.replace(q(json.dumps(metadata_request)),q(json.dumps(wrong_metadata))),CORE,error='METADATA_STALE_REVISION_OR_TUPLE')
  assert sql('SELECT count(*) FROM public.trips WHERE id='+q(tripid)+';')=='0'
  checks.append('real Metadata CAS failure rolls back the preceding new Trip instead of exposing a shell')
  wrong_person={**person_request,'displayName':'not in source'}
  sql('BEGIN;'+begin+create_command+metadata_command+person_command.replace(q(json.dumps(person_request)),q(json.dumps(wrong_person))),CORE,error='AUTH_ADOPTION_OPERATION_PAYLOAD_CHANGED')
  assert sql('SELECT count(*) FROM public.trips WHERE id='+q(tripid)+';')=='0'
  checks.append('Person payload/connection cannot change from the sealed unlinked source; failure removes prior Trip/Metadata writes')
  # Exercise the actual TypeScript owning services, all on one real Gateway lease.
  def execute(mode):
   r=subprocess.run(['node','--import','tsx',str(HERE/'execute_local_pg.mts'),NAME,DB,str(path/'material.json'),mode],cwd=ROOT,capture_output=True,text=True,timeout=60)
   assert r.returncode==0,r.stderr
   return json.loads(r.stdout)
  rolled_back=execute('rollback')
  assert rolled_back['coreOutcome']=='APPLIED' and rolled_back['queueMappings']==4
  assert sql('SELECT count(*) FROM public.trips WHERE id='+q(tripid)+';')=='0'
  assert sql('SELECT count(*) FROM public.trip_core_command_receipts WHERE trip_id='+q(tripid)+';')=='0'
  checks.append('real TypeScript Trip/Metadata/Person held ports plus existing Core executor produce APPLIED then outer rollback removes Trip/P1/receipts')
  committed=execute('commit')
  assert committed['coreOutcome']=='APPLIED' and committed['authority']=='NONE'
  assert sql('SELECT count(*) FROM public.itinerary_events WHERE trip_id='+q(tripid)+';')=='1'
  assert sql('SELECT count(*) FROM public.trip_core_command_receipts WHERE trip_id='+q(tripid)+';')=='1'
  checks.append('one real Core Gateway lease commits exact original four operations and one real Core domain receipt; not a final Adoption receipt')
  snapshot=json.loads(sql(readback))
  assert snapshot['trip']=={'name':'Guest Edited retained','metadataRevision':1}
  assert snapshot['people']==2 and snapshot['ledger']=={'currency':'NZD','scale':2,'policy':'REFERENCE_RATE'}
  # Existing Person insertion trigger and owning command each invalidate the read state.
  assert snapshot['core']=={'revision':4,'access':3},snapshot
  checks.append('fresh independent SQL reads committed exact Trip, unlinked Person, original financial defaults and owning Core invalidation')
  sql('BEGIN;'+begin,CORE,error='AUTH_ADOPTION_TRIP_COLLISION')
  checks.append('source Trip collision after commit cannot reopen or merge an existing Trip')
  sql(call('cancel',q(actor)+'::uuid',q(json.dumps(terminal_request(request)))+'::jsonb'),CORE,error='AUTH_ADOPTION_CANCEL_PUBLICATION_UNRESOLVED')
  checks.append('committed component business rows without a formal terminal cannot be reclassified as cancellation')
  # Unchanged normal Gateway paths must remain usable outside Adoption scope.
  normal_trip=str(uuid.uuid4());normal_op=str(uuid.uuid4());normal_create={**trip['create'],'tripId':normal_trip,'operationId':normal_op}
  sql('INSERT INTO public.trip_sustained_dev_policy(actor_account_id,enabled,adoption_cutoff) VALUES('+q(actor)+',true,clock_timestamp());')
  for role in ROLES[1:]:sql("ALTER ROLE "+role+" LOGIN PASSWORD 'auth-composite-fixture-only' CONNECTION LIMIT 1 VALID UNTIL 'infinity';")
  normal_create_sql=create_command.replace(q(op)+'::uuid',q(normal_op)+'::uuid').replace(q(tripid)+'::uuid',q(normal_trip)+'::uuid').replace(q(json.dumps(trip['create'])),q(json.dumps(normal_create)))
  normal_created=json.loads(sql(normal_create_sql,'otr_trip_create_gateway'))
  assert normal_created['tripId']==normal_trip and normal_created['actorAccountId']==actor
  normal_meta={**metadata_request,'tripId':normal_trip,'operationId':str(uuid.uuid4())}
  normal_meta_sql=metadata_command.replace(q(action['operationId'])+'::uuid',q(normal_meta['operationId'])+'::uuid').replace(q(tripid)+'::uuid',q(normal_trip)+'::uuid').replace(q(json.dumps(metadata_request)),q(json.dumps(normal_meta)))
  assert json.loads(sql(normal_meta_sql,'otr_trip_metadata_gateway'))['after']['name']=='Guest Edited retained'
  normal_person={**person_request,'tripId':normal_trip,'operationId':str(uuid.uuid4()),'personId':str(uuid.uuid4()),'tripCreateOperationId':normal_op}
  normal_person_sql=person_command.replace(q(tripid)+'::uuid',q(normal_trip)+'::uuid').replace(q(person['operationId'])+'::uuid',q(normal_person['operationId'])+'::uuid').replace(q(json.dumps(person_request)),q(json.dumps(normal_person)))
  assert json.loads(sql(normal_person_sql,'otr_trip_person_command_gateway'))['person']['userId'] is None
  checks.append('existing standalone Create/Metadata/Person Gateway paths still work with normal owning policy and no Adoption scope')
  sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=false;')
  caps=json.loads(sql('SELECT to_jsonb(c) FROM public.trip_sustained_core_capabilities('+q(actor)+'::uuid,'+q(normal_trip)+'::uuid) c;',CORE))
  assert caps['runtime_enabled'] is True and 'P1' in caps['enabled_families']
  checks.append('turning Adoption policy off does not disable existing normally authorized Core capability reads')


 # Complete one normal synthetic local Account's publication on one owning lease.
 sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=true;')
 pf=node();pa=pf['user']['id'];pr=pf['request'];pb=terminal_request(pr)
 sql('INSERT INTO auth.users(id,is_anonymous) VALUES('+q(pa)+',false);')
 sql('INSERT INTO public.profiles(id,display_name) VALUES('+q(pa)+",'QA Publication');")
 pg=json.loads(sql(call('confirm_and_issue',q(pa)+'::uuid',q(json.dumps(pr))+'::jsonb','true'),CORE))
 with tempfile.TemporaryDirectory(prefix='otr-auth-publication-') as temp:
  pp=Path(temp);(pp/'fixture.json').write_text(json.dumps(pf));(pp/'grant.json').write_text(json.dumps(pg));plan=node(pp/'fixture.json',pp/'grant.json')
  sql(call('seal_stage',q(pa)+'::uuid',q(plan['canonicalText']),q(plan['sha256'])),CORE)
  (pp/'material.json').write_text(json.dumps({'fixture':pf,'grant':pg,'plan':plan}))
  source=json.loads(json.loads(pf['checkpoint']['canonicalText'])['source']['canonicalText']);pt=source['trips'][0]['create']['tripId']
  def publication(mode):
   r=subprocess.run(['node','--import','tsx',str(HERE/'publication-local-pg.mts'),NAME,DB,str(pp/'material.json'),mode],cwd=ROOT,capture_output=True,text=True,timeout=60)
   assert r.returncode==0,r.stderr
   return json.loads(r.stdout)
  for mode in ['missing-core','rollback']:
   outcome=publication(mode)
   assert sql('SELECT count(*) FROM public.trips WHERE id='+q(pt)+';')=='0'
   assert sql('SELECT count(*) FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id='+q(pb['adoptionId'])+';')=='0'
   checks.append(mode+': incomplete owning execution or pre-COMMIT failure rolls back Trip/Person/Metadata/P1 and terminal receipt together')
  unknown_publication=publication('unknown')
  assert unknown_publication['actualCommit'] and unknown_publication['postFinalDenied']
  assert sql('SELECT count(*) FROM public.trips WHERE id='+q(pt)+';')=='1'
  assert sql('SELECT count(*) FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id='+q(pb['adoptionId'])+" AND outcome='PUBLISHED';")=='1'
  checks.append('actual COMMIT response loss reports UNKNOWN while exactly one business dataset and PUBLISHED journal commit')
  checks.append('post-final owning Trip/Metadata/Person mutation entry and unsealed Core op denied while original deferred Metadata COMMIT guard still passes')
  published=publication('commit')
  proof=json.loads(sql("SELECT jsonb_build_object('owner',(SELECT created_by FROM public.trips WHERE id="+q(pt)+"),'person',(SELECT id FROM public.journey_members WHERE trip_id="+q(pt)+" AND user_id="+q(pa)+" AND status='linked'),'items',(SELECT jsonb_agg(jsonb_build_object('owner',owner_account_id,'self',self_person_id)) FROM public.itinerary_events WHERE trip_id="+q(pt)+"),'visiblePeople',(SELECT jsonb_agg(person_id) FROM public.trip_item_visibility_people WHERE trip_id="+q(pt)+"));"))
  assert proof['owner']==pa and proof['items']==[{'owner':pa,'self':proof['person']}] and proof['visiblePeople']==[proof['person']]
  checks.append('fresh independent SQL verifies owning Account, linked Owner Person and P1 self/selected-person ACL use the real mapped Person')
  assert published['outcome']=='PUBLISHED' and published['authority']=='NONE'
  assert sql('SELECT count(*) FROM public.trip_core_command_receipts WHERE trip_id='+q(pt)+';')=='1'
  checks.append('fresh normal Core lease status/receipt and exact publisher retry recover the same committed record; Native source qualification passes, no duplicate Core operation')
  sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=false;')
  assert publication('commit')==published
  sql('SET ROLE postgres;UPDATE otr_auth_guest_composite.policy SET enabled=true;')
  wrong={**pb,'targetAccountId':actor}
  sql(call('publication_lock',q(actor)+'::uuid',q(json.dumps(wrong))+'::jsonb',q(plan['sha256'])),CORE,error='AUTH_ADOPTION_RECOVERY_FORBIDDEN')
  sql(call('publication_lock',q(pa)+'::uuid',q(json.dumps(pb))+'::jsonb',q('0'*64)),CORE,error='AUTH_ADOPTION_PUBLICATION_PLAN_MISMATCH')
  checks.append('committed publication retry survives Adoption OFF, retains exact plan/account binding and cannot be converted to cancellation')
 assert all((HERE/name).read_bytes()==body for name,body in input_bytes.items()),'FIXTURE_SOURCE_CHANGED_DURING_RUN'
 assert all((ROOT/name).read_bytes()==body for name,body in owning_bytes.items()),'OWNING_SOURCE_CHANGED_DURING_RUN'
 result={'status':'ISOLATED_REAL_GATEWAY_AUTHORITY_COMPONENT_ONLY','checks':checks,'count':len(checks),'network':'none','hostedWrites':0,'providerCalls':0,'businessWrites':'isolated synthetic Trip/Metadata/Person/P1 only; no Hosted writes','authoritySqlSha256':hashlib.sha256(input_bytes['authority.local.sql']).hexdigest(),'inputHashes':{name:hashlib.sha256(body).hexdigest() for name,body in input_bytes.items()},'owningExecution':committed,'owningPublication':published,'owningInputHashes':{name:hashlib.sha256(body).hexdigest() for name,body in owning_bytes.items()},'limits':['Protected patch applies only to the isolated accepted baseline, not actual Hosted DEV preimages','No mounted Auth/Native caller; PUBLISHED component is isolated only, local restore not executed','No actual Hosted DEV preimage/ACL verification; not an execution approval packet']}
 (HERE/'AUTHORITY_LOCAL_PG_RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:
 if created:docker('rm','-f','-v',NAME)
