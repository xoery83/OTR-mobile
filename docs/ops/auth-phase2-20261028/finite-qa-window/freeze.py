"""Offline only. Freeze expiry after a fresh GUI READY; no Host/SQL calls."""
import argparse,datetime as dt,hashlib,json,os,re,sys,uuid
from pathlib import Path
sys.dont_write_bytecode=True
from runtime import ACTOR,GUEST,canonical,instant,validate
ROOT=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--ready-at',required=True);p.add_argument('--expires-at',required=True);p.add_argument('--closed-policy-xmin',required=True);p.add_argument('--close-bundle',type=Path,required=True);a=p.parse_args()
assert re.fullmatch(r'[0-9]{1,10}',a.closed_policy_xmin) and int(a.closed_policy_xmin)<=4294967295
now=dt.datetime.now(dt.timezone.utc).timestamp();assert 0<=now-instant(a.ready_at)<=120 and 0<instant(a.expires_at)-now<=1800
window=str(uuid.uuid4());out=a.out.resolve();assert str(out).startswith('/private/tmp/')
out.mkdir(mode=0o700);os.chmod(out,0o700)
bundle=a.close_bundle.read_bytes();assert 0<len(bundle)<=2097152
plan={'project':'tuqigdxrvrerfewsxqgm','windowId':window,'accountId':ACTOR,'sourceGuestLocalId':GUEST,'readyAt':a.ready_at,'expiresAt':a.expires_at,'root':'/opt/otr/dev-backend/releases/auth-qa-'+window,'baseline':json.loads((ROOT/'baseline.json').read_text()),'runtimeSHA256':hashlib.sha256((ROOT/'runtime.py').read_bytes()).hexdigest(),'closeBundleSHA256':hashlib.sha256(bundle).hexdigest(),'closeHelperGate':json.loads((ROOT/'CLOSE_HELPER_GATE.json').read_text())['gateId'],'closedPolicyXmin':a.closed_policy_xmin}
validate(plan,now=now,starting=True)
materials={'runtime.py':(ROOT/'runtime.py').read_bytes(),'close-control.cjs':bundle,'plan.json':canonical(plan),'policy-close.sql.in':(ROOT/'policy-close.sql.in').read_bytes(),'policy-verify.sql':(ROOT/'policy-verify.sql').read_bytes()}
opened=(ROOT/'policy-open.sql.in').read_text().replace('@WINDOW_ID@',window).replace('@EXPIRES_AT@',a.expires_at).replace('@CLOSED_POLICY_XMIN@',a.closed_policy_xmin)
assert '@' not in opened
materials['policy-open.sql']=opened.encode()
for name,raw in materials.items():
    fd=os.open(out/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
manifest={n:hashlib.sha256(raw).hexdigest() for n,raw in materials.items()};(out/'HASHES.json').write_text(json.dumps(manifest,indent=2)+'\n');os.chmod(out/'HASHES.json',0o600)
print(json.dumps({'status':'FROZEN_NOT_EXECUTED','directory':str(out),'hostRoot':plan['root'],'planSHA256':manifest['plan.json'],'expiresAt':a.expires_at,'sqlSessionIntent':{'otr.auth.approved_project_ref':plan['project'],'otr.auth.approved_gate_id':'fd671463e04c095197e20faaba223ed26eb1ea99d2ad64b207bd06aaaaefde5c','otr.auth.qa_window':window},'closeHelperGateMustBeApprovedAndInstalled':plan['closeHelperGate']}))
