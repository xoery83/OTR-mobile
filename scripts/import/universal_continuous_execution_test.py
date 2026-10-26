"""The retained Source proof cannot be mistaken for Task or Admission success."""
import unittest
from universal_continuous_execution import verified_retained_source_probe
from universal_continuous_transition import ACTOR

class RetainedProbeTests(unittest.TestCase):
    def test_exact_real_reader_proof_and_scope_required(self):
        value={'version':'otr.qa.source-reader-probe/1',
               'status':'PROTECTED_SOURCE_READER_ROUNDTRIP_VERIFIED','actorId':ACTOR,
               'tripId':'825f79b2-4a9d-4535-a62e-43000ca50c4a',
               'batchId':'8b91dbf8-cb7d-4f72-a54c-ed78e5753f4b','sourceCount':2,
               'taskOrAdmissionQualification':'NOT_EVALUATED'}
        self.assertTrue(verified_retained_source_probe(value,ACTOR))
        for key,bad in [('actorId','foreign'),('tripId','foreign'),('batchId','foreign'),
                        ('sourceCount',True),('sourceCount',2.0),
                        ('taskOrAdmissionQualification','PASS'),('status','LOCAL_PASS')]:
            self.assertFalse(verified_retained_source_probe({**value,key:bad},ACTOR),key)
        self.assertFalse(verified_retained_source_probe({**value,'taskId':'invented'},ACTOR))

if __name__=='__main__':unittest.main()
