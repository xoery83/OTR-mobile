# G2-FLEX-01 bounded shared extension — Owner Review

Base: canonical local main `eb4c8eb`. Branch: `codex/g2-flex-01`. CP01A source
reviewed at isolated `codex/flexible-native-gallery-cp01` (`5853009`); its
`FlexibleFixtureProjection` is not on main. CP01B has no checked-in accepted G2
interface. No Gallery source was merged or imported.

## Exact main limitations before this port

- **G2-F01:** `FlexibleContainer` in `src/features/day-feed/composition.ts`
  carried `itemIds`, `softWindow` and Choices only as `containers` metadata.
  `composeDayStream().rows` was exclusively `query.timed + query.nonComparable`;
  `DayFeed.tsx` mapped only those rows. Empty/Choice-only Blocks had no row or
  renderer. `composition.test.ts` checked metadata, not Block visibility.
- **G2-F02:** `composeDayStream`'s `visible()` recognized only `event.id`.
  `DayFeed.tsx`'s one `focus` state existed but its `depth()` and `render()`
  addressed Item IDs alone. A Choice key could never become the active Focus;
  `render.test.ts` covered P1/P2/P3 switching only.
- **G2-F03:** `composeDayStream().immersive` resolved Item IDs only;
  `DayFeed.tsx` selected its modal content from `rows.find()` and had no Block
  header or Block renderer. The existing scroll-return test covered Item and
  Stay Immersive only. Soft windows were passed through without placement;
  `choiceScope` was global, and Item affiliation did not drive nested rendering.

## Exact port API

- `FlexibleBlockPort` (`composition.ts`): `version: "g2-flexible/1"`,
  `synthetic: true`, `id`, `title`, `accountId`, `tripId`, `localDate`, explicit
  `itemIds`, optional `{startMinute,endMinute}` soft window, optional per-Block
  `choiceScope`, and `{id,name,scope}` Choices. G2 accepts matching trip/date,
  valid windows and unique Choice keys; invalid/duplicate Blocks are omitted.
  Empty title uses a localized fallback. Existing unversioned
  `FlexibleContainer` remains a metadata-only compatibility input.
- `choiceFocusKey(blockId, scope, choiceId)` matches CP01A's
  `JSON.stringify(["FLEXIBLE_CHOICE", blockId, scope, choiceId])` identity.
  `blockRowKey(blockId, localDate)` names independent Block rows.
- `composeDayStream(..., ports)` still returns Item-only `rows` and existing
  `containers`, and adds `entries: ITEM | BLOCK` for the shared host. Each
  versioned Block appears once; only uniquely affiliated TIMELINE Items nest.
  Missing, ambiguous, BASE and TNS Items remain outer. Canonical Item order,
  NOW source and TTR adjacency stay unchanged. Soft start orders Blocks but
  never clips Items or creates hard schedule authority.
- `DayFeed` accepts optional `flexibleRenderer: ComponentType<FlexibleBlockRendererProps>`;
  `FixtureContribution` passes it through. G2 supplies `block`, `immersive`,
  `nestedItems`, `onBlockImmersiveIntent`, `onChoiceFocusIntent`,
  `onChoiceScopeIntent`, `onClose`. The default `FlexibleBlockRow` uses shared
  UI tokens/controls. The header opens Immersive directly. One host Focus
  state addresses either an Item ID or a Choice key; Block IDs are never Focus.

## CP01B resumption

Adapt authorized CP01A `FlexibleFixtureProjection` to this structural port:
attach the authorized Lab account scope, map `Block.start/end` to soft minutes,
map explicit `affiliation.itemIds`, and map `Resource.id/name` plus scope to
Choices. CP01A emits Choices only for its current `scope`; supply both scoped
sets if the shared My/Group switch is to be used, or let a CP01B renderer
request each projection on toggle. Mount the CP01B renderer through
`FlexibleBlockRendererProps`, forwarding its existing `focusedId` and
`onFocusIntent` to G2. Keep CP01A's own workspace, lifecycle and mutations
outside this gate. Re-run native Day Feed/Focus/scroll and CP01B fourteen-state
checks before any later production authority decision.

## Validation and boundary

Synthetic Lab fixture `day-lab-flexible` exercises empty, Choice-only and
nested Blocks, Choice scopes, ordinary outer Item and TNS fallback. Focused
composition/interaction/contribution/NOW regressions: 68 PASS across seven
files. Typecheck, full lint/UI guard and changed-file Prettier check PASS.
Full test run: 3,739 PASS, two existing failures (`navigationLayout`,
`architectureBoundary`), 20 skipped; two unrelated suites could not collect
because the isolated worktree's linked `node_modules` resolved the
React Native datetimepicker Flow source in Rolldown. Repository-wide Prettier
flags 30 untouched baseline files; no unrelated formatting was changed.
Native iOS 27 task Simulator
`AE11480D-B6B9-402B-BE8A-4F2BBD4D0704` with installed Debug app loaded this
branch over local Metro: AX verified all three Blocks, one nested Item, outer
TNS, Choice Focus then Item Focus, My/Group switch, direct empty/scheduled Block
Immersive and close to the same nonzero scroll position. No Core read/session,
Provider, upload, migration or production path was used.
