# CP14 — Independent final closure review

Date: 2026-10-07 (Pacific/Auckland). Review only.

**FINAL CLOSURE PASS WITH REQUIRED CORRECTIONS**

**New findings: 0 CRITICAL, 1 IMPORTANT. CP14 ready for Final Owner Closure: NO.**

Persistence, C2, A2 and B2 coexist as a CLOSED foundation with distinct durable owners, no demonstrated cross-path execution or consent leakage, and exact recovery rather than blind redispatch. One additional inbound admission race permits a NEW Review Decision after its evidence becomes stale during decision custody. Correct F1 and independently recheck before final closure. The existing CP13A boundary prevents stale ACCEPT from preparing an Event; this is not a demonstrated unconfirmed canonical write or a duplicated dispatch/cost authority.

## Snapshot, scope and preservation

Reviewed branch: `integration/cp14-intelligence-final` in `/Users/xoery/.codex/worktrees/cp14-intelligence-final/otr-mobile-canonical`. HEAD equals the requested accepted base, `cbd11b414a691b4f3761b02877b45ef9b11545a8`. Review includes the pending integration tests/documentation and new Final Integration report; those files are not part of HEAD alone.

| Accepted stage                  | Commit                                     |
| ------------------------------- | ------------------------------------------ |
| Persistence                     | `439168065df182975dda03a75e94908f8d9cc389` |
| C2                              | `2b88464f259b3daa69fe6621b988838d5de2806f` |
| A2                              | `508d79efb865ac8d7fc21ff949b6e6a12746f39a` |
| B2 / requested integration base | `cbd11b414a691b4f3761b02877b45ef9b11545a8` |

Git ancestry checks establish this order. Independently recomputed all 86 historical source hashes in `CP14_PERSISTENCE_BASELINE_HASHES.json` and compared the bytes with its exact pre-Persistence base. The migration registry comparison removes only the authorized SQLite50 import/entry; SQLite1–49 and Server1–82 match. Nine accepted implementation/review reports match their owning accepted commits. Server migration count is83, SQLite tail is50; no84/51.

Accepted hashes remain:

```text
Server83  c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93
SQLite50  63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0
```

Exact pending tracked diff consists of `backend/src/inboundAiClient.test.ts`, `src/data/repositories/intelligenceContinuationRepository.test.ts`, and API_CONTRACT / ARCHITECTURE / DATA_MODEL / OFFLINE_SYNC / CURRENT_IMPLEMENTATION_STATE. The Final Integration report is additional untracked input. **Integration production implementation changes:0.** The review preserves every entry-hashed input and adds only this report. No commit/push, Hosted Dev/Production access, provider/public-client activation or legacy Web inspection/modification.

Authority inputs include the final integration report and exact tests/diff; accepted Persistence, C2, A2 and B2 reports and appended independent rechecks; CP12 contracts and corrected addendum/Red Team; CP13A final implementation/review and CP13B final integration; current contract/model/offline/handoff and Data Health documentation; Server83/SQLite50. Owner VerifiedCallContextV1, CLOSED A2 harness, B2 lifecycle and C2 queue/central-owner approval were used to interpret scope. Accepted appended rechecks supersede historical pending findings. Builder YES answers were checked independently rather than adopted as verdicts.

## F1 — IMPORTANT: evidence can advance during NEW decision custody

**Location:** `backend/src/inboundAiClient.ts:938–963` (owning assessment/freshness gate), `:1009` (awaited decision custody), `:1046` (NEW protected review reservation), and subsequent preparation/finish. Protected root: `supabase/migrations/20261006000100_external_integration_persistence.sql:1929`.

The accepted B2 F1 correction rejects all NEW dispositions when CP13B already reports INPUT_STALE, STALE_BASE_REVISION or CANONICAL_EVENT_MIRROR_INTEGRITY. That correction passes its accepted regressions. A later window remains: after the owning assessment, the adapter awaits private custody and protected-command authorization before reserving the NEW decision. It does not repeat or fence the owning Source/Input/Run/Candidate/Event freshness across that window. Server83 checks current authenticated user, grant, package, review_version and reservation scope, but cannot independently read the Mobile evidence observations.

**Deterministic independent reproduction:**

1. Submit a valid package and retain its NEEDS_REVIEW proposal; there is no existing decision.
2. Authenticate the fixture's OTR_USER and choose ACCEPT, REJECT or DEFER in a fresh case.
3. At the decision `custody.put` boundary, advance the retained Source `row_revision`, after the adapter's successful owning assessment and before the private put returns/protected reservation runs.
4. Keep the displayed package/review/Run/Input/Candidate request bindings unchanged. The material pins are now stale before NEW durable reservation.
5. Required rejection assertions fail for all three dispositions, both with the transport fixture and unchanged actual Server83 roots. Separate durable-state witness assertions pass through real Server83 and show exactly one new decision in each case.

| Disposition | Actual response                                                      | Durable new decision | CP13A / canonical consequence                                            |
| ----------- | -------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| ACCEPT      | UNKNOWN with retained Confirmation/slot/operation/intended Event IDs | 1                    | prepare invoked once, rejects stale evidence; canonical_acceptance=false |
| REJECT      | REJECTED                                                             | 1                    | no prepare; canonical IDs remain null                                    |
| DEFER       | DEFERRED                                                             | 1                    | no prepare; canonical IDs remain null                                    |

