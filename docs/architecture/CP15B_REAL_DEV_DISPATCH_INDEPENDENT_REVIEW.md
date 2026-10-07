# CP15B — Independent real DEV dispatch foundation review

Date: 2026-10-07 (Pacific/Auckland). Review only.

**Verdict: FAIL — ARCHITECTURE REVIEW REQUIRED**

**New findings: 2 CRITICAL, 2 IMPORTANT. Ready for Final Owner Review: NO.**

The delivered foundation preserves TEST/PRODUCTION structural closure, historical migration bytes, UNKNOWN nonredispatch, original evidence equality and canonical authority. It does not yet preserve current authorization across remote-result recovery and the SQL Trip-revocation window. Exact security-selected template/privacy/policy pins are incompletely enforced, and computed cost is incorrectly labeled actual. Passing delivered suites do not cover these independently reproduced failures.

## Reviewed state and boundaries

Reviewed worktree: `/Users/xoery/.codex/worktrees/cp15b-real-dispatch-foundation/otr-mobile-canonical`; branch `intelligence/cp15b-real-dispatch-foundation`; exact unchanged HEAD/base `b973f039dfd6405d302409252ddbdc8f70584159`. Review includes its uncommitted tracked and untracked implementation, rather than HEAD alone.

Review inputs include the adopted CP15A requirements and Owner overlay recorded in the Builder report, historical prerequisite stop/resolution, actual CP15B diff and new files, Server83/84, scripts/tests, accepted CP14 Persistence/A2/B2/C2/Final Closure recheck evidence, CP13A/B authority contracts, and the current API/data/offline handoff. Historical pending verdicts do not supersede accepted appended rechecks. Builder YES answers are not independent evidence.

Execution used a disposable copy at `/private/tmp/cp15b-independent-review`, an exact-base Git archive at `/private/tmp/cp15b-review-exact-base`, and two review-owned PostgreSQL17 containers, `otr-cp15-review-fresh` and `otr-cp15-review-seeded`. Both use `--network none`, no published ports and synthetic identities. The existing CP13A container was read only for hash-pinned platform helper definitions; no Builder/normal Dev container was mutated. Schema-only local platform material was reused.

No implementation or Builder report was changed. Only this review is added to the reviewed worktree. No commit/push, Hosted Dev/Production access, real secret read/provisioning, real DeepSeek call, live resolver/factory/endpoint or real gate activation was performed. Temporary synthetic DEV activation in network-none SQL tests is not live activation.

## F1 — CRITICAL: retained recovery discloses evidence without current Account/Trip fencing

Locations: `backend/src/flightDevDispatch.ts:484–509`; `src/data/repositories/intelligenceContinuationRepository.ts:387–389`.

`recover` reads an Account-scoped attempt, then awaits retained-reference lookup, private custody and hashing before returning the complete stored interpretation. It never rechecks Account generation after those awaits and never invokes the owning task/Trip/material admission boundary. `readAttempt` checks Account context during its transaction but does not validate the task's Trip/material pins. The returned interpretation includes original raw spans and local deferred passenger/booking evidence.

Independent executions:

- The injected executor retained a valid result; custody read advanced generation twice (A→B→A). Recovery returned the original evidence instead of rejecting.
- A reviewer-owned **actual file-backed SQLite50 cold reopen** repeated that attack with the real continuation repository and file-backed retained bytes: evidence was returned.
- A second cold-reopen case made the owning `validateAdmission` reject current Trip access before recovery. Recovery still returned evidence; that admission check was never called.

The two actual SQLite rejection assertions fail. This is a disclosure defect, not a demonstrated Event write or network replay. The existing later `installResult` checks do not retroactively fence evidence already returned by the public recovery method.

Required correction: reuse current owning Account/Trip authorization for recovery disclosure and revalidate generation/current authority after all private-custody/hash awaits, before returning evidence. Preserve exact retained historical bytes and fresh-context recovery; do not require stale semantic evidence to become current merely to retain responsibility. Add cold-restart A→B→A, Trip revoke and valid-authorized recovery controls. SQLite51 is not required to fix this boundary.

## F2 — CRITICAL: Trip revoke can commit before durable mark and still receive dispatch ACK

Locations: Server84 `external_integration_mark_dispatch`, lines236–259; unchanged Server83 `cp14_call_admission`/`cp14_trip_access`, lines1469 and1612; executor `backend/src/flightDevDispatch.ts:425–444`.

