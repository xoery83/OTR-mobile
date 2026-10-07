# OTR Capture Resolution Architecture — Documentation Only

Date: 2026-10-07 (Pacific/Auckland). Status: **REPORT READY FOR OWNER REVIEW**.

Workstream: `/Users/xoery/Project/otr-mobile-capture`, branch `trip/capture`.
Audited HEAD: `e5a5f100e0411f1eef08d55e64a5a37b4e438835`; worktree initially clean.

**APPROVED** records product direction supplied by the owner. **PROPOSED** describes architecture for later integration review. **OPEN** identifies decisions still required. Approval of direction is not approval of a schema, API, prompt, model, runtime activation or domain capability. Existing Platform & Import, Ledger and Trip Experience contracts retain authority; conflicts below require an owning-workstream checkpoint before implementation.

This report extends the [Capture UX baseline](OTR_CAPTURE_UX_ARCHITECTURE_BASELINE.md) without editing it. It authorizes no production code, schemas, migrations, AI services, prompts, routes, UI, tests, dependencies or runtime behavior. No commit or push is authorized.

## APPROVED product direction

### 1. Resolution pipeline and partial progress

```text
Input / Evidence
→ Fact Extraction
→ Trip Resolution
→ Candidate Retrieval
→ AI Entity / Reference Resolution
→ Intent Resolution
→ Deterministic Policy
→ Revision-safe Domain Action
```

This is a conceptual dependency pipeline, not a mandatory sequence of blocking workers. Capture/Import may keep extracting and understanding evidence before Trip Resolution completes. An unresolved Trip blocks admission of the affected result when necessary; it does not block the entire Job. One Job can produce results for multiple Trips, with independent progress for confident clusters and unresolved residual items.

Durable intake, draft observations, admitted Import proposals, prepared commands and accepted domain results are distinct. A discovered item is not an added entity. Preserve the baseline's one evolving Activity entry per Job and its distinction between intake/current-pass completion, outstanding resumable work and uncertain execution. A summary cannot cancel reconnect work, hide later results or release protected evidence.

### 2. Context is evidence, not truth

Capture context records the Account, Trip, Day, entity and insertion context supplied by the invocation surface. Resolved Trip relevance/assignment is a separate conclusion based on explicit user intent, captured evidence, existing Trip state and relevant facts. Preserve the historical intake context even when the conclusion differs.

Explicit target intent is stronger than passive UI context. Strong source/content evidence may override passive Trip/Day context. Trip context is a strong prior; Day context is a weaker placement hint. None of these signals grants permission, proves entity identity or supplies missing accepted facts by itself.

A Day mismatch alone should normally not interrupt the user. When evidence clearly belongs to another day within the same Trip, place it on the evidence-supported day and optionally inform lightly. Respect endpoint-specific zones and temporal precision; do not achieve placement by rewriting source dates or inventing midnight. Evidence suggesting a different Trip has materially different consequences and may require review before cross-Trip admission. Explicit intent conflicting with strong evidence must remain visible for resolution rather than being silently overridden.

### 3. No suitable Trip and new Trip proposals

Evidence processing can begin without an existing Trip. OTR may fully understand the evidence and propose a Trip with a suggested name, date range, locations, participants where supported and relevant discovered items. Inferred values remain labelled proposals with support and uncertainty.

Creating a new top-level Trip **always requires explicit user confirmation**, even at very high confidence. Do not silently create a placeholder Trip to obtain an ID. Prefer waiting long enough to present a useful, supported proposal over interrupting early for Trip creation. Participant inference does not authorize member creation, Account linkage or access.

A batch may yield several apparent new Trip clusters. Process clusters independently and present each for inspection and individual confirmation. V1 does not optimize around a single “Create All” action. Ambiguous residual items must not prevent confident clusters from progressing; confirmation of one cluster is not consent for another.

### 4. Existing Trip matching and metadata correction

An extremely strong existing Trip match with no meaningful contradictory evidence may admit results without asking merely to reconfirm the Trip, subject to current owning-domain requirements and the integration gaps recorded below.

