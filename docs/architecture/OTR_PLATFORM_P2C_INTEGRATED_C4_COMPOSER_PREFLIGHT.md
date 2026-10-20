# Platform P2c Integrated C4 Composer preflight

Date: 2026-10-09 (Pacific/Auckland). Role: Platform Composer Architect.
Status: **PROPOSED — CONTRACT DELTA REQUIRED / OWNER REVIEW REQUIRED.**

## 1. Verdict and bounded Builder scope

**CONTRACT DELTA REQUIRED.** A dormant local Composer is feasible without Transport
or a migration. Owner must approve the small contracts below before Builder work.
This is not a defect verdict on the accepted standalone slices: their existing
APIs deliberately stop short of owning integrated append admission.

Proposed Builder scope, after approval:

1. Add `src/data/operations/captureBatchAssessmentComposer.ts` and focused tests:
   explicit local assessment, unchanged-observation deduplication, exact recovery
   and a separate read-only Activity projection.
2. Extend `captureBatchAssessmentAdapter.ts` and its tests with original-context
   observation and an opaque, transaction-local whole-read-set validator. Preserve
   existing `assess(jobId)` behavior and revision1.
3. Extend `captureBatchAssessmentObservationRepository.ts` and its tests only with
   a local cancellation/admission check immediately before INSERT and before COMMIT.
   Keep accepted body, CAS, replay and historical verification semantics.
4. Add the accepted decision ADR and incremental API/current-state documentation
   during Builder work. Reuse existing fixtures/test helpers.
5. Deliver dormant code and independent-review evidence. No default factory,
   app caller, C3 rendering, lifecycle registration or live Transport integration.

No SQLite54, new schema, Head/Job/mapping/request journal, queue kind, scheduler,
provider, Backend endpoint, business writer, export barrel or dependency is proposed.
The only new durable writes are authorized NEW SQLite52 observation appends.
No implementation is authorized or performed by this document.

## 2. Source gate and evidence precedence

Fresh managed detached worktree:
`/Users/xoery/.codex/worktrees/p2c-composer-preflight/otr-mobile-canonical`.

Initial local `main`, `origin/main`, actual remote `refs/heads/main` and isolated
HEAD all matched **094cf3beb6b05f2a7f1c8cca1fa007ed630651c4**. Remote verification
used `git ls-remote`; sandbox DNS failed and the authorized read-only retry
succeeded. No fetch, merge, rebase or ref advancement was performed. The original
dirty chat checkout and all existing worktrees were preserved.

Read canonical current-state first, then AGENTS, PRODUCT, ARCHITECTURE, DATA_MODEL,
API_CONTRACT, OFFLINE_SYNC, ENVIRONMENT_AUDIT and the repository's legacy audit
document. No legacy Web repository inspection occurred. Scoped source audit covered
C2/SQLite51, C4a, corrected SQLite52/53, Membership, P2b-A, Account/transaction
ownership, C3 and SQLite50 Continuation. Historical pending labels are interpreted
through later accepted correction/recheck records and actual canonical source;
the long current-state file contains historical schema/acceptance statements.

Accepted source/evidence reused:

- [C2 implementation](OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md), canonical integration
  and independent review; `captureSubmissionRepository.ts`, its transaction store
  and `captureSubmissions.ts` (SQLite51).
- [C4a report](OTR_PLATFORM_P2_C4A_IMPLEMENTATION_REPORT.md), original review and
  correction/rechecks; `batchAssessment.ts`.
- [SQLite52 contract](OTR_PLATFORM_P2BB_SNAPSHOT_PERSISTENCE_CONTRACT.md), Builder
  report and Independent Review with R1/R2 recheck; observation repository/body
  validator and migration52.
- Membership contract/repository and [migration design](OTR_PLATFORM_PUBLICATION_MEMBERSHIP_MIGRATION_DESIGN.md);
  SQLite53 Builder/review with F1 replacement-retention correction/recheck.
- [P2b-A Builder](OTR_PLATFORM_P2BA_ADAPTER_INTEGRATED_BUILDER_REPORT.md) and
  [Independent Review](OTR_PLATFORM_P2BA_ADAPTER_INTEGRATED_INDEPENDENT_REVIEW.md),
  including R1 legal-PENDING-mutation recheck. Canonical Adapter is accepted dormant.
- [C3 report](OTR_CAPTURE_C3_IMPLEMENTATION_REPORT.md), canonical integration
  evidence, actual `CaptureActivity`, C2 DTO and default operation wrappers;
  [Continuation ADR](../adr/2026-10-06-cp14-continuation-wake-contract.md),
  repository, wake runtime and central operational-sync owner.

Transport evidence is **provisional only**, external to this canonical base:

- Preflight: `/Users/xoery/.codex/worktrees/publication-transport-preflight/otr-mobile-canonical/docs/architecture/OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_PREFLIGHT.md`.
- Builder and original Independent Security Review: same filenames under
  `/Users/xoery/.codex/worktrees/publication-transport-builder/otr-mobile-canonical/docs/architecture/`,
  with suffixes `BUILDER_REPORT.md` and `INDEPENDENT_SECURITY_REVIEW.md`.
