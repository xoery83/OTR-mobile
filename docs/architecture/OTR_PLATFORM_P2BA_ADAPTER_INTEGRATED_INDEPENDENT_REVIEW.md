# P2b-A integrated Adapter independent review

Date: 2026-10-09 (Pacific/Auckland). Role: Independent Reviewer.

**Verdict: PASS WITH REQUIRED CORRECTIONS.**
**Findings: CRITICAL 0 / IMPORTANT 1 / MINOR 0.**
**Ready for Final Owner Acceptance: NO — correct R1's delivered test and recheck.**
**New regressions: NO production regression identified in the reviewed scope and executed matrix.**

What this change does: The dormant adapter reads complete retained C2 intake and
owning-validated SQLite53 publication evidence to build a memory-only C4a
assessment. It checks current Capture support and repeats the complete observation
in one final Account-gated transaction. The implementation fixes original F1–F4;
one delivered freshness test gives false-positive evidence and needs correction.

## Scope, source and preservation

Reviewed the specified worktree:
`/Users/xoery/.codex/worktrees/p2ba-integrated-adapter/otr-mobile-canonical`.
HEAD, local main and cached origin/main exactly equal the authorized base
`7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`. No remote freshness is claimed;
no fetch, Hosted request or device operation was performed.

The initial delivery has exactly four paths:

1. `src/data/repositories/captureBatchAssessmentAdapter.ts`.
2. `src/data/repositories/captureBatchAssessmentAdapter.test.ts`.
3. `docs/architecture/OTR_PLATFORM_P2BA_ADAPTER_INTEGRATED_BUILDER_REPORT.md`.
4. `docs/CURRENT_IMPLEMENTATION_STATE.md`.

Compared all 1,271 tracked paths with exact HEAD blobs. Only the declared
current-state handoff differs; the other three delivery paths are new. All existing
production code, tests, configuration, migrations, accepted contracts, original
reports and reviews remain exact base content. Builder fingerprints are retained
in `preservation-before.json` and checked again at delivery. This reviewer adds
only this new report to the worktree and does not update the Builder handoff.

Execution used a byte-matching disposable source snapshot in `/private/tmp/`, with
existing installed dependencies reused by symlink. Reviewer probes and generated
Backend output stay outside the worktree. No Builder implementation or test was
edited. This review was conducted in the independently authorized review chat;
continuity with the historical reviewer session is not claimed.

Acceptance inputs inspected: current integrated Builder report; historical P2b-A
Builder, original Independent Review and F1–F4 blocker appendix in
`p2ba-c2-c4a-adapter`; accepted Publication Membership implementation, review and
appended F1–F3 recheck; SQLite53 Builder/review, replacement-retention recheck and
canonical integration evidence; accepted C2/C4a reviews, current owning code and
Account contract; corrected P2b-B persistence contract. Historical pending labels
are interpreted through the accepted later rechecks and current handoff.

## IMPORTANT — required correction

### R1 — Delivered late-C2 test passes before reaching the final freshness gate

Location: `src/data/repositories/captureBatchAssessmentAdapter.test.ts:544`,
`:547`, `:570`; fixture setup at `:535`.

**What this is:** The parameterized F3 test claims to change C2 between initial
observation and final admission. It creates an ACCEPTED Input, assigns its Capture
and admits Source/publication support, then changes that accepted Input's revision.

**Problem:** SQLite51 rejects this UPDATE. In the actual fixture the acceptance
binding trigger raises `CAPTURE_SUBMISSION_BINDING`, because the Capture is now
assigned; the immutable-accepted-Input guard also forbids the proposed update.
The exception escapes the injected hash callback. The generic
`rejects.toThrow()` therefore passes even if no final C2 comparison runs.

**Independent reproduction:** Repeated the exact mutation after a valid supported
baseline. The result is `CAPTURE_SUBMISSION_BINDING`, and the transaction spy
records exactly **one** assessment transaction. The final observation transaction
was never entered. This is a delivered test defect, not a demonstrated production
freshness defect.

