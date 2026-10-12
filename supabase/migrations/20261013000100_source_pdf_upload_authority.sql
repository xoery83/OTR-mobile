-- Finite private PDF upload in the existing Source/execution journal. Runtime CLOSED.
begin;
create table public.trip_source_pdf_upload_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false constraint source_pdf_upload_closed check(not enabled),
 max_file_bytes bigint not null default 65536 check(max_file_bytes between 1 and 65536),
 account_stages integer not null default 16 check(account_stages between 1 and 256),
 account_bytes bigint not null default 1048576 check(account_bytes between 1 and 16777216),
 global_stages integer not null default 256 check(global_stages between 1 and 4096),
 global_bytes bigint not null default 16777216 check(global_bytes between 1 and 268435456),
 partial_review_seconds integer not null default 3600 check(partial_review_seconds>0),
 terminal_review_seconds integer not null default 86400 check(terminal_review_seconds>0)
);
insert into public.trip_source_pdf_upload_config(singleton) values(true);
revoke all on public.trip_source_pdf_upload_config from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter table public.trip_source_pdf_upload_config enable row level security;
alter table public.trip_source_pdf_upload_config force row level security;
grant select on public.trip_source_pdf_upload_config to otr_trip_source_writer,otr_trip_source_execution_writer;
create policy source_pdf_upload_config_read on public.trip_source_pdf_upload_config for select to otr_trip_source_writer,otr_trip_source_execution_writer using(true);
alter table public.trip_source_staged_resources add column pdf_actor_account_id uuid references auth.users,
 add column pdf_sealed_at timestamptz, add column pdf_stage_evidence_sha256 text;
alter table public.trip_source_staged_resources add constraint source_pdf_stage_shape check(
 (pdf_sealed_at is null)=(pdf_stage_evidence_sha256 is null) and
 (pdf_actor_account_id is not null or pdf_sealed_at is null) and
 (pdf_sealed_at is null or isfinite(pdf_sealed_at) and pdf_sealed_at>=created_at and pdf_stage_evidence_sha256~'^[0-9a-f]{64}$'));
alter table public.trip_source_execution_attempts add column pdf_binding jsonb,
 add column pdf_dispatch_id uuid unique, add column pdf_dispatched_at timestamptz,
 add column pdf_terminal_body jsonb;
-- Replace only PNG-specific CHECK shapes, keeping their original branch exact.
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.trip_source_execution_attempts'::regclass and contype='c' and (
 pg_get_constraintdef(oid) like '%profile_id%PNG_STATIC%' or pg_get_constraintdef(oid) like '%profile_sha256%526b66%' or
 pg_get_constraintdef(oid) like '%terminal_result%PARSE_PASS%' or
 pg_get_constraintdef(oid) like '%container_id%owner_run%') loop
 execute format('alter table public.trip_source_execution_attempts drop constraint %I',c.conname);
 end loop;
end$$;
alter table public.trip_source_execution_attempts add constraint source_execution_profile_shape check(
 (profile_id='PNG_STATIC_RGB8_RGBA8_V1' and profile_sha256='526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5'
 and pdf_binding is null and pdf_dispatch_id is null and pdf_dispatched_at is null and pdf_terminal_body is null
 and (terminal_result is null or terminal_result in ('PARSE_PASS','PARSER_TIMEOUT','PARSER_CRASH','PARSER_RESOURCE_LIMIT','PARSER_OUTPUT_LIMIT','PARSER_PROTOCOL','FORMAT_REJECTED'))
 and (phase<>'TERMINAL' or container_id is not null and owner_run is not null and terminal_observed_at>=created_at)
 and (phase<>'RUNNING' or container_id is not null and owner_run is not null))
 or (profile_id='PDF_PRIVATE_UPLOAD_V1' and profile_sha256='f5dccdd357e0a285a90e89707a70d531667313f2c07372b1c34f3c53871522c3'
 and pdf_binding is not null and jsonb_typeof(pdf_binding)='object' and octet_length(pdf_binding::text)<=8192
 and container_id is null and runtime_node_id is null
 and (pdf_dispatch_id is null)=(pdf_dispatched_at is null)
 and (pdf_dispatched_at is null or isfinite(pdf_dispatched_at) and pdf_dispatched_at>=created_at)
 and (phase<>'RUNNING' or pdf_dispatch_id is not null and owner_run is not null)
 and (phase='TERMINAL')=(pdf_terminal_body is not null)
 and (terminal_result is null or terminal_result in ('WRITER_TERMINAL','NO_DISPATCH'))
 and (phase<>'TERMINAL' or owner_run is not null and terminal_observed_at>=created_at
 and octet_length(pdf_terminal_body::text)<=16384)));
