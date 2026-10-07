# OTR Capture Review Architecture — Documentation Only

Date: 2026-10-07 (Pacific/Auckland). Status: **REPORT READY FOR OWNER REVIEW**.

Workstream: `/Users/xoery/Project/otr-mobile-capture`, branch `trip/capture`.
Audited HEAD: `f47e8d5feddb7c17b83b68957100e40d4ad3ece5`; starting worktree clean.

**APPROVED** records the product direction supplied by the owner for this checkpoint.
**PROPOSED** describes architecture/integration concepts requiring later owner review.
**OPEN** records decisions this checkpoint does not settle. Product-direction approval
does not approve production enums, schema, APIs, runtime activation or capabilities.

This report extends and cross-references the [Capture UX baseline](OTR_CAPTURE_UX_ARCHITECTURE_BASELINE.md)
and [Capture Resolution Architecture](OTR_CAPTURE_RESOLUTION_ARCHITECTURE.md).
It does not rewrite either. Existing Platform & Import, Ledger and Trip Experience
contracts remain authoritative. Where direction conflicts with an accepted contract,
the current contract continues to apply until its owning reconciliation checkpoint.

Only this new report is delivered. No implementation, accepted-document update,
current-state update, ADR, test, commit or push belongs to this checkpoint.

## APPROVED product direction

### 1. Evidence-reactive Review

A Review Requirement represents an unresolved semantic decision derived from the
current evidence state. It is not a permanent questionnaire created by the first
parser uncertainty. As evidence changes, an unanswered requirement may remain open,
change alternatives/details, increase/decrease in importance, automatically resolve,
be superseded by a better question, or become irrelevant and close.

If Batch A produces six provisional issues and Batch B resolves four before the
user answers, Activity exposes the two remaining meaningful issues. Documents can
retain the earlier processing/review history. The user need not say “Done uploading”
to trigger re-resolution. Related Jobs/Batches retain independent storage/runtime
identities; a Review projection may span relevant evidence where contracts permit.

Automatic resolution of an unanswered question is not automatic acceptance of a
Candidate, consent to a domain action, evidence release or proof of execution.

### 2. Durable human decisions and reconsideration

An explicit answer becomes a durable reviewed disposition, intent or fact as
appropriate to its owning domain. Later evidence cannot silently replace that
decision, its presented context or its history. Where contradictory evidence matters,
ask a new conflict/reconsideration question, conceptually:

> You previously chose 3:00 PM. New evidence says 4:00 PM. Keep 3:00 PM / Use 4:00 PM.

The old decision remains attributable and revision-bound. A new answer is subject
to current permission, validation, revision/CAS and admission checks. Durability does
not make a stale answer executable against a newer baseline, guarantee that a
proposed mutation committed, or grant a user indefinite access after revocation.
Exact treatment of stronger later evidence remains OPEN within the no-silent-overwrite rule.

### 3. Canonical decisions versus descriptive differences

Review focuses on facts, relationships or actions requiring a meaningful canonical
decision. Departure date/time, origin/destination, check-in/check-out dates, booking
reference, traveler/participant relationship, Trip assignment and entity identity
can have materially missing, conflicting or unresolved states.

Free-form notes, marketing text, amenities descriptions, source prose and
noncanonical summaries need not have one canonical value. Different descriptions
do not automatically create conflicts or Review attention. Do not force each
extracted text fragment into a canonical field. Exact field classifications remain
with the domain/schema owner; these examples do not reclassify Ledger fields or
replace its existing descriptive-edit conflict rules.

### 4. Importance and domain admission are separate

| Conceptual importance | Meaning | Illustrative example |
| --- | --- | --- |
| BLOCKING | The affected result/action cannot safely be admitted or executed until resolved. | Critical flight date missing; unresolved Trip assignment for Trip-scoped admission. |
| IMPORTANT | A result/entity may exist, but the issue materially affects a trip or decision; candidate for active attention. | Conflicting flight departure times. |
| USEFUL | Preserve/expose in context, normally without interruption. | Hotel check-in 3 PM versus 4 PM when the reservation remains usable. |
| INFORMATIONAL | Preserve useful provenance without ordinary Review attention merely because information differs or is incomplete. | Differing noncanonical source descriptions. |

These are conceptual policy classes, not authorized persisted enums. Missing or
conflicting information does not automatically imply Review. Examples depend on
domain/action/context; a low presentation priority cannot waive a mandatory predicate,
and an IMPORTANT issue is not automatically a reason to reject an entire entity.
An unavailable capability or uncertain execution is not necessarily answerable by a
Review card. Other safe results may progress independently.

### 5. Temporal and contextual relevance

Importance can change as information becomes operationally relevant. A missing
terminal months before travel may have low importance; near departure it may be
useful or important. Future policy may consider:

`field semantic importance × conflict severity × temporal relevance × actionability`

This is a conceptual combination, not a numeric scoring formula. No thresholds,
reminder intervals or new authoritative Trip lifecycle/time rules are defined here.
Use supported temporal facts and preserve unknown precision/zones. Existing Import
deadline policy remains authoritative pending reconciliation described below.

### 6. Semantic Review Requirement identity

The logical anchor is conceptually:

`subject/entity + canonical field/relationship/action + unresolved semantic issue`

