# ADR 0033: Data Health Phase A uses the existing causal sync queue

Status: Accepted (2026-09-24)

Unknown and unclassified user mutations remain retryable indefinitely. Normal
exponential retry transitions to sparse long-lived attempts; recovery, app upgrade, and
future manual/deep health triggers may clear the due time without changing the operation
identity. Only allow-listed structured business codes become terminal/actionable.

`sync_operations` and `ledger_asset_operations` retain separate safe failure category,
code, bounded redacted message, request id, attempt timestamps, and optional dependency.
No second worker, queue, health table, scanner, or scheduler is introduced in Phase A.

Expense edits coalesce into an unattempted CREATE. After any CREATE attempt, its durable
payload and idempotency key are immutable; later edits compact into one dependent UPDATE.
Dependent mutations are blocked without a request or attempt until CREATE completion
wakes them. Entity status follows the classified live operation, and a converged pull
drains deferred Expense server changes. UUID, revision, account/Journey isolation,
offline durability, Personal Payment behavior, and canonical Settlement are unchanged.

Historical generic `FAILED` operations are not reclassified by migration. Health
persistence/retention, scoped scans/scheduling, automatic repair, and `guard 915` remain
the separately gated Phases B–E.
