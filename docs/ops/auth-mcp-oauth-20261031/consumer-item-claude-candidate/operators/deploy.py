import fcntl,hashlib,http.client,json,os,re,socket,stat,subprocess,sys,time,uuid
from pathlib import Path
import urllib.request,urllib.error

class HostConfigDrift(Exception):
 def __init__(self,keys):self.keys=keys

def verify_http(g):
 paths=g['protectedRoutes'];assert paths,'PROTECTED_ROUTES_REQUIRED'
 for path,expected in [('/health',200)]+[(entry[0],401) for entry in paths]:
  assert isinstance(path,str) and path.startswith('/') and not path.startswith('//') and '://' not in path,'INVALID_PROBE_PATH'
  try:
   with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8787'+path),timeout=3) as response:status=response.status
  except urllib.error.HTTPError as error:
   status=error.code;error.close()
  assert status==expected,'HTTP_BOUNDARY_FAILED'

def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def call(args):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=35)
def inspect(x):return json.loads(call(['docker','inspect',x]))[0]
def environment(s):return dict(x.split('=',1) for x in s['Config']['Env'])
def mounts(s):return sorted((m['Source'],m['Destination'],m['RW']) for m in s['Mounts'])
def host(s):
 h=dict(s['HostConfig']);h['Mounts']=sorted(h.get('Mounts',[]),key=lambda x:json.dumps(x,sort_keys=True));return h
