import copy,hashlib,http.client,json,pathlib,socket,subprocess,os
ROOT=pathlib.Path('/opt/otr/dev-backend/private/universal-p2-review-088b49e5')
OLD='c5072bea46ccae9d9ad4eccae19908d02d0c84366dbb98c3d8bb7e709f43481e'
IMAGE='sha256:77c7055e5dea1e89ac2e595e6890058ec7b14689105d692143a56e65d566dbef'
canon=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')).encode()
sha=lambda v:hashlib.sha256(canon(v)).hexdigest()
def call(*a):return subprocess.check_output(a,stderr=subprocess.PIPE,timeout=35)
approval=json.loads(pathlib.Path('/opt/otr/dev-backend/private/universal-p2-review-assets-088b49e5/owner-approval.json').read_text());assert approval.get('ownerApproved') is True and approval.get('gateName')=='P2_SOURCE_REVIEW_SAVE_GATE/1','P2_EXACT_APPROVAL_REQUIRED'
s=json.loads(call('docker','inspect',OLD))[0]
assert not any(v.startswith('OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW=') for v in s['Config']['Env']), 'P1_ACTIVATION_MUST_REMAIN_UNSET'
assert s['Name']=='/otr-dev-backend' and s['State']['Health']['Status']=='healthy'
assert s['Image']=='sha256:77c7055e5dea1e89ac2e595e6890058ec7b14689105d692143a56e65d566dbef'
assert sha(s['Config'])=='4dec518e49bb4b6cf45ea92de5fad9fe47b25619e71d3bdf885e9994d1210edb'
assert sha(s['HostConfig'])=='e89fe490cfd0a143b4751e761cebbbe8deaaacabc3ac53b27fa5c95cd525d2d7'
assert sha(sorted(s['Mounts'],key=lambda m:(m['Destination'],m['Source'])))=='a1ebc180de952af45e7870f4b22b497315c24eb64c3a06d20de778af94b99361'
assert json.loads(call('docker','image','inspect',IMAGE))[0]['Id']==IMAGE
ROOT.mkdir(mode=0o700,exist_ok=False)
for name in ['manifest.json','operator.py','owner-approval.json']:
 (ROOT/name).write_bytes((pathlib.Path('/opt/otr/dev-backend/private/universal-p2-review-assets-088b49e5')/name).read_bytes());os.chmod(ROOT/name,0o600)
config=copy.deepcopy(s['Config']);config['Image']=IMAGE
config['Env'].append('OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW=enabled')
payload={**config,'HostConfig':s['HostConfig']}
class Docker(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(25);self.sock.connect('/var/run/docker.sock')
c=Docker('localhost',timeout=25);c.request('POST','/v1.47/containers/create?name=otr-universal-p2-ready-candidate-48269f29',body=json.dumps(payload),headers={'Content-Type':'application/json'})
r=c.getresponse();raw=r.read();assert r.status==201, 'CREATE_REJECTED'
id=json.loads(raw)['Id'];created=json.loads(call('docker','inspect',id))[0]
assert sha(created['Config'])==sha(config), 'CONFIG_DRIFT'
assert not created['State']['Running']
diffs=[k for k in set(s['HostConfig'])|set(created['HostConfig']) if s['HostConfig'].get(k)!=created['HostConfig'].get(k)]
plan={'originalContainerId':OLD,'candidateContainerId':id,'imageId':IMAGE,'baselineImageId':s['Image'],'baselineConfigSHA256':sha(s['Config']),'candidateConfigSHA256':sha(config),'baselineHostConfigSHA256':sha(s['HostConfig']),'createdHostConfigSHA256':sha(created['HostConfig']),'mountsSHA256':sha(sorted(s['Mounts'],key=lambda m:(m['Destination'],m['Source']))),'hostConfigChangedKeys':diffs,'baselineSiblingContainers':[{'id':v['Id'],'image':v['Image'],'status':v['State']['Status']} for v in json.loads(call('docker','inspect',*call('docker','ps','-aq').decode().split())) if v['Id'] not in [OLD,id]]}
fd=os.open(ROOT/'plan.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(plan,f);f.flush();os.fsync(f.fileno())
print(json.dumps(plan))
