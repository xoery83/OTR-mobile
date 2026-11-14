# Full App interaction record — 14 November 2026

DeviceHub `OTR Import B1`, simulator `1B2252F4-4F90-4F93-9223-545269EAA06C`,
bundle `com.xoery.otrmobile.b1full20261113`. Existing test Account/SQLite retained.
UI actions through CUA; build/replace/read-only evidence through normal tooling.

1. Cold launch → My Trips → Import Slice 3 Synthetic Review → Add to this trip
   → Import Travel Plans → compact attachment menu → Recent submissions → first
   View (00:22:34). No Submit/Analyze/Confirm was pressed.
2. Initial checking message changed after existing real DEV receipt reads to
   Created 1 / Gallery, Linked 1 / AA1302, Not Created 1, Needs Review 1.
3. Gallery title → normal P6 Details: correct gallery/date/location and existing
   actions. Native Back → original Activity. `item-details.png`.
4. Associated Submitted text → existing Item original reader showed actual text
   content, not only a metadata shell. Back to Results → original Activity.
   `document-original.png`. Reader checks actual Item/Document authorization.
5. Open Day Feed → date chooser → 2026-12-14 → normal Day Feed: Harbour walk,
   Hotel, Gallery and flight timeline. `day-feed-return.png`.
6. First implementation's ordinary router.back returned Trip Home rather than
   Results because Trip route was reused. Fixed contextual action to reopen
   `/import-plans` with original Trip/job. Rebuilt/replaced without clearing data.
7. Repeated cold launch/history → same counts. Open Day Feed → Back to Results
   reopened exact job `23bec76c…`, timestamp00:22:34. Existing receipts rechecked,
   same Created1/Linked1/Review1/NotCreated1. `results-returned-same-batch.png`.
8. Needs Review → existing exception Review loaded one "Date needs checking"
   issue with missing-required-information copy. No resolution/save. Back →
   same timestamp Activity. `needs-review.png`.

Cold/process replacement was actual; system-wide offline and physical iPad were
not part of this run. Full App uses the already-existing external synthetic Provider
fixture, while normal Auth/Core readback remains real DEV. No new model dispatch
or business save. Pixel offset is retained in account-scoped memory when navigating;
exact pixel offset across process death is not promised or separately measured.

Ordinary Trip Home return and all six family Details are wired to the shared normal
routes; runtime exercised Day and P6 Details, not every family separately.
