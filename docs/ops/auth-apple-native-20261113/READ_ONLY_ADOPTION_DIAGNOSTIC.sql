-- Root2 must independently verify the existing connection targets approved DEV.
-- This file only observes the one preserved Apple QA attempt and policy metadata.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT current_setting('transaction_read_only') AS transaction_read_only,
       current_database() AS database_name;
SELECT enabled, policy_version, xmin::text AS policy_xmin
FROM otr_auth_guest_composite.policy
WHERE singleton;
SELECT count(*) AS exact_grants
FROM otr_auth_guest_composite.grants
WHERE adoption_id = '7da7240f-4019-4a60-b3d7-350525ecddef'::uuid
  AND actor_account_id = 'f155d314-2ee4-4dae-a3ac-0fca5464e58e'::uuid
  AND source_guest_local_id = 'fc2fc618-d4b0-4dc1-8ed4-586226fd3528'::uuid;
SELECT count(*) AS exact_stages
FROM otr_auth_guest_composite.sealed_stages
WHERE adoption_id = '7da7240f-4019-4a60-b3d7-350525ecddef'::uuid
  AND actor_account_id = 'f155d314-2ee4-4dae-a3ac-0fca5464e58e'::uuid
  AND source_guest_local_id = 'fc2fc618-d4b0-4dc1-8ed4-586226fd3528'::uuid;
SELECT count(*) AS original_terminal_receipts
FROM otr_auth_guest_composite.terminal_receipts
WHERE adoption_id = '7da7240f-4019-4a60-b3d7-350525ecddef'::uuid;
COMMIT;
