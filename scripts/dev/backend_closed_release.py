"""Existing closed DEV Writer release, bound to an immutable per-release packet."""
import base64, hashlib, importlib.util, json, os, re, shlex, subprocess, sys, time
from pathlib import Path

REQUEST=Path(sys.argv[2]).absolute()
RUN=REQUEST.parent
D=RUN
REMOTE_PORT=Path(__file__).resolve().parents[1] / 'import/universal_continuous_runtime_ports.py'
REMOTE_SHA='6083eb747a0ce40c4567521f4c711ddbdd3a224aad433e712c6925ead8b265f5'

def filehash(p):
    with p.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()

def require(ok, code):
    if not ok: raise ValueError(code)

def fixed(path, expected):
    data=path.read_bytes()
    require(path.resolve()==path and hashlib.sha256(data).hexdigest()==expected,'ARTIFACT_DRIFT')
    return data

def record(name,value):
    with (RUN/name).open('x') as f:
        json.dump(value,f,indent=2)
        f.write('\n');f.flush();os.fsync(f.fileno())
    fd=os.open(RUN,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)

def read(name):
    return json.loads((RUN/name).read_text())

REQ_SHA=sys.argv[3]
req=json.loads(fixed(REQUEST,REQ_SHA))
require(re.fullmatch(r'[a-f0-9]{32}',req['executionId']),'EXECUTION_ID')
require(req['project']=='tuqigdxrvrerfewsxqgm','DEV_SCOPE')
require(re.fullmatch(r'[a-f0-9]{40}',req['sourceCommit']),'SOURCE_COMMIT')
require(re.fullmatch(r'sha256:[a-f0-9]{64}',req['candidateImage']),'IMAGE_ID')
require(req['effects']=={'sqlWrites':0,'providerCalls':0,'businessWindowOpened':False},'CLOSED_ONLY')
require(isinstance(req['sqlOrder'],list),'SQL_ARTIFACTS')
require(set(req['artifactPins']) in ({'release.py','deploy-plan.json'}, {'release.py','deploy-plan.json','probe.mjs'}),'ARTIFACT_SET')

def pin(name):
    r=req['artifactPins'][name]
    p=Path(r['path'])
    require(p.parent==D and p.name==name,'ARTIFACT_PATH')
    return fixed(p,r['sha256'])
plan=json.loads(pin('deploy-plan.json'))
candidate=plan['candidateImage']
digest_fields = ('beforeConfigSHA256','beforeHostConfigSHA256','beforeEnvironmentSHA256',
                 'beforeMountsSHA256','caddySHA256')
require(all(re.fullmatch(r'[a-f0-9]{64}',plan[key]) for key in digest_fields),'HOST_PREIMAGE')
require(all(type(plan[key]) is int and plan[key]>0 for key in
            ('writerDevice','writerInode','caddySocketDevice','caddySocketInode')),'HOST_IDENTITY')
require(isinstance(plan['mountedFileHashes'],dict) and all(Path(path).is_absolute()
            and re.fullmatch(r'[a-f0-9]{64}',sha)
            for path,sha in plan['mountedFileHashes'].items()),'MOUNTED_FILE_PINS')
require(isinstance(plan['protectedRoutes'],list) and plan['protectedRoutes'] and all(
            isinstance(entry,list) and len(entry)==2 and entry[1]==401
            and isinstance(entry[0],str) and re.fullmatch(r'/[A-Za-z0-9_./-]+',entry[0])
            and not entry[0].startswith('//') and '..' not in entry[0].split('/')
            for entry in plan['protectedRoutes']),'PROTECTED_ROUTES')
require(candidate==req['candidateImage'] and plan['sourceCommit']==req['sourceCommit'],'IMAGE_PIN')
require(re.fullmatch(r'[a-f0-9]{64}',plan['beforeContainerId']) and
        re.fullmatch(r'sha256:[a-f0-9]{64}',plan['beforeImage']),'RETAINED_CID_PIN')
