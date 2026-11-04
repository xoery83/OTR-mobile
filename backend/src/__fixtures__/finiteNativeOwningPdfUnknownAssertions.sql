-- Seed only an already uncertain upload/attempt; test actual closed-state mutators.
RESET SESSION AUTHORIZATION;
BEGIN;
ALTER TABLE public.trip_source_operations DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_execution_attempts DISABLE TRIGGER USER;
ALTER TABLE public.trip_source_staged_resources DISABLE TRIGGER USER;
CREATE TEMP TABLE qa_pdf_unknown(attempt uuid,owner_run uuid,frame jsonb);
DO $$
DECLARE actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';
 source uuid:='25000000-0000-4000-8000-000000000001';rep uuid:='35000000-0000-4000-8000-000000000001';
 operation uuid:='46000000-0000-4000-8000-000000000001';parent uuid:='46000000-0000-4000-8000-000000000002';
 attempt uuid:='86000000-0000-4000-8000-000000000001';resource uuid:='87000000-0000-4000-8000-000000000001';owner uuid:='96000000-0000-4000-8000-000000000001';node uuid:='97000000-0000-4000-8000-000000000001';
 o public.trip_source_operations;pre public.trip_source_operations;r public.trip_source_representations;p jsonb;b jsonb;stamp timestamptz:=clock_timestamp()-interval '5 seconds';
