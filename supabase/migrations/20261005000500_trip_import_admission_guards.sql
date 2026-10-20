begin;
set local search_path=pg_catalog;
-- Invoker-only helpers: no CREATE, membership, SET ROLE or runtime activation grant.
create function public.trip_import_scope_lock(actor uuid,trip uuid)
returns void language plpgsql volatile security invoker set search_path=pg_catalog
as $$ begin
 perform pg_advisory_xact_lock_shared(hashtextextended('otr-source-activation-v1',0));
 perform pg_advisory_xact_lock_shared(730401,1);
 perform pg_advisory_xact_lock(hashtextextended('otr-c-admission/'||trip||'/'||actor,0));
end $$;
create function public.trip_import_require_gate()
returns void language plpgsql stable security invoker set search_path=pg_catalog
as $$ begin
 if not exists(select 1 from public.trip_import_admission_gate where singleton and adapter_version=1 and flight_admission_enabled) then raise exception 'IMPORT_ADMISSION_DISABLED' using errcode='42501'; end if;
end $$;
create function public.trip_import_input_valid(pin public.trip_source_inputs,actor uuid,trip uuid,current_observation boolean)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog
as $$ declare s public.trip_sources; r public.trip_source_representations; m public.trip_source_revisions; bad boolean; n integer; nodes uuid[];
begin
 select * into s from public.trip_sources where id=pin.source_id;
 select * into r from public.trip_source_representations where id=pin.representation_id and source_id=pin.source_id;
 select * into m from public.trip_source_revisions where source_id=pin.source_id and material_revision=pin.material_revision;
 if s.id is null or r.id is null or m.source_id is null or s.trip_id<>trip or s.acquired_by<>actor then return false; end if;
 if pin.payload_sha256 is null then return r.retention_state='IDENTITY_ONLY' and pin.byte_count is null and not current_observation; end if;
 if r.payload_sha256 is distinct from pin.payload_sha256 or r.byte_count is distinct from pin.byte_count then return false; end if;
 if current_observation and (s.lifecycle<>'ACTIVE' or s.retention_state<>'RETAINED' or s.row_revision<>pin.observed_source_row_revision or r.retention_state<>'RETAINED' or m.retention_state<>'RETAINED' or not pin.historical_selection and s.current_material_revision<>pin.material_revision or r.material_kind='BINARY' and r.remote_state<>'VERIFIED') then return false; end if;
 with recursive ancestry(id) as (
  select r.id union select parent.id from ancestry a join public.trip_source_representations member on member.id=a.id and member.source_id=pin.source_id join public.trip_source_representations parent on parent.id=any(member.parent_ids) and parent.source_id=pin.source_id
 ) select array(select id from ancestry limit 65) into nodes;
 if cardinality(nodes)>64 then return false;end if;
 if exists(select 1 from public.trip_source_representations member where member.id=any(nodes) and (member.retention_state<>'RETAINED' or cardinality(member.parent_ids)=0 and not member.id=any(m.original_representation_ids) or exists(select 1 from unnest(member.parent_ids) parents(id) where not exists(select 1 from public.trip_source_representations parent where parent.id=parents.id and parent.source_id=pin.source_id and parent.id=any(nodes))))) then return false;end if;
 with recursive reach(start_id,ancestor_id) as (
  select member.id,parent from public.trip_source_representations member cross join lateral unnest(member.parent_ids) parent where member.id=any(nodes)
  union select path.start_id,parent from reach path join public.trip_source_representations member on member.id=path.ancestor_id and member.id=any(nodes) cross join lateral unnest(member.parent_ids) parent
 ) select coalesce(bool_or(start_id=ancestor_id),false) into bad from reach;
 return cardinality(nodes) between 1 and 64 and not bad;
