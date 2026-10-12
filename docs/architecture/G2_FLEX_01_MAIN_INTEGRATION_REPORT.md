# G2-FLEX-01 — controlled local-main integration

2026-10-12. Accepted source `codex/g2-flex-01` at `6758683` has parent
`eb4c8eb`. This normal merge is based on verified local main, `origin/main`,
and live remote main at `9ca16d3`; the source commit is unchanged. The only
content conflict was this checkout's current-state handoff, resolved by keeping
the newer Flight/PDF handoff and adding this checkpoint above it. Concurrent
Core, Flight, Flexible, TTR and G2 worktrees were not changed. The canonical
main checkout's unrelated dirty and untracked files were preserved.

## Port for CP01B

- Export `FlexibleBlockPort`, `choiceFocusKey`, and `blockRowKey` from
  `src/features/day-feed/composition.ts`. `FlexibleBlockPort` is
  `version: "g2-flexible/1"`, `synthetic: true`, with `id`, `title`,
  `accountId`, `tripId`, `localDate`, explicit `itemIds`, optional
  `softWindow: {startMinute,endMinute}`, optional `choiceScope`, and
  `{id,name,scope}` Choices. `choiceFocusKey` is
  `JSON.stringify(["FLEXIBLE_CHOICE", blockId, scope, choiceId])`.
- Supply the projection through `FixtureContribution.ports.flexible` and
  matching `ports.scope`; register the contribution in
  `src/features/day-feed-lab/fixtureRegistration.ts`. Existing
  `day-feed-lab/1` and `day-feed-renderer/1` remain unchanged.
- `composeDayStream` retains Item-only `rows` and returns ordered
  `entries: ITEM | BLOCK`. Only one explicit, eligible affiliation nests an
  Item; missing, conflicting, BASE and TNS cases remain outer rows. Choice
  scope filters Choices only. Soft windows place Block rows without creating
  Canonical occurrence or TTR adjacency.
- `DayFeed.flexibleRenderer` receives `FlexibleBlockRendererProps` from
  `src/features/day-feed/FlexibleBlockRow.tsx`: `block`, `immersive`,
  `nestedItems`, `onBlockImmersiveIntent`, `onChoiceFocusIntent`,
  `onChoiceScopeIntent`, and `onClose`. Forward those callbacks to the shared
  host. A Block header opens Immersive directly; Block ID never becomes
  Focus. One Focus accepts either Canonical Item ID or Choice key.

CP01B should adapt authorized CP01A `FlexibleFixtureProjection` facts to
this synthetic port and use its own renderer. CP01A currently emits only its
selected Choice scope; CP01B must provide both scoped Choice sets if it wants
the shared My/Group switch. Flexible Block lifecycle, Pool, Choice
persistence, drag/resize and workspace remain Flexible-owned and outside
this checkpoint.

## Validation

- Clean current-main full suite: 277 files passed, two failed, five skipped;
  3,766 tests passed, two failed, 23 skipped. Merged full suite: the same
  file outcomes; 3,770 tests passed, the same two failed, 23 skipped. Failure
  identities are `src/components/navigationLayout.test.ts` (tab bar option)
  and `src/domain/architectureBoundary.test.ts` (UI/domain import boundary).
  All expected suites collected.
- Focused Day Feed/Lab/Core v1/v2/TTR/Release Lab set: 131 passed, one
  host-dependent SQL skip. The previously uncollected Core v2 Day Feed suite
  collected and passed all 14 tests. The joined SQL suite collected and
  reported its existing `OTR_CORE_OWNED_SQL_FIXTURE` skip. Two test-local
  date-picker mocks resolved the new import path introduced by the Block row.
- Typecheck and full lint including `ui:guard` pass. All changed code,
  tests, contracts and the source report pass Prettier; the current-state
  document is already unformatted on the clean baseline, so its historical
  content was left untouched. Staged/unstaged diff checks pass.
- Fresh iOS 27 iPhone 18 Pro Simulator
  `4CCA3908-A459-4FAA-A448-A36E8DD529F5` installed the existing DEV Test
  Debug binary and loaded this exact merged JavaScript over local Metro
  port 8095. Device Hub accessibility and screenshots verified the Lab,
  all six prior Fixture Trips plus Flexible, empty and Choice-only Blocks,
  nested Item and outer TNS, My/Group switching, Choice-to-Item Focus,
  direct Block and Item Immersive/return, NOW, P1/P2/P3 layouts, and Light/Dark.
  On Nelson, the Feed was scrolled to rows 18:00–23:00, Item Focus/Immersive
  opened at 22:00, and the same nonzero viewport remained on close. P2 Flight
  Focus/Immersive and P3 Stay Base were exercised. Core DEV Read was disabled
  because no accepted compatible local collection was present; no live Core
  DEV acceptance is claimed.

## Changed-file manifest versus `9ca16d3`

```text
backend/src/captureFlightCoreV2.sql.test.ts
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/adr/0048-g2-flexible-shared-port.md
docs/architecture/G2_FLEXIBLE_SHARED_PORT_01.md
docs/architecture/G2_FLEX_01_MAIN_INTEGRATION_REPORT.md
docs/architecture/G2_FLEX_01_REPORT.md
src/data/repositories/tripCoreV2DayFeedRepository.test.ts
src/features/day-feed-lab/DayFeedLabScreen.tsx
src/features/day-feed-lab/contribution.ts
src/features/day-feed-lab/fixtureRegistration.ts
src/features/day-feed-lab/flexibleContribution.ts
src/features/day-feed/DayFeed.tsx
src/features/day-feed/FlexibleBlockRow.tsx
src/features/day-feed/composition.test.ts
src/features/day-feed/composition.ts
src/features/day-feed/render.test.ts
src/ui/catalogs.ts
```

No production Flexible data path, TTR activation, Provider, Hosted operation,
remote push or deployment occurred. Next CP-G2-TTR-01 can start from this
local main's unchanged dormant `ttr-presentation/1` seam and its regression
in `src/features/day-feed/composition.test.ts`, with TTR's own acceptance gate.
