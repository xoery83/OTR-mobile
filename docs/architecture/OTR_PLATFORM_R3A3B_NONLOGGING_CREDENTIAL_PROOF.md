# R3-A3B Supautils nonlogging credential proof

Date: 2026-10-10 (Pacific/Auckland). **Status: BLOCKED. Ready for Hosted provisioning authorization: NO.**

Supautils delegated session settings can suppress the tested PostgreSQL logging
and query-statistics sinks. They do not provide a dedicated password API or remove
password material from submitted SQL. A delayed credential statement exposed its
synthetic password through `pg_stat_activity`. Unsuppressed password and SCRAM
verifier controls were retained in statement logs and query statistics. Exact
Hosted Supautils build provenance and external request-retention guarantees remain
unverified. These results do not authorize a real credential.

## Scope and evidence

Hosted access used only the previously approved linked CLI administrative metadata
route, explicitly bound to DEV project `tuqigdxrvrerfewsxqgm`. Both SQL executions
were `BEGIN READ ONLY`, bounded by statement timeout, and ended with `ROLLBACK`.
No password/verifier was returned; password state was queried as a boolean.
The CLI emitted “Initialising login role”; this is the existing administrative
route's platform-managed login preparation, not Reader provisioning. No Reader
LOGIN, password, ACL, role setting or other business mutation was submitted.

All synthetic provisioning tests ran in a new disposable container with network
`none`; its client shared only that disconnected network namespace. PostgreSQL
data/logs were on tmpfs. Administrative TCP trust was fixture-only; Reader TCP
authentication required SCRAM. This is not a Hosted TLS or full OTR schema test.

Private evidence: `/private/tmp/otr-r3a3b-proof-20261010`, directory 0700/files 0600.
`evidence-hashes.json` SHA256:
`0f40741652cccb5426280600d657e0f4c2763f217cbc034ee991f20ab6317654`.
It includes metadata before/after, scripts, results, retained synthetic server log,
process snapshot, sink summary and image provenance. Raw logs contain synthetic
control password/verifier material and must not be copied into Git or telemetry.
The fixture was destroyed after restoring Reader NOLOGIN/PASSWORD NULL; all its
credentials are now unusable. Credential-free temporary workspace scripts were
removed. Existing files/worktrees were preserved; no commit/push/merge occurred.

Local Colima was initially stopped and was started with tool approval. Its existing
local Supabase containers also resumed; they were neither queried nor modified by
the proof. The runtime remains running. No remote Backend, Production, device or
Simulator operation was performed.

## Actual Hosted capability and version boundary

Read-only observations before and after were identical:

- PostgreSQL **17.6**, aarch64 Linux; database postgres; primary/non-recovery;
  server address `2406:da1c:4c7:f800::7dd1`; session identity postgres.
- `session_preload_libraries=supautils`; configured superuser `supabase_admin`,
  privileged role `supabase_privileged_role`; postgres has effective USAGE of it.
- postgres is NOSUPERUSER/CREATEROLE and has ADMIN TRUE, INHERIT FALSE, SET FALSE
  membership for the Reader.
- Delegated settings include log_statement, log_min_error_statement,
  log_min_duration_statement, log_parameter_max_length, auto_explain.*,
  pg_stat_statements.* and selected pgAudit settings.
- Hosted statement logging is ddl, error statement logging error, password
  encryption scram-sha-256. Supautils has no `pg_available_extensions` row, no
  version GUC in the observed settings and no functions in a Supautils schema.

**Actual installed Hosted Supautils version: not established by the approved
metadata.** Absence of an extension row does not mean the library is absent.
Do not infer its version from PostgreSQL 17.6, feature names or a local image.
Provider build provenance or an approved read-only library-version identifier is
required before claiming an exact matching-version proof.

The cached fixture was PostgreSQL 17.6 / **Supautils 3.4.0**, source tag v3.4.0
according to its Nix derivations, with pgAudit 17.1. Image
`supabase/postgres:17.6.1.167`, immutable image ID:
`sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb`.
Supautils binary SHA256:
`e78fa57fafdcb97c25f2f9e06e91010785b08811593a470f6e8de9af16ba9b84`.
PostgreSQL version matches; Supautils build equivalence is **unproven**.

## Candidate mechanisms and privileges

