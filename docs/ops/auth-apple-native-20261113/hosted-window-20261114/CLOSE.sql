-- Existing negative-only helper. No DDL, GRANT or positive activation.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SELECT otr_auth_guest_composite.close_qa_policy(true) AS closed;
COMMIT;