end $$;
create function public.trip_import_lineage_candidates(candidate uuid)
returns uuid[] language plpgsql stable security invoker set search_path=pg_catalog
as $$ declare ids uuid[]; runs uuid[]; selected public.trip_source_runs;
begin
 with recursive ancestors(id) as (
  select run_id from public.trip_source_candidates where id=candidate
  union select p.parent_run_id from public.trip_source_run_predecessors p join ancestors r on p.child_run_id=r.id
 ), related(id) as (
  select id from ancestors
  union select p.child_run_id from public.trip_source_run_predecessors p join related r on p.parent_run_id=r.id
 ) select array(select id from related limit 65) into runs;
 if cardinality(runs)>64 then raise exception 'UNRESOLVED_MATCH_LIMIT';end if;
 select r.* into selected from public.trip_source_candidates c join public.trip_source_runs r on r.id=c.run_id where c.id=candidate;
 if exists(select 1 from public.trip_source_output_slots claim join public.trip_source_candidates c on c.id=claim.candidate_id join public.trip_source_runs r on r.id=c.run_id where claim.disposition='CREATE' and claim.create_claim_active and r.trip_id=selected.trip_id and r.actor_account_id=selected.actor_account_id and r.scope_source_ids && selected.scope_source_ids and not r.id=any(runs)) then raise exception 'UNRESOLVED_MATCH';end if;
 select array_agg(c.id order by c.id) into ids from public.trip_source_candidates c where c.run_id=any(runs);
 if coalesce(cardinality(ids),0)>64 then raise exception 'UNRESOLVED_MATCH_LIMIT'; end if;
 return coalesce(ids,'{}');
end $$;
create function public.trip_import_claim_check(slot public.trip_source_output_slots)
returns void language plpgsql stable security invoker set search_path=pg_catalog
as $$ declare ancestor public.trip_source_output_slots; mapping public.trip_source_slot_lineage_dispositions; n integer:=0; target uuid;
begin
 if slot.disposition not in ('CREATE','UPDATE') then return; end if;
 for ancestor in select * from public.trip_source_output_slots s where s.slot_id<>slot.slot_id and s.candidate_id=any(public.trip_import_lineage_candidates(slot.candidate_id)) and s.disposition='CREATE' and s.create_claim_active order by s.slot_id loop
  n:=n+1; if n>64 then raise exception 'UNRESOLVED_MATCH_LIMIT'; end if;
  select * into mapping from public.trip_source_slot_lineage_dispositions where slot_id=slot.slot_id and ancestor_candidate_id=ancestor.candidate_id and ancestor_slot_key=ancestor.slot_key;
  if mapping.relation='DISTINCT_OUTPUT' and slot.slot_key<>ancestor.slot_key then continue; end if;
  if ancestor.candidate_id<>slot.candidate_id and mapping.slot_id is null then raise exception 'UNRESOLVED_MATCH'; end if;
  if ancestor.state in ('PREPARED','OUTCOME_UNKNOWN') or ancestor.receipt_sha256 is null then raise exception 'PREDECESSOR_OUTCOME_UNKNOWN'; end if;
  if slot.disposition='CREATE' then raise exception 'KNOWN_PREDECESSOR_TARGET'; end if;
  if ancestor.result_target_id is distinct from slot.intended_target_id or target is not null and target<>ancestor.result_target_id then raise exception 'INCOMPATIBLE_MERGE_TARGETS'; end if;
  target:=ancestor.result_target_id;
 end loop;
