begin;
set local search_path=pg_catalog;
-- B-T3H: closed foundation. No runtime credentials or canonical mutation grants.
-- Exact inherited baseline utility inventory; never accept an arbitrary routine by
-- schema, PUBLIC ACL, or name prefix. Fingerprints forbid replacement of a trusted
-- baseline signature. pg_catalog/information_schema and actual extension-member
-- routines are platform capabilities, not application routines. User-created
-- helpers in extensions/auth/storage/any other schema remain in the scan.
create temporary table bt3h_baseline_routines(signature text primary key, definition_sha256 text not null) on commit drop;
insert into bt3h_baseline_routines values
 ('auth.uid()','7c1ff2ecbe653c9358b3115a2607db9573f88a2944ae4eca9e296a89cc5186a7'),
 ('auth.role()','c96a9358b02089b03f3962fd85c5f83c9d64f32240481915c0efe74398dc761b'),
 ('auth.email()','6964175d0bad9d5ea355d2e8c4ad9a99147348b817213e85fcb0d4122a72b621'),
 ('extensions.grant_pg_cron_access()','51f50ae04f511915cee085704371d3244683ae51cc8517e5307a6e784c5a1498'),
 ('extensions.grant_pg_net_access()','159e0cf1781d6487641862d1b91ba1cf9e83fb7a3ca888c7fabf5de783c4c68e'),
 ('extensions.pgrst_ddl_watch()','4b067ac14534d320d90157d2ddf2337a88135681a336e0b7816d838a08a1a1bf'),
 ('extensions.pgrst_drop_watch()','653743446efac2e20a9ae8f57772895578e4b47bb9c6e0f7bf252cf5a6517d52'),
 ('extensions.grant_pg_graphql_access()','aa7cc9ab9608e32140017467cc7ab76c9aa6a328941682fb4aa1639d6dbeae10'),
 ('extensions.set_graphql_placeholder()','3c713c1d08553bcb96545a278c0ed60310621433dba2bc63f410674f0ef1c691'),
 ('graphql_public.graphql(text,text,jsonb,jsonb)','62b09c65abb4755df514ce62bd736c05446d2644943b584ae2513334f44dbd08'),
 ('realtime.apply_rls(jsonb,integer)','b455782c3c10fe5f7d36d9b4f27ad531191fb7693ce55dd88cc639e8bf36ea83'),
 ('realtime.broadcast_changes(text,text,text,text,text,record,record,text)','8a79db74092ebe9363317a96e97cd5e558be40ba83497214867e80ec0ac0f340'),
 ('realtime.build_prepared_statement_sql(text,regclass,realtime.wal_column[])','46923b06f4d06e66bed424b6da25bd00d5f70472ff398d35d2ae50f3634359ba'),
 ('realtime."cast"(text,regtype)','66045bb2d0564fbee8ce156ddd29bf5ff554614c755f9a66902dbff131721993'),
 ('realtime.check_equality_op(realtime.equality_op,regtype,text,text)','bc47685b70704c535aa1f7ae9b36e1a2d7a379499ee70462f4fa4f06e6bef98b'),
 ('realtime.check_equality_op(realtime.equality_op,regtype,text,text,boolean)','4579e8273553e43f102fb70a03872ff3dab25408895af3184907e76a04cf06f9'),
 ('realtime.is_visible_through_filters(realtime.wal_column[],realtime.user_defined_filter[])','4583a3c4c0425a65597a33472f7efab296765665db5c2cef5b309f84adafc1b5'),
 ('realtime.list_changes(name,name,integer,integer)','6ecaa7b9145a223931a3e5d6a0275750fc663fe90d56bbb353a2963eb2b935eb'),
 ('realtime.quote_wal2json(regclass)','3217b2be7b664a0a6c2efd2438c59c430962a7c2b302816c928467b30d491cc0'),
 ('realtime.send(jsonb,text,text,boolean)','a59ff7fd7608eb6b987fbeb20e49aacb0b29f7ee75dbf5046e10bc5f1d058f33'),
 ('realtime.send_binary(bytea,text,text,boolean)','73a170d9b813d8e1835c1484bc46c9e06ab9038c8910e5b5789d994146d373b9'),
 ('realtime.subscription_check_filters()','79e69e7218dfb335ebf6379ad3f83d18a424ba6cc271a4ee9bd8364cd190cd68'),
 ('realtime.to_regrole(text)','5b8fa2a5c1bbcbcc5ad4f32d3f2f5ead185baa2d1e06be61e90b4d1f921b3213'),
 ('realtime.topic()','c8a1609e4a106628e2b3eb7cdaa1e94c974c7765af29ccaa12baf99ae56a24be'),
 ('realtime.wal2json_escape_identifier(text)','70417679bcf36d499a8332bd52246a185f52e53ea7e4c78e3b7d5891d73a81a0'),
 ('storage.foldername(text)','a673a01626cb42e9eb507eb18e4cb038ce5db1da875a22e254df2ebb597bd2bc'),
 ('storage.filename(text)','6616e7416f58bfe6bcb2a58f1da44477d79e1383430a958dd6b2b854668817f0'),
 ('storage.extension(text)','839c088c388a275fdfd10d7d909f12b55e643c8ba8a2c6ef674b62c641113b94'),
 ('storage.get_size_by_bucket()','168d8328dcbb9f03b700957b8ca4160fe9893948c682959225e01781056962e5'),
 ('storage.search(text,text,integer,integer,integer,text,text,text)','ec649f210293421d628962ca816d8e7c0f1b7f5d0a5c6b23b7c241fd96f1cc85'),
 ('storage.update_updated_at_column()','5b3d8ac75beaf9d1532159c055aa927297f5611ad2ea82c27dbadf76887bb25e'),
 ('storage.can_insert_object(text,text,uuid,jsonb)','d6a14645c2a2a394b759f3fb6bbbe5b67cceb6b8c4229a3e7e6c27e1f98c25cf'),
 ('storage.list_multipart_uploads_with_delimiter(text,text,text,integer,text,text)','2fe210749b98e9d73a1f49701b978e017c1200715fe8ff9b8508b134f3ddfd47'),
 ('storage.operation()','45b3c213bf286ff7601da09fd91d246339d8c79e0bd573bfb6984d806841fcde'),
 ('storage.enforce_bucket_name_length()','bf9dcf9beab8062d27f9f6f5db850fac0c22423d6d62d31a3fe9622b1244336e'),
 ('storage.get_common_prefix(text,text,text)','876b1259bea7051b5af1a6c8228652ea5126112bf8a81a3d73948075cdaac790'),
 ('storage.list_objects_with_delimiter(text,text,text,integer,text,text,text)','5350021479629d01cb5ac66126ceb81919e29ed1297276a9080d1991999e676e'),
 ('storage.search_v2(text,text,integer,integer,text,text,text,text)','a56e65d9ee3552e8b543f788230cccbe3b2b5dfd4d5cf6b78e5d245c5369130f'),
 ('storage.search_by_timestamp(text,text,integer,integer,text,text,text,text)','97ec997b1ab15993052c7b0334d020e0c99f440dd722b60f23e6d6ad970d8df4'),
 ('storage.protect_delete()','60b634ed07bf3c08749b31168c62d598f2a9d10f8cef4ee8251bde93909cd30b'),
 ('storage.allow_only_operation(text)','a12f88ff4e00a9a63c24a93ea5b120e790be63a3555e840656c6525ff6dc0a85'),
 ('storage.allow_any_operation(text[])','a4ae3c8d1258ced584d91fed4bf7a9b0729937dd07cfe7d5fe45b2808a12b966'),
 ('auth.jwt()','7ce3ad8fb99f7ad5f5cd869fbd5479a6325e9444da472c26394cfa66c83b2d11'),
 ('public.touch_updated_at()','f5e4c4fbdb433e5e08c763615167420b4e89e56073bd620e4431eda71a725b3f'),
 ('public.touch_journey_chat_message_updated_at()','68944495795e6e9ede756119edec24e16bc8647f53ae5f8f44ca6f3abfb89e2e'),
 ('public.ledger_stale_corrections_after_expense_update()','dc51e11e278f542e133f9eebe1d291e63a0982039c1efd5ecfd887356555ee71'),
 ('public.ledger_apply_economic_date()','4fff2fdb842ea303d9065fcc1985bf52262d3980339dfea6d41338d75bfd48ee'),
 ('public.ledger_guard_journey_currency()','d700bbc9da3e48e24ae7267ad597487d1ffff9baca99bb3c3300ccd04c3d032f'),
 ('public.ledger_currency_serialize_input()','85268938d408da3a041a6e9e7f2717f80fb2d5a8fd47ea6dcadee5fc6d613052'),
 ('public.ledger_limit_expense_attachments()','74288bdb6f2ecacbb8fc3f0a5ffcb11b513741e1c375db99787f30fa5012aabb');

