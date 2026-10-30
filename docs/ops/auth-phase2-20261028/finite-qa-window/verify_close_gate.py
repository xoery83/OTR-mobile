"""Offline exact before/after metadata comparison; no credentials or DB connection."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('before',type=Path);p.add_argument('after',type=Path);a=p.parse_args()
def load(path):
    data=json.loads(path.read_text());return data['rows'][0]['auth_gate'] if 'rows' in data else data
before,after=load(a.before),load(a.after)
for data in [before,after]:assert data['phase']=='postinstall' and data['database']=='postgres' and data['transactionReadOnly']=='on'
for key in ['schemaExists','sourceGuard','parents','roles','memberships','businessRelations','schemaOwner','schemaAcl','tables','privateTableAccess','policy','counts']:
    assert before[key]==after[key],'UNRELATED_METADATA_CHANGED:'+key
assert after['policy']=={'singleton':True,'enabled':False,'policy_version':'otr.auth.fileless-p1.unpriced/1'}
name='close_qa_policy';new=[r for r in after['functions'] if r['name']==name]
assert len(before['functions'])==24 and len(after['functions'])==25 and len(new)==1
assert [r for r in after['functions'] if r['name']!=name]==before['functions']
expected=json.loads(Path(__file__).with_name('CLOSE_HELPER_GATE.json').read_text())['expectedFunction']
assert new[0]['owner']==expected['owner'] and new[0]['securityDefiner'] is True and new[0]['config']==expected['config']
acl=lambda s:sorted(s.strip('{}').split(','))
assert acl(new[0]['acl'])==acl(expected['acl'])
helper=after['close_helper'];assert helper['md5']==expected['definitionMd5'] and helper['gatewayExecute'] is True and helper['writerExecute'] is False
new_api=[r for r in after['privateApiRoleExecute'] if r['function']==name]
assert len(new_api)==3 and all(not r['execute'] for r in new_api)
assert [r for r in after['privateApiRoleExecute'] if r['function']!=name]==before['privateApiRoleExecute']
assert len(after['privateTableAccess'])==30 and all(not any(v for k,v in r.items() if k not in ['role','table']) for r in after['privateTableAccess'])
print(json.dumps({'status':'EXACT_NEGATIVE_CLOSE_HELPER_INSTALLED_CLOSED','newPrivateFunctions':1,'newDirectExecuteGrants':1,'otherPermissionsChanged':False,'policyEnabled':False,'nativeOrProviderE2e':False,'externalDevProjectVerification':'ROOT_REQUIRED'}))
