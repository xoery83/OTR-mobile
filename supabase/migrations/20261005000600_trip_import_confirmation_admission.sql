begin;
set local search_path=pg_catalog;
-- Migration-only ownership rights, removed before COMMIT. These are not runtime
-- CREATE or membership capabilities; all entrypoints retain the CLOSED gates.
grant otr_trip_source_writer,otr_trip_event_receipt_reader to postgres with set true;
grant create on schema public to otr_trip_source_writer,otr_trip_event_receipt_reader;

create function public.trip_import_field_value(payload jsonb,field text)
returns jsonb language plpgsql immutable security invoker set search_path=pg_catalog
as $$ declare component jsonb; leaf text; parts text[]:=string_to_array(field,'.'); service jsonb;
begin
 if payload ? field then return payload->field; end if;
 if field='ROOT.title' then return payload->'title'; end if;
 if parts[1] in ('ORIGIN','DESTINATION') and cardinality(parts)=2 then
  component:=payload->lower(parts[1]);leaf:=parts[2];
  if leaf in ('local_date','local_time','zone_id','supplied_offset_seconds','source_instant') then
   if leaf in ('local_time','source_instant') then return jsonb_build_object('value',component->'time'->leaf,'precision',component->'time'->case leaf when 'local_time' then 'clock_precision' else 'source_instant_precision' end); end if;
   return component->'time'->leaf;
  elsif leaf in ('authored_label','authored_text','accepted_place_id') then return component->'location'->leaf; end if;
 elsif parts[1]='SERVICE' and cardinality(parts)>=3 then
  leaf:=parts[cardinality(parts)];
  if leaf not in ('operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','attribution','codeshare_operating_key') then raise exception 'INVALID_PROVENANCE'; end if;
  select value into service from jsonb_array_elements(payload->'services') where value->>'service_key'=substring(field from 9 for char_length(field)-9-char_length(leaf));
  return service->leaf;
 end if;
 raise exception 'INVALID_PROVENANCE';
end $$;

create function public.trip_import_locators_valid(locators jsonb,inputs uuid[])
returns boolean language plpgsql stable security invoker set search_path=pg_catalog
as $$ declare locator jsonb; pin public.trip_source_inputs; region jsonb; kind text;
begin
 if locators is null or locators='null' then return true; end if;
 if jsonb_typeof(locators)<>'array' or jsonb_array_length(locators)>64 then return false; end if;
 for locator in select value from jsonb_array_elements(locators) loop
  if not public.trip_event_keys(locator,array['input_id','kind','page','start','end','region'],array['excerpt']) or not (locator->>'input_id')::uuid=any(inputs) then return false; end if;
  select * into pin from public.trip_source_inputs where id=(locator->>'input_id')::uuid;
  kind:=locator->>'kind';region:=locator->'region';
  if locator->>'excerpt' is not null and (jsonb_typeof(locator->'excerpt')<>'string' or char_length(locator->>'excerpt')>2000) then return false; end if;
  if kind='WHOLE' then
   if locator->>'page' is not null or locator->>'start' is not null or locator->>'end' is not null or region<>'null' then return false; end if;
  elsif kind='TEXT_SPAN' then
   if locator->>'page' is not null or region<>'null' or jsonb_typeof(locator->'start')<>'number' or jsonb_typeof(locator->'end')<>'number' or (locator->>'start')::bigint<0 or (locator->>'end')::bigint<(locator->>'start')::bigint or (locator->>'end')::bigint>pin.byte_count or not exists(select 1 from public.trip_source_representations r where r.id=pin.representation_id and r.material_kind='TEXT') then return false; end if;
  elsif kind in ('PAGE','REGION') then
   if locator->>'start' is not null or locator->>'end' is not null or locator->>'page' is not null and (jsonb_typeof(locator->'page')<>'number' or (locator->>'page')::bigint not between 1 and 1000000) then return false; end if;
   if kind='PAGE' and (locator->>'page' is null or region<>'null' or not exists(select 1 from public.trip_source_representations r where r.id=pin.representation_id and r.mime_type='application/pdf')) then return false; end if;
   if kind='REGION' then
    if not public.trip_event_keys(region,array['x','y','width','height','coordinate_width','coordinate_height']) or exists(select 1 from jsonb_each(region) where jsonb_typeof(value)<>'number') or
     (region->>'x')::bigint<0 or (region->>'y')::bigint<0 or (region->>'width')::bigint<=0 or (region->>'height')::bigint<=0 or (region->>'coordinate_width')::bigint<=0 or (region->>'coordinate_height')::bigint<=0 or
     (region->>'x')::bigint+(region->>'width')::bigint>(region->>'coordinate_width')::bigint or (region->>'y')::bigint+(region->>'height')::bigint>(region->>'coordinate_height')::bigint or not exists(select 1 from public.trip_source_representations r where r.id=pin.representation_id and r.mime_type like 'image/%') then return false; end if;
   end if;
  else return false; end if;
 end loop;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;

