# G2-FLEX-02 — controlled local-main integration / Owner Review

2026-10-13. Owner accepted `12eadff` for controlled local integration. No source
semantics changed. Main receives the normal merge plus a documentation/evidence
commit; the final delivery message records exact final HEAD. No push/deploy.

## Provenance, concurrency and preservation

- Verified preflight main `a878be35db92fb7e36edd5e89f26fe94f1bcb07a`;
  tracking and live remote `b4ddd27d2352350b6d16617543d0f17a715dc077`.
  Main remained at the preflight revision through validation.
- Accepted source `12eadff4db4fe2f297f7d2a7a4d73a0790ab2745`, parent `a878be35`,
  tree `126139ac405fcedff0673e31319aa4d90f357bb2`; exact 30-file manifest verified.
- Normal merge `6801bfcdf0023fd9605f09a8b96859f22037605e`, parents exactly
  `a878be35db92fb7e36edd5e89f26fe94f1bcb07a` and
  `12eadff4db4fe2f297f7d2a7a4d73a0790ab2745`. Merge tree equals the accepted
  source tree. No conflict, rewrite, rebase or integration source correction.
- Clean isolated branch/worktree: `codex/g2-flex-02-main-integration` /
  `/private/tmp/otr-g2-flex-02-main-integration-20261013`.
  G2-FLEX-01 (`6758683`/`1114ccc`) and accepted TTR (`aa8753e`/`e716cfa`)
  verified in main ancestry.
- Inspected G2/Flexible CP01A/CP01B, TTR, Core and Flight worktrees. Concurrent
  Core-order implementation has no dirty shared-source overlap. Historical Flight
  and Platform handoff edits in other worktrees were not imported. CP01B's
  untracked dependency report and all concurrent branches remain preserved.
- Canonical main's modified Platform report, three untracked Platform reports
  and `scripts/dev/__pycache__/` were inventoried with hashes; its index had no
  staged changes. Main advances only with a guarded `git merge --ff-only` after
  rechecking HEAD, status, index and hashes. Post-advance preservation is verified.

All 29 accepted files other than current-state handoff remain byte-identical to
`12eadff`, including the source report and original twelve screenshots. Only
the new integration report/evidence and current-state heading are added for this
checkpoint. `evidence/g2-flex-02-main/validation-manifest.json` records exact
accepted and final changed-file manifests, source identities and validation.

## Validation

Exact clean-current-main baseline rerun at `a878be35` and merged candidate rerun
at `6801bfc`, both with `npm test -- --maxWorkers=2 --reporter=json`:

| Tree               | Passed | Failed | Skipped |
| ------------------ | -----: | -----: | ------: |
| Clean current main |   3878 |      2 |      23 |
| Merged candidate   |   3893 |      2 |      23 |

Failure file/test/message identities match after normalizing worktree paths:
`navigationLayout.test.ts` undefined `tabBarActiveTintColor`, and
`architectureBoundary.test.ts` scanning unchanged `LocalOperationsDiagnostics.test.ts`
sync mocks. No additional failures or unresolved new regression. Capture and
MoneyText pass in both fresh full runs. Architecture-boundary execution remains
subject to that exact pre-existing failure; no unrelated repair was made.

Focused **14 files / 251 tests PASS**:

```text
npx vitest run src/features/day-feed src/features/day-feed-lab
  src/domain/trip/dayReadModel.test.ts src/domain/trip/ttr.test.ts
  src/domain/trip/tripCoreV2Views.test.ts
  src/domain/trip/tripCoreV2FlightAcceptance.test.ts src/features/ttr
```

Includes snapshot ordering/immutability/scope and A→B→A fences, rapid callbacks,
Focus suspension/restoration/permission loss/no resurrection, My/Group Item Focus,
COPY/remove/resize/delete, nesting uniqueness/outer fallback/TNS, offset271,
NOW, all14 TTR fixtures and stale intent, Core v1/v2 and P1/P2/P3 rendering.
Full regression also executes Release Lab isolation and owning authority checks.
Typecheck, full lint/UI guard, changed-file formatting and Git diff check PASS.
No Core/data/backend/app/native dependency paths changed. Raw logs and preflight
inventory: `/private/tmp/otr-g2-flex-02-main-evidence`.

## Native integration evidence

Dedicated iPhone18Pro / iOS27 Simulator
`1D01B9F0-6591-4C15-A4CD-43E86E86AA13`, app `com.xoery.otrmobile`.
Existing Debug binary reused with merged JS served by isolated Metro8097; no
fresh native build is claimed. Metro stopped after validation. No protected
Simulator/physical-device data changed, authenticated Core read, Hosted write,
Provider or production activation.

