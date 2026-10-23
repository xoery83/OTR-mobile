# Ephemeral in-place synthetic Auth operator

Owner autonomous DEV scope is bound to authorization SHA256 a6682cdcfec889d64d02627c1f8fa144db0e828b77841e66fdac2bfc405d5e5e. This preparation requires independent Auth-boundary Review before actual creation. It adds no service, deployment, mount, schema, permission or business contract.

## Qualified existing source

Canonical local `.env.backend` opaque secret returned401 for public Auth settings with both original SDK headers and apikey-only. Existing approved B container's original environment returned200 for the same endpoint with both header profiles. No secret values/fingerprints were exported or copied; only status/type/UUID-request-ID flags were retained. This proves source-dependent public gateway qualification, not admin permission. SDK2.116 default headers are unchanged. No key was replaced locally or remotely. Earlier failed attempts/UNKNOWN remain separate immutable evidence.

## Fixed operation

`provisionInPlace.ts` bundles the installed SDK and existing32bf diagnostic helpers. It executes only the selected exact A or B creation, one outbound POST per process. It reads the existing DEV URL/key exclusively from the existing container's process.env. Exact project/path/body/identity, no redirect,10s HTTP deadline, SHA-bound finite gate<=900s, fresh exact-email absence<=60s and ordinal1..2 are checked before dispatch, again after asynchronous body parsing. Caller input is pinned by clone. It returns only safe diagnostic metadata and a validated new identity receipt(id/email/createdAt/project). It has no login/profile/business/API fallback entry point.

`auth_in_place_operator.py` runs on the existing operator machine. Its fixed journal `/private/tmp/otr-c-autonomous-dev-20261023/auth-attempt-journal.json` is0700-directory/0600-file, exclusive-flock and atomic-write/file+directory-fsync before SSH. Counters A/B each<=2 are cumulative across new windows; reservations are never refunded. Same identity with a verified prior creation cannot be recreated. UNKNOWN/timeout/network/parse/2xx-with-invalid-receipt stays blocked after readonly reconciliation. Only an explicit returned HTTP4xx rejection and a new exact empty lookup can qualify a remaining ordinal. No automatic retry loop exists.

Before each allowed reservation it uses the already approved local Supabase CLI Management channel for a fixed exact single-email READ ONLY id/email/created_at query. It stops if any row exists or qualification is unknown. It verifies the exact current B image. The reviewed bundle and password/payload travel via encrypted SSH stdin to `docker exec -i otr-dev-backend node --input-type=module`; the existing container user/config/environment are inherited. Neither bundle nor payload becomes a persistent remote file or mount. The current B secret never leaves the container; synthetic password remains only in controlled-process memory/stdin. Raw stderr/private responses are never persisted. The local journal retains only safe outputs.

Operator command, after Review and within a freshly chosen Owner-authorized<=900s window:

`python3 scripts/trip/c-execution/auth_in_place_operator.py --gate <finite-auth-gate.json> --gate-sha <exact-byte-hash> --label A|B --bundle <fixed-provision-in-place.mjs> --bundle-sha <exact-byte-hash>`

Private stdin contains only the new synthetic password. It never contains the remote administrative key. Each invocation performs at most one identity creation; do not invoke another label after a failed/unknown result until it is legally qualified. On success, retain password only in the same operator process for normal password sign-in/servergetUser and existing headless runner. A new identity receipt does not prove Account adoption or business permission.

## Original C integration / budget

Original QA Trip/operation IDs, request scalars/hashes, queue/worker/transport,8business mutations/16reads and independent finite watchdog/current-B restoration remain unchanged. New autonomous Auth scope counts(A<=2,B<=2) are separate from old A attempts2/B0; all old evidence remains immutable. Business counters remain0/0 before this preparation. No business count resets across windows. A fresh<=900s window can be selected autonomously; service changes still require>=240s reserve and independently armed watchdog. If business outcome/budget becomes unknown, do not replay or restart the entire runner to reset counters.

New actual Auth identities must be verified by the existing normal login+servergetUser contract before account adoption. A/B passwords/tokens are never persisted. No Auth existing-user takeover, admin profile write, real-user access, Source/Core/provider change, Production or Native operation.

## Isolated evidence

Five Node tests PASS, including actual SDK-to-loopback each label, scope/absence/window/source/budget refusal, networkUNKNOWN/no private metadata, caller-mutation pin and actual full bundled stdin invocation against localhost. Three Python tests PASS for per-identity/cross-window consumed UNKNOWN budgets, corrupt owner/count refusal, and real file+parent-directory fsync ordering. TypeScript/touched ESLint and Python compile PASS. These fixtures are L2 only, not real identity/admin/Hosted/Native acceptance. The bundle is SDK2.116 compiled locally, not a DEV Backend deployment.

Data Path Checklist: ownership=finite synthetic Auth plus operational diagnostics; storage=durable private attempt journal/no key/password/token persistence; contract=existing Auth+normal adoption and original business contracts; conflict/offline=UNKNOWN blocked/exact lookup/no automatic retry/immutable counters; evidence=isolated L2 plus readonly source qualification, real Auth/business L3 not yet run; remaining=Auth-boundary Review then bounded actual identities and original C receipts/readback/recovery.
