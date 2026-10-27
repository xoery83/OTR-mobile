import copy,hashlib,io,json,stat,types,unittest
from unittest.mock import patch
from pathlib import Path
from universal_close_test import plan,rehash
import universal_runtime_close as runtime

class RuntimeTests(unittest.TestCase):
    def fixture(self,unknown=False,drift=False):
        p=plan();r=p['runtime'];trip={'Source':'/opt/otr/dev-backend/trip-private.json','Destination':'/run/otr/trip-sustained-runtime.json','RW':False}
        finite={'Source':r['runtimeSource'],'Destination':'/run/otr/universal-runtime.json','RW':False}
        base={'Image':r['imageId'],'Config':{'User':'otr','Cmd':['node','server-capture.mjs'],'Env':['KEEP_TRIP=active'],'Labels':{'com.docker.compose.project.config_files':','.join(r['baselineComposeFiles'])}},'Mounts':[trip],'HostConfig':{'Binds':['trip-private:trip-private:ro']},'State':{'Health':{'Status':'healthy'}}}
        active=copy.deepcopy(base);active['Config']['Env']+=['FINITE_UNIVERSAL=only-this-window'];active['Config']['Labels']['com.docker.compose.project.config_files']+=','+r['finiteComposeFile'];active['Mounts'].append(finite);active['HostConfig']['Binds'].append('finite:finite:ro')
        for label,s in [('baseline',base),('active',active)]:
            r[label+'EnvironmentSHA256']=runtime.sha(runtime.canonical(sorted(s['Config']['Env'])))
            r[label+'HostConfigSHA256']=runtime.sha(runtime.canonical(s['HostConfig']))
            r[label+'MountsSHA256']=runtime.sha(runtime.canonical(sorted(s['Mounts'],key=lambda m:(m['Destination'],m['Source']))))
        files={r['runtimeSource']:(b'synthetic private config',0o440,999),r['finiteComposeFile']:(b'finite overlay',0o600,0),r['baselineComposeFiles'][0]:(b'baseline keeps Trip/P1',0o644,0)}
        r['runtimeSHA256']=runtime.sha(files[r['runtimeSource']][0]);r['finiteComposeSHA256']=runtime.sha(files[r['finiteComposeFile']][0]);r['composeHashes']={r['baselineComposeFiles'][0]:runtime.sha(files[r['baselineComposeFiles'][0]][0])}
        rehash(p);state=[active];calls=[];handles={};counter=[10]
        if drift:state[0]['Config']['Env'].append('UNREVIEWED_OTHER_WINDOW=true')
        def command(args,**kwargs):
            calls.append(args)
            if args[:2]==['docker','inspect']:return json.dumps([state[0]])
            if 'config' in args:return json.dumps({'services':{'backend':{'image':r['imageId'],'command':['node','server-capture.mjs']}}})
            if 'up' in args:
                self.assertNotIn(r['finiteComposeFile'],args);state[0]=copy.deepcopy(base)
                if unknown:raise runtime.subprocess.TimeoutExpired(args,35)
                return ''
            raise AssertionError(args)
        def opened(path,*args):
            counter[0]+=1;handles[counter[0]]=str(path);return counter[0]
        def fstat(fd):
            path=handles[fd];mode,group=(0o600,0) if path.startswith('/run/lock/') else files[path][1:]
            return types.SimpleNamespace(st_mode=stat.S_IFREG|mode,st_uid=0,st_gid=group,st_nlink=1)
        patches=[patch.object(runtime.subprocess,'check_output',command),patch.object(runtime.os,'open',opened),patch.object(runtime.os,'fstat',fstat),patch.object(runtime.os,'fdopen',lambda fd,*a,**k:io.BytesIO(files[handles[fd]][0])),patch.object(runtime.os,'close',lambda fd:None),patch.object(runtime.os,'unlink',lambda path:files.pop(str(path))),patch.object(runtime.fcntl,'flock',lambda *a:None),patch.object(runtime.Path,'exists',lambda path:str(path) in files or str(path)==str(Path(r['runtimeSource']).parent)),patch.object(runtime.Path,'lstat',lambda path:types.SimpleNamespace(st_mode=stat.S_IFDIR|0o700,st_uid=0)),patch.object(runtime.Path,'is_symlink',lambda path:False)]
        return p,r,files,state,calls,patches
    def run_case(self,unknown=False,drift=False):
        p,r,files,state,calls,patches=self.fixture(unknown,drift)
        import contextlib
        with contextlib.ExitStack() as stack:
            for item in patches:stack.enter_context(item)
            if drift:
                with self.assertRaises(ValueError):runtime.remote_close(p)
                self.assertFalse(any('up' in call for call in calls));self.assertIn(r['runtimeSource'],files);return
            self.assertEqual(runtime.remote_close(p),{'verified':True,'windowId':p['windowId']})
            self.assertEqual(len([c for c in calls if 'up' in c]),1)
            self.assertEqual(state[0]['Config']['Env'],['KEEP_TRIP=active'])
            self.assertEqual(state[0]['Mounts'][0]['Destination'],'/run/otr/trip-sustained-runtime.json')
            self.assertNotIn(r['runtimeSource'],files);self.assertNotIn(r['finiteComposeFile'],files)
            self.assertIn(r['baselineComposeFiles'][0],files)
            # Repeat after exact restore performs no compose mutation.
            self.assertTrue(runtime.remote_close(p)['verified']);self.assertEqual(len([c for c in calls if 'up' in c]),1)
    def test_exact_mount_removed_trip_baseline_preserved_idempotent(self):self.run_case()
    def test_unknown_compose_success_independently_inspected_no_retry(self):self.run_case(unknown=True)
    def test_foreign_environment_stops_before_service_or_file_change(self):self.run_case(drift=True)
    def test_read_only_recovery_never_composes_or_unlinks(self):
        import contextlib
        p,r,files,state,calls,patches=self.fixture()
        with contextlib.ExitStack() as stack:
            for item in patches:stack.enter_context(item)
            with self.assertRaisesRegex(RuntimeError,'READ_ONLY_RUNTIME_STILL_ACTIVE'):runtime.remote_close(p,read_only=True)
            self.assertFalse(any('up' in c for c in calls));self.assertIn(r['runtimeSource'],files)
            runtime.remote_close(p)
            count=len(calls);self.assertTrue(runtime.remote_close(p,read_only=True)['verified']);self.assertFalse(any('up' in c for c in calls[count:]))
    def test_cross_window_mount_path_rejected(self):
        p=plan();p['runtime']['runtimeSource']='/opt/otr/dev-backend/env/universal-finite-other/runtime.json'
        with self.assertRaises(ValueError):runtime.validate_runtime(p)

if __name__=='__main__':unittest.main()
