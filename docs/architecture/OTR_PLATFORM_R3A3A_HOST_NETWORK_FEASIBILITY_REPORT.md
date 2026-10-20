# R3-A3A Host Networking feasibility report

Observed 2026-10-10, 03:35:53–03:35:59 UTC. Owner-authorized read-only platform
inspection and one disposable, non-authenticated connectivity probe.

**Direct IPv6/TLS: PASS. Current Backend deployment readiness: NO.** Host networking
works without a global toggle on the actual DEV host. Deploying the Backend unchanged
would remove its current loopback-only ingress boundary.

| Requested result                           | Finding                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host Networking supported                  | **YES** — native Linux Docker Engine                                                                                                                                                                                                                         |
| Already enabled / available                | **YES** — existing host driver/network; successful namespace-sharing probe; Backend itself remains on bridge                                                                                                                                                 |
| Disposable container Direct IPv6/TLS       | **PASS**, including hostname and chain rejection controls                                                                                                                                                                                                    |
| Impact on current Backend deployment       | **None applied.** A future host-mode replacement changes network isolation, DNS and port semantics; current wildcard bind is unsafe to carry over unchanged.                                                                                                 |
| Minimum change required                    | Backend-only host mode, remove published-port mapping, explicitly bind HTTP to `127.0.0.1:8787`, and replace the existing container during a bounded service interruption. No SQL Driver or host-wide network policy change is required for the proven path. |
| Ready for bounded deployment authorization | **NO** — loopback bind correction and exact deployment/rollback candidate are not implemented or validated. Connectivity feasibility is ready for Owner review.                                                                                              |

## Actual platform and current deployment

The Backend is on remote DEV host `178.105.151.143`, Ubuntu 24.04.4 LTS,
Linux `6.8.0-124-generic`, x86_64. Docker Engine is **29.1.3**, API 1.52;
containerd 2.2.1, runc 1.3.4. Security options include AppArmor, default seccomp
and cgroup namespaces. This is native Linux Engine, not the operator Mac's Docker
Desktop or Colima daemon.

Docker advertises the `host` network driver. Existing network `host`, ID
`f8280321e426c422659bad781d366e92b179182bb8375cc169c6b47d8a782878`, has driver
`host`. Its `EnableIPv6=false` IPAM metadata does not disable the shared host IPv6
stack: the probe shares host network namespace `net:[4026531840]` and successfully
uses host address `2a01:4f8:c015:e49c::1` and the IPv6 default route via `fe80::1`.
No feature setting, daemon restart, bridge creation or forwarding change was needed.

