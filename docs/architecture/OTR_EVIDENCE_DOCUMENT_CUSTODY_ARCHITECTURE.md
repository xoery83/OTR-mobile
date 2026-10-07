# OTR Evidence & Document Custody Architecture — Documentation Only

Date: 2026-10-07 (Pacific/Auckland). Status: **REPORT READY FOR OWNER REVIEW**.
Workstream: `/Users/xoery/Project/otr-mobile-capture`, branch `trip/capture`.
Audited HEAD: `012d84c0ca93a7121778463d2cabd0f7ab3b997d`; starting worktree clean.

**APPROVED** records the owner-supplied direction for this checkpoint.
**PROPOSED** identifies integration concepts requiring later review.
**OPEN** identifies unresolved contracts and policies. Approved direction does not
approve a production schema, enum, API, migration, service or runtime activation.
Existing owning-domain contracts continue to govern current behavior; conflicts
below require explicit reconciliation by their owners, not silent replacement.

This checkpoint delivers only this document. It extends the accepted
[Capture UX baseline](OTR_CAPTURE_UX_ARCHITECTURE_BASELINE.md),
[Resolution Architecture](OTR_CAPTURE_RESOLUTION_ARCHITECTURE.md) and
[Review Architecture](OTR_CAPTURE_REVIEW_ARCHITECTURE.md) without editing them.
No implementation, current-state update, ADR, commit or push is authorized.

## APPROVED direction

### 1. Documents positioning and ownership

Documents is a unified **caller-authorized provenance catalog/projection**.
It is important infrastructure and a reliable fallback for source lookup,
verification, provenance and recovery, but need not be a high-frequency destination.
Custody complexity must not force a file-manager experience.

| Surface                       | Primary need                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Wallet / operational surfaces | “I need this now”: useful travel material in operational context; future Wallet semantics remain deferred. |
| Entity Detail / Expense       | Explicit attachments and financial evidence, in their owning context.                                      |
| Activity / Review             | Current meaningful attention, ongoing intake and focused decisions.                                        |
| Photos / Memory               | Ordinary media and memories.                                                                               |
| Documents                     | Low-frequency permitted source lookup, coverage verification, history and recovery.                        |

Documents is neither a cloud folder, Import inbox nor storage owner. An item
appearing there does not imply duplicate bytes, cloud custody, permanent retention,
Group visibility, Capture ownership, global-Capture origin or permanent physical
availability. Never duplicate an asset merely to display it in Documents.
Ledger owns receipts and financial safeguards; Trip/entity domains own explicit
attachments; Capture/Source owns intake evidence; future Wallet owns credential
semantics; Media owns Photos. Documents projects those owners' facts and actions.

### 2. Independent concepts

| Concept             | Meaning                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Role                | What the material is useful for.                                                                                                      |
| Owner               | Domain controlling business rules, retention, access and deletion. This is not an Organizer role, uploader Account or Payer identity. |
| Association         | Related Trip, entity, Expense, person or other admitted object; potentially N↔M. It grants no access by itself.                       |
| Acquisition channel | Email, ChatGPT, Share Sheet, Camera, Photos picker, Files picker, paste or future intake provenance.                                  |
| Custody             | Where/how bytes are retained and protected, independently for local/cloud representations.                                            |

File format is not role: a JPEG can be a receipt, ticket, ordinary photo or avatar;
a PDF can be intake evidence, an explicit attachment or a sensitive credential.
A channel is not role, business identity, permission or proof of canonical truth.
Capture, Source, Representation, Import Input, receipt asset and canonical entity
IDs remain distinct; a Documents entry does not collapse their namespaces.

### 3. Conceptual role taxonomy and directional defaults

The following names are explanatory concepts, **not production enums**. Exact
persistence, multiplicity and role mapping are OPEN. Where several purposes apply,
no weaker classification may bypass an applicable owner's stronger protection.

