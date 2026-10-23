#!/usr/bin/env python3
"""Single fixed QA finite operator. Default prepare only; never imports a credential.
Detached watch uses the existing logged-in local Supabase CLI, not runner Auth.
No business SQL is issued here. Exact SQL readback is SELECT-only in readback.ts.
"""
import argparse, datetime as dt, hashlib, json, os, pathlib, secrets, subprocess, sys, tempfile, time
PROJECT='tuqigdxrvrerfewsxqgm'
IMAGE='sha256:4c8d6a04c7e31f5f38d972990a626168fedfe7611e2a32ec92209b5f7a120e14'
BUNDLE='a9124ac674e3c79003024d88a8123e2fb0cd766e80808e2f679d01898dde0dce'
TRIP='f9d7adff-42fa-5f49-8bea-5d692d2fc1d7'
ROLES={'create':'otr_trip_create_gateway','metadata':'otr_trip_metadata_gateway'}
GATES={'create':'trip_create_activation_gate','metadata':'trip_metadata_activation_gate'}
PAYLOADS=json.loads(pathlib.Path(__file__).with_name('proposed-payloads.json').read_text())
def digest(v): return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def timestamp(v):
    value=dt.datetime.fromisoformat(v.replace('Z','+00:00')); assert value.tzinfo is not None; return value.timestamp()
def quote(v): return "'"+str(v).replace("'","''")+"'"
def private_write(path, value):
    path=pathlib.Path(path); fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f: json.dump(value,f,sort_keys=True); f.flush(); os.fsync(f.fileno())
def load_plan(path):
    p=json.loads(pathlib.Path(path).read_text())
    import uuid
    for a in p['actorIds'].values(): uuid.UUID(a)
    assert set(p['actorIds'])=={'A','B'} and p['actorIds']['A']!=p['actorIds']['B']
    assert p['project']==PROJECT and p['image']==IMAGE and p['bundle']==BUNDLE
    assert 0<timestamp(p['expiresAt'])-timestamp(p['startsAt'])<=900
    expected={'create':PAYLOADS['create']['sha256Utf8'],'metadata':PAYLOADS['editProposal']['sha256Utf8'],'preview':PAYLOADS['currencyPreview']['sha256Utf8']}
    assert p['bodyHashes']==expected
    # Fingerprint excludes consent bit, commands and evidence paths; every capability is pinned.
    identity={k:p[k] for k in ['project','image','bundle','actorIds','startsAt','expiresAt','bodyHashes']}
    assert p['windowId']==digest(identity)
    # Entire execution manifest is pinned, including helpers and recovery target.
    manifest=dict(p); claimed=manifest.pop('manifestSHA256')
    assert claimed==digest(manifest)
    if p.get('currencyOnly'):
        assert p.get('currencyBudgetAuthorizationSHA256')=='4abb4c84da8ea1acb5a5bc734ef8e8b291184775f342c9fc0428a2504daf6210'
        assert (p['resume']['kind'],p['resume']['previousReadCharges'],p['resume']['previousMutationCharges']) in [('CURRENCY_ONLY_AFTER_VERIFIED_CREATE_EDIT',15,2),('CURRENCY_RECEIPT_RECOVERY',18,4)]
    return p
