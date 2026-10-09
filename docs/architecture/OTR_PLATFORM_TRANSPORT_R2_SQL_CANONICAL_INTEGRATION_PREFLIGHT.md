# R2-SQL Driver Canonical Integration Preflight

Date: 2026-10-09 (Pacific/Auckland). **READY for Owner review of dormant-code canonical integration.** No integration commit or runtime authority is granted by this report.

## Source gate and proposed ancestry

Initial local main, origin/main and actual remote main agree at `2a42ec6009bc784a5e4e80a9199719c43fb44640`, advanced from the Owner's latest-known `ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d` by accepted P2c Composer canonical integration. Remote verification was read-only `git ls-remote`; no fetch/ref update or Hosted access.

Accepted SQL closure: `505991baddb396aa4526c2a519b5004825a4d6af`; sole parent exactly `ad52275c00ea0d0e2cdd956e6c86eeecfc3fe28d`, also the merge base. Exactly the eight accepted paths and title `feat(platform): add dormant protected publication postgres driver` verified. Closure is not yet in main's ancestry. Both branches descend from the accepted parent. Current main retains Transport/P2b-A/SQLite1–53 and accepted Composer closure `a2ad2ef708ebcc635c0c94e9e726bdad99751aab`.

Fresh isolated candidate: `/private/tmp/otr-platform-transport-r2-sql-integration-20261009`. Prepared `git merge --no-ff --no-commit 505991baddb396aa4526c2a519b5004825a4d6af`. HEAD stays current main; MERGE_HEAD stays the accepted SQL closure. Proposed strategy: **ancestry-preserving non-fast-forward merge**, not fast-forward, cherry-pick, squash or rebase. A future separately authorized merge commit must have current-main first parent and accepted-closure second parent. No commit or canonical ref advancement occurred here. Existing dirty primary checkout and Builder/Review worktrees were not edited.

## Conflict resolution and exact proposed scope

One actual conflict only: `docs/CURRENT_IMPLEMENTATION_STATE.md`. Resolution retains all closure's R2-SQL Builder/review/F1/final Owner sections and all main's Transport/Adapter/Composer sections verbatim, with the identical shared historical body once. A short new integration checkpoint is prepended. Historical pending labels are retained evidence; this report/current checkpoint express current readiness. No source, test, API, fixture, package or lockfile conflict/compatibility edit was needed.

Relative to verified current main, the proposed scope is exactly **nine paths**: the accepted eight plus this report.

1. `backend/src/tripPublicationCatalogPgConnection.ts`
2. `backend/src/tripPublicationCatalogPgConnection.test.ts`
3. `backend/src/tripPublicationCatalogPgConnection.integration.ts`
4. `package.json`
5. `package-lock.json`
6. `docs/architecture/OTR_PLATFORM_TRANSPORT_R2_SQL_DRIVER_BUILDER_REPORT.md`
7. `docs/architecture/OTR_PLATFORM_TRANSPORT_R2_SQL_DRIVER_INDEPENDENT_SECURITY_REVIEW.md`
8. `docs/CURRENT_IMPLEMENTATION_STATE.md`
9. `docs/architecture/OTR_PLATFORM_TRANSPORT_R2_SQL_CANONICAL_INTEGRATION_PREFLIGHT.md`

The seven non-handoff closure files remain byte-exact to accepted505991b. Original Independent Security Review and appended `F1 TARGETED RECHECK — PASS`, Builder/F1 history, deterministic tests and actual physical test source are preserved. All other main files remain byte-exact, including `server.ts`, protected SQL, SQLite1–53/registry, Account/Publication owning contracts and current P2b-A/P2c implementation/evidence. No temporary replay test, dependency symlink, certificate, Docker fixture, log, generated Backend bundle or unrelated file is proposed.

## Security, dependencies and compatibility

