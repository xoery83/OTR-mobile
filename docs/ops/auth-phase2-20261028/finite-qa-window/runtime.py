"""Root-only single-QA Host control; SQL remains a separate Root transport.

Reuse the reviewed retained-container deployment sequence. No credential loader,
new mount, image build, business command, DDL or GRANT. Timer independently closes SQL and runtime after its exact helper Gate is approved.
"""
import argparse, contextlib, datetime as dt, fcntl, hashlib, http.client, json
import math, os, re, socket, stat, subprocess, time, uuid
from pathlib import Path

ACTOR='71b94800-f860-4685-a5d4-954adae38113'
GUEST='d6b17e95-b6cd-4816-9c61-daa9d0acdc8f'
BASE='65b0ce911653cb8893b632a0d1ef011273b06ac978e63fb330e05e50299a5d46'
IMAGE='sha256:4d2109213ad3394d736a43301faf7cc9de9bd1da4213fbf875780f5e2e41c68d'
ENV='ab5dc0e7026482daa398a7cdc5046ea1a414f65c37ee081386a8e238acb73057'
canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')).encode()
sha=lambda v:hashlib.sha256(canonical(v)).hexdigest()
def instant(v):
    assert isinstance(v,str) and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z',v),'UTC_REQUIRED'
    return dt.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
def validate(p, now=None, starting=False):
    assert p['project']=='tuqigdxrvrerfewsxqgm' and p['accountId']==ACTOR and p['sourceGuestLocalId']==GUEST
    assert str(uuid.UUID(p['windowId']))==p['windowId']
    assert p['baseline']['containerId']==BASE and p['baseline']['image']==IMAGE and p['baseline']['environmentSHA256']==ENV
    assert p['root']=='/opt/otr/dev-backend/releases/auth-qa-'+p['windowId']
    assert 0<instant(p['expiresAt'])-instant(p['readyAt'])<=1800
    if starting:
        remaining=instant(p['expiresAt'])-(time.time() if now is None else now)
        assert 0<remaining<=1800,'WINDOW_EXPIRED_OR_TOO_LONG'
    return p

def private(path, maximum=262144):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        s=os.fstat(stream.fileno())
        assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size<=maximum
        return stream.read()
def save(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(canonical(value));stream.flush();os.fsync(stream.fileno())
def call(args,input=None):return subprocess.check_output(args,input=input,stderr=subprocess.PIPE,timeout=45).decode()
def inspect(name):return json.loads(call(['docker','inspect',name]))[0]
def env(s):
    e=dict(v.split('=',1) for v in s['Config']['Env']);assert len(e)==len(s['Config']['Env']);return e
def mounts(s):return sorted((v['Source'],v['Destination'],v['RW']) for v in s['Mounts'])
def check_base(p,s,healthy=False):
    b=p['baseline'];assert s['Id']==BASE and s['Image']==IMAGE
    assert sha(s['Config'])==b['configSHA256'] and sha(s['HostConfig'])==b['hostConfigSHA256'] and sha(mounts(s))==b['mountsSHA256']
    assert sha(env(s))==ENV and env(s).get('OTR_DEV_AUTH_GUEST_ADOPTION','0')=='0' and 'OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE' not in env(s)
    for path,h in {**b['configHashes'],**b['mountedFileHashes']}.items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==h,'CONFIG_FILE_DRIFT'
    if healthy:assert s['State'].get('Health',{}).get('Status')=='healthy'
def active_config(p,base):
    e=env(base);e.update(OTR_DEV_AUTH_GUEST_ADOPTION='1',OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE=canonical({k:p[k] for k in ['accountId','sourceGuestLocalId','expiresAt']}).decode())
    return dict(base['Config'],Env=[k+'='+v for k,v in e.items()])
def check_active(p,s,state):
    base=inspect(BASE);check_base(p,base)
    assert s['Id']==state['candidateId'] and s['Image']==IMAGE and s['Config']==active_config(p,base)
    assert sha(s['HostConfig'])==p['baseline']['hostConfigSHA256'] and sha(mounts(s))==p['baseline']['mountsSHA256']
    return base
class Docker(http.client.HTTPConnection):
    def connect(self):
        self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(20);self.sock.connect('/var/run/docker.sock')
def stage(p):
    validate(p,starting=True);base=inspect('otr-dev-backend');check_base(p,base,True)
    assert not call(['systemctl','list-units','otr-auth-qa-close-*.timer','--state=active','--no-legend','--plain']).strip(),'OTHER_AUTH_CLOSE_TIMER_ACTIVE'
    name='otr-auth-qa-'+p['windowId']
    assert not call(['docker','ps','-aq','--filter','name=^/'+name+'$']).strip(),'CANDIDATE_EXISTS_RECONCILE'
    client=Docker('localhost',timeout=20)
    client.request('POST','/v1.44/containers/create?name='+name,canonical({**active_config(p,base),'HostConfig':base['HostConfig']}),{'Content-Type':'application/json'})
    response=client.getresponse();raw=response.read();client.close()
    assert response.status==201,'CREATE_UNKNOWN_RECONCILE_NO_RETRY'
    candidate=inspect(json.loads(raw)['Id']);state={'candidateId':candidate['Id']}
    check_active(p,candidate,state);assert candidate['State']['Status']=='created'
    save(Path(p['root'])/'state.json',state)
    return {'status':'STAGED_NOT_STARTED_SQL_UNCHANGED',**state}
def health():
    import urllib.request
    assert json.load(urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=4))=={'status':'ok','environment':'development'}
