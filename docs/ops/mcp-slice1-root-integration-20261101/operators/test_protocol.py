"""Synthetic, no Docker/SSH/SQL/OTP. Exercise actual retained restore and v4 CAS."""
import copy
import hashlib
import json
import stat
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import config_cas as cas
import universal_runtime_close as retained
from prepare_cas import make_plan

NOW = 1800000000000
WINDOW = '1' * 32
DEFAULT = 'a' * 64
EMPTY = 'c' * 64
NEW = 'e' * 64
IMAGE = 'sha256:' + 'd' * 64
DIRECTORY = Path('/opt/otr/dev-backend/build/auth-consumer-write-qa-' + WINDOW)
CASES = json.loads(Path(__file__).with_name('slice1-qa-cases.json').read_text())['cases']

def qa(profile='Claude', confirmed=False):
    c = next(x for x in CASES if x['client'] == profile)
    return {'version':4, 'toolProfile':'SLICE1_NOTES_EDIT', 'clientId':cas.CLIENTS[profile][0],
            'redirectUris':[cas.CLIENTS[profile][1]], 'expiresAt':NOW+1700000,
            'businessAccess':'READ_WRITE', 'consentNotBefore':NOW-1000,
            'confirmations':[{'operationId':c['command']['operationId'], 'previewDigest':c['identity']['preview_digest']}] if confirmed else []}

def approval(q):
    return {'gateSHA256':cas.GATE, 'ownerConfirmed':True, 'clientId':q['clientId'],
            **q['confirmations'][0], 'sourceThreadId':'01a18663-48af-7b80-9fac-408bfa98e2fb',
            'sourceMessageId':'SYNTHETIC_TEST_NOT_ACTUAL_OWNER_APPROVAL'}

def snapshot(cid, name, config, running=True):
    return {'Id':cid, 'Name':'/'+name, 'Image':IMAGE, 'Config':copy.deepcopy(config),
            'HostConfig':{'NetworkMode':'fixture', 'Mounts':[]},
            'Mounts':[{'Source':'/fixture/source', 'Destination':'/fixture/read', 'RW':False}],
            'State':{'Running':running, 'Status':'running' if running else 'exited', 'Health':{'Status':'healthy'}}}

