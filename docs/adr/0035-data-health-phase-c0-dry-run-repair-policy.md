# ADR 0035: Data Health Phase C0 plans repairs without executing them

Status: Accepted (2026-09-24)

Phase C0 adds one pure, deterministic policy layer between Phase B findings and any
future repair execution. A plan binds the finding digest to the active account,
account generation, optional Journey, explicit disposition, evidence requirement,
versioned action identity, and verifier identity. Callers must not infer eligibility
from a finding category.

`PROTECTED_LOCAL` is a hard repair veto. Historical `FAILED` operations, ambiguous
ownership or permission, and isolation violations cannot produce executable actions.
Only an expired processing lease, an explicitly completed dependency, or an existing
long-lived `RETRYABLE` operation may be planned as future `AUTO_SAFE` work when all
required local evidence is present.

Phase C0 performs no repair, retry, requeue, pull, bootstrap, download, cursor change,
remote call, or repair-event write. It adds no migration, Backend endpoint, scheduler,
or UI action. Account-generation changes invalidate a plan, including A → B → A.
