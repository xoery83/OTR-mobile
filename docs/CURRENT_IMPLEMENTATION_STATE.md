# Current Implementation State

Date: 2026-09-13

## Current Milestone

Ledger 2.0 Stage 8 is physically validated and complete. Implementation,
automated validation, approved Hosted Dev deployment, two-client Release
Simulator acceptance, and physical iPhone Release acceptance all passed on
2026-09-13.

Current Mobile SQLite schema version: 16.

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

No AI model, Stage 9 import, Production deployment, payment provider, or new
architecture framework was added.

## Validation Status

- TypeScript, ESLint, and all 50 test files / 161 tests pass.
- Local Supabase validates through two clean migration replays, 189 pgTAP tests,
  identical manifests, and an empty schema diff. The canonical manifest is 92
  tables / 1,292 columns; all 92 public tables have RLS.
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

## Authoritative Stage 8 Sources

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/adr/0016-ledger-stage-8-review-and-hardening.md`

## Next Checkpoint

Stage 8 is complete. Stop before Stage 9 Europe Journey replay import and any
Production work; either requires separate approval.

## Safety Notes

Production and legacy OTR Web were not inspected or modified. SQLite remains the
Mobile local source of truth. Pending/conflict durable operations, receipt
originals without proven canonical recovery, immutable financial/audit/history
facts, Settlement/Adjustment lineage, and required offline exports are never
cleanup candidates.
