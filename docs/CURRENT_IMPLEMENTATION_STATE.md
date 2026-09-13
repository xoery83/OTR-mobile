# Current Implementation State

Date: 2026-09-14

## Current Milestone

Ledger 2.0 Stage 9 is complete in Hosted Dev. The explicit Expense
settlement-participation vertical slice, v3 transformation, private recovery
rehearsal, guarded transactional Europe Replay load, independent verification,
idempotent replay, and two-client Mobile Release acceptance all passed.
Production remains disconnected and unchanged. Stage 10 has not begun.

Current Mobile SQLite schema version: 17.

## Settlement Participation And Stage 9 v3 Gate Delivered

- Canonical Expenses now carry `settlementParticipation = INCLUDED | EXCLUDED`;
  existing and normal new Expenses default to `INCLUDED`.
- `EXCLUDED` remains canonical `ACCEPTED` spending/consumption truth while
  Settlement, Adjustment and pre-settlement debt vectors omit it with stable
  non-blocking reason `EXCLUDED_FROM_SETTLEMENT`.
- Participation changes reuse the revisioned Financial Core mutation,
  authorization, conflict and audit path. SQLite migration 17 and Hosted Dev
  migration `20260913000600` are applied; no Production schema changed.

- Fixed seven-table/column Production extractor with no arbitrary SQL, RPC,
  method, table, column, filter, Auth, Storage, Functions, or external endpoint
  input; the authenticated extractor completed one approved two-pass Production
  run and committed the matching raw bundle outside Git.
- Existing RLS intentionally denies the retired dedicated Session Pooler reader.
  The approved replacement uses one existing real Journey member/creator access
  token through the exact authenticated PostgREST origin, with GET-only CSV
  requests, no refresh capability, deterministic keyset pagination, and two-pass
  source-set consistency verification.
- Pass A writes only a private candidate. Transform requires an fsynced
  `COMMITTED` receipt and digest inside an atomically renamed read-only `raw/`
  directory; failed or interrupted candidates are not accepted.
- Deterministic HMAC/UUIDv8 transform, exact ISO minor-unit conversion,
  pseudonymization, DRAFT/accepted classification, and privacy rejection.
- Evidence-bounded `legacy-equal-rounding-normalization-v2` promotes only proven
  shared/equal independently rounded residuals. Stable mapped-member ordering
  and `ledger-largest-remainder-v1` produce exact destination splits while
  provenance binds the historical stored-share evidence and states that the
  normalized participant amounts are not claimed historical values.
- Separate private approval manifest with exact grouped financial totals and a
  repo-safe summary that omits all exact totals.
- Service-role-only transactional replay function and guarded local/Hosted Dev
  loader; migrations `20260913000500` and `20260913000600` are applied to the
  approved Hosted Dev project. The approved replay was imported once and its
  canonical second invocation was idempotent.
- Synthetic fixture covers accepted equal split, proven legacy residual, `stats_only`,
  custom split, missing payer, and inexact zero-decimal currency.
- Imported review DRAFTs, when present, retain participants for correction
  context but no authoritative splits or valuation and remain excluded from
  Spending, My Ledger, authoritative analysis, Settlement and Adjustment.

## Stage 8 Delivered

- authoritative structured deterministic validation, distinct from persisted
  versioned heuristic Review findings;
- immutable finding observation context plus append-only acknowledge/dismiss
  actor history; actions never mutate financial truth;
- Review v1 rules for possible duplicates, amount/rate outliers, evidence
  mismatch, and participant anomalies;
- scope-safe versioned Ledger cursors with stable `INVALID_CURSOR`, controlled
  bootstrap recovery, atomic page application, and multi-page continuation;
- durable-operation due-time enforcement, process claims/leases, interrupted
  operation recovery, exponential backoff with jitter, auth pause, and terminal
  domain failure classification;
- redacted backend routes and count/size-only support diagnostics;
- whitelist-only completed-operation cleanup and authenticated size/SHA-256
  receipt re-download proof before uploaded-copy eviction;
- coalesced foreground/background operational sync and non-blocking Release
  cold start using the embedded bundle and cached SQLite state;
