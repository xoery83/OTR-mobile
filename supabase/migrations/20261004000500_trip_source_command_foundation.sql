begin;
set local search_path=pg_catalog;
-- C-I3D: closed foundation. No runtime credentials or canonical mutation grants.
-- Exact inherited baseline utility inventory; never accept an arbitrary routine by
-- schema, PUBLIC ACL, or name prefix. Fingerprints forbid replacement of a trusted
-- baseline signature. pg_catalog/information_schema and actual extension-member
-- routines are platform capabilities, not application routines. User-created
-- helpers in extensions/auth/storage/any other schema remain in the scan.
create temporary table ci3d_baseline_routines(signature text primary key, definition_sha256 text not null) on commit drop;
insert into ci3d_baseline_routines values
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
 foreach role_name in array array['otr_trip_source_writer','otr_trip_source_command_gateway','otr_trip_source_operation_reader'] loop
  if not exists(select 1 from pg_roles where rolname=role_name) then
   execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',role_name);
  end if;
  select * into r from pg_roles where rolname=role_name;
  -- Ownership is DDL authority across every catalog, including shared objects
  -- and objects in other databases. The accepted baseline owns nothing.
  if exists(select 1 from pg_shdepend d where d.refclassid='pg_authid'::regclass
   and d.refobjid=r.oid and d.deptype='o') then
   raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_OWNERSHIP: %',role_name;
  end if;
  if r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolbypassrls or r.rolreplication
   or exists(select 1 from pg_auth_members m where m.member=r.oid or m.roleid=r.oid
     and (m.set_option or m.inherit_option or m.member<>(select oid from pg_roles where rolname='postgres')))
   or exists(select 1 from pg_proc where proowner=r.oid)
   or exists(select 1 from pg_class where relowner=r.oid)
   or exists(select 1 from pg_namespace where nspowner=r.oid)
   or exists(select 1 from pg_namespace n where n.nspname not in ('pg_catalog','information_schema')
    and n.nspname !~ '^pg_(toast|temp)' and has_schema_privilege(role_name,n.oid,'CREATE')) then
    raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_ROLE: %',role_name;
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and c.relkind in ('r','p','v','m','f') and
    (has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and has_column_privilege(role_name,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) then
   raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_GRANTS: %',role_name;
  end if;
  select p.oid::regprocedure::text into unexpected from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
    and p.prokind in ('f','p') and not exists(select 1 from pg_depend d
      where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege(role_name,p.oid,'EXECUTE') and not exists(select 1 from ci3d_baseline_routines b
      where to_regprocedure(b.signature)=p.oid and b.definition_sha256=encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) limit 1;
  unexpected:=coalesce(unexpected,(select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
     and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
     and case when c.relkind='S' then has_sequence_privilege(role_name,c.oid,'USAGE,SELECT,UPDATE') else false end limit 1));
  if unexpected is not null then
   raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_CAPABILITY: % [%]',role_name,unexpected;
  end if;
  -- Explicit default ACLs must not grant any reserved identity or PUBLIC objects.
  -- Normal implicit PUBLIC EXECUTE at CREATE FUNCTION is revoked on our new
  -- routines; explicit global/schema default grants are incompatible state.
  if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclobjtype in ('r','S','f') and (a.grantee=0 or a.grantee=r.oid
    or a.grantee<>0 and pg_has_role(role_name,a.grantee,'USAGE'))) then
   raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_DEFAULT_GRANTS: %',role_name;
  end if;
 end loop;
end $$;

-- C-I3C F: private operational state; material is never copied into receipts.
grant otr_trip_source_writer,otr_trip_source_operation_reader to postgres with set true;
grant create on schema public to otr_trip_source_writer,otr_trip_source_operation_reader;
create table public.trip_source_command_gate (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false constraint trip_source_gate_closed check(not enabled)
);
insert into public.trip_source_command_gate values(true,false);
create table public.trip_source_operations (
 id uuid primary key,
 trip_id uuid not null references public.trips on delete restrict,
 actor_account_id uuid not null references auth.users on delete restrict,
 source_id uuid not null references public.trip_sources on delete restrict deferrable initially deferred,
 operation_key text not null check(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 contract_version smallint not null check(contract_version=1),
 command text not null check(command in ('ACQUIRE_SOURCE','PREPARE_REPRESENTATION','VERIFY_REPRESENTATION','REPLACE_MATERIAL','MARK_REPRESENTATION_LOST','RECOVER_REPRESENTATION','UPLOAD_ORIGINAL')),
 operation_sha256 text not null check(operation_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 material_revision bigint not null check(material_revision between 1 and 9007199254740991),
 representation_id uuid not null,
 expected_source_row_revision bigint check(expected_source_row_revision between 1 and 9007199254740991),
 expected_source_lifecycle text check(expected_source_lifecycle='ACTIVE'),
 expected_source_retention_state text check(expected_source_retention_state='RETAINED'),
 expected_representation_row_revision bigint check(expected_representation_row_revision between 1 and 9007199254740991),
 expected_representation_remote_state text check(expected_representation_remote_state in ('PENDING','VERIFIED','LOST')),
 expected_representation_retention_state text check(expected_representation_retention_state='RETAINED'),
 bound_payload_sha256 text check(bound_payload_sha256 ~ '^[0-9a-f]{64}$'),
 bound_byte_count bigint check(bound_byte_count between 1 and 52428800),
 bound_mime_type text check(bound_mime_type in ('application/pdf','image/jpeg','image/png','image/heic','image/heif')),
 parent_operation_id uuid references public.trip_source_operations on delete restrict,
 phase text not null check(phase in ('ADMITTED','IO_ACTIVE','IO_UNKNOWN','IO_QUIESCENT','FINAL')),
 attempt_generation bigint not null default 1 check(attempt_generation between 1 and 9007199254740991),
 attempt_id uuid,
 worker_identity text check(char_length(worker_identity) between 1 and 128),
 admitted_at timestamptz(6) check(isfinite(admitted_at)),
 io_finished_at timestamptz(6) check(isfinite(io_finished_at)),
 outcome text check(outcome in ('APPLIED','UNCHANGED','REJECTED')),
 error_code text check(error_code in ('SOURCE_CAS_CONFLICT','REPRESENTATION_CAS_CONFLICT','PRIOR_STATE_CONFLICT','OBJECT_CONTENT_CONFLICT','MATERIAL_INTEGRITY_MISMATCH','SOURCE_IO_UNAVAILABLE')),
 completed_at timestamptz(6) check(isfinite(completed_at)),
 result_source_row_revision bigint check(result_source_row_revision between 1 and 9007199254740991),
 result_material_revision bigint check(result_material_revision between 1 and 9007199254740991),
 result_representation_row_revision bigint check(result_representation_row_revision between 1 and 9007199254740991),
 result_remote_state text check(result_remote_state in ('PENDING','VERIFIED','LOST','NOT_APPLICABLE')),
 result_retention_state text check(result_retention_state='RETAINED'),
 result_action_id uuid references public.trip_source_actions on delete restrict,
 result_verified_at timestamptz(6) check(isfinite(result_verified_at)),
 result_sha256 text check(result_sha256 ~ '^[0-9a-f]{64}$'),
 unique(trip_id,actor_account_id,operation_key),
 check((command='ACQUIRE_SOURCE')=(expected_source_row_revision is null)),
 check((expected_source_row_revision is null)=(expected_source_lifecycle is null) and (expected_source_row_revision is null)=(expected_source_retention_state is null)),
 check((command in ('ACQUIRE_SOURCE','REPLACE_MATERIAL'))=(expected_representation_row_revision is null)),
 check((expected_representation_row_revision is null)=(expected_representation_remote_state is null) and (expected_representation_row_revision is null)=(expected_representation_retention_state is null)),
 check((bound_payload_sha256 is null)=(bound_byte_count is null) and (bound_payload_sha256 is null)=(bound_mime_type is null)),
 check(command not in ('VERIFY_REPRESENTATION','MARK_REPRESENTATION_LOST','RECOVER_REPRESENTATION','UPLOAD_ORIGINAL') or bound_payload_sha256 is not null or coalesce(outcome='REJECTED',false)),
 check((command='UPLOAD_ORIGINAL')=(parent_operation_id is not null)),
 check((attempt_id is null)=(worker_identity is null) and (attempt_id is null)=(admitted_at is null)),
 check(phase not in ('IO_ACTIVE','IO_UNKNOWN','IO_QUIESCENT') or attempt_id is not null),
 check(phase='FINAL' or (phase='IO_QUIESCENT')=(io_finished_at is not null)),
 check(io_finished_at is null or io_finished_at>=admitted_at),
 check((phase='FINAL')=(outcome is not null) and (phase='FINAL')=(completed_at is not null) and (phase='FINAL')=(result_sha256 is not null)),
 check(phase='FINAL' or error_code is null and result_source_row_revision is null and result_material_revision is null and result_representation_row_revision is null and result_remote_state is null and result_retention_state is null and result_action_id is null and result_verified_at is null),
 check(outcome is null or (outcome='REJECTED')=(error_code is not null)),
 check(outcome is null or outcome='REJECTED' and result_source_row_revision is null and result_material_revision is null and result_representation_row_revision is null and result_remote_state is null and result_retention_state is null and result_action_id is null and result_verified_at is null or outcome in ('APPLIED','UNCHANGED') and result_source_row_revision is not null and result_material_revision is not null and result_representation_row_revision is not null and result_remote_state is not null and result_retention_state is not null)
);
-- Rejected operations may name a never-created descriptor; successful pins are
-- checked transactionally. Source/Account/Trip/parent/Action history uses RESTRICT.
create unique index trip_source_exclusive_io on public.trip_source_operations(representation_id)
 where command in ('UPLOAD_ORIGINAL','RECOVER_REPRESENTATION') and phase in ('ADMITTED','IO_ACTIVE','IO_UNKNOWN');
-- Check effective newly materialized default ACLs BEFORE normal API revocation.
-- Never sanitize a PUBLIC/reserved-role default capability and call reuse safe.
do $$ declare role_name text;
begin
 foreach role_name in array array['otr_trip_source_writer','otr_trip_source_command_gateway','otr_trip_source_operation_reader'] loop
  if exists(select 1 from pg_class c where c.oid=any(array['public.trip_source_command_gate'::regclass,'public.trip_source_operations'::regclass])
   and (has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
     and has_column_privilege(role_name,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) then
   raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_DEFAULT_GRANTS: %',role_name;
  end if;
 end loop;
end $$;
revoke all on public.trip_source_command_gate,public.trip_source_operations from public,anon,authenticated,service_role;
alter table public.trip_source_command_gate enable row level security;
alter table public.trip_source_command_gate force row level security;
alter table public.trip_source_operations enable row level security;
alter table public.trip_source_operations force row level security;
grant usage on schema public,extensions to otr_trip_source_writer,otr_trip_source_operation_reader,otr_trip_source_command_gateway;
grant select on public.trip_source_command_gate to otr_trip_source_writer;
create policy trip_source_gate_read on public.trip_source_command_gate for select to otr_trip_source_writer using(true);
grant select on public.trip_source_operations,public.trip_sources,public.trips,public.trip_members,public.journey_members to otr_trip_source_operation_reader;
create policy trip_source_operation_read on public.trip_source_operations for select to otr_trip_source_operation_reader using(true);
create policy trip_source_owner_read on public.trip_sources for select to otr_trip_source_operation_reader using(true);
create policy trip_source_trip_read on public.trips for select to otr_trip_source_operation_reader using(true);
create policy trip_source_legacy_admission_read on public.trip_members for select to otr_trip_source_operation_reader using(true);
create policy trip_source_person_admission_read on public.journey_members for select to otr_trip_source_operation_reader using(true);
create function public.trip_source_hash(prefix text, value jsonb) returns text
language sql immutable security invoker set search_path=pg_catalog
as $$ select encode(extensions.digest(convert_to(prefix||E'\n'||public.trip_event_canonical_json(value::json),'UTF8'),'sha256'),'hex') $$;

create function public.trip_source_payload_tuple(family text,p jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog
as $$ declare pins jsonb; descriptor jsonb; capture jsonb; input jsonb; keys text[];
begin
 if family='UPLOAD_ORIGINAL' then
  keys:=array['material_revision','expected_source_row_revision','expected_source_state','representation_id','expected_representation_row_revision','expected_representation_state','parent_operation_id','payload_sha256','byte_count','mime_type'];
 elsif family='ACQUIRE_SOURCE' then
  keys:=array['acquisition_key','acquisition_sha256','source_input','capture','original'];
 elsif family='REPLACE_MATERIAL' then
  keys:=array['material_revision','expected_source_row_revision','expected_source_state','expected_current_material_revision','capture','original'];
 elsif family in ('PREPARE_REPRESENTATION','VERIFY_REPRESENTATION','MARK_REPRESENTATION_LOST','RECOVER_REPRESENTATION') then
  keys:=array['material_revision','expected_source_row_revision','expected_source_state','representation_id','expected_representation_row_revision','expected_representation_state'];
 else raise exception 'INVALID_SOURCE_COMMAND'; end if;
 if not public.trip_event_keys(p,keys) then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 if family in ('ACQUIRE_SOURCE','REPLACE_MATERIAL') then
  if not public.trip_event_keys(p->'original',array['id','material_kind','original_filename','part_key','mime_type','encoding','payload_sha256','byte_count','text_content','locator_uri'])
   or not public.trip_event_keys(p->'capture',array['completeness','capture_sha256']) then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  descriptor:=jsonb_build_array(p->'original'->'id',p->'original'->'material_kind',p->'original'->'original_filename',p->'original'->'part_key',p->'original'->'mime_type',p->'original'->'encoding',p->'original'->'payload_sha256',p->'original'->'byte_count',p->'original'->'text_content',p->'original'->'locator_uri');
  capture:=jsonb_build_array(p->'capture'->'completeness',p->'capture'->'capture_sha256');
 end if;
 if family='ACQUIRE_SOURCE' then
  if not public.trip_event_keys(p->'source_input',array['source_kind','acquisition_channel','captured_at','capture_time_basis']) then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  input:=jsonb_build_array(p->'source_input'->'source_kind',p->'source_input'->'acquisition_channel',p->'source_input'->'captured_at',p->'source_input'->'capture_time_basis');
  return jsonb_build_array(p->'acquisition_key',p->'acquisition_sha256',input,capture,descriptor);
 end if;
 if not public.trip_event_keys(p->'expected_source_state',array['lifecycle','retention_state']) or p->'expected_source_state'<> '{"lifecycle":"ACTIVE","retention_state":"RETAINED"}'::jsonb then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 pins:=jsonb_build_array(p->'material_revision',p->'expected_source_row_revision',jsonb_build_array(p->'expected_source_state'->'lifecycle',p->'expected_source_state'->'retention_state'));
 if family='REPLACE_MATERIAL' then return pins||jsonb_build_array(p->'expected_current_material_revision',capture,descriptor); end if;
 if not public.trip_event_keys(p->'expected_representation_state',array['remote_state','retention_state']) or p->'expected_representation_state'<>jsonb_build_object('remote_state',case family when 'MARK_REPRESENTATION_LOST' then 'VERIFIED' when 'RECOVER_REPRESENTATION' then 'LOST' else 'PENDING' end,'retention_state','RETAINED') then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 if family='UPLOAD_ORIGINAL' then return jsonb_build_array(p->'material_revision',p->'representation_id',p->'parent_operation_id',p->'expected_source_row_revision',p->'expected_representation_row_revision',jsonb_build_array(jsonb_build_array(p->'expected_source_state'->'lifecycle',p->'expected_source_state'->'retention_state'),jsonb_build_array(p->'expected_representation_state'->'remote_state',p->'expected_representation_state'->'retention_state')),p->'payload_sha256',p->'byte_count',p->'mime_type'); end if;
 return pins||jsonb_build_array(p->'representation_id',p->'expected_representation_row_revision',jsonb_build_array(p->'expected_representation_state'->'remote_state',p->'expected_representation_state'->'retention_state'));
end $$;

create function public.trip_source_command_codec(raw text) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog
as $$ declare j jsonb; p jsonb; d jsonb; field text; val jsonb; k text; newrev bigint; prev bigint; digest text; captured text; descriptor jsonb; expected text;
begin
 if raw is null or octet_length(raw)>2097152 then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 j:=public.trip_event_canonical_json(raw::json)::jsonb;
 if not public.trip_event_keys(j,array['contract_version','command','operation_id','operation_key','actor_account_id','trip_id','source_id','operation_sha256','payload']) or j->'contract_version' is distinct from '1'::jsonb then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 foreach field in array array['operation_id','actor_account_id','trip_id','source_id'] loop
  if jsonb_typeof(j->field)<>'string' or (j->>field) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 end loop;
 if jsonb_typeof(j->'operation_key')<>'string' or (j->>'operation_key') !~ '^[A-Za-z0-9._:-]{1,128}$' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 p:=j->'payload'; k:=j->>'command';
 descriptor:=public.trip_source_payload_tuple(k,p);
 foreach field in array array['material_revision','expected_source_row_revision','expected_representation_row_revision','expected_current_material_revision'] loop
  if p ? field and (jsonb_typeof(p->field)<>'number' or (p->>field)::numeric not between 1 and 9007199254740991) then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 end loop;
 if k='REPLACE_MATERIAL' and p->'material_revision'<>p->'expected_current_material_revision' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 if k not in ('ACQUIRE_SOURCE','REPLACE_MATERIAL') and (jsonb_typeof(p->'representation_id')<>'string' or p->>'representation_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 if k in ('ACQUIRE_SOURCE','REPLACE_MATERIAL') then
  d:=p->'original';
  if jsonb_typeof(p->'capture'->'completeness')<>'string' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  if jsonb_typeof(d->'id')<>'string' or d->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or d->'part_key'<>'null'::jsonb or jsonb_typeof(d->'byte_count')<>'number' or (d->>'byte_count')::numeric not between 0 and 9007199254740991
   or jsonb_typeof(d->'payload_sha256')<>'string' or d->>'payload_sha256' !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p->'capture'->'capture_sha256')<>'string' or p->'capture'->>'capture_sha256' !~ '^[0-9a-f]{64}$'
   or p->'capture'->>'completeness' not in ('AS_SUPPLIED','PARTIAL_CAPTURE') then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  foreach field in array array['original_filename','mime_type','encoding','text_content','locator_uri'] loop
   if jsonb_typeof(d->field) not in ('string','null') then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  end loop;
  if jsonb_typeof(d->'material_kind') is distinct from 'string' or d->>'material_kind' not in ('BINARY','TEXT','LOCATOR') or d->>'material_kind' is null
   or d->>'material_kind'<>'BINARY' and d->'original_filename'<>'null'::jsonb then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  val:=d||jsonb_build_object('remote_state',case when d->>'material_kind'='BINARY' then 'PENDING' else 'NOT_APPLICABLE' end,'verified_at',null,'retention_state','RETAINED','storage_provider',case when d->>'material_kind'='BINARY' then 'supabase_storage' end,'storage_bucket',case when d->>'material_kind'='BINARY' then 'trip-source-material' end,'object_key',case when d->>'material_kind'='BINARY' then 'validation' end);
  if not public.trip_source_representation_valid(val) or char_length(d->>'original_filename') not between 1 and 255
   or octet_length(d->>'text_content')>262144 or char_length(d->>'locator_uri')>4096 or octet_length(d->>'locator_uri')>16384 or d->>'material_kind'='LOCATOR' and d->>'locator_uri' !~ '^https?://[^[:space:]]+$' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  newrev:=case when k='ACQUIRE_SOURCE' then 1 else (p->>'material_revision')::bigint+1 end;
  prev:=case when k='REPLACE_MATERIAL' then (p->>'material_revision')::bigint end;
  if newrev>9007199254740991 then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  digest:=public.trip_source_hash('otr-source-capture-v1',jsonb_build_array(1,j->'source_id',newrev,prev,jsonb_build_array(d->'id'),p->'capture'->'completeness',case when k='ACQUIRE_SOURCE' then 'ACQUISITION' else 'REPLACEMENT' end,null,null));
  if digest is distinct from p->'capture'->>'capture_sha256' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  if k='ACQUIRE_SOURCE' then
   if p->'acquisition_key' is distinct from j->'operation_key' or jsonb_typeof(p->'acquisition_sha256')<>'string' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
   val:=p->'source_input';
   foreach field in array array['source_kind','acquisition_channel','capture_time_basis'] loop if jsonb_typeof(val->field)<>'string' then raise exception 'INVALID_SOURCE_COMMAND'; end if; end loop;
   if val->>'source_kind' not in ('FILE','IMAGE','TEXT','URL') or val->>'source_kind' is null or val->>'capture_time_basis' not in ('UNKNOWN','OBSERVED','SUPPLIED') or val->>'capture_time_basis' is null
    or (val->>'capture_time_basis'='UNKNOWN') is distinct from (val->'captured_at' is not distinct from 'null'::jsonb)
    or not (val->>'source_kind'='FILE' and val->>'acquisition_channel'='FILES' and d->>'material_kind'='BINARY' and d->>'mime_type'='application/pdf'
     or val->>'source_kind'='IMAGE' and val->>'acquisition_channel' in ('CAMERA','PHOTOS','FILES') and d->>'material_kind'='BINARY' and d->>'mime_type' like 'image/%'
     or val->>'source_kind'='TEXT' and val->>'acquisition_channel'='PASTE' and d->>'material_kind'='TEXT'
     or val->>'source_kind'='URL' and val->>'acquisition_channel'='URL_CAPTURE' and d->>'material_kind'='LOCATOR') then raise exception 'INVALID_SOURCE_COMMAND'; end if;
   captured:=val->>'captured_at';
   if captured is not null and (jsonb_typeof(val->'captured_at')<>'string' or captured !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$' or captured is distinct from public.trip_event_utc_timestamp(captured::timestamptz)) then raise exception 'INVALID_SOURCE_COMMAND'; end if;
   digest:=public.trip_source_hash('otr-source-acquisition-v1',jsonb_build_array(1,j->'trip_id',j->'actor_account_id',j->'source_id',p->'acquisition_key',val->'source_kind',val->'acquisition_channel',val->'captured_at',val->'capture_time_basis',p->'capture'->'capture_sha256',descriptor->4));
   if digest is distinct from p->>'acquisition_sha256' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  end if;
 end if;
 if k='UPLOAD_ORIGINAL' then
  if jsonb_typeof(p->'parent_operation_id')<>'string' or p->>'parent_operation_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(p->'payload_sha256')<>'string' or p->>'payload_sha256' !~ '^[0-9a-f]{64}$' or jsonb_typeof(p->'byte_count')<>'number' or (p->>'byte_count')::numeric not between 1 and 52428800 or jsonb_typeof(p->'mime_type')<>'string' or p->>'mime_type' not in ('application/pdf','image/jpeg','image/png','image/heic','image/heif') then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  digest:=public.trip_source_hash('otr-source-upload-v1',jsonb_build_array(1,j->'operation_id',j->'operation_key',j->'actor_account_id',j->'trip_id',j->'source_id')||descriptor);
 else
 digest:=public.trip_source_hash('otr-source-command-v1',jsonb_build_array(1,k,j->'operation_id',j->'operation_key',j->'actor_account_id',j->'trip_id',j->'source_id',descriptor));
 end if;
 if digest is distinct from j->>'operation_sha256' then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 return j;
end $$;

create function public.trip_source_result_tuple(r public.trip_source_operations) returns jsonb
language sql immutable security invoker set search_path=pg_catalog
as $$ select jsonb_build_array(1,r.id,r.command,r.operation_sha256,r.outcome,r.error_code,public.trip_event_utc_timestamp(r.completed_at),r.result_source_row_revision,r.result_material_revision,r.result_representation_row_revision,r.result_remote_state,r.result_retention_state,r.result_action_id,public.trip_event_utc_timestamp(r.result_verified_at)) $$;

create function public.trip_source_operation_reply(r public.trip_source_operations) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog
as $$ begin
 if r.phase<>'FINAL' then return jsonb_build_object('contract_version',1,'operation_id',r.id,'operation_key',r.operation_key,'operation_sha256',r.operation_sha256,'phase',r.phase,'attempt_generation',r.attempt_generation); end if;
 if r.result_sha256 is distinct from public.trip_source_hash('otr-source-result-v1',public.trip_source_result_tuple(r)) then raise exception 'REPLAY_UNAVAILABLE'; end if;
 return jsonb_build_object('contract_version',1,'operation_id',r.id,'operation_key',r.operation_key,'command',r.command,'operation_sha256',r.operation_sha256,'outcome',r.outcome,'error_code',r.error_code,'completed_at',public.trip_event_utc_timestamp(r.completed_at),'source_id',r.source_id,'result_source_row_revision',r.result_source_row_revision,'result_material_revision',r.result_material_revision,'representation_id',r.representation_id,'result_representation_row_revision',r.result_representation_row_revision,'result_remote_state',r.result_remote_state,'result_retention_state',r.result_retention_state,'result_action_id',r.result_action_id,'result_verified_at',public.trip_event_utc_timestamp(r.result_verified_at),'result_sha256',r.result_sha256);
end $$;

create function public.trip_source_assert_pins(o public.trip_source_operations) returns public.trip_source_representations
language plpgsql volatile security invoker set search_path=pg_catalog
as $$ declare s public.trip_sources; r public.trip_source_representations;
begin
 select * into s from public.trip_sources where id=o.source_id for update;
 if not found or s.acquired_by<>o.actor_account_id or s.trip_id<>o.trip_id then raise exception 'SOURCE_NOT_AVAILABLE' using errcode='42501'; end if;
 if s.row_revision<>o.expected_source_row_revision then raise exception 'SOURCE_CAS_CONFLICT'; end if;
 if s.lifecycle is distinct from o.expected_source_lifecycle or s.retention_state is distinct from o.expected_source_retention_state then raise exception 'PRIOR_STATE_CONFLICT'; end if;
 select * into r from public.trip_source_representations where id=o.representation_id and source_id=o.source_id for update;
 if not found or r.row_revision<>o.expected_representation_row_revision then raise exception 'REPRESENTATION_CAS_CONFLICT'; end if;
 if r.remote_state is distinct from o.expected_representation_remote_state or r.retention_state is distinct from o.expected_representation_retention_state
  or r.role<>'ORIGINAL' or r.material_kind<>'BINARY' or not exists(select 1 from public.trip_source_revisions where source_id=o.source_id and material_revision=o.material_revision and retention_state='RETAINED' and r.id=any(original_representation_ids)) then raise exception 'PRIOR_STATE_CONFLICT'; end if;
 if r.payload_sha256 is distinct from o.bound_payload_sha256 or r.byte_count is distinct from o.bound_byte_count or r.mime_type is distinct from o.bound_mime_type then raise exception 'MATERIAL_INTEGRITY_MISMATCH'; end if;
 return r;
end $$;

create function public.trip_source_seal(o public.trip_source_operations,s public.trip_sources,r public.trip_source_representations,action uuid,error text default null) returns public.trip_source_operations
language plpgsql volatile security invoker set search_path=pg_catalog
as $$ begin
 if o.phase not in ('ADMITTED','IO_QUIESCENT') then raise exception 'SOURCE_PHASE_CONFLICT'; end if;
 o.phase:='FINAL'; o.outcome:=case when error is null then 'APPLIED' else 'REJECTED' end; o.error_code:=error; o.completed_at:=clock_timestamp();
 if error is null then
  o.result_source_row_revision:=s.row_revision; o.result_material_revision:=case when o.command in ('ACQUIRE_SOURCE','REPLACE_MATERIAL') then s.current_material_revision else o.material_revision end;
  o.result_representation_row_revision:=r.row_revision; o.result_remote_state:=r.remote_state; o.result_retention_state:=r.retention_state; o.result_action_id:=action; o.result_verified_at:=r.verified_at;
 end if;
 o.result_sha256:=public.trip_source_hash('otr-source-result-v1',public.trip_source_result_tuple(o));
 return o;
end $$;

create function public.trip_source_register(family text,actor uuid,raw text) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog
as $$ declare j jsonb; p jsonb; d jsonb; s public.trip_sources; r public.trip_source_representations; o public.trip_source_operations; historic jsonb; nowtime timestamptz:=clock_timestamp(); rev bigint; action uuid; code text;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then raise exception 'SOURCE_ACCESS_DENIED' using errcode='42501'; end if;
 j:=public.trip_source_command_codec(raw); p:=j->'payload';
 if j->>'command'<>family or (j->>'actor_account_id')::uuid is distinct from actor then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 if not public.trip_source_admission(actor,(j->>'trip_id')::uuid,false) then raise exception 'SOURCE_ACCESS_DENIED' using errcode='42501'; end if;
 -- Historic read needs no write admission or new dispatch, even at old CAS.
 historic:=public.trip_source_operation_lookup(actor,(j->>'trip_id')::uuid,(j->>'source_id')::uuid,(j->>'operation_id')::uuid,j->>'operation_key',j->>'operation_sha256');
 if historic is not null then return historic; end if;
 perform public.trip_source_assert_gate();
 perform public.trip_source_lock_scope(actor,(j->>'trip_id')::uuid,(j->>'source_id')::uuid);
 perform pg_advisory_xact_lock(hashtextextended('otr-source-key/'||(j->>'trip_id')||'/'||actor||'/'||(j->>'operation_key'),0));
 perform pg_advisory_xact_lock(hashtextextended('otr-source-id/'||(j->>'operation_id'),0));
 perform pg_advisory_xact_lock(hashtextextended('otr-source-target/'||(j->>'source_id'),0));
 select * into o from public.trip_source_operations where trip_id=(j->>'trip_id')::uuid and actor_account_id=actor and operation_key=j->>'operation_key' for update;
 if found then
  if o.id<>(j->>'operation_id')::uuid or o.source_id<>(j->>'source_id')::uuid or o.operation_sha256<>j->>'operation_sha256' then raise exception 'OPERATION_KEY_REUSED' using errcode='23505'; end if;
  return public.trip_source_operation_reply(o);
 end if;
 if exists(select 1 from public.trip_source_operations where id=(j->>'operation_id')::uuid) then raise exception 'OPERATION_ID_REUSED' using errcode='23505'; end if;
 select * into s from public.trip_sources where id=(j->>'source_id')::uuid for update;
 if family='ACQUIRE_SOURCE' then
  if found or exists(select 1 from public.trip_sources where trip_id=(j->>'trip_id')::uuid and acquired_by=actor and acquisition_key=j->>'operation_key') then raise exception 'OPERATION_KEY_REUSED' using errcode='23505'; end if;
 else
  if not found or s.trip_id<>(j->>'trip_id')::uuid or s.acquired_by<>actor then raise exception 'SOURCE_NOT_AVAILABLE' using errcode='42501'; end if;
 end if;
 o.id:=(j->>'operation_id')::uuid; o.trip_id:=(j->>'trip_id')::uuid; o.actor_account_id:=actor; o.source_id:=(j->>'source_id')::uuid; o.operation_key:=j->>'operation_key'; o.operation_sha256:=j->>'operation_sha256'; o.command:=family; o.contract_version:=1; o.created_at:=nowtime; o.phase:='ADMITTED'; o.attempt_generation:=1;
 o.parent_operation_id:=(p->>'parent_operation_id')::uuid;
 o.material_revision:=case when family='ACQUIRE_SOURCE' then 1 else (p->>'material_revision')::bigint end;
 o.expected_source_row_revision:=(p->>'expected_source_row_revision')::bigint; o.expected_source_lifecycle:=p->'expected_source_state'->>'lifecycle'; o.expected_source_retention_state:=p->'expected_source_state'->>'retention_state';
 o.expected_representation_row_revision:=(p->>'expected_representation_row_revision')::bigint; o.expected_representation_remote_state:=p->'expected_representation_state'->>'remote_state'; o.expected_representation_retention_state:=p->'expected_representation_state'->>'retention_state';
 o.representation_id:=case when family in ('ACQUIRE_SOURCE','REPLACE_MATERIAL') then (p->'original'->>'id')::uuid else (p->>'representation_id')::uuid end;
 begin
  if family<>'ACQUIRE_SOURCE' and s.row_revision<>o.expected_source_row_revision then raise exception 'SOURCE_CAS_CONFLICT'; end if;
  if family<>'ACQUIRE_SOURCE' and (s.lifecycle<>o.expected_source_lifecycle or s.retention_state<>o.expected_source_retention_state) then raise exception 'PRIOR_STATE_CONFLICT'; end if;
  if family in ('ACQUIRE_SOURCE','REPLACE_MATERIAL') then
   d:=p->'original'; rev:=case when family='ACQUIRE_SOURCE' then 1 else s.current_material_revision+1 end;
   if family='REPLACE_MATERIAL' and s.current_material_revision<>o.material_revision then raise exception 'SOURCE_CAS_CONFLICT'; end if;
   if family='ACQUIRE_SOURCE' then
    insert into public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,captured_at,capture_time_basis,created_at,current_material_revision,row_revision)
     values(o.source_id,o.trip_id,actor,o.operation_key,p->>'acquisition_sha256',p->'source_input'->>'source_kind',p->'source_input'->>'acquisition_channel',(p->'source_input'->>'captured_at')::timestamptz,p->'source_input'->>'capture_time_basis',nowtime,1,1) returning * into s;
   else
    if not (s.source_kind='FILE' and d->>'material_kind'='BINARY' and d->>'mime_type'='application/pdf' or s.source_kind='IMAGE' and d->>'material_kind'='BINARY' and d->>'mime_type' like 'image/%' or s.source_kind='TEXT' and d->>'material_kind'='TEXT' or s.source_kind='URL' and d->>'material_kind'='LOCATOR') then raise exception 'INVALID_SOURCE_COMMAND'; end if;
    update public.trip_sources set current_material_revision=rev,row_revision=row_revision+1 where id=s.id returning * into s;
   end if;
   insert into public.trip_source_revisions(source_id,material_revision,previous_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason)
    values(s.id,rev,case when rev>1 then rev-1 end,nowtime,actor,o.operation_key,p->'capture'->>'capture_sha256',array[o.representation_id],p->'capture'->>'completeness',case when family='ACQUIRE_SOURCE' then 'ACQUISITION' else 'REPLACEMENT' end);
   insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,original_filename,part_key,mime_type,encoding,payload_sha256,byte_count,text_content,locator_uri,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state)
    values(o.representation_id,1,s.id,rev,'ORIGINAL',d->>'material_kind',d->>'original_filename',null,d->>'mime_type',d->>'encoding',d->>'payload_sha256',(d->>'byte_count')::bigint,d->>'text_content',d->>'locator_uri','NOT_APPLICABLE',nowtime,case when d->>'material_kind'='BINARY' then 'supabase_storage' end,case when d->>'material_kind'='BINARY' then 'trip-source-material' end,case when d->>'material_kind'='BINARY' then 'v1/'||s.trip_id||'/'||s.id||'/'||o.representation_id||'/payload' end,case when d->>'material_kind'='BINARY' then 'PENDING' else 'NOT_APPLICABLE' end) returning * into r;
   action:=gen_random_uuid();
   insert into public.trip_source_actions(id,source_id,actor_account_id,operation_key,operation_sha256,action,occurred_at,source_row_revision,material_revision,reason_code)
    values(action,s.id,actor,o.operation_key,o.operation_sha256,case when family='ACQUIRE_SOURCE' then 'ACQUIRE' else 'REPLACE' end,nowtime,s.row_revision,rev,case when family='ACQUIRE_SOURCE' then 'USER_REQUEST' else 'CAPTURE_CHANGE' end);
  else
   select * into r from public.trip_source_representations where source_id=s.id and id=o.representation_id for update;
   if not found then raise exception 'REPRESENTATION_CAS_CONFLICT'; end if;
   o.bound_payload_sha256:=r.payload_sha256; o.bound_byte_count:=r.byte_count; o.bound_mime_type:=r.mime_type;
   r:=public.trip_source_assert_pins(o);
   if family='UPLOAD_ORIGINAL' and (r.payload_sha256 is distinct from p->>'payload_sha256' or r.byte_count is distinct from (p->>'byte_count')::bigint or r.mime_type is distinct from p->>'mime_type' or not exists(select 1 from public.trip_source_operations parent where parent.id=o.parent_operation_id and parent.trip_id=o.trip_id and parent.actor_account_id=o.actor_account_id and parent.source_id=o.source_id and parent.representation_id=o.representation_id and parent.material_revision=o.material_revision and parent.command='PREPARE_REPRESENTATION' and parent.phase='FINAL' and parent.outcome='APPLIED' and parent.expected_source_row_revision=o.expected_source_row_revision and parent.expected_representation_row_revision=o.expected_representation_row_revision)) then raise exception 'INVALID_SOURCE_COMMAND'; end if;
  end if;
  if family in ('ACQUIRE_SOURCE','REPLACE_MATERIAL','PREPARE_REPRESENTATION') then o:=public.trip_source_seal(o,s,r,action); end if;
 exception when raise_exception then
  get stacked diagnostics code=message_text;
  if code not in ('SOURCE_CAS_CONFLICT','REPRESENTATION_CAS_CONFLICT','PRIOR_STATE_CONFLICT') then raise; end if;
  if family='ACQUIRE_SOURCE' then raise; end if;
  o:=public.trip_source_seal(o,null,null,null,code);
 end;
 insert into public.trip_source_operations select (o).*;
 return public.trip_source_operation_reply(o);
end $$;

create function public.trip_source_finalize(actor uuid,trip uuid,source uuid,operation uuid,key text,digest text,generation bigint,attempt uuid,proof jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog
as $$ declare o public.trip_source_operations; s public.trip_sources; r public.trip_source_representations; action uuid; code text; proof_time timestamptz;
begin
 perform public.trip_source_assert_gate();
 perform public.trip_source_lock_scope(actor,trip,source);
 select * into o from public.trip_source_operations where id=operation and trip_id=trip and actor_account_id=actor and source_id=source and operation_key=key and operation_sha256=digest for update;
 if not found or o.phase<>'IO_QUIESCENT' or o.attempt_generation is distinct from generation or o.attempt_id is distinct from attempt or o.worker_identity is distinct from session_user then raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
 -- Only the private trusted fixture/provider producer can call this helper.
 -- This is a typed proof of the exact persisted object, never a client flag.
 if not public.trip_event_keys(proof,array['operation_id','attempt_id','attempt_generation','kind','payload_sha256','byte_count','mime_type','observed_at']) or proof->>'operation_id' is distinct from o.id::text or proof->>'attempt_id' is distinct from o.attempt_id::text or proof->'attempt_generation' is distinct from to_jsonb(o.attempt_generation) or proof->>'kind' is null or proof->>'kind' not in ('MATCH','DEFINITE_MISSING','MISMATCH') then raise exception 'INVALID_SOURCE_PROOF'; end if;
 if jsonb_typeof(proof->'observed_at')<>'string' or proof->>'observed_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$' then raise exception 'INVALID_SOURCE_PROOF'; end if;
 proof_time:=(proof->>'observed_at')::timestamptz;
 if proof->>'observed_at' is distinct from public.trip_event_utc_timestamp(proof_time) or proof_time<o.admitted_at or proof_time>o.io_finished_at then raise exception 'INVALID_SOURCE_PROOF'; end if;
 if proof->>'kind'='MATCH' and (proof->>'payload_sha256' is distinct from o.bound_payload_sha256 or proof->'byte_count' is distinct from to_jsonb(o.bound_byte_count) or proof->>'mime_type' is distinct from o.bound_mime_type) then raise exception 'INVALID_SOURCE_PROOF'; end if;
 if proof->>'kind'='DEFINITE_MISSING' and (proof->'payload_sha256'<>'null'::jsonb or proof->'byte_count'<>'null'::jsonb or proof->'mime_type'<>'null'::jsonb) then raise exception 'INVALID_SOURCE_PROOF'; end if;
 if proof->>'kind'='MISMATCH' and (jsonb_typeof(proof->'payload_sha256') is distinct from 'string' or proof->>'payload_sha256' !~ '^[0-9a-f]{64}$' or jsonb_typeof(proof->'byte_count') is distinct from 'number' or proof->>'byte_count' !~ '^(0|[1-9][0-9]*)$' or (proof->>'byte_count')::numeric not between 0 and 9007199254740991 or jsonb_typeof(proof->'mime_type') is distinct from 'string' or char_length(proof->>'mime_type') not between 1 and 128 or proof->>'payload_sha256'=o.bound_payload_sha256 and proof->'byte_count'=to_jsonb(o.bound_byte_count) and proof->>'mime_type'=o.bound_mime_type) then raise exception 'INVALID_SOURCE_PROOF'; end if;
 begin
  r:=public.trip_source_assert_pins(o);
  select * into s from public.trip_sources where id=o.source_id;
  if o.command='MARK_REPRESENTATION_LOST' then
   if proof->>'kind'='MATCH' then raise exception 'MATERIAL_INTEGRITY_MISMATCH'; end if;
   update public.trip_source_representations set remote_state='LOST',row_revision=row_revision+1 where id=r.id returning * into r;
   action:=gen_random_uuid();
   insert into public.trip_source_actions(id,source_id,actor_account_id,operation_key,operation_sha256,action,occurred_at,source_row_revision,material_revision,representation_id,reason_code)
    values(action,s.id,actor,o.operation_key,o.operation_sha256,'MARK_LOST',clock_timestamp(),s.row_revision,o.material_revision,r.id,'VERIFIED_LOSS');
  elsif o.command in ('VERIFY_REPRESENTATION','RECOVER_REPRESENTATION','UPLOAD_ORIGINAL') then
   if proof->>'kind'<>'MATCH' then raise exception 'MATERIAL_INTEGRITY_MISMATCH'; end if;
   if o.command<>'UPLOAD_ORIGINAL' then
    update public.trip_source_representations set remote_state='VERIFIED',verified_at=proof_time,row_revision=row_revision+1 where id=r.id returning * into r;
   end if;
  else raise exception 'INVALID_SOURCE_PROOF'; end if;
  o:=public.trip_source_seal(o,s,r,action);
 exception when raise_exception then
  get stacked diagnostics code=message_text;
  if code not in ('SOURCE_CAS_CONFLICT','REPRESENTATION_CAS_CONFLICT','PRIOR_STATE_CONFLICT','MATERIAL_INTEGRITY_MISMATCH') then raise; end if;
  o:=public.trip_source_seal(o,null,null,null,code);
 end;
 update public.trip_source_operations set phase=o.phase,outcome=o.outcome,error_code=o.error_code,completed_at=o.completed_at,result_source_row_revision=o.result_source_row_revision,result_material_revision=o.result_material_revision,result_representation_row_revision=o.result_representation_row_revision,result_remote_state=o.result_remote_state,result_retention_state=o.result_retention_state,result_action_id=o.result_action_id,result_verified_at=o.result_verified_at,result_sha256=o.result_sha256 where id=o.id;
 return public.trip_source_operation_reply(o);
end $$;

-- Actual database identity supplies authority; booleans only select read/write
-- admission internally and never bypass either identity or the closed fence.
create function public.trip_source_admission(actor uuid,trip uuid,writing boolean) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$ select exists(select 1 from public.trips where id=trip and created_by=actor)
 or exists(select 1 from public.trip_members where trip_id=trip and user_id=actor)
 or exists(select 1 from public.journey_members where trip_id=trip and user_id=actor and status='linked' and (not writing or role in ('owner','group_member'))) $$;
alter function public.trip_source_admission(uuid,uuid,boolean) owner to otr_trip_source_operation_reader;

create function public.trip_source_operation_lookup(actor uuid,trip uuid,source uuid,operation uuid,key text,digest text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog
as $$ declare o public.trip_source_operations;
begin
 if session_user<>'otr_trip_source_command_gateway' or not public.trip_source_admission(actor,trip,false) then
  raise exception 'SOURCE_ACCESS_DENIED' using errcode='42501'; end if;
 select * into o from public.trip_source_operations where trip_id=trip and actor_account_id=actor and operation_key=key;
 if not found then return null; end if;
 if not exists(select 1 from public.trip_sources where id=source and trip_id=trip and acquired_by=actor and retention_state='RETAINED') then
  raise exception 'SOURCE_NOT_AVAILABLE' using errcode='42501'; end if;
 if o.id is distinct from operation or o.source_id is distinct from source or o.operation_sha256 is distinct from digest then
  raise exception 'OPERATION_KEY_REUSED' using errcode='23505'; end if;
 return public.trip_source_operation_reply(o);
end $$;
alter function public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text) owner to otr_trip_source_operation_reader;

create function public.trip_source_assert_gate() returns void
language plpgsql volatile security invoker set search_path=pg_catalog
as $$ begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then
  raise exception 'SOURCE_ACCESS_DENIED' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('otr-source-activation-v1',0));
 if not exists(select 1 from public.trip_source_command_gate where singleton and enabled) then
  raise exception 'TRIP_SOURCE_COMMANDS_DISABLED' using errcode='42501'; end if;
end $$;

create function public.trip_source_lock_scope(actor uuid,trip uuid,source uuid) returns void
language plpgsql volatile security invoker set search_path=pg_catalog
as $$ begin
 -- Existing admission rows fence revocation; all locks end at this transaction.
 perform 1 from public.trips where id=trip for update;
 perform 1 from public.trip_members where trip_id=trip order by id for update;
 perform 1 from public.journey_members where trip_id=trip order by id for update;
 if not public.trip_source_admission(actor,trip,false) or not public.trip_source_admission(actor,trip,true) then
  raise exception 'SOURCE_ACCESS_DENIED' using errcode='42501'; end if;
end $$;

create function public.trip_source_operation_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $$ declare mutable text[]:=array['phase','attempt_generation','attempt_id','worker_identity','admitted_at','io_finished_at','outcome','error_code','completed_at','result_source_row_revision','result_material_revision','result_representation_row_revision','result_remote_state','result_retention_state','result_action_id','result_verified_at','result_sha256'];
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' or tg_op in ('DELETE','TRUNCATE') then
  raise exception 'TRIP_SOURCE_COMMANDS_DISABLED' using errcode='42501'; end if;
 if not exists(select 1 from public.trip_source_command_gate where singleton and enabled) then
  raise exception 'TRIP_SOURCE_COMMANDS_DISABLED' using errcode='42501'; end if;
 if tg_level='STATEMENT' then return null; end if;
 if tg_op='INSERT' then
  if new.phase not in ('ADMITTED','FINAL') or new.attempt_generation<>1 or new.attempt_id is not null or new.io_finished_at is not null then
   raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
 elsif tg_op='UPDATE' then
  if old.phase='FINAL' or (to_jsonb(old)-mutable) is distinct from (to_jsonb(new)-mutable) then
   raise exception 'SOURCE_OPERATION_IMMUTABLE' using errcode='42501'; end if;
  if not (old.phase='ADMITTED' and new.phase in ('IO_ACTIVE','FINAL')
   or old.phase='IO_ACTIVE' and new.phase in ('IO_UNKNOWN','IO_QUIESCENT')
   or old.phase='IO_UNKNOWN' and new.phase='IO_QUIESCENT'
   or old.phase='IO_QUIESCENT' and new.phase in ('IO_ACTIVE','FINAL')) then raise exception 'SOURCE_PHASE_CONFLICT'; end if;
  if new.phase='IO_ACTIVE' then
   if new.attempt_generation<>old.attempt_generation+(case when old.phase='ADMITTED' then 0 else 1 end)
    or new.attempt_id is null or new.attempt_id is not distinct from old.attempt_id or new.worker_identity is distinct from session_user
    or new.admitted_at is null or new.io_finished_at is not null then raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
  elsif new.attempt_generation<>old.attempt_generation or new.attempt_id is distinct from old.attempt_id
   or new.worker_identity is distinct from old.worker_identity or new.admitted_at is distinct from old.admitted_at then
   raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
  if new.phase='FINAL' and new.io_finished_at is distinct from old.io_finished_at then raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
 end if;
 if new.phase='FINAL' then
  if new.result_sha256 is distinct from public.trip_source_hash('otr-source-result-v1',public.trip_source_result_tuple(new)) then raise exception 'SOURCE_RESULT_INTEGRITY'; end if;
  if new.outcome<>'REJECTED' and (not exists(select 1 from public.trip_sources where id=new.source_id and trip_id=new.trip_id and acquired_by=new.actor_account_id)
   or not exists(select 1 from public.trip_source_representations r join public.trip_source_revisions v on v.source_id=r.source_id and v.material_revision=new.result_material_revision
    where r.id=new.representation_id and r.source_id=new.source_id and r.id=any(v.original_representation_ids))
   or new.result_action_id is not null and not exists(select 1 from public.trip_source_actions where id=new.result_action_id and source_id=new.source_id and actor_account_id=new.actor_account_id and operation_key=new.operation_key and operation_sha256=new.operation_sha256)) then raise exception 'SOURCE_RESULT_INTEGRITY'; end if;
 end if;
 return new;
end $$;
create trigger trip_source_operation_statement before insert or update or delete or truncate on public.trip_source_operations for each statement execute function public.trip_source_operation_guard();
create trigger trip_source_operation_row before insert or update or delete on public.trip_source_operations for each row execute function public.trip_source_operation_guard();

-- Internal producer helpers are INVOKER and never granted to the gateway. A
-- provider completion producer must be reviewed before any runtime dispatch.
create function public.trip_source_attempt_start(actor uuid,trip uuid,source uuid,operation uuid,key text,digest text,prior_phase text,generation bigint,prior_attempt uuid,new_attempt uuid) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog
as $$ declare o public.trip_source_operations;
begin
 perform public.trip_source_assert_gate();
 perform public.trip_source_lock_scope(actor,trip,source);
 select * into o from public.trip_source_operations where id=operation and trip_id=trip and source_id=source and actor_account_id=actor and operation_key=key and operation_sha256=digest for update;
 if not found or o.phase is distinct from prior_phase or o.phase not in ('ADMITTED','IO_QUIESCENT')
  or o.attempt_generation is distinct from generation or o.attempt_id is distinct from prior_attempt
  or new_attempt is null or new_attempt is not distinct from prior_attempt then raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
 perform public.trip_source_assert_pins(o);
 update public.trip_source_operations set phase='IO_ACTIVE',attempt_generation=attempt_generation+case when o.phase='ADMITTED' then 0 else 1 end,
  attempt_id=new_attempt,worker_identity=session_user,admitted_at=clock_timestamp(),io_finished_at=null where id=o.id returning * into o;
 return public.trip_source_operation_reply(o);
end $$;

create function public.trip_source_attempt_observe(operation uuid,digest text,prior_phase text,generation bigint,attempt uuid,observation text) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog
as $$ declare o public.trip_source_operations;
begin
 perform public.trip_source_assert_gate();
 -- This preserves operational evidence after write admission loss; it performs
 -- no semantic finalization. There is no lease, timeout or caller boolean input.
 select * into o from public.trip_source_operations where id=operation and operation_sha256=digest for update;
 if not found or o.phase is distinct from prior_phase or o.phase not in ('IO_ACTIVE','IO_UNKNOWN')
  or o.attempt_generation is distinct from generation or o.attempt_id is distinct from attempt or o.worker_identity is distinct from session_user
  or observation is null or observation not in ('UNKNOWN','DEFINITIVE_COMPLETION') or o.phase='IO_UNKNOWN' and observation<>'DEFINITIVE_COMPLETION' then
  raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
 update public.trip_source_operations set phase=case when observation='UNKNOWN' then 'IO_UNKNOWN' else 'IO_QUIESCENT' end,
  io_finished_at=case when observation='DEFINITIVE_COMPLETION' then clock_timestamp() end where id=o.id returning * into o;
 return public.trip_source_operation_reply(o);
end $$;

create function public.trip_source_acquire_source(actor uuid,raw text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_source_register('ACQUIRE_SOURCE',actor,raw) $$;
alter function public.trip_source_acquire_source(uuid,text) owner to otr_trip_source_writer;

create function public.trip_source_prepare_representation(actor uuid,raw text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_source_register('PREPARE_REPRESENTATION',actor,raw) $$;
alter function public.trip_source_prepare_representation(uuid,text) owner to otr_trip_source_writer;

create function public.trip_source_verify_representation(actor uuid,raw text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_source_register('VERIFY_REPRESENTATION',actor,raw) $$;
alter function public.trip_source_verify_representation(uuid,text) owner to otr_trip_source_writer;

create function public.trip_source_replace_material(actor uuid,raw text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_source_register('REPLACE_MATERIAL',actor,raw) $$;
alter function public.trip_source_replace_material(uuid,text) owner to otr_trip_source_writer;

create function public.trip_source_mark_representation_lost(actor uuid,raw text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_source_register('MARK_REPRESENTATION_LOST',actor,raw) $$;
alter function public.trip_source_mark_representation_lost(uuid,text) owner to otr_trip_source_writer;

create function public.trip_source_recover_representation(actor uuid,raw text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_source_register('RECOVER_REPRESENTATION',actor,raw) $$;
alter function public.trip_source_recover_representation(uuid,text) owner to otr_trip_source_writer;

create function public.trip_source_upload_original(actor uuid,raw text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_source_register('UPLOAD_ORIGINAL',actor,raw) $$;
alter function public.trip_source_upload_original(uuid,text) owner to otr_trip_source_writer;
revoke all on function public.trip_source_hash(text,jsonb) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_payload_tuple(text,jsonb) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_command_codec(text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_result_tuple(public.trip_source_operations) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_operation_reply(public.trip_source_operations) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_assert_pins(public.trip_source_operations) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_seal(public.trip_source_operations,public.trip_sources,public.trip_source_representations,uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_register(text,uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_finalize(uuid,uuid,uuid,uuid,text,text,bigint,uuid,jsonb) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_admission(uuid,uuid,boolean) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_assert_gate() from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_lock_scope(uuid,uuid,uuid) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_operation_guard() from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_attempt_start(uuid,uuid,uuid,uuid,text,text,text,bigint,uuid,uuid) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_attempt_observe(uuid,text,text,bigint,uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_acquire_source(uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_prepare_representation(uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_verify_representation(uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_replace_material(uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_mark_representation_lost(uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_recover_representation(uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
revoke all on function public.trip_source_upload_original(uuid,text) from public,anon,authenticated,service_role,otr_trip_source_writer,otr_trip_source_command_gateway,otr_trip_source_operation_reader;
grant execute on function public.trip_source_hash(text,jsonb),public.trip_source_payload_tuple(text,jsonb),public.trip_source_command_codec(text),public.trip_source_result_tuple(public.trip_source_operations),public.trip_source_operation_reply(public.trip_source_operations),public.trip_source_assert_pins(public.trip_source_operations),public.trip_source_seal(public.trip_source_operations,public.trip_sources,public.trip_source_representations,uuid,text),public.trip_source_register(text,uuid,text),public.trip_source_finalize(uuid,uuid,uuid,uuid,text,text,bigint,uuid,jsonb),public.trip_source_admission(uuid,uuid,boolean),public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text),public.trip_source_assert_gate(),public.trip_source_lock_scope(uuid,uuid,uuid),public.trip_source_operation_guard(),public.trip_source_attempt_start(uuid,uuid,uuid,uuid,text,text,text,bigint,uuid,uuid),public.trip_source_attempt_observe(uuid,text,text,bigint,uuid,text),public.trip_source_acquire_source(uuid,text),public.trip_source_prepare_representation(uuid,text),public.trip_source_verify_representation(uuid,text),public.trip_source_replace_material(uuid,text),public.trip_source_mark_representation_lost(uuid,text),public.trip_source_recover_representation(uuid,text),public.trip_source_upload_original(uuid,text),public.trip_event_canonical_json(json,integer),public.trip_event_keys(jsonb,text[],text[]),public.trip_event_utc_timestamp(timestamp with time zone),public.trip_source_representation_valid(jsonb) to otr_trip_source_writer;
grant execute on function public.trip_source_admission(uuid,uuid,boolean),public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text),public.trip_source_hash(text,jsonb),public.trip_source_result_tuple(public.trip_source_operations),public.trip_source_operation_reply(public.trip_source_operations),public.trip_event_canonical_json(json,integer),public.trip_event_utc_timestamp(timestamp with time zone) to otr_trip_source_operation_reader;
grant execute on function public.trip_source_acquire_source(uuid,text),public.trip_source_prepare_representation(uuid,text),public.trip_source_verify_representation(uuid,text),public.trip_source_replace_material(uuid,text),public.trip_source_mark_representation_lost(uuid,text),public.trip_source_recover_representation(uuid,text),public.trip_source_upload_original(uuid,text),public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text) to otr_trip_source_command_gateway;
grant execute on function extensions.digest(bytea,text) to otr_trip_source_writer,otr_trip_source_operation_reader;
revoke create on schema public from otr_trip_source_writer,otr_trip_source_operation_reader;
grant otr_trip_source_writer,otr_trip_source_operation_reader to postgres with inherit false,set false;
-- Exact final application capability inventories. Unknown objects/privilege
-- classes cannot survive through any direct/PUBLIC/inherited ACL path.
do $$ declare role_name text; allowed text[]; owned text[]; obj record; a record; privilege text; permit boolean;
begin
 foreach role_name in array array['otr_trip_source_writer','otr_trip_source_command_gateway','otr_trip_source_operation_reader'] loop
  allowed:=case role_name when 'otr_trip_source_writer' then array['public.trip_source_hash(text,jsonb)','public.trip_source_payload_tuple(text,jsonb)','public.trip_source_command_codec(text)','public.trip_source_result_tuple(public.trip_source_operations)','public.trip_source_operation_reply(public.trip_source_operations)','public.trip_source_assert_pins(public.trip_source_operations)','public.trip_source_seal(public.trip_source_operations,public.trip_sources,public.trip_source_representations,uuid,text)','public.trip_source_register(text,uuid,text)','public.trip_source_finalize(uuid,uuid,uuid,uuid,text,text,bigint,uuid,jsonb)','public.trip_source_admission(uuid,uuid,boolean)','public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text)','public.trip_source_assert_gate()','public.trip_source_lock_scope(uuid,uuid,uuid)','public.trip_source_operation_guard()','public.trip_source_attempt_start(uuid,uuid,uuid,uuid,text,text,text,bigint,uuid,uuid)','public.trip_source_attempt_observe(uuid,text,text,bigint,uuid,text)','public.trip_source_acquire_source(uuid,text)','public.trip_source_prepare_representation(uuid,text)','public.trip_source_verify_representation(uuid,text)','public.trip_source_replace_material(uuid,text)','public.trip_source_mark_representation_lost(uuid,text)','public.trip_source_recover_representation(uuid,text)','public.trip_source_upload_original(uuid,text)','public.trip_event_canonical_json(json,integer)','public.trip_event_keys(jsonb,text[],text[])','public.trip_event_utc_timestamp(timestamp with time zone)','public.trip_source_representation_valid(jsonb)'] when 'otr_trip_source_command_gateway' then array['public.trip_source_acquire_source(uuid,text)','public.trip_source_prepare_representation(uuid,text)','public.trip_source_verify_representation(uuid,text)','public.trip_source_replace_material(uuid,text)','public.trip_source_mark_representation_lost(uuid,text)','public.trip_source_recover_representation(uuid,text)','public.trip_source_upload_original(uuid,text)','public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text)'] else array['public.trip_source_admission(uuid,uuid,boolean)','public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text)','public.trip_source_hash(text,jsonb)','public.trip_source_result_tuple(public.trip_source_operations)','public.trip_source_operation_reply(public.trip_source_operations)','public.trip_event_canonical_json(json,integer)','public.trip_event_utc_timestamp(timestamp with time zone)'] end;
  owned:=case role_name when 'otr_trip_source_writer' then array['public.trip_source_acquire_source(uuid,text)','public.trip_source_prepare_representation(uuid,text)','public.trip_source_verify_representation(uuid,text)','public.trip_source_replace_material(uuid,text)','public.trip_source_mark_representation_lost(uuid,text)','public.trip_source_recover_representation(uuid,text)','public.trip_source_upload_original(uuid,text)'] when 'otr_trip_source_operation_reader' then array['public.trip_source_admission(uuid,uuid,boolean)','public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text)'] else array[]::text[] end;
  -- Only exact public routine identities in this database may be owned.
  -- All other catalogs, shared/database objects and subobjects fail closed.
  if exists(select 1 from pg_shdepend d where d.refclassid='pg_authid'::regclass
   and d.refobjid=role_name::regrole and d.deptype='o' and not (
    d.dbid=(select oid from pg_database where datname=current_database())
    and d.classid='pg_proc'::regclass and d.objsubid=0
    and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where p.oid=d.objid and n.nspname='public' and p.proowner=role_name::regrole
      and exists(select 1 from unnest(owned) signature where to_regprocedure(signature)=p.oid)))) then
   raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_FINAL_OWNERSHIP: %',role_name;
  end if;
  if exists(select 1 from pg_namespace n where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
   and (n.nspowner=role_name::regrole or has_schema_privilege(role_name,n.oid,'CREATE')))
   or exists(select 1 from pg_class where relowner=role_name::regrole)
   or exists(select 1 from pg_auth_members m where m.member=role_name::regrole or m.roleid=role_name::regrole
    and (m.set_option or m.inherit_option or m.member<>'postgres'::regrole)) then raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and p.prokind in ('f','p')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and ((p.proowner=role_name::regrole and not exists(select 1 from unnest(owned) x where to_regprocedure(x)=p.oid))
      or has_function_privilege(role_name,p.oid,'EXECUTE') and not exists(select 1 from unnest(allowed) x where to_regprocedure(x)=p.oid)
       and not exists(select 1 from ci3d_baseline_routines b where to_regprocedure(b.signature)=p.oid
        and b.definition_sha256=encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')))) then
   raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_FINAL_CAPABILITY: %',role_name;
  end if;
  for obj in select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and c.relkind in ('r','p','v','m','f','S') loop
   if obj.relkind='S' then
    if has_sequence_privilege(role_name,obj.oid,'USAGE,SELECT,UPDATE') then raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
    continue;
   end if;
   foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    permit:=(role_name='otr_trip_source_writer' and obj.oid='public.trip_source_command_gate'::regclass and privilege='SELECT' or role_name='otr_trip_source_operation_reader' and obj.oid=any(array['public.trip_source_operations'::regclass,'public.trip_sources'::regclass,'public.trips'::regclass,'public.trip_members'::regclass,'public.journey_members'::regclass]) and privilege='SELECT');
    if has_table_privilege(role_name,obj.oid,privilege) is distinct from permit then raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
    if privilege in ('SELECT','INSERT','UPDATE','REFERENCES') then
     for a in select attnum from pg_attribute where attrelid=obj.oid and attnum>0 and not attisdropped loop
      if has_column_privilege(role_name,obj.oid,a.attnum,privilege) is distinct from permit then raise exception 'UNSAFE_TRIP_SOURCE_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
     end loop;
    end if;
   end loop;
  end loop;
 end loop;
end $$;


commit;
