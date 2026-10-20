begin;
set local search_path=pg_catalog;
grant otr_trip_event_receipt_reader to postgres with set true;
grant create on schema public to otr_trip_event_receipt_reader;
-- Existing Source mutations join C serialization before admission/Source locks.
create or replace function public.trip_source_lock_scope(actor uuid,trip uuid,source uuid) returns void
language plpgsql volatile security invoker set search_path=pg_catalog
as $$begin
 perform public.trip_import_scope_lock(actor,trip);
 perform 1 from public.trips where id=trip for update;
 perform 1 from public.trip_members where trip_id=trip order by id for update;
 perform 1 from public.journey_members where trip_id=trip order by id for update;
 if not public.trip_source_admission(actor,trip,false) or not public.trip_source_admission(actor,trip,true) then raise exception 'SOURCE_ACCESS_DENIED' using errcode='42501';end if;
end $$;

create function public.trip_import_lock_admission(actor uuid,trip uuid)
returns void language plpgsql volatile security invoker set search_path=pg_catalog
as $$begin
 perform 1 from public.trips where id=trip for share;
 perform 1 from public.trip_members where trip_id=trip and user_id=actor order by id for share;
 perform 1 from public.journey_members where trip_id=trip and user_id=actor order by id for share;
 if not public.trip_source_admission(actor,trip,true) then raise exception 'FORBIDDEN' using errcode='42501';end if;
end $$;
revoke all on function public.trip_import_lock_admission(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_import_lock_admission(uuid,uuid) to otr_trip_source_writer;

create function public.guard_trip_import_services()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$begin
 if current_user<>'otr_trip_event_semantic_writer' or session_user<>'otr_trip_event_command_gateway' or tg_op='TRUNCATE' then raise exception 'TRANSPORT_SERVICES_PROTECTED' using errcode='42501';end if;
 perform public.trip_import_require_gate();
 if not exists(select 1 from public.trip_event_command_gate where singleton and enabled) then raise exception 'CANONICAL_WRITES_DISABLED' using errcode='42501';end if;
 if tg_level='STATEMENT' then return null;end if;
 if tg_op='UPDATE' and (old.event_id<>new.event_id or old.service_key<>new.service_key) then raise exception 'TRANSPORT_SERVICE_IDENTITY_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger transport_service_statement_guard before insert or update or delete or truncate on public.itinerary_transport_services for each statement execute function public.guard_trip_import_services();
create trigger transport_service_row_guard before insert or update or delete on public.itinerary_transport_services for each row execute function public.guard_trip_import_services();

create function public.assert_trip_flight_services(event uuid)
returns void language plpgsql stable security definer set search_path=pg_catalog
as $$declare services jsonb; parent public.itinerary_events;
begin
 select * into parent from public.itinerary_events where id=event;
 select jsonb_agg(to_jsonb(s)-'event_id'-'provenance_refs' order by service_key collate "C") into services from public.itinerary_transport_services s where event_id=event;
 if services is null then return;end if;
 if parent.id is null or parent.temporal_shape is distinct from 'TRANSPORT' or parent.event_type is distinct from 'transport' or parent.participant_scope is distinct from 'UNASSIGNED' or not public.trip_flight_services_valid(services) then raise exception 'INVALID_SERVICE_AGGREGATE' using errcode='23514';end if;
 if exists(select 1 from public.itinerary_transport_services s where s.event_id=event and (not public.trip_event_refs_valid(s.provenance_refs,array['operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','attribution','codeshare_operating_key'],8) or exists(select 1 from jsonb_each(to_jsonb(s)) leaf where leaf.key in ('operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','attribution','codeshare_operating_key') and (leaf.value<>'null')<>(s.provenance_refs ? leaf.key)))) then raise exception 'INVALID_SERVICE_PROVENANCE' using errcode='23514';end if;
end $$;
create function public.validate_trip_flight_services()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$begin
 if tg_table_name='itinerary_events' then perform public.assert_trip_flight_services(new.id);
 elsif tg_op='DELETE' then perform public.assert_trip_flight_services(old.event_id);
 else perform public.assert_trip_flight_services(new.event_id);end if;
 return null;
end $$;
create constraint trigger flight_service_aggregate_check after insert or update or delete on public.itinerary_transport_services deferrable initially deferred for each row execute function public.validate_trip_flight_services();
create constraint trigger flight_parent_service_check after insert or update on public.itinerary_events deferrable initially deferred for each row execute function public.validate_trip_flight_services();

-- Separate extension: no changes to Event collection/certificate or Day codecs.
create function public.trip_source_read_event_services(actor uuid,trip uuid,event uuid,expected_semantic_revision bigint)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$declare baseline bigint; rows jsonb;
begin
 if current_user<>'otr_trip_event_receipt_reader' or session_user<>'otr_trip_event_command_gateway' or not public.trip_event_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select semantic_revision into baseline from public.itinerary_events where id=event and trip_id=trip and temporal_shape='TRANSPORT';
 if baseline is null or baseline is distinct from expected_semantic_revision then return null;end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by service_key collate "C"),'[]') into rows from public.itinerary_transport_services s where event_id=event;
 return jsonb_build_object('version',1,'event_id',event,'semantic_revision',baseline,'services',rows);
end $$;
revoke all on function public.guard_trip_import_services(),public.assert_trip_flight_services(uuid),public.validate_trip_flight_services(),public.trip_source_read_event_services(uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.guard_trip_import_services() to otr_trip_event_semantic_writer;
grant execute on function public.trip_source_read_event_services(uuid,uuid,uuid,bigint) to otr_trip_event_command_gateway;
grant select(id,trip_id,semantic_revision,temporal_shape) on public.itinerary_events to otr_trip_event_receipt_reader;
grant select on public.itinerary_transport_services to otr_trip_event_receipt_reader,otr_trip_event_semantic_writer;
create policy transport_service_writer_read on public.itinerary_transport_services for select to otr_trip_event_semantic_writer using(true);
create policy transport_service_private_read on public.itinerary_transport_services for select to otr_trip_event_receipt_reader using(true);
alter function public.trip_source_read_event_services(uuid,uuid,uuid,bigint) owner to otr_trip_event_receipt_reader;
revoke create on schema public from otr_trip_event_receipt_reader;
grant otr_trip_event_receipt_reader to postgres with inherit false,set false;
commit;
