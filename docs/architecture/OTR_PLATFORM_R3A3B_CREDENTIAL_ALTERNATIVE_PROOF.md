# R3-A3B credential alternative proof

Date: 2026-10-10 (Pacific/Auckland).

**Option A: BLOCKED. Option B: BLOCKED / unavailable for the fixed Reader.
Ready for bounded Hosted DEV provisioning authorization: NO.**

Direct Extended Query Protocol binding does not support ALTER ROLE's password
operand. An existing transaction-local setting plus anonymous PL/pgSQL block
avoids secret-bearing top-level SQL, but dynamic SQL error context leaks on
cancellation and forced termination. Explicit cancellation handling and
log_min_messages=panic close the reproduced log paths; they do not establish a
complete Hosted crash/retention guarantee. This hardened one-shot path is the
smallest residual-risk alternative for separate Owner approval, not an accepted
provisioning implementation.

## Scope and reproducibility

Accepted input:
[nonlogging proof](OTR_PLATFORM_R3A3B_NONLOGGING_CREDENTIAL_PROOF.md).
No Hosted query, connection or mutation occurred in this stage. Reader's last
accepted state remains NOLOGIN/PASSWORD NULL; preservation here means no access,
not a new remote observation. Production and Backend were not accessed. No
principal, ACL, Driver, activation, device, deployment or Git ref change was made.

Fixture: cached `supabase/postgres:17.6.1.167`, PostgreSQL17.6/Supautils3.4.0,
pgAudit17.1; same immutable image/provenance as the accepted proof. Exact Hosted
Supautils build remains unknown. PostgreSQL data was tmpfs, network none; client
shared only the fixture network namespace. Fixture-only operator/observer trust
did not replace Reader SCRAM authentication. The synthetic ACL fixture is not a
full OTR schema reproduction. All task containers were removed and all test
credentials are unusable; existing local containers were preserved.

Private evidence: `/private/tmp/otr-r3a3b-alternative-20261010`, directory0700,
files0600. Contains executable scripts, assertions, results, retained synthetic
logs, process snapshot, runtime configuration and accepted custody observation.
`evidence-hashes.json` pins each artifact; its SHA256 is
`e70bff1aaaeda3788d1adc2f6732c208b49bb66b488f636ed635fc514890e2a6`. The first main run failed at an
unhandled test-runner cancellation; the corrected complete run passed its
assertions. Logs include intentional leakage controls from both runs. Exact
per-secret results in `results.json` refer to the completed run; supplemental
edge/termination runs are separately recorded. Raw logs contain synthetic
password material and are not deliverables for Git/telemetry.

## Option A — actual protocol and existing server mechanism

`pg` issued genuine Parse/Bind messages for:

```sql
ALTER ROLE otr_trip_publication_catalog_reader PASSWORD $1
```

