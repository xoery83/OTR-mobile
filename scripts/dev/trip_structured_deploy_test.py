import copy,datetime,importlib.util,itertools,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import trip_structured_deploy as deploy

class StructuredDeployTests(unittest.TestCase):
 def gate(self):return json.loads((deploy.ROOT/'docs/ops/ad5-trip-sync-20261023/DEPLOY_GATE.json').read_text())
 def test_prepare_has_no_external_calls(self):
  gate=self.gate();deploy.validate(gate)
  with patch.object(deploy.subprocess,'run',side_effect=AssertionError('NO_EXTERNAL_DISPATCH')),patch('sys.argv',['prepare','--gate',str(deploy.ROOT/'docs/ops/ad5-trip-sync-20261023/DEPLOY_GATE.json')]):deploy.main()
 def test_invalid_target_and_old_entry_refused(self):
  for field,value in [('beforeImage',deploy.shared.OLD_IMAGE),('rollbackCommand',['node','server.mjs']),('helperSHA256','0'*64),('sqlSHA256','0'*64)]:
   gate=self.gate();gate[field]=value
   with self.assertRaises(AssertionError):deploy.validate(gate)
 def test_clock_and_reserve(self):
  now=datetime.datetime.now(datetime.timezone.utc);gate=self.gate();gate.update(startsAt=(now-datetime.timedelta(seconds=1)).isoformat(),expiresAt=(now+datetime.timedelta(seconds=300)).isoformat());deploy.assert_window(gate,now)
  for start,end in [(now,now+datetime.timedelta(seconds=901)),(now,now+datetime.timedelta(seconds=239)),(now+datetime.timedelta(seconds=1),now+datetime.timedelta(seconds=300))]:
   gate.update(startsAt=start.isoformat(),expiresAt=end.isoformat())
   with self.assertRaises(AssertionError):deploy.assert_window(gate,now)
 def test_strict_catalog_no_false_or_envelope_true(self):
  for rows in [[],[{'qualification':{'closed':False,'rolesClosed':True,'sessions':0}}],[{'qualification':{'closed':True,'rolesClosed':False,'sessions':0}}],[{'qualification':{'closed':True,'rolesClosed':True,'sessions':1}}],[{'qualification':{},'unrelated':True}]]:
   with self.assertRaises((AssertionError,KeyError)):deploy.qualification(rows)
 def test_no_approval_no_wire_and_single_attempt(self):
  gate=self.gate();now=datetime.datetime.now(datetime.timezone.utc);gate.update(startsAt=(now-datetime.timedelta(seconds=1)).isoformat(),expiresAt=(now+datetime.timedelta(seconds=600)).isoformat())
  with tempfile.TemporaryDirectory() as d,patch.object(deploy,'sql') as sql:
   with self.assertRaises(AssertionError):deploy.execute(gate,'deploy',Path(d))
   sql.assert_not_called();gate.update(ownerAuthorized=True,authorizedPhases=['deploy'])
   sql.return_value=[{'qualification':{**gate['catalogAfterSQL'],'closed':False}}]
   with self.assertRaises(AssertionError):deploy.execute(gate,'deploy',Path(d))
   with self.assertRaises(FileExistsError):deploy.execute(gate,'deploy',Path(d))
   self.assertEqual(sql.call_count,1)
 def test_source_changes_during_catalog_stop_before_mutation(self):
  for target,phase in itertools.product((deploy.MIGRATION,Path(deploy.shared.__file__)),('sql','deploy')):
   gate=self.gate();now=datetime.datetime.now(datetime.timezone.utc);gate.update(startsAt=(now-datetime.timedelta(seconds=1)).isoformat(),expiresAt=(now+datetime.timedelta(seconds=600)).isoformat(),ownerAuthorized=True,authorizedPhases=['sql','deploy'])
   original=Path.read_bytes; changed=False
   def read(path):return original(path)+(b'\n# UNAPPROVED CHANGE' if changed and path==target else b'')
   def readback(*args):
    nonlocal changed
    changed=True
    return [{'qualification':gate['catalogBeforeSQL' if phase=='sql' else 'catalogAfterSQL']}]
   with tempfile.TemporaryDirectory() as d,patch.object(Path,'read_bytes',read),patch.object(deploy,'sql',side_effect=readback) as sql,patch.object(deploy.subprocess,'run') as remote:
    with self.assertRaises(AssertionError):deploy.execute(gate,phase,Path(d))
    self.assertEqual(sql.call_count,1);remote.assert_not_called()
 def test_sql_phase_exact_preimage_and_postverification(self):
  gate=self.gate();now=datetime.datetime.now(datetime.timezone.utc);gate.update(startsAt=(now-datetime.timedelta(seconds=1)).isoformat(),expiresAt=(now+datetime.timedelta(seconds=600)).isoformat(),ownerAuthorized=True,authorizedPhases=['sql'])
  with tempfile.TemporaryDirectory() as d,patch.object(deploy,'sql',side_effect=[[{'qualification':gate['catalogBeforeSQL']}],[],[{'qualification':gate['catalogAfterSQL']}]]) as sql:
   result=deploy.execute(gate,'sql',Path(d));self.assertEqual(result['status'],'DORMANT_SQL_VERIFIED');self.assertEqual(sql.call_args_list[1].args[1],deploy.MIGRATION.read_text())

if __name__=='__main__':unittest.main()
