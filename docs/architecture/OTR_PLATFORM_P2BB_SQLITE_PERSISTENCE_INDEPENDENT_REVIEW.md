# P2b-B SQLite52 independent implementation review

Date: 2026-10-08 (Pacific/Auckland). Role: Independent Reviewer.

**Verdict: PASS WITH REQUIRED CORRECTIONS.**

**Ready for Final Owner Acceptance: NO.**

Findings: **0 CRITICAL, 1 IMPORTANT (R1), 1 MINOR (R2)**. No implementation correction was made by this reviewer.

What this change does: SQLite52 retains complete immutable Account/Batch assessment observations, with revision-and-digest compare-and-swap and exact recovery. The repository remains dormant and grants no publication, Review, provider or canonical-write authority.

## Exact provenance and review boundary

Reviewed worktree:
`/Users/xoery/.codex/worktrees/p2bb-sqlite-builder/otr-mobile-canonical`.
HEAD exactly matches the Owner's expected base:
`f7115dc288aff7f0a252bf80f53b0f2b626a7534` (detached HEAD).
The original design base `06adea85fc5d5d7b24f7e15a598e28cb86ae4671` is an ancestor.
No remote freshness is claimed; no fetch was performed.

The exact uncommitted delivery comprises 18 paths: five production paths, eight
new/modified tests, and five documents. The production paths are the new migration,
its two-line registry addition, the new observation repository and body validator,
and the C2 transaction-local reader extraction. All tracked diffs and untracked
files were inspected. All six existing test diffs only adjust whole-registry/version
expectations; no existing protection assertion was removed or relaxed.

The Builder's delivered patch
`/private/tmp/otr-p2bb-builder-implementation.patch`, SHA-256
`36412bf771c866c2fd99628ee314c400fc5626d21f023a5fce06c92251ea9e29`, applies
successfully to an exact-base archive and reproduces all 18 delivered files exactly.
The Contract, ADR and Builder plan retain their original design-worktree bytes as
exact prefixes, followed by the Builder status addendum. Their normative rules
were not rewritten. The Builder report was read as a claim to verify, not as test
execution evidence.

Acceptance inputs read include the supplied P2b-B Contract/ADR/plan/report, accepted
C2 implementation and P1/C2 Revision 1 with the final naming decision, accepted C4a
correction/recheck evidence and executable schemas, and ADR0019 plus the current
Account request/generation/apply-gate implementation. Historical proposed wording
was interpreted through the recorded Owner acceptance/addenda.

Execution used a disposable exact-base archive plus the captured delivery at
`/private/tmp/otr-p2bb-independent-review`. Its dependencies reuse the existing
installed dependency tree; no install or configuration change occurred. Node
v24.18.0 / Vitest v4.1.11 / Node SQLite were used. Added negative probes and copies
of exact-base C2/registry sources exist only in that disposable directory. All 18
Builder file SHA-256 fingerprints remained unchanged through review; evidence is
`/private/tmp/otr-p2bb-review-fingerprint.json`.

## Required corrections

### R1 — IMPORTANT: historical reads and replay skip the immutable C2 Input roster

Locations: `src/data/repositories/captureBatchAssessmentObservationRepository.ts:87`,
`:120–140`, `:221–236`; the complete existing C2 reader is in
`captureSubmissionRepository.ts:505–613`.

The retained observation chain validates `c2.loadHeader()`, including its embedded
manifest, but never validates the corresponding retained Input declarations before
historical disclosure. The full `c2.load()` check occurs only on the NEW path,
after the exact-replay return. This violates the Contract section 2 requirement to
verify the complete immutable C2 header/declarations and ordered roster on every
disclosure/replay/reopen. Legitimate advancement of mutable facts is a separate
matter and must remain allowed.

Two independently added file-backed probes reproduced the defect:

1. Register one C2 Input and append observation revision 1.
2. In the disposable fixture only, disable the relevant C2 corruption guards.
3. Either change the Input's immutable `original_filename` to `forged.pdf`, or
   delete the retained Input row while leaving the header and observation intact.
4. The existing C2 `read(jobId)` rejects both corrupted Jobs.
5. Observation `readHead` nevertheless returns **HEALTHY**, `readExact(1)` returns
   **FOUND**, and append of the exact sealed revision 1 returns **EXACT_REPLAY**.
   Both exact-read/replay results carry a healthy chain, despite the broken C2
   roster. No write or repair occurs, and the observation count remains one.

Both negative acceptance assertions fail on the exact delivered source. This is
an integrity-validation gap, not a claim of protection against privileged DDL or
malicious re-signing. Disabling guards is how the disposable fixture models stored
corruption; production guards and files were not altered.

