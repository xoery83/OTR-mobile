# Expense Consistency Closure — Phase 3 Backend/SQL gate

2026-09-29. **Local and authorized Hosted Dev gates PASS.**
Phase 4 formal UI also passed its separate gate. Deployment and isolated fixture acceptance are
recorded below. No LAWSON / ce SHi22 recovery, Settlement Confirm, Production
access, commit or push.

## Migration and API

- Forward migration: `supabase/migrations/20260929000100_expense_consistency_v2.sql`;
  parent tail `20260928000100`. Clean local migration reset succeeds.
- Two service-only, RLS-enabled append-only tables: `expense_revision_evidence`
  (successful canonical/history + normalized digest + observed base/digest),
  `expense_conflict_outcomes_v2` (lifecycle, reason, resolution association,
  resulting revision and original-command operation receipt). Old 409s are not rewritten.
- Completed v2 idempotency results are immutable. Table ACLs reject evidence/outcome
  UPDATE/DELETE/TRUNCATE; triggers also enforce append-only changes.
- Existing CREATE / PUT / DELETE / RESTORE / valuation endpoints accept a typed
  envelope branch. Route/intent/key validation occurs before dispatch. Legacy full
  aggregates retain strict CAS; no server patch inference.
- Existing conflict-resolution endpoint accepts the v2 covered-ID/digest request;
  GET Expense conflicts returns complete chain and tombstone. Bootstrap/pull include
  additive chain metadata even on empty pages; tombstone events carry canonical data.
- Contract details: `docs/API_CONTRACT.md`; shared DTOs in
  `src/data/api/ledgerMutationContracts.ts` and `ledgerReadContracts.ts`.

## Trust and transaction boundaries

1. Backend ignores client `observedBase` for merge decisions. It reads immutable
   successful server history. SQL verifies the selected historical record and digest;
   missing or forged history cannot authorize stale merge.
2. The existing shared three-way helper compares financial input, user split input,
   UTC descriptive fields and server provenance. Only compatible descriptive changes
   retain newer automatic server valuation. Conflicting financial input, explicit
   valuation divergence and same-field descriptive divergence remain conflicts.
3. Backend prepares a validated candidate. SQL locks the idempotency scope and
   Expense, rejects prepared/current revision drift, checks permissions/reasons and
   frozen inputs, verifies historical/causal proof, complete chain digest and covered
   scope/ownership, and preserves the original typed intent.
4. One `ledger_execute_expense_v2` RPC owns nested legacy mutation/valuation calls,
   immutable per-conflict outcomes, compatibility closure rows, financial/closure
   audit and resolution result. Legacy conflict insertion/resolution participates in
   the same Expense lock. Failure after mutation rolls **all** these effects back.
5. Descriptive SQL updates only descriptive fields/revision and preserves valuation
   and split identities. Financial patches invalidate derived valuation or recompute
   existing SAME_CURRENCY logic. Explicit valuation uses existing trusted quote,
   preview, policy and frozen guards. DELETE calls DELETE; RESTORE is independent.
6. Covered primary intent is RESOLVED; covered earlier intent may be SUPERSEDED;
   uncovered rows stay OPEN. Compatibility projections into the existing resolution
   table keep rates, reporting, review and Settlement guards aware of v2 closure.
7. Resolution replay validates the same request hash and returns the stored response
   before changing head/history/quote preparation. Original-command receipts in
   outcomes retain original IDs/keys; only server-proven APPLIED advances causal CAS.
   KEPT_SERVER/SUPERSEDED cannot become APPLIED. Known successful legacy mutations
   supply server evidence without guessing a patch or trusting a local queue flag.
8. Audit metadata records rule version, intent, normalized base/current/result and
   digests plus preserved fields. KEEP_SERVER/equivalent closure audits do not create
   a fake Expense revision. Normal equivalent commands receive their own audit/receipt.

## Validation

- SQL regression: **29 suites / 604 assertions PASS**.
- Phase 3 SQL checks: **60 assertions PASS**. Includes actual automatic ECB
  valuation followed by descriptive preservation; forged/missing historical base;
  3 conflicts with 2 covered and 1 OPEN; DELETE round-trip; forced post-mutation
  closure failure/rollback; exact response-loss replay; no repeated revision/audit;
  typed valuation closure; explicit RESTORE; KEEP_SERVER/equivalence; original-key
  causal receipts; non-APPLIED rejection; scope, revision/chain drift, frozen and
  permission rejection; immutable receipt/outcome/evidence and service-only RPC.
