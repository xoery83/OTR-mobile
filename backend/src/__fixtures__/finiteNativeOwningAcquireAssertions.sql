-- Real Source commands mint their own journal/action/receipt; no seeded Source rows.
RESET SESSION AUTHORIZATION;
DELETE FROM public.trip_source_universal_scope;
CREATE TEMP TABLE qa_finite_acquire(kind text,q jsonb);
DO $$
DECLARE actor uuid:='00000000-0000-4000-8000-000000000002';trip uuid:='10000000-0000-4000-8000-000000000001';i integer;source uuid;rep uuid;op uuid;key text;kind text;channel text;mime text;name text;sha text;bytes bigint;body text;d jsonb;cap text;acq text;p jsonb;q jsonb;pins jsonb:='[]';
BEGIN
 FOR i IN 1..3 LOOP
  source:=('25000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;rep:=('35000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;op:=('45000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;key:='finite-source:'||op;
  kind:=CASE i WHEN 1 THEN 'FILE' WHEN 2 THEN 'IMAGE' ELSE 'TEXT' END;channel:=CASE WHEN i=3 THEN 'PASTE' ELSE 'FILES' END;
  mime:=CASE i WHEN 1 THEN 'application/pdf' WHEN 2 THEN 'image/png' END;name:=CASE i WHEN 1 THEN 'Original.pdf' WHEN 2 THEN 'Original.png' END;
  body:=CASE WHEN i=3 THEN 'Typed mixed fixture 中文' END;
  sha:=CASE i WHEN 1 THEN 'f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758' WHEN 2 THEN '078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515' ELSE encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex') END;
  bytes:=CASE i WHEN 1 THEN 1676 WHEN 2 THEN 42630 ELSE octet_length(body) END;
  d:=jsonb_build_object('id',rep,'material_kind',CASE WHEN i=3 THEN 'TEXT' ELSE 'BINARY' END,'original_filename',name,'part_key',NULL,'mime_type',mime,'encoding',CASE WHEN i=3 THEN 'UTF-8' END,'payload_sha256',sha,'byte_count',bytes,'text_content',body,'locator_uri',NULL);
  cap:=public.trip_source_hash('otr-source-capture-v1',jsonb_build_array(1,source,1,NULL,jsonb_build_array(rep),'AS_SUPPLIED','ACQUISITION',NULL,NULL));
  acq:=public.trip_source_hash('otr-source-acquisition-v1',jsonb_build_array(1,trip,actor,source,key,kind,channel,NULL,'UNKNOWN',cap,jsonb_build_array(d->'id',d->'material_kind',d->'original_filename',d->'part_key',d->'mime_type',d->'encoding',d->'payload_sha256',d->'byte_count',d->'text_content',d->'locator_uri')));
  p:=jsonb_build_object('acquisition_key',key,'acquisition_sha256',acq,'source_input',jsonb_build_object('source_kind',kind,'acquisition_channel',channel,'captured_at',NULL,'capture_time_basis','UNKNOWN'),'capture',jsonb_build_object('completeness','AS_SUPPLIED','capture_sha256',cap),'original',d);
  q:=jsonb_build_object('contract_version',1,'command','ACQUIRE_SOURCE','operation_id',op,'operation_key',key,'actor_account_id',actor,'trip_id',trip,'source_id',source,'payload',p);
  q:=q||jsonb_build_object('operation_sha256',public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,'ACQUIRE_SOURCE',op,key,actor,trip,source,public.trip_source_payload_tuple('ACQUIRE_SOURCE',p))));
  INSERT INTO qa_finite_acquire VALUES(kind,public.trip_source_command_codec(q::text));
  pins:=pins||jsonb_build_array(jsonb_build_object('batchId','55000000-0000-4000-8000-000000000001','taskId','65000000-0000-4000-8000-000000000001','runId','75000000-0000-4000-8000-000000000001','submissionSha256',repeat('a',64),'command',q));
 END LOOP;
 INSERT INTO public.trip_source_universal_scope VALUES(true,actor,trip,'55000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes',pins);