names=(plan['containerName'],plan['backupName'])
require(len(set(names))==2 and all(re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}',name)
        and name!='otr-dev-backend' for name in names),'CONTAINER_NAMES')
require(plan['bundles'] and all(re.fullmatch(r'[A-Za-z0-9_-]+\.mjs',name)
        and re.fullmatch(r'[a-f0-9]{64}',sha) for name,sha in plan['bundles'].items()),'BUNDLE_PINS')
require(bool(plan.get('probe')) == ('probe.mjs' in req['artifactPins']),'PROBE_PRESENCE')
if plan.get('probe'):
    require(req['artifactPins']['probe.mjs']['sha256']==plan['probe']['stdin']['sha256'],'PROBE_PIN')
require(pin('release.py')==Path(__file__).with_name('backend_closed_release_host.py').read_bytes(),'HOST_ENTRY_DRIFT')

def existing_port():
    fixed(REMOTE_PORT,REMOTE_SHA)
    spec=importlib.util.spec_from_file_location('existing_ssh_port',REMOTE_PORT)
    port=importlib.util.module_from_spec(spec);spec.loader.exec_module(port)
    return port

def ssh():
    return ['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',existing_port().HOST]
HOSTDIR='/opt/otr/dev-backend/build/dev-backend-'+req['executionId']
LOCK='/run/lock/otr-universal-finite-service.lock'
identity=(plan['writerDevice'],plan['writerInode'])

def phase(name):
    intent=read('execution.json')
    require(intent['requestSHA256']==REQ_SHA,'EXECUTION_ID_DRIFT')
    require(not (RUN/(name+'.intent')).exists(),'ALREADY_DISPATCHED_RECONCILE_ONLY')
    record(name+'.intent',{'requestSHA256':REQ_SHA,'started':int(time.time())})

STAGE=r"""
import base64,fcntl,hashlib,json,os,re,stat,subprocess,sys
from pathlib import Path
data=json.loads(sys.stdin.buffer.readline(1800000))
def inspect(*args):
    return json.loads(subprocess.check_output(['/usr/bin/docker','inspect',*args],timeout=10))
def hash_file(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
root=Path(data['root']);base=root.parent
s=base.lstat()
assert root.parent==Path('/opt/otr/dev-backend/build') and re.fullmatch(r'dev-backend-[a-f0-9]{32}',root.name)
assert base.resolve()==base and stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022
fd=os.open('/run/lock/otr-universal-finite-service.lock',os.O_RDWR|os.O_NOFOLLOW)
st=os.fstat(fd)
assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and [st.st_dev,st.st_ino]==data['lock']
fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
old,=inspect('--type','container','otr-dev-backend')
assert old['Id']==data['old'] and old['State']['Health']['Status']=='healthy'
root.mkdir(mode=0o700)
for name,item in data['files'].items():
    assert name in ('release.py','deploy-plan.json','probe.mjs')
    raw=base64.b64decode(item['body'],validate=True)
    assert hashlib.sha256(raw).hexdigest()==item['sha']
    with (root/name).open('xb') as f:
        os.fchmod(f.fileno(),0o600);f.write(raw);f.flush();os.fsync(f.fileno())
sys.path.insert(0,str(root))
from release import verify_closed
g=json.loads((root/'deploy-plan.json').read_text())
verify_closed(g)
path=root/'images.tar.gz'
left=data['archive']['bytes']
assert type(left) is int and 0<left<=250000000
with path.open('xb') as f:
    os.fchmod(f.fileno(),0o600)
    while left:
        chunk=sys.stdin.buffer.read(min(1048576,left))
        assert chunk,'ARCHIVE_EOF'
        f.write(chunk);left-=len(chunk)
    f.flush();os.fsync(f.fileno())
assert not sys.stdin.buffer.read(1)
assert hash_file(path)==data['archive']['sha256'],'ARCHIVE_DIGEST'
subprocess.run(['/usr/bin/docker','load','-i',str(path)],check=True,capture_output=True,timeout=100)
row,=inspect('--type','image',data['backend'])
assert (row['Id'],row['Architecture'],row['Os'])==(data['backend'],'amd64','linux')
verify_closed(g)
print(json.dumps({'status':'IMAGE_STAGED_CLOSED','backend':data['backend']}))
"""

