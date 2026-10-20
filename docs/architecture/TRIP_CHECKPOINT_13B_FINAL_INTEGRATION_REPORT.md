# CP13B Final Integration Report

Date: 2026-10-06 (Pacific/Auckland). **Integration PASS — READY FOR OWNER REVIEW.**
This is local engine integration evidence, not runtime activation, device acceptance,
or a claim that existing CP13A security limitations have been resolved.

## Starting state and imported scope

Canonical checkout `/Users/xoery/Project/otr-mobile-canonical` was clean on
`integration/ledger-polish-canonical` at `dc580e7`; it remains unchanged.
A fresh managed integration worktree was created at the required exact base
`806c2643d06af60f269c9c4004da1b7e226496b7`, initially clean, then switched to
`integration/cp13b-flight-import`. Its HEAD remains that base. Both Builders were
independently checked at that same HEAD and their declared uncommitted scopes.
No commit, staging, push or remote operation occurred.

Builder A imports (excluding its separate current-state document):

- `src/domain/intelligence/interpretation.ts`
- `src/domain/trip/referenceFlightExtractor.ts`
- `src/data/interpretation/flightInterpretation.ts`
- `src/data/interpretation/flightInterpretation.test.ts`
- `docs/architecture/TRIP_CHECKPOINT_13B_BUILDER_A_INTERPRETATION_REPORT.md`

Builder B imports (excluding its separate current-state document):

- `src/domain/trip/flightImportClosure.ts`
- `src/data/repositories/flightImportClosureOrchestrator.ts`
- `src/data/repositories/tripImportAdmissionRepository.ts`
- `src/data/repositories/flightImportClosure.test.ts`
- `docs/architecture/TRIP_CHECKPOINT_13B_BUILDER_B_CLOSURE_REPORT.md`

Integration-owned additions are
`src/data/interpretation/flightClosureProjection.ts`,
`src/data/interpretation/flightImportIntegration.test.ts`, this report and the
reconciled `docs/CURRENT_IMPLEMENTATION_STATE.md`. Integration corrections also
modify A's `flightInterpretation.ts` and B's closure domain/orchestrator/repository/
tests. Both standalone Builder reports remain byte-identical to their originals.
The current-state file merges A interpretation and B closure/preparation facts,
retains accepted foundation/security boundaries and replaces historical next-step
wording with Owner Review only; it does not rewrite accepted contracts/reports.

## Independent review and the structural seam

A has the sole public `FlightCandidateSet`, defined from its actual interpretation
result. Candidate IDs remain proposal identities, never Flight occurrence IDs.
B's former competing Candidate Set type is now `FlightClosureInputSet`: a canonical
review projection, not a temporary shim. `projectFlightClosure` derives only
existing normalized facts and carries the complete original interpretation result
in its validated `interpretation` field. Original anchors, matching configuration,
fragments, alternatives, locators, Inputs, lineage, partial coverage and proposal
publication bytes therefore remain available rather than being reconstructed from
strings or narrowed into B's review fields. No extraction is rerun at closure.

Review choices explicitly supply output purpose, continuity, lineage disposition
and resolution plan. Continuity locators must belong to the original Candidate;
lineage choices must refer to declared predecessors. Candidate ID, Run ID, proposal
digest, values, support Input IDs and exact locators are checked against the
immutable published catalog. All persisted Run Input pins are compared and
revalidated through the existing CP13A pin validator, including material/revision,
representation/registration and ancestry. No provider, direct UI database access,
new lifecycle owner or parallel persistence model is introduced.

Independent inspection found and corrected these integration defects:

1. A's baseline target was counted again alongside a peer already matching that
   same target. Two independently qualified observations now consolidate when
   both uniquely match the same canonical occurrence; ambiguity guards still apply.
2. A's clock competition could leak across unrelated dates/routes. Competition
   now remains within the same dated route, preserving distinct Flight outcomes.
3. B could classify unresolved upstream identity as NEW, and downstream callers
   could upgrade scope/resolution. Unresolved identity stays UNRESOLVED_MATCH;
   scope and unresolved-resolution upgrades are rejected.
4. B's normalized projection omitted A's complete observation model and restricted
   qualified airport IDs to UUIDs. Full original interpretation is retained, and
   qualified IDs follow the existing anchor contract without fabricating airports.
