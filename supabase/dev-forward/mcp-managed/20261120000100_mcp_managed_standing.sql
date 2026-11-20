-- Managed MCP owning schema delta. Source: approved Layer 1 Core and P5 SQL.
-- Preserve existing Guest Metadata, receipt recovery, Parent reader and native OAuth.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preimage$
BEGIN
 IF current_user <> 'postgres' OR to_regclass('public.otr_mcp_managed_consents') IS NULL THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_OR_OWNER_REQUIRED';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.assert_trip_core_v2_aggregate(uuid)'))) IS DISTINCT FROM '9fe9da1b0017053e9cf2fef3b8e1bd0b' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.assert_trip_core_v2_aggregate(uuid)';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_core_finite_read_state_guard()'))) IS DISTINCT FROM '4f7732a8797b52ac98068327c4dcf972' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_core_finite_read_state_guard()';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_core_guard_write()'))) IS DISTINCT FROM '6e1171d4ad2872c44a7e294ead7ab5d7' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_core_guard_write()';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_core_service_statement_guard()'))) IS DISTINCT FROM '5ba5af84c52b81bea3d2dc78caadd634' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_core_service_statement_guard()';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_create_parent_result(uuid,uuid)'))) IS DISTINCT FROM '9065ee93c4628582ddf277a9072f0dd9' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_create_parent_result(uuid,uuid)';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)'))) IS DISTINCT FROM '8c7c155fed58eabe0f69700adbb0b756' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_metadata_revision_guard()'))) IS DISTINCT FROM '60ce3a801acd1f40034e58bdba8139d3' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_metadata_revision_guard()';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_metadata_snapshot(uuid,uuid,uuid)'))) IS DISTINCT FROM '10416fb3c367b19dd14153f86b924aab' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_metadata_snapshot(uuid,uuid,uuid)';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_metadata_update_result(uuid,uuid)'))) IS DISTINCT FROM '382a1ef1768e73fb95f0ecaaf50b4abf' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_metadata_update_result(uuid,uuid)';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_sustained_core_capabilities(uuid,uuid)'))) IS DISTINCT FROM 'c0f23166e363febc0594d9dd1ccb159e' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_sustained_core_capabilities(uuid,uuid)';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'))) IS DISTINCT FROM 'f593afc154e60ffbe885d887af48820a' THEN
  RAISE EXCEPTION 'MCP_MANAGED_PREIMAGE_CHANGED: public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)';
 END IF;
END $preimage$;

-- 20261116000300
-- Layer 1 candidate. Existing Trip metadata aggregate and immutable owning journal.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.trips ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'ACTIVE'
 CHECK(lifecycle_state IN ('ACTIVE','ARCHIVED','DELETED'));
CREATE FUNCTION public.trip_lifecycle_graph(p_actor uuid,p_trip uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE graph jsonb:='{}'; part jsonb; item jsonb; table_name text; visibility_table text; object_key text; person uuid; t record;
BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR SHARE;
 IF NOT FOUND OR t.created_by IS DISTINCT FROM p_actor OR NOT public.trip_sustained_dev_scope_allowed(p_actor,p_trip,NULL,'METADATA') THEN
  RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT id INTO person FROM public.journey_members WHERE trip_id=p_trip AND user_id=p_actor AND status='linked' AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN' USING ERRCODE='42501';END IF;
 FOR table_name,visibility_table,object_key IN SELECT * FROM (VALUES
  ('itinerary_events','trip_item_visibility_people','item_id'),
  ('itinerary_reservations','trip_booking_visibility_people','booking_id'),
  ('trip_entitlements','trip_entitlement_visibility_people','entitlement_id'),
  ('trip_operational_documents','trip_document_visibility_people','document_id'),
  ('trip_instruction_entries','trip_instruction_visibility_people','instruction_id')) roots LOOP
  FOR item IN EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE trip_id=$1',table_name) USING p_trip LOOP
   IF item->>'owner_account_id' IS DISTINCT FROM p_actor::text THEN
    IF item->>'visibility'='SELECTED_PERSONS' THEN
     EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE trip_id=$1 AND %I=$2 AND person_id=$3)',visibility_table,object_key) INTO part USING p_trip,(item->>'id')::uuid,person;
    ELSE part:=to_jsonb(item->>'visibility'='GROUP');END IF;
    IF part IS DISTINCT FROM 'true'::jsonb OR (table_name='itinerary_events' AND item->>'participation_mode' IS DISTINCT FROM 'WHOLE_GROUP') THEN
     RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN' USING ERRCODE='42501';END IF;
   END IF;
  END LOOP;
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY[
  'itinerary_events','itinerary_transport_endpoints','trip_endpoint_details','trip_flight_intents','itinerary_transport_services',
  'trip_stay_details','trip_stay_rooms','trip_rental_details','trip_activity_details','trip_rental_places','trip_activity_entry_places','trip_transport_operational_facts',
  'itinerary_reservations','trip_booking_observations','trip_entitlements','trip_operational_documents','trip_instruction_entries',
  'trip_booking_item_links','trip_entitlement_item_links','trip_booking_entitlement_links','trip_booking_document_links','trip_entitlement_document_links','trip_item_document_links',
  'trip_item_participants','trip_entitlement_holders','trip_item_visibility_people','trip_booking_visibility_people','trip_entitlement_visibility_people','trip_document_visibility_people','trip_instruction_visibility_people','expense_links',
  'expenses','ledger_settings','journey_members'] LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),''[]''::jsonb) FROM public.%I r WHERE %I=$1',table_name,CASE WHEN table_name IN ('expenses','ledger_settings','expense_links') THEN 'journey_id' ELSE 'trip_id' END) INTO part USING p_trip;
  graph:=graph||jsonb_build_object(table_name,part);
 END LOOP;
 RETURN graph||jsonb_build_object('trip',jsonb_build_object('id',p_trip,'revision',t.metadata_revision,'state',t.lifecycle_state));
