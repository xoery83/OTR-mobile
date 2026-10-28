"""Exact dormant SQL / closed image preparation. No SSH/SQL without explicit approval."""
import argparse, ast, datetime, hashlib, json, os, shlex, stat, subprocess, tempfile
from pathlib import Path
import metadata_closed_retry as shared

ROOT = Path(__file__).resolve().parents[2]
OLD = 'sha256:4c8d6a04c7e31f5f38d972990a626168fedfe7611e2a32ec92209b5f7a120e14'
NEW = 'sha256:73d518d4aa573590a9fe43aa48b767b180d998d5cb6e341221ce2eed8e80ef30'
MIGRATION = ROOT / 'supabase/dev-forward/trip-destinations/20261023000100_trip_structured_destinations.sql'
SQL_SHA = '59e88813b58983b435f7647e46d387daba91ee3456f1ffd9a90acf80ffab6410'
CATALOG_SQL = """BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('trip_create_command','trip_create_result','trip_create_finite_scope_allowed','trip_metadata_revision_guard','trip_metadata_snapshot','trip_metadata_update_command','trip_metadata_update_result','trip_destinations_valid')),
 'trips',(select jsonb_build_object('rls',relrowsecurity,'forceRls',relforcerowsecurity,'acl',relacl::text) from pg_class where oid='public.trips'::regclass),
 'destinations',(select jsonb_build_object('nullable',not attnotnull,'type',format_type(atttypid,atttypmod)) from pg_attribute where attrelid='public.trips'::regclass and attname='destinations' and not attisdropped),
 'constraints',(select jsonb_object_agg(conname,pg_get_constraintdef(oid)) from pg_constraint where conrelid in ('public.trips'::regclass,'public.trip_create_activation_gate'::regclass,'public.trip_metadata_activation_gate'::regclass)),
 'closed',not exists(select 1 from public.trip_create_activation_gate where enabled) and not exists(select 1 from public.trip_metadata_activation_gate where enabled) and not exists(select 1 from public.trip_core_activation_gate where runtime_enabled) and not exists(select 1 from public.trip_source_command_gate where enabled) and not exists(select 1 from public.trip_source_pdf_gate where enabled),
 'rolesClosed',(select count(*)=4 and bool_and(not rolcanlogin) from pg_roles where rolname in ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_core_v2_writer')),
 'sessions',(select count(*) from pg_stat_activity where usename in ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_core_v2_writer'))
) AS qualification; ROLLBACK;"""


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def assert_window(gate, now=None):
    start, end = [datetime.datetime.fromisoformat(gate[k].replace('Z', '+00:00')) for k in ('startsAt','expiresAt')]
    now = now or datetime.datetime.now(datetime.timezone.utc)
    assert start.tzinfo and end.tzinfo and 0 < (end-start).total_seconds() <= 900
    assert start <= now < end and (end-now).total_seconds() >= 240, 'WINDOW_OR_RESERVE_CLOSED'


def validate(gate):
    assert gate['project'] == shared.PROJECT and gate['beforeImage'] == OLD and gate['candidateImage'] == NEW
    assert gate['phaseCAllowed'] is False and gate['authOperations'] == gate['businessMutations'] == 0
    assert gate['beforeBundlePath'] == '/app/server-capture.mjs' and gate['rollbackCommand'] == ['node','server-capture.mjs']
    assert gate['beforeBundleSHA256'] == 'a9124ac674e3c79003024d88a8123e2fb0cd766e80808e2f679d01898dde0dce'
    assert gate['bundleSHA256'] == '95b9c8018b8bc516cf5fc27b5d6c857836d15ee3d44a4a3f092da8dc22ad3aec'
    assert gate['minimumServiceChangeReserveSeconds'] == 240 and gate['semanticHostConfig'] is True
    assert gate['maxDeploymentAttempts'] == 1 and gate['expectedUser'] == 'otr'
    assert gate['verifyProtectedRoutes'] is True and len(gate['protectedRoutes']) == 5
    assert hashlib.sha256(MIGRATION.read_bytes()).hexdigest() == SQL_SHA
    assert gate['sqlSHA256'] == SQL_SHA
    assert gate['helperSHA256'] == hashlib.sha256(Path(shared.__file__).read_bytes()).hexdigest()
    assert gate['entrySHA256'] == hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    assert gate['releaseDirectory'] == '/opt/otr/dev-backend/releases/ad5-structured-73d518d4-20261023'
    assert len(gate['expectedMounts']) == 3 and set(gate['beforeConfigFiles']) == set(gate['beforeConfigHashes'])


def sql(gate, text):
    # Existing logged-in management CLI only, never session/key/password copying.
    fd, path = tempfile.mkstemp(prefix='otr-structured-',suffix='.sql'); os.fchmod(fd,0o600)
    try:
        with os.fdopen(fd,'w') as stream: stream.write(text)
        result = subprocess.run([gate['supabaseCli'],'db','query','--linked','--project-ref',shared.PROJECT,'--file',path,'--output','json'],cwd=gate['linkedWorktree'],capture_output=True,text=True,timeout=40)
        if result.returncode: raise RuntimeError('MANAGEMENT_SQL_OUTCOME_UNKNOWN_NO_RETRY')
        return json.loads(result.stdout)
    finally: os.unlink(path)


