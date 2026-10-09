# R3-A SQL Principal Independent Security Review

Date: 2026-10-09 (Pacific/Auckland). Independent PostgreSQL / Backend Security Reviewer.

What this change does: Adds a dormant dedicated Catalog Reader and extends only the protected read root's exact session allowlist. Backend authentication and same-lease checking require that Reader; the command gateway keeps its existing SQL compatibility and command grants.

| Required return                                  | Result                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Verdict                                          | **PASS WITH REQUIRED CORRECTIONS**                                                |
| CRITICAL / IMPORTANT / MINOR                     | **0 / 1 / 0**                                                                     |
| Administrator transition independently verified  | **YES**, both grantor-restoration branches, forward/reverse and failure injection |
| H1 / rollback independently verified             | **YES**, identical commitments on both fresh final installs                       |
| New regressions in accepted existing behavior    | **NO** in the executed affected matrix; F1 is a new negative-contract failure     |
| Ready for Dormant-Code Final Owner Acceptance    | **NO**, correct F1 and independently recheck                                      |
| Hosted / Secret / Direct TLS / Runtime readiness | **NO**, separately authorized gates remain closed                                 |

## IMPORTANT — F1: unsafe default ACL drift passes the forward

Locations: `supabase/dev-forward/r3-v1/202610090001_publication_catalog_reader.sql:113–127` and its H0/H1 commitment expressions; the reverse has the same omission. `publication-catalog-principal-inventory.sql:43–45` reports default ACLs but does not enforce them.

**What this is:** PostgreSQL default ACLs assign privileges to future objects. The accepted preflight expressly requires: “No default ACL may expose new business objects to the reader or PUBLIC.” Its positive fixture currently has an empty relevant default-ACL inventory.