- Hosted Dev review/action schema and `REVIEW_FINDING` feed, deployed only after
  compatible Mobile and Backend support.

No AI model, Production mutation/deployment, payment provider, Stage 10 scope,
or new architecture framework was added.

## Validation Status

- TypeScript, ESLint, and all 52 test files / 191 tests pass.
- A private PostgreSQL plain-SQL/COPY backup of all Hosted Dev `public` data was
  restored into an isolated local Supabase environment. All 92 tables and 1,860
  rows matched by count and deterministic content digest; 681 constraints were
  validated, 275 foreign keys had zero orphans, and all 21 migrations plus the
  sequence state matched. Auth credentials/session material and Storage object
  binaries remain outside the approved backup scope.
- Hosted Dev independently contains the approved 1 Journey / 8 members / 126
  Expenses / 531 participants / 531 splits / 126 rate snapshots / 126 active
  valuations, with 68 INCLUDED, 58 EXCLUDED, 69 normalization provenance rows,
  no DRAFTs, and no import Review findings or fabricated financial history.
  Exact split reconciliation, zero-sum INCLUDED settlement, deterministic IDs,
  duplicate checks, and privacy scans passed.
- The canonical second import produced zero new rows, updates, revision changes,
  or additional change-feed effects and retained the same target and financial
  fingerprints.
- Two Release Simulator clients passed normal Auth -> Backend -> Hosted Dev ->
  SQLite v17 bootstrap/pull. Spending, Search, and Analysis included all 126;
  Settlement used only 68 INCLUDED inputs and excluded 58; My Ledger server and
  cache agreed; incremental pull was empty and duplicate-free. With Backend and
  Metro stopped, both clients cold-started from the cached 126/68/58/531 state.
- The approved replay mapping contains one linked organizer and seven unlinked
  members. Both Simulator clients used that same approved linked identity; the
  unmapped creator was denied by the normal read path and no mapping was inferred.
- An isolated fresh Supabase instance replayed the complete migration chain and
  all 200 pgTAP checks passed. The canonical manifest is 92 tables / 1,293
  columns; all 92 public tables have RLS. Participation persistence, one-step
  revision, Financial Core audit, stale-toggle conflict and Stage 9 import
  mapping are covered.
- The final synthetic ETL run passed deterministic IDs, exact money, equal
  allocation, privacy rejection, dual-manifest generation, transactional local
  load, full rollback with zero residual rows, and idempotent replay with zero
  changes.
- The real v3 transform produced 126 ACCEPTED Expenses: 68 settlement-included
  and 58 settlement-excluded. There are zero loadable DRAFTs, one unloadable
  row and zero legacy-settlement exclusions. All 69 normalized rows passed the
  legacy evidence/provenance gate. All accepted original/settlement splits
  reconcile exactly; DRAFT authoritative rows and privacy hits are zero. The
  deterministic replay is byte-identical and the committed raw digest remained
  unchanged. Dataset digest:
  `be1fce8c0a4a681e2f520484401317a9ba3611cab1d0636f1c07bee754268a49`.
- Targeted iPhone 17 Pro Simulator Release acceptance passed Spending inclusion,
  Settlement exclusion, stable explanation, exact Adjustment delta and root/
  delta zero-sum behavior; the native OFF control displayed the approved copy.
- The compatible Backend ran on the existing LAN Dev endpoint against only the
  approved Hosted Dev project. A dedicated authenticated compatibility Journey
  passed create/read/update, default `INCLUDED`, explicit `EXCLUDED`, bootstrap,
  incremental pull, Spending/search/analysis, Settlement preview/finalization,
  participation-toggle Adjustment, and final `EXCLUDED` restoration checks.
- The compatible Mobile Release was built and installed on the iPhone 17 Pro
  Simulator. Normal Auth -> Backend -> Hosted Dev bootstrap and full pull both
  hydrated SQLite v17 as two `INCLUDED` and one `EXCLUDED` Expenses without
  dropping or coercing participation.
- Stage 6/7 targeted regression passed 11 files / 34 tests; affected Backend and
  repository regression passed 7 files / 49 tests; Stage 4B/7 database pgTAP
  passed 71 checks. TypeScript and targeted ESLint are green.