| Role                                   | Purpose / primary owner                                                                                                                | Directional custody and retention                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INTAKE EVIDENCE                        | Booking confirmation, screenshot, imported PDF, Email/ChatGPT evidence, pasted source material; Capture/Source.                        | Local-first; no permanent cloud upload merely because it is possible. After obligations end, potentially a cleanup candidate. Successful understanding often reduces original value; valuable operational material can be promoted.  |
| ENTITY ATTACHMENT                      | User explicitly attaches a file to Hotel, Flight, Activity, Rental Car or other entity; entity domain.                                 | Explicit attachment is stronger durable-retention intent. Cloud/sync is a strong default candidate; Past lifecycle may permit cleanup only under owner/user policy. Primary home remains the entity.                                 |
| FINANCIAL EVIDENCE                     | Receipt, invoice, Expense/payment evidence; Ledger.                                                                                    | Durable/cloud is a strong default. Ledger governs fidelity, audit and deletion; ordinary Trip Past status does not authorize auto-cleanup.                                                                                           |
| OPERATIONAL DOCUMENT                   | Ticket, voucher, QR/barcode, boarding pass, check-in document; owning operational domain.                                              | Durable cross-device availability is valuable while relevant. After use/event/Trip, value may decay and owner-approved cleanup may become possible.                                                                                  |
| CREDENTIAL / WALLET ASSET              | Passport/licence copy, visa/eVisa, travel insurance and future sensitive credentials; future Wallet/security.                          | User-maintained, private by default; no silent Past/expiry cleanup. Ordinary attachment storage is not sufficient security certification.                                                                                            |
| MEDIA / MEMORY                         | Ordinary photos/videos; Media/Photo domain.                                                                                            | Outside Documents merely as files. Custody, compression, subscription and sharing are deferred to Photo architecture.                                                                                                                |
| PRESENTATION ASSET                     | Avatar, Trip/Collection cover and similar UI asset; owning object.                                                                     | Follows object lifecycle; replaceable caches may be cleaned independently. Not provenance Documents.                                                                                                                                 |
| PROCESSING ARTIFACT                    | OCR intermediate, processing thumbnail, embedding, extracted JSON, temporary preview or transient AI representation; processing owner. | Not user Documents. Temporary, aggressively cleanup eligible once all obligations end; not automatically disposable while referenced.                                                                                                |
| GENERATED / EXPORT ARTIFACT — DEFERRED | Itinerary PDF, Ledger CSV/XLSX/PDF, corporate expense package, Trip summary, story book/share page; future export owner.               | Future OTR 2.0 policy only. Regenerable output is generally ephemeral unless explicitly retained or stable sharing/history needs it; generation does not imply permanent billable custody. Existing Ledger exports remain unchanged. |

These are directional defaults, not replacements for existing Source original
retention or Ledger upload rules. Exact cloud defaults remain OPEN per owner.

### 4. Role evolution and routing

Role may evolve after understanding. Ambiguous global Capture may begin as Intake
Evidence and become an Operational Document when a ticket, QR or voucher is
recognized. Low-risk promotion may be automatic when its only effect is stronger
protection against premature cleanup. It does not itself authorize upload, sharing
or wider disclosure. Sensitive Credential/Wallet promotion, Group sharing or a
materially different privacy/storage regime may require consent; exact rules are OPEN.

Lifecycle decay is not role mutation: an old ferry ticket remains an Operational
Document even when operational value declines. Automatic demotion cannot bypass
owner retention or mandatory protection.

Routing selects the processing path; role describes purpose. Explicit Add Photos
routes to Media/Memory, Add Receipt to Ledger, and Entity Add Attachment to its
owner. Global ambiguous Capture may need lightweight classification/routing.
Routing establishes neither canonical truth nor permission to retain/upload/share.

Manual Ledger receipts and entity attachments can appear in Documents without a
new Capture/Source/asset or duplicate upload. Explicit contextual intent need not
re-enter global Trip/entity resolution just to establish placement. Owner validation,
authorization and revisions still apply. Optional understanding can suggest fields;
attachment success is independent of AI unless its owner explicitly requires it.
New Expense OCR Confirm/Save and existing-Expense no-OCR rules stay authoritative.

### 5. Conceptual custody classes

These are concepts, **not enums or new persisted states**.

| Class                              | Meaning                                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOCAL PROTECTED                    | Original/material needed for processing, unresolved Review, UNKNOWN recovery, dependency, Undo/correction evidence or another mandatory hold.                                                       |
| LOCAL RETAINED                     | Device bytes remain after immediate processing protection ends, subject to owner/user policy.                                                                                                       |
| CLEANUP ELIGIBLE                   | A particular copy/material may be removed only when every applicable protection and owner requirement is released and approved policy allows that operation. Eligibility is not a deletion command. |
| CLOUD RETAINED                     | Durable cloud custody justified by user/domain value.                                                                                                                                               |
| SHARED CLOUD                       | Cloud retention with separately authorized sharing; cloud presence alone grants no readers.                                                                                                         |
| SECURE CREDENTIAL CUSTODY — FUTURE | Higher-security credential custody governed by future Wallet/security architecture.                                                                                                                 |

Local and cloud representations can coexist. Material identity, location,
availability and protection are different facts. Removal of one recoverable local
copy differs from deletion of the last retained original. A role/custody label alone
cannot prove bytes exist, remote integrity, recoverability or release authority.

### 6. Local-first intake and cross-device provenance

Capture is local-first; canonical results are sync-oriented; raw evidence is
custody-aware. Canonical Trip facts may sync while local-origin originals remain
local. Original evidence must not be permanently uploaded merely because OTR can
upload it. A future remote processing transfer is not automatically permanent
cloud retention or Group sharing; its disclosure/custody rules require review.