For Hotel H1 + check-in time + conflicting evidence, three disagreeing documents
should normally contribute to one question, not three independent questions.
New evidence re-evaluates that logical issue. A subject may still be a prospective
item; semantic deduplication cannot manufacture a canonical entity ID or prove two
Candidates refer to the same item. Exact identity, provisional-to-canonical mapping,
schema and storage are OPEN. A reconsideration of an answered issue must preserve
the earlier decision and distinguish the new decision context.

### 7. The minimum useful question

Ask the smallest decision needed for safe progress. Prefer “Which trip is this for?”
over asking the user to review every extracted PDF field. Prefer “Did you mean Sushi
Dai on Thursday at 7 PM?” over “No matching restaurant found.” These are conceptual
examples, not shipped/localized strings or permission for unsupported actions.

A card normally resolves one semantic decision. If several related fields require
substantial editing, route to the canonical entity Form. Do not send users through
every source document or build a large AI-generated questionnaire.

### 8. Constrained, product-owned presentation vocabulary

AI/resolution logic may propose supported content; it cannot generate arbitrary UI.
The following kinds are conceptual and do not authorize production enums or a DTO.

| Kind | Intended use and boundary |
| --- | --- |
| CONFIRM | Binary interpretation check, such as “Did you mean Sushi Dai on Thursday?” Interpretation confirmation does not implicitly authorize a consequential action. |
| SINGLE_CHOICE | One supported alternative, such as Japan Trip / Tokyo Conference or competing canonical values. |
| MULTI_SELECT | Several valid relationships only where the owner supports that cardinality, such as travelers/participants or future multi-Trip relevance. No universal multi-select assumption. |
| TYPED_FIELD_INPUT | One canonical value through the appropriate native/domain editor, retaining exact domain validation. |
| CONFLICT_RESOLUTION | Supported alternatives with provenance and an honest unresolved choice: 3:00 PM — booking PDF / 4:00 PM — later email / Not sure. |
| CANONICAL_FORM_REVIEW | Normal entity Form with supported AI/evidence values prefilled when substantial editing is needed; no parallel “AI Form.” |
| ACTION_APPROVAL | Explicit approval of a consequential action, such as creating a Trip, under its permission/audit semantics. |

Typed input means date picker for date, time picker for time, appropriate date-time
control for date/time, canonical money input for Money, numeric input for number,
text input for text, approved location/place selection for location, and approved
member/person selector for person. Not every missing field becomes a generic text
box. A control cannot erase temporal precision or infer a timezone/instant, resolve
money scale by guesswork, or turn a printed name into a Person ID.

### 9. New Trip and canonical Forms

