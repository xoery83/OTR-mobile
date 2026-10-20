# CP-G2-TTR-01 — controlled main integration / Owner Review

2026-10-13. Owner-authorized synthetic integration. No push or activation.

## Provenance and concurrency

Normal merge `e716cfa5fef238e99a0dec307fb9a581d582403a`, tree
`61d976b64623dacb3524da60d0b97c43e0ab06bf`, has exact parents:

1. Current canonical main `b4ddd27d2352350b6d16617543d0f17a715dc077`.
2. Reviewed TTR source `aa8753e54330fd4f0b540a586d28f5d0d148179d`, whose parent is `1114cccb536d6a6920c0ba6c6434b5dfe6ace5c9` and reviewed tree is `d01e9dd616716e102723a3f8ae56a19a0a0ca0fa`.

Preflight local/tracking/live remote main all matched `b4ddd27`. G2-FLEX-01
`1114ccc` remains in ancestry. Source commit/branch were not rewritten. All 25
accepted non-handoff files match reviewed source bytes. The only conflict was
`CURRENT_IMPLEMENTATION_STATE.md`; both TTR and PDF Source handoffs were retained
and a short integration heading added. Core/Flight/PDF source remains untouched.
Main's empty index, one dirty report and four untracked entries were inventoried
with hashes and checked again before committing and advancing.

**G2-FLEX-02: not started in the inspected repository/worktrees.** No FLEX-02
branch or shared-file patch exists. Flexible CP01B remains at `1114ccc` with its
untracked dependency report; it is preserved. Its requested snapshot publication
and Pool/Published Focus work is not imported. Subsequent FLEX-02 should start
from this integrated main and preserve TTR registration, optional intent seam,
nested-anchor rejection, NOW and queued-tap fences.

## Regression and static gates

| Run                                              | Passed | Failed | Skipped |
| ------------------------------------------------ | -----: | -----: | ------: |
| Exact clean `b4ddd27` main, full suite           |  3,774 |      3 |      23 |
| Prepared integration, full suite                 |  3,878 |      2 |      23 |
| Focused TTR/DayFeed/Lab/Core Day/capture suite   |    252 |      0 |       0 |
| Clean-main inbound-AI + capture controlled rerun |    145 |      0 |       0 |

The two integrated failures exactly match baseline identities and normalized
full messages: `navigationLayout.test.ts` undefined tab options and
`architectureBoundary.test.ts` scanning the unchanged diagnostics-test sync mock.
Clean main's additional `inboundAiClient.test.ts` STACK_TRACE_ERROR did not occur
in integration and passed its controlled rerun. No new persistent regression.

**Capture timeout recheck:** both tests passed in both full runs. The 50-file
case took 3,316ms on clean main and 3,137ms on integration, below its 5,000ms limit;
it also passed both focused/controlled reruns. No timeout policy was changed.

Typecheck, full lint/UI guard, changed-file Prettier and Git whitespace checks
pass. UI guard retains 473 legacy occurrences / 90 representative files.
The historical current-state document is not globally reformatted. Focused checks
include all 14 TTR projections, mode/route distinctions, stale and A→B→A dispatch,
Flexible nesting/filtering/Focus, P1/P2/P3 depths, TNS, nonzero scroll, Core v1/v2
Day reads and release Lab isolation. Release `__DEV__` entry guard is unchanged.

## TTR fixture matrix

All 14 contributions register once after the six existing scenarios and the
G2-FLEX-01 fixture: 21 unique synthetic Trips. No canonical fixture writes.

| Case                  | Transition count | Expected presentation / route                           |
| --------------------- | ---------------: | ------------------------------------------------------- |
| STRAIGHT_LINE         |                1 | Geometry only / MISSING                                 |
| WALKING_NO_ETA        |                1 | User walking, no ETA / MISSING                          |
| DRIVING_PENDING       |                1 | User driving retained / PENDING                         |
| TRANSIT_FAILED        |                1 | User transit retained / FAILED                          |
| NOW_COLLISION         |                1 | Content/action retained, connector suppressed / MISSING |
| PAST                  |                0 | HIDDEN                                                  |
| UNKNOWN_CONTINUITY    |                0 | UNQUALIFIED                                             |
| MISSING_ENDPOINT      |                0 | UNQUALIFIED                                             |
| TEXT_ONLY_ENDPOINT    |                0 | UNQUALIFIED                                             |
| REPEATED_OCCURRENCE   |                1 | New occurrence discriminator / MISSING                  |
| LOCATION_EDIT         |                1 | Mode retained, result invalidated / MISSING             |
| REVERSED_RELATION     |                1 | New ordered identity, no carried mode / MISSING         |
| EXTERNAL_MAPS_NO_MODE |                1 | Geometry only / MISSING                                 |
| STALE_OPEN_TTR        |                1 | Current action only; old vector rejected / MISSING      |

