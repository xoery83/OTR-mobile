# Authenticated Publication Transport Independent Security Review

Date: 2026-10-09 (Pacific/Auckland). Role: Independent Security Reviewer.

**Verdict: PASS WITH REQUIRED CORRECTIONS.**
**Findings: CRITICAL 0 / IMPORTANT 1 / MINOR 0.**
**Ready for Dormant-Code Final Owner Acceptance: NO.**

What this change does: It adds a dormant authenticated GET for the complete private
Publication catalog, an injected protected SQL lease boundary, and bounded Mobile
receipt under the original Account context. Its optional cancellation signal follows
CLOSED handoff through SQLite53 installation. One HTTP parsing defect can normalize
ambiguous received evidence into an admitted and durably installed catalog.

## Source, independence and preservation

Reviewed the requested worktree in a separate reviewer session:
`/Users/xoery/.codex/worktrees/publication-transport-builder/otr-mobile-canonical`.
HEAD, local main and local origin/main independently match exactly
`7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`. No remote freshness claim is made: this
review did not contact GitHub or Hosted services or advance any refs.

Read the handoff/project instructions and scoped acceptance inputs: original
Transport preflight and Builder report; accepted Membership contract, migration
design, original review and correction appendix; accepted SQLite53 module/review
and targeted recheck; Backend Auth, Trip admission and protected catalog SQL.
Historical pending/unallocated statements are superseded by the accepted53 source
and review addenda, which remain unchanged.

Independently compared all **1,271 tracked files** with exact HEAD blobs. Nine
tracked files differ and nine Builder files are untracked: exactly the reported
**18-file implementation/documentation scope**. All other tracked files remain
exact base bytes. Every one of the18 files was inspected, including all changed
production code, test additions and the sole existing assertion adjustment.
Excluding the unrelated timestamp from the payload-redaction assertion is valid;
the payload assertion remains. No existing assertion was weakened by this reviewer.

The18-path SHA-256 manifest was captured before validation and rechecked afterward.
Accepted contracts/review history, SQLite/server migrations and registry, existing
Import/Source validators, Auth persistence/generation/gates, scheduler and server
composition are preserved. SQLite53 module SHA-256 remains
`ccc5ce353b109e3ce1d2545181cc550ee95f36842dc979451454ee2beef586dc`.

Validation used an exact HEAD archive plus the18 unchanged overlay files at
`/private/tmp/otr-publication-independent-review`, with a dependency symlink to
already installed packages. Independent probes were added only to this disposable
snapshot, after clean-snapshot regression/typecheck/lint/build validation. Builder
implementation, accepted contracts, original reports and handoff were not edited.
Delivery adds only this review document to the requested worktree.

## IMPORTANT — F1: ordinary JSON parsing launders ambiguous catalog evidence

Locations:
`src/data/api/requestBoundary.ts:86`,
`src/data/api/tripPublicationCatalogTransport.ts:103`,
`backend/src/app.ts:989`.
Existing strict parser: `src/domain/trip/eventIntentJson.ts:7`.

**What this is:** Publication promises a canonical complete catalog, whole-family
bounds and strict scope/integrity admission before its trusted CLOSED handle.
Ordinary JavaScript JSON parsing discards duplicate object members and rounds
numeric tokens before schema validation can inspect them.

**Problem:** The streamed HTTP reader uses `JSON.parse`. The Publication transport
then serializes the decoded object canonically. The existing CLOSED parser therefore
sees newly manufactured canonical bytes, rather than the ambiguous received bytes.
The Backend's raw catalog text boundary repeats the same normalization.

Three independent required-rejection cases fail at each boundary:

1. A foreign `actor_account_id` occurrence followed by the expected actor occurrence
   is accepted. The first scope occurrence disappears.
2. A `trip_source_candidates` occurrence containing65 rows followed by another
   occurrence containing `[]` is accepted as empty-complete. The overflowing
   occurrence disappears before the64-row check.
3. `"version":1.0000000000000001` is rounded to integer1 and accepted.

The existing `parseEventJson(raw,4194304)` rejects all three original bodies.
Nevertheless, each Mobile case resolves to a frozen trusted handle with
`memberships: []`, and each Backend case returns200 instead of withholding.
These are **six unsuppressed failed rejection assertions**, not successful
negative tests.