The ACCEPT prepare invocation is not a successful persisted preparation. No Event mutation, external-client impersonation, missing user consent, outbound execution or model charge is demonstrated. Severity is IMPORTANT under the request's stale-decision criterion, counted once across three dispositions.

The same reviewer rejection tests also fail against an exact-base archive. Thus F1 is **a newly discovered accepted-implementation gap, not a production-code regression introduced by the final integration diff**. It is not the historical B2 stale-before-decision finding reopened without evidence: its accepted vectors remain passing; this test advances evidence later, while custody is awaited. The new test failures are separate from the original full-suite baseline failure.

**Required correction:** make NEW decision admission enforce current owning evidence at the final reservation boundary across custody/authentication awaits, using the existing owning validation and appropriate pin/revision fencing. A check performed only before private I/O is insufficient. Preserve exact retained/sealed historical recovery, valid incomplete-proposal REJECT/DEFER, null nonaccept IDs, Account/Trip authorization and CP13A-only canonical mutation. Do not require READY for every disposition. No new decision journal, scheduler or migration is justified by this finding.

Add deterministic barrier regressions for all three dispositions and current Candidate/material/Event/Run bindings at the remaining asynchronous boundaries, with unchanged-evidence and sealed historical recovery positive controls. Confirm real-root decision count remains zero for rejected NEW stale decisions. Reconcile the Final Integration report's “stale evidence can create new decision: NO” after a targeted independent recheck. No implementation, test or Builder-report correction was made by this review.

## Independent authority map

| State / identity                | Sole owning truth / boundary                                                                                                       | What does not confer authority                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Account/auth                    | Existing secure session and AccountRequestContext generation/apply gate; trusted host authentication and current SQL authorization | Equal Account UUID after A→B→A; caller verified flags; persisted process generation                       |
| Scheduler/claim                 | Existing `sync_operations` repository/engine and central operational-sync owner                                                    | Task state, package presence, wake signal, timer/lease age                                                |
| Logical continuation            | SQLite50 `intelligence_continuations` through its repository                                                                       | Queue COMPLETED or a package with equal UUID                                                              |
| Concrete attempt                | SQLite50 `intelligence_continuation_attempts`, sequence/CAS/policy/fence admission                                                 | Queue attempt_count; timeout; synthetic call label alone                                                  |
| Integration/config/price        | Server83 protected environment/integration/provider-config/price roots and immutable snapshots                                     | Router projection; caller config; local meter                                                             |
| External call                   | Server83 `external_integration_calls`, dedicated reserve/START/dispatch/recovery roots                                             | Local RUNNING; fake execution; missing response                                                           |
| Real usage/cost/quota           | Server83 usage events, protected aggregation/admission and pinned prices                                                           | Local attempt summaries; synthetic meter; inbound evidence                                                |
| Inbound client/grant            | Server83 client identity/grant roots under authenticated dedicated context                                                         | Package ID, external text, OTR_USER claim in request                                                      |
| Package                         | Server83 `inbound_ai_import_reservations` and immutable admitted private material                                                  | A continuation/request UUID equal to package ID                                                           |
| Invocation                      | Server83 `inbound_ai_invocations` plus its generic INBOUND_TOOL call/START                                                         | Repeated submit; new current config; elapsed time                                                         |
| Proposal/version                | Server83 package review_version/result digest/Run refs select digest-bound CP13B projection content                                | Advisory SUMMARY/INTERPRETATION; schema compliance; model confidence                                      |
| Review Decision                 | Server83 authenticated `inbound_ai_review_decisions` reservation/observation                                                       | Proposal/publication; external principal; synthetic result. F1 affects NEW freshness, not actor ownership |
| Source/Input/Run/Candidate      | Existing Track C / CP13B repositories and immutable publication/lineage contracts                                                  | External model item tokens; equal filenames/bytes; package status                                         |
| Confirmation/output slot        | Existing CP13A reviewed preparation, claim/CAS/receipt lifecycle; B2 retains exact decision selection IDs before prepare           | Proposal READY; reservation success as canonical acceptance                                               |
| Event                           | Existing protected canonical Event commands/receipts through CP13A's admitted proof                                                | B2 status/decision; synthetic local result installation                                                   |
| Private material/result custody | Admitted integrity-checked content ports; retained reference/digest selects exact material                                         | Telemetry; absent bytes; process-local fixture map as production persistence                              |
| Attention/debug/Health          | Read-only projections of the independent retained domain/queue/execution/install/meter/review facts                                | Generic pending sync, Ledger activity totals, notification-ready as notification sent                     |

No duplicate canonical, security or real cost owner was found. Injected TEST fixture journals model closed seams and are not installed production stores. Process-local scheduler/context maps coordinate a pass; durable queue/journal and a freshly captured Account context govern recovery. Missing exact custody fails closed. Live custody and trusted issuer/runtime provisioning remain deferred.

## Integrated boundary results

