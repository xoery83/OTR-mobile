# Expense Attachments Phase 2 — Storage Provider Audit and Plan

Date: 2026-09-27  
Status: Phase 2A ACCEPTED; Phases 2B, 2C, and 2D intentionally DEFERRED

Phase 1 is accepted. The initial sections below record the architecture audit;
the Phase 2A result is recorded at the end. The attachment
metadata remains canonical in Postgres `receipt_assets`; only the private binary
store becomes selectable by the Backend. The existing Mobile repository, local
file store, durable asset queue, and authenticated receipt routes remain the
client contract.

## Current dependency map

| Concern                  | Current dependency and evidence                                                                                                                                                                                                                                                                                                                                                              | Consequence for Phase 2                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile upload/read       | `src/data/sync/ledgerReceiptTransport.ts` calls authenticated Backend `PUT`/`GET /v2/trips/:journeyId/receipts/:receiptId/content`; `src/data/operations/openReceiptAsset.ts` verifies downloaded size and SHA-256 before caching. No Mobile Supabase Storage call.                                                                                                                          | Keep the Mobile API and offline queue unchanged in 2A.                                                                                                                                                              |
| Backend upload           | `backend/src/app.ts` authenticates and checks Journey write access, rejects a declared `Content-Length` above 15 MiB, then buffers the body. `backend/src/supabaseGateway.ts::uploadReceiptContent` checks byte length and SHA-256 against `receipt_assets`, uploads to private `ledger-receipts` with stored MIME and `upsert: true`, then records `uploaded_size_bytes`/`uploaded_sha256`. | Replace the gateway's vendor call, not the worker or Expense domain. Preserve deterministic retry at the same object key. Enforce actual body bounds even when the length header is absent.                         |
| Backend private read     | `readDownloadableReceipt` enforces active Expense/Journey access or the distinct Personal Payment historical grant before `downloadReceiptContent` reads the private bucket. `app.ts` returns bytes with `Cache-Control: no-store`.                                                                                                                                                          | Resolve provider only after authorization; continue Backend-mediated delivery.                                                                                                                                      |
| OCR read                 | `backend/src/supabaseGateway.ts::ocrReceipt` also downloads from `ledger-receipts`. Existing-Expense OCR is rejected; no OCR feature is authorized in Phase 2.                                                                                                                                                                                                                               | Route this existing read through the provider in 2A so no direct receipt-bucket call remains, without changing OCR behavior.                                                                                        |
| Completion/integrity     | `completeReceipt` compares the client-supplied object path, length, and SHA-256 with the metadata and uploaded fields. It does **not** stat or rehash the stored object. The Mobile viewer hashes a downloaded cache miss.                                                                                                                                                                   | Provider verification must distinguish a confirmed object from a DB-only upload claim before future local-file disposal or migration. Never treat an S3 ETag as SHA-256.                                            |
| Delete                   | `deleteExpenseReceipt` sets `deleted_at` only and protects linked Personal Payment evidence. There is no receipt-object delete call.                                                                                                                                                                                                                                                         | Model future physical deletion but do not invoke it in Phase 2. Tombstones and historical objects remain.                                                                                                           |
| Schema/API               | `supabase/migrations/20260912000600_ledger_2_stage_5_2_receipt_assets.sql` defines private bucket, `object_path TEXT NOT NULL UNIQUE`, MIME, expected size/SHA, and uploaded size/SHA. `src/data/api/ledgerReceiptContracts.ts` exposes `objectPath`; the local SQLite mirror also stores it.                                                                                                | `object_path` is an adequate provider-neutral **key** if interpreted as bucket-relative for Supabase and as a private key for another provider. It lacks the provider identifier. Preserve the API field during 2A. |
| Tests/fixtures           | `supabase/tests/ledger5_2_receipts.test.sql` asserts a private 15 MiB bucket. `backend/src/app.test.ts` covers receipt routes and permissions; `backend/src/supabaseGateway.test.ts` covers reader/tombstone behavior. `scripts/supabase/validate-settlement-2-phase-2-hosted.ts` probes that a public receipt URL is denied. Receipt fixtures and migration tests insert `object_path`.     | Keep these assertions for Supabase legacy rows; add mixed-provider tests before switching new uploads. The Stage 9 generic bucket-list verifier is not a receipt runtime dependency.                                |
| Configuration/deployment | `backend/src/server.ts` has only Supabase Dev credentials; `deploy/dev-backend/compose.yml` has a read-only root and 16 MiB `/tmp` tmpfs. `docs/ops/DEV_BACKEND_DEPLOYMENT.md` says receipt bytes live in Supabase Dev Storage.                                                                                                                                                              | No German endpoint, bucket, or credential is currently configured in this Backend. Do not assume its container filesystem is durable storage.                                                                       |

