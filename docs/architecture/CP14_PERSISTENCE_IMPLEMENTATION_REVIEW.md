# CP14 Persistence Independent Implementation Review

Date: 2026-10-06, Pacific/Auckland. Review only.

**Verdict: FAIL — ARCHITECTURE REVIEW REQUIRED**

**3 CRITICAL, 3 IMPORTANT, 0 MINOR. Ready for owner acceptance: NO.**

The dedicated-session ACL boundary and closed runtime defaults hold in the disposable tests. Authorization inside several permitted roots does not: a valid caller can substitute target scope, cross Account boundaries, or bypass SECURITY_ADMIN through CONFIG_ADMIN. Accounting and immutable request/result bindings also need corrections. These are implementation defects against the approved design; no second signed-attestation protocol or redesign of the accepted gateway authentication boundary is required. The verdict requires independent security/authority review after correction, before owner acceptance.

## 1. Reviewed state and authority

Reviewed worktree: `/private/tmp/otr-cp14-persistence`, branch `intelligence/cp14-persistence`. Exact HEAD and canonical base: `c4571746b0c300fa3b46842cd37745963567338c`. Builder changes are unstaged/uncommitted. The user-facing canonical checkout is on a different branch and was not used as the implementation under review.

Server83: `supabase/migrations/20261006000100_external_integration_persistence.sql`, SHA-256 `38c236f455a776891322d08a4586197239b4ad7e3a06854fac40a9d23bfe202d`. One migration adds fifteen tables, nine isolated roles, and 55 functions, including 24 SECURITY DEFINER functions. SQLite50 is `src/data/db/migrations/intelligenceContinuations.ts`.

Authority order: the user's review-only request and attached review instruction govern this task; approved CP14 preflight and `CP14_VERIFIED_CALL_CONTEXT_V1.txt` govern acceptance; Builder claims are evidence to verify, not authority. Historical reports' instructions describe their own checkpoints and do not authorize runtime activation in this review.

Inputs reviewed:

- `AGENTS.md`, current implementation handoff, PRODUCT, ARCHITECTURE, DATA_MODEL, API_CONTRACT, OFFLINE_SYNC, ENVIRONMENT_AUDIT and saved legacy audit. The legacy Web checkout was not accessed.
- CP14 exact preflight, owner VerifiedCallContextV1 clarification, next-stage plan, authority-split ADR, implementation report, validation JSON, security inventory and baseline hashes.
- CP12 Import architecture/contract, Intelligence Plugin contract and independent Red Team review/correction report, including lineage CREATE fencing, mixed-action CAS, pass completion versus quiescence.
- CP13A exact schema preflight, implementation report and independent review including R1–R3 recheck; CP13B final integration report.
- Actual Server83 SQL, SQLite50, persistence gateway/domain/repository/tests, disposable replay/acceptance scripts, affected maintenance/tests and existing Account apply gate, queue, Import/Source/Candidate/Confirmation/output-slot/recovery seams.

### Exact implementation diff

The declared 27 implementation/input files match the actual diff. No undeclared material implementation change was found.

Modified (10):

```text
docs/API_CONTRACT.md
docs/ARCHITECTURE.md
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/DATA_MODEL.md
docs/OFFLINE_SYNC.md
src/data/db/checkpoint11Integration.test.ts
src/data/db/database.test.ts
src/data/db/migrations.ts
src/data/operations/ledgerMaintenance.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
```

Added (17):

```text
backend/src/externalIntegrationPersistence.test.ts
backend/src/externalIntegrationPersistence.ts
docs/adr/2026-10-06-cp14-persistence-authority-split.md
docs/architecture/CP14_PERSISTENCE_BASELINE_HASHES.json
docs/architecture/CP14_PERSISTENCE_CONTROL_PLANE_IMPLEMENTATION_REPORT.md
docs/architecture/CP14_PERSISTENCE_CONTROL_PLANE_PREFLIGHT.md
docs/architecture/CP14_PERSISTENCE_SECURITY_INVENTORY.json
docs/architecture/CP14_PERSISTENCE_VALIDATION.json
docs/architecture/CP14_VERIFIED_CALL_CONTEXT_V1.txt
docs/architecture/OTR_INTELLIGENCE_NEXT_STAGE_PLAN.md
scripts/cp14/persistence-acceptance.py
scripts/cp14/replay-disposable.py
src/data/db/migrations/intelligenceContinuations.ts
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/repositories/intelligenceContinuationRepository.ts
src/domain/intelligence/persistence.ts
supabase/migrations/20261006000100_external_integration_persistence.sql
```

This review adds only this report. Temporary dependency linkage and disposable test resources were removed. No implementation/report correction, formatting pass, commit, push, Hosted Dev/Production access, deployed gate change, credential provisioning or provider call was performed.

## 2. Independent execution and limitations

### Server

A review-owned PostgreSQL17 container, `otr-cp14-independent-review`, used `--network none`, no published ports, synthetic identities and disposable local authentication only. Existing Builder containers were not mutated. Replay used the existing schema-only platform fixture and hash-pinned platform helper definitions from the existing local CP13A fixture; it was not a hosted production-platform clone.

The existing replay and acceptance scripts were evaluated with only their container name replaced in memory; source files were unchanged. Fresh1→83 and seeded82→83 passed. Historical public column definitions, existing public function bodies and seeded auth data remained unchanged on upgrade. Independently compared all82 historical server sources against `git show <exact-base>:<path>` byte-for-byte. All86 baseline manifest source hashes match the exact base. SQLite1–49 registration equals the base after removing only the new50 import/entry; historical standalone sources are byte-identical.

**383 existing server acceptance checks independently PASS**, including actual API-role rejection, dedicated principal/context matrix, grant/config CAS, nullable accounting, exact observation-key replay, quota admission concurrency, package/review recovery and closed runtime. Additional review-owned vectors exposed F1–F6 below; existing harness success therefore does not establish security acceptance.

Independent catalog enumeration checked roles/flags/memberships, effective function EXECUTE, schema/table/column/sequence privileges, ownership, ENABLE/FORCE RLS and default ACLs. All nine CP14 roles are NOLOGIN, NOINHERIT, non-superuser, non-bypass/non-creator roles. Their only incoming memberships are migration-owner administrative memberships with SET/INHERIT false; no outgoing role chain exists. Gateways have no table/column/sequence grants or schema CREATE. Writer roles have narrowly named table/column grants, no DELETE/TRUNCATE/DDL; the reporting reader has SELECT only. Fifteen tables are migration-owner-owned with ENABLE/FORCE RLS. No PUBLIC/anon/authenticated/service_role/authenticator EXECUTE on the55 new functions was found; actual API table/root attempts reject. No old public SECURITY DEFINER function was effectively executable by these CP14 roles in this fixture. No new sequence is introduced. Existing platform default function grants remain in the fixture; the new functions explicitly revoke them. This is a current-object proof, not a guarantee about future DDL.

