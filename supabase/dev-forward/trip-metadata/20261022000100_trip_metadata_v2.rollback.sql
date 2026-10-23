-- Deactivation-only rollback: retain revision monotonicity, receipts and accepted Trip metadata.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'METADATA_INSTALLER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled)
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_metadata_gateway' AND rolcanlogin)
 OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='otr_trip_metadata_gateway')
 THEN RAISE EXCEPTION 'METADATA_CLOSE_BEFORE_ROLLBACK'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid),public.trip_metadata_snapshot(uuid,uuid,uuid),
 public.trip_metadata_update_command(uuid,uuid,uuid,jsonb),public.trip_metadata_update_result(uuid,uuid) FROM otr_trip_metadata_gateway;
-- Do not drop revision guard or restore the live-valued Create result: that would reintroduce stale-receipt bugs.
COMMIT;
