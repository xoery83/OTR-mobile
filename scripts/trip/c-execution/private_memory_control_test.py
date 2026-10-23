import unittest
from private_memory_control import run_and_hold_private_memory
class Memory(unittest.TestCase):
 def test_failure_hold_controlled_resume_same_memory_then_release(self):
  private={'A':'SYNTHETIC_PRIVATE'};identity=id(private);events=[];calls=[];budget={'reads':8}
  def execute(value):
   self.assertEqual(id(value),identity);self.assertEqual(value['A'],'SYNTHETIC_PRIVATE');calls.append(budget['reads']);budget['reads']+=1
   if len(calls)==1:raise RuntimeError('SYNTHETIC_PRIVATE_MUST_NOT_LOG')
  run_and_hold_private_memory(private,execute,iter(['ignored','continue-fixed-reviewed-runner','continue-fixed-reviewed-runner','release-private-memory-after-safe-close']),events.append)
  self.assertEqual(calls,[8,9]);self.assertEqual(budget['reads'],10);self.assertEqual(private,{})
  self.assertNotIn('SYNTHETIC_PRIVATE',str(events));self.assertEqual(events.count('FIXED_RUNNER_STOPPED_HOLD'),1)
 def test_no_automatic_retry(self):
  count=[];private={'A':'private'}
  def execute(value):count.append(1);raise ValueError()
  run_and_hold_private_memory(private,execute,iter(['release-private-memory-after-safe-close']),lambda event:None)
  self.assertEqual(len(count),1);self.assertFalse(private)
if __name__=='__main__':unittest.main()
