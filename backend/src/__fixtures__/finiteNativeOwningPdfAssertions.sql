-- Seeded proof records, actual schema/RLS/codec/seal/hash/material functions.
-- This tests the owning proof validator; does not claim physical upload or Hosted E2E.
DELETE FROM public.trip_source_universal_scope;
CREATE TEMP TABLE qa_pdf_proof(pins jsonb,request jsonb);
CREATE TEMP TABLE qa_pdf_registration(request jsonb,command jsonb);
BEGIN;
ALTER TABLE public.trip_sources DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_revisions DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_representations DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_operations DISABLE TRIGGER USER;
DO $$
DECLARE actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';source uuid;original uuid;derived uuid;operation uuid;i integer;
 q jsonb;b jsonb;v jsonb;pages jsonb;pins jsonb:='[]';t text:='Synthetic PDF itinerary';text_sha text;seal_sha text;verification public.trip_source_operations;verify_command jsonb;verify_payload jsonb;verified timestamptz;
BEGIN
 text_sha:=encode(extensions.digest(convert_to(t,'UTF8'),'sha256'),'hex');pages:=jsonb_build_array(jsonb_build_object('pageIndex',0,'start',0,'end',octet_length(t)));
 FOR i IN 1..3 LOOP
  source:=('21000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  original:=('31000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  derived:=('32000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  operation:=('41000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision)
  VALUES(source,trip,actor,source::text,repeat('0',64),'FILE','FILES','UNKNOWN',clock_timestamp(),1,1);
  INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason)
  VALUES(source,1,clock_timestamp(),actor,source::text,repeat('0',64),ARRAY[original],'AS_SUPPLIED','ACQUISITION');
  INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,payload_sha256,byte_count,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state,verified_at)
  VALUES(original,3,source,1,'ORIGINAL','BINARY','application/pdf',repeat('c',64),1000,'NOT_APPLICABLE',clock_timestamp(),'supabase_storage','trip-source-material','v1/'||trip||'/'||source||'/'||original||'/payload','VERIFIED',clock_timestamp());
  INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,parent_ids,transform_key,transform_version,transform_options_sha256,regenerability,created_at,remote_state)
  VALUES(derived,1,source,1,'DERIVED','TEXT','UTF-8',text_sha,octet_length(t),t,ARRAY[original],'otr.pdf.qpdf-poppler','2','71804d69ac7011fc3b27231d7f6942cb696edb7ced9e696c083d4ce05fdd9ee5','POSSIBLE',clock_timestamp(),'NOT_APPLICABLE');
  q:=jsonb_build_object('derivativeVersion',2,'operationId',operation,'sourceId',source,'sourceRevision',1,'sourceRowRevision',1,'originalRepresentationId',original,'originalRowRevision',3,'derivedRepresentationId',derived);
  b:=jsonb_build_object('derivativeVersion',2,'request',q,'accountId',actor,'tripId',trip,'requestSha256',public.trip_source_hash('otr-source-pdf-request-v2',jsonb_build_object('accountId',actor,'tripId',trip,'request',q)),
   'profileId','OTR_PDF_QPDF_POPPLER_V2','profileSha256','ca5a7b63bda8ed5c5b9018b82fbbd14c1a01f054a37b1c2ed76445152b36539c','producer','otr-source-pdf-qpdf-poppler/2',
   'originalSha256',repeat('c',64),'originalByteCount',1000,'textSha256',text_sha,'textByteCount',octet_length(t),'transformOptionsSha256','71804d69ac7011fc3b27231d7f6942cb696edb7ced9e696c083d4ce05fdd9ee5',
   'pageMapSha256',encode(extensions.digest(convert_to(public.trip_event_canonical_json(pages::json),'UTF8'),'sha256'),'hex'),'pages',pages);
  IF i=3 THEN b:=jsonb_set(b,'{pages,0,end}','1');END IF;
  seal_sha:=public.trip_source_hash('otr-source-pdf-seal-v2',b);
  IF i=2 THEN seal_sha:=repeat('0',64);END IF;
  INSERT INTO public.trip_source_pdf_seals(operation_id,account_id,trip_id,source_id,source_revision,derived_representation_id,request_sha256,seal_sha256,body)
  VALUES(operation,actor,trip,source,1,derived,b->>'requestSha256',seal_sha,b);
  SELECT verified_at INTO verified FROM public.trip_source_representations WHERE id=original;
  verification:=NULL;verification.id:=('48000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;verification.trip_id:=trip;verification.actor_account_id:=actor;verification.source_id:=source;verification.operation_key:=verification.id::text;verification.contract_version:=1;verification.command:='VERIFY_REPRESENTATION';verification.created_at:=verified-interval '3 seconds';verification.material_revision:=1;verification.representation_id:=original;
  verification.expected_source_row_revision:=1;verification.expected_source_lifecycle:='ACTIVE';verification.expected_source_retention_state:='RETAINED';verification.expected_representation_row_revision:=2;verification.expected_representation_remote_state:='PENDING';verification.expected_representation_retention_state:='RETAINED';
  verify_payload:=jsonb_build_object('material_revision',1,'expected_source_row_revision',1,'expected_source_state',jsonb_build_object('lifecycle','ACTIVE','retention_state','RETAINED'),'representation_id',original,'expected_representation_row_revision',2,'expected_representation_state',jsonb_build_object('remote_state','PENDING','retention_state','RETAINED'));
  verification.operation_sha256:=public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,'VERIFY_REPRESENTATION',verification.id,verification.operation_key,actor,trip,source,public.trip_source_payload_tuple('VERIFY_REPRESENTATION',verify_payload)));
  verify_command:=jsonb_build_object('contract_version',1,'command','VERIFY_REPRESENTATION','operation_id',verification.id,'operation_key',verification.operation_key,'actor_account_id',actor,'trip_id',trip,'source_id',source,'operation_sha256',verification.operation_sha256,'payload',verify_payload);
  verify_command:=public.trip_source_command_codec(verify_command::text);
  verification.bound_payload_sha256:=repeat('c',64);verification.bound_byte_count:=1000;verification.bound_mime_type:='application/pdf';verification.phase:='FINAL';verification.attempt_generation:=1;verification.attempt_id:=verification.id;verification.worker_identity:='otr_trip_source_command_gateway';verification.admitted_at:=verified-interval '2 seconds';verification.io_finished_at:=verified;verification.completed_at:=verified+interval '1 second';verification.outcome:='APPLIED';verification.result_source_row_revision:=1;verification.result_material_revision:=1;verification.result_representation_row_revision:=3;verification.result_remote_state:='VERIFIED';verification.result_retention_state:='RETAINED';verification.result_verified_at:=verified;
  verification.result_sha256:=public.trip_source_hash('otr-source-result-v1',public.trip_source_result_tuple(verification));
  INSERT INTO public.trip_source_operations SELECT verification.*;
  INSERT INTO qa_pdf_registration VALUES(jsonb_set(q,'{operationId}',to_jsonb(('49000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid))||jsonb_build_object('verificationOperationId',verification.id,'verificationResultSha256',verification.result_sha256),verify_command);
  v:=jsonb_build_object('id',source,'source_id',source,'material_revision',1,'representation_id',original,'payload_sha256',repeat('c',64),'byte_count',1000,'observed_source_row_revision',1,'historical_selection',false);
  pins:=pins||jsonb_build_array(v);
 END LOOP;
 q:=jsonb_build_object('runId','71000000-0000-4000-8000-000000000001','batchId','51000000-0000-4000-8000-000000000001','taskId','61000000-0000-4000-8000-000000000001','submissionSha256',repeat('a',64),'inputs',pins);
 INSERT INTO qa_pdf_proof VALUES(pins,q);
 INSERT INTO public.trip_source_universal_scope(singleton,actor_id,trip_id,batch_id,task_id,run_id,submission_sha256,input_sha256,starts_at,expires_at)
 VALUES(true,actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',public.trip_import_run_input_hash(pins),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes');
 UPDATE public.trip_source_universal_scope s SET source_command_pins=(SELECT jsonb_agg(p.v) FROM (
  SELECT jsonb_build_object('batchId',s.batch_id,'taskId',s.task_id,'runId',s.run_id,'submissionSha256',s.submission_sha256,'command',r.command) AS v FROM qa_pdf_registration r
  UNION ALL SELECT jsonb_build_object('batchId',s.batch_id,'taskId',s.task_id,'runId',s.run_id,'submissionSha256',s.submission_sha256,'pdfRegistrationTemplate',jsonb_build_object('accountId',actor,'tripId',trip,'request',r.request-'verificationResultSha256'),'verificationOperationKey',r.command->>'operation_key','verificationOperationSha256',r.command->>'operation_sha256') FROM qa_pdf_registration r) p);
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.trip_sources ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_revisions ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_representations ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_operations ENABLE TRIGGER USER;
COMMIT;
SET ROLE otr_trip_source_writer;
CREATE FUNCTION public.qa_pdf_material(actor uuid,trip uuid,q jsonb,index integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.trip_source_inputs;result jsonb;BEGIN
 PERFORM set_config('otr.universal.finite_batch',q::text,true);
 p:=jsonb_populate_record(NULL::public.trip_source_inputs,(q->'inputs'->index)||jsonb_build_object('run_id',q->>'runId','confirmation_id',NULL));
 result:=public.trip_source_universal_pdf_material(actor,trip,p,true,true);
 p:=jsonb_populate_record(NULL::public.trip_source_inputs,(result->'input')||jsonb_build_object('run_id',q->>'runId','confirmation_id',NULL));
 -- Before Run exists, the exact frozen ORIGINAL scope may validate the actual DERIVED proof.
 result:=public.trip_source_universal_pdf_material(actor,trip,p,false,false);
 PERFORM set_config('otr.universal.finite_batch','',true);RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.qa_pdf_material(uuid,uuid,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_pdf_material(uuid,uuid,jsonb,integer) TO otr_trip_source_command_gateway;
CREATE FUNCTION public.qa_pdf_registration(actor uuid,trip uuid,q jsonb) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT public.trip_source_finite_native_pdf_request(actor,trip,q)$$;
REVOKE ALL ON FUNCTION public.qa_pdf_registration(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_pdf_registration(uuid,uuid,jsonb) TO otr_trip_source_command_gateway;
RESET ROLE;
GRANT SELECT ON qa_pdf_proof TO otr_trip_source_command_gateway;
GRANT SELECT ON qa_pdf_registration TO otr_trip_source_command_gateway;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$ DECLARE q jsonb;result jsonb;i integer;BEGIN
 SELECT request INTO q FROM qa_pdf_proof;
 result:=public.qa_pdf_material('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',q,0);
 IF result->'pdfSource'->'original'->>'representationId' IS DISTINCT FROM '31000000-0000-4000-8000-000000000001'
 OR result->'input'->>'representation_id' IS DISTINCT FROM '32000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'ACTUAL_PDF_ORIGINAL_NORMALIZATION_FAILED';END IF;
 FOR i IN 1..2 LOOP
  BEGIN
   PERFORM public.qa_pdf_material('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',q,i);
   RAISE EXCEPTION 'INVALID_ACTUAL_PDF_PROOF_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNIVERSAL_PDF_MATERIAL_UNAVAILABLE' THEN RAISE;END IF;END;
 END LOOP;
 RAISE NOTICE 'ACTUAL PDF material/seal/map/hash/current-source/RLS positive and tampered-seal/map negative PASS; seeded proof records only, not physical upload';
END $$;
DO $$DECLARE q jsonb;bad jsonb;actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';BEGIN
 SELECT request INTO q FROM qa_pdf_registration ORDER BY request->>'sourceId' LIMIT 1;
 IF public.qa_pdf_registration(actor,trip,q) IS NOT TRUE THEN RAISE EXCEPTION 'OWNING_RECEIPT_SLOT_REJECTED';END IF;
 FOREACH bad IN ARRAY ARRAY[jsonb_set(q,'{verificationResultSha256}',to_jsonb(repeat('0',64))),jsonb_set(q,'{sourceRowRevision}','2'),jsonb_set(q,'{operationId}',to_jsonb(trip)),q||'{"extra":true}'::jsonb,q-'verificationResultSha256'] LOOP
  IF public.qa_pdf_registration(actor,trip,bad) IS NOT FALSE THEN RAISE EXCEPTION 'UNFROZEN_REGISTRATION_OR_CALLER_RECEIPT_ACCEPTED';END IF;
 END LOOP;
 RAISE NOTICE 'ACTUAL fixed VERIFY codec/key/hash and immutable result receipt resolved sole registration slot; caller SHA, CAS, registration ID and shape changes rejected PASS';
END $$;
