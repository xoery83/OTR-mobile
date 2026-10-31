"""Host-only plan preparation. No container, Auth configuration or SQL mutation."""
import datetime,hashlib,json,os,sys,time
from pathlib import Path
from deploy import digest,environment,inspect,mounts,plan_path,validate_qa

RUNTIME='b518f81a7145ba8441d4d8bc599f9e3f09023ec552e8db68cfee859fed557b72'
BROWSER='9264dd02e6e4474326264ed4e8ac91ec82e21de374c731085b2dbfa0094627fe'
LOADER='3348dbae9d5a61a0beb145fae05cd08cc00582ae4d1c2b4e58dd3f3cf1742abf'
BUNDLES={'server.mjs','server-capture.mjs','mcp/runtime.mjs','auth-consent/app.js'}

def make_plan(packet,s,qa,metadata,profile,started,window,restore_hash):
 validate_qa(json.dumps(qa),profile,started)
 assert set(metadata)=={'id','client_name','client_type','token_endpoint_auth_method','redirect_uris','grant_types','registration_type','created_at','deleted_at'}
 assert metadata['id']==qa['clientId'] and metadata['client_type']=='public' and metadata['token_endpoint_auth_method']=='none'
 assert metadata['redirect_uris']==qa['redirectUris'] and set(metadata['grant_types'])=={'authorization_code','refresh_token'}
 assert metadata['registration_type']=='manual' and metadata['deleted_at'] is None
 assert metadata['client_name']==('OTR DEV QA Read' if profile=='chatgpt' else 'OTR DEV QA - Claude Read')
 created=datetime.datetime.fromisoformat(metadata['created_at'].replace('Z','+00:00'))
 assert created.tzinfo and created.utcoffset().total_seconds()==0
 assert created.timestamp()*1000<=time.time()*1000
 if profile=='claude':assert started<=created.timestamp()*1000,'NEW_CLIENT_IN_THIS_WINDOW_REQUIRED'
 source=packet['rootDeployment']['result'];bundles=packet['rootImage']['bundles']
 assert packet['authLoaderSHA256']==LOADER
 assert set(bundles)==BUNDLES and bundles['mcp/runtime.mjs']==RUNTIME and bundles['auth-consent/app.js']==BROWSER
 assert s['Id']==source['containerId'] and s['Image']==source['image']==packet['rootImage']['image'] and s['State']['Health']['Status']=='healthy'
 assert any(v in ['server-capture.mjs','/app/server-capture.mjs'] for v in s['Config']['Cmd'])
 e=environment(s);assert len(e)==len(s['Config']['Env']) and 'OTR_DEV_MCP_READ_QA_CONFIG' not in e
 assert e.get('OTR_DEV_AUTH_GUEST_ADOPTION','0')=='0'
 assert 'OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE' not in e
 assert digest(e)==source['environmentSHA256'] and digest(s['HostConfig'])==source['hostConfigSHA256'] and digest(mounts(s))==source['mountsSHA256']
 files=s['Config']['Labels']['com.docker.compose.project.config_files'].split(',')
 assert set(files)==set(source['configHashes']) and len(files)==len(set(files))
 public=json.dumps(qa,separators=(',',':'))
 config=dict(s['Config'],Image=s['Image'],Env=[*s['Config']['Env'],'OTR_DEV_MCP_READ_QA_CONFIG='+public])
 return {'mode':'deploy','windowId':window,'clientProfile':profile,'windowStartedAtMs':started,
  'beforeContainerId':s['Id'],'beforeImage':s['Image'],'candidateImage':s['Image'],
  'beforeConfigSHA256':digest(s['Config']),'beforeHostConfigSHA256':digest(s['HostConfig']),
  'beforeEnvironmentSHA256':digest(e),'beforeConfigFiles':files,'beforeConfigHashes':source['configHashes'],
  'mountedFileHashes':source['mountedFileHashes'],'expectedMounts':mounts(s),'expectedHostConfig':s['HostConfig'],
  'authQaPublicConfig':public,'expectedEnvironmentSHA256':digest({**e,'OTR_DEV_MCP_READ_QA_CONFIG':public}),
  'expectedConfigSHA256':digest(config),'bundles':bundles,'protectedRoutes':[['/v2/trips',401]],
  'backupName':'otr-dev-backend-before-auth-'+window,'containerName':'otr-auth-consumer-'+window,
  'restoreHelperSHA256':restore_hash}

if __name__=='__main__':
 assert os.getuid()==0,'DEV_HOST_ROOT_ONLY'
 root=Path(sys.argv[1]);target=plan_path(root/'deploy-plan.json')
 packet=json.loads((root/'software-handoff.json').read_text())
 qa=json.loads((root/'qa-public.json').read_text());metadata=json.loads((root/'client-metadata.json').read_text())
 started=int(sys.argv[3]);profile=sys.argv[2]
 g=make_plan(packet,inspect('otr-dev-backend'),qa,metadata,profile,started,root.name.removeprefix('auth-consumer-qa-'),hashlib.sha256((root/'universal_runtime_close.py').read_bytes()).hexdigest())
 for p,h in {**g['beforeConfigHashes'],**g['mountedFileHashes']}.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,'FRESH_BASELINE_FILE_DRIFT'
 fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 raw=json.dumps(g,sort_keys=True,separators=(',',':')).encode()
 with os.fdopen(fd,'wb') as stream:stream.write(raw)
 print(json.dumps({'status':'PREPARED_ONLY_NOT_AUTHORIZED_OR_DEPLOYED','planSHA256':hashlib.sha256(raw).hexdigest(),'baselineContainerId':g['beforeContainerId'],'image':g['beforeImage']}))
