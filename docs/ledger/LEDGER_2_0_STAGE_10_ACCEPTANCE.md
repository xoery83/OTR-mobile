# Ledger 2.0 Stage 10 Comprehensive Acceptance Report

Date: 2026-09-14
Environment: Hosted Dev only (`tuqigdxrvrerfewsxqgm`), local Supabase, iOS
Simulator, and Leon's iPhone 16 Pro
Overall result: **PASS — Ledger 2.0 functionally complete**

The approved Europe 2026 Replay remained read-only throughout Stage 10. All
write, conflict, correction, payment, race, and stale-finalization scenarios
used isolated synthetic Journeys. No Production request, schema change, or data
mutation was performed.

## 1. Automated / Domain / Backend / Database — PASS

- TypeScript and ESLint pass.
- Vitest passes 53 files / 197 tests, covering allocation, currency, valuation,
  settlement, audit, authorization, payload validation, repositories, restart,
  sync retry/idempotency, pull/tombstone/conflict, import, privacy, and checksums.
- Local Supabase passes 200 pgTAP checks. Two clean migration/reset runs produced
  the same schema with no diff: 92 tables, 1,293 columns, 681 constraints, 308
  indexes, 73 functions, 86 triggers, 92 RLS-enabled tables, 178 policies, and
  three buckets.
- Two Stage 10 harness defects were corrected and revalidated: Release builds
  now receive the statically referenced Stage 4C environment variables, and
  Stage 3 My Ledger acceptance reads the same `ALL` period it refreshes.
- The Prototype Exit gate adds direct checks for all five approved split modes
  and for retryable ordering of dependent valuation/payment operations behind
  an offline Expense create.

## 2. Synthetic Multi-Client — PASS

All mutations targeted isolated synthetic Journeys, never Europe Replay.

- Organizer and member edits to different field groups produced the approved
  explicit revision-conflict behavior; concurrent Financial Core edits exposed
  the canonical revision and changed groups rather than silently merging.
- An ordinary member could submit a correction but received `403` for direct
  financial mutation. Offline correction survived restart; acceptance was
  atomic and audited; withdraw/reject races were first-writer terminal.
- Partial Paid `777` remained non-discharging until a separately authenticated
  recipient recorded Received; confirmation then discharged exactly `777`, with
  `4,223` remaining.
- A delete at revision 2 beat a stale edit, which returned
  `REVISION_CONFLICT`; the canonical tombstone remained authoritative.
- A one-input settlement preview became stale after an accepted Expense was
  added. Finalization returned `SETTLEMENT_INPUT_STALE`; regeneration produced
  two inputs and a different digest.
- Release Stage 4C two-client acceptance passed conflict-envelope persistence,
  Keep Journey, Keep Mine, resolution races, authorization, offline correction,
  audit, and stale-correction preservation.

## 3. Europe Replay Real-Data Acceptance — PASS (Read-Only)

- Exact canonical state: one Journey, eight members, 126 ACCEPTED Expenses, 68
  INCLUDED, 58 EXCLUDED, 531 participants, 531 exact splits, 126 active
  `LEGACY_IMPORTED` valuations, zero DRAFTs, and zero import findings.
- Bootstrap completed in 2.926 s. Pull returned 126 unique changes over two
  pages; the next incremental pull returned zero.
- Spending and Analysis contained all 126 Expenses. Search returned the first
  100 matching rows through the bounded query contract. My Ledger had no
  unvalued or conflicted rows.
- Settlement preview was `PREVIEW_READY`, used exactly 68 inputs, explained all
  58 exclusions as `EXCLUDED_FROM_SETTLEMENT`, produced zero-sum balances and
  six transfers, and completed in 669 ms.
- A before/after bootstrap fingerprint was identical after removing the server
  timestamp. Privacy-canary scan returned zero hits.
- Only bootstrap, pull, reporting/search/analysis/My Ledger reads, and the
  documented non-persistent settlement-preview calculation were invoked. No
  Europe command, finalization, or persistent mutation was sent.

## 4. iOS Simulator — PASS

- A fresh Release install authenticated, bootstrapped Europe Replay, persisted
  SQLite v17, and reproduced 1/8/126, 68/58, 531/531, and 126 valuations.