**Smallest fix:** Replace this case with a retained PENDING C2 occurrence and a
legal revision advance between observations, preferably alongside supported
publication for another accepted occurrence. Assert that the mutation succeeds,
that the final transaction is reached, and that assessment fails specifically
with `C4A_STALE_REVISION`. Alternatively, explicitly label privileged corruption,
disable only its blocking test guards and assert successful injection before
checking the adapter. Do not weaken SQLite51 or production admission.

**If skipped:** This test can remain green when the final C2 revision comparison
is removed or broken. The Builder report's claimed late-C2 evidence remains
misleading. Reviewer-only probes do not replace a permanent delivered regression.

An independently authored legal PENDING→RECOVER_COMMIT/revision advance **does**
reach the second transaction and reject with `C4A_STALE_REVISION`; fresh readback
shows UNKNOWN acquisition. Thus original F3's implementation fix is verified,
while R1 remains required for the delivered validation.

## Original F1–F4 disposition

| Original finding        | FIX VERIFIED | Independent evidence on corrected implementation                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 complete publication | **YES**      | Valid two-Input/two-Candidate publication first succeeds; false Run digest, missing unreferenced Input, PENDING Candidate sibling and deleted unreferenced Candidate reject. Complete roster, canonical Input digest, Source scope, generation and proposal hashes are owning-validated.                                  |
| F2 current Capture      | **YES**      | Valid assigned revision2 support succeeds; legitimate unassignment and fabricated maximum-safe future revision deny support. Accepted C2 revision1 remains immutable and distinct from current assignment.                                                                                                                |
| F3 final coherence      | **YES**      | Original late Trip/Source/Run scenarios reject. Additional Input, Membership, binding, original bytes, Representation retention, reassignment, C2 roster and legal pending-revision changes reject. Account A→B→A denies old invocation; fresh A remains authorized. Delivered test correction R1 is separately required. |
| F4 derived ancestry     | **YES**      | Different Original/derived hashes, byte counts and IDs remain separate; valid simple and convergent diamond ancestry succeeds. Multiple distinct Original roots reject at single-Capture support. Delivered missing/foreign-parent negatives and accepted owning ancestry regressions pass.                               |

The preserved historical reviewer harness has unchanged SHA-256
`99c9f1bd247293e62d8cdee331af41b562691595e9b9f0c9221e87d07405c10d`.
It was independently rerun against a disposable copy of historical source:
**12/12 PASS**, reproducing defects rather than accepting them. The corrected
factory has a different owning-store signature; new reviewer probes reproduce
those scenarios through actual SQLite51–53 installation/current-support seams.
No old raw-row fixture is treated as authenticated current Membership.

## Requirements and owning-data authority

