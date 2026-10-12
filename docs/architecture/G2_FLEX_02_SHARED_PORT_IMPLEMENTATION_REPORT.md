# G2-FLEX-02 — shared port implementation / Owner Review

2026-10-13. Bounded synthetic implementation on `codex/g2-flex-02`, worktree
`/private/tmp/otr-g2-flex-02-20261013`. No merge or push. Commit is recorded in
the delivery message and discoverable with `git log -1` on this branch.

## Provenance and original source limitations

- Local canonical main: `a878be35db92fb7e36edd5e89f26fe94f1bcb07a`; origin/main
  and live remote at preflight: `b4ddd27d2352350b6d16617543d0f17a715dc077`.
  Accepted `a878be35` is the implementation parent. Main stayed at this revision
  at final verification; its unrelated dirty/untracked files were preserved.
- No earlier FLEX-02 implementation existed. CP01A `5853009`, CP01B `1114ccc`
  and its untracked dependency report, TTR source `aa8753e`, CP04B `1b909`, Core/
  TTR persistence and Flight worktrees were inspected and left untouched.
- At baseline `composition.ts:composeDayStream` retained active Item/Choice Focus
  during Block Immersive. `DayFeed.tsx` retained independent Focus state; default
  `FlexibleBlockRow.tsx` still exposed Choice Focus actions in Immersive.
- `FixtureContribution.ports.flexible` was static presentation. There was no
  generation/revision replacement consumer or renderer publication callback.
  `DayFeed.tsx:choiceScope` cleared all Focus, including Canonical Item Focus.
- This extension reuses the accepted `FlexibleBlockPort` and its inline Choice
  type in composition.ts (`g2-flexible/1`). CP01A's `FlexibleFixtureProjection`
  (`flexible-fixture/1`) remains isolated and requires CP01B adaptation.
  No proposed interface name was assumed to exist.

## Exact implemented port API

`src/features/day-feed/flexibleSnapshot.ts` exports:

```ts
type FlexibleSnapshotScope = Readonly<{
  accountId: string;
  tripId: string;
  localDate: string;
  generation: number;
}>;
type FlexibleSnapshot = Readonly<{
  version: "g2-flexible-snapshot/1";
  scope: FlexibleSnapshotScope;
  revision: number;
  blocks: readonly FlexibleBlockPort[];
}>;
type FlexiblePublication = Readonly<{
  scope: FlexibleSnapshotScope;
  snapshot: FlexibleSnapshot | null;
}>;
replaceFlexibleSnapshot(
  current: FlexibleSnapshot | null,
  next: FlexibleSnapshot | null,
  scope: FlexibleSnapshotScope,
): FlexibleSnapshot | null;
useFlexibleSnapshot(
  publication: FlexiblePublication | undefined,
  view: { accountId: string; tripId: string; localDate: string },
): {
  snapshot: FlexibleSnapshot | null;
  replace: ((snapshot: FlexibleSnapshot) => boolean) | undefined;
};
```

`flexibleScopeKey(scope)` and `validFlexibleScope(scope)` are exported helpers.
`composition.ts:validFlexibleBlock(block, {accountId, tripId, localDate})` shares
runtime Block validation with the Composer. Existing Block/Choice types remain
unchanged. `DayFeed` and `FixtureContribution` add optional `flexiblePublication`.
`FlexibleBlockRendererProps` adds optional `flexibleSnapshot` and
`onReplaceFlexibleSnapshot?: (snapshot: FlexibleSnapshot) => boolean`, available
in Browse and Immersive. Legacy static contributions continue to work.

Host scope is independent of the publisher's snapshot and must match the actual
Feed Account/Trip/date. Generation is a nonnegative safe integer identifying the
host's current stream. Revisions are nonnegative safe integers and strictly
increase within that stream. Full replacements validate version, calendar date,
scope, unique Blocks/Choices, Choice filters and soft minute bounds. Accepted
values are copied/frozen; producer mutation cannot change them. Invalid/stale
input retains the last accepted snapshot, returning false via the callback.
Use a higher-revision empty Blocks array to clear; null is not a delete command.
The pure helper's `current` belongs to the declared stream; the mounted hook
resets it on scope changes. Invalid host scope masks old Blocks immediately.

Both controlled prop updates and direct callbacks recompose the mounted Feed.
The current ref enforces ordering across multiple synchronous publications before
React renders. Epoch fencing rejects callbacks from earlier context visits even
after A→B→A; unmount fencing rejects detached callbacks. A new context starts a
fresh revision stream and clears navigation/Choice filter state. Revision changes
keep the same Feed/ref/Block/Choice keys and do not reset date, NOW or scroll.

