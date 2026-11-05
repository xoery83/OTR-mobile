# P3 CORRECT claim / one-shot consume — contract for security review

Baseline actually read from origin/main: `45eee0f5df3f891cf75cecfae427b25d2d9237e4`. PRECLAIM source is already integrated. Native caller evidence: `92e7ff0b`, `QUEUED_CORRECT_DISPATCH_PHASE_CALLER_GAP.json`. **Contract only; no implementation, main rights, dispatch activation or new authority.**

## API and ownership

```ts
type CorrectionClaim = Readonly<{
  version: 1;
  operationId: string;
  intentSha256: string;
  claimOwner: string; // actual durable Queue claim identity, not a permit
}>;
type ClaimResult =
  | { kind: 'NOT_CLAIMED' }
  | { kind: 'CLAIMED'; path: 'CANDIDATE' | 'RECEIPT_ONLY'; claim: CorrectionClaim };

claimQueuedManualInstructionCorrection(ctx, observedOperation: SyncOperation): Promise<ClaimResult>;
consumeAndSubmitManualInstructionCorrection(ctx, claim: CorrectionClaim, transport: ExistingCoreTransport):
  Promise<{kind: 'RECEIPT'; result: CoreReceiptProjection} | {kind: 'RECEIPT_ONLY'}>;
```

The second port performs the atomic consume and then invokes the **existing** transport.submit exactly once on success; it does not return a reusable CONSUMED/ELIGIBLE permission object. Original command comes from the immutable local journal, never a UI replacement. ExistingCoreTransport is the existing authorized receipt/guarded-submit dependency, not a new Provider or Backend interface.

Core owns these Repo atomic ports, typed identity, immutable-intent/accepted-proof checks and transaction tests. Native owns claimOperation/settleOperation adapters and worker/coordinator consumption. Existing SyncEngine already has those async hooks; Core's current queue lacks their command-specific implementation. No second Queue/Engine, new SQLite column/permit table, credentials, UI flag or Source authority.

## Atomic claim and durable identity

Under the Account apply gate and one original SQLite transaction:

1. Validate current Account/Trip/generation and the exact observed original Queue identity/preimage, canonical journal payload/digest, real INSTRUCTION entity, idempotency key and command. Only MANUAL CORRECT for this port; no changed operation, body or base.
2. New-candidate qualification requires PENDING, attempt_count=0, last_attempt_at=NULL, no own receipt/reconcile/UNKNOWN, and the existing accepted certificate + trusted Actor + live self-owned P3 ARRIVAL/DEPARTURE head. Reuse the current resolver and complete local MANUAL/null-source/FULL APPLIED receipt chain; no pending replay, Source-null inference or rebase.
3. If command binding/Auth is valid but NEW eligibility is absent, retained, uncertain, already APPLIED, or currently unprovable, keep an explicit RECEIPT_ONLY route. Eligibility failure must not suppress original receipt recovery. Actual Account/Trip Auth rejection still fails closed; no other identity fallback.
4. CAS the same Queue row to PROCESSING with one newly generated opaque per-claim identity, existing lease/last_attempt metadata and all original identity/preimage predicates. Never just reuse the generic process-level owner or infer phase from count0. Return only the actual identity from that successful CAS.

**Binding representation for review:** claim_owner remains an opaque execution identity. A candidate identity includes a versioned random per-claim nonce plus a hash of the Core-created claim context; a receipt-only identity has no candidate context. The context hash binds a Core-private current execution incarnation, original intent digest, Account/Trip/generation, accepted certificate/Actor, parent/entry/newEntry identities and immutable chain/receipt hashes. This is an identity fingerprint in the existing claim-owner field, not a grant: consume always rereads/revalidates authority. Caller DTO/path changes cannot alter the actual stored identity or its binding. Do not encode permission bits or accept caller-chosen owners/context hashes. **This representation needs independent contract review before code.**

