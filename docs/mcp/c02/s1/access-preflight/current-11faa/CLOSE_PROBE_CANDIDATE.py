from pathlib import Path
import sys,json,hashlib,base64
sys.path.insert(0,'/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-c02-latest-close-20261103');pkg=Path('/private/tmp/otr-mcp-c02-s1-package-20261103')
pins={'c02-close.py':'cee418c733de0bdfcc7e48552992b6a0689d4cadb498af1e5d391c3db6e8a014','deploy.py':'8389f0f2a2fdd2a01c2bbedeac63b2f8d2e4ed71a1be7420838f8d15c99ac4e8','restore.py':'e7c06f49fb8457dd087086ff074b03064801e5d42ec379006ae827d62f5bee2b','universal_runtime_close.py':'931be989f9c5d8a7f3c9fc20c016970344326a0e8482b91feb105190ffff2e5f'}
files={}
for name,h in pins.items():
 raw=(pkg/name if name=='c02-close.py' else pkg/'operators'/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==h
 files[name]=base64.b64encode(raw).decode()
x=remote_python('FILES='+repr(files)+'\nPINS='+repr(pins)+'\n'+r'''
from pathlib import Path
import subprocess,json,hashlib,base64,uuid,datetime
sha=lambda b:hashlib.sha256(b).hexdigest();digest=lambda x:sha(json.dumps(x,sort_keys=True,separators=(',',':')).encode())
releaseRoot=Path('/opt/otr/dev-backend/build/import-pdf-runtime-defaultclosed-ae6abe44-20261103')
raw=(releaseRoot/'EXECUTION_OUTPUT.json').read_bytes();r=json.loads(raw);assert r['result']['status']=='AUTH_CORE_SOFTWARE_DEPLOYED_DEFAULT_CLOSED'
s=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0]
assert s['Id']=='11faa644158812cc50e2c7dddbe0ff462502e0c165f78665d4b7f59abb7023ee' and s['Image']=='sha256:4c48e296c37c1ebab309980b31baff2d3e307b43cb05d9759b95e49989b7b4e0' and digest(s['Config'])=='5b01d130f2a2adb18f9a5c1fdb340450d37828e18d8db257c91df2ed2a4875d3' and s['State']['Health']['Status']=='healthy','NEW_DEFAULT_DRIFT'
assert not any(k.startswith(('OTR_DEV_MCP_C02_QA_CONFIG=','OTR_DEV_MCP_WRITE_QA_CONFIG=','OTR_DEV_MCP_READ_QA_CONFIG=')) for k in s['Config']['Env'])
window=uuid.uuid4().hex;root=Path('/opt/otr/dev-backend/build')/('auth-consumer-write-qa-'+window);root.mkdir(mode=0o700)
for name,b in FILES.items():
 data=base64.b64decode(b);assert sha(data)==PINS[name];(root/name).write_bytes(data);(root/name).chmod(0o600)
g=json.loads((releaseRoot/'deploy-plan.json').read_bytes())
g.update(beforeContainerId=s['Id'],beforeImage=s['Image'],candidateImage=s['Image'],beforeConfigSHA256=digest(s['Config']),expectedConfigSHA256=digest(s['Config']),expectedHostConfig=s['HostConfig'],expectedMounts=sorted((m['Source'],m['Destination'],m['RW']) for m in s['Mounts']),backupName='otr-mcp-c02-s1-probe-unused-'+window,restoreHelperSHA256=PINS['universal_runtime_close.py'])
plan=(json.dumps(g,sort_keys=True,indent=2)+'\n').encode();(root/'deploy-plan.json').write_bytes(plan);(root/'deploy-plan.json').chmod(0o600)
pointer={'windowId':window,'gateSHA256':'c2315ce8580b7658bcf3f52c0df698981750cf5daa98cfe7b05dc307110fa157','planSHA256':sha(plan),'defaultContainerId':s['Id'],'defaultConfigSHA256':digest(s['Config']),'currentContainerId':s['Id']}
(root/'close-current.json').write_text(json.dumps(pointer,sort_keys=True,indent=2)+'\n');(root/'close-current.json').chmod(0o600)
requested=datetime.datetime.now(datetime.timezone.utc).isoformat()
completed=subprocess.run(['python3',str(root/'c02-close.py'),str(root)],capture_output=True,text=True,timeout=45)
# No activation was performed; this exact default must remain unchanged even if a probe fails.
a=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0]
unchanged=a['Id']==s['Id'] and a['Config']==s['Config'] and a['HostConfig']==s['HostConfig'] and a['State']['Health']['Status']=='healthy'
lines=[json.loads(line) for line in completed.stdout.splitlines() if line.startswith('{')]
print(json.dumps({'status':'SOFTWARE_DEFAULT_CLOSE_PROBE_PASS' if completed.returncode==0 and unchanged else 'SOFTWARE_DEFAULT_CLOSE_PROBE_FAILED','requestedAt':requested,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':completed.returncode,'defaultUnchanged':unchanged,'containerId':a['Id'],'image':a['Image'],'configSHA256':digest(a['Config']),'probeDirectory':str(root),'planSHA256':sha(plan),'scriptSHA256':PINS['c02-close.py'],'closeReceipts':lines,'issuerCleanup':'NOT_STARTED_NOT_REQUIRED_SOFTWARE_ONLY','authorityActivated':False,'timerStarted':False,'sqlCalls':0,'paidCalls':0,'stderrPresent':bool(completed.stderr)}))
''')
with (p/'CLOSE_PROBE.json').open('x') as f:json.dump(x,f,indent=2)
print(json.dumps(x))