Lightweight provenance may sync under future contracts. Another authorized device
may know a source supported an entity without possessing its original bytes.
Documents may eventually distinguish original availability on another device from
an original no longer retained. These are conceptual availability meanings, not
final copy, implemented discovery or a device-to-device retrieval promise.
Unknown remote state, offline unavailability and confirmed evidence loss must not
be conflated. Missing original bytes do not prove processing failure or no commit.

Offline cached access follows existing local authorization/auth rules. Token
expiry or network failure pauses remote work instead of blocking valid cached
access. Resumed reads/actions capture fresh Account request generations; A→B→A
must reject old callbacks. Account switching neither exposes another account's
private evidence nor releases its durable responsibility.

### 7. Representation and compression

Original acquisition fidelity and retained/cloud representation are separate.
Use role-aware policy rather than a global compression setting:

- Intake Evidence prioritizes reliable inspection/verification/OCR over maximum camera resolution.
- Entity Attachments need readable useful quality, without always retaining full resolution.
- Ledger owns receipt fidelity, accepted normalization and financial safeguards.
- Operational Documents must preserve usable QR/barcodes and readable operational text.
- Wallet decides credential fidelity/security later; Photo architecture owns media quality.

Safe order: **durable local acceptance → derive representations → verify the
retained/upload representation → release the original only when protection and
owner policy permit**. Never destructively compress before durable intake. A
verified derivative is not sufficient release proof. Exact dimensions, codecs,
quality, PDF handling and verification criteria remain OPEN for the new policy.
Existing Ledger normalization is a domain-specific contract, not a generic Source
compression policy; this direction does not reopen current constants or draft Save.

Changed material receives the owning contract's new immutable Representation
identity/lineage. Do not rewrite exact originals, hashes, Run inputs or historical
support to pretend compressed bytes were the acquired original.

### 8. Protection before cleanup

Past status and age alone never make deletion safe. Protect material while needed
for processing, unresolved Review, UNKNOWN recovery, semantic/action dependency,
Undo/correction proof, financial/audit needs, operational use, sharing obligations,
owner retention, explicit Keep or another accepted reason. Unknown protection is
a veto, not consent. Processing artifacts are subject to the same responsibility
checks despite their temporary purpose.

Intake/pass completion, interpretation completion, Review disappearance,
acknowledged cancellation, queue COMPLETED, lease expiry and a new Candidate/key
are not provider terminality, no-commit proof or evidence-release authorization.
Import/Source/queue owners retain exact recovery and release responsibility.
All references to shared physical material must be released before its removal;
an unassociated Source, unlinked receipt or apparent orphan is not proof of safety.

### 9. Lifecycle, preference and explicit intent

Trip lifecycle is a retention input, not a deletion command. Planning/Active raises
operational value; Past/Archived can reduce the value of transient Intake Evidence,
ordinary Entity Attachments and used Operational Documents. Financial Evidence,
credentials, explicit Keep, audit/provenance obligations and protected material do
not become deletable just because a Trip is Past. No Past/Archived boundary or
retention-day threshold is selected here.

A future preference, conceptually Keep more / Balanced / Save space, controls
aggressiveness **only among already-eligible assets**. Names/defaults are OPEN.
Balanced may clean resolved transient intake and eventually low-value Past
attachments/expired operational documents under their owners' policies; ordinary
Trip lifecycle normally does not auto-clean financial evidence. Credentials remain
user-maintained. Future per-item Keep prevents automatic cleanup.

Explicit retention intent outranks optimization; mandatory evidence obligations
still constrain explicit deletion. A user may remove otherwise optional retained
bytes where the owner permits it. Keep neither bypasses security/access policy nor
promises indefinite service beyond future product/storage terms. Quota pressure
cannot make protected assets eligible; it may prompt choices among eligible assets.

### 10. Distinct deletion semantics

No generic Delete Document may collapse the following actions. Exact UI wording,
availability, command mapping, recovery and legal/privacy rights remain OPEN.

| Action concept             | Effect / authority                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Remove local copy          | Release device bytes while preserving allowed cloud/provenance; require applicable recoverability and local-use protections. |
| Delete retained original   | Remove retained bytes where owner policy permits; canonical facts and permitted lineage may remain.                          |
| Remove attachment / unlink | Remove one owner-governed relationship; does not necessarily delete shared underlying material.                              |
| Delete from Wallet         | Future Wallet action under credential/security authority.                                                                    |
| Delete financial evidence  | Ledger action, preserving required financial/audit and other evidence references.                                            |
| Delete provenance/history  | Separate policy; never implied by byte deletion or unlink.                                                                   |