A seventh independent file-backed SQLite53 probe uses a correctly digested READY
Run with two Candidates in the first duplicate family and an empty final family.
HTTP normalization, CLOSED projection and installation succeed. After close/reopen,
normal owning read returns a committed **zero-Candidate membership** for that Run.
Its assertion expecting the two wire-present Candidates fails (actual0). Correct
behavior is to reject the original ambiguous body before minting any handle or
writing anything; retaining the first duplicate value would not be a fix.

**Smallest correction:** Validate the original bounded UTF-8 Publication success
text with the existing lexical/duplicate-aware parser before schema validation or
canonicalization. Enforce the canonical Publication wire contract on those original
bytes, including the Backend text boundary. Keep ordinary API responses' existing
numeric behavior intact. Add the duplicate-scope, duplicate-overflow, fractional
version and zero-write SQLite regressions; independently rerun the unchanged probes.
No new parser, dependency, schema or authority is needed.

**If skipped:** Malformed catalog responses can manufacture smaller complete
observations and immutable local memberships. This is a reproduced integrity
failure in the injected HTTP/text seams. It does **not** demonstrate forged-token
acceptance, cross-Account disclosure from the real protected SQL root, or that the
current canonical Backend serializer emits these bodies. No live attacker path or
Hosted exploit is claimed. Dormancy prevents current product activation, but does
not satisfy the required malformed-response boundary.

## Review matrix

| Requirement / challenge                      | Independent result                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Exact base, scope, activation             | Exact expected base and18 paths verified. New Mobile transport has no production caller. Server installs no Publication SQL connection; no runtime factory/scheduler/provider activation.                                                                                                                                                                                                                                       |
| 2–4. Bearer identity and credential failures | Actor comes from existing Supabase `auth.getUser(token)`, not decoded claims or caller actor headers. Missing/forged/expired synthetic credentials withhold401 before SQL; unknown/network/429/5xx Auth failures withhold503. No offline session revocation is inferred from infrastructure failure. Tests simulate Auth responses; real signature/expiry verification remains the Auth service's boundary.                     |
| 5. Trip admission and revocation             | Existing creator, legacy member and linked journey member paths preserved, without participation-active reinterpretation. SQL independently calls `trip_source_admission(actor,trip,false)`. Synthetic SQL revoke after successful early admission returns403 with no catalog. Actual concurrent Hosted revoke behavior was not executed.                                                                                       |
| 6. Privilege fallbacks                       | No catalog service-role REST/RPC, public RPC, SET ROLE, direct-table fallback or alternate routine selector. Existing service-backed Trip admission is unchanged and supplies no catalog fallback. Protected SQL source revokes PUBLIC/anon/authenticated/service_role execution.                                                                                                                                               |
| 7. SQL lease/session/cleanup                 | Same injected lease issues read-only READ COMMITTED BEGIN, local statement_timeout5000ms/lock_timeout1000ms, actual SELECT session_user, fixed parameterized root with verified actor/Trip, then COMMIT. Wrong principal stops before catalog SELECT. Failures at identity/catalog/COMMIT roll back on that lease. Missing connection fails CLOSED. Driver retirement remains an explicit unimplemented dependency requirement. |
| 8–9. Catalog completeness/scope/bounds       | All13 families retained, each0/1/64 accepted structurally and65 withheld; complete canonical4MiB accepted and one extra byte rejected. Strict missing-family/top-scope checks pass. Existing owning tests reject missing/substituted/unreferenced siblings and Inputs. **Ambiguous original JSON bypasses these received-evidence checks: F1.**                                                                                 |
| 10. Actual body bytes                        | Missing/lying Content-Length,4MiB success boundary,8KiB error limit, malformed JSON and fatal UTF-8 controls pass. Independent gzip expansion probe has a compressed length below8KiB but decompressed4MiB+1 and fails BODY_LIMIT before JSON parse. This proves counting adapter-exposed decompressed bytes, not native network-buffer certification.                                                                          |
| 11. Deadlines                                | Mobile operation capped30s, covering token/one-refresh/HTTP/body/schema; signal-scoped CLOSED provenance projection also bounded30s. Abort-ignoring token/headers/body/hash reject on deadline. Backend15s fence and5s phase limits pass; independent three sub5s phases plus validation over total15s withhold503. SQL checkout counts against its5s budget.                                                                   |
| 12. Late/abort-ignoring/refresh/second401    | Late promises are observed and cannot return authority; one401 replay only. Independent canceled-refresh waiter sends no late replay. Shared owned refresh can finish for another waiter; stale A→B→A refresh cannot persist. Second401 has no third fetch or refresh loop.                                                                                                                                                     |
| 13. A→B→A through boundaries                 | Token, HTTP, body, refresh and independently intercepted JSON parsing fence old generations. Copied handles/newA contexts cannot inherit prior admission; SQLite install checks original Account/Trip/generation. Scope mismatch independently rejects.                                                                                                                                                                         |
| 14. Canceled/superseded handles              | Original external signal is retained after transient boundary cleanup. Cancellation before install yields zero writes; during install rolls back all catalogs/membership with FK OFF. Supersession depends on the trusted caller aborting that original signal; no request-epoch owner is installed.                                                                                                                            |
| 15. No network under SQLite gate             | Supported composition completes Auth/HTTP/SQL receipt and projection before repository.install. Install uses retained text and local transaction stores. Synthetic transport explicitly verifies SQLite is outside a transaction; production call tracing finds no network in install. Trusted Account getter/hash dependencies must retain their local-only contract.                                                          |
| 16. SQLite53 durability                      | Actual Node SQLite53 tests cover atomic install, cancellation/error rollback, lost COMMIT ACK, exact replay and cold owning readback; accepted replacement-retention guards preserved. Native Expo/power-loss behavior is not certified. F1 also reproduces a wrongly manufactured empty commitment after cold reopen.                                                                                                          |
| 17. Native buffered fetch                    | Installed buffered Response shape and missing injected adapter fail before token/fetch, with no text/json/arrayBuffer fallback. A response lacking a stream is rejected. No native streaming adapter exists or is certified.                                                                                                                                                                                                    |
| 18. Code/tests and permissiveness            | Changed production and tests inspected, callers traced, fixed SQL and finite error-code retention verified. Found F1's normalization permissiveness; no additional required findings. Synthetic passing tests do not establish real SQL authority.                                                                                                                                                                              |
| 19. Authority preservation                   | No credentials, provisioning, roles/grants, SQL driver, Hosted mutation, migrations, runtime factory, scheduler, provider, C5/C9 or domain-write authority added. Existing current material/Trip/Capture validation and gate ownership remain required.                                                                                                                                                                         |

