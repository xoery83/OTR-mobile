-- The one-time append-only fixture repairs have completed in Hosted Dev.

drop function if exists public.ledger_repair_ui_polish_fixture_currency_v1(uuid, text);
drop function if exists public.ledger_repair_ui_polish_fixture_uuid_v1(uuid);
drop function if exists public.ledger_repair_ui_polish_fixture_lineage_v1(uuid);

notify pgrst, 'reload schema';
