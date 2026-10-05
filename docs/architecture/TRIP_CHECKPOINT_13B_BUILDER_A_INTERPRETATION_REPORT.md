# CP13B — Builder A Flight interpretation

Date: 2026-10-06 (Pacific/Auckland). **BUILDER A COMPLETE / WAIT FOR INTEGRATION.**

## Starting state and scope

Fresh managed worktree:
`/Users/xoery/.codex/worktrees/cp13b-flight-interpretation/otr-mobile-canonical`.
Branch: `trip/import-interpretation`. Starting and retained HEAD:
`806c2643d06af60f269c9c4004da1b7e226496b7`; startup worktree clean.
SQLite tail **49**; server tail
`20261005001100_trip_import_undispatched_revocation.sql` (82 migrations).
All runtime gates remain CLOSED. No commit, push, network/provider call, Hosted Dev
or Production access. The original canonical/import/temporal checkouts are untouched.

Normative inputs: CP12 architecture, Import contract, registry, intelligence
contract, Red Team review, final contract report and Import ADR; CP13A.1 exact
preflight, CP13A.2 report, independent review including targeted recheck and ADR.
CP11 Capture and actual CP13A Source/Representation/Input, matcher, proposal,
publication/digest, catalog recovery and Account-generation contracts were inspected.
Historical review-pending labels do not override the owner's CP13B authorization.
No accepted contract or architecture boundary was changed; no new ADR is needed.

## Exact changed files

Added:

- `src/domain/intelligence/interpretation.ts`
- `src/domain/trip/referenceFlightExtractor.ts`
- `src/data/interpretation/flightInterpretation.ts`
- `src/data/interpretation/flightInterpretation.test.ts`
- `docs/architecture/TRIP_CHECKPOINT_13B_BUILDER_A_INTERPRETATION_REPORT.md`

Updated: `docs/CURRENT_IMPLEMENTATION_STATE.md`. The old handoff was approximately
41,400 words; it is condensed to current checkpoints, authoritative references and
remaining gates, as AGENTS.md requests. Historical reports/contracts are unchanged.
No other tracked file is changed.

## Interpretation seam and reference extraction

`interpretFlightBatch(batch, dependencies)` is an explicit, unwired Builder-B seam.
It consumes already-admitted exact Source/material revision/Representation/Input
pins and supplied text, plus scoped catalog/lineage and read-only matching observations.
It returns an immutable Candidate Set with typed proposals, observation/raw-value
support, fragments, contradictions, ambiguity, per-Candidate/pairwise resolution,
source/input coverage, safe failures, deferred dimensions and consolidation lineage.

The seam reuses existing catalog schemas/recovery validation, Account generation/
apply gate, `importDigest`, `flightProposalSchema`, temporal/service schemas and
`matchFlightV1`. It verifies Source ownership, Trip, current row revision, retained
material and exact representation ancestry/UTF-8 bytes/hash; request/input/schema/
configuration and response digests; evidence locators, deterministic normalization,
coverage membership and bounds. Request and result objects are frozen. A→B→A and
late-deadline results reject. No token refresh/network bootstrap is required.

The neutral `otr-intelligence-v1` request/response carries exact replay identity,
consumer/schema/dialect/digests, Account/Trip/Run binding, pinned descriptor/config,
capabilities, actual NO_MODEL version, local-only policy, deadline, declared limits,
coverage, safe per-input failures and response digest. The descriptor honestly
advertises deterministic replay, caller-fenced deadlines and unsupported cancellation.
No provider objects, credentials, executable commands or business readiness cross it.
Future adapters return this same observation envelope; Import validates it independently.

`referenceFlightExtract` supports TEXT, EMAIL_TEXT, OCR_TEXT and TABLE_TEXT forms
of **already supplied text**. It performs no OCR, PDF/vision processing, email
acquisition, fetch, model inference or transport. Its deliberately narrow v1 grammar:

```text
NZ289 AKL→CHC 2026-12-18 dep=10:30 depOffset=+13:00
NZ281 CHC→AKL 2026-12-20 dep=18:00
```

