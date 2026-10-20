# Checkpoint 13A — Canonical Flight Import Admission Foundation

Date: 2026-10-05 (Pacific/Auckland).
Status: **STOPPED BEFORE IMPLEMENTATION — MIGRATION / ADMISSION PREFLIGHT REVIEW REQUIRED**.
No new canonical capability is admitted. CP12 remains accepted and unchanged.

Owner approved **exact-schema/command preflight only**, not implementation or migrations.
The resulting design is [Checkpoint 13A.1 exact schema/command preflight](TRIP_CHECKPOINT_13A1_EXACT_SCHEMA_COMMAND_PREFLIGHT.md); it remains proposed for owner review.

## Startup gate and execution boundary

Fresh managed worktree:
`/Users/xoery/.codex/worktrees/cp13a-flight-admission/otr-mobile-canonical`.
Branch: `codex/cp13a-flight-admission`.
Starting and retained HEAD: `1b2bf98c24f0fb000e438e5cbfbccbc537346577`.
Starting Git status was clean; nothing was staged. The base matches exactly.
CP12's historical REVIEW PENDING/no-commit document labels are preserved; the
owner's explicit final acceptance and this commit are authoritative session evidence.

Registered SQLite chain remains 1–48: tail 46 collection certificate, 47
`trip_day_read_model`, 48 `local_capture_inbox`. Baseline database and CP11 fresh/
upgrade/cold-reopen tests validate that registered chain. Server migration files
remain 74; no schema replay or database service was started for this preflight.

Existing Source/Event SQL gates are structurally CLOSED: their installed gate
constraints prohibit enabled=true. Backend canonical capabilities advertise DISABLED,
empty enabled commands/shapes/scopes, no resolver and no TRACK_C evidence support.
No live/Hosted state discovery or runtime credential provisioning was performed.

The task's section 14 requires STOP **before authoring a necessary migration**.
The installed schema cannot durably represent the reviewed C proposal/confirmation
path. The task's section 0 also forbids weakening canonical safety gates. Work
therefore stops at verified baseline evidence and this report, before code, migration,
accepted-contract or capability changes. This is an expected foundation gap, not
an identified defect in the accepted CP12 design.

## Concrete blocking evidence

| Boundary                | Installed evidence                                                                                                                                                                                                                                                                                     | Why a TypeScript-only admission seam is insufficient                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source acquisition      | [C-I3B migration](../../supabase/migrations/20261004000300_trip_source_protected_foundation.sql) installs Source, material revision, Representation and Action; [C-I3D migration](../../supabase/migrations/20261004000500_trip_source_command_foundation.sql) adds operation/gate/recovery machinery. | These encode acquisition/material operations, not reviewed Flight Run/Candidate/Confirmation/slot authority. Reusing their payloads as a hidden confirmation store would change their meaning.                                                                                                          |
| C-I3A durable review    | No CREATE TABLE exists anywhere in the 74 registered server migrations for `trip_source_runs`, `trip_source_inputs`, `trip_source_candidates`, `trip_source_confirmations`, `trip_source_output_slots` or `trip_source_associations`. None is installed by SQLite 1–48.                                | Immutable publication/pins, current and lineage CREATE claims, write-once result correlation, private support admission and restart recovery need durable authorized records. An in-memory test object cannot supply those proofs to the domain transaction.                                            |
| TRACK_C proof           | [B command foundation](../../supabase/migrations/20261004000400_trip_event_command_foundation.sql), `trip_event_bind_proof` and `trip_event_prepare`, explicitly reject TRACK_C with INVALID_PROVENANCE.                                                                                               | Extracted/reviewed evidence cannot be relabelled MANUAL or RETAINED to bypass locked private proof admission. Implementing the fixed C-to-B proof interface requires reviewed SQL/permission changes.                                                                                                   |
| Flight CREATE/UPDATE    | The same `trip_event_prepare` accepts only POINT/CALENDAR/ALL_DAY; CREATE hard-codes `event_type=activity`. UPDATE rejects other shapes. [Backend intent codec](../../backend/src/tripEventIntent.ts) exposes six first-slice families without UPDATE_TRANSPORT.                                       | Existing Event/endpoints can store TRANSPORT read facts, but the typed command transaction does not admit them. A legacy generic create, direct SQL write or payload-only codec change would bypass the required domain receipt/proofs/CAS.                                                             |
| Runtime gate            | Event gate `trip_event_gate_closed` and Source gate `trip_source_gate_closed` both enforce not enabled. [Backend capabilities](../../backend/src/tripCanonicalRead.ts) remain DISABLED.                                                                                                                | A local fixture must not masquerade as production admission or weaken these closed gates. A protected local-only proof slice and any later activation need separately reviewed boundaries.                                                                                                              |
| Flight service identity | Existing B accepted read DTO owns Event type, endpoint time/place and opaque provenance; it has no explicit carrier/flight-service field family.                                                                                                                                                       | Approval must specify which occurrence fields the slice admits and how service identity is represented. Do not stuff it into title/description, booking_reference or a provider Place namespace and claim structured canonical ownership. This remains a bounded representation question for preflight. |
| Capture handoff         | [CP11 Capture ADR](../adr/2026-10-05-local-capture-inbox.md) and repository provide verified read-only handoff.                                                                                                                                                                                        | Handoff is not Source admission/remote durability, does not register replay binding or dispatch an acquisition command. No automatic Source creation is added.                                                                                                                                          |

