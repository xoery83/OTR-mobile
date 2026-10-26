# P4 local Form / fidelity delivery

Owner26Oct: first Create/Edit, then P4-only nine-state contents. Frozen package SHA256 `a16b8cdf193e3ed26ab5fa2cae0488c140e1e3f1ee2009d5db3ef1acf0abedd0`; exact Form Part2 excerpt verified. Preserve Day Shell, scrolling, bars, P1–P3 and existing authorities.

## Form candidate

Reuses `P4RentalEditor` and `manualRentalRepository` → existing `createManualItemRepository("P4")` / Core journal. One name, required pickup/return civil dates/clocks/locations; no Create Participants. Existing booked class/supplier/actual model/plate remain independent Edit facts. Header Save replaces footer; captions/canonical fields match P1–P3. Shared range calendar marks Today; compact transparent time sheets preserve explicit Done/Cancel. Notes uses the P3 keyboard/layout reveal pattern, last in Edit. Endpoint full-screen Apple place search reuses normal account-bound provider and allows manual address; selection stores authored text only. Old Trip/draft/account callbacks reject.

28 tests across Editor, Rental Repository and shared Calendar PASS; TypeScript/UI guard PASS. Independent Review identified stale Trip/draft search boundary; identity fence and regression added. Further native acceptance pending below; not a Cloud pass.

Forms QA simulator C0, embedded R14: normal synthetic session; New Rental name, Oct26→Oct28 range, independently confirmed pickup22:06/return22:07, actual Apple Maps address selection and manual return text, enabled Header Save→TripHome observed. Own new test rental `FormsQAP4Local`. Existing QA data retained. Native readback/Edit/cold launch, Notes keyboard, locale/appearance regression still pending. R14 short English range caption refined afterward to avoid sheet-title truncation.

## Owning gaps

Contact/Instructions are absent from current `ManualRentalFields`/mutation adapter. Reported to Universal unique Writer; do not flatten into Notes, duplicate storage or infer Booking identity. Scan/Update from Document, Source proof, authorized holder/driver, explicit related-vehicle relationships, Documents/Photos permissions and Ledger association/billing-day data remain capability gated. Backend/Supabase untouched. No Cloud acceptance claim.

## Next

Finish native readback/Edit/recovery, then P4 Browse/Focus/Immersive against frozen nine-state package, including actual identity priority, endpoint role, final sparse Future/Past Browse and Link-before-Add priority. Fixture acceptance remains separate from real Reader acceptance.

## P4 content + native Details candidate

`RentalContent` now shares Browse/Focus/Immersive between actual local/Core reads and the existing Lab. Final Future/Past Browse decisions replace older return-summary/photo-count text; actual model/plate take title priority without changing stored Rental Name. Canonical feed clocks/titles, car role line, range formatter, card/glyph/+ primitives and four Immersive actions are reused. P4 opts into Link-before-Add; existing P1–P3 default order is unchanged. Unknown media/booking/driver/expense facts stay absent; missing mutations stay disabled. No inferred billing days or related vehicles.

Core adapter retains independent PICKUP/RETURN row keys even on one day and rejects cross-Trip/revision DTOs. `P4Detail` uses the existing actor-filtered Reader and exact Repository Edit qualification; read permission does not grant Edit. Native Stack Back/Edit, same-ID Save refresh and Ledger weak Trip/date/Item-name prefill reuse existing routes. A missing RETURN cannot borrow Pickup facts. Known endpoint IANA zones determine relative date state; Floating calendar fallback is display-only, not instant/NOW/TTR qualification.

Minimal host seams: P4 Open/Insert callbacks on existing `coreExperienceRenderer`, a P4 route branch in `TripScreen`, P4 local row slot and two focus-family whitelist additions. No Day Shell/scroll/date-navigation/bar implementation changed. No Repository, Core, queue, migration, Auth, Backend, Supabase or Source/Admission changes.

### Actual acceptance

- Eight directed suites69PASS: P4 Editor/Repository, rental render matrix, Core row/callback adapter, actor-scoped detail read, shared Calendar and unchanged P1/preview regression. TS/UI guard/scoped lint/diff checks PASS. Independent5suite39PASS; stale selection, sparse Return and cross-device-midnight findings closed. Last Floating display refinement additionally covered by the69test run.
- C0 R17 normal native route: saved Rental survived prior process cold start; Edit read title/dates/clocks/two locations. Saved actual model `AA Car` and six-line Notes; Details reread immediately showed actual identity plus original name and exact Notes. Real software keyboard settled with the last caret and full Notes above it. Screenshot `notes-software-keyboard.png` under task output `native-p4-20261026/`.
- Physical Forms QA R18 installed over the existing independent bundle; normal session and existing Trip/P1/P2/P3 retained. Normal Create `P4PhoneQA`, Oct26→28, explicit time picker Done23:19/23:22, real Apple Maps result→pickup address, manual `Nelson` return→Header Save. Real Day shows P2 12:00→P3 17:19→P1 22:00→P4 23:19; P4 Today Focus and native Back/Edit Immersive observed. Edit reads original fields. Cancel→Discard test preserved saved `P4PhoneQA`; IME test edit was not saved. Phone Edit mutation/cold restoration still pending; C0 mutation refresh is separately verified.
- R18 simulator and physical builds succeeded. Phone screenshots: `phone-create-valid.png`, `phone-real-browse.png`, `phone-real-focus.png`, `phone-real-immersive.png` in the same task output folder. Test data remains isolated and retained.

### Explicit remaining work

