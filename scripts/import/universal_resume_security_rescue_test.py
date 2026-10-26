"""Pure fixture contingency checks; not DEV execution or permission receipts."""
import copy
import unittest
import universal_continuous_sql_ports_test as fixture
import universal_resume_security_rescue as m
from universal_continuous_transition import canonical,sha

class RescueTests(unittest.TestCase):
    def setUp(self):
        f=fixture.SqlPortsTests();f.setUp();self.addCleanup(f.doCleanups);f.setup_provider_recovery(4)
        self.normal=f.plan
        a=self.normal['adminControl'];a['grantRenewalPreimages']={}
        for g in a['temporaryGrants']:
            g.update(admin_grant_id=m.SECURITY if g['permission']=='SECURITY_ADMIN' else m.CONFIG,
                     grant_revision=9 if g['permission']=='SECURITY_ADMIN' else 7)
            a['grantRenewalPreimages'][g['permission']]={**g,'grant_revision':g['grant_revision']-1,'revoked_at':g['created_at']}
        security=next(g for g in a['temporaryGrants'] if g['permission']=='SECURITY_ADMIN')
        self.prior={**security,'grant_revision':10,'revoked_at':'2026-10-25T10:02:00Z'}
        self.p=m.build(self.normal,self.prior,'2026-10-25T10:02:00Z','2026-10-25T10:02:01Z',a['expiresAt'],'2026-10-25T10:06:01Z')
    def test_same_window_single_grant_and_exact_close_payloads(self):
        m.validate(self.p)
        self.assertEqual(self.p['providerControl']['activationCommands'],[])
        self.assertEqual(self.p['adminControl']['temporaryGrants'][0]['grant_revision'],11)
        self.assertEqual([x['command']['expected_version'] for x in self.p['providerControl']['closeCommands']],[5,5,16,16])
        self.assertEqual(self.p['operatorPlanSHA256'],sha(canonical({k:v for k,v in self.p.items() if k!='operatorPlanSHA256'})))
        for x,y in zip(self.p['providerControl']['closeCommands'],self.normal['providerControl']['closeCommands']):self.assertNotEqual(x['command']['request_id'],y['command']['request_id'])
    def test_pg_offset_expiry_matches_same_instant_but_preserves_raw_preimage(self):
        prior={**self.prior,'expires_at':self.prior['expires_at'].replace('Z','+00:00')}
        p=m.build(self.normal,prior,'2026-10-25T10:02:00Z',self.p['startsAt'],self.p['adminControl']['expiresAt'],self.p['closeAt'])
        self.assertEqual(p['closedSecurityPreimage']['expires_at'],prior['expires_at'])
        self.assertIn(prior['expires_at'],m.setup_sql(p))
        prior['expires_at']='2026-10-25T10:15:01+00:00'
        with self.assertRaises(ValueError):m.build(self.normal,prior,'2026-10-25T10:02:00Z',self.p['startsAt'],self.p['adminControl']['expiresAt'],self.p['closeAt'])

    def test_separate_window_after_old_expiry_only(self):
        p=m.build(self.normal,self.prior,'2026-10-25T10:16:00Z','2026-10-25T10:16:01Z','2026-10-25T10:31:01Z','2026-10-25T10:27:01Z',True)
        m.validate(p)
        for start,end,close in [('2026-10-25T10:02:01Z','2026-10-25T10:16:01Z','2026-10-25T10:12:01Z'),('2026-10-25T10:16:01Z','2026-10-25T10:31:02Z','2026-10-25T10:27:01Z')]:
            with self.assertRaises(ValueError):m.build(self.normal,self.prior,'2026-10-25T10:02:00Z',start,end,close,True)
    def test_scope_permission_cas_identity_expiry_and_hash_negatives(self):
        changes=[lambda p:p.update(actorId='wrong'),lambda p:p.update(approvedResumeGateSHA256='0'*64),
          lambda p:p['normalResumePlan']['recoveryPreimages']['scope'].update(revision=2),
          lambda p:p['closedSecurityPreimage'].update(grant_revision=8),lambda p:p['closedSecurityPreimage'].update(expires_at='2026-10-25T10:00:00Z'),
          lambda p:p['closedSecurityPreimage'].update(created_by='other'),lambda p:p['closedSecurityPreimage'].update(revoked_at=None),
          lambda p:p['adminControl']['temporaryGrants'][0].update(permission='CONFIG_ADMIN'),
          lambda p:p['providerControl']['activationCommands'].append({}),lambda p:p['providerControl']['closeCommands'][0]['command']['row'].update(revoked=False),
          lambda p:p['providerControl']['closeCommands'][0]['command'].update(request_sha256='0'*64),
          lambda p:p['providerControl']['closeCommands'][0]['context'].update(expires_at='2026-10-25T10:00:00Z'),
          lambda p:p.update(closeAt=p['adminControl']['expiresAt'])]
        for change in changes:
            p=copy.deepcopy(self.p);p.pop('operatorPlanSHA256');change(p)
            with self.subTest(change=change),self.assertRaises((ValueError,KeyError)):m.validate(p)
    def test_sql_only_renews_existing_security_with_full_preimage_guards(self):
        sql=m.setup_sql(self.p)
        for token in ['current_user<>\'postgres\'','FOR UPDATE','grant_revision=11','grant_revision=8','RESCUE_CLOSED_ROLE_POLICY_REQUIRED','pg_stat_activity','SET LOCAL statement_timeout','ALTER ROLE '+m.ADMIN+' LOGIN']:self.assertIn(token,sql)
        for token in ['INSERT ','DELETE ','PASSWORD','GRANT ','CREATE TABLE','ALTER POLICY','ALTER ROLE otr_trip_source_command_gateway','ALTER ROLE otr_external_integration_call_gateway','UPDATE public.trip_sustained_dev_policy']:self.assertNotIn(token,sql)
        close=m.close_sql(self.p);self.assertIn('grant_revision=grant_revision+1',close);self.assertIn('grant_revision=11',close)
        self.assertIn('grant_revision=12',m.closed_sql(self.p))
        self.assertNotIn(m.CONFIG,close)
    def test_missing_projection_seal_is_optional_until_transport_binding_but_drift_rejected(self):
        p=copy.deepcopy(self.p);p['operatorPlanSHA256']='0'*64
        with self.assertRaises(ValueError):m.validate(p)
    def test_active_security_exact_readback_and_negative_boundaries(self):
        grants=copy.deepcopy(self.p['adminControl']['temporaryGrants'])
        config=next(g for g in self.normal['adminControl']['temporaryGrants'] if g['permission']=='CONFIG_ADMIN')
        grants.append({**config,'grant_revision':8,'revoked_at':'2026-10-25T10:02:00Z'})
        state={'policy':{'actor_account_id':m.ACTOR,'enabled':False,'universal_import_enabled':False,'revoked_at':'2026-10-25T10:02:00Z'},'grants':grants,'sessions':0,
          'roles':[{'name':name,'login':name==m.ADMIN,'limit':1,'unsafe':False,'validUntil':self.p['adminControl']['expiresAt'].replace('Z','+00:00')} for name in [m.ADMIN,'otr_trip_source_command_gateway','otr_external_integration_call_gateway']]}
        for g in state['grants']:
            g['expires_at']=g['expires_at'].replace('Z','+00:00');g['created_at']=g['created_at'].replace('Z','+00:00')
        self.assertTrue(m.active_security(self.p,state))
        changes=[lambda v:v['grants'][0].update(expires_at='2026-10-25T10:15:01Z'),lambda v:v['grants'][0].update(actor_id='other'),lambda v:v['grants'][0].update(grant_revision=9),
          lambda v:v['grants'][1].update(revoked_at=None),lambda v:v['grants'][1].update(grant_revision=6),lambda v:v.update(sessions=1),lambda v:v.update(sessions=False),
          lambda v:v['policy'].update(universal_import_enabled=True),lambda v:v['policy'].update(enabled=True),lambda v:v['policy'].update(actor_account_id='other'),
          lambda v:v['roles'][0].update(validUntil='infinity'),lambda v:v['roles'][0].update(unsafe=True),lambda v:v['roles'][1].update(login=True),lambda v:v['roles'][1].update(limit=-1)]
        for change in changes:
            value=copy.deepcopy(state);change(value)
            with self.subTest(change=change):
                try:valid=m.active_security(self.p,value)
                except ValueError:valid=False
                self.assertFalse(valid)

    def test_fresh_ids_cannot_reuse_normal_or_other_cleanup_ids(self):
        old=self.normal['providerControl']['closeCommands'][0]['command']['request_id']
        with self.assertRaises(ValueError):m.build(self.normal,self.prior,'2026-10-25T10:02:00Z',self.p['startsAt'],self.p['adminControl']['expiresAt'],self.p['closeAt'],identity=lambda:old)

if __name__=='__main__':unittest.main()
