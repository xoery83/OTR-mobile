"""Package an exact DEV approval candidate. No network, credentials or SQL execution."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[4]
LOCAL = ROOT / 'docs/ops/auth-phase1-20261028/composite-publication-candidate'
sys.dont_write_bytecode = True
sys.path.insert(0, str(LOCAL))
from principal_patch import render, SIGNATURES

PROJECT = 'tuqigdxrvrerfewsxqgm'
SOURCE_GUARD_MD5 = '6c7ef0d85cfd8893796ccc53e31f51f0'
PARTS = ['staging.local.sql', 'terminal.local.sql', 'authority.local.sql',
         'receipt-journal.local.sql', 'publication.local.sql']

def digest(value):
    return hashlib.sha256(value).hexdigest()

def body(value):
    assert value.startswith('-- ') and '\nBEGIN;\n' in value
    prefix, remaining = value.split('END $$;', 1)
    assert "current_database() !~ '^otr_auth_composite_[a-f0-9]{12}$'" in prefix
    assert "'LOCAL_DISPOSABLE'" in prefix
    assert remaining.rstrip().endswith('COMMIT;')
    return remaining.rstrip()[:-len('COMMIT;')].strip()

def package(parent):
    parent = parent.resolve()
    assert parent.is_relative_to(Path('/private/tmp'))
    source = parent / 'catalog.raw.json'
    assert source.stat().st_mode & 0o077 == 0
    catalog = json.loads(source.read_text())['rows'][0]['catalog']
    assert catalog['transactionReadOnly'] == 'on'
    dependency = catalog['sourceGuard']
    assert dependency['md5'] == SOURCE_GUARD_MD5 and str(dependency['oid']) == '66410'
    assert dependency['owner'] == 'postgres'
    rows = catalog['functions']
    assert len(rows) == 14 and {r['signature'] for r in rows} == set(SIGNATURES)
    definitions = {r['signature']: r['definition'] for r in rows}
    for row in rows:
        assert row['owner'] == 'postgres'
        assert digest(row['definition'].encode()) == row['sha256']
    patch, preimages = render(definitions)
    materials = {name: (LOCAL / name).read_bytes() for name in PARTS}
    assert b"VALUES(true,false,'otr.auth.fileless-p1.unpriced/1')" in materials['authority.local.sql']
    inputs = {name: digest(value) for name, value in materials.items()}
    inputs['principal_patch.py'] = digest((LOCAL / 'principal_patch.py').read_bytes())
    manifest = {
        'status': 'OWNER_APPROVAL_CANDIDATE_NOT_EXECUTED',
        'projectRef': PROJECT,
        'sourceCommit': '41bf461e',
        'policyAtInstall': 'CLOSED',
        'runtimeAtInstall': 'UNMOUNTED_OR_CLOSED',
        'sourceGuardDependency': dependency | {'source': 'fresh Auth READ ONLY catalog; Root approved installed version; not patched by Auth'},
        'publicParents': [{k: r[k] for k in ['signature', 'oid', 'owner', 'acl', 'config', 'securityDefiner', 'sha256']} | {'beforeMd5': preimages[r['signature']]['beforeMd5'], 'afterMd5': preimages[r['signature']]['afterMd5']} for r in rows],
        'inputs': inputs,
        'rendererSha256': digest(Path(__file__).read_bytes()),
        'scope': 'New private Adoption schema/tables/RLS/functions, exact14 existing owning function patches and enumerated EXECUTE deltas; no new roles, role membership, business table grants or production access.',
        'activation': 'NOT included. Runtime mount and finite DEV E2E activation need the exact approved execution scope; commercial enforcement stays disabled.',
        'rollback': 'Close HTTP mount and private policy; retain immutable evidence/source. No DROP or data cleanup. Public-function structural inverse requires separate exact postimage/ACL verification.',
    }
    gate_id = digest(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode())
    source_signature = dependency['signature']
    source_acl = dependency['acl'].replace("'", "''")
    guards = [f"""DO $otr_auth_gate$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM '{PROJECT}'
 OR current_setting('otr.auth.approved_gate_id',true) IS DISTINCT FROM '{gate_id}'
 THEN RAISE EXCEPTION 'AUTH_EXACT_OWNER_APPROVED_DEV_GATE_REQUIRED';END IF;
 IF md5(pg_get_functiondef('{source_signature}'::regprocedure)) IS DISTINCT FROM '{SOURCE_GUARD_MD5}'
 OR '{source_signature}'::regprocedure::oid<>66410
 OR (SELECT pg_get_userbyid(proowner)<>'postgres' OR coalesce(proacl::text,'')<>'{source_acl}' FROM pg_proc WHERE oid=66410)
 THEN RAISE EXCEPTION 'AUTH_SOURCE_DEPENDENCY_CHANGED';END IF;
