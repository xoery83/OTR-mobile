-- Sustained DEV candidate only. No policy rows enabled, LOGIN or deployment.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regclass('public.trip_sustained_dev_policy') IS NOT NULL THEN RAISE EXCEPTION 'SUSTAINED_ALREADY_INSTALLED';END IF;
 IF current_user<>'postgres' OR EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled)
 OR EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled)
 OR EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled)
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway') AND rolcanlogin)
 THEN RAISE EXCEPTION 'NORMAL_DEV_REQUIRES_CLOSED_PARENT';END IF;
 IF to_regprocedure('public.trip_create_command(uuid,uuid,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'STRUCTURED_TRIP_PARENT_REQUIRED';END IF;
END $$;
DO $preimage$ BEGIN
 IF md5(pg_get_functiondef('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure))<>'b3d8d5717f3beee8953270578c0dbebb' THEN RAISE EXCEPTION 'NORMAL_FUNCTION_PREIMAGE_MISMATCH: public.trip_create_finite_scope_allowed(uuid,uuid,uuid)';END IF;
 IF md5(pg_get_functiondef('public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure))<>'6c17d4ffcc038f744abe906c7ffc3582' THEN RAISE EXCEPTION 'NORMAL_FUNCTION_PREIMAGE_MISMATCH: public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)';END IF;
 IF md5(pg_get_functiondef('public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure))<>'32f2b01d2fa890c87640485885565de2' THEN RAISE EXCEPTION 'NORMAL_FUNCTION_PREIMAGE_MISMATCH: public.trip_core_finite_scope_allowed(uuid,uuid)';END IF;
 IF md5(pg_get_functiondef('public.trip_core_guard_write()'::regprocedure))<>'c493b32972679e7aba510132103b0dd9' THEN RAISE EXCEPTION 'NORMAL_FUNCTION_PREIMAGE_MISMATCH: public.trip_core_guard_write()';END IF;
 IF md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure))<>'680f19be480eb934301c8b5b920eb76a' THEN RAISE EXCEPTION 'NORMAL_FUNCTION_PREIMAGE_MISMATCH: public.trip_core_finite_read_state_guard()';END IF;
 IF md5(pg_get_functiondef('public.trip_create_command(uuid,uuid,uuid,jsonb)'::regprocedure))<>'12e1d4a45e37e5cff9fb6a6385c82b45' THEN RAISE EXCEPTION 'NORMAL_FUNCTION_PREIMAGE_MISMATCH: public.trip_create_command(uuid,uuid,uuid,jsonb)';END IF;
 IF md5(pg_get_functiondef('public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)'::regprocedure))<>'5063f939eb660b54a57b30f58b84cc73' THEN RAISE EXCEPTION 'NORMAL_FUNCTION_PREIMAGE_MISMATCH: public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)';END IF;
 IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND conname='finite_core_scope_contract') IS DISTINCT FROM 'c6b14f3a61e006a571f6c8dce61141a4' THEN RAISE EXCEPTION 'NORMAL_CONSTRAINT_PREIMAGE_MISMATCH: finite_core_scope_contract';END IF;
 IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.trip_create_activation_gate'::regclass AND conname='trip_create_gate_request_version') IS DISTINCT FROM 'fb0753829633d69a447adc173c3a3cb0' THEN RAISE EXCEPTION 'NORMAL_CONSTRAINT_PREIMAGE_MISMATCH: trip_create_gate_request_version';END IF;
 IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.trip_metadata_activation_gate'::regclass AND conname='trip_metadata_gate_request_version') IS DISTINCT FROM '4695e3d48eb2ff47805c84f1fccb2527' THEN RAISE EXCEPTION 'NORMAL_CONSTRAINT_PREIMAGE_MISMATCH: trip_metadata_gate_request_version';END IF;
END $preimage$;

CREATE TABLE public.trip_sustained_dev_policy (
 actor_account_id uuid PRIMARY KEY REFERENCES auth.users(id),
 enabled boolean NOT NULL DEFAULT false,
 adoption_cutoff timestamptz NOT NULL CHECK(isfinite(adoption_cutoff)),
 revoked_at timestamptz,
 CHECK(NOT enabled OR revoked_at IS NULL)
);
CREATE FUNCTION public.trip_sustained_policy_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
 IF TG_OP='DELETE' OR NEW.actor_account_id IS DISTINCT FROM OLD.actor_account_id OR NEW.adoption_cutoff IS DISTINCT FROM OLD.adoption_cutoff THEN RAISE EXCEPTION 'SUSTAINED_POLICY_IDENTITY_IMMUTABLE' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trip_sustained_policy_identity_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trip_sustained_policy_identity_guard BEFORE UPDATE OR DELETE ON public.trip_sustained_dev_policy FOR EACH ROW EXECUTE FUNCTION public.trip_sustained_policy_identity_guard();
ALTER TABLE public.trip_sustained_dev_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_sustained_dev_policy FROM PUBLIC,anon,authenticated,service_role,otr_trip_create_gateway,otr_trip_metadata_gateway,otr_trip_core_v2_gateway,otr_trip_core_v2_writer,otr_trip_person_command_gateway;
CREATE FUNCTION public.trip_sustained_dev_scope_allowed(actor uuid,trip uuid,operation uuid,kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE principal record;policy record;r record;owner_id oid;
BEGIN
 IF current_user<>'postgres' OR actor IS NULL OR kind NOT IN ('CREATE','METADATA','CORE','PERSON') THEN RETURN false;END IF;
 IF session_user<>(CASE kind WHEN 'CREATE' THEN 'otr_trip_create_gateway' WHEN 'METADATA' THEN 'otr_trip_metadata_gateway' WHEN 'PERSON' THEN 'otr_trip_person_command_gateway' ELSE 'otr_trip_core_v2_gateway' END) THEN RETURN false;END IF;
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname='postgres';
 SELECT * INTO principal FROM pg_roles WHERE rolname=session_user;
 IF NOT principal.rolcanlogin OR principal.rolconnlimit<>1 OR principal.rolvaliduntil IS NOT NULL AND principal.rolvaliduntil<>'infinity'::timestamptz
 OR principal.rolsuper OR principal.rolcreatedb OR principal.rolcreaterole OR principal.rolinherit OR principal.rolbypassrls OR principal.rolreplication
 OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=principal.oid AND deptype='o')
 OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE (m.roleid=principal.oid OR m.member=principal.oid) AND NOT (
 (m.member=owner_id AND m.roleid=principal.oid AND m.admin_option AND NOT m.inherit_option)
 OR(kind='CORE' AND m.member=principal.oid AND m.roleid='otr_trip_core_v2_writer'::regrole AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)))
 THEN RETURN false;END IF;
 SELECT * INTO policy FROM public.trip_sustained_dev_policy WHERE actor_account_id=actor FOR SHARE;
 IF NOT FOUND OR NOT policy.enabled OR policy.revoked_at IS NOT NULL THEN RETURN false;END IF;
 IF kind='CORE' AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_writer' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)) THEN RETURN false;END IF;
 IF trip IS NULL THEN
  IF operation IS NULL OR kind IN ('CORE','PERSON') THEN RETURN false;END IF;
  IF kind='CREATE' THEN SELECT actor_account_id,trip_id INTO r FROM public.trip_create_receipts WHERE operation_id=operation;
  ELSE SELECT actor_account_id,trip_id INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=operation;END IF;
  IF NOT FOUND THEN RETURN true;END IF;
  IF r.actor_account_id<>actor THEN RETURN false;END IF;trip:=r.trip_id;
 END IF;
 IF kind='CREATE' AND NOT EXISTS(SELECT 1 FROM public.trips WHERE id=trip) THEN
  RETURN NOT EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE operation_id=operation);
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.trip_create_receipts receipt JOIN public.trips t ON t.id=receipt.trip_id AND t.created_by=receipt.actor_account_id
  WHERE receipt.actor_account_id=actor AND receipt.trip_id=trip AND receipt.request_payload->'formatVersion'='2'::jsonb AND receipt.created_at>=policy.adoption_cutoff)
 AND EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked' AND role='owner');
