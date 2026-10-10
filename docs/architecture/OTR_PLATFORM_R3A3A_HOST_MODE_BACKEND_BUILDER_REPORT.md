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
