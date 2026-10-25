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
    target=r.get('runtimeMountTarget','/run/otr/universal-runtime.json')
    if target not in ['/run/otr/universal-runtime.json','/run/otr/universal-recovery.json']:raise ValueError('EXACT_RUNTIME_MOUNT_TARGET')
    if target=='/run/otr/universal-recovery.json':
        selection=r.get('recoverySettings')
        if not isinstance(selection,dict) or selection.get('version')!=1 or selection.get('configSHA256')!=r.get('runtimeSHA256') or selection.get('startsAt')!=plan.get('startsAt'):raise ValueError('SETTLED_RECOVERY_BINDING_REQUIRED')
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
    if 'createdHostConfigSHA256' in r and (not re.fullmatch('[0-9a-f]{64}',r['createdHostConfigSHA256']) or 'originalContainerId' not in r):raise ValueError('CREATED_HOSTCONFIG_PIN')
    metadata=r.get('baselineComposeFileMetadata',{})
    if not isinstance(metadata,dict) or any(path not in r['composeHashes'] or not isinstance(m,dict) or set(m)!={'uid','gid','mode','nlink'} or m['uid']!=0 or m['gid']!=0 or m['nlink']!=1 or type(m['mode']) is not int or m['mode'] not in [0o400,0o440,0o600,0o640,0o644,0o660,0o664] for path,m in metadata.items()):raise ValueError('BASELINE_FILE_METADATA_PIN')
    if metadata and 'originalContainerId' not in r:raise ValueError('METADATA_REQUIRES_RETAINED_ORIGINAL')
    retained={'originalContainerId','backupContainerName','baselineConfigSHA256','activeConfigSHA256'}
    if retained.intersection(r):
        if not retained.issubset(r) or not re.fullmatch('[0-9a-f]{64}',r['originalContainerId']) or r['backupContainerName']!='otr-universal-original-'+activation:raise ValueError('EXACT_RETAINED_ORIGINAL_REQUIRED')
        for key in ['baselineConfigSHA256','activeConfigSHA256']:
            if not re.fullmatch('[0-9a-f]{64}',r[key]):raise ValueError('RETAINED_CONFIG_PREIMAGE_REQUIRED')
    return r

def retained_state(plan,call,check):
    r=plan['runtime']
    def lookup(name,kind='name'):
        selector='^/'+name+'$' if kind=='name' else name
        ids=call(['docker','container','ls','--all','--no-trunc','--format','{{.ID}}','--filter',kind+'='+selector]).strip().splitlines()
        if not ids:return None
        if len(ids)!=1 or not re.fullmatch('[0-9a-f]{64}',ids[0]):raise ValueError('CONTAINER_LOOKUP_UNCONFIRMED')
        value=json.loads(call(['docker','inspect',ids[0]]))[0]
        if value['Id']!=ids[0] or kind=='name' and value['Name']!='/'+name:raise ValueError('CONTAINER_LOOKUP_DRIFT')
        return value
    original=lookup(r['originalContainerId'],'id')
    if original is None:raise ValueError('RETAINED_ORIGINAL_MISSING')
    check(original,False)
    if original['Name'] not in ['/'+r['container'],'/'+r['backupContainerName']]:raise ValueError('ORIGINAL_NAME_DRIFT')
    if original['Name']=='/'+r['backupContainerName'] and original['State'].get('Running',False):raise ValueError('RETAINED_BACKUP_UNEXPECTEDLY_RUNNING')
    current=lookup(r['container'])
    backup=lookup(r['backupContainerName'])
    if backup is not None and backup['Id']!=r['originalContainerId']:raise ValueError('BACKUP_IDENTITY_DRIFT')
    if current is not None:
        if current['Id']==r['originalContainerId']:
            if backup is not None:raise ValueError('DUPLICATE_ORIGINAL_NAME')
        else:
            if original['Name']!='/'+r['backupContainerName']:raise ValueError('ORIGINAL_NOT_RETAINED')
            check(current,True)
    elif original['Name']!='/'+r['backupContainerName']:raise ValueError('ORIGINAL_NAME_UNCONFIRMED')
    return current,original,lookup

