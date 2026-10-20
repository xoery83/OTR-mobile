# Trip Import Engine Architecture — CP12

Date: 2026-10-05 (Pacific/Auckland). Contract version: `otr-import-v1`.
Status: **CONTRACT FOUNDATION — REVIEW PENDING; design only**.
Base: `dc580e790d6e0998e97f1dc17fa05a1f50c731ee`.

Normative rules below define the proposed CP12 contract, not implemented capability
or activation approval. Existing accepted contracts win on their canonical domains.
No Import engine, UI, provider call, runtime wiring or migration is delivered.

## Authority and document map

- [Import contract](TRIP_IMPORT_CONTRACT.md): identities, evidence, context,
  matching, completion/augmentation, closure, offline continuation, progress and confirmation.
- [Reservation schema registry](TRIP_RESERVATION_SCHEMA_REGISTRY.md): common,
  family and subtype definitions; executable-specification Flight reference.
- [Intelligence boundary](INTELLIGENCE_PLUGIN_CONTRACT.md): reusable neutral
  capability/request/observation boundary and deterministic routing policy.
- [Provider roadmap](TRIP_IMPORT_PROVIDER_ROADMAP.md): separate enrichment seam.
- [ADR](../adr/2026-10-05-import-engine-boundaries.md) and
  [review report](TRIP_CHECKPOINT_12_CONTRACT_REPORT.md): decisions and scope proof.

## Six layers and authority

| Layer          | Inputs → outputs                                                                                                                                                   | Authority and failure boundary                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAPTURE        | Supplied bytes/text/locator + intake context → durable Capture references, Batch membership and Context Snapshot                                                   | Preserve original evidence and immutable acquisition provenance; no booking interpretation. Per-input success survives another input failure.                          |
| EXTRACTION     | Exact material pins → text/OCR, document structure, visual regions, web snapshot extraction or speech transcript                                                   | Observe material, preserve modality/precision; cannot decide Trip truth or synthesize a schedule.                                                                      |
| INTERPRETATION | Validated extraction observations + schema references + labelled context → discovery, classification, typed observations, N→M matching and consolidated Candidates | Intelligence may propose; OTR validates schemas, evidence and normalization. No canonical identities or business readiness from a model.                               |
| CLOSURE        | Candidate version + evidence + match assessment + exact context/current target observations → deterministic closure and attention facts                            | Completeness, ambiguity, duplicate/update, evidence/Trip conflicts, members, places, times and deferred resolution; never a floating confidence threshold.             |
| ENRICHMENT     | Bounded unresolved questions → attributed external observations                                                                                                    | Optional verification/data lookup; failure preserves usable booking evidence. Required missing fields remain unresolved; provider success alone does not accept facts. |
| COMMIT         | Explicit reviewed intent + exact input/Candidate/target pins → admitted owning-domain command and verified result correlation                                      | Only deterministic OTR domain code can mutate canonical facts. No model, plugin, presentation layer or Import orchestration may write them directly.                   |

Evidence/Provenance and Progress/Attention cross every layer. The listed order is
conceptual: enrichment can supply observations for a new interpretation/closure
assessment. It never mutates a published Candidate. Every revisit uses pinned
versions; it is not a free-form agent loop. Optional enrichment need not precede
commit when closure-critical facts already resolve.

## Ownership and dependency direction

Native intake adapters supply bounded content to repositories. Repositories own
local persistence; app-level existing queue/sync/file owners own claims, due times,
retries, upload and restart recovery. Import owns schemas, evidence validation,
consolidation, closure policy and proposed output intents. Future intelligence
consumers, including CXE, share the neutral intelligence boundary, not Import's
schemas or its domain admission responsibilities.

Dependencies run from Import to read-only Trip context and explicit owning-domain
adapters. CXE may consume progress/attention and select presentation. Import never
imports CXE or lets it redefine READY, identity, evidence or commit admission.
There is no feature-owned uploader, timer, generic command bus or second queue.

## Compatibility decisions

