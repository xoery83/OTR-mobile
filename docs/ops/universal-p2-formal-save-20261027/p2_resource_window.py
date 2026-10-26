"""One approved P2 scope6 maintenance window; existing SQL/CP14 transports only."""
import argparse,datetime,fcntl,hashlib,json,os,pathlib,subprocess,sys,time,uuid
REPO=pathlib.Path(__file__).resolve().parents[3]
PACKET=pathlib.Path(__file__).resolve().parent
REMOTE='/opt/otr/dev-backend/private/universal-p2-resource-lease-02a061e1'
IMAGE='sha256:0d50d567cbd9f35022b626b2f45b05a9fe7aa2137fbfbe443c48e3329ca157cb'
ACTOR='f4b059c5-8241-4ffb-aa15-37fa25474543';INTEGRATION='otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d'
sys.path.insert(0,str(REPO/'scripts/import'))
from universal_scope_close import SqlTransport,quote,canonical,sha
from universal_config_control import revoke_sql,revoked_sql,grant_preimage_sql
from build_universal_admin_plan import command_hash
from universal_watchdog import private,write,control_lock

def iso(t):return datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def epoch(s):return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
def sql(root):return SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase','/Users/xoery/Project/otr-mobile-universal-handoff-20261026',str(root))
def source(name):
 h=json.loads((PACKET/'P2_RESOURCE_LEASE_PACKAGE_HASHES.json').read_text())['files'][name];s=(PACKET/name).read_text()
 if sha(s.encode())!=h:raise ValueError('APPROVED_SQL_HASH_DRIFT')
 return s

def observe(transport):return transport((PACKET/'P2_RESOURCE_WINDOW_OBSERVE.sql').read_text())['rows'][0]['proof']
def validate(p):
 if p['ownerApproval']!='02a061e1:P2_RESOURCE_LEASE_AND_SCOPE_GATE:OWNER_AGREED' or p['project']!='tuqigdxrvrerfewsxqgm':raise ValueError('EXACT_OWNER_GATE_REQUIRED')
 if p['scope6']!=json.loads((PACKET/'P2_RESOURCE_SCOPE6_PROPOSAL.json').read_text()):raise ValueError('SCOPE6_DRIFT')
 if not 899.999<=epoch(p['expiresAt'])-epoch(p['startsAt'])<=900.001 or epoch(p['authReceipt']['authSessionExpiresAt'])<epoch(p['expiresAt'])+30:raise ValueError('FINITE_AUTH_WINDOW_REQUIRED')
 if p['authReceipt']['verifiedActorId']!=ACTOR or p['authReceipt']['emailConfirmed'] is not True or any(p['authReceipt']['oldRawFilesExist']) or p['authReceipt']['oldCandidateCount']!=0:raise ValueError('NORMAL_AUTH_OR_OLD_RECOVERY_CHANGED')
 if p['before']['function']['md5']!='3cef15114775a5334a6f68332c38b044' or p['before']['scope']['revision']!=5 or p['before']['newBatchRuns']!=0 or p['before']['adminSessions']!=0 or p['before']['adminRole']['canLogin'] or p['before']['create']:raise ValueError('LIVE_PREIMAGE_REQUIRED')
 closed={**p['before']['scope'],'revision':7,'active':False,'scope_sha256':p['scope7']['scope_sha256']}
 if p['scope7']!=closed or len(p['scope7']['scope_sha256'])!=64:raise ValueError('INACTIVE_SCOPE7_REQUIRED')
 if p['before']['grant']['revision']!=5 or p['before']['grant']['revoked'] or p['before']['qaCostExposure']>=1000000000:raise ValueError('EXISTING_GRANT_BUDGET_REQUIRED')
 approved=next(r['proof'] for r in json.loads((PACKET/'P2_RESOURCE_AUTHORITY_PREIMAGE.json').read_text())['rows'] if r['kind']=='scope')
 if p['before']['scope']!=approved or p['before']['policy']!={'enabled':True,'p1Review':False,'reviewScope':None}:raise ValueError('EXACT_SCOPE_OR_BUSINESS_GATE_DRIFT')
 oldgrants=json.loads((PACKET/'P2_RESOURCE_ADMIN_PREIMAGE.json').read_text())['rows'];expected=sorted([r['proof'] for r in oldgrants if r['kind']=='adminGrant'],key=lambda r:r['permission'])
 if p['before']['adminGrants']!=expected:raise ValueError('EXACT_ADMIN_PREIMAGE_REQUIRED')
 for name,h in p['helperHashes'].items():
  if sha((PACKET/name).read_bytes())!=h:raise ValueError('WINDOW_HELPER_DRIFT')
 return p