do $$
declare role_name text; r record; unexpected text;
begin
 foreach role_name in array array['otr_trip_event_collection_maintainer','otr_trip_event_collection_gateway','otr_trip_event_collection_reader'] loop
  if not exists(select 1 from pg_roles where rolname=role_name) then
   execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',role_name);
  end if;
  select * into r from pg_roles where rolname=role_name;
  -- Ownership is DDL authority across every catalog, including shared objects
  -- and objects in other databases. The accepted baseline owns nothing.
  if exists(select 1 from pg_shdepend d where d.refclassid='pg_authid'::regclass
   and d.refobjid=r.oid and d.deptype='o') then
   raise exception 'UNSAFE_TRIP_EVENT_COLLECTION_OWNERSHIP: %',role_name;
  end if;
  if r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolbypassrls or r.rolreplication
   or exists(select 1 from pg_auth_members m where m.member=r.oid or m.roleid=r.oid
     and (m.set_option or m.inherit_option or m.member<>(select oid from pg_roles where rolname='postgres')))
   or exists(select 1 from pg_proc where proowner=r.oid)
   or exists(select 1 from pg_class where relowner=r.oid)
   or exists(select 1 from pg_namespace where nspowner=r.oid)
   or exists(select 1 from pg_namespace n where n.nspname not in ('pg_catalog','information_schema')
    and n.nspname !~ '^pg_(toast|temp)' and has_schema_privilege(role_name,n.oid,'CREATE')) then
    raise exception 'UNSAFE_TRIP_EVENT_COLLECTION_ROLE: %',role_name;
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and c.relkind in ('r','p','v','m','f') and
    (has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and has_column_privilege(role_name,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) then
   raise exception 'UNSAFE_TRIP_EVENT_COLLECTION_GRANTS: %',role_name;
  end if;
  select p.oid::regprocedure::text into unexpected from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
    and p.prokind in ('f','p') and not exists(select 1 from pg_depend d
      where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege(role_name,p.oid,'EXECUTE') and not exists(select 1 from bt3h_baseline_routines b
      where to_regprocedure(b.signature)=p.oid and b.definition_sha256=encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) limit 1;
  unexpected:=coalesce(unexpected,(select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
     and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
     and case when c.relkind='S' then has_sequence_privilege(role_name,c.oid,'USAGE,SELECT,UPDATE') else false end limit 1));
  if unexpected is not null then
   raise exception 'UNSAFE_TRIP_EVENT_COLLECTION_CAPABILITY: % [%]',role_name,unexpected;
  end if;
  -- Explicit default ACLs must not grant any reserved identity or PUBLIC objects.
  -- Normal implicit PUBLIC EXECUTE at CREATE FUNCTION is revoked on our new
  -- routines; explicit global/schema default grants are incompatible state.
  if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclobjtype in ('r','S','f') and (a.grantee=0 or a.grantee=r.oid
    or a.grantee<>0 and pg_has_role(role_name,a.grantee,'USAGE'))) then
   raise exception 'UNSAFE_TRIP_EVENT_COLLECTION_DEFAULT_GRANTS: %',role_name;
  end if;
 end loop;
end $$;

-- Exact dependency identity/body inventory before granting newly usable helpers.
-- A same-signature hostile admission/validator replacement is not trusted.
do $$
declare dep record; oid_value oid;
begin
 for dep in select * from (values
 ('public.trip_event_refs_valid(jsonb,text[],integer)','postgres','b3caa9fc93914d50a05f96692d3ae217004a9225a1f7ba7fab47dcb68896d75a'),
 ('public.trip_event_boundary_valid(jsonb,timestamptz,text)','postgres','cb43dfa15106ffb59d54e9f1cf4cf8b6f28b2f358c8bd3b31b4337aebaaa31c7'),
 ('public.trip_event_spatial_valid(jsonb,boolean)','postgres','c338bffd72c0eef7b2cce46837b665c04a3a8fd424788f0427840609939d20ed'),
 ('public.trip_event_family(jsonb,text,text[])','postgres','4fe6f4c76a9d83d58906ac7c72e2cef5f369c62eeb758e380c9155aec80efcd0'),
 ('public.trip_event_row_valid(jsonb)','postgres','3508182efd0461fe15e9913b1dbf0c3f115cbca5f0165441941d0c0ae023d5c3'),
 ('public.trip_event_admission(uuid,uuid,boolean)','otr_trip_event_receipt_reader','234f1ae04e28f9caee9617cc00e0a19f2805c609d21c462a64e61d7c7df26b0d')
 ) dependencies(signature,owner_name,definition_sha256) loop
  oid_value:=to_regprocedure(dep.signature);
  if oid_value is null or not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=oid_value and r.rolname=dep.owner_name
   and encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')=dep.definition_sha256) then
   raise exception 'UNSAFE_TRIP_EVENT_COLLECTION_DEPENDENCY: %',dep.signature;
  end if;
 end loop;
end $$;

-- Migration-only ownership rights; revoked before commit. No runtime principal.
grant otr_trip_event_collection_maintainer,otr_trip_event_collection_reader to postgres with set true;
grant create on schema public to otr_trip_event_collection_maintainer,otr_trip_event_collection_reader;
create table public.trip_event_collection_state (
 trip_id uuid primary key references public.trips(id) on delete cascade,
 epoch_id uuid not null default gen_random_uuid(),
 collection_revision bigint not null default 1 check(collection_revision between 1 and 9007199254740991)
);
revoke all on public.trip_event_collection_state from public,anon,authenticated,service_role;
alter table public.trip_event_collection_state enable row level security;
-- Initialize under the migration owner before transferring ownership.
insert into public.trip_event_collection_state(trip_id) select id from public.trips;
alter table public.trip_event_collection_state owner to otr_trip_event_collection_maintainer;
create policy trip_event_collection_maintenance on public.trip_event_collection_state to otr_trip_event_collection_maintainer using(true) with check(true);
create policy trip_event_collection_read on public.trip_event_collection_state for select to otr_trip_event_collection_reader using(true);
grant usage on schema public to otr_trip_event_collection_maintainer,otr_trip_event_collection_reader,otr_trip_event_collection_gateway;
grant select on public.trip_event_collection_state,public.itinerary_events,public.itinerary_transport_endpoints,public.itinerary_event_participants to otr_trip_event_collection_reader;
grant select(id,trip_id,temporal_contract_version) on public.itinerary_events to otr_trip_event_collection_maintainer;
create policy trip_event_collection_root_reader on public.itinerary_events for select to otr_trip_event_collection_reader,otr_trip_event_collection_maintainer using(true);
create policy trip_event_collection_endpoint_reader on public.itinerary_transport_endpoints for select to otr_trip_event_collection_reader using(true);
create policy trip_event_collection_participant_reader on public.itinerary_event_participants for select to otr_trip_event_collection_reader using(true);

-- No Event facts are changed when assigning a namespace to existing Trips.
create function public.trip_event_collection_initialize() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin insert into public.trip_event_collection_state(trip_id) values(new.id); return new; end $$;
alter function public.trip_event_collection_initialize() owner to otr_trip_event_collection_maintainer;
create trigger trip_event_collection_initialize after insert on public.trips for each row execute function public.trip_event_collection_initialize();

-- Native UPDATE serializes concurrent increments and rolls back with its writer.
-- Projection equality excludes candidates/timestamps, never accepted Place refs.
create function public.trip_event_collection_changed() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb; b jsonb; keys text[]; affected uuid; parent uuid; ids uuid[]:=array[]::uuid[];
begin
 if tg_op<>'INSERT' then a:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then b:=to_jsonb(new); end if;
 if tg_table_name='itinerary_events' then
  keys:=array['id','trip_id','temporal_contract_version','temporal_shape','semantic_revision','title','description','event_type','status','order_index','trip_day_id','reservation_id','participant_scope','timing_label','timing_provenance_ref','planned_start','planned_end','is_estimated_time','legacy_planned_start','legacy_planned_end','legacy_is_estimated_time','legacy_snapshot_at','start_local_date','start_local_time','start_clock_precision','start_quality','start_basis','start_zone_id','start_supplied_offset_seconds','start_source_instant','start_source_instant_precision','start_civil_resolution','start_resolution_offset_seconds','start_interpretation_key','start_interpretation_input_sha256','start_provenance_refs','end_local_date','end_local_time','end_clock_precision','end_quality','end_basis','end_zone_id','end_supplied_offset_seconds','end_source_instant','end_source_instant_precision','end_civil_resolution','end_resolution_offset_seconds','end_interpretation_key','end_interpretation_input_sha256','end_provenance_refs','authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country'];
  if tg_op='UPDATE' and (select jsonb_object_agg(k,a->k) from unnest(keys) k) is not distinct from
       (select jsonb_object_agg(k,b->k) from unnest(keys) k) then return null; end if;
  if a->>'temporal_contract_version' is not null then ids:=array_append(ids,(a->>'trip_id')::uuid); end if;
  if b->>'temporal_contract_version' is not null then ids:=array_append(ids,(b->>'trip_id')::uuid); end if;
 else
  keys:=case when tg_table_name='itinerary_transport_endpoints' then array['event_id','role','instant','local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','civil_resolution','resolution_offset_seconds','interpretation_key','interpretation_input_sha256','provenance_refs','authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country'] else null end;
  if tg_op='UPDATE' and (case when keys is null then a else (select jsonb_object_agg(k,a->k) from unnest(keys) k) end)
    is not distinct from (case when keys is null then b else (select jsonb_object_agg(k,b->k) from unnest(keys) k) end) then return null; end if;
  for parent in select distinct v from unnest(array[(a->>'event_id')::uuid,(b->>'event_id')::uuid]) v where v is not null loop
   select trip_id into affected from public.itinerary_events where id=parent and temporal_contract_version is not null;
   if found then ids:=array_append(ids,affected); end if;
  end loop;
 end if;
 for affected in select distinct v from unnest(ids) v order by v loop
  update public.trip_event_collection_state set collection_revision=collection_revision+1
    where trip_id=affected and collection_revision<9007199254740991;
  if not found then raise exception 'EVENT_COLLECTION_REVISION_UNAVAILABLE_OR_OVERFLOW'; end if;
 end loop;
 return null;
end $$;
alter function public.trip_event_collection_changed() owner to otr_trip_event_collection_maintainer;
create trigger trip_event_collection_root_changed after insert or update or delete on public.itinerary_events for each row execute function public.trip_event_collection_changed();
create trigger trip_event_collection_endpoint_changed after insert or update or delete on public.itinerary_transport_endpoints for each row execute function public.trip_event_collection_changed();
create trigger trip_event_collection_participant_changed after insert or update or delete on public.itinerary_event_participants for each row execute function public.trip_event_collection_changed();

-- A single authoritative statement supplies admission, unfiltered canonical rows,
-- participant absence, aggregate validity and counter. Backend hashes all rows
-- before slicing pages; this is not a capped PostgREST list or a page session.
create function public.trip_event_collection_observe(actor uuid,trip uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' set extra_float_digits=3 as $$
declare result jsonb;
begin
 if session_user<>'otr_trip_event_collection_gateway' then raise exception 'READ_UNAVAILABLE' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' or pg_is_in_recovery() then raise exception 'COLLECTION_CERTIFICATION_UNAVAILABLE'; end if;
 with roots as materialized (
  select e.*,to_jsonb(e) facts from public.itinerary_events e where e.trip_id=trip and e.temporal_contract_version is not null
 ), ends as materialized (
  select t.*,to_jsonb(t) facts from public.itinerary_transport_endpoints t join roots r on r.id=t.event_id
 ), admission as materialized (select public.trip_event_admission(actor,trip,false) allowed),
 observed as materialized (select epoch_id,collection_revision from public.trip_event_collection_state where trip_id=trip),
 eligibility as materialized (
  select not exists(select 1 from roots r where r.temporal_contract_version<>1 or r.participant_scope is distinct from 'UNASSIGNED')
   and not exists(select 1 from public.itinerary_event_participants p join roots r on r.id=p.event_id) supported
 ), validity as materialized (
  select not exists(select 1 from ends t where public.trip_event_boundary_valid(t.facts,t.instant,'TIME') is not true or public.trip_event_spatial_valid(t.facts,true) is not true)
  and not exists(select 1 from roots r where public.trip_event_row_valid(r.facts) is not true
   or (r.temporal_shape='TRANSPORT' and ((select count(*) from ends t where t.event_id=r.id)<>2
    or r.planned_start is distinct from (select instant from ends t where t.event_id=r.id and role='ORIGIN')
    or r.planned_end is distinct from (select instant from ends t where t.event_id=r.id and role='DESTINATION')
    or (r.planned_start is not null and r.planned_end is not null and r.planned_end<r.planned_start)
    or r.is_estimated_time is distinct from (select bool_or(quality='ESTIMATED') from ends t where t.event_id=r.id)))
   or (r.temporal_shape<>'TRANSPORT' and exists(select 1 from ends t where t.event_id=r.id))) valid
 ), payload as (
  select coalesce(jsonb_agg(jsonb_build_object('readVersion',1,'disposition','READ_ONLY','legacyCompatible',false,
   'event',(select jsonb_object_agg(k,r.facts->k) from unnest(array['id','trip_id','temporal_contract_version','temporal_shape','semantic_revision','title','description','event_type','status','order_index','trip_day_id','reservation_id','participant_scope','timing_label','timing_provenance_ref','planned_start','planned_end','is_estimated_time','legacy_planned_start','legacy_planned_end','legacy_is_estimated_time','legacy_snapshot_at','start_local_date','start_local_time','start_clock_precision','start_quality','start_basis','start_zone_id','start_supplied_offset_seconds','start_source_instant','start_source_instant_precision','start_civil_resolution','start_resolution_offset_seconds','start_interpretation_key','start_interpretation_input_sha256','start_provenance_refs','end_local_date','end_local_time','end_clock_precision','end_quality','end_basis','end_zone_id','end_supplied_offset_seconds','end_source_instant','end_source_instant_precision','end_civil_resolution','end_resolution_offset_seconds','end_interpretation_key','end_interpretation_input_sha256','end_provenance_refs','authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country']) k)||jsonb_build_object('itinerary_transport_endpoints',
     (select coalesce(jsonb_agg((select jsonb_object_agg(k,t.facts->k) from unnest(array['event_id','role','instant','local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','civil_resolution','resolution_offset_seconds','interpretation_key','interpretation_input_sha256','provenance_refs','authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country']) k) order by t.role collate "C"),'[]'::jsonb) from ends t where t.event_id=r.id))) order by r.id),'[]'::jsonb) events from roots r
 )
 select case when not (select allowed from admission) then jsonb_build_object('error','READ_UNAVAILABLE')
  when not exists(select 1 from observed) then jsonb_build_object('disposition','WITHHELD','reason','COLLECTION_CERTIFICATION_UNAVAILABLE')
  when not (select supported from eligibility) then jsonb_build_object('disposition','WITHHELD','reason','UNSUPPORTED_EVENT_CONTRACT')
  when (select count(*) from roots)>10000 then jsonb_build_object('error','CANONICAL_EVENT_SNAPSHOT_LIMIT')
  when not (select valid from validity) then jsonb_build_object('error','CANONICAL_EVENT_SNAPSHOT_INVALID')
  else jsonb_build_object('disposition','OBSERVATION','snapshot',(select jsonb_build_object('epochId',epoch_id,'collectionRevision',collection_revision::text) from observed),'events',(select events from payload)) end into result;
 if result ? 'error' then raise exception '%',result->>'error'; end if;
 return result;
end $$;
alter function public.trip_event_collection_observe(uuid,uuid) owner to otr_trip_event_collection_reader;
-- Admission remains the existing fixed B predicate, with a read-only capability.
grant otr_trip_event_receipt_reader to postgres with set true;
set local role otr_trip_event_receipt_reader;
grant execute on function public.trip_event_admission(uuid,uuid,boolean) to otr_trip_event_collection_reader;
reset role;
grant otr_trip_event_receipt_reader to postgres with set false,inherit false;
grant execute on function public.trip_event_row_valid(jsonb),
 public.trip_event_family(jsonb,text,text[]),public.trip_event_boundary_valid(jsonb,timestamptz,text),
 public.trip_event_spatial_valid(jsonb,boolean),public.trip_event_refs_valid(jsonb,text[],integer) to otr_trip_event_collection_reader;
grant usage on schema extensions to otr_trip_event_collection_reader;
grant execute on function extensions.digest(bytea,text) to otr_trip_event_collection_reader;
revoke all on function public.trip_event_collection_observe(uuid,uuid),public.trip_event_collection_initialize(),public.trip_event_collection_changed() from public,anon,authenticated,service_role;
grant execute on function public.trip_event_collection_observe(uuid,uuid) to otr_trip_event_collection_gateway;
revoke create on schema public from otr_trip_event_collection_maintainer,otr_trip_event_collection_reader;
-- Retain only trusted creator administration for clean DB replay; no SET/INHERIT.
grant otr_trip_event_collection_maintainer,otr_trip_event_collection_reader to postgres with set false,inherit false;
commit;
