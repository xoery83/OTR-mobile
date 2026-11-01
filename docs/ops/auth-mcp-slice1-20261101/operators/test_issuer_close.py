import importlib.util, pathlib, tempfile, json, hashlib, unittest
spec=importlib.util.spec_from_file_location('issuer',pathlib.Path(__file__).with_name('issuer_close.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Close(unittest.TestCase):
 def setUp(self):
  self.path=pathlib.Path('/private/tmp/otr-auth-mcp-slice1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');self.path.mkdir(mode=0o700,exist_ok=False)
  spec=importlib.util.spec_from_file_location('renderer',m.ROOT/'scripts/auth/render-mcp-write-qa-hook.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
  self.renderer=r
  start,end='2026-11-01T10:00:00Z','2026-11-01T10:30:00Z';active=r.render(m.CLIENT,end,start);closed=r.render_close(active)
  self.plan={'gateSHA256':m.GATE,'windowId':'a'*32,'clientId':m.CLIENT,'startsAt':start,'expiresAt':end,'activeSQLSHA256':m.sha(active.encode()),'closeSQLSHA256':m.sha(closed.encode()),'activeBodyMD5':hashlib.md5(active.split('$hook$')[1].encode()).hexdigest()}
 def select_client(self,client):
  active=self.renderer.render(client,self.plan['expiresAt'],self.plan['startsAt']);closed=self.renderer.render_close(active)
  self.plan.update(clientId=client,activeSQLSHA256=m.sha(active.encode()),closeSQLSHA256=m.sha(closed.encode()),activeBodyMD5=hashlib.md5(active.split('$hook$')[1].encode()).hexdigest())
  return active,closed
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
 def test_frozen_claude_and_only_registered_uuid_delta_for_chatgpt(self):
  active,closed=self.select_client(m.CLIENT)
  self.assertEqual(m.sha(active.encode()),'698c1d326f616572b58ee756b2a43db4eef2fb336ed6cda2051ae7c6a57134f3')
  self.assertEqual(m.sha(closed.encode()),'a63a08f86cbf41be005767d4a1541da303408208cfc8dcd5b9fec104c595ac5f')
  gpt,gptclose=self.select_client(m.CLIENTS[1])
  self.assertEqual(gpt,active.replace(m.CLIENT,m.CLIENTS[1]));self.assertNotIn(m.CLIENT,gpt)
  self.assertEqual(gpt.count(m.CLIENTS[1]),1)
  self.assertEqual(hashlib.md5(gptclose.split('$hook$')[1].encode()).hexdigest(),m.CLOSED)
  m.validate(self.plan,self.path)
 def test_chatgpt_one_write_and_readback(self):
  self.select_client(m.CLIENTS[1]);state={'body':self.plan['activeBodyMD5'],'writes':0}
  def sql(q):
   if q.startswith('SET '):state.update(body=m.CLOSED,writes=state['writes']+1);return {}
   return {'rows':[{'body':state['body']}]}
  self.assertTrue(m.close_once(self.plan,self.path,sql)['issuerClosed']);self.assertTrue(m.close_once(self.plan,self.path,sql)['issuerClosed']);self.assertEqual(state['writes'],1)
 def test_chatgpt_unknown_never_reapplies(self):
  self.select_client(m.CLIENTS[1]);writes=[]
  def sql(q):
   if q.startswith('SET '):writes.append(q);raise RuntimeError('UNKNOWN')
   return {'rows':[{'body':self.plan['activeBodyMD5']}]}
  self.assertFalse(m.close_once(self.plan,self.path,sql)['issuerClosed']);self.assertFalse(m.close_once(self.plan,self.path,sql)['issuerClosed']);self.assertEqual(len(writes),1)
  self.assertEqual(json.loads((self.path/'issuer-close-intent.json').read_text())['disposition'],'UNKNOWN_NO_REAPPLY')
 def test_each_client_rejects_foreign_sql_hash_and_overlong_window(self):
  for client in m.CLIENTS:
   self.select_client(client);m.validate(self.plan,self.path)
   for change in [{'clientId':m.CLIENTS[1] if client==m.CLIENT else m.CLIENT}, {'activeSQLSHA256':'0'*64}, {'closeSQLSHA256':'0'*64}, {'activeBodyMD5':'0'*32}, {'expiresAt':'2026-11-01T10:30:01Z'}]:
    with self.subTest(client=client,change=change):
     with self.assertRaises(ValueError):m.validate({**self.plan,**change},self.path)
 def test_arbitrary_or_simultaneous_clients_rejected_before_sql(self):
  for client in ['11111111-1111-4111-8111-111111111111',','.join(m.CLIENTS),list(m.CLIENTS),None]:
   with self.subTest(client=client):
    with self.assertRaises(ValueError):self.renderer.render(client,self.plan['expiresAt'],self.plan['startsAt'])
    with self.assertRaises(ValueError):m.validate({**self.plan,'clientId':client},self.path)
if __name__=='__main__':unittest.main()
