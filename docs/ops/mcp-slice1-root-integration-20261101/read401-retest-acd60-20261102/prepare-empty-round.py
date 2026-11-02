"""Await Auth's exact request; prepare pointer/timer, then one v4 EMPTY CAS only."""
import sys,json,hashlib
from pathlib import Path
ROOT=Path('/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical');sys.path.insert(0,str(ROOT/'scripts/import'))
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-root-read401-retest-20261102')
request_path=Path(sys.argv[1]);request_raw=request_path.read_bytes();request=json.loads(request_raw)
assert request['phase']=='EMPTY' and request['clientProfile']=='Claude' and request['windowId']==json.loads((p/'HOST_STAGE_PAYLOAD.json').read_text())['windowId']
assert request['gateSHA256']=='4ab236c94c0cc34e775823b0160602a19c0f898dc7be8eaf0f3a2eec531f192d'
request = dict(request, approvedExecutionGateSHA256=request['gateSHA256'],
               gateSHA256='530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801')
assert request['jointCloseReady'] is True and request['issuerCloseIndependentOfRuntimeId'] is True
assert request['windowId']=='acd60fd27aee40e8b6cf1aca727ed169'
assert request['defaultContainerId']=='ddd7ac46ab3d1575bc9d9864b128ab50f0bc530c6b9f32c66cbdac813c8cd32f'
assert request['defaultConfigSHA256']=='db86894730f9a7e3f675d7bc805ea00a5057c05c5d5047d0b8c292746e0ef512'
restored=json.loads((p/'ACTUAL_NO_CHANGE_RESTORE.json').read_text())
assert restored['status']=='ROOT_CLOSED_RESTORE_ACTUAL_NO_CHANGE_PASS' and restored['windowId']==request['windowId']
assert restored['closePlanSHA256']=='796aef1dfc3a9f0a0708fd9a042d0d8ed4767a41b55d1ccafd4deaba72f4075e'
assert restored['clockStarted'] is False and restored['timerArmed'] is False and restored['qaKeysAdded'] is False
assert restored['result']['result']['containerId']==request['defaultContainerId'] and restored['result']['result']['image']=='sha256:57bce7bb398f0508bf6dad99aaf53cac044be8f07112ca45e57c584757ffcb4d'
assert hashlib.sha256((p/'close-once.py').read_bytes()).hexdigest()=='6ed5f2b7695daae0be1cb621745e78c30c9c20b468ae3ae978f04d20b69c7508'
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
t=json.loads(Path('/opt/otr/dev-backend/build/p3-mcp-read401-20261102/deploy-plan.json').read_text());g=make_plan(REQUEST,s,default,t,int(time.time()*1000));assert g['candidateImage']=='sha256:57bce7bb398f0508bf6dad99aaf53cac044be8f07112ca45e57c584757ffcb4d'
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
