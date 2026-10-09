# Transport R2-SQL driver independent security review

Date: 2026-10-09 (Pacific/Auckland). Role: Independent Security Reviewer, separate from the Builder session. Worktree: `/private/tmp/otr-platform-transport-r2-sql-20261009`.

What this change does: Adds a dormant Backend PostgreSQL leased-connection driver for the accepted private Publication catalog read. It fixes the login identity, transaction sequence, TLS validation and deadlines, admits one operation per process, and destroys uncertain physical sockets.

## Decision

| Required return                                   | Result                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Verdict                                           | **PASS WITH REQUIRED CORRECTIONS**                                                           |
| CRITICAL / IMPORTANT / MINOR findings             | **0 / 1 / 0**                                                                                |
| Physical socket retirement independently verified | **YES**                                                                                      |
| New regressions in existing behavior              | **NO** — affected existing suites pass; F1 is a newly reproduced driver configuration defect |
| Ready for Dormant-Code Final Owner Acceptance     | **NO** — correct F1 and obtain targeted independent recheck first                            |
| Runtime readiness                                 | **NO** — Principal, Hosted, endpoint and Native gates remain CLOSED                          |

## IMPORTANT — required correction

### F1. An absolute DNS name bypasses the known pooler rejection

Location: `backend/src/tripPublicationCatalogPgConnection.ts:13–19`.

**What this is:** The driver rejects known Supabase pooler hosts to preserve the accepted direct-primary-only mode. The classifier checks the literal suffix `pooler.supabase.com`.

**Problem:** `host: "aws-0.pooler.supabase.com.", port: 5432` is accepted. A terminal dot is a valid absolute DNS spelling of the same hostname. The independent negative test expected factory rejection and failed. A separate actual Node TLS `checkServerIdentity` probe confirmed that the terminal dot does not prevent matching a certificate for `aws-0.pooler.supabase.com`. The same bypass applies to uppercase absolute spellings after lowercasing. This violates the explicit known-pooler configuration gate; `pg_is_in_recovery() = false` does not distinguish a primary behind a pooler from a direct primary.

**Smallest fix:** Strip the single terminal DNS dot before the existing case-insensitive suffix classification, or reject terminal-dot host spellings. Add a regression asserting both ordinary and absolute known pooler names reject before Pool construction. Preserve strict TLS validation, fixed login identity and all existing mode restrictions.

**If skipped:** Unsupported pooler endpoint configuration can pass factory admission and reach connection attempts. This is a configuration-gate defect, not demonstrated unauthorized catalog disclosure or proof that the Hosted pooler accepts the fixed username. Endpoint attestation remains separately required even after this correction; arbitrary private DNS/proxies cannot be identified by a suffix check.

Production source was not corrected during this independent review. Evidence: `/private/tmp/otr-r2-independent-evidence/independent-probes.test.ts` and `independent-probes.log` (31 cases: original22 plus independent9;30 PASS,1 F1 FAIL).

## Source, scope and accepted inputs

HEAD exactly equals expected `ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d`, the canonical authenticated Transport integration. Initial dirty scope was exactly seven Builder files:

1. `backend/src/tripPublicationCatalogPgConnection.ts`.
2. `backend/src/tripPublicationCatalogPgConnection.test.ts`.
3. `backend/src/tripPublicationCatalogPgConnection.integration.ts`.
4. `package.json`.
5. `package-lock.json`.
6. `docs/architecture/OTR_PLATFORM_TRANSPORT_R2_SQL_DRIVER_BUILDER_REPORT.md`.
7. `docs/CURRENT_IMPLEMENTATION_STATE.md`.

Compared all1,286 tracked paths against HEAD: only the three tracked Builder paths differed, with the four declared new files. All accepted runtime files, `server.ts`, protected SQL, SQLite1–53/registry, contracts and historical reviews were preserved. The seven Builder SHA-256 values are recorded in `builder-manifest.json`; review-time source/test/package/report bytes remained exact. This review adds only this report and an incremental handoff note. Temporary probe copies were removed from the worktree.

Read the current-state handoff, project guidance, Builder report, accepted Authenticated Publication Transport preflight/review including its accepted F1 closure, `PublicationCatalogConnection` and its callers, request-boundary implementation, protected catalog SQL and SQLite53/Membership contracts. R1 is absent from this worktree; read its separate accepted artifact at `/private/tmp/otr-platform-transport-r1-20261009/docs/architecture/OTR_PLATFORM_TRANSPORT_ROLLOUT_R1_PREFLIGHT.md`. Historical pending statements were not treated as current authority. No legacy Web inspection was needed. No remote/Hosted request or remote-ref freshness claim is made by this review.

