import sys,json,base64,hashlib
from pathlib import Path
sys.path.insert(0,'/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-mcp-diagnostics-assembly-20261102');a=json.loads((p/'ASSEMBLY.json').read_text())
c=(p/'tree/dist/server-capture.mjs').read_bytes();r=(p/'runtime.mjs').read_bytes();probe=(p/'tree/dist/closed-mcp-loader.mjs').read_bytes();release=(p/'release-default-closed.py').read_text();h=json.loads((p/'OPERATOR_HASHES.json').read_text())
payload={'capture':base64.b64encode(c).decode(),'runtime':base64.b64encode(r).decode(),'probe':base64.b64encode(probe).decode(),'release':release,'captureSHA':a['captureSHA256'],'runtimeSHA':a['runtimeSHA256'],'sdkSHA':a['sdkSHA256'],'fixtureSHA':a['fixtureSHA256'],'operators':{n:(p/'operators'/n).read_text() for n in h['files']},'operatorHashes':h['files']}
out=remote_python('V='+repr(payload)+'\n'+r'''
import sys,json,base64,hashlib,subprocess,datetime
from pathlib import Path
sha=lambda b:hashlib.sha256(b).hexdigest();digest=lambda x:sha(json.dumps(x,sort_keys=True,separators=(',',':')).encode())
s=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0]
assert s['Id']=='9fd2b8283c82ac457d1c2aac1fd8bcaa828a57bdf1006b3670a2baf8ea7301f9' and s['Image']=='sha256:ab77a13ce66f877b67541e8cad7dcd0f9b70ac229c81841bf26f21665b709431' and digest(s['Config'])=='a6ba55fd09a187db3c9871e3d1bb6414d2f33c14b2d11bb5babf9fcacd223dc4' and s['State']['Health']['Status']=='healthy'
e=dict(x.split('=',1) for x in s['Config']['Env']);assert 'OTR_DEV_MCP_WRITE_QA_CONFIG' not in e and 'OTR_DEV_MCP_READ_QA_CONFIG' not in e
root=Path('/opt/otr/dev-backend/build/mcp-slice1-fresh-closed-20261102');root.mkdir(mode=0o700)
for name,key in [('server-capture.mjs','capture'),('mcp-runtime.mjs','runtime'),('closed-loader.mjs','probe')]:
 data=base64.b64decode(V[key]);(root/name).write_bytes(data);(root/name).chmod(0o644)
assert sha((root/'server-capture.mjs').read_bytes())==V['captureSHA'] and sha((root/'mcp-runtime.mjs').read_bytes())==V['runtimeSHA']
for name,body in V['operators'].items():
 assert Path(name).name==name and sha(body.encode())==V['operatorHashes'][name];(root/name).write_text(body);(root/name).chmod(0o600)
(root/'release.py').write_text(V['release']);(root/'release.py').chmod(0o600)
(root/'Dockerfile').write_text('FROM '+s['Image']+'\nCOPY server-capture.mjs /app/server-capture.mjs\nCOPY mcp-runtime.mjs /app/mcp/runtime.mjs\n')
subprocess.run(['docker','build','--network=none','-t','otr-mcp-slice1:fresh-closed-20261102','.'],cwd=root,check=True,capture_output=True,timeout=40)
i=json.loads(subprocess.check_output(['docker','image','inspect','otr-mcp-slice1:fresh-closed-20261102']))[0];base=json.loads(subprocess.check_output(['docker','image','inspect',s['Image']]))[0];assert i['Config']==base['Config']
g=json.loads(Path('/opt/otr/dev-backend/build/mcp-slice1-default-closed-v1/deploy-plan.json').read_text())
old=dict(g['bundles']);old.update({'server-capture.mjs':'63113903998f085c0aaffb6cc56147d895b3c1f4960f56243847d866c3a971bf','mcp/runtime.mjs':'19b5a0cb90179516fbd0bce2d741c46603a1ba83cac8cdd6b855ab2ad5d42208'})
for name,value in old.items():assert sha(subprocess.check_output(['docker','exec',s['Id'],'cat','/app/'+name],timeout=10))==value
for path,value in {**g['beforeConfigHashes'],**g['mountedFileHashes']}.items():assert sha(Path(path).read_bytes())==value
bundles=dict(old);bundles.update({'server-capture.mjs':V['captureSHA'],'mcp/runtime.mjs':V['runtimeSHA']})
text=subprocess.check_output(['docker','run','--rm','--network=none','--read-only','--cap-drop=ALL','--user=65534','--memory=128m','--entrypoint=sha256sum',i['Id'],*['/app/'+n for n in bundles]],text=True,timeout=15)
assert {x.split()[1].removeprefix('/app/'):x.split()[0] for x in text.splitlines()}==bundles
js='import {loadMcpQaRuntime} from "file:///probe/loader.mjs";let calls=0;const no=()=>{calls++;throw Error("UNEXPECTED_IO")};const r=await loadMcpQaRuntime({}, {discoverTrips:no,canReadTrip:no},undefined,{module:no,asset:no});if(r!==undefined||calls!==0)throw Error("CLOSED_FAILED");console.log(JSON.stringify({defaultClosed:true,backendCalls:calls}));'
smoke=json.loads(subprocess.check_output(['docker','run','--rm','--network=none','--read-only','--cap-drop=ALL','--user=65534','--memory=256m','--mount','type=bind,src='+str(root/'closed-loader.mjs')+',dst=/probe/loader.mjs,readonly','--entrypoint=node',i['Id'],'--input-type=module','-e',js],text=True,timeout=15));assert smoke=={'defaultClosed':True,'backendCalls':0}
g.update(mode='deploy',beforeContainerId=s['Id'],beforeImage=s['Image'],beforeConfigSHA256=digest(s['Config']),beforeHostConfigSHA256=digest(s['HostConfig']),beforeEnvironmentSHA256=digest(e),candidateImage=i['Id'],containerName='otr-mcp-fresh-code-candidate-20261102',backupName='otr-mcp-pre-fresh-9fd2-20261102',expectedHostConfig=s['HostConfig'],bundles=bundles)
raw=(json.dumps(g,sort_keys=True,indent=2)+'\n').encode();(root/'deploy-plan.json').write_bytes(raw);(root/'deploy-plan.json').chmod(0o600)
current=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0];assert current['Id']==s['Id'] and digest(current['Config'])==digest(s['Config']) and current['State']['Health']['Status']=='healthy'
out={'status':'FRESH_DEFAULT_CLOSED_IMAGE_PREBUILT_NOT_DEPLOYED','imageId':i['Id'],'baseImage':s['Image'],'actualServiceStill':s['Id'],'actualServiceConfigSHA256':digest(s['Config']),'qaKeysAbsent':True,'bundles':bundles,'compiledDefaultClosedSmoke':smoke,'planSHA256':sha(raw),'releaseScriptSHA256':sha(V['release'].encode()),'operatorHashes':V['operatorHashes'],'fixtureSHA256':V['fixtureSHA'],'sdkSHA256':V['sdkSHA'],'readyAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deployed':False,'authorityActivated':False,'notesApproval':False,'otpSent':False,'oldUnknownReplayed':False};(root/'IMAGE_READY.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
''');(p/'IMAGE_READY.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
