-- Actual Source scope/enter and current material checks; no PDF worker or DML.
RESET SESSION AUTHORIZATION;
GRANT EXECUTE ON FUNCTION public.trip_source_universal_pdf_enter(uuid,uuid,uuid,jsonb) TO otr_trip_source_command_gateway;
UPDATE public.trip_source_universal_scope s SET source_command_pins=source_command_pins||(
 SELECT jsonb_build_array(jsonb_build_object('batchId',s.batch_id,'taskId',s.task_id,'runId',s.run_id,'submissionSha256',s.submission_sha256,
  'pdfSealTemplate',jsonb_build_object('accountId',s.actor_id,'tripId',s.trip_id,'request',
   (r.request-ARRAY['verificationOperationId','verificationResultSha256'])||jsonb_build_object('operationId','4a000000-0000-4000-8000-000000000001'))))
 FROM qa_pdf_registration r ORDER BY request->>'sourceId' LIMIT 1);
-- An exact seal is still ineligible without the existing immutable registration.
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$ DECLARE q jsonb;BEGIN
 SELECT (request-ARRAY['verificationOperationId','verificationResultSha256'])||jsonb_build_object('operationId','4a000000-0000-4000-8000-000000000001') INTO q FROM qa_pdf_registration ORDER BY request->>'sourceId' LIMIT 1;
 BEGIN
  PERFORM public.trip_source_universal_pdf_enter('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',(q->>'sourceId')::uuid,jsonb_build_object('pdfSeal',q));
  RAISE EXCEPTION 'PDF_SEAL_WITHOUT_REGISTRATION_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'SOURCE_ACCESS_DENIED' THEN RAISE;END IF;END;
END $$;
RESET SESSION AUTHORIZATION;
-- Seed the actual immutable registration table from the same existing valid proof.
-- This is not a worker run or registration-commit/Hosted acceptance claim.
INSERT INTO public.trip_source_pdf_registrations(operation_id,account_id,trip_id,source_id,derived_representation_id,request_sha256,registration_sha256,body)
SELECT (b->'request'->>'operationId')::uuid,(b->>'accountId')::uuid,(b->>'tripId')::uuid,(b->'request'->>'sourceId')::uuid,
 (b->'request'->>'derivedRepresentationId')::uuid,b->>'requestSha256',public.trip_source_hash('otr-source-pdf-registration-v2',b),b
FROM (SELECT s.body||jsonb_build_object('request',r.request,'requestSha256',public.trip_source_hash('otr-source-pdf-registration-request-v2',jsonb_build_object('accountId',s.account_id,'tripId',s.trip_id,'request',r.request))) AS b
 FROM qa_pdf_registration r JOIN public.trip_source_pdf_seals s ON s.source_id=(r.request->>'sourceId')::uuid ORDER BY r.request->>'sourceId' LIMIT 1) x;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
