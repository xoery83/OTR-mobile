from pathlib import Path
import json,hashlib,base64,subprocess,shlex,uuid
P=Path('/private/tmp/otr-auth-expiry-sdk-compatible-20261101');P.mkdir(mode=0o700,exist_ok=False)
B='sha256:1068257190400c62745d315ac9d260d2deb0fb5e949801dace581d4c3ecc998a';runtime=Path('dist/mcp/runtime.mjs').read_bytes();build=json.loads(Path('dist/mcp/runtime-build.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(runtime)==build['runtimeSHA256']=='b8075ca9cfb345f7fc0d976778f8f365347c44cf444cacc7faa5c26d76806820' and build['mcpSourceCommit']=='5382e3c8c3a9635844d60d26283512ffa7943d3a'
root='/opt/otr/dev-backend/build/auth-expiry-sdk-'+uuid.uuid4().hex
intent={'status':'BUILD_ONLY_NO_SERVICE_CONFIG_OR_AUTHORITY','root':root,'baseImage':B,'runtimeSHA256':sha(runtime),'sourceBuild':build};(P/'STAGE_INTENT.json').write_text(json.dumps(intent,indent=2)+'\n')
remote=r'''
import json,base64,hashlib,re,os,subprocess,sys
from pathlib import Path
p=json.load(sys.stdin);root=Path(p['root']);assert root.parent==Path('/opt/otr/dev-backend/build') and root.parent.resolve()==root.parent and re.fullmatch('auth-expiry-sdk-[0-9a-f]{32}',root.name) and not root.exists()
assert os.getuid()==0 and p['base']=='sha256:1068257190400c62745d315ac9d260d2deb0fb5e949801dace581d4c3ecc998a'
b=base64.b64decode(p['runtime'],validate=True);assert len(b)<8388608 and hashlib.sha256(b).hexdigest()==p['sha']=='b8075ca9cfb345f7fc0d976778f8f365347c44cf444cacc7faa5c26d76806820'
paths=['server-capture.mjs','mcp/runtime.mjs','server.mjs','auth-consent/app.js']
js="const fs=require('fs'),c=require('crypto');console.log(JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(x=>[x,c.createHash('sha256').update(fs.readFileSync('/app/'+x)).digest('hex')]))));"
def hashes(image):return json.loads(subprocess.check_output(['docker','run','--rm','--pull=never','--network=none','--memory=128m','--cpus=1','--entrypoint','node',image,'-e',js],timeout=20))
expected={'server-capture.mjs':'40dadbb12655fe8fd48710a58397349c0d5afdd749dd2efd95905ebbcd040587','mcp/runtime.mjs':'ad47fe3452ad9daa8e77b93e1f92acf35efc36936d2da2f769a82983dca0d812','server.mjs':'782692ba70432174e54207a116f891534e54854c96484167e0470aa4eb5f9542','auth-consent/app.js':'6040fcfdbbeccacfd96a1d393410a139fe48ee4d1a6d3c04981f191ce7e1ea67'}
assert hashes(p['base'])==expected
old=json.loads(subprocess.check_output(['docker','image','inspect',p['base']],timeout=10))[0]
root.mkdir(mode=0o700);fd=os.open(root/'runtime.mjs',os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o644)
with os.fdopen(fd,'wb') as f:f.write(b)
assert (root/'runtime.mjs').stat().st_mode&0o777==0o644
(root/'Dockerfile').write_text('FROM '+p['base']+'\nCOPY runtime.mjs /app/mcp/runtime.mjs\n')
tag='otr-dev-auth-expiry:'+root.name.removeprefix('auth-expiry-sdk-');r=subprocess.run(['docker','build','--network=none','--pull=false','--tag',tag,str(root)],capture_output=True,timeout=60);assert r.returncode==0,'BUILD_FAILED_RAW_SUPPRESSED'
new=json.loads(subprocess.check_output(['docker','image','inspect',tag],timeout=10))[0];assert new['Config']==old['Config'];after=hashes(new['Id']);assert after=={**expected,'mcp/runtime.mjs':p['sha']}
digest=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
v={'status':'DEFAULT_CLOSED_SDK_EXPIRY_IMAGE_PREPARED_NOT_DEPLOYED','root':str(root),'baseImage':p['base'],'image':new['Id'],'beforeBundles':expected,'bundles':after,'onlyChangedBundle':'mcp/runtime.mjs','imageConfigUnchanged':True,'imageConfigSHA256':digest(new['Config']),'fileMode':'0644','serviceConfigSqlAuthorityChanges':0,'providerCalls':0}
(root/'IMAGE_RECEIPT.json').write_text(json.dumps(v,indent=2)+'\n');(root/'IMAGE_RECEIPT.json').chmod(0o600);print(json.dumps(v))
'''
v={'root':root,'base':B,'runtime':base64.b64encode(runtime).decode(),'sha':sha(runtime)}
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=5','root@178.105.151.143','python3 -c '+shlex.quote(remote)],input=json.dumps(v),text=True,capture_output=True,timeout=110)
if r.returncode:(P/'UNKNOWN.json').write_text(json.dumps({'status':'BUILD_UNKNOWN_RECONCILE_EXACT_ROOT_NO_REPLAY','root':root})+'\n');raise RuntimeError('BUILD_UNKNOWN_RAW_SUPPRESSED')
result=json.loads(r.stdout);(P/'IMAGE_RECEIPT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