The optional signal extension changes the accepted repository only to retain and
recheck cancellation; it does not redesign Membership or SQLite53. Historical
no-signal callers retain existing behavior. Future composition must pass the same
original signal through transport, CLOSED projection and install, and abort it on
supersession. HTTP completion alone is not the owning C4 acceptance boundary.

### SQL cleanup qualification

A timed-out BEGIN can finish after the helper stops waiting. In that case its
`began` flag never becomes true and the helper does not issue ROLLBACK. The independent
probe confirms this and verifies that a conforming injected driver retires the
aborted lease. Similarly, ROLLBACK can hang if a driver ignores cancellation.
The helper's caller deadline prevents disclosure; it does not prove termination
or safe pool reuse. This is the explicitly documented trusted-driver gate, not a
claim of complete live cleanup. A future driver must destroy uncertain leases,
including late BEGIN/COMMIT and stuck rollback, before any reuse.

## Actual independently executed validation

| Check                                                 | Result                                                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Affected Backend/API/Auth/Publication/SQLite53 matrix | **17 suites /415 PASS**, zero failures/skips;19.08s. Same exact17-file command as Builder, independently executed on preserved bytes.                                              |
| Independent HTTP/SQL/Auth probes                      | **20 cases:14 PASS /6 FAIL**; the six failures reproduce F1 at Mobile and Backend.                                                                                                 |
| Independent durable F1 probe                          | **1 FAIL**, reproducing installed zero-Candidate membership after file reopen. Existing92 cases intentionally filtered in this probe-only run; all92 passed in the415-case matrix. |
| Typecheck                                             | PASS on exact clean delivery snapshot before probes.                                                                                                                               |
| Full lint / UI guard                                  | PASS, no ESLint warnings/errors;80 representative UI files /473 retained legacy occurrences. No UI change.                                                                         |
| Backend build                                         | PASS; local ignored2.1MiB bundle, no launch or deployment.                                                                                                                         |
| Formatting                                            | All18 Builder delivery paths PASS with Prettier; review document separately formatted. No global-formatting claim.                                                                 |
| Whitespace / scope / preservation                     | git diff --check PASS; all18 hashes retained;1,271 tracked-file exact comparison and accepted53 hash PASS.                                                                         |

The independent failures are retained unsuppressed; no Builder assertion or accepted
implementation was changed to make them pass. Counts are not added together as
unique coverage. No full-suite PASS is claimed.

