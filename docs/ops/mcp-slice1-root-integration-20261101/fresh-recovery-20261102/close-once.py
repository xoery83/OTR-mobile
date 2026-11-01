"""Exact current-pointer closure; persist helper result before independent checks."""
import sys,json,hashlib
from pathlib import Path
sys.path.insert(0,'/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-slice1-root-fresh-20261102');base=json.loads((p/'EMPTY_ROUND_INTENT.json').read_text())['request']
collector_source=None
try:
 raw=Path(__file__).with_name('safe_mcp_close_logs.py').read_bytes()
 if hashlib.sha256(raw).hexdigest()=='9334be21220e0c73b913c01d73f1007f810956bb6f790941382d7b95a2242c95':collector_source=raw.decode('utf-8')
except Exception:pass  # Optional diagnostics cannot prevent mandatory closure.
x=remote_python('BASE='+repr(base)+'\nCOLLECTOR_SOURCE='+repr(collector_source)+'\n'+r'''
import sys,json,hashlib,subprocess,datetime
from pathlib import Path
r=Path('/opt/otr/dev-backend/build/auth-consumer-write-qa-'+BASE['windowId']);sys.path.insert(0,str(r))
from config_cas import private,atomic_private
from deploy import inspect,digest,environment,verify_http
assert hashlib.sha256(private(r/'close_current.py')).hexdigest()=='c9e086da959432b434d949e6a136d0daf1b9643add73f2e0365b629c15500cb0'
pointer=json.loads(private(r/'close-current.json'));s=inspect('otr-dev-backend');plan=json.loads(private(r/'deploy-plan.json'));g=json.loads(private(r/'empty-cas.json'))
diagnostics={'status':'UNAVAILABLE','reason':'ALREADY_DEFAULT_NOT_CAPTURED','evidence':'BOUNDED_TAIL_NOT_COMMIT_PROOF'}
# shortcut: timer-first removal cannot retain logs here; preserve safety and integrate only at the next timer qualification.
if s['Id']!=BASE['defaultContainerId']:
 assert s['Id']==pointer['currentContainerId'] and digest(s['Config'])==plan['expectedConfigSHA256']
 assert not (r/'manual-close-intent.json').exists(),'CLOSE_ALREADY_ATTEMPTED_RECONCILE'
 diagnostics={'status':'UNAVAILABLE','reason':'HELPER_UNAVAILABLE','evidence':'BOUNDED_TAIL_NOT_COMMIT_PROOF'}
 try:
  scope={};exec(COLLECTOR_SOURCE,scope)
  diagnostics=scope['retain_before_close'](s['Id'],r,COLLECTOR_SOURCE)
 except Exception:pass
 atomic_private(r/'manual-close-intent.json',{'currentId':s['Id'],'windowId':BASE['windowId']})
 z=subprocess.run(['python3',str(r/'close_current.py'),str(r)],capture_output=True,text=True,timeout=100)
 try:helper=json.loads(z.stdout)
 except Exception:helper={'status':'HELPER_UNCONFIRMED','exitCode':z.returncode}
 atomic_private(r/'manual-close-helper-result.json',helper)
 assert z.returncode==0,'CLOSE_UNCONFIRMED_NO_BLIND_RETRY'
else:helper={'status':'ALREADY_DEFAULT_READBACK_ONLY'}
s=inspect('otr-dev-backend');e=environment(s)
assert s['Id']==BASE['defaultContainerId'] and digest(s['Config'])==BASE['defaultConfigSHA256'] and s['State']['Health']['Status']=='healthy'
assert 'OTR_DEV_MCP_WRITE_QA_CONFIG' not in e and 'OTR_DEV_MCP_READ_QA_CONFIG' not in e
assert s['HostConfig']==plan['expectedHostConfig'];verify_http(g)
assert all(hashlib.sha256(Path(x).read_bytes()).hexdigest()==h for x,h in {**g['beforeConfigHashes'],**g['mountedFileHashes']}.items())
u='otr-mcp-slice1-runtime-close-'+BASE['windowId']
stop=subprocess.run(['systemctl','stop',u+'.timer'],capture_output=True,text=True,timeout=10)
state=subprocess.run(['systemctl','show',u+'.timer','--property=ActiveState','--value'],capture_output=True,text=True).stdout.strip();assert state=='inactive'
print(json.dumps({'status':'ROOT_CLOSED_SERVER_VERIFIED','windowId':BASE['windowId'],'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containerId':s['Id'],'configSHA256':digest(s['Config']),'health':'healthy','bothQaKeysAbsent':True,'defaultHostExact':True,'all23FilesMatch':True,'httpHealth200Protected401':True,'timerInactive':True,'helper':helper,'mcpDiagnostics':diagnostics}))
''');(p/'FINAL_CLOSE_READBACK.json').write_text(json.dumps(x,indent=2));print(json.dumps(x))
