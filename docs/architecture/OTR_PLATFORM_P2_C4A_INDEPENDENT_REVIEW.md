# Platform P2 / Capture C4a independent implementation review

Date: 2026-10-08 (Pacific/Auckland). Role: Independent Reviewer.

**Verdict: PASS WITH REQUIRED CORRECTIONS.**

**Ready for Final Owner Review: NO.** Two implementation findings remain:
**R1 IMPORTANT**, **R2 LOW**. No CRITICAL finding. The separate joint Capture C4a
constraints artifact is also unavailable; its acceptance cannot be certified.

## Scope and evidence

Reviewed the uncommitted implementation in
`/private/tmp/otr-p2-c4a-pure-assessment-20261008`, branch
`codex/p2-c4a-pure-assessment-20261008`. HEAD, local main and cached origin/main
equal exact base `b6daffecedab1616b173fde3f5e2de5d54770eff`; no fetch occurred.

All five delivered files were inspected: `src/domain/capture/batchAssessment.ts`,
its test and fixture, `docs/CURRENT_IMPLEMENTATION_STATE.md`, and the original
Builder report. Direct schema/hash dependencies were inspected in `localCapture.ts`,
`flightImportReview.ts`, `flightImportClosure.ts`, and `eventIntentJson.ts`.
Caller inspection found only the new tests; no runtime composition calls assessment.

Acceptance inputs include the Builder report, the P2/C4 semantic preflight at
`/private/tmp/otr-p2-c4-semantic-preflight-20261008/docs/architecture/OTR_PLATFORM_P2_CAPTURE_C4_SEMANTIC_PREFLIGHT.md`,
committed approved Capture Flow 1–7, the Owner-decision ADR, and the ten review
requirements supplied for this task. The Builder report explicitly states that
Capture's separate five corrections were not supplied. No separate joint C4a
constraints artifact was found in the worktree, preflight or bounded Downloads
inventory; its path was requested during review. This report does not invent its
contents or equate the P1/C2 ADR with C4a acceptance. Supply that artifact and check
the corrected implementation against it before final readiness.

## Required corrections

### R1 — IMPORTANT: caller assertion promotes unknown dependency to supported semantics

Location: `src/domain/capture/batchAssessment.ts:335`, `:364`, `:412`, `:428`.

`evidence()` validates that a locator resolves an understood mapped Input and has
valid span bounds. It does not establish semantic independence. Nevertheless,
`INDEPENDENT` passes this structural check and contributes no barrier reason. The
result presents the finding as `SUPPORTED_READ_ONLY` and can expose
`AVAILABLE_READ_ONLY` provisional Review metadata.

Reproduction using the delivered fixture:

1. Keep Input A understood and retain its mapped text locator.
2. Change Input B to acquisition `UNKNOWN`, processing `NOT_APPLICABLE`, no bindings.
3. Keep a finding supported by A; declare B's dependency `UNKNOWN`. Assessment
   correctly returns `BLOCKED`, `DEPENDENCY_UNKNOWN`, and `UNAVAILABLE`.
4. Change only B's relation to `INDEPENDENT`, with the same A locator as its
   independence evidence; reseal the caller-supplied snapshot/current digest.
5. Assessment returns `SUPPORTED_READ_ONLY`, empty finding reasons, and
   `AVAILABLE_READ_ONLY`. No semantic evidence or admitted policy establishing B's
   irrelevance was introduced. The unavailable B material was never examined.

This violates review requirement 4 and preflight section 5 rule 3. A digest of a
caller assertion proves consistency of supplied bytes, not their semantic truth.
The Builder report acknowledges that independence is supplied and proposes a
future CP13B-backed adapter, but that future adapter does not guard this current
promotion. Existing positive tests intentionally assert the unsafe promotion.

Required correction: keep unestablished independence explicitly unknown/blocked in
the pure slice. Retain independently visible evidence as an observation without
certifying its dependency closure. Only derive supported independence from an
actually defined, validated owning policy/publication contract if separately in
scope; no new interpretation engine or capability callback is needed for the
conservative correction. Replace the promotion expectations with negative tests.

Impact is bounded: aggregate barrier remains `PENDING` in the reproduction;
preparation and domain admission remain `NOT_AUTHORIZED`, and mature actionable
attention remains false. No business action or publication bypass was observed.
These denials prevent escalation but do not make the semantic label truthful.

### R2 — LOW: strict raw schema silently discards hidden and symbol unknown keys

Location: `src/domain/capture/batchAssessment.ts:256` and the strict-object schemas.

Both of these raw requests are accepted using the fixture's unchanged digest:

```ts
Object.defineProperty(request, "authorize", { value: true });
Object.assign(request, { [Symbol("authorize")]: true });
```

