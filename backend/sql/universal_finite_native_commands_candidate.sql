-- Internal finite admission only, not an installer or a general Source permission.
-- Freeze full codec-validated commands, including CAS values, in existing scope pins.
CREATE FUNCTION public.trip_source_finite_native_command(actor uuid,trip uuid,raw text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE q jsonb;s public.trip_source_universal_scope;frame jsonb;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR actor IS NULL OR trip IS NULL OR raw IS NULL OR octet_length(raw)>2097152 THEN RETURN false;END IF;
 q:=public.trip_source_command_codec(raw);
 IF q->>'actor_account_id' IS DISTINCT FROM actor::text OR q->>'trip_id' IS DISTINCT FROM trip::text
 OR q->>'command' NOT IN ('ACQUIRE_SOURCE','PREPARE_REPRESENTATION','UPLOAD_ORIGINAL','VERIFY_REPRESENTATION')
 THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock_shared(714024,2);
 SELECT * INTO s FROM public.trip_source_universal_scope WHERE singleton AND actor_id=actor AND trip_id=trip;
 IF NOT FOUND OR public.trip_source_finite_native_identity(actor,trip,s.run_id) IS NOT TRUE
 OR clock_timestamp()<s.starts_at OR clock_timestamp()>=s.expires_at
 OR public.trip_source_admission(actor,trip,true) IS NOT TRUE THEN RETURN false;END IF;
 frame:=jsonb_build_object('batchId',s.batch_id,'taskId',s.task_id,'runId',s.run_id,'submissionSha256',s.submission_sha256,'command',q);
 RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(s.source_command_pins) p(value) WHERE p.value=frame);
END $$;
CREATE FUNCTION public.trip_source_finite_native_original_context(actor uuid,raw text)
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