END $$;
CREATE FUNCTION public.trip_lifecycle_base(p_actor uuid,p_trip uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE graph jsonb;t record;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' THEN RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN' USING ERRCODE='42501';END IF;
 graph:=public.trip_lifecycle_graph(p_actor,p_trip);
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 RETURN jsonb_build_object('version','otr.lifecycle.read/1','actorAccountId',p_actor,'tripId',p_trip,'metadataRevision',t.metadata_revision,
 'graphHash',encode(sha256(convert_to(graph::text,'UTF8')),'hex'),'state',t.lifecycle_state,
 'availableActions',CASE t.lifecycle_state WHEN 'ACTIVE' THEN '["ARCHIVE","DELETE"]'::jsonb WHEN 'ARCHIVED' THEN '["UNARCHIVE","DELETE"]'::jsonb ELSE '[]'::jsonb END,
 'impact',jsonb_build_object('affectedItems',coalesce((SELECT jsonb_agg(jsonb_build_object('itemId',id,'revision',semantic_revision) ORDER BY id) FROM public.itinerary_events WHERE trip_id=p_trip),'[]'::jsonb),
 'hasFinancialReferences',jsonb_array_length(graph->'expenses')>0 OR jsonb_array_length(graph->'expense_links')>0,'changesOriginalFiles',false,'warnings','[]'::jsonb),
 'observedAt',clock_timestamp());
END $$;
CREATE FUNCTION public.trip_lifecycle_result(p_actor uuid,p_trip uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r record;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' OR NOT public.trip_sustained_dev_scope_allowed(p_actor,p_trip,NULL,'METADATA') THEN
  RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=p_operation AND trip_id=p_trip AND actor_account_id=p_actor FOR SHARE;
 IF NOT FOUND OR NOT r.request_payload ? 'action' THEN RETURN NULL;END IF;
 RETURN r.result_payload;
END $$;
CREATE FUNCTION public.trip_lifecycle_command(p_actor uuid,p_trip uuid,p_operation uuid,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t record;r record;graph jsonb;outcome text;next_state text;result jsonb;initial_revision bigint;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' OR NOT public.trip_sustained_dev_scope_allowed(p_actor,p_trip,NULL,'METADATA') THEN
  RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL OR p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>8192
 OR NOT p_request ?& ARRAY['operationId','tripId','expectedMetadataRevision','graphHash','reason','action']
 OR p_request-ARRAY['operationId','tripId','expectedMetadataRevision','graphHash','reason','action']<>'{}'::jsonb
 OR p_request->>'operationId' IS DISTINCT FROM p_operation::text OR p_request->>'tripId' IS DISTINCT FROM p_trip::text
 OR jsonb_typeof(p_request->'expectedMetadataRevision') IS DISTINCT FROM 'number'
 OR (p_request->>'expectedMetadataRevision')!~'^[0-9]+$' OR (p_request->>'expectedMetadataRevision')::numeric>9007199254740991
 OR jsonb_typeof(p_request->'graphHash') IS DISTINCT FROM 'string' OR p_request->>'graphHash'!~'^[a-f0-9]{64}$'
 OR jsonb_typeof(p_request->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_request->>'reason')) NOT BETWEEN 1 AND 2000
 OR jsonb_typeof(p_request->'action') IS DISTINCT FROM 'string' OR p_request->>'action' NOT IN ('ARCHIVE','UNARCHIVE','DELETE') THEN RAISE EXCEPTION 'LIFECYCLE_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=p_operation FOR SHARE;
 IF FOUND THEN
  IF r.actor_account_id<>p_actor OR r.trip_id<>p_trip OR r.request_payload IS DISTINCT FROM p_request THEN
   RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN r.result_payload;
 END IF;
 graph:=public.trip_lifecycle_graph(p_actor,p_trip);
 initial_revision:=t.metadata_revision;
 next_state:=CASE p_request->>'action' WHEN 'ARCHIVE' THEN 'ARCHIVED' WHEN 'UNARCHIVE' THEN 'ACTIVE' ELSE 'DELETED' END;
 IF t.metadata_revision<>(p_request->>'expectedMetadataRevision')::bigint OR encode(sha256(convert_to(graph::text,'UTF8')),'hex')<>p_request->>'graphHash' THEN outcome:='CONFLICT';
 ELSIF t.lifecycle_state='DELETED' AND next_state<>'DELETED' THEN outcome:='REJECTED';
 ELSIF t.lifecycle_state=next_state THEN outcome:='NO_CHANGE';
 ELSE
  outcome:='APPLIED';
  UPDATE public.trips SET lifecycle_state=next_state WHERE id=p_trip RETURNING * INTO t;
 END IF;
 result:=jsonb_build_object('operationId',p_operation,'tripId',p_trip,'actorAccountId',p_actor,'request',p_request,'outcome',outcome,
  'resultMetadataRevision',t.metadata_revision,'state',t.lifecycle_state,'committedAt',clock_timestamp());
 INSERT INTO public.trip_metadata_update_receipts(operation_id,actor_account_id,trip_id,request_payload,result_payload,before_revision,after_revision)
 VALUES(p_operation,p_actor,p_trip,p_request,result,initial_revision,t.metadata_revision);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.trip_lifecycle_graph(uuid,uuid),public.trip_lifecycle_base(uuid,uuid),public.trip_lifecycle_command(uuid,uuid,uuid,jsonb),public.trip_lifecycle_result(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_lifecycle_base(uuid,uuid),public.trip_lifecycle_command(uuid,uuid,uuid,jsonb),public.trip_lifecycle_result(uuid,uuid,uuid) TO otr_trip_metadata_gateway;
-- Keep finite principals safe while recognizing the three new exact owning entry points.
DO $patch$ DECLARE definition text;old text:='''public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)''::regprocedure';BEGIN
 definition:=pg_get_functiondef('public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure);
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'LIFECYCLE_SCOPE_PREIMAGE_MISMATCH';END IF;
 EXECUTE replace(definition,old,old||',''public.trip_lifecycle_base(uuid,uuid)''::regprocedure,''public.trip_lifecycle_command(uuid,uuid,uuid,jsonb)''::regprocedure,''public.trip_lifecycle_result(uuid,uuid,uuid)''::regprocedure');
END $patch$;
CREATE OR REPLACE FUNCTION public.trip_metadata_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- Only existing postgres-owned owning RPCs may introduce/change the new field.
 -- SECURITY INVOKER preserves the effective RPC owner without extending client ACL.
 IF current_user<>'postgres' THEN
  IF TG_OP='UPDATE' AND NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state THEN RAISE EXCEPTION 'TRIP_LIFECYCLE_OWNING_RPC_REQUIRED' USING ERRCODE='42501';END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.destinations IS NOT NULL THEN RAISE EXCEPTION 'TRIP_DESTINATIONS_OWNING_RPC_REQUIRED' USING ERRCODE='42501'; END IF;
  ELSIF NEW.destinations IS DISTINCT FROM OLD.destinations THEN
   RAISE EXCEPTION 'TRIP_DESTINATIONS_OWNING_RPC_REQUIRED' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.lifecycle_state<>'ACTIVE' AND NEW.lifecycle_state=OLD.lifecycle_state THEN
  RAISE EXCEPTION 'TRIP_%',OLD.lifecycle_state USING ERRCODE='55000';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.metadata_revision<>0 THEN RAISE EXCEPTION 'METADATA_REVISION_SERVER_OWNED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.metadata_revision IS DISTINCT FROM OLD.metadata_revision THEN
  RAISE EXCEPTION 'METADATA_REVISION_SERVER_OWNED' USING ERRCODE='42501';
 END IF;
 IF ROW(NEW.name,NEW.destination,NEW.start_date,NEW.end_date,NEW.created_by,NEW.destinations,NEW.lifecycle_state) IS DISTINCT FROM
    ROW(OLD.name,OLD.destination,OLD.start_date,OLD.end_date,OLD.created_by,OLD.destinations,OLD.lifecycle_state) THEN
  IF OLD.metadata_revision>=9007199254740991 THEN RAISE EXCEPTION 'METADATA_REVISION_EXHAUSTED' USING ERRCODE='22023'; END IF;
  NEW.metadata_revision:=OLD.metadata_revision+1;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER trip_metadata_revision_guard ON public.trips;
CREATE TRIGGER trip_metadata_revision_guard BEFORE INSERT OR UPDATE OF name,destination,start_date,end_date,created_by,metadata_revision,destinations,lifecycle_state ON public.trips FOR EACH ROW EXECUTE FUNCTION public.trip_metadata_revision_guard();
CREATE FUNCTION public.trip_lifecycle_business_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE trip uuid;state text;BEGIN
 trip:=coalesce(coalesce(to_jsonb(NEW),to_jsonb(OLD))->>'trip_id',coalesce(to_jsonb(NEW),to_jsonb(OLD))->>'journey_id')::uuid;
 IF trip IS NULL THEN RETURN coalesce(NEW,OLD);END IF;
 SELECT lifecycle_state INTO state FROM public.trips WHERE id=trip FOR SHARE;
 IF state IN ('ARCHIVED','DELETED') THEN RAISE EXCEPTION 'TRIP_%',state USING ERRCODE='55000';END IF;
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.trip_lifecycle_business_guard() FROM PUBLIC,anon,authenticated,service_role,otr_trip_metadata_gateway,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
DO $$DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['itinerary_events','itinerary_reservations','itinerary_transport_endpoints','trip_endpoint_details','trip_flight_intents','itinerary_transport_services','trip_stay_details','trip_stay_rooms','trip_rental_details','trip_activity_details','trip_rental_places','trip_activity_entry_places','trip_transport_operational_facts','trip_entitlements','trip_operational_documents','trip_instruction_entries','trip_booking_item_links','trip_entitlement_item_links','trip_booking_entitlement_links','trip_booking_document_links','trip_entitlement_document_links','trip_item_document_links','trip_item_participants','trip_entitlement_holders','trip_item_visibility_people','trip_booking_visibility_people','trip_entitlement_visibility_people','trip_document_visibility_people','trip_instruction_visibility_people','expense_links','expenses','ledger_settings'] LOOP
  EXECUTE format('CREATE TRIGGER trip_lifecycle_business_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trip_lifecycle_business_guard()',name);
 END LOOP;
END $$;

-- 20261116000400
-- Read permanent logical deletion only from the existing immutable Core journal.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.trip_core_item_lifecycle_states(actor uuid,trip uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state text;deleted jsonb;
BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' OR NOT public.trip_sustained_core_read_scope_allowed(actor,trip) THEN
  RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
 SELECT lifecycle_state INTO state FROM public.trips WHERE id=trip FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO deleted FROM (
  SELECT DISTINCT (canonical_intent_text::jsonb#>>'{target,id}')::uuid AS id
  FROM public.trip_core_command_receipts WHERE trip_id=trip AND outcome='APPLIED'
  AND body->>'command'='DELETE_ITEM' AND canonical_intent_text::jsonb#>>'{target,kind}'='ITEM'
 ) roots;
 IF jsonb_array_length(deleted)>20000 THEN RAISE EXCEPTION 'CORE_READ_RESOURCE_LIMIT';END IF;
 RETURN jsonb_build_object('tripState',state,'deletedItemIds',deleted);
END $$;
REVOKE ALL ON FUNCTION public.trip_core_item_lifecycle_states(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION public.trip_core_item_lifecycle_states(uuid,uuid) TO otr_trip_core_v2_gateway;
CREATE INDEX trip_core_deleted_item_receipts ON public.trip_core_command_receipts(trip_id)
 WHERE outcome='APPLIED' AND body->>'command'='DELETE_ITEM';

-- 20261116000500
-- Align the existing Domain byte bound without changing wire limits or metadata.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $install$
DECLARE t text; c text; definition text;
BEGIN
  FOREACH t IN ARRAY ARRAY['itinerary_events','itinerary_reservations','trip_entitlements','trip_operational_documents','trip_instruction_entries'] LOOP
    c := t || '_field_state_check';
    SELECT pg_get_constraintdef(oid) INTO STRICT definition
      FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND conname = c;
    IF definition NOT LIKE '%jsonb_typeof(field_state)%'
       OR definition NOT LIKE '%32768%' THEN
      RAISE EXCEPTION 'CORE_FIELD_STATE_CONSTRAINT_DRIFT: %', t;
    END IF;
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (jsonb_typeof(field_state) = ''object'' AND octet_length(public.trip_event_canonical_json(field_state::json, 0)) <= 32768)', t, c);
  END LOOP;
END $install$;

-- 20261116000600
-- Existing P5 owning command writes its annotations and operational roles too.

SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $install$
DECLARE definition text; before text;
BEGIN
 SELECT pg_get_functiondef('public.trip_core_guard_write()'::regprocedure) INTO definition;
 before := definition;
 definition := replace(definition,
   '''trip_flight_intents'',''trip_endpoint_details''',
   '''trip_flight_intents'',''trip_endpoint_details'',''trip_transport_operational_facts''');
 definition := replace(definition,
   'or tg_table_name in (''trip_flight_intents'',''trip_endpoint_details'',''trip_transport_operational_facts'') and current_setting(''otr.core.family'',true) IS DISTINCT FROM ''P2''',
   'or tg_table_name=''trip_flight_intents'' and current_setting(''otr.core.family'',true) IS DISTINCT FROM ''P2''
    or tg_table_name=''trip_transport_operational_facts'' and (current_setting(''otr.core.family'',true) IS DISTINCT FROM ''P5'' or current_setting(''otr.core.command'',true) NOT IN (''CREATE_ITEM'',''SET_TRANSPORT_DETAILS''))
    or tg_op=''UPDATE'' and tg_table_name=''trip_transport_operational_facts'' and (old_json->''event_id'' IS DISTINCT FROM new_json->''event_id'' or old_json->''role'' IS DISTINCT FROM new_json->''role'')');
 definition := replace(definition,
   'or tg_table_name=''trip_endpoint_details'' and current_setting(''otr.core.command'',true) IS DISTINCT FROM ''SET_AUTHORED_FLIGHT_DETAILS''',
   'or tg_table_name=''trip_endpoint_details'' and NOT ((current_setting(''otr.core.family'',true)=''P2'' and current_setting(''otr.core.command'',true)=''SET_AUTHORED_FLIGHT_DETAILS'') or (current_setting(''otr.core.family'',true)=''P5'' and current_setting(''otr.core.command'',true) IN (''CREATE_ITEM'',''SET_TRANSPORT_DETAILS'')))');
 definition := replace(definition,
   '(tg_table_name=''trip_rental_places'' and current_setting(''otr.core.family'',true)=''P4'' and current_setting(''otr.core.command'',true)=''SET_RENTAL_DETAILS''))',
   '(tg_table_name=''trip_rental_places'' and current_setting(''otr.core.family'',true)=''P4'' and current_setting(''otr.core.command'',true)=''SET_RENTAL_DETAILS'') or (tg_table_name=''trip_transport_operational_facts'' and current_setting(''otr.core.family'',true)=''P5'' and current_setting(''otr.core.command'',true)=''SET_TRANSPORT_DETAILS''))');
 IF definition=before OR position('or tg_table_name=''trip_transport_operational_facts'' and' in definition)=0 THEN
  RAISE EXCEPTION 'P5_DETAIL_QUALIFICATION_DRIFT';
 END IF;
 EXECUTE definition;
 SELECT pg_get_functiondef('public.trip_core_service_statement_guard()'::regprocedure) INTO definition;
 before := 'not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled)';
 IF position(before in definition)=0 THEN RAISE EXCEPTION 'P5_SERVICE_STATEMENT_GUARD_DRIFT'; END IF;
 definition := replace(definition, before,
   '(' || before || ' AND NOT (current_setting(''otr.core.family'',true)=''P5'' AND current_setting(''otr.core.admission'',true)=''MANUAL'' AND current_setting(''otr.core.command'',true) IN (''CREATE_ITEM'',''SET_TRANSPORT_DETAILS'') AND public.trip_sustained_dev_scope_allowed(nullif(current_setting(''otr.core.actor'',true),'''')::uuid,nullif(current_setting(''otr.core.trip'',true),'''')::uuid,null,''CORE_P5'')))');
 EXECUTE definition;
END $install$;

-- 20261116000700
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.trip_core_read_expense_relations(actor uuid,trip uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE links jsonb; ids jsonb;
BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' OR NOT public.trip_sustained_core_read_scope_allowed(actor,trip) THEN
  RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501'; END IF;
 -- Ledger bootstrap authorizes the same Trip, including retained deleted expenses.
 IF EXISTS(SELECT 1 FROM public.expense_links l LEFT JOIN public.expenses e ON e.id=l.expense_id
  WHERE l.journey_id=trip AND (e.id IS NULL OR e.journey_id<>trip)) THEN
  RAISE EXCEPTION 'CROSS_TRIP_REFERENCE'; END IF;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO ids FROM
  (SELECT id FROM public.expenses WHERE journey_id=trip ORDER BY id LIMIT 20001) e;
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) INTO links FROM
  (SELECT id,expense_id,journey_id,link_type AS type,target_id,metadata,created_by,public.trip_event_utc_timestamp(created_at) AS created_at
   FROM public.expense_links WHERE journey_id=trip ORDER BY id LIMIT 20001) l;
 IF jsonb_array_length(ids)>20000 OR jsonb_array_length(links)>20000 THEN
  RAISE EXCEPTION 'CORE_READ_RESOURCE_LIMIT'; END IF;
 RETURN jsonb_build_object('links',links,'authorizedExpenseIds',ids);
END $$;
REVOKE ALL ON FUNCTION public.trip_core_read_expense_relations(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION public.trip_core_read_expense_relations(uuid,uuid) TO otr_trip_core_v2_gateway;
CREATE FUNCTION public.trip_core_invalidate_expense_relations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Core writes bump this same revision once on commit, under the owning writer.
 IF session_user='otr_trip_core_v2_gateway' THEN RETURN NULL; END IF;
 IF tg_op<>'INSERT' THEN
  UPDATE public.trip_core_read_state SET revision=revision+1 WHERE trip_id=old.journey_id;
 END IF;
 IF tg_op='INSERT' OR (tg_op='UPDATE' AND new.journey_id IS DISTINCT FROM old.journey_id) THEN
  UPDATE public.trip_core_read_state SET revision=revision+1 WHERE trip_id=new.journey_id;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.trip_core_invalidate_expense_relations() FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
CREATE TRIGGER core_v2_expense_relations_invalidation AFTER INSERT OR UPDATE OR DELETE ON public.expense_links
 FOR EACH ROW EXECUTE FUNCTION public.trip_core_invalidate_expense_relations();

-- 20261116000800
-- Add existing Manual Item commands to the owning normal-account qualification.
-- Expense link commands are deliberately absent until their owning transaction exists.

SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $install$
DECLARE definition text; needle text; additions text := '''SET_ITEM_CATEGORY'',''SET_ITEM_GROUPING'',''SET_ITEM_STATUS'',''HIDE_OBJECT'',''RESTORE_OBJECT'',''DELETE_ITEM'',''SET_OBJECT_VISIBILITY''';
BEGIN
 SELECT pg_get_functiondef('public.trip_sustained_core_capabilities(uuid,uuid)'::regprocedure) INTO definition;
 needle := '''CREATE_SPARSE_FLIGHT'',''SET_AUTHORED_FLIGHT_DETAILS'']::text[]';
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'BETA_CORE_CAPABILITIES_DRIFT';END IF;
 EXECUTE replace(definition,needle,'''CREATE_SPARSE_FLIGHT'',''SET_AUTHORED_FLIGHT_DETAILS'','||additions||']::text[]');

 SELECT pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure) INTO definition;
 needle := 'in (''SET_ITEM_TEXT'',''SET_ITEM_SCHEDULE'',''SET_ITEM_PLACE'',''SET_ITEM_PARTICIPATION'')';
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'BETA_CORE_READ_STATE_GUARD_DRIFT';END IF;
 EXECUTE replace(definition,needle,'in (''SET_ITEM_TEXT'',''SET_ITEM_SCHEDULE'',''SET_ITEM_PLACE'',''SET_ITEM_PARTICIPATION'','||additions||')');

 SELECT pg_get_functiondef('public.trip_core_guard_write()'::regprocedure) INTO definition;
 needle := '''CREATE_SPARSE_FLIGHT'',''SET_AUTHORED_FLIGHT_DETAILS'')';
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'BETA_CORE_WRITE_GUARD_DRIFT';END IF;
 -- Only the main command allowlist; preserve Sparse intent qualification checks.
 definition := replace(definition,
  '''SET_ACTIVITY_DETAILS'',''CREATE_SPARSE_FLIGHT'',''SET_AUTHORED_FLIGHT_DETAILS'')',
  '''SET_ACTIVITY_DETAILS'',''CREATE_SPARSE_FLIGHT'',''SET_AUTHORED_FLIGHT_DETAILS'','||additions||')');
 definition := replace(definition,
  '''CREATE_SPARSE_FLIGHT'',''SET_AUTHORED_FLIGHT_DETAILS'',''SET_ITEM_PARTICIPATION'')',
  '''CREATE_SPARSE_FLIGHT'',''SET_AUTHORED_FLIGHT_DETAILS'',''SET_ITEM_PARTICIPATION'',''SET_ITEM_TEXT'',''HIDE_OBJECT'',''RESTORE_OBJECT'',''DELETE_ITEM'',''SET_OBJECT_VISIBILITY'')');
 definition := replace(definition,
  '''CREATE_ITEM'',''SET_ITEM_TEXT'',''SET_ITEM_PARTICIPATION'',''SET_TRANSPORT_DETAILS'')',
  '''CREATE_ITEM'',''SET_ITEM_TEXT'',''SET_ITEM_PARTICIPATION'',''SET_TRANSPORT_DETAILS'',''HIDE_OBJECT'',''RESTORE_OBJECT'',''DELETE_ITEM'',''SET_OBJECT_VISIBILITY'')');
 definition := replace(definition,
  'current_setting(''otr.core.command'',true) IS DISTINCT FROM ''CREATE_SPARSE_FLIGHT'' AND NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,''CORE_P2_DETAILS'')',
  'current_setting(''otr.core.command'',true)=''SET_AUTHORED_FLIGHT_DETAILS'' AND NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,''CORE_P2_DETAILS'')');
 definition := replace(definition,
  '(tg_table_name=''trip_item_participants'' and current_setting(''otr.core.command'',true)=''SET_ITEM_PARTICIPATION'')',
  '(tg_table_name=''trip_item_participants'' and current_setting(''otr.core.command'',true)=''SET_ITEM_PARTICIPATION'') or (tg_table_name=''trip_item_visibility_people'' and current_setting(''otr.core.command'',true)=''SET_OBJECT_VISIBILITY'')');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.assert_trip_core_v2_aggregate(uuid)'::regprocedure) INTO definition;
 needle := substring(definition FROM 'if root.experience_family=''P2'' AND \(session_user=''otr_trip_core_v2_gateway''[\s\S]*? IS TRUE then');
 IF needle IS NULL THEN RAISE EXCEPTION 'BETA_SPARSE_AGGREGATE_DRIFT';END IF;
 -- Structural validation must recognize a retained Sparse aggregate for any legal
 -- owning command. Admission and ACL remain in the original transaction/write guard.
 EXECUTE replace(definition,needle,
  'if root.experience_family=''P2'' AND EXISTS(SELECT 1 FROM public.trip_flight_intents WHERE event_id=item AND trip_id=root.trip_id AND qualification=''SPARSE'') then');
END $install$;

CREATE FUNCTION public.trip_core_guard_deleted_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF old.business_contract_version=2 AND EXISTS (
  SELECT 1 FROM public.trip_core_command_receipts r WHERE r.trip_id=old.trip_id
  AND r.outcome='APPLIED' AND r.body->>'command'='DELETE_ITEM'
  AND r.canonical_intent_text::jsonb#>>'{target,kind}'='ITEM'
  AND r.canonical_intent_text::jsonb#>>'{target,id}'=old.id::text
 ) THEN RAISE EXCEPTION 'ITEM_DELETED' USING ERRCODE='55000';END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.trip_core_guard_deleted_item() FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
CREATE TRIGGER core_v2_deleted_item_guard BEFORE UPDATE ON public.itinerary_events
 FOR EACH ROW EXECUTE FUNCTION public.trip_core_guard_deleted_item();

-- 20261116000900
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.trip_core_read_roster(actor uuid,trip uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;
BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' OR NOT public.trip_sustained_core_read_scope_allowed(actor,trip) THEN
  RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501'; END IF;
 -- A1 Person and Ledger Member are projections of this same physical row.
 -- Prove both source identities/Trips here; clients never infer equal UUIDs.
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p."personId"),'[]'::jsonb) INTO rows FROM (
  SELECT id AS "personId",trip_id AS "tripId",id AS "ledgerMemberId",trip_id AS "ledgerTripId",
    'JOURNEY_MEMBERS_A1'::text AS authority,display_name AS "displayName",role,
    participation_active AS "participationActive",participation_revision AS "participationRevision"
  FROM public.journey_members WHERE trip_id=trip ORDER BY id LIMIT 20001
 ) p;
 IF jsonb_array_length(rows)>20000 THEN RAISE EXCEPTION 'CORE_READ_RESOURCE_LIMIT';END IF;
 RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.trip_core_read_roster(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION public.trip_core_read_roster(uuid,uuid) TO otr_trip_core_v2_gateway;

-- 20261116001000
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.trip_core_lock_expense_link(p_actor uuid,p_trip uuid,p_link uuid,p_expense uuid,p_item uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public.expenses; l public.expense_links; actor_member uuid; actor_role text;
BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' OR NOT public.trip_sustained_core_read_scope_allowed(p_actor,p_trip)
  OR p_link IS NULL OR p_expense IS NULL OR p_item IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>9007199254740991 THEN
  RETURN jsonb_build_object('errorCode','NOT_VISIBLE'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-core2-expense-link:'||p_link::text,0));
 SELECT * INTO e FROM public.expenses WHERE id=p_expense AND journey_id=p_trip FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('errorCode','NOT_VISIBLE'); END IF;
 SELECT id,role INTO actor_member,actor_role FROM public.journey_members WHERE trip_id=p_trip AND user_id=p_actor AND status='linked';
 IF actor_member IS NULL OR actor_role NOT IN ('owner','group_member')
  OR (actor_role<>'owner' AND e.creator_member_id IS DISTINCT FROM actor_member) THEN
  RETURN jsonb_build_object('errorCode','NOT_VISIBLE'); END IF;
 IF e.revision<>p_revision THEN RETURN jsonb_build_object('errorCode','REVISION_CONFLICT'); END IF;
 IF e.business_status='DELETED' THEN RETURN jsonb_build_object('errorCode','INVALID_LINK'); END IF;
 SELECT * INTO l FROM public.expense_links WHERE id=p_link FOR UPDATE;
 IF FOUND AND (l.journey_id<>p_trip OR l.expense_id<>p_expense OR l.link_type<>'ITINERARY_EVENT' OR l.target_id<>p_item) THEN
  RETURN jsonb_build_object('errorCode','NOT_VISIBLE'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.itinerary_events WHERE id=p_item AND trip_id=p_trip AND business_contract_version=2) THEN
  RETURN jsonb_build_object('errorCode','NOT_VISIBLE'); END IF;
 PERFORM set_config('otr.core.expense',p_expense::text,true),set_config('otr.core.expense_revision',p_revision::text,true),set_config('otr.core.expense_link',p_link::text,true);
 RETURN jsonb_build_object('actorAccountId',p_actor,'tripId',p_trip,'linkId',p_link,'expenseId',p_expense,'itemId',p_item,'expenseRevision',e.revision);
END $$;
REVOKE ALL ON FUNCTION public.trip_core_lock_expense_link(uuid,uuid,uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION public.trip_core_lock_expense_link(uuid,uuid,uuid,uuid,uuid,bigint) TO otr_trip_core_v2_gateway;

CREATE FUNCTION public.trip_core_guard_expense_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb:=to_jsonb(coalesce(new,old)); actor uuid:=nullif(current_setting('otr.core.actor',true),'')::uuid;
 trip uuid:=nullif(current_setting('otr.core.trip',true),'')::uuid; e public.expenses; member_id uuid; member_role text; state text;
BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' THEN RETURN coalesce(new,old); END IF;
 IF current_setting('role',true)<>'otr_trip_core_v2_writer' OR current_setting('otr.core.admission',true) IS DISTINCT FROM 'MANUAL'
  OR NOT public.trip_sustained_core_read_scope_allowed(actor,trip)
  OR NOT ((tg_op='INSERT' AND current_setting('otr.core.command',true)='LINK_EXPENSE') OR (tg_op='DELETE' AND current_setting('otr.core.command',true)='UNLINK_EXPENSE'))
  OR r->>'id' IS DISTINCT FROM current_setting('otr.core.expense_link',true)
  OR r->>'journey_id' IS DISTINCT FROM trip::text OR r->>'expense_id' IS DISTINCT FROM current_setting('otr.core.expense',true)
  OR r->>'link_type' IS DISTINCT FROM 'ITINERARY_EVENT' OR r->>'target_id' IS DISTINCT FROM current_setting('otr.core.target_item',true)
  OR (tg_op='INSERT' AND (r->>'created_by' IS DISTINCT FROM actor::text OR r->'metadata' IS DISTINCT FROM '{}'::jsonb))
 THEN RAISE EXCEPTION 'CORE_EXPENSE_LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT lifecycle_state INTO state FROM public.trips WHERE id=trip FOR SHARE;
 IF state IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'TRIP_NOT_ACTIVE' USING ERRCODE='55000';END IF;
 SELECT * INTO e FROM public.expenses WHERE id=(r->>'expense_id')::uuid AND journey_id=trip FOR UPDATE;
 SELECT id,role INTO member_id,member_role FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked';
 IF e.id IS NULL OR e.business_status='DELETED' OR e.revision IS DISTINCT FROM nullif(current_setting('otr.core.expense_revision',true),'')::bigint
  OR member_id IS NULL OR member_role NOT IN ('owner','group_member') OR (member_role<>'owner' AND e.creator_member_id IS DISTINCT FROM member_id)
  OR NOT EXISTS(SELECT 1 FROM public.itinerary_events WHERE id=(r->>'target_id')::uuid AND trip_id=trip AND business_contract_version=2 AND owner_account_id=actor)
 THEN RAISE EXCEPTION 'CORE_EXPENSE_LINK_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN coalesce(new,old);
END $$;
REVOKE ALL ON FUNCTION public.trip_core_guard_expense_link() FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
CREATE TRIGGER core_v2_expense_link_guard BEFORE INSERT OR UPDATE OR DELETE ON public.expense_links
 FOR EACH ROW EXECUTE FUNCTION public.trip_core_guard_expense_link();
GRANT SELECT,INSERT,DELETE ON public.expense_links TO otr_trip_core_v2_writer;
CREATE POLICY core_v2_writer_expense_links ON public.expense_links TO otr_trip_core_v2_writer
 USING(journey_id=nullif(current_setting('otr.core.trip',true),'')::uuid)
 WITH CHECK(journey_id=nullif(current_setting('otr.core.trip',true),'')::uuid);

DO $install$
DECLARE definition text; needle text;
BEGIN
 SELECT pg_get_functiondef('public.trip_sustained_core_capabilities(uuid,uuid)'::regprocedure) INTO definition;
 needle := '''DELETE_ITEM'',''SET_OBJECT_VISIBILITY'']::text[]';
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'EXPENSE_LINK_CAPABILITY_DRIFT';END IF;
 EXECUTE replace(definition,needle,'''DELETE_ITEM'',''SET_OBJECT_VISIBILITY'',''LINK_EXPENSE'',''UNLINK_EXPENSE'']::text[]');
 SELECT pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure) INTO definition;
 needle := '''DELETE_ITEM'',''SET_OBJECT_VISIBILITY'')';
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'EXPENSE_LINK_READ_STATE_DRIFT';END IF;
 EXECUTE replace(definition,needle,'''DELETE_ITEM'',''SET_OBJECT_VISIBILITY'',''LINK_EXPENSE'',''UNLINK_EXPENSE'')');
 SELECT pg_get_functiondef('public.trip_core_guard_write()'::regprocedure) INTO definition;
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'EXPENSE_LINK_WRITE_GUARD_DRIFT';END IF;
 EXECUTE replace(definition,needle,'''DELETE_ITEM'',''SET_OBJECT_VISIBILITY'',''LINK_EXPENSE'',''UNLINK_EXPENSE'')');
