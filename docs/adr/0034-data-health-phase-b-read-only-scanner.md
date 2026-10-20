# ADR 0034: Data Health Phase B is a read-only account-scoped scanner

Status: Accepted for Phase B implementation (2026-09-24)

Phase B adds one `DataHealthCoordinator` over a small explicit rule registry. At run
start it captures active account identity and in-process account generation, then builds
a transactionally consistent in-memory manifest from account/Journey-scoped SQLite
queries. A generation or account change invalidates the result.

The scanner may write only `data_health_state` throttle/run/aggregate metadata. It does
not mutate domain rows, operation metadata/status, cursors, caches, files, or canonical
Settlement; it does not call sync, pull, bootstrap, a provider, or Backend recovery.
`data_health_repair_events` is created for approved Phase C compatibility but receives no
Phase B events. Old verified operational diagnostics may later be retained on a bounded
basis; unresolved/`NEEDS_ATTENTION` evidence remains available.

Findings store no private payload. Reports contain stable rule IDs, safe target IDs,
categories, counts, and deterministic digests. Normal Settings maps them to one of three
plain outcomes; Debug Mode may show redacted rule IDs. Scope-priority and 15-minute
throttle APIs are foundations only—automatic scheduling remains Phase D.