Existing B receipt lookup, C acquisition UNKNOWN/execution journal, Account fencing,
certified collection and Day foundations remain useful and unchanged. Their presence
does not supply the missing C review records or TRANSPORT/Track C transaction capability.

## Smallest proposed change set for owner review

This is a **scope proposal**, not authored SQL, an assigned migration number or
permission to implement/deploy it. Preserve the existing canonical Source and Event
roots, receipt namespaces and Account-owned queue; do not introduce a parallel
identity/store/worker architecture.

1. **Protected C persistence:** materialize only the needed existing C-I3A contracts:
   Runs, typed Inputs, immutable TRANSPORT Candidates, Confirmations, output slots and
   Source associations. Use existing Source/Representation IDs, private owner/Trip
   admission, parent CAS, bounded fields/inputs/Candidates, immutable reviewed support,
   create-claim tuple and write-once receipt/result correlation. No passenger/booking/
   reservation/credential tables. Unused adapters and target kinds remain disabled.
2. **Bounded lineage representation:** define the exact immutable predecessor/
   consolidation references and reviewed output-purpose disposition within the
   approved proposal/confirmation envelope. Preserve C-I3A's existing per-Candidate
   claim uniqueness. Preparation/dispatch must serialize relevant claim inspection,
   block UNKNOWN, reuse successful exact targets and require reviewed split/merge
   disposition. No global canonical dedup identity. Exact columns/constraints and
   versioned payload mapping require the owner-reviewed preflight before migration.
3. **Fixed C-to-B proof admission:** provide locked exact Confirmation/slot/input/
   candidate/value/Actor/Trip/operation/base checks using existing accepted evidence
   addresses. Keep public/service-role access closed. Permit result/support
   finalization only from exact verified B receipt; EVIDENCE_PENDING never re-CREATEs.
4. **Typed occurrence-only TRANSPORT commands:** extend the protected B SQL command
   path and its exact codec/receipt whitelist for Flight CREATE and supported
   occurrence UPDATE; two endpoint roles, UNASSIGNED, one parent CAS/receipt, unknown
   arrival preserved. Resolve the minimum carrier/service representation first.
   No generic patch, passenger mutation, same-base races or silent successor rebase.
5. **Temporal admission:** initially use independently evidenced/explicitly confirmed
   EXACT source instants where the existing semantics support them; do not relabel
   offset-only civil arithmetic. If complete civil resolution is required by the
   owner-selected slice, separately admit the smallest deterministic B resolver proof.
   No fabricated midnight/IANA/instant and no arrival completeness requirement.
6. **Device durability:** reuse existing `sync_operations` for claims/dependencies/
   immutable replay identity. Review a minimal SQLite mirror/confirmation-support
   persistence slice only for records required by offline preparation and cold restart;
   existing queue JSON alone cannot become server proof authority. Do not duplicate
   accepted read mirrors, Account generations, timers or execution journals. No
   SQLite49 is assigned/authored here. Whether a bounded subset can defer full local
   mirrors is an exact-schema preflight decision, not permission for in-memory recovery.

Existing C-I3C acquisition keys/digests/receipts and C-I3H responsibilities are reused,
not changed into review slot state. Capture→Source needs a durable exact Capture/
revision/material-to-acquisition-operation binding and explicit new/reuse/replacement
intent; review its minimal queue/mirror encoding together with the device slice.
Source acquisition/verification/provisioning and IO_UNKNOWN terminality remain
independent gates. No remote provider, parser, uploader activation or workaround
for structurally closed gates is proposed.

