# CP13B Builder B — Flight closure and review orchestration

Date: 2026-10-06 (Pacific/Auckland). Status: **BUILDER B COMPLETE / WAIT FOR INTEGRATION**.
Runtime remains CLOSED. This is an unwired implementation, not deployment approval.

## Starting gate and exact scope

Fresh managed worktree:
`/Users/xoery/.codex/worktrees/cp13b-flight-closure/otr-mobile-canonical`.
Branch `trip/import-closure`, clean starting HEAD
`806c2643d06af60f269c9c4004da1b7e226496b7`; HEAD retained, no staged changes,
commit, push, fetch or remote environment access.
SQLite tail is 49; server count is 82, tail `20261005001100`.
The false-only Flight/Capture admission gates and scheduler-denied Import
operations remain unchanged. No migration, command SQL, TRACK_C, receipt,
collection/certificate, Day or Ledger implementation is modified.

Normative inputs: corrected CP12 Import architecture/contract/Flight registry,
CP12 contract report and independent Red Team review; accepted CP13A.1 exact
preflight; CP13A.2 implementation report; independent review including its targeted
R1–R3 recheck; CP13A ADR. Existing CP13A repositories/domain validators are reused.
Mandatory root documents were read; CP13A additions to DATA_MODEL, API_CONTRACT
and OFFLINE_SYNC were checked against the exact base. Legacy Web was not opened.

Exact changed files (six):

- `src/domain/trip/flightImportClosure.ts` — structural input validation, assessment,
  match/action decisions, independent dimensions, progress and attention facts.
- `src/data/repositories/flightImportClosureOrchestrator.ts` — repository reads,
  current-baseline reassessment and explicit immutable CP13A preparation.
- `src/data/repositories/tripImportAdmissionRepository.ts` — only two scoped reads:
  retained review draft and Candidate/Run/relevant CREATE claim observations.
- `src/data/repositories/flightImportClosure.test.ts` — deterministic typed matrix
  and real SQLite49 tests.
- This report.
- `docs/CURRENT_IMPLEMENTATION_STATE.md` — short current handoff insertion.

No dependency or lockfile change. An existing node_modules directory was temporarily
linked for validation; the link is removed before delivery. Ignored build artifacts
are local only. No new ADR is needed: CP12 and CP13A already define this boundary.

## A → B structural seam

`flightCandidateSetSchema` accepts an immutable Set ID/version, Account/Trip,
COMPLETE/PARTIAL source/input coverage, exact CP13A Run input pins and up to 64
Candidates. Each Candidate carries its original ID, Run ID, proposal/input digests,
reviewed output purpose and finite occurrence proposal families (`title`, `origin`,
`destination`, `services`, optional `transport_subtype`). Each field retains its
proposed JSON value, supporting Input IDs and exact typed locators. Invalid temporal
observations remain observations; they are never coerced into admitted endpoints.

The seam separately carries contradictions and alternatives, entity-resolution
outcome, the qualified match-v1 anchor, supported reviewed continuity, lineage/output
purpose mappings, deferred raw dimensions and their locators, eligible/exhausted
resolution plans, and evidenced actionable deadlines. It defines no extraction,
OCR, parser, model, provider or raw entity-resolution implementation.

Integration maps A's immutable output structurally. It must not reparse inputs,
change Candidate IDs, discard contradictions/support, invent qualified airport or
operating-carrier identity, or infer completeness/currentness from a cache miss.
A qualified `FlightOccurrenceAnchor` and `FlightMatchScope` are the existing accepted
match-v1 seam, including explicit complete/current proposal, lineage and service
baseline observations. Those assertions require verified upstream observations;
B does not manufacture certificates or treat historical offline data as current.

The repository orchestration verifies the stored Candidate/Run digests, recomputes
the immutable proposal digest, and checks exact occurrence-field values and Run
support IDs. It then reads Event endpoints through `getEvent` and baseline-bound
services through `readServices`. Relevant claims include bounded transitive Run
family and overlapping Source scope. Shared-source claims outside proven lineage
cannot be dismissed with a DISTINCT_OUTPUT label. Preparation repeats these checks.

## Closure, match and reviewed actions

Closure states are READY, NEEDS_REVIEW, INCOMPLETE, CONFLICT,
WAITING_FOR_NETWORK, WAITING_FOR_ENRICHMENT and UNSUPPORTED. Known/missing facts,
contradictions, raw deferred observations and independent reasons remain available.
Closure is independent of NEW_ITEM, DUPLICATE_EVIDENCE, COMPLETE_EXISTING,
AUGMENT_EXISTING, UPDATE_EXISTING, CONFLICT and UNRESOLVED_MATCH.
READY is review readiness; it writes no Event, receipt, server revision, certified
membership or Day projection.