END $$;
REVOKE ALL ON FUNCTION public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,otr_trip_create_gateway,otr_trip_metadata_gateway,otr_trip_core_v2_gateway,otr_trip_core_v2_writer,otr_trip_person_command_gateway;
CREATE FUNCTION public.trip_sustained_core_capabilities(actor uuid,trip uuid) RETURNS TABLE(runtime_enabled boolean,enabled_commands text[],enabled_families text[],enabled_admission_modes text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') THEN RAISE EXCEPTION 'CORE_CAPABILITY_CLOSED' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION']::text[],ARRAY['P1']::text[],ARRAY['MANUAL']::text[];
END $$;
REVOKE ALL ON FUNCTION public.trip_sustained_core_capabilities(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_sustained_core_capabilities(uuid,uuid) TO otr_trip_core_v2_gateway;
DO $$ DECLARE signature text;body text;old text;kind text; BEGIN
 FOREACH signature IN ARRAY ARRAY['public.trip_create_finite_scope_allowed(uuid,uuid,uuid)','public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)'] LOOP
  body:=pg_get_functiondef(signature::regprocedure);
  kind:=CASE WHEN signature LIKE '%trip_create_%' THEN 'CREATE' ELSE 'METADATA' END;
  EXECUTE replace(body,E'begin\n',format(E'begin\n if public.trip_sustained_dev_scope_allowed(actor,trip,operation,%L) then return true;end if;\n',kind));
 END LOOP;
 body:=pg_get_functiondef('public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure);
 IF position('-- ADMIN' IN body)=0 THEN RAISE EXCEPTION 'NORMAL_CORE_PREIMAGE_MISMATCH';END IF;
 EXECUTE replace(body,'-- ADMIN','if public.trip_sustained_dev_scope_allowed(actor,trip,null,''CORE'') then return true;end if; -- ADMIN');
 body:=pg_get_functiondef('public.trip_create_command(uuid,uuid,uuid,jsonb)'::regprocedure);
 old:='IF payload IS DISTINCT FROM (SELECT request_payload FROM public.trip_create_activation_gate WHERE singleton) THEN';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'NORMAL_CREATE_PREIMAGE_MISMATCH';END IF;
 EXECUTE replace(body,old,'IF NOT public.trip_sustained_dev_scope_allowed(p_actor,p_trip,p_operation,''CREATE'') AND payload IS DISTINCT FROM (SELECT request_payload FROM public.trip_create_activation_gate WHERE singleton) THEN');
 body:=pg_get_functiondef('public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)'::regprocedure);
 old:='IF p_request IS DISTINCT FROM (SELECT request_payload FROM public.trip_metadata_activation_gate WHERE singleton) THEN';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'NORMAL_METADATA_PREIMAGE_MISMATCH';END IF;
 body:=replace(body,old,'IF NOT (p_request->''formatVersion''=''3''::jsonb AND public.trip_sustained_dev_scope_allowed(p_actor,p_trip,p_operation,''METADATA'')) AND p_request IS DISTINCT FROM (SELECT request_payload FROM public.trip_metadata_activation_gate WHERE singleton) THEN');
 EXECUTE body;
END $$;
GRANT EXECUTE ON FUNCTION public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text) TO otr_trip_core_v2_writer;
DO $patch$ DECLARE body text;old text;replacement text; BEGIN
 body:=pg_get_functiondef('public.trip_core_guard_write()'::regprocedure);
 old:=$old$  if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'$old$;
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'NORMAL_WRITE_GUARD_PREIMAGE_MISMATCH';END IF;
 replacement:=$new$  if public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') then
   if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'
    or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
    or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
    or current_setting('otr.core.family',true) is distinct from 'P1'
    or coalesce(current_setting('otr.core.command',true),'') not in ('CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION')
    or nullif(current_setting('otr.core.target_item',true),'') is null
    or tg_table_name not in ('itinerary_events','trip_activity_details','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts')
    or tg_op='DELETE' and (tg_table_name<>'trip_item_participants' or current_setting('otr.core.command',true)<>'SET_ITEM_PARTICIPATION')
    or tg_table_name='itinerary_events' and ((coalesce(new_json,old_json)->>'id') is distinct from current_setting('otr.core.target_item',true) or coalesce(new_json,old_json)->>'experience_family' is distinct from 'P1' or coalesce(new_json,old_json)->>'business_contract_version' is distinct from '2' or coalesce(new_json,old_json)->>'owner_account_id' is distinct from actor::text)
    or tg_table_name='trip_activity_details' and (coalesce(new_json,old_json)->>'event_id') is distinct from current_setting('otr.core.target_item',true)
    or tg_table_name in ('trip_item_participants','trip_item_visibility_people') and (coalesce(new_json,old_json)->>'item_id') is distinct from current_setting('otr.core.target_item',true)
    or tg_table_name in ('trip_activity_details','trip_item_participants','trip_item_visibility_people') and not exists(select 1 from public.itinerary_events event where event.id=nullif(current_setting('otr.core.target_item',true),'')::uuid and event.trip_id=trip and event.experience_family='P1' and event.owner_account_id=actor)
    or tg_table_name='trip_core_command_receipts' and (tg_op<>'INSERT' or new_json->>'actor_account_id' is distinct from actor::text)
    then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
  else
  if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'$new$;
 body:=replace(body,old,replacement);
 old:=$old$then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 end if;
 if tg_table_name$old$;
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'NORMAL_WRITE_GUARD_SUFFIX_MISMATCH';END IF;
 body:=replace(body,old,$new$then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
  end if;
 end if;
 if tg_table_name$new$);
 old:=$old$if current_user<>'otr_trip_core_v2_writer' or not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled) then$old$;
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'SUSTAINED_GLOBAL_GUARD_PREIMAGE_MISMATCH';END IF;
 body:=replace(body,old,$new$if current_user<>'otr_trip_core_v2_writer' or (not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled) and not public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE')) then$new$);
 EXECUTE body;
 body:=pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure);
 old:=$old$or current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM'$old$;
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'NORMAL_READ_STATE_PREIMAGE_MISMATCH';END IF;
 EXECUTE replace(body,old,$new$or (current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM' and not (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and current_setting('otr.core.command',true) in ('SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION')))$new$);
END $patch$;
COMMIT;
