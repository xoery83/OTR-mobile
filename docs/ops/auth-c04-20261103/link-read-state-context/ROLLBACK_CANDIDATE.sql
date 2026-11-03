-- Exact rollback only after runtime closure/no in-flight Claim; preserve business rows/receipts.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
DO $rollback$ BEGIN
 IF current_user<>'postgres' OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.member_claim_read_state_gate',true) IS DISTINCT FROM 'OTR_C04_LINK_READ_STATE_V1'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_member_claim_transaction(text,jsonb)'::regprocedure)
 IS DISTINCT FROM 'c76f2a642deb21ca3bf86e056b2f9b32'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure)
 IS DISTINCT FROM '731aa1c777f14b422fc9e9dd2f72af4f'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_member_claim_read_state_allowed(uuid)'::regprocedure)
 IS DISTINCT FROM 'd1977767b0dc389ef5329e890491b5db'
 OR EXISTS(SELECT 1 FROM public.trip_directed_invite_targets WHERE claim_transaction_id IS NOT NULL
   OR claim_backend_pid IS NOT NULL OR claim_operation_id IS NOT NULL)
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_ROLLBACK_DRIFT_OR_ACTIVE_PROOF';END IF;
END $rollback$;
DO $acl$ DECLARE item record; fn pg_proc%ROWTYPE; BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.trip_member_claim_transaction(text,jsonb)'::regprocedure,'otr_trip_core_v2_gateway'::regrole,true),
  ('public.trip_core_finite_read_state_guard()'::regprocedure,'otr_trip_core_v2_writer'::regrole,false)
 ) expected(signature,allowed_role,definer) LOOP
  SELECT * INTO STRICT fn FROM pg_proc WHERE oid=item.signature;
  IF fn.proowner<>'postgres'::regrole OR fn.prosecdef IS DISTINCT FROM item.definer
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
   OR (SELECT count(*) FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))))<>2
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a
    WHERE a.grantee NOT IN (fn.proowner,item.allowed_role) OR a.grantor<>fn.proowner
     OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
  THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_FUNCTION_ACL_DRIFT';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='public.trip_directed_invite_targets'::regclass
   AND (c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity OR c.relforcerowsecurity
    OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid)
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE a.grantee<>c.relowner OR a.grantor<>c.relowner)))
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.trip_directed_invite_targets'::regclass
    AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL)
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_PRIVATE_TABLE_ACL_DRIFT';END IF;
END $acl$;
DO $post$ DECLARE fn pg_proc%ROWTYPE; BEGIN
 SELECT * INTO STRICT fn FROM pg_proc WHERE oid='public.trip_member_claim_read_state_allowed(uuid)'::regprocedure;
 IF fn.proowner<>'postgres'::regrole OR NOT fn.prosecdef OR fn.prorettype<>'boolean'::regtype
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  OR (SELECT count(*) FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))))<>1
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a
    WHERE a.grantee<>fn.proowner OR a.grantor<>fn.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_HELPER_ACL_DRIFT';END IF;
END $post$;
CREATE OR REPLACE FUNCTION public.trip_member_claim_transaction(method text,payload jsonb)
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
CREATE OR REPLACE FUNCTION public.trip_core_finite_read_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare actor uuid;trip uuid;operation uuid;
begin
 trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;
 IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' THEN
  IF TG_OP='INSERT' AND otr_auth_guest_composite.read_state_allowed(trip,'CREATE')
  AND NEW.revision=1 AND NEW.access_revision=1 THEN RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND otr_auth_guest_composite.read_state_allowed(trip,'PERSON')
  AND NEW.epoch IS NOT DISTINCT FROM OLD.epoch AND NEW.revision=OLD.revision+1
  AND NEW.access_revision=OLD.access_revision+1 THEN RETURN NEW;END IF;
 END IF;

 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;
  if current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway' or tg_op not in ('INSERT','UPDATE') or not public.trip_core_finite_scope_allowed(actor,trip)
   or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
   or (current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM' and not (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and ((current_setting('otr.core.command',true) in ('SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P3') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_STAY_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P3' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P4') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_RENTAL_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P4' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P6') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_ACTIVITY_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P6' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P5') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_TRANSPORT_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P5' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P2') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'CREATE_SPARSE_FLIGHT' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P2' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P2_DETAILS') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_AUTHORED_FLIGHT_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P2' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL')) OR (current_setting('otr.core.command',true)='CREATE_SPARSE_FLIGHT' AND current_setting('otr.core.family',true)='P2' AND current_setting('otr.core.admission',true)='REVIEWED_SOURCE' AND EXISTS(SELECT 1 FROM public.trip_sustained_import_p1_capabilities(actor,trip) c WHERE c.runtime_enabled AND c.enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT']::text[] AND c.enabled_families=ARRAY['P2']::text[]) AND EXISTS(SELECT 1 FROM public.trip_core_command_receipts rr JOIN public.trip_source_core_v2_slots ss ON ss.operation_id=rr.operation_id AND ss.intent_sha256=rr.intent_sha256 AND ss.account_id=rr.actor_account_id AND ss.trip_id=rr.trip_id WHERE rr.actor_account_id=actor AND rr.trip_id=trip AND rr.operation_id=nullif(current_setting('otr.core.operation',true),'')::uuid AND ss.output_slot_id=nullif(current_setting('otr.core.source_intent',true),'')::uuid AND ss.target_id=nullif(current_setting('otr.core.target_item',true),'')::uuid AND ss.command='CREATE_SPARSE_FLIGHT' AND rr.outcome IN ('APPLIED','NO_CHANGE') AND rr.body->>'command'='CREATE_SPARSE_FLIGHT')))))
   or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
   or tg_op='UPDATE' and (new.epoch is distinct from old.epoch or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 elsif session_user='otr_trip_create_gateway' then
  select r.actor_account_id,r.operation_id into actor,operation from public.trip_create_receipts r join public.trips t on t.id=r.trip_id and t.created_by=r.actor_account_id where r.trip_id=trip for share of r;
  if tg_op<>'INSERT' or not public.trip_create_finite_scope_allowed(actor,trip,operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $function$;
DROP FUNCTION public.trip_member_claim_read_state_allowed(uuid);
ALTER TABLE public.trip_directed_invite_targets DROP CONSTRAINT member_claim_proof_complete,
 DROP COLUMN claim_transaction_id, DROP COLUMN claim_backend_pid, DROP COLUMN claim_operation_id;
DO $acl$ DECLARE item record; fn pg_proc%ROWTYPE; BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.trip_member_claim_transaction(text,jsonb)'::regprocedure,'otr_trip_core_v2_gateway'::regrole,true),
  ('public.trip_core_finite_read_state_guard()'::regprocedure,'otr_trip_core_v2_writer'::regrole,false)
 ) expected(signature,allowed_role,definer) LOOP
  SELECT * INTO STRICT fn FROM pg_proc WHERE oid=item.signature;
  IF fn.proowner<>'postgres'::regrole OR fn.prosecdef IS DISTINCT FROM item.definer
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
   OR (SELECT count(*) FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))))<>2
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a
    WHERE a.grantee NOT IN (fn.proowner,item.allowed_role) OR a.grantor<>fn.proowner
     OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
  THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_FUNCTION_ACL_DRIFT';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='public.trip_directed_invite_targets'::regclass
   AND (c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity OR c.relforcerowsecurity
    OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid)
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE a.grantee<>c.relowner OR a.grantor<>c.relowner)))
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.trip_directed_invite_targets'::regclass
    AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL)
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_PRIVATE_TABLE_ACL_DRIFT';END IF;
END $acl$;
COMMIT;