**R1 — current execution negative fence.** Core creates a fresh random module/process incarnation on module load and a fresh private factory/execution incarnation for each owning Core port instance, using existing UUID/local-ID primitives. Their combination stays only in that instance's private execution context: never returned in a DTO, persisted/imported as a value, accepted as a constructor option, hydrated from a claim, or selected by Native/UI. Only its contribution to the claim fingerprint is durable. Claim and consume recompute with the actual current private incarnation; an old DTO/nonce/owner cannot restore it. Native adapter, worker and guarded callback must use the actual **same owning Core instance/ports** from claim through consume; recreating that factory/module is a new incarnation, not a way to revive its claims.

Account generation may reset to0 on cold start, so matching numeric generation/Account/certificate/head and an unexpired retained lease are insufficient. A copied old candidate DTO must stay original-operation receipt-recovery-only after cold restart or port recreation, even if recoverInterrupted has not run. Incarnation mismatch is solely a negative replay fence, never an ELIGIBLE flag, WeakMap permit or substitute for actual stored Queue owner CAS, current Auth/certificate/head/chain checks or receipt-first. Receipt recovery remains usable without candidate-incarnation equality.

Lease expiry is only a negative concurrency fence; lease age/time is never proof of no prior submit or of Source authority.

## Receipt-first consume and single execution

1. Validate actual same-account original claim/journal identity, then call existing transport.receipt for its original operation outside SQLite/Account locks. No caller-provided `receiptWasRead` or `noReceipt` flag. Existing worker receipt-first remains intact; this final guarded port may make one additional ordinary receipt read to avoid accepting an unwitnessed observation.
2. A retained response returns through the existing receipt path with unchanged hash/Actor/Trip/operation validation and outcome semantics. FULL receipt/status validation must bind the original Account/Trip/operation and receipt/intent hashes. Valid STATUS_ONLY or retained-but-redacted presence is not null and cannot authorize submit; existing authorization/recovery handling stays nonterminal unless a validated immutable receipt supports normal terminal application. Invalid/error is never fallback-null. No new submit or IN_FLIGHT consume.
3. Null response on RECEIPT_ONLY always returns RECEIPT_ONLY. It cannot fall through to submit. Missing/replayed/wrong claim, generation/certificate drift, expired/lost lease, old UNKNOWN, changed payload/base/head or failed current chain proof also never submits.
4. For the actual candidate claim, reenter Account gate + one SQLite transaction. Compare the actual PROCESSING row/claim identity with the returned identity. Recompute its context binding using the current private module/factory incarnation, current Account generation, accepted certificate/Actor/parent/entry/chain and unchanged original journal. Reject any mismatch; no alternate graph or certificate rebase.
5. In that transaction CAS **only the original intent** from BLOCKED/PENDING to existing IN_FLIGHT, conditioned on its exact digest plus the actual same live Queue claim. Exactly one invocation may win. No Queue/identity rewrite or receipt fabrication.
6. Only a definitely committed CAS with changes==1 may release SQLite locks, reassert the same context and synchronously hand off to one existing guarded transport.submit invocation for the exact canonical command. Reuse the existing transport generation/context-before-request checks; no Auth redesign. Return only its real result through existing receipt handling. A rollback, uncertain local commit, synchronous throw, timeout, drift or crash never resets IN_FLIGHT or authorizes retry. Every actual submit must pass this port; copied claim/result objects do not allow another CAS.

## State / compatibility

| Existing state | New behavior |
|---|---|
| Fresh unclaimed, fully qualified CORRECT | Atomic candidate claim; receipt read; one consume CAS; same existing submit |
| Fresh but no accepted provenance/target/certificate | Receipt-only claim/read, no consume/submit |
| PROCESSING from old generic path, even count0 | No candidate binding; receipt recovery only |
| Prior last_attempt, UNKNOWN, RETRYABLE or interrupted | Receipt-only; no resetting attempt/state/identity |
| Own retained receipt/APPLIED | Existing receipt recovery/application; no new consume |
| Duplicate consume or replayed claim | Same-incarnation intent/claim CAS wins at most once; old-incarnation binding cannot consume at all |
| Crash/recreated port after claim before consume, same generation0/certificate and valid lease | Private incarnation differs: original receipt recovery only, even if old DTO/owner is restored or recovery cleanup has not run |
| Crash/timeout after consume | Keep IN_FLIGHT as may-have-submitted; original receipt only, never auto reset/refund/replacement |
| Receipt conflict/rejection | Preserve existing receipt → CONFLICT/REVIEW mapping; never coerce APPLIED |

