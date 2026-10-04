# Trip Canonical C-I3C — Source Lifecycle Command Contract

Date: 2026-10-04 (Pacific/Auckland). Status: **C-I3C CONTRACT COMPLETE — REVIEW PENDING**.
Design only. Every route, entrypoint and additional record below is proposed, not
installed. **Source commands remain disabled.**

Startup verified `/Users/xoery/Project/otr-mobile-import`, branch `trip/import`,
clean HEAD `b3fe04b3184cf2ecee70b1e5d69970cc73faa006`. Recent log:
`b3fe04b`, `c3fb253`, `c825bc6`, `f196f98`, `1ce691c`, `dde8466`.
The owner requested execution of the attached C-I3C instruction, whose scope is
this contract only. It does not authorize implementation or activation. Only this
document changes; the one-file instruction excludes current-state/ADR updates.

## A. Executive decision

Select atomic acquisition/capture registration, a fixed existing-descriptor
PREPARE, Backend-proxied create-only binary upload, independent server byte
verification, inline TEXT/LOCATOR, replacement, and explicit LOST/recovery.
Retain every original by default. Purge, redaction and logical deletion are
structurally described but activation-deferred. No new Source can be registered
without its initial revision and ORIGINAL descriptor: C-I3B's deferred aggregate
constraints require all three in one transaction.

Actions alone cannot provide exact command receipts. Their accepted catalog has
no VERIFY/PREPARE/RECOVER action, no resulting Representation revision and no
immutable command reply. Recommend one bounded **Source operation record family**
with an immutable identity, operational I/O phase, and a write-once terminal
receipt. Its operational phase never owns Source/Representation revisions. This
is a Source-specific addition for a later migration, not a universal command bus
or a reinterpretation of existing Actions.

Choose a Backend byte proxy, rather than client upload capabilities. It permits
current owner + canReadTrip + canWriteTrip at each new execution attempt, fixed object derivation, byte limits,
and an exclusive per-Representation write attempt without granting direct bucket
authority. It costs Backend bandwidth; 50 MiB streams require resource limits and
request cancellation handling. The actual provider's create-only and write
quiescence guarantees are implementation/activation gates, not assumed PASS.

### Authority and current implementation evidence

| Inspected authority/seam                                                                                                             | Binding consequence                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [C-I0](TRIP_CANONICAL_C_I0_IMPORT_ARTIFACT_AUDIT.md), acquisition/offline/security/receipt audit                                     | Current Camera/Photos/Files paths create Ledger receipts, not Sources. No current Source runtime is inferred.                                                                        |
| [C-I1](TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md), identity/originals/replacement/private access                             | Source identity follows intentional acquisition, not content hash; old material and canonical facts survive evidence loss.                                                           |
| [C-I2](TRIP_CANONICAL_C_I2_PERSISTENCE_ACCESS_PREFLIGHT.md), byte seam/storage/retention/offline                                     | Separate bucket-bound Source path; no receipt dual-write, mutable upsert reuse or last-copy cleanup.                                                                                 |
| [C-I3A](TRIP_CANONICAL_C_I3A_SCHEMA_ACCESS_CONTRACT.md), B/C/D/E/G/N/O                                                               | Normative exact fields, owner+canReadTrip reads and additional canWriteTrip mutations, CAS owners, exceptional redaction and local state vocabulary.                                 |
| [C-I3B report](TRIP_CANONICAL_C_I3B_PROTECTED_SOURCE_FOUNDATION_REPORT.md) and `20261004000300_trip_source_protected_foundation.sql` | Four protected tables exist; all runtime mutations, including zero-row DML, are disabled. Reserved writer has no command/grants.                                                     |
| [B-T3C](TRIP_CANONICAL_B_T3C_COMMAND_RECEIPT_CONTRACT.md), E/F/G/R                                                                   | Dedicated authenticated gateway plus private fixed entrypoint; actual execution identity, immutable receipt, no JWT/GUC authority or broad service RPC. B activation is independent. |
| [A I2B1](TRIP_CANONICAL_A1_I2B1_SNAPSHOT_CURSOR_CONTRACT.md), [I2B2](TRIP_CANONICAL_A1_I2B2_IMPLEMENTATION_REPORT.md)                | Account/Trip/generation fencing through local commit; participation certificates are not Source authorization. I2B3 acceptance remains deferred.                                     |
| `src/data/operations/importReceiptAsset.ts`, `src/hooks/useReceiptCapture.ts`, `src/data/files/receiptFileStore.ts`                  | Account-owned copy/hash and native acquisition patterns can inform a later Source seam; receipt IDs, normalization, limits and UI remain untouched.                                  |
| `src/data/sync/ledgerReceiptSyncWorker.ts`, `ledgerReceiptTransport.ts`                                                              | Existing durable scheduling separates metadata/upload/complete; no Source operations are added to it here.                                                                           |
| `backend/src/attachmentStorageProvider.ts`, `supabaseGateway.ts:uploadReceiptContent`                                                | Receipt provider uses `ledger-receipts` and `upsert:true`; stat hashes downloaded bytes. Source needs a separate fixed create-only wrapper, not a changed receipt wrapper.           |
| `docs/API_CONTRACT.md`, `docs/OFFLINE_SYNC.md`, current-state handoff                                                                | Authenticated Backend writes, repositories/local writes first, durable queue ownership and offline-tolerant cached sessions remain fixed.                                            |

## B. First activation scope

One acquisition produces one Source, revision 1 and exactly one ORIGINAL. V1
accepts FILE/FILES PDF, IMAGE/CAMERA|PHOTOS|FILES, TEXT/PASTE and URL/URL_CAPTURE
LOCATOR. TEXT/LOCATOR mean explicit submitted content, not native channel UI or
fetched website content. An email/multipart capture, COPY, derivatives, URL fetch,
REFRESH, ADD_PART and SAVED_TEXT_EDIT adapters remain later slices; their C-I3A
schemas are preserved. A batch of unrelated selected files creates independent
operations/Sources; no speculative grouping or all-or-nothing batch transaction.

ACQUIRE_SOURCE already creates the complete descriptor. PREPARE_REPRESENTATION
does not append an unattached original or a new material revision: it validates
one existing ORIGINAL and records its exact transport preparation result.
Replacement atomically appends one revision and one new ORIGINAL descriptor.
V1 replacement is reason REPLACEMENT, completeness AS_SUPPLIED or PARTIAL_CAPTURE;
manifest membership is exactly the new ID. Later multipart manifests may reuse
unchanged same-Source originals under C-I3A, but that behavior is not activated.

Purge/redaction do not become prerequisites for retaining useful evidence.
Logical DELETE_SOURCE is also deferred: its complete association deactivation
and pending-intent freeze require later families. Nevertheless every active
command fences a DELETED Source, including when a later admitted deletion races
an already admitted upload. There is no undelete command.

## C. Exact typed command catalog

### Common envelope and errors

All commands use `contract_version:1` and a distinct `command` literal. Exact
common keys are `{contract_version,command,operation_id,operation_key,
actor_account_id,trip_id,source_id,operation_sha256,payload}`. IDs are independently
allocated canonical UUIDs. K, H, R and T use C-I3A B; numeric wire revisions are
safe positive integers, never floats/strings/zero. Unknown keys, duplicate JSON
keys, unknown enums/versions, unsafe counts/revisions and contradictory nulls
reject before execution. Auth derives Actor; envelope Actor must match.
Metadata envelope is bounded to 2,097,152 UTF-8 bytes before parsing (including
worst-case escaped inline text); binary bodies use their separate streamed limits.
No implicit string coercion, MIME alias expansion or empty-string placeholder.

Except ACQUIRE, payload includes `material_revision`, `expected_source_row_revision`
and `expected_source_state:{lifecycle:ACTIVE,retention_state:RETAINED}`. Operations
on a Representation also include `representation_id`,
`expected_representation_row_revision` and exact
`expected_representation_state:{remote_state,retention_state}`. These are
observations, not caller-written values. The pinned capture must actually contain
the ORIGINAL ID; introduced revision and source scope are independently checked.
Deferred purge/redaction may explicitly name the other prior states listed below.

Future routes are fixed Source-specific POST routes below `/v2/trips/:tripId/sources`:
`/acquire`, `/:sourceId/prepare-representation`, `/verify-representation`,
`/replace-material`, `/mark-representation-lost`, `/recover-representation`,
`/request-purge`, `/finalize-purge`, `/redact-source`, `/redact-representation`;
suffixes after prepare share the `/:sourceId` prefix. Route Trip/Source must match
the envelope. No generic PATCH, arbitrary table name, object key or SQL argument.

