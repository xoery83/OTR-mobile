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
CREATE POLICY account_private_profile_self_read ON public.account_private_profiles
 FOR SELECT TO authenticated USING(account_id=auth.uid());
CREATE POLICY account_private_profile_receipt_self_read ON public.account_private_profile_receipts
 FOR SELECT TO authenticated USING(account_id=auth.uid());

CREATE FUNCTION public.account_private_profile_save(p_operation uuid,p_expected_revision bigint,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();r record;old_revision bigint;fields jsonb;v jsonb;
 fingerprint text;instant timestamptz;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=actor
   AND u.is_anonymous IS FALSE AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())) THEN
  RAISE EXCEPTION 'PROFILE_NORMAL_ACCOUNT_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_operation IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
 OR p_expected_revision>=9007199254740991 OR p_changes IS NULL
 OR jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb
 OR octet_length(p_changes::text)>16384
 OR p_changes-ARRAY['displayName','travelDocumentName']<>'{}'::jsonb THEN
  RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_changes?'displayName' AND jsonb_typeof(p_changes->'displayName') NOT IN ('string','null') THEN
  RAISE EXCEPTION 'PROFILE_INVALID' USING ERRCODE='22023';
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
