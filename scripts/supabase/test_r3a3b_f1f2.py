"""Disposable-only F1/F2 challenges; never exports secrets or raw diagnostics."""
import ctypes as C
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import time
import catalog_reader_credential as b

b.harden_process()
results={}; known=[]; verifiers=[]
root=b.Pg('/proof/ca.crt','supabase_admin')
def pg(): return b.Pg('/proof/ca.crt')
def store(name):
    path='/custody/'+name;os.mkdir(path,0o700);return b.Custody(path)
def expiry(): return dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)
def snapshot(s):
    for name in b.SECRET_ARTIFACTS:
        if s.exists(name):
            try:value=s.read(name,True)
            except (OSError,b.Closed):continue
            try:known.append(value.value.decode())
            finally:b.wipe(value)
    q=b.Pg('/proof/ca.crt','supabase_admin')
    verifiers.extend(x[0] for x in q.query("SELECT rolpassword FROM pg_authid WHERE rolname='"+b.READER+"' AND rolpassword IS NOT NULL",rows=True));q.close()
original_disable=b.disable;original_provision=b.provision
def observed_disable(p,s):snapshot(s);return original_disable(p,s)
def observed_provision(p,s,*args,**kwargs):
    try:return original_provision(p,s,*args,**kwargs)
    finally:snapshot(s)
b.disable=observed_disable;b.provision=observed_provision
def dormant(s):
    assert root.query(b.OBSERVE,rows=True)[0][:2]==['f','f']
    assert root.query("SELECT count(*) FROM pg_stat_activity WHERE usename='"+b.READER+"'",rows=True)==[['0']]
    assert not s.secret_artifacts() and not s.exists('operation.json.new')
    assert s.journal()['state']=='CUSTODY_INCOMPLETE'
def close(s,p):p.close();s.close()

# Execute original independent negative blocks byte-for-byte, including their
# old vulnerability assertions. Corrected behavior must invalidate those assertions.
source=Path('/proof/independent-challenge.py').read_text()
ns={'__name__':'unchanged_independent_negative'}
prefix=source[:source.index('# Actual SIGKILL')]
exec(compile(prefix,'independent-challenge.py','exec'),ns)
positive=source[source.index('# Actual SIGKILL'):source.index('# Actual crash while')]
exec(compile(positive,'independent-crash-recovery.py','exec'),ns)
results['unchanged_actual_sigkill_recovery']=ns['results'].copy()
blocks=[('F1',source[source.index('# Actual crash while'):source.index('# Failed candidate file')]),
        ('F2',source[source.index('# Failed candidate file'):source.index('# Unsafe settings')])]
for name,block in blocks:
    try:exec(compile(block,'independent-'+name+'.py','exec'),ns)
    except (AssertionError,FileNotFoundError):pass
    else:raise AssertionError('original_negative_still_passes_'+name)
    s=ns['s'];p=ns['p'];dormant(s)
    results[name+'_unchanged_negative_closed']=True
    results[name+'_probe_sha256']=hashlib.sha256(block.encode()).hexdigest()
    close(s,p)
ns['root'].close()

results['journal_faults']={}
for phase in ['before_write','partial_write','after_fsync','after_rename','directory_sync']:
    s=store('journal_'+phase);s.write('operation.json',{'state':'DORMANT','operation':'disable'})
    old=os.open;write=os.write;replace=os.replace;fsync=os.fsync;hit=False
    def badopen(name,*args,**kwargs):
        global hit
        if name=='operation.json.new' and phase=='before_write':hit=True;raise OSError('SYNTHETIC_IO')
        return old(name,*args,**kwargs)
    def badwrite(fd,data):
        global hit
        if phase=='partial_write' and os.readlink('/proc/self/fd/'+str(fd)).endswith('/operation.json.new'):
            write(fd,data[:7]);hit=True;raise OSError('SYNTHETIC_IO')
        return write(fd,data)
    def badreplace(src,dst,**kwargs):
        global hit
        if src=='operation.json.new' and phase=='after_fsync':hit=True;raise OSError('SYNTHETIC_IO')
        value=replace(src,dst,**kwargs)
        if src=='operation.json.new' and phase=='after_rename':hit=True;raise OSError('SYNTHETIC_IO')
        return value
    def badsync(fd):
        global hit
        if fd==s.fd and phase=='directory_sync':hit=True;raise OSError('SYNTHETIC_IO')
        return fsync(fd)
    os.open=badopen;os.write=badwrite;os.replace=badreplace;os.fsync=badsync
    try:
        try:s.write('operation.json',{'state':'UNKNOWN','operation':'initial'});raise AssertionError('fault_not_reached')
        except OSError:pass
    finally:os.open=old;os.write=write;os.replace=replace;os.fsync=fsync
    assert hit
    intact=s.read('operation.json');assert intact['state'] in ('DORMANT','UNKNOWN')
    p=pg();assert b.disable(p,s)=='UNAVAILABLE';dormant(s);close(s,p)
    results['journal_faults'][phase]='ATOMIC_AND_RECOVERED'

