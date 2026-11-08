-- Protected Source migration. Run as the owning Source Writer in the existing default-closed maintenance window.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25s';
DO $patch$
DECLARE
 target regprocedure := 'public.trip_source_pdf_upload_v4_command(jsonb)';
 old_guard text := $old$ AND public.trip_source_finite_native_command((q->>'actor_account_id')::uuid,(q->>'trip_id')::uuid,q::text) IS NOT TRUE
  AND NOT coalesce(
   q->>'command' IN ('PREPARE_REPRESENTATION','UPLOAD_ORIGINAL','VERIFY_REPRESENTATION')
   AND current_setting('otr.source.universal_pdf_scope',true)=jsonb_build_object(
    'actor',q->>'actor_account_id','trip',q->>'trip_id','source',q->>'source_id')::text
   AND public.trip_sustained_universal_pdf_allowed((q->>'actor_account_id')::uuid,(q->>'trip_id')::uuid),
  false)
  THEN RAISE EXCEPTION 'UNIVERSAL_PDF_SOURCE_CLOSED';END IF;$old$;
 new_guard text := $new$ AND public.trip_source_finite_native_command((q->>'actor_account_id')::uuid,(q->>'trip_id')::uuid,q::text) IS NOT TRUE THEN RAISE EXCEPTION 'UNIVERSAL_PDF_SOURCE_CLOSED';END IF;$new$;
 definition text;
BEGIN
 IF current_user<>'otr_trip_source_writer'
  OR NOT pg_try_advisory_xact_lock(hashtextextended('otr-source-activation-v1',0))
 THEN RAISE EXCEPTION 'NORMAL_PDF_COMMAND_WRITER_OR_LOCK'; END IF;
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p
 WHERE p.oid=target AND pg_get_userbyid(p.proowner)='otr_trip_source_writer'
  AND p.proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer}'
  AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND NOT p.prosecdef;
 IF definition IS NULL
  OR encode(sha256(convert_to(definition,'UTF8')),'hex')<>'73e0df988cb78e461439aebe6a5a27815a80b27e509cabdf39d0338728c5f5cf'
  OR length(definition)-length(replace(definition,old_guard,''))<>length(old_guard)
 THEN RAISE EXCEPTION 'NORMAL_PDF_COMMAND_PREIMAGE_DRIFT'; END IF;
 definition := replace(definition,old_guard,new_guard);
 IF encode(sha256(convert_to(definition,'UTF8')),'hex')<>'0768b7e88877aa5bbaf99e5d72aa01ba22c1686bb1fcbb4b130573b0eab2aefc'
 THEN RAISE EXCEPTION 'NORMAL_PDF_COMMAND_TRANSFORM_DRIFT'; END IF;
 EXECUTE definition;
 IF NOT EXISTS (
  SELECT 1 FROM pg_proc p WHERE p.oid=target
   AND pg_get_userbyid(p.proowner)='otr_trip_source_writer'
   AND p.proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer}'
   AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND NOT p.prosecdef
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='0768b7e88877aa5bbaf99e5d72aa01ba22c1686bb1fcbb4b130573b0eab2aefc'
 ) THEN RAISE EXCEPTION 'NORMAL_PDF_COMMAND_POSTIMAGE_DRIFT'; END IF;
END $patch$;
COMMIT;