| Existing authority                              | CP12 reuse and prohibition                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CP11 local Capture + `getForSourceHandoff`      | Capture remains Account-owned immutable material with mutable INBOX/ASSIGNED association and revision CAS. Batch membership, Context Snapshot and processing are separate future records. Do not add PROCESSING/IMPORTED states, modality enums, limits or Source creation to CP11. |
| Track C Source/Representation/material revision | Source is the one existing logical evidence origin; Representation is immutable material. Batch is neither. New admission maps verified Capture material to exact Track C IDs through a future reviewed adapter. Hashes do not establish Source identity.                           |
| C-I3A Run/Candidate/Input/Confirmation/slot     | Reuse candidate identity and immutable run-owned publication; candidate subtype is inside a future validated proposal adapter, not a new persisted candidate_kind enum. Incremental Batch progress publishes separate bounded completed Runs. No append to a READY Run.             |
| C-I3C/D/F/G/H execution                         | Source commands remain disabled; parser verification is not semantic extraction or business authority. Durable UNKNOWN/terminality and staged-resource responsibility cannot be replaced by plugin timeout, cancellation or lease expiry.                                           |
| A Account/TripPerson/admission                  | Account is actor/owner; `trips.id` is scope; `journey_members.id` is Person. Names, uploader identity, roster participation and certificates grant no new rights.                                                                                                                   |
| B Event/time/place/receipt                      | Event owns accepted schedule; endpoints retain independent civil/instant/zone/precision/place facts. B-T3A/C command shapes, revisions, opaque evidence addresses and disabled adapters stay intact.                                                                                |
| B-T3I certificate + CP11 Day                    | Context may read accepted complete/historical observations, labelled with exact certificate and projection generations. Import cannot certify completeness, infer deletion from partial lists or write Day projection rows.                                                         |
| Existing Reservation association                | Reservation taxonomy here classifies proposals; no second canonical Reservation schema/table or independently editable schedule. Existing reservation evidence adapter remains LINK_ONLY and disabled; Flight TRANSPORT commit remains future gated work.                           |
| Ledger                                          | Import Financial Evidence is a proposal with provenance, distinct from Ledger PaymentRecord, valuation, Receipt and Expense. No financial mutation or receipt ID alias.                                                                                                             |

Unassigned Capture material is Account-only staging. Trip Source persistence and
associations require explicit assignment and current/cached admission as appropriate.
Changing intake selection never rewrites a snapshot or moves a persisted Source
between Trips. Exact Capture-revision revalidation is required at handoff; CP11
read-only handoff alone is not Source admission or proof of remote durability.
Existing Track C Runs also require Trip scope and admitted exact inputs. An
unassigned Batch may retain Capture/context and future local draft observations;
it cannot publish an admitted Track C Run/Candidate by inventing a Trip or Source.
Exact local draft-to-admitted proposal preparation remains deferred.

## Modality and acquisition coverage

Images/photos/screenshots preserve bytes; PDF/files preserve bytes and distinguish
native text from OCR. Text preserves actual saved text. Voice preserves supplied
audio and attributed transcript, not fabricated spoken certainty. Share Sheet is
an entry channel, not a material type or persistent URI. Multi-file selection is
one Batch with independent Capture results. URL and email acquisition semantics
are specified in the Import contract. CP11 currently supports only FILE/IMAGE/TEXT;
voice, multipart email and fetched URL adapters require later contracts/implementation.

Bounded Runs retain C-I3A's proposed 64-input/64-Candidate and payload limits.
A larger Batch may use several completed Runs/Candidate Sets, with explicit
partition/completeness metadata. Never silently truncate or assume one file is one
reservation; an itinerary screenshot can yield more than ten Candidates.
Prefer one remote Batch interpretation request where admitted bounds permit.
Splitting must retain cross-partition evidence and deterministic consolidation.

## Existing-item evidence completion and augmentation

Same occurrence does not imply duplicate evidence. Import action assessments distinguish
DUPLICATE_EVIDENCE, COMPLETE_EXISTING, AUGMENT_EXISTING, UPDATE_EXISTING, CONFLICT,
NEW_ITEM and UNRESOLVED_MATCH. Occurrence, booking and participant fields retain separate
scope/identity/provenance. Several passenger confirmations can augment one Flight;
ambiguous printed-name → Trip Person association stays reviewable. These proposals
remain gated by exact existing target revision, explicit confirmation and future
admitted domain capability; CP12 activates no participant/booking/ticket writer.

## Targeted owner-review corrections

The independent [Red Team review](TRIP_CHECKPOINT_12_CONTRACT_REVIEW.md) returned
PASS WITH REQUIRED CORRECTIONS. I1/I2/I3 are normative preparation/matching rules:
inspect predecessor/consolidation CREATE claims across changed Candidate identities;
recover uncertain predecessor outcomes and reuse successful exact targets; execute
mixed same-Event changes atomically only through an admitted typed command, otherwise
review explicit dependent successors; use the registry's qualified Flight anchor and
negative-evidence matrix. None changes C-I3A uniqueness or B-T3C CAS/receipts.

C1/C2/C3 clarify the same contract: EXACT departure with independently attributed
civil/offset/zone/instant facts, expected rather than universally critical arrival;
configurable/versioned attention (baseline default 24 hours) with evidenced actionable
deadlines; separate intake/current-pass completion from processing quiescence and
outstanding resumable work. Pass completion cannot cancel reconnect work, hide results,
release evidence or certify Source IO terminality. Existing queue/work owners remain.

## Deliberately deferred implementation

No HTTP route, SQLite/server schema, queue operation kind, background notification,
model SDK, resolver, Source handoff writer or Event/Ledger adapter is added.
Future work must first review this contract, then define exact persistence/DTO and
admission changes, modality limits, privacy/retention, resource bounds and activation
proofs. Existing CP10/CP11 review and runtime gates remain independent and closed.
