-- DISPOSABLE PG ONLY. No Hosted install or runtime mount authorized by this file.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^otr_auth_composite_[a-f0-9]{12}$'
 OR current_setting('otr.auth.composite_fixture',true) IS DISTINCT FROM 'LOCAL_DISPOSABLE'
 THEN RAISE EXCEPTION 'AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED';END IF;
END $$;
ALTER TABLE otr_auth_guest_composite.terminal_receipts DROP CONSTRAINT terminal_receipts_outcome_check;
ALTER TABLE otr_auth_guest_composite.terminal_receipts ADD CONSTRAINT terminal_receipts_outcome_check CHECK(outcome IN ('CANCELLED','PUBLISHED'));
CREATE FUNCTION otr_auth_guest_composite.owning_digest(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex')
$$;
-- Only the explicit Person leaves consumed by the existing Backend mapper.
CREATE FUNCTION otr_auth_guest_composite.mapped_command(command jsonb,creator uuid,owner_person uuid,people jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb:=command;path text[];ids jsonb;person text;self_id text;
BEGIN
 FOREACH path SLICE 1 IN ARRAY ARRAY[ARRAY['payload','participation','people'],ARRAY['payload','acl','people']] LOOP
  IF result#>path IS NULL THEN CONTINUE;END IF;
  IF jsonb_typeof(result#>path) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'AUTH_ADOPTION_PERSON_MAPPING_INVALID';END IF;
  ids:='[]'::jsonb;
  FOR person IN SELECT jsonb_array_elements_text(result#>path) LOOP
   IF person IS DISTINCT FROM creator::text AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE p->>'personId'=person)
   THEN RAISE EXCEPTION 'AUTH_ADOPTION_PERSON_MAPPING_INVALID';END IF;
   ids:=ids||jsonb_build_array(CASE WHEN person=creator::text THEN owner_person::text ELSE person END);
  END LOOP;
  result:=jsonb_set(result,path,ids);
 END LOOP;
 self_id:=result#>>'{payload,participation,selfPersonId}';
 IF self_id IS NOT NULL THEN
  IF self_id IS DISTINCT FROM creator::text AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE p->>'personId'=self_id)
  THEN RAISE EXCEPTION 'AUTH_ADOPTION_PERSON_MAPPING_INVALID';END IF;
  IF self_id=creator::text THEN result:=jsonb_set(result,'{payload,participation,selfPersonId}',to_jsonb(owner_person::text));END IF;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION otr_auth_guest_composite.publication_lock(actor uuid,request jsonb,plan_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g otr_auth_guest_composite.grants%rowtype;r otr_auth_guest_composite.terminal_receipts%rowtype;s record;
BEGIN
 g:=otr_auth_guest_composite.receipt_request_grant(actor,request);
 IF g.adoption_id IS NULL THEN RAISE EXCEPTION 'AUTH_ADOPTION_REAL_GRANT_REQUIRED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-auth-adoption:'||g.adoption_id::text,0));
 g:=otr_auth_guest_composite.receipt_request_grant(actor,request);
 SELECT * INTO s FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id=g.adoption_id FOR UPDATE;
 IF NOT FOUND OR s.plan_sha256 IS DISTINCT FROM plan_hash OR s.actor_account_id IS DISTINCT FROM actor
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_PUBLICATION_PLAN_MISMATCH' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id=g.adoption_id;
 IF FOUND THEN
  IF r.outcome IS DISTINCT FROM 'PUBLISHED' THEN RAISE EXCEPTION 'AUTH_ADOPTION_ALREADY_CANCELLED' USING ERRCODE='23505';END IF;
  IF r.receipt_text::jsonb->>'planSha256' IS DISTINCT FROM plan_hash THEN RAISE EXCEPTION 'AUTH_ADOPTION_PUBLICATION_PLAN_MISMATCH';END IF;
  RETURN r.receipt_text::jsonb;
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION otr_auth_guest_composite.publish(actor uuid,request jsonb,plan_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior jsonb;b jsonb;s record;source jsonb;t jsonb;trip uuid;creator uuid;owner_person uuid;
 c record;p jsonb;a jsonb;i jsonb;own record;actual jsonb;expected jsonb;command jsonb;op uuid;
 maps jsonb;operations jsonb;summaries jsonb:='[]'::jsonb;ledger jsonb;body jsonb;receipt jsonb;digest text;instant timestamptz;
BEGIN
 prior:=otr_auth_guest_composite.publication_lock(actor,request,plan_hash);
 IF prior IS NOT NULL THEN RETURN prior;END IF;
 b:=otr_auth_guest_composite.scope_binding(actor);
 IF b->>'adoptionId' IS DISTINCT FROM request->>'adoptionId' OR b->>'planSha256' IS DISTINCT FROM plan_hash
 OR b->>'sourceGuestLocalId' IS DISTINCT FROM request->>'sourceGuestLocalId'
 OR b->>'inventorySha256' IS DISTINCT FROM request->>'inventorySha256'
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_PUBLICATION_SCOPE_MISMATCH' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT s FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id=(b->>'adoptionId')::uuid;
 source:=(((s.plan_text::jsonb#>>'{preparation,canonicalText}')::jsonb)#>>'{source,canonicalText}')::jsonb;
 FOR t IN SELECT value FROM jsonb_array_elements(source->'trips') LOOP
  trip:=(t#>>'{create,tripId}')::uuid;creator:=(t#>>'{creator,personId}')::uuid;
  SELECT * INTO c FROM public.trip_create_receipts WHERE operation_id=(t#>>'{create,operationId}')::uuid;
  IF NOT FOUND OR c.trip_id IS DISTINCT FROM trip OR c.actor_account_id IS DISTINCT FROM actor
  OR c.request_payload IS DISTINCT FROM ((t->'create')-'operationId')
  OR NOT EXISTS(SELECT 1 FROM public.trips WHERE id=trip AND created_by=actor)
  THEN RAISE EXCEPTION 'AUTH_ADOPTION_CREATE_RECEIPT_REQUIRED' USING ERRCODE='23514';END IF;
  SELECT id INTO owner_person FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked';
  IF owner_person IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(source->'trips') st,
   LATERAL (SELECT st#>>'{creator,personId}' AS id UNION ALL SELECT source_person->>'personId' FROM jsonb_array_elements(st->'people') source_person) all_people
   WHERE all_people.id=owner_person::text AND all_people.id IS DISTINCT FROM creator::text)
  THEN RAISE EXCEPTION 'AUTH_ADOPTION_OWNER_PERSON_INVALID' USING ERRCODE='23514';END IF;
  maps:=jsonb_build_array(jsonb_build_object('sourcePersonId',creator,'targetPersonId',owner_person));
  -- PG_JSONB_TEXT_V1 preimage: exact immutable request plus stable owning identity.
  actual:=jsonb_build_object('actorAccountId',actor,'tripId',trip,'operationId',c.operation_id,'request',c.request_payload,'ownerPersonId',owner_person);
  operations:=jsonb_build_array(jsonb_build_object('queueId',c.operation_id,'operationId',c.operation_id,'kind','TRIP_CREATE',
   'owningReceiptSha256',otr_auth_guest_composite.owning_digest(actual),'domainReceiptId',NULL,'sourceIntentSha256',NULL,'mappedIntentSha256',NULL));
  FOR p IN SELECT value FROM jsonb_array_elements(t->'people') LOOP
   op:=(p->>'operationId')::uuid;
   expected:=jsonb_build_object('version',1,'operationId',op,'personId',p->'personId','tripId',trip,
    'tripCreateOperationId',c.operation_id,'dataOwnership','CLOUD_SHARED_AUTHORED','displayName',p->'displayName');
   SELECT * INTO own FROM public.trip_person_create_receipts WHERE operation_id=op AND trip_id=trip AND actor_account_id=actor;
   IF NOT FOUND OR own.request_payload IS DISTINCT FROM expected
   OR NOT EXISTS(SELECT 1 FROM public.journey_members m WHERE m.id=(p->>'personId')::uuid AND m.trip_id=trip
    AND m.user_id IS NULL AND m.status='unlinked' AND m.display_name IS NOT DISTINCT FROM p->>'displayName'
    AND m.participation_active AND m.participation_revision=0)
   THEN RAISE EXCEPTION 'AUTH_ADOPTION_PERSON_RECEIPT_REQUIRED' USING ERRCODE='23514';END IF;
   maps:=maps||jsonb_build_array(jsonb_build_object('sourcePersonId',p->'personId','targetPersonId',p->'personId'));
   operations:=operations||jsonb_build_array(jsonb_build_object('queueId',op,'operationId',op,'kind','PERSON_CREATE',
    'owningReceiptSha256',otr_auth_guest_composite.owning_digest(own.result_payload),'domainReceiptId',NULL,'sourceIntentSha256',NULL,'mappedIntentSha256',NULL));
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(t->'deferredMetadata') LOOP
   op:=(a->>'operationId')::uuid;
   SELECT * INTO own FROM public.trip_metadata_update_receipts WHERE operation_id=op AND trip_id=trip AND actor_account_id=actor;
   IF NOT FOUND OR own.request_payload-'expectedMetadataRevision' IS DISTINCT FROM
    jsonb_build_object('formatVersion',3,'operationId',op,'tripId',trip,'before',a->'before','after',a->'after')
   OR own.result_payload->'after' IS DISTINCT FROM a->'after'
   THEN RAISE EXCEPTION 'AUTH_ADOPTION_METADATA_RECEIPT_REQUIRED' USING ERRCODE='23514';END IF;
   operations:=operations||jsonb_build_array(jsonb_build_object('queueId',a->'actionId','operationId',op,'kind','TRIP_METADATA_DEFERRED',
    'owningReceiptSha256',otr_auth_guest_composite.owning_digest(own.result_payload),'domainReceiptId',NULL,'sourceIntentSha256',NULL,'mappedIntentSha256',NULL));
  END LOOP;
  SELECT jsonb_build_object('name',name,'destination',destination,'startDate',start_date,'endDate',end_date)
   ||CASE WHEN t->'metadata' ? 'destinations' THEN jsonb_build_object('destinations',destinations) ELSE '{}'::jsonb END
   INTO actual FROM public.trips WHERE id=trip;
  IF actual IS DISTINCT FROM t->'metadata' THEN RAISE EXCEPTION 'AUTH_ADOPTION_METADATA_READBACK_REQUIRED';END IF;
  ledger:=otr_auth_guest_composite.ledger_snapshot(actor,trip);
  IF (ledger-ARRAY['title','startDate','endDate','updatedAt']) IS DISTINCT FROM ((t->'ledgerInitialization')-ARRAY['title','startDate','endDate','updatedAt'])
  THEN RAISE EXCEPTION 'AUTH_ADOPTION_LEDGER_READBACK_REQUIRED';END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(t->'coreIntents') LOOP
   command:=otr_auth_guest_composite.mapped_command(i->'command',creator,owner_person,t->'people');
   op:=(command->>'operationId')::uuid;
   SELECT * INTO own FROM public.trip_core_command_receipts WHERE operation_id=op AND actor_account_id=actor AND trip_id=trip;
   IF NOT FOUND OR own.outcome NOT IN ('APPLIED','NO_CHANGE') OR own.canonical_intent_text::jsonb IS DISTINCT FROM command
   OR own.intent_sha256 IS DISTINCT FROM encode(sha256(convert_to('otr-trip-core-intent-v2'||chr(10)||own.canonical_intent_text,'UTF8')),'hex')
   OR own.body->>'intentSha256' IS DISTINCT FROM own.intent_sha256
   OR own.body->>'actorAccountId' IS DISTINCT FROM actor::text OR own.body->>'tripId' IS DISTINCT FROM trip::text
   OR own.body->>'operationId' IS DISTINCT FROM op::text
   THEN RAISE EXCEPTION 'AUTH_ADOPTION_CORE_RECEIPT_REQUIRED' USING ERRCODE='23514';END IF;
   operations:=operations||jsonb_build_array(jsonb_build_object('queueId',op,'operationId',op,'kind','CORE',
    'owningReceiptSha256',own.receipt_sha256,'domainReceiptId',own.id,'sourceIntentSha256',i->'sha256','mappedIntentSha256',own.intent_sha256));
  END LOOP;
  IF (SELECT jsonb_agg(v ORDER BY v) FROM jsonb_array_elements_text(t->'queueOperationIds') v)
   IS DISTINCT FROM (SELECT jsonb_agg(o->>'queueId' ORDER BY o->>'queueId') FROM jsonb_array_elements(operations) o)
  THEN RAISE EXCEPTION 'AUTH_ADOPTION_QUEUE_COVERAGE_REQUIRED';END IF;
  summaries:=summaries||jsonb_build_array(jsonb_build_object('tripId',trip,'createOperationId',c.operation_id,
   'sourceCreatorPersonId',creator,'ownerPersonId',owner_person,'personMappings',maps,'operations',operations,
   'ledgerSnapshotSha256',otr_auth_guest_composite.owning_digest(ledger)));
 END LOOP;
 -- Formal receipt reference invariants also apply to direct owning SQL callers.
 IF jsonb_array_length(summaries)<1
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(summaries) summary GROUP BY summary->>'tripId' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(summaries) summary,LATERAL jsonb_array_elements(summary->'personMappings') mapping GROUP BY mapping->>'sourcePersonId' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(summaries) summary,LATERAL jsonb_array_elements(summary->'personMappings') mapping GROUP BY mapping->>'targetPersonId' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(summaries) summary,LATERAL jsonb_array_elements(summary->'operations') operation GROUP BY operation->>'queueId' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(summaries) summary,LATERAL jsonb_array_elements(summary->'operations') operation GROUP BY operation->>'operationId' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(summaries) summary,LATERAL jsonb_array_elements(summary->'operations') operation
  WHERE operation->>'kind'='TRIP_METADATA_DEFERRED' AND EXISTS(SELECT 1 FROM jsonb_array_elements(summaries) other_summary,
   LATERAL jsonb_array_elements(other_summary->'operations') other_operation WHERE other_operation->>'queueId'=operation->>'operationId'))
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_RECEIPT_REFERENCES_INVALID' USING ERRCODE='23514';END IF;
 -- Preserve the owning deferred COMMIT guards; scope still requires the same PID/xid and live grant.
 -- Every sealed operation already has an immutable owning receipt; new Trip/Metadata/Person entry is closed.
 PERFORM otr_auth_guest_composite.scope_binding(actor);
 instant:=clock_timestamp();
 body:=request||jsonb_build_object('schemaId','otr.auth.guest-adoption-receipt/1','receiptId',gen_random_uuid(),
  'grantId',b->'grantId','policyVersion',s.plan_text::jsonb#>>'{grant,policyVersion}',
  'recordedAt',to_char(instant AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'outcome','PUBLISHED','preparationSha256',s.preparation_sha256,'planSha256',plan_hash,
  'executionSha256',otr_auth_guest_composite.owning_digest(summaries),'trips',summaries);
 digest:=encode(sha256(convert_to('otr-auth-guest-adoption-receipt-v1'||chr(10)||public.trip_event_canonical_json(body::json,0),'UTF8')),'hex');
 receipt:=body||jsonb_build_object('receiptSha256',digest);
 INSERT INTO otr_auth_guest_composite.terminal_receipts VALUES(s.adoption_id,(body->>'receiptId')::uuid,
  'PUBLISHED',public.trip_event_canonical_json(receipt::json,0),digest,instant);
 RETURN receipt;
END $$;
ALTER FUNCTION otr_auth_guest_composite.owning_digest(jsonb) OWNER TO postgres;
ALTER FUNCTION otr_auth_guest_composite.mapped_command(jsonb,uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION otr_auth_guest_composite.publication_lock(uuid,jsonb,text) OWNER TO postgres;
ALTER FUNCTION otr_auth_guest_composite.publish(uuid,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION otr_auth_guest_composite.owning_digest(jsonb),otr_auth_guest_composite.mapped_command(jsonb,uuid,uuid,jsonb),
 otr_auth_guest_composite.publication_lock(uuid,jsonb,text),otr_auth_guest_composite.publish(uuid,jsonb,text)
 FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION otr_auth_guest_composite.publication_lock(uuid,jsonb,text),otr_auth_guest_composite.publish(uuid,jsonb,text) TO otr_trip_core_v2_gateway;
COMMIT;