- Backend/HTTP/affected client regression: **9 suites / 136 tests PASS**. New gateway
  tests cover client-base forgery, compatibility evidence, DELETE preparation,
  equivalent UTC, replay before reads, SQL error mapping and tombstone/legacy chain.
  HTTP tests cover route/key/intent/permission/covered-ID boundaries. Existing legacy
  HTTP and SQL 4B/4C mutation/resolution tests pass.
- TypeScript, scoped ESLint/Prettier, Backend build and diff checks PASS.
- RLS matrix expected shape updated for the current migration tail: 107 public
  tables / 1488 public columns, with RLS on all 107 tables.

## Hosted Dev rollout gate and rollback

The approved checkpoint requires a separate Hosted Dev migration/deployment safety
and authorization flow. Target is **only** `tuqigdxrvrerfewsxqgm`; verify target and
remote tail before any write, then review the exact migration dry run. Do not reset
Hosted Dev, replay incident commands, or run seed/import against it.

Apply the additive migration first, deploy the reviewed Backend snapshot with the
explicit Dev Compose path from `docs/ops/DEV_BACKEND_DEPLOYMENT.md`, then run isolated
Dev API/SQL acceptance and verify fixture counts/health. Preserve previous Backend
snapshot/image for rollback. Roll back Backend only if needed; retain immutable
schema/evidence/outcomes and do not reverse audit data. Legacy clients remain strict
CAS; typed/lifecycle action-required guards remain in force. Do not restart unrelated
services. Production remains outside every step.

The Owner supplied the separate Dev rollout authorization. Hosted acceptance below
passed; Phase 4 client/UI integration is authorized with the next stop at its gate.

## Reviewed artifact hashes

- Migration SHA-256: `930166ac307f2590d0e762e1e8e7c0ea41220a3c40f0e47bef5a18aced765135`.
- Built Backend SHA-256: `2e751d841d3111c16f5238ac735926bb55a334ff40e8babf97395c8c4368f23a`.
- HEAD remains `d7e3ffff4ee260512bf96f5948371ad7262318ed`; shared pre-existing
  changes and accepted Phase 1/2 work were retained. No commit/push was requested.

## Hosted Dev deployment and acceptance — PASS (2026-09-29)

- Target: `tuqigdxrvrerfewsxqgm`, Backend `https://api-dev.xoery.art`, environment `development`. Verified remote tail `20260928000100`; dry run listed only `20260929000100`, then applied it.
- Release: `expense-v2-20260929`; SQL SHA-256 `930166ac307f2590d0e762e1e8e7c0ea41220a3c40f0e47bef5a18aced765135`.
- Backend artifact SHA-256 `c9570134bba72fad2e3d30b163be76293e9905417f0d076aeb55acea19859260`; image `sha256:ec18c74682adcde811daf57854d012f263e9d6c3e1a4f22d40b8a6fa22192b82`. Healthy. Previous image/source retained under `/opt/otr/dev-backend/releases/expense-v2-20260929`.
- Real Hosted acceptance exposed CREATE's JSON-null current snapshot edge; Backend now omits absent current evidence. SQL unchanged.
- Runnable acceptance: `scripts/supabase/validate-expense-consistency-v2-hosted.ts`; fixture Journey `5e8bc715-500c-4828-8d42-0986c50a177d`, Expense `141d08ee-2a56-537d-aed7-23a54eb04307`.
- PASS: automatic newer valuation + typed descriptive merge, preserved valuation/splits; real financial divergence; unknown/forged client base; DELETE/RESTORE direct and conflict lifecycle; 3 conflicts covering 2 leaves 1 OPEN; exact response-loss resolution replay with unchanged revision/audit/outcome counts; revision/digest drift; permission/frozen rejection; legacy full-aggregate strict CAS; UPDATE tombstone rejection; bootstrap + empty pull authoritative metadata.
- Current v40 API parsers accept optional additions; legacy endpoint shape unchanged. Frozen fixture inserted directly in isolated Journey; Settlement Confirm never executed. LAWSON/ce SHi22 untouched; Production not accessed.
- Owner authorized proceeding directly to Phase 4 on this PASS.
