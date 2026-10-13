# L2 CLOSED Backend / Source V3 join

2026-10-13. Source/Flight execution owner. Owner L2 authorizes repaired V3 local
compatibility, implementation, testing, independent review and eligible integration.
This implementation starts at reviewed `688b818` and reuses Backend03A `7c56aa23`.
It adds no public route/startup composition or protected runtime activation.

## Result and ownership

The dormant Backend preparation now accepts existing finite V1 or V3 bindings.
V1 remains supported; V2 is not silently admitted. V3 context pins the actual fixed
producer configuration digest. The private stage retains its original file format,
closed payload checks, fsync/no-replace/reopen behavior and opaque Source resource ID.
The storage producer retains its one POST, no retry/upsert/redirect, bounded response
and verified TLS behavior. V3 reads require Source readId plus ACK digest and use a
fresh Node request with explicit no-cache/no-store/Pragma headers.

`sourcePdfCausalAuthority.ts` binds only existing Source V3 RPCs. Source's existing
operations, execution attempts, staged resources, immutable ACK/GET and receipts
remain durable truth. There is no new uploader, Gateway, StageLedger, command grammar,
Source FINAL writer or schema. Account-generation checking remains a required trusted
owning auth-lifetime composition port, never caller-declared authority. No production
composition implementing that port is installed by this checkpoint.

Every RPC owns a separate top-level transaction and verifies the dedicated Source
principal. A pre-BEGIN XID and new transaction XID reject an existing outer transaction;
nested BEGIN/savepoints cannot satisfy the commit boundary. A failed call is not retried.

Ingress closes the existing immutable stage, then commits Source STAGE. Only a live,
successful DISPATCH commit followed by a separate CONFIRM commit returns one POST grant.
Existing RUNNING/UNKNOWN or reclaimed attempts return no grant. Provider COMPLETE_ACK
is bound and committed through Source before any READ; operational ACK may still be
recorded before the caller rejects newly changed access. READ permit is committed
before fresh GET, then Source receives its exact readId/ACK digest proof. Already
persisted GET returns its Source evidence reference without another HTTP request.
Source's existing finish RPC alone performs receipt-first CAS/finalization.

UNKNOWN, incomplete response, GET failure, process restart and stale fence grant no
redispatch, physical terminality, stage release or cleanup. FINAL/APPLIED(PENDING)
still leaves physical execution debt and quota intact. Fixture teardown is test-only
scratch removal and is not business cleanup authorization.

Owned production files: `backend/src/sourcePdfBackendPreparation.ts`,
`sourcePdfPrivateStage.ts`, `sourcePdfStorageProducer.ts`, new
`sourcePdfCausalAuthority.ts`. Shared `backend/src/app.ts` only receives the original
Backend03A `authenticate` export; no routing changes. Source profile/migration/DTOs
and Coordinator records are unchanged. Existing Backend03A tests, local launcher,
fixture runner and historical reports are imported with exact provenance; current
Source SQL runner adds only an owned joined scenario and cache-free config loading.

## Validation and limits

- Original Backend preparation: **32 PASS / 1 optional real-Storage SKIP**. Temporary
  synthetic loopback HTTP/TLS only; original local real Storage launcher was not run.
- New real PostgreSQL/Node HTTP/file stage join: **6 PASS**, 9.44 seconds. Covers
  admission replay, independent committed stages/grants/ACK/READ/GET, one POST under
  concurrent callers, Source receipt replay, retained physical debt/no cleanup,
  missing ACK, failed GET/read-only recovery, changed Account generation and nested
  transaction refusal.
- Two actual new Node child processes independently open Source sessions, reclaim
  CAS ownership, reopen existing closed stages and prove UNKNOWN cannot POST/read
  without ACK, while persisted ACK permits only bound GET and Source finalization.
  Child PIDs are asserted different from parent, not merely new objects in one process.
- Current typecheck, touched ESLint, backend build, UI guard and diff-check PASS;
  touched formatting evidence accompanies the manifest.
- All 99 Supabase migrations and SQLite files retain baseline bytes. Disposable
  cached PostgreSQL container uses network-none and is destroyed by the existing
  owned runner. Test-only Source gates are closed again; RLS/root fingerprint checks
  PASS. No Hosted, real credential, production or device was accessed or modified.
- Sandbox loopback restriction caused an initial original-test failure; the same
  authorized bounded local run passed with escalation. An initial SQL fixture used
  Buffer-vs-Uint8Array equality in a server callback; correcting only that fixture
  comparison produced PASS. These failed runs are not counted as success.

Actual new runtime vertical slices: **1 CLOSED synthetic Backend-producer + Source
PostgreSQL + filesystem/restart chain**, with failure variants. This is narrower
than a public Backend HTTP/Node-pg/TLS or real Storage/native/Hosted vertical slice.
The owning authority uses real PostgreSQL RPCs through disposable psql fixture
plumbing; production pool/composition is still dormant. Unit and SQL case counts
are not additional runtime slices. Real Storage behavior, Hosted installation,
production auth-lifetime wiring and original Native-positive validation remain
NOT VERIFIED, under their existing boundaries.

Readiness: **implementation/function checks PASS, independent code review pending**.
Candidate and exact imported/modified/new-path digests are in the private integration
manifest supplied to the Integrator. No canonical/main/Coordinator mutation or push.
