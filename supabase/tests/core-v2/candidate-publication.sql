-- Only synthetic registry assignments; transaction rolls back completely.
begin;
do $$ begin
 if has_table_privilege('authenticated','public.trip_core_airport_identities','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('service_role','public.trip_core_airport_identities','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('otr_trip_core_v2_gateway','public.trip_core_airport_identities','SELECT') then raise exception 'REGISTRY_EXPOSED';end if;
 if has_function_privilege('authenticated','public.trip_core_resolve_airport(text,text,text,date)','EXECUTE') then raise exception 'REGISTRY_PUBLIC_EXECUTE';end if;
 begin perform public.trip_core_resolve_airport('IATA_AIRPORT','IATA','AKL','2026-12-14');raise exception 'WRONG_PRINCIPAL_RESOLVED';exception when insufficient_privilege then if sqlerrm<>'CORE_SCOPE_MISMATCH' then raise;end if;end;
end $$;
insert into public.trip_core_airport_identities values
 ('IATA_AIRPORT','IATA','AKL','IATA_AIRPORT:AKL','2026-01-01','2026-12-31','synthetic-registry/1',repeat('a',64),true),
 ('IATA_AIRPORT','IATA','CHC','IATA_AIRPORT:CHC','2026-01-01',null,'synthetic-registry/1',repeat('a',64),true),
 ('IATA_AIRPORT','IATA','CHC','IATA_AIRPORT:CHC','2026-06-01',null,'synthetic-overlap/2',repeat('b',64),true),
 ('IATA_AIRPORT','IATA','NSN','IATA_AIRPORT:NSN','2026-01-01',null,'synthetic-registry/1',repeat('a',64),false);
set session authorization otr_trip_core_v2_gateway;
select set_config('otr.core.actor','00000000-0000-4000-8000-000000000002',true),set_config('otr.core.trip','10000000-0000-4000-8000-000000000001',true);
do $$ declare authority jsonb;begin
 authority:=public.trip_core_resolve_airport('IATA_AIRPORT','IATA','AKL','2026-12-14');
 if authority->>'identityId'<>'IATA_AIRPORT:AKL' or authority->>'registrySha256'<>repeat('a',64) or authority->>'registryVersion'<>'synthetic-registry/1' then raise exception 'UNIQUE_ASSIGNMENT_NOT_RESOLVED';end if;
 if public.trip_core_resolve_airport('IATA_AIRPORT','IATA','AKL','2027-01-01') is not null then raise exception 'EXPIRED_ASSIGNMENT_ACCEPTED';end if;
 if public.trip_core_resolve_airport('IATA_AIRPORT','IATA','CHC','2026-12-14') is not null then raise exception 'AMBIGUOUS_ASSIGNMENT_ACCEPTED';end if;
 if public.trip_core_resolve_airport('IATA_AIRPORT','IATA','ZZZ','2026-12-14') is not null then raise exception 'SYNTACTIC_CODE_QUALIFIED';end if;
 if public.trip_core_resolve_airport('IATA_AIRPORT','IATA','NSN','2026-12-14') is not null then raise exception 'REVOKED_ASSIGNMENT_ACCEPTED';end if;
 if public.trip_core_resolve_airport('IATA_AIRPORT','ICAO','AKL','2026-12-14') is not null then raise exception 'WRONG_NAMESPACE_ISSUER_ACCEPTED';end if;
end $$;
reset session authorization;
do $$ begin
 begin update public.trip_core_airport_identities set registry_sha256=repeat('c',64) where airport_code='AKL';raise exception 'REGISTRY_PIN_MUTABLE';exception when insufficient_privilege then if sqlerrm<>'AIRPORT_AUTHORITY_IMMUTABLE' then raise;end if;end;
end $$;
update public.trip_core_airport_identities set enabled=false where airport_code='AKL';
set session authorization otr_trip_core_v2_gateway;
do $$ begin if public.trip_core_resolve_airport('IATA_AIRPORT','IATA','AKL','2026-12-14') is not null then raise exception 'REVOKED_AUTHORITY_RETAINED';end if;end $$;
select set_config('otr.core.actor','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
do $$ begin
 begin perform public.trip_core_resolve_airport('IATA_AIRPORT','IATA','CHC','2026-12-14');raise exception 'FOREIGN_ACTOR_RESOLVED';exception when insufficient_privilege then if sqlerrm<>'NOT_VISIBLE' then raise;end if;end;
end $$;
reset session authorization;
rollback;
