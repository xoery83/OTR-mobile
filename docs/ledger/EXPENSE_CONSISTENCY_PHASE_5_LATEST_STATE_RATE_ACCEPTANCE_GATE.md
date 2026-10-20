# Phase 5 — Latest-state Rate Acceptance gate

Date: 2026-09-29. **PASS: automated + authorized Hosted Dev acceptance.**
Approved checkpoint / ADR 0056 remain authoritative. Phase 6 recovery has not started.

## Delivered behavior

- Each displayed candidate binds Expense local/server revision, original Money,
  economicDate, Journey settlement currency/scale, displayed decimal rate and
  reference date. Online acceptance uses existing Journey reconciliation and a
  fresh reference snapshot before comparing the actual business choice.
- Revision advancement alone is insufficient. Material Money/date/Journey currency
  or displayed-rate drift invalidates the old choice. Rate comparison is exact
  rational comparison, even where rounded settlement amounts happen to agree.
- Compatible automatic REFERENCE_RATE can be explicitly accepted as MANUAL_AGREED
  without an artificial conflict. Explicit existing valuation choices require
  separate evidence; background automatic valuation cannot replace valid agreed rates.
- Offline acceptance persists the bound intent in the existing command transaction.
  Reconnection uses the original operation/key and actual operation receipts.
  Batch returns confirmed / pending / conflict / retryable / terminal per Expense,
  permits partial success and retains pending results across screen re-entry.
- Receipt reconciliation preserves later local intent, including deletion. Account
  changes invalidate in-flight work; interruption during the local transaction rolls
  back valuation and command together. Journey currency is rechecked inside that
  transaction. No blind revision substitution or alternate retry lifecycle was added.
- Routine refresh, reconciliation and background confirmation remain silent. Explicit
  choices show business feedback and actual operation outcomes. KEPT_SERVER and
  SUPERSEDED are not presented as an applied agreed rate. Frozen Settlement feedback
  directs the user to correction with the organizer. Rate details retain provenance.

## Backend / SQL / API boundary

Migration: `20260929000200_latest_state_rate_acceptance.sql`.
SHA-256: `573d85579716d6ec94f93b4296ec6ecd65327a75c44f91a56e4c41e2ec1c9976`.

Typed APPLY_VALUATION gains optional strict `rateAcceptance` evidence. Backend verifies
server-owned historical evidence; SQL rechecks narrow VALUATION_REBASE eligibility
under the existing Expense lock and checks actual Journey currency/scale. Admission,
valuation mutation, audit and receipt remain within the existing guarded transaction.
Permission, frozen Settlement, prepared revision, conflict-chain and replay guards
remain effective. KEEP_SERVER never prepares the rejected valuation again.

The additive field does not change legacy full-aggregate strict CAS. SQLite remains
v41, with no new local table/version: binding uses existing intent JSON and receipts.
Existing v40 request contract is still accepted; the current v41 client consumes the
additive read/typed contract. Existing endpoints and FX policy are unchanged.
An already identical, confirmed MANUAL_AGREED value is a business no-op, with no new
operation or fabricated receipt. Actual new choices report their own operation result.

## Automated evidence

| Check                                                              | Result                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| Affected client / domain / API / Backend tests                     | 11 suites, 170 tests PASS                              |
| Final transactional account-interruption and Backend regressions   | 2 suites, 45 tests PASS (subset of affected suites)    |
| SQL regression gate                                                | 30 suites, 623 assertions PASS                         |
| New latest-state SQL suite                                         | 19 assertions, included above                          |
| TypeScript, scoped ESLint / formatting, Backend build, diff checks | PASS                                                   |
| Normal signed Simulator Release build / signature                  | PASS; build only, not a new native UI acceptance claim |

Tests cover latest displayed-rate validation, automatic versus explicit evidence,
financial/date/currency divergence, offline save, partial batch outcomes, account
interruption, causal receipts, lost response, later intent/tombstones and legacy CAS.
SQL replay assertions verify no additional valuation, revision or audit.
The pre-existing LedgerStage6 global architecture guard import failures recorded in
Phase 4 remain outside this slice; this report does not claim a clean global guard.

## Authorized Hosted Dev release

- Target project: `tuqigdxrvrerfewsxqgm`; API: `https://api-dev.xoery.art`.
- Preflight remote tail: `20260929000100`; dry run contained only this new migration.
  Owner separately authorized Phase 5 deployment and isolated acceptance.
- Final remote tail: `20260929000200`; Backend environment is development and healthy.
- Release directory: `/opt/otr/dev-backend/releases/latest-state-rates-20260929`.
- Deployed source artifact SHA-256:
  `922832df8d37c33002c8e05fc18d46db4c9c85bbcd86c752356147e1d48aed39`.
- Deployed image:
  `sha256:61339996dcb83503896a91392fe947516f66a30161ef29b853336e85a592997a`.
- Rollback source: release directory `previous-source.tgz`; image tag:
  `otr-dev-backend:pre-latest-state-rates-20260929`. Forward migration is additive;
  old request shapes remain compatible. No destructive down migration was performed.
- Normal simulator bundle SHA-256:
  `d2d70d3bcb4a9664d258a568cb039f344abe643cf47801bfdfd6931b856fd8d0`.
  Version `0.1.0 (1)`, SQLite v41, no response-loss override. No Phase 5 device install.

## Hosted acceptance evidence

Runnable check: `scripts/supabase/validate-latest-state-rate-acceptance-hosted.ts`.
It asserts the Dev project and uses synthetic fixture identities and one isolated
Journey. It does not select or recover the incident Expenses.

Final result: `PHASE_5_HOSTED_DEV_PASS`.
Journey: `2b5932b9-8415-4574-8266-ad3686ee99b4`.
Primary Expense: `cc7e1e1d-74eb-54d5-b2ab-1429c253da45`.

1. Displayed offline intent plus newer compatible automatic reference accepted
   without conflict: initial Expense revision 1, automatic reference 2, manual choice 3.
2. Discarded first response and replayed identical request/key: original response;
   counts remain revision **3**, audits **3**, valuations **2**. Subsequent automatic
   scan preserves the valid MANUAL_AGREED value with no additional mutation.
3. Amount drift rejects old acceptance without applying the choice.
4. Original currency drift rejects old acceptance without applying the choice.
5. economicDate drift rejects old acceptance without applying the choice.
6. Displayed rate drift rejects even when rounded settlement Money matches.
7. Permission rejection leaves the valuation choice unapplied.
8. Authoritative bootstrap retains the agreed value and current additive read contract.
9. Explicit Journey currency preview/commit invalidates the old displayed choice.
   Only fixture conflicts generated by this check were closed through actual v2
   KEEP_SERVER with covered IDs/digest before that authorized fixture currency change.

The manual-protection assertion precedes the explicit Journey currency change; it
proves protection while that agreed value remains valid for the current currency.
Fixture setup failures encountered guards rather than bypassing them; corrected
runs use valid splits, current fixture revisions and the Journey currency API.

Local evidence files: `/private/tmp/otr-phase5-automated-gate.log`,
`/private/tmp/otr-phase5-sql-gate.log`, `/private/tmp/otr-phase5-hosted-acceptance.json`,
`/private/tmp/otr-phase5-hosted-final-tail.txt`, `/private/tmp/otr-phase5-normal-build.log`.

## Stop gate

Phase 5 PASS; wait for a separate Phase 6 recovery instruction. LAWSON / ce SHi22
remain untouched. No Settlement Confirm, Production connection/read/migration/deploy,
commit or push was performed. Shared pre-existing work is retained.
