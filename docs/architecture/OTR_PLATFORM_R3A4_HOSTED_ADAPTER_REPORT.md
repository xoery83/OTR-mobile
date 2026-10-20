# R3-A4 minimal Hosted DEV Reader adapter

2026-10-11 (Pacific/Auckland). **Adapter implementation READY. Actual Hosted
provisioning BLOCKED / ready for separately authorized real provisioning NO.**

## Exact scope

Local main and live remote main both verified
`78e9315da932f660f544e7363676094e01d9e4ba` before implementation. Isolated branch
`codex/r3a4-hosted-adapter`; existing dirty canonical/shared checkout work preserved.
The prior R3-A4 blocked report in the shared checkout was read, not rewritten.

Exactly five changed repository paths:

- `scripts/supabase/catalog_reader_credential.py`
- `scripts/supabase/test_r3a4_hosted_adapter.py`
- `docs/adr/2026-10-11-dev-reader-hosted-adapter.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md` (incremental handoff only)
- This report.

Fixture-only blockers were hard-coded localhost, disposable database stamp and
reconciliation's hard-coded fixture CA/endpoint. Add only exact DEV host
`db.tuqigdxrvrerfewsxqgm.supabase.co:5432`, with database postgres, operator postgres,
fixed Reader, explicit native password buffer, hardened Linux root, verify-full,
TLS minimum1.2 and existing bounded timeouts. Reject other endpoints/ports/users,
untyped/empty/unterminated buffers and inherited PG/password environment.

Hosted validates actual database/session_user/current_user/SSL/Primary; Reader also
requires read-only default. Endpoint certificate chain and exact DNS identity bind
DEV. Optional project setting must be DEV if present; NULL is not project attestation.
Operator still requires delegated privileged role, CREATEROLE/Reader ADMIN and signal
privileges. Localhost retains its original stamp/admin rules. Reader reconciliation
uses the actual operator endpoint/port/CA. No generic role abstraction or launcher.

Fixed secret-bearing mutation, suppression settings, native error/notice boundary,
UNKNOWN journal and no-replay logic, explicit session termination, inventory and
UNAVAILABLE/CUSTODY_INCOMPLETE semantics are preserved. No complete DORMANT claim.
Principal SQL/reverse/inventory/manifest, Backend Driver/server and package/lock
files remain byte-identical to the starting commit. No dependency was added.

## Administrator and Reader custody

The accepted design specifies an existing checked root-private descriptor/native
buffer handoff. No actual Direct PostgreSQL administrator credential store or
inherited descriptor has been established by the accepted evidence or this task.
The root-private Backend API-key env_file and linked Management API credentials
serve different authentication channels and cannot substitute. No real credential
was opened, read, printed, copied or injected. No password loader or new credential
infrastructure was invented. Future caller must harden before secret acquisition,
use the checked descriptor boundary, close descriptors/connections and exit once.

Fresh DEV host metadata: root0700 custody parent, trusted root-owned ancestors,
process core0/0 and PR_SET_DUMPABLE0/readback0 PASS. Host Python libpq lookup absent;
Apport pipe enabled, suid_dumpable2. Actual crash-handler/inspector exclusions,
backup/snapshot retention and complete private Reader subtree acceptance remain
unproven. Root permissions alone do not establish those guarantees. Complete
Reader custody remains UNAVAILABLE, including after checked clean disable.
No host package, crash policy, custody mount, secret file or service was changed.

## Managed Realtime routine

Read-only DEV definition/ACL classification observed
`realtime.authorize(text,text,text,text,text,text[],text[])`, owned by
supabase_realtime_admin, PL/pgSQL, SECURITY INVOKER, PUBLIC EXECUTE. Its body probes
Realtime messages/RLS under role/JWT context and rolls back its temporary probe
block. It is classified as a managed Realtime authorization helper from its owner,
schema and inspected behavior; exact service rollout timestamp was not established.
It was not invoked. Reader function EXECUTE is true through PUBLIC, but Realtime
schema USAGE is false; SECURITY INVOKER supplies no owner privilege escalation.
Reader has no added membership, schema rights or business-table grant.

Fresh principal inventory is exactly unchanged; corrected H1 remains
`a56e074a33ea3e3b34c042a0e02c391f0074a5d868ee59e22f66f9ea22446e42`.
The managed helper is outside that accepted OTR/Reader commitment. No shared-schema
or ACL change is warranted. Broader routine inventory is not claimed identical.

## Validation

- Two task-owned network-none PostgreSQL17.6/Supautils3.4.0 fixtures; fixed DEV DNS
  maps only to127.0.0.1, certificate SAN includes DEV/localhost. Cached accepted
  runtime image, tmpfs data/WAL/custody, core0/no-new-privileges/cap-drop ALL except
  DAC_OVERRIDE. No published port or route to Hosted. Both fixtures destroyed.
