-- Route boundary fixture only: existing proof/hash dependencies remain doubles.
SET ROLE otr_trip_source_writer;
ALTER TABLE public.trip_source_runs ADD COLUMN generation bigint DEFAULT 1, ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
ALTER TABLE public.trip_source_representations ADD COLUMN payload_sha256 text, ADD COLUMN byte_count bigint, ADD COLUMN parent_ids uuid[];
UPDATE public.trip_source_representations r SET payload_sha256=i.payload_sha256,byte_count=i.byte_count FROM public.trip_source_inputs i WHERE i.representation_id=r.id;
CREATE FUNCTION public.trip_import_scope_lock(uuid,uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.trip_source_lock_universal_materials(uuid,uuid,uuid[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.trip_event_canonical_json(q json) RETURNS text LANGUAGE sql AS $$ SELECT q::text $$;
-- Only the delegate boundary is tested here; production begin/proof is not replaced in DEV.
CREATE FUNCTION public.trip_source_begin_universal_inputs(actor uuid,trip uuid,raw text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE q jsonb:=raw::jsonb;
BEGIN
 IF public.trip_source_finite_native_normalized_scope(actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',q->'inputs') IS NOT TRUE THEN RAISE EXCEPTION 'FIXTURE_DELEGATE_NORMALIZED_SCOPE_REJECTED';END IF;
 RETURN q;
END $$;
DO $$
DECLARE r public.trip_source_runs;p public.trip_source_inputs;binding jsonb;originals jsonb;bad jsonb;
BEGIN
 SELECT * INTO r FROM public.trip_source_runs;
 SELECT jsonb_agg((to_jsonb(i)-'run_id'-'confirmation_id')||CASE WHEN q.facts->'pdfSource' IS NOT NULL
 THEN jsonb_build_object('representation_id',q.facts->'pdfSource'->'original'->>'representationId','payload_sha256',q.facts->'pdfSource'->'original'->>'sha256','byte_count',q.facts->'pdfSource'->'original'->'byteCount') ELSE '{}' END ORDER BY i.id)
 INTO originals FROM public.trip_source_inputs i LEFT JOIN public.qa_proofs q ON q.id=i.representation_id WHERE i.run_id=r.id;
 binding:=public.trip_source_find_finite_universal_binding(r.actor_account_id,r.trip_id,r.capture_batch_id,r.interpretation_task_id,r.id,r.capture_submission_sha256,originals);
 IF binding->>'runId' IS DISTINCT FROM r.id::text OR jsonb_array_length(binding->'inputs')<>3 OR EXISTS(SELECT 1 FROM public.trip_source_universal_scope)
 THEN RAISE EXCEPTION 'RETAINED_BINDING_READ_FAILED';END IF;
 BEGIN
  PERFORM public.trip_source_find_finite_universal_binding(r.actor_account_id,r.trip_id,r.capture_batch_id,r.id,r.id,r.capture_submission_sha256,originals);
  RAISE EXCEPTION 'WRONG_TASK_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNIVERSAL_SOURCE_RUN_UNAVAILABLE' THEN RAISE;END IF;END;
 bad:=jsonb_set(originals,'{0,byte_count}','999');
 BEGIN
  PERFORM public.trip_source_find_finite_universal_binding(r.actor_account_id,r.trip_id,r.capture_batch_id,r.interpretation_task_id,r.id,r.capture_submission_sha256,bad);
  RAISE EXCEPTION 'WRONG_ORIGINAL_PINS_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OPERATION_KEY_REUSED' THEN RAISE;END IF;END;
 SELECT * INTO p FROM public.trip_source_inputs WHERE run_id=r.id ORDER BY id LIMIT 1;
 IF public.trip_source_finite_native_material(r.actor_account_id,r.trip_id,p,false) IS NOT TRUE
 OR public.trip_source_finite_native_material(r.actor_account_id,r.trip_id,p,true) IS NOT FALSE
 THEN RAISE EXCEPTION 'CLOSED_SCOPE_ALLOWED_NEW_MATERIAL_WRITE';END IF;
 IF public.trip_source_finite_native_png_material(r.actor_account_id,r.trip_id,p.source_id,p.representation_id,p.material_revision) IS NOT TRUE
 OR public.trip_source_finite_native_png_material(r.actor_account_id,r.trip_id,p.source_id,p.representation_id,p.material_revision+1) IS NOT FALSE
 THEN RAISE EXCEPTION 'RETAINED_PNG_PIN_SCOPE_MISMATCH';END IF;
 UPDATE public.qa_acl SET allowed=false;
 BEGIN
  PERFORM public.trip_source_find_finite_universal_binding(r.actor_account_id,r.trip_id,r.capture_batch_id,r.interpretation_task_id,r.id,r.capture_submission_sha256,originals);
  RAISE EXCEPTION 'REVOKED_ACL_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SOURCE_ACCESS_DENIED' THEN RAISE;END IF;END;
 UPDATE public.qa_acl SET allowed=true;
 RAISE NOTICE 'FINITE ROUTE retained binding/tuple/original projection/closed write/ACL boundary PASS; proof/hash doubles';
END $$;
CREATE OR REPLACE FUNCTION public.trip_source_universal_pdf_material(actor uuid,trip uuid,pin public.trip_source_inputs,normalize_original boolean,writing boolean) RETURNS jsonb LANGUAGE sql AS $$
 SELECT q.facts FROM public.qa_proofs q WHERE q.actor=$1 AND q.trip=$2 AND valid
 AND (q.id=($3).representation_id OR ($4 AND q.facts->'pdfSource'->'original'->>'representationId'=($3).representation_id::text))
$$;
DO $$
DECLARE r public.trip_source_runs;q jsonb;originals jsonb;result jsonb;p public.trip_source_inputs;
BEGIN
 SELECT * INTO r FROM public.trip_source_runs;
 UPDATE public.qa_proofs q SET facts=q.facts||jsonb_build_object('input',to_jsonb(i)-'run_id'-'confirmation_id') FROM public.trip_source_inputs i WHERE i.representation_id=q.id AND q.facts ? 'pdfSource';
 INSERT INTO public.trip_source_representations(id,source_id,role,mime_type,payload_sha256,byte_count)
 SELECT (q.facts->'pdfSource'->'original'->>'representationId')::uuid,i.source_id,'ORIGINAL','application/pdf',q.facts->'pdfSource'->'original'->>'sha256',(q.facts->'pdfSource'->'original'->>'byteCount')::bigint
 FROM public.qa_proofs q JOIN public.trip_source_inputs i ON i.representation_id=q.id WHERE q.facts ? 'pdfSource';
 UPDATE public.trip_source_representations d SET parent_ids=ARRAY[(q.facts->'pdfSource'->'original'->>'representationId')::uuid] FROM public.qa_proofs q WHERE q.id=d.id AND q.facts ? 'pdfSource';
 SELECT jsonb_agg((to_jsonb(i)-'run_id'-'confirmation_id')||CASE WHEN q.facts ? 'pdfSource'
 THEN jsonb_build_object('representation_id',q.facts->'pdfSource'->'original'->>'representationId','payload_sha256',q.facts->'pdfSource'->'original'->>'sha256','byte_count',q.facts->'pdfSource'->'original'->'byteCount') ELSE '{}' END ORDER BY i.id)
 INTO originals FROM public.trip_source_inputs i LEFT JOIN public.qa_proofs q ON q.id=i.representation_id WHERE i.run_id=r.id;
 DELETE FROM public.trip_source_runs WHERE id=r.id;
 INSERT INTO public.trip_source_universal_scope VALUES(true,r.actor_account_id,r.trip_id,r.capture_batch_id,r.interpretation_task_id,r.id,r.capture_submission_sha256,public.trip_import_run_input_hash(originals),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes');
 IF public.trip_source_find_finite_universal_binding(r.actor_account_id,r.trip_id,r.capture_batch_id,r.interpretation_task_id,r.id,r.capture_submission_sha256,originals) IS NOT NULL THEN RAISE EXCEPTION 'ABSENT_LOOKUP_MINTED_BINDING';END IF;
 q:=jsonb_build_object('runId',r.id,'batchId',r.capture_batch_id,'taskId',r.interpretation_task_id,'submissionSha256',r.capture_submission_sha256,'inputs',originals);
 result:=public.trip_source_begin_finite_universal_inputs(r.actor_account_id,r.trip_id,q::text);
 IF public.trip_import_run_input_hash(result->'inputs')=public.trip_import_run_input_hash(originals)
 OR current_setting('otr.universal.finite_batch',true) IS DISTINCT FROM ''
 OR EXISTS(SELECT 1 FROM public.trip_source_universal_scope s WHERE s.input_sha256<>public.trip_import_run_input_hash(originals))
 THEN RAISE EXCEPTION 'ORIGINAL_DERIVED_HASH_OR_FRAME_LIFETIME_BROKEN';END IF;
 UPDATE public.trip_source_universal_scope SET expires_at=clock_timestamp()-interval '1 second';
 BEGIN
  PERFORM public.trip_source_begin_finite_universal_inputs(r.actor_account_id,r.trip_id,q::text);
  RAISE EXCEPTION 'EXPIRED_PREPARE_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNIVERSAL_SOURCE_SCOPE_CLOSED' THEN RAISE;END IF;END;
 DELETE FROM public.trip_source_universal_scope;
 INSERT INTO public.trip_source_runs SELECT r.*;
 RAISE NOTICE 'FINITE ROUTE ABSENT lookup/normalization boundary/original-hash preservation/expired prepare PASS; actual begin delegate remains a double';
END $$;