**Required correction:** validate the actual immutable C2 roster under the existing
Account gate/transaction before returning EMPTY/HEALTHY, FOUND, or EXACT_REPLAY.
Reuse the existing transaction-local verification; the smallest available route
is the C2 full reader, provided later legitimate Input/Capture changes remain
compatible. A narrower immutable-roster seam is also acceptable if it retains all
existing declaration/identity/hash/order/lineage checks without copying business
logic. Do not compare historical observed revisions to current mutable revisions,
require the owning freshness validator for historical replay, add nested
transactions, or repair damaged rows. With corrupt/missing immutable declarations,
return an integrity-blocked/unavailable result and disclose no verified body or
successful replay. Add both reproductions to delivered regression tests and retain
the existing historical-revision-advancement/replay tests.

**If omitted:** future P2b-A consumers can receive a healthy verification or recovered
success for an observation whose owning intake roster no longer verifies. The
`historicalOnly` label limits authority but does not make the integrity claim true.

### R2 — MINOR: overflowing expected revision is rejected after hashing

Location: `src/data/repositories/captureBatchAssessmentObservationRepository.ts:207–219`.

Contract section 3 explicitly requires overflow to fail before hashing or INSERT.
The repository instead calls `validateAssessmentObservation()` before checking
`expectedHead.revision >= Number.MAX_SAFE_INTEGER`.

An independent probe passes a valid revision-1 body and expected head revision
`Number.MAX_SAFE_INTEGER`. Actual result is HEAD_CONFLICT with zero rows, but the
SHA seam is invoked **four times** first. The zero-hash assertion fails.

**Required correction:** move the safe-integer/nonnegative/overflow check on the
expected revision ahead of body validation. Keep Account fencing and the later
body revision/parent checks. Add a zero-hash/zero-write overflow assertion.

**If omitted:** impossible allocations still parse and hash the complete body,
contrary to the specified early-rejection boundary. No unsafe revision or data loss
was observed, so this is MINOR rather than a correctness escalation.

## Independently reproduced tests and static checks

| Check                                                       | Actual result                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Core delivered matrix                                       | **13 files /499 PASS**, including the 43 new body/repository tests              |
| Account switch foundation/coordinator                       | **2 files /9 PASS**                                                             |
| Combined delivered targeted matrix                          | **15 files /508 PASS**; no counts added from overlapping reruns                 |
| Additional reviewer negative/compatibility/migration probes | **21 cases: 18 PASS, 3 FAIL**; two failures reproduce R1, one reproduces R2     |
| Typecheck                                                   | PASS                                                                            |
| Full lint including UI guard                                | PASS; UI guard reports 80 representative files, 473 retained legacy occurrences |
| Formatting of all 18 delivered paths                        | PASS                                                                            |
| Builder `git diff --check`                                  | PASS                                                                            |
| Exact patch application and 18-file comparison              | PASS                                                                            |
| Historical migration definitions and C2 extraction          | PASS; details below                                                             |

The 13-file core matrix comprises `batchAssessmentObservation.test.ts`,
`captureBatchAssessmentObservationRepository.test.ts`, `batchAssessment.test.ts`,
`captureSubmissionRepository.test.ts`, `localCaptureInboxRepository.test.ts`,
`database.test.ts`, `databaseConnection.test.ts`, `checkpoint11Integration.test.ts`,
`accountRequestContext.test.ts`, `diagnosticsReadOnly.test.ts`,
`captureAutonomousQa.test.ts`, `intelligenceContinuationRepository.test.ts`, and
`tripCanonicalEventRepository.test.ts`. The additional Account files are
`accountSwitchFoundation.test.ts` and `accountSwitchCoordinator.test.ts`.

Tests used `npm run test -- --configLoader runner --cache=false` with those paths;
static checks used `npm run typecheck`, `npm run lint`, Prettier on delivered files
and `git diff --check`. Reviewer-probe reproduction:

```sh
cd /private/tmp/otr-p2bb-independent-review
npm run test -- --configLoader runner --cache=false \
  src/data/repositories/p2bbIndependentNegative.test.ts
```

Probe source and actual final failure output are retained there and at
`/private/tmp/otr-p2bb-independent-negative.log`. The fixture/setup is reused from
the delivered test to exercise the same storage seam; added assertions are
independent. No passing assertion was substituted for either finding.

## Acceptance challenge results

