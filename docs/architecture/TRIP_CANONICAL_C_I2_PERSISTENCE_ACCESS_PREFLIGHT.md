# Trip Canonical Track C — C-I2 Persistence / Access / Confirmation Preflight

Status: **C-I2 PREFLIGHT COMPLETE — REVIEW PENDING**.
Date: 2026-10-03 (Pacific/Auckland). Design/preflight only.

Baseline: `/Users/xoery/Project/otr-mobile-import`, branch `trip/import`,
HEAD `0191f1e70b5df658d035cc127751656dd043740a`; initial workspace clean.
Expected baseline `0191f1e` matched. Only this document changes; no commit requested.

## A. Executive recommendation

Choose **strategy C: Source/Representation core, explicit associations, compact
confirmation/provenance records**. Keep identities and searchable admission/
recovery metadata explicit; use bounded, versioned payloads for immutable capture
manifests, proposed fields, reviewed intent and selected field support. No table
per conceptual noun, universal asset graph or generic mutation API is needed.

Recommended V1 decisions:

1. Source belongs to one Trip and acquiring Account. Material revision is keyed
   by `(SourceId, revision)`, with an immutable capture manifest; no revision UUID.
2. Representation has independent identity and exact integrity/parentage. Local
   presence, remote verification and purge are availability facts, not identity.
3. Source metadata/material and sensitive provenance are private to the acquiring
   Account under existing Trip admission. No new roles or per-Source grant list.
4. Target readers get canonical fields under target authority and only a restricted
   evidence summary when lacking Source rights; no identifiers/excerpts leak.
5. Object association points to logical Source. Field support pins exact material
   revision/Representation; target evidence preview defaults to supporting material.
6. Use a separate private Source bucket on the existing provider, with a minimal
   bucket-bound byte seam. Receipt bucket/routes/ACL and worker stay unchanged.
7. Retain captured originals by default. No automatic last-copy purge, deletion of
   pending inputs, confirmed lineage, immutable proposals or operation receipts.
8. Persist Confirmation intent before dispatch and exact per-output bindings.
   Each domain must commit its mutation and replayable receipt together.
9. A narrow idempotent adapter recovers results from domain receipts and then
   records associations/provenance. Evidence-finalization failure never re-creates
   the target; partial success is explicit.
10. Candidates carry proposed Track B semantic components and raw evidence;
    accepted temporal/place facts live in the owning domain, never a competing
    Track C schedule store. Exact TripPerson selection remains mandatory.

These are **preflight recommendations awaiting review**, not implemented contracts.
C-I1's established evidence/truth, access-isolation and financial constraints
remain fixed. B-T1/B-T2 are present but marked review-pending; consume their
semantic direction here without asserting human approval or enabling writers.
The current handoff's passive Track A implementation is authoritative over older
B documents' historical statements that participation implementation was absent.

### Evidence register

All paths refer to this worktree. CURRENT denotes checked-in source, not remote
deployment. Proposed Source storage/ACL and adapters do not exist today.

| Ref | Source / inspected anchor | Relevance |
| --- | --- | --- |
| D1 | [C-I1 contract](TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md), C–T/X–AB | Source/material identity, N:M, selected field evidence, confirmation, receipt isolation. |
| D2 | [C-I0 audit](TRIP_CANONICAL_C_I0_IMPORT_ARTIFACT_AUDIT.md), E01–E14/E17/E21 | Actual receipt, byte, OCR, queue, recovery and financial-reference limits. |
| D3 | [B-T1 contract](TRIP_CANONICAL_B_T1_TEMPORAL_SPATIAL_CONTRACT.md), B–J/M/Q | Civil/instant uncertainty, transport roles, Stay, authored location, Person scope. |
| D4 | [B-T2 preflight](TRIP_CANONICAL_B_T2_PERSISTENCE_PREFLIGHT.md), C–I/Q–U/W | Event schedule ownership, endpoint children, semantic binding and later opaque Track C evidence reference. |
| D5 | [A1-I2A report](TRIP_CANONICAL_A1_I2A_REPORT.md), C–G; `src/domain/trip/person.ts` | Passive nullable participation observation; neither fresh selection authority nor Source permission. |
| E1 | `backend/src/supabaseGateway.ts`, `canReadTrip` / `canWriteTrip`, 666–737 | Current admission combines creator, legacy `trip_members`, linked `journey_members`; write predicate adds linked role condition. |
| E2 | `src/data/files/receiptFileStore.ts`, `createTemporaryReceiptDraft`, `sniffReceiptMime`, `receiptBytesSha256`, `copyReceiptIntoAppStorage`, `verifyReceiptFile` | Owned copy/integrity reusable mechanisms; hard-coded receipt paths, limits and destructive normalization not generic contracts. |
| E3 | `backend/src/attachmentStorageProvider.ts`, provider interface/factory | PUT/read/stat use existing provider; factory hard-codes `ledger-receipts`, PUT uses upsert, stat hashes actual downloaded bytes; no purge method. |
| E4 | `backend/src/supabaseGateway.ts`, `readReceipt` / `readDownloadableReceipt`, `downloadReceiptContent`, `statReceiptContent` | Uploader mutation lookup and distinct Expense/payment byte grants; not generic Source ACL. |
| E5 | `src/data/operations/openReceiptAsset.ts`, `resolveReceiptAssetUri`; `ledgerMaintenance.ts`, `enforceReceiptCacheLimit` | Verified cache re-download; eviction verifies remote bytes and guards metadata before physical delete, with financial predicates/paths. |
| E6 | `src/data/repositories/ledgerReceiptRepository.ts`, `claimOperation`, `recoverInterruptedOperations`, `enqueue`; `src/data/sync/ledgerReceiptSyncWorker.ts` | Account-owned leases/retry pattern, receipt-specific operation store and Expense dependencies. |
| E7 | `src/data/sync/syncOperationRepository.ts`, operation identity/status/enqueue/recovery | Existing Account-scoped durable work ownership; not an authorization to add a Source worker. |
| E8 | `backend/src/supabaseGateway.ts`, `executeExpenseCommand` / `ledger_replay_expense_v2`; `docs/API_CONTRACT.md` / `docs/OFFLINE_SYNC.md` | Existing domain-owned replay/receipt principle; do not reuse financial commands as Trip adapters. |
| E9 | `src/data/api/ledgerReceiptContracts.ts`, receipt request/DTO/link schemas | Receipt MIME/limit/OCR/parent restrictions, not generic Representation or extraction DTO. |

Baseline instructions/current handoff and mandatory PRODUCT, ARCHITECTURE,
DATA_MODEL, API_CONTRACT, OFFLINE_SYNC, ENVIRONMENT_AUDIT, legacy audit document
and terminology remain applicable from C-I1; relevant intervening architecture
changes and A/B reports were checked. Legacy Web and sibling worktrees were not
inspected. No whole-repository reaudit, remote read or database execution occurred.

## B. Persistence responsibility map

“Durable server identity” means a stable addressable record/version once registered
remotely, not that it must be remote before local review. Locally allocate identities
and retain them through registration; avoid unnecessary local/server ID remapping.

