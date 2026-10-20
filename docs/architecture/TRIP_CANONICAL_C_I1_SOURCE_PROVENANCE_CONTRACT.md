# Trip Canonical Track C — C-I1 Source / Association / Provenance Contract

Status: **C-I1 CONTRACT COMPLETE — REVIEW PENDING**.
Date: 2026-10-03 (Pacific/Auckland). Design only; no implementation approval.

Baseline: `/Users/xoery/Project/otr-mobile-import`, branch `trip/import`,
HEAD `3d3f3ba553aa81a063491c73b33684e3bf197260`; initial status clean.
Only this document changes. No commit, migration, runtime, UI or deployment work.

## A. Executive decisions

The following are **recommended C-I1 contract decisions**, pending human review.
The supplied evidence/truth separation, financial compatibility, explicit
confirmation and identity constraints are established principles, not new policy.
“Must” below specifies the proposed contract if approved; it does not describe
existing runtime capabilities or authorize implementation.

1. Source is logical acquired evidence. Representation is an immutable material
   version, including stored text. Artifact is only shorthand for a stored binary
   representation, never another root identity.
2. Give each intentional acquisition a stable Source ID. Hashes check integrity
   and may suggest duplicates; they cannot identify or merge Sources.
3. Keep captured originals by default, for all V1 supported material. Derivatives
   cannot justify automatic original destruction; deletion is a separate policy.
4. Model independent typed Source associations with unrestricted semantic N:M
   cardinality. Business objects remain outside the evidence graph.
5. Keep durable field-to-source/representation evidence, immutable selected
   candidate values and confirmation history. Exact spans/regions are optional;
   full raw OCR graphs are unnecessary.
6. Durable run/candidate identities survive restart and partial acceptance. New
   extraction creates a new run; it never overwrites confirmed fields.
7. Confirmation binds actor, Trip, reviewed inputs, output intent, revisions and
   a stable replay key. Editing a proposal retains both extraction and user facts.
8. Unlink, logical Source deletion and physical byte purge are distinct. Canonical
   truth and historical lineage survive all evidence-loss cases.
9. Associations grant no implicit access. Source and target permissions must both
   be checked under existing authority; no new Track A roles are introduced.
10. Prefer a bounded Trip-only Source core, receipts unchanged, with reuse of
    proven byte infrastructure after separating Expense-specific dependencies.
    Source IDs and receipt asset IDs have distinct semantic namespaces.

### Baseline evidence and ownership

| Reference | Authority used here |
| --- | --- |
| [C-I0 audit](TRIP_CANONICAL_C_I0_IMPORT_ARTIFACT_AUDIT.md) | Sections B–K/E01–E14: existing file, receipt, OCR and review limits; L–Q: future evidence core; E21: separate financial evidence references |
| [A0 audit](TRIP_CANONICAL_A0_AUDIT.md) | Current Trip/root projections, identity and lossy temporal compatibility boundaries |
| [A1 identity contract](TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md) | Account/Person distinction; proposed access changes are not adopted by C-I1 |
| [A1-I1 report](TRIP_CANONICAL_A1_I1_REPORT.md) | Narrow implemented Person key: `journey_members.id`; cached Account isolation |
| [Current state](../CURRENT_IMPLEMENTATION_STATE.md) | Current handoff and review gates; historical sections are not authorization |
| [Architecture](../ARCHITECTURE.md), [data model](../DATA_MODEL.md), [API](../API_CONTRACT.md), [offline sync](../OFFLINE_SYNC.md) | Repository/backend/queue ownership; drafts do not establish generic Source runtime |
| [Terminology](OTR_TERMINOLOGY_GLOSSARY.md) | Account, Person, Participant, Receipt, Attachment and financial distinctions retained; no UI copy added |

Repository instructions and mandatory PRODUCT, ENVIRONMENT_AUDIT and legacy audit
documents were also consulted. Legacy Web source was not reopened.
The required `TRIP_CANONICAL_B_T0_TEMPORAL_SPATIAL_AUDIT.md` is absent at this
HEAD. No committed B-T1 temporal/spatial contract is present in this worktree's
committed docs inventory. This is a dependency gap, not permission to inspect or
modify a sibling worktree. AB defines the permitted opaque boundary.

## B. Canonical vocabulary

| Concept | Contract meaning |
| --- | --- |
| Source | Stable logical evidence origin acquired for one Trip: a PDF, screenshot, text paste, URL capture or email message. Not a Booking, Person or financial record. |
| Representation | Immutable captured or derived material belonging to a Source; may contain binary bytes, persisted text or structured locator metadata. Has its own ID and versioned lineage. |
| Artifact | Informal byte/file term for a binary Representation. No separate Artifact ID, lifecycle or mandatory table; APIs/types should use Representation when precision matters. |
| Association | Identified relationship from one Source to one typed target, with explicit purpose and lifecycle; not ownership of the target. |
| Extraction | Recognition/interpretation of exact material versions into proposals. OCR produces observations; semantic extraction interprets them. |
| Candidate | Durable run-owned proposal; zero authority to mutate canonical business data. |
| Confirmation | Recorded explicit human disposition and exact output intent; canonical creation/update succeeds only through the owning domain's admitted mutation. |
| Provenance | Durable account of inputs, transformations, selected proposals, actor decisions and resulting field/output revisions. |
| Support / Evidence | A claim that identified material contributed to a proposal or reviewed value; not verification that the value is true. |
| Canonical Output | Object/revision committed through its owning domain, such as a future Booking or Event; independent of evidence availability. |

| Vocabulary option | Assessment |
| --- | --- |
| A: Artifact = Source | Short for files, ambiguous for email/text and original versus derived pages. Reject as canonical root naming. |
| B: Source = origin; Artifact = bytes | Choose, with Representation as the precise material term and Artifact only an alias in prose. Handles nonbinary material without adding a root. |
| C: Artifact umbrella | Avoid: every reference would need to ask whether it identifies an origin, revision or file. Adds no necessary capability. |

PDF and screenshot are Sources with original binary Representations. Pasted text
has a text Representation. A captured URL has a locator and, when captured,
content Representations. Email can have a message/body and attachment
Representations. Page images and OCR text are derivatives with parent lineage.
Neither existing `receipt_assets` nor retained legacy “artifact” tables acquire
these semantics by sharing a name.

## C. Source identity

Source ID is a stable opaque locally allocatable identity, independent of filename,
URL, provider, storage path, hash and extraction outcome. The logical acquisition
records actor Account, acquisition kind/channel, capture time and a stable
acquisition operation key. Claiming a provider match is optional enrichment.

- Replay of the **same acquisition operation** with identical immutable input
  binding returns the same Source ID. A reused key with changed input is rejected.
- Deliberately importing identical PDFs twice creates S1 and S2. A duplicate hint
  may invite explicit reuse; byte equality never merges identity or authority.
- Acquisition event and material content are separate: a hash can be equal across
  different acquisition events; one Source can later have different captures.
- V1 persisted Sources have exactly one Trip scope, using existing `trips.id`.
  An unassigned input remains Account-owned staging, not an unscoped durable Trip
  Source. Assign before persistence/association. Global inbox is deferred.
