-- Definitions review input. Execution requires same-lease CAS, an approved driver and verified closure.
CREATE OR REPLACE FUNCTION public.trip_source_finite_native_original_context(actor uuid,raw text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE q jsonb;p jsonb;profile text;trip uuid;original jsonb;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' OR raw IS NULL OR octet_length(raw)>2097152 THEN RETURN NULL;END IF;
 q:=public.trip_source_command_codec(raw);trip:=(q->>'trip_id')::uuid;original:=q->'payload'->'original';
 IF q->>'command'='ACQUIRE_SOURCE' AND EXISTS(
  SELECT 1 FROM public.trip_source_universal_scope s WHERE s.singleton AND s.actor_id=actor AND s.trip_id=trip
   AND s.source_command_pins @? '$[*].mixedBInitial'
 ) THEN
  PERFORM public.trip_import_scope_lock(actor,trip);
  IF public.trip_source_lock_universal_actor(actor,trip,true) IS NOT TRUE THEN RETURN NULL;END IF;
 END IF;
 IF q->>'command' IS DISTINCT FROM 'ACQUIRE_SOURCE' OR public.trip_source_finite_native_command(actor,trip,raw) IS NOT TRUE THEN RETURN NULL;END IF;
 IF q->'payload'->'source_input'->>'source_kind'='IMAGE' AND q->'payload'->'source_input'->>'acquisition_channel'='FILES' AND original->>'material_kind'='BINARY' AND original->>'mime_type'='image/png' THEN
  RETURN jsonb_build_object('profile','OTR_PNG_CAPTURE_ORIGINAL_V1','access','ACQUIRE','actor',actor,'trip',trip,'source',q->>'source_id','representation',original->>'id',
   'operation',q->>'operation_id','key',q->>'operation_key','digest',q->>'operation_sha256','sha256',original->>'payload_sha256','byteCount',original->'byte_count','filename',original->'original_filename','acquisitionSha256',q->'payload'->>'acquisition_sha256','captureSha256',q->'payload'->'capture'->>'capture_sha256');
 ELSIF q->'payload'->'source_input'->>'source_kind'='FILE' AND q->'payload'->'source_input'->>'acquisition_channel'='FILES' AND original->>'material_kind'='BINARY' AND original->>'mime_type'='application/pdf' AND (original->>'byte_count')::bigint BETWEEN 1 AND 4194304 THEN
  profile:='OTR_PDF_CAPTURE_ORIGINAL_V1';
 ELSIF q->'payload'->'source_input'->>'source_kind'='TEXT' AND q->'payload'->'source_input'->>'acquisition_channel'='PASTE' AND original->>'material_kind'='TEXT' THEN
  profile:='OTR_SUBMITTED_TEXT_V1';
 ELSE RETURN NULL;END IF;
 p:=jsonb_build_object('profile',profile,'actorId',actor,'tripId',trip,'sourceId',q->>'source_id','operationId',q->>'operation_id','operationKey',q->>'operation_key','operationSha256',q->>'operation_sha256','representationId',original->>'id');
 IF profile='OTR_PDF_CAPTURE_ORIGINAL_V1' THEN p:=p||jsonb_build_object('access','ACQUIRE','pdfOriginal',jsonb_build_object('sha256',original->>'payload_sha256','byteCount',original->'byte_count','filename',original->'original_filename'));END IF;
 RETURN p;
END $$;

CREATE OR REPLACE FUNCTION public.trip_source_begin_finite_universal_inputs(actor uuid,trip uuid,raw text)
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

CREATE OR REPLACE FUNCTION public.trip_source_finite_native_run_row(tab text,op text,n jsonb)
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

CREATE OR REPLACE FUNCTION public.trip_source_find_finite_universal_binding(actor uuid,trip uuid,batch uuid,task uuid,run uuid,submission text,originals jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.trip_source_runs;p public.trip_source_inputs;rep public.trip_source_representations;facts jsonb;v jsonb;pins jsonb:='[]';projected jsonb:='[]';scope_row public.trip_source_universal_scope;command_pin jsonb;relation regclass;source_row public.trip_sources;source_found boolean;representation_found boolean;prospective_hash text;
 initial_hash text;tag jsonb;tag_count integer;commands jsonb;ordinal integer;profile text;field text;
 initial_manifest jsonb;current_material boolean:=false;material_inputs jsonb;source_ids uuid[];representation_ids uuid[];material_pin jsonb;material_count integer;
 acquired public.trip_source_operations;stored_pins jsonb;binding jsonb;remaining_ms bigint;
 requested_command jsonb;acquire_ordinal integer:=-1;next_probe boolean:=false;pre_run boolean:=false;expected_material_hash text;material_ready boolean:=false;previous_finite_batch text;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 PERFORM public.trip_import_scope_lock(actor,trip);
 -- Typed protected mixed-B observations only. All effects remain in the owning writers.
 IF jsonb_typeof(originals)='object' THEN
  IF originals->>'version'='otr.import.mixed-b-acquire-next/1' THEN
   IF public.trip_event_keys(originals,ARRAY['version','initialManifest']) IS NOT TRUE
    OR jsonb_typeof(originals->'initialManifest') IS DISTINCT FROM 'object'
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   initial_manifest:=originals->'initialManifest';
   next_probe:=true;
  ELSIF originals->>'version'='otr.import.mixed-b-acquire-current/1' THEN
   IF public.trip_event_keys(originals,ARRAY['version','initialManifest','command']) IS NOT TRUE
    OR jsonb_typeof(originals->'initialManifest') IS DISTINCT FROM 'object'
    OR jsonb_typeof(originals->'command') IS DISTINCT FROM 'object'
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   initial_manifest:=originals->'initialManifest';
   requested_command:=originals->'command';
  ELSIF originals->>'version'='otr.import.mixed-b-material-ready/1' THEN
   IF public.trip_event_keys(originals,ARRAY['version','initialManifest','inputs','materialInputSha256']) IS NOT TRUE
    OR jsonb_typeof(originals->'initialManifest') IS DISTINCT FROM 'object'
    OR jsonb_typeof(originals->'inputs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(originals->'materialInputSha256') IS DISTINCT FROM 'string'
    OR originals->>'materialInputSha256' !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   material_ready:=true;
   pre_run:=true;
   initial_manifest:=originals->'initialManifest';
   material_inputs:=originals->'inputs';
   expected_material_hash:=originals->>'materialInputSha256';
   IF jsonb_array_length(material_inputs)<>3 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  ELSIF originals->>'version'='otr.import.mixed-b-pre-run/1' THEN
   IF public.trip_event_keys(originals,ARRAY['version','initialManifest','inputs','normalizedInputs','materialInputSha256']) IS NOT TRUE
    OR jsonb_typeof(originals->'initialManifest') IS DISTINCT FROM 'object'
    OR jsonb_typeof(originals->'inputs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(originals->'normalizedInputs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(originals->'materialInputSha256') IS DISTINCT FROM 'string'
    OR originals->>'materialInputSha256' !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   pre_run:=true;
   initial_manifest:=originals->'initialManifest';
   material_inputs:=originals->'inputs';
   stored_pins:=originals->'normalizedInputs';
   expected_material_hash:=originals->>'materialInputSha256';
   IF jsonb_array_length(material_inputs)<>3 OR jsonb_array_length(stored_pins)<>3
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  ELSIF originals->>'version'='otr.import.mixed-b-material-current/1' THEN
   IF public.trip_event_keys(originals,ARRAY['version','initialManifest','inputs']) IS NOT TRUE
    OR originals->'version' IS DISTINCT FROM to_jsonb('otr.import.mixed-b-material-current/1'::text)
    OR jsonb_typeof(originals->'initialManifest') IS DISTINCT FROM 'object'
    OR jsonb_typeof(originals->'inputs') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   current_material:=true;
   initial_manifest:=originals->'initialManifest';
   material_inputs:=originals->'inputs';
   IF jsonb_array_length(material_inputs)<>3 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  ELSE
   initial_manifest:=originals;
  END IF;
  IF current_setting('transaction_isolation')<>'read committed'
   OR public.trip_event_keys(initial_manifest,ARRAY['version','actorId','tripId','batchId','taskId','runId','submissionSha256','originals']) IS NOT TRUE
   OR initial_manifest-'originals' IS DISTINCT FROM jsonb_build_object('version','otr.import.mixed-b-initial/1','actorId',actor,'tripId',trip,
      'batchId',batch,'taskId',task,'runId',run,'submissionSha256',submission)
   OR actor IS NULL OR trip IS NULL OR batch IS NULL OR task IS NULL OR run IS NULL
   OR submission IS NULL OR submission !~ '^[a-f0-9]{64}$'
   OR jsonb_typeof(initial_manifest->'originals') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  IF jsonb_array_length(initial_manifest->'originals')<>3 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  IF public.trip_source_lock_universal_actor(actor,trip,true) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
  IF public.trip_source_finite_native_identity(actor,trip,run) IS NOT TRUE THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  SELECT * INTO scope_row FROM public.trip_source_universal_scope s WHERE s.singleton AND s.actor_id=actor AND s.trip_id=trip
   AND s.batch_id=batch AND s.task_id=task AND s.run_id=run AND s.submission_sha256=submission
   AND clock_timestamp()>=s.starts_at AND clock_timestamp()<s.expires_at;
  IF NOT FOUND OR jsonb_typeof(scope_row.source_command_pins) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  initial_hash:=public.trip_source_hash('otr.import.mixed-b-initial/1',initial_manifest);
  IF (current_material OR pre_run) = (scope_row.input_sha256 IS NOT DISTINCT FROM initial_hash)
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  SELECT count(*),jsonb_agg(f.value)->0 INTO tag_count,tag FROM jsonb_array_elements(scope_row.source_command_pins) f(value)
   WHERE f.value ? 'mixedBInitial';
  IF tag_count<>1 OR tag IS DISTINCT FROM jsonb_build_object('mixedBInitial',jsonb_build_object('manifest',initial_manifest,'sha256',initial_hash))
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  SELECT jsonb_agg(f.value ORDER BY f.ordinality) INTO commands
   FROM jsonb_array_elements(scope_row.source_command_pins) WITH ORDINALITY f(value,ordinality)
   WHERE f.value->'command'->>'command'='ACQUIRE_SOURCE';
  IF jsonb_array_length(commands) IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  FOR ordinal IN 0..2 LOOP
   v:=initial_manifest->'originals'->ordinal;
   profile:=(ARRAY['OTR_PNG_CAPTURE_ORIGINAL_V1','OTR_PDF_CAPTURE_ORIGINAL_V1','OTR_SUBMITTED_TEXT_V1'])[ordinal+1];
   IF public.trip_event_keys(v,ARRAY['ordinal','profile','inputId','sourceId','originalRepresentationId','byteCount','sha256','operationId','operationKey','operationSha256']) IS NOT TRUE
    OR v->'ordinal' IS DISTINCT FROM to_jsonb(ordinal) OR v->'profile' IS DISTINCT FROM to_jsonb(profile)
    OR jsonb_typeof(v->'byteCount') IS DISTINCT FROM 'number' OR v->>'byteCount' !~ '^[1-9][0-9]{0,6}$'
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   IF (v->>'byteCount')::bigint>(CASE WHEN ordinal=2 THEN 262144 ELSE 4194304 END)
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   FOREACH field IN ARRAY ARRAY['inputId','sourceId','originalRepresentationId','operationId'] LOOP
    IF jsonb_typeof(v->field) IS DISTINCT FROM 'string' OR v->>field !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   END LOOP;
   FOREACH field IN ARRAY ARRAY['sha256','operationSha256'] LOOP
    IF jsonb_typeof(v->field) IS DISTINCT FROM 'string' OR v->>field !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   END LOOP;
   IF jsonb_typeof(v->'operationKey') IS DISTINCT FROM 'string' OR v->>'operationKey' !~ '^[A-Za-z0-9._:-]{1,128}$'
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   command_pin:=commands->ordinal->'command';
   IF commands->ordinal IS DISTINCT FROM jsonb_build_object('batchId',batch,'taskId',task,'runId',run,'submissionSha256',submission,'command',command_pin)
    OR command_pin->'source_id' IS DISTINCT FROM v->'sourceId'
    OR command_pin->'operation_id' IS DISTINCT FROM v->'operationId' OR command_pin->'operation_key' IS DISTINCT FROM v->'operationKey'
    OR command_pin->'operation_sha256' IS DISTINCT FROM v->'operationSha256'
    OR command_pin->'payload'->'original'->'id' IS DISTINCT FROM v->'originalRepresentationId'
    OR command_pin->'payload'->'original'->'payload_sha256' IS DISTINCT FROM v->'sha256'
    OR command_pin->'payload'->'original'->'byte_count' IS DISTINCT FROM v->'byteCount'
    OR public.trip_source_finite_native_original_context(actor,command_pin::text)->>'profile' IS DISTINCT FROM profile
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['inputId','sourceId','originalRepresentationId','operationId','operationKey'] LOOP
   IF (SELECT count(DISTINCT pin.value->>field) FROM jsonb_array_elements(initial_manifest->'originals') pin(value))<>3
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  END LOOP;
  -- Check the effective SourceWriter visibility before interpreting any empty read.
  FOREACH relation IN ARRAY ARRAY['public.trip_source_runs'::regclass,'public.trip_sources'::regclass,
    'public.trip_source_representations'::regclass,'public.trip_source_operations'::regclass,
    'public.trip_source_execution_attempts'::regclass] LOOP
   IF NOT has_table_privilege(current_user,relation,'SELECT') OR NOT row_security_active(relation)
    OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=relation AND c.relforcerowsecurity)
    OR NOT EXISTS(SELECT 1 FROM pg_policy policy WHERE policy.polrelid=relation AND policy.polpermissive
      AND policy.polcmd IN ('r','*') AND current_user::regrole=ANY(policy.polroles) AND pg_get_expr(policy.polqual,policy.polrelid)='true')
    OR EXISTS(SELECT 1 FROM pg_policy policy WHERE policy.polrelid=relation AND NOT policy.polpermissive)
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  END LOOP;
  IF requested_command IS NOT NULL THEN
   SELECT f.ordinality::integer-1 INTO acquire_ordinal
    FROM jsonb_array_elements(commands) WITH ORDINALITY f(value,ordinality)
    WHERE f.value->'command'=requested_command;
   IF NOT FOUND THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  ELSIF next_probe THEN
   SELECT min(i.ordinality)::integer-1 INTO acquire_ordinal
    FROM jsonb_array_elements(initial_manifest->'originals') WITH ORDINALITY i(value,ordinality)
    WHERE NOT EXISTS(SELECT 1 FROM public.trip_source_operations o WHERE o.id=(i.value->>'operationId')::uuid);
   IF acquire_ordinal IS NULL THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  END IF;
  IF current_material OR pre_run OR acquire_ordinal>0 THEN
   source_ids:=ARRAY(SELECT (i.value->>'sourceId')::uuid FROM jsonb_array_elements(initial_manifest->'originals')
     WITH ORDINALITY i(value,ordinality) WHERE current_material OR pre_run OR i.ordinality<=acquire_ordinal ORDER BY 1);
   PERFORM public.trip_source_lock_universal_materials(actor,trip,source_ids);
  END IF;
  FOR ordinal IN 0..2 LOOP
   IF NOT (current_material OR pre_run OR ordinal<acquire_ordinal) THEN CONTINUE;END IF;
   v:=initial_manifest->'originals'->ordinal;
    SELECT * INTO acquired FROM public.trip_source_operations x WHERE x.id=(v->>'operationId')::uuid;
    IF NOT FOUND OR acquired.command IS DISTINCT FROM 'ACQUIRE_SOURCE'
     OR acquired.phase IS DISTINCT FROM 'FINAL' OR acquired.outcome IS DISTINCT FROM 'APPLIED'
     OR acquired.error_code IS NOT NULL OR acquired.completed_at IS NULL OR NOT isfinite(acquired.completed_at)
     OR acquired.result_action_id IS NULL OR acquired.result_verified_at IS NOT NULL
     OR acquired.actor_account_id IS DISTINCT FROM actor OR acquired.trip_id IS DISTINCT FROM trip
     OR acquired.source_id IS DISTINCT FROM (v->>'sourceId')::uuid OR acquired.representation_id IS DISTINCT FROM (v->>'originalRepresentationId')::uuid
     OR acquired.operation_key IS DISTINCT FROM v->>'operationKey' OR acquired.operation_sha256 IS DISTINCT FROM v->>'operationSha256'
     OR acquired.result_source_row_revision IS DISTINCT FROM 1 OR acquired.result_material_revision IS DISTINCT FROM 1
     OR acquired.result_representation_row_revision IS DISTINCT FROM 1 OR acquired.result_retention_state IS DISTINCT FROM 'RETAINED'
     OR acquired.result_remote_state IS DISTINCT FROM (CASE WHEN v->>'profile'='OTR_SUBMITTED_TEXT_V1' THEN 'NOT_APPLICABLE' ELSE 'PENDING' END)
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
    PERFORM public.trip_source_operation_reply(acquired);
   IF ordinal<acquire_ordinal THEN
    command_pin:=commands->ordinal->'command';
    SELECT * INTO source_row FROM public.trip_sources x WHERE x.id=acquired.source_id;
    SELECT * INTO rep FROM public.trip_source_representations x WHERE x.id=acquired.representation_id;
    IF source_row.id IS NULL OR source_row.trip_id IS DISTINCT FROM trip OR source_row.acquired_by IS DISTINCT FROM actor
     OR source_row.acquisition_key IS DISTINCT FROM acquired.operation_key
     OR source_row.acquisition_sha256 IS DISTINCT FROM command_pin->'payload'->>'acquisition_sha256'
     OR source_row.source_kind IS DISTINCT FROM command_pin->'payload'->'source_input'->>'source_kind'
     OR source_row.acquisition_channel IS DISTINCT FROM command_pin->'payload'->'source_input'->>'acquisition_channel'
     OR source_row.row_revision IS DISTINCT FROM 1 OR source_row.current_material_revision IS DISTINCT FROM 1
     OR source_row.lifecycle IS DISTINCT FROM 'ACTIVE' OR source_row.retention_state IS DISTINCT FROM 'RETAINED'
     OR rep.id IS NULL OR rep.source_id IS DISTINCT FROM source_row.id OR rep.introduced_revision IS DISTINCT FROM 1
     OR rep.row_revision IS DISTINCT FROM 1 OR rep.role IS DISTINCT FROM 'ORIGINAL'
     OR rep.material_kind IS DISTINCT FROM 'BINARY' OR rep.mime_type IS DISTINCT FROM command_pin->'payload'->'original'->>'mime_type'
     OR rep.payload_sha256 IS DISTINCT FROM v->>'sha256' OR rep.byte_count IS DISTINCT FROM (v->>'byteCount')::bigint
     OR rep.retention_state IS DISTINCT FROM 'RETAINED' OR rep.remote_state IS DISTINCT FROM 'PENDING'
     OR EXISTS(SELECT 1 FROM public.trip_source_representations x WHERE x.source_id=source_row.id AND x.id<>rep.id)
     OR EXISTS(SELECT 1 FROM public.trip_source_operations x WHERE x.id<>acquired.id AND
        (x.source_id=source_row.id OR x.representation_id=rep.id))
     OR EXISTS(SELECT 1 FROM public.trip_source_execution_attempts a WHERE a.operation_id=acquired.id
        OR a.source_id=source_row.id OR a.representation_id=rep.id)
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   END IF;
  END LOOP;
  IF material_ready THEN
   IF scope_row.input_sha256 IS DISTINCT FROM expected_material_hash OR EXISTS(
    SELECT 1 FROM public.trip_source_runs x WHERE x.id<>run AND (x.interpretation_task_id=task
     OR (x.actor_account_id=actor AND x.trip_id=trip AND x.capture_batch_id=batch)))
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   current_material:=EXISTS(SELECT 1 FROM public.trip_source_runs x WHERE x.id=run);
   pre_run:=NOT current_material;
  END IF;
  IF current_material OR pre_run THEN
   IF pre_run THEN
    IF scope_row.input_sha256 IS DISTINCT FROM expected_material_hash
     OR EXISTS(SELECT 1 FROM public.trip_source_runs x WHERE x.id=run OR x.interpretation_task_id=task
       OR (x.actor_account_id=actor AND x.trip_id=trip AND x.capture_batch_id=batch))
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   ELSE
   -- SourceWriter already owns the existing Run transition columns; no ACL delta.
   SELECT * INTO r FROM public.trip_source_runs x WHERE x.id=run FOR SHARE;
   IF NOT FOUND OR r.actor_account_id IS DISTINCT FROM actor OR r.trip_id IS DISTINCT FROM trip
    OR r.capture_batch_id IS DISTINCT FROM batch OR r.interpretation_task_id IS DISTINCT FROM task
    OR r.capture_submission_sha256 IS DISTINCT FROM submission OR r.scope_source_ids IS DISTINCT FROM source_ids
    OR r.state IS DISTINCT FROM 'PENDING' OR r.retention_state IS DISTINCT FROM 'RETAINED' OR r.superseded_by IS NOT NULL
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   END IF;
   FOR v IN SELECT i.value FROM jsonb_array_elements(initial_manifest->'originals') i(value) LOOP
    SELECT count(*),jsonb_agg(i.value)->0 INTO material_count,material_pin
     FROM jsonb_array_elements(material_inputs) i(value) WHERE i.value->'id'=v->'inputId';
    IF material_count<>1 OR public.trip_event_keys(material_pin,ARRAY['id','source_id','material_revision','representation_id',
      'payload_sha256','byte_count','observed_source_row_revision','historical_selection']) IS NOT TRUE
     OR material_pin->'source_id' IS DISTINCT FROM v->'sourceId' OR material_pin->'representation_id' IS DISTINCT FROM v->'originalRepresentationId'
     OR material_pin->'payload_sha256' IS DISTINCT FROM v->'sha256' OR material_pin->'byte_count' IS DISTINCT FROM v->'byteCount'
     OR material_pin->'historical_selection' IS DISTINCT FROM 'false'::jsonb
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
    FOREACH field IN ARRAY ARRAY['material_revision','observed_source_row_revision'] LOOP
     IF jsonb_typeof(material_pin->field) IS DISTINCT FROM 'number' OR material_pin->>field !~ '^[1-9][0-9]{0,15}$'
     THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
     IF (material_pin->>field)::bigint>9007199254740991 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
    END LOOP;
   END LOOP;
   IF material_ready AND pre_run THEN
    IF public.trip_source_finite_native_original_scope(actor,trip,batch,task,run,submission,material_inputs) IS NOT TRUE
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
    previous_finite_batch:=current_setting('otr.universal.finite_batch',true);
    PERFORM set_config('otr.universal.finite_batch',jsonb_build_object('runId',run,'taskId',task,'batchId',batch,
      'submissionSha256',submission,'inputs',material_inputs)::text,true);
    stored_pins:='[]'::jsonb;
    FOR v IN SELECT value FROM jsonb_array_elements(material_inputs) LOOP
     p:=jsonb_populate_record(NULL::public.trip_source_inputs,v||jsonb_build_object('run_id',run,'confirmation_id',NULL));
     facts:=public.trip_source_universal_pdf_material(actor,trip,p,true,true);
     stored_pins:=stored_pins||jsonb_build_array(coalesce(facts->'input',v));
    END LOOP;
   END IF;
   IF NOT pre_run THEN
    SELECT jsonb_agg(to_jsonb(x)-'run_id'-'confirmation_id' ORDER BY x.id) INTO stored_pins
     FROM public.trip_source_inputs x WHERE x.run_id=run;
   END IF;
   IF jsonb_array_length(stored_pins) IS DISTINCT FROM 3
    OR public.trip_source_finite_native_original_scope(actor,trip,batch,task,run,submission,material_inputs) IS NOT TRUE
    OR public.trip_source_finite_native_normalized_scope(actor,trip,batch,task,run,submission,stored_pins) IS NOT TRUE
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   representation_ids:=ARRAY(SELECT DISTINCT (x.value->>'representation_id')::uuid
    FROM jsonb_array_elements(material_inputs||stored_pins) x(value));
   -- No prior or concurrent unsettled Source work can become a Task.
   IF EXISTS(SELECT 1 FROM public.trip_source_operations o
     WHERE (o.source_id=ANY(source_ids) OR o.representation_id=ANY(representation_ids)) AND o.phase IS DISTINCT FROM 'FINAL')
    OR EXISTS(SELECT 1 FROM public.trip_source_execution_attempts a LEFT JOIN public.trip_source_operations o ON o.id=a.operation_id
     WHERE (a.source_id=ANY(source_ids) OR a.representation_id=ANY(representation_ids)
       OR o.source_id=ANY(source_ids) OR o.representation_id=ANY(representation_ids))
      AND (a.phase IS DISTINCT FROM 'TERMINAL' OR a.termination_outstanding IS DISTINCT FROM false
       OR o.phase IS DISTINCT FROM 'FINAL' OR o.trip_id IS DISTINCT FROM a.trip_id
       OR o.source_id IS DISTINCT FROM a.source_id OR o.representation_id IS DISTINCT FROM a.representation_id
       OR o.operation_key IS DISTINCT FROM a.operation_key OR o.operation_sha256 IS DISTINCT FROM a.operation_sha256))
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   IF pre_run THEN
    FOR v IN SELECT value FROM jsonb_array_elements(stored_pins) LOOP
     p:=jsonb_populate_record(NULL::public.trip_source_inputs,v||jsonb_build_object('run_id',run,'confirmation_id',NULL));
     IF public.trip_import_input_valid(p,actor,trip,true) IS NOT TRUE
     THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
    END LOOP;
    IF clock_timestamp()<scope_row.starts_at OR clock_timestamp()>=scope_row.expires_at
    THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
    IF material_ready THEN
     PERFORM set_config('otr.universal.finite_batch',coalesce(previous_finite_batch,''),true);
     remaining_ms:=floor(extract(epoch from (scope_row.expires_at-clock_timestamp()))*1000);
     IF remaining_ms<=0 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
     RETURN jsonb_build_object('version','otr.import.mixed-b-material-ready/1','runState','ABSENT',
      'initialManifestSha256',initial_hash,'materialInputSha256',scope_row.input_sha256,
      'normalizedInputSha256',public.trip_import_run_input_hash(stored_pins),'scopeExpiresAt',scope_row.expires_at,'scopeRemainingMs',remaining_ms);
    END IF;
    RETURN jsonb_build_object('version','otr.import.mixed-b-pre-run/1','initialManifestSha256',initial_hash,
     'materialInputSha256',scope_row.input_sha256,'normalizedInputSha256',public.trip_import_run_input_hash(stored_pins));
   END IF;
   -- Project the normal retained binding only after this distinct current authority.
   originals:=material_inputs;
  ELSE
   -- One statement snapshot. Any operation phase (including UNKNOWN or FINAL) denies pristine.
   IF EXISTS(SELECT 1 FROM public.trip_source_runs x WHERE x.id=run OR x.interpretation_task_id=task
     OR (x.actor_account_id=actor AND x.trip_id=trip AND x.capture_batch_id=batch))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(initial_manifest->'originals') WITH ORDINALITY pin(value,ordinality)
     WHERE pin.ordinality>acquire_ordinal AND (EXISTS(SELECT 1 FROM public.trip_sources x WHERE x.id=(pin.value->>'sourceId')::uuid
       OR (x.trip_id=trip AND x.acquired_by=actor AND x.acquisition_key=pin.value->>'operationKey'))
     OR EXISTS(SELECT 1 FROM public.trip_source_representations x WHERE x.id=(pin.value->>'originalRepresentationId')::uuid
       OR x.source_id=(pin.value->>'sourceId')::uuid)
     OR EXISTS(SELECT 1 FROM public.trip_source_operations x WHERE x.id=(pin.value->>'operationId')::uuid
       OR x.source_id=(pin.value->>'sourceId')::uuid OR x.representation_id=(pin.value->>'originalRepresentationId')::uuid
       OR (x.trip_id=trip AND x.actor_account_id=actor AND x.operation_key=pin.value->>'operationKey'))
     OR EXISTS(SELECT 1 FROM public.trip_source_execution_attempts a
      WHERE a.operation_id=(pin.value->>'operationId')::uuid OR a.source_id=(pin.value->>'sourceId')::uuid
       OR a.representation_id=(pin.value->>'originalRepresentationId')::uuid)))
    OR clock_timestamp()<scope_row.starts_at OR clock_timestamp()>=scope_row.expires_at
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
   IF acquire_ordinal>=0 THEN
    RETURN jsonb_build_object('version','otr.import.mixed-b-acquire-current/1','initialManifestSha256',initial_hash,'ordinal',acquire_ordinal);
   END IF;
   RETURN jsonb_build_object('version','otr.import.mixed-b-pristine/1','initialManifestSha256',initial_hash,
    'firstCommandSha256',public.trip_source_hash('otr.import.mixed-b-first-acquire/1',commands->0->'command'));
  END IF;
 END IF;
 IF NOT current_material AND public.trip_source_lock_universal_actor(actor,trip,false) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 SELECT * INTO r FROM public.trip_source_runs WHERE id=run;
 IF NOT FOUND THEN
  IF current_material THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
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
 binding:=jsonb_build_object('actorId',actor,'tripId',trip,'batchId',batch,'submissionSha256',submission,'runId',run,'taskId',task,'generation',r.generation,'createdAt',r.created_at,'inputs',pins);
 IF current_material THEN
  remaining_ms:=floor(extract(epoch from (scope_row.expires_at-clock_timestamp()))*1000);
  IF clock_timestamp()<scope_row.starts_at OR remaining_ms<=0
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
  IF material_ready THEN
   RETURN jsonb_build_object('version','otr.import.mixed-b-material-ready/1','runState','PENDING',
    'initialManifestSha256',initial_hash,'materialInputSha256',scope_row.input_sha256,
    'normalizedInputSha256',public.trip_import_run_input_hash(stored_pins),'scopeExpiresAt',scope_row.expires_at,'scopeRemainingMs',remaining_ms);
  END IF;
  RETURN jsonb_build_object('version','otr.import.mixed-b-material-current/1','initialManifestSha256',initial_hash,
   'materialInputSha256',scope_row.input_sha256,'scopeExpiresAt',scope_row.expires_at,'scopeRemainingMs',remaining_ms,'binding',binding);
 END IF;
 RETURN binding;
END $$;

CREATE OR REPLACE FUNCTION public.trip_source_acquire_source(actor uuid,raw text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q jsonb;trip uuid;s public.trip_source_universal_scope;locked_scope public.trip_source_universal_scope;tag jsonb;tag_count integer;
 manifest jsonb;receipt jsonb;proof jsonb;protected_scope boolean:=false;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR raw IS NULL OR octet_length(raw)>2097152 THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 IF current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'UNSUPPORTED_TRANSACTION_ISOLATION' USING ERRCODE='25000';END IF;
 q:=public.trip_event_canonical_json(raw::json)::jsonb;
 trip:=(q->>'trip_id')::uuid;
 IF q->>'command' IS DISTINCT FROM 'ACQUIRE_SOURCE' OR q->>'actor_account_id' IS DISTINCT FROM actor::text
 THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 -- The tentative row only chooses the existing lock order. Dispatch requires the
 -- same full row to be observed again while holding the shared cutover lock.
 SELECT * INTO s FROM public.trip_source_universal_scope x WHERE x.singleton;
 IF FOUND AND jsonb_typeof(s.source_command_pins)='array' THEN
  SELECT count(*),jsonb_agg(x.v)->0 INTO tag_count,tag
   FROM jsonb_array_elements(s.source_command_pins) x(v) WHERE x.v ? 'mixedBInitial';
  protected_scope:=tag_count>0 AND (s.actor_id=actor AND s.trip_id=trip OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(s.source_command_pins) x(v)
    WHERE x.v->'command'->'operation_id'=q->'operation_id'
       OR x.v->'command'->'source_id'=q->'source_id'
       OR x.v->'command'->'payload'->'original'->'id'=q->'payload'->'original'->'id'
  ));
 END IF;
 IF protected_scope THEN
  IF tag_count<>1 OR s.actor_id IS DISTINCT FROM actor OR s.trip_id IS DISTINCT FROM trip
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
  PERFORM public.trip_import_scope_lock(actor,trip);
  IF public.trip_source_lock_universal_actor(actor,trip,true) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 ELSE
  -- Legacy historic receipt reads need no write admission. Fresh legacy work
  -- takes its existing gate and row locks before the cutover lock.
  IF public.trip_source_operation_lookup(actor,trip,(q->>'source_id')::uuid,
    (q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256') IS NULL THEN
   PERFORM public.trip_source_assert_gate();
   PERFORM public.trip_source_lock_scope(actor,trip,(q->>'source_id')::uuid);
  END IF;
 END IF;
 PERFORM pg_advisory_xact_lock_shared(714024,2);
 SELECT * INTO locked_scope FROM public.trip_source_universal_scope x WHERE x.singleton;
 IF to_jsonb(locked_scope) IS DISTINCT FROM to_jsonb(s)
 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
 IF protected_scope THEN
   IF public.trip_source_finite_native_original_context(actor,raw) IS NULL
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
   q:=public.trip_source_command_codec(raw);
   manifest:=tag->'mixedBInitial'->'manifest';
   receipt:=public.trip_source_operation_lookup(actor,trip,(q->>'source_id')::uuid,
    (q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');
   IF receipt IS NOT NULL THEN
    IF receipt->>'command' IS DISTINCT FROM 'ACQUIRE_SOURCE'
     OR receipt->>'outcome' IS DISTINCT FROM 'APPLIED'
    THEN RAISE EXCEPTION 'MIXED_B_ORIGINAL_OUTCOME_UNQUALIFIED';END IF;
    RETURN receipt;
   END IF;
   proof:=public.trip_source_find_finite_universal_binding(actor,trip,s.batch_id,s.task_id,s.run_id,s.submission_sha256,
    jsonb_build_object('version','otr.import.mixed-b-acquire-current/1','initialManifest',manifest,'command',q));
   IF proof->>'version' IS DISTINCT FROM 'otr.import.mixed-b-acquire-current/1'
    OR clock_timestamp()<s.starts_at OR clock_timestamp()>=s.expires_at
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
 END IF;
 RETURN public.trip_source_register('ACQUIRE_SOURCE',actor,raw);
END $$;