def load(root):
 root=private(root,True);p=json.loads(private(root/'plan.json').read_text());validate(p)
 if sha(canonical(p))!=json.loads(private(root/'sealed.json').read_text())['sha256']:raise ValueError('PLAN_SEAL_DRIFT')
 return root,p

def bind(before,auth,scope7,starts):
 end=starts+900;a={'actorId':ACTOR,'startsAt':iso(starts),'expiresAt':iso(end),'temporaryGrants':[],'grantRenewalPreimages':{}}
 for old in before['adminGrants']:
  a['grantRenewalPreimages'][old['permission']]=old
  a['temporaryGrants'].append({**old,'grant_revision':old['grant_revision']+1,'expires_at':iso(end),'revoked_at':None})
 context={'version':1,'principal_kind':'OTR_ADMIN','verified_actor_id':ACTOR,'verified_client_identity':None,'verified_external_subject':None,'verified_account_id':ACTOR,'verified_environment':'DEV','auth_source':'SUPABASE_DEV_USER','auth_config_version':1,'auth_session_reference':'vault:otr/dev/qa/universal-stage2-20261025','verified_at':auth['verifiedAt'],'expires_at':iso(end),'revoked':False}
 def command(row,expected):
  c={'version':1,'environment':'DEV','request_id':str(uuid.uuid4()),'actor_id':ACTOR,'integration_id':INTEGRATION,'expected_version':expected,'audit_id':str(uuid.uuid4()),'reason_code':'UNIVERSAL_P2_APPROVED_RESOURCE_LEASE','row':row};c['request_sha256']=command_hash(c)
  return {'kind':'flight_activation_select','command':c,'context':{**context,'request_id':c['request_id'],'request_sha256':c['request_sha256'],'command_kind':'flight_activation_select','gateway_identity':'otr_external_integration_admin_gateway'}}
 scope6=json.loads((PACKET/'P2_RESOURCE_SCOPE6_PROPOSAL.json').read_text())
 p={'ownerApproval':'02a061e1:P2_RESOURCE_LEASE_AND_SCOPE_GATE:OWNER_AGREED','project':'tuqigdxrvrerfewsxqgm','actorId':ACTOR,'startsAt':iso(starts),'expiresAt':iso(end),'adminControl':a,'authReceipt':auth,'before':before,'scope6':scope6,'scope7':scope7,'providerControl':{'activationCommands':[command(scope6,5)],'closeCommands':[command(scope7,6)]},'helperHashes':{n:sha((PACKET/n).read_bytes()) for n in ['p2_resource_window.py','P2_RESOURCE_WINDOW_OBSERVE.sql']}}
 return validate(p)

def open_sql(p):
 a=p['adminControl'];guards=[];updates=[]
 for r in a['temporaryGrants']:
  old=a['grantRenewalPreimages'][r['permission']];key=quote(r['admin_grant_id'])+'::uuid';exact=grant_preimage_sql(old)
  guards.append("PERFORM 1 FROM public.external_integration_admin_grants WHERE admin_grant_id="+key+" FOR UPDATE;IF NOT EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE admin_grant_id="+key+' AND '+exact+") THEN RAISE EXCEPTION 'P2_ADMIN_GRANT_DRIFT';END IF;")
  updates.append("UPDATE public.external_integration_admin_grants SET grant_revision="+str(r['grant_revision'])+",expires_at="+quote(p['expiresAt'])+"::timestamptz,revoked_at=NULL WHERE admin_grant_id="+key+';')
 guards.append("IF session_user<>'postgres' OR current_user<>'postgres' OR clock_timestamp()<"+quote(p['startsAt'])+"::timestamptz OR clock_timestamp()>"+quote(iso(epoch(p['startsAt'])+120))+"::timestamptz THEN RAISE EXCEPTION 'P2_ADMIN_WINDOW_CLOSED';END IF;")
 role=p['before']['adminRole'];guards.append("IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_external_integration_admin_gateway' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND rolvaliduntil="+quote(role['validUntil'])+"::timestamptz) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='otr_external_integration_admin_gateway') OR EXISTS(SELECT 1 FROM public.external_integration_admin_grants WHERE actor_id='"+ACTOR+"' AND environment='DEV' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'P2_ADMIN_ROLE_DRIFT';END IF;")
 return "BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SELECT pg_advisory_xact_lock(714024,3);DO $p2$ BEGIN "+''.join(guards)+" END $p2$;"+''.join(updates)+"ALTER ROLE otr_external_integration_admin_gateway LOGIN VALID UNTIL "+quote(p['expiresAt'])+';COMMIT;'