- Final new adapter assertions PASS: endpoint/port/user/CA/buffer/environment
  rejection; trusted CA/wrong SAN rejection; nine operator identity/authority
  negatives; retained fixture stamp; unsafe Reader read-only default rejection;
  actual synthetic SCRAM Reader identity/protected function; business/DDL/SET ROLE
  denials; provision/reconcile; committed UNKNOWN without mutation replay;
  established session termination; clean disable/recovery UNAVAILABLE and no retry.
  Fixture admin authentication is trust, so this is not actual admin SCRAM proof.
- Accepted F1/F2, F3 and retained custody-adjusted lifecycle harness PASS, including
  real SIGKILL/journal/staging recovery, cancel/FATAL, rotation, expiry and lost-ACK
  paths. Synthetic password/verifier log/statistics/process/artifact scans0;
  corrected client stderr0. Test-only lifecycle custody reset remains confined to
  its synthetic harness. Historical proof/review documents remain untouched.
- Existing Driver/read/transport/repository suites: **4 files /211 PASS**. Required
  typecheck, lint/UI guard, Backend build, Python syntax, changed Markdown format
  and whitespace PASS. Historical full235-case Principal SQL and19-case socket
  matrix not rerun; Principal preservation and current Hosted H1/ACL checked.
- Fresh actual DEV unauthenticated Direct IPv6/TLS1.3 hostname/chain PASS;
  wrong hostname/untrusted chain reject. Backend healthy, same accepted Host
  container, no runtime injection. These probes performed no PostgreSQL login.

Nonsecret evidence and reproduction inputs are owner0700/0600 under
`/private/tmp/otr-r3a4-adapter-evidence`. Public routine definition is metadata,
not a secret. Fixture certificate SAN is the sole private launcher variation;
use Docker --add-host for the fixed DEV name. New test source is not a Hosted CLI.

No real Reader LOGIN/password/expiry mutation, Hosted schema/ACL/migration change,
Backend deployment/injection, Production, Native/device/Simulator or provider/business
operation occurred. Integration remains scoped to these five files, preserving
pre-existing documentation edits. Real provisioning remains separately authorized
and BLOCKED on direct admin custody, host runtime/crash/retention and complete
Reader custody prerequisites.

**STOP — R3-A4 Hosted provisioning adapter implementation complete.**

## Owner-authorized DEV cooperative custody correction — 2026-10-11

Explicit opt-in for project tuqigdxrvrerfewsxqgm accepts trusted root and
cooperating writers. Default custody retains UNAVAILABLE. The new disabled
acceptance state is COOPERATIVE_DORMANT, never race-free DORMANT. Fixed DEV
endpoint identity is required for SQL operations using this mode. Every local
write/remove/promotion checks inventory before and after under the held lock;
unexplained changes latch UNAVAILABLE. Unknown files are not read or deleted.
Existing UNKNOWN recovery and independent database revocation remain mandatory.
Root compromise/noncooperating privileged writes, Apport, provider backups and
retention are residual DEV risks, not exclusion guarantees. This authorization
does not create an administrator credential or supply missing host libpq.

Validation of this correction: all four final network-none PostgreSQL fixture
suites PASS (retained adapter, new trusted-root, retained F1/F2 and retained F3).
The original default unconditional UNAVAILABLE behavior was reproduced; opt-in
cooperative lifecycle and reinitialization pass. Negative backup/candidate/staging/
temporary/links/ownership/modes/replaced-lock cases close. Observed changes between
transitions, during writes and during inventory latch UNAVAILABLE. Emergency
disable with damaged journal and unknown files terminates an established Reader
session and preserves unexplained entries. Committed UNKNOWN authenticates and
reconciles without replay. Fixture logs/statistics contain no captured secrets or
verifiers. Secret reads also check inventory before/after and wipe on failed
validation. Tests use synthetic credentials; operator fixture trust authentication
is not actual DEV administrator SCRAM acceptance.

211 focused Driver/read/transport/membership-repository tests PASS. Typecheck,
lint/UI guard, Backend build, Python syntax, changed-doc formatting and whitespace
checks PASS. The first JS test launch required permission for Vite's dependency
cache; the permitted run passed. A fixture challenge file was initially absent
and one test-only assertion typo was corrected before final full fixture PASS.
No role SQL, migration, Backend Driver or runtime source changed.

