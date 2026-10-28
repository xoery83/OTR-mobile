 -- Accepted-only Source finalization is independent of new Create permission.
 IF (op IN ('INSERT','UPDATE') AND tab IN ('trip_source_core_v2_intents','trip_source_core_v2_slots'))
  OR (op='INSERT' AND tab='trip_source_core_v2_associations') THEN
  SELECT rr.* INTO accepted_receipt FROM public.trip_source_core_v2_slots ss
   JOIN public.trip_core_command_receipts rr ON rr.actor_account_id=ss.account_id AND rr.trip_id=ss.trip_id AND rr.operation_id=ss.operation_id AND rr.intent_sha256=ss.intent_sha256
   WHERE ss.account_id=actor AND ss.trip_id=trip AND ss.source_id=(r->>'source_id')::uuid
    AND (tab NOT IN ('trip_source_core_v2_intents','trip_source_core_v2_slots') OR ss.plan_id=(r->>'plan_id')::uuid)
    AND ss.output_slot_id=intent AND ss.operation_id=operation AND ss.target_kind='ITEM' AND ss.target_id=target
    AND ss.command='CREATE_ITEM' AND ss.output_purpose->>'purposeKind'=family||'_ITEM'
    AND rr.outcome IN ('APPLIED','NO_CHANGE') AND rr.body->>'command'='CREATE_ITEM'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(rr.body->'targetVector') v WHERE v->>'kind'='ITEM' AND v->>'id'=target::text AND (v->>'committedRevision')::bigint>0);
  accepted_recovery:=FOUND AND public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE');
 END IF;
 IF accepted_recovery AND op='INSERT' THEN
  -- Existing Source upserts run BEFORE INSERT before their immutable conflict update.
  IF tab='trip_source_core_v2_intents' THEN
   SELECT to_jsonb(i) INTO o FROM public.trip_source_core_v2_intents i WHERE i.plan_id=(r->>'plan_id')::uuid AND i.account_id=actor AND i.trip_id=trip AND i.source_id=(r->>'source_id')::uuid;
  ELSIF tab='trip_source_core_v2_slots' THEN
   SELECT to_jsonb(s) INTO o FROM public.trip_source_core_v2_slots s WHERE s.output_slot_id=intent AND s.account_id=actor AND s.trip_id=trip AND s.operation_id=operation;
  END IF;
  IF tab IN ('trip_source_core_v2_intents','trip_source_core_v2_slots') AND o IS NULL THEN accepted_recovery:=false;END IF;
 END IF;