- Trip assignment is stable once persisted. Cross-Trip reuse requires a separately
  authorized acquisition/copy with a new Source ID and explicit origin reference,
  not moving confirmed lineage or granting access across Trips.
- An existing Source can be deliberately reused in another review/session in its
  Trip without a new acquisition. It may have no association or extraction forever.

Source identity describes continuity of evidence chosen by a person. A replacement
PDF advances that Source's material revision only through explicit replacement;
otherwise it is a new acquisition. Never decide continuity from a hash/name alone.

## D. Representation model

Each Representation has stable ID, Source ID, exact capture/source revision,
role (captured original or derived), material kind, creation time and integrity
description. Binary/text payloads retain validated MIME/encoding, size and content
digest for that exact material; locator-only metadata must not pretend to have a
fetched-content hash. Storage locations and availability can change without
changing the immutable material identity.

Derived material additionally records parent Representation IDs, transformation
identity/version/options digest, and any page/part designation. Parent references
must resolve within explicitly authorized input lineage; V1 derives within one
Source and lets multi-Source extraction use run inputs rather than a universal
cross-Source transformation graph. A representation cannot be its own ancestor.

A PDF page raster, embedded text extraction and OCR text are different derivatives.
OCR confidence belongs to recognition evidence, not canonical-field truth.
No implementation, library, codec list or permanent variant catalog is chosen.

Payload mutation always creates a new Representation ID. Recreating byte-identical
material may reuse its existing immutable representation when lineage matches;
otherwise record a new derivative. Logical variant labels such as “preview” may
point to a newer ID but cannot rewrite historic parents or field references.
Mark whether regeneration is possible and which parent/version is required;
“derived” does not guarantee deterministic reproduction or available originals.
A derivative may outlive an unavailable original with lineage retained. It may
also be deliberately purged; neither case deletes confirmed outputs.

## E. Original retention

| Policy considered | Decision |
| --- | --- |
| Always retain captured originals by default | Recommended V1; simplest preservation rule for heterogeneous travel documents. |
| Retain only selected document classes | Defer classification; misclassification can destroy booking terms, QR/barcode resolution or legal evidence. |
| Keep only normalized canonical bytes | Reject for generic Sources; normalization is a derivative, not a replacement for original evidence. |

For accepted V1 acquisitions retain the exact captured PDF/image/attachment bytes
and exact saved text. A URL original is the **captured snapshot**, not a promise
to archive the entire changing website. An email original is the material actually
acquired: preserve full message bytes only if supplied; do not fabricate headers
when only body/attachments were supplied. Capture completeness must be recorded.
QR-bearing tickets, signatures and booking terms therefore remain inspectable.

This is bounded retention, not a permanent archive requirement. Retain originals
until explicit authorized deletion/purge under reviewed retention/security policy;
do not select a duration, quota or jurisdictional rule here. Cached duplicate
copies may be evicted only when verified recoverability and protected pending
work allow it. The last original copy must not be automatically deleted because
a derivative exists. If no verified remote copy exists, loss of a device copy
means loss of evidence and must be represented honestly.

Logical deletion may immediately hide Source content while leaving minimal
provenance metadata. Physical purge requires separate authorization/retention
admission; referenced metadata persists or is explicitly redacted under a later
reviewed security policy. No credential payload harvesting is required by V1.

## F. Association semantics/cardinality

SourceAssociation has its own stable ID, Trip, Source ID, typed target reference,
purpose, creating Actor/time, optional originating Confirmation ID and lifecycle
history. One Source supports zero-to-many targets; one target supports zero-to-many
Sources. The relationship is not `Source.targetId`, a receipt FK, or an implicit
financial link. FieldEvidence below is more precise than this object-level link.

V1 purpose distinguishes “attached evidence” from “supports confirmed output”;
neither means sole ownership, participant identity or financial liability. Purpose
is reviewed metadata, not an extensible action framework. Duplicate replay of the
same association intent returns the existing association. Maintain at most one
active association per `(Trip, Source, target kind, target ID, purpose)`; several
field supports reference it without creating duplicate object links. A different
purpose is explicit. Reattaching after unlink records a new lifecycle event and
retains earlier history; whether its ID is reused is a persistence detail, never
an opportunity to erase the previous unlink.

Association unlink affects one relationship only. Logical Source deletion
deactivates its active links, with a reason distinguishable from individual
unlink. No cascade reaches canonical objects. No generic max-three attachment
constraint is imposed; practical resource limits must be separately reviewed,
not inherited from Expense. Zero associations is valid saved evidence.

## G. Target typing

A target reference is `(TripId, targetKind, canonicalId)`, validated by the owning
domain's resolver. Same UUID string under different kinds is not the same target.
Do not accept arbitrary table names, remote URLs or unvalidated JSON as target
identities. Target existence, Trip scope, admission and retention are checked
without making Source code understand business schemas.

Possible future consumers include Booking/Reservation, Event, Credential, Note
and Pool objects. These are boundary examples, not an all-domain enum or an
authorization to implement them. Only actually integrated target kinds become
accepted. An extractor Candidate is addressed by run/candidate ID for lineage;
it is not automatically a canonical Pool object. A future Pool adapter must
resolve its own canonical ID and lifecycle explicitly.

Booking/Event participation, required fields, financial links and time/place
validation remain domain-owned. Missing/removed targets retain historical typed
references with unavailable status; they do not force Source or other targets
to disappear. Target deletion policy itself is outside C-I1.

## H. Field provenance

| Level | Benefit / limit | V1 decision |
| --- | --- | --- |
| A: Source only | Explains document origin, cannot identify which accepted field it supported. | Insufficient alone. |
| B: Field → Source and exact Representation | Distinguishes mixed inputs, accepted values and revisions without a token archive. | Required minimum, augmented by run/candidate/confirmation linkage. |
| C: Exact span/region | Useful for inspection; not always available for PDF text, paste or human correction. | Optional when produced and retained; never fabricate precision. |
| D: Full raw graph | Large sensitive payloads and engine-specific persistence without proven need. | Deferred. |

Minimum durable FieldEvidence identifies target kind/ID, output revision and
domain field key; confirmation and Actor/time; origin mode; selected candidate
and run when extraction contributed; each supporting Source revision and
Representation ID; and the exact selected proposal and accepted field value
(or an immutable revision-bound value reference). The selected proposal survives
reprocessing. Several supports can contribute to one field, and one material
can support many fields. It is legal to mark support unknown/whole-representation
where no reliable range was produced; absence of geometry is not missing identity.

Optional locator uses a representation-specific page/part, text offsets with
explicit encoding basis, or a region with an explicit coordinate system and
dimensions. Preserve the locator's reference version; do not carry OCR geometry
onto a different raster or call an approximate region an exact match. Retain
only selected field evidence and bounded supporting excerpts when justified,
not every recognition token or an entire provider response.

| Example field | Minimum support | Optional precision / limit |
| --- | --- | --- |
| Flight number | PDF representation + run/candidate and selected number | Page/text span; provider match is not required. |
| Booking reference | Original PDF/email attachment version + accepted string | Bounding region; sensitive reference follows Source policy. |
| Check-in date | Exact source version + candidate Track B payload + reviewed value | Text span; do not infer year/timezone from Trip defaults. |
| Address | Screenshot/text representation + candidate Track B place payload | Region/excerpt; geocoding enrichment has separate provenance. |
| Traveller name | Exact extracted name text and representation | Page/name span; no TripPersonId until explicitly mapped. |

