#!/usr/bin/env python3
"""Exact Universal private mount removal; preserves the supplied Trip/P1 baseline."""
import fcntl
import hashlib
import inspect
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import time
import uuid

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def sha(value):return hashlib.sha256(value).hexdigest()
def validate_runtime(plan):
    r=plan['runtime'];activation=plan['activationId']
    if str(uuid.UUID(activation))!=activation:raise ValueError('ACTIVATION_ID')
    root='/opt/otr/dev-backend/env/universal-finite-'+activation
    if r['container']!='otr-dev-backend' or r['runtimeSource']!=root+'/runtime.json' or r['finiteComposeFile']!=root+'/finite.yml':raise ValueError('EXACT_RUNTIME_PATH')
    if not re.fullmatch('sha256:[0-9a-f]{64}',r['imageId']):raise ValueError('IMAGE_PIN')
    for k in ['runtimeSHA256','finiteComposeSHA256','baselineEnvironmentSHA256','activeEnvironmentSHA256','baselineHostConfigSHA256','activeHostConfigSHA256','baselineMountsSHA256','activeMountsSHA256']:
        if not re.fullmatch('[0-9a-f]{64}',r[k]):raise ValueError('RUNTIME_PREIMAGE_REQUIRED')
    files=r['baselineComposeFiles']
    if not isinstance(files,list) or not files or len(set(files))!=len(files) or set(files)!=set(r['composeHashes']):raise ValueError('BASELINE_COMPOSE_PINS')
    for f,h in r['composeHashes'].items():
        if not f.startswith('/opt/otr/dev-backend/') or '..' in Path(f).parts or f==r['finiteComposeFile'] or not re.fullmatch('[0-9a-f]{64}',h):raise ValueError('COMPOSE_PATH')
    return r

def service_projection(snapshot):
    # Return hashes only; never export raw environment/credentials from inspect.
    return {
        'environmentSHA256':sha(canonical(sorted(snapshot['Config']['Env']))),
        'hostConfigSHA256':sha(canonical(snapshot['HostConfig'])),
        'mountsSHA256':sha(canonical(sorted(snapshot['Mounts'],key=lambda m:(m['Destination'],m['Source'])))),
    }