Matching considers temporal continuity/proximity, transport continuity, geography, participants/travelers, booking relationships, existing Trip entities, explicit user references, source relationships and current Trip context. Time continuity matters but is not the sole rule. Geography alone cannot split Trips: travelers may depart from different places and converge, and one Trip may span distant locations. Missing data contributes no agreement; inaccessible or incomplete search is not proof of absence. Product behavior must not become a brittle list of hand-authored if/else identity rules.

User-entered dates and locations are useful context, not necessarily immutable truth. For a Trip entered as Dec 10–20, strongly supported evidence of a Dec 22 return flight clearly continuing that Trip may justify extending its range through Dec 22. Safe, strongly evidenced corrections are candidates for **AUTO + INFORM + UNDO**. Authoritative fields, lifecycle effects, permissions and correction policies remain subject to the Trip owner's contracts; this example does not authorize an automatic writer.

### 5. Resolution consequence classes

| Class | Conceptual UX consequence |
| --- | --- |
| AUTO | Strong, low-risk placement/resolution warrants no interruption. |
| AUTO + INFORM + UNDO | Strong, safely reversible resolution/mutation executes, then surfaces the meaningful change and available Undo. |
| REVIEW | Meaningful ambiguity, cross-Trip relevance/ownership, conflicting evidence or consequential action requires a focused choice. |
| BLOCKED | Insufficient/contradictory evidence or domain requirements prevent safe admission/action. |

These are consequence classes, not new persisted status enums and not replacements for Import closure, capability or execution states. No numeric confidence threshold is chosen. Future policy combines semantic confidence, action risk and actual reversibility with permissions, revisions, conflicts and domain admission. Confidence alone never authorizes high-risk/destructive action. A waiting result may remain resumable; BLOCKED does not automatically mean terminal failure.

### 6. Non-exclusive Trip relevance and financial invariants

Resolution determines relevance/assignment, not necessarily exclusive ownership. A boundary flight may end one Trip and begin another and legitimately appear in both. Preserve the possibilities of one evidence/document supporting many entities, one entity supported by many evidence/documents and one travel fact referenced by multiple Trips. This does not choose the production shared-entity schema or change current Trip-scoped Source/Event authority.

Itinerary visibility is separate from financial accounting. Showing a flight in two Trips must not automatically create two Expenses, two economic events or double-count aggregate spending. Future architecture might use a primary accounting Trip with related Trip references, or explicit allocation of one economic event across Trips. **Allocation is not authorized for Beta by this document.** Existing financial identity, exact Money, Expense revisions, valuation, settlement participation and immutable Settlement lineage remain authoritative.

### 7. Deferred organization above Trip

Trip Collection / multi-Trip organization is a deferred future concept: a larger journey composed of Trips, recurring India business Trips across years, or thematic/memory collections. A Trip may eventually belong to multiple collections; do not assume a single parent collection. Overview, roadmap/storyline, memories/photos and unique financial events might be aggregated without double counting. Naming, schema and UI remain OPEN. This concept does not expand Beta or introduce production storage now.

### 8. Entity / Reference Resolution

Entity Resolution asks: **What existing object, if any, does this evidence or user statement refer to?** It includes duplicate detection but is broader. The same conceptual responsibility applies to files, email, pasted text/URLs/images, Magic Input, push-to-talk and later evidence updating entities; it does not imply those acquisition adapters exist today.

Examples include “Move Wednesday evening’s restaurant 30 minutes later,” an airline change notice, a second hotel confirmation supplementing a reservation and duplicate evidence for a known booking. Understanding a move request does not authorize V1 execution.

Conceptually distinguish NEW, MATCH_EXISTING, AMBIGUOUS and CONFLICT. A match can then mean DUPLICATE/corroborating evidence, SUPPLEMENT or UPDATE. These names are explanatory, not a proposed production enum. Matching an occurrence does not collapse booking, traveler, ticket or field scope, and new evidence does not necessarily imply a new entity or an overwrite.