PostgreSQL rejected it with **42601, syntax error at or near "$1"**. The client
queued Parse and Bind; the server rejected Parse before it could use the bound
password. No interpolated/password-literal fallback was used. Extended protocol
binding is not a way to parameterize this utility grammar. See PostgreSQL's
[protocol flow](https://www.postgresql.org/docs/17/protocol-flow.html).

Only already available primitives were investigated: set_config/current_setting
and anonymous PL/pgSQL DO. No persistent function, Vault object, generalized
credential service, extension installation on Hosted or new SQL Principal was
proposed. Accepted Hosted evidence includes plpgsql; set_config is a built-in.

Test sequence on one NOSUPERUSER/CREATEROLE operator session:

1. BEGIN; apply transaction-local diagnostic suppression through the observed
   Supautils allowlist, checking each setting before staging any secret.
2. Bind password/verifier to `$1` in a fixed SELECT setting an ephemeral custom
   GUC, with is_local=true; discard its value using a boolean expression. Bind
   finite expiry separately. Never SELECT the secret into a result.
3. Execute a constant DO body reading the local settings and constructing only
   the fixed Reader's ALTER ROLE with format `%L`. No role/ACL/user input is accepted.
4. Clear the staged setting, COMMIT, close the dedicated operator connection.
   Rollback/cancellation paths clear it; uncertainty requires closed admission.

PostgreSQL documents the transaction scope of these
[configuration functions](https://www.postgresql.org/docs/17/functions-admin.html).
The custom setting is session-local, not a secret vault; its value exists in
operator/backend memory. The generated nested ALTER statement still contains
the secret. Setting it locally does not erase every memory copy.

The tested suppression was log_statement=none, log_min_error_statement=panic,
duration/sample-independent duration threshold=-1, log_duration=off, parameter
lengths0, pgAudit log=none/statement off, pg_stat_statements track=none/utility off,
auto_explain threshold=-1. Success, rollback and cancellation restored defaults
through transaction completion, without role-wide or global setting changes.

### Visibility and leakage

Observers were independent logins: fixed Reader, ordinary app_observer,
monitor_observer with pg_monitor, and administrative supabase_admin. These are
fixture classes, not certification of every actual Hosted application membership.
The monitor is not authorized to read credentials. Administrative catalog access
is explicitly trusted. No claim is made about absolute privileged-memory absence.

| Observer                 | Literal SQL control in activity | Bound setting / constant DO in activity | Other session's GUC               | pg_authid verifier access           |
| ------------------------ | ------------------------------- | --------------------------------------- | --------------------------------- | ----------------------------------- |
| Reader                   | Query masked; no password       | Query masked; no password               | No secret                         | Denied42501                         |
| Ordinary application     | Query masked; no password       | Query masked; no password               | No secret                         | Denied42501                         |
| pg_monitor               | Exact control password visible  | SQL visible, no password/verifier       | No secret                         | Denied42501                         |
| Administrative superuser | Exact control password visible  | SQL visible, no password/verifier       | No secret through current_setting | Allowed; trusted verifier custodian |

The bound setting was also deliberately delayed during execution: monitoring and
administrative activity showed placeholders, not the bound SCRAM verifier.
Reader visibility was tested separately during the constant DO. The client-created
synthetic SCRAM verifier authenticated successfully; no verifier match was found
in retained logs or statistics for that test.

A separate fresh fixture tested retained sinks against an intentionally logged
role-password control. Reader and application log reads failed42501 and statistics
hid the control SQL. pg_monitor log reads also failed42501, but its statistics
view exposed the exact control password. Administrator could read both logs and
statistics and saw it. Thus monitoring membership is an independent credential
disclosure boundary even without server-file privileges. Suppressed candidate
passwords/verifiers were absent from the administrator's complete retained
statistics scan, rather than merely hidden by a restricted observer view.

| Sink/path                                                          | Actual result                                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Binding without suppression                                        | Synthetic SELECT parameter retained four times in completed-run SQL parameter/audit/duration evidence. Binding alone is not redaction.    |
| Suppressed success/rotation                                        | Zero exact generated password matches in server log/statistics; zero sampled activity secret matches for all observers.                   |
| Invalid expiry with ordinary exception sanitizer                   | P0001/generic message; no secret in client error/context/log; rollback cleared GUC.                                                       |
| Cancel outer pg_sleep                                              | 57014; rollback cleared staged secret.                                                                                                    |
| Cancel nested ALTER waiting on catalog row lock, WHEN OTHERS       | 57014; exact secret in client error context and once in persistent server log. OTHERS does not catch query_canceled.                      |
| Explicit query_canceled OR OTHERS handler                          | Same lock/cancel; P0001/generic error, zero client/log secret matches.                                                                    |
| Force operator termination while nested ALTER waits                | 57P01; secret in client context and once in server log despite explicit handler. FATAL bypasses it.                                       |
| Add LOCAL log_min_messages=panic before staging, force termination | 57P01 still contains secret in privileged client context; zero server-log matches in this test.                                           |
| Statistics                                                         | No tested bound password/verifier persisted. This does not exclude database catalog verifier/WAL/backup custody.                          |
| Process argv/environment                                           | Client self and sampled fixture process evidence contained no synthetic password/verifier. Memory was not scanned or claimed secret-free. |

Logs include multiline CONTEXT records: searching only lines tagged STATEMENT or
the first CONTEXT line misses nested SQL. `log-classification.json` records the
reproduced context exposures; per-secret tests searched the complete raw log.

**A remains BLOCKED as a Hosted safety proof.** The hardened settings/handler
prevented the reproduced persistent leaks, but PANIC, dump/backup retention,
actual Hosted role graph, exact Supautils build and authenticated administrative
path are not certified. Raw driver errors must never be serialized by a future
provisioner. Neither `%L` quoting nor exception handling is a log-redaction guarantee.

### Lifecycle

The bound path created a finite approximately24h credential and rotated it.
Old session remained usable until explicitly terminated; old password then failed
28P01 and new password authenticated. NOLOGIN/PASSWORD NULL blocked new login but
left the established session alive until terminated. Final state was NOLOGIN/NULL,
connection limit1, zero sessions. Reader's identity and grants were unchanged.

This fixture's NOSUPERUSER operator successfully terminated Reader sessions through
an explicit pg_signal_backend grant. That grant models a requirement; it does not
prove the actual Hosted operator has it and is not permission to add it there.
Accepted prior proof covers expiry rejection, second-connection rejection and
negative ACL tests; no full Hosted revalidation is claimed here.

## Option B — documented managed provisioning

**Unavailable for this fixed Reader; BLOCKED.** No management mutation was called.

| Documented contract                                                                          | Privileges                                               | Suitability                                                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| PATCH `/v1/projects/{ref}/database/password`; body password                                  | OAuth database:write; fine-grained database_config_write | Project database password; no dedicated role selector. Cannot target only the Reader.                                        |
| POST `/v1/projects/{ref}/cli/login-role`; body read_only; response role/password/ttl_seconds | OAuth database:write; fine-grained database_write        | Experimental/Beta temporary CLI identity. No selector for existing fixed Reader; adopting it changes the accepted principal. |
| Management query endpoints                                                                   | Administrative SQL authority                             | General SQL execution, not a nonlogging dedicated-password API; does not solve this proof.                                   |

Contracts: [database password](https://supabase.com/docs/reference/api/v1-update-database-password),
[temporary CLI role](https://supabase.com/docs/reference/api/v1-create-login-role).
Management requests require authenticated HTTPS using scoped PAT/OAuth credentials;
see [API authentication](https://supabase.com/docs/reference/api/introduction).

Supabase documents automatic audit of platform API/dashboard actions, including
actor/action/target and metadata, with plan-dependent retention and log drains:
[Platform Audit Logs](https://supabase.com/docs/guides/security/platform-audit-logs).
The password endpoint contracts do not certify arbitrary credential body/response
redaction across all audit/error systems. No live secret canary or audit-retention
test was authorized. Auth audit logs concern Auth users and do not supply this
database-role guarantee. Public postgres-meta source constructs password-literal
ALTER ROLE; it is not a documented Hosted nonlogging credential service:
[role implementation](https://raw.githubusercontent.com/supabase/postgres-meta/master/src/lib/PostgresMetaRoles.ts).
No undocumented endpoints were invented or used.

## Custody verification and remaining limits

Disposable root-owned storage test on tmpfs passed: directory0700/file0600,
exclusive/no-follow staging creation, fsync/atomic rename, no remaining staging
file, and UID10001 read denied EACCES. Secret generation occurred in process
memory, never argv/environment. A child SIGSEGV with core limit0 left no core file
under the local VM's plain `core` handler. Files/tmpfs were retired after testing.
This is a storage/control demonstration, not actual Backend custody certification.

Accepted DEV host evidence shows `/opt/otr/dev-backend/env` root:root0700 and
backend.env0600. Its container core limit was **unlimited**, with a **piped Apport**
host handler. Process environment is readable by the same UID and privileged
operators. Existing Docker logs rotate10m×3; that is a size bound, not a credential
retention guarantee. No new remote observation or dump/backup exclusion proof
was obtained. Local fixture json-file logging had no configured rotation; retained
synthetic logs are private failure evidence, not a production custody policy.

Required before any real credential: actual host process dump suppression,
including nondumpability/Apport and a synthetic crash negative; no raw query/error
telemetry; restricted root/Docker/DB custodians; backup/snapshot exclusions or
explicit encrypted bounded retention/deletion; rotation retirement of old files,
containers/processes and recovery copies. Unlink is not secure erasure.

## Minimum residual-risk alternative — separate Owner approval

Use **one root-run, one-shot Direct Primary provisioner** with genuine bound
parameters, transaction-local GUCs and fixed-role anonymous DO. Include the
explicit cancellation handler, the tested diagnostic controls **plus
log_min_messages=panic before binding**, bounded lock/statement timeouts, generic
code-only failure output and unconditional connection retirement. No stored helper,
new role, vault/service or Driver change is needed. Treat any unknown setting,
permission or uncertain outcome as closed admission, not a literal-SQL fallback.

Generate32 CSPRNG bytes/base64url; persist atomically to one root:root0600 file in
the existing0700 directory, without argv/environment, auxiliary plaintext copies
or backups. Record only opaque version/state/times. Set finite UTC expiry≤30days;
rotate by day14. If persistence/database outcomes disagree, leave admission closed,
verify or disable under separate authorization; never create a second principal.

Before rotation/disable, close admission and the single Reader pool, terminate
Reader sessions with verified administrative authority, and confirm zero. Rotation
must reject the old password and verify the new credential before resumption.
Emergency disable is NOLOGIN/PASSWORD NULL plus forced session retirement and
secret retirement, preserving ACLs. Schedule ownership/enforcement is still pending.

Keep the accepted Driver's fixed Reader identity, max1 pool, minimum ACL and exact
`db.tuqigdxrvrerfewsxqgm.supabase.co:5432` Direct Primary verified TLS. The accepted
Driver already takes a password in structured config; no Driver redesign is
necessary. Later authorized Backend composition can read protected storage into
that config. No file read/injection/startup wiring is implemented here. The existing
Compose env_file would add Docker/same-UID environment exposure; using it requires
an explicit separate exception and is not the recommended handoff.

Residual exposure requiring explicit acceptance: trusted provisioner/DB memory,
raw FATAL context received in the privileged client, administrative access to
pg_authid verifiers and database WAL/backups, and any unproven PANIC/platform dump
path. Reduce accessible custodians, retire the operator immediately, and forbid
raw-error reporting. Actual Hosted privileges/build and custody controls remain
prerequisites, not risks silently waived by this recommendation.

| Approach                                | Secret exposure                                                                                            | Complexity / DEV risk                           | Decision                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| Direct bound ALTER                      | Unsupported                                                                                                | Small but cannot work                           | Reject                               |
| Literal ALTER + suppression             | Monitor/activity exposure; reproduced context leaks                                                        | Small, insufficient                             | Reject                               |
| Bound local setting + hardened fixed DO | No sampled unauthorized activity exposure; privileged error/memory and unproven fatal/crash custody remain | One-shot transaction; no schema/Driver redesign | Minimum residual-risk candidate only |
| Managed password/CLI APIs               | Wrong target/identity; audit guarantees unverified                                                         | Adds unsuitable identity/platform scope         | Unavailable                          |

**Ready for bounded Hosted DEV provisioning authorization: NO.**
**STOP — R3-A3B CREDENTIAL ALTERNATIVE PROOF / OWNER REVIEW REQUIRED.**