| Review target               | Independent result and practical scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Namespace collisions        | Reviewer deliberately reused package UUID as continuation task, attempt/request/key/call-correlation references, and Candidate UUID as another task. Separate typed, Account-scoped repositories do not alias reads, writes, review or execution. Protected actual B2 roots and the combined A→B→A probe pass. Local call-reference collision is not a fabricated real provider dispatch.                                                                                                                                                                                                                       |
| Inbound → outbound firewall | C2 scheduling installed over the same native SQLite50, with A2 route/harness/reservation spies and outbound call/usage counters. Thirteen lifecycle vectors cover submit/status, ACCEPT/REJECT/DEFER, refresh, stale all-disposition rejection, package/invocation/status/decision/prepare loss and cold reopen. Scheduler is exercised after lifecycle steps and reconstructed after reopen: zero outbound continuation/attempt, routing/executor/reservation, model usage/cost or fallback/shadow work. Pass with transport fixture and actual Server83. F1's stale custody admission is separately reported. |
| Outbound → inbound firewall | Actual Server83 reserve+START/CLOSED bridge and one explicit admitted fake result install leave inbound client/grant/package/invocation/decision counts unchanged. Synthetic installation creates no inbound consent.                                                                                                                                                                                                                                                                                                                                                                                           |
| Scheduler/dependencies      | Sole queue/central timer remains; default continuation adapter is null. Wake is evaluation-only. Its COMPLETED cannot satisfy intelligence-success dependencies. Model sequence differs from queue attempts/signals. Re-ran C2 signal/claim/CAS races, completed re-arm, newer-signal preservation, uncertainty/competing start, malformed quarantine and generic Health dependency protections.                                                                                                                                                                                                                |
| Five C denials / Ledger     | C_PREPARE_CONFIRMATION, C_EXECUTE_EVENT_SLOT, C_FINALIZE_EVENT_SLOT, C_ADMIT_CAPTURE_SOURCE and C_REVOKE_EVENT_SLOT remain unconditionally denied even with permissive filters. Accepted denial tests pass; integration changes neither guard nor scheduler implementation. Ledger activity/UI remains Ledger-only.                                                                                                                                                                                                                                                                                             |
| Outbound execution          | Constructors remain acceptance-only/unwired; no startup factory, provider SDK/network/secret resolver. Built Backend has no closed harness/inbound constructor. Real Server83 mark-dispatch rejects CP14_RUNTIME_CLOSED; runtime_enabled=false is structurally enforced. Local synthetic RUNNING/TERMINAL does not write Server83 MAY_HAVE_STARTED/RUNNING.                                                                                                                                                                                                                                                     |
| A2 final admission          | Independent original F1 barriers now pass against corrected code: config/kill/disable/Trip/fence changes during synthetic begin prevent fake execution. Existing full-suite final CAS/Account/START/failed COMMIT tests pass. Exact START/server eligibility followed by final local admission and synchronous post-COMMIT/gate-release handoff remain intact.                                                                                                                                                                                                                                                  |
| Outbound UNKNOWN / loss     | START ACK loss requires exact durable START plus positive synthetic-undispatched proof; possible execution, timeout, result/custody/meter loss, lease/process loss retain exact responsibility. UNKNOWN never auto-falls back or redispatches. Late meter/install rollback/replay does not call fake again. Separate terminal-only linked fallback and shadows remain isolated.                                                                                                                                                                                                                                 |
| Inbound UNKNOWN / loss      | Actual B2 roots exercise package/material/invocation/status/decision/prepare response loss. Same package/Run/Candidate/decision/selection IDs recover. Uncertain ACCEPT without exact prepared evidence returns UNKNOWN rather than preparing again. Canonical uncertainty remains CP13A exact receipt recovery; no B2 command fallback.                                                                                                                                                                                                                                                                        |
| Consent/evidence            | MATERIAL alone supplies admitted evidence; SUMMARY and INTERPRETATION remain advisory. Proposal creates no decision or new canonical authority IDs. REVIEW requires real verified OTR_USER. Exact sealed historical recovery survives refresh; valid REJECT/DEFER have null canonical IDs. NEW freshness has F1 exception.                                                                                                                                                                                                                                                                                      |
| N→M / augmentation          | Full B2 and CP13B regressions exercise one material→multiple legs, multiple materials→one occurrence, repeated passenger evidence, contradictions, missing-arrival completion and unrelated/date/reverse-route flight separation. Existing-target fact completion uses supported UPDATE/base semantics; evidence consolidation does not authorize unsupported participant mutation.                                                                                                                                                                                                                             |
| Lineage / duplication       | CP13A/B successful CREATE claims, UNKNOWN predecessor and reviewed split/merge lineage regressions pass. Reprocessing cannot manufacture independent CREATE purpose. Actual Server83 partial uniqueness/current UNKNOWN protection also prevents competing active ACCEPT selection authority. No duplicate Event was demonstrated.                                                                                                                                                                                                                                                                              |
| Account / Trip              | One combined reviewer case retains WAIT, pending result/install and metering responsibility plus inbound package/proposal/sealed ACCEPT. B reads and stale A callbacks reject; return to A requires fresh generation, exact retained recovery succeeds, and revoked Trip blocks status/decision/install. Historical execution/metering responsibility survives without current disclosure authority. Pass with actual Server83 B2 roots.                                                                                                                                                                        |
| File-backed restart         | Native migrated SQLite close/reopen in firewall and combined cases, original B2 real-root suite and original C2/A2 full regressions preserve WAIT/RUNNING/UNKNOWN/result-pending/canceled-late responsibility, interrupted package/invocation, NEEDS_REVIEW, sealed decisions and lost prepare response. Reconstructed injected custody ports are test infrastructure, not proof of live provider/custody provisioning.                                                                                                                                                                                         |
| Privacy / logging           | Scoped persistence/adapter/logging inspection and Server83 grammar checks show safe IDs/digests/finite reasons/nullable units. Prompt/conversation/ticket/email/passenger/PNR/attachment/URL/secret/raw provider-error content is excluded from control-plane telemetry. Private content remains admitted custody; no training/Product Intelligence path.                                                                                                                                                                                                                                                       |
| Usage / cost                | Server83 alone owns real outbound usage/cost/quota with immutable price pins and independent nullable quality. Missing usage stays unknown; fallback/shadow calls correlate separately. Synthetic acceptance is nonbillable. INBOUND_TOOL retains null provider/model/model units/cost. No FX conversion/repricing/customer billing.                                                                                                                                                                                                                                                                            |
| Data Health                 | Queue pass, task/pass/outstanding waits, attempt/execution, call/usage, result/install/publication and inbound package/proposal/decision remain separate types/stores. Health/maintenance cannot age-delete UNKNOWN/responsibility or treat wake completion as generic intelligence success. Three independent Health dependency probes pass; no UI required or added.                                                                                                                                                                                                                                          |
| Documentation / gates       | Current docs distinguish implemented CLOSED foundations from activation. Real dispatch/credentials, public ChatGPT/Claude/MCP, production OAuth/JWT, live custody, Admin Portal/billing, participant/member augmentation, booking persistence, CXE adaptive runtime, Product Intelligence/training and notification sending remain deferred/unactivated. The stale-decision safety claim requires F1 correction; no separate activation overclaim found.                                                                                                                                                        |

