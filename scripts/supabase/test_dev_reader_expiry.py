"""Synthetic expiry-only policy proof inside the existing tmpfs fixture."""
import datetime as dt
import catalog_reader_credential as b
b.harden_process()
store=b.Custody('/custody')
root=b.Pg('/proof/ca.crt','supabase_admin')
pg=b.Pg('/proof/ca.crt')
created=dt.datetime.now(dt.timezone.utc)
expiry=created+dt.timedelta(days=28)
assert b.provision(pg,store,expiry)=='APPLIED'
pg.close();pg=b.Pg('/proof/ca.crt')
journal=store.journal()
# Exercise the exact previously accepted legacy metadata shape.
legacy={'state':'APPLIED','operation':'initial','expiry':expiry.isoformat(),
        'rotate_by':(created+dt.timedelta(days=14)).isoformat(),'candidate_ready':True}
store.write('operation.json',legacy)
secret=store.read('active',True)
reader=b.Pg('/proof/ca.crt',b.READER,secret)
verifier=root.query("SELECT rolpassword FROM pg_authid WHERE rolname='"+b.READER+"'",rows=True)
session=reader.query('SELECT pg_backend_pid()',rows=True)
active_before=store.inventory(active=True)['active']
try:
    wrong=dict(legacy,expiry=(expiry+dt.timedelta(seconds=1)).isoformat())
    try:b.extend_dev_expiry(pg,store,created,wrong);raise AssertionError('mismatch_accepted')
    except b.Closed:pass
    assert store.journal()==legacy
    assert b.extend_dev_expiry(pg,store,created,legacy)=='APPLIED'
    assert reader.query('SELECT pg_backend_pid()',rows=True)==session
    assert root.query("SELECT rolpassword FROM pg_authid WHERE rolname='"+b.READER+"'",rows=True)==verifier
    assert store.inventory(active=True)['active']==active_before
    result=store.journal()
    assert result['expiry']==(created+dt.timedelta(days=90)).isoformat()
    assert result['remind_by']==(created+dt.timedelta(days=76)).isoformat()
    assert result['created_at']==created.isoformat() and 'rotate_by' not in result
    for field in ('remind_by','created_at'):
        broken=dict(result);del broken[field];store.write('operation.json',broken)
        try:store.journal();raise AssertionError('incomplete_policy_accepted')
        except b.Closed:pass
        store.write('operation.json',result)
    reader.close()
    reader=b.Pg('/proof/ca.crt',b.READER,secret)
    assert reader.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()',rows=True)==[['t']]
    assert reader.query('SELECT session_user',rows=True)==[[b.READER]]
    print('90_DAY_EXPIRY_PASSWORD_SESSION_TLS_AND_MISMATCH_CONTROLS_PASS')
finally:
    reader.close();b.wipe(secret)
    assert b.disable(pg,store)=='UNAVAILABLE'
    store.remove('operation.json')
    pg.close();root.close();store.close()
