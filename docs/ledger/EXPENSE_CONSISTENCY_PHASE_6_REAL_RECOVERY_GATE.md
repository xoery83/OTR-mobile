# Phase 6 — Real incident recovery gate

2026-09-29. **Phase 6 PASS — Expense Consistency Closure PASS.** Hosted Dev only.

## 1. Automated tests

- Final integrated path: **18 suites / 264 tests PASS**, including canonical/read
  convergence, causal commands, typed resolution/replay, receipt atomicity, pending
  overlays, attachments/no-op, UTC classification, rate batch acceptance, account
  interruption, Data Health, HTTP permission/key/intent validation and server proof.
- SQL: **31 suites / 640 assertions PASS** after migration 20260929000300; includes
  17 new actual guarded legacy-equivalent/negative/replay assertions. SQL unchanged
  by the final local metadata fix. Existing financial, frozen, permission, chain,
  strict-CAS, tombstone and transactional rollback checks remain PASS.
- TypeScript, scoped ESLint/Prettier, Backend build and signed normal iPhone/Simulator
  Release builds PASS. No new dependency, FX policy or sync architecture.
- Same-revision regression verifies that closure audit IDs and later server timestamps
  enter the shared canonical boundary, then survive older equal/lower-version input.
  Formal chain reads also reconcile the protected local projection in that transaction.

## 2. Hosted Dev server evidence

The owner separately authorized the generic legacy equivalent admission patch.
Pre-release target `tuqigdxrvrerfewsxqgm` and remote tail 20260929000200 were verified;
dry run contained only `20260929000300_legacy_expense_equivalent_resolution.sql`.
Deployment and final migration listing confirm tail **20260929000300**. No data patch.

| Artifact            | Deployed value                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| API / environment   | `https://api-dev.xoery.art` / `development`, healthy                      |
| Backend release     | `/opt/otr/dev-backend/releases/legacy-equivalent-20260929`                |
| Source SHA-256      | `0549560b66b12beb8ff511cefb4b1467b6b0480b73f942455f34cbdf78b01dd5`        |
| Backend image       | `sha256:5542e19321def80f8d4e0463af1f5b3a92e3f79cf533651dc86eefd6cbcd19b4` |
| Migration SHA-256   | `904f7356a702ddeebde793530fbcafa912f9a34d7cfe9b8085154bee1f278f31`        |
| iPhone JS bundle    | `9ef2f5f0c3b07732343ec430d3feb0d5c3582b6f83fef5295728fe006d381ebf`        |
| Simulator JS bundle | `bc404bf418ca07f3bc696c76df95d4621918cc7b6fd7eef3a24fdf459a725e0a`        |
| Local schema        | SQLite v41; additive contract remains v40 compatible                      |

Rollback: release `previous-source.tgz` and image tag
`otr-dev-backend:pre-legacy-equivalent-20260929`; retain append-only server evidence.
The fix admits an empty legacy UPDATE only from immutable successful server history
plus the original stored 409 submission. The SQL transaction independently verifies
that proof; old full-aggregate mutation writes retain strict CAS. No incident IDs/names
in product logic, no backfill, no conflict/resolution row edits or blocker clearing.

| Real record | Server outcome                                                                | OPEN | Revision | Audit / valuation rows |
| ----------- | ----------------------------------------------------------------------------- | ---: | -------: | ---------------------- |
| LAWSON      | DELETE RESOLVED, covered earlier valuation SUPERSEDED; tombstone              |    0 |        3 | 4 / 1                  |
| ce SHi22    | ACCEPT_EQUIVALENT UPDATE RESOLVED; USD2300 → NZD4056 REFERENCE_RATE preserved |    0 |        2 | 3 / 1                  |

LAWSON adds one real deletion audit and one closure audit. ce SHi22 adds only one
closure audit, with no new Expense revision or valuation. Two same-key API replays
per original formal resolution return the exact saved response and leave all counts
unchanged. These incident replays verify ambiguous-result recovery without pretending
the initially delivered native response was lost; original loss-before-confirmation
coverage is reused from the accepted Phase 3–5 gates and rerun worker/SQL tests.

