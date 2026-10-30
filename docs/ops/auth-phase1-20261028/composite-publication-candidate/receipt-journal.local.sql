-- DISPOSABLE PG ONLY. Cancellation/read candidate; no publication authority.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^otr_auth_composite_[a-f0-9]{12}$'
 OR current_setting('otr.auth.composite_fixture',true) IS DISTINCT FROM 'LOCAL_DISPOSABLE'
 THEN RAISE EXCEPTION 'AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED';END IF;
END $$;
CREATE TABLE otr_auth_guest_composite.terminal_receipts (
 adoption_id uuid PRIMARY KEY REFERENCES otr_auth_guest_composite.grants(adoption_id),
 receipt_id uuid NOT NULL UNIQUE,
 outcome text NOT NULL CHECK(outcome='CANCELLED'),
 receipt_text text NOT NULL CHECK(octet_length(receipt_text)<=1048576),
 receipt_sha256 text NOT NULL CHECK(receipt_sha256 ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL,
 CHECK(receipt_text=public.trip_event_canonical_json(receipt_text::json,0)),
 CHECK(receipt_sha256=encode(sha256(convert_to('otr-auth-guest-adoption-receipt-v1'||chr(10)||
 public.trip_event_canonical_json((receipt_text::jsonb-'receiptSha256')::json,0),'UTF8')),'hex')),
 CHECK(receipt_text::jsonb->>'receiptSha256' IS NOT DISTINCT FROM receipt_sha256),
 CHECK(receipt_text::jsonb->>'receiptId' IS NOT DISTINCT FROM receipt_id::text),
 CHECK(receipt_text::jsonb->>'adoptionId' IS NOT DISTINCT FROM adoption_id::text),
 CHECK(receipt_text::jsonb->>'outcome' IS NOT DISTINCT FROM outcome)
);
ALTER TABLE otr_auth_guest_composite.terminal_receipts OWNER TO postgres;
ALTER TABLE otr_auth_guest_composite.terminal_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE otr_auth_guest_composite.terminal_receipts FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
CREATE TRIGGER immutable_terminal_receipt BEFORE UPDATE OR DELETE
 ON otr_auth_guest_composite.terminal_receipts FOR EACH ROW
 EXECUTE FUNCTION otr_auth_guest_composite.reject_stage_mutation();
CREATE TRIGGER no_truncate_terminal_receipt BEFORE TRUNCATE
 ON otr_auth_guest_composite.terminal_receipts FOR EACH STATEMENT
 EXECUTE FUNCTION otr_auth_guest_composite.reject_stage_mutation();
CREATE FUNCTION otr_auth_guest_composite.receipt_request_grant(actor uuid,request jsonb)
RETURNS otr_auth_guest_composite.grants LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g otr_auth_guest_composite.grants%rowtype;
BEGIN
 IF NOT otr_auth_guest_composite.principal_allowed() OR NOT otr_auth_guest_composite.account_allowed(actor)
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_RECOVERY_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(request) IS DISTINCT FROM 'object'
 OR NOT request ?& ARRAY['contractVersion','adoptionId','sourceGuestLocalId','targetAccountId','inventorySha256']
 OR request-ARRAY['contractVersion','adoptionId','sourceGuestLocalId','targetAccountId','inventorySha256']<>'{}'::jsonb
 OR request->'contractVersion' IS DISTINCT FROM '1'::jsonb
 OR request->>'targetAccountId' IS DISTINCT FROM actor::text
 OR pg_input_is_valid(request->>'adoptionId','uuid') IS DISTINCT FROM true
 OR pg_input_is_valid(request->>'sourceGuestLocalId','uuid') IS DISTINCT FROM true
 OR jsonb_typeof(request->'inventorySha256') IS DISTINCT FROM 'string'
 OR request->>'inventorySha256' !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_RECOVERY_INVALID' USING ERRCODE='22023';END IF;
 SELECT * INTO g FROM otr_auth_guest_composite.grants WHERE adoption_id=(request->>'adoptionId')::uuid;
 IF FOUND AND (g.actor_account_id IS DISTINCT FROM actor
 OR g.source_guest_local_id::text IS DISTINCT FROM request->>'sourceGuestLocalId'
 OR g.inventory_sha256 IS DISTINCT FROM request->>'inventorySha256')
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_RECOVERY_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN g;
END $$;
CREATE FUNCTION otr_auth_guest_composite.cancel(actor uuid,request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g otr_auth_guest_composite.grants%rowtype;s otr_auth_guest_composite.sealed_stages%rowtype;
 r otr_auth_guest_composite.terminal_receipts%rowtype;body jsonb;receipt jsonb;digest text;instant timestamptz;
BEGIN
 -- Validate before taking a caller-selected lock; repeat the binding after locking.
 g:=otr_auth_guest_composite.receipt_request_grant(actor,request);
 IF g.adoption_id IS NULL THEN RAISE EXCEPTION 'AUTH_ADOPTION_REAL_GRANT_REQUIRED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-auth-adoption:'||g.adoption_id::text,0));
 g:=otr_auth_guest_composite.receipt_request_grant(actor,request);
 SELECT * INTO r FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id=g.adoption_id;
 IF FOUND THEN RETURN r.receipt_text::jsonb;END IF;
 SELECT * INTO s FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id=g.adoption_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM otr_auth_guest_composite.transaction_scopes WHERE adoption_id=g.adoption_id)
 OR EXISTS(SELECT 1 FROM otr_auth_guest_composite.terminal_evidence WHERE adoption_id=g.adoption_id)
 OR (s.adoption_id IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(
 (((s.plan_text::jsonb#>>'{preparation,canonicalText}')::jsonb)#>>'{source,canonicalText}')::jsonb->'trips') t
 JOIN public.trips existing ON existing.id=(t#>>'{create,tripId}')::uuid))
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_CANCEL_PUBLICATION_UNRESOLVED' USING ERRCODE='55000';END IF;
 instant:=clock_timestamp();
 body:=request||jsonb_build_object('schemaId','otr.auth.guest-adoption-receipt/1',
 'receiptId',gen_random_uuid(),'grantId',g.grant_id,'policyVersion',g.grant_payload->>'policyVersion',
 'recordedAt',to_char(instant AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'outcome','CANCELLED','preparationSha256',s.preparation_sha256,'planSha256',s.plan_sha256);
 digest:=encode(sha256(convert_to('otr-auth-guest-adoption-receipt-v1'||chr(10)||public.trip_event_canonical_json(body::json,0),'UTF8')),'hex');
 receipt:=body||jsonb_build_object('receiptSha256',digest);
 INSERT INTO otr_auth_guest_composite.terminal_receipts VALUES(g.adoption_id,(body->>'receiptId')::uuid,
 'CANCELLED',public.trip_event_canonical_json(receipt::json,0),digest,instant);
 RETURN receipt;
END $$;
CREATE FUNCTION otr_auth_guest_composite.status(actor uuid,request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g otr_auth_guest_composite.grants%rowtype;r otr_auth_guest_composite.terminal_receipts%rowtype;
BEGIN
 g:=otr_auth_guest_composite.receipt_request_grant(actor,request);
 SELECT * INTO r FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id=g.adoption_id;
 IF FOUND THEN RETURN request||jsonb_build_object('status',r.outcome,
 'nextAction',CASE WHEN r.outcome='CANCELLED' THEN 'READ_CANCELLATION_RECEIPT' ELSE 'READ_PUBLICATION_RECEIPT' END,
 'receipt',jsonb_build_object('receiptId',r.receipt_id,'receiptSha256',r.receipt_sha256));END IF;
 RETURN request||jsonb_build_object('status',CASE WHEN g.adoption_id IS NULL THEN 'NOT_FOUND' ELSE 'IN_PROGRESS' END,'nextAction','QUERY_SERVER_STATUS');
END $$;
CREATE FUNCTION otr_auth_guest_composite.receipt(actor uuid,request jsonb,receipt_id uuid,receipt_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g otr_auth_guest_composite.grants%rowtype;r otr_auth_guest_composite.terminal_receipts%rowtype;
BEGIN
 g:=otr_auth_guest_composite.receipt_request_grant(actor,request);
 SELECT * INTO r FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id=g.adoption_id;
 IF NOT FOUND OR r.receipt_id IS DISTINCT FROM receipt_id OR r.receipt_sha256 IS DISTINCT FROM receipt_hash
 THEN RAISE EXCEPTION 'AUTH_ADOPTION_RECEIPT_NOT_FOUND' USING ERRCODE='42501';END IF;
 RETURN r.receipt_text::jsonb;
END $$;
ALTER FUNCTION otr_auth_guest_composite.receipt_request_grant(uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION otr_auth_guest_composite.cancel(uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION otr_auth_guest_composite.status(uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION otr_auth_guest_composite.receipt(uuid,jsonb,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION otr_auth_guest_composite.receipt_request_grant(uuid,jsonb),
 otr_auth_guest_composite.cancel(uuid,jsonb),otr_auth_guest_composite.status(uuid,jsonb),
 otr_auth_guest_composite.receipt(uuid,jsonb,uuid,text) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION otr_auth_guest_composite.cancel(uuid,jsonb),otr_auth_guest_composite.status(uuid,jsonb),
 otr_auth_guest_composite.receipt(uuid,jsonb,uuid,text) TO otr_trip_core_v2_gateway;
COMMIT;
