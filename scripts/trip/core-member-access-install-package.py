#!/usr/bin/env python3
"""Render a private, exact preimage-CAS install and no-history rollback; offline only."""
import argparse,hashlib,json,os,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SIGS={'actor':'public.trip_core_lock_actor_scope(uuid,uuid)','write':'public.trip_core_guard_write()','read-state':'public.trip_core_finite_read_state_guard()'}
REQUIRED={'write':'90457991887db2a3a3ac0c74423cb21fa08d0d7f05b249380a951aaa6fbdffef','read-state':'15fb16411839879cb85995df484b24f71dacd1d287f491e020fc7a397ad74c97'}
sha=lambda x:hashlib.sha256(x).hexdigest()
quote=lambda x:"'"+str(x).replace("'","''")+"'"
def cas(signature,meta,digest):
 expected={k:meta[k] for k in ['oid','owner','securityDefiner','acl','config']}
 return '''DO $member_cas$ DECLARE f pg_proc;observed jsonb;BEGIN
 SELECT * INTO STRICT f FROM pg_proc WHERE oid=to_regprocedure('''+quote(signature)+''');
 observed:=jsonb_build_object('oid',f.oid::bigint,'owner',f.proowner::regrole::text,'securityDefiner',f.prosecdef,'acl',to_jsonb(f.proacl),'config',to_jsonb(f.proconfig));
 IF observed IS DISTINCT FROM '''+quote(json.dumps(expected))+'''::jsonb
 OR encode(sha256(convert_to(pg_get_functiondef(f.oid),'UTF8')),'hex') IS DISTINCT FROM '''+quote(digest)+''' THEN RAISE EXCEPTION 'MEMBER_REVOKE_PREIMAGE_OR_METADATA_DRIFT';END IF;
 END $member_cas$;
'''
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',required=True,type=Path);p.add_argument('--output-dir',required=True,type=Path);a=p.parse_args()
 m=json.loads(a.manifest.read_text());assert set(m)==set(SIGS)|{'claim-helper'},'EXACT_GUARDS_AND_CLAIM_HELPER_REQUIRED'
 patch=runpy.run_path(str(ROOT/'scripts/trip/core-member-access-patches.py'))['patch']
 before={};after={}
 for kind,sig in SIGS.items():
  meta=m[kind];raw=Path(meta['privateDefinitionPath']).read_bytes()
  assert isinstance(meta['oid'],int) and meta['oid']>0 and meta['owner']=='postgres'
  assert meta['securityDefiner']==(kind=='actor') and meta['config']==['search_path=pg_catalog']
  allowed=['postgres=X/postgres','otr_trip_core_v2_gateway=X/postgres' if kind=='actor' else 'otr_trip_core_v2_writer=X/postgres']
  assert sorted(meta['acl'])==sorted(allowed),'UNEXPECTED_GUARD_ACL'
  assert sha(raw)==meta['definitionSHA256'],'PRIVATE_PREIMAGE_DRIFT'
  if kind in REQUIRED:assert sha(raw)==REQUIRED[kind],'FIXED_PREIMAGE_OR_CLAIM_FIX_REQUIRED'
  before[kind]=raw;after[kind]=patch(raw,kind)
 helper=m['claim-helper'];helper_signature='public.trip_member_claim_read_state_allowed(uuid)'
 assert helper['owner']=='postgres' and helper['securityDefiner'] is True and helper['config']==['search_path=pg_catalog'] and helper['acl']==['postgres=X/postgres']
 assert helper['definitionSHA256']=='e2b8d26256bdb6bd5a74918a55f43d7d3436a172ed7fcc11076f19e16af3f8fd'
 helper_check=cas(helper_signature,helper,helper['definitionSHA256'])
 ddl=(ROOT/'backend/sql/tripCoreMemberAccess.sql').read_text()
 begin="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';\n"
 install=begin+helper_check+''.join(cas(SIGS[k],m[k],sha(before[k])) for k in SIGS)+ddl+'\n'+''.join(after[k].decode()+';\n' for k in SIGS)+''.join(cas(SIGS[k],m[k],sha(after[k])) for k in SIGS)+helper_check+"COMMIT;\n"
 rollback=begin+"DO $no_history$ BEGIN IF EXISTS(SELECT 1 FROM public.trip_core_command_receipts WHERE body->>'command'='REVOKE_LINKED_MEMBER_ACCESS') OR EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE member_revoke_enabled) THEN RAISE EXCEPTION 'MEMBER_REVOKE_HISTORY_RETAINS_PROTECTION';END IF;END $no_history$;\n"+''.join(cas(SIGS[k],m[k],sha(after[k])) for k in SIGS)+''.join(before[k].decode()+';\n' for k in SIGS)+'''
 DROP TRIGGER core_member_revoke_serialize ON public.journey_members;
 DROP TRIGGER core_member_revoke_retain ON public.journey_removed_users;
 DROP FUNCTION public.trip_core_member_access(uuid,uuid,text,jsonb);
 DROP FUNCTION public.trip_core_member_denial_guard();
 DROP FUNCTION public.trip_core_member_write_allowed(text,text,jsonb,jsonb);
 DROP FUNCTION public.trip_core_member_scope_allowed(uuid,uuid);
 ALTER TABLE public.trip_core_activation_gate DROP COLUMN member_revoke_enabled;
 COMMIT;
'''
 a.output_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
 result={'status':'OFFLINE_EXACT_PACKAGE_NOT_EXECUTION_AUTHORITY','ddlSHA256':sha(ddl.encode()),'preimages':{k:{'signature':SIGS[k],'beforeSHA256':sha(before[k]),'afterSHA256':sha(after[k]),'oid':m[k]['oid']} for k in SIGS},'files':{},'grantOrActivationIncluded':False,'claimNestedFixPreserved':True,'hostedActions':0}
 for name,value in [('INSTALL.private.sql',install),('ROLLBACK_NO_HISTORY.private.sql',rollback)]:
  raw=value.encode();fd=os.open(a.output_dir/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'wb') as f:f.write(raw)
  result['files'][name]=sha(raw)
 (a.output_dir/'MANIFEST.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
