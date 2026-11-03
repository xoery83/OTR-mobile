import hashlib,json,os,subprocess,time,uuid
from pathlib import Path
root=Path(__file__).resolve().parents[2]
docker=['/opt/homebrew/bin/docker','--context','colima']
assert not any(os.environ.get(k) for k in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])
assert subprocess.check_output(docker+['context','inspect','colima','--format','{{.Endpoints.docker.Host}}'],text=True).strip()=='unix:///Users/xoery/.colima/default/docker.sock'
name='otr-core-v2-test-'+uuid.uuid4().hex[:12];created=False;started=time.monotonic();passed=False
try:
 subprocess.run(docker+['run','--detach','--pull=never','--network','none','--memory','256m','--cpus','1','--label','otr.auth.fixture=member-claim','--name',name,'otr-core-v2-server84-fixture:20261012'],check=True,capture_output=True,timeout=30);created=True
 assert subprocess.check_output(docker+['inspect','--format','{{.Image}}',name],text=True).strip()=='sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068'
 for _ in range(40):
  if subprocess.run(docker+['exec',name,'pg_isready','-U','supabase_admin'],capture_output=True,timeout=5).returncode==0:break
  time.sleep(.25)
 else:raise RuntimeError('OWNED_FIXTURE_NOT_READY')
 result=subprocess.run(['node_modules/.bin/vitest','run','backend/src/tripMemberClaimPg.pg.test.ts','-t','current Hosted read-state','--maxWorkers=1'],cwd=root,env={**os.environ,'DOCKER_CONTEXT':'colima','OTR_MEMBER_CLAIM_PG_FIXTURE':name},timeout=115)
 passed=result.returncode==0
finally:
 removed=False
 if created:
  removed=subprocess.run(docker+['rm','--force',name],capture_output=True,timeout=20).returncode==0
 receipt={'status':'PASS_CURRENT_GUARD_RED_TO_GREEN_ORIGINAL_CLAIM_RECOVERY' if passed else 'FAILED_TARGETED_REPRODUCTION','onlyNewTest':True,'stableSuiteRerun':False,'fixtureRemoved':removed,'fixtureNetwork':'none','guardDefinitionSHA256':'41e240f6bd952c95066184fdc916d3fe19bf836eec77f78dcf7a52e69314b1b6','elapsedSeconds':round(time.monotonic()-started,3),'limits':'Unrelated Guest/Core/Source qualification helpers deny; positive admission uses the actual candidate only. No Hosted acceptance.'}
 (root/'docs/ops/auth-c04-20261103/link-read-state-context/ISOLATED_PG_RESULT.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt))
 if not passed or not removed:raise SystemExit(1)