## Security verification matrix

| Review items                                   | Independent result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1,17 — base, dormant scope, server and grants  | Exact base/seven paths verified. Factory is imported only by its tests. Existing gateway injection seam remains optional; `server.ts` supplies none. No repository SQL, role/grant, credential, deployment or native changes.                                                                                                                                                                                                                                                                                                |
| 2,18 — pinned packages and Mobile preservation | Installed/locked `pg@8.16.3`, `@types/pg@8.15.5`; locked `pg-pool@3.14.0`, `pg-protocol@1.16.1`. All930 existing non-root lock nodes and existing manifest dependency versions are unchanged. Exactly15 registry nodes added, all with SHA-512 metadata; independently recomputed every cached tarball digest and matched the lock. No Expo/React Native version drift.                                                                                                                                                      |
| 3 — identity overrides                         | Strict config accepts only host/port/database/password/optional CA. No URI, alternate user, options or SSL object is accepted. Explicit pg settings beat hostile PGUSER/PGHOST/PGPASSWORD/PGOPTIONS/PGSSLMODE in an actual successful disposable TLS read. Fixed session principal remains `otr_trip_source_command_gateway`.                                                                                                                                                                                                |
| 4 — TLS identity                               | Chain verification always enabled. Custom identity callback checks the configured DNS/IP host. Actual untrusted chain and trusted wrong hostname reject; successful real TLS session is authorized. Optional CA is a trust anchor, not a validation bypass.                                                                                                                                                                                                                                                                  |
| 5 — direct primary                             | Replica recovery flag must be exactly boolean false in one row; known pooler suffix and6543 gate exist. **F1 requires correction.** Arbitrary DNS/proxy directness still requires separately authorized endpoint attestation. No Session/Transaction Pooler certification.                                                                                                                                                                                                                                                   |
| 6,7 — same-session read-only transaction       | One actual backend PID owns primary check, READ COMMITTED READ ONLY BEGIN, local timeouts, session_user, fixed parameterized catalog SELECT and acknowledged COMMIT/ROLLBACK. Real settings: transaction_read_only=on, statement_timeout=5s, lock_timeout=1s, idle_in_transaction_session_timeout=5s. Same socket is reused only after acknowledged terminal cleanup.                                                                                                                                                        |
| 8,9 — admission/checkout/concurrency           | Process singleton Pool/max1; synchronous occupied flag blocks callers before pg queue admission. Deterministic timeout/cancel/100-burst tests pass. Independent actual delayed checkout plus cancellation and100 concurrent requests causes one checkout; capacity remains reserved until late client destruction. Real stalled SSL handshake rejects around1s and closes the physical peer.                                                                                                                                 |
| 10,11 — uncertain retirement and pg internals  | Inspected installed pg client/connection and pg-pool release/remove/connect-timeout implementations. `release(true)` removes rather than reuses a client, but idle client.end() can be graceful; explicit client.connection.stream.destroy() is necessary and executes first. Actual encrypted lost BEGIN/identity/read/COMMIT/ROLLBACK replies, cancellation, failed rollback and late completed COMMIT prove destroyed TLS socket, backend disappearance and fresh subsequent PID. No mocks are counted as physical proof. |
| 12 — late authority                            | Per-lease retired/released flags and terminal safe state prevent double release or subsequent SQL. Independent retained-old-lease and active-error probes pass. Actual delayed checkout and completed-COMMIT delivery cannot reuse retired sessions.                                                                                                                                                                                                                                                                         |
| 13 — shutdown/rotation/pool errors             | Actual active shutdown immediately destroys the socket, closes admission and allows a replacement factory after Pool shutdown. A running server statement may remain until its5s timeout; bounded backend-disappearance probe passes. Actual idle server termination is handled without an unhandled pool error; next read gets a healthy new PID. Credential rotation itself was not performed; authorized close/config recreation is the tested seam.                                                                      |
| 14,15 — closed errors/privacy                  | Wrong actual authenticated user is rejected before catalog SQL and receives acknowledged rollback. Malformed identity/replica/raw driver errors withhold. Actual DNS, malformed SSL protocol, TLS, timeout and authorization failures return fixed safe errors. Two reviewed catalog denials alone retain finite codes through bounded rollback. Driver has no raw logging; raw SQL/password/host/private detail is not copied into returned errors. Existing HTTP logging/redaction remains covered by Backend regressions. |
| 16 — query authority/fallbacks                 | Lease is an accepted internal interface, but driver enforces exact command order and two UUID parameters; arbitrary SQL, SET ROLE, concurrent commands and invalid parameters retire/withhold. No pool.query, service-role catalog fallback, generic endpoint, direct-table access or alternate function selector.                                                                                                                                                                                                           |
| 19 — install limitation                        | Default offline npm ci dry-run passes for base and candidate. Separate offline package-lock resolution produces byte-identical baseline/candidate peer warnings for Expo/worklets and then ENOTCACHED for expo-modules-core. This corroborates a shared baseline resolver issue; it does not independently reproduce a terminal ERESOLVE result or certify a clean install. No dependency upgrade was attempted.                                                                                                             |
| 20 — Builder test quality                      | All22 deterministic and13 integration cases inspected; no existing assertion/test/config was weakened. Fake release/end/query semantics do not prove sockets. Integration uses real pg/TLS/server/backend PIDs, with explicitly labeled test-only response loss and identity substitution. Original exact COMMIT matcher is correct. Static fixture function tests driver mechanics, not accepted full SQL admission/ACL/data semantics.                                                                                     |

