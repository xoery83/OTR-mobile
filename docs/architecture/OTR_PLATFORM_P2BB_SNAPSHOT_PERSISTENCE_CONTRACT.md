# P2b-B minimal snapshot persistence contract

Date: 2026-10-08 (Pacific/Auckland). Status: **ACCEPTED IN PRINCIPLE / CORRECTED PROPOSAL / FINAL OWNER ACCEPTANCE REQUIRED**.

## Authority, base and scope

Owner accepted the one-table append-only architecture in principle with two
required corrections: the approved domain-separated Context Digest, and explicit
rejection of C4a-valid records exceeding the provisional complete-body limit.
This revision applies both; final acceptance and implementation authorization
remain separate. Owner authorized documentation and a minimum Builder plan only. Local canonical `main` and isolated HEAD were verified
at `06adea85fc5d5d7b24f7e15a598e28cb86ae4671`. Worktree:
`/Users/xoery/.codex/worktrees/p2bb-snapshot-contract/otr-mobile-canonical`.
Final revision ref check: local `main` independently advanced to
`f7115dc288aff7f0a252bf80f53b0f2b626a7534`; isolated HEAD remains the exact
original base above. No rebase/merge or consumption of that new main occurred.
The future Builder must reverify its separately authorized base.
No fetch or claim of current remote freshness. The dirty original checkout was
read only; its uncommitted CP14/S1 work is outside this design.

One append-only Account/Batch assessment-observation table, using C2's existing
Batch and distinct Job identities. No new Job, head, mapping or scheduler table.
No implementation, migration allocation, SQLite52 reservation, Hosted access,
device change, provider call, commit or push. All C4/C5/C9 and Provider runtime gates remain CLOSED.
This proposal adds no product capability or domain-write authority.

## Audited conventions and integration reach

