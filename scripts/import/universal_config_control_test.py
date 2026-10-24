import copy,datetime as dt,hashlib,unittest,uuid,json,os,tempfile,time,threading,socket
from pathlib import Path
from unittest.mock import Mock,patch
from universal_close_test import plan,rehash
from universal_scope_close import canonical,close_once,validate
from universal_config_control import validate_admin,activate_once,restore_once,command_sql,revoke_sql,AdminSqlTransport,context_scope_hash,trusted_tunnel_argv,validate_tunnel
import universal_watchdog as watchdog

def fixture():
    p=plan();actor=p['sourceScope']['actor_id'];integration=p['providerScope']['integration_id']
    inner=(dt.datetime.fromisoformat(p['startsAt'].replace('Z','+00:00'))+dt.timedelta(seconds=300)).isoformat().replace('+00:00','Z')
    p['expiresAt']=inner;p['sourceScope']['expires_at']=inner;p['providerScope']['expires_at']=inner
    outer=(dt.datetime.fromisoformat(p['expiresAt'].replace('Z','+00:00'))+dt.timedelta(seconds=300)).isoformat().replace('+00:00','Z')
    a={'connection':{'psql':'/isolated/psql','psqlSHA256':'b'*64,'serviceFile':'/isolated/service.conf','serviceFileSHA256':'c'*64,'serviceName':'universal_admin'},'version':1,'actorId':actor,'integrationId':integration,'startsAt':p['startsAt'],'expiresAt':outer,'verifiedAuthorityReceiptSHA256':'f'*64,'role':{'name':'otr_external_integration_admin_gateway','priorCanLogin':False,'expiresAt':outer},'environmentBaseline':{'config_version':1,'kill_switch':True},'integrationBaseline':None,'temporaryGrants':[],'activation':[],'restore':[]}
    for permission in ['CONFIG_ADMIN','SECURITY_ADMIN']:a['temporaryGrants'].append({'admin_grant_id':str(uuid.uuid4()),'actor_id':actor,'environment':'DEV','permission':permission,'grant_revision':1,'expires_at':outer,'revoked_at':None,'created_at':p['startsAt'],'created_by':actor})
    def add(kind,expected,target,row=None,kill=None):
        c={'version':1,'environment':'DEV','request_id':str(uuid.uuid4()),'actor_id':actor,'integration_id':target,'expected_version':expected,'audit_id':str(uuid.uuid4()),'reason_code':'ISOLATED_SYNTHETIC_ONLY'}
        if row is not None:c['row']=row
        if kill is not None:c['kill_switch']=kill
        c['request_sha256']=hashlib.sha256(canonical({'domain':'otr-cp14-command-v1','command':c})).hexdigest()
        v={'version':1,'principal_kind':'OTR_ADMIN','verified_actor_id':actor,'verified_client_identity':None,'verified_external_subject':None,'verified_account_id':actor,'verified_environment':'DEV','auth_source':'isolated-fixture','auth_config_version':1,'auth_session_reference':None,'verified_at':p['startsAt'],'expires_at':outer,'revoked':False,'request_id':c['request_id'],'request_sha256':c['request_sha256'],'command_kind':kind,'gateway_identity':'otr_external_integration_admin_gateway'}
        return {'kind':kind,'command':c,'context':v}
    a['activation']=[add('external_integration_configure',None,integration,{'integration_id':integration,'environment':'DEV','category':'INTELLIGENCE_OUTBOUND','kill_switch':True,'enabled':True,'config_version':1}),add('intelligence_provider_config_append',None,integration,{'integration_id':integration,'provider_config_id':p['providerScope']['provider_config_id'],'schema_contracts':[{'id':'universal-import','version':1,'dialect':'otr'}],'privacy_policy':'REMOTE_ALLOWED','schema_output':True}),add('external_integration_price_append',None,integration,{'integration_id':integration,'price_schedule_id':p['providerScope']['price_schedule_id']}),add('external_integration_set_kill',1,integration,kill=False),add('external_integration_set_kill',1,None,kill=False)]
    a['restore']=[add('external_integration_set_kill',2,None,kill=True),add('external_integration_set_kill',2,integration,kill=True)]
    p['adminControl']=a;p['helperHashes']['universal_config_control.py']=hashlib.sha256(Path(__file__).with_name('universal_config_control.py').read_bytes()).hexdigest();return rehash(p)

