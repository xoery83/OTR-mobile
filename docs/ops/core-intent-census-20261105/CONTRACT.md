# Core pending-intent metadata census

Request: `NATIVE-B-QA-CORE-INTENT-CENSUS-20261105-01`.

`readCorePendingIntentCensus(database)` is a standalone Core read port in
`src/data/repositories/corePendingIntentCensus.ts`. Pass only an already-held,
initialized SQLite connection exposing the existing `getAllAsync` interface. No
Account/session getter or Account ID argument is required, including pre-OTP/Guest.
Coverage is explicitly `ALL_LOCAL_ACCOUNT_NAMESPACES`: all rows in this table in this
one App-owned connection, including every Account, Trip and orphan. This is local
metadata observation, not cross-Account Cloud authority or permission to open other
connections. Caller/connection lifecycle and eligibility to hold this DB remain with
the caller. No Account/Trip identity is selected or returned.

One SELECT groups `state,reconciled_revision` and counts rows. Output is exactly
`{ coverage: "ALL_LOCAL_ACCOUNT_NAMESPACES", total, groups: [{ state, reconciledRevision, count }] }`; no row identity, source,
command, hash, credential, receipt or payload. No opener, migration, transaction,
recovery, reconciliation, transport, write or deletion is invoked. Missing schema/read
errors propagate; they never become zero. No Schema, existing Repository, Auth or
canonical contracts change. The requesting Native Lane composes the port; this package
does not add a UI/diagnostic runner or borrow another database/session.

## Meaning and limits

- Actual schema: `tripCoreV2Migration` id54, `tripCoreV2.ts:725-738`. There are six states:
  PENDING, IN_FLIGHT, APPLIED, CONFLICT, REVIEW, BLOCKED. `reconciled_revision` may be
  NULL or an integer; values are observed without deriving a new lifecycle.
- The existing Core repository inserts BLOCKED (`tripCoreV2Repository.ts:652`) and
  marks original dispatch IN_FLIGHT (`1398-1400`). UNKNOWN is not an intent-table state.
  An IN_FLIGHT count does not determine whether the server committed or a retry is safe.
- Receipt installation maps outcomes into REVIEW/CONFLICT/APPLIED (`1950-1957`).
  APPLIED with NULL revision remains observable; it is not erased as completed.
- Existing qualified Core collection installation marks receipt-covered intents with
  a reconciled revision (`1902`); census never calls this mutation or validates receipt.
- No Queue/receipt/scope JOIN: an orphan/retained record counts. This port cannot classify
  an orphan because doing so would require additional authority/data; it cannot infer
  unfinished status from only APPLIED or a non-NULL revision.
- `total: 0` is only an observation of this table across all local Account namespaces at that statement.
  It is not NoCommit, global emptiness, Cloud truth, Guest adoption clearance or permission
  to delete, migrate, recover or reset anything. Other databases/tables remain unobserved.

## Verification

Five real in-memory SQLite tests execute existing canonical migrations, all six states
crossed with NULL/0/7 revisions, duplicate IN_FLIGHT/APPLIED observations, Queue/receipt
orphans, multiple Trips and Accounts, missing schema and closed-connection errors.
`PRAGMA query_only=ON` and unchanged `total_changes()` verify read-only operation. The
fixture command body is deliberately not interpretable and is never read/parsed.
SQL/output shape assertions exclude identity/payload fields. Each group count and the total must be safe integers; malformed counts/overflow throw, never return zero. Scoped types/lint pass.
No device, Hosted, Provider or actual business/UNKNOWN operation is executed. Independent
Review and main integration remain separate and pending.

## Scope clarification delta

The unpublished `3a5f15ed` Account-filtered API is superseded, with no compatibility
variant retained. Native clarified that pre-OTP may have no Account; filtering by a
current Account would hide retained/orphan namespaces. The corrected port has no
WHERE filter or bound parameters and cannot silently substitute an empty Account.
Tests now demonstrate combined counts from two Accounts/multiple Trips and isolation
from another held connection. Four scenarios use actual SQLite; the fifth injects
invalid aggregate numbers to verify explicit failure. Prior scoped source/evidence
remain in Git history and `LOCAL_VALIDATION.json`; current evidence is
`ALL_NAMESPACE_VALIDATION.json`. Independent Review must cover this exact delta.