| Concept | Durable requirement | Minimal persistence responsibility |
| --- | --- | --- |
| Source | Independent stable Source ID | Queryable Trip/Account/acquisition/lifecycle/current-revision root. |
| Material revision | Durable `(SourceId, revision)`; no extra UUID | Immutable versioned capture manifest with original Representation references, completeness and actor/time. Never overwrite history with only current JSON. |
| Representation | Independent stable ID | Material descriptor, integrity, exact source/capture provenance and parents; mutable availability separate. |
| SourceAssociation | Independent stable ID and lifecycle | Queryable typed target, logical Source, purpose, active uniqueness and action history. |
| ExtractionRun | Independent stable Run ID | Exact input/version binding, extractor version, input-scope generation and state. |
| Candidate | Stable ID addressable within Run | Immutable bounded proposal and field supports; may be contained in a run-owned payload, not necessarily its own table. |
| FieldEvidence | Stable address within immutable committed Confirmation/slot/field/support set | Explicit field/support identity or immutable keyed entry; queryable target/revision/confirmation anchors, no mandatory standalone evidence table. |
| Confirmation | Independent ID + actor-scoped replay key | Immutable intent and queryable per-slot execution/result bindings, append-only outcomes and recovery state. |

Consolidation choices: fully normalize every candidate field/token into child
records (too large); one mutable Source JSON containing everything (unsafe ACL,
query/recovery and history); or explicit small roots/associations/operation indexes
with validated immutable payload bundles (chosen). Physical record count/names,
indexes and constraints are for C-I3A, not SQL selected here.

Source revisions and representations are separately addressable even if their
manifests share an append-only persistence family. Field support can live in the
Confirmation's bounded provenance bundle when it has stable immutable keys and
target/revision lookup anchors. No identity depends on a mutable array position,
file hash, Session lifetime or extraction ordering.

## C. Source/revision persistence

Source root needs ID, Trip ID, acquiring Account, acquisition operation key,
kind/channel, capture time with known/unknown basis, lifecycle, current material
revision and access mode (V1 private acquisition). Created/modified operational
timestamps do not stand in for unknown document/capture timestamps. Root metadata
revision guards lifecycle/current-pointer updates independently of material revision.

Acquisition uniqueness is scoped to Account/Trip/key; replay binds the exact
input digest and returns the original Source. Same key/different input fails.
Identical content with different intentional acquisitions remains two Sources.
Unassociated and never-extracted Sources are valid. V1 requires Trip assignment
before durable Source creation; unassigned Account-owned staging stays outside
this core. Trip cannot change after persistence.

Each material revision contains an immutable manifest, keyed by Source/revision,
with captured original Representation IDs/roles, acquisition completeness,
replacement reason/actor/time and previous revision where applicable. Revision
number is monotonic per Source, not extractor generation or target revision.
The root points to current revision only after its manifest and referenced
material descriptors commit successfully. Last-writer-wins replacement is not
acceptable: compare the reviewed current revision and preserve old manifests.

Capture may be complete locally while some binary uploads are pending. Remote
registration can retain that manifest as pending material; it cannot claim byte
availability or dispatch remote extraction until exact inputs are verified.
A revision can include references to earlier immutable representations of the
same Source (e.g. unchanged email body plus later attachment), with origin capture
preserved. Adding a derivative does not advance material revision by itself.

Display rename/storage relocation does not alter original capture facts. Logical
delete records a tombstone/action, not rewriting material revision history.
Referenced older manifests cannot be removed by routine cleanup. A later retention
redaction may remove protected contents only under explicit policy, leaving honest
unavailable/redacted identity references where permitted.

## D. Representation persistence

| Responsibility | Minimal durable information |
| --- | --- |
| Identity | Representation ID, Source ID, originating material revision, captured/derived role and material kind. |
| Integrity | Exact payload digest and length where payload exists; validated MIME for binary, encoding/serialization basis for text/structured material. No fabricated binary metadata for a locator. |
| Captured material | Original filename only if supplied, part/page designation, completeness; sensitive under Source ACL. |
| Transformation lineage | Parent IDs, transform identity/version/options binding, creation actor/process attribution; explicit regenerability and required parents. |
| Remote storage | Provider and opaque object binding, expected integrity, registration/verification/purge/loss status; object locator never a public access grant. |
| Local storage | Account-owned URI and integrity/availability observation in local projection only; do not synchronize device paths. |
| Access | Inherit Source policy; no independent derivative grant or reader union. |

Binary is immutable captured PDF/image/attachment bytes or an actual derivative.
Text is an immutable saved payload with explicit encoding and digest basis; it
may be stored in protected content records rather than an object store. Locator
holds a supplied URL/origin description; sensitive query values remain protected.
A snapshot adds an independently identifiable captured text/binary representation;
the locator is not proof those remote contents were fetched.

Derived material retains precise parentage: OCR text from the page raster, raster
from the original PDF; no geometry copied between raster versions. V1 uses within-
Source derivatives and multiple Run inputs for combined Sources, not arbitrary
cross-Source variants. Retain only derivatives actually needed for extraction or
inspection. New bytes/text always mean new Representation identity; storage
availability can change on the same identity without mutating material.

## E. Shared byte seam

The buckets below classify **current callable code versus the required seam**.
Direct reuse does not mean permission to change or execute the receipt lifecycle.

| Capability | Bucket | Smallest future seam / reason |
| --- | --- | --- |
| Owned draft copy | EXTRACT SHARED PRIMITIVE | E2 copies before use, hashes owned bytes. Extract exact copy/owned-path verification with caller-owned destination and metadata; receipt draft directories/sidecars remain receipt-owned. |
| MIME/signature validation | EXTRACT SHARED PRIMITIVE | E2 signature recognition reusable for currently supported formats; separate sniffing from caller limits/aliases/messages. Do not claim full malformed-PDF/image validation or email support from a signature check. |
| SHA | REUSE DIRECTLY | E2 `receiptBytesSha256` is a byte digest helper; underlying `expo-crypto` and server `node:crypto` already exist. Can later move/name neutrally without behavioral change; hash is not Source identity. |
| Storage provider resolution | REUSE DIRECTLY | E3 provider key/interface/resolver for known provider; unknown provider remains rejected. Concrete bucket factory needs extraction below. |
| PUT/read/stat | EXTRACT SHARED PRIMITIVE | E3 generic operations but hard-coded receipt bucket/errors and upsert behavior. Parameterize trusted bucket binding in a shared implementation; keep existing receipt wrapper/default unchanged. Source writes require immutable identity/integrity admission. |
| Verified recovery | EXTRACT SHARED PRIMITIVE | E5 size/hash-checked authenticated fetch/cache mechanism; caller supplies authorized fetch, Account-owned destination and expected metadata. Receipt transport/server ID/path assumptions cannot be reused directly. |
| Claim/retry | EXTRACT SHARED PRIMITIVE | E6/E7 Account-owned leases, interruption recovery and failure classification are patterns to reuse in existing infrastructure. Receipt SQL/store/operation kinds remain financial; no second independent retry engine. |
| Cache eviction | EXTRACT SHARED PRIMITIVE | E5 verified recovery proof and guarded metadata-clear-before-delete are reusable. Receipt table/pending/payment/tombstone predicates and quota are not Source policy. Source retention supplies its own protection predicate. |
| Image normalization | DO NOT REUSE as original persistence | E2 archives resized JPEG/PNG and removes temporary material. Source originals cannot follow this destructive replacement. Native image operations may later generate explicitly versioned derivatives only. |
| Receipt queue / worker | DO NOT REUSE | E6 waits for Expense parent, uses receipt IDs and upload/link lifecycle. Do not enqueue Source operations into it or reinterpret its operation types. |
| Receipt DTO / parser review fields | DO NOT REUSE | E9 limits MIME/size, single Expense and receipt OCR suggestions; cannot carry mixed representations, run/candidate or durable field provenance. |
| Receipt ACL | DO NOT REUSE | E4 financial read grants and uploader lookup differ from private Source policy; associations must grant nothing. |

