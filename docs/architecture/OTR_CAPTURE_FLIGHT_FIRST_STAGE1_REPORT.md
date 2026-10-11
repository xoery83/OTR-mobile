# Capture Flight-first Stage 1 — consolidated implementation report

Date: 2026-10-12 (Pacific/Auckland). Primary authorization, Local AI Capability Gate
and Accuracy/Enrichment Addendum 2 applied cumulatively.

## Baseline and scope

Fresh fetch before work and after final validation: main/origin/main
`741579c8bac3f898669ca331875a28efc645cfa2`. Fresh isolated branch
`codex/capture-flight-stage1`. Overnight `8e45c8d0d50e0004a10cc1e0bb07522ec6cde296`
is not an ancestor, but its only unpublished change is a handoff paragraph;
runtime ancestor `ac46a90` is already main. No replay or parallel workspace edits.

Existing `referenceFlightExtract` → `interpretFlightBatch` owns deterministic
extraction, normalization and operational consolidation. `projectFlightEvidenceCoverage`
owns private evidence projection. Capture payload/URI readers own bounded byte
acquisition; C2 durable custody, C3 reopening, Import Source admission and CP13A/B
assessment/preparation/recovery retain authority. P2/C4a does not confer canonical authority.

Changed files:

- `src/domain/trip/referenceFlightExtractor.ts`: adapter/grammar version 2;
  explicit numberless rows and strictly labelled native-text tables; full English
  dates, AM/PM clocks, source place labels, lossless adjacent ignored-span coverage.
  Numeric mileage/aircraft cannot become airline identifiers; deferred fields cannot
  leak dates/routes into a leg. Conflicting endpoint labels are retained.
- `src/data/interpretation/flightInterpretation.ts`: existing normalization and
  consolidation use source place labels without qualified airport identity.
- `src/data/interpretation/flightEvidenceCoverage.ts`: per-field raw spans, exact
  input pins/revisions and observation tokens; rejects corrupt/mismatched evidence.
- `src/data/interpretation/flightSourcePayload.ts`: transient Account-fenced bounded
  reads via existing reader. UTF-8 text proceeds; Flight FILE/IMAGE decode returns
  CAPABILITY_UNAVAILABLE / media UNKNOWN. No new app caller or custody path wired.
- `src/data/interpretation/__fixtures__/flightFirstStage1.ts`,
  `flightFirstStage1.test.ts`, `flightInterpretation.test.ts`: sanitized structured
  return, native-table and rebooking fixtures; synthetic dates/references; regressions.
- `src/data/interpretation/flightInterpretationQuality.ts`: pure private assessment,
  six dimensions and scope/revision-pinned basis; all observed fields and proposed
  families retain evidence. `flightEnrichmentDecision.ts`: pure closed-by-default
  recommendations, per-candidate provider targets, required evidence and fallback.
- `src/data/interpretation/flightInterpretationBenchmark.ts`, its test and
  `__fixtures__/flightEnrichmentBenchmark.ts`: validated synthetic measurement
  contract, partial observable sample gold and four labelled simulated strategies.
  `flightInterpretationQuality.test.ts`: evidence, route, scope and conflict regressions.
- Existing evidence projection now returns quality plus a closed enrichment decision;
  optional input issues distinguish cropped/missing source from tool/read inability.
- This report and `docs/CURRENT_IMPLEMENTATION_STATE.md`: incremental handoff.

No migration, endpoint, dependency, UI, second parser, AI runtime or canonical writer.

## Real sources and exact evidence

Both owner-supplied originals were readable. Private diagnostics outside Git used
aliases A/B, restricted permissions and original hash/count checks. No original,
extracted text, booking reference or personal field is committed or sent remotely.

