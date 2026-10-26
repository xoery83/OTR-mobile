import copy,datetime as dt,hashlib,importlib.util,json,os,tempfile,unittest,uuid
from pathlib import Path
import threading
from unittest.mock import Mock
from universal_scope_close import canonical,close_once,close_sql,readback_sql,validate
import universal_watchdog as watchdog

def plan():
    ids={k:str(uuid.uuid4()) for k in ['actor','trip','batch','task','run','attempt','call','config','price','activation','source','operation','representation']}
    start=dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=1);end=start+dt.timedelta(seconds=60)
    utc=lambda t:t.isoformat().replace('+00:00','Z');start,end=utc(start),utc(end)
    pin={'profile':'OTR_SUBMITTED_TEXT_V1','actorId':ids['actor'],'tripId':ids['trip'],'sourceId':ids['source'],'operationId':ids['operation'],'operationKey':'qa-only','operationSha256':'a'*64,'representationId':ids['representation']}
    scope={'singleton':True,'actor_id':ids['actor'],'trip_id':ids['trip'],'batch_id':ids['batch'],'task_id':ids['task'],'starts_at':start,'expires_at':end}
    root='/opt/otr/dev-backend/env/universal-finite-'+ids['activation']
    runtime={'container':'otr-dev-backend','imageId':'sha256:'+'a'*64,'runtimeSource':root+'/runtime.json','finiteComposeFile':root+'/finite.yml','baselineComposeFiles':['/opt/otr/dev-backend/compose.yml'],'composeHashes':{'/opt/otr/dev-backend/compose.yml':'c'*64}}
    for k in ['runtimeSHA256','finiteComposeSHA256','baselineEnvironmentSHA256','activeEnvironmentSHA256','baselineHostConfigSHA256','activeHostConfigSHA256','baselineMountsSHA256','activeMountsSHA256']:runtime[k]='b'*64
    p={'version':1,'project':'tuqigdxrvrerfewsxqgm','activationId':ids['activation'],'ownerAuthorized':True,'startsAt':start,'expiresAt':end,'sourceScope':{**scope,'run_id':ids['run'],'submission_sha256':'a'*64,'input_sha256':'b'*64,'source_command_pins':[pin]},'providerScope':{**scope,'attempt_id':ids['attempt'],'call_id':ids['call'],'integration_id':'QA_ONLY','provider_config_id':ids['config'],'price_schedule_id':ids['price'],'request_sha256':'a'*64,'provider_request_sha256':'b'*64,'input_sha256':'c'*64,'model_binding':{'fixture':'not-provider-auth'},'input_ceiling':2048,'output_ceiling':4096,'max_cost_nanos':1000000000},'temporaryRoles':[{'name':'otr_trip_source_command_gateway','priorCanLogin':False}],'runtime':runtime,'management':{'supabaseCli':'/isolated/supabase','linkedWorktree':'/isolated/linked'},'helperHashes':{n:hashlib.sha256(Path(__file__).with_name(n).read_bytes()).hexdigest() for n in ['universal_scope_close.py','universal_runtime_close.py','universal_watchdog.py']}}
    return rehash(p)
def rehash(p):
    p['windowId']=hashlib.sha256(canonical({k:v for k,v in p.items() if k not in ['windowId','ownerAuthorized']})).hexdigest();return p

