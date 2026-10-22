"""One ephemeral in-place Auth invocation; no remote key export, login or business access."""
import argparse,datetime,fcntl,hashlib,json,os,pathlib,subprocess,sys,tempfile
PROJECT='tuqigdxrvrerfewsxqgm'
OWNER='/private/tmp/otr-local-first-core-20261019/docs/ops/c-autonomous-dev-20261023/OWNER_AUTHORIZATION.json'
OWNER_SHA='a6682cdcfec889d64d02627c1f8fa144db0e828b77841e66fdac2bfc405d5e5e'
IMAGE='sha256:4c8d6a04c7e31f5f38d972990a626168fedfe7611e2a32ec92209b5f7a120e14'
DIRECTORY=pathlib.Path('/private/tmp/otr-c-autonomous-dev-20261023')
def now():return datetime.datetime.now(datetime.timezone.utc)
def sha(data):return hashlib.sha256(data).hexdigest()
def private(path,value):
 fd,name=tempfile.mkstemp(dir=path.parent,prefix='.write-');os.fchmod(fd,0o600)
 with os.fdopen(fd,'w')as f:json.dump(value,f,indent=2);f.flush();os.fsync(f.fileno())
 os.replace(name,path)
 directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(directory)
 finally:os.close(directory)
def reserve(journal,label,windowSHA,absence):
 if journal.get('ownerAuthorizationSHA256')!=OWNER_SHA:raise ValueError('JOURNAL_OWNER_CHANGED')
 assert set(journal['counts'])=={'A','B'} and all(type(n)is int and 0<=n<=2 for n in journal['counts'].values())
 assert len(journal['entries'])==sum(journal['counts'].values())
 ordinal=journal['counts'][label]+1
 if ordinal>2:raise ValueError('IDENTITY_BUDGET_EXHAUSTED')
 journal['counts'][label]=ordinal;journal['entries'].append({'label':label,'attemptOrdinal':ordinal,'utc':now().isoformat(),'windowSHA256':windowSHA,'absenceUTC':absence['utc'],'status':'RESERVED_OUTCOME_UNKNOWN','receipt':None})
 return ordinal
