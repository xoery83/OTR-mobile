# Trip Canonical Track C — C-I3A Exact Schema / Access / Redaction Contract

Status: **C-I3A CONTRACT COMPLETE — REVIEW PENDING**.
Date: 2026-10-04 (Pacific/Auckland). Design only; no executable DDL.

Startup: `/Users/xoery/Project/otr-mobile-import`, branch `trip/import`,
HEAD `5537eb6c7e57de13037d9c00d363259e9b0765c8`; clean workspace.
Expected baseline `5537eb6` matched. Recent log, newest first:
`5537eb6`, `489a108`, `6b98e41`, `0191f1e`, `2371fe7`.
Only this document changes. No commit, merge, rebase or sibling worktree change.

## A. Executive contract

Adopt C-I2 strategy C as an exact **proposed** model: ten small record families,
with typed identities/scopes/inputs/targets/results and bounded immutable proposal/
support bundles. This is not ten tables in the first migration. Candidate review
and domain integration come later; the first server foundation has four families.
No separate Artifact, FieldEvidence table, revision UUID, global asset registry,
Source reader-grant list, command bus or temporal registry is needed.

1. Source identity is acquisition identity, independent of hash. One Trip and
   acquiring Account are immutable; repeated acquisition key returns the same Source.
2. Revisions have `(source_id, material_revision)` identity and typed original-ID
   manifests. Representation material and within-Source transformation parents
   are immutable; availability changes never replace content.
3. Private owner-plus-current-Trip-admission governs Sources and rich lineage.
   Associations do not grant access; target visibility has its own authority.
4. Safe target provenance contains one coarse indicator, no sensitive IDs,
   filenames, URLs, uploaders, excerpts, geometry, old values or hidden counts.
5. Field support names typed immutable input bindings. Default accepted-field
   preview uses confirmed material, never Source's new current revision.
6. Use private `trip-source-material` on existing `supabase_storage`, with
   create-only immutable Representation keys and no receipt-bucket changes.
7. Run/Candidate identities and supersession survive restart. Compact payloads
   contain proposals and selected support, not authority or canonical schedule.
8. Confirmation and output slots own immutable reviewed intent and exact result
   correlation. Typed domain mutation+receipt is atomic; C finalization is replayable.
9. Logical delete, unlink, loss, physical purge and history redaction are separate.
   Targets survive every evidence-loss case; pending/history protection is explicit.
10. B-T3A owns accepted temporal/place fields and revisions. Exact TripPerson
    selection remains Track A's responsibility; Source rights use Account identity.

**Decision status:** C-I1/C-I2 are the task's authoritative design baseline.
Exact names, bounds, field layout and disabled-writer rollout below are review
proposals, not permission to implement. PASS certifies coverage, not working ACL,
human acceptance or deployment. B/A documents retain their review/status caveats.

### Baseline references

| Ref | Local authority/evidence |
| --- | --- |
| C0/C1/C2 | [C-I0 audit](TRIP_CANONICAL_C_I0_IMPORT_ARTIFACT_AUDIT.md); [C-I1 contract](TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md); [C-I2 preflight](TRIP_CANONICAL_C_I2_PERSISTENCE_ACCESS_PREFLIGHT.md). C2 E1–E9 identify current byte, receipt, access and replay mechanisms. |
| B1/B2/B3 | [B-T1](TRIP_CANONICAL_B_T1_TEMPORAL_SPATIAL_CONTRACT.md), [B-T2](TRIP_CANONICAL_B_T2_PERSISTENCE_PREFLIGHT.md), [B-T3A](TRIP_CANONICAL_B_T3A_SCHEMA_WRITER_CONTRACT.md), especially B3 B/E/M/N: exact semantic fields, disabled writers, local projection, opaque C references. |
| A1/A2/A3 | [Identity](TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md); [I2A implementation](TRIP_CANONICAL_A1_I2A_REPORT.md); [I2B convergence preflight](TRIP_CANONICAL_A1_I2B_CONVERGENCE_PREFLIGHT.md), H–L: Account generation, retained Persons and observation certificates. |
| E1 | `backend/src/supabaseGateway.ts`, `canReadTrip` / `canWriteTrip`: creator, legacy Member and linked Journey Member admission. Not participation-based authority. |
| E2 | `src/data/files/receiptFileStore.ts`, signature/SHA/copy/verify/normalization; `openReceiptAsset.ts` and `ledgerMaintenance.ts` under `src/data/operations/`: integrity recovery and guarded eviction. |
| E3 | `backend/src/attachmentStorageProvider.ts`: hard-coded `ledger-receipts`, mutable upsert, authenticated read/stat hashing actual bytes; no purge operation. |
| E4 | `src/data/api/ledgerReceiptContracts.ts`; `ledgerReceiptRepository.ts` under `src/data/repositories/`; `src/data/sync/ledgerReceiptSyncWorker.ts`: financial DTO/queue/parent/link/OCR semantics stay separate. |
| E5 | `supabase/migrations/20260912000600_ledger_2_stage_5_2_receipt_assets.sql`: private receipt bucket limits/grants; E1 `executeExpenseCommand` supplies domain-specific replay evidence, not a rich itinerary command. |

Current handoff read first. Repository instructions and previously read mandatory
product/architecture/data/API/offline/environment/legacy-audit/terminology sources
remain applicable; intervening core/infrastructure diffs were checked. No legacy
Web or sibling checkout was reopened. No current Source tables/routes or rich
Trip-domain receipts are claimed. C1's historical missing-B statements are not
the current baseline: B1/B2/B3 are committed here now.

## B. Exact record/table model

### Catalog conventions applying to every field

Proposed physical names are below; no SQL is supplied. All keys are typed and
queryable. PostgreSQL concepts and future SQLite equivalents are specified as
data contracts, not executable declarations.

- **U**: UUID, canonical lowercase hyphenated string on wire/SQLite TEXT; local
  UUID allocation before remote registration. **I**: immutable identity/input.
- **R**: safe bigint/integer `1..9007199254740991`; SQLite INTEGER. No wrap/reuse.
  **MAX** below is exactly 9007199254740991.
- **T**: `timestamptz(6)` operational time; SQLite exact UTC TEXT with six fractional
  digits. Not Track B business time or a fabricated document capture timestamp.
- **H**: TEXT exactly 64 lowercase hexadecimal SHA-256 characters. **K**: TEXT
  1–128 ASCII characters `[A-Za-z0-9._:-]`, opaque operation key, never document text.
- **S(n)**: TEXT max n Unicode scalar values; unknown remains null, not empty
  placeholder. Byte limits for payloads apply after UTF-8 encoding.
- **J(n)**: strictly validated version-1 JSON payload ≤n encoded bytes; SQLite
  validated TEXT. Only proposal/support bundles use this type. Unknown keys or
  unsupported versions reject, never strip-and-adopt. J is not authority.
- **M**: mutable; **O**: operational state. Both use the single CAS owner below; no
  ordinary direct update. Historical I-field redaction exceptions in N use that
  same owner.
- **P**: private acquiring-Account Source projection. **C**: private Confirmation
  Actor projection, additionally filtered for each Source support. **A**: internal
  admitted adapter only; no raw client projection. **V**: safe target projection H.
- **L**: exact Account-scoped future SQLite mirror required. **D**: device-only
  local extension, never server content. No default value unless explicitly stated.

Every field row includes required/null/default and authority/change classification.
Table scope/ACL, row lifecycle/uniqueness and retention are defined in its section
and N; those rules apply to **all** fields, including IDs, hashes and timestamps.
No field is public by omission. Required means nonnull after admitted server
registration; local unsent pending state is explicitly distinguished in O.

| Exact proposed family | Primary identity | Scope and role; future local name/mirror |
| --- | --- | --- |
| trip_sources | id | Trip/acquiring Account root; same local name, P/L. |
| trip_source_revisions | source_id + material_revision | Inherits Source; immutable captures, P/L. |
| trip_source_representations | id | Inherits Source; exact material/availability, P/L. |
| trip_source_actions | id | Append-only bounded lifecycle record, inherits Source, P/L. |
| trip_source_associations | id | Source + typed target; full row P, only V summary without Source rights; L. |
| trip_source_runs | id | Actor/Trip/input-set scope, private P; L. |
| trip_source_candidates | id | Run-owned immutable proposal, inherits Run admission, P/L. |
| trip_source_confirmations | id | Actor/Trip immutable intent identity and operation state, C/L. |
| trip_source_inputs | id | Exact Source/revision/Representation pin under either Run or Confirmation; P/C/L. |
| trip_source_output_slots | confirmation_id + slot_id | Immutable intent/result correlation, C/L; slot_id globally unique U for evidence addressing. |

Actions are justified by retained unlink/relink/delete/purge history rather than
one mutable latest timestamp. Inputs are shared **only between two bounded uses**,
Run and Confirmation, to avoid two identical pin tables. This is not a polymorphic
business-action framework. FieldEvidence is an immutable keyed bundle in its
output slot plus typed input rows, not a new family per field/token.

### Mutation concurrency/CAS ownership

Each mutable field family has exactly one owner; child rows do not acquire an
implicit revision. This also governs N's exceptional redaction of I fields.

| Field family | Exact CAS owner |
| --- | --- |
| Source lifecycle/current pointer/retention/redaction | Own `trip_sources.row_revision`. |
| Material revision retention/capture redaction | Parent `trip_sources.row_revision`. |
| Representation remote availability/verification/retention/redaction | Own `trip_source_representations.row_revision`. |
| Association lifecycle/inactive tuple | Own `trip_source_associations.row_revision`. |
| Run execution/completion/error/supersession/retention/redaction | Own `trip_source_runs.row_revision`. |
| Candidate retention/proposal redaction | Parent `trip_source_runs.row_revision`. |
| Confirmation state/retention/intent redaction | Own `trip_source_confirmations.row_revision`. |
| Output-slot state/dispatch/result/receipt/finalization/failure/retention/redaction | Parent `trip_source_confirmations.row_revision`. |
| Input exceptional integrity redaction | Parent Run `row_revision` when `run_id` is set; parent Confirmation `row_revision` when `confirmation_id` is set (exclusive owner). |
| Device-only registration and Representation availability/transfer tuple | Local operational state-machine CAS specified below. |
| Local review-draft mutable payload/input observation/time | Own local `trip_source_review_drafts.row_revision`. |

