# R3-A3B hardened one-shot credential provisioning Builder

2026-10-10. **Disposable Builder PASS WITH LIMITATIONS.**
Original cancellation/FATAL leakage scenarios closed: **YES for tested persistent
logs and emitted diagnostics**; privileged transient error/memory contents remain.
Ready for Independent Security Review: **YES**.
Ready for Hosted provisioning: **NO**, pending review and separate Owner approval.

## Source and exact changed files

Fresh managed worktree:
`/Users/xoery/.codex/worktrees/r3a3b-hardened-builder/otr-mobile-canonical`.
Local main, origin/main and live remote main matched
`d2c904efb22090d9a1c51fd1be63a3bb5780c8cc` at start; no Git ref changed.
Fresh read-only DEV extended H1 matched
`a56e074a33ea3e3b34c042a0e02c391f0074a5d868ee59e22f66f9ea22446e42`.
Complete Hosted metadata before/after was identical: Reader NOLOGIN, password NULL,
expiry NULL, limit1, restricted flags, zero sessions. No verifier was retrieved.
CLI performed normal administrative login initialization; no Reader mutation or
migration was submitted. Exact Hosted Supautils build remains undisclosed.

Changed files:

1. `scripts/supabase/catalog_reader_credential.py`: dormant fixed Reader procedure,
   native libpq boundary, process/custody controls, UNKNOWN reconciliation.
2. `scripts/supabase/test_r3a3b_builder.py`: synthetic attacks/observers/recovery.
3. `scripts/supabase/r3a3b-builder-fixture.sh`: isolated PostgreSQL/TLS/log fixture.
4. `scripts/supabase/r3a3b-builder-bootstrap.sql`: synthetic roles/grants.
5. `docs/adr/2026-10-10-dormant-reader-credential-builder.md`: bounded decision.
6. `docs/CURRENT_IMPLEMENTATION_STATE.md`: short handoff prepended.
7. This report.
8. `docs/architecture/OTR_PLATFORM_R3A3B_NONLOGGING_CREDENTIAL_PROOF.md`: unchanged copy.
9. `docs/architecture/OTR_PLATFORM_R3A3B_CREDENTIAL_ALTERNATIVE_PROOF.md`: unchanged copy.

The original dirty checkout and historical evidence remain untouched. Accepted
report copies are byte-identical: original proof SHA256
`c7c8224e01af770993ef149b1beb6d552e76c7f1cf41775afce2a16aaf3f7896`;
alternative proof `dd6eb32e26d2a54e77709eaa4c262190fd3dcc37aa4bad06864b30b2b111463c`.
Principal forward/reverse/inventory, Driver, read adapter, server.ts and package/lock
files are byte-identical to canonical HEAD. Only the fixture test imports the new
module. No runtime caller, CLI, Hosted endpoint, schema/ACL or Driver interface changed.
Ignored worktree dependency links/private evidence are validation artifacts.

## Minimum mechanism and UNKNOWN handling

Direct ALTER ROLE password binding remains unsupported. Reuse Extended Protocol
bound set_config plus constant anonymous DO, mutating only the fixed Reader. No
persistent helper, Vault, credential service or configurable mutation target.
The module accepts only loopback fixture Primary with fixture CA; Hosted is dormant.

Before generation/read, require root Linux, no PG/password environment, core hard
and soft limits0, PR_SET_DUMPABLE0, umask077, root-owned0700 custody and trusted
ancestors,0600 single-link files, O_NOFOLLOW and an exclusive lock. Native connection
arrays keep passwords out of argv/environment. TLS verify-full, Primary observation,
connect2s/statement5s/lock1s/idle-transaction5s remain required.

Before binding, BEGIN applies constant SET LOCAL and verifies: statement none,
minimum message/error statement panic, duration threshold-1/duration off, parameter
lengths0, pgAudit none/statement off, pg_stat_statements none/utility off,
auto_explain threshold-1. Require transaction sampling0, duration-sampling threshold-1,
pgAudit client output off and SCRAM encryption. Unsupported values fail before staging.
Supautils privilege handling requires SET utility statements for privileged GUCs;
calling set_config does not substitute. Only password/expiry use bound settings.
Search path is pg_catalog. Global/business-session audit requirements remain unchanged.

