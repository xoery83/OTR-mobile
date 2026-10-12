-- Source-owned finite PDF custody completion and immutable derivative registration.
begin;
create table public.trip_source_pdf_registrations (
 operation_id uuid primary key, account_id uuid not null references auth.users,
 trip_id uuid not null references public.trips, source_id uuid not null references public.trip_sources,
 derived_representation_id uuid not null unique references public.trip_source_representations deferrable initially deferred,
 request_sha256 text not null check(request_sha256~'^[0-9a-f]{64}$'),
 registration_sha256 text not null check(registration_sha256~'^[0-9a-f]{64}$'),
 body jsonb not null check(octet_length(body::text)<=16384), created_at timestamptz not null default clock_timestamp()
);
alter table public.trip_source_pdf_registrations enable row level security;
alter table public.trip_source_pdf_registrations force row level security;
revoke all on public.trip_source_pdf_registrations from public,anon,authenticated,service_role,otr_trip_source_command_gateway;
create trigger source_pdf_registration_immutable before update or delete or truncate on public.trip_source_pdf_registrations for each statement execute function public.trip_source_pdf_immutable();
-- Gateway remains function-only. NOLOGIN writer gains only capabilities used by owning functions.
grant select,insert on public.trip_source_pdf_registrations to otr_trip_source_writer;
create policy source_pdf_registration_writer on public.trip_source_pdf_registrations to otr_trip_source_writer using(true) with check(true);
grant select,insert,update on public.trip_source_operations to otr_trip_source_writer;
create policy source_pdf_operations_writer on public.trip_source_operations to otr_trip_source_writer using(true) with check(true);
grant select,insert,update on public.trip_source_representations to otr_trip_source_writer;
create policy source_pdf_representation_writer on public.trip_source_representations to otr_trip_source_writer using(true) with check(true);
grant select on public.trip_sources,public.trip_source_revisions,public.trips,public.trip_members,public.journey_members,public.trip_source_actions,public.trip_source_pdf_gate to otr_trip_source_writer;
-- UPDATE(id/row_revision) is needed for SELECT FOR UPDATE; root/member DML stays denied/unexposed.
grant update(row_revision) on public.trip_sources to otr_trip_source_writer;
grant update(material_revision) on public.trip_source_revisions to otr_trip_source_writer;
grant update(id) on public.trips,public.trip_members,public.journey_members to otr_trip_source_writer;
create policy source_pdf_root_read on public.trip_sources for select to otr_trip_source_writer using(true);
create policy source_pdf_revision_read on public.trip_source_revisions for select to otr_trip_source_writer using(true);
create policy source_pdf_action_read on public.trip_source_actions for select to otr_trip_source_writer using(true);
create policy source_pdf_trip_read on public.trips for select to otr_trip_source_writer using(true);
create policy source_pdf_member_read on public.trip_members for select to otr_trip_source_writer using(true);
create policy source_pdf_journey_read on public.journey_members for select to otr_trip_source_writer using(true);
create policy source_pdf_gate_read on public.trip_source_pdf_gate for select to otr_trip_source_writer using(true);
-- RLS UPDATE USING admits row locks; WITH CHECK(false) forbids actual root/member writes.
create policy source_pdf_revision_lock on public.trip_source_revisions for update to otr_trip_source_writer using(true) with check(false);
create policy source_pdf_root_lock on public.trip_sources for update to otr_trip_source_writer using(true) with check(false);
create policy source_pdf_trip_lock on public.trips for update to otr_trip_source_writer using(true) with check(false);
create policy source_pdf_member_lock on public.trip_members for update to otr_trip_source_writer using(true) with check(false);
create policy source_pdf_journey_lock on public.journey_members for update to otr_trip_source_writer using(true) with check(false);

create function public.trip_source_pdf_registration_gate() returns void language plpgsql security invoker set search_path=pg_catalog as $$begin
 perform public.trip_source_assert_gate();
 if not exists(select 1 from public.trip_source_pdf_gate where enabled) then raise exception 'PDF_AUTHORITY_CLOSED';end if;
end$$;