class Fixture:
    def __init__(self, phase):
        self.trace=[]
        default_config={'Image':IMAGE, 'Env':['FIXTURE_ONLY=not-a-secret'], 'Labels':{}, 'Cmd':['node','server-capture.mjs']}
        self.backup='otr-dev-backend-before-auth-write-'+WINDOW
        self.snap={DEFAULT:snapshot(DEFAULT, 'otr-dev-backend', default_config)}
        self.active=DEFAULT
        empty_raw=json.dumps(qa())
        if phase=='CONFIRM':
            self.snap[DEFAULT]['Name']='/'+self.backup;self.snap[DEFAULT]['State']['Running']=False
            config={**default_config, 'Env':default_config['Env']+[cas.WRITE+'='+empty_raw]}
            self.snap[EMPTY]=snapshot(EMPTY, 'otr-dev-backend', config);self.active=EMPTY
        old=self.snap[self.active];target=qa(confirmed=phase=='CONFIRM');raw=json.dumps(target)
        newconfig={**old['Config'], 'Env':[x for x in old['Config']['Env'] if not x.startswith(cas.WRITE+'=')]+[cas.WRITE+'='+raw]}
        self.g={'gateSHA256':cas.GATE, 'windowId':WINDOW, 'phase':phase, 'authQaConfig':raw,
                'clientProfile':'Claude','windowStartedAtMs':NOW-1000,'deadlineMs':target['expiresAt'],
                'beforeContainerId':self.active,'defaultContainerId':DEFAULT,'candidateImage':IMAGE,
                'beforeConfigSHA256':cas.digest(old['Config']),'beforeHostConfigSHA256':cas.digest(old['HostConfig']),
                'beforeEnvironmentSHA256':cas.digest(cas.environment(old)),
                'beforeAuthQaConfig':empty_raw if phase=='CONFIRM' else None,
                'expectedConfigSHA256':cas.digest(newconfig),'expectedHostConfig':old['HostConfig'],
                'expectedMounts':cas.mounts(old),'beforeConfigHashes':{},'mountedFileHashes':{},'bundles':{},
                'containerName':'otr-mcp-slice1-'+phase.lower()+'-'+WINDOW,
                'backupName':self.backup if phase=='EMPTY' else 'otr-mcp-slice1-empty-'+WINDOW,
                'restoreBaseline':{'beforeContainerId':DEFAULT,'beforeImage':IMAGE,'candidateImage':IMAGE,
                                   'backupName':self.backup,'restoreHelperSHA256':cas.HELPER_SHA}}
        self.approval=json.dumps(approval(target)).encode() if phase=='CONFIRM' else None
        if self.approval:self.g['approvalRecordSHA256']=hashlib.sha256(self.approval).hexdigest()
        self.close=None

    def inspect(self, key):
        if key=='otr-dev-backend':key=next(i for i,s in self.snap.items() if s['Name']=='/otr-dev-backend')
        return copy.deepcopy(self.snap[key])

    def call(self,args):
        self.trace.append(tuple(args))
        if args[:3]==['docker','container','ls']:
            selector=args[-1];kind,value=selector.split('=',1)
            ids=[i for i,s in self.snap.items() if (i==value if kind=='id' else s['Name']==value.removeprefix('^').removesuffix('$'))]
            return '\n'.join(ids)
        if args[:2]==['docker','inspect']:return json.dumps([self.inspect(args[2])])
        cmd=args[1];cid=args[-1] if cmd=='stop' else args[2]
        if cmd=='stop':self.snap[cid]['State']['Running']=False
        elif cmd=='start':
            self.snap[cid]['State']['Running']=True
            self.snap[cid]['State']['Status']='exited' if getattr(self,'fail_start',False) and cid==NEW else 'running'
        elif cmd=='rename':self.snap[cid]['Name']='/'+args[3]
        elif cmd=='rm':del self.snap[cid]
        else:raise AssertionError(args)
        return ''

    def create(self):
        fixture=self
        class Docker:
            def __init__(self,*a,**k):pass
            def request(self,method,path,body,headers):
                data=json.loads(body);hc=data.pop('HostConfig');fixture.snap[NEW]=snapshot(NEW,fixture.g['containerName'],data,False);fixture.snap[NEW]['State']['Status']='created';fixture.snap[NEW]['HostConfig']=hc
            def getresponse(self):return types.SimpleNamespace(status=201,read=lambda:json.dumps({'Id':NEW}).encode())
            def close(self):pass
        return Docker

    def publish(self,g,directory,cid,h):
        self.trace.append(('PUBLISH_CLOSE',cid,h));self.close=(cid,h)

    def execute(self):
        helper=Path(__file__).with_name('universal_runtime_close.py').read_bytes()
        def private(path):return self.approval if path.name=='owner-approval.json' else helper
        with patch.object(cas,'inspect',self.inspect),patch.object(cas,'call',self.call),patch.object(cas,'Docker',self.create()),patch.object(cas,'publish_close_plan',self.publish),patch.object(cas,'private',private),patch.object(cas,'verify_http',lambda g:None),patch('os.getuid',return_value=0),patch('os.open',return_value=999),patch('os.fstat',return_value=types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_uid=0,st_nlink=1)),patch('os.close'),patch('fcntl.flock'),patch('time.time',return_value=NOW/1000):
            return cas.run(self.g,DIRECTORY)