Stable outcomes: 401 auth pause, 403 `SOURCE_ACCESS_DENIED`, 404
`SOURCE_NOT_AVAILABLE` (also for inaccessible guessed IDs), 409
`SOURCE_CAS_CONFLICT` / `REPRESENTATION_CAS_CONFLICT` / `PRIOR_STATE_CONFLICT` /
`OPERATION_KEY_REUSED` / `OPERATION_ID_REUSED` / `OBJECT_CONTENT_CONFLICT`, 422
`INVALID_SOURCE_COMMAND` / `MATERIAL_INTEGRITY_MISMATCH` / `UNSUPPORTED_MIME` /
`MATERIAL_TOO_LARGE`, 423 `SOURCE_RETENTION_BLOCKED`, 503
`SOURCE_IO_UNAVAILABLE`. Server/database admission lookup errors deny, never
fall through. Domain conflicts preserve pending intent for explicit resolution;
they do not refresh expected bases or choose LWW.

### Read admission versus new execution

Private Source/material reads and exact read-only historic operation/receipt/status
lookup require authenticated Actor == Source.acquired_by and current `canReadTrip`
for the exact Trip, subject to C-I3A privacy/redaction. They do not require write
admission and do not dispatch I/O, insert preparation/operation records, resume an
attempt or mutate semantic state. Every new command in the catalog, including
PREPARE (which persists a new preparation/operation record), additionally requires
current `canWriteTrip` for that exact Trip. UPLOAD_ORIGINAL, new/resumed I/O and
post-I/O semantic finalization have that same write gate, plus CAS/lifecycle/state
checks. ACQUIRE derives immutable acquired_by from authenticated Actor; with no
existing Source, current exact-Trip canReadTrip + canWriteTrip is required before
registering it. Read-only Trip admission alone never authorizes acquisition.

### Immutable input whitelist

`source_input` has exactly `source_kind,acquisition_channel,captured_at,
capture_time_basis`; compatibility and capture null/basis pairing follow C-I3A.
`original` has exactly `id,material_kind,original_filename,part_key,mime_type,
encoding,payload_sha256,byte_count,text_content,locator_uri`. All nullable keys
are explicit. V1 part_key is null. Nonbinary filename is null. Each format's
presence/size/encoding rules are in H. Server supplies role ORIGINAL, empty
parents, null transforms, NOT_APPLICABLE regenerability, creation times, provider,
bucket and derived key. Caller cannot set lifecycle/access/retention/row revision,
verified_at, derived lineage or server timestamps.

V1 material compatibility is fixed: FILE→BINARY application/pdf,
IMAGE→BINARY image/jpeg|image/png|image/heic|image/heif, TEXT→TEXT and URL→LOCATOR.
Replacement preserves that Source kind/format compatibility; it cannot turn an
IMAGE Source into a PDF/TEXT Source. A different kind is a new intentional
acquisition, not an immutable source_kind patch.

`capture` has exactly `completeness,capture_sha256`. Server constructs the manifest,
reason, previous pointer and creator. Origin fields are null in this slice.

| Version-1 family         | Payload in addition to applicable common pins                                                                                                                                                                                      | Admission, mutations, Action and offline eligibility                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACQUIRE_SOURCE           | `acquisition_key,acquisition_sha256,source_input,capture,original`; no expected revisions; initial material revision is server-fixed 1                                                                                             | Authenticated Actor + exact-Trip current canReadTrip and canWriteTrip; acquired_by becomes immutable Actor. operation_key=acquisition_key. Atomically insert Source/revision/original; Source and Representation row_revision=1, ACTIVE/RETAINED; binary PENDING, inline NOT_APPLICABLE. One ACQUIRE Action, reason USER_REQUEST, material_revision=1. Offline authorable, not remotely accepted offline.                                                                        |
| PREPARE_REPRESENTATION   | Common pins only; binary prior PENDING/RETAINED                                                                                                                                                                                    | Owner + current canReadTrip + canWriteTrip required for new execution. Validate immutable descriptor and eligibility; write receipt only, no Source/Representation change and no Action. Return bound upload expectation. Inline rejects; recovery uses RECOVER instead. Offline queueable after exact registration proof; no upload authority offline.                                                                                                                          |
| VERIFY_REPRESENTATION    | Common pins only; binary prior PENDING/RETAINED                                                                                                                                                                                    | Owner + current canReadTrip + canWriteTrip required for new execution. Actual server read/proof outside locks, then checked VERIFIED and verified_at, Representation +1. No Source increment/Action; immutable operation receipt supplies exact result. Backend-only proof production. Client may enqueue request offline; execution online.                                                                                                                                     |
| REPLACE_MATERIAL         | Common Source pins plus `expected_current_material_revision,capture,original`; material_revision is the expected old current revision                                                                                              | Owner + current canReadTrip + canWriteTrip required for new execution. Current pointer must equal expected old capture. Append old+1 revision and new descriptor, Source current pointer+row_revision advance once; new Representation row_revision=1. No old descriptor/payload mutation. One REPLACE Action, CAPTURE_CHANGE, new material revision. Offline authorable against observed Source, stale conflicts explicit.                                                      |
| MARK_REPRESENTATION_LOST | Common pins only; binary prior VERIFIED/RETAINED                                                                                                                                                                                   | Owner + current canReadTrip + canWriteTrip required for new execution. Backend confirms definite missing or corrupt actual object under the bound descriptor; set LOST, preserve integrity/last verified_at, Representation +1. MARK_LOST Action, VERIFIED_LOSS, exact Representation/capture and observed Source revision. Offline local loss is separate; remote request can queue but requires online server proof.                                                           |
| RECOVER_REPRESENTATION   | Common pins only; binary prior LOST/RETAINED                                                                                                                                                                                       | Owner + current canReadTrip + canWriteTrip required for new execution. Own exact bytes supplied through the bound recovery byte route; create-only if absent, verify existing if present. Checked actual identical proof changes LOST→VERIFIED, updates verified_at, Representation +1. No Action enum extension; receipt records recovery. Offline queueable if exact local bytes remain; execution online.                                                                     |
| REQUEST_PURGE            | Common pins plus `policy_decision_id,protection_snapshot_sha256`; prior retention RETAINED, binary prior PENDING/VERIFIED/LOST or inline NOT_APPLICABLE, explicitly supplied                                                       | Owner + current canReadTrip + canWriteTrip required for new execution. ACTIVATION BLOCKED. Approved policy and exact protection inventory mandatory; set PURGE_PENDING and Representation +1, preserve payload/remote state. No Action yet: request receipt is not proof of physical PURGE. Never an automatic/offline purge.                                                                                                                                                    |
| FINALIZE_PURGE           | Common pins plus `purge_request_operation_id,quiescence_proof_id`; prior PURGE_PENDING, exact remote state                                                                                                                         | Owner + current canReadTrip + canWriteTrip required for new execution. ACTIVATION BLOCKED. Admission to physical deletion belongs to durable purge operation before I/O; final metadata commit requires definitive deletion/absence, matching request and quiescence. PAYLOAD_PURGED, binary PURGED or inline NOT_APPLICABLE; clear only inline payloads, Representation +1. One PURGE Action USER_REQUEST. Worker-only, never offline authoring.                                |
| REDACT_SOURCE            | Common Source pins with explicit prior lifecycle ACTIVE/DELETED and retention RETAINED, plus `scope:SOURCE_METADATA\|MATERIAL_REVISION,policy_decision_id,closed_identity_proof_id`; material_revision pins capture for the latter | Owner + current canReadTrip + canWriteTrip required for new execution. ACTIVATION BLOCKED. Source-metadata nulls acquisition_sha256/captured_at and resets capture basis UNKNOWN; revision-only nulls exact capture_sha256. Set affected retention IDENTITY_ONLY; Source-owned CAS advances Source once, never material revision. REDACT Action SECURITY_REDACTION, no other-family selector. Policy must authorize each exact field and replay tombstone. No offline execution. |
| REDACT_REPRESENTATION    | Common pins with exact ACTIVE/DELETED Source state and explicit Representation prior remote/retention state, plus `policy_decision_id,closed_identity_proof_id`                                                                    | Owner + current canReadTrip + canWriteTrip required for new execution. ACTIVATION BLOCKED. Exact C-I3A N listed Representation fields only; retained IDs/scopes/lineage remain as permitted. IDENTITY_ONLY, binary PURGED or inline NOT_APPLICABLE after required byte erasure; Representation +1, Source admission lock only. REDACT Action SECURITY_REDACTION with representation_id. No offline execution.                                                                    |

