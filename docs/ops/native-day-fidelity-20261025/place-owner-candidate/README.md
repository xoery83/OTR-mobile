# P3 selected-place metadata / serial owning candidate

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
