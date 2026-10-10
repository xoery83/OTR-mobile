"""Dormant, fixed-identity fixture Builder. No CLI or Hosted activation path."""
import ctypes as C
import ctypes.util
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import resource
import secrets
import select
import stat
import sys
import time

READER = 'otr_trip_publication_catalog_reader'
FIXTURE_PROJECT = 'OTR_DISPOSABLE_DEV:tuqigdxrvrerfewsxqgm'
SECRET_ARTIFACTS = ('candidate', 'candidate.new', 'active')
SETTINGS = {
    'log_statement': 'none', 'log_min_messages': 'panic',
    'log_min_error_statement': 'panic', 'log_min_duration_statement': '-1',
    'log_duration': 'off', 'log_parameter_max_length': '0',
    'log_parameter_max_length_on_error': '0', 'pgaudit.log': 'none',
    'pgaudit.log_statement': 'off', 'pg_stat_statements.track': 'none',
    'pg_stat_statements.track_utility': 'off', 'auto_explain.log_min_duration': '-1',
}
CHANGE = """DO $credential$ BEGIN
 EXECUTE format('ALTER ROLE otr_trip_publication_catalog_reader LOGIN PASSWORD %L VALID UNTIL %L',
 current_setting('otr_builder.password'),current_setting('otr_builder.expiry'));
 EXCEPTION WHEN query_canceled OR OTHERS THEN
 RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='READER_CREDENTIAL_CHANGE_FAILED';
 END $credential$"""
OBSERVE = """SELECT rolcanlogin,rolpassword IS NOT NULL,rolvaliduntil::text,
 NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
 AND rolconnlimit=1 FROM pg_authid WHERE rolname='otr_trip_publication_catalog_reader'"""


class Closed(Exception):
    def __init__(self):
        super().__init__('CREDENTIAL_OPERATION_CLOSED')


def harden_process():
    if sys.platform != 'linux' or os.getuid() != 0:
        raise Closed()
    if any(k.startswith('PG') or 'PASSWORD' in k or k == 'LD_PRELOAD' for k in os.environ):
        raise Closed()
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    libc = C.CDLL(None)
    if libc.prctl(4, 0, 0, 0, 0) != 0 or libc.prctl(3, 0, 0, 0, 0) != 0:
        raise Closed()
    os.umask(0o077)


def wipe(value):
    if value:
        C.memset(C.addressof(value), 0, C.sizeof(value))


