-- Settlement 2.0 Phase 1A: personal, non-authoritative payment assertions.
-- These records never participate in canonical Settlement calculations.

create table public.personal_settlement_payment_records (
  id uuid primary key,
  journey_id uuid not null references public.trips(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  owner_member_id uuid not null references public.journey_members(id) on delete restrict,
  counterparty_member_id uuid not null references public.journey_members(id) on delete restrict,
  direction text not null check (direction in ('PAID', 'RECEIVED')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  scale smallint not null check (scale between 0 and 4),
  occurred_at timestamptz not null,
  note text check (note is null or char_length(note) <= 2000),
  recorded_equivalent_minor bigint check (recorded_equivalent_minor > 0),
  recorded_equivalent_currency text check (
    recorded_equivalent_currency is null or recorded_equivalent_currency ~ '^[A-Z]{3}$'
  ),
  recorded_equivalent_scale smallint check (
    recorded_equivalent_scale is null or recorded_equivalent_scale between 0 and 4
  ),
  reference_rate_decimal numeric(38,18) check (reference_rate_decimal > 0),
  reference_rate_date date,
  reference_source text check (reference_source is null or char_length(reference_source) <= 200),
  reference_provenance jsonb,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
  last_operation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, id),
  check (owner_member_id <> counterparty_member_id),
  check (
    (recorded_equivalent_minor is null and recorded_equivalent_currency is null
      and recorded_equivalent_scale is null)
    or
    (recorded_equivalent_minor is not null and recorded_equivalent_currency is not null
      and recorded_equivalent_scale is not null)
  ),
  check (reference_provenance is null or jsonb_typeof(reference_provenance) = 'object')
);

create table public.personal_settlement_payment_read_grants (
  record_id uuid not null references public.personal_settlement_payment_records(id) on delete restrict,
  journey_id uuid not null references public.trips(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  member_id uuid not null references public.journey_members(id) on delete restrict,
  relationship text not null check (relationship in ('OWNER', 'COUNTERPARTY')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (record_id, user_id, relationship),
  foreign key (journey_id, record_id)
    references public.personal_settlement_payment_records(journey_id, id) on delete restrict
);

create table public.personal_settlement_payment_audit_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.personal_settlement_payment_records(id) on delete restrict,
  journey_id uuid not null references public.trips(id) on delete restrict,
  prior_revision bigint check (prior_revision is null or prior_revision > 0),
  new_revision bigint not null check (new_revision > 0),
  event_type text not null check (event_type in ('CREATED', 'UPDATED', 'DELETED')),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_member_id uuid not null references public.journey_members(id) on delete restrict,
  operation_id uuid not null unique,
  reason text check (reason is null or char_length(reason) <= 2000),
  changed_fields text[] not null default '{}',
  record_snapshot jsonb not null check (jsonb_typeof(record_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (record_id, new_revision),
  foreign key (journey_id, record_id)
    references public.personal_settlement_payment_records(journey_id, id) on delete restrict
);

create table public.personal_settlement_payment_attachments (
  id uuid primary key,
  journey_id uuid not null references public.trips(id) on delete restrict,
  record_id uuid not null references public.personal_settlement_payment_records(id) on delete restrict,
  asset_id uuid not null references public.receipt_assets(id) on delete restrict,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  last_operation_id uuid not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, id),
  foreign key (journey_id, record_id)
    references public.personal_settlement_payment_records(journey_id, id) on delete restrict
);

create unique index personal_settlement_payment_attachments_active_idx
  on public.personal_settlement_payment_attachments(record_id, asset_id)
  where deleted_at is null;
create index personal_settlement_payments_journey_owner_idx
  on public.personal_settlement_payment_records(journey_id, owner_user_id, updated_at desc, id);
create index personal_settlement_payments_journey_counterparty_idx
  on public.personal_settlement_payment_records(journey_id, counterparty_member_id, updated_at desc, id);
create index personal_settlement_payment_grants_user_idx
  on public.personal_settlement_payment_read_grants(user_id, journey_id, record_id)
  where revoked_at is null;
create index personal_settlement_payment_audit_record_idx
  on public.personal_settlement_payment_audit_events(record_id, new_revision desc);
create index personal_settlement_payment_attachments_parent_idx
  on public.personal_settlement_payment_attachments(record_id, created_at, id);

create or replace function public.ledger_validate_personal_settlement_payment_1a()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.journey_members
    where id = new.owner_member_id and trip_id = new.journey_id
      and user_id = new.owner_user_id
  ) then
    raise exception 'PERSONAL_PAYMENT_OWNER_INVALID';
  end if;
  if not exists (
    select 1 from public.journey_members
    where id = new.counterparty_member_id and trip_id = new.journey_id
  ) then
    raise exception 'PERSONAL_PAYMENT_COUNTERPARTY_INVALID';
  end if;
  return new;
end;
$$;

create trigger personal_settlement_payment_validate
before insert or update on public.personal_settlement_payment_records
for each row execute function public.ledger_validate_personal_settlement_payment_1a();

create or replace function public.ledger_validate_personal_settlement_payment_attachment_1a()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.personal_settlement_payment_records r
    join public.receipt_assets a on a.id = new.asset_id
    join public.journey_members m on m.id = r.owner_member_id
    where r.id = new.record_id and r.journey_id = new.journey_id
      and a.journey_id = new.journey_id
      and r.owner_user_id = new.created_by_user_id
      and r.deleted_at is null
      and m.trip_id = r.journey_id and m.user_id = r.owner_user_id
      and m.status = 'linked' and m.role in ('owner', 'group_member')
  ) then
    raise exception 'PERSONAL_PAYMENT_ATTACHMENT_INVALID';
  end if;
  return new;
end;
$$;

create trigger personal_settlement_payment_attachment_validate
before insert or update on public.personal_settlement_payment_attachments
for each row execute function public.ledger_validate_personal_settlement_payment_attachment_1a();

alter table public.ledger_changes drop constraint ledger_changes_entity_type_check;
alter table public.ledger_changes add constraint ledger_changes_entity_type_check
  check (entity_type in (
    'EXPENSE', 'CORRECTION', 'SETTLEMENT', 'TRANSFER', 'TRANSFER_PAYMENT',
    'HOUSEHOLD', 'RATE_QUOTE', 'PAYMENT_RECORD', 'RECEIPT', 'REVIEW_FINDING',
    'JOURNEY_CURRENCY',
    'PERSONAL_SETTLEMENT_PAYMENT', 'PERSONAL_SETTLEMENT_PAYMENT_ATTACHMENT'
  ));

create or replace function public.ledger_record_personal_settlement_payment_change_1a()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.ledger_changes (
    journey_id, entity_type, entity_id, revision, is_tombstone
  ) values (
    new.journey_id, tg_argv[0], new.id, new.revision, new.deleted_at is not null
  ) on conflict (entity_type, entity_id, revision) do nothing;
  return new;
end;
$$;

create trigger personal_settlement_payment_change
after insert or update on public.personal_settlement_payment_records
for each row execute function public.ledger_record_personal_settlement_payment_change_1a(
  'PERSONAL_SETTLEMENT_PAYMENT'
);
create trigger personal_settlement_payment_attachment_change
after insert or update on public.personal_settlement_payment_attachments
for each row execute function public.ledger_record_personal_settlement_payment_change_1a(
  'PERSONAL_SETTLEMENT_PAYMENT_ATTACHMENT'
);

create or replace function public.ledger_can_read_personal_settlement_payment_1a(
  actor_user uuid,
  target_record uuid
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.personal_settlement_payment_records r
    where r.id = target_record
      and (
        exists (
          select 1 from public.personal_settlement_payment_read_grants g
          where g.record_id = r.id and g.user_id = actor_user and g.revoked_at is null
        )
        or exists (
          select 1 from public.journey_members m
          where m.trip_id = r.journey_id and m.user_id = actor_user
            and m.status = 'linked'
            and (m.role = 'owner' or m.id in (r.owner_member_id, r.counterparty_member_id))
        )
      )
  );
$$;

create or replace function public.ledger_list_personal_settlement_payments_1a(
  actor_user uuid,
  target_journey uuid
) returns setof public.personal_settlement_payment_records
language sql
security definer
stable
set search_path = public
as $$
  select r.*
  from public.personal_settlement_payment_records r
  where r.journey_id = target_journey
    and public.ledger_can_read_personal_settlement_payment_1a(actor_user, r.id)
  order by r.updated_at, r.id;
$$;

create or replace function public.ledger_list_personal_settlement_payment_attachments_1a(
  actor_user uuid,
  target_journey uuid,
  target_record uuid
) returns setof public.personal_settlement_payment_attachments
language sql
security definer
stable
set search_path = public
as $$
  select a.*
  from public.personal_settlement_payment_attachments a
  where a.journey_id = target_journey and a.record_id = target_record
    and public.ledger_can_read_personal_settlement_payment_1a(actor_user, a.record_id)
  order by a.created_at, a.id;
$$;

create or replace function public.ledger_list_personal_settlement_payment_changes_1a(
  actor_user uuid,
  target_journey uuid,
  after_sequence bigint,
  page_size integer
) returns table (
  sequence bigint,
  entity_type text,
  entity_id uuid,
  revision bigint,
  is_tombstone boolean,
  changed_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select c.sequence, c.entity_type, c.entity_id, c.revision, c.is_tombstone, c.changed_at
  from public.ledger_changes c
  where c.journey_id = target_journey and c.sequence > after_sequence
    and c.entity_type in (
      'PERSONAL_SETTLEMENT_PAYMENT', 'PERSONAL_SETTLEMENT_PAYMENT_ATTACHMENT'
    )
    and public.ledger_can_read_personal_settlement_payment_1a(
      actor_user,
      case when c.entity_type = 'PERSONAL_SETTLEMENT_PAYMENT'
        then c.entity_id
        else (select a.record_id from public.personal_settlement_payment_attachments a
              where a.id = c.entity_id)
      end
    )
  order by c.sequence
  limit least(greatest(page_size, 1), 500);
$$;

create or replace function public.ledger_validate_personal_settlement_payment_payload_1a(
  actor_member_id uuid,
  payment_value jsonb
) returns void
language plpgsql
set search_path = public
as $$
begin
  if payment_value ->> 'direction' not in ('PAID', 'RECEIVED') then
    raise exception 'PERSONAL_PAYMENT_DIRECTION_INVALID';
  end if;
  if coalesce((payment_value ->> 'amountMinor')::bigint, 0) <= 0 then
    raise exception 'PERSONAL_PAYMENT_AMOUNT_INVALID';
  end if;
  if coalesce(payment_value ->> 'currency', '') !~ '^[A-Z]{3}$'
     or coalesce((payment_value ->> 'scale')::smallint, -1) not between 0 and 4 then
    raise exception 'PERSONAL_PAYMENT_CURRENCY_INVALID';
  end if;
  if (payment_value ->> 'counterpartyMemberId')::uuid = actor_member_id then
    raise exception 'PERSONAL_PAYMENT_SELF_COUNTERPARTY';
  end if;
  if ((payment_value ->> 'recordedEquivalentMinor') is null)
     <> ((payment_value ->> 'recordedEquivalentCurrency') is null)
     or ((payment_value ->> 'recordedEquivalentMinor') is null)
     <> ((payment_value ->> 'recordedEquivalentScale') is null) then
    raise exception 'PERSONAL_PAYMENT_EQUIVALENT_INVALID';
  end if;
end;
$$;

create or replace function public.ledger_mutate_personal_settlement_payment_1a(
  actor_user uuid,
  target_journey uuid,
  target_record uuid,
  command_type_value text,
  base_revision_value bigint,
  operation_id_value uuid,
  payload_hash_value text,
  payment_value jsonb,
  audit_reason_value text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  current_record public.personal_settlement_payment_records%rowtype;
  saved_record public.personal_settlement_payment_records%rowtype;
  actor_member public.journey_members%rowtype;
  counterparty public.journey_members%rowtype;
  command_name text;
  event_name text;
  next_revision bigint;
  changed_fields text[];
  response_value jsonb;
begin
  if command_type_value not in ('CREATE', 'UPDATE', 'DELETE') then
    raise exception 'PERSONAL_PAYMENT_COMMAND_INVALID';
  end if;
  command_name := command_type_value || '_PERSONAL_SETTLEMENT_PAYMENT';
  perform pg_advisory_xact_lock(hashtextextended(actor_user::text || ':' || operation_id_value::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(target_record::text, 0));

  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = command_name and idempotency_key = operation_id_value::text
  for update;
  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into actor_member from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
    and role in ('owner', 'group_member')
  order by role = 'owner' desc, created_at
  limit 1;
  if actor_member.id is null then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;

  if command_type_value = 'CREATE' then
    if base_revision_value is not null then
      raise exception 'PERSONAL_PAYMENT_BASE_REVISION_INVALID';
    end if;
    if exists (select 1 from public.personal_settlement_payment_records where id = target_record) then
      raise exception 'PERSONAL_PAYMENT_IDENTITY_CONFLICT';
    end if;
    perform public.ledger_validate_personal_settlement_payment_payload_1a(
      actor_member.id, payment_value
    );
    select * into counterparty from public.journey_members
    where id = (payment_value ->> 'counterpartyMemberId')::uuid
      and trip_id = target_journey;
    if counterparty.id is null then
      raise exception 'PERSONAL_PAYMENT_COUNTERPARTY_INVALID';
    end if;

    insert into public.ledger_idempotency_keys (
      actor_user_id, journey_id, command_type, idempotency_key, payload_hash
    ) values (
      actor_user, target_journey, command_name, operation_id_value::text, payload_hash_value
    );

    insert into public.personal_settlement_payment_records (
      id, journey_id, owner_user_id, owner_member_id, counterparty_member_id,
      direction, amount_minor, currency, scale, occurred_at, note,
      recorded_equivalent_minor, recorded_equivalent_currency,
      recorded_equivalent_scale, reference_rate_decimal, reference_rate_date,
      reference_source, reference_provenance, created_by_user_id,
      updated_by_user_id, last_operation_id
    ) values (
      target_record, target_journey, actor_user, actor_member.id, counterparty.id,
      payment_value ->> 'direction', (payment_value ->> 'amountMinor')::bigint,
      payment_value ->> 'currency', (payment_value ->> 'scale')::smallint,
      (payment_value ->> 'occurredAt')::timestamptz, payment_value ->> 'note',
      nullif(payment_value ->> 'recordedEquivalentMinor', '')::bigint,
      payment_value ->> 'recordedEquivalentCurrency',
      nullif(payment_value ->> 'recordedEquivalentScale', '')::smallint,
      nullif(payment_value ->> 'referenceRateDecimal', '')::numeric,
      nullif(payment_value ->> 'referenceRateDate', '')::date,
      payment_value ->> 'referenceSource',
      nullif(payment_value -> 'referenceProvenance', 'null'::jsonb),
      actor_user, actor_user, operation_id_value
    ) returning * into saved_record;
    event_name := 'CREATED';
    changed_fields := array['record'];

    insert into public.personal_settlement_payment_read_grants (
      record_id, journey_id, user_id, member_id, relationship
    ) values (
      target_record, target_journey, actor_user, actor_member.id, 'OWNER'
    );
    if counterparty.user_id is not null then
      insert into public.personal_settlement_payment_read_grants (
        record_id, journey_id, user_id, member_id, relationship
      ) values (
        target_record, target_journey, counterparty.user_id, counterparty.id, 'COUNTERPARTY'
      ) on conflict do nothing;
    end if;
  else
    select * into current_record from public.personal_settlement_payment_records
    where id = target_record and journey_id = target_journey for update;
    if current_record.id is null then
      raise exception 'ENTITY_NOT_FOUND';
    end if;
    if current_record.owner_user_id <> actor_user or current_record.owner_member_id <> actor_member.id then
      raise exception 'PERSONAL_PAYMENT_WRITE_FORBIDDEN';
    end if;
    if current_record.deleted_at is not null then
      raise exception 'PERSONAL_PAYMENT_DELETED';
    end if;
    if current_record.revision <> base_revision_value then
      raise exception 'REVISION_CONFLICT';
    end if;
    next_revision := current_record.revision + 1;

    insert into public.ledger_idempotency_keys (
      actor_user_id, journey_id, command_type, idempotency_key, payload_hash
    ) values (
      actor_user, target_journey, command_name, operation_id_value::text, payload_hash_value
    );

    if command_type_value = 'UPDATE' then
      perform public.ledger_validate_personal_settlement_payment_payload_1a(
        actor_member.id, payment_value
      );
      select * into counterparty from public.journey_members
      where id = (payment_value ->> 'counterpartyMemberId')::uuid
        and trip_id = target_journey;
      if counterparty.id is null then
        raise exception 'PERSONAL_PAYMENT_COUNTERPARTY_INVALID';
      end if;
      update public.personal_settlement_payment_records set
        counterparty_member_id = counterparty.id,
        direction = payment_value ->> 'direction',
        amount_minor = (payment_value ->> 'amountMinor')::bigint,
        currency = payment_value ->> 'currency',
        scale = (payment_value ->> 'scale')::smallint,
        occurred_at = (payment_value ->> 'occurredAt')::timestamptz,
        note = payment_value ->> 'note',
        recorded_equivalent_minor = nullif(payment_value ->> 'recordedEquivalentMinor', '')::bigint,
        recorded_equivalent_currency = payment_value ->> 'recordedEquivalentCurrency',
        recorded_equivalent_scale = nullif(payment_value ->> 'recordedEquivalentScale', '')::smallint,
        reference_rate_decimal = nullif(payment_value ->> 'referenceRateDecimal', '')::numeric,
        reference_rate_date = nullif(payment_value ->> 'referenceRateDate', '')::date,
        reference_source = payment_value ->> 'referenceSource',
        reference_provenance = nullif(payment_value -> 'referenceProvenance', 'null'::jsonb),
        revision = next_revision, updated_by_user_id = actor_user,
        last_operation_id = operation_id_value, updated_at = now()
      where id = target_record returning * into saved_record;
      event_name := 'UPDATED';
      changed_fields := array['counterparty', 'direction', 'amount', 'occurredAt',
        'note', 'recordedEquivalent', 'referenceFx'];
      if counterparty.user_id is not null then
        insert into public.personal_settlement_payment_read_grants (
          record_id, journey_id, user_id, member_id, relationship
        ) values (
          target_record, target_journey, counterparty.user_id, counterparty.id, 'COUNTERPARTY'
        ) on conflict do nothing;
      end if;
    else
      update public.personal_settlement_payment_records set
        deleted_at = now(), revision = next_revision, updated_by_user_id = actor_user,
        last_operation_id = operation_id_value, updated_at = now()
      where id = target_record returning * into saved_record;
      event_name := 'DELETED';
      changed_fields := array['deletedAt'];
    end if;
  end if;

  insert into public.personal_settlement_payment_audit_events (
    record_id, journey_id, prior_revision, new_revision, event_type,
    actor_user_id, actor_member_id, operation_id, reason, changed_fields,
    record_snapshot
  ) values (
    target_record, target_journey,
    case when event_name = 'CREATED' then null else saved_record.revision - 1 end,
    saved_record.revision, event_name, actor_user, actor_member.id,
    operation_id_value, nullif(trim(audit_reason_value), ''), changed_fields,
    to_jsonb(saved_record)
  );

  response_value := jsonb_build_object(
    'record', to_jsonb(saved_record), 'idempotentReplay', false
  );
  update public.ledger_idempotency_keys set
    response_status = case when command_type_value = 'CREATE' then 201 else 200 end,
    response_body = response_value, completed_at = now()
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = command_name and idempotency_key = operation_id_value::text;
  return response_value;
end;
$$;

create or replace function public.ledger_grant_linked_personal_payment_history_1a()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.status = 'linked'
     and (old.user_id is distinct from new.user_id or old.status is distinct from new.status) then
    insert into public.personal_settlement_payment_read_grants (
      record_id, journey_id, user_id, member_id, relationship
    )
    select r.id, r.journey_id, new.user_id, new.id, 'COUNTERPARTY'
    from public.personal_settlement_payment_records r
    where r.journey_id = new.trip_id and r.counterparty_member_id = new.id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger journey_members_personal_payment_history_grant
after update of user_id, status on public.journey_members
for each row execute function public.ledger_grant_linked_personal_payment_history_1a();

create trigger personal_settlement_payment_audit_immutable
before update or delete on public.personal_settlement_payment_audit_events
for each row execute function public.ledger_reject_immutable_change();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'personal_settlement_payment_records',
    'personal_settlement_payment_read_grants',
    'personal_settlement_payment_audit_events',
    'personal_settlement_payment_attachments'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end;
$$;

revoke execute on function public.ledger_validate_personal_settlement_payment_1a() from public, anon, authenticated;
revoke execute on function public.ledger_validate_personal_settlement_payment_attachment_1a() from public, anon, authenticated;
revoke execute on function public.ledger_record_personal_settlement_payment_change_1a() from public, anon, authenticated;
revoke execute on function public.ledger_can_read_personal_settlement_payment_1a(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.ledger_list_personal_settlement_payments_1a(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.ledger_list_personal_settlement_payment_attachments_1a(uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.ledger_list_personal_settlement_payment_changes_1a(uuid,uuid,bigint,integer) from public, anon, authenticated;
revoke execute on function public.ledger_validate_personal_settlement_payment_payload_1a(uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_mutate_personal_settlement_payment_1a(uuid,uuid,uuid,text,bigint,uuid,text,jsonb,text) from public, anon, authenticated;
revoke execute on function public.ledger_grant_linked_personal_payment_history_1a() from public, anon, authenticated;

grant execute on function public.ledger_can_read_personal_settlement_payment_1a(uuid,uuid) to service_role;
grant execute on function public.ledger_list_personal_settlement_payments_1a(uuid,uuid) to service_role;
grant execute on function public.ledger_list_personal_settlement_payment_attachments_1a(uuid,uuid,uuid) to service_role;
grant execute on function public.ledger_list_personal_settlement_payment_changes_1a(uuid,uuid,bigint,integer) to service_role;
grant execute on function public.ledger_mutate_personal_settlement_payment_1a(uuid,uuid,uuid,text,bigint,uuid,text,jsonb,text) to service_role;

notify pgrst, 'reload schema';
