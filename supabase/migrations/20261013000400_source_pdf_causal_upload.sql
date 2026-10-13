-- Finite V3 causal authority on existing Source journal; old profiles unchanged. CLOSED.
begin;
alter table public.trip_source_pdf_upload_config add column causal_enabled boolean not null default false constraint source_pdf_causal_closed check(not causal_enabled);
alter table public.trip_source_staged_resources add column pdf_causal_profile_id text check(pdf_causal_profile_id is null or pdf_causal_profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3');
alter table public.trip_source_staged_resources drop constraint source_pdf_stage_shape;
alter table public.trip_source_staged_resources add constraint source_pdf_stage_shape check(
 (pdf_sealed_at is null)=(pdf_stage_evidence_sha256 is null) and
 (pdf_actor_account_id is not null or pdf_sealed_at is null) and
 (pdf_sealed_at is null or isfinite(pdf_sealed_at) and pdf_stage_evidence_sha256~'^[0-9a-f]{64}$' and (pdf_causal_profile_id is not null and pdf_causal_profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' or pdf_sealed_at>=created_at)) and
 (pdf_causal_profile_id is null or pdf_actor_account_id is not null));
alter table public.trip_source_execution_attempts add column pdf_causal_read_permit jsonb;
alter table public.trip_source_execution_attempts add constraint source_causal_permit_profile check(profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' or pdf_causal_read_permit is null);
alter table public.trip_source_execution_attempts drop constraint source_execution_profile_shape;
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
 and octet_length(pdf_terminal_body::text)<=16384))
 or (profile_id='PDF_PRIVATE_UPLOAD_BETA_ACK_V2' and profile_sha256='68bf77a7d1f6f0a88e1c2278917cf62609e7f1a03369bc3dcfb96e85cb8445cb'
 and pdf_binding is not null and jsonb_typeof(pdf_binding)='object' and octet_length(pdf_binding::text)<=8192
 and container_id is null and runtime_node_id is null and phase<>'TERMINAL' and termination_outstanding
 and terminal_observed_at is null and terminal_evidence_sha256 is null and terminal_result is null and pdf_terminal_body is null
 and (pdf_dispatch_id is null)=(pdf_dispatched_at is null)
 and (pdf_dispatched_at is null or isfinite(pdf_dispatched_at) and pdf_dispatched_at>=created_at)
 and (phase<>'RUNNING' or pdf_dispatch_id is not null and owner_run is not null)
 and (pdf_beta_ack is null or pdf_dispatch_id is not null and jsonb_typeof(pdf_beta_ack)='object' and octet_length(pdf_beta_ack::text)<=16384)
 and (pdf_beta_get is null or pdf_beta_ack is not null and jsonb_typeof(pdf_beta_get)='object' and octet_length(pdf_beta_get::text)<=16384)) or (profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' and profile_sha256='c8c017e4aab33ece1067ba3a063af2029e09edf5d6a5ba1b375c069a3268c00b'
 and pdf_binding is not null and jsonb_typeof(pdf_binding)='object' and octet_length(pdf_binding::text)<=8192
 and container_id is null and runtime_node_id is null and phase<>'TERMINAL' and termination_outstanding
 and terminal_observed_at is null and terminal_evidence_sha256 is null and terminal_result is null and pdf_terminal_body is null
 and (pdf_dispatch_id is null)=(pdf_dispatched_at is null)
 and (pdf_dispatched_at is null or isfinite(pdf_dispatched_at))
 and (phase<>'RUNNING' or pdf_dispatch_id is not null and owner_run is not null)
 and (pdf_beta_ack is null or pdf_dispatch_id is not null and jsonb_typeof(pdf_beta_ack)='object' and octet_length(pdf_beta_ack::text)<=16384)
 and (pdf_beta_get is null or pdf_beta_ack is not null and pdf_causal_read_permit is not null and jsonb_typeof(pdf_beta_get)='object' and octet_length(pdf_beta_get::text)<=16384)));
alter table public.trip_source_execution_attempts drop constraint source_pdf_beta_evidence_profile;
alter table public.trip_source_execution_attempts add constraint source_pdf_beta_evidence_profile check(profile_id in ('PDF_PRIVATE_UPLOAD_BETA_ACK_V2','PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3') or pdf_beta_ack is null and pdf_beta_get is null);
create function public.trip_source_pdf_causal_gate() returns void
language plpgsql security definer set search_path=pg_catalog as $$begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 perform public.trip_source_pdf_registration_gate();
 if not exists(select 1 from public.trip_source_pdf_upload_config where causal_enabled) then raise exception 'PDF_CAUSAL_CLOSED';end if;
 perform pg_advisory_xact_lock(hashtextextended('otr-source-pdf-upload-v1',0));
end$$;
create function public.trip_source_pdf_causal_row_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$begin
 if old.profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' and (
 (to_jsonb(old)-array['owner_run','owner_fence','phase','last_transition','transitioned_at','pdf_dispatch_id','pdf_dispatched_at','pdf_beta_ack','pdf_beta_get','pdf_causal_read_permit']) is distinct from
 (to_jsonb(new)-array['owner_run','owner_fence','phase','last_transition','transitioned_at','pdf_dispatch_id','pdf_dispatched_at','pdf_beta_ack','pdf_beta_get','pdf_causal_read_permit'])
 or old.pdf_dispatch_id is not null and (new.pdf_dispatch_id is distinct from old.pdf_dispatch_id or new.pdf_dispatched_at is distinct from old.pdf_dispatched_at)
 or old.pdf_beta_ack is not null and new.pdf_beta_ack is distinct from old.pdf_beta_ack
 or old.pdf_beta_get is not null and new.pdf_beta_get is distinct from old.pdf_beta_get
 or old.pdf_causal_read_permit is not null and new.pdf_causal_read_permit is distinct from old.pdf_causal_read_permit and not (old.pdf_beta_get is null and new.owner_fence>(old.pdf_causal_read_permit->>'ownerFence')::bigint)
 ) then raise exception 'PDF_BETA_IMMUTABLE';end if;
 return new;
