"""Local control-plan checks only: no Docker, SSH, SQL, OTP or real credentials."""
import copy,datetime,json,unittest
from unittest.mock import patch
from pathlib import Path
from deploy import validate_qa,plan_path,digest,mounts,environment
from prepare import make_plan,RUNTIME,BROWSER,LOADER

NOW=1800000000
START=NOW*1000-1000
CHAT='83504d3f-59d4-43fd-99b1-bebc54c40f7d'
NEW='d2b8167f-ee42-4ac1-b5ef-4dc003c0d141'
CALLBACKS=['https://chatgpt.com/connector/oauth/CYUxrs56rSrW','http://127.0.0.1:18764/callback']

def fixture(profile='claude'):
 qa={'version':1,'clientId':CHAT if profile=='chatgpt' else NEW,'redirectUris':CALLBACKS[:] if profile=='chatgpt' else ['https://claude.ai/api/mcp/auth_callback'],'expiresAt':START+1800000}
 s={'Id':'a'*64,'Image':'sha256:'+'b'*64,'State':{'Health':{'Status':'healthy'}},'HostConfig':{'NetworkMode':'fixture'},
  'Mounts':[{'Source':'/fixture/runtime.mjs','Destination':'/app/mcp/runtime.mjs','RW':False}],
  'Config':{'Env':['PRIVATE_FIXTURE_ONLY=must-not-be-copied-to-plan','OTR_DEV_AUTH_GUEST_ADOPTION=0'],'Cmd':['node','server-capture.mjs'],
   'Labels':{'com.docker.compose.project.config_files':'/fixture/compose.yml'}}}
 source={'containerId':s['Id'],'image':s['Image'],'environmentSHA256':digest(environment(s)),
  'hostConfigSHA256':digest(s['HostConfig']),'mountsSHA256':digest(mounts(s)),
  'configHashes':{'/fixture/compose.yml':'c'*64},'mountedFileHashes':{'/fixture/runtime.mjs':RUNTIME}}
 packet={'authLoaderSHA256':LOADER,'rootDeployment':{'result':source},'rootImage':{'image':s['Image'],
  'bundles':{'server.mjs':'d'*64,'server-capture.mjs':'e'*64,'mcp/runtime.mjs':RUNTIME,'auth-consent/app.js':BROWSER}}}
 metadata={'id':qa['clientId'],'client_name':'OTR DEV QA Read' if profile=='chatgpt' else 'OTR DEV QA - Claude Read',
  'client_type':'public','token_endpoint_auth_method':'none','redirect_uris':qa['redirectUris'][:],
  'grant_types':['authorization_code','refresh_token'],'registration_type':'manual','deleted_at':None,
  'created_at':datetime.datetime.fromtimestamp(NOW-3600,datetime.timezone.utc).isoformat()}
 return qa,s,packet,metadata

