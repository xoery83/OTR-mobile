-- Seeded durable proof records, actual PNG facts/receipt/hash validators and RLS.
-- No physical worker/upload claim; no Hosted mutation.
DELETE FROM public.trip_source_universal_scope;
CREATE TEMP TABLE qa_png_proof(request jsonb);
CREATE TEMP TABLE qa_png_commands(operation uuid,q jsonb);
BEGIN;
ALTER TABLE public.trip_sources DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_revisions DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_representations DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_operations DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_staged_resources DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_execution_attempts DISABLE TRIGGER USER;
DO $$
DECLARE actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';source uuid;rep uuid;prepared uuid;upload uuid;verification uuid;attempt uuid;stage uuid;node uuid;
 o public.trip_source_operations;i integer;j integer;ts timestamptz:=clock_timestamp()-interval '1 minute';pins jsonb:='[]';q jsonb;payload jsonb;upload_sha text;sha text:='078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515';
BEGIN
 FOR i IN 1..4 LOOP
  source:=('22000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;rep:=('33000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  prepared:=('42000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;upload:=('43000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;verification:=('44000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  attempt:=('45000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;stage:=('46000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;node:=('47000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision)
  VALUES(source,trip,actor,source::text,repeat('0',64),'IMAGE','FILES','UNKNOWN',ts,1,1);
  INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason)
  VALUES(source,1,ts,actor,source::text,repeat('0',64),ARRAY[rep],'AS_SUPPLIED','ACQUISITION');
  INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,payload_sha256,byte_count,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state,verified_at)
  VALUES(rep,3,source,1,'ORIGINAL','BINARY','image/png',sha,42630,'NOT_APPLICABLE',ts,'supabase_storage','trip-source-material','v1/'||trip||'/'||source||'/'||rep||'/payload','VERIFIED',ts+interval '16 seconds');
  FOR j IN 0..2 LOOP
   o:=NULL;o.id:=CASE j WHEN 0 THEN prepared WHEN 1 THEN upload ELSE verification END;o.trip_id:=trip;o.actor_account_id:=actor;o.source_id:=source;o.operation_key:=o.id::text;o.contract_version:=1;
   o.command:=CASE j WHEN 0 THEN 'PREPARE_REPRESENTATION' WHEN 1 THEN 'UPLOAD_ORIGINAL' ELSE 'VERIFY_REPRESENTATION' END;
   o.created_at:=ts;o.material_revision:=1;o.representation_id:=rep;o.expected_source_row_revision:=1;o.expected_source_lifecycle:='ACTIVE';o.expected_source_retention_state:='RETAINED';
   o.expected_representation_row_revision:=greatest(j,1);o.expected_representation_remote_state:='PENDING';o.expected_representation_retention_state:='RETAINED';
   IF j>0 THEN o.bound_payload_sha256:=sha;o.bound_byte_count:=42630;o.bound_mime_type:='image/png';o.attempt_id:=CASE WHEN j=1 THEN attempt ELSE verification END;o.worker_identity:='otr_trip_source_command_gateway';o.admitted_at:=ts+CASE j WHEN 1 THEN interval '2 seconds' ELSE interval '15 seconds' END;o.io_finished_at:=ts+CASE j WHEN 1 THEN interval '10 seconds' ELSE interval '16 seconds' END;END IF;
   IF j=1 THEN o.parent_operation_id:=prepared;END IF;
   payload:=jsonb_build_object('material_revision',1,'expected_source_row_revision',1,'expected_source_state',jsonb_build_object('lifecycle','ACTIVE','retention_state','RETAINED'),'representation_id',rep,'expected_representation_row_revision',greatest(j,1),'expected_representation_state',jsonb_build_object('remote_state','PENDING','retention_state','RETAINED'));
   IF j=1 THEN payload:=payload||jsonb_build_object('parent_operation_id',prepared,'payload_sha256',sha,'byte_count',42630,'mime_type','image/png');END IF;
   q:=jsonb_build_object('contract_version',1,'command',o.command,'operation_id',o.id,'operation_key',o.operation_key,'actor_account_id',actor,'trip_id',trip,'source_id',source,'payload',payload);
   IF j=1 THEN o.operation_sha256:=public.trip_source_hash('otr-source-upload-v1',jsonb_build_array(1,o.id,o.operation_key,actor,trip,source)||public.trip_source_payload_tuple(o.command,payload));
   ELSE o.operation_sha256:=public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,o.command,o.id,o.operation_key,actor,trip,source,public.trip_source_payload_tuple(o.command,payload)));END IF;
   q:=q||jsonb_build_object('operation_sha256',o.operation_sha256);q:=public.trip_source_command_codec(q::text);
   IF j=1 THEN upload_sha:=o.operation_sha256;INSERT INTO qa_png_commands VALUES(o.id,q);END IF;
   o.phase:='FINAL';o.attempt_generation:=1;o.outcome:='APPLIED';o.completed_at:=ts+CASE j WHEN 0 THEN interval '1 second' WHEN 1 THEN interval '12 seconds' ELSE interval '18 seconds' END;
   o.result_source_row_revision:=1;o.result_material_revision:=1;o.result_representation_row_revision:=j+1;o.result_remote_state:=CASE WHEN j=2 THEN 'VERIFIED' ELSE 'PENDING' END;o.result_retention_state:='RETAINED';
   IF j=2 THEN o.result_verified_at:=ts+interval '16 seconds';END IF;
   o.result_sha256:=public.trip_source_hash('otr-source-result-v1',public.trip_source_result_tuple(o));
   IF i=4 AND j=1 THEN o.result_sha256:=repeat('0',64);END IF;
   INSERT INTO public.trip_source_operations SELECT o.*;
  END LOOP;
  INSERT INTO public.trip_source_staged_resources(id,execution_principal,node_id,resource_key,payload_sha256,byte_count,created_at)
  VALUES(stage,'otr_trip_source_command_gateway',CASE WHEN i=2 THEN source ELSE node END,repeat(i::text,64),sha,42630,ts+interval '3 seconds');
  INSERT INTO public.trip_source_execution_attempts(id,operation_id,canonical_generation,trip_id,source_id,representation_id,operation_sha256,operation_key,material_revision,execution_principal,staged_resource_id,profile_id,profile_sha256,run_token,owner_run,owner_fence,phase,termination_outstanding,runtime_node_id,container_id,last_transition,created_at,transitioned_at,terminal_observed_at,terminal_evidence_sha256,terminal_result)
  VALUES(attempt,upload,1,trip,source,rep,upload_sha,upload::text,1,'otr_trip_source_command_gateway',stage,'PNG_STATIC_RGB8_RGBA8_V1','0e22d87a595129dbd9a3b2b00a771379f0e26d15d7a46781c76c7c08ed65a726',attempt,source,1,'TERMINAL',false,node,repeat(i::text,64),'TERMINAL',ts+interval '4 seconds',ts+interval '8 seconds',ts+interval '8 seconds',repeat('d',64),CASE WHEN i=3 THEN 'PARSER_CRASH' ELSE 'PARSE_PASS' END);
  pins:=pins||jsonb_build_array(jsonb_build_object('id',source,'source_id',source,'material_revision',1,'representation_id',rep,'payload_sha256',sha,'byte_count',42630,'observed_source_row_revision',1,'historical_selection',false));
 END LOOP;
 q:=jsonb_build_object('runId','72000000-0000-4000-8000-000000000001','batchId','52000000-0000-4000-8000-000000000001','taskId','62000000-0000-4000-8000-000000000001','submissionSha256',repeat('a',64),'inputs',pins);
 INSERT INTO qa_png_proof VALUES(q);
 INSERT INTO public.trip_source_universal_scope(singleton,actor_id,trip_id,batch_id,task_id,run_id,submission_sha256,input_sha256,starts_at,expires_at)
 VALUES(true,actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',public.trip_import_run_input_hash(pins),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes');
 UPDATE public.trip_source_universal_scope s SET source_command_pins=(SELECT jsonb_agg(jsonb_build_object('batchId',s.batch_id,'taskId',s.task_id,'runId',s.run_id,'submissionSha256',s.submission_sha256,'command',c.q) ORDER BY operation) FROM qa_png_commands c);
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.trip_sources ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_revisions ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_representations ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_operations ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_staged_resources ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_execution_attempts ENABLE TRIGGER USER;
COMMIT;
SET ROLE otr_trip_source_writer;
CREATE FUNCTION public.qa_png_facts(actor uuid,trip uuid,q jsonb,index integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.trip_source_inputs;result jsonb;BEGIN
 PERFORM set_config('otr.universal.finite_batch',q::text,true);
 p:=jsonb_populate_record(NULL::public.trip_source_inputs,(q->'inputs'->index)||jsonb_build_object('run_id',q->>'runId','confirmation_id',NULL));
 result:=public.trip_source_png_original_facts(actor,trip,p.source_id,p.representation_id,p.material_revision);
 PERFORM set_config('otr.universal.finite_batch','',true);RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.qa_png_facts(uuid,uuid,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_png_facts(uuid,uuid,jsonb,integer) TO otr_trip_source_command_gateway;
RESET ROLE;
GRANT SELECT ON qa_png_proof TO otr_trip_source_command_gateway;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$ DECLARE q jsonb;result jsonb;i integer;BEGIN
 SELECT request INTO q FROM qa_png_proof;
 result:=public.qa_png_facts('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',q,0);
 IF result->'verification'->>'attemptId' IS DISTINCT FROM '45000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'ACTUAL_PNG_PROOF_POSITIVE_FAILED';END IF;
 FOR i IN 1..3 LOOP
  BEGIN
   PERFORM public.qa_png_facts('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',q,i);
   RAISE EXCEPTION 'INVALID_ACTUAL_PNG_PROOF_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM IS DISTINCT FROM (CASE WHEN i=3 THEN 'REPLAY_UNAVAILABLE' ELSE 'PNG_PROOF_UNQUALIFIED' END) THEN RAISE;END IF;END;
 END LOOP;
 RAISE NOTICE 'ACTUAL PNG upload+verify immutable receipt + execution identity/profile/node/terminal proof PASS; node mismatch, PARSER_CRASH and forged receipt rejected; seeded records only';
END $$;
