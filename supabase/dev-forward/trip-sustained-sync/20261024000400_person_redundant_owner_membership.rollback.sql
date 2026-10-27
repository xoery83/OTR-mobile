BEGIN;SET LOCAL search_path=pg_catalog;DO $$BEGIN IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE enabled) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_person_command_gateway') AND rolcanlogin) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_person_command_gateway')) THEN RAISE EXCEPTION 'PERSON_MEMBERSHIP_ROLLBACK_REQUIRES_CLOSED';END IF;IF md5(pg_get_functiondef('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure)) IS DISTINCT FROM '5c8c33ec3d6b9547451c64f67f769d4d' THEN RAISE EXCEPTION 'PERSON_MEMBERSHIP_POSTIMAGE_DRIFT';END IF;END$$;
CREATE OR REPLACE FUNCTION public.trip_sustained_dev_scope_allowed(actor uuid, trip uuid, operation uuid, kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
END $function$;COMMIT;