CREATE requires supported service and route components, reviewed title and the
accepted Option A exact departure with origin-local occurrence date and independent
source instant. Number-only, number/date-only, absent departure and offset-only
civil evidence are incomplete. No midnight, IANA zone, carrier, Place ID or source
instant is inferred. Explicit independently evidenced midnight is valid. Unknown
arrival is valid and does not block departure-based readiness. Known arrival is
validated independently, including exact ordering against the retained departure.
Complete civil resolver tuples remain unadmitted under Option A.

Existing comparison works at exact Event ID/semantic revision. Missing canonical
facts plus valid new facts produce COMPLETE_EXISTING. Changed accepted facts or
removals require reviewed continuity/supersession at that exact baseline;
otherwise CONFLICT. Newest/higher-confidence evidence grants no authority.
Mixed arrival completion/departure update becomes one UPDATE_TRANSPORT, never
several same-base operations. Review edits cannot silently change the matched
route/date/service identity; those changes require reassessment.

No material difference produces DUPLICATE_EVIDENCE. Useful support remains in the
plan/evidence origin; LINK_ONLY is closed, so the explicit Confirmation disposition
is DEFER with no domain operation, not another Flight or replaced canonical origin.
Reject and unresolved/waiting reviews likewise prepare non-executable slots only.

UNKNOWN predecessor claims block competing CREATE despite absent search results.
Known success redirects to its exact target with the current available baseline,
not its historic result revision. Missing target visibility remains unresolved.
Distinct purposes require explicit reviewed lineage correspondence. CP13A repeats
claim/lineage/CAS checks in its existing Account-gated preparation transaction.
Exact replay of the same prepared slot retains its original key/body and queues no
second operation; different identities cannot bypass the predecessor fence.

## Unsupported scope and evidence preservation

Passenger, booking/PNR, ticket, seat, baggage, fare/cabin and financial observations
remain explicit deferred dimensions. Same Flight with TX/Caroline or several PNRs
can be AUGMENT_EXISTING, but no participant/booking persistence is added.
Ambiguous `L LI` requires review and never selects a Person. Even explicit Person
resolution remains unsupported. Safe occurrence changes can proceed after explicit
review while those dimensions remain deferred. Passenger-scoped contradictions
are retained and do not invalidate independently supported arrival completion.

Raw observations remain in the presentation-neutral Candidate/plan, with original
Source/Input/locator evidence. Durable CP13A review stores only admitted dimension
markers and exact original evidence references, never new passenger/booking values
in C JSON or Event text. Financial is mapped to the existing `fare` deferred marker;
its original scope/raw evidence remains available through the referenced input.
No Expense, PaymentRecord, Receipt, Settlement or Ledger queue operation is created.

## Review preparation and offline behavior

Explicit review binds selected Candidate, complete selected components, values,
edits, support, deferred dimensions, Event/base revision, purpose, lineage,
flight-v1/schema 1/normalization 1/match-v1, Confirmation/slot and domain key/digest.
Selected executable components cannot disappear. A deliberate supported-component
DEFER is recorded explicitly and differs from an omitted reviewed component.
Extra selected support/proofs reject. Unchanged values inside selected components
require their exact retained provenance; there is no TRACK_C fallback for them.
The existing R1 `resolveReviewedFlightSelection` and
`validateReviewedFlightCommand` remain the authority, not a replacement validator.

Run input identities remain unchanged. Confirmation receives separately allocated
Input UUIDs, with an explicit reviewed mapping preserving Source/material revision/
Representation/hash/count. Support/association/deferred locator references are
mapped to those new pins. Candidate identity and values are not rewritten.

`prepare` takes an immutable caller snapshot, reassesses retained Candidate and
Event facts, rejects changed reviewed digests/base revision, builds the exact typed
command and invokes existing `admission.prepare`. Only C_PREPARE_CONFIRMATION is
queued. Command bytes are returned for a later explicit CP13A execution step;
B does not invoke markDispatch, network, scheduler or a canonical writer.

Existing `saveDraft` CAS plus the new scoped `readDraft` preserve review across a
real file-backed cold restart. Run/input staleness rejects; existing Account
request generation/apply gates fence A→B→A. Fresh ownership context can resume.
Eligible missing facts expose NETWORK/ENRICHMENT waiting; exhausted plans return
INCOMPLETE. Waiting dimensions have durable unresolved-temporal source references.
No second work record, queue, reconnect owner or wake timer is introduced.
Per-Candidate stale observations become explicit non-executable review outcomes;
unrelated Candidates remain assessable. Bounds reject; nothing truncates silently.