BEGIN;
DO $$
DECLARE q jsonb;seal jsonb;bad jsonb;actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';
BEGIN
 SELECT command INTO q FROM qa_pdf_registration ORDER BY request->>'sourceId' LIMIT 1;
 IF public.trip_source_universal_pdf_enter(actor,trip,(q->>'source_id')::uuid,jsonb_build_object('command',q)) IS NOT TRUE THEN RAISE EXCEPTION 'EXACT_PDF_FRAME_REJECTED';END IF;
 -- The retained Source operation may resolve identity, but the frozen command remains authority.
 IF public.trip_source_universal_pdf_enter(actor,trip,(q->>'source_id')::uuid,jsonb_build_object('operationId',q->>'operation_id','operationSha256',q->>'operation_sha256')) IS NOT TRUE THEN RAISE EXCEPTION 'EXACT_PDF_OPERATION_FRAME_REJECTED';END IF;
 BEGIN
  PERFORM public.trip_source_universal_pdf_enter(actor,trip,(q->>'source_id')::uuid,jsonb_build_object('operationId',q->>'operation_id','operationSha256',repeat('0',64)));
  RAISE EXCEPTION 'FORGED_PDF_OPERATION_FRAME_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'SOURCE_ACCESS_DENIED' THEN RAISE;END IF;END;
 SELECT (request-ARRAY['verificationOperationId','verificationResultSha256'])||jsonb_build_object('operationId','4a000000-0000-4000-8000-000000000001') INTO seal FROM qa_pdf_registration ORDER BY request->>'sourceId' LIMIT 1;
 IF public.trip_source_universal_pdf_enter(actor,trip,(q->>'source_id')::uuid,jsonb_build_object('pdfSeal',seal)) IS NOT TRUE THEN RAISE EXCEPTION 'EXACT_PDF_SEAL_FRAME_REJECTED';END IF;
 FOREACH bad IN ARRAY ARRAY[jsonb_set(seal,'{operationId}',to_jsonb(trip)),jsonb_set(seal,'{sourceRowRevision}','2'),seal||'{"extra":true}'::jsonb] LOOP
  BEGIN
   PERFORM public.trip_source_universal_pdf_enter(actor,trip,(q->>'source_id')::uuid,jsonb_build_object('pdfSeal',bad));
   RAISE EXCEPTION 'UNFROZEN_PDF_SEAL_FRAME_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'SOURCE_ACCESS_DENIED' THEN RAISE;END IF;END;
 END LOOP;
 RAISE NOTICE 'Actual PDF seal entry accepted exact frozen seal, actual immutable registration lookup/hash and VERIFY slot; changed seal ID/CAS/shape denied; no worker or seal mint';
END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
UPDATE public.trip_source_universal_scope SET expires_at=clock_timestamp()-interval '1 second';
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$ DECLARE q jsonb;BEGIN
 SELECT command INTO q FROM qa_pdf_registration ORDER BY request->>'sourceId' LIMIT 1;
 BEGIN
  PERFORM public.trip_source_universal_pdf_enter((q->>'actor_account_id')::uuid,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,jsonb_build_object('command',q));
  RAISE EXCEPTION 'EXPIRED_PDF_FRAME_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'SOURCE_ACCESS_DENIED' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.trip_source_universal_pdf_enter((q->>'actor_account_id')::uuid,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,
   jsonb_build_object('pdfSeal',(SELECT (request-ARRAY['verificationOperationId','verificationResultSha256'])||jsonb_build_object('operationId','4a000000-0000-4000-8000-000000000001') FROM qa_pdf_registration ORDER BY request->>'sourceId' LIMIT 1)));
  RAISE EXCEPTION 'EXPIRED_PDF_SEAL_FRAME_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'SOURCE_ACCESS_DENIED' THEN RAISE;END IF;END;
 RAISE NOTICE 'Actual PDF command and exact seal entry denied after finite expiry';
END $$;

RESET SESSION AUTHORIZATION;
DELETE FROM public.trip_source_universal_scope;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$ DECLARE q jsonb;BEGIN
 SELECT (request-ARRAY['verificationOperationId','verificationResultSha256'])||jsonb_build_object('operationId','4a000000-0000-4000-8000-000000000001') INTO q FROM qa_pdf_registration ORDER BY request->>'sourceId' LIMIT 1;
 BEGIN
  PERFORM public.trip_source_universal_pdf_enter('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',(q->>'sourceId')::uuid,jsonb_build_object('pdfSeal',q));
  RAISE EXCEPTION 'CLOSED_PDF_SEAL_FRAME_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'SOURCE_ACCESS_DENIED' THEN RAISE;END IF;END;
END $$;
RESET SESSION AUTHORIZATION;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.trip_source_pdf_seals WHERE operation_id='4a000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'SCOPE_PROOF_MINTED_SEAL';END IF;
 RAISE NOTICE 'Deleted scope denies exact PDF seal; no new seal minted';
END $$;