All24 new SECURITY DEFINER functions pin `search_path=pg_catalog`. Business objects are qualified; new protected roots use fixed names, not dynamic SQL or caller-selected identifiers. No CP14 principal has a new canonical Event mutation edge. Their internal authorization/result bounds still fail as detailed below.

### Local/Backend regressions

**15 distinct files, 532 tests independently PASS** using the existing installed dependency tree and `npx vitest run --configLoader runner`. The13-file run passed429 tests; the two additional correctly named suites passed103. Earlier overlapping exploratory runs are not added to this count.

```text
backend/src/externalIntegrationPersistence.test.ts
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/db/database.test.ts
src/data/db/checkpoint11Integration.test.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
src/data/interpretation/flightImportIntegration.test.ts
src/data/sync/syncEngine.test.ts
src/data/repositories/tripImportAdmissionRepository.test.ts
src/domain/trip/flightImportReview.test.ts
src/data/repositories/tripEventCollection.test.ts
src/data/operations/ledgerMaintenance.test.ts
src/data/auth/accountRequestContext.test.ts
src/data/repositories/localCaptureInboxRepository.test.ts
src/data/repositories/tripDayReadRepository.test.ts
src/domain/trip/dayReadModel.test.ts
```

These execute fresh→50 and seeded49→50, historical schema/row preservation, FK ON/OFF, file cold reopen, safe integer constraints, continuation/attempt pins and queue composite bindings, Account A→B→A fencing, retention anti-joins, independent state axes, retry/fallback/shadow lineage, UNKNOWN recovery guards, Import recovery, collection certificate goldens, Capture, Day and maintenance regressions. Historical test edits are legitimate new-tail expectations and a scoped new-table namespace allowance; existing historical assertions were not rewritten to weaken their security semantics.

Typecheck was attempted and **did not pass**: the available dependency installation lacks `expo-image-manipulator`, `react-native-pager-view` and `@react-native-community/datetimepicker`, with corresponding existing UI callback diagnostics. No reported diagnostic points to a CP14 file. This review did not install packages or prove an exact-base typecheck under the same dependency tree, so it does not claim a baseline typecheck PASS. The initial default Vitest loader also attempted an unwritable external `.vite-temp`; the runner loader resolved that test-environment issue.

**NOT INDEPENDENTLY EXECUTED:** a full repository suite, native/device/Apple runtime acceptance, lint/build/UI guard, live provider/self-hosted crash behavior, real issuer/OAuth verification, gateway login provisioning, real secret resolution, live custody/device bridge and actual CP13A external prepare/execute response-loss interleavings. No UI was changed. Server recovery tests use synthetic retained digests; local tests use admitted callbacks and barriers. Runtime dispatch is structurally closed, so synthetic state-machine coverage must not be described as an actual provider dispatch/kill-during-IO PASS. Hosted Dev/Production were not accessed.

## 3. Findings

SQL locations below refer to the reviewed, unchanged Server83 file.

### F1 — CRITICAL: inbound authorization trusts command scope instead of retained target scope

**Location:** `cp14_inbound_authorize` lines1582–1598; `inbound_ai_reserve_invocation` around1760–1787; `inbound_ai_reserve_review`1877–1905; `inbound_ai_observe_review`1911–1931; `inbound_ai_status`1937–1950. Tables: client grants, reservations, invocations and review decisions.

**Reproduction, executed:** retain a reservation for known Trip T and client A/Account A. Remove A's access to T. Supply a currently valid ACCOUNT_STAGING grant with STATUS/REVIEW and command `trip_id:null`, retaining the real reservation/package IDs. STATUS returns the known-Trip reservation (`RESERVED`); reserve-review inserts an ACCEPT review for that reservation. Next use a valid same-client/account grant restricted to unrelated package P2, pass `package_id:P2`, and target the inserted review from P1 in `inbound_ai_observe_review`. The root accepts `PREPARED` and persists its safe result.

Observed review output: `REMOVED_TRIP_STATUS_WITH_STAGING ... RESERVED`; `REMOVED_TRIP_REVIEW_MUTATION <retained review ID>`; `WRONG_PACKAGE_REVIEW_MUTATION PREPARED`.

The grant helper checks command Trip/package. STATUS/reserve-review do not compare actual reservation Trip with that command; observe-review does not compare actual parent package/Trip. UUID knowledge plus an unrelated valid grant therefore reaches protected mutation despite removed Trip/package authority. These tests use a legitimate authenticated dedicated session; they do not assume a forged verifier or generic service_role. No canonical Event write was attempted or demonstrated.

**Required correction:** derive exact Account/client/package/Trip from the locked target parent and validate the current grant/action against those retained facts before reads, replay or mutation. Reject mismatched command scope; ACCOUNT_STAGING cannot authorize a known-Trip target. Apply the invariant across reservation, invocation and review roots, including response replay, and exercise removed Trip access plus unrelated package grants for each root. **Classification: implementation authorization defect.**

### F2 — CRITICAL: trusted workload can append usage for another Account's call

**Location:** `external_integration_usage_append`1518–1549, sibling `external_integration_observe_call`1555–1570 and `cp14_context`1215–1236. Tables: calls and usage events.

**Reproduction, executed:** select a retained outbound call owned by Account A. Invoke usage-append through the exact call gateway with verifier-derived actor/account B, correct environment/integration/call ID and correctly recomputed request digest. Append an otherwise valid UNKNOWN, measurement-mode NONE progress observation. It is inserted with observation key `review-wrong-account`.

The root checks the call's integration/environment and pinned price, but never its Account/user against verified context. Its strict command grammar contains no `account_id`, so the shared helper's conditional top-level Account check never runs. The sibling observe-call root has the same missing selected-row binding by inspection; its cross-Account transition was not separately executed.

**Required correction:** authorize the selected call's retained Account/user and exact admitted workload scope before replay, disclosure or mutation. If a future global recovery workload is needed, define/review that narrowly scoped authority explicitly; `TRUSTED_WORKLOAD` alone cannot silently replace Account authorization. Test actor/account mismatches for both gateways and both roots. **Classification: implementation authorization defect against owner context rules.**

### F3 — CRITICAL: CONFIG_ADMIN can clear the security kill switch

**Location:** `external_integration_configure`1264–1291, especially1282; `external_integration_set_kill`1297–1321. Tables: integrations and config audit/admin grants.

