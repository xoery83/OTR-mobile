begin;
set local search_path=pg_catalog;
grant otr_trip_event_semantic_writer to postgres with set true;
grant create on schema public to otr_trip_event_semantic_writer;
-- Preserve receipt rows and the existing digest namespace; extend only the two
-- admitted command names and the CREATE null-base rule.
alter table public.trip_event_operation_receipts drop constraint trip_event_operation_receipts_command_check;
alter table public.trip_event_operation_receipts add constraint trip_event_operation_receipts_command_check check(command in ('CREATE_EVENT','UPDATE_CORE_TEXT','UPDATE_TIME','UPDATE_LOCATION','UPDATE_GROUPING','UPDATE_STATUS','CREATE_TRANSPORT','UPDATE_TRANSPORT'));
do $$declare constraint_name text;begin
 select conname into strict constraint_name from pg_constraint where conrelid='public.trip_event_operation_receipts'::regclass and contype='c' and pg_get_constraintdef(oid) like '%command%CREATE_EVENT%base_semantic_revision%';
 execute format('alter table public.trip_event_operation_receipts drop constraint %I',constraint_name);
end $$;
alter table public.trip_event_operation_receipts add constraint trip_event_receipts_base_check check(command in ('CREATE_EVENT','CREATE_TRANSPORT') and base_semantic_revision is null or command not in ('CREATE_EVENT','CREATE_TRANSPORT') and base_semantic_revision between 1 and 9007199254740991 and base_semantic_revision is not null);