Current field provenance points to its own accepted revision. Historical supports
remain available when a later manual update removes or changes current support.
An object-level association alone never claims every field was extracted from it.

## I. User-entered/extracted/confirmed semantics

| Origin/disposition | Meaning |
| --- | --- |
| User entered | Actor authored the field; no Source or Candidate required. |
| Extracted proposal | Run proposed a value; only Candidate evidence, no canonical authority. |
| User accepted extraction unchanged | Confirmation records exact selected Candidate value and its supports, plus committed output revision. |
| User edited after extraction | Confirmation records original selected proposal and user-authored replacement separately; material prompted the decision but does not assert the replacement occurred in the document. |

If departure is proposed as 09:00 and saved as 09:15, retain both values and the
manual-edit fact. Do not relabel 09:15 as extracted. Accepting 09:00 records
unchanged acceptance of that exact candidate version. Equality of strings alone
cannot infer acceptance: a user may manually type the same value. Origin follows
the actual interaction/intent, not a later comparison heuristic.

Reprocessing that proposes 09:10 adds a new Candidate only. It cannot change
09:00 or 09:15, replace their provenance, or recreate the Booking. A future
reviewed update displays old canonical revision/value, new proposal and supports;
explicit acceptance binds the exact target/base revision and selected fields.
Canonical drift requires a new review intent/key. Independently edited fields
remain untouched. Subsequent manual changes append user-origin field history
and preserve the earlier extracted lineage as history.

## J. Candidate identity

Candidates need durable IDs before being exposed for deferred human review.
Async completion, app restart, partial acceptance and retry cannot depend on
array indexes, transient component state or a Session ID. Candidate belongs to
one immutable ExtractionRun, has a typed proposed output kind, proposed fields,
field supports and explicit unresolved values. Runs produce zero, one or many
heterogeneous Candidates; a Candidate may have support from several run inputs.

Published proposal payload is immutable. User edits are review/Confirmation
intent, not rewrites of extraction evidence. Partial acceptance records a
per-candidate disposition/output-slot mapping. Accepted history is durable;
rejected/deferred proposals remain proposals and do not become business truth.
Unreviewed superseded proposals can later be cleaned up only when unreferenced,
according to reviewed retention; no such cleanup is implemented here.

Candidate ID is not a canonical Booking ID. One selected candidate/output slot
must not create a second object on replay. Deliberately creating another object
from the same candidate requires an explicit distinct output intent, not a
silent retry. Run-owned review states are not a design for future Pool selection,
planning or optional-item business lifecycle.

## K. Extraction run/versioning

Run identity binds immutable input set `(SourceId, SourceRevision,
RepresentationId, integrity binding)` and extractor/transform configuration
version. An engine/model identifier may be recorded for reproducibility, but
no provider/model is selected here. One run may combine several Sources. Runs
are not owned by Sessions or canonical targets.

Reprocessing creates a new Run ID, even for the same material. Retry of the
same run/operation uses its same input binding and ID. Changed inputs/version
require a new run. Allocate a monotonic generation within a stable extraction
scope: one Source, or an explicitly selected stable set of Source IDs. Input
versions are in the run binding, not the scope identity. No global generation
comparison across unrelated input sets is meaningful.

Minimal execution state: not requested (no run), pending/running, candidate-ready
(including zero results), failed; superseded describes a run no longer current
for its scope. Newer generation selection supersedes older unreviewed proposals
within that scope. Completion of an older run may be recorded historically but
cannot become the current selectable result. Old accepted Candidates and exact
input lineage remain retained regardless of supersession.

Confirmation must verify the reviewed run/generation and input versions are
still valid for the active review intent. Material replacement or a newer run
requires explicit renewed review; do not substitute candidates invisibly.
Overlapping but different Source sets do not automatically supersede each
other; their proposals require human comparison. Target revision guards prevent
either from silently overwriting an existing confirmed object. Run ordering
does not establish business precedence.

## L. Source revision

| Identity/version | What changes it |
| --- | --- |
| Source ID | New intentional acquisition/copy; not upload, reprocessing or rename. |
| Source material revision | Explicit new capture or replacement under the same logical Source. Monotonic, immutable history. |
| Representation ID | New material/derivative; original payload never edited in place. |
| Extraction Run/generation | New interpretation request; independent of upload and business revision. |
| Canonical object revision | Admitted business mutation only; owned by that domain. |

A revision identifies a capture manifest: original Representation IDs and
capture completeness. Derivatives reference that capture without advancing the
Source merely because OCR was run. Mutable display metadata/storage locations
do not retrospectively change capture contents; persistence may separately
version metadata, but that is not a material replacement.

URL refresh creates a new capture revision; old snapshot remains historic.
Email content is immutable as acquired. A later-supplied attachment creates
an explicit enriched capture revision with original old material references and
new attachment material, or a distinct acquired Source with origin relation;
it does not mutate the earlier email snapshot. A replacement PDF uses an
explicit new revision. Text edits before persistence change staging only;
edits after Source persistence create a new text Representation/revision even
before canonical confirmation. Earlier run inputs remain addressable.

Replacement does not repoint confirmed fields to the new material. A later
explicit reviewed update can establish new supports; prior supports remain
historical. Source deletion/tombstone changes availability/lifecycle, not the
content revision referred to by a Confirmation.

## M. Confirmation contract

Confirm means an explicit disposition of reviewed inputs and output intentions.
It may request create, update, evidence-link only, reject, defer or a partial set
of those outcomes. It is not a generic command that can write every business
domain. Acknowledging extraction is distinct from successful canonical mutation.

The immutable intent must bind:

- Actor Account, Trip, Confirmation ID and stable idempotency key; actor time
  and authoritative commit time are distinguishable, without inventing time rules.
- Exact Run/Candidate IDs, input Source revisions/Representation identities,
  selected fields/proposals, explicit edits, unresolved fields and Person mappings.
- Per-candidate/output-slot disposition, output kind and stable create identity
  expectation, or exact existing typed target/base revision for update.
- For update: exact reviewed field set, baseline and replacement values; no
  automatic apply-to-all diff or last-writer-wins business mutation.
- Explicit association purposes and visibility effects (default none), plus
  links from successful outcomes to output IDs/revisions and FieldEvidence.

Same key and payload replays the same dispositions/output mappings; changed
payload under that key is invalid. Response loss must not cause a second create
or duplicate association. Successfully committed output slots remain committed
when other slots fail, are deferred or rejected. Persist exact per-slot outcomes;
do not claim all-or-nothing cross-domain transactions here. A failed slot has no
canonical output proof and must not appear accepted just because its sibling did.

Owning domains validate required fields, time/place semantics, Person references,
permissions and base revisions. Association admission separately validates
Source rights. Later implementation must durably correlate domain success with
confirmation/provenance, including crash/response-loss recovery; atomicity or
operation receipt strategy is a C-I2 preflight question, not a second queue here.
Rejection/defer requires no canonical write. Link-only records evidence and actor
intent without claiming any extracted value became a field. A manual object
with no Source is valid. Provider matching is never a required creation gate.

