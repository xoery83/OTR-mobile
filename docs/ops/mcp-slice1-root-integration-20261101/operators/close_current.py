"""Use the pinned version-neutral restore against the latest finite CAS identity."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from config_cas import GATE, private
from deploy import plan_path

directory = Path(sys.argv[1])
plan = plan_path(directory / 'deploy-plan.json')
pointer = json.loads(private(directory / 'close-current.json'))
assert pointer['gateSHA256'] == GATE and pointer['windowId'] == directory.name.removeprefix('auth-consumer-write-qa-')
assert hashlib.sha256(private(plan)).hexdigest() == pointer['planSHA256']
restore = directory / 'restore.py'
assert hashlib.sha256(private(restore)).hexdigest() == '0389ac4417397f4e61391238c9b731e851c28dcb6beab5a78127aa9527da3367'
subprocess.run([sys.executable, str(restore), str(plan), pointer['planSHA256'], pointer['currentContainerId']], check=True, timeout=100)
