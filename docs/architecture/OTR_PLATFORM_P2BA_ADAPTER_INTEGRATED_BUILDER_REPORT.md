# P2b-A integrated Adapter Builder report

Date: 2026-10-09 (Pacific/Auckland). Status: **INDEPENDENT REVIEW REQUIRED**.
Ready for Independent Review: **YES**. This is Builder evidence, not acceptance.

## Source gate and authority

- Local main, origin/main and remote main were verified at exactly
  `7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`. The fresh managed worktree is
  `/Users/xoery/.codex/worktrees/p2ba-integrated-adapter/otr-mobile-canonical`.
- Canonical registry contains accepted SQLite51 C2, SQLite52 observations and
  SQLite53 Membership. Their migrations, registry and owning implementations
  are unchanged. No schema or migration is introduced.
- Historical Adapter Builder, Independent Review and the F1–F4 blocker appendix
  were read in `/Users/xoery/.codex/worktrees/p2ba-c2-c4a-adapter/otr-mobile-canonical`.
  Historical implementation was input only. Its original absence-of-Candidate-roster
  blocker is now addressed by accepted complete Membership authority.
- Accepted Publication Membership Builder and appended F1–F3 recheck, SQLite53
  Builder, replacement-retention recheck, Owner acceptance in the current-state
  handoff and canonical integration preflight were read. Their bytes are preserved.

## Exact changed files

1. `src/data/repositories/captureBatchAssessmentAdapter.ts` — new dormant read-only
   adapter, using existing transaction-local C2/Import/Membership/Capture stores.
2. `src/data/repositories/captureBatchAssessmentAdapter.test.ts` — real SQLite1–53
   fixtures and 38 focused tests; CLOSED RPC injection is explicitly TEST-ONLY.
3. `docs/architecture/OTR_PLATFORM_P2BA_ADAPTER_INTEGRATED_BUILDER_REPORT.md` — this report.
4. `docs/CURRENT_IMPLEMENTATION_STATE.md` — short current checkpoint, preserving history.

No callers, runtime composition, exports, dependencies or configuration are changed.

## F1–F4 correction evidence

| Finding                 | Owning validation and correction                                                                                                                                                                                                                                                                                                                                                 | Negative/positive evidence                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 complete publication | `PublicationMembershipTransactionStore.read` authenticates retained complete Input/Candidate membership, Run identity/generation/scope, proposal hashes and canonical `flightRunInputDigest` with Representation descriptors. Run discovery uses declared Source scope, not surviving Input rows. All Run Inputs, including unreferenced siblings, are mapped to C2 occurrences. | Missing/extra/PENDING Candidate or Input, all Inputs deleted, substituted proposal/Input, false Run digest, changed generation, foreign Candidate Run scope and lost Membership are rejected. Valid two-Candidate/two-Input baseline succeeds before each mutation. |
| F2 current Capture      | Existing `readCaptureSupport` and CP11 Source binding store validate current ASSIGNED Capture, Trip, exact current revision, payload/hash/size and Original roots. C2 acceptance-time revision remains separate.                                                                                                                                                                 | Later unassignment, stale binding after legitimate reassign, future binding revision, material substitution and revoked Trip are rejected. Acceptance revision1 remains1 while current admitted assignment is2.                                                     |
| F3 final coherence      | Initial owning observation is sealed outside the final gate. One final Account-gated serialized SQLite transaction reloads the entire C2/Capture/Trip/Source/Representation/Run/Input/Candidate read set and compares it exactly. Only transaction-local stores run inside it; Account generation is asserted synchronously after COMMIT while the gate remains held.            | Late C2 revision, Capture unassignment, Trip revocation, Source revision, Representation revision, Run state, earlier Candidate mutation with a later member retained, and Account A→B→A all reject. Real SQLite transaction fixtures assert no nested transaction. |
| F4 derived ancestry     | Accepted Membership ancestry resolves complete same-Source retained DAGs. The single-Capture support seam requires one distinct Original root. Separate returned provenance retains Original and selected Representation IDs, hashes and byte counts without extending C4a schemas.                                                                                              | Simple derived and convergent diamond DAGs succeed with distinct bytes and IDs. Missing/foreign ancestors are denied before trusted installation; multiple distinct Original roots reject at the Adapter support seam. No derivation runs.                          |

Certain damaged-storage tests explicitly disable guards/FK in disposable fixtures to
exercise read validation. Production SQLite53/CP11 guards independently forbid those
identity mutations; no production guard or owning implementation was changed.

## Preserved semantics and limits

- Whole C2 reopen and immutable occurrence roster are reused. Exact request/manifest
  C2 digest bytes are preserved; C4a Context uses approved `otr-capture-context-v1`
  and Manifest uses its existing separate digest domain.
- Failed, pending and uncertain-commit occurrences remain present. Accepted intake
  without admitted publication stays UNKNOWN; equal bytes never establish shared
  occurrence identity, understanding or independence.
- Candidate locators and full publication pins come from the owning read. Unproven
  sibling dependencies remain UNKNOWN/BLOCKED and preparation remains NOT_AUTHORIZED.
