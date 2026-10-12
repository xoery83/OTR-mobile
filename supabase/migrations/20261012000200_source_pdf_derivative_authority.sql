-- Additive Source-only seal satellite; original/derived custody registration stays Source-owned.
begin;
create table public.trip_source_pdf_gate(singleton boolean primary key default true check(singleton),enabled boolean not null default false check(not enabled));
insert into public.trip_source_pdf_gate values(true,false);
revoke all on public.trip_source_pdf_gate from public,anon,authenticated,service_role;
alter table public.trip_source_pdf_gate enable row level security;
alter table public.trip_source_pdf_gate force row level security;
create table public.trip_source_pdf_seals(
 operation_id uuid primary key,account_id uuid not null,trip_id uuid not null references public.trips,
 source_id uuid not null references public.trip_sources,source_revision bigint not null check(source_revision>0),
 derived_representation_id uuid not null references public.trip_source_representations,
 request_sha256 text not null check(request_sha256~'^[0-9a-f]{64}$'),
 seal_sha256 text not null check(seal_sha256~'^[0-9a-f]{64}$'),body jsonb not null check(octet_length(body::text)<=16384),
 created_at timestamptz not null default clock_timestamp(),unique(derived_representation_id,seal_sha256)
);
create unique index source_pdf_one_epoch_seal on public.trip_source_pdf_seals(source_id,source_revision,derived_representation_id,((body->'request'->>'sourceRowRevision')::bigint),((body->'request'->>'originalRowRevision')::bigint));
alter table public.trip_source_pdf_seals enable row level security;
alter table public.trip_source_pdf_seals force row level security;
revoke all on public.trip_source_pdf_seals from public,anon,authenticated,service_role,otr_trip_source_command_gateway;
create function public.trip_source_pdf_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception 'PDF_SEAL_IMMUTABLE';end$$;
create trigger source_pdf_immutable before update or delete or truncate on public.trip_source_pdf_seals for each statement execute function public.trip_source_pdf_immutable();
create function public.trip_source_pdf_access(actor uuid,trip uuid,source uuid) returns boolean language sql security definer set search_path=pg_catalog as $$
 select public.trip_source_admission(actor,trip,false) and exists(select 1 from public.trip_sources where id=source and trip_id=trip and acquired_by=actor and lifecycle='ACTIVE' and retention_state='RETAINED');