def stage():
    archive=req['archive']; ap=Path(archive['path'])
    require(ap.stat().st_size==archive['bytes'] and filehash(ap)==archive['sha256'],'ARCHIVE_LOCAL_DRIFT')
    artifacts={name:{'body':base64.b64encode(pin(name)).decode(),'sha':req['artifactPins'][name]['sha256']} for name in req['artifactPins']}
    phase('stage')
    data={'root':HOSTDIR,'old':plan['beforeContainerId'],
          'archive':archive,'backend':candidate,'lock':identity,'files':artifacts}
    record('stage-input.json',{'archiveSHA256':archive['sha256'],'images':[candidate]})
    header=RUN/'stage.header'
    with header.open('x') as f: f.write(json.dumps(data,separators=(',',':'))+'\n')
    with subprocess.Popen(['/bin/cat',str(header),str(ap)],stdout=subprocess.PIPE) as stream:
        try:
            r=subprocess.run([*ssh(),shlex.join(['/usr/bin/python3','-I','-B','-c',STAGE])],
                stdin=stream.stdout,capture_output=True,text=True,timeout=450)
        finally:
            stream.stdout.close()
            if stream.poll() is None: stream.terminate()
    if r.returncode:
        # Emit only validated exception class or exit code from the host.
        record('stage.failure.json',{'exit':r.returncode,'errorClass':'STAGE_REMOTE_EXIT'})
        raise ValueError('STAGE_RECONCILE')
    result=json.loads(r.stdout)
    require(result=={'status':'IMAGE_STAGED_CLOSED','backend':candidate},'STAGE_READBACK')
    record('stage.receipt',result); print(json.dumps(result),flush=True)

def switch():
    require(read('stage.receipt')['status']=='IMAGE_STAGED_CLOSED','STAGE_REQUIRED')
    phase('switch')
    verify_release=r'''
import hashlib,os,stat,sys
from pathlib import Path
release=Path(sys.argv[1])
assert release.resolve()==release and release.parent.stat().st_uid==0
fd=os.open(release,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
with os.fdopen(fd,'rb') as stream:
    st=os.fstat(stream.fileno())
    assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600
    raw=stream.read(131073)
assert len(raw)<=131072 and hashlib.sha256(raw).hexdigest()==sys.argv[2],'RELEASE_HASH'
sys.argv=[str(release),*sys.argv[3:]]
exec(compile(raw,str(release),'exec'),{'__name__':'__main__','__file__':str(release)})
'''
    args=['/usr/bin/python3','-I','-B','-c',verify_release,HOSTDIR+'/release.py',req['artifactPins']['release.py']['sha256'],
          HOSTDIR+'/deploy-plan.json',req['artifactPins']['deploy-plan.json']['sha256']]
    r=subprocess.run([*ssh(),shlex.join(args)],capture_output=True,text=True,timeout=300)
    try:
        result=json.loads(r.stdout)
        require(isinstance(result,dict),'SWITCH_REPLY_SHAPE')
    except ValueError:
        record('switch.failure.json',{'exit':r.returncode,'errorClass':'SWITCH_REPLY_UNVERIFIED'})
        raise ValueError('SWITCH_RECONCILE') from None
    record('switch.receipt',result)
    if result.get('status')=='ROLLED_BACK':
        record('closure.json',{'status':'CLOSED_RELEASE_ROLLED_BACK','host':result['deliveryTrace'],'providerCalls':0,'sqlWrites':0,'businessWindowOpened':False})
        print(json.dumps(read('closure.json')),flush=True)
        raise ValueError('CLOSED_RELEASE_ROLLED_BACK')
    require(r.returncode==0 and result.get('result',{}).get('status')=='DEV_DEFAULT_CLOSED_SOFTWARE_DEPLOYED','SWITCH_RECONCILE')
    require(result['result']['image']==candidate,'SWITCH_IMAGE')
    print(json.dumps({'status':'BACKEND_SWITCHED_WORKERS_UNCHANGED','cid':result['result']['containerId'],'image':candidate}),flush=True)

