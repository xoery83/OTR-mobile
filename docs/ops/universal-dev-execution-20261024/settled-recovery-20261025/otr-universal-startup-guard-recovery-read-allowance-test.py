import unittest,json,tempfile,importlib.util,copy,multiprocessing,time
from pathlib import Path
PATH='/private/tmp/otr-universal-startup-guard-recovery-read-allowance.py'
def load():
 s=importlib.util.spec_from_file_location('helper',PATH);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load()
def worker(directory,queue):
 h=load();h.legacy.DIRECTORY=directory
 for _ in range(300):
  try: queue.put(('OK',h.reserve(directory,'TASK_RESULT')['ordinal']));return
  except FileExistsError: time.sleep(0.002)
  except ValueError as e: queue.put(('DENIED',str(e)));return
 queue.put(('ERROR','LOCK_TIMEOUT'))
class Tests(unittest.TestCase):
 def fixture(self,d):
  m.legacy.DIRECTORY=str(d)
  rows=[{'ordinal':n,'purpose':'TASK_CONTEXT','at':'preserved'} for n in range(1,43)]
  a={'freshBatchId':m.BATCH,'previousMaximum':32,'maximum':48,'additionalMaximum':16,'startsAtOrdinal':28,'prefixCount':27,'prefixSHA256':m.digest(rows[:27])}
  v={'runId':m.legacy.OLD_RUN,'maximum':48,'reservations':rows,'freshBatchAmendment':a,'additionalPreservedMetadata':{'doNotChange':True}}
  p=d/'operator-read-ledger.json';p.write_text(json.dumps(v));m.base.amend(d,m.legacy.digest(p.read_bytes()),'a'*64,True)
  m.base.reserve(d,'SOURCE_CATALOG')
  old=json.loads(p.read_text());return p,copy.deepcopy(old),m.legacy.digest(p.read_bytes())
 def test_dryrun_once_16_and_17th_reject_preserves_all_history(self):
  with tempfile.TemporaryDirectory(prefix='otr-fixture-ledger-') as t:
   d=Path(t);p,old,h=self.fixture(d);raw=p.read_bytes()
   self.assertEqual(m.amend(d,h,'b'*64)['status'],'PROPOSED_NO_WRITE');self.assertEqual(p.read_bytes(),raw)
   m.amend(d,h,'b'*64,True)
   with self.assertRaisesRegex(ValueError,'EXACT_43'):m.amend(d,h,'b'*64,True)
   for n in range(44,60):self.assertEqual(m.reserve(d,'TASK_RESULT')['ordinal'],n)
   before=p.read_bytes()
   with self.assertRaisesRegex(ValueError,'EXHAUSTED'):m.reserve(d,'TASK_RESULT')
   self.assertEqual(p.read_bytes(),before);v=json.loads(before)
   self.assertEqual(v['reservations'][:43],old['reservations']);self.assertEqual(m.metadata(v),m.metadata(old));self.assertEqual(v['maximum'],72);self.assertEqual(v[m.KEY]['historicalStartupReadUncertainty'],m.UNKNOWN)
   for f in [m.base.reserve,m.legacy.reserve]:
    with self.assertRaises(ValueError):f(d,'TASK_RESULT')
   self.assertEqual(p.read_bytes(),before)
 def test_exact_sha_gate_prefix_policy_purpose_and_foreign_rows(self):
  with tempfile.TemporaryDirectory(prefix='otr-fixture-ledger-') as t:
   d=Path(t);p,old,h=self.fixture(d);raw=p.read_bytes()
   for wrong_sha,gate in [('f'*64,'b'*64),(h,'not-a-sha')]:
    with self.assertRaises(ValueError):m.amend(d,wrong_sha,gate,True)
    self.assertEqual(p.read_bytes(),raw)
   m.amend(d,h,'b'*64,True);sealed=p.read_bytes()
   for purpose,policy in [('SOURCE_RESULT',m.POLICY),('TASK_RESULT','UNIVERSAL_SETTLED_RECOVERY')]:
    with self.assertRaises(ValueError):m.reserve(d,purpose,policy)
    self.assertEqual(p.read_bytes(),sealed)
   for mutate in [lambda v:v['reservations'][42].update(at='DRIFT'),lambda v:v['freshBatchAmendment'].update(maximum=99),lambda v:v[m.KEY]['historicalStartupReadUncertainty'].update(refundedReads=12),lambda v:v['reservations'].append({'ordinal':44,'policy':'OLD','purpose':'TASK_RESULT','freshBatchId':m.BATCH})]:
    v=json.loads(sealed);mutate(v);p.write_text(json.dumps(v));before=p.read_bytes()
    with self.assertRaises(ValueError):m.reserve(d,'TASK_RESULT')
    self.assertEqual(p.read_bytes(),before)
 def test_single_legacy_lock_and_18_concurrent_workers_hard16(self):
  with tempfile.TemporaryDirectory(prefix='otr-fixture-ledger-') as t:
   d=Path(t);p,old,h=self.fixture(d);m.amend(d,h,'b'*64,True);before=p.read_bytes()
   (d/'operator-read.lock').write_text('held')
   with self.assertRaises(FileExistsError):m.reserve(d,'TASK_RESULT')
   self.assertEqual(p.read_bytes(),before);(d/'operator-read.lock').unlink()
   ctx=multiprocessing.get_context('fork');q=ctx.Queue();workers=[ctx.Process(target=worker,args=(str(d),q)) for _ in range(18)]
   for w in workers:w.start()
   results=[q.get(timeout=20) for _ in workers]
   for w in workers:w.join(20);self.assertEqual(w.exitcode,0)
   self.assertEqual(sorted(x[1] for x in results if x[0]=='OK'),list(range(44,60)));self.assertEqual(sum(x[0]=='DENIED' for x in results),2)
   v=json.loads(p.read_text());self.assertEqual(len(v['reservations']),59);self.assertEqual(v['reservations'][:43],old['reservations'])
if __name__=='__main__':unittest.main()
