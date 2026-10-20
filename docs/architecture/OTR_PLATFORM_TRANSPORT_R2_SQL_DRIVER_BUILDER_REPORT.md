# Transport R2-SQL dormant driver Builder report

Status: Builder complete; Independent Security Review required. Ready for Independent Security Review: **YES**. Runtime activation: **NO**.

## Authorized design and source

Accepted R1 preflight: `OTR_PLATFORM_TRANSPORT_ROLLOUT_R1_PREFLIGHT.md` (separate accepted worktree). Local main, origin/main and remote main matched `ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d`; fresh detached worktree `/private/tmp/otr-platform-transport-r2-sql-20261009`. Other workstreams remain untouched. No commit, push, merge, Hosted access/provisioning, device operation or runtime activation.

The existing `PublicationCatalogConnection` is retained. One dormant Backend-only factory owns a process-wide pg Pool (max1), rejects competing factories and busy requests, uses explicit connection settings and fixed principal, verified chain/hostname TLS, primary recovery check and the accepted fixed read transaction on the exact leased client. Checkout/connect is bounded to1s, SQL work to5s, rollback to1s; the existing Backend15s deadline is unchanged. Uncertain sessions are physically destroyed before `release(true)`. A pending canceled checkout retains capacity until its late completion retires; late query completions cannot release a retired lease again. No generic SQL API, service-role fallback, SET ROLE, native driver or server provisioning is introduced.

Session Pooler remains separately gated. Known Supabase pooler hosts and transaction pooler port6543 reject; endpoint selection must still be independently attested as a direct primary because arbitrary DNS/proxies cannot be proven direct by `pg_is_in_recovery()`.

Principal provisioning remains a separate Owner design dependency: R1 found the accepted exact gateway NOLOGIN and broader mutation permissions. This Builder hardcodes that accepted identity without adding LOGIN, role changes or ACLs. A reviewed login profile/reader decision and forward R3 catalog inventory are required before any runtime provisioning.

## Verification

Local disposable SQL fixture roles/functions/certificates are synthetic test infrastructure only; accepted Supabase SQL, migrations and Hosted settings remain unchanged.

## Exact delivery scope

1. `backend/src/tripPublicationCatalogPgConnection.ts` — dormant adapter and explicit shutdown.
2. `backend/src/tripPublicationCatalogPgConnection.test.ts` — deterministic fault/deadline/capacity controls.
3. `backend/src/tripPublicationCatalogPgConnection.integration.ts` — opt-in real disposable PostgreSQL/TLS/socket matrix.
4. `package.json` — exact `pg@8.16.3` and `@types/pg@8.15.5`.
5. `package-lock.json` —15 additional driver/type nodes; all930 existing non-root nodes unchanged.
6. This Builder report.
7. `docs/CURRENT_IMPLEMENTATION_STATE.md` — incremental next-checkpoint handoff.

Existing catalog helper, callers, server wiring, Mobile code, all SQL/migrations, accepted contracts and historical reviews remain byte-identical to the accepted base. No default connection factory is called anywhere in production.

## Driver and TLS evidence