An inferred Trip may be shown compactly with suggested name, date range, locations,
participants where supported and discovered relevant items. As established by the
[Resolution Architecture](OTR_CAPTURE_RESOLUTION_ARCHITECTURE.md#3-no-suitable-trip-and-new-trip-proposals),
creating the Trip always requires explicit approval. Inspection of a proposal is
not creation approval; confirmation of one cluster is not approval of another.

Detailed Review/Edit reuses the normal Trip creation Form with supported values
prefilled. The same principle applies to other entities: AI proposes/prefills;
canonical Forms provide precise user control. This is a reuse requirement for future
integration, not a claim that canonical Trip creation or every entity Form exists
in this worktree. Missing Forms/writers must be addressed by their owning workstream.

### 10. Not Sure, Later and Skip

| Intent | Approved semantics |
| --- | --- |
| NOT SURE | The user cannot determine the answer now. Keep truth unresolved and avoid repeatedly forcing the same question. Later evidence may resolve it automatically. |
| LATER | The issue may matter, but the user does not want to handle it now. Demote current interruption; later contextual/temporal relevance may justify resurfacing. Timing remains OPEN. |
| SKIP | The user does not require this issue resolved for their workflow. Do not repeatedly re-notify just because the field stays unresolved; preserve evidence/provenance. Independently supported future truth may still make the system more complete. |

These are distinct attention/resolution intents. Skip does not reject future truth,
declare the field resolved, authorize a write, discard evidence or bypass a blocking
domain requirement. Not Sure/Later are not competing canonical values. All explicit
dispositions remain durable, even if later evidence resolves their underlying
unanswered truth question. Their domain-specific persistence/restrictions/resurfacing
remain OPEN; do not equate them with existing Import DEFER/REJECT or Ledger ACK/DISMISS.

### 11. Settling before interruption

A requirement may exist internally before it deserves interruption. When repeated
related intake suggests evidence is still arriving, allow later evidence to
re-resolve provisional issues. Do not immediately escalate every provisional issue
to a banner or OS notification, and do not require “Done uploading.”

A future settling/escalation policy is needed across repeated intake and related
Jobs. No arbitrary timing window is selected. It must remain actionable for important
work, preserve truthful progress, and tolerate suspension/termination rather than
assuming the OS can run indefinitely. Settling does not cancel durable continuation,
settle UNKNOWN, or establish permanent evidence completeness.

### 12. Documents and Activity have different organization

| Surface | Question answered | Organization |
| --- | --- | --- |
| Documents | “What happened to the things I gave OTR?” | Evidence/source records, processing, provenance, results/associations, verification and relevant review history. Evidence-oriented chronology may remain. |
| Activity / Notification | “What needs my attention now?” | Current unresolved semantic issues and meaningful Jobs/results, with current importance and context. |

Several Documents and Capture Jobs may support one requirement. One Document may
support several entities/issues. Preserve source/result cardinality and independent
identities. Activity should not become a list of files, and Documents should not
become only an error inbox. Deep-links between surfaces are useful; routes and link
contracts remain OPEN. History visibility is subject to existing evidence access,
not an implied right to disclose every supporting source.

### 13. Re-resolution, regrouping and ordering

Later batches may change Activity grouping/order. The six-to-two example must
project the two remaining meaningful issues, while preserving older evidence and
decisions in authorized history. Order attention conceptually by:

1. Impact/severity.
2. Temporal/operational urgency.
3. Entity/context grouping.
4. Current unresolved state.

Upload/parsing completion time is not the Review priority rule. Documents may retain
its independent chronology. The baseline's one evolving Activity entry per Job
continues to support job progress/results; semantic questions across Jobs need not
duplicate that history or force the Jobs into one runtime/storage Job. Exact grouping,
deduplication and count units remain OPEN.

### 14. Attention escalation layers

| Layer | Approved conceptual use |
| --- | --- |
| Documents only | Informational/low-value unresolved provenance may remain in Documents or entity context. |
| Activity indicator | Useful/lower-priority unresolved issues may produce a dot/badge without interruption. |
| In-app banner | Blocking or sufficiently important current issues may produce one aggregate top-of-app message, conceptually “2 items need your attention,” opening relevant Activity/Review context. No banner per source file. |
| OS notification | Stricter threshold than ordinary Activity; potentially appropriate after the user leaves and processing settles with genuinely important unresolved work. |

No notification sending or push permission request is authorized. Exact banner
threshold and OS escalation, permission, delivery, timing/grouping policy remain
OPEN. An OS delivery record is not the current unresolved queue; an issue resolved
by later evidence must not remain an ordinary active Review demand merely because
an earlier notification existed. Reconciliation mechanics remain OPEN.

### 15. Trip presentation and Experience ownership

| Surface | Review responsibility |
| --- | --- |
| Trip Home | Aggregate Recent Imports / processing / “N need attention.” Do not distribute individual questions around the dashboard. |
| Today / Day | Surface unresolved information only when operationally relevant to the current activity/use. Do not present proposals as accepted travel facts. |
| Entity detail | Useful unresolved fields and permitted provenance for that entity. |
| Documents | Full authorized evidence/provenance/review history and verification. |
| Activity | Current attention queue, meaningful Jobs and results. |

Bottom Shell, navigation and screen composition remain owned by Trip Experience.
This report does not redesign them or infer Trip lifecycle authority from date labels.

### 16. Review responses are reviewed decisions, not LLM chat

Conceptually retain enough context to identify the subject/entity/field/action,
the alternatives and evidence shown, the user's disposition, relevant revision/pins/
identity, and when/under what admitted context the decision occurred. Exact schema
is OPEN. A model response or conversational acknowledgement cannot substitute for
an authenticated admitted human decision.

All resulting mutations still pass deterministic validation, permissions, revision
checks and owning-domain admission. A refresh that changes alternatives or pins
must not silently apply an answer from the old display to the new state. Decision
durability, preparation and successful canonical outcome remain distinct facts.

### 17. Resolution and Undo

Review is the human-resolution path for Resolution **REVIEW** consequences and
some **BLOCKED** conditions answerable by user input. It is not another execution
authority. A Review answer may enable a later deterministic action; it does not
permit an LLM to write state or enable a closed capability.

If Review corrects earlier automation, preserve the Resolution Architecture's
[Undo and correction semantics](OTR_CAPTURE_RESOLUTION_ARCHITECTURE.md#12-undo-product-semantics):
provenance/audit survives, current revisions and intervening human/member/external
changes matter, and compensation uses owning actions. Human-reviewed decisions
cannot be silently undone by later automatic reasoning. No general Capture Undo
implementation or availability guarantee is established here.

### 18. Processing order is not business mutation order

**Source processing order must not define business mutation order.** Correlate
related evidence before planning actions where practical. If Document A establishes
Flight F and Document B supplies its confirmation number, B may extract first.
B should remain unresolved/waiting for related evidence while the batch continues,
rather than fail merely because F has not yet been admitted.

Once supported matching establishes the same entity, derive semantic dependencies.
Where safe same-batch aggregation is possible, prefer one complete proposal over
unnecessary CREATE followed immediately by SUPPLEMENT. Unsupported confirmation/
booking fields remain deferred under current domain gates. If separate mutations
are necessary, their order follows action dependencies and verified predecessor
outcomes, not file arrival or parser completion. Future reverse-order Undo may use
semantic dependencies; queue order alone never proves reversibility.

### 19. Evidence authority is semantic

“Last uploaded” or “last processed” is not automatically authoritative. Consider
source type, supported issued/effective time, explicit change-notice meaning,
canonical identifiers, provenance, existing human decisions and domain authority
rules. Observation time alone is not effective time. Higher model confidence alone
is not authority. If evidence cannot safely establish a canonical value, preserve
alternatives/unresolved state and apply attention policy; do not manufacture certainty.

### 20. Offline/local-first compatibility

Review must remain compatible with offline/local-first operation where the needed
evidence and owning capability are available. Cached permitted evidence/decisions
must not require online launch re-authentication. Available local resolution can
reduce unanswered questions without an upload-completion ritual. Missing material,
incomplete search or remote-only capability remains honestly unavailable/waiting.

Durable local intent is distinct from server acceptance. Existing Account-generation
fencing, repository boundaries, revision-safe admission and exact recovery remain
effective on resume/reconnect. This does not claim B2's protected server decision
reservation can execute offline or authorize a new offline Review writer.

### 21. Historical / Past Trip intake — owner amendment

OTR must allow Capture/import of evidence for trips that have already occurred.
Historical intake uses the same underlying understanding/resolution architecture;
there is no separate Past Import engine or Review system. If no suitable Trip
exists, evidence may reconstruct a proposed past Trip, but creation still requires
explicit user approval through the existing new-Trip direction in section 9.

Once resolved/created as historical, presentation and Review attention reflect
Past/Memory context through the temporal/contextual relevance and importance model
in sections 4–5. Operational details that no longer affect the user should normally
be strongly demoted: old terminal information or an old hotel check-in-time
discrepancy should not, merely by remaining unresolved, block historical
reconstruction. This product direction does not waive current mandatory domain
admission predicates; the compatibility boundary is recorded in A13 below.

Historical conflicts are not universally irrelevant. Identity, dates, route/storyline,
financial facts, provenance and other domain-significant facts may remain important
under owning-domain policy. Preserve unresolved truth, durable human decisions and
meaningful provenance while reducing low-value operational interruption. Do not
invent an exact Recent Past / Archived lifecycle boundary; Trip Experience and
domain owners retain lifecycle/context authority.

### 22. Intake routing and Photo fast path — owner amendment

Not every item entering OTR must traverse the full semantic Import/Resolution/Review
pipeline. Where appropriate, explicit intent/context routes intake before expensive
semantic processing. An explicit Add Photos / Photos-context action routes ordinary
trip photos to their Media/Memory path, bypassing the full semantic pipeline.
Ordinary Photos/Memory assets do not enter Documents merely because they are files
or images. This defines a processing/presentation role, not a byte-storage policy.

An explicit contextual Add attachment or Add receipt establishes the intended owning
entity/domain path; do not unnecessarily re-resolve the intended Trip/entity.
Existing permission, entity/revision, validation and domain safety checks remain.
Evidence extraction or supported suggestions within that path may still be useful;
context does not broaden Ledger OCR eligibility or replace canonical Form Save.

Global/ambiguous Capture may require lightweight image routing/classification as
conceptually evidence/document-like, photo/memory-like or mixed. A mixed batch may
fan out into different processing paths instead of forcing every item through one
pipeline. These labels authorize no enum, classifier/model or runtime activation.
Explicit user intent outranks AI classification unless safety/domain constraints
require otherwise. Routing selects processing; it does not establish canonical
business truth, prove entity identity or authorize a business mutation.

Evidence, receipt, attachment and ticket/document-role material may participate in
Documents/provenance according to the owning domain. File format alone neither
establishes that role nor makes all images Documents. Exact role mapping and mixed
batch handoffs remain OPEN; underlying identities, access and domain ownership stay
intact. No local/cloud original-byte, retention, cleanup or upload decision follows
from taking the Photo fast path or participating in Documents.

## PROPOSED architecture / integration concepts

These concepts explain a possible fit. They approve no storage, DTO, queue or runtime.

1. **Current semantic projection over retained facts.** Derive current requirements
   from authorized evidence, immutable Run/Candidate observations, current closure/
   action assessments and durable human intent. Update the projection on relevant
   evidence changes; publish new observations/assessments rather than editing READY
   publications or sealed decisions. Projection closure preserves history and does
   not imply deletion, resource release or canonical acceptance.
2. **Separate decision truth, attention and execution.** Retain whether the semantic
   predicate is unresolved, what the user decided, whether it warrants interruption,
   and whether an admitted action is prepared/applied/uncertain as distinct concepts.
   Not Sure/Later/Skip affect the permitted attention policy without fabricating truth.
   Reconsideration links to prior intent, with current alternatives and fresh pins.
3. **Constrained owner-facing handoff.** A future presentation contract could name a
   supported kind, typed subject/predicate, permitted alternatives/provenance, current
   review version/pins and allowed dispositions. Deterministic product/domain code
   validates the handoff and renders canonical controls/Forms. This is a list of
   conceptual needs, not a constrained schema/API definition or AI prompt.
4. **Reassess at decision admission.** Review response handling could reuse owning
   freshness/CAS and replay boundaries. If evidence, access, alternatives or target
   revisions changed, request refreshed review; do not transplant consent. Preserve
   stable exact response-loss recovery. Interpretation confirmation and consequential
   action approval must remain distinguishable where owners require separate intent.
5. **Cross-Job correlation without identity collapse.** Authorized matching/provenance
   could let one current issue reference evidence and results from multiple Jobs.
   Job progress/result history stays per intake intent. Dedup must account for field,
   booking/participant scope, prior decisions and current unresolved meaning. It
   cannot bypass Trip scope, lineage claims or private Source access.
6. **Settling and escalation as presentation policy.** Consume durable evidence/work/
   attention observations through existing owners. Re-evaluate provisional attention
   when related intake changes; preserve urgent actionable work and resumed execution
   responsibilities. Do not introduce a Capture timer, worker or second scheduler.
   Exact signals, bounds and mapping to existing deadline policy remain OPEN.
7. **Semantic action plan before queue adaptation.** Prefer supported aggregate
   proposals before mutation binding. Where multiple actions remain necessary,
   reuse Import I2 reviewed successors and exact predecessor receipts. A planner's
   semantic dependencies and a queue's execution dependencies are different contracts;
   neither an extraction completion nor a wake-pass completion proves domain success.
8. **Shared principles, domain-owned integration.** Reuse Ledger's immutable observation,
   append-only personal intent, audited correction and receipt patterns where suitable.
   Do not reuse Ledger Finding IDs/tables/ACK/DISMISS as a universal Capture system.
   Future localization/accessibility work must use canonical UI Foundation/glossary,
   parameterized product-owned templates, accessible typed controls and honest states;
   exact dynamic-question contracts require owner review.

## Focused compatibility audit and required reconciliation

Evidence is from this worktree's accepted contract/implementation records and
[current handoff](../CURRENT_IMPLEMENTATION_STATE.md). Historical report headers
retain earlier pending status; integrated acceptance governs current foundation
status. This audit certifies no deployed or device capability. It reads no credentials,
personal databases, remote environments or legacy Web checkout.

| Finding | Accepted evidence / current boundary | Compatibility or conflict | Future owning checkpoint; behavior until then |
| --- | --- | --- | --- |
| A1 — Evidence-reactive projection | [Import contract](TRIP_IMPORT_CONTRACT.md), “Identity and N↔M model,” “Closure assessment,” “Evidence and provenance”; [Source provenance](TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md), H–K. Published Runs/Candidates/selected values are immutable; consolidation/reprocessing uses new versions/lineage. | Compatible as a current projection. In-place updates to a question's underlying immutable proposal or a prior answer would conflict. Exact semantic identity and cross-Job correlation are a GAP. | Platform & Import + Capture: semantic requirement/projection contract. Preserve existing immutable observations, exact provenance and lineage claims; no new identity/storage authority now. |
| A2 — Context-only mandatory review | Import contract, “Context Snapshot at intake,” explicitly requires review for source dates conflicting with viewed Day or Trip overview. [Resolution Architecture](OTR_CAPTURE_RESOLUTION_ARCHITECTURE.md#2-context-is-evidence-not-truth) normally avoids interruption for a clear same-Trip Day mismatch. | **POLICY CONFLICT**, carried forward: the minimum meaningful-question/low-interruption direction cannot silently remove currently mandatory context review. | Platform & Import + Trip/Experience + Capture: context/closure reconciliation checkpoint. Keep accepted explicit review until reconciled. No source clipping, inferred year or context rewrite. |
| A3 — Question resolution versus action confirmation | Import contract, “Confirmation and commit”; [CP13B closure report](TRIP_CHECKPOINT_13B_BUILDER_B_CLOSURE_REPORT.md), “Closure, match and reviewed actions”; [CP13A admission](TRIP_CHECKPOINT_13A2_CANONICAL_FLIGHT_IMPORT_IMPLEMENTATION_REPORT.md). READY is not ACCEPTED; explicit per-purpose disposition and exact pins precede preparation. | **CONFLICT IF** disappearing unanswered issues is used to omit mandatory action confirmation or convert READY into consent. Automatic semantic resolution itself is compatible. The Resolution AUTO direction cannot activate current explicit-confirmation actions. | Platform & Import + owning domains + Capture: consent/action policy checkpoint. Keep current explicit disposition, typed supported shapes, CAS and closed gates. A remaining action approval may still be required after uncertainty disappears. |
| A4 — Existing attention policy | Import contract, “Urgency and attention policy”; CP13B attention implementation in `src/domain/trip/flightImportClosure.ts`. Current versioned policy uses NONE/DEFERRED/ACTION_REQUIRED/URGENT with explicit now/clock, evidenced deadlines and configurable horizon; contract baseline default is 24 hours. | **REPRESENTATION/POLICY MISMATCH** with conceptual BLOCKING/IMPORTANT/USEFUL/INFORMATIONAL. No equivalence or replacement is approved. Existing horizon is acknowledged, not selected as this report's settling/escalation threshold. | Platform & Import + Capture + Experience/CXE: importance/attention mapping checkpoint. Preserve underlying current urgency/deadline facts and policy version; no new numeric score, timing rule or enum. |
| A5 — Proposal/decision freshness | [B2 owner lifecycle clarification](CP14_B2_OWNER_REVIEW_LIFECYCLE_CLARIFICATION.txt); [API contract](../API_CONTRACT.md), “CP14 B2 closed inbound application boundary”; [data model](../DATA_MODEL.md), “CP14 B2 proposal and authenticated decision lifecycle.” Proposal replay is package/review_version-bound; authenticated ACCEPT/REJECT/DEFER decisions are sealed. All NEW dispositions require current owning evidence; READY additionally gates ACCEPT. | Durable decisions are compatible. Silent proposal mutation/rebinding or using superseded displayed pins would conflict. NOT SURE/LATER/SKIP have no approved one-to-one mapping to these dispositions. B2 package identity is not global semantic requirement identity. | Platform & Import + B2 owner + Capture: response-intent/freshness contract checkpoint. Preserve original decisions, fresh admission and exact replay; no pre-consent authority IDs, new decision reservation API or replacement IDs after response loss. |
| A6 — Duplicate/action conflicts and dependencies | Import contract, “Entity resolution and consolidation,” I1/I2; CP13B closure. SAME_ITEM/action outcomes are separate; incomplete lookup is not absence. UNKNOWN predecessor CREATE blocks competing CREATE. Mixed changes need an admitted all-field atomic command or reviewed receipt-correlated successors. | Semantic correlation and aggregate proposals are compatible. Treating upload/extraction order as authority, conflating passenger scopes, blind rebasing, or creating a target because another file finished first would conflict. Exact cross-Job planning dependency representation is a GAP. | Platform & Import + Event/domain owners: cross-Job correlation/action-plan checkpoint. Preserve claim/lineage fences, exact predecessor recovery and supported command shapes; unsupported booking/person dimensions remain deferred. |
| A7 — Financial Review separation | [Ledger Review Phase 1](../ledger/REVIEW_2_0_PHASE_1_ENGINE_FOUNDATION.md), [Phase 2](../ledger/REVIEW_2_0_PHASE_2_PERSONAL_DECISIONS_AND_VISIBILITY.md), [Phase 3](../ledger/REVIEW_2_0_PHASE_3_INBOX_AND_DETAIL_UX.md). Shared immutable Findings have lifecycle/generation; personal ACK/DISMISS leaves financial truth/shared lifecycle unchanged. Active counts exclude resolved/superseded history. | Useful patterns, **NOT** the global Capture Review authority. ACK/DISMISS is not a canonical-value answer or Capture Skip; new financial generations may require their own personal decision. Turning these records into Capture requirements or using Capture suppression to close them would conflict. | Ledger + Capture: financial handoff/federated presentation checkpoint if later requested. Preserve financial eligibility, caller-private actions/history, protocol, generations and financial domain ownership. No Ledger review or receipt policy change. |
| A8 — Audit, correction and receipts | [Ledger conflict model](../ledger/LEDGER_2_0_SYNC_CONFLICT_MODEL.md); API “Expense Consistency v2”; [Final-version correction plan](../ledger/SETTLEMENT_2_0_FINAL_VERSION_REVISION_AND_CLEAN_TRIP_PLAN.md). Corrections require base revision/current authority; protected Expenses use successors and immutable Settlement lineage; operation receipts distinguish actual outcomes. | Reusable safety principles. Canonical correction is separate from heuristic acknowledgement. Global Review/Undo cannot overwrite frozen inputs or reinterpret queue COMPLETED as APPLIED. | Owning domains + Platform & Import: audited decision/correction/Undo integration checkpoint. Use exact receipts/current revisions, preserve append-only history and required reasons/permissions; no general compensation writer. |
| A9 — Activity/notification capability and grouping | [Capture UX baseline](OTR_CAPTURE_UX_ARCHITECTURE_BASELINE.md#activity-and-completion) specifies one evolving Activity entry per batch Job. Import “Presentation-neutral progress” anticipates separately authorized Batch/version/reason coalescing. [C2 report](TRIP_CHECKPOINT_14_AGENT_C2_CONTINUATION_RUNTIME_REPORT.md) and API record notification-ready facts, not delivery. `src/data/sync/ledgerQueueActivity.ts` separates scheduler intelligence activity from Ledger counts; `app/(tabs)/capture.tsx` remains a Foundation routing boundary. | **GAP**, plus grouping reconciliation needed: Job history is not one file/one question; cross-Job semantic attention cannot be deduplicated solely by Batch. No dedicated Capture Activity/Documents/Review production surface or OS delivery is evidenced here. Existing Ledger banner is financial, not a Capture banner. | Capture + Experience + Platform: Activity/projection/count/deep-link checkpoint; notification owner: separate escalation/delivery checkpoint. Preserve Job entries and independent identities; do not claim ready facts mean notifications sent. |
| A10 — Trip Forms, Today/Day and shell | Trip Experience E0 preserved report (provenance below); [Day report](TRIP_CHECKPOINT_11_DAY_READ_MODEL_REPORT.md); API local Day reads retain certified/currently-matching versus historical distinctions. General Trip repository/Form, canonical ticket/document and lifecycle contracts have gaps. | Approved canonical Form reuse is a requirement, not evidence Forms/writers exist. Review context must not make proposals look admitted or redefine Today/Day, lifecycle/time policy or Bottom Shell. | Trip Experience + Trip/domain owners: canonical Form/deep-link and operational-presentation checkpoint. Retain ownership and accepted observation semantics; no shell or lifecycle redesign. |
| A11 — Capture/Source/Representation privacy | [Data model](../DATA_MODEL.md), CP11 Capture; [Source provenance](TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md), H–O; Import evidence sections. Account-owned original Capture BLOBs, Trip-scoped admitted Sources, exact immutable Representations/Run Inputs and target evidence are distinct. Association grants no Source access. | N↔M Review support is compatible; file hash/source identity alone cannot define issue/entity identity. Cross-Job projection cannot broaden access, merge Trip custody or alias Ledger receipts. History completeness does not authorize retention/purge/storage changes. | Source + Platform & Import + Capture: provenance/cross-Job authorized projection checkpoint. Evidence custody/retention remains a separate future checkpoint; preserve inaccessible/whole-support markers and current protection. |
| A12 — Offline and lifecycle responsibility | [Offline sync](../OFFLINE_SYNC.md), CP13A draft/recovery and CP14 continuation sections; current handoff. Local repository/Account-generation gates, exact idempotency, sole `sync_operations` scheduler and five C dispatch denials remain. B2 requires protected authenticated server reservation. | Local evidence-reactive presentation is compatible where capability/evidence exists. Universal offline mutation/decision reservation or indefinite OS background execution is a **CAPABILITY GAP**, not permission to invent a queue/writer. | Platform & Import + owning domains: offline Review intent/admission checkpoint. Keep remote-dependent work pending, cache accessible under local authorization, UNKNOWN recoverable and all runtime/provider gates closed. |
| A13 — Historical reconstruction and admission | Import contract, “Urgency and attention policy,” says known past items alone are not urgent. “Closure assessment” still requires closure-critical predicates; [CP13B closure report](TRIP_CHECKPOINT_13B_BUILDER_B_CLOSURE_REPORT.md) requires exact independently supported Flight departure for CREATE. Trip Experience E0 provides presentation context, not an accepted Recent Past / Archived boundary. | Past/Memory attention demotion is compatible with existing nonurgency. **CONFLICT IF** historical reconstruction's low-value-detail nonblocking direction is applied to waive an existing mandatory admission predicate: past status alone does not make a current Flight CREATE eligible. No inspected contract requires an old terminal or hotel check-in-time discrepancy to block all reconstruction; exact domain classifications remain OPEN. | Platform & Import + Trip/domain owners + Experience: historical admission/attention reconciliation checkpoint. Preserve mandatory predicates and independent partial progress; do not add a Past Import engine, bypass financial safeguards or invent lifecycle thresholds. |
| A14 — Photo/Memory versus Documents coverage | [Capture UX baseline](OTR_CAPTURE_UX_ARCHITECTURE_BASELINE.md#documents-and-provenance) says Documents supports “All captured/imported source material.” Import architecture describes images/photos as acquisition coverage; the Resolution pipeline describes semantic evidence processing. Neither establishes an ordinary Media/Memory fast-path implementation. | **DOCUMENT-COVERAGE WORDING CONFLICT** if the baseline's broad “all” includes ordinary Photos/Memory intake: the new approved direction keeps ordinary Photos/Memory outside Documents regardless of file/image format. Semantic evidence processing remains applicable to routed evidence; it is not a universal pipeline for all Media. | Capture + Trip Experience + Media/Memory + Platform & Import: intake-role/Documents scope reconciliation checkpoint. Record the exclusion here without rewriting the baseline or interpreting file type as evidence role. No Media writer, routing runtime or Documents storage schema is approved. |
| A15 — Contextual receipt/attachment routing | UX baseline, “Contextual Capture and attachments”; [attachment/receipt design](../EXPENSE_ATTACHMENTS_RECEIPT_SCAN_1_0_DESIGN.md) and [Receipt OCR C0](../ledger/RECEIPT_OCR_1_0_PHASE_C0_REVIEW_DESIGN.md). Contextual attachment entry and New Expense-only OCR/Form Save are already distinct from global Capture. Source/Trip handoff still requires exact admission. | Intent-led routing is compatible; no new direct conflict found. **CONFLICT IF** bypassing semantic re-resolution is used to bypass authorization/revision checks, enable existing-Expense OCR, or turn receipt intake into an automatic financial write. Lightweight ambiguous routing, mixed-batch handoff and Documents roles are capability/contract GAPs. | Owning attachment/Ledger/Media domains + Platform & Import + Capture: intent-routing and mixed-batch handoff checkpoint. Preserve existing domain and upload contracts; custody/storage decisions remain deferred to Evidence & Document Custody Architecture. |

Trip Experience E0 is absent from this Capture worktree. The preserved report read
for context is `/Users/xoery/Documents/Codex/2026-10-06/files-pasted-by-the-user-otr/outputs/TRIP_EXPERIENCE_E0_BASELINE_ARCHITECTURE_REPORT.md`,
dated 2026-10-06 and audited at `c4571746b0c300fa3b46842cd37745963567338c`.
Its proposals await owner review; it does not prove Experience implementation is
installed in Capture. The baseline's existing E0 reference remains unchanged.

Mandatory foundations reviewed: `AGENTS.md`, [Product](../PRODUCT.md),
[Architecture](../ARCHITECTURE.md), [Data model](../DATA_MODEL.md),
[API](../API_CONTRACT.md), [Offline sync](../OFFLINE_SYNC.md),
[environment audit](../ENVIRONMENT_AUDIT.md) and existing [legacy audit](../legacy/OTR_LEGACY_AUDIT.md).
Only relevant local contract/report sections and focused runtime symbols were audited;
no broad runtime/security/release certification or legacy re-audit is claimed.

## OPEN questions and owning checkpoints

Do not resolve these merely to complete the report. Owners below identify required
reconciliation responsibility, not scheduled work or implementation authorization.

| OPEN decision | Future owner/checkpoint |
| --- | --- |
| Exact per-domain canonical/descriptive field and importance classifications | Owning domains + Capture: field policy. |
| Exact Blocking / Important / Useful / Informational representation and mapping to current Import severity | Platform & Import + Capture + Experience: attention policy reconciliation. |
| Temporal escalation policy, timing and authoritative operational context | Trip/domain owners + Experience/CXE: temporal policy. |
| Settling across repeated intake and multiple related Jobs; aggregation window before action planning | Platform & Import + Capture: evidence/work settling. |
| Exact Review Requirement identity/schema, including provisional subjects, split/merge and reconsideration linkage | Platform & Import + Capture + domain owners: semantic identity/projection. |
| Exact constrained Review schema/API and supported presentation types for each domain | Capture + Platform & Import + domain owners: constrained handoff. |
| Canonical Form integration contracts, supported prefills, validation and consequential approval boundaries | Trip Experience + Trip/other domain owners: Form integration. |
| Exact Not Sure / Later / Skip persistence, allowed domain restrictions and resurfacing semantics | Capture + domain owners: disposition policy; blocking predicates stay effective. |
| Activity grouping, ordering, deduplication and count units across Job history and current semantic issues | Capture + Experience + Platform & Import: Activity projection. |
| In-app banner escalation threshold | Capture + Experience: attention presentation. |
| OS notification escalation, permission, grouping, timing and delivery policy | Notification/platform owner + Capture + Experience: separately authorized notification checkpoint. |
| Treatment of human-reviewed decisions when stronger evidence arrives, including reconsideration and multi-user disagreement | Domain owners + Capture: durable decision/correction policy within no-silent-overwrite invariant. |
| Semantic evidence-authority rules by domain | Platform & Import + domain owners: evidence authority. |
| Cross-Job evidence correlation, access scope and immutable publication lineage | Platform & Import + Source/domain owners: correlation/provenance. |
| Dependency representation between CREATE / SUPPLEMENT / UPDATE; relationship to execution-queue dependencies | Platform & Import + domain/queue owners: semantic action planning and receipt-safe sequencing. |
| Activity / Documents / Today / Day / Entity Detail deep-link behavior | Trip Experience + Capture + domain owners: navigation/context. |
| Localization/accessibility requirements for dynamically parameterized questions and typed controls | Capture + UI Foundation/localization owners + Experience: presentation contract. |
| Review history visibility and retention | Capture + domain/security/Source owners: history access; evidence custody/retention remains separate. |
| Exact relationship between Review disposition, Resolution policy and future Undo availability | Capture + Platform & Import + domain owners: consent/correction/compensation. |
| Historical field significance/nonblocking policy, Past/Memory presentation and exact Recent Past / Archived lifecycle boundary | Trip/domain owners + Platform & Import + Experience: historical admission/attention reconciliation; no lifecycle boundary selected here. |
| Exact intent-routing/classification policy, safety override behavior and mixed-batch processing handoffs | Capture + Platform & Import + Media/Memory + attachment/Ledger owners: intake routing; no classifier or separate Past engine activated. |
| Ordinary Photos/Memory exclusion versus evidence/receipt/attachment/ticket Documents roles and baseline coverage wording | Capture + Experience + owning domains: Documents scope reconciliation; exact storage schema/custody remains separate. |

## Architecture invariants

1. Review projects unresolved semantic state; it is not a static parser-error inbox.
2. Later evidence may resolve unanswered questions without user intervention.
3. Explicit human decisions are durable and cannot be silently overwritten by AI.
4. Documents stays evidence-centric; Activity stays attention-centric.
5. A source file is not a Review Requirement's identity.
6. Missing/conflicting information does not automatically deserve interruption.
7. Only constrained product-owned Review presentation is permitted; no arbitrary AI UI.
8. Detailed editing uses canonical Forms, not parallel AI Forms.
9. Presentation priority and domain admission requirements are different concepts.
10. Processing order determines neither canonical truth nor business mutation order.
11. Review supplies human intent; domain owners retain execution/mutation authority.
12. Review remains compatible with offline/local-first operation where underlying
    evidence and owning capability are available.

## Out of scope and owner-review stop

This report does not implement or authorize production Review UI, ReviewRequirement
tables/schema, constrained production enums/API, notification delivery or push
permissions, arbitrary AI Forms, new Trip/entity writers, automatic mutation gates,
AI prompts/models or local/remote activation, new queues/workers, tests, dependencies,
routes, configuration or any runtime behavior.

Evidence/Document cloud-storage policy, Wallet storage, retention/cleanup,
Supabase Storage changes, Ledger receipt policy changes and Bottom Shell changes
remain out of scope. Evidence custody/retention is a separate future architecture
checkpoint. “Preserve history” states intent under existing protections and does not
select a new retention period or promise indefinite byte availability.

The separate future **Evidence & Document Custody Architecture** checkpoint owns
original-byte local/cloud placement, retention periods, cleanup eligibility,
Supabase Storage behavior, Wallet/credential storage, Ledger receipt storage policy,
attachment upload policy and exact Documents storage schema. Neither historical
intake nor Photo/Memory routing decides any of these matters in this amendment.

Static document/scope verification: APPROVED, PROPOSED and OPEN are separated;
the two Capture reports and accepted contracts are cross-referenced; conflicts,
capability gaps and future owners are explicit. The only delivered delta is this
new Markdown file. Accepted documents, production source, tests, schemas/migrations,
routes, dependencies/configuration and runtime files remain unchanged. No notification,
Review, AI, queue, storage or UI implementation is started. No runtime tests are
needed or claimed for this documentation-only checkpoint. No commit or push.

**STOP FOR OWNER REVIEW. No implementation or contract reconciliation begins here.**
