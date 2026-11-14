"""Closed DEV Host switch and exact retained-container recovery."""
import fcntl,hashlib,http.client,json,os,re,socket,stat,subprocess,sys,time
from pathlib import Path
import urllib.request,urllib.error

class HostConfigDrift(Exception):
 def __init__(self,keys):self.keys=keys

class NoProbeRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):
  return None

def verify_http(g):
 paths=g['protectedRoutes']
 assert paths and all(isinstance(x,list) and len(x)==2 and x[1]==401 for x in paths),'PROTECTED_ROUTES_REQUIRED'
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoProbeRedirect())
 # Direct requests hit the retained nft/Caddy aperture. Public requests reach Auth.
 for layer,origin,denial in (('DIRECT_APERTURE','http://127.0.0.1:8787',503),
                             ('PUBLIC_CADDY','https://api-dev.xoery.art',401)):
  for index,path in enumerate(['/health',*(entry[0] for entry in paths)]):
   assert isinstance(path,str) and path.startswith('/') and not path.startswith('//') and '://' not in path,'INVALID_PROBE_PATH'
   expected=200 if index==0 else denial
   try:
    with opener.open(urllib.request.Request(origin+path),timeout=4) as response:status=response.status
   except urllib.error.HTTPError as error:
    status=error.code;error.close()
   assert status==expected,f'{layer}_PROBE_{index}_EXPECTED_{expected}_GOT_{status}'


def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def call(args):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=35)
def inspect(x):return json.loads(call(['docker','inspect',x]))[0]
def environment(s):return dict(x.split('=',1) for x in s['Config']['Env'])
def mounts(s):return sorted((m['Source'],m['Destination'],m['RW']) for m in s['Mounts'])
def host(s):
 h=dict(s['HostConfig']);h['Mounts']=sorted((h.get('Mounts') or []),key=lambda x:json.dumps(x,sort_keys=True));return h
