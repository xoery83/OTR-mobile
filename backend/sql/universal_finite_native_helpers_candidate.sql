-- Definitions-only candidate. Install only in a reviewed, default-closed SourceWriter
-- ownership/ACL envelope; not an automatic migration or execution authorization.
CREATE FUNCTION public.trip_source_finite_native_identity(actor uuid, trip uuid, run uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE s public.trip_source_universal_scope;r public.trip_source_runs;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR actor IS NULL OR trip IS NULL OR run IS NULL THEN RETURN false;END IF;
 -- Never infer global ABSENT while a row policy can hide an existing Run.
 IF row_security_active('public.trip_source_runs'::regclass) AND (
  NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.trip_source_runs'::regclass
    AND p.polpermissive AND p.polcmd IN ('r','*') AND current_user::regrole=ANY(p.polroles)
    AND pg_get_expr(p.polqual,p.polrelid)='true')
  OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.trip_source_runs'::regclass AND NOT p.polpermissive)
 ) THEN RETURN false;END IF;
 -- Same finite close lock; scope SELECT must not acquire an UPDATE privilege.
 PERFORM pg_advisory_xact_lock_shared(714024,2);
 SELECT * INTO s FROM public.trip_source_universal_scope WHERE singleton AND actor_id=actor AND trip_id=trip AND run_id=run;
 IF NOT FOUND OR clock_timestamp()<s.starts_at OR clock_timestamp()>=s.expires_at THEN RETURN false;END IF;
 -- Inspect the global identity: a filtered wrong-owner/failed row is never ABSENT.
 SELECT * INTO r FROM public.trip_source_runs WHERE id=run;
 IF FOUND AND (r.actor_account_id IS DISTINCT FROM actor OR r.trip_id IS DISTINCT FROM trip
 OR r.capture_batch_id IS DISTINCT FROM s.batch_id OR r.interpretation_task_id IS DISTINCT FROM s.task_id
 OR r.capture_submission_sha256 IS DISTINCT FROM s.submission_sha256
 OR r.extractor_key IS DISTINCT FROM 'otr-universal-interpretation-v1'
 OR (r.state IS DISTINCT FROM 'PENDING' AND r.state IS DISTINCT FROM 'READY') OR r.retention_state IS DISTINCT FROM 'RETAINED' OR r.superseded_by IS NOT NULL)
 THEN RETURN false;END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.trip_source_finite_native_original_scope(actor uuid,trip uuid,batch uuid,task uuid,run uuid,submission text,pins jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF public.trip_source_finite_native_identity(actor,trip,run) IS NOT TRUE
 OR batch IS NULL OR task IS NULL OR submission IS NULL OR pins IS NULL
 OR jsonb_typeof(pins) IS DISTINCT FROM 'array' OR jsonb_array_length(pins) NOT BETWEEN 1 AND 64 THEN RETURN false;END IF;
 PERFORM 1 FROM public.trip_source_universal_scope s WHERE s.singleton AND s.actor_id=actor AND s.trip_id=trip
 AND s.batch_id=batch AND s.task_id=task AND s.run_id=run AND s.submission_sha256=submission
 AND s.input_sha256=public.trip_import_run_input_hash(pins)
 AND clock_timestamp()>=s.starts_at AND clock_timestamp()<s.expires_at;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.trip_source_finite_native_normalized_scope(actor uuid,trip uuid,batch uuid,task uuid,run uuid,submission text,pins jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v jsonb;p public.trip_source_inputs;rep public.trip_source_representations;facts jsonb;originals jsonb:='[]';r public.trip_source_runs;actual_pins jsonb;
BEGIN
 IF public.trip_source_finite_native_identity(actor,trip,run) IS NOT TRUE
 OR pins IS NULL OR jsonb_typeof(pins) IS DISTINCT FROM 'array' OR jsonb_array_length(pins) NOT BETWEEN 1 AND 64 THEN RETURN false;END IF;
 SELECT * INTO r FROM public.trip_source_runs WHERE id=run;
 IF FOUND THEN
  SELECT jsonb_agg(to_jsonb(i)-'run_id'-'confirmation_id' ORDER BY i.id) INTO actual_pins FROM public.trip_source_inputs i WHERE i.run_id=run;
  IF r.input_sha256 IS DISTINCT FROM public.trip_import_run_input_hash(pins)
  OR r.scope_source_ids IS DISTINCT FROM ARRAY(SELECT DISTINCT (elem.value->>'source_id')::uuid FROM jsonb_array_elements(pins) elem(value) ORDER BY 1)
  OR actual_pins IS DISTINCT FROM (SELECT jsonb_agg(elem.value ORDER BY elem.value->>'id' COLLATE "C") FROM jsonb_array_elements(pins) elem(value))
  THEN RETURN false;END IF;
 END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(pins) LOOP
  IF public.trip_event_keys(v,array['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']) IS NOT TRUE
  THEN RETURN false;END IF;
  p:=jsonb_populate_record(NULL::public.trip_source_inputs,v||jsonb_build_object('run_id',run,'confirmation_id',NULL));
  SELECT * INTO rep FROM public.trip_source_representations WHERE id=p.representation_id AND source_id=p.source_id;
  IF NOT FOUND OR p.historical_selection IS DISTINCT FROM false THEN RETURN false;END IF;
  IF rep.role='DERIVED' AND rep.transform_key='otr.pdf.qpdf-poppler' THEN
   -- Actual Source-owned seal/material facts only; caller cannot supply pdfSource.
   facts:=public.trip_source_universal_pdf_material(actor,trip,p,false,false);
   IF facts IS NULL OR facts->'pdfSource'->'original' IS NULL THEN RETURN false;END IF;
   v:=v||jsonb_build_object('representation_id',facts->'pdfSource'->'original'->>'representationId',
     'payload_sha256',facts->'pdfSource'->'original'->>'sha256','byte_count',facts->'pdfSource'->'original'->'byteCount');
  ELSIF rep.mime_type='application/pdf' THEN
   RETURN false; -- An unnormalized PDF cannot create a Run through this path.
  ELSIF rep.mime_type='image/png' THEN
   facts:=public.trip_source_png_original_facts(actor,trip,p.source_id,p.representation_id,p.material_revision);
   IF facts IS NULL THEN RETURN false;END IF;
  END IF;
  originals:=originals||jsonb_build_array(v);
 END LOOP;
 RETURN public.trip_source_finite_native_original_scope(actor,trip,batch,task,run,submission,originals);
END $$;
-- General Source read authority only, never Native approval: the outer reader
-- must still compare its requested Batch/Task/Run/submission and complete pins.
-- Durable structurally complete Run plus normal Source ACL/current
-- material. No temporary scope, clock, prepare, reservation or paid authority.
CREATE FUNCTION public.trip_source_finite_native_retained_pin(actor uuid,trip uuid,pin public.trip_source_inputs)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE r public.trip_source_runs;stored public.trip_source_inputs;pins jsonb;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR actor IS NULL OR trip IS NULL OR pin.run_id IS NULL OR pin.id IS NULL THEN RETURN false;END IF;
 IF public.trip_source_lock_universal_actor(actor,trip,false) IS NOT TRUE THEN RETURN false;END IF;
 SELECT * INTO r FROM public.trip_source_runs WHERE id=pin.run_id;
 IF NOT FOUND OR r.actor_account_id IS DISTINCT FROM actor OR r.trip_id IS DISTINCT FROM trip
 OR r.extractor_key IS DISTINCT FROM 'otr-universal-interpretation-v1'
 OR r.extractor_version IS DISTINCT FROM '1'
 OR r.capture_batch_id IS NULL OR r.interpretation_task_id IS NULL
 OR r.capture_submission_sha256 IS NULL OR r.capture_submission_sha256 !~ '^[a-f0-9]{64}$'
 OR r.operation_key IS DISTINCT FROM 'universal:'||r.capture_batch_id::text
 OR r.extractor_options_sha256 IS DISTINCT FROM r.capture_submission_sha256
 OR (r.state IS DISTINCT FROM 'PENDING' AND r.state IS DISTINCT FROM 'READY')
 OR r.retention_state IS DISTINCT FROM 'RETAINED' OR r.superseded_by IS NOT NULL
 OR pin.source_id=ANY(r.scope_source_ids) IS NOT TRUE THEN RETURN false;END IF;
 SELECT * INTO stored FROM public.trip_source_inputs WHERE run_id=pin.run_id AND id=pin.id;
 IF NOT FOUND OR stored IS DISTINCT FROM pin OR public.trip_import_input_valid(stored,actor,trip,true) IS NOT TRUE THEN RETURN false;END IF;
 SELECT jsonb_agg(to_jsonb(i)-'run_id'-'confirmation_id' ORDER BY i.id) INTO pins FROM public.trip_source_inputs i WHERE i.run_id=r.id;
 IF r.input_sha256 IS DISTINCT FROM public.trip_import_run_input_hash(pins) THEN RETURN false;END IF;
 RETURN true;
END $$;
-- Internal helpers only. The installer must preserve SourceWriter ownership and
-- verify no Gateway EXECUTE/role delta before and after the transaction.
REVOKE ALL ON FUNCTION public.trip_source_finite_native_identity(uuid,uuid,uuid) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_original_scope(uuid,uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_normalized_scope(uuid,uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,otr_trip_source_command_gateway;

REVOKE ALL ON FUNCTION public.trip_source_finite_native_retained_pin(uuid,uuid,public.trip_source_inputs) FROM PUBLIC,otr_trip_source_command_gateway;

-- Must execute within the installer's single transaction. Unknown default ACLs
-- abort the entire package; never silently accept inherited environment grants.
DO $$
DECLARE p record;seen integer:=0;owner_oid oid;
BEGIN
 SELECT oid INTO owner_oid FROM pg_roles WHERE rolname='otr_trip_source_writer';
 IF owner_oid IS NULL OR current_user<>'otr_trip_source_writer' THEN RAISE EXCEPTION 'SOURCE_FINITE_HELPER_OWNER_REJECTED';END IF;
 FOR p IN SELECT oid,proowner,prosecdef,proconfig,proacl FROM pg_proc
 WHERE pronamespace='public'::regnamespace AND proname IN
 ('trip_source_finite_native_identity','trip_source_finite_native_original_scope','trip_source_finite_native_normalized_scope','trip_source_finite_native_retained_pin') LOOP
  seen:=seen+1;
  IF p.proowner IS DISTINCT FROM owner_oid OR p.prosecdef IS DISTINCT FROM false
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  THEN RAISE EXCEPTION 'SOURCE_FINITE_HELPER_OWNER_REJECTED';END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_oid OR a.privilege_type<>'EXECUTE')
   OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=owner_oid AND a.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'SOURCE_FINITE_HELPER_ACL_REJECTED';END IF;
 END LOOP;
 IF seen<>4 THEN RAISE EXCEPTION 'SOURCE_FINITE_HELPER_SIGNATURE_REJECTED';END IF;
END $$;
