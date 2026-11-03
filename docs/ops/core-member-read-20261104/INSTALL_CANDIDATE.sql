-- Candidate only. New protected function/EXECUTE requires exact Owner approval.
BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
DO $pre$ BEGIN
 IF current_user<>'postgres' OR current_setting('otr.core.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.core.member_read_gate',true) IS DISTINCT FROM 'OTR_CORE_MEMBER_READ_SCOPE_V1'
 THEN RAISE EXCEPTION 'CORE_MEMBER_READ_EXACT_GATE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.trip_sustained_core_read_scope_allowed(uuid,uuid)') IS NOT NULL
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure) IS DISTINCT FROM '3339e0dce619dbd8d92651c3ccf213eb'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_sustained_core_capabilities(uuid,uuid)'::regprocedure) IS DISTINCT FROM '85ddf997f6984bbf771f22c728843553'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure) IS DISTINCT FROM '2ffdada2e9916df010b960e84f77bffb'
 THEN RAISE EXCEPTION 'CORE_MEMBER_READ_PREIMAGE_DRIFT'; END IF;
END $pre$;
CREATE FUNCTION public.trip_sustained_core_read_scope_allowed(actor uuid, trip uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $read$
DECLARE principal record; policy record; owner_id oid;
BEGIN
 IF current_user<>'postgres' OR session_user<>'otr_trip_core_v2_gateway' OR actor IS NULL OR trip IS NULL
 OR actor IS DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
 OR trip IS DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
 OR otr_auth_guest_composite.has_scope() THEN RETURN false; END IF;
 -- Same existing normal Gateway constraints, without the caller's Owner/write predicate.
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname='postgres';
 SELECT * INTO principal FROM pg_roles WHERE rolname=session_user;
 IF NOT FOUND OR NOT principal.rolcanlogin OR principal.rolconnlimit<>1
 OR principal.rolvaliduntil IS NOT NULL AND principal.rolvaliduntil<>'infinity'::timestamptz
 OR principal.rolsuper OR principal.rolcreatedb OR principal.rolcreaterole OR principal.rolinherit OR principal.rolbypassrls OR principal.rolreplication
 OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=principal.oid AND deptype='o')
 OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE (m.roleid=principal.oid OR m.member=principal.oid) AND NOT (
  (m.member=owner_id AND m.roleid=principal.oid AND m.admin_option AND NOT m.inherit_option)
  OR (m.member=principal.oid AND m.roleid='otr_trip_core_v2_writer'::regrole AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)))
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_writer' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication))
 THEN RETURN false; END IF;
 SELECT * INTO policy FROM public.trip_sustained_dev_policy WHERE actor_account_id=actor FOR SHARE;
 IF FOUND AND (NOT policy.enabled OR policy.revoked_at IS NOT NULL) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND is_anonymous IS FALSE AND deleted_at IS NULL
  AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=actor) THEN RETURN false; END IF;
 -- Create Receipt identifies an already rolled-out Trip, never the reader's Owner authority.
 IF NOT EXISTS(SELECT 1 FROM public.trip_create_receipts receipt JOIN public.trips t
  ON t.id=receipt.trip_id AND t.created_by=receipt.actor_account_id
  WHERE receipt.trip_id=trip AND receipt.request_payload->'formatVersion'='2'::jsonb) THEN RETURN false; END IF;
 RETURN (SELECT count(*)=1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked');
END $read$;
REVOKE ALL ON FUNCTION public.trip_sustained_core_read_scope_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION public.trip_sustained_core_read_scope_allowed(uuid,uuid) TO otr_trip_core_v2_gateway;
DO $post$ DECLARE f pg_proc%ROWTYPE; BEGIN
 SELECT * INTO STRICT f FROM pg_proc WHERE oid='public.trip_sustained_core_read_scope_allowed(uuid,uuid)'::regprocedure;
 IF f.proowner<>'postgres'::regrole OR NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
 OR (SELECT count(*) FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))))<>2
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
  WHERE a.grantee NOT IN (f.proowner,'otr_trip_core_v2_gateway'::regrole) OR a.grantor<>f.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
 THEN RAISE EXCEPTION 'CORE_MEMBER_READ_HELPER_ACL_DRIFT'; END IF;
END $post$;
COMMIT;
