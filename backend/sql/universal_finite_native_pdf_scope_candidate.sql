-- Same PDF authority, with exact frozen command/registration before enter.
-- Not an installer; Gateway overload EXECUTE requires the protected final Gate.
CREATE FUNCTION public.trip_source_finite_native_pdf_frame(actor uuid,trip uuid,source uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE f jsonb;q jsonb;s public.trip_source_universal_scope;o public.trip_source_operations;matches integer;registration jsonb;result_sha text;proof jsonb;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' THEN RETURN false;END IF;
 BEGIN f:=nullif(current_setting('otr.universal.finite_pdf_frame',true),'')::jsonb;EXCEPTION WHEN invalid_text_representation THEN RETURN false;END;
 IF f IS NULL THEN RETURN false;END IF;
 IF public.trip_event_keys(f,ARRAY['command']) IS TRUE THEN
  q:=public.trip_source_command_codec((f->'command')::text);
 ELSIF public.trip_event_keys(f,ARRAY['pdfRegistration']) IS TRUE THEN
  q:=f->'pdfRegistration';
  RETURN q->>'sourceId'=source::text AND public.trip_source_finite_native_pdf_request(actor,trip,q) IS TRUE;
 ELSIF public.trip_event_keys(f,ARRAY['pdfSeal']) IS TRUE THEN
  q:=f->'pdfSeal';
  IF public.trip_event_keys(q,ARRAY['derivativeVersion','operationId','sourceId','sourceRevision','sourceRowRevision','originalRepresentationId','originalRowRevision','derivedRepresentationId']) IS NOT TRUE
  OR q->>'sourceId' IS DISTINCT FROM source::text THEN RETURN false;END IF;
  PERFORM pg_advisory_xact_lock_shared(714024,2);
  SELECT * INTO s FROM public.trip_source_universal_scope WHERE singleton AND actor_id=actor AND trip_id=trip;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.source_command_pins) p(v) WHERE p.v=jsonb_build_object(
   'batchId',s.batch_id,'taskId',s.task_id,'runId',s.run_id,'submissionSha256',s.submission_sha256,
   'pdfSealTemplate',jsonb_build_object('accountId',actor,'tripId',trip,'request',q))) THEN RETURN false;END IF;
  SELECT count(*),(jsonb_agg(p.v->'pdfRegistrationTemplate'->'request')->0) INTO matches,registration
   FROM jsonb_array_elements(s.source_command_pins) p(v)
   WHERE p.v->'pdfRegistrationTemplate'->>'accountId'=actor::text AND p.v->'pdfRegistrationTemplate'->>'tripId'=trip::text
   AND ((p.v->'pdfRegistrationTemplate'->'request')-ARRAY['operationId','verificationOperationId'])=(q-'operationId');
  IF matches<>1 THEN RETURN false;END IF;
  SELECT result_sha256 INTO result_sha FROM public.trip_source_operations WHERE id=(registration->>'verificationOperationId')::uuid;
  registration:=registration||jsonb_build_object('verificationResultSha256',result_sha);
  IF public.trip_source_finite_native_pdf_request(actor,trip,registration) IS NOT TRUE THEN RETURN false;END IF;
  proof:=public.trip_source_pdf_v2_registration_lookup(actor,trip,(registration->>'operationId')::uuid,
   public.trip_source_hash('otr-source-pdf-registration-request-v2',jsonb_build_object('accountId',actor,'tripId',trip,'request',registration)));
  IF proof IS NULL OR jsonb_typeof(proof->'body') IS DISTINCT FROM 'object' THEN RETURN false;END IF;
  RETURN coalesce(proof->'body'->'request'=registration AND proof->>'registrationSha256'=
   public.trip_source_hash('otr-source-pdf-registration-v2',proof->'body'),false);
 ELSIF public.trip_event_keys(f,ARRAY['operationId','operationSha256']) IS TRUE THEN
  PERFORM pg_advisory_xact_lock_shared(714024,2);
  SELECT * INTO s FROM public.trip_source_universal_scope WHERE singleton AND actor_id=actor AND trip_id=trip;
  IF NOT FOUND THEN RETURN false;END IF;
  SELECT count(*),(jsonb_agg(p.v->'command')->0) INTO matches,q FROM jsonb_array_elements(s.source_command_pins) p(v)
   WHERE p.v->'command'->>'operation_id'=f->>'operationId' AND p.v->'command'->>'operation_sha256'=f->>'operationSha256';
  IF matches<>1 THEN RETURN false;END IF;
  q:=public.trip_source_command_codec(q::text);
  SELECT * INTO o FROM public.trip_source_operations WHERE id=(f->>'operationId')::uuid;
  IF NOT FOUND OR o.actor_account_id IS DISTINCT FROM actor OR o.trip_id IS DISTINCT FROM trip OR o.source_id IS DISTINCT FROM source
  OR o.operation_sha256 IS DISTINCT FROM f->>'operationSha256' OR o.operation_key IS DISTINCT FROM q->>'operation_key'
  OR o.command IS DISTINCT FROM q->>'command' OR o.representation_id IS DISTINCT FROM (q->'payload'->>'representation_id')::uuid
  OR o.material_revision IS DISTINCT FROM (q->'payload'->>'material_revision')::bigint THEN RETURN false;END IF;
 ELSE RETURN false;END IF;
 RETURN q->>'source_id'=source::text AND q->>'actor_account_id'=actor::text AND q->>'trip_id'=trip::text
 AND q->>'command' IN ('PREPARE_REPRESENTATION','UPLOAD_ORIGINAL','VERIFY_REPRESENTATION')
 AND public.trip_source_finite_native_command(actor,trip,q::text) IS TRUE;
