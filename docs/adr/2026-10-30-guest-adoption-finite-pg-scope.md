# Guest Adoption finite PG scope candidate

Status: candidate, unmounted; disposable PG only. No Hosted execution approval.

Approved AUTH-02 requires all saved Guest data to publish atomically after normal
Account verification, explicit existing-target confirmation and server preflight.
The existing Trip/Metadata/Person/Core ports cannot use their different session
principals on one transaction.

Prepare a narrowly scoped branch for the existing Core Gateway, using an immutable
server grant/stage and a private backend-PID/transaction binding. No new role or
business-table RLS/write grant is proposed. Active adoption scopes suppress normal
permission fallback. Existing owning services, Actor/Creator/CAS/receipt validation
and held transaction ports remain authoritative for their operations.

The private policy defaults off. A server-generated15minute operational lease is
idempotent; it defines no price, allowance or commercial threshold. Current Account
revocation is respected. The explicit confirmation API/Native action, authoritative
terminal receipts, local restore and actual Hosted preimage/ACL review remain
required before runtime integration and the precise Owner execution Gate.

See `docs/ops/auth-phase1-20261028/composite-publication-candidate/` for exact local
candidate functions, synthetic real-PG evidence and explicit limitations. The
internal authority-NONE executor result cannot release Guest originals.

The next disposable-only candidate adds the immutable terminal journal first for
cancellation and read recovery. Grant issuance, staging, execution and cancellation
serialize on the same adoption advisory lock before row locks. Cancellation must
refuse any already-created source Trip or active held execution scope. Existing
committed outcomes can be read after the operational grant expires or Adoption is
turned off, using the same normal/current Account binding. This preserves UNKNOWN
recovery without granting new publication authority. Publication remains closed
until its complete owning receipt and readback validation is implemented.

The publication candidate reconstructs its receipt inside the owning transaction
from the sealed original dataset and actual immutable owning operation rows. It
accepts no client execution result or caller-selected receipt ID/time. The same
Adoption advisory lock serializes publication, cancellation and exact retry.
Existing PUBLISHED outcomes remain readable after grant expiry/policy closure;
first publication still requires the current finite scope and normal Account.
The Backend validates the reconstructed receipt against the retained source and
actual terminal status before the outer COMMIT. Any failure rolls back business
rows and final receipt together; commit uncertainty keeps the original identity.

Core operation digests retain the owning Core receipt digest. Other owning
operation and Ledger digests are SHA256 over exact UTF8 PostgreSQL jsonb text
of the versioned projections described in publication.local.sql. This supports
Unicode/fractional source fields without altering the older integer-only SQL
canonicalizer. The final receipt contains only identifiers/digests and uses the
existing canonical receipt codec. Its executionSha256 binds the complete owning
Trip summaries in that same PG-jsonb format; it is not the authority-NONE executor
component digest. Owning readback must verify these preimages before local restore.
No digest alone releases a Guest hold. All SQL remains disposable-only pending
full exact protected review and a separate Hosted execution Gate.

Publication does not disable the finite scope before COMMIT: the existing owning
Metadata deferred guard must still validate that same PID/xid and live grant at
COMMIT. We do not force constraints early or bypass that guard. Finalization
blocks further Trip/Metadata/Person mutation entry. All sealed Core operations
already have immutable receipts; existing Core idempotency rejects changed intent
and unsealed IDs remain forbidden. The publisher exposes no held context, and
only performs terminal read/coverage qualification after the final insert.

A real raw-Writer negative reproduced a post-final DML gap despite completed
operation receipts. The disposable exact-preimage renderer now proposes one
additional write-only guard branch: mutation_allowed checks the private PID/xid
scope's terminal record before any Core business row change, including legacy
early returns. The original row guard body, owner and ACL remain unchanged.
Only the existing Writer can execute this narrow predicate; there is no table
grant or new role. Deferred owning COMMIT checks still use the unmodified live
scope predicate. This is a protected candidate requiring Core Owner review and
exact current Hosted preimages before any execution request.