| Review requirement                          | Result                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four-file delivery/base/runtime absence     | PASS. Exact base and scope; only test callers. No factory/export registration, app/Backend composition or activation.                                                                                                                                                                                                |
| Complete Run Input and Candidate membership | PASS. Discovery uses declared Run Source scope, so deletion of all Input rows cannot hide a discovered Run. Owning read checks all scoped siblings before filtering; deleted, extra, PENDING or substituted members reject. Unreferenced Inputs are mapped to exact C2 occurrences.                                  |
| Run scope/generation/digests/envelope       | PASS. Reuses accepted Membership projection, `flightRunInputDigest`, full Representation descriptors, canonical envelope and proposal hashes. Scope digest damage rejects; no local substitute certificate.                                                                                                          |
| Current Capture/material/Trip               | PASS. Owning `readCaptureSupport` verifies current Account/Trip access, ASSIGNED state, exact Capture revision, payload identity/bytes/hash/size, binding and Original ancestry. Source lifecycle/current material/pins are independently checked by Import store. Trip prior grants no authority.                   |
| Immutable versus current facts              | PASS. C2 acceptance facts remain in acquisition; current Capture evidence is separately checked and compared. Revision1 intake is not rewritten to assigned revision2.                                                                                                                                               |
| Final transaction coherence                 | PASS implementation; R1 required in delivered tests. Full observation is sealed outside the gate and reloaded/computed identically inside one serialized final transaction. Changed C2/bindings/publications/support/catalog observations reject whole.                                                              |
| Transactions/network/Account                | PASS. Transaction-local stores open no nested transaction. No RPC, native material reader, credential refresh or provider call occurs in final admission; injected dependencies must retain their existing local Account/hash contracts. Synchronous generation assertion follows COMMIT while Account gate is held. |
| Competing legitimate writer                 | PASS independent interleaving. Scoped Trip revocation queues behind final admission; the admitted observation succeeds at its transaction boundary, then subsequent assessment denies revoked access. A pending Account transition during final COMMIT rejects disclosure; fresh A after return remains supported.   |
| Original/derived DAG                        | PASS. Original/selected provenance is separate. A convergent DAG with one distinct root supports; distinct Original roots cannot be reduced to a chosen subset. Missing/foreign ancestry denies installation.                                                                                                        |
| UNKNOWN/independence                        | PASS. Complete unknown/failed/pending occurrences remain. Unreferenced material stays UNKNOWN; every unevidenced occurrence contributes UNKNOWN dependency, blocking the finding. No independence is inferred from duplicate bytes or absent locators.                                                               |
| Complete roster and bounds                  | PASS. 64 occurrences retained;65 denied whole before publication discovery. Independent two-Trip controls admit exactly64 aggregate bindings and reject65;65 aggregate findings and oversized valid retained evidence reject without truncation.                                                                     |
| Distinct digest domains                     | PASS. Exact C2 request/declaration digests remain separate from approved Context and C4a Manifest/Snapshot digests. No stored context or C2 hashes are normalized/replaced.                                                                                                                                          |
| Invocation revision/SQLite52                | PASS. Repeated memory-only invocation remains revision1. Supported and unavailable observations perform zero SQL writes; independent check confirms zero SQLite52 rows and unchanged `total_changes()`.                                                                                                              |
| Historical NULL/Transport/trust             | PASS. Historical NULL remains unavailable despite valid local catalog rows. Missing CLOSED transport fails unavailable. Fabricated and copied trusted handles deny installation; copied-handle check confirms zero writes. Adapter never installs Membership.                                                        |
| Test integrity and races                    | R1 REQUIRED. No existing test assertion was weakened; new fixtures establish real Capture assignment and owning installation. Several generic rejection assertions need careful interpretation; successful-mutation checks and specific-error independent probes cover suspected gaps.                               |
| C5/C9/provider/scheduler/worker             | PASS. No new authority, business write, queue, default runtime wiring, timer, provider or scheduler. Preparation/domainAdmission remain NOT_AUTHORIZED; mature actionable attention remains false.                                                                                                                   |

The independent second-occurrence sibling test establishes a complete shared Run
with two distinct Sources/Captures: its unreferenced Input retains a binding but
stays UNKNOWN, its dependency blocks the finding, and a later registration change
on that sibling denies the whole assessment. Equal original bytes do not merge
those occurrences.

Transaction coherence is under the accepted scoped-repository convention.
Connection-level transaction activity cannot exclude arbitrary unscoped statements
on the same SQLite connection. No native multi-connection/global-lock guarantee is
claimed. Current Trip read authority is the accepted cached actor-admission check,
not a live server permission refresh.

## Independently executed validation

| Check                                                            | Actual result                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Delivered focused Adapter tests                                  | **1 file /38 PASS**; R1 explains one false-positive assertion despite green suite.    |
| Affected local regression matrix                                 | **21 files /801 PASS**, zero failures/skips.                                          |
| Unchanged historical negative/boundary harness                   | **12/12 PASS**, defect reproduction on historical source.                             |
| New independent corrected-authority/race/limit/test-audit probes | **34/34 PASS**, including R1 characterization and legal C2 revision-change rejection. |
| Typecheck                                                        | PASS on exact delivery snapshot before adding reviewer-only tests.                    |
| Full lint/UI guard                                               | PASS;80 representative UI files,473 retained legacy occurrences.                      |
| Backend build                                                    | PASS; compilation only, no server started.                                            |
| All four Builder files' Prettier                                 | PASS.                                                                                 |
| Report formatting, worktree whitespace and preservation          | PASS.                                                                                 |

