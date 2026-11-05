-- Existing common Gateway-callable owning ACQUIRE wrapper. Preserve the routine ACL.
CREATE OR REPLACE FUNCTION public.trip_source_acquire_source(actor uuid,raw text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q jsonb;trip uuid;s public.trip_source_universal_scope;locked_scope public.trip_source_universal_scope;tag jsonb;tag_count integer;
 manifest jsonb;receipt jsonb;proof jsonb;protected_scope boolean:=false;
BEGIN
 IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway'
 OR raw IS NULL OR octet_length(raw)>2097152 THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 IF current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'UNSUPPORTED_TRANSACTION_ISOLATION' USING ERRCODE='25000';END IF;
 q:=public.trip_event_canonical_json(raw::json)::jsonb;
 trip:=(q->>'trip_id')::uuid;
 IF q->>'command' IS DISTINCT FROM 'ACQUIRE_SOURCE' OR q->>'actor_account_id' IS DISTINCT FROM actor::text
 THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 -- The tentative row only chooses the existing lock order. Dispatch requires the
 -- same full row to be observed again while holding the shared cutover lock.
 SELECT * INTO s FROM public.trip_source_universal_scope x WHERE x.singleton;
 IF FOUND AND jsonb_typeof(s.source_command_pins)='array' THEN
  SELECT count(*),jsonb_agg(x.v)->0 INTO tag_count,tag
   FROM jsonb_array_elements(s.source_command_pins) x(v) WHERE x.v ? 'mixedBInitial';
  protected_scope:=tag_count>0 AND (s.actor_id=actor AND s.trip_id=trip OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(s.source_command_pins) x(v)
    WHERE x.v->'command'->'operation_id'=q->'operation_id'
       OR x.v->'command'->'source_id'=q->'source_id'
       OR x.v->'command'->'payload'->'original'->'id'=q->'payload'->'original'->'id'
  ));
 END IF;
 IF protected_scope THEN
  IF tag_count<>1 OR s.actor_id IS DISTINCT FROM actor OR s.trip_id IS DISTINCT FROM trip
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
  PERFORM public.trip_import_scope_lock(actor,trip);
  IF public.trip_source_lock_universal_actor(actor,trip,true) IS NOT TRUE THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 ELSE
  -- Legacy historic receipt reads need no write admission. Fresh legacy work
  -- takes its existing gate and row locks before the cutover lock.
  IF public.trip_source_operation_lookup(actor,trip,(q->>'source_id')::uuid,
    (q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256') IS NULL THEN
   PERFORM public.trip_source_assert_gate();
   PERFORM public.trip_source_lock_scope(actor,trip,(q->>'source_id')::uuid);
  END IF;
 END IF;
 PERFORM pg_advisory_xact_lock_shared(714024,2);
 SELECT * INTO locked_scope FROM public.trip_source_universal_scope x WHERE x.singleton;
 IF to_jsonb(locked_scope) IS DISTINCT FROM to_jsonb(s)
 THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
 IF protected_scope THEN
   IF public.trip_source_finite_native_original_context(actor,raw) IS NULL
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
   q:=public.trip_source_command_codec(raw);
   manifest:=tag->'mixedBInitial'->'manifest';
   receipt:=public.trip_source_operation_lookup(actor,trip,(q->>'source_id')::uuid,
    (q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');
   IF receipt IS NOT NULL THEN
    IF receipt->>'command' IS DISTINCT FROM 'ACQUIRE_SOURCE'
     OR receipt->>'outcome' IS DISTINCT FROM 'APPLIED'
    THEN RAISE EXCEPTION 'MIXED_B_ORIGINAL_OUTCOME_UNQUALIFIED';END IF;
    RETURN receipt;
   END IF;
   proof:=public.trip_source_find_finite_universal_binding(actor,trip,s.batch_id,s.task_id,s.run_id,s.submission_sha256,
    jsonb_build_object('version','otr.import.mixed-b-acquire-current/1','initialManifest',manifest,'command',q));
   IF proof->>'version' IS DISTINCT FROM 'otr.import.mixed-b-acquire-current/1'
    OR clock_timestamp()<s.starts_at OR clock_timestamp()>=s.expires_at
   THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
 END IF;
 RETURN public.trip_source_register('ACQUIRE_SOURCE',actor,raw);
END $$;
