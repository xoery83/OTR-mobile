# DL1 Day Feed Lab acceptance report

2026-10-12 · Experience / Day Feed G2 · isolated Owner review candidate.

## Source and preservation

Branch `codex/day-feed-lab-dl1`; worktree
`/private/tmp/otr-day-feed-lab-dl1-20261012`; base `6af3aff1fbfb136b087512589aa94b2c9d4640fc`.
Local main, origin/main and read-only remote main matched that base at preflight.
Accepted G2 integration `6dc3e04` is in ancestry. Accepted integration report and
Owner Lab plan were read before implementation. No merge, push or deployment.

The chat checkout at `c457174` and canonical main had concurrent dirty work and
were not used for edits. Core `fb8dbc9`, Flight AB `5544ba0`, Flexible `6af3aff`,
TTR `a45a5c6` and G2 `6dc3e04` worktrees were inspected read-only. Flexible's
untracked native Gallery and TTR's untracked port report were preserved.
Legacy Web was not opened. No Hosted/Production/provider operation was made.

## Changed-file manifest

- `app/day-feed-lab.tsx` — Release redirect before loading the Debug shell.
- `app/_layout.tsx` — Debug Lab title in the existing native Stack.
- `src/features/day-feed/TripScreen.tsx` — Debug-only Lab entry.
- `src/features/day-feed/DayFeed.tsx` — optional deterministic instant input;
  production minute clock/default behavior retained; native Immersive safe-area inset.
- `src/features/day-feed-lab/DayFeedLabScreen.tsx` — shared shell, canonical
  Trip/date controls, Fixture diagnostics and the production Feed.
- `src/features/day-feed-lab/fixtureCatalog.ts` — five version1 synthetic Day
  projections, stable IDs/dates/order/nulls, runtime-localized fixture titles.
- `src/features/day-feed-lab/fixtureCatalog.test.ts` — integrity, selection,
  contribution, identity, TNS, missing fields, composition and Release isolation.
- `src/features/day-feed/render.test.ts` — two actual shell interaction tests
  using the established production render harness; Focus/Immersive/scroll retention.
- `src/ui/catalogs.ts` — English/Chinese shell and fixture messages.
- `scripts/ui/guard.ts` — strict Lab route/screen representative roots.
- `docs/PRODUCT.md` — Owner-authorized temporary DL1 scope.
- `docs/CURRENT_IMPLEMENTATION_STATE.md` — isolated checkpoint handoff.
- `docs/architecture/OTR_DAY_FEED_LAB_DL1.md` — usage, boundary and owning ports.
- `docs/architecture/OTR_DAY_FEED_LAB_DL1_REPORT.md` — this report.

- `docs/qa/day-feed-lab-dl1/` — eight synthetic-only native screenshots and
  acceptance JSON including64 empty Trip-table readbacks.

No schema, migration, repository, auth, sync, backend, provider, native target,
dependency version or lockfile change. Generated native files remain ignored.

## Usage and fixture coverage

Debug app: Trip → Day Feed Lab; direct `otrmobile://day-feed-lab` is also supported.
Choose Test Trip; use Previous/Next or scroll the date strip and select a date.
Dates are bounded to 2027-01-15 through2027-01-17; NOW is fixed at2027-01-15T12:00Z,
shown in diagnostics. Fixtures explicitly use UTC; geographic titles do not assert
local timezone facts. Trip changes reset to the first date; date changes reset
Feed depth/scroll. Focus/Immersive transitions keep the selected context mounted.

| Scenario            | Executable DL1 coverage                                                |
| ------------------- | ---------------------------------------------------------------------- |
| Nelson Hiking       | Multi-day P1, active span NOW, enough rows for nonzero scrolling       |
| Faroe Islands       | Mixed P1/P2, date-only P1, multiple days                               |
| Europe Multi-city   | P2 Flight, P1 city visit, departure with unknown arrival               |
| Urban Weekend       | P1 museum/dining/park, timed and date-only                             |
| Empty / Sparse Trip | Empty first/third days, date-only P1/Flight, missing location/services |

P3–P6/train/ferry/Stay/Rental/Ticket, Flexible and TTR capabilities are explicitly
future ports, not fabricated rows. `getFixtureCatalog()` supplies projections;
`selectLabContext()` validates bounded selection and accepts contributed catalogs.
No persistence or canonical admission occurs. UI receives only synthetic data.

## Validation and baseline comparison

- Focused relevant regressions:12 files/138 tests PASS.
- Full exact clean-main:3704 PASS/2 FAIL/20 skipped.
- Full DL1:3711 PASS/2 FAIL/20 skipped; all7 added tests pass. Failure identities
  match exactly: existing navigationLayout tab-wrapper assertion and existing
  architectureBoundary scan of LocalOperationsDiagnostics test infrastructure.
  No full-suite PASS claim. Comparison JSON and both reports retained below.
- Typecheck, full lint/UI guard, touched Prettier and whitespace PASS. UI guard:
  original473 legacy occurrences;88 representative files; no new baseline exception.
- Actual Release iOS Hermes export PASS. Metro retains fixture module bytes;
  Release route runtime test returns `/trip` and Debug entry/title guards close
  access. No bundle-code elimination claim and no Release native installation.
- Existing production P1/P2 geometry, NOW ticks, Focus dismissal, missing facts,
  Android return fallback and scroll restore continue passing. New shell tests
  exercise Trip/date switching and320pt Immersive return in Light/Dark mocks.

