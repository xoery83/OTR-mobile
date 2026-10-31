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