results['malformed_journal']={}
for name,text in [('partial','{'),('schema','{"state":"DORMANT"}'),('type','[]'),('secret_field',None)]:
    s=store('corrupt_'+name);p=pg();assert b.provision(p,s,expiry())=='APPLIED';p.close()
    if text is None:
        secret=os.urandom(32).hex();known.append(secret)
        text=json.dumps({'state':'DORMANT','operation':'disable','secret':secret})
    fd=os.open('operation.json',os.O_WRONLY|os.O_TRUNC,dir_fd=s.fd);os.write(fd,text.encode());os.fsync(fd);os.close(fd)
    p=pg()
    try:b.provision(p,s,expiry(),'rotate');raise AssertionError('corrupt_journal_authorized_rotation')
    except b.Closed:pass
    assert b.reconcile(p,s)=='UNKNOWN'
    assert b.disable(p,s)=='UNAVAILABLE';dormant(s)
    assert list(Path('/custody/corrupt_'+name).glob('journal-evidence-*.json'))
    results['malformed_journal'][name]='NO_REPLAY_DISABLE_VERIFIED';close(s,p)

results['candidate_faults']={}
for phase in ['fsync','before_rename','after_rename']:
    s=store('candidate_'+phase);p=pg();sync=os.fsync;replace=os.replace;hit=False
    def badsync(fd):
        global hit
        if phase=='fsync' and os.readlink('/proc/self/fd/'+str(fd)).endswith('/candidate.new'):hit=True;raise OSError('SYNTHETIC_IO')
        return sync(fd)
    def badreplace(src,dst,**kwargs):
        global hit
        if src=='candidate.new' and phase=='before_rename':hit=True;raise OSError('SYNTHETIC_IO')
        value=replace(src,dst,**kwargs)
        if src=='candidate.new' and phase=='after_rename':hit=True;raise OSError('SYNTHETIC_IO')
        return value
    os.fsync=badsync;os.replace=badreplace
    try:assert b.provision(p,s,expiry())=='UNKNOWN'
    finally:os.fsync=sync;os.replace=replace
    assert hit and s.secret_artifacts();p=pg()
    assert b.reconcile(p,s)=='UNAVAILABLE';dormant(s);close(s,p)
    results['candidate_faults'][phase]='UNKNOWN_THEN_CHECKED_UNAVAILABLE'

# Both unlink failure and removal durability failure must be truthful incomplete custody.
results['cleanup_faults']={}
for phase in ['unlink','directory_sync']:
    s=store('cleanup_'+phase);p=pg();assert b.provision(p,s,expiry())=='APPLIED';p.close()
    value=C.create_string_buffer(os.urandom(32).hex().encode());known.append(value.value.decode());s.write('candidate',value);b.wipe(value)
    unlink=os.unlink;sync=os.fsync
    def badunlink(name,**kwargs):
        if name=='candidate' and phase=='unlink':raise OSError('SYNTHETIC_IO')
        return unlink(name,**kwargs)
    def badsync(fd):
        if fd==s.fd and phase=='directory_sync' and not s.exists('candidate'):raise OSError('SYNTHETIC_IO')
        return sync(fd)
    os.unlink=badunlink;os.fsync=badsync
    try:p=pg();state=b.disable(p,s);assert state=='CUSTODY_INCOMPLETE'
    finally:os.unlink=unlink;os.fsync=sync;p.close()
    assert root.query(b.OBSERVE,rows=True)[0][:2]==['f','f']
    p=pg()
    try:b.provision(p,s,expiry());raise AssertionError('incomplete_custody_authorized')
    except b.Closed:pass
    assert b.reconcile(p,s)=='UNAVAILABLE';dormant(s);close(s,p)
    results['cleanup_faults'][phase]='INCOMPLETE_THEN_CHECKED_UNAVAILABLE'

# A stale journal cannot supply project/channel authorization or broaden cleanup.
s=store('guard');p=pg();assert b.provision(p,s,expiry())=='APPLIED';p.close()
fd=os.open('operation.json',os.O_WRONLY|os.O_TRUNC,dir_fd=s.fd);os.write(fd,b'{');os.close(fd)
sentinel=Path('/custody/guard/unrelated.env');sentinel.write_text('NONSECRET_UNRELATED_SENTINEL');sentinel.chmod(0o600)
before=root.query(b.OBSERVE,rows=True)
root.query("COMMENT ON DATABASE postgres IS 'OTR_DISPOSABLE_DEV:wrong-project'")
p=pg()
try:
    try:b.disable(p,s);raise AssertionError('wrong_project_disabled')
    except b.Closed:pass
