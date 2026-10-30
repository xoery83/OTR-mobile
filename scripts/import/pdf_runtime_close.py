"""PDF-only closure adapter; reuses the existing retained-container rollback engine.

Never activates policy/runtime or loads credentials. Source close bundle runs
inside the exact retained Backend and reads its existing credential in place.
"""
import hashlib
import json
import re
from pathlib import Path
import subprocess

ACTOR='f4b059c5-8241-4ffb-aa15-37fa25474543'
TRIP='825f79b2-4a9d-4535-a62e-43000ca50c4a'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def close_pdf(source_close, restore_runtime, stop_worker, family="PDF"):
    if family not in ("PDF", "PNG"):raise ValueError("BINARY_CLOSE_FAMILY")
    outcomes={}
    # Independent containment steps: unavailable SQL must not skip runtime rollback.
    for key,work in [('sourceBefore',source_close),('runtime',restore_runtime),('sourceAfter',source_close),('worker',stop_worker)]:
        try:outcomes[key]=work()
        except Exception:outcomes[key]={'verified':False}
    verified=outcomes['sourceAfter'].get('closed') is True and outcomes['runtime'].get('verified') is True and outcomes['worker'].get('verified') is True
    return {'status':family+'_CLOSED_VERIFIED' if verified else family+'_CLOSURE_UNCONFIRMED','verified':verified,'steps':outcomes}



def validate_png_runtime(plan):
    r=plan['runtime']
    if (r.get('container')!='otr-dev-backend'
        or r.get('runtimeMountTarget')!='/run/otr/universal-png-runtime.json'
        or r.get('runtimeSource')!='/opt/otr/dev-backend/env/universal-png-runtime.json'
        or not re.fullmatch('[0-9a-f]{64}',r.get('originalContainerId',''))
        or not re.fullmatch('sha256:[0-9a-f]{64}',r.get('imageId',''))):
        raise ValueError('PNG_PERSISTENT_RUNTIME_PLAN_REQUIRED')
    for key in ['runtimeSHA256','baselineConfigSHA256','baselineEnvironmentSHA256','baselineHostConfigSHA256','baselineMountsSHA256']:
        if not re.fullmatch('[0-9a-f]{64}',r.get(key,'')):
            raise ValueError('PNG_BASELINE_HASH_REQUIRED')
    files=r.get('baselineComposeFiles',[])
    hashes=r.get('composeHashes',{})
    if (not files or len(set(files))!=len(files) or set(files)!=set(hashes)
        or any(not path.startswith('/opt/otr/dev-backend/') or '..' in Path(path).parts
               or not re.fullmatch('[0-9a-f]{64}',value) for path,value in hashes.items())):
        raise ValueError('PNG_COMPOSE_PINS_REQUIRED')


def verify_png_baseline(plan, runtime, call):
    # PNG changes only SQL/worker state. Its persistent original-reader config must remain mounted.
    r=plan['runtime']
    snapshot=json.loads(call(['docker','inspect',r['container']]))[0]
    projection=runtime.service_projection(snapshot)
    if (snapshot['Id']!=r['originalContainerId'] or snapshot.get('Name')!='/otr-dev-backend'
        or snapshot['Image']!=r['imageId'] or snapshot['Config'].get('User')!='otr'
        or snapshot['Config'].get('Cmd')!=['node','server-capture.mjs']
        or sha(runtime.canonical(snapshot['Config']))!=r['baselineConfigSHA256']
        or any(projection[key]!=r['baseline'+key[0].upper()+key[1:]] for key in projection)
        or snapshot['Config'].get('Labels',{}).get('com.docker.compose.project.config_files','').split(',')!=r['baselineComposeFiles']
        or not snapshot['State'].get('Running') or snapshot['State'].get('Health',{}).get('Status')!='healthy'):
        raise ValueError('PNG_COMPATIBLE_BASELINE_UNCONFIRMED')
    mounts=[m for m in snapshot['Mounts'] if m['Destination']=='/run/otr/universal-png-runtime.json']
    if len(mounts)!=1 or mounts[0]['Source']!='/opt/otr/dev-backend/env/universal-png-runtime.json' or mounts[0]['RW'] is not False:
        raise ValueError('PNG_PERSISTENT_READER_MOUNT_UNCONFIRMED')
    for path,expected in {**r['composeHashes'],r['runtimeSource']:r['runtimeSHA256']}.items():
        if call(['sha256sum',path]).split()[0]!=expected:
            raise ValueError('PNG_PERSISTENT_FILE_DRIFT')
    return {'verified':True}


