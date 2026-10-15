# C2 bounded Runtime Gate package — NOT EXECUTED

Base425a102; exact patch/file/bundle hashes in review manifest. No credentials,
private runtime directory, actual Storage, deployment or Native were accessed.
C1 PARTIAL remains; do not resubmit the existing Batch.

## One protected decision, existing DEV only

Approve only reviewed Backend image/profile replacement, existing credential
reuse, metadata-only root/config provisioning if absent, and the same two Input
Storage PUT/authorized GET. No SQL/role/Provider/new Account/device/bundle. Preserve
Caddy/network/firewall and unrelated services. Use existing runbook maintenance
window, image/profile preflight and immutable rollback; prior approvals do not
stand in for this Gate. No real image ID has yet been built/observed.

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
command plus two non-auto-created binds. Never bypass a rejection.

After that qualification and approval, operate only backend:
`docker compose -p dev-backend -f deploy/dev-backend/compose.host.yml -f "$api_key_override" -f "$forward_image_override" -f deploy/dev-backend/compose.capture-custody.closed.yml up -d --no-build --pull never backend`.
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
cannot establish actual host connect-refused. The exact A1A target remains UNKNOWN.
The device name is the approved A1A
name, not evidence of a discovered Inspector target; any other/absent/ambiguous
metadata is unqualified. Before remote provision/deploy, qualify only the A1A
target mapping and hook presence in the approved window; FAIL/UNKNOWN stops those
subsequent steps. This read-only bridge result does not verify repositories or Inputs.
Only after successful qualification, backend readiness and explicit Gate, run
`node scripts/dev/capture-c2-once.mjs --execute` once. It calls only the sealed
hook. Within that execution, the runner verifies both Inputs through normal
repositories, current account and exact pins before the first Storage write.
A failed or UNKNOWN preflight stops before Storage writes. The bridge returns
only exact pinned IDs/count/SHA; timeout/error/unknown receipt
is failure, never success. Do not auto-retry: inspect same identities first.

Runtime remains NOT VERIFIED. Root's two bounded discovery attempts (sandbox and
approved host namespace) both returned URLError, no targets. No debugger was
connected, no JS executed, and this bridge has only synthetic self-checks.
Restoring original Metro/host is an explicit protected prerequisite, not an
observed usable channel. Do not probe alternate ports or restart anything here.
Restore all six preimages and remove hook on every outcome; verify hashes.
Keyboard OFF except atomic input; USER_CHANGED stops. No permanent debug route.