Mark holds the environment/integration scope locks and checks Trip access, then updates the call. Trip ownership/membership revocation is not serialized by those locks. The executor checks secret readiness and Account generation after ACK, but does not independently recheck current Trip access before transport.

Independent SQL barrier reproduction:

1. Reserve a valid synthetic DEV call and immutable hold through actual protected roots.
2. A temporary review-only BEFORE UPDATE trigger acquires an advisory barrier when the root tries to mark MAY_HAVE_STARTED. This pauses after the root's admission reads, before its durable update/commit.
3. A second session commits removal of the admitted Account's Trip ownership and linked membership. `cp14_trip_access` now returns false.
4. Release the barrier. The original protected mark succeeds and returns MAY_HAVE_STARTED/RUNNING.

The barrier only controls scheduling; it supplies no authorization, changes no admission predicate and is removed after the probe. No provider transport ran. Nevertheless, this ACK is exactly the authority the executor accepts for one transport, so a pre-mark committed Trip revoke can still authorize fetch. A post-mark kill disclaimer does not cover a revoke committed before mark.

Required correction: serialize the Trip authorization observation and mark against the owning revoke boundary, using existing authority/locking conventions and consistent lock order. A check followed by another await is insufficient. Test revoke winning before mark (zero transport) and mark winning before revoke (retain possible-execution responsibility and fence disclosure/install). Retain current environment/integration kill behavior and UNKNOWN semantics.

## F3 — IMPORTANT: selected scope does not bind all actual remote-contract pins

Locations: Server84 `flight_activation_select` lines128–150 and `cp15_flight_admission` lines171–177; `backend/src/flightDevDispatch.ts:70–178,248–293`; `src/domain/intelligence/remoteFlightText.ts:88–111`.

Scope selection stores prompt, envelope, minimizer, privacy and policy hashes, but reserve/mark compare only adapter/output-schema and selected config/price identifiers. No corresponding actual request facts are carried into the SQL call/hold for the other hashes. The executor recomputes the compiled prompt/minimizer/privacy versions against the descriptor; it does not compare those actual versions with the Security Admin-selected scope pins. An opaque scope digest does not establish equality between the selected scope's fields and the executing descriptor's fields.

Independent protected-root probe selected a fresh active scope with a different valid-format `prompt_sha256` (`b` repeated64 times). Reserve and mark still succeeded. The call has no prompt/envelope/minimizer/privacy/policy facts for SQL to compare. This is not proof that the current fixed adapter can execute an arbitrary caller prompt; it is proof that the promised exact security selection is not an enforced prerequisite. Ordinary service/API roles remained denied.

Required correction: bind the actual versioned remote-envelope/configuration facts to the exact selected scope at admission and independently revalidate that binding at mark. Test changing each pin individually with the other prerequisites valid; transport must stay zero. Do not weaken raw evidence or install a second dispatch owner.

## F4 — IMPORTANT: schedule-derived cost falsely claims ACTUAL_REPORTED

Location: `backend/src/flightUsage.ts:85–104,141–144`. Authority: adopted CP15A §12.

`flightUsageCommand` computes cost from a configured rational schedule and reported token counters, then emits `cost_quality: ACTUAL_REPORTED` whenever arithmetic succeeds. There is no provider billing observation or confirmed billing time band in its input. CP15A explicitly requires calculated schedule cost to remain ESTIMATED until provider-billing evidence confirms it; ambiguous time bands must remain UNKNOWN or an estimated bound.

A reviewer-owned check with valid actual token counters and a pinned synthetic schedule returns ACTUAL_REPORTED and fails the required ESTIMATED assertion. Arithmetic/cache disjointness is correct in that vector; the defect is quality/authority, not floating-point rounding. Server83/84 remains the owning journal, but the new mapper proposes a falsely authoritative cost observation to that journal.

Required correction: retain actual token quality independently; mark schedule-derived cost ESTIMATED, or UNKNOWN when applicability is unresolved. Only admitted billing evidence may establish actual cost. Preserve pinned historical schedules, exact rational nanos, missing-usage UNKNOWN and late correction/supersession behavior. Add estimated-versus-confirmed-billing and ambiguous-band checks.

## Independent validation