**Numeric CAS:** lock the named owner row, compare the supplied expected revision,
then lock affected children in stable identity order and validate admission/prior
state before changing them. Parent-owned changes increment the parent exactly
once per transaction, including a command changing both parent and multiple
children; own-row changes increment each changed owner exactly once. No-op and
identical operation replay return the recorded result without increment. Stale
revision rejects; never silently substitute the current version. Revision overflow
rejects. Multi-owner commands lock Sources, Representations, Associations, Runs,
then Confirmations, each in stable identity order; acquire all required owner/
admission locks before child locks.
The existing exact operation key/digest binds retry to the original intent and
result; no new operation ledger is implied. Actions are append-only, committed
atomically with the affected mutation, and require no mutable CAS of their own.

Representation upload verification, MARK_LOST, LOST recovery, purge and redaction
all compare its own revision and expected prior availability/retention tuple.
Integrity proof binds exact Representation/content and that observed revision;
a delayed proof cannot set VERIFIED after a newer LOST/purge/redaction transition.
Recovery requires LOST and retained authorized material; PURGE_PENDING,
PAYLOAD_PURGED and IDENTITY_ONLY fence verification/recovery admission. Source
lifecycle is locked/rechecked for admission without incrementing Source solely
for a Representation mutation. Physical I/O occurs outside metadata transactions:
N's pending-work protection must remain until every admitted upload/recovery is
quiescent or proven terminal before physical purge. Unknown/in-flight I/O blocks
purge; metadata CAS alone cannot prove removal or prevent a late object write.
A stale I/O completion cannot refresh its revision and resurrect material.

Run publication locks/checks the Run revision and expected PENDING/RUNNING state,
with exact operation/input/extractor binding; Candidate insertion and READY/result
fields commit together with one Run increment. READY identical replay returns
original outputs; differing output rejects. Generation allocation remains serialized
within the exact scope; setting `superseded_by` also uses the affected Run's CAS.
Late completion may publish historical results only through a freshly admitted
checked transition preserving supersession, never a blind rebase or active-run
replacement. Redacted execution identities cannot republish.

Slot transitions lock/check the Confirmation revision, affected slot's complete
prior operational tuple and immutable slot/domain-operation/digest binding.
Different slots serialize at that header. Persist OUTCOME_UNKNOWN/dispatch before
external handoff; no network call holds the database lock. Verified receipt/result
assignment and C-only association/support finalization each commit their matching
derived header state under one parent increment per transaction (whether combined
or separate); changed Associations additionally use their own CAS.
Verified result tuples are write-once. Stale receipt delivery rereads/revalidates;
identical recorded outcome is replay, never another domain execution or new key.
Failed finalization rolls back its C transaction; recording PENDING/BLOCKED requires
a fresh checked transaction, preserving any already recorded domain outcome.

**Local operational CAS:** one Account-scoped SQLite write transaction (the local
row-lock equivalent) compares the complete expected prior registration/availability/
transfer tuple and exact idempotent operation identity: existing `sync_operations`
ID/key plus immutable entity/content binding for queued work; local-only actions
use their existing Source Action operation key/binding, and mirror registration
uses the exact accepted server operation/result identity and revision. Replays are neutral; Account/
Trip/generation must still match at commit. Server mirror application compares the
accepted server revision and cannot overwrite newer observations. Device-only
state changes never increment a mirrored server revision.

No existing table/schema names are repurposed. Root Trip is `trips.id`; acquiring/
Actor Account is Auth User UUID. Proposed root references use **RESTRICT**, not
CASCADE, for Trip/Account physical deletion. Source/history child references also
retain identities, not automatic deletes. This intentionally blocks destructive
Trip/Account removal while Source history exists until a separately admitted
teardown/redaction policy; it is a compatibility review gate, not a modification
made here. No Auth/Member/financial cascade is rewritten by this document.

## C. IDs/keys/versioning

Source, Representation, Run, Candidate, Confirmation, Input, Association, Action
and output slot IDs are independently allocated UUIDs; identical raw UUID text
does not permit cross-kind lookup. Receipt IDs never alias Source IDs. Material
revision uses Source+R, not UUID/hash/updated_at. Operational row revisions are
independent of material revision, run generation and domain semantic revision.

| Uniqueness / replay binding | Exact rule |
| --- | --- |
| Source acquisition | Unique `(trip_id, acquired_by, acquisition_key)`; same immutable acquisition_sha256 returns original id, different digest rejects. Different keys deliberately create separate Sources even for same bytes. |
| Source revision | Unique `(source_id, material_revision)`; replacement requires exact current Source row_revision/current material revision and adds one capture. |
| Representation | id unique; immutable Source/content/lineage binding. No uniqueness on payload hash. |
| Source action | Unique `(source_id, actor_account_id, operation_key)`; action type/identities/bound revisions/digest must match on replay. |
| Association | One active `(source_id, target_kind, target_id, purpose)`; Source supplies Trip. New explicit link operation records its result through Action. Concurrent same tuple converges, not duplicate links. |
| Run | Unique `(trip_id, actor_account_id, operation_key)` and `(trip_id, actor_account_id, scope_sha256, generation)`; exact input/extractor digest immutable. |
| Candidate | id globally unique; `(run_id, candidate_key)` unique opaque K, not UI array position. |
| Input | id unique; unique owner+source/material revision/Representation tuple; same tuple in another owner has another binding ID. |
| Confirmation | Unique `(trip_id, actor_account_id, confirmation_key)` + immutable intent_sha256. |
| Slot | Globally unique slot_id; unique `(confirmation_id, slot_key)` K. Domain operation uniqueness includes domain/Trip/Actor/operation key and intent digest. |

Acquisition digest binds Source ID, Trip, acquiring Account, kind, actual initial
manifest/material descriptors and acquisition key; it is not merely content hash.
Confirmation digest binds the complete ordered slots and input pins/decisions,
not operational retry fields. Draft key cannot be reused for changed intent.

**`otr-source-encoding-v1`:** for compact payload/hash envelopes, encode UTF-8
JSON with no whitespace, fixed documented root field order or ascending Unicode
scalar-value object keys recursively, preserved string content (no trimming or
Unicode normalization), escaped controls/quotes/backslash, integer base-10 tokens,
no negative zero/nonfinite numeric tokens. Proposal noninteger values use exact
decimal strings at the C envelope boundary, validated/converted by the B adapter
without changing B's accepted numeric type. Arrays preserve order unless defined
as sets; UUID sets sort canonical strings and reject duplicates. All digest recipes
name version and fields; absent optional fields serialize explicit null in bound
envelopes. Wire order alone is not identity. No arbitrary raw model JSON can be
hashed and treated as reviewed intent.

**FieldEvidence address:** `track-c/field-evidence/<slot-uuid>/<field-key>`.
Field key is 1–128 ASCII `[A-Za-z0-9_.:-]` and is approved by the specific domain
adapter (e.g. `ORIGIN.local_time`), never an arbitrary mutation path. No escaping
or external URL accepted; full reference ≤512 characters, matching B3 N.
The immutable slot support bundle has exactly that key, its input pins and
decision/result binding. A reference can be prepared before domain commit, but
is admitted only for the exact prepared slot operation/Actor/Trip/accepted value
binding. Its mere existence never grants writer authority or asserts success.

## D. Source/material revision

### trip_sources

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| id | U required; locally allocated, no server-generated substitute | I acquisition; P/L. |
| trip_id | U required; no default | I existing Trip; no moves; P/L. |
| acquired_by | U required; no default | I authenticated acquiring Account, not Person; P/L. |
| acquisition_key | K required; no default | I acquisition replay; P/L. |
| acquisition_sha256 | H required; no default | I exact initial acquisition envelope; P/L. |
| source_kind | S(16) required: FILE / IMAGE / TEXT / URL / EMAIL | I actual supplied input kind, not classification of business output; P/L. |
| acquisition_channel | S(16) required: FILES / CAMERA / PHOTOS / PASTE / URL_CAPTURE / EMAIL_INPUT / COPY | I known acquisition action; future acquisition adapters disabled until approved; P/L. |
| captured_at | T nullable; default null | I supplied/observed capture instant only; no invented original document time; P/L. |
| capture_time_basis | S(16) required: OBSERVED / SUPPLIED / UNKNOWN | I; UNKNOWN iff captured_at null; other values require it; P/L. |
| created_at | T required; admitted server clock | I registration time, separate from capture; P/L. |
| access_mode | S(16) required; only OWNER_PRIVATE, default OWNER_PRIVATE | I V1 policy, not caller-granted role; P/L. |
| lifecycle | S(16) required: ACTIVE / DELETED; default ACTIVE | M lifecycle authority, no ordinary undelete; P/L. |
| current_material_revision | R required; admitted initial value 1 | M exact capture pointer, only append+CAS replacement; P/L. |
| row_revision | R required; starts 1 | M +1 on lifecycle/current-pointer change, no automatic timestamp version; P/L. |
| retention_state | S(24) required: RETAINED / IDENTITY_ONLY; default RETAINED | M only admitted explicit metadata redaction, increments row_revision; P/L. |
| deleted_at | T nullable, default null | M present iff DELETED; server clock; P/L. |
| deleted_by | U nullable, default null | M present iff DELETED, actor Account; P/L. |

Source root always has initial revision/Representation descriptors when registered;
deferred same-transaction validation resolves root/current manifest circularity.
Unassociated and unprocessed Sources remain valid. V1 does not persist unassigned
Sources: Account-owned staging is local until Trip selection. Source kind/channel
compatible pairs are FILE/FILES, IMAGE/CAMERA|PHOTOS|FILES, TEXT/PASTE,
URL/URL_CAPTURE, EMAIL/EMAIL_INPUT; COPY preserves supplied material kind and
records explicit origin pin in the new revision. No name/hash-based merge.

### trip_source_revisions

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| source_id | U required; Source reference | I inherits Trip/owner; P/L. |
| material_revision | R required; first 1, later previous+1 | I capture identity; P/L. |
| previous_revision | R nullable; null for 1, otherwise material_revision−1 | I same-Source prior capture; P/L. |
| created_at | T required; admitted server clock | I revision registration; P/L. |
| created_by | U required; equals Source.acquired_by V1 | I actor; P/L. |
| operation_key | K required; no default | I acquisition or replacement key; unique per Source, replay exact capture_sha256; P/L. |
| capture_sha256 | H required | I digest of version/source/revision/typed original IDs/completeness/replacement/origin fields; P/L. |
| original_representation_ids | U array required; 1–64 distinct sorted IDs | I capture manifest, all same Source and captured originals, no JSON/derived entries; P/L. |
| completeness | S(24) required: AS_SUPPLIED / PARTIAL_CAPTURE | I no promise that entire website/email was acquired; P/L. |
| reason | S(24) required: ACQUISITION / REPLACEMENT / REFRESH / ADD_PART / SAVED_TEXT_EDIT / AUTHORIZED_COPY | I user/admitted capture action; first ACQUISITION or AUTHORIZED_COPY, later other four; P/L. |
| origin_source_id | U nullable, default null | I optional explicit copy origin, never dedup inferred; P/L. |
| origin_material_revision | R nullable, default null | I paired with origin_source_id, requires actual authorized retained origin; P/L. |
| retention_state | S(24) required: RETAINED / IDENTITY_ONLY; default RETAINED | M parent Source row_revision CAS; explicit reviewed redaction only, IDs/replay facts retained; P/L. |

