BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714028,1);
DO $close$ BEGIN
IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND universal_p1_review_scope IS NOT NULL AND universal_p1_review_scope IS DISTINCT FROM '{"mode":"CONTINUOUS_MINIMUMS","version":1,"tripId":"825f79b2-4a9d-4535-a62e-43000ca50c4a","families":["P1","P2","P3","P4","P5","P6"],"expiresAt":"2026-11-01T08:48:56Z"}'::jsonb) THEN RAISE EXCEPTION 'CONTINUOUS_CLOSE_SCOPE_DRIFT';END IF;
UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false,universal_p1_review_scope=NULL WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid;
UPDATE public.trip_core_airport_identities SET enabled=false WHERE registry_version='otr-dev-universal-p2-airports/20261027/1';
END $close$;COMMIT;