grant select on public.trip_source_execution_attempts,public.trip_source_staged_resources to otr_trip_source_writer;
create policy source_pdf_execution_read on public.trip_source_execution_attempts for select to otr_trip_source_writer using(true);
create policy source_pdf_stage_read on public.trip_source_staged_resources for select to otr_trip_source_writer using(true);
grant select on public.trip_source_representations,public.trip_sources,public.trip_source_revisions to otr_trip_source_execution_writer;
create policy source_pdf_execution_root_read on public.trip_sources for select to otr_trip_source_execution_writer using(true);
create policy source_pdf_execution_revision_read on public.trip_source_revisions for select to otr_trip_source_execution_writer using(true);
create policy source_pdf_execution_rep_read on public.trip_source_representations for select to otr_trip_source_execution_writer using(true);

create function public.trip_source_pdf_upload_gate() returns void
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
begin
 perform public.trip_source_pdf_registration_gate();
 if not exists(select 1 from public.trip_source_pdf_upload_config where enabled) then raise exception 'PDF_UPLOAD_CLOSED';end if;
 -- Serializes reservations and all finite PDF transitions with cleanup.
 perform pg_advisory_xact_lock(hashtextextended('otr-source-pdf-upload-v1',0));
end;
$$;

create function public.trip_source_pdf_upload_plan_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
begin
 if new.bound_mime_type='application/pdf' and new.command in ('UPLOAD_ORIGINAL','RECOVER_REPRESENTATION','VERIFY_REPRESENTATION') then
  if exists(select 1 from public.trip_source_operations o where o.representation_id=new.representation_id and o.id<>new.id and o.phase<>'FINAL') then raise exception 'SOURCE_IO_UNAVAILABLE';end if;
  if new.command in ('UPLOAD_ORIGINAL','RECOVER_REPRESENTATION') and exists(select 1 from public.trip_source_execution_attempts a where a.representation_id=new.representation_id and a.pdf_dispatch_id is not null) then raise exception 'PDF_UPLOAD_EPOCH_USED';end if;
 end if;
 return new;
end;
$$;
create unique index source_pdf_upload_exclusive_plan on public.trip_source_operations(representation_id) where bound_mime_type='application/pdf' and command in ('UPLOAD_ORIGINAL','RECOVER_REPRESENTATION','VERIFY_REPRESENTATION') and phase<>'FINAL';
create trigger source_pdf_upload_plan_guard before insert on public.trip_source_operations for each row execute function public.trip_source_pdf_upload_plan_guard();

