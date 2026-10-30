-- Candidate only. Installing this new EXECUTE requires the exact Owner DEV Gate.
-- The owning result routine retains its current authorization and finite-scope checks.
CREATE FUNCTION public.trip_create_parent_result(p_actor uuid,p_trip uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE operations uuid[];
BEGIN
 IF session_user<>'otr_trip_create_gateway' OR p_actor IS NULL OR p_trip IS NULL THEN
  RAISE EXCEPTION 'TRIP_CREATE_PRINCIPAL_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 SELECT ARRAY(
  SELECT operation_id FROM public.trip_create_receipts
  WHERE actor_account_id=p_actor AND trip_id=p_trip
    AND request_payload->'formatVersion'='2'::jsonb
  ORDER BY operation_id LIMIT 2
 ) INTO operations;
 IF cardinality(operations)=0 THEN RETURN NULL; END IF;
 IF cardinality(operations)<>1 THEN
  RAISE EXCEPTION 'TRIP_CREATE_PARENT_AMBIGUOUS' USING ERRCODE='55000';
 END IF;
 RETURN public.trip_create_result(operations[1],p_actor);
END $$;
ALTER FUNCTION public.trip_create_parent_result(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trip_create_parent_result(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_create_parent_result(uuid,uuid)
 TO otr_trip_create_gateway;