end$$;
create trigger source_pdf_causal_immutable before update on public.trip_source_execution_attempts for each row execute function public.trip_source_pdf_causal_row_guard();
create function public.trip_source_pdf_causal_association() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$declare tag text;begin
 select pdf_causal_profile_id into tag from public.trip_source_staged_resources where id=new.staged_resource_id;
 if (new.profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3') is distinct from (tag='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' and tag is not null) then raise exception 'PDF_CAUSAL_STAGE_PROFILE_CONFLICT';end if;
 return new;
end$$;
create trigger source_pdf_causal_association before insert or update on public.trip_source_execution_attempts for each row execute function public.trip_source_pdf_causal_association();
-- Visible own subtransactions remain rollbackable after RELEASE SAVEPOINT.
-- Qualify xmin in the nearest epoch of one native xid8 anchor; accept only committed status.
create function public.trip_source_pdf_causal_committed(attempt uuid, stage boolean default false) returns boolean
language sql volatile security definer set search_path=pg_catalog as $$
 with anchor as materialized (select pg_current_xact_id()::text::numeric as full_xid),
 version as (
 select anchor.full_xid,(case when stage then s.xmin else a.xmin end)::text::numeric-mod(anchor.full_xid,4294967296) as delta
 from public.trip_source_execution_attempts a join public.trip_source_staged_resources s on s.id=a.staged_resource_id
 cross join anchor
 where a.id=attempt and a.execution_principal=session_user and a.profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3'
 )
 select coalesce(pg_xact_status((full_xid+case when delta>2147483647 then delta-4294967296 when delta< -2147483648 then delta+4294967296 else delta end)::text::xid8)='committed',false) from version
$$;
create function public.trip_source_pdf_causal_reserve(operation uuid, attempt uuid, resource uuid, node uuid, resource_key text, run_token uuid, owner_run uuid, binding jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare o public.trip_source_operations;c public.trip_source_pdf_upload_config;a public.trip_source_execution_attempts;
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 select * into o from public.trip_source_operations where id=operation;
 select * into c from public.trip_source_pdf_upload_config;
 if not c.causal_enabled or o.command<>'UPLOAD_ORIGINAL' or o.bound_mime_type<>'application/pdf' or o.bound_byte_count>c.max_file_bytes or o.phase<>'IO_ACTIVE' or o.worker_identity is distinct from session_user or o.attempt_id is distinct from attempt or resource is null or node is null or resource_key is null or resource_key!~'^[0-9a-f]{64}$' or run_token is null or owner_run is null then raise exception 'PDF_UPLOAD_INVALID';end if;
 if (select count(*)>=c.account_stages or coalesce(sum(byte_count),0)+o.bound_byte_count>c.account_bytes from public.trip_source_staged_resources where pdf_actor_account_id=o.actor_account_id and cleaned_at is null)
 or (select count(*)>=c.global_stages or coalesce(sum(byte_count),0)+o.bound_byte_count>c.global_bytes from public.trip_source_staged_resources where pdf_actor_account_id is not null and cleaned_at is null) then raise exception 'PDF_UPLOAD_QUOTA';end if;
 insert into public.trip_source_staged_resources(id,execution_principal,node_id,resource_key,payload_sha256,byte_count,pdf_actor_account_id,pdf_causal_profile_id) values(resource,session_user,node,resource_key,o.bound_payload_sha256,o.bound_byte_count,o.actor_account_id,'PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3');
 insert into public.trip_source_execution_attempts(id,operation_id,canonical_generation,trip_id,source_id,representation_id,operation_sha256,operation_key,material_revision,execution_principal,staged_resource_id,profile_id,profile_sha256,run_token,owner_run,owner_fence,pdf_binding)
 values(attempt,o.id,o.attempt_generation,o.trip_id,o.source_id,o.representation_id,o.operation_sha256,o.operation_key,o.material_revision,session_user,resource,'PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3','c8c017e4aab33ece1067ba3a063af2029e09edf5d6a5ba1b375c069a3268c00b',run_token,owner_run,1,binding) returning * into a;
 return to_jsonb(a);
end;
$$;
create function public.trip_source_pdf_causal_begin(actor uuid, raw text, attempt uuid, resource uuid, node uuid, resource_key text, run_token uuid, owner_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare q jsonb;o public.trip_source_operations;r public.trip_source_representations;reply jsonb;b jsonb;a public.trip_source_execution_attempts;
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 q:=public.trip_source_command_codec(raw);
 if q->>'command'<>'UPLOAD_ORIGINAL' or q->>'actor_account_id' is distinct from actor::text then raise exception 'INVALID_SOURCE_COMMAND';end if;
 reply:=public.trip_source_operation_lookup(actor,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,(q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');
 if reply->>'outcome' is not null then return jsonb_build_object('receipt',reply);end if;
 perform public.trip_source_pdf_causal_gate();
 if reply is not null then
  select * into a from public.trip_source_execution_attempts where operation_id=(q->>'operation_id')::uuid and profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' order by canonical_generation desc limit 1;
  if a.id is null then raise exception 'PDF_UPLOAD_PLAN_CONFLICT';end if;
  return jsonb_build_object('journal',to_jsonb(a));
 end if;
 reply:=public.trip_source_register('UPLOAD_ORIGINAL',actor,raw);
 if reply->>'outcome' is not null then return jsonb_build_object('receipt',reply);end if;
 select * into o from public.trip_source_operations where id=(q->>'operation_id')::uuid;
 r:=public.trip_source_assert_pins(o);
 if r.role<>'ORIGINAL' or r.material_kind<>'BINARY' or r.mime_type<>'application/pdf' or r.byte_count>65536 or r.storage_provider<>'supabase_storage' or r.storage_bucket<>'trip-source-material' or r.object_key is distinct from 'v1/'||o.trip_id||'/'||o.source_id||'/'||r.id||'/payload' then raise exception 'PDF_UPLOAD_INVALID';end if;
 perform public.trip_source_attempt_start(actor,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,'ADMITTED',o.attempt_generation,null,attempt);
 b:=jsonb_build_object('uploadVersion',3,'operationId',o.id,'operationKey',o.operation_key,'operationSha256',o.operation_sha256,'actorAccountId',actor,'tripId',o.trip_id,'sourceId',o.source_id,'representationId',r.id,'materialRevision',o.material_revision,'sourceRowRevision',o.expected_source_row_revision,'representationRowRevision',o.expected_representation_row_revision,'parentOperationId',o.parent_operation_id,'attemptId',attempt,'attemptGeneration',o.attempt_generation,'executionPrincipal',session_user,'resourceId',resource,'nodeId',node,'resourceKey',resource_key,'runToken',run_token,'provider','supabase_storage','bucket','trip-source-material','objectKey',r.object_key,'sha256',r.payload_sha256,'byteCount',r.byte_count,'mimeType','application/pdf','producerId',(select beta_producer_id from public.trip_source_pdf_upload_config),'providerInstanceSha256',(select beta_provider_instance_sha256 from public.trip_source_pdf_upload_config),'profileId','PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3','profileSha256','c8c017e4aab33ece1067ba3a063af2029e09edf5d6a5ba1b375c069a3268c00b');
 return jsonb_build_object('journal',public.trip_source_pdf_causal_reserve(o.id,attempt,resource,node,resource_key,run_token,owner_run,b));
end;
$$;
create function public.trip_source_pdf_causal_execution(attempt uuid, owner_run uuid, fence bigint, action text, proof jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts;s public.trip_source_staged_resources;observed timestamptz;b jsonb;
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 a:=public.trip_source_execution_lock(attempt,owner_run,fence);
 select * into s from public.trip_source_staged_resources where id=a.staged_resource_id;
 if a.profile_id<>'PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' then raise exception 'PDF_UPLOAD_PROFILE_CONFLICT';end if;
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
 elsif action='READ' then
  update public.trip_source_execution_attempts set pdf_causal_read_permit=proof where id=attempt returning * into a;
 elsif action='CONFIRM' then
  null;
 elsif action='ACK' then
  if a.pdf_beta_ack is not null and a.pdf_beta_ack is distinct from proof then raise exception 'PDF_BETA_IMMUTABLE';end if;
  update public.trip_source_execution_attempts set pdf_beta_ack=proof where id=attempt returning * into a;
 elsif action='GET' then
  if a.pdf_beta_get is not null and a.pdf_beta_get is distinct from proof then raise exception 'PDF_BETA_IMMUTABLE';end if;
  update public.trip_source_execution_attempts set pdf_beta_get=proof where id=attempt returning * into a;
 else raise exception 'PDF_BETA_ACTION_INVALID';end if;
 return to_jsonb(a);
end;
$$;
create function public.trip_source_pdf_causal_execute(attempt uuid, owner_run uuid, fence bigint, action text, proof jsonb default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts;o public.trip_source_operations;t timestamptz;b jsonb;j jsonb;
begin
 perform public.trip_source_pdf_causal_gate();
 select * into a from public.trip_source_execution_attempts where id=attempt;
 if a.profile_id is distinct from 'PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' or a.execution_principal is distinct from session_user or a.owner_run is distinct from owner_run or a.owner_fence is distinct from fence then raise exception 'PDF_BETA_OWNER_CONFLICT';end if;
 select * into o from public.trip_source_operations where id=a.operation_id;
 if action in ('DISPATCH','CONFIRM','READ','GET') then
  perform public.trip_source_lock_scope(o.actor_account_id,o.trip_id,o.source_id);
  perform public.trip_source_assert_pins(o);
 end if;
 if o.attempt_id is distinct from attempt or o.attempt_generation is distinct from a.canonical_generation then raise exception 'SOURCE_ATTEMPT_CONFLICT';end if;
 if action='DISPATCH' and (o.phase<>'IO_ACTIVE' or o.attempt_id is distinct from attempt) then raise exception 'SOURCE_ATTEMPT_CONFLICT';end if;
 if action in ('DISPATCH','CONFIRM','ACK','READ','GET') and not coalesce(public.trip_source_pdf_causal_committed(attempt),false) then raise exception 'PDF_CAUSAL_COMMIT_REQUIRED';end if;
 if action='DISPATCH' and not coalesce(public.trip_source_pdf_causal_committed(attempt,true),false) then raise exception 'PDF_CAUSAL_COMMIT_REQUIRED';end if;
 if action='CONFIRM' then
  if proof is not null or a.owner_fence<>1 or a.phase<>'RUNNING' or a.pdf_dispatch_id is null or a.pdf_beta_ack is not null or o.phase<>'IO_ACTIVE' then raise exception 'PDF_CAUSAL_NO_NEW_WRITE';end if;
 elsif action='READ' then
  if proof is not null or a.pdf_beta_ack is null or a.pdf_dispatch_id is null or a.phase not in ('RUNNING','UNKNOWN') then raise exception 'PDF_CAUSAL_ACK_REQUIRED';end if;
  if a.pdf_causal_read_permit is not null and (a.pdf_beta_get is not null or a.pdf_causal_read_permit->>'ownerRun'=owner_run::text and a.pdf_causal_read_permit->'ownerFence'=to_jsonb(fence)) then return to_jsonb(a);end if;
  proof:=jsonb_build_object('readId',gen_random_uuid(),'ackEvidenceSha256',a.pdf_beta_ack->>'evidenceSha256','ownerRun',owner_run,'ownerFence',fence);
 end if;
 if action in ('ACK','GET') then
  if a.pdf_dispatch_id is null or a.phase not in ('RUNNING','UNKNOWN') or
   not public.trip_event_keys(proof,array['uploadVersion','issuer','binding','ownerRun','ownerFence','dispatchId','observedAt','evidenceSha256',case when action='ACK' then 'response' else 'read' end]) or
   proof->'uploadVersion' is distinct from '3'::jsonb or proof->>'issuer' is distinct from 'otr-source-pdf-causal-producer/3' or
   proof->'binding' is distinct from a.pdf_binding or proof->>'ownerRun' is distinct from owner_run::text or proof->'ownerFence' is distinct from to_jsonb(fence) or
   proof->>'dispatchId' is distinct from a.pdf_dispatch_id::text or proof->>'evidenceSha256' is distinct from public.trip_source_hash('otr-source-pdf-beta-'||lower(action)||'-v3',proof-'evidenceSha256') then raise exception 'PDF_BETA_PROOF_CONFLICT';end if;
  t:=(proof->>'observedAt')::timestamptz;
  if t is null or proof->>'observedAt' is distinct from public.trip_event_utc_timestamp(t) or not isfinite(t) then raise exception 'PDF_BETA_PROOF_CONFLICT';end if;
  if action='ACK' then
   b:=proof->'response';
   if not public.trip_event_keys(b,array['status','transportComplete','upsert','body','bodySha256','bodyByteCount']) or
    b->'status' is distinct from '200'::jsonb or b->'transportComplete' is distinct from 'true'::jsonb or b->'upsert' is distinct from 'false'::jsonb or jsonb_typeof(b->'body') is distinct from 'string' or
    octet_length(b->>'body') not between 1 and 4096 or b->'bodyByteCount' is distinct from to_jsonb(octet_length(convert_to(b->>'body','UTF8'))) or
    b->>'bodySha256' is distinct from encode(extensions.digest(convert_to(b->>'body','UTF8'),'sha256'),'hex') then raise exception 'PDF_BETA_ACK_INVALID';end if;
   j:=(b->>'body')::jsonb;
   if not public.trip_event_keys(j,array['Key','Id']) or (select count(*) from json_each((b->>'body')::json))<>2 or j->>'Key' is distinct from (a.pdf_binding->>'bucket')||'/'||(a.pdf_binding->>'objectKey') or j->>'Id' is null or j->>'Id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'PDF_BETA_ACK_INVALID';end if;
  else
   if a.pdf_beta_ack is null or a.pdf_causal_read_permit is null then raise exception 'PDF_BETA_ACK_REQUIRED';end if;
   b:=proof->'read';
   if not public.trip_event_keys(b,array['readId','ackEvidenceSha256','sha256','byteCount','mimeType','cacheBypassed']) or b->>'readId' is null or b->>'readId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or b->>'readId'=a.pdf_dispatch_id::text or b->>'readId' is distinct from a.pdf_causal_read_permit->>'readId' or b->>'ackEvidenceSha256' is distinct from a.pdf_beta_ack->>'evidenceSha256' or a.pdf_causal_read_permit->>'ackEvidenceSha256' is distinct from b->>'ackEvidenceSha256' or a.pdf_causal_read_permit->>'ownerRun' is distinct from owner_run::text or a.pdf_causal_read_permit->'ownerFence' is distinct from to_jsonb(fence) or
    b->>'sha256' is distinct from a.pdf_binding->>'sha256' or b->'byteCount' is distinct from a.pdf_binding->'byteCount' or b->>'mimeType' is distinct from 'application/pdf' or b->'cacheBypassed' is distinct from 'true'::jsonb then raise exception 'PDF_BETA_GET_INVALID';end if;
  end if;
 end if;
 j:=public.trip_source_pdf_causal_execution(attempt,owner_run,fence,action,proof);
 if action='UNKNOWN' and o.phase='IO_ACTIVE' then perform public.trip_source_attempt_observe(o.id,o.operation_sha256,o.phase,o.attempt_generation,attempt,'UNKNOWN');end if;
 return j;
end$$;
create or replace function public.trip_source_pdf_beta_custody(o public.trip_source_operations) returns boolean
language sql stable security invoker set search_path=pg_catalog as $$
 select o.command='UPLOAD_ORIGINAL' and o.bound_mime_type='application/pdf' and o.io_finished_at is null and exists(
 select 1 from public.trip_source_execution_attempts a join public.trip_source_staged_resources s on s.id=a.staged_resource_id
 where a.operation_id=o.id and a.id=o.attempt_id and a.canonical_generation=o.attempt_generation and (a.profile_id='PDF_PRIVATE_UPLOAD_BETA_ACK_V2' or a.profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' and a.pdf_causal_read_permit is not null and a.pdf_beta_get->'read'->>'readId'=a.pdf_causal_read_permit->>'readId' and a.pdf_beta_get->'read'->>'ackEvidenceSha256'=a.pdf_beta_ack->>'evidenceSha256' and a.pdf_causal_read_permit->>'ackEvidenceSha256'=a.pdf_beta_ack->>'evidenceSha256')
 and a.operation_sha256=o.operation_sha256 and a.execution_principal=session_user and a.termination_outstanding and a.phase in ('RUNNING','UNKNOWN')
 and a.pdf_beta_ack is not null and a.pdf_beta_get is not null and s.pdf_sealed_at is not null and s.cleaned_at is null and s.release_authorized_at is null)
$$;
create function public.trip_source_pdf_causal_finish(actor uuid, raw text, attempt uuid, owner_run uuid, fence bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
#variable_conflict use_variable
declare q jsonb;reply jsonb;a public.trip_source_execution_attempts;o public.trip_source_operations;r public.trip_source_representations;s public.trip_sources;
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 q:=public.trip_source_command_codec(raw);
 if q->>'command'<>'UPLOAD_ORIGINAL' or q->>'actor_account_id' is distinct from actor::text then raise exception 'INVALID_SOURCE_COMMAND';end if;
 reply:=public.trip_source_operation_lookup(actor,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,(q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');
 if reply->>'outcome' is not null then return reply;end if;
 perform public.trip_source_pdf_causal_gate();
 select * into a from public.trip_source_execution_attempts where id=attempt;
 if a.operation_id is distinct from (q->>'operation_id')::uuid or a.owner_run is distinct from owner_run or a.owner_fence is distinct from fence then raise exception 'PDF_BETA_OWNER_CONFLICT';end if;
 select * into o from public.trip_source_operations where id=a.operation_id for update;
 if o.phase not in ('IO_ACTIVE','IO_UNKNOWN') or not public.trip_source_pdf_beta_custody(o) then raise exception 'PDF_BETA_CUSTODY_INCOMPLETE';end if;
 perform public.trip_source_lock_scope(actor,o.trip_id,o.source_id);
 r:=public.trip_source_assert_pins(o);
 select * into s from public.trip_sources where id=o.source_id;
 o:=public.trip_source_seal(o,s,r,null);
 update public.trip_source_operations set phase=o.phase,outcome=o.outcome,completed_at=o.completed_at,result_source_row_revision=o.result_source_row_revision,result_material_revision=o.result_material_revision,result_representation_row_revision=o.result_representation_row_revision,result_remote_state=o.result_remote_state,result_retention_state=o.result_retention_state,result_action_id=o.result_action_id,result_verified_at=o.result_verified_at,result_sha256=o.result_sha256 where id=o.id;
 return public.trip_source_operation_reply(o);
end$$;
create function public.trip_source_pdf_causal_claim(attempt uuid, expected_fence bigint, new_owner_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts;begin
 perform public.trip_source_pdf_causal_gate();
 select * into a from public.trip_source_execution_attempts where id=attempt;
 if a.profile_id is distinct from 'PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' then raise exception 'PDF_UPLOAD_PROFILE_CONFLICT';end if;
 return public.trip_source_execution_claim(attempt,expected_fence,new_owner_run);
end;
$$;
create function public.trip_source_pdf_causal_inventory(actor uuid, trip uuid, source uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
begin
 if session_user<>'otr_trip_source_command_gateway' or not public.trip_source_pdf_access(actor,trip,source) then raise exception 'NOT_VISIBLE';end if;
 return (select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('staged_resource',to_jsonb(s)) order by a.id),'[]'::jsonb) from public.trip_source_execution_attempts a join public.trip_source_staged_resources s on s.id=a.staged_resource_id join public.trip_source_operations o on o.id=a.operation_id where a.profile_id='PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3' and a.execution_principal=session_user and o.actor_account_id=actor and a.trip_id=trip and a.source_id=source and (a.phase<>'TERMINAL' or s.cleaned_at is null));
end;
$$;
grant create on schema public to otr_trip_source_writer,otr_trip_source_execution_writer;
revoke all on function public.trip_source_pdf_causal_gate() from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_gate() owner to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_causal_row_guard() from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_row_guard() owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_pdf_causal_association() from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_association() owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_pdf_causal_committed(uuid,boolean) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_committed(uuid,boolean) owner to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_causal_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb) owner to otr_trip_source_execution_writer;
grant execute on function public.trip_source_pdf_causal_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb) to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_causal_begin(uuid,text,uuid,uuid,uuid,text,uuid,uuid) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_begin(uuid,text,uuid,uuid,uuid,text,uuid,uuid) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_causal_begin(uuid,text,uuid,uuid,uuid,text,uuid,uuid) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_causal_execution(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_execution(uuid,uuid,bigint,text,jsonb) owner to otr_trip_source_execution_writer;
grant execute on function public.trip_source_pdf_causal_execution(uuid,uuid,bigint,text,jsonb) to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_causal_execute(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_execute(uuid,uuid,bigint,text,jsonb) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_causal_execute(uuid,uuid,bigint,text,jsonb) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_causal_finish(uuid,text,uuid,uuid,bigint) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_finish(uuid,text,uuid,uuid,bigint) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_causal_finish(uuid,text,uuid,uuid,bigint) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_causal_claim(uuid,bigint,uuid) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_claim(uuid,bigint,uuid) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_causal_claim(uuid,bigint,uuid) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_causal_inventory(uuid,uuid,uuid) from public,anon,authenticated,service_role,otr_trip_source_command_gateway,otr_trip_source_execution_gateway;
alter function public.trip_source_pdf_causal_inventory(uuid,uuid,uuid) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_causal_inventory(uuid,uuid,uuid) to otr_trip_source_command_gateway;
revoke create on schema public from otr_trip_source_writer,otr_trip_source_execution_writer;
commit;
