-- Definitions-only candidate. Requires reviewed helper/proof patches in the same
-- SourceWriter transaction; no grants, configuration or execution window here.
CREATE FUNCTION public.trip_source_finite_native_material(actor uuid,trip uuid,pin public.trip_source_inputs,writing boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE q jsonb;v jsonb;original public.trip_source_representations;chosen public.trip_source_representations;
BEGIN
 IF writing IS NULL OR pin.confirmation_id IS NOT NULL OR pin.historical_selection IS DISTINCT FROM false
 OR current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' THEN RETURN false;END IF;
 IF NOT writing AND public.trip_source_finite_native_retained_pin(actor,trip,pin) IS TRUE THEN RETURN true;END IF;
 BEGIN q:=nullif(current_setting('otr.universal.finite_batch',true),'')::jsonb;EXCEPTION WHEN invalid_text_representation THEN RETURN false;END;
 IF public.trip_event_keys(q,ARRAY['runId','batchId','taskId','submissionSha256','inputs']) IS NOT TRUE
 OR pin.run_id IS DISTINCT FROM (q->>'runId')::uuid
 OR public.trip_source_finite_native_original_scope(actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',q->'inputs') IS NOT TRUE
 THEN RETURN false;END IF;
 v:=to_jsonb(pin)-'run_id'-'confirmation_id';
 SELECT * INTO chosen FROM public.trip_source_representations WHERE id=pin.representation_id AND source_id=pin.source_id;
 IF NOT FOUND OR chosen.payload_sha256 IS DISTINCT FROM pin.payload_sha256 OR chosen.byte_count IS DISTINCT FROM pin.byte_count THEN RETURN false;END IF;
 IF chosen.role='DERIVED' AND chosen.transform_key='otr.pdf.qpdf-poppler' THEN
  IF cardinality(chosen.parent_ids) IS DISTINCT FROM 1 THEN RETURN false;END IF;
  SELECT * INTO original FROM public.trip_source_representations WHERE id=chosen.parent_ids[1] AND source_id=pin.source_id AND role='ORIGINAL' AND mime_type='application/pdf';
  IF NOT FOUND THEN RETURN false;END IF;
  v:=v||jsonb_build_object('representation_id',original.id,'payload_sha256',original.payload_sha256,'byte_count',original.byte_count);
 END IF;
 RETURN (q->'inputs') @> jsonb_build_array(v);
END $$;

CREATE FUNCTION public.trip_source_finite_native_png_material(actor uuid,trip uuid,source uuid,representation uuid,material bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE q jsonb;v jsonb;p public.trip_source_inputs;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' THEN RETURN false;END IF;
 FOR p IN SELECT i.* FROM public.trip_source_inputs i WHERE i.source_id=source AND i.representation_id=representation AND i.material_revision=material LOOP
  IF public.trip_source_finite_native_retained_pin(actor,trip,p) IS TRUE THEN RETURN true;END IF;
 END LOOP;
 BEGIN q:=nullif(current_setting('otr.universal.finite_batch',true),'')::jsonb;EXCEPTION WHEN invalid_text_representation THEN RETURN false;END;
 IF jsonb_typeof(q->'inputs') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(q->'inputs') LOOP
  IF public.trip_event_keys(v,ARRAY['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']) IS NOT TRUE THEN RETURN false;END IF;
  p:=jsonb_populate_record(NULL::public.trip_source_inputs,v||jsonb_build_object('run_id',q->>'runId','confirmation_id',NULL));
  IF p.source_id=source AND p.representation_id=representation AND p.material_revision=material
  AND public.trip_source_finite_native_material(actor,trip,p,false) IS TRUE THEN RETURN true;END IF;
 END LOOP;
 RETURN false;
END $$;

CREATE FUNCTION public.trip_source_begin_finite_universal_inputs(actor uuid,trip uuid,raw text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q jsonb;v jsonb;p public.trip_source_inputs;facts jsonb;normalized jsonb:='[]';sources uuid[];prior public.trip_source_runs;result jsonb;
 material_hash jsonb;normalized_hash jsonb;scope_row public.trip_source_universal_scope;tag jsonb;tag_count integer;proof jsonb;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 IF raw IS NULL OR octet_length(raw)>131072 THEN RAISE EXCEPTION 'INVALID_UNIVERSAL_INPUT';END IF;
 q:=public.trip_event_canonical_json(raw::json)::jsonb;
 material_hash:=q->'materialInputSha256';
 normalized_hash:=q->'normalizedInputSha256';
 q:=q-'materialInputSha256'-'normalizedInputSha256';
 PERFORM public.trip_import_scope_lock(actor,trip);
 IF public.trip_source_lock_universal_actor(actor,trip,true) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 IF public.trip_event_keys(q,ARRAY['runId','batchId','taskId','submissionSha256','inputs']) IS NOT TRUE
 OR public.trip_source_finite_native_original_scope(actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',q->'inputs') IS NOT TRUE
 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
 sources:=ARRAY(SELECT DISTINCT (i->>'source_id')::uuid FROM jsonb_array_elements(q->'inputs') i ORDER BY 1);
 PERFORM public.trip_source_lock_universal_materials(actor,trip,sources);
 SELECT * INTO prior FROM public.trip_source_runs WHERE id=(q->>'runId')::uuid;
 PERFORM set_config('otr.universal.finite_batch',q::text,true);
 FOR v IN SELECT value FROM jsonb_array_elements(q->'inputs') LOOP
  IF public.trip_event_keys(v,ARRAY['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']) IS NOT TRUE THEN RAISE EXCEPTION 'INVALID_UNIVERSAL_INPUT';END IF;
  p:=jsonb_populate_record(NULL::public.trip_source_inputs,v||jsonb_build_object('run_id',q->>'runId','confirmation_id',NULL));
  facts:=public.trip_source_universal_pdf_material(actor,trip,p,true,prior.id IS NULL);
  normalized:=normalized||jsonb_build_array(coalesce(facts->'input',v));
 END LOOP;
 SELECT * INTO scope_row FROM public.trip_source_universal_scope s WHERE s.singleton AND s.run_id=(q->>'runId')::uuid;
 IF FOUND AND jsonb_typeof(scope_row.source_command_pins)='array' THEN
  SELECT count(*),jsonb_agg(x.v)->0 INTO tag_count,tag
   FROM jsonb_array_elements(scope_row.source_command_pins) x(v) WHERE x.v ? 'mixedBInitial';
 END IF;
 IF coalesce(tag_count,0)>0 THEN
  IF tag_count<>1 OR material_hash IS NULL OR jsonb_typeof(normalized_hash) IS DISTINCT FROM 'string'
   OR (normalized_hash #>> '{}') !~ '^[a-f0-9]{64}$' OR prior.id IS NOT NULL
  THEN RAISE EXCEPTION 'MIXED_B_RUN_WRITE_DENIED';END IF;
  proof:=public.trip_source_find_finite_universal_binding(actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,
   (q->>'runId')::uuid,q->>'submissionSha256',jsonb_build_object('version','otr.import.mixed-b-pre-run/1',
    'initialManifest',tag->'mixedBInitial'->'manifest','inputs',q->'inputs','normalizedInputs',normalized,'materialInputSha256',material_hash));
  IF proof->'normalizedInputSha256' IS DISTINCT FROM normalized_hash
   OR proof->>'normalizedInputSha256' IS DISTINCT FROM public.trip_import_run_input_hash(normalized)
  THEN RAISE EXCEPTION 'MIXED_B_RUN_WRITE_DENIED';END IF;
 ELSIF material_hash IS NOT NULL OR normalized_hash IS NOT NULL THEN RAISE EXCEPTION 'MIXED_B_RUN_WRITE_DENIED';END IF;
 PERFORM set_config('otr.universal.finite_normalized',normalized::text,true);
 result:=public.trip_source_begin_universal_inputs(actor,trip,jsonb_set(q,'{inputs}',normalized)::text);
 IF proof IS NOT NULL AND (result->>'input_sha256' IS DISTINCT FROM proof->>'normalizedInputSha256'
  OR clock_timestamp()<scope_row.starts_at OR clock_timestamp()>=scope_row.expires_at)
 THEN RAISE EXCEPTION 'MIXED_B_RUN_WRITE_DENIED';END IF;
 PERFORM set_config('otr.universal.finite_batch','',true);
 PERFORM set_config('otr.universal.finite_normalized','',true);
 RETURN result;
END $$;

CREATE FUNCTION public.trip_source_finite_native_run_row(tab text,op text,n jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE q jsonb;pins jsonb;r public.trip_source_runs;i public.trip_source_inputs;expected uuid[];
 scope_row public.trip_source_universal_scope;tag jsonb;tag_count integer;proof jsonb;
BEGIN
 IF tab='trip_source_runs' AND op='INSERT' THEN
  r:=jsonb_populate_record(NULL::public.trip_source_runs,n);
  SELECT * INTO scope_row FROM public.trip_source_universal_scope s WHERE s.singleton
   AND (s.run_id=r.id OR s.task_id=r.interpretation_task_id OR
    (s.actor_id=r.actor_account_id AND s.trip_id=r.trip_id AND s.batch_id=r.capture_batch_id));
  IF FOUND AND jsonb_typeof(scope_row.source_command_pins)='array' THEN
   SELECT count(*),jsonb_agg(x.v)->0 INTO tag_count,tag
    FROM jsonb_array_elements(scope_row.source_command_pins) x(v) WHERE x.v ? 'mixedBInitial';
  END IF;
  IF coalesce(tag_count,0)>0 AND (tag_count<>1 OR nullif(current_setting('otr.universal.finite_batch',true),'') IS NULL)
  THEN RAISE EXCEPTION 'MIXED_B_RUN_WRITE_DENIED';END IF;
 END IF;
 IF nullif(current_setting('otr.universal.finite_batch',true),'') IS NULL THEN RETURN false;END IF;
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR op IS DISTINCT FROM 'INSERT' OR tab NOT IN ('trip_source_runs','trip_source_inputs') THEN RAISE EXCEPTION 'UNIVERSAL_RUN_WRITE_DENIED';END IF;
 q:=current_setting('otr.universal.finite_batch',true)::jsonb;pins:=nullif(current_setting('otr.universal.finite_normalized',true),'')::jsonb;
 IF public.trip_event_keys(q,ARRAY['runId','batchId','taskId','submissionSha256','inputs']) IS NOT TRUE
 OR jsonb_typeof(pins) IS DISTINCT FROM 'array' OR jsonb_array_length(pins) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'UNIVERSAL_RUN_WRITE_DENIED';END IF;
 IF tab='trip_source_runs' THEN r:=jsonb_populate_record(NULL::public.trip_source_runs,n);
 ELSE
  i:=jsonb_populate_record(NULL::public.trip_source_inputs,n);
  SELECT * INTO r FROM public.trip_source_runs WHERE id=i.run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNIVERSAL_RUN_WRITE_DENIED';END IF;
 END IF;
 IF r.id IS DISTINCT FROM (q->>'runId')::uuid OR r.capture_batch_id IS DISTINCT FROM (q->>'batchId')::uuid
 OR r.interpretation_task_id IS DISTINCT FROM (q->>'taskId')::uuid OR r.capture_submission_sha256 IS DISTINCT FROM q->>'submissionSha256'
 OR public.trip_source_finite_native_original_scope(r.actor_account_id,r.trip_id,r.capture_batch_id,r.interpretation_task_id,r.id,r.capture_submission_sha256,q->'inputs') IS NOT TRUE
 THEN RAISE EXCEPTION 'UNIVERSAL_RUN_WRITE_DENIED';END IF;
 expected:=ARRAY(SELECT DISTINCT (v->>'source_id')::uuid FROM jsonb_array_elements(q->'inputs') v ORDER BY 1);
 IF r.scope_source_ids IS DISTINCT FROM expected OR r.input_sha256 IS DISTINCT FROM public.trip_import_run_input_hash(pins)
 OR r.scope_sha256 IS DISTINCT FROM public.trip_source_hash('otr-source-run-scope-v1',jsonb_build_array(1,r.trip_id,r.actor_account_id,to_jsonb(expected)))
 OR r.row_revision IS DISTINCT FROM 1 OR r.state IS DISTINCT FROM 'PENDING' OR r.retention_state IS DISTINCT FROM 'RETAINED'
 OR r.superseded_by IS NOT NULL OR r.completed_at IS NOT NULL OR r.error_code IS NOT NULL
 OR r.extractor_key IS DISTINCT FROM 'otr-universal-interpretation-v1' OR r.extractor_version IS DISTINCT FROM '1'
 OR r.operation_key IS DISTINCT FROM 'universal:'||r.capture_batch_id::text OR r.extractor_options_sha256 IS DISTINCT FROM r.capture_submission_sha256
 OR r.created_at IS NULL OR r.created_at>clock_timestamp()
 OR NOT EXISTS(SELECT 1 FROM public.trip_source_universal_scope s WHERE s.singleton AND s.run_id=r.id AND r.created_at>=s.starts_at)
 THEN RAISE EXCEPTION 'UNIVERSAL_RUN_WRITE_DENIED';END IF;
 IF tab='trip_source_runs' THEN
  IF tag_count=1 THEN
   proof:=public.trip_source_find_finite_universal_binding(r.actor_account_id,r.trip_id,r.capture_batch_id,r.interpretation_task_id,r.id,
    r.capture_submission_sha256,jsonb_build_object('version','otr.import.mixed-b-pre-run/1','initialManifest',tag->'mixedBInitial'->'manifest',
     'inputs',q->'inputs','normalizedInputs',pins,'materialInputSha256',scope_row.input_sha256));
   IF proof->>'normalizedInputSha256' IS DISTINCT FROM r.input_sha256 THEN RAISE EXCEPTION 'MIXED_B_RUN_WRITE_DENIED';END IF;
  END IF;
  IF to_jsonb(r) IS DISTINCT FROM n OR public.trip_source_finite_native_normalized_scope(r.actor_account_id,r.trip_id,r.capture_batch_id,r.interpretation_task_id,r.id,r.capture_submission_sha256,pins) IS NOT TRUE
  THEN RAISE EXCEPTION 'UNIVERSAL_RUN_WRITE_DENIED';END IF;
 ELSE
  IF to_jsonb(i) IS DISTINCT FROM n OR i.confirmation_id IS NOT NULL OR i.historical_selection IS DISTINCT FROM false
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pins) p(v) WHERE p.v=(to_jsonb(i)-'run_id'-'confirmation_id'))
  OR public.trip_import_input_valid(i,r.actor_account_id,r.trip_id,true) IS NOT TRUE THEN RAISE EXCEPTION 'UNIVERSAL_RUN_WRITE_DENIED';END IF;
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.trip_source_find_finite_universal_binding(actor uuid,trip uuid,batch uuid,task uuid,run uuid,submission text,originals jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.trip_source_runs;p public.trip_source_inputs;rep public.trip_source_representations;facts jsonb;v jsonb;pins jsonb:='[]';projected jsonb:='[]';scope_row public.trip_source_universal_scope;command_pin jsonb;relation regclass;source_row public.trip_sources;source_found boolean;representation_found boolean;prospective_hash text;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 PERFORM public.trip_import_scope_lock(actor,trip);
 IF public.trip_source_lock_universal_actor(actor,trip,false) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 SELECT * INTO r FROM public.trip_source_runs WHERE id=run;
 IF NOT FOUND THEN
  IF public.trip_source_finite_native_identity(actor,trip,run) IS NOT TRUE
  OR EXISTS(SELECT 1 FROM public.trip_source_runs x WHERE x.actor_account_id=actor
    AND (x.trip_id=trip AND x.capture_batch_id=batch OR x.interpretation_task_id=task))
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  SELECT * INTO scope_row FROM public.trip_source_universal_scope s WHERE s.singleton AND s.actor_id=actor AND s.trip_id=trip
   AND s.batch_id=batch AND s.task_id=task AND s.run_id=run AND s.submission_sha256=submission
   AND clock_timestamp()>=s.starts_at AND clock_timestamp()<s.expires_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  -- Protected server profile, never a caller MIME/filename/local-status inference.
  IF jsonb_typeof(scope_row.source_command_pins)='array' AND jsonb_array_length(scope_row.source_command_pins)=1
   AND scope_row.source_command_pins->0->>'profile'='OTR_UTF8_TEXT_FILE_V1' THEN
   command_pin:=scope_row.source_command_pins->0;
   IF jsonb_typeof(originals) IS DISTINCT FROM 'array' OR jsonb_array_length(originals)<>1
   OR public.trip_event_keys(command_pin,ARRAY['profile','actorId','tripId','sourceId','representationId','operationId','operationKey','operationSha256']) IS NOT TRUE
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   v:=originals->0;
   IF public.trip_event_keys(v,ARRAY['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']) IS NOT TRUE
   OR jsonb_typeof(v->'id') IS DISTINCT FROM 'string' OR v->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(v->'source_id') IS DISTINCT FROM 'string' OR v->>'source_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(v->'representation_id') IS DISTINCT FROM 'string' OR v->>'representation_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(v->'payload_sha256') IS DISTINCT FROM 'string' OR v->>'payload_sha256' !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(v->'byte_count') IS DISTINCT FROM 'number' OR v->>'byte_count' !~ '^[1-9][0-9]{0,5}$'
   OR (v->>'byte_count')::bigint>262144 OR v->'material_revision' IS DISTINCT FROM '1'::jsonb
   OR v->'observed_source_row_revision' IS DISTINCT FROM '1'::jsonb OR v->'historical_selection' IS DISTINCT FROM 'false'::jsonb
   OR command_pin->>'actorId' IS DISTINCT FROM actor::text OR command_pin->>'tripId' IS DISTINCT FROM trip::text
   OR command_pin->'sourceId' IS DISTINCT FROM v->'source_id' OR command_pin->'representationId' IS DISTINCT FROM v->'representation_id'
   OR jsonb_typeof(command_pin->'operationId') IS DISTINCT FROM 'string' OR command_pin->>'operationId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(command_pin->'operationKey') IS DISTINCT FROM 'string' OR command_pin->>'operationKey' !~ '^[A-Za-z0-9._:-]{1,128}$'
   OR jsonb_typeof(command_pin->'operationSha256') IS DISTINCT FROM 'string' OR command_pin->>'operationSha256' !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   -- Check effective visibility in this actual SourceWriter transaction, not a metadata snapshot.
   FOREACH relation IN ARRAY ARRAY['public.trip_sources'::regclass,'public.trip_source_representations'::regclass] LOOP
    IF NOT has_table_privilege(current_user,relation,'SELECT') OR row_security_active(relation) AND (
     NOT EXISTS(SELECT 1 FROM pg_policy policy WHERE policy.polrelid=relation AND policy.polpermissive
       AND policy.polcmd IN ('r','*') AND current_user::regrole=ANY(policy.polroles) AND pg_get_expr(policy.polqual,policy.polrelid)='true')
     OR EXISTS(SELECT 1 FROM pg_policy policy WHERE policy.polrelid=relation AND NOT policy.polpermissive)
    ) THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   END LOOP;
   -- Observe both global UUIDs in one statement snapshot, not two independent absence reads.
   SELECT EXISTS(SELECT 1 FROM public.trip_sources WHERE id=(v->>'source_id')::uuid),
     EXISTS(SELECT 1 FROM public.trip_source_representations WHERE id=(v->>'representation_id')::uuid)
    INTO source_found,representation_found;
   IF NOT source_found AND NOT representation_found THEN
    -- Prospective initial-original descriptor only; never stored/returned as Source facts.
    prospective_hash:=public.trip_source_hash('otr-source-run-input-v1',jsonb_build_array(1,jsonb_build_array(jsonb_build_array(
     v->'id',v->'source_id',v->'material_revision',v->'representation_id',v->'payload_sha256',v->'byte_count',
     v->'observed_source_row_revision',v->'historical_selection',1,'ORIGINAL','TEXT',NULL,NULL,NULL,'[]'::jsonb))));
    IF scope_row.input_sha256 IS DISTINCT FROM prospective_hash OR clock_timestamp()<scope_row.starts_at OR clock_timestamp()>=scope_row.expires_at
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
    RETURN NULL; -- Exact Task/Run absent only: not Source acceptance/NoCommit/retry authority.
   END IF;
   -- An existing/partial/colliding identity is never projected into a missing original.
   SELECT * INTO source_row FROM public.trip_sources WHERE id=(v->>'source_id')::uuid;
   SELECT * INTO rep FROM public.trip_source_representations WHERE id=(v->>'representation_id')::uuid;
   p:=jsonb_populate_record(NULL::public.trip_source_inputs,v||jsonb_build_object('run_id',run,'confirmation_id',NULL));
   IF NOT source_found OR NOT representation_found OR source_row.id IS NULL OR rep.id IS NULL OR source_row.trip_id IS DISTINCT FROM trip OR source_row.acquired_by IS DISTINCT FROM actor
   OR source_row.source_kind IS DISTINCT FROM 'FILE' OR source_row.acquisition_channel IS DISTINCT FROM 'FILES'
   OR source_row.acquisition_key IS DISTINCT FROM command_pin->>'operationKey'
   OR rep.source_id IS DISTINCT FROM p.source_id OR rep.introduced_revision IS DISTINCT FROM 1
   OR rep.role IS DISTINCT FROM 'ORIGINAL' OR rep.material_kind IS DISTINCT FROM 'TEXT' OR rep.encoding IS DISTINCT FROM 'UTF-8'
   OR rep.transform_key IS NOT NULL OR rep.transform_version IS NOT NULL OR rep.transform_options_sha256 IS NOT NULL OR cardinality(rep.parent_ids) IS DISTINCT FROM 0
   OR public.trip_import_input_valid(p,actor,trip,true) IS NOT TRUE
   THEN RAISE EXCEPTION 'INPUT_STALE';END IF;
   PERFORM public.trip_source_lock_universal_materials(actor,trip,ARRAY[p.source_id]);
  END IF;
  IF public.trip_source_finite_native_original_scope(actor,trip,batch,task,run,submission,originals) IS NOT TRUE
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  RETURN NULL;
 END IF;
 IF r.actor_account_id IS DISTINCT FROM actor OR r.trip_id IS DISTINCT FROM trip OR r.capture_batch_id IS DISTINCT FROM batch
 OR r.interpretation_task_id IS DISTINCT FROM task OR r.capture_submission_sha256 IS DISTINCT FROM submission
 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
 PERFORM public.trip_source_lock_universal_materials(actor,trip,r.scope_source_ids);
 FOR p IN SELECT * FROM public.trip_source_inputs WHERE run_id=r.id ORDER BY id LOOP
  IF public.trip_source_finite_native_retained_pin(actor,trip,p) IS NOT TRUE THEN RAISE EXCEPTION 'INPUT_STALE';END IF;
  v:=to_jsonb(p)-'run_id'-'confirmation_id';
  SELECT * INTO rep FROM public.trip_source_representations WHERE id=p.representation_id AND source_id=p.source_id;
  IF rep.role='DERIVED' AND rep.transform_key='otr.pdf.qpdf-poppler' THEN
   facts:=public.trip_source_universal_pdf_material(actor,trip,p,false,false);
   IF facts IS NULL THEN RAISE EXCEPTION 'UNIVERSAL_PDF_MATERIAL_UNAVAILABLE';END IF;
   pins:=pins||jsonb_build_array(v||jsonb_build_object('pdfSource',facts->'pdfSource'));
   v:=v||jsonb_build_object('representation_id',facts->'pdfSource'->'original'->>'representationId','payload_sha256',facts->'pdfSource'->'original'->>'sha256','byte_count',facts->'pdfSource'->'original'->'byteCount');
  ELSE pins:=pins||jsonb_build_array(v);END IF;
  projected:=projected||jsonb_build_array(v);
 END LOOP;
 IF jsonb_typeof(originals) IS DISTINCT FROM 'array' OR jsonb_array_length(pins) NOT BETWEEN 1 AND 64
 OR (SELECT jsonb_agg(e.item ORDER BY e.item->>'id' COLLATE "C") FROM jsonb_array_elements(projected) e(item))
 IS DISTINCT FROM (SELECT jsonb_agg(e.item ORDER BY e.item->>'id' COLLATE "C") FROM jsonb_array_elements(originals) e(item))
 THEN RAISE EXCEPTION 'OPERATION_KEY_REUSED';END IF;
 RETURN jsonb_build_object('actorId',actor,'tripId',trip,'batchId',batch,'submissionSha256',submission,'runId',run,'taskId',task,'generation',r.generation,'createdAt',r.created_at,'inputs',pins);
END $$;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_material(uuid,uuid,public.trip_source_inputs,boolean) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_png_material(uuid,uuid,uuid,uuid,bigint) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_begin_finite_universal_inputs(uuid,uuid,text) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_find_finite_universal_binding(uuid,uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_run_row(text,text,jsonb) FROM PUBLIC,otr_trip_source_command_gateway;
DO $$
DECLARE p record;seen integer:=0;owner_oid oid:='otr_trip_source_writer'::regrole;
BEGIN
 IF current_user<>'otr_trip_source_writer' THEN RAISE EXCEPTION 'SOURCE_FINITE_ROUTE_OWNER_REJECTED';END IF;
 FOR p IN SELECT oid,proname,proowner,prosecdef,proconfig,proacl FROM pg_proc
 WHERE pronamespace='public'::regnamespace AND proname IN
 ('trip_source_finite_native_material','trip_source_finite_native_png_material','trip_source_begin_finite_universal_inputs','trip_source_find_finite_universal_binding','trip_source_finite_native_run_row') LOOP
  seen:=seen+1;
  IF p.proowner IS DISTINCT FROM owner_oid OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  OR p.prosecdef IS DISTINCT FROM (p.proname IN ('trip_source_begin_finite_universal_inputs','trip_source_find_finite_universal_binding'))
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_oid OR a.privilege_type<>'EXECUTE')
  THEN RAISE EXCEPTION 'SOURCE_FINITE_ROUTE_ACL_REJECTED';END IF;
 END LOOP;
 IF seen<>5 THEN RAISE EXCEPTION 'SOURCE_FINITE_ROUTE_SIGNATURE_REJECTED';END IF;
END $$;