class Pg:
    """Never call libpq error-text accessors: FATAL context may contain a secret."""
    def __init__(self, ca, user='postgres', password=None, port=5432):
        self.lib = C.CDLL(ctypes.util.find_library('pq'))
        signatures = {
            'PQconnectStartParams': ([C.POINTER(C.c_char_p), C.POINTER(C.c_char_p), C.c_int], C.c_void_p),
            'PQconnectPoll': ([C.c_void_p], C.c_int), 'PQsocket': ([C.c_void_p], C.c_int),
            'PQstatus': ([C.c_void_p], C.c_int), 'PQfinish': ([C.c_void_p], None),
            'PQexecParams': ([C.c_void_p,C.c_char_p,C.c_int,C.c_void_p,C.POINTER(C.c_char_p),C.c_void_p,C.c_void_p,C.c_int], C.c_void_p),
            'PQresultStatus': ([C.c_void_p], C.c_int), 'PQclear': ([C.c_void_p], None),
            'PQntuples': ([C.c_void_p], C.c_int), 'PQnfields': ([C.c_void_p], C.c_int),
            'PQgetvalue': ([C.c_void_p,C.c_int,C.c_int], C.c_char_p),
        }
        for name,(args,result) in signatures.items():
            fn = getattr(self.lib,name); fn.argtypes=args; fn.restype=result
        if user not in ('postgres','supabase_admin',READER,'app_observer','monitor_observer'):
            raise Closed()
        # shortcut: only loopback disposable Primary is reachable; a separately reviewed
        # Hosted activation must pin the accepted DEV hostname and administrative custody.
        options = {'host':b'localhost','port':str(port).encode(),'dbname':b'postgres',
                   'user':user.encode(),'password':b'','sslmode':b'verify-full',
                   'sslrootcert':os.fsencode(ca),'connect_timeout':b'2',
                   'application_name':b'otr-dormant-credential-builder','passfile':b'/proof/no-passfile'}
        keys=(C.c_char_p*(len(options)+1))(*[k.encode() for k in options],None)
        values=(C.c_char_p*(len(options)+1))(*options.values(),None)
        if password is not None:
            values[list(options).index('password')]=C.cast(password,C.c_char_p)
        self.conn=self.lib.PQconnectStartParams(keys,values,0)
        if not self.conn: raise Closed()
        self.notice=C.CFUNCTYPE(None,C.c_void_p,C.c_void_p)(lambda _arg,_text: None)
        self.lib.PQsetNoticeProcessor.argtypes=[C.c_void_p,type(self.notice),C.c_void_p]
        self.lib.PQsetNoticeProcessor(self.conn,self.notice,None)
        deadline=time.monotonic()+2
        try:
            while True:
                state=self.lib.PQconnectPoll(self.conn)
                if state==3: break
                if state==0 or time.monotonic()>=deadline: raise Closed()
                if state==4: continue
                fd=self.lib.PQsocket(self.conn)
                if fd<0: raise Closed()
                select.select([fd] if state==1 else [],[fd] if state==2 else [],[],max(0,deadline-time.monotonic()))
            self.query("SET search_path='pg_catalog'")
            self.query("SET statement_timeout='5s'")
            self.query("SET lock_timeout='1s'")
            self.query("SET idle_in_transaction_session_timeout='5s'")
            if self.query('SELECT pg_is_in_recovery()',rows=True)!=[['f']]: raise Closed()
        except BaseException:
            self.close(); raise Closed() from None

    def query(self, sql, parameters=(), rows=False):
        values=(C.c_char_p*len(parameters))(*[C.cast(p,C.c_char_p) if isinstance(p,C.Array) else p for p in parameters])
        result=self.lib.PQexecParams(self.conn,sql.encode(),len(parameters),None,values,None,None,0)
        try:
            if not result or self.lib.PQresultStatus(result) not in (1,2):
                raise Closed()
            # Only explicitly non-secret observation queries may return rows.
            return [[self.lib.PQgetvalue(result,i,j).decode() for j in range(self.lib.PQnfields(result))]
                    for i in range(self.lib.PQntuples(result))] if rows else None
        finally:
            if result: self.lib.PQclear(result)

    def close(self):
        if getattr(self,'conn',None): self.lib.PQfinish(self.conn); self.conn=None