Typed UUID-array manifest avoids a part table for a small immutable capture.
Future fixed validation checks **every** member's same-Source/original identity,
origin revision existence and access, duplicate/count bound, sorted encoding and
referenced-record immutability. It must inspect full scope under an internal
read-only validation context, not client RLS-hidden subsets. Identity rows are
not ordinarily physically deletable, so manifest membership cannot dangle through
delete. If a later independently approved teardown removes them, it must preserve
unavailable IDs/markers and invalidate active capture claims explicitly.

Replacing PDF, refreshing URL, saving text edits or adding email attachment
creates new material revision and new changed Representations. A manifest can
reuse earlier original IDs of the same Source for unchanged parts; introduced
revision cannot be greater than the manifest revision. Never overwrite old text,
manifest, capture digest or field evidence. No auto-extraction/confirmation from
a new current pointer. Cross-Trip copy needs explicit origin authorization and a
new Source; it is not an owner/Trip move or sharing shortcut.

## E. Representation/storage

### trip_source_representations

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| id | U required, allocated before material commit | I Representation identity; P/L. |
| row_revision | R required; starts 1 | M own CAS, +1 per admitted availability/retention/redaction transaction; replay neutral; P/L. |
| source_id | U required | I inherits Trip/acquiring Account; P/L. |
| introduced_revision | R required, references same Source capture | I first capture that introduced material; P/L. |
| role | S(16) required: ORIGINAL / DERIVED | I captured versus transformed; P/L. |
| material_kind | S(16) required: BINARY / TEXT / LOCATOR | I representation format, not Artifact root; P/L. |
| original_filename | S(255) nullable, default null | I supplied filename only; P/L. |
| part_key | S(128) nullable, default null | I supplied email attachment/body/page designation; no fabricated page identity; P/L. |
| mime_type | S(128) nullable | I required BINARY, null TEXT/LOCATOR; binary allowlist below; P/L. |
| encoding | S(16) nullable | I UTF-8 for TEXT/LOCATOR, null BINARY; P/L. |
| payload_sha256 | H required while material retained | I exact payload integrity; null permitted only through explicit IDENTITY_ONLY redaction, never normal loss; P/L. |
| byte_count | safe bigint 0..MAX required while material retained | I exact digest-input bytes, BINARY >0; TEXT can be empty, locator nonblank; null only identity-only redaction; P/L. |
| text_content | TEXT nullable; ≤262144 encoded bytes | I TEXT payload; present iff retained TEXT, no trimming; P/L. |
| locator_uri | S(4096) nullable; ≤16384 encoded bytes | I retained LOCATOR payload, explicit supplied http/https URI; no fetched-content claim; P/L. |
| parent_ids | U array required; default empty | I ORIGINAL empty; DERIVED 1–16 distinct sorted same-Source IDs, acyclic and prior retained descriptors; P/L. |
| transform_key | S(128) nullable | I required DERIVED, null ORIGINAL; identifies actual transformation, no engine chosen; P/L. |
| transform_version | S(128) nullable | I required DERIVED, null ORIGINAL; P/L. |
| transform_options_sha256 | H nullable | I required DERIVED, null ORIGINAL; empty options have an explicit canonical digest; P/L. |
| regenerability | S(16) required: NOT_APPLICABLE / POSSIBLE / IMPOSSIBLE | I ORIGINAL NOT_APPLICABLE; DERIVED explicit possible/unknown treated IMPOSSIBLE until justified; P/L. |
| created_at | T required, admitted clock | I material descriptor registration; P/L. |
| storage_provider | S(32) nullable | I BINARY only, exactly supabase_storage when server registered; null nonbinary; P/L. |
| storage_bucket | S(64) nullable | I BINARY only, exactly trip-source-material; null nonbinary; P/L. |
| object_key | S(256) nullable | I BINARY server key recipe below, required registered descriptor even before upload; null nonbinary; P/L. |
| remote_state | S(24) required: PENDING / VERIFIED / LOST / PURGED / NOT_APPLICABLE | O own row_revision CAS; BINARY starts PENDING, TEXT/LOCATOR NOT_APPLICABLE; P/L. |
| verified_at | T nullable, default null | O own row_revision CAS with remote_state; last actual proof persists when lost/purged, VERIFIED requires it; P/L. |
| retention_state | S(24) required: RETAINED / PURGE_PENDING / PAYLOAD_PURGED / IDENTITY_ONLY | M own row_revision CAS; explicit rules N, default RETAINED; P/L. |

Binary allowlist V1: `application/pdf`, `image/jpeg`, `image/png`, `image/heic`,
`image/heif`. The private bucket cap is **52,428,800 bytes (50 MiB)**; an admitted
PDF is additionally bounded **10,485,760 bytes (10 MiB)**. These are proposed
Source admission limits, independent of Expense's normalized 15 MiB limit. Source
images are retained unchanged; no 2200-pixel resize/JPEG replacement. Signature,
declared-type, size and safe decode/resource checks must precede processing;
signature recognition alone does not certify parser safety. MIME expansion needs
separate approved validation, not a client-supplied MIME wildcard. No PDF/image
library selected. Text/locator descriptors have no binary upload/filename substitute.

Local and server digest is SHA-256 of exact original bytes, UTF-8 text bytes or
UTF-8 locator string bytes. No URL canonicalization that changes acquired input.
Multipart email Source can have original body TEXT and attachment BINARY, plus
optional full supplied message TEXT; do not accept opaque `.eml` binary through
an unsupported MIME or fabricate headers. Attachment part provenance remains
separate. URL capture has LOCATOR and actual captured TEXT/BINARY; a bare URL is
not an extraction input containing page contents.

**Private bucket policy:** `trip-source-material`, public=false, allowed binary
MIMEs exactly above, cap 50 MiB; existing provider only. Exact key:
`v1/<trip-uuid>/<source-uuid>/<representation-uuid>/payload`.
No filename, Account name, hash or URL in the path. Backend derives/validates
scope; caller cannot select bucket/path/provider. Unique `(bucket,object_key)`;
metadata/integrity bound before upload. No direct anon/authenticated Storage
list/read/write/delete or metadata-table grants. Service-backed Source routes
authorize first, not through receipt grants. Raw object locator is P, not V.

**Immutable upload:** create-only, no upsert for Source objects. Concurrent upload
replay encounters existing object: read/stat exact size/MIME/hash and return
success only for identical registered material. Mismatch rejects and quarantines
availability; never overwrite/delete-and-replace automatically. Lost/PURGED
identity cannot silently receive new material; explicit authorized recovery may
re-upload identical bound bytes for LOST only, verified under same descriptor.
PURGED requires new Representation/capture for any restored material. Immutable
metadata and trusted write admission plus create-only storage prevent overwriting
behind a stable ID; completion verification is not a substitute for that rule.
No signing/public URL design or purge function is implemented here.

Representation presence constraints treat RETAINED/PURGE_PENDING as material still
present: TEXT requires text_content, LOCATOR locator_uri; PAYLOAD_PURGED removes
those payloads but retains integrity descriptors. IDENTITY_ONLY follows N's exact
redaction exceptions. TEXT/LOCATOR remote_state remains NOT_APPLICABLE after
inline purge; retention_state records the loss without fake binary upload state.

## F. Shared byte seam

| Existing mechanism | Exact future boundary | Receipt behavior preserved |
| --- | --- | --- |
| SHA (`receiptBytesSha256`, Expo/server crypto) | Reuse digest logic directly; neutral helper move only with unchanged semantics. | IDs remain financial; no hash merge. |
| Signature/owned copy (`receiptFileStore`) | Extract byte sniff/size/hash and caller-bound owned copy/verify; Source supplies own Account root, limits and exact original retention. | Keep ledger-receipts/drafts, receipt MIME aliases/errors/limits unchanged. |
| Storage provider PUT/read/stat | Shared trusted bucket-bound byte implementation; existing receipt wrapper keeps old bucket/upsert behavior, Source wrapper is create-only. | No provider/bucket/path/ACL change for receipts. |
| Recovery/eviction | Shared verification/owned-path mechanics only; each caller supplies authorized fetch and protection predicate. | Receipt payment/tombstone/table/quota rules untouched. |
| Leases/retry | Reuse existing sync infrastructure ownership/failure/backoff patterns later; no receipt SQL operation reuse. | Receipt queue/Expense parent wait/link worker unchanged. |
| Normalization/OCR/DTO/ACL | Not Source originals, proposal schema or admission. Optional derivative can use approved native operations later. | Existing receipt normalization, OCR review and financial read grants retained. |

Exact local namespaces proposed: persistent owned originals under
`document/trip-source-material/<account-uuid>/<trip-uuid>/<representation-uuid>/payload`;
owned staging under `document/trip-source-staging/<account-uuid>/<acquisition-uuid>`;
verified duplicate caches under `cache/trip-source-material/<account-uuid>/<representation-uuid>`.
No `resolveReceiptFile` basename fallback into receipt storage. Owned-path check
must match the expected Account/Trip/Representation root, including canonical
path containment; no caller arbitrary path may be deleted/uploaded as owned.
Copy before temporary picker URI expires, retain original until metadata commit;
filesystem staging and SQLite commit are not claimed one atomic transaction.

This is the smallest shared seam, not new uploader/provider/queue framework.
Later executable extraction of primitives needs existing receipt tests plus
Source isolation/immutable write checks. No file is refactored in C-I3A.

## G. ACL matrix

V1 owner-private condition: active Actor Account equals Source.acquired_by and
existing backend `canReadTrip` for exact Trip. Writes additionally require current
`canWriteTrip` and specific lifecycle/action checks. These current predicates
include creator/legacy/linked-Member paths (E1); no new role or participation
predicate is added. Current authority suffices for this restricted V1. A new
revoke/deny policy or other-uploader collaboration is a separate dependency.