class Controls(unittest.TestCase):
 def setUp(self):
  self.clock=patch('time.time',return_value=NOW);self.clock.start();self.addCleanup(self.clock.stop)

 def test_exact_profiles_and_total_window_budget(self):
  for profile in ['claude']:
   qa,*_=fixture(profile)
   self.assertEqual(validate_qa(json.dumps(qa),profile,START),qa)
   for change in [{'expiresAt':START+1800001},{'expiresAt':NOW*1000},{'expiresAt':True},{'version':True},{'clientId':'00000000-0000-0000-0000-000000000000'},{'scope':['otr.trips.write']}]:
    with self.subTest(profile=profile,change=change),self.assertRaises((AssertionError,ValueError)):
     validate_qa(json.dumps({**qa,**change}),profile,START)
   with self.assertRaises(AssertionError):validate_qa(json.dumps(qa),profile,NOW*1000+1)
  qa,*_=fixture('claude')
  for redirects in [CALLBACKS,qa['redirectUris']+CALLBACKS,qa['redirectUris']+[CALLBACKS[1]],['https://claude.ai/api/mcp/auth_callback?x=1'],['https://claude.ai.evil.invalid/api/mcp/auth_callback']]:
   with self.subTest(redirects=redirects),self.assertRaises(AssertionError):validate_qa(json.dumps({**qa,'redirectUris':redirects}),'claude',START)
  with self.assertRaises(AssertionError):validate_qa(json.dumps({**qa,'clientId':CHAT}),'claude',START)
  with self.assertRaises(AssertionError):validate_qa(json.dumps(qa),'unknown',START)
  with self.assertRaises(AssertionError):validate_qa(json.dumps(qa),'chatgpt',START)
  with self.assertRaises(AssertionError):validate_qa(json.dumps({**qa,'clientId':'11111111-1111-4111-8111-111111111111'}),'claude',START)

 def test_plan_preserves_image_host_mounts_and_no_private_environment_values(self):
  for profile in ['claude']:
   qa,s,p,m=fixture(profile)
   g=make_plan(p,s,qa,m,profile,START,'f'*32,'a'*64)
   self.assertEqual(g['candidateImage'],g['beforeImage'])
   self.assertEqual(g['beforeContainerId'],s['Id'])
   self.assertEqual(g['expectedMounts'],mounts(s));self.assertEqual(g['expectedHostConfig'],s['HostConfig'])
   self.assertEqual(g['bundles'],p['rootImage']['bundles'])
   self.assertNotIn('must-not-be-copied-to-plan',json.dumps(g))
   expected={**environment(s),'OTR_DEV_MCP_READ_QA_CONFIG':g['authQaPublicConfig']}
   self.assertEqual(g['expectedEnvironmentSHA256'],digest(expected))

 def test_client_metadata_requires_exact_existing_public_claude(self):
  qa,s,p,m=fixture('claude')
  for change in [{'id':CHAT},{'client_type':'confidential'},{'token_endpoint_auth_method':'client_secret_post'},
   {'redirect_uris':CALLBACKS},{'grant_types':['authorization_code']},{'registration_type':'dynamic'},
   {'deleted_at':'2026-01-01T00:00:00Z'},{'created_at':datetime.datetime.fromtimestamp(NOW-.5,datetime.timezone.utc).isoformat()},
   {'client_name':'other'},{'client_secret':'fixture-must-reject-extra-key'}]:
   with self.subTest(change=change),self.assertRaises(AssertionError):make_plan(p,s,qa,{**m,**change},'claude',START,'f'*32,'a'*64)

 def test_changed_baseline_and_unqualified_assets_cannot_make_plan(self):
  qa,s,p,m=fixture()
  for change in ['image','loader','runtime','browser','entrypoint','env','mount','config']:
   packet=copy.deepcopy(p);current=copy.deepcopy(s)
   if change=='image':packet['rootImage']['image']='sha256:'+'f'*64
   if change=='loader':packet['authLoaderSHA256']='f'*64
   if change=='runtime':packet['rootImage']['bundles']['mcp/runtime.mjs']='f'*64
   if change=='browser':packet['rootImage']['bundles']['auth-consent/app.js']='f'*64
   if change=='entrypoint':current['Config']['Cmd']=['node','server.mjs']
   if change=='env':current['Config']['Env'].append('OTR_DEV_MCP_READ_QA_CONFIG={}')
   if change=='mount':current['Mounts'][0]['RW']=True
   if change=='config':current['Config']['Labels']['com.docker.compose.project.config_files']='/fixture/different.yml'
   with self.subTest(change=change),self.assertRaises(AssertionError):make_plan(packet,current,qa,m,'claude',START,'f'*32,'a'*64)

 def test_plan_path_cannot_target_other_release_or_parent_symlink(self):
  own=Path('/opt/otr/dev-backend/build/auth-consumer-qa-'+'f'*32+'/deploy-plan.json')
  self.assertEqual(plan_path(own),own)
  for path in ['/private/tmp/other/deploy-plan.json','/opt/otr/dev-backend/build/source-other/deploy-plan.json',str(own.parent/'other.json')]:
   with self.subTest(path=path),self.assertRaises(AssertionError):plan_path(Path(path))
  with patch.object(Path,'resolve',return_value=Path('/private/tmp/elsewhere')):
   with self.assertRaises(AssertionError):plan_path(own)

if __name__=='__main__':unittest.main()
