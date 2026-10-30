# Formal revocation — precise owning gap

Status: **BLOCKED for REAL DEV acceptance**, not inferred from the successful
private-Trip denial or Account-switch tests.

The existing HTTP boundary checks `canReadTrip` and returns `404 NOT_VISIBLE`.
`tripCoreV2PgRead.snapshot` checks the finite scope, then rejects an inactive
`lockCorePgActor` with the same unavailable outcome. Neither response supplies an
authoritative access revision or distinguishes a previously revoked membership
from an unknown/inaccessible Trip. A network failure or omitted discovery row is
also insufficient. Native therefore preserves the last lawful cache/input;
it does not manufacture a revocation, access revision or irreversible deletion.

The existing Native `tripCoreV2Repository.revoke(context, accessRevision)` already
withholds reads, blocks unfinished Core operations and retains their bytes.
Its deterministic tests are reusable, but are not a real server revocation test.
The existing refresh entry also rejects a revoked scope: restoring membership
will need an explicitly qualified owning reauthorization path, not a local flag
reset or a stale discovery result.

Minimum requested Core/Auth contract: an authenticated, Actor/Trip-bound read
qualification that can confirm an actual terminal access loss with a monotonic
access revision, and qualify a fresh complete authorized collection after access
is restored. Unknown IDs and ordinary 404/503 remain unconfirmed. The Core Writer
must identify an existing approved membership transition/read port, or provide
that smallest difference and its exact authorization needs. Native does not
change roster/RLS/Schema or use Import scopes to manufacture a test transition.

Coordinated with the unique Core/Import Writer. Continue type coverage, existing
Import readback and main integration while this protected interface is unresolved.
Do not report full revocation safety or complete Beta delivery as PASS.
