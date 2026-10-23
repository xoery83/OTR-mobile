-- CANDIDATE ONLY: Source-owned OTR_UTF8_TEXT_FILE_V1 + bounded submitted text.
-- No DEV execution. Requires reviewed universal_source_host_candidate.sql first.
-- Existing FILE/FILES + filename + exact UTF8 are retained. No PDF profile widening.
-- One Source authority/journal/receipt; V1 command codec is byte-for-byte unchanged.
begin;
create temporary table utf8_source_owner_edge on commit drop as select admin_option,inherit_option,set_option from pg_auth_members where roleid='otr_trip_source_writer'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
do $$begin if has_schema_privilege('otr_trip_source_writer','public','CREATE') then raise exception 'UTF8_SOURCE_OWNER_CREATE_PREIMAGE';end if;end$$;
grant otr_trip_source_writer to postgres with inherit true,set true;
grant create on schema public to otr_trip_source_writer;
alter table public.trip_source_universal_scope add column source_command_pins jsonb not null default '[]'::jsonb check(jsonb_typeof(source_command_pins)='array' and jsonb_array_length(source_command_pins)<=64 and octet_length(source_command_pins::text)<=65536);

create function public.trip_source_universal_original_pin() returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare p jsonb;begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then return null;end if;
 begin p:=current_setting('otr.universal.source_pin',true)::jsonb;exception when others then return null;end;
 if p is null or not public.trip_event_keys(p,array['profile','actorId','tripId','sourceId','operationId','operationKey','operationSha256','representationId']) or
 p->>'profile' not in ('OTR_UTF8_TEXT_FILE_V1','OTR_SUBMITTED_TEXT_V1') then return null;end if;
 if not exists(select 1 from public.trip_source_universal_scope s where s.singleton and s.actor_id=(p->>'actorId')::uuid and s.trip_id=(p->>'tripId')::uuid
 and clock_timestamp()>=s.starts_at and clock_timestamp()<s.expires_at and s.source_command_pins @>jsonb_build_array(p)) then return null;end if;
 return p;
 exception when invalid_text_representation then return null;