## Executed validation and physical evidence

Evidence directory: `/private/tmp/otr-r2-independent-evidence/`.

| Independent execution                                            | Result                                                                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Original deterministic driver matrix                             | **22/22 PASS** (`driver.log`)                                                                                              |
| Original Backend/Auth/Publication/Transport matrix               | **43 suites /822 PASS /15 existing skips** (`regressions.log`)                                                             |
| Additional Auth/Account/SQLite53 Membership regressions          | **12 suites /155 PASS**, no skips (`auth-membership.log`)                                                                  |
| Reviewer deterministic negatives                                 | **9 new cases:8 PASS /1 F1 FAIL**; original22 also pass (`independent-probes.log`)                                         |
| Original actual PostgreSQL/TLS/socket matrix                     | **13/13 PASS**, no skips (`physical-original.log`)                                                                         |
| Added actual PostgreSQL/TLS/socket negatives                     | **6/6 PASS**, no skips (`physical-six-negatives-final.log`)                                                                |
| Typecheck; lint including UI guard; Backend build                | **PASS**, clean lint; unchanged server bundle builds (`typecheck.log`, `lint.log`, `build.log`)                            |
| Adapter/integration bundles; changed-file formatting; whitespace | **PASS**                                                                                                                   |
| Full-repository formatting                                       | **28 existing failures**; every failing path byte-identical to HEAD (`full-format.log`); no global formatting PASS claimed |
| Preservation                                                     | Exact source/scope/lock comparison and Builder source/test/package/report hashes pass; no refs advanced                    |

Physical fixtures were recreated independently with a fresh one-day synthetic certificate, cached PostgreSQL17.6 image and Node24 runner. Unique containers `otr-r2-independent-sql-20261009` / `otr-r2-independent-tests-20261009` used an internal task-only network `otr-r2-independent-review-20261009`, with the executable's fixed fixture hostname as network alias. No published port, external network gateway, project env file or existing container was used. Test-only synthetic LOGIN/function setup and backend termination were confined to that disposable database. Every run removed its task-owned containers/volumes/network. Reproduction script and final executable sources are retained beside the logs.

The first added shutdown probe passed immediate socket destruction but failed a2s server-backend disappearance assertion during pg_sleep. PostgreSQL can observe a disconnect after the executing statement ends; revised probe retains immediate destruction and requires disappearance within the configured5s SQL timeout plus1s margin. It passed at approximately5.16s. The initial failing log remains `physical-independent.log`; this was an incorrect probe timing assumption, not a production correction or weakened socket assertion. All original Builder assertions remain unchanged.

The wrong-login reviewer probe changes only the test Pool's user before physical login, then observes an actual `supabase_admin` session being withheld before catalog SQL. This is a negative fault injection, not a supported production override. The actual fixed-login/environment probe separately verifies production identity behavior. Synthetic function output does not certify R3 authorization, current Hosted roles, all13 projection families or real private catalog contents.