class Custody:
    """Dedicated existing root-private DEV subtree; synthetic tests use tmpfs."""
    def __init__(self,path):
        harden_process()
        if not os.path.isabs(path) or os.path.normpath(path)!=path: raise Closed()
        ancestor=path
        while ancestor:
            parent_info=os.lstat(ancestor)
            if not stat.S_ISDIR(parent_info.st_mode) or parent_info.st_uid!=0 or parent_info.st_mode&0o022:
                raise Closed()
            if ancestor=='/': break
            ancestor=os.path.dirname(ancestor)
        info=os.lstat(path)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:
            raise Closed()
        self.path=path
        self.fd=os.open(path,os.O_DIRECTORY|os.O_NOFOLLOW)
        self.lock=os.open('lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600,dir_fd=self.fd)
        self.check(self.lock)
        fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)

    @staticmethod
    def check(fd):
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1:
            raise Closed()

    def read(self,name,secret=False):
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=self.fd)
        try:
            self.check(fd)
            if os.fstat(fd).st_size>4096: raise Closed()
            if secret:
                size=os.fstat(fd).st_size
                b=C.create_string_buffer(size+1)
                with os.fdopen(os.dup(fd),'rb',buffering=0) as f:
                    if f.readinto(b)!=size:
                        wipe(b); raise Closed()
                return b
            data=os.read(fd,4096)
            value=json.loads(data)
            if data!=json.dumps(value).encode(): raise Closed()
            return value
        finally: os.close(fd)

    def write(self,name,value):
        # The fixed private staging name is recovered only by authorized reconciliation.
        fd=os.open(name+'.new',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=self.fd)
        try:
            self.check(fd)
            data=memoryview(value).cast('B')[:-1] if isinstance(value,C.Array) else json.dumps(value).encode()
            while data:
                n=os.write(fd,data)
                if n<=0: raise Closed()
                data=data[n:]
            os.fsync(fd)
        finally: os.close(fd)
        os.replace(name+'.new',name,src_dir_fd=self.fd,dst_dir_fd=self.fd)
        os.fsync(self.fd)

    def remove(self,name):
        try: os.unlink(name,dir_fd=self.fd)
        except FileNotFoundError: pass
        os.fsync(self.fd)

    def journal(self):
        if self.exists('operation.json.new'): raise Closed()
        try:
            value=self.read('operation.json')
            if not isinstance(value,dict) or set(value)-{'state','operation','expiry','rotate_by','candidate_ready'}:
                raise Closed()
            if value.get('state') not in ('UNKNOWN','APPLIED','DORMANT','CUSTODY_INCOMPLETE') or value.get('operation') not in ('initial','rotate','disable','reconcile'):
                raise Closed()
            if 'candidate_ready' in value and type(value['candidate_ready']) is not bool: raise Closed()
            for name in ('expiry','rotate_by'):
                if name in value:
                    date=dt.datetime.fromisoformat(value[name])
                    if date.tzinfo is None: raise Closed()
            if (value['state']=='APPLIED' or value.get('candidate_ready')) and not {'expiry','rotate_by'}<=set(value): raise Closed()
            return value
        except FileNotFoundError: return None
        except (ValueError,TypeError): raise Closed() from None

    def exists(self,name):
        try: os.stat(name,dir_fd=self.fd,follow_symlinks=False); return True
        except FileNotFoundError: return False

    def preserve_damage(self,name,remove=False):
        """Hash checked damage; never archive arbitrary malformed plaintext."""
        if not self.exists(name): return
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=self.fd)
        digest=hashlib.sha256(); size=0; buffer=bytearray(4096)
        try:
            self.check(fd)
            with os.fdopen(os.dup(fd),'rb',buffering=0) as file:
                while (count:=file.readinto(buffer)):
                    digest.update(memoryview(buffer)[:count]); size+=count
        finally:
            buffer[:]=b'\0'*len(buffer); os.close(fd)
        self.write('journal-evidence-'+secrets.token_hex(8)+'.json',
                   {'artifact':name,'sha256':digest.hexdigest(),'bytes':size})
        if remove: self.remove(name)

    def recover_journal_staging(self):
        self.preserve_damage('operation.json.new',remove=True)
        try: self.journal()
        except Closed: self.preserve_damage('operation.json')

    def secret_artifacts(self):
        return [name for name in SECRET_ARTIFACTS if self.exists(name)]

    def retire_secrets(self):
        # Check the exact tool-owned namespace before unlinking; never glob credentials.
        names=self.secret_artifacts()
        for name in names:
            fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=self.fd)
            try: self.check(fd)
            finally: os.close(fd)
        for name in names: self.remove(name)
        os.fsync(self.fd)
        if self.secret_artifacts(): raise Closed()

    def inventory(self,active=False):
        """Checked snapshot under the existing exclusive custodian lock; no unknown IO."""
        directory=os.fstat(self.fd)
        path=os.lstat(self.path)
        if (directory.st_dev,directory.st_ino)!=(path.st_dev,path.st_ino) or not stat.S_ISDIR(path.st_mode) or path.st_uid!=0 or stat.S_IMODE(path.st_mode)!=0o700:
            raise Closed()
        names=os.listdir(self.fd)
        if len(names)>256 or 'lock' not in names: raise Closed()
        snapshot={}
        for name in names:
            evidence=re.fullmatch(r'journal-evidence-[0-9a-f]{16}\.json',name)
            if name not in ('lock','operation.json') and not evidence and not (active and name=='active'):
                raise Closed()
            fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=self.fd)
            try:
                self.check(fd); info=os.fstat(fd)
                if info.st_size>4096: raise Closed()
                if name=='lock':
                    if info.st_size or (info.st_dev,info.st_ino)!=(os.fstat(self.lock).st_dev,os.fstat(self.lock).st_ino): raise Closed()
                elif name=='operation.json': self.journal()
                elif evidence:
                    try: value=self.read(name)
                    except (ValueError,TypeError): raise Closed() from None
                    if not isinstance(value,dict) or set(value)!={'artifact','sha256','bytes'} or value['artifact'] not in ('operation.json','operation.json.new') or not isinstance(value['sha256'],str) or not re.fullmatch(r'[0-9a-f]{64}',value['sha256']) or type(value['bytes']) is not int or value['bytes']<0:
                        raise Closed()
                after=os.stat(name,dir_fd=self.fd,follow_symlinks=False)
                signature=lambda s:(s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
                if signature(info)!=signature(os.fstat(fd)) or signature(info)!=signature(after): raise Closed()
                snapshot[name]=signature(info)
            finally: os.close(fd)
        after=os.fstat(self.fd)
        if (directory.st_mtime_ns,directory.st_ctime_ns)!=(after.st_mtime_ns,after.st_ctime_ns): raise Closed()
        return snapshot

    def close(self):
        os.close(self.lock); os.close(self.fd)


def prepare(pg):
    pg.query('BEGIN')
    for k,v in SETTINGS.items():
        pg.query("SET LOCAL "+k+"='"+v+"'")
        if pg.query('SELECT current_setting($1)',(k.encode(),),rows=True)!=[[v]]: raise Closed()
    for k,v in {'log_transaction_sample_rate':'0',
                'log_min_duration_sample':'-1','pgaudit.log_client':'off',
                'password_encryption':'scram-sha-256'}.items():
        if pg.query('SELECT current_setting($1)',(k.encode(),),rows=True)!=[[v]]: raise Closed()


def retire(pg):
    pg.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='otr_trip_publication_catalog_reader' AND pid<>pg_backend_pid()")
    # termination is asynchronous; bounded non-secret observation, no mutation retry.
    import time
    for _ in range(100):
        if pg.query("SELECT count(*) FROM pg_stat_activity WHERE usename='otr_trip_publication_catalog_reader'",rows=True)==[['0']]: return
        time.sleep(0.02)
    raise Closed()


def verify_disable_channel(pg):
    # Independent of custody/journal. The fixture-only stamp cannot activate Hosted.
    if not isinstance(pg,Pg) or not pg.conn: raise Closed()
    identity=pg.query("""SELECT current_database(),session_user,current_user,
      shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database'),
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
      pg_has_role(session_user,'supabase_privileged_role','USAGE'),
      pg_has_role(session_user,'pg_signal_backend','USAGE'),
      (SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname=session_user),
      (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) OR EXISTS
       (SELECT FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname='otr_trip_publication_catalog_reader')
        AND member=(SELECT oid FROM pg_roles WHERE rolname=session_user) AND admin_option)""",rows=True)
    if len(identity)!=1 or identity[0][0]!='postgres' or identity[0][1] not in ('postgres','supabase_admin') or identity[0][2]!=identity[0][1] or identity[0][3:]!=[FIXTURE_PROJECT,'t','t','t','t','t']:
        raise Closed()
    state=pg.query(OBSERVE,rows=True)
    if len(state)!=1 or state[0][3]!='t': raise Closed()


def complete_dormant(pg,store,operation):
    retire(pg)
    state=pg.query(OBSERVE,rows=True)
    if len(state)!=1 or state[0][:2]!=['f','f'] or state[0][3]!='t': raise Closed()
    try:
        store.retire_secrets()
        before=store.inventory()
        store.write('operation.json',{'state':'CUSTODY_INCOMPLETE','operation':operation})
        after=store.inventory()
        if {k:v for k,v in before.items() if k!='operation.json'}!={k:v for k,v in after.items() if k!='operation.json'}: raise Closed()
    except (OSError,Closed):
        try: store.write('operation.json',{'state':'CUSTODY_INCOMPLETE','operation':operation})
        except (OSError,Closed): pass
        return 'CUSTODY_INCOMPLETE'
    # shortcut: flock cannot exclude an uncooperative privileged writer; complete
    # DORMANT acceptance stays unavailable until that custody prerequisite is proven.
    return 'UNAVAILABLE'


def disable(pg,store):
    verify_disable_channel(pg)
    try:
        # Emergency revocation cannot depend on a writable or intelligible journal.
        try:
            store.recover_journal_staging()
            store.write('operation.json',{'state':'UNKNOWN','operation':'disable'})
        except (OSError,Closed): pass
        pg.query('BEGIN')
        pg.query('ALTER ROLE otr_trip_publication_catalog_reader NOLOGIN PASSWORD NULL')
        pg.query('COMMIT')
        retire(pg)
        state=pg.query(OBSERVE,rows=True)
        if len(state)!=1 or state[0][:2]!=['f','f'] or state[0][3]!='t': raise Closed()
        try:
            store.recover_journal_staging()
            store.write('operation.json',{'state':'UNKNOWN','operation':'disable'})
        except (OSError,Closed): return 'CUSTODY_INCOMPLETE'
        return complete_dormant(pg,store,'disable')
    except (OSError,Closed):
        pg.close(); return 'UNKNOWN'


def provision(pg,store,expiry,operation='initial',boundary=None):
    """One attempt only. boundary is a fixture fault hook, never a runtime caller."""
    verify_disable_channel(pg)
    if operation not in ('initial','rotate'): raise Closed()
    now=dt.datetime.now(dt.timezone.utc)
    if expiry.tzinfo is None or not now<expiry<=now+dt.timedelta(days=30): raise Closed()
    previous=store.journal()
    if previous and previous['state'] not in ('DORMANT','APPLIED'): raise Closed()
    if operation=='rotate' and (not previous or previous['state']!='APPLIED'): raise Closed()
    if operation=='initial' and previous and previous['state']!='DORMANT': raise Closed()
    store.inventory(active=operation=='rotate')
    if (not previous or previous['state']=='DORMANT') and store.secret_artifacts(): raise Closed()
    state=pg.query(OBSERVE,rows=True)
    if len(state)!=1 or state[0][3]!='t' or (operation=='initial' and state[0][:2]!=['f','f']): raise Closed()
    if operation=='rotate':
        if state[0][:2]!=['t','t'] or not store.exists('active') or store.exists('candidate') or store.exists('candidate.new'):
            raise Closed()
        if dt.datetime.fromisoformat(state[0][2])!=dt.datetime.fromisoformat(previous['expiry']): raise Closed()
    # Retire before changing the credential; Driver admission must already be closed.
    store.write('operation.json',{'state':'UNKNOWN','operation':operation,'expiry':expiry.isoformat(),
                                 'rotate_by':(now+dt.timedelta(days=14)).isoformat()})
    pg.query('BEGIN'); pg.query('ALTER ROLE otr_trip_publication_catalog_reader NOLOGIN'); pg.query('COMMIT')
    retire(pg)
    password=C.create_string_buffer(secrets.token_urlsafe(48).encode())
    try:
        store.write('candidate',password)
        journal=store.journal(); journal['candidate_ready']=True
        store.write('operation.json',journal)
        prepare(pg)
        pg.query("SELECT set_config('otr_builder.password',$1,true) IS NOT NULL",(password,))
        pg.query("SELECT set_config('otr_builder.expiry',$1,true) IS NOT NULL",(expiry.isoformat().encode(),))
        if boundary: boundary('staged',pg)
        pg.query(CHANGE)
        pg.query("SELECT set_config('otr_builder.password','',true) IS NOT NULL")
        if boundary: boundary('before_commit',pg)
        pg.query('COMMIT')
        if boundary: boundary('committed',pg)
    except BaseException:
        # UNKNOWN remains durable even for cancellation, process death or lost reply.
        pg.close()
        return 'UNKNOWN'
    finally: wipe(password)
    return reconcile(pg,store)


def reconcile(pg,store):
    verify_disable_channel(pg)
    state=pg.query(OBSERVE,rows=True)
    if len(state)==1 and state[0][:2]==['f','f'] and state[0][3]=='t':
        try:
            store.recover_journal_staging()
            store.write('operation.json',{'state':'UNKNOWN','operation':'reconcile'})
            return complete_dormant(pg,store,'reconcile')
        except (OSError,Closed): pg.close(); return 'UNKNOWN'
    try:
        store.recover_journal_staging()
        journal=store.journal()
    except (OSError,Closed): return 'UNKNOWN'
    if not journal or journal['state'] not in ('UNKNOWN','APPLIED'): return 'UNKNOWN'
    if journal.get('operation')=='disable' or len(state)!=1 or state[0][3]!='t': return 'UNKNOWN'
    try:
        try: password=store.read('candidate',True)
        except FileNotFoundError:
            if journal['state']!='APPLIED' and not journal.get('candidate_ready'): return 'UNKNOWN'
            password=store.read('active',True)
    except (OSError,Closed): return 'UNKNOWN'
    reader=None
    try:
        expected=dt.datetime.fromisoformat(journal['expiry'])
        observed=dt.datetime.fromisoformat(state[0][2])
        if state[0][:2]!=['t','t'] or observed!=expected: return 'UNKNOWN'
        reader=Pg('/proof/ca.crt',READER,password)
        reader.query('SELECT 1')
    except (Closed,ValueError,KeyError,TypeError): return 'UNKNOWN'
    finally:
        if reader: reader.close()
        wipe(password)
    retire(pg)
    try:
        try: os.replace('candidate','active',src_dir_fd=store.fd,dst_dir_fd=store.fd); os.fsync(store.fd)
        except FileNotFoundError: pass
        journal['state']='APPLIED'; store.write('operation.json',journal)
    except (OSError,Closed): return 'UNKNOWN'
    return 'APPLIED'
