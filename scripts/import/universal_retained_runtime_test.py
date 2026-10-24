import contextlib,copy,json,unittest
from unittest.mock import patch
import universal_runtime_close_test as compose_tests
from universal_close_test import rehash
import universal_runtime_close as runtime

class RetainedRuntimeTests(unittest.TestCase):
 def fixture(self,phase='active',unknown=None):
  p,r,files,state,calls,patches=compose_tests.RuntimeTests().fixture();active=state[0]
  base=copy.deepcopy(active);base['Config']['Env']=['KEEP_TRIP=active'];base['Config']['Labels']['com.docker.compose.project.config_files']=','.join(r['baselineComposeFiles']);base['Mounts']=base['Mounts'][:1];base['HostConfig']={'Binds':['trip-private:trip-private:ro'],'OomKillDisable':None}
  active['HostConfig']['OomKillDisable']=None
  original='a'*64;candidate='b'*64;r['originalContainerId']=original;r['backupContainerName']='otr-universal-original-'+p['activationId']
  base.update(Id=original,Name='/'+r['backupContainerName']);base['State']['Running']=False
  active.update(Id=candidate,Name='/'+r['container']);active['State']['Running']=True
  active['Config']['Labels'].update({'io.otr.universal.activation':p['activationId'],'io.otr.universal.original-container':original})
  for prefix,s in [('baseline',base),('active',active)]:
   projection=runtime.service_projection(s)
   for suffix,value in projection.items():r[prefix+suffix[0].upper()+suffix[1:]]=value
   r[prefix+'ConfigSHA256']=runtime.sha(runtime.canonical(s['Config']))
  containers={original:base,candidate:active}
  if phase=='removed':containers.pop(candidate)
  if phase=='renamed':containers.pop(candidate);base['Name']='/'+r['container']
  if phase=='baseline':containers.pop(candidate);base['Name']='/'+r['container'];base['State']['Running']=True
  rehash(p)
  def command(args,**kw):
   calls.append(args)
   if args[:3]==['docker','container','ls']:
    key,value=args[-1].split('=',1)
    found=[c['Id'] for c in containers.values() if c['Id']==value] if key=='id' else [c['Id'] for c in containers.values() if '^'+c['Name']+'$'==value]
    return '\n'.join(found)
   if args[:2]==['docker','inspect']:
    matches=[c for c in containers.values() if c['Id']==args[2] or c['Name']=='/'+args[2]]
    self.assertEqual(len(matches),1);return json.dumps(matches)
   if args[:2]==['docker','stop']:containers[args[-1]]['State']['Running']=False
   elif args[:2]==['docker','rm']:
    self.assertEqual(args,['docker','rm',candidate]);self.assertFalse(containers[candidate]['State']['Running']);containers.pop(candidate)
   elif args[:2]==['docker','rename']:
    self.assertEqual(args,['docker','rename',original,r['container']]);containers[original]['Name']='/'+r['container']
   elif args[:2]==['docker','start']:
    self.assertEqual(args,['docker','start',original]);containers[original]['State']['Running']=True
   else:raise AssertionError(args)
   if unknown==args[1]:raise runtime.subprocess.TimeoutExpired(args,35)
   return ''
  patches[0]=patch.object(runtime.subprocess,'check_output',command)
  return p,r,files,containers,calls,patches
 def run_case(self,phase='active',unknown=None):
  p,r,files,containers,calls,patches=self.fixture(phase,unknown)
  with contextlib.ExitStack() as stack:
   for item in patches:stack.enter_context(item)
   self.assertTrue(runtime.remote_close(p)['verified']);self.assertEqual(set(containers),{r['originalContainerId']})
   self.assertIsNone(containers[r['originalContainerId']]['HostConfig']['OomKillDisable']);self.assertTrue(containers[r['originalContainerId']]['State']['Running'])
   self.assertFalse(any('compose' in c for c in calls));self.assertNotIn(r['runtimeSource'],files)
   count=len(calls);self.assertTrue(runtime.remote_close(p,read_only=True)['verified'])
   self.assertFalse(any(c[1] in ['stop','rm','rename','start'] for c in calls[count:]))
 def test_exact_pinned_group_writable_baseline_preserved_without_permission_change(self):
  p,r,files,containers,calls,patches=self.fixture();path=r['baselineComposeFiles'][0]
  files[path]=(files[path][0],0o664,0)
  r['baselineComposeFileMetadata']={path:{'uid':0,'gid':0,'mode':0o664,'nlink':1}};rehash(p)
  with contextlib.ExitStack() as stack:
   for item in patches:stack.enter_context(item)
   self.assertTrue(runtime.remote_close(p)['verified']);self.assertEqual(files[path][1:],(0o664,0))
   self.assertFalse(any('chmod' in c or 'compose' in c for c in calls))
 def test_baseline_metadata_drift_rejected_before_runtime_mutation(self):
  for mode,group in [(0o644,0),(0o664,1),(0o666,0)]:
   p,r,files,containers,calls,patches=self.fixture();path=r['baselineComposeFiles'][0]
   files[path]=(files[path][0],mode,group)
   r['baselineComposeFileMetadata']={path:{'uid':0,'gid':0,'mode':0o664,'nlink':1}};rehash(p)
   with contextlib.ExitStack() as stack:
    for item in patches:stack.enter_context(item)
    with self.assertRaises(ValueError):runtime.remote_close(p)
    self.assertFalse(any(c[1] in ['stop','rm','rename','start'] for c in calls))
 def test_metadata_may_not_pin_foreign_path_or_unsafe_owner_permissions(self):
  for change in ['path','owner','mode','link']:
   p,r,files,containers,calls,patches=self.fixture();path=r['baselineComposeFiles'][0]
   m={'uid':0,'gid':0,'mode':0o664,'nlink':1}
   if change=='path':path='/foreign'
   if change=='owner':m['uid']=1
   if change=='mode':m['mode']=0o666
   if change=='link':m['nlink']=2
   r['baselineComposeFileMetadata']={path:m}
   with self.assertRaises(ValueError):runtime.validate_runtime(p)
 def test_created_phase_exact_hash_restores_without_accepting_running_drift(self):
  for phase in ['created','running']:
   p,r,files,containers,calls,patches=self.fixture();candidate=containers['b'*64]
   candidate['HostConfig']['OomKillDisable']=False;candidate['State'].update(Status=phase,Running=phase=='running')
   r['createdHostConfigSHA256']=runtime.service_projection(candidate)['hostConfigSHA256'];rehash(p)
   with contextlib.ExitStack() as stack:
    for item in patches:stack.enter_context(item)
    if phase=='created':self.assertTrue(runtime.remote_close(p)['verified'])
    else:
     with self.assertRaisesRegex(ValueError,'SERVICE_PREIMAGE_DRIFT'):runtime.remote_close(p)
     self.assertFalse(any(c[1] in ['stop','rm','rename','start'] for c in calls))
 def test_exact_original_restored_without_compose_or_volume_remove(self):self.run_case()
 def test_partial_remove_and_rename_recover_without_recreation(self):
  for phase in ['removed','renamed','baseline']:self.run_case(phase)
 def test_unknown_stop_remove_rename_start_outcomes_only_inspected(self):
  for command in ['stop','rm','rename','start']:self.run_case(unknown=command)
 def test_read_only_active_no_mutation(self):
  p,r,files,containers,calls,patches=self.fixture()
  with contextlib.ExitStack() as stack:
   for item in patches:stack.enter_context(item)
   with self.assertRaisesRegex(RuntimeError,'READ_ONLY_RUNTIME_STILL_ACTIVE'):runtime.remote_close(p,read_only=True)
   self.assertFalse(any(c[1] in ['stop','rm','rename','start'] for c in calls));self.assertIn(r['runtimeSource'],files)
 def test_drifted_original_labels_null_hostconfig_or_candidate_identity_fail_closed(self):
  changes=[lambda p,r,c:c[r['originalContainerId']]['Config']['Labels'].update(unreviewed='yes'),lambda p,r,c:c[r['originalContainerId']]['HostConfig'].update(OomKillDisable=False),lambda p,r,c:c['b'*64]['Config']['Labels'].update({'io.otr.universal.activation':'foreign'}),lambda p,r,c:c[r['originalContainerId']].update(Name='/wrong-backup'),lambda p,r,c:c.pop(r['originalContainerId'])]
  for change in changes:
   p,r,files,containers,calls,patches=self.fixture();change(p,r,containers)
   with contextlib.ExitStack() as stack:
    for item in patches:stack.enter_context(item)
    with self.assertRaises(ValueError):runtime.remote_close(p)
    self.assertFalse(any(c[1] in ['stop','rm','rename','start'] for c in calls));self.assertIn(r['runtimeSource'],files)
 def test_failed_stop_never_removes_candidate_or_original(self):
  p,r,files,containers,calls,patches=self.fixture();normal=patches[0].new
  def fail(args,**kw):
   if args[:2]==['docker','stop']:
    calls.append(args);raise runtime.subprocess.TimeoutExpired(args,35)
   return normal(args,**kw)
  patches[0]=patch.object(runtime.subprocess,'check_output',fail)
  with contextlib.ExitStack() as stack:
   for item in patches:stack.enter_context(item)
   with self.assertRaisesRegex(RuntimeError,'CANDIDATE_STOP_UNCONFIRMED'):runtime.remote_close(p)
   self.assertEqual(len(containers),2);self.assertFalse(any(c[1] in ['rm','rename','start'] for c in calls));self.assertIn(r['runtimeSource'],files)
 def test_recover_only_partial_restore_does_not_rename_or_start(self):
  for phase in ['removed','renamed']:
   p,r,files,containers,calls,patches=self.fixture(phase)
   with contextlib.ExitStack() as stack:
    for item in patches:stack.enter_context(item)
    with self.assertRaisesRegex(RuntimeError,'READ_ONLY_RUNTIME_STILL_ACTIVE'):runtime.remote_close(p,read_only=True)
    self.assertFalse(any(c[1] in ['rm','stop','rename','start'] for c in calls));self.assertIn(r['runtimeSource'],files)
 def test_retained_fields_exact_and_cross_window_rejected(self):
  p,r,*_=self.fixture();runtime.validate_runtime(p)
  for field,value in [('originalContainerId','bad'),('backupContainerName','otr-universal-original-other'),('baselineConfigSHA256','bad')]:
   q=copy.deepcopy(p);q['runtime'][field]=value
   with self.assertRaises(ValueError):runtime.validate_runtime(q)

if __name__=='__main__':unittest.main()