## N. Unlink/delete/source-loss semantics

| Event | Canonical result | Evidence result |
| --- | --- | --- |
| A: Source logically deleted after Booking confirmation | Booking and its revision remain. | Active links deactivated; historic support references retained with deleted/unavailable status. |
| B: One association removed, Source retained | Target unchanged. | Only that relationship becomes inactive; other associations remain; historical field origin is not erased. |
| C: Source unavailable offline | Cached Booking remains readable under existing local admission. | Material unavailable on this device; no false remote-loss conclusion or automatic target mutation. |
| D: Remote bytes permanently unavailable | Booking unchanged. | Mark material unavailable/lost after justified determination; retain identity, integrity and confirmation history. |
| E: New material reviewed and confirmed | Only explicitly updated target fields/revision change. | New current supports recorded; earlier revision and supports retained. |
| F: User discovers source was wrong | No silent rollback/delete. | Record disputed evidence, unlink if appropriate, and separately request explicit business correction. |

Unlink requires authorized relationship modification under existing target and
Source boundaries; it does not grant Source deletion rights. Logical Source
delete requires Source lifecycle authority and must preserve referenced minimal
history. Confirmed outputs do **not** block all logical deletion, but do block
ordinary erasure of their provenance identity/decision history. The existence
of any Source is not a guarantee that its bytes will remain available forever.

Physical byte purge is a separate authorized operation subject to retention and
security review. Hide/delete may precede purge; purge can also remove a duplicate
cache copy without logically deleting the Source. Last-copy purge deliberately
marks evidence unavailable. Never reuse Expense tombstone/restore rules by
analogy. Any exceptional mandatory erasure/redaction policy must retain honest
“evidence removed” lineage where permitted and receive separate approval.

## O. Authorization/visibility

| Option | Contract decision |
| --- | --- |
| A: Source has own access; target may reference only with authorization | Choose safe default. Link conveys no byte/excerpt access. |
| B: Association grants all target viewers Source access | Reject implicit effect. Wider grants require deliberate separately authorized action. |
| C: Redacted derivative or copy for broader target | Possible future explicit action, not automatic linker behavior or V1 requirement. |

Check existing Trip admission and the effective Source boundary, target action
rights, exact Account scope and current versions when creating/reviewing a link.
Do not derive Source readers from the union of target viewers or grant target
write rights from Source ownership. A viewer can read permitted canonical facts
while the evidence is inaccessible. Provenance views must redact protected
excerpts, filenames, URLs, traveller details and locators; even metadata is not
automatically public because the target is shared. Public sharing is deferred.

Minimum proposed default is acquiring Account access, bounded by existing Trip
admission; wider Source access must use an explicitly reviewed policy under
existing authority. This adds no Track A role, access grant or Person-based
permission. Exact policy/storage integration remains a preflight dependency.
If existing authority cannot express required admission safely, stop later work
rather than changing Track A within Track C.

Wider publication of source-derived canonical fields is itself an explicit
authorized confirmation decision, not permission to expose the complete Source.
A redacted derived representation under the same Source still inherits its
Source restriction; broader distribution would need an explicitly authorized
separate copy/access policy with recorded origin and sanitization. Merely giving
a derivative a new ID must not bypass security. Local cache/worker reads must
retain Account isolation; account switching cannot reuse private evidence state.

## P. Uploader vs Trip Person

| Fact | Identity authority |
| --- | --- |
| Acquiring/uploader Account | Account ID; file ownership/audit fact, not traveller assignment. |
| Name mentioned in document | Source text/candidate evidence; no identity key. |
| Booking participant | Exact `(TripId, TripPersonId)`; `TripPersonId = journey_members.id`. |
| Confirming Actor | Account performing confirmation; may differ from uploader and every traveller. |

Neither uploader, email address, display name nor provider match implies a Person
link. No name-based Person creation/merge, Account link, invite or claim. Exact
known ID may be proposed only from trusted explicit domain context and requires
review; identity validation belongs to Track A. Unknown traveller text remains
unresolved. Expense Participant remains Expense-specific.

## Q. Multi-person evidence

Airline PDF with four travellers: one Source, potentially several ticket/flight
proposals or one group proposal according to its owning domain; four name-text
supports do not create four Persons. Map only explicitly selected exact existing
Person IDs after domain validation. Same-name Persons stay separate.

Hut reservation for seven: retain stated occupancy/count and extracted names as
evidence. Missing names do not generate placeholders, and “seven” does not select
seven Trip Persons. Required participant completeness is future Booking policy.

Airbnb booked by Leon for the whole group: booking contact, uploader, confirmer
and guests are different facts. Leon's text is not automatically his Person ID,
and “whole group” is not a live dynamic participant set. Confirmation may bind
an explicitly reviewed Person set where domain rules allow; future membership
changes do not silently change it. No participant UI is designed here.

## R. Text/URL/email source semantics

Source does not require binary file bytes. Common identity fields are Source ID,
Trip, acquiring Account, acquisition kind/key/time, material revision and access
boundary. Material-specific metadata is optional and meaningful only when
available; unknown original filename or capture time must remain unknown.

| Input | Material/lineage contract |
| --- | --- |
| Pasted text | Immutable saved text Representation with encoding/integrity binding; no invented filename/uploaded PDF. |
| URL | Locator Representation plus captured text/bytes when available. Bare URL is valid evidence but not fetched content; extraction requires actually captured input. Keep sensitive query data protected. |
| Email body | Acquired message Source with distinct body Representation; optional supplied full-message original and acquisition completeness. Not a mailbox/server model. |
| Email attachment | Distinct attachment Representation in that acquired message; retains attachment part designation and relationship to body/message. Independently imported attachment can instead be a separate Source with explicit origin reference. |
| File | Immutable original binary Representation and later derivatives, independent of filename. |

Email body and attachment are related **distinct evidence representations**,
not concatenated text pretending to be one page. A run may select both and field
supports identify which contributed. Independent attachment acquisition preserves
its own operation/identity; no deduplication by filename/hash. A later arrival is
handled under L, never retroactively present in an earlier extraction run.
No Gmail, scraper, mail server, Share Extension or inbound acquisition is built.

## S. Import Session relationship

A future Session is a bounded review/workflow container referencing many Sources
and runs. A Source survives it and may be reused in another Session. Candidate
identity belongs to its Run; a Session holds review selections/dispositions and
cannot be the permanent evidence key. A multi-Source run remains identifiable
without the Session that initiated it.

Cancel discards uncommitted review intent and Session-owned unsaved staging only.
It must not delete persisted/reused Sources, published runs, another Session's
material or committed canonical outcomes. Pending execution cancellation must
be explicit and recorded; a late result cannot revive canceled review or trigger
confirmation. Safe cleanup requires ownership and absence of references; no
Session service, UI or lifetime policy is specified in this phase.

## T. Offline/upload vs extraction state

A Source may be durably saved locally before remote registration/upload. Preserve
its identity, capture/integrity metadata and Account scope across restart.
Availability describes each Representation: local presence/integrity, remote
presence/verification, and transfer pending/failed independently. Source aggregate
availability must not pretend every part of an email/PDF bundle is uploaded when
only one part is verified.

