begin;

alter table public.journey_members
  add column participation_active boolean not null default true,
  add column participation_revision bigint not null default 0,
  add constraint journey_members_participation_revision_check
    check (participation_revision between 0 and 9007199254740991);

-- Roles outlive a local db reset. Reserve this identity without executable grants.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'otr_trip_person_lifecycle_writer') then
    create role otr_trip_person_lifecycle_writer
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
  if exists (select 1 from pg_roles where rolname = 'otr_trip_person_lifecycle_writer'
      and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls))
    or pg_has_role('anon', 'otr_trip_person_lifecycle_writer', 'MEMBER')
    or pg_has_role('authenticated', 'otr_trip_person_lifecycle_writer', 'MEMBER')
    or pg_has_role('service_role', 'otr_trip_person_lifecycle_writer', 'MEMBER')
    or pg_has_role('authenticator', 'otr_trip_person_lifecycle_writer', 'MEMBER') then
    raise exception 'UNSAFE_PARTICIPATION_WRITER_ROLE';
  end if;
end;
$$;

create function public.guard_trip_person_participation()
returns trigger language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  -- I2C must install guarded commands/evidence before this identity can write.
  if current_user = 'otr_trip_person_lifecycle_writer' then
    raise exception 'PARTICIPATION_COMMANDS_DISABLED' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.participation_active := true;
    new.participation_revision := 0;
  else
    new.participation_active := old.participation_active;
    new.participation_revision := old.participation_revision;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_trip_person_participation()
  from public, anon, authenticated, service_role;

create trigger journey_members_participation_guard
before insert or update on public.journey_members
for each row execute function public.guard_trip_person_participation();

comment on column public.journey_members.participation_active is
  'Ordinary NEW Trip participation selection only; not link status, access, role, financial validity or deletion.';
comment on column public.journey_members.participation_revision is
  'Lifecycle-specific safe-integer revision, baseline 0; no lifecycle commands enabled in I2A.';

commit;