All command receipts are durable and immutable once terminal, whether Action is
present or absent. New no-change commands produce an UNCHANGED receipt and no
increment/Action; identical key replay returns the original receipt, not UNCHANGED.
ACQUIRE never turns an existing different acquisition into UNCHANGED. Mutating
commands with the wrong prior state reject rather than accept “already looks done”
as success without the original operation identity.

DELETE_SOURCE, unlink, revision/capture restoration and downstream-family
redaction have no V1 endpoint. A policy_decision_id/quiescence_proof_id above is a
typed UUID for a future durable reviewed decision/proof, not a caller assertion,
GUC, signed boolean or new authorization role. Those records/policies are not
defined sufficiently to activate purge/redaction; missing support returns
SOURCE_RETENTION_BLOCKED before any I/O or mutation.

## D. IDs, digests and acquisition idempotency

Source, Representation, operation and Action UUIDs are allocated locally before
dispatch. A server-only worker uses a new UUID before first admission and retains
it durably. Source revision is `(source_id,material_revision)`, never a UUID/hash.
Server allocates resulting numeric revisions under locks and Action occurrence
time; it never substitutes a new Source/Representation/operation ID on retry.
Action id is server allocated once inside its successful transaction.

Acquisition uniqueness remains exactly `(trip_id,acquired_by,acquisition_key)`.
Two intentional imports with different keys remain distinct even if every byte
matches. Both that index and D's operation index must converge concurrently:
reserve operation identity, check acquisition uniqueness, then atomically insert
all three material records+Action+receipt. Loser reads committed exact identity;
same key+same digest returns original result, differing IDs or intent rejects.

Define `E(x)` as UTF-8 compact JSON of fixed positional arrays below. Integers
are decimal safe integers (no exponent/negative zero); UUIDs lowercase canonical;
null is explicit; booleans literal; strings use deterministic JSON escaping with
no Unicode normalization, trimming or URL canonicalization. Reject lone
surrogates. This encoding is independent of object-property order. Array members
are in the listed order; input manifest UUIDs sort ordinally. Literal digest
vectors, encoding disagreement and duplicate-key tests are an activation gate.

- `descriptor = [id,material_kind,original_filename,part_key,mime_type,encoding,
payload_sha256,byte_count,text_content,locator_uri]`.
- `capture_sha256 = SHA256("otr-source-capture-v1\n" + E([1,source_id,
new_material_revision,previous_revision,original_representation_ids,
completeness,reason,origin_source_id,origin_material_revision]))`.
- `acquisition_sha256 = SHA256("otr-source-acquisition-v1\n" + E([1,trip_id,
actor_account_id,source_id,acquisition_key,source_kind,acquisition_channel,
captured_at,capture_time_basis,capture_sha256,descriptor]))`.
- `operation_sha256 = SHA256("otr-source-command-v1\n" + E([1,command,
operation_id,operation_key,actor_account_id,trip_id,source_id,P(command)]))`.
  P is the command's exact payload whitelist in C's listed key order; nested
  source_input/original/capture/state objects are positional arrays in their
  listed order. Include every explicit expected base/state and nullable value;
  omit only acquisition_sha256/operation_sha256 self-fields from their own
  digest input. For operation digest include acquisition_sha256 normally.

Server recomputes every digest, including inline actual content. Acquisition
hash is not a byte hash. Capture hash addresses the immutable capture manifest;
descriptors independently bind exact content. HTTP retries never recompute intent
from later Source state. Changed CAS base or replacement bytes require a new
operation ID/key after explicit conflict resolution, not mutation of the old one.

## E. CAS and deterministic locking