Extraction is independently absent, pending/running, candidate-ready, failed or
superseded, under K. Upload failure is not extraction failure; successful upload
does not mean readable semantic content. Local extraction may produce candidates
before upload; remote extraction must wait for its exact verified input without
changing Source identity. A valid Source can never be processed and still be
attached as evidence.

No new sync/upload/retry worker or queue is defined. Existing repository and
shared sync ownership remain authoritative. Offline confirmation can preserve
a local reviewed draft; authoritative/local canonical mutation rules are a
future owning-domain decision. Do not claim draft acceptance proves server
commit. Cached canonical truth remains accessible under existing offline auth
rules even when evidence requires unavailable remote bytes. Source replacement,
account switch and input revision checks also apply to resumed extraction.

## U. PDF scenario

Air New Zealand PDF acquisition allocates S1 in the chosen Trip. R1 is immutable
captured PDF. Later embedded-text R2 and/or page-image R3 are derivatives of R1;
OCR R4 names its exact page-image parent/version. No library is chosen.

Run X1 selects exact representation versions and yields flight candidate C1:
flight number, departure/arrival raw evidence, traveller text and booking
reference. Interpreted time/place slots use opaque Track B payloads. Missing
year, zone, airport identity or Person mapping remains explicit, not synthesized
from Trip dates. OCR observations and semantic interpretations remain distinct.

Actor U reviews selected fields and exact Person assignments. A successful
owning-domain confirmation creates its Booking and/or Event outputs as that
domain permits; Track C does not prescribe whether these are one or two objects.
Separate associations connect S1 to each committed typed output. Field supports
bind flight/reference to R1/R2, page-derived values to R3/R4 where applicable,
Candidate C1/Run X1, confirmed values/edits, U and output revision. Source deletion
does not cancel the flight. Unknowns: Track B and Booking validation/shape,
capture safety and future PDF engine; not resolved by this document.

## V. Water Taxi scenario

One confirmation Source S1 retains its original PDF/email/text and optional
derived representations. Run X1 proposes outbound occurrence C1 (“Dec 16”),
return C2 (“Dec 19”), check-in instruction C3 and payment/operational note C4.
No year, exact time, timezone, endpoint or settlement meaning is inferred.

Confirm C1/C2 independently after owning-domain completeness checks. If only C1
is confirmed, C2 remains deferred/rejected according to explicit disposition;
C3 can be accepted as a Note without adopting C4. Each successful output has
its own typed association to S1 and selected field supports from the relevant
representation/spans. Replaying partial confirmation does not create another
outbound or convert C2 automatically. Notes do not create Expenses/Payments.
Unlinking C1's output keeps return/note links; deleting S1 retains all outputs
and history. Missing year/time/endpoints and payment interpretation require
later explicit review under owning domains, never a Track C guess.

## W. Itinerary document scenario

One Source with original document and selected derivatives yields heterogeneous
proposals: hotel Booking, optional POI, Note and suggested activity. Evidence
ownership is common; business lifecycle is not. Accepting the hotel does not
confirm POIs or schedule an activity. Each selected output is separately admitted
by its own domain and gets its own association and field support.

Optional proposals may remain run-owned unreviewed/deferred candidates until a
future Pool integration assigns canonical Pool identities. Track C does not
design Pool lifecycle. Track B owns place/time payloads. Source deletion/unlink
leaves confirmed hotel/notes intact and does not change an optional item's
planning status. Unknowns: actual domain adapters, Pool contract and temporal
validation, not universal itinerary conversion rules.

## X. Receipt compatibility

| Relationship option | Recommendation |
| --- | --- |
| A: receipt_assets adapter/subclass onto future Source core | Possible separately approved later migration; not the initial relationship. Requires financial ACL, identity, tombstone and reconciliation proof. |
| B: Separate core; receipts entirely unchanged | Preserve domain/store separation; alone risks duplicate byte lifecycle implementations. |
| C: Shared byte infrastructure only initially | Choose initial relationship, combined with Trip-only core. No cross-model association or ID alias at first. |

SourceId, RepresentationId and receipt asset ID are distinct semantic namespaces,
even if all use UUIDs and identical raw strings happen to occur. Never cast one
to another or resolve them without kind/namespace. Identical hash/storage content
cannot establish Expense, Personal Payment or Settlement links. Cross-model
origin links require an explicit later approved adapter and authorization.

Reuse only lower-layer capabilities proven by C-I0: owned copy, signature/hash
verification, staging/recovery, authenticated storage provider and integrity
checks; durable transfer concepts where dependency separation is safe. Existing
receipt worker, bucket/path, DTO, link operations, image normalization, cache
policy and financial Save semantics are not generic ready-made contracts.
Do not refactor receipts now to obtain conceptual reuse. A future preflight must
identify the smallest extraction/shared seam rather than building a second
uploader or prematurely rewriting a proven Ledger pipeline.

## Y. Conceptual domain shapes

These are record responsibilities, **not SQL, TypeScript implementation or one
table per noun**. Related immutable records may share persistence structures.
Canonical business objects remain outside this graph.

| Shape | Minimum conceptual contents |
| --- | --- |
| Source | ID, Trip, acquiring Account, acquisition key/kind/time, current material revision, access/lifecycle metadata; revision manifests retained when referenced. |
| Representation | ID, Source/revision, captured/derived role, material descriptor/integrity, parents/transformation version, capture completeness, storage/availability metadata. |
| SourceAssociation | Independent ID, Trip/Source, typed target, purpose, Actor/time, originating Confirmation if any, active/inactive history. |
| ExtractionRun | ID, stable input scope/generation, immutable exact inputs, extractor version/config binding, execution/supersession status. |
| Candidate | ID, Run ID, proposed kind/fields, unresolved values and field supports; immutable payload, durable review references. |
| FieldEvidence | Target field/revision, exact source/representation supports, optional locators, run/candidate lineage, proposal and accepted value references, origin mode, Confirmation. |
| Confirmation | ID/key, immutable Actor/Trip/review intent, selected candidates/edits/dispositions, target/base bindings, per-slot result IDs/revisions and provenance. |

Representative relationships:

```text
Source S1 ── originals/derivatives R1,R2 ──┐
Source S2 ── original R3 ────────────────┴─ Run X1 → Candidates C1,C2
Confirmation K1: C1 accepted/edited; C2 deferred
K1 → owning-domain committed Booking B1/revision V1
S1 → association A1 → (Booking,B1)
S2 → association A2 → (Booking,B1)
Field B1.departure/V1 → K1,C1,X1 → S1/revision1,R2
Field B1.address/V1   → K1,C1,X1 → S2/revision1,R3
S1 → association A3 → independently confirmed Note N1
```

An association alone does not establish field extraction. Manual B2 can have
user-origin fields with no Source graph, and later a link-only association.
Representation parentage and run inputs are bounded lineage, not a universal
graph engine. No factories, registries or provider matching service are needed.

## Z. Persistence options