END $$;
GRANT SELECT ON qa_finite_acquire TO otr_trip_source_command_gateway;
SET ROLE otr_trip_source_writer;
CREATE FUNCTION public.qa_finite_png_actual_raw(actor uuid,approved jsonb,changed jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM set_config('otr.universal.finite_command',approved::text,true);
 PERFORM set_config('otr.universal.source_pin',public.trip_source_finite_native_original_context(actor,approved::text)::text,true);
 changed:=changed||jsonb_build_object('operation_sha256',public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,changed->>'command',changed->>'operation_id',changed->>'operation_key',changed->>'actor_account_id',changed->>'trip_id',changed->>'source_id',public.trip_source_payload_tuple(changed->>'command',changed->'payload'))));
 RETURN public.trip_source_acquire_source(actor,changed::text);
END $$;
REVOKE ALL ON FUNCTION public.qa_finite_png_actual_raw(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_finite_png_actual_raw(uuid,jsonb,jsonb) TO otr_trip_source_command_gateway;
RESET ROLE;
GRANT EXECUTE ON FUNCTION public.trip_source_acquire_universal_original(uuid,text),public.trip_source_lookup_universal_original(uuid,text) TO otr_trip_source_command_gateway;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
BEGIN;
DO $$ DECLARE q jsonb;bad jsonb;BEGIN
 SELECT a.q INTO q FROM qa_finite_acquire a WHERE kind='IMAGE';
 bad:=jsonb_set(q,'{operation_id}','"45000000-0000-4000-8000-000000000099"');
 BEGIN
  PERFORM public.qa_finite_png_actual_raw((q->>'actor_account_id')::uuid,q,bad);
  RAISE EXCEPTION 'FROZEN_FRAME_ALLOWED_DIFFERENT_ACTUAL_COMMAND';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNIVERSAL_SOURCE_SCOPE_CLOSED' THEN RAISE;END IF;END;
 RAISE NOTICE 'Actual PNG register rejects a rehashed different operation even with an approved original context';
END $$;
DO $$ DECLARE row record;r jsonb;BEGIN
 FOR row IN SELECT * FROM qa_finite_acquire LOOP
  IF public.trip_source_lookup_universal_original((row.q->>'actor_account_id')::uuid,row.q::text) IS NOT NULL THEN RAISE EXCEPTION 'SOURCE_NOT_ABSENT';END IF;
  r:=public.trip_source_acquire_universal_original((row.q->>'actor_account_id')::uuid,row.q::text);
  IF r->>'outcome' IS DISTINCT FROM 'APPLIED' OR r->>'source_id' IS DISTINCT FROM row.q->>'source_id' THEN RAISE EXCEPTION 'ACTUAL_ACQUIRE_FAILED';END IF;
  IF public.trip_source_acquire_universal_original((row.q->>'actor_account_id')::uuid,row.q::text) IS DISTINCT FROM r THEN RAISE EXCEPTION 'ACTUAL_REPLAY_CHANGED';END IF;
 END LOOP;
END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF (SELECT count(*) FROM qa_finite_acquire q JOIN public.trip_sources s ON s.id=(q.q->>'source_id')::uuid JOIN public.trip_source_representations r ON r.source_id=s.id AND r.id=(q.q->'payload'->'original'->>'id')::uuid JOIN public.trip_source_operations o ON o.id=(q.q->>'operation_id')::uuid WHERE s.source_kind=q.kind AND r.payload_sha256=q.q->'payload'->'original'->>'payload_sha256' AND r.byte_count=(q.q->'payload'->'original'->>'byte_count')::bigint AND o.phase='FINAL' AND o.outcome='APPLIED')<>3 THEN RAISE EXCEPTION 'INDEPENDENT_ACQUIRE_READBACK_FAILED';END IF;
 RAISE NOTICE 'Actual Source ACQUIRE minted PDF/PNG/TEXT Source/Representation/journal/immutable receipts, exact replay and independent row readback PASS; no upload or parser';
END $$;
DELETE FROM public.trip_source_universal_scope;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$ DECLARE row record;BEGIN
 FOR row IN SELECT * FROM qa_finite_acquire LOOP
  IF public.trip_source_lookup_universal_original((row.q->>'actor_account_id')::uuid,row.q::text)->>'outcome' IS DISTINCT FROM 'APPLIED' THEN RAISE EXCEPTION 'RETAINED_LOOKUP_REQUIRED_SCOPE';END IF;
 END LOOP;
 RAISE NOTICE 'Actual retained Source receipts readable after scope removal with normal Actor/Source ACL';
END $$;
