"""Retained previous windows must not prevent the new runtime from rolling back."""
import importlib.util,pathlib,tempfile,unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('runtime',pathlib.Path(__file__).with_name('p2_ready_runtime.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class RetainedSiblingTest(unittest.TestCase):
 def test_previous_window_names_remain_occupied(self):
  old={'Id':'old','Name':'/otr-universal-p2-ready-7caf7119-previous','Image':'image','State':{'Running':False,'Status':'exited','Health':{'Status':'healthy'}}}
  new={'Id':'new','Name':'/otr-dev-backend','Image':'image','State':{'Running':True,'Status':'running'}}
  occupied={'/otr-universal-p2-review-088b49e5-failed-d83ec6b3','/otr-universal-p2-review-088b49e5-previous-d83ec6b3'}
  states={'old':old,'new':new}
  def call(*args):
   if args[1]=='stop':states[args[-1]]['State'].update(Running=False,Status='exited')
   elif args[1]=='rename':
    target='/'+args[3]
    if target in occupied or any(s['Name']==target for s in states.values()):raise RuntimeError('CONTAINER_NAME_IN_USE')
    states[args[2]]['Name']=target
   elif args[1]=='start':states[args[2]]['State'].update(Running=True,Status='running')
   return b''
  with tempfile.TemporaryDirectory() as temp,patch.object(r,'ROOT',pathlib.Path(temp)),patch.object(r,'snap',side_effect=lambda i:states[i]),patch.object(r,'check'),patch.object(r,'call',side_effect=call):
   self.assertEqual(r.rollback({'originalContainerId':'old','candidateContainerId':'new'})['status'],'ROLLBACK_VERIFIED')
  self.assertTrue(old['State']['Running']);self.assertFalse(new['State']['Running'])
  self.assertEqual(old['Name'],'/otr-dev-backend')
if __name__=='__main__':unittest.main()
