# Private Realtime V1 — Native consumer handoff

Golden Slice: A normal Manual P3 Edit → physical Core COMMIT/APPLIED → private
invalidation → B existing authorized Pull → accepted SQLite → normal Day Feed.
Signal never carries/apply Item bodies. Existing Queue, Receipt, Core and
Downstream remain the only business paths.

## Formal version read

Existing GET `/v2/trips/{tripId}/core/authorized-version` with
`X-OTR-Core-Contract-Version: 2`, optional `X-OTR-Ordinary-Order-Version: 1`.
Response is exactly `otr.core.authorized-trip-version/1`, `actorAccountId`,
`tripId`, `token` (64 hex). Account/Trip must match the current normal-session
request before and after I/O. Token is opaque equality only, never a Trip-global
counter, sortable revision, Auth lease or permission proof. Use Root's actual609
shared algorithm; no second Native hash recipe.

The comparison baseline must come from the same validated Accepted full collection,
with matching Account/Trip/generation/projection and current complete certificate.
Two version GETs being equal do not bind an intervening collection. No baseline
means normal Pull; changed means normal Pull. Retryable version unavailability
falls back to the authorized Reader; denial, stale context and invalid projection
must not be converted into an unchanged/success result. Pending/Conflict never
participate in the server version fingerprint and are not cleared by comparison.

`realtime-hosted-version.mts --run-dev` consumes a fresh normal QA Login result
via stdin only (accountId, tripId, accessToken), uses the existing authenticated
transport and fixed DEV URL, and makes at most3 read-only version GETs. It prints
only timing/decoded-body size/equality, not credentials, token, Item or identities.
Do not source it from a device Session/Keychain. First/repeated requests do not
prove cold/warm physical PG connections: correlate existing server phase telemetry.
Run only in the already authorized Synthetic QA scope and a short coordinated
read period. No refresh-token acquisition, credentials file, deployment or Gate
opening exists in this tool. Actual Hosted result is still NOT_RUN.

## Private authorization and post-commit producer

Native consumes the existing Auth atomic `open(context,events,signal)` returning
one bounded server-owned lease and close function. Context binds current normal
Account, Trip and local lifecycle generation; local generation is not authority.
Lease/hints bind exact leaseId and authorizationRevision. Auth owns server session
binding, admission, authorization lifetime, expiry/revoke/regrant and actual join.
Expired/disconnected is not proof that Core cached data may be revoked.

Core's unique Writer must publish only after a physical successful transaction
commit. No private Item body, evidence or Session may be broadcast. Existing
`events.invalidated({leaseId,authorizationRevision})` is sufficient for Native;
duplicates/out-of-order are harmless invalidations. Signal is not a Receipt or
collection. Failed publish must not change a committed APPLIED into a new mutation
or force an Operation ID replacement. Reconnect/foreground/version-Pull catches
lost hints; no durable Event Bus or new Native retry engine is needed.

A trusted authorization invalidation must distinguish channel/session loss from
actual Reader access denial. Native's `accessRevoked(context,receipt)` must be
supplied by a qualified owning cache-fence path. Existing Core revoke takes its
own accessRevision; Auth revision must never be passed or numerically translated.
No generic404/disconnect/join result is a substitute. Default remains undefined
until actual revoke/regrant and late in-flight Reader fences are proven.

## Two-client operation script

Use the fixed local `node scripts/trip/realtime-v1-qa.mjs` first. It covers actual
local Core/SQLite integration but fixture transport/admission, not Hosted claims.
For actual DEV, record non-sensitive device/build and exact Synthetic Trip/Item,
normal Account class, original Core revision and original Pending status. Preserve
both device sessions and history; do not reset either client.

1. B opens the existing P3 in Day Feed and stays foreground. Record ready lease
   and Accepted certificate, do not manually refresh during the observation.
2. A edits that same P3 through the normal Form/Manual Save. Keep its original
   Item ID/Operation ID. Record APPLIED Receipt and commit time.
3. Record post-commit hint, B authorized Pull/Accepted revision and first visible
   frame. Independently read back the server fields; measure commit→B visibility.
4. Restart B and verify the same Item/revision. A duplicate/older signal must not
   create anything or discard B's pending local changes; a lost signal followed
   by reconnect/version check must catch up through existing Pull.
5. In the authorized two-account fixture only, prove actual access revoke denies
   both subscription and Reader; old hints/lease/late reads cannot expose data.
   Regrant must obtain a new authoritative lease and fresh accepted read. No
   implicit mapping between Auth and Core revisions. Keep pending intent intact.
6. Perform A→B→A lifecycle isolation and release only this run's sessions/claims.
   Device screenshot alone is not server authorization/receipt evidence.

STOP activation if atomic admission, post-commit producer or authoritative cache
fence is absent. Mark READY_FOR_INTEGRATION, not private Realtime PASS. No new
shared Host/SQL/Provider request is implied by this packet. MCP retains release
priority; ordinary local tests and exact interface exchanges remain independent.

## Native cache callback recipe (still unmounted)

Auth57c357f0 shared schemas/mapper are received byte-exact, without the Auth long
branch or Backend producers. For a trusted committed revoke, close the old lease,
map only the exact Account/Trip Auth receipt, then call
`core.denyExistingAcceptedScope(context)` and issue the existing read-completion
notification. This uses the current known Core scope revision, never the Auth
integer. Existing private scope+certificate is required; absent scopes do not
invent revision1 or qualify a subscription. Normal initial Pull must establish
Accepted scope before enabling this V1 private optimization.

`core.regrantExistingAcceptedScope(context, deniedFence, normalReader)` requires
new server qualification/new lease and fresh full collection. Validation and the
existing install transaction CAS replace Accepted and clear deny atomically;
missing pages, network failure, concurrent revoke and ABA keep denial. Old writes
stay DEPENDENCY_BLOCKED until the existing business resume/capability path permits
them; retained intent is not a new grant. Callers must notify/cancel UI state as
well as persist denial. Local tests exercise the DB and notification spy, not
actual screen eviction or server authorization.

Three real failure chains are repaired: route-scoped known503 codes now survive
the bounded API's safe error mapping; a prior401 with pending normal refresh
cannot become a generic timeout fallback; denial no longer disappears when a new
Core refresh revision already exists alongside an older Accepted certificate.
Unrelated error mapping and old Repository public methods remain unchanged.

Hosted measurement is prepared using the previously accepted normal registered-QA
helper with an independent fresh Session and finally local-scope cleanup. It must
wait for the exact same-email/Core-read-lane MCP critical group to release; no
Host deployment lock, Source/Provider gate or copied device/MCP Session is used.
