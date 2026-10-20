# Expense Consistency Closure — Phase 4 formal UI gate

2026-09-29. **Phase 4 PASS — local contract and formal native Hosted Dev acceptance.**
Owner unlocked the Mac and acceptance resumed. Stop at this gate; Phase 5/6 have
not started. This gate does not authorize incident recovery.

## Delivered

- One ordinary `/expenses/conflict/[id]` route, backed by the real deployed Hosted
  v2 read/resolution contract. Expense Detail, Ledger/Review Needs Attention,
  Data & Sync, and Settlement blockers share it. Lists include local deletions.
- Business comparison includes current/submitted money, payer, participants, shares,
  category, date, note and lifecycle, using member names rather than identifiers.
  Explicit selection: Use latest value, Use my changes,
  Continue deletion, Restore Expense, Use my value, or verified equivalence.
  Additional changes are replaced only when explicitly included. Unverified legacy
  UPDATE offers latest-value discard only; no guessed patch/lifecycle mutation.
- SQLite v41 stores account-scoped chain cache and immutable resolution responses.
  Bootstrap/empty pull metadata discovers OPEN rows; digest changes invalidate the
  full cached read. Metadata alone never invents closed outcomes.
- Existing durable queue/worker/transport carry an independent resolution request,
  stable body/key and original typed intent. Confirmation atomically verifies and
  stores original command receipts, covered closure, latest projection, completion
  and APPLIED dependency wake. Later intent and uncovered OPEN rows survive.
- Actual decision records drive pending/confirmed/failure feedback. A stale review
  requires checking the latest value and a new choice, with no Retry/Force Sync.
  Permissions and confirmed Settlement protection are enforced locally and remotely.
- Routine reconciliation, automatic merge, reference FX refresh, queue retry and
  normal confirmation stay silent. Technical IDs/proof remain in the contract/audit;
  normal labels use business language. Rate details retains existing provenance.

## Verified

- 10 affected Backend/client suites / 167 tests PASS; TypeScript, scoped ESLint and
  Prettier PASS. Checks include typed binding/attempted legacy preservation, DELETE
  round-trip, transaction rollback, covered/uncovered closure, immutable receipt
  replay, later RESTORE preservation, empty-pull discovery of local tombstones,
  account scoping/generation rollback, cache drift, durable restart, exact lost
  response replay, old rejected review not overriding later confirmed deletion,
  and business presentation. Missing original-command proof is rejected atomically.
- The architecture guard now accepts the new feature imports. Its pre-existing
  LedgerStage6 direct diagnostic API import still fails the global guard; it is not
  introduced by this slice and remains recorded rather than hidden.
- Signed native Release built for the dedicated `OTR Expense Phase 4` iOS 26.5
  simulator, UUID `1B538F6A-8CB2-45BD-B0E2-02F5AFE8DA60`. No physical device or existing
  user simulator install. The fault-injection build is acceptance-only, not release.
- Latest normal Release build/signature verification PASS, response-loss flag absent:
  version `0.1.0 (1)`, SQLite v41, JS bundle SHA-256
  `6574bf12df38acb41c28195583ad83b8e290d23fadf49a03bc1e2085fcc09a75`.
  App path `/private/tmp/otr-expense-consistency-phase4-build/Build/Products/Release-iphonesimulator/OTRMobile.app`.
  Final normal artifact installed and ordinary Needs Attention → Review changes
  verified against Hosted Dev. Cached sign-in survives installation/restart.
- Isolated Hosted Journey `6add274b-2e51-4b09-9d5f-a66c87c4c034`. Fixture scripts:
  `scripts/dev/create-expense-conflict-ui-fixture.ts` and
  `scripts/dev/bootstrap-expense-conflict-ui-fixture.ts`. The latter applies the
  validated real bootstrap through the existing repository into only this dedicated
  mirror and represents a local deletion there. Credentials stay in mode-0600 tmp.
- Normal account sign-in passed after ad hoc signing enabled SecureStore. Ordinary
  Ledger showed all three changes needing review, including the locally deleted
  Expense. Expense Detail → Review changes fetched the real full chain and presented
  both saved financial and DELETE intents with business actions.
- During that ordinary review, an isolated API command advanced the Expense from
  revision 2 to 3. Continue deletion created a real operation, showed pending, then
  received actual `409 REVISION_CONFLICT`. The persisted operation became CONFLICT;
  UI showed “This Expense changed while you were reviewing it. Check the latest
  value before choosing again.” No generic retry/force action appeared.

