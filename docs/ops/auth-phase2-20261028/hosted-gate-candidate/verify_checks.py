"""Verify Root's saved READ ONLY results. No database connection or credentials."""
import json
from pathlib import Path
import sys

def load(path):
    raw=json.loads(Path(path).read_text())
    return raw['rows'][0]['auth_gate'] if 'rows' in raw else raw

def acl(value):
    return sorted((value or '{}').strip('{}').split(',')) if value else []

def verify(expected, pre, post=None):
    for phase,data in [('preflight',pre),('postinstall',post)]:
        if data is None: continue
        assert data['phase']==phase and data['transactionReadOnly']=='on', 'READ_ONLY_BOUNDARY_REQUIRED'
        assert data['database']=='postgres', 'DEV_DATABASE_NAME_CHANGED_EXTERNAL_PROJECT_CHECK_STILL_REQUIRED'
        assert data['schemaExists']==(phase=='postinstall'), 'UNEXPECTED_PRIVATE_SCHEMA_STATE'
        assert data['sourceGuard']==expected['sourceGuard'], 'SOURCE_DEPENDENCY_CHANGED'
        actual={r['signature']:r for r in data['parents']}
        assert set(actual)==set(expected['parents']), 'PUBLIC_PARENT_SET_CHANGED'
        for signature,want in expected['parents'].items():
            got=actual[signature]
            for field in ['oid','owner','config','securityDefiner']:
                assert got[field]==want[field], 'PUBLIC_PARENT_METADATA_CHANGED:'+signature+':'+field
            assert got['md5']==want['beforeMd5' if phase=='preflight' else 'afterMd5'], 'PUBLIC_PARENT_HASH_CHANGED:'+signature
            assert acl(got['acl'])==want['beforeAcl' if phase=='preflight' else 'afterAcl'], 'PUBLIC_PARENT_ACL_CHANGED:'+signature
        assert len(data['roles'])==8, 'OWNING_ROLE_SET_CHANGED'
    if post is not None:
        for field in ['roles','memberships','businessRelations']:
            assert pre[field]==post[field], 'UNRELATED_PERMISSION_BASELINE_CHANGED:'+field
        assert post['schemaOwner']=='postgres', 'PRIVATE_SCHEMA_OWNER_CHANGED'
        assert acl(post['schemaAcl'])==expected['schemaAcl'], 'PRIVATE_SCHEMA_ACL_CHANGED'
        tables=post['tables']
        assert sorted(r['name'] for r in tables)==sorted(expected['tables']), 'PRIVATE_TABLE_SET_CHANGED'
        assert all(r['owner']=='postgres' and r['rls'] and not r['forceRls'] for r in tables), 'PRIVATE_TABLE_OWNER_OR_RLS_CHANGED'
        assert len(post['functions'])==expected['privateFunctionCount']==24, 'PRIVATE_FUNCTION_COUNT_CHANGED'
        assert all(r['owner']=='postgres' for r in post['functions']), 'PRIVATE_FUNCTION_OWNER_CHANGED'
        private={('otr_auth_guest_composite.'+r['name']):r for r in post['functions']}
        assert set(private)==set(expected['privateFunctionAcl']), 'PRIVATE_FUNCTION_SET_CHANGED'
        for name, want_acl in expected['privateFunctionAcl'].items():
            assert acl(private[name]['acl'])==want_acl, 'PRIVATE_FUNCTION_ACL_CHANGED:'+name
        assert len(post['privateTableAccess'])==30, 'PRIVATE_TABLE_ACCESS_MATRIX_INCOMPLETE'
        assert all(not any(value for key,value in row.items() if key not in ['role','table']) for row in post['privateTableAccess']), 'PRIVATE_TABLE_ACCESS_LEAK'
        assert len(post['privateApiRoleExecute'])==72, 'PRIVATE_FUNCTION_API_ROLE_MATRIX_INCOMPLETE'
        assert all(not row['execute'] for row in post['privateApiRoleExecute']), 'PRIVATE_FUNCTION_API_ROLE_EXECUTE_LEAK'
        assert post['policy']=={'singleton':True,'enabled':False,'policy_version':'otr.auth.fileless-p1.unpriced/1'}, 'INSTALL_POLICY_NOT_DEFAULT_CLOSED'
        assert len(post['counts'])==5 and all(v==0 for v in post['counts'].values()), 'INSTALL_CREATED_UNEXPECTED_ADOPTION_DATA'
    return {'status':'PREFLIGHT_MATCH' if post is None else 'POST_INSTALL_MATCH_DEFAULT_CLOSED','publicParents':14,'newTables':0 if post is None else 6,'privateFunctions':0 if post is None else 24,'nativeOrProviderE2e':False,'externalProjectVerification':'ROOT_REQUIRED_SEPARATELY'}

if __name__=='__main__':
    assert len(sys.argv) in [3,4], 'expected-json preflight-raw-json [postinstall-raw-json]'
    try:
        result=verify(json.loads(Path(sys.argv[1]).read_text()),load(sys.argv[2]),load(sys.argv[3]) if len(sys.argv)==4 else None)
    except (AssertionError,KeyError,TypeError,ValueError) as error:
        print(json.dumps({'status':'CHECK_FAILED','code':str(error) if isinstance(error,AssertionError) else 'INVALID_CHECK_RESULT'}));sys.exit(1)
    print(json.dumps(result))
