import sys,json,base64,hashlib
from pathlib import Path
sys.path.insert(0,'/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p=Path('/private/tmp/otr-core-pool-root-release-20261102');a=json.loads((p/'INPUTS.json').read_text())
old=Path('/private/tmp/otr-mcp-read-diag-609184bb-7a4a6bwu')
c=Path(a['capturePath']).read_bytes();r=Path(a['runtimePath']).read_bytes();probe=(old/'tree/dist/closed-mcp-loader.mjs').read_bytes();release=(p/'release-default-closed.py').read_text();h=json.loads((old/'OPERATOR_HASHES.json').read_text())
assert hashlib.sha256(c).hexdigest()==a['captureSHA256'] and hashlib.sha256(r).hexdigest()==a['runtimeSHA256']
assert hashlib.sha256(probe).hexdigest()==a['probeSHA256'] and hashlib.sha256(release.encode()).hexdigest()==a['releaseSHA256']
payload={'capture':base64.b64encode(c).decode(),'runtime':base64.b64encode(r).decode(),'probe':base64.b64encode(probe).decode(),'release':release,'captureSHA':a['captureSHA256'],'runtimeSHA':a['runtimeSHA256'],'sdkSHA':a['sdkSHA256'],'fixtureSHA':a['fixtureSHA256'],'operators':{n:(old/'operators'/n).read_text() for n in h['files']},'operatorHashes':h['files']}
out=remote_python('V='+repr(payload)+'\n'+r'''
import sys,json,base64,hashlib,subprocess,datetime
from pathlib import Path
sha=lambda b:hashlib.sha256(b).hexdigest();digest=lambda x:sha(json.dumps(x,sort_keys=True,separators=(',',':')).encode())
s=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0]
assert s['Id']=='ddd7ac46ab3d1575bc9d9864b128ab50f0bc530c6b9f32c66cbdac813c8cd32f' and s['Image']=='sha256:57bce7bb398f0508bf6dad99aaf53cac044be8f07112ca45e57c584757ffcb4d' and digest(s['Config'])=='db86894730f9a7e3f675d7bc805ea00a5057c05c5d5047d0b8c292746e0ef512' and s['State']['Health']['Status']=='healthy'
assert digest(s['HostConfig'])=='d50118467f4c6d4548e84b898f06116f03850202b81629f40abdbc032d89bd4c'
e=dict(x.split('=',1) for x in s['Config']['Env']);assert len(e)==len(s['Config']['Env']) and digest(e)=='b12fdecb5b865bf3dab085587af7ea13d5e421ac320aeeeef01ed69f40ee6a75';assert 'OTR_DEV_MCP_WRITE_QA_CONFIG' not in e and 'OTR_DEV_MCP_READ_QA_CONFIG' not in e
root=Path('/opt/otr/dev-backend/build/core-pool-138bd0b5-20261102');root.mkdir(mode=0o700)
for name,key in [('server-capture.mjs','capture'),('mcp-runtime.mjs','runtime'),('closed-loader.mjs','probe')]:
 data=base64.b64decode(V[key]);(root/name).write_bytes(data);(root/name).chmod(0o644)
assert sha((root/'server-capture.mjs').read_bytes())==V['captureSHA'] and sha((root/'mcp-runtime.mjs').read_bytes())==V['runtimeSHA']
for name,body in V['operators'].items():
 assert Path(name).name==name and sha(body.encode())==V['operatorHashes'][name];(root/name).write_text(body);(root/name).chmod(0o600)
(root/'release.py').write_text(V['release']);(root/'release.py').chmod(0o600)
(root/'Dockerfile').write_text('FROM '+s['Image']+'\nCOPY server-capture.mjs /app/server-capture.mjs\nCOPY mcp-runtime.mjs /app/mcp/runtime.mjs\n')
subprocess.run(['docker','build','--network=none','-t','otr-import:core-pool-138bd0b5-20261102','.'],cwd=root,check=True,capture_output=True,timeout=40)
i=json.loads(subprocess.check_output(['docker','image','inspect','otr-import:core-pool-138bd0b5-20261102']))[0];base=json.loads(subprocess.check_output(['docker','image','inspect',s['Image']]))[0];assert i['Config']==base['Config']
rawPlan=Path('/opt/otr/dev-backend/build/p3-mcp-read401-20261102/deploy-plan.json').read_bytes();assert sha(rawPlan)=='be0587b42ea99f8d93f0cdb27a90a01d707837162be500b507822de5a0bad3aa'
g=json.loads(rawPlan)
old=dict(g['bundles']);assert old=={'auth-consent/app.js': '6040fcfdbbeccacfd96a1d393410a139fe48ee4d1a6d3c04981f191ce7e1ea67', 'mcp/runtime.mjs': '416c7a22c564f0bb5891908a137a2b75ddeedbe25ceca70a14750a0262713c94', 'server-capture.mjs': '7046ccf1a31f21156c4ee7410c2c04d9baa583f1fc80124bc3dbeeb09328d72c', 'server.mjs': '782692ba70432174e54207a116f891534e54854c96484167e0470aa4eb5f9542'}
assert len({**g['beforeConfigHashes'],**g['mountedFileHashes']})==23
for name,value in old.items():assert sha(subprocess.check_output(['docker','exec',s['Id'],'cat','/app/'+name],timeout=10))==value
for path,value in {**g['beforeConfigHashes'],**g['mountedFileHashes']}.items():assert sha(Path(path).read_bytes())==value
bundles=dict(old);bundles.update({'server-capture.mjs':V['captureSHA'],'mcp/runtime.mjs':V['runtimeSHA']})
text=subprocess.check_output(['docker','run','--rm','--network=none','--read-only','--cap-drop=ALL','--user=65534','--memory=128m','--entrypoint=sha256sum',i['Id'],*['/app/'+n for n in bundles]],text=True,timeout=15)
assert {x.split()[1].removeprefix('/app/'):x.split()[0] for x in text.splitlines()}==bundles
js='import {loadMcpQaRuntime} from "file:///probe/loader.mjs";let calls=0;const no=()=>{calls++;throw Error("UNEXPECTED_IO")};const r=await loadMcpQaRuntime({}, {discoverTrips:no,canReadTrip:no},undefined,{module:no,asset:no});if(r!==undefined||calls!==0)throw Error("CLOSED_FAILED");console.log(JSON.stringify({defaultClosed:true,backendCalls:calls}));'
smoke=json.loads(subprocess.check_output(['docker','run','--rm','--network=none','--read-only','--cap-drop=ALL','--user=65534','--memory=256m','--mount','type=bind,src='+str(root/'closed-loader.mjs')+',dst=/probe/loader.mjs,readonly','--entrypoint=node',i['Id'],'--input-type=module','-e',js],text=True,timeout=15));assert smoke=={'defaultClosed':True,'backendCalls':0}
g.update(mode='deploy',beforeContainerId=s['Id'],beforeImage=s['Image'],beforeConfigSHA256=digest(s['Config']),beforeHostConfigSHA256=digest(s['HostConfig']),beforeEnvironmentSHA256=digest(e),candidateImage=i['Id'],containerName='otr-core-pool-138bd0b5-candidate-20261102',backupName='otr-pre-core-pool-ddd7-20261102',expectedHostConfig=s['HostConfig'],bundles=bundles)
raw=(json.dumps(g,sort_keys=True,indent=2)+'\n').encode();(root/'deploy-plan.json').write_bytes(raw);(root/'deploy-plan.json').chmod(0o600)
current=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0];assert current['Id']==s['Id'] and digest(current['Config'])==digest(s['Config']) and current['State']['Health']['Status']=='healthy'
out={'status':'FRESH_DEFAULT_CLOSED_IMAGE_PREBUILT_NOT_DEPLOYED','imageId':i['Id'],'baseImage':s['Image'],'actualServiceStill':s['Id'],'actualServiceConfigSHA256':digest(s['Config']),'qaKeysAbsent':True,'bundles':bundles,'compiledDefaultClosedSmoke':smoke,'planSHA256':sha(raw),'releaseScriptSHA256':sha(V['release'].encode()),'operatorHashes':V['operatorHashes'],'fixtureSHA256':V['fixtureSHA'],'sdkSHA256':V['sdkSHA'],'readyAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deployed':False,'authorityActivated':False,'notesApproval':False,'otpSent':False,'oldUnknownReplayed':False};(root/'IMAGE_READY.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
''');(p/'IMAGE_READY.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