Order is current Trip admission rows (existing helper's rows, stable IDs), Source
operation identity, Sources by UUID, Representations by UUID, immutable revision
children by `(source_id,material_revision)`, then Action/receipt inserts. All
commands, replay lookups and I/O admission use this same order; no command locks
a child then its Source. Check current owner + canReadTrip for read-only lookups;
new execution and semantic mutation additionally check current canWriteTrip,
consistently with the
existing membership mutation path; a future implementation must demonstrate
revocation serialization without changing Track A semantics. No network holds
any of these locks.

| Mutable family                                                     | Sole concurrency owner                                                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source lifecycle/current pointer/Source redaction                  | Source.row_revision CAS.                                                                                                                         |
| Material revision capture/retention redaction                      | Parent Source.row_revision CAS; lock parent, compare supplied base, lock child; increment parent exactly once per transaction.                   |
| Representation remote availability/verified_at/retention/redaction | Representation.row_revision CAS; Source lock/recheck for admission without Source increment.                                                     |
| Source operation operational I/O phase/attempt ownership           | Row lock + exact expected phase/attempt generation + stable operation identity; never a Source or Representation implicit revision.              |
| Actions, material capture identity, final operation receipt        | Append-only/write-once; no ordinary mutable CAS.                                                                                                 |
| Local registration/availability/transfer                           | One Account-scoped SQLite transaction compares complete prior tuple+operation identity+generation. Does not increment mirrored server revisions. |

Source/Representation numeric changes increment each changed owner exactly once
per admitted transaction. New rows start 1. Initial and replacement child insertion
does not increment immutable revision rows. Overflow rejects before I/O or writes.
No-op/replay is revision-neutral. Compare Source expected state/base even for
Representation-only commands; current_material_revision need not equal a pinned
historical capture except REPLACE. Thus an ACTIVE retained Source can explicitly
recover an old retained ORIGINAL. If Source changes during I/O, completion cannot
silently adopt the newer base. Re-admission is a new explicit operation.

At I/O admission store exact Source/Representation bases, states and immutable
content binding. Release locks; do I/O. Reacquire all locks in the same order,
reload current owner + canReadTrip + canWriteTrip and both bases/states; only then
perform semantic mutation/finalization and seal its receipt.
Proof binds the original operation/attempt and observed bases. A delayed proof
cannot be resubmitted with refreshed revisions. PURGE_PENDING/PAYLOAD_PURGED/
IDENTITY_ONLY/DELETED fence upload, verification and recovery. Loss proof cannot
be inferred from a network/auth/stat failure. A VERIFIED→LOST transition makes
any older completion stale; a replayed historic VERIFIED receipt reports history
but never reactivates LOST material.

## F. Source operation record, receipt and exact replay

### Migration-ready recommendation (not a migration)

Propose `trip_source_operations`, Source-owned private scope, not a Ledger/Event
receipt. It is needed because the present Action model is insufficient for the
required exact result and durable I/O correlation. Preserve Actions unchanged.
The one family contains only C's enumerated commands and the internal typed
UPLOAD_ORIGINAL transport operation in G; no arbitrary entity/command payload.

| Proposed exact fields                                                                                                                                                                                                                               | Types and ownership                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id; trip_id; actor_account_id; source_id; operation_key                                                                                                                                                                                             | U/U/U/U/K required, immutable. PK id; unique `(trip_id,actor_account_id,operation_key)` across this Source command family; source_id FK RESTRICT after admitted Source registration.                                                                                                                                                                           |
| contract_version; command; operation_sha256; created_at                                                                                                                                                                                             | 1; fixed command enum; H; admitted T; required immutable. Digest is recomputed, not trusted client input.                                                                                                                                                                                                                                                      |
| material_revision; representation_id; expected_source_row_revision; expected_source_lifecycle; expected_source_retention_state; expected_representation_row_revision; expected_representation_remote_state; expected_representation_retention_state | R/U/R/S(16)/S(24)/R/S(24)/S(24); null only where catalog omits them; immutable command pins. Wire state pairs flatten into these enum columns, never freeform JSON.                                                                                                                                                                                            |
| bound_payload_sha256; bound_byte_count; bound_mime_type; parent_operation_id                                                                                                                                                                        | H/safe bigint/S(128)/U, applicable binary I/O binding; nullable only for non-I/O. Parent is PREPARE or RECOVER identity for transport, never a domain output.                                                                                                                                                                                                  |
| phase; attempt_generation; attempt_id; worker_identity; admitted_at; io_finished_at                                                                                                                                                                 | Exact phase enum below; safe positive R; U; internal bounded worker identity; T/T. Operational row-lock/state CAS; initially no attempt/times, generation starts 1. No caller-written worker identity.                                                                                                                                                         |
| outcome; error_code; completed_at                                                                                                                                                                                                                   | Null until terminal, then APPLIED/UNCHANGED/REJECTED, bounded enumerated error or null, admitted T. Write-once as one terminal receipt.                                                                                                                                                                                                                        |
| result_source_row_revision; result_material_revision; result_representation_row_revision; result_remote_state; result_retention_state; result_action_id; result_verified_at                                                                         | Typed numeric/enum/UUID/time result pins, nullable by family or REJECTED. Historical immutable observations, not latest state.                                                                                                                                                                                                                                 |
| result_sha256                                                                                                                                                                                                                                       | H, null until terminal; digest of canonical `[1,id,command,operation_sha256,outcome,error_code,completed_at,result_source_row_revision,result_material_revision,result_representation_row_revision,result_remote_state,result_retention_state,result_action_id,result_verified_at]` in the table's result order, prefix `otr-source-result-v1\n`. Stored once. |

The terminal reply has exactly `{contract_version:1,operation_id,operation_key,
command,operation_sha256,outcome,error_code,completed_at,source_id,
result_source_row_revision,result_material_revision,representation_id,
result_representation_row_revision,result_remote_state,result_retention_state,
result_action_id,result_verified_at,result_sha256}` with explicit nulls where
inapplicable. Metadata results come from the stored receipt, never current-row
serialization. A nonterminal reply has exactly `{contract_version:1,operation_id,
operation_key,operation_sha256,phase,attempt_generation}` and HTTP 202, without a
terminal receipt/result digest. Exact read route:
`GET /v2/trips/:tripId/sources/:sourceId/operations/:operationId`, with the scoped
key/digest as validated query parameters and the same current private ACL. No
search-by-hash/list-all-operations endpoint. Receipt returned with command success
is the same object as a later exact read; transport headers are not receipt fields.

An acquisition creates its operation row in the same deferred transaction as
Source/revision/descriptor/Action. A uniqueness race is serialized through its
unique identity/index; no orphan operation with a dangling Source FK commits.
Other commands reserve their operation on an existing scoped Source.
ACQUIRE/REPLACE bind representation_id to original.id even though the request
has no existing-Representation CAS; expected Representation fields are null.
Their result pins identify the newly committed descriptor/capture, not the old
REPLACE base. Every Action uses this operation_key/operation_sha256 and the
resulting Source revision (the unchanged observation for child-only mutations).
The acquisition revision operation_key is acquisition_key; replacement uses the
replacement operation_key. All unused Action selectors remain null.
No raw document bytes, text, filename, URL, credential, arbitrary result JSON or
stack trace are stored in this operation family. Digest binds the full input
without duplicating its private material. SELECT is via the exact filtered
gateway, not direct client/service table grants. Source/Trip/Account RESTRICT,
forced RLS, private-owner guard and fixed entrypoint checks apply.

Phase vocabulary: `ADMITTED`, `IO_ACTIVE`, `IO_UNKNOWN`, `IO_QUIESCENT`, `FINAL`.
Metadata-only commands register directly FINAL in the mutation transaction.
I/O admission commits ADMITTED, then row-locked ownership advances IO_ACTIVE
before dispatch. Exact attempt completion becomes IO_QUIESCENT, then a checked
transaction seals FINAL and its receipt. Proof can be sealed atomically with
quiescence when still valid. A final receipt is immutable; no new I/O after FINAL.
The phase record exists solely for restart recovery, not extraction progress.
Allowed operational transitions are ADMITTED→IO_ACTIVE,
IO_ACTIVE→IO_UNKNOWN|IO_QUIESCENT, IO_UNKNOWN→IO_QUIESCENT only on definitive
quiescence, IO_QUIESCENT→IO_ACTIVE for a newly owned retry, and
ADMITTED|IO_QUIESCENT→FINAL. ADMITTED→FINAL without dispatch may seal rejection;
IO_ACTIVE/IO_UNKNOWN cannot release a write merely by sealing a rejection.
Guard the exact prior phase, generation and attempt_id under the operation row
lock. Re-entry allocates a new attempt_id and increments generation once; the
first attempt uses generation 1. No increment on duplicate completion. Overflow
rejects. Every new dispatch rechecks owner + canReadTrip + canWriteTrip and bases before committing
IO_ACTIVE; an expired lease cannot authorize dispatch or deletion.

Migration-ready exclusive-write rule: a partial unique constraint on
representation_id for commands UPLOAD_ORIGINAL/RECOVER_REPRESENTATION/
FINALIZE_PURGE in ADMITTED/IO_ACTIVE/IO_UNKNOWN permits at most one potentially
live writer/deleter per Representation. Read-only VERIFY/MARK_LOST need not hold
that write slot; their metadata CAS still serializes. IO_QUIESCENT releases the
slot only after actual proof; re-entry must reacquire it. Unknown attempts retain
protection even after Account admission is revoked. No automatic deletion of an
operation record or timeout-based slot release is permitted.

Crash with IO_ACTIVE becomes IO_UNKNOWN under exact attempt CAS. Expired worker
lease, timeout, cancellation request or absent HTTP response does **not** prove
quiescence. An old writer can still complete a storage call. Do not start another
write/delete or declare abandoned material safe until that attempt is proven
terminal by the proxy/provider execution owner. Definitive response or audited
termination of every writer plus the provider's completed-call guarantees is
required. If the provider cannot establish this, retain IO_UNKNOWN and protection;
cleanup/purge remain blocked. Read-only probes can investigate availability,
but object existence alone cannot prove an old PUT will not happen later.

Once quiescent, a retry may increment attempt_generation, allocate a new attempt
UUID and reacquire ownership using the same immutable operation identity/bases.
Only operational attempt metadata changes; historic intent and expectations do
not. Reject stale worker attempt/generation at every completion. A terminal
REJECTED receipt ends that intent; changed expected bases require a new key.

Read-only replay/status order: authenticate and reload current owner + canReadTrip
for the exact Trip, resolve the existing operation by exact Actor/Trip/key and
check operation ID/digest, then return its terminal receipt **before** checking
current mutable CAS against historic bases. Historic reads remain filtered by
C-I3A privacy/redaction. Same key/different digest or ID rejects; same ID/different
key/scope rejects. An existing nonterminal operation may return its exact 202
status under read admission alone, without writes or new dispatch. Resuming an
eligible quiescent attempt or persisting/executing any new operation additionally
requires current canWriteTrip plus the original bases/state checks. The exact
read-only operation endpoint uses owner + canReadTrip; losing write admission
alone does not deny historic exact reads while read admission remains valid.
Losing owner/read admission denies sensitive historic results too.

The receipt and Action/state mutation commit together, or neither does. A rejected
new operation may seal a no-mutation REJECTED receipt only after owner +
canReadTrip + canWriteTrip authorization;
malformed/unauthorized envelopes do not register private operations. Upload-only
FINAL/APPLIED means `OBJECT_CREATED_OR_IDENTICAL`, never VERIFIED. A later Source
edit changes neither the receipt nor its historical result. Client replay consumes
the receipt identity to close its queue item, but applies live mirrors only through
monotonic scoped reconciliation; it never installs an older result as current.

No receipt deletion/expiry is selected. Digest erasure requires the separate
reviewed closed tombstone policy in K; this table cannot be activated for redaction
by treating a missing digest as a reusable key.

## G. Binary upload: private create-only proxy

PREPARE's receipt returns Representation identity, expected bases/states, allowed
MIME/byte count/hash and upload route version, not a bucket credential or bearer
capability. Future `PUT /v2/trips/:tripId/sources/:sourceId/representations/:id/bytes`
requires validated Account auth, `operation_id`, K `operation_key`, H
`operation_sha256`, `parent_operation_id`, the exact PREPARE pins and fixed binary
content type/length. The internal command literal is `UPLOAD_ORIGINAL`, version 1.
Its digest binds `[1,operation_id,operation_key,actor,trip,source,material_revision,
representation_id,parent_operation_id,expected_source_row_revision,
expected_representation_row_revision,expected_state_pairs,payload_sha256,
byte_count,mime_type]` with prefix `otr-source-upload-v1\n`. No bytes need be
embedded in metadata JSON. Recovery bytes use fixed `PUT /v2/trips/:tripId/sources/:sourceId/recover-operations/:operationId/bytes`.
The RECOVER operation itself owns the I/O phase and terminal recovery receipt;
parent_operation_id is null, with no nested UPLOAD_ORIGINAL operation. Its body
is exactly the descriptor-bound bytes, with Actor authenticated and route IDs
matching the registered operation. Limits and immutable intent remain the same.

1. Authenticate and recheck acquiring owner + current canReadTrip + canWriteTrip
   for the exact Trip before admitting UPLOAD_ORIGINAL/recovery I/O. Require
   Source ACTIVE/RETAINED; exact retained ORIGINAL in the pinned manifest; pending
   upload or explicit LOST recovery only. Derive `supabase_storage`, private
   `trip-source-material`, and `v1/<trip>/<source>/<representation>/payload` from
   trusted records. Caller path/bucket/provider arguments are forbidden.
2. Reserve exclusive live write-attempt ownership for that Representation under
   E/F; overlapping operations return IO busy/202, not concurrent writes. Stream
   into a bounded private Backend staging file while calculating hash and length.
   Verify actual format and descriptor before issuing Storage creation. Early
   reject oversized inputs; never stage unbounded bytes or log material.
3. Invoke fixed Source Storage wrapper with create-only/no overwrite. A 409
   existing-object result triggers actual read/hash/size/MIME comparison. Identical
   material may finish the upload receipt; mismatch blocks that attempt and
   quarantines the object logically (no reads/extraction), without overwriting,
   deleting or repointing immutable descriptors. No storage move is implied.
4. After successful create or identical proof, record quiescence and upload-only
   result under exact attempt ownership. Recheck current owner + canReadTrip +
   canWriteTrip and bases before
   any semantic completion. VERIFY is separate and reads actual persisted bytes.
   A changed/deleted Source leaves physical bytes protected and unavailable for
   semantic publication; no successful Storage response overrides the DB fence.

A transient create timeout is IO_UNKNOWN, not failure-to-create or permission to
overwrite. Retry first resolves the exact operation/attempt. Server-staged files
are Account/operation bound and cleaned only after attempt quiescence and no
required reference; no cleanup of current Source objects is authorized by staging
cleanup. Provider-only privileged administrative tampering is outside the ordinary
runtime model; mismatch remains an explicit integrity incident, never repaired
by replacing bytes behind the same Representation ID.

No client anon/authenticated list/read/write/delete/storage metadata authority.
Future private reads also proxy and recheck owner + current canReadTrip; no persistent signed
URL in the local mirror. Bucket enumeration and object-key guessing confer no
authority. Current receipt Storage wrapper remains byte-for-byte unchanged.

## H. Actual verification and inline originals

VERIFY admits a read operation bound to PENDING/RETAINED and exact descriptor,
downloads actual bytes outside locks, checks actual SHA-256/size and sniffed MIME,
then commits only if current owner + canReadTrip + canWriteTrip and bases/states
still match. verified_at is the
server proof completion time, not upload response time or user capture time.
Do not trust Storage metadata/content-type/client hash alone.

Allow only PDF/JPEG/PNG/HEIC/HEIF. PDF ≤10,485,760 bytes; image ≤52,428,800;
binary size >0. Preserve image/PDF bytes exactly; no receipt 15 MiB normalization,
resize or JPEG transcode. Declared MIME and actual accepted format must agree;
HEIC/HEIF recognition needs a deterministic validated brand rule. Safe bounded
decode/parser validation is required before VERIFIED; signatures alone do not
prove parser safety. Choose no library in this contract. An unsupported/ambiguous
format rejects; resource/decoder profiles are an implementation security gate.

TEXT requires exact UTF-8, ≤262,144 bytes, text_content present (empty allowed),
encoding UTF-8, null locator/MIME/storage. LOCATOR requires the exact supplied
nonblank http/https string without whitespace, ≤4,096 Unicode scalars and ≤16,384 UTF-8 bytes,
encoding UTF-8, null text/MIME/storage. Hash/count use that exact string, not a
normalized URL. Server recomputes count/hash on registration. Neither inline kind
calls Storage or VERIFY; both stay NOT_APPLICABLE. URL registration performs no
HTTP fetch, redirect following, OCR, extraction or content truth claim.

Missing PENDING object means not-yet-uploaded, not automatically LOST. Hash/size/
MIME mismatch leaves PENDING (or LOST for recovery), records a terminal rejected
operation, blocks/quarantines the bad object and requires explicit new material
identity or later reviewed cleanup. No invented CORRUPT enum or last-proof erase.
Transient read failure is retryable IO_UNKNOWN/unavailable, not permanent loss.

## I. Replacement and material revisions

REPLACE requires current owner + exact-Trip canReadTrip + canWriteTrip, then
locks Source and compares expected current pointer/base/state. New
revision is old+1, previous_revision=old, reason REPLACEMENT, creator=acquired_by,
server time, new manifest and recomputed capture digest. New ORIGINAL has an
independent UUID, new object path for BINARY, row_revision=1 and PENDING, or exact
inline content and NOT_APPLICABLE. One Source increment, one REPLACE Action and
receipt commit atomically. Failure rolls back all inserts/pointer/Action/receipt.

Old material may be LOST: replacement does not require its bytes, provided the
old capture identity and Source are still retained/admitted. Keep prior descriptors,
hashes, verified_at and historical pin addressability. Same bytes intentionally
replaced under a new operation still form a new capture; no hash no-op heuristic.
Do not retarget confirmed downstream support or restart extraction. A new current
pointer is not proof that the new binary exists or has been verified.

## J. LOST and identical-byte recovery

Remote MARK_LOST requires current owner + exact-Trip canReadTrip + canWriteTrip
at admission and checked post-I/O finalization; it accepts only a previously
VERIFIED binary. It performs a bound
server read/probe; definitive authorized 404 or an actual descriptor mismatch is
evidence of loss of the exact material. 401/403/timeout/network/service failure is
not. PENDING never-present material stays PENDING. If missing/corrupt remains after
proof and checked CAS, set LOST and record MARK_LOST/VERIFIED_LOSS atomically.
Local ABSENT/LOST does not mutate remote state. Last verified_at remains historical.

RECOVER requires current owner + exact-Trip canReadTrip + canWriteTrip at I/O
admission and checked post-I/O finalization; it admits only LOST/RETAINED plus
current Source ACTIVE/RETAINED. Descriptor
hash/count/MIME and object key remain immutable. If object is missing, proxy
create-only exact bytes. If existing bytes match, reuse after actual proof; if they
mismatch, reject without delete-and-replace. Commit VERIFIED under the originally
observed bases, update proof time once, return immutable recovery receipt. No new
material revision, Source increment or ordinary ACQUIRE/REPLACE Action is emitted.

PURGED/PAYLOAD_PURGED/IDENTITY_ONLY cannot recover at the same Representation ID.
A separately admitted new capture/Representation is required. A logically deleted
Source has no default recovery. Response loss replays the exact recovery result;
newer LOST/deletion/purge remains newer and is never undone by historic replay.

## K. Purge, redaction and retention: activation BLOCKED

No retention duration, quota-triggered purge or legal policy is invented. Current
foundation stores structural states; it does not authorize destructive commands.
REQUEST_PURGE/FINALIZE_PURGE/REDACT_* remain disabled until a reviewed policy
defines current authorizer, last-copy handling, pending/offline protections,
confirmed-history protection, exact retained identity/digest permissions and
closed/redacted operation recovery. Unknown protection is a veto, not consent.

For deferred redaction, valid binary prior pairs are PENDING/RETAINED,
VERIFIED/RETAINED, LOST/RETAINED, those same remote states with PURGE_PENDING,
or PURGED/PAYLOAD_PURGED. Valid inline prior pairs are NOT_APPLICABLE with
RETAINED/PURGE_PENDING/PAYLOAD_PURGED. IDENTITY_ONLY accepts only exact historic
replay, never a new redaction or restored payload. Policy authorizes the chosen
pair/erasure; the command cannot bypass protected/unknown I/O. Result markers
and null-field exceptions must match C-I3A and the future reviewed policy.

Every future activated purge/redaction/delete mutation requires current owner +
exact-Trip canReadTrip + canWriteTrip in addition to policy, CAS and protection
checks. Write admission alone does not resolve the BLOCKED retention policy.

If later activated, REQUEST_PURGE checks that write admission, locks
Source/Representation, inventories exact
pending upload/recovery/verification/review/extraction/unknown-dispatch references,
confirmed support, parents and device/offline holds; validates policy proof; then
CASes PURGE_PENDING. It closes admission to new I/O. Already dispatched writes
must all be proven quiescent before a purge executor may delete. Do not claim that
setting PURGE_PENDING stops an in-flight network PUT. A provider-independent
proof cannot be fabricated from an expired lease.

Physical removal runs outside DB locks, under a durable FINALIZE_PURGE operation
bound to the request receipt and exact original key/descriptor. After definitive
absence, reacquire locks and checked bases, set PAYLOAD_PURGED/PURGED and Action
PURGE. Removal success + DB failure leaves PURGE_PENDING and the original operation
nonterminal: retry inspects that exact object and finishes the same operation,
never another removal under a new key. Delete timeout leaves IO_UNKNOWN; definitive
404 can complete only after write quiescence, not before. An already-PURGED record
does not justify arbitrary delete retry; recover its original operation and bound
proof. No new uploader may use a purged identity, including old attempts.

Inline purge removes exact text_content/locator_uri in the final checked DB
transaction; remote_state remains NOT_APPLICABLE. Preserve hash/count/identity
unless separately authorized IDENTITY_ONLY redaction. Logical delete hides/freezes
Source; unlink removes one association; loss records availability; purge removes
material; redaction removes explicitly permitted provenance payload. None deletes
the accepted Event/Booking/Expense or its owning-domain receipt.

REDACT_SOURCE/REDACT_REPRESENTATION use C-I3A N's exact nullable exceptions and
the CAS owners in E; they cannot clear arbitrary identifiers. Source-wide erasure
also has to traverse and authorize future Run/Candidate/Input/Confirmation/slot/
device caches before claiming completion. This slice does not implement those
families or claim partial erasure is complete. The proposed operation record's
digest/result erasure must preserve a closed tombstone: exact IDs/key/scope and
redacted-result marker, no new or changed-intent execution. Permissions to retain
that tombstone and its exceptional immutable-field erasure require policy review.
An unknown/absent digest never means a free acquisition key.

Orphan cleanup is deferred: an unassociated or PENDING Source is not an orphan.
No default garbage collector deletes Source bucket objects. A future executor
needs definitive quiescence, complete protected-reference inventory, exact owned
key and current policy. It cannot delete a VERIFIED object, last original or
unknown/in-flight upload. Until those proofs exist, retain/quarantine rather than
guess. Private Backend staging cleanup is a different bounded local operation.

## L. Authorization, privacy and future private gateway

C-I3A's existing read/write distinction is authoritative. Private Source/material
reads and exact read-only historic operation/receipt/status lookup require current
Actor == Source.acquired_by and current `canReadTrip` for the exact Trip, with
privacy/redaction filtering. Every new Source/material mutation or
mutation-producing command execution additionally requires current `canWriteTrip`,
plus command CAS/lifecycle/state checks. This includes new ACQUIRE, PREPARE
record creation, UPLOAD_ORIGINAL admission, VERIFY, REPLACE, MARK_LOST, RECOVER
and any future activated purge/redaction/delete. For ACQUIRE, authenticated Actor
becomes immutable acquired_by after current exact-Trip read/write admission;
there is no existing Source owner to compare before registration.

Use the existing canReadTrip/canWriteTrip predicates, not a new Ledger/Event role
model or participation predicate. Admission lookup errors deny. Association,
target visibility, uploader filename, service_role, Person participation or a
shared Trip cache does not grant Source access. Derive existing-record scope from
Source; cross-Trip/Account mismatches reject before receipt lookup, Storage access
or metadata exposure.

Future dedicated DB principal `otr_trip_source_command_gateway` follows B's
execution-identity lessons, with Source's admission semantics: authenticated
Backend connection, only EXECUTE on positive fixed command/receipt/read helpers,
no protected table DML/DDL/role administration and no membership/SET ROLE path
into `otr_trip_source_writer`. The trusted Backend verifies bearer Actor; DB
independently compares passed Actor/envelope/parents and reloads current
canReadTrip for reads, and both canReadTrip/canWriteTrip for new execution and
semantic finalization. Fixed read-only replay entrypoints must not dispatch I/O or
create records under read-only authority.
SESSION_USER must be that dedicated gateway; CURRENT_USER inside the fixed
SECURITY DEFINER entrypoint must be `otr_trip_source_writer`. No client/service
JWT, GUC, caller boolean, postgres-owned write helper or trigger-depth exemption.

Writer remains NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS,
without replication/API/gateway membership or broad arbitrary functions. Later
activation grants only reviewed Source columns, fixed read helpers and bounded
operation/Action INSERT/state-transition capabilities, with forced RLS and narrow
policies. No direct Storage mutation grant to the DB writer; trusted proxy's
server-only Storage access is separately bucket-scoped and authorized. Actual
positive policies and guards must allow the real identity pair without weakening
ordinary row/statement rejection. Fixed search_path=pg_catalog and fully qualified
objects; no arbitrary SQL/function/path arguments. Provisioning/rotation and
effective PUBLIC/inherited/live-column/ownership inventories are activation gates.
No credentials are required or requested for this design phase.

Loss of canWriteTrip after upload I/O dispatch does not mean cancellation stopped
that write: physical bytes may still land. Preserve original operation/attempt
and object/quiescence protection. Post-I/O semantic mutation/finalization rechecks
current owner + canReadTrip + canWriteTrip and must not publish VERIFIED or any
other new semantic state without them. The trusted original attempt owner may
record only its bounded quiescence bookkeeping under the original operational
CAS; this is not new command admission or semantic publication. Unknown attempts
remain protected; write loss cannot release their protection.

Historic exact receipt/result/status reads independently require owner + current
canReadTrip and C-I3A privacy/redaction. Losing write admission alone does not deny
those read-only lookups; losing owner/read admission does. Write denial pauses/
blocks new execution, never exposes operations to another Account. Cached valid
local sessions stay usable offline; refresh failure is not logout/REAUTH_REQUIRED.

## M. Crash/restart and interleaving matrix

| Interleaving                                                 | Required durable outcome and recovery                                                                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owned local file staged; SQLite registration fails           | Retain original until no durable intent references it; owned staging reconciliation, no false Source success.                                                                                            |
| ACQUIRE DB commit succeeds; response lost                    | Replay exact acquisition operation → same Source/revision/descriptor/Action/receipt. No second Source or upload inferred.                                                                                |
| PREPARE succeeds; upload never starts                        | Descriptor remains PENDING, bytes retained locally, queue resumes exact upload intent only with owner + current read/write admission. No timer labels it LOST/orphan.                                    |
| Upload succeeds; response lost or process dies before VERIFY | Resolve upload operation/attempt; unknown remains protected. Once quiescent, read exact object; enqueue/resume separate VERIFY. Upload receipt is not VERIFIED.                                          |
| VERIFY DB commit succeeds; response lost                     | Exact operation receipt proves historic finalization. Reconcile live state monotonically; no second increment or Action.                                                                                 |
| Object exists; DB stays PENDING                              | Bound actual verification plus original checked bases is required. Object search/hash match alone is not command success.                                                                                |
| Hash/size/MIME mismatch                                      | REJECTED/integrity quarantine; descriptor unchanged, no overwrite/auto-delete. Explicit replacement/new acquisition remains possible.                                                                    |
| Object missing                                               | PENDING means unfinished upload; VERIFIED→LOST requires explicit server proof/CAS; network failure means unavailable, not loss.                                                                          |
| MARK_LOST vs delayed verify/replay                           | Numeric CAS/prior tuple and immutable proof bases fence stale write; recorded historic VERIFY returns history without reviving LOST.                                                                     |
| Identical recovery; response lost                            | Exact RECOVER receipt returns original result. Unknown write resolves first; existing identical bytes alone do not prove DB recovery commit.                                                             |
| Mismatched recovery bytes/existing object                    | Reject, preserve LOST and descriptor, never delete-and-replace.                                                                                                                                          |
| Replace while old material LOST                              | New capture/new descriptor under Source CAS; old LOST record and supporting pins survive.                                                                                                                |
| Source logically deleted while upload runs                   | In-flight PUT may land; post-I/O current read/write admission and lifecycle checks reject semantic completion. Protected/quarantined bytes wait for policy, not automatic orphan deletion.               |
| Source replaced during upload/verify                         | Changed expected Source base rejects completion; no silent newer-base substitution. Existing old object remains retained; explicit new verification may address old capture.                             |
| Purge requested during upload/verify                         | PURGE_PENDING fences new admission, but admitted unknown/in-flight work must become proven quiescent before delete. Stale verify cannot cross retention CAS.                                             |
| Purge deletion succeeds; final DB transaction fails          | PURGE_PENDING + original durable operation remain; bound definitive absence permits same-operation finalization under still-valid bases.                                                                 |
| DB says PURGED; deletion retry ambiguous                     | Return terminal purge receipt if present; otherwise exact operation/proof investigation. Never dispatch another delete from state alone or let old write resurrect object.                               |
| Account A→B→A during any response                            | Old generation cannot apply/finish local queue. Durable A intent survives; new A generation obtains authorized exact receipt and reconciles atomically.                                                  |
| Read/write admission lost after I/O admission                | Physical I/O may finish; preserve correlation/protection. No semantic finalization without current write admission. Exact historic reads remain owner+canReadTrip governed; read loss denies disclosure. |

## N. Minimum future SQLite and durable queue contract

Use existing repository/queue/auth/file scheduling patterns, not a feature-owned
worker or new generic sync engine. A Source repository owns the Account-scoped
metadata transaction. Screens/native pickers produce intent, never DB/cloud calls.
IDs, operation key/digest, complete payload and expected bases/states are persisted
before any network phase. Byte locator lives only in a device-private owned copy;
no picker URI, temporary provider URL or signed capability becomes server material.

Pending local records use C-I3A O's required `cache_account_id`, registration_state
PENDING/REGISTERED/CONFLICT/BLOCKED; server timestamps/revisions remain null until
validated server proof. Device provisional timestamps do not certify revision 1.
Mirror every accepted field losslessly; retain immutable original/capture history.
Representation local_uri/local_state/local_verified_at/transfer_state keep the
accepted C-I3A vocabulary, independent of remote_state. Local ABSENT is not remote
LOST, upload COMPLETE is not extraction READY, and neither is domain acceptance.

Repository flow: copy/hash exact bytes into an Account-owned Source root, retain
input until durable commit; one SQLite transaction stores pending acquisition+
descriptor+immutable queue operation. After acquisition receipt, atomically apply
registered metadata and complete that queue item. A dependent PREPARE and binary
upload intent bind actual returned bases; do not prefill imaginary server bases.
After upload-only receipt enqueue VERIFY with the registered pins. Dependency
execution pauses until exact parent receipt, not “row exists somewhere.” Inline
acquisition/replacement needs no upload operation. Same account private pending
bytes remain protected across network failures and app restarts.

Capture Account/Trip/in-process generation before credential acquisition, and
check before each network phase and under the Account transition gate through
SQLite commit/rollback. Queue claims/due times/backoff follow existing infrastructure.
Store exact server operation identity/phase for response-loss recovery. Process
restart does not erase durable intent; a fresh generation can resume after current
authorization and receipt resolution, not by replaying an old response callback.

Remote observations update accepted rows only monotonically; equal revision with
different state is integrity failure. They never rewrite pending authored intent,
expected CAS or byte identity. Stale CAS moves registration/queue to explicit
CONFLICT with original payload preserved. User resolves by a new operation after
review, not key reuse or automatic LWW. No new shared Source feed/cursor is invented:
the future first slice needs only exact operation/result and scoped Source read
reconciliation. Its transport/local migration remains separately approved work.

Minimum queueable intents: acquisition/replacement, registered binary PREPARE,
UPLOAD_ORIGINAL, VERIFY request, MARK_LOST request and byte-bound RECOVER. Offline
authoring is not current server admission. Automatic byte eviction is deferred
until fresh authenticated exact recoverability, protected-reference checks and
guarded local URI clear can all be proven. Valid cached-session access never waits
for upload, extraction, network reauthentication or Source command success.

## O. Existing acquisition channel mapping

| Channel                    | Current seam and future intent                                                                                                                                                                                               | Trust/Source boundary                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera                     | `useReceiptCapture`/Expense draft use Expo camera permission and image picker. Future Source-specific caller binds selected Trip/Account and allocates acquisition/Source/Representation IDs before owned-copy registration. | One image → one IMAGE/CAMERA Source+ORIGINAL; preserve acquired bytes. Native URI/type/time/filename are advisory; actual copied byte identity is verified. No OCR implied.                    |
| Photos                     | Expo library permission/multiple image selections; future Source caller commits independent operations per asset.                                                                                                            | Each image → distinct IMAGE/PHOTOS Source, even equal bytes. Earlier successful local captures survive later batch failure. No guessed album/document grouping or inherited Expense max-three. |
| Files                      | Document picker `copyToCacheDirectory:true`, multiple PDF/image assets. Copy each into private Source-owned storage before durable registration.                                                                             | PDF→FILE/FILES; image→IMAGE/FILES. OS cached URI may disappear. Name/MIME/size from picker are advisory; inspect/hash actual bytes. Multi-file selection creates multiple Sources in this V1.  |
| Pasted TEXT / URL LOCATOR  | Typed inline contract can accept explicit text/URL content; new UI/native channel integration is future work.                                                                                                                | Exact supplied UTF-8; no fake file/object, webpage fetch, inferred capture instant or extraction.                                                                                              |
| Share Sheet / email / COPY | Future adapter supplies the same acquisition identity and later reviewed multipart/origin semantics. No runtime handler enabled here.                                                                                        | Explicit origin authorization and completeness; no opaque unsupported .eml binary, fabricated headers or cross-Trip move.                                                                      |

Caller-observed picker completion may be OBSERVED capture time if actually recorded;
otherwise UNKNOWN/null. Supplied metadata may be SUPPLIED only when it exists and
is explicitly labeled; server registration time never invents original capture
time. Acquiring Account is not a TripPerson. Current receipt imports continue to
create only receipts under their existing Expense/Payment/OCR intent and limits.

## P. Security/adversarial resolution

| Case                                   | Required contract outcome                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same PDF intentionally imported twice  | Different keys/IDs → two Sources; equal byte hash is not dedup identity.                                                                                                    |
| Same operation retried concurrently    | Owner+canReadTrip suffices for existing exact receipt/status; same digest/ID replays. New execution/resume requires current canWriteTrip too, one mutation/Action.          |
| Different bytes or pins under same key | Recomputed digest differs → OPERATION_KEY_REUSED, no object I/O or mutation.                                                                                                |
| Object overwrite attempt               | Create-only provider path; existing mismatch rejects without overwrite/delete.                                                                                              |
| Forged object key/provider/bucket      | Not accepted payload fields; server derives exact trusted path.                                                                                                             |
| Cross-Trip or owner mismatch           | Deny before receipt/object access; no private identifier enumeration.                                                                                                       |
| Admission lost mid-upload              | Actual bytes may land; preserve operation/quiescence protection. Write loss blocks new semantic finalization, while historic exact reads remain owner+canReadTrip governed. |
| A→B→A                                  | Original generation cannot apply; new admitted A generation resolves exact durable operation.                                                                               |
| Upload completes after logical delete  | No VERIFIED publication; no automatic purge or Source resurrection.                                                                                                         |
| Late verify after MARK_LOST            | Original expected bases fail; historic receipt cannot reinstall VERIFIED.                                                                                                   |
| Purge vs verify                        | Retention/row CAS fence; unknown writer quiescence required before any deletion.                                                                                            |
| Response-loss recovery                 | Receipt/attempt lookup by exact key/ID/digest, not byte/object search; no duplicate transition.                                                                             |
| Identical-byte LOST recovery           | Owner+current canReadTrip/canWriteTrip, retained LOST and same descriptor; create-only/actual read, write-rechecked VERIFIED.                                               |
| Different-byte LOST recovery           | Integrity rejection, old identity untouched; new material needs explicit capture.                                                                                           |
| Orphan cleanup                         | Unknown/in-flight/referenced/VERIFIED/last-copy material not deletable; no default GC.                                                                                      |
| Private bucket enumeration             | No direct client list/read or metadata authority; fixed Backend private owner filter.                                                                                       |
| service/JWT/GUC spoofing               | Dedicated authenticated SESSION_USER/private CURRENT_USER pair; ordinary statement/row guards remain.                                                                       |
| Oversized PDF/image or ambiguous MIME  | Streaming bound and actual-format validation reject before Storage create/VERIFIED.                                                                                         |
| TEXT/LOCATOR                           | Exact inline content/hash; NOT_APPLICABLE, no object, URL fetch or storage key.                                                                                             |
| Replace old supporting evidence        | Append only; preserve old capture/descriptor/evidence pins and canonical truth.                                                                                             |

Read-only adversarial cases: an owner retaining canReadTrip but lacking
canWriteTrip may read private material and an existing exact historic receipt/
status, subject to C-I3A privacy/redaction. They cannot ACQUIRE, persist a new
PREPARE/operation record, admit UPLOAD_ORIGINAL, execute/resume VERIFY/REPLACE/
MARK_LOST/RECOVER or finalize a semantic mutation. A new acquisition by a read-only
Trip member rejects without Source/descriptor/Action/operation insertion. Retrying
an existing operation under read-only authority returns only its stored result or
nonterminal status; it cannot start a new attempt. Restored write admission requires
fresh admission and the original valid CAS/state before any permitted resume.

## Q. Track A/B and downstream boundaries

No Associations, Run/Candidate, Confirmation/output slot or domain adapter is
implemented or activated. Commands acquire/store evidence only. No Event/Booking/
Expense creation, accepted timezone/clock/location/Person inference, extraction
proposal acceptance or financial receipt write occurs. Track B owns temporal/
spatial truth; A owns Person identity/lifecycle/admission. Participation certificate
is neither Source permission nor current role proof. Receipt asset IDs never alias
Source/Representation IDs; no dual-write/backfill. Shared primitive reuse requires
existing receipt compatibility tests, not a changed receipt provider/normalizer.

Source loss/logical deletion/purge/redaction affects availability and evidence
resolution only. Accepted canonical target values/revisions and owning-domain
receipts survive. Future protected-reference inventory must integrate those
families before enabling destructive transitions, without re-creating targets or
treating C operation receipts as domain mutation receipts.

## R. Activation and rollback order

1. Human/independent review accepts this contract and digest/receipt/preparation
   choices. No implementation is implied by CONTRACT COMPLETE.
2. Separately approve the Source operation schema and private gateway provisioning,
   positive RLS/column grants, fixed entrypoints and actual-identity guard admission.
   Keep exact read-only lookup owner+canReadTrip separate from every new execution/
   semantic finalization requiring current canWriteTrip as well.
   Preserve the protected foundation and historical migrations; new migration only.
3. Prove atomic ACQUIRE/REPLACE/receipts and exact private read/replay/CAS first,
   while every upload/destructive command remains disabled. Include concurrency,
   deferred aggregate validation, digest vectors and same-key/different-intent tests.
4. Prove separate create-only proxy and actual-format verification, bounded resources,
   operation/attempt restart and provider quiescence. Ordinary Storage/client/service
   paths must remain denied; receipt upsert compatibility must remain unchanged.
5. Approve local lossless pending/registered mirror, Account/generation fences and
   durable queue/file staging with offline/device/restart tests. No Source UI before
   the separately applicable UI-foundation/terminology gate.
6. Activate only the selected acquisition/preparation/upload/verification/replacement/
   loss/recovery families after complete local fresh replay, deterministic manifest,
   schema diff, full SQL/security/receipt/financial regression and review. Hosted Dev
   deployment requires separate explicit authorization; Production remains outside scope.
7. Keep purge/redaction/logical delete and all downstream families disabled until
   their policy/protection/schema gates pass independently.

Rollback first closes new command/I/O admission, preserves durable operations and
originals, resolves in-flight/unknown attempts without deleting material, then
revokes only the newly activated entrypoint capabilities. Return guards to disabled
private admission only through reviewed migration/transaction. Never roll back by
dropping populated Source history, deleting bucket objects, reverting accepted
domain facts or restoring mutable receipt upsert to Source. Retained local intent
can remain blocked with explicit status; cached Trip app access stays available.

## S. Risks and blockers

Largest first-slice activation blocker is proving the actual proxy/provider's
create-only behavior, bounded actual MIME/parser validation and post-crash write
quiescence. A timeout or lease is insufficient fencing. Until demonstrated, no
Source upload activation or destructive cleanup is safe to claim.

Purge/redaction are additionally BLOCKED on reviewed retention/erasure permission,
offline/reference holds, tombstone rules and future downstream traversal. This is
an explicit activation deferral, not a guessed legal policy or a reason to redesign
Track A/B/receipts. Dedicated gateway credentials, revocation serialization,
operation schema/digest vectors, local mirror/queue/device acceptance and new
read projections are PENDING implementation/review gates. No secret or remote
access was necessary to produce this contract.

## T. Acceptance matrix

PASS means the document resolves the design case against current local authority;
it is not a runtime test or activation permission. PENDING means a separately
approved implementation/evidence gate. BLOCKED means missing retention/erasure
policy prevents that destructive capability. Totals count rows, not commands.

| ID  | Requirement / evidence                                                                                          | Status  |
| --- | --------------------------------------------------------------------------------------------------------------- | ------- |
| 01  | Exact clean b3fe04b startup/worktree/branch/recent log                                                          | PASS    |
| 02  | One-file design-only scope; protected foundation unchanged                                                      | PASS    |
| 03  | Small V1 and atomic initial Source/revision/original registration                                               | PASS    |
| 04  | Command versions/typed fields/whitelists/errors/offline eligibility (C)                                         | PASS    |
| 05  | Acquisition identity independent of bytes and exact uniqueness (D)                                              | PASS    |
| 06  | Canonical digest/replay intent and immutable IDs (D/F)                                                          | PASS    |
| 07  | Source/Representation/child/operational/local CAS ownership (E)                                                 | PASS    |
| 08  | Lock order and no I/O while holding DB locks (E/G)                                                              | PASS    |
| 09  | Actions insufficiency and bounded receipt schema/atomic results (F)                                             | PASS    |
| 10  | Same-key exact replay, differing-intent rejection, response loss (F/M)                                          | PASS    |
| 11  | Private proxy/create-only scoped object protocol (G)                                                            | PASS    |
| 12  | Actual integrity/MIME/size limits and inline semantics (H)                                                      | PASS    |
| 13  | Append-only replacement, historic LOST material retained (I)                                                    | PASS    |
| 14  | Explicit LOST/identical recovery, no silent resurrection (J/M)                                                  | PASS    |
| 15  | Complete requested crash/interleaving scenarios (M)                                                             | PASS    |
| 16  | Owner+canReadTrip historic reads; additional canWriteTrip for new execution/finalization; dedicated gateway (L) | PASS    |
| 17  | Account A→B→A and local restart/queue/pending intent isolation (N)                                              | PASS    |
| 18  | Camera/Photos/Files and future channels without OCR implication (O)                                             | PASS    |
| 19  | All requested adversarial cases resolved (P)                                                                    | PASS    |
| 20  | Track A/B/downstream/receipt/financial non-interference (Q)                                                     | PASS    |
| 21  | Activation/rollback remains explicit and separately reviewed (R)                                                | PASS    |
| 22  | Actual provider create-only/quiescence + parser/resource tests                                                  | PENDING |
| 23  | New operation migration/digest vectors/CAS/concurrency/security SQL                                             | PENDING |
| 24  | Dedicated gateway provisioning/positive grants/revocation serialization                                         | PENDING |
| 25  | Private Backend routes/read/replay + upload/receipt regression                                                  | PENDING |
| 26  | SQLite/queue/file handling + offline/Account/device acceptance                                                  | PENDING |
| 27  | Fresh full-chain manifests/diff/SQL/financial forward snapshots                                                 | PENDING |
| 28  | Human + independent review                                                                                      | PENDING |
| 29  | Physical purge/Source object orphan cleanup policy and holds                                                    | BLOCKED |
| 30  | Provenance/security redaction, complete traversal and closed tombstones                                         | BLOCKED |

Totals: **21 PASS / 7 PENDING / 2 BLOCKED**. Maximum status remains
**C-I3C CONTRACT COMPLETE — REVIEW PENDING**. No runtime PASS is claimed.

Production accessed: NO. Hosted Dev accessed/mutated: NO.
Migration/code/config changed: NO. Source commands enabled: NO. Bucket mutated: NO.
Sibling worktrees modified: NO. Commit: NO. **STOP.**