- Their worktree HEAD is7273ac0, preceding canonical P2b-A integration. Review says
  IMPORTANT F1 / final dormant acceptance NO: ordinary JSON parsing launders
  duplicate members/unsafe numeric tokens into canonical evidence. Builder now
  appends a correction claiming433 affected tests PASS and seven original probes
  rejected. The inspected original review remains unrechecked; its206 lines contain
  no targeted acceptance appendix. Correction claims are not independent acceptance.
- No Transport code was copied or adopted. No current deployed route, SQL principal,
  native bounded streaming, Hosted contract or production availability is assumed.

This preflight performs source/document validation only. Historical test counts
above are evidence provenance, not newly executed runtime PASS claims.

## 3. Ownership and exact reused components

| Component / path under src                                                                                   | Reused responsibility                                                                                         | Composer boundary                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `data/auth/accountRequestContext.ts`                                                                         | Captured Account/generation, apply gate, context assertions                                                   | One original context through all awaits; no recapture to rescue stale work                 |
| `data/db/database.ts`, `databaseConnection.ts`                                                               | Initialized shared DB and serialized transactions                                                             | Same connection as owning stores; no new opener/manager or implicit initialization on read |
| `data/repositories/captureSubmissionRepository.ts`                                                           | Full immutable C2 header/ordered declarations/lineage and current intake; transaction-local `load`            | C2 remains sole Job/Input/custody/recovery owner                                           |
| `data/repositories/localCaptureInboxRepository.ts`                                                           | CP11 verified originals and immutable payloads                                                                | No new byte store, acquisition or deletion                                                 |
| `data/repositories/tripImportAdmissionRepository.ts`                                                         | `transactionStore.database`, current Trip actor and `assertInput` material/Source/Representation admission    | No catalog apply, preparation or commands by Composer                                      |
| `data/repositories/tripPublicationMembershipRepository.ts`                                                   | Complete trusted retained Membership, `read`, `assertCurrent`, `readCaptureSupport`                           | Never mint/install Membership from local rows                                              |
| `data/repositories/captureSourceAdmissionRepository.ts`                                                      | `createCaptureSourceBindingTransactionStore.assertCurrent`                                                    | Current ASSIGNED Capture/Trip/revision/payload/Original support stays owner-validated      |
| `data/repositories/captureBatchAssessmentAdapter.ts`                                                         | Whole C2 observation, scoped Run discovery, complete Candidate/Input/ancestry mapping, conservative C4a input | Extend only to retain original context/read set through append                             |
| `domain/capture/batchAssessment.ts`                                                                          | Strict pure C4a rules and envelopes                                                                           | Recompute at proposed durable revision                                                     |
| `domain/capture/batchAssessmentObservation.ts`                                                               | Exact canonical complete body, domain-separated digests,2MiB bound and C4a recomputation                      | No alternate body/version                                                                  |
| `data/repositories/captureBatchAssessmentObservationRepository.ts`                                           | Historical chain verification, head, exact read, revision+digest CAS, append/replay                           | Own final SQLite52 transaction and COMMIT                                                  |
| `data/repositories/intelligenceContinuationRepository.ts`, `data/sync/intelligenceContinuationWakeWorker.ts` | SQLite50 task/attempt/execution/install/meter responsibility and approved wake                                | No ownership transfer to Capture Job or assessment                                         |
| `data/sync/ledgerOperationalSync.ts`, `syncOperationRepository.ts`                                           | Existing central timer/claim/signal lifecycle                                                                 | No additional timer/worker/queue                                                           |
| `features/capture/CaptureActivity.tsx`, `data/operations/defaultCaptureSubmission.ts`                        | C3 mount, request epochs, list/reopen and host currentness                                                    | Separate optional assessment summary; stable navigation                                    |

The Composer owns the composition algorithm in `data/operations`, above existing
repositories. It owns no auth transition, Trip grant, Source publication, evidence
custody, intake continuation, provider execution, retry or scheduler lifecycle.

Trip prior remains passive historical context. For each actual publication, use
the same Account/generation with that publication's Trip scope. Current Trip access
is the accepted cached `ledger_actor_context` admission, repeated by the owning
Import/Membership/Capture stores. This is not live server authorization.

Historical integrity means exact retained C2 declarations, chain, body, hashes and
C4a reconstruction verify. It does not mean today's Capture assignment, Trip access,
Source material, Candidate, decisions or review authority match. Every returned
assessment remains read-only; even a just-appended observation grants no action.
Future C5 commands would require their own fresh current/server authorization.

## 4. Proposed Composer API

Factory (explicit injection only):

```ts
createCaptureBatchAssessmentComposer(
  database: PublicationMembershipDatabase,
  importStore: ImportAdmissionRepository["transactionStore"],
  getAccountId: () => Promise<string>,
  dependencies: LocalCaptureDependencies,
): {
  assess(
    context: AccountRequestContext,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<ComposerResult>;
  recover(
    context: AccountRequestContext,
    receipt: AssessmentReceipt,
  ): Promise<RecoveryResult>;
  readAssessment(
    context: AccountRequestContext,
    jobId: string,
  ): Promise<AssessmentProjection>;
}
```