END $install$;

-- 20261116001100
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Matches coreCanManage; retain the preimage across visibility child replacement.
CREATE FUNCTION public.trip_core_lock_item_manage(actor uuid,trip uuid,item uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE root public.itinerary_events; person uuid;
BEGIN
 IF NOT public.trip_sustained_core_read_scope_allowed(actor,trip)
 OR actor IS DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
 OR trip IS DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
 OR item IS DISTINCT FROM nullif(current_setting('otr.core.target_item',true),'')::uuid THEN RETURN false;END IF;
 SELECT * INTO root FROM public.itinerary_events WHERE id=item AND trip_id=trip AND business_contract_version=2 FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT id INTO person FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked';
 IF root.owner_account_id=actor OR (root.visibility<>'PRIVATE' AND root.participation_mode='WHOLE_GROUP'
 AND EXISTS(SELECT 1 FROM public.trips WHERE id=trip AND created_by=actor)
 AND (root.visibility='GROUP' OR (root.visibility='SELECTED_PERSONS' AND EXISTS(
 SELECT 1 FROM public.trip_item_visibility_people WHERE trip_id=trip AND item_id=item AND person_id=person)))) THEN
  PERFORM set_config('otr.core.manage_preimage',jsonb_build_array(actor,trip,item,txid_current())::text,true);
  RETURN true;
 END IF;
 RETURN false;
END $$;
CREATE FUNCTION public.trip_core_item_manage_preimage(actor uuid,trip uuid,item uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT session_user='otr_trip_core_v2_gateway'
 AND nullif(current_setting('otr.core.manage_preimage',true),'')::jsonb IS NOT DISTINCT FROM jsonb_build_array(actor,trip,item,txid_current())
$$;
REVOKE ALL ON FUNCTION public.trip_core_lock_item_manage(uuid,uuid,uuid),public.trip_core_item_manage_preimage(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_core_lock_item_manage(uuid,uuid,uuid) TO otr_trip_core_v2_gateway;
GRANT EXECUTE ON FUNCTION public.trip_core_item_manage_preimage(uuid,uuid,uuid) TO otr_trip_core_v2_gateway,otr_trip_core_v2_writer;

DO $install$
DECLARE definition text; needle text;
BEGIN
 -- The current DEV scope already includes normal MANUAL/READ and Guest qualification.
 SELECT pg_get_functiondef('public.trip_core_guard_write()'::regprocedure) INTO definition;
 needle:='coalesce(new_json,old_json)->>''owner_account_id'' is distinct from actor::text';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'NORMAL_MEMBER_ROOT_GUARD_DRIFT'; END IF;
 definition:=replace(definition,needle,'('||needle||' AND NOT (tg_op=''UPDATE'' AND public.trip_core_item_manage_preimage(actor,trip,nullif(current_setting(''otr.core.target_item'',true),'''')::uuid)))');
 needle:='and event.owner_account_id=actor)';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'NORMAL_MEMBER_CHILD_GUARD_DRIFT';END IF;
 definition:=replace(definition,needle,'and (event.owner_account_id=actor OR public.trip_core_item_manage_preimage(actor,trip,event.id)))');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.trip_core_guard_expense_link()'::regprocedure) INTO definition;
 needle:='AND owner_account_id=actor)';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'NORMAL_MEMBER_LINK_GUARD_DRIFT';END IF;
 EXECUTE replace(definition,needle,'AND (owner_account_id=actor OR public.trip_core_item_manage_preimage(actor,trip,id)))');
END $install$;

-- 20261116001200
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $install$
DECLARE definition text; needle text;
BEGIN
 -- Retain the current Guest, revocation and P2 immutable receipt checks.
 SELECT pg_get_functiondef('public.trip_core_lock_item_manage(uuid,uuid,uuid)'::regprocedure) INTO definition;
 needle:='  RETURN true;';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'P2_NORMAL_LOCK_PROOF_DRIFT';END IF;
 EXECUTE replace(definition,needle,
  '  IF current_setting(''otr.core.command'',true)=''SET_AUTHORED_FLIGHT_DETAILS'' AND NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,''CORE_P2_DETAILS'') THEN RETURN false;END IF;'||E'\n'||needle);
END $install$;

-- 20261116001300
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Same owning P5 row, target and authority; never delete/reinsert provenance.
DO $install$
DECLARE definition text; needle text;
BEGIN
 SELECT pg_get_functiondef('public.trip_core_guard_write()'::regprocedure) INTO definition;
 needle:='or tg_op=''UPDATE'' and tg_table_name=''itinerary_transport_services'' and old_json->''service_key'' IS DISTINCT FROM new_json->''service_key''';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'P5_SERVICE_REKEY_GUARD_DRIFT';END IF;
 EXECUTE replace(definition,needle,needle||' and NOT (current_setting(''otr.core.family'',true)=''P5'' and current_setting(''otr.core.command'',true)=''SET_TRANSPORT_DETAILS'' and current_setting(''otr.core.admission'',true)=''MANUAL'')');
END $install$;

-- 20261116001400
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Payment evidence appends without updating expenses; use the same Trip lock/guard.
CREATE TRIGGER trip_lifecycle_business_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payment_records
 FOR EACH ROW EXECUTE FUNCTION public.trip_lifecycle_business_guard();

-- 20261116001500
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Same ordinary Reader and its row lock; the Native response header cannot mix revisions.
CREATE FUNCTION public.trip_metadata_snapshot_with_lifecycle(p_actor uuid,p_trip uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE snapshot jsonb;state text;
BEGIN
 snapshot:=public.trip_metadata_snapshot(p_actor,p_trip,NULL::uuid);
 SELECT lifecycle_state INTO state FROM public.trips WHERE id=p_trip;
 RETURN jsonb_build_object('snapshot',snapshot,'lifecycleState',state);
END $$;
REVOKE ALL ON FUNCTION public.trip_metadata_snapshot_with_lifecycle(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_metadata_snapshot_with_lifecycle(uuid,uuid) TO otr_trip_metadata_gateway;

-- 20261116001700
-- Layer 3 additive reader; original immutable audit store and authority retained.
create or replace function public.ledger_read_personal_payment_audit_beta(
  actor_user uuid, target_journey uuid, target_record uuid
) returns jsonb
language sql security definer stable set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'recordId', a.record_id, 'journeyId', a.journey_id,
    'priorRevision', a.prior_revision, 'revision', a.new_revision,
    'eventType', a.event_type, 'actorUserId', a.actor_user_id,
    'actorMemberId', a.actor_member_id, 'operationId', a.operation_id,
    'reason', a.reason, 'changedFields', a.changed_fields,
    'recordSnapshotJson', a.record_snapshot::text, 'createdAt', a.created_at
  ) order by a.created_at, a.id), '[]'::jsonb)
  from public.personal_settlement_payment_audit_events a
  where a.record_id = target_record and a.journey_id = target_journey
    and public.ledger_can_read_personal_settlement_payment_1a(actor_user, target_record);
$$;
revoke all on function public.ledger_read_personal_payment_audit_beta(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.ledger_read_personal_payment_audit_beta(uuid,uuid,uuid) to service_role;

notify pgrst, 'reload schema';

-- Approved P5 identity delta
-- Candidate only: deploy compatible readers before advertising P5 unknown identity v1.

ALTER TABLE public.itinerary_transport_services ADD COLUMN identity_state jsonb;
ALTER TABLE public.itinerary_transport_services DROP CONSTRAINT core_v2_required_fields;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN operator_namespace DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN operator_issuer DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN operator_value DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN operator_literal DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN service_number DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN service_literal DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ADD CONSTRAINT core_v2_required_fields CHECK (
 trip_id IS NULL OR (event_id IS NOT NULL AND service_key IS NOT NULL AND transport_subtype IS NOT NULL AND attribution IS NOT NULL)
);
ALTER TABLE public.itinerary_transport_services ADD CONSTRAINT p5_identity_state_v1 CHECK ((
 (identity_state IS NULL AND operator_namespace IS NOT NULL AND operator_issuer IS NOT NULL AND operator_value IS NOT NULL AND operator_literal IS NOT NULL AND service_number IS NOT NULL AND service_literal IS NOT NULL)
 OR (trip_id IS NOT NULL AND transport_subtype IN ('TRAIN','BUS','FERRY','WATER_TAXI','SHUTTLE','TRANSFER')
 AND (operator_namespace IS DISTINCT FROM 'IATA_AIRLINE' OR (operator_issuer='IATA' AND operator_value ~ '^[A-Z0-9]{2}$') IS TRUE)
 AND (operator_namespace IS DISTINCT FROM 'ICAO_AIRLINE' OR (operator_issuer='ICAO' AND operator_value ~ '^[A-Z]{3}$') IS TRUE)
 AND jsonb_typeof(identity_state)='object'
 AND identity_state->'version'='1'::jsonb
 AND identity_state - ARRAY['version','fields']='{}'::jsonb
 AND jsonb_typeof(identity_state->'fields')='object'
 AND (identity_state->'fields') - ARRAY['operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal']='{}'::jsonb
 AND ((identity_state#>>'{fields,operator_namespace}'='KNOWN' AND operator_namespace IS NOT NULL AND btrim(operator_namespace,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,operator_namespace}' IN ('UNKNOWN') AND operator_namespace IS NULL))
 AND ((identity_state#>>'{fields,operator_issuer}'='KNOWN' AND operator_issuer IS NOT NULL AND btrim(operator_issuer,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,operator_issuer}' IN ('UNKNOWN') AND operator_issuer IS NULL))
 AND ((identity_state#>>'{fields,operator_value}'='KNOWN' AND operator_value IS NOT NULL AND btrim(operator_value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,operator_value}' IN ('UNKNOWN') AND operator_value IS NULL))
 AND ((identity_state#>>'{fields,operator_literal}'='KNOWN' AND operator_literal IS NOT NULL AND btrim(operator_literal,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,operator_literal}' IN ('UNKNOWN') AND operator_literal IS NULL))
 AND ((identity_state#>>'{fields,service_number}'='KNOWN' AND service_number IS NOT NULL AND btrim(service_number,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,service_number}' IN ('UNKNOWN','NOT_APPLICABLE') AND service_number IS NULL))
 AND ((identity_state#>>'{fields,service_literal}'='KNOWN' AND service_literal IS NOT NULL AND btrim(service_literal,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,service_literal}' IN ('UNKNOWN') AND service_literal IS NULL))
 )) IS TRUE);
-- Existing nonempty, enum, length, IATA/ICAO, codeshare and aggregate checks remain.
INSERT INTO public.trip_core_field_registry(table_name,field_name) VALUES('itinerary_transport_services','identity_state');

-- Managed OAuth approval port. Private role remains NOLOGIN after installation.
CREATE ROLE otr_mcp_operation_approval_gateway
 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE TABLE public.mcp_operation_approval_contexts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,client_id uuid NOT NULL,
 resource text NOT NULL,trip_id uuid NOT NULL,operation_id uuid NOT NULL,digest text NOT NULL CHECK(digest~'^[a-f0-9]{64}$'),
 context jsonb NOT NULL CHECK(jsonb_typeof(context)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes');
CREATE INDEX mcp_operation_approval_operation ON public.mcp_operation_approval_contexts(operation_id,created_at DESC);
CREATE TABLE public.mcp_operation_approval_decisions(
 approval_id uuid PRIMARY KEY REFERENCES public.mcp_operation_approval_contexts(id),actor_id uuid NOT NULL,
 normal_session_id uuid NOT NULL,decision boolean NOT NULL,decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes');
ALTER TABLE public.mcp_operation_approval_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_operation_approval_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_operation_approval_contexts,public.mcp_operation_approval_decisions FROM PUBLIC,anon,authenticated,service_role,otr_mcp_operation_approval_gateway;
CREATE FUNCTION public.mcp_operation_approval_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'OPERATION_APPROVAL_IMMUTABLE' USING ERRCODE='42501';END;$$;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='mcp_operation_approval_context_immutable') THEN
 CREATE TRIGGER mcp_operation_approval_context_immutable BEFORE UPDATE OR DELETE ON public.mcp_operation_approval_contexts FOR EACH ROW EXECUTE FUNCTION public.mcp_operation_approval_immutable();END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='mcp_operation_approval_decision_immutable') THEN
 CREATE TRIGGER mcp_operation_approval_decision_immutable BEFORE UPDATE OR DELETE ON public.mcp_operation_approval_decisions FOR EACH ROW EXECUTE FUNCTION public.mcp_operation_approval_immutable();END IF;
END$$;
CREATE TABLE public.mcp_risk_destructive_admissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,client_id uuid NOT NULL,resource text NOT NULL,
 trip_id uuid NOT NULL,target_id uuid NOT NULL,operation_id uuid NOT NULL,context jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes');
CREATE INDEX mcp_risk_admission_actor_window ON public.mcp_risk_destructive_admissions(actor_id,resource,expires_at);
CREATE INDEX mcp_risk_admission_operation ON public.mcp_risk_destructive_admissions(operation_id,created_at DESC);
ALTER TABLE public.mcp_risk_destructive_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_risk_destructive_admissions FROM PUBLIC,anon,authenticated,service_role,otr_mcp_operation_approval_gateway;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='mcp_risk_admission_immutable') THEN
 CREATE TRIGGER mcp_risk_admission_immutable BEFORE UPDATE OR DELETE ON public.mcp_risk_destructive_admissions FOR EACH ROW EXECUTE FUNCTION public.mcp_operation_approval_immutable();END IF;END$$;
-- The Managed Gateway verifies OAuth against the issuer. The database binds
-- the admission to the same OTR Consent and serializes local revocation.
CREATE FUNCTION public.mcp_assert_managed_consent(p_actor uuid,p_client uuid,p_evidence jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $consent$
DECLARE session_id uuid; evidence_id uuid;
BEGIN
 IF session_user NOT IN ('otr_mcp_operation_approval_gateway','otr_trip_metadata_gateway')
 OR p_actor IS NULL OR p_client IS NULL OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
 OR p_evidence->>'policyHash' IS NULL OR p_evidence->>'policyHash' !~ '^[a-f0-9]{64}$'
 OR p_evidence - ARRAY['evidenceId','sessionId','policyHash'] <> '{}'::jsonb THEN
  RAISE EXCEPTION 'MANAGED_CONSENT_REQUIRED' USING ERRCODE='42501';
 END IF;
 session_id:=(p_evidence->>'sessionId')::uuid;
 evidence_id:=(p_evidence->>'evidenceId')::uuid;
 PERFORM 1 FROM public.otr_mcp_managed_consents WHERE session_key=p_actor::text||':'||session_id::text
  AND state='SESSION_OPEN' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_CONSENT_SESSION_CLOSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.otr_mcp_managed_consents WHERE id=evidence_id AND state='APPROVED'
  AND consent_expires_at>clock_timestamp()
  AND oauth_session->>'accountId'=p_actor::text AND oauth_session->>'clientId'=p_client::text
  AND oauth_session->>'sessionId'=session_id::text AND policy->>'policyHash'=p_evidence->>'policyHash'
  FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MANAGED_CONSENT_REQUIRED' USING ERRCODE='42501'; END IF;
END $consent$;
REVOKE ALL ON FUNCTION public.mcp_assert_managed_consent(uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated,service_role,otr_mcp_operation_approval_gateway,otr_trip_metadata_gateway;
CREATE TABLE public.mcp_risk_plan_fences(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,client_id uuid NOT NULL,resource text NOT NULL,
 trip_id uuid NOT NULL,target_id uuid NOT NULL,plan_digest text NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),context jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes');
CREATE INDEX mcp_risk_plan_fence_target ON public.mcp_risk_plan_fences(actor_id,resource,trip_id,target_id,expires_at);
ALTER TABLE public.mcp_risk_plan_fences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_risk_plan_fences FROM PUBLIC,anon,authenticated,service_role,otr_mcp_operation_approval_gateway;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='mcp_risk_plan_fence_immutable') THEN
 CREATE TRIGGER mcp_risk_plan_fence_immutable BEFORE UPDATE OR DELETE ON public.mcp_risk_plan_fences FOR EACH ROW EXECUTE FUNCTION public.mcp_operation_approval_immutable();END IF;END$$;
CREATE FUNCTION public.mcp_managed_risk_admission(p_mode text,p_actor uuid,p_context jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cap text:=p_context#>>'{call,capabilityId}';req jsonb:=p_context#>'{call,request}';trip uuid;target uuid;op uuid;
 a public.mcp_risk_destructive_admissions%rowtype;target_count integer;client uuid;
BEGIN
 IF session_user<>'otr_mcp_operation_approval_gateway' OR current_setting('otr.mcp_beta.risk_enabled',true) IS DISTINCT FROM 'on' OR p_mode NOT IN ('ASSESS','RESERVE')
 OR p_context->>'accountId' IS DISTINCT FROM p_actor::text OR p_context->>'resource' IS DISTINCT FROM current_setting('otr.mcp_beta.resource',true)
 OR p_context->>'digest' IS NULL OR p_context->>'digest' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'RISK_ADMISSION_CLOSED' USING ERRCODE='42501';END IF;
 client:=(p_context->>'clientId')::uuid;trip:=(p_context#>>'{call,pathParams,tripId}')::uuid;op:=(p_context#>>'{operationIds,0}')::uuid;
 IF jsonb_array_length(p_context->'operationIds') IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'RISK_OPERATION_BINDING' USING ERRCODE='42501';END IF;
 IF cap~'^otr\.p[1-6]\.(hide|delete)$' THEN
  IF req->>'tripId' IS DISTINCT FROM trip::text OR req->>'operationId' IS DISTINCT FROM op::text OR req#>>'{target,kind}' IS DISTINCT FROM 'ITEM'
  OR (cap LIKE '%.delete' AND req->>'command' IS DISTINCT FROM 'DELETE_ITEM') OR (cap LIKE '%.hide' AND req->>'command' IS DISTINCT FROM 'HIDE_OBJECT')
  THEN RAISE EXCEPTION 'RISK_COMMAND_BINDING' USING ERRCODE='42501';END IF;
  target:=(req#>>'{target,id}')::uuid;
 ELSIF cap='otr.expense.delete' THEN
  IF req#>>'{envelope,patchOrIntent,type}' IS DISTINCT FROM 'DELETE' OR req#>>'{envelope,idempotencyKey}' IS DISTINCT FROM op::text THEN RAISE EXCEPTION 'RISK_COMMAND_BINDING' USING ERRCODE='42501';END IF;
  target:=(p_context#>>'{call,pathParams,expenseId}')::uuid;
 ELSE RAISE EXCEPTION 'RISK_OPERATION_NOT_ALLOWED' USING ERRCODE='42501';END IF;
 IF target IS NULL OR trip IS NULL OR op IS NULL OR client IS NULL THEN RAISE EXCEPTION 'RISK_TARGET_REQUIRED' USING ERRCODE='42501';END IF;
 PERFORM public.mcp_assert_managed_consent(p_actor,client,p_context->'managedConsent');
 -- Conservative Beta decomposition budget: at most9 distinct destructive targets per account/resource/15min without aggregate L3 approval.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||(p_context->>'resource'),20));
 IF EXISTS(SELECT 1 FROM public.mcp_risk_plan_fences f WHERE f.actor_id=p_actor AND f.resource=p_context->>'resource'
 AND f.trip_id=trip AND f.target_id=target AND f.expires_at>clock_timestamp()) THEN
  RETURN jsonb_build_object('risk','L3_HIGH_IMPACT_WRITE','reserved',false,'reason','DECLARED_PLAN_TARGET_REQUIRES_TRUSTED_CONFIRMATION');
 END IF;
 SELECT * INTO a FROM public.mcp_risk_destructive_admissions WHERE operation_id=op ORDER BY created_at DESC LIMIT 1 FOR SHARE;
 IF FOUND AND a.context IS DISTINCT FROM p_context THEN RAISE EXCEPTION 'RISK_OPERATION_COLLISION' USING ERRCODE='23505';END IF;
 IF FOUND AND a.expires_at>clock_timestamp() THEN RETURN jsonb_build_object('risk','L2_SENSITIVE_WRITE','reserved',true,'admissionId',a.id,'expiresAt',a.expires_at);END IF;
 SELECT count(*) INTO target_count FROM (SELECT r.trip_id,r.target_id FROM public.mcp_risk_destructive_admissions r WHERE r.actor_id=p_actor AND r.resource=p_context->>'resource' AND r.expires_at>clock_timestamp() UNION SELECT trip,target) targets;
 IF target_count>=10 THEN RETURN jsonb_build_object('risk','L3_HIGH_IMPACT_WRITE','reserved',false,'reason','AGGREGATE_DESTRUCTIVE_TARGETS_REQUIRE_TRUSTED_CONFIRMATION');END IF;
 IF p_mode='RESERVE' THEN
  INSERT INTO public.mcp_risk_destructive_admissions(actor_id,client_id,resource,trip_id,target_id,operation_id,context) VALUES(p_actor,client,p_context->>'resource',trip,target,op,p_context) RETURNING * INTO a;
 END IF;
 RETURN jsonb_build_object('risk','L2_SENSITIVE_WRITE','reserved',p_mode='RESERVE','admissionId',a.id,'expiresAt',a.expires_at);
END;$$;
REVOKE ALL ON FUNCTION public.mcp_managed_risk_admission(text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mcp_managed_risk_admission(text,uuid,jsonb) TO otr_mcp_operation_approval_gateway;

CREATE FUNCTION public.mcp_managed_risk_plan_fence(p_actor uuid,p_context jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan jsonb:=p_context->'call';step jsonb;call jsonb;req jsonb;child jsonb;targets jsonb:='[]'::jsonb;
 trip uuid;target uuid;op uuid;client uuid;total integer;f jsonb;
BEGIN
 IF session_user<>'otr_mcp_operation_approval_gateway' OR current_setting('otr.mcp_beta.risk_enabled',true) IS DISTINCT FROM 'on'
 OR p_context->>'accountId' IS DISTINCT FROM p_actor::text OR p_context->>'resource' IS DISTINCT FROM current_setting('otr.mcp_beta.resource',true)
 OR p_context->>'digest' IS NULL OR p_context->>'digest' !~ '^[a-f0-9]{64}$'
 OR plan->>'schemaVersion' IS DISTINCT FROM 'otr.mcp-beta.risk-plan/1.1.0'
 OR jsonb_typeof(plan->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(plan->'steps') NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'PLAN_FENCE_CLOSED' USING ERRCODE='42501';END IF;
 client:=(p_context->>'clientId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||(p_context->>'resource'),20));
 FOR step IN SELECT value FROM jsonb_array_elements(plan->'steps') LOOP
  IF step->>'stage' IS DISTINCT FROM 'APPLY' THEN CONTINUE;END IF;
  call:=step->'call';req:=call->'request';
  IF call->>'capabilityId' ~ '^otr\.p[1-6]\.(hide|delete)$' THEN target:=(req#>>'{target,id}')::uuid;op:=(req->>'operationId')::uuid;
  ELSIF call->>'capabilityId'='otr.expense.delete' THEN target:=(call#>>'{pathParams,expenseId}')::uuid;op:=(req#>>'{envelope,idempotencyKey}')::uuid;
  ELSE CONTINUE;END IF;
  trip:=(call#>>'{pathParams,tripId}')::uuid;
  child:=jsonb_build_object('accountId',p_actor,'clientId',client,'resource',p_context->>'resource','operationIds',jsonb_build_array(op),'digest',p_context->>'digest','call',call,'managedConsent',p_context->'managedConsent');
  -- Reuse typed command/account/current OAuth consent admission; ASSESS grants and reserves nothing.
  PERFORM public.mcp_managed_risk_admission('ASSESS',p_actor,child);
  targets:=targets||jsonb_build_array(jsonb_build_object('trip',trip,'target',target));
 END LOOP;
 SELECT count(*) INTO total FROM (SELECT DISTINCT value FROM jsonb_array_elements(targets)) t;
 IF total<10 OR client IS NULL THEN RAISE EXCEPTION 'PLAN_FENCE_THRESHOLD_REQUIRED' USING ERRCODE='42501';END IF;
 FOR f IN SELECT DISTINCT value FROM jsonb_array_elements(targets) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.mcp_risk_plan_fences r WHERE r.actor_id=p_actor AND r.resource=p_context->>'resource'
   AND r.trip_id=(f->>'trip')::uuid AND r.target_id=(f->>'target')::uuid AND r.plan_digest=p_context->>'digest' AND r.expires_at>clock_timestamp()) THEN
   INSERT INTO public.mcp_risk_plan_fences(actor_id,client_id,resource,trip_id,target_id,plan_digest,context)
   VALUES(p_actor,client,p_context->>'resource',(f->>'trip')::uuid,(f->>'target')::uuid,p_context->>'digest',p_context);
  END IF;
 END LOOP;
 RETURN jsonb_build_object('risk','L3_HIGH_IMPACT_WRITE','reserved',false,'targets',total,'approvalGranted',false);
END;$$;
REVOKE ALL ON FUNCTION public.mcp_managed_risk_plan_fence(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mcp_managed_risk_plan_fence(uuid,jsonb) TO otr_mcp_operation_approval_gateway;

CREATE FUNCTION public.mcp_managed_l3_trip_delete_approval(p_action text,p_actor uuid,p_id uuid DEFAULT NULL,p_context jsonb DEFAULT NULL,p_decision boolean DEFAULT NULL,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.mcp_operation_approval_contexts%rowtype;d public.mcp_operation_approval_decisions%rowtype;
 t public.trips%rowtype;request jsonb;metadata jsonb;completed boolean;state text;
BEGIN
 IF session_user<>'otr_mcp_operation_approval_gateway' OR current_setting('otr.mcp_beta.risk_enabled',true) IS DISTINCT FROM 'on'
 OR p_action NOT IN ('PREPARE','CHECK','READ','DECIDE') THEN RAISE EXCEPTION 'OPERATION_APPROVAL_CLOSED' USING ERRCODE='42501';END IF;
 IF p_action IN ('PREPARE','CHECK') THEN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object' OR p_context->>'digest' IS NULL OR p_context->>'accountId' IS DISTINCT FROM p_actor::text OR p_context->>'resource' IS DISTINCT FROM current_setting('otr.mcp_beta.resource',true)
  OR p_context->>'digest' !~ '^[a-f0-9]{64}$' OR p_context#>>'{call,capabilityId}' IS DISTINCT FROM 'otr.trip.delete'
  OR p_context#>>'{call,toolName}' IS DISTINCT FROM 'delete_trip' THEN RAISE EXCEPTION 'OPERATION_APPROVAL_CONTEXT' USING ERRCODE='42501';END IF;
  request:=p_context#>'{call,request}';
  IF request->>'action' IS DISTINCT FROM 'DELETE' OR request->>'tripId' IS DISTINCT FROM p_context#>>'{call,pathParams,tripId}'
  OR request->>'operationId' IS DISTINCT FROM p_context#>>'{operationIds,0}' OR jsonb_array_length(p_context->'operationIds') IS DISTINCT FROM 1
  OR request->>'graphHash' IS NULL OR request->>'graphHash' !~ '^[a-f0-9]{64}$'
  OR request->>'expectedMetadataRevision' IS NULL OR request->>'expectedMetadataRevision' !~ '^[0-9]+$'
  THEN RAISE EXCEPTION 'L3_DELETE_CONTEXT_REQUIRED' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(request->>'operationId',19));
  SELECT * INTO a FROM public.mcp_operation_approval_contexts WHERE operation_id=(request->>'operationId')::uuid ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE;
  IF FOUND AND a.context IS DISTINCT FROM p_context THEN RAISE EXCEPTION 'OPERATION_APPROVAL_BINDING_CHANGED' USING ERRCODE='23505';END IF;
  IF a.id IS NULL THEN
   a.actor_id:=p_actor;a.client_id:=(p_context->>'clientId')::uuid;a.resource:=p_context->>'resource';a.trip_id:=(request->>'tripId')::uuid;
   a.operation_id:=(request->>'operationId')::uuid;a.digest:=p_context->>'digest';a.context:=p_context;
  END IF;
 ELSE
  SELECT * INTO a FROM public.mcp_operation_approval_contexts WHERE id=p_id FOR SHARE;
  IF NOT FOUND OR a.context#>>'{call,capabilityId}' IS DISTINCT FROM 'otr.trip.delete' OR a.actor_id<>p_actor THEN RAISE EXCEPTION 'OPERATION_APPROVAL_NOT_FOUND' USING ERRCODE='P0002';END IF;
  request:=a.context#>'{call,request}';
  IF p_action='DECIDE' THEN PERFORM pg_advisory_xact_lock(hashtextextended(a.operation_id::text,19));END IF;
 END IF;
 IF a.resource IS DISTINCT FROM current_setting('otr.mcp_beta.resource',true) THEN RAISE EXCEPTION 'OPERATION_APPROVAL_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 PERFORM public.mcp_assert_managed_consent(p_actor,a.client_id,a.context->'managedConsent');
 SELECT * INTO t FROM public.trips WHERE id=a.trip_id FOR SHARE;
 IF NOT FOUND OR t.created_by<>p_actor OR t.lifecycle_state NOT IN ('ACTIVE','ARCHIVED','DELETED')
 OR NOT EXISTS(SELECT 1 FROM public.journey_members m WHERE m.trip_id=a.trip_id AND m.user_id=p_actor AND m.status='linked' AND m.role='owner')
 THEN RAISE EXCEPTION 'OPERATION_APPROVAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 completed:=EXISTS(SELECT 1 FROM public.trip_metadata_update_receipts r WHERE r.operation_id=a.operation_id AND r.trip_id=a.trip_id AND r.actor_account_id=p_actor AND r.request_payload=request);
 metadata:=jsonb_build_object('name',t.name,'destination',t.destination,'startDate',t.start_date,'endDate',t.end_date,'destinations',t.destinations);
 IF NOT completed AND (t.lifecycle_state='DELETED' OR t.metadata_revision IS DISTINCT FROM (request->>'expectedMetadataRevision')::bigint)
 THEN RAISE EXCEPTION 'OPERATION_APPROVAL_STALE_REVISION' USING ERRCODE='40001';END IF;
 IF p_action IN ('READ','DECIDE') AND p_session IS NULL THEN
  RAISE EXCEPTION 'OPERATION_APPROVAL_NORMAL_SESSION_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF a.id IS NOT NULL THEN SELECT * INTO d FROM public.mcp_operation_approval_decisions WHERE approval_id=a.id;END IF;
 IF p_action='PREPARE' AND NOT completed AND d.decision IS DISTINCT FROM false AND (a.id IS NULL OR (d.approval_id IS NULL AND a.expires_at<=clock_timestamp()) OR (d.decision AND d.expires_at<=clock_timestamp())) THEN
  INSERT INTO public.mcp_operation_approval_contexts(actor_id,client_id,resource,trip_id,operation_id,digest,context)
  VALUES(a.actor_id,a.client_id,a.resource,a.trip_id,a.operation_id,a.digest,a.context) RETURNING * INTO a;
  d:=NULL;
 END IF;
 IF p_action='DECIDE' THEN
  IF completed OR p_decision IS NULL OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'OPERATION_APPROVAL_EXPIRED_OR_COMPLETED' USING ERRCODE='55000';END IF;
  IF d.approval_id IS NOT NULL AND (d.decision IS DISTINCT FROM p_decision OR d.normal_session_id<>p_session) THEN RAISE EXCEPTION 'OPERATION_APPROVAL_DECISION_FINAL' USING ERRCODE='23505';END IF;
  INSERT INTO public.mcp_operation_approval_decisions(approval_id,actor_id,normal_session_id,decision) VALUES(a.id,p_actor,p_session,p_decision) ON CONFLICT(approval_id) DO NOTHING;
  SELECT * INTO d FROM public.mcp_operation_approval_decisions WHERE approval_id=a.id;
  IF d.decision IS DISTINCT FROM p_decision OR d.normal_session_id<>p_session THEN RAISE EXCEPTION 'OPERATION_APPROVAL_DECISION_FINAL' USING ERRCODE='23505';END IF;
 END IF;
 state:=CASE WHEN a.id IS NULL THEN 'MISSING' WHEN d.decision=false THEN 'DECLINED' WHEN d.decision AND d.expires_at>clock_timestamp() THEN 'APPROVED'
 WHEN d.approval_id IS NOT NULL OR a.expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE 'PENDING' END;
 RETURN jsonb_build_object('kind','TRIP_DELETE','targetName',t.name,'id',a.id,'state',state,'accountId',a.actor_id,'clientId',a.client_id,'clientName','OTR MCP','managedConsent',a.context->'managedConsent','resource',a.resource,
 'tripId',a.trip_id,'operationId',a.operation_id,'digest',a.digest,'call',a.context->'call','completed',completed,
 'expiresAt',CASE WHEN d.decision THEN d.expires_at ELSE a.expires_at END,'decisionAt',d.decided_at,'normalSessionId',d.normal_session_id);
END;$$;
REVOKE ALL ON FUNCTION public.mcp_managed_l3_trip_delete_approval(text,uuid,uuid,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public TO otr_mcp_operation_approval_gateway;
GRANT EXECUTE ON FUNCTION public.mcp_managed_l3_trip_delete_approval(text,uuid,uuid,jsonb,boolean,uuid) TO otr_mcp_operation_approval_gateway;

-- Admission check runs on the original metadata writer's lease/transaction, never as another writer.
CREATE FUNCTION public.mcp_managed_l3_assert_lifecycle(p_actor uuid,p_client uuid,p_resource text,p_operation uuid,p_request jsonb,p_managed_consent jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.mcp_operation_approval_contexts%rowtype;d public.mcp_operation_approval_decisions%rowtype;t public.trips%rowtype;
BEGIN
 IF p_request->>'action' IS DISTINCT FROM 'DELETE' THEN RAISE EXCEPTION 'L3_DELETE_CONTEXT_REQUIRED' USING ERRCODE='42501';END IF;
 IF session_user<>'otr_trip_metadata_gateway' OR current_setting('otr.mcp_beta.risk_enabled',true) IS DISTINCT FROM 'on'
 OR p_resource IS DISTINCT FROM current_setting('otr.mcp_beta.resource',true) THEN RAISE EXCEPTION 'OPERATION_APPROVAL_CLOSED' USING ERRCODE='42501';END IF;
 PERFORM public.mcp_assert_managed_consent(p_actor,p_client,p_managed_consent);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 SELECT * INTO t FROM public.trips WHERE id=(p_request->>'tripId')::uuid FOR UPDATE;
 IF NOT FOUND OR t.created_by<>p_actor OR t.lifecycle_state NOT IN ('ACTIVE','ARCHIVED','DELETED') THEN RAISE EXCEPTION 'OPERATION_APPROVAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.journey_members m WHERE m.trip_id=t.id AND m.user_id=p_actor AND m.status='linked' AND m.role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_APPROVAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM public.mcp_operation_approval_contexts WHERE operation_id=p_operation ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND OR a.actor_id<>p_actor OR a.client_id<>p_client OR a.resource<>p_resource OR a.trip_id<>t.id OR a.context#>'{call,request}' IS DISTINCT FROM p_request OR a.context->'managedConsent' IS DISTINCT FROM p_managed_consent
 THEN RAISE EXCEPTION 'OPERATION_APPROVAL_BINDING_CHANGED' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.mcp_operation_approval_decisions WHERE approval_id=a.id FOR SHARE;
 IF NOT FOUND OR NOT d.decision OR d.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'OPERATION_APPROVAL_NOT_APPROVED' USING ERRCODE='42501';END IF;
 RETURN true;
END;$$;
REVOKE ALL ON FUNCTION public.mcp_managed_l3_assert_lifecycle(uuid,uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role,otr_mcp_operation_approval_gateway;
GRANT EXECUTE ON FUNCTION public.mcp_managed_l3_assert_lifecycle(uuid,uuid,text,uuid,jsonb,jsonb) TO otr_trip_metadata_gateway;

-- Block unexpected installation-time default table grants, including trusted API roles.
DO $private_acl$
DECLARE entry record;
BEGIN
 FOR entry IN SELECT c.relname, a.grantee, r.rolname
  FROM pg_class c LEFT JOIN LATERAL aclexplode(c.relacl) a ON true
  LEFT JOIN pg_roles r ON r.oid=a.grantee
  WHERE c.oid IN ('public.mcp_operation_approval_contexts'::regclass,
    'public.mcp_operation_approval_decisions'::regclass,
    'public.mcp_risk_destructive_admissions'::regclass,
    'public.mcp_risk_plan_fences'::regclass) AND a.grantee<>c.relowner
 LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM %s',entry.relname,
    CASE WHEN entry.grantee=0 THEN 'PUBLIC' ELSE quote_ident(entry.rolname) END);
 END LOOP;
END $private_acl$;

COMMIT;