5. B validated selected proposal fields but not exact locators/all Run pins. Both
   are now revalidated before durable preparation; stale evidence fails closed.

The deterministic reference grammar retains its declared limits; email-like,
ticket-like, OCR-like and table-like text fixtures are supplied text, not new
natural-language/provider/OCR capability. Evidence is exact UTF-8 source spans.
Automatic matching requires actual qualified airport/operating observations and
complete relevant scope. Raw airport codes, labels, passenger/PNR and acquisition
identity do not grant occurrence identity. Contradictions retain both alternatives
and locators; no winner is silently selected by confidence.

## Closure, lineage, time and persistence results

NEW produces action-specific READY only when required independent departure facts
and matching admission are present. DUPLICATE_EVIDENCE creates no command.
COMPLETE_EXISTING and UPDATE_EXISTING use the real read-only Event/service baseline
and exact revision. Unsupported changes without reviewed continuity are CONFLICT;
unqualified or unresolved identity remains UNRESOLVED_MATCH. Cache absence alone
never establishes a new occurrence. Temporal pending is not transformed into an
identity ambiguity; actual temporal admission remains B/CP13A's responsibility.

Passenger names, PNR, seats and other unsupported dimensions remain original
material plus locator-bound deferred markers. Several passenger/booking documents
can support one occurrence without Person mapping. Mixed arrival completion,
departure retime and passenger facts yield one complete supported Event update and
passenger DEFER; selected support cannot be dropped. Existing CP13A R1 validation
rejects incomplete reviewed-action/proof coverage before queueing. Stale Event
revision conflicts, with no silent rebase.

I1: retained predecessor UNKNOWN blocks a new-key competing CREATE. A known
successful predecessor binds its exact canonical target even when broad search
scope is incomplete. That test uses a clearly synthetic recovered claim/receipt
observation installed in the isolated database; CP13B does not manufacture server
success. A real retained Source replacement from material revision 1 to 2 yields
one predecessor and two new Flight Candidates; DISTINCT_OUTPUT preparation requires
reviewed disposition and preserves the predecessor claim. Without that disposition
both outputs remain fenced. Candidate splitting does not erase responsibility.

I2: mixed supported actions enter one CP13A confirmation/preparation with exact
parent revision and full selected component coverage. Unsupported dimensions are
retained as deferred augmentations. Preparation persists only the existing private
review/confirmation/output-slot lifecycle and queues `C_PREPARE_CONFIRMATION`;
canonical command dispatch is not performed.

Temporal Option A is unchanged: civil date/time, offset, zone observations,
precision and independently evidenced instant remain distinct. Missing/estimated/
offset-only departure does not invent midnight or an instant. Explicit exact
midnight with independent source instant is valid; unknown arrival remains unknown.
Deadline/attention uses evidenced instant or civil date and configurable horizon,
without changing identity or closure eligibility. Offset-only evidence gives
calendar attention without fabricated UTC. No civil resolver/fold/gap arithmetic.

Actual SQLite file reopen preserves retained material, drafts and exact preparation;
replay queues exactly one preparation. WAITING_FOR_NETWORK and WAITING_FOR_ENRICHMENT
retain durable original references without becoming missing-user-input. Real
Account A→B→A switches reject the old context/generation and preserve retained A.
Bound overflow rejects rather than truncates. Aggregate progress composes per-
Candidate outcomes with PARTIAL Input coverage; valid Candidates survive a failed
Input. READY alone has no acceptance/execution authority.

## Capture/Source fixture boundary

The integrated Capture test executes real CP11 TEXT intake and
`getForSourceHandoff`. It then explicitly installs an admitted local Source,
Representation, Input and schema-valid catalog fixture through existing catalog
validation, followed by A interpretation, B assessment and CP13A preparation.
This fixture seam is stated rather than presented as an implemented Source
acquisition/publication worker. All other integrated tests use deterministic
admitted local text fixtures and real SQLite49 repositories. No remote IO,
provider/connector admission, actual OCR/PDF/URL/email ingestion or device/live
acceptance is claimed.

## Mandatory integration matrix

All vectors below pass in `flightImportIntegration.test.ts` (47 tests, including
parameterized cases and additional stale-evidence/scope/attention checks).

