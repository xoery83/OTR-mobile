# Exact queued CORRECT: PRECLAIM accepted-provenance query

Base: `7c103acf9802e3c149cdbadf03aca978fada6568`. Scope: existing P3 ARRIVAL/DEPARTURE, local Core source only. No Native Sync edits or dispatch activation.

## Actual failure

The old `manualInstructionEligibility(ctx, parentItemId, oldEntryId)` is a UI/edit hint. It reads `readLocalManualSnapshotWithinTransaction` → `manualReadSnapshot` → pending replay. After a valid `CORRECT_INSTRUCTION` queues, that graph contains its new successor; the old entry is no longer a current head and the hint correctly becomes UNPROVEN. Native cannot use this post-queue UI hint as the original command's pre-command provenance check.

The actual SQLite RED first created a normal P3 parent, queued a handwritten APPEND through `commitManualBatch`, installed its canonical FULL APPLIED receipt and same-epoch accepted readback, then queued CORRECT through the owning transaction. The UI hint changed ELIGIBLE → UNPROVEN solely due to its own queued correction. Isolated receipt generation uses the existing command engine test storage; it is not Hosted/Cloud evidence.

## New owning API

`createTripCoreV2Repository().manualInstructionCorrectionPreclaimEligibility(ctx, originalCommand)` → `{status: 'ELIGIBLE' | 'UNPROVEN'}`.

This is a read-only **PRECLAIM provenance qualification**, not postclaim submit authority, a replacement UI hint, receipt recovery, or a retry permission. Only the exact MANUAL CORRECT command already retained in the same Account/Trip original journal and Queue is accepted. Caller-supplied body/op/Trip changes, absent/mismatched Queue identity/real INSTRUCTION target/canonical payload/digest fail closed. Schema-invalid input follows the existing `validateCoreCommand` validation rejection.

Within the existing Account gate and one SQLite transaction, the query obtains the current accepted certificate + trusted Actor + graph via `acceptedWithinTransaction`. It never replays the current pending correction. The a795 parent resolver checks its unchanged actual old/new/null bases, current head, family, management and CAS on this pre-command graph. The same existing private provenance routine then requires the accepted old entry and complete immutable chain to have original local MANUAL/null-source commands plus matching FULL APPLIED, reconciled, hashed receipts and exact immutable created facts. Private helper parameters are narrowed to their existing graph/cert/operations fields; the UI/save checks and their behavior are unchanged.

A redacted null Source pointer alone remains insufficient. Known SOURCE field state, missing/currently IN_FLIGHT origin proof, mismatched immutable facts, unknown ancestor, stale accepted parent/entry or unavailable certificate stays UNPROVEN. No Source-presence reason or provenance details are returned.

## Queue boundary / remaining Native blocker

The original command must still be unclaimed: journal state BLOCKED/PENDING, no own receipt/reconciled revision, Queue PENDING/DEPENDENCY_BLOCKED, attempt_count=0, **last_attempt_at=NULL**, and no non-dependency failure. Repeated queries do not write Queue, intent, receipt, retry, claim, identity or wake events.

The current generic Core engine claims before worker.push. Its `claim()` sets PROCESSING/claim_owner/lease/last_attempt_at but does not increment attempt_count or set the Core intent IN_FLIGHT. Thus PROCESSING/count0/noerror cannot prove that a current claim has not already submitted. All PROCESSING rows are UNPROVEN, including the apparently fresh first claim. `recoverInterrupted()` can leave count0 while recording INTERRUPTED; later dependency handling can overwrite an error message. Non-null last_attempt_at still closes that ambiguity even if status/error are reset to PENDING/DEPENDENCY.

Native must identify a legitimate existing preclaim/Runner consumption seam before replacing its postclaim guard. This candidate does **not** solve that phase binding or invent a caller boolean, phase token, new attempt journal, queue or permission platform. Parent/Native will specify the existing trusted phase separately. Instruction Cloud remains CLOSED.

Original Receipt lookup/recovery remains first and cannot be blocked by this query. APPLIED, IN_FLIGHT, UNKNOWN, prior attempts or interrupted operations are not reauthorized by it; recover only their original operation/receipt through existing paths. Never allocate a replacement ID, rebase, use a second/predicted graph, or resubmit an UNKNOWN because accepted provenance is valid. `UNPROVEN` is not permission to reset identity or claim metadata.

## Readiness

LOCAL owning source candidate only; independent review/main integration pending. Existing UI hint, canonical save, original Queue and receipt recovery remain intact. Native worker/selectors/coordinator, Schema, Backend, Hosted, Source/Provider, device and actual historical operations are unchanged. No Cloud/APPLIED/Native E2E or postclaim-dispatch PASS is claimed.
