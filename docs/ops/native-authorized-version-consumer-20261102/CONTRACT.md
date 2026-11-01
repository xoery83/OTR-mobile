# Native opaque authorized-version consumer — default closed

Golden Slice: normal foreground Downstream Pull → validated full Collection →
existing Repository Apply/readback → process-local opaque-token baseline. A later
fresh authorized-version GET with the exact same opaque token may skip the full
Pull. A changed token takes the original Collection/Repository path. This adds
no mutation, Queue, Repository or SQLite migration.

The transport uses the actual Root route:
`GET /v2/trips/:tripId/core/authorized-version`, contract header2 and optional
ordinary-order header1. Normal authenticated API scope is checked before and
after I/O. The strict Root schema requires version, exact actorAccountId/tripId,
and64-hex `token`; token is not a fingerprint, Auth lease or Trip-global revision.

The shared `src/domain/trip/tripAuthorizedVersion.ts` is byte-exact `fe4f510a`
SHA256 `be78c2c6088b9381a0b0c3ba552a7712c9149b75b3fc072bbbd55c6a029059a2`.
No second token algorithm exists. Baseline tokens are derived from that algorithm
and the actual validated Collection, never a pair of equal version GETs. The
process cache binds Account/Trip/generation, projection mode and the complete
Accepted certificate including manifest hash and local applied generation.

`observeAccepted` runs only after the existing Accepted readback and confirms the
Repository certificate again after token derivation. A failed apply, stale
observer, Account ABA, certificate drift or foreign wire scope cannot install a
new baseline. Account generation clears process baselines; cold/restarted or
newly constructed consumers first use full Pull.

A fresh full Collection can have another manifest hash due to generatedAt even
when the six semantic stamp fields match. With this modern observer, the normal
Core refresh/readback must install that exact validated full Collection before
pairing it with a token. The old no-port and legacy fixture behavior is unchanged.

Version timeout/network and explicit503 CORE_READ_UNAVAILABLE /
CORE_EXECUTION_UNAVAILABLE / CORE_CAPABILITY_CLOSED fall back to the original
Pull.401/403,404 NOT_VISIBLE, malformed/foreign responses and other unclassified
errors are propagated. The version-only normal TokenProvider wrapper preserves
a known HTTP401 when its ordinary forceRefresh fails, instead of letting the
shared API classify it as a generic network fallback; no shared Auth/client
behavior or extra refresh attempt is added. A denial is not a cache-delete/revocation proof; its
owning Auth/Core cache-fence remains separate. No error marks Pending Synced.

The runtime `tripVisibleVersionRead` remains undefined. The prepared consumer is
an explicit factory with normal Account, Core transport and existing SHA helper
dependencies. No private subscription, publisher, protected SQL or feature gate
is activated. Actual Hosted/iPad latency, ACL/revoke and multi-device acceptance
remain required after legal composition; fixture comparisons are not performance
or full Private Realtime PASS.
