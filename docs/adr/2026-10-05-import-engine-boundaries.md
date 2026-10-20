# CP12 — Import engine boundaries

Date: 2026-10-05 (Pacific/Auckland).
Status: **PROPOSED — READY FOR FINAL OWNER CONTRACT REVIEW**. Documentation only.
Base: `dc580e790d6e0998e97f1dc17fa05a1f50c731ee`.

## Context

Future heterogeneous intake must support N↔M evidence/item discovery, safe offline
continuation, several intelligence providers and optional data enrichment without
redefining existing Source, Capture, Event, Account, Day or Ledger authority.
Matched existing items may need missing facts or new booking/passenger dimensions,
so occurrence equality alone cannot classify new material as duplicate evidence.

## Decision proposed

1. Separate CAPTURE, EXTRACTION, INTERPRETATION, CLOSURE, ENRICHMENT and COMMIT;
   evidence/provenance and progress/attention cross them all.
2. Add logical Batch/context/fragment/observation/Candidate Set contracts around
   CP11 Capture and existing Track C Source/Representation/Run/Candidate semantics.
   Preserve immutable published proposals and exact confirmation/output receipts.
3. Separate occurrence relation, action outcome, closure state, attention, work status,
   user disposition and canonical receipt outcome. Completion/augmentation are
   evidence-backed proposed changes, never automatic domain writes.
4. Use versioned common/family/subtype schemas with action-specific deterministic
   closure. FLIGHT v1 is the complete executable reference specification; separate
   occurrence/booking/passenger facts and ambiguous member association. Other subtype
   closure rules remain pending.
5. Use a reusable provider-neutral intelligence observation boundary for OpenAI/GPT,
   Anthropic/Claude, Apple/local and future providers. Keep Data Providers separate.
   Deterministic/local first; bounded capable remote Batch work and justified escalation.
6. Preserve local evidence and durable exact deferred intent; existing queue/app owners
   govern processing lifecycle. Fresh Account context fences every attempt/result,
   including A→B→A. Plugin cancellation never certifies existing Source IO terminality.
7. Keep canonical commit deterministic, explicit user-confirmed and admitted through
   the owning domain. Existing Source/Event/participation gates remain closed.
8. Import Financial Evidence may feed future Ledger matching/Candidates and approved
   commands, but Import does not create Expenses or reinterpret financial dates/FX.
   CXE may select presentation only; Import has no dependency on CXE.

## Normative owner-review corrections

Independent [Red Team review](../architecture/TRIP_CHECKPOINT_12_CONTRACT_REVIEW.md):
PASS WITH REQUIRED CORRECTIONS. Its text is preserved; the following corrections
apply to the proposed CP12 contracts without redesign or runtime authorization.

- **I1:** preparation/dispatch examines relevant current, predecessor and consolidation
  output claims across reprocessing/model/escalation/split/merge identities. Unknown
  predecessor CREATE blocks competitors pending exact recovery/authoritative no-commit
  proof; success supplies exact target/result for existing-item assessment. Distinct
  output purposes/splits/merges require explicit reviewed lineage disposition. No new
  global identity or change to C-I3A uniqueness.
- **I2:** mixed labels are assessments, not commands. One immutable atomic operation
  requires an admitted typed command for all selected changes. Otherwise explicit
  reviewed dependency/successor actions recover predecessor receipt first; unbound
  successor preparation follows B-T3C §N. No same-base race, silent rebasing or generic
  booking/passenger patch; invalidated decisions require fresh review.
- **I3:** `import-flight-match-v1` admits qualified supplier occurrence/leg identifiers
  or a complete unique qualified carrier/service/origin-date/route tuple with no
  negative evidence. Codeshares and schedule/service changes need qualified evidence;
  contradictory dates/routes and acquisition-only relations cannot auto-merge.
- **C1:** Flight CREATE departure requires EXACT quality and supported civil resolution
  or independently evidenced/explicitly confirmed instant. Offset-only arithmetic
  remains derived evidence, never fabricated IANA/SOURCE_INSTANT. Arrival is EXPECTED;
  selected known arrival validates independent temporal facts and ordering.
- **C2:** 24 hours is a configurable/versioned baseline attention default. Explicit now,
  clock provenance and evidenced boarding/check-in/other deadlines govern assessment;
  unknown contexts never acquire invented instants. CXE presentation timing stays
  inside admitted policy without changing matching/closure/evidence/identity authority.
- **C3:** completed intake/current pass may retain resumable network/intelligence/
  enrichment work. Separate quiescence/outstanding-work facts; completion cannot
  cancel wakeups, release required evidence, hide results or prove IO terminality.
  Existing app-level work owners remain the only queue/lifecycle owners.

## Alternatives rejected

One file/one booking fails itineraries and multi-passenger confirmations. One floating
confidence score hides missing facts, conflicts and deferred capability. A second
Source root or mutable published Candidate breaks existing lineage. A single generic
provider abstraction confuses inference with external data coverage. Shared PNR/time
identity merges different legs/passengers. A matched-occurrence-is-duplicate rule
loses valid completion/augmentation. Automatic model-driven writes bypass domain CAS,
proof, authorization and explicit review.

## Consequences and gates

Contracts are larger than a parser result but each axis has one authority. Bounded
Runs can produce partial Batch results without rewriting immutable publication.
Action-specific closure supports incomplete existing items without lowering canonical
validation. More scoped field provenance and future adapter work are required for
participant/booking augmentation. Current canonical reservations, credentials and
participant commands do not gain new schema/capability here.

Final owner contract review remains pending. The targeted matching, lineage,
mixed-action, departure/arrival, configurable attention and pass-completion semantics
are now normative in this draft; CP13 builders must not independently invent them.
Exact scoped proposal adapters/persistence, supported command/civil resolver admission
and chosen deployment attention configuration remain future implementation decisions. Later privacy/retention, modality/resource bounds, plugin conformance,
civil resolver, server/runtime activation and receipt recovery must be independently
validated. No migration/endpoint/engine/SDK/worker/UI/remote work follows this ADR.

## Contract references

- [Architecture](../architecture/TRIP_IMPORT_ENGINE_ARCHITECTURE.md)
- [Import contract](../architecture/TRIP_IMPORT_CONTRACT.md)
- [Registry](../architecture/TRIP_RESERVATION_SCHEMA_REGISTRY.md)
- [Intelligence boundary](../architecture/INTELLIGENCE_PLUGIN_CONTRACT.md)
- [Data boundary/roadmap](../architecture/TRIP_IMPORT_PROVIDER_ROADMAP.md)
- [CP12 report](../architecture/TRIP_CHECKPOINT_12_CONTRACT_REPORT.md)