| Input                   | Local extraction / interpretation                                                                                                                              | Unknown or retained evidence                                                                                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: booking email PDF    | PDFKit text; one derived input → two directional candidates; both local dates/clocks and source endpoint labels match the visible table; SUCCEEDED / PROCESSED | No per-leg service numbers established by body; filename/subject clue not assigned. Zones, qualified airports and absent ticket/passenger details UNKNOWN. Shared booking retained as source evidence; referenced e-ticket/invoice attachments not acquired.                                              |
| B: rebooking screenshot | Apple Vision, 40 observations; one derived input → four ordered service mentions; SUCCEEDED / PROCESSED                                                        | Route chain, rebooking, journey duration and aggregate clocks retained. No service-to-airport pairing or aggregate times/duration assigned to individual legs. Intermediate clocks/year/zones and exact version identity UNKNOWN. Crop and On Time display remain source evidence, not live verification. |

Private assert-based replay uses a **fixture-only nonpublishing catalog**, actual
original hashes/counts, DERIVED parent IDs and transform/version pins, existing
`bindFlightBatch` and interpretation. Original files remained unchanged. OCR
confidence/geometry stay in private extraction output; no invented business-field
confidence. This verifies extraction plus deterministic evidence replay, not live
C2 admission or mobile app ingestion. Original evidence and subsequent review/edit
objects remain separate; unsupported Booking/Ticket dimensions are retained without
claiming canonical materialization.

## Local capability gate

| Capability              | Result                                                       | Actual OTR integration                                                                                                                         |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic parser    | PASS, actual A 1→2 / B 1→4 plus sanitized regressions        | Existing path, NO_MODEL                                                                                                                        |
| PDF text extraction     | PASS, local macOS PDFKit and independent PDF text inspection | Capture native PDF extraction NOT WIRED; iPhone NOT VERIFIED                                                                                   |
| Apple Vision OCR        | PASS, local macOS accurate revision 3 recognition            | Receipt integration is Ledger-custody-only; Capture wiring and iPhone NOT VERIFIED                                                             |
| Apple Foundation Models | NOT WIRED                                                    | SDK present; host availability available; zero model requests. No OTR adapter. Hardware/framework availability does not prove app integration. |
| Remote LLM / DeepSeek   | NOT ACTIVATED                                                | Zero remote/model requests; providers and C5/C9 CLOSED                                                                                         |

Native probe used PDFKit, ImageIO format/pixel bounds and existing Receipt OCR
settings without widening Ledger paths. Sandboxed Vision initially returned
OSStatus -6662; identical approved local host diagnostic passed. No device,
simulator, Foundation Models/LLM inference or Hosted activation. Missing model integration is a
capability gap, not mandatory Human Review; model malformed/unavailable fallback
execution is not applicable to an absent adapter.

## Quality dimensions and machine invariants

- Extraction coverage: processed text, failed/deferred inputs, ignored-span count
  and explicit SOURCE_INCOMPLETE versus CAPABILITY_UNAVAILABLE/PARTIAL_READ.
  Original completeness defaults UNKNOWN; text-read does not mean original complete.
- Field support: critical versus optional gaps, UNKNOWN value, observed/inferred
  status, document/model/deterministic evidence kinds, exact pins/locators,
  uncertainty, conflict alternatives and validation. Proposed composite families
  are deterministic derivations with their own evidence. Missing evidence does not
  become confidence zero. No document support automatically confirms a booking.
- Structure: candidate count and source mention order per input, N→M input support,
  deferred relationship count and unmatched spans. Mention order does not verify
  flight-to-airport association; Booking/Ticket completeness stays UNKNOWN.
- Consistency: material field conflicts (including authored city labels), unresolved
  operational/codeshare matching, ambiguity and separate revision continuity review.
  Unobserved dates/zones/timings remain gaps; no cross-zone chronology fabricated.
- Authority/freshness: document support is distinct from booking verification and
  live facts. Historical pins are marked; source age/freshness remains UNKNOWN.
- Admission readiness: only critical-support diagnostics; grantsAuthority=false,
  Core assessment required, UNKNOWN sibling fence unchanged. Quality never changes
  an interpretation, reviewed edit, Job state or canonical row.

The assessment basis pins Account, Trip, Run/generation, manifest, response digest
and complete evidence inputs/revisions. Changed basis rejects stale reuse. Future
executors must recompute decisions with current capabilities and Core authority;
these recommendations are not authorization tokens. Existing CP13 human review
and historical interpretation remain independent; no human/provider field is
claimed in current source-only quality because neither was executed here.