Evidence: `/private/tmp/otr-dl1-baseline.json`, `otr-dl1-full.json`,
`otr-dl1-baseline-comparison.json`, `otr-dl1-final-regressions.log`,
`otr-dl1-final-typecheck.log`, `otr-dl1-final-lint.log`,
`otr-dl1-final-format.log`, `otr-dl1-release-export.log` under the same tmp root.

## Native execution evidence

Xcode27.0/27A266a; SDK/runtime iOS27.0. Task-owned iPhone18 Pro Simulator
`AE11480D-B6B9-402B-BE8A-4F2BBD4D0704`, named OTR Day Feed Lab DL1.
Existing reserved devices/app containers were not installed over or cleared.
Copied existing OTRMobile target, Debug, DEV Test bundle
`com.xoery.otrmobile.devtest`, isolated DerivedData `/private/tmp/otr-dl1-derived`.
No real session, credentials or account was supplied.

The reused native cache first lacked generated ExpoSQLite sources and had stale
codegen references. Task-local regeneration used already-installed versions.
The resulting Debug build succeeded and installed/launched on the fresh Simulator.
Its initial launch failed the SDK27 UIScene lifecycle requirement because the old
ignored project lacked the repository's accepted Scene configuration. The isolated
iOS project was then regenerated from unchanged tracked Expo config (including
`enableSceneSupport`); this is a native-cache repair, not a product config change.

The final regenerated Scene-configured Debug build succeeded and installed/launched.
After Owner Mac unlock, restarting only the DL1 Metro server cleared the stale
resolver cache from native-cache repair. All scoped DL1 native checks now PASS.
No auth/security bypass or real session was added. Existing Simulator and
physical-device app containers were preserved.

Native testing exposed the production Immersive ScrollView's first row under the
status bar. `contentInsetAdjustmentBehavior="automatic"` fixes it through native
safe-area handling without fixed offsets or duplicated chrome. P1/P2 Immersive
and nonzero underlying scroll/selected Focus return were rechecked successfully.
Focused Feed/Lab56 tests, typecheck, full lint/UI guard and full regression
3711 PASS/same2 baseline FAIL/20 skipped were rerun after this correction.

| P1/P2 behavior                                           | Source/render tests    | Native Simulator                                     |
| -------------------------------------------------------- | ---------------------- | ---------------------------------------------------- |
| Five fixture scenarios and bounded Trip/date selection   | PASS                   | PASS                                                 |
| P1/P2 Browse, NOW and future-date suppression            | PASS                   | PASS                                                 |
| TNS/date-only and missing time/location/arrival omission | PASS                   | PASS                                                 |
| P1/P2 Focus selection and explicit dismissal             | PASS                   | PASS                                                 |
| P1/P2 Immersive and retained Trip/date/Focus             | PASS                   | PASS                                                 |
| Nonzero P1 scroll return, same first-visible row         | PASS (320pt harness)   | PASS (visual before/after)                           |
| Light/Dark shell and Immersive                           | PASS                   | PASS                                                 |
| Enlarged production-row fallback                         | PASS (mocks)           | NOT RUN                                              |
| Trip → Debug Lab button → native Back                    | Guard/regressions PASS | PASS with no-session Trip state                      |
| Fixture persistence isolation                            | PASS                   | All64 Trip tables still0 rows, read-only after tests |

Committed evidence under `docs/qa/day-feed-lab-dl1/`:
`lab-light.png`, `trip-dev-entry.png`, `europe-dark.png`,
`flight-immersive-dark.png`, `p1-immersive.png`, `nelson-scroll-before.png`,
`nelson-scroll-return.png`, `sparse-date-only.png`, and `acceptance.json`.
Only synthetic app pixels are included. No Mac/Device Hub screenshot, real
account, credentials or private originals are committed. Empty native Trip-table
readback proves no fixture rows persisted; it does not certify real-data permissions.

Local evidence: `/private/tmp/otr-dl1-native-build-regenerated.log`,
`otr-dl1-launch.log`, `otr-dl1-prebuild.log`, `otr-dl1-native-scene-build.log`,
`otr-dl1-metro-final.log`, `otr-dl1-final-full.json`,
`otr-dl1-native-final-typecheck.log`, `otr-dl1-native-final-lint.log`.

To run this exact source/artifact, start
`npx expo start --dev-client --localhost --port 8091` from this worktree; then
launch the DEV Test app on its task-owned Simulator with
`xcrun simctl launch AE11480D-B6B9-402B-BE8A-4F2BBD4D0704 com.xoery.otrmobile.devtest -RCT_jsLocation localhost:8091`.
Open Trip → Day Feed Lab or `otrmobile://day-feed-lab`. Debug requires Metro.
Rebuilding should regenerate the ignored native project from accepted Scene
config in an isolated checkout with DEV Test bundle identity. Do not reuse stale
native caches or install over reserved Simulator/account/container data.

**Fixture PASS · Simulator PASS.** Physical Device, Core DEV Read, Capture E2E,
real authenticated Trip data and native Dynamic Type/VoiceOver: NOT RUN.
No unresolved DL1 blocker. Owner product review remains the next checkpoint.

**STOP — DL1 DAY FEED LAB READY / OWNER REVIEW.**

## Next boundary

P3–P6 projections/renderers, Flexible explicit affiliations/Choices and qualified
`ttr-presentation/1` plug into the documented existing production boundaries.
Experience/G2 owns this single shell and final Composer integration; each owning
workstream retains its data/authority/rendering gate. Recommended DL2: approved
actor-scoped Core v2 read integration through the same Feed, read-only first.
DEV Data/Seed/canonical writes, provider activation, physical device acceptance,
main integration and Production deployment need their separate scope/gates.