create function public.trip_source_pdf_upload_row_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
begin
 if tg_table_name='trip_source_execution_attempts' then
  if old.profile_id='PDF_PRIVATE_UPLOAD_V1' and (
   (to_jsonb(old)-array['owner_run','owner_fence','phase','termination_outstanding','last_transition','transitioned_at','pdf_dispatch_id','pdf_dispatched_at','terminal_observed_at','terminal_evidence_sha256','terminal_result','pdf_terminal_body']) is distinct from
   (to_jsonb(new)-array['owner_run','owner_fence','phase','termination_outstanding','last_transition','transitioned_at','pdf_dispatch_id','pdf_dispatched_at','terminal_observed_at','terminal_evidence_sha256','terminal_result','pdf_terminal_body']) or
   old.pdf_dispatch_id is not null and (new.pdf_dispatch_id is distinct from old.pdf_dispatch_id or new.pdf_dispatched_at is distinct from old.pdf_dispatched_at) or
   old.phase='TERMINAL' and (new.phase<>'TERMINAL' or new.termination_outstanding or new.pdf_terminal_body is distinct from old.pdf_terminal_body or new.terminal_observed_at is distinct from old.terminal_observed_at or new.terminal_evidence_sha256 is distinct from old.terminal_evidence_sha256 or new.terminal_result is distinct from old.terminal_result)
  ) then raise exception 'PDF_UPLOAD_IMMUTABLE';end if;
 else
  if old.pdf_actor_account_id is not null then
   if (to_jsonb(old)-array['pdf_sealed_at','pdf_stage_evidence_sha256','release_authorized_at','cleaned_at','cleanup_evidence_sha256']) is distinct from (to_jsonb(new)-array['pdf_sealed_at','pdf_stage_evidence_sha256','release_authorized_at','cleaned_at','cleanup_evidence_sha256']) or
    old.release_authorized_at is not null and new.release_authorized_at is distinct from old.release_authorized_at or old.cleaned_at is not null and (new.cleaned_at is distinct from old.cleaned_at or new.cleanup_evidence_sha256 is distinct from old.cleanup_evidence_sha256) or
    old.pdf_sealed_at is not null and (new.pdf_sealed_at is distinct from old.pdf_sealed_at or new.pdf_stage_evidence_sha256 is distinct from old.pdf_stage_evidence_sha256) then raise exception 'PDF_STAGE_IMMUTABLE';end if;
   if new.release_authorized_at is not null or new.cleaned_at is not null then
    if exists(select 1 from public.trip_source_execution_attempts a join public.trip_source_operations o on o.id=a.operation_id join public.trip_source_representations r on r.id=a.representation_id join public.trip_sources root on root.id=a.source_id join public.trip_source_revisions rev on rev.source_id=root.id and rev.material_revision=root.current_material_revision where a.staged_resource_id=old.id and (root.lifecycle<>'ACTIVE' or root.retention_state<>'RETAINED' or rev.retention_state<>'RETAINED' or not r.id=any(rev.original_representation_ids) or r.payload_sha256 is distinct from old.payload_sha256 or r.byte_count is distinct from old.byte_count or a.phase<>'TERMINAL' or a.termination_outstanding or o.phase<>'FINAL' or r.remote_state<>'VERIFIED' or r.retention_state<>'RETAINED')) then raise exception 'SOURCE_STAGE_PROTECTED';end if;
   end if;
  end if;
 end if;
 return new;
end;
$$;
create trigger source_pdf_upload_immutable before update on public.trip_source_execution_attempts for each row execute function public.trip_source_pdf_upload_row_guard();
create trigger source_pdf_stage_immutable before update on public.trip_source_staged_resources for each row execute function public.trip_source_pdf_upload_row_guard();