| #   | Vector                           | Verified result                                   |
| --- | -------------------------------- | ------------------------------------------------- |
| 1   | One TEXT → one Flight            | NEW READY → immutable preparation                 |
| 2   | Outbound + return                | Two distinct Candidates/plans                     |
| 3   | Table-style                      | Twelve Flights preserved                          |
| 4   | Email-like + ticket-like         | One occurrence, both evidence supports            |
| 5   | Duplicate only                   | No canonical command                              |
| 6   | Complementary evidence           | Arrival retained with both Inputs                 |
| 7   | Contradictory departure          | Both alternatives/locators survive                |
| 8   | Same number, different date      | Distinct outcomes                                 |
| 9   | Reverse route                    | Distinct outcomes                                 |
| 10  | Unresolved codeshare             | Unresolved through B                              |
| 11  | Supported codeshare              | Evidenced shared operating occurrence             |
| 12  | Retime/supersession              | Explicit continuity and one update                |
| 13  | Number supersession              | Exact existing target retained                    |
| 14  | Missing departure                | No invented instant/admission                     |
| 15  | Unknown arrival                  | Explicit UNKNOWN retained                         |
| 16  | Offset-only departure            | No independent instant invented                   |
| 17  | Exact midnight                   | Independent exact evidence accepted               |
| 18  | Two passengers/different PNR     | One occurrence, deferred augmentations            |
| 19  | Ambiguous passenger              | No Person mapping                                 |
| 20  | Existing unknown arrival         | COMPLETE_EXISTING from real baseline              |
| 21  | Existing departure change        | UPDATE_EXISTING after review                      |
| 22  | Unsupported change/no continuity | CONFLICT                                          |
| 23  | Unresolved match                 | No mutation/NEW promotion                         |
| 24  | Predecessor UNKNOWN              | Competing CREATE blocked                          |
| 25  | Predecessor success              | Exact recovered target retained                   |
| 26  | DISTINCT_OUTPUT split            | Actual revision replacement; disposition required |
| 27  | Arrival + retime + passenger     | One UPDATE plus DEFER                             |
| 28  | Missing selected support/R1      | Rejected before durable queue                     |
| 29  | Stale Event revision             | Conflict, no rebase                               |
| 30  | Partial Input failure            | Surviving Candidates and PARTIAL coverage         |
| 31  | WAITING_FOR_NETWORK              | Durable draft/evidence retained                   |
| 32  | WAITING_FOR_ENRICHMENT           | Durable draft/evidence retained                   |
| 33  | Cold restart                     | File reopen and exact single replay               |
| 34  | A→B→A                            | Old generation fenced                             |
| 35  | Bounds                           | Rejected, never truncated                         |
| 36  | Progress/attention               | Mixed outcomes and coverage correctly aggregate   |
| 37  | Ledger non-interference          | INSERT/UPDATE/DELETE abort guards stay untouched  |
| 38  | Day non-interference             | Direct-write abort guards stay untouched          |
| 39  | Certificate semantics            | Protected-write guards untouched; code unchanged  |
| 40  | READY non-execution              | Canonical write guards untouched, dispatch NULL   |

## Validation and classification

- Builder A focused: **47 PASS**. Builder B focused: **52 PASS**.
- New integrated: **47 PASS**. Combined focused: **3 files / 146 PASS**.
- Selected regressions: **25 files / 740 PASS** covering interpretation/closure,
  CP13A admission/review, Flight domain, Account/generation, SQLite49, Capture,
  canonical collection/Event reads, certificate/Day ownership, scheduler/sync,
  Ledger sync non-interference and Backend Event/Source recovery.
- Final typecheck, lint (including UI guard), explicit UI guard, Backend build,
  changed-file Prettier and `git diff --check`: **PASS**. No new dependency.
- Exact-base full Vitest, isolated archive of `806c264…`: **193 files**, **1,851
  tests**, **1,850 passed / 1 failed**, with **11 failed files**.
- Final serial integrated full Vitest: **196 files**, **1,997 tests**, **1,996
  passed / 1 failed**, with the **same 11 failed files** and no new failed file.
  The 146 added passing tests equal the combined A/B/integration focused count.