Fresh screenshots under `evidence/g2-flex-02-main/`:

| PNG                                                 | Observation                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| 01-copy-focus-restored-light                        | COPY visible; original My Choice Focus restored                          |
| 02-scroll-tns-before-light                          | Scrolled tail; time-unknown Item stays outer                             |
| 03-nonzero-before-light / 04-nonzero-restored-light | Matching nonzero Browse position before/after replacement and close      |
| 05-local-published-dark                             | Pool→Published leaves one local expansion; Feed Choices disabled         |
| 06-resize-remove-focus-cleared-dark                 | 18:00–20:00 soft Block; edited Group Choice; removed My Focus cleared    |
| 07-delete-canonical-retained-dark                   | Sole Block removed;14:00 Canonical Item and TTR retained                 |
| 08-ttr-inert-sheet-dark                             | TTR intent opens with unchanged Relation identity after snapshot changes |
| 09-now-ttr-dark                                     | Original NOW/Transition collision visible                                |
| 10-p1-return-now-dark                               | Ordinary P1 Immersive return restores Focus; within-event NOW visible    |
| 11-p2-flight-focus-dark                             | P2 Flight geometry retained                                              |
| 12-p3-return-dark                                   | P3 Focus/Immersive return retains Jan16                                  |

Native My→Group→My clears hidden Focus without selecting another Choice.
COPY revisions1/2/3 accepted; rapid revisions4/5 accepted; stale5 rejected;
Group edit6, removal7, explicit resize8 and deletion9 observed. Resource expansion
is synthetic component-local state, not a business workspace. Scope/permission
matrices and all14 TTR states are automated; native TTR checks are representative
collision/intent/coexistence cases. The unknown-time POINT keeps the existing
conservative NOW hiding rule; visible NOW is verified separately.

## Actual exported interfaces and CP01B handoff

The accepted exact API remains documented in
`G2_FLEX_02_SHARED_PORT_IMPLEMENTATION_REPORT.md`. Actual exports:

| Symbol                           | Source / contract                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `FlexibleSnapshotScope`          | `day-feed/flexibleSnapshot.ts`: Account/Trip/localDate/generation                        |
| `FlexibleSnapshot`               | Same: `g2-flexible-snapshot/1`, scope, revision, complete `FlexibleBlockPort[]`          |
| `FlexiblePublication`            | Same: independently host-declared scope and snapshot/null                                |
| `replaceFlexibleSnapshot`        | Same: `(current, next, scope) => accepted/current/null`                                  |
| `useFlexibleSnapshot`            | Same: `(publication, view) => {snapshot, replace}`                                       |
| `FlexibleBlockPort`              | `day-feed/composition.ts`: existing `g2-flexible/1`                                      |
| `choiceFocusKey` / `blockRowKey` | Same: stable scoped Choice / dated Block identities                                      |
| `onReplaceFlexibleSnapshot`      | `FlexibleBlockRendererProps` in `FlexibleBlockRow.tsx`: optional `(snapshot) => boolean` |

`DayFeed`/`FixtureContribution.flexiblePublication` bind the scoped stream.
Renderer `flexibleSnapshot` supplies current immutable accepted state. Increasing
revisions replace the complete presentation without changing the Feed key;
empty Blocks at a higher revision clear it. Wrong scope/stale input reject, and
departed callbacks stay fenced even after context revisits.

Block header's `onBlockImmersiveIntent` opens directly. Browse
`onChoiceFocusIntent` addresses only visible Choices; it is inert in Immersive.
`onChoiceScopeIntent` changes Choice presentation only. `onClose` restores a
still-authorized suspended Feed Focus and scroll, otherwise clears Focus.
`nestedItems` keeps standard G2 Item depth callbacks. Flexible owns one local
Pool/Search/Saved/Published expansion, without synthetic global Choice identities.

**CP01B shared-port prerequisite is complete on local main after advance.**
Resume its preserved worktree/report against final main. Adapt actual CP01A
`FlexibleFixtureProjection` to the existing port; implement its own authorized
snapshot producer and approved local workspace. Check callback results and use
latest accepted revision/state. G2 returns to shared infrastructure maintenance.
No CP01B business implementation, persistence, Pool engine or drag/resize lifecycle
is included here. Real-data permissions/adoption, physical-device/Android, owning
Core TTR authority and Provider routing remain separate gates.

**STOP — G2-FLEX-02 MAIN INTEGRATION COMPLETE / OWNER REVIEW.**
