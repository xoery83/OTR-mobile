"""Seal and transport only the approved cleanup operator projection; never renew roles."""
import argparse
import base64
import datetime as dt
import json
from pathlib import Path
import universal_cleanup_only as c
from universal_scope_close import SqlTransport
from universal_continuous_runtime_ports import remote_python
from universal_continuous_transition import canonical, sha, write_private
from universal_continuous_sql_ports import observe_sql


def prepare(directory, auth_receipt):
    directory=Path(directory)
    if directory.exists():raise ValueError('FRESH_CLEANUP_DIRECTORY_REQUIRED')
    directory.mkdir(mode=0o700)
    baseline=json.loads((Path(__file__).resolve().parent/'__fixtures__/universal_cleanup_run7.json').read_text())
    if sha(canonical(baseline))!=c.BASELINE_SHA:raise ValueError('EXACT_RUN7_BASELINE_REQUIRED')
    sql=SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase','/Users/xoery/Project/otr-mobile-canonical',str(directory))
    state=sql(c.roles_sql())['rows'][0]['state'];o=sql(observe_sql(baseline))['rows'][0]['observation']
    if not c.closed_roles(state):raise ValueError('EXACT_CLOSED_ROLES_REQUIRED')
    for i in range(4):c.assert_phase(o,i,False)
    oldids={x['command']['request_id'] for x in baseline['providerControl']['closeCommands']}
    if any(x['command_id'] in oldids for x in o['audits']):raise ValueError('OLD_CLOSE_OUTCOME_RECONCILE_REQUIRED')
    normal=json.loads(Path(auth_receipt).read_text())
    start=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)+dt.timedelta(seconds=60)
    z=lambda x:x.isoformat().replace('+00:00','Z')
    end=z(start+dt.timedelta(seconds=900))
    if normal['status']!='NORMAL_OWN_REFRESH_USER_VERIFIED' or normal['accountId']!=c.ACTOR or c.instant(normal['expiresAt'])<c.instant(end):raise ValueError('NORMAL_QA_AUTH_COVERAGE_REQUIRED')
    security=next(g for g in state['grants'] if g['permission']=='SECURITY_ADMIN')
    p=c.build(baseline,security,normal['verifiedAt'],z(start),end,z(start+dt.timedelta(seconds=480)))
    payload=canonical(p);p['operatorPlanSHA256']=sha(payload);c.validate(p,execution=True)
    write_private(directory/'plan.json',p);write_private(directory/'fresh-readonly-preimage.json',{'state':state,'observation':o})
    oldsha=baseline['operatorPlanSHA256'];newsha=sha(payload)
    source='oldsha='+repr(oldsha)+'\nnewsha='+repr(newsha)+'\npayload='+repr(base64.b64encode(payload).decode())+'\n'+r'''
import os,json,hashlib,base64,stat
root='/opt/otr/dev-backend/private/universal-stage2-continuous'
p=root+'/plan.json';fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as f:
 s=os.fstat(f.fileno());actual=hashlib.sha256(f.read()).hexdigest()
assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and s.st_mode&511==384
assert actual==oldsha
operator=root+'/universal-continuous-operator.mjs'
assert hashlib.sha256(open(operator,'rb').read()).hexdigest()=='1826811b424f9210e713f8f06688202a25ed281e6207af436f43c758e6a7faaf'
b=base64.b64decode(payload);assert hashlib.sha256(b).hexdigest()==newsha
t=p+'.cleanup-'+newsha;out=os.open(t,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(out,'wb') as f:f.write(b)
assert hashlib.sha256(open(p,'rb').read()).hexdigest()==oldsha
os.replace(t,p)
print(json.dumps({'status':'CLEANUP_OPERATOR_PROJECTION_SEALED','sha256':hashlib.sha256(open(p,'rb').read()).hexdigest(),'operatorUnchanged':True}))
'''
    receipt=remote_python(source)
    if receipt.get('sha256')!=newsha:raise ValueError('OPERATOR_TRANSFER_UNCONFIRMED_NO_RETRY')
    write_private(directory/'operator-transfer.json',receipt)
    result={'status':'PREPARED_NOT_ACTIVATED','planSHA256':sha(canonical(p)),'operatorPlanSHA256':newsha,'startsAt':p['startsAt'],'watchdogCloseAt':p['closeAt'],'expiresAt':p['adminControl']['expiresAt'],'operator':'Coordinator','rollbackOwner':'Coordinator'}
    write_private(directory/'binding.json',result);return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--prepare-approved-once',action='store_true',required=True);parser.add_argument('--run-dir',required=True);parser.add_argument('--normal-auth-receipt',required=True);args=parser.parse_args()
    print(json.dumps(prepare(args.run_dir,args.normal_auth_receipt)))