def remote_close(plan):
    r=validate_runtime(plan)
    def call(args,environment=None):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=35,env=environment)
    def current():return json.loads(call(['docker','inspect',r['container']]))[0]
    def labels(s):return s['Config'].get('Labels',{}).get('com.docker.compose.project.config_files','').split(',')
    def private_hash(path,expected,mode):
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            s=os.fstat(fd)
            if mode==0o440 and s.st_gid!=999:raise ValueError('PRIVATE_RUNTIME_GROUP')
            if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or (mode is not None and s.st_mode&0o777!=mode or mode is None and s.st_mode&0o022!=0):raise ValueError('PRIVATE_RUNTIME_FILE')
            with os.fdopen(fd,'rb',closefd=False) as f:actual=sha(f.read(262145))
            if actual!=expected:raise ValueError('RUNTIME_HASH_DRIFT')
        finally:os.close(fd)
    def check(s,active):
        if s['Image']!=r['imageId'] or s['Config']['User']!='otr' or s['Config']['Cmd']!=['node','server-capture.mjs']:raise ValueError('SERVICE_IDENTITY_DRIFT')
        projection=service_projection(s)
        prefix='active' if active else 'baseline'
        if projection['environmentSHA256']!=r[prefix+'EnvironmentSHA256'] or projection['hostConfigSHA256']!=r[prefix+'HostConfigSHA256'] or projection['mountsSHA256']!=r[prefix+'MountsSHA256']:raise ValueError('SERVICE_PREIMAGE_DRIFT')
        expected=r['baselineComposeFiles']+([r['finiteComposeFile']] if active else [])
        if labels(s)!=expected:raise ValueError('COMPOSE_IDENTITY_DRIFT')
        extra=[m for m in s['Mounts'] if m['Destination']=='/run/otr/universal-runtime.json']
        if active:
            if len(extra)!=1 or extra[0]['Source']!=r['runtimeSource'] or extra[0]['RW'] is not False:raise ValueError('FINITE_MOUNT_DRIFT')
        elif extra:raise ValueError('UNIVERSAL_MOUNT_REMAINS')
    lock=os.open('/run/lock/otr-universal-finite-service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
    try:
        ls=os.fstat(lock)
        if not stat.S_ISREG(ls.st_mode) or ls.st_uid!=0 or ls.st_nlink!=1 or ls.st_mode&0o777!=0o600:raise ValueError('SERVICE_LOCK')
        until=time.monotonic()+10
        while True:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);break
            except BlockingIOError:
                if time.monotonic()>=until:raise RuntimeError('SERVICE_LOCK_UNCONFIRMED')
                time.sleep(.1)
        before=current();active=any(m['Destination']=='/run/otr/universal-runtime.json' for m in before['Mounts'])
        check(before,active)
        directory=Path(r['runtimeSource']).parent
        if directory.exists() or directory.is_symlink():
            d=directory.lstat()
            if directory.is_symlink() or not stat.S_ISDIR(d.st_mode) or d.st_uid!=0 or d.st_mode&0o777!=0o700:raise ValueError('PRIVATE_WINDOW_DIRECTORY')
        elif active:raise ValueError('PRIVATE_WINDOW_DIRECTORY_MISSING')
        for path,h in r['composeHashes'].items():private_hash(path,h,None)
        for path,h,mode in [(r['runtimeSource'],r['runtimeSHA256'],0o440),(r['finiteComposeFile'],r['finiteComposeSHA256'],0o600)]:
            if Path(path).exists() or Path(path).is_symlink():private_hash(path,h,mode)
            elif active:raise ValueError('MOUNT_FILE_MISSING')
        if active:
            args=['docker','compose','-p','dev-backend']
            for f in r['baselineComposeFiles']:args+=['-f',f]
            environment=dict(os.environ,OTR_DEV_BACKEND_REVIEWED_IMAGE_ID=r['imageId'])
            base=json.loads(call(args+['config','--no-env-resolution','--format','json'],environment))['services']['backend']
            if base['image']!=r['imageId'] or base['command']!=['node','server-capture.mjs']:raise ValueError('BASELINE_RENDER_DRIFT')
            # UNKNOWN compose outcome is reconciled by inspect/health; never rerun up.
            try:call(args+['up','-d','--no-deps','backend'],environment)
            except subprocess.SubprocessError:pass
        after=current();check(after,False)
        for _ in range(30):
            if current()['State'].get('Health',{}).get('Status')=='healthy':break
            time.sleep(.5)
        else:raise RuntimeError('RESTORED_HEALTH_UNCONFIRMED')
        check(current(),False)
        for path,h,mode in [(r['runtimeSource'],r['runtimeSHA256'],0o440),(r['finiteComposeFile'],r['finiteComposeSHA256'],0o600)]:
            if Path(path).exists() or Path(path).is_symlink():
                private_hash(path,h,mode);os.unlink(path)
        if Path(r['runtimeSource']).exists() or Path(r['finiteComposeFile']).exists():raise ValueError('FINITE_SECRET_REMAINS')
        return {'verified':True,'windowId':plan['windowId']}
    finally:
        fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)

def close_runtime(plan):
    validate_runtime(plan)
    code='import fcntl,hashlib,json,os,re,stat,subprocess,time,uuid\nfrom pathlib import Path\n'+'\n\n'.join(inspect.getsource(f) for f in [canonical,sha,validate_runtime,service_projection,remote_close])+"\nprint(json.dumps(remote_close(json.load(__import__('sys').stdin))))"
    result=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','python3 -c '+shlex.quote(code)],input=json.dumps(plan),capture_output=True,text=True,timeout=140)
    if result.returncode:raise RuntimeError('UNIVERSAL_RUNTIME_CLOSE_UNCONFIRMED')
    return json.loads(result.stdout)
