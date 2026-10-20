# C2 bounded Runtime Gate package — CONDITIONAL OWNER AUTHORIZATION

Reviewed Backend snapshot83f575f; exact patch/file/bundle hashes remain in the
review manifest. Runtime evidence is recorded separately; code approval is not PASS.
C1 PARTIAL remains; do not resubmit the existing Batch.

## Current Native execution — Owner-approved Activity caller (2026-10-15)

This section supersedes the historical Inspector/CDP Hook invocation requirements
below. Keep original A1A device A1A21E80-9007-4D69-87A4-2A5AF927F0A3,
com.xoery.otrmobile, existing Session/SQLite/Metro, account and same Batch/Input
bindings. No Inspector Hook qualification or retry is required.

Only an explicit DEV QA configuration may expose the bounded action inside the
existing Capture Activity. Normal startup stays disabled. Use the existing owning
runner, Repository, Source/Custody transport and current authorized Session.
Before network dispatch, confirm the fixed DEV target, exact original bindings
and unexpired metadata; original expiry remains 2026-10-15T08:38:49.122940Z.
Do not renew it automatically, deploy again, copy tokens or substitute desktop
uploads. No new Repository, Storage API, test page or persistent QA state.

Runtime PASS requires both originals uploaded from the original App, authorized
readback matching exact bytes/SHA-256, and normal cold restart finding the same
Activity with successful GET-only custody verification (no repeat PUT). Record
actual stage/error on failure; code and Backend Deployment PASS remain separate.
Preserve original file preimages for any temporary Native source/config overlay
and restore them after verification. Historical Hook code below is evidence only,
not an alternate execution path.

## One protected decision, existing DEV only

Owner approved only reviewed Backend image/profile replacement, existing credential
reuse, metadata-only root/config provisioning if absent, and the same two Input
Storage PUT/authorized GET. No SQL/role/Provider/new Account/device/bundle. Preserve
Caddy/network/firewall and unrelated services. Use existing runbook maintenance
window, image/profile preflight and immutable rollback; prior approvals do not
stand in for this Gate. Targeted deployment/startup/version/health PASS (C2 Runtime
not verified), running image:
`sha256:08b1ad6f11318ac52fc55e28f99b8774cf90286ad0499ca81a7bfad5d373765e`;
Capture bundle `3c873ee300fa467186f91aeab7363d78869222ea125d4b55eb61a2f7ad1c54d5`.
Independent exact Linux reproduction/equivalent lowering evidence:
`/private/tmp/otr-c2-backend-runtime-20261015/independent-bundle-check.md`.

Build reviewed snapshot: `docker build -f deploy/dev-backend/Dockerfile -t otr-dev-backend:capture-c2-reviewed .`.
Record immutable ID using `docker image inspect otr-dev-backend:capture-c2-reviewed --format '{{.Id}}'`;
never deploy the tag. Dockerfile builds ordinary and explicit Capture bundles;
normal CMD/server.ts remains unchanged. No package/dependency is added.

Explicit override: deploy/dev-backend/compose.capture-custody.closed.yml. Append it
to the existing host profile + existing private credential override + pinned image
override; do not use base-only Compose or expose private values. Render only
`config --no-env-resolution --no-interpolate`. Use the reviewed strict verifier capture profile:
`node scripts/dev/backend-host-image-check.mjs "$OTR_DEV_BACKEND_REVIEWED_IMAGE_ID" "$rollback_image" "$credential_file" capture < reviewed-compose.json`.
It preserves host/credential/image predicates and admits only the exact Capture
command plus the two non-auto-created Capture binds and the retained read-only
Catalog Reader bind. Owner approved this exact third mount on 2026-10-15:
`/run/otr-r3a5-catalog/catalog-reader.json` -> `/run/otr/catalog-reader.json`.
Preserve `/opt/otr/dev-backend/env/r3a5-reader90-v5/forward.yml` in both forward
and exact prior rollback selection. No fourth, substitute, writable or auto-created
Reader bind is accepted. Backend source snapshot83f575f is unchanged.
Never bypass a rejection. Use exactly the documented noninterpolated, non-env-
resolved JSON for this checker; additional interpolated rendering can expand
env-file fields and omit false bind flags. Do not relax the checker to accept it.

