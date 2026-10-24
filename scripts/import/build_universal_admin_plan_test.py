import copy,datetime as dt,json,os,subprocess,sys,tempfile,unittest,uuid
from pathlib import Path
from universal_config_control_test import fixture
from universal_config_control import CONTEXT,validate_admin
from build_universal_admin_plan import build_admin_plan,ROW_KEYS,ORDER

def input_fixture():
 p=fixture();a=p.pop('adminControl');p['ownerAuthorized']=False;actor=p['sourceScope']['actor_id']
 auth={k:v for k,v in a['activation'][0]['context'].items() if k in CONTEXT-{'request_id','request_sha256','command_kind','gateway_identity'}};auth['auth_session_reference']='vault:ISOLATED_ONLY'
 i={k:None for k in ROW_KEYS['integration']};i.update(a['activation'][0]['command']['row']);i.update(vendor_namespace='DeepSeek',admin_label='隔离测试',config_sha256='a'*64,credential_reference='env:OTR_DEV_DEEPSEEK_API_KEY',capabilities=['EXTRACT'],health_state='UNKNOWN',created_at=a['startsAt'],updated_at=a['startsAt'],created_by=actor,updated_by=actor)
 c={k:None for k in ROW_KEYS['provider']};c.update(a['activation'][1]['command']['row']);c.update(provider_id='DeepSeek',model_id='deepseek-flash',model_version='DeepSeek-V4.1-Flash',adapter_version='ISOLATED_ONLY',config_version=1,configuration_sha256='b'*64,provider_class='COMMERCIAL_REMOTE',capabilities=['EXTRACT'],modalities=['TEXT'],network_required=True,data_region='CN',routing_class='DIRECT',routing_eligibility='ELIGIBLE',created_at=a['startsAt'],created_by=actor)
 price={k:None for k in ROW_KEYS['price']};price.update(a['activation'][2]['command']['row']);price.update(provider_id='DeepSeek',model_id='deepseek-flash',currency='USD',schedule_version='ISOLATED_ONLY',effective_from=a['startsAt'],source_reference='https://example.invalid/fixture',source_version='fixture',schedule_sha256='c'*64,rounding_policy='SUM_THEN_CEIL_NANOS_V1',created_at=a['startsAt'],created_by=actor)
 units=[{'price_schedule_id':price['price_schedule_id'],'unit_key':k,'measurement_unit':k,'unit_quantity':1000000,'price_per_quantity':'0.01','unit_definition':{'version':1,'relationship':'DISJOINT','included_in':None,'billable':True}} for k in ['input_tokens','cached_input_tokens','output_tokens']]
 facts={'version':1,'actorId':actor,'outerStartsAt':a['startsAt'],'outerExpiresAt':a['expiresAt'],'environmentBaseline':a['environmentBaseline'],'connection':a['connection'],'verifiedAuthorityReceiptSHA256':'d'*64,'normalAuthReceiptSHA256':'e'*64,'authSessionExpiresAt':a['expiresAt'],'authContextBase':auth,'commandIdentities':{name:{'requestId':str(uuid.uuid4()),'auditId':str(uuid.uuid4())} for name in ORDER},'grantIdentities':{permission:str(uuid.uuid4()) for permission in ['CONFIG_ADMIN','SECURITY_ADMIN']},'grantorActorId':actor,'reasonCode':'ISOLATED_ONLY','integrationRow':i,'providerRow':c,'priceRow':price,'priceUnits':units}
 return p,facts

