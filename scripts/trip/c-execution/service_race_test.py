"""Deterministic local OS flock tests. Service body simulated; no Docker/SSH/DEV."""
import concurrent.futures, datetime, fcntl, os, pathlib, tempfile, threading, time, unittest
from unittest.mock import patch
import service
class Tests(unittest.TestCase):
 def test_inflight_activation_cannot_land_after_verified_restore(self):
  with tempfile.TemporaryDirectory() as d:
   service.Path=lambda p:pathlib.Path(d)/'finite.lock'
   started=threading.Event();release=threading.Event();restored=threading.Event();mounted={'value':False}
   def inner(p,action,secret):
    if action=='activate':started.set();release.wait(2);mounted['value']=True
    else:mounted['value']=False;restored.set()
    return {'verified':True}
   with patch.object(service,'remote_locked',inner),concurrent.futures.ThreadPoolExecutor(2) as pool:
    activation=pool.submit(service.remote,{},'activate',{});self.assertTrue(started.wait(1))
    restoration=pool.submit(service.remote,{},'restore',{});time.sleep(.05);self.assertFalse(restored.is_set())
    release.set();self.assertTrue(activation.result(1)['verified']);self.assertTrue(restoration.result(1)['verified']);self.assertFalse(mounted['value'])
 def test_waiting_activation_rechecks_expiry_after_restore_lock(self):
  with tempfile.TemporaryDirectory() as d:
   lock=pathlib.Path(d)/'finite.lock';fd=os.open(lock,os.O_CREAT|os.O_RDWR,0o600);fcntl.flock(fd,fcntl.LOCK_EX)
   service.Path=lambda p:lock;state={'mutated':False};expiry=time.time()+.1
   def inner(p,action,secret):
    if time.time()>=expiry:raise RuntimeError('C_WINDOW_CLOSED')
    state['mutated']=True
   try:
    with patch.object(service,'remote_locked',inner),concurrent.futures.ThreadPoolExecutor(1) as pool:
     pending=pool.submit(service.remote,{},'activate',{});time.sleep(.15);fcntl.flock(fd,fcntl.LOCK_UN)
     with self.assertRaisesRegex(RuntimeError,'C_WINDOW_CLOSED'):pending.result(1)
     self.assertFalse(state['mutated'])
   finally:os.close(fd)
 def test_lock_timeout_is_reconcile_not_success(self):
  with tempfile.TemporaryDirectory() as d:
   service.Path=lambda p:pathlib.Path(d)/'finite.lock'
   def flock(fd,flags):
    if flags!=fcntl.LOCK_UN:raise BlockingIOError()
   with patch.object(service.fcntl,'flock',flock),patch.object(service.time,'monotonic',side_effect=[0,61]):
    with self.assertRaisesRegex(RuntimeError,'RECONCILE'):service.remote({},'restore',{})
if __name__=='__main__':unittest.main()