Canonical Trip/financial facts need not disappear with an eligible original.
Permitted lightweight history may retain source identity/type, acquisition channel,
timestamps, associations, resulting entities/actions and review/correction history,
with honest original-unavailable meaning. Exact fields, access, erasure rights and
retention are OPEN. Provenance itself can be sensitive; survival is neither an
unconditional retention mandate nor authorization to retain prohibited personal data.

### 11. Caller-authorized sharing and owner authority

Trip membership alone must not imply access to every Document. Callers in the same
Trip may see different projected items. Authorization comes from the owner,
business relationships and asset sensitivity/sharing policy. **Entity visibility
is not original-evidence visibility; cloud retained is not Group visible.**

Future examples: a member may see a Group Expense while a receipt is restricted;
a Hotel participant may see permitted check-in information while unrelated members
cannot see the original confirmation. These are target capabilities, not current
Ledger/participant permission claims. Credentials are private by default;
Organizer status alone gives no access to another member's passport, licence,
visa or insurance.

Canonical Hotel name/address/dates, permitted reference or check-in instructions
can be shared without exposing a PDF containing phone, payment or loyalty data.
Derived/redacted sharing may be useful later; redaction implementation is deferred.
A new derivative ID does not create a wider grant. Provenance links, filenames,
locators, excerpts, titles and counts must not disclose inaccessible sources or
entities. A catalog cannot leak through its supposedly lightweight metadata.

Do not create an independent Documents ACL system here. Ledger controls receipts;
entity owners control attachments; Wallet controls credentials; Media controls
photos; Capture/Source controls intake evidence. Exact federated authorization,
participant/operational-role policy and offline revocation integration remain OPEN.
Documents may expose only actions admitted by their owner and current caller rights.

### 12. Wallet, Photos, exports and billing boundaries

Wallet is not a Documents folder. It is future operational retrieval of important
travel material with separately designed sensitive credential custody. Users add,
replace, delete and update credentials. Expiration may support later reminders or
status, never silent deletion. No credential security or reminder design is selected.

Ordinary Photos/Memory stays outside Documents. Photo architecture may later
support free local/system-linked use, paid OTR cloud storage, quotas,
optimized/original quality, shared albums and generated Photo/Story artifacts.
Local/system Photos linking must not imply OTR backup. Photo custody, compression,
cross-device availability and billing remain deferred.

Generated/export compatibility is deferred to future OTR 2.0 policy. Regenerable
outputs need not become permanent paid assets; explicit retention or stable
sharing/history may justify custody. Existing exact financial exports and uniquely
retained files remain under Ledger safeguards, not automatic artifact cleanup.

System processing overhead—OCR intermediates, temporary processing thumbnails,
embeddings and derived processing JSON—is system cost by default, not user-paid
storage. A later intentional conversion into a user-retained asset requires its
own policy. Durable retained attachments, Financial Evidence, cloud Operational
Documents, Wallet assets, shared retained documents and explicitly kept originals
may count toward future storage usage. No pricing/quota is implemented or chosen.
Future UX should explain semantic categories and reclaimable device/cloud space,
not opaque bucket bytes. Group/shared accounting remains OPEN.

Custody correctness must stand independently of monetization. Subscription capacity
or service tiers cannot redefine canonical truth, Review, audit, evidence
protection or access control. Existing uploader accounting facts do not select a
new billing rule or permit duplicate charging for Documents projection.

### 13. Data Health and simple Documents UX

Data Health may eventually surface protected originals, eligible originals,
retained cloud assets, missing expected local originals, partial/failed upload,
orphaned representations, excessive processing artifacts and reclaimable
local/cloud space. It consumes approved owner protection/custody facts; it is not
a separate release/deletion authority. Cleanup must explain which bytes are
removed and which facts/history remain. No new rules or mutations are implemented.

Documents conceptually needs search, a recent/simple list, lightweight filtering
only if volume warrants it, admitted associations, honest original availability,
permitted view/share/keep/remove actions and links to owners. Folders, tags, smart
collections and favorites are not introduced just because the custody graph is rich.
Review is discovered primarily through Activity, Wallet through Wallet/Today/entity
context, receipts through Expense, and media through Photos/Memory. Routes, layout,
actions and final localized strings remain OPEN with Trip Experience/UI owners.

## PROPOSED integration concepts

These concepts describe a possible future contract, not implemented capabilities.

1. **Compose existing owner projections.** Map admitted Capture/Source/Representation,
   receipt and attachment identities into caller-authorized catalog observations.
   Reuse existing repository, integrity, receipt and availability facts; avoid a
   new asset root, duplicate byte store or universal upload lifecycle. Exact
   identities, ordering, coverage, pagination and cross-device metadata are OPEN.
