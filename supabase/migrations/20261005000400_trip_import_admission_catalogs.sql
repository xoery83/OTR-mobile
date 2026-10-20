begin;
set local search_path=pg_catalog;
-- CP13A.2: additive protected catalogs. Runtime admission remains structurally CLOSED.
create function public.trip_import_json_valid(value jsonb, maximum integer)
returns boolean language sql immutable security invoker set search_path=pg_catalog
as $$ select jsonb_typeof(value)='object' and octet_length(public.trip_event_canonical_json(value::json))<=maximum $$;
revoke all on function public.trip_import_json_valid(jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.trip_import_json_valid(jsonb,integer) to otr_trip_source_writer,otr_trip_event_semantic_writer;

create table public.trip_source_runs (
 id uuid primary key,
 row_revision bigint not null check(row_revision between 1 and 9007199254740991),
 trip_id uuid not null references public.trips(id) on delete restrict,
 actor_account_id uuid not null references auth.users(id) on delete restrict,
 operation_key text not null check(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 scope_source_ids uuid[] not null check(public.trip_source_uuid_array_valid(scope_source_ids,1,64)),
 scope_sha256 text not null check(scope_sha256 ~ '^[0-9a-f]{64}$'),
 generation bigint not null check(generation between 1 and 9007199254740991),
 input_sha256 text not null check(input_sha256 ~ '^[0-9a-f]{64}$'),
 extractor_key text not null check(char_length(extractor_key) between 1 and 128 and btrim(extractor_key)<>''),
 extractor_version text not null check(char_length(extractor_version) between 1 and 128 and btrim(extractor_version)<>''),
 extractor_options_sha256 text not null check(extractor_options_sha256 ~ '^[0-9a-f]{64}$'),
 state text not null default 'PENDING' check(state in ('PENDING','RUNNING','READY','FAILED')),
 superseded_by uuid references public.trip_source_runs(id) on delete restrict deferrable initially deferred,
 created_at timestamptz(6) not null check(isfinite(created_at)),
 completed_at timestamptz(6) check(isfinite(completed_at)),
 error_code text check(error_code in ('SOURCE_FAILURE','UNSUPPORTED_INPUT','EXTRACTOR_FAILURE','CANCELED')),
 retention_state text not null default 'RETAINED' check(retention_state in ('RETAINED','IDENTITY_ONLY')),
 unique(trip_id,actor_account_id,operation_key),
 unique(trip_id,actor_account_id,scope_sha256,generation),
 check((state='FAILED')=(error_code is not null)),
 check((state in ('READY','FAILED'))=(completed_at is not null))
);
create index trip_source_runs_scope on public.trip_source_runs(trip_id,actor_account_id,scope_sha256,generation desc);
create index trip_source_runs_superseded on public.trip_source_runs(superseded_by);
create table public.trip_source_confirmations (
 id uuid primary key,
 trip_id uuid not null references public.trips(id) on delete restrict,
 actor_account_id uuid not null references auth.users(id) on delete restrict,
 confirmation_key text not null check(confirmation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 intent_version smallint not null check(intent_version=1),
 intent_sha256 text not null check(intent_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 state text not null default 'PREPARED' check(state in ('PREPARED','PROCESSING','PARTIAL','COMPLETE','STOPPED')),
 row_revision bigint not null check(row_revision between 1 and 9007199254740991),
 retention_state text not null default 'RETAINED' check(retention_state in ('RETAINED','IDENTITY_ONLY')),
 unique(trip_id,actor_account_id,confirmation_key)
);
create index trip_source_confirmations_scope on public.trip_source_confirmations(trip_id,actor_account_id,state,id);
create table public.trip_source_inputs (
 id uuid primary key,
 run_id uuid default null references public.trip_source_runs(id) on delete restrict deferrable initially deferred,
 confirmation_id uuid default null references public.trip_source_confirmations(id) on delete restrict deferrable initially deferred,
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 material_revision bigint not null check(material_revision between 1 and 9007199254740991),
 representation_id uuid not null,
 payload_sha256 text check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 byte_count bigint check(byte_count between 0 and 9007199254740991),
 observed_source_row_revision bigint not null check(observed_source_row_revision between 1 and 9007199254740991),
 historical_selection boolean not null default false,
 check((run_id is null)<>(confirmation_id is null)),
 check((payload_sha256 is null)=(byte_count is null)),
 foreign key(source_id,material_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict,
 foreign key(source_id,representation_id) references public.trip_source_representations(source_id,id) on delete restrict
);
create index trip_source_inputs_run on public.trip_source_inputs(run_id,id);
create index trip_source_inputs_confirmation on public.trip_source_inputs(confirmation_id,id);
create index trip_source_inputs_material on public.trip_source_inputs(source_id,material_revision,representation_id);
create table public.trip_source_candidates (
 id uuid primary key,
 run_id uuid not null references public.trip_source_runs(id) on delete restrict deferrable initially deferred,
 candidate_key text not null check(candidate_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 candidate_kind text not null check(candidate_kind in ('TRANSPORT','STAY','ACTIVITY','NOTE','OPTIONAL_POI','UNCLASSIFIED')),
 proposal_version smallint not null check(proposal_version=1),
 proposal_sha256 text not null check(proposal_sha256 ~ '^[0-9a-f]{64}$'),
 proposal jsonb,
 created_at timestamptz(6) not null check(isfinite(created_at)),
 retention_state text not null default 'RETAINED' check(retention_state in ('RETAINED','IDENTITY_ONLY')),
 unique(run_id,candidate_key), unique(run_id,id),
 check(proposal is null and retention_state='IDENTITY_ONLY' or proposal is not null and public.trip_import_json_valid(proposal,262144))
);
create index trip_source_candidates_run on public.trip_source_candidates(run_id,id);
create table public.trip_source_output_slots (
 confirmation_id uuid not null references public.trip_source_confirmations(id) on delete restrict deferrable initially deferred,
 slot_id uuid primary key,
 slot_key text not null check(slot_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 disposition text not null check(disposition in ('CREATE','UPDATE','LINK_ONLY','REJECT','DEFER')),
 reviewed_run_id uuid,
 candidate_id uuid,
 intended_target_kind text check(intended_target_kind in ('ITINERARY_EVENT','ITINERARY_RESERVATION')),
 -- A pending CREATE must not acquire a speculative Event FK.
 intended_target_id uuid,
 base_revision bigint check(base_revision between 1 and 9007199254740991),
 adapter_key text check(adapter_key in ('itinerary-event-v1','itinerary-reservation-evidence-v1')),
 adapter_version smallint check(adapter_version=1),
 domain_operation_key text check(domain_operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 domain_intent_sha256 text check(domain_intent_sha256 ~ '^[0-9a-f]{64}$'),
 reviewed_payload jsonb check(public.trip_import_json_valid(reviewed_payload,262144)),
 support_version smallint not null check(support_version=1),
 support_payload jsonb,
 state text not null check(state in ('PREPARED','OUTCOME_UNKNOWN','DOMAIN_SUCCEEDED','EVIDENCE_PENDING','FINALIZED','REJECTED','DEFERRED','CONFLICTED','FAILED','CANCELED')),
 dispatched_at timestamptz(6) default null check(isfinite(dispatched_at)),
 receipt_ref text default null check(char_length(receipt_ref) between 1 and 512),
 result_target_kind text default null check(result_target_kind in ('ITINERARY_EVENT','ITINERARY_RESERVATION')),
 result_target_id uuid default null references public.itinerary_events(id) on delete restrict deferrable initially deferred,
 result_revision bigint default null check(result_revision between 1 and 9007199254740991),
 receipt_sha256 text default null check(receipt_sha256 ~ '^[0-9a-f]{64}$'),
 finalization_state text not null default 'NONE' check(finalization_state in ('NONE','PENDING','COMPLETE','BLOCKED')),
 failure_code text default null check(failure_code in ('INPUT_STALE','FORBIDDEN','DOMAIN_CONFLICT','DOMAIN_REJECTED','RECEIPT_UNAVAILABLE','EVIDENCE_FINALIZE_FAILED','OUTCOME_UNKNOWN')),
 retention_state text not null default 'RETAINED' check(retention_state in ('RETAINED','IDENTITY_ONLY')),
 create_claim_active boolean not null default false,
 no_commit_basis text default null check(no_commit_basis in ('UNDISPATCHED_REVOKED','VERIFIED_TERMINAL_RECEIPT')),
 no_commit_receipt_ref text default null check(char_length(no_commit_receipt_ref) between 1 and 512),
 no_commit_receipt_sha256 text default null check(no_commit_receipt_sha256 ~ '^[0-9a-f]{64}$'),
 no_commit_at timestamptz(6) default null check(isfinite(no_commit_at)),
 foreign key(reviewed_run_id,candidate_id) references public.trip_source_candidates(run_id,id) match full on delete restrict deferrable initially deferred,
 unique(confirmation_id,slot_key),
 check(support_payload is null and retention_state='IDENTITY_ONLY' or support_payload is not null and public.trip_import_json_valid(support_payload,262144)),
 check(disposition='CREATE' or not create_claim_active),
 check((receipt_ref is null)=(result_target_kind is null) and (receipt_ref is null)=(result_target_id is null) and (receipt_ref is null)=(result_revision is null) and (receipt_ref is null)=(receipt_sha256 is null)),
 check(receipt_ref is null or result_target_kind=intended_target_kind and result_target_id=intended_target_id),
 check((state in ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','FINALIZED'))=(receipt_ref is not null)),
 check(state not in ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','FINALIZED') and finalization_state='NONE' or state='DOMAIN_SUCCEEDED' and finalization_state='PENDING' or state='EVIDENCE_PENDING' and finalization_state in ('PENDING','BLOCKED') or state='FINALIZED' and finalization_state='COMPLETE'),
 check(state<>'OUTCOME_UNKNOWN' or dispatched_at is not null),
 check((no_commit_basis is null)=(no_commit_at is null)),
 check(no_commit_basis is null and no_commit_receipt_ref is null and no_commit_receipt_sha256 is null or
   no_commit_basis='UNDISPATCHED_REVOKED' and state='CANCELED' and dispatched_at is null and no_commit_receipt_ref is null and no_commit_receipt_sha256 is null and not create_claim_active or
   no_commit_basis='VERIFIED_TERMINAL_RECEIPT' and state in ('FAILED','CONFLICTED') and no_commit_receipt_ref is not null and no_commit_receipt_sha256 is not null and not create_claim_active),
 check(disposition in ('CREATE','UPDATE','LINK_ONLY') and intended_target_kind is not null and intended_target_id is not null and adapter_key is not null and adapter_version is not null and domain_operation_key is not null and domain_intent_sha256 is not null and reviewed_payload is not null or
   disposition in ('REJECT','DEFER') and intended_target_kind is null and intended_target_id is null and base_revision is null and adapter_key is null and adapter_version is null and domain_operation_key is null and domain_intent_sha256 is null and receipt_ref is null and support_payload='{}' and state=case disposition when 'REJECT' then 'REJECTED' else 'DEFERRED' end),
 check(disposition not in ('CREATE','REJECT','DEFER') or base_revision is null),
 check(disposition<>'UPDATE' or base_revision is not null)
);
create unique index trip_source_slot_create_claim on public.trip_source_output_slots(candidate_id,slot_key,intended_target_kind) where disposition='CREATE' and create_claim_active;
create index trip_source_slot_domain_operation on public.trip_source_output_slots(adapter_key,domain_operation_key) where domain_operation_key is not null;
create index trip_source_slot_candidate on public.trip_source_output_slots(candidate_id,slot_key,intended_target_kind);
create index trip_source_slot_confirmation on public.trip_source_output_slots(confirmation_id,slot_id);
create index trip_source_slot_intended on public.trip_source_output_slots(intended_target_id);
create index trip_source_slot_result on public.trip_source_output_slots(result_target_id);
create table public.trip_source_associations (
 id uuid primary key,
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 target_kind text not null check(target_kind in ('ITINERARY_EVENT','ITINERARY_RESERVATION')),
 target_id uuid not null references public.itinerary_events(id) on delete restrict,
 purpose text not null check(purpose in ('ATTACHED_EVIDENCE','CONFIRMED_SUPPORT')),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','INACTIVE')),
 row_revision bigint not null check(row_revision between 1 and 9007199254740991),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz(6) not null check(isfinite(created_at)),
 confirmation_id uuid default null references public.trip_source_confirmations(id) on delete restrict,
 preview_input_id uuid default null references public.trip_source_inputs(id) on delete restrict,
 preview_source_revision bigint default null,
 preview_representation_id uuid default null,
 inactive_reason text default null check(inactive_reason in ('UNLINK','SOURCE_DELETE','TARGET_DELETE')),
 inactive_at timestamptz(6) default null check(isfinite(inactive_at)),
 inactive_by uuid default null references auth.users(id) on delete restrict,
 foreign key(source_id,preview_source_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict,
 foreign key(source_id,preview_representation_id) references public.trip_source_representations(source_id,id) on delete restrict,
 check((preview_source_revision is null)=(preview_representation_id is null)),
 check(purpose<>'CONFIRMED_SUPPORT' or confirmation_id is not null),
 check((state='INACTIVE')=(inactive_reason is not null) and (state='INACTIVE')=(inactive_at is not null) and (state='INACTIVE')=(inactive_by is not null))
);
create index trip_source_associations_source on public.trip_source_associations(source_id,state);
create index trip_source_associations_target on public.trip_source_associations(target_kind,target_id,state);
create index trip_source_associations_confirmation on public.trip_source_associations(confirmation_id);
create unique index trip_source_associations_active on public.trip_source_associations(source_id,target_kind,target_id,purpose) where state='ACTIVE';

create table public.trip_source_run_predecessors (
 child_run_id uuid not null references public.trip_source_runs(id) on delete restrict,
 parent_run_id uuid not null references public.trip_source_runs(id) on delete restrict,
 relation text not null check(relation in ('REPROCESS','CONSOLIDATE')),
 primary key(child_run_id,parent_run_id), check(child_run_id<>parent_run_id)
);
create index trip_source_run_predecessors_parent on public.trip_source_run_predecessors(parent_run_id,child_run_id);
create table public.trip_source_candidate_lineage (
 child_candidate_id uuid not null references public.trip_source_candidates(id) on delete restrict,
 parent_candidate_id uuid not null references public.trip_source_candidates(id) on delete restrict,
 relation text not null check(relation in ('REPROCESS','CONSOLIDATE')),
 primary key(child_candidate_id,parent_candidate_id), check(child_candidate_id<>parent_candidate_id)
);
create index trip_source_candidate_lineage_parent on public.trip_source_candidate_lineage(parent_candidate_id,child_candidate_id);
create table public.trip_source_slot_lineage_dispositions (
 slot_id uuid not null references public.trip_source_output_slots(slot_id) on delete restrict,
 ancestor_candidate_id uuid not null references public.trip_source_candidates(id) on delete restrict,
 ancestor_slot_key text not null check(ancestor_slot_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 relation text not null check(relation in ('CONTINUE','MERGE_CONTINUE','DISTINCT_OUTPUT')),
 review_reason text not null check(char_length(review_reason) between 1 and 500 and btrim(review_reason)<>''),
 reviewed_by uuid not null references auth.users(id) on delete restrict,
 reviewed_at timestamptz(6) not null check(isfinite(reviewed_at)),
 primary key(slot_id,ancestor_candidate_id,ancestor_slot_key)
);
create index trip_source_slot_lineage_ancestor on public.trip_source_slot_lineage_dispositions(ancestor_candidate_id,ancestor_slot_key,slot_id);
create table public.trip_source_slot_dependencies (
 slot_id uuid not null references public.trip_source_output_slots(slot_id) on delete restrict,
 predecessor_slot_id uuid not null references public.trip_source_output_slots(slot_id) on delete restrict,
 dependency_kind text not null check(dependency_kind='RECEIPT_SUCCESS'),
 expected_receipt_sha256 text not null check(expected_receipt_sha256 ~ '^[0-9a-f]{64}$'),
 expected_target_id uuid not null references public.itinerary_events(id) on delete restrict,
 expected_result_revision bigint not null check(expected_result_revision between 1 and 9007199254740991),
 primary key(slot_id,predecessor_slot_id), check(slot_id<>predecessor_slot_id)
);
create index trip_source_slot_dependencies_predecessor on public.trip_source_slot_dependencies(predecessor_slot_id,slot_id);

create table public.itinerary_transport_services (
 event_id uuid not null references public.itinerary_events(id) on delete cascade,
 service_key text not null check(service_key ~ '^[A-Za-z0-9._:-]{1,32}$'),
 transport_subtype text not null check(transport_subtype in ('FLIGHT','TRAIN','BUS','FERRY')),
 attribution text not null check(attribution in ('MARKETING','OPERATING','UNSPECIFIED')),
 operator_namespace text not null check(operator_namespace in ('IATA_AIRLINE','ICAO_AIRLINE','AUTHORITY','NAME')),
 operator_issuer text not null check(char_length(operator_issuer) between 1 and 128 and btrim(operator_issuer)<>''),
 operator_value text not null check(char_length(operator_value) between 1 and 128 and btrim(operator_value)<>''),
 operator_literal text not null check(char_length(operator_literal) between 1 and 255 and btrim(operator_literal)<>''),
 service_number text not null check(char_length(service_number) between 1 and 64 and btrim(service_number)<>''),
 service_literal text not null check(char_length(service_literal) between 1 and 255 and btrim(service_literal)<>''),
 codeshare_operating_key text default null check(codeshare_operating_key ~ '^[A-Za-z0-9._:-]{1,32}$'),
 provenance_refs jsonb not null check(public.trip_import_json_valid(provenance_refs,16384)),
 primary key(event_id,service_key),
 unique(event_id,attribution,operator_namespace,operator_issuer,operator_value,service_number),
 foreign key(event_id,codeshare_operating_key) references public.itinerary_transport_services(event_id,service_key) on delete restrict deferrable initially deferred,
 check(codeshare_operating_key is null or attribution='MARKETING' and codeshare_operating_key<>service_key),
 check(operator_namespace<>'IATA_AIRLINE' or operator_issuer='IATA' and operator_value ~ '^[A-Z0-9]{2}$'),
 check(operator_namespace<>'ICAO_AIRLINE' or operator_issuer='ICAO' and operator_value ~ '^[A-Z]{3}$')
);
create index itinerary_transport_services_attribution on public.itinerary_transport_services(event_id,attribution);
create table public.trip_import_admission_gate (
 singleton boolean not null default true primary key check(singleton=true),
 adapter_version smallint not null default 1 check(adapter_version=1),
 flight_admission_enabled boolean not null default false check(flight_admission_enabled=false),
 capture_admission_enabled boolean not null default false check(capture_admission_enabled=false)
);
insert into public.trip_import_admission_gate values(true,1,false,false);

-- Default privilege pollution is detected, not silently accepted by a reserved role.
do $$ declare name text; principal text;
begin
 foreach name in array array['trip_source_runs','trip_source_inputs','trip_source_candidates','trip_source_confirmations','trip_source_output_slots','trip_source_associations','trip_source_run_predecessors','trip_source_candidate_lineage','trip_source_slot_lineage_dispositions','trip_source_slot_dependencies','itinerary_transport_services','trip_import_admission_gate'] loop
  foreach principal in array array['otr_trip_source_writer','otr_trip_source_command_gateway','otr_trip_source_operation_reader','otr_trip_event_semantic_writer','otr_trip_event_command_gateway','otr_trip_event_receipt_reader'] loop
   if has_table_privilege(principal,('public.'||name)::regclass,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'UNSAFE_IMPORT_DEFAULT_GRANTS'; end if;
  end loop;
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
  execute format('alter table public.%I enable row level security',name);
  execute format('alter table public.%I force row level security',name);
  if name like 'trip_source_%' then
   execute format('grant select,insert on public.%I to otr_trip_source_writer',name);
   execute format('create policy import_writer_read on public.%I for select to otr_trip_source_writer using(true)',name);
   execute format('create policy import_writer_insert on public.%I for insert to otr_trip_source_writer with check(true)',name);
  end if;
 end loop;
end $$;
grant select on public.trip_import_admission_gate to otr_trip_source_writer,otr_trip_event_semantic_writer;
create policy import_gate_writer_read on public.trip_import_admission_gate for select to otr_trip_source_writer,otr_trip_event_semantic_writer using(true);
grant update(row_revision,state,superseded_by,completed_at,error_code,retention_state) on public.trip_source_runs to otr_trip_source_writer;
grant update(row_revision,state,retention_state) on public.trip_source_confirmations to otr_trip_source_writer;
grant update(state,dispatched_at,receipt_ref,result_target_kind,result_target_id,result_revision,receipt_sha256,finalization_state,failure_code,retention_state,create_claim_active,no_commit_basis,no_commit_receipt_ref,no_commit_receipt_sha256,no_commit_at) on public.trip_source_output_slots to otr_trip_source_writer;
grant update(state,row_revision,inactive_reason,inactive_at,inactive_by) on public.trip_source_associations to otr_trip_source_writer;
create policy import_writer_update on public.trip_source_runs for update to otr_trip_source_writer using(true) with check(true);
create policy import_writer_update on public.trip_source_confirmations for update to otr_trip_source_writer using(true) with check(true);
create policy import_writer_update on public.trip_source_output_slots for update to otr_trip_source_writer using(true) with check(true);
create policy import_writer_update on public.trip_source_associations for update to otr_trip_source_writer using(true) with check(true);
-- No redaction entrypoint, service DML, reader projection or runtime setter is added
-- by this catalog migration. Guarded functions are installed by the next migration.
commit;