`ImportAdmissionRepository` above denotes the existing factory's ReturnType,
not a proposed parallel interface. Dependencies are trusted local-only hashing,
clock/ID seams already used by C2; no Transport, token provider or remote callback.
Require initialized SQLite52/53 and identical `importStore.database`. Context is
captured by the trusted caller before async work, with empty Trip scope for Job
lookup. Strict Job UUID and original context admission precede private reads.
No API accepts supplied manifest, snapshot, Candidate arrays, generation override,
assessment revision, arbitrary SQL, routing, provider or publication handles.

`AssessmentReceipt` has exactly `accountId,batchId,jobId,revision,bodySha256`;
it is a locator/consistency claim, not authorization. Recovery validates all fields
and exact Account/Job/Batch/hash correlation against the owning retained row.
Revision is positive safe integer; no credential/generation is durable in a receipt.

`ComposerResult` is a discriminated result:

| Status              | Output and meaning                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `APPENDED`          | Receipt and read-only assessment summary, only after COMMIT and original Account fence                                              |
| `EXACT_REPLAY`      | Same receipt/summary, verified historical-only; no write and no fresh-authority implication                                         |
| `UNCHANGED`         | Verified healthy latest observation with identical logical assessment content; historical-only, no allocation                       |
| `REASSESS_REQUIRED` | Code `C4A_STALE_REVISION`, `STALE_OBSERVATION`, `HEAD_CONFLICT` or `REVISION_CONFLICT`; zero claimed new success, no automatic loop |
| `REJECTED`          | Finite safe code for schema/resource/owning admission failure; no fabricated failed-material observation                            |
| `INTEGRITY_BLOCKED` | C2 or observation integrity denies NEW; preserve history                                                                            |
| `UNAVAILABLE`       | No trusted read/initialized schema/Account admission; never empty or successful                                                     |
| `CANCELED`          | Cancellation before any possible append, or positively proven rollback/absence; no durable-work cancellation                        |
| `OUTCOME_UNKNOWN`   | Receipt when a body was sealed and append attempted; exact recovery required, no replacement revision                               |

Retain the sealed canonical raw body and expected head privately for the lifetime
of the active attempt, including unknown ACK recovery. Never send body, bindings,
locators, context text or payloads to Activity or logs. A receipt is sufficient to
read committed history; it is insufficient to retry a lost uncommitted raw body.

`recover` is read-only: `FOUND` with exact receipt and historical-only summary,
`ABSENT` after successful healthy exact lookup, `REVISION_CONFLICT` for a different
retained digest, `INTEGRITY_BLOCKED` or `UNAVAILABLE`. Failed read is never ABSENT.
It must not manufacture a new body or append. Fresh generation may recover original
Account history; old-generation callbacks are still denied.

`readAssessment` returns the projection in section9. Normal expected failures
return finite results; programming errors remain test failures. Preserve diagnostic
codes without leaking exception text/private SQL/payloads. Existing SQLite52 maps
unexpected DB/Account exceptions conservatively to OUTCOME_UNKNOWN; do not relabel
them as confirmed rollback or stale-current proof.

## 5. Minimum required seam deltas

### Adapter: original context and private admission seal

Add internal `observeForComposer(context,jobId)`, preserving the accepted
`assess(jobId)` wrapper and its read-only two-observation/final-validation behavior.
Reuse the same observation and C4a construction, not a copied query implementation.
Return existing c2/manifest/snapshot/assessment/provenance plus an opaque frozen
seal. A module-private WeakMap binds seal to original context, Job and exact canonical
whole observed read set; copied/serialized/forged seals fail. Deep-freeze returned
data or validate exact canonical equality against privately retained data.

Add `assertCurrentForAppend(context,seal,body)`: internal transaction-local method,
never opens a gate/transaction. Require same DB, existing owning transaction,
original Account/generation and exact seal identity. Compare the NEW body to the
sealed C2/manifest/snapshot content, permitting only the durable assessmentRevision
substitution described below; then rerun the existing complete `observe` and compare
its exact canonical read set. Call existing Membership/Capture/Import stores.
Includes discovery and absence, not just previously finding-bearing Runs.
Do not trust body fields to enumerate the final read set.

Per assessment attempt construct the SQLite52 repository with
`assertCurrentOwningData(context,body)` closing over that attempt's immutable seal.
Never use a shared mutable "last observation" validator, which could validate one
callback with another callback's authority. The store invokes this callback inside
its append transaction. No nested public Adapter `assess` or repository read there.

### SQLite52: cancellation through the actual append boundary

Add a narrow optional synchronous dependency `assertAppendActive(): void`, called
on NEW immediately before INSERT and after inserted-chain verification/context
assertion immediately before the transaction callback returns to COMMIT.
The Composer supplies checks of its original signal/current invocation; ordinary
accepted callers without this hook retain behavior. Replay is still historical and
does not require current owning freshness. Fence disclosure for all results.