2. **Evaluate protection before preference.** Owners supply exact holds/references,
   current authorization, material revisions, availability/integrity and any
   verified recoverability. Only after every applicable owner releases protection
   can future policy consider explicit Keep and lifecycle/preference. A missing
   owner/proof leaves eligibility unknown and removal blocked. No algorithm,
   central graph service or schema is approved.
3. **Bind removal to exact copy and intent.** A future action distinguishes cache
   release, retained-original deletion and relationship unlink; rechecks owner
   admission, current references/revisions and operation responsibility at execution.
   Reuse exact recovery and positive cleanup acknowledgement; do not infer success
   from UI disappearance or trigger another deletion after an uncertain response.
4. **Publish honest availability.** Distinguish authorized verified local bytes,
   verified cloud custody, another-device observation, unavailable/unknown and
   deliberately no-longer-retained originals. Preserve lineage without promising
   fetching or disclosing private device/source details. Exact representation and
   freshness are OPEN; Source material identities remain immutable.
5. **Federate through owner authorization.** Compose only owner-permitted metadata,
   relationship links, byte access and actions. Do not union target readers or
   promote permissions when material is associated, recognized or uploaded.
   Stronger protection promotion may be separate from consentful transfer/sharing.
6. **Extend Data Health only after proof contracts.** Reuse its scoped manifest,
   revalidation and explainable outcomes for future custody checks. Its current
   queue repairs and verified receipt-cache paths cannot become generic cleanup.
   No feature worker, new scheduler, quota ledger or ACL framework is proposed.

## Compatibility audit and future owning checkpoints

Audit scope: relevant accepted local contracts/reports and narrow source symbols,
not a deployed, release, security or device certification. The
[current handoff](../CURRENT_IMPLEMENTATION_STATE.md) records accepted CP14 CLOSED
foundations at SQLite1–50/Server1–83. Historical report headers retain earlier
statuses; they do not override integrated acceptance. No remote/personal database,
credential or legacy Web checkout was accessed.

