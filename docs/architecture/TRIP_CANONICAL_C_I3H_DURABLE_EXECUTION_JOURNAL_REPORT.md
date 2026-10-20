# C-I3H Durable Source Execution Journal Foundation

**C-I3H FULL PASS / ACCEPTED / CLOSED**

Date: 2026-10-05. Clean starting worktree `otr-mobile-import`, branch `trip/import`,
HEAD `55a35bc2174e2abacc5c1a1bb6206b9918209e3b` was unchanged throughout validation.
Human review accepted and closed C-I3H, authorizing only the task-owned local commit.
Runtime activation and push remain unauthorized.

## Completed foundation and scope

Migration `20261005000300_trip_source_execution_journal.sql` adds two protected
FORCE-RLS tables, two statement guards, ten routines, seven indexes, 43 constraints
and four policies. It changes no canonical Source/Event/Participation state machine
or receipt. Execution responsibility is no longer forgotten across process crash
**after atomic write-ahead registration**. The accepted C-I3G process-local harness
remains test-only; no runtime journal/OS/provider adapter is installed.

`trip_source_staged_resources` stores exact principal/node/opaque key/hash/count,
creation, release authorization and positive cleanup acknowledgement/evidence.
`trip_source_execution_attempts` binds canonical operation/key/digest/generation,
Trip/Source/Representation/material revision, resource, fixed PNG profile/fingerprint,
run token, owner run/fence, phase, outstanding responsibility, exact runtime node/
container, last durable transition and timestamp, and sealed terminal evidence/result.
Runtime container identity is unique per node, attached once and immutable.
One unresolved attempt per Representation is enforced by a partial unique index.

Fixed gateway commands: `register`, `claim`, `attach`, `advance`, `terminal`,
`release`, `cleaned`, `inventory` under the `trip_source_execution_` prefix.
The private writer owns exactly these eight routines plus `lock`; the gateway owns
zero objects. `guard` is owned by the migration manager. Two NOLOGIN identities
(`otr_trip_source_execution_writer`, `otr_trip_source_execution_gateway`) are
unprovisioned. Temporary migration-manager SET ROLE/CREATE authority closes before
commit; no runtime login, inherited authority or connector is added.

The Backend file supplies an explicit inventory/claim factory with strict
principal/profile/fence/runtime-node/resource validation. Missing/ambiguous RPC
fails unavailable without retry or service-role fallback. It has no app/server import,
Mobile/API route, timer, startup hook, credentials, parser/provider dispatch or deletion.

## Owner protocol, state and protected cleanup

1. Existing C-I3D admission, exact owner/read/write/scope checks and exclusive
   Representation admission precede staging. C-I3D admission and journal registration
   must commit in the same transaction before expensive payload/parser work. An older
   IO_ACTIVE or IO_UNKNOWN registers UNKNOWN, identified by transaction provenance,
   never lease age. Exact UUID/generation/principal and immutable canonical pins are
   derived or matched in SQL; existing resource bytes must match.
2. First CAS claim increments fence 0→1. Unresolved takeover increments the fence
   and enters UNKNOWN; it transfers reconciliation responsibility without dispatch.
   Every protected transition checks native session principal, owner-run UUID and
   fence. Duplicate/concurrent claims, stale reconnect/completion/cleanup and ABA fail.
3. Local phases are STARTING, RUNNING, TERMINATION_REQUIRED, UNKNOWN, TERMINAL.
   Only initial STARTING/fence1 with attached identity may advance RUNNING. UNKNOWN
   remains outstanding; missing identity cannot seal terminal proof. A future trusted
   producer must positively observe the exact node/container/run token and seal a
   digest/time/result. SQL persists that attestation; it does not inspect/kill a process.
4. Terminal cleanup-pending can transfer owner/fence while retaining TERMINAL and
   its immutable terminal observation. No terminal execution can reopen; cleaned
   responsibility cannot be reclaimed. Internal terminal-result categories are
   supervisory evidence, not an IPC or Source semantic receipt.
5. Resource/attempt/canonical-operation locks serialize cleanup. Every resource
   reference must be terminal with no outstanding obligation, **and every associated
   canonical operation must be IO_QUIESCENT/FINAL**. Parser terminality cannot release
   provider IO_ACTIVE/IO_UNKNOWN staging. No reference/row is deleted. Authorization
   stays in inventory until a trusted exact node/key cleanup digest is acknowledged;
   changed proof/stale fence/wrong identity fail. No physical deletion adapter exists.
   Locks end with the DB transaction; none span external I/O. Future initial admission
   follows C-I3D locking, so an opposing cleanup transaction may be aborted by ordinary
   deadlock detection; no external work may start before successful commit.

