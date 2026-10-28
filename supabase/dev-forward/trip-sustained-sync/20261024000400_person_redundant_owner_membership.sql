-- Candidate only. Preserve all role memberships; recognize one exact existing redundant owner edge.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
DO $patch$
DECLARE body text;old text;replacement text;gate_table text;gate_open boolean;
BEGIN
 IF current_user<>'postgres' OR EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE enabled)
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_person_command_gateway') AND rolcanlogin)
 OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_person_command_gateway'))
 OR EXISTS(SELECT 1 FROM public.trip_core_activation_gate g WHERE runtime_enabled OR coalesce((to_jsonb(g)->>'source_review_enabled')::boolean,false))
 OR EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled) OR EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled)
 OR EXISTS(SELECT 1 FROM public.trip_person_command_gate WHERE enabled)
 THEN RAISE EXCEPTION 'PERSON_MEMBERSHIP_PATCH_REQUIRES_CLOSED';END IF;
 FOREACH gate_table IN ARRAY ARRAY['trip_source_command_gate','trip_source_pdf_gate'] LOOP
  IF to_regclass('public.'||gate_table) IS NOT NULL THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE enabled)',gate_table) INTO gate_open;
   IF gate_open THEN RAISE EXCEPTION 'PERSON_MEMBERSHIP_SOURCE_GATE_OPEN';END IF;
  END IF;
 END LOOP;
 IF md5(pg_get_functiondef('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure)) IS DISTINCT FROM '54d94b8e00ee7228cfe2d38085475089' THEN RAISE EXCEPTION 'PERSON_MEMBERSHIP_PREIMAGE_DRIFT';END IF;
 body:=pg_get_functiondef('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure);
 old:='OR(kind=''CORE'' AND m.member=principal.oid';
 replacement:='OR(kind=''PERSON'' AND m.member=owner_id AND m.roleid=principal.oid AND m.grantor=owner_id AND NOT m.admin_option AND NOT m.inherit_option AND NOT m.set_option
 AND EXISTS(SELECT 1 FROM pg_auth_members paired WHERE paired.roleid=m.roleid AND paired.member=m.member AND paired.grantor=''supabase_admin''::regrole AND paired.admin_option AND NOT paired.inherit_option AND NOT paired.set_option))
 OR(kind=''CORE'' AND m.member=principal.oid';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'PERSON_MEMBERSHIP_PATCH_ANCHOR';END IF;
 EXECUTE replace(body,old,replacement);
END $patch$;
COMMIT;
