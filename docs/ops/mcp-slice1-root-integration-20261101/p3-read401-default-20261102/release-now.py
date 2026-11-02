import json, sys
from pathlib import Path
sys.path.insert(0, '/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/scripts/import')
from universal_continuous_runtime_ports import remote_python
p = Path('/private/tmp/otr-p3-mcp-read401-release-20261102')
ready = json.loads((p / 'IMAGE_READY.json').read_text())
assert ready['imageId'] == 'sha256:57bce7bb398f0508bf6dad99aaf53cac044be8f07112ca45e57c584757ffcb4d'
assert ready['planSHA256'] == 'be0587b42ea99f8d93f0cdb27a90a01d707837162be500b507822de5a0bad3aa'
with (p / 'DEPLOY_INTENT.json').open('x') as f:
    json.dump({'imageId': ready['imageId'], 'planSHA256': ready['planSHA256'], 'authorityActivated': False}, f)
result = remote_python('READY_AT=' + repr(ready['readyAt']) + '\n' + r'''
import hashlib,json,subprocess,datetime
from pathlib import Path
r=Path('/opt/otr/dev-backend/build/p3-mcp-read401-20261102')
assert hashlib.sha256((r/'release.py').read_bytes()).hexdigest()=='fff2baf06393ff11f33185b3211428781ef082f5de98365cf9f584adeaf950be'
assert hashlib.sha256((r/'deploy-plan.json').read_bytes()).hexdigest()=='be0587b42ea99f8d93f0cdb27a90a01d707837162be500b507822de5a0bad3aa'
requested=datetime.datetime.now(datetime.timezone.utc).isoformat()
x=subprocess.run(['python3',str(r/'release.py'),str(r/'deploy-plan.json'),'be0587b42ea99f8d93f0cdb27a90a01d707837162be500b507822de5a0bad3aa',READY_AT,requested],capture_output=True,text=True,timeout=65)
try: result=json.loads(x.stdout)
except Exception: result={'status':'DEPLOY_UNCONFIRMED_READONLY_RECONCILE_REQUIRED','exitCode':x.returncode}
(r/'DEPLOY_RESULT.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
''')
(p / 'DEPLOY_RESULT.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
