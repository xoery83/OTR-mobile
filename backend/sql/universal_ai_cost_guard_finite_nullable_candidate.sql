-- DEV only. Retain the existing finite scope identity and price foreign key.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.universal_import_provider_scope
  ALTER COLUMN price_schedule_id DROP NOT NULL;
COMMIT;