Zod strict objects reject enumerable string extras but do not reject these own
keys. Parsing removes them before canonical hashing, so the implementation's
unqualified strict unknown-field rejection claim is broader than its actual raw
object contract. This is a schema-boundary defect, not an observed grant of
authority: both accepted results still deny domain admission.

Required correction: reject unsupported own keys/descriptors at the raw boundary,
including nested objects, before parsing, using an existing suitable validator if
available. Retain the plain data contract and add hidden/symbol negative cases.
Do not silently canonicalize unsupported raw fields away while claiming their
rejection. No broad object-security framework is requested.

## Requirement-by-requirement assessment

| Focus                                      | Independent result                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch/Job/Input identity and frozen roster | Separate Batch/Job enforced; roster IDs/replay keys unique, ordinals exact, current and observed coverage complete. Same-roster continuation references reject. Historical lineage validation remains an explicit custody-owner prerequisite.                                                                                                                 |
| Manifest/snapshot/current pins             | Distinct versioned digest namespaces, canonical key sorting, manifest/assessment/Input revision equality, Account/Batch/Job equality and digest checks pass. These are supplied-pin consistency checks, not independent repository freshness proof.                                                                                                           |
| Truthful coverage                          | Acquisition failure/pending/unknown remain separate from accepted processing failure/unsupported/deferred/pending/unknown. All declared entries remain visible; inconsistent dispositions reject. Known failures can be accounted read-only without implying understanding.                                                                                   |
| Dependency barriers and independence       | `UNKNOWN` and failed dependent material block findings; operational uncertainty preserves aggregate `PENDING`. R1 prevents approval of asserted independence. No partial admission exists.                                                                                                                                                                    |
| Run/Input/candidate/locator integrity      | Duplicate Run Input ownership, inconsistent Run generation/hash, foreign Account/Batch, wrong candidate Run/digest, unmapped or non-understood evidence and invalid spans reject. Candidate identity pin contradictions reject. Publication membership and original byte custody are unavailable to this pure contract and must remain adapter prerequisites. |
| Human decisions                            | Supplied receipts/history are cloned and frozen; matching answers suppress repeated questions; changed proposal for the same Candidate produces `HUMAN_DECISION_CONFLICT`. No decision writer exists. Cross-Candidate semantic issue linkage and durable history acquisition are not implemented or certified.                                                |
| Closed authority                           | Preparation/admission always denied; mature actionable attention always false. No publication, scheduler, runtime caller, provider or domain writer was added.                                                                                                                                                                                                |
| Determinism and async mutation             | Canonical hashes and repeat outputs pass; coverage follows roster order and findings/decisions stable identity order. Array order intentionally remains part of the exact wire digest. Caller mutation during either hash await cannot transplant parsed output. R2 limits the strict raw-schema claim.                                                       |
| Account and stale/security cases           | Supplied foreign Account/current revision cases reject, including separate A→B→A invocations. The pure function has no current Account-generation lookup; actual callback invalidation/disclosure across an asynchronous Account transition requires the later owning gate and is not proven by this fixture test.                                            |
| Foundation preservation                    | All existing executable source, CP13A/B, SQLite49/50, migration registry, `sync_operations` owners and five unconditional C denials are preserved byte-for-byte. Dedicated sync tests confirm the denials.                                                                                                                                                    |

## Reproduced validation

| Check                                                                       | Result                                                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Builder's exact focused command, three files                                | **88 PASS**: 64 C4a + 24 existing Capture/CP13B tests                                                                   |
| Existing `src/data/sync/syncEngine.test.ts`                                 | **24 PASS**, including all five C denials with permissive scheduler filter                                              |
| Reviewer negative/mutation script                                           | **16 checks completed**: 12 rejection checks, one second-await mutation check, R1 reproduction and two R2 reproductions |
| `npm run typecheck`                                                         | PASS                                                                                                                    |
| `npm run lint`, including `npm run ui:guard`                                | PASS; 78 representative UI files checked                                                                                |
| Prettier, all five delivered files and this report                          | PASS                                                                                                                    |
| `git diff --check` and separate delivered/new-report line whitespace checks | PASS                                                                                                                    |
| Exact-base tracked-file content verification                                | 1,186 tracked files checked; only the Builder's documented current-state handoff differs                                |
| Five delivered SHA-256 fingerprints before/after review                     | Identical; original implementation, tests, fixture, handoff and Builder report preserved                                |

Commands:

```sh
npm run test -- --configLoader runner --cache=false \
  src/domain/capture/batchAssessment.test.ts \
  src/domain/capture/localCapture.test.ts \
  src/domain/trip/flightImportReview.test.ts
npm run test -- --configLoader runner --cache=false src/data/sync/syncEngine.test.ts
node --import tsx /private/tmp/otr-c4a-independent-negative.mts
npm run typecheck
npm run lint
```

