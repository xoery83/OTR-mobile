"""No-network rescue boundary tests; not DEV execution evidence."""
import copy
import unittest
import universal_resume_contingency as m
from universal_resume_security_rescue_test import RescueTests
from universal_continuous_sql_ports_test import SqlPortsTests

class ContingencyTests(unittest.TestCase):
 def setUp(self):
  f=RescueTests();f.setUp();self.addCleanup(f.doCleanups)
  self.normal,self.rescue=f.normal,f.p
  self.o={'grantState':'ACTIVE','scopeState':'ACTIVE','integration':{'config_version':16,'kill_switch':False},'environment':{'config_version':16,'kill_switch':False,'runtime_enabled':False},'audits':[]}
  self.calls=[]
 def receipt(self,x):return SqlPortsTests.receipt(self,x)
 def observe(self):return copy.deepcopy(self.o)
 def invoke(self,i):
  self.calls.append(i)
  if i<2:self.o['grantState' if i==0 else 'scopeState']='CLOSED'
  else:self.o['integration' if i==2 else 'environment'].update(config_version=17,kill_switch=True)
  self.o['audits'].append(self.receipt(self.rescue['providerControl']['closeCommands'][i]))
 def execute(self,invoke=None,claimed=lambda _:False):
  return m.execute_closures(self.normal,self.rescue,self.observe,invoke or self.invoke,claimed,clock=lambda:m.instant(self.rescue['startsAt']))
 def test_old_receipted_closures_are_not_resent(self):
  self.o['grantState']='CLOSED';self.o['audits'].append(self.receipt(self.normal['providerControl']['closeCommands'][0]))
  self.execute();self.assertEqual(self.calls,[1,2,3]);self.assertTrue(m.closed_provider(self.o))
 def test_unknown_commit_accepted_only_with_matching_audit_and_rows(self):
  def unknown(i):self.invoke(i);raise TimeoutError()
  result=self.execute(unknown);self.assertTrue(all(x['outcome']=='UNKNOWN' for x in result));self.assertEqual(self.calls,[0,1,2,3])
 def test_unknown_no_audit_stops_without_resend(self):
  with self.assertRaises(ValueError):self.execute(lambda _:None)
  self.assertEqual(self.calls,[])
 def test_claimed_active_never_resent(self):
  with self.assertRaises(ValueError):self.execute(claimed=lambda _:True)
  self.assertEqual(self.calls,[])
 def test_closed_without_receipt_and_unexpected_revision_rejected(self):
  for key,change in [('grantState','CLOSED'),('scopeState','ABSENT')]:
   old=self.o[key];self.o[key]=change
   with self.assertRaises(ValueError):self.execute()
   self.o[key]=old
 def test_global_runtime_drift_stops_before_environment_send(self):
  self.o['environment']['runtime_enabled']=True
  with self.assertRaises(ValueError):self.execute()
  self.assertNotIn(3,self.calls)
 def test_audit_query_covers_both_command_sets(self):
  sql=m.observation_sql(self.normal,self.rescue)
  for x in self.normal['providerControl']['closeCommands']+self.rescue['providerControl']['closeCommands']:self.assertIn(x['command']['request_id'],sql)
  self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
 def test_health_without_original_identity_never_proves_rollback(self):
  self.assertFalse(m.runtime_closed(self.normal,{'healthy':True}))

if __name__=='__main__':unittest.main()
