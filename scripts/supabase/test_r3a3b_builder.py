"""Synthetic only: runs inside the no-network, tmpfs disposable fixture."""
import ctypes as C
import datetime as dt
import json
import os
import secrets
import threading
import time
import socket
import subprocess
from pathlib import Path
import catalog_reader_credential as b

b.harden_process()
store=b.Custody('/custody')
root=b.Pg('/proof/ca.crt','supabase_admin')
result={}; known=[]; verifiers=[]
preserve="""SELECT rolconnlimit,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,
 (SELECT setconfig::text FROM pg_db_role_setting WHERE setrole=r.oid),
 has_schema_privilege(r.oid,'public','USAGE'),has_schema_privilege(r.oid,'public','CREATE'),
 has_database_privilege(r.oid,'postgres','CONNECT'),has_database_privilege(r.oid,'postgres','TEMP'),
 has_function_privilege(r.oid,'public.trip_source_read_import_catalogs(uuid,uuid)','EXECUTE')
 FROM pg_roles r WHERE rolname='otr_trip_publication_catalog_reader'"""
before=root.query(preserve,rows=True)
parent=os.getpid()
pid=os.fork()
if pid==0:
    try:os.open('/proc/'+str(parent)+'/environ',os.O_RDONLY);os._exit(1)
    except PermissionError:os._exit(0)
assert os.waitpid(pid,0)[1]==0
result['same_uid_environment_denied']=True
abort=subprocess.run(['/usr/bin/python3','-c','import ctypes,resource,os,signal;resource.setrlimit(resource.RLIMIT_CORE,(0,0));ctypes.CDLL(None).prctl(4,0,0,0,0);os.kill(os.getpid(),signal.SIGABRT)'],cwd='/custody',capture_output=True)
assert abort.returncode==-6 and not list(Path('/custody').glob('core*'))
result['abort_no_core_file']=True
def op(): return b.Pg('/proof/ca.crt')
def observe_secrets():
    verifiers.extend(x[0] for x in root.query("SELECT rolpassword FROM pg_authid WHERE rolname='"+b.READER+"' AND rolpassword IS NOT NULL",rows=True))
def candidate():
    p=store.read('candidate',True)
    try: known.append(p.value.decode())
    finally: b.wipe(p)
def wait_lock(pid):
    for _ in range(200):
        rows=root.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',(str(pid).encode(),),rows=True)
        if rows==[['Lock']]: return
        time.sleep(.01)
    raise AssertionError('expected_lock_not_observed')
def baseline(mode):
    p=op(); secret=secrets.token_urlsafe(48); known.append(secret)
    root.query('BEGIN');root.query("SELECT oid FROM pg_authid WHERE rolname='"+b.READER+"' FOR UPDATE")
    p.query('BEGIN')
    for k,v in b.SETTINGS.items():
        if k!='log_min_messages': p.query("SET LOCAL "+k+"='"+v+"'")
    p.query("SELECT set_config('otr_builder.password',$1,true) IS NOT NULL",(secret.encode(),))
    p.query("SELECT set_config('otr_builder.expiry',$1,true) IS NOT NULL",((dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)).isoformat().encode(),))
    pid=p.query('SELECT pg_backend_pid()',rows=True)[0][0]
    # Deliberately unsafe original error accessor is confined to this baseline.
    p.lib.PQresultErrorField.argtypes=[C.c_void_p,C.c_int];p.lib.PQresultErrorField.restype=C.c_char_p
    p.lib.PQerrorMessage.argtypes=[C.c_void_p];p.lib.PQerrorMessage.restype=C.c_char_p
    seen={}
    def run():
        sql=b.CHANGE.replace('query_canceled OR OTHERS','OTHERS') if mode=='cancel' else b.CHANGE
        r=p.lib.PQexecParams(p.conn,sql.encode(),0,None,None,None,None,0)
        try:
            context=p.lib.PQresultErrorField(r,ord('W')) or b''
            seen['client_secret']=secret.encode() in context or secret.encode() in (p.lib.PQerrorMessage(p.conn) or b'')
        finally:p.lib.PQclear(r)
    thread=threading.Thread(target=run);thread.start();wait_lock(pid)
    root.query('SELECT '+('pg_cancel_backend' if mode=='cancel' else 'pg_terminate_backend')+'($1)',(pid.encode(),))
    thread.join(5);assert not thread.is_alive()
    if mode=='cancel':p.query('ROLLBACK')
    p.close();root.query('ROLLBACK');time.sleep(.5)
    log=Path('/proof/logs/server.log').read_text()
    seen['persistent_secret_hits']=log.count(secret)
    assert seen['client_secret'] and seen['persistent_secret_hits']>0, seen
    return seen
result['original_cancel']=baseline('cancel'); result['original_fatal']=baseline('fatal')
# Retain only redacted controls. Original historical evidence is elsewhere, untouched.
log=Path('/proof/logs/server.log').read_text()
for s in known:log=log.replace(s,'[SYNTHETIC_CONTROL_REDACTED]')
Path('/proof/control-redacted.log').write_text(log)
Path('/proof/logs/server.log').write_text('')
expiry=dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)
p=op()
def normal_hook(stage,pg):
    if stage=='staged': candidate()