**Reproduction, executed:** an actor with only a current CONFIG_ADMIN grant creates a WEATHER integration with kill switch true. The dedicated `set_kill(false)` root rejects `CP14_ADMIN_FORBIDDEN` because SECURITY_ADMIN is absent. The same actor submits a configure CAS update (`expected_version:1`, new config version2) with `row.kill_switch:false`. Configure succeeds and the stored kill switch becomes false (`CONFIG_ONLY_KILL_BYPASS f`).

Configure checks CONFIG_ADMIN but copies the security-owned field from caller row on UPDATE. Separate setter permissions therefore do not enforce actual separation. Global runtime false remains enforced; the reproduced privilege escalation does not activate provider execution today.

**Required correction:** preserve the existing kill field in ordinary configuration updates, reject attempted security changes there, and require the SECURITY_ADMIN setter/audit path for those changes. Enforce the approved killed default on creation. Test both create/update bypasses with CONFIG_ADMIN-only and SECURITY_ADMIN-only grants. **Classification: implementation permission-separation defect.**

### F4 — IMPORTANT: DELTA reporting double-counts estimates and branching corrections

**Location:** `cp14_usage_projection`1960–1995; correction admission in `external_integration_usage_append`1537–1542. Table: usage events; reporting projection.

**Reproduction, executed with clean independent numeric extension keys:**

| Vector | Actual result | Required behavior |
| --- | --- | --- |
| CUMULATIVE100→150→200, exact duplicates replayed | 200 ACTUAL_REPORTED | 200 — passes |
| DELTA100+50+50, exact duplicates replayed | 200 ACTUAL_REPORTED | 200 — passes |
| DELTA estimate100, then actual150 for same metric | 250 ESTIMATED | Actual replaces estimate in reporting; no overlapping double count |
| DELTA root100, corrections110 and120 both superseding root | 230 ACTUAL_REPORTED | Single valid correction lineage; reject conflicting second successor or resolve it exactly once |

The DELTA sum includes every unsuperseded non-UNKNOWN estimate and actual. The correction check only establishes an existing same-call predecessor, allowing correction fanout. Existing tests cover cumulative actual preference and one correction, not these vectors.

**Required correction:** make replacement/coverage explicit for estimate-to-actual observations and preserve independent disjoint deltas; reject ambiguous overlaps rather than inventing their coverage. Enforce one admissible successor per correction predecessor or another approved deterministic single-count chain rule under the call lock. Add both vectors to acceptance. This is currently a derived usage defect; an actual authoritative billing/cost amount derived from it was not demonstrated, so it is IMPORTANT, not an asserted billing CRITICAL. **Classification: implementation accounting defect.**

### F5 — IMPORTANT: safe results admit free text and uncorrelated authority IDs

**Location:** `cp14_safe_result`1209; `inbound_ai_observe_review`1911–1931 and roots using the same safe-result/response validator. Tables: review decisions and retained inbound result envelopes.

**Reproduction, executed:** reserve a valid review with allocated Confirmation/slot/operation/Event IDs. Submit PREPARED with correctly hashed safe result:

```json
{"version":1,"state":"PREPARED","confirmation_id":"RAW-TICKET-TEXT","event_id":"PNR-AB12CD","result_sha256":"not-a-digest"}
```

The root seals and returns this object. The validator directly returns true. These are synthetic strings, not real private evidence.

All non-version values use the same generic label regex. Claimed UUIDs/digests have no typed validation, and the observed result does not have to equal the review's retained allocated IDs. A digest of this attacker-selected object proves byte integrity, not correlation or content-free semantics. The same grammar permits small private-text fragments in nominal identifier fields. Actual Event creation/duplicate authority was not executed; this finding concerns persisted control-result integrity/privacy.

**Required correction:** use exact field-specific UUID/digest/enum grammar and required combinations; bind returned IDs to retained parent IDs and state to the admitted decision/disposition. Apply consistently to safe_result, safe_response and status/report disclosure. Keep safe reasons finite and content-free. Test changed/missing IDs, private-text placeholders and ACCEPT versus REJECT/DEFER contradictions. **Classification: implementation result-correlation/privacy defect.**

### F6 — IMPORTANT: same request ID with changed bytes can append new usage

**Location:** `cp14_context`1215–1236; `external_integration_usage_append`1518–1549. Table: usage events.

**Reproduction, executed:** invoke usage-append twice on one call through a valid workload gateway using the same command `request_id`, but different observation keys/IDs and numeric values, recomputing each command/context digest correctly. Both `review-request-rebind-1` and `review-request-rebind-2` insert successfully. Existing same-observation-key changed-row rejection still works.

The owner clarification §6 requires same request identity plus changed digest to reject. The helper checks invocation context versus current command only; this root retains observation identity but no durable binding for command request identity. A caller can bypass changed-request detection by changing observation key.

**Required correction:** durably bind request identity to principal/environment/root/retained entity and exact digest using the existing immutable journal where practical; allow exact replay only where the root contract permits it, and reject changed bytes before mutation. Audit sibling observation roots for the same missing binding and add request-ID replay tests independently of observation-key replay. **Classification: implementation idempotency defect.**

## 4. Other acceptance results and residual boundaries

- **Authentication:** host adapter is injectable and unwired/test-only. It obtains context from the trusted verifier, validates request correlation and rejects caller verified/trusted/identity extras. Arbitrary API callers cannot reach protected roots by claiming a gateway/GUC/actor UUID. Dedicated-session, wrong-principal, environment, explicit command actor/client mismatch and expired/revoked grant negatives pass. This does not cure target-row scope substitution in F1/F2.
- **Admin/client authority:** product roots cannot create admin grants. Current admin permissions are checked against durable grants; audits derive actor from context. SECURITY_ADMIN separation fails F3. Inbound sender labels are not authentication. Identity/user/Account/grant/session revision and action checks exist; actual target Trip/package binding fails F1. Revoked-grant STATUS negatives pass for correctly scoped commands.
- **Runtime boundary:** runtime false-only constraints remain installed; registry/environment killed defaults are present. Ordinary config cannot activate runtime_enabled. No credentials/OAuth/public route/Admin UI/billing/live bridge or new analytics schema is added. Categories are generic integrations rather than an AI-only model. Removing an integration kill through F3 remains a defect even while runtime is closed.
- **Usage/cost:** missing per-unit counters and compute/cost fields remain NULL/UNKNOWN, without invented totals, model tokens or default free execution. Numeric provider extensions and per-unit quality are bounded; no raw response/error columns. Exact rational pricing sums before one ceiling without floating point or FX. Price rows/units are immutable and historical pinned pricing is not rewritten. Estimate/actual cost preference passes existing tests, but DELTA usage replacement/corrections fail F4. No live reconciliation or customer billing capability is claimed.
- **Attempt/state axes:** local tests retain new retry/fallback attempts and lineage, separate shadows, publication fencing, pass-complete plus WAITING, success with install pending/meter UNKNOWN, cancellation/stale-result cost responsibility and no shadow install. Budget/quota admission is injected eligibility, not actual billable usage. No provider idempotency key is execution/no-cost proof.
- **UNKNOWN:** local closed repository rejects blind replacement execution after UNKNOWN; file reopen retains responsibility. Queue leases/retry counters do not decide execution truth. Positive recovery is an independent admitted callback, not an absent receipt or timeout. Synthetic server recovery distinguishes normal observation from the dedicated recovery path. Live terminal evidence and side-effect crash windows remain NOT INDEPENDENTLY EXECUTED.
- **Inbound replay:** same package/key/digest/client exact replay, changed package digest, different client, rotated/revoked grants, missing material and retained recovery states are exercised in the isolated harness. Generated review IDs persist before any external side effect; active-candidate uniqueness and exact replay prevent replacement IDs in those tests. F1/F5/F6 prevent a blanket safe inbound-idempotency verdict. No duplicate canonical Event was demonstrated, and no public executor is wired.
- **Cleanup/non-interference:** no age-based journal deletion or invented terminal TTL; canceled-but-UNKNOWN responsibility remains. Queue maintenance anti-joins preserve continuation, attempt and dependency references; Capture/Source pins cannot be removed while required, including FK OFF. Account transitions fence callbacks without erasing another Account's responsibility. No cascading FK destroys responsibility. sync_operations is the sole scheduler; all five C operation denials remain. No CP13A/TRACK_C/receipt, B-T3I certificate, Capture, Day, Ledger or Settlement semantic change was found in the scoped diff/regressions. This is not a renewed whole-repository security certification.