-- Sole historical root replacement: default denial remains, with two finite guarded representation cases.
create or replace function public.guard_trip_source_mutation() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$declare b jsonb;begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' or tg_table_name<>'trip_source_representations' or tg_op not in ('INSERT','UPDATE') then raise exception 'TRIP_SOURCE_COMMANDS_DISABLED' using errcode='42501';end if;
 perform public.trip_source_pdf_registration_gate();
 if tg_level='STATEMENT' then return null;end if;
 if tg_op='UPDATE' then
  if old.role<>'ORIGINAL' or old.material_kind<>'BINARY' or old.mime_type<>'application/pdf' or old.remote_state<>'PENDING' or new.remote_state<>'VERIFIED' or new.row_revision<>old.row_revision+1 or new.verified_at is null or (to_jsonb(old)-array['row_revision','remote_state','verified_at']) is distinct from (to_jsonb(new)-array['row_revision','remote_state','verified_at']) or not exists(select 1 from public.trip_source_operations o join public.trip_sources s on s.id=o.source_id where o.representation_id=old.id and o.source_id=old.source_id and o.command='VERIFY_REPRESENTATION' and o.phase='IO_QUIESCENT' and o.worker_identity=session_user and o.expected_representation_row_revision=old.row_revision and o.bound_payload_sha256=old.payload_sha256 and o.bound_byte_count=old.byte_count and o.expected_source_row_revision=s.row_revision and o.material_revision=s.current_material_revision and o.actor_account_id=s.acquired_by) then raise exception 'PDF_MUTATION_DENIED';end if;
 else
  select body into b from public.trip_source_pdf_registrations where derived_representation_id=new.id and source_id=new.source_id;
  if b is null or new.role<>'DERIVED' or new.material_kind<>'TEXT' or new.row_revision<>1 or new.introduced_revision<>(b->'request'->>'sourceRevision')::bigint or new.parent_ids<>array[(b->'request'->>'originalRepresentationId')::uuid] or new.payload_sha256<>b->>'textSha256' or new.byte_count<>(b->>'textByteCount')::bigint or new.transform_key<>'otr.pdf.literal-text' or new.transform_version<>'1' or new.transform_options_sha256<>b->>'transformOptionsSha256' or new.regenerability<>'POSSIBLE' then raise exception 'PDF_MUTATION_DENIED';end if;
 end if;
 return new;
end$$;