Why required: checking abort inside `assertCurrentOwningData` alone leaves awaited
C2/hash/insert-readback work before COMMIT. Adapter validation followed by a separate
append cannot fence that window. Do not abuse the Account getter/hash seam to hide
cancellation, change schemas, weaken errors or require NEW admission for old replay.
If cancellation throws, repository rollback/unknown recovery rules apply; never
promise CANCELED simply because an AbortSignal is set after a possible COMMIT.

No transaction-local SQLite52 writer extraction is needed: its existing injected
validator already supplies the final owning seam. No changes to C2, Membership,
Import, Capture, Account gates or transaction manager are proposed.

## 6. Durable revision, exact append and duplicate semantics

Adapter `assessmentRevision=1` is invocation-local, not durable allocation.
Read verified SQLite52 head `H={revision,bodySha256}`; EMPTY is exactly0/null.
INTEGRITY_BLOCKED/UNAVAILABLE forbids allocating from an apparent prefix.

For NEW, proposed durable revision is `r=H.revision+1`, checked safe before hash.
Overflow rejects. Clone the owner-produced snapshot, set only its assessmentRevision
to r, recompute `otr-capture-processing-snapshot-v1`, construct matching complete
`current` pins, and rerun `assessCaptureBatch` on canonical primitive JSON text.
Use that recomputed envelope; never relabel the revision1 envelope or its digest.

Construct exact existing v1 body:

```text
version = 1
c2RequestSha256 = Adapter.c2.requestSha256
c2ManifestSha256 = Adapter.c2.manifestSha256
contextSha256 = manifest.contextSha256
parentBodySha256 = H.bodySha256
manifest = exact owning C4 intake manifest
snapshot = complete snapshot at r
envelope = freshly recomputed C4a at r
```

Context uses `otr-capture-context-v1`; C2 request/manifest digests keep their existing
separate calculations. C4 manifest uses `otr-capture-intake-manifest-v1`; complete
body uses `otr-capture-assessment-observation-v1`. Canonical array order, full
roster, metadata, locators and lineage are preserved. Validate complete body with
the existing validator before append; no original C2 context reserialization.

Call existing `append(context,H,raw)`. Thus "expectedRevision" is H.revision,
parentDigest is H.bodySha256, inserted revision is H.revision+1. SQL52, PK and
repository check both revision and digest. INSERT exactly one row; no UPDATE,
REPLACE, UPSERT, gap, mutable head or allocation on rollback.

Exact replay requires that revision's digest AND complete canonical body bytes
match; same digest alone is insufficient. Repository can replay an older exact row
after later appends and legitimate current Input/Capture changes. It preserves
historicalOnly/chainStatus and does not rerun current admission. Different bytes at
that revision are REVISION_CONFLICT. Corrupt tails never authorize NEW; a verified
prefix/exact replay with blocked chain remains historical diagnostic only.

**Proposed idempotency policy needing Owner approval:** assess observes latest
logical content, not "record every callback". Before sealing NEW, read the exact
healthy head body and compare canonical tuples:

```text
[c2RequestSha256,c2ManifestSha256,contextSha256,manifest,
 snapshot with assessmentRevision replaced by 1]
```

The tuple retains every other snapshot field, including full Inputs/revisions,
bindings, findings/dependencies, decisions and historicalEvidence. No sorting,
dropping UNKNOWN or "same finding count" shortcut. Existing body validation proves
the envelope is deterministic from those fields. Parent/revision and their derived
hashes are allocation metadata, excluded only for this equality test. Do not persist
a new equivalence hash/index. Compare only with the verified healthy latest row.

Equal content returns UNCHANGED/historical-only. It is not exact replay of newly
fabricated bytes and not a fresh authority assertion. Legitimate later changed
content appends once. A→different content→A appends a new revision; no old-row
dedup erases transitions. This policy deliberately does not record repeated
unchanged invocations as new observations; SQLite52 still permits distinct exact
revisions for other authorized callers. No force-record option is proposed.

Concurrent identical sealed attempts against the same H produce identical raw
bytes: one APPENDED, the other EXACT_REPLAY. A callback beginning after that commit
returns UNCHANGED. Concurrent different content cannot silently rebase. After CAS
or read-set change, discard the uncommitted seal and require a fresh assessment
invocation: new complete owning read, healthy head and recomputation. Never change
the revision/parent of an old sealed body in place or automatically retry in a loop.

## 7. Transaction and recovery sequence

1. Capture original Account context before calling Composer. Check local admission,
   strict Job and initialized same database. No token refresh/network is needed.
2. Any future authenticated catalog read and trusted Membership installation are
   separate operations completed beforehand. HTTP/Transport ends before its owning
   SQLite53 install transaction; that COMMIT finishes before Composer begins.
   A installed Membership may remain if a later assessment fails: these are separate
   truthful commitments, not a cross-network atomic transaction.
3. Adapter performs accepted initial/final read-only observations and sealing under
   the original context. SQLite52 reads a healthy head/exact head body. All these
   transactions end before revision/envelope/body hashing outside the final gate.
   If latest logical content is equal, return historical UNCHANGED after Account
   fencing. A concurrently newer head does not make this old observation current.
