# CP04A3-CORE-ORDER-02 — canonical integration readiness

2026-10-13 · **READY FOR SEPARATE OWNER INTEGRATION APPROVAL. STOP AT OWNER REVIEW.**

## Exact pins and integration plan

- Verified local/actual remote main: `065bdd96d334cfa4818178cb715dfd7ff14b5289`;
  canonical tree `bb12a174c4b38e4312fd2c40c26897c5a9e71507`.
- Frozen accepted TTR branch `codex/cp-ttr04a3-core-order-02` remains at
  `a027f2ad0703d853afc6fa490a8b5734bbd2e454`, tree
  `5339789db54f345e13f7667a9a2e67196398e211`, clean and unchanged.
- Isolated readiness branch `codex/cp-ttr04a3-core-order-02-canonical-prep`, worktree
  `/private/tmp/otr-cp-ttr04a3-core-order-02-canonical-prep-20261013`.
- Normal merge commit `f43f0e03dbcbf495f7733765334303fdaa97c9cd`, tree
  `5b1e07ac1e08d0edca83f97798526a9d24688207`; parents are exact verified main and
  exact accepted TTR HEAD. A documentation-only follow-up adds this report and
  readiness prefix. Exact final candidate HEAD/tree and hashes are recorded in
  `/private/tmp/otr-core-order-prep-final-evidence-20261013.json` and the handoff.
- Proposed integration after separate approval: normal fast-forward from the
  unchanged canonical baseline to the final candidate. If main advances, verify
  ancestry/tree and preservation again; no force, implicit rebase or rebuilding.

## Preservation and resolved overlap

Before the merge, only current-state and SQL acceptance runner overlapped. All34
accepted TTR paths outside those two files remain byte-identical, including every
production module, SQLite migration, PostgreSQL00200, test, fixture and contract.
All55 canonical changes since the TTR base outside those two paths remain
byte-identical, including G2/Flexible, Flight authority, Source fixtures and reports.
LLM roots and prior code are retained from verified main. No unrelated path changed.

The current-state document retains the entire canonical document as an exact suffix
and the accepted TTR handoff, prefixed with current readiness status. No Core,
Capture, Platform, G2/Flexible or Source history was removed.

The shared test runner retains canonical PDF upload selectors, root-preservation
assertions and CLOSED checks plus the ordinary-order selector and local fixture-path
option. Canonical Flight installation precedes TTR; duplicate canonical/external
upload installation flags are rejected. An additional assertion verifies TTR adds
no changes to existing installed functions. This is test orchestration only.
No production code, writer, authority rule or runtime interface was rewritten.

## Migration order and exact hashes

- Flight PostgreSQL00100 SHA256:
  `a8f39d530420b4769310ae9c431633aba3136be4d031bc0dd17fa0c433aaa1a4`.
- TTR PostgreSQL00200 SHA256:
  `45c36ccf6f3d0ca92f30b3e78689fb95a6490e64a811bf2b670d521dfe8093c1`.
- Actual accepted Flight SQLite56 module SHA256:
  `a47a0b932d289c59ec14e6754c0d214bf447d36e8cdbc687e2be2ba3ed065065`.
- TTR SQLite57 module SHA256:
  `4bfa5c153fcc68f86cd79412fb65cfe7d06959cdea98cc3739b2834e30f71c40`.

All remain exact. Registry installs actual Flight56 then TTR57, both once. There is
one forward TTR PostgreSQL migration, with no old00100 TTR duplicate or historical
migration edits. Owning disposable installation includes accepted Core85–92,
LLM protected roots, PDF derivative/registration, canonical Flight00100, then TTR00200.

## Affected integration verification

- `--ordinary-order --with-pdf-upload --with-llm`: **2 PASS**, actual owning
  PostgreSQL→negotiated read2→SQLite57, three pairs, exact receipt/replay,
  private-gap redaction, transaction checker, cold offline reopen and retention.
- `--pdf-upload --with-llm`: **29 PASS**, canonical finite upload authority,
  permission/security/uncertainty/recovery compatibility with TTR installed.
- `--flight --with-pdf-upload --with-llm`: **1 PASS**, actual Source→two qualified
  Items→read2→SQLite→production Day reader; UUIDs and semantic revision2 preserved,
  collection lost-response recovery, cold offline reopen, no private Source leakage.
