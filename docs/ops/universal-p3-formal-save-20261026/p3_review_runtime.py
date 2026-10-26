import datetime,fcntl,hashlib,json,os,pathlib,subprocess,sys,time,urllib.request,urllib.error
ROOT=pathlib.Path('/opt/otr/dev-backend/private/universal-p3-activation-5882798a')
canon=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')).encode()
sha=lambda v:hashlib.sha256(canon(v)).hexdigest()
def call(*a):return subprocess.check_output(a,stderr=subprocess.PIPE,timeout=35)
def snap(id):return json.loads(call('docker','inspect',id))[0]
def save(name,value):
 fd=os.open(ROOT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())
def check(s,p,new,created=False):
 assert s['Id']==p['candidateContainerId' if new else 'originalContainerId']
 assert s['Image']==p['imageId' if new else 'baselineImageId']
 assert sha(s['Config'])==p['candidateConfigSHA256' if new else 'baselineConfigSHA256']
 assert sha(s['HostConfig'])==p['createdHostConfigSHA256' if created else 'baselineHostConfigSHA256']
 assert sha(sorted(s['Mounts'],key=lambda m:(m['Destination'],m['Source'])))==p['mountsSHA256']
def rollback(p):
 old=snap(p['originalContainerId']);new=snap(p['candidateContainerId'])
 check(old,p,False);check(new,p,True,created=new['State']['Status']=='created')
 (ROOT/'rollback-private-diagnostics.json').write_bytes(canon({'newState':new['State']}));os.chmod(ROOT/'rollback-private-diagnostics.json',0o600)
 if new['State']['Running']:call('docker','stop','--time','10',new['Id'])
 new=snap(new['Id']);assert not new['State']['Running']
 if new['Name']=='/otr-dev-backend':call('docker','rename',new['Id'],'otr-universal-p3-activation-5882798a-failed-d83ec6b3')
 old=snap(old['Id'])
 if old['Name']!='/otr-dev-backend':call('docker','rename',old['Id'],'otr-dev-backend')
 if not old['State']['Running']:call('docker','start',old['Id'])
 for _ in range(40):
  old=snap(old['Id']);check(old,p,False)
  if old['State'].get('Health',{}).get('Status')=='healthy':break
  time.sleep(1)
 assert old['State']['Health']['Status']=='healthy'
 return {'status':'ROLLBACK_VERIFIED','containerId':old['Id'],'imageId':old['Image']}
def verify(p):
 new=snap(p['candidateContainerId']);old=snap(p['originalContainerId']);check(new,p,True);check(old,p,False)
 assert new['Name']=='/otr-dev-backend' and new['State']['Health']['Status']=='healthy'
 assert not old['State']['Running']
 health=json.load(urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=5));assert health=={'status':'ok','environment':'development'}
 id='11111111-1111-4111-8111-111111111111';routes={}
 for path in ['/v2/trips/'+id+'/metadata','/v2/trips/'+id+'/ledger/bootstrap','/v2/import-batches/'+id+'/interpretations?tripId='+id]:
  try:r=urllib.request.urlopen('http://127.0.0.1:8787'+path,timeout=5);status=r.status;r.close()
  except urllib.error.HTTPError as e:status=e.code;e.close()
  assert status==401;routes[path]=status
 bundles=json.loads((ROOT/'manifest.json').read_text())['bundles']
 for name,expected in bundles.items():assert hashlib.sha256(call('docker','exec',new['Id'],'cat','/app/'+name)).hexdigest()==expected
 siblings=[{'id':v['Id'],'image':v['Image'],'status':v['State']['Status']} for v in json.loads(call('docker','inspect',*[v['id'] for v in p['baselineSiblingContainers']]))]
 assert sorted(siblings,key=lambda x:x['id'])==sorted(p['baselineSiblingContainers'],key=lambda x:x['id'])
 return {'status':'DEPLOY_HEALTH_AND_BOUNDARIES_PASS','containerId':new['Id'],'imageId':new['Image'],'configSHA256':sha(new['Config']),'hostConfigSHA256':sha(new['HostConfig']),'mountsSHA256':p['mountsSHA256'],'health':health,'routes':routes,'siblingCount':len(siblings),'rollbackImageRetained':old['Image'],'restartCount':new['RestartCount']}
def main():
 p=json.loads((ROOT/'plan.json').read_text());mode=sys.argv[1]
 if mode=='arm':
  assert not (ROOT/'window.json').exists()
  t=time.time();save('window.json',{'startsAt':datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat(),'deadline':t+900,'swapDeadline':t+660})
  log=open(ROOT/'watch.log','xb');os.chmod(ROOT/'watch.log',0o600)
  child=subprocess.Popen(['python3',str(ROOT/'operator.py'),'watch'],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
  save('watchdog.json',{'pid':child.pid});print(json.dumps({'status':'WATCHDOG_ARMED','pid':child.pid,'deadline':t+900}));return
 w=json.loads((ROOT/'window.json').read_text())
 if mode=='deadline':print(json.dumps({'deadline':w['deadline']}));return
 if mode=='watch':time.sleep(max(0,w['deadline']-time.time()))
 lock=os.open('/run/lock/otr-universal-finite-service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 fcntl.flock(lock,fcntl.LOCK_EX)
 try:
  if mode=='swap':
   assert time.time()<w['swapDeadline']
   old=snap(p['originalContainerId']);new=snap(p['candidateContainerId']);check(old,p,False);check(new,p,True,created=True)
   assert old['Name']=='/otr-dev-backend' and old['State']['Health']['Status']=='healthy'
   assert new['State']['Status']=='created'
   expected=dict(old['HostConfig'])
   if expected['OomKillDisable'] is None:expected['OomKillDisable']=False
   assert new['HostConfig']==expected, 'UNEXPECTED_CREATED_HOST_DRIFT'
   try:
    call('docker','stop','--time','10',old['Id']);assert not snap(old['Id'])['State']['Running']
    call('docker','rename',old['Id'],'otr-universal-p3-activation-5882798a-previous-d83ec6b3')
    call('docker','rename',new['Id'],'otr-dev-backend');call('docker','start',new['Id'])
    for _ in range(45):
     new=snap(new['Id'])
     if new['State'].get('Health',{}).get('Status')=='healthy':break
     time.sleep(1)
    r=verify(p);save('swap.json',r);print(json.dumps(r))
   except Exception:
    r=rollback(p);save('rollback.json',r);print(json.dumps(r));raise
  elif mode=='watch':
   r=rollback(p);save('watchdog-final.json',r)
  elif mode=='verify':print(json.dumps(verify(p)))
  elif mode=='rollback':print(json.dumps(rollback(p)))
  else:raise ValueError('MODE')
 finally:os.close(lock)
if __name__=='__main__':
 try:main()
 except Exception:print('WAKE_OPERATION_FAILED_RECONCILE_READONLY');sys.exit(1)
