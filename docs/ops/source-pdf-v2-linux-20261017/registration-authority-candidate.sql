-- LOCAL REVIEW CANDIDATE ONLY. Not installed/applied. No gate activation.
-- Requires the existing Source tables, writer/gateway and closed PDF authority gate.
-- Preserves every /1 function; adds versioned functions using existing tables/roles.
-- The mutation guard changes only its versioned DERIVED transform case.
-- This file does NOT enable Capture PDF acquisition or enlarge upload profiles.
begin;
create function public.trip_source_pdf_v2_map_valid(b jsonb,t text) returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare p jsonb;i integer:=0;pos integer:=0;fin integer;bytes bytea;part text;
begin
 if t is null or octet_length(t) not between 1 and 262144 or jsonb_typeof(b->'pages') is distinct from 'array' or jsonb_array_length(b->'pages') not between 1 and 32 then return false;end if;
 bytes:=convert_to(t,'UTF8');
 for p in select value from jsonb_array_elements(b->'pages') loop
  if not public.trip_event_keys(p,array['pageIndex','start','end']) or p->'pageIndex' is distinct from to_jsonb(i) or p->'start' is distinct from to_jsonb(pos) or jsonb_typeof(p->'end') is distinct from 'number' then return false;end if;
  fin:=(p->>'end')::integer;
  if fin<=pos or fin>octet_length(t) then return false;end if;
  part:=convert_from(substring(bytes from pos+1 for fin-pos),'UTF8');
  if regexp_replace(part,'[[:space:]]','','g')='' then return false;end if;
  i:=i+1;pos:=fin;
  if i<jsonb_array_length(b->'pages') then
   if get_byte(bytes,pos)<>10 then return false;end if;pos:=pos+1;
  end if;
 end loop;
 return pos=octet_length(t) and b->>'pageMapSha256' is not distinct from encode(extensions.digest(convert_to(public.trip_event_canonical_json((b->'pages')::json),'UTF8'),'sha256'),'hex');
exception when others then return false;
end$$;

