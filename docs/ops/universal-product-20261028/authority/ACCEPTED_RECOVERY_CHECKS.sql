 IF accepted_recovery THEN
  IF tab='trip_source_core_v2_intents' THEN
   IF op NOT IN ('INSERT','UPDATE') OR o IS NULL OR r-(CASE WHEN op='INSERT' THEN ARRAY['prepared_json','created_at'] ELSE ARRAY['prepared_json'] END) IS DISTINCT FROM o-(CASE WHEN op='INSERT' THEN ARRAY['prepared_json','created_at'] ELSE ARRAY['prepared_json'] END)
    OR (r->'prepared_json')-ARRAY['slots'] IS DISTINCT FROM (o->'prepared_json')-ARRAY['slots']
    OR jsonb_array_length(r->'prepared_json'->'slots') IS DISTINCT FROM 1
    OR ((r->'prepared_json'->'slots'->0)-ARRAY['state','receipt','domainReceiptId','errorCode']) IS DISTINCT FROM ((o->'prepared_json'->'slots'->0)-ARRAY['state','receipt','domainReceiptId','errorCode'])
    OR r->'prepared_json'->'slots'->0->'receipt' IS DISTINCT FROM accepted_receipt.body
    OR r->'prepared_json'->'slots'->0->>'domainReceiptId' IS DISTINCT FROM accepted_receipt.id::text
    OR coalesce(r->'prepared_json'->'slots'->0->>'state','') NOT IN ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','COMPLETE')
   THEN RAISE EXCEPTION 'CONTINUOUS_ACCEPTED_PLAN_MISMATCH' USING ERRCODE='23514';END IF;
  ELSIF tab='trip_source_core_v2_slots' THEN
   IF op NOT IN ('INSERT','UPDATE') OR o IS NULL OR r-ARRAY['state','domain_receipt_id','source_lineage_id'] IS DISTINCT FROM o-ARRAY['state','domain_receipt_id','source_lineage_id']
    OR NOT coalesce((r->>'domain_receipt_id'=accepted_receipt.id::text AND r->>'state' IN ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','COMPLETE'))
      OR (r-ARRAY['source_lineage_id']=o-ARRAY['source_lineage_id'] AND r->>'source_lineage_id' IS NOT NULL),false)
    OR (r->>'source_lineage_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a WHERE a.id=(r->>'source_lineage_id')::uuid AND a.output_slot_id=intent AND a.domain_receipt_id=accepted_receipt.id AND a.receipt_sha256=accepted_receipt.receipt_sha256))
   THEN RAISE EXCEPTION 'CONTINUOUS_ACCEPTED_SLOT_MISMATCH' USING ERRCODE='23514';END IF;
  ELSIF r->>'domain_receipt_id' IS DISTINCT FROM accepted_receipt.id::text OR r->>'receipt_sha256' IS DISTINCT FROM accepted_receipt.receipt_sha256 THEN
   RAISE EXCEPTION 'CONTINUOUS_ACCEPTED_ASSOCIATION_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF coalesce(CASE WHEN tab='trip_source_core_v2_intents' THEN r->'prepared_json'->'slots'->0->>'state' ELSE r->>'state' END,'')='COMPLETE'
   AND NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a WHERE a.output_slot_id=intent AND a.account_id=actor AND a.trip_id=trip AND a.target_kind='ITEM' AND a.target_id=target AND a.domain_receipt_id=accepted_receipt.id AND a.receipt_sha256=accepted_receipt.receipt_sha256)
  THEN RAISE EXCEPTION 'CONTINUOUS_ACCEPTED_ASSOCIATION_REQUIRED' USING ERRCODE='23514';END IF;
 END IF;