| Resource/action | Required admission | Raw projection |
| --- | --- | --- |
| Canonical target value | Owning-domain read authority | Domain target DTO; C never extends its readers. |
| Safe target provenance | Same target read authority | H safe indicator only if summary exposure permitted. |
| Source root/revision/Representation, raw material | Owner+Trip read; ACTIVE for active material routes | P fields; no association-derived rights. |
| Historic private material/lineage | Owner+Trip read, retention policy permits remaining content | Filtered P/C; DELETED does not publish content. |
| Source acquire/replace/delete/upload/derive/purge | Owner+Trip write plus exact version/integrity/protection checks | P; identity-bound Actor derived server-side. |
| Run/Candidate | Run.actor=Actor, Trip read, each selected Source owner-read | P; completed results cannot publish into another Account's run. |
| Confirmation/slots/inputs | Confirmation.actor=Actor and Trip read; sensitive support needs Source read and target read when present | C, not whole bundle through target ID. |
| Confirmation dispatch | Actor has all input rights, current version/run selection and owning-domain mutation authority | Internal A, no client generic mutation. |
| Association create/unlink | Source owner+Trip admission and target evidence-action authority; mutation also requires Source Trip write | Full P only; no right to delete Source from target ownership. |
| Target deletion cleanup | Domain-authorized internal cleanup with exact target/Trip binding | A; no private Source IDs/material returned to deleter. |
| Receipt replay/result lookup | Owning-domain receipt read and C actor/correlation binding | C filtered; original success is not a new execution permission. |

Target collaborator unable to read a Source cannot confirm using its candidates.
They may author independent domain changes, without private source refs. Multi-
Source V1 inputs therefore share acquiring Actor; no implicit grant, Person link,
full-group participation or email-name match. Source deletion does not invalidate
already committed target authorization/truth.

**Database/write envelope:** future Source tables have enabled+forced RLS and
no PUBLIC/anon/authenticated direct privileges/policies; Storage likewise private.
Backend service access is internal trusted I/O, not client permission. Reserve
private database execution identity `otr_trip_source_writer` (NOLOGIN,
NOINHERIT, NOSUPERUSER, NOBYPASSRLS, no API membership), with commands/grants
disabled in the first foundation. This is a database capability, **not a Track A
product role**. Hybrid invariant guards reject ordinary service-role identity/
material/result rewrite and deletes/truncate; future narrow commands admit exact
fixed mutations through actual execution identity, never caller JWT/GUC flags.
Read-only validators may inspect full referenced identities without granting writes.

Service SELECT may support backend filtering, but runtime DML must use admitted
Source operations, not service-role bypass. Future command grants/read-only
validators get fixed search paths and no arbitrary SQL. Record scopes derive from
fixed parents, checked on both sides/referenced-key changes; immutable parent
Trip/owner prevents reparenting. Trusted administrative DDL/reset is outside
runtime guard guarantees, not a client exception. No such role/policy is created
here. No new access freshness feed/cursor is invented.

## H. Redacted projections

Explicit level separation:

| Level | Exact response contract |
| --- | --- |
| 1 Canonical target | Owning-domain allowed current values only; C cannot expose extra values. |
| 2 Safe provenance | Object with only `evidence_state`: NONE / RESTRICTED / AVAILABLE / UNAVAILABLE, or no evidence object if target policy forbids any indicator. No extra keys. |
| 3 Sensitive provenance | Authorized field reference/target revision/origin, selected proposal and allowed support details only after checks G; per-support filtering and retention markers mandatory. |
| 4 Raw Source/Representation | Authorized P material/metadata, never obtained through level2 expansion. |

Target DTO serialization must also suppress protected C reference strings inside
B's provenance_refs/spatial_provenance_refs/timing_provenance_ref and any domain
receipt expansion. They are lineage, not canonical value permission. Internal
B storage keeps its admitted references; a target-visible transport/Stay DTO may
return its allowed accepted components with only H's coarse summary. Merely
filtering the dedicated C endpoint while exposing raw B provenance maps is forbidden.

Level2 precedence for an allowed target: if any relevant support is hidden by
Source/retention policy, **RESTRICTED**, without number or mixed-support detail;
otherwise AVAILABLE if all selected material is accessible, UNAVAILABLE if
known linked evidence is unavailable, NONE if no permitted relationship/history
exists. Account without Source rights never learns hidden material availability,
capture kind, counts or “revision2 arrived”; RESTRICTED remains the same before
and after hidden replacement/purge. Target policy may suppress level2 entirely
where even evidence existence is sensitive. This is not a public share feature.

Explicit exclusions for level2: Source/Representation/Run/Candidate/Input/
Confirmation/slot/Action IDs, filename, URI/storage key/provider, uploader,
booking reference, traveller name, address/excerpt, geometry, raw confidence,
hidden counts, historic proposal/value/digest/time. Current canonical booking
reference visible under target policy does not entitle its historic extracted
value. No IDs in links, analytics attributes, ETags or error messages.

Sensitive detail returns a selected field, not the whole Confirmation payload.
Its `origin` is USER_ENTERED / ACCEPTED_EXTRACTED / EDITED_EXTRACTED; value
history is visible only if target and all relevant Source policy permit it.
Source descriptors/input pins remain protected even when bytes were purged.
Partial rights do not permit revealing the remainder through array lengths or
aggregate errors. Authorized support selection may show only explicitly requested
visible entries, not a hidden-count placeholder.

Lists/discovery/pulls filter **before** paging/counting; cursor tokens are opaque
Account-scoped operational tokens, not raw Source identifiers for target viewers.
Do not add Source events to shared Ledger feeds. Replays/results/errors apply the
same projection rules as normal reads. Unauthorized Source lookup returns the
same 404-style not-available response as absent Source; bad authenticated payload
validation may disclose schema rules but not private existence. Source error
codes are bounded machine outcomes, no provider body/filename/URI. Avoid material
values and IDs in routine diagnostics; safe internal correlation is restricted.

Local safe target cache stores only level2, separately from private P/C tables.
Network context captures Account/Trip/generation **before** credentials/request,
checks again before applying and at transaction commit, including A→B→A. Another
Account cannot inherit protected rows, response, cursors, URIs or command results.
Unprivileged clients cannot request “include provenance” to bypass filtering.

## I. Association/revision pinning

### trip_source_associations

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| id | U required | I relationship identity; P/L, never V. |
| source_id | U required | I logical Source, inherits Trip/owner; P/L. |
| target_kind | S(32) required: ITINERARY_EVENT / ITINERARY_RESERVATION | I typed resolver namespace; no arbitrary table/string; P/L. |
| target_id | U required | I canonical existing target ID in same Trip; P/L. |
| purpose | S(32) required: ATTACHED_EVIDENCE / CONFIRMED_SUPPORT | I explicit semantics, not financial liability; P/L. |
| state | S(16) required: ACTIVE / INACTIVE; default ACTIVE | M action authority; P/L. |
| row_revision | R required; starts 1 | M +1 per admitted lifecycle change, identical replay neutral; P/L. |
| created_by | U required | I original link Actor; Source owner V1; P/L. |
| created_at | T required | I admitted clock; P/L. |
| confirmation_id | U nullable, default null | I required CONFIRMED_SUPPORT; optional for standalone attach Action; same Actor/Trip; P/L. |
| preview_input_id | U nullable, default null | I exact Confirmation Input for link-only preview when provided; P/L. |
| preview_source_revision | R nullable, default null | I exact selected same-Source revision for standalone/link-only preview; paired with preview_representation_id; P/L. |
| preview_representation_id | U nullable, default null | I member of selected capture or authorized derivative; P/L. |
| inactive_reason | S(24) nullable, default null: UNLINK / SOURCE_DELETE / TARGET_DELETE | M present iff INACTIVE; P/L. |
| inactive_at | T nullable, default null | M present iff INACTIVE; P/L. |
| inactive_by | U nullable, default null | M explicit action Actor; target-delete cleanup records initiating domain Actor; P/L. |

Association target kind is bounded to **existing identities** only. Neither kind
has an activated C adapter today. ITINERARY_EVENT may support future B commands;
ITINERARY_RESERVATION initially evidence-link-only after its domain admission
contract, never a competing schedule owner. Booking, Note, Credential and Pool
canonical targets require later explicit kind/adapter approval; do not fabricate
their tables now. Proposal kinds below may retain unresolved heterogeneous intent
without assigning it a nonexistent canonical target.

New standalone link must supply preview revision/Representation; link-only
Confirmation additionally pins an input and all three values agree. CONFIRMED_SUPPORT
default material comes from current field's slot support, not a mutable preview
pointer. Multiple supports remain selectable explicitly. Replacing Source leaves
logical association unchanged; fields and preview bindings never auto-advance.
If supporting old bytes disappear, preview is unavailable, not Source.latest.
Source detail separately shows latest capture under Source rights.

Unlink deactivates one relation, records Action, keeps target/Source/history.
Relink uses new action/key and either reactivates same identity without rewriting
its immutable binding, or creates a new association identity for new purpose/
preview; historical old row remains. A changed preview requires new relation
intent, not silently updating old pins. Current active uniqueness applies across
old/new rows. Confirmed field origin remains historical even after unlink.
Source logical delete deactivates active links; target delete deactivates only
its links. Neither cascades target/source material. Actual target deletion is
subject to domain guards (B3 currently rejects canonical event deletion).

## J. Run/Candidate/Evidence

### trip_source_runs

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| id | U required | I Run identity; P/L. |
| row_revision | R required; starts 1 | M own CAS for operational state, child redaction and publication; +1 per transaction, replay neutral; P/L. |
| trip_id / actor_account_id | U required each | I exact admitted scope; Actor owns every V1 Source input; P/L. |
| operation_key | K required | I extraction request replay; P/L. |
| scope_source_ids | U array required, 1–64 sorted distinct Sources | I stable input set, all same Trip/owner; P/L. |
| scope_sha256 | H required | I SHA of encoding/version/Trip/Actor/Source-ID set; no material version in scope; P/L. |
| generation | R required | I monotonic serialized allocation per scope; first 1, +1; P/L. |
| input_sha256 | H required | I exact sorted input descriptors/version/hash/transform binding; P/L. |
| extractor_key / extractor_version | S(128) required each | I actual engine/config identifiers, no provider selected; P/L. |
| extractor_options_sha256 | H required | I exact approved configuration binding, not raw model response; P/L. |
| state | S(16) required: PENDING / RUNNING / READY / FAILED; default PENDING | O execution; READY includes zero Candidates; P/L. |
| superseded_by | U nullable, default null | M newer same-scope Run only, not state overwrite of accepted history; P/L. |
| created_at | T required | I registered clock; P/L. |
| completed_at | T nullable, default null | O required READY/FAILED; P/L. |
| error_code | S(32) nullable, default null | O required FAILED; bounded SOURCE_FAILURE / UNSUPPORTED_INPUT / EXTRACTOR_FAILURE / CANCELED; null other states; P/L. |
| retention_state | S(24) required RETAINED / IDENTITY_ONLY; default RETAINED | M authorized payload redaction only; P/L. |

