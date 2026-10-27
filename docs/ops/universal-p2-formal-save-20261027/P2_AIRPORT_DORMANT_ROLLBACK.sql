BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714027,3);
DO $guard$ BEGIN
 IF ((SELECT md5(pg_get_functiondef('public.trip_core_resolve_airport(text,text,text,date)'::regprocedure))) IS DISTINCT FROM '1bfcf2b5daabcab72dd75036ad49122e' AND (SELECT md5(pg_get_functiondef('public.trip_core_resolve_airport(text,text,text,date)'::regprocedure))) IS DISTINCT FROM '666ff90bad5c706a6007691a3328df75') OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_core_resolve_airport(text,text,text,date)'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_core_resolve_airport(text,text,text,date)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_gateway=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_AIRPORT_ROLLBACK_FUNCTION_DRIFT'; END IF;
 IF (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY airport_code),'[]'::jsonb) FROM public.trip_core_airport_identities r WHERE registry_version='otr-dev-universal-p2-airports/20261027/1') IS DISTINCT FROM '[{"airport_code":"AKL","enabled":false,"identity_id":"IATA_AIRPORT:AKL","issuer":"IATA","namespace":"IATA_AIRPORT","registry_sha256":"19066b80cbd09c04b365b175e41d7f3a6cbd0f36fe79172187f28756bf8c00e9","registry_version":"otr-dev-universal-p2-airports/20261027/1","valid_from":"2026-11-02","valid_until":"2026-11-02"},{"airport_code":"CHC","enabled":false,"identity_id":"IATA_AIRPORT:CHC","issuer":"IATA","namespace":"IATA_AIRPORT","registry_sha256":"19066b80cbd09c04b365b175e41d7f3a6cbd0f36fe79172187f28756bf8c00e9","registry_version":"otr-dev-universal-p2-airports/20261027/1","valid_from":"2026-11-02","valid_until":"2026-11-02"}]'::jsonb THEN RAISE EXCEPTION 'P2_AIRPORT_ROLLBACK_ACTIVE_OR_DRIFT'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.trip_core_resolve_airport(airport_namespace text, airport_issuer text, code text, service_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ declare actor uuid;trip uuid;scope jsonb;identities jsonb;begin
 if session_user<>'otr_trip_core_v2_gateway' or current_user not in ('postgres','supabase_admin') then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;
 trip:=nullif(current_setting('otr.core.trip',true),'')::uuid;
 if actor is null or trip is null then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 scope:=public.trip_core_lock_actor_scope(actor,trip);
 if scope->>'active'<>'true' then raise exception 'NOT_VISIBLE' using errcode='42501';end if;
 if airport_namespace<>'IATA_AIRPORT' or airport_issuer<>'IATA' or code !~ '^[A-Z]{3}$' or service_date is null or not isfinite(service_date) then return null;end if;
 select jsonb_agg(jsonb_build_object('namespace',r.namespace,'issuer',r.issuer,'code',r.airport_code,'identityId',r.identity_id,'registryVersion',r.registry_version,'registrySha256',r.registry_sha256,'validFrom',r.valid_from,'validUntil',r.valid_until)) into identities
 from (select * from public.trip_core_airport_identities where namespace=airport_namespace and issuer=airport_issuer and airport_code=code and enabled and valid_from<=service_date and (valid_until is null or valid_until>=service_date) order by registry_version,valid_from limit 2 for share) r;
 if jsonb_array_length(identities)=1 then return identities->0;end if;
 return null;
end $function$
;
COMMIT;
