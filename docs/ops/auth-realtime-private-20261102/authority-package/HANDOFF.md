# Private Realtime Authority V1 delivery

Status: **READY_FOR_INTEGRATION — local Authority/PG candidate only**.
Hosted qualification and actual private-channel forced disconnect are not passed.

Golden Slice: normal Account A joins its Trip; unrelated B is denied. An existing
canonical membership transition commits together with a persistent connection
generation and immutable receipt. Old leases, rejoin and protected reads are denied.
Canonical regrant advances the generation; the old lease never becomes current.

## Callable contract

- `createTripPrivateRealtimeAuthority({gateway, port})`: `subscribe`, `readItem`,
  `reconcileTransition`. Missing atomic port is closed. No route is mounted.
- `createTripPrivateRealtimePgAuthorityPort({core, transport})`: consumes a Core-owned
  held transaction, current Session, canonical Actor and existing visibility reader.
  It does not start a second transaction or implement membership permissions.
- Native imports only `src/domain/auth/tripRealtimeAuthorization.ts`:
  `tripRealtimeMembershipTransitionSchema`, `tripRealtimeCommittedTransitionSchema`,
  and `tripRealtimeRevocationFromTransition(raw, expectedAccountTrip)`.
- A committed `REVOKED` receipt immediately maps to the existing Auth cache-deny DTO.
  `enforcement: UNCONFIRMED` does not discard that receipt or claim network closure.
  Expiry, disconnect, 404, missing receipt and `REGRANTED` do not produce a cache revoke.
- Session ID remains server-only. Local generation, Auth authorization generation,
  and Core epoch/access revision are separate. No revision conversion is provided.

Core Publisher must qualify the current Actor-visible projection and the exact
current lease before sending a private hint. No Item body or private activity is
broadcast merely because an Account is a Trip member. Native keeps its existing
hint-to-Downstream pipeline; this package creates no publisher or sync engine.

## Evidence

The independent reviewer ran 57 tests across Authority/Pg composition, shared DTO,
existing client adapter and the unchanged Core qualification handoff; typecheck passed.
The implementation ran the real network-none PG/Backend Golden Slice (4.17 seconds).
The reviewer inspected its fixture, SQL and receipt without rebuilding the database.

The PG receipt records canonical membership, generation and receipt with the same
transaction xmin; rollback, receipt failure, duplicate/concurrent operations,
regrant/ABA, private Item visibility and exact Session revocation were exercised.
It uses synthetic bearer mapping and a fixture held-scope adapter, not Provider login.
The fixture's Session helper is intentionally excluded from the candidate DDL.

## Exact integration boundaries

1. Core owns the real held-scope adapter and canonical membership mutation. Compose
   generation/receipt publication inside that same COMMIT; do not turn dormant
   invite revocation or participation changes into member-removal authority.
   The candidate Pg adapter never provisions or advances a generation on a read/join.
2. Auth/Core must connect a formal current/revoked Session source and its invalidation
   event. One Session logout must not revoke the Account's other Sessions.
3. Core/transport owns private join, expiry enforcement, post-COMMIT publication and
   actual forced disconnect. A callback/SQL denial is not network-disconnect evidence.
4. Native owns cache-deny and fresh FullPull/regrant. An authoritative revoke does not
   wait for a Core tuple. Optional Core references require same-COMMIT provenance;
   this candidate does not fabricate that mapping or purge pending/drafts/receipts.
5. `pg-candidate/CONNECTION_GENERATION_CANDIDATE.sql` is **not an installer**. It adds
   two liveness/receipt tables, two trigger functions, two triggers, two RLS policies
   and three table privileges for the existing Core gateway. It adds no role or
   business permission mirror. New protected RLS/GRANT installation needs the exact
   Owner Gate and Core Writer preflight; none has been requested or executed here.

The fixed bace5af8 Core metadata handoff is included verbatim with its Owner's
permission. Its standalone observer is explicitly not a private join lease and
must not be nested inside the held transaction.

Use the package manifest and scoped files/dependencies, not the long Auth branch
as a wholesale merge. Root must qualify compatibility against its actual current
assembly. No Host, OAuth, Provider, device, Bootstrap or shared Native file is changed.
