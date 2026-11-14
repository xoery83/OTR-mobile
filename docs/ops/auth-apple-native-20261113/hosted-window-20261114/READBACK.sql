-- One JSON row for existing LinkedPG CLI; metadata and original operation only.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'transactionReadOnly',current_setting('transaction_read_only'),
 'databaseName',current_database(),
 'policy',(SELECT jsonb_build_object('enabled',enabled,'version',policy_version,'xmin',xmin::text) FROM otr_auth_guest_composite.policy WHERE singleton),
 'grants',(SELECT count(*) FROM otr_auth_guest_composite.grants WHERE adoption_id='7da7240f-4019-4a60-b3d7-350525ecddef'::uuid),
 'stages',(SELECT count(*) FROM otr_auth_guest_composite.sealed_stages WHERE adoption_id='7da7240f-4019-4a60-b3d7-350525ecddef'::uuid),
 'terminalReceipts',(SELECT count(*) FROM otr_auth_guest_composite.terminal_receipts WHERE adoption_id='7da7240f-4019-4a60-b3d7-350525ecddef'::uuid)
) AS evidence;
COMMIT;