## Independently executed validation

Execution used `/private/tmp/cp14-closure-review`, a copy of the actual integration inputs, and `/private/tmp/cp14-closure-base`, an exact Git archive of the requested base. Both use the same already-installed canonical dependency tree; no dependency install or network registry workaround. The unrelated calling checkout's dirty work is preserved.

| Check                                                                                  | Result                                                                                                                      |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Original integration full suite                                                        | 200 files;199 passed /1 failed. 2,411 tests;2,410 passed /1 failed                                                          |
| Exact-base full suite, same dependencies/options                                       | 200 files;199 passed /1 failed. 2,408 tests;2,407 passed /1 failed                                                          |
| New original full-suite failures                                                       | **0**                                                                                                                       |
| Reviewer firewall + combined namespace/Account/Trip tests                              | **14 PASS**, transport fixture; **14 PASS**, actual Server83                                                                |
| Reviewer C2 races / Health / A2 admission-recovery probes                              | **37 PASS** across3 files (20 C2,3 Health,14 A2)                                                                            |
| Untouched delivered B2 tests through actual Server83                                   | **59 PASS**                                                                                                                 |
| Actual outbound wait/wake/router/START/CLOSED/fake/install/attention bridge            | **1 PASS**                                                                                                                  |
| Reviewer NEW custody-window stale rejection assertions                                 | **3 expected-behavior failures** on integration snapshot; same3 fail on exact base; same3 fail through actual Server83 — F1 |
| Separate real-root durable-state witnesses for F1                                      | **3 PASS**, one new decision per disposition; no canonical acceptance                                                       |
| Fresh Server1→83 and seeded exact82→83 replay                                          | **PASS**, historical columns/functions and seeded synthetic auth row preserved                                              |
| Accepted Server83 / B2 preflight checks                                                | **555 PASS**, including75 accepted residual checks                                                                          |
| SQLite50 migration / FK / protection / reopen                                          | **PASS** in full suite and native cross-path probes                                                                         |
| CP13A/B, Capture, Account/auth, sync, Day, Ledger maintenance, Data Health regressions | **PASS** in original full suite, apart from the separately named baseline architecture assertion                            |
| Typecheck                                                                              | **PASS**                                                                                                                    |
| Lint including UI guard                                                                | **PASS**;473 historical legacy occurrences /76 representative UI files                                                      |
| Backend build                                                                          | **PASS** in disposable output; closed adapter constructors absent from bundle                                               |
| Input hashes, ancestry, migration/report preservation and diff whitespace              | **PASS**                                                                                                                    |

The sole original failure in both independent full-suite runs is `src/domain/architectureBoundary.test.ts`: existing `LedgerExpenseDetailScreen` imports the API layer. This is a baseline failure, not a full-suite PASS. The Builder reported another timestamp-sensitive privacy-canary baseline issue in its run; it did not fail in either independent run, and these counts report what actually executed. F1 reviewer failures are neither hidden nor included in the original 2,411-test count.

Initial supplemental fixture assertions had incorrect public decision-field assumptions and invalid wait/config fixture shapes; those were corrected in disposable reviewer copies. The original suites and production files were not changed to obtain passing counts. Rejected prepare invocation is separately distinguished from persisted preparation in the final F1 witnesses.

