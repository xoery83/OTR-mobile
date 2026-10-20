-- Core89: read-only owning Source scope and compatible admission serialization.
begin;
create function public.trip_core_lock_source_scope(actor uuid,trip uuid,source uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$ declare scope jsonb;source_row public.trip_sources;begin
 if session_user<>'otr_trip_core_v2_gateway' or actor is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 perform public.trip_import_scope_lock(actor,trip);
 scope:=public.trip_core_lock_actor_scope(actor,trip);
 if scope->>'active'<>'true' then return false;end if;
 select * into source_row from public.trip_sources where id=source and trip_id=trip and acquired_by=actor for update;
 if source_row.id is null then return false;end if;
 perform 1 from public.trip_source_runs where trip_id=trip and actor_account_id=actor and source=any(scope_source_ids) order by id for share;
 perform 1 from public.trip_source_inputs where run_id in (select id from public.trip_source_runs where trip_id=trip and actor_account_id=actor and source=any(scope_source_ids)) order by id for share;
 perform 1 from public.trip_source_candidates where run_id in (select id from public.trip_source_runs where trip_id=trip and actor_account_id=actor and source=any(scope_source_ids)) order by id for share;
 perform 1 from public.trip_source_confirmations where trip_id=trip and actor_account_id=actor order by id for share;
 perform 1 from public.trip_source_output_slots where source_row.id in (select source_id from public.trip_source_inputs where confirmation_id=trip_source_output_slots.confirmation_id) order by slot_id for share;
 return true;
end $$;
revoke all on function public.trip_core_lock_source_scope(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_lock_source_scope(uuid,uuid,uuid) to otr_trip_core_v2_gateway;
grant execute on function public.trip_import_scope_lock(uuid,uuid) to otr_trip_core_v2_gateway;
create function public.trip_core_source_readable(source uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select session_user='otr_trip_core_v2_gateway' and exists(select 1 from public.trip_sources where id=source and trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and acquired_by=nullif(current_setting('otr.core.actor',true),'')::uuid) $$;
revoke all on function public.trip_core_source_readable(uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_source_readable(uuid) to otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
grant select on public.trip_sources to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_sources for select to otr_trip_core_v2_writer using(public.trip_core_source_readable(id));
grant select on public.trip_source_revisions to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_revisions for select to otr_trip_core_v2_writer using(public.trip_core_source_readable(source_id));
grant select on public.trip_source_representations to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_representations for select to otr_trip_core_v2_writer using(public.trip_core_source_readable(source_id));
grant select on public.trip_source_runs to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_runs for select to otr_trip_core_v2_writer using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and actor_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and not exists(select 1 from unnest(scope_source_ids) src(id) where not public.trip_core_source_readable(src.id)));
grant select on public.trip_source_confirmations to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_confirmations for select to otr_trip_core_v2_writer using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and actor_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid);
grant select on public.trip_source_inputs to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_inputs for select to otr_trip_core_v2_writer using(public.trip_core_source_readable(source_id));
grant select on public.trip_source_candidates to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_candidates for select to otr_trip_core_v2_writer using(exists(select 1 from public.trip_source_runs r where r.id=run_id and r.trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and r.actor_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and not exists(select 1 from unnest(r.scope_source_ids) src(id) where not public.trip_core_source_readable(src.id))));
grant select on public.trip_source_run_predecessors to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_run_predecessors for select to otr_trip_core_v2_writer using(exists(select 1 from public.trip_source_runs r where r.id=child_run_id and r.trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and r.actor_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and not exists(select 1 from unnest(r.scope_source_ids) src(id) where not public.trip_core_source_readable(src.id))) and exists(select 1 from public.trip_source_runs r where r.id=parent_run_id and r.trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and r.actor_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and not exists(select 1 from unnest(r.scope_source_ids) src(id) where not public.trip_core_source_readable(src.id))));
grant select on public.trip_source_candidate_lineage to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_candidate_lineage for select to otr_trip_core_v2_writer using(exists(select 1 from public.trip_source_candidates c where c.id=child_candidate_id) and exists(select 1 from public.trip_source_candidates c where c.id=parent_candidate_id));
grant select on public.trip_source_output_slots to otr_trip_core_v2_writer;
create policy core_v2_source_read on public.trip_source_output_slots for select to otr_trip_core_v2_writer using(exists(select 1 from public.trip_source_confirmations c where c.id=confirmation_id and c.trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and c.actor_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid));
grant execute on function public.trip_import_input_valid(public.trip_source_inputs,uuid,uuid,boolean),
 public.trip_import_locators_valid(jsonb,uuid[]),public.trip_import_run_input_hash(jsonb),
 public.trip_import_value_valid(text,jsonb),public.trip_import_field_key_valid(text),
 public.trip_event_keys(jsonb,text[],text[]),public.trip_flight_services_valid(jsonb),
 public.trip_source_hash(text,jsonb),public.trip_event_canonical_json(json,integer)
 to otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
-- Gateway cannot read private operational object locators directly.
revoke select on public.trip_operational_documents from otr_trip_core_v2_gateway;
grant select(id,trip_id,revision,owner_account_id,visibility,hidden_at,created_at,updated_at,field_state,title,media_type,byte_size,sha256,custody,source_representation_id,content_version,ticket_face_index,qr_region,custody_receipt_id) on public.trip_operational_documents to otr_trip_core_v2_gateway;
commit;