def wait_healthy(identity):
    end=time.monotonic()+40
    while time.monotonic()<end:
        s=inspect(identity)
        if s['State'].get('Health',{}).get('Status')=='healthy':health();return s
        time.sleep(1)
    raise RuntimeError('HEALTH_TIMEOUT')
def current():
    ids=call(['docker','ps','-aq','--no-trunc','--filter','name=^/otr-dev-backend$']).splitlines()
    assert len(ids)<=1,'CURRENT_SERVICE_AMBIGUOUS'
    return inspect(ids[0]) if ids else None

def known(p,state):
    base=inspect(BASE);check_base(p,base)
    assert base['Name'] in ['/otr-dev-backend','/otr-auth-qa-default-'+p['windowId']]
    candidate=inspect(state['candidateId']);check_active(p,candidate,state)
    assert candidate['Name'] in ['/otr-dev-backend','/otr-auth-qa-'+p['windowId'],'/otr-auth-qa-closed-'+p['windowId']]
    live=current();assert live is None or live['Id'] in [BASE,state['candidateId']],'FOREIGN_CURRENT_SERVICE'
    return base,candidate,live

def sql_control(p,state,mode):
    base,candidate,live=known(p,state)
    target=live or base
    # At a partial rename point the retained baseline may be stopped; SQL can fail
    # independently, but runtime containment below must still run.
    bundle=private(Path(p['root'])/'close-control.cjs',2097152)
    assert hashlib.sha256(bundle).hexdigest()==p['closeBundleSHA256']
    result=json.loads(call(['docker','exec','-i',target['Id'],'node','-',mode],input=bundle))
    assert result=={'status':'AUTH_QA_POLICY_CLOSED','closed':True},'SQL_CLOSURE_UNCONFIRMED'
    return result

def close_runtime(p,state):
    base,candidate,live=known(p,state)
    if candidate['State']['Running']:call(['docker','stop','--time','10',candidate['Id']])
    if candidate['Name']=='/otr-dev-backend':call(['docker','rename',candidate['Id'],'otr-auth-qa-closed-'+p['windowId']])
    if base['Name']!='/otr-dev-backend':call(['docker','rename',BASE,'otr-dev-backend'])
    if not inspect(BASE)['State']['Running']:call(['docker','start',BASE])
    check_base(p,wait_healthy(BASE),True)
    return {'runtimeClosed':True,'containerId':BASE,'environmentSHA256':ENV}

def close(p,state):
    outcomes={}
    for name,work in [('policyBefore',lambda:sql_control(p,state,'close')),('runtime',lambda:close_runtime(p,state)),('policyAfter',lambda:sql_control(p,state,'verify'))]:
        try:outcomes[name]=work()
        except Exception:outcomes[name]={'verified':False}
    verified=outcomes['runtime'].get('runtimeClosed') is True and outcomes['policyAfter'].get('closed') is True
    if not verified:raise RuntimeError('SQL_OR_RUNTIME_CLOSURE_UNCONFIRMED')
    return {'status':'AUTH_QA_CLOSED_VERIFIED','verified':True,'steps':outcomes}