## Attention and progress

Counts expose Candidate, ready, review, conflict, incomplete, network/enrichment
waiting and deferred dimensions. COMPLETE/PARTIAL Set coverage remains explicit.
`import-attention-v1` consumes supplied now/clock provenance and configurable
horizonHours (24 is a baseline choice, not a constant). Exact evidenced departure,
boarding/check-in deadlines produce URGENT within the horizon when action is
unresolved. Calendar-only deadlines retain unknown bounds and conservative attention;
no synthetic midnight or endpoint zone is created. Attention changes do not change
closure, evidence, matching, canonical facts or identity. No CXE/UI copy is added.

## Validation and classification

Final focused: **52 tests PASS**. The requested minimum 30 scenarios are covered,
plus exact Confirmation pin mapping/replay, retained proofs, explicit defer versus
omission, ordering against retained departure, route-edit reassessment, durable
waiting references, scoped passenger contradictions and stale sibling isolation.
Actual SQLite49 tests use disposable in-memory/file databases and existing SQL-
produced CP13A fixtures; canonical endpoints/services are consumed through the actual
repositories. Test-only fixture publication/unclaimed-slot setup is not runtime
admission or server SQL execution.

Final selected regression: **21 suites / 581 tests PASS**. Covers CP13A review/
admission, Flight domain, canonical Event/collection, Account generation, SQLite49
fresh/upgrade runner/composition, Capture, Day/certificate, Source recovery,
cached auth, scheduler and Ledger workers. The existing CP13A FK ON/OFF matrix is
retained unchanged. No new server replay is necessary or claimed: migrations and
canonical SQL are byte-unchanged.

Final broader suite: **1902 tests PASS**; **11 suites remain blocked/failing**:
10 existing React Native Flow module collection blockers in Ledger/Trip Person/
Health suites, and the existing Ledger UI architectureBoundary assertion.
These match the accepted CP13A baseline and are **EXISTING BASELINE BLOCKER**,
not new regression. No unrelated fixes were attempted.

Typecheck, full lint (including UI guard), Backend build, changed-file formatting
and Git whitespace pass. Initial Backend output-directory sandbox denial was
**ENVIRONMENTAL**, resolved by running the authorized local build in this worktree.
Temporary fixture/type defects found during development were **IMPLEMENTATION
DEFECT**, corrected and covered by final passing tests. **NEW REGRESSION: none**.

## Deferred work and readiness

No implementation blocker remains. Integration must align A's actual typed output,
retain evidence and verified match-scope observations, allocate reviewed immutable
identities, and invoke the explicit factory. Runtime activation, delivery UI, provider/
LLM/extraction, civil resolution, passenger/booking persistence, link-only admission,
participant certificates, scheduling and Ledger actions remain separately deferred.
This implementation does not grant those capabilities. Owner/integration review is
next; no commit or push was performed.

## Required explicit answers

| Criterion                                       | Answer                                          |
| ----------------------------------------------- | ----------------------------------------------- |
| Builder B complete                              | YES                                             |
| Closure engine implemented                      | YES                                             |
| Existing Event comparison implemented           | YES                                             |
| NEW_ITEM implemented                            | YES                                             |
| DUPLICATE_EVIDENCE implemented                  | YES                                             |
| COMPLETE_EXISTING implemented                   | YES                                             |
| UPDATE_EXISTING implemented                     | YES                                             |
| CONFLICT implemented                            | YES                                             |
| UNRESOLVED_MATCH implemented                    | YES                                             |
| Passenger/booking augmentation recognized       | YES                                             |
| Passenger/booking persistence added             | NO                                              |
| Ambiguous Person auto-mapping possible          | NO                                              |
| Reviewed action plan implemented                | YES                                             |
| CP13A orchestration implemented                 | YES — explicit preparation only; runtime CLOSED |
| R1 complete reviewed-action semantics preserved | YES                                             |
| Offline/waiting states implemented              | YES                                             |
| Attention/progress facts implemented            | YES                                             |
| READY auto-accepts canonical truth              | NO                                              |
| Canonical Event architecture changed            | NO                                              |
| Server/SQLite migration added                   | NO                                              |
| Ledger mutation added                           | NO                                              |
| LLM/provider runtime added                      | NO                                              |
| UI added                                        | NO                                              |
| Runtime gates enabled                           | NO                                              |
| Hosted Dev/Production accessed                  | NO                                              |
| Commit                                          | NO                                              |
| Push                                            | NO                                              |

**STOP — BUILDER B COMPLETE / WAIT FOR INTEGRATION.**