Principal-scoped inventory includes STARTING without/with identity, RUNNING,
TERMINATION_REQUIRED, UNKNOWN and terminal cleanup-pending, including authorized
but not yet acknowledged cleanup. It is internal and explicit, not a background worker.

## Validation evidence

| Validation                                                                             | Result                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| C-I3H focused SQL                                                                      | **111/111**                                                      |
| C-I3H hostile role/default/ownership reuse                                             | **43/43**                                                        |
| Seed-populated forward install, all historical public rows + Storage buckets           | **1/1**, unchanged                                               |
| Fresh-process recovery/CAS/ABA/cleanup takeover, actual SIGKILL writer loss            | **16/16**                                                        |
| Previously committed IO_ACTIVE imports UNKNOWN, no parallel RUNNING/release            | **5/5**                                                          |
| Focused Backend boundary                                                               | **30/30**                                                        |
| Full Backend                                                                           | **30 files / 390 tests**                                         |
| Two clean 73-migration replays                                                         | **42 SQL files / 1539 assertions each**, exact TAP plans         |
| C-I3D SQL / C-I3B SQL (included above)                                                 | **159/159 / 246/246**                                            |
| C-I3D hostile role reuse                                                               | **111/111**                                                      |
| C-I3D independent digest vectors / concurrent exact replay, CAS, phase/generation race | **1/1 / 1/1**                                                    |
| C-I3E local provider/staging regression                                                | **20/20**                                                        |
| C-I3F sandbox/owner contract regression                                                | **23/23**                                                        |
| C-I3G unchanged parser/protocol/adversarial/isolation regression                       | **87/87**                                                        |
| Independent delayed-start probes                                                       | **6/16/32 seconds**, exact kill/terminal proof, obligations zero |
| Verifier and count + same-count checksum negative family                               | PASS, **1/1** negative test with both cases/comparator           |
| Typecheck / Backend build / lint + UI guard                                            | PASS                                                             |
| Changed supported-file formatting / whitespace                                         | PASS                                                             |

The 6-second probe returned PARSER_TIMEOUT at 6196ms with terminal proof. The
16/32-second probes returned protected PARSER_TERMINALITY_UNKNOWN at 15098/15077ms,
then autonomously resolved exact terminality by 16935/32438ms. No caller UNKNOWN
released staging. The 87-test suite also proves an unrelated concurrent container
survives, sandbox network/filesystem/credential isolation, OOM/crash/normal behavior,
and teardown to zero local obligations and dedicated parser containers.

Durability evidence uses committed SQL followed by fresh Node processes and fresh
DB connections; a parked producer is SIGKILLed after COMMITTED and recovery still
finds RUNNING/outstanding responsibility. Backend unit tests use mocked RPC and
are not credited as database durability. SQL terminal/cleanup/provider-completion
observations are synthetic trusted fixtures, not external terminality proof.

Security reuse covers effective direct/PUBLIC/inherited EXECUTE, non-system CREATE,
table/live-column/sequence access, membership/SET ROLE/default ACLs, polluted flags,
all-class pg_shdepend ownership including domain/collation, approved-name overload
and wrong schema. Failed installations preserve hostile fixtures atomically.
PUBLIC/API/service roles lack effective journal EXECUTE/DML; zero-row guards reject
DML even with deliberate temporary grants. JWT/GUC/caller Boolean cannot establish
native ownership. The canonical lock-only UPDATE(id) privilege grants no semantic
mutation authority. Trusted test openings/grants restore closed state and are absent
from the migration. No real provider worker or product upload occurred.

Inherited C-I3E/F/G harnesses ran from temporary copies adapting only their old
HEAD guards/import locations to this integrated HEAD; C-I3D container binding was
adapted to the task DB. Accepted source files and worker/profile bytes were unchanged.

The disposable DB uses cached local PostgreSQL 17.6. Platform schema-only bootstrap
was read from the existing local Supabase database, without business rows or hosted
access. The cached platform pg_cron helper fingerprint differs from the accepted
allowlist: its PUBLIC EXECUTE was revoked **only in disposable bootstrap**, instead
of relaxing hashes or changing historical migrations. Supabase migration ledger
records and original per-file postgres/admin selection were reproduced. Earlier
bootstrap/fixture harness failures were corrected before the two complete runs.

Repository-wide Prettier retains **17 untouched baseline failures** (ten historical
architecture docs, four Ledger docs/evidence files, the Trip enrichment matrix,
`expenseIntent.ts`, `useStage4BPhysicalSmoke.ts`). No unrelated formatting repair
was made. Changed files pass; this is not a repository-wide FULL PASS claim.

## Manifest, byte and scope checks

Both clean manifests and canonical object lines are exact matches. Schema checksum:
`2f1259e1f1bd0a5f65926b8b3cbe94cee2f3c3b508724f0e39b92aaf0b6a8e29`.
New migration SHA-256: `7598fa8c751034623fc4eb531b87d910bb7aeca549a380a983ca5cc8b7546528`.

