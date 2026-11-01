import importlib.util, pathlib, tempfile, json, hashlib, unittest
spec=importlib.util.spec_from_file_location('issuer',pathlib.Path(__file__).with_name('issuer_close.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Close(unittest.TestCase):
 def setUp(self):
  self.path=pathlib.Path('/private/tmp/otr-auth-mcp-slice1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');self.path.mkdir(mode=0o700,exist_ok=False)
  spec=importlib.util.spec_from_file_location('renderer',m.ROOT/'scripts/auth/render-mcp-write-qa-hook.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
  start,end='2026-11-01T10:00:00Z','2026-11-01T10:30:00Z';active=r.render(m.CLIENT,end,start);closed=r.render_close(active)
  self.plan={'gateSHA256':m.GATE,'windowId':'a'*32,'clientId':m.CLIENT,'startsAt':start,'expiresAt':end,'activeSQLSHA256':m.sha(active.encode()),'closeSQLSHA256':m.sha(closed.encode()),'activeBodyMD5':hashlib.md5(active.split('$hook$')[1].encode()).hexdigest()}
 def tearDown(self):
  for p in self.path.iterdir():p.unlink()
  self.path.rmdir()
 def test_one_write_and_readback(self):
  state={'body':self.plan['activeBodyMD5'],'writes':0}
  def sql(q):
   if q.startswith('SET '):state.update(body=m.CLOSED,writes=state['writes']+1);return {}
   return {'rows':[{'body':state['body']}]}
  self.assertTrue(m.close_once(self.plan,self.path,sql)['issuerClosed']);self.assertTrue(m.close_once(self.plan,self.path,sql)['issuerClosed']);self.assertEqual(state['writes'],1)
 def test_unknown_never_reapplies(self):
  writes=[]
  def sql(q):
   if q.startswith('SET '):writes.append(q);raise RuntimeError('UNKNOWN')
   return {'rows':[{'body':self.plan['activeBodyMD5']}]}
  self.assertFalse(m.close_once(self.plan,self.path,sql)['issuerClosed']);self.assertFalse(m.close_once(self.plan,self.path,sql)['issuerClosed']);self.assertEqual(len(writes),1)
 def test_foreign_drift_and_policy_fail_before_write(self):
  calls=[]
  def sql(q):calls.append(q);return {'rows':[{'body':'foreign'}]}
  with self.assertRaises(ValueError):m.close_once(self.plan,self.path,sql)
  self.assertEqual(len(calls),1)
  for change in [{'clientId':'83504d3f-59d4-43fd-99b1-bebc54c40f7d'},{'gateSHA256':'0'*64},{'expiresAt':'2026-11-01T10:30:01Z'},{'closeSQLSHA256':'0'*64}]:
   with self.assertRaises(ValueError):m.validate({**self.plan,**change},self.path)
if __name__=='__main__':unittest.main()