END $otr_auth_gate$;"""]
    for row in rows:
        signature = row['signature']
        quoted_acl = row['acl'].replace("'", "''")
        guards.append(f"""DO $otr_auth_parent$ BEGIN
 IF md5(pg_get_functiondef('{signature}'::regprocedure)) IS DISTINCT FROM '{preimages[signature]['beforeMd5']}'
 OR '{signature}'::regprocedure::oid<>{row['oid']}
 OR (SELECT pg_get_userbyid(proowner)<>'postgres' OR coalesce(proacl::text,'')<>'{quoted_acl}' FROM pg_proc WHERE oid='{signature}'::regprocedure)
 THEN RAISE EXCEPTION 'AUTH_EXACT_PARENT_OR_ACL_CHANGED';END IF;
END $otr_auth_parent$;""")
    sql = '\n'.join(['-- OWNER APPROVAL CANDIDATE ONLY. Root is the sole Hosted SQL writer.',
        '-- Set approved project/gate settings only after explicit Owner approval and external DEV target verification.',
        'BEGIN;', "SET LOCAL lock_timeout='5s';", "SET LOCAL statement_timeout='120s';", *guards,
        *[body(materials[name].decode()) for name in PARTS], body(patch),
        "DO $closed$ BEGIN IF NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.policy WHERE singleton AND NOT enabled) THEN RAISE EXCEPTION 'AUTH_INSTALL_MUST_REMAIN_CLOSED';END IF;END $closed$;", 'COMMIT;', ''])
    assert sql.count('\nBEGIN;') == 1 and sql.count('\nCOMMIT;') == 1
    assert 'LOCAL_DISPOSABLE' not in sql and 'DROP SCHEMA' not in sql
    manifest['gateId'] = gate_id
    manifest['installSha256'] = digest(sql.encode())
    manifest['privateTables'] = re.findall(r'CREATE TABLE (otr_auth_guest_composite\.[a-z_]+)', sql)
    manifest['newFunctionNames'] = sorted(set(re.findall(r'CREATE FUNCTION (otr_auth_guest_composite\.[a-z_]+)', sql)))
    manifest['executeDeltas'] = re.findall(r'GRANT (?:EXECUTE|USAGE)[\s\S]*?;', sql)
    granted = [s for s in SIGNATURES if not any(x in s for x in ['trip_sustained','receipt_guard','read_state_guard','guard_write'])]
    manifest['publicDirectExecuteAdditions'] = [r['signature'] for r in rows if r['signature'] in granted and 'otr_trip_core_v2_gateway=X/' not in r['acl']]
    target = Path(tempfile.mkdtemp(prefix='otr-auth-hosted-gate-', dir='/private/tmp'))
    os.chmod(target, 0o700)
    (target / 'install.private.sql').write_text(sql)
    os.chmod(target / 'install.private.sql', 0o600)
    (target / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
    os.chmod(target / 'MANIFEST.json', 0o600)
    return {'directory': str(target), 'gateId': gate_id, 'installSha256': manifest['installSha256'], 'tables': len(manifest['privateTables']), 'publicParents': len(rows), 'status': manifest['status']}

if __name__ == '__main__':
    assert len(sys.argv) == 2, 'Provide only the private14-function DEV parent capture directory.'
    print(json.dumps(package(Path(sys.argv[1]))))
