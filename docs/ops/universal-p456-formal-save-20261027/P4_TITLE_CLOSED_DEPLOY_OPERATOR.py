import hashlib,json,subprocess,time,urllib.request,uuid,fcntl,os
from pathlib import Path
BASE='sha256:e049ad38638e527bc4e8941dc73fe51d71f00d50378f697679cd638a2ef50b2f'
IMAGE='sha256:8298d177a12d2939249834eeecf2c822f9d778a15a54544a7791936db2a641c9'
ID='309d248452d83758b01c2f94cf2f77be973cb02c23c8e8e785e4d0d60d6b7d56'
CONFIG='7ce7254160c7668a1885e1ef3241d8b3b37230c2b64cc614c5a29e8e5f071697'
HOST='e89fe490cfd0a143b4751e761cebbbe8deaaacabc3ac53b27fa5c95cd525d2d7'
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def docker(*args):return subprocess.check_output(['docker',*args],stderr=subprocess.PIPE,timeout=40)
def state(target):return json.loads(docker('inspect',target))[0]
def same_host(value):
 if digest(value)==HOST:return True
 # Docker normalizes the default OOM-killer setting from null to false; both leave it enabled.
 assert s['HostConfig']['OomKillDisable'] is None and value['OomKillDisable'] is False
 return digest(dict(value,OomKillDisable=None))==HOST
lockfd=os.open('/run/lock/otr-universal-finite-service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
s=state('otr-dev-backend')
assert s['Id']==ID and s['Image']==BASE and digest(s['Config'])==CONFIG and digest(s['HostConfig'])==HOST and s['State']['Health']['Status']=='healthy'
assert s['Config']['User']=='otr' and s['Config']['Cmd']==['node','server-capture.mjs'] and s['HostConfig']['NetworkMode']=='host' and len(s['Mounts'])==6
env=dict(v.split('=',1) for v in s['Config']['Env'])
assert env.get('OTR_DEV_SUPABASE_URL')=='https://tuqigdxrvrerfewsxqgm.supabase.co' and env.get('OTR_DEV_FLIGHT_ENRICHMENT_HOST')!='enabled' and env.get('OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW')!='enabled'
assert state(IMAGE)['Id']==IMAGE
suffix=uuid.uuid4().hex[:10];old='otr-dev-backend-retained-'+suffix;staged='otr-enrichment-closed-'+suffix
candidate='ad8e88a482921a9a01a51bd356f81332491598d0ac991da34e39e1ece8308f29'
assert state(candidate)['Name'].startswith('/otr-universal-p4-closed-') and not state(candidate)['State']['Running']
assert state(candidate)['Image']==IMAGE and same_host(state(candidate)['HostConfig'])
assert digest(state(candidate)['Config'])=='8e6a8aae5e58dd2e9533f61455e851fe4ed4a81d112212be25ae8ee10a4ced07'
mounts=lambda v:sorted(v,key=lambda m:(m['Destination'],m['Source']))
assert mounts(state(candidate)['Mounts'])==mounts(s['Mounts'])
# Reuse Native's fixed private-file CAS primitive; no owning business plan is loaded.
helper=Path('/opt/otr/dev-backend/private/flight-enrichment/enrichment_runtime_close.py')
code=helper.read_bytes();assert hashlib.sha256(code).hexdigest()=='c1475a1c5021173aef42b961d0fee8439fc787cc97e3ce0fe52661d9c37f6210'
namespace={'__name__':'closed_deploy_private_check','__file__':str(helper)}
exec(compile(code,str(helper),'exec'),namespace)
pinfile=Path('/opt/otr/dev-backend/private/universal-p4-closed-9b851a4d/file-pins.json')
raw=pinfile.read_bytes();assert hashlib.sha256(raw).hexdigest()=='57781cc57253fd759d8aa21720fc347be02c060dac5c9447f9bb3dec92d1da52'
pins=json.loads(raw)
for path,pin in pins.items():namespace['private_hash'](path,pin['sha256'],pin['mode'],dict(pin['metadata'],mode=pin['mode']))
assert state(ID)['Id']==s['Id'] and state(ID)['Config']==s['Config'] and state(ID)['HostConfig']==s['HostConfig']
assert state(candidate)['State']['Status']=='created'
def observed(action,check):
 try:action()
 except subprocess.SubprocessError:pass
 if not check():raise RuntimeError('TRANSITION_UNCONFIRMED_NO_RETRY')

renamed=False;swapped=False
try:
 observed(lambda:docker('stop','--time','20',ID),lambda:not state(ID)['State']['Running']);observed(lambda:docker('rename',ID,old),lambda:state(ID)['Name']=='/'+old);renamed=True
 observed(lambda:docker('rename',candidate,'otr-dev-backend'),lambda:state(candidate)['Name']=='/otr-dev-backend');observed(lambda:docker('start',candidate),lambda:state(candidate)['State']['Running']);swapped=True
 for _ in range(45):
  live=state(candidate)
  if live['State'].get('Health',{}).get('Status')=='healthy':break
  if not live['State'].get('Running'):raise RuntimeError('CANDIDATE_EXITED')
  time.sleep(1)
 else:raise RuntimeError('HEALTH_TIMEOUT')
 assert live['Image']==IMAGE and same_host(live['HostConfig'])
 assert {**live['Config'],'Image':BASE}==s['Config']
 assert urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=5).status==200
 print(json.dumps({'status':'DEFAULT_CLOSED_DEPLOYED','source':'9b851a4d3b4c1d6f390f38669d5de349b3472d79','image':IMAGE,'container':candidate,'configHash':digest(live['Config']),'hostHash':digest(live['HostConfig']),'mountHash':digest(mounts(live['Mounts'])),'normalization':'unchanged' if live['HostConfig']==s['HostConfig'] else 'OomKillDisable:null->false only','rollbackContainer':ID,'rollbackName':old,'health':200}),flush=True)
except BaseException:
 # Start/stop timeouts are unknown: reconcile actual containers, never infer state from the last command.
 for operation in [('stop','--time','10',candidate),('kill',candidate),('rename',candidate,staged+'-failed'),('rename',ID,'otr-dev-backend'),('start',ID)]:
  try:docker(*operation)
  except BaseException:pass
 restored=False
 for _ in range(45):
  try:
   old_state=state('otr-dev-backend')
   restored=old_state['Id']==ID and old_state['Image']==BASE and old_state['State']['Running'] and old_state['State'].get('Health',{}).get('Status')=='healthy' and urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=5).status==200
   if restored:break
  except BaseException:pass
  time.sleep(1)
 print(json.dumps({'status':'CLOSED_SWAP_FAILED_BASELINE_RESTORED' if restored else 'ROLLBACK_FAILED_REQUIRES_RECONCILIATION','baseline':ID}),flush=True)
 raise SystemExit(2)