No migration/backfill turns historical claims into candidate identities. Account/Trip revocation never becomes a different Actor or Source read right.

## Exact Native hook requirements / review items

- Only the bounded CORRECT branch uses this Core claim adapter; all unrelated commands keep their existing queue behavior and default switches.
- claimOperation receives the existing observed operation, invokes the Core port, and attaches only its actual returned claim identity to that operation. The path tag is routing only; Core independently checks the stored identity. No WeakMap/boolean authority cache.
- worker retains original receipt-first and all capability/family/current-Actor guards. CORRECT remains closed until this contract and both implementations pass independent review. Pass the actual claim to the final Core port with existing receipt/guarded-submit transport; do not call ordinary submit separately after its response.
- **R2 — RECEIPT_ONLY/null is nonterminal.** Native worker must not resolve successfully on this result. It must use the existing dependency/recovery path, e.g. throw `SyncDependencyError('CORE_INSTRUCTION_RECEIPT_RECOVERY_PENDING')`; this is an existing failure category, not a new Engine/result platform. The command-specific settleOperation receives that nonterminal error and claim-CAS defers/releases only its own row using the existing dependency/recovery status (normally DEPENDENCY_BLOCKED), retaining original operation/hash, last-attempt evidence and Core IN_FLIGHT. No ordinary-submit fallback, COMPLETED, or reset to fresh eligibility.
- settleOperation must settle only the actual same claim/Account/Trip/original operation and immutable payload/digest/base through the owning Queue repository. Only a validated retained/submitted immutable original receipt may permit terminal dispatch settlement, preserving existing APPLIED/NO_CHANGE→APPLIED, CONFLICT→CONFLICT and REJECTED→REVIEW journal mappings; never manufacture APPLIED. Error-free worker resolution alone is insufficient: settlement must verify that durable receipt/outcome, not just its owner or a caller success flag. STATUS_ONLY/redacted/no receipt, transport/validation failure and recovery-pending remain nonterminal/error by existing policy.
- Stale/wrong-owner settlement is rejection/no-op for Queue state, never permission to complete/quarantine a newer claim. A valid original receipt remains recoverable before/after lease loss through its ordinary owning receipt path. Generation change skips settlement as the current Engine does; preserve the outstanding claim/receipt-only recovery rather than forcing cleanup or resetting IN_FLIGHT. Generic markCompleted(id)/markRetryable(id) alone are insufficient. Native owns the minimal existing-Repo claim-bound lifecycle adaptation; this is a required interface gap, not an implemented claim.
- Follow-up security review before code is limited to R1 current private incarnation and R2 nonterminal receipt-only settlement; all other contract scope is unchanged. Existing default switches/unconditional CORRECT close, guarded submit checks and no-recursive-consume requirement remain intact. No new protected business authority is claimed by this local binding.

Tests after contract approval: cold reopen with retained valid lease/same generation0/certificate/copied DTO and no prior cleanup must not consume, while original receipt recovery works; receipt-only/null must yield no submit and no COMPLETED; stale finalizer cannot alter a newer claim; same-incarnation concurrent claim/consume, full CAS rollback, replay/mismatched owner/digest, generation/certificate/head drift, Source-redacted provenance refusal, receipt-present/null/error/redacted paths, first-claim ambiguity, historical last_attempt/UNKNOWN, callback invocation count, original receipt and identity retention. Reuse existing fixtures; no old 84/32 suite rerun.
