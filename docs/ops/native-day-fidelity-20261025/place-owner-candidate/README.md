# P3 selected-place metadata / serial owning candidate

## R33 Native follow-through — 27 October, 23:47–23:55 NZDT

Serial product intake is fixed at `149b6eb5`, included in signed R33 build at
`9ab2387e`; dedicated Forms QA same-bundle install and cold launch passed. Existing
Trips plus the normally Server Accepted new Enrichment Trip remained visible.
No AD5 interaction or data copying was used.

Actual normal UI: existing synthetic Stay → Edit → Apple full-screen search for
SkyCity Hotel Auckland → select The Grand by SkyCity → resolved90 Federal St →
Save → refreshed Stay Details → Day Feed. Accommodation title,25–30Oct dates,
19:00 check-in and Everyone remained. Header styles B/C now display **Auckland**
for the covered25–30Oct dates; dates lacking qualified place still fall back.
The observed26/27Oct dates each show one Daily base. Screenshot:
`/.forms-qa/r33/day-header-after-normal-save.png` relative to this worktree.
This is local Native acceptance, not Manual P3 Cloud L3 or a full generic resolver.

The structured address exposed a duplicate identical name/address in Details;
the shared pure Stay presentation mapper now suppresses only the duplicate label,
retaining a distinct place name. Four directed suites27 assertions PASS. That
small display follow-up needs the next bundle; R33 screenshot precedes it.

Historical candidate-only statements below describe the independent delivery
before serial intake; do not reapply its patch on top of149b6eb5.

Native implementation now retains raw Apple `addressComponents` (locality,
administrativeArea, country, countryCode) beside the already resolved address,
point and opaque provider reference. It makes no additional provider request.
General POI and destinationArea flows retain their existing session/cancellation
fences and manual fallback; old Native responses without components remain valid.

Inline hotel selection and full-screen address selection forward the resolved
candidate into a P3-local, immutable `UNACCEPTED_PROVIDER_DRAFT`, bound to Trip,
Item, Account generation, exact address and local input revision. Manual address
edits invalidate it. Unrelated fields and the existing Save/retry path remain
unchanged. No UI code writes Core accepted facts or uses the draft as Header city.
At this stage the sidecar is **in-memory Draft only**; current formal Save still
persists the existing address string. Relaunch retention of the structured fields
requires the serial owning patch below. No separate persistence table was added.

## Fixed source and checks

- Current mandatory UI/glossary conventions retained; no new UI copy/colors.
- Native TS: six directed suites / **59 assertions PASS** (including the existing
  single Daily Base regression), typecheck, UI guard, scoped lint and format PASS.
- Swift engine and raw-component test compile/run: **4 assertions PASS**, no
  provider searches. SDK reports the existing/dependent MKMapItem.placemark
  deprecation; this candidate retains raw fields until an equivalent supported
  Apple API is qualified. Engine uses the same placemark path already used for
  destinationArea qualification; it does not parse a formatted address.
- No app build/install, GUI, Metro, AD5, Backend or Cloud assertion from this task.
  The Swift engine change requires the parent's next normal native rebuild.

## Existing lawful writer entry

`corePlaceSchema` already contains authored/accepted structured address, paired
coordinates, `location_input_revision` and `spatial_provenance_refs`.
`SET_ITEM_PLACE` is the existing same-Item owning mutation; the existing Manual
Repository's `commitManualBatch` rechecks Actor/Account/Trip, source fingerprint,
semantic revision, retry identity and queue transaction. B-T1 I/J and B-T3C
UPDATE_LOCATION permit manual/explicitly reviewed acceptance, **not automatic
provider-copy**. `accepted_place_id` is an internal UUID FK; an opaque Apple ID
must never populate it. It can remain null, with any provider reference attributed
separately. No new Source, Core root, queue or schema is needed.

## Patch for the unique writer — not installed

`AUTHORED_P3_PLACE_AND_READER.patch` is a concrete, default-uninstalled serial
candidate. It adds an optional third parameter to the existing Manual Repository
Save, validates the exact immutable Draft binding, includes it in retry identity,
and writes only existing **authored** structured fields/provenance. It preserves
`UNACCEPTED_PROVIDER_DRAFT`; all accepted fields remain null. The accompanying
P3 editor hunk pins the original selected metadata with the first Save attempt.
It also exposes existing authored/accepted geographic fields, provenance/input
revision and Item visibility through the existing read projection. One typed
test fixture explicitly retains PRIVATE visibility. No shared owning source in
the active worktree was modified.

