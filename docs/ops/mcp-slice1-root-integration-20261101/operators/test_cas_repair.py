import sys,unittest,copy
import config_cas as cas
sys.modules['config_cas']=cas
import test_protocol as base

class Repair(unittest.TestCase):
 def test_only_default_oom_normalized(self):
  a={'HostConfig':{'OomKillDisable':None,'NetworkMode':'private'}}
  b={'HostConfig':{'OomKillDisable':False,'NetworkMode':'private'}}
  self.assertTrue(cas.same_host(a,b))
  b['HostConfig']['OomKillDisable']=True;self.assertFalse(cas.same_host(a,b))
  b['HostConfig']['OomKillDisable']=False;b['HostConfig']['NetworkMode']='host';self.assertFalse(cas.same_host(a,b))
 def retained(self):
  f=base.Fixture('EMPTY');old=f.snap[base.DEFAULT]
  old['HostConfig']['OomKillDisable']=None
  f.g['beforeHostConfigSHA256']=cas.digest(old['HostConfig'])
  cfg=dict(old['Config'],Env=old['Config']['Env']+[cas.WRITE+'='+f.g['authQaConfig']])
  n=base.snapshot(base.NEW,f.g['containerName'],cfg,False);n['State']['Status']='created';n['HostConfig']=copy.deepcopy(old['HostConfig']);n['HostConfig']['OomKillDisable']=False
  f.snap[base.NEW]=n;f.g['retainedCreatedCandidateId']=base.NEW
  f.create=lambda: (_ for _ in ()).throw(AssertionError('MUST_NOT_CREATE'))
  # Fixture eagerly asks for Docker class even when it must not instantiate it.
  class NoCreate:
   def __init__(self,*a,**kw):raise AssertionError('MUST_NOT_CREATE')
  f.create=lambda:NoCreate
  return f
 def test_resume_exact_created_without_create(self):
  f=self.retained();r=f.execute();self.assertEqual(r['containerId'],base.NEW);self.assertTrue(r['closePlanPublishedBeforeServe'])
 def test_wrong_identity_state_and_config_rejected(self):
  for change in ('name','state','config','host'):
   f=self.retained();n=f.snap[base.NEW]
   if change=='name':n['Name']='/wrong'
   elif change=='state':n['State']['Status']='running';n['State']['Running']=True
   elif change=='config':n['Config']['Env'].append('UNAPPROVED=x')
   else:n['HostConfig']['OomKillDisable']=True
   with self.subTest(change=change),self.assertRaises(AssertionError):f.execute()
   self.assertIsNone(f.close)

suite=unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromModule(base),unittest.defaultTestLoader.loadTestsFromTestCase(Repair)])
if not unittest.TextTestRunner().run(suite).wasSuccessful():raise SystemExit(1)
