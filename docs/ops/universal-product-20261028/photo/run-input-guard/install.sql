-- Candidate only: exact Owner approval and fresh DEV CAS required; no activation.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
DO $pre$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres' OR has_schema_privilege('otr_trip_source_writer','public','CREATE') THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_MAINTENANCE_DRIFT';END IF;
 IF (SELECT count(*) FROM pg_auth_members WHERE roleid='otr_trip_source_writer'::regrole AND member='postgres'::regrole AND grantor='postgres'::regrole AND NOT admin_option AND NOT inherit_option AND NOT set_option)<>1 THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_EDGE_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=66391 AND oid='public.trip_source_sustained_run_row(text,text,jsonb)'::regprocedure AND md5(pg_get_functiondef(oid))='8ef354beae3cb950d024ce17c7f200b5' AND proowner='otr_trip_source_writer'::regrole AND proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer}' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog']) THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_FUNCTION_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.trip_source_png_original_facts(uuid,uuid,uuid,uuid,bigint)'::regprocedure)) IS DISTINCT FROM 'a2945b7def0e9e5a19d4a66bd1e5a951' OR md5(pg_get_functiondef('public.trip_sustained_universal_png_allowed(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '154c474f5a6a7cf2025a763896b52edd' OR md5(pg_get_functiondef('public.trip_source_universal_pdf_material(uuid,uuid,public.trip_source_inputs,boolean,boolean)'::regprocedure)) IS DISTINCT FROM 'b2a172f8f2d769f6b8ca6431c8621cfc' OR md5(pg_get_functiondef('public.trip_import_input_valid(public.trip_source_inputs,uuid,uuid,boolean)'::regprocedure)) IS DISTINCT FROM 'f2c1fe413245b68e6e242177a8bd51a6' THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_DEPENDENCY_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND NOT universal_png_import_enabled AND universal_png_import_expires_at IS NULL) THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_NOT_CLOSED';END IF;
 IF md5((jsonb_build_object('source',(SELECT to_jsonb(s) FROM public.trip_sources s WHERE id='df39c9b2-fc19-4baa-8c7c-aafd0f04726f'),'representation',(SELECT to_jsonb(r) FROM public.trip_source_representations r WHERE id='9bf0ad08-8a4c-4bd9-91ce-2e2e35ac4d4b'),'upload',(SELECT to_jsonb(o) FROM public.trip_source_operations o WHERE id='d2f59e69-59c0-83bf-b745-a2c6727cb618'),'verify',(SELECT to_jsonb(o) FROM public.trip_source_operations o WHERE id='5cc29190-4716-840d-8dd0-93c2f7379407')))::text) IS DISTINCT FROM 'c3cff8ff6d2c120908654222cd96189e' THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_TARGET_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_source_runs WHERE capture_batch_id='e7dfba6d-fa6a-49e5-8cc7-563e9b6eff84' OR 'df39c9b2-fc19-4baa-8c7c-aafd0f04726f'::uuid=ANY(scope_source_ids)) THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_ACCEPTED_NO_REVERSE';END IF;