def independent_host(expect_cid):
    code="g="+repr(plan)+"\nexpected="+repr(expect_cid)+"\nroot="+repr(HOSTDIR)+"\nrelease_sha="+repr(req['artifactPins']['release.py']['sha256'])+"\n"+r"""
import hashlib,json,subprocess,sys
from pathlib import Path
sys.path.insert(0,root)
release=Path(root)/'release.py'
assert hashlib.sha256(release.read_bytes()).hexdigest()==release_sha,'INDEPENDENT_RELEASE_DRIFT'
from release import verify_closed,verify_http,inspect,environment,digest
v=inspect('otr-dev-backend')
assert v['Id']==expected and v['Image']==g['candidateImage'] and v['State']['Health']['Status']=='healthy'
assert digest(environment(v))==g['beforeEnvironmentSHA256']
verify_closed(g);verify_http(g)
for name,want in g['bundles'].items():
 assert hashlib.sha256(subprocess.check_output(['/usr/bin/docker','exec',expected,'cat','/app/'+name],timeout=10)).hexdigest()==want
locks=json.loads(subprocess.check_output(['/usr/bin/lslocks','--json','-o','PATH'],timeout=8))['locks'] or []
assert not any(row.get('path')=='/run/lock/otr-universal-finite-service.lock' for row in locks)
print(json.dumps({'status':'INDEPENDENT_HOST_CLOSED','cid':v['Id'],'image':v['Image']}))
"""
    result=subprocess.run([*ssh(),'/usr/bin/python3 -I -B -'],input=code,capture_output=True,text=True,timeout=70)
    require(result.returncode==0,'INDEPENDENT_HOST_UNCONFIRMED')
    return json.loads(result.stdout)


if __name__=='__main__':
    require(__debug__,'UNSAFE_PYTHON_OPTIMIZATION')
    os.umask(0o077)
    for name in req['artifactPins']:pin(name)
    for item in req['sqlOrder']:
        require(filehash(Path(item['path']))==item['sha256'],'SQL_ARTIFACT_DRIFT')
    fixed(REMOTE_PORT,REMOTE_SHA)
    archive=Path(req['archive']['path'])
    require(archive.resolve()==archive and archive.stat().st_size==req['archive']['bytes']
            and filehash(archive)==req['archive']['sha256'],'ARCHIVE_LOCAL_DRIFT')
    root=Path(__file__).resolve().parents[2]
    commit=subprocess.check_output(
        ['git','-C',str(root),'rev-parse','--verify',req['sourceCommit']+'^{commit}'],
        text=True,timeout=5,
    ).strip()
    require(commit==req['sourceCommit'],'SOURCE_COMMIT_DRIFT')
    mode=sys.argv[1]
    if mode=='check':
        print('ALL_FIXED_INPUTS_MATCH')
    elif mode=='release':
        start=int(time.time())
        record('execution.json',{'requestSHA256':REQ_SHA,'start':start})
        try:
            stage()
            switch()
            ack=read('switch.receipt')['result']
            readback=independent_host(ack['containerId'])
            require(readback['status']=='INDEPENDENT_HOST_CLOSED' and readback['image']==candidate,'INDEPENDENT_CLOSE')
        except Exception as error:
            if not (RUN/'closure.json').exists():
                record('closure.json',{'status':'RECONCILE_REQUIRED','errorClass':type(error).__name__,'providerCalls':0,'sqlWrites':0,'businessWindowOpened':False})
                print(json.dumps(read('closure.json')),flush=True)
            raise
        record('closure.json',{'status':'DEFAULT_CLOSED_INSTALLED','host':readback,'decoder':ack['decoder'],'providerCalls':0,'sqlWrites':0,'businessWindowOpened':False})
        print(json.dumps(read('closure.json')),flush=True)
    else: raise ValueError('INVALID_PHASE')