## 3. Formal UI recovery evidence

Actual original data containers and cached auth were preserved during Release updates:

- **LAWSON:** Leon’s iPhone16pro, UDID `00008140-001C2980269B001C`, iOS 26.6.
  Ledger → original Journey → Needs Attention → Review changes. Selected Deletion,
  explicitly covered the earlier value choice, entered
  `Continue deletion and replace the earlier value choice.`, pressed **Continue deletion**.
  Actual request choice CONFIRM_DELETE; no rate acceptance first. Observed pending
  disabled actions, then **Decision saved**, earlier change **Replaced by a decision**,
  and **0 saved changes need review**.
- **ce SHi22:** original iPhone 17 Pro Simulator, UDID
  `BCC677C3-5823-44B1-BCEA-C24287AD6E4A`, iOS 26.5. Ordinary Needs Attention →
  Review changes displayed USD23 / NZD40.56 and **Use latest value**. Entered
  `Keep the latest value; the earlier save made no business changes.` and submitted.
  Actual choice ACCEPT_EQUIVALENT; observed **Finishing this change…**, then
  **Your decision is saved**, Decision saved and zero changes.
- Screenshots/AX observations were captured inline during computer use. No Smoke/Debug
  recovery controls were used. Existing device Debug preference was on during initial
  historical-fixture navigation; ordinary resolution screens were used throughout.
  Simulator normal-mode final Journey/Expense Detail shows USD23 / NZD40.56, Rate details,
  intact two attachments and no Needs Attention/Changes/technical footer.
- No revision/CAS/canonical/queue/operationId/conflict-chain terminology was observed in
  the business recovery choice/result. Rate provenance remains behind Rate details.
  Completed read-only resolution routes are deliberately revisited for verification;
  they are not a new attention workflow or a second decision.

## 4. Post-restart convergence

[Before snapshot](evidence/expense-consistency-phase6-before.json) was captured before
recovery writes. [Final evidence](evidence/expense-consistency-phase6-after.json)
contains scoped local/server canonical, projection, complete lifecycle chain,
operations, immutable resolution response, preview, counts and replay assertions.

Both original apps ran normal sync/pull, actual process restart, then formal fresh
read and normal active pull. Complete local baseline equals current server canonical
with UTC encodings and array ordering normalized, including closure audit evidence.
Local projection/status/original Money and active valuation identity match. No pending
or terminal incident operation, no remaining deferred incident item, and OPEN counts
are zero on both sides. Immutable resolution receipts prove APPLIED/SERVER_CONFIRMED;
covered original DELETE is APPLIED and old valuation is SUPERSEDED.

LAWSON retains its historical inactive local MANUAL_AGREED draft as evidence; only
the existing server REFERENCE_RATE identity is active on the tombstone. No extra
server valuation or duplicate local active valuation was created. The tombstone is
absent from normal spending and cannot be resurrected by stale UPDATE/response.
Both local audit ID sets match server evidence. The final client metadata refinement
handles equal-revision closure audit/timestamp convergence through ordinary reads;
no manual SQLite intervention or local-only conflict repair occurred.

Original-device Data Health checks completed. Neither incident generated a
`data_health_repair_events` row. Account-wide old synthetic fixtures still produce
attention; they were not silently closed. The phone owner assisted with scrolling,
checking and final read-only routes after macOS iPhone Mirroring input crashes.

## 5. Settlement Preview / Adjustment Preview

Before recovery both current preview contracts returned corresponding OPEN_CONFLICT
blockers. After recovery all four requests return **200 / blockers []** for the actual
Journey/root Settlement and current cutoff. No Settlement Confirm request was sent.
A mistaken future cutoff earlier in read-only snapshot collection was correctly
rejected; authoritative evidence uses actual current time. Existing finalization,
freeze, permission, economic-date, source-cutoff and conflict guards are unchanged.

