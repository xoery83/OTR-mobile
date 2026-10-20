"""Network-none PostgreSQL fixture; synthetic secrets only, never Hosted."""
import ctypes as C
import datetime as dt
import json
import os
from pathlib import Path
import catalog_reader_credential as b

b.harden_process()
root=b.Pg('/proof/ca.crt','supabase_admin')
admin=C.create_string_buffer(b'SYNTHETIC_ADMIN_FIXTURE_ONLY')
results={}; known=[]; verifiers=[]
def pg(): return b.Pg('/proof/ca.crt',password=admin,host=b.DEV_HOST)
def expiry(): return dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)
def store(name,enabled=True):
    path='/custody/trusted_'+name;os.mkdir(path,0o700)
    return b.Custody(path,trusted_dev_project=b.DEV_PROJECT if enabled else None)
def closed(work):
    try: work()
    except (b.Closed,OSError): return
    raise AssertionError('EXPECTED_CLOSED')
def disabled():
    assert root.query(b.OBSERVE,rows=True)[0][:2]==['f','f']
    assert root.query("SELECT count(*) FROM pg_stat_activity WHERE usename='"+b.READER+"'",rows=True)==[['0']]
def capture(s):
    value=s.read('active',True)
    try: known.append(value.value.decode())
    finally: b.wipe(value)
    verifiers.extend(row[0] for row in root.query("SELECT rolpassword FROM pg_authid WHERE rolname='"+b.READER+"'",rows=True))
def file(s,name,value='SYNTHETIC_NONSECRET_METADATA'):
    p=Path(s.path)/name;p.write_text(value);p.chmod(0o600);return p

s=store('default',False);p=pg()
assert b.disable(p,s)=='UNAVAILABLE' and s.journal()['state']=='CUSTODY_INCOMPLETE'
p.close();s.close();results['original_default_unavailable']=True
closed(lambda:b.Custody('/custody',trusted_dev_project='other-project'))
s=store('binding');local=b.Pg('/proof/ca.crt')
closed(lambda:b.disable(local,s));local.close()
closed(lambda:b.Custody(s.path,trusted_dev_project=b.DEV_PROJECT))
p=pg();assert b.disable(p,s)=='COOPERATIVE_DORMANT';p.close();s.close()
results['dev_binding_and_exclusive_lock']=True

s=store('normal');p=pg()
assert b.disable(p,s)=='COOPERATIVE_DORMANT'
assert b.provision(p,s,expiry())=='APPLIED';capture(s)
value=s.read('active',True);reader=b.Pg('/proof/ca.crt',b.READER,value,host=b.DEV_HOST);b.wipe(value)
assert reader.query('SELECT session_user,current_user,pg_is_in_recovery()',rows=True)==[[b.READER,b.READER,'f']]
assert b.disable(p,s)=='COOPERATIVE_DORMANT';disabled();closed(lambda:reader.query('SELECT 1'));reader.close()
assert s.journal()['state']=='COOPERATIVE_DORMANT' and not s.secret_artifacts()
assert b.provision(p,s,expiry())=='APPLIED';capture(s)
assert b.disable(p,s)=='COOPERATIVE_DORMANT'
p.close();s.close();results['cooperative_lifecycle_and_session_retirement']=True

results['filesystem_negatives']={}
for fault in ['backup','alternate_candidate','temporary','unexpected_candidate','unexpected_staging','symlink','hardlink','directory','permissions','ownership','directory_mode','lock_replaced']:
    s=store(fault);p=pg()
    if fault=='directory_mode':Path(s.path).chmod(0o755)
    elif fault=='lock_replaced':
        (Path(s.path)/'lock').unlink();file(s,'lock','')
    elif fault=='symlink':(Path(s.path)/'unexpected').symlink_to('/proof/ca.crt')
    elif fault=='hardlink':
        file(s,'unexpected');os.link(Path(s.path)/'unexpected',Path(s.path)/'unexpected.link')
    elif fault=='directory':(Path(s.path)/'unexpected').mkdir()
    elif fault in ('permissions','ownership'):
        f=file(s,'active')
        if fault=='permissions':f.chmod(0o644)
        else:os.chown(f,100,100)
    else:file(s,{'backup':'active.bak','alternate_candidate':'candidate~','temporary':'.tmp','unexpected_candidate':'candidate','unexpected_staging':'candidate.new'}[fault])
    assert b.provision(p,s,expiry())=='UNAVAILABLE';disabled()
    p=pg();assert b.disable(p,s)=='UNAVAILABLE';disabled()
    p.close();s.close();results['filesystem_negatives'][fault]='UNAVAILABLE'

for phase in ['between_transitions','during_write','during_inventory']:
    s=store(phase);s.inventory();p=pg()
    if phase=='between_transitions':file(s,'journal-evidence-'+'a'*16+'.json',json.dumps({'artifact':'operation.json','sha256':'0'*64,'bytes':1}))
    elif phase=='during_write':
        original=s._write
        def changed(name,value):
            original(name,value);file(s,'unexpected.backup')
        s._write=changed
    else:
        listdir=os.listdir;hit=False
        def racing(fd):
            global hit
            names=listdir(fd)
            if fd==s.fd and not hit:
                hit=True;file(s,'unexpected.backup')
            return names
        os.listdir=racing
    try:result=b.provision(p,s,expiry())
    finally:
        if phase=='during_inventory':os.listdir=listdir
    assert result=='UNAVAILABLE';disabled()
    assert s.unavailable
    p=pg();assert b.disable(p,s)=='UNAVAILABLE';disabled()
    p.close();s.close()
results['observed_mutation_latches_unavailable']=True

for fault in ['damaged_journal','damaged_and_unknown']:
    s=store(fault);p=pg();assert b.provision(p,s,expiry())=='APPLIED';capture(s);p.close()
    value=s.read('active',True);reader=b.Pg('/proof/ca.crt',b.READER,value,host=b.DEV_HOST);b.wipe(value)
    path=s.path;s.close();file(s,'operation.json','DAMAGED_NONSECRET_JOURNAL')
    if fault=='damaged_and_unknown':file(s,'unexpected.backup')
    s=b.Custody(path,trusted_dev_project=b.DEV_PROJECT);p=pg()
    assert b.disable(p,s)==('UNAVAILABLE' if fault=='damaged_and_unknown' else 'COOPERATIVE_DORMANT')
    disabled();closed(lambda:reader.query('SELECT 1'));reader.close()
    if fault=='damaged_and_unknown':assert (Path(path)/'unexpected.backup').exists()
    p.close();s.close()
results['emergency_damaged_journal_unknown_files_and_sessions']=True

s=store('unknown');p=pg()
def lost(stage,_):
    if stage=='committed':raise KeyboardInterrupt()
assert b.provision(p,s,expiry(),boundary=lost)=='UNKNOWN'
p=pg();query=p.query
def no_replay(sql,*args,**kwargs):
    assert sql!=b.CHANGE
    return query(sql,*args,**kwargs)
p.query=no_replay
assert b.reconcile(p,s)=='APPLIED';capture(s)
assert b.reconcile(p,s)=='APPLIED'
assert b.disable(p,s)=='COOPERATIVE_DORMANT';disabled()
p.close();s.close();results['committed_unknown_reconciles_without_replay']=True

log=Path('/proof/logs/server.log').read_bytes()
statistics=root.query('SELECT query FROM public.pg_stat_statements',rows=True)
assert all(secret.encode() not in log and all(secret not in row[0] for row in statistics) for secret in known+verifiers)
results['secret_log_statistics_hits']=0
root.close();b.wipe(admin);print(json.dumps(results))