create function public.trip_source_pdf_original_begin(actor uuid,raw text,attempt uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare q jsonb;o public.trip_source_operations;r public.trip_source_representations;reply jsonb;s public.trip_sources;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 q:=public.trip_source_command_codec(raw);
 if q->>'command'<>'VERIFY_REPRESENTATION' or q->>'actor_account_id'<>actor::text or attempt is null then raise exception 'INVALID_SOURCE_COMMAND';end if;
 reply:=public.trip_source_operation_lookup(actor,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,(q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');
 if reply->>'outcome' is not null then return jsonb_build_object('receipt',reply);end if;
 perform public.trip_source_pdf_registration_gate();
 reply:=public.trip_source_register('VERIFY_REPRESENTATION',actor,raw);
 if reply->>'outcome' is not null then return jsonb_build_object('receipt',reply);end if;
 select * into o from public.trip_source_operations where id=(q->>'operation_id')::uuid;
 select * into s from public.trip_sources where id=o.source_id;
 r:=public.trip_source_assert_pins(o);
 if r.mime_type<>'application/pdf' or r.byte_count>65536 or s.current_material_revision<>o.material_revision or s.lifecycle<>'ACTIVE' or s.retention_state<>'RETAINED' then raise exception 'PDF_CONTEXT_STALE';end if;
 perform public.trip_source_attempt_start(actor,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,o.phase,o.attempt_generation,o.attempt_id,attempt);
 return jsonb_build_object('original',to_jsonb(r));
end$$;
create function public.trip_source_pdf_original_finish(actor uuid,raw text,attempt uuid,sha text,len bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare q jsonb;o public.trip_source_operations;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 perform public.trip_source_pdf_registration_gate(); q:=public.trip_source_command_codec(raw);
 if q->>'command'<>'VERIFY_REPRESENTATION' or q->>'actor_account_id'<>actor::text then raise exception 'INVALID_SOURCE_COMMAND';end if;
 select * into o from public.trip_source_operations where id=(q->>'operation_id')::uuid and actor_account_id=actor and trip_id=(q->>'trip_id')::uuid and source_id=(q->>'source_id')::uuid and operation_sha256=q->>'operation_sha256' for update;
 if o.id is null or o.bound_mime_type<>'application/pdf' or o.bound_payload_sha256 is distinct from sha or o.bound_byte_count is distinct from len then raise exception 'MATERIAL_INTEGRITY_MISMATCH';end if;
 perform public.trip_source_attempt_observe(o.id,o.operation_sha256,'IO_ACTIVE',o.attempt_generation,attempt,'DEFINITIVE_COMPLETION');
 return public.trip_source_finalize(actor,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,o.attempt_generation,attempt,jsonb_build_object('operation_id',o.id,'attempt_id',attempt,'attempt_generation',o.attempt_generation,'kind','MATCH','payload_sha256',sha,'byte_count',len,'mime_type',o.bound_mime_type,'observed_at',public.trip_event_utc_timestamp(o.admitted_at)));
end$$;

create function public.trip_source_pdf_registration_lookup(actor uuid,trip uuid,operation uuid,digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.trip_source_pdf_registrations;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 select * into r from public.trip_source_pdf_registrations where operation_id=operation;
 if not found then return null;end if;
 if r.account_id is distinct from actor or r.trip_id is distinct from trip or not public.trip_source_pdf_access(actor,trip,r.source_id) then raise exception 'NOT_VISIBLE';end if;
 if r.request_sha256<>digest then raise exception 'OPERATION_REUSE_MISMATCH';end if;
 return jsonb_build_object('derivativeVersion',1,'operationId',operation,'registrationSha256',r.registration_sha256,'body',r.body);
end$$;
create function public.trip_source_pdf_registration_context(actor uuid,trip uuid,q jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare s public.trip_sources;r public.trip_source_representations;v public.trip_source_revisions;o public.trip_source_operations;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 if not public.trip_event_keys(q,array['derivativeVersion','operationId','sourceId','sourceRevision','sourceRowRevision','originalRepresentationId','originalRowRevision','derivedRepresentationId','verificationOperationId','verificationResultSha256']) or q->'derivativeVersion' is distinct from '1'::jsonb or (q->>'operationId')::uuid is null or (q->>'derivedRepresentationId')::uuid is null or q->>'verificationResultSha256' !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_PDF_REQUEST';end if;
 perform public.trip_source_pdf_registration_gate();perform public.trip_import_scope_lock(actor,trip);perform public.trip_source_lock_scope(actor,trip,(q->>'sourceId')::uuid);
 if not public.trip_source_pdf_access(actor,trip,(q->>'sourceId')::uuid) then raise exception 'NOT_VISIBLE';end if;
 select * into s from public.trip_sources where id=(q->>'sourceId')::uuid for update;
 select * into r from public.trip_source_representations where id=(q->>'originalRepresentationId')::uuid and source_id=s.id for update;
 select * into v from public.trip_source_revisions where source_id=s.id and material_revision=s.current_material_revision for share;
 select * into o from public.trip_source_operations where id=(q->>'verificationOperationId')::uuid;
 if r.id is null or v.source_id is null or o.id is null or s.current_material_revision is distinct from (q->>'sourceRevision')::bigint or s.row_revision is distinct from (q->>'sourceRowRevision')::bigint or v.retention_state<>'RETAINED' or v.original_representation_ids<>array[r.id] or r.row_revision is distinct from (q->>'originalRowRevision')::bigint or r.role<>'ORIGINAL' or r.material_kind<>'BINARY' or r.mime_type<>'application/pdf' or r.remote_state<>'VERIFIED' or r.retention_state<>'RETAINED' or r.introduced_revision>s.current_material_revision or o.command<>'VERIFY_REPRESENTATION' or o.phase<>'FINAL' or o.outcome<>'APPLIED' or o.actor_account_id<>actor or o.trip_id<>trip or o.source_id<>s.id or o.representation_id<>r.id or o.result_material_revision<>s.current_material_revision or o.result_source_row_revision<>s.row_revision or o.result_representation_row_revision<>r.row_revision or o.result_remote_state<>'VERIFIED' or o.result_sha256 is distinct from q->>'verificationResultSha256' then raise exception 'PDF_CONTEXT_STALE';end if;
 return to_jsonb(r);
end$$;
create function public.trip_source_pdf_registration_commit(b jsonb,digest text,t text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare q jsonb:=b->'request';actor uuid:=(b->>'accountId')::uuid;trip uuid:=(b->>'tripId')::uuid;r jsonb;prior jsonb;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 if not public.trip_event_keys(b,array['derivativeVersion','request','accountId','tripId','requestSha256','profileId','profileSha256','producer','originalSha256','originalByteCount','textSha256','textByteCount','transformOptionsSha256','pageMapSha256','pages']) or b->'derivativeVersion' is distinct from '1'::jsonb or digest is distinct from public.trip_source_hash('otr-source-pdf-registration-v1',b) or b->>'requestSha256' is distinct from public.trip_source_hash('otr-source-pdf-registration-request-v1',jsonb_build_object('accountId',actor,'tripId',trip,'request',q)) then raise exception 'INVALID_PDF_REGISTRATION';end if;
 prior:=public.trip_source_pdf_registration_lookup(actor,trip,(q->>'operationId')::uuid,b->>'requestSha256');
 if prior is not null then if prior->>'registrationSha256'<>digest then raise exception 'OPERATION_REUSE_MISMATCH';end if;return prior;end if;
 r:=public.trip_source_pdf_registration_context(actor,trip,q);
 if not public.trip_source_pdf_map_valid(b,t) or b->>'profileId' is distinct from 'OTR_PDF_LITERAL_TEXT_V1' or b->>'profileSha256' is distinct from 'dbd7dcc780685a57f16175a85d7161b87730874577ea1992490623508575d338' or b->>'producer' is distinct from 'otr-source-pdf-verifier/1' or b->>'transformOptionsSha256' is distinct from '618d1115d203c2d2112beb1ad185374480e2a60a4ab9682b4a985c3aec34a9b1' or r->>'payload_sha256' is distinct from b->>'originalSha256' or r->'byte_count' is distinct from b->'originalByteCount' or coalesce((b->>'originalByteCount')::bigint,0) not between 1 and 65536 or b->>'textSha256' is distinct from encode(extensions.digest(convert_to(t,'UTF8'),'sha256'),'hex') or b->'textByteCount' is distinct from to_jsonb(octet_length(t)) or octet_length(t) not between 1 and 2300 then raise exception 'INVALID_PDF_REGISTRATION';end if;
 insert into public.trip_source_pdf_registrations(operation_id,account_id,trip_id,source_id,derived_representation_id,request_sha256,registration_sha256,body) values((q->>'operationId')::uuid,actor,trip,(q->>'sourceId')::uuid,(q->>'derivedRepresentationId')::uuid,b->>'requestSha256',digest,b);
 insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,parent_ids,transform_key,transform_version,transform_options_sha256,regenerability,created_at,remote_state) values((q->>'derivedRepresentationId')::uuid,1,(q->>'sourceId')::uuid,(q->>'sourceRevision')::bigint,'DERIVED','TEXT','UTF-8',b->>'textSha256',(b->>'textByteCount')::bigint,t,array[(q->>'originalRepresentationId')::uuid],'otr.pdf.literal-text','1',b->>'transformOptionsSha256','POSSIBLE',clock_timestamp(),'NOT_APPLICABLE');
 return public.trip_source_pdf_registration_lookup(actor,trip,(q->>'operationId')::uuid,b->>'requestSha256');
end$$;

revoke all on function public.trip_source_pdf_registration_gate(),public.trip_source_pdf_original_begin(uuid,text,uuid),public.trip_source_pdf_original_finish(uuid,text,uuid,text,bigint),public.trip_source_pdf_registration_lookup(uuid,uuid,uuid,text),public.trip_source_pdf_registration_context(uuid,uuid,jsonb),public.trip_source_pdf_registration_commit(jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_pdf_registration_gate(),public.trip_source_pdf_access(uuid,uuid,uuid),public.trip_source_pdf_map_valid(jsonb,text),public.trip_import_scope_lock(uuid,uuid) to otr_trip_source_writer;
grant create on schema public to otr_trip_source_writer;
alter function public.trip_source_pdf_original_begin(uuid,text,uuid) owner to otr_trip_source_writer;
alter function public.trip_source_pdf_original_finish(uuid,text,uuid,text,bigint) owner to otr_trip_source_writer;
alter function public.trip_source_pdf_registration_lookup(uuid,uuid,uuid,text) owner to otr_trip_source_writer;
alter function public.trip_source_pdf_registration_context(uuid,uuid,jsonb) owner to otr_trip_source_writer;
alter function public.trip_source_pdf_registration_commit(jsonb,text,text) owner to otr_trip_source_writer;
revoke create on schema public from otr_trip_source_writer;
grant execute on function public.trip_source_pdf_original_begin(uuid,text,uuid),public.trip_source_pdf_original_finish(uuid,text,uuid,text,bigint),public.trip_source_pdf_registration_lookup(uuid,uuid,uuid,text),public.trip_source_pdf_registration_context(uuid,uuid,jsonb),public.trip_source_pdf_registration_commit(jsonb,text,text) to otr_trip_source_command_gateway;
commit;