A safe next approval is a **bounded exact-schema/command admission preflight** for
this change set, followed by owner review of the concrete migrations/permission and
local test activation plan before implementation. This report does not claim a fixed
DDL design has already been approved. It does not request a CP12 redesign.

## Authority reviewed and preserved

Normative CP12 architecture, Import contract, registry (Flight temporal vectors and
`import-flight-match-v1`), intelligence contract, independent Red Team review,
contract report and ADR were used as the accepted requirements. I1 lineage, I2 mixed
assessment/command semantics, I3 anchors, expected arrival, configurable attention
and resumable Batch semantics are unchanged.

Relevant existing authorities: C-I1 Source/provenance; C-I3A Run/Input/Candidate/
Confirmation/slot/support/private proof and offline catalogs; C-I3C lifecycle/replay;
C-I3B/D installed foundations; accepted C-I3H journal; B-T1/B-T3A semantics and
B-T3C typed command/receipt/CAS/offline/Track C handoff; B-T3D installed command
foundation; B-T3G contract and current B-T3I mirror/certificate; Account request
context/generation/apply gate; CP11 Capture/Day ADRs and integrated implementation.
Repository mandatory product/architecture/data/API/offline/environment and saved
legacy-audit context were already loaded in this chat; the legacy checkout was not
reopened. No UI/copy change requires a new UI foundation implementation pass.

No new ADR is created because no new canonical boundary is admitted. API, DATA_MODEL,
CURRENT_IMPLEMENTATION_STATE and accepted CP12/Red Team documents remain unchanged;
there is no implemented capability to advertise. The blocked checkpoint is recorded
in this report only.

## Results by requested seam

| Requested seam                              | CP13A result                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Capture→Source explicit admission           | NOT IMPLEMENTED; existing handoff and acquisition machinery remain unchanged.                                              |
| Flight occurrence proposal/evidence adapter | NOT IMPLEMENTED; durable C publication/preparation absent.                                                                 |
| Flight match-v1                             | NOT IMPLEMENTED; normative CP12 matrix preserved, no score/PNR/hash identity shortcut.                                     |
| Flight CREATE/UPDATE                        | NOT ADMITTED; installed SQL rejects TRANSPORT/Track C and gates remain CLOSED.                                             |
| I1 lineage CREATE fence                     | NOT IMPLEMENTED; no missing predecessor record is treated as no-commit proof.                                              |
| I2 mixed action                             | NOT IMPLEMENTED; no generic patch or silent rebase added.                                                                  |
| UNKNOWN recovery                            | Existing semantics PRESERVED; no new Flight recovery claim. Backend journal/read baseline tests pass.                      |
| Account isolation / A→B→A                   | Existing foundation PRESERVED; selected Account/Capture/Event/Day tests pass; no new admission path exists.                |
| Certified collection / Day                  | Existing behavior PRESERVED in baseline tests; no admitted Flight-to-certificate end-to-end success is claimed.            |
| Offline/cold restart                        | Existing CP11 fresh/upgrade/offline cold-reopen foundation passes; future admission intent recovery remains unimplemented. |
| Ledger                                      | No code/data/cursor/financial mutation; no new end-to-end Ledger non-interference test is claimed.                         |

## Baseline tests and checks

Run before this report or any implementation: **14 suites / 465 tests PASS**.

- Backend: `tripEventIntent`, `tripCanonicalRead`, `tripEventCollection`,
  `tripSourceExecutionRecovery`.
- Account: `accountRequestContext`, `accountSwitchFoundation`.
- Database: `database`, `checkpoint11Integration`.
- Repositories: `localCaptureInboxRepository`, `tripCanonicalEventRepository`,
  `tripEventCollection`, `tripDayReadRepository`.
- Domain: `dayReadModel`, `localCapture`.

These are existing baseline tests, not newly added CP13A cases A–T or successful
Flight admission tests. No new implementation exists to test; those cases remain
required after an approved migration/admission slice.

| Check                                                                 | Result / classification                                                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                   | PASS                                                                                                                                                                          |
| `npm run lint` (includes UI guard)                                    | PASS                                                                                                                                                                          |
| UI guard                                                              | PASS: 473 unchanged legacy occurrences, 76 representative files                                                                                                               |
| `npm run backend:build`                                               | PASS after environmental sandbox correction; initial ignored-dist mkdir permission failure, then rerun with authorized worktree output access. No code change to obtain PASS. |
| `npm run format`                                                      | EXISTING BASELINE BLOCKER: 17 unchanged files, listed below; no formatting fix applied.                                                                                       |
| New report formatting / relative links / whitespace / exact Git scope | Checked locally before delivery.                                                                                                                                              |
| Full runtime suite / SQL pgTAP / migration replay / live acceptance   | NOT RUN after migration STOP; no baseline or implementation success claim.                                                                                                    |
| New regression / implementation defect                                | None observed in selected baseline; no implementation was attempted.                                                                                                          |