- 64 C2 Inputs are retained;65 rejects the whole Job before publication discovery.
  Existing C4a schema/assessment bounds reject excess bindings/findings/serialization
  as a whole. No truncation, splitting or partial assessment fallback exists.
- `assessmentRevision=1` is invocation-local. Durable allocation remains SQLite52-owned;
  this adapter writes no assessment, publication, command or business record.

## Actual validation

- Preserved independent reproduction harness:
  `/private/tmp/p2ba-independent-negative.test.ts`, with
  `/private/tmp/p2ba-review.vitest.config.mts`: **12/12 PASS** on historical code.
  These assertions reproduce original defects; they are not correction acceptance.
- Final integrated focused suite: **38/38 PASS**.
- Final affected matrix: **20 files /777 tests PASS**. It includes all Capture domain
  C2/C4a/SQLite52 observation tests, C2 reopen, local Capture, SQLite53 Membership and
  migration tests, Import admission/Source/CP11, Flight integration/closure,
  Continuation, Account request/switch/local state, database/serialized transactions.
  Exact runner file list and final output are retained in
  `/private/tmp/p2ba-integrated-matrix.log`.
- Typecheck, lint including UI guard, Backend build, changed-file formatting and
  whitespace/preservation checks: **PASS**. No full-suite claim.
- Full `npm run format` was run: **baseline failure in28 unchanged canonical files**.
  Every reported file matches verified base bytes. All four changed files pass;
  accepted historical documents and unrelated source formatting were preserved.

## Transport limitation and disposition

Authenticated production Publication Transport remains CLOSED/unavailable. The Adapter
only consumes already installed, owning-validated SQLite53 envelopes; it never creates
trusted handles from local rows or installs Membership itself. Historical NULL and
missing Transport fail closed; copied/fabricated handles are rejected by the owning
installer in tests. A Job with no publication evidence remains UNKNOWN, not understood.

No production composition, runtime activation, provider/remote AI, worker/scheduler,
C5/C9 admission, business writer, Hosted/device operation, commit, push or merge occurred.
Temporary dependency links and Backend build output were removed after validation.
Next step: independent review of these four paths and the final owning-data boundary.

**STOP — P2b-A INTEGRATED ADAPTER BUILDER / INDEPENDENT REVIEW REQUIRED.**

## R1 targeted test correction — INDEPENDENT RECHECK REQUESTED

Date: 2026-10-09 (Pacific/Auckland). Independent Review verdict:
PASS WITH REQUIRED CORRECTIONS. This appendix corrects the earlier delivered
late-C2 evidence claim; it does not change the independent review or claim acceptance.

The former generic F3 C2 case attempted to revise an ACCEPTED occurrence after its
Capture assignment. Real SQLite51 binding/immutability guards rejected that fixture
mutation before the final observation. A generic exception assertion was insufficient.

Only R1 is corrected in `captureBatchAssessmentAdapter.test.ts`. Its dedicated
regression uses public C2 submission to create two retained occurrences: one accepted
and supported by genuine TEST-ONLY owning Publication installation, and one PENDING
sibling. Between the initial and final observations the sibling legally advances from
PENDING/REACQUIRE revision2 to PENDING/RECOVER_COMMIT revision3. All real guards remain
installed and foreign keys remain ON. No production code or admission change was needed.

The permanent regression independently asserts:

1. Exactly one row was changed and the retained sibling is PENDING/RECOVER_COMMIT at3.
2. Exactly two assessment transactions ran, and the whole-C2 owning roster query ran
   twice, demonstrating that the final serialized Account-gated observation was reached.
3. The result rejects with exactly `new Error("C4A_STALE_REVISION")`; a setup/guard
   failure cannot satisfy this assertion or the successful-mutation/final-read assertions.

Actual validation:

- Corrected targeted test:1 PASS,37 intentionally excluded by the test-name filter.
- Affected Builder matrix:20 files /777 PASS, including all38 Adapter tests.
- Review matrix's additional sync dispatch file:1 file /24 PASS; combined affected
  coverage is21 files /801 PASS with no skips in either regression run.
- Typecheck, changed-test ESLint and changed-file formatting PASS.
- Preservation: all recorded paths except the corrected test and this appended report
  remain byte-identical to the pre-correction snapshot. Production Adapter, SQLite51
  immutability/binding guards, registry1–53, owning admission and Independent Review
  are unchanged. Original Builder report remains an exact prefix.
- Logs: `/private/tmp/p2ba-r1-focused.log`, `p2ba-r1-matrix.log`, `p2ba-r1-sync.log`,
  `p2ba-r1-typecheck.log`, `p2ba-r1-lint.log`, `p2ba-r1-format.log` and
  `p2ba-r1-preservation.json` in the same temporary directory.

Requested next step: targeted independent R1 recheck of the permanent regression's
successful legal mutation, final transaction/reload evidence and exact stale error.
Full suite, Backend build and UI checks were not repeated for this test-only correction.
No commit, merge, push or Transport/Integrated C4 activation occurred.

**STOP — P2b-A R1 CORRECTION COMPLETE / TARGETED INDEPENDENT RECHECK AND OWNER REVIEW REQUIRED.**
