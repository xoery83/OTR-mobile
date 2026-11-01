"""Run only after Root independently reads the actual Consumer Preview/human reply."""
import sys,json,hashlib
from pathlib import Path
sys.path.insert(0,'/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-slice1-root-fresh-20261102');approvalpath=Path(sys.argv[1]);a=json.loads(approvalpath.read_text())
assert a['ownerConfirmed'] is True and a['sourceThreadId']=='01a1803b-c5a7-7ab0-a90f-fb4f87609201' and a['sourceMessageId']
assert a['operationId']=='1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf' and a['previewDigest']=='1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546'
assert a['approvedExecutionGateSHA256']=='b94fd543e02f5b0085fe5abe99fdc4d010a88c0c130234ba4f37b8382dde8251'
assert a['gateSHA256']=='530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801'
raw=approvalpath.read_bytes();base=json.loads((p/'EMPTY_ROUND_INTENT.json').read_text())['request'];active=json.loads((p/'EMPTY_ROUND_RESULT.json').read_text())['result'];assert active['status']=='MCP_SLICE1_CONFIG_CAS_HEALTHY'
with (p/'CONFIRM_INTENT.json').open('x') as f:json.dump({'approvalSHA256':hashlib.sha256(raw).hexdigest(),'sourceMessageId':a['sourceMessageId'],'deadlineMs':base['deadlineMs']},f)
out=remote_python('APPROVAL='+repr(raw)+'\nBASE='+repr(base)+'\nACTIVE='+repr(active)+'\n'+r'''
import sys,json,hashlib,subprocess,os,time
from pathlib import Path
r=Path('/opt/otr/dev-backend/build/auth-consumer-write-qa-'+BASE['windowId']);sys.path.insert(0,str(r))
from config_cas import private,atomic_private
from deploy import inspect,digest,environment
assert int(time.time()*1000)<BASE['deadlineMs']-120000
assert hashlib.sha256(private(r/'config_cas.py')).hexdigest()=='0ba00b4575b0c828ea5b6bb05d879c8f32e2a71d9602ac27ceba4980f9e9ebee'
assert hashlib.sha256(private(r/'restore.py')).hexdigest()=='e7c06f49fb8457dd087086ff074b03064801e5d42ec379006ae827d62f5bee2b'
assert subprocess.check_output(['systemctl','show','otr-mcp-slice1-runtime-close-'+BASE['windowId']+'.timer','--property=ActiveState','--value'],text=True).strip()=='active'
a=json.loads(APPROVAL);s=inspect('otr-dev-backend');d=inspect('cb71e00e7698ee78558cc787cb8f175ac3f0a5708fe6c129ba15c0d456953d2c')
assert s['Id']==ACTIVE['containerId'] and digest(s['Config'])==ACTIVE['configSHA256']
q=json.loads(environment(s)['OTR_DEV_MCP_WRITE_QA_CONFIG']);assert q['confirmations']==[]
q['confirmations']=[{'operationId':a['operationId'],'previewDigest':a['previewDigest']}]
for name,b in [('owner-approval.json',APPROVAL)]:
 fd=os.open(r/name,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
assert hashlib.sha256(private(r/'prepare_cas.py')).hexdigest()=='aac0c9940409a9eff40fe5f3e8d554ec984152f3cb74ad3511fc33249ed03a98'
from prepare_cas import make_plan
request={'gateSHA256':a['gateSHA256'],'windowId':BASE['windowId'],'phase':'CONFIRM','clientProfile':'Claude','windowStartedAtMs':BASE['windowStartedAtMs'],'authQaConfig':json.dumps(q),'ownerApproval':a,'approvalRecordSHA256':hashlib.sha256(APPROVAL).hexdigest(),'expectedCurrentContainerId':s['Id'],'expectedCurrentConfigSHA256':digest(s['Config']),'defaultContainerId':d['Id'],'defaultConfigSHA256':'335997de5233bb374e49b62abf34e10231bbf2b3e4856228092b075111cc6c34'}
t=json.loads(private(r/'empty-cas.json'));g=make_plan(request,s,d,t,int(time.time()*1000));plan=r/'confirm-cas.json';assert not plan.exists();atomic_private(plan,g);sha=hashlib.sha256(private(plan)).hexdigest()
x=subprocess.run(['python3',str(r/'config_cas.py'),str(plan),sha],capture_output=True,text=True,timeout=60)
try:res=json.loads(x.stdout)
except Exception:res={'status':'CONFIRM_UNCONFIRMED','exitCode':x.returncode}
print(json.dumps(res))
''')
(p/'CONFIRM_RESULT.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
