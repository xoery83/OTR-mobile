# C-I3E Provider Byte Proxy / Create-Only / Quiescence Activation Preflight

Date: 2026-10-04 (Pacific/Auckland).
Status: **C-I3E PREFLIGHT COMPLETE — REVIEW PENDING**.
Source runtime activation remains **BLOCKED**; accepted C-I3D remains CLOSED.

## Baseline, scope and files

Startup verified a clean import worktree, branch `trip/import`, HEAD
`edd41a41ff00a163e78434cdc754a65fcd8e2577`. Every repository command used explicit
import workdir. Authority is accepted C-I3C sections F/G/H and the reviewed C-I3D
operation/ownership state machine; this preflight does not amend either.

Files added: this report and
`scripts/supabase/trip-source-provider-preflight.test.mjs`. The only existing
file changed is the short current-state handoff. No Backend, Mobile, route,
migration, manifest, verifier, API contract, existing attachment wrapper, role,
grant or gate change. No new dependency. Harness code is test-only, never imported
by product runtime, and hard-binds workdir/HEAD, isolated container and loopback
origin; it rejects remote URLs and redirects.

Disposable project: `otr-trip-ci3e-preflight`, API `127.0.0.1:57321`, PostgreSQL
`57322`, copied 70-migration chain/config under import `.ci3e/`.
Measured Storage image: `public.ecr.aws/supabase/storage-api:v1.72.1`.
Supabase/storage SDK installed version: `2.116.0`.
Ephemeral local fixture-administrator JWTs were obtained in memory from this
project's CLI status, not from product environment files. They measure Storage
only and confer no Source semantic admission. No runtime principal/credential was
provisioned. All temporary project files, staging, private CLI output, logs and
test caches were removed. Containers and volumes were stopped/removed with
`--no-backup`; both final inventories were empty. No provider DELETE/move/list or
signed URL call was made; fixture objects disappeared only with whole disposable
infrastructure teardown.

## Acceptance matrix

| Property                          | Classification                          | Evidence / remaining boundary                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fixed private identity            | PROVEN locally                          | Exact lowercase canonical UUID vectors yield `v1/<trip>/<source>/<representation>/payload`; traversal, encoding, uppercase, extra bucket/path and malformed IDs reject. Runtime IDs must come from admitted records, not callers.                                  |
| Create-only / no overwrite        | PROVEN locally                          | Real SDK `upload(...,{upsert:false})` sends POST with `x-upsert:false`; first create succeeds, second different-byte create rejects and original bytes remain.                                                                                                     |
| Concurrent same-key create        | PROVEN locally                          | Two competing creates produce one winner; trusted download preserves exactly that winner's bytes.                                                                                                                                                                  |
| Identical/mismatched collision    | PROVEN locally                          | Actual downloaded SHA-256/count and MIME plus candidate-format evidence distinguish identical bytes from mismatch. Byte identity is separate from writer quiescence and full parser verification.                                                                  |
| Actual bounded provider read      | PROVEN locally                          | Stream actual GET bytes into incremental hash/count; exceeding the selected read bound rejects and cancels the read. No full large Blob is required by that probe.                                                                                                 |
| Caller timeout/cancel/drop/crash  | PROVEN locally, limited relay model     | Independent accepted-request owner can later create the real object after caller observation is lost. This is not a measurement of Storage server crash recovery.                                                                                                  |
| Provider post-crash terminality   | BLOCKED / unproven                      | No cancellable write ID, durable terminal-attempt query or completed-call guarantee was established.                                                                                                                                                               |
| Trusted completion + safe retry   | Contract supported; runtime PENDING     | C-I3D exact-owner/generation CAS must retain IO_UNKNOWN until trusted completion; no producer/runtime provisioning is installed.                                                                                                                                   |
| Input/staging limits              | PROVEN locally, single owner            | PDF 10 MiB / image 50 MiB caps, positive exact count, 1 MiB chunks, SHA-256 while writing, 64 MiB in-process reserved quota; 50 MiB boundary and excess/short/chunk/quota negatives pass.                                                                          |
| Actual format / parser safety     | BLOCKED / unproven                      | Candidate signatures and bounded brand recognition are insufficient for VERIFIED. No parser/decode resource profile is installed.                                                                                                                                  |
| Staging isolation/cleanup         | PROVEN local mechanics; runtime PENDING | UUID-bound Account/operation/attempt paths, 0700 directories/0600 files, exclusive creation, wrong-Account cleanup denial, UNKNOWN/reference retention and eligible cleanup pass. Real Account admission and durable multiworker/crash quota remain unimplemented. |
| Private bucket / client authority | PROVEN local subset                     | Bucket is private; anonymous direct upload/download reject; no list/signed-URL capability is introduced. Full authenticated runtime provisioning remains PENDING.                                                                                                  |
| Source non-interference           | PROVEN locally                          | Before/after sources/representations/actions/operations are all zero; gate false, three reserved roles NOLOGIN/non-superuser/non-bypass; deterministic schema manifest unchanged.                                                                                  |

