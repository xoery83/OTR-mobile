#!/usr/bin/env python3
"""Render one exact constraint difference. Source preparation, never execution."""
import hashlib,json,pathlib
HERE=pathlib.Path(__file__).resolve().parent
RETURN=pathlib.Path('/Users/xoery/Project/otr-mobile-import/root2-hosted-ops-acceptance-20261103/docs/handoffs/ROOT2_HOSTED_OPS_V4/requests/CORE-SELF-NICKNAME-SOURCE-QUALIFICATION-20261105-01/ACTIVATION_CATALOG_RETURN.json')
EXPECTED='09fdd588df02a710aa03b1b0bb15357b86058077d43712c007ed6a00a769b967'
q=lambda s:"'"+s.replace("'","''")+"'"
def inputs():
 b=RETURN.read_bytes();assert hashlib.sha256(b).hexdigest()==EXPECTED;j=json.loads(b)
 for f in j['functions']:assert hashlib.sha256(pathlib.Path(f['privateDefinitionPath']).read_bytes()).hexdigest()==f['definitionSHA256']
 for c in j['allActivationConstraints']:assert hashlib.sha256(c['definition'].encode()).hexdigest()==c['definitionSHA256']
 return j
ARM="""(self_nickname_enabled AND NOT runtime_enabled AND enabled_commands='{}'::text[] AND enabled_families='{}'::text[] AND enabled_admission_modes='{}'::text[]
 AND NOT source_review_enabled AND scope_actor_account_id IS NOT NULL AND scope_trip_id IS NOT NULL
 AND scope_started_at IS NOT NULL AND scope_expires_at IS NOT NULL AND isfinite(scope_started_at) AND isfinite(scope_expires_at)
 AND scope_expires_at>scope_started_at AND scope_expires_at<=scope_started_at+interval '15 minutes')"""
def definition(j):
 old=next(c['definition'] for c in j['allActivationConstraints'] if c['name']=='finite_core_scope_contract')
 assert old.startswith('CHECK (') and old.endswith(')')
 return 'CHECK (((NOT self_nickname_enabled) AND '+old[7:-1]+') OR '+ARM+')'
def render(after_hash):
 j=inputs();old=next(c for c in j['allActivationConstraints'] if c['name']=='finite_core_scope_contract');new=definition(j)
 checks=[]
 for f in j['functions']:
  sig=f['name']+'('+','.join(x.strip().split()[-1] for x in f['identityArguments'].split(','))+')' if f['identityArguments'] else f['name']+'()'
  acl='ARRAY['+','.join(q(a) for a in f['acl'])+']::text[]'
  checks.append("IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid="+q('public.'+sig)+"::regprocedure AND encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')="+q(f['definitionSHA256'])+" AND proowner='postgres'::regrole AND coalesce(proacl,acldefault('f',proowner))::text[]="+acl+") THEN RAISE EXCEPTION 'NICKNAME_PARENT_FUNCTION_DRIFT';END IF;")
 common="""IF current_user<>'postgres' OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.core.self_nickname_shape_gate',true) IS DISTINCT FROM 'OTR_SELF_NICKNAME_ACTIVATION_SHAPE_V1'
 THEN RAISE EXCEPTION 'NICKNAME_SHAPE_EXACT_GATE_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE singleton AND NOT runtime_enabled AND NOT self_nickname_enabled AND NOT source_review_enabled
 AND enabled_commands='{}' AND enabled_families='{}' AND enabled_admission_modes='{}'
 AND scope_actor_account_id IS NULL AND scope_trip_id IS NULL AND scope_started_at IS NULL AND scope_expires_at IS NULL)
 THEN RAISE EXCEPTION 'NICKNAME_SHAPE_REQUIRES_CLOSED';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_person_nickname_receipts) OR EXISTS(SELECT 1 FROM public.journey_members WHERE nickname_revision<>0)
 THEN RAISE EXCEPTION 'NICKNAME_HISTORY_FORBIDS_SHAPE_REVERSE_OR_REINSTALL';END IF;
"""+'\n'.join(checks)
 unchanged=[]
 for c in j['allActivationConstraints']:
  if c['name']=='finite_core_scope_contract':continue
  unchanged.append("IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND conname="+q(c['name'])+" AND convalidated AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')="+q(c['definitionSHA256'])+") THEN RAISE EXCEPTION 'NICKNAME_OTHER_CONSTRAINT_DRIFT';END IF;")
 prefix="-- Rendered SOURCE CANDIDATE. No execution permission; requires new exact Root2 qualification/Gate.\nBEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';\nLOCK TABLE public.trip_core_activation_gate IN ACCESS EXCLUSIVE MODE;\nLOCK TABLE public.trip_person_nickname_receipts IN SHARE MODE;\nLOCK TABLE public.journey_members IN SHARE MODE;\n"
 def make(before,after,body):
  cas="IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass)<>7 OR (SELECT encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex') FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND conname='finite_core_scope_contract') IS DISTINCT FROM "+q(before)+" THEN RAISE EXCEPTION 'NICKNAME_SHAPE_CONSTRAINT_DRIFT';END IF;"
  return prefix+'DO $pre$ BEGIN\n'+common+'\n'+cas+'\n'+'\n'.join(unchanged)+'\nEND $pre$;\nALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT finite_core_scope_contract, ADD CONSTRAINT finite_core_scope_contract '+body+';\nDO $post$ BEGIN\n'+"IF (SELECT encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex') FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND conname='finite_core_scope_contract') IS DISTINCT FROM "+q(after)+" THEN RAISE EXCEPTION 'NICKNAME_SHAPE_POSTIMAGE_DRIFT';END IF;\n"+'\n'.join(unchanged)+'\nEND $post$;COMMIT;\n'
 (HERE/'FORWARD_CANDIDATE.sql').write_text(make(old['definitionSHA256'],after_hash,new))
 (HERE/'ROLLBACK_CANDIDATE.sql').write_text(make(after_hash,old['definitionSHA256'],old['definition']))
 return j,new
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--postimage-sha256',required=True);a=p.parse_args();assert len(a.postimage_sha256)==64
 render(a.postimage_sha256)