## Remaining gates and stop

1. **Dormant-code acceptance:** F1 correction plus targeted independent recheck; then Final Owner Acceptance and separately authorized closure/integration.
2. **Principal:** Owner decision for the exact gateway's read-only LOGIN/ACL profile or separately reviewed reader redesign. Accepted NOLOGIN and broader mutation EXECUTE surface cannot be treated as production-ready. No provisioning occurred.
3. **Hosted/direct endpoint:** separately authorize R3 forward lineage/security inventory, least-privilege verification, secret provisioning/expiry/rotation and direct-primary/TLS/reachability attestation. Perform actual positive and unauthorized/revoked-Trip reads under the approved principal. Pooler modes remain unaccepted.
4. **Native:** separately reviewed bounded receiver, exact DEV Test artifact and native/device acceptance. Integrated C4/Composer, C5/C9, providers and runtime connection injection remain CLOSED.

Not checked: full test suite, clean full npm install, Hosted/current principal/ACL acceptance, device/native execution or deployment. Physical tests certify this pinned pg/pg-pool combination; upgrades require renewed internal-member and real retirement checks. No commit, push, merge, rebase or runtime activation occurred.

**STOP — R2-SQL DRIVER INDEPENDENT SECURITY REVIEW COMPLETE.**

---

## F1 TARGETED RECHECK — PASS

Date: 2026-10-09 (Pacific/Auckland). Original Independent Security Reviewer, continuing the original review session. Owner-authorized scope: F1 classification correction and preservation/security regression checks only. This section supersedes F1's unresolved status and dormant-code readiness above; the original review is retained as historical evidence without edits.

### Required return

| Result                                            | Independent conclusion                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| F1 FIX VERIFIED                                   | **YES**                                                |
| Original independent probes                       | **PASS — unchanged31/31**                              |
| Physical socket retirement independently verified | **YES —19/19 actual PostgreSQL/TLS/socket cases PASS** |
| Remaining CRITICAL / IMPORTANT / required MINOR   | **0 /0 /0**                                            |
| New regressions                                   | **NO**                                                 |
| Ready for Dormant-Code Final Owner Acceptance     | **YES**                                                |
| Principal / Hosted / Native gates                 | **CLOSED**, unchanged; runtime readiness **NO**        |

### Original failure and exact correction

HEAD remains `ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d`. Independently verified the preserved pre-correction driver and tests against the original review's recorded SHA-256 values. Replayed the exact original31-probe source in a separate local replay root, using the preserved driver bytes and unchanged current shared dependencies. Result: **30 PASS /1 FAIL**, solely the original absolute-DNS pooler probe. The factory admitted `aws-0.pooler.supabase.com.` at5432, reproducing F1. No Builder production file was reverted or edited for this reproduction.

Against corrected bytes, the same original31 probes pass without changed assertions. The corrected Builder deterministic matrix passes **33/33**; its22 original assertions are retained, with11 new focused configuration controls and constructor counting. These matrices total64 passing cases, including duplicate replay of the original22.

The production diff is exactly the existing suffix-classification expression changed to `host.replace(/\.$/, "").toLowerCase()`, plus line wrapping. An exact replacement comparison proves every other driver byte unchanged. Only classification strips one terminal dot; the supplied host is still passed unchanged to pg and `checkServerIdentity(config.host, certificate)`.

Ordinary, terminal-dot, uppercase and mixed-case known Pooler spellings reject before constructing a Pool. The focused controls cover the bare known suffix and its prefixed hostname forms. Port6543 still rejects before construction. Direct-primary hostname controls, including absolute and mixed-case spellings, remain accepted with their original host strings and strict matching/mismatching TLS identity results. Static flow confirms schema rejection precedes Pool construction, ownership assignment and checkout; the rejection branch performs no DNS or network operation.

TLS chain/hostname verification, fixed gateway login, primary recovery check, READ ONLY SQL sequence, singleton Pool/max1, checkout/request/rollback bounds, socket destruction, release guards and sanitized errors are otherwise byte-identical. Arbitrary DNS aliases/proxies remain unclassified and **not certified as direct primary**. Endpoint attestation remains a separate gate; the correction adds no DNS discovery or certification mechanism.

### Independent execution

Evidence: `/private/tmp/otr-r2-f1-independent-recheck/`.

