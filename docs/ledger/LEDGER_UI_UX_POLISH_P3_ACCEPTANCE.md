# Ledger UI/UX Polish P3 Acceptance

Date: 2026-09-14  
Status: accepted; stop before P4

## Delivered

- Dedicated native Expense Search with a 200 ms debounce, keyed stale-response
  rejection, exact matching count, cached SQLite results and clear retry/empty states.
- One repository-backed filtered-results screen for Search, Dashboard category
  drill-down, Analysis bucket drill-down and See All.
- Native page-sheet Filter form with draft/Cancel/Apply behavior, exact/custom date
  ranges, Today, Yesterday, This Trip and secondary Last 30 days presets.
- Active Filter tint/count plus removable labels that reflect the committed repository
  query. Mine/Group and drill-down origin remain visible.
- `FlatList` windowing with stable IDs and 50-row repository pagination for Expense
  results; Review also moved from eager `ScrollView.map` rendering to `FlatList`.
- Analysis retains its committed scope/dimension/range projection, orders Time
  chronologically, uses exact localized day labels and correct singular/plural copy.
- The top-right Add Expense route remains reachable without mounting prototype state.
  A narrow repository-backed bridge preserves pre-P4 create and title-edit capability;
  the approved P4 interaction redesign remains unimplemented.

## Post-P3 Architecture Follow-up

- The crash fix had restored the old review prototype's in-memory business-state
  provider because `/expenses/new` still rendered its `QuickExpenseScreen`.
- The provider was not a renamed production context: it owned fixture Expenses,
  Transfers, Journeys, draft allocation, save/edit/conflict and Settlement actions.
- Normal app routes no longer import `ledger-prototype`. The dormant prototype remains
  isolated and removable; `/expenses/new` uses only the real Ledger repositories and
  existing domain rules, while obsolete prototype split/rate routes return to it.

## Validation

- TypeScript and ESLint pass.
- Targeted Search/reporting/Analysis/Review/P1/P2/architecture tests pass: 9 files,
  20 tests.
- The combined 10,000-Expense first-page/count/summary repository baseline completes
  in 69 ms on the acceptance host, below the existing 250 ms target.
- iOS Expo export passes. Release builds pass with zero errors for Simulator and the
  connected iPhone 16 Pro.
- Release Simulator with Europe 2026 UI Polish verified 133-result windowing,
  multilingual/emoji/long-title rows, 200 ms search, Filter draft cancellation and
  atomic Apply/removal, exact category/day totals, chronological Time ordering and
  push/back state retention. Europe 2026 Replay was not mutated.
- Physical iPhone verified Search/Filter reachability, keyboard entry, row scanning
  and one-time maximum Dynamic Type. The large-text pass found and fixed Filter header
  overlap and Search amount wrapping; the repeated pass succeeded. Simulator
  accessibility output confirmed field, filter-removal, row and action labels.
- The post-P3 prototype-removability guard passes, and the rebuilt Release bundle has
  no `ledger-prototype`, `LedgerPrototypeProvider` or prototype-fixture marker. The
  Europe 2026 UI Polish Simulator navigation smoke opens `/expenses/new` without a
  crash or business-state mutation.

## Boundaries

No Backend endpoint, schema, Supabase data, financial rule, FTS, index, cache, chart,
new dependency, P4 Expense redesign, P5 workflow restructuring or P6 diagnostics work
was added.