### 9. Candidate retrieval and semantic reasoning

Retrieve a compact candidate world before asking AI to resolve a reference. Use structured/indexed facts such as Trip, date window, entity type, participants, location, identifiers and existing relationships. Preserve access scope, search coverage, revisions, positive/negative evidence and alternative candidates. Do not send the user's entire historical database for a local reference.

AI performs semantic resolution within that bounded world. A justified broader search is another authorized retrieval, not permission for the model to browse arbitrary records. The architecture should permit later local models for common/private/fast cases and remote reasoning for harder cases. Routing, indexing, resource bounds and model availability remain OPEN; neither path is activated here.

### 10. AI judges meaning; deterministic policy governs consequences

1. Extract objective facts deterministically whenever practical, preserving raw values and provenance.
2. Use AI/semantic reasoning for ambiguity, clustering, fuzzy references and meaning.
3. Require structured/schema-constrained AI proposals, validated against allowed candidates and evidence; AI cannot mutate state directly.
4. Deterministic policy evaluates confidence, risk, reversibility, permissions, current revisions, conflicts and owning-domain admission requirements.
5. Mutate only through existing/future revision-safe owning-domain actions; never direct LLM writes.

The model is not the source of truth. Semantic resolution does not bypass deterministic identity/closure checks, establish completeness, fabricate provenance or declare a pending operation uncommitted.

### 11. Minimum-question UX and Magic Input boundary

A unique high-confidence reference plus a low-risk reversible action may execute and inform with Undo when its owning action supports that policy. Ambiguity should ask the smallest useful question. If “Wednesday evening’s reservation” matches two reservations, show those two and ask which one. If the stated day/name seems mistaken but one nearby semantic candidate is strong, ask “Did you mean Sushi Dai on Thursday at 7:00 PM?” rather than mechanically reporting no match. Examples are conceptual copy, not localization changes.

Magic Input V1 emphasizes **Add, Supplement and Update**. Delete, Move/Reorder, broad planning and destructive operations are not promoted as direct execution paths because AI understands them. Unsupported/high-risk intent may guide the user to appropriate existing UI. Reference resolution, intent understanding, capability availability and execution permission are separate decisions.

### 12. Undo product semantics

Capture Undo reverses OTR-owned automation mutations that remain safely reversible. It is not arbitrary database rollback or a global Photoshop-style history stack.

1. Only OTR-owned automation mutations are automatically undoable; no automatic undo of user/member/external edits.
2. Reverse dependency order determines safety, not global chronology.
3. Independent entity chains can be undone independently.
4. Same-job dependent changes are undone from the leaf backward or together when the parent cannot safely be undone alone.
5. A later user/member/external mutation closes or constrains the affected earlier automatic Undo boundary.
6. Undo reverses actions; original evidence and processing/audit history remain.

For Document A → CREATE Hotel H1 followed by Document B → SUPPLEMENT H1, do not undo CREATE independently while retaining its dependent supplement. Undo the supplement first, or reverse the safe dependent chain together where domain capabilities permit. If a user later edits H1, earlier import Undo must not silently overwrite that edit. Dependency safety applies across Jobs as well as within a Job; exact cross-Job handling remains OPEN.

Distinguish Undo Trip assignment/reassign, Undo Trip metadata extension, Undo entity creation, Undo supplement/update and Undo safe changes from a Job. Do not offer an architectural “Undo Document”: evidence remains valid even if resolution/action was wrong. Documents/history retain what OTR did and later corrected. Reassignment is a separately validated action, not a Source move or Expense move implied by a presentation choice.

A Job-level Undo reverses only still-safe mutations and reports partial, blocked or unavailable results honestly. It cannot promise restoration of an old database snapshot. Changing Trip assignment must account for dependent admitted actions rather than leaving entities or evidence associations incoherent.

### 13. Revision/dependency and correction learning requirements

Future compensation needs enough retained information to prove safety: originating Job/result/evidence, target entity, operation type, before/after revision or equivalent concurrency proof, necessary dependency relationships, reversibility and current validity. These are conceptual requirements, not a table or DTO definition. Reuse existing audit, command, revision, correction and receipt infrastructure where appropriate rather than creating conflicting history.

