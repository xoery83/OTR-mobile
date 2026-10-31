import fcntl,hashlib,importlib.util,json,os,re,stat,subprocess,sys,time,datetime
from pathlib import Path
from deploy import plan_path
def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def call(args):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=35)
def instant():return datetime.datetime.now(datetime.timezone.utc).isoformat()
trace={'requestedAt':instant(),'readyAt':'UNKNOWN','acquiredAt':'UNKNOWN','mutationFinishedAt':'UNKNOWN','releasedAt':'UNKNOWN'}
try:
 p=plan_path(Path(sys.argv[1]));ROOT=p.parent;st=p.lstat();assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and st.st_size<=131072
 raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==sys.argv[2];g=json.loads(raw)
 assert re.fullmatch('[0-9a-f]{64}',g['beforeContainerId'])
 assert g['candidateImage']==g['beforeImage'] and re.fullmatch('sha256:[0-9a-f]{64}',g['beforeImage'])
 current_id=sys.argv[3];assert len(current_id)==64 and all(c in '0123456789abcdef' for c in current_id)
 helper=ROOT/'universal_runtime_close.py';assert hashlib.sha256(helper.read_bytes()).hexdigest()==g['restoreHelperSHA256']
 spec=importlib.util.spec_from_file_location('existing_runtime_close',helper);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 def check(s,active):
  assert s['Id']==(current_id if active else g['beforeContainerId']) and s['Image']==g['candidateImage']
  assert digest(s['Config'])==(g['expectedConfigSHA256'] if active else g['beforeConfigSHA256'])
  assert s['HostConfig']==g['expectedHostConfig']
  assert sorted((m['Source'],m['Destination'],m['RW']) for m in s['Mounts'])==sorted(tuple(m) for m in g['expectedMounts'])
  for path,h in {**g['beforeConfigHashes'],**g['mountedFileHashes']}.items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==h
 trace['readyAt']=instant()
 lock=os.open('/run/lock/otr-universal-finite-service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);s=os.fstat(lock);assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);trace['acquiredAt']=instant()
 try:
  module.restore_retained({'runtime':{'container':'otr-dev-backend','originalContainerId':g['beforeContainerId'],'backupContainerName':g['backupName']}},call,check)
  deadline=time.monotonic()+40
  while time.monotonic()<deadline:
   restored=json.loads(call(['docker','inspect','otr-dev-backend']))[0];check(restored,False)
   if restored['State'].get('Health',{}).get('Status')=='healthy':break
   time.sleep(1)
  else:raise RuntimeError('RETAINED_HEALTH_UNCONFIRMED')
  assert not any(e.startswith('OTR_DEV_MCP_READ_QA_CONFIG=') for e in restored['Config']['Env'])
  assert restored['Name']=='/otr-dev-backend' and restored['State']['Running']
  result={'status':'AUTH_QA_RUNTIME_REMOVED_RETAINED_DEFAULT_RESTORED','containerId':restored['Id'],'image':restored['Image'],'finiteConfigAbsent':True,'health':'healthy'}
 finally:
  trace['mutationFinishedAt']=instant();fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock);trace['releasedAt']=instant()
 print(json.dumps({'result':result,'deliveryTrace':trace}))
except Exception as error:
 print(json.dumps({'status':'UNKNOWN_RECONCILE_REQUIRED','errorClass':type(error).__name__,'deliveryTrace':trace}));sys.exit(1)