Full formatting's 17 baseline paths:

- `docs/architecture/TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md`
- `docs/architecture/TRIP_CANONICAL_B_T0_TEMPORAL_SPATIAL_AUDIT.md`
- `docs/architecture/TRIP_CANONICAL_B_T1_TEMPORAL_SPATIAL_CONTRACT.md`
- `docs/architecture/TRIP_CANONICAL_B_T2_PERSISTENCE_PREFLIGHT.md`
- `docs/architecture/TRIP_CANONICAL_B_T3A_SCHEMA_WRITER_CONTRACT.md`
- `docs/architecture/TRIP_CANONICAL_B_T3D_PROTECTED_COMMAND_FOUNDATION_REPORT.md`
- `docs/architecture/TRIP_CANONICAL_C_I0_IMPORT_ARTIFACT_AUDIT.md`
- `docs/architecture/TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md`
- `docs/architecture/TRIP_CANONICAL_C_I2_PERSISTENCE_ACCESS_PREFLIGHT.md`
- `docs/architecture/TRIP_CANONICAL_C_I3A_SCHEMA_ACCESS_CONTRACT.md`
- `docs/ledger/evidence/expense-consistency-phase6-after.json`
- `docs/ledger/evidence/expense-consistency-phase6-before.json`
- `docs/ledger/SETTLEMENT_2_0_PHASE_0_DECISIONS.md`
- `docs/ledger/SETTLEMENT_2_0_TECHNICAL_AUDIT.md`
- `docs/trip/OTR_TRIP_ENRICHMENT_SOURCE_MATRIX.md`
- `src/domain/ledger/expenseIntent.ts`
- `src/hooks/useStage4BPhysicalSmoke.ts`

A temporary dependency symlink reused the canonical installed modules for tests;
no installation or lockfile edit occurred. It was removed before final Git scope
verification. The normal Backend build generated ignored local dist output only.
No Hosted Dev, Production, provider/model, fetch/deploy, commit or push occurred.

## Exact change scope and explicit answers

Only added file:
`docs/architecture/TRIP_CHECKPOINT_13A_CANONICAL_IMPORT_ADMISSION_REPORT.md`.
All tracked files are unchanged, nothing staged, HEAD remains the requested base.
No SQL/SQLite migration was authored. “Migration required” below means the desired
canonical path requires reviewed persistence/SQL changes, not that one was written.
Preservation answers refer to the unchanged existing foundations, not new Flight
end-to-end runtime acceptance.

| Required answer                               | YES/NO                                             |
| --------------------------------------------- | -------------------------------------------------- |
| CP13A implementation complete                 | NO                                                 |
| Migration required                            | YES                                                |
| Second Source concept introduced              | NO                                                 |
| Capture automatically creates Source          | NO                                                 |
| Capture→Source explicit admission implemented | NO                                                 |
| Flight occurrence proposal mapping admitted   | NO                                                 |
| Flight match-v1 implemented                   | NO                                                 |
| Flight CREATE admitted                        | NO                                                 |
| Flight UPDATE admitted                        | NO                                                 |
| Lineage CREATE fence implemented              | NO                                                 |
| Mixed-action revision semantics implemented   | NO                                                 |
| UNKNOWN recovery preserved                    | YES                                                |
| Account isolation preserved                   | YES                                                |
| A→B→A fenced                                  | YES (existing tested foundation; no new admission) |
| Certificate semantics changed                 | NO                                                 |
| Day model directly written by Import          | NO                                                 |
| Passenger persistence added                   | NO                                                 |
| Booking persistence added                     | NO                                                 |
| Participant-aware certificate added           | NO                                                 |
| Ledger mutation added                         | NO                                                 |
| LLM/provider runtime added                    | NO                                                 |
| UI added                                      | NO                                                 |
| Server schema changed                         | NO                                                 |
| Production accessed                           | NO                                                 |
| Commit                                        | NO                                                 |
| Push                                          | NO                                                 |

**STOP BEFORE IMPLEMENTING A MIGRATION — OWNER REVIEW REQUIRED.**
