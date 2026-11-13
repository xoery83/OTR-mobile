> Final closure update: the precise P2 SQL repair is deployed and the original association is APPLIED.
> Final B1 delta: 5 Items / 6 Documents / 7 associations / 19 receipts.
> WebP App-network-failure opening PASS; OS-level offline remains unverified.
> See [final report](b1-p2-document-20261113/README.md). Earlier diagnosis below is historical.

# Import V3 Phase B1 — full App / real Provider, partial acceptance

13 November 2026. Dedicated DeviceHub full OTR App, not the Phase A Harness.
No main merge/push, shared DEV deployment, SQL/ACL change or physical QA179 change.

## Actual delivery

Commits `9e60834`, `7dac1cd`, `df96cb2`, `66e5706` implement real byte-signature
checks, the existing system copy picker for V3, supported civil clocks/places,
existing P2 authored details, normal Core read budget and accurate flight Review
labels. No new dependency, queue, command, service or schema. UNKNOWN and original
Operation IDs are retained. No B4 field editor or unsupported P5 defaults.

The native open-in-place Files picker failed before callback with Cocoa 257
bookmark errors. Same host/App/TXT succeeded through the existing Expo copy picker.
V3 reuses that copy path; legacy native leases remain unchanged. No Owner click is
required. NEEDS_ACTION before Analyze is now an awaiting-action state, not failure.

## Six formats / real model

| Format | Full App intake | Original bytes after App update/cold launch | Real DeepSeek |
|---|---|---|---|
| TXT | Files PASS | PASS | PASS, Files Batch |
| PDF, two pages | Files PASS | PASS | PASS, Files Batch |
| WebP | Files PASS | PASS | PASS, Files Batch |
| PNG | Photos PASS | PASS | PASS, Photos Batch |
| JPEG | Photos PASS | PASS | PASS, Photos Batch |
| static GIF | Photos PASS | PASS | PASS, Photos Batch |

Photos retained actual PNG/JPEG/GIF bytes; no conversion was needed or observed.
Simulator Photos addmedia rejected WebP; Files accepted it. No claim that Photos
supports every format. Each Batch has three attachments, within the five-file limit.

**Exactly two real calls used; no more calls are authorized in B1.** Independent
Host SQLite confirms one successful Attempt per Task, published results:

| Batch / Task | Input / output tokens | Task created → published | Started marker → published |
|---|---|---|---|
| Files `48181fe2-1355-4d79-b34f-39d95999f8d4` / `8cc058e7-dfb2-8046-b192-50a3b181494d` | 982 / 351 | 11.903 s | 3.891 s |
| Photos `3d2789c7-f234-49f5-9b8d-c5479c496209` / `7baec78d-cb17-883c-9326-d2134d9cb647` | 1506 / 247 | 10.732 s | 3.739 s |

Total 3,086 actual tokens. Started→published includes Provider/result work, not a
verified pure model-inference duration. Precise client→Review timings, dollar
charges and Agent Credits are unavailable; do not estimate them as measured facts.

## Real Review / Save / N→M

Normal UI Confirm saved five new canonical Items: two P3 hotels, two P1 walks and
one P2 flight. The PNG hotel (Nov2–3, no clock) remains distinct from the TXT hotel
(Nov14 15:00 → Nov15 10:00, 20 Harbour Road). No false merge or invented midnight.
TXT walk preserves Nov14 17:30/Fern Quay; image/WebP walk preserves Nov20 10:30.
Flight NZ1 preserves AKL→CHC through existing authored-details operation. NZ2 was
not selected. No unsupported candidate was forced into Core.

Real 1→N: one TXT Document links to hotel and walk. Real N→1: GIF and JPEG were
explicitly LINKed to the same canonical WebP walk, giving three Documents and one
Item without modifying its title/time. Separate model candidates are not silently
merged. Combined batches exercise N→M; exact supporting Document sets are retained.

Independent DEV READ ONLY at the synthetic Trip
`bdc65c02-2526-4990-9331-9c5359c73ec9` finds 7 Items, 7 Documents, 8 links and
23 APPLIED receipts, including preserved Phase A 2 Items/1 Document/2 links/5
receipts. B1 delta: **5 Items, 6 LOCAL_ONLY Documents, 6 links, 18 receipts**.
One remaining PDF→P2 link is not saved; do not report complete B1 Save PASS.

Normal full App Day Feed shows actual dates/clocks and one canonical boardwalk.
Hotel Details shows check-in/out/address; TXT original opens with matching text.
Boardwalk Details shows all three image attachments. The JPEG original opens in
native Quick Look. A minimal native navigation wrapper and standard Done button
now allow JPEG/WebP/GIF to render and close back to the same Details; verified in
the full App, including repeated original openings without BUSY lock retention.
App replacement/cold launch preserved the original batches and all six hashes.
Cold startup with all ordinary JS fetch calls forced to fail in the temporary
test entry retained My Trips, normal Day Feed, the same Item and three associations;
JPEG original rendered locally. First cold WebP preview returned before content was
verified, so offline WebP opening is not marked PASS. This is App network-failure
injection, not OS-level airplane mode. The injection was removed after validation.
OS-level offline cold recovery and physical iPad B1 remain unverified.

