# DL4 shared Day Feed Lab port — Owner Review

2026-10-12. DL2 is integrated into **local canonical main** at
`40c5d29a9f3d6232003393af1ae516a339a46b56`; the DL4 work is isolated on
`codex/day-feed-lab-dl4` (the commit containing this report). No remote push,
deploy, Hosted write, migration, provider, Auth/Sync or Production activation.

## DL2 integration and preservation

The accepted `f5cc324` source was reconciled with actual newer main `0379453`.
Only the current-state handoff prepend conflicted; the accepted DL2 implementation
remained byte-identical. An exact clean-main run had 3734 PASS / two existing FAIL /
21 skipped; integrated main had 3743 PASS / the same two FAIL / 21 skipped.
Focused 78 PASS; typecheck, lint/UI guard, formatting and diff checks passed.
The local-main advance preserved all prior dirty, staged and untracked canonical
bytes. The newer independent main work and concurrent worktrees were not changed
by the integration. Exact process and evidence are in
`OTR_DAY_FEED_LAB_DL2_MAIN_INTEGRATION.md` and
`/private/tmp/otr-dl2-main-preservation-result.json`.

## DL4 manifest and contracts

The implementation is confined to these paths, grouped by purpose:

| Purpose                             | Paths                                                                                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture/product/handoff        | `docs/PRODUCT.md`, `docs/CURRENT_IMPLEMENTATION_STATE.md`, `docs/architecture/OTR_DAY_FEED_LAB_DL4_PORT.md`, `docs/architecture/OTR_DAY_FEED_LAB_DL4_REPORT.md`, `docs/adr/2026-10-12-day-feed-lab-shared-experience-port.md` |
| Fixture contract and registration   | `src/features/day-feed-lab/contribution.ts`, `fixtureFacts.ts`, `fixtureCatalog.ts`, `fixtureRegistration.ts`, `DayFeedLabScreen.tsx`                                                                                         |
| P3 synthetic proof                  | `src/features/day-feed-lab/stayContribution.ts`, `StayFixtureRow.tsx`, `src/ui/catalogs.ts`                                                                                                                                   |
| Shared production presentation seam | `src/features/day-feed/rendererContribution.ts`, `DayFeed.tsx`, `P1Row.tsx`, `composition.ts`                                                                                                                                 |
| Checks                              | `src/features/day-feed-lab/contribution.test.ts`, `fixtureCatalog.test.ts`, `src/features/day-feed/render.test.ts`, `docs/qa/day-feed-lab-dl4/`                                                                               |
| Workstream instructions             | `docs/architecture/OTR_DAY_FEED_LAB_INTEGRATION_GUIDE.md`                                                                                                                                                                     |

`FixtureContribution<T>` is the immutable `day-feed-lab/1` contract. It carries
synthetic Trip identity, bounded selectable dates, deterministic zone/instant,
existing `DayProjection`, services and expected metadata. Its optional `T`
supplemental facts, pure Day query, renderer and G2 ports allow a workstream to
contribute without editing Lab Trip/date/source switching. Registration validates
version, synthetic scope, dates, clock, projection identity, Item uniqueness and
optional Account/Trip scope. The original five DL1 Fixtures are retained.

`RendererContribution<T>` is the `day-feed-renderer/1` adapter: P3–P6 family,
Item-keyed typed facts and a render function. `bindRenderer` supplies the existing
composed row/container, depth actions and within marker. Missing facts or an
unsupported row fall back to existing P1/P2 presentation. The Feed still owns G2
composition, sorting, NOW, Focus, Immersive and scroll restoration. There is no
mutable global registry, duplicate Composer, renderer repository access or
canonical write.

The sixth Fixture is one schema-checked, in-memory three-night Stay. Owning
`projectCoreDay`/`projectCoreItem` produce one stable Item with CHECKIN on Jan 15,
TONIGHT accommodation BASE on Jan 16–17 and CHECKOUT on Jan 18. The fixture-only
adapter maps the owning rows into the current Day query. It does not certify or
install a Core collection. No clock, midnight, address, accepted Instruction or
second identity is fabricated. Its temporary localized row reuses P1 Browse
geometry and shared Focus/Immersive. Future approved P3 rendering can replace the
typed renderer in registration without changing the Lab Shell. This is **synthetic
P3 integration proof**, not final P3 Experience acceptance.

Flexible preserves explicit Item affiliation, soft time-window facts and Choice
only My/Group filtering, with unique nested Item rendering. TTR keeps the
qualified `ttr-presentation/1` seam: straight-line distance without a mode,
confirmed mode without ETA, and NOW collision suppressing connector decoration
while retaining useful facts. The owning Flexible/TTR business models and
Core-occurrence-gated production transitions remain outside DL4.

## Validation and evidence

- Focused DL4 checks: nine files, **84 PASS**. Full suite: **3749 PASS / same two
  clean-main failures / 21 skipped**, versus DL2-integrated main 3743 PASS / same
  two / 21 skipped. The two failures are navigation-layout and architecture-boundary
  baseline tests; no new full-suite failure.
- Typecheck, full lint/UI guard, changed-file formatting and diff checks passed.
  Guard counts remain 473 legacy occurrences / 88 representative files.
- Release iOS export passed. The Lab entry remains guarded in Release; the Metro
  bundle may retain synthetic module bytes, so export is not a dead-code-elimination
  claim.
- Debug iPhone 18 Pro Simulator
  `AE11480D-B6B9-402B-BE8A-4F2BBD4D0704` ran the final DL4 bundle. All six
  Fixture Trips, P1/P2 Focus/Immersive return, Stay check-in/base/check-out,
  date navigation, NOW/TNS, empty Day and Light/Dark were exercised. Screenshots
  and read-only container counts are in `docs/qa/day-feed-lab-dl4/`.
- Native nonzero scroll was **not established in the final DL4 run**. A renderer
  regression asserts restoration at 217 px; accepted DL1 native scroll evidence
  remains separate. Do not infer a fresh native scroll PASS from that test.
- The task Simulator had 64 Trip tables, zero Trip rows, zero accepted Core read
  certificates and zero sync operations. Core DEV Read correctly remained disabled.
  No authorized adopted session or accepted local collection was available for a
  positive native Core/live DEV read. Physical-device execution was not run.

## Remaining dependencies and checkpoint

The production Core read path currently supports the owning P2 Flight bridge;
generic accepted Core-to-Feed P3–P6 reading still needs its own authority and
adapter. Flight E2E, final P3–P6 design, Flexible and TTR ownership, authenticated
live DEV data and physical-device acceptance are separate checkpoints. No fixture
result should be treated as an accepted Core certificate or Flight/Production gate.

**STOP — DL2 INTEGRATED / DL4 SHARED PORT READY FOR OWNER REVIEW.**
