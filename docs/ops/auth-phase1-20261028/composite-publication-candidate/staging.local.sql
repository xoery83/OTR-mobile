-- LOCAL DISPOSABLE PG CANDIDATE ONLY. No Hosted install, runtime grant or publisher.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^otr_auth_composite_[a-f0-9]{12}$'
    OR current_setting('otr.auth.composite_fixture',true) IS DISTINCT FROM 'LOCAL_DISPOSABLE'
 THEN RAISE EXCEPTION 'AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED'; END IF;
END $$;
CREATE SCHEMA otr_auth_guest_composite AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA otr_auth_guest_composite FROM PUBLIC;
CREATE TABLE otr_auth_guest_composite.sealed_stages (
 adoption_id uuid PRIMARY KEY,
 actor_account_id uuid NOT NULL,
 source_guest_local_id uuid NOT NULL,
 grant_id uuid NOT NULL UNIQUE,
 inventory_sha256 text NOT NULL CHECK(inventory_sha256 ~ '^[0-9a-f]{64}$'),
 preparation_sha256 text NOT NULL CHECK(preparation_sha256 ~ '^[0-9a-f]{64}$'),
 plan_sha256 text NOT NULL CHECK(plan_sha256 ~ '^[0-9a-f]{64}$'),
 plan_text text NOT NULL,
 staged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(plan_sha256=encode(sha256(convert_to(plan_text,'UTF8')),'hex')),
 CHECK((plan_text::jsonb->>'schemaId') IS NOT DISTINCT FROM 'otr.auth.guest-composite-plan/1'),
 CHECK((plan_text::jsonb->>'authority') IS NOT DISTINCT FROM 'NONE'),
 CHECK((plan_text::jsonb#>>'{grant,adoptionId}') IS NOT DISTINCT FROM adoption_id::text),
 CHECK((plan_text::jsonb#>>'{grant,targetAccountId}') IS NOT DISTINCT FROM actor_account_id::text),
 CHECK((plan_text::jsonb#>>'{grant,sourceGuestLocalId}') IS NOT DISTINCT FROM source_guest_local_id::text),
 CHECK((plan_text::jsonb#>>'{grant,grantId}') IS NOT DISTINCT FROM grant_id::text),
 CHECK((plan_text::jsonb#>>'{grant,inventorySha256}') IS NOT DISTINCT FROM inventory_sha256),
 CHECK((plan_text::jsonb#>>'{preparation,sha256}') IS NOT DISTINCT FROM preparation_sha256),
 CHECK(preparation_sha256 IS NOT DISTINCT FROM encode(sha256(convert_to(plan_text::jsonb#>>'{preparation,canonicalText}','UTF8')),'hex'))
);
ALTER TABLE otr_auth_guest_composite.sealed_stages OWNER TO postgres;
ALTER TABLE otr_auth_guest_composite.sealed_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE otr_auth_guest_composite.sealed_stages FROM PUBLIC;
CREATE FUNCTION otr_auth_guest_composite.reject_stage_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'AUTH_COMPOSITE_STAGE_IMMUTABLE' USING ERRCODE='23514'; END $$;
ALTER FUNCTION otr_auth_guest_composite.reject_stage_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION otr_auth_guest_composite.reject_stage_mutation() FROM PUBLIC;
CREATE TRIGGER immutable_stage BEFORE UPDATE OR DELETE ON otr_auth_guest_composite.sealed_stages
FOR EACH ROW EXECUTE FUNCTION otr_auth_guest_composite.reject_stage_mutation();
-- Deliberately no RPC, gateway grants, role changes, terminal outcomes or business writes.
COMMIT;
