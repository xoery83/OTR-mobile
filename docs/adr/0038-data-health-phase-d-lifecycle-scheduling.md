# ADR 0038: Data Health Phase D schedules the existing pipeline

Status: Implemented; awaiting Phase D acceptance (2026-09-24)

Phase D adds one process-local coordinator gate around the existing Data Health
coordinator. Cold start, foreground, connectivity recovery, authentication recovery,
normal sync completion, and a 15-minute active-App timer submit signals to that gate.
Only one account/generation run is effective at a time; duplicate signals coalesce into
the current run or one pending follow-up. Account generation still invalidates every
mutation and network boundary.

An indexed active-account probe selects only suspicious Journey scopes. Healthy cold
start records a cheap check and stops without sync, pull, or bootstrap. Foreground cheap
checks are limited to once per 15 minutes unless the indexed probe finds work that is
already due for convergence; protected or future-sparse work does not bypass the window.
Deep local review is limited to once per 24 hours and to the selected/recent or suspicious
Journeys; manual health remains the only broad active-account run. Connectivity convergence
has a separate in-process cooldown so network flapping cannot repeatedly reconsider sparse
retry state.

Normal operational sync records the eligible Journey scopes present when the run starts
and publishes one completion signal. Health-origin sync is marked explicitly and does
not publish a recursive trigger. Normal completion performs only scoped reconciliation
and verification; it does not start another mutation sync. The existing eight-second
visible Ledger poll remains independent.

Phase D adds no migration, repair action, worker, queue, Backend endpoint, background
execution promise, historical `FAILED` recovery, or destructive control. Automatic
cheap runs do not reactivate future sparse retries; only the daily deep window or manual
health may reconsider them under the existing C0/C1 policy. Protected historical intent,
including `guard 915`, remains scan-only and cannot cause replay or a recovered outcome.
