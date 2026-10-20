# G2 controlled local-main integration

2026-10-12, Pacific/Auckland. Owner accepted `3ee685f` for bounded source integration.
Native/device and real-data acceptance are separate. No P3–P6 implementation.

## Pinned sources and scope

- Canonical main and local origin/main at start: `b5caa1f61cad1d8c612ee40142f3289f69715b5a`.
  Main was reconfirmed before integration; remote SSH failed DNS resolution, so
  remote freshness is unverified. No fetch/push or remote ref update.
- G2: `codex/day-feed-g2-recovery`, `3ee685f53c55f3d906201420c9e46e50a1d04687`,
  direct child of pinned main. Six-file candidate manifest verified. Source branch preserved.
- Flight adapter unit: `8e3916f4ae7848f83d442a891216e35b0f8eba3e`; owning B tip
  `fdd5a5c38660a7942b19fee0d65af7144d1aed19`; joined A/B tip
  `5544ba0b8d67f48f98ba3b456126adacb1eeca27`. All remain isolated, not ancestors
  of pinned main. Joined report explicitly retains its canonical integration gate.
- Latest separate Core W1–W5 branch `fb8dbc9` changes SQL acceptance tests/docs only
  relative to pinned main; Day read, CoreDayRow and occurrence views are unchanged.
- Integration checkout: `/private/tmp/otr-day-feed-g2-main-integration-20261012`,
  branch `codex/day-feed-g2-main-integration`, based on exact pinned main.
  Final integration commit is that branch tip; final main readback must match it.

Apply only the accepted G2 six-file change. Production source, tests and historical
recovery report are byte-identical to accepted `3ee685f`. The handoff is updated for
this integration, and this report is additive. No Flight Source/Capture/Core change
is imported merely because another branch is committed or has synthetic acceptance.

## Exact changed-file manifest

1. `docs/CURRENT_IMPLEMENTATION_STATE.md` — current bounded integration handoff.
2. `docs/architecture/TRIP_DAY_FEED_G2_RECOVERY.md` — accepted recovery inventory, unchanged.
3. `docs/architecture/TRIP_DAY_FEED_G2_MAIN_INTEGRATION.md` — this integration evidence.
4. `src/features/day-feed/DayFeed.tsx` — accepted single composer and dismissal wiring.
5. `src/features/day-feed/composition.ts` — accepted final-row owner/dormant ports.
6. `src/features/day-feed/composition.test.ts` — accepted fixture invariants.
7. `src/features/day-feed/render.test.ts` — accepted Focus/scroll/platform regressions.

No routes, Core contracts, schema, SQL/migrations, repositories, sync, auth,
UI primitives/catalogs, native configuration, dependency or lockfile changed.

## Composer and Adapter verification

Production flow is accepted v1 Day query → `composeDayStream` → existing P1/P2
renderer. Only this call constructs final rows and decides NOW hosting. E1B remains
upstream semantic input, not a row insertion path. No new automatic Focus policy.

The exact joined Flight branch has the same DayFeed/adapter production bytes as
`8e3916f`; no newer incompatible adapter was found. A disposable Git archive of
`5544ba0` was reconciled with accepted G2 against pinned main. One DayFeed hunk
required reconciliation: preserve `projection.version===2 ? projection.query(...) :
itemsForLocalDate(...)` and owning `flightFacts`, then use G2 rows/NOW only.
Both G2's interaction harness and Flight's exact added missing-field test were
retained. No changes were made to either owning branch or its worktree.

**Joined compatibility rehearsal: 9 files / 123 tests PASS, typecheck and UI guard PASS.**
Actual file SQLite→local Day reader, account/Trip fences, sparse/date-only/qualified
Flight facts, localDate selection and missing-field omission tests execute in that
archive. This verifies source-level supported v2 compatibility, not v2 runtime/main
activation. Current canonical main still lacks the separate Flight v2 Feed adapter.

## Acceptance boundaries

- Existing P1/P2 Browse geometry and compact Flight layout retained unchanged.
  TNS does not fabricate midnight; optional fields keep existing omission behavior.
- Exactly one manual Focus; NOW never steals it. Date/view context is unchanged.
  Tests cover nonzero Immersive scroll return, NOW ticks, enrichment and Android fallback.
