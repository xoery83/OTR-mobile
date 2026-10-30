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