| Finding                                          | Existing evidence / current boundary                                                                                                                                                                                                                                                                                                                                   | Compatibility or gap; future owner and behavior until reconciliation                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 — CP11 originals and lifecycle                | [CP11 report](TRIP_CHECKPOINT_11_LOCAL_CAPTURE_INBOX_REPORT.md), [Data model](../DATA_MODEL.md), `src/data/repositories/localCaptureInboxRepository.ts`: exact immutable Account BLOBs, FILE/IMAGE/TEXT, INBOX/ASSIGNED, limits/quotas, revision-fenced assignment and reference-safe deletion.                                                                        | **GAP:** no role/custody/Keep/byte-unavailable catalog contract. Current Capture cannot simply lose its required BLOB while retaining the same readable Capture row. Its quotas are intake safety bounds, not subscription quota. Capture/Platform must design any metadata-only retention mapping; preserve current invariants and limits.               |
| C2 — Bound Capture protection                    | [CP13A.2](TRIP_CHECKPOINT_13A2_CANONICAL_FLIGHT_IMPORT_IMPLEMENTATION_REPORT.md), [Offline sync](../OFFLINE_SYNC.md), `src/data/db/migrations/tripImportAdmission.ts`: immutable retained `local_capture_source_bindings`, Capture/payload delete guards and exact Run/Input/evidence references.                                                                      | **GAP / CONFLICT IF bypassed:** processing completion does not free a bound BLOB; current guards do not implement generic release. Source/Import + Capture own complete release-proof and retained-history reconciliation before cleanup can remove it. No guard/schema change here.                                                                      |
| C3 — Default original retention                  | [Source provenance](TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md), D/E/N/O: exact originals retained by default; derivatives cannot authorize last-copy destruction; purge requires separate policy.                                                                                                                                                              | **POLICY RECONCILIATION:** role-aware cleanup of resolved Intake Evidence may eventually remove the last original, but current Source rules do not admit it automatically. Source + domain/security owners must approve exceptions, retained identity/privacy and complete release proof. Retain originals under existing policy meanwhile.               |
| C4 — Representation identity versus product role | Source provenance D/H/L/T and [Source lifecycle](TRIP_CANONICAL_C_I3C_SOURCE_LIFECYCLE_COMMAND_CONTRACT.md), K: immutable original/derived material, exact input/field lineage; availability separate from material identity.                                                                                                                                          | Compatible conceptual separation; new role is not the existing original/derived Representation role. Mapping, promotion, inline text/locator handling and compression criteria are **GAPs** owned by Source/Import + domain owners. Never rewrite hashes/input pins or assume all material is a file.                                                     |
| C5 — UNKNOWN, quiescence and release             | [Import contract](TRIP_IMPORT_CONTRACT.md), “Offline durable continuation” / “Presentation-neutral progress”; Data model C-I3H; Source lifecycle F/K. Exact terminal references and cleanup acknowledgement are distinct; provider terminality remains blocked.                                                                                                        | Compatible stronger protection. **CAPABILITY GAP:** pass completion, canceled/settled Review or processing quiescence is not release proof; IO_UNKNOWN/host loss cannot be age-cleaned. Source/Import/queue/runtime owners retain recovery and disabled purge/redaction gates. This report does not resolve provider terminality.                         |
| C6 — Ledger storage and uploads                  | [Attachment foundation](../ledger/EXPENSE_ATTACHMENTS_PHASE_1_FOUNDATION_PLAN.md), [provider plan](../ledger/EXPENSE_ATTACHMENTS_PHASE_2_STORAGE_PROVIDER_PLAN.md), [API](../API_CONTRACT.md): local durable preparation/atomic Save, max-three active attachments, durable upload/link/delete, tombstones; Backend-mediated private bytes, `receipt_assets` metadata. | Compatible domain ownership. Financial cloud-default direction cannot replace receipt lifecycle or repurpose receipts as Sources. Ledger owns policy and safeguards including Personal Payment evidence. Documents inclusion needs an owner adapter, not another upload or global AI requirement.                                                         |
| C7 — Receipt fidelity and cache versus deletion  | Attachment foundation Slice4: source metadata differs from normalized retained bytes; PDF unchanged, receipt-specific image normalization. API “Receipt eviction verification”: fresh authenticated HEAD actual-object checks plus GET/download hash before eviction.                                                                                                  | Compatible owner-specific fidelity, but **GAP** for generic role-aware pipelines. Existing cache release is not deletion of retained remote financial evidence. Ledger/file owners keep last-copy/pending protection and current constants. No dimensions, PDF rules or eviction proof are generalized here.                                              |
| C8 — Fine-grained receipt visibility             | Attachment foundation Slice3 and `backend/src/supabaseGateway.ts::readDownloadableReceipt`: active Expense receipts allow Trip creator/legacy member/linked Journey member, including cross-uploader reads; Personal Payment has distinct grants.                                                                                                                      | **AUTHORIZATION POLICY GAP:** “Expense visible, receipt restricted” is not current granular Expense-receipt capability. Ledger + Account/authorization owners must reconcile before selective original grants exist. Preserve existing read contract now; Documents neither narrows it silently nor grants more. No new ACL system.                       |
| C9 — Data Health actual capability               | [Health plan](OTR_DATA_HEALTH_AND_SELF_HEALING_PLAN.md), [Offline sync](../OFFLINE_SYNC.md), Data model: scoped detector/manifest, C1 narrow queue-metadata repairs, C2 normal-sync/Ledger convergence, D coalesced lifecycle scheduling; verified receipt-cache gate.                                                                                                 | **GAP:** these do not implement a role/custody inventory, Keep, cloud quota, generic orphan purge or original-retention worker. Data Health + file/Source/Ledger owners must consume approved proofs before new checks/actions. Historical cleanup windows for operations/diagnostics are not document-retention thresholds.                              |
| C10 — Account, Person and participants           | [Architecture](../ARCHITECTURE.md), Data model / API, preserved E0: Account access, TripPerson identity and participation are distinct; current certified canonical Event collection requires UNASSIGNED/no participant rows.                                                                                                                                          | **GAP:** participant-based hotel/operational original sharing and credentials access need owner-authorized contracts. Membership/Organizer/printed traveler names cannot establish sensitive grants. Account/Core + entity/Wallet owners must reconcile; preserve current Account-generation and effective-read boundaries.                               |
| C11 — Storage/Supabase assumptions               | Provider plan: accepted Backend `supabase_storage` receipt provider/private `ledger-receipts`; German provider/switch/migration deferred. Source lifecycle: private Source byte/operation boundary with disabled destructive families; current handoff: real Source IO/live custody unactivated.                                                                       | **GAP:** no universal cloud Documents store is implemented. Bucket/path names are not authorization, billing or domain identity. Platform/storage + Source/Ledger owners select any later placement/migration; no new bucket, policy, signed URL, provider or remote validation here.                                                                     |
| C12 — Capture baseline coverage                  | UX baseline “Documents and provenance”: all captured/imported source material and durable history; Review A14 already flags ordinary Photo/Memory exclusion.                                                                                                                                                                                                           | **WORDING CONFLICT IF interpreted as all files or permanent bytes.** Approved custody direction excludes ordinary Media, presentation and internal processing material; durable provenance does not guarantee permanent original retention. Capture + Experience + Media/Source owners reconcile baseline wording later. Baseline remains unchanged.      |
| C13 — Contextual/manual provenance               | UX baseline contextual attachments, Review A15, attachment foundation / OCR C0: contextual intent, New Expense-only OCR, Confirm copies Title/Amount/Currency; Save owns creation.                                                                                                                                                                                     | Compatible routing. **MAPPING GAP:** manually created receipts/attachments may join Documents without global-Capture origin or Source duplication. Ledger/entity + Capture/Source owners define projection refs and access. Current Save/cancel/AI boundaries remain.                                                                                     |
| C14 — Trip Experience / Wallet / Photos          | Preserved [E0 report](../../../../Documents/Codex/2026-10-06/files-pasted-by-the-user-otr/outputs/TRIP_EXPERIENCE_E0_BASELINE_ARCHITECTURE_REPORT.md), sections3/9/12/15: ticket/asset association, readiness and item privacy contracts incomplete; lifecycle is presentation, no mandatory Past cleanup.                                                             | **CAPABILITY GAP:** no Documents/Wallet/Photo custody UI or complete generic ticket contract certified. Experience owns shell/navigation; entity/asset owners own readiness/availability; Wallet/security and Photo owners retain deferred policies. Missing expected-asset metadata cannot invent a missing-ticket warning.                              |
| C15 — Provenance survives bytes                  | Source provenance N/O and Source lifecycle K: unlink, logical delete, loss, purge and redaction distinct; canonical outputs/receipts survive evidence loss; protected metadata may require redaction.                                                                                                                                                                  | Compatible direction. **GAP:** exact permitted cross-device metadata, offline redaction/erasure and lost-device originals. Source + privacy/domain/Platform owners define history availability without bypassing retained operation identity or exposing inaccessible entities.                                                                           |
| C16 — Billing and exports                        | Attachment design uploader-owned usage; provider/foundation plans defer storage accounting/physical deletion; API device-generated Ledger PDF/CSV; Health authority table protects immutable evidence/unique exports.                                                                                                                                                  | Compatible future accounting categories, **GAP** for quota/shared charging and generated/export custody. Billing/storage + Ledger/export + Photo owners define future services; existing Ledger export implementation is not newly deferred or changed. Quota pressure never supplies eligibility and processing overhead is not user storage by default. |

