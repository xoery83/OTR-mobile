# Slice 6 — final limited Activity UX closure

Product **39b22ea4c2ce25444fa67203d3982ec4e7b3a7b8**, based on accepted product2e751873/reportae787285. This is the Owner-authorized presentation closure, not a new design or E2E campaign. **GO for final Main Merge review; no merge/push executed.**

## Changes against Oct23 Activity UI Blueprint

Only `ImportActivityList.tsx`, its owning test and two bilingual catalog entries changed:

- Normal rows now have three visual lines: filename +compact actual timestamp; localized source +authorized Trip/Inbox; true owning status +formal unique saved count when available. Previously timestamp/context/status/count each took separate lines. Minimum72pt row remains; content can grow with text size. Filename/context use native single-line truncation; complete text and full recorded year/seconds remain in accessibility content, with owning Batch detail unchanged.
- Vertical row padding16→8pt, copy gap4→2pt; status strip padding12→2pt. Existing44pt chip/button targets remain intact. No new fixed-height clipping or type scaling restriction.
- Loaded-count explanation moved below Batch rows before existing pager. It remains visible for a partially loaded empty filter; no false full-history totals. Status counts and source matching are unchanged.
- Source labels come from existing `projectImportActivityRow` mapping of formal `batch.inputs[].acquisitionSource` to existing localized FILES/PHOTOS/TEXT categories. No raw enum, debug name, Actor ID or QA qualification is rendered. `Slice6 Local…txt` and `Recovery Account Edited` are retained synthetic filename/business Trip data, not diagnostic source labels; no content was renamed to make screenshots look successful.

Updates chronology/unread/Review/read-preference/UNKNOWN, Batch navigation/manual forms, Core/Receipt/Queue/Auth and Backend/SQL are unchanged. Activity has no keyword search.

## Checks

- **47 tests /5 files PASS**, scoped ESLint and UI guard PASS (178 checked /473 unchanged legacy occurrences). Existing tests retained; added formal-source/Trip presentation, filter exclusion, and footer-after-rows checks. Typecheck remains the same3 Main baseline errors, no new error.
- Existing independent reviewer: **static PASS**, including source provenance, formal result count, truthful partial counts and accessibility. No broader audit or new review Agent.
- Complete normally signed arm64 Native Release iPhone build succeeded; staged1673 tracked src/app files match final product, except guard-comment-only synchronization after build. Installed JS bundle matches built artifact `88335a4ab86dfa47ea46ee91364bdc6bddda3559d29d662d9f6d56075e0817a4`.
- Actual primary iPhone full App: My Trips→normal Trip→Updates→Activity. Standard light/text3 screenshot shows compact three-line rows, aligned timestamp, tighter filters and no first-screen technical paragraph. Source chooser→Photos/Camera yields correct zero-state; Files restores real rows; Review0 yields correct empty state; All restores rows. No Analyze/Confirm/Save.
- Optional additional scroll gesture was attempted with existing DeviceHub, which returned `noWindowsAvailable` twice even after rebinding; no gesture success is claimed for this round. Required screenshot/basic filter acceptance is complete; previous unchanged scrolling behavior and owning lifecycle tests remain separate evidence. No tool framework/layout workaround added.
- Original9 iPhone file hashes match, local Batches25/inputs25/captures56, CoreDocs9/links14, original13 Queue operations still COMPLETED. No reset or session transfer. Build and read-only preservation proofs are linked below.

## Screens and operation evidence

Same primary iPhone, Light appearance, TextSize3, same existing local data. Live owning status may change or be unavailable; the screenshots retain actual UNKNOWN rather than fabricated success.

[Before](density-closure/iphone-before.png) · [After](density-closure/iphone-after.png) · [Files +Review0](density-closure/iphone-filter-review.png) · [Build](density-closure/build-proof.json) · [Data](density-closure/data-preservation.json)

## Final review boundary

Owner already accepted the evidenced Slice6 functional scope. This delta has no new semantic or product regression identified and is ready for final Main Merge approval, retaining original formal evidence and deferred work.

**Still not Native-verified:** positive semantic Review/read→resolve, fresh multi-account/Member scenarios, forced outage, physical iPad. This round does not upgrade any of these to PASS. No model, historical Save or complete E2E rerun; no Backend, SQL, Core, Receipt, Queue or AuthC04 change. Main Merge/Push still awaits explicit final authorization.