## Exact provider behavior and collision protocol

The first SDK create returned success (HTTP 200). Both different-byte and
identical-byte duplicate creates failed. Important adapter detail: this local
provider returns **HTTP 400**, while the SDK exposes
`statusCode: "409"`, message `"The resource already exists"`. Treat the exact
provider/SDK duplicate classification as collision, not every HTTP 400: a denied
MIME also returned HTTP 400 with SDK status `415`,
`"mime type text/plain is not supported"`. No upsert fallback exists.

A collision requires an owner-authorized actual-byte read under the fixed
identity. Compute SHA-256 and byte count from the received stream, match the
admitted descriptor, and independently establish format evidence. Identical
bytes can establish byte identity, not VERIFIED, ownership, admission or
quiescence. A mismatch is an integrity incident: quarantine access logically,
preserve descriptor and original object, never overwrite/delete/repoint.

Stored Content-Type is demonstrably a caller claim: PNG bytes uploaded with
`application/pdf` succeeded and downloaded with that MIME, while byte
recognition identified PNG. Provider metadata, ETag, client hash and Content-Type
are not trusted SHA-256 or parser proof. Response status proves only the observed
provider call's response; transport length can be checked against actual count.
Trusted stream SHA-256/count establish the bytes observed, then semantic CAS
must separately validate their admitted descriptor.

## Quiescence findings

Five deterministic experiments use a loopback relay that accepts a small request,
holds dispatch under an independent owner, and then forwards to actual local
Storage. It deliberately does not propagate caller cancellation upstream. The
caller times out, explicitly aborts, drops its socket or is SIGKILLed; before
release the object is absent, then the owner gets HTTP 200 and actual bytes appear.
A fifth experiment forwards successfully and deliberately loses the response.
This proves a live accepted writer can outlast caller observations. It does
**not** prove the relay is the future Backend, or that killing that execution owner
would terminate an already accepted provider write.

Abort before any dispatch is a separate NO_IO case. A definitive rejected MIME
response and absence are observed locally. Successful owner-observed create
completion is also measured. However, after owner crash or missing response, this
preflight has no provider-backed proof that every old PUT can no longer finish.
Object existence, absence, AbortController, socket closure, expired lease and
elapsed time cannot supply that proof.

Consequently **IO_UNKNOWN remains protected**. No timeout-based new attempt,
cleanup, semantic finalization or physical erasure is permitted. A read can
investigate/reconcile bytes while protection stays held. Retry requires a trusted,
durable completion/termination guarantee for the exact old execution identity,
C-I3D owner/phase/generation CAS to IO_QUIESCENT, then fresh owner + canReadTrip +
canWriteTrip and bases, a new attempt ID/generation and reacquired exclusive
Representation slot. If no such proof exists, remain UNKNOWN; this is an
activation blocker, not a reason to weaken C-I3D. No operational Source helper
or semantic finalization was invoked by this harness.

## Implementation-ready bounded proxy boundary

1. Authenticate the Account. Load exact operation ID/key/digest, Actor/Trip/Source/
   Representation/PREPARE pins from trusted records; reject caller bucket/path.
   In a short database transaction recheck acquiring owner + canReadTrip +
   canWriteTrip, retained state/bases, exact C-I3D phase/generation and exclusive
   attempt ownership. Commit IO_ACTIVE before any provider/network call.
2. Stage under authenticated Account/operation/attempt, with exact descriptor
   reservation, per-format count cap and deployment-wide disk/concurrency quota.
   Count/hash the original stream without normalization or material logging.
   Reject excess/short bytes before create. Preserve bytes; TEXT/LOCATOR never
   enter Storage. No database lock spans staging/provider I/O.
3. Validate actual format under the bounded parser profile below before dispatch.
   Only after those gates may a private execution-owner connector POST create-only
   to `trip-source-material` at the fixed key. Existing receipt wrappers retain
   `ledger-receipts` /`upsert:true` unchanged and are unsuitable for Source reuse.
   SDK Blob/Buffer convenience paths measured here are small-fixture tools, not
   proof of production 50 MiB end-to-end memory bounds.
4. Capture definitive response under exact attempt/execution identity. Ambiguous
   completion retains IO_UNKNOWN and references. Same-object comparison is a
   separate byte proof, not writer terminality. Persist operational quiescence
   only through the accepted private completion boundary and proven provider
   guarantees; client booleans/JWT/GUC/service_role never authorize it.
