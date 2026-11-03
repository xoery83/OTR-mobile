# C04 Claim → Core read-state repair

Actual Hosted failure: original Claim `4028b673…`, RPC `link`, SQLSTATE `42501`.
The enabled Core guard rejects the postgres/Core-gateway membership invalidator's
revision/access-revision update outside the Guest composite path. Exact preimage
comes from Root2 `5130c845`; unchanged Claim body matches approved install `3bbe7fbf…`.

Auth's existing link port now carries the validated original operation and digest.
SQL rechecks the same `otr-member-claim-v1` encoding, writes server-only xid8/PID/op
proof into the existing private directed row, links the Person, clears proof, and
consumes the existing invitation in the same transaction. A postgres-only helper
lets Core validate that exact transition. The old Guest/Core guard branches remain
byte-identical after removing the single new Claim branch.

Rebuild the frozen SQL with `python3 build_candidate.py CORE_GUARD_PREIMAGE.sql`
from this directory. Both source fingerprints are pinned. `INSTALL_CANDIDATE.sql`
and `ROLLBACK_CANDIDATE.sql` require explicit project/approval markers and exact
function/ACL preimages. Neither is an execution script or current authorization.

Run only the new local regression using
`python3 scripts/auth/member-claim-read-state-isolated-pg.py` from the repository.
It owns one fixed-image, network-none 256 MiB fixture and removes it. Unrelated
Guest/Core/Source capability fixtures deny; positive admission uses this candidate.
The stable historical PG case is skipped. See `VALIDATION.json` for actual results.

Root1 owns final Core review/main integration; Root2 owns protected installation,
fresh CAS and independent readback. Runtime stays closed. The consumed `03e24`
window and original UNKNOWN cannot be reused. Hosted revalidation needs its own
current exact scope; this candidate does not extend the expired invitation.