## Formal native Hosted acceptance PASS

All actions used ordinary app routes on the dedicated iPhone simulator. No Smoke
or Debug screen counted toward acceptance. Three isolated Expenses are A (deletion),
B (shared amount), C (review drift); their server IDs are recorded below.

| Entrance / scenario                        | Observed result                                                                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expense Detail → Review changes            | Real full Hosted chain; submitted NZ$45 versus latest NZ$32 and separate DELETE intent. Stale decision displayed pending then actual revision rejection.                                                                                              |
| Ledger Needs Attention → local deleted A   | Tombstone reachable although omitted from current totals/ordinary recent list. Continue deletion covered only DELETE; financial change remained OPEN.                                                                                                 |
| Settlement preview → blocker B             | Backend reported OPEN conflict blockers; business row opened the formal review. Use latest value explicitly covered two changes; DELETE RESOLVED, financial change SUPERSEDED. No Settlement Confirm.                                                 |
| Settings → System Health → Data & Sync → C | Ordinary attention row opened the same real contract. Explicitly covered choices reached confirmed state.                                                                                                                                             |
| Response loss → durable replay on A        | Pending and retryable decision visible, same body/key replay completed automatically, immutable local receipt present, one server mutation only.                                                                                                      |
| New C deletion / revision drift            | Cached revision 3 decision rejected after actual server advance to 4. Choice buttons stayed disabled; Check latest value fetched 4 before a new decision succeeded. Earlier failed decision remained auditable and did not override final projection. |
| Final normal Release / A                   | Only A still needs review. Latest status deleted, payer and shares named; only Use latest value offered, disabled until a fresh group note. No UPDATE resurrection.                                                                                   |

### Replay and closure evidence

A `83dbe706-67e1-5372-a259-8adfdc16bac3`:

- Explicit deletion operation `ledger-resolution_mulrgynh_0c4kk69cvt`, key
  `ledger-idempotency_mulrgynl_p08rfndl9l`. Before response loss: revision 2,
  ACCEPTED, 2 audit rows, 0 resolution outcomes. After the successful server command:
  revision 3, DELETED, 4 audit rows, 1 RESOLVED outcome. Same-key replay preserved
  those exact counts; stored request body/key comparison PASS.
- Covered DELETE `80118853-9895-42cc-81ab-8b19d4c35806` is RESOLVED;
  uncovered financial `1f7503ae-aac4-4584-b35e-5e88974ec3d6` remains OPEN.
  Native queue COMPLETED with one resolution response. The dropped response caused
  a real retryable record before confirmation; no second mutation/revision/audit.

B `e233b34e-7785-5572-82fb-ad8a3bff39c3`: selected DELETE
`e68643e9-e431-460b-ad45-a924fc981e75` RESOLVED and explicitly covered financial
`c90058dc-b7b1-4dbd-ba33-e07f21e73aa1` SUPERSEDED in the same server transaction.

C `4283f479-3fca-5294-843b-3b45166ab90a`: real drift rejection key
`ledger-idempotency_mulrq1em_x7k7bwze16` remains CONFLICT. Fresh decision key
`ledger-idempotency_mulrryn9_dmsmh059op` COMPLETED against revision 4. Final Expense
projection ACCEPTED / revision 4 / SYNCED; all three covered conflicts closed.

Final normal UI evidence:
`/private/tmp/otr-expense-phase4-final-normal-review.txt` and
`/private/tmp/otr-expense-phase4-final-normal-review.png`. Fixture audit count
snapshots/request comparisons are acceptance artifacts in `/private/tmp`; no
credentials are included in this report. After the final business comparison
changes, the 25-test causality/presentation suite, TypeScript, scoped lint and
format checks passed again. The 167-test affected gate above remains the broader
contract validation, not a claim that the unrelated global guard passes.

## Deployment and safety

Phase 3 Hosted PASS/deployed SQL, image, source and rollback hashes remain in
`EXPENSE_CONSISTENCY_PHASE_3_BACKEND_SQL_GATE.md`. Hosted tail is `20260929000100`,
project `tuqigdxrvrerfewsxqgm`, Backend `https://api-dev.xoery.art`. v40 API compatibility
passed; Phase 4 adds local v41 without another Hosted migration/deployment. No
Production connection/check/write, Settlement Confirm, LAWSON/ce SHi22 mutation or
recovery, commit or push. Incident recovery remains Phase 6.