end$$;
do $$begin if (select md5(prosrc) from pg_proc where oid='public.trip_source_command_codec(text)'::regprocedure) <> '32715f0c32706e72dff21eb03fe2db32' then raise exception 'UTF8_SOURCE_CODEC_PREIMAGE';end if;end$$;
CREATE OR REPLACE FUNCTION public.trip_source_utf8_file_codec(raw text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$ declare j jsonb; p jsonb; d jsonb; field text; val jsonb; k text; newrev bigint; prev bigint; digest text; captured text; descriptor jsonb; expected text;
begin
 if raw is null or octet_length(raw)>2097152 then raise exception 'INVALID_SOURCE_COMMAND'; end if;
 j:=public.trip_event_canonical_json(raw::json)::jsonb;
 if j->>'command' is distinct from 'ACQUIRE_SOURCE' or j->'payload'->'source_input'->>'source_kind' is distinct from 'FILE' or j->'payload'->'source_input'->>'acquisition_channel' is distinct from 'FILES' or
 j->'payload'->'original'->>'material_kind' is distinct from 'TEXT' or jsonb_typeof(j->'payload'->'original'->'original_filename') is distinct from 'string' or
 j->'payload'->'original'->>'original_filename' !~* '\.txt$' or jsonb_typeof(j->'payload'->'original'->'text_content') is distinct from 'string' then raise exception 'UTF8_FILE_PROFILE_UNSUPPORTED';end if;

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
   or d->>'material_kind'<>'BINARY' and d->'original_filename'<>'null'::jsonb and not (k='ACQUIRE_SOURCE' and p->'source_input'->>'source_kind'='FILE' and p->'source_input'->>'acquisition_channel'='FILES' and d->>'material_kind'='TEXT') then raise exception 'INVALID_SOURCE_COMMAND'; end if;
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
     or val->>'source_kind'='FILE' and val->>'acquisition_channel'='FILES' and d->>'material_kind'='TEXT' and d->>'original_filename' ~* '\.txt$' and (d->>'byte_count')::bigint between 1 and 262144 and left(case when left(d->>'text_content',1)=chr(65279) then substr(d->>'text_content',2) else d->>'text_content' end,5)<>'%PDF-'
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
end $function$
;
do $patch$declare original text;definition text;begin select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public.trip_source_register(text,uuid,text)'::regprocedure;if md5(original)<>'a25126415f6a910930c8dab6287d0437' then raise exception 'UTF8_SOURCE_PREIMAGE';end if;definition:=replace(definition,$old0$ j:=public.trip_source_command_codec(raw); p:=j->'payload';$old0$,$new0$ if public.trip_source_universal_original_pin()->>'profile'='OTR_UTF8_TEXT_FILE_V1' then j:=public.trip_source_utf8_file_codec(raw); else j:=public.trip_source_command_codec(raw);end if; p:=j->'payload';
 if public.trip_source_universal_original_pin() is not null and (family<>'ACQUIRE_SOURCE' or j->>'operation_id'<>public.trip_source_universal_original_pin()->>'operationId' or j->>'operation_sha256'<>public.trip_source_universal_original_pin()->>'operationSha256' or j->>'source_id'<>public.trip_source_universal_original_pin()->>'sourceId' or p->'original'->>'id'<>public.trip_source_universal_original_pin()->>'representationId') then raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;$new0$);definition:=replace(definition,$old1$ perform public.trip_source_lock_scope(actor,(j->>'trip_id')::uuid,(j->>'source_id')::uuid);$old1$,$new1$ if public.trip_source_universal_original_pin() is not null then if not public.trip_source_lock_universal_actor(actor,(j->>'trip_id')::uuid,true) then raise exception 'SOURCE_ACCESS_DENIED';end if;else perform public.trip_source_lock_scope(actor,(j->>'trip_id')::uuid,(j->>'source_id')::uuid);end if;$new1$);definition:=replace(definition,$old2$ select * into o from public.trip_source_operations where trip_id=(j->>'trip_id')::uuid and actor_account_id=actor and operation_key=j->>'operation_key' for update;$old2$,$new2$ if public.trip_source_universal_original_pin() is not null then select * into o from public.trip_source_operations where trip_id=(j->>'trip_id')::uuid and actor_account_id=actor and operation_key=j->>'operation_key';else select * into o from public.trip_source_operations where trip_id=(j->>'trip_id')::uuid and actor_account_id=actor and operation_key=j->>'operation_key' for update;end if;$new2$);definition:=replace(definition,$old3$ select * into s from public.trip_sources where id=(j->>'source_id')::uuid for update;$old3$,$new3$ if public.trip_source_universal_original_pin() is not null then select * into s from public.trip_sources where id=(j->>'source_id')::uuid;else select * into s from public.trip_sources where id=(j->>'source_id')::uuid for update;end if;$new3$);execute definition;end$patch$;
do $patch$declare original text;definition text;begin select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public.trip_source_assert_gate()'::regprocedure;if md5(original)<>'7bfe15b4e59362c42791543560e537cc' then raise exception 'UTF8_SOURCE_PREIMAGE: trip_source_assert_gate()';end if;execute replace(definition,$old$ if not exists(select 1 from public.trip_source_command_gate where singleton and enabled) then$old$,$new$ if not exists(select 1 from public.trip_source_command_gate where singleton and enabled) and public.trip_source_universal_original_pin() is null then$new$);end$patch$;
do $patch$declare original text;definition text;begin select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public.trip_source_operation_guard()'::regprocedure;if md5(original)<>'b4f8b227701407bab318bbc0f734243b' then raise exception 'UTF8_SOURCE_PREIMAGE: trip_source_operation_guard()';end if;execute replace(definition,$old$ if not exists(select 1 from public.trip_source_command_gate where singleton and enabled) then$old$,$new$ if public.trip_source_universal_original_pin() is not null and tg_level='ROW' then if (tg_op<>'INSERT' or new.command<>'ACQUIRE_SOURCE' or new.id::text<>public.trip_source_universal_original_pin()->>'operationId' or new.actor_account_id::text<>public.trip_source_universal_original_pin()->>'actorId' or new.trip_id::text<>public.trip_source_universal_original_pin()->>'tripId' or new.source_id::text<>public.trip_source_universal_original_pin()->>'sourceId' or new.operation_key<>public.trip_source_universal_original_pin()->>'operationKey' or new.operation_sha256<>public.trip_source_universal_original_pin()->>'operationSha256') then raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;end if;
 if not exists(select 1 from public.trip_source_command_gate where singleton and enabled) and public.trip_source_universal_original_pin() is null then$new$);end$patch$;
