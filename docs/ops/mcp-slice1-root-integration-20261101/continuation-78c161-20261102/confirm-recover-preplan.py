"""Run only after Root independently reads the actual Consumer Preview/human reply."""
import sys,json,hashlib
from pathlib import Path
sys.path.insert(0,'/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-root-continuation-78c161-20261102');approvalpath=Path(sys.argv[1]);raw=approvalpath.read_bytes();a=json.loads(raw)
assert a['ownerConfirmed'] is True and a['sourceThreadId']=='01a1803b-c5a7-7ab0-a90f-fb4f87609201' and a['sourceMessageId']
assert a['operationId']=='1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf' and a['previewDigest']=='1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546'
assert a['approvedExecutionGateSHA256']=='e5cf4d1b796568607e60052ef64bf8f4dd6839c57a78e633a051a312b344303d'
assert a['gateSHA256']=='530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801'
base=json.loads((p/'EMPTY_ROUND_INTENT.json').read_text())['request'];active=json.loads((p/'EMPTY_ROUND_RESULT.json').read_text())['result'];assert active['status']=='MCP_SLICE1_CONFIG_CAS_HEALTHY'
assert base['windowId']=='78c1610ecf5f43409106fb67ecd36489' and base['windowId']==json.loads((p/'HOST_STAGE_PAYLOAD.json').read_text())['windowId']
assert base['approvedExecutionGateSHA256']==a['approvedExecutionGateSHA256'] and base['gateSHA256']==a['gateSHA256']
assert base['defaultContainerId']=='076edb49d761983f0f507d2102dbde5400b450ef38979ce16022e31fbb6fa2c0' and base['defaultConfigSHA256']=='011909bcc46adceb3f1defc9b769655d388413ac28d43502330bdfbc6afd588c'
assert active['defaultContainerId']==base['defaultContainerId'] and active['deadlineMs']==base['deadlineMs']
empty_qa=json.loads(base['authQaConfig']);assert empty_qa['confirmations']==[] and empty_qa['expiresAt']==base['deadlineMs'] and empty_qa['consentNotBefore']==base['windowStartedAtMs']
assert hashlib.sha256((p/'close-once.py').read_bytes()).hexdigest()=='e3a90d17d037eb1c331b3af1e6f7b6cf783d53ac103c1a5122718df1385a7d8e'
assert hashlib.sha256((p/'prepare-empty-round.py').read_bytes()).hexdigest()=='2d015b26245d7498934dacf58ba8ff15015d541d6ae30de182eb3e7e1cfcef0d'
prior=json.loads((p/'CONFIRM_INTENT.json').read_text());assert prior['approvalSHA256']=='68d91cbba72e4aaf2221420f9aacf1e899b80a680209218d36e01e2c46e24aee'
assert not (p/'CONFIRM_RESULT.json').exists()
with (p/'CONFIRM_RECOVERY_INTENT.json').open('x') as f:json.dump({'approvalSHA256':hashlib.sha256(raw).hexdigest(),'sourceMessageId':a['sourceMessageId'],'deadlineMs':base['deadlineMs']},f)
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
a=json.loads(APPROVAL);s=inspect('otr-dev-backend');d=inspect('076edb49d761983f0f507d2102dbde5400b450ef38979ce16022e31fbb6fa2c0')
assert s['Id']==ACTIVE['containerId'] and digest(s['Config'])==ACTIVE['configSHA256']
q=json.loads(environment(s)['OTR_DEV_MCP_WRITE_QA_CONFIG']);assert q['confirmations']==[]
q['confirmations']=[{'operationId':a['operationId'],'previewDigest':a['previewDigest']}]
previous=private(r/'owner-approval.json');assert hashlib.sha256(previous).hexdigest()=='68d91cbba72e4aaf2221420f9aacf1e899b80a680209218d36e01e2c46e24aee'
oldApproval=json.loads(previous);assert 'clientId' not in oldApproval and a['clientId']==q['clientId']
assert {k:v for k,v in a.items() if k!='clientId'}==oldApproval
assert not (r/'confirm-cas.json').exists() and not (r/'owner-approval.preplan-missing-clientId.json').exists()
os.rename(r/'owner-approval.json',r/'owner-approval.preplan-missing-clientId.json')
for name,b in [('owner-approval.json',APPROVAL)]:
 fd=os.open(r/name,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
assert hashlib.sha256(private(r/'prepare_cas.py')).hexdigest()=='aac0c9940409a9eff40fe5f3e8d554ec984152f3cb74ad3511fc33249ed03a98'
from prepare_cas import make_plan
request={'gateSHA256':a['gateSHA256'],'windowId':BASE['windowId'],'phase':'CONFIRM','clientProfile':'Claude','windowStartedAtMs':BASE['windowStartedAtMs'],'authQaConfig':json.dumps(q),'ownerApproval':a,'approvalRecordSHA256':hashlib.sha256(APPROVAL).hexdigest(),'expectedCurrentContainerId':s['Id'],'expectedCurrentConfigSHA256':digest(s['Config']),'defaultContainerId':d['Id'],'defaultConfigSHA256':'011909bcc46adceb3f1defc9b769655d388413ac28d43502330bdfbc6afd588c'}
t=json.loads(private(r/'empty-cas.json'))
assert t['candidateImage']=='sha256:cdd762ea99b53fd21330dfe09df157b727b89e7a7c5e4e4da2c2487796364102' and t['defaultContainerId']==d['Id']
assert t['windowId']==BASE['windowId'] and t['windowStartedAtMs']==BASE['windowStartedAtMs'] and t['deadlineMs']==BASE['deadlineMs']
g=make_plan(request,s,d,t,int(time.time()*1000));plan=r/'confirm-cas.json';assert not plan.exists();atomic_private(plan,g);sha=hashlib.sha256(private(plan)).hexdigest()
x=subprocess.run(['python3',str(r/'config_cas.py'),str(plan),sha],capture_output=True,text=True,timeout=60)
try:res=json.loads(x.stdout)
except Exception:res={'status':'CONFIRM_UNCONFIRMED','exitCode':x.returncode}
print(json.dumps(res))
''')
(p/'CONFIRM_RECOVERY_RESULT.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
