"""Isolated cleanup control regression; no DEV/permission/rollback PASS claim."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
import universal_cleanup_only as m
from universal_config_control import context_scope_hash

ROOT=Path(__file__).resolve().parents[2]

class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.run=Path(self.tmp.name);self.run.chmod(0o700)
        b=json.loads((ROOT/'scripts/import/__fixtures__/universal_cleanup_run7.json').read_text())
        safe=json.loads((ROOT/'docs/ops/universal-stage2-20261025/actual-execution/continuous-recovery/RUN7_SAFETY_READONLY.json').read_text())
        security=next(g for g in safe['grants'] if g['permission']=='SECURITY_ADMIN')
        self.p=m.build(b,security,'2026-10-26T17:00:00Z','2026-10-26T17:00:01Z','2026-10-26T17:15:01Z','2026-10-26T17:08:01Z')
        self.o={'grantState':'ACTIVE','scopeState':'ACTIVE','integration':{'config_version':14,'kill_switch':False},'environment':{'config_version':14,'kill_switch':False,'runtime_enabled':False},'audits':[]}
        self.calls=[];self.revoked=False
        def send(i):
            self.calls.append(i);cmd=self.p['providerControl']['closeCommands'][i]
            c=cmd['command']
            if i<2:self.o['grantState' if i==0 else 'scopeState']='CLOSED'
            else:self.o['integration' if i==2 else 'environment'].update(config_version=15,kill_switch=True)
            self.o['audits'].append({'new_version':c['expected_version']+1,'command_id':c['request_id'],'admin_actor_id':m.ACTOR,'safe_diff':{'scope_sha256':context_scope_hash(cmd['context']),'request_sha256':c['request_sha256'],'command_kind':cmd['kind']}})
        def revoke():self.revoked=True;self.calls.append('revoke')
        self.ports={'observe':lambda:copy.deepcopy(self.o),'claimed':lambda _:False,'invoke':send,
            'revoke_admin':revoke,'roles_closed':lambda:self.revoked,'restore':lambda:self.calls.append('restore'),'verify_restored':lambda:True}
        self.clock=lambda:m.instant(self.p['startsAt'])+1

    def test_exact_close_only_plan_and_read_query(self):
        m.validate(self.p)
        self.assertEqual(self.p['providerControl']['activationCommands'],[])
        self.assertEqual([g['permission'] for g in self.p['adminControl']['temporaryGrants']],['SECURITY_ADMIN'])
        query=m.observation_sql(self.p)
        self.assertIn('BEGIN READ ONLY',query)
        self.assertNotIn('UPDATE ',query)
        self.assertNotIn('INSERT ',m.setup_sql(self.p))
        self.assertNotIn('PASSWORD ',m.setup_sql(self.p))
        self.assertNotIn('ALTER ROLE otr_trip_source_command_gateway',m.setup_sql(self.p))
        self.assertIn('grant_revision=7',m.setup_sql(self.p))

    def test_rejects_scope_payload_permission_expiry_and_baseline_drift(self):
        changes=[lambda p:p['providerControl']['activationCommands'].append({}),
            lambda p:p['providerControl']['closeCommands'][0]['command']['row'].update(revoked=False),
            lambda p:p['providerControl']['closeCommands'][2]['command'].update(kill_switch=False),
            lambda p:p['adminControl']['temporaryGrants'][0].update(permission='CONFIG_ADMIN'),
            lambda p:p['adminControl'].update(expiresAt='2026-10-26T17:15:02Z'),
            lambda p:p.update(closeAt='2026-10-26T17:11:02Z'),
            lambda p:p['baseline']['runtime'].update(imageId='other')]
        for change in changes:
            p=copy.deepcopy(self.p);change(p)
            with self.assertRaises(ValueError):m.validate(p)

    def test_owning_closure_and_role_checks_precede_restore(self):
        r=m.close_once(self.p,self.run,self.ports,self.clock)
        self.assertEqual(r['status'],'CLOSED_VERIFIED')
        self.assertEqual(self.calls,[0,1,2,3,'revoke','restore'])

    def test_unknown_ack_with_real_readback_is_not_repeated(self):
        send=self.ports['invoke']
        def unknown(i):send(i);raise TimeoutError('PRIVATE_VALUE')
        self.ports['invoke']=unknown
        r=m.close_once(self.p,self.run,self.ports,self.clock)
        self.assertEqual(r['status'],'CLOSED_VERIFIED')
        self.assertEqual(self.calls.count(0),1)
        self.assertTrue(all(x['disposition']=='UNKNOWN' for x in r['steps']))
        self.assertNotIn('PRIVATE',json.dumps(r))

    def test_missing_receipt_never_retries_or_restores(self):
        self.ports['invoke']=lambda i:self.calls.append(i)
        r=m.close_once(self.p,self.run,self.ports,self.clock)
        self.assertEqual(r['status'],'RECONCILE_REQUIRED')
        self.assertEqual(self.calls,[0,'revoke'])

    def test_remote_claim_without_receipt_stops_before_send(self):
        self.ports['claimed']=lambda _:True
        r=m.close_once(self.p,self.run,self.ports,self.clock)
        self.assertEqual(r['status'],'RECONCILE_REQUIRED')
        self.assertEqual(self.calls,['revoke'])

    def test_closed_admin_or_catalog_drift_forbids_restore(self):
        self.ports['roles_closed']=lambda:False
        r=m.close_once(self.p,self.run,self.ports,self.clock)
        self.assertEqual(r['status'],'RECONCILE_REQUIRED')
        self.assertNotIn('restore',self.calls)

    def test_late_window_revokes_without_close_dispatch(self):
        r=m.close_once(self.p,self.run,self.ports,lambda:m.instant(self.p['adminControl']['expiresAt'])-1)
        self.assertEqual(r['status'],'RECONCILE_REQUIRED')
        self.assertEqual(self.calls,['revoke'])

    def test_independently_receipted_rows_are_not_sent_again(self):
        for i in range(4):self.ports['invoke'](i)
        self.calls=[]
        r=m.close_once(self.p,self.run,self.ports,self.clock)
        self.assertEqual(r['status'],'CLOSED_VERIFIED')
        self.assertEqual(self.calls,['revoke','restore'])

    def test_permission_ack_requires_exact_live_security_and_closed_other_roles(self):
        safe=json.loads((ROOT/'docs/ops/universal-stage2-20261025/actual-execution/continuous-recovery/RUN7_SAFETY_READONLY.json').read_text())
        grants=[copy.deepcopy(g) for g in safe['grants'] if g['permission']=='CONFIG_ADMIN']+[copy.deepcopy(self.p['adminControl']['temporaryGrants'][0])]
        grants[1]['expires_at']=grants[1]['expires_at'].replace('Z','+00:00')
        state={'policy':{'enabled':False,'universal_import_enabled':False},'sessions':0,'grants':grants,
               'roles':[{'name':r,'login':r==m.ADMIN,'unsafe':False,'limit':1,'validUntil':self.p['adminControl']['expiresAt'].replace('Z','+00:00')} for r in ['otr_trip_source_command_gateway','otr_external_integration_call_gateway',m.ADMIN]]}
        self.assertTrue(m.active_security(state,self.p))
        for mutate in [lambda s:s['roles'][0].update(login=True),lambda s:s['grants'][0].update(revoked_at=None),lambda s:s.update(sessions=False),lambda s:s['roles'][2].update(validUntil='2026-10-26T18:00:01Z')]:
            changed=copy.deepcopy(state);mutate(changed);self.assertFalse(m.active_security(changed,self.p))

    def test_new_cleanup_audits_do_not_require_old_run7_receipt_ids_for_metadata(self):
        from unittest.mock import patch
        import universal_cleanup_only_execution as e
        from universal_continuous_sql_ports import DEPENDENCY
        b=self.p['baseline']
        data={'unsafe':False,'functionHashes':{**b['installedFunctionHashes'],DEPENDENCY:b['functionPreimages'][DEPENDENCY]},
              'catalog':b['catalogBaseline'],'sourceMeterLogins':dict.fromkeys(b['sourceMeterBaseline'],False),
              'sourceMeterSessions':dict.fromkeys(b['sourceMeterBaseline'],0)}
        def sql(query):
            self.assertNotIn(' AS observation',query)
            self.assertNotIn('external_integration_config_audit',query)
            return {'rows':[{'metadata':copy.deepcopy(data)}]}
        p={**self.p,'operatorPlanSHA256':m.sha(m.canonical(self.p))}
        with patch.object(e,'SqlTransport',return_value=sql):
            ports=e.ports(p,self.run)
            self.assertTrue(ports['unchanged']())
            data['catalog']={**b['catalogBaseline'],'credentialSHA256':'0'*64}
            self.assertFalse(ports['unchanged']())

    def test_execution_requires_sealed_operator_projection(self):
        with self.assertRaises(ValueError):m.validate(self.p,execution=True)
        p={**self.p,'operatorPlanSHA256':m.sha(m.canonical(self.p))}
        m.validate(p,execution=True)
        p['operatorPlanSHA256']='0'*64
        with self.assertRaises(ValueError):m.validate(p,execution=True)

    def test_unknown_restore_is_read_back_and_never_resent(self):
        def restore():self.calls.append('restore');raise TimeoutError('PRIVATE_RUNTIME')
        self.ports['restore']=restore
        r=m.close_once(self.p,self.run,self.ports,self.clock)
        self.assertEqual(r['status'],'CLOSED_VERIFIED')
        self.assertEqual(r['restoreDisposition'],'UNKNOWN')
        self.assertEqual(self.calls.count('restore'),1)

    def test_prior_restore_claim_forces_readback_only(self):
        m.write_private(self.run/'restore-claimed.json',{'planSHA256':m.sha(m.canonical(self.p))})
        self.ports['verify_restored']=lambda:False
        r=m.close_once(self.p,self.run,self.ports,self.clock)
        self.assertEqual(r['status'],'RECONCILE_REQUIRED')
        self.assertNotIn('restore',self.calls)

    def test_watchdog_waits_for_foreground_lock_then_takes_over(self):
        from unittest.mock import patch
        import universal_cleanup_only_execution as e
        now=[m.instant(self.p['closeAt'])]
        with patch.object(e,'operate',side_effect=[{'status':'ANOTHER_CLOSER_OWNS_EXECUTION'},{'status':'CLOSED_VERIFIED'}]) as call:
            r=e.watch(self.p,self.run,self.ports,clock=lambda:now[0],pause=lambda n:now.__setitem__(0,now[0]+n))
        self.assertEqual(r['status'],'CLOSED_VERIFIED')
        self.assertEqual(call.call_count,2)

    def test_stuck_foreground_lock_still_revokes_admin_before_expiry(self):
        from unittest.mock import patch
        import universal_cleanup_only_execution as e
        now=[m.instant(self.p['adminControl']['expiresAt'])-121]
        with patch.object(e,'operate',return_value={'status':'ANOTHER_CLOSER_OWNS_EXECUTION'}):
            r=e.watch(self.p,self.run,self.ports,clock=lambda:now[0],pause=lambda n:now.__setitem__(0,now[0]+n))
        self.assertEqual(r['status'],'RECONCILE_REQUIRED')
        self.assertTrue(r['adminClosed'])
        self.assertEqual(self.calls,['revoke'])

    def test_actual_file_lock_blocks_other_closer_and_releases_on_exit(self):
        import fcntl
        import universal_cleanup_only_execution as e
        with open(self.run/'cleanup.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            self.assertEqual(e.operate(self.p,self.run,self.ports)['status'],'ANOTHER_CLOSER_OWNS_EXECUTION')
        from unittest.mock import patch
        with patch.object(e.c,'close_once',return_value={'status':'CLOSED_VERIFIED'}) as close:
            self.assertEqual(e.operate(self.p,self.run,self.ports)['status'],'CLOSED_VERIFIED')
        close.assert_called_once()

if __name__=='__main__':unittest.main()
