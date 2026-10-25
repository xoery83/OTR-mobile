# Native UI details — fixed integration candidate, 26 October 2026

Source commit: `d0ae8f14`, branch `codex/native-forms-p3-delivery`. Presentation changes only; no merge into main or Universal has been performed.

## Delivered

- Edit Trip destination chips use the compact feed-tag typography, without reorder arrows; removal retains a 44pt target. Existing destination order/identity and normal Apple completion remain intact. Empty status card is omitted unless saved/error feedback exists.
- Travel Dates picker title omits optional; form caption remains optional. Today has a gray unselected mark and darker green selected mark. P3 Stay Create/Edit already uses this same TripCalendarRangeField with its Trip reference range; no duplicate picker.
- Start Trip and Add to this trip use the background sheet surface through the existing SheetHeader. Action cards remain surface-colored.
- Import composer keeps its glass rounded clipping and separate outer shadow; bare input is transparent. Context picker contains Trips only, retaining the header Close return. Three help rows have decorative bullets; email/AI keep their existing actions and now use underlined accent link styling.
- Real Day titles now share the existing appearance-date calculation with their backgrounds: view zone when known, otherwise device civil date for decoration. Today is solid accent with large title; Tomorrow uses accent-surface fill, accent outline/bindings/number and title. No Core clock, Reader context, NOW eligibility or stored date is inferred from that fallback.

## Validation

- 146 tests in nine affected suites PASS; P3StayEditor 16/16 PASS (162 total).
- TypeScript, UI guard (145 representative files), scoped ESLint and git diff --check PASS.
- Independent review: first scoped UI review found a compact-chip hit-target issue, fixed before commit. Follow-up Day-header review found no defects; independent four-file 81/81 PASS.
- Forms QA normal real Trip: compact Edit Trip chip, no empty card, unchanged disabled Save, Travel dates title and selected Today tint observed. Calendar Cancel and Edit Cancel preserve the draft/data.
- Real Day Today/Tomorrow confirmed in Light and Dark; normal date navigation retained the viewport range top title. Import composer glass corners, all bullets and underlined email/AI links observed; target picker has only the two existing QA Trips and header Close returns to composer. Add to this trip gray header/body observed. Start Trip shares the same checked header surface seam; no separate Native Start Trip screenshot or complete multilingual/Dynamic-Type matrix was taken in this repair.
- No Import Submit, file/provider execution or new business write was performed for these presentation checks. No Cloud E2E claim. AD5 untouched.

Evidence directory: `/Users/xoery/.codex/visualizations/2026/10/25/01a17101-8b2d-7240-ab67-f4c34a5d90d9/native-day-fidelity/ui-details-20261026/`. Today/Tomorrow Light/Dark, Edit Trip and shared Calendar PNGs are retained there; Import appearance was also observed through Device Hub.

## Required cumulative integration checklist

Do not cherry-pick this detail commit alone and assume the whole Native lane is delivered. Preserve the dependency-ordered Native lane source from baseline `cdd9d2717ef4c5ddd682beeb26f7115e66faff59` through `d0ae8f14`; reconcile overlapping files with the owning writer serially. This is a source candidate range, not permission to bulk-merge an unvalidated branch.

- P3 fixed Form candidate: `6242fe71`, `5a6176db`, `da17ad4a`, `a3168d3c`, `cab1fbbb`; preserve associated acceptance records. Only two optional Stay times.
- Day Shell/P1 fidelity ancestors starting `ff8d62ff`, viewport `3c5e0db9`, native transitions `4c98488e`/`52929ec0`, actual Core adapter `062741f4`; retain the intervening corrections and reports.
- P2 read-only/manual Form and airport/IANA zone source `4cb4a94c` through `29c04bcc`, including `3dbdce11`, `3090cc8e`, `397c5dd3`. Preserve existing Cloud/lookup gates and DST qualification limits.
- P1 interaction corrections through `3098718e` and `234403cf`; directional insertion defaults `09a71ee8`; real Reader/Form integration `2b443bb4`; real civil move/display/background repairs `7fc06c61`. Prior real continuous Native drag/Confirm acceptance remains pending; this UI repair does not upgrade it.
- **Include `d0ae8f14`** for all seven Trip/Import presentation details plus real Today/Tomorrow. Owning files: SheetHeader, StartTripSheet, TripQuickAddMenu, CaptureComposer, CreateTripDestinations, TripBasicEditor, TripCalendarRangeField, DayFeedFidelityHeading, TripScreen and catalogs, with their tests.
- Keep Import Source/Task/Review/Admission/Save, Backend, Auth and shared data authority on their current owning implementation. Apply the CaptureComposer presentation diff to that writer’s current version; preserve all later business handlers. Never overwrite active Universal files wholesale.
- Exclude private `.forms-qa/`, credentials, QA account/Trip/Item identifiers, simulator data, node_modules link and generated build outputs from integration.

Next serial integration acceptance: replay normal CreateTrip → real Day → Create/Edit P1, verify the seven presentation details and Today/Tomorrow, then obtain actual Native continuous drag/Confirm/cold read evidence separately. Main integration remains pending the owning serial integration window.

## Follow-up scroll visibility candidate

**Also include `797f959b`** after d0ae8f14: real Day Menu/Search and entire bottom row consume the existing scoped chrome state; forward reading stays hidden after release, reverse restores, native date control remains. Exact six-file diff and baseline-test exception are recorded in [scroll chrome repair](SCROLL_CHROME_REPAIR_20261026.md). TripRoute/ExperienceBottomShell are minimal serial shared-UI integration changes; preserve the current owning navigation structure and later changes.

**Required release follow-up `31af6637`** after797f959b: useP1Move host must ignore idle touchEnd/touchCancel, otherwise ordinary feed release invokes real move-finish force-show. Added regression proves idle callbacks never restore chrome and actual release notifies only once. Include this even if the shared Route/Shell source changes are applied manually.

**Also retain `dbc93d61`**: transparent reading stage with the existing native-material rounded date filter, native bar hidden during reading, measured list boundary retained through header-height zero, and reverse restoration. Only TripScreen plus tests; no global navigation rewrite or separate calendar.

**Also retain `9d469eaf`**: shared Trip/P3 Calendar marks Today with background only, removing its visible Today caption so day numbers align. Existing gray/green tint and VoiceOver Today hint remain. Forms QA selected-range Today alignment observed;29Calendar/P3 tests and UIguard/scopedlint/diff check PASS. No date selection or Save performed for visual verification.