- Targeted real SQLite fresh/55 upgrade: **2 PASS**, actual56→57 ledger order,
  both tables plus Flight trigger, idempotent migration replay, cold reopen and FK check.
- **34 affected tests PASS** across four runs. Installed379 functions remain
  unchanged during each SQL scenario; only previously accepted LLM2, registration
  and upload function replacements occur during installation. CLOSED gates PASS.
- Typecheck, lint/UI guard (473 legacy/90 representative files), Backend build,
  runner syntax, touched migration formatting and staged/final diff checks PASS.

Logs: `/private/tmp/otr-order-prep-{sql,upload,flight,sqlite,types,lint,build}.log`.
Each UUID-named disposable fixture is removed by the runner. No Hosted operation.

Reused evidence: accepted TTR full3892 PASS/25 skips/two baseline UI failures,
focused42 PASS/one skip, unchanged authority/endpoint/Person/CAS/privacy vectors;
accepted canonical G2/Flexible/Flight/LLM evidence where inputs/blobs are unchanged.
No new combined full-suite or simulator/native run is claimed. The preserved Source
report's earlier pre-dispatch timestamp issue was not changed by this preparation.

## Concurrent work and remaining gates

Canonical's four Platform documents and dev pycache remain unchanged; none overlaps
the candidate diff. Capture, Import, Temporal, Experience and Flight Native worktrees
were read-only. Temporal has a concurrent dirty
`src/data/repositories/tripCanonicalEventRepository.test.ts`; Experience has a dirty
current-state document. They overlap future workstream integration paths, but no
file is overwritten and neither is a conflict in the current canonical tree.
Before/after status/hash evidence is included in the final manifest.

No new authority/security/contract conflict or migration collision. Separate Owner
approval is required for canonical integration/push. Real TTR consumer activation,
Hosted install, Provider, paid LLM, Production and unrestricted Native remain CLOSED.
Accepted typed UNKNOWN/SAME_LOCATION/Transport/expiry limitations are unchanged.

## Exact scope

36 accepted paths relative to verified main:

```text
backend/src/coreOrdinaryOrder.sql.test.ts
backend/src/tripCoreV2Collection.ts
backend/src/tripCoreV2Http.ts
backend/src/tripCoreV2PgRead.ts
backend/src/tripCoreV2PgStorage.ts
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/trip/contracts/CORE_ORDINARY_ORDER_TTR_INPUT_V1.md
docs/trip/implementation/CP_TTR_04A3_CORE_ORDER_02_IMPLEMENTATION_REPORT.md
scripts/trip/core-v2-sql-acceptance.py
src/data/api/tripCoreV2Transport.ts
src/data/bootstrap/participationWakeAcceptance.test.ts
src/data/db/checkpoint11Integration.test.ts
src/data/db/database.test.ts
src/data/db/migrations.ts
src/data/db/migrations/capturePdfSourceHandoff.ts
src/data/db/migrations/coreOrdinaryOrder.ts
src/data/db/publicationMembershipMigration.test.ts
src/data/foundation/diagnosticsReadOnly.test.ts
src/data/repositories/captureBatchAssessmentObservationRepository.test.ts
src/data/repositories/captureFlightNativeRepository.test.ts
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
src/data/repositories/tripCoreV2Repository.ts
src/data/repositories/tripPublicationMembershipRepository.test.ts
src/domain/trip/__fixtures__/coreOrdinaryOrder.ts
src/domain/trip/tripCoreOrdinaryOrder.ts
src/domain/trip/tripCoreTtr.test.ts
src/domain/trip/tripCoreTtr.ts
src/domain/trip/tripCoreV2.ts
src/domain/trip/tripCoreV2Commands.ts
src/domain/trip/tripCoreV2Day.ts
src/domain/trip/tripCoreV2Graph.ts
src/domain/trip/tripCoreV2Mutation.ts
src/domain/trip/tripCoreV2Read.ts
src/domain/trip/tripCoreV2Receipt.ts
supabase/migrations/20261013000200_core_ordinary_order.sql
```

One additional documentation path is this readiness report. Final scope: **37 files**.
Per-file hashes and final candidate tree are in the external handoff manifest.
