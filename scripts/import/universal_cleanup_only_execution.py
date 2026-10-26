"""Explicit transports/one-shot executor for approved run7 cleanup. No deployment/activation path."""
import argparse
import importlib.util
import inspect
import fcntl
import json
import os
import subprocess
import sys
import time
from pathlib import Path
import universal_cleanup_only as c
from universal_continuous_transition import canonical, sha, private, write_private
from universal_continuous_runtime_ports import remote_python, admin_command, restore_retained, read_runtime
from universal_continuous_sql_ports import read_sql_metadata, GROUPS, DEPENDENCY
from universal_scope_close import SqlTransport
from universal_config_control import revoke_sql


def ports(plan, directory):
    c.validate(plan,execution=True);baseline=plan['baseline']
    sql=SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase','/Users/xoery/Project/otr-mobile-canonical',str(directory))
    one=lambda q,k:sql(q)['rows'][0][k]
    def unchanged():
        # No old run7 receipt lookup: new closure audit identities are checked
        # separately through cleanup observation/receipted, never by the old port.
        v=one(read_sql_metadata(baseline),'metadata')
        functions=[s for group in GROUPS.values() for s in group]
        return (v['unsafe'] is False and all(v['functionHashes'].get(s)==baseline['installedFunctionHashes'][s] for s in functions)
            and v['functionHashes'].get(DEPENDENCY)==baseline['functionPreimages'][DEPENDENCY]
            and v['catalog']==baseline['catalogBaseline'] and all(x is False for x in v['sourceMeterLogins'].values())
            and all(type(x) is int and x==0 for x in v['sourceMeterSessions'].values()))
    def claimed(command):
        # Only the exact immutable command claim; never enumerate credential directories.
        return remote_python("import os,json\np='/opt/otr/dev-backend/private/universal-stage2-continuous/command-"+command['command']['request_id']+".claimed'\nprint(json.dumps({'claimed':os.path.exists(p)}))")['claimed']
    def restore_with_diagnostics():
        # Reuse the reviewed B-retry redactor before any candidate removal.
        path=Path(__file__).resolve().parents[1]/'dev/metadata_closed_retry.py'
        spec=importlib.util.spec_from_file_location('cleanup_diagnostics',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        code='import json,os,re,hashlib,hmac,subprocess\n'
        code+='\n'.join(inspect.getsource(getattr(module,name)) for name in ['redact','environment_projection','diagnostics'])
        code+='\nruntime='+repr(baseline['runtime'])+'\nartifact='+repr(sha(canonical(plan)))+'\n'+r"""
s=json.loads(subprocess.check_output(['docker','inspect',runtime['stagedContainerId']]))[0]
old=json.loads(subprocess.check_output(['docker','inspect',runtime['originalContainerId']]))[0]
assert s['Id']==runtime['stagedContainerId'] and s['Image']==runtime['imageId']
logs=subprocess.check_output(['docker','logs','--tail','60','--timestamps',s['Id']],stderr=subprocess.STDOUT,text=True,timeout=15)
env=dict(v.split('=',1) for v in old['Config']['Env'])
safe=diagnostics(s,logs,env,os.urandom(32))
p='/opt/otr/dev-backend/private/universal-stage2-continuous/cleanup-diagnostics-'+artifact+'.json'
b=json.dumps(safe,sort_keys=True,separators=(',',':')).encode()
fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as f:f.write(b)
print(json.dumps({'status':'REDACTED_DIAGNOSTICS_RETAINED','sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'path':p}))
"""
        receipt=remote_python(code)
        write_private(Path(directory)/'diagnostics-receipt.json',receipt)
        return restore_retained(baseline)

    def verify_restored():
        v=read_runtime(baseline);r=baseline['runtime']
        return v=={'containerId':r['originalContainerId'],'imageId':r['baselineImageId'],'healthy':True,
            'configSHA256':r['baselineConfigSHA256'],'hostConfigSHA256':r['baselineHostConfigSHA256'],
            'mountsSHA256':r['baselineMountsSHA256']}
    return {'observe':lambda:one(c.observation_sql(plan),'observation'), 'claimed':claimed,
        'invoke':lambda i:admin_command(plan,'closeCommands',i),
        'state':lambda:one(c.roles_sql(),'state'), 'setup':lambda:sql(c.setup_sql(plan)),
        'roles_closed':lambda:c.closed_roles(one(c.roles_sql(),'state'),True) and unchanged(),
        'revoke_admin':lambda:sql(revoke_sql(plan['adminControl'])),
        'restore':restore_with_diagnostics, 'verify_restored':verify_restored,'unchanged':unchanged}


def operate(plan,run,adapter):
    # OS lock is released on crash. Remote per-command claims prevent duplicate sends.
    with open(run/'cleanup.lock','a') as lock:
        os.chmod(run/'cleanup.lock',0o600)
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'status':'ANOTHER_CLOSER_OWNS_EXECUTION'}
        result=run/'cleanup-result.json'
        if result.exists():
            value=json.loads(private(result).read_text())
            if value.get('status')=='CLOSED_VERIFIED' and adapter['roles_closed']() and c.provider_closed(adapter['observe']()) and adapter['verify_restored']():return value
            return {'status':'RECONCILE_REQUIRED','reason':'PRIOR_RESULT_NOT_VERIFIED_NO_AUTOMATIC_RETRY'}
        return c.close_once(plan,run,adapter)