do $patch$declare original text;definition text;begin select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public.guard_trip_source_mutation()'::regprocedure;if md5(original)<>'bfbe648b10b86df5b6f03e8ab56d21db' then raise exception 'UTF8_SOURCE_PREIMAGE: guard_trip_source_mutation()';end if;execute replace(definition,$old$ begin raise exception using errcode='42501',message='TRIP_SOURCE_COMMANDS_DISABLED'; end $old$,$new$declare p jsonb:=public.trip_source_universal_original_pin();r jsonb;begin
 if p is not null then
  if tg_op<>'INSERT' then raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;
  if tg_level='STATEMENT' then return null;end if;
  r:=to_jsonb(new);
  if tg_table_name='trip_sources' then
   if r->>'id'<>p->>'sourceId' or r->>'trip_id'<>p->>'tripId' or r->>'acquired_by'<>p->>'actorId' or
    r->>'acquisition_key'<>p->>'operationKey' or r->>'current_material_revision'<>'1' or r->>'row_revision'<>'1' or
    not (p->>'profile'='OTR_UTF8_TEXT_FILE_V1' and r->>'source_kind'='FILE' and r->>'acquisition_channel'='FILES' or p->>'profile'='OTR_SUBMITTED_TEXT_V1' and r->>'source_kind'='TEXT' and r->>'acquisition_channel'='PASTE') then raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;
  elsif tg_table_name='trip_source_revisions' then
   if r->>'source_id'<>p->>'sourceId' or r->>'created_by'<>p->>'actorId' or r->>'material_revision'<>'1' or r->>'operation_key'<>p->>'operationKey' or r->'original_representation_ids'<>jsonb_build_array(p->>'representationId') then raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;
  elsif tg_table_name='trip_source_representations' then
   if r->>'source_id'<>p->>'sourceId' or r->>'id'<>p->>'representationId' or r->>'material_kind'<>'TEXT' or r->>'role'<>'ORIGINAL' or r->>'remote_state'<>'NOT_APPLICABLE' then raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;
  elsif tg_table_name='trip_source_actions' then
   if r->>'source_id'<>p->>'sourceId' or r->>'actor_account_id'<>p->>'actorId' or r->>'action'<>'ACQUIRE' or r->>'operation_key'<>p->>'operationKey' or r->>'operation_sha256'<>p->>'operationSha256' then raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;
  else raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;
  return new;
 end if;
 raise exception using errcode='42501',message='TRIP_SOURCE_COMMANDS_DISABLED'; end $new$);end$patch$;
-- Necessary closed capability, not general writer activation. No UPDATE/DELETE grants.
grant insert on public.trip_sources,public.trip_source_revisions,public.trip_source_representations,public.trip_source_actions,public.trip_source_operations to otr_trip_source_writer;
grant select on public.trip_source_operations,public.trip_source_actions to otr_trip_source_writer;
create policy universal_original_read on public.trip_source_actions for select to otr_trip_source_writer using(public.trip_source_universal_original_pin() is not null and source_id::text=public.trip_source_universal_original_pin()->>'sourceId' and actor_account_id::text=public.trip_source_universal_original_pin()->>'actorId' and operation_key=public.trip_source_universal_original_pin()->>'operationKey' and operation_sha256=public.trip_source_universal_original_pin()->>'operationSha256');
create policy universal_original_insert on public.trip_sources for insert to otr_trip_source_writer with check(public.trip_source_universal_original_pin() is not null and id::text=public.trip_source_universal_original_pin()->>'sourceId' and trip_id::text=public.trip_source_universal_original_pin()->>'tripId' and acquired_by::text=public.trip_source_universal_original_pin()->>'actorId');
create policy universal_original_insert on public.trip_source_revisions for insert to otr_trip_source_writer with check(public.trip_source_universal_original_pin() is not null and source_id::text=public.trip_source_universal_original_pin()->>'sourceId' and material_revision=1 and created_by::text=public.trip_source_universal_original_pin()->>'actorId');
create policy universal_original_insert on public.trip_source_representations for insert to otr_trip_source_writer with check(public.trip_source_universal_original_pin() is not null and source_id::text=public.trip_source_universal_original_pin()->>'sourceId' and id::text=public.trip_source_universal_original_pin()->>'representationId');
create policy universal_original_insert on public.trip_source_actions for insert to otr_trip_source_writer with check(public.trip_source_universal_original_pin() is not null and source_id::text=public.trip_source_universal_original_pin()->>'sourceId' and actor_account_id::text=public.trip_source_universal_original_pin()->>'actorId' and operation_key=public.trip_source_universal_original_pin()->>'operationKey' and operation_sha256=public.trip_source_universal_original_pin()->>'operationSha256');
create policy universal_original_insert on public.trip_source_operations for insert to otr_trip_source_writer with check(public.trip_source_universal_original_pin() is not null and id::text=public.trip_source_universal_original_pin()->>'operationId' and source_id::text=public.trip_source_universal_original_pin()->>'sourceId' and actor_account_id::text=public.trip_source_universal_original_pin()->>'actorId' and trip_id::text=public.trip_source_universal_original_pin()->>'tripId' and operation_key=public.trip_source_universal_original_pin()->>'operationKey' and operation_sha256=public.trip_source_universal_original_pin()->>'operationSha256');
create policy universal_original_read on public.trip_source_operations for select to otr_trip_source_writer using(public.trip_source_universal_original_pin() is not null and id::text=public.trip_source_universal_original_pin()->>'operationId' and source_id::text=public.trip_source_universal_original_pin()->>'sourceId' and actor_account_id::text=public.trip_source_universal_original_pin()->>'actorId' and trip_id::text=public.trip_source_universal_original_pin()->>'tripId');