| Check                                                            | Observed result                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Exact Server1–83 and SQLite migration/registry source comparison | PASS;88 source files match exact-base Git bytes                                |
| Startup preservation manifest                                    | PASS;all88 hashes match                                                        |
| Adopted CP15A                                                    | PASS;byte-identical to retained normative source                               |
| Fresh1→84                                                        | PASS;defaults disabled/killed, no active scopes/grants/holds                   |
| Seeded83→84                                                      | PASS;historical rows/columns and unaffected function definitions preserved     |
| Accepted Server83 compatibility on84                             | PASS;548 checks, including75 residual assertions                               |
| Delivered Server84 security matrix from a clean fixture          | PASS;104 checks,100 retained holds,0 provider calls, CLOSED end state          |
| Trip/Event/Source/Flight SQL regression                          | PASS;841 checks across seven files                                             |
| Actual C1 UNKNOWN/C2/C3 shared-lock race                         | PASS;serialization/rollback and closed authority preserved                     |
| Actual A2 bridge against84                                       | PASS;exact call+START/replay, old real mark CLOSED                             |
| Delivered network-disabled adapter/executor cases                | PASS;61 tests                                                                  |
| Delivered CP13B remote core and SQLite50 cold-reopen conformance | PASS in full suite;original raw equality/FK/schema tail preserved              |
| Reviewer recovery/cost assertions                                | FAIL as described;two injected and two actual SQLite assertions expose defects |
| Reviewer protected-root pin/revoke probes                        | Defects reproduced;actual durable mark ACKs,0 provider calls                   |
| Typecheck                                                        | PASS                                                                           |
| Lint/UI guard                                                    | PASS;473 baseline legacy occurrences,76 representative UI files                |
| Backend build                                                    | PASS;no installed live Flight constructor in normal startup                    |
| Changed implementation/contract formatting                       | PASS                                                                           |
| Implementation whitespace                                        | PASS;git diff --check                                                          |
| Exact CP15B full suite                                           | 202 files;2,557 PASS,1 unchanged FAIL                                          |
| Exact-base full suite with same dependencies/guard               | 200 files;2,494 PASS,1 same FAIL                                               |
| Full-suite new failures                                          | 0                                                                              |

The unchanged failure is `src/domain/architectureBoundary.test.ts:41`, the existing Ledger UI/data infrastructure assertion. Reviewer tests are separate from that exact full-suite comparison. An exploratory full run collected two reviewer assertions because their temporary file was added during discovery; the final comparison reran the unchanged delivered test sources and exact base separately.

Migration comparison also verifies no SQLite51, historical source mutation, second scheduler or second actual cost ledger. Server84 is exactly one forward migration; its intended existing-function/constraint extensions are not claimed to leave the live83 catalog entirely unchanged. Historical START/provider ID rows remain valid/null.

The first security run followed the historical compatibility suite, whose TEST fixture leaves a kill flag cleared; its all-environments end-state assertion consequently failed. Replaying into that used container also encountered residual extension-function grants. Recreating the review-owned container and running fresh replay→security alone passed104 checks. Neither issue was treated as a product correction or hidden as a baseline failure.

Actual Server84 B2 lifecycle/firewall follow-up: **143/143 PASS** (`CP14_B2_SERVER83=1`, review-owned network-none seeded fixture). The existing submit/proposal/review/restart paths retain inbound/outbound separation and no automatic paid Flight invocation. Review-owned PostgreSQL containers were removed after all testing.

## Preserved boundaries and limits

