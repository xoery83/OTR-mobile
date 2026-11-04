# Instruction parent scope for NEW manual submission

Candidate baseline: main `c98821fe16931bfe2fd79869178f0f8e8ac87445`.
Origin: Native `b562169409eba47e969eb0907b30a5fe9a0937ee`, exact `INSTRUCTION_PARENT_RESOLVER_GAP.json` / two-command family-gate RED. That Native consumer remains unchanged and not enabled by this candidate.

## Core API

`resolveCoreInstructionParentForSubmit(graph: CoreGraph, actor: CoreActor, input: unknown, now: string): CoreInstructionParentScope`

Export: `src/domain/trip/tripCoreInstructionParent.ts`.
Result: readonly `{ parentItemId, family, section }`, using existing Core Item/Instruction types. No eligibility, provenance, admission, receipt, or dispatch capability is returned. Only MANUAL APPEND_INSTRUCTION/CORRECT_INSTRUCTION is supported in this bounded Native slice.

Identity resolution is distinct from current mutable checks. APPEND resolves the actual unique parent from the validated payload.itemId. CORRECT resolves the actual unique target entry → event_id and requires its entire visible immutable ancestor chain: same Trip/parent/section, no cycle, missing ancestor, duplicate or fork. The caller cannot supply a parent/family hint.

Then a discarded canonical `applyCoreCommand` preview checks current Actor/Trip management, full old/new/null base vector, actual parent/entry revisions, current correction head, canonical payload and graph constraints. Existing Core policy is reused; no new Mutation executes. `now` comes from the existing execution clock, never a UI assertion or substituted authority timestamp. Graph and command remain unchanged. The helper has no database, Queue, transport, Receipt or other IO.

Expected invalid schema/scope/ACL/CAS/chain cases throw exported `CoreInstructionScopeError` with `code` and `message` both `CORE_INSTRUCTION_SCOPE_UNRESOLVED`. No evidence body, hidden identity, source details or error cause is exposed. Only Zod and the finite known canonical refusal codes are mapped; unexpected programmer errors propagate unchanged for diagnosis and still prevent submit.

## Exact Native consumption boundary

1. Keep existing Queue/command/operation/hash/account bindings and original Operation Receipt lookup **before** any NEW-submit scope gate. A retained original receipt is handled by the existing receipt path; this helper is not called to reauthorize or resubmit an applied original operation.
2. For a genuinely new submit, use the current authorized **pre-command** graph and trusted current Core Actor under the existing Account/Trip/generation/access/certificate fences. Current worker `repository.readGraph(ctx)` reads only the cache-account/Trip `trip_core_*` mirror with scope/access revision; it does not replay pending commands. Coordinator `acceptedEditableItem` uses `acceptedSnapshot` certificate/actor/graph. Bind the Actor to that same owning read scope; if the pair/freshness cannot be established, block. Do not fabricate an Actor or use a Header Save `manualReadSnapshot` / pending-replayed projected graph.
3. If an earlier mutation is not yet reflected in the mirror, current CAS fails closed. Recover the original receipt and perform a legal refresh. Do not try a second graph, alter the command/base, reallocate identity, or use an optimistic post-command graph to force success. Mixed Save remains one local transaction; cloud-dependent commands wait for the real predecessor state.
4. Use the resolved **nonempty actual family** for enabledFamilies. P3 under P1-only capability must be refused. Remove neither the family gate nor its default-close behavior. Existing ITEM/CREATE/P2 rules remain untouched.
5. Native's normal selectors and guarded submit must pass the actual `parentItemId` to their existing parent checks, while keeping the real INSTRUCTION target/Queue entity ID and original operation. The helper can identify another genuine P3; the caller must still enforce its pinned original intent/parent and existing allowed P3 ARRIVAL/DEPARTURE scope. A same-family item is not an identity substitute.
6. Existing `acceptedEditableItem` / `isManualItem` validate parent authority only. CORRECT still needs the separate Core local handwritten-chain/receipt provenance eligibility and transaction recheck from c988. SOURCE/Reader-null/unknown provenance must not become manually editable because this resolver can classify its family. Source-backed entries can be classified without making any unsourced claim.

## Unchanged ownership / readiness

Native owns `tripCoreV2SyncWorker.ts`, `tripNormalSync.ts`, `tripNormalCoordinator.ts` and their integration. None is changed here. No Repository, Schema, Hosted profile, dispatch activation, Source/Provider, device or actual UNKNOWN action. This is a pure Core candidate pending independent review and separate source integration, not worker GREEN, cloud APPLIED, Header Save UI readiness or Native E2E.
