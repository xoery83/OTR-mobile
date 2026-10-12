# DL2 Core v2 read integration acceptance

2026-10-12 · DL1 INTEGRATED / DL2 READ INTEGRATION COMPLETE (owning P2 subset).

## Delivery and ownership

Local canonical main is `c0a69204fab3e663356a7f34406d580147869aeb`, retaining
accepted DL1 commits `81b2192`/`fb0aba7`. Remote stays `12693e3`; no push.
DL2 branch: `codex/day-feed-lab-dl2`, worktree
`/private/tmp/otr-day-feed-lab-dl2-20261012`, based on that main. DL2 is committed
separately and is not merged into main. Final commit is recorded by Git history.

Canonical original dirty handoff bytes survive as an exact suffix and unrelated
dirty/untracked files survive unchanged. Eight-worktree preservation evidence:
`/private/tmp/otr-dl1-main-preservation-result.json`. Flexible's six source files
changed independently during the preservation window; its HEAD/index remained
unchanged. No concurrent feature was imported or edited by this task.

## Actual interfaces and capability

Implemented Core v2 DTO/codecs and actor-scoped accepted SQLite repository are
available. DL2 uses `readAdoptedLocalSession`, `captureAccountScope`,
`createTripCoreV2Repository.captureContext/acceptedTripIds/acceptedSnapshot`,
`createCoreFlightDayFeedReader`, `CoreFlightDayProjection.query` and the existing
`composeDayStream` / `DayFeed`. Discovery is a current Account's local partial
accepted collection catalog, never a complete server roster.

The owning Flight bridge already integrated on current main matches owning
`8e3916f`; newer Native Flight `b10e076` leaves its two files unchanged. DL2
reuses it without merge or duplicate transformation. Core certificate versions
2/2/1, completeness, access revision, revocation, actor permissions, Account
identity and generation remain enforced. No pending prediction is authoritative.

Fixture remains available with all five synthetic scenarios. Core DEV Read is
enabled only after adopted-session validation and at least one permitted accepted
local collection. Errors mask Core data; Account changes immediately mask old
selection and projection and reject late callbacks. Fixture/Core records are
never combined. Refresh revalidates local reads only; it does not sync or fetch.
Expired adopted access tokens retain the established offline access rule.

Supported Core presentation is the owning P2 Flight projection, including sparse
Flight P1 geometry. Other Core families are explicitly unsupported; actual P1
Items are not transformed by an invented adapter. W0/provider/Capture interfaces
and unactivated remote transports do not confer runtime read availability.
P3–P6/Flexible/TTR remain dormant. Booking/Ticket/Participant facts are not invented.

Source/Account/Trip/date changes remount the same Feed and clear stale Focus.
Fixture selection is retained independently when returning from Core. Core Trips
use UUID labels; date choices derive from accepted boundary dates plus UTC view
days for empty-day selection. Core uses the current clock; Fixture retains its
fixed clock. G2 preserves accepted role/date DayRow keys, including both grouped
same-day Flight endpoints. No second Feed, Composer or authority model.

## Validation

- Focused Day/Feed/Lab/Core/Flight: 13 files /160 PASS.
- Final full suite: 3727 PASS /same2 baseline FAIL /21 skipped. Exact Phase A
  integration had3718 PASS; exact clean-main baseline3711 PASS. All9 new DL2 tests
  pass. Baseline failures remain `navigationLayout.test.ts` (tab-wrapper
  TypeError) and `architectureBoundary.test.ts` (diagnostics-test import scan).
- Typecheck, full lint/UI guard, changed-file formatting and diff check PASS.
  Guard retains473 existing occurrences/88 representative files; no forgiveness.
- Disposable synthetic actor-scoped SQLite tests cover multiple/empty Trips,
  SELF/private visibility, A→B→A, late callbacks, optional missing Flight fields,
  version/completeness mismatch, stale access/revocation, no cross-Trip leakage
  and accepted row roles. Render tests exercise source switching, Fixture date
  restoration, immediate Account masking and disabled auth capability.
- Release route isolation test passes: redirect before loading Lab. Existing DL1
  Release export evidence is retained; DL2 does not change entry guards. Metro
  retaining synthetic modules is not represented as dead-code elimination.

## Native execution evidence

Same isolated Debug app/native dependencies, final DL2 JS served by Metro8091.
Simulator `AE11480D-B6B9-402B-BE8A-4F2BBD4D0704`, iPhone18 Pro/iOS27;
bundle `com.xoery.otrmobile.devtest`. Other devices/apps preserved.

All five Fixture scenarios executed; native source selector and fail-closed Core
gate PASS. P1 and Flight Browse/Focus/Immersive return, date switching, NOW/TNS,
empty-day state and Light/Dark executed. Core button remains disabled with generic
UNAVAILABLE. No cause is inferred for the native session/read failure.
Read-only post-run SQLite:64 Trip tables/0 rows,0 Core certificates; durable
operation counts are recorded in `../qa/day-feed-lab-dl2/acceptance.json`.
No fixture persistence or canonical writer invocation. Screenshots in that folder
contain only synthetic app content.

Nonzero scroll restoration was accepted in DL1; the final DL2 gesture attempt did
not establish a changed offset, so it is not a fresh DL2 nonzero-scroll PASS.
Core mode switching/Trip geometry is synthetic-test PASS, not native positive
Core acceptance. Real authenticated DEV and native positive Core are BLOCKED:
no authorized session was supplied and no accepted collection is installed.
Physical-device testing was optional and not run.

## Remaining checkpoint

DL3 should first provide an authorized existing adopted DEV session and accepted
actor-scoped local read through the owning runtime; then verify native Core
source/Trip/date, Focus/NOW and nonzero scroll. No Seed/auth bypass is implied.
General Core P1 integration needs an owning presentation interface; P3 needs
separate renderer approval. No migration, Hosted write, provider, deployment or
Production activation was performed.

## Changed-file manifest

- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/PRODUCT.md`
- `docs/adr/2026-10-12-day-feed-lab-read-only-core-port.md`
- `docs/architecture/OTR_DAY_FEED_LAB_DL2_READ_PORT.md`
- `docs/architecture/OTR_DAY_FEED_LAB_DL2_REPORT.md`
- `src/data/repositories/tripCoreV2Repository.ts`
- `src/data/repositories/tripDayFeedLabRepository.ts`
- `src/data/repositories/tripCoreV2DayFeedRepository.test.ts`
- `src/features/day-feed-lab/DayFeedLabScreen.tsx`
- `src/features/day-feed-lab/fixtureCatalog.test.ts`
- `src/features/day-feed/DayFeed.tsx`
- `src/features/day-feed/composition.ts`
- `src/features/day-feed/render.test.ts`
- `src/ui/catalogs.ts`
- `docs/qa/day-feed-lab-dl2/` — four screenshots, acceptance counts, validation summary.
