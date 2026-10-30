import unittest
from pdf_runtime_close import close_pdf

class PdfCloseTests(unittest.TestCase):
 def test_sql_failure_still_rolls_back_and_independently_reconciles(self):
  trace=[];attempt=0
  def sql():
   nonlocal attempt
   attempt+=1;trace.append('SQL')
   if attempt==1:raise RuntimeError('lost connection')
   return {'closed':True}
  def restore():trace.append('RESTORE');return {'verified':True}
  def worker():trace.append('STOP_WORKER');return {'verified':True}
  self.assertTrue(close_pdf(sql,restore,worker)['verified'])
  self.assertEqual(trace,['SQL','RESTORE','SQL','STOP_WORKER'])
 def test_each_unconfirmed_component_blocks_closed_claim_without_skipping_others(self):
  for failed in ['SQL','RESTORE','WORKER']:
   trace=[]
   def work(name,good):
    def run():
     trace.append(name)
     if name==failed:raise RuntimeError('unconfirmed')
     return good
    return run
   result=close_pdf(work('SQL',{'closed':True}),work('RESTORE',{'verified':True}),work('WORKER',{'verified':True}))
   self.assertFalse(result['verified']);self.assertEqual(result['status'],'PDF_CLOSURE_UNCONFIRMED')
   self.assertEqual(trace,['SQL','RESTORE','SQL','WORKER'])

if __name__=='__main__':unittest.main()