create function public.trip_source_pdf_v2_lookup(actor uuid,trip uuid,operation uuid,digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.trip_source_pdf_seals;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 select * into r from public.trip_source_pdf_seals where operation_id=operation;
 if not found then return null;end if;
 if r.body->'derivativeVersion' is distinct from '2'::jsonb then raise exception 'OPERATION_REUSE_MISMATCH';end if;
 if r.account_id is distinct from actor or r.trip_id is distinct from trip or not public.trip_source_pdf_access(actor,trip,r.source_id) then raise exception 'NOT_VISIBLE';end if;
 if r.request_sha256<>digest then raise exception 'OPERATION_REUSE_MISMATCH';end if;
 return jsonb_build_object('derivativeVersion',2,'operationId',operation,'sealSha256',r.seal_sha256,'body',r.body);
end$$;

create function public.trip_source_pdf_v2_context(actor uuid,trip uuid,q jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare s public.trip_sources;r public.trip_source_representations;d public.trip_source_representations;m public.trip_source_revisions;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 if not public.trip_event_keys(q,array['derivativeVersion','operationId','sourceId','sourceRevision','sourceRowRevision','originalRepresentationId','originalRowRevision','derivedRepresentationId']) or q->'derivativeVersion' is distinct from '2'::jsonb or jsonb_typeof(q->'sourceRevision') is distinct from 'number' or jsonb_typeof(q->'sourceRowRevision') is distinct from 'number' or jsonb_typeof(q->'originalRowRevision') is distinct from 'number' or coalesce((q->>'sourceRevision')::bigint,0)<1 or coalesce((q->>'sourceRowRevision')::bigint,0)<1 or coalesce((q->>'originalRowRevision')::bigint,0)<1 or (q->>'operationId')::uuid is null then raise exception 'INVALID_PDF_REQUEST';end if;
 perform public.trip_import_scope_lock(actor,trip);perform public.trip_source_lock_scope(actor,trip,(q->>'sourceId')::uuid);
 if not public.trip_source_pdf_access(actor,trip,(q->>'sourceId')::uuid) then raise exception 'NOT_VISIBLE';end if;
 if not exists(select 1 from public.trip_source_pdf_gate where enabled) then raise exception 'PDF_AUTHORITY_CLOSED';end if;
 select * into s from public.trip_sources where id=(q->>'sourceId')::uuid for update;
 select * into m from public.trip_source_revisions where source_id=s.id and material_revision=(q->>'sourceRevision')::bigint for share;
 select * into r from public.trip_source_representations where id=(q->>'originalRepresentationId')::uuid and source_id=s.id for share;
 select * into d from public.trip_source_representations where id=(q->>'derivedRepresentationId')::uuid and source_id=s.id for share;
 if s.current_material_revision<>(q->>'sourceRevision')::bigint or s.row_revision<>(q->>'sourceRowRevision')::bigint or m.source_id is null or m.retention_state<>'RETAINED' or m.original_representation_ids<>array[r.id] or r.id is null or r.row_revision<>(q->>'originalRowRevision')::bigint or r.introduced_revision>m.material_revision or r.role<>'ORIGINAL' or r.material_kind<>'BINARY' or r.mime_type<>'application/pdf' or r.remote_state<>'VERIFIED' or r.retention_state<>'RETAINED' or d.id is null or d.role<>'DERIVED' or d.material_kind<>'TEXT' or d.retention_state<>'RETAINED' or d.parent_ids<>array[r.id] or d.introduced_revision>m.material_revision then raise exception 'PDF_CONTEXT_STALE';end if;
 return jsonb_build_object('original',to_jsonb(r),'derived',to_jsonb(d));
end$$;

create function public.trip_source_pdf_v2_commit(b jsonb,digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare c jsonb;q jsonb:=b->'request';actor uuid:=(b->>'accountId')::uuid;trip uuid:=(b->>'tripId')::uuid;old jsonb;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 if not public.trip_event_keys(b,array['derivativeVersion','request','accountId','tripId','requestSha256','profileId','profileSha256','producer','originalSha256','originalByteCount','textSha256','textByteCount','transformOptionsSha256','pageMapSha256','pages']) or b->'derivativeVersion' is distinct from '2'::jsonb or actor is null or trip is null or jsonb_typeof(b->'pages') is distinct from 'array' or jsonb_array_length(b->'pages') not between 1 and 32 or coalesce((b->>'originalByteCount')::bigint,0) not between 1 and 10485760 or coalesce((b->>'textByteCount')::bigint,0) not between 1 and 262144 then raise exception 'INVALID_PDF_SEAL';end if;
 if digest is distinct from public.trip_source_hash('otr-source-pdf-seal-v2',b) then raise exception 'INVALID_PDF_SEAL';end if;
 old:=public.trip_source_pdf_v2_lookup(actor,trip,(q->>'operationId')::uuid,b->>'requestSha256');if old is not null then if old->>'sealSha256'<>digest then raise exception 'OPERATION_REUSE_MISMATCH';end if;return old;end if;
 c:=public.trip_source_pdf_v2_context(actor,trip,q);
 if not public.trip_source_pdf_v2_map_valid(b,c->'derived'->>'text_content') or b->>'profileId' is distinct from 'OTR_PDF_QPDF_POPPLER_V2' or b->>'profileSha256' is distinct from 'ca5a7b63bda8ed5c5b9018b82fbbd14c1a01f054a37b1c2ed76445152b36539c' or b->>'producer' is distinct from 'otr-source-pdf-qpdf-poppler/2' or b->>'transformOptionsSha256' is distinct from '71804d69ac7011fc3b27231d7f6942cb696edb7ced9e696c083d4ce05fdd9ee5' or c->'original'->>'payload_sha256' is distinct from b->>'originalSha256' or c->'original'->'byte_count' is distinct from b->'originalByteCount' or c->'derived'->>'payload_sha256' is distinct from b->>'textSha256' or c->'derived'->'byte_count' is distinct from b->'textByteCount' or c->'derived'->>'transform_key' is distinct from 'otr.pdf.qpdf-poppler' or c->'derived'->>'transform_version' is distinct from '2' or c->'derived'->>'transform_options_sha256' is distinct from b->>'transformOptionsSha256' or digest is distinct from public.trip_source_hash('otr-source-pdf-seal-v2',b) or b->>'requestSha256' is distinct from public.trip_source_hash('otr-source-pdf-request-v2',jsonb_build_object('accountId',actor,'tripId',trip,'request',q)) then raise exception 'INVALID_PDF_SEAL';end if;
 insert into public.trip_source_pdf_seals(operation_id,account_id,trip_id,source_id,source_revision,derived_representation_id,request_sha256,seal_sha256,body) values((q->>'operationId')::uuid,actor,trip,(q->>'sourceId')::uuid,(q->>'sourceRevision')::bigint,(q->>'derivedRepresentationId')::uuid,b->>'requestSha256',digest,b);
 return public.trip_source_pdf_v2_lookup(actor,trip,(q->>'operationId')::uuid,b->>'requestSha256');
end$$;

create function public.trip_source_pdf_v2_original_begin(actor uuid,raw text,attempt uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare q jsonb;o public.trip_source_operations;r public.trip_source_representations;reply jsonb;s public.trip_sources;begin
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
 if r.mime_type<>'application/pdf' or r.byte_count>10485760 or s.current_material_revision<>o.material_revision or s.lifecycle<>'ACTIVE' or s.retention_state<>'RETAINED' then raise exception 'PDF_CONTEXT_STALE';end if;
 if exists(select 1 from public.trip_source_operations where source_id=s.id and representation_id=r.id and id<>o.id and phase<>'FINAL') then raise exception 'SOURCE_IO_UNAVAILABLE';end if;
 perform public.trip_source_attempt_start(actor,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,o.phase,o.attempt_generation,o.attempt_id,attempt);
 return jsonb_build_object('original',to_jsonb(r));
end$$;

create function public.trip_source_pdf_v2_original_finish(actor uuid,raw text,attempt uuid,sha text,len bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare q jsonb;o public.trip_source_operations;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 perform public.trip_source_pdf_registration_gate(); q:=public.trip_source_command_codec(raw);
 if q->>'command'<>'VERIFY_REPRESENTATION' or q->>'actor_account_id'<>actor::text then raise exception 'INVALID_SOURCE_COMMAND';end if;
 select * into o from public.trip_source_operations where id=(q->>'operation_id')::uuid and actor_account_id=actor and trip_id=(q->>'trip_id')::uuid and source_id=(q->>'source_id')::uuid and operation_sha256=q->>'operation_sha256' for update;
 if o.id is null or o.bound_mime_type<>'application/pdf' or o.bound_payload_sha256 is distinct from sha or o.bound_byte_count is distinct from len then raise exception 'MATERIAL_INTEGRITY_MISMATCH';end if;
 perform public.trip_source_attempt_observe(o.id,o.operation_sha256,'IO_ACTIVE',o.attempt_generation,attempt,'DEFINITIVE_COMPLETION');
 return public.trip_source_finalize(actor,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,o.attempt_generation,attempt,jsonb_build_object('operation_id',o.id,'attempt_id',attempt,'attempt_generation',o.attempt_generation,'kind','MATCH','payload_sha256',sha,'byte_count',len,'mime_type',o.bound_mime_type,'observed_at',public.trip_event_utc_timestamp(o.admitted_at)));
end$$;

create function public.trip_source_pdf_v2_registration_lookup(actor uuid,trip uuid,operation uuid,digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.trip_source_pdf_registrations;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 select * into r from public.trip_source_pdf_registrations where operation_id=operation;
 if not found then return null;end if;
 if r.body->'derivativeVersion' is distinct from '2'::jsonb then raise exception 'OPERATION_REUSE_MISMATCH';end if;
 if r.account_id is distinct from actor or r.trip_id is distinct from trip or not public.trip_source_pdf_access(actor,trip,r.source_id) then raise exception 'NOT_VISIBLE';end if;
 if r.request_sha256<>digest then raise exception 'OPERATION_REUSE_MISMATCH';end if;
 return jsonb_build_object('derivativeVersion',2,'operationId',operation,'registrationSha256',r.registration_sha256,'body',r.body);
end$$;

create function public.trip_source_pdf_v2_registration_context(actor uuid,trip uuid,q jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare s public.trip_sources;r public.trip_source_representations;v public.trip_source_revisions;o public.trip_source_operations;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 if not public.trip_event_keys(q,array['derivativeVersion','operationId','sourceId','sourceRevision','sourceRowRevision','originalRepresentationId','originalRowRevision','derivedRepresentationId','verificationOperationId','verificationResultSha256']) or q->'derivativeVersion' is distinct from '2'::jsonb or (q->>'operationId')::uuid is null or (q->>'derivedRepresentationId')::uuid is null or q->>'verificationResultSha256' !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_PDF_REQUEST';end if;
 perform public.trip_source_pdf_registration_gate();perform public.trip_import_scope_lock(actor,trip);perform public.trip_source_lock_scope(actor,trip,(q->>'sourceId')::uuid);
 if not public.trip_source_pdf_access(actor,trip,(q->>'sourceId')::uuid) then raise exception 'NOT_VISIBLE';end if;
 select * into s from public.trip_sources where id=(q->>'sourceId')::uuid for update;
 select * into r from public.trip_source_representations where id=(q->>'originalRepresentationId')::uuid and source_id=s.id for update;
 select * into v from public.trip_source_revisions where source_id=s.id and material_revision=s.current_material_revision for share;
 select * into o from public.trip_source_operations where id=(q->>'verificationOperationId')::uuid;
 if r.id is null or v.source_id is null or o.id is null or s.current_material_revision is distinct from (q->>'sourceRevision')::bigint or s.row_revision is distinct from (q->>'sourceRowRevision')::bigint or v.retention_state<>'RETAINED' or v.original_representation_ids<>array[r.id] or r.row_revision is distinct from (q->>'originalRowRevision')::bigint or r.role<>'ORIGINAL' or r.material_kind<>'BINARY' or r.mime_type<>'application/pdf' or r.remote_state<>'VERIFIED' or r.retention_state<>'RETAINED' or r.introduced_revision>s.current_material_revision or o.command<>'VERIFY_REPRESENTATION' or o.phase<>'FINAL' or o.outcome<>'APPLIED' or o.actor_account_id<>actor or o.trip_id<>trip or o.source_id<>s.id or o.representation_id<>r.id or o.result_material_revision<>s.current_material_revision or o.result_source_row_revision<>s.row_revision or o.result_representation_row_revision<>r.row_revision or o.bound_payload_sha256 is distinct from r.payload_sha256 or o.bound_byte_count is distinct from r.byte_count or o.bound_mime_type is distinct from r.mime_type or o.result_verified_at is distinct from r.verified_at or o.result_remote_state<>'VERIFIED' or o.result_sha256 is distinct from q->>'verificationResultSha256' then raise exception 'PDF_CONTEXT_STALE';end if;
 if exists(select 1 from public.trip_source_operations where representation_id=r.id and phase<>'FINAL') then raise exception 'SOURCE_IO_UNAVAILABLE';end if;
 return to_jsonb(r);
end$$;

create function public.trip_source_pdf_v2_registration_commit(b jsonb,digest text,t text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare q jsonb:=b->'request';actor uuid:=(b->>'accountId')::uuid;trip uuid:=(b->>'tripId')::uuid;r jsonb;prior jsonb;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 if not public.trip_event_keys(b,array['derivativeVersion','request','accountId','tripId','requestSha256','profileId','profileSha256','producer','originalSha256','originalByteCount','textSha256','textByteCount','transformOptionsSha256','pageMapSha256','pages']) or b->'derivativeVersion' is distinct from '2'::jsonb or digest is distinct from public.trip_source_hash('otr-source-pdf-registration-v2',b) or b->>'requestSha256' is distinct from public.trip_source_hash('otr-source-pdf-registration-request-v2',jsonb_build_object('accountId',actor,'tripId',trip,'request',q)) then raise exception 'INVALID_PDF_REGISTRATION';end if;
 prior:=public.trip_source_pdf_v2_registration_lookup(actor,trip,(q->>'operationId')::uuid,b->>'requestSha256');
 if prior is not null then if prior->>'registrationSha256'<>digest then raise exception 'OPERATION_REUSE_MISMATCH';end if;return prior;end if;
 r:=public.trip_source_pdf_v2_registration_context(actor,trip,q);
 if not public.trip_source_pdf_v2_map_valid(b,t) or b->>'profileId' is distinct from 'OTR_PDF_QPDF_POPPLER_V2' or b->>'profileSha256' is distinct from 'ca5a7b63bda8ed5c5b9018b82fbbd14c1a01f054a37b1c2ed76445152b36539c' or b->>'producer' is distinct from 'otr-source-pdf-qpdf-poppler/2' or b->>'transformOptionsSha256' is distinct from '71804d69ac7011fc3b27231d7f6942cb696edb7ced9e696c083d4ce05fdd9ee5' or r->>'payload_sha256' is distinct from b->>'originalSha256' or r->'byte_count' is distinct from b->'originalByteCount' or coalesce((b->>'originalByteCount')::bigint,0) not between 1 and 10485760 or b->>'textSha256' is distinct from encode(extensions.digest(convert_to(t,'UTF8'),'sha256'),'hex') or b->'textByteCount' is distinct from to_jsonb(octet_length(t)) or octet_length(t) not between 1 and 262144 then raise exception 'INVALID_PDF_REGISTRATION';end if;
 insert into public.trip_source_pdf_registrations(operation_id,account_id,trip_id,source_id,derived_representation_id,request_sha256,registration_sha256,body) values((q->>'operationId')::uuid,actor,trip,(q->>'sourceId')::uuid,(q->>'derivedRepresentationId')::uuid,b->>'requestSha256',digest,b);
 insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,parent_ids,transform_key,transform_version,transform_options_sha256,regenerability,created_at,remote_state) values((q->>'derivedRepresentationId')::uuid,1,(q->>'sourceId')::uuid,(q->>'sourceRevision')::bigint,'DERIVED','TEXT','UTF-8',b->>'textSha256',(b->>'textByteCount')::bigint,t,array[(q->>'originalRepresentationId')::uuid],'otr.pdf.qpdf-poppler','2',b->>'transformOptionsSha256','POSSIBLE',clock_timestamp(),'NOT_APPLICABLE');
 return public.trip_source_pdf_v2_registration_lookup(actor,trip,(q->>'operationId')::uuid,b->>'requestSha256');
end$$;

create or replace function public.guard_trip_source_mutation() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$declare b jsonb;begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' or tg_table_name<>'trip_source_representations' or tg_op not in ('INSERT','UPDATE') then raise exception 'TRIP_SOURCE_COMMANDS_DISABLED' using errcode='42501';end if;
 perform public.trip_source_pdf_registration_gate();
 if tg_level='STATEMENT' then return null;end if;
 if tg_op='UPDATE' then
  if old.role<>'ORIGINAL' or old.material_kind<>'BINARY' or old.mime_type<>'application/pdf' or old.remote_state<>'PENDING' or new.remote_state<>'VERIFIED' or new.row_revision<>old.row_revision+1 or new.verified_at is null or (to_jsonb(old)-array['row_revision','remote_state','verified_at']) is distinct from (to_jsonb(new)-array['row_revision','remote_state','verified_at']) or not exists(select 1 from public.trip_source_operations o join public.trip_sources s on s.id=o.source_id where o.representation_id=old.id and o.source_id=old.source_id and o.command='VERIFY_REPRESENTATION' and o.phase='IO_QUIESCENT' and o.worker_identity=session_user and o.expected_representation_row_revision=old.row_revision and o.bound_payload_sha256=old.payload_sha256 and o.bound_byte_count=old.byte_count and o.expected_source_row_revision=s.row_revision and o.material_revision=s.current_material_revision and o.actor_account_id=s.acquired_by) then raise exception 'PDF_MUTATION_DENIED';end if;
 else
  select body into b from public.trip_source_pdf_registrations where derived_representation_id=new.id and source_id=new.source_id;
  if b is null or new.role<>'DERIVED' or new.material_kind<>'TEXT' or new.row_revision<>1 or new.introduced_revision<>(b->'request'->>'sourceRevision')::bigint or new.parent_ids<>array[(b->'request'->>'originalRepresentationId')::uuid] or new.payload_sha256<>b->>'textSha256' or new.byte_count<>(b->>'textByteCount')::bigint or (case when b->'derivativeVersion'='2'::jsonb then new.transform_key<>'otr.pdf.qpdf-poppler' or new.transform_version<>'2' or b->>'profileSha256'<>'ca5a7b63bda8ed5c5b9018b82fbbd14c1a01f054a37b1c2ed76445152b36539c' or b->>'producer'<>'otr-source-pdf-qpdf-poppler/2' else new.transform_key<>'otr.pdf.literal-text' or new.transform_version<>'1' end) or new.transform_options_sha256<>b->>'transformOptionsSha256' or new.regenerability<>'POSSIBLE' then raise exception 'PDF_MUTATION_DENIED';end if;
 end if;
 return new;
end$$;
grant create on schema public to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_v2_lookup(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_lookup(uuid,uuid,uuid,text) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_v2_lookup(uuid,uuid,uuid,text) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_v2_context(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_context(uuid,uuid,jsonb) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_v2_context(uuid,uuid,jsonb) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_v2_commit(jsonb,text) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_commit(jsonb,text) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_v2_commit(jsonb,text) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_v2_map_valid(jsonb,text) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_map_valid(jsonb,text) owner to otr_trip_source_writer;
revoke all on function public.trip_source_pdf_v2_original_begin(uuid,text,uuid) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_original_begin(uuid,text,uuid) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_v2_original_begin(uuid,text,uuid) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_v2_original_finish(uuid,text,uuid,text,bigint) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_original_finish(uuid,text,uuid,text,bigint) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_v2_original_finish(uuid,text,uuid,text,bigint) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_v2_registration_lookup(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_registration_lookup(uuid,uuid,uuid,text) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_v2_registration_lookup(uuid,uuid,uuid,text) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_v2_registration_context(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_registration_context(uuid,uuid,jsonb) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_v2_registration_context(uuid,uuid,jsonb) to otr_trip_source_command_gateway;
revoke all on function public.trip_source_pdf_v2_registration_commit(jsonb,text,text) from public,anon,authenticated,service_role;
alter function public.trip_source_pdf_v2_registration_commit(jsonb,text,text) owner to otr_trip_source_writer;
grant execute on function public.trip_source_pdf_v2_registration_commit(jsonb,text,text) to otr_trip_source_command_gateway;
revoke create on schema public from otr_trip_source_writer;
commit;
