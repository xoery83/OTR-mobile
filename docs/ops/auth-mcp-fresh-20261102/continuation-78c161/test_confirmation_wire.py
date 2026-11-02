"""Replay actual V1/V2 wires through frozen pure validators; never execute a plan."""
import copy
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True

def deny_external_io(event, args):
    if event in {'subprocess.Popen', 'os.system', 'socket.connect', 'socket.bind'}:
        raise AssertionError('OFFLINE_ONLY_NO_HOST_OR_NETWORK')

sys.addaudithook(deny_external_io)
operators, case_directory = map(Path, sys.argv[1:3])
for name, expected in {
    'config_cas.py': '0ba00b4575b0c828ea5b6bb05d879c8f32e2a71d9602ac27ceba4980f9e9ebee',
    'prepare_cas.py': 'aac0c9940409a9eff40fe5f3e8d554ec984152f3cb74ad3511fc33249ed03a98',
}.items():
    assert hashlib.sha256((operators / name).read_bytes()).hexdigest() == expected
sys.path.insert(0, str(operators))
from config_cas import validate_config, WRITE, GATE
from prepare_cas import make_plan
from deploy import digest

v1 = json.loads((case_directory / 'MATCHED_PREVIEW_OWNER_APPROVAL.json').read_text())
v2 = json.loads((case_directory / 'MATCHED_PREVIEW_OWNER_APPROVAL_V2.json').read_text())
request = json.loads((case_directory / 'EMPTY_REQUEST.json').read_text())
empty = json.loads(request['authQaConfig'])
assert {k: v for k, v in v2.items() if k != 'clientId'} == v1
assert v2['clientId'] == empty['clientId']
confirmed = dict(empty, confirmations=[{
    'operationId': v2['operationId'], 'previewDigest': v2['previewDigest'],
}])
raw = json.dumps(confirmed)
started = request['windowStartedAtMs']
now = started + 1000  # Historical replay only; no new window or live authority.

def rejects(action):
    try:
        action()
    except AssertionError:
        return
    raise AssertionError('INVALID_WIRE_ACCEPTED')

def validate(approval):
    return validate_config(raw, 'Claude', started, 'CONFIRM', approval, now=now)

rejects(lambda: validate(v1))
assert validate(v2) == confirmed
for difference in [
    {'clientId': 'wrong'}, {'operationId': 'wrong'},
    {'previewDigest': '0' * 64}, {'ownerConfirmed': False},
]:
    rejects(lambda difference=difference: validate(dict(v2, **difference)))

# Synthetic Docker-shaped values only; no actual Host snapshot or environment.
default = {
    'Id': 'SYNTHETIC_DEFAULT', 'Image': 'SYNTHETIC_IMAGE',
    'Config': {'Env': [], 'Image': 'SYNTHETIC_IMAGE'},
    'HostConfig': {}, 'Mounts': [], 'State': {'Health': {'Status': 'healthy'}},
}
current = copy.deepcopy(default)
current['Id'] = 'SYNTHETIC_CURRENT'
current['Config']['Env'] = [WRITE + '=' + json.dumps(empty)]
base = {
    'gateSHA256': GATE, 'phase': 'CONFIRM', 'authQaConfig': raw,
    'clientProfile': 'Claude', 'windowStartedAtMs': started,
    'windowId': request['windowId'], 'ownerApproval': v2,
    'expectedCurrentContainerId': current['Id'],
    'expectedCurrentConfigSHA256': digest(current['Config']),
    'defaultContainerId': default['Id'],
    'defaultConfigSHA256': digest(default['Config']),
    'approvalRecordSHA256': hashlib.sha256(
        (case_directory / 'MATCHED_PREVIEW_OWNER_APPROVAL_V2.json').read_bytes()
    ).hexdigest(),
}
template = dict(beforeConfigHashes={}, mountedFileHashes={}, bundles={}, protectedRoutes=[])
rejects(lambda: make_plan(dict(base, ownerApproval=v1), current, default, template, now))
plan = make_plan(base, current, default, template, now)
assert plan['phase'] == 'CONFIRM' and plan['deadlineMs'] == empty['expiresAt']
assert json.loads(plan['authQaConfig'])['confirmations'] == confirmed['confirmations']
print(json.dumps({
    'status': 'OFFLINE_ACTUAL_WIRE_INTEROP_PASS',
    'v1': 'REJECTED_MISSING_CLIENT_ID', 'v2': 'VALIDATED_AND_PURE_PLAN_BUILT',
    'negativeCases': ['wrongClient', 'wrongOperation', 'wrongDigest', 'unconfirmedOwner'],
    'externalIoDenied': True, 'planExecuted': False, 'newAuthority': False,
}))
