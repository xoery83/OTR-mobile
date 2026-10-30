-- Negative authority only; no user data, positive grant or activation path.
CREATE FUNCTION otr_auth_guest_composite.close_qa_policy(closing boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE active boolean; version text; row_xmin text; changed integer;
BEGIN
 IF closing IS NULL OR session_user NOT IN ('postgres','otr_trip_core_v2_gateway')
 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_PRINCIPAL_REQUIRED' USING ERRCODE='42501';END IF;
 IF closing THEN
  SELECT enabled,policy_version,xmin::text INTO active,version,row_xmin
  FROM otr_auth_guest_composite.policy WHERE singleton FOR UPDATE;
 ELSE
  SELECT enabled,policy_version INTO active,version
  FROM otr_auth_guest_composite.policy WHERE singleton;
 END IF;
 IF NOT FOUND OR version<>'otr.auth.fileless-p1.unpriced/1'
 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_POLICY_VERSION_REQUIRED' USING ERRCODE='55000';END IF;
 IF closing AND active THEN
  UPDATE otr_auth_guest_composite.policy SET enabled=false
  WHERE singleton AND enabled AND policy_version='otr.auth.fileless-p1.unpriced/1' AND xmin::text=row_xmin;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_CAS_FAILED' USING ERRCODE='40001';END IF;
  RETURN true;
 END IF;
 RETURN NOT active;
END $function$;
ALTER FUNCTION otr_auth_guest_composite.close_qa_policy(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION otr_auth_guest_composite.close_qa_policy(boolean) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION otr_auth_guest_composite.close_qa_policy(boolean) TO otr_trip_core_v2_gateway;