The21-file matrix comprises the Builder's20-file777-test matrix plus
`src/data/sync/syncEngine.test.ts` (24 tests). It covers C2/C4a, SQLite52
observations, real SQLite53 migration/Membership and replacement guards, Import
and Source admission (within Import tests), CP11 originals, Flight, Continuation,
Account request/switch/local state, database/serialization, and five unconditional
C dispatch denials. No full-suite or full-formatting PASS is claimed.

Evidence root: `/private/tmp/p2ba-integrated-independent-review/`.
Logs: `focused.log`, `regressions.log`, `historical.log`, `independent.log`,
`typecheck.log`, `lint.log`, `backend-build.log`, `format.log`.
`preservation-before.json` and `preservation-after.json` retain exact source checks.
Runnable reviewer source is
`snapshot/src/data/repositories/independentIntegrated.test.ts`.
Historical source/harness execution is under `historical/`.

Reproduce the independent probes from `snapshot/`:

```sh
./node_modules/.bin/vitest run src/data/repositories/independentIntegrated.test.ts \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism \
  --reporter=verbose
```

Reviewer-only initial setup errors were corrected before the final34-case run:
Input has no row_revision column; binding state/revision must meet its real guard;
Capture revision changes must use valid assignment transitions; proposal digests
must be valid before resource testing; Source freshness fails as INPUT_STALE;
the exact R1 fixture raises the binding guard before immutable-Input rejection.
Late corruption probes now assert injection completion, preventing setup exceptions
from counting as freshness rejection. No Builder assertion/fixture was changed.

## Remaining gates and final disposition

1. **R1 test correction and targeted independent recheck**, then Final Owner
   Acceptance of this dormant Adapter. No implementation correction is presently
   required by this review.
2. **Authenticated Publication Transport remains CLOSED.** Current principal/
   session, bounded complete network projection and trusted installation require
   separately authorized implementation and review. Test-only CLOSED RPC proves
   no live transport or server completeness.
3. **Integrated C4 remains CLOSED.** SQLite52 NEW append must revalidate the entire
   current owning read set in its own final Account-gated transaction, allocate
   head+1 using revision+digest CAS, and seal that proposed revision before hashes.
   This invocation-local revision1 result must not be reused as durable allocation.
   Historical replay, ACK recovery, Continuation callbacks and runtime composition
   require their separate accepted integration.
4. Native Expo SQLite concurrency/restart/old-new binary/device interruption and
   hardware faults remain separately gated. Node SQLite tests do not certify them.
   C5/C9, providers and runtime/business-write authority remain CLOSED.

No Hosted DEV/Production, devices, provider calls, runtime activation, commits,
pushes, merges or rebases occurred. Builder implementation/migrations/original
reports/accepted contracts remain unchanged. Only this report is delivered.

Not checked: full suite/global formatting, native devices/binaries, hardware faults
or live authenticated Transport. Required risk: R1's delivered false-positive
freshness test must be corrected before final acceptance.

**STOP — P2b-A INTEGRATED ADAPTER INDEPENDENT REVIEW COMPLETE.**

## Targeted R1 Recheck — 2026-10-09

Performed by the original integrated Adapter Independent Reviewer in this review
chat under the Owner's narrowly scoped targeted authorization. The original review
above, including R1 and its historical readiness status, is preserved byte-for-byte.
This appendix supersedes only that unresolved R1 and final readiness status.

**Verdict: R1 TARGETED RECHECK PASS.**