Every Run M/O field uses its own row_revision CAS in B; Candidate retention and
Run-owned Input redaction use that same parent revision.
Inputs/candidates publish atomically with READY; no half-run appears complete.
Publication is once per Run: identical READY result replay returns the original
Candidate IDs/digests; changed result under that Run rejects. No Candidate append
or proposal rewrite after READY. Transient execution retry is worker-owned before
terminal publication; a terminal FAILED run requires a new Run for reprocessing.
Pending→running→ready/failed; retry of admitted same run can resume pending/running
under existing work ownership, immutable inputs unchanged. Reprocessing/new
configuration creates new run/generation. Superseded late completion remains
historical, cannot replace newer selected run. Scope generation is not a global
Source counter or target revision. Different overlapping Source sets require review.

### trip_source_inputs

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| id | U required | I stable material pin; P/C/L. |
| run_id | U nullable, default null | I exactly one of run_id/confirmation_id nonnull; P/L. |
| confirmation_id | U nullable, default null | I alternate bounded owner; C/L. |
| source_id | U required | I exact Source, owner Trip/Actor matches; P/C/L. |
| material_revision | R required | I same-Source capture manifest; P/C/L. |
| representation_id | U required | I captured member or authorized derivative of manifest members; P/C/L. |
| payload_sha256 | H required | I captured exact integrity binding; P/C/L, retained privately after byte loss. |
| byte_count | safe bigint 0..MAX required | I exact input integrity length; P/C/L. |
| observed_source_row_revision | R required | I Source lifecycle/current-pointer observation at request or renewed review; checked before dispatch; P/C/L. |
| historical_selection | boolean required, default false | I true only explicit reviewed older-capture selection; current Source row observation must still match; P/C/L. |

N's exceptional Input hash/length redaction uses only its exclusive Run or
Confirmation parent row_revision CAS; also lock/recheck the exact Representation
is IDENTITY_ONLY, without incrementing that unchanged Representation.

Manifest/derivative/input validation proves Source membership and original
ancestry, not merely hash equality. Pins are immutable. Confirmations copy exact
selected Run material pins into their own typed input rows, with a fresh Source
row observation and explicit historical-selection intent when needed; slot supports reference those
rows, Candidates reference their Run rows. No ACL or Source identity hidden only
in support JSON. Runs and confirmations must reference at least one input for
extracted review; manual/no-Source domain confirmation stays outside C, except
Source-free reject/defer cannot claim extracted support. Rows never reparent.

### trip_source_candidates

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| id | U required | I durable proposal identity; P/L. |
| run_id | U required | I owning Run; P/L. |
| candidate_key | K required | I extractor output identity within Run, not array index; P/L. |
| candidate_kind | S(24) required: TRANSPORT / STAY / ACTIVITY / NOTE / OPTIONAL_POI / UNCLASSIFIED | I proposed meaning, not canonical target/permission; P/L. |
| proposal_version | smallint required, exactly 1 | I payload validator version; unsupported rejects; P/L. |
| proposal_sha256 | H required | I published payload digest; P/L. |
| proposal | J(262144) required while RETAINED | I compact proposed fields/support, null only IDENTITY_ONLY redaction; P/L. |
| created_at | T required | I run publication clock; P/L. |
| retention_state | S(24) required RETAINED / IDENTITY_ONLY; default RETAINED | M parent Run row_revision CAS; explicit redaction; P/L. |

Payload version 1 contains `fields` keyed by 1–128 adapter-approved ASCII field
keys, at most 64; each has `proposed_value`, `input_ids` (1–64 typed pins), and
optional `locators`, `confidence`, `ambiguity`. B-related proposed values follow
the B3 component vocabulary/precision, validated by its future proposal adapter;
they are not independently queryable canonical schedules. Retain incompatible
raw fragments as text facts, do not invent accepted B values. NOTE/OPTIONAL_POI/
UNCLASSIFIED retain bounded `label` ≤500, `text` ≤5000 and source-text traveller
facts ≤64 entries of ≤255; these are proposals only, not Note/Pool schemas.
They cannot dispatch through the event adapter without explicit valid classification.

At most64 Candidates per run and ≤4 MiB total published payload; explicit resource
failure instead of silent truncation. Bounds are proposed V1 resource controls,
not domain facts. Confidence is `{value: decimal-string max 64, scale: S(64)}` only
when scale known; ambiguity is max 16 bounded text fragments ≤500 each. No full
provider response/token graph. Review dispositions live in immutable slots, not
mutable Candidate fields; local review draft is separate O.

### FieldEvidence: slot.support_payload version 1

No separate table: a max 262144-byte immutable keyed field bundle, at most 64 fields.
Field key matches C's evidence address and owning-domain-approved accepted field.
Every entry has the following exact shape; optional means null/absent under the
version 1 validator, never meaning “implicitly extracted.”

| Entry field | Exact type/null rule | Authority/binding |
| --- | --- | --- |
| origin | USER_ENTERED / ACCEPTED_EXTRACTED / EDITED_EXTRACTED, required | Explicit reviewed interaction; equality does not infer extraction. |
| candidate_id | U required extracted origins, null USER_ENTERED | Same Confirmation reviewed Candidate; no synthesized Candidate for manual field. |
| candidate_field_key | approved field-key required extracted origins | Exact immutable proposed value; original proposal remains Candidate-owned. |
| input_ids | sorted distinct U array, 1–64 for extracted origins, empty USER_ENTERED | Exact Confirmation typed pins; each maps to selected Candidate supports. |
| accepted_value_ref | S(512) required successful create/update | Owning-domain immutable operation receipt + slot/field reference; bound accepted value/revision, not another C canonical copy. |
| edited_value | bounded scalar/text/B-proposal component nullable | Required EDITED_EXTRACTED reviewed replacement, absent other origins; this is reviewed intent history, not editable canonical truth. |
| locators | optional array ≤64 | Precisely typed locator rule below, each names input_id. |

Link-only slots have empty field support bundle, no retroactive extracted origin.
Reject/defer retain candidate disposition but no accepted_value_ref or successful
field support. Before domain commit, admitted support intent carries no success
claim: accepted_value_ref is deterministically **prepared** receipt/field address,
activated only by exact successful verified domain receipt/result. FieldEvidence
header target/revision are slot result columns, not hidden in JSON. Prepared
reference allows B opaque evidence ref admission without a circular “C result
must already exist before domain commit” requirement.

Locator entry is `{input_id, kind, page, start, end, region, excerpt}`. Kind
WHOLE uses no page/range/region; TEXT_SPAN uses integer start/end UTF-8 byte
offsets with 0≤start≤end≤exact input byte_count, no region; PAGE uses positive
page number ≤1,000,000 for documented page-bearing representation; REGION uses
page if relevant and `{x,y,width,height,coordinate_width,coordinate_height}`
integer pixel coordinates, nonnegative origin, positive sizes, contained in
positive source raster dimensions. Geometry is allowed only for the exact image
input, not copied to another raster. Excerpt optional S(2000), sensitive, cannot
pretend to exact match without verified range. Unknown precise locator uses WHOLE.
TEXT_SPAN isn't used on a binary PDF payload as if offsets were OCR character
positions; pin the actual text derivative. No token archive is required.

## K. Confirmation/output receipt correlation

### trip_source_confirmations

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| id | U required | I Confirmation identity; C/L. |
| trip_id / actor_account_id | U required each | I admitted review scope, Actor owns selected V1 Sources; C/L. |
| confirmation_key | K required | I Actor/Trip replay key; C/L. |
| intent_version | smallint required exactly 1 | I strict contract; C/L. |
| intent_sha256 | H required | I header+ordered slots+pins/review intent; no status/retry included; C/L. |
| created_at | T required | I server acceptance of reviewed intent; C/L. |
| state | S(24) required: PREPARED / PROCESSING / PARTIAL / COMPLETE / STOPPED; default PREPARED | O derived from actual slots, not business truth; C/L. |
| row_revision | R required, starts1 | M own aggregate CAS for header and all slot M/O/redaction; +1 per transaction, replay neutral; intent never edited; C/L. |
| retention_state | S(24) required RETAINED / IDENTITY_ONLY; default RETAINED | M redaction gate; no ordinary replay erasure; C/L. |

Header/pins/slot bindings commit before execution. PREPARED with zero slots is
not a valid published intent; require1–64 slots. Every required input/candidate
read and target-action admission occurs before preparing execution; repeat current
execution rights at first dispatch. COMPLETE means every slot has a final
disposition/finalized outcome, not that every requested create succeeded.

