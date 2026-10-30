-- DISPOSABLE PG CANDIDATE ONLY. Protected delta; never install in Hosted DEV.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^otr_auth_composite_[a-f0-9]{12}$'
 OR current_setting('otr.auth.composite_fixture',true) IS DISTINCT FROM 'LOCAL_DISPOSABLE'
 THEN RAISE EXCEPTION 'AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED';END IF;
END $$;
CREATE TABLE otr_auth_guest_composite.policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 policy_version text NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 128)
);
INSERT INTO otr_auth_guest_composite.policy VALUES(true,false,'otr.auth.fileless-p1.unpriced/1');
CREATE TABLE otr_auth_guest_composite.grants (
 adoption_id uuid PRIMARY KEY,
 actor_account_id uuid NOT NULL REFERENCES auth.users(id),
 source_guest_local_id uuid NOT NULL,
 inventory_sha256 text NOT NULL CHECK(inventory_sha256 ~ '^[0-9a-f]{64}$'),
 grant_id uuid NOT NULL UNIQUE,
 request_payload jsonb NOT NULL,
 grant_payload jsonb NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL
);
CREATE TABLE otr_auth_guest_composite.transaction_scopes (
 backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,
 adoption_id uuid NOT NULL REFERENCES otr_auth_guest_composite.sealed_stages(adoption_id),
 operation_kind text, operation_id uuid,
 PRIMARY KEY(backend_pid,transaction_id)
);
ALTER TABLE otr_auth_guest_composite.policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE otr_auth_guest_composite.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE otr_auth_guest_composite.transaction_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA otr_auth_guest_composite FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
CREATE TRIGGER immutable_grant BEFORE UPDATE OR DELETE ON otr_auth_guest_composite.grants
 FOR EACH ROW EXECUTE FUNCTION otr_auth_guest_composite.reject_stage_mutation();
CREATE FUNCTION otr_auth_guest_composite.principal_allowed() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='otr_trip_core_v2_gateway' AND EXISTS(
 SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolcanlogin
 AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)
 AND rolconnlimit=1 AND (rolvaliduntil IS NULL OR rolvaliduntil>clock_timestamp()))
 AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_writer'
 AND NOT(rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication))
 AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE
 (m.roleid IN ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole)
 OR m.member IN ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole)) AND NOT (
 (m.member='postgres'::regrole AND m.roleid IN ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole)
 AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
 OR(m.member='otr_trip_core_v2_gateway'::regrole AND m.roleid='otr_trip_core_v2_writer'::regrole
 AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)))
$$;
CREATE FUNCTION otr_auth_guest_composite.account_allowed(actor uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing_policy record;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND is_anonymous IS FALSE) THEN RETURN false;END IF;
 SELECT * INTO existing_policy FROM public.trip_sustained_dev_policy WHERE actor_account_id=actor FOR SHARE;
 RETURN NOT FOUND OR (existing_policy.enabled AND existing_policy.revoked_at IS NULL);
