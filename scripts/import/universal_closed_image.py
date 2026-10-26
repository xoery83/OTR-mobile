#!/usr/bin/env python3
"""One exact DEV image swap. Default prepare; no SQL, Auth, Provider or runtime edits."""
import argparse
import datetime
import fcntl
import hashlib
import hmac
import inspect
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'dev'))
from metadata_closed_retry import redact, environment_projection, diagnostics

BASELINE = 'sha256:6b11b6ba350cdf0cf72a9776c4420f129cc51bcab1a74a82456994588738cc95'
CANDIDATE = 'sha256:99966a4069268e8f0bc4c200d08b7ac8443e35aa4858fac03cec1869c46091e4'
BUNDLES = {'server.mjs':'90015fb2a1f87b5604419f4be24b75e579e53029282ecbec56a36244c0b6b058', 'server-capture.mjs':'08dbb04259de5372e667c1f2da7ab69a3179c84d1d5eb1276ddb9590b3968b27', 'universal-prepare.mjs':'2f8c65bb7b68a0e5b66aebddd5e79a9dea0f8da322697386ee1b690e62d67eeb'}

# Authoritative sustained runtime ATTEMPT4 + FINAL_DEV_BACKEND_EXACT_RECONCILED.
MOUNTS = [
 ('/run/otr-r3a5-catalog/catalog-reader.json','/run/otr/catalog-reader.json',False),
 ('/opt/otr/dev-backend/private/capture-custody','/var/lib/otr/capture-custody',True),
 ('/opt/otr/dev-backend/env/capture-custody.json','/run/otr/capture-custody.json',False),
 ('/opt/otr/dev-backend/env/c-finite-388c0c3594e95bcc941eadee175bce8c93cb98f5d39199528c37ad4afac2df11/create.json','/run/otr/trip-create-runtime.json',False),
]


def approved_mounts(mounts):
    assert len(mounts)==4 and all(m['Type']=='bind' for m in mounts)
    assert sorted((m['Source'],m['Destination'],m['RW']) for m in mounts)==sorted(MOUNTS)


def directory_metadata(path):
    assert path==MOUNTS[1][0]
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        info=os.fstat(fd);assert stat.S_ISDIR(info.st_mode)
        return {'path':path,'uid':info.st_uid,'gid':info.st_gid,'mode':stat.S_IMODE(info.st_mode),'device':info.st_dev,'inode':info.st_ino}
    finally:os.close(fd)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def instant(value):
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def validate(gate):
    assert gate['version'] == 1 and gate['project'] == 'tuqigdxrvrerfewsxqgm'
    assert gate['baselineImage'] == BASELINE and gate['candidateImage'] == CANDIDATE
    assert gate['candidateBundles'] == BUNDLES
    assert str(uuid.UUID(gate['activationId'])) == gate['activationId']
    assert gate['releaseDirectory'] == '/opt/otr/dev-backend/releases/universal-closed-' + gate['activationId']
    assert 0 < instant(gate['expiresAt']) - instant(gate['startsAt']) <= 900
    for key in ('operatorSHA256','diagnosticsHelperSHA256','remoteProgramSHA256'):
        assert re.fullmatch('[a-f0-9]{64}',gate[key])
    base = gate['baseline']
    for key in ('environmentSHA256', 'rawHostConfigSHA256', 'mountsSHA256', 'captureBundleSHA256'):
        assert re.fullmatch('[a-f0-9]{64}', base[key])
    assert base['captureBundleSHA256'] == 'a221ab978039fad46f7eb69914153692228c467ee2cd559280da1463b3ee02d9'
    assert len(base['composeFiles']) == len(set(base['composeFiles'])) > 0
    assert set(base['composeFiles']) == set(base['composeHashes'])
    assert set(base['privateFiles'])=={src for src,_,rw in MOUNTS if not rw}
    assert base['custodyDirectory']['path']==MOUNTS[1][0]
    for path, value in {**base['composeHashes'], **{k:v['sha256'] for k,v in base['privateFiles'].items()}}.items():
        assert (path.startswith('/opt/otr/dev-backend/') or path==MOUNTS[0][0]) and '..' not in Path(path).parts
        assert re.fullmatch('[a-f0-9]{64}', value)
    assert gate['ownerAuthorized'] in (True, False)