Database execution used only new review-owned `otr-cp14-closure-independent`: existing cached PostgreSQL17.6 image, `--network none`, no published ports and synthetic identities. Replay reads local schema-only platform material and hash-pinned helper bodies from the previously existing CP13A disposable fixture. Colima's stale local daemon was restarted to access this fixture; existing local Supabase containers were not queried or used for acceptance. The CP13A fixture was started only for these read-only helper reads and restored to stopped; the new review database was removed afterward. No hosted services or providers were used.

This certifies bounded CLOSED acceptance and protected roots, not real device/provider execution, live custody/issuer provisioning, Source IO_UNKNOWN provider-terminality closure or public activation. Earlier CP13 security/runtime limitations remain unchanged.

Reproduction artifacts remain outside the repository:

```text
/private/tmp/cp14-closure-review/backend/src/cp14ClosureIndependent.test.ts
/private/tmp/cp14-closure-review/src/data/repositories/cp14ClosureC2.test.ts
/private/tmp/cp14-closure-review/src/data/repositories/cp14ClosureA2.test.ts
/private/tmp/cp14-closure-review/src/data/health/cp14ClosureHealth.test.ts
/private/tmp/cp14-closure-review/src/data/repositories/cp14ClosureBridge.test.ts
/private/tmp/cp14-closure-entry-hashes.json
/private/tmp/cp14-closure-full.log
/private/tmp/cp14-closure-base-full.log
/private/tmp/cp14-closure-probes-final.log
/private/tmp/cp14-closure-probes-real-final.log
/private/tmp/cp14-closure-independent-races.log
/private/tmp/cp14-closure-inbound-real.log
/private/tmp/cp14-closure-outbound-real.log
/private/tmp/cp14-closure-decision-race.log
/private/tmp/cp14-closure-decision-race-real.log
/private/tmp/cp14-closure-decision-race-base.log
/private/tmp/cp14-closure-decision-witness.log
/private/tmp/cp14-closure-replay.log
/private/tmp/cp14-closure-server83.log
/private/tmp/cp14-closure-typecheck.log
/private/tmp/cp14-closure-lint.log
/private/tmp/cp14-closure-build.log
```

Reviewer copies preserve implementation and add only assertions/fixture locations. Use the snapshot's Vitest with `--configLoader runner --maxWorkers=1`. Firewall/combined cases match `REVIEW firewall|REVIEW combined`; F1 rejecting assertions match `REVIEW NEW`, and positive observed-state witnesses match `REVIEW durable witness`. Actual B2 roots additionally require `CP14_B2_SERVER83=1`, `CP14_TEST_CONTAINER` pointing to a separately replayed/seeded isolated fixture, and `--testTimeout=60000`. The bridge copy changes only its fixture container name. Recreate a disposable database before repeating real-root runs; the reviewed fixture is intentionally removed.

## Required answers

| Required answer                                          | Result                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Accepted ancestry intact                                 | YES                                                                           |
| Server83/SQLite50 unchanged                              | YES                                                                           |
| Authority collision exists                               | NO                                                                            |
| Namespace collision grants authority                     | NO                                                                            |
| sync_operations sole scheduler                           | YES                                                                           |
| Wake COMPLETED leaks intelligence success                | NO                                                                            |
| Five C denials unchanged                                 | YES                                                                           |
| Synthetic harness production reachable                   | NO                                                                            |
| Second dispatch authority exists                         | NO                                                                            |
| Real Server83 dispatch CLOSED                            | YES                                                                           |
| Outbound UNKNOWN blind redispatch possible               | NO                                                                            |
| Inbound can automatically invoke A2                      | NO                                                                            |
| Inbound can create outbound model usage/cost             | NO                                                                            |
| Outbound creates inbound authority                       | NO                                                                            |
| Proposal creates consent/canonical authority             | NO                                                                            |
| Stale evidence can create new decision                   | **YES — F1 custody-window admission**                                         |
| External client can forge OTR_USER                       | NO                                                                            |
| Direct Event write outside CP13A                         | NO                                                                            |
| Duplicate CREATE authority possible through reprocessing | NO                                                                            |
| Passenger evidence creates Person/member                 | NO                                                                            |
| Participant/member augmentation remains deferred         | YES                                                                           |
| A→B→A cross-path fenced                                  | YES                                                                           |
| Cold restart/recovery safe                               | YES — within tested CLOSED contracts; NEW decision freshness has F1 exception |
| Raw private evidence leaks to control-plane telemetry    | NO                                                                            |
| Server83 remains usage/cost authority                    | YES                                                                           |
| Inbound content enters Product Intelligence/training     | NO                                                                            |
| Runtime/provider/public-client gates CLOSED              | YES                                                                           |
| Integration production-code changes                      | 0                                                                             |
| Full-suite new failures                                  | 0                                                                             |
| New CRITICAL findings                                    | 0                                                                             |
| New IMPORTANT findings                                   | **1**                                                                         |
| CP14 ready for Final Owner Closure                       | **NO**                                                                        |

**STOP — CP14 INDEPENDENT FINAL CLOSURE REVIEW COMPLETE.**

## TARGETED B2 F2 FINAL CLOSURE RECHECK

Date:2026-10-07 (Pacific/Auckland). Same independent Final Closure Review role; review only.