END $$;

-- Only the existing UNKNOWN observation survives closure; no new IO or receipt.
CREATE FUNCTION public.trip_source_finite_native_pdf_unknown(attempt uuid,owner_run uuid,fence bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f jsonb;a public.trip_source_execution_attempts;o public.trip_source_operations;
BEGIN
 IF session_user<>'otr_trip_source_command_gateway' OR attempt IS NULL OR owner_run IS NULL OR fence IS NULL THEN RETURN false;END IF;
 BEGIN f:=nullif(current_setting('otr.universal.finite_pdf_unknown',true),'')::jsonb;EXCEPTION WHEN invalid_text_representation THEN RETURN false;END;
 IF f IS NULL OR public.trip_event_keys(f,ARRAY['actorId','tripId','sourceId','operationId','operationSha256','attemptId','ownerRun','ownerFence']) IS NOT TRUE
 OR f->>'attemptId' IS DISTINCT FROM attempt::text OR f->>'ownerRun' IS DISTINCT FROM owner_run::text OR f->'ownerFence' IS DISTINCT FROM to_jsonb(fence) THEN RETURN false;END IF;
 SELECT * INTO a FROM public.trip_source_execution_attempts WHERE id=attempt;
 SELECT * INTO o FROM public.trip_source_operations WHERE id=a.operation_id;
 RETURN coalesce(a.id IS NOT NULL AND o.id IS NOT NULL AND public.trip_source_pdf_access(o.actor_account_id,o.trip_id,o.source_id) IS TRUE
 AND a.profile_id='PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4' AND a.profile_sha256='2a9b397d3f8368144517e0a3bf73595e71b6cba7b37341045eceef47ef059f3d'
 AND a.phase IN ('STARTING','RUNNING','UNKNOWN') AND a.termination_outstanding AND a.pdf_beta_get IS NULL
 AND a.execution_principal=session_user AND a.owner_run=owner_run AND a.owner_fence=fence
 AND o.command='UPLOAD_ORIGINAL' AND o.bound_mime_type='application/pdf' AND o.phase IN ('IO_ACTIVE','IO_UNKNOWN')
 AND o.outcome IS NULL AND o.completed_at IS NULL AND o.io_finished_at IS NULL AND o.worker_identity=session_user
 AND o.id::text=f->>'operationId' AND o.operation_sha256=f->>'operationSha256'
 AND o.actor_account_id::text=f->>'actorId' AND o.trip_id::text=f->>'tripId' AND o.source_id::text=f->>'sourceId'
 AND o.attempt_id=a.id AND o.attempt_generation=a.canonical_generation
 AND a.trip_id=o.trip_id AND a.source_id=o.source_id AND a.representation_id=o.representation_id AND a.material_revision=o.material_revision
 AND a.operation_key=o.operation_key AND a.operation_sha256=o.operation_sha256
 AND a.pdf_binding->>'actorAccountId'=o.actor_account_id::text AND a.pdf_binding->>'tripId'=o.trip_id::text
 AND a.pdf_binding->>'sourceId'=o.source_id::text AND a.pdf_binding->>'representationId'=o.representation_id::text
 AND a.pdf_binding->>'operationId'=o.id::text AND a.pdf_binding->>'operationSha256'=o.operation_sha256
 AND a.pdf_binding->>'attemptId'=a.id::text AND a.pdf_binding->>'sha256'=o.bound_payload_sha256 AND a.pdf_binding->'byteCount'=to_jsonb(o.bound_byte_count),false);
END $$;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_pdf_unknown(uuid,uuid,bigint) FROM PUBLIC,otr_trip_source_command_gateway;
GRANT EXECUTE ON FUNCTION public.trip_source_finite_native_pdf_unknown(uuid,uuid,bigint) TO otr_trip_source_execution_writer;

CREATE FUNCTION public.trip_source_universal_pdf_enter(actor uuid,trip uuid,source uuid,frame jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 PERFORM set_config('otr.universal.finite_pdf_unknown','',true);
 IF public.trip_event_keys(frame,ARRAY['negativeUnknown']) IS TRUE
 AND public.trip_event_keys(frame->'negativeUnknown',ARRAY['operationId','operationSha256','attemptId','ownerRun','ownerFence']) IS TRUE THEN
  PERFORM set_config('otr.source.universal_pdf_scope','',true);
  PERFORM set_config('otr.universal.finite_pdf_frame','',true);
  PERFORM set_config('otr.universal.finite_pdf_unknown',(frame->'negativeUnknown'||jsonb_build_object('actorId',actor,'tripId',trip,'sourceId',source))::text,true);
  IF public.trip_source_finite_native_pdf_unknown((frame->'negativeUnknown'->>'attemptId')::uuid,(frame->'negativeUnknown'->>'ownerRun')::uuid,(frame->'negativeUnknown'->>'ownerFence')::bigint) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
  RETURN true;
 END IF;
 PERFORM set_config('otr.universal.finite_pdf_frame',frame::text,true);
 IF public.trip_source_finite_native_pdf_frame(actor,trip,source) IS NOT TRUE THEN
  PERFORM set_config('otr.universal.finite_pdf_frame','',true);
 END IF;
 RETURN public.trip_source_universal_pdf_enter(actor,trip,source);
END $$;
REVOKE ALL ON FUNCTION public.trip_source_finite_native_pdf_frame(uuid,uuid,uuid) FROM PUBLIC,otr_trip_source_command_gateway;
REVOKE ALL ON FUNCTION public.trip_source_universal_pdf_enter(uuid,uuid,uuid,jsonb) FROM PUBLIC,otr_trip_source_command_gateway;
DO $$
DECLARE p record;owner_oid oid:='otr_trip_source_writer'::regrole;seen integer:=0;
BEGIN
 IF current_user<>'otr_trip_source_writer' THEN RAISE EXCEPTION 'SOURCE_FINITE_PDF_OWNER_REJECTED';END IF;
 FOR p IN SELECT oid,proowner,prosecdef,proconfig,proacl FROM pg_proc WHERE oid IN
 ('public.trip_source_finite_native_pdf_frame(uuid,uuid,uuid)'::regprocedure,'public.trip_source_universal_pdf_enter(uuid,uuid,uuid,jsonb)'::regprocedure) LOOP
  seen:=seen+1;
  IF p.proowner IS DISTINCT FROM owner_oid OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  OR p.prosecdef IS DISTINCT FROM (p.oid='public.trip_source_universal_pdf_enter(uuid,uuid,uuid,jsonb)'::regprocedure)
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_oid OR a.privilege_type<>'EXECUTE')
  THEN RAISE EXCEPTION 'SOURCE_FINITE_PDF_ACL_REJECTED';END IF;
 END LOOP;
 IF seen<>2 THEN RAISE EXCEPTION 'SOURCE_FINITE_PDF_SIGNATURE_REJECTED';END IF;
END $$;

DO $$ DECLARE p record;BEGIN
 SELECT proowner,prosecdef,proconfig,proacl INTO STRICT p FROM pg_proc WHERE oid='public.trip_source_finite_native_pdf_unknown(uuid,uuid,bigint)'::regprocedure;
 IF p.proowner IS DISTINCT FROM 'otr_trip_source_writer'::regrole OR p.prosecdef IS DISTINCT FROM true
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee NOT IN ('otr_trip_source_writer'::regrole,'otr_trip_source_execution_writer'::regrole) OR a.privilege_type<>'EXECUTE')
 OR has_function_privilege('otr_trip_source_command_gateway','public.trip_source_finite_native_pdf_unknown(uuid,uuid,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'SOURCE_FINITE_PDF_UNKNOWN_ACL_REJECTED';END IF;
END $$;
