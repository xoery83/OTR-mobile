import fcntl,hashlib,http.client,json,os,re,socket,stat,subprocess,sys,time,uuid
from pathlib import Path
import urllib.request,urllib.error

class HostConfigDrift(Exception):
 def __init__(self,keys):self.keys=keys

def verify_http(g):
 paths=g['protectedRoutes'];assert paths,'PROTECTED_ROUTES_REQUIRED'
 for path,expected in [('/health',200)]+[(entry[0],401) for entry in paths]:
  assert isinstance(path,str) and path.startswith('/') and not path.startswith('//') and '://' not in path,'INVALID_PROBE_PATH'
  try:
   with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8787'+path),timeout=3) as response:status=response.status
  except urllib.error.HTTPError as error:
   status=error.code;error.close()
  assert status==expected,'HTTP_BOUNDARY_FAILED'

def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def call(args):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=35)
def inspect(x):return json.loads(call(['docker','inspect',x]))[0]
def environment(s):return dict(x.split('=',1) for x in s['Config']['Env'])
def mounts(s):return sorted((m['Source'],m['Destination'],m['RW']) for m in s['Mounts'])
def host(s):
 h=dict(s['HostConfig']);h['Mounts']=sorted(h.get('Mounts',[]),key=lambda x:json.dumps(x,sort_keys=True));return h
class Docker(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(20);self.sock.connect('/var/run/docker.sock')

def plan_path(path):
 assert path.name=='deploy-plan.json' and str(path.parent.parent)=='/opt/otr/dev-backend/build'
 assert re.fullmatch(r'auth-consumer-write-qa-[0-9a-f]{32}',path.parent.name)
 assert path.resolve()==path,'PLAN_SYMLINK_FORBIDDEN'
 return path