Minimum seam is **caller-bound owned-byte/integrity handling plus bucket-bound
authenticated storage operations**, retaining receipt wrappers. Use the existing
sync infrastructure's scheduling/ownership patterns when a later slice is
approved; do not create a Source upload engine to avoid one small extraction.
Reusable interface shapes are not justification for a new plugin architecture,
provider factory catalog or generic asset repository.

Source registration must bind Representation ID to immutable expected size/hash/
MIME before PUT. A replay can only write the same bound bytes. Current provider
upsert must not permit different content at an established Source object key;
validate before write and serialize conflicting registration/PUT completion.
Verification after upload must match the registered descriptor. Any overwrite
with changed bytes is a new Representation, not another PUT to the old identity.
Exact Source admission/conditional-write contract remains C-I3A/C-I3C work.

## F. Storage boundary

| Option | Authorization / retention / migration / reuse |
| --- | --- |
| Same private receipt bucket, separate prefix | Technically possible with carefully separate routes; couples bucket MIME/size policies, cleanup and accidental listing/ACL assumptions. Lower bucket count is not lower Ledger risk. |
| Separate private Source bucket, existing provider | Preferred. Separate policy/retention envelope and cleanup inventory without changing receipt bucket, while reusing PUT/read/stat implementation. One additive storage boundary, not another provider. |
| Defer all physical choice | Avoids premature deployment, but leaves reuse and retention blast radius unresolved for preflight. Keep name/limits deferred while choosing isolation now. |

Recommend separate private bucket on the **existing** provider, with final bucket
name, resource limits and provisioning deferred. No bucket is created here.
Object keys are server-constructed from validated Trip/Source/Representation
identities, not filenames, email subjects, URL strings or client-supplied paths.
Treat acquiring Account as metadata/admission, not a naming scheme that leaks
identity to target viewers. No public URL or client business-table/storage bypass.

Storage service access follows backend Source authorization, not membership in
the receipt reader set. Listings/presigned paths must not bypass that boundary;
signed delivery, if later chosen, needs separately reviewed expiry/revocation
handling and must not be synchronized as permanent evidence access. Text/locator
payloads need not use this bucket at all.

E3's provider has no delete method. An explicit scoped purge capability is a
future requirement with owned-object/ref checks; do not pretend current PUT/read/
stat already implement purge or introduce a second provider to obtain deletion.

## G. Source ACL

Minimum enforceable V1 is **private acquisition under existing Trip admission**.
Evaluate Account equality and admission at the backend on every protected operation.
Person selection/participation never grants Source access. Default derivatives,
runs/candidates, capture manifests and excerpts inherit Source restriction.

| Operation | Proposed V1 admission |
| --- | --- |
| Create Source/replacement/run | Authenticated acquiring Account equals Actor; existing `canWriteTrip` for exact Trip; validate input ownership and expected versions. |
| Read full metadata/material/runs | Actor equals acquiring Account and existing `canReadTrip`; Source is not logically deleted for active content reads. |
| Read historic protected lineage | Same owner+Trip admission, with retention/redaction policy; deletion does not make retained historic content a public endpoint. |
| Register/upload/derive/purge | Same acquiring Account plus current Trip write admission and operation-specific lifecycle/integrity/protection checks. |
| Confirm from selected Sources | Actor has read rights to every selected Source/representation, current review/input bindings, and owning target's mutation rights. |
| Create/unlink association | Source owner+Trip admission and target's explicit evidence-link action authority; target write alone never permits inspecting an arbitrary Source. |
| Delete target | Owning-domain authority only; internal cleanup deactivates affected associations without granting Source reads to target deleter. |

Another collaborator who cannot read a Source **cannot confirm using it**, even
if able to read its Booking. They can author independent target changes under
target authority without referencing protected candidates/evidence. Multi-Source
V1 confirmation therefore requires all selected Sources to be readable by the
Actor; cross-uploader collaborative review/sharing is deferred. C-I1 distinguishes
uploader and confirmer conceptually; it does not require V1 to grant both access.

Current E1 predicates are concrete compatibility admission, including creator
and legacy membership paths. They do not implement reviewed future revoke/deny
semantics. Do not silently tighten/reinterpret them or derive rights from
`participation_active`. Source privacy is an additional owner condition, not a
Track A role change. Current authority can express this restricted V1 rule;
there is **no current admission blocker for owner-private scope**. If the product
requires another uploader's material or creator-denial/leave freshness guarantees,
those are exact dependencies on separate access work, not permissions invented here.

No Source store, policy enforcement or per-target evidence-link action exists
yet. C-I3A must specify backend-only/direct-client denial and validation coverage;
no business-table write grants are implied. Storage service credentials alone
must never replace the Actor admission check. Failure should not distinguish a
missing private Source from a forbidden one for an unauthorized requester.

## H. Provenance ACL/redaction

| Read level | Authority | Minimum returned information |
| --- | --- | --- |
| Canonical target field | Owning target read authority | Its accepted field value; domain privacy applies. No implied source-material access. |
| Provenance summary | Target read authority, target-authorized projection | Generic evidence-linked/restricted/unavailable indicator as permitted; no protected IDs or historical values. |
| Sensitive provenance | Target read authority **and** Source read rights for each contributing support | Allowed proposal, exact accepted-value history/reference, locator/excerpt, acquiring Actor and source details, subject to retention. |
| Raw material | Exact Source read authority | Authorized original/derived text/bytes; target visibility is irrelevant. |

For a shared Booking with a private Source, return canonical fields only as the
Booking permits, plus a restricted-evidence indicator. Redact Source/Representation/
Run/Candidate/Confirmation IDs, source filename/kind/URL/part, uploader identity,
booking-reference excerpt, traveller text, addresses, old proposal/edit values,
page geometry, counts of hidden Sources and storage paths. Do not echo a protected
booking reference through an error, debug payload, bulk pull or replay response.
Knowing a canonical field is not permission to read its original or previous value.

Typed target references and correlation IDs used internally are not client
entitlements. A target-authorized opaque association action handle may support
its own-domain operations only if explicitly specified later; it must not allow
enumerating Source IDs/material. Minimum V1 can show restricted evidence without
providing such a handle. User-entered provenance can be a safe origin summary
when the target permits it; do not expose private author history by default.

For mixed-support fields, filter **each support** independently; do not serialize
the full Confirmation bundle because one Source is readable. Filter discovery,
list counts and cursor events as well as detail reads. Store immutable original
bundles under protected authority and build safe projections on read; do not
destructively redact the durable history merely for one viewer. Local caches
are Account-scoped and receive only that Account's allowed payloads.

Confirmation records belong to the Actor for intent/operational reads; sensitive
support content additionally requires current Source rights. A target viewer
cannot fetch the whole record through its target ID. Domain operation receipts
follow their own read policy; C must not copy a broader receipt response into a
less-protected provenance summary. Sharing wider canonical values is a deliberate
admitted domain confirmation, not implicit publication of input evidence.

## I. Association/revision pinning