def check_snapshot(gate, snapshot, image, active=False):
    base = gate['baseline']
    env = dict(v.split('=', 1) for v in snapshot['Config']['Env'])
    assert len(env) == len(snapshot['Config']['Env'])
    assert snapshot['Image'] == image
    assert snapshot['Config']['User'] == 'otr' and snapshot['Config']['Cmd'] == ['node','server-capture.mjs']
    assert env.get('OTR_DEV_SUPABASE_URL') == 'https://tuqigdxrvrerfewsxqgm.supabase.co'
    assert env.get('OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT') != 'enabled'
    assert digest(env) == base['environmentSHA256']
    # Raw HostConfig is deliberately not sorted/normalized: no semantic relaxation.
    assert digest(snapshot['HostConfig']) == base['rawHostConfigSHA256']
    mounts = snapshot['Mounts']
    approved_mounts(mounts)
    assert {m['Source'] for m in mounts if not m['RW']} == set(base['privateFiles'])
    assert digest(sorted(mounts, key=lambda m:m['Destination'])) == base['mountsSHA256']
    files = snapshot['Config']['Labels']['com.docker.compose.project.config_files'].split(',')
    assert files == base['composeFiles'] + ([gate['releaseDirectory'] + '/image.yml'] if active else [])


def save(root, name, value, exclusive=True, authorize_publish=None):
    # Publish only complete fsynced JSON. Exclusive hard-link prevents overwriting
    # an execution/restore claim; readers never observe a partial acceptance.
    temporary=root/('.'+name+'.'+uuid.uuid4().hex)
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'w') as stream:
            json.dump(value,stream);stream.flush();os.fsync(stream.fileno())
        assert exclusive
        if authorize_publish:authorize_publish()
        os.link(temporary,root/name)
    finally:temporary.unlink(missing_ok=True)
    fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)


def read_private(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 131072
        return stream.read(), info


class Docker:
    def __init__(self, gate): self.gate = gate
    def call(self, args, **kwargs): return subprocess.check_output(args, timeout=8, stderr=subprocess.PIPE, **kwargs)
    def current(self): return json.loads(self.call(['docker','inspect','otr-dev-backend']))[0]
    def files(self):
        base = self.gate['baseline']
        assert directory_metadata(MOUNTS[1][0])==base['custodyDirectory']
        secrets = {}
        for path, expected in base['composeHashes'].items():
            raw, _ = read_private(path); assert hashlib.sha256(raw).hexdigest() == expected
        for path, expected in base['privateFiles'].items():
            raw, info = read_private(path)
            assert hashlib.sha256(raw).hexdigest() == expected['sha256']
            assert [info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)] == [expected['uid'], expected['gid'], expected['mode']]
            # Read only, redaction in memory; no runtime content or key persisted.
            try:
                def collect(value):
                    if isinstance(value, dict):
                        for k,v in value.items():
                            if isinstance(v,str) and re.search('password|secret|token|key|bearer',k,re.I): secrets[k+str(len(secrets))]=v
                            collect(v)
                    elif isinstance(value,list):
                        for v in value: collect(v)
                collect(json.loads(raw))
            except (ValueError, UnicodeError): pass
        assert not Path('/run/otr/universal-runtime.json').exists()
        return secrets
    def compose(self, active, suffix):
        args = ['docker','compose','-p','dev-backend']
        for path in self.gate['baseline']['composeFiles'] + ([self.gate['releaseDirectory']+'/image.yml'] if active else []): args += ['-f',path]
        env = dict(os.environ, OTR_DEV_BACKEND_REVIEWED_IMAGE_ID=BASELINE)
        return subprocess.check_output(args+suffix, env=env, timeout=35, stderr=subprocess.PIPE)
    def render(self):
        before=json.loads(self.compose(False,['config','--no-env-resolution','--format','json']))['services']['backend']
        after=json.loads(self.compose(True,['config','--no-env-resolution','--format','json']))['services']['backend']
        assert before['image']==BASELINE and before['command']==['node','server-capture.mjs']
        assert after==dict(before,image=CANDIDATE)
        for image in (BASELINE,CANDIDATE):
            assert json.loads(self.call(['docker','image','inspect',image]))[0]['Id']==image
    def swap(self, active): self.compose(active,['up','-d','--no-build','--pull','never','backend'])
    def verify(self, active):
        image=CANDIDATE if active else BASELINE
        snapshot=self.current();check_snapshot(self.gate,snapshot,image,active);self.files()
        assert snapshot['State'].get('Health',{}).get('Status')=='healthy'
        assert json.load(urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=3))=={'status':'ok','environment':'development'}
        bundles=BUNDLES if active else {'server-capture.mjs':self.gate['baseline']['captureBundleSHA256']}
        for name, expected in bundles.items():
            assert hashlib.sha256(self.call(['docker','exec','otr-dev-backend','cat','/app/'+name])).hexdigest()==expected
        if active:
            id='11111111-1111-4111-8111-111111111111'
            for path in ('/v2/trips/'+id+'/metadata','/v2/trips/'+id+'/ledger/bootstrap','/v2/import-batches/'+id+'/interpretations?tripId='+id):
                try: result=urllib.request.urlopen('http://127.0.0.1:8787'+path,timeout=3); status=result.status;result.close()
                except urllib.error.HTTPError as error: status=error.code;error.close()
                assert status==401
            assert json.loads(self.call(['docker','exec','otr-dev-backend','node','universal-prepare.mjs','--recover-only']))=={'status':'CLOSED'}
    def wait(self, active):
        deadline=time.monotonic()+40
        while True:
            try:self.verify(active);return
            except Exception:
                if time.monotonic()>=deadline:raise
                time.sleep(.5)
    def diagnostic(self):
        snapshot=self.current();env=dict(v.split('=',1) for v in snapshot['Config']['Env']);env.update(self.files())
        logs=subprocess.run(['docker','logs','--tail','80','otr-dev-backend'],capture_output=True,timeout=8)
        assert logs.returncode==0
        return diagnostics(snapshot,(logs.stdout+logs.stderr).decode(errors='replace'),env,os.urandom(32))


