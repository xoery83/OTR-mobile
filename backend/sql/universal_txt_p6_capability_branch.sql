 -- Exact DEV-only finite P6 negotiation; mutation still requires owning Review/Plan guards.
 IF actor='1f3d7935-1bdc-4952-8d7f-0f72077368c1'::uuid
 AND trip='8b5ceb55-b3c2-462a-9a15-59de91fdabe5'::uuid AND (requested_family IS NULL OR requested_family='P6') THEN
  DECLARE bounded_scope jsonb; key text; starts timestamptz; expires timestamptz;
   now_at timestamptz:=clock_timestamp();
  BEGIN
   IF current_user<>'postgres' OR session_user<>'otr_trip_core_v2_gateway'
   OR actor IS DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
   OR trip IS DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
   OR public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') IS NOT TRUE
   THEN RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;END IF;
   SELECT p.universal_p1_review_scope INTO bounded_scope FROM public.trip_sustained_dev_policy p
   WHERE p.actor_account_id=actor AND p.enabled AND p.revoked_at IS NULL AND p.universal_p1_import_enabled FOR SHARE;
   IF public.trip_event_keys(bounded_scope,ARRAY['family','tripId','sourceId','batchId','taskId','token','resultSha256','candidateId','targetId','operationId','slotId','title','localDate','startsAt','expiresAt']) IS NOT TRUE
   OR bounded_scope->>'family' IS DISTINCT FROM 'P6' OR bounded_scope->>'tripId' IS DISTINCT FROM trip::text
   THEN RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;END IF;
   FOREACH key IN ARRAY ARRAY['tripId','sourceId','batchId','taskId','candidateId','targetId','operationId','slotId'] LOOP
    IF jsonb_typeof(bounded_scope->key) IS DISTINCT FROM 'string' OR nullif(bounded_scope->>key,'') IS NULL
    THEN RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;END IF;
    PERFORM (bounded_scope->>key)::uuid;
   END LOOP;
   IF jsonb_typeof(bounded_scope->'token') IS DISTINCT FROM 'string'
   OR bounded_scope->>'token' !~ '^i[1-9][0-9]{0,2}$'
   OR jsonb_typeof(bounded_scope->'resultSha256') IS DISTINCT FROM 'string'
   OR bounded_scope->>'resultSha256' !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(bounded_scope->'title') IS DISTINCT FROM 'string'
   OR char_length(btrim(bounded_scope->>'title')) NOT BETWEEN 1 AND 256
   OR jsonb_typeof(bounded_scope->'localDate') IS DISTINCT FROM 'string'
   OR (bounded_scope->>'localDate')::date::text IS DISTINCT FROM bounded_scope->>'localDate'
   OR jsonb_typeof(bounded_scope->'startsAt') IS DISTINCT FROM 'string'
   OR jsonb_typeof(bounded_scope->'expiresAt') IS DISTINCT FROM 'string'
   THEN RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;END IF;
   starts:=(bounded_scope->>'startsAt')::timestamptz;expires:=(bounded_scope->>'expiresAt')::timestamptz;
   IF NOT isfinite(starts) OR NOT isfinite(expires) OR expires<=starts
   OR expires>starts+interval '900 seconds' OR now_at<starts OR now_at>=expires
   THEN RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;END IF;
   -- Negotiation precedes first slot creation. Any existing write context must still match.
   IF nullif(current_setting('otr.core.command',true),'') IS NOT NULL
    AND current_setting('otr.core.command',true)<>'CREATE_ITEM'
   OR nullif(current_setting('otr.core.family',true),'') IS NOT NULL
    AND current_setting('otr.core.family',true)<>'P6'
   OR nullif(current_setting('otr.core.admission',true),'') IS NOT NULL
    AND current_setting('otr.core.admission',true)<>'REVIEWED_SOURCE'
   THEN RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;END IF;
   FOREACH key IN ARRAY ARRAY['target_item','operation','source_intent'] LOOP
    IF nullif(current_setting('otr.core.'||key,true),'') IS NOT NULL
    AND current_setting('otr.core.'||key,true) IS DISTINCT FROM bounded_scope->>(CASE key
      WHEN 'target_item' THEN 'targetId' WHEN 'operation' THEN 'operationId' ELSE 'slotId' END)
    THEN RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;END IF;
   END LOOP;
   RETURN QUERY SELECT true,ARRAY['CREATE_ITEM']::text[],ARRAY['P6']::text[],ARRAY['REVIEWED_SOURCE']::text[];RETURN;
  EXCEPTION WHEN data_exception THEN
   RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;
  END;
 END IF;