def remote_command(p,phase):
 args=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','root@178.105.151.143','docker','run','--rm','--network','host','--memory','128m','--cpus','1','--user','0:0','--entrypoint','node','-v',REMOTE+':'+REMOTE+':rw','-v','/opt/otr/dev-backend/private/universal-stage2-continuous/credentials.json:/opt/otr/dev-backend/private/universal-stage2-continuous/credentials.json:ro','-v','/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json:/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json:ro',IMAGE,REMOTE+'/universal-continuous-operator.mjs',phase,'0',sha(canonical(p))]
 r=subprocess.run(args,capture_output=True,text=True,timeout=50)
 if r.returncode:raise ValueError('CP14_COMMAND_UNKNOWN_READBACK_ONLY')
 v=json.loads(r.stdout)
 if v['status']!='ACKNOWLEDGED_REQUIRES_INDEPENDENT_READBACK':raise ValueError('CP14_ACK_UNKNOWN')
 return v

def admin_close(transport,p):
 transport(revoke_sql(p['adminControl']))
 if transport(revoked_sql(p['adminControl']))['rows']!=[{'closed':True}]:raise ValueError('ADMIN_CLOSE_UNCONFIRMED')

def stable(o,p,active):
 b=p['before'];f=dict(o['function']);expected=dict(b['function']);expected['md5']='d7d6c6285b9752b89d516f8b2aaee554' if active else '3cef15114775a5334a6f68332c38b044'
 return f==expected and not o['create'] and o['edges']==b['edges'] and o['grant']==b['grant'] and o['oldCall']==b['oldCall'] and o['oldHold']==b['oldHold'] and o['qaCostExposure']==b['qaCostExposure'] and o['policy']==b['policy']

def success_marker(root,p):
 for name in ['success.json','success-recovered.json']:
  try:
   r=json.loads(private(root/name).read_text())
   if r['status']=='SCOPE6_VERIFIED_FUNCTION_INSTALLED_ADMIN_CLOSED' and r['planSHA256']==sha(canonical(p)):return True
  except (OSError,ValueError,KeyError):pass
 return False

def audit_ok(transport,p):
 c=p['providerControl']['activationCommands'][0]['command']
 q="BEGIN READ ONLY;SELECT EXISTS(SELECT 1 FROM public.external_integration_config_audit WHERE audit_id="+quote(c['audit_id'])+"::uuid AND command_id="+quote(c['request_id'])+"::uuid AND admin_actor_id='"+ACTOR+"' AND integration_id='"+INTEGRATION+"' AND environment='DEV' AND entity_kind='flight_scope' AND new_version=6 AND after_sha256="+quote(c['row']['scope_sha256'])+" AND safe_diff->>'request_sha256'="+quote(c['request_sha256'])+" AND safe_diff->>'command_kind'='flight_activation_select') AND EXISTS(SELECT 1 FROM public.external_integration_config_audit WHERE audit_id="+quote(c['request_id'])+"::uuid AND entity_kind='request' AND after_sha256="+quote(c['request_sha256'])+") AS verified;COMMIT;"
 return transport(q)['rows']==[{'verified':True}]

def terminal_success(o,p):
 if o['scope']!=p['scope6'] or not stable(o,p,True) or o['adminRole']['canLogin'] or o['adminSessions']:return False
 expected={g['admin_grant_id']:g for g in p['adminControl']['temporaryGrants']}
 return len(o['adminGrants'])==2 and all(g['admin_grant_id'] in expected and g['grant_revision']==expected[g['admin_grant_id']]['grant_revision']+1 and g['revoked_at'] is not None and epoch(g['expires_at'])==epoch(p['expiresAt']) for g in o['adminGrants'])

def recover_success(root,p,transport):
 first=observe(transport)
 if not terminal_success(first,p) or not audit_ok(transport,p):return False
 if transport(revoked_sql(p['adminControl']))['rows']!=[{'closed':True}]:return False
 second=observe(transport)
 if second!=first or not terminal_success(second,p):raise ValueError('TERMINAL_SUCCESS_DRIFT')
 result={'status':'SCOPE6_VERIFIED_FUNCTION_INSTALLED_ADMIN_CLOSED','at':iso(time.time()),'planSHA256':sha(canonical(p)),'recoveredCommittedSuccess':True,'observed':second}
 write(root/'success-recovered.json',result);return True