class Operator:
    def __init__(self,p,run_dir,executor=None):
        self.p=p; self.dir=pathlib.Path(run_dir).resolve(); self.executor=executor
        self.dir.mkdir(mode=0o700,parents=True,exist_ok=True)
        assert not self.dir.is_symlink() and (self.dir.stat().st_mode&0o777)==0o700 and self.dir.stat().st_uid==os.getuid()
    def open(self):
        assert self.p['ownerAuthorized'] is True
        assert timestamp(self.p['startsAt'])<=time.time()<timestamp(self.p['expiresAt'])
    def sql(self,text):
        # The command deliberately has no token/password flags; CLI uses its existing local login.
        if self.executor: return self.executor(text)
        fd,path=tempfile.mkstemp(prefix='sql-',suffix='.sql',dir=self.dir); os.fchmod(fd,0o600)
        try:
            with os.fdopen(fd,'w') as f: f.write(text)
            r=subprocess.run([self.p['supabaseCli'],'db','query','--linked','--project-ref',PROJECT,'--file',path,'--output','json'],cwd=self.p['linkedWorktree'],capture_output=True,text=True,timeout=35)
            if r.returncode: raise RuntimeError('MANAGEMENT_SQL_FAILED') # never persist raw SQL/password errors
            return json.loads(r.stdout)
        finally: os.unlink(path)
    def scoped_guard(self):
        p=self.p
        checks=[]
        for kind,table in GATES.items():
            request=dict(PAYLOADS['create' if kind=='create' else 'editProposal']['body'])
            operation=request['operationId']
            if kind=='create': del request['operationId']
            expected=f"actor_account_id={quote(p['actorIds']['A'])}::uuid AND trip_id={quote(TRIP)}::uuid AND operation_id={quote(operation)}::uuid AND request_payload={quote(json.dumps(request))}::jsonb AND started_at={quote(p['startsAt'])}::timestamptz AND expires_at={quote(p['expiresAt'])}::timestamptz"
            # NOLOGIN/termination may occur only after BOTH gates match or are pristine closed.
            checks.append(f"IF EXISTS(SELECT 1 FROM public.{table} WHERE enabled AND NOT ({expected})) THEN RAISE EXCEPTION 'C_WINDOW_SCOPE_DRIFT'; END IF;")
            checks.append(f"IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname={quote(ROLES[kind])} AND rolcanlogin AND rolvaliduntil IS DISTINCT FROM {quote(p['expiresAt'])}::timestamptz) THEN RAISE EXCEPTION 'C_ROLE_WINDOW_DRIFT'; END IF;")
        return "\n".join(checks)
    def close_sql(self):
        # Control advisory lock serializes our activation/closure. Business TX does not own it.
        # Terminate exact finite-role sessions BEFORE UPDATE: business RPC holds gate FOR SHARE.
        p=self.p
        return f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714022,23);
DO $guard$ BEGIN {self.scoped_guard()} END $guard$;
ALTER ROLE otr_trip_create_gateway NOLOGIN;
ALTER ROLE otr_trip_metadata_gateway NOLOGIN;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres'
 AND usename IN ('otr_trip_create_gateway','otr_trip_metadata_gateway') AND pid<>pg_backend_pid()
 AND backend_start >= {quote(p['startsAt'])}::timestamptz AND backend_start < {quote(p['expiresAt'])}::timestamptz;
