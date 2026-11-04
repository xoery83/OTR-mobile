# P3 existing Edit: manual Instruction transaction candidate

Request: `NATIVE-P3-INSTRUCTION-MANUAL-TXN-20261105-01` / FORM-C01.
Base: `af2f80968b9adcf95814994b8be8ee8e6e23b6a5`. Native real RED: `e3b25c33`; Header Save addendum: `42635380aee0e4c1958834001a7ac439748f7aba`.

## Owning API

Reuse `createTripCoreV2Repository().commitManualBatch(ctx, prepare)`; no second Repository, Queue, Mutation or schema. `prepare()` and `result()` still run in the original same-account SQLite transaction with generation/scope fences. `result()` must validate/read the actual parent projection; throwing rolls back all intents and Queue writes.

Only the Instruction-containing branch changes: one existing, self-owned, visible, live P3 parent; up to five existing ITEM edits (`SET_ITEM_TEXT`, `SET_ITEM_SCHEDULE`, `SET_ITEM_PLACE`, `SET_ITEM_PARTICIPATION`, `SET_STAY_DETAILS`) plus at most one ARRIVAL and one DEPARTURE command. Instruction-only is valid. ITEM-only batches retain the old five-command limit and existing family rules. CREATE+APPEND and cross-parent batches are rejected.

`APPEND_INSTRUCTION`: only a section with no current head (existing heads must use a qualified CORRECT), true INSTRUCTION target/new identity, null INSTRUCTION base, actual ITEM parent base, MANUAL/null Source, ARRIVAL or DEPARTURE. `CORRECT_INSTRUCTION`: old INSTRUCTION target/base, distinct new INSTRUCTION identity/null base, actual ITEM parent base; original immutable entry remains. No rebase or fabricated ITEM target. Bases are validated sequentially with the existing `applyCoreCommand`; the second command consumes the staged parent revision after the first. Caller must construct through owning Repo/factory/preview, not UI arithmetic or rewritten stale input.

## Native caller integration contract (not implemented here)

Native retains its existing `save(draft, fields, optionalPlaceDraft)` → `{localStatus: 'PENDING', itemId: parent, operationIds}` and `onSaved(parent)` shape. Extend the existing P3 Edit DraftState/firstAttempt only: allocate and freeze any selected Instruction operation IDs, entry/newEntry IDs, section/body, scope and base vectors with the existing five ITEM command pins. Fingerprint Instruction selections too. One Header Save calls one `commitManualBatch`; no second save/transaction. Re-entry after error/UNKNOWN reuses exactly the frozen commands/IDs and queries original receipts; changed intent is rejected. Keep/blank means no command, never Clear. Source-backed/multiple/unknown provenance stays readonly.

The result's `operationIds` are all frozen original commands, not only newly enqueued ones. All-duplicate recovery does not enqueue or announce new Queue work. Context parent identity is not a substitute for `command.target`; Queue `entity_id` remains the real INSTRUCTION ID. No claim of SYNCED/SERVER_ACCEPTED from local success.

`manualInstructionEligibility(ctx, parentItemId, entryId)` returns only `{status: 'ELIGIBLE' | 'UNPROVEN'}` for local UI hints. It is not remote authority and save rechecks inside its transaction. A null Source reference is not evidence of unsourced provenance: the Core collection redacts unreadable Source references to null. Eligibility requires same-account/Trip current graph + MANUAL field state + exact original local command chain. Accepted entries additionally require the matching FULL APPLIED receipt and reconciled revision, with matching immutable entry identity/facts; pending/UNKNOWN cannot prove an accepted entry. Remote manually authored records without local proof remain readonly. No new Source read grant; UNPROVEN does not disclose whether a Source exists.

## Native Sync prerequisite / do not mount prematurely

`src/data/sync/tripNormalSync.ts` `isManualAcceptedEditCommand`, `cloudCommand`, and ordinary new-Trip selector currently accept ITEM targets only. The candidate deliberately leaves Instruction Queue rows `DEPENDENCY_BLOCKED`/original operation identity and parent local projection PENDING. Native must add the exact typed Instruction consumer, dependent parent context/ordering and existing receipt-first recovery before offering cloud-save completion.

`src/data/sync/tripCoreV2SyncWorker.ts` currently resolves non-CREATE family by looking up `command.target.id` in ITEM rows. For INSTRUCTION this yields undefined; its `if (family && ...)` check would skip the family gate. Before dispatch, resolve APPEND via payload.itemId and CORRECT via old entry.event_id, enforce actual same P3 parent and fail closed when absent; keep the true target/envelope and receipt-first behavior. Simply removing the ITEM selector guard is insufficient. These Native-owned Sync files are unchanged in this candidate.

## Boundaries

LOCAL transaction candidate only; independent review pending. No Native Form mount, cloud dispatch, Hosted/SQL install, new authority, Provider, UI/device, Session or actual UNKNOWN action. No Schema/Migration/Backend changes. Parent Root1 owns main integration after separate review; Native owns its caller/Sync integration.