## 5. Explicit answers

Answers describe the reviewed closed implementation and evidence above, not future live capability.

| Required answer | Result | Qualification |
| --- | --- | --- |
| Historical migrations preserved | YES | Exact-base bytes and86 manifest hashes verified |
| Server83 matches preflight | NO | F1–F6 violate required authorization/accounting/result/replay invariants |
| SQLite50 matches preflight | YES | Inspected schema/repository and independently executed FK/reopen/fencing tests; no new local defect found |
| VerifiedCallContext enforced | NO | Session/digest authentication boundary works; selected-row Account/Trip/package authorization is incomplete |
| Caller spoofing possible | YES | Authorized caller substitutes target scope in F1/F2; arbitrary caller-created verified context remains rejected |
| Generic service_role mutation possible | NO | Effective ACL and actual root/table negatives in disposable fixture |
| RLS/role graph safe | YES | Current structural privilege isolation; does not imply permitted roots authorize safely |
| SECURITY DEFINER roots bounded | NO | Fixed names/search paths, but scope and typed result bounds fail |
| Runtime activation impossible | YES | False-only runtime checks remain; no deployed activation |
| Missing units remain UNKNOWN | YES | Independently nullable; F4 is overlapping known-observation aggregation |
| Streaming avoids double count | NO | Basic cumulative/delta vectors pass; estimate replacement/correction fanout fail |
| Retry/fallback/shadow separated | YES | Local state/lineage tests; live adapters unprovisioned |
| Price immutable/no FX | YES | Immutable rows, pinned schedules, exact rational/no-FX code/tests |
| UNKNOWN can blind redispatch | NO | Closed roots/local repository deny it; no live-dispatch claim |
| Queue lease treated as execution truth | NO | Independent retained attempt/recovery state |
| Inbound package idempotency safe | NO | Baseline key/digest checks pass, but scope/replay/result holes block general assurance |
| Review replay can duplicate authority | NO | No duplicate canonical authority demonstrated; F1/F5 weaken protected review records and require correction |
| Raw private evidence in usage telemetry | NO | Numeric usage grammar; F5 permits text smuggling in separate control safe-results |
| UNKNOWN cleanup protected | YES | Retention/reference guards, FK ON/OFF and maintenance tests |
| sync_operations sole scheduler | YES | No new poller/lease/scheduler; five C denials retained |
| CP13A/CP13B/Capture/Day/Ledger semantics changed | NO | Scoped diff and targeted regression evidence |
| New CRITICAL count | 3 | F1–F3 |
| New IMPORTANT count | 3 | F4–F6 |
| New MINOR count | 0 | No additional speculative findings counted |
| Ready for owner acceptance | NO | Correct findings and independently re-review security/authority and adversarial accounting |

**STOP — INDEPENDENT REVIEW COMPLETE.**

## TARGETED F1–F6 RECHECK

Date: 2026-10-06, Pacific/Auckland. Independent review only; this section supplements the original review without replacing its historical text or verdict.

**TARGETED RECHECK PASS WITH REQUIRED CORRECTIONS**

The three original CRITICAL authorization defects are fixed. F4's original accounting defects are fixed with explicit supersession for estimate replacement. F5 and F6 are substantially corrected, but sibling reason fields and read-root request binding still violate the original content-free/request-identity requirements. Two original IMPORTANT findings remain; no new CRITICAL/IMPORTANT finding or new targeted regression is counted. Final Owner Review readiness remains NO until these residual corrections are independently verified.

### Recheck identity, inputs and preservation

Same worktree `/private/tmp/otr-cp14-persistence`, branch `intelligence/cp14-persistence`, exact HEAD/base `c4571746b0c300fa3b46842cd37745963567338c`; unstaged/uncommitted implementation. Corrected Server83 SHA-256: `6acbfb6c038e7a642d84e3f28298421a3f7154b258af67f658a737b8ad5bdc75`.

Read the original review, updated Builder report/correction section, corrected SQL and acceptance script, approved preflight and owner VerifiedCallContextV1. Builder YES answers were not treated as verification. Compared current file hashes against the retained pre-correction `/private/tmp/cp14-reviewed-files.json` snapshot, whose Server83 hash equals the original review's `38c236…202d`. Exactly the eight declared correction files changed materially: Server83, server acceptance script, API_CONTRACT, DATA_MODEL, current-state handoff, Builder report, security inventory and validation JSON. An ignored `.DS_Store` metadata difference is not an implementation change.