create function public.trip_source_pdf_upload_reserve(operation uuid, attempt uuid, resource uuid, node uuid, resource_key text, run_token uuid, owner_run uuid, binding jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare o public.trip_source_operations;c public.trip_source_pdf_upload_config;a public.trip_source_execution_attempts;
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 select * into o from public.trip_source_operations where id=operation;
 select * into c from public.trip_source_pdf_upload_config;
 if not c.enabled or o.command<>'UPLOAD_ORIGINAL' or o.bound_mime_type<>'application/pdf' or o.bound_byte_count>c.max_file_bytes or o.phase<>'IO_ACTIVE' or o.worker_identity is distinct from session_user or o.attempt_id is distinct from attempt or resource is null or node is null or resource_key is null or resource_key!~'^[0-9a-f]{64}$' or run_token is null or owner_run is null then raise exception 'PDF_UPLOAD_INVALID';end if;
 if (select count(*)>=c.account_stages or coalesce(sum(byte_count),0)+o.bound_byte_count>c.account_bytes from public.trip_source_staged_resources where pdf_actor_account_id=o.actor_account_id and cleaned_at is null)
 or (select count(*)>=c.global_stages or coalesce(sum(byte_count),0)+o.bound_byte_count>c.global_bytes from public.trip_source_staged_resources where pdf_actor_account_id is not null and cleaned_at is null) then raise exception 'PDF_UPLOAD_QUOTA';end if;
 insert into public.trip_source_staged_resources(id,execution_principal,node_id,resource_key,payload_sha256,byte_count,pdf_actor_account_id) values(resource,session_user,node,resource_key,o.bound_payload_sha256,o.bound_byte_count,o.actor_account_id);
 insert into public.trip_source_execution_attempts(id,operation_id,canonical_generation,trip_id,source_id,representation_id,operation_sha256,operation_key,material_revision,execution_principal,staged_resource_id,profile_id,profile_sha256,run_token,owner_run,owner_fence,pdf_binding)
 values(attempt,o.id,o.attempt_generation,o.trip_id,o.source_id,o.representation_id,o.operation_sha256,o.operation_key,o.material_revision,session_user,resource,'PDF_PRIVATE_UPLOAD_V1','f5dccdd357e0a285a90e89707a70d531667313f2c07372b1c34f3c53871522c3',run_token,owner_run,1,binding) returning * into a;
 return to_jsonb(a);
end;
$$;

create function public.trip_source_pdf_upload_begin(actor uuid, raw text, attempt uuid, resource uuid, node uuid, resource_key text, run_token uuid, owner_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare q jsonb;o public.trip_source_operations;r public.trip_source_representations;reply jsonb;b jsonb;a public.trip_source_execution_attempts;
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 q:=public.trip_source_command_codec(raw);
 if q->>'command'<>'UPLOAD_ORIGINAL' or q->>'actor_account_id' is distinct from actor::text then raise exception 'INVALID_SOURCE_COMMAND';end if;
 reply:=public.trip_source_operation_lookup(actor,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,(q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');
 if reply->>'outcome' is not null then return jsonb_build_object('receipt',reply);end if;
 perform public.trip_source_pdf_upload_gate();
 if reply is not null then
  select * into a from public.trip_source_execution_attempts where operation_id=(q->>'operation_id')::uuid and profile_id='PDF_PRIVATE_UPLOAD_V1' order by canonical_generation desc limit 1;
  if a.id is null then raise exception 'PDF_UPLOAD_PLAN_CONFLICT';end if;
  return jsonb_build_object('journal',to_jsonb(a));
 end if;
 reply:=public.trip_source_register('UPLOAD_ORIGINAL',actor,raw);
 if reply->>'outcome' is not null then return jsonb_build_object('receipt',reply);end if;
 select * into o from public.trip_source_operations where id=(q->>'operation_id')::uuid;
 r:=public.trip_source_assert_pins(o);
 if r.role<>'ORIGINAL' or r.material_kind<>'BINARY' or r.mime_type<>'application/pdf' or r.byte_count>65536 or r.storage_provider<>'supabase_storage' or r.storage_bucket<>'trip-source-material' or r.object_key is distinct from 'v1/'||o.trip_id||'/'||o.source_id||'/'||r.id||'/payload' then raise exception 'PDF_UPLOAD_INVALID';end if;
 perform public.trip_source_attempt_start(actor,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,'ADMITTED',o.attempt_generation,null,attempt);
 b:=jsonb_build_object('uploadVersion',1,'operationId',o.id,'operationKey',o.operation_key,'operationSha256',o.operation_sha256,'actorAccountId',actor,'tripId',o.trip_id,'sourceId',o.source_id,'representationId',r.id,'materialRevision',o.material_revision,'sourceRowRevision',o.expected_source_row_revision,'representationRowRevision',o.expected_representation_row_revision,'parentOperationId',o.parent_operation_id,'attemptId',attempt,'attemptGeneration',o.attempt_generation,'executionPrincipal',session_user,'resourceId',resource,'nodeId',node,'resourceKey',resource_key,'runToken',run_token,'provider','supabase_storage','bucket','trip-source-material','objectKey',r.object_key,'sha256',r.payload_sha256,'byteCount',r.byte_count,'mimeType','application/pdf','profileId','PDF_PRIVATE_UPLOAD_V1','profileSha256','f5dccdd357e0a285a90e89707a70d531667313f2c07372b1c34f3c53871522c3');
 return jsonb_build_object('journal',public.trip_source_pdf_upload_reserve(o.id,attempt,resource,node,resource_key,run_token,owner_run,b));
end;
$$;

create function public.trip_source_pdf_upload_execution(attempt uuid, owner_run uuid, fence bigint, action text, proof jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts;s public.trip_source_staged_resources;observed timestamptz;b jsonb;
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 a:=public.trip_source_execution_lock(attempt,owner_run,fence);
 select * into s from public.trip_source_staged_resources where id=a.staged_resource_id;
 if a.profile_id<>'PDF_PRIVATE_UPLOAD_V1' then raise exception 'PDF_UPLOAD_PROFILE_CONFLICT';end if;
 if action='STAGE' then
  if a.phase<>'STARTING' or a.pdf_dispatch_id is not null or not public.trip_event_keys(proof,array['sha256','byteCount','evidenceSha256']) or proof->>'sha256' is distinct from s.payload_sha256 or proof->'byteCount' is distinct from to_jsonb(s.byte_count) or proof->>'evidenceSha256' is null or proof->>'evidenceSha256'!~'^[0-9a-f]{64}$' then raise exception 'PDF_STAGE_PROOF_CONFLICT';end if;
  if s.pdf_sealed_at is not null then
   if s.pdf_stage_evidence_sha256 is distinct from proof->>'evidenceSha256' then raise exception 'PDF_STAGE_PROOF_CONFLICT';end if;
  else update public.trip_source_staged_resources set pdf_sealed_at=clock_timestamp(),pdf_stage_evidence_sha256=proof->>'evidenceSha256' where id=s.id;end if;
 elsif action='DISPATCH' then
  if a.phase<>'STARTING' or a.owner_fence<>1 or a.pdf_dispatch_id is not null or s.pdf_sealed_at is null or s.release_authorized_at is not null then raise exception 'PDF_UPLOAD_DISPATCH_CONFLICT';end if;
  update public.trip_source_execution_attempts set pdf_dispatch_id=gen_random_uuid(),pdf_dispatched_at=clock_timestamp(),phase='RUNNING',last_transition='RUNNING',transitioned_at=clock_timestamp() where id=attempt returning * into a;
 elsif action='UNKNOWN' then
  if a.phase='TERMINAL' then raise exception 'PDF_UPLOAD_TERMINAL';end if;
  update public.trip_source_execution_attempts set phase='UNKNOWN',last_transition='UNKNOWN',transitioned_at=clock_timestamp() where id=attempt returning * into a;
 elsif action='TERMINAL' then
  if not public.trip_event_keys(proof,array['uploadVersion','issuer','binding','ownerRun','ownerFence','dispatchId','observedAt','disposition','object','evidenceSha256']) or proof->'uploadVersion' is distinct from '1'::jsonb or proof->>'issuer' is distinct from 'otr-source-pdf-upload-producer/1' or proof->'binding' is distinct from a.pdf_binding or proof->>'ownerRun' is distinct from owner_run::text or proof->'ownerFence' is distinct from to_jsonb(fence) or proof->'dispatchId' is distinct from to_jsonb(a.pdf_dispatch_id) and not (a.pdf_dispatch_id is null and proof->'dispatchId'='null'::jsonb) or proof->>'disposition' is null or proof->>'disposition' not in ('WRITER_TERMINAL','NO_DISPATCH') or proof->>'evidenceSha256' is null or proof->>'evidenceSha256'!~'^[0-9a-f]{64}$' then raise exception 'PDF_UPLOAD_PROOF_CONFLICT';end if;
  if a.phase='TERMINAL' then
   if a.pdf_terminal_body is distinct from proof then raise exception 'PDF_UPLOAD_IMMUTABLE';end if;
   return to_jsonb(a);
  end if;
  observed:=(proof->>'observedAt')::timestamptz;
  if proof->>'observedAt' is distinct from public.trip_event_utc_timestamp(observed) or not isfinite(observed) or observed<a.created_at or observed>clock_timestamp() or a.pdf_dispatched_at is not null and observed<a.pdf_dispatched_at or
   (proof->>'disposition'='NO_DISPATCH') is distinct from (a.pdf_dispatch_id is null) then raise exception 'PDF_UPLOAD_PROOF_CONFLICT';end if;
  b:=proof->'object';
  if not public.trip_event_keys(b,array['kind','sha256','byteCount','mimeType']) or b->>'kind' is null or b->>'kind' not in ('MATCH','MISSING','MISMATCH') or
   b->>'kind'='MATCH' and (b->>'sha256' is distinct from s.payload_sha256 or b->'byteCount' is distinct from to_jsonb(s.byte_count) or b->>'mimeType' is distinct from 'application/pdf') or
   b->>'kind'='MISSING' and (b->'sha256' is distinct from 'null'::jsonb or b->'byteCount' is distinct from 'null'::jsonb or b->'mimeType' is distinct from 'null'::jsonb) or
   b->>'kind'='MISMATCH' and (b->>'sha256' is null or b->>'sha256'!~'^[0-9a-f]{64}$' or jsonb_typeof(b->'byteCount') is distinct from 'number' or b->>'byteCount'!~'^(0|[1-9][0-9]*)$' or (b->>'byteCount')::numeric>9007199254740991 or b->>'mimeType' is null or char_length(b->>'mimeType') not between 1 and 128 or b->>'sha256'=s.payload_sha256 and b->'byteCount'=to_jsonb(s.byte_count) and b->>'mimeType'='application/pdf') or
   a.pdf_dispatch_id is null and b->>'kind'<>'MISSING' then raise exception 'PDF_UPLOAD_OBJECT_PROOF_CONFLICT';end if;
  update public.trip_source_execution_attempts set phase='TERMINAL',last_transition='TERMINAL',termination_outstanding=false,terminal_observed_at=observed,terminal_evidence_sha256=proof->>'evidenceSha256',terminal_result=proof->>'disposition',pdf_terminal_body=proof,transitioned_at=clock_timestamp() where id=attempt returning * into a;
 else raise exception 'PDF_UPLOAD_INVALID';end if;
 return to_jsonb(a);
end;
$$;

create function public.trip_source_pdf_upload_stage(attempt uuid, owner_run uuid, fence bigint, sha text, len bigint, evidence_sha text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
begin
 perform public.trip_source_pdf_upload_gate();
 return public.trip_source_pdf_upload_execution(attempt,owner_run,fence,'STAGE',jsonb_build_object('sha256',sha,'byteCount',len,'evidenceSha256',evidence_sha));
end;
$$;

create function public.trip_source_pdf_upload_dispatch(attempt uuid, owner_run uuid, fence bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts;o public.trip_source_operations;
begin
 perform public.trip_source_pdf_upload_gate();
 select * into a from public.trip_source_execution_attempts where id=attempt;
 select * into o from public.trip_source_operations where id=a.operation_id;
 perform public.trip_source_lock_scope(o.actor_account_id,o.trip_id,o.source_id);
 perform public.trip_source_assert_pins(o);
 if o.phase<>'IO_ACTIVE' or o.attempt_id is distinct from attempt then raise exception 'SOURCE_ATTEMPT_CONFLICT';end if;
 return public.trip_source_pdf_upload_execution(attempt,owner_run,fence,'DISPATCH',null);
end;
$$;

create function public.trip_source_pdf_upload_unknown(attempt uuid, owner_run uuid, fence bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a jsonb;o public.trip_source_operations;
begin
 -- Operational evidence survives custody/membership revocation; still requires producer identity and CLOSED gates.
 perform public.trip_source_pdf_upload_gate();
 a:=public.trip_source_pdf_upload_execution(attempt,owner_run,fence,'UNKNOWN',null);
 select * into o from public.trip_source_operations where id=(a->>'operation_id')::uuid;
 if o.phase in ('IO_ACTIVE','IO_UNKNOWN') then
  perform public.trip_source_attempt_observe(o.id,o.operation_sha256,o.phase,o.attempt_generation,attempt,'UNKNOWN');
 elsif o.phase not in ('IO_QUIESCENT','FINAL') then raise exception 'SOURCE_ATTEMPT_CONFLICT';end if;
 return a;
end;
$$;

create function public.trip_source_pdf_upload_terminal(attempt uuid, owner_run uuid, fence bigint, proof jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a jsonb;o public.trip_source_operations;
begin
 -- Operational evidence survives custody/membership revocation; still requires producer identity and CLOSED gates.
 perform public.trip_source_pdf_upload_gate();
 if proof->>'evidenceSha256' is distinct from public.trip_source_hash('otr-source-pdf-upload-terminal-v1',proof-'evidenceSha256') then raise exception 'PDF_UPLOAD_PROOF_CONFLICT';end if;
 a:=public.trip_source_pdf_upload_execution(attempt,owner_run,fence,'TERMINAL',proof);
 select * into o from public.trip_source_operations where id=(a->>'operation_id')::uuid;
 if o.phase in ('IO_ACTIVE','IO_UNKNOWN') then
  perform public.trip_source_attempt_observe(o.id,o.operation_sha256,o.phase,o.attempt_generation,attempt,'DEFINITIVE_COMPLETION');
 elsif o.phase not in ('IO_QUIESCENT','FINAL') then raise exception 'SOURCE_ATTEMPT_CONFLICT';end if;
 return a;
end;
$$;

create function public.trip_source_pdf_upload_finish(actor uuid, raw text, attempt uuid, owner_run uuid, fence bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare q jsonb;reply jsonb;a public.trip_source_execution_attempts;o public.trip_source_operations;b jsonb;
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 q:=public.trip_source_command_codec(raw);
 if q->>'command'<>'UPLOAD_ORIGINAL' or q->>'actor_account_id' is distinct from actor::text then raise exception 'INVALID_SOURCE_COMMAND';end if;
 reply:=public.trip_source_operation_lookup(actor,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,(q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');
 if reply->>'outcome' is not null then return reply;end if;
 perform public.trip_source_pdf_upload_gate();
 select * into a from public.trip_source_execution_attempts where id=attempt;
 if a.operation_id is distinct from (q->>'operation_id')::uuid or a.execution_principal is distinct from session_user or a.owner_run is distinct from owner_run or a.owner_fence is distinct from fence or a.profile_id<>'PDF_PRIVATE_UPLOAD_V1' or a.phase<>'TERMINAL' or a.termination_outstanding then raise exception 'PDF_UPLOAD_NOT_TERMINAL';end if;
 select * into o from public.trip_source_operations where id=a.operation_id;
 b:=a.pdf_terminal_body->'object';
 return public.trip_source_finalize(actor,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,o.attempt_generation,attempt,jsonb_build_object('operation_id',o.id,'attempt_id',attempt,'attempt_generation',o.attempt_generation,'kind',case when b->>'kind'='MISSING' then 'DEFINITE_MISSING' else b->>'kind' end,'payload_sha256',b->'sha256','byte_count',b->'byteCount','mime_type',b->'mimeType','observed_at',public.trip_event_utc_timestamp(a.terminal_observed_at)));
end;
$$;

create function public.trip_source_pdf_upload_claim(attempt uuid, expected_fence bigint, new_owner_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts;begin
 perform public.trip_source_pdf_upload_gate();
 select * into a from public.trip_source_execution_attempts where id=attempt;
 if a.profile_id is distinct from 'PDF_PRIVATE_UPLOAD_V1' then raise exception 'PDF_UPLOAD_PROFILE_CONFLICT';end if;
 return public.trip_source_execution_claim(attempt,expected_fence,new_owner_run);
end;
$$;

create function public.trip_source_pdf_upload_inventory(actor uuid, trip uuid, source uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
begin
 if session_user<>'otr_trip_source_command_gateway' or not public.trip_source_pdf_access(actor,trip,source) then raise exception 'NOT_VISIBLE';end if;
 return (select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('staged_resource',to_jsonb(s)) order by a.id),'[]'::jsonb) from public.trip_source_execution_attempts a join public.trip_source_staged_resources s on s.id=a.staged_resource_id join public.trip_source_operations o on o.id=a.operation_id where a.profile_id='PDF_PRIVATE_UPLOAD_V1' and a.execution_principal=session_user and o.actor_account_id=actor and a.trip_id=trip and a.source_id=source and (a.phase<>'TERMINAL' or s.cleaned_at is null));
end;
$$;
create or replace function public.trip_source_execution_inventory() returns jsonb
language sql stable security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
 select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('staged_resource',to_jsonb(s)) order by a.id),'[]'::jsonb)
 from public.trip_source_execution_attempts a join public.trip_source_staged_resources s on s.id=a.staged_resource_id
 where a.execution_principal=session_user and a.profile_id='PNG_STATIC_RGB8_RGBA8_V1' and (a.phase<>'TERMINAL' or s.cleaned_at is null)
$$;
create function public.trip_source_pdf_upload_release(attempt uuid,owner_run uuid,fence bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$begin
 perform public.trip_source_pdf_upload_gate();
 if not exists(select 1 from public.trip_source_execution_attempts where id=attempt and profile_id='PDF_PRIVATE_UPLOAD_V1') then raise exception 'PDF_UPLOAD_PROFILE_CONFLICT';end if;
 return public.trip_source_execution_release(attempt,owner_run,fence);
end$$;
create function public.trip_source_pdf_upload_cleaned(attempt uuid,owner_run uuid,fence bigint,node uuid,resource_key text,evidence_sha256 text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$begin
 perform public.trip_source_pdf_upload_gate();
 if not exists(select 1 from public.trip_source_execution_attempts where id=attempt and profile_id='PDF_PRIVATE_UPLOAD_V1') then raise exception 'PDF_UPLOAD_PROFILE_CONFLICT';end if;
 return public.trip_source_execution_cleaned(attempt,owner_run,fence,node,resource_key,evidence_sha256);
end$$;
grant create on schema public to otr_trip_source_writer,otr_trip_source_execution_writer;
revoke all on function public.trip_source_pdf_upload_gate() from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_gate() owner to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_upload_plan_guard() from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_plan_guard() owner to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_upload_row_guard() from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_row_guard() owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_pdf_upload_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb) owner to otr_trip_source_execution_writer;
grant execute on function public.trip_source_pdf_upload_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb) to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_upload_begin(uuid,text,uuid,uuid,uuid,text,uuid,uuid) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_begin(uuid,text,uuid,uuid,uuid,text,uuid,uuid) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_begin(uuid,text,uuid,uuid,uuid,text,uuid,uuid) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_upload_execution(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_execution(uuid,uuid,bigint,text,jsonb) owner to otr_trip_source_execution_writer;
grant execute on function public.trip_source_pdf_upload_execution(uuid,uuid,bigint,text,jsonb) to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_upload_stage(uuid,uuid,bigint,text,bigint,text) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_stage(uuid,uuid,bigint,text,bigint,text) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_stage(uuid,uuid,bigint,text,bigint,text) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_upload_dispatch(uuid,uuid,bigint) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_dispatch(uuid,uuid,bigint) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_dispatch(uuid,uuid,bigint) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_upload_unknown(uuid,uuid,bigint) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_unknown(uuid,uuid,bigint) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_unknown(uuid,uuid,bigint) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_upload_terminal(uuid,uuid,bigint,jsonb) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_terminal(uuid,uuid,bigint,jsonb) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_terminal(uuid,uuid,bigint,jsonb) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_upload_finish(uuid,text,uuid,uuid,bigint) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_finish(uuid,text,uuid,uuid,bigint) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_finish(uuid,text,uuid,uuid,bigint) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_upload_claim(uuid,bigint,uuid) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_claim(uuid,bigint,uuid) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_claim(uuid,bigint,uuid) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_upload_inventory(uuid,uuid,uuid) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_inventory(uuid,uuid,uuid) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_inventory(uuid,uuid,uuid) to otr_trip_source_command_gateway;
grant execute on function public.trip_event_keys(jsonb,text[],text[]),public.trip_event_utc_timestamp(timestamptz) to otr_trip_source_execution_writer;
grant execute on function public.trip_source_execution_claim(uuid,bigint,uuid) to otr_trip_source_writer;
revoke create on schema public from otr_trip_source_writer,otr_trip_source_execution_writer;
grant create on schema public to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_upload_release(uuid,uuid,bigint),public.trip_source_pdf_upload_cleaned(uuid,uuid,bigint,uuid,text,text) from public,anon,authenticated,service_role,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_upload_release(uuid,uuid,bigint) owner to otr_trip_source_writer;
alter function public.trip_source_pdf_upload_cleaned(uuid,uuid,bigint,uuid,text,text) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_upload_release(uuid,uuid,bigint),public.trip_source_pdf_upload_cleaned(uuid,uuid,bigint,uuid,text,text) to otr_trip_source_command_gateway;
grant execute on function public.trip_source_execution_release(uuid,uuid,bigint),public.trip_source_execution_cleaned(uuid,uuid,bigint,uuid,text,text) to otr_trip_source_writer;
revoke create on schema public from otr_trip_source_writer;
commit;