4. Seal proposed r/parent/body/receipt, retaining exact raw bytes privately.
5. SQLite52 takes the existing Account apply gate and serialized owning transaction.
   Assert original context; validate complete C2 and historical chain.
   First honor exact replay. For NEW compare exact expected head.
6. Invoke the seal-bound Adapter validator inside this transaction. Reload complete
   Job roster/intake, admitted bindings, discovered Runs and all owner catalogs,
   trusted Membership, current Trip actor, Source/material/selected/Original DAG,
   Candidate/Input roster and current Capture support. Compare whole observed set.
   SQLite52 independently validates current C2 Input facts. Every dependency is local.
7. Check original context and cancellation; INSERT one exact complete observation.
   Re-read/verify chain, check context/cancellation again, then COMMIT. Any failure
   before COMMIT rolls back the NEW row; prior histories/originals remain retained.
8. After COMMIT check original context/signal before disclosure. Return receipt and
   summary or OUTCOME_UNKNOWN for a lost ACK/post-COMMIT invalidation. Notify only
   through the owning caller after durable success and its final currentness fence.
9. Recovery reads exact Account/Batch/revision/hash before any same-body retry.
   No synchronous UI success is inferred from an INSERT callback alone.

TOCTOU addressed: mutation during sealing, between Adapter's final return and
append, during revision/body hashing, new/removed discovered binding/Run, unreferenced
Candidate/Input mutation, current Capture/Trip/Source revoke, Account generation,
concurrent head allocation and late cancellation. Testing must demonstrate the
final owning transaction actually ran, not merely that a fixture guard threw.

The final transaction protects a coherent **local** observation and its append.
Shared connection serialization covers scoped transactions, not arbitrary unscoped
statements joining an open transaction. Existing convention is mandatory; internal
`isInTransactionAsync` is not an ownership token. Multi-connection contention may
yield BUSY/LOCKED rather than a CAS error; do not claim the JS gate is a global lock.
A server revoke unseen locally can occur after Transport observation; local COMMIT
cannot certify contemporaneous server authority. Another HTTP check cannot eliminate
that distributed race. C5 remains closed and future commands must reauthorize.

| Failure boundary                                              | Required result/recovery                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| C4a/schema/whole-Job or body limit before append              | Reject whole; no SQLite52 row, no altered evidence                                                                        |
| Current read-set changed or head CAS lost                     | REASSESS_REQUIRED; no silent reuse/rebase or retry loop                                                                   |
| SQL BUSY/LOCKED/FULL/IOERR, INSERT/readback/COMMIT failure    | Preserve exact attempted receipt/raw; rollback where safe; classify conservatively unknown and perform exact readback     |
| Rollback/readback also fails                                  | OUTCOME_UNKNOWN; failed read is not absence; no new allocation or eviction                                                |
| Exact retained body/hash found, even after restart/newer head | Historical recovered success, no write or current freshness claim                                                         |
| Exact healthy absence with original raw still retained        | Same-body retry only under original valid context, same H and fresh owning seal validation; otherwise reassess explicitly |
| Another body retained at attempted revision                   | REVISION_CONFLICT; old request is not replayable as a replacement                                                         |
| Cancel before any append attempt                              | CANCELED; no C2/Continuation mutation                                                                                     |
| Cancel/Account change after possible COMMIT                   | Unknown until exact read; committed history never deleted                                                                 |
| Same Account with new generation, A→B→A                       | Old callback/opaque seal denied; fresh A may inspect/recover its historical rows; B cannot see A                          |

Cold restart retains C2, Membership and SQLite52, not an opaque Adapter seal,
process generation or uncommitted raw body. With a surviving receipt, recover exact.
Without one, verify healthy history and reassess current local state explicitly;
stable latest content returns UNCHANGED, avoiding a duplicate callback row.
This does not acknowledge an unidentifiable old invocation or promise durable
resumption of a pre-COMMIT assessment. No new user/business intent is pending:
C2's original durable work is untouched. If Owner requires exact invocation-level
ACK recovery without a retained receipt even after content changes, the proposed
minimum API is insufficient; a separate durable request contract would be needed.
Do not add that journal speculatively.

Partial failures preserve truthful boundaries: install success/assessment failure
leaves Membership; assessment success/notification failure leaves SQLite52 and can
be rediscovered; acquisition partial failure leaves full C2 roster. No process or
queue completion claims understanding, canonical success or evidence-release proof.

## 8. Whole roster and resource behavior

C2 Input identity is an occurrence, not a payload hash. Include all declared ordered
occurrences, duplicates, pending, failed, accepted and RECOVER_COMMIT/UNKNOWN facts.
Distinct equal bytes retain distinct Capture/Input identities and replay keys.
Every whole-Run Input, including unreferenced siblings, stays mapped. Preserve
separate Original and selected Representation provenance; ambiguous multi-root
single-Capture support denies. No derivation or interpretation is performed.

