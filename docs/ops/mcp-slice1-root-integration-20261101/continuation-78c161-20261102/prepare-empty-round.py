"""Await Auth's exact request; prepare pointer/timer, then one v4 EMPTY CAS only."""
import sys,json,hashlib
from pathlib import Path
ROOT=Path('/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical');sys.path.insert(0,str(ROOT/'scripts/import'))
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-root-continuation-78c161-20261102')
request_path=Path(sys.argv[1]);request_raw=request_path.read_bytes();request=json.loads(request_raw)
assert request['phase']=='EMPTY' and request['clientProfile']=='Claude' and request['windowId']==json.loads((p/'HOST_STAGE_PAYLOAD.json').read_text())['windowId']
assert request['gateSHA256']=='e5cf4d1b796568607e60052ef64bf8f4dd6839c57a78e633a051a312b344303d'
request = dict(request, approvedExecutionGateSHA256=request['gateSHA256'],
               gateSHA256='530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801')
assert request['jointCloseReady'] is True and request['issuerCloseIndependentOfRuntimeId'] is True
assert request['windowId']=='78c1610ecf5f43409106fb67ecd36489'
assert request['defaultContainerId']=='076edb49d761983f0f507d2102dbde5400b450ef38979ce16022e31fbb6fa2c0'
assert request['defaultConfigSHA256']=='011909bcc46adceb3f1defc9b769655d388413ac28d43502330bdfbc6afd588c'
restored=json.loads((p/'ACTUAL_NO_CHANGE_RESTORE.json').read_text())
assert restored['status']=='ROOT_CLOSED_RESTORE_ACTUAL_NO_CHANGE_PASS' and restored['windowId']==request['windowId']
assert restored['closePlanSHA256']=='8f43b6195e2f3616d9838a3f17682521d863d072761f9abd9fd30212a12038e1'
assert restored['clockStarted'] is False and restored['timerArmed'] is False and restored['qaKeysAdded'] is False
assert restored['result']['result']['containerId']==request['defaultContainerId'] and restored['result']['result']['image']=='sha256:cdd762ea99b53fd21330dfe09df157b727b89e7a7c5e4e4da2c2487796364102'
assert hashlib.sha256((p/'close-once.py').read_bytes()).hexdigest()=='e3a90d17d037eb1c331b3af1e6f7b6cf783d53ac103c1a5122718df1385a7d8e'
qa=json.loads(request['authQaConfig']);assert qa['confirmations']==[] and qa['version']==4
assert qa['expiresAt']==request['deadlineMs'] and qa['consentNotBefore']==request['windowStartedAtMs']
with (p/'EMPTY_ROUND_INTENT.json').open('x') as f:json.dump({'requestSHA256':hashlib.sha256(request_raw).hexdigest(),'request':request,'notesApproval':False},f)
out=remote_python('REQUEST='+repr(request)+'\n'+r'''
import subprocess,json,hashlib,datetime,sys,time,os
from pathlib import Path
root=Path('/opt/otr/dev-backend/build/auth-consumer-write-qa-'+REQUEST['windowId']);sys.path.insert(0,str(root))
from prepare_cas import make_plan
from config_cas import publish_close_plan,private,digest
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(private(root/'config_cas.py'))=='0ba00b4575b0c828ea5b6bb05d879c8f32e2a71d9602ac27ceba4980f9e9ebee'
assert sha(private(root/'close_current.py'))=='c9e086da959432b434d949e6a136d0daf1b9643add73f2e0365b629c15500cb0'
assert sha(private(root/'prepare_cas.py'))=='aac0c9940409a9eff40fe5f3e8d554ec984152f3cb74ad3511fc33249ed03a98'
s=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0];default=json.loads(subprocess.check_output(['docker','inspect',REQUEST['defaultContainerId']]))[0]
t=json.loads(Path('/opt/otr/dev-backend/build/core-pool-138bd0b5-20261102/deploy-plan.json').read_text());g=make_plan(REQUEST,s,default,t,int(time.time()*1000));assert g['candidateImage']=='sha256:cdd762ea99b53fd21330dfe09df157b727b89e7a7c5e4e4da2c2487796364102'
assert int(time.time()*1000)<g['deadlineMs']-120000
for path,h in {**g['beforeConfigHashes'],**g['mountedFileHashes']}.items():assert sha(Path(path).read_bytes())==h
for name,h in g['bundles'].items():assert sha(subprocess.check_output(['docker','exec',s['Id'],'cat','/app/'+name],timeout=10))==h
raw=(json.dumps(g,sort_keys=True,indent=2)+'\n').encode();plan=root/'empty-cas.json'
fd=os.open(plan,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
publish_close_plan(g,root,default['Id'],digest(default['Config']))
unit='otr-mcp-slice1-runtime-close-'+REQUEST['windowId'];calendar=datetime.datetime.fromtimestamp(g['deadlineMs']/1000,datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
x=subprocess.run(['systemd-run','--unit='+unit,'--on-calendar='+calendar,'--timer-property=AccuracySec=1s','--property=Type=oneshot','--property=TimeoutStartSec=120','/usr/bin/python3',str(root/'close_current.py'),str(root)],capture_output=True,text=True,timeout=10);assert x.returncode==0
assert subprocess.check_output(['systemctl','show',unit+'.timer','--property=ActiveState','--value'],text=True).strip()=='active'
assert subprocess.check_output(['systemctl','show',unit+'.timer','--property=LastTriggerUSecMonotonic','--value'],text=True).strip()=='0'
result=subprocess.run(['python3',str(root/'config_cas.py'),str(plan),sha(raw)],capture_output=True,text=True,timeout=60)
try:r=json.loads(result.stdout)
except Exception:r={'status':'EMPTY_CAS_UNCONFIRMED','exitCode':result.returncode}
print(json.dumps({'result':r,'runtimeCloseTimer':unit,'runtimeCloseAt':calendar,'fixedT':g['windowStartedAtMs'],'fixedD':g['deadlineMs'],'confirmationsEmpty':True,'notesApproval':False}))
''');(p/'EMPTY_ROUND_RESULT.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
