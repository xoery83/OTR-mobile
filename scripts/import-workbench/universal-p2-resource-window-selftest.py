from pathlib import Path
import importlib.util,json,copy,tempfile,os,time
p=Path('docs/ops/universal-p2-formal-save-20261027').resolve();spec=importlib.util.spec_from_file_location('p2window',p/'p2_resource_window.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
before=json.loads((p/'P2_RESOURCE_FRESH_PREFLIGHT.json').read_text());auth=json.loads((p/'P2_RESOURCE_NORMAL_AUTH_READBACK.json').read_text());auth['authSessionExpiresAt']=m.iso(time.time()+3600);scope7={**before['scope'],'revision':7,'active':False,'scope_sha256':'f'*64};plan=m.bind(before,auth,scope7,time.time()-1);checks=[]
assert [g['grant_revision'] for g in plan['adminControl']['temporaryGrants']]==[9,11];checks.append('only existing CONFIG8→9 SECURITY10→11 renewal identities')
for key,value in [('active',True),('account_daily',19),('expires_at','2099-01-01T00:00:00Z')]:
 bad=copy.deepcopy(plan);bad['scope7'][key]=value
 try:m.validate(bad)
 except ValueError:pass
 else:raise AssertionError(key)
checks.append('rollback scope7 must be inactive exact original financial/pin/expiry row')
for edit in [lambda p:p.update(expiresAt=m.iso(m.epoch(p['startsAt'])+901)),lambda p:p['authReceipt'].update(oldRawFilesExist=[True,False]),lambda p:p['before'].update(newBatchRuns=1),lambda p:p['before']['adminGrants'][0].update(grant_revision=99)]:
 bad=copy.deepcopy(plan);edit(bad)
 try:m.validate(bad)
 except ValueError:pass
 else:raise AssertionError('invalid plan accepted')
checks.append('window/old recovery/existing Task/admin revision drift rejected')
opened=m.open_sql(plan);closed=m.revoke_sql(plan['adminControl']);assert 'INSERT INTO' not in opened and 'NOLOGIN' in closed and 'P2_ADMIN_ROLE_DRIFT' in opened and 'P2_ADMIN_GRANT_DRIFT' in opened and 'backend_start>=' in closed;checks.append('existing finite root grant renderer has CAS time role and own-session bounds')
oldsql,oldremote,oldclose=m.sql,m.remote_command,m.admin_close
try:
 with tempfile.TemporaryDirectory(prefix='otr-p2-resource-window-test-') as d:
  root=Path(d);state=copy.deepcopy(before);sent=[]
  def transport(text):
   if text==m.source('P2_RESOURCE_LEASE_DEV_INSTALL.sql'):state['function']['md5']='d7d6c6285b9752b89d516f8b2aaee554'
   elif text==m.source('P2_RESOURCE_LEASE_DEV_ROLLBACK.sql'):state['function']['md5']=before['function']['md5']
   elif 'LOGIN VALID UNTIL' in text:state['adminRole']['canLogin']=True
   if ' AS verified;' in text:return {'rows':[{'verified':state['scope']==plan['scope6'] and 'activationCommands' in sent}]}
   if ' AS closed;' in text:return {'rows':[{'closed':not state['adminRole']['canLogin']}]}
   return {'rows':[{'proof':copy.deepcopy(state)}]}
  m.sql=lambda root:transport
  def remote(p,phase):sent.append(phase);state['scope']=copy.deepcopy(p['scope6' if phase=='activationCommands' else 'scope7']);return {'status':'ACKNOWLEDGED_REQUIRES_INDEPENDENT_READBACK'}
  m.remote_command=remote
  def close(t,p):
   state['adminRole']['canLogin']=False
   for g in state['adminGrants']:
    t=next(x for x in p['adminControl']['temporaryGrants'] if x['admin_grant_id']==g['admin_grant_id']);g.update(grant_revision=t['grant_revision']+1,expires_at=p['expiresAt'],revoked_at=m.iso(time.time()))
  m.admin_close=close
  for name in ['scope-watch','admin-watch']:m.write(root/(name+'-armed.json'),{'planSHA256':m.sha(m.canonical(plan)),'pid':os.getpid(),'observedAt':time.time()})
  result=m.activate(root,plan);assert result['status']=='SCOPE6_VERIFIED_FUNCTION_INSTALLED_ADMIN_CLOSED' and m.success_marker(root,plan) and sent==['activationCommands']
  checks.append('success only after independent scope/function/ACL readback and admin closure')
  try:m.activate(root,plan)
  except ValueError:pass
  else:raise AssertionError('second activation accepted')
  assert sent==['activationCommands'];checks.append('repeat activation never dispatches or opens again')
  assert m.failure_close(root,plan)=={'status':'SUCCESS_RETAIN_SCOPE6'} and sent==['activationCommands'];checks.append('verified success keeps approved scope6 and prevents failure rollback')
 with tempfile.TemporaryDirectory(prefix='otr-p2-resource-window-failure-') as d:
  root=Path(d);state=copy.deepcopy(before);state['scope']=copy.deepcopy(plan['scope6']);state['function']['md5']='d7d6c6285b9752b89d516f8b2aaee554';state['adminRole']['canLogin']=True;sent=[]
  m.write(root/'success.json',{'status':'PARTIAL_NOT_VERIFIED'});assert not m.success_marker(root,plan)
  result=m.failure_close(root,plan);assert result['status']=='SCOPE_AND_FUNCTION_ROLLBACK_VERIFIED_ADMIN_CLOSED' and sent==['closeCommands'] and not state['adminRole']['canLogin']
  assert m.failure_close(root,plan)==result and sent==['closeCommands'];checks.append('partial marker cannot suppress exact scope7→function rollback; repeat close sends no second command')
 with tempfile.TemporaryDirectory(prefix='otr-p2-resource-window-crash-gap-') as d:
  root=Path(d);state=copy.deepcopy(before);state['scope']=copy.deepcopy(plan['scope6']);state['function']['md5']='d7d6c6285b9752b89d516f8b2aaee554';sent=['activationCommands'];m.admin_close(transport,plan)
  # Simulate process death after committed admin_close and before success write.
  assert not (root/'success.json').exists()
  result=m.failure_close(root,plan)
  assert result['status']=='COMMITTED_SUCCESS_RECOVERED_SCOPE6_RETAINED' and m.success_marker(root,plan) and sent==['activationCommands'];checks.append('crash after committed admin closure recovers exact audit-backed terminal success without reopening or append7')
  assert m.failure_close(root,plan)=={'status':'SUCCESS_RETAIN_SCOPE6'};checks.append('recovered success is sealed and idempotent')
 with tempfile.TemporaryDirectory(prefix='otr-p2-resource-window-no-audit-') as d:
  root=Path(d);state=copy.deepcopy(before);state['scope']=copy.deepcopy(plan['scope6']);state['function']['md5']='d7d6c6285b9752b89d516f8b2aaee554';sent=[];m.admin_close(transport,plan)
  assert not m.recover_success(root,plan,transport) and not m.success_marker(root,plan);checks.append('matching scope/function with absent own request audit cannot fabricate success')
finally:m.sql,m.remote_command,m.admin_close=oldsql,oldremote,oldclose
result={'status':'EXECUTOR_SELFTEST_PASS_NOT_DEV','checks':checks,'count':len(checks),'limits':'Injected transport lifecycle checks; SQL lease behavior has separate97 actual PG checks. Fresh authority/runtime window still required.'};Path('/private/tmp/otr-p2-resource-window-selftest.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
