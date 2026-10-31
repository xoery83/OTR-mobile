-- Before first paid use only; CLOSED. Preserve all data/operations.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SELECT pg_advisory_xact_lock(714024,2);
SELECT actor_account_id FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' FOR UPDATE;
DO $pre$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR (SELECT oid FROM pg_proc WHERE oid='public.trip_source_png_original_facts(uuid,uuid,uuid,uuid,bigint)'::regprocedure)<>67145
 OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=67145)<>'a2945b7def0e9e5a19d4a66bd1e5a951'
 OR (SELECT proowner FROM pg_proc WHERE oid=67145)<>'otr_trip_source_writer'::regrole
 OR (SELECT proacl::text FROM pg_proc WHERE oid=67145) IS DISTINCT FROM '{otr_trip_source_writer=X/otr_trip_source_writer,postgres=X/otr_trip_source_writer}'
 OR NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'
   AND universal_png_import_enabled=false AND universal_png_import_expires_at IS NULL AND universal_pdf_import_enabled=false)
 OR NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE oid=64306 AND roleid='otr_trip_source_writer'::regrole AND member='postgres'::regrole
   AND grantor='postgres'::regrole AND NOT admin_option AND NOT inherit_option AND NOT set_option)
 OR EXISTS(SELECT 1 FROM public.external_integration_calls c JOIN public.trip_source_runs r ON r.interpretation_task_id=c.task_id AND r.actor_account_id=c.account_id AND r.trip_id=c.trip_id
   JOIN public.trip_source_inputs i ON i.run_id=r.id JOIN public.trip_source_representations rep ON rep.id=i.representation_id AND rep.source_id=i.source_id
   WHERE c.account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND c.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'
   AND rep.mime_type='image/png' AND rep.payload_sha256='078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515')
 THEN RAISE EXCEPTION 'PHOTO_PROOF_EXEC_PREIMAGE_DRIFT';END IF;
END $pre$;
CREATE TEMP TABLE photo_proof_exec_members ON COMMIT DROP AS SELECT * FROM pg_auth_members;
CREATE TEMP TABLE photo_proof_exec_schema ON COMMIT DROP AS SELECT nspacl FROM pg_namespace WHERE nspname='public';
GRANT otr_trip_source_writer TO postgres WITH ADMIN false,INHERIT false,SET true;
SET LOCAL ROLE otr_trip_source_writer;
REVOKE EXECUTE ON FUNCTION public.trip_source_png_original_facts(uuid,uuid,uuid,uuid,bigint) FROM postgres;
RESET ROLE;
GRANT otr_trip_source_writer TO postgres WITH ADMIN false,INHERIT false,SET false;
DO $post$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY oid) FROM photo_proof_exec_members m) IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY oid) FROM pg_auth_members m)
 OR (SELECT nspacl FROM photo_proof_exec_schema) IS DISTINCT FROM (SELECT nspacl FROM pg_namespace WHERE nspname='public')
 OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=67145)<>'a2945b7def0e9e5a19d4a66bd1e5a951'
 OR (SELECT proowner FROM pg_proc WHERE oid=67145)<>'otr_trip_source_writer'::regrole
 OR (SELECT proacl::text FROM pg_proc WHERE oid=67145) IS DISTINCT FROM '{otr_trip_source_writer=X/otr_trip_source_writer}'
 OR has_function_privilege('otr_external_integration_call_gateway',67145,'EXECUTE')
 OR has_function_privilege('otr_external_integration_meter_writer',67145,'EXECUTE')
 THEN RAISE EXCEPTION 'PHOTO_PROOF_EXEC_POSTIMAGE_DRIFT';END IF;
END $post$;
COMMIT;
