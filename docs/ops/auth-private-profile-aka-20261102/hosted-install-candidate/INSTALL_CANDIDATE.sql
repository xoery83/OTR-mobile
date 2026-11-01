-- Candidate only. No execution approval and no runtime activation.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $gate$
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.private_profile_gate',true) IS DISTINCT FROM 'OTR_PRIVATE_PROFILE_AKA_DEV_INSTALL_20261102_V1'
 THEN RAISE EXCEPTION 'PRIVATE_PROFILE_EXACT_DEV_GATE_REQUIRED'; END IF;
 IF to_regclass('public.account_private_profiles') IS NOT NULL
 OR to_regclass('public.account_private_profile_receipts') IS NOT NULL
 OR to_regprocedure('public.account_private_profile_actor()') IS NOT NULL
 OR to_regprocedure('public.account_private_profile_save(uuid,bigint,jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION 'PRIVATE_PROFILE_EXPECTED_ABSENT_RECONCILE_NO_REINSTALL'; END IF;
 IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL
 OR to_regclass('auth.users') IS NULL
 THEN RAISE EXCEPTION 'PRIVATE_PROFILE_AUTH_DEPENDENCY_REQUIRED'; END IF;
END $gate$;
-- Candidate only. Reuses existing private Profile schema/function; not authorized for installation.
-- Candidate only: new private tables/RLS/GRANT require the exact Owner DEV Gate.
CREATE TABLE public.account_private_profiles (
 account_id uuid PRIMARY KEY REFERENCES auth.users(id),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 fields_json jsonb NOT NULL CHECK(jsonb_typeof(fields_json)='object'),
 updated_at timestamptz NOT NULL
);
CREATE TABLE public.account_private_profile_receipts (
 account_id uuid NOT NULL REFERENCES auth.users(id),operation_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL,PRIMARY KEY(account_id,operation_id)
);
ALTER TABLE public.account_private_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_private_profile_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_private_profiles,public.account_private_profile_receipts
 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_private_profiles,public.account_private_profile_receipts TO authenticated;
-- One bounded self-subject predicate for private reads and saves; no identity is created.
CREATE FUNCTION public.account_private_profile_actor()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT u.id FROM auth.users u WHERE u.id=auth.uid() AND u.is_anonymous IS FALSE
   AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
   AND (auth.jwt()->'client_id' IS NULL OR auth.jwt()->'client_id'='null'::jsonb)
   AND NOT (coalesce(auth.jwt(),'{}'::jsonb)?'otr_scopes')
   AND NOT (coalesce(auth.jwt()->'aud','null'::jsonb) @> '"https://api-dev.xoery.art/mcp"'::jsonb)
$$;
ALTER FUNCTION public.account_private_profile_actor() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_private_profile_actor() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.account_private_profile_actor() TO authenticated;
CREATE POLICY account_private_profile_self_read ON public.account_private_profiles
 FOR SELECT TO authenticated USING(account_id=public.account_private_profile_actor());
CREATE POLICY account_private_profile_receipt_self_read ON public.account_private_profile_receipts
 FOR SELECT TO authenticated USING(account_id=public.account_private_profile_actor());

CREATE FUNCTION public.account_private_profile_save(p_operation uuid,p_expected_revision bigint,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=public.account_private_profile_actor();r record;old_revision bigint;fields jsonb;v jsonb;
 fingerprint text;instant timestamptz;
BEGIN
 IF actor IS NULL THEN
  RAISE EXCEPTION 'PROFILE_NORMAL_ACCOUNT_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_operation IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
 OR p_expected_revision>=9007199254740991 OR p_changes IS NULL
 OR jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb
 OR octet_length(p_changes::text)>16384
 OR p_changes-ARRAY['displayName','travelDocumentName','globalAka']<>'{}'::jsonb THEN
  RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_changes?'displayName' AND jsonb_typeof(p_changes->'displayName') NOT IN ('string','null') THEN
  RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_changes?'globalAka' THEN
  IF jsonb_typeof(p_changes->'globalAka')<>'array' THEN
   RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_changes->'globalAka') value
    WHERE jsonb_typeof(value)<>'string') THEN
   RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
  END IF;
 END IF;
 IF p_changes?'travelDocumentName' AND p_changes->'travelDocumentName'<>'null'::jsonb THEN
  v:=p_changes->'travelDocumentName';
  IF jsonb_typeof(v)<>'object' OR NOT v?'mode' OR jsonb_typeof(v->'mode')<>'string' THEN
   RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
  END IF;
  IF v->>'mode'='SPLIT' THEN
   IF NOT v?&ARRAY['mode','familyName','givenNames'] OR v-ARRAY['mode','familyName','givenNames']<>'{}'::jsonb
   OR jsonb_typeof(v->'familyName') NOT IN ('string','null')
   OR jsonb_typeof(v->'givenNames') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
   END IF;
  ELSIF v->>'mode'='UNSPLIT' THEN
   IF NOT v?&ARRAY['mode','fullName'] OR v-ARRAY['mode','fullName']<>'{}'::jsonb
   OR jsonb_typeof(v->'fullName')<>'string' THEN
    RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
   END IF;
  ELSE RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';END IF;
 END IF;
 -- Server-owned semantic fingerprint; no plaintext name history in receipts.
 fingerprint:=encode(sha256(convert_to(jsonb_build_object(
   'expectedRevision',p_expected_revision,'changes',p_changes)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('otr.private-profile:'||actor::text,0));
 SELECT * INTO r FROM public.account_private_profile_receipts
  WHERE account_id=actor AND operation_id=p_operation;
 IF FOUND THEN
  IF r.request_sha256<>fingerprint THEN
   RAISE EXCEPTION 'PROFILE_OPERATION_COLLISION' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('schemaId','otr.auth.private-profile-receipt/1',
   'accountId',actor,'operationId',p_operation,'revision',r.revision,'recordedAt',r.recorded_at);
 END IF;
 SELECT revision,fields_json INTO old_revision,fields FROM public.account_private_profiles
  WHERE account_id=actor FOR UPDATE;
 IF NOT FOUND THEN old_revision:=0;fields:='{}'::jsonb;END IF;
 IF old_revision<>p_expected_revision THEN
  RAISE EXCEPTION 'PROFILE_CONFLICT' USING ERRCODE='40001';
 END IF;
 instant:=clock_timestamp();fields:=fields||p_changes;
 INSERT INTO public.account_private_profiles(account_id,revision,fields_json,updated_at)
  VALUES(actor,old_revision+1,fields,instant)
  ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision,
   fields_json=excluded.fields_json,updated_at=excluded.updated_at;
 INSERT INTO public.account_private_profile_receipts
  (account_id,operation_id,revision,request_sha256,recorded_at)
  VALUES(actor,p_operation,old_revision+1,fingerprint,instant);
 RETURN jsonb_build_object('schemaId','otr.auth.private-profile-receipt/1',
  'accountId',actor,'operationId',p_operation,'revision',old_revision+1,'recordedAt',instant);
END $$;
ALTER FUNCTION public.account_private_profile_save(uuid,bigint,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_private_profile_save(uuid,bigint,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.account_private_profile_save(uuid,bigint,jsonb) TO authenticated;

DO $verify$
DECLARE object_count integer;
BEGIN
 SELECT count(*) INTO object_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('account_private_profiles','account_private_profile_receipts')
 AND c.relkind='r' AND c.relowner='postgres'::regrole AND c.relrowsecurity;
 IF object_count<>2 OR EXISTS(
  SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE c.oid IN ('public.account_private_profiles'::regclass,'public.account_private_profile_receipts'::regclass)
  AND (a.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole)
   OR (a.grantee='authenticated'::regrole AND (a.privilege_type<>'SELECT' OR a.is_grantable))))
 THEN RAISE EXCEPTION 'PRIVATE_PROFILE_TABLE_PRIVILEGE_POSTCONDITION'; END IF;
 SELECT count(*) INTO object_count FROM pg_proc p WHERE p.oid IN (
 'public.account_private_profile_actor()'::regprocedure,
 'public.account_private_profile_save(uuid,bigint,jsonb)'::regprocedure)
 AND p.proowner='postgres'::regrole AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'];
 IF object_count<>2 OR EXISTS(
  SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid IN (
   'public.account_private_profile_actor()'::regprocedure,
   'public.account_private_profile_save(uuid,bigint,jsonb)'::regprocedure)
  AND (a.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole)
   OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
 THEN RAISE EXCEPTION 'PRIVATE_PROFILE_FUNCTION_PRIVILEGE_POSTCONDITION'; END IF;
 IF NOT has_table_privilege('authenticated','public.account_private_profiles','SELECT')
 OR NOT has_table_privilege('authenticated','public.account_private_profile_receipts','SELECT')
 OR NOT has_function_privilege('authenticated','public.account_private_profile_actor()','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.account_private_profile_save(uuid,bigint,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'PRIVATE_PROFILE_SELF_ACCESS_POSTCONDITION'; END IF;
 SELECT count(*) INTO object_count FROM pg_policy WHERE polrelid IN (
 'public.account_private_profiles'::regclass,'public.account_private_profile_receipts'::regclass)
 AND polcmd='r' AND polroles=ARRAY['authenticated'::regrole::oid];
 IF object_count<>2 THEN RAISE EXCEPTION 'PRIVATE_PROFILE_POLICY_POSTCONDITION'; END IF;
END $verify$;
COMMIT;
