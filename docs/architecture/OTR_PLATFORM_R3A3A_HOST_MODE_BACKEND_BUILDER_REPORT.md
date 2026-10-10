# R3-A3A host-mode Backend Builder report

**Ready for Independent Review: YES. Deployment: NOT PERFORMED / NOT AUTHORIZED.**

Owner-authorized dormant implementation at canonical base
`d2c904efb22090d9a1c51fd1be63a3bb5780c8cc`. Local main, remote main and fresh
Builder HEAD matched before implementation and at final source review.
Builder workspace:
`/Users/xoery/.codex/worktrees/r3a3a-host-backend-builder/otr-mobile-canonical`.
No commit, push, merge or canonical ref change was made; all changes remain uncommitted.
The original dirty checkout was preserved.

Accepted input is the prior
[Host Networking feasibility report](OTR_PLATFORM_R3A3A_HOST_NETWORK_FEASIBILITY_REPORT.md),
copied byte-for-byte into the Builder because it is absent from this canonical base.
Accepted-copy SHA256:
`96969215c400bc5aa60df77b5cd893f34dcb61ee806255965dc2ed72e2af2bfa`.
The split address in the Owner request was interpreted as **127.0.0.1:8787**,
consistent with that accepted evidence and the loopback-only requirement.

## Exact changed files

| Path                                                                       | Change                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/server.ts`                                                    | Validate DEV network mode/bind before startup; fixed host-mode loopback listener and port8787.                                                   |
| `backend/src/serverNetwork.test.ts`                                        | 15 actual-startup configuration tests; bad profiles reject before socket creation.                                                               |
| `deploy/dev-backend/compose.host.yml`                                      | Dormant standalone host alternative; no port publishing; three fixed HTTP environment settings.                                                  |
| `scripts/dev/backend-host-network-smoke.mjs`                               | Linux actual-built-startup fixture, socket inspection, denied ingress and health/Auth/route assertions; synthetic keys and child egress blocked. |
| `docs/ops/DEV_BACKEND_RUNBOOK.md`                                          | Incremental future replacement, exposure/TLS validation and pinned-image rollback procedure.                                                     |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`                                     | Short Builder handoff and next independent-review gate.                                                                                          |
| `docs/architecture/OTR_PLATFORM_R3A3A_HOST_NETWORK_FEASIBILITY_REPORT.md`  | Unchanged accepted evidence copy.                                                                                                                |
| `docs/architecture/OTR_PLATFORM_R3A3A_HOST_MODE_BACKEND_BUILDER_REPORT.md` | This report.                                                                                                                                     |

The original bridge Compose, Dockerfile, package/lockfile, Auth/routes/request-bound
implementation, scanner/error handling, SQL Driver/TLS/fixed Reader identity,
protected Catalog SQL, Native and Composer sources remain unchanged. No new dependency,
proxy, generic network abstraction or activation path was added.

## Startup and profile behavior

The default mode remains `bridge`, with the original `0.0.0.0` listener and existing
custom-port behavior. If the new bind setting is explicitly provided in bridge mode,
it must agree with that wildcard address. An existing deployment without the new
settings behaves as before.

The approved host profile explicitly sets:

```text
OTR_DEV_BACKEND_NETWORK_MODE=host
OTR_DEV_BACKEND_BIND_ADDRESS=127.0.0.1
OTR_DEV_BACKEND_PORT=8787
```

Host startup rejects a missing/empty bind, `0.0.0.0`, `::`, `::1`, hostname,
alternate loopback/non-loopback address, whitespace, host:port string, unknown mode
or port drift **before constructing the HTTP server or initializing gateway/scanner**.
The listener itself uses the fixed127.0.0.1 literal after validation.