class Docker(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(20);self.sock.connect('/var/run/docker.sock')

def same_host(a,b):
 left,right=host(a),host(b)
 for value in (left,right):
  if 'OomKillDisable' in value and value['OomKillDisable'] is None:value['OomKillDisable']=False
 return left==right

def off_config(old, target):
 e=environment(old)
 assert len(e)==len(old['Config']['Env']),'DUPLICATE_ENVIRONMENT_KEY'
 assert e.get('OTR_DEV_SUPABASE_URL')=='https://tuqigdxrvrerfewsxqgm.supabase.co','DEV_PROJECT_DRIFT'
 assert e.get('OTR_DEV_UNIVERSAL_CONTINUOUS_HOST')==e.get('OTR_DEV_UNIVERSAL_PDF_RUNTIME')==e.get('OTR_DEV_UNIVERSAL_PNG_RUNTIME')=='disabled','IMPORT_ALREADY_ACTIVE'
 assert 'OTR_DEV_UNIVERSAL_SETTLED_RECOVERY' not in e,'RECOVERY_ALREADY_ACTIVE'
 assert e.get('AI_COST_GUARD_ENABLED') in ('true','false'),'COST_GUARD_PREIMAGE'
 return dict(old['Config'],Image=target)

def verify_closed(g):
 sys.path.insert(0,'/var/lib/otr/root2-m2/568bb4be35054019a660a58ed15527ed')
 from m2_m1_ports import caddy,config_sha,CONFIG_ROOT,CADDY_SOCKET
 sock=Path(CADDY_SOCKET).lstat()
 assert stat.S_ISSOCK(sock.st_mode) and (sock.st_dev,sock.st_ino)==(g['caddySocketDevice'],g['caddySocketInode']),'CADDY_SOCKET_DRIFT'
 status,etag,body=caddy(CONFIG_ROOT)
 assert status==200 and etag and config_sha(json.loads(body))==g['caddySHA256'],'CADDY_NOT_CLOSED'
 for name in ('pdf','png'):
  unit='otr-universal-'+name+'-worker.service'
  value=dict(line.split('=',1) for line in call(['/usr/bin/systemctl','show',unit,'-p','ActiveState,MainPID,Job']).splitlines())
  assert value['ActiveState'] in ('inactive','failed') and value['MainPID']=='0' and not value['Job'],'WORKER_NOT_STOPPED'
  assert not os.path.lexists('/run/otr/universal-'+name+'-worker/worker.sock'),'WORKER_SOCKET_PRESENT'

STAGE = Path(__file__).resolve().parent

def private_bytes(path):
 st=path.lstat()
 assert path.resolve()==path and stat.S_ISREG(st.st_mode) and st.st_uid==st.st_gid==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size<=2000000,'PROBE_FILE_CUSTODY'
 return path.read_bytes()

def read_probe(g):
 raw=private_bytes(STAGE/'probe.mjs')
 assert hashlib.sha256(raw).hexdigest()==g['probe']['stdin']['sha256'],'DECODER_PROBE_HASH'
 return raw

def verify_decoder(g,cid):
 assert re.fullmatch('[a-f0-9]{64}',cid),'DECODER_CID'
 for file in (g['embeddedLauncher'],g['deadlineExecutable']):
  out=subprocess.check_output(['/usr/bin/docker','exec',cid,'/usr/bin/sha256sum',file['path']],timeout=10)
  assert out.split()[0].decode()==file['sha256'],'DECODER_EXECUTABLE_DRIFT'
 probe=g['probe']
 assert type(probe['deadlineSeconds']) is int and 5 <= probe['deadlineSeconds'] <= 20
 uid,gid=probe['expected']['uid'],probe['expected']['gid']
 assert type(uid) is int and uid>0 and type(gid) is int and gid>0,'DECODER_PROBE_NONROOT'
 argv=['/usr/bin/docker','exec','-i','--user',f'{uid}:{gid}',cid,
       '/usr/bin/timeout','--signal=TERM','--kill-after=1s',
       f"{probe['deadlineSeconds']-4}s",'/usr/bin/env','-i',
       '/usr/local/bin/node','--input-type=module']
 started=time.monotonic()
 trace={'stage':probe['stage'],'sourceCommit':g['sourceCommit'],'candidateImage':g['candidateImage'],
        'candidateCID':cid,'launcherSHA256':g['embeddedLauncher']['sha256'],
        'probeStdinSHA256':probe['stdin']['sha256'],'startedAt':datetime.now(timezone.utc).isoformat()}
 _delivery_trace['decoder']=trace
 try:
  reply=subprocess.run(argv,input=read_probe(g),capture_output=True,timeout=probe['deadlineSeconds'])
 except subprocess.TimeoutExpired:
  trace.update(disposition='RUNTIME_UNKNOWN',exitCode=None)
  raise RuntimeError('DECODER_PROBE_UNKNOWN') from None
 finally:
  trace['elapsedMs']=round((time.monotonic()-started)*1000)
 trace['exitCode']=reply.returncode
 try:
  row=json.loads(reply.stdout)
  assert isinstance(row,dict)
  trace.update({key:row[key] for key in ('status','architecture','guardMs','decoded','fixtures') if key in row})
  trace.update(effectiveUID=row.get('uid'),effectiveGID=row.get('gid'))
  guard=row.get('guard')
  if isinstance(guard,dict):
   trace['guard']={key:guard[key] for key in ('exit','signal','elapsedMs') if key in guard}
   detail=guard.get('detail')
   if isinstance(detail,str) and re.fullmatch(r'DECODER_[A-Z_]{1,80}(?:: [A-Za-z0-9 ._-]{1,100})?',detail):
    trace['guard']['detail']=detail
  expected=probe['expected']
  pairs=[[x['input'],x['output']] for x in row['decoded']]
  passed=(reply.returncode==expected['exitCode'] and row['status']==expected['status']
          and row['uid']==expected['uid'] and row['gid']==expected['gid']
          and row['architecture']==expected['architecture'] and len(pairs)==expected['decodedCount']
          and pairs==expected['imageMimePairs'])
 except (ValueError,KeyError,TypeError,AssertionError):
  passed=False
 if not passed:
  trace['disposition']={124:'RUNTIME_TIMEOUT',137:'RUNTIME_KILLED',40:'RUNTIME_IDENTITY_MISMATCH'}.get(reply.returncode,'RUNTIME_PROBE_FAILED')
  raise RuntimeError('DECODER_PROBE_NONPASS')
 trace['disposition']='FOUR_IMAGE_SMOKE_PASS'

def run(g):
 lock=os.open('/run/lock/otr-universal-finite-service.lock',os.O_RDWR|os.O_NOFOLLOW)
 st=os.fstat(lock);assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 _mark("acquiredAt")
 try:
  assert (st.st_dev,st.st_ino)==(g['writerDevice'],g['writerInode']),'WRITER_IDENTITY_DRIFT'
  verify_closed(g)
  verify_http(g)
  assert subprocess.run(['docker','inspect',g['backupName']],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10).returncode != 0,'ROLLBACK_NAME_OCCUPIED'
  old=inspect('otr-dev-backend');assert old['Id']==g['beforeContainerId'] and old['Image']==g['beforeImage'] and old['State']['Health']['Status']=='healthy'
  assert digest(old['Config'])==g['beforeConfigSHA256'],'CONFIG_PREIMAGE'
  assert digest(old['HostConfig'])==g['beforeHostConfigSHA256'],'HOST_CONFIG_PREIMAGE'
  e=environment(old)
  assert len(e)==len(old['Config']['Env']),'DUPLICATE_ENVIRONMENT_KEY'
  assert not any(k in e for k in ('OTR_DEV_MCP_C02_QA_CONFIG','OTR_DEV_MCP_WRITE_QA_CONFIG','OTR_DEV_MCP_READ_QA_CONFIG','OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG')),'MCP_QA_ALREADY_ACTIVE'
  assert digest(e)==g['beforeEnvironmentSHA256'],'ENVIRONMENT_PREIMAGE'
  for p,h in g['mountedFileHashes'].items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,'FILE_DRIFT'
  expected_mounts=mounts(old)
  assert digest(expected_mounts)==g['beforeMountsSHA256'],'BASELINE_MOUNTS_DRIFT'
  target=g['candidateImage']
  image,=json.loads(call(['docker','image','inspect',target]))
  assert (image['Id'],image['Architecture'],image['Os'])==(target,'amd64','linux'),'CANDIDATE_IMAGE_DRIFT'
  config=off_config(old,target)
  hc=dict(old['HostConfig'])
  if hc.get('OomKillDisable') is None:hc['OomKillDisable']=False
  name=g['containerName'];backup=g['backupName']
  assert g['protectedRoutes'],'PROTECTED_ROUTES_REQUIRED'
  if g.get('probe'): read_probe(g)
  client=Docker('localhost',timeout=20)
  client.request('POST','/v1.44/containers/create?name='+name,json.dumps({**config,'HostConfig':hc}),{'Content-Type':'application/json'})
  response=client.getresponse();raw=response.read();client.close();assert response.status==201,'CREATE_RECONCILE_NO_RETRY'
  identity=json.loads(raw)['Id'];new=inspect(identity)
  assert new['Config']==config and new['Image']==target and new['State']['Status']=='created'
  expected=dict(old,HostConfig=hc)
  assert same_host(new,expected) and mounts(new)==expected_mounts,'STAGED_CONFIG_DRIFT'
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
   assert s['Config']==config and environment(s)==e and mounts(s)==expected_mounts and same_host(s,expected),'RUNNING_CONFIG_DRIFT'
   verify_closed(g)
   verify_http(g)
   for filename,expected_hash in g['bundles'].items():
    assert hashlib.sha256(subprocess.check_output(['docker','exec',identity,'cat','/app/'+filename],timeout=10)).hexdigest()==expected_hash,'BUNDLE_HASH_DRIFT'
   if g.get('probe'): verify_decoder(g,identity)
   return {'status':'DEV_DEFAULT_CLOSED_SOFTWARE_DEPLOYED','containerId':identity,'retainedContainerId':old['Id'],'image':target,'environmentSHA256':digest(environment(s)),'health':'healthy','mountsSHA256':digest(mounts(s)),'hostConfigSHA256':digest(s['HostConfig']),'mountedFileHashes':g['mountedFileHashes'],'costGuardEnv':e['AI_COST_GUARD_ENABLED'],'importClosed':True,'retainedRollbackReady':True,'decoder':_delivery_trace.get('decoder')}
  except Exception:
   if _delivery_trace.get('decoder',{}).get('disposition')=='RUNTIME_UNKNOWN':
    raise
   if changed:
    verify_closed(g)
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
    assert restored['Name']=='/otr-dev-backend' and restored['Image']==old['Image'] and restored['Config']==old['Config'] and same_host(restored,old) and mounts(restored)==mounts(old),'RETAINED_RESTORE_DRIFT'
    verify_closed(g)
    verify_http(g)
    _delivery_trace['rollback']={'status':'EXACT_RETAINED_CID_RESTORED','cid':old['Id'],'image':old['Image'],'health':'healthy'}
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
  if not __debug__: raise RuntimeError('UNSAFE_PYTHON_OPTIMIZATION')
  plan_path=Path(sys.argv[1])
  assert plan_path==STAGE/'deploy-plan.json' and STAGE.parent==Path('/opt/otr/dev-backend/build')
  assert re.fullmatch(r'dev-backend-[a-f0-9]{32}',STAGE.name),'HOST_STAGE'
  fd=os.open(plan_path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  with os.fdopen(fd,'rb') as stream:
   st=os.fstat(stream.fileno());assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size<=131072
   raw=stream.read(131073);assert len(raw)<=131072
  assert hashlib.sha256(raw).hexdigest()==sys.argv[2],'PLAN_HASH'
  if len(sys.argv)>3: _delivery_trace["readyAt"]=datetime.fromisoformat(sys.argv[3]).isoformat()
  if len(sys.argv)>4: _delivery_trace["requestedAt"]=datetime.fromisoformat(sys.argv[4]).isoformat()
  result=run(json.loads(raw))
  print(json.dumps({"result":result,"deliveryTrace":_delivery_trace}))
 except Exception as error:
  print(json.dumps({'status':('ROLLED_BACK' if _delivery_trace.get('rollback') and _delivery_trace.get('decoder',{}).get('disposition')!='RUNTIME_UNKNOWN' else 'RECONCILE_REQUIRED'),'deliveryTrace':_delivery_trace,'errorClass':type(error).__name__,'reason':str(error) if re.fullmatch(r'[A-Z][A-Z0-9_]{1,100}',str(error)) else None}));sys.exit(1)
