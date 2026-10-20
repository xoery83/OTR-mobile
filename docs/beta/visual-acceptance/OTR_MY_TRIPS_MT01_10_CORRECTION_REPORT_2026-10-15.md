# My Trips MT-01–MT-10 correction handoff

Date: 2026-10-15 (Pacific/Auckland). Status: scoped implementation/review passed;
Native UX acceptance pending. MT-10 measured Shell publisher is an integration dependency.

## Identity and scope

- Base: `326000be70014fac6e0bf383b7e86c256c595430`.
- Branch: `experience/correction-01`.
- Worktree: `/private/tmp/otr-experience-correction-01`.
- Owner packet and Blueprint: the two `OTR_MY_TRIPS_*_2026-10-15.md` attachments
  in `/Users/xoery/Downloads`; text governs generated visual references.
- All four requested handoff files exist under
  `/private/tmp/otr-mt01-10-five-file-handoff-20261015`.
  Three patch SHA-256 values and five baseline file hashes match Manifest.
  `reuse-functional.diff` and `full-five.diff` independently pass apply-check on
  exact base files. QA patch is not standalone on base, as expected: its
  TripScreen/Workspace hunks assume functional changes and the separate QA helper.
- No whole historical patch was applied. The only reused functional hunk is the
  measured-height consumer and exact existing `useBottomShellHeight` reader.
  Refresh, Home/Day/Menu, old copy and navigation changes are outside this packet;
  their owning shared Shell/Context prerequisites remain with Coordinator.
- Reference70 overlay and clock/initializer are excluded from production changes.

## Packet disposition

| Item  | Implemented / preserved                                                                                                                                               | Verification                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| MT-01 | Native title OTR while heading is visible; My Trips after heading exits; reverse at return. One native header, existing Menu/Search.                                  | Actual scroll/layout callbacks tested at threshold 47/48 and return 0. Native pending.                              |
| MT-02 | Existing 240pt minimum hero geometry retained; all Active heroes render.                                                                                              | Two Active fixture coverage.                                                                                        |
| MT-03 | Bottom-anchored semibold title, medium date, smaller regular lower-opacity destination; tighter gaps. Existing gradient, fallback and eligible Today action retained. | Scoped code review; Native pending.                                                                                 |
| MT-04 | Module-specific secondary 13pt medium section-label role with normal tracking.                                                                                        | No global heading restyle.                                                                                          |
| MT-05 | Thumbnail stretches with row height; single clipped outer row radius.                                                                                                 | Scoped structure review; Native pending.                                                                            |
| MT-06 | Semantic 16pt semibold tripRowTitle, two lines; full pressable accessible name.                                                                                       | Long mixed CJK/English fixture.                                                                                     |
| MT-07 | Separate one-line medium date and secondary regular destination; cached-summary caveat preserved.                                                                     | Standard/scaled metadata tests.                                                                                     |
| MT-08 | Truthful original destination string with one-line ellipsis; no invented split/order/count.                                                                           | Data audit below.                                                                                                   |
| MT-09 | Past first 3, localized total-count action only above 3; root Stack push with native Back; full Past FlatList reuses same rows/order/readers.                         | Counts 0/1/3/4/7, Upcoming4/undated4, route selection/stale generation tests. Native push/back restoration pending. |
| MT-10 | Main-list content/indicator inset consumes Coordinator's existing Shell-height context; Past includes bottom safe area and has no tab Shell.                          | Consumer test with 90pt Shell. Actual publisher integration/Native pending.                                         |

MT-08 audit: `Trip.destination` and `TripListSummary.destination` are nullable
strings, not ordered location collections. The discovery repository copies the
summary string without an ordered-place/count producer. Splitting on `/` or `·`
would invent collection meaning. No `+N more` aggregation is added.

MT-11 remains outside this presentation slice. Supplied Reference70 QA overlay
explicitly evaluates the named Reference Trip against 2027-02-06/Asia-Tokyo;
no production lifecycle/date/authority logic was changed.

## Files

- `src/features/day-feed/MyTripsList.tsx`: row/hero presentation, Past preview and
  virtualized full-list mode.
- `src/features/day-feed/TripScreen.tsx`: native title visibility and inset consumer.
- `src/features/day-feed/LocalTripWorkspace.tsx`: Past mode reusing fenced reads.
- `app/past-trips.tsx`: native full-screen push, standard Back, generation-fenced
  shared Trip selection before opening existing Home route.
- `src/ui/visual.ts`, `src/ui/catalogs.ts`, `src/ui/useBottomShellHeight.ts`:
  module-specific semantic roles, EN/ZH copy and handed-off height reader.
- Tests: `MyTripsList.test.ts`, `TripScreen.homeWidgets.test.ts`,
  `PastTripsRoute.test.ts`; this report and current-state handoff.

No schema/API/backend/Auth/RLS/Core/Source/Admission/Ledger/Import changes.

## Validation and independent review

- TypeScript typecheck PASS.
- UI guard PASS: 473 existing legacy occurrences; 109 representative UI files.
- Scoped ESLint and touched-file Prettier PASS.
- Ten focused test files / 73 tests PASS: MyTripsList, PastTripsRoute,
  TripScreen.homeWidgets, LocalTripWorkspace, tripListPresentation,
  tripWorkspaceRoute, tripCovers, ExperienceBottomShell, UI foundation/coverage.
- Independent reviewer `mt_independent_review` initially found missing native
  Header, missing shared selection on Past open, and missing bottom safe area.
  All fixed, route/stale-generation tests added; final scoped re-review PASS,
  no further actionable code findings. Reviewer did not independently run tests
  or establish Native acceptance.
- Tests use `--configLoader runner --no-cache` because shared dependency symlinks
  cannot receive Vite temporary config writes in the sandbox; checks were not weakened.

## Native attempt and remaining integration gate

- Existing Owner A1A/Reference host and Metro8081 were not modified or reloaded.
- New isolated Simulator: `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A`,
  OTR MT Correction 01 QA, iPhone18Pro/iOS27.0. Existing local development binary
  was copied from the installed A1A app into this empty device; no new native build.
- QA source clone: `/private/tmp/otr-mt01-native-qa`, localhost8082. Candidate file
  hashes recorded in `candidate-manifest.json`; QA-only root removes bootstrap/
  operational lifecycle effects, and Workspace reads use explicitly labelled
  in-memory 2Active/4Upcoming/4undated/7Past fixtures. These overlays are not committed.
- Device Hub Configure Bundler was set to localhost8082 and reloaded. Actual
  observed My Trips retained old `Trip` header and unavailable saved-trip message;
  no labelled fixtures appeared. This does not prove consumption of this candidate.
  One cold-restart attempt did not establish a valid candidate observation.
- QA cleanup: localhost8082 Metro stopped; the new Simulator is Shutdown and retained.
  Device Hub returned to A1A selection with Capture Keyboard OFF; no further Native
  interaction is scheduled. Owner A1A still shows the prior Reference list.
- No after screenshot is presented as implementation evidence. Native title
  transition, row crop/contrast, Past push/back/scroll restoration and final-row
  reachability remain NOT VERIFIED. No Native UX Accepted claim.
- Manifest's measured Shell publisher (`ExperienceBottomShell` onLayout plus
  matching tab layout) is absent from this base. Coordinator must join the sealed
  publisher with this consumer and verify actual inset on its final composition.
  No second height controller or Shell/Context redesign was introduced.

Ready for Coordinator integration review; Native UX readiness remains HOLD.
No main merge or push. Stop after this one packet.