result['initial']=b.provision(p,store,expiry,boundary=normal_hook);assert result['initial']=='APPLIED';p.close()
assert dt.datetime.fromisoformat(store.journal()['rotate_by'])<=dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=14)
q=op()
try:b.provision(q,store,dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=31),'rotate');raise AssertionError('overlong_expiry_accepted')
except b.Closed:result['overlong_expiry_rejected']=True
finally:q.close()
observe_secrets()
secret=store.read('active',True)
reader=b.Pg('/proof/ca.crt',b.READER,secret);b.wipe(secret)
result['tls']=reader.query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()',rows=True)
result['restrictions']=reader.query("SELECT current_setting('default_transaction_read_only'),current_setting('search_path')",rows=True)
assert result['restrictions']==[['on','pg_catalog']]
assert result['tls'][0][0]=='t'
assert verifiers and all(x.startswith('SCRAM-SHA-256$') for x in verifiers)
result['scram_authenticated']=True
root.query('CREATE TABLE public.builder_business(id integer)')
try:reader.query('SELECT * FROM public.builder_business');raise AssertionError('reader_table_access')
except b.Closed:result['reader_business_table_denied']=True
try:reader.query('CREATE TABLE public.builder_forbidden(id integer)');raise AssertionError('reader_write')
except b.Closed:result['reader_write_denied']=True
result['observer_visibility']={}
stage_pg=op();b.prepare(stage_pg)
stage_secret=store.read('active',True)
pending=threading.Thread(target=lambda:stage_pg.query("SELECT set_config('otr_builder.password',$1,true) IS NOT NULL FROM pg_sleep(0.4)",(stage_secret,)))
pending.start();time.sleep(.1)
for user in [b.READER,'app_observer','monitor_observer','supabase_admin']:
    c=reader if user==b.READER else b.Pg('/proof/ca.crt',user)
    activity=c.query('SELECT query FROM pg_stat_activity',rows=True)
    secret_seen=any(s in x[0] for x in activity for s in known+verifiers)
    denied=False
    try:c.query('SELECT rolpassword FROM pg_authid')
    except b.Closed:denied=True
    result['observer_visibility'][user]={'activity_secret':secret_seen,'verifier_access_denied':denied,
        'bound_query_visible':any('otr_builder.password' in x[0] for x in activity)}
    assert not secret_seen and (user=='supabase_admin' or denied)
    if c is not reader:c.close()
pending.join();stage_pg.query('ROLLBACK');stage_pg.close();b.wipe(stage_secret)
try:
    secret=store.read('active',True)
    extra=b.Pg('/proof/ca.crt',b.READER,secret)
    extra.close();raise AssertionError('connection_limit_bypassed')
except b.Closed:result['connection_limit_one']=True
finally:b.wipe(secret)
p=op();result['rotation']=b.provision(p,store,expiry,'rotate',normal_hook);assert result['rotation']=='APPLIED'
try:reader.query('SELECT 1');raise AssertionError('old_session_survived')
except b.Closed:result['old_session_retired']=True
reader.close();p.close();observe_secrets()
old=C.create_string_buffer(known[-2].encode())
try:b.Pg('/proof/ca.crt',b.READER,old);raise AssertionError('old_password_accepted')
except b.Closed:result['old_password_rejected']=True
finally:b.wipe(old)

def corrected_fault(mode):
    p=op();e=dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)
    worker=None
    def hook(stage,pg):
        nonlocal worker
        if stage=='staged':
            candidate()
            if mode=='lost_response':return
            if mode=='connection_failure':
                pg.lib.PQsocket.argtypes=[C.c_void_p];pg.lib.PQsocket.restype=C.c_int
                s=socket.socket(fileno=os.dup(pg.lib.PQsocket(pg.conn)))
                s.shutdown(socket.SHUT_RDWR);s.close();return
            if mode=='interrupted_rotation':raise KeyboardInterrupt()
            if mode=='error':pg.query("SELECT set_config('otr_builder.expiry','invalid',true) IS NOT NULL");return
            root.query('BEGIN');root.query("SELECT oid FROM pg_authid WHERE rolname='"+b.READER+"' FOR UPDATE")
            pid=pg.query('SELECT pg_backend_pid()',rows=True)[0][0]
            if mode=='timeout':pg.query("SET LOCAL statement_timeout='200ms'")
            def attack():
                wait_lock(pid)
                if mode!='timeout':root.query('SELECT '+('pg_terminate_backend' if mode=='fatal' else 'pg_cancel_backend')+'($1)',(pid.encode(),))
            worker=threading.Thread(target=attack);worker.start()
        elif stage=='before_commit' and mode=='lost_response':
            pg.lib.PQsendQueryParams.argtypes=pg.lib.PQexecParams.argtypes
            pg.lib.PQsendQueryParams.restype=C.c_int
            assert pg.lib.PQsendQueryParams(pg.conn,b'COMMIT',0,None,None,None,None,0)==1
            pg.lib.PQflush.argtypes=[C.c_void_p];pg.lib.PQflush.restype=C.c_int
            assert pg.lib.PQflush(pg.conn)==0
            for _ in range(100):
                if root.query(b.OBSERVE,rows=True)[0][0]=='t':break
                time.sleep(.01)
            else:raise AssertionError('commit_not_observed')
            pg.close();raise b.Closed() # Never consume the actual COMMIT response.
    state=b.provision(p,store,e,'rotate',hook)
    assert state=='UNKNOWN'
    if worker:worker.join(5);assert not worker.is_alive();root.query('ROLLBACK')
    q=op()
    # A second mutation is forbidden before authorized observation.
    try:b.provision(q,store,e,'rotate');raise AssertionError('automatic_retry_allowed')
    except b.Closed:pass
    reconciled=b.reconcile(q,store)
    if mode=='lost_response':
        assert reconciled=='APPLIED' and b.reconcile(q,store)=='APPLIED'
        observe_secrets()
        journal=store.journal();journal['state']='UNKNOWN';store.write('operation.json',journal)
        assert b.reconcile(q,store)=='APPLIED' # Crash after candidate->active, before journal commit.
        result['crash_after_custody_rename_recovered']=True
    else:
        assert reconciled=='UNKNOWN'
    result[mode]={'completion':state,'reconciled':reconciled,'retry_blocked':True}
    result[mode]['disable']=b.disable(q,store);assert b.reconcile(q,store)=='DORMANT'
    q.close();p.close()
    p=op();assert b.provision(p,store,expiry,boundary=normal_hook)=='APPLIED';p.close();observe_secrets()
