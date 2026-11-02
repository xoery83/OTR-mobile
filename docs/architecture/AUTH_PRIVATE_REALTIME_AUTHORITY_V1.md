# Private Realtime Authority V1 — isolated/default-closed candidate

Golden Slice: a normally authenticated Account opens a private Trip signal channel;
canonical membership is revoked in a committed transaction; old-generation lease
checks, data reads and rejoin are denied; an authorized canonical regrant advances
the connection generation and requires fresh admission. No ordinary Beta Leave,
expulsion, role policy or identity rule is invented by this infrastructure.

## Three distinct authorities

1. **Subscription admission:** existing Supabase normal `getUser` plus the same
   Session recheck, canonical current Core Actor/Person/Trip and server-owned
   connection generation qualify a private join. `createTripPrivateRealtimeAdmission`
   retains strict Trip/localGeneration input, rejects resource/Guest/unknown and
   mismatched/nil/expired leases, closes cancelled/late joins, and never returns
   the Bearer. `localGeneration` is only device scope, not membership authority.
2. **Data read:** a joined channel is not data permission. Every `readItem` uses a
   new normal Session and held Core authority transaction, obtains the current
   canonical Actor plus connection generation, then uses the existing Core owning
   visibility projector. Membership alone cannot expose another creator's private
   Item. Session/binding checks repeat after IO; null/404 is NOT a revoke receipt.
   Hints must be Actor-visible through the current Core projection qualification;
   Trip membership alone must not broadcast Item IDs or private activity. Signals
   contain no Item body, document, ledger or private profile data.
3. **Revocation/regrant:** only an immutable owning canonical membership transition
   receipt can advance/attest connection generations. `reconcileTransition` reads
   the original operation receipt; it does not perform a membership mutation or
   create another receipt. SQL/current-generation rejection is distinct from real
   connected-transport forced disconnect. Missing disconnect evidence returns
   enforcement UNCONFIRMED alongside receiptState COMMITTED and the unchanged
   authoritative receipt, so Native can immediately cache-deny without a Core
   tuple conversion. Transport exceptions/cancellation never erase a known commit
   or manufacture strong-revoke proof. TTL, retry exhaustion, a boolean or a socket
   close request is insufficient. Regrant must use a strictly newer generation.

## Exact implementation seam

`tripPrivateRealtimeAuthority.ts` composes the already reviewed admission guard,
strict existing Lease DTO and mandatory `TripPrivateRealtimeAuthorityPort.atomic`.
No port means closed before Auth or SQL IO. Its transaction supplies current normal
Session, canonical binding, a held-transaction Core qualification, owning Item
projection, join and immutable transition lookup. Lease authorizationRevision must
match the server membershipGeneration; neither is taken from a request, Core
content counter, timestamp or an in-process map.

`tripPrivateRealtimeAuthorityPg.ts` implements persistent generation/receipt reads
through an injected Core-owned held transaction, not its own BEGIN/COMMIT. Its
`RealtimeCoreAtomicPort.withScope` must hold the canonical membership/Actor locks
across checks/read/join. Standalone bace5af8 `observe()` starts its own transaction
and MUST NOT be nested or treated as atomic proof. Core supplies a held equivalent.
The existing `withCorePgStorageTransaction` composition seam and canonical DML hooks
are owned by the unique Core Writer; this candidate does not edit them.

Canonical membership and roles remain the sole business permission source. The
minimal sidecar has only `(account_id,trip_id,generation)` connection liveness and
immutable transition receipts. It stores no active/role/Owner/visibility grants,
creates no second user database and cannot authorize a disconnected Person.
Absent or invalid generation fails closed; the adapter never initializes or
increments generation merely because a read or join succeeded.

The membership Writer must, in the same real database transaction: lock canonical
scope and sidecar; enforce the existing authorized membership operation; mutate
canonical membership; advance the persistent generation once; append an immutable
exact operation receipt and required post-commit disconnect material; COMMIT.
Receipt insertion failure rolls everything back. A duplicate operation reuses its
receipt; changed intent, unknown COMMIT or rollback cannot advance via a new ID.
The current participant toggles or unclaimed-invite revoke are not membership loss.