class BuilderTests(unittest.TestCase):
 def test_exact_seven_bindings_validate_without_authority_upgrade_or_mutation(self):
  p,f=input_fixture();before=copy.deepcopy((p,f));result=build_admin_plan(p,f);a=validate_admin(result)
  self.assertEqual((p,f),before);self.assertFalse(result['ownerAuthorized']);self.assertEqual(len(a['activation']),5);self.assertEqual(len(a['restore']),2)
  self.assertEqual(a['activation'][0]['command']['row']['admin_label'],'隔离测试');self.assertEqual(a['activation'][4]['command']['expected_version'],1);self.assertEqual(a['restore'][0]['command']['expected_version'],2)
  self.assertEqual({r['admin_grant_id'] for r in a['temporaryGrants']},set(f['grantIdentities'].values()));self.assertEqual(result,build_admin_plan(p,f))
  for x in a['activation']+a['restore']:
   self.assertEqual(x['context']['verified_at'],f['authContextBase']['verified_at']);self.assertEqual(x['context']['auth_session_reference'],'vault:ISOLATED_ONLY')
 def test_closed_existing_integration_only_price_and_exact_kill_cas(self):
  p,f=input_fixture();f.update(integrationBaseline={'config_version':3,'kill_switch':True},priceBaselineVersion='previous-closed-price',priceBaselineId=str(uuid.uuid4()),priceBaselineUntil=None)
  f['priceRow']['supersedes_schedule_id']=f['priceBaselineId']
  f['environmentBaseline']={'config_version':5,'kill_switch':True};f['commandIdentities']={k:v for k,v in f['commandIdentities'].items() if k in ORDER[2:]}
  result=build_admin_plan(p,f);a=validate_admin(result)
  self.assertEqual([x['kind'] for x in a['activation']],['external_integration_price_append','external_integration_set_kill','external_integration_set_kill'])
  self.assertEqual([x['command']['expected_version'] for x in a['activation']],['previous-closed-price',3,5])
  self.assertEqual([x['command']['expected_version'] for x in a['restore']],[6,4])
  expired=copy.deepcopy(f);expired['priceBaselineUntil']=expired['priceRow']['effective_from'];expired['priceRow']['supersedes_schedule_id']=None
  renewed=build_admin_plan(p,expired);self.assertIsNone(renewed['adminControl']['activation'][0]['command']['row']['supersedes_schedule_id'])
  for mutate in [lambda f:f['integrationBaseline'].update(kill_switch=False),lambda f:f['integrationBaseline'].update(config_version=0),lambda f:f.pop('priceBaselineVersion'),lambda f:f['priceRow'].update(supersedes_schedule_id=str(uuid.uuid4())),lambda f:f.update(priceBaselineId=str(uuid.uuid4()),priceBaselineUntil=None),lambda f:f['commandIdentities'].update(configure={'requestId':str(uuid.uuid4()),'auditId':str(uuid.uuid4())})]:
   q=copy.deepcopy(f);mutate(q)
   with self.assertRaises((ValueError,TypeError)):build_admin_plan(p,q)
 def test_unbound_foreign_user_expired_and_changed_rows_refused(self):
  mutations=[lambda f:f['authContextBase'].update(principal_kind='OTR_USER'),lambda f:f.update(actorId=str(uuid.uuid4())),lambda f:f.update(authSessionExpiresAt=f['outerStartsAt']),lambda f:f['providerRow'].update(provider_config_id=str(uuid.uuid4())),lambda f:f['integrationRow'].update(credential_reference='RAW_SECRET_NOT_REFERENCE'),lambda f:f['priceUnits'][0]['unit_definition'].update(relationship='INCLUDED'),lambda f:f['integrationRow'].update(unapproved_field=True),lambda f:f['commandIdentities']['configure'].update(requestId=f['commandIdentities']['price']['requestId']),lambda f:f['authContextBase'].update(auth_session_reference=None)]
  for change in mutations:
   p,f=input_fixture();change(f)
   with self.assertRaises((ValueError,TypeError)):build_admin_plan(p,f)
 def test_actual_cli_exclusive_private_output_no_secret_files_opened(self):
  p,f=input_fixture()
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);os.chmod(root,0o700);(root/'plan').write_text(json.dumps(p));(root/'facts').write_text(json.dumps(f));out=root/'sealed'
   cmd=[sys.executable,str(Path(__file__).with_name('build_universal_admin_plan.py')),'--bind-proposed','--plan',str(root/'plan'),'--facts',str(root/'facts'),'--out',str(out)]
   r=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertNotIn('ISOLATED_ONLY',r.stdout);self.assertEqual(out.stat().st_mode&0o777,0o600);validate_admin(json.loads(out.read_text()))
   before=out.read_bytes();self.assertEqual(subprocess.run(cmd,capture_output=True).returncode,2);self.assertEqual(out.read_bytes(),before)

if __name__=='__main__':unittest.main()
