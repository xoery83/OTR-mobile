# CP04A3-CORE-ORDER-03 integration readiness

2026-10-13 · **READY FOR SEPARATE OWNER EXACT-TREE APPROVAL. STOP AT OWNER REVIEW.**

## Authorization and pinned inputs

Experience/G2 remote-inclusion gate cleared by the Owner's explicit resume
instruction in this chat. G2 `e091b60e0527766bf6a055a4280e21f61933da5c` is retained
unchanged as an ancestor. This authorizes readiness preparation, not push now.

- Verified local main: `e091b60e0527766bf6a055a4280e21f61933da5c`;
  tree `6a5bbac179403ceac75a07fa25d9b28f025a0e09`.
- Cached origin/main and actual remote: `065bdd96d334cfa4818178cb715dfd7ff14b5289`.
- Prior accepted 37-file TTR candidate: `6b3f3df31fae69a18d113663131abf343eed64a3`,
  tree `e375883db2bf65eea429cdf2587d6ee4cdaf59df`, unchanged and clean.
- Original accepted implementation: `a027f2ad0703d853afc6fa490a8b5734bbd2e454`,
  tree `5339789db54f345e13f7667a9a2e67196398e211`, unchanged and clean.
- Both divergent approved histories share 065bdd96. Normal isolated merge retains
  their exact ancestry; no rebase, reset or cherry-pick reconstruction.
- Readiness branch `codex/cp-ttr04a3-core-order-03-canonical-prep`, worktree
  `/private/tmp/otr-cp-ttr04a3-core-order-03-canonical-prep-20261013`.

Reconciliation merge `5fd1eec32bfafea1f7c41683dd6789c706b5b6b8`, tree
`e633726a99055560bb06a92bf89b5c7cfc8d34e8`; exact parents are approved G2 main
and prior approved TTR candidate. A documentation-only follow-up adds this report
and the current checkpoint prefix. Final candidate HEAD/tree are in the handoff
manifest. Normal future integration can fast-forward from unchanged e091b60,
then push normally from remote 065bdd96, only after separate Owner approval.

## Exact overlap and resolution

Only `docs/CURRENT_IMPLEMENTATION_STATE.md` overlaps by path. There is no executable
symbol overlap. Both workstreams prepend status to the same document. Resolution
retains the prior TTR prefixes and the complete G2 main handoff as an exact suffix;
common 065bdd96 history is present once. A short CORE-ORDER-03 readiness prefix records
the latest checkpoint. No G2/TTR/Core authority or product decision was modified.

All 36 accepted TTR paths outside that document remain byte-identical to 6b3f3df.
All 87 G2 CP01B paths outside it remain byte-identical to e091b60. This includes
accepted production, tests, fixtures, reports and evidence. G2/Flexible/Flight
Source/Native/LLM/DEV Backend files remain exact. There is no additional Composer,
TTR insertion path, personal selection store, writer or runtime activation.

## Migration allocation

Forward PostgreSQL sequence: Flight00100 then TTR00200. Registry SQLite sequence:
actual accepted Flight56 then TTR57. All registered 00200/57 definitions are identical
accepted TTR copies; no new migration collision. No historical migration edited.

| Allocation | SHA-256 |
| --- | --- |
| Flight PostgreSQL00100 | a8f39d530420b4769310ae9c431633aba3136be4d031bc0dd17fa0c433aaa1a4 |
| TTR PostgreSQL00200 | 45c36ccf6f3d0ca92f30b3e78689fb95a6490e64a811bf2b670d521dfe8093c1 |
| Flight SQLite56 module | a47a0b932d289c59ec14e6754c0d214bf447d36e8cdbc687e2be2ba3ed065065 |
| TTR SQLite57 module | 4bfa5c153fcc68f86cd79412fb65cfe7d06959cdea98cc3739b2834e30f71c40 |

## Targeted checks and reused evidence

Combined six-suite run: **95 PASS**. Includes G2 registration (original 22 entries,
Nelson default, appended F01–F14 and 14 TTR expectations), shared render and Flexible
snapshot compatibility, ordinary TTR qualifier, Core read2 repository, and real
SQLite fresh/55→56→57/collection replay/cold offline reopen contracts.

The first joined Flight run timed out at the existing 30-second limit during
concurrent checks, after emitting joined SQL/read2/SQLite/Day evidence. Code and
limits were not changed; the isolated unchanged rerun **PASS (1 test)**. Actual owning PostgreSQL→read2→
SQLite57→Day preserves the same two UUIDs at semantic revision2, exact Source/receipt
recovery, replay, cold offline retention and private Source fences. PostgreSQL
Flight00100→TTR00200 and SQLite Flight56→TTR57 install together. All 379 installed
functions remain unchanged during the scenario; all activation gates remain CLOSED.

Typecheck, full lint/UI guard (473 legacy/90 representative files), Backend build,
migration formatting and diff checks PASS. Total fresh targeted checks: **96 PASS**.
No production code or test timeout was changed for the rerun.

Unchanged prior full evidence reused rather than a broad rerun: TTR 3892 PASS,
two baseline failures/25 skips; G2 CP01B reconciled 3965 PASS, same two baseline
failures/52 skips. Prior ordinary SQL 2 and Flight Upload 29 evidence is reused where
all relevant code, fixture, runner and migration inputs remain exact. No new full
combined suite, Simulator/native or Hosted run is claimed.

Logs: `/private/tmp/otr-order03-{focused,flight,flight-final,types,lint,build,format}.log`.

## Concurrent work and gates

Seven other worktrees preserve exact HEADs, status and dirty/untracked hashes,
including canonical Platform documents/cache, Import, Temporal, Capture,
Experience and both frozen TTR branches. No canonical dirty path intersects the
candidate scope. Temporal's parallel test edit and Experience's current-state
notes are preserved in their own worktrees, not imported. No unrelated cleanup.

Only new documentation is this report. Candidate diff from e091b60 consists of the
prior 37 TTR paths plus this report: **38 files**. Conflict resolution is documentation
only; all 37 paths except current-state retain prior accepted bytes.

Final commit/tree, ancestry, exact per-file hashes, preservation proof and concurrency
snapshots are recorded in `/private/tmp/otr-core-order03-final-evidence-20261013.json`.
Separate Owner exact-tree approval is required before canonical merge/push.
Hosted install, Provider, paid LLM, Production, unrestricted Native and production
TTR consumer activation remain CLOSED. Accepted UNKNOWN/SAME_LOCATION/Transport/
expiry limitations are unchanged. No new authority/security/contract conflict.

## Prior 37 paths retained

```text
backend/src/coreOrdinaryOrder.sql.test.ts
backend/src/tripCoreV2Collection.ts
backend/src/tripCoreV2Http.ts
backend/src/tripCoreV2PgRead.ts
backend/src/tripCoreV2PgStorage.ts
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/trip/contracts/CORE_ORDINARY_ORDER_TTR_INPUT_V1.md
docs/trip/implementation/CP_TTR_04A3_CORE_ORDER_02_CANONICAL_READINESS_REPORT.md
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