Association persists independent ID, Trip, logical Source ID, allowlisted target
kind/canonical ID, purpose, active/inactive state, Actor/time and originating
Confirmation if present. Keep action/lifecycle history. Domain adapter checks
target existence/same Trip/evidence action authority; no arbitrary table name
or unvalidated UUID becomes a canonical target.

One active relationship per `(Trip, Source, targetKind, targetId, purpose)`.
Stable association intent key/payload handles replay; concurrent duplicate
requests converge to the same active relationship. Reattachment records history
and an explicit new intent; it cannot erase a prior unlink. N:M is unrestricted
semantically, independent of Expense max-three. Source revision is not part of
this logical relationship's active uniqueness.

| Lifecycle event | Persistence/result |
| --- | --- |
| Unlink | Mark this relationship inactive with Actor/reason/time; retain historical confirmed supports; target and Source survive. |
| Logical Source delete | Tombstone Source, deactivate its active relationships with source-delete reason; no business cascade. |
| Target delete | Domain-owned delete; deactivation/history records the exact typed target and reason, without Source purge. |
| Source replacement | Association remains to logical Source; no evidence version is repointed. |
| New field confirmation | Append exact new output-revision supports; old supports and links stay historical. |

**Deterministic preview rule:** in a target's evidence context, show the exact
representation/revision supporting the current confirmed target field/output.
If several supports exist, expose their actual versions to authorized readers,
without selecting Source.currentRevision as a substitute. A link-only association
records its explicitly selected attachment revision/representation as an optional
preview binding, without claiming field extraction. V1 link-only creation should
provide that binding. A generic unpinned association has no default material
preview; authorized readers must deliberately select a revision.

Thus B1 supported by S1/revision 1 remains linked to S1 after revision 2 arrives.
B1 evidence opens revision 1, labelled historical/current-supporting as appropriate.
If those bytes are unavailable, show unavailable; never open revision 2 instead.
The Source detail context, separately, shows its latest capture. A new reviewed
confirmation may pin B1's new field revision to revision 2; it cannot rewrite
the previous accepted support. Manually changed fields may have user-entered
current provenance and only historical extracted support; do not present the old
extraction as evidence for the new value. No UI is implemented by these read rules.

## J. Confirmation persistence

| Durable component | Required contents |
| --- | --- |
| Header/identity | Confirmation ID, Actor Account, Trip, actor-scoped idempotency key, immutable payload digest/schema version, recorded/accepted times. |
| Reviewed input | Exact Run/Candidate IDs/generations, Source revisions/Representation integrity, selected proposal fields, explicit edits, Person mappings and disposition. |
| Output slots | Stable slot IDs, allowlisted adapter/intent kind, create identity expectation or update target/base revision, reviewed field set, association purposes and preview/support bindings. |
| Dispatch binding | Exact owning-domain operation ID/key and payload digest, target-kind/Trip/Actor binding, prepared/dispatched observation. Persist before execution. |
| Outcome | Authoritative domain receipt reference, target ID/revision, success/no-business-result/failure classification, association/provenance finalization state. |
| Recovery metadata | Pending, dispatched outcome-unknown, domain-success/evidence-pending, complete or rejected/conflicted; retry due/attempt metadata belongs to existing work infrastructure, not intent mutation. |

Immutable intent is separate from operational status. Same key/same payload
returns original per-slot results; changed payload conflicts. Accepted intent
cannot be edited to switch candidate, revision, target or field. New human review
requires a new intent/key, with explicit predecessor/reference where relevant.
Create, update, link-only, reject and defer have different outcomes: reject/defer
produce no domain command or target receipt; link-only never changes field origin.

Per-slot identity prevents retry from adding outputs. A canonical create records
a stable intended identity if the domain accepts client IDs; otherwise its
atomic receipt must map the stable operation to the generated ID. Never generate
a new business ID/key on retry. A reviewed Candidate/output-purpose binding also
prevents an accidentally new Confirmation key from silently consuming an already
committed create twice. A deliberate second object from the same evidence needs
an explicit distinct create intent, not detection by hash/name.

Selected field provenance is an immutable bounded bundle bound to resulting
target revision and domain receipt. Prefer immutable revision-bound references
to accepted values when the domain retains them; otherwise retain a protected
accepted-value snapshot sufficient to explain the original decision. C stores
history/support, not a second editable current target. Exact proposal values and
manual-edit facts remain retained even if later extraction differs.

Keep successful slots and their receipts when sibling slots fail. Confirmation
aggregate status is derived from actual slot outcomes; “partial” is not a rollback
instruction. Error records use safe codes/correlation, not raw material/provider
responses or private target snapshots exposed to unauthorized viewers.

## K. Domain adapter/recovery

| Direction | Benefit / limitation | Decision |
| --- | --- | --- |
| A: One synchronous transaction containing all domains and evidence | Atomic for a single shared database, but couples Track C to domain internals and does not cover local/server boundary or heterogeneous later domains. | Not the primary architecture; small C-only finalize transactions remain useful. |
| B: Durable owning-domain operation/receipt | Strong commit/replay proof; requires each target domain to own an atomic receipt with its mutation. | Required safety primitive; existing Ledger principle is evidence, not a reusable Booking API. |
| C: Narrow idempotent adapter with recovery | C prepares exact intent, invokes domain command, recovers its receipt and finalizes evidence independently. Handles partial results without universal mutation. | Choose C **built on B**. A generic best-effort orchestrator without B is insufficient. |

Each integrated owning domain exposes a **typed** operation/admission path and
replay/lookup result for its exact operation. It validates its own schema, Track B
interpretation, exact Persons, current permissions and expected revision. Track C
passes reviewed input through that adapter; it never constructs arbitrary SQL,
table names, patch paths or a mutate-anything request. Only concrete approved
target adapters are accepted; unspecified Booking/Credential/Pool domains remain
unavailable rather than routed through a generic fallback.

Required sequence:

1. Persist immutable Confirmation/input/slot bindings locally and, before remote
   domain dispatch, durably register the server-side binding. Check Source rights,
   target rights, input versions and current run selection; dispatch uses exact
   prepared payload. A refreshed input cannot silently substitute for review.
2. Persist the domain operation key/binding before first call. The domain atomically
   commits business mutation **and** its immutable operation receipt/replay mapping,
   scoped to Actor/Trip/operation/digest. Enforce duplicate admission under concurrency.
3. On response or restart, obtain that exact receipt. A lookup must distinguish
   committed result, rejected/conflicted result, pending/unknown and proven absence.
   A new target listing or content similarity is never proof of this operation.
4. Record verified domain receipt/result, association intents and field support
   as a small C persistence transaction where possible. If interrupted, finalize
   those exact records idempotently; no new domain create/update is dispatched.
5. Expose domain-success/evidence-pending explicitly until C finalization completes.
   Preserve target availability; never delete/compensate committed business truth
   merely because an evidence step failed.

Receipt correlation includes adapter/contract version, domain operation ID/key,
Actor/Trip, intent digest, target kind/ID and committed revision. C verifies all
bindings; a receipt for another Account/Trip/slot is invalid. Domain receipt read
authorization still applies. Replay of an already committed operation returns
its original receipt even if the target subsequently advances, rather than
re-executing it against a changed baseline. This does not bypass current permission
checks for new execution or expose prior sensitive data after access loss.

