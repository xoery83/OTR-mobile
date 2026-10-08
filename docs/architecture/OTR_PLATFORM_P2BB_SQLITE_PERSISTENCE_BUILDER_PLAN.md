# P2b-B minimum SQLite persistence Builder implementation plan

Date: 2026-10-08 (Pacific/Auckland).
Status: **PLAN ONLY / FINAL OWNER ACCEPTANCE REQUIRED**.
Design worktree/base: `06adea85fc5d5d7b24f7e15a598e28cb86ae4671`.
Authority: Owner accepted the one-table architecture in principle with corrections;
this checkpoint authorizes documents only. Do not execute this implementation plan
without separate implementation authorization. **SQLite52 is not reserved.**

## 1. Scope and exact proposed changed paths

Reverify authorized canonical base and current registry in a separate clean Builder
worktree when implementation is authorized. Do not assume main still equals this
historical design base or silently assign the next number. Apply the final accepted
[Contract](OTR_PLATFORM_P2BB_SNAPSHOT_PERSISTENCE_CONTRACT.md) and
[ADR](../adr/2026-10-08-p2bb-minimal-assessment-observation-store.md).

| Future path                                                                 | Minimum change                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/db/migrations/captureBatchAssessmentObservations.ts`              | New migration definition containing only the accepted one-table DDL, implicit PK index and four guards; ID assigned only by separate Owner authorization.                                                                                                     |
| `src/data/db/migrations.ts`                                                 | One import and one registration at the separately authorized position. No historical definition edits.                                                                                                                                                        |
| `src/data/db/database.test.ts`                                              | Update existing contiguous-registry assertion after allocation; add atomic migration/history rollback and fresh/upgrade acceptance using existing disposable SQLite conventions.                                                                              |
| `src/domain/capture/batchAssessmentObservation.ts`                          | Strict immutable body schema, primitive JSON parsing/canonical sealing and digest validation using existing C4a/C2 schemas, canonical JSON and ImportHash. No SQLite/Node/provider imports.                                                                   |
| `src/domain/capture/batchAssessmentObservation.test.ts`                     | Approved Context Digest, exact C2 bytes/hash preservation, canonical body/envelope pins and UTF-8 bounds including C4a-valid oversized rejection.                                                                                                             |
| `src/data/repositories/captureSubmissionRepository.ts`                      | Extract the existing validated C2 header/roster/current-facts read into the smallest transaction-local seam needed by the observation repository. Public C2 behavior and original serialization/hash calculations stay unchanged. No nested gate/transaction. |
| `src/data/repositories/captureSubmissionRepository.test.ts`                 | Prove the extraction preserves exact C2 registration/replay/read behavior, immutable context/request/manifest hashes, offline Account fencing and cold recovery.                                                                                              |
| `src/data/repositories/captureBatchAssessmentObservationRepository.ts`      | Dormant scoped read/exact replay/append factory with mandatory current owning-data validation and fail-safe error results. No default factory/startup wiring.                                                                                                 |
| `src/data/repositories/captureBatchAssessmentObservationRepository.test.ts` | File-backed append/CAS/ACK/corruption/Account/FULL tests plus current owning-validator invocation/failure/race tests. Reuse existing SQLite and transaction helpers.                                                                                          |
| `docs/architecture/OTR_PLATFORM_P2BB_SQLITE_PERSISTENCE_BUILDER_REPORT.md`  | New implementation evidence, exact diff/base/migration ID, test outcomes and limitations.                                                                                                                                                                     |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`                                      | Concise Builder status, still CLOSED, next independent-review gate.                                                                                                                                                                                           |
| Existing Contract and ADR                                                   | Append implementation status/evidence only after authorized implementation; keep Owner decisions and historical evidence truthful.                                                                                                                            |

No other production paths are planned. Existing `batchAssessment.ts`, its fixtures,
C2 migration51, CP11 originals, CP13A/B/SQLite50, Auth, sync, UI, backend, dependencies,
configuration and server migration files remain unchanged. Direct module imports
suffice; no new barrel exports or public package API are needed.

## 2. Migration/registry delta

