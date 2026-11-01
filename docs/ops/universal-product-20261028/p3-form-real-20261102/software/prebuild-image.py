import base64, hashlib, json, sys
from pathlib import Path

sys.path.insert(0, '/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python

p = Path('/private/tmp/otr-p3-qa-fence-source-20261102')
raw = (p / 'tree/dist/server-capture.mjs').read_bytes()
assert hashlib.sha256(raw).hexdigest() == '7046ccf1a31f21156c4ee7410c2c04d9baa583f1fc80124bc3dbeeb09328d72c'
out = remote_python('CAPTURE=' + repr(base64.b64encode(raw).decode()) + '\n' + r'''
import base64, hashlib, json, subprocess, datetime
from pathlib import Path
sha=lambda b:hashlib.sha256(b).hexdigest()
digest=lambda v:sha(json.dumps(v,sort_keys=True,separators=(',',':')).encode())
s=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0]
assert s['Id']=='a1d0993ea215c4bb6f1ca554c2f5536d1ce8c1925374a06d867c36d44c21effd'
assert digest(s['Config'])=='9a88efaac354f37c8863f48d1ac8c5c9ecf5b3368a3bdbd6e7dade955d19caba'
assert s['Image']=='sha256:1c5d8f83d57ca9d704cfc947e908c3fa6d90ff8fbf16327e775201bdced4c39b' and s['State']['Health']['Status']=='healthy'
env=dict(v.split('=',1) for v in s['Config']['Env'])
assert 'OTR_DEV_MCP_WRITE_QA_CONFIG' not in env and 'OTR_DEV_MCP_READ_QA_CONFIG' not in env
root=Path('/opt/otr/dev-backend/build/p3-qa-fence-66d46067-20261102');root.mkdir(mode=0o700)
data=base64.b64decode(CAPTURE);assert sha(data)=='7046ccf1a31f21156c4ee7410c2c04d9baa583f1fc80124bc3dbeeb09328d72c'
(root/'server-capture.mjs').write_bytes(data)
(root/'Dockerfile').write_text('FROM '+s['Image']+'\nCOPY server-capture.mjs /app/server-capture.mjs\n')
tag='otr-import:p3-qa-fence-66d46067-20261102'
subprocess.run(['docker','build','--network=none','-t',tag,'.'],cwd=root,capture_output=True,check=True,timeout=40)
i=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]
base=json.loads(subprocess.check_output(['docker','image','inspect',s['Image']]))[0]
assert i['Config']==base['Config']
names=['server-capture.mjs','server.mjs','mcp/runtime.mjs','auth-consent/app.js']
bundles={}
for name in names:
 target='/app/'+name
 old=sha(subprocess.check_output(['docker','exec',s['Id'],'cat',target],timeout=10))
 text=subprocess.check_output(['docker','run','--rm','--network=none','--read-only','--cap-drop=ALL','--user=65534','--memory=128m','--entrypoint=sha256sum',i['Id'],target],text=True,timeout=15)
 new=text.split()[0]
 assert new==('7046ccf1a31f21156c4ee7410c2c04d9baa583f1fc80124bc3dbeeb09328d72c' if name=='server-capture.mjs' else old)
 bundles[name]=new
subprocess.run(['docker','run','--rm','--network=none','--read-only','--cap-drop=ALL','--user=65534','--memory=128m','--entrypoint=node',i['Id'],'--check','/app/server-capture.mjs'],capture_output=True,check=True,timeout=15)
current=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0]
assert current['Id']==s['Id'] and digest(current['Config'])==digest(s['Config']) and current['State']['Health']['Status']=='healthy'
result={'status':'P3_FENCE_IMAGE_PREBUILT_NOT_DEPLOYED','imageId':i['Id'],'baseImage':s['Image'],'actualServiceStill':s['Id'],'actualConfigSHA256':digest(s['Config']),'imageConfigUnchanged':True,'bundles':bundles,'syntaxCheck':True,'qaKeysAbsent':True,'deployed':False,'authorityActivated':False,'modelCalls':0,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(root/'IMAGE_READY.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
''')
(p / 'IMAGE_READY.json').write_text(json.dumps(out, indent=2))
print(json.dumps(out))
