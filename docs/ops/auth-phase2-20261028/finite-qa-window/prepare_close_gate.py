"""Offline exact negative-only permission candidate. Never connects to any DB."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parent
body=(ROOT/'close-helper.body.sql').read_bytes()
identity={'generatorSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'project':'tuqigdxrvrerfewsxqgm','parentGate':'fd671463e04c095197e20faaba223ed26eb1ea99d2ad64b207bd06aaaaefde5c','bodySHA256':hashlib.sha256(body).hexdigest(),'signature':'otr_auth_guest_composite.close_qa_policy(boolean)','grantee':'otr_trip_core_v2_gateway','policyVersion':'otr.auth.fileless-p1.unpriced/1','sourceGuardMD5':'6c7ef0d85cfd8893796ccc53e31f51f0'}
gate=hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':')).encode()).hexdigest()
header=f"""-- CANDIDATE ONLY: Owner approval required for one private function and one EXECUTE.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
DO $gate$ BEGIN
 IF current_database()<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.close_helper_gate',true) IS DISTINCT FROM '{gate}'
 OR to_regprocedure('otr_auth_guest_composite.close_qa_policy(boolean)') IS NOT NULL
 OR (SELECT count(*) FROM pg_proc WHERE pronamespace=to_regnamespace('otr_auth_guest_composite'))<>24
 OR NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.policy WHERE singleton AND NOT enabled AND policy_version='otr.auth.fileless-p1.unpriced/1')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_gateway' AND NOT rolsuper AND NOT rolcreaterole AND NOT rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=66410 AND md5(pg_get_functiondef(oid))='6c7ef0d85cfd8893796ccc53e31f51f0')
 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_EXACT_DEV_GATE_REQUIRED';END IF;
END $gate$;
"""
footer="""DO $closed$ BEGIN
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace=to_regnamespace('otr_auth_guest_composite'))<>25
 OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='otr_auth_guest_composite.close_qa_policy(boolean)'::regprocedure AND (a.grantee NOT IN ((SELECT oid FROM pg_roles WHERE rolname='postgres'),(SELECT oid FROM pg_roles WHERE rolname='otr_trip_core_v2_gateway')) OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
 OR NOT has_function_privilege('otr_trip_core_v2_gateway','otr_auth_guest_composite.close_qa_policy(boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_PERMISSION_FOOTPRINT';END IF;
 IF NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.policy WHERE singleton AND NOT enabled AND policy_version='otr.auth.fileless-p1.unpriced/1')
 THEN RAISE EXCEPTION 'AUTH_QA_INSTALL_MUST_REMAIN_CLOSED';END IF;
END $closed$;
COMMIT;
"""
install=header.encode()+body+footer.encode();(ROOT/'CLOSE_HELPER_INSTALL_CANDIDATE.sql').write_bytes(install)
probe=json.loads((ROOT/'CLOSE_HELPER_LOCAL_PG_RESULT.json').read_text());assert probe['bodySHA256']==identity['bodySHA256']
manifest={**identity,'gateId':gate,'installSHA256':hashlib.sha256(install).hexdigest(),'status':'OWNER_APPROVAL_REQUIRED_NOT_EXECUTED','newPrivateFunctions':1,'newDirectExecuteGrants':1,'newRolesOrCredentials':0,'newTablePrivilegesOrRlsChanges':0,'positiveAuthority':'none; only existing policy true→false; future policy versions rejected','normalApiRoleExecution':False,'expectedFunction':probe['function'],'existingParentFunctionsChanged':0,'policyAtInstall':'CLOSED','independentReview':'PENDING'}
(ROOT/'CLOSE_HELPER_GATE.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({k:manifest[k] for k in ['gateId','installSHA256','status']}))