Original review prefix: **27,368 bytes**, SHA-256 `0781d4cdebfa8f78ce6fb8dbc38b4c3fd15018b451867645840ffbc1770d3d60`. The saved original prefix is verified byte-for-byte after this append. Preflight, owner clarification, Backend gateway/tests, local domain/repository/tests and SQLite50 match the original reviewed snapshot. SQLite50 SHA-256 remains `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.

### Independent execution

- Created review-owned `otr-cp14-independent-recheck` from the existing PostgreSQL17.6 image with `--network none`, no published ports, synthetic fixture identities and no hosted connection. Other containers were not mutated. Independently reran fresh1→83 and seeded82→83 using the unchanged replay helper with only its container name substituted in memory. Both PASS; old public table column definitions, public function bodies and the synthetic auth row remain unchanged.
- Independently verified all86 baseline manifest hashes against the exact Git base, all82 historical server file bytes, and SQLite1–49 registration with only50's import/entry removed. No Server84 exists. SQLite50 and its repository/tests/domain are unchanged from the original review.
- Independently executed the corrected server harness: **473 checks PASS**. These cover actual API denials, principal/grant matrices, quota/rate concurrency, inbound replay, usage/cost and UNKNOWN recovery. Also executed review-owned F1–F6 vectors against the retained synthetic rows; results are detailed below. The supplemental tests deliberately used new request IDs except when testing request replay. They did not patch migration definitions or gates.
- Independently reran the same fifteen distinct Backend/SQLite/CP13A/CP13B/Capture/Day/Ledger-maintenance/Account/sync suites listed in the original review: **15 files /532 tests PASS**. This includes the unchanged58 CP14 Backend/local tests; overlapping counts are not added. Fresh→50,49→50, historical rows/schema, FK ON/OFF, file reopen, reference retention, Account fencing, UNKNOWN, certificate/Day and Import regressions pass.
- Independently enumerated live catalog roles, memberships, table/column/schema/sequence privileges, functions/owners/effective EXECUTE, RLS/FORCE and default ACLs. All fifteen table, nine role, nine membership and58 function inventory entries match actual runtime catalogs. Twenty-five functions are SECURITY DEFINER and retain fixed `search_path=pg_catalog`; no dynamic/caller-selected SQL route is added. Gateways have no table/column grants or schema CREATE; isolated roles have no sequence privileges or old public SECURITY DEFINER execution chain. PUBLIC/API helper/root access remains denied.
- The new `cp14_bind_request` bridge is config-writer-owned, with private-writer EXECUTE only. Actual direct API and all applicable gateway calls to that helper reject permission denied. Meter writer has no audit-table SELECT/INSERT/UPDATE/DELETE rights. The widened audit trigger allows call/recovery sessions only REQUEST_BINDING entries, not CONFIG/KILL entries. No new security setter or admin-grant path was found.
- Typecheck independently attempted: **FAILED / dependency-environment limitation**, with the same missing `expo-image-manipulator`, `react-native-pager-view`, `@react-native-community/datetimepicker` and corresponding UI callback diagnostics seen in the original review. No diagnostic names a corrected CP14 file. Builder's typecheck PASS was not adopted. No package install or implementation fix was performed.
- Full suite, lint/build/UI guard, native/device runtime, live OAuth/provider/secret/custody and actual external CP13A prepare/execute were **NOT INDEPENDENTLY EXECUTED** in this targeted pass. Runtime remains structurally false; synthetic state-machine tests are not live provider/crash acceptance. No Hosted Dev/Production access, commit, push or activation occurred. Temporary dependency linkage and the review-owned database container were removed.

### F1 — FIX VERIFIED: YES

The retained parent now supplies Account/user/client/integration/package/Trip scope through `cp14_inbound_target`, before result replay/disclosure or mutation. It invokes current durable grant/Trip authorization after exact retained-target comparison.

| Required vector | Independent result |
| --- | --- |
| Removed Trip + ACCOUNT_STAGING STATUS | Rejected CP14_GRANT_FORBIDDEN |
| Removed Trip + ACCOUNT_STAGING REVIEW reservation/observation | Rejected CP14_GRANT_FORBIDDEN |
| Package P2-restricted grant against retained P1 review, including sealed replay | Rejected CP14_GRANT_FORBIDDEN |
| SINGLE_TRIP T2 grant/command against retained T1 | Rejected CP14_GRANT_FORBIDDEN |
| Valid exact retained staging scope | STATUS and sealed review replay succeed |
| Valid exact retained known-Trip scope | Rejected while access removed; succeeds after actual fixture Trip permission restoration |
| Current same-scope replacement grant | Exact retained sealed review recovery succeeds under a genuinely new bound request; original admission grant pin remains unchanged |

The independently rerun harness also rejects retained-target substitutions in material attachment, invocation reserve/completion and reserve-package replay. New checks do not turn a missing target/Trip into staging authority. No duplicate canonical target or Event mutation was introduced.

### F2 — FIX VERIFIED: YES

Usage append and observe-call compare the selected retained call's Account and user with verifier-derived context before ordinary or recovery replay. Dispatch includes the same binding by inspection.

Independent workload vectors on **both call and recovery gateways** rejected Account-only B, actor-only B and combined actor/Account B against A's call. Both usage append and observe-call return CP14_SCOPE_FORBIDDEN. Correct-owner late usage and exact terminal recovery still succeed. An OTR_ADMIN/SUPPORT_RECOVERY principal cannot use usage mutation as a workload exception. SUPPORT_RECOVERY returns only the minimized exact call tuple for the verified Account, and returns `call:null` for another verified Account; it has no mutation authority. Its separate read-root request-binding gap is recorded under F6, not as a renewed Account mutation defect.

### F3 — FIX VERIFIED: YES

Independent tests used a separate fixture actor with CONFIG_ADMIN only, then restored its SECURITY_ADMIN grant for the dedicated positive test. Immutable grant-history rules remained enforced.

| Required vector | Independent result |
| --- | --- |
| CONFIG_ADMIN create with kill=false | Rejected CP14_SECURITY_OWNED |
| Configure true→false | Rejected CP14_SECURITY_OWNED |
| Configure false→true | Rejected CP14_SECURITY_OWNED |
| Dedicated kill without SECURITY_ADMIN | Rejected CP14_ADMIN_FORBIDDEN |
| Dedicated kill with SECURITY_ADMIN | Succeeds with CAS and KILL audit |
| Unrelated configure after dedicated un-kill | Succeeds; kill remains false |
| Audit attribution | KILL audit's actor equals the verifier-derived security actor |

Configure no longer updates the kill column and requires the echoed retained value. Its shared request/audit path does not confer SECURITY_ADMIN or a new gateway helper edge. Runtime false-only constraints remain unchanged.

### F4 — FIX VERIFIED: YES

Independent vectors used clean extension-unit names, and explicit successor IDs where a correction/replacement was declared.

| Required vector | Independent result |
| --- | --- |
| Cumulative100→150→200 | 200 ACTUAL_REPORTED |
| Disjoint DELTA100+50+50 | 200 ACTUAL_REPORTED |
| Exact duplicate observation replay | Same retained observation, no extra count |
| Changed duplicate under new request ID | Rejected CP14_CHANGED_OBSERVATION |
| Estimate100→actual150, explicitly superseding estimate | 150 ACTUAL_REPORTED |
| Original estimate100→actual150 without a replacement binding | Rejected CP14_AMBIGUOUS_DELTA; does not produce250 |
| Root100→110→120 explicit chain | 120 ACTUAL_REPORTED |
| Competing direct successor to already corrected root | Rejected CP14_INVALID_CORRECTION |
| Two concurrent direct successors | Exactly one succeeds; the other rejects CP14_INVALID_CORRECTION |
| Concurrent independent same-unit DELTA chunks | Both succeed;50+50=100 |
| Partial missing output units | NULL/UNKNOWN remains independent of reported inputs/extensions |
| Actual cost after estimated cost | Actual150 replaces estimate100 |
| Pricing, currencies and rounding | Existing immutable schedule/overlap/no-FX checks pass; exact rational sum-then-ceil domain implementation/tests are byte-unchanged |

Concurrent probes had a five-second statement timeout; no deadlock or timeout occurred. The trigger's retained-call lock serializes successor admission. Legitimate tested disjoint ACTUAL_REPORTED deltas remain additive. Mixed-quality observations without explicit coverage remain deliberately rejected as ambiguous; this result is not claimed to support unrepresented disjoint estimate/actual coverage. Explicit supersession is the admitted mechanism for replacement, consistent with the original correction requirement.

### F5 — FIX VERIFIED: NO — typed results fixed; sibling private reason escape remains

Independent checks reject all requested safe-result attacks: RAW-TICKET-TEXT in confirmation_id, PNR text in event_id, malformed digest, well-formed wrong retained UUID, missing required ID, forbidden extra ID, arbitrary/private-text safe reason and ACCEPT/PREPARED against a retained REJECT or DEFER. Exact retained ACCEPT/PREPARED succeeds; legitimate REJECTED and DEFERRED results succeed with their own review ID and without forbidden preparation/Event IDs. Checks run before sealed replay.

Safe_response sibling tests reject wrong reservation ID, ticket-text extra identifier, malformed digest and private-text safe reason. STATUS constructs typed retained IDs and drops the unsafe reason field; admin usage reports construct call IDs/numeric projections rather than exposing arbitrary caller safe-result JSON. No equivalent identifier smuggling was found in those returned projections.

**Residual F5, IMPORTANT:** the sibling reservation `safe_reason` column bypasses the helper's finite reason grammar. The corrected `inbound_ai_complete_invocation` validates `reservation_update.safe_result`, but copies `reservation_update.safe_reason` independently with only the column's generic label CHECK. Initial `inbound_ai_reserve_package` likewise admits it.

Reproduction executed on clean review-owned synthetic rows:

1. Reserve a new valid same-Account/client staging package through the dedicated inbound gateway, setting row `safe_reason:"PNR-AB12CD"`. The root accepts and returns that marker.
2. Reserve another clean package/invocation with a currently authorized replacement grant. Complete it with the exact typed reservation ID, correctly hashed safe_response and safe_result, valid CAS and generated Import/task UUIDs, but `reservation_update.safe_reason:"RAW-TICKET-TEXT"`.
3. Completion succeeds. The retained reservation's safe_reason is exactly `RAW-TICKET-TEXT`.

Affected corrected file: Server83 `inbound_ai_reserve_package` around1714–1746, `inbound_ai_complete_invocation` around1875–1914, especially the projection validation/update around1903–1912; table `inbound_ai_import_reservations.safe_reason` around413. The inner safe-result validator around1221 is correct for the tested fields but does not guard this sibling field. All markers are synthetic, not actual PNR/ticket data. Current STATUS/report filtering withholds the reason, reducing disclosure, but the control-plane persistence remains an unapproved private-text container and reserve-package returns it.

**Required correction:** apply a finite content-free reason grammar to the sibling field at storage/admission and completion update, including replay paths; reject private-looking arbitrary labels rather than accepting every K token. Reuse the accepted reason vocabulary where appropriate. Add initial-reservation and completion-projection privacy tests. This is the original F5 content-free/finite-reason requirement still incomplete, not a new credential-exposure CRITICAL or a new architectural protocol.

### F6 — FIX VERIFIED: NO — mutations fixed; read-root request exception remains

Independent mutation probes PASS:

| Required vector | Independent result |
| --- | --- |
| Same request ID + same usage bytes | Exact replay |
| Same request ID + only changed observation key | Rejected CP14_CHANGED_REQUEST |
| Same request ID + changed value/status/body | Rejected CP14_CHANGED_REQUEST |
| Same request ID cross-call | Rejected CP14_CHANGED_REQUEST |
| Cross mutation-root usage→observe-call | Rejected CP14_CHANGED_REQUEST |
| Changed verified actor/Account/client scope | Rejected CP14_CHANGED_REQUEST; invalid principal kind also fails its root's principal check |
| Cross call/recovery gateway | Rejected CP14_CHANGED_REQUEST |
| New request ID + unchanged observation key/bytes | Independent observation replay succeeds |
| New request ID + changed existing observation bytes | Rejected CP14_CHANGED_OBSERVATION |
| Genuinely new request ID/key for correct-owner late recovery | New observation succeeds |

The rerun harness additionally covers health/completion/review sibling mutation binding. Failed authorization/changed-request probes roll back journal insertion; they do not create an authority-bearing partial request record. The new journal/helper does not grant API/gateway table/helper access or bypass current authorization. Scope binding excludes revalidated freshness timestamps, so it does not reject an otherwise identical replay merely because verification time changed.

**Residual F6, IMPORTANT:** `cp14_context` around1259 explicitly omits `inbound_ai_status`, `external_integration_admin_report` and `external_integration_recover_exact` from `cp14_bind_request`. These read roots neither validate a retained existing request identity nor record their own binding. The Builder report explicitly describes this exception, but owner VerifiedCallContextV1 §6 does not authorize it: request identity binds action/root/principal/environment/Account, and same identity with changed digest must reject.

Reproduction independently executed:

- Take an already persisted usage-append request ID. Reuse it with correctly recomputed command/context digests for admin report through reporting_gateway, STATUS through inbound_gateway and SUPPORT_RECOVERY through recovery_gateway. **All three accept** their otherwise authorized reads, despite changed root/body/principal/gateway.
- Use one genuinely new request ID for admin report on `synthetic-outbound`, then repeat that same root/request ID for `synthetic-inbound` with changed body/digest. **Both accept.**

Affected file/functions: Server83 `cp14_context` around1259 and read roots around1994,2059,2073. No unauthorized data disclosure or mutation was demonstrated: current read authorization still applies. This is a bounded original request-identity contract defect, not a new authority escalation.

**Required correction:** enforce exact request-identity/digest/scope comparison for these protected roots too through a narrowly authorized binding seam. If stateless read requests are intended as an exception, that requires explicit owner clarification; Builder's exception alone cannot amend §6. Add same-root changed-body and mutation→read cross-root/principal/gateway cases to acceptance. No new authentication subsystem or signed attestation is needed.

### New-regression search and residual limits

No new CRITICAL/IMPORTANT defect or new failing targeted regression was identified. The new audit helper is not gateway/API executable, meter writer gained no audit table rights, and audit/CONFIG paths did not gain security setter authority. Retained-scope checks admit valid staging/known-Trip and current replacement-grant replay. Strict safe-result checks admit valid ACCEPT, REJECT and DEFER. Correction successor concurrency and disjoint DELTA concurrency complete without deadlock/false rejection in the executed probes. The two residual defects above are incomplete original F5/F6 requirements; they were not counted again as new findings.

This is a targeted conclusion, not full release/security acceptance. Real external dispatch/terminal evidence, Account/device runtime, provisioned auth/custody and full-suite baseline remain outside independently executed scope. Typecheck remains unverified because the dependency installation used by this review is incomplete. Runtime/provider/Event/Source/Import gates and all five C scheduler denials remain CLOSED/unchanged; no canonical or financial semantic change was found.

### Required targeted answers

| Required answer | Result |
| --- | --- |
| F1 FIX VERIFIED | YES |
| F2 FIX VERIFIED | YES |
| F3 FIX VERIFIED | YES |
| F4 FIX VERIFIED | YES |
| F5 FIX VERIFIED | NO |
| F6 FIX VERIFIED | NO |
| Original CRITICAL findings remaining | 0 |
| Original IMPORTANT findings remaining | 2 |
| New CRITICAL findings | 0 |
| New IMPORTANT findings | 0 |
| New regressions | NO |
| SQLite50 unchanged and still acceptable | YES |
| Runtime gates CLOSED | YES |
| Ready for final Owner Review | NO |

**STOP — TARGETED INDEPENDENT RECHECK COMPLETE.**

## FINAL F5/F6 INDEPENDENT RECHECK

Date: 2026-10-06, Pacific/Auckland. Independent review only.

**FINAL RECHECK PASS**

Both residual IMPORTANT findings are independently verified fixed. F1–F4 remain fixed in representative negative/positive smoke checks and the corrected server harness. No original CRITICAL/IMPORTANT finding remains, and no new CRITICAL/IMPORTANT finding or targeted regression was identified. Ready for Final Owner Review: YES, for the closed CP14 persistence checkpoint. This does not authorize activation, deployment or live provider/auth/custody capability.

### Reviewed state and immutable history

Worktree `/private/tmp/otr-cp14-persistence`, branch `intelligence/cp14-persistence`; retained HEAD/base `c4571746b0c300fa3b46842cd37745963567338c`. Corrected Server83 SHA-256: `c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`.

Read the complete existing review, including TARGETED F1–F6 RECHECK; the updated Builder implementation report/residual section; corrected SQL, acceptance script, security inventory and validation artifact; and the unchanged approved preflight/VerifiedCallContextV1 authorities. Builder YES answers were not adopted as evidence of independent success.

The only five residual correction files are Server83, `scripts/cp14/persistence-acceptance.py`, Builder implementation report, security inventory and validation JSON. Compared their scope against the prior recheck's retained file hashes. Other implementation/architecture inputs are unchanged. The review's earlier append accounts for its own separate expected hash difference.

Before this append, the complete existing report was **46,498 bytes**, SHA-256 `62db8f34bb572d09a7d7974500a930831347a7f0b5b0a0940356e615457ed0b9`. That entire prefix is preserved byte-for-byte. The original review and previous targeted verdict remain historical records, not rewritten conclusions.

### Independent execution and preservation

- Created review-owned `otr-cp14-final-independent`, using the existing PostgreSQL17.6 image, `--network none`, no published ports and synthetic identities only. No hosted connection or other-container mutation. Independently replayed fresh1→83 and seeded82→83 with only the existing helper's container name substituted in memory: PASS. Old public column definitions/function bodies and synthetic auth data are preserved.
- Independently ran the corrected server harness: **548 checks PASS**, including its75 residual assertions. Also ran review-owned final vectors, including **183 explicit rejection checks** plus positive replay/storage/recovery and F1–F4 assertions. These counts describe separate overlapping coverage and are not combined into a unique test total.
- Independently reran the same relevant fifteen Backend/SQLite/Import/CP13B/Capture/Day/Account/sync/Ledger-maintenance regression files listed earlier: **15 files /532 tests PASS**. This includes SQLite fresh→50/49→50, FK ON/OFF, reopen and preservation tests. No new full repository suite was required or run for this SQL-only residual stage.
- Verified all86 baseline manifest hashes against exact-base Git objects; server1–82 source bytes and SQLite1–49 registration/historical sources remain unchanged. Exactly83 server migrations exist; no Server84. SQLite50 remains byte-identical to the prior recheck: SHA-256 `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
- Actual catalog inventory remains **15 tables,9 roles,58 functions,25 SECURITY DEFINER functions**. No new table/role/function. Independently enumerated current roles/memberships, owners, RLS/FORCE, effective table/column/schema/sequence/function privileges and default ACLs. Current inventory matches live catalogs; fixed search paths and API isolation remain intact.
- Runtime false-only constraints remain; no runtime-enabled environment exists. Existing Event/Source/Import gates, scheduler and five C operation denials are unchanged. `sync_operations` remains the sole scheduler. No replacement reason/error column, new private evidence container, canonical mutation, credential provisioning or deployment was introduced.
- No implementation edits, commit, push, Hosted Dev/Production access or gate activation. Temporary dependency linkage and the review-owned container were removed. Only this appended report changes during the final review.