The E0 report is absent from this Capture worktree. The linked preserved copy was
read as context at `/Users/xoery/Documents/Codex/2026-10-06/files-pasted-by-the-user-otr/outputs/TRIP_EXPERIENCE_E0_BASELINE_ARCHITECTURE_REPORT.md`,
dated 2026-10-06, audited at `c4571746b0c300fa3b46842cd37745963567338c`.
Its proposals await owner review and are not evidence of installed Experience
implementation. Its historical schema count does not supersede the CP14 handoff.

Mandatory foundations reviewed: `AGENTS.md`, [Product](../PRODUCT.md),
[Architecture](../ARCHITECTURE.md), [Data model](../DATA_MODEL.md),
[API](../API_CONTRACT.md), [Offline sync](../OFFLINE_SYNC.md),
[environment audit](../ENVIRONMENT_AUDIT.md) and existing
[legacy audit](../legacy/OTR_LEGACY_AUDIT.md). Additional evidence includes
[Receipt OCR C0](../ledger/RECEIPT_OCR_1_0_PHASE_C0_REVIEW_DESIGN.md),
[financial conflict/audit model](../ledger/LEDGER_2_0_SYNC_CONFLICT_MODEL.md),
[UI Foundation](ui-foundation.md) and the [terminology glossary](OTR_TERMINOLOGY_GLOSSARY.md).
Relevant sections and focused symbols were inspected; no exhaustive runtime audit
or legacy re-audit is claimed.

## OPEN questions and future owners

No question below is settled or implementation-authorized by this report.

