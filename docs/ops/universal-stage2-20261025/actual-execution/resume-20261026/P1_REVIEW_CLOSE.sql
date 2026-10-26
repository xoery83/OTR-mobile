-- Scope closure only; retain all candidates/Core records/receipts.
BEGIN;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND universal_p1_review_scope IS NOT NULL AND universal_p1_review_scope->>'candidateId' IS DISTINCT FROM '44e7b9b4-c46d-83f4-8ad1-2c5fd08f4a67') THEN RAISE EXCEPTION 'P1_REVIEW_CLOSE_SCOPE_DRIFT';END IF;
 UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false,universal_p1_review_scope=NULL WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543';
END $$;
COMMIT;
