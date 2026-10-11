# DEV Reader 90-day policy execution

Owner-authorized bounded task, 2026-10-11. Canonical source parent:
`6a7142115ec0348265f5fc9a373e1bcb9d58c302` in `/Users/xoery/Project/otr-mobile`.

**DEV POLICY UPDATED.** The exact accepted Hosted/custody baseline matched before
mutation: fixed `otr_trip_publication_catalog_reader`, ACTIVE/APPLIED, SCRAM,
LOGIN, restricted flags, connection limit1, zero sessions and accepted H1
`a56e074a33ea3e3b34c042a0e02c391f0074a5d868ee59e22f66f9ea22446e42`.

| Field                                       | Actual UTC value            |
| ------------------------------------------- | --------------------------- |
| Original creation                           | 2026-10-11T02:03:36.084144Z |
| Previous expiry                             | 2026-11-08T02:03:36.084144Z |
| New PostgreSQL VALID UNTIL / custody expiry | 2027-01-09T02:03:36.084144Z |
| Remind-by                                   | 2026-12-26T02:03:36.084144Z |

The original provision supplied creation +28 days; its accepted expiry anchors
this creation instant. Actual DDL changed only VALID UNTIL. The existing private
atomic journal recorded UNKNOWN before DDL and APPLIED after committed readback;
metadata now carries creation/expiry/remind-by and removes mandatory rotate-by.
The active password file identity, size and timestamps remained exact. Accepted
ACL H1 remained exact. No password was generated, exposed or rotated, and no
healthy session was terminated for this policy adjustment.

Actual fixed Reader authentication after adjustment: **PASS**, verified Direct
Primary TLS1.3, session/current user fixed Reader, default read-only ON and zero
final sessions. Production policy is unchanged. Immediate rotation on suspected
compromise and existing emergency disable remain. The app's one-shot Owner
reminder `otr-dev-reader-expiry-reminder` is ACTIVE for December26 at15:03:36
Pacific/Auckland (02:03:36 UTC); it checks current nonsecret evidence before
reporting a possibly superseded expiry.

Focused verification: seven disposable, network-none credential fixture scripts
PASS, including expiry-only password/verifier/open-session preservation, fresh
SCRAM/TLS login, mismatch rejection, lifecycle bounds, existing custody faults,
rotation/disable, and finite connection-error controls. Six Backend/Auth/Catalog/
Host suites **204 tests PASS**. Typecheck, lint/UI guard, Backend build, touched
formatting, Python syntax and Git whitespace PASS. Canonical integration bytes
match the tested isolated source; no new dependencies.

The R3-A5 candidate was updated to retire at expiry, rearming long Node timers.
Actual cold connection setup failed at1003ms with the old1s checkout; the corrected
3s checkout passed real Driver Catalog reads within the unchanged5s total read
boundary. Fixed identity/TLS, Pool max1, same-lease sequence and physical socket
retirement remain. Internal positive read: canonical schema/exact text PASS,
510bytes,13 empty Catalog rosters, bound4MiB/roster64; unauthorized Actor and Trip
SQL denial and rollback/reuse PASS.

Authenticated Actor/Trip HTTP positive and authenticated permission negatives
remain **DEFERRED_NO_APPROVED_SESSION** by Owner direction. No token search,
password request, new Auth fixture or identity bypass occurred. Empty live
rosters do not substitute for populated Catalog acceptance; focused contract
fixtures cover exact text and bounds.

Nonsecret execution evidence: `/private/tmp/otr-dev-reader90` and task-owned
root-private Backend result files under `/opt/otr/dev-backend/env/r3a5-reader90-*`.
Private passwords never entered Git, Docker environment, argv, public config,
logs or diagnostic output. Native/device/SQLite53 runtime integration, Composer,
C5/C9, providers and business writes remain gated.

## Final Backend runtime result

**PASS_WITH_DEFERRED_HTTP_POSITIVE.** Only the DEV Backend was replaced. Immutable
image: `sha256:23dae9c026f3b945b5f394aa1e9c381daf9ef439dad22472184cb26992fba1b4`;
bundle SHA256: `8cbc94de6e0784414a5c4376bf8f866d6fb5eb6c10eb885c6f14718045432360`.
Final Backend ID:
`73458a9b6a04a356f24cd36bf6d8bd8c19b85b4439e04715cd2674c7067e67c6`.

- Deployed internal Driver positive, SQL Actor/Trip permission denials,
  rollback/reuse, schema, bounds and exact canonical text: PASS.
- Actual public HTTP: unauthenticated401, invalid-token401, malformed Trip400,
  unexpected query400, unsupported version426, unsupported method405.
- Health200; Host mode,127.0.0.1:8787 and read-only root filesystem preserved.
  Private root:group999 mode0440 tmpfs credential file is mounted read-only.
- Final Reader sessions0. Twenty-four scoped business tables' row digests remain
  identical. Caddy PID/config, actual host addresses/firewall rules, unrelated
  containers/services and current exclusive rotated DEV API-key custody preserved.
- Actual password absence checks in Backend logs, Docker config/environment,
  process environment/argv and immutable bundle: PASS. No public credentials.
- Final successful cutover: observed interruption0.562s; sampled bracket upper
  bound0.671s; five non200 probes. Final maintenance verification took44.379s.

Earlier replacement attempts were restored automatically to the accepted healthy
Host Backend and current rotated API key. One guard incorrectly required Docker
Mount.Mode=`ro` instead of the actual empty Mode with RW=false; a nonsecret,
never-started network-none container reproduced that representation. Its rollback
had restored the correct image/health but strict verification failed; independent
readback confirmed restoration and removed the unused credential copy. The next
attempt passed deployed health/HTTP but the smoke's Docker copy failed against the
accepted read-only filesystem; verified rollback PASS. The smoke now streams
nonsecret code and approved existing Actor/Trip scope through stdin without a
filesystem write. Environment comparison preserves exact values while ignoring
list ordering. Host invariants exclude only elapsed address lifetimes, generated
firewall timestamps and traffic counters, preserving actual addresses/rules.

Those two earlier replacement/rollback cycles had sampled interruption-window
upper brackets26.411s and26.935s, covering both replacement and rollback; they are
not measurements of continuous outage. Continuous downtime across all attempts
was not measured. No passwords were restored or exposed during rollback. The
final successful deployment required no rollback; both earlier unused injection
copies and all task proof containers were removed.

Operational limit: the authorized credential mount is host tmpfs. After a host
reboot it requires the same approved private re-injection; missing custody leaves
Catalog admission closed. No restart automation or new credential infrastructure
was introduced. Authenticated HTTP positive/permission checks and Native/device/
SQLite53 runtime gates remain deferred/closed as stated above.
