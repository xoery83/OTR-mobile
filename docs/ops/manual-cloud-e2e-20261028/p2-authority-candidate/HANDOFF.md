# Defensive P2 Create fence — private dormant candidate

Status: NOT APPROVED / NOT INSTALLED. The old 379c3f1d packet remains BLOCKED and immutable. This new packet changes only its P2 Manual Create guard; the complete packet still replaces five existing functions with exact eleven-function OID/owner/ACL/MD5 CAS. Fresh live preflight and separate approval remain required.

## Fix

For MANUAL P2 CREATE_SPARSE_FLIGHT, every guarded write is INSERT-only and restricted to initial root, flight-intent, participation, visibility and receipt tables. Root must be initial revision1/CALENDAR. Initial child/receipt insertion requires the matching actor/trip/target P2 revision1 root newly inserted in the same database transaction (`xmin` equals the current transaction ID modulo PostgreSQL's 32-bit XID). An earlier accepted Create receipt for the target prevents reuse. Existing objects cannot become fresh via UPDATE because this command rejects every UPDATE. Existing Core PgPort uses one normal transaction per command; no new schema or durable marker is introduced.

Initial receipt binds the current operation, actor/trip/target, MANUAL Sparse Create canonical intent and its hash, null initial revision, APPLIED outcome, created target and revision1 vector. Receipt-first immutable replay remains the existing path and does not re-run inserts.

The prior non-Create P2 proof/Sparse/Creator/noBooking/zeroService restrictions remain. Source early branch, old fallback/legacy branch, Qualified aggregate branch, P1/P3–P6 abilities and all ten other postimage functions are unchanged relative to the blocked packet. No new authority, role, schema, RLS, GRANT or CHECK is introduced by this repair.

## Actual isolated validation

The existing private Backend PgPort is reused unchanged. Unique owned Docker PG with --network none passed normal Sparse Create, exact receipt replay, authored Details/Edit, participation, full independent Reader preserving unresolved clocks, selected-participant and visibility initial child inserts/readback/replay, existing endpoint/role/context/UTC/family rejection checks, and fixed known-existing root/intent updates and initial-child/receipt reuse denial. No general attack tool, real-environment negative, model/provider/Auth service, device or DEV was used.

Atomic re-install rejects drift. Exact rollback restores all eleven function definitions/OIDs/owners/ACLs and preserves all existing Item facts. `isolated-atomic.log` contains the receipt. This repair did not synthesize a positive Source acceptance; unchanged Source semantics are additionally checked byte-for-byte.

## Rollback

Use install.full.rollback.sql only when all eleven exact postimages still match; it restores the pre-P2 P1/P3/P4/P5/P6 baseline, leaves tables/data/Source facts untouched and closes future P2 Manual writes. The guard uses current-transaction insertion identity, matching the current one-command-per-transaction PgPort; a future transaction/savepoint redesign must rerun this fixture.

No Native/DEV/Cloud L3 PASS is claimed. Parent must independently review and serialize deployment only after protected P2 approval.
