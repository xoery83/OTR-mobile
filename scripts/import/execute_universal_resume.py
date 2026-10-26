"""Explicit approved one-shot StageII execution; no default or retries."""
import sys,json,os,time,subprocess,importlib.util,base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/import'))
from universal_continuous_transition import canonical,sha,instant,close_transition
from universal_continuous_execution import ports
from universal_continuous_runtime_ports import remote_python,admin_command
from universal_scope_close import SqlTransport
from universal_continuous_sql_ports import observe_sql
from universal_config_control import receipted
import universal_qa_policy
base=Path('/private/tmp/otr-universal-resume-20261026');old=Path('/private/tmp/otr-universal-stage2-live-control');run=base/'run1';p=json.load(open(run/'plan.json'));b=json.load(open(base/'binding.json'))
sql=SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase','/Users/xoery/Project/otr-mobile-canonical',str(run));a=ports(p,str(run))
def record(step,result):
 v={'step':step,'observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'result':result};f=run/('event-'+step+'.json');f.write_bytes(canonical(v));f.chmod(0o600);print(json.dumps(v),flush=True)
def one(q,k):return sql(q)['rows'][0][k]
def transfer(local,target):
 data=Path(local).read_bytes();expected=sha(data)
 source="import os,json,base64,hashlib\npreimages="+repr({'plan.json':'6409b6625ee3e56318cb7dfa496c9fc7a1dd5a1b9180181bd08745e431b09b05'})+"\np="+repr(target)+"\nb=base64.b64decode("+repr(base64.b64encode(data).decode())+")\nexpected="+repr(expected)+"\nif os.path.exists(p) and hashlib.sha256(open(p,'rb').read()).hexdigest()!=expected:\n assert hashlib.sha256(open(p,'rb').read()).hexdigest()==preimages[os.path.basename(p)]\n t=p+'.resume';fd=os.open(t,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)\n with os.fdopen(fd,'wb') as f:f.write(b)\n os.replace(t,p)\nelif os.path.exists(p):\n assert (os.stat(p).st_mode&511)==384\nelse:\n fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)\n with os.fdopen(fd,'wb') as f:f.write(b)\nprint(json.dumps({'verified':hashlib.sha256(open(p,'rb').read()).hexdigest()==expected}))"
 if remote_python(source).get('verified') is not True:raise ValueError('PRIVATE_TRANSFER_UNKNOWN_RECONCILE_ONLY')

owned=False
def main():
 global owned
 claim=os.open(run/'execution-claimed.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.write(claim,b'EXACT_OWNER_APPROVED_ONE_SHOT');os.close(claim)
 if (run/'watch-claimed.json').exists():raise ValueError('FRESH_WATCH_RUN_REQUIRED')
 assert sha(canonical(p))==b['planSHA256'] and sha((old/'qa-input6.json').read_bytes())==b['qaInputSHA256']
 # Verify fixed existing bundles and input; transfer only the new nonsecret projection.
 check=remote_python(r'''import json,hashlib,os
root='/opt/otr/dev-backend/private/universal-stage2-continuous/'
expected={'universal-continuous-operator.mjs':'1826811b424f9210e713f8f06688202a25ed281e6207af436f43c758e6a7faaf','universal-stage2-qa-entry.mjs':'230f9a84bdba713cf7967ec107c066d894bc46181af56c6cfa113a5487d4dadd','qa-input.json':'e227e9fd95978157c63862a5092d1791b4b0ea69aa998c3b6d027b12e4800b8c'}
assert all(hashlib.sha256(open(root+k,'rb').read()).hexdigest()==v for k,v in expected.items())
print(json.dumps({'fixedArtifactsUnchanged':True}))
''')
 assert check=={'fixedArtifactsUnchanged':True}
 transfer(base/'operator-plan.json','/opt/otr/dev-backend/private/universal-stage2-continuous/plan.json')
 record('private-transfer',{'status':'SEALED_OPERATOR_PLAN_TRANSFERRED','operatorUnchanged':True,'retainedInputUnchanged':True})
 # Independent process must have claimed closure before any SQL/permission/service change.
 log=open(run/'watch.log','x');os.chmod(run/'watch.log',0o600)
 watch=subprocess.Popen([sys.executable,str(ROOT/'scripts/import/universal_continuous_execution.py'),'watch','--run-dir',str(run),'--plan-sha',b['planSHA256']],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.DEVNULL,start_new_session=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
 for _ in range(20):
  if (run/'watch-claimed.json').exists():break
  if watch.poll() is not None:raise ValueError('WATCH_START_FAILED')
  time.sleep(.2)
 else:raise ValueError('WATCH_NOT_ARMED')
 owned=True
 record('watch-armed',{'pid':watch.pid,'innerCloseAt':p['expiresAt'],'outerCloseAt':p['adminControl']['expiresAt']})
 if time.time()<instant(p['startsAt']):time.sleep(instant(p['startsAt'])-time.time())
 if instant(p['expiresAt'])-time.time()<540:raise ValueError('INSUFFICIENT_UNCHANGED_SETUP_WINDOW')
 runtime=a['read_runtime'](p);record('baseline-runtime',runtime)
 r=p['runtime']
 if runtime!={'containerId':r['originalContainerId'],'imageId':r['baselineImageId'],'healthy':True,'configSHA256':r['baselineConfigSHA256'],'hostConfigSHA256':r['baselineHostConfigSHA256'],'mountsSHA256':r['baselineMountsSHA256']}:raise ValueError('EXACT_HEALTHY_RETAINED_BASELINE_REQUIRED')
 meta=a['read_sql'](p);record('baseline-sql',meta)
 if meta['installedSqlHashes']!=p['sqlHashes'] or meta['unexpectedAuthorityActive'] or meta['providerScopeActive'] or meta['providerGrantActive'] or meta['catalog']!=p['catalogBaseline'] or meta['sourceMeterLogins']!=p['sourceMeterBaseline'] or meta['sourceMeterSessions']!=p['sourceMeterSessionBaseline']:raise ValueError('EXACT_CLOSED_SQL_PREIMAGE_REQUIRED')
 # Recovery may not install or alter SQL. Exact actual postimages already required.
 meta=a['read_sql'](p);record('installed-sql-readback',meta)
 if meta['installedSqlHashes']!=p['sqlHashes'] or meta['unexpectedAuthorityActive']:raise ValueError('INSTALLED_FUNCTION_OR_ACL_DRIFT')
 prior=json.load(open(base/'closed-preimages.json'))['policy']
 prior_closure=json.load(open('/private/tmp/otr-universal-cleanup-20261026/run1/cleanup-result.json'))
 assert prior_closure['status']=='CLOSED_VERIFIED' and prior_closure['rollbackVerified'] is True
 sql(universal_qa_policy.resume_sql(p,prior,json.load(open(old/'run6/independent-server-readback.json'))['receipt']));record('new-policy-readback',one(universal_qa_policy.readback_sql(p),'policy'))
 from universal_continuous_role_setup import render
 sql(render(p))
 record('roles-installed',a['read_admin'](p));record('service-roles-readback',a['read_sql'](p))
 for index,x in enumerate(p['providerControl']['activationCommands']):
  if instant(p['expiresAt'])-time.time()<300 or watch.poll() is not None or (run/'close-claimed.json').exists():raise ValueError('ACTIVATION_CLOSURE_RESERVE_REQUIRED')
  result=admin_command(p,'activationCommands',index);observation=one(observe_sql(p),'observation')
  if not receipted(observation,x):raise ValueError('PROVIDER_COMMAND_RECEIPT_UNCONFIRMED')
  record('provider-command-'+str(index),result)
 if instant(p['expiresAt'])-time.time()<300 or watch.poll() is not None or (run/'close-claimed.json').exists():raise ValueError('DEPLOYMENT_CLOSURE_RESERVE_REQUIRED')
 source='plan='+repr(p)+'\n'+r'''
import json,subprocess,time,hashlib
h=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def inspect(i):return json.loads(subprocess.check_output(['docker','inspect',i]))[0]
r=plan['runtime'];old=inspect(r['originalContainerId']);new=inspect(r['stagedContainerId'])
assert old['Name']=='/otr-dev-backend' and old['State']['Health']['Status']=='healthy' and h(old['Config'])==r['baselineConfigSHA256'] and h(old['HostConfig'])==r['baselineHostConfigSHA256']
assert not new['State']['Running'] and new['Image']==r['imageId'] and h(new['Config'])==r['activeConfigSHA256'] and h(new['HostConfig'])==r['createdHostConfigSHA256']
subprocess.check_call(['docker','stop','-t','15',r['originalContainerId']],stdout=subprocess.DEVNULL)
subprocess.check_call(['docker','rename',r['originalContainerId'],r['backupContainerName']])
subprocess.check_call(['docker','rename',r['stagedContainerId'],'otr-dev-backend'])
subprocess.check_call(['docker','start',r['stagedContainerId']],stdout=subprocess.DEVNULL)
for _ in range(45):
 n=inspect(r['stagedContainerId'])
 if n['State'].get('Health',{}).get('Status')=='healthy':break
 if not n['State']['Running']:raise ValueError('CANDIDATE_EXITED')
 time.sleep(1)
else:raise ValueError('CANDIDATE_HEALTH_FAILED')
assert n['Id']==r['stagedContainerId'] and n['Image']==r['imageId'] and h(n['Config'])==r['activeConfigSHA256'] and h(n['HostConfig'])==r['activeHostConfigSHA256'] and h(sorted(n['Mounts'],key=lambda m:(m['Destination'],m['Source'])))==r['activeMountsSHA256']
print(json.dumps({'status':'FIXED_CANDIDATE_HEALTH_PASS','containerId':n['Id'],'imageId':n['Image'],'restartCount':n['RestartCount']}))
'''
 record('deployment',remote_python(source))
 # Existing accepted Trip and retained Sources only; no Create/expired Run replay.
 # Close temporary admin only after all active-service checks other than admin closure are true.
 source_state=a['read_source'](p)
 if source_state.get('normalServiceVerified') is not True or source_state.get('policyEnabled') is not True:raise ValueError('ACTUAL_SOURCE_SERVICE_NOT_VERIFIED')
 meta=a['read_sql'](p);runtime=a['read_runtime'](p);budget=a['read_budget'](p)
 if (meta['installedSqlHashes']!=p['sqlHashes'] or meta['unexpectedAuthorityActive'] or not meta['sourceMeterRestricted'] or not all(meta['sourceMeterLogins'].values()) or not meta['providerScopeActive'] or not meta['providerGrantActive'] or meta['catalog']!=p['catalogBaseline'] or not runtime['healthy'] or runtime['imageId']!=p['runtime']['imageId'] or runtime['configSHA256']!=p['runtime']['activeConfigSHA256'] or runtime['hostConfigSHA256']!=p['runtime']['activeHostConfigSHA256'] or runtime['mountsSHA256']!=p['runtime']['activeMountsSHA256'] or runtime['containerId']!=p['runtime']['stagedContainerId'] or budget!={'scopeId':p['scopeId'],'expiresAt':p['providerExpiresAt'],'bounds':p['budget'],'sourceAndUsageBindingVerified':True}):raise ValueError('ALL_NONADMIN_HANDOFF_CHECKS_REQUIRED')
 record('pre-admin-close-all-checks',{'status':'ACTUAL_NONADMIN_HANDOFF_CHECKS_PASS'})
 a['revoke_admin'](p);record('admin-closed',a['read_admin'](p))
 from universal_continuous_transition import handoff
 record('handoff',handoff(p,run,a))
 record('final-live-state',{'status':'SUSTAINED_SERVICE_ACTIVE_PENDING_NATIVE_ACCEPTANCE','providerPaidCallsMustBeReadBack':True})

if __name__=='__main__':
 if sys.argv[1:]!=['--execute-approved-once']:raise SystemExit('EXPLICIT_EXECUTION_REQUIRED_NO_ACTION')
 try:main()
 except Exception as e:
  record('execution-failed',{'category':type(e).__name__,'safeCode':str(e) if isinstance(e,ValueError) and str(e).replace('_','').isalnum() else 'UNCONFIRMED_READBACK_REQUIRED'})
  if owned and (run/'watch-claimed.json').exists() and not (run/'handoff.json').exists():
   try:record('automatic-close',close_transition(p,run,a))
   except Exception:record('automatic-close',{'status':'RECONCILE_REQUIRED'})
  raise SystemExit(2)