def restore(gate, root, io):
    # Shared lock is held. One claim across inline failure and independent watchdog.
    try:save(root,'restore-claimed.json',{'gateSHA256':digest(gate)})
    except FileExistsError:
        if (root/'restore-result.json').exists():
            raw,_=read_private(root/'restore-result.json');result=json.loads(raw)
            assert result['gateSHA256']==digest(gate)
            return result
        return {'status':'RECONCILE_REQUIRED','reason':'RESTORE_ALREADY_CLAIMED_NO_RETRY'}
    try:
        snapshot=io.current()
        if snapshot['Image']==BASELINE:
            check_snapshot(gate,snapshot,BASELINE);io.wait(False)
        else:
            check_snapshot(gate,snapshot,CANDIDATE,True);io.files()
            # Diagnostics must precede rollback; preserve a gap without losing safe restoration.
            try:save(root,'candidate-diagnostic.json',io.diagnostic())
            except Exception:save(root,'diagnostic-gap.json',{'status':'DIAGNOSTIC_UNAVAILABLE'})
            try:io.swap(False)
            except Exception:pass # UNKNOWN: read back; never a second compose attempt.
            io.wait(False)
        result={'status':'CLOSED_FAILED_ROLLED_BACK','gateSHA256':digest(gate),'baselineImage':BASELINE}
    except Exception:result={'status':'RECONCILE_REQUIRED','gateSHA256':digest(gate)}
    save(root,'restore-result.json',result)
    return result


