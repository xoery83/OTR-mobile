import copy
import importlib.util
import json
import os
import subprocess
import sys
import threading
from pathlib import Path
import tempfile
import time
import unittest
import uuid
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('closedimage',Path(__file__).with_name('universal_closed_image.py'))
m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)


def fixture():
    activation=str(uuid.uuid4());release='/opt/otr/dev-backend/releases/universal-closed-'+activation
    receipts=Path(__file__).resolve().parents[2]/'docs/ops/trip-p1-sustained-sync-20261024/receipts'
    actual=json.loads((receipts/'FINAL_DEV_BACKEND_INITIAL_DIAGNOSTIC.json').read_text())
    mounts=[{'Source':i['source'],'Destination':i['destination'],'RW':i['rw'],'Type':'bind'} for i in actual['mounts']]
    host={'NetworkMode':'host','Mounts':[{'Target':i['Destination'],'Source':i['Source'],'ReadOnly':not i['RW']} for i in mounts],'Memory':0}
    files=['/opt/otr/dev-backend/compose.yml','/opt/otr/dev-backend/sustained.yml']
    snapshot={'Image':m.BASELINE,'Config':{'User':'otr','Cmd':['node','server-capture.mjs'],'Env':['OTR_DEV_SUPABASE_URL=https://tuqigdxrvrerfewsxqgm.supabase.co','OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT=disabled'],'Labels':{'com.docker.compose.project.config_files':','.join(files)}},'HostConfig':host,'Mounts':mounts,'State':{'Health':{'Status':'healthy'}}}
    iso=lambda seconds: m.datetime.datetime.fromtimestamp(seconds,m.datetime.timezone.utc).isoformat()
    gate={'version':1,'project':'tuqigdxrvrerfewsxqgm','activationId':activation,'releaseDirectory':release,'baselineImage':m.BASELINE,'candidateImage':m.CANDIDATE,'candidateBundles':m.BUNDLES,'startsAt':iso(time.time()-1),'expiresAt':iso(time.time()+800),'ownerAuthorized':True,'baseline':{'environmentSHA256':m.digest(dict(x.split('=',1) for x in snapshot['Config']['Env'])),'rawHostConfigSHA256':m.digest(host),'mountsSHA256':m.digest(sorted(mounts,key=lambda i:i['Destination'])),'captureBundleSHA256':'a221ab978039fad46f7eb69914153692228c467ee2cd559280da1463b3ee02d9','composeFiles':files,'composeHashes':{p:'a'*64 for p in files},'privateFiles':{i['Source']:{'sha256':'b'*64,'uid':0,'gid':999,'mode':288} for i in mounts if not i['RW']},'custodyDirectory':{'path':m.MOUNTS[1][0],'uid':10001,'gid':10001,'mode':448,'device':1,'inode':2}}}
    gate['operatorSHA256']=m.hashlib.sha256(Path(m.__file__).read_bytes()).hexdigest()
    gate['diagnosticsHelperSHA256']=m.hashlib.sha256((Path(m.__file__).resolve().parents[1]/'dev/metadata_closed_retry.py').read_bytes()).hexdigest()
    gate['remoteProgramSHA256']=m.hashlib.sha256(m.remote_source().encode()).hexdigest()
    return gate,snapshot


class FakeDocker:
    def __init__(self,gate,snapshot):self.gate=gate;self.snapshot=copy.deepcopy(snapshot);self.swaps=[];self.fail=False;self.unknown=False;self.rollback_fail=False;self.diagnostic_fail=False
    def current(self):return self.snapshot
    def files(self):return {}
    def render(self):pass
    def diagnostic(self):
        if self.diagnostic_fail:raise RuntimeError('fixture')
        return {'sanitized':True}
    def swap(self,active):
        self.swaps.append(active)
        if not active and self.rollback_fail:raise RuntimeError('fixture')
        self.snapshot['Image']=m.CANDIDATE if active else m.BASELINE
        self.snapshot['Config']['Labels']['com.docker.compose.project.config_files']=','.join(self.gate['baseline']['composeFiles']+([self.gate['releaseDirectory']+'/image.yml'] if active else []))
        if active and self.unknown:raise TimeoutError('lost reply')
    def verify(self,active):
        m.check_snapshot(self.gate,self.snapshot,m.CANDIDATE if active else m.BASELINE,active)
        if active and self.fail:raise RuntimeError('unhealthy')
    def wait(self,active):self.verify(active)