- Corrected classifier strips one terminal DNS dot only for known-Pooler suffix rejection; original host remains the pg/TLS identity target. Ordinary/absolute/case variants reject before Pool creation;6543 remains rejected. Arbitrary DNS/proxy directness is not certified; separate endpoint attestation is still required.
- Fixed gateway principal, verified TLS chain/hostname, direct-primary recovery check, process Pool/max1, bounded checkout/rollback, same-leased-client READ ONLY SQL and destruction on uncertain BEGIN/COMMIT/ROLLBACK/cancellation/late checkout remain exact accepted bytes. There is no SET ROLE, service-role fallback or generic networking layer.
- `pg@8.16.3` and `@types/pg@8.15.5` remain exactly pinned. Current main's baseline manifest/lock matches the closure's parent for dependencies: exactly two manifest additions and15 locked driver/type nodes, all930 pre-existing non-root nodes unchanged. No Expo/React Native drift, peer override or dependency redesign.
- Driver's optional `PublicationCatalogConnection` injection remains Backend-only and absent from `server.ts`; no default pool or process startup construction is added. Existing request5s/Backend15s deadlines, strict catalog/body validation and original Account/Trip context fences remain unchanged.
- Current main's Composer API/Adapter changes are retained unchanged. No direct dependency from Composer or Adapter to this Backend driver is introduced. Transport still finishes network before SQLite install; Account/Membership final transaction and cancellation fences remain the accepted owners. Composer retains private seals, immutable C2 recovery ownership, SQLite52 final CAS/NEW/replay/uncertainty behavior and complete SQLite53 Membership admission. This integration supplies no runtime caller connecting these dormant subsystems.

## Validation and physical evidence

**79 suites /1,833 PASS /15 existing skips**,74.12s, zero failures. The matrix unions the accepted P2c39-suite integration matrix with the full affected SQL Driver/Backend/Auth/Publication/Transport/SQLite53 matrix. Exact paths and logs are under `/private/tmp/otr-r2-sql-integration-evidence/`.

| Check                                                                                    | Actual result                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Combined Driver/Backend/Auth/Transport/Publication/SQLite53/Adapter/Composer regressions | 79 suites /1,833 PASS /15 existing skips; no source/assertion/timeout change or rerun                                                                |
| Typecheck                                                                                | PASS                                                                                                                                                 |
| Full lint/UI guard                                                                       | PASS, zero warnings;80 representative UI files/473 accepted baseline occurrences                                                                     |
| Backend build                                                                            | PASS; compile-only local bundle, no server launch                                                                                                    |
| Changed-file formatting                                                                  | All9 proposed paths PASS                                                                                                                             |
| Working/staged whitespace                                                                | PASS                                                                                                                                                 |
| Preservation/lock/ancestry                                                               | PASS;7 non-handoff closure paths exact, all other main bytes exact, both handoffs retained, unchanged HEAD/current-main and exact closure MERGE_HEAD |
| Dependency install                                                                       | Offline default-peer dry-run PASS; clean full install not performed                                                                                  |

Command: `npx vitest run <79 paths> --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism`. Exact path list: `/private/tmp/otr-r2-sql-integration-evidence/test-paths.json`; combined log: `regressions.log` in that directory. Typecheck, lint and Backend build logs are `typecheck.log`, `lint.log`, `build.log`. No full-repository test or global-formatting PASS is claimed. Existing skipped Backend tests remain opt-in; they do not provide physical proof. No newly skipped physical test was substituted for execution.

Accepted prior physical evidence is preserved, **not newly rerun or newly certified by this preflight**: original Builder13 plus reviewer6 actual disposable PostgreSQL17.6/Node24/TLS/socket cases,19/19 PASS; appended F1 targeted independent recheck independently reran those19 and passed. This covers real lost ACKs, cancellation/late checkout/COMMIT, socket destruction/new backend PIDs, wrong principal, strict TLS, shutdown and protocol/idle faults. Synthetic fixture output still does not certify Hosted R3 authorization, deployed principal/ACL or real catalog contents. No container, PostgreSQL or device operation was performed for this preflight.

Dependency-install status is separate from code validation: an offline default-peer `npm ci --dry-run --ignore-scripts` in a task-only copied-manifest directory passed. No clean full install was performed. Tests/checks use a task-owned dependency tree referencing existing installed baseline packages and exact accepted pg/type packages; prior worktree cache directories were excluded. Original historical package-lock-resolution warnings remain preserved in the accepted reports; they are not a newly reproduced install failure or a code regression here.

## Remaining gates and Owner decision

Canonical integration readiness: **READY**; requires separate Owner authorization of the exact nine-path/two-parent proposal. Dormant SQL Driver and F1 correction are already accepted. Runtime readiness remains **NO**.

Principal read-only LOGIN/ACL design and credential provisioning, Hosted R3 forward inventory/positive-negative acceptance, direct-primary endpoint/secret/TLS attestation, Session Pooler certification, Native bounded streaming and native persistence/device acceptance, Composer/Experience/default runtime injection, providers and C5/C9 remain separately gated and CLOSED. No SQL role/LOGIN/ACL/grant or protected migration change, Hosted DEV/Production access/deployment, native adapter, credential change, provider activation, business write, commit, push, merge into canonical main or ref advancement is included.

**STOP — R2-SQL CANONICAL INTEGRATION PREFLIGHT / OWNER REVIEW REQUIRED.**