### Phase E / supplemental regression mapping

Each row PASS uses the final integrated suites/SQL plus accepted Phase 1–5 Hosted
fixture evidence where applicable; the two real incident recoveries are new native
and Hosted evidence. Prior gates are linked below, not represented as freshly rerun
Hosted mutations against the incidents.

| Scenario                                                 | Evidence                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| E1 automatic valuation then acceptance/delete            | Phase 3/5 Hosted fixtures; causal/rate/SQL tests; real LAWSON                     |
| E2 offline intent, restart, reconnect                    | Causality/worker/queue/rate tests; accepted native gates; original restarts       |
| E3 failed pull batch does not advance cursor             | ReadRepository convergence and transaction tests                                  |
| E4 multi-conflict covered/uncovered closure              | SQL 3-conflict fixture and rollback; real LAWSON covered pair                     |
| E5 DELETE round-trip/no resurrection                     | Typed worker/HTTP/SQL/tombstone tests; real tombstone after restart               |
| E6 late valuation/correction/resolution vs newer delete  | Shared causal reconciliation tests                                                |
| E7 partial batch/409/5xx/loss/account boundary           | Rate acceptance/coordinator/worker tests; accepted Phase 5 Hosted/replay          |
| E8 real amount/payer/split/date and frozen record        | Domain/HTTP/SQL negative gates; legacy proof rejects real change                  |
| E9 equivalent closure restores server previews           | Generic evidence predicate + SQL transaction; real ce SHi22, no local-only repair |
| E10 real deletion, pull, both preview guards             | Both original-device snapshots/receipts and four real Preview calls               |
| S1 no-change Save emits no UPDATE                        | ExpenseRepository / causality / no-op contract tests                              |
| S2 attachment-only edit preserves financial aggregate    | EditAttachments tests                                                             |
| S3 title/note patch preserves automatic server valuation | Three-way contract / Backend proof / SQL / Phase 3 Hosted                         |
| S4 real financial edit requires choice                   | Domain, Backend, HTTP, SQL negative gates                                         |
| S5 equivalent UTC encoding is not descriptive change     | Contract helper + server-stored legacy no-op predicate; real ce history           |
| S6 older deferred/input cannot regress canonical         | Read convergence + causal tests and real zero-deferred snapshots                  |
| S7 read-only server value is not acceptance proof        | Formal presentation / operation results / actual native pending-confirmed         |
| S8 event revision differs from aggregate revision        | Contract/read/canonical tests; original historical feed evidence                  |

Accepted prior evidence: [Phase 3](EXPENSE_CONSISTENCY_PHASE_3_BACKEND_SQL_GATE.md),
[Phase 4](EXPENSE_CONSISTENCY_PHASE_4_FORMAL_UI_GATE.md),
[Phase 5](EXPENSE_CONSISTENCY_PHASE_5_LATEST_STATE_RATE_ACCEPTANCE_GATE.md).

## 6. Remaining known limitations

- No Production access or Production readiness claim. No Settlement Confirm or push.
  Owner subsequently authorized the completed Closure checkpoint commit; independent
  pre-existing Settlement changes are preserved outside that commit.
- Pre-existing repository-wide architecture failures in LedgerStage6 diagnostic direct
  API/sync imports and Account Switching RN Flow test loading remain outside this slice;
  this report claims the scoped final integrated and SQL gates, not every global suite.
- Other synthetic account conflicts/failures remain genuine separate test state.
- macOS iPhone Mirroring crashed in scrollWheel → ScreenContinuityUI → UniversalHID
  with SIGTRAP four times during verification. Automated mirror scrolling was stopped;
  the owner completed the phone checks. These were Mac mirror process crashes, not
  OTR process crashes. No new OS tooling or UI workaround was added to the product.

Final complete evidence assertions PASS. Stop at this Phase 6 gate; no further business action is authorized by this report.