An LLM does not automatically retrain from a correction. Corrections first improve explicit context/history and evaluation evidence. Later improvements may use retrieval/features, better prompts/resolvers, lightweight classifiers, local models or justified training/fine-tuning. Personal context and product analytics/training are separate paths under CXE/Event Foundation privacy principles. This checkpoint authorizes no telemetry, private-content export, training collection or online learning.

## PROPOSED architecture for later integration

### Result-scoped preparation and resolution

Represent a Job as a user-facing intake grouping over existing/future Batch and bounded Run facts, preserving exact identities rather than treating Job, Capture, Document, Source, Candidate or entity as aliases. Keep unresolved Account-owned draft evidence/observations outside admitted Trip-scoped Track C Runs until a reviewed handoff can bind the correct Trip and current admission. Multiple clusters can then prepare separate Trip-scoped work under one presentation grouping. The draft-to-admitted handoff and multi-Trip fan-out require a later contract.

Keep historical context, semantic Trip hypotheses, entity match assessment, action intent, deterministic assessment, human decisions where required and canonical outcomes conceptually distinct. They may refer to existing records; no storage model is selected. A corrected hypothesis creates a new assessment/history fact, not a rewrite of immutable intake, Run or reviewed intent. Trip changes require fresh scope/authorization and affected reference resolution; an old candidate set cannot silently authorize another Trip.

### Mapping to accepted Import language

| Capture conceptual result | Existing Import relationship |
| --- | --- |
| NEW | NEW_ITEM with supported distinction and stated search coverage; not an automatic CREATE. |
| MATCH_EXISTING | Exact existing target/revision and continuity; SAME_ITEM or appropriate existing-item relation. |
| AMBIGUOUS | POSSIBLE_DUPLICATE / UNRESOLVED_MATCH or bounded reference alternatives; focused review. |
| CONFLICT | CONFLICTING_ITEM / action CONFLICT, retaining incompatible values. |
| DUPLICATE / corroboration | DUPLICATE_EVIDENCE or supported evidence-link outcome; no duplicate business write. |
| SUPPLEMENT | COMPLETE_EXISTING for missing fields or AUGMENT_EXISTING for supported new dimensions. |
| UPDATE | UPDATE_EXISTING with supported old/new facts and exact target CAS. |

This mapping explains vocabulary and does not rename current outcomes. Mixed additions/updates retain field-group distinctions. Only an admitted typed command supporting every selected dimension may combine actions atomically. Otherwise preserve reviewed dependencies and receipt-correlated successors under Import I2; unsupported dimensions stay deferred. Matching a traveler name cannot create/map a Trip Person or enable a disabled participant adapter.

### Compensation through existing owners

Treat Undo as a new, authorized compensating action that creates current audit/revision evidence through the owning repository/command path. Determine the safe dependency closure, recover exact uncertain outcomes, inspect current revisions and intervening intent, and then validate compensation against domain constraints. Do not alter an attempted command's body/base/key, delete its receipt or rebase silently. Recheck safety at actual execution, because visibility of an Undo control is not a concurrency guarantee.

Existing queue dependencies may carry execution ordering, but do not by themselves prove semantic reversibility or supply a complete Undo dependency graph. A chain spanning owners cannot be advertised as atomically reversible unless an admitted contract guarantees it. Partial compensation remains explicit. A user-requested Undo cannot override finalized Ledger protection, invalidate immutable Settlement inputs, erase evidence or treat a missing receipt/timeout as no-commit proof.

## Focused compatibility audit and integration requirements

The audit uses the Capture worktree's accepted documents and [current handoff](../CURRENT_IMPLEMENTATION_STATE.md). Historical report headers retain checkpoint status; current accepted handoff governs implementation status. No deployed/device/runtime capability is certified here.

