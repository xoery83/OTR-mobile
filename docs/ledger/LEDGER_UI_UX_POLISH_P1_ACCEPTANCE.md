# Ledger UI/UX Polish P1 Acceptance

Date: 2026-09-14

## Status

PASS. Implementation, automated tests, Release Simulator and minimal physical-iPhone
acceptance pass.

P2 has not started.

## Delivered

- Spending Mine/Group and Journey changes commit one keyed projection containing the
  matching Journey, scope, summary and Expense rows. Analysis, Search, My Ledger and
  Settlement use the same committed-context rule.
- A small latest-request token rejects stale results. Settlement additionally gates
  cached/finalized state and async action results by active Journey.
- Search waits 200 ms after text changes, loads rows and summary together, and loads
  filter/Journey metadata once per mounted Journey instead of per query.
- Analysis day buckets display calendar dates and open Search with the exact half-open
  day range. The applied single-day filter shows the full localized date and year.
- Conflict, missing rate, no personal share and not-in-settlement are distinct human
  messages. Raw enum/debug identity, revision, digest and lineage wording was removed
  from the touched ordinary Expense and Settlement views.
- Settlement participation is a descriptive row followed by a native explicit
  confirmation. No write occurs before confirmation, and the existing revisioned
  repository command remains unchanged.
- Touched ordinary Journey, Expense and Analysis dates use calendar-date formatting
  without inventing a time. Touched screens retain local data during refresh and expose
  local updating, retry/error, offline and empty states.

No Backend, schema, Supabase, financial-domain default or settlement semantics changed.

## Evidence

- TypeScript: pass.
- ESLint on all touched TypeScript/TSX: pass.
- Targeted Stage 6/7/9/10 and P1 tests: 17 files / 50 tests pass, including reporting,
  Expense revision/participation, conflict/review, settlement/payment, Stage 9 import,
  UI Polish fixture, architecture boundary, date formatting and deliberately
  out-of-order latest-request completion.
- Prototype-disabled Release Simulator build: pass.
- `Europe 2026 UI Polish`: 133-row local data loaded; rapid Mine/Group, Analysis
  dimension and Search query changes ended on the requested matching label, total and
  rows. The rate-required and settlement-excluded examples showed distinct labels.
- Analysis `25 Jul 2026` drill-down: exact five-Expense Mine result and matching total.
- `Europe 2026 Replay`: read-only cached projection loaded with the verified Mine total
  of CNY 46,379.79; no Replay mutation was performed.
- Offline Release Simulator: the Dev Backend process was paused, the app cold-started,
  cached Journey inventory and the UI Polish Mine projection reopened, then the exact
  Backend process was resumed and confirmed listening.
- Simulator settlement-participation confirmation: pass. The explanatory destructive
  confirmation appeared and was cancelled, preserving fixture state.
- Physical iPhone 16 Pro: signed Release build/install/launch pass. The UI Polish
  Expense detail stayed stable while scrolling to settlement participation; tapping
  Change presented the explanatory confirmation without an immediate write. Cancel
  dismissed it cleanly and preserved the Expense.

## Acceptance boundary

No Dashboard/navigation redesign, Search/filter redesign, Expense P4 redesign,
Settlement P5 redesign or Developer Mode work was included. P1 is accepted; work stops
here pending separate authorization for P2.