class ImageOnlyTests(unittest.TestCase):
    def test_actual_four_mount_and_raw_host_preserved_success(self):
        g,s=fixture();m.validate(g);io=FakeDocker(g,s)
        with tempfile.TemporaryDirectory() as p:
            root=Path(p);armed=[]
            result=m.deploy(g,root,io,lambda:armed.append(True))
            self.assertEqual(result['status'],'CLOSED_DEPLOYMENT_PASS');self.assertEqual(armed,[True]);self.assertEqual(io.swaps,[True]);self.assertEqual(s['HostConfig'],io.snapshot['HostConfig']);self.assertTrue((root/'accepted.json').exists())
    def test_unhealthy_restores_captured_image_after_diagnostic(self):
        g,s=fixture();io=FakeDocker(g,s);io.fail=True
        with tempfile.TemporaryDirectory() as p:
            root=Path(p);result=m.deploy(g,root,io,lambda:None)
            self.assertEqual(result['status'],'CLOSED_FAILED_ROLLED_BACK');self.assertEqual(io.swaps,[True,False]);self.assertTrue((root/'candidate-diagnostic.json').exists());self.assertEqual(io.snapshot,s)
    def test_lost_compose_reply_reconciles_without_second_up(self):
        g,s=fixture();io=FakeDocker(g,s);io.unknown=True
        with tempfile.TemporaryDirectory() as p:self.assertEqual(m.deploy(g,Path(p),io,lambda:None)['status'],'CLOSED_DEPLOYMENT_PASS')
        self.assertEqual(io.swaps,[True])
    def test_failed_rollback_is_reconcile_required_no_retry(self):
        g,s=fixture();io=FakeDocker(g,s);io.fail=True;io.rollback_fail=True
        with tempfile.TemporaryDirectory() as p:
            root=Path(p);self.assertEqual(m.deploy(g,root,io,lambda:None)['status'],'RECONCILE_REQUIRED');m.restore(g,root,io)
        self.assertEqual(io.swaps,[True,False])
    def test_restore_claim_shared_manual_watch_order(self):
        for order in ('manual-watch','watch-manual'):
            with self.subTest(order=order),tempfile.TemporaryDirectory() as p:
                g,s=fixture();io=FakeDocker(g,s);io.swap(True);io.swaps=[];root=Path(p)
                first=m.restore(g,root,io);second=m.restore(g,root,io)
                self.assertEqual(first,second);self.assertEqual(io.swaps,[False])
    def test_attempt_claim_prevents_second_deployment(self):
        g,s=fixture();io=FakeDocker(g,s)
        with tempfile.TemporaryDirectory() as p:
            root=Path(p);m.save(root,'attempt-claimed.json',{'fixture':True})
            with self.assertRaises(FileExistsError):m.deploy(g,root,io,lambda:None)
        self.assertEqual(io.swaps,[])
    def test_watchdog_arm_failure_is_before_service_change(self):
        g,s=fixture();io=FakeDocker(g,s)
        with tempfile.TemporaryDirectory() as p:
            with self.assertRaises(RuntimeError):m.deploy(g,Path(p),io,lambda:(_ for _ in ()).throw(RuntimeError('no watcher')))
        self.assertEqual(io.swaps,[])
    def test_window_reserve_owner_and_baseline_negative(self):
        for key in ('owner','time','host','env','mount','runtime'):
            g,s=fixture();io=FakeDocker(g,s)
            if key=='owner':g['ownerAuthorized']=False
            if key=='time':g['expiresAt']=g['startsAt']
            if key=='host':io.snapshot['HostConfig']['Mounts'].reverse()
            if key=='env':io.snapshot['Config']['Env'].append('UNEXPECTED=1')
            if key=='mount':io.snapshot['Mounts'][0]['RW']=True
            if key=='runtime':io.snapshot['Mounts'][3]['Source']='/opt/otr/dev-backend/env/replaced-runtime.json'
            with self.subTest(key=key),tempfile.TemporaryDirectory() as p:
                with self.assertRaises(AssertionError):m.deploy(g,Path(p),io,lambda:None)
                self.assertEqual(io.swaps,[])
    def test_foreign_image_after_unknown_is_never_overwritten(self):
        g,s=fixture();io=FakeDocker(g,s);io.snapshot['Image']='sha256:'+'f'*64
        with tempfile.TemporaryDirectory() as p:self.assertEqual(m.restore(g,Path(p),io)['status'],'RECONCILE_REQUIRED')
        self.assertEqual(io.swaps,[])
    def test_private_receipt_atomic_exclusive_and_permissions(self):
        with tempfile.TemporaryDirectory() as p:
            root=Path(p);m.save(root,'result.json',{'safe':True})
            with self.assertRaises(FileExistsError):m.save(root,'result.json',{'changed':True})
            raw,info=m.read_private(root/'result.json');self.assertEqual(json.loads(raw),{'safe':True});self.assertEqual(m.stat.S_IMODE(info.st_mode),0o600);self.assertEqual(list(root.iterdir()),[root/'result.json'])
    def test_existing_diagnostics_redact_runtime_and_env_values(self):
        g,s=fixture();s['Config']['Env']+=['EXAMPLE_SECRET=private-value'];s['State']['Health']['Log']=[{'Output':'password=runtime-value private-value'}]
        result=m.diagnostics(s,'token=runtime-value private-value',{'EXAMPLE_SECRET':'private-value','runtimePassword':'runtime-value'},b'fixed-comparison')
        self.assertNotIn('private-value',json.dumps(result));self.assertNotIn('runtime-value',json.dumps(result))
    def test_compose_render_rejects_non_image_change(self):
        g,_=fixture();io=m.Docker(g);base={'image':m.BASELINE,'command':['node','server-capture.mjs'],'volumes':['retain4']}
        with patch.object(io,'compose',side_effect=[json.dumps({'services':{'backend':base}}).encode(),json.dumps({'services':{'backend':dict(base,image=m.CANDIDATE,volumes=[])}}).encode()]):
            with self.assertRaises(AssertionError):io.render()

    def test_generated_remote_is_self_contained_compilable(self):
        source=m.remote_source();compile(source,'remote-operator.py','exec')
        namespace={'__name__':'isolated_not_main'};exec(source,namespace)
        gate,_=fixture();namespace['validate'](gate)
        self.assertEqual(namespace['CANDIDATE'],m.CANDIDATE)

    def test_prepare_has_no_ssh_or_docker_invocation(self):
        gate,_=fixture();gate['ownerAuthorized']=False
        with tempfile.TemporaryDirectory() as p:
            path=Path(p)/'plan.json';raw=json.dumps(gate).encode();path.write_bytes(raw)
            args=['operator','--gate',str(path),'--gate-sha256',m.hashlib.sha256(raw).hexdigest()]
            with patch.object(sys,'argv',args),patch.object(m.subprocess,'run',side_effect=AssertionError('must not run')):
                m.main()

    def test_concurrent_restore_only_one_mutation(self):
        gate,snapshot=fixture();io=FakeDocker(gate,snapshot);io.swap(True);io.swaps=[]
        with tempfile.TemporaryDirectory() as p:
            root=Path(p);barrier=threading.Barrier(2);results=[]
            def close():barrier.wait();results.append(m.restore(gate,root,io))
            threads=[threading.Thread(target=close) for _ in range(2)]
            for t in threads:t.start()
            for t in threads:t.join()
            self.assertEqual(io.swaps,[False]);self.assertEqual(len(results),2)

    def test_actual_detached_watch_process_survives_launcher_exit(self):
        # Actual watch/sleep/private files; Docker+shared privileged lock are
        # deliberately simulated. No remote host or /run/lock is accessed.
        with tempfile.TemporaryDirectory() as p:
            root=Path(p);gate,_=fixture();m.validate(gate)
            gate['releaseDirectory']=str(root)
            gate['expiresAt']=m.datetime.datetime.fromtimestamp(time.time()+1,m.datetime.timezone.utc).isoformat()
            m.save(root,'plan.json',gate)
            (root/'operator.py').write_text(m.remote_source());(root/'operator.py').chmod(0o600)
            module=str(Path(__file__).with_name('universal_closed_image.py').resolve())
            driver=root/'fixture-watch.py'
            driver.write_text("import importlib.util,json,sys\nfrom pathlib import Path\ns=importlib.util.spec_from_file_location('operator',"+repr(module)+");m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nm.validate=lambda gate:None\ndef restore(gate,root,action):\n assert action=='restore'\n m.save(root,'simulated-restore.json',{'status':'fixture only'})\n return {'status':'fixture only'}\nm.locked=restore\nm.watch(Path(sys.argv[1]))\n")
            launcher="import subprocess,sys;from pathlib import Path; p=subprocess.Popen([sys.executable,sys.argv[1],sys.argv[2]],start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);print(p.pid,flush=True)"
            result=subprocess.run([sys.executable,'-c',launcher,str(driver),str(root)],capture_output=True,text=True,timeout=3)
            self.assertEqual(result.returncode,0)
            end=time.monotonic()+3
            while not (root/'simulated-restore.json').exists() and time.monotonic()<end:time.sleep(.02)
            self.assertTrue((root/'watch-ready.json').exists());self.assertTrue((root/'simulated-restore.json').exists())

    def test_authoritative_mount_shape_is_preserved_not_made_readonly(self):
        gate,snapshot=fixture();m.approved_mounts(snapshot['Mounts'])
        self.assertEqual(len(gate['baseline']['privateFiles']),3)
        self.assertTrue(next(i for i in snapshot['Mounts'] if i['Destination']=='/var/lib/otr/capture-custody')['RW'])
        self.assertIn('/run/otr-r3a5-catalog/catalog-reader.json',gate['baseline']['privateFiles'])
        for change in ('catalog','custody-rw','type'):
            altered=copy.deepcopy(snapshot['Mounts'])
            if change=='catalog':altered[0]['Source']='/run/other/catalog-reader.json'
            if change=='custody-rw':altered[1]['RW']=False
            if change=='type':altered[1]['Type']='volume'
            with self.subTest(change=change),self.assertRaises(AssertionError):m.approved_mounts(altered)

    def test_custody_directory_metadata_only_never_lists_or_reads_contents(self):
        with tempfile.TemporaryDirectory() as p:
            original=m.os.open
            def open_directory(path,flags,*args):
                self.assertEqual(path,m.MOUNTS[1][0]);self.assertTrue(flags&m.os.O_DIRECTORY)
                return original(p,flags,*args)
            with patch.object(m.os,'open',side_effect=open_directory),patch.object(m.os,'listdir',side_effect=AssertionError('must not list')),patch.object(m.os,'read',side_effect=AssertionError('must not read')):
                value=m.directory_metadata(m.MOUNTS[1][0])
                self.assertEqual(value['inode'],Path(p).stat().st_ino)
                self.assertEqual(value['path'],m.MOUNTS[1][0])

    def test_diagnostic_crosses_utc_or_monotonic_deadline_no_acceptance(self):
        for dimension in ('utc','monotonic'):
            gate,snapshot=fixture();io=FakeDocker(gate,snapshot)
            clock={'utc':time.time(),'monotonic':100.0};calls=[]
            def diagnostic():
                calls.append(True)
                if len(calls)==2:clock[dimension]+=1000
                return {'sanitized':True}
            io.diagnostic=diagnostic
            with self.subTest(dimension=dimension),tempfile.TemporaryDirectory() as p,patch.object(m.time,'time',side_effect=lambda:clock['utc']),patch.object(m.time,'monotonic',side_effect=lambda:clock['monotonic']):
                root=Path(p);result=m.deploy(gate,root,io,lambda:None)
                self.assertEqual(result['status'],'CLOSED_FAILED_ROLLED_BACK');self.assertEqual(io.swaps,[True,False]);self.assertFalse((root/'accepted.json').exists())

    def test_atomic_acceptance_publication_crosses_expiry_is_rejected_and_restored(self):
        gate,snapshot=fixture();io=FakeDocker(gate,snapshot);clock={'utc':time.time()};link=m.os.link
        with tempfile.TemporaryDirectory() as p:
            root=Path(p)
            def delayed_link(source,destination,*args,**kwargs):
                value=link(source,destination,*args,**kwargs)
                if Path(destination).name=='accepted.json':clock['utc']=m.instant(gate['expiresAt'])+1
                return value
            with patch.object(m.time,'time',side_effect=lambda:clock['utc']),patch.object(m.os,'link',side_effect=delayed_link):result=m.deploy(gate,root,io,lambda:None)
            self.assertEqual(result['status'],'CLOSED_FAILED_ROLLED_BACK');self.assertTrue((root/'rejected-acceptance.json').exists());self.assertFalse((root/'accepted.json').exists());self.assertEqual(io.swaps,[True,False])

    def test_watch_rejects_late_saved_acceptance_and_restores(self):
        gate,snapshot=fixture();io=FakeDocker(gate,snapshot);io.swap(True);io.swaps=[]
        with tempfile.TemporaryDirectory() as p:
            root=Path(p);m.save(root,'accepted.json',{'status':'CLOSED_DEPLOYMENT_PASS','gateSHA256':m.digest(gate),'image':m.CANDIDATE,'acceptedAt':gate['expiresAt'],'elapsedSeconds':1})
            original=m.os.open
            def local_lock(path,*args,**kwargs):return original(root/'fixture-lock' if path=='/run/lock/otr-c-finite-service.lock' else path,*args,**kwargs)
            with patch.object(m.os,'open',side_effect=local_lock),patch.object(m,'Docker',return_value=io):result=m.locked(gate,root,'restore')
            self.assertEqual(result['status'],'CLOSED_FAILED_ROLLED_BACK');self.assertEqual(io.swaps,[False])


if __name__=='__main__':unittest.main()
