"""One approved MCP v4 environment CAS; no issuer, OTP, SQL or business command."""
import copy
import datetime
import hashlib
import json
import os
import stat
import sys
import time
import uuid
from pathlib import Path
C02_TIMERS_SHA = '826cb2d61245dd505b2c77ec86aad8d7bd6517e247a51864952c68eb30587585'
C02_HOST_SHA = '68a54bb4eacbc0a74b7832e04751cc1ca5fcbcb82858141d143797175bcbe973'
from deploy import Docker, call, digest, environment, host, inspect, mounts, verify_http

GATE = '530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801'
WRITE = 'OTR_DEV_MCP_C02_QA_CONFIG'
READ = 'OTR_DEV_MCP_READ_QA_CONFIG'
CASES_SHA = '6d5d4e07b14c5a5e9c692e3db24040a7dd076edddbcf8f743bbb86007169d6da'
HELPER_SHA = '931be989f9c5d8a7f3c9fc20c016970344326a0e8482b91feb105190ffff2e5f'
CLIENTS = {
    'Claude': ('d2b8167f-ee42-4ac1-b5ef-4dc003c0d141', 'https://claude.ai/api/mcp/auth_callback'),
    'ChatGPT': ('83504d3f-59d4-43fd-99b1-bebc54c40f7d', 'https://chatgpt.com/connector/oauth/CYUxrs56rSrW'),
}