def arm(p,plan_hash):
    validate(p,starting=True)
    state=json.loads(private(Path(p['root'])/'state.json'));sql_control(p,state,'verify')
    remaining=math.ceil(instant(p['expiresAt'])-time.time());unit='otr-auth-qa-close-'+p['windowId']
    call(['systemd-run','--unit='+unit,'--on-active='+str(remaining)+'s','--timer-property=AccuracySec=1s','--property=Type=oneshot','--property=TimeoutStartSec=240s','--property=UMask=0077','--property=Restart=on-failure','--property=RestartSec=5s','--property=StartLimitIntervalSec=0','/usr/bin/python3',p['root']+'/runtime.py','close',p['root']+'/plan.json',plan_hash])
    assert call(['systemctl','show',unit+'.timer','--property=ActiveState','--value']).strip()=='active','TIMER_NOT_ARMED'
    return {'status':'INDEPENDENT_CLOSE_TIMER_ARMED','unit':unit+'.timer','expiresAt':p['expiresAt']}
def start(p,state):
    validate(p,starting=True)
    assert os.environ.get('OTR_AUTH_QA_SERIAL_WINDOW_ACK')==p['windowId'],'ROOT_SQL_AND_GUI_ACK_REQUIRED'
    assert call(['systemctl','show','otr-auth-qa-close-'+p['windowId']+'.timer','--property=ActiveState','--value']).strip()=='active','CLOSE_TIMER_REQUIRED'
    base=inspect('otr-dev-backend');check_base(p,base,True);candidate=inspect(state['candidateId']);check_active(p,candidate,state)
    assert candidate['State']['Status']=='created'
    try:
        call(['docker','stop','--time','10',BASE]);call(['docker','rename',BASE,'otr-auth-qa-default-'+p['windowId']])
        call(['docker','rename',candidate['Id'],'otr-dev-backend']);call(['docker','start',candidate['Id']])
        check_active(p,wait_healthy(candidate['Id']),state)
        validate(p,starting=True)
        return {'status':'FINITE_QA_RUNTIME_HEALTHY','accountId':ACTOR,'sourceGuestLocalId':GUEST,'expiresAt':p['expiresAt']}
    except Exception:
        # Each outcome must be reconciled; never replace source/receipt state.
        try:close(p,state)
        except Exception:raise RuntimeError('RUNTIME_ROLLBACK_UNCONFIRMED')
        raise
@contextlib.contextmanager
def locked():
    fd=os.open('/run/lock/otr-universal-finite-service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        s=os.fstat(fd);assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);yield
    finally:os.close(fd)
def main():
    a=argparse.ArgumentParser();a.add_argument('mode',choices=['stage','arm','start','close','verify']);a.add_argument('plan',type=Path);a.add_argument('sha256');args=a.parse_args()
    assert os.getuid()==0;raw=private(args.plan);assert hashlib.sha256(raw).hexdigest()==args.sha256
    p=validate(json.loads(raw));assert args.plan==Path(p['root'])/'plan.json'
    assert hashlib.sha256(private(Path(p['root'])/'runtime.py')).hexdigest()==p['runtimeSHA256']
    state_path=Path(p['root'])/'state.json'
    with locked():
        if args.mode=='stage':result=stage(p)
        elif args.mode=='arm':result=arm(p,args.sha256)
        else:
            state=json.loads(private(state_path))
            if args.mode=='start':result=start(p,state)
            elif args.mode=='close':result=close(p,state)
            else:
                s=inspect('otr-dev-backend')
                if s['Id']==BASE:check_base(p,s,True)
                else:check_active(p,s,state)
                result={'status':'RUNTIME_IDENTITY_VERIFIED','defaultClosed':s['Id']==BASE,'containerId':s['Id'],'policyClosed':'REQUIRES_SEPARATE_SQL_VERIFICATION'}
    print(json.dumps(result))
if __name__=='__main__':
    try:main()
    except Exception:print(json.dumps({'status':'AUTH_QA_CONTROL_UNCONFIRMED','reconcileRequired':True}));raise SystemExit(1)
