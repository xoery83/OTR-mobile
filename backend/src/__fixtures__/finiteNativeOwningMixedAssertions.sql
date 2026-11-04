-- Actual begin, Run/Input row guard, input hash/validity and mixed Source reader.
-- Retained material was fixture-seeded above; this does not claim physical IO.
DELETE FROM public.trip_source_universal_scope;
CREATE TEMP TABLE qa_mixed(q jsonb,original_sha text);
BEGIN;
ALTER TABLE public.trip_sources DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_revisions DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_representations DISABLE TRIGGER USER;
DO $$
DECLARE actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';source uuid:='23000000-0000-4000-8000-000000000001';rep uuid:='34000000-0000-4000-8000-000000000001';
 text_value text:='Synthetic typed itinerary';pins jsonb;q jsonb;
BEGIN
 INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision)
 VALUES(source,trip,actor,source::text,repeat('0',64),'TEXT','PASTE','UNKNOWN',clock_timestamp(),1,1);
 INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason)
 VALUES(source,1,clock_timestamp(),actor,source::text,repeat('0',64),ARRAY[rep],'AS_SUPPLIED','ACQUISITION');
 INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state)
 VALUES(rep,1,source,1,'ORIGINAL','TEXT',NULL,'UTF-8',encode(extensions.digest(convert_to(text_value,'UTF8'),'sha256'),'hex'),octet_length(text_value),text_value,'NOT_APPLICABLE',clock_timestamp(),'NOT_APPLICABLE');
 SELECT jsonb_agg(jsonb_build_object('id',s.id,'source_id',s.id,'material_revision',1,'representation_id',r.id,'payload_sha256',r.payload_sha256,'byte_count',r.byte_count,'observed_source_row_revision',s.row_revision,'historical_selection',false) ORDER BY s.id)
 INTO pins FROM public.trip_sources s JOIN public.trip_source_representations r ON r.source_id=s.id AND r.role='ORIGINAL'
 WHERE s.id IN ('21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001',source);
 q:=jsonb_build_object('runId','73000000-0000-4000-8000-000000000001','batchId','53000000-0000-4000-8000-000000000001','taskId','63000000-0000-4000-8000-000000000001','submissionSha256',repeat('a',64),'inputs',pins);
 INSERT INTO qa_mixed VALUES(q,public.trip_import_run_input_hash(pins));
 INSERT INTO public.trip_source_universal_scope(singleton,actor_id,trip_id,batch_id,task_id,run_id,submission_sha256,input_sha256,starts_at,expires_at)
 VALUES(true,actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',public.trip_import_run_input_hash(pins),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes');
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.trip_sources ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_revisions ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_representations ENABLE TRIGGER USER;
COMMIT;
GRANT EXECUTE ON FUNCTION public.trip_source_begin_finite_universal_inputs(uuid,uuid,text),public.trip_source_find_finite_universal_binding(uuid,uuid,uuid,uuid,uuid,text,jsonb) TO otr_trip_source_command_gateway;
GRANT SELECT ON qa_mixed TO otr_trip_source_command_gateway;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$
DECLARE q jsonb;r jsonb;b jsonb;materials jsonb;original_sha text;
BEGIN
 SELECT x.q INTO q FROM qa_mixed x;
 SELECT x.original_sha INTO original_sha FROM qa_mixed x;
 r:=public.trip_source_begin_finite_universal_inputs('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',q::text);
 IF r->>'input_sha256'=original_sha THEN RAISE EXCEPTION 'ORIGINAL_SCOPE_HASH_WAS_COPIED_TO_DERIVED_RUN';END IF;
 b:=public.trip_source_find_finite_universal_binding('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',q->'inputs');
 IF jsonb_array_length(b->'inputs')<>3 OR b->'inputs'->0->'pdfSource' IS NULL THEN RAISE EXCEPTION 'MIXED_BINDING_NOT_NORMALIZED';END IF;
 materials:=public.trip_source_read_universal_inputs('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid);
 IF jsonb_array_length(materials->'representations')<>3 OR materials->'representations'->0->'pdfSource' IS NULL OR materials->'representations'->1->'pngSource' IS NULL THEN RAISE EXCEPTION 'ACTUAL_MIXED_READER_FAILED';END IF;
 RAISE NOTICE 'ACTUAL mixed PNG/PDF/typed-text begin + Run/Input row guard + PDF normalization + original/derived hash separation + mixed Reader PASS';
END $$;
RESET SESSION AUTHORIZATION;
DELETE FROM public.trip_source_universal_scope;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$DECLARE q jsonb;b jsonb;materials jsonb;BEGIN
 SELECT x.q INTO q FROM qa_mixed x;
 b:=public.trip_source_find_finite_universal_binding('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',q->'inputs');
 materials:=public.trip_source_read_universal_inputs('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid);
 IF jsonb_array_length(b->'inputs')<>3 OR jsonb_array_length(materials->'representations')<>3 THEN RAISE EXCEPTION 'CLOSED_RETAINED_MIXED_READ_FAILED';END IF;
 BEGIN
  PERFORM public.trip_source_begin_finite_universal_inputs('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',q::text);
  RAISE EXCEPTION 'CLOSED_PREPARE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNIVERSAL_SOURCE_SCOPE_CLOSED' THEN RAISE;END IF;END;
 RAISE NOTICE 'ACTUAL scope-deleted mixed binding/material read retained; new prepare denied PASS';
END $$;