def restore_retained(plan,call,check,read_only=False):
    r=plan['runtime'];current,original,lookup=retained_state(plan,call,check)
    needed=current is None or current['Id']!=r['originalContainerId'] or not original['State'].get('Running',False)
    if needed and read_only:raise RuntimeError('READ_ONLY_RUNTIME_STILL_ACTIVE')
    if not needed:return
    if current is not None and current['Id']!=r['originalContainerId']:
        candidate=current['Id']
        # All mutations use exact IDs. UNKNOWN outcomes are only inspected, never retried.
        if current['State'].get('Running',False):
            try:call(['docker','stop','--time','10',candidate])
            except subprocess.SubprocessError:pass
        stopped=lookup(candidate,'id')
        if stopped is None:raise RuntimeError('CANDIDATE_DISAPPEARED_BEFORE_REMOVE')
        check(stopped,True)
        if stopped['State'].get('Running',False):raise RuntimeError('CANDIDATE_STOP_UNCONFIRMED')
        # No force or volumes option: retained baseline and shared volumes cannot be removed.
        try:call(['docker','rm',candidate])
        except subprocess.SubprocessError:pass
        if lookup(candidate,'id') is not None:raise RuntimeError('CANDIDATE_REMOVE_UNCONFIRMED')
    original=lookup(r['originalContainerId'],'id');check(original,False)
    if original['Name']=='/'+r['backupContainerName']:
        if lookup(r['container']) is not None:raise ValueError('SERVICE_NAME_COLLISION')
        try:call(['docker','rename',r['originalContainerId'],r['container']])
        except subprocess.SubprocessError:pass
        original=lookup(r['originalContainerId'],'id');check(original,False)
        if original['Name']!='/'+r['container']:raise RuntimeError('ORIGINAL_RENAME_UNCONFIRMED')
    if not original['State'].get('Running',False):
        try:call(['docker','start',r['originalContainerId']])
        except subprocess.SubprocessError:pass
        original=lookup(r['originalContainerId'],'id');check(original,False)
        if original['Name']!='/'+r['container'] or not original['State'].get('Running',False):raise RuntimeError('ORIGINAL_START_UNCONFIRMED')

def service_projection(snapshot):
    # Return hashes only; never export raw environment/credentials from inspect.
    return {
        'environmentSHA256':sha(canonical(sorted(snapshot['Config']['Env']))),
        'hostConfigSHA256':sha(canonical(snapshot['HostConfig'])),
        'mountsSHA256':sha(canonical(sorted(snapshot['Mounts'],key=lambda m:(m['Destination'],m['Source'])))),
    }

