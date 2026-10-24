#!/usr/bin/env python3
"""Independent finite Universal close/watchdog. Default prepare, no activation path."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time
from universal_scope_close import canonical,close_once,instant,SqlTransport,validate
from universal_runtime_close import close_runtime

def private(path,directory=False):
    path=Path(path);s=path.lstat()
    if path.is_symlink() or s.st_uid!=os.getuid() or s.st_mode&0o777!=(0o700 if directory else 0o600) or (not directory and (not stat.S_ISREG(s.st_mode) or s.st_nlink!=1)):raise ValueError('PRIVATE_PATH_REQUIRED')
    if directory!=path.is_dir():raise ValueError('PRIVATE_PATH_TYPE')
    return path

def write(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f:json.dump(value,f,sort_keys=True);f.flush();os.fsync(f.fileno())

def prepare(plan_path,run_dir):
    plan=json.loads(Path(plan_path).read_text());validate(plan)
    run_dir=Path(run_dir);run_dir.mkdir(mode=0o700);private(run_dir,True)
    write(run_dir/'plan.json',plan)
    digest=hashlib.sha256(canonical(plan)).hexdigest()
    write(run_dir/'prepared.json',{'status':'PREPARED_NOT_EXECUTED','planSHA256':digest})
    return digest

def load(run_dir,digest):
    directory=private(run_dir,True);plan=json.loads(private(directory/'plan.json').read_text())
    if hashlib.sha256(canonical(plan)).hexdigest()!=digest:raise ValueError('PLAN_HASH_MISMATCH')
    validate(plan)
    if plan['ownerAuthorized'] is not True:raise ValueError('OWNER_EXECUTION_REQUIRED')
    return plan,directory

def perform(plan,directory,recover_only=False):
    transport=plan['management']
    cli=Path(transport['supabaseCli']);workspace=Path(transport['linkedWorktree'])
    if not cli.is_absolute() or not workspace.is_absolute():raise ValueError('EXACT_OPERATOR_PATHS')
    sql=SqlTransport(str(cli),str(workspace),str(directory))
    return close_once(plan,sql,close_runtime,recover_only=recover_only)

def execute_once(plan,directory,digest,closer=perform):
    # Watch registration is not an execution lease. Manual and watcher closure
    # must win this SAME O_EXCL claim before any SQL or runtime mutation.
    claim=directory/'execution-claimed.json'
    try:
        write(claim,{'planSHA256':digest,'pid':os.getpid()})
    except FileExistsError:
        existing=json.loads(private(claim).read_text())
        if existing['planSHA256']!=digest:raise ValueError('EXECUTION_WINDOW_DRIFT')
        try:
            saved=json.loads(private(directory/'execution-result.json').read_text())
            if saved['planSHA256']==digest and saved['windowId']==plan['windowId']:
                return saved,0
        except (OSError,ValueError,KeyError):pass
        return {'status':'RECONCILE_REQUIRED','windowId':plan['windowId'],'executionAlreadyClaimed':True},0
    try:result=closer(plan,directory)
    except Exception:result={'status':'RECONCILE_REQUIRED','windowId':plan['windowId']}
    write(directory/'execution-result.json',{**result,'planSHA256':digest})
    return result,1

def watch(run_dir,digest,clock=time.time,pause=time.sleep,closer=perform):
    plan,directory=load(run_dir,digest)
    write(directory/'watch-claimed.json',{'planSHA256':digest,'pid':os.getpid()})
    def heartbeat():
        temp=directory/('heartbeat-'+str(time.time_ns())+'.tmp')
        write(temp,{'planSHA256':digest,'pid':os.getpid(),'observedAt':clock()})
        os.replace(temp,directory/'heartbeat.json')
    heartbeat()
    while clock()<instant(plan['expiresAt']) and not (directory/'close-requested').exists():
        heartbeat();pause(min(.2,max(0,instant(plan['expiresAt'])-clock())))
    result,attempts=execute_once(plan,directory,digest,closer)
    write(directory/'watch-result.json',{**result,'planSHA256':digest,'closureAttempts':attempts})
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('action',nargs='?',default='prepare',choices=['prepare','arm','watch','close','recover-only']);p.add_argument('--plan');p.add_argument('--run-dir',required=True);p.add_argument('--plan-sha');a=p.parse_args()
    if a.action=='prepare':
        if not a.plan:p.error('--plan required')
        print(json.dumps({'status':'PREPARED_NOT_EXECUTED','planSHA256':prepare(a.plan,a.run_dir)}));return
    if not a.plan_sha:p.error('--plan-sha required')
    plan,directory=load(a.run_dir,a.plan_sha)
    if a.action=='arm':
        if not instant(plan['startsAt'])<=time.time()<instant(plan['expiresAt']):raise ValueError('FINITE_WINDOW_NOT_CURRENT')
        child=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'watch','--run-dir',str(directory),'--plan-sha',a.plan_sha],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)
        until=time.monotonic()+3
        while time.monotonic()<until:
            try:
                beat=json.loads(private(directory/'heartbeat.json').read_text())
                if beat['pid']==child.pid and beat['planSHA256']==a.plan_sha and 0<=time.time()-beat['observedAt']<2:
                    print(json.dumps({'status':'WATCHDOG_ARMED','pid':child.pid,'planSHA256':a.plan_sha}));return
            except (OSError,ValueError):pass
            time.sleep(.1)
        raise RuntimeError('WATCHDOG_HEARTBEAT_UNCONFIRMED')
    if a.action=='watch':r=watch(a.run_dir,a.plan_sha)
    else:
        if a.action=='close' and (directory/'watch-claimed.json').exists():
            claimed=json.loads(private(directory/'watch-claimed.json').read_text())
            if claimed['planSHA256']!=a.plan_sha:raise ValueError('WATCH_WINDOW_DRIFT')
            if not (directory/'close-requested').exists():write(directory/'close-requested',{'planSHA256':a.plan_sha})
            until=time.monotonic()+150
            while time.monotonic()<until and not (directory/'watch-result.json').exists():
                try:os.kill(claimed['pid'],0)
                except ProcessLookupError:raise RuntimeError('WATCH_OUTCOME_UNKNOWN_RECOVER_ONLY')
                time.sleep(.2)
            r=json.loads(private(directory/'watch-result.json').read_text())
        else:
            if a.action=='close':r,_=execute_once(plan,directory,a.plan_sha)
            else:r=perform(plan,directory,recover_only=True)
            write(directory/('manual-'+str(time.time_ns())+'.json'),r)
    print(json.dumps(r))
    if r['status']!='CLOSED_VERIFIED':raise SystemExit(2)
if __name__=='__main__':
    try:main()
    except Exception:print(json.dumps({'status':'RECONCILE_REQUIRED_OR_PRECONDITION_FAILED'}));raise SystemExit(2)
