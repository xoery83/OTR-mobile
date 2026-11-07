-- Restore only after the owning finite scope has been closed.
-- PostgreSQL refuses this inverse while an unpriced finite scope still exists.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.universal_import_provider_scope
  ALTER COLUMN price_schedule_id SET NOT NULL;
COMMIT;