| Failure / race | Required recovery |
| --- | --- |
| Target created, response lost | Outcome unknown; lookup/replay same exact domain operation. Never change create ID/key. |
| C crashes before output ID recorded | Durable dispatch binding survives; domain receipt recovers output ID/revision. Receipt must have committed with target, not in a later best-effort write. |
| One output succeeds, another fails | Preserve successful receipt/provenance; only unresolved/retryable slot continues with its own binding. Explicit new review for terminal/conflicted slot. |
| Confirmation replay | Return original dispositions/results and resume incomplete C finalization; no duplicate targets or associations. |
| Update base changed before first commit | Domain rejects/conflicts exact base. New review binds new baseline and a new operation; no blind rebase. |
| Association write fails after target commit | Keep domain-success/evidence-pending; retry C-only association/support finalize. Do not issue another domain mutation. |
| Source replaced/new run before undispatched slot | Invalidate review selection; require new review, not input substitution. Already committed receipt remains valid. |
| Source deleted/access lost while outcome unknown | Stop new dispatch. Recover receipt only under authorized internal/result policy; preserve correlation and protected history. No retry that can newly execute a command from deleted/forbidden material. |

Logical deletion freezes undispatched intents. A dispatched operation may already
have committed; cancellation is not evidence of absence. Retain outcome-unknown
bindings and do receipt-only recovery before releasing protection or changing
disposition. Known committed outcomes may finalize **historical** provenance after
Source deletion, with inactive associations and inaccessible material; do not
reactivate Source links or publish content. If no commit is proven, do not launch
new execution after deletion. A domain lacking safe receipt lookup/replay is an
exact **implementation blocker for its adapter**, not a reason to add a generic
command bus or silently claim crash safety.

## L. Run/Candidate persistence

Run retains ID, explicit stable input scope, monotonic generation within that
scope, exact source/representation/version/hash inputs, extractor configuration
version and execution/supersession state. Multi-Source inputs are first-class
sets with validated ownership, not concatenated unnamed files. Unrelated scopes
have no global generation order. Input availability and extraction state are
orthogonal; no automatic semantic precedence from upload completion.

Candidate has durable ID, Run ID, proposed target kind, bounded typed fields,
unknowns/conflicts and selected field support references. Publish immutable
candidate payload atomically with ready-run output; never reveal partially written
Candidates as complete. Version payload validation; bound count/size in a later
contract, without importing Expense's limits. No entire model response, full OCR
token warehouse, embeddings or prompt archive is required.

Candidate field support names exact Representation/source revision and optional
locator/excerpt with precision basis. Run-only support is insufficient for a
mixed screenshot/email field. Confidence includes recognizer/extractor origin
and scale if known; not a universal probability or confirmation criterion.

Review drafts and reject/defer/accept dispositions are separate from immutable
proposals. Commit dispositions to Confirmation slots with accepted result mappings;
do not overwrite a candidate field when the person edits it. Restart retains
review/input binding. New extraction creates new Run/Candidate IDs; newer scope
generation supersedes unreviewed older selections. Accepted old candidates and
input manifests stay traceable. A late old result cannot become the current run.
Overlapping input sets require explicit review, not automatic supersession/merge.

Session remains a transient workflow reference to Sources/runs/review drafts.
It owns neither Source identity nor Candidates. Cancel removes only owned unsaved
staging/draft intent; committed or shared durable records and dispatched unknown
operations survive for safe recovery. No full Session schema or worker is defined.

## M. Track A/B boundaries

### Track B

B-T1 defines semantic cases; B-T2 recommends event-owned canonical schedule
components and exactly two transport endpoint children, not a shared temporal
registry. Track C's versioned Candidate payload may carry the **proposed same
semantic components** through an owning-domain validator. It must not define
another independent editable time/place schema or normalize every fragment to UTC.
Contract/version identifiers are required; actual exported types/wire fields do
not yet exist and are not fabricated here.

| Proposed evidence | Required B-owned interpretation boundary |
| --- | --- |
| Calendar/clock/instant | Calendar-only, local clock/precision, exact/estimated/unknown quality, civil versus source-confirmed instant basis, independently accepted zone/offset and unresolved DST choice. |
| Transport | Independently role-tagged origin/destination place and temporal facts; no inherited Trip/device zone, single-place shortcut or inferred route. |
| Stay | One span with check-in/check-out roles, dates/unknown clocks, exclusive occupancy end; nights derived from local date intent, not elapsed hours or cloned daily events. |
| Place | Authored text/address and accepted/manual target distinct from provider enrichment; provider resolution optional, input/version bound. |
| Ambiguity/confidence | C retains raw wording and extractor evidence; only explicit B/domain validation and human acceptance establish interpretation. |

Example “Dec 16, 09:00” remains a proposal with year/zone unresolved unless supplied.
No Trip-date year inference, midnight for missing clock, device-zone backfill,
automatic DST resolution or place match as creation gate. Candidate proposal can
preserve source instant and inconsistent civil text separately for review; it
cannot publish a contradictory pair as accepted truth.

Owning domain stores accepted B components plus minimal semantic evidence/binding
required by B-T2 U (precision, zone acceptance, derived rule/input, location input).
C stores document/extraction/confirmation lineage and revision-bound support.
The domain may hold a typed opaque C evidence reference rather than duplicate
document bodies or full histories. C's immutable accepted-value snapshot, where
needed, is historical evidence, never a second current schedule. Final field
keys are adapter-owned, not a Track C universal patch vocabulary.

B-T2 recommends new plan occurrences/Stays under `itinerary_events`; reservations
retain commercial/legacy facts. C's PDF examples therefore do not mandate a new
Booking table or simultaneous Event/Reservation pair. Domain schedule ownership,
wire types, writer protection and lossless offline projection must be approved
before concrete output adapters activate. Review-pending B documents cannot be
mistaken for implemented rich itinerary commands.

### Track A

TripPersonId remains `journey_members.id`, scoped to existing `trips.id`.
A1-I2A now persists passive participation state/revision and a nullable local
observation. It does not supply lifecycle commands, fresh selection observation,
revoke/leave semantics or Source access. Null is unobserved, never inferred active.

Candidate traveller/contact names, email, uploader and booking contact remain
raw evidence until exact existing TripPerson IDs are explicitly selected and
validated by the domain under Track A's selection rules. Inactive/unknown
participation handling belongs to the applicable approved selection contract;
C-I2 does not filter historic assignments or invent its own freshness rule.
Whole-group selection records exact reviewed Persons, not all future Members.
Source permission is Account authority, not Person participation or Account link.

## N. Delete/purge/retention

Persistence separates Source lifecycle, Association lifecycle, Representation
availability and protected operation/history. Do not collapse them into one
deleted flag or receipt tombstone. Record Actor/reason/time, expected revision,
affected immutable identities and outcome where relevant.

| Technical condition | Allowed action / preservation |
| --- | --- |
| Protected pending acquisition/upload/extraction/review | No automatic deletion of required originals/inputs/bindings. Owned abandoned staging may be cleaned only after proven absence of durable references/work. |
| Dispatched Confirmation, outcome unknown | Retain operation correlation and required evidence; receipt-only recovery before treating as canceled/unreferenced. |
| Confirmed-supporting evidence | Retain original/source revision, selected proposal/decision/support identity by default; never auto-delete history because the current field changed. |
| Unassociated Source | Valid saved material, not an orphan inferred safe to delete. No automatic age-based removal selected. |
| Logically deleted Source | Hide active material, stop new extraction/dispatch, deactivate links; preserve minimum referenced history and pending correlation. Eligible for explicit reviewed purge only. |
| Physically purged Representation | Record unavailable/purged with identity/integrity/parentage retained where permitted. No false local/remote recovery promise; target unchanged. |
| Lost bytes | Distinguish local cache absence, remote absence, corruption and confirmed last-copy loss. Do not label network error permanent loss. |
| Derived cache | Evict reproducible/unreferenced copies only when no pending dependency, confirmed locator requirement or offline protection applies. Regenerability must be proven from retained parents/version. |
| Redacted history | Explicit authorized security policy, not viewer-specific overwrite. Preserve removed-evidence markers and minimum permitted identity; no legal retention period chosen. |