def qualification(rows):
    assert isinstance(rows,list) and len(rows)==1 and set(rows[0])=={'qualification'}
    q=rows[0]['qualification']
    assert q['closed'] is True and q['rolesClosed'] is True and type(q['sessions']) is int and q['sessions']==0
    return q


def pinned_artifacts(gate):
    sql_body=MIGRATION.read_bytes()
    helper_body=Path(shared.__file__).read_bytes()
    assert hashlib.sha256(sql_body).hexdigest()==gate['sqlSHA256']
    assert hashlib.sha256(helper_body).hexdigest()==gate['helperSHA256']
    source=helper_body.decode(); tree=ast.parse(source)
    names=('redact','environment_projection','diagnostics','deployment_host_config','remote_deploy')
    functions={node.name:ast.get_source_segment(source,node) for node in tree.body if isinstance(node,ast.FunctionDef)}
    remote='import json,sys,hashlib,hmac,re,os,subprocess,time,urllib.request,urllib.error,datetime\nfrom pathlib import Path\n'+'\n\n'.join(functions[n] for n in names)+'\nprint(json.dumps(remote_deploy(json.load(sys.stdin))))'
    return sql_body.decode(),remote


def persist(path, value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream: json.dump(value,stream,indent=2);stream.flush();os.fsync(stream.fileno())
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)


def execute(gate, phase, directory):
    assert_window(gate); validate(gate)
    sql_body,remote=pinned_artifacts(gate)
    assert gate['ownerAuthorized'] is True and phase in gate['authorizedPhases']
    # O_EXCL durable attempt reservation: any failed/unknown execution requires reconciliation.
    directory.mkdir(mode=0o700,exist_ok=True)
    info=directory.lstat(); assert stat.S_ISDIR(info.st_mode) and not directory.is_symlink() and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o700
    fd=os.open(directory/(phase+'.reserved'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as stream: stream.write(hashlib.sha256(canonical(gate)).hexdigest());stream.flush();os.fsync(stream.fileno())
    d=os.open(directory,os.O_RDONLY|os.O_DIRECTORY);os.fsync(d);os.close(d)
    before=qualification(sql(gate,CATALOG_SQL))
    expected=gate['catalogBeforeSQL' if phase=='sql' else 'catalogAfterSQL']
    persist(directory/(phase+'-preflight.json'),{'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'catalog':before,'expectedMatches':before==expected})
    assert before==expected, 'CATALOG_OR_ACL_DRIFT_STOP'
    assert_window(gate)
    # Drift during catalog I/O stops; even without drift only pinned bytes can execute.
    assert pinned_artifacts(gate)==(sql_body,remote), 'EXECUTION_SOURCE_DRIFT'
    if phase=='sql':
        sql(gate,sql_body)
        after=qualification(sql(gate,CATALOG_SQL));assert after==gate['catalogAfterSQL'], 'POST_SQL_DRIFT_RECONCILE'
        return {'status':'DORMANT_SQL_VERIFIED','catalog':after,'sqlSHA256':SQL_SHA}
    result=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8',shared.HOST,'python3 -c '+shlex.quote(remote)],input=json.dumps(gate),capture_output=True,text=True,timeout=240)
    if result.returncode: raise RuntimeError('DEPLOY_TRANSPORT_OR_PRECONDITION_UNKNOWN_RECONCILE_NO_RETRY')
    report=json.loads(result.stdout)
    after=qualification(sql(gate,CATALOG_SQL))
    assert after==before, 'POST_DEPLOY_CATALOG_DRIFT_RECONCILE'
    report['catalogUnchanged']=True
    return report


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--gate',required=True);parser.add_argument('--execute-approved',choices=['sql','deploy']);parser.add_argument('--approved-gate-sha256');parser.add_argument('--receipt-directory')
    args=parser.parse_args();body=Path(args.gate).read_bytes();gate=json.loads(body);validate(gate)
    if not args.execute_approved:
        print(json.dumps({'status':'PREPARED_NO_SSH_SQL_OR_DEPLOY','candidateImage':NEW,'sqlSHA256':SQL_SHA}));return
    assert args.approved_gate_sha256==hashlib.sha256(body).hexdigest() and args.receipt_directory
    assert args.receipt_directory == gate['executionRecordDirectory'] == '/private/tmp/otr-ad5-structured-deploy-20261023'
    directory=Path(args.receipt_directory)
    try: report=execute(gate,args.execute_approved,directory)
    except Exception as error: report={'status':'RECONCILE_REQUIRED_NO_RETRY','errorClass':type(error).__name__}
    path=directory/(args.execute_approved+'-receipt.json');persist(path,report)
    print(json.dumps(report))

if __name__=='__main__': main()