**Problem:** Neither the commitment nor the forward postcondition rejects unsafe `pg_default_acl` entries. On each independent fresh install, the following succeeds before the forward without changing accepted H0:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO PUBLIC;
```

The complete forward, including its original postcondition and H1 check, still accepts. A reviewer transaction runs that exact forward with only its final COMMIT replaced by subsequent probe statements and ROLLBACK. Creating `public.review_future_business` afterward yields `has_table_privilege(Reader, table, 'SELECT') = true`. The whole probe rolls back; the unsafe preexisting default entry is explicitly removed afterward, with H0 restored.

A separate real TLS/SCRAM login demonstration on each installed fixture adds the same default grant at H2, creates a synthetic future table containing `review-synthetic-private`, and issues an explicit Reader `BEGIN READ WRITE; SELECT secret ...; ROLLBACK`. Reader returns that value. Table/default cleanup restores exact H2. No existing accepted business rows are exposed in this demonstration. Read-only defaults do not prevent this access.

**Smallest fix:** Add a transactionally enforced default-ACL check for Reader/PUBLIC future business capabilities, covering applicable global and schema defaults, to the forward and reverse validation boundaries. Reject drift without changing shared ACLs. Reuse the existing inventory semantics and preserve any explicitly accepted harmless managed defaults. Add failed-install/unchanged-state tests for unsafe PUBLIC table and sequence defaults, then rerun the unchanged reviewer probes. Regenerate artifact hashes/evidence if SQL bytes change; do not rewrite historical migrations or original evidence.

**If skipped:** A database with unsafe future grants can pass the advertised fail-closed installation and provision a Reader that later acquires direct business access outside the protected Catalog root. This is a demonstrated contract gap, not a claim that the accepted current Hosted target has such grants or that Reader can alter administrator defaults itself.

Evidence: `sql-evidence-data-final/*-default-acl-bypass.txt`, `*-actual-default-select.txt`, and `sql-review-data-final.py` under `/private/tmp/otr-r3a-independent-20261009`. Both expected unsafe-default rejection cases instead accept. Four recorded probes confirm the same F1: two acceptance reproductions and two real-login disclosure demonstrations.

PostgreSQL documents that defaults apply to future objects and use the creating role's defaults, which explains why current relation checks miss them. [PostgreSQL 17 ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

## Source and preservation

All review source, builds and tests targeted the existing Builder worktree:
`/Users/xoery/.codex/worktrees/platform-r3a-principal-builder/otr-mobile-canonical`.
HEAD independently equals `d263503b6e6ced9edee977508ffeff94e90ad4df`. Initial status has exactly the reported **17 paths: seven tracked modifications and ten untracked Builder artifacts**. Captured the original binary diff, status and SHA-256 values for **1,321 present tracked/untracked files** before validation. Compared all **1,311 tracked paths** against HEAD: only those seven reported tracked files differ.

Read current-state first, applicable instructions/project documents, accepted R3-A preflight/Builder report, R1 retained artifact, authenticated Transport review/F1 closure, SQL Driver review/F1 closure, Source private-access/execution contracts and R3/Ledger provenance. Traced the changed production functions through `supabaseGateway.ts`, verified Auth, HTTP route, parser, protected root and its immediate helpers. No legacy Web inspection was needed. This review does not claim remote-ref freshness or a current Hosted observation.

Historical SQL/migrations, installed Ledger forward, SQLite51–53/registry, accepted Native/Composer/Account/Auth/Import owners, package/lockfiles and `server.ts` remain exact HEAD bytes. The original Builder files, reports, preflight and proof are unchanged; only this review and an append-preserving handoff prefix are delivered. No checkout was created or Git ref advanced. A temporary ignored symlink used the already installed accepted dependencies for validation and was removed afterward.

## Effective Reader privilege assessment

The clean final local manifests are identical on both installations. Reader starts **NOLOGIN / PASSWORD NULL**, with null expiry, connection limit1, no superuser/CREATEDB/CREATEROLE/INHERIT/REPLICATION/BYPASSRLS and the five specified session settings.

- Dedicated, non-grantable privileges: database `postgres` CONNECT, `public` USAGE and EXECUTE on `public.trip_source_read_import_catalogs(uuid,uuid)` only.
- No outgoing memberships, business table/live-column/sequence rights, owned objects or non-system CREATE. Incoming Reader administrator membership is exactly `[Reader, postgres, supabase_admin, ADMIN=true, INHERIT=false, SET=false]` in these fixtures. Raw grantor identities are retained, not inferred from aggregated membership hashes.
- All thirteen other Source/Import command roots reject EXECUTE with SQLSTATE42501 in real **READ WRITE** sessions. Direct SELECT/INSERT/UPDATE/DELETE, helper calls, persistent DDL and writer-membership escalation also reject independently of read-only settings or CLOSED command gates.
- The only reachable non-system SECURITY DEFINER routine is the protected Catalog root. Seven PUBLIC invoker routines are trigger-only hooks; direct invocation rejects. Their bodies do not confer definer authority; attaching a hook to a permitted temporary object does not grant underlying business ACLs.
- PUBLIC CONNECT/TEMP, public schema USAGE and ordinary catalog visibility remain. Actual temporary-table creation/insertion in READ WRITE succeeds. These are accepted ambient capabilities, not evidence of a strictly read-only PostgreSQL identity.
- Two extensions statistics views have raw PUBLIC SELECT ACLs, but Reader lacks `extensions` USAGE. Actual statistics-view and crypto calls fail at that schema boundary. The gateway's wider historical extension surface is not attributed to Reader.
- Clean relevant default ACL inventory is empty. **The install does not enforce this fact: F1.** No other immediate business-data or privileged escalation path was demonstrated on the clean fixtures.

SQL identifies the trusted Backend login and independently checks current Trip access for the supplied Actor. It does not verify an end-user bearer token. A compromised Reader credential can deliberately supply a known admitted Actor/Trip pair and disclose that Actor's private Catalog. The positive compromised-login probe confirms this documented trust boundary. Owner acceptance, secret custody and emergency session retirement remain required; no JWT/GUC or alternate principal narrows this disclosure radius.

## Review matrix

| Requirement                                          | Independently verified result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3: base, scope, dormancy, Reader initial profile   | Exact base/17 paths; only two production principal literals change. NOLOGIN/PASSWORD NULL and dedicated grants verified after actual forward.                                                                                                                                                                                                                                                                                                                                                                       |
| 4–6: gateway, root and thirteen families             | Gateway remains NOLOGIN with all original14 roots. Root owner `otr_trip_source_writer`, STABLE/SECURITY DEFINER, `search_path=pg_catalog`, UUID signature and JSONB result persist. Installed body is exactly original body with only the session predicate replaced. Current creator/legacy-member/linked-guest admission and private projections persist.                                                                                                                                                         |
| 7–9: administrator transition/failure safety         | NOSUPERUSER postgres applies forward/reverse. Existing non-inheriting self-grantor edge and absent-self-edge branches both restore exact raw memberships, including grantors. Injected exceptions after inheritance grant, root replacement, root ACL change, each restoration branch, completed replacement block and completed postcondition roll back exact roles/memberships/defaults/catalog/database state: **24 cases** across both directions/branches. No persistent inheritance or SET authority remains. |
| 10–14: fallback/effective ACL/ambient paths          | No SET ROLE, service-role Catalog API, generic SQL selector or direct-table fallback. Real READ WRITE command/business/helper/DDL negatives and manifests pass. PUBLIC/TEMP/extensions/statistics and invoker/definer behavior assessed above. Unsafe defaults are the required F1 correction.                                                                                                                                                                                                                      |
| 15–17: Backend Actor/fixed identity/lease safeguards | HTTP Actor derives exclusively from verified `auth.getUser(token)` result; caller Actor fields do not establish authority. Backend both fixes pg user and checks actual same-lease session_user for Reader only. Old gateway and other principals reject before Catalog SQL. Pool/max1, direct/primary gate, verified chain/hostname TLS, exact SQL sequence, checkout1s, rollback1s, SQL5s and Backend15s are preserved. Actual socket replay passes.                                                              |
| 18–20: H1/H2/reverse/atomic rejection                | Exact commitments below reproduced. Polluted preexisting Reader remains polluted after rejected forward; H0 helper ACL drift rejects atomically. Reverse restores exact root/ACL, retains an unowned dormant role and preserves gateway grants, history/lineage and retained fixture data. Failure rollback verified in both branches. Unsafe default drift instead accepts: F1.                                                                                                                                    |
| 21–22: boundaries and fixtures                       | No Hosted/Production access, actual secret provisioning, server injection/deployment, native/device operation or runtime/provider activation. Original test assertions/config remain unchanged except Builder's declared principal updates and added checks. Fixture limitations below remain explicit.                                                                                                                                                                                                             |

## Independent executed evidence

Evidence directory: `/private/tmp/otr-r3a-independent-20261009`.

| Validation                                         | Result                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final two fresh disposable PostgreSQL17.6 installs | **133 recorded outcomes:129 successful contract/failure-safety checks and4 confirming F1 probes**;66/67 outcomes by branch. `sql-review-data-final.log`, `sql-evidence-data-final/sql-proof.json`. Earlier129/131-outcome runs also retained.                                                                                   |
| Actual protected SQL behavior                      | Creator, legacy-only Member and linked Guest positive reads; foreign Actor/Trip, revoked legacy membership and wrong actual principal reject. Wrong principal also rejects by session guard after a fixture-only EXECUTE grant. Complete nonempty13-family output and another admitted Actor's empty private output reproduced. |
| Family/body bounds                                 | Every family accepts64/rejects65 through actual Reader login. Exact canonical4,194,304 bytes accepts; +1 rejects the whole projection. Original SQL JSON text admits, then five duplicate/numeric corruptions reject before normalization.                                                                                      |
| Backend/Auth/Transport/Membership/Composer         | **57 files /1,181 PASS /15 existing skips**:55-file matrix1,098 PASS plus two P2b-A/P2c Adapter/Observation suites83 PASS. No failed existing assertion. Commands and JSON/log evidence retained.                                                                                                                               |
| Real PostgreSQL/TLS/Driver socket replay           | **19/19 PASS**,35.26s, zero skips. Existing13 physical cases plus accepted6 independent cases freshly bundled against Builder bytes; principal fixtures mechanically changed to Reader. `physical-final.log`.                                                                                                                   |
| Typecheck, lint/UI guard, Backend build            | **PASS**, clean lint.                                                                                                                                                                                                                                                                                                           |
| Scoped formatting, whitespace and preservation     | **PASS**. Full formatting has **28 unchanged HEAD failures**, independently checked by blob comparison; no global formatting PASS claim.                                                                                                                                                                                        |

Physical tests verify same-session TLS/primary/read-only settings, wrong identity before SQL, hostile environment defaults, trusted wrong hostname/untrusted chain denial, lost BEGIN/identity/Catalog/COMMIT/ROLLBACK replies, cancellation, checkout stalls, completed late COMMIT, failed rollback, active shutdown and idle-pool error replacement. Uncertain TLS sockets are immediately destroyed and subsequent requests get fresh backend PIDs. An executing PostgreSQL backend may disappear only after its5s statement timeout; shutdown evidence uses the accepted bounded margin. Driver tests use a synthetic static root and are not credited as protected Catalog authorization evidence.

The initial physical replay used a reviewer certificate missing localhost, so its proxy failed TLS before reaching the lost-response phase and caused cascading fixture timeouts. Preserved `physical-initial-cert-error.log`; regenerated only the disposable certificate with fixture DNS plus localhost, reran unchanged production/tests/assertions, and all19 passed. An attempted standalone parser test used a nonexistent test-file name and collected nothing (`strict-json.log`); strict parsing is instead covered by the actual SQL-text probes and the passing Transport/Backend suites. The additional Adapter invocation included a nonexistent migration filename; Vitest selected the two existing suites reported above. Neither nonexistent filename is counted as a passed suite.

## Commitments and fixture limits

| State                             | Independently observed SHA-256                                     |
| --------------------------------- | ------------------------------------------------------------------ |
| H0                                | `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906` |
| Dormant H1                        | `60e25a6bdd8a4359fcdb6246ad0a967ea03402f46c200f40478417194e9d49cc` |
| Synthetic LOGIN H2                | `4c69a199b5fc50f25d66b6bef3a3c72981ec163882e469ac0b49fc9319648fe9` |
| Reverse / retained dormant Reader | `a2f7bcceedcbfe49688af8f064305f6e251a8418df5a16568203a6dae2152642` |

Forward SHA-256 remains `b107a706d35b3dc829c03136407cf15dc769b1c4b25b66397a382020fc71fe75`; reverse remains `dba2a7d9dfe447d54b6a75b9ee5382f0c9e75915f69dd8354894ffb5ea6c44d6`. Exact original root and only changed root hashes reproduce Builder evidence. Actual all-public business-row comparisons before/after reverse pass in both final fixtures; per-install SHA-256 evidence is retained in `*-data-preservation.txt`. Original installed Ledger forward remains `983674336ac12bffb7746a4d76fc0c79c53b7b3dfec307aaf1875d00aa55f4f2`.

Reviewer runners live outside production code, reference the Builder root explicitly and use distinct task-owned container names. Reproduce with `python3 /private/tmp/otr-r3a-independent-20261009/sql-review-data-final.py` and `bash /private/tmp/otr-r3a-independent-20261009/run-physical.sh`; they refuse existing task container/network names and clean only their created resources. No retained Builder evidence is overwritten.

These are local synthetic proofs, not full Hosted equivalence. Retained R3/platform fixtures supply schema and accepted local H0. Baseline restoration uses disposable administrator authority; candidate/reverse run as NOSUPERUSER postgres. History has68 synthesized canonical rows, with local full-row hash `3a0751caeb8ec9e81023cbe935b8bdf58076b299cf822f0ae7733ca52164daf6`, preserved on each install; it is not the Hosted history hash. Timestamp-bearing lineage rows are preserved locally and naturally differ across installs. Stress rows bypass FK/guard triggers only for administrator fixture setup, so cardinality proof does not certify valid command publication/lineage. Exact-byte TEXT stress retains row-local checks. Task certificates/passwords and LOGIN transitions exist only in removed disposable fixtures; no deployable credential is provisioned.

H1/H2 exclude password bytes, expiry, connection limits, default ACLs and parts of managed platform state. Separate manifests and exact Hosted inspection remain essential. Reverse retains Reader, so its commitment differs from H0 and original forward intentionally refuses reinstallation. After future provisioning, withholding injection, disabling LOGIN/retiring secrets and terminating every existing Reader session must precede reverse; NOLOGIN alone does not terminate sessions.

## Remaining acceptance gates

1. Correct F1 and obtain a targeted independent recheck before Dormant-Code Final Owner Acceptance. Preserve this original finding and all Builder/preflight evidence.
2. Separately authorize Hosted DEV-only H0/history/lineage/CLOSED/managed/default-ACL inventory, exact additive forward, H1/manifest readback and reviewed reverse evidence. Never rerun the original rebuild or installed Ledger forward.
3. Separately authorize finite-expiry Reader-only credentials, Backend secret custody, rotation and emergency session termination; record actual H2 and complete manifest. No Production access is needed.
4. Attest the actual direct-primary hostname/port, trusted TLS chain/hostname, primary state and same-lease Reader identity. Local TLS is not Direct Hosted TLS acceptance.
5. Separately authorize Backend injection/deployment and bounded live Catalog acceptance; Native receive/runtime/device gates remain distinct. Preserve original Account generation/cancellation and final SQLite admission, offline-first history, Composer/C5/C9/provider/command CLOSED gates.

Not checked: current Hosted equivalence, actual secret/endpoint lifecycle, full repository test suite or device/runtime behavior. Risk: F1 permits unsafe future grants; compromised Reader credentials retain the documented admitted-Actor disclosure radius.

STOP — R3-A SQL PRINCIPAL INDEPENDENT SECURITY REVIEW COMPLETE.

## F1 TARGETED RECHECK — PASS

Date: 2026-10-09 (Pacific/Auckland). Original R3-A Independent PostgreSQL Security Reviewer. This appendix supersedes only F1's unresolved status and dormant-code readiness above. The original review remains unchanged as historical evidence.

What this change does: Rejects unsafe future table/view/foreign-table and sequence defaults at forward/reverse entry, final validation and the read-only security commitment. It records applicable PUBLIC/Reader default grants in an extended digest without changing shared ACLs or the Catalog/Backend architecture.

| Required return                                 | Independent result                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 FIX VERIFIED                                 | **YES**                                                                                                                                                       |
| Original attack scenarios closed                | **YES at corrected validation/commitment boundaries**; legacy-hash forensic administrator control remains possible and is not a corrected acceptance boundary |
| Extended H1 / rollback verified                 | **YES**, matching on two independent clean installations                                                                                                      |
| Administrator restoration verified              | **YES**, both branches and all original24 transition rollback cases                                                                                           |
| Remaining CRITICAL / IMPORTANT / required MINOR | **0 /0 /0**                                                                                                                                                   |
| New regressions                                 | **NO** in the executed affected application and physical matrices                                                                                             |
| Ready for Dormant-Code Final Owner Acceptance   | **YES**, dormant corrected artifacts only                                                                                                                     |
| Hosted / Secret / Direct TLS / Runtime gates    | **CLOSED**; no provisioning, live-read or deployment acceptance                                                                                               |

### Exact source, diff and preservation

All source/tests/builds target the existing Builder worktree at `/Users/xoery/.codex/worktrees/platform-r3a-principal-builder/otr-mobile-canonical`. HEAD remains exact expected `d263503b6e6ced9edee977508ffeff94e90ad4df`; no checkout or Git ref was created or changed. Captured **1,323 tracked/untracked file hashes** before this recheck. Initial scope is the original18 Builder/reviewer paths plus one new security commitment SQL file.

Compared corrected SQL/inventory/runner against preserved pre-F1 files. The correction reaches only forward/reverse guards and extended hash checks, inventory/manifest/proof, disposable runner, appended Builder evidence and handoff, plus the new read-only SQL file. Root body/ACL/session predicate, administrator replacement/restoration sequence, Backend/Driver/Native/Composer/SQLite51–53, package/lockfiles and accepted contracts are unchanged. The original Builder report/proof sections remain retained; no preflight or historical migration was rewritten. The original review SHA-256 is `a3ba33924d7c01aa00d9c74ac3d56a1fec90cccf431f23038de2f8ac91189b6f`; the exact original bytes precede this appendix.

Preserved original reviewer runner SHA-256 remains `511898861afa134d6bc380337435c73fa034c686878a5984589617a767b03df2`. Probes and evidence are outside production code at `/private/tmp/otr-r3a-f1-independent-recheck`. Temporary dependency symlink uses existing installed dependencies and is removed after validation. This recheck delivers only this appendix and a short handoff prefix.

### Original failure and corrected-boundary replay

Freshly replayed the preserved original reviewer runner on the preserved pre-correction forward/reverse/inventory. Only artifact/output locations and task-container names changed; attack SQL/assertions stayed unchanged. Original forward SHA-256 is still `b107a706d35b3dc829c03136407cf15dc769b1c4b25b66397a382020fc71fe75`. Both installations reproduce F1: PUBLIC future-table SELECT leaves legacy H0 unchanged, the original full forward accepts, and actual TLS Reader SELECT returns the synthetic future-business value. The original133-outcome matrix completes with its four confirming F1 probes (`reproduce.log`, `reproduce/sql-proof.json`). This is successful reproduction of the defect, not a pre-correction security PASS.

Independently reran the corrected **235-outcome matrix,117/118 by branch**, on two fresh network-none PostgreSQL17.6 fixtures (`corrected.log`, `corrected/sql-proof.json`). It imports the preserved attack/failure functions only after verifying their original hash. The preexisting PUBLIC SELECT attack now fails at the corrected forward before future objects are created. The preserved post-install attack body, with only its commitment helper bound to the corrected contract, fails at that commitment boundary before its future-table SELECT. Both are atomic and their attack statements are unchanged.

The unchanged post-install attack with its **legacy OTR-only helper** remains a forensic control: an administrator may add unsafe defaults after validation, create a future table and let Reader read its synthetic value. Corrected validation rejects that drift, and the forensic extended digest changes. Passing an obsolete hash or skipping validation does not certify the corrected contract. The Builder accurately documents this distinction and the continued compromised-Reader admitted-Actor/Trip disclosure radius.

### Default privileges and independent negative controls

The predicates inspect positive `pg_default_acl` entries of relation class `r` and sequence class `S` for PUBLIC or the exact Reader, across every creating role, database-global scope or non-system schema. Relation class `r` covers tables, views and foreign tables. Every privilege is rejected, including MAINTAIN and grant options; neither current creator LOGIN/CREATE nor Reader schema USAGE is used to dismiss future exposure. Reader has no outgoing memberships, so no inherited recipient is omitted from its current profile.

Schema defaults add to global defaults; a schema REVOKE cannot subtract a global grant. The matrix exercises global/schema combinations and ineffective REVOKE masking. Existing Reader/default grants cannot precede an absent role: a preexisting Reader is already rejected rather than sanitized. Direct Reader drift after creation is tested at forward postcondition, and existing direct grants are tested at reverse/commitment boundaries.

| Security challenge                                    | Independently observed result                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsafe default scopes/recipients                      | **96 atomic cases** in the corrected matrix: PUBLIC tables/sequences, multiple creators, global/public/auth/extensions, additive combinations; direct Reader grants; after-entry drift at forward/reverse final validation. Guard/commitment reject and preserve deliberately unsafe prior state.                                                                                      |
| Default guards removed from reviewer-only SQL copies  | Extended forward final digest rejects; extended reverse entry digest rejects. Injected final drift also fails the forward/reverse extended final digest. No production SQL is edited.                                                                                                                                                                                                  |
| Hash comparisons disabled in reviewer-only SQL copies | Original default guards independently reject preexisting or final-injected unsafe drift at both forward and reverse boundaries. No legacy digest fallback exists in the production commitment reader.                                                                                                                                                                                  |
| All privileges and grant options                      | Added controls exhaust eight relation privileges and three sequence privileges, for PUBLIC globally and direct Reader in auth under a different creator. Direct Reader WITH GRANT OPTION entries are present in the normalized manifest and reject reverse/commitment. Unsafe forensic hashes differ from clean extended and legacy digests; cleanup restores the clean extended hash. |
| Creator/schema reachability independence              | Unsafe REFERENCES default under `supabase_auth_admin` in a new non-system schema with no Reader/OTR USAGE still rejects. The guard does not rely on present schema reachability.                                                                                                                                                                                                       |
| Actual table/view/foreign-table access                | Harmless managed-recipient SELECT defaults are applied to future objects. Actual TLS Reader READ WRITE SELECT rejects all three with42501, while the intended service recipient has SELECT. Foreign table uses PostgreSQL's local file handler and task-only synthetic file; no external server connection occurs.                                                                     |
| Harmless defaults                                     | Managed non-PUBLIC/non-Reader table/sequence recipients and PUBLIC routine/type defaults survive complete forward/reverse validation unchanged; Reader's future table/sequence SELECT/INSERT/nextval/setval deny. Shared ACL/default state is not sanitized or rewritten.                                                                                                              |

Added control failures compare full prior state, including roles/settings, raw membership grantors/options, root/catalog/ACLs, raw defaults/database state, every public business row, migration history and lineage. They preserve the deliberate unsafe input, rather than repairing it. **158 recorded added control outcomes PASS** across two additional fresh installations. Controls run on these installations and preserve both administrator branches. Evidence: `controls-final.log`, `controls/sql-proof.json`, `controls.py`.

Initial reviewer-only foreign-table setup lacked a handler and produced55000 before the intended ACL test. A subsequent fixture used file_fdw but attempted privileged filename setup as NOSUPERUSER postgres and failed42501; that setup was moved to the disposable administrator with harmless managed-recipient defaults. A scratch SQL-quoting syntax failure was also retained. Final real Reader assertions are unchanged and pass. These retained fixture errors are not production defects or successful denial evidence.

### Extended commitments and unchanged security boundaries

| Independently recomputed state             | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Clean H0 extended                          | `71f569fcbbba4653408c19adeee5d83807f21cd7532773001ab6d9309ec0bb84` |
| Corrected dormant H1                       | `a56e074a33ea3e3b34c042a0e02c391f0074a5d868ee59e22f66f9ea22446e42` |
| Corrected synthetic LOGIN H2               | `2cb062324878ba9fabe468c59fb86b757dd26b85aa42763847467c6531fa5e55` |
| Corrected reverse, retained dormant Reader | `ce0a1e589877705dd6d982e1be3f5c28d7a778b041c7bc899f8863ad5a5ba3fb` |

Normalized future entries use creating-role/grantor/recipient names, global/schema scope, object class, privilege and grant-option flag; no default-entry OID is hashed. Both clean installs produce the same H1/H2/reverse and manifests. Added clean controls also assert H0 extended and independently match H1/reverse. Hashes are observations from actual local PostgreSQL, not invented H2 credentials or Hosted evidence.

Actual corrected artifact hashes match Builder evidence:

- Forward: `f65beb0c44bb5ca217af7349e39bad82252861d772afe5d6f863c1bd38e25f5d`.
- Reverse: `5e3ea75a871f5946e029fb779476c7c41b736cbb625d0ddd1d4e7dae0422518e`.
- Read-only security commitment SQL: `383800fac6d576303876de9a99a96a2707d80bbe0a9652440e9eae39c2bc0b42`.

All24 original forward/reverse rollback faults restore both administrator membership branches exactly. Polluted Reader/H0 drift, wrong actual principal, revoked membership/foreign Actor/Trip and all13 READ WRITE command-root ACL negatives pass. Creator/legacy Member/linked Guest reads, actor-private thirteen-family output, each64/65 ceiling, canonical4MiB/+1, original-text duplicate/numeric rejection and reverse all-public data/history/lineage equality persist. No shared PUBLIC ACL change, new production role or expanded architecture is introduced by F1.

### Other executed validation and remaining gates

| Check                                             | Actual independent result                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Affected application regressions                  | **62 files /1,233 PASS /15 existing skips**, zero failures. Explicit commands/JSON retained. This expanded independent selection covers Backend/Auth/Transport/Membership/Composer/observation plus bounded/shared API, canonical transport and Capture checks; it is not an assertion that the Builder's exact58-file1,196 selection was reconstructed. |
| Actual PostgreSQL/TLS/Driver                      | **19/19 PASS**,37.44s, zero skips; freshly bundled against unchanged Builder Backend bytes and new task-only certificates/containers.                                                                                                                                                                                                                    |
| Typecheck; lint/UI guard; Backend build           | **PASS**, clean lint, no runtime launch/injection.                                                                                                                                                                                                                                                                                                       |
| Scoped formatting; Python compilation; whitespace | **PASS**. Python cache redirected to private/tmp after the protected worktree rejected its default cache path.                                                                                                                                                                                                                                           |
| Full formatting                                   | **28 existing unchanged HEAD issues**, no global PASS claim or unrelated repair.                                                                                                                                                                                                                                                                         |
| Preservation                                      | All1,323 initial files unchanged before this append; exact original review preserved as byte prefix afterward. Only review/handoff change for this recheck.                                                                                                                                                                                              |

Physical proof retains fixed Reader/same-lease identity, TLS chain/hostname and primary checks, max1/checkout/request/rollback bounds, cancellation, lost/late replies and immediate uncertain socket retirement/fresh backend PIDs. Its synthetic driver root is separate from the full protected SQL/ACL proof. No real endpoint attestation is inferred.

These are disposable local synthetic fixtures, not full Hosted equivalence. Fixture restoration/stress/foreign-file setup use task-only administrator authority; artifact application remains NOSUPERUSER postgres. Synthetic LOGIN/password/certificate mechanics are confined to removed task fixtures. The original migration-history/lineage and stress limitations remain as documented above. Privileged changes after validation are not continuously prevented or monitored; subsequent schema/default/ACL changes require corrected revalidation. Owner must still accept Reader credential compromise's admitted-Actor disclosure radius.

F1 is closed for the corrected dormant contract. Final Owner acceptance may proceed; Hosted DEV forward/inventory, finite-expiry Reader secret custody/rotation/session retirement, actual Direct Primary TLS/same-lease attestation, Backend injection/live reads and Native/runtime/device gates remain separately authorized. Composer/C5/C9/provider/command gates remain CLOSED. No Hosted access/mutation, actual credential provisioning, deployment, Simulator/device operation, commit/push/merge/rebase occurred.

Not checked: current Hosted equivalence, actual credential/endpoint lifecycle, full repository tests or device/runtime execution. Risk remains privileged post-validation drift and the documented compromised-Reader Actor/Trip disclosure radius.

STOP — R3-A F1 TARGETED INDEPENDENT SECURITY RECHECK COMPLETE.