Automatic eviction may remove a **duplicate local copy** after verified recoverability,
current authorization, dependency/pin checks and guarded URI clear; it must never
purge the last original, an unuploaded/local-only input, pending review material,
receipt correlation, confirmed support identity or a nonregenerable referenced
derivative. A stale “uploaded” flag is not recovery proof. C-I1's default original
retention remains; no storage quota silently overrides it. Offline pin semantics
need later contract; until protection can be proven, do not evict.

Physical purge revalidates owned path/object, exact Representation integrity and
all remaining uses. V1 need not deduplicate physical bytes; if later shared
storage is introduced, deleting one Source must not purge bytes referenced by
another Source. Logical deletion permits retaining confirmed history without
requiring all original bytes forever. Security-mandated erasure/redaction and
exact purge authorization remain review gates, not inherited Expense policy.

## O. Offline projection

| Projection | Minimum local responsibility |
| --- | --- |
| Source/revisions | Stable IDs, Account/Trip scope, lifecycle/current pointer, referenced capture manifests and protection metadata. |
| Representations | Exact descriptors/parents/digests, Account-owned URI/local verification, independent remote binding/status, missing/purged markers. |
| Associations | Authorized active relationships and needed history; restricted target summary separate from private Source metadata. |
| Run/Candidate | Immutable input/version/proposal/support bundle, execution/generation, unresolved fields; survives restart. |
| Review draft | Actor-owned selected inputs/proposals/edits/Person choices, baseline bindings; no canonical success claim. |
| Confirmation | Stable intent/slot/domain operation bindings, pending/unknown/result state, immutable receipts and evidence-finalization status. |
| Canonical targets | Existing owning-domain local projection and pending intents; not copied into a Source-owned editable store. |

Only authorized Account projections can be hydrated/read. Private Source discovery
cannot come through an unrestricted Trip pull; filter rows/payloads/events before
hydration. Query and async completion check active Account/generation; account
switch cannot display another Account's URI, candidate, pending command or receipt.
Source owner and local cache Account are explicit distinct fields where needed.

Offline bytes, transfer state, extraction state and canonical target state are
four independent axes. Local extraction can be ready while upload is pending;
verified remote bytes can be unavailable locally; domain success can coexist
with evidence-finalization pending. Preserve explicit unknowns on restart.
Do not automatically mark canonical confirmation committed because a local
review draft exists. Any local canonical write is admitted through the future
owning-domain repository/command contract; remote operation correlation follows K.

Reuse existing durable sync ownership/scheduling when later implemented, without
defining a new worker here. Expired access token/network failure preserves valid
local session/cached permitted targets; remote operations wait. Missing evidence
cannot gate cached target access. New Source metadata writes remain local-first
intent, with remote admission authoritative on synchronization; pending local
status does not prove a server grant. Offline revocation/cache trust remains the
existing Account/Trip contract, not a new Track C freshness mechanism.

## P. Non-file Sources

| Input | Proposed persistence |
| --- | --- |
| Pasted text | Source plus immutable text payload/Representation, encoding/digest, exact saved revision. Staging edits are not revisions until persisted. No binary MIME/path required. |
| URL locator | Source plus protected locator Representation; no fabricated fetched bytes/hash. Snapshot is a separate captured representation/revision with actual capture time/completeness. |
| Email body | One acquired message Source, immutable body text/structured part; optional supplied full-message original. Preserve whether headers/full message were actually acquired. |
| Email attachment | Distinct original binary Representation/part in the message Source; field supports distinguish attachment versus body. Independently acquired file may be new Source with explicit origin relation. |

One Source may mix text/locator/binary representations. Do not use empty filename,
zero-byte PDF or fake upload-complete row to make nonfiles fit receipts. Email
body and attachment stay related but individually addressable; late attachment
requires a new explicit material manifest, not editing the historical message.
No mailbox, Gmail, URL scraper or Share Extension is designed.

## Q. Receipt compatibility

This is a preflight isolation proof, not a fresh runtime regression certification.
Only this document changes. E2–E6/E9 demonstrate why Source cannot be substituted
into receipt code; D2 supplies the full audited financial compatibility evidence.

| Existing behavior | Preservation rule / no-impact evidence |
| --- | --- |
| `receipt_assets` and local receipt rows/IDs | No edits/migration/mapping; distinct Source/Representation semantic namespaces. |
| Expense max-three | Remains Expense-only; Source association cardinality never updates its counter/constraint. |
| Receipt tombstones/restore/reparent rules | Remain in receipt domain; Source delete/purge has independent persistence. |
| Personal Payment evidence | No link-table/one-payment-cache or read-grant changes; Source links cannot become payment evidence. |
| Settlement/Transfer evidence | Existing optional evidence IDs and financial mutation/revision/finality remain untouched. |
| Financial read grants | Existing Expense/Journey/payment ACL unchanged; Source owner checks cannot replace or extend them. |
| Receipt OCR/review | Existing OCR/parser/three-field unsaved Expense confirmation unchanged; new durable Candidates are not a migration of receipt scan sessions. |
| Current upload worker/queue | No new operation types, parent waits, bucket changes or Source insertion into financial queue. |

Later seam extraction keeps existing receipt wrappers with identical paths,
limits, normalization, errors/contracts and ACL admission. Neutral shared functions
accept trusted caller metadata; Source wrappers supply their own namespace/policy.
Before changing executable receipt callers, run existing byte/provider/lifecycle/
worker/cache tests and meaningful source-isolation checks. Stop if sharing requires
a receipt semantic migration. No new provider, financial adapter or receipt
migration is proposed for first Source foundation.

## R. Persistence options

| Dimension | A: Fully normalized core/children | B: Core + JSON-heavy runs/provenance | C: Explicit associations + compact confirmation/provenance | D: Domain-specific stores |
| --- | --- | --- | --- | --- |
| Queryability | Strong field-level joins, many records | Weak if targets/versions/slots hidden in blobs | Explicit IDs/scopes/targets/recovery state; bounded payloads for selected facts | Repeated domain query/lineage logic |
| Privacy | Fine-grained rows, more policy surfaces | Whole-blob leakage/redaction risk | Protected bundles + safe summary projections; per-support filtering required | Divergent policies and copies |
| Offline | Full relational mirror larger | Easy snapshot, conflict/blob replacement risk | Small keyed roots + immutable bundles + Account-scoped projection | Multiple mirrors/ownership patterns |
| N:M | Natural explicit joins | Difficult if associations embedded under Source | Independent identified association records | Repeated link implementations |
| Crash recovery | Strong if operation/receipt bindings included | Inadequate if per-slot dispatch/results are opaque mutable blob | Explicit per-slot binding/index/status and domain receipts | Inconsistent replay/correlation across stores |
| Future extraction | Full flexibility with unnecessary token graph tendency | Flexible opaque responses but harder version validation | Durable Run/Candidate IDs and compact typed proposals; no raw graph required | Separate candidate models per output |
| Implementation size | Largest normalized schema surface | Small initial write, large read/privacy/recovery work later | Moderate minimal records for concrete guarantees | Small isolated starts, larger cumulative infrastructure |
| Receipt isolation | Good if separate core | Good if separate core | Strong Trip-only ownership and explicit shared byte seam | Good initially, duplicate byte pipelines likely |
| Reversibility | Additive but many dependent children | Harder to extract implicit identities/history | Clear identities/versioned payloads allow later normalization | Consolidation needs identity/provenance migration |