- **R1 CLOSED: YES.**
- **Original F1–F4 remain individually FIX VERIFIED: YES.**
- **Remaining CRITICAL / IMPORTANT / MINOR: 0 /0 /0.**
- **New CRITICAL/IMPORTANT findings: NONE.**
- **Ready for Final Owner Acceptance: YES, for this dormant P2b-A Adapter only.**

Final Owner Acceptance is not granted by this review. Transport, Integrated C4 and
all provider/runtime/business-write gates remain CLOSED.

### Exact reviewed revision and correction

Worktree remains
`/Users/xoery/.codex/worktrees/p2ba-integrated-adapter/otr-mobile-canonical`.
HEAD is exactly `7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`; branch state is
**DETACHED**. No refs were advanced or remote service queried.

Compared the correction with the byte-matching snapshot from the original review.
Exactly two Builder paths changed:

1. `src/data/repositories/captureBatchAssessmentAdapter.test.ts`: removes the
   invalid parameterized C2 mutation and adds the dedicated regression at line569.
   Corrected SHA-256:
   `c26caed1e8a5248bdd6f38e277cc9a7f1c00c6dd551a49178139bac22853f853`.
2. `docs/architecture/OTR_PLATFORM_P2BA_ADAPTER_INTEGRATED_BUILDER_REPORT.md`:
   appended R1 correction evidence only; original report is an exact byte prefix.
   Reviewed SHA-256:
   `22386ed32c57c906e4eee23a87f33cf04bb5575548b7eec869e43223b5045940`.

All1,271 tracked paths match the previously reviewed snapshot, including the
unchanged Builder handoff. Production Adapter SHA-256 remains
`75ca8b16181fc0990761c4a831be36144a39ba72928a12cbb75f6246bb2d706c`.
The original Independent Review before this appendix still has SHA-256
`f03a6473456f23991a20023a390d2835f9da8b742d7495ff313d885c38ce0da1`.

### R1-A through R1-C — successful mutation, final reload and exact rejection

The former case updated an already ACCEPTED Input after Capture assignment.
SQLite51 raised `CAPTURE_SUBMISSION_BINDING` before final admission; generic
exception rejection incorrectly counted that setup error as freshness coverage.

The replacement uses public C2 submission with two retained occurrences. The first
is ACCEPTED, assigned and supported by actual owning Publication installation via
explicit TEST-ONLY CLOSED RPC; the second has no supplied reader and remains
PENDING/REACQUIRE at revision2. The late hook executes outside both observation
transactions and successfully changes exactly one row to PENDING/RECOVER_COMMIT
at revision3. Real guards remain installed; foreign keys remain ON.

The delivered test checks successful mutation, persisted state/revision, exactly
two assessment transactions, exactly two whole-C2 roster reads and exact rejection
with `new Error("C4A_STALE_REVISION")`. Inspection confirms this error is thrown by
Adapter final comparison at `captureBatchAssessmentAdapter.ts:336`, not by the
SQLite mutation, owning-store validation or hash hook.

A separately authored reviewer probe records the returned sibling facts and
`isInTransactionAsync()` at each whole-C2 read. Actual observations are exactly:

| Observation | Active transaction | State   | Reason         | Revision |
| ----------- | ------------------ | ------- | -------------- | -------- |
| Initial     | true               | PENDING | REACQUIRE      | 2        |
| Final       | true               | PENDING | RECOVER_COMMIT | 3        |

The probe verifies an UNDERSTOOD publication-supported first occurrence before the
race, successful one-row mutation outside transaction, two transaction invocations,
exact stale error, unchanged trigger names/SQL and FK ON before and after. This
establishes that final transaction-local C2 reload and comparison are reached.

### R1-D — regression sensitivity negative control

Created a disposable Adapter copy with precisely one change: add `&& false` to
the final equality-check condition. The complete final `observe(context, jobId)`
still runs; only rejection for inequality is disabled. No Builder production file
was edited. Copied the corrected delivered test unchanged except its import points
to this disposable mutant.

