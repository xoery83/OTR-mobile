"""Generate metadata-only READ ONLY gate checks and expected hashes; never query DB."""
import hashlib
import json
import os
import re
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[4]
LOCAL = ROOT / 'docs/ops/auth-phase1-20261028/composite-publication-candidate'
sys.path.insert(0, str(LOCAL))
from principal_patch import render

def make(parent, target):
    catalog = json.loads((parent/'catalog.raw.json').read_text())['rows'][0]['catalog']
    manifest = json.loads((target/'MANIFEST.json').read_text())
    rows = catalog['functions']
    _, changes = render({r['signature']:r['definition'] for r in rows})
    additions = set(manifest['publicDirectExecuteAdditions'])
    expected = {'gateId':manifest['gateId'], 'sourceGuard':catalog['sourceGuard'], 'tables':manifest['privateTables'], 'privateFunctionCount':24, 'parents':{}}
    for row in rows:
        signature = row['signature']
        acl = sorted(row['acl'].strip('{}').split(','))
        after_acl = sorted(set(acl + (['otr_trip_core_v2_gateway=X/postgres'] if signature in additions else [])))
        expected['parents'][signature] = {k:row[k] for k in ['oid','owner','config','securityDefiner']}
        expected['parents'][signature].update(beforeMd5=changes[signature]['beforeMd5'], afterMd5=changes[signature]['afterMd5'], beforeAcl=acl, afterAcl=after_acl)
    sql_install=(target/'install.private.sql').read_text()
    expected['privateFunctionAcl']={name:['postgres=X/postgres'] for name in manifest['newFunctionNames']}
    for functions,grantees in re.findall(r'GRANT EXECUTE ON FUNCTION ([\s\S]+?) TO ([^;]+);',sql_install):
        for name in re.findall(r'(otr_auth_guest_composite\.[a-z_]+)\([^)]*\)',functions):
            expected['privateFunctionAcl'][name]=sorted(set(expected['privateFunctionAcl'][name]+[role.strip()+'=X/postgres' for role in grantees.split(',')]))
    expected['schemaAcl']=sorted(['postgres=UC/postgres','otr_trip_core_v2_gateway=U/postgres','otr_trip_core_v2_writer=U/postgres'])
    requested = ','.join("'"+r['signature']+"'" for r in rows)
    roles = "'anon','authenticated','service_role','otr_trip_core_v2_gateway','otr_trip_core_v2_writer','otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_person_command_gateway'"
    common = f"""
 'database',current_database(),'currentUser',current_user,'sessionUser',session_user,
 'transactionReadOnly',current_setting('transaction_read_only'),
 'schemaExists',to_regnamespace('otr_auth_guest_composite') IS NOT NULL,
 'parents',(SELECT jsonb_agg(jsonb_build_object('signature',v.signature,'oid',p.oid,'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'securityDefiner',p.prosecdef) ORDER BY v.signature) FROM unnest(ARRAY[{requested}]) v(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(v.signature)),
 'sourceGuard',(SELECT jsonb_build_object('signature',format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)),'oid',p.oid,'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.oid=66410),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'login',rolcanlogin,'bypassRls',rolbypassrls,'connectionLimit',rolconnlimit,'validUntil',rolvaliduntil) ORDER BY rolname) FROM pg_roles WHERE rolname IN ({roles})),
 'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'admin',admin_option) ORDER BY roleid,member),'[]'::jsonb) FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ({roles})) OR member IN (SELECT oid FROM pg_roles WHERE rolname IN ({roles}))),
 'businessRelations',(SELECT jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN ('public.trips'::regclass,'public.journey_members'::regclass,'public.itinerary_events'::regclass))
"""
    post = """,
 'schemaOwner',(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='otr_auth_guest_composite'),
 'schemaAcl',(SELECT nspacl::text FROM pg_namespace WHERE nspname='otr_auth_guest_composite'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='otr_auth_guest_composite' AND c.relkind='r'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='otr_auth_guest_composite'),
 'privateTableAccess',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'table',c.relname,'select',has_table_privilege(r.oid,c.oid,'SELECT'),'insert',has_table_privilege(r.oid,c.oid,'INSERT'),'update',has_table_privilege(r.oid,c.oid,'UPDATE'),'delete',has_table_privilege(r.oid,c.oid,'DELETE'),'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE'),'references',has_table_privilege(r.oid,c.oid,'REFERENCES'),'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER')) ORDER BY r.rolname,c.relname) FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname IN ('anon','authenticated','service_role','otr_trip_core_v2_gateway','otr_trip_core_v2_writer') AND n.nspname='otr_auth_guest_composite' AND c.relkind='r'),
 'privateApiRoleExecute',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'function',p.proname,'execute',has_function_privilege(r.oid,p.oid,'EXECUTE')) ORDER BY r.rolname,p.proname) FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='otr_auth_guest_composite'),
 'policy',(SELECT to_jsonb(p) FROM otr_auth_guest_composite.policy p WHERE singleton),
 'counts',jsonb_build_object('sealed_stages',(SELECT count(*) FROM otr_auth_guest_composite.sealed_stages),'terminal_evidence',(SELECT count(*) FROM otr_auth_guest_composite.terminal_evidence),'grants',(SELECT count(*) FROM otr_auth_guest_composite.grants),'transaction_scopes',(SELECT count(*) FROM otr_auth_guest_composite.transaction_scopes),'terminal_receipts',(SELECT count(*) FROM otr_auth_guest_composite.terminal_receipts))
"""
    for phase, extra in [('preflight',''),('postinstall',post)]:
        sql = "BEGIN READ ONLY;\nSET LOCAL statement_timeout='15s';\nSELECT jsonb_build_object('phase','"+phase+"',"+common+extra+") AS auth_gate;\nCOMMIT;\n"
        path=target/(phase+'.read-only.sql');path.write_text(sql);os.chmod(path,0o600)
    path=target/'EXPECTED_CHECKS.json';path.write_text(json.dumps(expected,indent=2)+'\n');os.chmod(path,0o600)
    print(json.dumps({'directory':str(target),'preflight':'preflight.read-only.sql','postinstall':'postinstall.read-only.sql','expected':'EXPECTED_CHECKS.json','rawFunctionBodies':False,'executed':False}))

if __name__ == '__main__':
    assert len(sys.argv)==3
    make(Path(sys.argv[1]),Path(sys.argv[2]))