Choose **C**, retaining the useful compactness of B without burying admission,
association or operation recovery facts in arbitrary JSON. Candidate fields and
selected support may be compact payloads, but queryable scope/identity/target/
version/outcome anchors are mandatory. This narrows C-I1's Trip-only core; it does
not authorize schema creation or a universal document platform.

## S. Golden scenarios

Each case resolves persistence, access, pinned evidence, confirmation/recovery
and lifecycle behavior. Cases describe future contracts, not current features.

| # | Case | Persistence and pinning | Access | Confirmation/recovery and lifecycle |
| --- | --- | --- | --- | --- |
| 1 | PDF → one flight | S1/original R1, exact run/candidate and independent output association; selected fields pin material revision. | Acquiring Actor under Trip admission; target viewers get redacted summary. | Typed plan/domain adapter using B endpoint concepts; domain receipt maps exact output, later Source loss leaves flight intact. No mandatory Booking/Event pair. |
| 2 | PDF → outbound + return | One Source, C1/C2, two independent slot/target/association bindings. | Same private Source rule; no reader union. | Partial acceptance allowed; each domain receipt recovered independently; unlink one leaves the other. Missing year/time stays unresolved. |
| 3 | Three screenshots → one Stay | S1/S2/S3, one multi-input Run/Candidate, field supports pin each contributing image; three Source links. | Actor must read all selected inputs. | One B-owned Stay span, unknown clocks retained; one output receipt, no daily object clones. Removing one image does not delete Stay. |
| 4 | Evidence attached after manual Booking | Existing typed target; Source association with explicit preview revision, no extracted field support invented. | Actor has Source and target evidence-action rights. | Link-only intent/replay; user-origin fields unchanged; unlink affects evidence only. |
| 5 | Source replaced after confirmation | S1/current2, historic manifest1; logical association remains and accepted support pins R1/revision1. | Same owner policy, new capture grants nothing. | Target preview stays revision1; new explicit reviewed update required to pin revision2. No canonical overwrite. |
| 6 | Private Source → shared Booking | Private S1 and typed association; protected provenance stored separately from summary. | Association grants nothing; no Source reader union. | Deliberate allowed canonical values may be shared; byte/excerpt access stays private, deletion retains Booking. |
| 7 | Target viewer lacks Source rights | Return target projection and permitted restricted-evidence indicator, no Source identifiers/material. | Target read does not grant any protected read level. | Viewer cannot confirm using private candidates; may make independent target intent if domain permits. No preview fallback to another revision. |
| 8 | Booking-reference provenance redacted | Reference/history/excerpt retained in protected bundle; safe projection omits them. | Each support and record read checks Source and target rights. | Allowed current target reference is domain-owned; historical/extracted reference not echoed. Replay/error/list paths must filter too. |
| 9 | Domain create succeeds, C crashes | Prepared slot/key/digest persisted; domain target and receipt committed atomically. | Replay/lookup checks Actor/domain policy; not a target-discovery workaround. | Receipt recovers exact output ID/revision; finalize C-only records, never another create. Pending evidence does not delete target. |
| 10 | Partial multi-output success | Slot A success/receipt, B pending or rejected, separate finalized support mapping. | Per-input/per-target rights checked; A rights do not authorize B. | Retain A; resume only B's exact retryable intent; terminal conflict requires new review. No cross-domain compensation. |
| 11 | Confirmation replay | Same key/digest returns same intent/slot mapping; duplicate association converges. | Current read policy applies; no private bundle leaked through replay. | Resume evidence-pending step only; committed domain receipt immutable despite later revision drift. Changed body/key reuse rejects. |
| 12 | Target revision changed before update | Immutable reviewed target/base and field set remain, not replaced with latest revision. | Domain rechecks mutation authority. | Conflict before mutation; new review/key for new baseline. Already committed operation replays its old receipt instead of repeating update. |
| 13 | Upload pending, extraction ready | Durable local original/hash, candidate-ready Run, remote pending independent. | Account-owned local projection, generation checks. | Review draft survives restart; canonical offline write follows future domain contract, not upload flag. Pending material protected from eviction. |
| 14 | Source remote, not local | Representation keeps verified remote binding and local-absent status. | Authenticated Source read for fetch; no public/receipt grant. | Recovery verifies bytes before owned cache use; network failure means unavailable locally, target cache still usable. No permanent-loss inference. |
| 15 | Logical Source delete after confirm | Tombstone and inactive associations; pinned history/receipt retained. | Hide active Source material; historic protected reads remain restricted. | Target survives; undispatched slots stop, unknown dispatch needs receipt-only recovery; no reactivation on delayed finalize. |
| 16 | Physical bytes purged | Explicit purge marker/Actor/time, retained minimal identity/integrity/lineage where permitted. | Separate purge admission/protection policy; no target-read purge right. | Targets/history survive; preview unavailable, never latest-byte substitution; protected unresolved operations cannot lose inputs automatically. |
| 17 | Identical PDF twice | S1/S2 distinct acquisition keys; same digest does not merge identity or field lineage. | Independent owner policy; content equality grants no rights. | Replay each acquisition separately; deliberate reuse required, no auto object merge. Purge S1 cannot destroy S2's needed bytes. |
| 18 | Email body + attachment | One message Source, distinct text/body R1 and binary attachment R2 with part/completeness; mixed Run support. | Both inherit owner restriction; body/subject not public metadata. | Field support names exact part; late attachment new manifest, old run unchanged. No mailbox lifecycle coupling. |
| 19 | Pasted text | Immutable text Representation/encoding/digest; no fake file path/MIME/zero-byte upload. | Protected like binary Source content. | Saved edits new material revision; link/create confirmation uses same replay/lineage rules. Delete text never deletes output. |
| 20 | Traveller names without mapping | Candidate preserves literal names/counts and unresolved exact Person assignment. | Source permission comes from Account, not named Persons or uploader-as-traveller. | Explicit Track A exact-ID selection only; no creation/merge/inference. B/domain handles participant completeness; historical assignments survive evidence loss. |

Scenario-specific unknowns are bounded by U: actual owning-domain commands,
typed B wire payloads, access/projection enforcement, safe storage limits and
retention/erasure admission are later deliverables. None requires a guess to
resolve the stated identity, privacy, replay or source-loss behavior.

## T. Implementation slicing

These are **recommendations only**, requiring separate authorization and review.
Do not treat lettering as automatic rollout order for incomplete dependencies.