`compose.host.yml` must be used **alone**, not merged with `compose.yml`: merging
would retain bridge port publishing. Actual DEV Compose2.40.3 parsed both profiles
from stdin with service environment-file resolution disabled. Assertions verified
host networking, no published ports/service networks, exact HTTP settings and parity
of every other service property: build, env-file reference, container name,
read-only/tmpfs, no-new-privileges, memory, restart and logs. Dockerfile user and
healthcheck are unchanged. No secret file was read or rendered.
The [Compose config documentation](https://docs.docker.com/reference/cli/docker/compose/config/)
documents this read-only rendering and its `--no-env-resolution` control.

## Actual loopback binding and exposure proof

Final built bundle SHA256:
`80e1e89cdd1b0071da3020760ba82329027050f536169eb6da92dfdc2fa28ce4`.
The retained verifier independently recovered the stdin-staged bundle bytes and
confirmed equality with the final canonical-lockfile build.

At03:55:14–03:55:16 UTC, a task-owned disposable Linux container reused the current
Backend image as a Node24.21.0 runtime. The exact bundle started under the approved
host HTTP profile, with synthetic fixture keys, all child fetch/socket-request
outbound paths denied, read-only root, task-local `/tmp` tmpfs, UID/GID10001,
no-new-privileges, all capabilities dropped, bounded PID/memory/CPU, no healthcheck
process and no published port. The actual app's health endpoint was tested directly.
The child scanner's ordinary startup attempt was denied before network access;
no fixture request authenticated or performed a Hosted operation.

| Actual observation                                       | Result                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Child-owned `/proc` TCP/TCP6/UDP/UDP6 listener inventory | Exactly one TCP listener: `0100007F:2253`, state0A = **127.0.0.1:8787**; no extra application listener/UDP socket |
| Non-loopback IPv4 connection to candidate172.17.0.4:8787 | **ECONNREFUSED**, no timeout-based inference                                                                      |
| IPv6 loopback `::1:8787`                                 | **ECONNREFUSED**                                                                                                  |
| Actual bundle GET `/health`                              | 200, exact development/ok body; same URL as Dockerfile healthcheck                                                |
| Protected Ledger bootstrap without bearer                | 401 / AUTH_REQUIRED                                                                                               |
| Unknown route                                            | 404                                                                                                               |
| New host listener                                        | None; before/after host socket inventory identical                                                                |

**Proof boundary:** HTTP used the disposable container's existing default bridge
namespace, with the exact host-mode _application_ profile. The existing Backend owns
host8787, so combined actual host-network candidate startup on that port cannot run
without a forbidden replacement. No alternate-port production exception was added.
Docker host networking and Direct connectivity were proved separately below.
Combined live host-mode startup, Docker health scheduling and Caddy-to-candidate
acceptance remain mandatory post-replacement checks, not Builder-certified results.

## Host networking, Direct TLS and reverse proxy

The actual platform remains native Linux Docker29.1.3 on Ubuntu24.04.4, host
178.105.151.143. A separate task-owned disposable host-network probe at
03:52:27–03:52:32 UTC shared host namespace `net:[4026531840]` without a global toggle.

- Direct DNS AAAA: `2406:da1c:4c7:f800::7dd1` for
  `db.tuqigdxrvrerfewsxqgm.supabase.co`.
- Normal hostname IPv6 TCP5432 and verified TLS: PASS; literal IPv6 diagnostic also
  passed while retaining exact hostname/SNI verification.
- TLSv1.3 / TLS_AES_256_GCM_SHA384; exact hostname SAN and trusted Supabase chain.
  Wrong-hostname rejects ERR_TLS_CERT_ALTNAME_INVALID; empty trusted CA rejects
  SELF_SIGNED_CERT_IN_CHAIN. Accepted public CA fingerprint unchanged.
- Only PostgreSQL SSLRequest/TLS handshake traffic; no StartupMessage, identity,
  password, SQL, Reader provisioning or accepted Driver invocation.

Read-only deployed startup/socket inspection confirmed the current wildcard bind
behind loopback Docker publishing. Caddy's existing upstream is exactly
`reverse_proxy 127.0.0.1:8787`. Current local and verified-public-HTTPS `/health`
both returned200/development/ok before each actual bundle fixture. Caddy config
SHA256 remained
`6c24341b1dc1b91e2cf10ec5bbe0a037d530b907dbb0d9ebaa0c0bc4eebc5f2a`.
No proxy edit, reload, second proxy or candidate routing override was used.
Address/route compatibility is established; the existing public checks exercised
**the unchanged running Backend**, not the candidate.

Host mode removes network namespace isolation: localhost becomes host localhost,
bridge aliases cease to be guaranteed, and processes share host port space.
The tested host resolver127.0.0.53 supplies Direct AAAA. Strict127.0.0.1 HTTP binding
prevents public interface listening; dropping Docker publishing does not introduce
an IPv6 HTTP listener. Other interfaces/services and host policy remain unchanged.
Environment-derived service dependencies were not inventoried by reading secrets;
no guarantee beyond tested DNS/upstream and unchanged canonical routes is claimed.

## Safe replacement, downtime and rollback

The incremental [runbook](../ops/DEV_BACKEND_RUNBOOK.md) defines the future bounded
procedure, requiring separate deployment approval:

1. Pin accepted source/new image and retain immutable old image, original source/
   bridge profile, safe container/network/firewall/Caddy baseline. Parse the host
   profile without env-file resolution. Stage/build before stopping anything.
2. Stop only old Backend with the explicit project/profile; verify8787 free; start
   the host alternative alone with `--no-build --pull never`. No parallel instance,
   broad Compose down, Docker restart, Caddy reload or other-service change.
3. Attest actual new process sockets127.0.0.1:8787/no extra listener, host mode/no
   ports, user/limits/health, localhost and publicHTTPS200, unauthenticated401 and
   independent non-loopback/publicIPv4/IPv6 denial. Repeat credential-free Direct
   AAAA/IPv6 TCP/TLS and negatives; compare all unrelated services/host policy.
4. Failure triggers Backend-only rollback: stop candidate, confirm8787 free, restore
   original source/profile layout, recreate using retained immutable old image via
   a private single-service image override, `--no-build --pull never`; recheck
   bridge attachment/publishing, health/Caddy and preservation. Never rebuild or
   rely on a moved tag; never alter credentials/host policy to make a check pass.

There is a service interruption from stop to validated health; requests may502 or
terminate. No zero-downtime or measured-duration claim. The Owner must set the
maintenance timeout before execution. No replacement or rollback command ran here.

## Validation and preservation

Final isolated `npm ci --ignore-scripts` used the unchanged canonical lockfile.
Backend build, typecheck, lint including UI guard, scoped formatting, whitespace,
Compose parity, actual socket smoke, TLS rejection controls and preservation PASS.
Affected Backend/Auth/Transport: **52 suites,890 PASS,15 existing SKIP**. Startup
profile/closed-startup subset:22 PASS, included in that matrix. No full-repository
suite or authenticated SQL test is claimed.

The initial borrowed dependency set lacked canonical pg/types and caused typecheck/
lint failures; the final isolated install resolved them. A first socket assertion
used the wrong port hex and included established incoming sockets as listeners;
corrected listener-only assertion passed. After locked install changed the artifact,
the socket fixture was rerun against the final exact bundle. Earlier observations
remain retained, not overwritten as successful evidence.

Every disposable container auto-removed and exact-name absence was verified. All8
existing container IDs/images/start times/restart counts/networks/ports/isolation,
all5 networks, host addresses/routes/forwarding/sysctls/firewall rules/listeners,
Caddy and deployed Compose stayed unchanged. Firewall normalization excludes only
traffic counters/generated timestamps. Deployed Compose SHA256 remains
`12bc008f6625458ddfdb11e49ba07292f9101d31441187c9e879cadbc1090941`.
No remote persistent files, networks, volumes or images were created; fixture tmpfs
files were removed with their task containers. All cleanup was task-owned only.

Evidence retained at `/private/tmp/otr-r3a3a-host-builder-20261010/`:
source-staging/probe scripts, final socket/TLS/Compose JSON results, prior failed/
borrowed-artifact evidence, final build/test/check logs, and `verification.json`.

- Socket result SHA256: `8669b32a8242b29de8a893db29788528881b1bcbee1ca1b30f1f2760835646e6`.
- TLS result SHA256: `455ba8c623193849f74d3a3aaa64d90412237cea4b405fe91711d317db5dd5fd`.
- Compose result SHA256: `bf896b5484f48971b5b496e09a1b310aecac69f450da4b4832084ab5ed136cf4`.

Hosted H1 and Reader NOLOGIN/PASSWORD NULL are preserved by non-access; remote SQL
values were not re-queried. All CLOSED gates remain unchanged. No HostedDEV/Production
mutation, Reader secret/LOGIN, SQL Driver/Native/Composer/C5/C9/provider activation,
deployment, Simulator/device operation or Git commit/push/merge occurred.

Remaining gate: Independent Review of the dormant eight-path change, then separate
Owner deployment authorization and combined live replacement acceptance.

**STOP — HOST MODE BACKEND BUILDER / INDEPENDENT REVIEW REQUIRED.**

## F1/F2 correction appendix — 2026-10-10

**F1 FIX VERIFIED: YES. F2 FIX VERIFIED: YES. Ready for Targeted Independent Security Recheck: YES.**
These are disposable-fixture and dormant-procedure results, not live isolation or
replacement acceptance. The original Builder report above and Independent Security
Review remain unchanged. Final Owner acceptance and deployment remain NO.

Owner-authorized worktree/base remain
`/Users/xoery/.codex/worktrees/r3a3a-host-backend-builder/otr-mobile-canonical` /
`d2c904efb22090d9a1c51fd1be63a3bb5780c8cc`. The accepted review's two Important
findings were reproduced before correction; no architecture redesign was made.

### Exact correction scope

Only these eight paths change relative to the initial reviewed worktree:

1. `deploy/dev-backend/compose.host.yml`: remove implicit build/tag selection; require reviewed-image input. Standalone startup cannot silently use `dev-backend-backend`.
2. `deploy/dev-backend/compose.host-image.yml`: new single-service forward template; stage a private literal exact reviewed new Image ID. Its placeholder intentionally fails validation.
3. `deploy/dev-backend/caddy-admin-isolation.conf`: new dormant systemd drop-in for caddy-owned0700 RuntimeDirectory, UMask0077 and explicit Unix-address reload.
4. `scripts/dev/backend-host-image-check.mjs`: read-only pre-stop verifier of fully resolved credential-free Compose, exact distinct new/rollback SHA256 IDs, single DEV service/project, host networking, absent build/ports/networks, loopback HTTP and original DEV env-file path. Unexpected environment values are never printed.
5. `scripts/dev/backend-host-image-check.test.mjs`:11 Node controls, including old/tag/wrong-image, bridge merge, wrong project/service/env path, wildcard bind and secret-free error output.
6. `docs/ops/DEV_BACKEND_RUNBOOK.md`: replace the vulnerable future procedure with Caddy prerequisite, literal immutable forward override, safe Compose flags, before-stop guard, started-image attestation and immutable bridge rollback.
7. This Builder report: append only.
8. `docs/CURRENT_IMPLEMENTATION_STATE.md`: correction handoff prefix only.

`server.ts`, startup tests/smoke, original bridge Compose/Dockerfile, accepted
Driver/Reader/Auth/Transport/SQL/Native/Composer, package/lockfiles and accepted
feasibility report retain their original reviewed bytes. No dependency was added.
Original Independent Security Review SHA256 remains
`f8dbc5fcbdc8f2637028dcc68f40c1e7b9dd36acf9125540e2fc2512c4ad7aee`.

### F1 reproduction, choice and actual fixture proof

The unchanged reviewer probe reproduced credential-free live Caddy Admin HTTP200
from a disposable host-network UID10001/cap-dropALL container. Both exact original
Backend-bridge controls returned ECONNREFUSED. GET bodies were not retained and no
live administration mutation was sent.

Actual Caddy2.6.2 runs as UID996/GID988 via the stock file-backed systemd service;
ExecReload uses `caddy reload`, and the existing deployment runbook requires
`systemctl reload caddy`. Admin-off would remove that existing workflow, so it was
not selected. `/etc/caddy/Caddyfile` is a root-owned symlink to
`/opt/otr/caddy/Caddyfile`; the **target** is root:root0644. The symlink's0777 mode
is not evidence of a writable target. Backend has no host bind mounts.

The eventual global Caddyfile directive is:

```caddyfile
admin unix//run/caddy-admin/admin.sock {
    origins localhost ""
}
```

Retain every existing site, HTTPS/certificate/storage directive and upstream,
including127.0.0.1:8787. The installed reload CLI sends an empty Host on Unix
requests; explicit empty/localhost origins retain CLI and operator compatibility.
There is no wildcard origin or TCP Admin listener. Administration isolation relies
on caddy-owned0700 directory/socket permissions and absence from Backend mounts.
Root:caddy0640 target configuration and safe ancestor/symlink ownership are explicit
future prerequisites; no current permissions were changed.

A disposable isolated Linux fixture mounted only the existing Caddy binary read-only.
Synthetic certificate/key/config/state lived only in fixture tmpfs. Its root setup
used CHOWN/SETUID/SETGID/DAC_OVERRIDE/FOWNER/KILL only to create different-UID fixtures,
inspect permissions and stop its own Caddy children. These capabilities are test
initialization, not added to the Backend deployment. Application child UID10001
and separate Backend probes had no privileged access; separate Backend cap-dropALL
and no-new-privileges were retained.

Observed final fixture results:

- Original TCP Admin exposure reproduced with HTTP200 before correction.
- Corrected directory/socket owner996:988 and mode0700. UID10001, even with the same filesystem/socket path, receives EACCES.
- Separate restricted Backend container shares Caddy's isolated network namespace but sees no Admin/config/Docker/containerd filesystem paths. TCP Admin ECONNREFUSED.
- TCP2019 on127.0.0.1,127.0.0.2,::1 and the fixture non-loopback address all ECONNREFUSED; no alternate TCP Admin listener.
- Caddy UID and root operator GET200; actual `caddy reload --force --address unix//run/caddy-admin/admin.sock` PASS. Backend denial remains after reload.
- Real Caddy HTTP and verified synthetic HTTPS preserve health200/protected401/unknown404; HTTPS uses matching SNI and HTTP Host with its public test CA. Application owns exactly127.0.0.1:8787; non-loopback IPv4 and::1 ingress refused.

No live Caddy config change/reload/restart occurred. Applying the drop-in's runtime
directory/umask later requires a separately approved Caddy restart with **all-site
interruption**. Its exact unit/config/mode backup, validation, timeout and rollback
prerequisites are in the runbook. Caddy rollback must first restore any host Backend
to bridge; never reopen TCP Admin while host Backend remains running. Actual combined
host8787 candidate startup remains impossible within this proof without replacing
the current Backend, so it was not attempted.

### Other newly reachable management inventory

Host mode makes host-loopback TCP/UDP and abstract Unix sockets reachable; pathname
Unix sockets do not become mounted automatically. No equivalent unauthenticated
privileged management endpoint beyond the known live Caddy Admin was identified.
The live F1 exposure remains until the separately authorized Caddy prerequisite is
installed. Do not interpret this correction as live deployment safety.

- SSH22: authenticated remote shell, not an unauthenticated administration API.
- Resolver127.0.0.53/.54 TCP/UDP53 and DHCPUDP68: network infrastructure; no management route identified.
- Caddy80/443 TCP and443 UDP: existing public ingress; health/protected-route behavior remains200/401. TCP2019 is the F1 prerequisite above.
- Backend8787: existing Auth checks preserved. OSRM5001 is route computation; malformed credential-free diagnostic paths return400, no management API identified.
- Services8000/8010/8020/8040 (face/index/STT/media): metadata-only source inspection shows secret guards fail with500 if absent and401 if mismatched; all provider/write routes invoke the guard or covered middleware. OpenAPI lacks those custom security declarations and was not treated as proof of unauthenticated writes. No write/provider request was sent.
- LibreTranslate8030: deployed command enables API keys and disables file translation/Web UI; no privileged management route identified. Health remains publicly readable.
- Containerd127.0.0.1:43865: default CRI streaming listener, not the control gRPC socket. Containerd2.2.1 has no configured TCP control/debug/metrics address. Exec/attach/portforward with explicitly invalid nonsecret tokens each return404. [Versioned upstream streaming handler](https://raw.githubusercontent.com/containerd/containerd/v2.2.1/internal/cri/streamingserver/server.go) consumes a cached token before executing; no valid token was obtained or used.
- Root-management pathname sockets, including Docker, containerd, systemd, D-Bus, snapd, LVM, udev and root user/GPG sockets, are inventoried and absent from the Backend filesystem. Docker/socket ownership660 root:docker and containerd660 root:root were checked; no such mount is permitted.
- Abstract `/org/kernel/linux/storage/multipathd` and `ISCSIADM_ABSTRACT_NAMESPACE` are connectable from host-network UID10001. No management command was sent. Installed versions are multipath-tools0.9.4-5ubuntu8.1 and open-iscsi2.1.9-3ubuntu5.4. Their versioned upstream implementations use kernel SO_PEERCRED: [multipath](https://raw.githubusercontent.com/opensvc/multipath-tools/0.9.4/multipathd/uxlsnr.c) allows non-root list operations but denies non-list commands; [iSCSI](https://raw.githubusercontent.com/open-iscsi/open-iscsi/2.1.9/usr/mgmt_ipc.c) requires root. This is source-supported classification, not an executed destructive-command denial or independent certification of distribution patches. Read access and shared-host availability remain host-mode risks.

Refresh the full listener inventory at eventual deployment; unknown or equivalent
unauthenticated privileged control is a STOP condition. No broad host firewall or
unrelated service hardening was performed.

### F2 reproduction and immutable selection

Original reviewer Compose probe again selected `dev-backend-backend`, which still
points to the live old wildcard image
`sha256:d2e512b1841db689ff64948f4663c4660a20fc181914aee3412483a96c84d0f5`.
No live tag was changed. Corrected forward configuration has no build fallback and
requires a literal exact reviewed override plus the pre-stop guard.

A task-only untagged image layered the exact newly built bundle onto the cached
runtime, without pulling, external build networking or dependencies. Its reviewed
fixture ID was
`sha256:4c0704e09286599a6ba22b191c6a904c300aa9813f864142362d2587d102c6a5`.
This is a disposable proof artifact, **not a retained accepted deployment image**.
Actual Compose resolved both forward files with exact image, host network, no ports,
fixed loopback variables and correct absolute DEV env-file path. The final checker
passes that safe actual resolution; missing reviewed input rejects standalone
profile resolution. Actual started fixture `.Image` matches the exact new ID;
its baked bundle passes original socket/health/Auth controls.

Original bridge plus a private literal old-ID override resolves the exact retained
old image, original bridge and127.0.0.1:8787 publishing. Live old Backend/image/tag
remain unchanged. Both directions retain `--no-build --pull never`, explicit
`-p dev-backend`, exact profile paths and service `backend`; no broad down/prune.
Actual deployment-image review, replacement and bridge rollback execution remain
separate Owner gates. The disposable image/container and temporary Compose files
were removed with label/ID/absence checks.

### Validation, preservation and evidence

- Original F1/F2 negative probes reproduced; corrected fixture paths PASS.
- Exact52-file affected matrix:890 PASS/15 existing SKIP; expanded57-file matrix:935 PASS/15 existing SKIP. No failing/new skipped application test.
- Image checker:11/11 PASS, including value-nondisclosure negative; typecheck, lint/UI guard, Backend build, correction-file formatting/whitespace PASS.
- Original actual loopback/non-loopback socket tests pass on the new immutable fixture; actual host-container Direct AAAA/IPv6 TCP/TLS1.3 and wrong-hostname/untrusted-chain negatives PASS. No PostgreSQL StartupMessage, authentication or SQL.
- Existing local/public verified HTTPS health200 and public protected401 PASS. Those live checks exercise the unchanged old Backend; candidate HTTPS proof is isolated.
- Every final fixture compares all8 original containers/5 networks, starts/restarts/images/attachments/ports, host addresses/routes/sysctls, normalized firewalls/listeners and deployed Compose/Caddy hashes. No persistent resource remains; Caddy unit/PID/config/permissions and old tag remain unchanged.
- Final bundle SHA256 equals the original review bundle: `9c9e832aac9e1d7b0d5b4dd38ad3680def55503001c4c3828c2d2a1e4996c326`. Source manifest covers1,329 initial paths; only the declared correction scope differs. Original Builder prefix/review and handoff suffix are preserved.

Evidence directory: `/private/tmp/otr-r3a3a-f1f2-20261010/` (0700), including the
retained original probes, safe final fixtures, manifests, checks and `verification.json`.
Final evidence hashes: Caddy `ac54e0b9e48978510fc99cbb34f5163f816ab8111d8d1968fddc913a9287af4e`;
image `6b6250e37b84882bef62f2b5fa8b2805ff12fa8ed92a69a7df06e1a7a229e6b5`;
TLS `b44dba96084f839bedcb5f987915bbdab7849a178d5a0ae15561051ec3541051`.

### Proof failures and credential-output incident

Intermediate Caddy fixtures failed on synthetic permissions/root child signaling,
Unix CLI Host handling and HTTPS HTTP-Host mismatch; all were confined to task-owned
containers, cleaned and corrected. Final actual fixture passes. No production
application correction was inferred from these harness failures.

**Security incident:** the installed Compose resolves env-file values when using
`--no-env-resolution` alone; only the paired `--no-env-resolution --no-interpolate`
retains metadata safely. The initial image proof returned existing DEV environment
values, and its old assertion printed the DEV secret key in local tool output and
removed fixture logs. It was not a Reader password and was not used to authenticate
or sent to SQL/providers. The initial inherited-file-descriptor experiment was also
replaced with regular task-owned temporary files. Safe paired flags were proved
independently afterward; the final checker rejects unexpected environment names
without printing their values.

Local retained incident evidence was redacted and restricted; the already delivered
tool transcript cannot be erased here. Owner/operator **credential rotation and
retention review is required before any deployment**. No rotation, provisioning,
secret-value reread, Hosted SQL or credential mutation was authorized/performed.
This incident is not hidden by the passing regression result. Application regressions:
NO; operational security incident: YES. It remains an Owner action outside this scope.

No actual Backend/Caddy deployment/replacement, live Caddy reload, Hosted SQL mutation,
Reader LOGIN/password provisioning, Runtime/Composer/C5/C9/provider activation,
device/Simulator operation, commit/push/merge/rebase occurred.

**STOP — HOST-MODE F1/F2 CORRECTIONS COMPLETE / TARGETED INDEPENDENT SECURITY RECHECK REQUIRED.**


## Direct dormant closure/integration attempt — 2026-10-10

**BLOCKED by a material post-cutover credential-selection contract conflict; no closure commit/integration/push performed.** Owner accepted final independent dormant F1/F2 review and explicitly removed the operational incident from the dormant-source integration blocker. Old Modern Key `otr_dev_backend_20260910` deletion is Owner-confirmed; authoritative revocation verification remains PENDING. New active management name `otr_dev_backend_20261010`; authenticated existing-member Ledger bootstrap remains DEFERRED. No completed incident investigation was repeated.

Fresh canonical main/origin/main/remote refs/heads/main all equal `301830c16e633fbc0193113ae9f4642258a9a7f5`. Builder base remains `d2c904efb22090d9a1c51fd1be63a3bb5780c8cc`; canonical advance concerns dormant Reader provisioning and current-state documentation, with no competing Host-mode implementation edit. Original independent history records final dormant0/0/0 and accepted13-path scope. Unrelated dirty checkouts/worktrees/untracked files are preserved.

However, live Backend now intentionally selects private `backend.rotated.env` via the accepted key-cutover override, while `compose.host.yml`, the exact `backend-host-image-check.mjs` contract, its fixture, and forward/Bridge rollback runbook still require original `backend.env`. That original file retains the exposed old credential and must never be selected as rollback. Credential-free reproduction confirmed the accepted guard permits original env and rejects the currently active replacement env; all11 existing guard tests pass, documenting the historical contract rather than resolving this drift.

Owner's explicit STOP condition for a material security-contract conflict applies before commit/integration. Required narrowly scoped correction is to reconcile forward/rollback private env selection with the retained new credential and update its exact guard/tests/runbook; no such unreviewed correction was made. Full application/static rerun and merge are not claimed after STOP. No remote service/private credential operation, Host-mode deployment, Caddy reload, credential/Hosted mutation or Git commit/push/merge occurred. This appendix records the blocker only; original review bytes remain unchanged.

## Credential-cutover compatibility correction and scoped closure — 2026-10-10

**Compatibility FIXED; authorized for dormant source closure/integration only.** Owner authorized the narrow correction after active DEV key cutover. Old Modern key deletion is Owner-confirmed; authoritative revocation verification remains PENDING and, by explicit Owner decision, does not block dormant source integration. Authenticated Ledger bootstrap remains DEFERRED.

Correction scope is only `scripts/dev/backend-host-image-check.mjs`, its tests, and the existing Host-mode section of `docs/ops/DEV_BACKEND_RUNBOOK.md`; this appendix and scoped current-state closure record document it. All accepted Caddy isolation files, immutable Host templates, startup/bind implementation/tests/socket smoke, original Bridge/Dockerfile and Independent Review/F1/F2/final recheck bytes remain unchanged.

Reproduced historical guard acceptance of exposed-original env and rejection of the active rotated env before correction. Corrected guard requires an explicit verified private rotated-file path and exactly one required effective env-file, rejecting original, missing, optional, mixed, stale and unexpected selections in both directions. Default accepted path is supplied explicitly as `/opt/otr/dev-backend/env/backend.rotated.env`; future separately approved rotation can select a verified `backend.rotated.<version>.env` under the same private custody contract. No key value or private file enters Git.

Forward resolves standalone Host profile -> accepted private API-key cutover override -> literal reviewed-new-image override last. This ordering preserves exclusive rotated selection while preventing the credential override's Bridge image pin from superseding the reviewed Host image. Rollback resolves original Bridge -> same private credential override -> exact rollback-image override last. The same guard in explicit `bridge` direction verifies old immutable image, original default Bridge, loopback8787 publishing and no Host HTTP override while retaining rotated selection. Base-only or missing/stale/incorrectly ordered overrides reject before stop. Operator must reverify root0700/0600 regular/singly-linked custody and freeze selection/source identity before any future deployment.

Fresh validation: **33 deployment controls PASS; original52-file application subset890 PASS/15 existing skips; expanded57-file matrix935 PASS/15 existing skips**. Actual DEV Compose2.40.3 resolution, using both credential-safe flags, accepted corrected forward/rollback and rejected missing-forward, conflicting-image-order and missing-rollback overrides. Disposable Caddy/Backend fixture passed same-filesystem UID10001 Unix EACCES, operator GET/reload, alternate TCP Admin refusal, verified synthetic HTTPS health200/protected401 and actual loopback-only socket/non-loopback/IPv6 denial. Fixture auto-removal verified; no persistent fixture resources retained.

Typecheck, lint/UI guard and Backend build PASS. Initial non-escalated build was filesystem-denied before successful authorized rerun; no code changed to obtain PASS. Scoped formatting and whitespace checked. Preservation commitments verify original Independent Review and all unchanged accepted implementation/evidence bytes; original runbook prefix unchanged. Before/after all live container identities/images/start times/restarts/network/ports, Caddy state and every private custody file's inode/size/mtime/ctime/ownership/mode matched. Existing Backend remains healthy with new rotated credential selection; local/public health200 and unauthenticated protected401. No secret value retrieved for diagnostics, no service replacement/reload, SQL/Reader/credential/Production/device/runtime/provider operation occurred.

Closure scope remains exactly the accepted13 paths (startup implementation/test, three Host/Caddy files, three Host guard/socket scripts, runbook/current state and three Host evidence/review reports). API-key handoff/install tools and incident/preparation/cutover reports remain outside this closure commit; their local originals/untracked files are preserved. Canonical main prior to integration is `301830c16e633fbc0193113ae9f4642258a9a7f5`, descended from Builder base; its dormant Reader advance is preserved by ancestry-preserving merge if fast-forward is unavailable. Integration validation/synchronization is reported separately at completion.

Remaining gates: independently reviewed real Host image; live Caddy administration prerequisite/all-site maintenance; separately authorized Host replacement with effective rotated credential, combined host8787/publicIPv4/IPv6/Direct TLS/health and actual pinned rollback/downtime acceptance. Reader NOLOGIN/PASSWORD NULL is untouched by non-access; nonlogging credential custody/provisioning/LOGIN/authenticated Direct/same-lease/live read gates remain separately CLOSED. Authenticated user smoke and authoritative API-key revocation verification remain honestly deferred/pending.


## Owner-authorized live DEV deployment attempt — 2026-10-10

**Final outcome: ROLLED BACK. Host-mode live deployment NOT accepted.** Canonical source remained `3e74628203959022e765fb456cf1ff9b1ccbfb29`; no Git mutation occurred. Exact canonical Git archive (no private env files) built and pinned candidate image `sha256:51432b86743f3a7e24b1523dfe004961a9b0cc89f6b41f6e053af03492c67574` before any service stop. Both effective forward/rollback configurations passed accepted image/rotated-credential/network guards; rollback retained original source/Bridge and image `sha256:d2e512b1841db689ff64948f4663c4660a20fc181914aee3412483a96c84d0f5`. New credential selection stayed exclusively `backend.rotated.env`; exposed original env was never selected or read.

### Caddy change and preservation

Applied the exact accepted Unix Admin global directive and systemd drop-in; preserved existing site/upstream/HTTPS configuration bytes below the new global block. Root-private prior config/unit/metadata backups retained. Caddyfile target now root:caddy0640; `/run/caddy-admin` and socket caddy996:988/0700. Admin TCP absent; actual host UID10001 same-filesystem connect denied EACCES; operator GET200 and systemctl reload through explicit Unix address passed. Caddy is active/running PID3665346. Isolation remains installed after safe Bridge rollback; restoring TCP Admin was unnecessary.

Caddy serves api-dev, ai, media and host-address routes; shared restart impact was explicitly communicated before mutation. Only api-dev availability was sampled; no Production application requests were made. Initial parent-mode staging guard stopped before build (existing safe public release parent0755, unique new release0700). Initial config comparison stopped before any live mutation because Caddy generated a file-server hide entry from the candidate filename. After normalizing that single generated filename, every non-admin setting matched; actual Caddy validation passed. These initial no-mutation stops were preserved, not misreported as successful service operations.

### Single Host-mode attempt and automatic rollback

Exactly one Backend-only Host-mode replacement attempt ran with no build/pull during startup and a120-second deadline. Old Backend was stopped,8787 release verified, then pinned candidate started. It became healthy, exact Host image/network/no publishing verified, actual owned socket was only127.0.0.1:8787 (UID10001), four host non-loopback IPv4 and one global IPv6 ingress probes refused, local/public health200 and protected unauthenticated401 passed. The combined private API/Direct TLS/Admin acceptance probe then returned failure. The candidate was **not accepted**, even though health was green.

Automatic pinned Bridge rollback ran once, retaining the same private rotated env override. It restored a healthy sole Backend and health200/protected401. The controller initially reported BLOCKED/rollback-check failure because its strict raw IPv6 route/address preservation comparison included the Backend's intentionally recreated Docker veth interfaces. Mutation stopped; no second deployment/rollback attempt occurred. Subsequent read-only verification confirmed unrelated containers, networks, non-veth IPv6 routes/interfaces, sysctls and Docker daemon state preserved. Rotated env, private credential override and original env inode/size/mtime/ctime/ownership/mode match earlier evidence. Thus **actual pinned Bridge restoration is verified**, while the original controller failure remains honestly retained. No host-wide networking/firewall configuration command was used; Docker changed only the replaced service's namespace/attachment/publication.

Final running container `fc9f01519e648ac9219bb6f01d36788d56c8f3689f37b891601b55cfacb435f5`, image `sha256:d2e512b1841db689ff64948f4663c4660a20fc181914aee3412483a96c84d0f5`, original `dev-backend_default` Bridge; only127.0.0.1:8787 publication. Config files are original Bridge, accepted private API-key cutover override, and retained literal rollback image override. No exposed-old-env fallback. Final private loaded-key privileged read200, local/public health200 and unauthenticated protected401; actual host non-loopback IPv4/IPv6 connections refused. All task-owned probe containers removed.

### Direct connectivity, limitation and interruption evidence

Read-only diagnostic probes after rollback, using the exact candidate runtime without application deployment, returned privileged API200 and Unix ENOENT/TCP2019 refusal for UID10001. Direct AAAA `2406:da1c:4c7:f800::7dd1`; real IPv6 TCP5432 plus TLS1.3 with approved CA/hostname verified. Wrong hostname rejected ERR_TLS_CERT_ALTNAME_INVALID; empty trust rejected SELF_SIGNED_CERT_IN_CHAIN. Only PostgreSQL SSLRequest/TLS traffic: no StartupMessage, authentication, Reader credential or SQL. These individual diagnostics passed but **do not retroactively pass the failed combined live acceptance probe**; its failure remains unclassified. No further deployment was attempted. Independent external public IPv6 ingress sampling was not performed; host non-loopback refusal/owned socket inspection passed during the candidate run.

Status-only public HTTPS sampling measured unavailable intervals: Caddy restart approximately0.093s (sampling bracket upper0.218s); Host Backend replacement0.652s (upper0.742s); automatic Bridge rollback0.645s (upper0.734s). These are sampled API availability intervals, not continuously measured all-site downtime. Caddy restart through prerequisite acceptance0.565s. Labelled Host attempt bounded approximately35.927–36.109s; labelled rollback approximately25.971s, both within their120-second bounds. Failed requests could502/terminate; no zero-downtime claim.

### Retained evidence and remaining gates

Private live release: `/opt/otr/dev-backend/releases/r3a3a-3e74628203959022e765fb456cf1ff9b1ccbfb29`. Backups/pinned overrides/credential-free configs/results/status-only samples: `/opt/otr/dev-backend/env/r3a3a-host-deployment-3e7462820395` under root-private custody. Local nonsecret evidence0600 beneath0700 `/private/tmp/otr-r3a3a-live-host-20261010`; `final-summary.json` separates original controller result from verified actual state. Original incident/review evidence and protected credentials retained; no deletion/redaction or secret value output.

Another Host-mode attempt needs separate Owner authorization after resolving the combined acceptance probe failure and correcting preservation checks to account for service-owned veth replacement. Live Host-mode acceptance remains OPEN; final Bridge Backend does not certify Direct connectivity from that Bridge namespace. Authenticated existing-member Ledger bootstrap DEFERRED. Old Modern key deletion Owner-confirmed / authoritative verification PENDING. Reader nonlogging custody/provisioning/LOGIN/password, authenticated Direct Primary/same-lease attestation and live reads remain separately CLOSED; TLS/health/API smoke do not prove Reader access. No Hosted SQL/Reader mutation, credential rotation/revocation, Production access, Native/device/Simulator or Composer/C5/C9/provider/business-write activation performed; no full Hosted write/provider audit claimed.

**STOP — DEV HOST-MODE DEPLOYMENT ACCEPTANCE COMPLETE: ROLLED BACK.**


## Owner-authorized Host-mode failure diagnosis — 2026-10-10

**Combined-probe root cause CONFIRMED: malformed acceptance JavaScript, not a
failed Backend/TLS/Admin runtime assertion.** The retained `backend_private_checks`
source in `/private/tmp/otr-r3a3a-live-host-20261010/deploy.py` ends the handshake with
`family:secure.remoteFamily}));})} (async()=>`. It closes the data callback but omits
the outer Promise callback/constructor closure. Correct ending:
`family:secure.remoteFamily}));});});} (async()=>`.

The first actual failure is Node parsing: expected a runnable probe returning
nonsecret JSON with exit0; observed syntax exit1, reproduced locally and using
`docker exec -i otr-dev-backend node --check` on DEV Node v24.21.0:
`SyntaxError: missing ) after argument list`. Syntax checking does not execute source,
read credentials or send requests. Consequently no key/API, DNS, TLS or Admin
assertion inside this invocation ran. The controller's `run()` rejected nonzero
exit before `json.loads`; stderr was discarded, so neither the syntax error nor the
fixed catch message was retained in original output. Earlier startup, exact Host
image/network, socket, local/public health200 and unauthenticated401 checks had passed.
Backend startup, Caddy upstream and namespace failure are not supported causes for
this invocation. Timing/network races remain unproven hypotheses, unnecessary to
explain this failure.

**Timestamp limit:** no per-probe UTC failure event was recorded. Retained status-only
samples bracket the Host-to-rollback phase transition at monotonic8807800.470087662
through8807800.559236329. Mapping with the later host realtime-minus-monotonic offset
1782813682.847582 gives approximately2026-10-10T08:38:03.318Z–08:38:03.407Z. This is a
derived phase-transition interval, not the precise assertion timestamp; intervening
wall-clock adjustment is not excluded. Final controller result mtime is
2026-10-10T08:38:29.376599Z. Original evidence remains unchanged; allowlisted
`failure-diagnosis.json` was added under existing local private evidence custody.

**Minimum correction:** promote the exact original probe with only its missing
closure repaired, equivalent explicit resolve/reject branches, explicit Buffer import
and formatting into `scripts/dev/backend-host-private-smoke.cjs`.
No application, credential, Compose, image, Caddy, SQL Driver or Auth contract change.
Runbook requires pre-stop syntax validation and use of these checked bytes rather
than rebuilding inline source. Five network-free synthetic tests check parsing,
combined success, API rejection, Admin denial failure and wrong-hostname acceptance
failure; all response bodies discarded and synthetic key absent from output.
Together with33 accepted image/credential/network guards:38 PASS. Corrected source
also passes DEV Node24.21 `--check`; scoped ESLint, code formatting, UI guard and
whitespace checks PASS. Original syntax failure and an intermediate synthetic mock
omission after the explicit Buffer import were reproduced, then fixed before the
final passing rerun. No full application matrix/build was repeated for this probe-only
change. These are synthetic
validation, not live Host acceptance or authenticated Ledger smoke.

**Separate confirmed controller defect:** rollback `preserved()` compared raw IPv6
routes/addresses including intentionally replaced service veths, producing a false
rollback failure after healthy Bridge restoration. Prior read-only evidence confirmed
actual rollback and preservation, but dropping every veth is not an acceptable
future fix. Runbook now requires attestation of old/new Backend-owned host-side veths
and exact comparison of all remaining interfaces/routes. That one-time controller
has not been safely rewritten or rerun: original pre-stop peer ownership mapping was
not retained, so retrospective ownership cannot be guessed. Before a retry, its
preservation comparison must implement and test this bounded exception using fresh
service-owned metadata. **Ready for one bounded Host retry: NO until that controller
correction is validated; no further architecture review or incident investigation is
required.** A fresh Owner deployment authorization is still required.

Read-only DEV syntax check observed healthy original Bridge image d2e512b. No live
redeployment, Caddy reload, credential selection/change, unrelated service operation,
Hosted SQL/Reader LOGIN or runtime activation. Authenticated Ledger smoke remains
DEFERRED; old-key deletion Owner-confirmed / authoritative verification PENDING.
Original independent reviews/rechecks unchanged. Prior live-attempt documentation is
preserved as historical evidence. Scoped correction integration changes only two
probe files, runbook and incremental Builder/current-state evidence.

**STOP — HOST-MODE FAILURE DIAGNOSIS COMPLETE.**


## Owner-authorized veth preservation correction and bounded retry — 2026-10-10

**Guard correction PASS; live retry result recorded below after execution.** Before
replacement, Backend container `fc9f01519e648ac9219bb6f01d36788d56c8f3689f37b891601b55cfacb435f5`
endpoint `6d1c97bf13fcaa276eab4f72de707c46407e24d8ad54a270ac320a0331f432ae`
on network `ef4d1e4c04f66ff8018c3cb71f8231aa3032365febabab5e0dd662cee94523c1`
is independently correlated with eth0 MAC8a:01:e2:b3:70:da, IP172.18.0.2 and reciprocal
peer indexes2/393. Host peer is `veth8d87235`, master `br-ef4d1e4c04f6`; distinct
network namespace inodes verified. Two collection passes confirm stable ownership.

New standard-library-only `backend_host_network_guard.py` accepts only that attested
service attachment removal and a freshly attested Bridge replacement endpoint.
It compares every unrelated container/endpoint/interface/address, IPv4/IPv6 route,
Docker network/config/daemon and host/per-interface forwarding/config setting.
Only kernel link-local/multicast routes and sysctls of attested old/new veths are
excluded. Sole-port bridge carrier/route linkdown follows the port lifecycle; all
configured bridge properties stay exact. Docker's three exact8787 loopback publication
rules may disappear for Host mode and return for pinned Bridge rollback. Unrelated
firewall rules/policies stay exact; counters/comments are operational metadata, not
configuration. No broad veth exclusion or host network/firewall mutation is allowed.

Five Python tests include positive ownership, Host removal and Bridge recreation,
plus11 unrelated drift cases and two ownership negatives. All PASS. The actual
nonsecret DEV snapshot also passes a synthetic Host-transition check. Corrected
combined probe and33 image/credential controls:38 PASS. Python compile, scoped ESLint,
UI guard and whitespace PASS. No application/build input changed, so accepted image
51432b8 remains applicable once its exact build-input identity is reverified against
integrated canonical. No full application matrix or real authenticated Reader test
is claimed. Independent reviews, accepted probe, Caddy/Compose/application sources,
rotated credential and original incident evidence unchanged.

Scope: only guard/test, runbook, this appendix and incremental current-state handoff.
Normal scoped integration precedes one Owner-authorized120-second maintenance attempt;
Caddy isolation already active, so no Caddy restart/reload is planned. Exact prior
Bridge image d2e512b plus exclusive rotated credential remain rollback inputs.


### Bounded live retry result — ROLLED BACK / 2026-10-10

Canonical main/local/origin/remote synchronized at
`63ea4951be1f21290c077b9c0bde4a1d89bd01ec`. All Dockerfile/COPY/package application
build inputs are byte-identical to accepted3e74628; the existing pinned Host image
`sha256:51432b86743f3a7e24b1523dfe004961a9b0cc89f6b41f6e053af03492c67574`
was reverified against the canonical input manifest and original private release.
Exclusive rotated env and both effective immutable forward/Bridge rollback guards
passed. Caddy existing config/drop-in/socket/operator state verified, with no reload
or restart. Before any service operation, a one-time controller parity comparison
incorrectly included the Bridge-only build stanza and stopped. It was restored to
the accepted comparison; exact no-service-attempt state and staged-image files were
verified before resuming. This no-mutation stop is retained separately and does not
represent another deployment attempt.

Exactly one Host-mode attempt started at09:26:47.399UTC. Candidate reached healthy
status with reviewed image, host namespace, no published ports/mounts and UID10001.
Owned listener127.0.0.1:8787 only; four non-loopback IPv4 and one IPv6 ingress probes
refused. Local/public health200, protected401, new-key privileged read-only API200,
Caddy Unix denial/operator200 and TCP Admin absence passed. The corrected **combined
live probe actually PASS**: Direct AAAA2406:da1c:4c7:f800::7dd1, IPv6TCP5432,
TLS1.3/verified chain+hostname, wrong-hostname and empty-trust negatives rejected,
Backend Unix ENOENT and all three alternate host-local TCP Admin addresses refused.
No SQL StartupMessage/authentication, Reader credential or business write occurred.

Mandatory preservation then failed at **2026-10-10T09:27:17.970635+00:00** with exact assertion
`UNRELATED_INTERFACES`: expected canonical equality of all host interface metadata
after the exact attested service-veth exclusion/sole-bridge carrier normalization;
observed inequality. **Live Host guard acceptance BLOCKED**, despite passing
synthetic tests. The controller did not persist the failed Host snapshot before
rollback; the differing interface/field cannot be established from retained evidence.
Do not infer a benign carrier issue or certify absence of transient unrelated drift.
No guard weakening or speculative infrastructure correction was performed after
failure, and no second live retry occurred.

Automatic pinned Bridge rollback **PASS**, including freshly attested endpoint
f901299c87f986565b35b956a405369284983a23c0693365f7ab23e61ce5c0e9, vetha3fdb9b/395,
reciprocal peer2, same network/IP and rotated credential. Full rollback preservation
PASS for unrelated interfaces/addresses/routes/endpoints/containers, firewall,
forwarding/host settings and Docker daemon/networks. Final container
`4cbe1a22487a00bb76bfb771aec87d7d95d1cd893c4a4ded636850dd2b5f0197`, image
`sha256:d2e512b1841db689ff64948f4663c4660a20fc181914aee3412483a96c84d0f5`, healthy `dev-backend_default`, only127.0.0.1:8787 publishing.
Local/public health200, protected401 and a final private Backend API read200. Caddy
PID/config and private rotated-env/override metadata unchanged. All protected original
incident evidence and unused candidate custody retained; no exposed old-key fallback.

Complete maintenance attempt including rollback52.013s, within120s. Sampled forward
HTTPS unavailability0.772s (bracket upper0.863s), rollback0.829s (upper0.920s).
The original aggregate26.413s spans the healthy interval between those outages and
is **not continuous downtime**. Status-only samples, pre-stop stop, source/hash
manifest and final verification remain0600 under local0700
`/private/tmp/otr-r3a3a-host-retry-20261010`; remote root-private results/baselines/pinned
overrides under `/opt/otr/dev-backend/env/r3a3a-host-retry-63ea4951be1f`.

Host-mode **ROLLED BACK**, not accepted; another attempt requires separate Owner
authorization and actual failed-interface evidence/guard resolution. Authenticated
Ledger bootstrap remains DEFERRED. Authoritative old-key revocation verification
PENDING (Owner-confirmed deletion); Reader NOLOGIN/PASSWORD NULL preserved by
non-access, with provisioning/LOGIN/password/authenticated Direct/same-lease/live read
and runtime gates CLOSED. No Production, Hosted SQL mutation, Native/device,
Composer/C5/C9/provider operation or force/unrelated Git change.

**STOP — R3-A3A HOST-MODE RETRY COMPLETE: ROLLED BACK.**


## Owner-authorized network preservation diagnosis — 2026-10-11

**Original root cause UNKNOWN; exact DEV mismatch field UNKNOWN. Diagnostic coverage
PASS, strict guard retained.** The retained failed controller asserts
`links(before) == links(after)` after canonical JSON sorting. It failed
UNRELATED_INTERFACES at2026-10-10T09:27:17.970635Z. Expected/observed Host snapshot was
not saved: its `after.json` write occurred only after all checks passed, then rollback
replaced the in-memory after snapshot. Retained before and restored-Bridge snapshots
cannot reconstruct a transient Host-state field difference. No live transition,
Backend/Caddy operation, remote credential operation or Hosted access occurred here.

The collector uses `ip -j link` plus only detailed `linkinfo.info_kind`, not statistics
mode. Exact compared fields in retained schema are address, broadcast, flags, group,
ifindex, ifname, link_index, link_netnsid, link_type, linkinfo.info_kind, linkmode,
master, mtu, operstate, qdisc and txqlen. Counters/timestamps were not collected.
Backend-owned old/new peers are excluded after attestation; the own bridge drops
LOWER_UP and operstate only after explicit carrier/admin checks. All remaining fields
stay exact, including bridge flags and unrelated interface indexes/namespace indexes.
Their possible lifecycle sensitivity is not permission to ignore them. A synthetic
NO-CARRIER flag case reproduces `/interfaces/<Backend bridge>/flags` with ownership
backend_bridge, but **does not prove that field caused the original DEV failure**.
No speculative normalization/correction was made.

Change limited to diagnostics in existing `backend_host_network_guard.py`, immediate
tests and runbook/evidence. `preserved()` still evaluates the same equality and raises
the same assertion. An optional callback supplies at most32 field mismatches with
safe expected/observed values, presence/index and ownership, with count/truncation.
Fixed known interface fields/value shapes only; arbitrary unknown attributes/values
redact. `preserved_with_evidence()` writes/fsyncs safe expected/observed interface
projections (at most128 per snapshot, explicit truncation, total byte cap256KiB) under
owner0700 custody to exclusive0600 files before checking. It writes/fsyncs mismatch
output before raising, so rollback entry can consume already durable evidence. No
raw container environment/credential/request/business payload enters diagnostics.
Prior evidence is not overwritten, redacted or deleted.

Prepared, compiled the existing one-time controller with both preservation calls
changed to that wrapper and mismatch emission before automatic rollback. Public
source retained at
`/private/tmp/otr-r3a3a-network-diagnosis-20261011/remote-controller-instrumented.py`,
SHA256 `c8f6723042f3ad7f073f0bc408d983edc9f9f4daece3b74ddb567da20b1da854`. It was **not executed** and is not deployment authorization;
future payload/attestation/source inputs must be refreshed and frozen under a new
Owner-authorized attempt. Controller source/order checks and the tested wrapper
confirm evidence is available before rollback begins, including failure paths.

Validation:11 Python tests PASS locally and in a disposable network-disabled,
read-only Linux container with all capabilities dropped and no host mounts. Tests
cover expected Host/Bridge lifecycle, existing unrelated drift negatives, exact
field paths/ownership, indices/namespace attributes/presence, NO-CARRIER diagnostic,
redaction/truncation, custody, non-overwrite and evidence available at rollback entry.
All38 accepted immutable-image/credential/combined-probe tests PASS. Python and
prepared-controller compile/order checks and git whitespace PASS. Initial Docker
mount sharing and native namespace/peer commands failed before a usable kernel
snapshot; available image uses BusyBox ip, not the DEV iproute2 collector. Native
kernel/iproute2 reproduction is **not certified**; synthetic fixtures are identified
honestly. Every task-owned container removed. No full Platform regression/security
review, application rebuild or independent review rewrite was performed.

**Ready for one instrumented retry YES, only after separate Owner authorization.**
The missing evidence is precisely the failed Host normalized interface field/value
pair, with its interface name/index and ownership before rollback. Proposed attempt
uses fresh reciprocal current Backend endpoint/veth attestation, unchanged immutable
Host/Bridge guards and exclusive rotated credential, current Caddy isolation, the
checked combined probe and new durable diagnostic wrapper. Capture diagnostics
before auto-rollback on any failure; do not accept a failed guard or retry repeatedly.
No actual Host-mode acceptance is claimed. Current healthy Bridge and protected
credential/Caddy are preserved by non-operation, not a new live acceptance test.
Reader/runtime gates CLOSED; authenticated Ledger smoke DEFERRED; old-key deletion
Owner-confirmed / authoritative verification PENDING.

Scoped integration includes guard/test, runbook and incremental Builder/current-state
records, preserving the previously uncommitted retry outcome bytes. No unrelated
worktree/untracked files or original review bytes changed.

**STOP — NETWORK PRESERVATION DIAGNOSIS COMPLETE.**


## Final instrumented Host-mode retry — 2026-10-11 NZ / ROLLED BACK

One Owner-authorized attempt ran against canonical
`a95348ab1fe929617485d559b38d90149eeaa2a5`. Exact accepted controller SHA256
`c8f6723042f3ad7f073f0bc408d983edc9f9f4daece3b74ddb567da20b1da854` and handoff
hash verified. Canonical/actual remote main matched, Docker image build inputs
unchanged from reviewed release3e74628; pinned Host image
`sha256:51432b86743f3a7e24b1523dfe004961a9b0cc89f6b41f6e053af03492c67574`
and Bridge rollback image
`sha256:d2e512b1841db689ff64948f4663c4660a20fc181914aee3412483a96c84d0f5`
verified before stop. Fresh reciprocal endpoint/veth ownership was attested.
Both effective Compose guards selected exclusively backend.rotated.env through
accepted private override. Rotated credential metadata and Caddy state matched
prior accepted evidence. Eleven diagnostic tests and combined-probe syntax PASS.
No source, deployment-contract or guard correction was made during this attempt.

Host startup and live assertions PASS: sole healthy exact pinned Host image, no
published ports, HTTP127.0.0.1:8787 only; four non-loopback IPv4 and one IPv6
connection attempts ECONNREFUSED; local/public HTTPS health200, protected401;
privileged new-key read-only API200 (body discarded). Direct Primary AAAA
2406:da1c:4c7:f800::7dd1 TCP5432/TLS1.3 with hostname/chain verification PASS;
wrong hostname and untrusted chain REJECTED, no SQL authentication. Caddy routing
PASS, operator Unix Admin200, same-filesystem Backend UID EACCES, in-container
Unix socket ENOENT, TCP Admin DENIED/absent. Caddy was not reloaded/restarted.

**Mandatory guard failed; Host-mode NOT accepted.** At
2026-10-10T17:03:16.542952Z, UNRELATED_INTERFACES contained exactly one mismatch:

- Path `/interfaces/br-ef4d1e4c04f6/flags`, expected/observed ifindex44.
- Expected normalized flags `[BROADCAST, MULTICAST, UP]`.
- Observed normalized flags `[NO-CARRIER, BROADCAST, MULTICAST, UP]`.
- Ownership `backend_bridge`, not an unrelated interface. Old attested Backend
  4cbe1a22487a00bb76bfb771aec87d7d95d1cd893c4a4ded636850dd2b5f0197,
  endpoint f901299c87f986565b35b956a405369284983a23c0693365f7ab23e61ce5c0e9,
  vetha3fdb9b/395; new Host attachment null as expected.

The exact NO-CARRIER mismatch is now CONFIRMED for this attempt. The controller
rejects an extra carrier flag on the vacated Backend bridge; the earlier failure
had no retained snapshot and cannot retrospectively be certified. Strict checks
were not weakened. Remaining Host preservation checks after this first assertion
were short-circuited and are not claimed PASS.

Durable safe interface projections and mismatch were written/fsynced under root
0700 `/opt/otr/dev-backend/env/r3a3a-host-retry-a95348ab1fe9`, before rollback began
2026-10-10T17:03:16.543210Z. Final read-only verification confirmed diagnostic
files root-owned0600 and exact retained hashes. Host mismatch SHA256
`95f36c7bf6c42352335a609ab5a13234f5bf5a2ab52ba418b18ee23b8f53c9a5`;
Host interface projection SHA256
`7360ea8057b2e7a9db640ad7184d48dde6ec69b4d2c406463aabfaa96a33e4a1`.
Original snapshots/result/status-only timing retained privately; no credentials,
tokens, private response payloads or resolved secret environments displayed.
Local metadata evidence under owner0700
`/private/tmp/otr-r3a3a-instrumented-host-20261011`, files0600.

One automatic pinned Bridge rollback PASS. Live Backend
`f8703bb976d44ce98aa266724d151667d8e1de6c3436115d62e3f897081b218a`,
network dev-backend_default, rollback imaged2e512b, published only127.0.0.1:8787.
Fresh veth68ed7a9/397 attested; full rollback unrelated interface/container/endpoint,
route/firewall/forwarding/Docker-daemon preservation PASS. Unrelated listeners,
Caddy process/configuration and private credential metadata unchanged. Rollback
local/public health200, protected401; final private read-only API200. No exposed
old credential selection, host-wide network modification or second retry.

Whole maintenance including rollback51.735s, under120s. Status-only sampling
observed forward outage0.655s (bracket upper0.747s) and rollback outage0.755s
(upper0.846s), approximately1.410s combined observed /1.593s combined bracket
upper; sampled estimates, not exact continuous downtime. Aggregate26.180s spans
a healthy interval and must not be reported as a continuous outage.

Reader NOLOGIN/PASSWORD NULL and Runtime/Native/Composer/C5/C9/provider gates
preserved without provisioning/activation or Hosted SQL mutation. Authenticated
Ledger bootstrap DEFERRED, not PASS. Old API key deletion Owner-confirmed,
authoritative verification PENDING. Any carrier-guard correction and another
live retry require a new Owner direction; current state remains healthy Bridge.
Only this report/current-state evidence updated, uncommitted; canonical unchanged.

**STOP — R3-A3A INSTRUMENTED HOST-MODE RETRY COMPLETE.**

## Attested Backend bridge NO-CARRIER correction — 2026-10-11

Retained Host mismatch hash and fresh read-only ownership verified: approved
dev-backend_default network ef4d1e4c04f6 has only Backend f8703bb9 attached;
reciprocal veth68ed7a9/397 is its sole bridge port. Exact bridge44 remains
br-ef4d1e4c04f6. Credential metadata/Caddy match accepted prior baseline.

Correction limited to the existing carrier normalization: on the attested bridge,
NO-CARRIER may appear only when no ports remain, after the existing UP, operstate
and LOWER_UP checks. Strip that empty-port carrier flag only; active bridge
NO-CARRIER rejects. All other flags, bridge fields and unrelated interfaces remain
exact; routes/firewall/container/address/daemon comparisons unchanged. Existing
exclusive diagnostic persistence before rollback is unchanged. No controller
redesign, application/credential/deployment configuration or review bytes changed.

Twelve Python tests PASS, including empty bridge carrier lifecycle and unrelated
bridge/interface, extra flag, MTU/index, active carrier and shared-port negatives;
existing rollback/route/address/firewall/ownership drift and custody diagnostics
retained. All38 immutable credential/image and combined probe tests PASS.
One live deployment result will be appended after scoped normal integration.

### Single live deployment result — ROLLED BACK / 2026-10-11

Correction integrated by normal fast-forward/push at
`53cf315a6b65580548ce61be10506e04afa8fb7a`; local/origin/actual remote main agreed.
Only five scoped paths committed: existing carrier guard/test, DEV runbook, Builder
report and current-state handoff (including prior instrumented outcome). Original
independent review unchanged. Unrelated untracked CP15B evidence preserved.
Compile/controller persistence order and whitespace PASS; runbook/current-state
formatting PASS. Builder formatting has pre-existing extra blank lines at accepted
a95348a; historical bytes preserved rather than broadly reformatted. No application
source/build-input changes or full Platform test rerun.

One attempt used unchanged accepted diagnostic controller, pinned Host51432b8 and
Bridge d2e512b images with verified original build/deployment input hashes and
exclusive backend.rotated.env selection. Caddy Admin prerequisites PASS.
Fresh before Backendf8703bb9/veth68ed7a9/397 attested to sole approved bridge port.

**Carrier correction PASS in live evidence.** br-ef4d1e4c04f6/index44 transitioned
from `[BROADCAST,MULTICAST,UP,LOWER_UP]`, operstateUP, to
`[NO-CARRIER,BROADCAST,MULTICAST,UP]`, operstateDOWN. MAC, broadcast, MTU1500,
index, kind, group, qdisc and linkmode unchanged. Interface/address/route comparisons
completed successfully before the subsequent container assertion. Root0600 durable
Host projection SHA256
`e758fd603d616e2964d4ca62a1df048f1c739adc28241f943373a331d26550ed`
under root0700 `/opt/otr/dev-backend/env/r3a3a-host-retry-53cf315a6b65`.

All functional live checks PASS: sole healthy pinned Host image/no published ports,
HTTP127.0.0.1:8787 only, four IPv4/one IPv6 non-loopback ECONNREFUSED, local/public
health200, protected401, privileged new-key read-only API200. Direct Primary
IPv6 AAAA/TCP5432/TLS1.3 verified hostname/chain; wrong hostname and empty trust
rejected, no SQL authentication. Caddy routing/operator Admin200 and Backend
EACCES/ENOENT/TCP Admin denial PASS; no Caddy reload/replacement.

**Host-mode NOT accepted.** Next mandatory assertion UNRELATED_CONTAINERS failed
at 2026-10-10T17:13:13.155983+00:00. Guard remained fail-closed; no exception was added or second attempt
made. Exact differing container/field UNKNOWN: accepted diagnostic controller
persists interface inputs before rollback but does not persist the failed Host
container snapshot or container-specific mismatch. Fixed assertion/timestamp were
emitted before rollback and retained in private result/output; this does not meet
field-level container failure evidence. Do not infer benign drift or retrospectively
claim whole Host preservation PASS. Remaining comparisons after that assertion
were short-circuited. No speculative correction or extra diagnosis performed.

Automatic pinned Bridge rollback PASS within51.672s total maintenance. Healthy
sole Backend34f1cc63293512f00c733e0cbf0fb68cb2115b9befa21acce6aa33d496bf836c,
Bridge dev-backend_default/imaged2e512b, only127.0.0.1:8787 publication, fresh
veth843c276/399 attested. Full rollback interface/container/endpoint/route/firewall/
forwarding/Docker-daemon preservation PASS; unrelated listeners, Caddy process/
config and rotated credential metadata unchanged. Local/public health200,
protected401 and final private read-only API200 PASS. Exposed backend.env never
selected. Status-only observed outages0.860s forward and0.556s rollback, respective
bracket upper0.951s/0.648s; sampled total1.416s /combined upper1.599s. Aggregate
26.054s includes a healthy interval and is not continuous downtime.

Local evidence0700 `/private/tmp/otr-r3a3a-carrier-deploy-20261011`, files0600;
original historical evidence preserved. No secrets/tokens/private payload output.
Reader/Runtime/Native/Composer/C5/C9/provider gates CLOSED. Authenticated Ledger
bootstrap DEFERRED; old-key deletion Owner-confirmed, authoritative verification
PENDING. Final outcome/current-state edits remain uncommitted; canonical53cf315.
Further container diagnosis/retry requires new Owner direction.

**STOP — R3-A3A HOST-MODE DEPLOYMENT COMPLETE: ROLLED BACK.**

## Container preservation diagnostics — 2026-10-11 / NO LIVE DEPLOYMENT

Original failure remains UNRELATED_CONTAINERS at2026-10-10T17:13:13.155983Z.
Existing failed Host container snapshot was not retained. Before/rollback snapshots
cannot establish the transient differing field; root cause UNKNOWN. No false-positive
correction or preservation exclusion was introduced. Current healthy pinned Bridge,
rotated credential and Caddy left untouched; no DEV access or live probe in this task.

Exact existing container comparison fields: id, image, status, health, pid, network,
ports, labels, networks, mounts, user. Full nested dictionaries/lists participate,
including endpoint IDs/IP/MAC/gateways/aliases, Compose labels, mount metadata and
HostIp/HostPort. Docker environment/secret values, logs, health output and resource
counters are not collected. Only old and replacement Backend IDs are excluded.
PID/status/health changes therefore reject, as do image/endpoint/port/mount/label
changes and unrelated deletion. No restart exemption or health-volatility exclusion.

Diagnostic-only correction adds sanitized container input evidence and common
bounded field differences for containers, Docker networks, addresses/routes,
firewall, sysctls and daemon. Original comparison operands/order/assertion codes
remain; canonical address/route string equality preserved (including1 versus1.0).
Known metadata shapes/IDs/enums/IP/ports only, unknown fields/values redact. Container
records report ID, name/name_source, ownership, field path, presence/type and safe
expected/observed values. Name was absent from original collector; prepared future
controller adds Docker.Name, unknown names redact. Validation/ownership/carrier/
publication failures persist code plus clearly labelled validation_context rather
than claiming exact normalized mismatch operands. Interface diagnostic behavior
retained. Inputs and mismatch use owner0700/exclusive0600/non-overwrite/fsync custody.
Common diff capped32 rows/4096 nodes/128 keys or list items, projections depth12/
128 keys/32 list items; explicit truncation and256KiB file cap. Redacted unknown-key
collisions marked; no arbitrary labels/mount paths/firewall rules or daemon text output.

Prepared existing one-time controller at
`/private/tmp/otr-r3a3a-container-diagnostics-evidence/remote-controller-instrumented.py`,
SHA256 `ff2314e904d0ba4bd9c57934364ad157dbe087bc5f722f714e9f80ec13d90a02`. Not executed live. It collects nonsecret Docker.Name and writes/fsyncs
fixed phase/assertion/timestamp before rollback for outer assertions; snapshot
mismatches are already durable when it emits them. Outer assertion metadata is not
field-level operand evidence. Controller evidence-write failure records FAILED and
still attempts safe rollback; it never authorizes acceptance. No redesign/deployment.

Validation16 Python tests PASS (temporary disposable fixture/evidence directories),
including container image/PID/network/port/status/health/deletion failures, normalized
paths/identity/name/ownership before rollback, all remaining comparison categories,
validation fallback, bounds/truncation, absent-vs-null, secret sentinel redaction and
canonical numeric distinction. Existing Host/Bridge replacement lifecycle and all
unrelated carrier/interface/endpoint/route/firewall drift negatives retained. All38
immutable-image/rotated-credential/combined-probe tests PASS.250 deterministic old/new
outcome comparisons PASS. Python/prepared-controller compilation, persistence order,
whitespace and review preservation PASS; runbook/current-state formatting checked.
Historical Builder formatting extra blank lines preserved. No full Platform matrix,
native transition or new DEV Host attempt; synthetic fixture evidence labelled.

Ready for one instrumented retry YES only under separate Owner authorization with
fresh baseline/pinned images/rotated selection and this prepared diagnostic source.
Exact historic differing container field UNKNOWN; no benign-drift inference. Reader/
Runtime/Native/provider gates CLOSED; Ledger member smoke DEFERRED; authoritative
old-key revocation verification PENDING. Scoped paths: guard, immediate tests,
runbook and Builder/current-state records including previous uncommitted outcome.

**STOP — CONTAINER GUARD DIAGNOSTIC FIX COMPLETE.**

## Firewall preservation diagnosis — 2026-10-11 / NO LIVE RETRY

Actual canonical/remote base1ed959ad7f6efe4aead2fcd825a8b58212b2e96e verified.
Latest one attempt rolled back with UNRELATED_FIREWALL4 at22:15:35.447647UTC;
functional Host checks and earlier container/network/interface/address/route
comparisons passed. Latest rollback/full preservation/API200 passed; no historic
container false-positive conclusion. Private outcome retained at
`/private/tmp/otr-r3a3a-container-retry-20261011/HOST_MODE_INSTRUMENTED_RETRY_RESULT.md`.

Read only approved remote root-private retained files through pinned SSH. Original
mismatch hash b7c12ce4401160c468be50ab4a2440e989293eda3ab3bdbf65e6824fb02c8b15
verified. Expected index15 is raw/PREROUTING rule13, targetDROP, referencing the
attested Backend bridge and address. Same position in retained original unfiltered
snapshot. Public structural fingerprint
`e918aed939c0e8efe750aa86a89b9215c8c74a0b5a331f7e9e4bc2a71d35d780` excludes raw
selector/comment values. Docker-owned Backend ingress lifecycle is a candidate,
not proven ownership or a permitted exception. Observed rule/value UNKNOWN: failed
Host after.json, raw firewall inputs and normalized operands were not retained.
Insertion/deletion/replacement/reorder/normalization cannot be established from
redacted positional output. **Root cause UNKNOWN; no policy correction made.**

Diagnostic-only correction: persist complete raw firewall inputs and exact failed
normalized operands privately (owner0700/exclusive0600/fsync/non-overwrite) before
rollback. Public firewall edit ranges replace32 positional cascades; classification
uses exact raw normalized list identity/order. Only public structure is fingerprinted,
never secret-bearing values. Rule metadata table/known chain/normalized position/
target/policy, Backend-reference booleans; unknowns redact.32 edit ranges,8 rules
per side,2048 analyzed lines,256KiB files, explicit truncation with complete private
operands for trusted replay. Bounds fail closed, not PASS. No arbitrary raw operand
contents in output or Git. Current retained historical evidence unchanged.

Corrected None-identifier ownership bug: non-container rows are unattested, not
backend-owned by matching null attachment. Docker-chain/reference hints do not
attest management ownership. Reviewed other predicates: all normalized comparison
failures now retain exact private operands before bounded public diffs; validation
failures still report code/context, not proof of a particular operand. Skip equal
subtrees during diff traversal while preserving canonical numeric distinction;
original equality/assertion order and all Backend peer/carrier/publication exclusions
unchanged. Prepared accepted controller ff2314e9 calls this wrapper in both paths;
its source unchanged, compiled/order-checked, not executed in this task.

Validation22 Python tests PASS: allowed exact Backend publication lifecycle/counter
normalization; unrelated INPUT/FORWARD/DOCKER-USER/policy drift rejects; edit/reorder/
delete/replace metadata, >128-rule shift gives one precise edit, sensitive synthetic
comment retained only privately, None ownership rejected. Existing lifecycle,
container/route/carrier/redaction/custody tests retained.38 image/credential/probe
controls PASS;250 old/new outcomes identical, compile/whitespace/review preservation
PASS. Disposable fixtures only; no native or live transition. Runbook/current-state
formatting checked, historical Builder extra blank lines preserved.

Ready for one bounded instrumented retry YES only with separate Owner authorization,
fresh pinned-image/rotated-credential rollback baseline and complete private firewall
input/operand capture. That is the missing evidence needed to prove actual lifecycle
or unrelated policy change. No broad Docker-ignore or new firewall allowance.
Healthy Bridge/Caddy/rotated credential untouched; no firewall/network/daemon/SQL/
credential mutation, Production/device/Reader/Runtime/provider activation. Member
Ledger smoke DEFERRED; authoritative old-key verification PENDING. Scoped files:
guard/tests, runbook, Builder/current-state. No full Platform matrix repeated.

**STOP — FIREWALL PRESERVATION DIAGNOSIS COMPLETE.**