| Dimension | A: Extend receipt_assets | B: Generic Source core | C: Trip-only core + shared bytes | D: Domain stores + shared bytes |
| --- | --- | --- | --- | --- |
| Ledger compatibility | High risk from single-parent, ACL, tombstone semantics | Separate if integration deferred; broad abstraction risk | Strong isolation; receipts unchanged | Strong isolation initially |
| N:M association | Requires rebuilding receipt contract | Natural explicit associations | Natural bounded Trip associations | Repeated domain-specific link solutions |
| Field provenance | Financial table not suitable | Can support, danger of universal graph | Minimal selected-field lineage | Fragmented cross-object history |
| Access control | Existing Expense/payment grants can broaden access | Must define every domain policy | Source policy under existing Trip authority | Divergent domain policies/copy behavior |
| Offline | Existing receipt queue is financially coupled | New generic mirror/adapter needed | Reuse patterns, scoped metadata; transfer seam preflight | Multiple projections and retries |
| Text/URL/email | File assumptions require incompatible expansion | Capable but potentially oversized | Material descriptors support nonfiles | Special cases in every store |
| Migration cost | Highest Ledger impact | New core + adapters; large rollout surface | Additive Trip scope, no receipt migration | Low per-domain start, cumulative duplication |
| Reversibility | Poor once financial identities are repurposed | Difficult after all-domain adoption | Good while isolated and adapters explicit | Moderate; later consolidation expensive |
| Parallel byte pipelines | Low apparent count, high semantic coupling | Avoidable only with disciplined reuse | Explicit reuse seam; no second worker by default | High risk unless all stores use same infrastructure |

Recommend **C**. It satisfies concrete Trip N:M/lineage cases with less blast
radius than A/B. D is insufficient once three screenshots support one Booking
and one itinerary supports independent objects; it encourages repeated lineage
logic. “Trip-only” describes ownership/scope, not a new Trip schema or global
digital asset platform. No tables, migrations or transport changes are selected.

## AA. Minimum V1

| Required | Why / bound |
| --- | --- |
| Stable Source ID, Trip and acquisition Actor/key/kind | Offline identity, replay and scope; no global inbox. |
| Material revision manifest and immutable original descriptors | Replacement and exact historical input binding; retain acquired originals by default. |
| Representation integrity/availability/access metadata | Separate material from storage; nonfiles need not have binary upload state. |
| Independent typed associations and lifecycle | Concrete N:M evidence reuse; no maximum-three generic rule. |
| Durable Run/Candidate input and proposal lineage | Restart, newer extraction, partial acceptance and multi-Source support. |
| Selected field provenance and explicit origin/edit facts | Explain accepted values without a token warehouse. |
| Confirmation key/input/result mapping | Replay and target revision protection; owning domain mutation remains separate. |
| Minimal tombstone/unavailable history | Canonical truth survives unlink, deletion and byte loss. |

Derivatives are optional: store only those actually needed to extract/inspect
selected evidence. Original/source support works without page images or OCR.
No new schema for every shape, global source registry, content merge, full OCR
token persistence, embeddings/vector search, advanced variant catalog, universal
content graph, public sharing, AI engine, PDF library, mailbox, Credential domain,
Import Session implementation or new worker. Add richer locators/derivatives only
when a concrete supported input requires them.

## AB. Track B dependency

B-T0 and B-T1 are unavailable at this committed HEAD. Thus C-I1 uses conceptual
opaque slots **Track B canonical TemporalSpec** and **Track B canonical spatial
payload**. These names identify ownership, not an assumed exported code type or
accepted field layout. Raw evidence text remains alongside unresolved slots.

No competing UTC concatenation, Trip timezone default, floating-time format,
endpoint model, stay-span rule, airport/place identity or coordinate schema is
defined. A future adapter consumes the accepted Track B contract/version and
preserves its explicit unknowns; any interpretation records its input and
extractor version. The current narrow itinerary compatibility DTO is not a
substitute for Track B. C-I1 semantics can be reviewed now; concrete temporal/
spatial payload design and implementation are **PENDING Track B availability
and acceptance**. No source-loss or association rule depends on choosing those
payload fields, so no replacement architecture is needed.

## AC. Financial non-interference

Existing `receipt_assets`, local receipt projection, Expense max limits,
receipt tombstones, Personal Payment evidence, Settlement/Transfer evidence,
Expense calculations, Review and FX remain untouched. No ID remapping, financial
FK, amount/date correction, queue operation or read grant changes here.

A payment instruction in a water taxi document is ordinary extracted evidence,
not a Payment or Expense. Receipt bytes matching a Trip representation do not
make a financial association. Generic Source links must never be consumed as
financial business links without a separate approved domain command/adapter.
Future byte reuse must preserve existing receipt namespace, storage permissions,
retention, normalization and Account isolation until separately approved changes.

## AD. Golden scenarios

Every scenario states all eight requested dimensions. “Unknowns” are downstream
choices, not permission to guess. Deletion shorthand always follows N: canonical
outputs and historical decision identity survive, with evidence unavailable if
purged. The owning domain decides whether incomplete proposals can be committed.

### 1. One PDF → one flight

- **Source identity:** S1, one acquisition. **Representations:** original PDF plus optional text/page derivatives.
- **Associations:** S1 to each domain-admitted flight output. **Candidate behavior:** C1 in X1, unknown time/place/Person retained.
- **Confirmation:** explicit selected values/edits and domain admission. **Provenance:** per field S1/revision/R, X1/C1/Actor/output revision.
- **Deletion/unlink:** flight persists; unlink affects only its evidence relation. **Unknowns:** Booking/Event relationship and Track B payload.

### 2. One PDF → outbound + return transport

- **Source identity:** one S1. **Representations:** same original, independently identified pages if derived.
- **Associations:** two output links to S1. **Candidate behavior:** separate outbound C1/return C2, no inferred year/time.
- **Confirmation:** independently selected output slots; replay returns exact results. **Provenance:** each output's selected supports and decisions.
- **Deletion/unlink:** unlink outbound retains return link; Source delete retains both outputs. **Unknowns:** required transport fields/Track B endpoints.

### 3. Three screenshots → one hotel Booking

- **Source identity:** S1/S2/S3 from separate acquisitions. **Representations:** three originals and optional OCR derivatives.
- **Associations:** three links to B1. **Candidate behavior:** multi-input run proposes C1 with fields supported by different images; conflicts remain reviewable.
- **Confirmation:** one reviewed Booking intent, all chosen input revisions bound. **Provenance:** check-in, address and reference retain their individual supports.
- **Deletion/unlink:** removing S2 does not delete B1 or S1/S3. **Unknowns:** hotel field requirements and conflicting-value resolution by the person.

### 4. One itinerary → Booking + optional POIs + Notes

- **Source identity:** one S1. **Representations:** document original and actual required derivatives only.
- **Associations:** independent typed links for committed outputs. **Candidate behavior:** heterogeneous proposals; optional POIs need not become scheduled events.
- **Confirmation:** per-output admit/reject/defer. **Provenance:** field-specific evidence and independent outcomes.
- **Deletion/unlink:** no cascade or lifecycle unification. **Unknowns:** future Pool business contract and domain adapters.

### 5. Accept only one candidate