### trip_source_output_slots

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| confirmation_id / slot_id | U required each | I parent+global slot identity; C/L. |
| slot_key | K required | I stable selected output-purpose identity; C/L. |
| disposition | S(16) required: CREATE / UPDATE / LINK_ONLY / REJECT / DEFER | I reviewed decision; C/L. |
| reviewed_run_id | U nullable | I required with candidate_id, null standalone link; scope/input generation rechecked; C/L. |
| candidate_id | U nullable | I required extracted create/update/reject/defer; null manual link; C/L. |
| intended_target_kind | S(32) nullable: ITINERARY_EVENT / ITINERARY_RESERVATION | I CREATE/UPDATE/LINK_ONLY required; REJECT/DEFER null; C/L. |
| intended_target_id | U nullable | I UPDATE/LINK_ONLY exact existing ID; CREATE locally allocated intended canonical ID if domain supports it; null permitted only receipt-assigned CREATE; C/L. |
| base_revision | R nullable | I required UPDATE; null CREATE/REJECT/DEFER; LINK_ONLY requires exact owning-domain evidence-action observation if that domain is versioned, never fake version 1; C/L. |
| adapter_key | S(64) nullable | I allowed itinerary-event-v1 / itinerary-reservation-evidence-v1 for executable intent; null REJECT/DEFER; disabled until adapter gates pass; C/L. |
| adapter_version | smallint nullable, exactly 1 when adapter_key present | I executable contract binding; C/L. |
| domain_operation_key | K nullable | I required executable intent and persisted before dispatch; null REJECT/DEFER; C/L. |
| domain_intent_sha256 | H nullable | I required executable intent, exact typed owning-domain request; C/L. |
| reviewed_payload | J(262144) nullable | I reviewed selected fields/edits/explicit Person-ID choices and association intents; required executable intent, optional rejected/deferred proposal reference context; C/L. |
| support_version | smallint required exactly 1 | I support bundle validator; C/L. |
| support_payload | J(262144) required while RETAINED | I J FieldEvidence bundle; empty object link/reject/defer; C/L. |
| state | S(32) required: PREPARED / OUTCOME_UNKNOWN / DOMAIN_SUCCEEDED / EVIDENCE_PENDING / FINALIZED / REJECTED / DEFERRED / CONFLICTED / FAILED / CANCELED | O exact transition proof below, initial PREPARED except REJECTED/DEFERRED; C/L. |
| dispatched_at | T nullable, default null | O set before first handoff; never proves domain committed; C/L. |
| receipt_ref | S(512) nullable, default null | O immutable once verified, opaque domain-owned reference; required successful domain result, absent unproved success; C/L. |
| result_target_kind | S(32) nullable, bounded same target kinds | O immutable verified outcome; matches intended kind, required success; C/L. |
| result_target_id | U nullable, default null | O immutable exact receipt output; required success, matches intended ID if supplied; C/L. |
| result_revision | R nullable, default null | O required CREATE/UPDATE success; link-only preserves domain-proven target observation if available, never invented business revision; C/L. |
| receipt_sha256 | H nullable, default null | O required verified success, binding to receipt/operation/Actor/Trip/target/revision and exact admitted intent; C/L. |
| finalization_state | S(16) required: NONE / PENDING / COMPLETE / BLOCKED; default NONE | O Source association/support finalize, not new domain write; C/L. |
| failure_code | S(32) nullable, default null | O allowlist INPUT_STALE / FORBIDDEN / DOMAIN_CONFLICT / DOMAIN_REJECTED / RECEIPT_UNAVAILABLE / EVIDENCE_FINALIZE_FAILED / OUTCOME_UNKNOWN; no raw errors; C/L. |
| retention_state | S(24) required RETAINED / IDENTITY_ONLY; default RETAINED | M explicit redaction, cannot erase correlation of pending/replayable outcome; C/L. |

Every slot M/O field (including the write-once receipt/result tuple) and N's
exceptional payload redaction use parent Confirmation row_revision CAS in B;
there is no independent slot revision.

No free-form domain request routing. Exact adapters remain disabled; Event
CREATE/UPDATE depends on B typed commands+atomic receipt. Reservation adapter is
LINK_ONLY after evidence-action receipt admission; CREATE/UPDATE forbidden here.
Unknown target/adaptor versions reject, no generic fallback. Reject/defer require
no target mutation/receipt/result. Link-only records associations without accepted
field origin. Pure manual no-Source creation is domain-owned, not fake C Candidate.

Reviewed payload uses ≤64 adapter-defined selected field keys, explicit candidate
edits and same-Trip Person UUID choices; executable target/operation/base/result
identity lives in columns. Association intent entries name typed Confirmation
input IDs and purpose only; logical Source/Representation identities resolve via
those rows. At most64 relevant inputs per slot. No current canonical schedule
JSON, arbitrary patch path/table name, arbitrary receipt URL or raw model response.
The specific domain adapter validates exactly its supported B/person fields.

Successful Candidate CREATE has a protected uniqueness ledger implicit in slots:
one noncanceled create claim per `(candidate_id, slot_key, intended_target_kind)`.
It is claimed with prepared intent and released only after **proven** no-commit
terminal cancellation/rejection; OUTCOME_UNKNOWN retains it. New accidental
Confirmation key cannot create the same output-purpose twice. A deliberately
different object uses explicitly reviewed distinct slot_key. Domain operation
tuple is likewise unique across slots; same operation/digest cannot map two outputs.

No dedicated C retry fields/table: existing Account-owned `sync_operations`
owns operation id, status, attempts, due time, failure category, immutable key/
payload and claim leases. Future C work links by Confirmation/slot stable ID
through entity binding; it cannot rewrite domain operation key on retry. Server
execution coordination uses those persisted slot bindings, not an unrequested
second job engine. No full worker design or queue change is made here.

## L. Crash/replay semantics

Preferred execution: persist exact intent/pins/slots → typed domain operation →
**atomic domain mutation+immutable receipt** → verify correlation → C-only
association/result/support finalization. PREPARED refs in B do not self-certify
truth; domain writer validates the exact reviewed input/value/Actor/Trip and binds
its resulting revision to the prepared operation and receipt.

| Case | Deterministic rule |
| --- | --- |
| Before first dispatch | Persist key/digest and check current Source/input/run/target rights. Changed run/capture or target base needs new review; do not substitute latest. |
| At handoff | Set OUTCOME_UNKNOWN/dispatched_at before call; crash before actually sending is still unknown until receipt/authoritative no-commit lookup. |
| Domain succeeds, response/C recording lost | Lookup/replay same exact operation. Domain atomic receipt maps exact result; no new object ID/key or search-by-name/hash recovery. |
| Receipt recovered | Verify Actor/Trip/adapter/operation/intent/target/revision; store immutable result mapping. Later target revisions do not change the historical receipt or reset target to old revision. |
| C association/support failure | DOMAIN_SUCCEEDED→EVIDENCE_PENDING; retry C-only finalization by stable identities. Never repeat domain mutation or compensate/delete target. |
| Partial outputs | Finalized successful slots remain; pending slot continues its exact operation. Terminal rejection/conflict requires explicit new review; no cross-domain rollback. |
| Same-key replay | Same intent returns original dispositions/results and resumes incomplete finalization; changed intent rejects. Current projection/authorization still filters response. |
| Update stale base | Domain rejects before mutation; mark CONFLICTED, retain old intent. New accepted baseline has new operation/key, no silent rebase/LWW. |
| Source delete/access loss with unknown outcome | Freeze new execution; receipt-only recovery under authorized internal policy. Preserve unknown correlation. Proven success may finalize historic inactive links, never reactivate material. |
| Proven no commit after deletion | Canceled/failed terminal slot; never newly execute from deleted/forbidden material. Release create claim only with authoritative no-commit proof. |

State transitions require durable proof, not timeout interpretation. DOMAIN_SUCCEEDED
requires receipt/result; FINALIZED requires C-only association/support transaction
complete. REJECTED/DEFERRED are explicit review dispositions, not success. FAILED
may be terminal only with proven no committed domain mutation; otherwise remain
OUTCOME_UNKNOWN with safe retry/lookup status. Finalization can be BLOCKED while
target remains committed. Cancellation does not undo unknown/committed results.

An owning domain without atomic idempotent receipt/replay and exact lookup is
**BLOCKED for executable adapter activation**. Existing narrow itinerary create
does not establish the B3 rich command/revision receipt. Existing Ledger receipt
principle cannot be borrowed as a generic Trip business command. Designing this
dependency completes the contract; implementing the receipt is outside C-I3A.

## M. Track A/B boundaries

B3's exact accepted semantic fields remain in event root/transport endpoint
tables. C adds no calendar/date/zone/coordinate columns for accepted current
truth and no editable accepted aggregate blob. Run/Candidate may preserve proposed
B3 components/unknowns and raw fragments; field support names exact accepted
receipt value/revision and retained reviewed edits, not competing schedule ownership.

B evidence references use C's field address in C. Admission proves prepared
Confirmation/slot/field intent, exact Source pins, accepted value and eventual
domain revision. Resolver returns success/history/unavailable status under ACL;
reference strings alone are not foreign permission or truth. Source loss never
erases accepted B facts or domain receipt. Domain manual evidence keeps its own
`otr-event/confirmation/...` namespace and need not fabricate C IDs.

B3 initially disables canonical commands and accepts only UNASSIGNED Person scope;
ASSIGNED/WHOLE_GROUP compatibility is a later gate. C retains explicit reviewed
Person UUID choices as pending input only; cannot activate assigned sets merely
by storing a support bundle. Exact time precision through six fractional digits,
unknown clocks, independent endpoint contexts, Stay nights versus elapsed interval,
optional provider enrichment and DST ambiguity follow B3, not C rules.

TripPersonId=`journey_members.id`, scoped to `trips.id`. A2's passive participation
pair and A3's proposed complete-snapshot/cursor certificate are not access grants
or implemented fresh Person selection. Retained local list includes inactive/
historical Persons; source contact/name/email/uploader never identifies Person.
Exact selected IDs require owning-domain/Track A validation under its enabled
selection contract. Unknown remains unresolved, not implicit active or whole group.
Source readers are Accounts. No claim/link/invite/leave/Viewer/new product role.

## N. Delete/purge/retention

### trip_source_actions

One compact append-only action family keeps lifecycle history instead of a
generic audit bus. New acquisition/replacement/link/delete commands later commit
their guarded state and Action result atomically; server foundation creates no
actions/data. Automatic validators cannot mutate/emit business actions.

| Exact field | Type; null/default | Authority / mutation; ACL/local |
| --- | --- | --- |
| id | U required | I action/replay result identity; P/L. |
| source_id | U required | I same Source scope; P/L. |
| actor_account_id | U required | I authenticated initiating Account or domain Actor for target-delete cleanup; P/L. |
| operation_key | K required | I Source-scoped replay; P/L. |
| operation_sha256 | H required | I exact action/pins/expected revision/actor binding; P/L. |
| action | S(24) required: ACQUIRE / REPLACE / LINK / UNLINK / RELINK / DELETE_SOURCE / TARGET_DELETE / PURGE / MARK_LOST / REDACT | I bounded Source-only operation; P/L. |
| occurred_at | T required | I admitted server clock; P/L. |
| source_row_revision | R required | I resulting/proven Source root observation for action, unchanged if child-only; P/L. |
| material_revision | R nullable, default null | I required ACQUIRE/REPLACE, otherwise when specific capture implicated; P/L. |
| representation_id | U nullable, default null | I required PURGE/MARK_LOST and Representation REDACT; P/L. |
| run_id | U nullable, default null | I only REDACT of exact same-scope run metadata; P/L. |
| candidate_id | U nullable, default null | I only REDACT of exact Candidate with this Source input; P/L. |
| slot_id | U nullable, default null | I only REDACT of exact output slot with this Source input; P/L. |
| association_id | U nullable, default null | I required LINK/UNLINK/RELINK/TARGET_DELETE; P/L. |
| confirmation_id | U nullable, default null | I optional successful finalization correlation; P/L. |
| reason_code | S(32) required: USER_REQUEST / CAPTURE_CHANGE / DOMAIN_DELETE / VERIFIED_LOSS / SECURITY_REDACTION | I no arbitrary note/document text; required combinations checked; P/L. |