create function public.trip_source_acquire_universal_original(actor uuid,raw text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$declare j jsonb;p jsonb;profile text;prior text;result jsonb;
begin
 if session_user<>'otr_trip_source_command_gateway' or raw is null or octet_length(raw)>2097152 then raise exception 'SOURCE_ACCESS_DENIED';end if;
 j:=public.trip_event_canonical_json(raw::json)::jsonb;
 profile:=case when j->'payload'->'source_input'->>'source_kind'='FILE' and j->'payload'->'original'->>'material_kind'='TEXT' then 'OTR_UTF8_TEXT_FILE_V1' when j->'payload'->'source_input'->>'source_kind'='TEXT' then 'OTR_SUBMITTED_TEXT_V1' else null end;
 if profile is null then raise exception 'UNIVERSAL_SOURCE_PROFILE_DENIED';end if;
 j:=case when profile='OTR_UTF8_TEXT_FILE_V1' then public.trip_source_utf8_file_codec(raw) else public.trip_source_command_codec(raw) end;
 if j->>'command'<>'ACQUIRE_SOURCE' or (j->>'actor_account_id')::uuid<>actor or not public.trip_source_admission(actor,(j->>'trip_id')::uuid,true) then raise exception 'SOURCE_ACCESS_DENIED';end if;
 p:=jsonb_build_object('profile',profile,'actorId',actor,'tripId',j->>'trip_id','sourceId',j->>'source_id','operationId',j->>'operation_id','operationKey',j->>'operation_key','operationSha256',j->>'operation_sha256','representationId',j->'payload'->'original'->>'id');
 prior:=current_setting('otr.universal.source_pin',true);perform set_config('otr.universal.source_pin',p::text,true);
 if public.trip_source_universal_original_pin() is null then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;
 result:=public.trip_source_acquire_source(actor,raw);
 if public.trip_source_universal_original_pin() is null then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;
 perform set_config('otr.universal.source_pin',coalesce(prior,''),true);return result;
 exception when others then perform set_config('otr.universal.source_pin',coalesce(prior,''),true);raise;
end$$;
alter function public.trip_source_utf8_file_codec(text) owner to otr_trip_source_writer;
alter function public.trip_source_universal_original_pin() owner to otr_trip_source_writer;
alter function public.trip_source_acquire_universal_original(uuid,text) owner to otr_trip_source_writer;
revoke all on function public.trip_source_utf8_file_codec(text),public.trip_source_universal_original_pin(),public.trip_source_acquire_universal_original(uuid,text) from public,anon,authenticated,service_role,otr_trip_source_command_gateway;
grant execute on function public.trip_source_acquire_universal_original(uuid,text) to otr_trip_source_command_gateway;
revoke create on schema public from otr_trip_source_writer;
do $$declare edge record;begin select * into strict edge from utf8_source_owner_edge;execute format('grant otr_trip_source_writer to postgres with admin %s,inherit %s,set %s',case when edge.admin_option then 'true' else 'false' end,case when edge.inherit_option then 'true' else 'false' end,case when edge.set_option then 'true' else 'false' end);end$$;
commit;
