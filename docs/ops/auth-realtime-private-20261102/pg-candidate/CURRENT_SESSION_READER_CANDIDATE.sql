-- CANDIDATE ONLY. New protected EXECUTE requires an exact Owner Gate; not an installer.
BEGIN;
CREATE FUNCTION public.otr_private_realtime_current_session(requested_session uuid, expected_trip uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $session$
DECLARE
 bound_actor uuid := nullif(current_setting('otr.core.actor',true),'')::uuid;
 bound_trip uuid := nullif(current_setting('otr.core.trip',true),'')::uuid;
 identity jsonb;
 session_deadline timestamptz;
BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' OR current_user<>'postgres'
 OR bound_actor IS NULL OR bound_trip IS NULL OR expected_trip IS DISTINCT FROM bound_trip
 OR bound_actor='00000000-0000-0000-0000-000000000000'::uuid
 OR bound_trip='00000000-0000-0000-0000-000000000000'::uuid
 OR requested_session IS NULL OR requested_session='00000000-0000-0000-0000-000000000000'::uuid
 THEN RAISE EXCEPTION 'PRIVATE_REALTIME_SESSION_SCOPE_REQUIRED'; END IF;
 SELECT jsonb_build_object('sessionId',s.id,'accountId',s.user_id,'tripId',bound_trip),s.not_after
 INTO identity,session_deadline FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id=requested_session AND s.user_id=bound_actor
 AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
 AND u.is_anonymous IS FALSE AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
 FOR SHARE OF s,u;
 -- A lock owner may change no row while the Session deadline passes.
 IF identity IS NULL OR (session_deadline IS NOT NULL AND session_deadline<=clock_timestamp())
 THEN RAISE EXCEPTION 'PRIVATE_REALTIME_SESSION_NOT_CURRENT'; END IF;
 RETURN identity;
END
$session$;
REVOKE ALL ON FUNCTION public.otr_private_realtime_current_session(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.otr_private_realtime_current_session(uuid,uuid) TO otr_trip_core_v2_gateway;
COMMIT;