## Enrichment policy and sample decisions

Routes: NONE, LOCAL_MODEL, FLIGHT_PROVIDER, REMOTE_LLM, HUMAN_REVIEW and
DEFER_UNTIL_CAPABILITY. Every decision includes reason, targets, evidence basis,
required evidence, cost/latency tier, fallback and executionAuthorized=false.

Provider consideration requires observed exact service/date, current selection,
network, separate authorization, availability, licensed field coverage, current
freshness and evaluated, justified cost input. Targets are candidate-specific; unaddressed
fields remain explicit. Published facts cannot prove passenger booking. Live
status/gate/cancellation never falls back to an LLM without verified retrieval.
Optional local association is preferred when actually available; a separately
permitted remote model is an alternative, not a mandatory stage after Provider.
Unresolved material conflicts retain alternatives and seek independent covered
verification, then Human Review. Missing capability alone defers, preserving safe
local results without a retry ritual. No network/background execution installed.

| Real sample | Material gaps                                                                                                         | Actual recommendation                                        | Future evidence required                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A           | Per-leg service, airport qualification and zones missing; civil dates/clocks supported; original completeness UNKNOWN | DEFER_UNTIL_CAPABILITY / OPTIONAL_ENRICHMENT_NOT_AVAILABLE   | Provider cannot safely select a leg without exact service/date; filename clue cannot fill both. Optional local model may associate existing evidence but cannot recover an absent ticket. Remote remains unauthorized. |
| B           | Service mentions supported, each service date/airport pairing/intermediate timing/zone missing; source known cropped  | DEFER_UNTIL_CAPABILITY / SOURCE_INCOMPLETE_EVIDENCE_REQUIRED | Need fuller source/segment association. No provider query from yearless aggregate date. Local/remote association cannot invent absent times; any later fresh live facts need Provider coverage.                        |

Both private replays still produce SUCCEEDED/PROCESSED with two/four candidates,
zero detected material field conflicts and no automatic confirmations. Zero
conflicts is not proof that all source relationships were resolved. Existing
rebooking and aggregate journey evidence remains separate and unassigned.

## Gold and cost measurement readiness

Measurement contract covers document/segment count, gold-matched critical fields,
false confirmations, missed segments, duplicate actual flights, unmatched candidates,
material conflicts/review requests, simulated versus actual calls, retries, latency,
and estimated/actual monetary minor units split into token/provider/OCR-device/human
costs. Unknown category means unknown total; zero is used only when explicitly
labelled by a synthetic assumption. No provider price, SLA or coverage invented.

Reusable partial gold labels only source-observable synthetic facts: return table
12/12 known facts across two candidates; rebooking 4/4 service mentions across four.
These local parser checks miss/duplicate zero, confirm zero, verified-candidate zero;
confirmation-rate and cost-per-verified-candidate are null. Unobserved fields have
no gold label. Matching mentions is not validated airport association or population
accuracy, and two examples do not establish a population success rate.

LOCAL_ONLY, LOCAL_PLUS_PROVIDER, LOCAL_PLUS_REMOTE_LLM and SELECTIVE_ROUTING share
a separately labelled synthetic strategy fixture. Provider variants simulate one
covered lookup; remote variant simulates one inference. All actual external calls
zero; real prices, latency, OCR/device assumptions and human burden remain unknown.
This is measurement readiness, not a live strategy benchmark or measured savings.

False automatic confirmation uses its explicit gold-labelled confirmation denominator;
nongold confirmation is counted separately as unscored, never measured false merely
for lacking a label. Unsupported confirmation has a separate evidence guardrail.
Duplicate/unsafe/unscored-confirmation candidates cannot inflate correctly verified
cost denominators. Cost per correctly verified candidate is evaluated only within
explicit synthetic gold scope. Review/conflict/correction counts expose downstream
burden; no human price or population correction rate is assumed. Only compact counts
and labelled cost measurements leave the evaluator; private source values do not.

## Validation and review