**TARGETED FINAL CLOSURE RECHECK PASS**

**B2 F2 FIX VERIFIED: YES. Original Final Closure IMPORTANT findings remaining:0. New CRITICAL findings:0. New IMPORTANT findings:0. New regressions:NO. CP14 ready for Final Owner Closure:YES.**

This appendix resolves the original Final Closure F1, tracked by the B2 owner as F2. All earlier review text remains historical and is preserved byte-for-byte. The accepted B2 F1 stale-before-decision correction/recheck remains valid. This verdict covers the reviewed corrected CLOSED foundation; it authorizes no runtime/provider/public-client activation.

### Exact reviewed correction and input preservation

The correction is uncommitted in `/Users/xoery/.codex/worktrees/cp14-inbound-ai-client/otr-mobile-canonical`, branch `intelligence/cp14-inbound-ai-client`, HEAD `cbd11b414a691b4f3761b02877b45ef9b11545a8`. The original integration worktree still has its earlier production bytes. Independent execution used `/private/tmp/cp14-f2-recheck`, copied from the actual integration inputs and overlaid with exactly three corrected production files:

| Corrected production source                                | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `backend/src/inboundAiClient.ts`                           | `5f7b02ebfc8b6936e70aff4e86d77252fc6715c030d9034bc10456f0b891ceaf` |
| `src/data/repositories/tripImportAdmissionRepository.ts`   | `1a9493dec5849358d628dd0e0ebdf1dfbcba7bbe7525038a89a99f6c1b302a66` |
| `src/data/repositories/flightImportClosureOrchestrator.ts` | `85af1ad6b261661e34fe9d7016f135d40cbef79f83a0bccfd1d7d601ed3968ae` |

Read the updated Builder F2 section, exact adapter/repository/orchestrator diff, corrected tests and scoped API/data/offline/handoff wording; accepted B2 F1 correction/recheck; unchanged integration tests/report and Server83 decision root/uniqueness contract. Builder results were treated as claims until independent executions completed.

The original Final Integration tests and report were not changed, including in the execution snapshot. The corrected B2 test file was copied separately as `b2F2Delivered.test.ts` so it could run beside those original inputs. Reviewer tests add only disposable assertions and use the existing native SQLite and protected-root fixtures. No implementation, Builder report, integration test/report, accepted independent B2 review, migration or current-state document was edited by this recheck.

All88 migration/registry paths independently match the accepted B2 base. Server83/SQLite50 hashes equal the hashes in the original review; tails remain83/50, with no84/51. A2/C2, Account gate implementation, central scheduler and five C denials are unchanged. Before append, all1,052 entry-hashed integration files and1,050 B2 files remain unchanged. Original review prefix SHA-256: `0c250d6591c37660fba6852aa001418dde1bcdff20d43a1acc0f48e9a88f0f3f`.

**Readiness scope:** YES applies to this tested corrected foundation, with the above exact corrected sources overlaid on the unchanged integration inputs. The unchanged integration branch alone still contains the pre-F2 adapter. Adoption of the corrected bytes is not silently performed or represented as committed by this review.

### Original finding independently blocked

The exact three reviewer-owned Source-advance custody barriers from the original Final Closure review now reject ACCEPT, REJECT and DEFER. They pass with normal fault injection and actual unchanged Server83 roots.

For each original vector, independent before/after witnesses show zero NEW Review Decision, exact review-key absence, zero CP13A prepare invocation/persisted preparation, no new local Confirmation/output-slot/sync-operation, unchanged canonical Event rows and no outbound continuation/attempt/call/usage. Actual-root witnesses additionally compare existing server Confirmation/slot/Event row fingerprints and non-INBOUND_TOOL call/usage counts. Thus the expected rejection is not inferred merely from a thrown error. The private decision content prepared before rejection remains non-authoritative; deterministic IDs inside that content are not a persisted intended Event or consent authority.

### Final freshness matrix and concurrency

Independent reviewer coverage comprises123 cases, plus17 preserved original reviewer firewall/namespace/custody cases:

- **66 custody cases:** all three dispositions across22 changes: Source row revision; material digest; Candidate ID/hash/retention; Run generation/retention/Input digest/ID; Input ID/observed revision/digest; Event base revision; genuine proposal refresh/review_version; inconsistent selected proposal digest; local/remote Trip admission loss; real Account A→B and A→B→A transitions; grant revoke/expiry; verifier review revoke/expiry.
- **39 post-assessment cases:** all three dispositions across13 owning local observations, changed after the repeated async assessment returns. Final read-only admission blocks stale Source/material, Candidate ID/hash/retention, Run generation/retention/digest/ID, Input ID/revision/digest and Event base. This independently tests the added final transaction rather than only the earlier repeated assessment.
- **18 controls:** sealed ACCEPT/REJECT/DEFER after changed Source evidence, refreshed proposal and native close/reopen; two held identical callers with evidence advancing before release; proposal refresh racing a held decision; current identical concurrent callers; synchronous COMMIT/gate-release handoff; and a correctly gated owning writer queued after final COMMIT.

