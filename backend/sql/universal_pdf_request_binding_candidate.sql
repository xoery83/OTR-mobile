-- Protected Source maintenance. Requires the existing owning Source Writer.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25s';
DO $patch$
DECLARE current_definition text;
BEGIN
 IF current_user<>'otr_trip_source_writer'
  OR NOT pg_try_advisory_xact_lock(hashtextextended('otr-source-activation-v1',0))
 THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_WRITER_OR_LOCK'; END IF;
 SELECT pg_get_functiondef(p.oid) INTO current_definition FROM pg_proc p WHERE p.oid='public.trip_source_universal_pdf_enter(uuid,uuid,uuid,jsonb)'::regprocedure AND pg_get_userbyid(p.proowner)=current_user AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer,otr_trip_source_command_gateway=X/otr_trip_source_writer}';
 IF current_definition IS NULL OR encode(sha256(convert_to(current_definition,'UTF8')),'hex')<>'c67d31c9f7b39e0bb2e334642b8aecba0a7ad96ddb8d852677d11fdfbd5db823'
 THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_PREIMAGE_DRIFT_67454';END IF;
 current_definition:=replace(current_definition,$old0$
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
END $old0$,$new0$
DECLARE entered boolean; pins jsonb; q jsonb;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 PERFORM set_config('otr.universal.finite_pdf_unknown','',true);
 PERFORM set_config('otr.source.ordinary_pdf_reserve','',true);
 IF frame ? 'ordinaryReserve' THEN
  IF public.trip_event_keys(frame,ARRAY['command','ordinaryReserve']) IS NOT TRUE
  THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_INVALID';END IF;
  pins:=frame->'ordinaryReserve';
  frame:=frame-'ordinaryReserve';
 END IF;
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
 entered:=public.trip_source_universal_pdf_enter(actor,trip,source);
 IF pins IS NOT NULL AND nullif(current_setting('otr.universal.finite_pdf_frame',true),'') IS NULL THEN
  q:=public.trip_source_command_codec((frame->'command')::text);
  IF entered IS NOT TRUE
   OR public.trip_sustained_universal_pdf_allowed(actor,trip) IS NOT TRUE
   OR q->>'command' IS DISTINCT FROM 'UPLOAD_ORIGINAL'
   OR q->>'actor_account_id' IS DISTINCT FROM actor::text
   OR q->>'trip_id' IS DISTINCT FROM trip::text OR q->>'source_id' IS DISTINCT FROM source::text
   OR public.trip_event_keys(pins,ARRAY['nodeId','producerId','providerInstanceSha256']) IS NOT TRUE
   OR pins->>'nodeId' IS DISTINCT FROM (pins->>'nodeId')::uuid::text
   OR pins->>'producerId' IS DISTINCT FROM (pins->>'producerId')::uuid::text
   OR pins->>'nodeId' IS NULL OR pins->>'producerId' IS NULL
   OR coalesce(pins->>'providerInstanceSha256','') !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_INVALID';END IF;
  PERFORM set_config('otr.source.ordinary_pdf_reserve',(pins||jsonb_build_object(
   'actor',actor,'trip',trip,'source',source,'operationId',q->>'operation_id',
   'operationSha256',q->>'operation_sha256'))::text,true);
 END IF;
 RETURN entered;
END $new0$);
 IF encode(sha256(convert_to(current_definition,'UTF8')),'hex')<>'29889b9fab336def986fd0bb5aeaa8bb180e637107568ca5c8ee46e3a039895c'
 THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_TRANSFORM_DRIFT_67454';END IF;
 EXECUTE current_definition;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.trip_source_universal_pdf_enter(uuid,uuid,uuid,jsonb)'::regprocedure AND pg_get_userbyid(p.proowner)=current_user AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer,otr_trip_source_command_gateway=X/otr_trip_source_writer}'
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='29889b9fab336def986fd0bb5aeaa8bb180e637107568ca5c8ee46e3a039895c')
 THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_POSTIMAGE_DRIFT_67454';END IF;
 SELECT pg_get_functiondef(p.oid) INTO current_definition FROM pg_proc p WHERE p.oid='public.trip_source_pdf_upload_v4_binding(public.trip_source_operations,uuid,uuid,uuid,text,uuid)'::regprocedure AND pg_get_userbyid(p.proowner)=current_user AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer,otr_trip_source_execution_writer=X/otr_trip_source_writer}';
 IF current_definition IS NULL OR encode(sha256(convert_to(current_definition,'UTF8')),'hex')<>'b43b63fdb7db2a4b145b78b3067a07f20c43b989ab5c0ed106400722941954c0'
 THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_PREIMAGE_DRIFT_66000';END IF;
 current_definition:=replace(current_definition,$old0$declare b jsonb;begin
 perform public.trip_source_pdf_upload_v4_operation(o);
 if node is distinct from (select v4_node_id from public.trip_source_pdf_upload_config) then raise exception 'PDF_V4_NODE_CONFLICT';end if;
 b:=jsonb_build_object('uploadVersion',4,'operationId',o.id,'operationKey',o.operation_key,'operationSha256',o.operation_sha256,'actorAccountId',o.actor_account_id,'tripId',o.trip_id,'sourceId',o.source_id,'representationId',o.representation_id,'materialRevision',o.material_revision,'sourceRowRevision',o.expected_source_row_revision,'representationRowRevision',o.expected_representation_row_revision,'parentOperationId',o.parent_operation_id,'attemptId',attempt,'attemptGeneration',o.attempt_generation,'executionPrincipal',session_user,'resourceId',resource,'nodeId',node,'resourceKey',resource_key,'runToken',run_token,'provider','supabase_storage','bucket','trip-source-material','objectKey','v1/'||o.trip_id||'/'||o.source_id||'/'||o.representation_id||'/payload','sha256',o.bound_payload_sha256,'byteCount',o.bound_byte_count,'mimeType','application/pdf','producerId',(select v4_producer_id from public.trip_source_pdf_upload_config),'providerInstanceSha256',(select v4_provider_instance_sha256 from public.trip_source_pdf_upload_config),'profileId','PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4','profileSha256','2a9b397d3f8368144517e0a3bf73595e71b6cba7b37341045eceef47ef059f3d');
 return b;end$old0$,$new0$declare b jsonb; pins jsonb; producer uuid; provider_fingerprint text;begin
 perform public.trip_source_pdf_upload_v4_operation(o);
 pins:=nullif(current_setting('otr.source.ordinary_pdf_reserve',true),'')::jsonb;
 if pins is null then
  if node is distinct from (select v4_node_id from public.trip_source_pdf_upload_config)
  then raise exception 'PDF_V4_NODE_CONFLICT';end if;
  select v4_producer_id,v4_provider_instance_sha256 into producer,provider_fingerprint
   from public.trip_source_pdf_upload_config;
 else
  if session_user<>'otr_trip_source_command_gateway'
   or current_setting('otr.source.universal_pdf_scope',true) is distinct from
    jsonb_build_object('actor',o.actor_account_id,'trip',o.trip_id,'source',o.source_id)::text
   or public.trip_source_pdf_upload_v4_scope()->>'scopeKind' is distinct from 'OTR_UNIVERSAL_PDF_SOURCE_V1'
   or pins->>'actor' is distinct from o.actor_account_id::text
   or pins->>'trip' is distinct from o.trip_id::text or pins->>'source' is distinct from o.source_id::text
   or pins->>'operationId' is distinct from o.id::text
   or pins->>'operationSha256' is distinct from o.operation_sha256
   or pins->>'nodeId' is distinct from node::text
  then raise exception 'PDF_V4_REQUEST_BINDING_INVALID';end if;
  producer:=(pins->>'producerId')::uuid;
  provider_fingerprint:=pins->>'providerInstanceSha256';
  if producer is null or coalesce(provider_fingerprint,'') !~ '^[0-9a-f]{64}$'
  then raise exception 'PDF_V4_REQUEST_BINDING_INVALID';end if;
 end if;
 b:=jsonb_build_object('uploadVersion',4,'operationId',o.id,'operationKey',o.operation_key,'operationSha256',o.operation_sha256,'actorAccountId',o.actor_account_id,'tripId',o.trip_id,'sourceId',o.source_id,'representationId',o.representation_id,'materialRevision',o.material_revision,'sourceRowRevision',o.expected_source_row_revision,'representationRowRevision',o.expected_representation_row_revision,'parentOperationId',o.parent_operation_id,'attemptId',attempt,'attemptGeneration',o.attempt_generation,'executionPrincipal',session_user,'resourceId',resource,'nodeId',node,'resourceKey',resource_key,'runToken',run_token,'provider','supabase_storage','bucket','trip-source-material','objectKey','v1/'||o.trip_id||'/'||o.source_id||'/'||o.representation_id||'/payload','sha256',o.bound_payload_sha256,'byteCount',o.bound_byte_count,'mimeType','application/pdf','producerId',producer,'providerInstanceSha256',provider_fingerprint,'profileId','PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4','profileSha256','2a9b397d3f8368144517e0a3bf73595e71b6cba7b37341045eceef47ef059f3d');
 return b;end$new0$);
 IF encode(sha256(convert_to(current_definition,'UTF8')),'hex')<>'85a59ea3796eeb601fa1e0ffa70a5dbef9cc119f5c7c65aaf21039fded2c1853'
 THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_TRANSFORM_DRIFT_66000';END IF;
 EXECUTE current_definition;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.trip_source_pdf_upload_v4_binding(public.trip_source_operations,uuid,uuid,uuid,text,uuid)'::regprocedure AND pg_get_userbyid(p.proowner)=current_user AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer,otr_trip_source_execution_writer=X/otr_trip_source_writer}'
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='85a59ea3796eeb601fa1e0ffa70a5dbef9cc119f5c7c65aaf21039fded2c1853')
 THEN RAISE EXCEPTION 'PDF_V4_REQUEST_BINDING_POSTIMAGE_DRIFT_66000';END IF;
END $patch$;
COMMIT;