## Focus and composition contract

`composeDayStream` now returns `suspendedFocus`. During Block Immersive active
`focus` and `focusedChoiceKey` are null. The desired previous Focus is retained
only if visible in the authoritative query/current Choice filter. Background Feed
pointer events and accessibility descendants are disabled. The default Immersive
Choice controls are disabled; global Choice intent is inert in the Immersive slot.

Flexible owns one local expanded resource, demonstrated with component-local state
in `FlexibleSnapshotFixtureRow`. No global identity is minted for these resources.
Closing restores valid suspended Focus; deleted/hidden/unpermitted targets clear
and cannot resurrect on a later publication. No automatic target is chosen.
Ordinary nested Canonical Items retain G2 Item Focus/Immersive callbacks.
My/Group filters only Choices and preserves Item Focus; removing all My Choices
falls back to the available Group presentation.

Composer keeps explicit unique affiliations and safe outer fallback. Block delete
does not remove Canonical Items; conflicting affiliations return Items outermost.
Soft resize does not mutate Item time. TNS remains outside Blocks. Existing NOW
calculation is unchanged: the combined fixture's unknown-time POINT hides NOW
conservatively (`TIMING`); the original TTR NOW collision and P1 span still show it.
No TTR code changed. Existing anchor eligibility suppresses a Transition when a
Flexible replacement nests its anchor, without requalifying visual adjacency.

## Automated checks and exact baseline comparison

Focused command:
`npx vitest run src/features/day-feed src/features/day-feed-lab src/domain/trip/tripCoreV2DayFeed.test.ts src/domain/trip/dayReadModel.test.ts src/features/ttr`.
11 files / 168 tests PASS, including all 14 TTR fixtures, stale TTR intent fences,
Core v1/v2, P1/P2/P3, renderer/Release isolation and the new interaction tests.
New tests cover immutable replacement, malformed/scope/stale revisions, each
synthetic update, nested uniqueness/TNS/TTR, suspended restoration, deleted/hidden
Choice clearing, Item permission loss/no resurrection, My/Group Item preservation,
prop and callback replacement without remount, nonzero offset271 restoration,
rapid callbacks, context revisits and feature-local expansion.

Typecheck, full lint/UI guard and changed-file formatting PASS. Architecture
boundary was executed in both full suites. Baseline bounded full: 3878 PASS / 2 failures / 23 skips. Candidate bounded full:
3893 PASS / the same 2 failures / 23 skips (15 added tests). Exact results are recorded in
`evidence/g2-flex-02/validation-summary.json`; only these existing baseline
failures remain in the bounded comparison:

1. `src/components/navigationLayout.test.ts` — undefined tab options accessing
   `tabBarActiveTintColor`.
2. `src/domain/architectureBoundary.test.ts` — unchanged
   `LocalOperationsDiagnostics.test.ts` sync mock trips the boundary scan.

Default-worker runs initially matched these two failures. Later default-worker
runs also reported STACK_TRACE_ERROR in unchanged Capture autonomous QA and MoneyText
tests; both files pass isolated (17 tests). The final baseline/candidate full
comparison uses identical `--maxWorkers=2` settings, avoiding that load sensitivity.
Raw local logs/JSON are in `/private/tmp/otr-g2-flex-02-evidence`.

## Native evidence

Task-owned iPhone18Pro / iOS27 Simulator
`1D01B9F0-6591-4C15-A4CD-43E86E86AA13`, app `com.xoery.otrmobile`.
Reused the previously built Debug binary with final isolated JS served by Metro8097;
no native dependencies/configuration changed and no fresh native build is claimed.
Only synthetic Fixture mode ran; no authenticated Core/Hosted/Provider activity.

Evidence directory: `evidence/g2-flex-02/`.

| PNG                                      | Native observation                                                    |
| ---------------------------------------- | --------------------------------------------------------------------- |
| 01-choice-focus-dark                     | Browse My Choice selected                                             |
| 02-immersive-local-saved-dark            | Feed Choice disabled; Pool→Saved leaves one local expansion           |
| 03-copy-focus-restored-dark              | COPY visible after close; original My Focus restored                  |
| 04-nonzero-scroll-restored-dark          | Nonzero Browse position after rapid resize, Group edit and My removal |
| 05-ttr-inert-sheet-light                 | Existing onOpenTtr intent Sheet opens                                 |
| 06-now-ttr-light                         | Existing NOW/Transition collision after Sheet dismissal               |
| 07-block-delete-canonical-retained-light | Sole Block gone; Canonical14:00 Item remains outer; TTR remains       |
| 08-p3-focus-light                        | P3 base Focus; Immersive and return also exercised                    |
| 09-p2-flight-focus-light                 | Existing P2 Flight Focus geometry                                     |
| 10-p1-focus-now-light                    | Existing P1 Focus plus within-event NOW                               |
| 11-local-search-light                    | One local Search expansion in Light mode                              |
| 12-nested-anchor-ttr-withheld-light      | Anchor nested once; ineligible Transition withheld                    |