After that qualification and approval, operate only backend. Export the fixed
nonsecret `OTR_DEV_BACKEND_REVIEWED_IMAGE_ID` for actual Compose interpolation;
a later literal image override does not suppress required variables in earlier
files. Keep the exact original four-file selection, append the new image override
last among image-setting files, then the Capture override:
`docker compose -p dev-backend -f deploy/dev-backend/compose.host.yml -f "$api_key_override" -f "$prior_host_image_override" -f /opt/otr/dev-backend/env/r3a5-reader90-v5/forward.yml -f "$forward_image_override" -f deploy/dev-backend/compose.capture-custody.closed.yml up -d --no-build --pull never backend`.
Check loopback/public health, unauthenticated401, and rejection outside exact2Input
allowlist. Roll back to retained immutable image and EXACT prior full Compose
selection without Capture override. Never delete/reset Storage or metadata.

## Minimal metadata provisioning, never automatic

If absent, only /opt/otr/dev-backend/private/capture-custody with UID10001/GID999,
0700; store-identity.json with same owner0600; outside nonsecret attestation file
/opt/otr/dev-backend/env/capture-custody.json root:GID999,0440,single-link/no-symlink.
The mount is /var/lib/otr/capture-custody; read-only config is
/run/otr/capture-custody.json. Attest mount device/inode and UUID independently;
application never creates root/marker or learns expected identity from that marker.
Config strictly has version1,directory,identity{store_id,device,inode},expiresAt
(within24h),batch=gate-bindings.json. Missing config stays CLOSED; malformed fails.
Storage uses existing process env URL/secret (no new key/env/secret file).
Only two Source Storage originals and two immutable associations may be created;
no Linux Capture byte copy, Source/Trip/Review/Provider effect or overwrite.

## Same A1A execution; unresolved invocation qualification is explicit

Use A1A A1A21E80-9007-4D69-87A4-2A5AF927F0A3/com.xoery.otrmobile existing SQLite/session.
No DB/Authcache copy/export or Desktop-file substitution. New runner is
runDefaultCaptureCustodyBatch(gate-bindings.json), using normal repositories,
getForSourceHandoff and cached-session auth provider internally. Both original
bindings are checked before writes; output only Batch/Job/Input IDs and SHA/count.
Each PUT is followed by authorized GET. Unknown errors preserve identities; any
retry uses same bindings, never a new Batch.

Gate may temporarily overlay ONLY these five owning data/API files and append a
one-shot DEV hook to existing defaultCaptureSubmission.ts (keep its original code):
captureCustody domain; captureCustodyTransport; requestBoundary; captureCustody
operation; defaultCaptureCustody operation. Preserve exact six-file preimages;
no registry/migration/ordinary UI/Experience file changes. Hook deletes itself
before dynamic import/call, accepts no other inputs, and is absent from product code.

```ts
if (__DEV__)
  Object.defineProperty(globalThis, "__OTR_C2_ONCE__", {
    configurable: true,
    value: async () => {
      delete (globalThis as any).__OTR_C2_ONCE__;
      const { runDefaultCaptureCustodyBatch } =
        await import("./defaultCaptureCustody");
      return runDefaultCaptureCustodyBatch(EXPECTED);
    },
  });
```

EXPECTED is exactly gate-bindings.json, never tokens/raw bytes. A1A-only reload,
normal Recent submissions loads that module. The bounded Node-standard-WebSocket
bridge is scripts/dev/capture-c2-once.mjs (no dependency or arbitrary expression).
After separately approved original-host restoration/temporary overlay, first run:
`node scripts/dev/capture-c2-once.mjs`.
It only discovers fixed http://[::1]:8081/json/list, requires exactly one
`deviceName="OTR CP02 Native Host Recovery"` and `appId="com.xoery.otrmobile"`,
and checks hook presence without invoking it. This candidate changes only the
loopback address family from IPv4 to IPv6, with no fallback; WebSocket also accepts
only [::1]:8081. Before attempting this delta, confirm original PID3554 and cwd
/private/tmp/otr-beta-trips-shell-r2-native-61 still own the same [::1]:8081 listener.
A listener is not A1A target qualification. The prior IPv4 Gate does not authorize
silent IPv6 substitution: Owner approval of this precise delta must precede its
first endpoint access. Do not change/restart Metro, select another target or port.
Two later host-namespace diagnostic requests timed out in tool automatic approval
before command execution; those are approval availability failures, not evidence
of DEV permission denial or host IPv4/IPv6 network failure. Sandbox URLError alone
cannot establish actual host connect-refused. Subsequent IPv6 discovery qualified the unique original target metadata; full
WebSocket/context/hook qualification failed with a generic error.
The device name is the approved A1A
name, not evidence of a discovered Inspector target; any other/absent/ambiguous
metadata is unqualified.