The Run-identity corruption fixture updates dependent Run references together with FK checks restored; the final foreign-key check passes. Candidate generation is the owning Run generation, not a newly introduced counter. Proposal digest inconsistency fails closed and is not treated as a new admitted proposal. A genuine version refresh is separately exercised. Every rejected NEW vector checks retained decision absence and before/after authority witnesses.

The full delivered84-case F2 regression matrix also passes independently in both modes, including verifier, Account read, custody verification, package read, protected status, review context, published Run and owning-assessment asynchronous boundaries. Its positive controls confirm that remote call entry can acquire the existing Account gate and has no active SQLite transaction.

Actual Server83 concurrency retains at most one decision in the protected relevant scope. Current identical ACCEPT callers may invoke the idempotent owning prepare seam concurrently; they retain one Confirmation, one output authority set and one operation, with stable IDs. A preparer invocation count is not a count of distinct preparation authority. If evidence advances while both callers are held before final admission, both reject and retain zero decisions. Concurrent refresh likewise blocks admission of the held old proposal.

### Async ordering and authority audit

The corrected ordering is:

1. Original strict authenticated decision and proposal binding; initial CP13B assessment.
2. Non-authoritative private decision custody; protected-command authentication and custody verification through the unchanged gateway.
3. Fresh current package/status authorization and comparison of reservation, package digest, review_version, publication fence, package result and selected proposal-content digest.
4. Fresh review context and published Run generation/Input digest; repeated CP13B assessment with the existing all-disposition stale policy. READY remains ACCEPT-only.
5. Existing Account-gated SQLite transaction invokes extracted existing `closureEvidence` / `pin` checks, comparing current retained Candidate/Run/hash/generation, the entire exact Input set/material pins and applicable Event/base revision. Trip admission and Account generation are independently rechecked.
6. Successful transaction completion and Account-gate release invoke the supplied handoff synchronously. The adapter starts the exact authenticated/digest-bound protected reserve call in that same callback, with no further local admission await after release. Expiry and Account generation are checked synchronously at handoff.
7. Server83 separately performs its unchanged atomic current user/grant/Trip/package/version/uniqueness admission. Remote execution is outside the SQLite transaction and Account gate; CP13A independently owns later preparation.

There is an existing post-COMMIT Account-context recheck while the Account gate remains held. It is not an unprotected release-to-handoff interval: a reviewer queued a valid owning writer at COMMIT, observed that it could not run while the gate remained held, and verified that protected handoff began before that writer. No local admission await follows gate release. Direct out-of-contract database tampering is not granted authority by this guarantee.

`closureEvidence` is extracted from the existing repository reader, with Run generation included; it reuses existing evidence/lineage/Input/material checks. `admitClosureReview` reads and compares current observations only. The orchestrator merely exposes this owning seam; matching/closure rules remain in CP13B, and the seam creates no Review Decision, Event, Confirmation, scheduler or new durable store. Server83 remains Review Decision authority; CP13A remains preparation/canonical authority. This is a local revision fence and a separate protected server admission, not a distributed transaction or new lock authority.

### Positive controls, historical recovery and integration preservation

Unchanged current ACCEPT/REJECT/DEFER work exactly once in durable authority terms. Nonaccept keeps all four canonical IDs null. Existing dedicated incomplete REJECT/DEFER, ambiguous REJECT and unsupported passenger-augmentation DEFER controls pass; the correction does not impose READY on nonaccept.

For every sealed disposition, independent tests change evidence, refresh the proposal, close/reopen native SQLite and recover the original result. A NEW-admission sentinel is never called; no replacement decision/selection IDs or repeated preparation appears. Current grant loss then denies recovery disclosure without deleting retained history. Accepted F1 stale Candidate/material REJECT/DEFER and stale ACCEPT tests remain passing.

Unchanged integration tests pass with corrected B2: inbound proposal/ACCEPT/restart with C2 installed creates no outbound wake or model cost; same-value package/task namespaces stay isolated across A→B→A; actual outbound reserve/START/CLOSED/fake/install/attention leaves inbound authority unchanged. Original reviewer firewall cases extend this to nonaccept, refresh, stale all-disposition rejection, response loss and cold restart. Sole queue ownership, wake-dependency semantics, UNKNOWN no redispatch, synthetic-only execution, usage/cost and proposal/decision separation, passenger non-authority, deferred participant augmentation and five C denials remain preserved in selected regressions and unchanged source checks.

### Independently executed validation

| Check                                                                                    | Result                                                                      |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Corrected complete B2 lifecycle, normal mode                                             | 141 PASS                                                                    |
| Corrected complete B2 lifecycle, actual Server83                                         | 141 PASS                                                                    |
| Original inbound B2/integration test file, normal                                        | 59 PASS                                                                     |
| Original inbound file's B2 lifecycle, actual                                             | 57 PASS; its two unchanged top-level integration tests run separately below |
| Reviewer123 cases + preserved17 original reviewer cases                                  | 140 PASS normal;140 PASS actual Server83                                    |
| Unchanged final inbound/namespace/outbound cross-path tests                              | 3 PASS normal;3 PASS actual Server83                                        |
| CP13A/B, interpretation, C2/A2, Account, sync and SQLite migration/FK/reopen regressions | 8 files /364 PASS                                                           |
| Fresh1→83 / seeded exact82→83 preservation                                               | PASS                                                                        |
| Accepted Server83 + B2 preflight                                                         | 555 PASS, including75 residual checks; gates CLOSED                         |
| Typecheck                                                                                | PASS                                                                        |
| Full lint / UI guard                                                                     | PASS;473 existing legacy occurrences /76 representative UI files            |
| Backend build                                                                            | PASS; no closed inbound/outbound constructors in runtime bundle             |
| Exact source/test/report preservation and whitespace                                     | PASS                                                                        |

