"""Offline bind Root's actual activation xmin; never infers or enables policy."""
import argparse,hashlib,json,os,re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('plan',type=Path);p.add_argument('plan_sha256');p.add_argument('active_policy_xmin');a=p.parse_args()
raw=a.plan.read_bytes();assert hashlib.sha256(raw).hexdigest()==a.plan_sha256
plan=json.loads(raw);assert re.fullmatch(r'[0-9]{1,10}',a.active_policy_xmin) and int(a.active_policy_xmin)<=4294967295
text=(a.plan.parent/'policy-close.sql.in').read_text().replace('@WINDOW_ID@',plan['windowId']).replace('@ACTIVE_POLICY_XMIN@',a.active_policy_xmin);assert '@' not in text
fd=os.open(a.plan.parent/'policy-close.sql',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w') as f:f.write(text);f.flush();os.fsync(f.fileno())
print(json.dumps({'status':'CLOSE_SQL_FROZEN_NOT_EXECUTED','sha256':hashlib.sha256(text.encode()).hexdigest()}))