- Spending, Search, Analysis, My Ledger parity, settlement calculation, and an
  empty duplicate-free incremental pull passed.
- With Backend unavailable, a force-quit cold launch read the same Europe state
  entirely from SQLite.
- Separate synthetic Release acceptance passed fresh bootstrap, opaque cursor
  persistence/advance, 11 My Ledger summaries, one deferred canonical change,
  restart integrity, and unauthorized Europe Journey rejection.
- With `OTR_DISABLE_LEDGER_PROTOTYPE=1`, a Release build opened the normal real
  Expense form for the synthetic Journey. With Backend stopped it created an
  ACCEPTED NZD Expense locally, queued create and SAME_CURRENCY valuation
  operations, survived force-quit/cold-start, reopened its detail and edit form,
  saved a title edit as revision 3 with a durable RETRYABLE update, and later
  synchronized its create after Backend reconnect. A discovered
  dependency-order regression was fixed: unsynced valuation/payment evidence is
  now RETRYABLE rather than terminally FAILED; the repaired offline run retained
  both create and valuation safely for the next authenticated retry.

## 5. Physical iPhone — PASS

On Leon's iPhone 16 Pro, a signed Release build passed:

- online Europe bootstrap/reporting/settlement-preview/My Ledger acceptance at
  SQLite v17;
- Backend-unavailable force-quit cold launch with the same 126/68/58/531 cached
  state and 126 valuation/rate references;
- reconnect and incremental pull with zero duplicates and My Ledger parity.
- The final Prototype Exit signed Release, built with
  `OTR_DISABLE_LEDGER_PROTOTYPE=1`, installed and launched on the same device;
  the normal synthetic `+Expense` deep link opened and the process remained
  healthy. No physical-device mutation was required for this minimal rerun.

Airplane Mode was represented by Backend unavailability, matching the already
approved physical-device method; no unsafe device setting automation was used.

## 6. Architecture / Production Safety — PASS

- Architecture boundary tests confirm UI/domain code does not directly access
  SQLite or Supabase business tables.
- Active negative tests prove Mobile rejects the Production URL, Backend rejects
  it before client creation, and the Stage 9 importer rejects it before any
  network call.
- Vitest configuration now also fails during configuration when either a Mobile
  Supabase URL or `SUPABASE_PROJECT_ID`/`SUPABASE_PROJECT_REF` names a non-Dev
  target. Both Production-ref negative invocations exited non-zero as expected.
- All Stage 10 network activity was limited to localhost/LAN Backend and the
  approved Hosted Dev ref. Production received zero network access and zero
  schema/data mutation. The legacy Web repository was not written.
- Normal app and Ledger source outside the retained prototype directory has zero
  `ledger-prototype` import. The Expenses layout has no prototype provider/theme,
  the main tabs use a neutral app icon component, and `new`, `split`, and `rate`
  all resolve to the repository-backed creation flow.
- The architecture test actively scans normal TypeScript routes/source and fails
  on any prototype import. Metro also throws during resolution when
  `OTR_DISABLE_LEDGER_PROTOTYPE=1`; both Expo export and signed Simulator/device
  Release builds passed with that guard active.
- The old prototype feature flag is not read by the normal Ledger composition.
  Prototype source is retained only as removable reference code.

## 7. Final Definition of Done — PASS

The normal `+Expense` path now uses the existing repository and sync coordinator
for merchant/title/date/category, payer, participants, five split modes,
original money, INCLUDED/EXCLUDED, valuation/rate evidence, receipt entry,
validation, local-first save, offline persistence, and durable synchronization.
Detail/edit, Settlement, Review, Spending, Search, Analysis, and My Ledger remain
reachable without prototype composition.

All Stage 10 conditions now pass: real repository/API capability coverage;
durable, restart-safe and idempotent local writes; authenticated Journey access;
Europe privacy/financial integrity; separated synthetic and real-data
Simulator/physical acceptance; repository boundaries; active prototype removal
proof; current documentation; and zero Production or legacy Web mutation.

There are no remaining functional-completion blockers for Ledger 2.0. This
result does not authorize Production planning, deployment, or UI/UX polish.