Without admitted bindings, accepted originals remain processing UNKNOWN.
When a discovered Run's Membership is absent/NULL/untrusted/stale or owner validation
denies, reject/unavailable the whole assessment; do not omit that Run to manufacture
an understood subset. No binding/publication discovered is different: preserve
all Inputs and their UNKNOWN/NOT_APPLICABLE states and assess them conservatively.
Membership present with zero Candidates does not establish understood success.

P2b-A marks evidenced supported Inputs UNDERSTOOD; other accepted siblings remain
UNKNOWN. Dependencies for unsupported siblings remain UNKNOWN/BLOCKED.
Do not add INDEPENDENT assertions, treat network silence as completion, clear
UNKNOWN by time, map intake saved to processing success, or manufacture decisions.
Adapter decisions/historicalEvidence remain its existing empty arrays; old SQLite52
observations remain in their immutable chain, not copied into invented C4a decisions.

C4a v1:64 Inputs,64 total bindings,64 findings and1,048,576-byte request; existing
Membership/current-catalog limits remain intact (64 rows/family, bounded DAG,
32,768-byte envelope and4MiB catalog parsing). SQLite52 complete body limit is
2,097,152 UTF-8 bytes, independently of C4a admission. Some valid C4a bodies
exceed storage admission; return RECORD_TOO_LARGE without append.

Oversized whole Job/Run/catalog rejects whole. Never truncate Inputs/locators,
artificially split a registered Job, page-merge a fake complete publication,
compress/omit the body or store an envelope alone. C3 continues truthful C2 display.
FULL blocks new observation storage; no pruning, deletion or substitute byte store.

## 9. C3 Activity, Continuation and notification contracts

Two different C2 meanings must remain distinct:

- Capture C2/SQLite51 owns Job/intake/explicit continuation via
  continuesFromInputId. C3 consumes `CaptureJobReadModel`, list/reopen actions,
  real saved/failed/pending counts and stable20-Job pagination.
- CP14 C2/SQLite50 owns intelligence Task/Attempt/wait/execution/install/meter
  facts. `ContinuationNotificationFact` is already an atomic task snapshot.
  It is not a Capture Job DTO. No accepted durable Job→Task association is
  established by this preflight; never match them by equal UUID or Trip prior.

Minimum separate `AssessmentProjection` for an admitted Job:

```text
status: UNASSESSED | OBSERVED | INTEGRITY_BLOCKED | UNAVAILABLE
receipt: AssessmentReceipt | null
historicalOnly: true
currentAuthority: NOT_ASSERTED
summary (OBSERVED only):
  barrier: PENDING | ASSESSED_READ_ONLY
  inputCount: complete envelope.coverage.length
  findingCount: complete envelope.findings.length
  blockedFindingCount: dependencyState=BLOCKED count
  supportedFindingCount: dependencyState=SUPPORTED_READ_ONLY count
  matureActionableAttention: false
  preparation: NOT_AUTHORIZED
  domainAdmission: NOT_AUTHORIZED
```

Read initialized DB only; verify scoped C2 Job first, then healthy head and exact
body. No observation means UNASSESSED; unavailable is not empty; corrupt tail
returns INTEGRITY_BLOCKED and no promoted prefix summary. Observation counts are
historical assessment coverage, never admitted-create/update totals or progress %.
No raw body, findings, source text, locators or Trip routing enters this DTO.

Keep `CaptureJobReadModel.processing.capability=NOT_INSTALLED`, results0/null and
review/resume flags unchanged in the dormant Builder. Supply a separate projection
to a later Experience-owned integration, not a contradictory replacement of C2
facts. C3 can list/reopen every real Job when Composer is disabled, oversized,
unavailable, offline or absent. Assessment reads never run assess or repair history.

Notification means a proposed content-free in-process invalidation fact
`{accountId,generation,jobId,batchId,revision,bodySha256}`, returned to the trusted
operation caller with APPENDED/recovered success. No new event bus is needed in the
dormant Builder. A later admitted caller may request one local reread after COMMIT;
dedup by exact receipt, fence original generation/focus/request epoch, and do not
notify from UNKNOWN or stale callbacks. Notification failure cannot undo COMMIT.
Cold restart/focus/manual refresh rediscovers history; delivery is not durable or
exactly-once. Banner/OS/push/semantic attention remain closed.

Existing C3 has mount/refocus/manual-refresh reads and no assessment subscription.
Do not mislabel `notifyLedgerReadCompletion` as a Capture event: its DTO is
Ledger/Journey-scoped. Existing `ledgerOperationalSync` remains the only timer/
wake owner. Future integration, if separately authorized, may invoke local Composer
once after an accepted owning-data change or an existing evaluation pass, outside
that pass's transaction. It cannot add polling or use assessment append to recursively
wake itself. No lifecycle registration belongs in this Builder.

Existing `INTELLIGENCE_CONTINUATION_WAKE` coalescing, claims, conditional signal
finalization, waits, publication fences and exact execution recovery remain unchanged.
Composer does not schedule/resume tasks, create attempts, call router/executor,
complete queue rows or alter provider UNKNOWN. A later existing task wake requires
its actual retained task ID/current admission; a Capture Job UUID is insufficient.
No new queue kind/second worker, automatic startup scan or retry timer is permitted.