A leg starts a line with an IATA designator or `Flight: NZ289`. Labelled following
lines can supply `Route`, `Date`, `depDate`, `arrDate`, `departure`/`dep`, `arrival`/`arr`,
`depZone`/`arrZone`, `depOffset`/`arrOffset`, `depInstant`/`arrInstant`, `operating`,
`occurrence` or `change`. Semicolons, pipes or the next labelled value separate
inline fields. ISO dates normalize; yearless/invalid dates remain raw and unresolved.
`~10:30` explicitly denotes estimated time. Unrelated rows and unhandled text spans
are recorded as ignored coverage; unsupported reservation types are never fabricated.
A new unrelated row ends a multiline leg block. This is a reference grammar, not a
claim of general natural-language or document understanding.

## N→M, Flight v1 and evidence

One input can yield outbound/return or twelve table legs; several inputs can support
one occurrence or several consolidated occurrences. Every field retains raw literal,
typed normalized suggestion, uncertainty and exact supporting fragments. UTF-8 byte
TEXT_SPAN locators bind Input, Source, Representation and material revision; Unicode
prefixes are tested. No invented page/region geometry or excerpt is added.

Occurrence proposals map only to existing CP13A families: transport subtype, title,
origin, destination and services. Service codes/numbers retain suffixes/leading zeros,
namespace and literal. Attribution stays UNSPECIFIED unless operating/codeshare
evidence exists. Evidenced marketing services sharing one operating occurrence are
compatible scoped services, not an arbitrary primary-service winner. No operating
identity, canonical Place UUID or airport identity is inferred from a label.

Automatic matching requires consumer-supplied, input-bound unique airport resolution
observations, explicit current/complete relevant scope and the admitted match-v1
anchors. Reference fixtures provide synthetic airport resolution observations;
there is no new airport catalog, geocoder or provider lookup. Code extraction alone
retains authored airport labels but cannot certify SAME_ITEM.

For SAME_ITEM observations, supported complementary fields consolidate. Duplicate
support adds provenance without another Candidate. All field alternatives survive;
conflicting composites are omitted from the single-valued CP13A proposal and remain
in the richer observation/support map for Builder B. No source age, parser order or
confidence chooses a value. Consolidation requires pairwise compatibility across
all group members, preventing a missing-clock bridge from joining competing clocks.

## Matching, contradictions and deferred dimensions

Policy: **`import-flight-match-v1`**, through the unchanged CP13A matcher.
Pair outcomes are SAME_ITEM, POSSIBLE_DUPLICATE, UNRESOLVED_MATCH or DISTINCT_ITEM;
the last corresponds to the existing matcher's scoped NEW_ITEM assessment, without
creating an action or command. Matching scope and baseline remain explicit.

Tuple-only matching examines all selected competing proposal clocks as well as
supplied existing occurrences. Unknown/incomplete scope, unresolved airports,
unexplained clock competition or codeshare prevent automatic consolidation. Different
dates/directions remain separate. A documented qualified issuer/leg scope supplied
by the consumer can independently anchor the same service/date/route despite conflicting
schedule observations: both departure values remain in one Candidate. Supplier/date/
route contradiction still rejects automatic matching. An occurrence marker without
an admitted uniqueness scope is not a strong anchor. Retiming/change notices and
changed service numbers retain explicit continuity-review requirements; extracting
a notice never fabricates a human continuity decision.

Passenger, PNR, ticket, seat, baggage, fare and cabin produce only existing allowed
unsupported-dimension markers with exact Input/locator and no excerpt or copied
value. Different passengers/PNRs can support one occurrence. Ambiguous names are
retained in immutable original evidence for future augmentation, never Person-mapped,
flattened into Event text or stored as new booking/participant facts.

## Temporal and lineage behavior

Civil dates/clocks, precision, exact/estimated quality, supplied offset and actually
evidenced IANA zone remain separate. Missing clock/arrival never becomes midnight,
a zone or an instant. Explicit midnight remains exact. Only a supplied independent
source timestamp (`depInstant`/`arrInstant`) normalizes to SOURCE_INSTANT; offset-bearing
source timestamps retain their offset and up to six fractional digits. A civil clock
plus separate offset remains DERIVED_CIVIL with null source instant. No civil resolver
or offset-only arithmetic conversion is added. Unresolved civil timelines are marked
for Builder B; interpretation does not decide Option-A executable admission or closure.

