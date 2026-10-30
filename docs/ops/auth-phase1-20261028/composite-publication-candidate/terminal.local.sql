-- LOCAL DISPOSABLE CANDIDATE ONLY. Evidence storage, not publication authority.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^otr_auth_composite_[a-f0-9]{12}$'
    OR current_setting('otr.auth.composite_fixture',true) IS DISTINCT FROM 'LOCAL_DISPOSABLE'
 THEN RAISE EXCEPTION 'AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED'; END IF;
END $$;
CREATE TABLE otr_auth_guest_composite.terminal_evidence (
 adoption_id uuid PRIMARY KEY REFERENCES otr_auth_guest_composite.sealed_stages(adoption_id),
 receipt_id uuid NOT NULL UNIQUE,
 outcome text NOT NULL CHECK(outcome IN ('PUBLISHED','CANCELLED')),
 evidence_text text NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(evidence_sha256=encode(sha256(convert_to(evidence_text,'UTF8')),'hex'))
);
ALTER TABLE otr_auth_guest_composite.terminal_evidence OWNER TO postgres;
ALTER TABLE otr_auth_guest_composite.terminal_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE otr_auth_guest_composite.terminal_evidence FROM PUBLIC;
CREATE FUNCTION otr_auth_guest_composite.guard_terminal_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE stage otr_auth_guest_composite.sealed_stages%rowtype;e jsonb;b jsonb;x jsonb;
BEGIN
 IF TG_OP<>'INSERT' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'AUTH_COMPOSITE_TERMINAL_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 -- Publication and cancellation must contend on the exact same durable stage.
 SELECT * INTO stage FROM otr_auth_guest_composite.sealed_stages
 WHERE adoption_id=NEW.adoption_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_COMPOSITE_STAGE_REQUIRED' USING ERRCODE='23514';END IF;
 e:=NEW.evidence_text::jsonb;b:=e->'binding';
 IF e->>'schemaId' IS DISTINCT FROM 'otr.auth.guest-composite-terminal-evidence/1'
 OR e->>'authority' IS DISTINCT FROM 'NONE'
 OR e->>'outcome' IS DISTINCT FROM NEW.outcome
 OR e->>'receiptId' IS DISTINCT FROM NEW.receipt_id::text
 OR e-ARRAY['schemaId','authority','outcome','receiptId','binding','execution']<>'{}'::jsonb
 OR b IS DISTINCT FROM jsonb_build_object(
  'actorAccountId',stage.actor_account_id,'adoptionId',stage.adoption_id,
  'sourceGuestLocalId',stage.source_guest_local_id,'inventorySha256',stage.inventory_sha256,
  'grantId',stage.grant_id,'planSha256',stage.plan_sha256)
 THEN RAISE EXCEPTION 'AUTH_COMPOSITE_TERMINAL_BINDING' USING ERRCODE='23514';END IF;
 IF NEW.outcome='CANCELLED' THEN
  IF e->'execution' IS DISTINCT FROM 'null'::jsonb THEN
   RAISE EXCEPTION 'AUTH_COMPOSITE_CANCEL_EXECUTION_FORBIDDEN' USING ERRCODE='23514';END IF;
 ELSE
  x:=e->'execution';
  IF jsonb_typeof(x) IS DISTINCT FROM 'object'
  OR x-ARRAY['canonicalText','sha256']<>'{}'::jsonb
  OR x->>'sha256' IS DISTINCT FROM encode(sha256(convert_to(x->>'canonicalText','UTF8')),'hex')
  OR x->>'canonicalText' IS NULL
  THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXECUTION_HASH' USING ERRCODE='23514';END IF;
  x:=(x->>'canonicalText')::jsonb;
  IF x->>'schemaId' IS DISTINCT FROM 'otr.auth.guest-composite-execution/1'
  OR x->>'authority' IS DISTINCT FROM 'NONE' OR x->'binding' IS DISTINCT FROM b
  OR x->>'localRestoreStatus' IS DISTINCT FROM 'REQUIRED_NOT_EXECUTED'
  THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXECUTION_BINDING' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION otr_auth_guest_composite.guard_terminal_evidence() OWNER TO postgres;
REVOKE ALL ON FUNCTION otr_auth_guest_composite.guard_terminal_evidence() FROM PUBLIC;
CREATE TRIGGER immutable_terminal_evidence BEFORE INSERT OR UPDATE OR DELETE
 ON otr_auth_guest_composite.terminal_evidence FOR EACH ROW
 EXECUTE FUNCTION otr_auth_guest_composite.guard_terminal_evidence();
CREATE TRIGGER no_truncate_terminal_evidence BEFORE TRUNCATE
 ON otr_auth_guest_composite.terminal_evidence FOR EACH STATEMENT
 EXECUTE FUNCTION otr_auth_guest_composite.guard_terminal_evidence();
-- No RPC, runtime grants, business writes, grant issuer or source-release receipt.
COMMIT;