- The older Stage 7 acceptance Journey had eight pre-existing `CHANGED` items in
  a zero-transfer Adjustment preview. This gate did not finalize that unrelated
  state and used the isolated compatibility Journey instead; no product/API
  compatibility defect was found.
- The authenticated REST synthetic HTTP gate passes multi-page and composite
  keyset pagination; duplicate/missing/out-of-order rejection; Pass A/B
  insert/delete/update and presence-count drift detection; JWT TTL, role,
  issuer, and Journey visibility rejection; REST-only request construction;
  token-canary non-leakage; and candidate non-commit after failure.
- Hosted Dev migrations `20260913000300` and `20260913000400` were applied in
  order after the compatible Release Mobile and Stage 8 Backend were available.
- Hosted Dev generated 13 heuristic findings. One acknowledge action retained
  actor history, and the canonical financial fingerprint was identical before
  and after the action.
- Malformed, wrong-Journey, wrong-user/version, and impossible-continuation
  cursors return `INVALID_CURSOR`. A real 298-change pull completed in three
  pages with zero duplicates; interruption replay and controlled-bootstrap paths
  pass automated tests.
- Backoff, restart recovery, concurrent-wakeup single claim, cache/DB cleanup,
  protected receipt originals, and sensitive-canary redaction tests pass.
- Two Release Simulator clients authenticated as organizer and creator and each
  converged to SQLite v16, 13 findings, and the same one-row action history.
- With Backend stopped, both apps force-quit and cold-started from the embedded
  Release bundle, immediately rendering the same cached Review data without
  losing pending/conflict/durable state.
- Stage 4–7 affected regression tests pass. Existing stable financial state
  machines and Settlement/Adjustment/Payment/export lineage were unchanged.
- Leon's iPhone 16 Pro on iOS 26.6 passed Release online bootstrap, Review
  display/actions, force-quit persistence, offline cached cold start without
  Metro, retry/backoff restart, repeated background/foreground convergence,
  large Dynamic Type, long Chinese reason text, and critical VoiceOver checks.
- Final read-only device validation reported `integrity_check = ok`, SQLite v16,
  13 findings (2 acknowledged, 1 dismissed, 10 open), 3 append-only actions,
  zero duplicate actions/operation identities, and no `PENDING`, `PROCESSING`,
  or `RETRYABLE` residue. Completed operations had no residual due-time or lease.
- Financial, Settlement, Adjustment, and audit tables had zero row differences
  from the pre-action physical baseline. Three uploaded local receipt copies
  remained present because Hosted Dev returned no authenticated canonical
  content; the recovery gate correctly refused eviction.
- User-triggered count/size-only diagnostics passed schema, canary, and actual
  device-sensitive-value scans with no token, receipt/OCR content, person name,
  note, or financial amount exposure.
- Repository formatting still reports only the pre-existing unrelated
  `AGENTS.md` and `src/hooks/useStage4BPhysicalSmoke.ts` formatting debt.

## Authoritative Sources

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/adr/0016-ledger-stage-8-review-and-hardening.md`
- `docs/ledger/LEDGER_2_0_STAGE_9_IMPORT_DESIGN.md`
- `docs/adr/0017-ledger-stage-9-import.md`
- `docs/adr/0018-ledger-settlement-participation.md`

## Next Checkpoint

Stage 9 is finished. Retain the private raw, mapping, transformed, backup,
manifest, and acceptance receipts until the approved rollback window expires;
cleanup requires the existing retention review. The next product milestone is
Stage 10 and requires separate explicit approval.

## Safety Notes

Legacy OTR Web was inspected read-only only for the Stage 9 writer semantics and
was not modified. Production extraction and mapping-only access were GET-only,
RLS-authorized, and are disconnected; their local token copies were removed.
SQLite remains the Mobile local source of truth. Pending/conflict durable
operations, receipt originals without proven canonical recovery, immutable
financial/audit/history facts, Settlement/Adjustment lineage, and required
offline exports are never cleanup candidates.

Further Stage 9 Production access is prohibited without new explicit approval.
No additional Stage 9 load or rollback is authorized. Exact Production totals
remain outside Git unless separately reviewed and approved.