def validate_actual_owner(b, raw, phase="CREATE", command=None):
    assert b['approvedExecutionGateSHA256'] == '054c1b313ee744c08cdaf406068c484b6ce5aa566a8f5d78a6d7a024754ebfe2'
    assert b['actualOwnerSourceThreadId'] == '01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232'
    message = b['actualOwnerSourceMessageId']
    assert str(uuid.UUID(message)) == message and message != '01a1a4d2-866f-7391-82b3-24d63fe83347'
    assert b['rootSourceReadbackVerified'] is True
    assert hashlib.sha256(raw).hexdigest() == b['actualOwnerWireSHA256']
    wire = json.loads(raw)
    assert wire['sourceThreadId'] == b['actualOwnerSourceThreadId'] and wire['messageId'] == message
    assert wire['role'] == 'user' and wire['sourceKind'] == 'DIRECT_HUMAN_REPLY'
    assert isinstance(wire['text'], str) and 0 < len(wire['text'].strip()) <= 20000
    assert wire['gateSHA256'] == b['approvedExecutionGateSHA256']
    assert wire['phase'] == phase
    if phase == 'CREATE':
        assert wire['explicitUnknownReplayApproval'] is True
        expected = {'actorAccountId': '1f3d7935-1bdc-4952-8d7f-0f72077368c1', 'tripId': 'cc44a705-6f43-41e0-a2f9-16f334b2a6b2', 'operationId': 'a8c1e142-19c4-4d53-9d8e-fae4ad3ff616', 'targetItemId': 'a9dbe020-ebce-49fb-ab31-859977f328c6', 'commandSHA256': 'aa79e67f8295d3366d49b167269256835dd21110b2f6036d5b909467f1a00e35', 'intentSHA256': 'e3775ca551760c823ead8f8bfe158a958260d827f7dc6737c7a13c4215fbe1db', 'previewDigest': '58c72759ffa84e8100d510e5d42a744195d8a04c9478980f3c031cdfdc59f4dc'}
        assert all(wire[k] == v for k, v in expected.items())
    else:
        assert phase == 'EDIT' and wire['explicitEditApproval'] is True
        assert wire['originalCreateOperationId'] == 'a8c1e142-19c4-4d53-9d8e-fae4ad3ff616'
        assert command['operationId'] != wire['originalCreateOperationId']
        assert wire['operationId'] == command['operationId'] and wire['targetItemId'] == 'a9dbe020-ebce-49fb-ab31-859977f328c6'
        assert wire['actorAccountId'] == '1f3d7935-1bdc-4952-8d7f-0f72077368c1' and wire['tripId'] == command['tripId'] == 'cc44a705-6f43-41e0-a2f9-16f334b2a6b2'
        assert wire['commandSHA256'] == hashlib.sha256(json.dumps(command, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
        assert wire['previewDigest'] == b['previewDigest']



def validate_approval_origin(access, approval, phase):
    assert access['actualOwnerSourceThreadId'] == approval['actualOwnerSourceThreadId'] == '01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232'
    if phase == 'CREATE':
        assert approval['actualOwnerSourceMessageId'] == access['actualOwnerSourceMessageId']
    else:
        assert phase == 'EDIT' and approval['actualOwnerSourceMessageId'] != access['actualOwnerSourceMessageId']

def private(path):
    st = path.lstat()
    assert not path.is_symlink() and stat.S_ISREG(st.st_mode) and st.st_uid == 0
    assert stat.S_IMODE(st.st_mode) == 0o600 and st.st_nlink == 1 and st.st_size <= 131072
    return path.read_bytes()

def validate_config(raw, profile, started, phase, approval=None, now=None):
    now = int(time.time() * 1000) if now is None else now
    q=json.loads(raw);p=q['plan']
    assert profile=='ChatGPT' and phase in ('EMPTY','CREATE','EDIT')
    assert p['startsAt']==started and started<=now<p['normalCloseAt']==p['expiresAt']-120000
    assert 0<p['expiresAt']-started<=1800000 and len(p['gateSHA256'])==64 and p['gateSHA256']!='0'*64
    assert str(uuid.UUID(p['windowId']))==p['windowId']
    if phase=='EMPTY':assert p['command'] is None and q['confirmations']==[] and approval is None
    else:
        assert len(q['confirmations'])==1 and p['command']['command']==('CREATE_ITEM' if phase=='CREATE' else 'SET_ITEM_SCHEDULE')
        c=q['confirmations'][0]
        assert isinstance(approval,dict) and approval.get('ownerConfirmed') is True
        assert approval.get('approvedExecutionGateSHA256')==p['gateSHA256']
        assert approval.get('sourceThreadId')==c['sourceThreadId']=='01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232'
        assert approval.get('sourceMessageId')==c['sourceMessageId'] and approval.get('sourceEvidenceSHA256')==c['sourceEvidenceSHA256']
        assert approval.get('operationId')==c['operationId']==p['command']['operationId'] and approval.get('previewDigest')==c['previewDigest']
        assert approval['actualOwnerSourceThreadId'] == approval['sourceThreadId']
        assert approval['actualOwnerSourceMessageId'] == approval['sourceMessageId']
        assert approval['actualOwnerWireSHA256'] == approval['sourceEvidenceSHA256']
        command = p['command']
        if phase == 'CREATE':
            assert hashlib.sha256(json.dumps(command, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest() == 'aa79e67f8295d3366d49b167269256835dd21110b2f6036d5b909467f1a00e35'
        else:
            assert p['createdOperationId'] == 'a8c1e142-19c4-4d53-9d8e-fae4ad3ff616'
            assert str(uuid.UUID(command['operationId'])) == command['operationId'] and command['operationId'] != p['createdOperationId']
            assert command['tripId'] == 'cc44a705-6f43-41e0-a2f9-16f334b2a6b2'
            assert command['target'] == {'kind':'ITEM','id':'a9dbe020-ebce-49fb-ab31-859977f328c6'}
            assert command['baseVector'] == [{'kind':'ITEM','id':'a9dbe020-ebce-49fb-ab31-859977f328c6','revision':1}]
            assert set(command['payload']) == {'schedule'}

    return dict(q,expiresAt=p['expiresAt'])

def same_window(old,new,phase):
    assert {k:v for k,v in old['plan'].items() if k not in ('command','createdOperationId')}=={k:v for k,v in new['plan'].items() if k not in ('command','createdOperationId')}
    if phase=='CREATE':assert old['plan']['command'] is None and old['confirmations']==[]
    else:
        assert old['plan']['command']['command']=='CREATE_ITEM' and len(old['confirmations'])==1
        assert new['plan']['createdOperationId']==old['plan']['command']['operationId']
        assert new['plan']['command']['target']==old['plan']['command']['target']

def atomic_private(path, value):
    if path.exists():
        private(path)
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex)
    fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write((json.dumps(value, sort_keys=True, indent=2) + '\n').encode())
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, path)

def publish_close_plan(g, directory, current_id, config_sha):
    plan = copy.deepcopy(g['restoreBaseline'])
    assert plan['beforeContainerId'] == g['defaultContainerId'] and plan['beforeImage'] == g['candidateImage']
    assert plan['candidateImage'] == plan['beforeImage'] and plan['restoreHelperSHA256'] == HELPER_SHA
    plan['expectedConfigSHA256'] = config_sha
    atomic_private(directory / 'deploy-plan.json', plan)
    raw = private(directory / 'deploy-plan.json')
    atomic_private(directory / 'close-current.json', {
        'gateSHA256': g['gateSHA256'], 'windowId': g['windowId'], 'currentContainerId': current_id, 'defaultContainerId': g['defaultContainerId'], 'defaultConfigSHA256': g['restoreBaseline']['beforeConfigSHA256'],
        'planSHA256': hashlib.sha256(raw).hexdigest(), 'deadlineMs': g['deadlineMs'],
    })

def same_host(a, b):
    left, right = host(a), host(b)
    # Docker create normalizes the default OOM setting from null to false.
    for value in (left, right):
        if "OomKillDisable" in value and value["OomKillDisable"] is None:
            value["OomKillDisable"] = False
    return left == right

def require_c02_timers(g, directory):
    import importlib.util
    source=directory/'c02-timers.py'
    assert hashlib.sha256(private(source)).hexdigest()==C02_TIMERS_SHA
    spec=importlib.util.spec_from_file_location('pinned_c02_timers',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.require_before_serve(g,directory,private,int(time.time()*1000))

def run(g, directory):
    import fcntl
    trace = {'readyAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    assert os.getuid() == 0 and len(g['gateSHA256'])==64 and g['gateSHA256']!='0'*64
    assert directory == Path('/opt/otr/dev-backend/build/auth-consumer-write-qa-' + g['windowId'])
    assert len(g['windowId']) == 32 and all(c in '0123456789abcdef' for c in g['windowId'])
    assert g['containerName'] == 'otr-mcp-c02-' + g['phase'].lower() + '-' + g['windowId']
    expected_backup = g['restoreBaseline']['backupName'] if g['phase'] == 'EMPTY' else 'otr-mcp-c02-'+('empty' if g['phase']=='CREATE' else 'create')+'-'+g['windowId']
    assert g['backupName'] == expected_backup
    assert hashlib.sha256(private(directory / 'universal_runtime_close.py')).hexdigest() == HELPER_SHA
    approval = None
    if g['phase'] != 'EMPTY':
        raw = private(directory / ('owner-approval-'+g['phase'].lower()+'.json'))
        assert hashlib.sha256(raw).hexdigest() == g['approvalRecordSHA256']
        approval = json.loads(raw)
    q = validate_config(g['authQaConfig'], g['clientProfile'], g['windowStartedAtMs'], g['phase'], approval)
    assert q['plan']['gateSHA256']==g['gateSHA256'] and uuid.UUID(q['plan']['windowId']).hex==g['windowId']
    access_raw=private(directory/'access-approval.json');assert hashlib.sha256(access_raw).hexdigest()==g['accessApprovalSHA256']
    access=json.loads(access_raw)
    assert access['status']=='ACTUAL_OWNER_SOURCE_READBACK_VERIFIED_NOT_ACTIVATED' and access['rootSourceReadbackVerified'] is True
    assert access['approvedExecutionGateSHA256']==g['gateSHA256'] and access['windowId']==g['windowId'] and access['ownerAccessApproved'] is True
    assert access['sourceThreadId']=='01a18663-48af-7b80-9fac-408bfa98e2fb' and access['sourceMessageId']
    validate_actual_owner(access, private(directory/'actual-owner-wire.json'))
    if approval is not None:
        validate_approval_origin(access, approval, g['phase'])
        validate_actual_owner(approval, private(directory/('owner-'+g['phase'].lower()+'-wire.json')), g['phase'], q['plan']['command'])
    binary=directory/'c02-host.mjs';s=binary.lstat()
    assert stat.S_ISREG(s.st_mode) and not binary.is_symlink() and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size<=8388608
    assert hashlib.sha256(binary.read_bytes()).hexdigest()==C02_HOST_SHA
    import subprocess
    assert hashlib.sha256(subprocess_bytes(g['beforeContainerId'], 'mcp/c02-host.mjs')).hexdigest()==C02_HOST_SHA
    subprocess.run(['docker','exec','-i',g['beforeContainerId'],'node','--input-type=module','-e',"import fs from 'node:fs';const m=await import(process.argv[1]);m.c02HostConfig.parse(JSON.parse(fs.readFileSync(0,'utf8')));",'file:///app/mcp/c02-host.mjs'],input=g['authQaConfig'],text=True,capture_output=True,check=True,timeout=15)
    assert q['expiresAt'] == g['deadlineMs'] and int(time.time() * 1000) < g['deadlineMs'] - 120000
    lock = os.open('/run/lock/otr-universal-finite-service.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    st = os.fstat(lock)
    assert stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    trace['acquiredAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        old = inspect('otr-dev-backend')
        assert old['Id'] == g['beforeContainerId'] and old['Image'] == g['candidateImage'] and old['State']['Health']['Status'] == 'healthy'
        assert digest(old['Config']) == g['beforeConfigSHA256'] and digest(old['HostConfig']) == g['beforeHostConfigSHA256']
        e = environment(old)
        assert len(e) == len(old['Config']['Env']) and digest(e) == g['beforeEnvironmentSHA256'] and READ not in e and 'OTR_DEV_MCP_WRITE_QA_CONFIG' not in e
        assert e.get(WRITE) == g.get('beforeAuthQaConfig')
        if g['phase'] == 'EMPTY':
            assert WRITE not in e and old['Id'] == g['defaultContainerId']
        else:
            same_window(json.loads(e[WRITE]),q,g['phase'])
        assert old['HostConfig'] == g['expectedHostConfig'] and mounts(old) == sorted(tuple(m) for m in g['expectedMounts'])
        for path, h in {**g['beforeConfigHashes'], **g['mountedFileHashes']}.items():
            assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == h
        for filename, h in g['bundles'].items():
            assert hashlib.sha256(subprocess_bytes(old['Id'], filename)).hexdigest() == h
        # All other environment values stay inside the existing Host process.
        config = dict(old['Config'], Env=[v for v in old['Config']['Env'] if not v.startswith(WRITE + '=')] + [WRITE + '=' + g['authQaConfig']])
        assert digest(config) == g['expectedConfigSHA256']
        retained_created = g.get('retainedCreatedCandidateId')
        if retained_created is not None:
            assert isinstance(retained_created, str) and len(retained_created) == 64
            new = inspect(retained_created)
            assert new['Id'] == retained_created and new['Name'] == '/' + g['containerName']
            assert new['State']['Status'] == 'created' and not new['State']['Running']
            new_id = retained_created
        else:
            client = Docker('localhost', timeout=20)
            client.request('POST', '/v1.44/containers/create?name=' + g['containerName'], json.dumps({**config, 'HostConfig': old['HostConfig']}), {'Content-Type':'application/json'})
            response = client.getresponse(); raw = response.read(); client.close()
            assert response.status == 201, 'CREATE_UNKNOWN_RECONCILE_NO_RETRY'
            new_id = json.loads(raw)['Id']; new = inspect(new_id)
        assert new['Config'] == config and new['Image'] == old['Image'] and new['State']['Status'] == 'created'
        assert same_host(new, old) and mounts(new) == mounts(old)
        # The timer reads this pointer; original default and T/D never move.
        publish_close_plan(g, directory, new_id, digest(config))
        changed = False
        try:
            assert int(time.time() * 1000) < g['deadlineMs'] - 120000
            require_c02_timers(g, directory)
            changed = True
            call(['docker','stop','--time','10',old['Id']]); assert not inspect(old['Id'])['State']['Running']
            call(['docker','rename',old['Id'],g['backupName']])
            call(['docker','rename',new_id,'otr-dev-backend'])
            assert int(time.time() * 1000) < g['deadlineMs'] - 120000
            call(['docker','start',new_id])
            end = time.monotonic() + 40
            while time.monotonic() < end:
                running = inspect(new_id)
                if running['State'].get('Health',{}).get('Status') == 'healthy': break
                if running['State']['Status'] in ('dead','exited'): raise RuntimeError('CANDIDATE_EXITED')
                time.sleep(1)
            else: raise RuntimeError('CANDIDATE_HEALTH_TIMEOUT')
            assert running['Config'] == config and same_host(running, old) and mounts(running) == mounts(old)
            for filename, h in g['bundles'].items():
                assert hashlib.sha256(subprocess_bytes(new_id, filename)).hexdigest() == h
            verify_http(g)
            return {'status':'MCP_SLICE1_CONFIG_CAS_HEALTHY','phase':g['phase'],'containerId':new_id,'defaultContainerId':g['defaultContainerId'],'configSHA256':digest(config),'deadlineMs':g['deadlineMs'],'closePlanPublishedBeforeServe':True,'approvalRecordSHA256':g.get('approvalRecordSHA256'),'deliveryTrace':trace}
        except Exception:
            if changed:
                if inspect(new_id)['State']['Running']: call(['docker','stop','--time','10',new_id])
                if inspect(new_id)['Name'] == '/otr-dev-backend': call(['docker','rename',new_id,g['containerName']+'-failed'])
                retained = inspect(old['Id'])
                if retained['Name'] != '/otr-dev-backend': call(['docker','rename',old['Id'],'otr-dev-backend'])
                publish_close_plan(g, directory, old['Id'], digest(old['Config']))
                if not inspect(old['Id'])['State']['Running']: call(['docker','start',old['Id']])
            else:
                publish_close_plan(g, directory, old['Id'], digest(old['Config']))
            raise
    finally:
        trace['mutationFinishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        fcntl.flock(lock, fcntl.LOCK_UN); os.close(lock)
        trace['releasedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()

def subprocess_bytes(cid, filename):
    import subprocess
    assert filename in ('server-capture.mjs', 'server.mjs', 'mcp/runtime.mjs', 'auth-consent/app.js', 'mcp/c02-host.mjs')
    return subprocess.check_output(['docker', 'exec', cid, 'cat', '/app/' + filename], stderr=subprocess.PIPE, timeout=10)

if __name__ == '__main__':
    path = Path(sys.argv[1])
    raw = private(path)
    assert path.name in ('empty-cas.json', 'create-cas.json', 'edit-cas.json') and hashlib.sha256(raw).hexdigest() == sys.argv[2]
    try:
        print(json.dumps(run(json.loads(raw), path.parent)))
    except Exception as e:
        print(json.dumps({'status':'CONFIG_CAS_UNCONFIRMED','errorClass':type(e).__name__}))
        raise SystemExit(1)
