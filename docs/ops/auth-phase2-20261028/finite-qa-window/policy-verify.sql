-- Fresh independent connection after close; no auth.users access or cleanup.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object(
 'transactionReadOnly',current_setting('transaction_read_only'),
 'database',current_database(),
 'policyClosed',(SELECT count(*)=1 AND bool_and(NOT enabled AND policy_version='otr.auth.fileless-p1.unpriced/1') FROM otr_auth_guest_composite.policy),
 'policyXmin',(SELECT xmin::text FROM otr_auth_guest_composite.policy WHERE singleton),
 'sourceGuardUnchanged',EXISTS(SELECT 1 FROM pg_proc WHERE oid=66410 AND md5(pg_get_functiondef(oid))='6c7ef0d85cfd8893796ccc53e31f51f0'),
 'allGrantsBound',NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.grants WHERE actor_account_id<>'71b94800-f860-4685-a5d4-954adae38113'::uuid OR source_guest_local_id<>'d6b17e95-b6cd-4816-9c61-daa9d0acdc8f'::uuid),
 'allStagesBound',NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.sealed_stages WHERE actor_account_id<>'71b94800-f860-4685-a5d4-954adae38113'::uuid OR source_guest_local_id<>'d6b17e95-b6cd-4816-9c61-daa9d0acdc8f'::uuid),
 'unjoinedTerminalEvidence',EXISTS(SELECT 1 FROM otr_auth_guest_composite.terminal_evidence e LEFT JOIN otr_auth_guest_composite.sealed_stages s USING(adoption_id) WHERE s.adoption_id IS NULL),
 'unjoinedReceipts',EXISTS(SELECT 1 FROM otr_auth_guest_composite.terminal_receipts r LEFT JOIN otr_auth_guest_composite.sealed_stages s USING(adoption_id) WHERE s.adoption_id IS NULL)
) AS auth_qa_close;
COMMIT;