- TEST/PRODUCTION runtime enablement is rejected by the actual DEV-only CHECK, even in the privileged constraint probe. Protected commands/session ACLs and CONFIG_ADMIN-only activation rejection pass. Current inactive defaults remain intact; malformed/changed request scope is denied by protected context/request binding.
- Old generic CP14 and old Flight-labeled generic reservations lack a qualifying hold and remain closed under fixture DEV enablement. Atomic existing scope locks enforce resource/monetary admission and replay; conservative immutable UTC admission-day holds are not actual usage or billing. Missing monetary approval denies dispatch; UNKNOWN retains capacity.
- Durable mark ACK precedes injected transport. Lost ACK, duplicate executor and UNKNOWN paths do not redispatch. No installed live transport/resolver or normal startup endpoint is present. F2 concerns whether that ACK is currently authorized, rather than retry or mark-ACK ordering.
- Network tests use injected fixture transports. Node test processes additionally preload `/private/tmp/cp15b-independent-review/review-network-deny.cjs`, replacing global fetch and rejecting TCP socket connections (Unix IPC remains available), preventing direct provider traffic and localhost TCP forwarding. PostgreSQL containers are network-none. This is not a native/device/provider conformance claim; no real DNS/provider call was made by the reviewed adapter path.
- Fixed HTTPS destination, redirect-error request, finite normalized errors, nonstreaming bounded JSON, token/span grammar, missing/malformed usage and nullable safe provider IDs pass delivered tests. No installed secret lookup, Mobile credential persistence, SDK retry, tool/URL fetch, Vision, Apple, commercial fallback or shadow activation was found.
- The minimizer emits only whitelisted original Flight spans with opaque sequential tokens. Unsupported names/contact/booking/payment/URL/config identifiers remain excluded in tested vectors. Host rebinding restores original UTF-8 slices, verifies pins and normalizes through OTR; the same CP13B core retains exact raw equality. This does not claim a general arbitrary-airline-document parser.
- CP13A canonical command authority and CP13B interpretation/closure remain unchanged. Model output cannot create Event/Person/member/booking authority. `sync_operations` remains the sole scheduler; all five C denials and their tests are unchanged. Recovery safety nevertheless fails F1; existing publication checks do not cure that disclosure window.
- Documentation consistently calls this implemented CLOSED capability and separately gates LIVE. Its specific safe-recovery/exact-pin claims require reconciliation after F1–F3 correction. Current-state/Builder reports were deliberately preserved rather than rewritten by the reviewer.
- Runtime tests are deterministic fixtures and protected local SQL, not live end-to-end deployment. The review does not claim every possible native/transport/issuer barrier was exercised. No live terminality, billing confirmation, secret manager, issuer provisioning or Hosted environment was tested. The reproduced failures are sufficient to deny readiness without inventing assurance for untested boundaries.

## Required answers

| Required answer                                          | Answer                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| Server1–83 unchanged                                     | YES                                                        |
| SQLite50 unchanged                                       | YES                                                        |
| Server84 additive                                        | YES                                                        |
| TEST real dispatch possible                              | NO                                                         |
| PRODUCTION real dispatch possible                        | NO                                                         |
| DEV real dispatch active by default                      | NO                                                         |
| CONFIG_ADMIN can activate runtime                        | NO                                                         |
| Ordinary service role can dispatch                       | NO                                                         |
| Old CP14 call can be upgraded to real dispatch           | NO                                                         |
| Missing monetary policy can dispatch                     | NO                                                         |
| Budget oversubscription possible                         | NO                                                         |
| UNKNOWN can redispatch                                   | NO                                                         |
| Mark ACK loss can cause second fetch                     | NO                                                         |
| Pre-mark kill/revoke can still fetch                     | YES — F2 Trip revoke                                       |
| Real secret present/read                                 | NO                                                         |
| Authorization can leak on redirect                       | NO                                                         |
| Real provider/network reachable in normal startup        | NO                                                         |
| Review tests made real provider call                     | NO                                                         |
| Vision path active                                       | NO                                                         |
| Commercial fallback active                               | NO                                                         |
| Raw attachment sent by default                           | NO                                                         |
| Private excluded fields can leak into minimized payload  | NO                                                         |
| Prompt injection can alter provider/config/tool behavior | NO                                                         |
| Model can invent trusted evidence                        | NO                                                         |
| Raw evidence equality weakened                           | NO                                                         |
| Remote descriptor truthfully identifies REMOTE_MODEL     | YES                                                        |
| SQLite50 cold-restart recovery safe                      | NO — F1 disclosure;storage/FK preservation passes          |
| SQLite51 required                                        | NO                                                         |
| Missing usage remains UNKNOWN                            | YES                                                        |
| Provider request ID can become retry authority           | NO                                                         |
| Server remains authoritative usage/cost owner            | YES — ownership preserved;F4 cost quality needs correction |
| Inbound can automatically invoke outbound                | NO                                                         |
| Model can create Event/Person/member/booking authority   | NO                                                         |
| CP13B authority preserved                                | YES                                                        |
| CP13A authority preserved                                | YES                                                        |
| sync_operations sole scheduler                           | YES                                                        |
| Five C denials unchanged                                 | YES                                                        |
| Runtime/provider gates remain CLOSED                     | YES                                                        |
| Documentation correctly distinguishes CLOSED from LIVE   | YES                                                        |
| Full-suite new failures                                  | 0                                                          |
| New CRITICAL findings                                    | 2                                                          |
| New IMPORTANT findings                                   | 2                                                          |
| Ready for Final Owner Review                             | NO                                                         |

