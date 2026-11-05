# Core P3 CORRECT claim/consume source candidate

Actual source baseline read from origin/main: `ce054e1607b00ee30e9ec7599cced1c4e2c3dc2f`. Parent accepted contract `ac82ad1193c7455bda5ac4cbb138e6f111c67de5`; exact contract and its R1/R2 security delta review are archived here. This implementation still needs independent **code** review and source integration. No Worker/Cloud/Native E2E or Hosted authority is claimed.

## Exact exported ports

In `src/data/repositories/tripCoreV2Repository.ts`:

- `CoreCorrectionClaim = Readonly<{ version:1; operationId; intentSha256; claimOwner }>`.
- `claimQueuedManualInstructionCorrection(ctx, observedOperation: SyncOperation): Promise<CoreCorrectionClaimResult>` returns NOT_CLAIMED or CLAIMED with a CANDIDATE/RECEIPT_ONLY routing path and the actual durable claim identity.
- `consumeAndSubmitManualInstructionCorrection(ctx, actualClaim, existingTransport): Promise<CoreCorrectionExecutionResult>` returns RECEIPT with the existing CoreReceiptProjection, or RECEIPT_ONLY. The existing transport supplies actual receipt and guarded submit functions. A definitely committed IN_FLIGHT CAS alone triggers one synchronous after-Account-gate handoff to that original submit; no reusable CONSUMED permit escapes.

The opaque claimOwner is a versioned nonce/context-fingerprint string. Native must treat it as an exact identity, not parse it or treat a path tag as authority. The context hash includes current private module + owning-factory incarnation, generation/Account/Trip, accepted certificate/Actor, real parent/old+new entry, exact original journal/queue identity and complete MANUAL FULL-receipt chain. Raw incarnations are never persisted, returned, hydrated or caller-selectable. Recreated owner ports refuse old candidate DTOs even with the same generation/certificate/valid lease; original receipt reads remain usable.

The fingerprint also seals the actual minted claim postimage (attempt/lastAttempt/lease/time, dependency/error/request/firstFailed evidence). Claim reads back that postimage in the same transaction before returning identity; consume must match it and CAS the same fields. Existing legitimate dependency metadata is preserved exactly, never blanket-cleared or rebuilt from later changed metadata.

The old UI hint and PRECLAIM query retain their meanings. All Source/Actor/certificate/head/CAS/manual-origin checks are rerun on accepted data, never the pending-replayed header graph. Receipt presence/status is never null fallback. The port does not apply/store the returned receipt itself: existing Native Worker projection validation and `repository.applyReceipt` remain the receipt path. Root does not settle the Queue.

## Required Native lifecycle adapter (not implemented by Root)

Only exact MANUAL CORRECT/INSTRUCTION for the already-bound target may use this adapter. Unrelated ITEM/Source commands keep their existing path and switches. Same actual Core owning instance must supply claim and consume throughout the operation.

1. Existing async `claimOperation(operation)` calls the Core atomic claim. NOT_CLAIMED returns false. CLAIMED attaches its actual CoreCorrectionClaim on that same operation object (narrow typed carrier) and its actual claimOwner; routing tags/booleans do not grant submit rights.
2. Worker keeps its original receipt-first, capability/family/current-Actor guards. Only the final bounded CORRECT path calls the Core consume port with the actual identity and existing guarded transport. The guarded callback retains all guards and calls the original backend once; it must not recursively consume. Never call ordinary submit separately after the Core port returned a response.
3. RECEIPT_ONLY/null **must throw the existing dependency/recovery category** (e.g. SyncDependencyError CORE_INSTRUCTION_RECEIPT_RECOVERY_PENDING), not resolve worker success. STATUS_ONLY/redacted remains presence and existing nonterminal authorization handling. No fallback ordinary submit.
4. `settleOperation` needs the missing owning Queue-repository CAS: same current Account/Trip/original operation/claim owner, immutable journal/payload/digest/base. A successful terminal dispatch settlement requires the durable validated original receipt and its existing APPLIED/NO_CHANGE/CONFLICT/REJECTED mapping, not merely error-free push. Stale/wrong-owner settle cannot complete or quarantine a newer claim. Error/recovery settlement preserves Core IN_FLIGHT, original identity, last-attempt and receipt evidence; it does not create fresh eligibility.
5. Exact-CORRECT `recoverInterrupted`/lease handling also needs a bounded lifecycle adaptation. Generic recovery compares generic processClaimOwner; it would misclassify an opaque per-claim owner and can steal a live Core claim on another wake. Do not wrap that code unchanged or change all ordinary commands globally. Recovery must use actual-claim CAS and must not promote an old/expired/unknown claim to a candidate based on count0/time/prefix. Lease is negative only. Current Core incarnation and full DB/provenance checks remain mandatory for NEW consume.
6. Generation change keeps the Engine's skip-settlement behavior. Cold/interrupted/IN_FLIGHT claims retain original-operation receipt-only recovery, even if candidate eligibility is absent. Original receipt retrieval is not suppressed by lease/incarnation/provenance loss; actual Auth/context denial still fails closed.

No settle or generic Queue implementation was added here. The required Native adapter is a concrete remaining dependency, so default Instruction switches/CORRECT guarded close must remain closed until the actual adapter and its independent review/tests complete.

## Local evidence boundary

New `claim-bound CORRECT` tests use actual node:sqlite, existing migrations and owning transactions, canonical command-engine receipts in isolated test storage, and deterministic existing-transport callbacks. They prove local atomic/once-handoff behavior, not Hosted receipts or real network exactly-once delivery. Cold test closes/reopens the SQLite file and preserves numeric generation/certificate/lease/DTO without calling recovery; a new Core factory cannot consume it. No Provider, device, SQL install, role, authority, schema or main write was performed.
