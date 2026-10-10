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