end $$;
create function public.trip_import_catalog_write_guard()
returns trigger language plpgsql volatile security invoker set search_path=pg_catalog
as $$ declare a jsonb; b jsonb; mutable text[]; run public.trip_source_runs;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' or tg_op in ('DELETE','TRUNCATE') then raise exception 'IMPORT_CATALOG_PROTECTED' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if tg_table_name in ('trip_source_runs','trip_source_confirmations','trip_source_associations') and (to_jsonb(new)->>'row_revision')::bigint<>1 then raise exception 'INVALID_IMPORT_REVISION'; end if;
  if tg_table_name='trip_source_candidates' then select * into run from public.trip_source_runs where id=new.run_id;
  elsif tg_table_name='trip_source_run_predecessors' then select * into run from public.trip_source_runs where id=new.child_run_id;
  elsif tg_table_name='trip_source_candidate_lineage' then select r.* into run from public.trip_source_candidates c join public.trip_source_runs r on r.id=c.run_id where c.id=new.child_candidate_id; end if;
  if run.id is not null and run.state not in ('PENDING','RUNNING') then raise exception 'RUN_PUBLICATION_SEALED'; end if;
  return new;
 end if;
 a:=to_jsonb(old); b:=to_jsonb(new);
 mutable:=case tg_table_name
  when 'trip_source_runs' then array['row_revision','state','superseded_by','completed_at','error_code','retention_state']
  when 'trip_source_confirmations' then array['row_revision','state','retention_state']
  when 'trip_source_output_slots' then array['state','dispatched_at','receipt_ref','result_target_kind','result_target_id','result_revision','receipt_sha256','finalization_state','failure_code','retention_state','create_claim_active','no_commit_basis','no_commit_receipt_ref','no_commit_receipt_sha256','no_commit_at']
  when 'trip_source_associations' then array['state','row_revision','inactive_reason','inactive_at','inactive_by'] else '{}'::text[] end;
 if a-mutable is distinct from b-mutable or cardinality(mutable)=0 then raise exception 'IMPORT_INTENT_IMMUTABLE'; end if;
 if tg_table_name in ('trip_source_runs','trip_source_confirmations','trip_source_associations') and b->>'row_revision' is distinct from ((a->>'row_revision')::bigint+1)::text then raise exception 'INVALID_IMPORT_REVISION'; end if;
 if tg_table_name='trip_source_runs' and (old.state in ('READY','FAILED') and new.state<>old.state or old.state='RUNNING' and new.state='PENDING') then raise exception 'RUN_PUBLICATION_SEALED'; end if;
 if tg_table_name='trip_source_output_slots' then
  if old.receipt_sha256 is not null and a-array['state','finalization_state','failure_code'] is distinct from b-array['state','finalization_state','failure_code'] then raise exception 'IMPORT_RESULT_IMMUTABLE'; end if;
  if old.dispatched_at is not null and old.dispatched_at is distinct from new.dispatched_at or old.no_commit_basis is not null and a-array['failure_code'] is distinct from b-array['failure_code'] then raise exception 'IMPORT_RESULT_IMMUTABLE'; end if;
  if not (old.state=new.state or old.state='PREPARED' and new.state in ('OUTCOME_UNKNOWN','CANCELED','DOMAIN_SUCCEEDED') or old.state='OUTCOME_UNKNOWN' and new.state in ('DOMAIN_SUCCEEDED','FAILED','CONFLICTED') or old.state='DOMAIN_SUCCEEDED' and new.state in ('FINALIZED','EVIDENCE_PENDING') or old.state='EVIDENCE_PENDING' and new.state='FINALIZED') then raise exception 'INVALID_IMPORT_TRANSITION'; end if;
  if old.create_claim_active and not new.create_claim_active and new.no_commit_basis is null then raise exception 'NO_COMMIT_PROOF_REQUIRED'; end if;
 end if;
 return new;
