begin;
-- B-T3B: nullable legacy expansion; no data backfill or canonical command.
alter table public.itinerary_events
  add column temporal_contract_version smallint,
  add column temporal_shape text,
  add column semantic_revision bigint,
  add column timing_label text,
  add column timing_provenance_ref text,
  add column participant_scope text,
  add column legacy_planned_start timestamptz(6),
  add column legacy_planned_end timestamptz(6),
  add column legacy_is_estimated_time boolean,
  add column legacy_snapshot_at timestamptz(6),
  add column start_local_date date,
  add column start_local_time time(6) without time zone,
  add column start_clock_precision smallint,
  add column start_quality text,
  add column start_basis text,
  add column start_zone_id text,
  add column start_supplied_offset_seconds integer,
  add column start_source_instant timestamptz(6),
  add column start_source_instant_precision smallint,
  add column start_civil_resolution text,
  add column start_resolution_offset_seconds integer,
  add column start_interpretation_key text,
  add column start_interpretation_input_sha256 text,
  add column start_provenance_refs jsonb,
  add column end_local_date date,
  add column end_local_time time(6) without time zone,
  add column end_clock_precision smallint,
  add column end_quality text,
  add column end_basis text,
  add column end_zone_id text,
  add column end_supplied_offset_seconds integer,
  add column end_source_instant timestamptz(6),
  add column end_source_instant_precision smallint,
  add column end_civil_resolution text,
  add column end_resolution_offset_seconds integer,
  add column end_interpretation_key text,
  add column end_interpretation_input_sha256 text,
  add column end_provenance_refs jsonb,
  add column authored_label text,
  add column authored_text text,
  add column authored_address text,
  add column accepted_address text,
  add column accepted_latitude double precision,
  add column accepted_longitude double precision,
  add column accepted_place_id uuid references public.places(id) on delete set null,
  add column spatial_provenance_refs jsonb,
  add column location_input_revision bigint,
  add column candidate_input_revision bigint,
  add column candidate_provider text,
  add column candidate_provider_place_id text,
  add column candidate_place_id uuid references public.places(id) on delete set null,
  add column candidate_label text,
  add column candidate_address text,
  add column candidate_latitude double precision,
  add column candidate_longitude double precision,
  add column candidate_confidence numeric,
  add column candidate_state text,
  add column candidate_observed_at timestamptz(6),
  add column candidate_error_code text,
  add column authored_address_line1 text,
  add column authored_address_line2 text,
  add column authored_address_locality text,
  add column authored_address_region text,
  add column authored_address_postal_code text,
  add column authored_address_country text,
  add column accepted_address_line1 text,
  add column accepted_address_line2 text,
  add column accepted_address_locality text,
  add column accepted_address_region text,
  add column accepted_address_postal_code text,
  add column accepted_address_country text;