- Flexible is dormant: explicit affiliation only, conflicting membership falls back
  to outer rows, each Item appears once, My/Group filters Choices only. Removing a
  supplied Block descriptor retains Items; no owning deletion/persistence/UI added.
- TTR is dormant: qualified synthetic `ttr-presentation/1` consumer only, relation
  identity separate from DayRow key, straight-line without mode and confirmed mode
  without ETA retained. NOW collision affects connector only. `openTtr` is intent;
  no provider observations, Apple ETA, route distance, cache or Controller activated.
- Production TTR remains blocked on Core role/occurrence/continuity authority.
  Same-day adjacent v1 Event anchors are the explicitly documented seam limit.
- No fresh native/Simulator/device/real-data validation, Hosted/Production/provider
  operation or build/install. Historical recovery evidence is not reclassified as PASS.

## Validation and baseline comparison

- Affected Day/Feed/Core regression subset: **9 files / 164 PASS**.
- Focused subset including architecture/navigation: **167 PASS / 2 baseline FAIL**;
  exact clean-main subset **156 PASS / same 2 FAIL**.
- Full clean-main `b5caa1f`: **3,609 PASS / 2 FAIL / 19 skipped**.
- Full integration: **3,620 PASS / same 2 FAIL / 19 skipped**. All 11 added tests pass;
  every existing test status is unchanged (random fixture UUIDs in table-test names
  normalized). Failure messages match after checkout path normalization. No new
  failures or skipped tests; no full-suite PASS claim.
- Baseline failures are unchanged `navigationLayout` tab-bar-wrapper assertion and
  `architectureBoundary` UI-test infrastructure scan. Neither guard was weakened.
- Typecheck, full lint/UI guard, changed-file Prettier and `git diff --check`: **PASS**.
  UI guard retains 473 baseline occurrences and checks 86 representative UI files.
- Latest joined Flight/G2 archive: **9 files / 123 PASS**, typecheck/UI guard PASS.
  Its adapter/scoping/CoreDayRow and missing-field tests remain exact owning source.

Full-suite logs/JSON and exact status/failure comparison are task evidence under
`/private/tmp/otr-g2-main-baseline-full.*`, `/private/tmp/otr-g2-integration-full.*`,
`/private/tmp/otr-g2-regression-comparison.json`; no test exclusion or baseline regeneration.
This checkpoint runs source/static/synthetic SQLite checks only; native/device and
Core v2 real admitted-data acceptance remain **NOT RUN**.

## Safe local-main advancement and concurrent preservation

Seven relevant checkouts were pinned by HEAD, porcelain, index-entry hash and dirty
file hashes. Canonical main has uncommitted current-state tail notes, one modified
Platform report, three untracked Platform reports and Python cache material. None
is staged into the G2 integration commit.

The handoff overlap was rehearsed in a disposable Git repository: retain original
working-file bytes as a suffix, prepend only the accepted new G2 handoff, index the
integration's committed handoff blob, then ordinary `git merge --ff-only` to the exact
integration commit. This permits Git to retain the dirty note suffix without a stash,
reset, forced ref update or dropping concurrent work. The post-merge index must have
no staged differences and the notes must retain exact original bytes.

Immediately before advancement, require unchanged main HEAD/index/dirty fingerprints,
unchanged tracked baseline handoff, exact prefix-only integration handoff difference,
and expected source ancestry. Any changed condition stops the operation for recheck.
Post-merge readback verifies main HEAD/index, accepted source files, dirty/untracked
path status and all prior unrelated file hashes. Evidence is retained under
`/private/tmp/otr-g2-main-integration-preservation.json` and the final result file.

## Remaining gates and next checkpoint

Local source integration does not certify native appearance, VoiceOver, live Dynamic
Type, offline native restart or real admitted data. Flight/W7 canonical v2 integration
has a separate owning decision. W6/P3 should use that approved read adapter and
role-bearing CoreDayRow keys, then implement only the first accepted P3 Stay slice.
Flexible's business owner and Core/TTR's authoritative occurrence port remain separate.

**STOP — G2 MAIN INTEGRATION COMPLETE / OWNER REVIEW**, after final main readback.
