# Exact DEV install — C04 Claim/read-state repair

**Candidate only. No installation or runtime execution is authorized yet.**

Target: Supabase DEV `tuqigdxrvrerfewsxqgm`, Root2 as sole protected Writer.
Installation SQL SHA256:
`94ee6ccb53f61aa59abeb345e628f75107afac490dcbd6bf710b3c75eaf1ed1e`.
All other fixed artifacts and the exact rollback hash are in `PACKAGE_MANIFEST.json`.

This repairs the actual `link / CORE_V2_CAPABILITY_CLOSED / 42501` failure:

- Add three nullable server-only proof columns to existing private
  `trip_directed_invite_targets`: xid8 transaction, backend PID, original Claim UUID,
  plus an all-empty/all-complete constraint. Existing rows retain null proof.
- Add `trip_member_claim_read_state_allowed(uuid)`, postgres-owned SECURITY DEFINER,
  `pg_catalog` search path, owner-only EXECUTE. No new gateway EXECUTE.
- Replace the existing Claim dispatcher to validate original operation/digest and
  mint/clear proof within its existing atomic link transaction.
- Replace the existing Core guard with one narrow verified Claim UPDATE branch;
  preserve every existing Guest/Core branch, owner and ACL.

No new table, role, RLS policy, ordinary table grant, Provider/OAuth configuration,
Session, invitation or membership business operation is part of installation.
Runtime and Backend/Native entry remain closed. Ordinary software integration is
separate from this protected SQL authority.

Root2 must verify fresh source/function/ACL preimages and no competing protected
operation, then install the exact SQL once. Marker project must equal the DEV ref;
`otr.auth.member_claim_read_state_gate` must equal `OTR_C04_LINK_READ_STATE_V1`.
Any drift, unexpected default ACL or postcheck failure aborts the transaction.
After ambiguous transport, independently read metadata; never blindly reinstall.
Read back the three nullable types/constraint, new helper owner/ACL/search path,
changed function hashes, unchanged old ACL/RLS and closed runtime independently.

This request also includes only the fixed `ROLLBACK_CANDIDATE.sql` in this package
(SHA256 `7cafa40d93387ebe0415f89cd7f77555f3af7226070dbdb067af94385ae4166c`):
after runtime closure, no in-flight Claim and all proof fields null, restore the
two exact old functions, remove the helper and only these three new ephemeral
columns/constraint. It preserves invitations, membership, receipts and read state.
Fresh installed fingerprints/ACL must match; otherwise stop rather than improvise.

Real isolated PG RED→GREEN, canonical digest agreement, rollback, original receipt
recovery after lost COMMIT acknowledgement, idempotency and permission negatives
are recorded in `VALIDATION.json`; independent review is recorded alongside it.
Root1 final Core review and the fixed candidate commit are required before asking
Owner to approve. This approval does not open another QA window or retry `4028…`.