Runnable reviewer vectors and logs remain outside the repository: `/private/tmp/cp15b-review-owned-tests.ts`, the disposable snapshot's `src/data/repositories/cp15Independent.test.ts` and `scripts/cp15/reviewer-sql.py`, and `/private/tmp/cp15b-review-*.log`. Review-owned negative assertions intentionally fail against these unchanged implementation bytes. SQL probes must run only in a newly prepared network-none synthetic fixture. Current sources/Builder inputs remain byte-equal to the entry snapshot.

**STOP — CP15B INDEPENDENT REVIEW COMPLETE.**


## TARGETED F1–F4 RECHECK

Date: 2026-10-07 (Pacific/Auckland). Same independent review role; review only.

**TARGETED RECHECK PASS**

F1–F4 fixes are independently verified. Original CRITICAL findings remaining: **0**.
Original IMPORTANT findings remaining: **0**. New CRITICAL findings: **0**.
New IMPORTANT findings: **0**. New regressions observed: **NO**.
Ready for Final Owner Review: **YES**. This is foundation review readiness; no LIVE
activation is authorized or claimed. This appended verdict supersedes the original
readiness verdict for the corrected implementation; the original review remains
byte-for-byte intact.

### Reviewed correction and evidence

Reviewed the corrected uncommitted implementation at the same worktree, branch and
unchanged exact HEAD/base `b973f039dfd6405d302409252ddbdc8f70584159`, the original review,
Builder's TARGETED F1–F4 CORRECTION, Server84 and relevant recovery/executor/pin/cost
code, adopted CP15A and its recorded Owner overlay. The correction diff is retained
at `/private/tmp/cp15b-targeted-correction.diff`. Implementation and copied documents
were checked unchanged during this review. Builder YES answers were not accepted as
proof.

Execution used `/private/tmp/cp15b-targeted-independent-recheck`, network-disabled
Node tests, actual file-backed SQLite50 and reviewer-owned PostgreSQL17 containers
`otr-cp15-recheck-fresh`, `otr-cp15-recheck-seeded`,
`otr-cp15-recheck-targeted` and `otr-cp15-recheck-reviewer`. All containers used
network none, no published ports and synthetic identities/policy. The retained
CP13A fixture was read only for pinned platform helper definitions. Reviewer tests
and logs remain outside the implementation. Only this report appendix was written
to the reviewed worktree. No implementation or Builder report edits, commit/push,
Hosted Dev/Production access, real secret provisioning/read or real provider call
occurred. Review-owned containers were removed after validation.

### F1 — FIX VERIFIED

`recover` completes retained-reference, custody and hash work, verifies stored
report/descriptor correlation, then invokes `authorizeResultDisclosure`. The real
repository checks exact current attempt identity and current owning task, Trip and
Source/material pins under the existing Account apply gate/SQLite transaction.
Owning admission is repeated after material/hash awaits. The executor performs a
final synchronous Account generation check with no await before evidence return.
Installation retains its separate current admission/publication fence.

The original reviewer-owned cold SQLite assertions now pass. An independently
extended file-backed matrix adds all nine requested modes plus revoke after the
first successful owning admission, representation retention revoke during custody,
and payload identity change during hash work. **14 cases pass**, including the two
original reproductions. A→B, A→B→A, final-generation change, Trip revoke before/
during custody/during admission, Source/representation revoke and attempt identity
change deny disclosure. Original retained bytes, response/usage correlation and
terminal responsibility remain; transport calls stay zero; no publication is
fabricated. Installation separately rejects revoked authority. Fresh authorized
recovery/install succeeds where allowed, while revoked material remains denied
without resurrection. Cold reopen/FK checks pass and the schema tail remains50.

### F2 — FIX VERIFIED

Server84 locks environment→integration, existing C shared gates and Account/Trip
admission advisory lock, then Trip SHARE and matching trip_members/journey_members
rows in ID order, before call UPDATE and admission/mark. Reserve follows the same
order. The existing `cp14_trip_access`/`cp14_call_admission` predicates still decide
access. The private lock helper returns void and creates no Trip grant or canonical
write capability; public/API/service/call-gateway direct execution is denied.