UPDATE public.trip_create_activation_gate SET enabled=false,actor_account_id=NULL,trip_id=NULL,operation_id=NULL,request_payload=NULL,started_at=NULL,expires_at=NULL WHERE singleton;
UPDATE public.trip_metadata_activation_gate SET enabled=false,actor_account_id=NULL,trip_id=NULL,operation_id=NULL,request_payload=NULL,started_at=NULL,expires_at=NULL WHERE singleton;
COMMIT;
"""
    def activation_sql(self,kind,password):
        self.open(); assert kind in GATES
        request=dict(PAYLOADS['create' if kind=='create' else 'editProposal']['body']); op=request['operationId']
        if kind=='create': del request['operationId']
        return f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714022,23);
DO $guard$ BEGIN {self.scoped_guard()}
IF EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled) OR EXISTS(SELECT 1 FROM public.trip_source_command_gate WHERE enabled) OR EXISTS(SELECT 1 FROM public.trip_source_pdf_gate WHERE enabled) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_core_v2_gateway','otr_trip_core_v2_writer') AND rolcanlogin) THEN RAISE EXCEPTION 'C_UNRELATED_CAPABILITY_DRIFT'; END IF;
IF clock_timestamp() < {quote(self.p['startsAt'])}::timestamptz OR clock_timestamp() >= {quote(self.p['expiresAt'])}::timestamptz THEN RAISE EXCEPTION 'C_WINDOW_CLOSED'; END IF;
IF EXISTS(SELECT 1 FROM public.{GATES[kind]} WHERE enabled) THEN RAISE EXCEPTION 'C_ALREADY_ACTIVATED'; END IF;
IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename={quote(ROLES[kind])} AND datname='postgres') THEN RAISE EXCEPTION 'C_EXISTING_PRINCIPAL_SESSION'; END IF;
END $guard$;
ALTER ROLE {ROLES[kind]} LOGIN CONNECTION LIMIT 1 PASSWORD {quote(password)} VALID UNTIL {quote(self.p['expiresAt'])};
UPDATE public.{GATES[kind]} SET enabled=true, actor_account_id={quote(self.p['actorIds']['A'])}::uuid,trip_id={quote(TRIP)}::uuid,operation_id={quote(op)}::uuid,request_payload={quote(json.dumps(request))}::jsonb,started_at={quote(self.p['startsAt'])}::timestamptz,expires_at={quote(self.p['expiresAt'])}::timestamptz WHERE singleton;
COMMIT;"""
    def service(self,action,kind=None,password=None):
        # Fixed reviewed service helper consumes private stdin, returns only finite booleans/hashes.
        # No shell interpolation of password. Caller plan must pin helper SHA and baseline compose.
        helper=pathlib.Path(__file__).with_name('service.py')
        assert hashlib.sha256(helper.read_bytes()).hexdigest()==self.p['serviceHelperSHA256']
        r=subprocess.run([sys.executable,str(helper),action,self.p['planPath'],self.p['manifestSHA256']],input=json.dumps({'kind':kind,'password':password}),capture_output=True,text=True,timeout=250)
        if r.returncode: raise RuntimeError('C_SERVICE_RECONCILE_REQUIRED')
        result=json.loads(r.stdout); assert result['verified'] is True
        return result
    def close(self):
        status='RECONCILE_REQUIRED'; stages={'sqlClosed':False,'serviceRestored':False}
        try:
            if self.p.get('currencyOnly'):
                # This phase opens no SQL role or runtime mount; verify closed state,
                # do not restart B or rewrite even the already-closed activation rows.
                restored=self.service('reconcile'); assert restored.get('verified') is True
                stages['sqlClosed']=True;stages['serviceRestored']=True
            else:
                self.sql(self.close_sql()); stages['sqlClosed']=True
                restored=self.service('restore'); assert restored.get('verified') is True; stages['serviceRestored']=True
            # Actual postchecks are part of helper/SQL, no inference from command exit alone.
            check=self.sql("BEGIN READ ONLY; SELECT NOT EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled) AND NOT EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled) AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway') AND rolcanlogin) AS closed; ROLLBACK;")
            rows=check if isinstance(check,list) else check.get('rows') if isinstance(check,dict) else None
            if not isinstance(rows,list) or len(rows)!=1 or rows[0] != {'closed':True}: raise RuntimeError('C_CLOSED_NOT_VERIFIED')
            status='CLOSED_VERIFIED'
        except Exception: pass
        receipt={'windowId':self.p['windowId'],'status':status,**stages}
        if stages['serviceRestored']: receipt['service']=restored
        path=self.dir/f"close-{time.time_ns()}.json"; private_write(path,receipt)
        return receipt
    def activate(self,kind):
        if self.p.get('currencyOnly'):raise RuntimeError('C_CURRENCY_ONLY_NO_SQL_ACTIVATION')
        self.open()
        armed=json.loads((self.dir/'watchdog-armed.json').read_text())
        heartbeat=json.loads((self.dir/'watchdog-heartbeat.json').read_text())
        assert armed['windowId']==self.p['windowId'] and heartbeat['windowId']==self.p['windowId'] and heartbeat['pid']==armed['pid'] and 0<=time.time()-heartbeat['observedAt']<2
        os.kill(armed['pid'],0)
        state=subprocess.check_output(['ps','-p',str(armed['pid']),'-o','state='],text=True,timeout=2).strip()
        assert state and not state.startswith('Z')
        if kind=='metadata':
            proof=json.loads((self.dir/'canonical-create-readback.json').read_text())
            assert proof['windowId']==self.p['windowId'] and proof['trip']['metadata_revision']==0
            assert proof['trip']['created_by']==self.p['actorIds']['A']
            assert {k:proof['trip'][sql] for k,sql in [('name','name'),('destination','destination'),('startDate','start_date'),('endDate','end_date')]}==PAYLOADS['editProposal']['body']['before']
        password=secrets.token_urlsafe(36)
        try:
            self.sql(self.activation_sql(kind,password))
            serviceReceipt=self.service('activate',kind,password)
            return {'status':'ACTIVATED','kind':kind,'windowId':self.p['windowId'],'service':serviceReceipt}
        except Exception:
            self.close(); raise RuntimeError('C_ACTIVATION_FAILED_CLOSED_OR_RECONCILE')
    def watch(self):
        def heartbeat():
            target=self.dir/'watchdog-heartbeat.json'; temporary=self.dir/('heartbeat-'+str(time.time_ns())+'.tmp')
            private_write(temporary,{'windowId':self.p['windowId'],'pid':os.getpid(),'observedAt':time.time()});os.replace(temporary,target)
        heartbeat()
        private_write(self.dir/'watchdog-armed.json',{'windowId':self.p['windowId'],'pid':os.getpid()})
        while time.time()<timestamp(self.p['expiresAt']) and not (self.dir/'close-requested').exists():
            heartbeat();time.sleep(min(.2,max(0,timestamp(self.p['expiresAt'])-time.time())))
        return self.close()
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('action',choices=['prepare','arm','watch','activate-create','activate-metadata','close']); ap.add_argument('plan'); ap.add_argument('run_dir'); ap.add_argument('--manifest-sha'); a=ap.parse_args()
    p=load_plan(a.plan); assert a.manifest_sha is None or a.manifest_sha==p['manifestSHA256']; p['planPath']=str(pathlib.Path(a.plan).resolve()); op=Operator(p,a.run_dir)
    if a.action=='prepare': print(json.dumps({'status':'PREPARED_NOT_EXECUTED','windowId':p['windowId']})); return
    assert p['ownerAuthorized'] is True
    if a.action=='arm':
        op.open(); child=subprocess.Popen([sys.executable,str(pathlib.Path(__file__).resolve()),'watch',a.plan,a.run_dir,'--manifest-sha',p['manifestSHA256']],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)
        print(json.dumps({'status':'WATCHDOG_STARTED','pid':child.pid})); return
    if a.action=='watch': result=op.watch()
    elif a.action=='close':
        arm=op.dir/'watchdog-armed.json'
        if arm.exists():
            info=json.loads(arm.read_text()); assert info['windowId']==p['windowId']
            (op.dir/'close-requested').touch(mode=0o600,exist_ok=True)
            deadline=time.monotonic()+340
            while time.monotonic()<deadline:
                completed=sorted(op.dir.glob('close-*.json'))
                if completed: result=json.loads(completed[-1].read_text()); break
                try: os.kill(info['pid'],0)
                except ProcessLookupError: result=op.close(); break
                time.sleep(.2)
            else: result={'status':'RECONCILE_REQUIRED','windowId':p['windowId']}
        else: result=op.close()
    else: result=op.activate(a.action.removeprefix('activate-'))
    print(json.dumps(result)); sys.exit(0 if result['status']!='RECONCILE_REQUIRED' else 2)
if __name__=='__main__':
    try: main()
    except Exception: print(json.dumps({'status':'STOPPED_PRECONDITION_OR_RECONCILE_REQUIRED'})); sys.exit(2)