The combined actual-root run passed338 tests across4 files. Its five deselections were the three obsolete observed-defect witnesses and the two top-level integration cases, which passed in the separate unchanged cross-path run.

Full suite was not rerun, as permitted: no new regression appeared. The original documented Ledger architecture-boundary baseline failure remains unchanged; selected passes do not erase that baseline.

The first real-root run failed the corrected B2 fixture's hard-coded container-name guard before lifecycle assertions. Only the review-owned network-none database was renamed to `otr-cp14-b2-preflight`; all corrected assertions and original integration files were preserved. It was later renamed to `otr-cp14-final-acceptance` for the unchanged outbound integration guard. Final runs above are the correctly configured executions. An initial reviewer concurrency assertion equated two idempotent prepare invocations with two durable preparations; it was corrected to assert the one retained Confirmation/operation/authority set. Neither fixture issue is hidden as a production baseline or used to justify an implementation edit.

Database work used only the new review-owned network-none container, cached PostgreSQL17.6 image, no published ports and synthetic identities. Replay reads schema-only local material and hash-pinned helpers from the existing CP13A disposable fixture, which was restored to stopped. The review-owned database was removed after testing. No Hosted Dev/Production, public client, live provider or credentials were accessed/activated. Existing live-custody/issuer/device/provider-terminality limitations remain unchanged.

Runnable reviewer copies, the original prefix, entry hashes and independent logs remain outside the repository:

```text
/private/tmp/cp14-f2-recheck/backend/src/f2IndependentRecheck.test.ts
/private/tmp/cp14-f2-recheck/backend/src/f2OriginalClosure.test.ts
/private/tmp/cp14-f2-original-review.md
/private/tmp/cp14-f2-recheck-entry.json
/private/tmp/cp14-f2-review-b2-normal.log
/private/tmp/cp14-f2-review-probes-normal-final.log
/private/tmp/cp14-f2-review-actual-final.log
/private/tmp/cp14-f2-review-integration-normal.log
/private/tmp/cp14-f2-review-integration-actual.log
/private/tmp/cp14-f2-review-regressions.log
/private/tmp/cp14-f2-review-replay.log
/private/tmp/cp14-f2-review-server83.log
/private/tmp/cp14-f2-review-{typecheck,lint,build}.log
```

Reproduce with Vitest `--configLoader runner --maxWorkers=1 --testTimeout=60000`. Reviewer selection is `RECHECK|REVIEW firewall|REVIEW combined|REVIEW NEW`; the three old observed-defect witnesses are intentionally excluded because they assert the obsolete admitted behavior. Real-root B2 additionally uses `CP14_B2_SERVER83=1` and its required isolated fixture name. Unchanged cross-path selection is `CP14 inbound|CP14 same UUID|CP14 final outbound`, with `CP14_SERVER83=1`, `CP14_B2_SERVER83=1` and `CP14_TEST_CONTAINER=otr-cp14-final-acceptance` for actual roots. Recreate/replay a disposable fixture before repeating actual tests.

### Required final answers

| Required answer                                        | Result                                                  |
| ------------------------------------------------------ | ------------------------------------------------------- |
| B2 F2 FIX VERIFIED                                     | YES                                                     |
| Original Final Closure IMPORTANT findings remaining    | 0                                                       |
| New CRITICAL findings                                  | 0                                                       |
| New IMPORTANT findings                                 | 0                                                       |
| New regressions                                        | NO                                                      |
| Original three custody-window vectors blocked          | YES                                                     |
| Candidate freshness fenced at final admission          | YES                                                     |
| Run/Input/material freshness fenced                    | YES                                                     |
| Event/base freshness fenced                            | YES                                                     |
| Trip revoke during custody fenced                      | YES                                                     |
| A→B→A during custody fenced                            | YES                                                     |
| Grant/auth revoke during custody fenced                | YES                                                     |
| Async admission gap remains before reservation handoff | NO                                                      |
| Valid current ACCEPT/REJECT/DEFER preserved            | YES                                                     |
| Historical sealed recovery preserved                   | YES                                                     |
| B2 F1 remains fixed                                    | YES                                                     |
| CP13B remains freshness authority                      | YES                                                     |
| CP13A remains canonical authority                      | YES                                                     |
| Inbound can automatically invoke A2                    | NO                                                      |
| Server83/SQLite50 unchanged                            | YES                                                     |
| sync_operations sole scheduler                         | YES                                                     |
| Five C denials unchanged                               | YES                                                     |
| Runtime/provider/public-client gates CLOSED            | YES                                                     |
| CP14 ready for Final Owner Closure                     | YES — reviewed corrected CLOSED foundation, scope above |

**STOP — CP14 TARGETED FINAL CLOSURE RECHECK COMPLETE.**
