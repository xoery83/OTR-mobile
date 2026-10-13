begin;
-- W0 custody registry: private-reference producer only. Copy grants remain unavailable.
create table public.trip_operational_document_custody (
 id uuid primary key,
 document_id uuid not null,
 trip_id uuid not null references public.trips(id) on delete restrict,
 actor_account_id uuid not null references public.profiles(id) on delete restrict,
 source_representation_id uuid not null references public.trip_source_representations(id) on delete restrict,
 custody text not null check(custody in ('PRIVATE_SOURCE_REFERENCE','AUTHORIZED_COPY')),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 byte_size bigint not null check(byte_size between 1 and 10485760),
 media_type text not null check(media_type in ('application/pdf','image/jpeg','image/png','text/plain')),
 storage_object_key text check(char_length(storage_object_key) between 1 and 1024),
 state text not null check(state in ('STAGED','VERIFIED','BOUND','REVOKED')),
 explicit_copy_grant_receipt_id uuid,
 created_at timestamptz(6) not null default clock_timestamp(),
 verified_at timestamptz(6),
 bound_at timestamptz(6),
 unique(trip_id,id),
 check(isfinite(created_at) and (verified_at is null or isfinite(verified_at)) and (bound_at is null or isfinite(bound_at))),
 check((state='STAGED' and verified_at is null and bound_at is null) or
       (state='VERIFIED' and verified_at is not null and bound_at is null) or
       (state='BOUND' and verified_at is not null and bound_at is not null) or state='REVOKED'),
 check(custody='PRIVATE_SOURCE_REFERENCE' and storage_object_key is null and explicit_copy_grant_receipt_id is null or
       custody='AUTHORIZED_COPY' and storage_object_key is not null and explicit_copy_grant_receipt_id is not null)
);
create unique index trip_document_current_custody on public.trip_operational_document_custody(document_id) where state in ('VERIFIED','BOUND');
alter table public.trip_operational_document_custody enable row level security;
revoke all on public.trip_operational_document_custody from public,anon,authenticated,service_role,otr_trip_core_v2_gateway;
grant select,insert,update on public.trip_operational_document_custody to otr_trip_core_v2_writer;
create policy core_private_custody_writer on public.trip_operational_document_custody to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_private_custody_gate before insert or update or delete on public.trip_operational_document_custody for each row execute function public.trip_core_guard_write();

create function public.trip_document_private_custody_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare source record;
begin
 if session_user<>'otr_trip_core_v2_gateway' or new.actor_account_id is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or new.trip_id is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CUSTODY_SCOPE_MISMATCH' using errcode='42501'; end if;
 if tg_op='DELETE' then raise exception 'CUSTODY_DELETE_FORBIDDEN' using errcode='42501'; end if;
 if tg_op='UPDATE' and (to_jsonb(new)-array['state','bound_at']) is distinct from (to_jsonb(old)-array['state','bound_at']) then
  raise exception 'CUSTODY_IDENTITY_IMMUTABLE' using errcode='42501';
 end if;
 if tg_op='UPDATE' and not(old.state='VERIFIED' and new.state='BOUND' or old.state in ('VERIFIED','BOUND') and new.state='REVOKED') then
  raise exception 'CUSTODY_TRANSITION_FORBIDDEN' using errcode='42501';
 end if;
 if new.custody<>'PRIVATE_SOURCE_REFERENCE' then raise exception 'COPY_GRANT_UNAVAILABLE' using errcode='42501'; end if;
 if new.state='REVOKED' then return new; end if;
 select s.trip_id,s.acquired_by,s.lifecycle,s.retention_state,r.role,r.material_kind,r.payload_sha256,r.byte_count,r.mime_type,r.retention_state as representation_retention,r.remote_state
 into source from public.trip_source_representations r join public.trip_sources s on s.id=r.source_id where r.id=new.source_representation_id for share of s,r;
 if not found or source.trip_id<>new.trip_id or source.acquired_by<>new.actor_account_id or source.lifecycle<>'ACTIVE' or source.retention_state<>'RETAINED' or source.role<>'ORIGINAL' or source.representation_retention<>'RETAINED' or source.payload_sha256<>new.sha256 or source.byte_count<>new.byte_size or
  not(source.material_kind='BINARY' and source.remote_state='VERIFIED' and source.mime_type=new.media_type or source.material_kind='TEXT' and source.remote_state='NOT_APPLICABLE' and new.media_type='text/plain') then
  raise exception 'CURRENT_SOURCE_CUSTODY_UNAVAILABLE' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.trip_document_private_custody_guard() from public,anon,authenticated,service_role,otr_trip_core_v2_gateway;
grant execute on function public.trip_document_private_custody_guard() to otr_trip_core_v2_writer;
create trigger private_custody_identity before insert or update or delete on public.trip_operational_document_custody for each row execute function public.trip_document_private_custody_guard();

-- No legacy UUID is converted into custody evidence. Existing populated deployments
-- must explicitly resolve prior Documents before installing this forward constraint.
alter table public.trip_operational_documents add constraint document_owning_custody_fk foreign key(trip_id,custody_receipt_id) references public.trip_operational_document_custody(trip_id,id) on delete restrict deferrable initially deferred;
create function public.trip_document_bind_private_custody()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare proof public.trip_operational_document_custody%rowtype;
begin
 if tg_op='UPDATE' and (new.id,new.trip_id,new.owner_account_id,new.media_type,new.byte_size,new.sha256,new.custody,new.source_representation_id,new.storage_object_key,new.content_version,new.custody_receipt_id) is distinct from
  (old.id,old.trip_id,old.owner_account_id,old.media_type,old.byte_size,old.sha256,old.custody,old.source_representation_id,old.storage_object_key,old.content_version,old.custody_receipt_id) then raise exception 'DOCUMENT_ORIGINAL_IMMUTABLE' using errcode='42501'; end if;
 if tg_op='UPDATE' then return new; end if;
 select * into proof from public.trip_operational_document_custody where id=new.custody_receipt_id and trip_id=new.trip_id for update;
 if not found or proof.state<>'VERIFIED' or new.custody<>'PRIVATE_SOURCE_REFERENCE' or new.visibility<>'PRIVATE' or new.storage_object_key is not null or
  (proof.document_id,proof.actor_account_id,proof.source_representation_id,proof.sha256,proof.byte_size,proof.media_type) is distinct from
  (new.id,new.owner_account_id,new.source_representation_id,new.sha256,new.byte_size,new.media_type) then raise exception 'DOCUMENT_CUSTODY_PROOF_REQUIRED' using errcode='42501'; end if;
 update public.trip_operational_document_custody set state='BOUND',bound_at=clock_timestamp() where id=proof.id;
 return new;
end $$;
revoke all on function public.trip_document_bind_private_custody() from public,anon,authenticated,service_role,otr_trip_core_v2_gateway;
grant execute on function public.trip_document_bind_private_custody() to otr_trip_core_v2_writer;
create trigger document_bind_private_custody before insert or update on public.trip_operational_documents for each row execute function public.trip_document_bind_private_custody();
commit;
