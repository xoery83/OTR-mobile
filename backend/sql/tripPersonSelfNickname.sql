-- SOURCE CANDIDATE ONLY. Not a qualified Root2 installer or an execution Gate.
-- No credential, role, existing function replacement or Runtime activation.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
DO $pre$ BEGIN
 IF current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.core.self_nickname_install_gate',true) IS DISTINCT FROM 'OTR_SELF_NICKNAME_V1_DEFAULT_CLOSED'
 THEN RAISE EXCEPTION 'SELF_NICKNAME_EXACT_INSTALL_REQUIRED' USING ERRCODE='42501';END IF;
 IF to_regprocedure('public.trip_person_self_nickname(uuid,uuid,uuid,text,jsonb)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.journey_members'::regclass AND attname='nickname_revision' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'SELF_NICKNAME_INSTALL_DRIFT';END IF;
 -- Existing normal authenticated Gateway/read admission is an explicit dependency.
 IF to_regprocedure('public.trip_sustained_core_read_scope_allowed(uuid,uuid)') IS NULL
 OR to_regprocedure('public.trip_person_hash(text,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'SELF_NICKNAME_PARENT_MISSING';END IF;
END $pre$;
ALTER TABLE public.journey_members ADD COLUMN nickname_revision bigint NOT NULL DEFAULT 0
 CHECK(nickname_revision BETWEEN 0 AND 9007199254740991);
ALTER TABLE public.trip_core_activation_gate ADD COLUMN self_nickname_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.trip_person_nickname_receipts (
 actor_account_id uuid NOT NULL, operation_id uuid NOT NULL, trip_id uuid NOT NULL, person_id uuid NOT NULL,
 request_payload jsonb NOT NULL, result_payload jsonb NOT NULL,
 transaction_id bigint NOT NULL, accepted_at timestamptz NOT NULL,
 PRIMARY KEY(actor_account_id,operation_id),
 CHECK(jsonb_typeof(request_payload)='object' AND jsonb_typeof(result_payload)='object')
);
ALTER TABLE public.trip_person_nickname_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_person_nickname_receipts FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;

CREATE FUNCTION public.trip_person_nickname_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' OR current_user<>'postgres' OR session_user<>'otr_trip_core_v2_gateway'
 OR NEW.transaction_id<>txid_current()
 THEN RAISE EXCEPTION 'SELF_NICKNAME_RECEIPT_IMMUTABLE' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trip_person_nickname_receipt_guard() FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
CREATE TRIGGER nickname_receipt_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.trip_person_nickname_receipts FOR EACH ROW EXECUTE FUNCTION public.trip_person_nickname_receipt_guard();
CREATE TRIGGER nickname_receipt_no_truncate BEFORE TRUNCATE ON public.trip_person_nickname_receipts FOR EACH STATEMENT EXECUTE FUNCTION public.trip_person_nickname_receipt_guard();

-- Counter and authorization guard are deliberately separate from any Profile/Claim
-- naming policy. An existing writer may link/alter notes/participation unchanged;
-- a legacy writer changing the nickname without the owning receipt is rejected.
CREATE FUNCTION public.trip_person_nickname_transition_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.nickname_revision<>0 THEN RAISE EXCEPTION 'SELF_NICKNAME_INITIAL_REVISION';END IF;
  RETURN NEW;
 END IF;
 IF NEW.nickname_revision IS DISTINCT FROM OLD.nickname_revision THEN RAISE EXCEPTION 'SELF_NICKNAME_REVISION_WRITE_FORBIDDEN';END IF;
 IF NEW.display_name IS NOT DISTINCT FROM OLD.display_name THEN RETURN NEW;END IF;
 IF OLD.nickname_revision>=9007199254740991 THEN RAISE EXCEPTION 'SELF_NICKNAME_REVISION_EXHAUSTED';END IF;
 -- Retain existing unlinked/first-Claim ACL: this trigger adds no privilege.
 IF OLD.status IN ('unlinked','invite_pending') THEN
  NEW.nickname_revision:=OLD.nickname_revision+1;
  RETURN NEW;
 END IF;
 IF session_user<>'otr_trip_core_v2_gateway' OR NEW.id<>OLD.id OR NEW.trip_id<>OLD.trip_id
 OR NOT EXISTS(SELECT 1 FROM public.trip_person_nickname_receipts r
  WHERE r.transaction_id=txid_current() AND r.trip_id=OLD.trip_id AND r.person_id=OLD.id
   AND r.actor_account_id=OLD.user_id AND OLD.status='linked' AND NEW.user_id=OLD.user_id AND NEW.status='linked'
   AND r.result_payload->>'outcome'='APPLIED'
   AND r.result_payload#>'{prior,nickname}' IS NOT DISTINCT FROM coalesce(to_jsonb(nullif(OLD.display_name,'')),'null'::jsonb)
   AND (r.result_payload#>>'{prior,nicknameRevision}')::bigint=OLD.nickname_revision
   AND r.result_payload#>'{resulting,nickname}' IS NOT DISTINCT FROM coalesce(to_jsonb(nullif(NEW.display_name,'')),'null'::jsonb)
   AND (r.result_payload#>>'{resulting,nicknameRevision}')::bigint=OLD.nickname_revision+1)
 THEN RAISE EXCEPTION 'SELF_NICKNAME_OWNING_RECEIPT_REQUIRED' USING ERRCODE='42501';END IF;
 NEW.nickname_revision:=OLD.nickname_revision+1;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trip_person_nickname_transition_guard() FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
CREATE TRIGGER person_nickname_revision BEFORE INSERT OR UPDATE ON public.journey_members FOR EACH ROW EXECUTE FUNCTION public.trip_person_nickname_transition_guard();

CREATE FUNCTION public.trip_person_nickname_write_scope(actor uuid, trip uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE gate public.trip_core_activation_gate;
BEGIN
 IF current_user<>'postgres' OR session_user<>'otr_trip_core_v2_gateway' THEN RETURN false;END IF;
 SELECT * INTO gate FROM public.trip_core_activation_gate WHERE singleton FOR SHARE;
 RETURN coalesce(gate.self_nickname_enabled AND gate.scope_actor_account_id=actor AND gate.scope_trip_id=trip
  AND isfinite(gate.scope_started_at) AND isfinite(gate.scope_expires_at)
  AND clock_timestamp()>=gate.scope_started_at AND clock_timestamp()<gate.scope_expires_at,false);
END $$;
REVOKE ALL ON FUNCTION public.trip_person_nickname_write_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;

CREATE FUNCTION public.trip_person_self_nickname(actor uuid, trip uuid, person uuid, method text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' SET DateStyle='ISO, YMD' AS $$
DECLARE target public.journey_members; old_receipt public.trip_person_nickname_receipts;
 op uuid; expected bigint; desired text; digest text; outcome text; result jsonb;
 prior_pair jsonb; resulting_pair jsonb; at_time timestamptz; f text;
 -- ECMAScript trim whitespace; no normalization/case folding.
 trim_chars text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF current_user<>'postgres' OR session_user<>'otr_trip_core_v2_gateway'
 OR actor IS NULL OR trip IS NULL OR person IS NULL OR method IS NULL OR method NOT IN ('READ','EXECUTE','RECEIPT')
 OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'SELF_NICKNAME_FORBIDDEN' USING ERRCODE='42501';END IF;
 -- Same Trip row lock as approved Claim/Member Revoke; no stale self link write.
 IF method='EXECUTE' THEN PERFORM 1 FROM public.trips WHERE id=trip FOR UPDATE;
 ELSE PERFORM 1 FROM public.trips WHERE id=trip FOR SHARE;END IF;
 IF NOT FOUND OR public.trip_sustained_core_read_scope_allowed(actor,trip) IS NOT TRUE
 THEN RAISE EXCEPTION 'SELF_NICKNAME_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO target FROM public.journey_members WHERE id=person AND trip_id=trip AND user_id=actor AND status='linked' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SELF_NICKNAME_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF method='READ' THEN
  IF payload<>'{}'::jsonb THEN RAISE EXCEPTION 'SELF_NICKNAME_INVALID' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('contractVersion',1,'accountId',actor,'tripId',trip,'personId',person,
   'nickname',nullif(target.display_name,''),'nicknameRevision',target.nickname_revision,'observedAt',public.trip_event_utc_timestamp(clock_timestamp()));
 END IF;
 IF method='RECEIPT' THEN
  IF public.trip_event_keys(payload,ARRAY['operationId','intentDigest']) IS NOT TRUE
   OR jsonb_typeof(payload->'operationId') IS DISTINCT FROM 'string'
   OR payload->>'operationId' !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
   OR jsonb_typeof(payload->'intentDigest') IS DISTINCT FROM 'string' OR payload->>'intentDigest' !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'SELF_NICKNAME_INVALID' USING ERRCODE='22023';END IF;
  op:=(payload->>'operationId')::uuid;
  SELECT * INTO old_receipt FROM public.trip_person_nickname_receipts WHERE actor_account_id=actor AND operation_id=op;
  IF NOT FOUND THEN RETURN jsonb_build_object('kind','ABSENT_UNCONFIRMED');END IF;
  IF old_receipt.trip_id<>trip OR old_receipt.person_id<>person OR old_receipt.request_payload->>'intentDigest' IS DISTINCT FROM payload->>'intentDigest'
  THEN RAISE EXCEPTION 'SELF_NICKNAME_OPERATION_REUSED' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('kind','EXACT_RECEIPT','receipt',old_receipt.result_payload);
 END IF;
 IF public.trip_event_keys(payload,ARRAY['contractVersion','command','operationId','tripId','personId','expectedNicknameRevision','nickname','intentDigest']) IS NOT TRUE
 OR payload->'contractVersion' IS DISTINCT FROM '1'::jsonb OR payload->>'command' IS DISTINCT FROM 'SET_SELF_TRIP_NICKNAME'
 OR payload->>'tripId' IS DISTINCT FROM trip::text OR payload->>'personId' IS DISTINCT FROM person::text
 OR jsonb_typeof(payload->'expectedNicknameRevision') IS DISTINCT FROM 'number'
 OR payload->>'expectedNicknameRevision' !~ '^(0|[1-9][0-9]*)$'
 OR (payload->>'expectedNicknameRevision')::numeric>9007199254740991
 THEN RAISE EXCEPTION 'SELF_NICKNAME_INVALID' USING ERRCODE='22023';END IF;
 FOREACH f IN ARRAY ARRAY['operationId','tripId','personId'] LOOP
  IF jsonb_typeof(payload->f) IS DISTINCT FROM 'string' OR payload->>f !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
  THEN RAISE EXCEPTION 'SELF_NICKNAME_INVALID' USING ERRCODE='22023';END IF;
 END LOOP;
 IF payload->'nickname'<>'null'::jsonb AND (jsonb_typeof(payload->'nickname') IS DISTINCT FROM 'string'
 OR char_length(payload->>'nickname') NOT BETWEEN 1 AND 256 OR payload->>'nickname'<>btrim(payload->>'nickname',trim_chars))
 THEN RAISE EXCEPTION 'SELF_NICKNAME_INVALID' USING ERRCODE='22023';END IF;
 digest:=public.trip_person_hash('otr-self-trip-nickname-intent-v1',jsonb_build_array(1,'SET_SELF_TRIP_NICKNAME',payload->'operationId',actor,trip,person,payload->>'expectedNicknameRevision',payload->'nickname'));
 IF jsonb_typeof(payload->'intentDigest') IS DISTINCT FROM 'string' OR payload->>'intentDigest' IS DISTINCT FROM digest
 THEN RAISE EXCEPTION 'SELF_NICKNAME_INVALID' USING ERRCODE='22023';END IF;
 op:=(payload->>'operationId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-self-trip-nickname:'||actor::text||':'||op::text,0));
 SELECT * INTO old_receipt FROM public.trip_person_nickname_receipts WHERE actor_account_id=actor AND operation_id=op;
 IF FOUND THEN
  IF old_receipt.trip_id<>trip OR old_receipt.person_id<>person OR old_receipt.request_payload IS DISTINCT FROM payload
  THEN RAISE EXCEPTION 'SELF_NICKNAME_OPERATION_REUSED' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('receipt',old_receipt.result_payload,'idempotentReplay',true);
 END IF;
 -- Only NEW mutation needs the independently closed feature. Historical recovery
 -- remains qualified by current self access after feature closure.
 IF public.trip_person_nickname_write_scope(actor,trip) IS NOT TRUE
 THEN RAISE EXCEPTION 'SELF_NICKNAME_CLOSED' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT target FROM public.journey_members WHERE id=person AND trip_id=trip AND user_id=actor AND status='linked' FOR UPDATE;
 IF public.trip_sustained_core_read_scope_allowed(actor,trip) IS NOT TRUE THEN RAISE EXCEPTION 'SELF_NICKNAME_FORBIDDEN' USING ERRCODE='42501';END IF;
 expected:=(payload->>'expectedNicknameRevision')::bigint; desired:=coalesce(payload->>'nickname','');
 prior_pair:=jsonb_build_object('nickname',nullif(target.display_name,''),'nicknameRevision',target.nickname_revision);
 IF expected<>target.nickname_revision THEN outcome:='REVISION_CONFLICT';
 ELSIF desired=target.display_name THEN outcome:='UNCHANGED';
 ELSE
  IF target.nickname_revision=9007199254740991 THEN RAISE EXCEPTION 'SELF_NICKNAME_REVISION_EXHAUSTED';END IF;
  outcome:='APPLIED';
 END IF;
 resulting_pair:=CASE WHEN outcome='APPLIED' THEN jsonb_build_object('nickname',nullif(desired,''),'nicknameRevision',target.nickname_revision+1) ELSE prior_pair END;
 at_time:=clock_timestamp();
 result:=jsonb_build_object('receiptVersion',1,'receiptId',gen_random_uuid(),'actorAccountId',actor,'tripId',trip,'personId',person,'operationId',op,
  'intentDigest',digest,'expectedNicknameRevision',expected,'desiredNickname',payload->'nickname','outcome',outcome,'prior',prior_pair,'resulting',resulting_pair,'acceptedAt',public.trip_event_utc_timestamp(at_time));
 INSERT INTO public.trip_person_nickname_receipts VALUES(actor,op,trip,person,payload,result,txid_current(),at_time);
 IF outcome='APPLIED' THEN
  UPDATE public.journey_members SET display_name=desired,updated_at=at_time WHERE id=person AND trip_id=trip;
 END IF;
 IF public.trip_person_nickname_write_scope(actor,trip) IS NOT TRUE THEN RAISE EXCEPTION 'SELF_NICKNAME_CLOSED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('receipt',result,'idempotentReplay',false);
END $$;
REVOKE ALL ON FUNCTION public.trip_person_self_nickname(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
-- NO EXECUTE granted. Future exact Root2 installer must qualify actual preimages,
-- review precise Gateway EXECUTE and activation, and retain receipts on shutdown.
COMMIT;
