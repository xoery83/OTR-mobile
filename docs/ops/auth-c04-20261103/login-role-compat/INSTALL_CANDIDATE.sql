-- Candidate only. Unique SQL Writer must qualify and obtain exact DEV approval.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $gate$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.member_claim_gate',true) IS DISTINCT FROM 'OTR_MEMBER_CLAIM_REGISTERED_DEV_20261103_LOGIN_COMPAT_V1'
 THEN RAISE EXCEPTION 'MEMBER_CLAIM_EXACT_DEV_GATE_REQUIRED';END IF;
 IF to_regclass('public.trip_directed_invite_targets') IS NOT NULL
 OR to_regclass('public.trip_member_claim_receipts') IS NOT NULL
 OR to_regprocedure('public.trip_member_claim_transaction(text,jsonb)') IS NOT NULL
 OR to_regprocedure('public.trip_member_claim_receipt_immutable()') IS NOT NULL
 OR to_regprocedure('public.trip_directed_invite_legacy_guard()') IS NOT NULL
 THEN RAISE EXCEPTION 'MEMBER_CLAIM_EXPECTED_ABSENT_RECONCILE';END IF;
 IF to_regprocedure('public.trip_core_lock_actor_scope(uuid,uuid)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_gateway' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 THEN RAISE EXCEPTION 'MEMBER_CLAIM_CORE_DEPENDENCY_REQUIRED';END IF;
END $gate$;
CREATE TABLE public.trip_directed_invite_targets (
 invite_id uuid PRIMARY KEY REFERENCES public.journey_invites(id),
 trip_id uuid NOT NULL REFERENCES public.trips(id),
 person_id uuid NOT NULL REFERENCES public.journey_members(id),
 target_account_id uuid NOT NULL REFERENCES auth.users(id),
 approved_by uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL CHECK(status IN ('PENDING','CLAIMED','REVOKED')),
 claimed_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.trip_member_claim_receipts (
 operation_id uuid PRIMARY KEY,
 actor_account_id uuid NOT NULL REFERENCES auth.users(id),
 trip_id uuid NOT NULL REFERENCES public.trips(id),
 person_id uuid NOT NULL REFERENCES public.journey_members(id),
 invite_id uuid NOT NULL REFERENCES public.journey_invites(id),
 intent_digest text NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
 outcome text NOT NULL CHECK(outcome IN ('ISSUED','LINKED','ALREADY_LINKED','INVITE_REVOKED'))
);
ALTER TABLE public.trip_directed_invite_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_member_claim_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_directed_invite_targets,public.trip_member_claim_receipts
 FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway;
CREATE FUNCTION public.trip_member_claim_receipt_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
 RAISE EXCEPTION 'MEMBER_RECEIPT_IMMUTABLE' USING ERRCODE='42501';END$$;
REVOKE ALL ON FUNCTION public.trip_member_claim_receipt_immutable()
 FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.trip_member_claim_receipts
 FOR EACH ROW EXECUTE FUNCTION public.trip_member_claim_receipt_immutable();
-- A directed record is never a consumable legacy bearer link, including after old UI edits.
CREATE FUNCTION public.trip_directed_invite_legacy_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF EXISTS(SELECT 1 FROM public.trip_directed_invite_targets WHERE invite_id=old.id) THEN
  IF tg_op='DELETE' THEN RAISE EXCEPTION 'DIRECTED_INVITE_HISTORY_PROTECTED' USING ERRCODE='42501';END IF;
  IF session_user<>'otr_trip_core_v2_gateway' OR new.is_active IS DISTINCT FROM false
   OR (to_jsonb(new)-ARRAY['used_count','is_active']) IS DISTINCT FROM (to_jsonb(old)-ARRAY['used_count','is_active'])
   OR new.used_count IS NULL OR new.used_count<old.used_count OR new.used_count>old.used_count+1 OR new.used_count>1
   THEN RAISE EXCEPTION 'DIRECTED_INVITE_LEGACY_MUTATION_DENIED' USING ERRCODE='42501';END IF;
 END IF;
 RETURN CASE WHEN tg_op='DELETE' THEN old ELSE new END;
END$$;
REVOKE ALL ON FUNCTION public.trip_directed_invite_legacy_guard()
 FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway;
CREATE TRIGGER directed_invite_legacy_guard BEFORE UPDATE OR DELETE ON public.journey_invites
 FOR EACH ROW EXECUTE FUNCTION public.trip_directed_invite_legacy_guard();

CREATE FUNCTION public.trip_member_claim_transaction(method text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE
 actor uuid:=nullif(current_setting('otr.core.actor',true),'')::uuid;
 trip uuid:=nullif(current_setting('otr.core.trip',true),'')::uuid;
 owner_id uuid; person public.journey_members%ROWTYPE;
 invite_row public.journey_invites%ROWTYPE;
 directed public.trip_directed_invite_targets%ROWTYPE;
 receipt_row public.trip_member_claim_receipts%ROWTYPE;
 person_id uuid; invite_id uuid; target_id uuid; deadline timestamptz; affected integer;
 identity_scope jsonb;
BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' OR actor IS NULL OR trip IS NULL
 OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'MEMBER_CLAIM_SCOPE_REQUIRED' USING ERRCODE='42501';END IF;
 -- One canonical Trip lock serializes issue/claim/revoke and guards current Owner.
 SELECT created_by INTO owner_id FROM public.trips WHERE id=trip FOR UPDATE;
 IF NOT FOUND OR owner_id IS NULL THEN RAISE EXCEPTION 'MEMBER_CLAIM_DENIED' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM auth.users WHERE id=actor AND is_anonymous IS FALSE
  AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NORMAL_ACCOUNT_REQUIRED' USING ERRCODE='42501';END IF;
 IF method='lock' THEN RETURN 'true'::jsonb;END IF;
 IF method='time' THEN RETURN to_jsonb(clock_timestamp());END IF;
 IF method='access' THEN
  identity_scope:=public.trip_core_lock_actor_scope(actor,trip);
  RETURN to_jsonb(CASE WHEN identity_scope->>'active'='true' THEN 'READ'::text ELSE 'NONE'::text END);
 END IF;
 IF method='organizer' THEN RETURN to_jsonb(owner_id=actor);END IF;
 IF method='denied' THEN
  RETURN to_jsonb(EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=actor));
 END IF;
 IF method='person' THEN
  SELECT * INTO person FROM public.journey_members WHERE trip_id=trip AND id=(payload->>'personId')::uuid FOR UPDATE;
  RETURN jsonb_build_object('found',FOUND,'accountId',CASE WHEN person.status='linked' THEN person.user_id ELSE NULL END);
 END IF;
 IF method='accountPerson' THEN
  SELECT * INTO person FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked';
  RETURN to_jsonb(person.id);
 END IF;
 IF method='approval' THEN
  RETURN to_jsonb(EXISTS(SELECT 1 FROM public.trip_directed_invite_targets d
   JOIN public.journey_invites i ON i.id=d.invite_id
   WHERE d.trip_id=trip AND d.person_id=(payload->>'personId')::uuid
    AND d.target_account_id=actor AND d.approved_by=owner_id
    AND d.status='PENDING' AND NOT i.is_active AND i.expires_at>clock_timestamp()));
 END IF;
 IF method='receipt' THEN
  SELECT * INTO receipt_row FROM public.trip_member_claim_receipts
   WHERE operation_id=(payload->>'operationId')::uuid AND actor_account_id=actor AND trip_id=trip;
  IF NOT FOUND THEN RETURN 'null'::jsonb;END IF;
  RETURN jsonb_build_object('operationId',receipt_row.operation_id,'actorAccountId',actor,
   'tripId',trip,'personId',receipt_row.person_id,'inviteId',receipt_row.invite_id,
   'intentDigest',receipt_row.intent_digest,'outcome',receipt_row.outcome);
 END IF;
 IF method='issue' THEN
  IF owner_id<>actor OR payload->'target'->>'kind' IS DISTINCT FROM 'REGISTERED_ACCOUNT' THEN
   RAISE EXCEPTION 'MEMBER_INVITE_ISSUER_UNAVAILABLE' USING ERRCODE='42501';END IF;
  person_id:=(payload->>'personId')::uuid;target_id:=(payload->'target'->>'accountId')::uuid;
  deadline:=(payload->>'expiresAt')::timestamptz;
  SELECT * INTO person FROM public.journey_members WHERE id=person_id AND trip_id=trip FOR UPDATE;
  -- Previously linked Persons need the separate approved Reset/cutoff authority.
  IF NOT FOUND OR person.status<>'unlinked' OR person.user_id IS NOT NULL OR person.linked_at IS NOT NULL OR deadline IS NULL
   OR NOT isfinite(deadline) OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'MEMBER_INVITE_DENIED' USING ERRCODE='42501';END IF;
  PERFORM 1 FROM auth.users WHERE id=target_id AND is_anonymous IS FALSE AND deleted_at IS NULL
   AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=target_id)
   OR EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=target_id AND status='linked')
   THEN RAISE EXCEPTION 'MEMBER_INVITE_TARGET_DENIED' USING ERRCODE='42501';END IF;
  INSERT INTO public.journey_invites(trip_id,token,created_by,expires_at,max_uses,used_count,is_active)
   VALUES(trip,gen_random_uuid()::text||gen_random_uuid()::text,actor,deadline,1,0,false) RETURNING id INTO invite_id;
  INSERT INTO public.trip_directed_invite_targets(invite_id,trip_id,person_id,target_account_id,approved_by,status)
   VALUES(invite_id,trip,person_id,target_id,actor,'PENDING');
  RETURN jsonb_build_object('inviteId',invite_id,'expiresAt',deadline);
 END IF;
 IF method IN ('invite','link','revoke','saveReceipt') THEN
  invite_id:=(payload->>'inviteId')::uuid;
  SELECT * INTO directed FROM public.trip_directed_invite_targets WHERE trip_id=trip AND trip_directed_invite_targets.invite_id=invite_id FOR UPDATE;
  IF NOT FOUND OR (actor<>owner_id AND actor<>directed.target_account_id) THEN
   IF method='invite' THEN RETURN 'null'::jsonb;END IF;
   RAISE EXCEPTION 'MEMBER_INVITE_DENIED' USING ERRCODE='42501';END IF;
  SELECT * INTO invite_row FROM public.journey_invites WHERE id=invite_id AND trip_id=trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_INVITE_MISSING' USING ERRCODE='42501';END IF;
  IF method='invite' THEN
   RETURN jsonb_build_object('id',invite_id,'tripId',trip,'personId',directed.person_id,
    'target',jsonb_build_object('kind','REGISTERED_ACCOUNT','accountId',directed.target_account_id),
    'status',CASE WHEN directed.status='PENDING' AND invite_row.expires_at<=clock_timestamp()
      THEN 'EXPIRED' ELSE directed.status END,'expiresAt',invite_row.expires_at);
  END IF;
  SELECT * INTO person FROM public.journey_members WHERE id=directed.person_id AND trip_id=trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_PERSON_MISSING' USING ERRCODE='42501';END IF;
  IF method='saveReceipt' THEN
   IF (payload->>'actorAccountId')::uuid IS DISTINCT FROM actor OR (payload->>'tripId')::uuid IS DISTINCT FROM trip
    OR (payload->>'personId')::uuid IS DISTINCT FROM directed.person_id
    OR ((payload->>'outcome'='ISSUED' AND actor=owner_id AND directed.status='PENDING')
     OR (payload->>'outcome' IN ('LINKED','ALREADY_LINKED') AND actor=directed.target_account_id
      AND directed.status='CLAIMED' AND directed.claimed_by=actor AND person.user_id=actor AND person.status='linked')
     OR (payload->>'outcome'='INVITE_REVOKED' AND actor=owner_id AND directed.status='REVOKED')) IS NOT TRUE
    THEN RAISE EXCEPTION 'MEMBER_RECEIPT_BINDING' USING ERRCODE='42501';END IF;
   INSERT INTO public.trip_member_claim_receipts(operation_id,actor_account_id,trip_id,person_id,invite_id,intent_digest,outcome)
    VALUES((payload->>'operationId')::uuid,actor,trip,directed.person_id,invite_id,payload->>'intentDigest',payload->>'outcome');
   RETURN 'true'::jsonb;
  END IF;
  IF directed.status<>'PENDING' OR invite_row.is_active IS DISTINCT FROM false OR invite_row.expires_at IS NULL OR invite_row.expires_at<=clock_timestamp()
    OR person.status<>'unlinked' OR person.user_id IS NOT NULL OR person.linked_at IS NOT NULL THEN
   RAISE EXCEPTION 'MEMBER_INVITE_NOT_CURRENT' USING ERRCODE='42501';END IF;
  IF method='revoke' THEN
   IF owner_id<>actor THEN RAISE EXCEPTION 'MEMBER_REVOKE_DENIED' USING ERRCODE='42501';END IF;
   UPDATE public.trip_directed_invite_targets SET status='REVOKED' WHERE trip_directed_invite_targets.invite_id=invite_id;
   UPDATE public.journey_invites SET is_active=false WHERE id=invite_id;
   RETURN 'true'::jsonb;
  END IF;
  IF actor<>directed.target_account_id OR directed.approved_by<>owner_id
   OR directed.person_id IS DISTINCT FROM (payload->>'personId')::uuid
   OR EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=actor)
   OR EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked')
   THEN RAISE EXCEPTION 'MEMBER_LINK_DENIED' USING ERRCODE='42501';END IF;
  UPDATE public.journey_members SET user_id=actor,status='linked',linked_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE id=directed.person_id AND trip_id=trip AND user_id IS NULL AND status='unlinked';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'MEMBER_LINK_CONFLICT' USING ERRCODE='23505';END IF;
  UPDATE public.trip_directed_invite_targets SET status='CLAIMED',claimed_by=actor WHERE trip_directed_invite_targets.invite_id=invite_id;
  UPDATE public.journey_invites SET used_count=used_count+1,is_active=false WHERE id=invite_id;
  RETURN 'true'::jsonb;
 END IF;
 RAISE EXCEPTION 'MEMBER_CLAIM_METHOD_INVALID' USING ERRCODE='22023';
