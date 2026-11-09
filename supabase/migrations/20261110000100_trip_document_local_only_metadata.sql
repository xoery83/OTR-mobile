begin;
set local search_path=pg_catalog;

-- LOCAL_ONLY is a document record; it does not authorize custody or any file transfer.
alter table public.trip_operational_documents
 drop constraint trip_operational_documents_custody_check,
 alter column custody_receipt_id drop not null,
 add constraint trip_operational_documents_custody_check check (
  custody in ('PRIVATE_SOURCE_REFERENCE','AUTHORIZED_COPY','LOCAL_ONLY')
  and (custody='LOCAL_ONLY')=(custody_receipt_id is null)
  and (custody<>'LOCAL_ONLY' or
   (source_representation_id is null and storage_object_key is null and
    ticket_face_index is null and qr_region is null))
 );

create or replace function public.trip_document_bind_private_custody()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare proof public.trip_operational_document_custody%rowtype;
begin
 if tg_op='UPDATE' and (new.id,new.trip_id,new.owner_account_id,new.media_type,new.byte_size,new.sha256,new.custody,new.source_representation_id,new.storage_object_key,new.content_version,new.custody_receipt_id) is distinct from
  (old.id,old.trip_id,old.owner_account_id,old.media_type,old.byte_size,old.sha256,old.custody,old.source_representation_id,old.storage_object_key,old.content_version,old.custody_receipt_id) then raise exception 'DOCUMENT_ORIGINAL_IMMUTABLE' using errcode='42501'; end if;
 if tg_op='UPDATE' then return new; end if;
 if new.custody='LOCAL_ONLY' then
  if current_user<>'otr_trip_core_v2_writer'
   or current_setting('otr.core.command',true) is distinct from 'CREATE_DOCUMENT_METADATA'
   or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
   or new.owner_account_id::text is distinct from current_setting('otr.core.actor',true)
   or new.trip_id::text is distinct from current_setting('otr.core.trip',true)
   or new.id::text is distinct from current_setting('otr.core.target_item',true)
   or new.visibility<>'PRIVATE'
  then raise exception 'DOCUMENT_METADATA_SCOPE_REQUIRED' using errcode='42501';end if;
  return new;
 end if;
 select * into proof from public.trip_operational_document_custody where id=new.custody_receipt_id and trip_id=new.trip_id for update;
 if not found or proof.state<>'VERIFIED' or new.custody<>'PRIVATE_SOURCE_REFERENCE' or new.visibility<>'PRIVATE' or new.storage_object_key is not null or
  (proof.document_id,proof.actor_account_id,proof.source_representation_id,proof.sha256,proof.byte_size,proof.media_type) is distinct from
  (new.id,new.owner_account_id,new.source_representation_id,new.sha256,new.byte_size,new.media_type) then raise exception 'DOCUMENT_CUSTODY_PROOF_REQUIRED' using errcode='42501'; end if;
 update public.trip_operational_document_custody set state='BOUND',bound_at=clock_timestamp() where id=proof.id;
 return new;
end $$;
commit;
