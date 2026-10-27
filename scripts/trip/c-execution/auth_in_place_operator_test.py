import importlib.util,unittest,tempfile,pathlib,os,stat
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('operator_module',__file__.replace('_test.py','.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Budget(unittest.TestCase):
 def test_cross_windows_do_not_reset_and_unknown_reserves(self):
  j={'ownerAuthorizationSHA256':m.OWNER_SHA,'counts':{'A':0,'B':0},'entries':[]};proof={'utc':'fixture'}
  self.assertEqual(m.reserve(j,'A','first',proof),1);self.assertEqual(m.reserve(j,'A','second',proof),2)
  self.assertEqual(j['entries'][0]['status'],'RESERVED_OUTCOME_UNKNOWN')
  with self.assertRaises(ValueError):m.reserve(j,'A','third',proof)
  self.assertEqual(m.reserve(j,'B','third',proof),1)
 def test_corrupt_or_wrong_owner_fails_closed(self):
  with self.assertRaises(ValueError):m.reserve({'ownerAuthorizationSHA256':'wrong'},'A','window',{'utc':'fixture'})
  with self.assertRaises(AssertionError):m.reserve({'ownerAuthorizationSHA256':m.OWNER_SHA,'counts':{'A':-1,'B':0},'entries':[]},'A','window',{'utc':'fixture'})
 def test_atomic_reservation_flushes_file_then_parent_directory(self):
  original=os.fsync;seen=[]
  def flush(fd):seen.append(stat.S_ISDIR(os.fstat(fd).st_mode));original(fd)
  with tempfile.TemporaryDirectory()as d:
   with patch.object(os,'fsync',side_effect=flush):m.private(pathlib.Path(d)/'journal.json',{'safe':'fixture'})
  self.assertEqual(seen,[False,True])
if __name__=='__main__':unittest.main()