The runnable reviewer script remains outside the implementation worktree at
`/private/tmp/otr-c4a-independent-negative.mts`. Its successful exit means the
rejection/mutation assertions passed **and the two reported defects reproduced**;
it does not mean those defects are fixed. Delivered fingerprints are retained at
`/private/tmp/otr-c4a-independent-delivered-before.json`.

Initial test startup failed because this worktree had no `node_modules`. A temporary
link reused `/Users/xoery/Project/otr-mobile/node_modules`; supported config runner
and disabled cache avoided dependency writes. The link was removed after validation.
No dependency/configuration change was delivered. No full-suite, SQL deployment,
integrated C2/C4, device or runtime Account-generation acceptance is claimed.

## Preservation and stop

SQLite remains 1–50, with unchanged 49/50 files and registry. All 84 server migration
SQL files are unchanged. Existing tracked source content was checked against exact
Git blob identities, covering CP13A/B and sync implementation. The five denials are
`C_PREPARE_CONFIRMATION`, `C_EXECUTE_EVENT_SLOT`, `C_FINALIZE_EVENT_SLOT`,
`C_ADMIT_CAPTURE_SOURCE`, and `C_REVOKE_EVENT_SLOT`.

The only delivered reviewer change is this report. No implementation, original
Builder report, handoff, migration, active C2/R3/P4 worktree or canonical checkout
was modified. Concurrent worktree byte stability is not claimed. No commit, push,
Hosted access, provider call, activation or agent-to-agent request occurred.

Final readiness requires R1/R2 correction, focused negative regression checks and
verification against the actual joint C4a constraints. Integrated durable C4/C5
remains separately gated.

**STOP — C4a INDEPENDENT REVIEW COMPLETE.**

## TARGETED R1–R2 RECHECK — 2026-10-08

Role: Independent Reviewer. **Targeted verdict: PASS.** This section supersedes
the original review's open R1/R2 findings and readiness status for the corrected
pure C4a slice. All original review text above remains historical and unchanged.

- **R1 FIX VERIFIED: YES.**
- **R2 FIX VERIFIED: YES.**
- **Capture joint constraints verified: YES, within pure C4a scope and the evidence limits below.**
- **Remaining CRITICAL / IMPORTANT / required LOW findings: 0 / 0 / 0.**
- **New regressions: NO in the inspected delta and executed checks.**
- **Ready for Final Owner Review: YES for corrected pure C4a only.**

### Original findings independently reproduced

The original production module was reconstructed in an isolated reviewer fixture
from the corrected module by reversing only the R1/R2 edits. Its SHA-256 exactly
matches the previously reviewed module:
`52b38ca761f41d56732be4fa9b18c0727ccff2ac92d6c990d666373ff6e2af60`.
The production implementation was never replaced or edited.

Running a separate copy of the unchanged original reviewer script against that
exact-byte fixture completed all 16 checks and reproduced R1's unsupported semantic
promotion and R2's acceptance of hidden/symbol keys. The original script remains
unchanged. Reproduction command:

```sh
node --import tsx /private/tmp/otr-c4a-targeted-original-reproduction.mts
```

### R1 correction verified

At `src/domain/capture/batchAssessment.ts:425`, every supplied relation other than
`DEPENDS_ON` adds `DEPENDENCY_UNKNOWN`. Valid locators remain necessary structural
evidence but cannot establish independence. The original UNKNOWN→INDEPENDENT
substitution now preserves `BLOCKED`, `UNAVAILABLE`, observed evidence and aggregate
`PENDING`. Even understood material cannot certify a caller's independence claim.

Independent cases cover failed/pending/unknown acquisition and accepted
failed/unsupported/deferred/pending/unknown/understood processing. Each case retains
the complete two-Input coverage, observed evidence and unchanged human-decision
receipt; a contradictory proposal retains `HUMAN_DECISION_CONFLICT` alongside
`DEPENDENCY_UNKNOWN`. Operational pending/unknown responsibilities remain explicit.
Fully understood, explicit `DEPENDS_ON` fixtures still support provisional read-only
Review. Preparation and admission remain `NOT_AUTHORIZED`; mature actionable
attention remains false. No partial admission, publication or scheduling was added.

### R2 correction verified

At `src/domain/capture/batchAssessment.ts:258`, a primitive-string check rejects
raw objects before any property inspection or coercion. Hidden/symbol fields,
accessors, classes, custom/null prototypes, arrays, transparent/trapping/revoked
Proxies and boxed strings cannot enter through an object path. Independent trapping
Proxy and nested getter probes execute zero traps/getters and zero hash calls.