def failure_close(root,p):
 with control_lock(root):
  if success_marker(root,p):return {'status':'SUCCESS_RETAIN_SCOPE6'}
  transport=sql(root)
  if recover_success(root,p,transport):return {'status':'COMMITTED_SUCCESS_RECOVERED_SCOPE6_RETAINED'}
  transport("BEGIN;SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='otr_external_integration_admin_gateway' AND backend_start>="+quote(p['startsAt'])+"::timestamptz AND backend_start<"+quote(p['expiresAt'])+"::timestamptz AND pid<>pg_backend_pid();COMMIT;")
  o=observe(transport)
  if (root/'failure-closed.json').exists():
   if stable(o,p,False) and o['scope'] in [p['before']['scope'],p['scope7']] and not o['adminRole']['canLogin'] and o['adminSessions']==0:return json.loads(private(root/'failure-closed.json').read_text())
   raise ValueError('CLOSED_RESULT_CHANGED')
  if o['scope']==p['scope6']:
   if time.time()>=epoch(p['expiresAt'])-60:raise ValueError('CLOSE_COMMAND_WINDOW_LOST')
   remote_command(p,'closeCommands');o=observe(transport)
   if o['scope']!=p['scope7']:raise ValueError('SCOPE7_CLOSURE_UNKNOWN')
  if o['scope'] not in [p['before']['scope'],p['scope7']]:raise ValueError('SCOPE_CLOSURE_DRIFT')
  if o['function']['md5']=='d7d6c6285b9752b89d516f8b2aaee554':transport(source('P2_RESOURCE_LEASE_DEV_ROLLBACK.sql'))
  admin_close(transport,p);o=observe(transport)
  if not stable(o,p,False):raise ValueError('ROLLBACK_READBACK_DRIFT')
  result={'status':'SCOPE_AND_FUNCTION_ROLLBACK_VERIFIED_ADMIN_CLOSED','at':iso(time.time())};write(root/'failure-closed.json',result);return result

def activate(root,p):
 with control_lock(root):
  if (root/'success.json').exists() or (root/'failure-closed.json').exists() or (root/'close-requested').exists() or time.time()>=epoch(p['startsAt'])+120:raise ValueError('ONE_WINDOW_CLOSED')
  for name in ['scope-watch','admin-watch']:
   beat=json.loads(private(root/(name+'-armed.json')).read_text())
   if beat['planSHA256']!=sha(canonical(p)) or not 0<=time.time()-beat['observedAt']<2:raise ValueError('WATCH_SEAL_DRIFT')
   os.kill(beat['pid'],0)
  write(root/'activation-claimed.json',{'at':iso(time.time())})
  transport=sql(root);o=observe(transport)
  if o!=p['before']:raise ValueError('FRESH_PREFLIGHT_CHANGED')
  transport(source('P2_RESOURCE_LEASE_DEV_INSTALL.sql'));transport(open_sql(p))
  ack=remote_command(p,'activationCommands');o=observe(transport)
  if o['scope']!=p['scope6'] or not stable(o,p,True):raise ValueError('SCOPE6_READBACK_DRIFT')
  admin_close(transport,p);o=observe(transport)
  if not terminal_success(o,p) or not audit_ok(transport,p):raise ValueError('FINAL_READBACK_DRIFT')
  result={'status':'SCOPE6_VERIFIED_FUNCTION_INSTALLED_ADMIN_CLOSED','at':iso(time.time()),'planSHA256':sha(canonical(p)),'ack':ack,'observed':o};write(root/'success.json',result);return result

def watch(root,p,mode):
 name='scope-watch' if mode=='scope-watch' else 'admin-watch';write(root/(name+'-armed.json'),{'planSHA256':sha(canonical(p)),'pid':os.getpid(),'observedAt':time.time()})
 deadline=epoch(p['startsAt'])+(660 if mode=='scope-watch' else 900)
 while time.time()<deadline:
  if mode=='scope-watch' and success_marker(root,p):return {'status':'SUCCESS_MARKER_SCOPE_RETAINED'}
  if mode=='scope-watch' and (root/'close-requested').exists():break
  temp=root/(name+'-heartbeat.tmp')
  with open(temp,'w') as f:os.chmod(temp,0o600);json.dump({'planSHA256':sha(canonical(p)),'pid':os.getpid(),'observedAt':time.time()},f)
  os.replace(temp,root/(name+'-armed.json'));time.sleep(.2)
 if mode=='admin-watch':
  admin_close(sql(root),p);return {'status':'FINAL_ADMIN_CLOSED_VERIFIED','at':iso(time.time())}
 return failure_close(root,p)

def main():
 a=argparse.ArgumentParser();a.add_argument('mode',choices=['activate','scope-watch','admin-watch','status','close']);a.add_argument('--run-dir',required=True);x=a.parse_args();root,p=load(x.run_dir)
 if x.mode=='activate':
  try:r=activate(root,p)
  except Exception:
   if not (root/'close-requested').exists():write(root/'close-requested',{'at':iso(time.time())})
   raise
 elif x.mode=='status':r=observe(sql(root))
 elif x.mode=='close':r=failure_close(root,p)
 else:r=watch(root,p,x.mode);write(root/(x.mode+'-result.json'),r)
 print(json.dumps(r))
if __name__=='__main__':
 try:main()
 except Exception as e:
  print(json.dumps({'status':'RESOURCE_WINDOW_UNCONFIRMED_READBACK_REQUIRED','errorClass':type(e).__name__}));raise SystemExit(2)