Action IDs never grant reads and cannot carry raw error/proposal/excerpt.
For REDACT, at most one representation_id/run_id/candidate_id/slot_id selector
is present; with none, the action identifies root/capture metadata redaction.
The selected record must contain this Source and have the same acquiring Actor;
redacting a multi-input bundle requires explicit authorization over all inputs.
Each affected payload record has its own typed Action/result, not affected IDs
hidden in freeform JSON. Source-wide erasure traverses known references and records
those bounded results before claiming completion. Pending/correlation protection
and permitted retained identity remain mandatory. No new domain receipt bus is
needed for this bounded Source command.

| Operation / technical state | Preservation and admissibility |
| --- | --- |
| UNLINK | Association INACTIVE+Action, no Source byte deletion or target change; retain accepted evidence history. |
| DELETE_SOURCE | Source DELETED+Action, deactivate links, freeze undispatched new intent. Original identities/unknown operation correlation remain; not physical purge. |
| MARK_LOST | Exact Representation remote/local loss fact, descriptor/hash retained; network failure alone is not permanent loss. Target unchanged. |
| PURGE_PENDING | Explicit authorized request, no worker assumed. Cannot purge protected pending/unknown-dispatch inputs or last copy under automatic quota policy. |
| PAYLOAD_PURGED | Confirm explicit physical removal; retained descriptor/parents/hash/field/receipt identity while permitted; remote PURGED for binary, inline text/locator removed through the same explicit path. |
| IDENTITY_ONLY | Separately admitted security redaction removes sensitive payloads/locators/filenames/URLs and where required digests/selected values; retains only permitted IDs, scope, opaque operation/result correlation and redacted markers. |

Typed inline text/locator removal is the same semantic material purge, not “no
bytes so no retention.” Row material fields may become null only under the
corresponding explicit payload/redaction transition. Ordinary loss leaves immutable
integrity metadata; deliberate full redaction can remove digest to prevent a
low-entropy content oracle. Digests/keys/identifiers remain nonpublic in all states.
If an exceptional erasure policy removes replay digest, reject changed/new replay
execution for that identity and retain a redacted closed operation tombstone;
never recreate business truth because old material/intent is gone. Exact mandatory
erasure/retained-identity permission needs separate review, no legal period claimed.

For every family: I fields are normally append-only; mutable lifecycle/availability
never edits historical values. Referenced captures/inputs/candidates/slots/receipts
survive routine cleanup. IDs/results stay scoped P/C after purge. A current target
reader can receive only H even if source metadata was retained. Field payload
redaction must also clear matching excerpts/candidate/review caches, not just
original binary; preserve explicit evidence-removed marker and permitted correlation.

Protection is computed from pending upload/extraction/review, dispatched outcome-
unknown operations, confirmed support and material parents, plus local offline
protection. An unassociated Source is valid saved evidence, not disposable orphan.
No age-based or legal-duration delete selected. Verified duplicate cache eviction
may clear local URI after authorization/recoverability/ref checks and guarded
metadata update; may never remove last original, required pending input, receipt
or historical support identity. Nonregenerable referenced derivative is protected.
No default purge/recovery of logically deleted material or immutable PURGED IDs.
No receipt tombstone/restore rule is inherited.

**Exact IDENTITY_ONLY exceptions to normal catalog nonnull/immutability:** an
admitted REDACT can null Source acquisition_sha256/captured_at (capture_time_basis
becomes UNKNOWN with an explicit redacted marker); revision capture_sha256;
Representation payload_sha256/byte_count/original_filename/part_key/text_content/
locator_uri/transform_options_sha256; Run input_sha256/extractor_options_sha256;
Candidate proposal/proposal_sha256; Confirmation intent_sha256; slot reviewed_payload/
support_payload/domain_intent_sha256/receipt_sha256. Input payload_sha256/byte_count
may be nulled only when its exact Representation is IDENTITY_ONLY; input IDs/pins
stay. These exceptions require appropriate owning row retention_state, typed
Action and a permanently closed/redacted execution identity; they are never
accepted as a normal new input or missing field. Source row_revision advances
for its metadata redaction. UUIDs/scopes/operation keys, material revision and
verified result/receipt reference remain only where retention policy permits.
Unlisted identity/state fields are not arbitrarily cleared. No new dispatch or
changed-body execution is allowed after digest redaction; permitted replay returns
the recorded redacted result marker. Existing FieldEvidence address resolves to
redacted history, never a fabricated value. These are exceptional authorized
security transitions, not routine physical purge behavior.

## O. Offline mirror

Every L catalog field mirrors exactly under its same snake_case name, with U/T/
TEXT as TEXT, R/smallint as INTEGER, typed arrays as strict canonical JSON TEXT
for **local serialization only** (server arrays remain typed), J as validated
TEXT. Local FK/same-scope/reference checks remain mandatory; serialized arrays
do not waive identity validation. Account-scoped cache rows cannot be read merely
because a shared Trip ID exists. Pure metadata registration preserves Source IDs;
do not invent a separate server_id for this new core.

Every private local family additionally has `cache_account_id` (required U TEXT,
immutable, no default) and `registration_state` (required TEXT PENDING / REGISTERED /
CONFLICT / BLOCKED, default PENDING). These are device-owned, private, not server
grants; registration_state uses B's local operational state-machine CAS, and
registered rows require exact validated server observations. For V1 the
cache Account equals Source owner or Run/Confirmation Actor through the fixed
parent. They are never shared just because target viewers share a Trip. A source-
inaccessible target receives only its target-owned H summary, not these rows.

Additional device-only extensions on each local Representation, all governed by
B's local operational state-machine CAS:

| Exact local field | Type/null/default | Authority and retention |
| --- | --- | --- |
| local_uri | TEXT nullable, max4096; default null | D O owned exact path; never synced; cleared only after safe eviction/purge. |
| local_state | TEXT required ABSENT / PRESENT_UNVERIFIED / VERIFIED / LOST / PURGED; default ABSENT | D O actual local availability, not upload/extraction/target state. |
| local_verified_at | exact T TEXT nullable | D O required local VERIFIED; actual last byte proof. |
| transfer_state | TEXT required NOT_REQUIRED / PENDING / IN_PROGRESS / RETRYABLE / COMPLETE / BLOCKED; default PENDING for new local binary, NOT_REQUIRED nonbinary | D O existing queue-owned byte transfer observation, no new worker. |

Source/revision/Representation local metadata and original copy commit before
material is offered to durable review. Server-created_at/result revisions stay
null in explicitly pending local records until receipt/registration, not fake
server clock/revision1 authority; local provisional created_at is device clock
with registration_state pending. This is a local pending-envelope exception to
server-required fields, not a weakened accepted schema. Input IDs and replay keys
survive app restart; remote proof cannot replace local authored intent.

Exact local-only table `trip_source_review_drafts` is keyed `(account_id, draft_key)`;
no server mirror/syncable Candidate rewrite. Its required fields are:
`draft_key` K, `account_id` U, `trip_id` U, `run_id` U,
`row_revision` R INTEGER starts 1 (own local CAS),
`review_version` INTEGER exactly 1, `review_payload` strict compact J(262144) selected
candidate IDs/edits/Person choices, `observed_input_sha256` H,
`updated_at` T device clock. All required, defaults only row_revision/version 1;
payload/input observation/time edits compare row_revision in one SQLite write
transaction and increment it once; identical replay is neutral. Changes are
owned by current Account, ACL private, survives restart, removable only when not
dispatched/referenced. This is one bounded local draft store, not a second sync
state framework. Confirmation submission copies
reviewed intent into immutable header/slots; draft edits cannot rewrite them.

Four independent axes: local/remote **byte availability**, transfer/registration,
Run **extraction state**, owning-domain canonical revision/pending mutation.
Local READY extraction while transfer pending is valid. Remote VERIFIED/local
ABSENT requires authenticated verified recovery. Review acceptance is not proof
of remote canonical commit. Offline domain creation/update follows its future
repository/queue contract; cached admitted target access never waits for evidence
or token refresh. Reconciliation captures Account/generation before requests and
applies records+checkpoint atomically, preserving pending intent/newer observations.
No worker, new shared feed, cursor format or offline access policy is designed here.

## P. Receipt non-interference

Only this contract changes. No runtime regression claims substitute for that
verified scope. Existing Source/Representation IDs, storage bucket and tables
are proposed independent namespaces; no receipt migration/backfill/cast/alias.

| Protected existing behavior | Exact separation |
| --- | --- |
| receipt_assets / local receipt projection | No new fields/ID mapping/Source insertion, no dual-write. |
| Expense max-three | Unchanged counter/constraint; Source arrays/links have their own proposed bounds. |
| Receipt tombstones/normalization | Existing delete/restore/resize/MIME/size remain receipt-owned. |
| Personal Payment evidence | Existing one-payment local/link behavior and private grants unchanged. |
| Settlement/Transfer evidence | Optional evidence UUIDs and financial truth/finality untouched. |
| Receipt OCR/review | Existing image recognizer/parser/transient session/Expense Save untouched; Candidates are not receipt scan migration. |
| Receipt bucket/provider | Existing ledger-receipts and upsert wrapper preserved; Source creates separate bucket-bound create-only wrapper later. |
| Receipt queue/worker/ACL | No Source operation kinds/routes/targets financial reads, no queue/store/parent wait redesign. |
| Expense/Review/FX/financial grants | No amounts/dates/rates/member IDs/predicates/revisions altered. |

Identical byte/hash or shared primitive never creates a financial link. Payment
instructions remain raw proposals/notes, not Payment/Expense mutation. Future
primitive extraction requires old receipt checks and new Source namespace/immutable
write tests, not undocumented Ledger semantic change. No tests/code edited now.

## Q. Golden/adversarial cases

