"""Reuse the network-none Core PG fixture for the finite IMPORT contract and inverse."""
from pathlib import Path
import json
import re
import tempfile
from importlib.util import spec_from_file_location, module_from_spec

root = Path(__file__).resolve().parents[2]
packet = root / 'docs/ops/import-b2-slice3-20261113'
spec = spec_from_file_location('local_document', root / 'scripts/trip/core-v3-local-document-acceptance.py')
module = module_from_spec(spec)
spec.loader.exec_module(module)

def install(root, sql):
    module.install_core_local_document(root, sql)
    authority = (root / 'docs/ops/auth-phase1-20261028/composite-publication-candidate/authority.local.sql').read_text()
    authority = (root / 'docs/ops/auth-phase1-20261028/composite-publication-candidate/authority.local.sql').read_text()
    sql('set role postgres;' + authority[authority.index('CREATE TABLE'):authority.index('CREATE TABLE otr_auth_guest_composite.transaction_scopes')])
    journal = (root / 'docs/ops/auth-phase1-20261028/composite-publication-candidate/receipt-journal.local.sql').read_text()
    sql('set role postgres;' + journal[journal.index('CREATE TABLE'):journal.index('ALTER TABLE')])
    # Existing exact composite predicates; no fake Source proof or write authorization.
    for name in ('scope_allowed', 'mutation_allowed', 'read_state_allowed'):
        function = re.search(r'CREATE FUNCTION otr_auth_guest_composite\.' + name + r'\([\s\S]+?END \$\$;', authority)
        assert function, name
        sql('set role postgres;' + function.group())
    sql("set role postgres;GRANT USAGE ON SCHEMA otr_auth_guest_composite TO otr_trip_core_v2_gateway,otr_trip_core_v2_writer;GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA otr_auth_guest_composite TO otr_trip_core_v2_gateway,otr_trip_core_v2_writer;")
    compatibility = (root / 'backend/sql/core-manual-compat/FORWARD.sql').read_text()
    for function in re.findall(r'CREATE OR REPLACE FUNCTION [\s\S]+?END \$function\$;', compatibility):
        sql('set role postgres;' + function)
    legacy = (root / 'backend/sql/universal_p1_source_admission_candidate.sql').read_text()
    sql('set role postgres;' + legacy[legacy.index('ALTER TABLE'):legacy.index('REVOKE ALL ON FUNCTION')])
    before = json.loads((packet / 'dev-functions-before.json').read_text())
    for function in before:
        sql('set role postgres;' + function['definition'])
    # Fixture Auth identities are entirely synthetic, and remain inside this container.
    sql("UPDATE auth.users SET is_anonymous=false;")
    forward = (root / 'supabase/dev-forward/core-v2/20261113000200_import_normal_admission.sql').read_text()
    sql('set role postgres;' + forward)
    diff = json.loads((packet / 'function-diff.json').read_text())
    for function in diff:
        signature = function['proname'] + '(' + ','.join(a.split()[-1] for a in function['args'].split(',') if a.strip()) + ')'
        assert sql("select md5(pg_get_functiondef('public." + signature + "'::regprocedure));") == function['afterMD5']
    return diff

base = root / 'scripts/trip/trip-sustained-sync-acceptance.py'
source = base.read_text().split(' person_id=str(uuid.uuid4())')[0]
source = source.replace("'otr-trip-sustained-'", "'otr-core-v2-test-'")
source = source.replace("docker('run','--name'", "docker('run','--pull=never','--name'")
source = source.replace("packet=ROOT/'docs/ops/trip-p1-sustained-sync-20261024'", 'packet=pathlib.Path(temporary)')
source += '''
 diff=install(ROOT,sql)
 import os
 env=dict(os.environ, OTR_CORE_OWNED_SQL_FIXTURE=NAME, OTR_CORE_V3_FIXTURE_ACTOR=ACTOR, OTR_CORE_V3_FIXTURE_TRIP=TRIP)
 result=subprocess.run([str(ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','--no-cache',
  'backend/src/tripCoreImportAdmission.sql.test.ts'],cwd=ROOT,env=env,timeout=90)
 assert result.returncode==0
 sql('set role postgres;'+(ROOT/'docs/ops/import-b2-slice3-20261113/rollback.sql').read_text())
 for function in diff:
  signature=function['proname']+'('+','.join(a.split()[-1] for a in function['args'].split(',') if a.strip())+')'
  assert sql("select md5(pg_get_functiondef('public."+signature+"'::regprocedure));")==function['beforeMD5']
 print('IMPORT forward, owning commands, independent readback and exact inverse PASS')
finally:
 if created:docker('rm','-f',NAME)
'''
with tempfile.TemporaryDirectory(prefix='otr-import-core-') as temporary:
    exec(compile(source, str(base), 'exec'), {'__file__': str(base), 'temporary': temporary, 'install': install})
