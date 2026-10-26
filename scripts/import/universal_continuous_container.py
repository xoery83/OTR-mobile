"""Exact approved two-bind deployment payload. Raw inspect stays in memory."""
import copy
import hashlib
import json

IMAGE = 'sha256:109caf2cc18a710aa28f81951a7971a1cee182561c7281649cea2f5996a37926'
BASE_IMAGE = 'sha256:8d9a81d58c0d2fb4cb888315b30db066065ad6785c813fba791585e62516ba67'
canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
sha = lambda value: hashlib.sha256(value).hexdigest()

ORIGINAL = '2bdbf4af012c1660d37508f32f81fc3e04573c2e22e486c583231ff445bc3bf6'
CONFIG_SHA = '992e98c86a6c412eafd0d175f131fd5210e58639d41d691f568de901d1f0424a'
HOST_SHA = 'df2d008d29c14129954ca39acc650d5b0ca58dfdee1a01d57f9ead60532ebce5'
RUNTIME = '/opt/otr/dev-backend/private/universal-stage2-continuous/runtime.json'
CUSTODY = '/opt/otr/dev-backend/private/universal-custody-2d964c16-6bc6-423b-a827-740efa133dab'
RUNTIME_SHA = 'd0ca82a7dfc9d1690903683434ad79a87c57e211f75d5e88dd0085cad8e38bc6'


def payload(snapshot, provider_key):
    if (snapshot['Id'] != ORIGINAL or snapshot['Image'] != BASE_IMAGE
            or sha(canonical(snapshot['Config'])) != CONFIG_SHA
            or sha(canonical(snapshot['HostConfig'])) != HOST_SHA
            or snapshot['State'].get('Health', {}).get('Status') != 'healthy'):
        raise ValueError('EXACT_HEALTHY_BASELINE_REQUIRED')
    if not isinstance(provider_key, str) or not provider_key or any(c.isspace() for c in provider_key):
        raise ValueError('EXISTING_PROVIDER_CREDENTIAL_REQUIRED')
    config, host = copy.deepcopy(snapshot['Config']), copy.deepcopy(snapshot['HostConfig'])
    env = dict(value.split('=', 1) for value in config['Env'])
    if any(key.startswith('OTR_DEV_UNIVERSAL_') for key in env):
        raise ValueError('BASELINE_UNIVERSAL_SELECTION_DRIFT')
    if env.get('OTR_DEV_BACKEND_NETWORK_MODE') != 'host' or env.get('OTR_DEV_SUPABASE_URL') != 'https://tuqigdxrvrerfewsxqgm.supabase.co':
        raise ValueError('DEV_NETWORK_REQUIRED')
    env.update(OTR_DEV_UNIVERSAL_CONTINUOUS_HOST='enabled', OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT='enabled',
               OTR_DEV_UNIVERSAL_RUNTIME_SHA256=RUNTIME_SHA, OTR_DEV_DEEPSEEK_API_KEY=provider_key)
    config['Env'] = [key + '=' + value for key, value in env.items()]
    config['Image'] = IMAGE
    bindings = host.get('Binds') or []
    mounts = host.get('Mounts') or []
    if (len(bindings) + len(mounts) != 4
            or any('/var/lib/otr/universal-custody' in value or '/run/otr/universal-runtime.json' in value for value in bindings)
            or any(value['Target'] in ('/var/lib/otr/universal-custody', '/run/otr/universal-runtime.json') for value in mounts)):
        raise ValueError('EXACT_FOUR_MOUNT_PREIMAGE_REQUIRED')
    host['Binds'] = bindings + [CUSTODY + ':/var/lib/otr/universal-custody:rw', RUNTIME + ':/run/otr/universal-runtime.json:ro']
    return {**config, 'HostConfig': host}


def safe_projection(snapshot):
    return {'containerId': snapshot['Id'], 'imageId': snapshot['Image'],
            'configSHA256': sha(canonical(snapshot['Config'])),
            'hostConfigSHA256': sha(canonical(snapshot['HostConfig'])),
            'mountsSHA256': sha(canonical(sorted(snapshot['Mounts'], key=lambda m: (m['Destination'], m['Source'])))),
            'healthy': snapshot['State'].get('Health', {}).get('Status') == 'healthy'}
