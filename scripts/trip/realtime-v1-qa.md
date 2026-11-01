# Realtime V1 local QA packet

Run from any directory with this checkout's locked dependencies available:

```sh
node /absolute/path/to/checkout/scripts/trip/realtime-v1-qa.mjs
```

The adjacent JSON is the fixed coverage manifest. The script only runs local
Vitest checks and exits at the first failure. It does not deploy, contact a
Provider, acquire a device, enable a transport or modify a runtime gate.

The new joined test reuses the existing file-backed SQLite fixture, Core executor,
actor-visible collection builder, Auth lease consumer, Realtime trigger and
Downstream coordinator. A creates a GROUP-visible P3 through the real executor;
B receives its original Item ID and revisions1→2→3 through the normal Repository.
An unsent B edit/queue row stays byte-for-byte retained, a stale A edit receives
CONFLICT, an unchanged comparison avoids a collection request, disconnect/rejoin
catches a missed edit, and SQLite reopen retains both accepted Item and Pending.
The fixture lease revoke invalidates its old hint callbacks.

The remaining checks reuse existing tests for Account ABA, late signals,
backoff/dirty retry and Auth revoke/regrant/failed-cache-fence behavior. These
are separate checks, not a claim that normal real Account sessions were exercised.

Default subscription and VersionReader stay undefined. The fixture comparator
builds a full snapshot; no cheap Reader or performance measurement is supplied.
Auth authorization revision and Core access revision are deliberately different.
The joined test's no-op cache-fence spy only proves receipt delivery and old-hint
closure. A lawful owning cache-revocation mapping remains a prerequisite to a
real integration; neither a hint nor an Auth lease may invent it.