| Accepted evidence | Compatibility or gap | Required treatment |
| --- | --- | --- |
| [Data model](../DATA_MODEL.md), [CP11 Capture](TRIP_CHECKPOINT_11_LOCAL_CAPTURE_INBOX_REPORT.md) | Account-owned immutable FILE/IMAGE/TEXT payloads; INBOX/ASSIGNED association with revision CAS. No Job processing state or automatic Source admission. | Keep CP11 intact; draft extraction, new modalities, Job/result context and provenance projections need separately approved contracts. |
| [Import architecture](TRIP_IMPORT_ENGINE_ARCHITECTURE.md), [Import contract](TRIP_IMPORT_CONTRACT.md): Identity / Context Snapshot | N↔M evidence and independent bounded Runs support partial progress. Admitted Source/Run work requires Trip scope; unassigned draft-to-admitted preparation is deferred. | Processing before Trip resolution is product direction, not an implemented Account-only Track C Run. Define multi-Trip fan-out without inventing Trips or moving admitted Sources. |
| Import contract: Context Snapshot | Current wording requires explicit review for source dates conflicting with viewed Day or Trip overview. New direction normally resolves a clear same-Trip Day mismatch without interruption and permits safe metadata correction. | Explicit policy conflict requiring Platform & Import/Trip owner reconciliation. Preserve current review behavior until a separate contract checkpoint; do not edit the accepted contract here. |
| Import contract: Confirmation and commit; [CP13B integration](TRIP_CHECKPOINT_13B_FINAL_INTEGRATION_REPORT.md) | READY is not ACCEPTED; explicit human disposition and exact reviewed pins/base revision precede preparation. Supported Flight UPDATE is not every Supplement/Update shape. | AUTO matching need not ask to reconfirm Trip, but cannot remove currently mandatory action confirmation. Automatic domain actions require an explicitly admitted consent/policy boundary; existing confirmations/gates remain. |
| Import contract: I1/I2; [API](../API_CONTRACT.md) | Exact lineage claims fence repeated CREATE; mixed same-Event actions require typed atomic commands or reviewed successors. Receipt recovery and domain/evidence completion are separate. | Bounded AI retrieval cannot replace lineage recovery or infer absence from search. Reassignment/Undo must preserve exact operation claims and avoid competing CREATE under UNKNOWN. |
| Data model / API: canonical Event, Trip Person, Source | Current authority is Trip-scoped; Account, Person, participation and access are distinct. Multi-Trip references are not a current shared-entity write contract. | Design shared relevance/authorization and provenance before production. Do not clone mutable Events or duplicate economic facts to simulate sharing. Trip creation and metadata correction also need owning-domain capabilities. |
| [Offline sync](../OFFLINE_SYNC.md), current handoff | Repository/local-first writes, fresh Account-generation fencing, exact idempotency/receipts and sole sync scheduling remain authoritative. CP14 foundations are closed; real dispatch/public clients/notification sending remain unactivated. | No feature queue, timer, direct SQLite/API writer, activation or new retry authority. Pass completion/Undo never settles UNKNOWN execution or releases protected resources. |
| [Ledger conflict model](../ledger/LEDGER_2_0_SYNC_CONFLICT_MODEL.md), [final-version correction plan](../ledger/SETTLEMENT_2_0_FINAL_VERSION_REVISION_AND_CLEAN_TRIP_PLAN.md) | Append-only audit, revision-bound correction proposals, immutable command receipts and protected Expense successor/Settlement lineage offer reusable patterns. They do not provide general Capture Undo. | Reuse owner infrastructure without weakening financial conflict/confirmation or finalized-input protection. No cross-Trip allocation, financial import writer or global history replacement. |
| Trip Experience E0 audit and Capture UX baseline | Day/Trip surfaces project admitted facts; shell, navigation and composition belong to Experience. E0 identified missing general Trip lifecycle, ticket/document and selected-Trip contracts. | Activity/Documents Undo/reassignment surfaces and Trip metadata policies are future integration. Do not present drafts as facts or infer lifecycle authority from displayed dates. |
| [Intelligence plan](OTR_INTELLIGENCE_NEXT_STAGE_PLAN.md), [CXE/Event Foundation plan](../trip/OTR_CXE_Architecture_and_Execution_Plan_2026-10-05.docx), [architecture](../ARCHITECTURE.md) | Personal CXE, minimized Product Intelligence and Quality Intelligence have separate governance; private evidence is not automatically training data. | Corrections may inform explicit context/history; any new evaluation export, event instrumentation or training dataset requires separate privacy/retention authorization. |