CREATE FUNCTION public.trip_source_finite_native_original_pin()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE raw text;q jsonb;p jsonb;actual jsonb;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' THEN RETURN NULL;END IF;
 raw:=nullif(current_setting('otr.universal.finite_command',true),'');IF raw IS NULL THEN RETURN NULL;END IF;
 BEGIN q:=raw::jsonb;p:=nullif(current_setting('otr.universal.source_pin',true),'')::jsonb;EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;END;
 actual:=public.trip_source_finite_native_original_context((q->>'actor_account_id')::uuid,raw);
 IF actual IS NOT NULL AND actual=p THEN RETURN actual;END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.trip_source_acquire_finite_original(actor uuid,raw text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE p jsonb;result jsonb;previous_pin text:=current_setting('otr.universal.source_pin',true);previous_command text:=current_setting('otr.universal.finite_command',true);
BEGIN
 p:=public.trip_source_finite_native_original_context(actor,raw);
 IF p IS NULL THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
 PERFORM set_config('otr.universal.finite_command',raw,true);PERFORM set_config('otr.universal.source_pin',p::text,true);
 result:=public.trip_source_acquire_source(actor,raw);
 IF public.trip_source_finite_native_original_pin() IS NULL THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
 PERFORM set_config('otr.universal.source_pin',coalesce(previous_pin,''),true);PERFORM set_config('otr.universal.finite_command',coalesce(previous_command,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('otr.universal.source_pin',coalesce(previous_pin,''),true);PERFORM set_config('otr.universal.finite_command',coalesce(previous_command,''),true);RAISE;
END $$;

CREATE FUNCTION public.trip_source_finite_native_pdf_request(actor uuid,trip uuid,q jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE s public.trip_source_universal_scope;frame jsonb;verification public.trip_source_operations;frozen jsonb;matches integer;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR actor IS NULL OR trip IS NULL OR q IS NULL
 OR public.trip_event_keys(q,ARRAY['derivativeVersion','operationId','sourceId','sourceRevision','sourceRowRevision','originalRepresentationId','originalRowRevision','derivedRepresentationId','verificationOperationId','verificationResultSha256']) IS NOT TRUE
 OR q->'derivativeVersion' IS DISTINCT FROM '2'::jsonb THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock_shared(714024,2);
 SELECT * INTO s FROM public.trip_source_universal_scope WHERE singleton AND actor_id=actor AND trip_id=trip;
 IF NOT FOUND OR public.trip_source_finite_native_identity(actor,trip,s.run_id) IS NOT TRUE
 OR clock_timestamp()<s.starts_at OR clock_timestamp()>=s.expires_at
 OR public.trip_source_admission(actor,trip,true) IS NOT TRUE THEN RETURN false;END IF;
 SELECT count(*),(jsonb_agg(p.v->'command')->0) INTO matches,frozen FROM jsonb_array_elements(s.source_command_pins) p(v)
 WHERE p.v->'command'->>'operation_id'=q->>'verificationOperationId' AND p.v->'command'->>'command'='VERIFY_REPRESENTATION';
 IF matches<>1 OR public.trip_source_finite_native_command(actor,trip,frozen::text) IS NOT TRUE THEN RETURN false;END IF;
 SELECT * INTO verification FROM public.trip_source_operations WHERE id=(q->>'verificationOperationId')::uuid;
 IF NOT FOUND OR verification.command IS DISTINCT FROM 'VERIFY_REPRESENTATION' OR verification.phase IS DISTINCT FROM 'FINAL'
 OR verification.outcome IS DISTINCT FROM 'APPLIED' OR verification.error_code IS NOT NULL
 OR verification.bound_mime_type IS DISTINCT FROM 'application/pdf'
 OR verification.actor_account_id IS DISTINCT FROM actor OR verification.trip_id IS DISTINCT FROM trip
 OR verification.source_id IS DISTINCT FROM (q->>'sourceId')::uuid OR verification.representation_id IS DISTINCT FROM (q->>'originalRepresentationId')::uuid
 OR verification.operation_key IS DISTINCT FROM frozen->>'operation_key' OR verification.operation_sha256 IS DISTINCT FROM frozen->>'operation_sha256'
 OR verification.result_sha256 IS DISTINCT FROM q->>'verificationResultSha256'
 OR verification.result_material_revision IS DISTINCT FROM (q->>'sourceRevision')::bigint OR verification.result_source_row_revision IS DISTINCT FROM (q->>'sourceRowRevision')::bigint
 OR verification.result_representation_row_revision IS DISTINCT FROM (q->>'originalRowRevision')::bigint
 OR verification.result_remote_state IS DISTINCT FROM 'VERIFIED' THEN RETURN false;END IF;
 PERFORM public.trip_source_operation_reply(verification);
 -- Only this result SHA is resolved from the fixed owning receipt; scope stays frozen.
 frame:=jsonb_build_object('batchId',s.batch_id,'taskId',s.task_id,'runId',s.run_id,'submissionSha256',s.submission_sha256,
  'pdfRegistrationTemplate',jsonb_build_object('accountId',actor,'tripId',trip,'request',q-'verificationResultSha256'),
  'verificationOperationKey',verification.operation_key,'verificationOperationSha256',verification.operation_sha256);
 RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(s.source_command_pins) p(value) WHERE p.value=frame);
END $$;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_command(uuid,uuid,text) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_pdf_request(uuid,uuid,jsonb) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_original_context(uuid,text) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_original_pin() FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_acquire_finite_original(uuid,text) FROM PUBLIC,otr_trip_source_command_gateway;
-- Existing ExecutionWriter may ask SourceWriter for boolean eligibility only.
-- Gateway cannot invoke this bridge, inherit it, or read the scope table.
CREATE FUNCTION public.trip_source_finite_native_png_execution_allowed(actor uuid,raw text,writing boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q jsonb;ctx jsonb;previous_png text:=current_setting('otr.universal.png_scope',true);previous_original text:=current_setting('otr.universal.source_pin',true);
BEGIN
 IF session_user<>'otr_trip_source_command_gateway' OR writing IS NULL OR raw IS NULL OR octet_length(raw)>16384 THEN RETURN false;END IF;
 q:=public.trip_source_command_codec(raw);
 IF writing THEN RETURN public.trip_source_finite_native_command(actor,(q->>'trip_id')::uuid,raw);END IF;
 ctx:=public.trip_source_png_enter(actor,raw,'READ_RECEIPT');
 PERFORM set_config('otr.universal.png_scope',coalesce(previous_png,''),true);PERFORM set_config('otr.universal.source_pin',coalesce(previous_original,''),true);
 RETURN ctx IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('otr.universal.png_scope',coalesce(previous_png,''),true);PERFORM set_config('otr.universal.source_pin',coalesce(previous_original,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_png_execution_allowed(uuid,text,boolean) FROM PUBLIC,otr_trip_source_command_gateway;
GRANT EXECUTE ON FUNCTION public.trip_source_finite_native_png_execution_allowed(uuid,text,boolean) TO otr_trip_source_execution_writer;
DO $$
DECLARE p record;seen integer:=0;owner_oid oid:='otr_trip_source_writer'::regrole;
BEGIN
 IF current_user<>'otr_trip_source_writer' THEN RAISE EXCEPTION 'SOURCE_FINITE_COMMAND_OWNER_REJECTED';END IF;
 FOR p IN SELECT proowner,prosecdef,proconfig,proacl FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('trip_source_finite_native_command','trip_source_finite_native_pdf_request','trip_source_finite_native_original_context','trip_source_finite_native_original_pin','trip_source_acquire_finite_original') LOOP
  seen:=seen+1;
  IF p.proowner IS DISTINCT FROM owner_oid OR p.prosecdef IS DISTINCT FROM false OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_oid OR a.privilege_type<>'EXECUTE')
  THEN RAISE EXCEPTION 'SOURCE_FINITE_COMMAND_ACL_REJECTED';END IF;
 END LOOP;
 IF seen<>5 THEN RAISE EXCEPTION 'SOURCE_FINITE_COMMAND_SIGNATURE_REJECTED';END IF;
 SELECT proowner,prosecdef,proconfig,proacl INTO p FROM pg_proc WHERE oid='public.trip_source_finite_native_png_execution_allowed(uuid,text,boolean)'::regprocedure;
 IF p.proowner IS DISTINCT FROM owner_oid OR p.prosecdef IS DISTINCT FROM true OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee NOT IN (owner_oid,'otr_trip_source_execution_writer'::regrole) OR a.privilege_type<>'EXECUTE')
 OR has_function_privilege('otr_trip_source_command_gateway','public.trip_source_finite_native_png_execution_allowed(uuid,text,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'SOURCE_FINITE_EXECUTION_BRIDGE_ACL_REJECTED';END IF;
END $$;