class Docker(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(20);self.sock.connect('/var/run/docker.sock')

def validate_qa(raw, profile, started_at_ms):
 q=json.loads(raw)
 assert set(q)=={'version','clientId','redirectUris','expiresAt'} and type(q['version']) is int and q['version']==1
 assert isinstance(q['clientId'],str) and str(uuid.UUID(q['clientId']))==q['clientId'] and uuid.UUID(q['clientId']).int!=0
 if profile=='chatgpt':
  assert q['clientId']=='83504d3f-59d4-43fd-99b1-bebc54c40f7d'
  assert q['redirectUris']==['https://chatgpt.com/connector/oauth/CYUxrs56rSrW','http://127.0.0.1:18764/callback']
 elif profile=='claude':
  assert q['clientId']!='83504d3f-59d4-43fd-99b1-bebc54c40f7d'
  assert q['redirectUris']==['https://claude.ai/api/mcp/auth_callback']
 else:raise AssertionError('EXACT_CONSUMER_PROFILE_REQUIRED')
 assert type(started_at_ms) is int and 0<started_at_ms<=time.time()*1000
 assert type(q['expiresAt']) is int and time.time()*1000<q['expiresAt']<=started_at_ms+1800000
 return q

def plan_path(path):
 assert path.name=='deploy-plan.json' and str(path.parent.parent)=='/opt/otr/dev-backend/build'
 assert re.fullmatch(r'auth-consumer-qa-[0-9a-f]{32}',path.parent.name)
 assert path.resolve()==path,'PLAN_SYMLINK_FORBIDDEN'
 return path

def run(g):
 lock=os.open('/run/lock/otr-universal-finite-service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 st=os.fstat(lock);assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 _mark("acquiredAt")
 try:
  assert g['mode']=='deploy'
  assert re.fullmatch('[0-9a-f]{32}',g['windowId'])
  assert g['containerName']=='otr-auth-consumer-'+g['windowId'] and g['backupName']=='otr-dev-backend-before-auth-'+g['windowId']
  old=inspect('otr-dev-backend');assert old['Id']==g['beforeContainerId'] and old['Image']==g['beforeImage'] and old['State']['Health']['Status']=='healthy'
  assert digest(old['Config'])==g['beforeConfigSHA256'],'CONFIG_PREIMAGE'
  assert digest(old['HostConfig'])==g['beforeHostConfigSHA256'],'HOST_CONFIG_PREIMAGE'
  e=environment(old)
  assert len(e)==len(old['Config']['Env']),'DUPLICATE_ENVIRONMENT_KEY'
  assert digest(e)==g['beforeEnvironmentSHA256'],'ENVIRONMENT_PREIMAGE'
  for p,h in {**g['beforeConfigHashes'],**g['mountedFileHashes']}.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,'FILE_DRIFT'
  expected_mounts=sorted(tuple(m) for m in g['expectedMounts'])
  assert mounts(old)==expected_mounts,'BASELINE_MOUNTS_DRIFT'
  target=g['candidateImage'];assert target==old['Image'],'IMAGE_CHANGE_FORBIDDEN'
  assert 'OTR_DEV_MCP_READ_QA_CONFIG' not in e
  validate_qa(g['authQaPublicConfig'],g['clientProfile'],g['windowStartedAtMs'])
  new_env={**e,'OTR_DEV_MCP_READ_QA_CONFIG':g['authQaPublicConfig']}
  assert digest(new_env)==g['expectedEnvironmentSHA256']
  config=dict(old['Config'],Image=target,Env=[*old['Config']['Env'],'OTR_DEV_MCP_READ_QA_CONFIG='+g['authQaPublicConfig']])
  config['Labels']=dict(config['Labels']);config['Labels']['com.docker.compose.project.config_files']=','.join(g['beforeConfigFiles'])
  hc=g['expectedHostConfig'];name=g['containerName'];backup=g['backupName']
  actual_hc=host(old);expected_hc=host(dict(old,HostConfig=hc))
  if actual_hc!=expected_hc:raise HostConfigDrift(sorted(k for k in actual_hc.keys()|expected_hc.keys() if actual_hc.get(k)!=expected_hc.get(k)))
  assert g['protectedRoutes'],'PROTECTED_ROUTES_REQUIRED'
  client=Docker('localhost',timeout=20)
  client.request('POST','/v1.44/containers/create?name='+name,json.dumps({**config,'HostConfig':hc}),{'Content-Type':'application/json'})
  response=client.getresponse();raw=response.read();client.close();assert response.status==201,'CREATE_RECONCILE_NO_RETRY'
  identity=json.loads(raw)['Id'];new=inspect(identity)
  assert new['Config']==config and new['Image']==target and new['State']['Status']=='created'
  expected=dict(old,HostConfig=hc)
  nh=host(new);eh=host(expected)
  if nh.get('OomKillDisable') is False and eh.get('OomKillDisable') is None:nh['OomKillDisable']=None
  assert nh==eh and mounts(new)==expected_mounts,'STAGED_CONFIG_DRIFT'
  # Keep the original container intact for exact-ID recovery, including its Env.
  changed=False
  try:
   changed=True  # A stop timeout may still have stopped the original container.
   call(['docker','stop','--time','10',old['Id']]);assert not inspect(old['Id'])['State']['Running']
   call(['docker','rename',old['Id'],backup])
   call(['docker','rename',identity,'otr-dev-backend']);call(['docker','start',identity])
   end=time.monotonic()+40
   while time.monotonic()<end:
    s=inspect(identity)
    if s['State'].get('Health',{}).get('Status')=='healthy':break
    if s['State']['Status'] in ('dead','exited'):raise RuntimeError('CANDIDATE_EXITED')
    time.sleep(1)
   else:raise RuntimeError('CANDIDATE_HEALTH_TIMEOUT')
   assert s['Config']==config and digest(environment(s))==g['expectedEnvironmentSHA256'] and mounts(s)==expected_mounts and host(s)==host(expected),'RUNNING_CONFIG_DRIFT'
   verify_http(g)
   for filename,expected_hash in g['bundles'].items():
    assert hashlib.sha256(subprocess.check_output(['docker','exec',identity,'cat','/app/'+filename],timeout=10)).hexdigest()==expected_hash,'BUNDLE_HASH_DRIFT'
   for path in ('/v1/auth/guest-adoptions/status','/v1/auth/guest-adoptions/preflight'):
    try:response=urllib.request.urlopen('http://127.0.0.1:8787'+path,timeout=3);code=response.status;response.close()
    except urllib.error.HTTPError as error:code=error.code;error.close()
    assert code==401,'AUTH_MIDDLEWARE_CLOSED_CHECK_FAILED'
   return {'status':'AUTH_QA_RUNTIME_CONFIG_MOUNTED_SIGNING_CLOSED','containerId':identity,'retainedContainerId':old['Id'],'image':target,'environmentSHA256':digest(environment(s)),'health':'healthy','mountsSHA256':digest(mounts(s)),'hostConfigSHA256':digest(s['HostConfig']),'configHashes':g['beforeConfigHashes'],'mountedFileHashes':g['mountedFileHashes'],'adoptionEffectiveFlag':'0','scopePresent':False,'retainedRollbackReady':True}
  except Exception:
   if changed:
    s=inspect(identity)
    if s['State']['Running']:call(['docker','stop','--time','10',identity])
    if s['Name']=='/otr-dev-backend':call(['docker','rename',identity,name+'-failed'])
    retained=inspect(old['Id'])
    if retained['Name']!='/otr-dev-backend':call(['docker','rename',old['Id'],'otr-dev-backend'])
    if not inspect(old['Id'])['State']['Running']:call(['docker','start',old['Id']])
    end=time.monotonic()+40
    while time.monotonic()<end:
     restored=inspect(old['Id'])
     if restored['State'].get('Health',{}).get('Status')=='healthy':break
     time.sleep(1)
    else:raise RuntimeError('RETAINED_RESTORE_UNHEALTHY')
    assert restored['Name']=='/otr-dev-backend' and restored['Image']==old['Image'] and restored['Config']==old['Config'] and host(restored)==host(old) and mounts(restored)==mounts(old),'RETAINED_RESTORE_DRIFT'
   raise
 finally:
  _mark("mutationFinishedAt")
  fcntl.flock(lock,fcntl.LOCK_UN)
  _mark("releasedAt")
  os.close(lock)
from datetime import datetime, timezone
_delivery_trace = {"requestedAt": "UNKNOWN", "readyAt": "UNKNOWN", "acquiredAt": None, "mutationFinishedAt": None, "releasedAt": None}
def _mark(name):
 _delivery_trace[name] = datetime.now(timezone.utc).isoformat()
if __name__ == '__main__':
 try:
  plan_file=plan_path(Path(sys.argv[1]))
  fd=os.open(plan_file,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  with os.fdopen(fd,'rb') as stream:
   st=os.fstat(stream.fileno());assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size<=131072
   raw=stream.read(131073);assert len(raw)<=131072
  assert hashlib.sha256(raw).hexdigest()==sys.argv[2],'PLAN_HASH'
  if len(sys.argv)>3: _delivery_trace["readyAt"]=datetime.fromisoformat(sys.argv[3]).isoformat()
  if len(sys.argv)>4: _delivery_trace["requestedAt"]=datetime.fromisoformat(sys.argv[4]).isoformat()
  result=run(json.loads(raw))
  print(json.dumps({"result":result,"deliveryTrace":_delivery_trace}))
 except Exception as error:
  print(json.dumps({'status':'RECONCILE_REQUIRED','deliveryTrace':_delivery_trace,'errorClass':type(error).__name__,'reason':str(error) if str(error).replace('_','').isupper() and str(error).replace('_','').isalpha() else None}));sys.exit(1)
