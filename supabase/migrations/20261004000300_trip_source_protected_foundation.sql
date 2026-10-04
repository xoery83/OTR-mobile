begin;
-- C-I3B: protected server foundation only. No Source commands or business DML.
create function public.trip_source_uuid_array_valid(ids uuid[], minimum integer, maximum integer)
returns boolean language sql immutable security invoker set search_path=pg_catalog
as $$ select coalesce(array_ndims(ids)=1 and array_lower(ids,1)=1
  and cardinality(ids) between minimum and maximum
  and ids=array(select distinct x from unnest(ids) x where x is not null order by x),
  ids='{}'::uuid[] and minimum=0) $$;

create table public.trip_sources (
 id uuid primary key,
 trip_id uuid not null references public.trips(id) on delete restrict,
 acquired_by uuid not null references auth.users(id) on delete restrict,
 acquisition_key text not null check(acquisition_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 acquisition_sha256 text,
 source_kind text not null check(source_kind in ('FILE','IMAGE','TEXT','URL','EMAIL')),
 acquisition_channel text not null,
 captured_at timestamptz(6),
 capture_time_basis text not null check(capture_time_basis in ('OBSERVED','SUPPLIED','UNKNOWN')),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 access_mode text not null default 'OWNER_PRIVATE' check(access_mode='OWNER_PRIVATE'),
 lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','DELETED')),
 current_material_revision bigint not null check(current_material_revision between 1 and 9007199254740991),
 row_revision bigint not null check(row_revision between 1 and 9007199254740991),
 retention_state text not null default 'RETAINED' check(retention_state in ('RETAINED','IDENTITY_ONLY')),
 deleted_at timestamptz(6),
 deleted_by uuid references auth.users(id) on delete restrict,
 unique(trip_id,acquired_by,acquisition_key),
 check(acquisition_sha256 ~ '^[0-9a-f]{64}$' and acquisition_sha256 is not null or acquisition_sha256 is null and retention_state='IDENTITY_ONLY'),
 check((capture_time_basis='UNKNOWN')=(captured_at is null) and (captured_at is null or isfinite(captured_at))),
 check((lifecycle='DELETED')=(deleted_at is not null) and (lifecycle='DELETED')=(deleted_by is not null) and (deleted_at is null or isfinite(deleted_at))),
 check(acquisition_channel='COPY' or
  source_kind='FILE' and acquisition_channel='FILES' or
  source_kind='IMAGE' and acquisition_channel in ('CAMERA','PHOTOS','FILES') or
  source_kind='TEXT' and acquisition_channel='PASTE' or
  source_kind='URL' and acquisition_channel='URL_CAPTURE' or
  source_kind='EMAIL' and acquisition_channel='EMAIL_INPUT')
);
create table public.trip_source_revisions (
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 material_revision bigint not null check(material_revision between 1 and 9007199254740991),
 previous_revision bigint,
 created_at timestamptz(6) not null check(isfinite(created_at)),
 created_by uuid not null references auth.users(id) on delete restrict,
 operation_key text not null check(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 capture_sha256 text,
 original_representation_ids uuid[] not null check(public.trip_source_uuid_array_valid(original_representation_ids,1,64)),
 completeness text not null check(completeness in ('AS_SUPPLIED','PARTIAL_CAPTURE')),
 reason text not null check(reason in ('ACQUISITION','REPLACEMENT','REFRESH','ADD_PART','SAVED_TEXT_EDIT','AUTHORIZED_COPY')),
 origin_source_id uuid,
 origin_material_revision bigint,
 retention_state text not null default 'RETAINED' check(retention_state in ('RETAINED','IDENTITY_ONLY')),
 primary key(source_id,material_revision),
 unique(source_id,operation_key),
 foreign key(source_id,previous_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict deferrable initially deferred,
 foreign key(origin_source_id,origin_material_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict deferrable initially deferred,
 check(capture_sha256 ~ '^[0-9a-f]{64}$' and capture_sha256 is not null or capture_sha256 is null and retention_state='IDENTITY_ONLY'),
 check(material_revision=1 and previous_revision is null and reason in ('ACQUISITION','AUTHORIZED_COPY') or
  material_revision>1 and previous_revision=material_revision-1 and previous_revision is not null and reason in ('REPLACEMENT','REFRESH','ADD_PART','SAVED_TEXT_EDIT')),
 check((origin_source_id is null)=(origin_material_revision is null) and (reason='AUTHORIZED_COPY')=(origin_source_id is not null) and (origin_source_id is null or origin_source_id<>source_id))
);
alter table public.trip_sources add constraint trip_source_current_revision_fk
 foreign key(id,current_material_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict deferrable initially deferred;

create table public.trip_source_representations (
 id uuid primary key,
 row_revision bigint not null check(row_revision between 1 and 9007199254740991),
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 introduced_revision bigint not null,
 role text not null check(role in ('ORIGINAL','DERIVED')),
 material_kind text not null check(material_kind in ('BINARY','TEXT','LOCATOR')),
 original_filename text check(char_length(original_filename) between 1 and 255),
 part_key text check(char_length(part_key) between 1 and 128),
 mime_type text,
 encoding text,
 payload_sha256 text,
 byte_count bigint,
 text_content text check(octet_length(text_content)<=262144),
 locator_uri text check(char_length(locator_uri)<=4096 and octet_length(locator_uri)<=16384 and locator_uri ~ '^https?://[^[:space:]]+$'),
 parent_ids uuid[] not null default '{}',
 transform_key text check(char_length(transform_key) between 1 and 128),
 transform_version text check(char_length(transform_version) between 1 and 128),
 transform_options_sha256 text,
 regenerability text not null check(regenerability in ('NOT_APPLICABLE','POSSIBLE','IMPOSSIBLE')),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 storage_provider text,
 storage_bucket text,
 object_key text,
 remote_state text not null check(remote_state in ('PENDING','VERIFIED','LOST','PURGED','NOT_APPLICABLE')),
 verified_at timestamptz(6) check(verified_at is null or isfinite(verified_at)),
 retention_state text not null default 'RETAINED' check(retention_state in ('RETAINED','PURGE_PENDING','PAYLOAD_PURGED','IDENTITY_ONLY')),
 unique(source_id,id),
 unique(storage_bucket,object_key),
 foreign key(source_id,introduced_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict deferrable initially deferred,
 check(public.trip_source_uuid_array_valid(parent_ids,case when role='ORIGINAL' then 0 else 1 end,case when role='ORIGINAL' then 0 else 16 end)),
 check(not id=any(parent_ids)),
 check(payload_sha256 ~ '^[0-9a-f]{64}$' and payload_sha256 is not null or payload_sha256 is null and retention_state='IDENTITY_ONLY'),
 check(byte_count between 0 and 9007199254740991 and byte_count is not null or byte_count is null and retention_state='IDENTITY_ONLY'),
 check(transform_options_sha256 is null or transform_options_sha256 ~ '^[0-9a-f]{64}$'),
 check(role='ORIGINAL' and transform_key is null and transform_version is null and transform_options_sha256 is null and regenerability='NOT_APPLICABLE' or
  role='DERIVED' and transform_key is not null and transform_version is not null and (transform_options_sha256 is not null or retention_state='IDENTITY_ONLY') and regenerability in ('POSSIBLE','IMPOSSIBLE'))
);

-- Row-local structure; exact object scope and array references are deferred below.
create function public.trip_source_representation_valid(j jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$
declare kind text:=j->>'material_kind'; retained boolean:=j->>'retention_state' in ('RETAINED','PURGE_PENDING');
 redacted boolean:=j->>'retention_state'='IDENTITY_ONLY'; payload text;
begin
 if kind='BINARY' then
  return coalesce(j->>'mime_type'=any(array['application/pdf','image/jpeg','image/png','image/heic','image/heif'])
   and j->>'encoding' is null and j->>'text_content' is null and j->>'locator_uri' is null
   and j->>'storage_provider'='supabase_storage' and j->>'storage_bucket'='trip-source-material'
   and j->>'object_key' is not null and char_length(j->>'object_key')<=256
   and (redacted and j->>'byte_count' is null or (j->>'byte_count')::bigint between 1 and case when j->>'mime_type'='application/pdf' then 10485760 else 52428800 end)
   and case when retained then j->>'remote_state' in ('PENDING','VERIFIED','LOST') else j->>'remote_state'='PURGED' end
   and (j->>'remote_state'<>'VERIFIED' or j->>'verified_at' is not null),false);
 end if;
 if j->>'mime_type' is not null or j->>'encoding' is distinct from 'UTF-8'
  or j->>'storage_provider' is not null or j->>'storage_bucket' is not null or j->>'object_key' is not null
  or j->>'remote_state' is distinct from 'NOT_APPLICABLE' or j->>'verified_at' is not null then return false; end if;
 if kind='TEXT' then
  if j->>'locator_uri' is not null then return false; end if;
  payload:=j->>'text_content';
 elsif kind='LOCATOR' then
  if j->>'text_content' is not null then return false; end if;
  payload:=j->>'locator_uri';
 else return false; end if;
 if not retained then return payload is null; end if;
 return coalesce(payload is not null and octet_length(payload)=(j->>'byte_count')::bigint
  and encode(extensions.digest(convert_to(payload,'UTF8'),'sha256'),'hex')=j->>'payload_sha256',false);
end;
$$;
alter table public.trip_source_representations add constraint trip_source_representation_structure
 check(public.trip_source_representation_valid(to_jsonb(trip_source_representations.*)));

create table public.trip_source_actions (
 id uuid primary key,
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 actor_account_id uuid not null references auth.users(id) on delete restrict,
 operation_key text not null check(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 operation_sha256 text not null check(operation_sha256 ~ '^[0-9a-f]{64}$'),
 action text not null check(action in ('ACQUIRE','REPLACE','DELETE_SOURCE','PURGE','MARK_LOST','REDACT')),
 occurred_at timestamptz(6) not null check(isfinite(occurred_at)),
 source_row_revision bigint not null check(source_row_revision between 1 and 9007199254740991),
 material_revision bigint,
 representation_id uuid,
 run_id uuid check(run_id is null),
 candidate_id uuid check(candidate_id is null),
 slot_id uuid check(slot_id is null),
 association_id uuid check(association_id is null),
 confirmation_id uuid check(confirmation_id is null),
 reason_code text not null check(reason_code in ('USER_REQUEST','CAPTURE_CHANGE','DOMAIN_DELETE','VERIFIED_LOSS','SECURITY_REDACTION')),
 unique(source_id,actor_account_id,operation_key),
 foreign key(source_id,material_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict deferrable initially deferred,
 foreign key(source_id,representation_id) references public.trip_source_representations(source_id,id) on delete restrict deferrable initially deferred,
 check(action not in ('ACQUIRE','REPLACE') or material_revision is not null),
 check(action not in ('PURGE','MARK_LOST') or representation_id is not null),
 check(action in ('PURGE','MARK_LOST','REDACT') or representation_id is null),
 check(action in ('ACQUIRE','DELETE_SOURCE','PURGE') and reason_code='USER_REQUEST' or
  action='REPLACE' and reason_code='CAPTURE_CHANGE' or action='MARK_LOST' and reason_code='VERIFIED_LOSS' or action='REDACT' and reason_code='SECURITY_REDACTION')
);

-- Validate reuse BEFORE sanitizing new-table default privileges. Fail atomically.
do $$
begin
 if not exists(select 1 from pg_roles where rolname='otr_trip_source_writer') then
  create role otr_trip_source_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 end if;
 if exists(select 1 from pg_roles where rolname='otr_trip_source_writer' and
  (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls or rolreplication))
  or exists(select 1 from pg_auth_members m where m.member='otr_trip_source_writer'::regrole or
   m.roleid='otr_trip_source_writer'::regrole and (m.set_option or m.inherit_option or m.member<>'postgres'::regrole))
  or exists(select 1 from pg_proc where proowner='otr_trip_source_writer'::regrole)
  or exists(select 1 from pg_namespace where nspowner='otr_trip_source_writer'::regrole) then
  raise exception 'UNSAFE_TRIP_SOURCE_WRITER_ROLE';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','storage','auth') and c.relkind in ('r','p','v','m','f','S')
   and (c.relowner='otr_trip_source_writer'::regrole or
   c.relkind<>'S' and has_table_privilege('otr_trip_source_writer',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or
   c.relkind='S' and has_sequence_privilege('otr_trip_source_writer',c.oid,'USAGE,SELECT,UPDATE'))) then
  raise exception 'UNSAFE_TRIP_SOURCE_WRITER_GRANTS';
 end if;
 if exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage','auth')
  and c.relkind in ('r','p','v','m','f') and a.attnum>0 and not a.attisdropped
  and has_column_privilege('otr_trip_source_writer',c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) then
  raise exception 'UNSAFE_TRIP_SOURCE_WRITER_COLUMN_GRANTS';
 end if;
end;
$$;

-- Runtime DML is unconditionally disabled, including owner-owned existing RPCs.
create function public.guard_trip_source_mutation()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ begin raise exception using errcode='42501',message='TRIP_SOURCE_COMMANDS_DISABLED'; end $$;

-- Read-only full-scope validator: caller RLS never hides missing manifest members.
create function public.validate_trip_source_aggregate()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare sid uuid; root public.trip_sources%rowtype; rev public.trip_source_revisions%rowtype;
 rep public.trip_source_representations%rowtype; act public.trip_source_actions%rowtype;
begin
 sid:=(to_jsonb(new)->>case when tg_table_name='trip_sources' then 'id' else 'source_id' end)::uuid;
 select * into strict root from public.trip_sources where id=sid for share;
 for rev in select * from public.trip_source_revisions where source_id=sid loop
  if rev.created_by<>root.acquired_by or rev.material_revision>root.current_material_revision or
   rev.material_revision=1 and ((root.acquisition_channel='COPY')<>(rev.reason='AUTHORIZED_COPY')) or
   rev.material_revision=1 and rev.operation_key<>root.acquisition_key or
   exists(select 1 from unnest(rev.original_representation_ids) i
    left join public.trip_source_representations r on r.id=i
    where r.id is null or r.source_id<>sid or r.role<>'ORIGINAL' or r.introduced_revision>rev.material_revision) then
   raise exception using errcode='23514',message='INVALID_TRIP_SOURCE_MANIFEST';
  end if;
 end loop;
 for rep in select * from public.trip_source_representations where source_id=sid loop
  if rep.material_kind='BINARY' and rep.object_key<>'v1/'||root.trip_id::text||'/'||sid::text||'/'||rep.id::text||'/payload' then
   raise exception using errcode='23514',message='INVALID_TRIP_SOURCE_OBJECT_KEY';
  end if;
  if rep.role='ORIGINAL' and not exists(select 1 from public.trip_source_revisions r
   where r.source_id=sid and r.material_revision=rep.introduced_revision and rep.id=any(r.original_representation_ids)) then
   raise exception using errcode='23514',message='INVALID_TRIP_SOURCE_ORIGINAL_MEMBERSHIP';
  end if;
  if exists(select 1 from unnest(rep.parent_ids) i left join public.trip_source_representations p on p.id=i
    where p.id is null or p.source_id<>sid or p.introduced_revision>rep.introduced_revision or p.created_at>rep.created_at) then
   raise exception using errcode='23514',message='INVALID_TRIP_SOURCE_LINEAGE';
  end if;
 end loop;
 -- Deduplicate reachable (start,ancestor) pairs once per aggregate, not paths.
 -- The separate parent checks above reject missing/cross-Source/unknown ancestry.
 if exists(with recursive lineage(start_id,ancestor_id) as (
  select r.id,p from public.trip_source_representations r
   cross join lateral unnest(r.parent_ids) p where r.source_id=sid
  union
  select l.start_id,p from lineage l
   join public.trip_source_representations r on r.id=l.ancestor_id and r.source_id=sid
   cross join lateral unnest(r.parent_ids) p
 ) select 1 from lineage where start_id=ancestor_id) then
  raise exception using errcode='23514',message='INVALID_TRIP_SOURCE_LINEAGE';
 end if;
 for act in select * from public.trip_source_actions where source_id=sid loop
  if act.actor_account_id<>root.acquired_by or act.source_row_revision>root.row_revision or
   act.representation_id is not null and act.material_revision is not null and
    not exists(select 1 from public.trip_source_representations r where r.id=act.representation_id and r.introduced_revision<=act.material_revision) then
   raise exception using errcode='23514',message='INVALID_TRIP_SOURCE_ACTION_SCOPE';
  end if;
 end loop;
 return null;
end;
$$;

do $$
declare t text;
begin
 foreach t in array array['trip_sources','trip_source_revisions','trip_source_representations','trip_source_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated,service_role,otr_trip_source_writer',t);
  execute format('create trigger trip_source_mutation_guard before insert or update or delete on public.%I for each row execute function public.guard_trip_source_mutation()',t);
  execute format('create trigger trip_source_statement_guard before insert or update or delete or truncate on public.%I for each statement execute function public.guard_trip_source_mutation()',t);
  execute format('create constraint trigger trip_source_aggregate_check after insert or update on public.%I deferrable initially deferred for each row execute function public.validate_trip_source_aggregate()',t);
 end loop;
end;
$$;
revoke all on function public.trip_source_uuid_array_valid(uuid[],integer,integer) from public,anon,authenticated,service_role,otr_trip_source_writer;
revoke all on function public.trip_source_representation_valid(jsonb) from public,anon,authenticated,service_role,otr_trip_source_writer;
revoke all on function public.guard_trip_source_mutation() from public,anon,authenticated,service_role,otr_trip_source_writer;
revoke all on function public.validate_trip_source_aggregate() from public,anon,authenticated,service_role,otr_trip_source_writer;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('trip-source-material','trip-source-material',false,52428800,
 array['application/pdf','image/jpeg','image/png','image/heic','image/heif']);
-- Restrictive deny complements every current/future permissive client policy.
create policy trip_source_material_client_deny on storage.objects as restrictive
 for all to anon,authenticated using(bucket_id<>'trip-source-material') with check(bucket_id<>'trip-source-material');
create policy trip_source_bucket_client_deny on storage.buckets as restrictive
 for all to anon,authenticated using(id<>'trip-source-material') with check(id<>'trip-source-material');

do $$
declare r text; t text;
begin
 for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','otr_trip_source_writer') loop
  foreach t in array array['trip_sources','trip_source_revisions','trip_source_representations','trip_source_actions'] loop
   if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or exists(select 1 from pg_attribute a where a.attrelid=('public.'||t)::regclass and a.attnum>0 and not a.attisdropped
     and has_column_privilege(r,a.attrelid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) then
    raise exception 'UNSAFE_TRIP_SOURCE_RUNTIME_GRANTS';
   end if;
  end loop;
 end loop;
end;
$$;
commit;