END $$;
CREATE FUNCTION otr_auth_guest_composite.confirm_and_issue(actor uuid,request jsonb,confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r otr_auth_guest_composite.grants%rowtype;p record;k text;counts jsonb;result jsonb;instant timestamptz:=clock_timestamp();
BEGIN
 IF NOT otr_auth_guest_composite.principal_allowed() OR confirmed IS DISTINCT FROM true
 OR NOT otr_auth_guest_composite.account_allowed(actor)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_CONFIRMATION_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM otr_auth_guest_composite.policy WHERE singleton FOR SHARE;
 IF NOT FOUND OR NOT p.enabled THEN RAISE EXCEPTION 'AUTH_ADOPTION_POLICY_CLOSED' USING ERRCODE='55000';END IF;
 IF jsonb_typeof(request) IS DISTINCT FROM 'object'
 OR request-ARRAY['contractVersion','adoptionId','sourceGuestLocalId','targetAccountId','inventorySha256','resources']<>'{}'::jsonb
 OR NOT request ?& ARRAY['contractVersion','adoptionId','sourceGuestLocalId','targetAccountId','inventorySha256','resources']
 OR request->'contractVersion' IS DISTINCT FROM '1'::jsonb
 OR request->>'targetAccountId' IS DISTINCT FROM actor::text
 OR request->>'inventorySha256' !~ '^[0-9a-f]{64}$'
 OR jsonb_typeof(request->'resources') IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_PREFLIGHT_INVALID' USING ERRCODE='22023';END IF;
 counts:=request->'resources';
 IF counts-ARRAY['trips','people','items','files','fileBytes','liveDrafts']<>'{}'::jsonb
 OR NOT counts ?& ARRAY['trips','people','items','files','fileBytes','liveDrafts']
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_PREFLIGHT_INVALID' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['trips','people','items','files','fileBytes','liveDrafts'] LOOP
  IF jsonb_typeof(counts->k) IS DISTINCT FROM 'number' OR counts->>k !~ '^[0-9]+$'
  OR (counts->>k)::numeric>9007199254740991
  THEN RAISE EXCEPTION 'AUTH_ADOPTION_PREFLIGHT_INVALID' USING ERRCODE='22023';END IF;
 END LOOP;
 IF counts->'files'<>'0'::jsonb OR counts->'fileBytes'<>'0'::jsonb OR counts->'liveDrafts'<>'0'::jsonb
 OR (counts->>'trips')::bigint<1 OR (counts->>'people')::bigint<(counts->>'trips')::bigint
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_DATASET_UNSUPPORTED' USING ERRCODE='22023';END IF;
 -- One idempotent server-issued grant. Retry never extends expiry or changes target.
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-auth-adoption:'||(request->>'adoptionId'),0));
 IF EXISTS(SELECT 1 FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id=(request->>'adoptionId')::uuid)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_ALREADY_TERMINAL' USING ERRCODE='23505';END IF;
 SELECT * INTO r FROM otr_auth_guest_composite.grants WHERE adoption_id=(request->>'adoptionId')::uuid FOR UPDATE;
 instant:=clock_timestamp();
 IF FOUND THEN
  IF r.actor_account_id<>actor OR r.request_payload IS DISTINCT FROM request
  THEN RAISE EXCEPTION 'AUTH_ADOPTION_GRANT_COLLISION' USING ERRCODE='23505';END IF;
  IF r.expires_at<=instant OR r.grant_payload->>'policyVersion' IS DISTINCT FROM p.policy_version THEN RAISE EXCEPTION 'AUTH_ADOPTION_GRANT_EXPIRED' USING ERRCODE='55000';END IF;
  RETURN r.grant_payload;
 END IF;
 result:=request||jsonb_build_object('status','GRANTED','grantId',gen_random_uuid(),
 'policyVersion',p.policy_version,'expiresAt',to_char((instant+interval '15 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO otr_auth_guest_composite.grants VALUES((request->>'adoptionId')::uuid,actor,
 (request->>'sourceGuestLocalId')::uuid,request->>'inventorySha256',(result->>'grantId')::uuid,request,result,instant,instant+interval '15 minutes');
 RETURN result;
END $$;
CREATE FUNCTION otr_auth_guest_composite.seal_stage(actor uuid,plan_text text,plan_sha256 text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=plan_text::jsonb;g otr_auth_guest_composite.grants%rowtype;s record;preparation jsonb;source jsonb;
BEGIN
 IF NOT otr_auth_guest_composite.principal_allowed() OR NOT otr_auth_guest_composite.account_allowed(actor) OR NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.policy WHERE singleton AND enabled)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_POLICY_CLOSED' USING ERRCODE='55000';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-auth-adoption:'||(p#>>'{grant,adoptionId}'),0));
 IF EXISTS(SELECT 1 FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id=(p#>>'{grant,adoptionId}')::uuid)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_ALREADY_TERMINAL' USING ERRCODE='23505';END IF;
 SELECT * INTO g FROM otr_auth_guest_composite.grants WHERE adoption_id=(p#>>'{grant,adoptionId}')::uuid FOR SHARE;
 IF NOT FOUND OR g.actor_account_id IS DISTINCT FROM actor OR g.grant_payload IS DISTINCT FROM p->'grant'
 OR g.expires_at<=clock_timestamp()
 OR g.grant_payload->>'policyVersion' IS DISTINCT FROM (SELECT policy_version FROM otr_auth_guest_composite.policy WHERE singleton) THEN RAISE EXCEPTION 'AUTH_ADOPTION_REAL_GRANT_REQUIRED' USING ERRCODE='42501';END IF;
 preparation:=(p#>>'{preparation,canonicalText}')::jsonb;
 source:=(preparation#>>'{source,canonicalText}')::jsonb;
 IF preparation->>'schemaId' IS DISTINCT FROM 'otr.auth.guest-adoption-recovery/3'
 OR preparation->'drafts' IS DISTINCT FROM '[]'::jsonb
 OR preparation->>'adoptionId' IS DISTINCT FROM g.adoption_id::text
 OR preparation->>'targetAccountId' IS DISTINCT FROM actor::text
 OR preparation->>'inventorySha256' IS DISTINCT FROM g.inventory_sha256
 OR preparation#>>'{source,sha256}' IS DISTINCT FROM encode(sha256(convert_to(preparation#>>'{source,canonicalText}','UTF8')),'hex')
 OR preparation->>'sourceGuestLocalId' IS DISTINCT FROM g.source_guest_local_id::text
 OR source->>'schemaId' IS DISTINCT FROM 'otr.auth.guest-trip-p1-source/1'
 OR source->>'sourceGuestLocalId' IS DISTINCT FROM g.source_guest_local_id::text
 OR source#>'{totals,trips}' IS DISTINCT FROM g.request_payload#>'{resources,trips}'
 OR source#>'{totals,people}' IS DISTINCT FROM g.request_payload#>'{resources,people}'
 OR source#>'{totals,p1Items}' IS DISTINCT FROM g.request_payload#>'{resources,items}'
 OR jsonb_array_length(source->'trips')::bigint IS DISTINCT FROM (g.request_payload#>>'{resources,trips}')::bigint
 OR (SELECT sum(1+jsonb_array_length(t->'people')) FROM jsonb_array_elements(source->'trips') t)
 IS DISTINCT FROM (g.request_payload#>>'{resources,people}')::numeric
 OR (SELECT count(*) FROM jsonb_array_elements(source->'trips') t,
 LATERAL jsonb_array_elements(t->'coreIntents') i WHERE i#>>'{command,command}'='CREATE_ITEM')
 IS DISTINCT FROM (g.request_payload#>>'{resources,items}')::bigint
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_STAGE_RESOURCE_MISMATCH' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(source->'trips') t
 WHERE jsonb_typeof(t->'create') IS DISTINCT FROM 'object'
 OR jsonb_typeof(t#>'{create,tripId}') IS DISTINCT FROM 'string'
 OR pg_input_is_valid(t#>>'{create,tripId}','uuid') IS DISTINCT FROM true
 OR jsonb_typeof(t#>'{create,operationId}') IS DISTINCT FROM 'string'
 OR pg_input_is_valid(t#>>'{create,operationId}','uuid') IS DISTINCT FROM true
 OR t#>>'{ledgerInitialization,id}' IS DISTINCT FROM t#>>'{create,tripId}')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(source->'trips') t,
 LATERAL jsonb_array_elements(t->'people') person_entry WHERE
 person_entry->>'tripId' IS DISTINCT FROM t#>>'{create,tripId}'
 OR pg_input_is_valid(person_entry->>'operationId','uuid') IS DISTINCT FROM true
 OR pg_input_is_valid(person_entry->>'personId','uuid') IS DISTINCT FROM true)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(source->'trips') t,
 LATERAL jsonb_array_elements(t->'deferredMetadata') a WHERE
 a->>'tripId' IS DISTINCT FROM t#>>'{create,tripId}'
 OR pg_input_is_valid(a->>'operationId','uuid') IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_STAGE_IDENTITY_INVALID' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(source->'trips') t,
 LATERAL jsonb_array_elements(t->'coreIntents') i WHERE i#>>'{command,tripId}' IS DISTINCT FROM t#>>'{create,tripId}'
 OR pg_input_is_valid(i#>>'{command,operationId}','uuid') IS DISTINCT FROM true
 OR i#>>'{command,admission,mode}' IS DISTINCT FROM 'MANUAL'
 OR i#>>'{command,command}' IS NULL OR i#>>'{command,command}' NOT IN ('CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION')
 OR i#>>'{command,command}'='CREATE_ITEM' AND i#>>'{command,payload,family}' IS DISTINCT FROM 'P1')
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_STAGE_FAMILY_UNSUPPORTED' USING ERRCODE='23514';END IF;
 INSERT INTO otr_auth_guest_composite.sealed_stages(adoption_id,actor_account_id,source_guest_local_id,grant_id,
 inventory_sha256,preparation_sha256,plan_sha256,plan_text)
 VALUES(g.adoption_id,actor,g.source_guest_local_id,g.grant_id,g.inventory_sha256,p#>>'{preparation,sha256}',plan_sha256,plan_text)
 ON CONFLICT(adoption_id) DO NOTHING;
 SELECT * INTO s FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id=g.adoption_id FOR UPDATE;
 IF s.actor_account_id<>actor OR s.plan_sha256 IS DISTINCT FROM plan_sha256 OR s.plan_text IS DISTINCT FROM plan_text
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_STAGE_COLLISION' USING ERRCODE='23505';END IF;
 RETURN s.plan_sha256;
END $$;
CREATE FUNCTION otr_auth_guest_composite.begin_scope(actor uuid,adoption uuid,plan_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s record;g record;
BEGIN
 IF NOT otr_auth_guest_composite.principal_allowed() OR NOT otr_auth_guest_composite.account_allowed(actor) OR NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.policy WHERE singleton AND enabled)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_POLICY_CLOSED' USING ERRCODE='55000';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-auth-adoption:'||adoption::text,0));
 IF EXISTS(SELECT 1 FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id=adoption)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_ALREADY_TERMINAL' USING ERRCODE='23505';END IF;
 SELECT * INTO s FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id=adoption FOR UPDATE;
 IF NOT FOUND OR s.actor_account_id IS DISTINCT FROM actor OR s.plan_sha256 IS DISTINCT FROM plan_hash
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_SCOPE_BINDING' USING ERRCODE='42501';END IF;
 SELECT * INTO g FROM otr_auth_guest_composite.grants WHERE adoption_id=adoption FOR SHARE;
 IF NOT FOUND OR g.actor_account_id IS DISTINCT FROM actor OR g.grant_id IS DISTINCT FROM s.grant_id
 OR g.grant_payload IS DISTINCT FROM s.plan_text::jsonb->'grant' OR g.expires_at<=clock_timestamp()
 OR g.grant_payload->>'policyVersion' IS DISTINCT FROM (SELECT policy_version FROM otr_auth_guest_composite.policy WHERE singleton)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_REAL_GRANT_REQUIRED' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(
 (((s.plan_text::jsonb#>>'{preparation,canonicalText}')::jsonb)#>>'{source,canonicalText}')::jsonb->'trips') t
 JOIN public.trips existing ON existing.id=(t#>>'{create,tripId}')::uuid)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_TRIP_COLLISION' USING ERRCODE='23505';END IF;
 IF EXISTS(SELECT 1 FROM otr_auth_guest_composite.terminal_evidence WHERE adoption_id=adoption)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_ALREADY_TERMINAL' USING ERRCODE='23505';END IF;
 INSERT INTO otr_auth_guest_composite.transaction_scopes(backend_pid,transaction_id,adoption_id) VALUES(pg_backend_pid(),pg_current_xact_id(),adoption);
END $$;
CREATE FUNCTION otr_auth_guest_composite.scope_allowed(actor uuid,trip uuid,operation uuid,kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source jsonb;t jsonb;op uuid:=operation;g record;
BEGIN
 IF NOT otr_auth_guest_composite.principal_allowed() OR NOT otr_auth_guest_composite.account_allowed(actor) OR kind NOT IN ('CREATE','METADATA','PERSON','CORE','LEDGER')
 OR (trip IS NULL AND kind NOT IN ('CREATE','METADATA'))
 THEN RETURN false;END IF;
 PERFORM 1 FROM otr_auth_guest_composite.policy WHERE singleton AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT s.plan_text,s.actor_account_id,gr.expires_at INTO g
 FROM otr_auth_guest_composite.transaction_scopes scope
 JOIN otr_auth_guest_composite.sealed_stages s USING(adoption_id)
 JOIN otr_auth_guest_composite.grants gr USING(adoption_id)
 WHERE scope.backend_pid=pg_backend_pid() AND scope.transaction_id=pg_current_xact_id_if_assigned()
 AND gr.grant_payload->>'policyVersion'=(SELECT policy_version FROM otr_auth_guest_composite.policy WHERE singleton);
 IF NOT FOUND OR g.actor_account_id IS DISTINCT FROM actor OR g.expires_at<=clock_timestamp() THEN RETURN false;END IF;
 source:=(((g.plan_text::jsonb#>>'{preparation,canonicalText}')::jsonb)#>>'{source,canonicalText}')::jsonb;
 IF kind='CORE' AND op IS NULL THEN op:=nullif(current_setting('otr.core.operation',true),'')::uuid;END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(source->'trips') LOOP
  IF trip IS NOT NULL AND t#>>'{create,tripId}' IS DISTINCT FROM trip::text THEN CONTINUE;END IF;
  IF kind='LEDGER' THEN RETURN trip IS NOT NULL;END IF;
  IF op IS NULL THEN RETURN false;END IF;
  IF kind='CREATE' AND t#>>'{create,operationId}'=op::text THEN RETURN true;END IF;
  IF kind='METADATA' AND EXISTS(SELECT 1 FROM jsonb_array_elements(t->'deferredMetadata') a WHERE a->>'operationId'=op::text) THEN RETURN true;END IF;
  IF kind='PERSON' AND EXISTS(SELECT 1 FROM jsonb_array_elements(t->'people') p WHERE p->>'operationId'=op::text) THEN RETURN true;END IF;
  IF kind='CORE' AND EXISTS(SELECT 1 FROM jsonb_array_elements(t->'coreIntents') i WHERE i#>>'{command,operationId}'=op::text) THEN RETURN true;END IF;
 END LOOP;
 RETURN false;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;
CREATE FUNCTION otr_auth_guest_composite.has_scope() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='otr_trip_core_v2_gateway' AND EXISTS(
 SELECT 1 FROM otr_auth_guest_composite.transaction_scopes
 WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id_if_assigned())
$$;
CREATE FUNCTION otr_auth_guest_composite.enter_operation(actor uuid,trip uuid,operation uuid,kind text,request jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source jsonb;t jsonb;expected jsonb;entry jsonb;
BEGIN
 IF NOT otr_auth_guest_composite.scope_allowed(actor,trip,operation,kind)
 OR kind NOT IN ('CREATE','METADATA','PERSON')
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_OPERATION_NOT_SEALED' USING ERRCODE='42501';END IF;
 SELECT (((s.plan_text::jsonb#>>'{preparation,canonicalText}')::jsonb)#>>'{source,canonicalText}')::jsonb INTO source
 FROM otr_auth_guest_composite.transaction_scopes scope JOIN otr_auth_guest_composite.sealed_stages s USING(adoption_id)
 WHERE scope.backend_pid=pg_backend_pid() AND scope.transaction_id=pg_current_xact_id_if_assigned();
 SELECT value INTO t FROM jsonb_array_elements(source->'trips') WHERE value#>>'{create,tripId}'=trip::text;
 IF kind='CREATE' THEN expected:=t->'create';
 ELSIF kind='METADATA' THEN
  SELECT value INTO entry FROM jsonb_array_elements(t->'deferredMetadata') WHERE value->>'operationId'=operation::text;
  expected:=jsonb_build_object('formatVersion',3,'operationId',operation,'tripId',trip,'before',entry->'before','after',entry->'after');
  request:=request-'expectedMetadataRevision';
 ELSE
  SELECT value INTO entry FROM jsonb_array_elements(t->'people') WHERE value->>'operationId'=operation::text;
  expected:=jsonb_build_object('version',1,'operationId',operation,'tripId',trip,'personId',entry->'personId',
  'tripCreateOperationId',t#>'{create,operationId}','dataOwnership','CLOUD_SHARED_AUTHORED','displayName',entry->'displayName');
 END IF;
 IF expected IS NULL OR request IS DISTINCT FROM expected
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_OPERATION_PAYLOAD_CHANGED' USING ERRCODE='42501';END IF;
 UPDATE otr_auth_guest_composite.transaction_scopes SET operation_kind=kind,operation_id=operation
 WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id_if_assigned();
END $$;
CREATE FUNCTION otr_auth_guest_composite.read_state_allowed(trip uuid,kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;operation uuid;
BEGIN
 SELECT s.actor_account_id,scope.operation_id INTO actor,operation
 FROM otr_auth_guest_composite.transaction_scopes scope JOIN otr_auth_guest_composite.sealed_stages s USING(adoption_id)
 WHERE scope.backend_pid=pg_backend_pid() AND scope.transaction_id=pg_current_xact_id_if_assigned() AND scope.operation_kind=kind;
 RETURN coalesce(otr_auth_guest_composite.scope_allowed(actor,trip,operation,kind),false);
END $$;
CREATE FUNCTION otr_auth_guest_composite.scope_binding(actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s record;
BEGIN
 IF NOT otr_auth_guest_composite.principal_allowed() OR NOT otr_auth_guest_composite.account_allowed(actor) THEN RAISE EXCEPTION 'AUTH_ADOPTION_SCOPE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT st.*,gr.expires_at INTO s FROM otr_auth_guest_composite.transaction_scopes scope
 JOIN otr_auth_guest_composite.sealed_stages st USING(adoption_id)
 JOIN otr_auth_guest_composite.grants gr USING(adoption_id)
 JOIN otr_auth_guest_composite.policy p ON p.singleton AND p.enabled AND p.policy_version=gr.grant_payload->>'policyVersion'
 WHERE scope.backend_pid=pg_backend_pid() AND scope.transaction_id=pg_current_xact_id_if_assigned()
 AND st.actor_account_id=actor AND gr.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_ADOPTION_SCOPE_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('actorAccountId',s.actor_account_id,'adoptionId',s.adoption_id,
 'sourceGuestLocalId',s.source_guest_local_id,'inventorySha256',s.inventory_sha256,'grantId',s.grant_id,'planSha256',s.plan_sha256);
END $$;
CREATE FUNCTION otr_auth_guest_composite.read_scope(actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding jsonb;result jsonb;
BEGIN
 binding:=otr_auth_guest_composite.scope_binding(actor);
 SELECT jsonb_build_object('planText',plan_text,'planSha256',plan_sha256) INTO result
 FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id=(binding->>'adoptionId')::uuid;
 RETURN result;
END $$;
CREATE FUNCTION otr_auth_guest_composite.assert_new_trips(actor uuid,trips jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE trip jsonb;
BEGIN
 PERFORM otr_auth_guest_composite.scope_binding(actor);
 IF jsonb_typeof(trips) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'AUTH_ADOPTION_TRIP_LIST_INVALID' USING ERRCODE='22023';END IF;
 FOR trip IN SELECT value FROM jsonb_array_elements(trips) LOOP
  IF NOT otr_auth_guest_composite.scope_allowed(actor,(trip#>>'{}')::uuid,null,'LEDGER')
  OR EXISTS(SELECT 1 FROM public.trips WHERE id=(trip#>>'{}')::uuid)
  THEN RAISE EXCEPTION 'AUTH_ADOPTION_TRIP_COLLISION' USING ERRCODE='23505';END IF;
 END LOOP;
END $$;
CREATE FUNCTION otr_auth_guest_composite.ledger_snapshot(actor uuid,trip uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NOT otr_auth_guest_composite.scope_allowed(actor,trip,null,'LEDGER') THEN RAISE EXCEPTION 'AUTH_ADOPTION_LEDGER_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('id',t.id,'title',t.name,'startDate',t.start_date,'endDate',t.end_date,
 'settlementCurrency',settings.settlement_currency,'settlementScale',settings.settlement_scale,
 'valuationPolicy',settings.valuation_policy,'updatedAt',to_char(settings.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO result
 FROM public.trips t JOIN public.ledger_settings settings ON settings.journey_id=t.id
 JOIN public.trip_create_receipts receipt ON receipt.trip_id=t.id AND receipt.actor_account_id=actor
 WHERE t.id=trip AND t.created_by=actor;
 IF result IS NULL THEN RAISE EXCEPTION 'AUTH_ADOPTION_LEDGER_UNINITIALIZED' USING ERRCODE='55000';END IF;
 RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA otr_auth_guest_composite FROM PUBLIC,anon,authenticated,service_role;
-- Exact proposed grants, exercised only in the disposable fixture. No table grants.
GRANT USAGE ON SCHEMA otr_auth_guest_composite TO otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION otr_auth_guest_composite.confirm_and_issue(uuid,jsonb,boolean),
 otr_auth_guest_composite.seal_stage(uuid,text,text),otr_auth_guest_composite.begin_scope(uuid,uuid,text),
 otr_auth_guest_composite.scope_allowed(uuid,uuid,uuid,text),otr_auth_guest_composite.scope_binding(uuid),
 otr_auth_guest_composite.read_scope(uuid),otr_auth_guest_composite.assert_new_trips(uuid,jsonb),
 otr_auth_guest_composite.ledger_snapshot(uuid,uuid) TO otr_trip_core_v2_gateway;
GRANT EXECUTE ON FUNCTION otr_auth_guest_composite.scope_allowed(uuid,uuid,uuid,text) TO otr_trip_core_v2_writer;
COMMIT;
