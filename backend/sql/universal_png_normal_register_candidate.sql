-- Protected Source migration candidate forward. Apply only under the
-- existing Source writer lease and reviewed environment-specific preimage.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25s';
DO $patch$
DECLARE
 target regprocedure := 'public.trip_source_register(text,uuid,text)';
 before_guard text := $before$ AND public.trip_source_finite_native_command(actor,(j->>'trip_id')::uuid,raw) IS NOT TRUE THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;$before$;
 after_guard text := $after$ AND public.trip_source_finite_native_command(actor,(j->>'trip_id')::uuid,raw) IS NOT TRUE
 AND NOT coalesce(
  family='ACQUIRE_SOURCE' AND j->>'command'='ACQUIRE_SOURCE'
  AND public.trip_source_universal_original_pin() @> jsonb_build_object(
    'access','ACQUIRE','actor',actor,'trip',j->>'trip_id',
    'source',j->>'source_id','operation',j->>'operation_id',
    'key',j->>'operation_key','digest',j->>'operation_sha256',
    'representation',p->'original'->>'id','sha256',p->'original'->>'payload_sha256',
    'byteCount',p->'original'->'byte_count','filename',p->'original'->>'original_filename',
    'acquisitionSha256',p->>'acquisition_sha256','captureSha256',p->'capture'->>'capture_sha256')
  AND public.trip_sustained_universal_png_allowed(actor,(j->>'trip_id')::uuid),
 false)
 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;$after$;
 definition text;
BEGIN
 IF current_user<>'postgres'
  OR NOT pg_try_advisory_xact_lock(hashtextextended('otr-source-activation-v1',0))
 THEN RAISE EXCEPTION 'NORMAL_PNG_REGISTER_WRITER_OR_LOCK'; END IF;
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p
 WHERE p.oid=target AND pg_get_userbyid(p.proowner)='postgres'
  AND p.proacl::text='{postgres=X/postgres,otr_trip_source_writer=X/postgres}'
  AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND NOT p.prosecdef;
 IF definition IS NULL
  OR encode(sha256(convert_to(definition,'UTF8')),'hex')<>'1b72af38e48d2dfdb9a4008eaff9345131e350b5c7c5e99f530bc1bd2faf641b'
  OR length(definition)-length(replace(definition,before_guard,''))<>length(before_guard)
 THEN RAISE EXCEPTION 'NORMAL_PNG_REGISTER_PREIMAGE_DRIFT'; END IF;
 definition := replace(definition,before_guard,after_guard);
 IF encode(sha256(convert_to(definition,'UTF8')),'hex')<>'b1ae1008ad4ef0ac0e3aa8b853ada7e503493f8818e07c7a5aa2e2823deb2ecf'
 THEN RAISE EXCEPTION 'NORMAL_PNG_REGISTER_TRANSFORM_DRIFT'; END IF;
 EXECUTE definition;
 IF NOT EXISTS (
  SELECT 1 FROM pg_proc p WHERE p.oid=target
   AND pg_get_userbyid(p.proowner)='postgres'
   AND p.proacl::text='{postgres=X/postgres,otr_trip_source_writer=X/postgres}'
   AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND NOT p.prosecdef
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='b1ae1008ad4ef0ac0e3aa8b853ada7e503493f8818e07c7a5aa2e2823deb2ecf'
 ) THEN RAISE EXCEPTION 'NORMAL_PNG_REGISTER_POSTIMAGE_DRIFT'; END IF;
END $patch$;
COMMIT;