| Manifest            | Before | After |
| ------------------- | -----: | ----: |
| Tables / RLS tables |    119 |   121 |
| Columns             |   1775 |  1811 |
| Constraints         |   1027 |  1070 |
| Indexes             |    370 |   377 |
| Functions           |    212 |   222 |
| Triggers            |    148 |   150 |
| Policies            |    204 |   208 |
| Buckets             |      4 |     4 |

Schema diff has zero removed/changed existing object lines; only two tables,
36 columns, 43 constraints, seven indexes, ten functions, two triggers, two RLS
entries and four policies were added. Two policies are narrowly scoped canonical
operation read/lock policies; the other two protect new tables. Storage policies,
buckets and historical public schema definitions are unchanged.

All **72 historical migration files** compare byte-identical to starting HEAD,
including B-T3H00100, Source00500 and participation00600. SQLite migration file is
byte-identical and IDs remain exactly 1–45 (44 B mirror, 45 A result). Entire C-I3G
parser tree is byte-identical, including PNG profile, protocol, decoder, Dockerfile,
supervisor, test and pngjs archive. B-T3H migration, Backend implementation/tests,
app/gateway, API contract, SQL/harness and report are byte-identical. Shared
manifest/verifier/RLS count expectations and appended current-state/data-model
wording necessarily extend B's baseline for C-I3H; they are explicitly scoped
changes, not claimed byte-identical artifacts.

Changed files (14): current-state, data-model, this report and the C-I3H ADR;
new migration and focused SQL; new SQL/security/recovery harness; Backend recovery
module/test; manifest/verifier; RLS matrix count expectations; C-I3D/C-I3B SQL
TRUNCATE fixtures. The latter include the new FK child under rollback-only grants
so FK/permission rejection cannot mask the unchanged exact canonical guard assertion.
A/B/financial regressions remain in both full SQL runs and the full Backend run.
No other implementation, SQLite, API contract or historical migration is changed.

## Exact changed files / pre-commit git status

```text
 M docs/CURRENT_IMPLEMENTATION_STATE.md
 M docs/DATA_MODEL.md
 M scripts/supabase/verify-baseline-artifacts.mjs
 M supabase/schema-manifest.json
 M supabase/tests/rls_matrix.test.sql
 M supabase/tests/trip_source_command_foundation.test.sql
 M supabase/tests/trip_source_protected_foundation.test.sql
?? backend/src/tripSourceExecutionRecovery.test.ts
?? backend/src/tripSourceExecutionRecovery.ts
?? docs/adr/2026-10-05-source-execution-responsibility-journal.md
?? docs/architecture/TRIP_CANONICAL_C_I3H_DURABLE_EXECUTION_JOURNAL_REPORT.md
?? scripts/supabase/trip-source-execution-journal.test.mjs
?? supabase/migrations/20261005000300_trip_source_execution_journal.sql
?? supabase/tests/trip_source_execution_journal.test.sql
```

## Remaining boundaries and disposition

Actual Source runtime, product staging/fsync/quota/deployment identity, runtime
journal/owner connectors, trusted terminal/cleanup evidence producers, automatic
startup recovery and provider integration remain PENDING. Exact terminality after
host/node loss is unresolved. Provider post-crash terminality and safe IO_UNKNOWN
retry remain BLOCKED. PDF/JPEG/HEIC/HEIF decoder profiles and Hosted Dev/Production
activation remain PENDING/BLOCKED. Future runtime activation requires separate review and explicit authorization.

Task-owned disposable containers and temporary synthetic staging/evidence are
removed after validation; existing canonical local services are left untouched.
No sibling worktree files were changed. Git remains at starting HEAD with only
these 14 task files at the validation checkpoint. Human acceptance subsequently
authorized their local commit; no push/rebase/merge/deploy.

Validation-phase flags before the separately authorized local commit:

```text
C-I3H implementation complete: YES
durable execution responsibility survives Backend process crash: YES (registered foundation)
stale owner can write after takeover: NO
UNKNOWN can authorize cleanup: NO
time/lease expiry used as terminality proof: NO
staging can be deleted while unresolved reference exists: NO
host/node-loss exact terminality claimed solved: NO
provider terminality solved: NO
safe IO_UNKNOWN retry enabled: NO
Source commands enabled: NO
product parser route enabled: NO
C-I3D gate opened: NO (trusted local fixtures only)
C-I3G PNG profile semantics changed: NO
historical migrations changed: NO
purge/redaction enabled: NO
runtime credentials added: NO
Production/Hosted Dev accessed: NO
sibling worktrees modified: NO
commit: NO
push: NO
```

**C-I3H FULL PASS / ACCEPTED / CLOSED. Local commit authorized; no push.**
