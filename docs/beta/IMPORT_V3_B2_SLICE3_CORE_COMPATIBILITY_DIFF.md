# B2 Slice 3 — precise Core compatibility approval request

13 November 2026 · baseline `e87cb6f` · **OWNER APPROVED — finite compatibility only**.
This is the bounded incompatibility checkpoint required by the Slice 3 authorization,
not a new operational Gate. Owner approved the exact finite compatibility request in this chat; implementation follows this boundary.

## Confirmed gap

| Fact | Evidence / location | Verification |
| --- | --- | --- |
| V3 planner emits MANUAL, including metadata and association commands | `src/data/operations/universalV3Review.ts` / `planUniversalV3Review`, `openUniversalV3Review().confirm` | CODE_CONFIRMED |
| MANUAL writes mark field origin MANUAL and protected=true | `src/domain/trip/tripCoreV2Mutation.ts` / `executeCoreMutation`, `mark`, `detail` | CODE_CONFIRMED + isolated current-code test |
| AUTO_SOURCE requires sourceIntentId and policyVersion; source-free admission is rejected | `src/domain/trip/tripCoreV2Commands.ts` / `validateCoreCommand` | CODE_CONFIRMED + isolated test |
| Ordinary Core PG capability rejects non-MANUAL; existing source authorization is a separate owning path | `backend/src/tripCoreV2PgStorage.ts` / `verifyAdmission` | CODE_CONFIRMED + mock-PG boundary test |
| Metadata schema currently accepts only MANUAL; document SQL guards also test MANUAL | `tripCoreV2Commands.ts:validateCoreCommand`; `backend/sql/core_v3_local_document_capabilities_candidate.sql` / `trip_core_guard_write`, `trip_core_finite_read_state_guard` | CODE_CONFIRMED; not a new live DEV catalog qualification |
| Current Native association enqueue accepts MANUAL only | `src/data/repositories/tripCoreV2Repository.ts` / `enqueueConfirmedItemDocuments` | CODE_CONFIRMED |

Therefore merely calling `confirm()` automatically would mislabel unreviewed AI content
as manual facts; changing it to AUTO_SOURCE is actually rejected. A fake Source ID,
`sourceAuthorized=true` shortcut or hidden Confirm is not a lawful implementation.

Four added tests reproduce these exact properties; no real database or Provider was used.
Run:

```sh
npx vitest run src/data/operations/universalV3Review.test.ts backend/src/tripCoreV2PgStorage.test.ts -t 'Slice 3 contract'
```

## Proposed minimum additive contract — approval scope

Use the existing Core command endpoint, repositories, queue, operation identity,
version validation and Receipt. Add **one finite admission value `IMPORT`**, not an
Admission Engine. Keep existing MANUAL / REVIEWED_SOURCE / AUTO_SOURCE unchanged.

```json
{"mode":"IMPORT","sourceIntentId":null,"policyVersion":null}
```

`IMPORT` means normal authenticated user-submitted Import intent, **not** proof that
AI facts were manually authored. No Source Proof, Source Registry, Provider-result
attestation, administrator grant, Batch whitelist or permanent original upload.
Use existing analysis/candidate-derived Operation IDs and Document identities;
do not invent a Source Intent or a second authorization token.

| Allowed operation | Exact additional restriction |
| --- | --- |
| CREATE_ITEM | Existing supported P1/P3/P4/P5/P6 payload validation; NEW target only; normal Actor/Trip ACL |
| CREATE_SPARSE_FLIGHT | Existing P2 facts/validation; NEW target only |
| SET_AUTHORED_FLIGHT_DETAILS | Only the fresh P2 created by the same Import plan, original operation lineage and expected revision; never an existing/manual Flight edit |
| CREATE_DOCUMENT_METADATA | Existing LOCAL_ONLY / PRIVATE metadata only, same Account/Trip |
| RECONCILE_ITEM_DOCUMENTS | Add-only existing valid Document edges; same existing target ownership/ACL and revision rules; no business-field changes |

Everything else is rejected in IMPORT mode. No automatic UPDATE, field clear, delete,
member write, shared-edit expansion or Flight contract expansion. Actual manual edits
continue through unchanged MANUAL commands. New AI facts use existing `PROVIDER`
field origin, not MANUAL; they do not disable protection on any pre-existing manual field.
No new field-level evidence or proof is required.

Both production automatic submission and development's once-per-Batch confirmation
use this same permitted command plan. The development confirmation authorizes applying
that Batch; it does not turn every AI value into a manually authored value. Durable
intent/decision and original operations must survive cold launch; a rerun reconciles
original IDs rather than treating UNKNOWN as permission to resend. Only a new durable
Submit/Batch-confirm intent enables automatic application: opening historical Activity
is not submission. Never relabel existing MANUAL operations as IMPORT or auto-apply
old B1/QA179 candidates after upgrade.

## Owning code changes covered by this one approval

1. `tripCoreV2Commands.ts`: finite mode/binding validation and existing normal operation selection.
2. `tripCoreV2Mutation.ts`: IMPORT-only provenance for NEW; no manual field overwrite.
3. `tripCoreV2PgStorage.ts`, `tripNormalP1Policy.ts`, relevant existing capabilities:
   finite same-ACL Import admission; no Source authority bypass for legacy commands.
4. Existing Core SQL capability/write/read-state guards: additive IMPORT predicate
   for the listed operations/rows only. Prepare forward + inverse, isolated cases and
   actual DEV definition/readback before deployment. **No Role/Grant/RLS change.**
5. Existing Native enqueue/replay/Sync selectors: accept exactly that same command set;
   retain operation CAS, versions, UNKNOWN and original receipt reconciliation.
6. Existing V3 planning/Review/Activity and normal navigation: implement the already
   approved Slice 3 UX, common plan, reliable identity match and one development confirmation.

No new table, Queue, Task engine, Gateway, permission framework or billing dependency.
Historical Source/Receipt/UNKNOWN and original B1/QA179 remain unchanged. Production
infrastructure/data changes are excluded. After any IMPORT write, rollback must retain
read compatibility for its pending commands/receipts; do not downgrade to a parser
that cannot read the new mode. Before first write, ordinary rollback remains available.

## Approved decision

Owner approved the above **limited Core IMPORT compatibility implementation and its necessary
bounded DEV forward/inverse**, preserving normal Auth/Trip/Item/Document ACL and all
existing manual-edit protections. This is not permission for general Core refactoring,
additional business commands or unreviewed production changes.

Until approved: no automatic MANUAL substitution, no SQL or Core behavior changes,
no automatic NEW/LINK runtime claim. Slice 1/2 remains the accepted working baseline.
After approval: finish Slice 3 with synthetic Provider responses and independent test data;
no DeepSeek, original B1 replay or QA179 operation. Slice 4 Results remains separate.