END $pre$;
CREATE TEMP TABLE photo_run_pin_graph ON COMMIT DROP AS SELECT * FROM pg_auth_members;
CREATE TEMP TABLE photo_run_pin_schema ON COMMIT DROP AS SELECT nspacl FROM pg_namespace WHERE nspname='public';
CREATE TEMP TABLE photo_run_pin_function ON COMMIT DROP AS SELECT oid,proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.trip_source_sustained_run_row(text,text,jsonb)'::regprocedure;
GRANT otr_trip_source_writer TO postgres WITH INHERIT true,SET true;
GRANT CREATE ON SCHEMA public TO otr_trip_source_writer;
CREATE OR REPLACE FUNCTION public.trip_source_sustained_run_row(tab text, op text, n jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r public.trip_source_runs;i public.trip_source_inputs;s public.trip_sources;rep public.trip_source_representations;
BEGIN
 IF session_user<>'otr_trip_source_command_gateway' OR current_user<>'otr_trip_source_writer' THEN RETURN false;END IF;
 IF tab='trip_source_runs' THEN r:=jsonb_populate_record(null::public.trip_source_runs,n);
 ELSIF tab IN ('trip_source_inputs','trip_source_candidates') THEN SELECT * INTO r FROM public.trip_source_runs WHERE id=(n->>'run_id')::uuid;
 ELSE RETURN false;END IF;
 IF r.extractor_key IS DISTINCT FROM 'otr-universal-interpretation-v1' OR NOT public.trip_sustained_universal_allowed(r.actor_account_id,r.trip_id) THEN RETURN false;END IF;
 IF op<>'INSERT' OR tab NOT IN ('trip_source_runs','trip_source_inputs') OR r.state IS DISTINCT FROM 'PENDING' OR r.row_revision IS DISTINCT FROM 1
 OR r.retention_state IS DISTINCT FROM 'RETAINED' OR r.superseded_by IS NOT NULL OR r.completed_at IS NOT NULL OR r.error_code IS NOT NULL
 OR r.capture_batch_id IS NULL OR r.interpretation_task_id IS NULL OR r.capture_submission_sha256 !~ '^[a-f0-9]{64}$'
 OR r.extractor_version IS DISTINCT FROM '1' OR r.operation_key IS DISTINCT FROM 'universal:'||r.capture_batch_id::text
 OR r.extractor_options_sha256 IS DISTINCT FROM r.capture_submission_sha256 OR r.created_at IS NULL OR r.created_at>clock_timestamp()
 OR NOT public.trip_source_uuid_array_valid(r.scope_source_ids,1,64)
 OR r.scope_sha256 IS DISTINCT FROM public.trip_source_hash('otr-source-run-scope-v1',jsonb_build_array(1,r.trip_id,r.actor_account_id,to_jsonb(r.scope_source_ids)))
 THEN RAISE EXCEPTION 'UNIVERSAL_SUSTAINED_RUN_DENIED';END IF;
 IF (SELECT count(*) FROM public.trip_sources WHERE id=ANY(r.scope_source_ids) AND trip_id=r.trip_id AND acquired_by=r.actor_account_id AND lifecycle='ACTIVE' AND retention_state='RETAINED' AND current_material_revision=1)<>cardinality(r.scope_source_ids) THEN RAISE EXCEPTION 'INPUT_STALE';END IF;
 IF tab='trip_source_inputs' THEN
  i:=jsonb_populate_record(null::public.trip_source_inputs,n);
  SELECT * INTO s FROM public.trip_sources WHERE id=i.source_id;
  SELECT * INTO rep FROM public.trip_source_representations WHERE source_id=i.source_id AND id=i.representation_id;
  IF to_jsonb(i) IS DISTINCT FROM n OR i.confirmation_id IS NOT NULL OR i.material_revision IS DISTINCT FROM 1 OR i.historical_selection IS DISTINCT FROM false
  OR NOT i.source_id=ANY(r.scope_source_ids) OR NOT public.trip_import_input_valid(i,r.actor_account_id,r.trip_id,true)
  OR (CASE WHEN rep.role='ORIGINAL' AND rep.material_kind='TEXT' AND rep.encoding='UTF-8'
   AND rep.remote_state='NOT_APPLICABLE' AND rep.byte_count BETWEEN 1 AND 262144 AND rep.byte_count=octet_length(rep.text_content)
   AND (s.source_kind='TEXT' AND s.acquisition_channel='PASTE' OR s.source_kind='FILE' AND s.acquisition_channel='FILES')
   THEN false
   WHEN rep.role='ORIGINAL' AND rep.material_kind='BINARY' AND rep.mime_type='image/png'
   THEN public.trip_sustained_universal_png_allowed(r.actor_account_id,r.trip_id) IS NOT TRUE
    OR cardinality(r.scope_source_ids) IS DISTINCT FROM 1
    OR public.trip_source_png_original_facts(r.actor_account_id,r.trip_id,i.source_id,i.representation_id,i.material_revision) IS NULL
   ELSE public.trip_source_universal_pdf_material(r.actor_account_id,r.trip_id,i,false,true) IS NULL END)
  THEN RAISE EXCEPTION 'INPUT_STALE';END IF;
 ELSIF to_jsonb(r) IS DISTINCT FROM n THEN RAISE EXCEPTION 'UNIVERSAL_SUSTAINED_RUN_DENIED';END IF;
 RETURN true;
END $function$
;
REVOKE CREATE ON SCHEMA public FROM otr_trip_source_writer;
GRANT otr_trip_source_writer TO postgres WITH ADMIN false,INHERIT false,SET false;
DO $post$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM photo_run_pin_graph m) OR (SELECT nspacl FROM pg_namespace WHERE nspname='public') IS DISTINCT FROM (SELECT nspacl FROM photo_run_pin_schema) OR has_schema_privilege('otr_trip_source_writer','public','CREATE') THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_MAINTENANCE_NOT_RESTORED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN photo_run_pin_function f ON p.oid=f.oid AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.prosecdef=f.prosecdef AND p.proconfig IS NOT DISTINCT FROM f.proconfig WHERE p.oid='public.trip_source_sustained_run_row(text,text,jsonb)'::regprocedure AND md5(pg_get_functiondef(p.oid))='661c2130343a42aaa987ecc84c95fd16') THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_POSTIMAGE_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND NOT universal_png_import_enabled AND universal_png_import_expires_at IS NULL) THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_NOT_CLOSED';END IF;
 IF md5((jsonb_build_object('source',(SELECT to_jsonb(s) FROM public.trip_sources s WHERE id='df39c9b2-fc19-4baa-8c7c-aafd0f04726f'),'representation',(SELECT to_jsonb(r) FROM public.trip_source_representations r WHERE id='9bf0ad08-8a4c-4bd9-91ce-2e2e35ac4d4b'),'upload',(SELECT to_jsonb(o) FROM public.trip_source_operations o WHERE id='d2f59e69-59c0-83bf-b745-a2c6727cb618'),'verify',(SELECT to_jsonb(o) FROM public.trip_source_operations o WHERE id='5cc29190-4716-840d-8dd0-93c2f7379407')))::text) IS DISTINCT FROM 'c3cff8ff6d2c120908654222cd96189e' THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_TARGET_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_source_runs WHERE capture_batch_id='e7dfba6d-fa6a-49e5-8cc7-563e9b6eff84' OR 'df39c9b2-fc19-4baa-8c7c-aafd0f04726f'::uuid=ANY(scope_source_ids)) THEN RAISE EXCEPTION 'PHOTO_RUN_PIN_ACCEPTED_NO_REVERSE';END IF;
END $post$;
COMMIT;