def main():
 a=argparse.ArgumentParser();a.add_argument('--gate',required=True);a.add_argument('--gate-sha',required=True);a.add_argument('--label',choices=['A','B'],required=True);a.add_argument('--bundle',required=True);a.add_argument('--bundle-sha',required=True);v=a.parse_args()
 assert sha(pathlib.Path(OWNER).read_bytes())==OWNER_SHA
 gatebytes=pathlib.Path(v.gate).read_bytes();assert sha(gatebytes)==v.gate_sha;gate=json.loads(gatebytes)
 start=datetime.datetime.fromisoformat(gate['startsAt'].replace('Z','+00:00'));end=datetime.datetime.fromisoformat(gate['expiresAt'].replace('Z','+00:00'))
 assert gate['ownerAuthorized']is True and gate['scope']=='AUTONOMOUS_DEV_C_AUTH_IN_PLACE'and gate['project']==PROJECT and gate['ownerAuthorizationSHA256']==OWNER_SHA and 0<(end-start).total_seconds()<=900 and start<=now()<end
 code=pathlib.Path(v.bundle).read_bytes();assert sha(code)==v.bundle_sha
 secret=json.load(sys.stdin);assert isinstance(secret.get('password'),str)and len(secret['password'])>=20
 DIRECTORY.mkdir(mode=0o700,exist_ok=True)
 parent=os.open(DIRECTORY.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(parent)
 finally:os.close(parent)
 assert not DIRECTORY.is_symlink()and DIRECTORY.stat().st_uid==os.getuid()and DIRECTORY.stat().st_mode&0o777==0o700
 lock=DIRECTORY/'auth-attempt-journal.lock';fd=os.open(lock,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'r+')as held:
  fcntl.flock(held,fcntl.LOCK_EX)
  path=DIRECTORY/'auth-attempt-journal.json'
  assert not path.is_symlink()
  journal=json.loads(path.read_text())if path.exists()else{'ownerAuthorizationSHA256':OWNER_SHA,'counts':{'A':0,'B':0},'entries':[]}
  assert journal['counts'][v.label]<2
  email=f'otr-meta-qa-20261022-01-{v.label.lower()}@example.invalid'
  sql=f"BEGIN READ ONLY;\nSELECT id,email,created_at FROM auth.users\nWHERE email = '{email}';\nROLLBACK;\n"
  q=DIRECTORY/f'exact-{v.label}.sql';assert not q.is_symlink()
  q.write_text(sql);q.chmod(0o600)
  assert start<=now()<end
  r=subprocess.run(['/private/tmp/otr-c-execution-prep-20261023/node_modules/.bin/supabase','db','query','--linked','--project-ref',PROJECT,'--file',str(q),'--output','json'],cwd='/Users/xoery/Project/otr-mobile-canonical',env=dict(os.environ,SUPABASE_DB_PASSWORD='DOCUMENTED_NONSECRET_MANAGEMENT_API_PLACEHOLDER'),capture_output=True,text=True,timeout=45)
  assert r.returncode==0;result=json.loads(r.stdout);assert isinstance(result.get('rows'),list)
  absence={'project':PROJECT,'email':email,'utc':now().isoformat(),'rows':result['rows'],'querySHA256':sha(sql.encode())};private(DIRECTORY/f'absence-{v.label}-{len(journal["entries"])}.json',absence)
  assert absence['rows']==[]
  # A confirmed creation is never recreated; ambiguous prior requests are only reconciled read-only.
  for prior in journal['entries']:
   if prior['label']!=v.label:continue
   assert prior.get('receipt')is None
   result=prior.get('result',{});observed=result.get('diagnostics',[])
   assert prior['status']=='RETURNED_SAFE_RESULT'and len(observed)==1 and observed[0].get('outcome')=='HTTP_RESPONSE'and 400<=observed[0].get('httpStatus',0)<500

  image=subprocess.check_output(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','docker inspect --format {{.Image}} otr-dev-backend'],text=True,timeout=15).strip();assert image==IMAGE and start<=now()<end
  ordinal=reserve(journal,v.label,v.gate_sha,absence);private(path,journal)
  payload={'gateJSON':gatebytes.decode(),'gateSHA256':v.gate_sha,'label':v.label,'attemptOrdinal':ordinal,'password':secret['password'],'absence':absence}
  # Code and private payload travel only on encrypted stdin, never argv, a mount or persistent remote file.
  wire=code.decode()+'\nconst __result=await executeInPlace(JSON.parse('+json.dumps(json.dumps(payload))+'));console.log(JSON.stringify(__result));if(!__result.receipt)process.exitCode=2;\n'
  try:
   r=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','docker exec -i otr-dev-backend node --input-type=module'],input=wire,text=True,capture_output=True,timeout=45)
   output=json.loads(r.stdout);assert output.get('label')==v.label and output.get('attemptOrdinal')==ordinal and output.get('attempts')in[0,1]
   journal['entries'][-1]['status']='RETURNED_SAFE_RESULT';journal['entries'][-1]['result']=output;journal['entries'][-1]['receipt']=output.get('receipt');private(path,journal);print(json.dumps(output))
   if not output.get('receipt'):sys.exit(2)
  except Exception:
   # Reservation is retained as UNKNOWN. Never retry an ambiguous request automatically.
   print(json.dumps({'status':'OPERATOR_OUTCOME_UNKNOWN_RECONCILE_BEFORE_ANY_RETRY','label':v.label,'attemptOrdinal':ordinal}));sys.exit(2)
if __name__=='__main__':
 try:main()
 except Exception:print(json.dumps({'status':'OPERATOR_PREFLIGHT_OR_EXACT_ABSENCE_STOP_NO_NEW_AUTH_DISPATCH'}));sys.exit(2)
