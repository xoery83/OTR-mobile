-- After an approved install and a separately provisioned SCRAM verifier via
-- the existing private credential channel, activate only this service role.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
ALTER ROLE otr_mcp_operation_approval_gateway IN DATABASE postgres SET otr.mcp_beta.resource='https://api-dev.xoery.art/mcp';
ALTER ROLE otr_mcp_operation_approval_gateway IN DATABASE postgres SET otr.mcp_beta.risk_enabled='on';
ALTER ROLE otr_trip_metadata_gateway IN DATABASE postgres SET otr.mcp_beta.resource='https://api-dev.xoery.art/mcp';
ALTER ROLE otr_trip_metadata_gateway IN DATABASE postgres SET otr.mcp_beta.risk_enabled='on';
ALTER ROLE otr_mcp_operation_approval_gateway LOGIN CONNECTION LIMIT 1;
COMMIT;