Full frozen-fixture nine-state Native screenshot/interaction and EN/ZH/Light/Dark matrix remains **PENDING**. Render-matrix tests and real Today screenshots do not certify all frozen-fixture states. Frozen P4 JSON is now byte-preserved in the DEV-only adapter, sharing the existing P2/P3 QA host and actual RentalContent. Source synthetic photos remain labeled synthetic layouts, not real photos or a hero provider. Existing generic Rental Lab fixture is not claimed equivalent to the supplied package. Return/Future/Past native visual comparison, same-day native interaction, long-content/accessibility, real Ledger prefill and final physical cold/edit checks remain open. Contact/Instructions Save, Scan/Update from Document, original/Photo/Item-expense-link capabilities and Cloud remain owning-port pending. Do not mark full P4 or Cloud DONE.


## Frozen fixture adapter candidate

DEV route `otrmobile://day-feed-lab?fidelity=p4&scenario=full&clock=today&depth=B&role=PICKUP` reuses the existing QA host and native detail stack. Nine frozen variants, Future/Today/Past × Browse/Focus/Immersive, independent pickup/return, explicit multi-vehicle IDs, original selectors and labeled synthetic media/expense previews are wired. These read-only preview actions never reach Repository, Admission or real Ledger mutations. Release route redirects before importing the adapter. Real Trip routes continue using Repository facts only.

Independent Review caught RETURN boundary ownership and multi-vehicle selection, then a default-role Focus regression; all repaired with composed-row/renderer regression. Seven scoped suites54PASS include actual Core renderer/Form/Details and adjacent P2/P3 fixture regression. TypeScript and scoped ESLint PASS; UI guard PASS after final scope unchanged. R20 simulator build succeeded. No screenshot PASS is inferred from unit tests.


## Native frozen observations / focused visual repair (27Oct)

C0 R20 normal Safari→own-app deep link: Future/Today/Past × B/F/I screenshots saved in the task output `native-p4-20261026/`; independent Return/Past Focus also observed at Jan20 17:00. Browse→Focus→native Details→Back works; single Pickup instruction opened the retained synthetic text and closed back to Focus. Past Browse omits place; Past Focus omits maps/Call/+; Past I shows at most3 labeled synthetic photos. This is **PARTIAL_NATIVE_OBSERVED**, not full Vision PASS. The `future-immersive-repeat.png` is a duplicate top view, not bottom evidence. Long-detail wheel/drag input did not move the viewport; scrolling/bottom reachability remains unresolved. Existing QA host shows a duplicate native/custom date title on some initial views; no global Shell rewrite performed.

Independent comparison with the frozen final reference found active Browse missing endpoint name, Past Focus counts rendered as body text, and Immersive contact/link/class-label differences. Focused P4 repair now combines supplied endpoint name+address, reuses P1 fact-tag capsules, left-aligns original links with shared document styles, groups supplied contact text separately, and labels booked class. P4 glyph accessibility labels now say Call/Rental details; P1/P3 defaults are unchanged. No real missing contact data or authority is fabricated. Independent2suite22PASS, scoped4suite30PASS, TS/UIguard/lint/diff PASS; R21 simulator build succeeded. **Post-repair Native visual recheck remains pending.**


## Latest verified candidate — R21 / 2e0e4a34

Independent post-repair Vision checked `r21-future-browse.png`, `r21-past-focus.png`, `r21-today-immersive-call.png`, `r21-today-immersive-bottom.png`: the four content findings are closed, with no new visible blocker in those views. Contact remains source-supplied, original links left aligned, counts canonical capsules, and supplied Ledger/Note/four action cards fully visible, Link-before-Add. This four-image review does not certify every variant/theme/context.

Long-detail scrolling is **resolved**: Device Hub must receive `Raise` before coordinate drag; then the native ScrollView reaches the final actions normally. Earlier no-motion input was a test-window activation issue, not evidence of a product ScrollView fault. Duplicate native/custom date in the DEV QA host is still recorded; production Day Shell was not changed.

R21 C0 normal cold launch→own Trip→real Day→P4 native Details restores `AA Car`, original `FormsQAP4Local`, both endpoint clocks/places and exact six-line Notes. `sim-cold-edit-readback.png` records the actual Reader path, separate from fixture proofs. R21 physical build/install preserves the independent app/session/data; cold Create readback restores `P4PhoneQA`, Oct26→28 and original23:19/23:22. Normal Edit changes only pickup23:19→23:20; Done→Header Save→same Item Details immediately displays23:20. `phone-edit-save-refresh.png` records it. Add expense opens the existing Ledger with name `P4PhoneQA`, Oct26, Trip parameter; `phone-expense-prefill.png` records name/date. Cancel saves no Expense and returns to the existing Ledger exit destination MyTrips; origin-preserving Ledger return is not implemented here. Phone post-edit process-cold persistence remains separately untested; C0 Edit process-cold persistence is verified.

### Delivery level / remaining minimum

- **LOCAL_PASS**: manual Create/Edit/Cancel/read refresh on independent C0/Phone, C0 post-edit cold recovery, software keyboard Notes, existing repository/queue tests. Not a Cloud or full sync L2 claim.
- Nine-state content and frozen9variants are implemented; Native9 context/depth observations and four-image post-repair Vision are bounded evidence. Full30-case package, all variants/Return permutations, EN/ZH × Light/Dark and large text remain a finishing matrix, not marked complete.
- Contact/Instructions persistence, Scan/Update from Document, authorized original/media/holder/driver/association/Item-expense-link and billing evidence remain owning-port pending. Cloud disabled; no Source/Admission/Backend/schema/Auth mutation.
- Fixed sequence: Form `dac7c312` → real content/Details `ca9a1fbb` → frozen QA adapter `860af795` → visual repair `2e0e4a34`. Preserve all before serial integration; no main merge performed. P1–P3 candidate history is retained.
- GUI returned explicitly to Universal after testing. C0 remains read-only P4 fixture Details; Phone MyTrips; no unsaved form, no AD5 operation.