Owner sequencing revision (2026-10-15): Backend qualification/deployment is
independent of Native Inspector/hook availability. All existing DEV Project,
fixed reviewed image, protected credential/config, exact metadata mount, permissions
and rollback checks must PASS before the previously authorized Backend deployment.
Native failure stops Native execution and both Input PUT/GET, not Backend qualification.
No image, credential, Storage/Auth/RLS, Production or data-isolation scope changes.

Owner permits one normal close/reopen and necessary reload of only the original
A1A/App to load the sealed hook through the normal module. Preserve Simulator,
bundle, database, Auth session and original Metro; no reinstall/reset/session copy.
Unsaved temporary UI state may be lost. If recovery fails, retain finite separate
WebSocket/context/hook evidence and stop that direction without repeated attempts.

The read-only bridge does not verify repositories or Inputs. Both Backend and
complete Native qualification must PASS before any two-file PUT/GET acceptance.
Only after successful qualification, backend readiness and explicit Gate, run
`node scripts/dev/capture-c2-once.mjs --execute` once. It calls only the sealed
hook. Within that execution, the runner verifies both Inputs through normal
repositories, current account and exact pins before the first Storage write.
A failed or UNKNOWN preflight stops before Storage writes. The bridge returns
only exact pinned IDs/count/SHA; timeout/error/unknown receipt
is failure, never success. Do not auto-retry: inspect same identities first.

Runtime remains NOT VERIFIED. Prior failures and exact source restoration remain
recorded in /private/tmp/otr-c2-a1a-runtime-20261015/receipt.json. No Backend image
or upload success may be inferred from metadata discovery or a recovered hook.
Restore all six preimages and remove hook on every outcome; verify hashes.
Keyboard OFF except atomic input; USER_CHANGED stops. No permanent debug route.

## Latest targeted deployment checkpoint

Owner authorized one targeted execution correction following the two historical
stops. Original noninterpolated Gate/profile check and explicit pinned image
variable passed. The same original four profiles plus approved image/Capture
overrides deployed image08b1ad6f with server-capture command and exactly3 mounts.
Local/public health200; Reader/Caddy/unrelated containers and original profile
hashes preserved. No rollback required; old immutable23dae9/full Compose retained.
Same metadata root/config identity restored; expiry2026-10-15T08:38:49.122940Z.
Do not replace that root/identity or assume readiness after expiry. Renew/reuse only
within the applicable bounded authorization and attested continuity.
A1A remains BLOCKED at WS opening. No two-file PUT/GET/Storage association or C2
Runtime PASS. Backend success alone never authorizes bypassing Native qualification.
Receipt: `/private/tmp/otr-c2-backend-runtime-20261015/targeted-deployment-receipt.json`.
Historical stopped rounds: same directory `final-receipt.json`.

## Latest Native r3 and metadata stop

Original target metadata and HTTP101 now pass with fixed Origin
`http://localhost:8081` using Node's existing WebSocketInit headers. This meets
Metro's existing allowlist; it does not change the actual [::1]:8081 destination
or relax server guards. Runtime.enable had no response/context before close1006;
no hook invocation/PUT/GET. Six preimages restored exact; live hook absence unknown.
No further retry in this bounded window. The next unresolved layer is the
Metro-to-A1A JS-runtime connection after handshake, not Backend or Origin.
Unused config was parked at the original disabled audit path without restarting
the deployed Backend. Already-loaded process closures keep their original
08:38:49.122940Z/21:38NZDT expiry guard; rename alone is not immediate revocation.
No dependent operations or TTL extension. Future startup config absent; root and
all evidence retained. Local/public health200. Receipt:
`/private/tmp/otr-c2-backend-runtime-20261015/metadata-stop-receipt.json`.
