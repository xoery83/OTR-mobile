# CP-G2-TTR-01 — synthetic Transition consumer / Owner Review

2026-10-13 · isolated branch `codex/g2-ttr-01-synthetic` · **synthetic Lab only**.

## Source and boundary

- Preflight canonical local main: `1114cccb536d6a6920c0ba6c6434b5dfe6ace5c9` (accepted G2-FLEX-01); `origin/main` was `9ca16d380b4ed7f8aedeff79d8fc7be903dda1b1`. Postflight local and remote main advanced concurrently to descendant `b4ddd27d2352350b6d16617543d0f17a715dc077` for PDF Source work. That advance changes no G2 Day Feed/Lab/UI source, but it does update `docs/CURRENT_IMPLEMENTATION_STATE.md`; an eventual integration must reconcile that handoff. The concurrent main dirty/untracked notes were preserved.
- Accepted TTR CP04A1: `a45a5c6b4f63015f220fff03ac1933ed8abdad09`. CP04B1 feature branch `codex/ttr04b1-lab-fixtures`: `b909a86df227e1e9ade14529f7490c5b87401047` on `eb4c8eb`, with common ancestor `741579c` against CP04A1. The seven adopted source/config files compare byte-for-byte with CP04B1; its report and unrelated branch files were not copied.
- Flexible CP01B worktree remained at `eb4c8eb` with an untracked report and no shared-file edits when checked. No merge, push, Core, Provider, MapKit, migration, SQLite, Supabase, Admission, Sync or production TTR activation.

## Exact shared API and behavior

`getLabFixtures()` registers the 14 accepted `day-feed-lab/1` TTR contributions after the seven existing DL1/P3/Flexible entries, with localized chooser names. The full owning `ttr-presentation/1` object remains the input; no second qualifier or Gallery projection was introduced.

`TransitionProjection` adds optional read-only `inputFingerprint` and `route.status` to its existing structural subset. `composeDayStream()` still owns placement and returns a row Transition with stable relation `key`, `inputFingerprint`, `visibility`, `mode`, `modeOrigin`, `routeStatus`, optional LOCAL_GEOMETRY distance, `suppressConnector`, and the accepted `openTtr` action. It rejects invalid route status and withholds placement when either event anchor is nested in a versioned Flexible Block; visual nesting never creates a relation. Existing same-day adjacent EVENT-anchor and scope/version/action checks remain in force.

Production `DayFeed` renders `TransitionRow` before the destination Item. It labels geometric kilometers explicitly as straight-line distance, distinguishes no mode, user-selected and suggested mode, and displays MISSING/PENDING/AVAILABLE/FAILED without route metrics or invented ETA. NOW appears before the Transition while only its connector is suppressed. The optional `DayFeed.onOpenTtr(intent, {key, inputFingerprint})` emits the owning identity/publication version plus current input fingerprint. The Lab's DEV-only inert sheet dispatches only after the current fixture selection instance, Account/Trip/generation, relation identity, publication version, fingerprint, qualification and visibility match via CP04B1's `acceptsTtrLabIntent` oracle. The sheet makes no route request and leaves the Feed mounted.

## All 14 registration and composition results

All 14 are registered once, with unique synthetic Trip IDs and chooser titles. `fixtureRegistration.test.ts` and the accepted CP04B1 tests compose each through the single G2 Composer.

| Case                  | Composed row | Presentation                               | Route status | Native observation              |
| --------------------- | ------------ | ------------------------------------------ | ------------ | ------------------------------- |
| STRAIGHT_LINE         | 1            | Straight-line, no mode                     | MISSING      | Visible, tapped                 |
| WALKING_NO_ETA        | 1            | Walking, no ETA                            | MISSING      | Visible                         |
| DRIVING_PENDING       | 1            | Driving retained                           | PENDING      | Visible                         |
| TRANSIT_FAILED        | 1            | Transit retained                           | FAILED       | Visible                         |
| NOW_COLLISION         | 1            | Straight-line, connector suppressed        | MISSING      | NOW and tap retained            |
| PAST                  | 0            | HIDDEN                                     | MISSING      | No Transition                   |
| UNKNOWN_CONTINUITY    | 0            | UNQUALIFIED                                | MISSING      | Chooser available; fixture test |
| MISSING_ENDPOINT      | 0            | UNQUALIFIED                                | MISSING      | Chooser available; fixture test |
| TEXT_ONLY_ENDPOINT    | 0            | UNQUALIFIED                                | MISSING      | No Transition                   |
| REPEATED_OCCURRENCE   | 1            | Current stable discriminator               | MISSING      | Chooser available; fixture test |
| LOCATION_EDIT         | 1            | Walking retained, result invalidated       | MISSING      | Chooser available; fixture test |
| REVERSED_RELATION     | 1            | New ordered identity, no carried mode      | MISSING      | Visible                         |
| EXTERNAL_MAPS_NO_MODE | 1            | Straight-line, no mode                     | MISSING      | Chooser available; fixture test |
| STALE_OPEN_TTR        | 1            | Current action only; captured old rejected | MISSING      | Chooser available; fixture test |

