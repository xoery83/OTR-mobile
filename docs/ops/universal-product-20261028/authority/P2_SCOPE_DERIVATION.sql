  IF tab='trip_source_core_v2_publications' THEN dynamic_p2:=r->'request_json';
  ELSIF tab='trip_source_core_v2_candidates' THEN
   SELECT p.request_json INTO dynamic_p2 FROM public.trip_source_core_v2_publications p WHERE p.publication_id=(r->'candidate_json'->>'publicationId')::uuid AND p.account_id=actor AND p.trip_id=trip;
  ELSE
   SELECT p.request_json INTO dynamic_p2 FROM public.trip_source_core_v2_publications p
    JOIN public.trip_source_core_v2_candidates c ON (c.candidate_json->>'publicationId')::uuid=p.publication_id AND c.account_id=p.account_id AND c.trip_id=p.trip_id
    WHERE p.account_id=actor AND p.trip_id=trip AND c.candidate_id=(CASE
      WHEN tab='trip_source_core_v2_intents' THEN r->'request_json'->'candidateIds'->>0
      WHEN tab IN ('trip_source_core_v2_slots','trip_source_core_v2_associations') THEN r->>'candidate_id'
      ELSE (SELECT s.candidate_id::text FROM public.trip_source_core_v2_slots s WHERE s.output_slot_id=intent AND s.account_id=actor AND s.trip_id=trip AND s.operation_id=operation AND s.target_id=target)
     END)::uuid;
  END IF;
  IF dynamic_p2 IS NOT NULL THEN
   IF dynamic_p2->'universalP2'->>'version' IS DISTINCT FROM 'otr.universal.p2-source-proposal/1'
    OR dynamic_p2->'universalP2'->'sourceReview'->>'version' IS DISTINCT FROM 'otr.universal.p2-source-review/1'
    OR dynamic_p2->'universalP2'->'sourceReview'->>'decision' IS DISTINCT FROM 'NEW'
    OR dynamic_p2->'universalP2'->'sourceReview'->'originalReviewed' IS DISTINCT FROM 'true'::jsonb
    OR dynamic_p2->'universalP2'->'sourceReview'->'tripReviewed' IS DISTINCT FROM 'true'::jsonb
    OR coalesce(dynamic_p2->'universalP2'->>'resultSha256','') !~ '^[a-f0-9]{64}$'
    OR coalesce(dynamic_p2->'universalP2'->>'proposedPlanSha256','') !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'P2_SOURCE_BINDING_INVALID' USING ERRCODE='23514';END IF;
   p2_scope:=jsonb_build_object('family','P2','tripId',trip,
    'sourceId',dynamic_p2->'sourceId','runId',dynamic_p2->'universalP2'->'runId',
    'batchId',dynamic_p2->'universalP2'->'batchId','taskId',dynamic_p2->'universalP2'->'taskId',
    'token',dynamic_p2->'universalP2'->'token','resultSha256',dynamic_p2->'universalP2'->'resultSha256',
    'publicationSha256',public.trip_source_hash('otr-trip-core-source-publication-v2',dynamic_p2),
    'proposedPlanSha256',dynamic_p2->'universalP2'->'proposedPlanSha256',
    'flightNumberLiteral',dynamic_p2->'universalP2'->'sourceReview'->'flightNumberLiteral',
    'localDate',dynamic_p2->'universalP2'->'sourceReview'->'departureDate','publicationEnvelope',dynamic_p2->'universalP2');
   FOR identity_key,identity_purpose IN SELECT * FROM (VALUES
    ('publicationId','publication'),('candidateId','candidate'),('planId','plan'),
    ('targetId','item'),('operationId','operation'),('slotId','slot')) p(k,v) LOOP
    identity_bytes:=substring(sha256(convert_to(public.trip_event_canonical_json(jsonb_build_array('otr.universal.p1-source/1',p2_scope->>'taskId',p2_scope->>'token','p2-'||identity_purpose)::json),'UTF8')) FROM 1 FOR 16);
    identity_bytes:=set_byte(identity_bytes,6,(get_byte(identity_bytes,6)&15)|128);
    identity_bytes:=set_byte(identity_bytes,8,(get_byte(identity_bytes,8)&63)|128);
    identity_hex:=encode(identity_bytes,'hex');
    p2_scope:=p2_scope||jsonb_build_object(identity_key,substr(identity_hex,1,8)||'-'||substr(identity_hex,9,4)||'-'||substr(identity_hex,13,4)||'-'||substr(identity_hex,17,4)||'-'||substr(identity_hex,21,12));
   END LOOP;
   IF dynamic_p2->>'publicationId' IS DISTINCT FROM p2_scope->>'publicationId' THEN RAISE EXCEPTION 'P2_SOURCE_IDENTITY_MISMATCH' USING ERRCODE='23514';END IF;
  END IF;