Reviewer-owned protected-root barriers pass **18 assertions**: revoke winning makes
mark wait then reject and leaves RESERVED; revoke rollback permits mark; mark
winning makes revoke wait and retains MAY_HAVE_STARTED; mark rollback leaves
RESERVED; committed revoke removes current access; concurrent marks permit exactly
one winner. The independently executed corrected suite additionally verifies linked
membership and owner revoke, kill/revoke/mark contention and rollback. No provider
transport ran. F1 independently fences subsequent disclosure/install.

Lock audit found no new inverse Trip→CP14 environment acquisition path in the
relevant protected roots or membership ordering change. Existing C scope gates are
acquired before Trip/membership/call locks; Source/canonical commands retain their
existing gate→scope→Trip→membership order and do not acquire CP14 environment locks.
Usage/observe roots retain request/call ordering and do not acquire these Trip locks
after call locks. Actual contention and unchanged C1 UNKNOWN/C2/C3 shared-lock race
complete without deadlock. This establishes the audited contract, not an assertion
that post-mark revoke can undo already possible external execution.

### F3 — FIX VERIFIED

The signed reserve command carries exact execution facts and their digest. Backend
reconstructs them from the admitted descriptor and compiled minimized envelope;
SQL independently compares them with the Security-selected scope and persists them
in immutable holds. Mark rechecks retained execution binding against current scope,
configuration, Account grant and hold. Exact reserve replay preserves historical
facts and cannot turn an old unexecuted call into a current mark.

The clean reviewer-owned protected-root matrix passes **140 checks**, including
12 individually substituted pins with correctly recomputed caller digests, separate
model/family/provider-config/price-ID substitutions, and nine committed rotations
covering prompt, envelope version/digest, minimizer version/digest, privacy profile/
digest, policy and output schema. Each rotation denies the old mark and stale new
admission, preserves old unexecuted and historical executed hold bytes, and admits a
fresh call only with current matching facts. CONFIG_ADMIN's appended, unselected
provider configuration cannot reserve real-dispatch authority. The corrected suite
also rejects invalid selected adapter/provider-config/price pins; Backend command
substitution controls deny before transport. Opaque scope identity alone is
insufficient. Model/config/price checks remain separate from the execution-pin map.

### F4 — FIX VERIFIED

The reviewer arithmetic vector retains ACTUAL_REPORTED token quality while an
independently calculated cache-miss/cache-hit/output sum returns exactly6 nanos with
ESTIMATED cost. It uses a semantic-invalid retained result: incurred usage survives
without raw rejected payload disclosure. Explicit unresolved billing applicability,
duplicate required price components and ambiguous relationships yield UNKNOWN cost;
missing usage remains UNKNOWN, never fabricated zero/actual. Exact command replay
is stable. Changed historical schedule ID/digest is rejected; calculation uses the
attempt's admitted historical schedule pin.

A reviewer-owned actual protected-journal test passes **5 assertions**: an estimate
and late admitted synthetic billing observation are each appended exactly once,
exact replay returns the same observation, actual billing supersedes the estimate
in the existing projection, and all fixture gates close. The late billing test does
not make schedule arithmetic actual. No FX, customer billing or local cost journal
was introduced; Server remains the sole usage/cost owner.

### Independent validation and preservation