def watch(plan,run,adapter,clock=time.time,pause=time.sleep):
    write_private(run/'watch-armed.json',{'planSHA256':sha(canonical(plan)),'closeAt':plan['closeAt'],'expiresAt':plan['adminControl']['expiresAt']})
    while clock()<c.instant(plan['closeAt']):
        if (run/'cleanup-result.json').exists():
            value=operate(plan,run,adapter)
            write_private(run/'watch-result.json',value);return value
        pause(1)
    # A live foreground closer may hold flock. Stay armed until release or outer tail.
    while clock()<c.instant(plan['adminControl']['expiresAt'])-120:
        value=operate(plan,run,adapter)
        if value.get('status')!='ANOTHER_CLOSER_OWNS_EXECUTION':
            write_private(run/'watch-result.json',value);return value
        pause(1)
    # Independent final Admin closure is idempotent/CAS guarded, even if another
    # process is still blocked. No Source/Provider reopening and no restore retry.
    try:adapter['revoke_admin']()
    except Exception:pass
    try:closed=adapter['roles_closed']()
    except Exception:closed=False
    value={'status':'RECONCILE_REQUIRED','reason':'CLOSER_LOCK_NOT_RELEASED','adminClosed':closed}
    write_private(run/'watch-result.json',value);return value


def execute(plan,run,adapter):
    write_private(run/'execution-claimed.json',{'ownerApprovedGateSHA256':plan['ownerGateSHA256']})
    log=open(run/'watch.log','x');os.chmod(run/'watch.log',0o600)
    process=subprocess.Popen([sys.executable,__file__,'watch','--run-dir',str(run),'--plan-sha',sha(canonical(plan))],stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.DEVNULL,start_new_session=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    for _ in range(30):
        if (run/'watch-armed.json').exists():break
        if process.poll() is not None:raise ValueError('CLEANUP_WATCH_NOT_ARMED')
        time.sleep(.2)
    else:raise ValueError('CLEANUP_WATCH_NOT_ARMED')
    if time.time()<c.instant(plan['startsAt']):time.sleep(c.instant(plan['startsAt'])-time.time())
    before=adapter['state']();o=adapter['observe']()
    if (not c.closed_roles(before) or next(g for g in before['grants'] if g['admin_grant_id']==c.SECURITY)!=plan['securityPreimage'] or not adapter['unchanged']()
        or any(x['command_id'] in {a['command']['request_id'] for a in plan['baseline']['providerControl']['closeCommands']} for x in o['audits'])):
        raise ValueError('EXACT_UNUSED_OLD_CLOSE_PREIMAGE_REQUIRED')
    for i in range(4):c.assert_phase(o,i,False)
    if c.instant(plan['closeAt'])-time.time()<360:raise ValueError('CLEANUP_SETUP_RESERVE_REQUIRED')
    try:adapter['setup']()
    except Exception:pass  # Always reconcile; never repeat a renewal.
    state=adapter['state']()
    if not c.active_security(state,plan):
        try:adapter['revoke_admin']()
        except Exception:pass
        raise ValueError('CLEANUP_RENEWAL_UNCONFIRMED_NO_RETRY')
    return operate(plan,run,adapter)


def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['execute-approved-once','watch']);p.add_argument('--run-dir',required=True);p.add_argument('--plan-sha',required=True);a=p.parse_args()
    run=private(a.run_dir,True);plan=json.loads(private(run/'plan.json').read_text())
    if sha(canonical(plan))!=a.plan_sha:raise ValueError('EXACT_CLEANUP_PLAN_SEAL_REQUIRED')
    c.validate(plan,execution=True);adapter=ports(plan,run)
    result=execute(plan,run,adapter) if a.action=='execute-approved-once' else watch(plan,run,adapter)
    print(json.dumps(result));return 0 if result.get('status')=='CLOSED_VERIFIED' else 2

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:
        print(json.dumps({'status':'RECONCILE_REQUIRED','reason':'CLEANUP_EXECUTION_UNCONFIRMED_NO_AUTOMATIC_RETRY'}));raise SystemExit(2)
