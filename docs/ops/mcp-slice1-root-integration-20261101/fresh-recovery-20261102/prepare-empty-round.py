"""Await Auth's exact request; prepare pointer/timer, then one v4 EMPTY CAS only."""
import sys,json,hashlib
from pathlib import Path
ROOT=Path('/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical');sys.path.insert(0,str(ROOT/'scripts/import'))
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-slice1-root-fresh-20261102')
request_path=Path(sys.argv[1]);request=json.loads(request_path.read_text())
assert request['phase']=='EMPTY' and request['clientProfile']=='Claude' and request['windowId']==json.loads((p/'HOST_STAGE_PAYLOAD.json').read_text())['windowId']
assert request['gateSHA256']=='530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801'
assert request['jointCloseReady'] is True and request['issuerCloseIndependentOfRuntimeId'] is True
qa=json.loads(request['authQaConfig']);assert qa['confirmations']==[] and qa['version']==4
assert qa['expiresAt']==request['deadlineMs'] and qa['consentNotBefore']==request['windowStartedAtMs']
with (p/'EMPTY_ROUND_INTENT.json').open('x') as f:json.dump({'requestSHA256':hashlib.sha256(request_path.read_bytes()).hexdigest(),'request':request,'notesApproval':False},f)
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
t=json.loads(Path('/opt/otr/dev-backend/build/mcp-slice1-fresh-closed-20261102/deploy-plan.json').read_text());g=make_plan(REQUEST,s,default,t,int(time.time()*1000));assert g['candidateImage']=='sha256:fbd9074e232861dd272ad16b950045db8be0df82f979b2fafa8da8e91dba1f66'
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