| Check | Final observed result |
| --- | --- |
| Reviewer F1 file-backed cold recovery | PASS;14 cases, zero redispatch, retained bytes/responsibility, FK clean, tail50 |
| Reviewer F2 protected-root barriers | PASS;18 assertions, owner revoke/rollback, mark/revoke ordering, concurrent marks/helper privacy |
| Reviewer F3 protected-root matrix | PASS;140 checks, recomputed substitutions, rotations, current positive controls |
| Reviewer F4 mapper and journal | PASS;independent rational/cache/UNKNOWN/semantic-failure assertions plus5 journal/closure checks |
| Corrected delivered recovery/executor and CP13A selected tests | PASS;305 tests across4 files, including202 recovery/executor tests |
| Adapter and CP13B selected regressions | PASS;93 tests, truthful remote descriptor, raw evidence equality/minimization/domain fences |
| Corrected delivered targeted SQL suite | PASS;124 checks, membership/owner barriers, kill contention, pins and billing journal;0 provider calls |
| Complete Server84 security suite | PASS;104 checks,100 retained immutable holds, CLOSED end |
| Fresh1→84 and seeded83→84 | PASS;defaults CLOSED;historical rows/columns/unaffected functions preserved |
| Accepted Server83 compatibility | PASS;548 checks including75 residual assertions |
| CP13A Trip/Event/Source/Flight SQL | PASS;841 checks across7 unchanged files |
| Actual C1 UNKNOWN/C2/C3 shared-lock race | PASS;rollback, serialization and authority preservation |
| Actual A2 bridge | PASS;exact call+START/replay, old real mark CLOSED |
| Actual B2 firewall | PASS;143 tests, unchanged source, bounded15-second per-test budget |
| Exact migration/registry/preservation comparison | PASS;all88 manifest hashes, Server1–83 and all SQLite migration/registry bytes unchanged;84 Server migrations total |
| Adopted CP15A | PASS;byte-equal normative source, SHA25610140ecb152dd8beef392e35e38c6f59dfcc97ab65a46e8a21c952b25304f5d1 |
| Typecheck; lint/UI guard; Backend build | PASS;UI guard473 legacy occurrences/76 representative files |
| Changed implementation formatting; git diff --check | PASS |
| Full suite | Not rerun as permitted;no implementation regression appeared in the required recheck. Original exact-base comparison remains0 new full-suite failures,1 shared Ledger baseline failure |

Temporary reviewer-fixture setup errors (invalid SQLite retention marker, config
CAS/Account binding and compatibility initial gate state) were corrected in the
external test copies. Final checks above pass without changing implementation,
weakening assertions or classifying F1–F4 as baseline failures.

TEST/PRODUCTION remain structurally closed, DEV defaults false/killed, and CONFIG_ADMIN
cannot activate. Missing monetary policy denies admission; atomic resource bounds
and immutable holds remain. UNKNOWN/lost ACK cannot authorize redispatch/refund;
old CP14 calls cannot upgrade. No live startup Flight factory/resolver/endpoint is
wired. Vision remains CLOSED, fallback/raw attachment default OFF, minimization and
prompt-injection boundaries hold. Remote descriptors remain REMOTE_MODEL; model
results create no Event/Person/member/booking authority. CP13B/CP13A, the inbound/
outbound firewall, sole sync_operations scheduler and five C denials are preserved.
Documentation continues to distinguish this CLOSED foundation from LIVE activation.

### Required answers

| Required answer | Result |
| --- | --- |
| F1 FIX VERIFIED | YES |
| F2 FIX VERIFIED | YES |
| F3 FIX VERIFIED | YES |
| F4 FIX VERIFIED | YES |
| Original CRITICAL findings remaining | 0 |
| Original IMPORTANT findings remaining | 0 |
| New CRITICAL findings | 0 |
| New IMPORTANT findings | 0 |
| New regressions | NO |
| A→B→A recovery can disclose evidence | NO |
| Trip revoke can bypass recovery disclosure fence | NO |
| Trip revoke winning before mark can authorize mark | NO |
| Mark winning before revoke retains possible-execution responsibility | YES |
| New deadlock/lock inversion found | NO |
| Prompt pin enforced | YES |
| Envelope pin enforced | YES |
| Minimizer pin enforced | YES |
| Privacy pin enforced | YES |
| Policy pin enforced | YES |
| Opaque scope ID alone can bypass selected pins | NO |
| Schedule-derived cost quality | ESTIMATED |
| Ambiguous billing applicability can claim ACTUAL_REPORTED | NO |
| Missing usage remains UNKNOWN | YES |
| Server1–83 unchanged | YES |
| Server84 additive | YES |
| SQLite51 required | NO |
| TEST/PRODUCTION structurally CLOSED | YES |
| DEV default CLOSED | YES |
| UNKNOWN protection preserved | YES |
| Real secret/provider call occurred | NO |
| Inbound/outbound firewall preserved | YES |
| Raw evidence equality preserved | YES |
| CP13B/CP13A authority preserved | YES |
| sync_operations sole scheduler | YES |
| Five C denials unchanged | YES |
| Runtime/provider gates CLOSED | YES |
| Ready for Final Owner Review | YES |

STOP — CP15B TARGETED INDEPENDENT RECHECK COMPLETE.
