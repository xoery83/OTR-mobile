import copy,datetime as dt,unittest,uuid
from build_universal_admin_plan_test import input_fixture
from build_universal_admin_plan import build_admin_plan
from universal_config_control import validate_admin,prepare_grant_provision_sql,revoke_sql,revoked_sql,restore_once
from unittest.mock import Mock

def renewal_fixture():
 p,f=input_fixture();start=dt.datetime.fromisoformat(f['outerStartsAt'].replace('Z','+00:00'))
 prior={}
 for permission,gid in f['grantIdentities'].items():
  prior[permission]={'admin_grant_id':gid,'actor_id':f['actorId'],'environment':'DEV','permission':permission,'grant_revision':2,'revoked_at':(start-dt.timedelta(seconds=10)).isoformat(),'expires_at':(start+dt.timedelta(seconds=20)).isoformat(),'created_at':(start-dt.timedelta(seconds=100)).isoformat(),'created_by':str(uuid.uuid4())}
 f['grantRenewalPreimages']=prior
 return p,f

class RenewalTests(unittest.TestCase):
 def test_exact_revoked_identity_preserved_active_three_close_four(self):
  p,f=renewal_fixture();result=build_admin_plan(p,f);a=validate_admin(result)
  for r in a['temporaryGrants']:
   old=f['grantRenewalPreimages'][r['permission']]
   self.assertEqual(r['grant_revision'],3);self.assertIsNone(r['revoked_at']);self.assertEqual(r['expires_at'],f['outerExpiresAt'])
   for key in ['admin_grant_id','created_at','created_by','permission','actor_id','environment']:self.assertEqual(r[key],old[key])
  provision=prepare_grant_provision_sql(result)
  statements=prepare_grant_provision_sql(result,transaction=False)
  self.assertNotIn('COMMIT;',statements);self.assertFalse(statements.startswith('BEGIN;'));self.assertIn(statements,provision)
  with self.assertRaises(ValueError):prepare_grant_provision_sql(result,transaction='false')
  self.assertNotIn('INSERT',provision);self.assertNotIn('ON CONFLICT',provision);self.assertIn('FOR UPDATE',provision);self.assertIn('ADMIN_RENEWAL_PREIMAGE_DRIFT',provision)
  self.assertIn('revoked_at=NULL,grant_revision=3',provision)
  self.assertIn('grant_revision=3',revoke_sql(a));self.assertIn('grant_revision=4',revoked_sql(a))
  self.assertEqual(result['adminControl']['grantRenewalPreimages'],f['grantRenewalPreimages'])
 def test_precise_old_preimage_unexecuted_is_read_only_closed(self):
  p,f=renewal_fixture();result=build_admin_plan(p,f);result['ownerAuthorized']=True;a=result['adminControl']
  sql=Mock(side_effect=[[{'observation':{'environment':a['environmentBaseline'],'integration':None,'audits':[]}}],[{'closed':True}]])
  self.assertTrue(restore_once(result,sql)['adminClosed']);self.assertTrue(all('BEGIN READ ONLY' in c.args[0] for c in sql.call_args_list))
  q=revoked_sql(a);self.assertIn('g.grant_revision=2',q);self.assertIn(f['grantRenewalPreimages']['CONFIG_ADMIN']['revoked_at'],q);self.assertNotIn('NOT EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE admin_grant_id',q)
 def test_foreign_revision_time_permission_active_and_id_overwrite_refused(self):
  changes=[lambda f:f['grantRenewalPreimages']['CONFIG_ADMIN'].update(grant_revision=3),lambda f:f['grantRenewalPreimages']['CONFIG_ADMIN'].update(revoked_at=None),lambda f:f['grantRenewalPreimages']['CONFIG_ADMIN'].update(revoked_at=f['outerExpiresAt']),lambda f:f['grantRenewalPreimages']['CONFIG_ADMIN'].update(permission='SECURITY_ADMIN'),lambda f:f['grantIdentities'].update(CONFIG_ADMIN=str(uuid.uuid4())),lambda f:f['grantRenewalPreimages']['CONFIG_ADMIN'].update(actor_id=str(uuid.uuid4())),lambda f:f.update(grantRenewalPreimages={})]
  for change in changes:
   p,f=renewal_fixture();change(f)
   with self.assertRaises((ValueError,TypeError)):build_admin_plan(p,f)
 def test_normal_new_revision_one_path_unchanged(self):
  p,f=input_fixture();result=build_admin_plan(p,f);a=result['adminControl']
  self.assertTrue(all(g['grant_revision']==1 for g in a['temporaryGrants']));self.assertNotIn('grantRenewalPreimages',a)
  self.assertIn('INSERT INTO',prepare_grant_provision_sql(result));self.assertNotIn('ON CONFLICT',prepare_grant_provision_sql(result))

if __name__=='__main__':unittest.main()