- `pg@8.16.3` is the pinned compatible pure-JavaScript driver (Node>=16; fixture runner Node24). No native binding, ORM, hosted client or new generic connection layer. Locked `pg-pool@3.14.0`, `pg-protocol@1.16.1`, `pg-types@2.2.0`; every added registry node has npm integrity metadata.
- npm SHA512: pg `sha512-enxc1h0jA/aq5oSDMvqyW3q89ra6XIIDZgCX9vkMrnz5DFTw/Ny3Li2lFQ+pt3L6MCgm/5o2o8HW9hiJji+xvw==`; types `sha512-LF7lF6zWEKxuT3/OR8wAZGzkg4ENGXFNyiV/JeOt9z5B+0ZVwbql9McqX5c/WStFq1GaGso7H1AzP/qSzmlCKQ==`.
- Explicit host/port/database/password; fixed `user=otr_trip_source_command_gateway`. Strict input rejects connection strings, alternate user, SSL overrides and unknown fields. pg environment principal/SSL defaults cannot override these explicit settings. No `pool.query`, `SET ROLE`, service-role or anonymous fallback.
- TLS is always enabled with `rejectUnauthorized:true`; Node's `checkServerIdentity(config.host, certificate)` enforces the configured DNS/IP identity, including IP addresses. Optional owner-supplied CA selects the explicit trusted chain; otherwise Node system trust is used. TLS URI flags cannot override it because no connection string is accepted. Actual untrusted-chain and trusted-wrong-hostname cases reject before catalog admission.
- Inspected exact installed `pg/lib/client.js` and `pg-pool/index.js`: `release(true)` removes the client but idle `client.end()` can be graceful. Retirement explicitly destroys `client.connection.stream` before `release(true)`; this one pinned internal member is the compatibility dependency Independent Review must inspect. Shutdown also destroys the last physical socket before pool end. A driver upgrade must rerun these real retirement checks.
- Process owner rejects a second factory until shutdown completes. Capacity is admitted synchronously before checkout; a100-request burst calls pg.connect only once. Cancellation while checkout is pending retains the capacity reservation through late destruction. No query pipelining; fixed SQL order only, exact UUID parameters, terminal COMMIT/ROLLBACK before normal release.
- Every request has the existing5s SQL boundary and unchanged15s Backend boundary. Driver connection/checkout deadline1s, rollback1s, session statement_timeout5s / lock_timeout1s / idle-in-transaction timeout5s. Abort, closed factory, protocol/driver error or missing ACK destroys the lease; late completion has no release authority. Two reviewed catalog SQL denials alone may perform bounded rollback; externally returned errors contain only reviewed finite codes and a fixed message.