Patch application check PASS. In a disposable shadow source tree, the existing
Manual Stay, Core Views and P3 Form suites pass (43 assertions); the initial type
probe identified the typed fixture visibility addition now included in the patch.
Final serial integration still needs its unique writer's directed tests/review.

An authored-only patch is deliberately insufficient to declare a qualified
Header destination. The minimal next acceptance option is to make an explicit
normal Save request the reviewed acceptance boundary **inside the owning Manual
Repository**, with the same binding/Actor/CAS checks and a distinct manual
acceptance provenance, then project its committed accepted geography and visibility.
That option requires explicit owning policy review before installation; a raw
Apple result or the presence of this sidecar can never trigger it automatically.

Only after accepted geographic identity and shared-safe eligibility are present
may the Native Header resolver consume them. Raw address parsing, first Trip
destination, WHOLE_GROUP-as-visibility and private-to-shared location reuse remain
forbidden. The existing exact fallbacks and Daily Base fix are retained.

## Complete serial candidate — supersedes the authored-only patch

Native metadata source is fixed at `7a546aff9cf60cd800243201a693b256c43fcc35`.
Use **`FORMAL_P3_PLACE_SAVE_AND_HEADER.patch` alone**, after that Native commit;
do not apply it on top of the historical authored-only patch. The active Native
product tree still contains neither shared change. This file is the concrete
unique-writer review/install candidate, not a request to redesign the subsystem.

The combined patch supplies the remaining vertical path:

1. Existing Manual Save accepts either a raw attributed Draft (authored-only) or
   the explicit `ACCEPT_SELECTED_APPLE_PLACE_V1` reviewed-Save intent. Only the
   latter commits selected address/components and paired coordinates into the
   existing accepted fields. It repeats exact Trip/Item/Account generation/address
   binding, then uses the unchanged Actor/CAS/manual-batch/queue boundary. The
   first attempt pins metadata, acceptance choice and the complete Place snapshot
   for exact retry, including its original reviewed_at after a transaction rollback.
2. Native supplies that explicit intent only from the existing Save action after
   the user selected the resolved target. No provider callback, refresh or mere
   Draft presence promotes it. This is a proposed owning interpretation of
   B-T1/B-T3C's **explicit reviewed manual acceptance**, requiring the unique
   writer's policy/code review before installation. Provenance says user-reviewed
   planned target, never server-verified address or actual visit. Opaque Apple ID
   remains a provider reference; `accepted_place_id` remains null.
3. Existing Core read projection exposes its committed structured geography,
   provenance/input revision and explicit visibility. The pure Header adapter
   accepts this supported manual provenance only when bound to that same current
   input revision. A country-qualified locality/region tuple distinguishes
   homonyms without a new Place identity or table.
4. The Header uses GROUP + WHOLE_GROUP visible, active P3 Stays only. It resolves
   check-in/interior/checkout base, empty covered nights, same-city moves and
   explicit same-day checkout A/check-in B routes. Competing/missing/stale facts
   remain unresolved. Account generation, Trip/date, read object and locale fence
   component-local memoization. Pending items replace the same accepted Item ID;
   no cross-account derived-label cache or new business reader is created.

Old address-only rows cannot magically gain geography: normal Edit → reselect a
resolved hotel/address → Save is needed after serial installation. Private or
selected-member Stays still cannot supply a shared Header city. Other Import
provenance, explicit Day destinations, P1 activity and ordered transport routes
remain outside this bounded manual-P3 selector until their owning projections are
qualified; nothing is inferred from addresses, names or codes.

### Final isolated validation

The combined patch is applied only in a disposable materialized source copy;
active product authority files remain unchanged. **Eight suites / 181 assertions
PASS**, typecheck, UI guard, scoped ESLint and Prettier PASS. The set includes real
in-memory SQLite Manual Save → the existing Core/queue → normal Day Feed Reader
→ Header selector: raw Draft stays unresolved; explicit reviewed Save reads back
Nelson from the committed same Item with one queue operation. Exact retry,
changed-metadata rejection and foreign-Item binding rejection pass. Header tests
cover privacy, stale revision, homonyms, competing stays, empty night, checkout,
same-city/cross-city transition and local-over-accepted identity overlay.

This is **LOCAL candidate validation**, not installed Native acceptance, Hosted
Backend E2E, Supabase readback or Cloud L3. Existing P3 write gates and the owning
Backend contract remain in effect. No GUI/device/Metro/DEV operation was used.

Independent-review repair: first SQLite intent INSERT failure rolls back all rows;
retrying the same Draft after advancing the clock reuses the frozen full Place
and original reviewed_at and successfully creates exactly one operation. A
separate independent recheck of this fixed patch remains required before intake.
