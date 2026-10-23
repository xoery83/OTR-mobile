"""One password-only update for each current-scope proven new fixture; no creation/login."""
import datetime,fcntl,hashlib,json,os,pathlib,subprocess,sys
from auth_in_place_operator import DIRECTORY,OWNER,OWNER_SHA,IMAGE,private,now,sha
FIXTURES={'A':{'id':'3f629440-0e8e-4b7d-8177-3dcf89e86b88','email':'otr-meta-qa-20261022-01-a@example.invalid','createdAt':'2026-10-22T23:51:47.501825Z'},'B':{'id':'d5fd339d-1a5e-478e-a901-1791512505d5','email':'otr-meta-qa-20261022-01-b@example.invalid','createdAt':'2026-10-22T23:52:06.667271Z'}}
def reserve(journal,label):
 assert set(journal)=={'A','B'} and all(type(v)is int and 0<=v<=1 for v in journal.values())
 if journal[label]!=0:raise ValueError('PASSWORD_RECOVERY_ALREADY_RESERVED_NO_RETRY')
 journal[label]=1

def main():
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--gate',required=True);a.add_argument('--gate-sha',required=True);a.add_argument('--bundle',required=True);a.add_argument('--bundle-sha',required=True);a.add_argument('--label',choices=['A','B'],required=True);v=a.parse_args()
 assert sha(pathlib.Path(OWNER).read_bytes())==OWNER_SHA
 gatebytes=pathlib.Path(v.gate).read_bytes();assert sha(gatebytes)==v.gate_sha;gate=json.loads(gatebytes)
 start=datetime.datetime.fromisoformat(gate['startsAt'].replace('Z','+00:00'));end=datetime.datetime.fromisoformat(gate['expiresAt'].replace('Z','+00:00'))
 assert gate['scope']=='AUTONOMOUS_DEV_SYNTHETIC_PASSWORD_RECOVERY'and gate['ownerAuthorized']is True and gate['ownerAuthorizationSHA256']==OWNER_SHA and gate['project']=='tuqigdxrvrerfewsxqgm'and 0<(end-start).total_seconds()<=900 and start<=now()<end
 code=pathlib.Path(v.bundle).read_bytes();assert sha(code)==v.bundle_sha;secret=json.load(sys.stdin);assert isinstance(secret.get('password'),str)and len(secret['password'])>=20
 identity=FIXTURES[v.label];creation=json.loads((DIRECTORY/'auth-attempt-journal.json').read_text());assert creation['ownerAuthorizationSHA256']==OWNER_SHA;entry=[e for e in creation['entries']if e['label']==v.label and e.get('receipt')]
 assert len(entry)==1 and all(entry[0]['receipt'][k]==identity[k]for k in identity)
 assert not DIRECTORY.is_symlink()and DIRECTORY.stat().st_uid==os.getuid()and DIRECTORY.stat().st_mode&0o777==0o700
 fd=os.open(DIRECTORY/'password-recovery.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'r+')as held:
  fcntl.flock(held,fcntl.LOCK_EX);path=DIRECTORY/'password-recovery-counts.json';assert not path.is_symlink();counts=json.loads(path.read_text())if path.exists()else{'A':0,'B':0};assert counts[v.label]==0
  q=DIRECTORY/f'password-proof-{v.label}.sql';assert not q.is_symlink();q.write_text(f"BEGIN READ ONLY;\nSELECT id,email,created_at FROM auth.users WHERE id='{identity['id']}'::uuid AND email='{identity['email']}';\nROLLBACK;\n");q.chmod(0o600)
  assert start<=now()<end
  r=subprocess.run(['/private/tmp/otr-c-execution-prep-20261023/node_modules/.bin/supabase','db','query','--linked','--project-ref','tuqigdxrvrerfewsxqgm','--file',str(q),'--output','json'],cwd='/Users/xoery/Project/otr-mobile-canonical',env=dict(os.environ,SUPABASE_DB_PASSWORD='DOCUMENTED_NONSECRET_MANAGEMENT_API_PLACEHOLDER'),capture_output=True,text=True,timeout=40)
  assert r.returncode==0;rows=json.loads(r.stdout)['rows'];assert len(rows)==1 and rows[0]['id']==identity['id']and rows[0]['email']==identity['email']and datetime.datetime.fromisoformat(rows[0]['created_at'].replace('Z','+00:00'))==datetime.datetime.fromisoformat(identity['createdAt'].replace('Z','+00:00'))
  proof={**identity,'utc':now().isoformat()};private(DIRECTORY/f'password-proof-{v.label}.json',proof)
  image=subprocess.check_output(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','docker inspect --format {{.Image}} otr-dev-backend'],text=True,timeout=15).strip();assert image==IMAGE and start<=now()<end
  reserve(counts,v.label);private(path,counts) # never refunded, including network/parse/timeout
  payload={'gateJSON':gatebytes.decode(),'gateSHA256':v.gate_sha,'label':v.label,'password':secret['password'],'proof':proof}
  wire=code.decode()+'\nconst result=await recoverPasswordInPlace(JSON.parse('+json.dumps(json.dumps(payload))+'));console.log(JSON.stringify(result));if(!result.receipt)process.exitCode=2;\n'
  try:
   r=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','docker exec -i otr-dev-backend node --input-type=module'],input=wire,text=True,capture_output=True,timeout=45)
   result=json.loads(r.stdout);assert result.get('label')==v.label and result.get('attempts')in[0,1];private(DIRECTORY/f'password-recovery-result-{v.label}.json',result);print(json.dumps(result));sys.exit(0 if result.get('receipt')else 2)
  except Exception:print(json.dumps({'status':'PASSWORD_RECOVERY_OUTCOME_UNKNOWN_NO_RETRY','label':v.label}));sys.exit(2)
if __name__=='__main__':
 try:main()
 except Exception:print(json.dumps({'status':'PASSWORD_RECOVERY_SCOPE_STOP_NO_NEW_DISPATCH'}));sys.exit(2)
