-- Source candidate for existing sustained Core ownership. Existing command and
-- object ACLs remain in force. No role grant, new authority or historical write.
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';

create function pg_temp.otr_v3_core_edit(target regprocedure, needle text, replacement text)
returns void language plpgsql as $edit$
declare body text; definition text;
begin
 select prosrc,pg_get_functiondef(oid) into strict body,definition from pg_proc where oid=target;
 if length(body)-length(replace(body,needle,''))<>length(needle)
 then raise exception 'V3_CORE_PREIMAGE_DRIFT: %',target;end if;
 execute replace(definition,body,replace(body,needle,replacement));
end
$edit$;

do $patch$
declare
 cap regprocedure:='public.trip_sustained_core_capabilities(uuid,uuid)';
 write_guard regprocedure:='public.trip_core_guard_write()';
 read_guard regprocedure:='public.trip_core_finite_read_state_guard()';
 old text;
begin
 select substring(prosrc from 'RETURN QUERY SELECT true,(ARRAY\[[^\]]+\]::text\[\])')
   into strict old from pg_proc where oid=cap;
 if old is null then raise exception 'V3_CORE_CAPABILITY_PREIMAGE';end if;
 perform pg_temp.otr_v3_core_edit(cap,'RETURN QUERY SELECT true,'||old,
  'RETURN QUERY SELECT true,'||old||' || ARRAY[''CREATE_DOCUMENT_METADATA'',''RECONCILE_ITEM_DOCUMENTS'']::text[]');

 old:=$old$  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;$old$;
 perform pg_temp.otr_v3_core_edit(write_guard,old,old||$new$
  if current_setting('otr.core.command',true) in ('CREATE_DOCUMENT_METADATA','RECONCILE_ITEM_DOCUMENTS') then
   if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'
    or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
    or nullif(current_setting('otr.core.operation',true),'') is null
    or nullif(current_setting('otr.core.target_item',true),'') is null
    or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
    or not coalesce(public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE'),false)
    or not coalesce(public.trip_core_actor_has_trip(actor,trip),false)
   then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
   if tg_table_name='trip_core_command_receipts' and tg_op='INSERT'
      and new_json->>'actor_account_id'=actor::text
      and new_json->>'operation_id'=current_setting('otr.core.operation',true)
      and new_json->'body'->>'command'=current_setting('otr.core.command',true)
   then return new;end if;
   if current_setting('otr.core.command',true)='CREATE_DOCUMENT_METADATA' then
    if tg_table_name='trip_operational_documents' and tg_op='INSERT'
       and new_json->>'id'=current_setting('otr.core.target_item',true)
       and new_json->>'owner_account_id'=actor::text
       and new_json->>'custody'='LOCAL_ONLY' and new_json->>'visibility'='PRIVATE'
    then return new;end if;
   else
    if tg_table_name='itinerary_events' and tg_op='UPDATE'
       and new_json->>'id'=current_setting('otr.core.target_item',true)
       and old_json->>'owner_account_id'=actor::text
       and old_json->>'business_contract_version'='2'
       and new_json-array['semantic_revision','updated_at']=old_json-array['semantic_revision','updated_at']
       and (new_json->>'semantic_revision')::bigint=(old_json->>'semantic_revision')::bigint+1
    then return new;end if;
    if tg_table_name='trip_item_document_links' and tg_op in ('INSERT','UPDATE')
       and new_json->>'item_id'=current_setting('otr.core.target_item',true)
       and new_json->>'linked_by'=actor::text
       and (tg_op='INSERT' or new_json-'active'=old_json-'active')
       and exists(select 1 from public.itinerary_events i where i.trip_id=trip and i.id=(new_json->>'item_id')::uuid
           and i.owner_account_id=actor and i.business_contract_version=2)
       and exists(select 1 from public.trip_operational_documents d where d.trip_id=trip
           and d.id=(new_json->>'document_id')::uuid and d.owner_account_id=actor
           and d.custody='LOCAL_ONLY' and d.visibility='PRIVATE')
    then return new;end if;
   end if;
   raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';
  end if;$new$);

 old:=$old$  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;$old$;
 perform pg_temp.otr_v3_core_edit(read_guard,old,old||$new$
  if current_setting('otr.core.command',true) in ('CREATE_DOCUMENT_METADATA','RECONCILE_ITEM_DOCUMENTS') then
   if current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway'
    or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
    or tg_op not in ('INSERT','UPDATE')
    or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
    or not coalesce(public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE'),false)
    or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
    or tg_op='UPDATE' and (new.epoch is distinct from old.epoch
      or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1)
   then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
   return new;
  end if;$new$);
end
$patch$;
drop function pg_temp.otr_v3_core_edit(regprocedure,text,text);
commit;
