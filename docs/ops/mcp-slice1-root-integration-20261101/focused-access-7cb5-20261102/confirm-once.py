"""Run only after Root independently reads the actual Consumer Preview/human reply."""
import sys,json,hashlib
from pathlib import Path
sys.path.insert(0,'/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-root-read-focused-20261102');approvalpath=Path(sys.argv[1]);raw=approvalpath.read_bytes();a=json.loads(raw)
assert a['ownerConfirmed'] is True and a['sourceThreadId']=='01a1803b-c5a7-7ab0-a90f-fb4f87609201' and a['sourceMessageId']
assert a['operationId']=='1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf' and a['previewDigest']=='1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546'
assert a['approvedExecutionGateSHA256']=='f93df0f8f6c37b74ca66930db9053b7ed8b0e7d5c3badbbaa10861a23b5f1d79'
assert a['gateSHA256']=='530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801'
base=json.loads((p/'EMPTY_ROUND_INTENT.json').read_text())['request'];active=json.loads((p/'EMPTY_ROUND_RESULT.json').read_text())['result'];assert active['status']=='MCP_SLICE1_CONFIG_CAS_HEALTHY'
assert base['windowId']=='7cb5cd285a774df8bc71375c6890bce4' and base['windowId']==json.loads((p/'HOST_STAGE_PAYLOAD.json').read_text())['windowId']
assert base['approvedExecutionGateSHA256']==a['approvedExecutionGateSHA256'] and base['gateSHA256']==a['gateSHA256']
assert base['defaultContainerId']=='a1d0993ea215c4bb6f1ca554c2f5536d1ce8c1925374a06d867c36d44c21effd' and base['defaultConfigSHA256']=='9a88efaac354f37c8863f48d1ac8c5c9ecf5b3368a3bdbd6e7dade955d19caba'
assert active['defaultContainerId']==base['defaultContainerId'] and active['deadlineMs']==base['deadlineMs']
empty_qa=json.loads(base['authQaConfig']);assert empty_qa['confirmations']==[] and empty_qa['expiresAt']==base['deadlineMs'] and empty_qa['consentNotBefore']==base['windowStartedAtMs']
assert hashlib.sha256((p/'close-once.py').read_bytes()).hexdigest()=='4c43a9d311b0073a4d3c9b802015e37775db2686d8c80a26aaced0c05bafd177'
assert hashlib.sha256((p/'prepare-empty-round.py').read_bytes()).hexdigest()=='babc89abc8421ddd1b476203e021e80c6bda6f3a260c1118b97b53e5123e3a2f'
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
a=json.loads(APPROVAL);s=inspect('otr-dev-backend');d=inspect('a1d0993ea215c4bb6f1ca554c2f5536d1ce8c1925374a06d867c36d44c21effd')
assert s['Id']==ACTIVE['containerId'] and digest(s['Config'])==ACTIVE['configSHA256']
q=json.loads(environment(s)['OTR_DEV_MCP_WRITE_QA_CONFIG']);assert q['confirmations']==[]
q['confirmations']=[{'operationId':a['operationId'],'previewDigest':a['previewDigest']}]
for name,b in [('owner-approval.json',APPROVAL)]:
 fd=os.open(r/name,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
assert hashlib.sha256(private(r/'prepare_cas.py')).hexdigest()=='aac0c9940409a9eff40fe5f3e8d554ec984152f3cb74ad3511fc33249ed03a98'
from prepare_cas import make_plan
request={'gateSHA256':a['gateSHA256'],'windowId':BASE['windowId'],'phase':'CONFIRM','clientProfile':'Claude','windowStartedAtMs':BASE['windowStartedAtMs'],'authQaConfig':json.dumps(q),'ownerApproval':a,'approvalRecordSHA256':hashlib.sha256(APPROVAL).hexdigest(),'expectedCurrentContainerId':s['Id'],'expectedCurrentConfigSHA256':digest(s['Config']),'defaultContainerId':d['Id'],'defaultConfigSHA256':'9a88efaac354f37c8863f48d1ac8c5c9ecf5b3368a3bdbd6e7dade955d19caba'}
t=json.loads(private(r/'empty-cas.json'))
assert t['candidateImage']=='sha256:1c5d8f83d57ca9d704cfc947e908c3fa6d90ff8fbf16327e775201bdced4c39b' and t['defaultContainerId']==d['Id']
assert t['windowId']==BASE['windowId'] and t['windowStartedAtMs']==BASE['windowStartedAtMs'] and t['deadlineMs']==BASE['deadlineMs']
g=make_plan(request,s,d,t,int(time.time()*1000));plan=r/'confirm-cas.json';assert not plan.exists();atomic_private(plan,g);sha=hashlib.sha256(private(plan)).hexdigest()
x=subprocess.run(['python3',str(r/'config_cas.py'),str(plan),sha],capture_output=True,text=True,timeout=60)
try:res=json.loads(x.stdout)
except Exception:res={'status':'CONFIRM_UNCONFIRMED','exitCode':x.returncode}
print(json.dumps(res))
''')
(p/'CONFIRM_RESULT.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
