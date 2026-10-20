-- PostgREST JSON numbers pass through JavaScript binary floating point.
-- Project exact numeric text separately for financial candidate reads.
alter table public.ledger_rate_quotes
  add column decimal_rate_text text generated always as (decimal_rate::text) stored;
notify pgrst, 'reload schema';