| Requirement                                  | Review result                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry and source history                  | Registry delta exactly one import plus trailing52 entry. All51 prior IDs, names and complete SQL strings equal exact base. SHA-256 of their JSON encoding: `b48136d3c787308f8588e392f047265e08b572e9469fbabef9a3a44075d8e982`. All89 prior external migration source files under SQLite/server migration paths are byte-identical. C2 `loadHeader`/`load` moved with exact function-body bytes.                                                            |
| Schema52 scope                               | DDL equals the accepted contract exactly. Fresh runner and populated51→52 probes with FK ON/OFF confirm only the approved table, composite-PK autoindex and four triggers. No automatic assessment row/backfill.                                                                                                                                                                                                                                           |
| Prior data and atomic migration              | Reviewer upgrade probes compare every prior table's values, BLOB bytes and SQLite storage classes, including populated C2/CP11 and all51 historical migration records. Unchanged after upgrade/rerun;52 history is contiguous/unique. Delivered fault probes after CREATE, each of four trigger chunks, and history insertion roll back objects/history; retry is safe.                                                                                    |
| Immutable history/CAS/replay                 | Passed competing same-process callers, independent WAL winner, digest/revision conflicts, later-head exact replay, frozen-body enforcement and safe prefix replay. UPDATE/DELETE retention holds with FK OFF. R1 remains an exception to the claimed complete C2 verification.                                                                                                                                                                             |
| Corruption and prefixes                      | Delivered first/middle/latest digest corruption, unsupported version/storage, body/C2 header damage and unavailable reads pass. Additional missing-middle test verifies revision1 historical prefix, blocked suffix and historical-only exact replay. Snapshot/C4 digest, context and envelope tampering block. No repair writes. Immutable C2 declaration/missing-row corruption fails as R1.                                                             |
| Account and stale facts                      | Passed A→B→A, stale generation, fresh cold A recovery, cross-Account non-disclosure, Account switch during hash and after COMMIT. Additional post-COMMIT exact-read fence returns only UNAVAILABLE. Input advancement and validator rejection deny NEW; accepted-original mismatch rolls back with zero partial write. Legitimate historical Input advancement/replay remains accepted.                                                                    |
| Trusted owning validator                     | Mandatory callback in production type plus runtime function check; missing/rejected/unavailable callback denies NEW. Callback receives frozen exact body and Account context. No permissive default or production mock exists. Mock tests certify enforcement only; real Run/decision/publication freshness remains uncertified and uninstalled.                                                                                                           |
| Digests/complete body                        | Separate C2 request/declaration, approved Context namespace, C4 manifest/snapshot and complete-body digests verified. Canonical complete body is strictly parsed/re-serialized; complete C4a envelope is recomputed. Existing C4a denials remain unchanged and tested.                                                                                                                                                                                     |
| Capacity                                     | Domain UTF-8 exact2MiB reaches integrity parsing; +1 returns RECORD_TOO_LARGE before hashing. Additional SQL multibyte exact2MiB object passes structural size admission; +1 rejects with zero rows. Such structural fixtures intentionally do not claim semantic body validity. Additional genuinely C4a-valid oversized body returns RECORD_TOO_LARGE with zero repository SQL writes; no truncation or splitting. Independent1MiB C4a ceiling retained. |
| FULL/IOERR/contention/uncertain COMMIT       | Delivered disposable real FULL condition, injected IOERR, lost ACK and failed rollback pass. Additional real exclusive BUSY lock, injected LOCKED, and COMMIT-before-success rejection recover by verified exact absence or same-body replay, without duplicate revision. WAL conflict is real SQLite snapshot contention. Hardware/Expo fault behavior is not certified.                                                                                  |
| Application rollback and C2/CP11 regressions | Additional exact-base C2 factory reads/registers/submits against52 with retained observation unchanged; later Input acceptance does not invalidate historical replay. Existing C2, CP11, C3 QA, diagnostics and continuation/Event regression suites pass. No weakened assertions found in modified existing tests.                                                                                                                                        |
| Dormancy and future authority                | Factory caller search finds tests only. No default factory, runtime assessment composition, provider call, scheduler, queue kind, pruning, repair, C5/C9 or publication activation. Registry installation is the sole intentional startup schema effect.                                                                                                                                                                                                   |

## P2b-A integration implications and closure

R1 must be corrected before P2b-A relies on verification/recovery from this store.
R2 must meet the agreed early-overflow boundary. Neither correction requires a
new table, migration rewrite or authority expansion. Re-run the added failing
probes and affected delivered tests/static checks after Builder correction; this
review is not a prediction that a future patch passes.