The supported capability is delegated superuser-only configuration through
`supautils.privileged_role_allowed_configs`, followed by ordinary PostgreSQL
`ALTER ROLE`. It is session suppression, not password redaction. The
[Supautils documentation](https://github.com/supabase/supautils/tree/v3.4.0)
describes the delegated settings mechanism; this proof verified it locally with a
NOSUPERUSER operator and the observed Hosted allowlist.

| Candidate | Assessment |
| --- | --- |
| Ordinary ALTER ROLE/password literal | Leaks to enabled statement logs and query statistics; rejected. |
| Client-generated SCRAM verifier / psql password flow | Verifier remains sensitive; DDL log/statistics retention reproduced. |
| Supautils session suppression + ALTER ROLE | Tested sinks suppressed, but secret-bearing SQL/activity remains; BLOCKED. |
| Management API / postgres-meta | No approved dedicated Reader nonlogging path established; request/outer log retention unverified. |
| New server-side helper/Vault flow | Not implemented or accepted; would need separate privilege, delivery and retention proof. |

Provisioning requires PostgreSQL CREATEROLE plus ADMIN on the target role for
these cross-role changes, and effective membership of the configured privileged
role for delegated settings. Reader must not be a reserved role. Terminating
other sessions additionally needs applicable role/signal authority; this run used
the **fixture superuser** for forced termination, not an authenticated Hosted
operator termination test. Supautils membership alone is not that proof.
See [PostgreSQL ALTER ROLE](https://www.postgresql.org/docs/17/sql-alterrole.html).

The probe set session-only log_statement=none, error-statement threshold=panic,
duration threshold=-1, duration off, parameter lengths=0, pgAudit log=none and
statement off, pg_stat_statements track=none/track_utility=off, auto_explain
threshold=-1. Every setting restored to its original value on the successful
path. Abort/crash recovery was not certified. Several diagnostic channels are
disabled by this candidate; it is not a general guarantee against PANIC/core dumps
or intermediary retention. PostgreSQL documents the potential disclosure in
[logging settings](https://www.postgresql.org/docs/17/runtime-config-logging.html).

## Leakage results

Initial logging enabled statements all, duration 0, error statements error,
unlimited parameter logging, pgAudit all/parameters on, pg_stat_statements and
auto_explain 0/nested on. A supplemental control used log_statement=ddl.
Synthetic passwords used 32 random bytes encoded base64url and identifiable
test labels; no actual secret entered shell argv/environment or script files.

| Evidence | Result |
| --- | --- |
| Unsuppressed plaintext control | Exact password present once in server statement log and in pg_stat_statements. |
| Unsuppressed SCRAM verifier, DDL control | Exact verifier present in statement log and pg_stat_statements. |
| Suppressed initial/rotation/error/activity passwords | Zero exact matches in the tested server log; none in statistics. |
| Suppressed verifier | Zero exact matches in server log/statistics. |
| Live SQL text | Delayed DO containing password-bearing ALTER ROLE exposed exact synthetic password in pg_stat_activity despite suppression. |
| Error path | Invalid expiry returned 22007; serialized client error contained none of the generated passwords. |
| Retained sink scan | Statement log: 1 password/1 verifier; 82 audit lines, 9 error/statement-error lines and 175 duration lines: zero synthetic secrets. |
| Process evidence | Client self argv/environment and post-test fixture process snapshot: zero generated password/verifier matches. |

The delayed DO widens the observation window; it proves this administrative
session still publishes submitted secret-bearing SQL. It does not claim a sampled
password hit during the brief ordinary ALTER itself. No attempt was made to disable
track_activities or bypass Hosted privileges. Even a future fix for activity must
resolve exact-version and outer-retention gaps before PASS.

The process scan is sampled, not continuous. Memory, swap, OS snapshots, crash
dumps, all possible malformed SQL failures, Hosted collector/API logs and platform
retention were not certified. Password/verifier retention in the synthetic control
log is intentional failure evidence, not accepted custody. Verifiers are never
classified as harmless hashes.

## Credential lifecycle and Reader limits

| Test | Result |
| --- | --- |
| Initial LOGIN | SCRAM verifier type confirmed by boolean only; Reader SCRAM TCP authentication succeeded. |
| Expiry | Initial expiry approximately 24h and finite; explicitly expired synthetic password rejected, 28P01. |
| Connection limit 1 | Second concurrent Reader connection rejected, 53300. |
| Reader surface | Fixture security-definer catalog function succeeded; business SELECT and SET ROLE postgres rejected, 42501. |
| Role creation | Initially read-only rejection 25006; after disabling that user-settable default, CREATEROLE still rejected, 42501. |
| Rotation | Old established session remained usable; after explicit termination, old password rejected 28P01 and new password succeeded. |
| Disable | NOLOGIN/PASSWORD NULL rejected new authentication 28P01; established session remained usable until explicitly terminated. |
| Retirement | Forced termination followed by zero Reader sessions; final fixture Reader NOLOGIN/PASSWORD NULL, connection limit 1. |

Read-only defaults are convenience limits, not the authorization boundary.
This is a minimal synthetic ACL fixture; the actual OTR catalog function,
full Hosted ACL/security commitments and authenticated Driver/container path were
not revalidated. Hosted before/after metadata confirms Reader NOLOGIN, NULL
password/expiry, all restricted role attributes, limit 1 and zero sessions.
No actual Hosted provision/rotation/disable was performed.

## Exact future handoff and custody prerequisites

These are requirements for later review, not an accepted provisioning recipe.
Existing root-private Backend storage is `/opt/otr/dev-backend/env`, previously
observed root:root 0700, with backend.env root:root 0600. No remote file was created
or inspected in this stage.

1. Generate 32 CSPRNG bytes only inside a dedicated approved provisioner. Keep
   password/verifier out of CLI arguments, environment variables, DSNs, shell
   history/tracing, Management API/SQL-editor bodies, stdout and evidence.
   Use a separately proven direct verified-TLS administrative connection.
2. A root-owned broker must receive the secret over a private inherited pipe or
   authenticated local Unix socket, never a command argument/environment. Persist
   only at `/opt/otr/dev-backend/env/catalog-reader.secret`, root:root 0600,
   in the existing 0700 directory. Refuse symlinks/unexpected owners; use restrictive
   creation, fsync and atomic same-directory replacement. Any staging inode has
   the same protection and must be removed on failure/recovery. Do not create
   auxiliary plaintext copies. This protocol has not been implemented/tested.
3. Store only opaque version, issuance/expiry/rotation timestamps and state in
   operational metadata. Expiry at most 30 days; rotation due by day 14. Stage the
   new version with admission closed; database/file changes are not one atomic
   transaction. A crash between them leaves admission closed pending authenticated
   verification or disable, never blind reinjection.
4. **Do not use the existing Compose env_file to carry this credential.** It would
   expose it through process environment/Docker configuration and fail the stated
   boundary. Later review must approve a file/FD consumption path for the Backend,
   with least-privilege access and no secret-valued environment variable. No such
   Backend integration or deployment is authorized here.
5. Before rotation/disable: stop admission, close the max1 pool, terminate all
   Reader sessions using proven authority and confirm zero. Rotate and validate
   old rejection/new authentication before separately authorized resumption.
   Disable removes LOGIN/password and all sessions; expiry alone is insufficient.
6. Before secrets enter either provisioner or consumer, demonstrate Linux process
   dump suppression including the piped Apport handler: RLIMIT_CORE=0 plus appropriate
   nondumpable process policy and an actual synthetic crash negative test. Disable
   diagnostic heap/core reports and secret-bearing telemetry; restrict ptrace/proc
   and privileged custodians. Fixture ulimit 0 alone is not this certification.
7. Exclude secret files/staging and process dumps from backups/snapshots, or obtain
   an explicit encrypted retention/deletion policy and custodian list. Retire old
   container configuration, processes, files and recovery copies on rotation;
   unlink alone is not erasure. Logs may retain metadata only. Existing retention
   and Apport controls remain unproven from the preceding preflight.

## Owner-review gate

**BLOCKED / actual mechanism: delegated session logging suppression around ordinary
ALTER ROLE / ready for Hosted provisioning authorization: NO.**

Required next proof: verified Hosted library build; secret-free SQL/activity or
equivalent tested protection; complete server/intermediary retention evidence;
operator session-retirement authority; crash/recovery and non-environment handoff
certification. The observed failures justify BLOCKED without escalating to real
credentials or unsupported Hosted privileges.

**STOP — NONLOGGING CREDENTIAL PROOF / OWNER REVIEW REQUIRED.**
