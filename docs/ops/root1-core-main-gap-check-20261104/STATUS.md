# Root1 bounded Core/main gap check — 4 November 2026

Baseline: main `5936318992c4d903db1985656f1ba4d8db134ae8`.
Scope: five requested interfaces, current fixed candidates, MC GET_NEXT_WORK and owning contracts. No repository-wide audit, test rerun, Hosted/PG/device/Provider action or authority change.

**NO_QUALIFIED_SOURCE_WORK / AVAILABLE_FOR_HANDOFF**

| Interface | Actual existing boundary | Missing minimum / disposition |
|---|---|---|
| P3 Contact | Core Booking `itinerary_reservations.contact` exists; it is not an Item Contact. `SET_STAY_DETAILS` supports Stay details/rooms, not a generic Item Contact. | No current reviewed Item Contact contract/candidate submitted. Native must identify Item vs Booking vs Place contact, exact fields/ACL/clear/CAS semantics and one consumer fixture. Root1 then assesses the canonical delta; do not substitute Booking contact. NEEDS_DOMAIN_CONTRACT, not install-ready. |
| P3 Instructions | `APPEND_INSTRUCTION` / `CORRECT_INSTRUCTION`, `trip_instruction_entries`, sections ARRIVAL/DURING/DEPARTURE, per-entry ACL, supersession and source representation already exist. Mutation requires Item base and current authority; Reader independently redacts inaccessible evidence. | Do not build a second instructions store. Native supplies a fixed command/target/baseVector, manual vs evidenced Source mode, requested capability/profile, reader expectation and first actual refusal (if any). No reviewed request qualifies broader runtime permission. NEEDS_CONSUMPTION_PACKET / EXECUTION_QUALIFICATION, not proof of missing Core schema. |
| Member Revoke | Owner decision uses current valid linked `journey_members.role=owner`, not historical `trips.created_by`. Local default-closed authority `66497abc` and v2 envelope candidate `67e374fb` exist off main. | Candidate explicitly leaves production command/receipt integration, atomic PG revoke+receipt producer, accessRevision/cache invalidation and join/revoke concurrency unimplemented. Not READY; do not mount or install. Auth returns one target Person/Account transition + expected revision/epoch, read/cache denial/recovery fixture and approved Owner ACL references. Root1 owns the remaining canonical implementation/review; Root2 installation requires exact protected approval later. No ownership-transfer expansion. |
| Expense ↔ TripItem | `expense_links` and `LINK_EXPENSE`/`UNLINK_EXPENSE` schemas exist. `tripCoreV2Mutation.ts` intentionally rejects both with `OWNING_CAPABILITY_REQUIRED`. Collection disclosure independently requires authorized Expense IDs. Ledger API documents its existing links route. | Real owning execution gap remains; schema presence is not write authority. Need Ledger-domain contract identifying which existing issuer owns link/unlink, same-Trip Expense+Item permission proofs, link identity/base revisions, atomic receipt/replay, target deletion/unlink and private projection. No reviewed fixed producer candidate in current queue. NEEDS_DOMAIN_CONTRACT; Root1 must not implement a parallel Ledger writer. |
| Profile Cloud / Person | Normal self-profile bootstrap exists (`/v1/account/profile/bootstrap`), inserts only absent own profile and never overwrites it. Account Profile, Trip Person and Account↔Person Claim are distinct authorities. Existing Person-create/Claim evidence does not authorize private Profile edits. | No current fixed reviewed richer Profile update/read/Person-field packet in Root1 queue. Auth/Native must specify private Account fields vs Trip nickname/Person fields, exact reader/patch/clear/ACL/revision/offline semantics and the missing owning endpoint; reusable bootstrap is not that patch port. NEEDS_DOMAIN_CONTRACT; no blanket Profile or identity permission inferred. |
| Form AI DTO | Main already includes P3 Native composition and `universalP3FormInterpretation.ts`; Actor==context Account guard integrated at `5648818e`. Version1 binds Form/Account/Trip/generation/draft+Item revision, Task/request, Source and evidence. Synthetic `formScanResponse` is advisory-only, not formal evidence or Save authority. | No demonstrated new Core port gap for current P3 minimum. Lane C/Native own suggestions→Keep/Replace→original Manual Save; actual current Source/Provider/Actor/price qualification and E2E remain separate. P2/P4/P5 need their own fixed typed-consumer delta if ready; never transplant synthetic suggestions as formal proof. REUSE_EXISTING / LANE_EXECUTION_PENDING, no new Core work claimed. |

## Evidence (fixed baseline paths unless a candidate SHA is stated)

- `src/domain/trip/tripCoreV2Commands.ts`: SET_STAY_DETAILS, APPEND_INSTRUCTION, CORRECT_INSTRUCTION, LINK_EXPENSE/UNLINK_EXPENSE.
- `src/domain/trip/tripCoreV2.ts`: Booking contact, instruction and expense-link schemas.
- `src/domain/trip/tripCoreV2Mutation.ts`: instruction cases and explicit Expense owning-capability rejection.
- `backend/src/tripCoreV2Collection.ts`: evidence/Expense disclosure fences.
- `docs/trip/OTR_P3_PRODUCT_DESIGN_DELTA_2026-10-13.md`: original instruction access; no new AI Access Facts requirement.
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`: Evidence and Receipt Commands, links route.
- `docs/adr/2026-10-29-account-self-profile-bootstrap.md`, `src/data/api/accountProfileContracts.ts`, `src/data/auth/accountProfileRepository.ts`.
- `docs/people/design-v1-20261024/INTAKE_AND_GAPS.md`: identity/Person/private Profile distinctions; historical gap list is not current execution permission.
- `src/data/operations/universalP3FormInterpretation.ts`; `docs/ops/imp-c03-form-dto-20261103/HANDOFF.md` (historical pending wording superseded by `5648818e`).
- `66497abc:docs/ops/core-owner-revoke-20261103/VALIDATION.json`; `67e374fb:docs/ops/core-owner-revoke-20261103/V2_ENCODING_CANDIDATE.json`: explicit unqualified remainder, not production acceptance.
- MC `scripts/work-control.mjs` GET_NEXT_WORK Root1: all returned queue entries source_is_live=false; no new reviewed READY source request. Root1 management queue has no eligible atomic Claim offered. No claim fabricated.

## Minimal return packet / resume cursor

Each producing Lane supplies: Request ID + Package; one missing owning capability; current main; fixed candidate SHA and exact paths (or explicitly CONTRACT_ONLY); approved contract references; one concrete failing/desired payload; Actor/Trip/target/ACL and revision/proof semantics; focused checks and independent Review; exact Source-vs-Hosted boundary; acceptance/release condition. No secrets or Sessions.

Next Root1 action: read MC GET_NEXT_WORK; validate a new live reviewed request against latest main; use offered atomic Claim/revision mechanism before integrating. If no offered Root1 claim exists, request MC to qualify/register the exact source request rather than editing ledger JSON or claiming a business Lane's LOCAL_PREP. Preserve existing completed integration receipts. Wait condition is NEW_QUALIFIED_CORE_MAIN_PACKET, not deployment/acceptance/ACK.

Core Member Read `5bb59e6a`, Native P1 `59363189`, PNG Backend `2537b4fc` remain delivered. No repeated merge/tests. Root1 main/Hosted locks: none held by this investigation. Hosted current state deliberately not re-probed.