The real transaction-local owning read set/adapter still requires separate Owner
acceptance: Source/Representation material, Run generation/Input-set, Candidate
publication and retained decision observations must come from their actual owners.
Do not treat a reconstructed C4a `current` header, retained envelope or exact replay
as current publication authorization. Do not call the existing scoped CP13B
repository as a nested transaction. The absence of that adapter is an intentional
dormant-slice limit, not a newly discovered implementation blocker.

Expected load is device-local explicit callers, including concurrent connections;
history verification remains linear in retained complete revisions. Beta retention
is intentionally unbounded. No pruning or invented aggregate quota was added.
Tail-only deletion/backup rollback detection and privileged tamper resistance are
not certified by a self-contained hash chain.

Not checked: full suite, native Expo/device installation/contention/FULL/OOM,
Hosted DEV/Production, hardware corruption or real owning-publication integration.
No device/Hosted/provider operation, implementation/document rewrite, commit,
push, merge or runtime activation was performed. Only this requested review report
is delivered to the Builder worktree; current-state and accepted documents remain
untouched by the reviewer.

**Verdict: correct R1 and R2 before Final Owner Acceptance.**

**STOP — P2b-B SQLITE52 INDEPENDENT REVIEW COMPLETE.**

## TARGETED RECHECK — R1/R2 corrections — 2026-10-08

Role: original Independent Reviewer. **Verdict: PASS.**

- **R1 FIX VERIFIED: YES.**
- **R2 FIX VERIFIED: YES.**
- **Remaining CRITICAL / IMPORTANT / required MINOR: 0 / 0 / 0.**
- **New regressions: NO in the executed targeted matrix.**
- **Ready for Final Owner Acceptance: YES, for the dormant SQLite52 slice.**

This section supersedes the original pending R1/R2 findings and readiness verdict
for the corrected delivery. The entire original review above remains exact
historical evidence; no original text or test assertion was rewritten.

### Correction provenance and preservation

Builder HEAD still equals the expected base
`f7115dc288aff7f0a252bf80f53b0f2b626a7534`. The correction-only patch
`/private/tmp/otr-p2bb-r1-r2-corrections.patch`, SHA-256
`deecc063ce42be018501481fed1c9427458b97a9669169db79c480c891132924`,
applies to the captured pre-correction files and reproduces the corrected bytes
exactly. Relative to the original review snapshot, only four Builder paths changed:
the observation repository, its existing test, the appended Builder report and
current-state handoff. Production correction scope is one existing repository.
Existing tests retain their assertions; nine R1/R2 regressions were added.

Accepted Contract, ADR, Builder plan, C2 reader and all other previously reviewed
implementation paths remain unchanged. SQLite1–52 migration objects, complete SQL
strings and registry equal the original review snapshot; all89 historical external
migration source files also match. SHA-256 of JSON encoding of the complete52-entry
registry is `27fdf7c2eea6d32a69ca23e27f8877f4b721d15deb721ad575ac9e5466042278`.
No migration, dependency, factory/composition or authority delta accompanies these
corrections.

Before appending, the original review remained byte-identical, SHA-256
`0d48881cd24b83924e4ed328c952e78f52cc4c6e9a2bbbeeccc0fa074808142f`.
All19 captured delivery fingerprints remained unchanged during recheck.
Preservation evidence:
`/private/tmp/otr-p2bb-targeted-review-preservation.json` and
`/private/tmp/otr-p2bb-targeted-recheck-fingerprints.json`.

### R1 verified

The header resolution now calls the existing transaction-local `c2.load()` and
uses its verified `.batch`. Consequently the common chain path used by readHead,
readExact and EXACT_REPLAY validates the actual complete retained Input roster,
declarations, order, hashes, original custody and lineage before disclosure.
The existing C2 reader opens no additional transaction. A known C2 INTEGRITY
exception maps to INTEGRITY_BLOCKED on append; read failures remain UNAVAILABLE.

The two original independent corruption probes are unchanged and now pass.
Additional targeted probes cold-reopen both corrupted fixtures and assert exact
results: **readHead UNAVAILABLE; readExact UNAVAILABLE; attempted exact replay
INTEGRITY_BLOCKED**. There is no HEALTHY/FOUND/EXACT_REPLAY disclosure. Three
operations use exactly three transactions, perform zero SQL writes, preserve the
corrupted evidence unchanged and retain the single observation row.

A separate targeted probe retains a pending observation, advances the mutable
Input revision, accepts its original and retains a second observation, then
assigns/unassigns the Capture to advance its revision from1 to3. After cold reopen,
readHead remains HEALTHY with the exact second head; both exact historical bodies
remain byte-equivalent and both exact replays succeed with historicalOnly labels.
The five read/replay operations use exactly five transactions, call no current
owning validator and perform zero SQL writes. C2 rows and all observation rows are
unchanged. The delivered equivalent regression and original compatibility probes
also pass. Historical observations do not require old mutable revisions to equal
current revisions and gain no publication authority.