Exactly one new table `capture_batch_assessment_observations`, one implicit composite
primary-key index `(account_id,batch_id,assessment_revision)`, four triggers
(no-update, no-delete, registered C2 parent, contiguous revision/parent digest),
and one registry entry/history row after allocation. No explicit additional index,
backfill or imported assessment, mutable head, mapping, Job or Scheduler table.
Use accepted BLOB-affinity integer/typeof checks and FK-OFF guards; execute DDL and
schema_migrations insertion in the existing runner transaction. Preserve all prior
rows, hashes and history. Runtime rollback disables the dormant adapter and retains
populated schema/history; no destructive down migration/reset/drop/pruning.

## 3. Repository API and mandatory dependencies

Proposed factory `createCaptureBatchAssessmentObservationRepository(database,
getActiveUserId, dependencies)` reuses `LocalCaptureDatabase` and existing Account
request contexts/apply gate. Dependencies are the existing SHA-256 seam, the narrow
transaction-local C2 reader, and a **mandatory trusted local**
`assertCurrentOwningData(context, manifest, snapshot)` validator. No clock, new-ID
allocator, remote transport, retry hook or optional always-true validator.

Proposed methods (not executable declarations):

- `readHead(context,batchId)` → verified head `(revision,bodySha256)` plus explicit
  EMPTY/HEALTHY/INTEGRITY_BLOCKED/UNAVAILABLE coverage; prefix is historical if blocked.
- `readExact(context,batchId,revision)` → exact verified immutable body plus chain
  status, explicit verified absence, or integrity/unavailable result. No global lookup.
- `append(context,expectedHead,sealedBodyJson)` → APPENDED/EXACT_REPLAY or typed
  HEAD_CONFLICT/REVISION_CONFLICT/STALE_OBSERVATION/RECORD_TOO_LARGE/
  INTEGRITY_BLOCKED/OUTCOME_UNKNOWN. Account denial grants no body disclosure.

Validate primitive body JSON and canonical bytes before final admission. Compute
Context Digest via `importDigest('otr-capture-context-v1', validatedContext, sha256)`;
keep C2 original context JSON and request/manifest hashes unchanged. No alternate
raw-context digest. Seal head+1 as a proposal; only successful atomic INSERT allocates
it. Verify exact replay before NEW freshness so legitimate later Input changes do
not erase history. Recompute body/digests/envelope; historical replay never becomes
current owning-data authority. Corrupt latest history blocks NEW even if its
structural SQL maximum looks usable. No read repair, pruning or head cache.

For NEW: existing Account apply gate + serialized transaction, verified full chain,
exact revision+digest CAS, C2 row_revision vector and accepted original pins, and
mandatory current owning-validator success all precede INSERT/COMMIT. Recheck Account
before commit and disclosure. Uncertain ACK retains the same revision/body until
exact readback; no rebasing or replacement allocation. All work under the gate is
local; no token refresh/native-reader/provider/network I/O or nested transaction.

## 4. Owning-data dependency and integration boundary

The C2 seam must validate actual retained header, complete roster/current Input
facts, original bindings/custody and same-Account immutable lineage. Use CP11's
existing transaction-local store, not a second byte store. No synthetic C2 identities.

Processing Run generation/Input-set hash, Source/Representation material pins,
Candidate proposal/publication and retained human-decision observations must be
verified by their existing owners at final NEW admission. This is a required read
set, not a permission conveyed by a snapshot or by pure C4a. In particular,
`tripImportAdmissionRepository.readClosureEvidence` opens its own scoped transaction;
it cannot simply be called under the new transaction. Do not copy its business
logic or invent a parallel authority checker.

The minimum persistence Builder exposes the mandatory trusted local validator seam
and tests its enforcement, without installing an integrated-C4 owner adapter. No
production NEW append is callable through a default composition until the Owner
accepts the exact transaction-local owning read set/adapter. An absent or unavailable
validator must deny NEW, never treat missing processing capability as evidence.
Mocks certify enforcement only, not real owning-data freshness or integrated C4.
If a real adapter requires extraction in CP13B, stop for an explicit scope decision
before adding those changed paths; that extraction is not silently included in this
minimum store plan. Historical stored-body consistency is not permission freshness.

## 5. Targeted acceptance tests

1. Context correction: compare approved namespace/canonical validated-context hash
   against raw text hash; reordered equivalent primitive JSON has the same Context
   Digest while stored original C2 bytes/request/manifest hashes never change.
   Reject invalid/duplicate/unknown context data before hashing or persistence.
