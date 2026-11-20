-- Restore the original read-only runtime/container before running this command.
-- Retain installed schema and evidence; do not reverse durable lifecycle or P5 data.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
ALTER ROLE otr_mcp_operation_approval_gateway NOLOGIN PASSWORD NULL;
REVOKE EXECUTE ON FUNCTION public.mcp_managed_l3_trip_delete_approval(text,uuid,uuid,jsonb,boolean,uuid),
 public.mcp_managed_risk_admission(text,uuid,jsonb),public.mcp_managed_risk_plan_fence(uuid,jsonb)
 FROM otr_mcp_operation_approval_gateway;
REVOKE EXECUTE ON FUNCTION public.mcp_managed_l3_assert_lifecycle(uuid,uuid,text,uuid,jsonb,jsonb)
 FROM otr_trip_metadata_gateway;
COMMIT;
