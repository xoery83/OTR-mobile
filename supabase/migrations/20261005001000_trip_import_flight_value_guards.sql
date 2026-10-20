begin;
set local search_path=pg_catalog;
-- Bind server-observed immutable representation transform descriptors as well
-- as exact selected Input pins. Local timestamps never enter this digest.
create function public.trip_import_run_input_hash(inputs jsonb)
returns text language plpgsql stable security invoker set search_path=pg_catalog
as $$declare descriptors jsonb;begin
 select jsonb_agg(jsonb_build_array(i->'id',i->'source_id',i->'material_revision',i->'representation_id',i->'payload_sha256',i->'byte_count',i->'observed_source_row_revision',i->'historical_selection',r.introduced_revision,r.role,r.material_kind,r.transform_key,r.transform_version,r.transform_options_sha256,to_jsonb(r.parent_ids)) order by i->>'source_id' collate "C",(i->>'material_revision')::bigint,i->>'representation_id' collate "C",i->>'id' collate "C") into descriptors from jsonb_array_elements(inputs) i join public.trip_source_representations r on r.id=(i->>'representation_id')::uuid and r.source_id=(i->>'source_id')::uuid;
 if jsonb_array_length(inputs) is distinct from jsonb_array_length(descriptors) then raise exception 'INVALID_IMPORT_INPUT';end if;
 return public.trip_source_hash('otr-source-run-input-v1',jsonb_build_array(1,descriptors));
