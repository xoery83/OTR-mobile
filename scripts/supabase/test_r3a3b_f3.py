"""Disposable F3 allowlist probes. Complete race-free custody remains UNAVAILABLE."""
import ctypes as C
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import threading
import time
import catalog_reader_credential as b

b.harden_process()
root=b.Pg('/proof/ca.crt','supabase_admin'); results={}; known=[]; verifiers=[]
def pg(): return b.Pg('/proof/ca.crt')
def make(name):
    path='/custody/f3_'+str(os.getpid())+'_'+name; os.mkdir(path,0o700); return b.Custody(path)
def expiry(): return dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)
def disabled():
    assert root.query(b.OBSERVE,rows=True)[0][:2]==['f','f']
    assert root.query("SELECT count(*) FROM pg_stat_activity WHERE usename='"+b.READER+"'",rows=True)==[['0']]
def unavailable(s,p):
    assert b.reconcile(p,s)=='UNAVAILABLE'; disabled()
    assert s.journal()['state']=='CUSTODY_INCOMPLETE' and not s.secret_artifacts()
    s.inventory()
def candidate(s,name):
    value=C.create_string_buffer(os.urandom(32).hex().encode()); known.append(value.value.decode())
    try: s.write(name,value)
    finally: b.wipe(value)

# Original independently authored F3 block is executed unchanged.
source=Path('/proof/independent-f3.py').read_text()
prefix=source[:source.index('# Missing journal')]
prefix=prefix.replace('/custody/reviewer_','/custody/reviewer_'+str(os.getpid())+'_')
block=source[source.index('# An unexpected secret backup'):source.index('time.sleep(.3)')]
ns={'__name__':'original_f3_negative'};exec(compile(prefix+block,'independent-f3.py','exec'),ns)
assert ns['result']=='CUSTODY_INCOMPLETE' and ns['results']['unexpected_secret_backup']['retained']
known.extend(ns['known']);ns['root'].close()
results['original_backup_negative_closed']=True
results['original_block_sha256']=hashlib.sha256(block.encode()).hexdigest()

results['unknown_entries']={}
for label,name in [('regular','unknown'),('backup','active.bak'),('alternate','candidate~'),('hidden','.secret'),('staging','active.new')]:
    s=make(label);candidate(s,name);p=pg()
    before=os.stat(name,dir_fd=s.fd,follow_symlinks=False)
    assert b.disable(p,s)=='CUSTODY_INCOMPLETE' and s.exists(name);disabled()
    assert os.stat(name,dir_fd=s.fd,follow_symlinks=False).st_ino==before.st_ino
    try:b.provision(p,s,expiry());raise AssertionError('unknown_custody_authorized')
    except b.Closed:pass
    assert b.disable(p,s)=='CUSTODY_INCOMPLETE' and b.reconcile(p,s)=='CUSTODY_INCOMPLETE'
    s.remove(name);unavailable(s,p);p.close();s.close()
    results['unknown_entries'][label]='PRESERVED_INCOMPLETE'

results['unsafe_entries']={}
for label in ['symlink','hardlink','directory','permissions','ownership','metadata_content','lock_content','evidence_schema']:
    s=make(label); path=Path(s.path)/'unknown';outside=Path('/custody/f3_outside_'+label)
    outside.write_text('NONSECRET_TEST_SENTINEL');outside.chmod(0o600)
    if label=='symlink': path.symlink_to(outside)
    elif label=='hardlink':os.link(outside,path)
    elif label=='directory':
        path.mkdir();value=os.urandom(32).hex();known.append(value)
        (path/'nested-secret').write_text(value);(path/'nested-secret').chmod(0o600)
    elif label in ('permissions','ownership'):
        if label=='permissions':candidate(s,'unknown');path.chmod(0o644)
        else:
            path.parent.chmod(0o707)
            Path('/custody').chmod(0o711)
            try:root.query("COPY (SELECT 'NONSECRET_TEST_SENTINEL') TO '"+str(path)+"'")
            finally:path.parent.chmod(0o700);Path('/custody').chmod(0o700)
            assert path.stat().st_uid==100
    elif label=='metadata_content':
        name='journal-evidence-'+'a'*16+'.json';candidate(s,name);path=Path(s.path)/name
    elif label=='lock_content':
        path=Path(s.path)/'lock';candidate(s,'unknown');os.write(s.lock,b'UNRECOGNIZED_METADATA')
    else:
        name='journal-evidence-'+'b'*16+'.json';s.write(name,{'artifact':'operation.json','sha256':'0'*64,'bytes':1,'extra':'UNRECOGNIZED'});path=Path(s.path)/name
    p=pg();assert b.disable(p,s)=='CUSTODY_INCOMPLETE';disabled();assert path.exists()
    assert outside.read_text()=='NONSECRET_TEST_SENTINEL'
    # Explicit removal is solely test-owned fault teardown, never provisioner cleanup.
    if label=='directory':(path/'nested-secret').unlink();path.rmdir()
    elif label=='lock_content':os.ftruncate(s.lock,0);s.remove('unknown')
    else:path.unlink()
    outside.unlink();unavailable(s,p);p.close();s.close();results['unsafe_entries'][label]='CLOSED_PRESERVED'