$$;
create function public.trip_source_pdf_lookup(actor uuid,trip uuid,operation uuid,digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.trip_source_pdf_seals;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 select * into r from public.trip_source_pdf_seals where operation_id=operation;
 if not found then return null;end if;
 if r.account_id is distinct from actor or r.trip_id is distinct from trip or not public.trip_source_pdf_access(actor,trip,r.source_id) then raise exception 'NOT_VISIBLE';end if;
 if r.request_sha256<>digest then raise exception 'OPERATION_REUSE_MISMATCH';end if;
 return jsonb_build_object('derivativeVersion',1,'operationId',operation,'sealSha256',r.seal_sha256,'body',r.body);
end$$;
create function public.trip_source_pdf_context(actor uuid,trip uuid,q jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare s public.trip_sources;r public.trip_source_representations;d public.trip_source_representations;m public.trip_source_revisions;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 if not public.trip_event_keys(q,array['derivativeVersion','operationId','sourceId','sourceRevision','sourceRowRevision','originalRepresentationId','originalRowRevision','derivedRepresentationId']) or q->'derivativeVersion' is distinct from '1'::jsonb or jsonb_typeof(q->'sourceRevision') is distinct from 'number' or jsonb_typeof(q->'sourceRowRevision') is distinct from 'number' or jsonb_typeof(q->'originalRowRevision') is distinct from 'number' or coalesce((q->>'sourceRevision')::bigint,0)<1 or coalesce((q->>'sourceRowRevision')::bigint,0)<1 or coalesce((q->>'originalRowRevision')::bigint,0)<1 or (q->>'operationId')::uuid is null then raise exception 'INVALID_PDF_REQUEST';end if;
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
create function public.trip_source_pdf_map_valid(b jsonb,t text) returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare lines text[]:=string_to_array(t,E'\n');p jsonb;i integer:=0;pos integer:=0;line text;
begin
 if t is null or cardinality(lines) not between 1 and 32 or jsonb_typeof(b->'pages') is distinct from 'array' or jsonb_array_length(b->'pages')<>cardinality(lines) then return false;end if;
 foreach line in array lines loop
  p:=b->'pages'->i;
  if not public.trip_event_keys(p,array['pageIndex','start','end']) or line !~ '^[ -~]{1,70}$' or btrim(line)='' or p is distinct from jsonb_build_object('pageIndex',i,'start',pos,'end',pos+octet_length(line)) then return false;end if;
  pos:=pos+octet_length(line)+1;i:=i+1;
 end loop;
 return b->>'pageMapSha256' is not distinct from encode(extensions.digest(convert_to(public.trip_event_canonical_json((b->'pages')::json),'UTF8'),'sha256'),'hex');
end$$;
create function public.trip_source_pdf_commit(b jsonb,digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare c jsonb;q jsonb:=b->'request';actor uuid:=(b->>'accountId')::uuid;trip uuid:=(b->>'tripId')::uuid;old jsonb;begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'PDF_PRINCIPAL_DENIED';end if;
 if not public.trip_event_keys(b,array['derivativeVersion','request','accountId','tripId','requestSha256','profileId','profileSha256','producer','originalSha256','originalByteCount','textSha256','textByteCount','transformOptionsSha256','pageMapSha256','pages']) or b->'derivativeVersion' is distinct from '1'::jsonb or actor is null or trip is null or jsonb_typeof(b->'pages') is distinct from 'array' or jsonb_array_length(b->'pages') not between 1 and 32 or coalesce((b->>'originalByteCount')::bigint,0) not between 1 and 65536 or coalesce((b->>'textByteCount')::bigint,0) not between 1 and 2300 then raise exception 'INVALID_PDF_SEAL';end if;
 if digest is distinct from public.trip_source_hash('otr-source-pdf-seal-v1',b) then raise exception 'INVALID_PDF_SEAL';end if;
 old:=public.trip_source_pdf_lookup(actor,trip,(q->>'operationId')::uuid,b->>'requestSha256');if old is not null then if old->>'sealSha256'<>digest then raise exception 'OPERATION_REUSE_MISMATCH';end if;return old;end if;
 c:=public.trip_source_pdf_context(actor,trip,q);
 if not public.trip_source_pdf_map_valid(b,c->'derived'->>'text_content') or b->>'profileId' is distinct from 'OTR_PDF_LITERAL_TEXT_V1' or b->>'profileSha256' is distinct from 'dbd7dcc780685a57f16175a85d7161b87730874577ea1992490623508575d338' or b->>'producer' is distinct from 'otr-source-pdf-verifier/1' or b->>'transformOptionsSha256' is distinct from '618d1115d203c2d2112beb1ad185374480e2a60a4ab9682b4a985c3aec34a9b1' or c->'original'->>'payload_sha256' is distinct from b->>'originalSha256' or c->'original'->'byte_count' is distinct from b->'originalByteCount' or c->'derived'->>'payload_sha256' is distinct from b->>'textSha256' or c->'derived'->'byte_count' is distinct from b->'textByteCount' or c->'derived'->>'transform_key' is distinct from 'otr.pdf.literal-text' or c->'derived'->>'transform_version' is distinct from '1' or c->'derived'->>'transform_options_sha256' is distinct from b->>'transformOptionsSha256' or digest is distinct from public.trip_source_hash('otr-source-pdf-seal-v1',b) or b->>'requestSha256' is distinct from public.trip_source_hash('otr-source-pdf-request-v1',jsonb_build_object('accountId',actor,'tripId',trip,'request',q)) then raise exception 'INVALID_PDF_SEAL';end if;
 insert into public.trip_source_pdf_seals(operation_id,account_id,trip_id,source_id,source_revision,derived_representation_id,request_sha256,seal_sha256,body) values((q->>'operationId')::uuid,actor,trip,(q->>'sourceId')::uuid,(q->>'sourceRevision')::bigint,(q->>'derivedRepresentationId')::uuid,b->>'requestSha256',digest,b);
 return public.trip_source_pdf_lookup(actor,trip,(q->>'operationId')::uuid,b->>'requestSha256');
end$$;
revoke all on function public.trip_source_pdf_map_valid(jsonb,text),public.trip_source_pdf_immutable(),public.trip_source_pdf_access(uuid,uuid,uuid),public.trip_source_pdf_lookup(uuid,uuid,uuid,text),public.trip_source_pdf_context(uuid,uuid,jsonb),public.trip_source_pdf_commit(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_pdf_lookup(uuid,uuid,uuid,text),public.trip_source_pdf_context(uuid,uuid,jsonb),public.trip_source_pdf_commit(jsonb,text) to otr_trip_source_command_gateway;
grant select on public.trip_source_pdf_seals,public.trip_source_pdf_gate to otr_trip_core_v2_writer;
create policy core_pdf_seal_read on public.trip_source_pdf_seals for select to otr_trip_core_v2_writer using(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and public.trip_core_source_readable(source_id));
create policy core_pdf_gate_read on public.trip_source_pdf_gate for select to otr_trip_core_v2_writer using(true);
commit;