`SUGGESTED_MODE` has a focused renderer regression. `AVAILABLE` is covered by a synthetic permitted projection in render/contract tests. The accepted chooser contributions deliberately deny result display permission, so neither state is claimed as a native scenario or Apple route result.

## Validation

- Focused final run: seven suites / **155 passed** (owning TTR domain, CP04B1 fixtures, registration/catalog/contribution, G2 composition, production DayFeed rendering, Lab sheet interaction and A→B→A queued-tap rejection). Typecheck, full lint/UI guard, and changed-file Prettier pass. UI guard reports 473 pre-existing legacy occurrences / 90 representative UI files.
- Full regression: 287 files / 3,870 passed, 23 skipped, 3 failed. Two failures exactly reproduce on a clean `1114ccc` worktree: `navigationLayout.test.ts` tab option assertion and `architectureBoundary.test.ts` scanning the unchanged `LocalOperationsDiagnostics.test.ts` mock import. The third was an unrelated five-second timeout in `captureAutonomousQa.test.ts` during the parallel full run; its isolated rerun passed 2/2. The changed TTR paths introduce no direct infrastructure import. Release Lab route remains guarded by `if (!__DEV__) return <Redirect ...>`; its isolation regression passes.
- Native: dedicated iOS 27 iPhone 18 Pro Simulator `1D01B9F0-6591-4C15-A4CD-43E86E86AA13`, new container, Debug build and Metro 8097. Actual chooser listed all 14. Straight-line 111.2 km had no mode or ETA; walking had no ETA; driving PENDING and transit FAILED retained mode/distance. NOW + Transition coexisted and the control opened an inert identity/version sheet. Dismissal retained Trip/date/NOW and Item Focus. Dark appearance rendered correctly. P1 nonzero scroll returned to focused stop 7 after Immersive; P2 Flight/date-only Item, P3 Stay, and Flexible rows/Choices rendered in the same Lab. Core DEV Read was unavailable without a local accepted session and was not substituted.

Screenshots: [straight-line light](evidence/g2-ttr-01/straight-line-light.png), [walking light](evidence/g2-ttr-01/walking-no-eta-light.png), [pending light](evidence/g2-ttr-01/pending-light.png), [failed light](evidence/g2-ttr-01/failed-light.png), [NOW light](evidence/g2-ttr-01/now-collision-light.png), [NOW dark with Focus](evidence/g2-ttr-01/now-collision-dark-focus.png), [intent sheet](evidence/g2-ttr-01/intent-sheet-light.png), [nonzero scroll return](evidence/g2-ttr-01/scroll-return-dark.png).

## Changed-file manifest

Adopted unchanged from CP04B1: `scripts/ttr/tsconfig.json`; `src/domain/trip/{ttr.ts,ttrState.ts,ttr.test.ts,__fixtures__/ttr.ts}`; `src/features/ttr/{labFixtures.ts,labFixtures.test.ts}`.

G2 consumer: `src/features/day-feed/{composition.ts,composition.test.ts,DayFeed.tsx,TransitionRow.tsx,render.test.ts}`; `src/features/day-feed-lab/{fixtureRegistration.ts,fixtureRegistration.test.ts,DayFeedLabScreen.tsx}`; `src/ui/catalogs.ts`.

Documentation/evidence: this report, `docs/CURRENT_IMPLEMENTATION_STATE.md`, and the eight PNGs above. Generated `ios/`, Pods, dependencies and build output are ignored and not committed.

## Resumption and gates

CP04B1 can resume visual refinement against these 14 shared Lab cases and the optional `onOpenTtr` seam after Owner review. The next production dependency is Core's authoritative occurrence/continuity/endpoint/applicability input and a TTR-owned controller/personal choice lifecycle; G2's same-day EVENT-only placement must then be revisited against accepted Core row anchors. Core, Apple/Provider and production gates remain **CLOSED**. Stop here for Owner Review; no merge or push.
