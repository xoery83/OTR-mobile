"""PDF-only closure adapter; reuses the existing retained-container rollback engine.

Never activates policy/runtime or loads credentials. Source close bundle runs
inside the exact retained Backend and reads its existing credential in place.
"""
import hashlib
import json
from pathlib import Path
import subprocess

ACTOR='f4b059c5-8241-4ffb-aa15-37fa25474543'
TRIP='825f79b2-4a9d-4535-a62e-43000ca50c4a'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def close_pdf(source_close, restore_runtime, stop_worker):
    outcomes={}
    # Independent containment steps: unavailable SQL must not skip runtime rollback.
    for key,work in [('sourceBefore',source_close),('runtime',restore_runtime),('sourceAfter',source_close),('worker',stop_worker)]:
        try:outcomes[key]=work()
        except Exception:outcomes[key]={'verified':False}
    verified=outcomes['sourceAfter'].get('closed') is True and outcomes['runtime'].get('verified') is True and outcomes['worker'].get('verified') is True
    return {'status':'PDF_CLOSED_VERIFIED' if verified else 'PDF_CLOSURE_UNCONFIRMED','verified':verified,'steps':outcomes}


def execute(plan, runtime, bundle, call):
    if plan.get('project')!='tuqigdxrvrerfewsxqgm' or plan.get('actorId')!=ACTOR or plan.get('tripId')!=TRIP:
        raise ValueError('PDF_CLOSE_EXACT_SCOPE_REQUIRED')
    runtime.validate_runtime(plan)
    r=plan['runtime']
    if r.get('runtimeMountTarget')!='/run/otr/universal-pdf-runtime.json' or sha(bundle)!=plan['pdfCloseBundleSHA256']:
        raise ValueError('PDF_CLOSE_BUNDLE_BINDING')
    def source_close():
        snapshot=json.loads(call(['docker','inspect',r['container']]))[0]
        if snapshot['Id']==r['originalContainerId']:prefix='baseline'
        elif snapshot['Id']==r['stagedContainerId']:prefix='active'
        else:raise ValueError('PDF_CLOSE_CONTAINER_DRIFT')
        if snapshot['Image']!=r['imageId'] or sha(runtime.canonical(snapshot['Config']))!=r[prefix+'ConfigSHA256']:
            raise ValueError('PDF_CLOSE_CONFIG_DRIFT')
        value=json.loads(call(['docker','exec','-i',snapshot['Id'],'node','-','close'],input=bundle))
        if value!={'status':'PDF_SCOPE_CLOSED_VERIFIED','closed':True}:raise ValueError('PDF_SQL_CLOSE_UNCONFIRMED')
        # Separate process/session/READ ONLY verification, not the first call's ACK.
        check=json.loads(call(['docker','exec','-i',snapshot['Id'],'node','-','verify'],input=bundle))
        if check!=value:raise ValueError('PDF_SQL_CLOSE_UNCONFIRMED')
        return check
    def stop_worker():
        call(['systemctl','stop','otr-universal-pdf-worker.service'])
        state=call(['systemctl','show','otr-universal-pdf-worker.service','--property=ActiveState','--value']).strip()
        if state!='inactive':raise ValueError('PDF_WORKER_STOP_UNCONFIRMED')
        return {'verified':True,'activeState':state}
    return close_pdf(source_close,lambda:runtime.remote_close(plan),stop_worker)


def main():
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
    root=Path('/opt/otr/universal-pdf-worker')
    helper=root/'universal_runtime_close.py';helper_bytes=private(helper)
    if sha(helper_bytes)!=plan['pdfRuntimeCloseHelperSHA256']:raise ValueError('PDF_CLOSE_HELPER_DRIFT')
    unit=Path('/etc/systemd/system/otr-universal-pdf-worker.service')
    unit_stat=unit.lstat()
    if unit.is_symlink() or not stat.S_ISREG(unit_stat.st_mode) or unit_stat.st_uid!=0 or unit_stat.st_nlink!=1 or unit_stat.st_mode&0o777!=0o644 or sha(unit.read_bytes())!=plan['pdfWorkerUnitSHA256']:
        raise ValueError('PDF_CLOSE_WORKER_UNIT_DRIFT')
    spec=importlib.util.spec_from_file_location('otr_pdf_retained_runtime_close',helper)
    runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
    def call(argv,input=None):
        result=subprocess.run(argv,input=input,capture_output=True,timeout=100,check=True)
        return result.stdout.decode()
    result=execute(plan,runtime,private(root/'close-control.cjs'),call)
    print(json.dumps(result));return 0 if result['verified'] else 1


if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:print(json.dumps({'status':'PDF_CLOSURE_UNCONFIRMED','verified':False}));raise SystemExit(1)
