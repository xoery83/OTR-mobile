# Durable Guest semantic source

Adoption recovery must not reopen the source SQLite database after publication was
requested. Extend the existing immutable recovery journal with version 3, requiring
the frozen Trip/P1 source's canonical JSON, hash and byte count. Keep versions 1/2
readable without synthesizing a source or upgrading their publication readiness.

Validate the source using existing owning contracts, explicit Guest/Trip bindings,
canonical hashes and supported local P1 operations before every journal write or
read. Retain source timestamps, Ledger initialization and original identities.
Do not create another repository, queue, file store or Session authority.

This is local recovery material, not server authorization. Publication markers
still require authoritative status, and the original Guest database stays locked.
No publisher, Native activation, SQL permission or DEV deployment is introduced.

The handoff assembler consumes the actual frozen inventory and constructs v3
without caller-supplied source/draft/hash fields. Pin adoption/target IDs before
awaiting, check the original inventory lease around opening/writing recovery, and
return only after readback. Failure never auto-releases a possibly protected
source or installs a target Session; existing cancellation/status handling owns it.
The matching preflight DTO derives resource facts from that same frozen source,
registered-file qualification and retained drafts; callers do not supply counts.
These observed facts are not an entitlement policy, quota reservation or grant.