end $$;
create function public.trip_import_catalog_scope_guard()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog
as $$ declare trip uuid; actor uuid; parent public.trip_source_runs; child public.trip_source_runs; pin public.trip_source_inputs; slot public.trip_source_output_slots; confirmation public.trip_source_confirmations; bad boolean; nodes integer;
begin
 if tg_table_name='trip_source_inputs' then
  select * into pin from public.trip_source_inputs where id=new.id;
  if pin.run_id is not null then select trip_id,actor_account_id into trip,actor from public.trip_source_runs where id=pin.run_id;
  else select trip_id,actor_account_id into trip,actor from public.trip_source_confirmations where id=pin.confirmation_id; end if;
  if not public.trip_import_input_valid(pin,actor,trip,false) then raise exception 'INVALID_IMPORT_INPUT'; end if;
 elsif tg_table_name='trip_source_run_predecessors' then
  select * into child from public.trip_source_runs where id=new.child_run_id;
  select * into parent from public.trip_source_runs where id=new.parent_run_id;
  if parent.state<>'READY' or child.trip_id<>parent.trip_id or child.actor_account_id<>parent.actor_account_id or new.relation='REPROCESS' and child.scope_source_ids<>parent.scope_source_ids then raise exception 'INVALID_RUN_LINEAGE'; end if;
  with recursive ancestry(id) as (select p.parent_run_id from public.trip_source_run_predecessors p where p.child_run_id=new.child_run_id union select p.parent_run_id from public.trip_source_run_predecessors p join ancestry a on p.child_run_id=a.id) select count(*)::integer,coalesce(bool_or(id=new.child_run_id),false) into nodes,bad from ancestry;
  if nodes>=64 or bad then raise exception 'INVALID_RUN_LINEAGE'; end if;
 elsif tg_table_name='trip_source_candidate_lineage' then
  select r.* into child from public.trip_source_candidates c join public.trip_source_runs r on r.id=c.run_id where c.id=new.child_candidate_id;
  select r.* into parent from public.trip_source_candidates c join public.trip_source_runs r on r.id=c.run_id where c.id=new.parent_candidate_id;
  if child.trip_id<>parent.trip_id or child.actor_account_id<>parent.actor_account_id or not exists(with recursive ancestry(id) as (select p.parent_run_id from public.trip_source_run_predecessors p where p.child_run_id=child.id union select p.parent_run_id from public.trip_source_run_predecessors p join ancestry a on p.child_run_id=a.id) select 1 from ancestry where id=parent.id) then raise exception 'INVALID_CANDIDATE_LINEAGE'; end if;
  with recursive ancestry(id) as (select p.parent_candidate_id from public.trip_source_candidate_lineage p where p.child_candidate_id=new.child_candidate_id union select p.parent_candidate_id from public.trip_source_candidate_lineage p join ancestry a on p.child_candidate_id=a.id) select count(*)::integer,coalesce(bool_or(id=new.child_candidate_id),false) into nodes,bad from ancestry;
  if nodes>=64 or bad then raise exception 'INVALID_CANDIDATE_LINEAGE'; end if;
 elsif tg_table_name='trip_source_runs' then
  select * into child from public.trip_source_runs where id=new.id;
  if exists(select 1 from unnest(child.scope_source_ids) scopes(id) left join public.trip_sources s on s.id=scopes.id where s.id is null or s.trip_id<>child.trip_id or s.acquired_by<>child.actor_account_id) then raise exception 'INVALID_RUN_SCOPE'; end if;
  if child.superseded_by is not null and not exists(select 1 from public.trip_source_runs r where r.id=child.superseded_by and r.trip_id=child.trip_id and r.actor_account_id=child.actor_account_id and r.scope_source_ids=child.scope_source_ids and r.generation>child.generation) then raise exception 'INVALID_RUN_SUPERSESSION'; end if;
  if child.state='READY' and ((select count(*) from public.trip_source_inputs where run_id=child.id) not between 1 and 64 or (select count(*) from public.trip_source_candidates where run_id=child.id)>64 or (select coalesce(sum(octet_length(public.trip_event_canonical_json(proposal::json))),0) from public.trip_source_candidates where run_id=child.id)>4194304) then raise exception 'INVALID_RUN_PUBLICATION'; end if;
 elsif tg_table_name in ('trip_source_output_slots','trip_source_confirmations','trip_source_slot_lineage_dispositions','trip_source_slot_dependencies') then
  if tg_table_name='trip_source_confirmations' then select * into confirmation from public.trip_source_confirmations where id=new.id;
  else select s.* into slot from public.trip_source_output_slots s where s.slot_id=new.slot_id; select * into confirmation from public.trip_source_confirmations where id=slot.confirmation_id; end if;
  if (select count(*) from public.trip_source_output_slots where confirmation_id=confirmation.id) not between 1 and 64 or (select count(*) from public.trip_source_inputs where confirmation_id=confirmation.id)>64 then raise exception 'INVALID_CONFIRMATION_PUBLICATION'; end if;
  for slot in select * from public.trip_source_output_slots where confirmation_id=confirmation.id loop
   if slot.domain_operation_key is not null and (select count(*) from public.trip_source_output_slots s join public.trip_source_confirmations c on c.id=s.confirmation_id where c.trip_id=confirmation.trip_id and c.actor_account_id=confirmation.actor_account_id and s.domain_operation_key=slot.domain_operation_key)>1 then raise exception 'DOMAIN_OPERATION_KEY_REUSED' using errcode='23505';end if;
   if slot.candidate_id is not null and not exists(select 1 from public.trip_source_runs r where r.id=slot.reviewed_run_id and r.trip_id=confirmation.trip_id and r.actor_account_id=confirmation.actor_account_id and r.state='READY') then raise exception 'INVALID_REVIEW_SCOPE'; end if;
   if slot.candidate_id is not null and not exists(select 1 from public.trip_source_candidates p where p.id=slot.candidate_id and p.run_id=slot.reviewed_run_id) then raise exception 'INVALID_REVIEW_SCOPE';end if;
   if slot.disposition in ('CREATE','UPDATE') and (slot.adapter_key<>'itinerary-event-v1' or slot.intended_target_kind<>'ITINERARY_EVENT' or slot.domain_operation_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') or slot.disposition='LINK_ONLY' then raise exception 'UNSUPPORTED_IMPORT_ADAPTER'; end if;
   if (slot.disposition='UPDATE' or slot.result_target_id is not null) and not exists(select 1 from public.itinerary_events e where e.id=slot.intended_target_id and e.trip_id=confirmation.trip_id) then raise exception 'INVALID_IMPORT_TARGET'; end if;
   if slot.disposition='CREATE' and slot.no_commit_basis is null and not slot.create_claim_active then raise exception 'CREATE_CLAIM_REQUIRED'; end if;
   if slot.state='PREPARED' then perform public.trip_import_claim_check(slot); end if;
  end loop;
  if tg_table_name in ('trip_source_slot_lineage_dispositions','trip_source_slot_dependencies') then select * into slot from public.trip_source_output_slots where slot_id=new.slot_id; end if;
  if tg_table_name='trip_source_slot_lineage_dispositions' then
   if (new.reviewed_by<>confirmation.actor_account_id or not new.ancestor_candidate_id=any(public.trip_import_lineage_candidates(slot.candidate_id)) or new.relation='DISTINCT_OUTPUT' and new.ancestor_slot_key=slot.slot_key) then raise exception 'INVALID_LINEAGE_DISPOSITION'; end if;
  end if;
  if tg_table_name='trip_source_slot_dependencies' then
   if not exists(select 1 from public.trip_source_output_slots p join public.trip_source_confirmations c on c.id=p.confirmation_id where p.slot_id=new.predecessor_slot_id and c.trip_id=confirmation.trip_id and c.actor_account_id=confirmation.actor_account_id and p.receipt_sha256=new.expected_receipt_sha256 and p.result_target_id=new.expected_target_id and p.result_revision=new.expected_result_revision and slot.intended_target_id=p.result_target_id and slot.base_revision=p.result_revision) then raise exception 'INVALID_SLOT_DEPENDENCY'; end if;
   with recursive ancestry(id) as (select new.predecessor_slot_id union select d.predecessor_slot_id from public.trip_source_slot_dependencies d join ancestry a on d.slot_id=a.id) select count(*)::integer,coalesce(bool_or(id=new.slot_id),false) into nodes,bad from ancestry;
   if nodes>=64 or bad then raise exception 'INVALID_SLOT_DEPENDENCY'; end if;
  end if;
 elsif tg_table_name='trip_source_associations' then
  if new.target_kind<>'ITINERARY_EVENT' or not exists(select 1 from public.trip_sources s join public.itinerary_events e on e.id=new.target_id and e.trip_id=s.trip_id where s.id=new.source_id and s.acquired_by=new.created_by) then raise exception 'INVALID_ASSOCIATION_SCOPE'; end if;
  if new.confirmation_id is not null and not exists(select 1 from public.trip_source_confirmations c join public.trip_sources s on s.id=new.source_id and s.trip_id=c.trip_id and s.acquired_by=c.actor_account_id where c.id=new.confirmation_id) then raise exception 'INVALID_ASSOCIATION_SCOPE'; end if;
  if new.preview_input_id is not null and not exists(select 1 from public.trip_source_inputs i where i.id=new.preview_input_id and i.confirmation_id=new.confirmation_id and i.source_id=new.source_id and i.material_revision=new.preview_source_revision and i.representation_id=new.preview_representation_id) then raise exception 'INVALID_ASSOCIATION_PIN'; end if;
 end if;
 return null;
end $$;

do $$ declare name text;
begin
 foreach name in array array['trip_source_runs','trip_source_inputs','trip_source_candidates','trip_source_confirmations','trip_source_output_slots','trip_source_associations','trip_source_run_predecessors','trip_source_candidate_lineage','trip_source_slot_lineage_dispositions','trip_source_slot_dependencies'] loop
  execute format('create trigger import_write_guard before insert or update or delete on public.%I for each row execute function public.trip_import_catalog_write_guard()',name);
  execute format('create trigger import_truncate_guard before truncate on public.%I for each statement execute function public.trip_import_catalog_write_guard()',name);
  if name<>'trip_source_candidates' then execute format('create constraint trigger import_scope_guard after insert or update on public.%I deferrable initially deferred for each row execute function public.trip_import_catalog_scope_guard()',name); end if;
 end loop;
end $$;
revoke all on function public.trip_import_scope_lock(uuid,uuid),public.trip_import_require_gate(),public.trip_import_input_valid(public.trip_source_inputs,uuid,uuid,boolean),public.trip_import_lineage_candidates(uuid),public.trip_import_claim_check(public.trip_source_output_slots),public.trip_import_catalog_write_guard(),public.trip_import_catalog_scope_guard() from public,anon,authenticated,service_role;
grant execute on function public.trip_import_scope_lock(uuid,uuid),public.trip_import_require_gate() to otr_trip_source_writer,otr_trip_event_semantic_writer;
grant execute on function public.trip_import_input_valid(public.trip_source_inputs,uuid,uuid,boolean),public.trip_import_lineage_candidates(uuid),public.trip_import_claim_check(public.trip_source_output_slots),public.trip_import_catalog_write_guard(),public.trip_import_catalog_scope_guard() to otr_trip_source_writer;
commit;
