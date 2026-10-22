#!/usr/bin/env python3
"""Only the current B container plus two exact finite read-only runtime mounts."""
import hashlib, inspect, json, os, pathlib, shlex, subprocess, sys, fcntl, time, stat
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'dev'))
from metadata_closed_retry import diagnostics, environment_projection, redact
from control import load_plan, IMAGE, BUNDLE

def remote_locked(p,action,secret):
    def command(a): return subprocess.check_output(a,timeout=8,text=True)
    def current(): return json.loads(command(['docker','inspect','otr-dev-backend']))[0]
    def env(s): return dict(v.split('=',1) for v in s['Config']['Env'])
    def mounts(s): return sorted([(m['Source'],m['Destination'],m['RW']) for m in s['Mounts']])
    def canonical(v): return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    def instant(v): return datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
    root=Path('/opt/otr/dev-backend/env/c-finite-'+p['windowId'])
    before=current(); baseline=p['baseline']; expectedMounts=sorted([(m['source'],m['destination'],m['rw']) for m in baseline['mounts']])
    assert before['Image']==p['image'] and before['Config']['User']=='otr' and before['Config']['Cmd']==['node','server-capture.mjs']
    assert baseline['environmentSHA256']=='cf397ec1ef52c1960f2dfc2a13dd45f4f4a43309d95a3254fe429dde05f9854f'
    assert canonical(env(before))==baseline['environmentSHA256']
    assert canonical(baseline['hostConfig'])=='f07262129504a60512ee369db9ac89f3cc666c473f68e7128b4ecfa8c66142e0'
    if action=='activate':
        assert before['State'].get('Health',{}).get('Status')=='healthy'
        assert hashlib.sha256(subprocess.check_output(['docker','exec','otr-dev-backend','cat','/app/server-capture.mjs'],timeout=8)).hexdigest()==p['bundle']
    for f,h in baseline['configHashes'].items(): assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h
    files=list(baseline['configHashes'])
    def compose(extra):
        a=['docker','compose','-p','dev-backend']
        for f in files+extra: a+=['-f',str(f)]
        return a
    composeEnv=dict(os.environ,OTR_DEV_BACKEND_REVIEWED_IMAGE_ID=p['image'])
    def render(extra): return json.loads(subprocess.check_output(compose(extra)+['config','--no-env-resolution','--no-interpolate','--format','json'],env=composeEnv,timeout=8))['services']['backend']
    base=render([])
    assert base['image']==p['image'] and base['command']==['node','server-capture.mjs']
    allowed={'/run/otr/trip-create-runtime.json','/run/otr/trip-metadata-runtime.json'}
    extras=[m for m in before['Mounts'] if m['Destination'] in allowed]
    assert mounts(before)==sorted(expectedMounts+[(m['Source'],m['Destination'],m['RW']) for m in extras])
    # A delayed old watchdog cannot touch another window's mounts/config/container.
    assert all(m['Source'].startswith(str(root)+'/') and m['RW'] is False for m in extras)
    beforeNormalized=dict(before['HostConfig']); beforeNormalized['Binds']=baseline['hostConfig']['Binds']
    assert beforeNormalized==baseline['hostConfig']
    identity=root/'window.json'
    if root.exists(): assert json.loads(identity.read_text())=={'windowId':p['windowId']}
    else:
        assert not extras; root.mkdir(mode=0o700); identity.write_text(json.dumps({'windowId':p['windowId']})); os.chmod(identity,0o600)
    forward=root/'finite.yml'
    custody=Path('/opt/otr/dev-backend/env/capture-custody.json').read_bytes()
    assert hashlib.sha256(custody).hexdigest()==baseline['custodySHA256'] and instant(json.loads(custody)['expiresAt'])<=time.time()
    changed=False; good=False; report={'windowId':p['windowId'],'action':action,'verified':False}
    def capture(snapshot):
        logs=subprocess.run(['docker','logs','--tail','80','otr-dev-backend'],capture_output=True,text=True,timeout=8)
        if logs.returncode: raise RuntimeError('C_DIAGNOSTIC_GAP')
        secretEnvironment=env(before)
        if secret.get('password'): secretEnvironment['C_NEW_PASSWORD']=secret['password']
        for k in ('create','metadata'):
            runtime=root/(k+'.json')
            if runtime.exists():
                cfg=json.loads(runtime.read_text()); secretEnvironment['C_'+k+'_PASSWORD']=cfg['tripPg' if k=='create' else 'metadataPg']['password']
        result=diagnostics(snapshot,logs.stdout+logs.stderr,env(before),os.urandom(32))
        def clean(value):
            if isinstance(value,str): return redact(value,secretEnvironment)
            if isinstance(value,list): return [clean(v) for v in value]
            if isinstance(value,dict): return {k:clean(v) for k,v in value.items()}
            return value
        return clean(result)
    report['beforeDiagnosticCaptured']=False; report['beforeDiagnosticPersisted']=False
    try:
        report['beforeDiagnostic']=capture(before); report['beforeDiagnosticCaptured']=True
        # Redaction has already happened in memory. Persist/fsync BEFORE replacing the container.
        stem='before-'+action+'-'+str(time.time_ns()); temporary=root/(stem+'.tmp'); final=root/(stem+'.json')
        fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as stream:
            json.dump({'windowId':p['windowId'],'action':action,'beforeDiagnostic':report['beforeDiagnostic']},stream);stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,final)
        directory=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
        report['beforeDiagnosticPath']=str(final);report['beforeDiagnosticPersisted']=True
    except Exception: pass
    try:
        if action=='activate':
            assert p['ownerAuthorized'] is True and instant(p['startsAt'])<=time.time()<instant(p['expiresAt'])
            custody=Path('/opt/otr/dev-backend/env/capture-custody.json').read_bytes()
            assert hashlib.sha256(custody).hexdigest()==baseline['custodySHA256'] and instant(json.loads(custody)['expiresAt'])<=time.time()
            kind=secret['kind']; assert kind in ('create','metadata')
            runtime=root/(kind+'.json'); assert not runtime.exists()
            request=p['payloads']['create' if kind=='create' else 'editProposal']['body']
            config={'version':1,'enabled':True,'expiresAt':p['expiresAt'],'actorAccountId':p['actorIds']['A'],'request':request,('tripPg' if kind=='create' else 'metadataPg'):{'host':'db.tuqigdxrvrerfewsxqgm.supabase.co','port':5432,'database':'postgres','password':secret['password']}}
            fd=os.open(runtime,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o440)
            with os.fdopen(fd,'w') as f: json.dump(config,f)
            os.chown(runtime,0,999); os.chmod(runtime,0o440)
            volumes=[]
            for k in ('create','metadata'):
                path=root/(k+'.json')
                if path.exists(): volumes.append({'type':'bind','source':str(path),'target':'/run/otr/trip-'+('create' if k=='create' else 'metadata')+'-runtime.json','read_only':True})
            forward.write_text(json.dumps({'services':{'backend':{'volumes':volumes}}})); os.chmod(forward,0o600)
            candidate=render([str(forward)])
            assert {k:v for k,v in base.items() if k!='volumes'}=={k:v for k,v in candidate.items() if k!='volumes'}
            assert len(candidate['volumes'])==len(base['volumes'])+len(volumes)
            # HostConfig additions only Binds; every other field remains exactly baseline.
            assert instant(p['startsAt'])<=time.time()<instant(p['expiresAt'])
            extra=[str(forward)]
        else: extra=[]
        changed=True
        r=subprocess.run(compose(extra)+['up','-d','--no-build','--pull','never','backend'],env=composeEnv,capture_output=True,timeout=30)
        deadline=time.monotonic()+40
        while time.monotonic()<deadline:
            s=current()
            if s['State'].get('Health',{}).get('Status')=='healthy': break
            time.sleep(.5)
        s=current(); normalized=dict(s['HostConfig']); normalized['Binds']=baseline['hostConfig']['Binds']
        good=(r.returncode==0 and s['State'].get('Health',{}).get('Status')=='healthy' and s['Image']==p['image'] and env(s)==env(before) and s['Config']['Cmd']==['node','server-capture.mjs'] and normalized==baseline['hostConfig'])
        health=json.load(urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=4))
        good=good and health=={'status':'ok','environment':'development'}
        report['bundleSHA256']=hashlib.sha256(subprocess.check_output(['docker','exec','otr-dev-backend','cat','/app/server-capture.mjs'],timeout=8)).hexdigest()
        good=good and report['bundleSHA256']==p['bundle']
        if action=='restore': good=good and mounts(s)==expectedMounts and s['HostConfig']==baseline['hostConfig']
        else:
            expectedExtras=sorted([(v['source'],v['target'],False) for v in volumes])
            good=good and mounts(s)==sorted(expectedMounts+expectedExtras)
            for v in volumes:
                body=json.loads(Path(v['source']).read_text())
                k='create' if v['target']=='/run/otr/trip-create-runtime.json' else 'metadata'
                good=good and body['request']==p['payloads']['create' if k=='create' else 'editProposal']['body'] and body['actorAccountId']==p['actorIds']['A'] and body['expiresAt']==p['expiresAt']
                stat=Path(v['source']).stat()
                good=good and stat.st_uid==0 and stat.st_gid==999 and (stat.st_mode&0o777)==0o440 and stat.st_nlink==1
                report.setdefault('runtimeSHA256',{})[v['target']]=hashlib.sha256(Path(v['source']).read_bytes()).hexdigest()
        report.update(health=health,image=s['Image'],environmentSHA256=canonical(env(s)),mountsMatch=bool(good),mounts=[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW']} for m in s['Mounts']],normalizedHostConfigSHA256=canonical(normalized),hostConfigSHA256=canonical(s['HostConfig']),user=s['Config']['User'],entry=s['Config']['Cmd'])
    except Exception: good=False
    finally:
        # Preserve ONLY sanitized diagnostics before caller's SQL-close/service restoration.
        try:
            s=current(); report['diagnostic']=capture(s)
            report['diagnosticCaptured']=True
        except Exception: good=False; report['diagnosticCaptured']=False
        report['restorationVerified']=bool(good) if action=='restore' else False
        good=good and report['beforeDiagnosticCaptured'] and report['beforeDiagnosticPersisted']
        report['verified']=bool(good)
        # After verified restoration unlink only this window's two private runtime secrets.
        if action=='restore' and good and root.exists():
            for k in ('create','metadata'): (root/(k+'.json')).unlink(missing_ok=True)
        if root.exists():
            evidence=root/('service-'+action+'-'+str(time.time_ns())+'.json')
            evidence.write_text(json.dumps(report)); os.chmod(evidence,0o600)
    return report

def remote(p,action,secret):
    lock=Path('/run/lock/otr-c-finite-service.lock')
    fd=os.open(lock,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
    try:
        info=os.fstat(fd)
        assert stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and info.st_nlink==1 and (info.st_mode&0o777)==0o600
        deadline=time.monotonic()+60
        while True:
            try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB); break
            except BlockingIOError:
                if time.monotonic()>=deadline: raise RuntimeError('C_SERVICE_LOCK_TIMEOUT_RECONCILE')
                time.sleep(.05)
        # All compose operations and diagnostics are serialized; after waiting, the inner
        # activation rechecks absolute UTC before any mount/compose change.
        return remote_locked(p,action,secret)
    finally:
        fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)

def main():
    p=load_plan(sys.argv[2]); assert p['manifestSHA256']==sys.argv[3] and p['ownerAuthorized'] is True
    secret=json.load(sys.stdin); action=sys.argv[1]; assert action in ('activate','restore')
    p['payloads']=json.loads(pathlib.Path(__file__).with_name('proposed-payloads.json').read_text())
    remoteCode='import json,sys,hashlib,hmac,re,os,subprocess,time,urllib.request,datetime,fcntl,stat\nfrom pathlib import Path\n'+'\n\n'.join(inspect.getsource(f) for f in (redact,environment_projection,diagnostics,remote_locked,remote))+"\np,action,secret=json.load(sys.stdin)\nprint(json.dumps(remote(p,action,secret)))"
    r=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','python3 -c '+shlex.quote(remoteCode)],input=json.dumps([p,action,secret]),capture_output=True,text=True,timeout=240)
    if r.returncode: raise RuntimeError('C_SERVICE_TRANSPORT_RECONCILE_REQUIRED')
    result=json.loads(r.stdout); print(json.dumps(result)); sys.exit(0 if result['verified'] else 2)
if __name__=='__main__':
    try: main()
    except Exception: print(json.dumps({'verified':False,'status':'RECONCILE_REQUIRED'})); sys.exit(2)