## Server transport and lifetime

Transport `open` receives the current binding, separate Core reference, exact
server-verified `sessionId` and a fresh `assertCurrent` function. Its source is the
mandatory held `currentSession()` check of the exact normal Bearer/current Session,
not an unverified JWT claim, nonexpired timestamp or getUser Account existence.
`assertCurrent` refuses delivery before acknowledged admission COMMIT, then opens
a fresh authority scope; it never nests standalone observe() during open. Actual transport must recheck the same current Session/canonical
Actor/generation before permitted Actor-visible delivery and reject old generations forever,
including after regrant. Expiry/cancellation close the handle; a client/server
lifecycle timer is defense in depth, never membership policy or forced revocation.
Account logout/switch aborts old handles. Logout/Session revocation is distinct
from membership revoke: only handles of that exact Session may be invalidated,
not every normal Session of the Account. The actual transport must honor that
formal Session event/current-state source; no all-Account logout is introduced. The server-side future-lease callback also checks the exact returned lease expiry
before and after asynchronous current-state IO, independently of timer execution.
No default TTL or provider is invented.

`enforceCommittedTransition` re-reads the exact committed receipt before delegating
to transport enforcement. Without a real enforcement port, the PG adapter returns
UNCONFIRMED even if SQL access denial has passed. No automatic reconnect/retry or
publisher is introduced. Core post-commit publisher/transport remains independently
owned; failed/rolled-back mutations must not publish accepted change signals.

## Native cache mapping and evidence limits

Auth membershipGeneration/authorizationRevision, localGeneration and the Core
`(coreEpoch,coreAccessRevision)` tuple are separate. Core observation is explicitly
NOT_A_PRIVATE_JOIN_LEASE. Missing sealed Core-tuple association is NOT_READY for
that association only; no arithmetic conversion or Auth integer is fed to Native
Core revoke. It does NOT delay an authoritative Auth cache-deny: the shared
`tripRealtimeRevocationFromTransition` maps a trusted COMMITTED, REVOKED receipt
for the exact Account/Trip to the existing Auth revoke DTO even when transport
enforcement is UNCONFIRMED. It never maps a timeout, 404, expiry, disconnect or
REGRANTED receipt into a denial. Parsing by itself is not proof of server COMMIT.
Native keeps hint→existing Downstream Pull. Its owning cache visibility fence must
withhold private access before visibility can resume; retain Pending/UNKNOWN/drafts
and historical receipts, never purge them on generic errors. Regrant requires a
newly qualified coherent collection, not merely a successful join or bare receipt.

Local injected-port tests prove composition/guards, not a production permission
producer. The separate network-none PG fixture proves only its actual committed
canonical mutation + liveness/receipt/read denial behavior. It must label held Core
qualification/projection fixture seams and any transport mock. No actual connected
private-channel forced-disconnect, Hosted RLS/GRANT, Native revocation E2E, real
Session mutation or publisher activation is claimed. All candidate paths remain
unmounted; no Host/OAuth/Session/shared SQL/Bootstrap/Native files are changed here.

## Exact Session reader candidate

`preparePrivateRealtimeSession(gateway, scope)` verifies the same normal bearer
through the existing Supabase gateway before Core begins its transaction. Decoded
claims only bind the verified Account to its Session ID and access-token expiry;
they never authenticate a token. The returned `currentSession(heldLease)` uses the
existing held transaction, with no checkout, BEGIN or network authentication.

The separate candidate `otr_private_realtime_current_session(session, trip)` reads
the exact `auth.sessions` row and normal, enabled Auth user under shared row locks.
It checks the held Core actor/Trip and Session expiry; absence or revocation denies
only that Session. Session expiry is rechecked after lock acquisition with a fresh
database clock; an unchanged row does not make an expired Session current again.
It neither stores another Session nor grants Trip membership.
Its single EXECUTE for the existing Core gateway requires a new exact protected
Gate before installation. No function is installed or route mounted here.

This is a current-state reader, not an invalidation publisher or network transport.
Actual Session invalidation signals and forced disconnect remain separate gaps.
