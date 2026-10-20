"""Synthetic only: no-network fixture maps the fixed DEV name to loopback."""
import ctypes as C
import datetime as dt
import json
import os
from pathlib import Path
import time
import catalog_reader_credential as b

b.harden_process()
root=b.Pg('/proof/ca.crt','supabase_admin')
admin=C.create_string_buffer(os.urandom(48).hex().encode())
known=[]; verifiers=[]; results={}
def operator(): return b.Pg('/proof/ca.crt',password=admin,host=b.DEV_HOST)
def closed(work):
    try: work()
    except b.Closed: return
    raise AssertionError('expected_closed')
def store(name):
    path='/custody/a4_'+name;os.mkdir(path,0o700);return b.Custody(path)
def expiry(): return dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)
def snapshot(s):
    for name in b.SECRET_ARTIFACTS:
        if s.exists(name):
            value=s.read(name,True)
            try:known.append(value.value.decode())
            finally:b.wipe(value)
    verifiers.extend(x[0] for x in root.query("SELECT rolpassword FROM pg_authid WHERE rolname='"+b.READER+"' AND rolpassword IS NOT NULL",rows=True))

for host in ['127.0.0.1','db.other.supabase.co',b.DEV_HOST+'.',b.DEV_HOST.upper(),'pooler.supabase.com','localhost/invalid']:
    closed(lambda:b.Pg('/proof/ca.crt',password=admin,host=host))
for port in [5433,6543]:closed(lambda:b.Pg('/proof/ca.crt',password=admin,host=b.DEV_HOST,port=port))
for user in ['supabase_admin','app_observer','monitor_observer']:
    closed(lambda:b.Pg('/proof/ca.crt',user,password=admin,host=b.DEV_HOST))
for password in [None,b'synthetic',C.create_string_buffer(b''),(C.c_char*2)(b'x',b'y')]:
    closed(lambda:b.Pg('/proof/ca.crt',password=password,host=b.DEV_HOST))
os.environ['PGHOST']='synthetic-unexpected-endpoint'
try:closed(operator)
finally:del os.environ['PGHOST']
closed(lambda:b.Pg('/proof/server.crt',password=admin,host=b.DEV_HOST))
results['endpoint_buffer_user_ca_negatives']=True

# A correct CA with the wrong server SAN must still fail. Runner restores the
# fixture's two-name certificate afterwards; no Hosted certificate is touched.
if os.path.exists('/proof/wrong-san'):
    closed(operator);results['wrong_san_rejected']=True
    print(json.dumps(results));root.close();b.wipe(admin);raise SystemExit()

p=operator();b.verify_disable_channel(p)
assert p.query('SELECT session_user,current_user,pg_is_in_recovery(),(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())',rows=True)==[['postgres','postgres','f','t']]
b.prepare(p);p.query('ROLLBACK');results['hosted_identity_and_controls']=True

# Challenge every operator predicate against actual connected Pg objects.
query=p.query
identity=query("SELECT current_database(),session_user,current_user,coalesce(current_setting('supabase.project_ref',true),''),(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),pg_has_role(session_user,'supabase_privileged_role','USAGE'),pg_has_role(session_user,'pg_signal_backend','USAGE'),(SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname=session_user),(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) OR EXISTS(SELECT FROM pg_auth_members WHERE roleid='"+b.READER+"'::regrole AND member=(SELECT oid FROM pg_roles WHERE rolname=session_user) AND admin_option)",rows=True)
for index,value in [(0,'other'),(1,'supabase_admin'),(2,b.READER),(3,'other-project'),(4,'f'),(5,'f'),(6,'f'),(7,'f'),(8,'f')]:
    bad=[identity[0].copy()];bad[0][index]=value
    p.query=lambda sql,*args,**kwargs:bad if 'SELECT current_database()' in sql else query(sql,*args,**kwargs)
    closed(lambda:b.verify_disable_channel(p))
p.query=query
results['nine_operator_identity_negatives']=True

# Fixture stamp is still mandatory on the original localhost branch.
local=b.Pg('/proof/ca.crt');local_query=local.query
local.query=lambda sql,*args,**kwargs:[['postgres','postgres','postgres','','t','t','t','t','t']] if 'SELECT current_database()' in sql else local_query(sql,*args,**kwargs)
closed(lambda:b.verify_disable_channel(local));local.close();p.close()
results['fixture_stamp_preserved']=True

s=store('normal');p=operator()
assert b.provision(p,s,expiry())=='APPLIED';snapshot(s)
assert b.reconcile(p,s)=='APPLIED'
value=s.read('active',True)
root.query('ALTER ROLE '+b.READER+' SET default_transaction_read_only=off')
closed(lambda:b.Pg('/proof/ca.crt',b.READER,value,host=b.DEV_HOST))
root.query('ALTER ROLE '+b.READER+' SET default_transaction_read_only=on')
reader=b.Pg('/proof/ca.crt',b.READER,value,host=b.DEV_HOST);b.wipe(value)
assert reader.query('SELECT session_user,current_user,current_setting(\'default_transaction_read_only\')',rows=True)==[[b.READER,b.READER,'on']]
reader.query('BEGIN READ ONLY');reader.query("SELECT public.trip_source_read_import_catalogs('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')");reader.query('ROLLBACK')
root.query('CREATE TABLE public.a4_business_private(value integer)')
closed(lambda:reader.query('SELECT * FROM public.a4_business_private'))
closed(lambda:reader.query('CREATE TABLE public.a4_unauthorized(value integer)'))
closed(lambda:reader.query('SET ROLE postgres'))
root.query('DROP TABLE public.a4_business_private')
results['reader_business_ddl_escalation_denied']=True
assert b.disable(p,s)=='UNAVAILABLE'
closed(lambda:reader.query('SELECT 1'));reader.close()
assert b.reconcile(p,s)=='UNAVAILABLE';closed(lambda:b.provision(p,s,expiry()))
assert s.journal()['state']=='CUSTODY_INCOMPLETE' and not s.secret_artifacts()
p.close();s.close();results['hosted_provision_reconcile_disable_and_custody']=True

# Committed fixture mutation with interrupted local acknowledgement reconciles via the
# same Hosted endpoint/CA. Never replay the fixed credential-changing block.
s=store('lost_ack');p=operator()
def lost(stage,pg):
    if stage=='committed':raise KeyboardInterrupt()
assert b.provision(p,s,expiry(),boundary=lost)=='UNKNOWN';snapshot(s)
p=operator();query=p.query
def no_replay(sql,*args,**kwargs):
    assert sql!=b.CHANGE
    return query(sql,*args,**kwargs)
p.query=no_replay
assert b.reconcile(p,s)=='APPLIED' and b.reconcile(p,s)=='APPLIED'
assert b.disable(p,s)=='UNAVAILABLE';p.close();s.close()
results['committed_unknown_no_replay']=True

time.sleep(.3)
log=Path('/proof/logs/server.log').read_bytes()
statistics=root.query('SELECT query FROM public.pg_stat_statements',rows=True)
assert all(secret.encode() not in log and all(secret not in row[0] for row in statistics) for secret in known+verifiers)
assert root.query(b.OBSERVE,rows=True)[0][:2]==['f','f']
assert root.query("SELECT count(*) FROM pg_stat_activity WHERE usename='"+b.READER+"'",rows=True)==[['0']]
results['secret_log_statistics_hits']=0
root.close();b.wipe(admin);print(json.dumps(results))