| # | Case | Contract result / evidence |
| --- | --- | --- |
| 1 | Private Source, shared target | Full Source rows remain P; association grants nothing. Target gets permitted current values and H indicator only. |
| 2 | Target viewer without Source rights | RESTRICTED or omitted indicator; no Source/slot IDs/raw URI/name/count, cannot dispatch from private Candidate. |
| 3 | Booking-reference/excerpt redaction | Current value only if target authorizes it; extracted/old value/excerpt/locator remains sensitive G/H, including replay and error. |
| 4 | List/replay/error indirect leak | Filter before paging/count; same unavailable lookup outcome, no raw errors/ETags/IDs or shared Source feed. Changing hidden revision/purge does not change unauthorized availability detail. |
| 5 | S1 revision1 accepted, revision2 replacement | New immutable manifest/material; logical association stays S1; field ref pins old input. Target preview revision1 or unavailable, never auto2. |
| 6 | Logical deletion after confirmation | Source tombstone/links inactive; target/slot receipt/history survive. Unknown dispatch cannot be treated canceled; freeze new execution. |
| 7 | Physical purge/redaction | Material removal records action/status; no business cascade. Allowed identity/receipt retained; sensitive hashes/excerpts removed only explicit redaction, closed replay tombstone if digest erased. |
| 8 | Identical PDF twice | Different acquisition keys → S1/S2 with distinct IDs, even same digest. Same key+exact envelope replays one Source; no dedup inference. |
| 9 | Email body+attachment | One Source manifest references separate TEXT body and BINARY attachment; exact field input/part; late attachment new manifest, old run unchanged. |
| 10 | Pasted text | Exact UTF-8 text/hash, no filename/binary MIME/storage path; saved edit new revision; same retention/ACL as files. |
| 11 | Traveller names, no mapping | Candidate raw text/count, explicit Person IDs unresolved. No Account/uploader/email/name inference. B assigned scope remains blocked until its adapter. |
| 12 | Target commit, C crashes | Durable domain operation binding; atomic receipt lookup recovers exact output/result, C-only finalize. Missing domain receipt means adapter BLOCKED, not new create. |
| 13 | Partial multi-output confirm | Slot1 success kept, slot2 pending/conflicted separate; same keys, no compensation. Shared Source support may bind both exact output revisions. |
| 14 | Update target revision changed | Domain CAS rejects; original reviewed intent retained, explicit new baseline review/key required; no blind retry. |
| 15 | Association finalize fails | EVIDENCE_PENDING/BLOCKED; target persists; retry association/support by stable IDs only, not domain mutate again. |
| 16 | Replay after later target edit | Original slot result receipt returned; current target not rolled back. Response filtered by current admission. |
| 17 | Different payload to established binary key | Create-only collision, verify exact bound bytes, mismatch rejected; no upsert/delete-and-replace. |
| 18 | Local extraction ready/upload pending | Run READY and local VERIFIED coexist with remote PENDING; draft durable, no false canonical/remote success. Pending inputs not evicted. |
| 19 | Account A→B→A delayed response | Request generation rejected even same final UUID; B cannot receive A's private candidates/URI/provenance/cursor. |
| 20 | Unlink one of several outputs | One association inactive/history Action; other links/material/outputs unchanged. Current field history remains exact accepted pins. |
| 21 | New extractor after accepted proposal | New Run/generation; old accepted Candidate/field ref unchanged. Stale completion cannot become current; new target support requires explicit confirmation. |
| 22 | Service-role direct mutation / delete / truncate | Hybrid private writer guard rejects immutable material/result/identity overwrite and destructive lifecycle bypass; RLS bypass does not grant writer capability. |
| 23 | Source replaced/deleted during unknown dispatch | Stop new execution; receipt-only recovery; committed result can finalize historical inactive support. Proven no commit permits cancel, never timeout-as-proof. |
| 24 | One Source supports two / three Sources support one Stay | Independent links + typed per-field inputs; domain output identity separate. One B Stay span, no cloned nights or Source ownership of target. |

Resource caps reject explicit unsupported/oversized inputs rather than truncate
evidence. These are future acceptance cases, not executed tests. Domain/ACL/
redaction implementation proof remains separate.

## R. Proposed migration order

**First recommended future implementation slice:** one server-only additive
protected Source/material foundation, after review and explicit implementation
authorization. Exact first families: `trip_sources`, `trip_source_revisions`,
`trip_source_representations`, `trip_source_actions`; private
`trip-source-material` bucket, constraints/read-only validation/immutable writer
guards, disabled private Source execution identity. No business data rows/backfill,
Source routes, upload worker, SQLite migration, association, extractor or domain
command activated. Action columns referring to later associations/runs/candidates/
confirmations/slots are initially constrained null, with their action variants
disabled; no FK to a nonexistent family or placeholder row is installed. Add their
real FKs/scope validation only with the corresponding later family before enabling
that action. Even first-slice material commands remain disabled. Existing schema/financial manifests must remain unchanged
apart from this explained additive delta and declared Trip/Account RESTRICT impact.

| Order | Future bounded change | Prerequisite / blocked boundary |
| --- | --- | --- |
| 1 | Four-family foundation above, arrays/scope integrity, RLS/storage denial and disabled writer | C-I3A review, migration baseline manifests, Account/Trip teardown compatibility and retention bounds acceptance. No migration number/date assigned. |
| 2 | Local owned copy/mirror/restart foundation and typed Source registration/material operations | Approved server contract, generation/owned-path/input integrity proof; B domain commands not needed for Source-only material. |
| 3 | Existing-provider bucket seam/create-only upload/read/recovery, narrow Source commands | No receipt regression or parallel retry engine; every Source route admission enforced. No client direct storage/table access. |
| 4 | Associations/input pins + safe summary and link-only target integration | Existing typed target evidence-action authority/receipt; reservation link-only or event adapter only if separately approved. |
| 5 | Run/Candidate compact proposal persistence, explicit reviewed drafts | One approved extractor/input path, B proposed payload validation; no canonical activation from READY. |
| 6 | Confirmation/slots/field ref admission and receipt recovery | Atomic owning-domain receipt/replay+CAS and exact typed B wire/writer/local projection. **BLOCKED until those exist.** |

Record definitions describe the destination contract, not all six changes in one
migration. Field refs/association integration can be specified ahead of activation,
but unsupported target kinds and commands remain disabled. B3 does not implement
domain receipts; A3 does not implement fresh selection/assigned participant flow.
No canonical Booking/Note/Pool/Credential schema added to unblock Track C.

## S. Risks/blockers

| Gate | Status / exact reason |
| --- | --- |
| Human contract review | PENDING: exact table layout/bounds/private projection/storage/writer guard and delete compatibility need acceptance. |
| Executable domain adapters | BLOCKED: rich owning-domain atomic mutation+receipt/replay/lookup is not established at this HEAD. C-I3A does not implement it. |
| Accepted B activation/wire/local projection | PENDING: B3 contract is committed, rich writers disabled, canonical assigned sets separately gated. C cannot duplicate accepted truth to bypass it. |
| Source/Trip/Account physical teardown | PENDING: RESTRICT retains history, intentionally changes destructive deletion eligibility for new Source roots; review required before foundation implementation. No existing financial delete altered now. |
| Privacy enforcement | PENDING: no Source endpoints/policies currently exist. Future real-role tests must prove target list/error/replay/private-input/reference isolation, not only DTO shape. |
| Retention/redaction | PENDING: technical states exact; legal erasure obligations/durations and permitted retained identity policy unselected. Routine deletion is not history erasure. |
| Primitive extraction | PENDING: immutable Source PUT differs from mutable receipt wrapper; old financial byte behavior must remain unchanged under tests. |
| Person selection readiness | PENDING: passive pairs/convergence design are not fresh assigned-scope commands. Names remain unresolved; no access role needed. |

Biggest executable blocker is domain receipt atomicity; highest security risk is
indirect private provenance leakage through otherwise shared target reads. Safe
V1 needs no new Track A role, generic command bus, copied B truth or receipt
semantics. None of the task's design STOP conditions requires broader work:
these dependencies are explicitly left disabled/blocked instead of implemented.

## T. Acceptance matrix

Coverage PASS means exact proposed design/evidence exists; it is not the status
of the separate implementation gates in S. No runtime test/deployment claims.

| # | Criterion | Evidence | Result |
| --- | --- | --- | --- |
| 1 | Compact V1 model | B: ten families, four in first slice; no per-field/token/revision UUID family | PASS |
| 2 | Exact IDs/keys/versioning | B conventions/C/catalogs; field address and bounded vocabularies | PASS |
| 3 | Acquisition identity independent of hash | C/D; Q8 | PASS |
| 4 | Immutable revision/Representation rules | D/E; Q5/17 | PASS |
| 5 | Nonfile Sources supported without fake metadata | E/O; Q9/10 | PASS |
| 6 | Private Source ACL enforceable without new roles | G/E1; owner + current Trip predicates | PASS |
| 7 | Four provenance read levels | G/H | PASS |
| 8 | Redaction prevents indirect metadata exposure | H; Q2–4/19 | PASS |
| 9 | Association grants no access | G/I; Q1/20 | PASS |
| 10 | Revision-pinned accepted evidence/preview | C/I/J; Q5 | PASS |
| 11 | Replay-safe intent/output mapping specified | C/K/L; Q12–16 | PASS |
| 12 | Crash safety depends on atomic domain receipt | L/R/S: adapter activation BLOCKED, no generic fallback | PASS |
| 13 | Track A/B identity/semantic ownership preserved | M; B3 evidence grammar/disabled assigned scope, A3 freshness boundary | PASS |
| 14 | Receipts/financial paths untouched | F/P, document-only scope | PASS |
| 15 | Delete/unlink/loss/purge/redaction distinct | N/I; Q6/7/20/23 | PASS |
| 16 | Offline axes/mirror/Account ownership exact | O/H; Q18/19 | PASS |
| 17 | No migration/code/config modifications | Only requested document; no executable DDL or database commands | PASS |
| 18 | No remote or sibling modification | Local reads/write/static checks only | PASS |

Required design matrix: **18 PASS / 0 PENDING / 0 BLOCKED**.
Separate executable gate: **domain adapters BLOCKED**; review, schema/access
implementation, B activation, retention and Person-selection gates **PENDING**.

Validation: A–T sections, all ten record catalogs, eighteen criteria, twenty-four
adversarial cases, local links/source paths, whitespace/fences and final Git scope
checked. No dependencies installed, runtime tests claimed, application database
opened, migration created/applied or remote accessed. Current-state/ADR unchanged
under the explicit one-document delivery rule. No commit requested/performed.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Migration created/applied: **NO**. Application code/config changed: **NO**.
Sibling worktrees modified: **NO**. Deployment/remote access: **NO**.

**STOP — C-I3A CONTRACT COMPLETE — REVIEW PENDING.**