DO catches query_canceled OR OTHERS with a fixed generic error. FATAL bypasses that
handler; LOCAL log_min_messages=panic closes its reproduced server-log path. libpq
result/connection error text and context are never read. PGresult is cleared and a
failed connection closed. Notice pointers are discarded without copying text, with
the handler installed before authentication, avoiding default stderr reporting.
See [PostgreSQL notice processing](https://www.postgresql.org/docs/17/libpq-notice-processing.html).
No raw error, driver payload or secret-bearing SQL is emitted by the Builder.

UNKNOWN is fsynced before the first mutation. Candidate and non-secret journal are
durable before binding. UNKNOWN refuses another provision/rotation; no automatic retry
exists. Authorized observation checks login/password-presence booleans, expected
finite expiry and restricted role state. Candidate SCRAM authentication proves the
actual credential version; password presence alone does not. Promotion to active
follows success. A candidate-ready marker supports recovery after custody rename
but before journal completion. Repeated reconciliation does not repeat ALTER.
Ambiguity remains UNKNOWN and requires explicit disable. Even a fencing/pre-staging
exception requires consulting the durable journal; absence of success is not failure.

Rotation requires external Backend admission CLOSED, commits NOLOGIN, terminates
old Reader backends and observes zero before password change. Reconciliation retires
its test-authentication session. Disable commits NOLOGIN PASSWORD NULL, terminates
and observes all Reader sessions before removing secret files and recording DORMANT.
Signal privilege/failure is a fail-closed prerequisite. NOLOGIN/expiry alone does not
terminate established sessions.

VALID UNTIL NULL is invalid PostgreSQL syntax. Fixture disable restores the accepted
NOLOGIN/PASSWORD NULL posture with unchanged ACL/settings/flags/limit, retaining the
last finite expiry metadata. Literal NULL-expiry restoration is **not** claimed.
No direct pg_authid update or non-expiring replacement is introduced. Hosted's
original NULL expiry remains untouched; this distinction needs independent review.

## Actual fixture evidence

PostgreSQL17.6/Supautils3.4.0 base `supabase/postgres:17.6.1.167`;
Supautils library SHA256
`e78fa57fafdcb97c25f2f9e06e91010785b08811593a470f6e8de9af16ba9b84`.
Local fixture runtime image
`sha256:c77094970281215d04e60f80e1e66a6f7c03341a1cec363d1855f64c27fb56f9`
adds Python3.12.15-r0, libpq18.6-r0 and OpenSSL3.5.9-r0. Client libpq18.6 is not
server17.6; their real Extended Protocol interaction was tested. No application
dependency was added. Network none/no published ports, tmpfs database/log/custody,
core0/no-new-privileges/cap-drop ALL plus DAC_OVERRIDE for root custody/log scanning;
no SYS_PTRACE. Fixture-only operator has catalog observation and pg_signal_backend.
These are not verified Hosted privileges. Shared PUBLIC CONNECT/TEMP is preserved.
Protected Root is a synthetic stub; accepted business-root semantics are not recertified.

| Path                                                                                         | Actual result                                                                                                                          |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Original nested ALTER lock/cancel with WHEN OTHERS                                           | Native client error buffer/context contains password; one server-log secret hit.                                                       |
| Original nested ALTER lock/FATAL                                                             | Native error buffer contains password; one server-log hit.                                                                             |
| Corrected initial provisioning/rotation                                                      | APPLIED; SCRAM/TLS1.3/read-only/search_path/flags/limit1 pass.                                                                         |
| Corrected cancel, timeout, FATAL, malformed expiry                                           | UNKNOWN; retry refused; reconciliation UNKNOWN; explicit disable DORMANT. No emitted/persistent credential material.                   |
| Transport shutdown after binding, interrupted rotation                                       | UNKNOWN and no replay; explicit disable/recovery passes. Interruption is KeyboardInterrupt injection, not SIGKILL certification.       |
| Real COMMIT sent/flushed; independent committed role state observed; response never consumed | UNKNOWN reconciles APPLIED; repeat reconciliation and crash-after-custody-rename recovery pass.                                        |
| Wrong TLS chain / unreachable endpoint                                                       | Generic rejection before staging. Wrong certificate SAN was not separately changed in this run; verify-full stays mandatory.           |
| Expiry >30 days / expired credential                                                         | Overlong lifetime rejected before staging; actual expired SCRAM login rejected. Initial test lifetime1 day; rotate-by journal <=day14. |
| Old credential/session on rotation                                                           | Old password rejects and old backend cannot execute SELECT.                                                                            |
| Emergency disable                                                                            | Established backend terminated, zero sessions; final NOLOGIN/password NULL, unchanged Principal attributes/ACL/settings.               |
| Reader business-table SELECT / public-schema CREATE                                          | Denied; accepted shared PUBLIC TEMP posture preserved.                                                                                 |
| Complete corrected SQL/DDL/audit/error/auto_explain log                                      | **0** exact password/verifier hits.                                                                                                    |
| Administrator's retained pg_stat_statements scan                                             | **0** exact password/verifier hits.                                                                                                    |
| Sampled process argv/environment                                                             | **0** exact hits; memory was not scanned/claimed absent.                                                                               |
| Retained non-database artifacts and custody after disable                                    | **0** exact hits; candidate/active absent, only0600 journal/lock remain.                                                               |

During a genuinely bound setting query, Reader/application could not see its SQL;
pg_monitor/admin saw placeholder SQL without the value. All four had zero activity
secret hits. Reader/application/monitor pg_authid access denied; trusted admin had
verifier access. Verifiers were held only in test memory for scanning, never printed
or archived. Hash/verifier text is sensitive. These are separate fixture classes,
not certification of actual Hosted membership graphs or every role's privileges.

## Root-private custody, crash and retention controls

Use the existing DEV `/opt/otr/dev-backend/env` root0700 boundary, with a narrowly
scoped root0700 Reader custody subtree. Candidate/active/journal/lock0600, checked
ancestors/ownership/link count, O_NOFOLLOW/O_EXCL staging and file/directory fsync.
Do not put Reader passwords in backend.env, Docker environment, argv, CLI DSN, SQL
files, shell substitutions or diagnostics. Incomplete .new files fail closed and
need authorized reconciliation/disable and cleanup. They are intentional checked
custody, never ordinary temporary evidence files.

Generate48 random bytes from OS CSPRNG; lifetime <=30 days, rotation by day14 and
earlier upon exposure. Mutable ctypes buffers are wiped in finally. Python encoding
and libpq internal copies are not provably zeroed: one-shot exit, no raw diagnostics,
no heap dumps and privileged-access restrictions are mandatory. Production use must
close all connections/descriptors in finally and exit after one attempt; this is
not a resident service. Tests intentionally run multiple separate connection attempts.

Future handoff, separately gated: root opens checked active read-only and passes only
an inherited descriptor to the intended Backend loader; close unrelated descriptors.
Loader reads once, closes it and provides existing Driver config.password in memory.
No environment/argv serialization or TLS/user change. Admission remains CLOSED until
reconciliation, expiry/role/ACL checks and zero old sessions pass. Admin authentication
also needs an existing checked root-private descriptor/buffer. No launcher/loader,
injection or deployment is implemented here; actual connectivity/privileges are gates.

Tests verify core soft/hard0, PR_SET_DUMPABLE0, same-UID environment access denied and
SIGABRT without a core file. Fixture core_pattern is `core`; actual DEV accepted
observation has Apport pipe/unlimited limits. Size limits alone are insufficient for
piped handlers ([Linux core-dump documentation](https://www.kernel.org/pub/linux/docs/man-pages/book/man-pages-6.06.pdf)).
Require nondumpability in the actual secret-bearing process after UID/exec transitions,
no inspector/heap/report agents, no SYS_PTRACE, and independent actual Apport validation.
No actual host/Hosted crash handler was changed/tested. PANIC can still log at the
panic threshold; trusted server/admin memory and dumps remain outside client control.

Existing DEV Docker10m x3 rotation bounds volume, not secrecy or time retention.
Do not forward raw provisioning diagnostics. Retain only fixed state/operation/timing/
expiry metadata. Exclude custody from ordinary backup/diagnostic/snapshot capture;
approve encrypted retention where required. Unlink is not physical erasure.
Database catalogs/WAL/managed backups necessarily hold sensitive SCRAM verifiers;
provider custody/retention require review. No absolute privileged-memory absence is
claimed. Fixture tmpfs data/WAL/custody is destroyed; no database/dump archive retained.

## Evidence and validation limits

Sanitized evidence: `/private/tmp/otr-r3a3b-hardened-builder-20261010`,0700 directory,
0600 files: results, redacted baseline controls, complete corrected log, Hosted
before/after metadata, source preservation hashes and exact fixture/test sources.
Exported hashes match the already-scanned fixture files:
control log `5f1a1347dee8ed71d1f4d9fd17ec25a86c29da78a48d8600e4d5dfa06c66b82c`;
corrected log `11f8bb2a8415f4a49cfebe8ba77dec8ae2e6cc30f21d71d0b622a66b8eaed1c4`.
No reusable test password/verifier is retained in fresh logs/evidence. Retain sanitized
evidence through review; remove within30 days after acceptance unless Owner extends it.
Earlier historical evidence is preserved under its existing policy.

Evidence manifest SHA256:
`591f3b9ae129af0eda29ba4c83654e0b39c117db94a28cdc0785fc0a84259ee4`.
All ten task-owned containers were removed; their tmpfs/database/custody and container
diagnostics were destroyed. Fixture swap was absent. The same nine pre-existing local
containers remain. Secret-free runtime images remain cached for independent reproduction.

Five directly affected Principal/Backend/transport/admission suites: **262 PASS**.
Canonical typecheck and whitespace checks PASS; Python/SQL executed against real
PostgreSQL with assertions. Principal/Driver/server/package preservation PASS.
The full historical235-outcome Principal SQL runner/19-case Driver socket fixture
were not rerun: private inputs are absent, and the former uses a password environment
path. Historical acceptance is not represented as a new run. No UI/product code changed.

Fixture reproduction: recorded runtime image, network none, supplied start/bootstrap,
separate root custody tmpfs, then `env -i PATH=/usr/bin:/bin python3 -B
/builder/test_r3a3b_builder.py`. Retain only returned counts/status and checked redacted
logs. No Hosted command is provided. Independent review must challenge native handling,
preflight coverage, crash/journal states, administrator privileges, actual Apport,
PANIC/WAL/backups and retained finite dormant expiry before any activation proposal.

**STOP — Hardened Provisioning Builder / Independent Security Review required.**
No Hosted credential/LOGIN mutation, Backend injection/deployment, Production,
device/Simulator, Composer/C5/C9/provider activation or commit/push/merge occurred.

## F1/F2 Owner-authorized corrections — 2026-10-10

This append supersedes the earlier crash/custody completeness claims only. The
original Builder report above is preserved. The accepted
[Independent Security Review](OTR_PLATFORM_R3A3B_HARDENED_PROVISIONING_INDEPENDENT_SECURITY_REVIEW.md)
remains byte-for-byte unchanged; its verdict was PASS WITH REQUIRED CORRECTIONS,
0 Critical/2 Important/0 Minor. This is Builder verification, not the targeted
independent recheck or final Owner acceptance.

| Return item                                     | Result                                      |
| ----------------------------------------------- | ------------------------------------------- |
| F1 FIX VERIFIED                                 | **YES**                                     |
| F2 FIX VERIFIED                                 | **YES**                                     |
| Original negative probes closed                 | **YES**                                     |
| Emergency disable with damaged journal          | **PASS**                                    |
| DORMANT custody completeness                    | **PASS**                                    |
| UNKNOWN recovery                                | **PASS**                                    |
| New regressions                                 | **NO failures**; added security probes pass |
| Ready for Targeted Independent Security Recheck | **YES**                                     |
| Ready for Hosted provisioning                   | **NO**                                      |

### Reproduction and exact change scope

Before editing, the preserved independent challenge ran unchanged against the
original module in a fresh isolated fixture. Actual SIGKILL during final APPLIED
journal fsync reproduced F1: LOGIN/password remained and disable hit FileExistsError
before SQL. Candidate fsync failure reproduced F2: UNKNOWN followed by DORMANT while
the complete64-character candidate.new survived. The probe itself performed its
authorized fixture-only cleanup; no password or verifier was exported.

This correction changes exactly six paths relative to the reviewed Builder:

- `scripts/supabase/catalog_reader_credential.py` — checked journal recovery/schema,
  independent disable guard, truthful custody completion and role-state gates.
- `scripts/supabase/r3a3b-builder-bootstrap.sql` — session-independent disposable
  project marker only; no ACL tightening or Hosted object.
- `scripts/supabase/test_r3a3b_f1f2.py` — added fault/recovery/negative probes.
- This Builder report — appended evidence; original prefix preserved.
- `docs/CURRENT_IMPLEMENTATION_STATE.md` — current targeted-recheck handoff.
- `docs/adr/2026-10-10-dormant-reader-credential-builder.md` — appended bounded decision.

Original Builder regression harness, accepted proofs, Independent Review, Principal
SQL, Driver, Backend/server, packages and protected contracts remain unchanged.
There is still no runtime caller, Hosted CLI, backend injection or secret service.

### F1 atomic journal and emergency operation

Journal replacement retains the private0600/O_NOFOLLOW/O_EXCL staging file,
complete unbuffered write, file fsync, atomic os.replace and directory fsync.
The correction supplies the missing locked recovery path for checked stale staging.
Before replacing damaged local state, preserve only artifact name, byte length and
SHA256 in a new restricted, fsynced journal-evidence file; then durably unlink checked
operation.json.new. Malformed canonical content is hashed before replacement, not
archived as plaintext. Digest evidence stays private and is not automatically
declassified: damaged bytes may themselves have been sensitive.

Invalid JSON/schema/types/dates and pending staging cannot authorize provision.
Initial requires observed NOLOGIN/password NULL with complete dormant custody;
rotation requires APPLIED, observed LOGIN/password presence/expected expiry, active
custody and no pending candidate. Canonical corruption never authorizes a replay.
Every credential operation checks the fixed Reader and authorized administrator
channel independently of the journal. The check requires native verified-TLS Primary,
database postgres, matching session/current administrator, required configuration/
signal/role-admin authority and the session-independent database comment
`OTR_DISPOSABLE_DEV:tuqigdxrvrerfewsxqgm`. Wrong project or ordinary role fails before
local recovery or mutation. **This marker authenticates only the owner-controlled
disposable fixture boundary; it is not actual Supabase project attestation.**
The module still pins loopback/fixture CA; no marker is installed on Hosted and no
Hosted provisioning entrypoint is opened. Actual DEV identity/administrator-channel
attestation remains a separately approved activation prerequisite.

Disable records durable UNKNOWN intent, commits NOLOGIN/PASSWORD NULL, explicitly
terminates Reader sessions and observes actual login/password/flags and zero sessions.
Local journal success is never treated as database proof. Uncertain SQL, promotion,
final journal or durability completion returns UNKNOWN. Recovery re-observes role
and session state before any further credential mutation; no automatic ALTER retry.
If already database-dormant, reconciliation can retire sessions and clean damaged
custody without trusting the journal to enable LOGIN. Live-role corrupt state remains
UNKNOWN until authorized disable. Successful committed uncertainty still reconciles
by existing candidate/active authentication, without replaying the password change.

### F2 exact artifact retirement

Inventory is exactly the names the tool creates/retains: candidate, candidate.new,
active. All must pass checked root ownership,0600, regular-file/single-link and
O_NOFOLLOW checks before removal; nonblocking opens prevent FIFO hangs. No directory
glob, unrelated credential, backup or log is deleted. Remove/fsync these names and
verify absence before persisting/returning DORMANT. Unsafe file, unlink failure or
removal-directory durability failure returns **CUSTODY_INCOMPLETE**; record that
state where possible, otherwise retain UNKNOWN. It cannot authorize provisioning.
Authorized fresh reconciliation can complete cleanup once the fault is resolved.
Final status-write failure returns UNKNOWN even if the database is already disabled.

### Corrected tests and leakage evidence

Both original F1/F2 probe blocks were replayed byte-for-byte, including their original
vulnerability assertions. Correct behavior invalidated those assertions; the harness
then independently asserted actual database dormancy, zero sessions and no owned
secret/staging residue. It did not treat an arbitrary probe exception as proof.
Unchanged block SHA256: F1
`d0e89396dff11b106f372f8e65e5a6b1447ca1590bfae0ad376d6fdde35f7a38`;
F2 `7902a04249cf91570eeed590eb9c363b415a2f6eddbf1700b6df712e26eae5de`.

| Added/control test                                                                          | Corrected result                                                                                                      |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Journal failure before write, partial write, after file fsync, after rename, directory sync | Canonical old/new JSON remains intact; verified emergency cleanup/disable recovers.                                   |
| Partial JSON, missing schema, wrong type, unexpected secret field                           | New provisioning refuses; live-role reconcile UNKNOWN; authorized disable DORMANT with damage hashes only.            |
| Candidate fsync, interruption before/after staging rename                                   | UNKNOWN; observed dormant reconciliation cleans all owned material before DORMANT.                                    |
| Unlink/removal directory-sync failure                                                       | CUSTODY_INCOMPLETE; no DORMANT; after fault removal, verified reconciliation completes.                               |
| Symlink, wrong mode, hard link, FIFO in secret staging                                      | CUSTODY_INCOMPLETE; unsafe artifact and unrelated sentinel preserved. Harness cleans only its own sentinel afterward. |
| Failure of final disabled journal write                                                     | UNKNOWN, then fresh observed DORMANT recovery.                                                                        |
| Semantically false APPLIED journal versus actual dormant role                               | Cannot authorize initial/rotation; observation-driven reconciliation cleans custody.                                  |
| Real SIGKILL after COMMIT and after custody promotion                                       | APPLIED via unchanged independent recovery blocks; no credential replay.                                              |
| Wrong project and ordinary administrative channel                                           | Reject before disable/local recovery; actual database state unchanged.                                                |
| Unrelated project artifact                                                                  | Byte contents preserved by disable.                                                                                   |

The unchanged original Builder harness passes normal provisioning, rotation,
old-password/actual-old-session rejection, expiry/limit1, emergency disable,
unconsumed COMMIT, UNKNOWN recovery, cancellation/FATAL, timeout/error/transport loss,
four-role activity observers and root-private/dump controls. Original cancel/FATAL
controls still reproduce their unsafe baseline; corrected emitted/log paths remain
closed. SQL/DDL/audit/auto_explain/error logs, retained statistics, sampled argv/
environment and retained owned staging each have **zero exact password/verifier hits**
in the respective complete scans. Reusable verifier text was held only in trusted
test memory for scanning. Sensitive database/WAL files are excluded from export.
No raw native error accessor or secret-bearing diagnostic output was added.

Exact application regressions: **262/262 PASS**. Additional custody/redaction/read/
execution recovery: **65 PASS/13 existing platform skips/0 FAIL**. Typecheck, lint
including UI guard, Backend build, Python/shell syntax, scoped Markdown formatting,
whitespace and source preservation pass. Protected full historical SQL/socket
matrices remain historical, not newly certified by these fixtures.

Sanitized correction evidence is restricted0700/0600 at
`/private/tmp/otr-r3a3b-f1f2-20261010`: original/corrected probe results, byte-preserved
independent sources, pre-correction module/report copies, regression counts, scanned
logs and source/evidence hashes. Root-private damage audit contains hashes/lengths
only; no malformed plaintext or candidate file is exported. Original evidence and
Independent Review are preserved. Same PostgreSQL17.6/Supautils3.4.0 fixture runtime
as the original Builder; no Hosted/Production access occurred in this correction.

Existing privileged transient/native memory, Python immutable copies, PANIC,
actual Apport/inspectors, WAL/backups/provider custody, physical-erasure and retained
finite dormant-expiry limits remain. Successful synthetic correction does not grant
actual Hosted, crash-handler, backup or deployment acceptance. Persistent unsafe
filesystem/authority failures remain explicit UNKNOWN/incomplete states requiring
authorized repair, never success or blind credential retry.

The four task-created fixtures were removed after verification; pre-existing
containers were preserved. The restricted evidence manifest SHA-256 is
`eb623f5dd52d9235cff09f9abbccdd361cef145dc54f7f82d59fe8579beae45d`.
The accepted Independent Review remains byte-identical, SHA-256
`70e32a05fd067b9167cad79042b4f6b12b31b7c379173a8eedab8435e9c0968b`.

**STOP — R3-A3B F1/F2 corrections complete / targeted independent security recheck required.**

## F3 complete secret custody correction — fail closed, targeted recheck required

2026-10-10. Owner-authorized correction at unchanged base
`d2c904efb22090d9a1c51fd1be63a3bb5780c8cc`. This appendix supersedes the earlier
complete-DORMANT custody claims; historical text and accepted reviews remain intact.

| Requested result                                | Result                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F3 FIX VERIFIED                                 | **YES** for the unsafe DORMANT acceptance defect, through rejection and fail-closed gating. |
| Original backup-survival failure closed         | **YES**; backup stays intact, result is CUSTODY_INCOMPLETE, never DORMANT.                  |
| Complete DORMANT custody verified               | **NO — UNAVAILABLE**; the existing filesystem approach cannot prove race exclusion.         |
| Emergency disable preserved                     | **YES**; actual database revocation/session retirement verified despite local failures.     |
| UNKNOWN recovery preserved                      | **YES**; lost ACK and actual SIGKILL recovery authenticate/observe without mutation replay. |
| New regressions                                 | **NO unexpected failures**; complete DORMANT acceptance is intentionally disabled.          |
| Ready for Targeted Independent Security Recheck | **YES**, including the intentionally unavailable complete-custody gate.                     |
| Ready for Hosted provisioning                   | **NO**.                                                                                     |

### Exact correction scope

Six paths relative to the accepted F1/F2 recheck:

1. `scripts/supabase/catalog_reader_credential.py`: bounded metadata inventory,
   canonical JSON rejection, independent emergency revocation, explicit unavailable custody.
2. `scripts/supabase/test_r3a3b_f3.py`: new synthetic rejection/emergency/concurrency probes.
3. `scripts/supabase/test_r3a3b_f1f2.py`: explicit unavailable/incomplete assertions and
   removal of harness-owned unrelated sentinels before checking a clean snapshot.
4. This Builder Report: append only.
5. `docs/CURRENT_IMPLEMENTATION_STATE.md`: short correction handoff.
6. `docs/adr/2026-10-10-dormant-reader-credential-builder.md`: fail-closed custody decision.

The fixture launcher/bootstrap and original Builder harness are byte-identical.
Principal SQL, Backend Driver, runtime, dependencies and accepted proofs are unchanged.
The entire Independent Review, including its appended F1/F2 recheck/F3 finding,
remains byte-identical, SHA-256
`2b866bbeb6f6d1ef21819cde7e38ef22254c80dcba0ccdcc65be4b71e3967fe8`.
This is the current full-file hash; the earlier original-review hash remains historical.

### Original reproduction and bounded allowlist

Before editing, execute the original independently authored unexpected-backup block
against the uncorrected module and real disposable PostgreSQL. Result:
`{"unexpected_secret_backup":{"state":"DORMANT","retained":true}}`.
The exact original block SHA-256 is
`b5ded520897928c8ce8a1f0db03082ea563d8724dc9dbfe71450e6ab47de71ad`.
The same block is executed unchanged after correction; result CUSTODY_INCOMPLETE
with the backup still present. Only state/presence/hash evidence is exported.
Harness helpers use fresh owned directories; no independent probe body is rewritten.

The only retained entries recognized for a clean disabled snapshot are:

| Entry                                | Required validation                                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lock`                               | Root-owned0600, regular, single link, empty, same inode/device as the held exclusive lock descriptor.                                                                                                    |
| `operation.json`                     | Root-owned0600, regular, single link, <=4096 bytes; canonical JSON with the existing exact journal schema, allowed states/operations and typed aware dates.                                              |
| `journal-evidence-[0-9a-f]{16}.json` | Exact generated-name pattern; same file controls/size limit; canonical JSON with exactly artifact/sha256/bytes, recognized journal artifact, 64 lowercase hex digest and nonnegative integer byte count. |

At most256 total entries are accepted. Metadata canonicalization rejects duplicate
keys, arbitrary extra fields and trailing material. Damage hashes remain restricted
sensitive audit evidence; being a hash is not automatic declassification.
Root0700 directory/path identity, UID, mode, file inode/device/link count and
mtime/ctime are checked with directory-relative non-following/nonblocking operations.
Directory timestamps surround the inventory; file identity/timestamps surround each
metadata validation; before/after snapshots surround the final journal write.
Unknown names are rejected before opening their contents. No name/content or raw
filesystem exception is emitted. All unrecognized entries stay intact.

Only the three existing tool-owned secret paths, candidate/candidate.new/active,
are eligible for checked retirement. All other regular files/backups, hidden names,
staging variants, symlinks/hardlinks, directories, unsafe ownership/modes and invalid
metadata block acceptance. Initial/rotation preflight also rejects an unrecognized
inventory; a corrupt/incomplete journal cannot authorize new provisioning.

### Race limitation and recovery semantics

**There is no race-free complete DORMANT certificate in this correction.**
The existing flock serializes cooperating custodians. It cannot exclude an
uncooperative privileged writer. Checked snapshots detect the exercised mutation
windows, but cannot prove there was no adversarial change immediately after the
last observation. Per the Owner's explicit stop condition, do not force PASS by
introducing a filesystem transaction service, watcher or new secret architecture.

Even a clean, validated disabled snapshot returns **UNAVAILABLE**, with durable
CUSTODY_INCOMPLETE journal state. No corrected runtime path writes/returns DORMANT.
Unsafe/unknown entries or cleanup/history failures return **CUSTODY_INCOMPLETE**.
Repeated disable/reconcile may verify the disabled database and clean snapshot,
but still cannot upgrade that result to complete DORMANT. These states block new
initial provisioning/rotation from the incomplete journal; no automatic replay occurs.
Only an explicit Owner-reviewed custody prerequisite can reopen complete acceptance.

Emergency disable first independently verifies the fixed fixture DEV identity,
verified Primary TLS channel, authorized administrator and Reader restrictions.
Local journal recovery/intent is attempted but cannot veto NOLOGIN/PASSWORD NULL.
After COMMIT, explicitly terminate sessions and observe actual NOLOGIN/password NULL,
restricted flags/limit1 and zero Reader sessions. Only then attempt local reconciliation.
SQL/transport/termination/observation uncertainty remains UNKNOWN, never success.
Local failure after confirmed revocation is CUSTODY_INCOMPLETE: this distinguishes
database disable from local custody acceptance. Unauthorized/wrong-project channels
remain rejected before mutation. An unopenable/unsafe custody root or lock still
fails constructor validation; this correction does not add an alternate filesystem authority.

### Disposable results and evidence

| Probe                                                                                                | Result                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Original backup, alternate backup, unknown regular/hidden files, alternate staging                   | Preserved, CUSTODY_INCOMPLETE; provisioning denied.                                                                     |
| Nested secret directory, symlink/hardlink, owner/mode, invalid metadata/lock content, duplicate JSON | Preserved, rejected without following unknown entries; DB access revoked.                                               |
| Known active/candidate/candidate.new                                                                 | Checked removal; clean snapshot verified, complete acceptance UNAVAILABLE.                                              |
| Real concurrent writer during inventory; allowed metadata insertion between snapshots                | Detected, CUSTODY_INCOMPLETE.                                                                                           |
| Journal write failure, malformed journal plus unknown backup, symlink journal                        | Real LOGIN/password revoked, old live session terminated; local incomplete.                                             |
| Repeated disable and reconcile; allowed hash-only history                                            | Idempotent disabled observations; clean metadata inventory and prior audit bytes preserved; UNAVAILABLE.                |
| Original F1/F2 unchanged independent negatives                                                       | Closed; original block hashes match retained F1/F2 evidence.                                                            |
| Partial write, interrupted rename, candidate fsync and partial cleanup                               | Safe journal recovery/cleanup; incomplete or UNKNOWN until authorized observation, then UNAVAILABLE.                    |
| Actual SIGKILL after COMMIT and custody rename                                                       | APPLIED by non-secret observation/candidate authentication; no credential mutation replay.                              |
| Provisioning, rotation, old password/session retirement, finite expiry, SCRAM, limit1, verified TLS  | PASS on real disposable PostgreSQL.                                                                                     |
| Cancel/timeout/FATAL/error/connection failure/interrupted rotation/lost response                     | UNKNOWN retained, blind retry refused; original unsafe cancel/FATAL controls reproduce, corrected leakage paths closed. |

The original Builder harness is unchanged in source. A private adapted copy changes
disabled-state assertions to UNAVAILABLE and explicitly resets the test-owned journal
between fresh synthetic lifecycles after checking the clean inventory and disabled
state; it is not evidence that runtime can automatically recover into new provisioning.
Its original security attack/observer logic is retained. The F1/F2 test helper now
checks CUSTODY_INCOMPLETE journal plus disabled SQL/session state instead of DORMANT.

Affected327 application/security tests PASS,13 existing platform skips,0 failures.
Typecheck, lint/UI guard, Backend build, Python/shell syntax, scoped Markdown
formatting, whitespace and preservation checks PASS. No whole-repository format
acceptance or historical full SQL/socket matrix rerun is claimed.

Complete successful fixture SQL/DDL/audit/error logs and statistics, sampled argv/
environment, retained staging/evidence and four-role pg_stat_activity observations
have zero exact synthetic password/verifier hits. Synthetic values/verifiers are
held only in trusted test memory for scanning and wiped where mutable. Raw controls
are redacted before export. Root-private0700/0600, empty client environment,
core soft/hard0 and nondumpable-process checks remain verified. Unknown secret
artifacts are removed only by their explicitly authorized harness teardown after
the rejection assertion; the production procedure never sanitizes unknown custody.

Fresh fixtures use the cached PostgreSQL17.6/Supautils3.4.0 image
`sha256:c77094970281215d04e60f80e1e66a6f7c03341a1cec363d1855f64c27fb56f9`,
network none/no ports, tmpfs database/log/custody, core0, no-new-privileges,
cap-drop ALL plus DAC_OVERRIDE, UID100 database/root clients with empty environment.
Fixture-only ownership setup uses a nonsecret PostgreSQL-owned sentinel and restores
root-private directory modes before exercising production checks; no capability added.
Startup/probe setup retries were discarded before the successful clean matrices.
Restricted sanitized evidence is at `/private/tmp/otr-r3a3b-f3-20261010`.
No secret database/WAL/custody archive, reusable verifier or raw malformed journal is exported.

Actual Hosted/Apport/PANIC/WAL/backups, privileged transient memory, physical erasure,
provider retention and exact null-expiry restoration remain uncertified. No Hosted
SQL request, credential creation, Backend injection/deployment, device/provider
activation or Git ref operation occurred. Synthetic safety results do not establish
Hosted build equivalence or override the complete-custody UNAVAILABLE gate.

All seven task-created fixtures were removed, including discarded setup fixtures;
pre-existing containers were preserved. Before removal, every running task fixture
was observed NOLOGIN/password NULL/limit1/zero Reader sessions. Private evidence
manifest SHA-256:
`40a7a653f68a4e3cb39dcc3e4119d5c12a5d2c44323d73fcc2f3b642ab8d3a0a`.

**STOP — R3-A3B F3 custody correction complete / targeted independent security recheck required.**
