begin;
set local search_path=pg_catalog;
grant otr_trip_source_writer to postgres with set true;
grant create on schema public to otr_trip_source_writer;
create function public.trip_import_observation(row_data jsonb)
returns jsonb language plpgsql immutable security invoker set search_path=pg_catalog
as $$declare k text;begin
 foreach k in array array['created_at','captured_at','deleted_at','completed_at','verified_at','dispatched_at','no_commit_at','inactive_at','reviewed_at'] loop
  if row_data->>k is not null then row_data:=row_data||jsonb_build_object(k,public.trip_event_utc_timestamp((row_data->>k)::timestamptz));end if;
 end loop;return row_data;
end $$;
-- Private bounded Actor/Trip projection. Limits withhold the complete projection;
-- they never mark a truncated history or claim set as complete.
create function public.trip_source_read_import_catalogs(actor uuid,trip uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$declare result jsonb; name text; rows jsonb;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' or not public.trip_source_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 result:=jsonb_build_object('version',1,'trip_id',trip,'actor_account_id',actor);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(s)) order by id),'[]') into rows from (select s.* from public.trip_sources s where trip_id=trip and acquired_by=actor limit 65) s;
 result:=result||jsonb_build_object('trip_sources',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(r)) order by source_id,material_revision),'[]') into rows from (select r.* from public.trip_source_revisions r where exists(select 1 from public.trip_sources s where s.id=r.source_id and s.trip_id=trip and s.acquired_by=actor) limit 65) r;
 result:=result||jsonb_build_object('trip_source_revisions',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(r)) order by id),'[]') into rows from (select r.* from public.trip_source_representations r where exists(select 1 from public.trip_sources s where s.id=r.source_id and s.trip_id=trip and s.acquired_by=actor) limit 65) r;
 result:=result||jsonb_build_object('trip_source_representations',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(r)) order by id),'[]') into rows from (select r.* from public.trip_source_runs r where trip_id=trip and actor_account_id=actor limit 65) r;
 result:=result||jsonb_build_object('trip_source_runs',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(c)) order by id),'[]') into rows from (select c.* from public.trip_source_confirmations c where trip_id=trip and actor_account_id=actor limit 65) c;
 result:=result||jsonb_build_object('trip_source_confirmations',rows);
 select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') into rows from (select i.* from public.trip_source_inputs i where exists(select 1 from public.trip_source_runs r where r.id=i.run_id and r.trip_id=trip and r.actor_account_id=actor) or exists(select 1 from public.trip_source_confirmations c where c.id=i.confirmation_id and c.trip_id=trip and c.actor_account_id=actor) limit 65) i;
 result:=result||jsonb_build_object('trip_source_inputs',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(c)) order by id),'[]') into rows from (select c.* from public.trip_source_candidates c where exists(select 1 from public.trip_source_runs r where r.id=c.run_id and r.trip_id=trip and r.actor_account_id=actor) limit 65) c;
 result:=result||jsonb_build_object('trip_source_candidates',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(s)) order by slot_id),'[]') into rows from (select s.* from public.trip_source_output_slots s where exists(select 1 from public.trip_source_confirmations c where c.id=s.confirmation_id and c.trip_id=trip and c.actor_account_id=actor) limit 65) s;
 result:=result||jsonb_build_object('trip_source_output_slots',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(a)) order by id),'[]') into rows from (select a.* from public.trip_source_associations a where exists(select 1 from public.trip_sources s where s.id=a.source_id and s.trip_id=trip and s.acquired_by=actor) limit 65) a;
 result:=result||jsonb_build_object('trip_source_associations',rows);
 select coalesce(jsonb_agg(to_jsonb(p) order by child_run_id,parent_run_id),'[]') into rows from (select p.* from public.trip_source_run_predecessors p where exists(select 1 from public.trip_source_runs r where r.id=p.child_run_id and r.trip_id=trip and r.actor_account_id=actor) limit 65) p;
 result:=result||jsonb_build_object('trip_source_run_predecessors',rows);
 select coalesce(jsonb_agg(to_jsonb(p) order by child_candidate_id,parent_candidate_id),'[]') into rows from (select p.* from public.trip_source_candidate_lineage p where exists(select 1 from public.trip_source_candidates c join public.trip_source_runs r on r.id=c.run_id where c.id=p.child_candidate_id and r.trip_id=trip and r.actor_account_id=actor) limit 65) p;
 result:=result||jsonb_build_object('trip_source_candidate_lineage',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(p)) order by slot_id,ancestor_candidate_id,ancestor_slot_key),'[]') into rows from (select p.* from public.trip_source_slot_lineage_dispositions p where exists(select 1 from public.trip_source_output_slots s join public.trip_source_confirmations c on c.id=s.confirmation_id where s.slot_id=p.slot_id and c.trip_id=trip and c.actor_account_id=actor) limit 65) p;
 result:=result||jsonb_build_object('trip_source_slot_lineage_dispositions',rows);
 select coalesce(jsonb_agg(to_jsonb(p) order by slot_id,predecessor_slot_id),'[]') into rows from (select p.* from public.trip_source_slot_dependencies p where exists(select 1 from public.trip_source_output_slots s join public.trip_source_confirmations c on c.id=s.confirmation_id where s.slot_id=p.slot_id and c.trip_id=trip and c.actor_account_id=actor) limit 65) p;
 result:=result||jsonb_build_object('trip_source_slot_dependencies',rows);
 for name,rows in select key,value from jsonb_each(result) where jsonb_typeof(value)='array' loop
  if jsonb_array_length(rows)>64 then raise exception 'IMPORT_READ_RESOURCE_LIMIT';end if;
 end loop;
 if octet_length(public.trip_event_canonical_json(result::json))>4194304 then raise exception 'IMPORT_READ_RESOURCE_LIMIT';end if;
 return result;
end $$;
revoke all on function public.trip_import_observation(jsonb),public.trip_source_read_import_catalogs(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_import_observation(jsonb) to otr_trip_source_writer;
grant execute on function public.trip_source_read_import_catalogs(uuid,uuid) to otr_trip_source_command_gateway;
alter function public.trip_source_read_import_catalogs(uuid,uuid) owner to otr_trip_source_writer;
revoke create on schema public from otr_trip_source_writer;
grant otr_trip_source_writer to postgres with inherit false,set false;
commit;
