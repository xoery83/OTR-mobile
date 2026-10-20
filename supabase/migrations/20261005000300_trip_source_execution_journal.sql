begin;
set local search_path=pg_catalog;
-- C-I3H: closed foundation. No runtime credentials or canonical mutation grants.
-- Exact inherited baseline utility inventory; never accept an arbitrary routine by
-- schema, PUBLIC ACL, or name prefix. Fingerprints forbid replacement of a trusted
-- baseline signature. pg_catalog/information_schema and actual extension-member
-- routines are platform capabilities, not application routines. User-created
-- helpers in extensions/auth/storage/any other schema remain in the scan.
create temporary table ci3h_baseline_routines(signature text primary key, definition_sha256 text not null) on commit drop;
insert into ci3h_baseline_routines values
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
 foreach role_name in array array['otr_trip_source_execution_writer','otr_trip_source_execution_gateway'] loop
  if not exists(select 1 from pg_roles where rolname=role_name) then
   execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',role_name);
  end if;
  select * into r from pg_roles where rolname=role_name;
  -- Ownership is DDL authority across every catalog, including shared objects
  -- and objects in other databases. The accepted baseline owns nothing.
  if exists(select 1 from pg_shdepend d where d.refclassid='pg_authid'::regclass
   and d.refobjid=r.oid and d.deptype='o') then
   raise exception 'UNSAFE_TRIP_SOURCE_EXECUTION_OWNERSHIP: %',role_name;
  end if;
  if r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolbypassrls or r.rolreplication
   or exists(select 1 from pg_auth_members m where m.member=r.oid or m.roleid=r.oid
     and (m.set_option or m.inherit_option or m.member<>(select oid from pg_roles where rolname='postgres')))
   or exists(select 1 from pg_proc where proowner=r.oid)
   or exists(select 1 from pg_class where relowner=r.oid)
   or exists(select 1 from pg_namespace where nspowner=r.oid)
   or exists(select 1 from pg_namespace n where n.nspname not in ('pg_catalog','information_schema')
    and n.nspname !~ '^pg_(toast|temp)' and has_schema_privilege(role_name,n.oid,'CREATE')) then
    raise exception 'UNSAFE_TRIP_SOURCE_EXECUTION_ROLE: %',role_name;
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and c.relkind in ('r','p','v','m','f') and
    (has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and has_column_privilege(role_name,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) then
   raise exception 'UNSAFE_TRIP_SOURCE_EXECUTION_GRANTS: %',role_name;
  end if;
  select p.oid::regprocedure::text into unexpected from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
    and p.prokind in ('f','p') and not exists(select 1 from pg_depend d
      where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege(role_name,p.oid,'EXECUTE') and not exists(select 1 from ci3h_baseline_routines b
      where to_regprocedure(b.signature)=p.oid and b.definition_sha256=encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) limit 1;
  unexpected:=coalesce(unexpected,(select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
     and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
     and case when c.relkind='S' then has_sequence_privilege(role_name,c.oid,'USAGE,SELECT,UPDATE') else false end limit 1));
  if unexpected is not null then
   raise exception 'UNSAFE_TRIP_SOURCE_EXECUTION_CAPABILITY: % [%]',role_name,unexpected;
  end if;
  -- Explicit default ACLs must not grant any reserved identity or PUBLIC objects.
  -- Normal implicit PUBLIC EXECUTE at CREATE FUNCTION is revoked on our new
  -- routines; explicit global/schema default grants are incompatible state.
  if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclobjtype in ('r','S','f') and (a.grantee=0 or a.grantee=r.oid
    or a.grantee<>0 and pg_has_role(role_name,a.grantee,'USAGE'))) then
   raise exception 'UNSAFE_TRIP_SOURCE_EXECUTION_DEFAULT_GRANTS: %',role_name;
  end if;
 end loop;
end $$;

do $$begin
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclobjtype in ('r','S','f') and d.defaclnamespace in (0,'public'::regnamespace) and a.grantee<>d.defaclrole and a.grantee not in
 (select oid from pg_roles where rolname in ('postgres','supabase_admin','anon','authenticated','service_role'))) then raise exception 'UNSAFE_TRIP_SOURCE_EXECUTION_DEFAULT_GRANTS'; end if;