References: [node-postgres Pool/release](https://node-postgres.com/apis/pool), [node-postgres TLS and connection-string caveat](https://node-postgres.com/features/ssl), [Node TLS identity verification](https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert).

## Disposable fixture and physical evidence

A task-only Docker internal network (`otr-r2-sql-20261009`), PostgreSQL17.6 image `public.ecr.aws/supabase/postgres:17.6.1.167`, and cached `node:24-bookworm-slim` runner were used. The network has no external gateway; no existing container, Hosted project, project env file or credentials were used. One-day self-signed certificates are synthetic fixtures, never production TLS settings. Test-only LOGIN/function/grant setup exists solely inside this disposable instance; no repository migration or deployment SQL was added.

The fixture function returns a static accepted catalog fixture; this proves driver/transaction behavior, not the full accepted protected-function authorization or Hosted R3 inventory. The real identity test asserts session_user=current_user=the exact gateway, transaction_read_only=on and one backend PID, then verifies reuse only after acknowledged COMMIT. Wrong identity is a labeled test-side query substitution, since production connection identity is fixed and cannot be overridden.

For lost responses a local TCP proxy forwards real encrypted client traffic and drops only PostgreSQL→client responses at the selected command. pg_stat_activity confirms the real server executed BEGIN/read/COMMIT/ROLLBACK: open transactions for in-transaction faults, idle after COMMIT/ROLLBACK. Tests assert the real TLS socket's destroyed state, disappearance of that PID from pg_stat_activity, and a different PID on subsequent acquisition. Cancellation uses the same physical checks. A separate actual completed COMMIT Promise is delayed past the deadline, then delivered late; the retired socket remains dead and a subsequent request receives a new backend. A real SQL rollback error also destroys the backend. A stalled PostgreSQL SSL handshake proves the checkout bound and physical peer closure. **Physical retirement verification is real PostgreSQL PASS, not inferred from mocks.**

Reproduction after supplying the same disposable fixtures (never a Hosted endpoint):

```sh
npx esbuild backend/src/tripPublicationCatalogPgConnection.integration.ts --bundle --platform=node --target=node24 --format=cjs --outfile=/tmp/physical.cjs
# Run in the isolated Node container with /physical.cjs and /r2-tls/server.crt:
OTR_R2_DISPOSABLE_SQL=otr-r2-sql-20261009 node --test /physical.cjs
```

Disposable setup used for the real matrix (regenerate the one-day certificate for later review):

```sh
mkdir -p /tmp/otr-r2-review-tls
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout /tmp/otr-r2-review-tls/server.key -out /tmp/otr-r2-review-tls/server.crt -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,DNS:otr-r2-sql-20261009'
docker network create --internal otr-r2-sql-20261009
docker create --name otr-r2-sql-20261009 --network otr-r2-sql-20261009 -e POSTGRES_PASSWORD=otr_r2_local_fixture public.ecr.aws/supabase/postgres:17.6.1.167 bash -lc '
install -o postgres -g postgres -m 600 /r2-tls/server.key /tmp/r2-server.key
install -o postgres -g postgres -m 644 /r2-tls/server.crt /tmp/r2-server.crt
exec /usr/local/bin/docker-entrypoint.sh postgres -c "listen_addresses=*" -c ssl=on -c ssl_cert_file=/tmp/r2-server.crt -c ssl_key_file=/tmp/r2-server.key'
docker cp /tmp/otr-r2-review-tls otr-r2-sql-20261009:/r2-tls
docker start otr-r2-sql-20261009
# Confirm ready before starting the runner; repeat this check if initialization is pending.
docker exec otr-r2-sql-20261009 pg_isready -U supabase_admin -d postgres
docker create --name otr-r2-sql-tests-20261009 --network otr-r2-sql-20261009 -e OTR_R2_DISPOSABLE_SQL=otr-r2-sql-20261009 node:24-bookworm-slim node --test /physical.cjs
docker cp /tmp/physical.cjs otr-r2-sql-tests-20261009:/physical.cjs
docker cp /tmp/otr-r2-review-tls otr-r2-sql-tests-20261009:/r2-tls
docker start -a otr-r2-sql-tests-20261009
docker rm -fv otr-r2-sql-tests-20261009 otr-r2-sql-20261009
docker network rm otr-r2-sql-20261009
```

Both Builder test containers and their task-owned network were removed after the evidence was saved. Cached images and existing containers were unchanged.

The integration executable refuses to run without that exact disposable opt-in and targets only the fixed isolated container hostname. Normal Vitest does not silently skip or claim these physical cases; they are a separate Node test run.

## Validation results and limitations

Final actual results:

- Real PostgreSQL/TLS/physical matrix: **13/13 PASS**, no skips,33.97s. Logs: `/private/tmp/otr-r2-sql-evidence/physical-final.log`.
- Driver deterministic matrix: **22/22 PASS**, included in the combined regression count.
- Final existing Backend + Publication Transport + canonical read Transport matrix: **43 suites /822 PASS /15 existing skipped**,27.72s with `--maxWorkers=2`. Logs: `/private/tmp/otr-r2-sql-evidence/regressions-final.log`. The skips are existing opt-in tests; no physical result depends on those skips.
- Typecheck, full lint/UI guard (clean, zero warnings), Backend build and separate adapter/integration bundle PASS. Changed-file formatting and whitespace PASS. Existing930 dependency nodes and all accepted runtime/SQL/review files remain unchanged.
- Final local main/origin/main/remote main recheck still equals the exact accepted base; no refs advanced.
  The initial npm package-lock-only install encountered the baseline Expo/react-native-worklets optional-peer resolver conflict. Exact packages were installed in a task-only dependency directory, npm-generated driver nodes were merged without altering any existing lock node, and an offline `npm ci --dry-run --ignore-scripts --legacy-peer-deps` passed. Validation used existing installed dependencies plus those exact driver packages; a clean default-peer full install is not newly certified. No baseline dependency upgrade was attempted.

The first physical matrix was9/10: the COMMIT test's substring matcher also matched READ COMMITTED in BEGIN. The test was corrected to exact command matching; the next12/12 matrix passed. No production defect was inferred from that test-only failure. One broad concurrent regression run hit the unchanged collection stress test's5s Vitest timeout; the initial Backend/Transport matrix had passed. The unchanged final43-suite rerun passed with two workers; no timeout/test source/config change was made.

## Independent Review gate

Ready for Independent Security Review: **YES**. Runtime readiness: NO. Principal LOGIN/ACL design, direct-primary endpoint attestation/credential provisioning, forward R3 catalog verification, Session Pooler certification, native bounded streaming and integrated owning composition remain separate CLOSED gates. Review is required before any local closure or integration authorization. No commit, push, merge or activation is included.

## F1 correction — targeted Independent Security Recheck required

Owner authorization: correct the accepted Independent Security Review's sole IMPORTANT finding, at exact unchanged HEAD `ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d` in this same isolated worktree. The original Independent Security Review and all earlier Builder report text are preserved unchanged. Historical readiness above is superseded by this correction checkpoint; no Final Owner Acceptance or runtime approval is implied.

### Original reproduction and minimal correction

Before changing source, replayed the exact original independent negative test from `/private/tmp/otr-r2-independent-evidence/independent-probes.test.ts`, filtering to `rejects an absolute DNS spelling of the known session pooler`. **FAIL reproduced**: the factory admitted `aws-0.pooler.supabase.com.` at port5432; the assertion expecting rejection failed. The other30 cases were deselected, not claimed as tested in that reproduction. Log: `/private/tmp/otr-r2-sql-f1-evidence/original-negative-before.log`.

The only production change is classification of `host.replace(/\.$/, "").toLowerCase()` against the existing known-pooler suffix. This removes one terminal DNS dot only for case-insensitive classification. The original configured host remains unchanged for pg connection and Node TLS certificate identity verification. Ordinary/absolute uppercase/mixed-case known Pooler names reject; the existing6543 rejection remains. Direct-primary names, including absolute and mixed-case positive controls, retain admission. There is no DNS resolution, discovery, new dependency or networking abstraction. Arbitrary DNS/proxy directness is **not** certified by suffix classification or `pg_is_in_recovery()`; endpoint attestation remains a separate CLOSED gate.

Added11 focused deterministic controls:7 ordinary/absolute/case Pooler negatives assert no Pool construction;3 direct-primary positives assert exact original host, strict TLS and matching/mismatching certificate identity;1 port6543 negative asserts no Pool construction. Original22 driver assertions remain unchanged. After correction, unchanged original reviewer harness31/31 plus corrected Builder driver33/33 = **64/64 PASS** (the reviewer harness includes a duplicate replay of the original22 cases). Log: `/private/tmp/otr-r2-sql-f1-evidence/deterministic-after.log`. Temporary replay copies were removed after execution.

### Final validation

- Affected Backend/Auth/Publication/Transport and SQLite53/Membership regressions: **55 suites /988 PASS /15 existing skips**,26.43s with two workers. This includes the33-case corrected driver matrix; no new skipped case. Log: `/private/tmp/otr-r2-sql-f1-evidence/regressions-after.log`.
- Real disposable PostgreSQL17.6 / Node24 / verified TLS and socket replay: **19/19 PASS**, no skips,35.63s (original Builder13 plus unchanged reviewer6). Actual untrusted-chain/wrong-hostname negatives, same-PID read-only SQL, lost ACKs, cancellation, late checkout/COMMIT, failed rollback, protocol/idle errors and physical backend replacement remain green. This is actual PostgreSQL evidence, not mock retirement certification. Log: `/private/tmp/otr-r2-sql-f1-evidence/physical-after.log`. The replay is Builder validation of existing reviewer probes, not a new independent-review verdict.
- Typecheck, full lint/UI guard (zero warnings), Backend build, fresh physical executable bundle, four changed-file formatting and whitespace checks: **PASS**. Logs and opt-in disposable reproduction script are in `/private/tmp/otr-r2-sql-f1-evidence/`. Task-only containers/volumes/internal network were removed by the guarded fixture script.
- Preservation: exactly four correction paths differ from the pre-correction snapshot: driver, driver unit tests, this report (append only), and current-state handoff (incremental new checkpoint). Original Independent Security Review is SHA-256 identical. Physical source, package/type/lock, existing Backend/Mobile/Auth/SQL and every other initial file remain byte-identical; expected HEAD remains exact. Temporary replay copies were removed.

No package/type/lock changes, TLS weakening, identity/pool/SQL/lifecycle changes or production caller injection. The existing physical test sources and original independent review are unchanged. Test-only synthetic SQL/TLS fixture setup is confined to newly disposable internal-network containers; no deployed Principal/LOGIN/ACL/grant, credential or configuration change is made.

### Correction result and stop

F1 corrected: **YES**. Original negative: **FAIL reproduced before /PASS after**. Ready for Targeted Independent Security Recheck: **YES**. Ready for Final Owner Acceptance or runtime activation: **NO**; targeted independent recheck remains required. No Hosted DEV/Production access, deployed SQL Principal/LOGIN/ACL/grant change, credential/deployment, native/device operation, runtime connection injection, commit, push, merge or rebase occurred.

**STOP — R2-SQL F1 CORRECTION COMPLETE / TARGETED INDEPENDENT SECURITY RECHECK REQUIRED.**
