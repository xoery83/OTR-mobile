# Core TTR coherent envelope and guarded handoff /1

CP04B2B-CORE-PORT-02. CLOSED additive implementation, Owner Review pending.
Existing `otr-core-ttr-input/1`, read2 and SQLite57 remain unchanged in version/schema.

## Capture and transaction-local checks

`repository.readTtr(ctx, orderId, fromId, toId)` now returns `CoreTtrReadResult`:
existing finite UNAVAILABLE or QUALIFIED with required transient `authority`.
Scope/access exceptions on this pre-existing capture API remain its established
exceptions. No scope mismatch becomes a fabricated qualified relation.

The coherent authority vector contains Account/Trip/generation, raw Person/branch,
order id/revision, accepted collection epoch/revision/hash/access/binding/roster/
applied-generation facts, current local refresh generation, A/B UUID/token/role,
Item semantic and location-input revisions, accepted NONE_PROVEN coverage and
B ENTRY date/IANA expiry. These facts come from one transaction and accepted
snapshot. Endpoint revision is a composite dependency, not a new counter. The
opaque authorityKey remains its existing capture pin, not a global revision.
Unavailable gaps/hidden Persons/legs are never exposed through metadata.

`ttrWithinTransaction` exposes the same enriched result without gate/transaction
acquisition. `revalidateTtrWithinTransaction` remains compatible with old raw
qualified captures and additionally compares metadata when present. Caller must
own the Account gate and identical serialized SQLite connection/transaction.
Neither helper calls public acceptedSnapshot/readTtr recursively. All dependencies
must be local; no remote I/O inside a transaction or publication callback.

## After durable selection commit

After the TTR selection operation has committed **and released its Account gate**:

`guardTtrPublication(ctx, orderId, fromId, toId, captured, handoff)`

The Core operation owns a fresh Account gate/read transaction. It requalifies the
current installed accepted mirror, verifies the complete raw capture/vector, and
returns CURRENT, STALE (AUTHORITY_CHANGED/REFRESH_PENDING), or finite UNAVAILABLE.
Known access/context errors become UNAVAILABLE; unexpected database/integrity/hash
faults still throw. Core never reads, edits or deletes TTR selection rows.

When current, Core invokes `handoff(lease)` synchronously through the existing
Account gate's afterRelease hook, before queued gated writers can run. Return
`undefined`; no async callback, network call, nested gate or SQL transaction in
the handoff. CURRENT confirms a current Core handoff, not G2 publication success.

The ephemeral `CoreTtrPublicationLease` contains a copied qualified envelope,
`isCurrent()` and `ifCurrent(() => { /* synchronous emission */ })`. Every delayed
TTR/G2 emission must use `ifCurrent`; it returns false after invalidation. Returning
a Promise/non-undefined value is rejected as contract misuse; this is a trusted
synchronous callback protocol, not a sandbox for arbitrary asynchronous code.

Leases share opaque in-memory tokens by Account/Trip and identical initialized
serialized DB connection. Core beginRefresh/install/revoke invalidate tokens
before mutation; Account generation/transition fencing is also checked. Tokens
are not persisted, serialized, exposed as revisions, or valid across process/DB
connection lifetimes. Consumers discard leases on teardown. All accepted mirror
writes must use the existing Core repository gate/connection. Separate wrappers
or connections/direct SQL mutations cannot share this guarantee.

## Refresh, offline and independent pairs

Capture still reads the last accepted offline mirror. The publication guard
requires applied_generation to equal the current started refresh generation:
an unresolved/failed started refresh yields REFRESH_PENDING until a successful
accepted installation. This conservative guard does not discard offline Core
facts, erase modes or change existing reads. Consumer integration must treat this
as withheld publication, not failed selection durability.

A collection replacement conservatively invalidates capture/lease pins across the
scope; fresh C→D can remain qualified after a B edit. Requalify unchanged pairs
against the new snapshot instead of permanently suppressing them. Branch/order/
Person/access changes may have wider dependency effects. Existing one-visit and
private intermediate rules are unchanged.

## Ownership and spatial contract

Core retains spatial equivalence UNKNOWN alongside accepted operative coordinates,
including equal coordinates/0m. It never computes a distance threshold or assigns
SAME_LOCATION/mode. Transport arrival→next entry roles and expiry remain intact.
TTR-owned accepted spatial correction `841ff819bb73d0809fdeb7715f41dfda54d26d56`
is a separate consumer input, not merged by this checkpoint.

TTR owns raw capture retention, personal selection, deterministic presentation
mapping and lease-aware emission. G2 owns final actionability/insertion/queued
intent checks, NOW/Focus/scroll. They must integrate current-source invalidation and
check the lease at deferred presentation consumption; Core cannot authorize a
later React render or bypass G2 eligibility. No Controller, selection schema,
Composer, production consumer, new writer/Sync engine or runtime factory is added.