### F5 final verification

The reservation storage CHECK now admits only NULL or these seven existing codes:

```text
INVALID_PACKAGE
STALE_REVIEW
ACCESS_REVOKED
MATERIAL_UNAVAILABLE
EXACT_RECOVERY_REQUIRED
USER_REJECTED
USER_DEFERRED
```

Independently inspected the live constraint and all relevant SQL admission/update/replay paths. `inbound_ai_reserve_package` validates the JSON field's type and finite code before admission/replay. `inbound_ai_complete_invocation` validates sibling `reservation_update.safe_reason` before its sealed-response early return, including recovery sessions. The storage CHECK additionally protects actual writes. Request binding covers the complete reason-bearing command bytes.

| Required vector | Independent result |
| --- | --- |
| Initial PNR-AB12CD | Rejected CP14_SAFE_REASON |
| Initial RAW-TICKET-TEXT | Rejected CP14_SAFE_REASON |
| Initial unknown code or free text | Rejected CP14_SAFE_REASON |
| Initial non-string integer/Boolean/object/array | Rejected CP14_SAFE_REASON |
| Each of seven admitted codes, plus NULL | New reservation and exact replay succeed; retained reason matches |
| Completion private/free text or unknown reason | Rejected CP14_SAFE_REASON before update, through both ordinary and recovery gateways |
| Completion non-string reason | Rejected CP14_SAFE_REASON through both gateways |
| Each finite completion reason | Real unsealed invocation completes; exact reason persists |
| Exact completion replay with valid retained reason | Succeeds |
| Same reservation/completion request identity, changed valid reason | Rejected CP14_CHANGED_REQUEST |
| Recovery with arbitrary reason | Rejected CP14_SAFE_REASON, including sealed replay |
| Recovery with exact valid retained result/reason under a new request | Succeeds |

