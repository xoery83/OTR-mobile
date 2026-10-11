# G1 — Capture and Experience boundaries

Date: 2026-10-11 (Pacific/Auckland). Status: **G0/G1 audit complete; proposed changes require Owner Review.**

Implementation baseline: canonical main `5076174`, `/Users/xoery/Project/otr-mobile`. Paths below are relative to that checkout unless marked **chat-only**. Source inspected directly; no live database accessed. IMPLEMENTED describes the named capability, not blanket product readiness. Tests, runtime wiring, historical DEV evidence and real-file E2E are separate dimensions. This audit authorizes no implementation or activation.

## What Capture can actually output today

- `localCaptureSchema`: FILE/IMAGE/TEXT originals, INBOX/ASSIGNED, immutable bytes/integrity and revisioned association; not typed Booking/Ticket facts.
- `captureSubmissionRepository` + SQLite51: durable ordered batch/input/job/context identities and acquisition state. C3 Activity lifecycle displays work; saving input does not initiate Canonical admission.
- `referenceFlightExtractor` / `flightInterpretation`: bounded deterministic **FLIGHT** reference observations; PNR, passenger, seat, ticket/baggage/fare/cabin remain deferred evidence. This is not a universal production PDF/OCR parser.
- `flightImportClosure`: NEW/DUPLICATE_EVIDENCE/COMPLETE_EXISTING/UPDATE_EXISTING/CONFLICT/UNRESOLVED_MATCH; current target/revision and complete match/lineage scope required. `flightReviewSchema` is flight-v1. CP12 registry STAY/RENTAL/TRAIN/BUS/FERRY/ACTIVITY/TICKET entries do not constitute implemented closure policies.
- C4a `captureBatchAssessmentSchema` / adapter and SQLite52 observations are read-only, `preparation=NOT_AUTHORIZED`, `domainAdmission=NOT_AUTHORIZED`. SQLite53 proves complete published Candidate membership in closed read/install; it does not enable Composer, confirmation, domain writes or background processing.

## Admission matrix

| Output                               | Current lawful structural path                                                                                      | Missing for running E2E                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Capture original                     | local repository transaction and C2 intake                                                                          | device/format acceptance only for chosen real-file gate                                                         |
| Source NEW/REUSE/REPLACEMENT         | explicit `captureSourceAdmissionRepository`, original verification, Source CAS/receipts                             | approved actual format verifier, Source acquisition/runtime and terminal recovery; C scheduler denial unchanged |
| Qualified Flight Event               | CP13A immutable confirmation/output-slot → protected CREATE/UPDATE_TRANSPORT → exact result → evidence finalization | admitted command gateway/provisioning/activation, scheduler worker and canonical collection/Day refresh         |
| Sparse Flight number+date            | classify/preserve candidate evidence                                                                                | stable dated Item save/qualification contract D2; cannot weaken `validateFlightCommand`                         |
| P1 title/date                        | legacy itinerary create currently exists                                                                            | canonical CALENDAR save/offline command/proof and scopes                                                        |
| P3/P4/P5/P6                          | typed evidence can be retained conceptually                                                                         | executable schema-specific validation, storage, matching, admission and sync                                    |
| Booking / Ticket / Instruction links | deferred evidence only in Flight path                                                                               | typed object identity/output slots/commands and shared access                                                   |
| Existing Item + new Booking          | exact existing target can be read; no Booking mutation adapter                                                      | supported link-only/augment action with separate Booking identity and affected revisions                        |

Save requirements differ from action requirements. P1 can save title/date without time or coordinates; qualified routing needs accepted place, strict Flight occurrence needs exact supported departure and endpoints/services. Arrival unknown is permitted by current Flight contract when other conditions pass. Offset-only civil arithmetic cannot be promoted to SOURCE_INSTANT; full civil resolver path is absent under CP13A Option A. Pass can save without Item/date; ticket-opening requires authorized original/access capability, not schedule completeness.

## Proposed shared Capture contract

A versioned intake/candidate envelope reuses existing Batch/Capture/Source/Run/Candidate/Confirmation/output identity namespaces. Every candidate/output records schema+policy version, exact input pins/support locators, raw and normalized observations, unknown/ambiguous states, field origin, contradictions, reviewed edits, target purpose/kind/base revision and lineage/output claim references. Do not add a parallel business root or shared mutable date copy.

At G1 contract freeze add typed output kinds for Booking/Entitlement/Instructions/links and non-Flight service adapters. Per-action closure explicitly distinguishes create/link/complete/update/defer. An existing Item plus supplementary Booking selects existing target and creates only the commitment/link. Matching incomplete scopes never becomes NEW. Byte-dedup is intake optimization, not commercial dedup. User-authored values retain priority; new evidence proposes amendments/review with original values intact.

**Atomicity:** existing one-Event combined Flight mutation retains full selected-leaf/proof coverage. Multi-object output is atomic only where a supported typed server transaction spans it; otherwise use receipt-dependent actions and explicit partial result vector. UI can leave while work runs after runtime approval, but a screen never owns retry/sync/upload. D4 resolves automatic admission: strict v1 retains human reviewed intent; a future deterministic automatic policy requires an accepted versioned actor/authorization/proof contract. Confidence alone is insufficient.

## Proposed Experience read contract

Keep repository-owned `DayProjection`/`DayQuery` source certificate and historical/current distinction. Add one versioned supplemental read adapter, rather than another canonical Item model. It exposes permitted facts plus explicit missingness and owning object/revision; legacy v1 stays readable.

| Read component      | Authoritative inputs                                                       | Projection-only result                                                                                 |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Common Item         | Event identity/title/scope/status/boundaries/place/provenance              | P-family, TNS/timed placement, visible permitted actions                                               |
| Flight              | endpoint schedule + Event-baseline services                                | carrier/number, endpoint names, neutral interval; missing code/terminal stays null                     |
| Stay                | one STAY schedule + typed property/Instructions/participation              | check-in/out rows, unambiguous personal daily base, tonight or from/return context without fake clocks |
| Rental              | one Rental identity + pickup/return and verified plate                     | two operation rows; grouped pickup preserves every underlying identity and return                      |
| Transport           | each actual segment endpoint/service + meeting/cutoff/ticket links         | every segment clickable; neutral connection interval, no transfer-risk classification                  |
| Activity            | Event/session/entry + entitlement/access descriptor                        | Focus prioritizes usable access; ticket supplement never duplicates Event                              |
| Ticket local access | entitlement/version/permission + verified accessible device representation | open original / download / external provider / unavailable; not metadata-derived offline guarantee     |

Current `tripDayFeedRepository` reads Flight services at exact Event semantic_revision only when Day projection CURRENTLY_MATCHES_SOURCE. Historical saved events remain readable; service supplemental failure preserves accepted local facts. `flightPresentation` sets code/terminal null and uses authored endpoint name; no airport code/terminal table should be invented by the renderer. Current `DayEvent` omits description and Booking/document/expense/Person detail links; adapter must read them explicitly under authorization, not parse title/free text.

Experience P3–P6 Browse/Focus/Immersive may proceed against explicit synthetic versioned fixtures/missing-field behavior now. Production adapter integration awaits Core contract and authenticated accepted data; gallery tests do not certify import persistence or native mixed Day Feed. Required future native gate: actual admitted mixed events, offline restart, 375pt, Dynamic Type, VoiceOver, original-ticket access and scoped revocation. No UI changes are made by G0/G1.