end$$;
-- NOLOGIN identities are unprovisioned. Only the private writer owns commands.
create table public.trip_source_staged_resources (
 id uuid primary key,
 execution_principal name not null,
 node_id uuid not null,
 resource_key text not null check(resource_key ~ '^[0-9a-f]{64}$'),
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 byte_count bigint not null check(byte_count between 1 and 52428800),
 created_at timestamptz not null default clock_timestamp() check(isfinite(created_at)),
 release_authorized_at timestamptz check(isfinite(release_authorized_at) and release_authorized_at>=created_at),
 cleaned_at timestamptz check(isfinite(cleaned_at) and cleaned_at>=release_authorized_at),
 cleanup_evidence_sha256 text check(cleanup_evidence_sha256 ~ '^[0-9a-f]{64}$'),
 check((cleaned_at is null)=(cleanup_evidence_sha256 is null)),
 check(cleaned_at is null or release_authorized_at is not null),
 unique(node_id,resource_key)
);
create table public.trip_source_execution_attempts (
 id uuid primary key,
 operation_id uuid not null references public.trip_source_operations on delete restrict,
 canonical_generation bigint not null check(canonical_generation between 1 and 9007199254740991),
 trip_id uuid not null references public.trips on delete restrict,
 source_id uuid not null references public.trip_sources on delete restrict,
 representation_id uuid not null,
 operation_sha256 text not null check(operation_sha256 ~ '^[0-9a-f]{64}$'),
 operation_key text not null check(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 material_revision bigint not null check(material_revision between 1 and 9007199254740991),
 execution_principal name not null,
 staged_resource_id uuid not null references public.trip_source_staged_resources on delete restrict,
 profile_id text not null check(profile_id='PNG_STATIC_RGB8_RGBA8_V1'),
 profile_sha256 text not null check(profile_sha256='526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5'),
 run_token uuid not null unique,
 owner_run uuid,
 owner_fence bigint not null default 0 check(owner_fence between 0 and 9007199254740991),
 phase text not null default 'STARTING' check(phase in ('STARTING','RUNNING','TERMINATION_REQUIRED','UNKNOWN','TERMINAL')),
 termination_outstanding boolean not null default true,
 runtime_node_id uuid,
 container_id text check(container_id ~ '^[0-9a-f]{64}$'),
 check((runtime_node_id is null)=(container_id is null)),
 last_transition text not null default 'REGISTER' check(last_transition in ('REGISTER','CLAIM','TAKEOVER','ATTACH_IDENTITY','RUNNING','TERMINATION_REQUIRED','UNKNOWN','TERMINAL')),
 created_at timestamptz not null default clock_timestamp() check(isfinite(created_at)),
 transitioned_at timestamptz not null default clock_timestamp() check(isfinite(transitioned_at)),
 terminal_observed_at timestamptz check(isfinite(terminal_observed_at)),
 terminal_evidence_sha256 text check(terminal_evidence_sha256 ~ '^[0-9a-f]{64}$'),
 terminal_result text check(terminal_result in ('PARSE_PASS','PARSER_TIMEOUT','PARSER_CRASH','PARSER_RESOURCE_LIMIT','PARSER_OUTPUT_LIMIT','PARSER_PROTOCOL','FORMAT_REJECTED')),
 unique(operation_id,canonical_generation),
 unique(runtime_node_id,container_id),
 foreign key(source_id,representation_id) references public.trip_source_representations(source_id,id) on delete restrict,
 check((owner_run is null)=(owner_fence=0)),
 check((phase='TERMINAL')=(not termination_outstanding)),
 check((phase='TERMINAL')=(terminal_observed_at is not null)),
 check((phase='TERMINAL')=(terminal_evidence_sha256 is not null)),
 check((phase='TERMINAL')=(terminal_result is not null)),
 check(phase<>'TERMINAL' or container_id is not null and owner_run is not null and terminal_observed_at>=created_at),
 check(phase<>'RUNNING' or container_id is not null and owner_run is not null)
);
create unique index trip_source_execution_exclusive_representation
 on public.trip_source_execution_attempts(representation_id) where phase<>'TERMINAL';
-- Every operation locks resource BEFORE attempt. No lock spans external I/O.
create function public.trip_source_execution_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$begin
 if current_user<>'otr_trip_source_execution_writer' or tg_op in ('DELETE','TRUNCATE') then
  raise exception 'SOURCE_EXECUTION_PROTECTED';
 end if;
 return null;
end$$;
create trigger trip_source_stage_statement_guard before insert or update or delete or truncate
 on public.trip_source_staged_resources for each statement execute function public.trip_source_execution_guard();
create trigger trip_source_execution_statement_guard before insert or update or delete or truncate
 on public.trip_source_execution_attempts for each statement execute function public.trip_source_execution_guard();
revoke all on public.trip_source_staged_resources,public.trip_source_execution_attempts from public,anon,authenticated,service_role;
alter table public.trip_source_staged_resources enable row level security;
alter table public.trip_source_staged_resources force row level security;
alter table public.trip_source_execution_attempts enable row level security;
alter table public.trip_source_execution_attempts force row level security;
grant usage on schema public to otr_trip_source_execution_writer,otr_trip_source_execution_gateway;
grant select,insert,update on public.trip_source_staged_resources,public.trip_source_execution_attempts to otr_trip_source_execution_writer;
grant select on public.trip_source_operations to otr_trip_source_execution_writer;
create policy trip_source_execution_operation_read on public.trip_source_operations for select to otr_trip_source_execution_writer using(true);
create policy trip_source_stage_writer on public.trip_source_staged_resources to otr_trip_source_execution_writer using(true) with check(true);
create policy trip_source_execution_writer on public.trip_source_execution_attempts to otr_trip_source_execution_writer using(true) with check(true);

grant update(id) on public.trip_source_operations to otr_trip_source_execution_writer;
create policy trip_source_execution_operation_lock on public.trip_source_operations for update to otr_trip_source_execution_writer using(true) with check(false);

-- Exact authenticated C-I3D session principal, never caller worker strings/GUC/JWT.
create function public.trip_source_execution_register(operation uuid,attempt uuid,canonical_generation bigint,
 resource uuid,node uuid,resource_key text,run_token uuid,profile_id text,profile_sha256 text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare o public.trip_source_operations; s public.trip_source_staged_resources; a public.trip_source_execution_attempts;
begin
 if operation is null or attempt is null or canonical_generation is null or resource is null or node is null or resource_key is null or run_token is null or profile_id is null or profile_sha256 is null then raise exception 'SOURCE_EXECUTION_INVALID'; end if;
 select * into o from public.trip_source_operations where trip_source_operations.id=operation;
 if not found or o.worker_identity is distinct from session_user or o.attempt_id is distinct from attempt or o.attempt_generation is distinct from canonical_generation or o.phase not in ('IO_ACTIVE','IO_UNKNOWN') or o.command not in ('UPLOAD_ORIGINAL','RECOVER_REPRESENTATION') or o.bound_mime_type is distinct from 'image/png' then raise exception 'SOURCE_EXECUTION_OPERATION_CONFLICT'; end if;
 select * into s from public.trip_source_staged_resources where trip_source_staged_resources.id=resource for update;
 if found then
  if s.execution_principal<>session_user or s.node_id<>node or s.resource_key<>resource_key or s.release_authorized_at is not null or s.payload_sha256 is distinct from o.bound_payload_sha256 or s.byte_count is distinct from o.bound_byte_count then raise exception 'SOURCE_STAGE_CONFLICT'; end if;
 else
  insert into public.trip_source_staged_resources(id,execution_principal,node_id,resource_key,payload_sha256,byte_count) values(resource,session_user,node,resource_key,o.bound_payload_sha256,o.bound_byte_count) returning * into s;
 end if;
 select * into o from public.trip_source_operations where trip_source_operations.id=operation for update;
 if not found or o.worker_identity is distinct from session_user or o.attempt_id is distinct from attempt or o.attempt_generation is distinct from canonical_generation or o.phase not in ('IO_ACTIVE','IO_UNKNOWN') or o.command not in ('UPLOAD_ORIGINAL','RECOVER_REPRESENTATION') or o.bound_mime_type is distinct from 'image/png' then raise exception 'SOURCE_EXECUTION_OPERATION_CONFLICT'; end if;
 insert into public.trip_source_execution_attempts(id,operation_id,canonical_generation,trip_id,source_id,representation_id,operation_sha256,operation_key,material_revision,execution_principal,staged_resource_id,profile_id,profile_sha256,run_token,phase)
 values(attempt,o.id,canonical_generation,o.trip_id,o.source_id,o.representation_id,o.operation_sha256,o.operation_key,o.material_revision,session_user,resource,profile_id,profile_sha256,run_token,case when o.phase='IO_ACTIVE' and exists(select 1 from public.trip_source_operations x where x.id=o.id and x.xmin=pg_current_xact_id()::xid) then 'STARTING' else 'UNKNOWN' end) returning * into a;
 return to_jsonb(a);
end$$;
-- Private helper. No gateway grant. FOR UPDATE locks require the narrowly scoped
-- column UPDATE privilege on operation id, never canonical semantic mutation.
create function public.trip_source_execution_lock(attempt uuid,owner_run uuid,fence bigint)
 returns public.trip_source_execution_attempts
language plpgsql security invoker set search_path=pg_catalog as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts; resource uuid;
begin
 select staged_resource_id into resource from public.trip_source_execution_attempts where trip_source_execution_attempts.id=attempt and execution_principal=session_user;
 if not found then raise exception 'SOURCE_EXECUTION_FENCE_CONFLICT'; end if;
 perform 1 from public.trip_source_staged_resources where trip_source_staged_resources.id=resource for update;
 select * into a from public.trip_source_execution_attempts where trip_source_execution_attempts.id=attempt for update;
 if a.execution_principal<>session_user or a.owner_run is distinct from owner_run or a.owner_fence is distinct from fence then raise exception 'SOURCE_EXECUTION_FENCE_CONFLICT'; end if;
 return a;
end$$;
create function public.trip_source_execution_claim(attempt uuid,expected_fence bigint,new_owner_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts; resource uuid;
begin
 if expected_fence is null or new_owner_run is null then raise exception 'SOURCE_EXECUTION_INVALID'; end if;
 select staged_resource_id into resource from public.trip_source_execution_attempts where trip_source_execution_attempts.id=attempt and execution_principal=session_user;
 if not found then raise exception 'SOURCE_EXECUTION_FENCE_CONFLICT'; end if;
 perform 1 from public.trip_source_staged_resources where trip_source_staged_resources.id=resource for update;
 select * into a from public.trip_source_execution_attempts where trip_source_execution_attempts.id=attempt for update;
 if a.owner_fence<>expected_fence or a.owner_fence>=9007199254740991 or exists(select 1 from public.trip_source_staged_resources s where s.id=a.staged_resource_id and s.cleaned_at is not null) then raise exception 'SOURCE_EXECUTION_FENCE_CONFLICT'; end if;
 update public.trip_source_execution_attempts set owner_run=new_owner_run,owner_fence=a.owner_fence+1,
 phase=case when a.phase='TERMINAL' then 'TERMINAL' when a.owner_fence=0 then phase else 'UNKNOWN' end,last_transition=case when a.owner_fence=0 then 'CLAIM' else 'TAKEOVER' end,termination_outstanding=(a.phase<>'TERMINAL'),transitioned_at=clock_timestamp() where trip_source_execution_attempts.id=attempt returning * into a;
 return to_jsonb(a);
end$$;
create function public.trip_source_execution_attach(attempt uuid,owner_run uuid,fence bigint,node uuid,run_token uuid,container_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts; s public.trip_source_staged_resources;
begin
 a:=public.trip_source_execution_lock(attempt,owner_run,fence);
 select * into s from public.trip_source_staged_resources where trip_source_staged_resources.id=a.staged_resource_id;
 if a.owner_run is null or a.phase='TERMINAL' or node is distinct from s.node_id or run_token is distinct from a.run_token or container_id is null or container_id !~ '^[0-9a-f]{64}$' or a.container_id is not null then raise exception 'SOURCE_EXECUTION_IDENTITY_CONFLICT'; end if;
 update public.trip_source_execution_attempts set container_id=trip_source_execution_attach.container_id,runtime_node_id=node,last_transition='ATTACH_IDENTITY',transitioned_at=clock_timestamp() where trip_source_execution_attempts.id=attempt returning * into a;
 return to_jsonb(a);
end$$;
create function public.trip_source_execution_advance(attempt uuid,owner_run uuid,fence bigint,next_phase text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts;
begin
 a:=public.trip_source_execution_lock(attempt,owner_run,fence);
 if a.owner_run is null or a.phase='TERMINAL' or next_phase is null or not (
  next_phase='UNKNOWN' or next_phase='TERMINATION_REQUIRED' or next_phase='RUNNING' and a.phase='STARTING' and a.container_id is not null and a.owner_fence=1
 ) then raise exception 'SOURCE_EXECUTION_PHASE_CONFLICT'; end if;
 -- Takeover/UNKNOWN never authorizes another dispatch or a return to RUNNING.
 update public.trip_source_execution_attempts set phase=next_phase,last_transition=next_phase,termination_outstanding=true,transitioned_at=clock_timestamp() where trip_source_execution_attempts.id=attempt returning * into a;
 return to_jsonb(a);
end$$;
create function public.trip_source_execution_terminal(attempt uuid,owner_run uuid,fence bigint,node uuid,run_token uuid,container_id text,
 observed_at timestamptz,evidence_sha256 text,result text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts; s public.trip_source_staged_resources;
begin
 a:=public.trip_source_execution_lock(attempt,owner_run,fence);
 select * into s from public.trip_source_staged_resources where trip_source_staged_resources.id=a.staged_resource_id;
 -- Evidence digest refers to a sealed exact runtime observation supplied ONLY by
 -- the private trusted producer. SQL does not attest OS/container/provider death.
 if a.phase='TERMINAL' or a.owner_run is null or a.container_id is null or node is distinct from s.node_id or run_token is distinct from a.run_token or container_id is distinct from a.container_id or observed_at is null or not isfinite(observed_at) or observed_at<a.created_at or observed_at>clock_timestamp() or evidence_sha256 is null or evidence_sha256 !~ '^[0-9a-f]{64}$' or result is null then raise exception 'SOURCE_EXECUTION_PROOF_CONFLICT'; end if;
 update public.trip_source_execution_attempts set phase='TERMINAL',last_transition='TERMINAL',termination_outstanding=false,
 terminal_observed_at=observed_at,terminal_evidence_sha256=evidence_sha256,terminal_result=result,transitioned_at=clock_timestamp() where trip_source_execution_attempts.id=attempt returning * into a;
 return to_jsonb(a);
end$$;
create function public.trip_source_execution_release(attempt uuid,owner_run uuid,fence bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts; s public.trip_source_staged_resources;
begin
 a:=public.trip_source_execution_lock(attempt,owner_run,fence);
 perform 1 from public.trip_source_operations o join public.trip_source_execution_attempts x on x.operation_id=o.id where x.staged_resource_id=a.staged_resource_id order by o.id for update of o;
 if exists(select 1 from public.trip_source_execution_attempts x join public.trip_source_operations o on o.id=x.operation_id where x.staged_resource_id=a.staged_resource_id and o.phase not in ('IO_QUIESCENT','FINAL')) then raise exception 'SOURCE_STAGE_PROTECTED'; end if;
 if a.phase<>'TERMINAL' or a.termination_outstanding or exists(select 1 from public.trip_source_execution_attempts x where x.staged_resource_id=a.staged_resource_id and (x.phase<>'TERMINAL' or x.termination_outstanding)) then raise exception 'SOURCE_STAGE_PROTECTED'; end if;
 select * into s from public.trip_source_staged_resources where trip_source_staged_resources.id=a.staged_resource_id;
 if s.release_authorized_at is not null then return to_jsonb(s); end if;
 update public.trip_source_staged_resources set release_authorized_at=clock_timestamp() where trip_source_staged_resources.id=a.staged_resource_id returning * into s;
 return to_jsonb(s);
end$$;
-- Authorization is not physical deletion. Pending cleanup survives process loss.
create function public.trip_source_execution_cleaned(attempt uuid,owner_run uuid,fence bigint,node uuid,resource_key text,evidence_sha256 text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
#variable_conflict use_variable
declare a public.trip_source_execution_attempts; s public.trip_source_staged_resources;
begin
 a:=public.trip_source_execution_lock(attempt,owner_run,fence);
 perform 1 from public.trip_source_operations o join public.trip_source_execution_attempts x on x.operation_id=o.id where x.staged_resource_id=a.staged_resource_id order by o.id for update of o;
 if exists(select 1 from public.trip_source_execution_attempts x join public.trip_source_operations o on o.id=x.operation_id where x.staged_resource_id=a.staged_resource_id and o.phase not in ('IO_QUIESCENT','FINAL')) then raise exception 'SOURCE_STAGE_PROTECTED'; end if;
 select * into s from public.trip_source_staged_resources where trip_source_staged_resources.id=a.staged_resource_id;
 if a.phase<>'TERMINAL' or a.termination_outstanding or s.release_authorized_at is null or node is distinct from s.node_id or resource_key is distinct from s.resource_key or evidence_sha256 is null or evidence_sha256 !~ '^[0-9a-f]{64}$' or exists(select 1 from public.trip_source_execution_attempts x where x.staged_resource_id=a.staged_resource_id and (x.phase<>'TERMINAL' or x.termination_outstanding)) then raise exception 'SOURCE_STAGE_PROTECTED'; end if;
 if s.cleaned_at is not null then
  if s.cleanup_evidence_sha256<>evidence_sha256 then raise exception 'SOURCE_STAGE_PROOF_CONFLICT'; end if;
  return to_jsonb(s);
 end if;
 update public.trip_source_staged_resources set cleaned_at=clock_timestamp(),cleanup_evidence_sha256=evidence_sha256 where trip_source_staged_resources.id=a.staged_resource_id returning * into s;
 return to_jsonb(s);
end$$;
create function public.trip_source_execution_inventory() returns jsonb
language sql stable security definer set search_path=pg_catalog set timezone='UTC' set datestyle='ISO, YMD' as $$
 select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('staged_resource',to_jsonb(s)) order by a.id),'[]'::jsonb)
 from public.trip_source_execution_attempts a join public.trip_source_staged_resources s on s.id=a.staged_resource_id
 where a.execution_principal=session_user and (a.phase<>'TERMINAL' or s.cleaned_at is null)
$$;

-- Reject polluted materialized defaults before revocation; API defaults are not authority.
do $$ declare r text; begin
 foreach r in array array['otr_trip_source_execution_writer','otr_trip_source_execution_gateway'] loop
 if exists(select 1 from pg_class c where c.oid in ('public.trip_source_staged_resources'::regclass,'public.trip_source_execution_attempts'::regclass) and
 has_table_privilege(r,c.oid,'DELETE,TRUNCATE,REFERENCES,TRIGGER')) then raise exception 'UNSAFE_TRIP_SOURCE_EXECUTION_DEFAULT_GRANTS'; end if;
 end loop;
end$$;
grant otr_trip_source_execution_writer to postgres with inherit false,set true;
grant create on schema public to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_register(uuid,uuid,bigint,uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_execution_register(uuid,uuid,bigint,uuid,uuid,text,uuid,text,text) to otr_trip_source_execution_gateway;
alter function public.trip_source_execution_register(uuid,uuid,bigint,uuid,uuid,text,uuid,text,text) owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_lock(uuid,uuid,bigint) from public,anon,authenticated,service_role;
alter function public.trip_source_execution_lock(uuid,uuid,bigint) owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_claim(uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_execution_claim(uuid,bigint,uuid) to otr_trip_source_execution_gateway;
alter function public.trip_source_execution_claim(uuid,bigint,uuid) owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_attach(uuid,uuid,bigint,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_execution_attach(uuid,uuid,bigint,uuid,uuid,text) to otr_trip_source_execution_gateway;
alter function public.trip_source_execution_attach(uuid,uuid,bigint,uuid,uuid,text) owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_advance(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_execution_advance(uuid,uuid,bigint,text) to otr_trip_source_execution_gateway;
alter function public.trip_source_execution_advance(uuid,uuid,bigint,text) owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_terminal(uuid,uuid,bigint,uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_execution_terminal(uuid,uuid,bigint,uuid,uuid,text,timestamptz,text,text) to otr_trip_source_execution_gateway;
alter function public.trip_source_execution_terminal(uuid,uuid,bigint,uuid,uuid,text,timestamptz,text,text) owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_release(uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_execution_release(uuid,uuid,bigint) to otr_trip_source_execution_gateway;
alter function public.trip_source_execution_release(uuid,uuid,bigint) owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_inventory() from public,anon,authenticated,service_role;
grant execute on function public.trip_source_execution_inventory() to otr_trip_source_execution_gateway;
alter function public.trip_source_execution_inventory() owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_cleaned(uuid,uuid,bigint,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_execution_cleaned(uuid,uuid,bigint,uuid,text,text) to otr_trip_source_execution_gateway;
alter function public.trip_source_execution_cleaned(uuid,uuid,bigint,uuid,text,text) owner to otr_trip_source_execution_writer;
revoke all on function public.trip_source_execution_guard() from public,anon,authenticated,service_role;
revoke create on schema public from otr_trip_source_execution_writer;
grant otr_trip_source_execution_writer to postgres with inherit false,set false;
-- Complete pg_shdepend final allowlist, exact class/database/schema/signature/owner.
create temporary table ci3h_owned_routines(oid oid primary key) on commit drop;
insert into ci3h_owned_routines values('public.trip_source_execution_register(uuid,uuid,bigint,uuid,uuid,text,uuid,text,text)'::regprocedure);
insert into ci3h_owned_routines values('public.trip_source_execution_lock(uuid,uuid,bigint)'::regprocedure);
insert into ci3h_owned_routines values('public.trip_source_execution_claim(uuid,bigint,uuid)'::regprocedure);
insert into ci3h_owned_routines values('public.trip_source_execution_attach(uuid,uuid,bigint,uuid,uuid,text)'::regprocedure);
insert into ci3h_owned_routines values('public.trip_source_execution_advance(uuid,uuid,bigint,text)'::regprocedure);
insert into ci3h_owned_routines values('public.trip_source_execution_terminal(uuid,uuid,bigint,uuid,uuid,text,timestamptz,text,text)'::regprocedure);
insert into ci3h_owned_routines values('public.trip_source_execution_release(uuid,uuid,bigint)'::regprocedure);
insert into ci3h_owned_routines values('public.trip_source_execution_inventory()'::regprocedure);
insert into ci3h_owned_routines values('public.trip_source_execution_cleaned(uuid,uuid,bigint,uuid,text,text)'::regprocedure);
do $$declare role_name text; rid oid; begin
 foreach role_name in array array['otr_trip_source_execution_writer','otr_trip_source_execution_gateway'] loop
 select oid into rid from pg_roles where rolname=role_name;
 if exists(select 1 from pg_shdepend d where d.refclassid='pg_authid'::regclass and d.refobjid=rid and d.deptype='o' and not
 (role_name='otr_trip_source_execution_writer' and d.dbid=(select oid from pg_database where datname=current_database()) and d.classid='pg_proc'::regclass and exists(select 1 from ci3h_owned_routines a join pg_proc p on p.oid=a.oid join pg_namespace n on n.oid=p.pronamespace where a.oid=d.objid and p.proowner=rid and n.nspname='public'))) then raise exception 'UNSAFE_TRIP_SOURCE_EXECUTION_OWNERSHIP'; end if;
 end loop;
end$$;
commit;