The former sibling reason escape is closed. No sibling free-text reason/error field was introduced as a replacement. Reservation column inventory and strict request/projection key sets remain otherwise unchanged. Previously verified typed safe_result/safe_response IDs, state/disposition correlation and finite nested reasons remain intact. Existing labels/reason metadata elsewhere were not widened by this correction; this is a focused closure of the reviewed reservation escape, not a new certification of every unrelated metadata field.

**F5 FINAL FIX VERIFIED: YES.**

### F6 final verification

Did not rely on Builder's root count. Enumerated actual effective EXECUTE from all dedicated gateway roles, then inspected each live function definition. These exact twenty gateway-callable protected roots all invoke their own fixed `cp14_context(context,command,<root>)` before a result return:

```text
external_client_authorize_grant
external_client_revoke_grant
external_integration_admin_report
external_integration_configure
external_integration_health_observe
external_integration_mark_dispatch
external_integration_observe_call
external_integration_price_append
external_integration_recover_exact
external_integration_reserve_call
external_integration_set_kill
external_integration_usage_append
inbound_ai_attach_material
inbound_ai_complete_invocation
inbound_ai_observe_review
inbound_ai_reserve_invocation
inbound_ai_reserve_package
inbound_ai_reserve_review
inbound_ai_status
intelligence_provider_config_append
```

