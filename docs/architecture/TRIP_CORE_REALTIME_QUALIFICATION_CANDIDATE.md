# Core actor observation for Auth B1 — internal candidate

This candidate provides an actor-bound metadata read for the Auth private Realtime
contract fixed at `82b93537` and received by Native at `64038e6b`. It is not mounted
or injected into a runtime. It grants no private channel or publication authority.

`createCoreRealtimeQualification(connection, hash, gateMode?).observe(user, tripId)`
accepts only the existing trusted, normally authenticated Account classification.
The caller must obtain `user` from verified Auth middleware, never a request body,
decoded JWT or local role. UUID/normal-Account rejection precedes PG checkout.

The read reuses `withCorePgStorageTransaction` and `lockCorePgActor`: the existing
Core principal, transaction cleanup, timeouts, Account/Trip GUCs, finite scope and
runtime gate remain required. Only an active, linked Actor Person is observed.
The same transaction reads Core `epoch` and `access_revision`, rechecks the finite
scope and commits before releasing the observation. No graph, original Source,
membership write, new SQL function or permission is needed.

The result contains exactly `qualification: NOT_A_PRIVATE_JOIN_LEASE`,
`actorAccountId`, `tripId`, `actorPersonId`, `coreEpoch` and `coreAccessRevision`.
These explicit Core names follow Auth's accepted seam. `coreAccessRevision` remains a
Trip-wide Core observation: it is not Auth `authorizationRevision`, a per-Account
grant/revoke counter, a transition receipt, a lease ID or a server-policy TTL.
The reused transaction is READ COMMITTED with the owning Actor scope locks; this
does not qualify atomic private socket admission or a persistent Auth fence.
Missing/inactive/unlinked Actor, missing/malformed Core state, closed gate and
transport failures yield no qualifying observation and never imply revocation.

`coreRealtimeRevocationMapping(current, previous)` is a closed boundary over two
observations, not a receipt verifier. Account/Trip or epoch mismatch is explicitly
`NOT_MAPPABLE`; even matching epochs remain `NOT_MAPPABLE` because no owning Auth
transition-receipt producer exists here. It returns no revision to pass to Native
`revoke(context, number)` and never calls that interface. A large old-epoch number
must never revoke a newer epoch. Numeric ordering is insufficient across epochs.

Future mapping requires Auth's immutable membership/visibility transition proof
and its owning durable, actor-scoped authorization revision, plus an explicit
mapping to the current Core epoch. Auth's current lease/revocation DTO has no Core
epoch; this candidate cannot safely fill that field or convert a Core revision.
Private join, forced expiry/revoke, regrant, post-commit publisher, durable cache
visibility and actual permission negatives remain separate owning deliveries.

Validation is network-none: the real Core transaction wrapper and Actor helper
use controlled PG responses. Tests cover normal Account/Trip binding, transaction
order/cleanup, closed gates and cross-epoch mapping refusal. This is LOCAL_PASS
only, not Hosted authorization, lock-contention or Native E2E evidence.

Local validation: 16 new qualification tests PASS; three suites including the
unchanged CorePgRead/Storage tests total 106 PASS. Typecheck, scoped lint,
formatting and diff checks PASS. Root owns independent review, serial commit and
handoff.

After the Auth field-name alignment, the new 16 tests, typecheck and scoped lint
were rerun; the unchanged 106-test combined regression was not repeated.
