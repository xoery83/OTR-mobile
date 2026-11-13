"""Pure plan construction from fresh Host snapshots; never copies Env into a plan."""
from config_cas import GATE, WRITE, READ, HELPER_SHA, validate_config, same_host, same_window
from deploy import digest, environment, mounts

def make_plan(request, current, default, template, now):
    assert request['gateSHA256'] != '0'*64 and request['phase'] in ('EMPTY', 'CREATE', 'EDIT')
    q = validate_config(request['authQaConfig'], request['clientProfile'], request['windowStartedAtMs'],
                        request['phase'], request.get('ownerApproval'), now=now)
    assert current['Id'] == request['expectedCurrentContainerId']
    assert digest(current['Config']) == request['expectedCurrentConfigSHA256']
    assert default['Id'] == request['defaultContainerId'] and digest(default['Config']) == request['defaultConfigSHA256']
    assert current['Image'] == default['Image'] and current['State']['Health']['Status'] == 'healthy'
    assert same_host(current, default) and mounts(current) == mounts(default)
    e, baseline = environment(current), environment(default)
    assert READ not in e and WRITE not in baseline and READ not in baseline
    assert {k:v for k,v in e.items() if k != WRITE} == baseline
    assert {k:v for k,v in current['Config'].items() if k != 'Env'} == {k:v for k,v in default['Config'].items() if k != 'Env'}
    if request['phase'] == 'EMPTY':
        assert current['Id'] == default['Id'] and WRITE not in e
    else:
        same_window(__import__('json').loads(e[WRITE]),q,request['phase'])
    assert q['plan']['gateSHA256']==request['gateSHA256']
    window = request['windowId']
    assert len(window) == 32 and all(c in '0123456789abcdef' for c in window)
    default_backup = 'otr-dev-backend-before-auth-write-' + window
    restore = {
        'beforeContainerId':default['Id'], 'beforeImage':default['Image'], 'candidateImage':default['Image'],
        'beforeConfigSHA256':digest(default['Config']), 'expectedHostConfig':default['HostConfig'],
        'expectedMounts':mounts(default), 'beforeConfigHashes':template['beforeConfigHashes'],
        'mountedFileHashes':template['mountedFileHashes'], 'restoreHelperSHA256':HELPER_SHA,
        'backupName':default_backup,
    }
    config = dict(current['Config'], Env=[s for s in current['Config']['Env'] if not s.startswith(WRITE+'=')] + [WRITE+'='+request['authQaConfig']])
    g = {
        'gateSHA256':request['gateSHA256'], 'accessApprovalSHA256':request['accessApprovalSHA256'], 'windowId':window, 'phase':request['phase'], 'clientProfile':request['clientProfile'],
        'authQaConfig':request['authQaConfig'], 'windowStartedAtMs':request['windowStartedAtMs'], 'deadlineMs':q['expiresAt'],
        'beforeContainerId':current['Id'], 'defaultContainerId':default['Id'], 'candidateImage':default['Image'],
        'beforeConfigSHA256':digest(current['Config']), 'beforeHostConfigSHA256':digest(current['HostConfig']),
        'beforeEnvironmentSHA256':digest(e), 'beforeAuthQaConfig':e.get(WRITE),
        'expectedConfigSHA256':digest(config), 'expectedHostConfig':current['HostConfig'], 'expectedMounts':mounts(default),
        'beforeConfigHashes':template['beforeConfigHashes'], 'mountedFileHashes':template['mountedFileHashes'],
        'bundles':template['bundles'], 'protectedRoutes':template['protectedRoutes'], 'restoreBaseline':restore,
        'containerName':'otr-mcp-c02-'+request['phase'].lower()+'-'+window,
        'backupName':default_backup if request['phase']=='EMPTY' else 'otr-mcp-c02-'+('empty' if request['phase']=='CREATE' else 'create')+'-'+window,
    }
    if request['phase'] != 'EMPTY':
        g['approvalRecordSHA256'] = request['approvalRecordSHA256']
    return g