Native revisions0→1 COPY,1→3 rapid COPY/resize, stale3 rejected,4 Group edit,
5 My removal and6 conflicting affiliation were observed. Removal cleared suspended
My Focus; resize showed18:00–20:00; delete auto-closed Immersive. Trip/date stayed
selected. TNS was visually outer at the scrolled tail. Account/Trip/date/generation,
late-callback and permission-loss matrices are automated acceptance, not real-data
native claims. All14 TTR cases remain registered/tested; native spot checks cover
collision/intent/anchor eligibility. No complete Flexible workspace native PASS.

## CP01B resumption handoff and remaining gates

After Owner accepts this commit, resume CP01B from its preserved worktree/report.
Bind its actual authorized `g2-flexible/1` projections to `FlexiblePublication`;
the host owns the independent current scope/generation. Publish one complete
higher-revision snapshot after each authorized synthetic mutation, via prop or
renderer callback. Preserve Block/Choice IDs and explicit Item affiliations. Check
the callback result and use the latest accepted renderer snapshot for revisioning.
Do not remount DayFeed for ordinary publications or reuse a departed callback.

Use `immersive` to mount feature-local expanded-resource state; pass Canonical
Items through `nestedItems` and standard G2 depth callbacks. Pool/Search/Saved
expansion stays local, one resource at a time. The synthetic renderer can be
replaced by CP01B's approved component without another Composer or global Focus.
CP01B adoption/business interaction tests remain its next checkpoint.

Production Flexible storage/Choice lifecycle/Pool/drag/resize workspace, real
permission revocation/read integration, physical-device/Android acceptance,
Core TTR authority and Provider routing remain separately gated. No new dependency,
schema/migration, Admission, Sync, TTR/Provider or production code was changed.

## Changed-file manifest

Exact repository-relative paths (30 files):

```text
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/adr/2026-10-13-g2-flexible-snapshot-focus-boundary.md
docs/architecture/G2_FLEX_02_SHARED_PORT_IMPLEMENTATION_REPORT.md
docs/architecture/OTR_DAY_FEED_LAB_INTEGRATION_GUIDE.md
docs/architecture/evidence/g2-flex-02/01-choice-focus-dark.png
docs/architecture/evidence/g2-flex-02/02-immersive-local-saved-dark.png
docs/architecture/evidence/g2-flex-02/03-copy-focus-restored-dark.png
docs/architecture/evidence/g2-flex-02/04-nonzero-scroll-restored-dark.png
docs/architecture/evidence/g2-flex-02/05-ttr-inert-sheet-light.png
docs/architecture/evidence/g2-flex-02/06-now-ttr-light.png
docs/architecture/evidence/g2-flex-02/07-block-delete-canonical-retained-light.png
docs/architecture/evidence/g2-flex-02/08-p3-focus-light.png
docs/architecture/evidence/g2-flex-02/09-p2-flight-focus-light.png
docs/architecture/evidence/g2-flex-02/10-p1-focus-now-light.png
docs/architecture/evidence/g2-flex-02/11-local-search-light.png
docs/architecture/evidence/g2-flex-02/12-nested-anchor-ttr-withheld-light.png
docs/architecture/evidence/g2-flex-02/validation-summary.json
src/features/day-feed-lab/DayFeedLabScreen.tsx
src/features/day-feed-lab/FlexibleSnapshotFixtureRow.tsx
src/features/day-feed-lab/contribution.ts
src/features/day-feed-lab/fixtureRegistration.test.ts
src/features/day-feed-lab/fixtureRegistration.ts
src/features/day-feed-lab/flexibleReactiveContribution.ts
src/features/day-feed/DayFeed.tsx
src/features/day-feed/FlexibleBlockRow.tsx
src/features/day-feed/composition.ts
src/features/day-feed/flexibleSnapshot.test.ts
src/features/day-feed/flexibleSnapshot.ts
src/features/day-feed/render.test.ts
src/ui/catalogs.ts
```

No generated binaries, dependency lockfiles or native project files are included.

**STOP — G2-FLEX-02 READY FOR OWNER REVIEW.**