Actual host prerequisite refresh: no approved Direct admin credential descriptor/
store established, root-private admin candidate paths absent; host libpq lookup,
standard paths, loader and package metadata all absent. Required real Direct
admin authentication/logging verification cannot proceed. Per task item19 STOP:
Reader initialization BLOCKED, authenticated Reader SQL NOT RUN. Fresh Management
read-only SQL confirms postgres/Primary and Reader NOLOGIN/password NULL/expiry
NULL/limit1/zero sessions. No real credential acquired/generated and no Hosted
SQL/ACL/migration change. No host package, dump policy or custody store created.
Existing root0700 API custody is not Reader/admin custody. Enabled Apport with
suid_dumpable2, provider snapshots/backup retention, privileged memory/inspectors
and noncooperating root remain explicitly recorded DEV residuals.

Nonsecret evidence: `/private/tmp/otr-r3a4-trusted-root-evidence` (0700, files0600).
Local starting main fa8b32a included an existing unpublished Day Feed commit;
remote main was45092ea. This task integrates only its five changed files locally
and does not push that unrelated predecessor. Shared dirty documentation is
preserved. Backend and Native Catalog Runtime remain CLOSED.

## Final connection prerequisites — 2026-10-11

Ownership resolved by reading the actual Owner message in “Consolidate Trip Day
Feed” (thread01a124b8-257c-7120-8679-e33f62447315): conditional acceptance of the
bounded 25-file routing milestone and normal commit/integration authorized. Its
final integration evidence identifies fa8b32a. Full Day Feed acceptance remains
OPEN, but this predecessor is not unaccepted work. R3-A4 commit6f17fe3 contains
only its five documented files. Normal fast-forward publication can retain this
already accepted canonical predecessor; no new Day Feed changes belong to this task.

DEV host is Ubuntu24.04/noble amd64. Apt selected libpq5
16.15-0ubuntu0.24.04.1, compatible with installed dependencies; simulation showed
only one new package, zero upgrades/removals. Download SHA256 verified against
supported apt metadata:3f96dd36bcd7841172c1ead4965da20a193bb9ccf9a93a3f5a3ac7f56369dbb1.
Package control contains only an ldconfig trigger and no service-management scripts.
The first no-download/local-archive attempt failed before installation; read-only
reconciliation confirmed package still absent and Backend unchanged. The verified
public archive was then put into apt's standard cache; pinned no-download install
PASS with noninteractive operation and NEEDRESTART_MODE=l. Exactly libpq5 changed.
Backend container ID, start time, running/healthy state are identical before/after.
No unrelated package, running Backend configuration or persistent dump policy changed.

Native lookup/CDLL load PASS, PQlibVersion160015, required verify-full/root CA/minimum
TLS/connect-timeout/passfile options present. Actual libpq to the fixed DEV Primary
with accepted CA and no password reaches the password-required boundary. Wrong
hostname (same fixed IP) and untrusted CA reject. This verifies transport/library
readiness, not authenticated SQL. Probe suppresses raw diagnostics and supplies
no administrator or Reader password; no SQL is sent. Public CA/test/package
metadata resides in root0700 /var/tmp/otr-r3a4-libpq-20261011.

Current official Management API supports query parameters but documents neither
request-body secret exclusion nor a pinned multi-request PostgreSQL session for
logging suppression before secret binding. Its CLI login-role endpoint creates
a temporary CLI identity, not credentials for the existing fixed Reader. Therefore
nonlogging Reader password initialization through this authority is NOT VERIFIED:
no plaintext or verifier was sent in SQL/API requests, and no temporary role was
created. References: https://supabase.com/docs/reference/api/v1-run-a-query and
https://supabase.com/docs/reference/api/v1-create-login-role .

For the accepted private libpq procedure, the remaining exact input is the existing
DEV database password for postgres at db.tuqigdxrvrerfewsxqgm.supabase.co:5432,
database postgres. It is not an API key/Management token or a new Reader password.
The simplest approved operational reference remains the Owner-local hidden TTY/
pinned SSH stdin workflow in dev-api-key-handoff.py. It is API-specific: its
validator, destinations and encrypted staging cannot be reused unchanged. Any
password-specific handoff must use separate admin custody, harden before acquisition,
verify root0700/regular single-link0600/no-follow ownership, deliver the checked
native buffer and close/wipe once. No admin password loader/store was invented in
this task; no real password prompt/input or Reader generation was performed.
The real missing input/delivery remains BLOCKED, not a renewed absolute-custody gate.

DEV cooperative custody source and all recovery/termination controls are unchanged.
Privileged writer, Apport, provider-backup/retention residuals remain documented.
Reader initialization BLOCKED; actual authenticated SQL NOT RUN. Backend/Native
Runtime remain CLOSED. Nonsecret evidence:/private/tmp/otr-r3a4-final-blockers.