| Check                                                                      | Actual result                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-correction unchanged original31 probes                                 | **30 PASS /1 expected F1 FAIL** (`original-before.log`)                                                                                                                                                                                           |
| Corrected unchanged original31 + Builder33                                 | **64/64 PASS** (`deterministic-after.log`)                                                                                                                                                                                                        |
| Backend/Auth/Account/Publication/Transport/SQLite53 Membership regressions | **55 suites /988 PASS /15 existing skips**,29.66s (`regressions.log`)                                                                                                                                                                             |
| Real disposable PostgreSQL17.6/Node24/TLS/socket tests                     | **19/19 PASS**, zero skips,37.21s (`physical.log`)                                                                                                                                                                                                |
| Typecheck                                                                  | **PASS** (`typecheck.log`)                                                                                                                                                                                                                        |
| Full lint including UI guard                                               | **PASS**, no warnings (`lint.log`)                                                                                                                                                                                                                |
| Backend build and fresh physical executable bundle                         | **PASS** (`build.log`)                                                                                                                                                                                                                            |
| Changed-file formatting and whitespace                                     | **PASS**                                                                                                                                                                                                                                          |
| Package/lock and baseline peer behavior                                    | **Preserved**; default offline npm ci dry-runs pass for exact base and candidate. Separate package-lock resolution gives byte-identical peer warnings followed by ENOTCACHED. No clean full install or terminal ERESOLVE reproduction is claimed. |

Physical tests use the unchanged original13 Builder cases and unchanged final6 reviewer cases, freshly bundled against corrected production bytes. Real encrypted lost BEGIN/identity/catalog/COMMIT/ROLLBACK responses, cancellation, failed rollback and late completed COMMIT still destroy sockets and require fresh backend PIDs. Actual delayed checkout/cancellation retains admission through100 concurrent requests. Same-session principal/READ ONLY/SQL settings, trusted-chain/wrong-hostname negatives, hostile environment defaults, DNS/protocol errors, active shutdown/config recreation and idle-pool error replacement all pass. Backend disappearance during an executing statement remains bounded by the5s SQL timeout; socket destruction is immediate. No mock result is counted as physical proof.

Created fresh synthetic certificates and task-only disposable containers on internal network `otr-r2-f1-independent-recheck-20261009`, without published ports, project env files or Hosted access. The executable retains its exact disposable opt-in and fixed fixture hostname. Cleanup and subsequent Docker inspection confirm both task containers and the network are absent. Synthetic test database roles/functions are confined to the disposable fixture and do not provision a deployed principal. Static fixture output still does not certify Hosted R3 authorization/ACLs or full real catalog semantics.

An initial replay-root collection failed because its alias config was missing; copying the existing unchanged Vitest configuration resolved collection before the31-case reproduction. An initial typecheck overlapped removal of the temporary probe file and reported TS6053 for that file. A fresh rerun after temporary-file removal passed without source or configuration changes. Initial logs remain retained; neither harness issue is counted as a driver defect or hidden as a passing run.

### Preservation and remaining gates

Compared all1,291 paths in the pre-correction snapshot: exactly four Builder correction paths differ—driver, driver tests, append-only Builder report and incremental handoff. Package/type/lock files, original physical source, existing Backend/Auth/Mobile source, `server.ts`, migrations, accepted contracts and historical reviews remain exact. The original review before this append has SHA-256 `b2ac0e5a6ec7d6eecc61948b6997e104ae4c181842a0acb92a993a56cbe8fdff`, matching the pre-correction snapshot. The full original review remains the exact byte prefix of this document. This recheck changes only the appended section and an incremental handoff; no Builder code/assertion was modified.

F1 is closed. Dormant-code Final Owner Acceptance can proceed; local closure/integration still requires separate authorization. Principal LOGIN/read-only ACL design, R3 forward inventory and actual Hosted positive/negative acceptance, direct-primary endpoint/secret provisioning, Native bounded-receive artifact/device acceptance, Integrated C4/Composer, C5/C9, provider and runtime injection gates remain CLOSED.

Not checked: clean full npm install, full repository tests/formatting, Hosted/current principal/ACL behavior, native/device execution or deployment. No production credential/role/grant provisioning, device operation, server injection, native adapter, migration, runtime activation, commit, push, merge or rebase occurred.

**STOP — R2-SQL F1 TARGETED INDEPENDENT SECURITY RECHECK COMPLETE.**
