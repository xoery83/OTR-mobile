-- otr-r3-dev-v1-ledger-init-1. Forward-only; never rewrite the frozen R3 baseline.
-- Owner-approved local implementation; separate Hosted execution approval required.
begin;
set local search_path = pg_catalog;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $precondition$
begin
  if not exists (
    select 1 from otr_dev_migrations.lineage
    where version = 'otr-r3-dev-v1'
      and baseline_sha256 = 'f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52'
      and scope = 'CLOSED_ONLY_BETA; SERVER73_OPEN_DEFERRED'
  ) then
    raise exception 'R3_LEDGER_INIT_LINEAGE_MISMATCH';
  end if;
  if encode(extensions.digest(pg_get_functiondef(
    'public.add_trip_creator_as_journey_member()'::regprocedure), 'sha256'), 'hex')
    <> '6aff434d161f063678984d1f7df712c9706e52bf81d79be1ac71b0baae8ba746'
  then
    raise exception 'R3_LEDGER_INIT_FUNCTION_DRIFT';
  end if;
  if not (select relrowsecurity and relforcerowsecurity
    from pg_class where oid = 'public.ledger_settings'::regclass)
  then
    raise exception 'R3_LEDGER_INIT_FORCE_RLS_REQUIRED';
  end if;
end;
$precondition$;

CREATE OR REPLACE FUNCTION public.add_trip_creator_as_journey_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  creator_name text;
  creator_avatar text;
begin
  select display_name, avatar_url
    into creator_name, creator_avatar
  from public.profiles
  where id = new.created_by;

  insert into public.journey_members (
    trip_id,
    user_id,
    display_name,
    avatar_url,
    role,
    status,
    linked_at
  )
  values (
    new.id,
    new.created_by,
    coalesce(creator_name, 'Owner'),
    creator_avatar,
    'owner',
    'linked',
    now()
  )
  on conflict (trip_id, user_id) do nothing;

  insert into public.ledger_settings (
    journey_id, settlement_currency, settlement_scale, valuation_policy, updated_by
  )
  values (
    new.id, 'NZD', public.ledger_currency_scale('NZD'), 'REFERENCE_RATE', new.created_by
  )
  on conflict (journey_id) do nothing;

  return new;
end;
$function$;

comment on function public.add_trip_creator_as_journey_member() is
'R3 forward otr-r3-dev-v1-ledger-init-1; parent=otr-r3-dev-v1; canonical=4f97bb6f96daaab7f96f19d192683f63846a413b; fresh Trip settings only; CLOSED_ONLY_BETA; SERVER73_OPEN_DEFERRED';
commit;
