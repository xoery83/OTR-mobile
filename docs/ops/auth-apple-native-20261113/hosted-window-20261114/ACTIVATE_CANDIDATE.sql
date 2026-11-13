-- CANDIDATE ONLY. Root2 must bind the three intent settings and UTC deadline after approval.
BEGIN;
SET LOCAL otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';
SET LOCAL otr.auth.approved_gate_id='AUTH_APPLE_ADOPTION_20261114_V1';
SET LOCAL otr.auth.qa_window='c8d26837-3b39-4d9a-9e39-26594b746c16';
SET LOCAL otr.auth.qa_expires_at='@CLOSE_RESERVE_START_UTC@';
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SELECT pg_advisory_xact_lock(hashtextextended('otr-auth-qa-policy',0));
DO $gate$
DECLARE changed integer;
BEGIN
 IF current_database()<>'postgres'
 OR current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.approved_gate_id',true) IS DISTINCT FROM 'AUTH_APPLE_ADOPTION_20261114_V1'
 OR current_setting('otr.auth.qa_window',true) IS DISTINCT FROM 'c8d26837-3b39-4d9a-9e39-26594b746c16'
 OR current_setting('otr.auth.qa_expires_at',true) IS NULL
 OR current_setting('otr.auth.qa_expires_at')::timestamptz<=clock_timestamp()
 OR current_setting('otr.auth.qa_expires_at')::timestamptz>clock_timestamp()+interval '26 minutes'
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('otr_auth_guest_composite.close_qa_policy(boolean)') AND md5(pg_get_functiondef(oid))='a4230045eab12b97d3cdfd31477ea770')
 THEN RAISE EXCEPTION 'AUTH_APPLE_QA_INTENT_OR_DEPENDENCY_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM otr_auth_guest_composite.grants WHERE adoption_id='7da7240f-4019-4a60-b3d7-350525ecddef'::uuid)
 OR EXISTS(SELECT 1 FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id='7da7240f-4019-4a60-b3d7-350525ecddef'::uuid)
 OR EXISTS(SELECT 1 FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id='7da7240f-4019-4a60-b3d7-350525ecddef'::uuid)
 THEN RAISE EXCEPTION 'AUTH_APPLE_ORIGINAL_ATTEMPT_RECONCILIATION_REQUIRED'; END IF;
 UPDATE otr_auth_guest_composite.policy SET enabled=true
 WHERE singleton AND NOT enabled AND policy_version='otr.auth.fileless-p1.unpriced/1'
 AND xmin::text='33417';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'AUTH_APPLE_POLICY_CAS_FAILED'; END IF;
END $gate$;
SELECT enabled,policy_version,xmin::text AS active_policy_xmin FROM otr_auth_guest_composite.policy WHERE singleton;
COMMIT;
