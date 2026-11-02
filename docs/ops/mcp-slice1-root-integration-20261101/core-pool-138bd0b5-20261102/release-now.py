import json, sys
from pathlib import Path
sys.path.insert(0, '/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p = Path('/private/tmp/otr-core-pool-root-release-20261102')
ready = json.loads((p / 'IMAGE_READY.json').read_text())
assert ready['imageId'] == 'sha256:cdd762ea99b53fd21330dfe09df157b727b89e7a7c5e4e4da2c2487796364102'
assert ready['planSHA256'] == '082b206f42ff7ccc471e70d32e21cd5b2e07e4d0c81a1bd8af54309df524afe8'
with (p / 'DEPLOY_INTENT.json').open('x') as f:
    json.dump({'imageId': ready['imageId'], 'planSHA256': ready['planSHA256'], 'authorityActivated': False}, f)
result = remote_python('READY_AT=' + repr(ready['readyAt']) + '\n' + r'''
import hashlib,json,subprocess,datetime
from pathlib import Path
r=Path('/opt/otr/dev-backend/build/core-pool-138bd0b5-20261102')
assert hashlib.sha256((r/'release.py').read_bytes()).hexdigest()=='8efb5dccfeb5bb62eb69232bad36bab9d98a091d35d95bea188c4a214757dcc1'
assert hashlib.sha256((r/'deploy-plan.json').read_bytes()).hexdigest()=='082b206f42ff7ccc471e70d32e21cd5b2e07e4d0c81a1bd8af54309df524afe8'
requested=datetime.datetime.now(datetime.timezone.utc).isoformat()
x=subprocess.run(['python3',str(r/'release.py'),str(r/'deploy-plan.json'),'082b206f42ff7ccc471e70d32e21cd5b2e07e4d0c81a1bd8af54309df524afe8',READY_AT,requested],capture_output=True,text=True,timeout=65)
try: result=json.loads(x.stdout)
except Exception: result={'status':'DEPLOY_UNCONFIRMED_READONLY_RECONCILE_REQUIRED','exitCode':x.returncode}
(r/'DEPLOY_RESULT.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
''')
(p / 'DEPLOY_RESULT.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