The unchanged `parseEventJson` parser now handles the wire boundary before strict
schema validation and hashing. Duplicate keys, including escaped equivalent key
spellings and nested duplicates, reject. Nested unknown fields/prototype-shaped
keys, invalid shapes/values, unsafe numbers, noncanonical fractional/exponent/negative
zero spellings, invalid strings, trailing data, invalid whitespace, excessive depth
and oversized UTF-8 input reject without hashing. The raw and canonical 1 MiB bounds
remain enforced. Bounded valid serialized fixtures pass, including reordered object
keys and harmless whitespace, with unchanged manifest/snapshot digest semantics.

JSON text is intentionally the production contract. This does not inspect or certify
an object that an external caller serialized earlier; future adapters remain
responsible for trustworthy owned data, original custody, current authorization and
publication membership. No such adapter was introduced here.

### Joint Capture constraints and evidence limits

Reviewed the P2/C4 Semantic Preflight, accepted Capture Flow 1–7 and the five current
Owner constraints recorded in the Builder's correction addendum, consistent with
this recheck request:

1. Complete truthful coverage: every declaration remains accounted; acquisition
   failure is distinct from accepted processing failure/unsupported/deferred.
2. Dependency-aware UNKNOWN blocking: unproven independence cannot clear barriers;
   read-only observations imply no partial admission.
3. Exact identity and immutable binding: Account/Batch/Job, frozen roster, manifest
   and snapshot digests, assessment/Input revisions and Run/Input associations retain
   their existing validation. Foreign/stale/duplicate negative cases pass.
4. Provisional-only Review: supported semantic questions remain read-only; answered
   decisions suppress repeat questions, contradictions preserve explicit conflicts,
   and all business/attention authority stays denied.
5. Local-first continuity boundary: no timers, Retry ritual, network/Hosted dependency,
   intake cancellation, Job lifecycle mutation or new runtime composition was added.

The prior unavailable-constraints statement describes the original review's evidence
at that time. The current constraints are evaluated as the current acceptance basis;
no historical joint-review artifact is fabricated. Hide/Reopen durability, actual
Account-generation callback fencing, C2 integration, original-byte custody and
authoritative publication membership are not executable features of this pure slice
and are not newly certified. Their owning integration gates remain effective.

### Reproduced checks and preservation

| Check                                                | Result                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| C4a, existing Capture, CP13B Review and sync tests   | **4 files / 135 PASS**: 87 + 16 + 8 + 24                                                                            |
| Inspected and rerun Builder targeted script          | **16 checks PASS**; labels saying “Independent” in that script do not change its Builder provenance                 |
| Additional reviewer-owned targeted script            | **25 checks PASS**: 9 dependency/decision cases, 15 wire/object negatives and 1 valid wire-order case               |
| Typecheck                                            | PASS                                                                                                                |
| Full lint including UI guard                         | PASS; 78 representative UI files checked                                                                            |
| Formatting and whitespace                            | PASS; original review formatting left unchanged                                                                     |
| Exact-base tracked content                           | **1,186 files checked**; only documented current-state handoff differs                                              |
| Corrected delivered-file fingerprints during recheck | All five unchanged                                                                                                  |
| Original Independent Review preservation             | Original prefix identical byte-for-byte; SHA-256 `5e268bc64440e3a4ba2898e4691f34aa3884d3bb2b5dd86787b2eee1f1e53730` |

```sh
npm run test -- --configLoader runner --cache=false \
  src/domain/capture/batchAssessment.test.ts \
  src/domain/capture/localCapture.test.ts \
  src/domain/trip/flightImportReview.test.ts \
  src/data/sync/syncEngine.test.ts
node --import tsx /private/tmp/otr-c4a-r1-r2-targeted-recheck.mts
node --import tsx /private/tmp/otr-c4a-targeted-independent-recheck.mts
npm run typecheck
npm run lint
```

SQLite1–50, SQLite49/50 files/registry, all 84 server migration SQL files,
CP13A/B, `sync_operations` and all five unconditional C denials remain identical
to the exact base. The sync suite explicitly exercises those denials.
Worktree HEAD remains `b6daffecedab1616b173fde3f5e2de5d54770eff`; external main
advancement was not incorporated. No full-suite, SQL deployment, device or
integrated runtime acceptance is claimed.

Only this section was appended by the reviewer. Production implementation, tests,
fixture, Builder report, handoff, migrations and active C2/R3/P4 worktrees were not
modified. Temporary dependency reuse was removed after checks. No C2 integration,
SQLite52/Server85, Hosted access, provider call, activation, commit or push occurred.

**STOP — P2/C4a TARGETED INDEPENDENT RECHECK COMPLETE.**
