-- Actual accepted Source codec/hash/roles/RLS. Synthetic finite approval, no business writes.
CREATE TEMP TABLE qa_finite_command(label text,q jsonb);
DO $$
DECLARE actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';q jsonb;p jsonb;frame jsonb;
BEGIN
 IF public.trip_source_admission(actor,trip,true) IS NOT TRUE THEN RAISE EXCEPTION 'OWNING_FIXTURE_ACTOR_UNAVAILABLE';END IF;
 p:=jsonb_build_object('material_revision',1,'expected_source_row_revision',1,'expected_source_state',jsonb_build_object('lifecycle','ACTIVE','retention_state','RETAINED'),
  'representation_id','30000000-0000-4000-8000-000000000001','expected_representation_row_revision',1,'expected_representation_state',jsonb_build_object('remote_state','PENDING','retention_state','RETAINED'));
 q:=jsonb_build_object('contract_version',1,'command','PREPARE_REPRESENTATION','operation_id','40000000-0000-4000-8000-000000000001','operation_key','finite-native-fixture',
  'actor_account_id',actor,'trip_id',trip,'source_id','20000000-0000-4000-8000-000000000001','payload',p);
 q:=q||jsonb_build_object('operation_sha256',public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,q->>'command',q->>'operation_id',q->>'operation_key',actor,trip,q->>'source_id',public.trip_source_payload_tuple(q->>'command',p))));
 q:=public.trip_source_command_codec(q::text);
 INSERT INTO qa_finite_command VALUES('approved',q);
 frame:=jsonb_build_object('batchId','50000000-0000-4000-8000-000000000001','taskId','60000000-0000-4000-8000-000000000001','runId','70000000-0000-4000-8000-000000000001','submissionSha256',repeat('a',64),'command',q);
 INSERT INTO public.trip_source_universal_scope(singleton,actor_id,trip_id,batch_id,task_id,run_id,submission_sha256,input_sha256,starts_at,expires_at,source_command_pins)
 VALUES(true,actor,trip,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes',jsonb_build_array(frame));
 q:=jsonb_set(q,'{payload,expected_source_row_revision}','2');
 q:=q||jsonb_build_object('operation_sha256',public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,q->>'command',q->>'operation_id',q->>'operation_key',actor,trip,q->>'source_id',public.trip_source_payload_tuple(q->>'command',q->'payload'))));
 INSERT INTO qa_finite_command VALUES('changed-cas',public.trip_source_command_codec(q::text));
END $$;
-- Local test entry reproduces a SourceWriter definer call; Gateway never gets SET ROLE or helper EXECUTE.
SET ROLE otr_trip_source_writer;
CREATE FUNCTION public.qa_finite_command(actor uuid,trip uuid,raw text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.trip_source_finite_native_command(actor,trip,raw) $$;
REVOKE ALL ON FUNCTION public.qa_finite_command(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_finite_command(uuid,uuid,text) TO otr_trip_source_command_gateway;
RESET ROLE;
GRANT SELECT ON qa_finite_command TO otr_trip_source_command_gateway;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$
DECLARE q jsonb;bad jsonb;actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';
BEGIN
 SELECT x.q INTO q FROM qa_finite_command x WHERE label='approved';
 IF public.qa_finite_command(actor,trip,q::text) IS NOT TRUE THEN RAISE EXCEPTION 'EXACT_APPROVED_COMMAND_REJECTED';END IF;
 IF public.qa_finite_command(trip,trip,q::text) IS NOT FALSE THEN RAISE EXCEPTION 'WRONG_ACTOR_ALLOWED';END IF;
 bad:=jsonb_set(q,'{payload,expected_source_row_revision}','2');
 BEGIN
  PERFORM public.qa_finite_command(actor,trip,bad::text);
  RAISE EXCEPTION 'FORGED_CAS_WITH_STALE_DIGEST_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_SOURCE_COMMAND' THEN RAISE;END IF;END;
 SELECT x.q INTO bad FROM qa_finite_command x WHERE label='changed-cas';
 IF public.qa_finite_command(actor,trip,bad::text) IS NOT FALSE THEN RAISE EXCEPTION 'CHANGED_VALID_CAS_NOT_IN_PIN_ALLOWED';END IF;
 IF has_function_privilege(current_user,'public.trip_source_finite_native_command(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'GATEWAY_DIRECT_HELPER_EXECUTE';END IF;
 RAISE NOTICE 'actual codec/hash accepted exact frozen frame and rejected wrong Actor, stale digest, valid changed CAS; no Source/Operation minted';
END $$;
RESET ROLE;RESET SESSION AUTHORIZATION;
DO $$BEGIN IF EXISTS(SELECT 1 FROM public.trip_source_operations WHERE operation_key='finite-native-fixture') THEN RAISE EXCEPTION 'QUALIFICATION_CREATED_OPERATION';END IF;END $$;
UPDATE public.trip_source_universal_scope SET expires_at=clock_timestamp()-interval '1 second';
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$ DECLARE q jsonb;BEGIN
 SELECT x.q INTO q FROM qa_finite_command x WHERE label='approved';
 IF public.qa_finite_command('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',q::text) IS NOT FALSE THEN RAISE EXCEPTION 'CLOSED_COMMAND_ALLOWED';END IF;
 RAISE NOTICE 'expired scope rejected new command using actual Source codec/hash';
END $$;