# Known names are retired, but a stable clean snapshot cannot prove exclusion of root writers.
s=make('known');p=pg()
for name in b.SECRET_ARTIFACTS:candidate(s,name)
assert b.disable(p,s)=='UNAVAILABLE';unavailable(s,p);p.close();s.close()
results['known_leftovers']='REMOVED_NO_DORMANT_CLAIM'

# Observed concurrent mutation fails closed, including a valid metadata insertion.
results['concurrency']={}
for phase in ['during_inventory','between_snapshots']:
    s=make(phase);p=pg();listdir=os.listdir;write=s.write;hit=False
    def racing_listdir(fd):
        global hit
        names=listdir(fd)
        if fd==s.fd and not hit and phase=='during_inventory':
            hit=True;worker=threading.Thread(target=lambda:candidate(s,'concurrent.backup'))
            worker.start();worker.join(2);assert not worker.is_alive() and s.exists('concurrent.backup')
        return names
    def racing_write(name,value):
        global hit
        write(name,value)
        if isinstance(value,dict) and value.get('state')=='CUSTODY_INCOMPLETE' and not hit and phase=='between_snapshots':
            hit=True;write('journal-evidence-'+'c'*16+'.json',{'artifact':'operation.json','sha256':'0'*64,'bytes':1})
    os.listdir=racing_listdir;s.write=racing_write
    try:assert b.disable(p,s)=='CUSTODY_INCOMPLETE';disabled();assert hit
    finally:os.listdir=listdir;s.write=write
    if phase=='during_inventory':s.remove('concurrent.backup')
    unavailable(s,p);p.close();s.close();results['concurrency'][phase]='DETECTED_CLOSED'

# Database disable succeeds even when local intent/history is unusable.
results['emergency']={}
for fault in ['write_failure','damaged_and_unknown','unsafe_journal']:
    s=make(fault);p=pg();assert b.provision(p,s,expiry())=='APPLIED';p.close()
    v=s.read('active',True);known.append(v.value.decode());r=b.Pg('/proof/ca.crt',b.READER,v);b.wipe(v)
    verifiers.extend(x[0] for x in root.query("SELECT rolpassword FROM pg_authid WHERE rolname='"+b.READER+"'",rows=True))
    original=s.write
    if fault=='write_failure':s.write=lambda *_:(_ for _ in ()).throw(OSError('SYNTHETIC_IO'))
    elif fault=='damaged_and_unknown':
        fd=os.open('operation.json',os.O_WRONLY|os.O_TRUNC,dir_fd=s.fd);os.write(fd,b'{');os.close(fd);candidate(s,'credential.backup')
    else:
        s.remove('operation.json');os.symlink('/custody/no-target','operation.json',dir_fd=s.fd)
    p=pg();assert b.disable(p,s)=='CUSTODY_INCOMPLETE';disabled()
    try:r.query('SELECT 1');raise AssertionError('old_session_survived')
    except b.Closed:pass
    r.close();s.write=original
    if fault=='damaged_and_unknown':s.remove('credential.backup')
    if fault=='unsafe_journal':os.unlink('operation.json',dir_fd=s.fd)
    unavailable(s,p);assert b.disable(p,s)=='UNAVAILABLE';p.close();s.close()
    results['emergency'][fault]='DB_REVOKED_SESSIONS_TERMINATED_LOCAL_INCOMPLETE'

# Allowed hash-only history stays byte-identical; invalid JSON duplicates are rejected.
s=make('metadata');name='journal-evidence-'+'d'*16+'.json'
s.write(name,{'artifact':'operation.json','sha256':'0'*64,'bytes':10});before=(Path(s.path)/name).read_bytes()
p=pg();assert b.disable(p,s)=='UNAVAILABLE';unavailable(s,p)
assert (Path(s.path)/name).read_bytes()==before
assert set(s.inventory())=={'lock','operation.json',name}
results['valid_metadata_snapshot']='CHECKED_BUT_COMPLETE_CUSTODY_UNAVAILABLE'
fd=os.open(name,os.O_WRONLY|os.O_TRUNC,dir_fd=s.fd)
os.write(fd,b'{"artifact":"secret","artifact":"operation.json","sha256":"'+b'0'*64+b'","bytes":10}');os.close(fd)
assert b.disable(p,s)=='CUSTODY_INCOMPLETE';s.remove(name);unavailable(s,p);p.close();s.close()
results['duplicate_metadata']='CLOSED'

time.sleep(.3);log=Path('/proof/logs/server.log').read_text()
stats=root.query('SELECT query FROM public.pg_stat_statements',rows=True)
process=b''
for path in Path('/proc').glob('[0-9]*'):
    for name in ('cmdline','environ'):
        try:process+=(path/name).read_bytes()
        except OSError:pass
artifacts=b''.join(path.read_bytes() for path in Path('/custody').rglob('*') if path.is_file())
results['log_secret_hits']=sum(log.count(s) for s in known+verifiers)
results['statistics_secret_hits']=sum(row[0].count(s) for row in stats for s in known+verifiers)
results['process_secret_hits']=sum(process.count(s.encode()) for s in known+verifiers)
results['retained_secret_hits']=sum(artifacts.count(s.encode()) for s in known+verifiers)
assert not any(results[k] for k in ('log_secret_hits','statistics_secret_hits','process_secret_hits','retained_secret_hits'))
disabled();Path('/proof/f3-corrected.log').write_text(log);root.close();print(json.dumps(results,indent=2))