Evidence:

- Exact snapshot/probe sources: `/private/tmp/otr-publication-independent-review/`.
- Regression log: `/private/tmp/otr-publication-review-regression.log`.
- Adversarial log: `/private/tmp/otr-publication-review-probes.log`.
- Durable reproduction: `/private/tmp/otr-publication-review-sqlite-probe.log`.
- Typecheck/lint/build/format: `/private/tmp/otr-publication-review-{typecheck,lint,build,format}.log`.
- Original18-file manifest: `/private/tmp/otr-publication-review-manifest-before.json`.
- Exact-base preservation: `/private/tmp/otr-publication-review-preservation-final.json`.

Reproduce independent probes from the snapshot:

```sh
node_modules/.bin/vitest run src/data/api/publicationIndependentSecurity.test.ts \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism --reporter=verbose
node_modules/.bin/vitest run src/data/repositories/tripPublicationMembershipRepository.test.ts \
  -t 'independent raw HTTP' --configLoader runner --cache=false \
  --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

## Remaining gates and final readiness

1. **Dormant-code acceptance: NO.** Correct F1 under separate authorization, preserve
   this original review and independently recheck the seven failure cases and
   affected regression matrix. This reviewer made no correction.
2. **SQL Principal/Driver: CLOSED.** No actual dedicated login/session/ACL/TLS/primary
   or pool cleanup evidence. Synthetic lease strings and source ACLs are not proof
   that any deployed principal can safely call the function. Provisioning and real
   principal failure/revocation/timeout tests require separate authorization.
3. **Native Streaming: CLOSED.** No installed bounded native receive adapter or
   native decompression/cancellation/redirect/buffering acceptance. Node standard
   streams and dependency-source inspection do not certify devices.
4. **Hosted: CLOSED.** No DEV/Production access, current function/ACL/schema check,
   deployment or mutation. R3 historical acceptance does not certify this root.
5. **Integrated C4: CLOSED.** Owning C2/Capture/Trip/Source/Publication complete read
   set, original-context/supersession composition, P2b-A/P2b-B NEW admission,
   Continuation callbacks and Account-gated transaction acceptance remain separate.
   C5/C9, provider activation and domain-write authority remain CLOSED.

Not checked: full suite/global formatting, real SQL principal/driver/ACL, Hosted
services, devices/native binaries or physical fault behavior. F1 can retain a
manufactured empty publication; fix and independent recheck are required.

**STOP — AUTHENTICATED PUBLICATION TRANSPORT INDEPENDENT SECURITY REVIEW COMPLETE.**

## TARGETED RECHECK — AUTHENTICATED PUBLICATION TRANSPORT F1 — 2026-10-09

Performed by the original Independent Security Reviewer in the original review
session under the Owner's targeted authorization. The complete original review
above, including its findings, failures and verdict, is preserved byte-for-byte.
This appendix supersedes its unresolved F1 and dormant-code readiness status.

**Targeted recheck verdict: PASS.**

- **F1 FIX VERIFIED: YES.**
- **Original seven scenarios closed: YES.**
- **Remaining CRITICAL / IMPORTANT / required MINOR: 0 /0 /0.**
- **New regressions: NO in the executed affected matrix and independent probes.**
- **Ready for Dormant-Code Final Owner Acceptance: YES.**

This accepts the parsing correction for dormant code only. Owner acceptance,
SQL Principal/Driver, Native Streaming, Hosted and Integrated C4 remain separate
and CLOSED; no runtime or domain-write authorization is granted.

### Exact correction and preservation

Requested Builder HEAD remains exactly
`7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`. Local main/origin/main now independently
resolve to `094cf3beb6b05f2a7f1c8cca1fa007ed630651c4`; those externally advanced refs
were not adopted or changed. No network/remote freshness claim is made.

Independently reconstructed the exact F1 diff from the original18-path SHA-256
manifest and saved pre-correction bytes. Exactly the ten paths listed in the
Builder correction appendix differ: four production files, four test files,
Builder report and current handoff. Original tests are retained; new assertions
are added. The original Builder report remains an exact byte prefix of its
updated report. Original review SHA-256 before this appendix is
`51cecabf27094f0f73db3e3a680a80e257d6b4aba7249ea130c318bb5f303642`.

All1,271 tracked paths were compared with expected HEAD blobs. The same nine
tracked Builder paths differ; all other tracked bytes remain exact. All19
pre-recheck delivery paths, including the original review, were captured and
verified unchanged by this reviewer before appending this section.
SQLite1–53, registry, existing lexical parser, protected SQL, Auth generation/
persistence/apply gates, owning validators and server composition remain exact.
SQLite53 module SHA-256 remains
`ccc5ce353b109e3ce1d2545181cc550ee95f36842dc979451454ee2beef586dc`.

No dependency, credential, grant, principal, SQL driver, migration, scheduler,
provider, C5/C9, business-write authority or runtime activation is added.
Validation/probes used disposable exact-source snapshots; no Builder production
or test changes were made by this reviewer.

### Original seven reproductions and unchanged replay

Before corrected replay, independently verified all18 original delivery hashes
against the saved pre-correction snapshot. The original independent sources were
then rerun without changes:

- Original HTTP/SQL/Auth suite: **14 PASS /6 FAIL of20**. The duplicate actor,
  duplicate65-row Candidate family and rounded fractional version each fail
  rejection at Mobile and Backend, exactly as originally reported.
- Original file-backed SQLite53 probe: **1 FAIL**, again installing and cold-reading
  zero Candidates when two Candidates occur in the first duplicate family.
  Its92 original surrounding cases are intentionally filtered in this probe run.

Against corrected production bytes, the same independent API source reports
**19 PASS /1 FAIL of20**. All six original F1 rejection assertions PASS. The sole
remaining failure is the obsolete Account injection explained below. The unchanged
original durable probe now fails earlier with `INVALID_RESPONSE` at original-text
HTTP admission; it never obtains a handle or reaches install. Its historical
assumption that installation proceeds to Candidate readback is therefore obsolete.
That failure is evidence of required rejection, not a corrected-code regression.
The surrounding94 corrected delivered cases are intentionally filtered here.

Neither historical probe was edited or suppressed. API probe SHA-256 remains
`0323973fb6572e7e3eecb7fa855bcc0f3ffb4a187d5f5a7dcb467acf8fc458b0`;
original durable probe appendix SHA-256 remains
`6e77b14c27db16afb7e859a80f0e03fa4e1dfe6060ac4a120d3aa7cd91c3e3d8`.
Replacement probes are separately labeled and are not presented as unchanged
original harness passes.

### Strict original-text admission and ordinary API preservation

Backend applies the4MiB UTF-8 byte check to the original returned text, then calls
existing `parseEventJson(body,4194304)` before schema/scope validation and canonical
serialization. Lexical failure withholds503 `PUBLICATION_MEMBERSHIP_INTEGRITY`.
Mobile accumulates at most4MiB actual received bytes, fatally decodes UTF-8, then
invokes that same strict parser on the original decoded text before schema parsing
or canonicalization. Its lexical failures return `INVALID_RESPONSE`.

The parser checks duplicates at every object depth and rejects rounded/fractional,
unsafe integer, exponent and negative-zero tokens before numeric normalization.
Independent extra probes verify escaped duplicate actor keys, nested escaped
duplicate row keys, an unsafe fractional token that rounds into a safe integer,
negative zero, a fraction that rounds to1 and integer exponent spelling at both
boundaries. Exact canonical valid controls still succeed.

Publication fixes the strict callback after spreading caller options and excludes
it from its public options type. An independent untyped override probe confirms
that an injected permissive callback is never invoked. Ordinary API parsing,
including bounded ordinary responses, retains duplicate-last, decimal and exponent
behavior. Error bodies retain ordinary parsing and finite safe code handling;
the strict success callback is not used on errors. No new parser was introduced.

### Independent SQLite53 zero-write and strict-parser Account probes

**14 additional independent cases PASS**: nine API/lexical/override/compatibility
cases and five owning SQLite/Account/cancellation/deadline cases.

Two file-backed SQLite53 probes, FK ON and OFF, first install a legitimate
populated two-Candidate publication and reopen the file. They capture all-table
rows and actual database bytes, then feed ambiguous original HTTP text containing
a correctly digested READY Run with two Candidates followed by a duplicate empty
Candidate family. They assert:

- `INVALID_RESPONSE` before a trusted handle returns;
- no call to repository.install;
- zero SQLite installation transactions and zero catalog/membership writes;
- after close/reopen, all tables and the entire database file are byte-identical;
- unambiguous canonical HTTP through the same transport/reader subsequently
  installs/replays and cold owning read returns both Candidates.

The old Account probe switched A→B→A only when whole-object `JSON.parse` returned a
catalog object. Publication no longer makes that call, so the old hook never fires.
Its unresolved test result is retained as a harness assumption, not Account evidence.

The independent replacement intercepts the exported **strict parser** on its real
Publication original-text call, after the actual parser finishes. It advances
Account generation twice, asserts that the interception fired exactly once, and
verifies no CLOSED handle, installation transaction or writes occur. It does not
rely on whole-object or scalar `JSON.parse` interception. Two additional exercised
strict-parser probes cancel the original signal or advance time beyond the30s
budget; both reject without minting a handle or installing.

Existing deadline, late-response, shared-refresh, second401, A→B→A and canceled-handle
rollback cases also pass in the affected matrix and unchanged replay controls.
Unsupported native buffering still fails before token/network. SQL lease/cleanup
code is unchanged; synthetic evidence still does not certify a real principal,
pool retirement or driver termination.

### Independently executed validation

| Check                          | Result                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Corrected affected matrix      | **17 suites /433 PASS**, zero failures/skips;15.15s. Same matrix/options as original review and Builder correction.                   |
| Original pre-correction probes | 20 cases:14 PASS /6 reproduced FAIL; durable probe1 reproduced FAIL.                                                                  |
| Unchanged corrected replay     | 20 cases:19 PASS /1 obsolete injection FAIL; durable probe rejects early with INVALID_RESPONSE. No all-green unchanged-harness claim. |
| Additional independent probes  | **14/14 PASS**, with95 surrounding historical/delivered cases intentionally filtered in the owning probe run.                         |
| Typecheck                      | PASS on exact clean corrected snapshot.                                                                                               |
| Full lint/UI guard             | PASS, no warnings/errors;80 representative UI files /473 retained legacy occurrences.                                                 |
| Backend build                  | PASS; local2.1MiB bundle only, no launch/deployment.                                                                                  |
| Formatting and whitespace      | All19 pre-append delivery paths PASS; this appendix separately formatted; git diff --check PASS.                                      |
| Scope/preservation             | Original reports/probes preserved, exact ten-path correction and accepted source/gates verified.                                      |

The first matrix execution, overlapping other validation processes, reported
432 PASS and a5s timeout in the unchanged1203-aggregate collection stress test.
Rerunning the identical17-suite command alone, with the same5s test limit and no
source/assertion changes, passes all433. Both logs are retained. No full-suite
or global-formatting PASS is claimed.

The first additional SQLite probe run spent its test budget deep-comparing large
Buffer objects. Only the independent harness comparison was replaced by
`Buffer.equals`, which still compares every file byte; no timeout or assertion was
relaxed. Final14-case probes pass. Original historical probe sources remain exact.

Evidence root: `/private/tmp/otr-publication-f1-security-recheck/`.
`delivery/` is the clean corrected snapshot; `replay/` retains unchanged historical
probes plus clearly labeled independent replacements. `correction.diff`,
`before.json`, `scope.json`, `preservation.json`, `original-review.md`,
`original-probe-fingerprints.json` and `probe-preservation.json` preserve scope and
source evidence. Logs include `original-probes.log`, `original-sqlite.log`,
`unchanged-probes.log`, `unchanged-sqlite.log`, `additional-probes.log`,
`additional-probes-final.log`, `regression.log`, `regression-final.log`,
`typecheck.log`, `lint.log`, `build.log` and `format.log`.

Independent replacement reproduction from `replay/`:

```sh
node_modules/.bin/vitest run src/data/api/publicationF1Recheck.test.ts \
  src/data/repositories/tripPublicationMembershipRepository.test.ts \
  -t 'independent strict|Publication cannot|ordinary and bounded|strict success|independent F1 targeted' \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

### Remaining gates and closure

F1 is closed; dormant-code Final Owner Acceptance is ready. Actual dedicated
SQL Principal/Driver provisioning and ACL/termination evidence, Native Streaming
adapter/device acceptance, Hosted contract verification and Integrated C4 owning
composition remain **CLOSED** and require separate Owner authorization. C5/C9,
provider/runtime and domain-write authority remain CLOSED. No Hosted/device access,
credential provisioning, commit, push, merge, rebase or activation occurred.

Not checked: full suite/global formatting, real SQL principal/driver/ACL, Hosted,
native devices or physical faults. No remaining in-scope security finding; the
separate live/integration gates remain unverified.

**STOP — AUTHENTICATED PUBLICATION TRANSPORT TARGETED INDEPENDENT SECURITY RECHECK COMPLETE.**
