# ADR 0037: Data Health Phase C2 reuses normal convergence

Status: Implemented; awaiting Phase C2 acceptance (2026-09-24)

Phase C2 extends the existing `DataHealthCoordinator` after C1 repair. It rebuilds the
active-account protected-intent manifest before each network phase, requests the existing
operational sync only when runnable queue work exists, then performs incremental refresh
for affected Journeys plus at most the highest-priority active/recent Journey. Account
generation, auth pause, isolation, normal due time, conflict, and provider policy remain
owned by existing coordinators.

Ledger keeps its existing scoped `INVALID_CURSOR` bootstrap. Personal Payment now applies
the same structured invalid-cursor recovery through its existing scoped list/change path;
pending local records remain overlaid. Bootstrap application, deferred Expense drain, and
pending Review protection remain repository transactions rather than Health mutations.

Health reports recovery only after the post-pull rescan removes the relevant queue and
protected-intent findings. Queue metadata repaired but not synchronized is reported as
waiting. C2 adds no migration, executable repair action, worker, queue, Backend endpoint,
scheduler, cache purge, destructive reset, or historical `FAILED` recovery.