Running only the corrected test against that mutant **fails as required**: the
promise resolves with the earlier assessment instead of rejecting with
`C4A_STALE_REVISION`. Exit status1, one failed test and37 test-name-filter exclusions
are expected negative-control evidence, not an unresolved production failure.
The corrected test therefore detects bypass of final freshness comparison and
cannot pass solely because its fixture mutation throws.

### Checks actually executed and evidence

| Check                                                           | Result                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Corrected full focused Adapter suite                            | **38/38 PASS**, zero failures/skips.                                               |
| Additional independent transaction-local R1 probe               | **1/1 PASS**.                                                                      |
| Corrected delivered test against bypassed-comparison mutant     | **Expected FAIL**: promise resolved;1 selected failure,37 filtered exclusions.     |
| Typecheck                                                       | PASS on exact corrected delivery snapshot, before reviewer-only probes were added. |
| Changed-test ESLint                                             | PASS.                                                                              |
| Corrected test and Builder appendix Prettier                    | PASS.                                                                              |
| This appended report formatting / Git whitespace / preservation | PASS.                                                                              |

Reviewed Builder's actual fresh regression logs:20 files /777 PASS and separate
sync dispatch1 file /24 PASS, totaling **21 files /801 PASS**. These are Builder
execution evidence, not newly rerun independent801 tests. Given exact production
preservation and independent38-case focused success, the broader matrix was not
repeated for this test-only correction. No new Backend/UI/full-suite result is
claimed by this targeted recheck.

Evidence root: `/private/tmp/p2ba-r1-independent-recheck/`.
`before.json` and `after.json` record metadata/fingerprints/preservation.
Logs: `focused.log`, `independent.log`, `negative-control.log`, `typecheck.log`,
`lint.log`, `format.log`. Runnable source is under
`snapshot/src/data/repositories/`: `r1Independent.test.ts`,
`r1NegativeControl.test.ts`, and `r1BypassedAdapter.ts`.

```sh
./node_modules/.bin/vitest run src/data/repositories/captureBatchAssessmentAdapter.test.ts \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism --reporter=verbose
./node_modules/.bin/vitest run src/data/repositories/r1Independent.test.ts \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism --reporter=verbose
./node_modules/.bin/vitest run src/data/repositories/r1NegativeControl.test.ts \
  -t 'F3 rejects a legal late PENDING C2 revision at the final gate' \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

The last command must fail for the documented negative-control reason. Dependency
reuse, probes and mutant are disposable local evidence, not delivered code.

### R1-E, Git status and remaining limits

Production Adapter, SQLite51–53 migrations/guards/registry, owning admission
contracts and all runtime callers remain unchanged. No nested transaction,
authority extension, runtime registration, Transport/Integrated C4 activation,
provider, scheduler, business write or unrelated checkpoint was introduced.

Initial/final Git status has the same paths: modified
`docs/CURRENT_IMPLEMENTATION_STATE.md`, and untracked Adapter, Adapter test,
Builder report and this Independent Review. Those statuses predate this recheck.
**Exactly one file changed by Reviewer:**
`docs/architecture/OTR_PLATFORM_P2BA_ADAPTER_INTEGRATED_INDEPENDENT_REVIEW.md`,
through this appended section only. The complete original report prefix and all
reviewed Builder fingerprints are preserved.

R1 is closed; no new material production issue was discovered. Remaining
Transport/Integrated C4 gates listed in the original review remain applicable:
authenticated complete Publication Transport, SQLite52 current-owning NEW admission
and revision/CAS composition, Continuation/runtime wiring and separately accepted
native behavior. This readiness statement grants none of those authorities.

Not repeated: full review,801 regressions, full lint/UI guard, Backend build,
full-suite/global formatting, native/device/Hosted or live Transport checks.
No commit/push/merge/rebase, device/Hosted/provider operation or activation occurred.
No new in-scope risk found; Final Owner Acceptance remains the Owner's decision.

**STOP — TARGETED INDEPENDENT R1 RECHECK COMPLETE.**