The [Docker host driver documentation](https://docs.docker.com/engine/network/drivers/host/)
confirms native Linux support and shared network namespace semantics. Its Docker
Desktop 4.34+ opt-in setting and apply/restart requirement do **not** apply to this
DEV host. No Desktop settings were inspected or changed.

Existing Backend:

- Container `otr-dev-backend`, ID
  `97d4954ee40a7ca67d1e1d27bf01a1df1505512dfe287a8d1acef493c31dd32a`;
  start time `2026-10-07T23:43:21.620276792Z`, restart count 0.
- Sole network `dev-backend_default`; IPv4 `172.18.0.2/16`, gateway
  `172.18.0.1`; no global container IPv6 address/gateway.
- Published mapping `127.0.0.1:8787:8787`. Read-only root, `/tmp` tmpfs,
  no-new-privileges, 384 MiB memory limit and existing restart/logging policy.
- Actual network-namespace socket inspection: HTTP listens on **`0.0.0.0:8787`**;
  Docker embedded DNS also listens at `127.0.0.11` in that namespace.
  The local `backend/src/server.ts` independently specifies the same wildcard bind.
- Deployed Compose path `/opt/otr/dev-backend/source/deploy/dev-backend/compose.yml`,
  SHA256 `12bc008f6625458ddfdb11e49ba07292f9101d31441187c9e879cadbc1090941`.
  No environment file or credential value was read.

## Disposable proof

Exactly one container, `otr-r3a3a-host-probe-e81760b650bd`, reused the current
Backend image
`sha256:d2e512b1841db689ff64948f4663c4660a20fc181914aee3412483a96c84d0f5`.
Node v24.21.0 ran a stdin-only probe instead of the Backend application.
The application entrypoint and healthcheck did not execute.

Controls: `--rm --pull=never --network host --read-only --cap-drop ALL`,
no-new-privileges, UID/GID 10001, healthcheck disabled, PID limit 32, 64 MiB memory,
0.25 CPU. No mounts, inherited Backend environment, published ports, listeners,
volumes, new networks or downloaded images. Filesystem/process isolation remained;
**network isolation was intentionally absent**, as required by this candidate.

Target throughout: **`db.tuqigdxrvrerfewsxqgm.supabase.co:5432`**.

| Check from disposable container                                 | Result                                     |
| --------------------------------------------------------------- | ------------------------------------------ |
| DNS AAAA                                                        | `2406:da1c:4c7:f800::7dd1`                 |
| Normal hostname lookup                                          | Same address, family 6                     |
| Hostname IPv6 TCP5432                                           | PASS, actual remote family IPv6            |
| Verified hostname TLS                                           | PASS, TLSv1.3 / TLS_AES_256_GCM_SHA384     |
| Literal IPv6 diagnostic with original hostname/SNI verification | PASS; no Driver configuration substitution |
| Leaf SAN                                                        | `DNS:db.tuqigdxrvrerfewsxqgm.supabase.co`  |
| Issuer                                                          | Supabase Intermediate 2021 CA              |
| Wrong hostname                                                  | Rejected: `ERR_TLS_CERT_ALTNAME_INVALID`   |
| Empty trusted-CA set                                            | Rejected: `SELF_SIGNED_CERT_IN_CHAIN`      |

The probe reused the accepted public
[Supabase Root 2021 CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt),
with DER SHA256 verified as
`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
Leaf DER SHA256:
`3be62ef42e3918161a3e729fc3b3751654efd27c8cbe5f067ed688014f0b479a`.

Each connection sent only the eight-byte PostgreSQL SSLRequest followed by TLS
handshake messages, then closed. No StartupMessage, username, password,
authentication exchange or SQL was sent. This proves network and certificate
identity, not authenticated Driver behavior or current SQL primary/recovery state.
The accepted SQL Driver was neither modified nor invoked.

## Deployment implications and minimum bounded candidate

These are proposed implications, **not applied changes**:

1. Set `network_mode: host` for Backend and remove `ports`. Docker host mode
   ignores port publishing; `127.0.0.1:8787:8787` cannot enforce loopback binding.
2. Correct the HTTP listener to bind explicitly to `127.0.0.1:8787` before replacement.
   The current `0.0.0.0` bind would cover host IPv4 interfaces, removing the existing
   Docker ingress restriction. External reachability would additionally depend on
   host/provider filtering, which was not certified here.
3. Stop/replace the old Backend before starting the host-mode Backend. Its current
   `docker-proxy` already owns host `127.0.0.1:8787`; overlap would conflict.
   A bounded interruption and a reviewed rollback to the original bridge/image/
   Compose are required. Existing loopback healthcheck can retain its URL.
4. Localhost becomes **host localhost**. The container gains network access to
   host-local services; host mode reduces isolation even with capabilities dropped.
   DNS changes from bridge embedded DNS to host-derived resolver configuration.
   The probe used `127.0.0.53` successfully. Compose service aliases and bridge
   discovery must not be assumed to survive. Environment-derived service URL
   dependencies were not inventoried because credential-bearing environment was
   intentionally excluded.
5. Other containers remain on their current networks. Observed host listeners include
   SSH22, resolver53, Caddy80/443 and loopback2019, Backend8787, media5001,
   and container services8000/8010/8020/8030/8040. The probe bound no server port.
   Future host-mode processes share this port space and host-local access.

Native host mode supplies IPv6 without routing through a new Docker bridge.
IPv6 all/default/eth0 forwarding remains **0**. No global Docker setting, firewall,
sysctl, host route, DNS policy, tunnel, proxy or accepted Driver change is required
for the observed connectivity path. A reviewed Backend-only bind/deployment change
is still necessary; a Compose-only switch is not ready.

## Preservation, cleanup and evidence

Before/after assertions passed for all **8 existing containers and 5 networks**:
IDs, images, start times, restart counts, network attachments, addresses, gateways,
published ports and isolation fields unchanged. Host IPv6 addresses/routes,
forwarding/disable sysctls, daemon configuration presence/process, Compose hash and
listening-socket inventory unchanged. IPv4/IPv6 firewall comparison excludes only
generated timestamps and traffic counters; rules/policies match.

The probe exited 0 and auto-removed; exact-name absence was verified. No remote
files, networks or volumes were created. No cleanup touched existing resources.
Rollback for this inspection is a no-op. Bounded DNS/TCP/TLS traffic and a temporary
container/process were the only remote execution effects.

Local evidence: `/private/tmp/otr-r3a3a-host-network-20261010/` contains
`build.py`, `probe.py`, `result.jsonl`, `verify.py`, and `verification.json`.
The retained verifier asserts positive/negative TLS outcomes, shared namespace,
configuration/listener preservation and cleanup.

- Probe SHA256: `6c2e444bdf380f0c185ebdae4917dcb92798f66cb8ba05c748b1d4dc59a3a862`.
- Raw evidence SHA256: `a76d5eea9c88299ccdd83bcd20fee6d3cb75e97c2e58e8959ac4fc12b673e2ca`.

Hosted H1, Reader **NOLOGIN / PASSWORD NULL**, and all **CLOSED** gates were
preserved by non-access: no Hosted credentials, SQL session or mutation occurred.
Their current remote values were not re-queried. No Backend deployment, existing
container modification, server/Driver/config edit, device/Simulator operation,
runtime/Composer/C5/C9/provider activation, Git commit/push/merge occurred.
No application suite or authenticated SQL test was run for this report-only proof.

**STOP — HOST NETWORK FEASIBILITY / OWNER REVIEW REQUIRED.**
