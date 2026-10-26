import copy,hashlib,http.client,json,pathlib,socket,subprocess,os
ROOT=pathlib.Path('/opt/otr/dev-backend/private/universal-p3-activation-5882798a')
OLD='f838b2917ad42eff1a1c2e734049d058d4e1cb176de59440777749040e333157'
IMAGE='sha256:c2d4cda080d7aee64b88b3f5f712188e355cd67f77182a626974237959e83b69'
canon=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')).encode()
sha=lambda v:hashlib.sha256(canon(v)).hexdigest()
def call(*a):return subprocess.check_output(a,stderr=subprocess.PIPE,timeout=35)
s=json.loads(call('docker','inspect',OLD))[0]
assert not any(v.startswith('OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW=') for v in s['Config']['Env']), 'P1_ACTIVATION_MUST_REMAIN_UNSET'
assert s['Name']=='/otr-dev-backend' and s['State']['Health']['Status']=='healthy'
assert s['Image']=='sha256:c2d4cda080d7aee64b88b3f5f712188e355cd67f77182a626974237959e83b69'
assert sha(s['Config'])=='b040d983687f74a453bfb9c8c4d5b641e1bc0c6d184299b9c6e1ce8d9836996d'
assert sha(s['HostConfig'])=='e89fe490cfd0a143b4751e761cebbbe8deaaacabc3ac53b27fa5c95cd525d2d7'
assert sha(sorted(s['Mounts'],key=lambda m:(m['Destination'],m['Source'])))=='a1ebc180de952af45e7870f4b22b497315c24eb64c3a06d20de778af94b99361'
assert json.loads(call('docker','image','inspect',IMAGE))[0]['Id']==IMAGE
ROOT.mkdir(mode=0o700,exist_ok=False)
config=copy.deepcopy(s['Config']);config['Image']=IMAGE
config['Env'].append('OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW=enabled')
payload={**config,'HostConfig':s['HostConfig']}
class Docker(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(25);self.sock.connect('/var/run/docker.sock')
c=Docker('localhost',timeout=25);c.request('POST','/v1.47/containers/create?name=otr-universal-p3-activation-candidate-5882798a',body=json.dumps(payload),headers={'Content-Type':'application/json'})
r=c.getresponse();raw=r.read();assert r.status==201, 'CREATE_REJECTED'
id=json.loads(raw)['Id'];created=json.loads(call('docker','inspect',id))[0]
assert sha(created['Config'])==sha(config), 'CONFIG_DRIFT'
assert not created['State']['Running']
diffs=[k for k in set(s['HostConfig'])|set(created['HostConfig']) if s['HostConfig'].get(k)!=created['HostConfig'].get(k)]
plan={'originalContainerId':OLD,'candidateContainerId':id,'imageId':IMAGE,'baselineImageId':s['Image'],'baselineConfigSHA256':sha(s['Config']),'candidateConfigSHA256':sha(config),'baselineHostConfigSHA256':sha(s['HostConfig']),'createdHostConfigSHA256':sha(created['HostConfig']),'mountsSHA256':sha(sorted(s['Mounts'],key=lambda m:(m['Destination'],m['Source']))),'hostConfigChangedKeys':diffs,'baselineSiblingContainers':[{'id':v['Id'],'image':v['Image'],'status':v['State']['Status']} for v in json.loads(call('docker','inspect',*call('docker','ps','-aq').decode().split())) if v['Id'] not in [OLD,id]]}
fd=os.open(ROOT/'plan.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(plan,f);f.flush();os.fsync(f.fileno())
print(json.dumps(plan))