IDs are deterministic opaque **Run-scoped proposal identities**, not Flight keys.
Replay of identical pinned requests is byte-identical; a new Run yields new Candidate
identities. Overlapping earlier Runs and relevant predecessor Candidates cannot be
silently omitted. Existing bounded transitive Run ancestry is retained; every child
conservatively references the selected predecessor Candidates, including split/merge
possibilities. These links do not declare claim irrelevance or reviewed output purposes.
Builder B/CP13A still inspect claims and decide exact purpose dispositions/recovery.

The returned `publication_request` has the exact existing internal publication shape
(Inputs, Candidates, predecessor and Candidate-lineage rows, extractor/config binding).
Its input digest matches the checked-in **SQL-produced CP13A golden**; constructed
output passes existing strict catalog/proposal/digest recovery validation. It is
publication input only: this slice does not send/install it, append to a sealed Run,
allocate authoritative server generation, prepare Confirmation/slots or mutate Source.
No new publisher or persistence schema is introduced. Protected-server publication
was not dynamically executed in this slice; its unchanged existing owner remains
responsible for atomic immutable publication and exact operation-key replay.

## Bounds and failure

64 Inputs/items/fields per observation, 64 locators/deferred markers per Candidate
container, 64 relevant catalog/lineage rows, 262144-byte text/Candidate and 4 MiB
request/response/Set bounds are enforced. Source/Representation ancestry is bounded
and memoized. Global output/support/lineage overflow fails explicitly; per-Input
extraction overflow defers that entire Input. Nothing is silently truncated.
Inputs process in stable pin order. One invalid/over-bound Input leaves other valid
results usable with PARTIAL status, exact unprocessed IDs and content-free failures.
These are execution/coverage observations, not closure or accepted-state labels.

## Validation and readiness

- Focused suite: **47 tests PASS**, covering all 24 requested vectors plus evidence/
  scope/immutability/deadline/limit checks, N→M multi-input/multi-leg consolidation,
  unqualified-airport/implicit-operating rejection, exact coverage and CP13A publication
  compatibility. Tests use deterministic supplied-text fixtures and existing Vitest.
- Final selected regression: **11 suites / 437 tests PASS**: Builder A, Flight admission,
  reviewed proof selection, Import repository, certified Event collection, CP11 Capture
  domain/repository/payload, Account request fencing, Day and scheduler.
- Typecheck, full lint/UI guard and Backend build **PASS**. UI guard retains 473
  unchanged legacy occurrences and checks 76 representative UI files.
- Changed-file formatting and Git whitespace **PASS**. Whole-repository format reports
  **18 existing, unchanged files**, including the owner-provided CP13A independent
  review; no unrelated formatting repair is included. Full native/app build and full
  Vitest suite were not run; selected regressions are the claimed test scope.
- SQLite49, all 82 server migrations, canonical commands, TRACK_C proofs/receipts,
  B-T3I/Day/Ledger, runtime gates and scheduler are unchanged. No DB/remote/device
  acceptance or provider capability is claimed.
- Final Git: six changed paths above, all unstaged/uncommitted; retained exact HEAD.
  Temporary existing-dependency link removed. No dependency/lockfile change.
- Next step: integration with Builder B and owner review. No schema, admission,
  runtime/UI, canonical commit, Hosted Dev or Production work is authorized here.

## Required answers

| Question                                              | Answer |
| ----------------------------------------------------- | ------ |
| Builder A complete                                    | YES    |
| Reference extractor implemented                       | YES    |
| Actual LLM/provider added                             | NO     |
| N→M discovery implemented                             | YES    |
| Flight v1 typed interpretation implemented            | YES    |
| Evidence mapping implemented                          | YES    |
| Flight match-v1 used                                  | YES    |
| Consolidation implemented                             | YES    |
| Contradictory evidence preserved                      | YES    |
| Multiple passengers can consolidate to one occurrence | YES    |
| Passenger→Person mapping added                        | NO     |
| Booking persistence added                             | NO     |
| Canonical Event mutation added                        | NO     |
| Schema/migration changed                              | NO     |
| Runtime gates enabled                                 | NO     |
| Hosted Dev/Production accessed                        | NO     |
| Commit                                                | NO     |
| Push                                                  | NO     |

**STOP — BUILDER A COMPLETE / WAIT FOR INTEGRATION.**