- **Source identity:** S1 unchanged. **Representations:** exact run inputs retained.
- **Associations:** only successful accepted output linked. **Candidate behavior:** C1 accepted; C2 rejected/deferred explicitly, neither silently created.
- **Confirmation:** stable partial disposition and C1 result mapping. **Provenance:** accepted history plus original C1 proposal, C2 disposition.
- **Deletion/unlink:** C1 output survives; unreferenced proposals may later follow retention. **Unknowns:** nonaccepted proposal retention duration.

### 6. Edit extracted departure before confirmation

- **Source identity:** S1 unchanged. **Representations:** original/selected derivative still support proposed 09:00.
- **Associations:** evidence link to admitted output. **Candidate behavior:** C1 remains 09:00; review draft changes to 09:15.
- **Confirmation:** explicit manual replacement under Track B validation. **Provenance:** extracted 09:00 and user-edited 09:15, no false source assertion.
- **Deletion/unlink:** output/edit history survives. **Unknowns:** concrete Track B representation/completeness of that time.

### 7. New extractor after confirmation

- **Source identity:** S1 unchanged if material unchanged. **Representations:** X2 selects exact input IDs.
- **Associations:** existing link unaffected. **Candidate behavior:** X2/C2 proposes 09:10; X1/C1 accepted history retained, unreviewed older scope results superseded.
- **Confirmation:** no automatic mutation; new review/update uses exact target/base revision. **Provenance:** new supports only after admitted update, previous revision retained.
- **Deletion/unlink:** no rollback to old extraction on Source loss. **Unknowns:** later review UX and version adapter.

### 8. Source deleted after Booking confirmed

- **Source identity:** S1 retained as historical tombstone. **Representations:** hidden and later purged only under policy.
- **Associations:** active links deactivated with Source-delete reason. **Candidate behavior:** referenced accepted C1/X1 history retained; no re-extraction from deleted inputs.
- **Confirmation:** historical B1 success unchanged. **Provenance:** minimum IDs/revisions/decision history and unavailable markers persist.
- **Deletion/unlink:** B1 remains; byte purge separate. **Unknowns:** retention/redaction policy, not Booking survival.

### 9. Unlink without deleting Source

- **Source identity:** S1 remains active. **Representations:** availability unchanged.
- **Associations:** A1 inactive; A2 to another target remains. **Candidate behavior:** no proposal invalidation merely from unlink.
- **Confirmation:** explicit authorized relationship action; no business update implied. **Provenance:** old confirmation supports remain historical.
- **Deletion/unlink:** Source and outputs persist. **Unknowns:** exact owning-domain permission adapter.

### 10. Identical PDFs imported separately

- **Source identity:** S1/S2, distinct deliberate acquisition keys; replay of either key returns its own Source.
- **Representations:** R1/R2 may share content digest, distinct lineage. **Associations:** explicit per-Source links only.
- **Candidate behavior:** independent runs; duplication hint cannot merge truth. **Confirmation:** user chooses reuse or distinct output intent; retry does not duplicate.
- **Provenance:** actual selected acquisition(s), never hash-inferred merge. **Deletion/unlink:** deleting S1 cannot remove S2 or shared physical bytes still needed by it.
- **Unknowns:** future physical-byte deduplication; not needed for V1 identity.

### 11. Reuse Source for second object

- **Source identity:** reuse S1, no reacquisition required. **Representations:** chosen exact original/revision may be reused.
- **Associations:** A1 to B1, new A2 to N1. **Candidate behavior:** use suitable existing proposal or new run; no cloned Session identity.
- **Confirmation:** explicit distinct second output intent, not replay of first create. **Provenance:** separate confirmation/output mapping using same material support.
- **Deletion/unlink:** unlink A2 leaves A1; Source delete leaves both outputs. **Unknowns:** target-specific validity of second object.

### 12. Multi-person document, unknown mapping

- **Source identity:** S1 regardless of number of names. **Representations:** original and exact name-text supports.
- **Associations:** output links do not imply Person links. **Candidate behavior:** names/count remain candidates with unresolved exact IDs.
- **Confirmation:** explicit existing Person IDs only; no name/email/uploader inference. **Provenance:** text and reviewed mapping are distinct facts.
- **Deletion/unlink:** output participant history survives; no Person deletion. **Unknowns:** required participant completeness in Booking domain.

### 13. Evidence unavailable offline

- **Source identity:** S1 metadata survives. **Representations:** local absent, remote status not rewritten merely due to network failure.
- **Associations:** remain with inaccessible material. **Candidate behavior:** cached proposals may be inspected only under local authorization; missing input blocks fresh extraction.
- **Confirmation:** prior success remains; new offline commit rules deferred. **Provenance:** cached lineage available within access policy.
- **Deletion/unlink:** cached Booking persists; offline absence is not delete. **Unknowns:** future explicit offline material pinning policy.

### 14. Pasted text without file bytes

- **Source identity:** S1 for saved paste. **Representations:** exact saved text/encoding, no invented binary file.
- **Associations:** ordinary typed Source links. **Candidate behavior:** run consumes saved text version; staging edits differ from persisted revisions.
- **Confirmation:** same explicit reviewed output contract. **Provenance:** text representation and optional span, Actor/edit facts.
- **Deletion/unlink:** remove paste availability independently of outputs. **Unknowns:** acquisition UI and sensitive-text retention.

### 15. Email body + attachment

- **Source identity:** one acquired message S1; independent later file import can have S2 with explicit origin relation.
- **Representations:** body R1 and attachment R2 distinct, plus full-message bytes only if supplied. **Associations:** S1 can support several typed outputs.
- **Candidate behavior:** X1 selects R1/R2; conflicting dates remain proposals. **Confirmation:** reviewed selected field/material binding.
- **Provenance:** exact body/attachment part per field, capture completeness retained. **Deletion/unlink:** outputs survive message/attachment loss; no hidden mailbox deletion.
- **Unknowns:** future acquisition and missing attachment handling, not an email server design.

### 16. Private Source, broader shared target

- **Source identity:** S1 keeps existing private boundary. **Representations:** original/derivatives inherit restricted access.
- **Associations:** authorized link with no grant effect. **Candidate behavior:** review and excerpts stay restricted.
- **Confirmation:** sharing permitted canonical values is deliberate; publishing full evidence requires separate authorization. **Provenance:** viewers without rights receive only permitted/redacted lineage.
- **Deletion/unlink:** target remains shared; unlink changes no Source ACL. **Unknowns:** exact policy integration and redacted-copy mechanism; stop if Track A must change.

### 17. Upload succeeds, extraction fails

- **Source identity:** S1 stable. **Representations:** verified remote original remains valid evidence.
- **Associations:** may link as evidence with no extraction. **Candidate behavior:** X1 failed; zero accepted fields, retry bound to same input/run or explicit new run.
- **Confirmation:** link-only/manual entry allowed by domain; failure is not truth. **Provenance:** failure does not manufacture candidate support.
- **Deletion/unlink:** ordinary N policy; upload success grants no delete cascade. **Unknowns:** extraction implementation/error categorization.

### 18. Extraction succeeds, upload pending