def execute(plan, runtime, bundle, call, family="PDF"):
    if family not in ("PDF", "PNG"):raise ValueError("BINARY_CLOSE_FAMILY")
    prefix=family.lower()
    if plan.get('project')!='tuqigdxrvrerfewsxqgm' or plan.get('actorId')!=ACTOR or plan.get('tripId')!=TRIP:
        raise ValueError('PDF_CLOSE_EXACT_SCOPE_REQUIRED')
    if family=="PNG":validate_png_runtime(plan)
    else:runtime.validate_runtime(plan)
    r=plan['runtime']
    target='/run/otr/universal-pdf-runtime.json' if family=='PDF' else '/run/otr/universal-png-runtime.json'
    if r.get('runtimeMountTarget')!=target or sha(bundle)!=plan[prefix+'CloseBundleSHA256']:
        raise ValueError('PDF_CLOSE_BUNDLE_BINDING')
    def source_close():
        snapshot=json.loads(call(['docker','inspect',r['container']]))[0]
        if snapshot['Id']==r['originalContainerId']:prefix='baseline'
        elif snapshot['Id']==r['stagedContainerId']:prefix='active'
        else:raise ValueError('PDF_CLOSE_CONTAINER_DRIFT')
        if snapshot['Image']!=r['imageId'] or sha(runtime.canonical(snapshot['Config']))!=r[prefix+'ConfigSHA256']:
            raise ValueError('PDF_CLOSE_CONFIG_DRIFT')
        value=json.loads(call(['docker','exec','-i',snapshot['Id'],'node','-','close'],input=bundle))
        if value!={'status':family+'_SCOPE_CLOSED_VERIFIED','closed':True}:raise ValueError('PDF_SQL_CLOSE_UNCONFIRMED')
        # Separate process/session/READ ONLY verification, not the first call's ACK.
        check=json.loads(call(['docker','exec','-i',snapshot['Id'],'node','-','verify'],input=bundle))
        if check!=value:raise ValueError('PDF_SQL_CLOSE_UNCONFIRMED')
        return check
    def stop_worker():
        call(['systemctl','stop','otr-universal-'+prefix+'-worker.service'])
        state=call(['systemctl','show','otr-universal-'+prefix+'-worker.service','--property=ActiveState','--value']).strip()
        if state!='inactive':raise ValueError('PDF_WORKER_STOP_UNCONFIRMED')
        if family=='PNG':
            cleanup=json.loads(call(['/usr/bin/env','-i','PATH=/usr/bin:/bin','HOME=/nonexistent','NODE_ENV=production','/opt/otr/universal-png-worker/node','/opt/otr/universal-png-worker/negative-cleanup.mjs']))
            if cleanup not in ({'status':'TERMINATED','terminated':True},{'status':'EMPTY_VERIFIED','terminated':True}):
                raise ValueError('PNG_PHYSICAL_TERMINATION_UNCONFIRMED')
            return {'verified':True,'activeState':state,'physicalCleanup':cleanup['status']}
        return {'verified':True,'activeState':state}
    restore=lambda:runtime.remote_close(plan) if family=='PDF' else verify_png_baseline(plan,runtime,call)
    return close_pdf(source_close,restore,stop_worker,family)


def main(family="PDF"):
    if family not in ("PDF", "PNG"):raise ValueError("BINARY_CLOSE_FAMILY")
    prefix=family.lower()
    import argparse
    import importlib.util
    import os
    import stat
    p=argparse.ArgumentParser();p.add_argument('plan',type=Path);p.add_argument('plan_sha256');a=p.parse_args()
    def private(path):
        s=path.lstat()
        if path.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o777!=0o600:
            raise ValueError('PDF_CLOSE_PRIVATE_ARTIFACT_REQUIRED')
        return path.read_bytes()
    raw=private(a.plan)
    if os.getuid()!=0 or sha(raw)!=a.plan_sha256:raise ValueError('PDF_CLOSE_PLAN_REQUIRED')
    plan=json.loads(raw)
    root=Path('/opt/otr/universal-'+prefix+'-worker')
    helper=root/'universal_runtime_close.py';helper_bytes=private(helper)
    if sha(helper_bytes)!=plan[prefix+'RuntimeCloseHelperSHA256']:raise ValueError('PDF_CLOSE_HELPER_DRIFT')
    unit=Path('/etc/systemd/system/otr-universal-'+prefix+'-worker.service')
    unit_stat=unit.lstat()
    if unit.is_symlink() or not stat.S_ISREG(unit_stat.st_mode) or unit_stat.st_uid!=0 or unit_stat.st_nlink!=1 or unit_stat.st_mode&0o777!=0o644 or sha(unit.read_bytes())!=plan[prefix+'WorkerUnitSHA256']:
        raise ValueError('PDF_CLOSE_WORKER_UNIT_DRIFT')
    if family=='PNG' and sha(private(root/'negative-cleanup.mjs'))!=plan['pngCleanupBundleSHA256']:raise ValueError('PNG_CLEANUP_BUNDLE_DRIFT')
    spec=importlib.util.spec_from_file_location('otr_pdf_retained_runtime_close',helper)
    runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
    def call(argv,input=None):
        result=subprocess.run(argv,input=input,capture_output=True,timeout=100,check=True)
        return result.stdout.decode()
    result=execute(plan,runtime,private(root/'close-control.cjs'),call,family)
    print(json.dumps(result));return 0 if result['verified'] else 1


if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:print(json.dumps({'status':'PDF_CLOSURE_UNCONFIRMED','verified':False}));raise SystemExit(1)