BEGIN
 SELECT * INTO r FROM public.trip_source_representations WHERE id=rep;
 o.id:=operation;o.actor_account_id:=actor;o.trip_id:=trip;o.source_id:=source;o.representation_id:=rep;o.contract_version:=1;o.command:='UPLOAD_ORIGINAL';o.operation_key:=operation::text;o.material_revision:=1;o.created_at:=stamp;o.attempt_generation:=1;o.attempt_id:=attempt;o.phase:='IO_ACTIVE';o.worker_identity:='otr_trip_source_command_gateway';o.admitted_at:=stamp+interval '1 second';o.parent_operation_id:=parent;
 o.expected_source_row_revision:=1;o.expected_source_lifecycle:='ACTIVE';o.expected_source_retention_state:='RETAINED';o.expected_representation_row_revision:=1;o.expected_representation_remote_state:='PENDING';o.expected_representation_retention_state:='RETAINED';o.bound_payload_sha256:=r.payload_sha256;o.bound_byte_count:=r.byte_count;o.bound_mime_type:=r.mime_type;
 p:=jsonb_build_object('material_revision',1,'expected_source_row_revision',1,'expected_source_state',jsonb_build_object('lifecycle','ACTIVE','retention_state','RETAINED'),'representation_id',rep,'expected_representation_row_revision',1,'expected_representation_state',jsonb_build_object('remote_state','PENDING','retention_state','RETAINED'));
 pre:=o;pre.id:=parent;pre.operation_key:=parent::text;pre.command:='PREPARE_REPRESENTATION';pre.phase:='FINAL';pre.attempt_id:=NULL;pre.worker_identity:=NULL;pre.admitted_at:=NULL;pre.parent_operation_id:=NULL;pre.outcome:='APPLIED';pre.completed_at:=stamp;pre.result_source_row_revision:=1;pre.result_material_revision:=1;pre.result_representation_row_revision:=1;pre.result_remote_state:='PENDING';pre.result_retention_state:='RETAINED';
 pre.operation_sha256:=public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,pre.command,pre.id,pre.operation_key,actor,trip,source,public.trip_source_payload_tuple(pre.command,p)));
 pre.result_sha256:=public.trip_source_hash('otr-source-result-v1',public.trip_source_result_tuple(pre));INSERT INTO public.trip_source_operations SELECT pre.*;
 p:=p||jsonb_build_object('parent_operation_id',parent,'payload_sha256',r.payload_sha256,'byte_count',r.byte_count,'mime_type','application/pdf');
 o.operation_sha256:=public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,o.command,o.id,o.operation_key,actor,trip,source,public.trip_source_payload_tuple(o.command,p)));
 INSERT INTO public.trip_source_operations SELECT o.*;
 b:=jsonb_build_object('uploadVersion',4,'profileId','PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4','profileSha256','2a9b397d3f8368144517e0a3bf73595e71b6cba7b37341045eceef47ef059f3d',
 'actorAccountId',actor,'tripId',trip,'sourceId',source,'representationId',rep,'operationId',operation,'operationKey',o.operation_key,'operationSha256',o.operation_sha256,'materialRevision',1,'sourceRowRevision',1,'representationRowRevision',1,'parentOperationId',parent,'attemptId',attempt,'attemptGeneration',1,'executionPrincipal','otr_trip_source_command_gateway','resourceId',resource,'nodeId',node,'resourceKey',repeat('d',64),'runToken',owner,'provider','supabase_storage','bucket','trip-source-material','objectKey','v1/'||trip||'/'||source||'/'||rep||'/payload','sha256',r.payload_sha256,'byteCount',r.byte_count,'mimeType','application/pdf','producerId',owner,'providerInstanceSha256',repeat('e',64));
 INSERT INTO public.trip_source_staged_resources(id,execution_principal,node_id,resource_key,payload_sha256,byte_count,pdf_actor_account_id,pdf_causal_profile_id,pdf_sealed_at,pdf_stage_evidence_sha256)
 VALUES(resource,'otr_trip_source_command_gateway',node,repeat('d',64),r.payload_sha256,r.byte_count,actor,'PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4',clock_timestamp(),repeat('e',64));
 INSERT INTO public.trip_source_execution_attempts(id,operation_id,canonical_generation,trip_id,source_id,representation_id,operation_sha256,operation_key,material_revision,execution_principal,staged_resource_id,profile_id,profile_sha256,run_token,owner_run,owner_fence,phase,last_transition,pdf_binding,pdf_dispatch_id,pdf_dispatched_at)
 VALUES(attempt,operation,1,trip,source,rep,o.operation_sha256,o.operation_key,1,'otr_trip_source_command_gateway',resource,'PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4','2a9b397d3f8368144517e0a3bf73595e71b6cba7b37341045eceef47ef059f3d',owner,owner,1,'RUNNING','RUNNING',b,node,clock_timestamp());
 INSERT INTO qa_pdf_unknown VALUES(attempt,owner,jsonb_build_object('negativeUnknown',jsonb_build_object('operationId',operation,'operationSha256',o.operation_sha256,'attemptId',attempt,'ownerRun',owner,'ownerFence',1)));
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.trip_source_operations ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_execution_attempts ENABLE TRIGGER USER;
ALTER TABLE public.trip_source_staged_resources ENABLE TRIGGER USER;
COMMIT;
GRANT SELECT ON qa_pdf_unknown TO otr_trip_source_command_gateway;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
BEGIN;
DO $$ DECLARE row record;j jsonb;action text;bad jsonb;BEGIN
 SELECT * INTO row FROM qa_pdf_unknown;
 FOREACH bad IN ARRAY ARRAY[
  jsonb_set(row.frame,'{negativeUnknown,ownerFence}','2'),
  jsonb_set(row.frame,'{negativeUnknown,operationSha256}',to_jsonb(repeat('0',64))),
  jsonb_set(row.frame,'{negativeUnknown,ownerRun}','"96000000-0000-4000-8000-000000000099"'),
  jsonb_set(row.frame,'{negativeUnknown,attemptId}','"86000000-0000-4000-8000-000000000099"'),
  row.frame||'{"allowWrite":true}'::jsonb
 ] LOOP
  BEGIN
   PERFORM public.trip_source_universal_pdf_enter('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001',bad);
   RAISE EXCEPTION 'FORGED_UNKNOWN_CONTEXT_ALLOWED';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM<>'SOURCE_ACCESS_DENIED' THEN RAISE;END IF;END;
 END LOOP;
 IF public.trip_source_universal_pdf_enter('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001',row.frame) IS NOT TRUE THEN RAISE EXCEPTION 'EXACT_UNKNOWN_FRAME_REJECTED';END IF;
 IF has_function_privilege(current_user,'public.trip_source_finite_native_pdf_unknown(uuid,uuid,bigint)','EXECUTE') THEN RAISE EXCEPTION 'GATEWAY_UNKNOWN_BRIDGE_EXECUTE';END IF;
 FOREACH action IN ARRAY ARRAY['STAGE','DISPATCH','CONFIRM','READ','ACK','GET','TERMINAL','RELEASE','CLEANED'] LOOP
  BEGIN
   PERFORM public.trip_source_pdf_upload_v4_execute(row.attempt,row.owner_run,1,action,NULL);
   RAISE EXCEPTION 'POST_CLOSE_POSITIVE_ALLOWED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PDF_UNKNOWN_ONLY' THEN RAISE;END IF;END;
 END LOOP;
 BEGIN
  PERFORM public.trip_source_pdf_upload_v4_execute(row.attempt,row.owner_run,2,'UNKNOWN',NULL);
  RAISE EXCEPTION 'WRONG_FENCE_UNKNOWN_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PDF_UNKNOWN_ONLY' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.trip_source_pdf_upload_v4_claim(row.attempt,1,row.owner_run);
  RAISE EXCEPTION 'POST_CLOSE_CLAIM_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PDF_V4_CLOSED' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.trip_source_pdf_upload_v4_recover_claim(row.attempt,1,row.owner_run);
  RAISE EXCEPTION 'POST_CLOSE_RECOVER_CLAIM_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PDF_V4_CLOSED' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.trip_source_pdf_upload_v4_recover_dispatch(row.attempt,row.owner_run,1);
  RAISE EXCEPTION 'POST_CLOSE_RECOVER_DISPATCH_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PDF_V4_CLOSED' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.trip_source_pdf_upload_v4_restage(row.attempt,row.owner_run,1,NULL);
  RAISE EXCEPTION 'POST_CLOSE_RESTAGE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PDF_UNKNOWN_ONLY' THEN RAISE;END IF;END;
 j:=public.trip_source_pdf_upload_v4_execute(row.attempt,row.owner_run,1,'UNKNOWN',NULL);
 IF j->>'phase' IS DISTINCT FROM 'UNKNOWN' OR j->'termination_outstanding' IS DISTINCT FROM 'true'::jsonb OR j->>'owner_fence' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'UNKNOWN_PATH_NOT_PRESERVED';END IF;
 j:=public.trip_source_pdf_upload_v4_execute(row.attempt,row.owner_run,1,'UNKNOWN',NULL);
 IF j->>'phase' IS DISTINCT FROM 'UNKNOWN' THEN RAISE EXCEPTION 'UNKNOWN_OBSERVATION_NOT_IDEMPOTENT';END IF;
 RAISE NOTICE 'Actual PDF execute -> ExecutionWriter mutator -> Source observe -> journal guard with current CHECKs/triggers preserved UNKNOWN only after close; positive actions/wrong fence/direct Gateway bridge denied';
END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
DO $$ DECLARE row record;a public.trip_source_execution_attempts;o public.trip_source_operations;s public.trip_source_staged_resources;BEGIN
 SELECT * INTO row FROM qa_pdf_unknown;
 SELECT * INTO a FROM public.trip_source_execution_attempts WHERE id=row.attempt;SELECT * INTO o FROM public.trip_source_operations WHERE id=a.operation_id;SELECT * INTO s FROM public.trip_source_staged_resources WHERE id=a.staged_resource_id;
 IF a.phase<>'UNKNOWN' OR o.phase<>'IO_UNKNOWN' OR o.outcome IS NOT NULL OR o.completed_at IS NOT NULL OR o.io_finished_at IS NOT NULL OR a.canonical_generation<>1 OR a.owner_fence<>1 OR NOT a.termination_outstanding OR s.release_authorized_at IS NOT NULL OR s.cleaned_at IS NOT NULL OR a.pdf_beta_get IS NOT NULL THEN RAISE EXCEPTION 'UNKNOWN_CREATED_FALSE_TERMINAL_RECEIPT_OR_CLEANUP';END IF;
 RAISE NOTICE 'Independent readback: original generation/owner retained, no final receipt/promotion/release/cleanup fabricated';
END $$;