Experience keeps `/capture?jobId=<UUID>`, admitted list/reopen callbacks, Hide,
continuation navigation and host remount/currentness semantics. No AI-generated
route, inferred target, new shell or UI/copy change is proposed.

## 10. Dependency and activation matrix

| Capability                                           | Dormant local Builder dependency                                                                     | Live/product gate                                                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| C2/SQLite51 full Job/custody                         | Accepted canonical source; actual fixture roster required                                            | Existing C2 acceptance preserved                                                                                                                   |
| C4a                                                  | Accepted pure function; revision recomputation                                                       | No action authority                                                                                                                                |
| SQLite52                                             | Accepted append/history/CAS; proposed pre-COMMIT hook                                                | Composer Owner acceptance and independent review                                                                                                   |
| Membership/SQLite53                                  | Accepted current owning store/guards; trusted installed envelope required for discovered publication | Live trusted installation separately authorized                                                                                                    |
| P2b-A                                                | Accepted dormant observation; proposed seal/context/transaction validator                            | No default runtime composition                                                                                                                     |
| Already-installed trusted local Membership           | Sufficient for local assessment when all current local owner checks pass                             | Offline historical/current-local observation only; no server freshness lease                                                                       |
| Membership absent with no publication binding        | Full conservative UNKNOWN assessment is possible                                                     | No enrichment/understanding inferred                                                                                                               |
| Discovered publication with missing/stale Membership | Whole assessment unavailable/rejected; retained history readable                                     | Accepted fresh Transport/install needed before supported assessment                                                                                |
| Authenticated Publication Transport                  | Not imported/called; synthetic trusted owning installs labeled TEST-ONLY                             | Corrected F1 independent recheck, final Owner acceptance, canonical integration                                                                    |
| Real SQL/Hosted                                      | No dependency for local code fixtures                                                                | Dedicated actual session principal/driver/TLS/primary/lease retirement, protected root/schema/ACL/RLS verification and bounded DEV read acceptance |
| Native network                                       | No dependency for dormant local tests                                                                | Installed bounded streaming/decompression/abort/redirect capability and native acceptance                                                          |
| C3/Experience                                        | Separate summary DTO/tests only                                                                      | Experience approval for rendering/invalidation mount; no navigation changes                                                                        |
| Existing Continuation lifecycle                      | Preserve contracts/regressions; no registration                                                      | Separate caller/task association and wake authorization                                                                                            |
| C5/C9/providers/business writes                      | Forbidden dependencies and call sites                                                                | CLOSED; no permission follows from any preceding row                                                                                               |

Network offline/missing Transport never blocks C2 or historical assessment reads.
Trusted installed Membership can be read without new network authentication; known
local loss of Capture/Trip/Source authority denies NEW. Offline inability to learn
remote revoke is not current server clearance. No local hash/fake reader/repair
can fill missing Membership authority. Runtime activation and local Builder
acceptance are separate; neither implies live network installation.

Rollback disables/withholds Composer and later consumer registration. Preserve
SQLite51 Job/intake,52 entire immutable history,53 Membership/guards and50 execution
responsibility. No destructive down migration, reset, history rewrite, pruning,
credential fallback, Evidence release or old-provider replay.

## 11. Builder tests and independent-review plan

Reuse Adapter's real51–53 fixtures and SQLite52's file-backed lost-ACK/FULL/
WAL-contention fixtures. All publication RPC fakes must remain visibly TEST-ONLY;
do not claim server completeness from a rehashed subset. Required integrated tests:

| Area                       | Acceptance assertions                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full C2 and duplicates     | All occurrences/order/replay/lineage and C2 digests survive; duplicate bytes stay separate; corrupt/missing immutable declaration denies                                                                  |
| Membership                 | Installed trusted positive, no binding UNKNOWN positive, historical NULL/absent schema/discovered missing or stale negative; zero-Candidate READY distinct from unavailable                               |
| Current authority          | Legal Capture unassign/reassign/binding revision, Trip actor revoke, Source lifecycle/material/revision/Representation ancestry loss before final append deny; originals/history retained                 |
| Mutation/read-set races    | Candidate/Run/Input including unreferenced sibling, missing all Inputs, new binding/Run between Adapter validation and append; legal pending revision advance; exact final transaction/read reached       |
| Account                    | A→B→A and same Account new generation during observe/hash/final validation/insert/COMMIT/disclosure; old seal denied, fresh A historical recovery, B zero disclosure                                      |
| Concurrent/duplicate       | Same H/content yields one append+exact replay; later duplicate UNCHANGED; changed content CAS conflict; separate WAL writer BUSY/conflict with no gap/rebase                                              |
| Revision/body              | 0/null→1→2, exact expected revision AND parent digest, envelope recomputed at r; no reused rev1 hash; overflow before hashing; exact replay after newer head/current authority changes remains historical |
| ACK/faults                 | COMMIT-before-ACK, readback unavailable, rollback failure, real disposable FULL, injected IOERR/BUSY at validation/INSERT/readback/COMMIT; previous typed rows/digests survive reopen                     |
| Cold/partial               | Restart before/after commit, receipt present/lost, changed vs stable current content; no automatic replacement while unresolved; install-success/assessment-failure and notification-failure retain truth |
| Uncertainty/dependency     | RECOVER_COMMIT UNKNOWN and accepted-unprocessed UNKNOWN, no asserted independence, whole sibling dependency blocking, NOT_AUTHORIZED and false mature attention invariant                                 |
| Whole-Job bounds           | 64/65 Inputs, total bindings/findings, C4a1MiB and body2MiB inclusive/one-over, C4a-valid oversized body; no partial row/truncation/split                                                                 |
| Cancellation               | Before observation/seal/append, after owning validator but before INSERT, during inserted readback and post-COMMIT; canceled known rollback vs uncertain retained outcome correctly distinguished         |
| C3/projection/notification | Zero-write read, empty vs unavailable vs corrupt, full counts/historical flags, C2 fallback, current-generation once-per-receipt invalidation and lost notification rediscovery                           |
| Offline/Transport          | No token/fetch/provider callback under local composition, already-installed Membership offline works; missing Transport does not manufacture completeness or block C2                                     |
| Closed authority           | Spy/abort guards prove no Source/Run install, CP13A prepare, C5/C9, provider/router/executor, business DML, queue authoring/drain, startup, timers or AI routing                                          |

Inject mutations successfully and assert exact denial + reached final admission,
following P2b-A R1. Independent review must include a disposable negative control
bypassing final read-set comparison, cancellation hook and unchanged-content
comparison; required tests must fail for the intended reason. Do not weaken fixture
guards or count setup exceptions as freshness evidence.

Focused regressions: Composer/Adapter/observation repository/body/C4a, C2/CP11,
Membership/SQLite53 migration, Import/Source, Account request/switch, serialized
DB and Continuation/sync dispatch tests. Reuse current Node SQLite/Vitest helpers.
Run typecheck, full lint and `npm run ui:guard`, Backend build (compile only),
changed-file formatting and `git diff --check`; preserve migration/registry hashes.
No native/Hosted/provisioning operation or provider-capable test execution.
Use existing network-denial harness where applicable; test host failure must be
distinct from assertion success. Broaden only for new failures or changed callers.

Independent reviewer in a separately authorized review checkpoint should trace
every caller/seam, check seal forgery and cross-attempt validator substitution,
repeat successful late mutation and lost-ACK/cold probes, inspect complete
preservation manifests, and certify dormant scope. This task does not perform or
claim independent review. Native Expo concurrency, real disk/power loss and live
Transport require separately approved acceptance; Node tests cannot certify them.

## 12. Open Owner decisions and readiness

Required before Builder:

1. Approve the original-context/private-seal Adapter API and final transaction-local
   validator; approve only the narrow synchronous SQLite52 cancellation hook.
2. Approve latest-logical-content idempotency (UNCHANGED suppresses repeated equal
   observations) and receipt-based exact recovery. No durable invocation journal
   or promise to resume an unidentified uncommitted attempt across restart.
3. Approve offline local-only composition from already-installed trusted Membership,
   including conservative no-binding UNKNOWN, with no server-at-COMMIT freshness
   guarantee and no Transport refresh in this Composer.
4. Approve the separate historical-only C3 summary contract; leave C2 processing/
   result/action fields, actual Experience rendering, notification delivery and
   lifecycle callers closed until separate authorization.

No size/schema/pruning policy is reopened. If Owner requires repeated identical
invocation history, exact invocation resumption without a receipt, atomic network+
local commit, or server-current authorization at local COMMIT, stop for a distinct
contract review; these cannot be silently added to this minimal Builder.

Remaining Transport dependencies: original F1 correction must receive independent
targeted recheck and Owner acceptance, then separately verified canonical integration.
Actual dedicated principal/SQL driver and uncertain lease retirement, Hosted
protected-root/schema/ACL verification, bounded native streaming and DEV transport/
installation/native acceptance remain closed. Completion of local Composer tests
does not close those gates.

Builder readiness: **CONTRACT DELTA REQUIRED** now. After the four decisions and
explicit implementation authorization, the exact dormant scope in section1 is
ready to build independently of live Transport. Product/runtime activation is
**BLOCKED** on separate Transport, Experience/lifecycle and native gates.
C5/C9/providers/canonical and business writes remain CLOSED in either state.

Performed here: initial three-ref source verification, fresh isolated source audit,
documentation contract cross-check, formatting/whitespace and two-document scope
verification. No new runtime test, implementation, migration, Hosted/device/network
publication read, provider call, activation, commit, push or merge.

Not checked: full suite, native/Hosted/Transport execution or physical fault behavior.
Main risks to review are the new admission seams, unchanged-observation recovery
policy and absence of a server-freshness guarantee.

**STOP — P2c INTEGRATED C4 COMPOSER PREFLIGHT / OWNER REVIEW REQUIRED.**