def deploy(gate, root, io, arm):
    assert gate['ownerAuthorized'] is True
    started=time.monotonic()
    deadline=started+min(900,instant(gate['expiresAt'])-time.time())
    def within_window():
        assert instant(gate['startsAt'])<=time.time()<instant(gate['expiresAt']) and time.monotonic()<deadline
    assert instant(gate['startsAt'])<=time.time() and instant(gate['expiresAt'])-time.time()>=240
    io.verify(False);io.render()
    save(root,'before-diagnostic.json',io.diagnostic())
    save(root,'attempt-claimed.json',{'gateSHA256':digest(gate)})
    arm() # Independent process acknowledges readiness before any service change.
    assert instant(gate['expiresAt'])-time.time()>=240
    try:
        try:io.swap(True)
        except Exception:pass # A reply loss may still have applied; inspect instead of retry.
        io.wait(True)
        assert time.time()<instant(gate['expiresAt'])
        save(root,'candidate-diagnostic.json',io.diagnostic())
        within_window()
        result={'status':'CLOSED_DEPLOYMENT_PASS','gateSHA256':digest(gate),'image':CANDIDATE,'acceptedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-started}
        save(root,'accepted.json',result,authorize_publish=within_window)
        within_window() # A slow atomic publication must not hand off after expiry.
        return result
    except Exception:
        if (root/'accepted.json').exists():
            os.rename(root/'accepted.json',root/'rejected-acceptance.json')
        return restore(gate,root,io)


def locked(gate, root, action):
    info=root.lstat();assert stat.S_ISDIR(info.st_mode) and not root.is_symlink() and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o700
    lock=os.open('/run/lock/otr-c-finite-service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
    try:
        info=os.fstat(lock);assert stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o600
        deadline=time.monotonic()+60
        while True:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);break
            except BlockingIOError:
                if time.monotonic()>=deadline:raise RuntimeError('SERVICE_LOCK_TIMEOUT')
                time.sleep(.05)
        if (root/'accepted.json').exists():
            raw,_=read_private(root/'accepted.json');result=json.loads(raw)
            valid=(result.get('status')=='CLOSED_DEPLOYMENT_PASS' and result.get('gateSHA256')==digest(gate) and result.get('image')==CANDIDATE and isinstance(result.get('elapsedSeconds'),(int,float)) and 0<=result['elapsedSeconds']<=900 and isinstance(result.get('acceptedAt'),str) and instant(gate['startsAt'])<=instant(result['acceptedAt'])<instant(gate['expiresAt']))
            if valid:Docker(gate).verify(True);return result
            if action!='restore':return {'status':'RECONCILE_REQUIRED','reason':'INVALID_OR_LATE_ACCEPTANCE'}
        if action=='read':
            if (root/'restore-result.json').exists():
                raw,_=read_private(root/'restore-result.json');result=json.loads(raw)
                assert result['gateSHA256']==digest(gate)
                if result['status']=='CLOSED_FAILED_ROLLED_BACK':Docker(gate).verify(False)
                return result
            return {'status':'RECONCILE_REQUIRED','reason':'NO_VERIFIED_RESULT_NO_MUTATION'}
        if action=='restore':return restore(gate,root,Docker(gate))
        def arm():
            child=subprocess.Popen([sys.executable,str(root/'operator.py'),'watch',str(root)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)
            end=time.monotonic()+3
            while not (root/'watch-ready.json').exists():
                if child.poll() is not None or time.monotonic()>=end:raise RuntimeError('WATCHDOG_NOT_READY')
                time.sleep(.02)
            raw,_=read_private(root/'watch-ready.json');assert json.loads(raw)=={'gateSHA256':digest(gate)}
        return deploy(gate,root,Docker(gate),arm)
    finally:fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)


def remote(gate, source):
    validate(gate);assert gate['ownerAuthorized'] is True
    assert hashlib.sha256(source.encode()).hexdigest()==gate['remoteProgramSHA256']
    root=Path(gate['releaseDirectory']);root.mkdir(mode=0o700)
    save(root,'plan.json',gate);save(root,'image.yml',{'services':{'backend':{'image':CANDIDATE}}})
    fd=os.open(root/'operator.py',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream:stream.write(source);stream.flush();os.fsync(stream.fileno())
    return locked(gate,root,'deploy')


def watch(root):
    info=root.lstat();assert stat.S_ISDIR(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o700
    raw,info=read_private(root/'plan.json');assert info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600
    gate=json.loads(raw);validate(gate);assert str(root)==gate['releaseDirectory'] and gate['ownerAuthorized'] is True
    program,info=read_private(root/'operator.py');assert info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600 and hashlib.sha256(program).hexdigest()==gate['remoteProgramSHA256']
    save(root,'watch-ready.json',{'gateSHA256':digest(gate)})
    deadline=time.monotonic()+min(900,max(0,instant(gate['expiresAt'])-time.time()))
    while time.time()<instant(gate['expiresAt']) and time.monotonic()<deadline:
        time.sleep(min(.2,max(0,min(deadline-time.monotonic(),instant(gate['expiresAt'])-time.time()))))
    try:result=locked(gate,root,'restore')
    except Exception:result={'status':'RECONCILE_REQUIRED','gateSHA256':digest(gate)}
    save(root,'watch-result.json',result)
    print(json.dumps(result))


def capture_baseline():
    # Explicit read-only qualification. No raw Env/runtime/config body escapes.
    snapshot=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend'],timeout=8))[0]
    assert snapshot['Image']==BASELINE and snapshot['Config']['User']=='otr' and snapshot['Config']['Cmd']==['node','server-capture.mjs']
    assert snapshot['State'].get('Health',{}).get('Status')=='healthy'
    mounts=snapshot['Mounts'];approved_mounts(mounts)
    env=dict(v.split('=',1) for v in snapshot['Config']['Env'])
    assert env.get('OTR_DEV_SUPABASE_URL')=='https://tuqigdxrvrerfewsxqgm.supabase.co' and env.get('OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT')!='enabled'
    assert not any('universal' in m['Destination'] for m in mounts)
    files=snapshot['Config']['Labels']['com.docker.compose.project.config_files'].split(',')
    result={'environmentSHA256':digest(env),'rawHostConfigSHA256':digest(snapshot['HostConfig']),'mountsSHA256':digest(sorted(mounts,key=lambda m:m['Destination'])),'composeFiles':files,'composeHashes':{},'privateFiles':{},'custodyDirectory':directory_metadata(MOUNTS[1][0])}
    for path in files+[m['Source'] for m in mounts if not m['RW']]:
        assert (path.startswith('/opt/otr/dev-backend/') or path==MOUNTS[0][0]) and '..' not in Path(path).parts
        raw,info=read_private(path);hashed=hashlib.sha256(raw).hexdigest()
        if path in files:result['composeHashes'][path]=hashed
        else:result['privateFiles'][path]={'sha256':hashed,'uid':info.st_uid,'gid':info.st_gid,'mode':stat.S_IMODE(info.st_mode)}
    result['captureBundleSHA256']=hashlib.sha256(subprocess.check_output(['docker','exec','otr-dev-backend','cat','/app/server-capture.mjs'],timeout=8)).hexdigest()
    assert result['captureBundleSHA256']=='a221ab978039fad46f7eb69914153692228c467ee2cd559280da1463b3ee02d9'
    return result


def remote_source():
    functions=(redact,environment_projection,diagnostics,digest,instant,approved_mounts,directory_metadata,validate,check_snapshot,save,read_private,Docker,restore,deploy,locked,remote,watch)
    return 'import datetime,fcntl,hashlib,hmac,json,os,re,stat,subprocess,sys,time,urllib.error,urllib.request,uuid\nfrom pathlib import Path\n'+f'BASELINE={BASELINE!r}\nCANDIDATE={CANDIDATE!r}\nBUNDLES={BUNDLES!r}\nMOUNTS={MOUNTS!r}\n'+'\n\n'.join(inspect.getsource(f) for f in functions)+'\nif __name__=="__main__":\n if len(sys.argv)>1 and sys.argv[1]=="watch":watch(Path(sys.argv[2]))\n else:\n  gate,source,action=json.load(sys.stdin)\n  if action=="read":\n   root=Path(gate["releaseDirectory"])\n   raw,info=read_private(root/"plan.json")\n   assert json.loads(raw)==gate and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600\n   print(json.dumps(locked(gate,root,"read")))\n  else:print(json.dumps(remote(gate,source)))\n'


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--gate',type=Path);parser.add_argument('--gate-sha256');parser.add_argument('--capture-baseline',action='store_true');parser.add_argument('--execute-approved-closed-image-only',action='store_true');parser.add_argument('--read-only-reconcile',action='store_true');args=parser.parse_args()
    if args.capture_baseline:
        assert not args.execute_approved_closed_image_only and not args.read_only_reconcile
        source='import hashlib,json,os,stat,subprocess\nfrom pathlib import Path\n'+f'BASELINE={BASELINE!r}\nMOUNTS={MOUNTS!r}\n'+'\n\n'.join(inspect.getsource(f) for f in (digest,read_private,approved_mounts,directory_metadata,capture_baseline))+'\nprint(json.dumps(capture_baseline()))'
        result=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','python3 -c '+shlex.quote(source)],capture_output=True,text=True,timeout=40)
        assert result.returncode==0
        print(json.dumps({'status':'READ_ONLY_BASELINE_CAPTURED_NOT_AUTHORIZED','baseline':json.loads(result.stdout)}));return
    assert args.gate and args.gate_sha256
    raw=args.gate.read_bytes();assert hashlib.sha256(raw).hexdigest()==args.gate_sha256
    gate=json.loads(raw);validate(gate)
    assert gate['operatorSHA256']==hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    assert gate['diagnosticsHelperSHA256']==hashlib.sha256((Path(__file__).resolve().parents[1]/'dev/metadata_closed_retry.py').read_bytes()).hexdigest()
    assert gate['remoteProgramSHA256']==hashlib.sha256(remote_source().encode()).hexdigest()
    assert not (args.execute_approved_closed_image_only and args.read_only_reconcile)
    if not args.execute_approved_closed_image_only and not args.read_only_reconcile:
        print(json.dumps({'status':'PREPARED_NOT_EXECUTED','candidateImage':CANDIDATE}));return
    assert gate['ownerAuthorized'] is True
    source=remote_source()
    result=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','python3 -c '+shlex.quote(source)],input=json.dumps([gate,source,"read" if args.read_only_reconcile else "deploy"]),capture_output=True,text=True,timeout=240)
    if result.returncode:raise RuntimeError('REMOTE_OUTCOME_UNKNOWN_RECONCILE_DO_NOT_RETRY')
    print(json.dumps(json.loads(result.stdout)))


if __name__=='__main__':
    try:main()
    except Exception:print(json.dumps({'status':'RECONCILE_REQUIRED'}));sys.exit(2)
