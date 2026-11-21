"""Offline qualification checks: no database, credentials or Hosted access."""
import runpy
import unittest
from pathlib import Path
package=runpy.run_path(str(Path(__file__).with_name('core-member-access-install-package.py')))
class PreimageProfileTest(unittest.TestCase):
 def test_exact_profiles_only(self):
  for name,profile in package['PREIMAGE_PROFILES'].items():
   manifest={kind:{'definitionSHA256':profile.get(kind,'legacy-reviewed-actor')} for kind in ('actor','write','read-state')}
   self.assertEqual(package['supported_profile'](manifest),name)
   manifest['write']['definitionSHA256']='0'*64
   with self.assertRaises(ValueError):package['supported_profile'](manifest)
 def test_mixed_generation_rejected(self):
  old,new=package['PREIMAGE_PROFILES'].values()
  manifest={kind:{'definitionSHA256':digest} for kind,digest in new.items()}
  manifest['read-state']['definitionSHA256']=old['read-state']
  with self.assertRaises(ValueError):package['supported_profile'](manifest)
 def test_actor_is_frozen_in_both_profiles(self):
  for profile in package['PREIMAGE_PROFILES'].values():
   manifest={kind:{'definitionSHA256':digest} for kind,digest in profile.items()}
   manifest['actor']['definitionSHA256']='0'*64
   with self.assertRaises(ValueError):package['supported_profile'](manifest)
if __name__=='__main__':unittest.main()