2. Complete body: schemas, columns/identities/digests/parent, lossless grammar,
   deterministic canonical envelope recomputation and all original C4a read-only
   denials. Inclusive 2 MiB UTF-8/+1 boundaries, multibyte values and separate
   C4a 1 MiB request limit. Some C4a-valid requests may exceed the complete-body
   limit: prove RECORD_TOO_LARGE with zero INSERT, no truncation/compression/splitting.
3. Revision/CAS: 0→1→2, wrong expected digest/revision, gaps, conflicts, exact replay
   after later appends, overflow, rollback at every write/COMMIT boundary, competing
   same-connection and separate-connection writers (one winner/no gap).
4. Account/current data: switch during seal/transaction/after COMMIT, A→B→A and
   cold fresh A recovery, B non-disclosure, changed Input/accepted original pins,
   mandatory owning-validator stale/missing/error results; every NEW failure atomic.
5. Corrupt first/middle/latest row, missing middle, unsupported format, forged storage
   type, envelope/C2 mismatch: blocked chain, historical prefix clearly labeled,
   no NEW append or repair; earlier exact reads do not grant current authority.
6. File-backed lost ACK/read error/positive absence, FULL via disposable
   max_page_count plus injected IOERR/rollback failure: old rows/originals retained,
   exact outcomes recovered without duplicate row or blind new revision. No Beta
   deletion/maintenance/logout pruning. Device/storage-hardware assurances excluded.
7. Fresh and existing 51→authorized migration, FK ON/OFF, atomic DDL/history rollback,
   idempotent rerun and typed-row preservation. Old app compatibility with retained
   observation table; historical migration bytes unchanged.

Run new body/repository tests with existing `batchAssessment.test.ts`,
`captureSubmissionRepository.test.ts`, `localCaptureInboxRepository.test.ts`,
`database.test.ts`, `databaseConnection.test.ts`, and Account request/switch tests.
Run typecheck, lint/UI guard, changed-file formatting and whitespace. Broaden only
for changed dependencies or failures; report exact existing baseline failures, never
claim full-suite success from targeted tests. No production/device/Hosted test access
is inferred. No extra dependency or new test framework.

## 6. Independent review and closure requirements

Builder stops with an uncommitted concrete diff and evidence. A separately
Owner-authorized independent reviewer verifies the exact authorized base/diff,
original migration/C2 preservation, one-table scope and absence of runtime/provider
wiring; then independently runs the targeted tests and negative reproductions.
Review must challenge stale current data, replay-after-head-advance, lost COMMIT ACK,
corrupt latest history, Account ABA, UTF-8 overflow, C4a-valid oversized bodies,
FK-OFF retention and storage exhaustion. Verify that mock owning admission is not
represented as real integrated-C4 acceptance. Record all findings and corrections;
no unresolved correctness/security findings at closure.

Final Owner acceptance of documents is the next gate. Separate implementation
approval and migration-number allocation precede Builder execution; independent
review precedes any later closure approval. Commit/push, real adapter composition,
native rehearsal, C5/C9/Provider authority and runtime activation each remain
outside this checkpoint. All observations stay read-only and all gates CLOSED.

**STOP — P2b-B CONTRACT REVISION / FINAL OWNER ACCEPTANCE REQUIRED.**

## Owner-authorized dormant Builder status — 2026-10-08

Owner gave final acceptance of the corrected documents and conditionally authorized
SQLite52 after source/registry/concurrent-reservation checks. The gate passed at
current main `f7115dc288aff7f0a252bf80f53b0f2b626a7534`; the fresh Builder worktree
implements only the dormant store and minimum validation seams. This addendum
supersedes prior implementation-pending/unassigned-SQLite52 stop statements above,
which remain historical design evidence. Accepted body/hash/CAS/retention/authority
rules are unchanged. No production Integrated C4 composition is installed.

Actual paths, migration preservation, tests and remaining limitations are in
[the Builder report](../architecture/OTR_PLATFORM_P2BB_SQLITE_PERSISTENCE_BUILDER_REPORT.md).
All C4/C5/C9/Provider runtime gates remain CLOSED; no Hosted/device/provider operation,
commit or push. Independent review is the next gate.

**STOP — P2b-B SQLITE PERSISTENCE BUILDER / INDEPENDENT REVIEW REQUIRED.**
