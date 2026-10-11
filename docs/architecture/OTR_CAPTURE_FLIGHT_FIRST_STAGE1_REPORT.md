# Capture Flight-first Stage 1

Date: 2026-10-12 (Pacific/Auckland). Owner authorization and local AI addendum applied.

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
simulator, model inference or Hosted activation. Missing model integration is a
capability gap, not mandatory Human Review; model malformed/unavailable fallback
execution is not applicable to an absent adapter.

## Validation and review

| Matrix                                                                      | Coverage                                                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Sparse return / ordered segments / unknown timings / exact spans            | Sanitized Stage 1 fixtures and private real replay                                                                                      |
| N→M, same-leg Sources, codeshare, distinct dates, revised/replayed sources  | Existing interpretation/consolidation and CP13 suites; new common-booking non-collapse and rebooking uncertainty tests                  |
| Booking/Ticket / document with multiple interpretations                     | Original/deferred evidence retained; no unsupported canonical Booking/Ticket creation claimed                                           |
| Missing original, changed content, partial/failed read, UTF-8/bounds        | New rejection, reader closure and independent-input failure tests                                                                       |
| Reviewed fields, restart, stale ACK, Account A→B→A, offline/provider CLOSED | Existing CP13/closure/Account/Continuation suites plus new payload/evidence Account fences                                              |
| Table scope, contradictions and lossless coverage limits                    | Stale header rejected, conflicting city withholds endpoint, UTF-8 byte spans exact, long footer coalesces, disjoint-span bound retained |

Frozen final code tree: **246 suites / 3502 tests: 3485 PASS, 2 FAIL, 15 SKIP**.
Exact baseline archive: 245 suites / 3461 tests: 3444 PASS, same 2 FAIL, 15 SKIP.
41 additional passing tests, no new regressions. Existing failures:
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
Private samples/native diagnostics remain builder evidence, not independently replayed.

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
The publication-record documentation commit is identified by Git history and the
final completion message, avoiding a self-referential report hash. Canonical integration **BLOCKED FOR OWNER REVIEW**: pre-existing main
edits overlap `docs/CURRENT_IMPLEMENTATION_STATE.md`, also required for this stage.
Parallel edits were preserved. No merge, stash, force push or overwrite performed.
