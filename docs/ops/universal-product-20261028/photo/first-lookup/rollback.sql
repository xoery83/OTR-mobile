-- Candidate only. Fresh DEV CAS and exact Owner approval required. Default CLOSED.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
DO $pre$ BEGIN
 IF current_user<>'postgres' OR has_schema_privilege('otr_trip_source_writer','public','CREATE') THEN RAISE EXCEPTION 'PHOTO_LOOKUP_MAINTENANCE_DRIFT';END IF;
 IF (SELECT count(*) FROM pg_auth_members WHERE roleid='otr_trip_source_writer'::regrole AND member='postgres'::regrole AND grantor='postgres'::regrole AND NOT admin_option AND NOT inherit_option AND NOT set_option)<>1 THEN RAISE EXCEPTION 'PHOTO_LOOKUP_EDGE_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=66243 AND oid='public.trip_source_universal_original_pin()'::regprocedure AND md5(pg_get_functiondef(oid))='184156c3861e9f50697b88d6774f124d' AND proowner='otr_trip_source_writer'::regrole AND proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer}') THEN RAISE EXCEPTION 'PHOTO_LOOKUP_FUNCTION_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND NOT universal_png_import_enabled AND universal_png_import_expires_at IS NULL) THEN RAISE EXCEPTION 'PHOTO_LOOKUP_NOT_CLOSED';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_sources WHERE id='2bf0294a-47df-4176-999f-0e352e34543c') OR EXISTS(SELECT 1 FROM public.trip_source_representations WHERE id='27b93994-98f3-4f76-8d15-93a52a0aeb21') OR EXISTS(SELECT 1 FROM public.trip_source_operations WHERE id='37d5cd82-f6bf-433c-8031-47fc00f509c0') THEN RAISE EXCEPTION 'PHOTO_LOOKUP_ARTIFACT_PRESENT_NO_REVERSE';END IF;