create function public.trip_flight_services_valid(services jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$declare s jsonb; previous text; key text; tuples text[]:='{}'; tuple text; operating integer:=0; marketing integer:=0;
begin
 if jsonb_typeof(services)<>'array' or jsonb_array_length(services) not between 1 and 4 then return false;end if;
 for s in select value from jsonb_array_elements(services) loop
  if not public.trip_event_keys(s,array['service_key','transport_subtype','attribution','operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','codeshare_operating_key']) then return false;end if;
  key:=s->>'service_key';
  if key is null or key !~ '^[A-Za-z0-9._:-]{1,32}$' or previous is not null and previous collate "C">=key collate "C" or s->>'transport_subtype' is distinct from 'FLIGHT' or s->>'attribution' not in ('MARKETING','OPERATING','UNSPECIFIED') or s->>'operator_namespace' not in ('IATA_AIRLINE','ICAO_AIRLINE','AUTHORITY','NAME') then return false;end if;
  previous:=key;
  if exists(select 1 from jsonb_each(s) item where item.key in ('operator_issuer','operator_value','operator_literal','service_number','service_literal') and (jsonb_typeof(item.value)<>'string' or length(btrim(item.value#>>'{}'))=0 or length(item.value#>>'{}')>case item.key when 'service_number' then 64 when 'operator_literal' then 255 when 'service_literal' then 255 else 128 end)) then return false;end if;
  if s->>'operator_namespace'='IATA_AIRLINE' and (s->>'operator_issuer'<>'IATA' or s->>'operator_value' !~ '^[A-Z0-9]{2}$') or s->>'operator_namespace'='ICAO_AIRLINE' and (s->>'operator_issuer'<>'ICAO' or s->>'operator_value' !~ '^[A-Z]{3}$') then return false;end if;
  if s->>'operator_namespace' in ('AUTHORITY','NAME') and (s->>'operator_issuer'<>normalize(btrim(s->>'operator_issuer'),NFC) or s->>'operator_value'<>normalize(btrim(s->>'operator_value'),NFC)) then return false;end if;
  operating:=operating+case s->>'attribution' when 'OPERATING' then 1 else 0 end;marketing:=marketing+case s->>'attribution' when 'MARKETING' then 1 else 0 end;
  if s->>'attribution'='UNSPECIFIED' and jsonb_array_length(services)<>1 then return false;end if;
  if s->>'codeshare_operating_key' is not null and (s->>'attribution'<>'MARKETING' or not exists(select 1 from jsonb_array_elements(services) o where o->>'service_key'=s->>'codeshare_operating_key' and o->>'attribution'='OPERATING')) then return false;end if;
  tuple:=public.trip_event_canonical_json(jsonb_build_array(s->'attribution',s->'operator_namespace',s->'operator_issuer',s->'operator_value',s->'service_number')::json);
  if tuple=any(tuples) then return false;end if;tuples:=array_append(tuples,tuple);
 end loop;
 return operating<=1 and marketing<=3;
end $$;

create function public.trip_flight_endpoint(endpoint jsonb,event uuid,role text,refs jsonb,old_row public.itinerary_transport_endpoints)
returns public.itinerary_transport_endpoints language plpgsql stable security invoker set search_path=pg_catalog
as $$declare t jsonb; l jsonb; data jsonb; row public.itinerary_transport_endpoints; k text; temporal_refs jsonb:='{}'; spatial_refs jsonb:='{}';
begin
 if not public.trip_event_keys(endpoint,array['time','location']) then raise exception 'INVALID_COMMAND';end if;t:=endpoint->'time';l:=endpoint->'location';
 if not public.trip_event_keys(t,array['local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','fold_choice']) or not public.trip_event_keys(l,array['authored_label','authored_text','accepted_place_id']) then raise exception 'INVALID_COMMAND';end if;
 if t->>'fold_choice' is not null or t->>'local_date' is not null and t->>'local_time' is not null and t->>'zone_id' is not null then raise exception 'UNRESOLVED_TEMPORAL';end if;
 if t->>'quality'='UNKNOWN' then
  if t->>'basis' is distinct from 'DERIVED_CIVIL' or t->>'source_instant' is not null or t->>'local_time' is not null then raise exception 'UNRESOLVED_TEMPORAL';end if;
 elsif t->>'quality' is distinct from 'EXACT' or t->>'basis' is distinct from 'SOURCE_INSTANT' or t->>'source_instant' is null then raise exception 'UNRESOLVED_TEMPORAL';end if;
 if role='ORIGIN' and (t->>'quality' is distinct from 'EXACT' or t->>'local_date' is null or t->>'source_instant' is null) then raise exception 'UNRESOLVED_TEMPORAL';end if;
 if t->>'local_date' is not null and t->>'local_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or t->>'local_time' is not null and t->>'local_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$' or t->>'source_instant' is not null and t->>'source_instant' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$' then raise exception 'INVALID_COMMAND';end if;
 if t->>'local_time' is not null and length(t->>'local_time')<>(case (t->>'clock_precision')::integer when -1 then 5 when 0 then 8 else 9+(t->>'clock_precision')::integer end) or t->>'source_instant' is not null and length(t->>'source_instant')<>(case when (t->>'source_instant_precision')::integer<=0 then 20 else 21+(t->>'source_instant_precision')::integer end) then raise exception 'INVALID_COMMAND';end if;
 if l->>'accepted_place_id' is null and coalesce(length(btrim(l->>'authored_label')),0)=0 then raise exception 'INVALID_AGGREGATE';end if;
 for k in select unnest(array['local_date','local_time','zone_id','supplied_offset_seconds','source_instant']) loop
  if t->>k is not null then temporal_refs:=temporal_refs||jsonb_build_object(k,refs->(role||'.'||k));end if;
 end loop;
 for k in select unnest(array['authored_label','authored_text']) loop
  if l->>k is not null then spatial_refs:=spatial_refs||jsonb_build_object(k,refs->(role||'.'||k));end if;
 end loop;
 data:=t-'fold_choice'||l||jsonb_build_object('event_id',event,'role',role,'instant',t->'source_instant','civil_resolution',case when t->>'basis'='DERIVED_CIVIL' then 'PENDING' end,'resolution_offset_seconds',null,'interpretation_key',null,'interpretation_input_sha256',null,'provenance_refs',temporal_refs,'spatial_provenance_refs',case when spatial_refs='{}' then null else spatial_refs end,'location_input_revision',case when old_row.event_id is null then 1 when (to_jsonb(old_row)->'authored_label') is distinct from l->'authored_label' or (to_jsonb(old_row)->'authored_text') is distinct from l->'authored_text' or (to_jsonb(old_row)->'accepted_place_id') is distinct from l->'accepted_place_id' then old_row.location_input_revision+1 else old_row.location_input_revision end);
  if old_row.event_id is not null and data->'location_input_revision'=to_jsonb(old_row.location_input_revision) then
  data:=data||jsonb_build_object('spatial_provenance_refs',coalesce(old_row.spatial_provenance_refs,'{}')||spatial_refs);
  row:=jsonb_populate_record(old_row,data);
 else row:=jsonb_populate_record(null::public.itinerary_transport_endpoints,data);end if;
 if not public.trip_event_boundary_valid(data,row.instant,'TIME') or not public.trip_event_spatial_valid(to_jsonb(row),true) then raise exception 'INVALID_AGGREGATE';end if;
 return row;
end $$;

-- Reject unknown fields before receipt admission. Unsupported dimensions never
-- enter the immutable intended_payload, even as a rejected Flight operation.
create function public.trip_flight_payload_keys(family text,payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$declare values jsonb; endpoint jsonb; service jsonb; proof record;
begin
 if family='CREATE_TRANSPORT' then
  if not public.trip_event_keys(payload,array['shape','eventType','subtype','participantScope','core','origin','destination','services','proofs']) or not public.trip_event_keys(payload->'core',array['title']) then return false;end if;
  values:=jsonb_build_object('origin',payload->'origin','destination',payload->'destination','services',payload->'services');
 else
  if not public.trip_event_keys(payload,array['changes','proofs']) or not public.trip_event_keys(payload->'changes','{}',array['title','origin','destination','services']) then return false;end if;values:=payload->'changes';
 end if;
 for endpoint in select value from jsonb_each(values) where key in ('origin','destination') loop
  if not public.trip_event_keys(endpoint,array['time','location']) or not public.trip_event_keys(endpoint->'time',array['local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','fold_choice']) or not public.trip_event_keys(endpoint->'location',array['authored_label','authored_text','accepted_place_id']) then return false;end if;
 end loop;
 if values ? 'services' then
  if jsonb_typeof(values->'services')<>'array' or jsonb_array_length(values->'services') not between 1 and 4 then return false;end if;
  for service in select value from jsonb_array_elements(values->'services') loop
   if not public.trip_event_keys(service,array['service_key','transport_subtype','attribution','operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','codeshare_operating_key']) then return false;end if;
  end loop;
 end if;
 if jsonb_typeof(payload->'proofs')<>'object' or (select count(*) from jsonb_each(payload->'proofs'))>64 then return false;end if;
 for proof in select * from jsonb_each(payload->'proofs') loop
  if proof.key !~ '^(ROOT\.title|(ORIGIN|DESTINATION)\.(local_date|local_time|zone_id|supplied_offset_seconds|source_instant|authored_label|authored_text|accepted_place_id)|SERVICE\.[A-Za-z0-9._:-]{1,32}\.(operator_namespace|operator_issuer|operator_value|operator_literal|service_number|service_literal|attribution|codeshare_operating_key))$' or not public.trip_event_keys(proof.value,array['kind','ref']) then return false;end if;
 end loop;
 return true;
end $$;

create function public.trip_event_execute_flight(family text,actor uuid,trip uuid,operation uuid,event uuid,base bigint,intent text)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog
as $$declare envelope jsonb; canonical text; digest text; payload jsonb; values jsonb; proof jsonb; field record; k text; leaf text; accepted jsonb; refs jsonb:='{}'; confirmations jsonb:='{}'; old_event public.itinerary_events; new_event public.itinerary_events; old_origin public.itinerary_transport_endpoints; old_destination public.itinerary_transport_endpoints; origin public.itinerary_transport_endpoints; destination public.itinerary_transport_endpoints; services jsonb; old_services jsonb; service public.itinerary_transport_services; result jsonb; receipt public.trip_event_operation_receipts; outcome text:='APPLIED'; code text; observed bigint; committed bigint; stamp timestamptz; projection jsonb; old_value jsonb; current_ref text; old_endpoint jsonb; old_service jsonb;
begin
 if current_user<>'otr_trip_event_semantic_writer' or session_user<>'otr_trip_event_command_gateway' or family not in ('CREATE_TRANSPORT','UPDATE_TRANSPORT') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if intent is null or octet_length(intent)>32768 then raise exception 'INVALID_COMMAND';end if;
 canonical:=public.trip_event_canonical_json(intent::json);envelope:=canonical::jsonb;
 if not public.trip_event_keys(envelope,array['contractVersion','intentVersion','command','commandVersion','operationKey','actorAccountId','tripId','eventId','baseSemanticRevision','payload']) or envelope->'contractVersion'<>'1' or envelope->'intentVersion'<>'1' or envelope->'commandVersion'<>'1' or envelope->>'command' is distinct from family or envelope->>'actorAccountId' is distinct from actor::text or envelope->>'tripId' is distinct from trip::text or envelope->>'eventId' is distinct from event::text or envelope->>'operationKey' is distinct from operation::text or envelope->'baseSemanticRevision' is distinct from coalesce(to_jsonb(base),'null') or operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or family='CREATE_TRANSPORT' and base is not null or family='UPDATE_TRANSPORT' and (base is null or base not between 1 and 9007199254740991) then raise exception 'INVALID_COMMAND';end if;
 if not public.trip_flight_payload_keys(family,envelope->'payload') is true then raise exception 'INVALID_COMMAND';end if;
 digest:=encode(extensions.digest(convert_to(public.trip_event_canonical_json((envelope||jsonb_build_object('encoding','otr-event-intent-v1'))::json),'UTF8'),'sha256'),'hex');
 if not public.trip_event_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 perform public.trip_import_scope_lock(actor,trip);
 perform pg_advisory_xact_lock(hashtextextended('otr-event-operation/'||trip||'/'||actor||'/'||operation,0));
 select * into receipt from public.trip_event_operation_receipts where trip_id=trip and actor_account_id=actor and operation_key=operation;
 if found then
  if receipt.intent_sha256<>digest or receipt.intended_payload<>canonical then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';end if;
  if receipt.outcome in ('APPLIED','NO_CHANGE') and not exists(select 1 from public.itinerary_events where id=event and trip_id=trip) then raise exception 'FORBIDDEN' using errcode='42501';end if;
  return jsonb_build_object('receipt',public.trip_event_receipt_lookup(actor,trip,operation),'idempotentReplay',true);
 end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000';end if;
 perform public.trip_import_require_gate();
 if not exists(select 1 from public.trip_event_command_gate where singleton and enabled) then raise exception 'CANONICAL_WRITES_DISABLED' using errcode='42501';end if;
 begin
  payload:=envelope->'payload';
  if family='CREATE_TRANSPORT' then
   if not public.trip_event_keys(payload,array['shape','eventType','subtype','participantScope','core','origin','destination','services','proofs']) or payload->>'shape' is distinct from 'TRANSPORT' or payload->>'eventType' is distinct from 'TRANSPORT' or payload->>'subtype' is distinct from 'FLIGHT' or payload->>'participantScope' is distinct from 'UNASSIGNED' or not public.trip_event_keys(payload->'core',array['title']) then raise exception 'INVALID_COMMAND';end if;
   values:=jsonb_build_object('title',payload->'core'->'title','origin',payload->'origin','destination',payload->'destination','services',payload->'services');
  else
   if not public.trip_event_keys(payload,array['changes','proofs']) or not public.trip_event_keys(payload->'changes','{}',array['title','origin','destination','services']) or payload->'changes'='{}' then raise exception 'INVALID_COMMAND';end if;values:=payload->'changes';
  end if;
  if values ? 'title' and (jsonb_typeof(values->'title')<>'string' or length(values->>'title') not between 1 and 200 or btrim(values->>'title')='') or jsonb_typeof(payload->'proofs')<>'object' or (select count(*) from jsonb_each(payload->'proofs')) not between 1 and 64 then raise exception 'INVALID_COMMAND';end if;
  -- Fixed C operation admission applies even to a NO_CHANGE/retained-only update.
  perform public.trip_source_admit_event_proof(actor,trip,event,operation,family,base,digest,null,null,null,jsonb_build_object('values',values,'proofs',payload->'proofs'));
  -- C proof validation acquires Source/Run/Confirmation/Slot locks before B rows.
  for field in select * from jsonb_each(payload->'proofs') order by key collate "C" loop
   proof:=field.value;
   if not public.trip_event_keys(proof,array['kind','ref']) or proof->>'kind' not in ('TRACK_C','RETAINED') or jsonb_typeof(proof->'ref')<>'string' or char_length(proof->>'ref') not between 1 and 512 or proof->>'kind'='TRACK_C' and proof->>'ref' !~ '^track-c/field-evidence/[0-9a-f-]{36}/[A-Za-z0-9._:-]{1,128}$' then raise exception 'INVALID_PROVENANCE';end if;
   accepted:=public.trip_import_field_value(values,field.key);
   if accepted is null or family='CREATE_TRANSPORT' and (accepted='null' or accepted->'value'='null') then raise exception 'INVALID_PROVENANCE';end if;
   if proof->>'kind'='TRACK_C' then k:=public.trip_source_admit_event_proof(actor,trip,event,operation,family,base,digest,null,split_part(proof->>'ref','/',3)::uuid,field.key,accepted);else k:=proof->>'ref';end if;
   if k is distinct from proof->>'ref' then raise exception 'INVALID_PROVENANCE';end if;
   refs:=refs||jsonb_build_object(field.key,k);
   if proof->>'kind'='TRACK_C' then confirmations:=confirmations||jsonb_build_object(field.key,jsonb_build_object('actorAccountId',actor,'tripId',trip,'eventId',event,'operationKey',operation,'field',field.key,'value',accepted,'cleared',accepted='null' or accepted->'value'='null','ref',k)); end if;
  end loop;
  perform 1 from public.trips where id=trip for share;
  perform 1 from public.trip_members where trip_id=trip and user_id=actor order by id for share;
  perform 1 from public.journey_members where trip_id=trip and user_id=actor order by id for share;
  if not public.trip_event_admission(actor,trip,true) then raise exception 'FORBIDDEN';end if;
  -- Places precede parent Event and endpoints, and are never inferred from labels.
  for k in select distinct e->'location'->>'accepted_place_id' from jsonb_each(values) p cross join lateral (select p.value e where p.key in ('origin','destination')) x where e->'location'->>'accepted_place_id' is not null order by 1 loop
   perform 1 from public.places where id=k::uuid for key share;if not found then raise exception 'INVALID_AGGREGATE';end if;
  end loop;
  if family='CREATE_TRANSPORT' then
   perform pg_advisory_xact_lock(hashtextextended('otr-event-id/'||event,0));
   if exists(select 1 from public.itinerary_events where id=event) then raise exception 'EVENT_ID_IN_USE';end if;
   stamp:=clock_timestamp();
   new_event:=jsonb_populate_record(null::public.itinerary_events,jsonb_build_object('id',event,'trip_id',trip,'title',values->'title','event_type','transport','status','planned','order_index',0,'created_by',actor,'created_at',stamp,'updated_at',stamp,'needs_review',false,'location_status','none','geocode_attempts',0,'manual_location',false,'temporal_contract_version',1,'temporal_shape','TRANSPORT','semantic_revision',1,'participant_scope','UNASSIGNED'));
  else
   select * into old_event from public.itinerary_events where id=event and trip_id=trip for update;
   if not found or old_event.temporal_shape is distinct from 'TRANSPORT' or old_event.event_type is distinct from 'transport' or old_event.participant_scope is distinct from 'UNASSIGNED' then raise exception 'CANONICAL_TARGET_REQUIRED';end if;
   observed:=old_event.semantic_revision;if base<>observed then raise exception 'STALE_BASE_REVISION';end if;
   select * into old_origin from public.itinerary_transport_endpoints where event_id=event and role='ORIGIN' for update;
   select * into old_destination from public.itinerary_transport_endpoints where event_id=event and role='DESTINATION' for update;
   select jsonb_agg(to_jsonb(s)-'event_id'-'provenance_refs' order by service_key collate "C") into old_services from public.itinerary_transport_services s where event_id=event;
   if old_origin.event_id is null or old_destination.event_id is null or old_services is null or exists(select 1 from public.itinerary_transport_services where event_id=event and transport_subtype<>'FLIGHT') then raise exception 'TRANSPORT_ADOPTION_REQUIRED';end if;
   new_event:=old_event;
  end if;
  for field in select * from jsonb_each(payload->'proofs') loop
   if family='CREATE_TRANSPORT' then if field.value->>'kind'='RETAINED' then raise exception 'INVALID_PROVENANCE';end if;continue;end if;
   accepted:=public.trip_import_field_value(values,field.key);current_ref:=null;
   if field.key='ROOT.title' then
    old_value:=to_jsonb(old_event.title);
    select x.value->>'ref' into current_ref from public.trip_event_operation_receipts r cross join lateral jsonb_each(r.confirmations) x where r.trip_id=trip and r.target_event_id=event and r.outcome in ('APPLIED','NO_CHANGE') and x.key=field.key order by r.committed_semantic_revision desc limit 1;
   elsif field.key like 'ORIGIN.%' or field.key like 'DESTINATION.%' then
    leaf:=split_part(field.key,'.',2);old_endpoint:=case split_part(field.key,'.',1) when 'ORIGIN' then to_jsonb(old_origin) else to_jsonb(old_destination) end;
    old_value:=old_endpoint->leaf;
    current_ref:=coalesce(old_endpoint->'provenance_refs'->>leaf,old_endpoint->'spatial_provenance_refs'->>leaf);
    if leaf='accepted_place_id' then select x.value->>'ref' into current_ref from public.trip_event_operation_receipts r cross join lateral jsonb_each(r.confirmations) x where r.trip_id=trip and r.target_event_id=event and r.outcome in ('APPLIED','NO_CHANGE') and x.key=field.key order by r.committed_semantic_revision desc limit 1;end if;
    if leaf in ('local_time','source_instant') then
     if leaf='local_time' then
      if (accepted->>'value')::time is distinct from (old_value#>>'{}')::time or accepted->'precision' is distinct from old_endpoint->'clock_precision' then if field.value->>'kind'='RETAINED' then raise exception 'INVALID_PROVENANCE';end if;else old_value:=accepted->'value';end if;
     else
      if (accepted->>'value')::timestamptz is distinct from (old_value#>>'{}')::timestamptz or accepted->'precision' is distinct from old_endpoint->'source_instant_precision' then if field.value->>'kind'='RETAINED' then raise exception 'INVALID_PROVENANCE';end if;else old_value:=accepted->'value';end if;
     end if;
     old_value:=jsonb_build_object('value',old_value,'precision',old_endpoint->case leaf when 'local_time' then 'clock_precision' else 'source_instant_precision' end);
    end if;
   elsif field.key like 'SERVICE.%' then
    leaf:=split_part(field.key,'.',array_length(string_to_array(field.key,'.'),1));
    select to_jsonb(service_row) into old_service from public.itinerary_transport_services service_row where service_row.event_id=event and service_row.service_key=substring(field.key from 9 for char_length(field.key)-9-char_length(leaf));
    old_value:=old_service->leaf;current_ref:=old_service->'provenance_refs'->>leaf;
   else raise exception 'INVALID_PROVENANCE';end if;
   if field.value->>'kind'='RETAINED' then
    if accepted is distinct from old_value or current_ref is distinct from field.value->>'ref' or accepted='null' or accepted->'value'='null' then raise exception 'INVALID_PROVENANCE';end if;
   elsif accepted is not distinct from old_value then raise exception 'INVALID_PROVENANCE';end if;
  end loop;
  if values ? 'title' then
   if not refs ? 'ROOT.title' then raise exception 'INVALID_PROVENANCE';end if;new_event.title:=values->>'title';
  end if;
  origin:=case when values ? 'origin' then public.trip_flight_endpoint(values->'origin',event,'ORIGIN',refs,old_origin) else old_origin end;
  destination:=case when values ? 'destination' then public.trip_flight_endpoint(values->'destination',event,'DESTINATION',refs,old_destination) else old_destination end;
  -- Explicit removal cannot hide behind an incomplete replacement component.
  if family='UPDATE_TRANSPORT' then
   for k in select unnest(array['ORIGIN','DESTINATION']) loop
    if not values ? lower(k) then continue;end if;
    for leaf in select unnest(array['local_date','local_time','zone_id','supplied_offset_seconds','source_instant','authored_label','authored_text','accepted_place_id']) loop
     if (case k when 'ORIGIN' then to_jsonb(old_origin) else to_jsonb(old_destination) end)->>leaf is not null and (case k when 'ORIGIN' then to_jsonb(origin) else to_jsonb(destination) end)->>leaf is null and not refs ? (k||'.'||leaf) then raise exception 'INVALID_PROVENANCE';end if;
    end loop;
   end loop;
  end if;
  services:=coalesce(values->'services',old_services);
  if not public.trip_flight_services_valid(services) then raise exception 'INVALID_SERVICE_AGGREGATE';end if;
  if values ? 'services' then
   for service in select * from jsonb_populate_recordset(null::public.itinerary_transport_services,services) loop
    for leaf in select unnest(array['operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','attribution','codeshare_operating_key']) loop
     if to_jsonb(service)->>leaf is not null and not refs ? ('SERVICE.'||service.service_key||'.'||leaf) then raise exception 'INVALID_PROVENANCE';end if;
    end loop;
   end loop;
  end if;
  new_event.planned_start:=origin.instant;new_event.planned_end:=destination.instant;new_event.is_estimated_time:=false;
  if not public.trip_event_row_valid(to_jsonb(new_event)) or destination.instant<origin.instant then raise exception 'INVALID_AGGREGATE';end if;
  if family='UPDATE_TRANSPORT' and to_jsonb(new_event)=to_jsonb(old_event) and to_jsonb(origin)=to_jsonb(old_origin) and to_jsonb(destination)=to_jsonb(old_destination) and services=old_services and confirmations='{}' then outcome:='NO_CHANGE';
  else
   if family='UPDATE_TRANSPORT' then
    if observed=9007199254740991 then raise exception 'REVISION_OVERFLOW';end if;new_event.semantic_revision:=observed+1;new_event.updated_at:=clock_timestamp();
   end if;
   if family='CREATE_TRANSPORT' then insert into public.itinerary_events select (new_event).*;
   else update public.itinerary_events set title=new_event.title,planned_start=new_event.planned_start,planned_end=new_event.planned_end,is_estimated_time=false,semantic_revision=new_event.semantic_revision,updated_at=new_event.updated_at where id=event and trip_id=trip;end if;
   if values ? 'origin' then delete from public.itinerary_transport_endpoints where event_id=event and role='ORIGIN';insert into public.itinerary_transport_endpoints select(origin).*;end if;
   if values ? 'destination' then delete from public.itinerary_transport_endpoints where event_id=event and role='DESTINATION';insert into public.itinerary_transport_endpoints select(destination).*;end if;
   if values ? 'services' then
    delete from public.itinerary_transport_services where event_id=event;
    for service in select * from jsonb_populate_recordset(null::public.itinerary_transport_services,services) loop
     service.event_id:=event;
     select jsonb_object_agg(fields.value,refs->('SERVICE.'||service.service_key||'.'||fields.value)) into service.provenance_refs from unnest(array['operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal','attribution','codeshare_operating_key']) fields(value) where to_jsonb(service)->>fields.value is not null;
     insert into public.itinerary_transport_services select(service).*;
    end loop;
   end if;
   perform public.assert_trip_event_aggregate(event);
  end if;
  committed:=new_event.semantic_revision;
  projection:=jsonb_build_object('id',event,'trip_id',trip,'semantic_revision',committed,'title',new_event.title,'origin',to_jsonb(origin),'destination',to_jsonb(destination),'services',services);
  for k in select unnest(array['origin','destination']) loop
   if projection->k->>'instant' is not null then projection:=jsonb_set(projection,array[k,'instant'],to_jsonb(public.trip_event_utc_timestamp((projection->k->>'instant')::timestamptz)));end if;
   if projection->k->>'source_instant' is not null then projection:=jsonb_set(projection,array[k,'source_instant'],to_jsonb(public.trip_event_utc_timestamp((projection->k->>'source_instant')::timestamptz)));end if;
  end loop;
 exception when others then
  code:=sqlerrm;
  if code not in ('FORBIDDEN','STALE_BASE_REVISION','CANONICAL_TARGET_REQUIRED','EVENT_ID_IN_USE','INVALID_COMMAND','INVALID_PROVENANCE','INPUT_STALE','INVALID_IMPORT_BINDING','INVALID_AGGREGATE','INVALID_SERVICE_AGGREGATE','UNRESOLVED_TEMPORAL','TRANSPORT_ADOPTION_REQUIRED','REVISION_OVERFLOW','PREDECESSOR_OUTCOME_UNKNOWN','KNOWN_PREDECESSOR_TARGET','UNRESOLVED_MATCH','UNRESOLVED_MATCH_LIMIT','INCOMPATIBLE_MERGE_TARGETS') then
   if sqlstate in ('23514','23502','23503','22P02','22007','22008','22003') then code:='INVALID_AGGREGATE';else raise;end if;
  end if;
  outcome:=case code when 'STALE_BASE_REVISION' then 'CONFLICT' else 'REJECTED' end;committed:=null;projection:='{}';confirmations:='{}';
 end;
 if code='FORBIDDEN' and not public.trip_event_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 result:=jsonb_build_object('trip_id',trip,'actor_account_id',actor,'operation_key',operation,'intent_version',1,'command',family,'command_version',1,'intent_sha256',digest,'target_event_id',event,'base_semantic_revision',base,'intended_payload',canonical,'outcome',outcome,'result_event_id',case when outcome in ('APPLIED','NO_CHANGE') then event end,'committed_semantic_revision',committed,'observed_semantic_revision',case outcome when 'CONFLICT' then observed end,'result_fields',projection,'confirmations',confirmations,'error_code',code,'submitted_http_status',case when code='FORBIDDEN' then 403 when outcome='CONFLICT' or code in ('EVENT_ID_IN_USE','REVISION_OVERFLOW') then 409 when code is not null then 422 when family='CREATE_TRANSPORT' then 201 else 200 end,'receipt_version',1,'committed_at',public.trip_event_utc_timestamp(clock_timestamp()));
 result:=result||jsonb_build_object('receipt_sha256',encode(extensions.digest(convert_to(public.trip_event_canonical_json(result::json),'UTF8'),'sha256'),'hex'));
 receipt:=jsonb_populate_record(null::public.trip_event_operation_receipts,result);insert into public.trip_event_operation_receipts select(receipt).*;
 return jsonb_build_object('receipt',result,'idempotentReplay',false);
end $$;
create function public.trip_event_create_transport(actor uuid,trip uuid,operation uuid,event uuid,intent text)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select public.trip_event_execute_flight('CREATE_TRANSPORT',actor,trip,operation,event,null,intent)$$;
create function public.trip_event_update_transport(actor uuid,trip uuid,operation uuid,event uuid,base bigint,intent text)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select public.trip_event_execute_flight('UPDATE_TRANSPORT',actor,trip,operation,event,base,intent)$$;
revoke all on function public.trip_flight_payload_keys(text,jsonb),public.trip_flight_services_valid(jsonb),public.trip_flight_endpoint(jsonb,uuid,text,jsonb,public.itinerary_transport_endpoints),public.trip_event_execute_flight(text,uuid,uuid,uuid,uuid,bigint,text),public.trip_event_create_transport(uuid,uuid,uuid,uuid,text),public.trip_event_update_transport(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_flight_services_valid(jsonb) to otr_trip_source_writer,otr_trip_event_semantic_writer;
grant execute on function public.trip_flight_payload_keys(text,jsonb),public.trip_flight_endpoint(jsonb,uuid,text,jsonb,public.itinerary_transport_endpoints),public.trip_event_execute_flight(text,uuid,uuid,uuid,uuid,bigint,text),public.trip_import_field_value(jsonb,text) to otr_trip_event_semantic_writer;
grant execute on function public.trip_event_create_transport(uuid,uuid,uuid,uuid,text),public.trip_event_update_transport(uuid,uuid,uuid,uuid,bigint,text) to otr_trip_event_command_gateway;
alter function public.trip_event_create_transport(uuid,uuid,uuid,uuid,text) owner to otr_trip_event_semantic_writer;
alter function public.trip_event_update_transport(uuid,uuid,uuid,uuid,bigint,text) owner to otr_trip_event_semantic_writer;
-- No physical Event/endpoint/service DML capability is granted. Existing protected
-- guards and both structural gates stay CLOSED; positive tests are rollback-only.
revoke create on schema public from otr_trip_event_semantic_writer;
grant otr_trip_event_semantic_writer to postgres with inherit false,set false;
commit;
