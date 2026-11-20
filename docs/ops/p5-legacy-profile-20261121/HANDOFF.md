# P5 legacy Manual compatibility candidate

Base: `4a64eeb09d8c953a4ba61f10123787f078e4ae85`. Native is the sole Beta Delivery Lead and serial Main integrator. Stable clone: `/Users/xoery/Project/otr-mobile-import/root1-p5-legacy-profile-20261121`.

## Fixed scope

Restore descriptor-free NAME/exact-empty service CREATE and full/sparse edits, without changing original intent bytes, IDs or hashes. Reject whitespace, NULL and malformed explicit v1; no implicit v1 downgrade. PgStorage omits optional identity_state only if both previous and new rows lack the descriptor, including same-row rekey. No SQL, migration, RLS, GRANT, Role, runtime activation or Hosted write.

## Verification

Original regression RED: 3 failed / 9 passed. Independent review found sparse auto-upgrade; dedicated RED reproduced it. Final five targeted suites: 144 PASS. Scoped ESLint and diff whitespace check PASS. Independent reviewer `/root/directed_reader_review` final NO_BLOCKER after sparse correction. Full Typecheck is NOT PASS: existing Native dependency tree lacks `@modelcontextprotocol/server`, producing MCP-only errors in retained log; no errors in changed files. No dependency installation or changes to another worktree.

## Integration and real acceptance

Native: cherry-pick this bounded commit onto the current candidate, preserving Layer3 changes and Native's independently fixed repository/SQLite81. No whole-branch replacement or numbering overwrite. Confirm latest registry before any integration; Root1 adds no SQLite number. Keep Frozen `.shape.service.partial()` structure intact. Native owns Build22/in-place device retention and actual P5 validation.

Root2: software-only deployment of Native's resulting fixed source, preserve current Auth/runtime/connection configuration and rollback; this legacy fix needs no SQL installation. Do not activate v1 merely because the Domain supports it.

Acceptance: original legacy P5 Create operation `0febbef3-0d4f-4ff9-a2b4-a9686a153571` remains immutable. Inspect original attempt/receipt before any send; UNKNOWN remains receipt-first, 404 is not NoCommit. Only genuinely never-sent intents may use normal original authorization. Obtain APPLIED/receipt, independent server Item/service readback, Native Day/Details and cold restore, no duplicate Item. Do not call this candidate Cloud/Native PASS.

Native-owned repository helper follow-up: retainedReceipt/recoverP1Receipts should classify through the same strict command validator (now legacy-compatible), preserving canonical intent and original IDs. An unrelated old P5 must not abort P1 receipt recovery. Do not introduce a second parser or alter stored intent. Root1 does not edit those owned files.
