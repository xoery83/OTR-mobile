BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714028,1);
DO $repair$
DECLARE original text; updated text; original_oid oid; original_owner oid; original_acl aclitem[];
BEGIN
IF current_database()<>'postgres' OR NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND enabled AND revoked_at IS NULL AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL) THEN RAISE EXCEPTION 'FULL_MONTH_REQUIRES_CLOSED_POLICY';END IF;
IF EXISTS(SELECT 1 FROM public.trip_source_core_v2_slots ss JOIN public.trip_core_command_receipts rr
 ON rr.operation_id=ss.operation_id AND rr.actor_account_id=ss.account_id AND rr.trip_id=ss.trip_id AND rr.intent_sha256=ss.intent_sha256
 WHERE ss.account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND ss.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid
 AND ss.output_purpose->>'purposeKind' IN ('P1_ITEM','P3_ITEM','P4_ITEM','P5_ITEM','P6_ITEM','FLIGHT_OCCURRENCE') AND rr.outcome IN ('APPLIED','NO_CHANGE') AND
 (ss.state IS DISTINCT FROM 'COMPLETE' OR ss.domain_receipt_id IS DISTINCT FROM rr.id
 OR NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a WHERE a.output_slot_id=ss.output_slot_id
 AND a.domain_receipt_id=rr.id AND a.receipt_sha256=rr.receipt_sha256 AND a.account_id=ss.account_id AND a.trip_id=ss.trip_id
 AND a.source_id=ss.source_id AND a.candidate_id=ss.candidate_id AND a.target_kind=ss.target_kind AND a.target_id=ss.target_id AND a.identity_sha256=ss.identity_sha256)))
 THEN RAISE EXCEPTION 'CONTINUOUS_ACCEPTED_SOURCE_RECOVERY_REQUIRED';END IF;
SELECT pg_get_functiondef(p.oid),p.oid,p.proowner,p.proacl INTO original,original_oid,original_owner,original_acl FROM pg_proc p WHERE p.oid='public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure;
IF md5(original) IS DISTINCT FROM '115bc244cd9ccd196936828739187531' OR pg_get_userbyid(original_owner) IS DISTINCT FROM 'postgres' OR original_acl::text IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'FULL_MONTH_FUNCTION_DRIFT';END IF;
updated:=replace(original,$before$AND (e->>'raw'=to_char((e->'normalization'->>'value')::date,'Mon FMDD, YYYY')
       OR (actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid
        AND continuous_candidate IS NOT NULL
        AND e->>'raw'=to_char((e->'normalization'->>'value')::date,'FMMonth FMDD, YYYY')))$before$,$after$AND e->>'raw'=to_char((e->'normalization'->>'value')::date,'Mon FMDD, YYYY')$after$);
IF md5(updated) IS DISTINCT FROM '488f5fe1537d450b610ef7c5e22eb53b' THEN RAISE EXCEPTION 'FULL_MONTH_REPLACEMENT_DRIFT';END IF;
EXECUTE updated;
IF md5(pg_get_functiondef(original_oid)) IS DISTINCT FROM '488f5fe1537d450b610ef7c5e22eb53b' OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure AND p.oid=original_oid AND p.proowner=original_owner AND p.proacl IS NOT DISTINCT FROM original_acl) THEN RAISE EXCEPTION 'FULL_MONTH_POSTIMAGE_DRIFT';END IF;
END $repair$;
COMMIT;