| Later slice | Small boundary | Gate before progression |
| --- | --- | --- |
| C-I3A schema/access contract — design only | Exact record/identity/payload version, admission/redaction, storage/retention and receipt correlation contract; proposed additive migration scope, no application yet. | C-I1/C-I2 review; align accepted A/B/domain boundaries; direct-client denial and per-support ACL plan. |
| C-I3B local Source/Representation foundation | One bounded acquisition kind, Account-owned originals/metadata/revisions and restart-safe local read/write; no parser or Session. | Approved schema/ownership; integrity, staging failure and Account-switch checks. |
| C-I3C server registration/storage seam | Private Source boundary on existing provider, exact immutable registration/upload/read verification; preserve receipt wrappers. | Registration/concurrency and unauthorized-read checks; existing receipt regressions; no duplicate retry engine. |
| C-I3D associations/provenance | One approved existing target kind, N:M identified links, revision-pinned preview and safe summary projection. | Target evidence action contract, unlink/delete/replacement tests; source-inaccessible viewer cases. |
| C-I3E Run/Candidate | Durable compact proposals/versioning and review references for one approved input/engine, not engine choice now. | Stable input binding, late-result/restart/partial-review preservation, B typed payload validation. |
| C-I3F confirmation/receipt integration | One concrete typed owning-domain adapter, immutable slots and receipt-only recovery; selected field evidence finalize. | Domain atomic idempotency receipt exists; response loss/concurrent replay/update-conflict/partial-finalize checks. |

Association foundation may use a separately approved already-existing target
evidence contract; current rich Booking/Stay/flight commands cannot be presumed.
If no suitable target exists, keep C-I3D/F blocked rather than implement Booking
inside Track C. Run/Candidate design can precede executable engine work. Multi-
output, second input kinds and collaborator sharing come only after one approved
slice proves the required boundaries. No C-I3 slice begins in this delivery.

## U. Risks/unknowns

| Risk / dependency | Exact boundary and required resolution |
| --- | --- |
| Private provenance leakage | Highest security risk: full bundles, historical values, IDs or counts escaping via target detail/feed/replay/errors. C-I3A must specify filtered projections and Account-isolated hydration; linking never grants rights. |
| Domain commit/receipt gap | No generic future Booking command/receipt is established. Adapter activation blocked unless atomic domain mutation+receipt and exact authorized replay are available. C cannot prove commit from an output search. |
| B policy/wire readiness | Documents are committed, still review-pending; concrete accepted payload validation/writer protection/lossless projection must precede adapter implementation. No competing C schema. |
| A admission freshness | Current creator/legacy/member admission retained; I2A participation is passive. New denial/leave/freshness or other-uploader sharing requirements need their separate approved authority. |
| Shared seam regression | Bucket coupling, upsert and receipt normalization require narrowly extracted primitives; receipt caller behavior must remain identical. No migration solely for reuse. |
| Retention/redaction | Default original retention selected; purge/erasure authority and offline pin policy not finalized. No automatic last-copy deletion or invented duration. |
| Immutable payload bounds | Actual sizes/count limits/validation and candidate/evidence version names remain schema-contract work; no raw model/token dump. |
| Source replacement/deletion during dispatch | Persisted dispatch/result binding and receipt-only recovery needed; unknown does not mean uncommitted. Evidence finalization must not reactivate deleted links. |

These are implementation/review gates, not claims of remote drift or defects in
unchanged receipt code. Current owner-private V1 can use existing Trip predicates
without new roles; there is no need to change Track A to complete this preflight.
If a future requirement crosses those boundaries, stop that slice and request its
separate decision rather than broadening Track C.

## V. Acceptance matrix

PASS means design/preflight coverage and verified local change scope, not runtime
validation, human acceptance or implemented ACL/crash-safety guarantees.

| # | Criterion | Evidence | Result |
| --- | --- | --- | --- |
| 1 | Exact clean worktree/baseline confirmed | Header; startup pwd/branch/HEAD/status | PASS |
| 2 | Every C-I1 persistence responsibility mapped | B: eight concepts, identity versus record consolidation | PASS |
| 3 | Minimum consolidation selected | B/R: explicit anchors + immutable compact bundles | PASS |
| 4 | Source root/current revision and unassociated state | C | PASS |
| 5 | Revision manifest has durable address without unnecessary UUID | B/C | PASS |
| 6 | Binary/text/locator/derived representations supported | D/P | PASS |
| 7 | Integrity/storage/lineage/access separated | D/O | PASS |
| 8 | All requested byte capabilities classified | E: twelve capability rows, three buckets | PASS |
| 9 | Smallest sharing seam avoids financial inheritance | E/Q | PASS |
| 10 | Bucket/path/provider alternatives evaluated | F: separate private bucket, existing provider | PASS |
| 11 | Enforceable V1 Source metadata/material rights | G: owner + existing Trip predicates | PASS |
| 12 | No confirmation from unreadable Source | G/H; S7/20 | PASS |
| 13 | Four provenance read levels/redaction | H; S6–8 | PASS |
| 14 | Association identity/uniqueness/unlink/delete retained | I/N | PASS |
| 15 | Exact supporting revision/default preview resolved | I; S5 | PASS |
| 16 | Confirmation immutable intent/slot/result/retry persistence | J | PASS |
| 17 | Domain adapter alternatives compared | K: C built on atomic domain receipt B | PASS |
| 18 | Response loss/crash never permits duplicate replay creation | J/K; S9/11, required primitive and activation blocker explicit | PASS |
| 19 | Partial success/update drift/association failure resolved | K; S10/12 | PASS |
| 20 | Candidate/run/support/disposition/supersession durable | L | PASS |
| 21 | Track B typed proposal versus accepted truth boundary | M; D3/D4 | PASS |
| 22 | Transport/Stay/location ownership preserved | M; S1–3 | PASS |
| 23 | Track A passive Person state not access/name inference | G/M; D5/S20 | PASS |
| 24 | Delete/unlink/purge/loss/redaction distinct | I/N; S15/16 | PASS |
| 25 | Offline projection separates four state axes | O; S13/14 | PASS |
| 26 | Protected pending and original retention bounded | N | PASS |
| 27 | Nonfile mixed Sources need no fake file metadata | P; S18/19 | PASS |
| 28 | All requested receipt/financial behavior isolated | Q; E/D2 and document-only scope | PASS |
| 29 | Four persistence strategies across nine dimensions | R | PASS |
| 30 | Twenty golden integration cases resolved | S1–20 | PASS |
| 31 | Later slices bounded; no automatic implementation | T/U | PASS |
| 32 | Review and adapter/access/retention blockers explicit | A/G/K/U | PASS |
| 33 | Only requested document changed, sibling checkouts untouched | Final local Git scope | PASS |
| 34 | No SQL/migration/application source/test/config changes or execution | Document write only; no database commands | PASS |
| 35 | No remote access, AI/provider selection or deployment | Local read/write/static checks only | PASS |

Coverage: **35 PASS / 0 PENDING / 0 BLOCKED**. Separate gates remain **PENDING**:
human preflight review, exact schema/access/redaction/retention contract, accepted
B wire/domain integration, and atomic owning-domain operation receipts. Absence
of those receipts blocks the applicable later executable adapter, not completion
of a preflight that identifies the requirement.

Validation: all A–V sections, twenty scenario rows, thirty-five matrix rows,
local documentation/source references, whitespace/fences and final Git scope
checked. No runtime tests claimed or needed for a documentation-only change;
no dependencies installed, database opened or migrations executed. Only this
preflight document changes; current-state/ADR edits await acceptance and are
outside the explicit single-document delivery.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Remote access/mutation: **NO**. Migration created/applied: **NO**.
Application code changed: **NO**. Sibling worktrees modified: **NO**.

**STOP — C-I2 PREFLIGHT COMPLETE — REVIEW PENDING. No C-I3 implementation.**
