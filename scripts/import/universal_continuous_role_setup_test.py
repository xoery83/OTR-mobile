"""Role SQL renderer fixtures only; no DEV changes."""
import copy
import unittest
from universal_resume_security_rescue_test import RescueTests
import universal_continuous_role_setup as m

class SetupTests(unittest.TestCase):
 def setUp(self):
  f=RescueTests();f.setUp();self.addCleanup(f.doCleanups);self.p=f.normal
 def test_only_fixed_login_expiry_and_two_exact_grant_renewals(self):
  sql=m.render(self.p)
  self.assertEqual(sql.count('ALTER ROLE '),3);self.assertEqual(sql.count('UPDATE public.external_integration_admin_grants'),2)
  for token in ['current_user<>\'postgres\'','FOR UPDATE','pg_stat_activity','grant_revision=9','grant_revision=7',"VALID UNTIL 'infinity'",'240 seconds']:self.assertIn(token,sql)
  for token in ['PASSWORD','GRANT ','CREATE ','DELETE ','INSERT ','SET ROLE','UPDATE public.trip_sustained_dev_policy']:self.assertNotIn(token,sql)
 def test_missing_preimage_or_wrong_grant_cannot_render(self):
  for key in ['CONFIG_ADMIN','SECURITY_ADMIN']:
   p=copy.deepcopy(self.p);del p['adminControl']['grantRenewalPreimages'][key]
   with self.assertRaises((KeyError,ValueError)):m.render(p)

if __name__=='__main__':unittest.main()