## Field fidelity coverage

| Family | Real Provider / full App | Remaining limit |
|---|---|---|
| P1 | Two actual walks, real dates/clocks/place; one canonical boardwalk | No forced merge |
| P2 | NZ1, AKL→CHC, original civil dates, authored-detail receipt | PDF association blocked; absent clocks remain absent |
| P3 | TXT check-in/out/address; PNG date-only hotel | Two different stays remain distinct |
| P4 | Pickup/return clock/place mapping in isolated tests | Real Provider/UI unverified |
| P5 | Supported endpoint/time mapping and incomplete payload rejection in isolated tests | No fabricated fields; real Provider/UI unverified |
| P6 | Activity date/time/place mapping in isolated tests | Real Provider/UI unverified |

Zero-item/ABSTAIN, invalid evidence and conflicts are isolated/mock coverage.
NEW/LINK used actual UI and official receipts; field-level UPDATE remains B4.

## Unique remaining Save blocker — existing P2 aggregate contract

Original Item `d9ec2529-6516-857f-a31f-325083e68a9f`, PDF association Operation
`b8d1a89e-7036-817c-9047-dab721cc3af4` remains the sole failed association. Item
creation, authored details and PDF metadata have APPLIED receipts; association
returns HTTP503 and has no receipt. Never create a replacement operation or
re-Confirm this Item. The existing durable queue retains the original operation.

CODE_CONFIRMED from current DEV pg_proc: `public.assert_trip_core_v2_aggregate`
permits a SPARSE/P2 TRANSPORT with zero services under MANUAL only when
`otr.core.command IN ('SET_AUTHORED_FLIGHT_DETAILS','SET_ITEM_PARTICIPATION')`.
`RECONCILE_ITEM_DOCUMENTS` is omitted. The original target is TRANSPORT/revision2;
association increments the Item revision and triggers this aggregate check.
The ordinary Backend guard already excludes documentLink from the flight edit
restriction; that guard is present in the actual deployed bundle. Pure mutation
and original collection validation pass. The corresponding aggregate rejection is
the code-backed cause; sanitized server logs expose only OTHER, not the exact SQL
exception. No write-probe or database modification was performed to force proof.

Minimal owning-contract repair: allow the existing MANUAL Document association
command to preserve an already valid authored sparse flight under the same actor,
Trip, target, endpoint and zero-service checks. This needs Core SQL review and
specific authorization because B1 explicitly excludes SQL/Core contract changes.
Do not weaken RLS, fabricate a transport service or drop authored facts to bypass it.

## Validation / boundaries

Overlapping targeted runs: affected 197 PASS, repository/Review 145 PASS,
byte/capture/projector/Review 51 PASS, picker/URI/staging 33 PASS, result UI 44 PASS,
latest Review 41 PASS. Native fix: Xcode simulator Release build and real full-App
JPEG/WebP/GIF open/Done checks PASS. P4/P5/P6 field mapping, zero-item/ABSTAIN and malformed or
conflicting evidence are isolated/mock tests, not real Provider P1–P6 coverage.
UI guard/changed-source ESLint/whitespace passed. Three unrelated existing full
TypeScript errors remain. Do not sum overlapping counts into product acceptance.

Local non-secret evidence: `/private/tmp/otr-b1-fullapp/` contains independent
Provider/PG readback, six-format hashes, exact original operations and screenshots
`day-feed-full-app.png`, `hotel-details-full-app.png`, `txt-original-full-app.png`, `three-documents-details.png` and
`network-failure-cold-day-feed.png`.
No auth material belongs in this report. The dedicated App uses its own normal
synthetic login; no QA179 Session/Keychain/SQLite/queue was copied.

Status: **Simulator Full App and Real Provider partial PASS; B1 incomplete**.

## Test-host build note / handoff

The new simulator-native build needed the existing Expo SceneDelegate for iOS27
and its standard Xcode signing. A changed simulated signing identity exposed an
empty Guest Keychain and legitimate adoption protection; it was not bypassed. The
final temporary host preserves the original B1 host signing identity and existing
normal session, without copying any Session/Keychain. Generated host changes live
only under `/private/tmp/otr-b1-fullapp/mobile/ios`, not product source.

The local fixture HTTP server was stopped. The final installed package has normal
network behavior; the dedicated test App is stopped at handoff to avoid repeating
the known failed PDF association. Its original durable operation, UNKNOWN rules,
batches, originals and receipts remain intact. Do not resume model calls.

Next action requires a separately approved owning Core SQL compatibility repair
for the precise P2 association gap; then retry only the original idempotent
association via normal Sync and read its receipt. No new Analyze or Item is needed.
The generic saved-summary warning on Trip Home remains a recorded UX inconsistency;
it did not prevent actual Day Feed/Details access and was not redesigned in B1.
