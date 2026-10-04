begin;
set local search_path=pg_catalog;
-- B-T3D: closed foundation. No runtime credentials or canonical mutation grants.
-- Exact inherited baseline utility inventory; never accept an arbitrary routine by
-- schema, PUBLIC ACL, or name prefix. Fingerprints forbid replacement of a trusted
-- baseline signature. pg_catalog/information_schema and actual extension-member
-- routines are platform capabilities, not application routines. User-created
-- helpers in extensions/auth/storage/any other schema remain in the scan.
create temporary table bt3d_baseline_routines(signature text primary key, definition_sha256 text not null) on commit drop;
insert into bt3d_baseline_routines values
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
 foreach role_name in array array['otr_trip_event_semantic_writer','otr_trip_event_command_gateway','otr_trip_event_receipt_reader'] loop
  if not exists(select 1 from pg_roles where rolname=role_name) then
   execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',role_name);
  end if;
  select * into r from pg_roles where rolname=role_name;
  if r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolbypassrls or r.rolreplication
   or exists(select 1 from pg_auth_members m where m.member=r.oid or m.roleid=r.oid
     and (m.set_option or m.inherit_option or m.member<>(select oid from pg_roles where rolname='postgres')))
   or exists(select 1 from pg_proc where proowner=r.oid)
   or exists(select 1 from pg_class where relowner=r.oid)
   or exists(select 1 from pg_namespace where nspowner=r.oid)
   or exists(select 1 from pg_namespace n where n.nspname not in ('pg_catalog','information_schema')
    and n.nspname !~ '^pg_(toast|temp)' and has_schema_privilege(role_name,n.oid,'CREATE')) then
    raise exception 'UNSAFE_TRIP_EVENT_COMMAND_ROLE: %',role_name;
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and c.relkind in ('r','p','v','m') and
    (has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and has_column_privilege(role_name,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) then
   raise exception 'UNSAFE_TRIP_EVENT_COMMAND_GRANTS: %',role_name;
  end if;
  select p.oid::regprocedure::text into unexpected from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
    and p.prokind in ('f','p') and not exists(select 1 from pg_depend d
      where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege(role_name,p.oid,'EXECUTE') and not exists(select 1 from bt3d_baseline_routines b
      where to_regprocedure(b.signature)=p.oid and b.definition_sha256=encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) limit 1;
  unexpected:=coalesce(unexpected,(select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
     and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
     and case when c.relkind='S' then has_sequence_privilege(role_name,c.oid,'USAGE,SELECT,UPDATE') else false end limit 1));
  if unexpected is not null then
   raise exception 'UNSAFE_TRIP_EVENT_COMMAND_CAPABILITY: % [%]',role_name,unexpected;
  end if;
  -- Explicit default ACLs must not grant any reserved identity or PUBLIC objects.
  -- Normal implicit PUBLIC EXECUTE at CREATE FUNCTION is revoked on our new
  -- routines; explicit global/schema default grants are incompatible state.
  if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclobjtype in ('r','S','f') and (a.grantee=0 or a.grantee=r.oid
    or a.grantee<>0 and pg_has_role(role_name,a.grantee,'USAGE'))) then
   raise exception 'UNSAFE_TRIP_EVENT_COMMAND_DEFAULT_GRANTS: %',role_name;
  end if;
 end loop;
end $$;

-- postgres is not superuser on Supabase: temporary migration-only ownership rights.
grant otr_trip_event_semantic_writer,otr_trip_event_receipt_reader to postgres with set true;
grant create on schema public to otr_trip_event_semantic_writer,otr_trip_event_receipt_reader;
create table public.trip_event_command_gate (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false constraint trip_event_gate_closed check(not enabled)
);
insert into public.trip_event_command_gate values(true,false);
create table public.trip_event_operation_receipts (
 trip_id uuid not null references public.trips(id) on delete restrict,
 actor_account_id uuid not null references auth.users(id) on delete restrict,
 operation_key uuid not null,
 intent_version smallint not null check(intent_version=1),
 command text not null check(command in ('CREATE_EVENT','UPDATE_CORE_TEXT','UPDATE_TIME','UPDATE_LOCATION','UPDATE_GROUPING','UPDATE_STATUS')),
 command_version smallint not null check(command_version=1),
 intent_sha256 text not null check(intent_sha256 ~ '^[0-9a-f]{64}$'),
 target_event_id uuid not null,
 base_semantic_revision bigint,
 intended_payload text not null check(octet_length(intended_payload)<=32768),
 outcome text not null check(outcome in ('APPLIED','NO_CHANGE','CONFLICT','REJECTED')),
 result_event_id uuid,
 committed_semantic_revision bigint,
 observed_semantic_revision bigint,
 result_fields jsonb not null,
 confirmations jsonb not null,
 error_code text,
 submitted_http_status smallint not null check(submitted_http_status in (200,201,403,409,422)),
 receipt_version smallint not null check(receipt_version=1),
 receipt_sha256 text not null check(receipt_sha256 ~ '^[0-9a-f]{64}$'),
 committed_at timestamptz(6) not null check(isfinite(committed_at)),
 primary key(trip_id,actor_account_id,operation_key),
 check(operation_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 check(command='CREATE_EVENT' and base_semantic_revision is null or command<>'CREATE_EVENT' and base_semantic_revision between 1 and 9007199254740991 and base_semantic_revision is not null),
 check((outcome in ('APPLIED','NO_CHANGE'))=(result_event_id is not null)),
 check((outcome in ('APPLIED','NO_CHANGE'))=(committed_semantic_revision is not null)),
 check(result_event_id is null or result_event_id=target_event_id),
 check(committed_semantic_revision is null or committed_semantic_revision between 1 and 9007199254740991),
 check(observed_semantic_revision is null or observed_semantic_revision between 1 and 9007199254740991),
 check((outcome in ('APPLIED','NO_CHANGE'))=(error_code is null)),
 check(jsonb_typeof(result_fields)='object' and jsonb_typeof(confirmations)='object')
);
-- Check effective newly materialized default ACLs BEFORE normal API revocation.
-- Never sanitize a PUBLIC/reserved-role default capability and call reuse safe.
do $$ declare role_name text;
begin
 foreach role_name in array array['otr_trip_event_semantic_writer','otr_trip_event_command_gateway','otr_trip_event_receipt_reader'] loop
  if exists(select 1 from pg_class c where c.oid=any(array['public.trip_event_command_gate'::regclass,'public.trip_event_operation_receipts'::regclass])
   and (has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
     and has_column_privilege(role_name,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) then
   raise exception 'UNSAFE_TRIP_EVENT_COMMAND_DEFAULT_GRANTS: %',role_name;
  end if;
 end loop;
end $$;
-- Remove project default API grants only on these newly created objects.
revoke all on public.trip_event_command_gate,public.trip_event_operation_receipts from public,anon,authenticated,service_role;
alter table public.trip_event_command_gate enable row level security;
alter table public.trip_event_operation_receipts enable row level security;
grant usage on schema public to otr_trip_event_semantic_writer,otr_trip_event_command_gateway,otr_trip_event_receipt_reader;
grant select on public.trip_event_command_gate to otr_trip_event_semantic_writer;
grant select,insert on public.trip_event_operation_receipts to otr_trip_event_semantic_writer;
grant select on public.trip_event_operation_receipts,public.trips,public.trip_members,public.journey_members to otr_trip_event_receipt_reader;
create policy trip_event_gate_private_read on public.trip_event_command_gate for select to otr_trip_event_semantic_writer using(true);
create policy trip_event_receipt_writer_read on public.trip_event_operation_receipts for select to otr_trip_event_semantic_writer using(true);
create policy trip_event_receipt_writer_insert on public.trip_event_operation_receipts for insert to otr_trip_event_semantic_writer with check(true);
create policy trip_event_receipt_recovery_read on public.trip_event_operation_receipts for select to otr_trip_event_receipt_reader using(true);
create policy trip_event_admission_trip_read on public.trips for select to otr_trip_event_receipt_reader using(true);
create policy trip_event_admission_legacy_read on public.trip_members for select to otr_trip_event_receipt_reader using(true);
create policy trip_event_admission_person_read on public.journey_members for select to otr_trip_event_receipt_reader using(true);

-- Pure codecs. json, not jsonb, retains duplicate members/numeric spellings.
create function public.trip_event_canonical_json(j json, depth integer default 0)
returns text language plpgsql immutable security invoker set search_path=pg_catalog
as $$
declare kind text:=json_typeof(j); answer text; n numeric;
begin
 if depth>32 or j is null then raise exception 'INVALID_COMMAND'; end if;
 if kind='object' then
  if exists(select 1 from json_each(j) group by key having count(*)>1)
   or exists(select 1 from json_each(j) where key !~ '^[ -~]+$') then raise exception 'INVALID_COMMAND'; end if;
  select '{'||coalesce(string_agg(to_json(key)::text||':'||public.trip_event_canonical_json(value,depth+1),',' order by key collate "C"),'')||'}'
   into answer from json_each(j);
 elsif kind='array' then
  select '['||coalesce(string_agg(public.trip_event_canonical_json(value,depth+1),',' order by ord),'')||']'
   into answer from json_array_elements(j) with ordinality x(value,ord);
 elsif kind='number' then
  answer:=j::text;
  if answer !~ '^-?(0|[1-9][0-9]*)$' or answer='-0' then raise exception 'INVALID_COMMAND'; end if;
  n:=answer::numeric;
  if abs(n)>9007199254740991 then raise exception 'INVALID_COMMAND'; end if;
 elsif kind='string' then answer:=to_json(j#>>'{}')::text;
 else answer:=j::text;
 end if;
 return answer;
end $$;
create function public.trip_event_keys(j jsonb, required text[], optional text[] default '{}')
returns boolean language sql immutable security invoker set search_path=pg_catalog
as $$ select coalesce(jsonb_typeof(j)='object' and j ?& required and not exists
 (select 1 from jsonb_object_keys(j) k where not k=any(required||optional)),false) $$;
create function public.trip_event_coordinate(s text, lim numeric)
returns double precision language plpgsql immutable security invoker set search_path=pg_catalog
as $$ begin
 if s is null or s !~ '^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$' or s='-0'
  or length(regexp_replace(regexp_replace(s,'[-.]','','g'),'^0+',''))>17
  or abs(s::numeric)>lim then raise exception 'INVALID_COMMAND'; end if;
 return s::double precision;
end $$;

-- One receipt timestamp encoding, independent of session TimeZone/DateStyle.
create function public.trip_event_utc_timestamp(value timestamptz)
returns text language sql immutable strict security invoker set search_path=pg_catalog
as $$ select to_char(value at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;

-- Actual existing Backend admission predicate; no Actor inferred from JWT/GUC.
create function public.trip_event_admission(actor uuid, trip uuid, writing boolean)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select exists(select 1 from public.trips where id=trip and created_by=actor)
 or exists(select 1 from public.trip_members where trip_id=trip and user_id=actor)
 or exists(select 1 from public.journey_members where trip_id=trip and user_id=actor
  and status='linked' and (not writing or role in ('owner','group_member'))) $$;
alter function public.trip_event_admission(uuid,uuid,boolean) owner to otr_trip_event_receipt_reader;

create function public.trip_event_receipt_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ begin
 if tg_op<>'INSERT' or current_user<>'otr_trip_event_semantic_writer'
  or session_user<>'otr_trip_event_command_gateway' then
  raise exception 'TRIP_EVENT_RECEIPT_IMMUTABLE' using errcode='42501';
 end if;
 return new;
end $$;
create trigger trip_event_receipt_insert_guard before insert on public.trip_event_operation_receipts
 for each row execute function public.trip_event_receipt_guard();
create trigger trip_event_receipt_write_guard before update or delete or truncate on public.trip_event_operation_receipts
 for each statement execute function public.trip_event_receipt_guard();

create function public.trip_event_receipt_lookup(actor uuid,trip uuid,operation uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare r public.trip_event_operation_receipts; data jsonb;
begin
 if session_user<>'otr_trip_event_command_gateway' or not public.trip_event_admission(actor,trip,false) then
  raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into r from public.trip_event_operation_receipts where trip_id=trip and actor_account_id=actor and operation_key=operation;
 if not found then return null; end if;
 data:=(to_jsonb(r)-'receipt_sha256')||jsonb_build_object('committed_at',public.trip_event_utc_timestamp(r.committed_at));
 if r.receipt_sha256<>encode(extensions.digest(convert_to(public.trip_event_canonical_json(data::json),'UTF8'),'sha256'),'hex') then raise exception 'REPLAY_UNAVAILABLE'; end if;
 return data||jsonb_build_object('receipt_sha256',r.receipt_sha256);
end $$;
alter function public.trip_event_receipt_lookup(uuid,uuid,uuid) owner to otr_trip_event_receipt_reader;

-- Pure proof binder. Retained refs must match current fact AND current reference.
create function public.trip_event_bind_proof(proofs jsonb, field text, value jsonb, old_value jsonb,
 old_ref text,actor uuid,trip uuid,event uuid,operation uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog
as $$ declare proof jsonb:=proofs->field; ref text;
begin
 if proof->>'kind'='TRACK_C' then raise exception 'INVALID_PROVENANCE'; end if;
 if public.trip_event_keys(proof,array['kind']) and proof->>'kind'='MANUAL' then
  ref:='otr-event/confirmation/'||trip||'/'||actor||'/'||operation||'/'||field;
  return jsonb_build_object('ref',ref,'confirmation',jsonb_build_object('actorAccountId',actor,'tripId',trip,
   'eventId',event,'operationKey',operation,'field',field,'value',value));
 elsif public.trip_event_keys(proof,array['kind','ref']) and proof->>'kind'='RETAINED'
  and proof->>'ref'=old_ref and old_ref is not null and value is not distinct from old_value
  and old_ref like 'otr-event/confirmation/%'
  and exists(select 1 from public.trip_event_operation_receipts r where r.trip_id=trip
   and r.target_event_id=event and r.outcome in ('APPLIED','NO_CHANGE')
   and r.confirmations->field->>'ref'=old_ref and r.confirmations->field->'value' is not distinct from old_value) then
  return jsonb_build_object('ref',old_ref);
 end if;
 raise exception 'INVALID_PROVENANCE';
end $$;

create function public.trip_event_prepare(command text,payload jsonb,old_row jsonb,
 actor uuid,trip uuid,event uuid,operation uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog
as $$
declare row_data jsonb:=old_row; proofs jsonb:=coalesce(payload->'proofs','{}');
 confirmations jsonb:='{}'; used text[]:='{}'; patch jsonb; boundary jsonb; refs jsonb;
 spatial jsonb; k text; field text; v jsonb; old_v jsonb; old_ref text; bound jsonb;
 changed_location boolean:=false; shape text; instant timestamptz; lim integer;
 allowed_location text[]:=array['authored_label','authored_text','authored_address','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country','accepted_coordinates','accepted_place_id'];
begin
 if jsonb_typeof(proofs)<>'object' or (select count(*) from jsonb_object_keys(proofs))>64 then raise exception 'INVALID_PROVENANCE'; end if;
 if exists(select 1 from jsonb_each(proofs) where value->>'kind'='TRACK_C') then raise exception 'INVALID_PROVENANCE'; end if;
 if command='CREATE_EVENT' then
  if not public.trip_event_keys(payload,array['shape','participantScope','core','time','proofs'],array['location','grouping'])
   or not public.trip_event_keys(payload->'core',array['title','description'])
   or not public.trip_event_keys(payload->'time',array['start']) then raise exception 'INVALID_COMMAND'; end if;
  if payload->>'participantScope' is distinct from 'UNASSIGNED' then raise exception 'UNSUPPORTED_PARTICIPANT_SCOPE'; end if;
  shape:=payload->>'shape';
  if shape is null or shape not in ('POINT','CALENDAR','ALL_DAY') then raise exception 'UNSUPPORTED_SHAPE'; end if;
  row_data:=jsonb_build_object('id',event,'trip_id',trip,'title',payload->'core'->'title','description',payload->'core'->'description',
   'event_type','activity','status','planned','order_index',0,'created_by',actor,'temporal_contract_version',1,
   'temporal_shape',shape,'semantic_revision',1,'participant_scope','UNASSIGNED','location_input_revision',1,'spatial_provenance_refs',null);
  patch:=payload->'core';
 elsif command='UPDATE_CORE_TEXT' then
  if not public.trip_event_keys(payload,array['patch','proofs']) or not public.trip_event_keys(payload->'patch','{}',array['title','description']) then raise exception 'INVALID_COMMAND'; end if;
  patch:=payload->'patch';
 elsif command='UPDATE_TIME' then
  if not public.trip_event_keys(payload,array['start','proofs']) then raise exception 'INVALID_COMMAND'; end if;
 elsif command='UPDATE_LOCATION' then
  if not public.trip_event_keys(payload,array['patch','proofs']) then raise exception 'INVALID_COMMAND'; end if;
 elsif command='UPDATE_GROUPING' then
  if not public.trip_event_keys(payload,array['patch'],array['proofs']) or not public.trip_event_keys(payload->'patch','{}',array['trip_day_id','order_index']) then raise exception 'INVALID_COMMAND'; end if;
  patch:=payload->'patch';
 elsif command='UPDATE_STATUS' then
  if not public.trip_event_keys(payload,array['status'],array['proofs']) then raise exception 'INVALID_COMMAND'; end if;
  patch:=jsonb_build_object('status',payload->'status');
 else raise exception 'INVALID_COMMAND'; end if;
 if command<>'CREATE_EVENT' then
  shape:=old_row->>'temporal_shape';
  if old_row->>'temporal_contract_version' is distinct from '1' then raise exception 'CANONICAL_TARGET_REQUIRED'; end if;
  if shape is null or shape not in ('POINT','CALENDAR','ALL_DAY') then raise exception 'UNSUPPORTED_SHAPE'; end if;
  if old_row->>'participant_scope' is distinct from 'UNASSIGNED' then raise exception 'UNSUPPORTED_PARTICIPANT_SCOPE'; end if;
 end if;
 if patch is not null then
  if patch='{}' then raise exception 'INVALID_COMMAND'; end if;
  for k,v in select * from jsonb_each(patch) loop
   if k='title' and (jsonb_typeof(v)<>'string' or char_length(v#>>'{}') not between 1 and 200 or (v#>>'{}') ~ '^[[:space:]]*$')
    or k='description' and v<>'null' and (jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>5000)
    or k='status' and (jsonb_typeof(v)<>'string' or (v#>>'{}') not in ('planned','cancelled','completed','skipped'))
    or k='order_index' and (jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between -2147483648 and 2147483647)
    or k='trip_day_id' and v<>'null' and jsonb_typeof(v)<>'string' then raise exception 'INVALID_COMMAND'; end if;
   field:='ROOT.'||k; used:=array_append(used,field);
   if v<>'null' and (k in ('title','description') or proofs ? field) then
    select x.value->>'ref' into old_ref from public.trip_event_operation_receipts r,
     lateral jsonb_each(r.confirmations) x where r.trip_id=trip and r.target_event_id=event
      and r.outcome in ('APPLIED','NO_CHANGE') and x.key=field and x.value->'value' is not distinct from old_row->k
     order by r.committed_semantic_revision desc limit 1;
    bound:=public.trip_event_bind_proof(proofs,field,v,old_row->k,old_ref,actor,trip,event,operation);
    if bound ? 'confirmation' then confirmations:=confirmations||jsonb_build_object(field,(bound->'confirmation')||jsonb_build_object('ref',bound->'ref')); end if;
   end if;
   row_data:=row_data||jsonb_build_object(k,v);
  end loop;
 end if;
 if command in ('CREATE_EVENT','UPDATE_TIME') then
  boundary:=case when command='CREATE_EVENT' then payload->'time'->'start' else payload->'start' end;
  if not public.trip_event_keys(boundary,array['local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','fold_choice']) then raise exception 'INVALID_COMMAND'; end if;
  for k,v in select * from jsonb_each(boundary) loop
   if v='null' then continue; end if;
   if k in ('clock_precision','source_instant_precision','supplied_offset_seconds') then
    if jsonb_typeof(v)<>'number' then raise exception 'INVALID_COMMAND'; end if;
   elsif jsonb_typeof(v)<>'string' then raise exception 'INVALID_COMMAND'; end if;
  end loop;
  if boundary->>'source_instant' is not null then
   if (boundary->>'source_instant_precision')::int in (-1,0) and length(boundary->>'source_instant')<>20
    or (boundary->>'source_instant_precision')::int>0 and length(boundary->>'source_instant')<>21+(boundary->>'source_instant_precision')::int then raise exception 'INVALID_COMMAND'; end if;
  end if;
  if boundary->>'zone_id' is not null or boundary->>'fold_choice' is not null then raise exception 'TIME_RESOLUTION_UNAVAILABLE'; end if;
  if boundary->>'local_date' is not null and (boundary->>'local_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
   or boundary->>'local_time' is not null and (boundary->>'local_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$')
   or boundary->>'source_instant' is not null and (boundary->>'source_instant' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$') then raise exception 'INVALID_COMMAND'; end if;
  if boundary->>'local_time' is not null then
   if (boundary->>'clock_precision')::int=-1 and length(boundary->>'local_time')<>5
    or (boundary->>'clock_precision')::int=0 and length(boundary->>'local_time')<>8
    or (boundary->>'clock_precision')::int>0 and length(boundary->>'local_time')<>9+(boundary->>'clock_precision')::int then raise exception 'INVALID_COMMAND'; end if;
  end if;
  refs:='{}';
  for k,v in select * from jsonb_each(boundary) loop
   if k in ('local_date','local_time','zone_id','supplied_offset_seconds','source_instant','quality','fold_choice') then
    field:='ROOT.start.'||k; used:=array_append(used,field);
    if v<>'null' and (k<>'quality' or v='"ESTIMATED"' or proofs ? field) then
     old_v:=old_row->('start_'||k);
     -- Storage clocks/UTC values are normalized strings; compare via typed casts.
     if k='local_time' and old_v<>'null' and (v#>>'{}')::time=(old_v#>>'{}')::time then old_v:=v; end if;
     if k='source_instant' and old_v<>'null' and (v#>>'{}')::timestamptz=(old_v#>>'{}')::timestamptz then old_v:=v; end if;
     old_ref:=old_row->'start_provenance_refs'->>k;
     bound:=public.trip_event_bind_proof(proofs,field,jsonb_build_object('value',v,'precision',case when k='local_time' then boundary->'clock_precision' when k='source_instant' then boundary->'source_instant_precision' else 'null'::jsonb end),
      jsonb_build_object('value',old_v,'precision',case when k='local_time' then old_row->'start_clock_precision' when k='source_instant' then old_row->'start_source_instant_precision' else 'null'::jsonb end),old_ref,actor,trip,event,operation);
     refs:=refs||jsonb_build_object(k,bound->'ref');
     if bound ? 'confirmation' then confirmations:=confirmations||jsonb_build_object(field,(bound->'confirmation')||jsonb_build_object('ref',bound->'ref')); end if;
    end if;
   end if;
   if k<>'fold_choice' then row_data:=row_data||jsonb_build_object('start_'||k,v); end if;
  end loop;
  instant:=case when boundary->>'basis'='SOURCE_INSTANT' then (boundary->>'source_instant')::timestamptz end;
  row_data:=row_data||jsonb_build_object('start_civil_resolution',case when boundary->>'basis'='DERIVED_CIVIL' then 'PENDING' end,
   'start_resolution_offset_seconds',null,'start_interpretation_key',null,'start_interpretation_input_sha256',null,'start_provenance_refs',refs,
   'planned_start',instant,'is_estimated_time',coalesce(boundary->>'quality'='ESTIMATED',false));
  if not public.trip_event_boundary_valid(public.trip_event_family(row_data,'start_',array['local_date','local_time','clock_precision','quality','basis','zone_id','supplied_offset_seconds','source_instant','source_instant_precision','civil_resolution','resolution_offset_seconds','interpretation_key','interpretation_input_sha256','provenance_refs']),instant,case when shape='POINT' then 'TIME' else 'DATE' end) is true then raise exception 'INVALID_AGGREGATE'; end if;
 end if;
 if command in ('CREATE_EVENT','UPDATE_LOCATION') then
  patch:=case when command='CREATE_EVENT' then payload->'location' else payload->'patch' end;
  if patch is not null then
   if patch='{}' or not public.trip_event_keys(patch,'{}',allowed_location) then raise exception 'INVALID_COMMAND'; end if;
   spatial:=coalesce(nullif(row_data->'spatial_provenance_refs','null'::jsonb),'{}');
   for k,v in select * from jsonb_each(patch) loop
    if k='accepted_place_id' then row_data:=row_data||jsonb_build_object(k,v); continue; end if;
    field:='ROOT.'||k; used:=array_append(used,field);
    if k='accepted_coordinates' then
     if v='null' then row_data:=row_data||jsonb_build_object('accepted_latitude',null,'accepted_longitude',null);
     else
      if not public.trip_event_keys(v,array['latitude','longitude']) or jsonb_typeof(v->'latitude')<>'string' or jsonb_typeof(v->'longitude')<>'string' then raise exception 'INVALID_COMMAND'; end if;
      row_data:=row_data||jsonb_build_object('accepted_latitude',public.trip_event_coordinate(v->>'latitude',90),'accepted_longitude',public.trip_event_coordinate(v->>'longitude',180));
     end if;
     old_v:=case when old_row->>'accepted_latitude' is null then 'null'::jsonb else jsonb_build_object('latitude',old_row->>'accepted_latitude','longitude',old_row->>'accepted_longitude') end;
     if v<>'null' and old_row->>'accepted_latitude' is not null
      and public.trip_event_coordinate(v->>'latitude',90)=(old_row->>'accepted_latitude')::double precision
      and public.trip_event_coordinate(v->>'longitude',180)=(old_row->>'accepted_longitude')::double precision then old_v:=v; end if;
    else
     lim:=case when k like '%postal_code' then 64 when k like '%country' then 128 when k like '%locality' or k like '%region' then 200 when k='authored_text' then 5000 when k in ('authored_address','accepted_address') then 2000 else 500 end;
     if v<>'null' and (jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>lim) then raise exception 'INVALID_COMMAND'; end if;
     row_data:=row_data||jsonb_build_object(k,v); old_v:=old_row->k;
    end if;
    if v='null' then spatial:=spatial-k;
    else
     bound:=public.trip_event_bind_proof(proofs,field,v,old_v,old_row->'spatial_provenance_refs'->>k,actor,trip,event,operation);
     spatial:=spatial||jsonb_build_object(k,bound->'ref');
     if bound ? 'confirmation' then confirmations:=confirmations||jsonb_build_object(field,(bound->'confirmation')||jsonb_build_object('ref',bound->'ref')); end if;
    end if;
   end loop;
   if spatial='{}' then spatial:='null'::jsonb; end if;
   changed_location:=command='CREATE_EVENT' or (row_data-'accepted_place_id'-'spatial_provenance_refs') is distinct from (old_row-'accepted_place_id'-'spatial_provenance_refs') or spatial is distinct from old_row->'spatial_provenance_refs';
   if patch ? 'accepted_place_id' and (select count(*) from jsonb_object_keys(patch))=1 or not changed_location and row_data->'accepted_place_id' is distinct from old_row->'accepted_place_id' then raise exception 'INVALID_COMMAND'; end if;
   row_data:=row_data||jsonb_build_object('spatial_provenance_refs',spatial);
   if changed_location and command<>'CREATE_EVENT' then
    if (old_row->>'location_input_revision')::bigint=9007199254740991 then raise exception 'REVISION_OVERFLOW'; end if;
    row_data:=row_data||jsonb_build_object('location_input_revision',(old_row->>'location_input_revision')::bigint+1);
    for k in select x from jsonb_object_keys(old_row) x where x like 'candidate_%' loop row_data:=row_data||jsonb_build_object(k,null); end loop;
   end if;
  end if;
 end if;
 if command='CREATE_EVENT' and payload ? 'grouping' then
  if not public.trip_event_keys(payload->'grouping',array['trip_day_id','order_index']) then raise exception 'INVALID_COMMAND'; end if;
  if jsonb_typeof(payload->'grouping'->'order_index')<>'number' or (payload->'grouping'->>'order_index')::numeric not between -2147483648 and 2147483647 then raise exception 'INVALID_COMMAND'; end if;
  row_data:=row_data||payload->'grouping';
 end if;
 if exists(select 1 from jsonb_object_keys(proofs) x where not x=any(used)) then raise exception 'INVALID_PROVENANCE'; end if;
 return jsonb_build_object('row',row_data,'confirmations',confirmations);
end $$;

create function public.trip_event_execute(family text,actor uuid,trip uuid,operation uuid,event uuid,base bigint,intent text)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog
as $$
declare envelope jsonb; canonical text; digest text; stored public.trip_event_operation_receipts;
 old_event public.itinerary_events; new_event public.itinerary_events; prepared jsonb; projection jsonb;
 confirmations jsonb:='{}'; result jsonb; outcome text:='APPLIED'; code text; http smallint;
 observed bigint; result_revision bigint; gate boolean; k text; current_refs jsonb;
begin
 if current_user<>'otr_trip_event_semantic_writer' or session_user<>'otr_trip_event_command_gateway' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if intent is null or octet_length(intent)>32768 then raise exception 'INVALID_COMMAND'; end if;
 begin
  canonical:=public.trip_event_canonical_json(intent::json); envelope:=canonical::jsonb;
 exception when others then
  if sqlstate like '22%' then raise exception 'INVALID_COMMAND'; else raise; end if;
 end;
 if not public.trip_event_keys(envelope,array['contractVersion','intentVersion','command','commandVersion','operationKey','actorAccountId','tripId','eventId','baseSemanticRevision','payload'])
  or envelope->'contractVersion' is distinct from '1'::jsonb or envelope->'intentVersion' is distinct from '1'::jsonb or envelope->'commandVersion' is distinct from '1'::jsonb
  or envelope->>'command' is distinct from family or envelope->>'actorAccountId' is distinct from actor::text or envelope->>'tripId' is distinct from trip::text
  or envelope->>'eventId' is distinct from event::text or envelope->>'operationKey' is distinct from operation::text
  or envelope->'baseSemanticRevision' is distinct from coalesce(to_jsonb(base),'null')
  or operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or family='CREATE_EVENT' and base is not null or family<>'CREATE_EVENT' and (base is null or base not between 1 and 9007199254740991)
  then raise exception 'INVALID_COMMAND'; end if;
 digest:=encode(extensions.digest(convert_to(public.trip_event_canonical_json((envelope||jsonb_build_object('encoding','otr-event-intent-v1'))::json),'UTF8'),'sha256'),'hex');
 if not public.trip_event_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  -- A historic immutable receipt is safe at any snapshot; a missing key cannot
  -- enter semantic execution under a stale MVCC snapshot. This is the server's
  -- actual transaction isolation setting, not a custom caller metadata flag.
  result:=public.trip_event_receipt_lookup(actor,trip,operation);
  if result is null then raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000'; end if;
  if result->>'intent_sha256'<>digest or result->>'intended_payload'<>canonical then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505'; end if;
  return jsonb_build_object('receipt',result,'idempotentReplay',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('otr-event-operation/'||trip||'/'||actor||'/'||operation,0));
 select * into stored from public.trip_event_operation_receipts where trip_id=trip and actor_account_id=actor and operation_key=operation;
 if found then
  if stored.intent_sha256<>digest or stored.intended_payload<>canonical then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505'; end if;
  result:=public.trip_event_receipt_lookup(actor,trip,operation);
  return jsonb_build_object('receipt',result,'idempotentReplay',true);
 end if;
 perform pg_advisory_xact_lock_shared(730401,1);
 select enabled into gate from public.trip_event_command_gate where singleton;
 if gate is distinct from true then raise exception 'CANONICAL_WRITES_DISABLED' using errcode='42501'; end if;
 -- No deployed role has admission-row UPDATE/parent DML. A later activation must
 -- separately review positive grants/guard admission/credentials; tests grant only
 -- inside rollback transactions. Native row conflicts serialize permission changes.
 begin
  perform 1 from public.trips where id=trip for share;
  perform 1 from public.trip_members where trip_id=trip and user_id=actor order by id for share;
  perform 1 from public.journey_members where trip_id=trip and user_id=actor order by id for share;
  if not public.trip_event_admission(actor,trip,false) then raise exception 'FORBIDDEN'; end if;
  if not public.trip_event_admission(actor,trip,true) then raise exception 'FORBIDDEN'; end if;
  -- Existing AND proposed refs lock in relation/UUID order before the parent.
  select jsonb_build_object('trip_day_id',trip_day_id,'reservation_id',reservation_id,'accepted_place_id',accepted_place_id)
   into current_refs from public.itinerary_events where id=event and trip_id=trip;
  for k in select distinct value from unnest(array[current_refs->>'trip_day_id',
   case when family='CREATE_EVENT' then envelope->'payload'->'grouping'->>'trip_day_id'
    when family='UPDATE_GROUPING' then envelope->'payload'->'patch'->>'trip_day_id' end]) value
   where value is not null order by value loop
   perform 1 from public.trip_days where id=k::uuid and trip_id=trip for key share;
   if not found then raise exception 'INVALID_AGGREGATE'; end if;
  end loop;
  if current_refs->>'reservation_id' is not null then
   perform 1 from public.itinerary_reservations where id=(current_refs->>'reservation_id')::uuid and trip_id=trip for key share;
   if not found then raise exception 'INVALID_AGGREGATE'; end if;
  end if;
  for k in select distinct value from unnest(array[current_refs->>'accepted_place_id',
   case when family='CREATE_EVENT' then envelope->'payload'->'location'->>'accepted_place_id'
    when family='UPDATE_LOCATION' then envelope->'payload'->'patch'->>'accepted_place_id' end]) value
   where value is not null order by value loop
   perform 1 from public.places where id=k::uuid for key share;
   if not found and (family='CREATE_EVENT' and k=envelope->'payload'->'location'->>'accepted_place_id'
    or family='UPDATE_LOCATION' and k=envelope->'payload'->'patch'->>'accepted_place_id') then raise exception 'INVALID_AGGREGATE'; end if;
   -- A deleted old optional Place may have nulled the pointer without a revision;
   -- the locked parent is reloaded below. Never recreate that missing pointer.
  end loop;
  if family='CREATE_EVENT' then
   perform pg_advisory_xact_lock(hashtextextended('otr-event-id/'||event,0));
   if exists(select 1 from public.itinerary_events where id=event) then raise exception 'EVENT_ID_IN_USE'; end if;
  else
   select * into old_event from public.itinerary_events where id=event and trip_id=trip for update;
   if not found then raise exception 'INVALID_AGGREGATE'; end if;
   observed:=old_event.semantic_revision;
   if old_event.temporal_contract_version is null then raise exception 'CANONICAL_TARGET_REQUIRED'; end if;
   if observed is distinct from base then raise exception 'STALE_BASE_REVISION'; end if;
  end if;
  prepared:=public.trip_event_prepare(family,envelope->'payload',to_jsonb(old_event),actor,trip,event,operation);
  confirmations:=prepared->'confirmations';
  new_event:=jsonb_populate_record(case when family='CREATE_EVENT' then null::public.itinerary_events else old_event end,prepared->'row');
  if family='CREATE_EVENT' then
   new_event.created_at:=clock_timestamp(); new_event.updated_at:=new_event.created_at;
   new_event.needs_review:=false; new_event.location_status:='none'; new_event.geocode_attempts:=0; new_event.manual_location:=false;
  end if;
  if not public.trip_event_row_valid(to_jsonb(new_event)) is true then raise exception 'INVALID_AGGREGATE'; end if;
  if family<>'CREATE_EVENT' and to_jsonb(new_event)=to_jsonb(old_event) and confirmations='{}' then
   outcome:='NO_CHANGE';
  else
   if family<>'CREATE_EVENT' then
    if observed=9007199254740991 then raise exception 'REVISION_OVERFLOW'; end if;
    new_event.semantic_revision:=observed+1; new_event.updated_at:=clock_timestamp();
   end if;
   if family='CREATE_EVENT' then insert into public.itinerary_events select (new_event).*;
   else
    update public.itinerary_events set title=new_event.title,description=new_event.description,status=new_event.status,order_index=new_event.order_index,trip_day_id=new_event.trip_day_id,semantic_revision=new_event.semantic_revision,updated_at=new_event.updated_at,planned_start=new_event.planned_start,is_estimated_time=new_event.is_estimated_time,start_local_date=new_event.start_local_date,start_local_time=new_event.start_local_time,start_clock_precision=new_event.start_clock_precision,start_quality=new_event.start_quality,start_basis=new_event.start_basis,start_zone_id=new_event.start_zone_id,start_supplied_offset_seconds=new_event.start_supplied_offset_seconds,start_source_instant=new_event.start_source_instant,start_source_instant_precision=new_event.start_source_instant_precision,start_civil_resolution=new_event.start_civil_resolution,start_resolution_offset_seconds=new_event.start_resolution_offset_seconds,start_interpretation_key=new_event.start_interpretation_key,start_interpretation_input_sha256=new_event.start_interpretation_input_sha256,start_provenance_refs=new_event.start_provenance_refs,authored_label=new_event.authored_label,authored_text=new_event.authored_text,authored_address=new_event.authored_address,accepted_address=new_event.accepted_address,accepted_latitude=new_event.accepted_latitude,accepted_longitude=new_event.accepted_longitude,accepted_place_id=new_event.accepted_place_id,spatial_provenance_refs=new_event.spatial_provenance_refs,location_input_revision=new_event.location_input_revision,authored_address_line1=new_event.authored_address_line1,authored_address_line2=new_event.authored_address_line2,authored_address_locality=new_event.authored_address_locality,authored_address_region=new_event.authored_address_region,authored_address_postal_code=new_event.authored_address_postal_code,authored_address_country=new_event.authored_address_country,accepted_address_line1=new_event.accepted_address_line1,accepted_address_line2=new_event.accepted_address_line2,accepted_address_locality=new_event.accepted_address_locality,accepted_address_region=new_event.accepted_address_region,accepted_address_postal_code=new_event.accepted_address_postal_code,accepted_address_country=new_event.accepted_address_country,candidate_input_revision=new_event.candidate_input_revision,candidate_provider=new_event.candidate_provider,candidate_provider_place_id=new_event.candidate_provider_place_id,candidate_place_id=new_event.candidate_place_id,candidate_label=new_event.candidate_label,candidate_address=new_event.candidate_address,candidate_latitude=new_event.candidate_latitude,candidate_longitude=new_event.candidate_longitude,candidate_confidence=new_event.candidate_confidence,candidate_state=new_event.candidate_state,candidate_observed_at=new_event.candidate_observed_at,candidate_error_code=new_event.candidate_error_code where id=event and trip_id=trip;
   end if;
   perform public.assert_trip_event_aggregate(event);
  end if;
  result_revision:=new_event.semantic_revision;
  projection:=to_jsonb(new_event);
  -- All authoritative timeline values retain microseconds as UTC strings. Decimal
  -- accepted values are shortest PostgreSQL round-trip strings, not JSON numbers.
  foreach k in array array['planned_start','planned_end','start_source_instant','end_source_instant'] loop
   if projection->>k is not null then projection:=projection||jsonb_build_object(k,public.trip_event_utc_timestamp((projection->>k)::timestamptz)); end if;
  end loop;
  foreach k in array array['accepted_latitude','accepted_longitude'] loop
   if projection->>k is not null then projection:=projection||jsonb_build_object(k,projection->>k); end if;
  end loop;
  -- Accepted results never expose provider/candidate cache bodies, even on NO_CHANGE.
  for k in select key from jsonb_each(projection) where key like 'candidate_%' loop projection:=projection-k; end loop;
  -- Only fields this family owns enter update results. CREATE returns aggregate.
  if family<>'CREATE_EVENT' then
   select jsonb_object_agg(key,value) into projection from jsonb_each(projection)
    where key=any(case family when 'UPDATE_CORE_TEXT' then array['title','description']
     when 'UPDATE_STATUS' then array['status'] when 'UPDATE_GROUPING' then array['trip_day_id','order_index']
     when 'UPDATE_TIME' then array['planned_start','is_estimated_time']||array['start_local_date','start_local_time','start_clock_precision','start_quality','start_basis','start_zone_id','start_supplied_offset_seconds','start_source_instant','start_source_instant_precision','start_civil_resolution','start_resolution_offset_seconds','start_interpretation_key','start_interpretation_input_sha256','start_provenance_refs']
     else array['authored_label','authored_text','authored_address','accepted_address','accepted_latitude','accepted_longitude','accepted_place_id','spatial_provenance_refs','location_input_revision','authored_address_line1','authored_address_line2','authored_address_locality','authored_address_region','authored_address_postal_code','authored_address_country','accepted_address_line1','accepted_address_line2','accepted_address_locality','accepted_address_region','accepted_address_postal_code','accepted_address_country'] end) or key in ('id','trip_id','semantic_revision');
  end if;
  -- confirmations retain clears even though provenance keys are removed.
  if family<>'CREATE_EVENT' then
   for k in select key from jsonb_each(envelope->'payload'->'patch') where value='null' loop
    confirmations:=confirmations||jsonb_build_object('ROOT.'||k,jsonb_build_object('actorAccountId',actor,'tripId',trip,'eventId',event,'operationKey',operation,'field','ROOT.'||k,'value',null,'cleared',true));
   end loop;
  end if;
  http:=case when family='CREATE_EVENT' then 201 else 200 end;
 exception when others then
  code:=sqlerrm;
  if code not in ('FORBIDDEN','STALE_BASE_REVISION','CANONICAL_TARGET_REQUIRED','EVENT_ID_IN_USE','UNSUPPORTED_SHAPE','UNSUPPORTED_PARTICIPANT_SCOPE','INVALID_COMMAND','INVALID_PROVENANCE','TIME_RESOLUTION_UNAVAILABLE','INVALID_AGGREGATE','REVISION_OVERFLOW') then
   if sqlstate in ('23514','23502','23503','22P02','22007','22008','22003') then code:='INVALID_AGGREGATE'; else raise; end if;
  end if;
  outcome:=case when code='STALE_BASE_REVISION' then 'CONFLICT' else 'REJECTED' end;
  http:=case when code='FORBIDDEN' then 403 when code in ('STALE_BASE_REVISION','EVENT_ID_IN_USE','REVISION_OVERFLOW') then 409 else 422 end;
  result_revision:=null; projection:='{}'; confirmations:='{}';
 end;
 if code='FORBIDDEN' and not public.trip_event_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 result:=jsonb_build_object('trip_id',trip,'actor_account_id',actor,'operation_key',operation,
  'intent_version',1,'command',family,'command_version',1,'intent_sha256',digest,'target_event_id',event,
  'base_semantic_revision',base,'intended_payload',canonical,'outcome',outcome,
  'result_event_id',case when outcome in ('APPLIED','NO_CHANGE') then event end,
  'committed_semantic_revision',result_revision,'observed_semantic_revision',case when outcome='CONFLICT' then observed end,
  'result_fields',projection,'confirmations',confirmations,'error_code',code,'submitted_http_status',http,
  'receipt_version',1,'committed_at',public.trip_event_utc_timestamp(clock_timestamp()));
 result:=result||jsonb_build_object('receipt_sha256',encode(extensions.digest(convert_to(public.trip_event_canonical_json(result::json),'UTF8'),'sha256'),'hex'));
 stored:=jsonb_populate_record(null::public.trip_event_operation_receipts,result);
 insert into public.trip_event_operation_receipts select (stored).*;
 return jsonb_build_object('receipt',result,'idempotentReplay',false);
end $$;

create function public.trip_event_create_event(actor uuid,trip uuid,operation uuid,event uuid,intent text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_event_execute('CREATE_EVENT',actor,trip,operation,event,null,intent) $$;
alter function public.trip_event_create_event(uuid,uuid,uuid,uuid,text) owner to otr_trip_event_semantic_writer;
revoke all on function public.trip_event_create_event(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_event_create_event(uuid,uuid,uuid,uuid,text) to otr_trip_event_command_gateway;

create function public.trip_event_update_core_text(actor uuid,trip uuid,operation uuid,event uuid,base bigint,intent text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_event_execute('UPDATE_CORE_TEXT',actor,trip,operation,event,base,intent) $$;
alter function public.trip_event_update_core_text(uuid,uuid,uuid,uuid,bigint,text) owner to otr_trip_event_semantic_writer;
revoke all on function public.trip_event_update_core_text(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_event_update_core_text(uuid,uuid,uuid,uuid,bigint,text) to otr_trip_event_command_gateway;

create function public.trip_event_update_time(actor uuid,trip uuid,operation uuid,event uuid,base bigint,intent text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_event_execute('UPDATE_TIME',actor,trip,operation,event,base,intent) $$;
alter function public.trip_event_update_time(uuid,uuid,uuid,uuid,bigint,text) owner to otr_trip_event_semantic_writer;
revoke all on function public.trip_event_update_time(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_event_update_time(uuid,uuid,uuid,uuid,bigint,text) to otr_trip_event_command_gateway;

create function public.trip_event_update_location(actor uuid,trip uuid,operation uuid,event uuid,base bigint,intent text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_event_execute('UPDATE_LOCATION',actor,trip,operation,event,base,intent) $$;
alter function public.trip_event_update_location(uuid,uuid,uuid,uuid,bigint,text) owner to otr_trip_event_semantic_writer;
revoke all on function public.trip_event_update_location(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_event_update_location(uuid,uuid,uuid,uuid,bigint,text) to otr_trip_event_command_gateway;

create function public.trip_event_update_grouping(actor uuid,trip uuid,operation uuid,event uuid,base bigint,intent text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_event_execute('UPDATE_GROUPING',actor,trip,operation,event,base,intent) $$;
alter function public.trip_event_update_grouping(uuid,uuid,uuid,uuid,bigint,text) owner to otr_trip_event_semantic_writer;
revoke all on function public.trip_event_update_grouping(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_event_update_grouping(uuid,uuid,uuid,uuid,bigint,text) to otr_trip_event_command_gateway;

create function public.trip_event_update_status(actor uuid,trip uuid,operation uuid,event uuid,base bigint,intent text) returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $$ select public.trip_event_execute('UPDATE_STATUS',actor,trip,operation,event,base,intent) $$;
alter function public.trip_event_update_status(uuid,uuid,uuid,uuid,bigint,text) owner to otr_trip_event_semantic_writer;
revoke all on function public.trip_event_update_status(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_event_update_status(uuid,uuid,uuid,uuid,bigint,text) to otr_trip_event_command_gateway;

revoke all on function public.trip_event_execute(text,uuid,uuid,uuid,uuid,bigint,text),
 public.trip_event_prepare(text,jsonb,jsonb,uuid,uuid,uuid,uuid),
 public.trip_event_bind_proof(jsonb,text,jsonb,jsonb,text,uuid,uuid,uuid,uuid),
 public.trip_event_admission(uuid,uuid,boolean),public.trip_event_receipt_lookup(uuid,uuid,uuid),
 public.trip_event_receipt_guard(),public.trip_event_canonical_json(json,integer),
 public.trip_event_keys(jsonb,text[],text[]),public.trip_event_coordinate(text,numeric),
 public.trip_event_utc_timestamp(timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.trip_event_execute(text,uuid,uuid,uuid,uuid,bigint,text),
 public.trip_event_prepare(text,jsonb,jsonb,uuid,uuid,uuid,uuid),
 public.trip_event_bind_proof(jsonb,text,jsonb,jsonb,text,uuid,uuid,uuid,uuid),
 public.trip_event_admission(uuid,uuid,boolean),public.trip_event_receipt_lookup(uuid,uuid,uuid),
 public.trip_event_receipt_guard(),public.trip_event_canonical_json(json,integer),
 public.trip_event_keys(jsonb,text[],text[]),public.trip_event_coordinate(text,numeric),
 public.trip_event_utc_timestamp(timestamptz)
 to otr_trip_event_semantic_writer;
grant execute on function public.trip_event_admission(uuid,uuid,boolean),public.trip_event_canonical_json(json,integer),
 public.trip_event_utc_timestamp(timestamptz)
 to otr_trip_event_receipt_reader;
grant usage on schema extensions to otr_trip_event_semantic_writer,otr_trip_event_receipt_reader;
grant execute on function extensions.digest(bytea,text) to otr_trip_event_semantic_writer,otr_trip_event_receipt_reader;
grant execute on function public.trip_event_receipt_lookup(uuid,uuid,uuid) to otr_trip_event_command_gateway;
-- Validate new-table defaults too: PUBLIC column grants cannot bypass RLS isolation.
do $$ declare role_name text;
begin
 foreach role_name in array array['anon','authenticated','service_role','otr_trip_event_command_gateway'] loop
  if exists(select 1 from pg_attribute a where a.attrelid=any(array['public.trip_event_command_gate'::regclass,'public.trip_event_operation_receipts'::regclass])
    and a.attnum>0 and not a.attisdropped and has_column_privilege(role_name,a.attrelid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) then
   raise exception 'UNSAFE_TRIP_EVENT_COMMAND_DEFAULT_GRANTS'; end if;
 end loop;
end $$;
revoke create on schema public from otr_trip_event_semantic_writer,otr_trip_event_receipt_reader;
grant otr_trip_event_semantic_writer,otr_trip_event_receipt_reader to postgres with inherit false, set false;
grant execute on function public.trip_event_refs_valid(jsonb,text[],integer),
 public.trip_event_boundary_valid(jsonb,timestamptz,text),public.trip_event_spatial_valid(jsonb,boolean),
 public.trip_event_family(jsonb,text,text[]),public.trip_event_row_valid(jsonb),public.assert_trip_event_aggregate(uuid)
 to otr_trip_event_semantic_writer;
-- Exact final application capability inventories. Unknown objects/privilege
-- classes cannot survive through any direct/PUBLIC/inherited ACL path.
do $$ declare role_name text; allowed text[]; owned text[]; obj record; a record; privilege text; permit boolean;
begin
 foreach role_name in array array['otr_trip_event_semantic_writer','otr_trip_event_command_gateway','otr_trip_event_receipt_reader'] loop
  allowed:=case role_name
   when 'otr_trip_event_semantic_writer' then array['public.trip_event_create_event(uuid,uuid,uuid,uuid,text)','public.trip_event_update_core_text(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_time(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_location(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_grouping(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_status(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_execute(text,uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_prepare(text,jsonb,jsonb,uuid,uuid,uuid,uuid)','public.trip_event_bind_proof(jsonb,text,jsonb,jsonb,text,uuid,uuid,uuid,uuid)','public.trip_event_admission(uuid,uuid,boolean)','public.trip_event_receipt_lookup(uuid,uuid,uuid)','public.trip_event_receipt_guard()','public.trip_event_canonical_json(json,integer)','public.trip_event_keys(jsonb,text[],text[])','public.trip_event_coordinate(text,numeric)','public.trip_event_utc_timestamp(timestamp with time zone)','public.trip_event_refs_valid(jsonb,text[],integer)','public.trip_event_boundary_valid(jsonb,timestamp with time zone,text)','public.trip_event_spatial_valid(jsonb,boolean)','public.trip_event_family(jsonb,text,text[])','public.trip_event_row_valid(jsonb)','public.assert_trip_event_aggregate(uuid)']
   when 'otr_trip_event_command_gateway' then array['public.trip_event_create_event(uuid,uuid,uuid,uuid,text)','public.trip_event_update_core_text(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_time(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_location(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_grouping(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_status(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_receipt_lookup(uuid,uuid,uuid)']
   else array['public.trip_event_admission(uuid,uuid,boolean)','public.trip_event_receipt_lookup(uuid,uuid,uuid)','public.trip_event_canonical_json(json,integer)','public.trip_event_utc_timestamp(timestamp with time zone)'] end;
  owned:=case role_name when 'otr_trip_event_semantic_writer' then array['public.trip_event_create_event(uuid,uuid,uuid,uuid,text)','public.trip_event_update_core_text(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_time(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_location(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_grouping(uuid,uuid,uuid,uuid,bigint,text)','public.trip_event_update_status(uuid,uuid,uuid,uuid,bigint,text)'] when 'otr_trip_event_receipt_reader' then array['public.trip_event_admission(uuid,uuid,boolean)','public.trip_event_receipt_lookup(uuid,uuid,uuid)'] else array[]::text[] end;
  if exists(select 1 from pg_namespace n where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)'
   and (n.nspowner=role_name::regrole or has_schema_privilege(role_name,n.oid,'CREATE')))
   or exists(select 1 from pg_class where relowner=role_name::regrole)
   or exists(select 1 from pg_auth_members m where m.member=role_name::regrole or m.roleid=role_name::regrole
    and (m.set_option or m.inherit_option or m.member<>'postgres'::regrole)) then raise exception 'UNSAFE_TRIP_EVENT_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and p.prokind in ('f','p')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and ((p.proowner=role_name::regrole and not exists(select 1 from unnest(owned) x where to_regprocedure(x)=p.oid))
      or has_function_privilege(role_name,p.oid,'EXECUTE') and not exists(select 1 from unnest(allowed) x where to_regprocedure(x)=p.oid)
       and not exists(select 1 from bt3d_baseline_routines b where to_regprocedure(b.signature)=p.oid
        and b.definition_sha256=encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')))) then
   raise exception 'UNSAFE_TRIP_EVENT_COMMAND_FINAL_CAPABILITY: %',role_name;
  end if;
  for obj in select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and c.relkind in ('r','p','v','m','S') loop
   if obj.relkind='S' then
    if has_sequence_privilege(role_name,obj.oid,'USAGE,SELECT,UPDATE') then raise exception 'UNSAFE_TRIP_EVENT_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
    continue;
   end if;
   foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    permit:=(role_name='otr_trip_event_semantic_writer' and (obj.oid='public.trip_event_command_gate'::regclass and privilege='SELECT'
       or obj.oid='public.trip_event_operation_receipts'::regclass and privilege in ('SELECT','INSERT'))
      or role_name='otr_trip_event_receipt_reader' and obj.oid=any(array['public.trip_event_operation_receipts'::regclass,'public.trips'::regclass,'public.trip_members'::regclass,'public.journey_members'::regclass]) and privilege='SELECT');
    if has_table_privilege(role_name,obj.oid,privilege) is distinct from permit then raise exception 'UNSAFE_TRIP_EVENT_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
    if privilege in ('SELECT','INSERT','UPDATE','REFERENCES') then
     for a in select attnum from pg_attribute where attrelid=obj.oid and attnum>0 and not attisdropped loop
      if has_column_privilege(role_name,obj.oid,a.attnum,privilege) is distinct from permit then raise exception 'UNSAFE_TRIP_EVENT_COMMAND_FINAL_CAPABILITY: %',role_name; end if;
     end loop;
    end if;
   end loop;
  end loop;
 end loop;
end $$;

commit;