finally:p.close();root.query("COMMENT ON DATABASE postgres IS '"+b.FIXTURE_PROJECT+"'")
assert root.query(b.OBSERVE,rows=True)==before
p=b.Pg('/proof/ca.crt','app_observer')
try:
    try:b.disable(p,s);raise AssertionError('ordinary_role_disabled')
    except b.Closed:pass
finally:p.close()
assert root.query(b.OBSERVE,rows=True)==before
p=pg();assert b.disable(p,s)=='CUSTODY_INCOMPLETE'
assert sentinel.read_text()=='NONSECRET_UNRELATED_SENTINEL'
sentinel.unlink();assert b.reconcile(p,s)=='UNAVAILABLE';dormant(s)
results['project_admin_guard']='INDEPENDENT_OF_DAMAGED_JOURNAL';results['unrelated_artifact_preserved']=True
close(s,p)

# Unsafe staging must not be followed/deleted, and must never produce DORMANT.
results['unsafe_staging']={}
for mode in ['symlink','mode','hardlink','fifo']:
    s=store('unsafe_'+mode);path=Path('/custody/unsafe_'+mode+'/candidate.new')
    unrelated=path.parent/'unrelated';unrelated.write_text('NONSECRET_SENTINEL');unrelated.chmod(0o600)
    if mode=='symlink':path.symlink_to(unrelated)
    elif mode=='hardlink':os.link(unrelated,path)
    elif mode=='fifo':os.mkfifo(path,0o600)
    else:path.write_text('NONSECRET_SENTINEL');path.chmod(0o644)
    p=pg();assert b.disable(p,s)=='CUSTODY_INCOMPLETE';assert unrelated.read_text()=='NONSECRET_SENTINEL'
    assert path.exists();results['unsafe_staging'][mode]='INCOMPLETE_NOT_DELETED'
    # Test-owned unsafe sentinel only, removed by the harness after the assertion.
    path.unlink();unrelated.unlink();assert b.reconcile(p,s)=='UNAVAILABLE';dormant(s);close(s,p)

# A failure writing the final disabled journal must not return success.
s=store('disabled_final_journal');p=pg();assert b.provision(p,s,expiry())=='APPLIED';p.close()
original=s.write
def fail_final(name,value):
    if name=='operation.json' and value.get('state')=='CUSTODY_INCOMPLETE':raise OSError('SYNTHETIC_IO')
    return original(name,value)
s.write=fail_final;p=pg();assert b.disable(p,s)=='CUSTODY_INCOMPLETE';s.write=original;p.close()
assert root.query(b.OBSERVE,rows=True)[0][:2]==['f','f']
p=pg();assert b.reconcile(p,s)=='UNAVAILABLE';dormant(s);close(s,p)
results['disabled_journal_failure']='INCOMPLETE_THEN_OBSERVED_DISABLED_UNAVAILABLE'

s=store('semantic_corruption');p=pg()
s.write('operation.json',{'state':'APPLIED','operation':'rotate','expiry':expiry().isoformat(),'rotate_by':expiry().isoformat()})
value=C.create_string_buffer(os.urandom(32).hex().encode());known.append(value.value.decode());s.write('active',value);b.wipe(value)
for operation in ('initial','rotate'):
    try:b.provision(p,s,expiry(),operation);raise AssertionError('journal_overrode_actual_dormant_role')
    except b.Closed:pass
assert b.reconcile(p,s)=='UNAVAILABLE';dormant(s);close(s,p)
results['journal_cannot_override_actual_role']='NO_NEW_PROVISIONING'

time.sleep(.3)
log=Path('/proof/logs/server.log').read_text();statistics=root.query('SELECT query FROM public.pg_stat_statements',rows=True)
results['log_secret_hits']=sum(log.count(s) for s in known+verifiers)
results['statistics_secret_hits']=sum(x[0].count(s) for x in statistics for s in known+verifiers)
process=b''
for path in Path('/proc').glob('[0-9]*'):
    for name in ('cmdline','environ'):
        try:process+=(path/name).read_bytes()
        except (OSError,PermissionError):pass
results['process_secret_hits']=sum(process.count(s.encode()) for s in known+verifiers)
results['retained_staging_secret_hits']=0
for path in Path('/custody').rglob('*'):
    if path.is_file():results['retained_staging_secret_hits']+=sum(path.read_bytes().count(s.encode()) for s in known+verifiers)
assert results['log_secret_hits']==results['statistics_secret_hits']==results['retained_staging_secret_hits']==results['process_secret_hits']==0
assert root.query(b.OBSERVE,rows=True)[0][:2]==['f','f']
Path('/proof/f1f2-corrected.log').write_text(log)
root.close();print(json.dumps(results,indent=2))
