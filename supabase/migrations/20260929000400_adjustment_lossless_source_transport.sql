-- Read transport only: preserve exact numeric tokens for the existing JSONB CAS.
create or replace function public.ledger_adjustment_source_text_7_2c(
  target_root uuid,
  source_cutoff timestamptz default null
) returns text
language sql
set search_path = public
as $$
  select (case when source_cutoff is null
    then public.ledger_adjustment_source_7_2b(target_root)
    else public.ledger_adjustment_source_current_7_2c(target_root, source_cutoff)
  end)::text;
$$;

revoke all on function public.ledger_adjustment_source_text_7_2c(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ledger_adjustment_source_text_7_2c(uuid, timestamptz)
  to service_role;