There is no current signed receipt URL flow. All receipt content reaches Mobile
through the authenticated Backend. The bucket is private; no permanent public
URL is stored. Current upload verification hashes the request bytes before
writing, while the `uploaded_*` fields record those bytes rather than an
independent provider stat or read-back.
`src/data/files/receiptFileStore.ts` also names its **local** directory
`ledger-receipts`; this is a device file path, not a Supabase SDK dependency.

## Narrow Backend provider contract

The Backend should own one `AttachmentStorageProvider`, used only for private
attachment binaries, with provider selection based on the canonical row:

```ts
type StoredObjectRef = { provider: string; objectKey: string };
type StoredObjectStat = { byteCount: number; sha256?: string };

interface AttachmentStorageProvider {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<StoredObjectStat>;
  read(key: string): Promise<Uint8Array>;
  stat(key: string): Promise<StoredObjectStat | null>;
  // Reserved for a separately approved, evidence-safe physical deletion slice:
  remove?(key: string): Promise<void>;
}
```

`provider` is a Backend routing identifier, never a credential or public URL.
The object key is generated by the Backend from the receipt identity, currently
`{journeyId}/{receiptId}/original`; it is not accepted from an arbitrary
client. `put` must be idempotent for the same key and same bytes, and reject a
different digest at an occupied key. The service checks expected SHA/size
before `put`, then verifies actual stored bytes through a provider-guaranteed
SHA-256 plus `stat`, or a read-back hash when the provider cannot supply one.
`stat.byteCount` is the actual object byte count needed later for uploader
storage accounting. It is not itself a usage ledger. A provider's ETag is not
assumed to be SHA-256. A simple byte-buffer interface matches today's 15 MiB
Backend limit; streaming can be considered only if that limit or measured
memory/bandwidth requires it. No universal filesystem, URL, or billing API is
part of this interface.

Future `remove` needs a separate authorization, tombstone/retention, reference,
and last-copy safety decision. It must never run merely because a DB row was
tombstoned or a provider migration completed.

## Minimum metadata migration

The current `receipt_assets.object_path` already supplies a unique opaque
object key but cannot identify which provider holds it. Phase 2A should add
only `storage_provider TEXT NOT NULL DEFAULT 'supabase_storage'` with a bounded
nonempty value check. The Backend recognizes an explicit provider allowlist.
Existing rows then resolve to Supabase without copying objects or backfilling
each row. Keep `object_path` and its uniqueness; treat it as `objectKey` inside
the provider boundary. New rows initially use `supabase_storage`. The German
identifier is added to the allowlist only when that provider is ready.

No `object_key` duplicate column, table rename, destructive migration, Mobile
SQLite migration, or Mobile DTO change is needed in 2A. If a later provider
cannot use the existing opaque key shape, justify an additive `object_key`
column then; do not prebuild it. Keep `uploaded_size_bytes` and
`uploaded_sha256` as the verified stored representation, never source HEIC or
other pre-normalized metadata. Provider selection and object-key updates must
be server-controlled; an authorized caller cannot redirect a receipt to an
arbitrary provider/key.

## German infrastructure: known and missing

- The Dev Backend runs on Hetzner host `otr-ai` in a Docker container behind
  Caddy (`docs/ops/DEV_BACKEND_DEPLOYMENT.md`). Its root filesystem is read-only;
  `/tmp` is a small tmpfs. The documented host had a 38 GB disk with 20 GB free
  at the audit date. This is **not** evidence of persistent attachment storage.
- Legacy schema/documentation refers to `hetzner_disk` for _media variants_
  (`docs/backend/SUPABASE_DEV_ENV_AUDIT.md`), not to a configured S3-compatible
  receipt store. The canonical design proposes German object storage but does
  not name an endpoint, bucket, product, or price.
- Missing before 2B: chosen provider/product and region; whether S3-compatible
  storage exists; private endpoint and TLS model; bucket/key namespace;
  credential scope and rotation; read/stat/checksum semantics; versioning,
  backups, retention and durability; availability and egress/bandwidth limits;
  storage, request, transfer and backup costs; and operational ownership. If
  server filesystem is proposed, specify persistent mount, backup/restore,
  multi-instance behavior, capacity, and failure domain before selecting it.
  No cost or S3 capability is inferred from the Hetzner server alone.

## Mixed-provider rollout and later migration

