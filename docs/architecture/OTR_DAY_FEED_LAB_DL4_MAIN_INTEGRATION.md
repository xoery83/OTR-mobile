# DL4 controlled local-main integration

2026-10-12. Owner accepted `e984ed1bb377518c855af76f0cd9fd6366a73b58`
from `codex/day-feed-lab-dl4`. The verified local main was
`40c5d29a9f3d6232003393af1ae516a339a46b56`; the accepted commit is its
direct child. G2 `6dc3e04` and the DL2 integration `40c5d29` remain ancestors.
Remote `main` was read-only verified at `0379453` before integration. No remote
push or deployment is part of this checkpoint.

The accepted source changed exactly 26 paths, verified by
`git diff --name-status 40c5d29..e984ed1`:

```text
M docs/CURRENT_IMPLEMENTATION_STATE.md
M docs/PRODUCT.md
A docs/adr/2026-10-12-day-feed-lab-shared-experience-port.md
A docs/architecture/OTR_DAY_FEED_LAB_DL4_PORT.md
A docs/architecture/OTR_DAY_FEED_LAB_DL4_REPORT.md
A docs/architecture/OTR_DAY_FEED_LAB_INTEGRATION_GUIDE.md
A docs/qa/day-feed-lab-dl4/01-p3-base-focus-light.png
A docs/qa/day-feed-lab-dl4/02-p3-immersive-light.png
A docs/qa/day-feed-lab-dl4/03-p3-immersive-dark.png
A docs/qa/day-feed-lab-dl4/04-p3-checkout-focus-dark.png
A docs/qa/day-feed-lab-dl4/acceptance.json
M src/features/day-feed-lab/DayFeedLabScreen.tsx
A src/features/day-feed-lab/StayFixtureRow.tsx
A src/features/day-feed-lab/contribution.test.ts
A src/features/day-feed-lab/contribution.ts
M src/features/day-feed-lab/fixtureCatalog.test.ts
M src/features/day-feed-lab/fixtureCatalog.ts
A src/features/day-feed-lab/fixtureFacts.ts
A src/features/day-feed-lab/fixtureRegistration.ts
A src/features/day-feed-lab/stayContribution.ts
M src/features/day-feed/DayFeed.tsx
M src/features/day-feed/P1Row.tsx
M src/features/day-feed/composition.ts
M src/features/day-feed/render.test.ts
A src/features/day-feed/rendererContribution.ts
M src/ui/catalogs.ts
```

No intervening local-main commit or
overlapping Composer, Day Feed, routing, localization or Core Read edit existed.
Core, Flight E2E, Flexible, TTR and Experience worktrees were inspected without
importing their independent changes. The integration commit containing this
report adds only `docs/CURRENT_IMPLEMENTATION_STATE.md`, this report,
`OTR_DAY_FEED_LAB_SHARED_HANDOFF.md` and the two native evidence files under
`docs/qa/day-feed-lab-dl4-integration/`. Source branch and prior evidence remain
intact.

## Exact-main comparison

| Gate         |                                 Clean local main `40c5d29` |          DL4 integration tree |
| ------------ | ---------------------------------------------------------: | ----------------------------: |
| Full Vitest  |                              3743 pass, 2 fail, 21 skipped | 3749 pass, 2 fail, 21 skipped |
| Failed files | `navigationLayout.test.ts`, `architectureBoundary.test.ts` |                Same two files |

The two failures are present on the exact current-main baseline; no new failure
is classified as historical. Nine focused DL1/DL2/DL4, P1/P2/G2 and Core
repository suites have 96 PASS. Typecheck and full lint/UI guard pass; UI guard
keeps 473 legacy occurrences across 88 representative files without baseline
forgiveness. Changed-file formatting/diff checks and Release iOS export pass.
The `__DEV__` Lab route redirects in Release; export is not a claim that Metro
eliminates every synthetic module byte.

## Native acceptance

On the isolated iPhone 18 Pro iOS 27 Simulator
`AE11480D-B6B9-402B-BE8A-4F2BBD4D0704`, the installed DEV Test app loaded
the accepted DL4 Metro source. All six Fixtures were selected; P1/P2 rendering,
Focus and Immersive return, P3 Jan15 check-in/Jan16 base/Jan18 check-out,
Trip/date navigation, NOW/TNS and Light/Dark were exercised. The Simulator's
appearance was restored to Light.

The previously uncertain native nonzero-scroll case now passes. On Nelson Jan15,
a native swipe moved the first visible row from the ridge walk to trail stop 3.
Trail stop 6 entered Focus and Immersive; Close returned with stop 3 still at the
top and stop 6 still focused. The resulting screenshot and step record are under
`docs/qa/day-feed-lab-dl4-integration/`. This verifies visible retention at a
nonzero offset; no numerical pixel offset was read from the device.

Core DEV Read remained disabled because no compatible accepted local collection
or adopted authorized session was available. No positive native/live DEV read,
physical-device acceptance, new schema, Hosted write, provider or Production
activation is claimed. Synthetic P3 remains integration proof, not final P3.

## Main preservation and handoff

Before advancing main, the canonical checkout's exact HEAD, index, status and
dirty/untracked file bytes are pinned. Its dirty `CURRENT_IMPLEMENTATION_STATE.md`
has an independent 21-line deletion; the integration checkpoint is prepended to
those original working bytes so the deletion remains the same after main moves.
A disposable shared-clone rehearsal verifies the merge, the dirty-file result
and clean index first. The final compare-and-swap advance stops if main, index or
dirty bytes change meanwhile. The integration commit is the final local-main
HEAD after that guarded advance; its exact hash is reported in the completion
message and can be read with `git rev-parse main`.

The shared contract is now in `OTR_DAY_FEED_LAB_INTEGRATION_GUIDE.md`,
`OTR_DAY_FEED_LAB_DL4_PORT.md`, `src/features/day-feed-lab/contribution.ts`,
`fixtureRegistration.ts` and `src/features/day-feed/rendererContribution.ts`.
`OTR_DAY_FEED_LAB_SHARED_HANDOFF.md` gives P3–P6, Flexible and TTR the actual
APIs, Simulator steps, ownership boundaries and closed Core/DEV gates. G2 moves
to shared-infrastructure maintenance; feature-specific rendering proceeds in
the owning workstreams, starting with P3 Accommodation.