def observation(p,env=None,integration=None,receipts=None):
    a=p['adminControl'];audits=[]
    for x in receipts or []:
        c=x['command'];audits.append({'command_id':c['request_id'],'admin_actor_id':a['actorId'],'new_version':3,'safe_diff':{'request_sha256':c['request_sha256'],'command_kind':x['kind'],'scope_sha256':context_scope_hash(x['context'])}})
    return [{'observation':{'environment':env or {'config_version':2,'kill_switch':False},'integration':integration or {'config_version':2,'kill_switch':False},'audits':audits}}]

class ConfigTests(unittest.TestCase):
    def test_exact_finite_plan_and_unbound_authority(self):
        p=fixture();validate(p)
        for mutation in [lambda p:p['adminControl'].update(verifiedAuthorityReceiptSHA256=None),lambda p:p['adminControl'].update(integrationBaseline={}),lambda p:p['adminControl']['role'].update(priorCanLogin=True),lambda p:p['adminControl']['temporaryGrants'][0].update(actor_id=str(uuid.uuid4())),lambda p:p['adminControl'].update(expiresAt=p['expiresAt'])]:
            q=copy.deepcopy(p);mutation(q)
            with self.assertRaises((ValueError,TypeError)):validate_admin(q)
    def test_cas_hash_scope_and_tail_guards(self):
        p=fixture()
        for mutation in [lambda p:p['adminControl']['restore'][0]['command'].update(expected_version=9),lambda p:p['adminControl']['activation'][0]['command']['row'].update(kill_switch=False),lambda p:p['adminControl']['activation'][1]['command']['row'].update(schema_contracts=[{'id':'flight','version':1,'dialect':'otr'}])]:
            q=copy.deepcopy(p);mutation(q)
            with self.assertRaises(ValueError):validate_admin(q)
    def test_never_activated_baseline_is_confirmed_read_only(self):
        p=fixture();a=p['adminControl'];base=[{'observation':{'environment':a['environmentBaseline'],'integration':None,'audits':[]}}]
        for readonly in [False,True]:
            sql=Mock(side_effect=[base,[{'closed':True}]])
            self.assertTrue(restore_once(p,sql,recover_only=readonly)['adminClosed'])
            self.assertTrue(all('BEGIN READ ONLY' in c.args[0] for c in sql.call_args_list))
    def test_provisioned_grants_before_configure_are_exactly_revoked(self):
        p=fixture();a=p['adminControl'];base=[{'observation':{'environment':a['environmentBaseline'],'integration':None,'audits':[]}}]
        sql=Mock(side_effect=[base,[{'closed':False}],[],[{'closed':True}]])
        self.assertTrue(restore_once(p,sql)['adminClosed']);self.assertIn('ADMIN_FOREIGN_GRANT',sql.call_args_list[2].args[0])
        admin=Mock();sql=Mock(side_effect=[base,[{'closed':False}],[{'closed':False}]])
        self.assertFalse(restore_once(p,sql,recover_only=True,admin_sql=admin)['adminClosed']);admin.assert_not_called()
        self.assertTrue(all('BEGIN READ ONLY' in c.args[0] for c in sql.call_args_list))
    def test_missing_integration_with_acknowledged_configure_is_not_closed(self):
        p=fixture();a=p['adminControl'];x=a['activation'][0];c=x['command']
        receipt={'command_id':c['request_id'],'admin_actor_id':a['actorId'],'new_version':1,'safe_diff':{'request_sha256':c['request_sha256'],'command_kind':x['kind'],'scope_sha256':context_scope_hash(x['context'])}}
        for integration in [None,{'config_version':1,'kill_switch':True}]:
            audits=[receipt] if integration is None else []
            sql=Mock(return_value=[{'observation':{'environment':a['environmentBaseline'],'integration':integration,'audits':audits}}])
            self.assertFalse(restore_once(p,sql)['adminClosed']);self.assertEqual(sql.call_count,1)
    def test_configured_closed_integration_requires_owning_receipt(self):
        p=fixture();a=p['adminControl'];x=a['activation'][0];c=x['command']
        receipt={'command_id':c['request_id'],'admin_actor_id':a['actorId'],'new_version':1,'safe_diff':{'request_sha256':c['request_sha256'],'command_kind':x['kind'],'scope_sha256':context_scope_hash(x['context'])}}
        sql=Mock(side_effect=[[{'observation':{'environment':a['environmentBaseline'],'integration':{'config_version':1,'kill_switch':True},'audits':[receipt]}}],[],[{'closed':True}]])
        self.assertTrue(restore_once(p,sql)['adminClosed']);self.assertIn('ADMIN_GRANT_DRIFT',sql.call_args_list[1].args[0])
    def test_unknown_restore_reconciles_without_retry_then_revokes(self):
        p=fixture();a=p['adminControl'];env={'config_version':3,'kill_switch':True};both=observation(p,env,{'config_version':3,'kill_switch':True},a['restore'])
        sql=Mock(side_effect=[observation(p),RuntimeError('UNKNOWN'),observation(p,env,receipts=[a['restore'][0]]),[],both,[],[{'closed':True}]])
        r=restore_once(p,sql,admin_sql=sql);self.assertEqual(r['status'],'CLOSED_VERIFIED')
        writes=[c.args[0] for c in sql.call_args_list if 'SELECT public.external_integration_set_kill(' in c.args[0]];self.assertEqual(len(writes),2)
        self.assertIn('external_integration_admin_grants',sql.call_args_list[-2].args[0])
    def test_unknown_without_receipt_stops_before_second_write_or_revocation(self):
        p=fixture();sql=Mock(side_effect=[observation(p),RuntimeError('UNKNOWN'),observation(p)])
        self.assertEqual(restore_once(p,sql,admin_sql=sql)['status'],'RECONCILE_REQUIRED');self.assertEqual(sql.call_count,3)
    def test_drift_and_expiry_never_overwrite(self):
        p=fixture()
        for observed,clock in [(observation(p,{'config_version':4,'kill_switch':False}),None),(observation(p),lambda:10**12)]:
            sql=Mock(return_value=observed);r=restore_once(p,sql,admin_sql=sql,**({'now':clock} if clock else {}));self.assertEqual(r['status'],'RECONCILE_REQUIRED');self.assertEqual(sql.call_count,1)
    def test_inner_expiry_keeps_restore_authority_but_outer_expiry_reconciles(self):
        p=fixture();a=p['adminControl'];env={'config_version':3,'kill_switch':True};both=observation(p,env,{'config_version':3,'kill_switch':True},a['restore'])
        sql=Mock(side_effect=[observation(p),observation(p,env,receipts=[a['restore'][0]]),both,[],[{'closed':True}]]);admin=Mock()
        inner=watchdog.instant(p['expiresAt']);self.assertEqual(restore_once(p,sql,admin_sql=admin,now=lambda:inner+1)['status'],'CLOSED_VERIFIED');self.assertEqual(admin.call_count,2)
        sql=Mock(return_value=observation(p));admin=Mock();outer=watchdog.instant(a['expiresAt'])
        self.assertEqual(restore_once(p,sql,admin_sql=admin,now=lambda:outer+1)['status'],'RECONCILE_REQUIRED');admin.assert_not_called();self.assertEqual(sql.call_count,1)
    def test_read_only_recovery_no_commands(self):
        p=fixture();a=p['adminControl'];sql=Mock(side_effect=[observation(p,{'config_version':3,'kill_switch':True},{'config_version':3,'kill_switch':True},a['restore']),[{'closed':True}]])
        self.assertTrue(restore_once(p,sql,recover_only=True)['adminClosed'])
        self.assertTrue(all('BEGIN READ ONLY' in c.args[0] for c in sql.call_args_list))
    def test_source_first_admin_then_runtime_and_failure_blocks_runtime(self):
        p=fixture();a=p['adminControl'];sql=Mock(side_effect=[[],[{'closed':True}],observation(p,{'config_version':3,'kill_switch':True},{'config_version':3,'kill_switch':True},a['restore']),[],[{'closed':True}]])
        runtime=Mock(return_value={'verified':True,'windowId':p['windowId']});self.assertEqual(close_once(p,sql,runtime)['status'],'CLOSED_VERIFIED');runtime.assert_called_once()
        self.assertIn('trip_source_universal_scope',sql.call_args_list[0].args[0]);self.assertIn('ADMIN_GRANT_DRIFT',sql.call_args_list[3].args[0])
        sql=Mock(side_effect=[[],[{'closed':True}],observation(p,{'config_version':9,'kill_switch':False})]);runtime=Mock();self.assertEqual(close_once(p,sql,runtime)['status'],'RECONCILE_REQUIRED');runtime.assert_not_called()
    def test_owning_command_only_and_exact_revoke(self):
        p=fixture();q=command_sql(p['adminControl']['restore'][0]);self.assertIn('public.external_integration_set_kill',q);self.assertNotIn('UPDATE public.external_integration_environment_state',q)
        q=revoke_sql(p['adminControl']);self.assertIn('ADMIN_GRANT_DRIFT',q);self.assertIn('ADMIN_ROLE_DRIFT',q);self.assertNotIn('INSERT',q);self.assertNotIn('DELETE',q)
    def test_activation_rejects_unqualified_actual_authority_before_any_command(self):
        p=fixture();sql=Mock(return_value=[{'ready':False}]);admin=Mock()
        with self.assertRaisesRegex(ValueError,'EXACT_FINITE_ADMIN_AUTHORITY_UNAVAILABLE'):activate_once(p,sql,admin_sql=admin)
        admin.assert_not_called();self.assertEqual(sql.call_count,1);self.assertIn('pg_stat_activity',sql.call_args.args[0]);self.assertIn('count(*)=2',sql.call_args.args[0])
    def test_missing_admin_transport_cannot_use_management_impersonation(self):
        p=fixture();sql=Mock(return_value=observation(p))
        self.assertEqual(restore_once(p,sql)['status'],'RECONCILE_REQUIRED');self.assertEqual(sql.call_count,1)
    def test_sealed_login_transport_secret_not_in_argv_and_changed_input_denied(self):
        p=fixture()
        with tempfile.TemporaryDirectory() as d:
            root=Path(d).resolve();os.chmod(root,0o700);binary=root/'psql';binary.write_text('fixture-only-executable');binary.chmod(0o700)
            service=root/'service.conf';service.write_text('[qa_admin]\nhost=db.tuqigdxrvrerfewsxqgm.supabase.co\nuser=otr_external_integration_admin_gateway\ndbname=postgres\nsslmode=verify-full\nsslrootcert=system\nconnect_timeout=8\npassword=ISOLATED_ONLY\n');service.chmod(0o600)
            p['adminControl']['connection']={'psql':str(binary),'psqlSHA256':hashlib.sha256(binary.read_bytes()).hexdigest(),'serviceFile':str(service),'serviceFileSHA256':hashlib.sha256(service.read_bytes()).hexdigest(),'serviceName':'qa_admin'}
            transport=AdminSqlTransport(p)
            with patch('universal_config_control.subprocess.run',return_value=Mock(returncode=0,stdout='{}')) as run:
                transport(command_sql(p['adminControl']['restore'][0]));self.assertNotIn('ISOLATED_ONLY',str(run.call_args));self.assertEqual(run.call_args.kwargs['env']['PGSERVICEFILE'],str(service))
            service.write_text(service.read_text().replace('ISOLATED_ONLY','CHANGED'))
            with self.assertRaises(ValueError):transport('SELECT 1')
    def test_tunnel_launch_proposal_does_not_require_invented_process_identity(self):
        route={'remoteUser':'root','remoteHost':'178.105.151.143','targetHost':'db.tuqigdxrvrerfewsxqgm.supabase.co','targetPort':5432,'localPort':15432,'sshBinary':'/usr/bin/ssh','controlSocket':'/private/tmp/qa-control/socket'}
        args=trusted_tunnel_argv(route);self.assertIn('127.0.0.1:15432:db.tuqigdxrvrerfewsxqgm.supabase.co:5432',args);self.assertIn('-oStrictHostKeyChecking=yes',args)
        with self.assertRaises((ValueError,KeyError)):validate_tunnel(route)
    def test_strict_trusted_tunnel_keeps_logical_tls_origin_and_rechecks_master(self):
        p=fixture()
        with tempfile.TemporaryDirectory() as d:
            root=Path(d).resolve();os.chmod(root,0o700)
            binary=root/'psql';binary.write_text('fixture psql');binary.chmod(0o700)
            ssh=root/'ssh';ssh.write_text('fixture ssh');ssh.chmod(0o700)
            ca=root/'ca.pem';ca.write_bytes((Path(__file__).parents[1]/'trip/c-execution/supabase-prod-ca-2021.crt').read_bytes());ca.chmod(0o644)
            control=root/'socket';server=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);server.bind(str(control));control.chmod(0o600)
            try:
                snapshot='Sun Oct 25 01:00:00 2026 ssh: private-master [mux]'
                t={'pid':12345,'processStartedAt':'Sun Oct 25 01:00:00 2026','processCommandSHA256':hashlib.sha256(snapshot.encode()).hexdigest(),'launchReceiptFile':str(root/'launch.json'),'launchReceiptSHA256':'a'*64,'sshBinary':str(ssh),'sshBinarySHA256':hashlib.sha256(ssh.read_bytes()).hexdigest(),'controlSocket':str(control),'localPort':15432,'remoteUser':'root','remoteHost':'178.105.151.143','targetHost':'db.tuqigdxrvrerfewsxqgm.supabase.co','targetPort':5432,'caFile':str(ca),'caFileSHA256':hashlib.sha256(ca.read_bytes()).hexdigest()}
                launch={'version':1,'pid':t['pid'],'processStartedAt':t['processStartedAt'],'processCommandSHA256':t['processCommandSHA256'],'argv':trusted_tunnel_argv(t)}
                Path(t['launchReceiptFile']).write_text(json.dumps(launch));Path(t['launchReceiptFile']).chmod(0o600);t['launchReceiptSHA256']=hashlib.sha256(Path(t['launchReceiptFile']).read_bytes()).hexdigest()
                service=root/'service.conf';service.write_text('[qa_admin]\nhost=db.tuqigdxrvrerfewsxqgm.supabase.co\nhostaddr=127.0.0.1\nport=15432\nuser=otr_external_integration_admin_gateway\ndbname=postgres\nsslmode=verify-full\nsslrootcert='+str(ca)+'\nconnect_timeout=8\npassword=ISOLATED_ONLY\n');service.chmod(0o600)
                p['adminControl']['connection']={'psql':str(binary),'psqlSHA256':hashlib.sha256(binary.read_bytes()).hexdigest(),'serviceFile':str(service),'serviceFileSHA256':hashlib.sha256(service.read_bytes()).hexdigest(),'serviceName':'qa_admin','sshTunnel':t}
                def run(args,**kwargs):
                    if args[0]=='/bin/ps':return Mock(returncode=0,stdout=snapshot+'\n')
                    if '-O' in args:return Mock(returncode=0,stdout='',stderr='Master running (pid=12345)')
                    return Mock(returncode=0,stdout='{}')
                with patch('universal_config_control.subprocess.run',side_effect=run) as mocked:
                    transport=AdminSqlTransport(p);transport('SELECT 1');self.assertEqual(mocked.call_count,5);self.assertIn('verify-full',service.read_text());self.assertNotIn('ISOLATED_ONLY',str(mocked.call_args))
                with patch('universal_config_control.subprocess.run',return_value=Mock(returncode=0,stdout='foreign pid')) as mocked:
                    with self.assertRaisesRegex(ValueError,'TUNNEL_PROCESS_CHANGED'):transport('SELECT 1')
                    self.assertEqual(mocked.call_count,1)
                with patch('universal_config_control.subprocess.run',side_effect=lambda args,**kwargs:Mock(returncode=0,stdout=snapshot+'\n',stderr='') if args[0]=='/bin/ps' else Mock(returncode=0,stdout='',stderr='Master running (pid=123456)')) as mocked:
                    with self.assertRaisesRegex(ValueError,'TUNNEL_MASTER_UNCONFIRMED'):transport('SELECT 1')
                    self.assertEqual(mocked.call_count,2)
                t['remoteHost']='production.invalid'
                with self.assertRaises(ValueError):validate_tunnel(t)
            finally:server.close()
    def test_activation_needs_live_independent_watch_and_claims_once(self):
        p=fixture();digest='a'*64
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);os.chmod(root,0o700)
            with self.assertRaises(OSError):watchdog.activate_config(p,root,digest,Mock(),Mock())
            watchdog.write(root/'heartbeat.json',{'planSHA256':digest,'pid':os.getpid(),'observedAt':time.time()})
            watchdog.write(root/'watch-claimed.json',{'planSHA256':digest,'pid':os.getpid()})
            with patch('universal_config_control.activate_once',return_value={'status':'FINITE_CONFIG_ACTIVE'}) as activate:
                self.assertEqual(watchdog.activate_config(p,root,digest,Mock(),Mock())['status'],'FINITE_CONFIG_ACTIVE')
                with self.assertRaises(FileExistsError):watchdog.activate_config(p,root,digest,Mock(),Mock())
                activate.assert_called_once()
    def test_activation_inflight_then_close_waits_for_same_control_lock(self):
        p=fixture();digest='a'*64
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);os.chmod(root,0o700);entered=threading.Event();release=threading.Event();closed=threading.Event()
            watchdog.write(root/'heartbeat.json',{'planSHA256':digest,'pid':os.getpid(),'observedAt':time.time()});watchdog.write(root/'watch-claimed.json',{'planSHA256':digest,'pid':os.getpid()})
            def activation(*args,**kwargs):entered.set();self.assertTrue(release.wait(3));return {'status':'FINITE_CONFIG_ACTIVE'}
            with patch('universal_config_control.activate_once',side_effect=activation):
                a=threading.Thread(target=lambda:watchdog.activate_config(p,root,digest,Mock(),Mock()));a.start();self.assertTrue(entered.wait(3))
                c=threading.Thread(target=lambda:watchdog.execute_once(p,root,digest,lambda *args:(closed.set() or {'status':'CLOSED_VERIFIED','windowId':p['windowId']})));c.start();self.assertFalse(closed.wait(.05));release.set();a.join(3);c.join(3);self.assertTrue(closed.is_set());self.assertFalse(a.is_alive() or c.is_alive())
    def test_close_inflight_then_activation_cannot_reopen(self):
        p=fixture();digest='a'*64
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);os.chmod(root,0o700);entered=threading.Event();release=threading.Event();denied=[]
            watchdog.write(root/'heartbeat.json',{'planSHA256':digest,'pid':os.getpid(),'observedAt':time.time()});watchdog.write(root/'watch-claimed.json',{'planSHA256':digest,'pid':os.getpid()})
            def close(*args):entered.set();self.assertTrue(release.wait(3));return {'status':'CLOSED_VERIFIED','windowId':p['windowId']}
            c=threading.Thread(target=lambda:watchdog.execute_once(p,root,digest,close));c.start();self.assertTrue(entered.wait(3))
            def activate():
                try:watchdog.activate_config(p,root,digest,Mock(),Mock())
                except ValueError:denied.append(True)
            with patch('universal_config_control.activate_once') as called:
                a=threading.Thread(target=activate);a.start();release.set();a.join(3);c.join(3);called.assert_not_called();self.assertEqual(denied,[True])
    def test_activation_failure_requests_independent_closure(self):
        p=fixture();digest='a'*64
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);os.chmod(root,0o700)
            watchdog.write(root/'heartbeat.json',{'planSHA256':digest,'pid':os.getpid(),'observedAt':time.time()})
            watchdog.write(root/'watch-claimed.json',{'planSHA256':digest,'pid':os.getpid()})
            with patch('universal_config_control.activate_once',side_effect=RuntimeError('UNKNOWN')):
                self.assertEqual(watchdog.activate_config(p,root,digest,Mock(),Mock())['status'],'RECONCILE_REQUIRED');self.assertTrue((root/'close-requested').exists())
    def test_activation_owner_and_window_required_without_effect(self):
        p=fixture();sql=Mock();p['ownerAuthorized']=False
        with self.assertRaises(ValueError):activate_once(p,sql)
        sql.assert_not_called();p['ownerAuthorized']=True
        with self.assertRaises(ValueError):activate_once(p,sql,now=lambda:10**12)
        sql.assert_not_called()

if __name__=='__main__':unittest.main()