Suggested mode and synthetic-permitted AVAILABLE are renderer/contract tests;
the accepted 14 native scenarios do not invent additional provider behavior.
Route observations, ETA and route distance never enter the shared row output.

## Native gate

PASS for the integrated JavaScript tree on the task-owned iOS 27 iPhone 18 Pro
Simulator `1D01B9F0-6591-4C15-A4CD-43E86E86AA13`, app
`com.xoery.otrmobile`. Native configuration/modules/dependencies are identical
between the reviewed base and current main, so the prior dedicated Debug binary
was reused without reinstalling or replacing data. The source Metro was stopped;
Metro 8097 started from the integration worktree, the app was relaunched and the
new bundle was observed before validation. No physical/protected device touched.

The shared Lab opened and its chooser listed all 14 cases. Straight-line 111.2km
showed no mode; walking had no ETA; pending driving and failed transit retained
mode/geometry. NOW coexisted with the tappable Transition. The inert sheet exposed
ordered identity/publication facts; closing retained Trip/date/NOW/Item Focus.
Light/Dark passed on the mounted screen. Flexible empty/Choice-only/nested rows,
Choice-to-Item exclusivity, Group filtering and direct Block Immersive passed.
P3 Stay, P2 Flight Focus/Immersive and TNS rendered correctly. P1 returned to the
focused stop 7 at nonzero scroll after Immersive dismissal. TTR's two-row fixture
fits this viewport; native nonzero-scroll evidence is the shared P1 path, while
the TTR sheet retains the mounted Feed. Core DEV Read had no authenticated session.

New screenshots: [straight-line Light](evidence/g2-ttr-01-main/straight-line-light.png),
[inert sheet](evidence/g2-ttr-01-main/intent-light.png),
[NOW Dark with retained Focus](evidence/g2-ttr-01-main/now-dark-focus.png),
[scroll return](evidence/g2-ttr-01-main/scroll-return-dark.png).
Reviewed source screenshots remain unchanged in `evidence/g2-ttr-01/`.

## API, manifest and resumption

Accepted API remains `DayFeed.onOpenTtr(intent, {key, inputFingerprint})`.
The intent retains ordered relation/occurrence and publication version; the Lab
checks current selection instance, Account/Trip/generation, identity/version,
fingerprint, qualification and visibility before opening the DEV-only inert
sheet. DayFeed stays mounted; no second Composer/Focus/Transition insertion path.
Versioned Flexible nested anchors fail closed and do not infer continuity.

The merge retains the exact reviewed 26-file manifest, with adaptation only to
its handoff. This report and four new screenshots add five evidence paths.
Exact 31 paths versus preflight main:

```text
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/architecture/OTR_G2_TTR_01_MAIN_INTEGRATION_REPORT.md
docs/architecture/OTR_G2_TTR_01_SYNTHETIC_CONSUMER_REPORT.md
docs/architecture/evidence/g2-ttr-01-main/intent-light.png
docs/architecture/evidence/g2-ttr-01-main/now-dark-focus.png
docs/architecture/evidence/g2-ttr-01-main/scroll-return-dark.png
docs/architecture/evidence/g2-ttr-01-main/straight-line-light.png
docs/architecture/evidence/g2-ttr-01/failed-light.png
docs/architecture/evidence/g2-ttr-01/intent-sheet-light.png
docs/architecture/evidence/g2-ttr-01/now-collision-dark-focus.png
docs/architecture/evidence/g2-ttr-01/now-collision-light.png
docs/architecture/evidence/g2-ttr-01/pending-light.png
docs/architecture/evidence/g2-ttr-01/scroll-return-dark.png
docs/architecture/evidence/g2-ttr-01/straight-line-light.png
docs/architecture/evidence/g2-ttr-01/walking-no-eta-light.png
scripts/ttr/tsconfig.json
src/domain/trip/__fixtures__/ttr.ts
src/domain/trip/ttr.test.ts
src/domain/trip/ttr.ts
src/domain/trip/ttrState.ts
src/features/day-feed-lab/DayFeedLabScreen.tsx
src/features/day-feed-lab/fixtureRegistration.test.ts
src/features/day-feed-lab/fixtureRegistration.ts
src/features/day-feed/DayFeed.tsx
src/features/day-feed/TransitionRow.tsx
src/features/day-feed/composition.test.ts
src/features/day-feed/composition.ts
src/features/day-feed/render.test.ts
src/features/ttr/labFixtures.test.ts
src/features/ttr/labFixtures.ts
src/ui/catalogs.ts
```

Core authoritative occurrence/continuity/applicability/role-endpoint input remains
required for real routing. The same-day EVENT-only synthetic placement limitation
remains. Apple licensing, MapKit/Provider, personal persistence, production TTR
controller and Hosted/production gates stay **CLOSED**.

Recommended next checkpoint: Owner Review, then G2-FLEX-02 snapshot/Focus port
alignment on the new accepted main; CP01B resumes only after those shared
dependencies are accepted. Stop after guarded local-main advance; no push.