### R2 verified

The expected-revision safe-integer/nonnegative/overflow checks now precede
`validateAssessmentObservation()`, immediately after the initial Account fence.
Malformed bodies with invalid expected revisions return HEAD_CONFLICT rather than
entering parsing. The later body revision/parent checks, actual head revision-and-
digest comparison, Account assertions and transaction/COMMIT fences remain intact.

The unchanged original MAX_SAFE_INTEGER probe now passes with **zero SHA calls**
and no allocated row. Delivered regressions cover MAX_SAFE_INTEGER, its overflowing
successor, negative/fractional values, NaN and Infinity with valid and malformed
bodies, zero SHA calls and zero writes. Additional independent probes cover those
six values plus undefined, null, string and bigint revisions against malformed
JSON; all return HEAD_CONFLICT with zero SHA calls, zero SQL reads/writes and zero
transactions. Existing CAS, Account A→B→A, during-hash and post-COMMIT regressions
remain passing.

### Independent execution results

Fresh disposable corrected execution snapshot:
`/private/tmp/otr-p2bb-targeted-independent-recheck`. The original21 probe source
was copied without changing any bytes or assertions; its SHA-256 remains
`f88b221ccf7d5d4d166b375a1cdb7e8ffff5435b489f7b1406385de67893b9c8`.
Static checks ran against a separate clean exact-delivery snapshot at
`/private/tmp/otr-p2bb-targeted-recheck-delivery`, excluding reviewer-only harness
files. Installed dependencies were reused; no dependency installation occurred.

| Check                                                                  | Actual result                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Unchanged original negative/compatibility/migration probes             | **21 /21 PASS**, including all three previously failing assertions |
| Additional targeted independent R1/R2 probes                           | **13 /13 PASS**                                                    |
| Affected delivered regression matrix                                   | **16 files /533 PASS**                                             |
| Typecheck of exact delivered source                                    | PASS                                                               |
| Full lint/UI guard of exact delivered source                           | PASS;80 representative files,473 retained legacy occurrences       |
| Formatting of all19 delivery paths and appended section                | PASS                                                               |
| Whitespace, exact correction scope and migration/registry preservation | PASS                                                               |

The533-test matrix is the original15-file508-test regression matrix plus nine
added repository regressions and the16-case `localCapture.test.ts` domain suite.
It includes C2/C4a/SQLite52, CP11, Account request/switch foundation/coordinator,
C3 QA, diagnostics, continuation and canonical Event regressions. Probe counts are
reported separately rather than conflated with delivered tests.

Test commands use `npm run test -- --configLoader runner --cache=false` with the
original review's named15 files plus `src/domain/capture/localCapture.test.ts`.
Independent probes are reproducible from the corrected snapshot:

```sh
npm run test -- --configLoader runner --cache=false \
  src/data/repositories/p2bbIndependentNegative.test.ts
npm run test -- --configLoader runner --cache=false \
  src/data/repositories/p2bbIndependentRecheck.test.ts
```

Actual logs:
`/private/tmp/otr-p2bb-targeted-review-original21.log`,
`/private/tmp/otr-p2bb-targeted-review-extra.log`,
`/private/tmp/otr-p2bb-targeted-review-matrix.log`,
`/private/tmp/otr-p2bb-targeted-review-delivery-typecheck.log`, and
`/private/tmp/otr-p2bb-targeted-review-delivery-lint.log`.
An initial reviewer-only helper-name mistake was corrected in the additional
probe; probe-only typing was excluded from clean-delivery static checks. Neither
required a Builder source change or changed the original21 assertions.

### Closure and limits

R1 and R2 are closed. No remaining required correction or new targeted regression
was found. Final Owner Acceptance can proceed for this dormant persistence slice;
acceptance does not install a real owning-publication adapter or authorize P2b-A,
Integrated C4, C5/C9, provider operations or runtime activation.

The full architecture review was not repeated. Full-suite, native/device/Hosted,
hardware-fault and real current-owning publication integration remain unverified
within the original stated limits. No implementation, migration, Builder report,
accepted document or handoff was changed by this reviewer. Only this separated
section was appended to the requested report. No Hosted/device/provider operation,
activation, commit, push or merge occurred.

**STOP — P2b-B SQLITE52 TARGETED INDEPENDENT RECHECK COMPLETE.**