5. Semantic upload receipt/VERIFY/recovery finalization is separate and rechecks
   current owner + both permissions + Source/Representation bases/states. A write
   admission loss can preserve operational completion but cannot publish semantic
   success. Upload success is not VERIFIED. Runtime gateway provisioning,
   authenticated result barrier and actual production endpoint remain PENDING.

## Format-verification limits and next proof

Prototype recognition covers PDF prefix, JPEG/PNG signatures and bounded HEIC
`ftyp` major brands `heic/heix` (16–4096-byte aligned box; known incompatible
brands reject). Generic `mif1/msf1`, AVIF, mixed/unknown/truncated boxes reject;
no invented generic-HEIF codec assertion. This is a deterministic _candidate_
rule, not an accepted HEIC/HEIF decoder profile. The test intentionally shows
that a PDF-looking invalid body/JPEG-looking prefix can be candidates without
being verified. All five formats remain BLOCKED for runtime VERIFIED.

Next proof must specify and test, in an isolated process/container: PDF object/
page/decompression limits; JPEG/PNG dimensions, pixels, chunks/segments, allocation
and malformed/decompression-bomb handling; HEIC/HEIF item/brand/codec/grid/auxiliary
and decoded-pixel limits. Bound CPU/time, address space/RSS, child processes,
filesystem and network, with fail-closed parser termination, preserving original
bytes without transcoding. Parser/version/security profile and adversarial
fixtures must be reviewed before selection. No new parser dependency was installed.
Native receipt normalization/HEIC-to-JPEG and 15 MiB receipt limits cannot be
reused for Source. Signature-only inspection or Storage MIME metadata cannot
justify VERIFIED.

## Staging, crash inventory and cleanup

Prototype stages exact original bytes with incremental hash/count and fsync of
the payload. An exclusive Account/operation/attempt directory records an inventory
manifest. Local recovery scans validated identity directories and conservatively
classifies every recovered entry IO_UNKNOWN. Duplicate attempt staging rejects.
Wrong-Account cleanup, UNKNOWN cleanup and cleanup with required references reject;
only exact local fixture IO_QUIESCENT/no-reference cleanup succeeds. Partial
pre-dispatch rejection removes only its local partial; provider objects are never
cleanup targets.

This does not yet prove authenticated cross-Account route isolation, directory
symlink/hardlink defense, journal/directory fsync across actual crashes, bounded
inventory scan cardinality or durable quota across processes/restart. Required
runtime profile: private non-user-writable no-follow staging root, durably sealed
manifest bound to the exact DB attempt, startup inventory/quarantine without
automatic expiry deletion, durable quota rebuild/reservation and references
checked against protected operations. Graceful cancellation retains unknown work.
A trusted terminality proof plus no-required-reference check precedes cleanup.
No cleanup rule deletes Source provider objects.

## Validation, reproduction and stop

- **20/20 Node tests** (19 subcases + parent) pass.
- Unchanged attachment provider/Gateway regression: **2 files / 10 tests** pass.
- Scoped ESLint, artifact formatting, whitespace and exact baseline comparisons
  pass. All 70 migration files, existing manifest/verifier, C-I3D report, Backend/
  Mobile/attachment/API bytes remain identical to HEAD. No full-suite claim.
- Provider/schema/state snapshots establish the local acceptance matrix above.
  The final private bucket limit is 52,428,800 bytes, all protected row counts zero,
  Source gate CLOSED and three reserved roles NOLOGIN. No local activation occurred.

Reproduction requires an explicitly disposable copy of the reviewed 70-migration
Supabase project under import `.ci3e/supabase`: project ID
`otr-trip-ci3e-preflight`, ports 54320–54326 remapped to 57320–57326. Start with
`supabase start --workdir /Users/xoery/Project/otr-mobile-import/.ci3e` excluding
edge-runtime/studio/imgproxy/logflare/vector. Run the harness with explicit import
cwd and TMPDIR under `.ci3e`; fresh infrastructure is required because successful
fixture objects are intentionally not deleted between runs. The receipt-regression
config uses existing aliases, no cache and import-local cacheDir/config-loader
runner to avoid dependency-directory writes. Stop with `--no-backup` and remove
all copied config, private output, staged files and test caches afterward.

The next approved proof must resolve provider terminality, parser/resource
sandbox and durable authenticated execution/staging. This preflight stops here;
no external mutation, runtime credentials or Source activation is needed or
authorized to make the local findings concrete.

- Source commands enabled: **NO**.
- C-I3D gate open: **NO**.
- Provider runtime credentials added: **NO**.
- Product upload route added: **NO**.
- Purge/redaction enabled: **NO**.
- Production accessed: **NO**.
- Hosted Dev accessed/mutated: **NO**.
- Sibling worktrees modified: **NO**.
- Commit: **NO**.

**STOP — REVIEW PENDING.**