The shared context now calls `cp14_bind_request` unconditionally, with no three-read exception. Normal audited configuration/grant mutations retain their existing audit binding path; other protected commands, including reads, retain REQUEST_BINDING records in the same immutable journal. Internal meter/projection helpers are private edges behind an already bound parent, not extra gateway APIs. Binding checks exact root, body digest, environment and verifier-derived principal/client/gateway/Account scope under a serialized request lock.

Independently attacked all three previously exempt roots: STATUS, admin report and exact support recovery.

| Required vector | Independent result |
| --- | --- |
| Same ID + same exact root/body/scope | Authorized replay succeeds |
| Same ID + changed body/target/filter | Rejected CP14_CHANGED_REQUEST |
| Same ID cross-read-root | Rejected CP14_CHANGED_REQUEST |
| Mutation ID reused for read | Rejected CP14_CHANGED_REQUEST |
| Read ID reused for mutation | Rejected CP14_CHANGED_REQUEST |
| Changed client or verified Account with consistent command claims | Rejected CP14_CHANGED_REQUEST |
| Changed principal/user/client/workload kind | Rejected by exact request binding or the root's required admin/principal authorization |
| Wrong dedicated gateway | Rejected by root ACL/session validation |
| Changed gateway on a root legitimately callable through both inbound/recovery gateways | Rejected CP14_CHANGED_REQUEST |
| Wrong environment with inconsistent context | Rejected CP14_CONTEXT_FORBIDDEN |
| Consistently changed command/context environment | Rejected by request binding or missing current admin grant in that environment |
| Genuinely new authorized ID | Succeeds and appends exactly one REQUEST_BINDING record |

Same-request replay retains current read projection semantics and revalidates authority; it does not make stored authorization or a historical response an entitlement to current data.

**Private-reader edge independently bounded:** reader has EXECUTE on the fixed config-writer-owned binding helper but no audit INSERT/UPDATE/DELETE/TRUNCATE. All gateway/API direct helper calls reject permission denied. Reader cannot execute config, kill, grant-authoring or usage mutation roots and has no canonical Event DML. Reporting-session audit guard permits REQUEST_BINDING only; it cannot write CONFIG/KILL records. No role membership, schema CREATE, old-definer execution chain or generic SQL dispatcher was added. The original authentication boundary remains trusted verifier→dedicated gateway→SQL authorization; no signed-attestation subsystem exists.

**F6 FINAL FIX VERIFIED: YES.**

### F1–F4 smoke and new-regression result

- F1: substituted Trip scope against a retained staging reservation rejects; exact retained scope succeeds. The server harness also preserves removed-Trip/P2/T2 and replacement-grant coverage.
- F2: Account/actor B usage against A's call rejects; correct-owner late recovery succeeds.
- F3: configure attempting to flip retained kill rejects CP14_SECURITY_OWNED; unrelated configure with the retained kill value succeeds. Dedicated security ownership remains unchanged.
- F4: estimate100 explicitly superseded by actual150 and then correction120 retains one leaf quantity120; a competing direct successor to the root rejects. Full harness cumulative/delta/estimate/correction/concurrency checks continue to pass.

No new privilege escalation, privacy escape or failing targeted regression was found. Reader binding adds only immutable request facts, not business authority. Invalid reason/request probes roll back before retaining a successful request or business update. Valid finite reasons and legitimate exact read/recovery replay still work.

Full-suite baseline, live provider/terminality, real issuer/OAuth verification, secrets/custody/device bridge and native/device acceptance remain outside this final independent pass. No fresh typecheck/lint/build/UI-guard PASS is claimed; the earlier independent dependency-environment limitation remains recorded. Builder tooling claims do not replace independent evidence. Final Owner Review readiness refers to the corrected closed persistence scope, not release readiness or runtime activation.

### Required final answers

| Required answer | Result |
| --- | --- |
| F5 FINAL FIX VERIFIED | YES |
| finite safe_reason complete | YES |
| sibling private-text escape remains | NO |
| F6 FINAL FIX VERIFIED | YES |
| all protected roots request-bound | YES |
| read-root binding introduces privilege escalation | NO |
| F1–F4 remain fixed | YES |
| original CRITICAL findings remaining | 0 |
| original IMPORTANT findings remaining | 0 |
| new CRITICAL findings | 0 |
| new IMPORTANT findings | 0 |
| new regressions | NO |
| SQLite50 unchanged/acceptable | YES |
| runtime gates CLOSED | YES |
| ready for Final Owner Review | YES |

**STOP — FINAL CP14 PERSISTENCE INDEPENDENT RECHECK COMPLETE.**
