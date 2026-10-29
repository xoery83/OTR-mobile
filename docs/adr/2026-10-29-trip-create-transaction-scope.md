# TripCreate on a caller-held transaction — private extraction candidate

Native delegated only TripCreate PgStorage transaction/DI and direct tests. Its
frozen c40c8efc TripCreate files match this Auth baseline c347ade1. No SQL, principal,
Actor, finite-scope, result/receipt semantics, Native Form or Core edits are allowed.

Factor the existing owning query and result pins once. The normal factory keeps
its existing lease/BEGIN/COMMIT/ROLLBACK behavior. An internal callback port uses
an already running caller-held lease without beginning or committing another
transaction. It fences methods/queries to the callback, observes caught failures
and pending work, rejects overlaps and retires the supplied lease on failure so
an outer callback cannot swallow an error and commit partially written Trips.

Only a trusted owning transaction supplies that lease. No default Bootstrap/HTTP
caller is wired. TripCreate SQL still requires its existing session_user; Core's
Gateway is different. This interface alone does not authorize composing them or
publish any Guest data. Actual atomic publication requires a separately reviewed
protected candidate and exact applicable Owner Gate; keep it closed.

## Stable Auth replay

Native delegated these exact transaction/DI ports to Auth as unique Writer on
2026-10-29. Replay starts at accepted main dd53870c; all selected parent files
are byte-identical. Only these files and direct tests are replayed, never the old
Native parent branch. SQL/role/Authority/DEV publication remain closed.
