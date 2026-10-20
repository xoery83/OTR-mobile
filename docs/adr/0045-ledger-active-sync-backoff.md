# ADR 0045: Foreground Ledger sync backoff

Date: 2026-09-26
Status: Implemented locally for Performance Guardrails Phase 1B

Visible, online Ledger sync schedules its next run only after the current run
finishes. Successful empty cycles wait 8, 15, 30, then 60 seconds; a remote
change, nonempty local queue, focus, foreground return, reconnect, or local
mutation restores the 8-second cadence. Failures wait 15, 30, then 60 seconds.
Account and Journey context changes invalidate old results and timers.
Concurrent Journey pulls are keyed by account generation as well as Journey.

Standalone Settlement uses the same scheduler for Personal Payment pulls.
Settlement embedded in Ledger uses its parent's Journey pull and reloads local
Personal Payments after a changed result. The independent 8-second Settlement
timer is removed. Operational mutation kicks wake the active scheduler without
changing queue status, retry, conflict, or offline rules. A swallowed partial
Personal Payment or Review pull failure does not count as an idle success.

Phase 1B.1 clarifies two stable states. In an ordinary background Ledger pull,
only GET Review's exact `409 SETTLEMENT_REVIEW_BLOCKED` means Review is currently
unavailable; it leaves the saved Review untouched and does not make the Ledger
read incomplete. Explicit Review pages and every other error retain their
existing behavior. Unresolved queue totals still include FAILED and CONFLICT
for the UI, while read cadence uses only work executable now. A separate
account-scoped operational timer wakes future RETRYABLE work at its due time
and recovers expired processing leases; dependency completion signals the
worker. Foreground reads no longer drive operational retries.

Cycle logs, including signed Release, contain only cycle counts, cadence and
reset reasons, queue/Review classification, and the number of pull API calls
that can be counted locally.
Operational push calls are not included in that request count. No schema, RPC,
backend deployment, or business-rule change is part of this decision.
