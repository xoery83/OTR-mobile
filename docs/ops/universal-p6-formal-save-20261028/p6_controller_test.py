"""Local-only terminal-window regression. No Docker, SSH or SQL."""
import importlib.util,json,pathlib,tempfile,time,unittest,unittest.mock as mock
spec=importlib.util.spec_from_file_location('p6_runtime',pathlib.Path(__file__).with_name('p6_review_runtime.py'));runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
class TerminalWindow(unittest.TestCase):
 def test_rollback_before_first_swap_forbids_reopen_without_docker(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d)
   for name,value in {'plan.json':{},'owner-approval.json':{'ownerApproved':True,'gateName':'P6_STANDING_SINGLE_SAVE/1'},'window.json':{'deadline':time.time()+3600,'swapDeadline':time.time()+3000},'early-closed.json':{'status':'ROLLBACK_VERIFIED'}}.items():(root/name).write_text(json.dumps(value))
   real_open=runtime.os.open
   def local_open(path,*args):return real_open(root/'service.lock' if str(path).startswith('/run/lock/') else path,*args)
   with mock.patch.object(runtime,'ROOT',root),mock.patch.object(runtime.sys,'argv',['operator.py','swap']),mock.patch.object(runtime.os,'open',local_open),mock.patch.object(runtime,'snap') as read_docker,mock.patch.object(runtime,'call') as mutate:
    with self.assertRaisesRegex(ValueError,'P6_WINDOW_ALREADY_CLOSED'):runtime.main()
    read_docker.assert_not_called();mutate.assert_not_called()
 def test_cancelled_watch_has_no_docker_or_restore(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d)
   for name,value in {'plan.json':{},'window.json':{'deadline':time.time()-1},'early-closed.json':{'status':'ROLLBACK_VERIFIED'}}.items():(root/name).write_text(json.dumps(value))
   real_open=runtime.os.open
   def local_open(path,*args):return real_open(root/'service.lock' if str(path).startswith('/run/lock/') else path,*args)
   with mock.patch.object(runtime,'ROOT',root),mock.patch.object(runtime.sys,'argv',['operator.py','watch']),mock.patch.object(runtime.os,'open',local_open),mock.patch.object(runtime,'call') as mutate,mock.patch.object(runtime,'rollback') as restore:
    runtime.main();mutate.assert_not_called();restore.assert_not_called()
if __name__=='__main__':unittest.main()