Trip Experience E0 was read from the preserved report at `/Users/xoery/Documents/Codex/2026-10-06/files-pasted-by-the-user-otr/outputs/TRIP_EXPERIENCE_E0_BASELINE_ARCHITECTURE_REPORT.md` (audited base `c4571746b0c300fa3b46842cd37745963567338c`). It is absent from this Capture worktree; it provides architecture context, not proof that Experience branch work is installed here. The UX baseline's existing E0 link is left unchanged. Mandatory foundation documents also reviewed: [Product](../PRODUCT.md), [environment audit](../ENVIRONMENT_AUDIT.md) and the existing [legacy audit](../legacy/OTR_LEGACY_AUDIT.md); no legacy checkout was inspected.

## OPEN decisions and owners

| Decision | Owning review / required resolution |
| --- | --- |
| Exact confidence/risk thresholds | Capture + Import + domain owners: combine meaning, consequences and actual reversibility; no numeric threshold now. |
| Authoritative Trip lifecycle/date/location fields that may auto-adjust | Trip owner: allowed fields, effects, evidence standards, permissions and compensation. |
| Exact Trip clustering algorithm | Import: continuity, contradictory evidence, residual items and individual new-Trip confirmation. |
| Account-only draft processing and multi-Trip handoff | Platform & Import: draft custody, bounded processing, preparation and scoped identities without changing CP11. |
| Automatic disposition and same-Trip Day mismatch policy | Platform & Import + Capture: reconcile current explicit-review/confirmation rules before execution. |
| Multi-Trip entity/reference production model | Trip + Source owners: shared relevance, authorization, provenance, independent revisions and reassign behavior. |
| Shared Expense accounting/allocation model | Ledger: preserve unique economic facts; allocation remains outside Beta authorization. |
| Trip Collection naming/data model/UI | Trip Experience: deferred, potentially many-to-many membership; no Beta expansion. |
| Candidate retrieval/indexing implementation | Import + repository owners: access scope, coverage, bounds, refresh and fallback behavior. |
| Local-model vs remote-model routing | Intelligence: privacy, cost, latency, availability, custody and closed-gate admission. |
| Structured resolver schemas/prompts | Import + Intelligence: constrained proposals, evidence validation and versioning; none supplied here. |
| Per-domain Add/Supplement/Update capability matrix | Owning domains: exact fields/actions, admission, confirmation and unavailable-action UX. |
| Destructive-action confirmation policy | Capture + owning domains: unsupported V1 intents and high-risk confirmation; understanding alone grants no execution. |
| Undo retention window | Platform + domain owners: retained proof, evidence obligations and honest expiration/unavailability. |
| Dependency representation | Platform + domain owners: semantic versus queue dependencies, safe closure and partial compensation. |
| Cross-Job and multi-member Undo conflicts | Domain owners: later automatic/user/member/external edits, pending intent and current safety checks. |
| Exact Activity/Documents UI for Undo/reassignment | Capture + Experience: scope, eligible actions, partial outcomes, corrected history and discoverability. |
| Feedback/evaluation/privacy implementation | CXE/Event Foundation + Intelligence: private context separation, consent, lineage, retention/deletion and separately admitted exports. |

## Owner review checkpoint

Review should confirm fidelity of APPROVED direction, review the PROPOSED integration, and assign OPEN decisions. Existing runtime gates, explicit disposition, revision checks and domain requirements remain effective until their owners approve later changes. Only this new documentation file is part of the checkpoint; the UX baseline and accepted contracts remain unchanged.

**STOP FOR OWNER REVIEW. No implementation, commit or push.**
