import sys,json
from pathlib import Path
sys.path.insert(0,'/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-root-read401-retest-20261102');v=json.loads((p/'HOST_STAGE_PAYLOAD.json').read_text());assert v['windowId']=='acd60fd27aee40e8b6cf1aca727ed169'
r=remote_python('V='+repr(v)+'\n'+r"""
import subprocess,json,hashlib,os,datetime
from pathlib import Path
sha=lambda b:hashlib.sha256(b).hexdigest();digest=lambda x:sha(json.dumps(x,sort_keys=True,separators=(',',':')).encode())
root=Path('/opt/otr/dev-backend/build/auth-consumer-write-qa-'+V['windowId']);root.mkdir(mode=0o700)
s=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0];assert s['Id']=='ddd7ac46ab3d1575bc9d9864b128ab50f0bc530c6b9f32c66cbdac813c8cd32f' and s['Image']=='sha256:57bce7bb398f0508bf6dad99aaf53cac044be8f07112ca45e57c584757ffcb4d' and digest(s['Config'])=='db86894730f9a7e3f675d7bc805ea00a5057c05c5d5047d0b8c292746e0ef512' and s['State']['Health']['Status']=='healthy'
e=dict(x.split('=',1) for x in s['Config']['Env']);assert 'OTR_DEV_MCP_WRITE_QA_CONFIG' not in e and 'OTR_DEV_MCP_READ_QA_CONFIG' not in e
for n,body in V['files'].items():
 assert Path(n).name==n and sha(body.encode())==V['hashes'][n]
 with (root/n).open('x') as f:f.write(body)
 (root/n).chmod(0o600)
t=json.loads(Path('/opt/otr/dev-backend/build/p3-mcp-read401-20261102/deploy-plan.json').read_text());g={'beforeContainerId':s['Id'],'beforeImage':s['Image'],'candidateImage':s['Image'],'beforeConfigSHA256':digest(s['Config']),'expectedConfigSHA256':digest(s['Config']),'expectedHostConfig':s['HostConfig'],'expectedMounts':sorted((m['Source'],m['Destination'],m['RW']) for m in s['Mounts']),'beforeConfigHashes':t['beforeConfigHashes'],'mountedFileHashes':t['mountedFileHashes'],'restoreHelperSHA256':V['hashes']['universal_runtime_close.py'],'backupName':'otr-dev-backend-before-auth-write-'+V['windowId'],'qaConfigPresent':False,'windowStartedAtMs':None,'deadlineMs':None}
raw=(json.dumps(g,sort_keys=True,indent=2)+'\n').encode();plan=root/'deploy-plan.json';plan.write_bytes(raw);plan.chmod(0o600);h=sha(raw)
pointer={'gateSHA256':'530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801','windowId':V['windowId'],'currentContainerId':s['Id'],'planSHA256':h,'deadlineMs':None};(root/'close-current.json').write_text(json.dumps(pointer));(root/'close-current.json').chmod(0o600)
x=subprocess.run(['python3',str(root/'restore.py'),str(plan),h,s['Id']],capture_output=True,text=True,timeout=60)
o=json.loads(x.stdout);assert x.returncode==0 and o['result']['containerId']==s['Id'] and o['result']['finiteConfigAbsent'] is True
print(json.dumps({'status':'ROOT_CLOSED_RESTORE_ACTUAL_NO_CHANGE_PASS','windowId':V['windowId'],'rootPath':str(root),'helpersSHA256':V['hashes'],'closePlanSHA256':h,'result':o,'clockStarted':False,'timerArmed':False,'qaKeysAdded':False,'hostCredentialCopied':False,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
""");(p/'ACTUAL_NO_CHANGE_RESTORE.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
