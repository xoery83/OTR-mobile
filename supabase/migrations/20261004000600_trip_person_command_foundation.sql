begin;
set local search_path=pg_catalog;
-- A1-I2C2: closed foundation. No runtime credentials or canonical mutation grants.
-- Exact inherited baseline utility inventory; never accept an arbitrary routine by
-- schema, PUBLIC ACL, or name prefix. Fingerprints forbid replacement of a trusted
-- baseline signature. pg_catalog/information_schema and actual extension-member
-- routines are platform capabilities, not application routines. User-created
-- helpers in extensions/auth/storage/any other schema remain in the scan.
create temporary table ai2c2_baseline_routines(signature text primary key, definition_sha256 text not null) on commit drop;
insert into ai2c2_baseline_routines values
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
 foreach role_name in array array['otr_trip_person_lifecycle_writer','otr_trip_person_command_gateway','otr_trip_person_receipt_reader'] loop
  if not exists(select 1 from pg_roles where rolname=role_name) then
   execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',role_name);
  end if;
  select * into r from pg_roles where rolname=role_name;
  -- Ownership is DDL authority across every catalog, including shared objects
  -- and objects in other databases. The accepted baseline owns nothing.
  if exists(select 1 from pg_shdepend d where d.refclassid='pg_authid'::regclass
   and d.refobjid=r.oid and d.deptype='o') then
   raise exception 'UNSAFE_TRIP_PERSON_COMMAND_OWNERSHIP: %',role_name;
  end if;
  if r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolbypassrls or r.rolreplication
   or exists(select 1 from pg_auth_members m where m.member=r.oid or m.roleid=r.oid
     and (m.set_option or m.inherit_option or m.member<>(select oid from pg_roles where rolname='postgres')))
   or exists(select 1 from pg_proc where proowner=r.oid)
   or exists(select 1 from pg_class where relowner=r.oid)
   or exists(select 1 from pg_namespace where nspowner=r.oid)
   or exists(select 1 from pg_namespace n where n.nspname not in ('pg_catalog','information_schema')
    and n.nspname !~ '^pg_(toast|temp)' and has_schema_privilege(role_name,n.oid,'CREATE')) then
    raise exception 'UNSAFE_TRIP_PERSON_COMMAND_ROLE: %',role_name;
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and c.relkind in ('r','p','v','m','f') and
    (has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and has_column_privilege(role_name,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) then
   raise exception 'UNSAFE_TRIP_PERSON_COMMAND_GRANTS: %',role_name;
  end if;
  select p.oid::regprocedure::text into unexpected from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
    and p.prokind in ('f','p') and not exists(select 1 from pg_depend d
      where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege(role_name,p.oid,'EXECUTE') and not exists(select 1 from ai2c2_baseline_routines b
      where to_regprocedure(b.signature)=p.oid and b.definition_sha256=encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) limit 1;
  unexpected:=coalesce(unexpected,(select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
     and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
     and case when c.relkind='S' then has_sequence_privilege(role_name,c.oid,'USAGE,SELECT,UPDATE') else false end limit 1));
  if unexpected is not null then
   raise exception 'UNSAFE_TRIP_PERSON_COMMAND_CAPABILITY: % [%]',role_name,unexpected;
  end if;
  -- Explicit default ACLs must not grant any reserved identity or PUBLIC objects.
  -- Normal implicit PUBLIC EXECUTE at CREATE FUNCTION is revoked on our new
  -- routines; explicit global/schema default grants are incompatible state.
  if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclobjtype in ('r','S','f') and (a.grantee=0 or a.grantee=r.oid
    or a.grantee<>0 and pg_has_role(role_name,a.grantee,'USAGE'))) then
   raise exception 'UNSAFE_TRIP_PERSON_COMMAND_DEFAULT_GRANTS: %',role_name;
  end if;
 end loop;
end $$;


grant otr_trip_person_lifecycle_writer,otr_trip_person_receipt_reader to postgres with set true;
grant create on schema public to otr_trip_person_lifecycle_writer,otr_trip_person_receipt_reader;
create table public.trip_person_command_gate (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false constraint trip_person_gate_closed check(not enabled)
);
insert into public.trip_person_command_gate values(true,false);
create table public.trip_person_participation_receipts (
 id uuid primary key,
 trip_id uuid not null, person_id uuid not null, actor_user_id uuid not null,
 actor_member_id uuid not null, idempotency_key uuid not null,
 contract_version smallint not null check(contract_version=1),
 command text not null check(command='SET_PARTICIPATION'), codec_version smallint not null check(codec_version=1),
 asserted_actor_member_id uuid,
 desired_participation_active boolean not null,
 expected_participation_active boolean not null,
 observed_participation_revision bigint not null check(observed_participation_revision between 0 and 9007199254740991),
 reason text check(reason is null or char_length(reason) between 1 and 2000 and reason=btrim(reason,E' \t\r\n')),
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 outcome text not null check(outcome in ('APPLIED','UNCHANGED','REVISION_CONFLICT')),
 prior_participation_active boolean not null, resulting_participation_active boolean not null,
 prior_participation_revision bigint not null check(prior_participation_revision between 0 and 9007199254740991),
 resulting_participation_revision bigint not null check(resulting_participation_revision between 0 and 9007199254740991),
 committed_at timestamptz(6) not null check(isfinite(committed_at)),
 transaction_id bigint not null,
 result_json jsonb not null check(jsonb_typeof(result_json)='object'),
 result_hash text not null check(result_hash ~ '^[0-9a-f]{64}$'),
 unique(actor_user_id,idempotency_key),
 check(asserted_actor_member_id is null or asserted_actor_member_id=actor_member_id),
 check((outcome='APPLIED' and observed_participation_revision=prior_participation_revision and expected_participation_active=prior_participation_active and resulting_participation_active<>prior_participation_active and desired_participation_active=resulting_participation_active and resulting_participation_revision=prior_participation_revision+1)
  or (outcome='UNCHANGED' and observed_participation_revision=prior_participation_revision and expected_participation_active=prior_participation_active and desired_participation_active=prior_participation_active and resulting_participation_active=prior_participation_active and resulting_participation_revision=prior_participation_revision)
  or (outcome='REVISION_CONFLICT' and observed_participation_revision<>prior_participation_revision and resulting_participation_active=prior_participation_active and resulting_participation_revision=prior_participation_revision))
);
create unique index trip_person_transition_evidence on public.trip_person_participation_receipts(trip_id,person_id,resulting_participation_revision) where outcome='APPLIED';
-- Validate materialized defaults before revocation; reject, never sanitize.
do $$ declare role_name text; begin
 foreach role_name in array array['otr_trip_person_lifecycle_writer','otr_trip_person_command_gateway','otr_trip_person_receipt_reader'] loop
  if exists(select 1 from pg_class c where c.oid=any(array['public.trip_person_command_gate'::regclass,'public.trip_person_participation_receipts'::regclass]) and (has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and has_column_privilege(role_name,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) then raise exception 'UNSAFE_TRIP_PERSON_COMMAND_DEFAULT_GRANTS: %',role_name; end if;
 end loop;
end $$;
revoke all on public.trip_person_command_gate,public.trip_person_participation_receipts from public,anon,authenticated,service_role;
alter table public.trip_person_command_gate enable row level security;
alter table public.trip_person_command_gate force row level security;
alter table public.trip_person_participation_receipts enable row level security;
alter table public.trip_person_participation_receipts force row level security;
grant usage on schema public,extensions to otr_trip_person_lifecycle_writer,otr_trip_person_receipt_reader,otr_trip_person_command_gateway;
grant select on public.trip_person_command_gate to otr_trip_person_lifecycle_writer;
grant select,insert on public.trip_person_participation_receipts to otr_trip_person_lifecycle_writer;
grant select on public.trip_person_participation_receipts,public.journey_members to otr_trip_person_receipt_reader;
create policy trip_person_gate_read on public.trip_person_command_gate for select to otr_trip_person_lifecycle_writer using(true);
create policy trip_person_receipt_writer_read on public.trip_person_participation_receipts for select to otr_trip_person_lifecycle_writer using(true);
create policy trip_person_receipt_writer_insert on public.trip_person_participation_receipts for insert to otr_trip_person_lifecycle_writer with check(true);
create policy trip_person_receipt_read on public.trip_person_participation_receipts for select to otr_trip_person_receipt_reader using(true);
create policy trip_person_authority_read on public.journey_members for select to otr_trip_person_receipt_reader using(true);

create function public.trip_person_hash(prefix text,value jsonb) returns text
language sql immutable security invoker set search_path=pg_catalog
as $$ select encode(extensions.digest(convert_to(prefix||E'\n'||public.trip_event_canonical_json(value::json),'UTF8'),'sha256'),'hex') $$;
create function public.trip_person_intent_tuple(j jsonb) returns jsonb
language sql immutable security invoker set search_path=pg_catalog
as $$ select jsonb_build_array(1,'SET_PARTICIPATION',j->'operationId',j->'actorUserId',j->'actorMemberId',j->'tripId',j->'personId',j->'expectedParticipation'->'isParticipating',j->'expectedParticipation'->>'revision',j->'isParticipating',j->'reason') $$;
create function public.trip_person_command_codec(raw text) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog
as $$ declare j jsonb; f text; begin
 if raw is null or octet_length(raw)>32768 then raise exception 'INVALID_PARTICIPATION_COMMAND'; end if;
 j:=public.trip_event_canonical_json(raw::json)::jsonb;
 if not public.trip_event_keys(j,array['contractVersion','command','operationId','actorUserId','actorMemberId','tripId','personId','expectedParticipation','isParticipating','reason','intentDigest']) or j->'contractVersion' is distinct from '1'::jsonb or j->>'command' is distinct from 'SET_PARTICIPATION' then raise exception 'INVALID_PARTICIPATION_COMMAND'; end if;
 foreach f in array array['operationId','actorUserId','tripId','personId'] loop
  if jsonb_typeof(j->f)<>'string' or j->>f !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_PARTICIPATION_COMMAND'; end if;
 end loop;
 if j->'actorMemberId'<>'null'::jsonb and (jsonb_typeof(j->'actorMemberId')<>'string' or j->>'actorMemberId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'INVALID_PARTICIPATION_COMMAND'; end if;
 if not public.trip_event_keys(j->'expectedParticipation',array['isParticipating','revision']) or jsonb_typeof(j->'expectedParticipation'->'isParticipating')<>'boolean' or jsonb_typeof(j->'isParticipating')<>'boolean' or jsonb_typeof(j->'expectedParticipation'->'revision')<>'number' or (j->'expectedParticipation'->>'revision')::numeric not between 0 and 9007199254740991 then raise exception 'INVALID_PARTICIPATION_COMMAND'; end if;
 if j->'reason'<>'null'::jsonb and (jsonb_typeof(j->'reason')<>'string' or char_length(j->>'reason') not between 1 and 2000 or j->>'reason'<>btrim(j->>'reason',E' \t\r\n')) then raise exception 'INVALID_PARTICIPATION_COMMAND'; end if;
 if jsonb_typeof(j->'intentDigest')<>'string' or j->>'intentDigest' is distinct from public.trip_person_hash('otr-trip-person-intent-v1',public.trip_person_intent_tuple(j)) then raise exception 'INVALID_PARTICIPATION_COMMAND'; end if;
 return j;
end $$;
create function public.trip_person_result_tuple(j jsonb) returns jsonb
language sql immutable security invoker set search_path=pg_catalog
as $$ select jsonb_build_array(j->'receiptVersion',j->'receiptId',j->'contractVersion',j->'command',j->'operationId',j->'actorUserId',j->'actorMemberId',j->'tripId',j->'personId',j->'intentDigest',jsonb_build_array(j->'expectedParticipation'->'isParticipating',j->'expectedParticipation'->>'revision'),j->'desiredParticipation',j->'outcome',jsonb_build_array(j->'priorParticipation'->'isParticipating',j->'priorParticipation'->>'revision'),jsonb_build_array(j->'resultingParticipation'->'isParticipating',j->'resultingParticipation'->>'revision'),j->'errorCode',j->'observedAt') $$;
create function public.trip_person_receipt_reply(r public.trip_person_participation_receipts,replay boolean) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog
as $$ begin
 if r.result_hash is distinct from public.trip_person_hash('otr-trip-person-result-v1',public.trip_person_result_tuple(r.result_json)) then raise exception 'REPLAY_UNAVAILABLE'; end if;
 return jsonb_build_object('receipt',r.result_json,'resultDigest',r.result_hash,'idempotentReplay',replay);
end $$;
create function public.trip_person_owner_admission(actor uuid,trip uuid) returns uuid
language plpgsql stable security definer set search_path=pg_catalog
as $$ declare person uuid; begin
 if session_user<>'otr_trip_person_command_gateway' then raise exception 'PARTICIPATION_FORBIDDEN' using errcode='42501'; end if;
 select id into person from public.journey_members where trip_id=trip and user_id=actor and status='linked' and role='owner';
 if person is null then raise exception 'PARTICIPATION_FORBIDDEN' using errcode='42501'; end if;
 return person;
end $$;
alter function public.trip_person_owner_admission(uuid,uuid) owner to otr_trip_person_receipt_reader;
create function public.trip_person_receipt_lookup(actor uuid,trip uuid,operation uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog
as $$ declare r public.trip_person_participation_receipts; begin
 perform public.trip_person_owner_admission(actor,trip);
 select * into r from public.trip_person_participation_receipts where actor_user_id=actor and trip_id=trip and idempotency_key=operation;
 if not found then return null; end if;
 return public.trip_person_receipt_reply(r,true);
end $$;
alter function public.trip_person_receipt_lookup(uuid,uuid,uuid) owner to otr_trip_person_receipt_reader;

create function public.trip_person_receipt_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $$ begin
 if tg_op<>'INSERT' or current_user<>'otr_trip_person_lifecycle_writer' or session_user<>'otr_trip_person_command_gateway' then raise exception 'PARTICIPATION_RECEIPT_IMMUTABLE' using errcode='42501'; end if;
 return null;
end $$;
create trigger trip_person_receipt_statement_guard before insert or update or delete or truncate on public.trip_person_participation_receipts for each statement execute function public.trip_person_receipt_guard();
create function public.trip_person_receipt_validate() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $$ declare j jsonb; begin
 j:=jsonb_build_object('contractVersion',1,'command',NEW.command,'operationId',NEW.idempotency_key,'actorUserId',NEW.actor_user_id,'actorMemberId',NEW.asserted_actor_member_id,'tripId',NEW.trip_id,'personId',NEW.person_id,'expectedParticipation',jsonb_build_object('isParticipating',NEW.expected_participation_active,'revision',NEW.observed_participation_revision),'isParticipating',NEW.desired_participation_active,'reason',NEW.reason,'intentDigest',NEW.request_hash);
 perform public.trip_person_command_codec(j::text);
 if NEW.transaction_id<>txid_current() or NEW.result_json is distinct from jsonb_build_object('receiptVersion',1,'receiptId',NEW.id,'contractVersion',1,'command',NEW.command,'operationId',NEW.idempotency_key,'actorUserId',NEW.actor_user_id,'actorMemberId',NEW.actor_member_id,'tripId',NEW.trip_id,'personId',NEW.person_id,'intentDigest',NEW.request_hash,'expectedParticipation',j->'expectedParticipation','desiredParticipation',NEW.desired_participation_active,'outcome',NEW.outcome,'priorParticipation',jsonb_build_object('isParticipating',NEW.prior_participation_active,'revision',NEW.prior_participation_revision),'resultingParticipation',jsonb_build_object('isParticipating',NEW.resulting_participation_active,'revision',NEW.resulting_participation_revision),'errorCode',case when NEW.outcome='REVISION_CONFLICT' then 'PARTICIPATION_REVISION_CONFLICT' end,'observedAt',public.trip_event_utc_timestamp(NEW.committed_at)) or NEW.result_hash is distinct from public.trip_person_hash('otr-trip-person-result-v1',public.trip_person_result_tuple(NEW.result_json)) then raise exception 'PARTICIPATION_RECEIPT_INVALID'; end if;
 return NEW;
end $$;
create trigger trip_person_receipt_validation before insert on public.trip_person_participation_receipts for each row execute function public.trip_person_receipt_validate();
-- Same ordinary preservation semantics; private execution remains closed. Future
-- activation needs reviewed column grants AND this gate AND exact gateway session.
create or replace function public.guard_trip_person_participation() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $$ begin
 if current_user='otr_trip_person_lifecycle_writer' then
  if session_user<>'otr_trip_person_command_gateway' or not coalesce((select enabled from public.trip_person_command_gate where singleton),false) then raise exception 'PARTICIPATION_COMMANDS_DISABLED' using errcode='42501'; end if;
  if tg_op<>'UPDATE' or NEW.participation_active=OLD.participation_active or NEW.participation_revision<>OLD.participation_revision+1 then raise exception 'PARTICIPATION_TRANSITION_INVALID'; end if;
 else
  if tg_op='INSERT' then NEW.participation_active:=true; NEW.participation_revision:=0;
  else NEW.participation_active:=OLD.participation_active; NEW.participation_revision:=OLD.participation_revision; end if;
 end if;
 return NEW;
end $$;
create function public.trip_person_transition_evidence_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog
as $$ begin
 if (NEW.participation_active,NEW.participation_revision) is distinct from (OLD.participation_active,OLD.participation_revision) and not exists(select 1 from public.trip_person_participation_receipts where transaction_id=txid_current() and trip_id=NEW.trip_id and person_id=NEW.id and outcome='APPLIED' and prior_participation_active=OLD.participation_active and prior_participation_revision=OLD.participation_revision and resulting_participation_active=NEW.participation_active and resulting_participation_revision=NEW.participation_revision) then raise exception 'PARTICIPATION_TRANSITION_EVIDENCE_REQUIRED'; end if;
 return null;
end $$;
create constraint trigger trip_person_transition_evidence_guard after update on public.journey_members deferrable initially deferred for each row when (old.participation_active is distinct from new.participation_active or old.participation_revision is distinct from new.participation_revision) execute function public.trip_person_transition_evidence_guard();

create function public.trip_person_set_participation(actor uuid,raw text) returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$ declare j jsonb; actor_member uuid; target public.journey_members; r public.trip_person_participation_receipts; trip uuid; operation uuid; person uuid; expected bigint; desired boolean; active boolean; rev bigint; result jsonb; outcome text; t timestamptz; receipt_id uuid;
begin
 j:=public.trip_person_command_codec(raw); trip:=(j->>'tripId')::uuid; person:=(j->>'personId')::uuid; operation:=(j->>'operationId')::uuid;
 if actor is distinct from (j->>'actorUserId')::uuid then raise exception 'PARTICIPATION_FORBIDDEN' using errcode='42501'; end if;
 actor_member:=public.trip_person_owner_admission(actor,trip);
 select * into r from public.trip_person_participation_receipts where actor_user_id=actor and idempotency_key=operation;
 if found then
  if r.request_hash<>j->>'intentDigest' then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
  return public.trip_person_receipt_reply(r,true);
 end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'PARTICIPATION_ISOLATION_UNSUPPORTED' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(hashtextextended('otr-trip-person-operation:'||actor::text||':'||operation::text,0));
 actor_member:=public.trip_person_owner_admission(actor,trip);
 select * into r from public.trip_person_participation_receipts where actor_user_id=actor and idempotency_key=operation;
 if found then
  if r.request_hash<>j->>'intentDigest' then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
  return public.trip_person_receipt_reply(r,true);
 end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('otr-trip-person-activation',0));
 if not coalesce((select enabled from public.trip_person_command_gate where singleton),false) then raise exception 'PARTICIPATION_COMMANDS_DISABLED' using errcode='42501'; end if;
 -- No DML/locking grant is installed; this path is unreachable while CLOSED.
 perform id from public.journey_members where id in (actor_member,person) and trip_id=trip order by id for update;
 actor_member:=public.trip_person_owner_admission(actor,trip);
 if j->'actorMemberId'<>'null'::jsonb and j->>'actorMemberId'<>actor_member::text then raise exception 'PARTICIPATION_FORBIDDEN' using errcode='42501'; end if;
 select * into target from public.journey_members where id=person and trip_id=trip;
 if not found then raise exception 'PERSON_NOT_FOUND'; end if;
 expected:=(j->'expectedParticipation'->>'revision')::bigint; desired:=(j->>'isParticipating')::boolean;
 active:=target.participation_active; rev:=target.participation_revision;
 if expected<>rev then outcome:='REVISION_CONFLICT';
 elsif (j->'expectedParticipation'->>'isParticipating')::boolean<>active then raise exception 'PARTICIPATION_BASE_INCONSISTENT';
 elsif desired=active then outcome:='UNCHANGED';
 else
  if rev=9007199254740991 then raise exception 'PARTICIPATION_REVISION_EXHAUSTED'; end if;
  set constraints public.trip_person_transition_evidence_guard deferred;
  outcome:='APPLIED'; active:=desired; rev:=rev+1;
  update public.journey_members set participation_active=active,participation_revision=rev where id=person and trip_id=trip;
 end if;
 t:=clock_timestamp(); receipt_id:=gen_random_uuid();
 result:=jsonb_build_object('receiptVersion',1,'receiptId',receipt_id,'contractVersion',1,'command','SET_PARTICIPATION','operationId',operation,'actorUserId',actor,'actorMemberId',actor_member,'tripId',trip,'personId',person,'intentDigest',j->'intentDigest','expectedParticipation',j->'expectedParticipation','desiredParticipation',desired,'outcome',outcome,'priorParticipation',jsonb_build_object('isParticipating',target.participation_active,'revision',target.participation_revision),'resultingParticipation',jsonb_build_object('isParticipating',active,'revision',rev),'errorCode',case when outcome='REVISION_CONFLICT' then 'PARTICIPATION_REVISION_CONFLICT' end,'observedAt',public.trip_event_utc_timestamp(t));
 insert into public.trip_person_participation_receipts values(receipt_id,trip,person,actor,actor_member,operation,1,'SET_PARTICIPATION',1,(j->>'actorMemberId')::uuid,desired,(j->'expectedParticipation'->>'isParticipating')::boolean,expected,j->>'reason',j->>'intentDigest',outcome,target.participation_active,active,target.participation_revision,rev,t,txid_current(),result,public.trip_person_hash('otr-trip-person-result-v1',public.trip_person_result_tuple(result))) returning * into r;
 return public.trip_person_receipt_reply(r,false);
end $$;
alter function public.trip_person_set_participation(uuid,text) owner to otr_trip_person_lifecycle_writer;
revoke all on function public.trip_person_hash(text,jsonb) from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_intent_tuple(jsonb) from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_command_codec(text) from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_result_tuple(jsonb) from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_receipt_reply(public.trip_person_participation_receipts,boolean) from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_owner_admission(uuid,uuid) from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_set_participation(uuid,text) from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_receipt_guard() from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_receipt_validate() from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.guard_trip_person_participation() from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_receipt_lookup(uuid,uuid,uuid) from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
revoke all on function public.trip_person_transition_evidence_guard() from public,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_command_gateway,otr_trip_person_receipt_reader;
grant execute on function public.trip_person_hash(text,jsonb),public.trip_person_intent_tuple(jsonb),public.trip_person_command_codec(text),public.trip_person_result_tuple(jsonb),public.trip_person_receipt_reply(public.trip_person_participation_receipts,boolean),public.trip_person_owner_admission(uuid,uuid),public.trip_person_set_participation(uuid,text),public.trip_person_receipt_guard(),public.trip_person_receipt_validate(),public.guard_trip_person_participation(),public.trip_event_canonical_json(json,integer),public.trip_event_keys(jsonb,text[],text[]),public.trip_event_utc_timestamp(timestamp with time zone) to otr_trip_person_lifecycle_writer;
grant execute on function public.trip_person_hash(text,jsonb),public.trip_person_result_tuple(jsonb),public.trip_person_receipt_reply(public.trip_person_participation_receipts,boolean),public.trip_person_owner_admission(uuid,uuid),public.trip_person_receipt_lookup(uuid,uuid,uuid),public.trip_event_canonical_json(json,integer) to otr_trip_person_receipt_reader;
grant execute on function public.trip_person_set_participation(uuid,text),public.trip_person_receipt_lookup(uuid,uuid,uuid) to otr_trip_person_command_gateway;
grant execute on function extensions.digest(bytea,text) to otr_trip_person_lifecycle_writer,otr_trip_person_receipt_reader;
revoke create on schema public from otr_trip_person_lifecycle_writer,otr_trip_person_receipt_reader;
grant otr_trip_person_lifecycle_writer,otr_trip_person_receipt_reader to postgres with inherit false,set false;
-- Exact final application capability inventories. Unknown objects/privilege
-- classes cannot survive through any direct/PUBLIC/inherited ACL path.
do $$ declare role_name text; allowed text[]; owned text[]; obj record; a record; privilege text; permit boolean;
begin
 foreach role_name in array array['otr_trip_person_lifecycle_writer','otr_trip_person_command_gateway','otr_trip_person_receipt_reader'] loop
  allowed:=case role_name when 'otr_trip_person_lifecycle_writer' then array['public.trip_person_hash(text,jsonb)','public.trip_person_intent_tuple(jsonb)','public.trip_person_command_codec(text)','public.trip_person_result_tuple(jsonb)','public.trip_person_receipt_reply(public.trip_person_participation_receipts,boolean)','public.trip_person_owner_admission(uuid,uuid)','public.trip_person_set_participation(uuid,text)','public.trip_person_receipt_guard()','public.trip_person_receipt_validate()','public.guard_trip_person_participation()','public.trip_event_canonical_json(json,integer)','public.trip_event_keys(jsonb,text[],text[])','public.trip_event_utc_timestamp(timestamp with time zone)'] when 'otr_trip_person_command_gateway' then array['public.trip_person_set_participation(uuid,text)','public.trip_person_receipt_lookup(uuid,uuid,uuid)'] else array['public.trip_person_hash(text,jsonb)','public.trip_person_result_tuple(jsonb)','public.trip_person_receipt_reply(public.trip_person_participation_receipts,boolean)','public.trip_person_owner_admission(uuid,uuid)','public.trip_person_receipt_lookup(uuid,uuid,uuid)','public.trip_event_canonical_json(json,integer)'] end;
  owned:=case role_name when 'otr_trip_person_lifecycle_writer' then array['public.trip_person_set_participation(uuid,text)'] when 'otr_trip_person_receipt_reader' then array['public.trip_person_owner_admission(uuid,uuid)','public.trip_person_receipt_lookup(uuid,uuid,uuid)'] else array[]::text[] end;
  -- Only exact public routine identities in this database may be owned.
  -- All other catalogs, shared/database objects and subobjects fail closed.
  if exists(select 1 from pg_shdepend d where d.refclassid='pg_authid'::regclass
   and d.refobjid=role_name::regrole and d.deptype='o' and not (
    d.dbid=(select oid from pg_database where datname=current_database())
    and d.classid='pg_proc'::regclass and d.objsubid=0
    and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where p.oid=d.objid and n.nspname='public' and p.proowner=role_name::regrole
      and exists(select 1 from unnest(owned) signature where to_regprocedure(signature)=p.oid)))) then
   raise exception 'UNSAFE_TRIP_PERSON_COMMAND_FINAL_OWNERSHIP: %',role_name;
  end if;
  if exists(select 1 from pg_namespace n where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
   and (n.nspowner=role_name::regrole or has_schema_privilege(role_name,n.oid,'CREATE')))
   or exists(select 1 from pg_class where relowner=role_name::regrole)
   or exists(select 1 from pg_auth_members m where m.member=role_name::regrole or m.roleid=role_name::regrole
    and (m.set_option or m.inherit_option or m.member<>'postgres'::regrole)) then raise exception 'UNSAFE_TRIP_PERSON_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and p.prokind in ('f','p')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and ((p.proowner=role_name::regrole and not exists(select 1 from unnest(owned) x where to_regprocedure(x)=p.oid))
      or has_function_privilege(role_name,p.oid,'EXECUTE') and not exists(select 1 from unnest(allowed) x where to_regprocedure(x)=p.oid)
       and not exists(select 1 from ai2c2_baseline_routines b where to_regprocedure(b.signature)=p.oid
        and b.definition_sha256=encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')))) then
   raise exception 'UNSAFE_TRIP_PERSON_COMMAND_FINAL_CAPABILITY: %',role_name;
  end if;
  for obj in select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and c.relkind in ('r','p','v','m','f','S') loop
   if obj.relkind='S' then
    if has_sequence_privilege(role_name,obj.oid,'USAGE,SELECT,UPDATE') then raise exception 'UNSAFE_TRIP_PERSON_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
    continue;
   end if;
   foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    permit:=(role_name='otr_trip_person_lifecycle_writer' and ((obj.oid='public.trip_person_command_gate'::regclass and privilege='SELECT') or (obj.oid='public.trip_person_participation_receipts'::regclass and privilege in ('SELECT','INSERT'))) or role_name='otr_trip_person_receipt_reader' and obj.oid=any(array['public.trip_person_participation_receipts'::regclass,'public.journey_members'::regclass]) and privilege='SELECT');
    if has_table_privilege(role_name,obj.oid,privilege) is distinct from permit then raise exception 'UNSAFE_TRIP_PERSON_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
    if privilege in ('SELECT','INSERT','UPDATE','REFERENCES') then
     for a in select attnum from pg_attribute where attrelid=obj.oid and attnum>0 and not attisdropped loop
      if has_column_privilege(role_name,obj.oid,a.attnum,privilege) is distinct from permit then raise exception 'UNSAFE_TRIP_PERSON_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
     end loop;
    end if;
   end loop;
  end loop;
 end loop;
end $$;


commit;