Each receipt row selects exactly one provider and key. Old rows default to
Supabase; after a separately approved switch, new rows may target the German
provider. All reads, including Personal Payment evidence, dispatch by that
row, not by an environment-wide read flag. New uploads do not need dual-write:
the retained local file and durable queue support retry until verified remote
completion. There is no flag-day copy.

Do not migrate on read. If historical migration is later desired, use bounded
background batches: read and hash the source; write the destination at a
deterministic key; verify destination size/SHA; atomically change the row's
provider/key only if its old provider/key/hash still match; retain the old
object until a separate cleanup decision. Record resumable per-asset progress
and failures. Interrupted copies leave the row pointing at the old readable
object; an interrupted pointer update is checked by rereading the row. A
temporary fallback to the old copy is possible only when its prior ref is
recorded and access remains authorized; ordinary reads should not blindly
probe every provider. Background migration is optional. Lazy migration adds a
write side effect to a private read without helping the first read and is not
recommended.

## Authorization, failure, and recovery

Keep Backend-mediated authenticated `PUT`/`GET` for the 15 MiB accepted
contract. The Backend checks Journey write access before create/upload and
Expense/Journey or Personal Payment grants before every private read; provider
credentials stay server-side. Backend-proxied bytes match current behavior and
avoid bearer URLs in Mobile; streaming would require a separate bounded-memory
change. Short-lived, single-object signed
URLs could be evaluated later if measured Backend bandwidth justifies them,
but must be issued after the same authorization, expire quickly, avoid public
ACLs/log leakage, and never become canonical metadata. No direct Mobile access
to German credentials or a permanent URL is planned.

| Failure                                        | Required behavior                                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider unavailable or upload timeout         | Keep the local durable file and queue operation; retry with the same receipt ID/key and idempotency key. Do not mark uploaded.                                                                  |
| Duplicate retry                                | Compare same key and digest; return success for identical bytes, conflict for different bytes. Never create a second active attachment or consume a fourth slot.                                |
| Object exists, metadata update failed          | Retry idempotently, verify the existing object, and complete the original row. Treat an unreferenced object as a recoverable orphan candidate; do not delete it automatically.                  |
| Metadata says uploaded, object missing/corrupt | Return a bounded unavailable/integrity error; never serve mismatched bytes. Recover from the verified local copy or retained migration source if available; otherwise flag for explicit repair. |
| Migration interrupted                          | Keep old pointer/object until destination verification and atomic pointer change. Resume by asset ID and expected digest; never delete the last verified copy.                                  |

This retains offline creation, atomic local Expense/asset/queue Save, SHA-256
checks, max-three server enforcement, tombstones, per-user upload ownership,
Journey read authorization, Personal Payment historical grants, normalized
media bytes, and deterministic retry. Physical deletion and storage accounting
are separate future decisions.

## Test and implementation slices

1. **2A — Supabase-only boundary.** Add the provider column and a narrow
   Supabase implementation behind the Backend contract; route upload, private
   download, existing OCR read, and verification through it. Keep the current
   Mobile API and private bucket unchanged; validate locally, then deploy to
   Hosted Dev as authorized by the Phase 2A instruction. Test old-row
   default, provider contract with an in-memory fake, exact-byte Supabase
   compatibility, same-key retry, stat/read-back integrity, tombstones, and
   authorized/forbidden Expense and Personal Payment reads. Run local
   migration/pgTAP and Backend tests before any Hosted Dev migration decision.
2. **2B — German provider, isolated tests (DEFERRED).** Only after infrastructure facts
   and credentials are reviewed, implement its adapter and run private synthetic
   object put/read/stat/retry/permission tests in an isolated environment.
   Measure actual bytes and checksum semantics. Do not route user uploads yet.
3. **2C — Hosted Dev new-upload switch (DEFERRED).** Enable new synthetic uploads to the
   German provider only after 2B
   passes. Keep old Supabase rows readable. Exercise offline/restart, all four
   accepted formats, max-three, tombstones, Personal Payment, cross-member and
   outsider reads, idempotent retry, mixed-provider fetch, and failure recovery.
   Production stays on Supabase until separately authorized.
4. **2D — Optional historical migration (DEFERRED).** Design and test the resumable
   background copy/pointer-switch ledger on synthetic rows, then decide whether
   historical objects should move at all. Preserve Supabase reads throughout;
   no physical delete is implied.

**Completed first coding slice:** 2A, with the provider interface limited to
the current 15 MiB receipt binary path and Supabase as its sole implementation.

## Phase 2A implementation and Hosted Dev evidence

