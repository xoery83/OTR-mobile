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
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 IF raw IS NULL OR octet_length(raw)>131072 THEN RAISE EXCEPTION 'INVALID_UNIVERSAL_INPUT';END IF;
 q:=public.trip_event_canonical_json(raw::json)::jsonb;
 IF public.trip_event_keys(q,ARRAY['runId','batchId','taskId','submissionSha256','inputs']) IS NOT TRUE
 OR public.trip_source_finite_native_original_scope(actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',q->'inputs') IS NOT TRUE
 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
 PERFORM public.trip_import_scope_lock(actor,trip);
 IF public.trip_source_lock_universal_actor(actor,trip,true) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
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
 PERFORM set_config('otr.universal.finite_normalized',normalized::text,true);
 result:=public.trip_source_begin_universal_inputs(actor,trip,jsonb_set(q,'{inputs}',normalized)::text);
 PERFORM set_config('otr.universal.finite_batch','',true);
 PERFORM set_config('otr.universal.finite_normalized','',true);
 RETURN result;
END $$;

CREATE FUNCTION public.trip_source_finite_native_run_row(tab text,op text,n jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE q jsonb;pins jsonb;r public.trip_source_runs;i public.trip_source_inputs;expected uuid[];
BEGIN
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
DECLARE r public.trip_source_runs;p public.trip_source_inputs;rep public.trip_source_representations;facts jsonb;v jsonb;pins jsonb:='[]';projected jsonb:='[]';
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 PERFORM public.trip_import_scope_lock(actor,trip);
 IF public.trip_source_lock_universal_actor(actor,trip,false) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 SELECT * INTO r FROM public.trip_source_runs WHERE id=run;
 IF NOT FOUND THEN
  IF public.trip_source_finite_native_original_scope(actor,trip,batch,task,run,submission,originals) IS NOT TRUE
  OR EXISTS(SELECT 1 FROM public.trip_source_runs x WHERE x.actor_account_id=actor AND x.trip_id=trip AND x.capture_batch_id=batch)
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