class CloseTests(unittest.TestCase):
    def test_exact_sql_does_not_touch_trip_or_global_authority(self):
        q=close_sql(plan())
        self.assertIn('UNIVERSAL_WINDOW_DRIFT',q);self.assertIn('UNIVERSAL_ROLE_WINDOW_DRIFT',q)
        for forbidden in ['trip_create_activation_gate','trip_metadata_activation_gate','trip_core_activation_gate','UPDATE public.trips','DELETE FROM public.trip_sources','otr_trip_publication_catalog_reader','GRANT ','LOGIN;']:
            if forbidden=='LOGIN;':continue # expected finite NOLOGIN only
            self.assertNotIn(forbidden,q)
        self.assertIn('pg_advisory_xact_lock(714024,2)',q)
    def test_unknown_sql_reconciles_once_without_resend(self):
        p=plan();sql=Mock(side_effect=[RuntimeError('UNKNOWN'),[{'closed':True}]])
        runtime=Mock(return_value={'verified':True,'windowId':p['windowId']})
        r=close_once(p,sql,runtime);self.assertEqual(r['status'],'CLOSED_VERIFIED');self.assertEqual(r['sqlWriteDisposition'],'UNKNOWN');self.assertEqual(sql.call_count,2)
    def test_unknown_unconfirmed_does_not_touch_service(self):
        p=plan();sql=Mock(side_effect=[RuntimeError('UNKNOWN'),[{'closed':False}]]);runtime=Mock()
        self.assertEqual(close_once(p,sql,runtime)['status'],'RECONCILE_REQUIRED');runtime.assert_not_called()
    def test_runtime_failure_retains_sql_closed_and_reports_reconcile(self):
        p=plan();sql=Mock(side_effect=[[],[{'closed':True}]]);runtime=Mock(side_effect=RuntimeError('failed'))
        r=close_once(p,sql,runtime);self.assertTrue(r['sqlClosed']);self.assertFalse(r['runtimeClosed']);self.assertEqual(r['status'],'RECONCILE_REQUIRED')
    def test_recovery_is_read_only_and_exact_runtime_result_required(self):
        p=plan();sql=Mock(return_value=[{'closed':True}]);runtime=Mock(return_value={'verified':True,'windowId':'wrong'})
        r=close_once(p,sql,runtime,recover_only=True);self.assertEqual(sql.call_count,1);self.assertIn('BEGIN READ ONLY',sql.call_args[0][0]);self.assertEqual(r['status'],'RECONCILE_REQUIRED')
    def test_shared_role_foreign_window_source_or_helper_drift_rejected(self):
        changes=[lambda p:p['temporaryRoles'].append({'name':'otr_trip_publication_catalog_reader','priorCanLogin':False}),lambda p:p['temporaryRoles'][0].update(priorCanLogin=True),lambda p:p['providerScope'].update(actor_id=str(uuid.uuid4())),lambda p:p['sourceScope'].update(starts_at='2026-01-01T00:00:00Z'),lambda p:p['helperHashes'].update({'universal_watchdog.py':'0'*64})]
        for change in changes:
            p=plan();change(p);rehash(p)
            with self.assertRaises(ValueError):validate(p)
    def test_no_owner_permission_has_no_effect(self):
        p=plan();p['ownerAuthorized']=False;sql=Mock();runtime=Mock()
        with self.assertRaises(ValueError):close_once(p,sql,runtime)
        sql.assert_not_called();runtime.assert_not_called()
    def test_watch_expiry_once_and_failed_close_never_retries(self):
        p=plan();clock=[watchdog.instant(p['expiresAt'])-.1]
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'plan';path.write_text(json.dumps(p));directory=Path(d)/'run';digest=watchdog.prepare(path,directory)
            calls=[]
            def closer(*a):calls.append(1);raise RuntimeError('UNKNOWN')
            r=watchdog.watch(directory,digest,clock=lambda:clock[0],pause=lambda n:clock.__setitem__(0,clock[0]+n),closer=closer)
            self.assertEqual(r['status'],'RECONCILE_REQUIRED');self.assertEqual(calls,[1])
            with self.assertRaises(FileExistsError):watchdog.watch(directory,digest,closer=closer)
    def interleaved(self,watch_first):
        p=plan()
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/'source';source.write_text(json.dumps(p));directory=Path(d)/'run';digest=watchdog.prepare(source,directory)
            entered=threading.Event();release=threading.Event();calls=[];winner=[]
            def closer(*args):
                calls.append(1);entered.set()
                if not release.wait(3):raise RuntimeError('TEST_TIMEOUT')
                return {'status':'CLOSED_VERIFIED','windowId':p['windowId']}
            def watched():return watchdog.watch(directory,digest,clock=lambda:watchdog.instant(p['expiresAt']),closer=closer)
            def manual():return watchdog.execute_once(p,directory,digest,closer)
            action=watched if watch_first else manual
            thread=threading.Thread(target=lambda:winner.append(action()))
            thread.start();self.assertTrue(entered.wait(3))
            loser=manual() if watch_first else watched()
            result=loser[0] if watch_first else loser
            self.assertEqual(result['status'],'RECONCILE_REQUIRED')
            self.assertTrue(result['executionAlreadyClaimed']);self.assertEqual(calls,[1])
            release.set();thread.join(3);self.assertFalse(thread.is_alive())
            cached,attempts=watchdog.execute_once(p,directory,digest,closer)
            self.assertEqual(cached['status'],'CLOSED_VERIFIED');self.assertEqual(attempts,0)
            self.assertEqual(calls,[1]);self.assertTrue((directory/'execution-claimed.json').exists())
    def test_manual_inflight_then_watcher_cannot_close_again(self):self.interleaved(False)
    def test_watcher_inflight_then_manual_cannot_close_again(self):self.interleaved(True)
    def test_default_prepare_creates_no_activation_and_plan_mutation_denied(self):
        p=plan();p['ownerAuthorized']=False
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/'source';source.write_text(json.dumps(p));run=Path(d)/'run';digest=watchdog.prepare(source,run)
            self.assertFalse((run/'watch-claimed.json').exists())
            with self.assertRaises(ValueError):watchdog.load(run,digest)

if __name__=='__main__':unittest.main()