- Backend-only `AttachmentStorageProvider` supports `put(objectKey, bytes,
contentType)`, `read(objectKey)`, and `stat(objectKey)`. The sole registered
  identifier is `supabase_storage`; unknown or missing values throw without
  falling back. `object_path` remains the provider-neutral key. Upload, private
  download, and the existing OCR binary read now resolve through the provider.
  The provider alone accesses the private `ledger-receipts` bucket. No Mobile
  API, SQLite schema, object path, or OCR behavior changed.
- Additive Postgres migration `20260927000300_receipt_storage_provider.sql`
  adds `receipt_assets.storage_provider TEXT NOT NULL DEFAULT
'supabase_storage'` with a bounded nonempty check. It was applied locally
  and to Hosted Dev `tuqigdxrvrerfewsxqgm` on 2026-09-27. Existing rows
  resolve to Supabase by default; new rows explicitly set the same identifier.
  No binary was copied, moved, rewritten, or physically deleted by the migration.
- Supabase `stat` downloads the exact object and computes actual byte count and
  SHA-256; Storage does not supply a trusted SHA-256 through this path. The
  application SHA-256 remains authoritative. Current upload completion retains
  its existing metadata checks; it does not call `stat` or independently verify
  remote persistence. See the durability prerequisite below for changes that
  would depend on a stronger confirmation.
- Local validation: 9 focused Vitest files / 106 tests; TypeScript, affected
  ESLint, Prettier, Backend bundle build, and `git diff --check` passed. Four
  receipt/attachment pgTAP files / 30 tests passed after local migration. The
  older Personal Payment pgTAP fixture could not run in the existing dirty
  local database because a setup delete hit a Journey-member FK referenced by
  an earlier Expense; focused Personal Payment Vitest compatibility passed.
- Hosted Dev Backend image `sha256:7bd88516063599575e06fe31a13ddb5e8f741030af24ebcd4200d107d43e96ba`
  is healthy through its container and public `/health` checks. The prior
  source snapshot remains on the Dev host for rollback. Production was not
  accessed. Bounded acceptance used the existing synthetic QA Journey:
  pre-migration JPEG attachment downloaded with its expected SHA-256;
  outsider read returned 403; one new synthetic Expense attachment received
  Supabase provider metadata, uploaded, tolerated a duplicate create and
  duplicate binary PUT, then downloaded byte-for-byte. Temporarily setting
  only that synthetic row to an unknown provider returned 503 with no binary;
  the provider was restored, the read returned 200, and the same synthetic
  attachment was tombstoned. Its final read returned 404. Its remote object
  remains under the approved no-physical-deletion rule.
- Existing Personal Payment evidence has shared provider routing in the
  gateway and focused automated coverage. Hosted Dev has no safe existing
  linked Personal Payment evidence fixture, so no additional live payment row
  was created solely for this refactor. Existing OCR read has provider routing
  and focused automated coverage; OCR was not enabled or exercised live.

Phase 2B needs a named German storage product and region, private endpoint and
TLS model, bucket/key namespace, credential scope and rotation, read/stat and
checksum guarantees, durability/versioning/backup/retention, egress and request
limits, costs, operational owner, and an isolated synthetic test environment.
No German adapter, new-upload switch, dual-write, historical migration, cache,
quota, or physical deletion is part of 2A.

## Scheduling decision after Phase 2A acceptance

- Phase 2A Storage Provider Abstraction is **ACCEPTED**. Phases 2B, 2C, and
  2D are intentionally **DEFERRED**. Existing attachments continue using
  `storage_provider = supabase_storage`; Production remains untouched.
- Resume 2B when OTR Mobile Album / shared object-storage infrastructure
  development begins. Evaluate and provision Hetzner Object Storage, then
  design a shared low-level S3-compatible adapter usable by Expense
  attachments, Personal Payment evidence, and Album media infrastructure.
  Attachments and Album keep separate domain lifecycles even if they share
  that low-level storage technology.
- No historical receipt migration is required before 2B. Future mixed-provider
  reads are the intended way to keep Supabase-backed historical assets
  accessible if new uploads later use another provider. Any historical copy
  remains an optional, separately approved 2D decision.
- **Remote-durability prerequisite:** Before any future local attachment cache
  manager automatically evicts a remotely uploaded local file, the system
  needs sufficiently strong confirmation that the remote object persists.
  `provider.stat()` exists, but upload completion does not yet independently
  call it to verify remote persistence. Current Supabase-backed attachment
  behavior is accepted without this change. Stronger confirmation is required
  before automatic local cache eviction, Clear Attachment Cache, or a switch
  to a new provider where upload acknowledgement alone is insufficient.