- **Source identity:** durable local S1. **Representations:** verified local material; remote pending/absent independently.
- **Associations:** intended links can be reviewed; committed links follow eventual domain admission. **Candidate behavior:** X1 candidate-ready from local input.
- **Confirmation:** reviewed draft durable; canonical offline admission is not invented. **Provenance:** exact local representation/digest and reviewed decision, success proof only when committed.
- **Deletion/unlink:** protect owned pending input; Source loss never implies output loss. **Unknowns:** eventual domain offline command/receipt integration.

### 19. Manual Booking without Source

- **Source identity:** none required. **Representations:** none. **Associations:** none.
- **Candidate behavior:** none; manual entry is not a fabricated extractor run. **Confirmation:** domain create records Actor and user intent.
- **Provenance:** user-entered fields and canonical revision, no forged evidence. **Deletion/unlink:** no evidence lifecycle dependency.
- **Unknowns:** Booking required fields and commit contract, outside C-I1.

### 20. Later attach evidence to existing Booking

- **Source identity:** reuse S1 or acquire a new Source deliberately. **Representations:** exact captured material version.
- **Associations:** identified link to existing typed B1. **Candidate behavior:** none required; new proposals remain separate if extraction requested.
- **Confirmation:** link-only intent, target admission/base binding as required by owner; no field update implied. **Provenance:** actor/link history, original user-entered field origins stay unchanged.
- **Deletion/unlink:** unlink removes link only; B1 persists. **Unknowns:** target-specific link admission and later explicit reviewed field-update workflow.

## AE. Risks/unknowns

The largest unresolved implementation risk is proving Source access and retained
provenance cannot leak private document content when several targets have
different readers. The safe rule is decided here; exact admission/redaction and
local projection integration remain unproven. No change to Track A is implied.

| Pending dependency | Required later evidence |
| --- | --- |
| Human review of C-I1 choices | Approval of vocabulary, default retention, Trip scope, provenance minimum and persistence direction. |
| Track B absence | Accepted temporal/spatial contract before concrete payload design or implementation. |
| Domain confirmation integration | Crash/replay-safe correlation of output receipt and evidence, target revisions, partial success without duplicate creation. |
| Retention/security | Authorized purge, minimal metadata/redaction, device loss, sensitive booking/name/QR data; no invented legal retention period. |
| Shared byte seam | Separate Account/Trip/integrity mechanics from Expense dependencies without parallel uploader or receipt regression. |
| Multi-input extraction ordering | Scope/input version checks and overlap review; no automatic semantic merge based on run age. |
| Input engines/acquisition | PDF/text/email/URL correctness and completeness; no engine chosen and no remote validation claimed. |

These are explicit preflight/review dependencies. The semantic contract does not
require live data or implementation to select the proposed boundaries. None of
the supplied STOP conditions was triggered: clean baseline, no replacement of
Track B, no permission/receipt redesign or schema/business expansion.

## AF. Recommended C-I2 boundary

Recommend **design-only persistence and integration preflight after C-I1 review**:
map the minimum Trip Source metadata/lineage to existing repository/byte seams,
define target adapter admission and confirmation receipt correlation, and propose
a bounded storage/API change set with failure/ACL/retention checks. Use accepted
Track B payloads if available; otherwise leave them opaque and block dependent
implementation. Keep receipts separate and identify concrete sharing seams
before choosing any upload integration.

No migration, generic uploader, parser/provider, Import Session, Booking schema,
UI or remote environment work is authorized by that recommendation. A later
implementation slice needs its own approval and validated dependencies. This
phase stops at C-I1; C-I2 has not begun.

## AG. Acceptance matrix

PASS means the requested **design statement/scenario and scope evidence exist**,
not human adoption, implementation correctness, engine capability or remote
deployment. Sections AB/AE explicitly keep downstream dependency gates pending.

| # | Criterion | Evidence | Result |
| --- | --- | --- | --- |
| 1 | Source semantics defined | B/C/R | PASS |
| 2 | Artifact terminology decision made | B: option B, Representation precision, no extra root | PASS |
| 3 | Source identity not solely hash | C; AD10 | PASS |
| 4 | Original/derived distinguished | D/E/U | PASS |
| 5 | Original retention bounded | E/N: retain captured originals by default, separate deliberate purge | PASS |
| 6 | One Source/many outputs | F/V/W; AD2/4/11 | PASS |
| 7 | Many Sources/one output | F/K/Y; AD3 | PASS |
| 8 | Association identity/cardinality | F: independent ID, active tuple, N:M | PASS |
| 9 | Target typing | G/Y | PASS |
| 10 | Field provenance minimum decided | H: B plus version/run/candidate/decision; optional C | PASS |
| 11 | Entered/extracted/confirmed distinguished | I; AD6/19/20 | PASS |
| 12 | Candidate identity/lifecycle boundary | J/S/W | PASS |
| 13 | Run/version semantics | K; AD7 | PASS |
| 14 | Source revision separate | L | PASS |
| 15 | Confirmation semantics | M; per-slot immutable intent/results | PASS |
| 16 | Truth survives Source loss | N; AD8/13 | PASS |
| 17 | Unlink vs delete | F/N; AD9 | PASS |
| 18 | Linking never silently broadens access | O; AD16 | PASS |
| 19 | Uploader Account vs Person | P/Q | PASS |
| 20 | Multi-person mapping never inferred | Q; AD12 | PASS |
| 21 | Nonfile Sources supported conceptually | B/R; AD14/15 | PASS |
| 22 | Session relationship bounded | S/J | PASS |
| 23 | Upload vs extraction separate | K/T; AD17/18 | PASS |
| 24 | PDF scenario resolved | U; AD1 | PASS |
| 25 | Water taxi multi-output resolved | V; AD2/5 | PASS |
| 26 | Heterogeneous itinerary resolved | W; AD4 | PASS |
| 27 | Receipt strategy decided | X: separate identities, shared infrastructure only initially | PASS |
| 28 | Persistence options compared | Z: A–D across all nine requested dimensions | PASS |
| 29 | Minimum V1 bounded | AA/Y | PASS |
| 30 | Track B ownership preserved | A/AB: absence recorded, opaque boundary only | PASS |
| 31 | Financial behavior untouched | AC/X; documentation-only change scope | PASS |
| 32 | All 20 golden scenarios resolved | AD1–20: eight dimensions each | PASS |
| 33 | No application source/schema/test/config changes | Git status: only this new document | PASS |
| 34 | No migration created/applied | Only document write; no migration execution | PASS |
| 35 | No remote access/mutation | Local reads/write and static validation only | PASS |

Required matrix: **35 PASS / 0 PENDING / 0 BLOCKED** for design coverage and scope.
Separate gates: **human contract review PENDING; concrete Track B payloads PENDING;
Source ACL/retention and domain commit integration preflight PENDING**.

Validation: document structure, 20 eight-dimension scenario entries, 35 matrix
rows, local reference existence, whitespace and final Git scope checked. Runtime
tests are not a design-only validation claim; no dependencies installed, no
application databases opened, no migrations run. Files changed: this document
only. Current-state/ADR updates deferred to acceptance because the requested
delivery is one review-pending contract, not adoption of new architecture.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Remote access/mutation: **NO**. Migration created/applied: **NO**.
Application code changed: **NO**. Sibling worktrees modified: **NO**.

**STOP — C-I1 CONTRACT COMPLETE — REVIEW PENDING. Do not begin C-I2.**