| OPEN contract / policy                                                                                              | Future responsible owner/checkpoint                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Exact production role/custody representation, multiplicity and stronger-policy precedence                           | Source/Platform + owning domains: conceptual-to-production mapping.                             |
| Exact Capture/Source/Representation/receipt/attachment to Documents projection mapping, IDs, coverage and discovery | Capture/Source + Ledger/entity owners + Experience: authorized catalog contract.                |
| Promotion, consent, sensitive custody transition and possible demotion rules                                        | Capture/Source + domain/security owners: role transition policy.                                |
| Role-aware image/PDF fidelity, readable/QR verification and release of acquisition originals                        | Representation/file owners + Ledger/operational/Wallet owners: fidelity contract.               |
| Cross-device provenance fields, freshness, device disclosures and original availability meanings                    | Source/privacy + Platform: minimized provenance sync.                                           |
| Exact default cloud retention per owning domain and distinction from remote processing transfer                     | Each domain + storage/security: custody policy.                                                 |
| Complete protection inventory, release proof, cleanup eligibility computation and concurrency fencing               | Source/Import/Ledger/entity + queue/file owners: release admission.                             |
| Retention windows and authoritative Past/Archived inputs                                                            | Domain/privacy + Trip/Core/Experience: lifecycle/retention reconciliation; no numbers selected. |
| Cleanup preference names/defaults and scope                                                                         | Product + domain/file owners: eligible-only preference policy.                                  |
| Per-item Keep semantics across representations/devices/shared references, persistence and user deletion             | Domain owners + Platform/Product: explicit retention intent.                                    |
| Delete/unlink/history distinctions, recovery, legal/privacy erasure and permitted tombstones                        | Domain/privacy/security + Source: deletion/retained identity contract.                          |
| Federated authorization, action admission and offline revocation                                                    | Account/Core/security + all asset owners: projection/read contract.                             |
| Participant/operational-role sharing and financial original restrictions                                            | Entity/Core/Account + Ledger: business relationship and evidence access policy.                 |
| Derived/redacted sharing, sanitization proof and separate grant/lineage                                             | Source/domain/security: separately authorized sharing; redaction implementation deferred.       |
| Secure Wallet/Credential architecture and fidelity                                                                  | Wallet/security: separate credential checkpoint.                                                |
| Credential expiry/status/reminders                                                                                  | Wallet/Product + notification owner: separately reviewed lifecycle policy.                      |
| Photo service tiers, storage, quality, cross-device behavior and billing                                            | Photo/Media + storage/billing: separate architecture.                                           |
| Storage quota/accounting implementation, system-overhead exclusion and retained-asset conversion                    | Storage/billing + domain owners: accounting policy; no pricing.                                 |
| Group/shared storage accounting and dedup charging/ownership                                                        | Billing/storage + sharing/domain owners: shared accounting.                                     |
| Data Health custody checks, safe observations/actions and reclaimable-space evidence                                | Data Health + owning evidence/file domains: proof-consuming checks.                             |
| Lost device-local originals, loss acknowledgement, recovery limits and surviving provenance                         | Capture/Source + Platform/privacy/Product: evidence loss contract.                              |
| Migration from local-only evidence to retained cloud assets, consent, integrity and interruption recovery           | Source/domain + storage/security: custody migration checkpoint.                                 |
| Generated/export artifact custody for OTR 2.0, regeneration, stable sharing/history and unique financial files      | Export/Ledger + Product/storage: future export compatibility policy.                            |

## Architecture invariants

1. Documents is an authorized provenance projection, not a storage owner.
2. Role, owner, association, acquisition channel and custody are distinct.
3. File format alone does not determine role.
4. Ordinary Photos/Memory are outside Documents.
5. Processing artifacts are not user Documents.
6. Role promotion may strengthen protection; lifecycle decay does not erase semantic role.
7. Cloud retention does not imply Group visibility.
8. Entity visibility does not imply original-evidence visibility.
9. Past status or age alone never authorizes deletion.
10. Protected or protection-unknown evidence cannot be cleaned.
11. Original bytes may disappear while canonical facts and permitted provenance survive.
12. Compression/representation policy is role-aware and never precedes durable intake.
13. Owning domains retain deletion, permission and retention authority.
14. Documents must not broaden access through provenance links or metadata.
15. System processing overhead is not user-retained billable storage by default.
16. Photo, Wallet and Export detailed policies remain deferred; existing domain behavior remains authoritative.
17. Custody correctness does not depend on future monetization.
18. Explicit Keep blocks automatic cleanup; user deletion still respects mandatory owner protection.
19. Neither processing/pass completion nor Review disposition proves evidence release or UNKNOWN terminality.
20. Shared physical bytes cannot be removed while any applicable owner/reference remains protected.
21. Documents participation never requires duplicated assets or global-Capture origin.

## Scope verification and owner-review stop

Delivered delta: only `docs/architecture/OTR_EVIDENCE_DOCUMENT_CUSTODY_ARCHITECTURE.md`.
APPROVED, PROPOSED and OPEN are separate. Conflicts/gaps, current behavior and future
responsible owners are explicit; current contracts remain authoritative.

Accepted Capture UX, Resolution and Review documents and all pre-existing tracked
files are preserved. No production code, tests, schema/enums, migrations, buckets,
storage policies/configuration, upload/download behavior, compression implementation,
cleanup worker, Data Health mutation, billing/quota/pricing, Wallet/security
implementation, Photo service/storage, generated export, redaction, ACL framework,
Documents route/UI, notification behavior, permissions, dependencies, runtime gate
or current-state document is changed. No implementation began.

Static validation covers document structure, required invariants/open decisions,
reference existence, formatting/whitespace, unchanged existing-file content and exact
Git scope. Runtime tests, UI guard, device acceptance and remote verification are
not applicable to this documentation-only change and are not claimed. No commit/push.

**STOP FOR OWNER REVIEW. No implementation or contract reconciliation begins here.**