- **EXISTING BASELINE BLOCKER:** ten React Native Flow collection failures:
  `dataHealthCoordinator`, `ledgerExpenseBatchRead`, `ledgerExpenseRepository`,
  `ledgerExpenseRetry`, `ledgerRateQuoteCache`, `ledgerReadRepository.convergence`,
  `ledgerReadRepository`, `myLedgerNarrowCache`, `tripPersonCertificate`,
  `tripPersonRepository` (their corresponding `.test.ts` files). These suites
  do not execute in the ordinary full environment; no pass is claimed for them.
- **EXISTING BASELINE BLOCKER:** `architectureBoundary.test.ts`, existing Ledger
  assertion “keeps UI and domain modules away from direct data infrastructure”.
- One earlier broad run also failed unchanged `src/data/api/client.test.ts`'s
  whole-string sensitive-value canary assertion; its isolated seven tests and
  the final serial full run pass. Record as a transient unchanged-test failure,
  not a corrected integration defect or a global reliability assurance.
- **INTEGRATION DEFECT:** the five structural/identity/evidence defects above are
  fixed and regression-covered. **NEW REGRESSION:** none remaining in executed
  checks. No unrelated baseline fixes were included. Environmental/native suite
  limitations remain visible rather than treated as checkpoint failures.

Reproducible primary commands: `npm test -- src/data/interpretation
src/data/repositories/flightImportClosure.test.ts`; `npm test -- --run
--maxWorkers=1`; `npm run typecheck`; `npm run lint`; `npm run ui:guard`;
`npm run backend:build`; changed-path `npx prettier --check`; `git diff --check`.
The selected 25-file run and full-run JSON evidence were inspected separately;
full JSON files are local diagnostic artifacts under `/private/tmp`, not shipped
repository fixtures. No server/native SQL permission acceptance was rerun or
claimed by CP13B.

## Protected boundaries and final answers

SQLite migrations **1–49** and server migrations **1–82**, ending in
`20261005001100_trip_import_undispatched_revocation.sql`, remain unchanged.
CP13A canonical commands/proof/receipts/security manifest, B-T3I certificate,
CP11 Day/Capture ownership and Ledger canonical behavior are unchanged. Server
Flight gates retain false-only constraints/defaults/seeds. All five C import queue
operation names remain scheduler-denied. No startup worker, route, connector,
provider, UI, deployment or remote project access. Final Git state consists only
of the 14 declared modified/new files above, unstaged; HEAD unchanged. The temporary
existing-dependency symlink is removed before handoff.

| Explicit question                                      | Answer |
| ------------------------------------------------------ | ------ |
| Builder A integrated                                   | YES    |
| Builder B integrated                                   | YES    |
| A→B structural seam verified                           | YES    |
| Candidate identity preserved                           | YES    |
| Evidence/provenance preserved                          | YES    |
| Contradictions preserved                               | YES    |
| N→M preserved end-to-end                               | YES    |
| Flight match-v1 semantics preserved                    | YES    |
| Multiple passengers consolidate without Person mapping | YES    |
| Passenger/booking facts remain deferred                | YES    |
| NEW_ITEM integrated                                    | YES    |
| DUPLICATE_EVIDENCE integrated                          | YES    |
| COMPLETE_EXISTING integrated                           | YES    |
| UPDATE_EXISTING integrated                             | YES    |
| CONFLICT integrated                                    | YES    |
| UNRESOLVED_MATCH integrated                            | YES    |
| Temporal Option A preserved                            | YES    |
| I1 lineage fence preserved                             | YES    |
| I2 complete reviewed-action semantics preserved        | YES    |
| CP13A preparation reached                              | YES    |
| Canonical Event auto-executed by CP13B                 | NO     |
| Offline/waiting preserved                              | YES    |
| A→B→A fenced                                           | YES    |
| Ledger mutation added                                  | NO     |
| Day directly written                                   | NO     |
| Certificate semantics changed                          | NO     |
| LLM/provider runtime added                             | NO     |
| UI added                                               | NO     |
| Server/SQLite migration added                          | NO     |
| Runtime gates enabled                                  | NO     |
| Hosted Dev/Production accessed                         | NO     |
| Commit                                                 | NO     |
| Push                                                   | NO     |
| Checkpoint 13B integration PASS                        | YES    |

**STOP — READY FOR OWNER REVIEW.** No commit or push.