create table public.itinerary_transport_endpoints (
  event_id uuid not null references public.itinerary_events(id) on delete cascade,
  role text not null check (role in ('ORIGIN','DESTINATION')),
  instant timestamptz(6),
  local_date date,
  local_time time(6) without time zone,
  clock_precision smallint,
  quality text,
  basis text,
  zone_id text,
  supplied_offset_seconds integer,
  source_instant timestamptz(6),
  source_instant_precision smallint,
  civil_resolution text,
  resolution_offset_seconds integer,
  interpretation_key text,
  interpretation_input_sha256 text,
  provenance_refs jsonb,
  authored_label text,
  authored_text text,
  authored_address text,
  accepted_address text,
  accepted_latitude double precision,
  accepted_longitude double precision,
  accepted_place_id uuid references public.places(id) on delete set null,
  spatial_provenance_refs jsonb,
  location_input_revision bigint,
  candidate_input_revision bigint,
  candidate_provider text,
  candidate_provider_place_id text,
  candidate_place_id uuid references public.places(id) on delete set null,
  candidate_label text,
  candidate_address text,
  candidate_latitude double precision,
  candidate_longitude double precision,
  candidate_confidence numeric,
  candidate_state text,
  candidate_observed_at timestamptz(6),
  candidate_error_code text,
  authored_address_line1 text,
  authored_address_line2 text,
  authored_address_locality text,
  authored_address_region text,
  authored_address_postal_code text,
  authored_address_country text,
  accepted_address_line1 text,
  accepted_address_line2 text,
  accepted_address_locality text,
  accepted_address_region text,
  accepted_address_postal_code text,
  accepted_address_country text,
  primary key(event_id,role)
);
do $$
begin
  if not exists(select 1 from pg_roles where rolname='otr_trip_event_semantic_writer') then
    create role otr_trip_event_semantic_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
  if exists(select 1 from pg_roles where rolname='otr_trip_event_semantic_writer'
     and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls))
     or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
       where r.rolname='otr_trip_event_semantic_writer'
         and (m.set_option or m.inherit_option or m.member<>(select oid from pg_roles where rolname='postgres')))
     or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member
       where r.rolname='otr_trip_event_semantic_writer')
     or exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
       where r.rolname='otr_trip_event_semantic_writer') then
    raise exception 'UNSAFE_TRIP_EVENT_WRITER_ROLE';
  end if;
  -- A reused identity must not arrive with table write grants.
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m')
    and (has_table_privilege('otr_trip_event_semantic_writer',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'))) then
    raise exception 'UNSAFE_TRIP_EVENT_WRITER_GRANTS';
  end if;
  -- has_column_privilege includes direct ACLs, PUBLIC, inherited and table grants.
  -- Match the table-check scope, including all protected relations and new default ACLs.
  if exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('r','p','v','m')
      and a.attnum>0 and not a.attisdropped
      and has_column_privilege('otr_trip_event_semantic_writer',c.oid,a.attnum,
        'SELECT,INSERT,UPDATE,REFERENCES')) then
    raise exception 'UNSAFE_TRIP_EVENT_WRITER_COLUMN_GRANTS';
  end if;
end;
$$;

-- Pure validators enforce storage structure only, not IANA rules/evidence truth.
create function public.trip_event_refs_valid(j jsonb, allowed text[], max_keys integer)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$
declare k text; v jsonb; count_keys integer:=0;
begin
  if j is null or jsonb_typeof(j)<>'object' or octet_length(j::text)>16384 then return false; end if;
  for k,v in select * from jsonb_each(j) loop
    count_keys:=count_keys+1;
    if not k=any(allowed) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>512
      or (v#>>'{}') !~ '^(track-c/field-evidence/|otr-event/confirmation/)[^[:space:]]+$' then return false; end if;
  end loop;
  return count_keys<=max_keys;
end;
$$;

create function public.trip_event_boundary_valid(j jsonb, n timestamptz, mode text)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$
declare
 d date:=(j->>'local_date')::date; t time:=(j->>'local_time')::time;
 p integer:=(j->>'clock_precision')::integer; q text:=j->>'quality'; b text:=j->>'basis';
 z text:=j->>'zone_id'; s timestamptz:=(j->>'source_instant')::timestamptz;
 sp integer:=(j->>'source_instant_precision')::integer; r text:=j->>'civil_resolution';
 off integer:=(j->>'resolution_offset_seconds')::integer; supplied integer:=(j->>'supplied_offset_seconds')::integer;
 ik text:=j->>'interpretation_key'; ih text:=j->>'interpretation_input_sha256'; refs jsonb:=j->'provenance_refs';
 k text; expected timestamptz; clock_literal text; binding text;
begin
 if mode='UNUSED' then return jsonb_strip_nulls(j)='{}'::jsonb and n is null; end if;
 if not public.trip_event_refs_valid(refs,array['local_date','local_time','zone_id','supplied_offset_seconds','source_instant','quality','fold_choice'],16) then return false; end if;
 for k in select unnest(array['local_date','local_time','zone_id','supplied_offset_seconds','source_instant']) loop
   if j->>k is not null and not refs ? k then return false; end if;
 end loop;
 for k in select jsonb_object_keys(refs) loop
   if (k in ('local_date','local_time','zone_id','supplied_offset_seconds','source_instant') and j->>k is null) or (k='quality' and q is null) or (k='fold_choice' and r is distinct from 'FOLD_RESOLVED') then return false; end if;
 end loop;
 if d is not null and (not isfinite(d) or extract(year from d) not between 1 and 9999) then return false; end if;
 if t is not null and t>=time '24:00' then return false; end if;
 if (t is null)<>(p is null) or p is not null and p not between -1 and 6 then return false; end if;
 if t is not null and ((p=-1 and extract(second from t)<>0) or (p>=0 and extract(epoch from t)<>trunc(extract(epoch from t),p))) then return false; end if;
 if (s is null)<>(sp is null) or sp is not null and sp not between -1 and 6 or s is not null and not isfinite(s) then return false; end if;
 if s is not null and ((sp=-1 and extract(second from s at time zone 'UTC')<>0) or (sp>=0 and extract(epoch from s)<>trunc(extract(epoch from s),sp))) then return false; end if;
 if z is not null and (length(z)=0 or length(z)>128) or supplied is not null and supplied not between -64800 and 64800 or off is not null and off not between -64800 and 64800 then return false; end if;
 if mode in ('DATE','WINDOW') then
   return b='DERIVED_CIVIL' and r='PENDING' and (mode='WINDOW' or d is not null)
     and t is null and q is null and s is null and n is null and off is null and ik is null and ih is null;
 end if;
 if q is null or q not in ('UNKNOWN','EXACT','ESTIMATED') or b is null or b not in ('DERIVED_CIVIL','SOURCE_INSTANT') then return false; end if;
 if q='ESTIMATED' and not refs ? 'quality' then return false; end if;
 if q='UNKNOWN' and (t is not null or s is not null or b<>'DERIVED_CIVIL' or r is distinct from 'PENDING') then return false; end if;
 if b='DERIVED_CIVIL' and q in ('EXACT','ESTIMATED') and t is null then return false; end if;
 if b='SOURCE_INSTANT' and (s is null or q='UNKNOWN') then return false; end if;
 if d is null or t is null or z is null then
   if (b='DERIVED_CIVIL' and r is distinct from 'PENDING') or (b='SOURCE_INSTANT' and r is not null) then return false; end if;
 else
   if r is null or r not in ('PENDING','UNIQUE','GAP','FOLD','FOLD_RESOLVED') then return false; end if;
 end if;
 if r in ('UNIQUE','GAP','FOLD','FOLD_RESOLVED') then
   if ik is null or length(ik)=0 or length(ik)>256 or ih is null or ih !~ '^[0-9a-f]{64}$' then return false; end if;
   if (r in ('UNIQUE','FOLD_RESOLVED'))<>(off is not null) then return false; end if;
   if r='FOLD_RESOLVED' and not refs ? 'fold_choice' then return false; end if;
   clock_literal:=case when p=-1 then to_char(t,'HH24:MI') when p=0 then to_char(t,'HH24:MI:SS') else left(to_char(t,'HH24:MI:SS.US'),9+p) end;
   select '['||string_agg(v::text,',' order by ord)||']' into binding
     from json_array_elements(json_build_array('otr-civil-binding-v1',to_char(d,'YYYY-MM-DD'),clock_literal,p,z,supplied,q,r,off,ik)) with ordinality as a(v,ord);
   if supplied is not null and off is not null and supplied<>off then return false; end if;
   if ih<>encode(extensions.digest(convert_to(binding,'UTF8'),'sha256'),'hex') then return false; end if;
 else
   if off is not null or ik is not null or ih is not null then return false; end if;
 end if;
 if n is not null and not isfinite(n) then return false; end if;
 if b='SOURCE_INSTANT' then return n is not distinct from s; end if;
 if r in ('UNIQUE','FOLD_RESOLVED') then
   expected:=((d+t) at time zone 'UTC')-make_interval(secs=>off);
   return n is not distinct from expected;
 end if;
 return n is null;
end;
$$;

create function public.trip_event_spatial_valid(j jsonb, active boolean)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$
declare k text; lat double precision; lng double precision; input bigint:=(j->>'location_input_revision')::bigint;
 ci bigint:=(j->>'candidate_input_revision')::bigint; state text:=j->>'candidate_state'; refs jsonb:=j->'spatial_provenance_refs';
 has_intent boolean; has_candidate boolean;
begin
 if not active then return jsonb_strip_nulls(j)='{}'::jsonb; end if;
 if input is null or input not between 1 and 9007199254740991 then return false; end if;
 if j->>'authored_label' is not null and length(j->>'authored_label')>500 then return false; end if;
 if j->>'authored_text' is not null and length(j->>'authored_text')>5000 then return false; end if;
 if j->>'authored_address' is not null and length(j->>'authored_address')>2000 then return false; end if;
 if j->>'accepted_address' is not null and length(j->>'accepted_address')>2000 then return false; end if;
 if j->>'candidate_provider' is not null and length(j->>'candidate_provider')>128 then return false; end if;
 if j->>'candidate_provider_place_id' is not null and length(j->>'candidate_provider_place_id')>1000 then return false; end if;
 if j->>'candidate_label' is not null and length(j->>'candidate_label')>500 then return false; end if;
 if j->>'candidate_address' is not null and length(j->>'candidate_address')>2000 then return false; end if;
 if j->>'candidate_error_code' is not null and length(j->>'candidate_error_code')>128 then return false; end if;
 if j->>'authored_address_line1' is not null and length(j->>'authored_address_line1')>500 then return false; end if;
 if j->>'authored_address_line2' is not null and length(j->>'authored_address_line2')>500 then return false; end if;
 if j->>'authored_address_locality' is not null and length(j->>'authored_address_locality')>200 then return false; end if;
 if j->>'authored_address_region' is not null and length(j->>'authored_address_region')>200 then return false; end if;
 if j->>'authored_address_postal_code' is not null and length(j->>'authored_address_postal_code')>64 then return false; end if;
 if j->>'authored_address_country' is not null and length(j->>'authored_address_country')>128 then return false; end if;
 if j->>'accepted_address_line1' is not null and length(j->>'accepted_address_line1')>500 then return false; end if;
 if j->>'accepted_address_line2' is not null and length(j->>'accepted_address_line2')>500 then return false; end if;
 if j->>'accepted_address_locality' is not null and length(j->>'accepted_address_locality')>200 then return false; end if;
 if j->>'accepted_address_region' is not null and length(j->>'accepted_address_region')>200 then return false; end if;
 if j->>'accepted_address_postal_code' is not null and length(j->>'accepted_address_postal_code')>64 then return false; end if;
 if j->>'accepted_address_country' is not null and length(j->>'accepted_address_country')>128 then return false; end if;
 has_intent:=exists(select 1 from jsonb_each(j) where key=any(array['authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country']) and value<>'null'::jsonb);
 if has_intent and not public.trip_event_refs_valid(refs,array['authored_label','authored_text','authored_address','accepted_address','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country','accepted_coordinates'],24) then return false; end if;
 for k in select unnest(array['authored_label','authored_text','authored_address','accepted_address','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country']) loop
 if j->>k is not null and not refs ? k then return false; end if; end loop;
 if has_intent then
   for k in select jsonb_object_keys(refs) loop
     if (k='accepted_coordinates' and j->>'accepted_latitude' is null) or (k<>'accepted_coordinates' and j->>k is null) then return false; end if;
   end loop;
 end if;
 if not has_intent and refs is not null and refs<>'null'::jsonb then return false; end if;
 for k in select unnest(array['accepted','candidate']) loop
   lat:=(j->>(k||'_latitude'))::double precision; lng:=(j->>(k||'_longitude'))::double precision;
   if (lat is null)<>(lng is null) or lat is not null and not (lat between -90 and 90 and lng between -180 and 180) then return false; end if;
 end loop;
 if j->>'accepted_latitude' is not null and not refs ? 'accepted_coordinates' then return false; end if;
 has_candidate:=exists(select 1 from jsonb_each(j) where key like 'candidate_%' and value<>'null'::jsonb);
 if not has_candidate then return true; end if;
 if ci is null or ci<>input or state is null or state not in ('PENDING','RESOLVED','AMBIGUOUS','FAILED') then return false; end if;
 if j->>'candidate_provider' is null or length(j->>'candidate_provider')=0 then return false; end if;
 if j->>'candidate_observed_at' is not null and not isfinite((j->>'candidate_observed_at')::timestamptz) then return false; end if;
 if (state in ('RESOLVED','AMBIGUOUS','FAILED')) and (j->>'candidate_observed_at' is null or not isfinite((j->>'candidate_observed_at')::timestamptz)) then return false; end if;
 if (state='FAILED')<>(j->>'candidate_error_code' is not null) then return false; end if;
 if j->>'candidate_confidence' is not null and not ((j->>'candidate_confidence')::numeric between 0 and 1) then return false; end if;
 return true;
end;
$$;
create function public.trip_event_family(j jsonb, prefix text, keys text[])
returns jsonb language sql immutable security invoker set search_path=pg_catalog
as $$ select coalesce(jsonb_object_agg(k,j->(prefix||k)),'{}'::jsonb) from unnest(keys) k $$;
create function public.trip_event_row_valid(j jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$
declare shape text:=j->>'temporal_shape'; a jsonb; b jsonb; loc jsonb; mode_a text; mode_b text;
 n timestamptz:=(j->>'planned_start')::timestamptz; e timestamptz:=(j->>'planned_end')::timestamptz;
begin
 if j->>'temporal_contract_version' is null then return jsonb_strip_nulls(public.trip_event_family(j,'',array['temporal_contract_version','temporal_shape','semantic_revision','timing_label','timing_provenance_ref','participant_scope','legacy_planned_start','legacy_planned_end','legacy_is_estimated_time','legacy_snapshot_at','start_local_date','start_local_time','start_clock_precision','start_quality','start_basis','start_zone_id','start_supplied_offset_seconds','start_source_instant','start_source_instant_precision','start_civil_resolution','start_resolution_offset_seconds','start_interpretation_key','start_interpretation_input_sha256','start_provenance_refs','end_local_date','end_local_time','end_clock_precision','end_quality','end_basis','end_zone_id','end_supplied_offset_seconds','end_source_instant','end_source_instant_precision','end_civil_resolution','end_resolution_offset_seconds','end_interpretation_key','end_interpretation_input_sha256','end_provenance_refs','authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','candidate_input_revision','candidate_provider','candidate_provider_place_id','candidate_place_id','candidate_label','candidate_address','candidate_latitude','candidate_longitude','candidate_confidence','candidate_state','candidate_observed_at','candidate_error_code','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country']))='{}'::jsonb; end if;
 if j->>'temporal_contract_version'<>'1' or shape is null or shape not in ('CALENDAR','POINT','ALL_DAY','SPAN','STAY','TRANSPORT','WINDOW')
   or j->>'semantic_revision' is null or (j->>'semantic_revision')::bigint not between 1 and 9007199254740991 or j->>'participant_scope' is distinct from 'UNASSIGNED' then return false; end if;
 if (j->>'legacy_snapshot_at' is null)<>(j->>'legacy_is_estimated_time' is null) or j->>'legacy_snapshot_at' is null and (j->>'legacy_planned_start' is not null or j->>'legacy_planned_end' is not null) then return false; end if;
 if shape='WINDOW' then
   if j->>'timing_label' is null or length(btrim(j->>'timing_label'))=0 or length(j->>'timing_label')>500
     or not public.trip_event_refs_valid(jsonb_build_object('label',j->'timing_provenance_ref'),array['label'],1) then return false; end if;
 else
   if j->>'timing_label' is not null or j->>'timing_provenance_ref' is not null then return false; end if;
 end if;
 a:=public.trip_event_family(j,'start_',array['local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','civil_resolution','resolution_offset_seconds','interpretation_key','interpretation_input_sha256','provenance_refs']); b:=public.trip_event_family(j,'end_',array['local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','civil_resolution','resolution_offset_seconds','interpretation_key','interpretation_input_sha256','provenance_refs']); loc:=public.trip_event_family(j,'',array['authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','candidate_input_revision','candidate_provider','candidate_provider_place_id','candidate_place_id','candidate_label','candidate_address','candidate_latitude','candidate_longitude','candidate_confidence','candidate_state','candidate_observed_at','candidate_error_code','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country']);
 mode_a:=case when shape='TRANSPORT' then 'UNUSED' when shape in ('CALENDAR','ALL_DAY') then 'DATE' when shape='WINDOW' then 'WINDOW' else 'TIME' end;
 mode_b:=case when shape in ('SPAN','STAY') then 'TIME' else 'UNUSED' end;
 if public.trip_event_boundary_valid(a,case when shape='TRANSPORT' then null else n end,mode_a) is not true or public.trip_event_boundary_valid(b,case when shape='TRANSPORT' then null else e end,mode_b) is not true or public.trip_event_spatial_valid(loc,shape<>'TRANSPORT') is not true then return false; end if;
 if shape in ('SPAN','STAY') and n is not null and e is not null and e<n then return false; end if;
 if shape='STAY' and a->>'local_date' is not null and b->>'local_date' is not null and (b->>'local_date')::date<(a->>'local_date')::date then return false; end if;
 if shape<>'TRANSPORT' and (j->>'is_estimated_time')::boolean is distinct from (coalesce(a->>'quality'='ESTIMATED',false) or coalesce(b->>'quality'='ESTIMATED',false)) then return false; end if;
 return true;
end;
$$;
alter table public.itinerary_events add constraint itinerary_events_semantic_structure check (public.trip_event_row_valid(to_jsonb(itinerary_events.*)) is true);
alter table public.itinerary_transport_endpoints add constraint itinerary_transport_endpoint_structure check (public.trip_event_boundary_valid(public.trip_event_family(to_jsonb(itinerary_transport_endpoints.*),'',array['local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','civil_resolution','resolution_offset_seconds','interpretation_key','interpretation_input_sha256','provenance_refs']),instant,'TIME') is true and public.trip_event_spatial_valid(public.trip_event_family(to_jsonb(itinerary_transport_endpoints.*),'',array['authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','candidate_input_revision','candidate_provider','candidate_provider_place_id','candidate_place_id','candidate_label','candidate_address','candidate_latitude','candidate_longitude','candidate_confidence','candidate_state','candidate_observed_at','candidate_error_code','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country']),true) is true);

create function public.guard_trip_event_semantics()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$
declare before_row jsonb; after_row jsonb; k text; pointer_changed boolean:=false;
begin
 if current_user='otr_trip_event_semantic_writer' then raise exception 'TRIP_EVENT_CANONICAL_WRITES_DISABLED' using errcode='42501'; end if;
 if tg_op='DELETE' then
   if old.temporal_contract_version is not null then raise exception 'TRIP_EVENT_CANONICAL_WRITES_DISABLED' using errcode='42501'; end if;
   return old;
 end if;
 after_row:=to_jsonb(new);
 if tg_op='UPDATE' and old.temporal_contract_version is not null then
   before_row:=to_jsonb(old);
   -- Optional cache pointers only; every remaining fact must match. No trigger-depth exemption.
   if (before_row-array['accepted_place_id','candidate_place_id','place_id','updated_at'])=(after_row-array['accepted_place_id','candidate_place_id','place_id','updated_at']) then
     for k in select unnest(array['accepted_place_id','candidate_place_id','place_id']) loop
       if after_row->>k is distinct from before_row->>k and after_row->>k is not null then raise exception 'TRIP_EVENT_CANONICAL_WRITES_DISABLED' using errcode='42501'; end if;
       pointer_changed:=pointer_changed or (after_row->>k is distinct from before_row->>k);
     end loop;
     if pointer_changed then return new; end if;
   end if;
   raise exception 'TRIP_EVENT_CANONICAL_WRITES_DISABLED' using errcode='42501';
 end if;
 if jsonb_strip_nulls(public.trip_event_family(after_row,'',array['temporal_contract_version','temporal_shape','semantic_revision','timing_label','timing_provenance_ref','participant_scope','legacy_planned_start','legacy_planned_end','legacy_is_estimated_time','legacy_snapshot_at','start_local_date','start_local_time','start_clock_precision','start_quality','start_basis','start_zone_id','start_supplied_offset_seconds','start_source_instant','start_source_instant_precision','start_civil_resolution','start_resolution_offset_seconds','start_interpretation_key','start_interpretation_input_sha256','start_provenance_refs','end_local_date','end_local_time','end_clock_precision','end_quality','end_basis','end_zone_id','end_supplied_offset_seconds','end_source_instant','end_source_instant_precision','end_civil_resolution','end_resolution_offset_seconds','end_interpretation_key','end_interpretation_input_sha256','end_provenance_refs','authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','candidate_input_revision','candidate_provider','candidate_provider_place_id','candidate_place_id','candidate_label','candidate_address','candidate_latitude','candidate_longitude','candidate_confidence','candidate_state','candidate_observed_at','candidate_error_code','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country']))<>'{}'::jsonb then raise exception 'TRIP_EVENT_CANONICAL_WRITES_DISABLED' using errcode='42501'; end if;
 return new;
end;
$$;
create trigger itinerary_event_semantic_guard before insert or update or delete on public.itinerary_events for each row execute function public.guard_trip_event_semantics();

create function public.guard_trip_transport_endpoints()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$
declare k text; pointer_changed boolean:=false;
begin
 if tg_op='UPDATE' and current_user<>'otr_trip_event_semantic_writer' and
   (to_jsonb(old)-array['accepted_place_id','candidate_place_id'])=(to_jsonb(new)-array['accepted_place_id','candidate_place_id']) then
   for k in select unnest(array['accepted_place_id','candidate_place_id']) loop
     if to_jsonb(new)->>k is distinct from to_jsonb(old)->>k and to_jsonb(new)->>k is not null then raise exception 'TRIP_EVENT_CANONICAL_WRITES_DISABLED' using errcode='42501'; end if;
     pointer_changed:=pointer_changed or (to_jsonb(new)->>k is distinct from to_jsonb(old)->>k);
   end loop;
   if pointer_changed then return new; end if;
 end if;
 raise exception 'TRIP_EVENT_CANONICAL_WRITES_DISABLED' using errcode='42501';
end;
$$;
create trigger itinerary_transport_endpoint_guard before insert or update or delete on public.itinerary_transport_endpoints for each row execute function public.guard_trip_transport_endpoints();

-- Fixed read-only classification, independent of caller RLS. Not a mutation entry.
create function public.trip_event_is_canonical(event uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select exists(select 1 from public.itinerary_events where id=event and temporal_contract_version is not null) $$;
create function public.guard_trip_event_participants()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$
begin
 if (tg_op<>'INSERT' and public.trip_event_is_canonical(old.event_id)) or
    (tg_op<>'DELETE' and public.trip_event_is_canonical(new.event_id)) then
   raise exception 'TRIP_EVENT_CANONICAL_WRITES_DISABLED' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
create trigger itinerary_event_participant_semantic_guard before insert or update or delete on public.itinerary_event_participants for each row execute function public.guard_trip_event_participants();

create function public.reject_trip_event_truncate()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ begin raise exception 'TRIP_EVENT_BULK_MUTATION_FORBIDDEN' using errcode='42501'; end $$;
create trigger itinerary_events_truncate_guard before truncate on public.itinerary_events for each statement execute function public.reject_trip_event_truncate();
create trigger itinerary_event_participants_truncate_guard before truncate on public.itinerary_event_participants for each statement execute function public.reject_trip_event_truncate();
create trigger itinerary_transport_endpoints_truncate_guard before truncate on public.itinerary_transport_endpoints for each statement execute function public.reject_trip_event_truncate();

-- Deferred read-only aggregate validation: no canonical writer identity/SQL inputs.
create function public.assert_trip_event_aggregate(event uuid)
returns void language plpgsql security definer set search_path=pg_catalog
as $$
declare parent public.itinerary_events%rowtype; origin public.itinerary_transport_endpoints%rowtype;
 destination public.itinerary_transport_endpoints%rowtype; count_ends integer; linked_trip uuid;
begin
 select * into parent from public.itinerary_events where id=event;
 if not found then return; end if;
 select count(*) into count_ends from public.itinerary_transport_endpoints where event_id=event;
 if parent.temporal_contract_version is null then
   if count_ends<>0 then raise exception 'TRIP_EVENT_AGGREGATE_INVALID' using errcode='23514'; end if;
   return;
 end if;
 if parent.trip_day_id is not null then
   select trip_id into linked_trip from public.trip_days where id=parent.trip_day_id for share;
   if linked_trip is distinct from parent.trip_id then raise exception 'TRIP_EVENT_CROSS_TRIP_LINK' using errcode='23514'; end if;
 end if;
 if parent.reservation_id is not null then
   select trip_id into linked_trip from public.itinerary_reservations where id=parent.reservation_id for share;
   if linked_trip is distinct from parent.trip_id then raise exception 'TRIP_EVENT_CROSS_TRIP_LINK' using errcode='23514'; end if;
 end if;
 if exists(select 1 from public.itinerary_event_participants where event_id=event) then raise exception 'TRIP_EVENT_PARTICIPATION_DISABLED' using errcode='23514'; end if;
 if parent.temporal_shape='TRANSPORT' then
   if count_ends<>2 then raise exception 'TRIP_EVENT_AGGREGATE_INVALID' using errcode='23514'; end if;
   select * into origin from public.itinerary_transport_endpoints where event_id=event and role='ORIGIN';
   select * into destination from public.itinerary_transport_endpoints where event_id=event and role='DESTINATION';
   if parent.planned_start is distinct from origin.instant or parent.planned_end is distinct from destination.instant or
      (origin.instant is not null and destination.instant is not null and destination.instant<origin.instant) or
      parent.is_estimated_time is distinct from (origin.quality='ESTIMATED' or destination.quality='ESTIMATED') then
     raise exception 'TRIP_EVENT_AGGREGATE_INVALID' using errcode='23514';
   end if;
 elsif count_ends<>0 then raise exception 'TRIP_EVENT_AGGREGATE_INVALID' using errcode='23514';
 end if;
end;
$$;
create function public.validate_trip_event_aggregate()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare event uuid;
begin
 if tg_table_name='itinerary_events' then
   if tg_op<>'DELETE' then perform public.assert_trip_event_aggregate(new.id); end if;
 elsif tg_table_name='itinerary_transport_endpoints' then
   if tg_op<>'INSERT' then perform public.assert_trip_event_aggregate(old.event_id); end if;
   if tg_op<>'DELETE' then perform public.assert_trip_event_aggregate(new.event_id); end if;
 else
   for event in select id from public.itinerary_events where temporal_contract_version is not null and
     ((tg_table_name='trip_days' and trip_day_id=new.id) or (tg_table_name='itinerary_reservations' and reservation_id=new.id)) loop
     perform public.assert_trip_event_aggregate(event);
   end loop;
 end if;
 return null;
end;
$$;
create constraint trigger itinerary_event_aggregate_check after insert or update on public.itinerary_events deferrable initially deferred for each row execute function public.validate_trip_event_aggregate();
create constraint trigger itinerary_transport_aggregate_check after insert or update or delete on public.itinerary_transport_endpoints deferrable initially deferred for each row execute function public.validate_trip_event_aggregate();
create constraint trigger trip_day_canonical_link_check after update on public.trip_days deferrable initially deferred for each row execute function public.validate_trip_event_aggregate();
create constraint trigger reservation_canonical_link_check after update on public.itinerary_reservations deferrable initially deferred for each row execute function public.validate_trip_event_aggregate();

alter table public.itinerary_transport_endpoints enable row level security;
create policy "Trip members can read transport endpoints" on public.itinerary_transport_endpoints for select to authenticated
 using (exists(select 1 from public.itinerary_events e where e.id=event_id and (public.is_trip_member(e.trip_id) or public.is_trip_creator(e.trip_id))));
grant select on public.itinerary_transport_endpoints to authenticated,service_role;
revoke all on public.itinerary_transport_endpoints from public,anon,otr_trip_event_semantic_writer;
revoke insert,update,delete,truncate,trigger,references on public.itinerary_transport_endpoints from authenticated,service_role;
revoke truncate,trigger on public.itinerary_events,public.itinerary_event_participants from public,anon,authenticated,service_role;
revoke all on function public.trip_event_refs_valid(jsonb,text[],integer) from public,anon,authenticated,service_role;
revoke all on function public.trip_event_boundary_valid(jsonb,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.trip_event_spatial_valid(jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function public.trip_event_family(jsonb,text,text[]) from public,anon,authenticated,service_role;
revoke all on function public.trip_event_row_valid(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.guard_trip_event_semantics() from public,anon,authenticated,service_role;
revoke all on function public.guard_trip_transport_endpoints() from public,anon,authenticated,service_role;
revoke all on function public.trip_event_is_canonical(uuid) from public,anon,authenticated,service_role;
revoke all on function public.guard_trip_event_participants() from public,anon,authenticated,service_role;
revoke all on function public.reject_trip_event_truncate() from public,anon,authenticated,service_role;
revoke all on function public.assert_trip_event_aggregate(uuid) from public,anon,authenticated,service_role;
revoke all on function public.validate_trip_event_aggregate() from public,anon,authenticated,service_role;
grant execute on function public.trip_event_refs_valid(jsonb,text[],integer) to authenticated,service_role;
grant execute on function public.trip_event_boundary_valid(jsonb,timestamptz,text) to authenticated,service_role;
grant execute on function public.trip_event_spatial_valid(jsonb,boolean) to authenticated,service_role;
grant execute on function public.trip_event_family(jsonb,text,text[]) to authenticated,service_role;
grant execute on function public.trip_event_row_valid(jsonb) to authenticated,service_role;
grant execute on function public.trip_event_is_canonical(uuid) to authenticated,service_role;
-- Reject inherited privilege routes too; fail rather than change unrelated roles.
do $$
declare r text; t text;
begin
 for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','otr_trip_event_semantic_writer') loop
   for t in select unnest(array['itinerary_events','itinerary_event_participants','itinerary_transport_endpoints']) loop
     if has_table_privilege(r,'public.'||t,'TRUNCATE,TRIGGER') then raise exception 'UNSAFE_TRIP_EVENT_BULK_GRANTS'; end if;
   end loop;
 end loop;
end;
$$;
commit;