END $pre$;
CREATE TEMP TABLE photo_lookup_graph ON COMMIT DROP AS SELECT * FROM pg_auth_members;
CREATE TEMP TABLE photo_lookup_schema ON COMMIT DROP AS SELECT nspacl FROM pg_namespace WHERE nspname='public';
CREATE TEMP TABLE photo_lookup_function ON COMMIT DROP AS SELECT oid,proowner,proacl FROM pg_proc WHERE oid='public.trip_source_universal_original_pin()'::regprocedure;
GRANT otr_trip_source_writer TO postgres WITH INHERIT true,SET true;
GRANT CREATE ON SCHEMA public TO otr_trip_source_writer;
CREATE OR REPLACE FUNCTION public.trip_source_universal_original_pin()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare png_p jsonb;
begin
 begin png_p:=nullif(current_setting('otr.universal.source_pin',true),'')::jsonb;exception when others then return null;end;
 if png_p->>'profile'='OTR_PNG_CAPTURE_ORIGINAL_V1' then
  if jsonb_typeof(png_p) is distinct from 'object' or not(png_p?&array['profile','access','actor','trip','source','representation','operation','key','digest','sha256','byteCount','filename','acquisitionSha256','captureSha256'])
   or (select count(*) from jsonb_object_keys(png_p))<>14 or exists(select 1 from unnest(array['source','representation','operation']) k where png_p->>k is null or png_p->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   or exists(select 1 from unnest(array['digest','acquisitionSha256','captureSha256']) k where png_p->>k is null or png_p->>k !~ '^[0-9a-f]{64}$')
   or png_p->>'key' is null or png_p->>'key' !~ '^[A-Za-z0-9._:-]{1,128}$' then return null;end if;
  if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' or png_p->>'actor' is distinct from 'f4b059c5-8241-4ffb-aa15-37fa25474543' or png_p->>'trip' is distinct from '825f79b2-4a9d-4535-a62e-43000ca50c4a'
   or png_p->>'sha256' is distinct from '078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515' or png_p->>'byteCount' is distinct from '42630' or png_p->>'access' is null or png_p->>'access' not in ('ACQUIRE','READ_RECEIPT') then return null;end if;
  if png_p->>'access'='ACQUIRE' then
   if not public.trip_sustained_universal_png_allowed('f4b059c5-8241-4ffb-aa15-37fa25474543','825f79b2-4a9d-4535-a62e-43000ca50c4a') then return null;end if;
  elsif not exists(select 1 from public.trip_sources s join public.trip_source_representations r on r.source_id=s.id where s.id=(png_p->>'source')::uuid
   and r.id=(png_p->>'representation')::uuid and s.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid and s.acquired_by='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid and s.retention_state='RETAINED'
   and r.role='ORIGINAL' and r.material_kind='BINARY' and r.mime_type='image/png' and r.payload_sha256='078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515' and r.byte_count=42630 and r.retention_state='RETAINED') then return null;end if;
  return png_p;
 else
 
declare p jsonb;begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then return null;end if;
 begin p:=current_setting('otr.universal.source_pin',true)::jsonb;exception when others then return null;end;
 if p->>'profile'='OTR_PDF_CAPTURE_ORIGINAL_V1' then
  if public.trip_event_keys(p,array['profile','actorId','tripId','sourceId','operationId','operationKey','operationSha256','representationId','access','pdfOriginal']) is not true
   or public.trip_event_keys(p->'pdfOriginal',array['sha256','byteCount','filename']) is not true
   or p->>'actorId' is distinct from 'f4b059c5-8241-4ffb-aa15-37fa25474543' or p->>'tripId' is distinct from '825f79b2-4a9d-4535-a62e-43000ca50c4a'
   or p->>'access' is null or p->>'access' not in ('ACQUIRE','READ_RECEIPT')
   or p->'pdfOriginal'->>'sha256' is null or p->'pdfOriginal'->>'sha256' !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p->'pdfOriginal'->'byteCount') is distinct from 'number'
   or (p->'pdfOriginal'->>'byteCount')::numeric not between 1 and 4194304
   or (p->'pdfOriginal'->>'byteCount')::numeric<>trunc((p->'pdfOriginal'->>'byteCount')::numeric)
   or p->'pdfOriginal'->>'filename' is null or length(p->'pdfOriginal'->>'filename') not between 1 and 255
   or p->'pdfOriginal'->>'filename' !~* '\.pdf$'
   or public.trip_sustained_universal_allowed((p->>'actorId')::uuid,(p->>'tripId')::uuid) is not true
   or p->>'access'='ACQUIRE' and public.trip_sustained_universal_pdf_allowed((p->>'actorId')::uuid,(p->>'tripId')::uuid) is not true
  then return null;end if;
  -- Receipt-only lookup is fenced from DML by both owning triggers; no recursive row reads here.
  return p;
 end if;
 if p is null or not public.trip_event_keys(p,array['profile','actorId','tripId','sourceId','operationId','operationKey','operationSha256','representationId']) or
 p->>'profile' not in ('OTR_UTF8_TEXT_FILE_V1','OTR_SUBMITTED_TEXT_V1') then return null;end if;
 if not public.trip_sustained_universal_allowed((p->>'actorId')::uuid,(p->>'tripId')::uuid) and not exists(select 1 from public.trip_source_universal_scope s where s.singleton and s.actor_id=(p->>'actorId')::uuid and s.trip_id=(p->>'tripId')::uuid
 and clock_timestamp()>=s.starts_at and clock_timestamp()<s.expires_at and s.source_command_pins @>jsonb_build_array(p)) then return null;end if;
 return p;
 exception when invalid_text_representation then return null;
end;
 end if;
end;
$function$
;

REVOKE CREATE ON SCHEMA public FROM otr_trip_source_writer;
GRANT otr_trip_source_writer TO postgres WITH ADMIN false,INHERIT false,SET false;
DO $post$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM photo_lookup_graph m) OR
 (SELECT nspacl FROM pg_namespace WHERE nspname='public') IS DISTINCT FROM (SELECT nspacl FROM photo_lookup_schema) OR
 has_schema_privilege('otr_trip_source_writer','public','CREATE') THEN RAISE EXCEPTION 'PHOTO_LOOKUP_MAINTENANCE_NOT_RESTORED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN photo_lookup_function f ON p.oid=f.oid AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl WHERE md5(pg_get_functiondef('public.trip_source_universal_original_pin()'::regprocedure))='d57dfe23f3b3b4b78188b34afb24323b') THEN RAISE EXCEPTION 'PHOTO_LOOKUP_POSTIMAGE_DRIFT';END IF;
END $post$;
DROP TABLE photo_lookup_graph,photo_lookup_schema,photo_lookup_function;
COMMIT;
