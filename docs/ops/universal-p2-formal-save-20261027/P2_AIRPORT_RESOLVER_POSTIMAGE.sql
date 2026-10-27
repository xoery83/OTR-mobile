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
 from (select * from public.trip_core_airport_identities where namespace=airport_namespace and issuer=airport_issuer and airport_code=code and enabled and valid_from<=service_date and (valid_until is null or valid_until>=service_date) and (registry_version<>'otr-dev-universal-p2-airports/20261027/1' or (actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid and trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid and service_date='2026-11-02'::date)) order by registry_version,valid_from limit 2 for share) r;
 if jsonb_array_length(identities)=1 then return identities->0;end if;
 return null;
end $function$