| Matrix                                                                      | Coverage                                                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Sparse return / ordered segments / unknown timings / exact spans            | Sanitized Stage 1 fixtures and private real replay                                                                                      |
| N→M, same-leg Sources, codeshare, distinct dates, revised/replayed sources  | Existing interpretation/consolidation and CP13 suites; new common-booking non-collapse and rebooking uncertainty tests                  |
| Booking/Ticket / document with multiple interpretations                     | Original/deferred evidence retained; no unsupported canonical Booking/Ticket creation claimed                                           |
| Missing original, changed content, partial/failed read, UTF-8/bounds        | New rejection, reader closure and independent-input failure tests                                                                       |
| Reviewed fields, restart, stale ACK, Account A→B→A, offline/provider CLOSED | Existing CP13/closure/Account/Continuation suites plus new payload/evidence Account fences                                              |
| Table scope, contradictions and lossless coverage limits                    | Stale header rejected, conflicting city withholds endpoint, UTF-8 byte spans exact, long footer coalesces, disjoint-span bound retained |

Frozen consolidated code tree: **248 suites / 3540 tests: 3523 PASS, 2 FAIL, 15 SKIP**.
Initial Stage 1 was 246 suites / 3502 tests: 3485 PASS, same 2 FAIL, 15 SKIP.
Exact baseline archive: 245 suites / 3461 tests: 3444 PASS, same 2 FAIL, 15 SKIP.
79 additional passing tests versus main baseline (38 from Addendum 2), no new regressions. Existing failures:
`navigationLayout.test.ts` reads missing screenOptions.tabBarActiveTintColor;
`architectureBoundary.test.ts` flags the existing diagnostics test's data/sync import.
These were not changed or counted as PASS.

Vitest ran with runner config, cache disabled, one worker. Typecheck, lint including
UI guard, Backend build PASS. UI guard: 473 legacy occurrences / 86 representative
files. Changed-file Prettier and git diff checks PASS.
Private assert-based replay PASS; sensitive outputs stayed private.

Independent targeted review PASS: stale section marker, discarded conflicting
endpoint row and quadratic ignored-offset calculation fixed. Reviewer ran four
suites / 155 tests, mixed Chinese/Japanese/emoji CRLF exact-byte assertions and
120,000-row coalescing benchmark (72 ms). No unresolved important code finding.
Addendum review independently closed five further findings: authored city conflicts,
per-candidate lookup targets, nongold confirmations, unsafe cost denominators and
incomplete-source NONE routing. Final enrichment review: six suites / 193 tests PASS;
cost-justification gate and partial observable gold rechecked. No remaining important
code findings. Consolidated report semantics independently checked.
Private samples/native diagnostics and full-suite comparison remain builder evidence,
not independently replayed.

## Core handoff and stopping point

Verified main has no accepted versioned executable multi-output admission contract.
Run-wide UNKNOWN sibling fence remains. No two-leg canonical preparation/write,
SQLite/sync admission or Day Feed read executed. Existing assessment can consume
candidate evidence; independent sibling preparation requires Core's accepted contract.

**INTERPRETATION PASS / EVIDENCE PASS / CORE ADAPTER BLOCKED /
CANONICAL ADMISSION NOT AUTHORIZED / DAY FEED NOT VERIFIED.**

Stage 1 stops at local extraction → existing deterministic interpretation → exact
evidence projection / FlightCandidateSet. Native Capture wiring and Core admission
remain explicit gaps; no alternate runtime/provider/writer introduced.

## Publication

Implementation commit `8743641f336ce48114a6d35abeb942af2f77897d` was committed
and pushed to `origin/codex/capture-flight-stage1` after validation and review.
Initial publication-record commit `b8effbfbfeec80858ecad7d9cd27b8b595637d01` remains
in the same branch. Addendum implementation commit
`ff7c2bbfab42b0f4ef5f884abb633a90e84ad152` was pushed to that same branch after
final validation. Its publication-record commit is identified in Git history/final
message to avoid a self-referential hash. Canonical integration **BLOCKED FOR OWNER REVIEW**: pre-existing main
edits overlap `docs/CURRENT_IMPLEMENTATION_STATE.md`, also required for this stage.
Parallel edits were preserved. No merge, stash, force push or overwrite performed.
