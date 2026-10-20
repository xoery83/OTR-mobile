# 0054 — Settlement review and explicit acceptance of cached rates

Date: 2026-09-28. Status: owner approved.

Member review is an acknowledgement, independent of final settlement readiness.
The backend builds review statements from accepted inputs plus a deterministic
unresolved personal-source snapshot; unresolved FX/conflicts do not reject review.
Changes to that snapshot invalidate earlier Looks good. Accepted-only subtotals
must be labelled as such where a statement contains unresolved inputs. No review
checkpoint grants financial acceptance or bypasses finalization checks.

Remove the duplicate Updated since you reviewed Summary card. Keep Changes since
last confirmation and explicit feedback for pending/rejected review submissions.

Confirmation surfaces list eligible cached non-transaction-date rates, dates,
original amounts and equivalents. A separate explicit accept action stores each
shown rate through the existing MANUAL_AGREED repository/queue path, with its
reference date and ECB provenance in the reason. Recheck account, expense revision,
Journey currency and shown amount; never derive a rate by dividing rounded money.
After sync, obtain a fresh server preview before final confirmation. Failed/partial
sync is visible and retryable; accepted values remain local and durable. No schema
change, new financial policy, or automatic replacement of accepted rates.

Network diagnostics use platform connectivity; failed sync is SYNC_FAILED, not
Offline. API failure diagnostics record only method, normalized route, kind, code,
status, request ID and time, never auth tokens, payloads or receipt text.

Follow-up correctness fix: the internal personal financial-source RPC serializes
valuation decimal rates as strings. PostgreSQL numeric rates can exceed JavaScript
precision; numeric JSON transport falsely rejects unchanged review checkpoints.
A forward function-only migration retains exact comparison, permissions and
financial-change rejection; it changes no stored rates or user checkpoints.

## Expense consistency extension (ADR 0056)

Batch acceptance must report each command by operationId and receipt-backed
state. Completing an operational sync cycle never confirms a valuation.
