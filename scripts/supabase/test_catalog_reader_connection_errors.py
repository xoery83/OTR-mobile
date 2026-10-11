"""Network-none PostgreSQL fixture; every credential and error token is synthetic."""
import ctypes as C
import json
import socket
import threading
import time
import catalog_reader_credential as b

results={}
password=C.create_string_buffer(b'synthetic-only-accepted')
def failure(name,work,classification,stage):
 try:work()
 except b.Closed as e:
  assert e.classification==classification,(name,e.classification)
  assert e.stage==stage,(name,e.stage)
  assert str(e)=='CREDENTIAL_OPERATION_CLOSED'
  assert e.elapsed_seconds is not None and e.elapsed_seconds>=0
  results[name]={'classification':e.classification,'stage':e.stage,'sqlstate':e.sqlstate,'seconds':e.elapsed_seconds}
 else:raise AssertionError('expected fixed failure')

queries=[]
original_query=b.Pg.query
def counted(self,*args,**kwargs):
 queries.append(args[0]);return original_query(self,*args,**kwargs)
b.Pg.query=counted
try:
 identity=b.Pg('/proof/ca.crt',password=password,host=b.DEV_HOST,timeout=10,identity_only=True)
 assert queries==[]
 assert identity.query("SELECT session_user,current_user,NOT pg_is_in_recovery(),current_setting('transaction_read_only')",rows=True)==[['postgres','postgres','t','on']]
 assert len(queries)==1
 identity.close()
 results['identity_only']={'constructor_sql_queries':0,'read_only_identity_queries':1}
finally:b.Pg.query=original_query
pg=b.Pg('/proof/ca.crt',password=password,host=b.DEV_HOST)
assert pg.query('SELECT session_user,current_user,NOT pg_is_in_recovery()',rows=True)==[['postgres','postgres','t']]
try:pg.query('SELECT 1/0')
except b.Closed as e:
 assert e.sqlstate=='22012' and e.stage=='QUERY'
 results['query_sqlstate']={'stage':e.stage,'sqlstate':e.sqlstate}
else:raise AssertionError()
pg.close()
failure('incorrect_password',lambda:b.Pg('/proof/ca.crt',password=C.create_string_buffer(b'synthetic-only-wrong'),host=b.DEV_HOST),'AUTH_REJECTED','CONNECT_POLL')
failure('network',lambda:b.Pg('/proof/ca.crt',password=password,port=5433),'NETWORK_OR_TLS','CONNECT_POLL')
failure('tls',lambda:b.Pg('/etc/ssl/certs/ca-certificates.crt',password=password,host=b.DEV_HOST),'NETWORK_OR_TLS','CONNECT_POLL')
failure('client_configuration',lambda:b.Pg('/proof/ca.crt',password=password,host='unexpected.invalid'),'CLIENT_CONFIGURATION','PARAMETERS')
failure('missing_ca',lambda:b.Pg('/proof/no-such-ca.crt',password=password,host=b.DEV_HOST),'CLIENT_CONFIGURATION','CONNECT_POLL')
failure('timeout_parameter',lambda:b.Pg('/proof/ca.crt',timeout=11),'CLIENT_CONFIGURATION','PARAMETERS')
server=socket.socket();server.bind(('127.0.0.1',0));server.listen(1)
port=server.getsockname()[1]
def blackhole():
 client,_=server.accept()
 with client:time.sleep(3)
 server.close()
t=threading.Thread(target=blackhole,daemon=True);t.start()
failure('timeout',lambda:b.Pg('/proof/ca.crt',password=password,port=port,timeout=1),'TIMEOUT','CONNECT_POLL')
t.join(4)
# Unknown native errors remain unknown; no Python conversion of arbitrary error text.
class FakeLib:
 class Error:
  def __call__(self,_):return C.addressof(raw)
 PQerrorMessage=Error()
raw=C.create_string_buffer(b'synthetic-sensitive-connection-detail-not-allowlisted')
fake=object.__new__(b.Pg);fake.lib=FakeLib();fake.conn=1
assert fake.connection_error_class()=='UNKNOWN'
# A native binding exception must be classified and sanitized, not collapsed silently.
original=b.Pg._connect
def broken(self,*args):
 self.stage='CONNECT_START';self.classification='UNKNOWN'
 raise TypeError('synthetic-sensitive-credential-detail')
b.Pg._connect=broken
try:
 failure('binding_exception',lambda:b.Pg('/proof/ca.crt'),'CLIENT_CONFIGURATION','CONNECT_START')
finally:b.Pg._connect=original
b.wipe(password)
print(json.dumps(results))
