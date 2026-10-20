# Ledger UI/UX Polish Round 2 — Entry Page Part 2 Acceptance

Date: 2026-09-16
Status: complete; stop before the next page

## 1. Modified files

- `app/(tabs)/expenses/_layout.tsx`
- `app/(tabs)/expenses/settings.tsx`
- `app/(tabs)/expenses/exchange-rates.tsx`
- `src/components/AppNavigationMenu.tsx`
- `src/data/db/migrations.ts`
- `src/data/db/database.test.ts`
- `src/data/repositories/ledgerReportingRepository.ts`
- `src/data/repositories/ledgerReportingRepository.test.ts`
- `src/features/ledger/LedgerStage6Screen.tsx`
- `src/features/ledger/dashboardPresentation.ts`
- `src/features/ledger/dashboardPresentation.test.ts`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`

## 2. Menu redesign

The top-left icon opens a compact menu anchored below the icon. Rows use icons, labels,
44-point targets and a separate selected state rather than CTA styling. Outside areas
dismiss the menu. The component is app-level and can be reused by future main modules;
Settings and Language are persistent entries. Existing real routes are Trip, Ledger and
Capture, so no unimplemented Album route was invented.

## 3. Settings implementation

Default Currency and Debug Mode are persisted in `ledger_preferences` by SQLite schema 18. Currency selection uses the existing supported ISO currency list. The selection is
not applied as an invented conversion: existing verified reporting currencies remain in
use until the Currency Module exists. Exchange Rates opens a clear not-available page
describing its future ownership without connecting a third-party provider.

## 4. Journey filtering and grouping

The selector derives lifecycle from Journey dates, groups Active → Upcoming → Past,
hides empty sections, places the selected Active Journey first, sorts Upcoming by nearest
start and Past by most recent end, and shows title, date range, member count, text status
badge and an independent selected check/highlight.

## 5. Hidden obsolete/test Journey identification

Normal mode excludes records that lack a valid lifecycle, actor context or member, plus
titles clearly marked as test/development fixtures (`test`, `fixture`, `synthetic`,
`simulator`, `acceptance`, `compatibility`, `blocker`, `smoke`, `prototype`, `legacy`,
`replay`, or `Stage <number>`). Debug Mode may reveal title-classified development data,
but still excludes broken records that cannot be entered safely.

## 6. Debug consolidation

The previous top-level sync status is removed. Network, current sync status, environment
and selected Journey now live in one low-priority Debug Information section at the end of
the dashboard. Debug Mode off renders neither title, container nor spacing; the persisted
toggle is re-read whenever Ledger regains focus.

## 7. Screenshots

- `/private/tmp/otr-part2-settings.png`
- `/private/tmp/otr-part2-debug.png`

Both were captured from the dedicated `OTR Part2 QA` iPhone 17 Pro Simulator. The menu,
Settings navigation, toggle state and Debug Information visibility were also inspected
through the Simulator accessibility tree.

## 8. Automated and device validation

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 66 files / 230 tests pass.
- Focused migration/repository/presentation tests: 3 files / 17 tests pass.
- `git diff --check`: pass before commit.
- iOS Release Simulator build: pass; installed and interacted with on dedicated QA device.
- Signed `iphoneos` Release build: pass; installed and launched on Leon's iPhone 16 Pro
  as `com.xoery.otrmobile` version `0.1.0 (1)`.
- Dev Backend: `https://api-dev.xoery.art/health` returns development `status: ok`.

## 9. Future Currency Module work

The module still needs owned rate retrieval, caching, refresh, offline fallback, missing
rate reconciliation and optional manual override before Default Currency can safely drive
converted primary amounts. This round only persists the preference and establishes the
correct settings structure.

## 10. Destructive Journey cleanup

No destructive cleanup is required for this UI fix, and no Journey record was deleted or
archived. The selector applies reversible local visibility rules. If permanent cleanup is
later desired, it should be a separately reviewed data operation with an authoritative
archive/status field rather than title heuristics.