def remote_close(plan,read_only=False):
    r=validate_runtime(plan)
    def call(args,environment=None):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=35,env=environment)
    def current():return json.loads(call(['docker','inspect',r['container']]))[0]
    def labels(s):return s['Config'].get('Labels',{}).get('com.docker.compose.project.config_files','').split(',')
    def private_hash(path,expected,mode,metadata=None):
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            s=os.fstat(fd)
            if metadata is not None and any(getattr(s,'st_'+key)!=value for key,value in metadata.items() if key!='mode'):raise ValueError('BASELINE_FILE_METADATA_DRIFT')
            if metadata is not None:mode=metadata['mode']
            if metadata is None and mode==0o440 and s.st_gid!=999:raise ValueError('PRIVATE_RUNTIME_GROUP')
            if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or (mode is not None and s.st_mode&0o777!=mode or mode is None and s.st_mode&0o022!=0):raise ValueError('PRIVATE_RUNTIME_FILE')
            with os.fdopen(fd,'rb',closefd=False) as f:actual=sha(f.read(262145))
            if actual!=expected:raise ValueError('RUNTIME_HASH_DRIFT')
        finally:os.close(fd)
    def check(s,active):
        if s['Image']!=r['imageId'] or s['Config']['User']!='otr' or s['Config']['Cmd']!=['node','server-capture.mjs']:raise ValueError('SERVICE_IDENTITY_DRIFT')
        projection=service_projection(s)
        prefix='active' if active else 'baseline'
        expected_host=r[prefix+'HostConfigSHA256']
        if active and s['State'].get('Status')=='created' and not s['State'].get('Running',False):expected_host=r.get('createdHostConfigSHA256',expected_host)
        if projection['environmentSHA256']!=r[prefix+'EnvironmentSHA256'] or projection['hostConfigSHA256']!=expected_host or projection['mountsSHA256']!=r[prefix+'MountsSHA256']:raise ValueError('SERVICE_PREIMAGE_DRIFT')
        if 'originalContainerId' in r:
            if sha(canonical(s['Config']))!=r[prefix+'ConfigSHA256']:raise ValueError('RETAINED_CONFIG_DRIFT')
            if not active and s['Id']!=r['originalContainerId']:raise ValueError('RETAINED_ORIGINAL_ID_DRIFT')
            if active:
                marker=s['Config'].get('Labels',{})
                if marker.get('io.otr.universal.activation')!=plan['activationId'] or marker.get('io.otr.universal.original-container')!=r['originalContainerId'] or s['Id']==r['originalContainerId']:raise ValueError('FINITE_CONTAINER_LABEL_DRIFT')
        expected=r['baselineComposeFiles']+([r['finiteComposeFile']] if active else [])
        if labels(s)!=expected:raise ValueError('COMPOSE_IDENTITY_DRIFT')
        extra=[m for m in s['Mounts'] if m['Destination']==r.get('runtimeMountTarget','/run/otr/universal-runtime.json')]
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
        retained='originalContainerId' in r
        if retained:
            before,original,_=retained_state(plan,call,check)
            active=before is None or before['Id']!=r['originalContainerId'] or not original['State'].get('Running',False)
        else:
            before=current();active=any(m['Destination']==r.get('runtimeMountTarget','/run/otr/universal-runtime.json') for m in before['Mounts'])
            check(before,active)
        directory=Path(r['runtimeSource']).parent
        if directory.exists() or directory.is_symlink():
            d=directory.lstat()
            if directory.is_symlink() or not stat.S_ISDIR(d.st_mode) or d.st_uid!=0 or d.st_mode&0o777!=0o700:raise ValueError('PRIVATE_WINDOW_DIRECTORY')
        elif active:raise ValueError('PRIVATE_WINDOW_DIRECTORY_MISSING')
        for path,h in r['composeHashes'].items():private_hash(path,h,None,r.get('baselineComposeFileMetadata',{}).get(path))
        for path,h,mode in [(r['runtimeSource'],r['runtimeSHA256'],0o440),(r['finiteComposeFile'],r['finiteComposeSHA256'],0o600)]:
            if Path(path).exists() or Path(path).is_symlink():private_hash(path,h,mode)
            elif active:raise ValueError('MOUNT_FILE_MISSING')
        if active and read_only:raise RuntimeError('READ_ONLY_RUNTIME_STILL_ACTIVE')
        if retained:
            restore_retained(plan,call,check,read_only)
        elif active:
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
                private_hash(path,h,mode)
                if read_only:raise RuntimeError('READ_ONLY_FINITE_FILE_REMAINS')
                os.unlink(path)
        if Path(r['runtimeSource']).exists() or Path(r['finiteComposeFile']).exists():raise ValueError('FINITE_SECRET_REMAINS')
        return {'verified':True,'windowId':plan['windowId']}
    finally:
        fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)

def close_runtime(plan,read_only=False):
    validate_runtime(plan)
    code='import fcntl,hashlib,json,os,re,stat,subprocess,time,uuid\nfrom pathlib import Path\n'+'\n\n'.join(inspect.getsource(f) for f in [canonical,sha,validate_runtime,retained_state,restore_retained,service_projection,remote_close])+"\nprint(json.dumps(remote_close(json.load(__import__('sys').stdin),read_only="+repr(read_only)+")))"
    result=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','python3 -c '+shlex.quote(code)],input=json.dumps(plan),capture_output=True,text=True,timeout=140)
    if result.returncode:raise RuntimeError('UNIVERSAL_RUNTIME_CLOSE_UNCONFIRMED')
    return json.loads(result.stdout)