for mode in ['cancel','timeout','fatal','error','connection_failure','interrupted_rotation','lost_response']:corrected_fault(mode)

# Wrong certificate identity and connection failure discard raw libpq diagnostics.
try:b.Pg('/proof/server.crt');raise AssertionError('untrusted_ca_accepted')
except b.Closed:result['tls_wrong_chain_rejected']=True
try:b.Pg('/proof/ca.crt',port=5433);raise AssertionError('unreachable_connected')
except b.Closed:result['connection_failure_before_secret']=True
secret=store.read('active',True);reader=b.Pg('/proof/ca.crt',b.READER,secret);b.wipe(secret)
root.query("ALTER ROLE otr_trip_publication_catalog_reader VALID UNTIL '2000-01-01T00:00:00Z'")
reader.query('SELECT 1');reader.close()
secret=store.read('active',True)
try:b.Pg('/proof/ca.crt',b.READER,secret);raise AssertionError('expired_password_accepted')
except b.Closed:result['expired_login_rejected']=True
finally:b.wipe(secret)
root.query("ALTER ROLE otr_trip_publication_catalog_reader VALID UNTIL '"+store.journal()['expiry']+"'")
secret=store.read('active',True);reader=b.Pg('/proof/ca.crt',b.READER,secret);b.wipe(secret)
p=op();assert b.disable(p,store)=='DORMANT';p.close()
try:reader.query('SELECT 1');raise AssertionError('disable_session_survived')
except b.Closed:result['emergency_disable_terminated']=True
reader.close();result['final_dormant']=root.query(b.OBSERVE,rows=True)
result['principal_preserved']=before==root.query(preserve,rows=True)
assert result['principal_preserved']
time.sleep(.2)
log=Path('/proof/logs/server.log').read_text()
statistics=root.query('SELECT query FROM public.pg_stat_statements',rows=True)
proc=b''
for path in Path('/proc').glob('[0-9]*'):
    for f in ('cmdline','environ'):
        try:proc+=(path/f).read_bytes()
        except (PermissionError,FileNotFoundError,ProcessLookupError):pass
result['corrected_log_secret_hits']=sum(log.count(s) for s in known+verifiers)
result['statistics_secret_hits']=sum(x[0].count(s) for x in statistics for s in known+verifiers)
result['process_secret_hits']=sum(proc.count(s.encode()) for s in known+verifiers)
result['retained_artifact_secret_hits']=0
for path in list(Path('/proof').rglob('*'))+list(Path('/custody').rglob('*')):
    if not path.is_file() or '/data/' in str(path):continue
    data=path.read_bytes()
    result['retained_artifact_secret_hits']+=sum(data.count(s.encode()) for s in known+verifiers)
assert not any(result[k] for k in ['corrected_log_secret_hits','statistics_secret_hits','process_secret_hits','retained_artifact_secret_hits'])
result['dump_controls']={'core_limit':list(__import__('resource').getrlimit(__import__('resource').RLIMIT_CORE)),
                         'dumpable':C.CDLL(None).prctl(3,0,0,0,0),'core_pattern':Path('/proc/sys/kernel/core_pattern').read_text().strip()}
result['custody_modes']={str(p.name):oct(p.stat().st_mode&0o777) for p in Path('/custody').iterdir()}
result['postgres_version']=root.query('SHOW server_version',rows=True)
Path('/proof/corrected-retained.log').write_text(log)
root.close();store.close()
print(json.dumps(result,indent=2))