create function public.trip_source_publish_flight_run(actor uuid,trip uuid,raw text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$ declare request jsonb; row public.trip_source_runs; old_row public.trip_source_runs; pin public.trip_source_inputs; candidate public.trip_source_candidates; value jsonb; field record; ids uuid[]; scope uuid[]; digest text; clock timestamptz:=clock_timestamp(); generation bigint;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if raw is null or octet_length(raw)>4194304 then raise exception 'INVALID_IMPORT_INTENT'; end if;
 request:=public.trip_event_canonical_json(raw::json)::jsonb;
 if not public.trip_event_keys(request,array['id','operation_key','scope_source_ids','extractor_key','extractor_version','extractor_options_sha256','inputs','candidates','predecessors','lineage']) then raise exception 'INVALID_IMPORT_INTENT'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000';end if;
 perform public.trip_import_scope_lock(actor,trip);perform public.trip_import_require_gate();
 if not public.trip_source_admission(actor,trip,true) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 scope:=array(select ids.item::uuid from jsonb_array_elements_text(request->'scope_source_ids') ids(item));
 digest:=public.trip_source_hash('otr-source-run-scope-v1',jsonb_build_array(1,trip,actor,to_jsonb(scope)));
 select * into old_row from public.trip_source_runs where trip_id=trip and actor_account_id=actor and operation_key=request->>'operation_key';
 if found then
  if old_row.id<>(request->>'id')::uuid or old_row.scope_source_ids<>scope or (select coalesce(jsonb_agg(to_jsonb(i)-'run_id'-'confirmation_id' order by i.id),'[]') from public.trip_source_inputs i where i.run_id=old_row.id) is distinct from (select jsonb_agg(i order by i->>'id' collate "C") from jsonb_array_elements(request->'inputs') i) or old_row.extractor_key<>request->>'extractor_key' or old_row.extractor_version<>request->>'extractor_version' or old_row.extractor_options_sha256<>request->>'extractor_options_sha256' or
   (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'candidate_key',c.candidate_key,'candidate_kind',c.candidate_kind,'proposal_version',c.proposal_version,'proposal',c.proposal) order by c.candidate_key),'[]') from public.trip_source_candidates c where c.run_id=old_row.id) is distinct from request->'candidates' or
   (select coalesce(jsonb_agg(to_jsonb(p)-'child_run_id' order by p.parent_run_id),'[]') from public.trip_source_run_predecessors p where p.child_run_id=old_row.id) is distinct from (select coalesce(jsonb_agg(v order by v->>'parent_run_id' collate "C"),'[]') from jsonb_array_elements(request->'predecessors') v) or
   (select coalesce(jsonb_agg(to_jsonb(l) order by l.child_candidate_id,l.parent_candidate_id),'[]') from public.trip_source_candidate_lineage l join public.trip_source_candidates c on c.id=l.child_candidate_id where c.run_id=old_row.id) is distinct from (select coalesce(jsonb_agg(v order by v->>'child_candidate_id' collate "C",v->>'parent_candidate_id' collate "C"),'[]') from jsonb_array_elements(request->'lineage') v)
   then raise exception 'OPERATION_KEY_REUSED' using errcode='23505'; end if;
  return to_jsonb(old_row);
 end if;
 if not public.trip_source_uuid_array_valid(scope,1,64) or jsonb_typeof(request->'inputs')<>'array' or jsonb_array_length(request->'inputs') not between 1 and 64 or jsonb_typeof(request->'candidates')<>'array' or jsonb_array_length(request->'candidates')>64 or jsonb_typeof(request->'predecessors')<>'array' or jsonb_array_length(request->'predecessors')>64 or jsonb_typeof(request->'lineage')<>'array' or jsonb_array_length(request->'lineage')>64 then raise exception 'INVALID_IMPORT_INTENT'; end if;
 perform public.trip_import_lock_admission(actor,trip);
 perform 1 from public.trip_sources where id=any(scope) order by id for update;
 select coalesce(max(r.generation),0)+1 into generation from public.trip_source_runs r where r.trip_id=trip and r.actor_account_id=actor and r.scope_sha256=digest;
 insert into public.trip_source_runs(id,row_revision,trip_id,actor_account_id,operation_key,scope_source_ids,scope_sha256,generation,input_sha256,extractor_key,extractor_version,extractor_options_sha256,created_at)
 values((request->>'id')::uuid,1,trip,actor,request->>'operation_key',scope,digest,generation,public.trip_import_run_input_hash(request->'inputs'),request->>'extractor_key',request->>'extractor_version',request->>'extractor_options_sha256',clock) returning * into row;
 for value in select v from jsonb_array_elements(request->'inputs') v loop
  if not public.trip_event_keys(value,array['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']) then raise exception 'INVALID_IMPORT_INPUT'; end if;
  pin:=jsonb_populate_record(null::public.trip_source_inputs,value||jsonb_build_object('run_id',row.id,'confirmation_id',null));
  if not pin.source_id=any(scope) or not public.trip_import_input_valid(pin,actor,trip,true) then raise exception 'INPUT_STALE'; end if;
  insert into public.trip_source_inputs select(pin).*;
 end loop;
 for value in select v from jsonb_array_elements(request->'predecessors') v loop
  if not public.trip_event_keys(value,array['parent_run_id','relation']) then raise exception 'INVALID_RUN_LINEAGE'; end if;
  insert into public.trip_source_run_predecessors values(row.id,(value->>'parent_run_id')::uuid,value->>'relation');
 end loop;
 for value in select v from jsonb_array_elements(request->'candidates') v loop
  if not public.trip_event_keys(value,array['id','candidate_key','candidate_kind','proposal_version','proposal']) or value->>'candidate_kind'<>'TRANSPORT' or value->'proposal_version'<>'1' or not public.trip_event_keys(value->'proposal',array['fields']) or jsonb_typeof(value->'proposal'->'fields')<>'object' or (select count(*) from jsonb_each(value->'proposal'->'fields'))>64 then raise exception 'INVALID_FLIGHT_PROPOSAL'; end if;
  for field in select * from jsonb_each(value->'proposal'->'fields') loop
   if field.key not in ('transport_subtype','title','origin','destination','services') or not public.trip_event_keys(field.value,array['proposed_value','input_ids'],array['locators','confidence','ambiguity']) then raise exception 'UNSUPPORTED_FLIGHT_DIMENSION'; end if;
   if not public.trip_import_value_valid(field.key,field.value->'proposed_value') then raise exception 'INVALID_FLIGHT_PROPOSAL';end if;
   ids:=array(select i::uuid from jsonb_array_elements_text(field.value->'input_ids') i);
   if not public.trip_source_uuid_array_valid(ids,1,64) or exists(select 1 from unnest(ids) id where not exists(select 1 from public.trip_source_inputs p where p.id=id and p.run_id=row.id)) or not public.trip_import_locators_valid(field.value->'locators',ids) then raise exception 'INVALID_FLIGHT_SUPPORT'; end if;
   if field.value ? 'confidence' and (not public.trip_event_keys(field.value->'confidence',array['value','scale']) or jsonb_typeof(field.value->'confidence'->'value')<>'string' or char_length(field.value->'confidence'->>'value')>64 or jsonb_typeof(field.value->'confidence'->'scale')<>'string' or char_length(field.value->'confidence'->>'scale') not between 1 and 64) then raise exception 'INVALID_FLIGHT_SUPPORT'; end if;
   if field.value ? 'ambiguity' and (jsonb_typeof(field.value->'ambiguity')<>'array' or jsonb_array_length(field.value->'ambiguity')>16 or exists(select 1 from jsonb_array_elements(field.value->'ambiguity') a where jsonb_typeof(a)<>'string' or char_length(a#>>'{}')>500)) then raise exception 'INVALID_FLIGHT_SUPPORT'; end if;
  end loop;
  insert into public.trip_source_candidates(id,run_id,candidate_key,candidate_kind,proposal_version,proposal_sha256,proposal,created_at) values((value->>'id')::uuid,row.id,value->>'candidate_key','TRANSPORT',1,public.trip_source_hash('otr-source-candidate-v1',value->'proposal'),value->'proposal',clock);
 end loop;
 for value in select v from jsonb_array_elements(request->'lineage') v loop
  if not public.trip_event_keys(value,array['child_candidate_id','parent_candidate_id','relation']) or not exists(select 1 from public.trip_source_candidates where id=(value->>'child_candidate_id')::uuid and run_id=row.id) then raise exception 'INVALID_CANDIDATE_LINEAGE'; end if;
  insert into public.trip_source_candidate_lineage values((value->>'child_candidate_id')::uuid,(value->>'parent_candidate_id')::uuid,value->>'relation');
 end loop;
 update public.trip_source_runs set state='READY',completed_at=clock,row_revision=row_revision+1 where id=row.id returning * into row;
 return to_jsonb(row);
end $$;

create function public.trip_source_prepare_confirmation(actor uuid,trip uuid,raw_intent text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$ declare request jsonb; c public.trip_source_confirmations; pin public.trip_source_inputs; slot public.trip_source_output_slots; value jsonb; digest text; stamp timestamptz:=clock_timestamp();
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if raw_intent is null or octet_length(raw_intent)>4194304 then raise exception 'INVALID_IMPORT_INTENT'; end if;
 request:=public.trip_event_canonical_json(raw_intent::json)::jsonb;
 if not public.trip_event_keys(request,array['id','confirmation_key','intent_version','inputs','slots','lineage_dispositions','dependencies']) or request->'intent_version'<>'1' then raise exception 'INVALID_IMPORT_INTENT'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000';end if;
 perform public.trip_import_scope_lock(actor,trip);perform public.trip_import_require_gate();
 if not public.trip_source_admission(actor,trip,true) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 digest:=public.trip_source_hash('otr-source-confirmation-v1',jsonb_build_array(1,actor,trip,request));
 select * into c from public.trip_source_confirmations where trip_id=trip and actor_account_id=actor and confirmation_key=request->>'confirmation_key';
 if found then
  if c.id<>(request->>'id')::uuid or c.intent_sha256<>digest then raise exception 'OPERATION_KEY_REUSED' using errcode='23505'; end if;
  return to_jsonb(c);
 end if;
 if jsonb_typeof(request->'inputs')<>'array' or jsonb_array_length(request->'inputs')>64 or jsonb_typeof(request->'slots')<>'array' or jsonb_array_length(request->'slots') not between 1 and 64 or jsonb_typeof(request->'lineage_dispositions')<>'array' or jsonb_array_length(request->'lineage_dispositions')>64 or jsonb_typeof(request->'dependencies')<>'array' or jsonb_array_length(request->'dependencies')>64 then raise exception 'INVALID_IMPORT_INTENT'; end if;
 perform public.trip_import_lock_admission(actor,trip);
 perform 1 from public.trip_sources where id in(select (i->>'source_id')::uuid from jsonb_array_elements(request->'inputs') i) order by id for update;
 insert into public.trip_source_confirmations(id,trip_id,actor_account_id,confirmation_key,intent_version,intent_sha256,created_at,row_revision) values((request->>'id')::uuid,trip,actor,request->>'confirmation_key',1,digest,stamp,1) returning * into c;
 for value in select v from jsonb_array_elements(request->'inputs') v loop
  if not public.trip_event_keys(value,array['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']) then raise exception 'INVALID_IMPORT_INPUT'; end if;
  pin:=jsonb_populate_record(null::public.trip_source_inputs,value||jsonb_build_object('confirmation_id',c.id,'run_id',null));
  if not public.trip_import_input_valid(pin,actor,trip,true) then raise exception 'INPUT_STALE'; end if;
  insert into public.trip_source_inputs select(pin).*;
 end loop;
 for value in select v from jsonb_array_elements(request->'slots') v loop
  if not public.trip_event_keys(value,array['slot_id','slot_key','disposition','reviewed_run_id','candidate_id','intended_target_kind','intended_target_id','base_revision','adapter_key','adapter_version','domain_operation_key','domain_intent_sha256','reviewed_payload','support_version','support_payload']) then raise exception 'INVALID_IMPORT_SLOT'; end if;
  slot:=jsonb_populate_record(null::public.trip_source_output_slots,value||jsonb_build_object('confirmation_id',c.id,'state',case value->>'disposition' when 'REJECT' then 'REJECTED' when 'DEFER' then 'DEFERRED' else 'PREPARED' end,'finalization_state','NONE','retention_state','RETAINED','create_claim_active',value->>'disposition'='CREATE'));
  if slot.disposition in ('CREATE','UPDATE') and (slot.candidate_id is null or not public.trip_event_keys(slot.reviewed_payload,array['schema_key','schema_version','normalization_version','match_policy','selected_fields','edits','association_intents','deferred_dimensions']) or slot.reviewed_payload->>'schema_key'<>'flight-v1' or slot.reviewed_payload->'schema_version'<>'1' or slot.reviewed_payload->'normalization_version'<>'1' or slot.reviewed_payload->>'match_policy'<>'import-flight-match-v1' or jsonb_typeof(slot.reviewed_payload->'selected_fields')<>'array' or jsonb_array_length(slot.reviewed_payload->'selected_fields')>64 or jsonb_typeof(slot.reviewed_payload->'edits')<>'object' or jsonb_typeof(slot.reviewed_payload->'association_intents')<>'array' or jsonb_array_length(slot.reviewed_payload->'association_intents')>64 or jsonb_typeof(slot.reviewed_payload->'deferred_dimensions')<>'array' or jsonb_array_length(slot.reviewed_payload->'deferred_dimensions')>64) then raise exception 'INVALID_FLIGHT_REVIEW'; end if;
  if slot.reviewed_payload is not null and not public.trip_import_review_valid(slot.reviewed_payload,slot.support_payload,actor,trip,slot.domain_operation_key,slot.slot_id) then raise exception 'INVALID_FLIGHT_REVIEW';end if;
  insert into public.trip_source_output_slots select(slot).*;
 end loop;
 for value in select v from jsonb_array_elements(request->'lineage_dispositions') v loop
  if not public.trip_event_keys(value,array['slot_id','ancestor_candidate_id','ancestor_slot_key','relation','review_reason']) or not exists(select 1 from public.trip_source_output_slots where slot_id=(value->>'slot_id')::uuid and confirmation_id=c.id) then raise exception 'INVALID_LINEAGE_DISPOSITION'; end if;
  insert into public.trip_source_slot_lineage_dispositions values((value->>'slot_id')::uuid,(value->>'ancestor_candidate_id')::uuid,value->>'ancestor_slot_key',value->>'relation',value->>'review_reason',actor,stamp);
 end loop;
 for value in select v from jsonb_array_elements(request->'dependencies') v loop
  if not public.trip_event_keys(value,array['slot_id','predecessor_slot_id','dependency_kind','expected_receipt_sha256','expected_target_id','expected_result_revision']) or not exists(select 1 from public.trip_source_output_slots where slot_id=(value->>'slot_id')::uuid and confirmation_id=c.id) then raise exception 'INVALID_SLOT_DEPENDENCY'; end if;
  insert into public.trip_source_slot_dependencies select (jsonb_populate_record(null::public.trip_source_slot_dependencies,value)).*;
 end loop;
 return to_jsonb(c);
end $$;

create function public.trip_source_mark_slot_dispatch(actor uuid,trip uuid,confirmation uuid,expected_revision bigint,slot_id uuid,digest text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$ declare c public.trip_source_confirmations; s public.trip_source_output_slots; pin public.trip_source_inputs;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000';end if;
 perform public.trip_import_scope_lock(actor,trip);perform public.trip_import_require_gate();
 if not public.trip_source_admission(actor,trip,true) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.trip_source_confirmations where id=confirmation and trip_id=trip and actor_account_id=actor;
 select * into s from public.trip_source_output_slots where trip_source_output_slots.slot_id=trip_source_mark_slot_dispatch.slot_id and confirmation_id=c.id;
 if c.id is null or s.slot_id is null or s.domain_intent_sha256 is distinct from digest then raise exception 'INVALID_IMPORT_BINDING'; end if;
 perform pg_advisory_xact_lock(hashtextextended('otr-event-operation/'||trip||'/'||actor||'/'||s.domain_operation_key,0));
 perform public.trip_import_lock_admission(actor,trip);
 perform 1 from public.trip_sources where id in(select source_id from public.trip_source_inputs where confirmation_id=c.id) order by id for update;
 perform 1 from public.trip_source_runs where id=s.reviewed_run_id for update;
 select * into c from public.trip_source_confirmations where id=c.id for update;
 select * into s from public.trip_source_output_slots where trip_source_output_slots.slot_id=s.slot_id for update;
 if s.state='OUTCOME_UNKNOWN' then return to_jsonb(s); end if;
 for pin in select * from public.trip_source_inputs where confirmation_id=c.id loop if not public.trip_import_input_valid(pin,actor,trip,true) then raise exception 'INPUT_STALE'; end if; end loop;
 if c.row_revision<>expected_revision then raise exception 'CONFIRMATION_CAS_CONFLICT'; end if;
 if s.state<>'PREPARED' or c.retention_state<>'RETAINED' then raise exception 'INVALID_IMPORT_TRANSITION'; end if;
 perform pg_advisory_xact_lock(hashtextextended('otr-event-operation/'||trip||'/'||actor||'/'||s.domain_operation_key,0));
 perform public.trip_import_claim_check(s);
 update public.trip_source_output_slots set state='OUTCOME_UNKNOWN',dispatched_at=clock_timestamp() where trip_source_output_slots.slot_id=s.slot_id returning * into s;
 update public.trip_source_confirmations set row_revision=row_revision+1,state='PROCESSING' where id=c.id;
 return to_jsonb(s);
end $$;

-- Fixed B reader bridge. C callers validate the exact durable slot binding before
-- invocation. No C table grant is given to the B reader and no receipt-table grant
-- is given to C. This returns correlation only, never raw intent or target fields.
create function public.trip_event_receipt_for_source_slot(actor uuid,trip uuid,operation uuid,event uuid,expected_digest text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$ declare r public.trip_event_operation_receipts; data jsonb;
begin
 if current_user<>'otr_trip_event_receipt_reader' or session_user not in ('otr_trip_source_command_gateway','otr_trip_event_command_gateway') or not public.trip_event_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into r from public.trip_event_operation_receipts where trip_id=trip and actor_account_id=actor and operation_key=operation;
 if not found then return null; end if;
 if r.intent_sha256 is distinct from expected_digest or r.target_event_id is distinct from event or r.command not in ('CREATE_TRANSPORT','UPDATE_TRANSPORT') then raise exception 'INVALID_IMPORT_RECEIPT'; end if;
 data:=(to_jsonb(r)-'receipt_sha256')||jsonb_build_object('committed_at',public.trip_event_utc_timestamp(r.committed_at));
 if r.receipt_sha256<>encode(extensions.digest(convert_to(public.trip_event_canonical_json(data::json),'UTF8'),'sha256'),'hex') then raise exception 'REPLAY_UNAVAILABLE'; end if;
 if r.outcome in ('REJECTED','CONFLICT') and r.command='CREATE_TRANSPORT' then
  if r.base_semantic_revision is not null or r.result_event_id is not null or r.committed_semantic_revision is not null then raise exception 'INVALID_IMPORT_RECEIPT'; end if;
 else
  if not exists(select 1 from public.itinerary_events e where e.id=event and e.trip_id=trip) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if r.outcome in ('APPLIED','NO_CHANGE') and (r.result_event_id is distinct from event or r.committed_semantic_revision is null) then raise exception 'INVALID_IMPORT_RECEIPT'; end if;
 end if;
 return jsonb_build_object('trip_id',r.trip_id,'actor_account_id',r.actor_account_id,'operation_key',r.operation_key,'command',r.command,'intent_sha256',r.intent_sha256,'target_event_id',r.target_event_id,'base_semantic_revision',r.base_semantic_revision,'outcome',r.outcome,'result_event_id',r.result_event_id,'committed_semantic_revision',r.committed_semantic_revision,'receipt_sha256',r.receipt_sha256);
end $$;
grant select(id,trip_id) on public.itinerary_events to otr_trip_event_receipt_reader;
create policy import_receipt_target_read on public.itinerary_events for select to otr_trip_event_receipt_reader using(true);

create function public.trip_source_admit_event_operation(actor uuid,trip uuid,event uuid,operation uuid,command text,base bigint,digest text)
returns uuid language plpgsql volatile security invoker set search_path=pg_catalog
as $$ declare c public.trip_source_confirmations;s public.trip_source_output_slots;pin public.trip_source_inputs;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_event_command_gateway' or command not in ('CREATE_TRANSPORT','UPDATE_TRANSPORT') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000';end if;
 perform public.trip_import_scope_lock(actor,trip);perform public.trip_import_require_gate();
 if not public.trip_source_admission(actor,trip,true) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('otr-event-operation/'||trip||'/'||actor||'/'||operation,0));
 select slot.* into s from public.trip_source_output_slots slot join public.trip_source_confirmations parent on parent.id=slot.confirmation_id where parent.trip_id=trip and parent.actor_account_id=actor and slot.domain_operation_key=operation::text;
 if s.slot_id is null or s.intended_target_id<>event or s.domain_intent_sha256 is distinct from digest or s.base_revision is distinct from base or s.disposition<>(case command when 'CREATE_TRANSPORT' then 'CREATE' else 'UPDATE' end) or s.state<>'OUTCOME_UNKNOWN' or s.dispatched_at is null or s.retention_state<>'RETAINED' or s.adapter_key<>'itinerary-event-v1' or s.adapter_version<>1 or s.intended_target_kind<>'ITINERARY_EVENT' or s.disposition='CREATE' and not s.create_claim_active then raise exception 'INVALID_IMPORT_BINDING'; end if;
 select * into c from public.trip_source_confirmations where id=s.confirmation_id;
 if c.retention_state<>'RETAINED' then raise exception 'INVALID_PROVENANCE'; end if;
 perform public.trip_import_lock_admission(actor,trip);
 perform 1 from public.trip_sources where id in(select source_id from public.trip_source_inputs where confirmation_id=c.id) order by id for update;
 perform 1 from public.trip_source_runs where id=s.reviewed_run_id for update;
 perform 1 from public.trip_source_confirmations where id=c.id for update;
 perform 1 from public.trip_source_output_slots where trip_source_output_slots.slot_id=s.slot_id for update;
 perform public.trip_import_claim_check(s);
 for pin in select * from public.trip_source_inputs where confirmation_id=c.id loop if not public.trip_import_input_valid(pin,actor,trip,true) then raise exception 'INPUT_STALE';end if;end loop;
 return s.slot_id;
end $$;

create function public.trip_source_admit_event_proof(actor uuid,trip uuid,event uuid,operation uuid,command text,base bigint,digest text,confirmation uuid,slot_id uuid,field_key text,accepted_value jsonb)
returns text language plpgsql volatile security definer set search_path=pg_catalog
as $$ declare c public.trip_source_confirmations; s public.trip_source_output_slots; evidence public.trip_source_output_slots; candidate public.trip_source_candidates; support jsonb; selected jsonb; container text; value jsonb; ids uuid[]; pin public.trip_source_inputs; source_pin public.trip_source_inputs; selected_key text; leaf_key text; required_keys text[]:='{}'; expected_leaves jsonb:='{}'; expected_components jsonb:='{}'; command_leaves jsonb:='{}'; command_values jsonb; command_proofs jsonb; expanded jsonb; component_record record; leaf_record record; service_value jsonb; component_keys text[];
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_event_command_gateway' then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into s from public.trip_source_output_slots where trip_source_output_slots.slot_id=public.trip_source_admit_event_operation(actor,trip,event,operation,command,base,digest);
 select * into c from public.trip_source_confirmations where id=s.confirmation_id;
 -- The B wrapper uses the same fixed root for operation admission before it
 -- locks canonical facts. This internal branch returns no C payload/evidence;
 -- client proof paths are always finite nonnull leaves validated by B.
 if field_key is null then
  if confirmation is not null or slot_id is not null or not public.trip_event_keys(accepted_value,array['values','proofs']) then raise exception 'INVALID_PROVENANCE';end if;
  command_values:=accepted_value->'values';command_proofs:=accepted_value->'proofs';
  select * into candidate from public.trip_source_candidates where id=s.candidate_id and run_id=s.reviewed_run_id;
  if candidate.id is null or candidate.retention_state<>'RETAINED' or candidate.proposal_sha256<>public.trip_source_hash('otr-source-candidate-v1',candidate.proposal) or not public.trip_import_review_valid(s.reviewed_payload,s.support_payload,actor,trip,s.domain_operation_key,s.slot_id) then raise exception 'INVALID_PROVENANCE';end if;
  -- Resolve the immutable selection independently of the submitted operation.
  for selected_key in select v from jsonb_array_elements_text(s.reviewed_payload->'selected_fields') v loop
   support:=s.support_payload->selected_key;container:=support->>'candidate_field_key';
   if support->>'origin'='USER_ENTERED' then value:=s.reviewed_payload->'edits'->selected_key;
   elsif support->>'origin'='ACCEPTED_EXTRACTED' then
    if support->>'candidate_id' is distinct from candidate.id::text then raise exception 'INVALID_PROVENANCE';end if;
    value:=candidate.proposal->'fields'->container->'proposed_value';
   else
    if support->>'candidate_id' is distinct from candidate.id::text or support->'edited_value' is distinct from s.reviewed_payload->'edits'->container then raise exception 'INVALID_PROVENANCE';end if;
    value:=support->'edited_value';
   end if;
   if support->>'origin'<>'USER_ENTERED' and selected_key<>container then value:=public.trip_import_field_value(jsonb_build_object(container,value),selected_key);end if;
   if value is null or not public.trip_import_value_valid(selected_key,value) then raise exception 'INVALID_PROVENANCE';end if;
   if selected_key='transport_subtype' then continue;end if;
   expanded:='{}';
   if selected_key in ('title','origin','destination','services') then
    expected_components:=expected_components||jsonb_build_object(selected_key,value);
    selected:=jsonb_build_object(selected_key,value);
    if selected_key='title' then component_keys:=array['ROOT.title'];
    elsif selected_key in ('origin','destination') then
     component_keys:=array(select upper(selected_key)||'.'||k from unnest(array['local_date','local_time','zone_id','supplied_offset_seconds','source_instant','authored_label','authored_text','accepted_place_id']) k);
    else
     component_keys:=array(select 'SERVICE.'||(service->>'service_key')||'.'||k from jsonb_array_elements(value) service cross join unnest(array['operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','attribution','codeshare_operating_key']) k);
    end if;
    foreach leaf_key in array component_keys loop expanded:=expanded||jsonb_build_object(leaf_key,public.trip_import_field_value(selected,leaf_key));end loop;
   else expanded:=jsonb_build_object(selected_key,value);end if;
   for leaf_record in select * from jsonb_each(expanded) loop
    if expected_leaves ? leaf_record.key then raise exception 'INVALID_PROVENANCE';end if;
    expected_leaves:=expected_leaves||jsonb_build_object(leaf_record.key,leaf_record.value);
    if selected_key not in ('title','origin','destination','services') or leaf_record.value<>'null' and leaf_record.value->'value' is distinct from 'null'::jsonb then required_keys:=array_append(required_keys,leaf_record.key);end if;
   end loop;
  end loop;
  for component_record in select * from jsonb_each(expected_components) loop
   if command_values->component_record.key is distinct from component_record.value then raise exception 'INVALID_PROVENANCE';end if;
  end loop;
  for component_record in select * from jsonb_each(command_values) loop
   if component_record.key='title' then component_keys:=array['ROOT.title'];
   elsif component_record.key in ('origin','destination') then
    component_keys:=array(select upper(component_record.key)||'.'||k from unnest(array['local_date','local_time','zone_id','supplied_offset_seconds','source_instant','authored_label','authored_text','accepted_place_id']) k);
   elsif component_record.key='services' then
    component_keys:=array(select 'SERVICE.'||(service->>'service_key')||'.'||k from jsonb_array_elements(component_record.value) service cross join unnest(array['operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','attribution','codeshare_operating_key']) k);
   else raise exception 'INVALID_PROVENANCE';end if;
   foreach leaf_key in array component_keys loop command_leaves:=command_leaves||jsonb_build_object(leaf_key,public.trip_import_field_value(command_values,leaf_key));end loop;
  end loop;
  foreach leaf_key in array required_keys loop
   if not command_proofs ? leaf_key or command_leaves->leaf_key is distinct from expected_leaves->leaf_key then raise exception 'INVALID_PROVENANCE';end if;
  end loop;
  for leaf_record in select * from jsonb_each(command_leaves) loop
   if leaf_record.value<>'null' and leaf_record.value->'value' is distinct from 'null'::jsonb and (not expected_leaves ? leaf_record.key or leaf_record.value is distinct from expected_leaves->leaf_record.key) then raise exception 'INVALID_PROVENANCE';end if;
  end loop;
  for leaf_record in select * from jsonb_each(command_proofs) loop
   if not expected_leaves ? leaf_record.key or command_leaves->leaf_record.key is distinct from expected_leaves->leaf_record.key or leaf_record.value->>'kind'='TRACK_C' and leaf_record.value->>'ref' is distinct from 'track-c/field-evidence/'||s.slot_id||'/'||leaf_record.key then raise exception 'INVALID_PROVENANCE';end if;
   if leaf_record.value->>'kind'='RETAINED' then perform public.trip_source_admit_event_proof(actor,trip,event,operation,command,base,digest,null,s.slot_id,leaf_record.key,expected_leaves->leaf_record.key);end if;
  end loop;
  return 'track-c/operation-admission/'||s.slot_id;
 end if;
 select * into evidence from public.trip_source_output_slots where trip_source_output_slots.slot_id=trip_source_admit_event_proof.slot_id;
 if evidence.slot_id is null or confirmation is not null and evidence.confirmation_id<>confirmation then raise exception 'INVALID_PROVENANCE'; end if;
 if evidence.slot_id<>s.slot_id and (evidence.result_target_id is distinct from event or evidence.receipt_sha256 is null or evidence.result_revision>base or not exists(select 1 from public.trip_source_confirmations ec where ec.id=evidence.confirmation_id and ec.trip_id=trip and ec.actor_account_id=actor)) then raise exception 'INVALID_PROVENANCE'; end if;
 if evidence.retention_state<>'RETAINED' then raise exception 'INVALID_PROVENANCE'; end if;
 select * into candidate from public.trip_source_candidates where id=evidence.candidate_id and run_id=evidence.reviewed_run_id;
 if candidate.id is null or candidate.retention_state<>'RETAINED' or candidate.proposal_version<>1 or candidate.proposal_sha256<>public.trip_source_hash('otr-source-candidate-v1',candidate.proposal) then raise exception 'INVALID_PROVENANCE'; end if;
 if not exists(select 1 from public.trip_source_runs r where r.id=candidate.run_id and r.state='READY' and r.retention_state='RETAINED') then raise exception 'INVALID_PROVENANCE'; end if;
 container:=case when field_key='ROOT.title' then 'title' when field_key like 'ORIGIN.%' then 'origin' when field_key like 'DESTINATION.%' then 'destination' when field_key like 'SERVICE.%' then 'services' else null end;
 support:=coalesce(evidence.support_payload->field_key,evidence.support_payload->container);
 if container is null or support is null or not public.trip_event_keys(support,array['origin','candidate_id','candidate_field_key','input_ids','accepted_value_ref','edited_value'],array['locators']) then raise exception 'INVALID_PROVENANCE'; end if;
 if support->>'origin'='USER_ENTERED' then
  if support->>'candidate_id' is not null or support->>'candidate_field_key' is not null or support->'input_ids'<>'[]' or support->>'edited_value' is not null then raise exception 'INVALID_PROVENANCE'; end if;
  selected:=evidence.reviewed_payload->'edits';
 elsif support->>'origin' in ('ACCEPTED_EXTRACTED','EDITED_EXTRACTED') then
  if support->>'candidate_id' is distinct from candidate.id::text or support->>'candidate_field_key'<>container or not candidate.proposal->'fields' ? container then raise exception 'INVALID_PROVENANCE'; end if;
  ids:=array(select i::uuid from jsonb_array_elements_text(support->'input_ids') i);
  if not public.trip_source_uuid_array_valid(ids,1,64) or not public.trip_import_locators_valid(support->'locators',ids) then raise exception 'INVALID_PROVENANCE'; end if;
  for pin in select * from public.trip_source_inputs where id=any(ids) order by id loop
   if pin.confirmation_id<>evidence.confirmation_id or not public.trip_import_input_valid(pin,actor,trip,true) or not exists(select 1 from public.trip_source_inputs p where p.run_id=candidate.run_id and p.id in(select i::uuid from jsonb_array_elements_text(candidate.proposal->'fields'->container->'input_ids') i) and p.source_id=pin.source_id and p.material_revision=pin.material_revision and p.representation_id=pin.representation_id and p.payload_sha256=pin.payload_sha256 and p.byte_count=pin.byte_count) then raise exception 'INPUT_STALE'; end if;
  end loop;
  if (select count(*) from public.trip_source_inputs where id=any(ids))<>cardinality(ids) then raise exception 'INVALID_PROVENANCE'; end if;
  -- Extracted support must cover the complete sealed field input set in
  -- both directions; a subset cannot silently drop disagreeing evidence.
  if exists(select 1 from public.trip_source_inputs p where p.run_id=candidate.run_id and p.id in(select i::uuid from jsonb_array_elements_text(candidate.proposal->'fields'->container->'input_ids') i) and not exists(select 1 from public.trip_source_inputs q where q.id=any(ids) and q.confirmation_id=evidence.confirmation_id and q.source_id=p.source_id and q.material_revision=p.material_revision and q.representation_id=p.representation_id and q.payload_sha256=p.payload_sha256 and q.byte_count=p.byte_count)) then raise exception 'INVALID_PROVENANCE';end if;
  if support->>'origin'='ACCEPTED_EXTRACTED' then
   if support->>'edited_value' is not null then raise exception 'INVALID_PROVENANCE'; end if;
   selected:=jsonb_build_object(container,candidate.proposal->'fields'->container->'proposed_value');
  else
   if not support ? 'edited_value' or not evidence.reviewed_payload->'edits' ? container or support->'edited_value' is distinct from evidence.reviewed_payload->'edits'->container then raise exception 'INVALID_PROVENANCE'; end if;
   selected:=evidence.reviewed_payload->'edits';
  end if;
 else raise exception 'INVALID_PROVENANCE'; end if;
 value:=public.trip_import_field_value(selected,field_key);
 if value is distinct from accepted_value then raise exception 'INVALID_PROVENANCE'; end if;
 if evidence.slot_id=s.slot_id and not evidence.reviewed_payload->'selected_fields' ? container and not evidence.reviewed_payload->'selected_fields' ? field_key then raise exception 'INVALID_PROVENANCE'; end if;
 return 'track-c/field-evidence/'||evidence.slot_id||'/'||field_key;
end $$;

create function public.trip_source_finalize_event_slot(actor uuid,trip uuid,confirmation uuid,expected_revision bigint,slot_id uuid,operation uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$ declare c public.trip_source_confirmations; s public.trip_source_output_slots; receipt jsonb; ref text; assoc jsonb; pin public.trip_source_inputs; source public.trip_sources; has_nonfinal boolean; has_final boolean;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000';end if;
 perform public.trip_import_scope_lock(actor,trip);
 if not public.trip_source_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('otr-event-operation/'||trip||'/'||actor||'/'||operation,0));
 perform 1 from public.trips where id=trip for share;
 perform 1 from public.trip_members where trip_id=trip and user_id=actor order by id for share;
 perform 1 from public.journey_members where trip_id=trip and user_id=actor order by id for share;
 if not public.trip_source_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 perform 1 from public.trip_sources where id in(select source_id from public.trip_source_inputs where confirmation_id=confirmation) order by id for update;
 select * into c from public.trip_source_confirmations where id=confirmation and trip_id=trip and actor_account_id=actor for update;
 select * into s from public.trip_source_output_slots where trip_source_output_slots.slot_id=trip_source_finalize_event_slot.slot_id and confirmation_id=c.id for update;
 if c.id is null or s.slot_id is null or s.domain_operation_key is distinct from operation::text then raise exception 'INVALID_IMPORT_BINDING'; end if;
 if s.state in ('FINALIZED','FAILED','CONFLICTED','CANCELED') then return to_jsonb(s); end if;
 if c.row_revision<>expected_revision then raise exception 'CONFIRMATION_CAS_CONFLICT'; end if;
 receipt:=public.trip_event_receipt_for_source_slot(actor,trip,operation,s.intended_target_id,s.domain_intent_sha256);
 if receipt is null then return to_jsonb(s); end if;
 if receipt->>'command' is distinct from (case s.disposition when 'CREATE' then 'CREATE_TRANSPORT' else 'UPDATE_TRANSPORT' end) or (receipt->>'base_semantic_revision')::bigint is distinct from s.base_revision then raise exception 'INVALID_IMPORT_RECEIPT'; end if;
 ref:='otr-event/receipt/'||trip||'/'||actor||'/'||operation;
 if s.state in ('PREPARED','OUTCOME_UNKNOWN') then
  if receipt->>'outcome' in ('APPLIED','NO_CHANGE') then
   update public.trip_source_output_slots set state='DOMAIN_SUCCEEDED',receipt_ref=ref,result_target_kind='ITINERARY_EVENT',result_target_id=(receipt->>'result_event_id')::uuid,result_revision=(receipt->>'committed_semantic_revision')::bigint,receipt_sha256=receipt->>'receipt_sha256',finalization_state='PENDING' where trip_source_output_slots.slot_id=s.slot_id returning * into s;
  elsif receipt->>'outcome' in ('REJECTED','CONFLICT') then
   update public.trip_source_output_slots set state=case receipt->>'outcome' when 'CONFLICT' then 'CONFLICTED' else 'FAILED' end,failure_code=case receipt->>'outcome' when 'CONFLICT' then 'DOMAIN_CONFLICT' else 'DOMAIN_REJECTED' end,create_claim_active=false,no_commit_basis='VERIFIED_TERMINAL_RECEIPT',no_commit_receipt_ref=ref,no_commit_receipt_sha256=receipt->>'receipt_sha256',no_commit_at=clock_timestamp() where trip_source_output_slots.slot_id=s.slot_id returning * into s;
  else raise exception 'INVALID_IMPORT_RECEIPT'; end if;
 else
  if receipt->>'receipt_sha256' is distinct from s.receipt_sha256 or (receipt->>'result_event_id')::uuid is distinct from s.result_target_id or (receipt->>'committed_semantic_revision')::bigint is distinct from s.result_revision then raise exception 'INVALID_IMPORT_RECEIPT'; end if;
  begin
   for assoc in select value from jsonb_array_elements(s.reviewed_payload->'association_intents') loop
    if not public.trip_event_keys(assoc,array['input_id','purpose']) or assoc->>'purpose'<>'CONFIRMED_SUPPORT' then raise exception 'INVALID_ASSOCIATION_PIN'; end if;
    select * into pin from public.trip_source_inputs where id=(assoc->>'input_id')::uuid and confirmation_id=c.id;
    select * into source from public.trip_sources where id=pin.source_id and trip_id=trip and acquired_by=actor;
    if pin.id is null or source.id is null or source.retention_state<>'RETAINED' then raise exception 'EVIDENCE_FINALIZE_FAILED'; end if;
    if not exists(select 1 from public.trip_source_associations where source_id=source.id and target_kind='ITINERARY_EVENT' and target_id=s.result_target_id and purpose='CONFIRMED_SUPPORT' and confirmation_id=c.id) then
     insert into public.trip_source_associations(id,source_id,target_kind,target_id,purpose,state,row_revision,created_by,created_at,confirmation_id,preview_input_id,preview_source_revision,preview_representation_id,inactive_reason,inactive_at,inactive_by)
      values(extensions.gen_random_uuid(),source.id,'ITINERARY_EVENT',s.result_target_id,'CONFIRMED_SUPPORT',case source.lifecycle when 'ACTIVE' then 'ACTIVE' else 'INACTIVE' end,1,actor,clock_timestamp(),c.id,pin.id,pin.material_revision,pin.representation_id,case source.lifecycle when 'DELETED' then 'SOURCE_DELETE' end,case source.lifecycle when 'DELETED' then clock_timestamp() end,case source.lifecycle when 'DELETED' then actor end);
    end if;
   end loop;
   update public.trip_source_output_slots set state='FINALIZED',finalization_state='COMPLETE',failure_code=null where trip_source_output_slots.slot_id=s.slot_id returning * into s;
  exception when others then
   if sqlerrm not in ('EVIDENCE_FINALIZE_FAILED','INVALID_ASSOCIATION_PIN') and sqlstate not in ('23505','23503','23514') then raise; end if;
   update public.trip_source_output_slots set state='EVIDENCE_PENDING',finalization_state='BLOCKED',failure_code='EVIDENCE_FINALIZE_FAILED' where trip_source_output_slots.slot_id=s.slot_id returning * into s;
  end;
 end if;
 select bool_or(state in ('PREPARED','OUTCOME_UNKNOWN','DOMAIN_SUCCEEDED','EVIDENCE_PENDING')),bool_or(state in ('FINALIZED','REJECTED','DEFERRED','FAILED','CONFLICTED','CANCELED')) into has_nonfinal,has_final from public.trip_source_output_slots where confirmation_id=c.id;
 update public.trip_source_confirmations set row_revision=row_revision+1,state=case when not has_nonfinal then case when exists(select 1 from public.trip_source_output_slots where confirmation_id=c.id and state in ('FINALIZED','REJECTED','DEFERRED')) then 'COMPLETE' else 'STOPPED' end when has_final then 'PARTIAL' else 'PROCESSING' end where id=c.id;
 return to_jsonb(s);
end $$;

grant select on public.trip_sources,public.trip_source_revisions,public.trip_source_representations to otr_trip_source_writer;
create policy import_source_pin_read on public.trip_sources for select to otr_trip_source_writer using(true);
create policy import_revision_pin_read on public.trip_source_revisions for select to otr_trip_source_writer using(true);
create policy import_representation_pin_read on public.trip_source_representations for select to otr_trip_source_writer using(true);
-- Immutable Event observations are needed for scoped target assertions; receipts
-- remain accessible only through the fixed bridge above.
grant select(id,trip_id) on public.itinerary_events to otr_trip_source_writer;
create policy import_source_target_read on public.itinerary_events for select to otr_trip_source_writer using(true);
grant execute on function public.trip_source_uuid_array_valid(uuid[],integer,integer) to otr_trip_source_writer;
grant execute on function extensions.gen_random_uuid() to otr_trip_source_writer;
revoke all on function public.trip_source_admit_event_operation(uuid,uuid,uuid,uuid,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_admit_event_operation(uuid,uuid,uuid,uuid,text,bigint,text) to otr_trip_source_writer;
revoke all on function public.trip_import_field_value(jsonb,text),public.trip_import_locators_valid(jsonb,uuid[]),public.trip_source_publish_flight_run(uuid,uuid,text),public.trip_source_prepare_confirmation(uuid,uuid,text),public.trip_source_mark_slot_dispatch(uuid,uuid,uuid,bigint,uuid,text),public.trip_event_receipt_for_source_slot(uuid,uuid,uuid,uuid,text),public.trip_source_admit_event_proof(uuid,uuid,uuid,uuid,text,bigint,text,uuid,uuid,text,jsonb),public.trip_source_finalize_event_slot(uuid,uuid,uuid,bigint,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_import_field_value(jsonb,text),public.trip_import_locators_valid(jsonb,uuid[]),public.trip_event_receipt_for_source_slot(uuid,uuid,uuid,uuid,text) to otr_trip_source_writer;
grant execute on function public.trip_source_admit_event_proof(uuid,uuid,uuid,uuid,text,bigint,text,uuid,uuid,text,jsonb) to otr_trip_event_semantic_writer;
grant execute on function public.trip_source_publish_flight_run(uuid,uuid,text),public.trip_source_prepare_confirmation(uuid,uuid,text),public.trip_source_mark_slot_dispatch(uuid,uuid,uuid,bigint,uuid,text),public.trip_source_finalize_event_slot(uuid,uuid,uuid,bigint,uuid,uuid) to otr_trip_source_command_gateway;
alter function public.trip_source_publish_flight_run(uuid,uuid,text) owner to otr_trip_source_writer;
alter function public.trip_source_prepare_confirmation(uuid,uuid,text) owner to otr_trip_source_writer;
alter function public.trip_source_mark_slot_dispatch(uuid,uuid,uuid,bigint,uuid,text) owner to otr_trip_source_writer;
alter function public.trip_event_receipt_for_source_slot(uuid,uuid,uuid,uuid,text) owner to otr_trip_event_receipt_reader;
alter function public.trip_source_admit_event_operation(uuid,uuid,uuid,uuid,text,bigint,text) owner to otr_trip_source_writer;
alter function public.trip_source_admit_event_proof(uuid,uuid,uuid,uuid,text,bigint,text,uuid,uuid,text,jsonb) owner to otr_trip_source_writer;
alter function public.trip_source_finalize_event_slot(uuid,uuid,uuid,bigint,uuid,uuid) owner to otr_trip_source_writer;
revoke create on schema public from otr_trip_source_writer,otr_trip_event_receipt_reader;
grant otr_trip_source_writer,otr_trip_event_receipt_reader to postgres with inherit false,set false;
commit;