| Existing source                                               | Finding / proposed reuse                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/db/database.ts`, `databaseConnection.ts`            | Startup initializes/migrates once; repository transactions serialize on the shared connection. Read surfaces can use `readInitializedDatabase`; they must not initialize/migrate implicitly.                                                                            |
| `src/data/db/migrationRunner.ts`                              | Each migration's DDL and history insertion commit together; failed open resets its cached promise. No down-migration runner exists.                                                                                                                                     |
| `src/data/repositories/captureSubmissionRepository.ts`        | Account-only context uses existing empty Trip scope; apply gate encloses transaction, assertions occur before/after work and after commit. C2 register/replay/load verify complete header, roster, original binding and exact hashes. No nested repository transaction. |
| `src/data/db/migrations/captureSubmissions.ts`                | SQLite51 retains immutable header/roster identities, typed safe integers via BLOB affinity + `typeof`, scoped keys, insert guards and FK-OFF retention guards. C2 already prohibits header/input deletion.                                                              |
| `src/data/auth/accountRequestContext.ts`                      | Existing generation/apply gate fences Account transitions including A→B→A. Generation is process-local, not durable authority.                                                                                                                                          |
| `src/domain/capture/batchAssessment.ts`                       | Dormant C4a accepts primitive strict JSON text, 1 MiB request, 64 Inputs/current bindings/findings and bounded history. Result remains read-only, with no mature actionable attention.                                                                                  |
| `src/domain/trip/eventIntentJson.ts`, `flightImportReview.ts` | Lossless JSON validation rejects duplicates/unsafe numeric spellings before decoding; canonical JSON sorts object keys, preserves array order; `importDigest` hashes namespace + newline + canonical JSON.                                                              |
| C2 repository tests, database tests                           | Existing disposable Node SQLite, FK ON/OFF, disk reopen, injected write failure/lost ACK and generation-race patterns suffice; no new test framework.                                                                                                                   |

Future reach, only after authorization: one migration file/registry entry (number
unassigned), one data repository and its tests, a narrow transaction-local C2
read/verification seam, strict body validation using existing C4a schemas, and an
explicit integrated-C4 data operation. Existing UI, routes, exports, factory,
startup, queue and provider configuration need no changes for the dormant store.
The eventual composer must own trustworthy C2/CP11/CP13B observations; persistence
cannot turn caller-provided bindings into certified publication/custody.

## 1. Exact proposed schema and indexes

The following is **review-only DDL**, not a migration. One row per complete
assessment revision. No row UUID, clock, mutable status, tombstone or cached head.
The primary-key autoindex is the only new index: it serves Account/Batch ordered
history, exact revision and reverse last-row lookup. Job lookup first uses existing
`capture_submission_batches` unique `(account_id,job_id)` then this primary key.

```sql
CREATE TABLE capture_batch_assessment_observations (
  account_id TEXT NOT NULL CHECK(typeof(account_id)='text' AND length(account_id) BETWEEN 1 AND 128),
  batch_id TEXT NOT NULL CHECK(typeof(batch_id)='text'),
  job_id TEXT NOT NULL CHECK(typeof(job_id)='text'),
  format_version BLOB NOT NULL CHECK(typeof(format_version)='integer' AND format_version=1),
  assessment_revision BLOB NOT NULL CHECK(typeof(assessment_revision)='integer' AND assessment_revision BETWEEN 1 AND 9007199254740991),
  c2_manifest_sha256 TEXT NOT NULL CHECK(typeof(c2_manifest_sha256)='text' AND length(c2_manifest_sha256)=64 AND c2_manifest_sha256 NOT GLOB '*[^a-f0-9]*'),
  c4_manifest_sha256 TEXT NOT NULL CHECK(typeof(c4_manifest_sha256)='text' AND length(c4_manifest_sha256)=64 AND c4_manifest_sha256 NOT GLOB '*[^a-f0-9]*'),
  snapshot_sha256 TEXT NOT NULL CHECK(typeof(snapshot_sha256)='text' AND length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^a-f0-9]*'),
  body_sha256 TEXT NOT NULL CHECK(typeof(body_sha256)='text' AND length(body_sha256)=64 AND body_sha256 NOT GLOB '*[^a-f0-9]*'),
  parent_body_sha256 TEXT CHECK(parent_body_sha256 IS NULL OR (typeof(parent_body_sha256)='text' AND length(parent_body_sha256)=64 AND parent_body_sha256 NOT GLOB '*[^a-f0-9]*')),
  body_json TEXT NOT NULL CHECK(typeof(body_json)='text' AND json_valid(body_json) AND json_type(body_json)='object' AND length(CAST(body_json AS BLOB)) BETWEEN 1 AND 2097152),
  CHECK(batch_id<>job_id),
  CHECK((assessment_revision=1 AND parent_body_sha256 IS NULL) OR (assessment_revision>1 AND parent_body_sha256 IS NOT NULL)),
  PRIMARY KEY(account_id,batch_id,assessment_revision),
  FOREIGN KEY(account_id,batch_id) REFERENCES capture_submission_batches(account_id,batch_id)
);
CREATE TRIGGER capture_assessment_no_update
BEFORE UPDATE ON capture_batch_assessment_observations
BEGIN SELECT RAISE(ABORT,'C4_OBSERVATION_IMMUTABLE'); END;
CREATE TRIGGER capture_assessment_no_delete
BEFORE DELETE ON capture_batch_assessment_observations
BEGIN SELECT RAISE(ABORT,'C4_OBSERVATION_RETAINED'); END;
CREATE TRIGGER capture_assessment_parent
BEFORE INSERT ON capture_batch_assessment_observations
WHEN NOT EXISTS (
  SELECT 1 FROM capture_submission_batches b
  WHERE b.account_id=NEW.account_id AND b.batch_id=NEW.batch_id
    AND b.job_id=NEW.job_id AND b.manifest_version=1
    AND b.manifest_sha256=NEW.c2_manifest_sha256
    AND b.request_sha256 IS json_extract(NEW.body_json,'$.c2RequestSha256')
)
BEGIN SELECT RAISE(ABORT,'C4_OBSERVATION_C2_BINDING'); END;
CREATE TRIGGER capture_assessment_contiguous
BEFORE INSERT ON capture_batch_assessment_observations
WHEN NEW.assessment_revision IS NOT (
  SELECT COALESCE(MAX(assessment_revision),0)+1
  FROM capture_batch_assessment_observations
  WHERE account_id=NEW.account_id AND batch_id=NEW.batch_id
) OR NEW.parent_body_sha256 IS NOT (
  SELECT body_sha256 FROM capture_batch_assessment_observations
  WHERE account_id=NEW.account_id AND batch_id=NEW.batch_id
  ORDER BY assessment_revision DESC LIMIT 1
)
BEGIN SELECT RAISE(ABORT,'C4_OBSERVATION_REVISION'); END;
```

C2-bound parent guard enforces registered Account/Batch/Job even with FKs OFF; its
existing guards retain the parent. C4a strict runtime schemas validate lowercase
UUIDs (including the Account); do not silently change an existing C2 identity to
meet C4a's narrower grammar. SQL is structural defense, not semantic validation.
No `INSERT OR REPLACE`, UPSERT, UPDATE or DELETE is permitted. Trigger constraints
alone cannot validate hashes or detect a corrupt tail; the repository contract
below is mandatory. Arbitrary DDL/trigger removal is outside SQLite's integrity
boundary, not a supported repair mechanism.

## 2. Immutable body, digests and validation

Version 1 body is a strict object with exactly these fields:

```text
version: 1
c2RequestSha256: C2 stored request_sha256, independently verified
c2ManifestSha256: C2 stored manifest_sha256, independently verified
contextSha256: importDigest('otr-capture-context-v1', validatedContext, sha256)
parentBodySha256: null at revision 1, otherwise exact preceding body digest
manifest: complete CaptureIntakeManifest v1
snapshot: complete CaptureProcessingSnapshot v1
envelope: complete CaptureBatchAssessment v1
```

Store canonical JSON of this object, complete and immutable; no filtered coverage,
truncated history, external payload URI, partial envelope or redacted replay body.
Original binary/text bytes remain in existing CP11 custody; C2 immutable context
and declaration JSON remain in their existing header. Do not duplicate those stores.
No persisted `current` header is needed: reconstruct it for historical verification
from manifest/snapshot identities, snapshot digest and the complete snapshot Input
revision vector in snapshot order. Current authorization/pins must independently
come from owning repositories for NEW admission; reconstruction proves no freshness.

Digest definitions are deliberately separate:

| Digest         | Exact bytes                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C2 request     | Existing `SHA256(UTF8(canonicalSubmission(request)))`; fixed schema field order, not C4 canonical ordering.                                            |
| C2 manifest    | Existing `SHA256(UTF8(exact boundedSubmissionJson(request.inputs)))`; declaration array includes file metadata.                                        |
| Context Digest | Approved `importDigest('otr-capture-context-v1', validatedContext, sha256)`; retained as body.contextSha256 and manifest.contextSha256.                |
| C4 manifest    | Existing `importDigest('otr-capture-intake-manifest-v1', manifest, sha256)`.                                                                           |
| C4 snapshot    | Existing `importDigest('otr-capture-processing-snapshot-v1', snapshot, sha256)`; includes allocated assessment revision.                               |
| Complete body  | Proposed `importDigest('otr-capture-assessment-observation-v1', body, sha256)`; excludes its own digest, includes parent digest and complete envelope. |

C2 and C4 manifest hashes are not interchangeable and equality is never required.
Parse the retained original C2 `context_json` with the lossless JSON parser and
validate it with the existing strict `submissionContextSchema` to obtain
`validatedContext`. Compute the Context Digest exclusively with
`importDigest('otr-capture-context-v1', validatedContext, sha256)`; it is
SHA-256 of the namespace, newline and canonical validated-context JSON, not a
raw JSON-text digest. Require body.contextSha256=manifest.contextSha256.
Do not rewrite/reorder/normalize the stored C2 context JSON or change C2's
existing request/manifest hash calculation or stored values. Their exact original
bytes and hashes remain independently verified by the existing C2 contract.

Map C2 context.id→contextSnapshotId, approved Context Digest→contextSha256,
context.tripPrior?.id→tripPriorId (nullable/passive), Input.id→inputId,
itemKey→replayKey, ordinal and continuesFromInputId unchanged. Bind Account, Batch,
Job, submissionKey and manifestVersion exactly. Validate C2 full original request
and ordered roster first, not only the projected fields; header request digest
binds metadata omitted from C4's projection. C2 registers more than 64 Inputs if its
metadata bound permits; C4a v1 rejects such a roster intact. Never split/truncate
an already registered Batch to satisfy this contract.

On append and every disclosure/replay/reopen: check storage classes, byte ceiling,
strict lossless parser, strict body schema/version, exact canonical reserialization,
all column/body identity/hash/revision/parent equalities and recomputed digests.
Verify complete immutable C2 header/declarations and projection. Recompute C4a
with reconstructed historical pins; canonical equality with the retained envelope
is required. C4a's input request still must fit 1 MiB, independently of the stored
2 MiB bound. Original C4a failures and its unconditional `NOT_AUTHORIZED` /
`matureActionableAttention:false` protections remain unchanged. Hashes detect
inconsistency, not malicious rewriting by a privileged database owner.

Historical C2 Input facts may have advanced after retention. Historical verification
must not require old observedRevision to equal today's row_revision or old Capture
revision to equal today's assignment revision. NEW admission must verify current
facts, immutable accepted original pins and all installed owning Run/decision
publication observations under their existing local transaction contracts. The
future adapter must explicitly define that read set before integrated C4 is approved;
this design supplies no synthetic authority or uninstalled processing status.

Corruption: scan revision 1 onward; validate every body and preceding digest.
The highest valid contiguous prefix is the derived historical head. An invalid,
missing, unsupported-version or inconsistent row followed by retained later rows
returns `INTEGRITY_BLOCKED` (unsupported version may be distinguished diagnostically).
Return prefix metadata only as historical/unverified-current, never silently
promote a later valid-looking row or call the prefix healthy current state. Reject
all NEW appends for that Batch; preserve every row and original. Exact read may
return a verified earlier historical observation with the blocked status, but no
current-action implication. Read errors return `UNAVAILABLE`, never empty/absent.
An empty successfully verified store returns head revision 0/bodyDigest null;
absence of assessment means unassessed, not assessment success. Tail-only deletion
cannot be detected by a self-contained append log without an external anchor;
no anti-tampering or backup-rollback detection claim is made.

## 3. Revision/CAS transaction and exact recovery

Proposed data API, not exported code:
`readHead(context,batchId)`, `readExact(context,batchId,revision)`,
`append(context,expectedHead,completeSealedBody)`.
Expected head is `(revision,bodySha256)`; empty is `(0,null)`. The caller seals the
next revision `expectedHead.revision+1` before attempting persistence. That is a
proposal, not a reserved allocation or persisted gap. Overflow fails before hash
or INSERT. Stable `(Account,Batch,assessmentRevision)` is the replay identity;
complete bytes, digests and parent bind intent. No extra idempotency UUID.

1. Capture active Account/generation before asynchronous work. Read/validate C2
   and owning observations locally; assemble trusted owned data, freeze/serialize,
   run pure C4a and seal the complete canonical body outside the final apply gate.
   No caller objects are accepted at the raw C4a boundary.
2. Enter existing `withAccountApplyGate`, then shared serialized
   `withTransactionAsync`; assert Account context. Use only bound parameters.
   No credential refresh, native reader, network, provider or arbitrary injected
   I/O runs under either gate. Local database/hash validation is allowed, as in C2.
3. Validate retained chain/C2 identity and look up the proposed exact revision first.
   If a row exists: identical verified canonical body AND all digests/parent/identity
   return historical `EXACT_REPLAY`, regardless of a newer head/current Input facts.
   Differing content is `REVISION_CONFLICT`, never replacement. Corrupt exact row
   is integrity failure. A valid replay in a blocked chain stays explicitly historical.
4. If no exact row: require healthy entire chain and exact expected-head pair;
   verify complete current owning read set and Input revisions inside the same
   transaction. Stale observation is `STALE_OBSERVATION`; mismatched head is
   `HEAD_CONFLICT`. Never substitute new revisions into the old sealed body.
5. INSERT exactly one row at `head+1`, parent digest=head digest; require changes=1.
   The contiguous trigger/PK fence concurrent writers. Re-read/validate inserted
   row, assert context before COMMIT; assert again after COMMIT before disclosure.
   A winner allocates exactly one revision atomically; rollback allocates none.
6. Success is disclosed only after COMMIT and the final Account fence. A second
   connection with a stale read snapshot may get BUSY/LOCKED instead of a logical
   CAS failure. Roll back; do exact recovery, not automatic head rebasing. Shared
   connection serialization is not a multi-connection/global lock guarantee.

The shared serializer wraps transaction callbacks only; it cannot stop arbitrary
unscoped statements on that same connection from joining a transaction. All store
reads/writes must follow the scoped repository convention, with a targeted
interleaving test; no new claim of exclusive connection isolation is made.

No nested C2/CP11 repository calls that open their own gate/transaction: expose a
narrow existing-data transaction-local read validator, analogous to CP11's store
seam. Do not create a parallel connection manager or transaction framework.

Lost COMMIT ACK, post-COMMIT Account switch or unavailable readback returns
`OUTCOME_UNKNOWN` and retains the exact sealed body/revision. Fresh current Account
may read exact after file reopen. Exact verified match recovers success without
reassessment, new identity, timestamp mutation or new row, even after later appends.
Positive exact absence under a successful consistent transaction permits retry of
that same body only if its expected head AND current owning pins still match.
Failed read is not absence. If another body won that revision, return conflict;
a fresh explicit assessment may then use the fresh head, but is not replay of the
uncertain original. Never automatically allocate a replacement while UNKNOWN.

Generation is never persisted as a cold-start credential. Fresh A can recover A's
rows after A→B→A/restart; old callbacks cannot reacquire authority. Every query is
Account scoped before loading any body. Job locators resolve only within that
Account. Offline valid cached Account sessions suffice; Trip prior is not a Trip
assignment or authorization grant. Retained observations cannot authorize Review,
preparation, canonical commands, retries or provider execution.

## 4. Capacity and Beta retention

Proposed per-record bound: **2,097,152 UTF-8 bytes of canonical body_json**, inclusive.
It excludes column/index/SQLite-page/WAL overhead. Measure before INSERT and verify
`length(CAST(body_json AS BLOB))` in SQL. Never use JS character count, truncate,
compress, omit evidence, or save an envelope alone. Keep C4a's separate 1 MiB
raw/canonical request ceiling. No new dependency or second byte store.

Revised local serialization probe used the approved Context Digest and corrected
body.contextSha256 field, exact canonical C4a and canonical JSON, and standard
Node SHA-256 through the existing test seam. Three fixtures passed; assertions
verify the Context Digest differs from raw context-JSON hashing and derives from
strict validated context while the fixture context text remains unchanged:

| Fixture                                                                    | C4a request bytes | Envelope bytes | Complete body bytes |
| -------------------------------------------------------------------------- | ----------------: | -------------: | ------------------: |
| Accepted two-Input/two-finding nominal fixture                             |             5,211 |          4,054 |               9,050 |
| Largest admitted history prefix in the probe, safe-integer revision maxima |         1,048,504 |      1,047,347 |           2,095,636 |

The 64-Input near-limit variant also passed: request 1,048,428 bytes, envelope
1,024,185 bytes, complete body 2,067,470 bytes.

The second record leaves only 1,516 bytes. These fixtures support a **provisional
storage admission limit**, not a mathematical proof that every C4a-valid request
fits. **Some C4a-valid requests may exceed the 2 MiB complete-body limit.**
C4a validity does not imply storage admission. A later non-null parent adds 62 bytes. Implementation must test 64-Input,
64-finding/dependency/locator, long allowed IDs, maximum safe integers and varied
history layouts. An otherwise C4a-valid oversized body must fail
`RECORD_TOO_LARGE` without partial persistence, truncation, compression, omitted
evidence, fabricated Batch splitting or any claimed durable assessment. This
rejection is required even when the request and envelope pass all C4a checks.
The provisional 2 MiB limit is retained per Owner correction; final acceptance
remains required before implementation. Probe is local evidence at
`/private/tmp/otr-p2bb-revised-serialization.ts` (bundled `.mjs` alongside); it is not a
production adapter, schema test or device memory benchmark.

Beta retains all revisions, including PENDING/UNKNOWN/failed/deferred observations.
No automatic pruning, history compaction, eviction, TTL, logout deletion, startup
repair or `VACUUM` cleanup. Identical exact replay consumes no additional row.
A newly observed identical semantic result at a different assessment revision is
still a distinct observation; content dedup must not erase revision identity.
No invented global quota is added; CP11 payload quotas remain independent. Logical
history grows without bound until available storage stops admission. No pruning
during Beta remains a confirmed contract requirement; subsequent aggregate budgets/cleanup require a separate
custody/privacy/retention decision and authorization.

FULL/IOERR/BUSY/constraint/commit failures preserve old rows and immutable originals.
Do not acknowledge durability on an exception. Rollback where safe, then exact
readback to distinguish committed from absent; unavailable outcome remains UNKNOWN.
Storage exhaustion blocks new observation storage, not cached history or intake
truth. No eviction to make room. No automatic busy/full retry loop. SQL errors and
record size must not be recorded as a new assessment of the material itself.
Physical device/database corruption can still make retained data unreadable; no
SQLite contract guarantees survival of failed storage hardware.

## 5. Migration/rollback and acceptance test plan (not executed)

Migration identifier remains **unassigned**; SQLite1–51 and registry unchanged.
Implementation requires separate Owner authorization, including any SQLite52 use.

| Test area            | Required acceptance evidence                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh / upgrade      | Full registered fresh chain and51→new migration with FK ON/OFF; exactly one table/PK index/four triggers; schema_migrations record atomic and contiguous only after authorized allocation. Snapshot typed rows/history of every prior table before/after; unchanged C2/CP11 identities, bytes and hashes.                                                              |
| Migration failure    | Inject failure after CREATE, each trigger and before history insertion; no new objects/history survive rollback. Retry succeeds once; second run neutral. Registry/historical definitions remain byte-identical. No partial migration acceptance.                                                                                                                      |
| Append / races       | Empty→1→2; wrong head digest/revision, gaps, reused revision with different body, parent digest mismatch, safe-integer overflow, raw storage-class forgery, missing/cross-Account parent and Job alias. Same-process and separate-connection contenders: one row, loser conflict/BUSY, no gap. Test parameter binding.                                                 |
| Trust boundary       | Duplicate JSON keys, unknown fields, noncanonical bytes, unsafe integer spelling, byte-length mismatch, wrong namespaces, all body/column pins, exact C2 projection/context/order/replay/lineage differences;1 MiB C4a and2 MiB body inclusive/+1 edges. Same verified envelope recomputation; all original C4a R1/R2 denials preserved.                               |
| Owning freshness     | Input change during sealing; accepted-original change; Run/decision publication change; current read-set failure. Every NEW append denied atomically. Historical replay survives legitimate later Input/Capture changes without becoming fresh authority. Integration cannot pass with synthetic C4a pins alone.                                                       |
| Cold / ACK / Account | File-backed close/reopen after each write boundary and COMMIT-before-ACK; recovery after later revisions; exact absence vs read error; switch during hash, transaction and post-COMMIT; A→B→A denies stale generation, fresh A recovers, B sees nothing. No token refresh required.                                                                                    |
| Corruption           | Mutate body/hash/types with guards deliberately disabled in disposable fixture; missing middle, corrupt first/tail, unknown version, swapped Account/Batch/Job, envelope and C2 damage. Highest prefix diagnostic only; append blocked; zero repair writes; unchanged original history.                                                                                |
| Capacity / retention | Logical oversized record abort; real disposable file `max_page_count`/FULL and injected IOERR/COMMIT failure; original prefix rows/digests remain identical after reopen. Include WAL/rollback behavior and faulted rollback handling; exact recovery never assumes absence. No deletion/pruning on logout/switch/maintenance.                                         |
| Application rollback | Before any records: abandon dormant implementation without altering existing schema; do not supply a destructive down migration. After records: disable adapter and preserve added table/history; old build compatibility rehearsal reads/writes existing C2 without touching observations. No database reset, migration-history erasure or dropping populated tables. |

Use existing test helpers and targeted C2/C4a/Account/database/maintenance
regressions, typecheck and lint/UI guard at implementation time. Device FULL/OOM,
real Expo multi-connection contention and installation rollback need separately
authorized native rehearsal; Node fixtures alone cannot certify them. No production
SQL/repository or migration tests were created/executed for this design.

## 6. Minimal ownership and dependencies

Data repository owns scoped reads, append transaction, validation, replay/corruption
results and safe error classification. Existing database owner initializes and
serializes; existing auth owner fences. C2 owns registered identity/roster/current
intake and CP11 owns originals. CP13B owns truthful Run/Candidate/publication pins;
its references are not synthesized by this store. Pure C4a owns assessment rules.
A future explicit integrated-C4 operation composes those owners; it owns neither
provider/retry lifecycle nor sync. No default factory, startup, worker, second
scheduler, queue kind or UI polling is introduced. No new package dependencies.

The smallest body stores mappings inside the complete snapshot; no mapping table.
No new mutable completion, current-head or Job status is persisted. No public
notification/Review action, C5 receipt, Event/Person/Booking/Ledger update or API
endpoint is created. Future read consumers must explicitly distinguish historical
integrity from fresh current owning observations; C3/P4 installation is separate.

## 7. ADR, Owner decisions and performed validation

Decision record: `../adr/2026-10-08-p2bb-minimal-assessment-observation-store.md`.
Owner-confirmed contract requirements, retained in this corrected proposal:

- Exact immutable complete history; append allocates head+1 under revision+digest
  CAS, with exact replay/lost-ACK/cold recovery and no history replacement.
- One Account/Batch table using the existing distinct Job; no new Head, Mapping,
  Job or Scheduler table, row UUID, worker or queue kind.
- No pruning during Beta. Corrupt latest or noncontiguous retained history blocks
  every NEW append; valid prefix disclosure remains explicitly historical.
- Account/generation fencing and current owning-data freshness checks remain
  mandatory. Historical replay cannot certify current freshness or regain authority.
- No C5/C9/Provider authority, activation or canonical admission.
- Approved Context Digest mapping; original C2 context JSON and request/manifest
  hashes remain unchanged. Provisional 2 MiB complete-body admission limit with
  `RECORD_TOO_LARGE` for some otherwise C4a-valid requests, without partial writes,
  truncation, compression or fabricated Batch splitting.

Remaining gates:

1. Final Owner acceptance of this corrected Contract, proposed ADR and
   [minimum Builder plan](OTR_PLATFORM_P2BB_SQLITE_PERSISTENCE_BUILDER_PLAN.md).
2. Approve the exact current owning-data read set/seam before integrated-C4
   composition; C4a limits/UUID grammar never rewrite C2 identities.
3. Separate implementation authorization and migration-number allocation, then
   independent review. SQLite52 remains unreserved; no native/Hosted/runtime
   authorization follows from document acceptance.

Performed in this revision: local main/HEAD verification, three corrected
serialization fixtures and approved Context Digest assertions, documentation
consistency, Prettier and whitespace checks. Earlier unchanged C2/C4a/database
regressions remain **4 files / 146 tests PASS** from the original design checkpoint
(`batchAssessment`, `captureSubmissionRepository`, `databaseConnection`,
`database`; config runner/cache disabled); they were not rerun for prose changes.
Final deliverables are this corrected Contract, proposed ADR, minimum Builder plan
and handoff. All tracked runtime, registry and migration sources remain unchanged
at the base; no dependency/configuration edits. No full-suite, production-store
concurrency, schema execution, device, Hosted or remote-head claim.

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