class Protocol(unittest.TestCase):
    def test_exact_empty_and_confirmed_profiles(self):
        for profile in cas.CLIENTS:
            for confirmed in (False,True):
                q=qa(profile,confirmed)
                self.assertEqual(cas.validate_config(json.dumps(q),profile,NOW-1000,'CONFIRM' if confirmed else 'EMPTY',approval(q) if confirmed else None,now=NOW),q)

    def test_reject_scope_drift_and_model_confirmation(self):
        for change in [{'version':3},{'version':True},{'toolProfile':'ALL'},{'clientId':'x'},{'redirectUris':['http://127.0.0.1:18764/callback']},{'expiresAt':NOW+1800000},{'expiresAt':NOW},{'expiresAt':True},{'consentNotBefore':NOW},{'confirmed':True},{'confirmations':[{'operationId':'bb0cb010-0cb4-432b-8995-670aaec95b3d','previewDigest':'e'*64}]}]:
            with self.subTest(change=change),self.assertRaises((AssertionError,ValueError)):
                cas.validate_config(json.dumps({**qa(),**change}),'Claude',NOW-1000,'EMPTY',now=NOW)
        q=qa(confirmed=True)
        for proof in (None,{**approval(q),'ownerConfirmed':False},{**approval(q),'previewDigest':'e'*64},{**approval(q),'sourceThreadId':'wrong'}):
            with self.assertRaises(AssertionError):cas.validate_config(json.dumps(q),'Claude',NOW-1000,'CONFIRM',proof,now=NOW)

    def test_close_published_before_serving_and_actual_restore_both_states(self):
        for phase in ('EMPTY','CONFIRM'):
            with self.subTest(phase=phase):
                f=Fixture(phase);r=f.execute();self.assertTrue(r['closePlanPublishedBeforeServe'])
                publish=next(i for i,a in enumerate(f.trace) if a[0]=='PUBLISH_CLOSE')
                start=next(i for i,a in enumerate(f.trace) if a[:2]==('docker','start'))
                self.assertLess(publish,start)
                active_hash=f.close[1]
                def check(s,active):
                    self.assertEqual(s['Id'],NEW if active else DEFAULT);self.assertEqual(s['Image'],IMAGE)
                    self.assertEqual(cas.digest(s['Config']),active_hash if active else cas.digest({'Image':IMAGE,'Env':['FIXTURE_ONLY=not-a-secret'],'Labels':{},'Cmd':['node','server-capture.mjs']}))
                retained.restore_retained({'runtime':{'container':'otr-dev-backend','originalContainerId':DEFAULT,'backupContainerName':f.backup}},f.call,check)
                self.assertEqual(f.inspect('otr-dev-backend')['Id'],DEFAULT)
                self.assertNotIn(cas.WRITE,cas.environment(f.inspect(DEFAULT)))
                self.assertNotIn(NEW,f.snap)

    def test_confirm_cannot_extend_deadline_or_change_image(self):
        f=Fixture('CONFIRM');q=json.loads(f.g['authQaConfig']);q['expiresAt']+=1;f.g['authQaConfig']=json.dumps(q);f.g['deadlineMs']=q['expiresAt']
        with self.assertRaises(AssertionError):f.execute()
        f=Fixture('EMPTY');f.g['candidateImage']='sha256:'+'f'*64
        with self.assertRaises(AssertionError):f.execute()

    def test_failed_smoke_restores_previous_config_and_close_pointer(self):
        f=Fixture('CONFIRM')
        with patch.object(cas,'verify_http',side_effect=RuntimeError('FIXTURE_SMOKE_FAILED')):
            # execute supplies its own no-IO smoke; replace at the called boundary.
            original=f.publish
            def fail_after_publish(g,directory,cid,h):
                original(g,directory,cid,h)
                if cid==NEW:f.fail_start=True;f.snap[NEW]['State']['Health']['Status']='unhealthy'
            f.publish=fail_after_publish
            with self.assertRaises(RuntimeError):f.execute()
        self.assertEqual(f.inspect('otr-dev-backend')['Id'],EMPTY)
        self.assertEqual(f.close[0],EMPTY)

    def test_fresh_plan_does_not_copy_private_environment(self):
        f=Fixture('EMPTY');s=f.inspect(DEFAULT)
        r={'gateSHA256':cas.GATE,'phase':'EMPTY','windowId':WINDOW,'clientProfile':'Claude',
           'authQaConfig':json.dumps(qa()),'windowStartedAtMs':NOW-1000,
           'expectedCurrentContainerId':DEFAULT,'expectedCurrentConfigSHA256':cas.digest(s['Config']),
           'defaultContainerId':DEFAULT,'defaultConfigSHA256':cas.digest(s['Config'])}
        t={'beforeConfigHashes':{},'mountedFileHashes':{},'bundles':{},'protectedRoutes':[('/fixture',401)]}
        g=make_plan(r,s,s,t,NOW)
        self.assertNotIn('FIXTURE_ONLY',json.dumps(g))
        self.assertEqual(g['deadlineMs'],qa()['expiresAt'])
        self.assertEqual(g['restoreBaseline']['beforeContainerId'],DEFAULT)
        drift=copy.deepcopy(s);drift['Config']['Env'].append('UNAPPROVED=drift')
        with self.assertRaises(AssertionError):make_plan(r,drift,s,t,NOW)

if __name__=='__main__':unittest.main()