end $$;
revoke all on function public.trip_import_run_input_hash(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.trip_import_run_input_hash(jsonb) to otr_trip_source_writer;
-- Finite occurrence grammar also governs parked proposals and reviewed values.
-- Unsupported passenger/booking values never enter protected C JSON catalogs.
create function public.trip_import_field_key_valid(k text)
returns boolean language sql immutable security invoker set search_path=pg_catalog
as $$select k ~ '^(transport_subtype|title|origin|destination|services|ROOT\.title|(ORIGIN|DESTINATION)\.(local_date|local_time|zone_id|supplied_offset_seconds|source_instant|authored_label|authored_text|accepted_place_id)|SERVICE\.[A-Za-z0-9._:-]{1,32}\.(operator_namespace|operator_issuer|operator_value|operator_literal|service_number|service_literal|attribution|codeshare_operating_key))$' and char_length(k)<=128$$;
create function public.trip_import_value_valid(k text,v jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$declare endpoint jsonb; t jsonb; l jsonb; item record; leaf text;
begin
 if not public.trip_import_field_key_valid(k) then return false;end if;
 if k='transport_subtype' then return v='"FLIGHT"'::jsonb;end if;
 if k in ('title','ROOT.title') then return jsonb_typeof(v)='string' and char_length(v#>>'{}') between 1 and 200 and btrim(v#>>'{}')<>'';end if;
 if k='services' then return public.trip_flight_services_valid(v);end if;
 if k in ('origin','destination') then
  if not public.trip_event_keys(v,array['time','location']) then return false;end if;t:=v->'time';l:=v->'location';
  if not public.trip_event_keys(t,array['local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','fold_choice']) or not public.trip_event_keys(l,array['authored_label','authored_text','accepted_place_id']) then return false;end if;
  if (t->'local_time'='null'::jsonb) is distinct from (t->'clock_precision'='null'::jsonb) or (t->'source_instant'='null'::jsonb) is distinct from (t->'source_instant_precision'='null'::jsonb) then return false;end if;
  if t->>'quality' not in ('UNKNOWN','EXACT','ESTIMATED') or t->>'basis' not in ('SOURCE_INSTANT','DERIVED_CIVIL') or t->'fold_choice'<>'null'::jsonb then return false;end if;
  for item in select key,value from jsonb_each(t) where key not in ('quality','basis','fold_choice') loop
   if item.key in ('clock_precision','source_instant_precision') then
    if item.value<>'null'::jsonb and (jsonb_typeof(item.value)<>'number' or (item.value#>>'{}')::bigint not between -1 and 6) then return false;end if;
   elsif not public.trip_import_value_valid(case when k='origin' then 'ORIGIN.' else 'DESTINATION.' end||item.key,case when item.key in ('local_time','source_instant') then jsonb_build_object('value',item.value,'precision',t->case item.key when 'local_time' then 'clock_precision' else 'source_instant_precision' end) else item.value end) then return false;end if;
  end loop;
  for item in select key,value from jsonb_each(l) loop if not public.trip_import_value_valid(case when k='origin' then 'ORIGIN.' else 'DESTINATION.' end||item.key,item.value) then return false;end if;end loop;return true;
 end if;
 leaf:=split_part(k,'.',case when k like 'SERVICE.%' then 3 else 2 end);
 if leaf in ('local_time','source_instant') then
  if not public.trip_event_keys(v,array['value','precision']) or (v->'value'='null'::jsonb) is distinct from (v->'precision'='null'::jsonb) then return false;end if;
  if v->'value'='null'::jsonb then return true;end if;
  if jsonb_typeof(v->'value')<>'string' or jsonb_typeof(v->'precision')<>'number' or (v->>'precision')::bigint not between -1 and 6 then return false;end if;
  if leaf='local_time' and char_length(v->>'value')<>(case (v->>'precision')::integer when -1 then 5 when 0 then 8 else 9+(v->>'precision')::integer end) then return false;end if;
  if leaf='source_instant' and (char_length(v->>'value')<>(case when (v->>'precision')::integer<=0 then 20 else 21+(v->>'precision')::integer end) or (v->>'precision')::integer=-1 and substring(v->>'value' from 18 for 2)<>'00') then return false;end if;
  if leaf='source_instant' and to_char((v->>'value')::timestamptz at time zone 'UTC','YYYY-MM-DD')<>substring(v->>'value' from 1 for 10) then return false;end if;
  return case leaf when 'local_time' then v->>'value' ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$' else v->>'value' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$' end;
 end if;
 if v='null'::jsonb then return k not like 'SERVICE.%' or leaf='codeshare_operating_key';end if;
 if leaf='supplied_offset_seconds' then return jsonb_typeof(v)='number' and (v#>>'{}')::bigint between -64800 and 64800;end if;
 if jsonb_typeof(v)<>'string' then return false;end if;
 if leaf='operator_namespace' then return (v#>>'{}') in ('IATA_AIRLINE','ICAO_AIRLINE','AUTHORITY','NAME');end if;
 if leaf='attribution' then return (v#>>'{}') in ('MARKETING','OPERATING','UNSPECIFIED');end if;
 if leaf='codeshare_operating_key' then return (v#>>'{}') ~ '^[A-Za-z0-9._:-]{1,32}$';end if;
 if k like 'SERVICE.%' and btrim(v#>>'{}')='' then return false;end if;
 if leaf='accepted_place_id' then return (v#>>'{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';end if;
 if leaf='local_date' then return (v#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and to_char((v#>>'{}')::date,'YYYY-MM-DD')=v#>>'{}';end if;
 return char_length(v#>>'{}')<=case leaf when 'authored_text' then 5000 when 'authored_label' then 500 when 'zone_id' then 128 when 'operator_issuer' then 128 when 'operator_value' then 128 when 'service_number' then 64 when 'service_key' then 32 else 255 end;
exception when others then return false;
end $$;
create function public.trip_import_review_valid(review jsonb,supports jsonb,actor uuid,trip uuid,operation text,slot uuid)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$declare item record; selected text[]; value jsonb; ids uuid[]; unsupported boolean;
begin
 if not public.trip_event_keys(review,array['schema_key','schema_version','normalization_version','match_policy','selected_fields','edits','association_intents','deferred_dimensions']) or review->>'schema_key'<>'flight-v1' or review->'schema_version'<>'1' or review->'normalization_version'<>'1' or review->>'match_policy'<>'import-flight-match-v1' then return false;end if;
 if jsonb_typeof(review->'selected_fields')<>'array' or jsonb_array_length(review->'selected_fields')>64 or jsonb_typeof(review->'edits')<>'object' or jsonb_typeof(supports)<>'object' or (select count(*) from jsonb_each(supports))>64 then return false;end if;
 selected:=array(select v from jsonb_array_elements_text(review->'selected_fields') v);
 if selected is distinct from array(select distinct v collate "C" from unnest(selected) v order by v collate "C") or exists(select 1 from unnest(selected) k where not public.trip_import_field_key_valid(k)) then return false;end if;
 if operation is not null and (exists(select 1 from unnest(selected) k where not supports ? k) or exists(select 1 from jsonb_object_keys(supports) k where not k=any(selected))) then return false;end if;
 for item in select e.key,e.value from jsonb_each(review->'edits') e loop
  if not item.key=any(selected) or not public.trip_import_value_valid(item.key,item.value) then return false;end if;
  if item.key in ('origin','destination') then
   value:=item.value->'time';
   if value->>'local_date' is not null and value->>'local_time' is not null and value->>'zone_id' is not null or value->>'quality'='UNKNOWN' and (value->>'basis'<>'DERIVED_CIVIL' or value->>'local_time' is not null or value->>'source_instant' is not null) or value->>'quality'<>'UNKNOWN' and (value->>'quality'<>'EXACT' or value->>'basis'<>'SOURCE_INSTANT' or value->>'source_instant' is null) then return false;end if;
  end if;
 end loop;
 for item in select e.key,e.value from jsonb_each(supports) e loop
  value:=item.value;
  if not item.key=any(selected) or not public.trip_import_field_key_valid(item.key) or not public.trip_event_keys(value,array['origin','candidate_id','candidate_field_key','input_ids','accepted_value_ref','edited_value'],array['locators']) then return false;end if;
  if value->>'accepted_value_ref' is distinct from 'otr-event/receipt/'||trip||'/'||actor||'/'||operation||'/slot/'||slot||'/'||item.key then return false;end if;
  ids:=array(select v::uuid from jsonb_array_elements_text(value->'input_ids') v);
  if not public.trip_source_uuid_array_valid(ids,0,64) or not public.trip_import_locators_valid(value->'locators',ids) then return false;end if;
  if value->>'origin'='USER_ENTERED' then
   if value->'candidate_id'<>'null'::jsonb or value->'candidate_field_key'<>'null'::jsonb or cardinality(ids)<>0 or value->'edited_value'<>'null'::jsonb or operation is not null and not review->'edits' ? item.key then return false;end if;
  elsif value->>'origin' in ('ACCEPTED_EXTRACTED','EDITED_EXTRACTED') then
   if value->>'candidate_id' is null or value->>'candidate_field_key' not in ('transport_subtype','title','origin','destination','services') or cardinality(ids)=0 then return false;end if;
   if value->>'origin'='ACCEPTED_EXTRACTED' and value->'edited_value'<>'null'::jsonb or value->>'origin'='EDITED_EXTRACTED' and not public.trip_import_value_valid(value->>'candidate_field_key',value->'edited_value') then return false;end if;
  else return false;end if;
 end loop;
 if jsonb_typeof(review->'association_intents')<>'array' or jsonb_array_length(review->'association_intents')>64 or jsonb_typeof(review->'deferred_dimensions')<>'array' or jsonb_array_length(review->'deferred_dimensions')>64 then return false;end if;
 for value in select v from jsonb_array_elements(review->'association_intents') v loop if not public.trip_event_keys(value,array['input_id','purpose']) or value->>'input_id' is null or value->>'purpose'<>'CONFIRMED_SUPPORT' then return false;end if;end loop;
 for value in select v from jsonb_array_elements(review->'deferred_dimensions') v loop
  if not public.trip_event_keys(value,array['dimension','candidate_field_key','input_id','locator','reason']) or value->>'dimension' not in ('transport_subtype','title','origin','destination','services','passengers','bookings','tickets','seats','baggage','fare','cabin') or value->>'reason' not in ('UNSUPPORTED_DIMENSION','UNRESOLVED_TEMPORAL','UNRESOLVED_IDENTITY') then return false;end if;
  unsupported:=value->>'dimension' in ('passengers','bookings','tickets','seats','baggage','fare','cabin');
  if value->>'candidate_field_key' is not null then
   if value->>'input_id' is not null or value->>'locator' is not null then return false;end if;
  else
   if value->>'input_id' is null or value->'locator'->>'input_id' is distinct from value->>'input_id' or not public.trip_import_locators_valid(jsonb_build_array(value->'locator'),array[(value->>'input_id')::uuid]) or unsupported and value->'locator' ? 'excerpt' then return false;end if;
  end if;
 end loop;return true;
exception when others then return false;
end $$;
revoke all on function public.trip_import_field_key_valid(text),public.trip_import_value_valid(text,jsonb),public.trip_import_review_valid(jsonb,jsonb,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_import_field_key_valid(text),public.trip_import_value_valid(text,jsonb),public.trip_import_review_valid(jsonb,jsonb,uuid,uuid,text,uuid),public.trip_flight_services_valid(jsonb) to otr_trip_source_writer;
commit;
