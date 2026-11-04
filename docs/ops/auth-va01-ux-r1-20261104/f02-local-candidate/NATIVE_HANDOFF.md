# V-A01 F02 — normal Account Trip restore presentation

Request `AUTH-VA01-F02-RESTORE-EMPTY-20261104-01`.
Owner feedback VISION-VA01-UX-R1 is already approved. Primary remains AUTH-C04;
this local slice does not consume its protected Gate or Hosted resources.

## Fixed local result and first failure

One new headless reproduction reuses the existing LocalTripWorkspace test harness
with the real MyTripsList (only platform/cover mocks). Empty initial local/discovery
cache with cachedAtnull becomes READY and renders first-Trip empty UI; after the
same synthetic Account's historical Trip arrives, its title renders normally.
The no-false-empty assertion fails:1failed/65stable skipped. Private temporary test
was removed; its hash/path and exact scope are in EVIDENCE. This is the Auth-branch
UI path, not a new main/device/Owner Account test.

Current main6ec static code still contains that branch, but has Native's skeleton
and failed-refresh cache preservation. Reuse those improvements and current Native
harness; do not replace shared files from Auth's older branch. Auth made no edits
to LocalTripWorkspace, MyTripsList, Startup, coordinator or catalogs.

## Minimal Native consumer

Use `accountTripListPresentation` and `AccountTripRestoreObservation` from the fixed
Auth source. This pure helper has no auth, storage, network, observer or timer side
effects. It does not initiate a refresh or create a second lifecycle owner.

Inputs: current normal AccountScope; cache `{scope,visibleTripCount}` from the existing
fenced local/discovery read (or null); observation `{scope,status}` (or null); and
`waitExpired` from Native's bounded UI wait. Scope is Account ID + generation.
Only qualified current-cache rows count; a cached timestamp or local notification
alone is not fresh successful discovery. Guest lists retain their independent path.

| Result          | Native rendering / requirement                                                                |
| --------------- | --------------------------------------------------------------------------------------------- |
| SHOW_TRIPS      | Render qualified cached Trips immediately, even offline/pending/error/timeout                 |
| RESTORING       | Reuse existing MyTripsListSkeleton; do not show first-Trip empty actions                      |
| CONFIRMED_EMPTY | May render existing empty UI only after matching empty cache AND matching completed discovery |
| UNAVAILABLE     | Reuse existing localized loadFailed/tryAgain feedback, no infinite spinner or false empty     |

The Native owning coordinator should expose an observation from its existing ReadState
and actual complete discover/cache-apply checkpoint. Do not create a new Repo/Sync
Engine or use bootstrap's local `discoveryChanged` signal as remote completion.
CONFIRMED may be emitted only after all discovery pages validate and existing cache
apply succeeds for the still-current Account/generation. Discovery failure or missing
qualification is not success. New initial restore/Account generation/cold bootstrap
must not inherit confirmation from an old scope; Native's existing coalescing and
request fences own same-scope ordering. Caller must bound waiting and provide actual
retry/offline/failure feedback; helper itself does not implement that integration.
Restore retry must invoke the existing account Downstream refresh (honoring its
coalescing/backoff) and then reload the local view; a cache-only load cannot prove
remote recovery. No new retry loop, queue or forced login is introduced.

A cold or switched Account with null/foreign/old-generation cache or observation
cannot display the previous Account's Trips or empty certificate. Existing local
Session/offline entry stays accessible; this status never revokes Session or blocks
App launch. No Auth refresh requirement, shared write, Claim or business mutation.

## Ownership, validation and return trigger

Native confirmed sole Writer for shared MyTrips/Workspace/Startup/catalog/coordinator,
will mount the minimum consumer after its current Source QA tail. Auth owns this pure
projection and fixtures. Five helper tests and independent5/5 passed; ui:guard and
scoped lint passed. Existing skeleton/error copy is reused, no new UI copy requested.
No OTP, real Owner data, Provider, Hosted, SQL, migration, device or credentials.

Return exact Native candidate/shared file diff and focused real caller regression:
initial unknown → no empty → historical Trip; confirmed empty; failure/timeout retry;
qualified cached offline Trip; Account/generation switch. Then main integration and
fixed Build/Device/Fixture allow Vision precheck. This local helper PASS is not UI
repair PASS or V-A01 READY; all four A01 sub-slices remain under Owner acceptance.