END$$;
REVOKE ALL ON FUNCTION public.trip_member_claim_transaction(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_member_claim_transaction(text,jsonb) TO otr_trip_core_v2_gateway;
DO $post$ DECLARE object_row record;BEGIN
 FOR object_row IN SELECT oid,relowner,relacl,relrowsecurity FROM pg_class
  WHERE oid IN ('public.trip_directed_invite_targets'::regclass,'public.trip_member_claim_receipts'::regclass) LOOP
  IF object_row.relowner<>'postgres'::regrole OR NOT object_row.relrowsecurity
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=object_row.oid)
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(object_row.relacl,acldefault('r',object_row.relowner))) WHERE grantee<>object_row.relowner)
   THEN RAISE EXCEPTION 'MEMBER_CLAIM_TABLE_ACL_DRIFT';END IF;
 END LOOP;
 FOR object_row IN SELECT oid,proowner,proacl,prosecdef,proconfig FROM pg_proc
  WHERE oid IN ('public.trip_member_claim_transaction(text,jsonb)'::regprocedure,'public.trip_member_claim_receipt_immutable()'::regprocedure,'public.trip_directed_invite_legacy_guard()'::regprocedure) LOOP
  IF object_row.proowner<>'postgres'::regrole OR NOT ('search_path=pg_catalog'=ANY(object_row.proconfig))
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(object_row.proacl,acldefault('f',object_row.proowner)))
    WHERE grantee<>object_row.proowner AND NOT(object_row.oid='public.trip_member_claim_transaction(text,jsonb)'::regprocedure
     AND grantee='otr_trip_core_v2_gateway'::regrole AND privilege_type='EXECUTE' AND NOT is_grantable))
   THEN RAISE EXCEPTION 'MEMBER_CLAIM_FUNCTION_ACL_DRIFT';END IF;
 END LOOP;
END $post$;
COMMIT;
