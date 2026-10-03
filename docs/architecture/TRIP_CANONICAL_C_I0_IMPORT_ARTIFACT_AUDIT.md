# Trip Canonical Track C — C-I0 Import / Artifact Audit

- Status: **C-I0 AUDIT COMPLETE — REVIEW PENDING**.
- Date: 2026-10-03 (Pacific/Auckland).
- Working directory: `/Users/xoery/Project/otr-mobile-import`.
- Branch: `trip/import`.
- Audited HEAD: `c2f1ea38c11deaf5f59a3300e6a163985cc510d8`.
- Initial `git status --short`: empty. Only this report may change.

## A. Executive summary

The current receipt system is a working Mobile attachment lifecycle, not a generic
Trip intake model. Camera, Photos and Files feed OTR-owned draft bytes; Save stages
normalized files and atomically commits Expense, attachment metadata and upload
intent. An independently retryable worker sends authenticated Backend requests to
private Storage. Eviction requires fresh authenticated remote integrity proof.
These lower-layer mechanisms are the strongest reuse candidates. [E01–E08]

The association contract is narrower than its SQL suggests. One asset has one
Expense FK; the Backend rejects a second Expense. Personal Payment has a separate
link table, but the API assigns `link.id = receiptId`, the local row has only one
`personal_payment_id`, and the queue has one operation per asset/type. Content
authorization also reads a payment link with `maybeSingle()`. There is no safe
general many-object association contract. [E02, E04–E06, E09]

Real on-device iOS OCR produces text observations, confidence and geometry from
images. The deterministic parser ranks receipt amount/currency/date/merchant
candidates. Receipt Review confirms Title/Amount/Currency into an unsaved Expense
form; only later Save creates financial truth. PDFs are selectable, validated,
stored, uploaded and previewed, but have no implemented text extraction,
page-rasterization or semantic booking extraction. Default Backend OCR produces
null suggestions; its acceptance fixture produces canned values. [E10–E14]

Inbound sharing, URL/text/email import, durable Import Session and semantic
extraction jobs are absent from the checked-in Mobile/Backend runtime. Retained
media/capture/parser/AI tables are schema evidence, not operating services. [E15–E18]

**Provisional direction: NEW CORE**, meaning a small future source/artifact concept
with explicit business associations, sharing proven file infrastructure. It does
not mean migrating receipts now, one giant Artifact table, a new uploader, or an
approved design. Shared infrastructure alone is sufficient for byte reuse, but
does not meet the supplied one-source/many-output provenance cases. [Sections L–Q]

### Evidence method and baseline

CURRENT means behavior established in repository source at the audited HEAD;
it does not certify a Production release or live database. RECOMMENDATION and
INFERENCE are identified as such. Absence is bounded to checked-in application,
Backend, module/config/plugin and migration contracts. External legacy workers,
ignored generated native output and actual remote data are UNKNOWN.

Read baseline: `AGENTS.md`, current implementation handoff, A0 audit, A1-D identity
contract, A1-I1 report, PRODUCT, ARCHITECTURE, DATA_MODEL, API_CONTRACT, OFFLINE_SYNC,
ENVIRONMENT_AUDIT, legacy audit document and terminology glossary. A1-I1 preserves
`trips.id` and `journey_members.id` and remains review-pending. This audit does not
adopt A1-D's proposed access changes. Legacy Web source was not reopened. The
current-state handoff remains unchanged because this request permits only the
report. Historical plans/ADR status labels are resolved against current code.

### Source index

Paths below are relative to this worktree. Symbols/tables locate the inspected
evidence without relying on another worktree or deployment. Test files are existing
checks; fresh execution is separately described in W.

| ID | Exact source and evidence anchor |
| --- | --- |
| E01 | `src/data/files/receiptFileStore.ts`: draft record/copy/recovery/preparation, signature sniffing, normalization, `verifyReceiptFile`; `receiptFileStore.test.ts` |
| E02 | `src/data/repositories/ledgerReceiptRepository.ts`: `ReceiptAsset`, import/attach/detach/list/apply/reconcile, claims/recovery/enqueue; repository and lifecycle tests |
| E03 | `src/data/operations/expenseReceiptDraft.ts`: select/batch/restore/transfer/save; `src/data/repositories/ledgerExpenseRepository.ts`: create transaction and attachment edit; `expenseReceiptDraft.test.ts` |
| E04 | `src/data/db/migrations.ts`: migrations 10, 16, 19, 26, 35, 38, 39; receipt cache/queue and ownership/link/tombstone/source metadata |
| E05 | `src/data/sync/ledgerReceiptSyncWorker.ts`, `ledgerReceiptCoordinator.ts`, `ledgerReceiptTransport.ts`; `src/data/api/ledgerReceiptContracts.ts`; worker and transport tests |
| E06 | `backend/src/supabaseGateway.ts`: `receiptColumns`, `readReceipt`, `readDownloadableReceipt`, `createReceipt`, upload/complete/link/delete/OCR, payment links/replay, `filterReadableReceipts`; `backend/src/app.ts`: receipt and payment-attachment handlers |
| E07 | `backend/src/attachmentStorageProvider.ts`: provider resolution and private bucket put/read/stat; `supabase/migrations/20260912000600_ledger_2_stage_5_2_receipt_assets.sql`, `20260927000100_expense_attachment_limit.sql`, `20260927000200_expense_attachment_tombstones.sql`, `20260927000300_receipt_storage_provider.sql`; provider/gateway tests |
| E08 | `src/data/operations/ledgerMaintenance.ts`: `enforceReceiptCacheLimit`; `src/data/operations/openReceiptAsset.ts`: verified recovery cache and outbound open; their tests |
| E09 | `supabase/migrations/20260922000100_settlement_2_phase_1a_personal_payments.sql`: attachments PK/FKs/active pair index/validation, private read predicate and list; `docs/adr/0026-personal-payment-evidence-reuses-receipt-assets.md` |
| E10 | `src/native/receiptOcr.ts`: provider, validated observations, AbortSignal/errors; `modules/receipt-ocr/ios/ReceiptOcrModule.swift`: Vision request and native path/image/cancellation guards; `expo-module.config.json`; native adapter tests |
| E11 | `src/domain/receipt/parseReceipt.ts`, `receiptParserB1.ts`, `receiptParserB2.ts`, `receiptParserB3.ts`: candidate/evidence models, deterministic ranking and multi-document composition; parser tests |
| E12 | `src/features/ledger/expenseReceiptOcr.ts`, `receiptScanSession.ts`, `receiptReview.ts`, `ReceiptReviewSheet.tsx`, `LedgerExpenseEntryScreen.tsx`: transient session, user ownership, confirmation, selection, recovery and Save; related tests |
| E13 | `src/native/receiptDraftPreview.ts`, native `previewDraft`/Quick Look; `src/features/ledger/ExpenseAttachmentViewer.tsx`, `ExpenseAttachmentRow.tsx`, `LedgerExpenseDetailScreen.tsx`: image/PDF preview |
| E14 | `backend/src/receiptOcrProvider.ts`: extract interface, null/default and fixture; `backend/src/server.ts`: fixture flag/provider wiring; OCR provider tests |
| E15 | `app.json`, `package.json`, `plugins/`, `modules/`, `app/(tabs)/capture.tsx`, `app/(tabs)/expenses/receipt.tsx`; `src/hooks/useReceiptCapture.ts`, `src/components/ReceiptCaptureScreen.tsx`: existing native acquisition route, foundation Capture and absence search |
| E16 | `supabase/migrations/20260910000100_canonical_production_baseline.sql`: media/variants/image index, Capture uploads/events, parser families, AI/background/prompt families, storage connections, memory-shot families, bucket declarations and constraints |
| E17 | `src/data/sync/ledgerOperationalSync.ts`, `syncEngine.ts`, `src/hooks/useLedgerActiveSync.ts`, `src/data/bootstrap/bootstrapApplication.ts`: due-time scheduling, lifecycle/auth and nonblocking startup; no semantic import worker in Backend startup/routes |
| E18 | `src/data/files/localFileCache.ts`, `settlementExportFileStore.ts`, `src/data/repositories/ledgerReadRepository.ts`: unused generic cache, generated exports, receipt projection; `src/features/ledger-prototype/ReceiptScreen.tsx`: fixture-only prototype |
| E19 | `src/data/operations/personalPaymentPresentation.ts`, `src/features/ledger/PersonalPaymentSection.tsx`: authorized payment fetch followed by attachment hydration; no attachment acquisition control in that section |
| E20 | `docs/adr/0048-expense-attachments-receipt-draft-lifecycle.md`, `0049-local-receipt-ocr-foundation.md`, `0050-receipt-review-candidate-first.md`, `0051-receipt-multi-document-evidence.md`; `docs/CURRENT_IMPLEMENTATION_STATE.md`: receipt C1–C4 and prior device evidence |
| E21 | `supabase/migrations/20260911000100_ledger_2_domain.sql`: `expense_links`, `payment_records.evidence_asset_id`, `settlement_payments.evidence_asset_id`; `20260912000900_ledger_2_stage_7_2a_payments.sql`: payment evidence UUID persistence; `src/data/api/ledgerSettlementContracts.ts`, `src/data/repositories/ledgerSettlementRepository.ts`, `src/features/ledger/TransferDetailScreen.tsx`: optional evidence reference carried, UI supplies null |

## B. Current artifact/file model

“CURRENT PRODUCTION MOBILE” below classifies real product code rather than a
prototype. Release/Production deployment is not verified by this local audit.

| Concept | Classification | Representation and limit |
| --- | --- | --- |
| Expense receipt/attachment | CURRENT PRODUCTION MOBILE + CURRENT SERVER INFRASTRUCTURE | `receipt_assets` and local `ledger_receipt_assets`; working file/queue/preview flow. [E01–E08] |
| Personal Payment evidence | CURRENT SERVER INFRASTRUCTURE + current Mobile data/worker support | Same bytes/asset metadata; separate payment link table; one cached payment target. No dedicated picker in current `PersonalPaymentSection`. [E02, E05, E09, E19] |
| Expense payer / Transfer Payment evidence references | CURRENT SERVER INFRASTRUCTURE; Transfer Payment also has current Mobile typed persistence | Nullable `evidence_asset_id` UUID fields. Transfer Payment DTO/repository/SQL carry an optional ID, but current UI submits null; no file picker, receipt association/read grant or asset FK is established by these fields. [E21] |
| Canonical `expense_links` | SCHEMA capacity / UNUSED current file runtime | Expense-scoped unique type/target links including DOCUMENT/RECEIPT; polymorphic UUID has no receipt FK. Not the operational receipt linker. [E21] |
| Draft file + JSON sidecar | CURRENT PRODUCTION MOBILE | Account-owned `ledger-receipt-drafts/<owner>/<id>.<ext>` and optional `<id>.json`; no asset/upload until Save. [E01, E03] |
| Prepared receipt bytes | CURRENT PRODUCTION MOBILE | `document/ledger-receipts/<id>.jpg|png|pdf`; JPEG/PNG archive is normalized, PDF copied unchanged. [E01] |
| Downloaded receipt preview | CURRENT PRODUCTION MOBILE | `cache/ledger-receipt-previews/<serverId>.<ext>`; verified bytes, no new asset or durable download manifest. [E08] |
| Receipt OCR/parse documents | CURRENT PRODUCTION MOBILE | Transient in-memory observations, candidates and scan/review state; not stored raw OCR evidence. [E10–E12] |
| Backend OCR suggestion | CURRENT SERVER INFRASTRUCTURE, stub/fixture extraction | Persisted `ocr_suggestion` JSON; no actual OCR model in default provider. [E06, E14] |
| Picker/manipulator intermediate file | CURRENT PRODUCTION MOBILE | Picker cache URI; draft is copied before use; normalization output deleted after durable copy. Not an independent business artifact. [E01, E12, E15] |
| Settlement CSV/PDF/export manifest | CURRENT PRODUCTION MOBILE | Device-generated output under `settlement-exports`, SHA and manifest/digest identity; outbound sharing. Not inbound PDF parsing. [E18] |
| Generic `LocalFileCache` | UNUSED/UNKNOWN | URL download/exists/remove helper with path-safe key; caller search finds only definition. No receipt integrity/private-read guarantees. [E18] |
| Ledger prototype receipt/photo | PROTOTYPE | Fixture and `receiptAttached` flag; sample confidence text is not measured OCR. [E18] |
| `media_assets` | LEGACY/RETAINED SCHEMA | Original/compressed/thumb paths and sizes, MIME/dimensions, EXIF/GPS, provider/Drive references, preservation/retention, processing/AI state, OCR text, blur/duplicate/scene metadata; no current runtime pipeline found. [E16] |
| `media_asset_variants` | LEGACY/RETAINED SCHEMA | Unique asset/variant pair; thumbnail/preview only, relative path, MIME, dimensions/size, generated/access timestamps; provider constrained to `hetzner_disk`. Not receipt variants. [E16] |
| `image_index_records` | LEGACY/RETAINED SCHEMA | OCR/caption/objects/people/embedding, `image_hash`/`duplicate_hash`, quality and review/model/cost metadata. These hashes are not a demonstrated SHA-256 integrity contract. [E16] |
| `capture2_media_uploads` | LEGACY/RETAINED SCHEMA | Source/kind/name/MIME/size, expiring Vercel Blob staging key/URL, processing/retry state, final Media/Memory/provider references, itinerary/day/job references; no Mobile worker. [E16] |
| `journey_capture_events` | LEGACY/RETAINED SCHEMA | Original/transcribed text, input type, capture time/timezone/GPS, intent/confidence/actions/reference arrays/status; no local operational mirror. [E16] |
| `journey_storage_connections` and root photo provider fields | LEGACY/RETAINED SCHEMA | Drive/provider folder/account/token-reference metadata; not current attachment storage selection. [E16] |
| Memory/Memory Shot/render artifacts and shares | LEGACY/RETAINED SCHEMA | `memory_entries.media_url`; `memory_shots`, snapshots/assets; `memory_shot_artifacts` output storage/manifest/preview/public URLs, poster/story variants and render state; `motion_story_shares` expiring token references. No import semantics inferred from “artifact”. [E16] |
| Profile/member avatars and Trip cover | LEGACY/RETAINED SCHEMA / display references | URL attributes in baseline profiles/members/trips; no generic acquisition/cache/upload lifecycle established. [E16] |
| TravelDocument/Ticket/LocalAsset/Import Session | PLANNED, no implemented generic store | Draft product/data/API descriptions and Trip planning documents do not establish a current repository, worker or endpoint. [A0, E15–E18] |

### Receipt metadata detail

Server asset PK is UUID `id`. `journey_id` references `trips`; nullable
`expense_id` references canonical `expenses` with RESTRICT deletion. Uploader
`created_by` references Auth User. `object_path` is unique; `(journey_id,
created_by, local_id)` is unique. MIME is JPEG/PNG/PDF, size 1–15 MiB and hash is
64 lowercase hex SHA-256. Actual upload size/hash are separate completion evidence.
Revision/timestamps drive `RECEIPT` Ledger changes. `storage_provider` defaults
to `supabase_storage`; `deleted_at` is Expense-only. [E07, E09]

SQLite records local/server IDs, local URI, object path, Journey/Expense and one
payment parent/link state, uploader's local isolation metadata, upload/OCR
state, suggestion JSON and tombstone metadata. v39 adds original filename,
original MIME/size and normalized image width/height. These source fields are
local only: `receiptColumns`/DTO omit them, uploader, provider and revision.
Other devices receive the normalized binary metadata, not a complete provenance
record. There is **no persisted acquisition source enum** distinguishing Camera,
Photos, Files, email or URL, and no persisted original-source SHA separate from
the archived SHA. A draft holds its own hash before normalization. [E01–E06]

## C. Acquisition paths

### Shared current path

```text
Native selection → picker URI → signature/MIME/size validation
→ OTR-owned account draft + SHA-256 (+ Journey/session JSON sidecar)
→ optional image OCR/candidate Review → Confirm into New Expense draft
→ Save: verify draft hash → stage normalized durable bytes, retain draft
→ SQLite transaction: Expense/audit/command + receipt rows + upload/link intent
→ remove duplicate draft after successful commit
→ Expense sync obtains server identity → receipt worker claims upload
→ verify durable file → create metadata → PUT bytes → upload-complete → link
→ authenticated Backend → private ledger-receipts object
→ metadata reconciliation/pull → local preview or verified re-download
```

This is not a file-system/SQLite atomic transaction: pre-commit staged bytes can
be orphaned, so retaining the source until database success is essential. [E01–E08]

| Input | Native/user path | Preparation and integration |
| --- | --- | --- |
| Camera | Camera permission, `launchCameraAsync({mediaTypes:["images"],quality:1})`; one image per invocation | Picker file copied to owned draft. Scan is only New Expense; ordinary attachment skips OCR. Uses the shared Save/upload path. [E12, E15] |
| Photos | Media-library permission, image library, multiple selection and remaining Expense capacity | Each selected URI copied independently; batch keeps earlier valid drafts if a later copy fails. Scan parts are serially queued for OCR and combined as evidence. [E03, E12] |
| Files/PDF | Document picker JPEG/PNG/HEIC/HEIF/PDF, `copyToCacheDirectory:true`, `multiple:true` | PDF omitted from scan picker. Signature—not extension alone—sets actual MIME; PDF stays unchanged through durable copy. Ordinary New/Edit attachment uses Save; legacy receipt route can import directly into durable repository. [E01, E03, E12, E15] |

Validation accepts JPEG/PNG/HEIC/HEIF/PDF signatures, permits selected MIME aliases
and HEIC/HEIF compatibility, and rejects declared-content mismatch. Source images
are bounded at 50 MiB; new PDFs at 10 MiB. Image preparation rejects over 60 million
pixels, resizes to long edge 2200, preserves PNG transparency and otherwise archives
JPEG at quality 0.83. Prepared output is bounded at 15 MiB, then SHA-256 hashed.
Native OCR separately uses source images with a 3200-pixel thumbnail ceiling.
Hash/dimensions therefore describe different representations at different stages.
Backend PUT validates byte count and SHA against metadata; it ignores the supplied
PUT MIME argument and stores canonical row MIME. Server-side signature sniffing
is not implemented in that function. [E01, E06, E10]

`useReceiptCapture`/`ReceiptCaptureScreen` is an existing Expense-oriented route:
it accepts Journey/Expense/mode parameters, refuses scanning there, validates
Expense editability, imports with `requestOcr:false`, then kicks operational sync.
The principal form selects drafts first, including edit attachments, and commits
on Save. Do not collapse these paths into a generic Import feature. [E12, E15]

Generic mechanisms: pickers, owned file copy, sniff/hash, staging/verification,
worker claims, private byte put/read and recovery proof. Expense dependencies:
capacity, draft/Save transaction, financial mutation checks, server-parent wait,
route state, receipt queue/DTOs and OCR field model.

## D. Offline/storage lifecycle

| Event | Current guarantee / qualification |
| --- | --- |
| Offline selection/scan | Draft bytes are app-owned; native image OCR has no upload/network dependency. JSON recovery is written only when Journey supplied. [E01, E03, E10] |
| Save failure | Source remains if preparation or SQLite commit fails; successful Save removes only duplicate draft. Earlier valid batch parts survive later-part failure. [E03] |
| Process restart before Save | Recovery validates owner/Journey/path, exact size/hash/MIME; unreadable candidates are retained for manual recovery. New Expense restores at most three. Scan ID/order persist, OCR and unsaved form values do not. [E01, E03, E12, E20] |
| Process restart after Save | Metadata and asset operations survive; worker recovers previous-process or expired processing claims. Same receipt identities and keys continue. Not an OS background-transfer guarantee. [E02, E05] |
| Upload failure | Asset becomes FAILED; operation is retryable/paused/actionable according to error; locally saved Expense and bytes remain. Parent identity and pending replacement deletion can delay upload. [E05] |
| Canonical recovery | Missing durable file can recover via authenticated content GET, with size/SHA validation before writing preview cache; an already valid preview works offline. No network means missing bytes remain unavailable. Existing present durable URI is returned without fresh hash in the open helper; upload/eviction perform separate checks. [E08] |
| Eviction | Operational maintenance uses 250 MiB receipt budget and oldest update first. Requires UPLOADED, server ID/object key, owned durable path, no tombstone/unlink or unresolved operation, valid local bytes, fresh HEAD object/MIME/size/SHA and fresh GET/hash. Failed proof retains file, even above budget. Metadata URI clears with a guarded SQL update before file deletion; crash leaves a recoverable duplicate. [E08, E17] |
| Expense attachment deletion | Local transaction records tombstone/deleting account plus DELETE operation; hides it for that account and releases a slot. Does not delete bytes. Server rejects active payment evidence, then tombstones metadata, retaining private object. No restore/reparent of tombstoned asset. [E02, E05–E09] |
| Payment unlink | Separate link soft delete; no asset/object deletion. Local DELETE_PENDING then clears one parent after response. Server link revision becomes 2. Not a generic delete lifecycle. [E02, E06, E09] |
| Cleanup | Completed asset operations older than 30 days may be removed; pending/failed intent and domain metadata are not whitelisted for deletion. No automatic receipt-object purge in inspected provider. [E08, E17] |

**Reuse assessment:** durability and integrity gates are suitable foundations.
Direct receipt cache policy is insufficient for a future boarding pass that must
stay offline: no travel priority/pin/download manifest exists, and preview bytes
are OS-evictable cache. Source images are normalized on promotion and the draft
original can then be deleted; byte-exact original retention needs a future explicit
policy. This is a known representation distinction, not a contradiction in current
receipt storage. Do not weaken receipt protection to solve it.

## E. Security/authorization

| Boundary | Current enforcement |
| --- | --- |
| Bucket/object naming | Private `ledger-receipts`; `<tripId>/<receiptId>/original`. Provider has no public URL/signing method; current Mobile receives bytes through Backend, not a signed URL. Upsert is checked against canonical metadata/hash before put. [E06–E07] |
| Uploader vs reader | Server `created_by` owns upload identity; it is not the complete read ACL. Upload/complete/link/OCR lookup requires exact uploader and Journey, nondeleted asset. [E06] |
| Mutation admission | Receipt handler authenticates and checks `canWriteTrip`; local form/repository mirror Expense role/capacity gates. Delete is Journey-write admitted, not uploader-only; gateway delete ignores actor and protects payment-linked evidence. Do not infer all mutation paths share the same ACL. [E02, E06] |
| Expense reads | Content authorization allows creator, legacy Trip member or linked Journey Member when asset has `expense_id`; this is current Journey/Expense association-based visibility, not a new viewer policy. [E06] |
| Unlinked asset reads | Uploader must still be a current linked Journey Member for the uploader-only content fallback. An asset UUID alone is not authority. [E06] |
| Private payment reads | Active attachment association may grant bytes through `ledger_can_read_personal_settlement_payment_1a`: historical explicit nonrevoked record grant, or linked Organizer/owner/counterparty. General Trip membership alone is insufficient for payment-only evidence. [E06, E09] |
| Metadata feed | `filterReadableReceipts` includes Expense assets, uploader assets and assets linked to readable payments; bootstrap/pull apply these filters. Content checks remain separate and may be stricter than a metadata projection. [E06] |
| Service role | Receipt table forces RLS and revokes public/anon/authenticated access; Backend service client/storage provider performs operations after route/domain authorization. Service role is not a reason to skip those checks. [E06–E07] |
| Device Account isolation | Unsynced assets/operations carry local owner/owner account; worker selects active account. General receipt reads require cached account/Journey actor context; synced Journey receipts are shared projections. Draft directories are account-scoped; durable/preview filenames are asset-scoped, not per-account ACLs. [E01–E05] |

Payment attachment cache is **not** a generic private-artifact isolation template:
`listPersonalPaymentAttachments` filters one payment ID and local ownership for
unsynced rows, not a per-user entitlement for synced rows. Normal presentation
first reads the account-authorized payment repository, then hydrates its links;
`applyPersonalPaymentAttachments` shares an asset row. `readReceipt` relies on
Journey context and has no payment-grant-specific predicate. This audit does not
prove safe arbitrary direct calls or cross-account private evidence lookup through
that cache; generic reuse must include explicit account/record visibility. [E02, E19]

An asset also linked to an Expense can be readable through the shared Expense
path even if payment-only access would fail. A generic link must not silently
publish formerly private evidence. Target authorization, mutation rights,
association visibility, removal and byte retention must remain object-specific.
Track A access/identity is unchanged; any proposed dependency on new access rules
requires stopping for that track's separate decision.

## F. Association/cardinality model

| Layer | Exact cardinality/constraint | Consequence |
| --- | --- | --- |
| Receipt SQL | `receipt_assets.id` PK; one nullable `expense_id`; same-Journey attachment target/parent-row serialization when claiming/changing target; max three active per Expense | Many assets per Expense up to three; one asset cannot represent two Expense targets. Tombstone requires Expense and forbids restore/reparent. [E07] |
| Expense API | Create optionally supplies Expense; `links` accepts only `{expenseId}`; `linkReceipt` rejects different existing target (`RECEIPT_ALREADY_LINKED`) | No append-many association or Booking/Itinerary target endpoint. [E05–E06] |
| Payment SQL | Independent UUID link PK, receipt FK RESTRICT, payment/Journey FKs; active unique `(record_id,asset_id)` rather than unique `asset_id` | SQL could represent several distinct payment links for one asset if given different link IDs. Validation requires same Journey and linked owner creating link; does not exclude Expense-linked assets. [E09] |
| Payment API | Inserts `id:receiptId`, `asset_id:receiptId`; requires uploaded asset and uploader-owned lookup; immutable replay payload includes payment/receipt | A second payment link collides with link PK, including after soft unlink. Generic association IDs are absent; arbitrary relinking is not supported. [E06] |
| Content API | Active payment-link lookup is `maybeSingle()` | More than one active payment link can cause lookup error; SQL-only many-link insertion would not make current read contract safe. [E06] |
| Local cache | One `expense_id`, one `personal_payment_id`, one link state in each asset row; payment hydration replaces row and parent | Multiple payment targets cannot coexist. `attachExpense`/`attachPersonalPayment` overwrite a local target rather than preserve link history. [E02, E04] |
| Queue | `UNIQUE(asset_id,operation_type)`; LINK dispatch prioritizes payment if `personalPaymentId` present, else Expense | No independent durable command per association. Supplying both can enqueue only one LINK operation. [E02, E04–E05] |
| General pull | `applyReceipt` uses INSERT OR REPLACE without payment-parent columns; payment hydration supplies them separately | General receipt pull can clear cached payment linkage; it is not a lossless generic link projection. No fix in this audit. [E18–E19] |

**Can one current receipt asset safely attach to multiple business objects? NO,
as a supported general contract.** Two Expenses are prevented by server FK shape
and link guard. Several Payments are prevented by API link-ID choice, local
single-parent projection, queue uniqueness and single-link content lookup.

**Narrow exception:** one Expense plus one Payment is structurally possible;
SQL validation and API do not universally reject the overlap. It is not proven
as a supported end-to-end flow: the worker prioritizes payment, the local Expense
delete helper rejects payment-associated rows, and server Expense deletion
protects active payment evidence. Shared Expense visibility may expose the bytes
more broadly. No many-object claim follows from this exception. [E02, E05–E09]

Other links: retained Capture upload rows can reference itinerary event/reservation,
day, Media/Memory/job; retained media links to Memory; Memory Shot assets use
polymorphic source IDs. They are not operational receipt links or a reusable
Mobile association service. [E16]

Canonical `expense_links` permits ITINERARY_EVENT/ITINERARY_RESERVATION/DOCUMENT/
RECEIPT targets, unique by Expense/type/target, but its target UUID is untyped at
the FK layer and no current receipt worker/gateway consumes it. Separately,
Expense payer `payment_records` and shared Transfer `settlement_payments` have
nullable evidence UUIDs without asset FKs. Transfer evidence is carried through
typed API/local payment persistence and SQL, while current `TransferDetailScreen`
supplies null. These references do not grant receipt content access: the read path
examines Expense association, Personal Payment links and uploader context only.
Nor does the Expense attachment delete guard count these optional references.
They are additional evidence-reference capacity, not proof that arbitrary
cross-object receipt attachment is safe or supported. [E06, E21]

## G. OCR architecture

**TEXT RECOGNITION:** `createReceiptOcrProvider` wraps the local Expo `ReceiptOcr`
module. iOS only; Android/missing bridge reports UNSUPPORTED_PLATFORM. Input must
be `file://` under owned receipt draft/durable directories after symlink resolution,
nonempty, ≤50 MiB. ImageIO accepts JPEG/PNG/HEIC/HEIF and ≤60M pixels; it makes an
orientation-corrected thumbnail up to 3200 px. No PDF reader is involved. [E10]

Vision `VNRecognizeTextRequest` revision 3 uses accurate recognition, language
correction and automatic language detection. Capabilities/results return actual
supported language identifiers, not a hard-coded guarantee for every language.
Each top text candidate has confidence, normalized top-left bounding box;
document carries image dimensions, engine/revision, duration and languages.
TypeScript validates geometry/confidence and clamps tiny floating-point boundary
errors. AbortSignal invokes request-ID cancellation; native requests are tracked
under a lock. Feature generation/session revisions discard late results and
background suspension invalidates in-flight session work. [E10, E12]

**SEMANTIC PARSING:** separate pure receipt functions interpret the recognized
observations. Recognition confidence is not booking/amount correctness and parser
ranking points are explicitly not calibrated probabilities. OCR can recognize
“NZ5069 8 Oct” without knowing flight/year/traveller/timezone meaning. [E11]

Backend's differently shaped `ReceiptOcrProvider.extract(bytes,mimeType)` returns
an Expense-shaped suggestion, not observations. JPEG/PNG/PDF are allowed at that
interface, but default returns all nulls; fixture returns the Stage 5.2 cafe.
Server startup uses `OTR_DEV_RECEIPT_OCR_ACCEPTANCE_FIXTURE` default `0`.
`ocrReceipt` runs synchronously in request, after upload and only on an unlinked
asset; an Expense-linked asset is rejected. SUCCEEDED can therefore mean a
successful stub call, not recognized text or semantic extraction. [E06, E14]

## H. Receipt parser / structured review

```text
Verified source images → Vision observations
→ B1 receipt lines/numeric/currency evidence
→ B2 receipt total ranking + B3 transaction date/merchant ranking
→ combined document-scoped candidates, warnings and ambiguity
→ Receipt Review: editable Title / Amount / Currency
→ explicit Confirm: current session/version/fields/draft IDs verified
→ three reviewed fields + images transferred to New Expense draft
→ ordinary Save: canonical local Expense and attached evidence
```

B1 groups geometry, validates/bounds observations (up to 512, per-text limits),
tokenizes monetary formats and currency symbols/codes, distinguishes receipt
evidence from Journey currency hints. B2 ranks grand-total/due/paid labels,
same/adjacent line and alignment while penalizing subtotal/tax/change/tendered,
unit price and other receipt meanings. It computes exact supported currency minor
units. B3 favors transaction-date and merchant-header evidence and penalizes expiry,
statement, check-in/out and nonmerchant text. These choices are specifically
unsuitable as general travel semantics: a stay's check-in date is not a receipt
transaction-date candidate. [E11]

Single-document version is `receipt-b4.2`; combined evidence version is
`receipt-c1`. One to three documents get document-prefixed observation/line/token
IDs, document-local geometry, combined reranking and explicit conflicting strong
candidate ambiguity. Matching evidence can merge; cross-image currency inference
is tightly limited. It still produces one receipt field set, not multiple tickets,
travellers or heterogeneous Trip objects. [E11–E12]

Review separates candidates from values and marks SYSTEM_SUGGESTED vs USER_EDITED.
Edits/selections survive rescans; an explicit reset permits refreshed suggestions.
Strong amount suggestions require clear final-label/currency evidence; ambiguity
remains selectable alternatives. Language can offer currency choices; user
confirmation validates currency/scale and amount-currency mismatch. Session ID,
revision, document/draft IDs and submitted values are rechecked before transfer.
Confirm does not save or upload; OCR Date does not change Expense Date. Cancel
discards only pending scan files; already selected attachments/form remain. [E12]

Reusable **patterns**, not the parser itself: candidate/value separation,
explainable evidence/reasons, explicit ambiguity, manual ownership, versioned
confirmation and no automatic business writes. Raw observations and field-level
confirmation provenance are transient: `ReceiptReviewResult` has values and source
IDs, not persisted evidence spans or actor-confirmation history. [E11–E12, E20]

## I. PDF capability

| Capability | Current result | Evidence |
| --- | --- | --- |
| Select PDF from Files | IMPLEMENTED, ordinary attachment only; multiple files allowed | E12/E15 document-picker branch |
| MIME/signature/size | IMPLEMENTED; `%PDF-` sniff, declared MIME check, new-selection 10 MiB; binary contract/bucket 15 MiB | E01/E05/E07 |
| Local persistence/hash | IMPLEMENTED; draft then unchanged durable PDF bytes, SHA verification | E01/E03 |
| Upload/private recovery | IMPLEMENTED through receipt routes/provider and authenticated size/hash recovery | E05–E08 |
| Preview | IMPLEMENTED iOS Quick Look for allow-listed draft/durable/preview roots; saved PDF first resolves local/recovered bytes. Outbound Sharing also opens files | E08/E10/E13 |
| OCR PDF | ABSENT; native image type filter excludes PDF, feature scan rejects it | E10/E12 |
| Parse embedded PDF text | ABSENT from current runtime | Search for PDFKit/CGPDF/pdfjs/text extraction; E15/E17 |
| Rasterize pages for OCR | ABSENT from current runtime | Same module/runtime search |
| Extract booking semantics | ABSENT | Receipt parser handles receipt observations; no booking parser/confirm command |

The PDF gap is **between validated stored/previewable PDF and machine-readable
source evidence**. Page count/order, page text/geometry, rasterized-page identity,
encrypted/malformed PDF treatment and booking extraction are not implemented.
Passing PDF MIME to the Backend stub proves none of these. Generating a Settlement
PDF from HTML is unrelated inbound capability. [E14, E18]

## J. Share/Text/URL/Email intake

Searched checked-in app/src/Backend/modules/plugins/config/package and schema for
Share Extension/share-intent receivers, inbound sharing, clipboard/pasteboard,
initial/open URL listeners, universal-link/document-type declarations, Gmail,
email forwarding/MIME and PDF text extraction. Inspected actual Capture/receipt
routes and native module rather than relying only on keyword matches. [E15–E18]

| Intake | Classification | Actual boundary |
| --- | --- | --- |
| “Share this PDF/image/webpage to OTR” from another app | ABSENT | No checked-in Share Extension target/plugin, inbound Expo receiver, Android share-intent filter or source-import handler. Generated external builds unknown. |
| Outbound Share/Open/Settlement export | IMPLEMENTED | `Sharing.shareAsync` sends existing local files outward; not receiving another app's payload. E08/E18 |
| Custom URL scheme | IMPLEMENTED routing only | `otrmobile`/Expo Router and installed `expo-linking`; no file/text/URL intake receiver inferred from a scheme. E15 |
| Pasted text as an import source | ABSENT runtime; PLANNED Capture; SCHEMA ONLY capture original text | Native text-input paste into ordinary Expense fields is not an Import Session or parser intake. E12/E16 |
| Clipboard/pasteboard reader | ABSENT | No checked-in source acquisition adapter/caller found. |
| URL/booking webpage import | ABSENT runtime; SCHEMA ONLY event/reservation URL | Storing URL fields in legacy planning schema is not fetching/snapshotting/extracting a webpage. E16 |
| Email forwarding or confirmation processing | ABSENT | No inbound mailbox endpoint, forwarding address or confirmation parser in runtime. |
| Gmail connector | ABSENT | No Mobile/Backend Gmail ingestion/auth connector found; legacy Drive metadata is not Gmail. |
| MIME email/EML intake | ABSENT | Allowed file MIME set excludes email; no RFC822/MIME body/attachment parser found. |
| Unified Capture routing | PLANNED / SCHEMA ONLY | Product direction and capture rule/event tables; current Capture tab is `FoundationScreen` “Routing boundary”. E15–E16 |
| External legacy deployed email/share service | UNKNOWN | Not inspected; no remote/legacy Web access. |

No Gmail integration or inbound UI is designed here.

## K. AI/job infrastructure reality

| Infrastructure | Schema capacity | Runtime finding |
| --- | --- | --- |
| `ai_jobs`, `ai_job_attempts`, `ai_cost_events` | Worker/task/provider/model/prompt/version, queued status, payload/result, retries/due time, attempts/tokens/cost | LEGACY/RETAINED SCHEMA; no current Mobile/Backend import dispatcher or AI worker found. E16/E17 |
| `background_jobs`, batches/dismissals | Status/progress/step, attempts/available/start/end, per-batch totals, user dismissal | Same; not the Mobile durable receipt queue. |
| Capture rules/prompts/routing config | Thresholds, auto-execute/confirmation flags, local/LLM routing booleans | Schema defaults do not run a router. Current Capture route remains foundation. |
| Parser aliases/rules/examples/corrections/parse logs | Original/normalized text, parse result, rule/confidence, `user_accepted`, embedding/corrections | Schema only; no current runtime receipt parser reads these tables. No separate operational “parser_jobs” table/worker found. |
| Prompt templates/versions | Worker/task/key/version/language/environment/status | Retained configuration, no proof of model execution. |
| Capture media processing | Upload staging/expiry/retries/final refs/job ID | Retained schema, no Mobile staging worker. |
| Legacy itinerary confidence/needs_review/source_text; media AI/OCR flags | Candidate-like attributes | Not durable Trip candidate lifecycle or field provenance. |
| Native Vision + deterministic receipt parser | Actual image recognition and heuristic candidates | IMPLEMENTED locally, no LLM required. E10–E12 |
| Receipt OCR queue/status | Durable OCR operation and server RUNNING/SUCCEEDED/FAILED suggestion | Old receipt service path, request-synchronous default stub; new scan bypasses upload. E05/E14/E20 |
| Backend rate scanner / financial Review | Actual bounded FX demand work and deterministic financial findings | Domain-specific operations, not AI import jobs. E17 |

No Foundation Models/LanguageModelSession implementation found in checked-in native
or app code. Optional on-device ranking is planned in the receipt handoff, not an
operating semantic model. Schema/job names must not be treated as AI readiness.

## L. Generalization candidate matrix

These are recommendations for later design; no extraction/refactor is performed.

| Concept | Classification | Reuse boundary |
| --- | --- | --- |
| Existing receipt behavior and contracts | KEEP AS-IS | Preserve current Expense/payment guarantees and compatibility. |
| Expo Camera/Photos/Files acquisition | EXTRACT/GENERALIZE LATER | APIs work; callers embed Expense capacity/route/state. |
| Owned draft and durable copy | EXTRACT/GENERALIZE LATER | Reuse staging/retained-source approach; define source kind/original retention and session ownership. |
| MIME sniff/size/SHA checks | EXTRACT/GENERALIZE LATER | Integrity primitives useful; allow-list/size policy remains domain/input-specific. |
| Image normalization | EXPENSE-SPECIFIC | Archive tuning may discard ticket QR/detail or original evidence; do not globally apply. |
| Backend attachment provider put/read/stat | EXTRACT/GENERALIZE LATER | Method shape useful; only Supabase supported, bucket/name bound to receipts. No second provider needed now. |
| Private Storage and authenticated byte transport | KEEP AS-IS for receipts; EXTRACT/GENERALIZE LATER for new sources | Preserve domain authorization; no public/signed-URL requirement inferred. |
| Fresh recovery proof / protected local original | KEEP AS-IS invariant | Generalize implementation later without relaxing proof. |
| Cache budget/preview caching | EXTRACT/GENERALIZE LATER | Add only approved travel offline-retention semantics; current cache can evict. |
| Asset upload queue claims/retry/due-time | EXTRACT/GENERALIZE LATER | Reuse lifecycle patterns, not current operation enums/unique link key as generic contract. |
| Image viewer / Quick Look | EXTRACT/GENERALIZE LATER | Useful rendering; receipt root allow-list/localization and Expense field coupling remain. |
| Native image text-recognition adapter | EXTRACT/GENERALIZE LATER | Separate observations from receipt semantics; retain native path/security/cancellation validation. |
| Receipt B1/B2/B3 rules and three-field Review | EXPENSE-SPECIFIC | Receipt evidence/total/merchant/financial scale rules, not travel parsing. |
| Candidate/evidence/ambiguity/user-owned confirmation pattern | EXTRACT/GENERALIZE LATER | Persist only approved provenance; raw OCR retention is a new decision. |
| Three-attachment / three-image evidence limit | EXPENSE-SPECIFIC | Must not become generic session/file/page/output limit. |
| Receipt Expense tombstones + payment unlink | EXPENSE-SPECIFIC | Different asset vs relationship lifecycle; no generic delete/restore. |
| Current receipt association/cache ACL | DO NOT REUSE as generic linking/security contract | One parent per type, non-lossless hydration, wider sharing/private seams. |
| `LocalFileCache` URL helper | DO NOT REUSE as protected evidence store | No integrity/auth/recovery/intent protection; no active caller found. |
| Media variants/storage/indexing legacy runtime | UNKNOWN | Schema known; active worker, recovery, privacy/retention unverified. |
| Memory Shot/story/poster artifact graph | DO NOT REUSE | Content-generation domain excluded; polymorphic names do not supply travel provenance. |
| AI/parser/background legacy tables | UNKNOWN | No operational current consumer; do not instantiate framework from schema alone. |

## M. Future Artifact options

Minimum **semantic responsibilities**, not a schema: identify original source and
acquisition method; distinguish original from derived/normalized bytes; keep
MIME/size/hash/storage identity and uploader; preserve Trip scope and access;
represent explicit business associations with independent visibility/removal;
separate byte readiness, extraction state and human confirmation; carry preview
metadata and durable source-to-candidate/field/output provenance when approved.
Text/URL/email can be source material without pretending they are image bytes.

| Option | Evidence-backed advantages | Cost/risks | Assessment |
| --- | --- | --- | --- |
| A. Extend `receipt_assets` | Existing bytes/provider/worker/recovery | Expense FK/tombstone-only constraint, max-three trigger, suggestion shape, Ledger feed/API/private rules and local one-parent projection all need compatible change | Weak fit; not a simple rename. Would reopen Expense invariants. |
| B. Generic artifact core + object links | Handles one-source/many-outputs and many-sources/one-booking without business truth in bytes | Requires explicit ACL/link IDs, local lossless projection, provenance, original/derived/retention semantics; cannot blindly union object read access | **Likely direction, PROVISIONAL NEW CORE**; share lower infrastructure and preserve receipt behavior. |
| C. Domain-specific assets + shared file infrastructure | Least receipt disturbance; domain ACL/deletion naturally separate; no compulsory migration | Cross-domain source identity and field lineage would still need a coherent contract; duplicating source records could obscure one PDF producing several objects | Viable if approved first slice needs only domain documents; not enough alone for all target cases. |
| D. Preserve receipts and define Trip-only source/evidence core first | Bounded version of B; no universal media registry or receipt conversion, evolve from actual Trip needs | Future overlap/mapping still needs deliberate association policy; not proof that a second uploader is required | Preferred sequencing of B, contingent on C-I1 review. |

Not decided: physical tables, naming, migration, whether sources can exist without
Trip assignment, exact retention and private-access algebra. Evidence favors a
distinct source/link responsibility, not one table containing source, extraction,
all candidates and canonical Booking data. No choice authorizes implementation.

## N. Business-truth boundary

**Invariant for future design:** Artifact is evidence/source material, not canonical
Trip business truth. A PDF containing “NZ5069 8 Oct” can support a proposed flight;
only an explicit validated user confirmation produces canonical Booking data.
Deleting/replacing/re-reading that source must not silently remove or rewrite the
Booking. Changed extracted evidence may offer a new reviewed action; it is not
automatic overwrite authority. Losing the source changes evidence availability,
not confirmed business identity or history.

Current Expense architecture demonstrates this separation: OCR/parse are transient;
Confirm copies three values into a form; ordinary Save validates/writes Expense;
worker upload/OCR/link does not mutate Expense amounts/valuation; attachment deletion
tombstones evidence without deleting its parent financial record. Expense audit
protects saved business history. It does **not** establish persisted field-to-source
lineage: confirmed values can outlive OCR evidence without a durable support map.
The principle is supported; general travel provenance remains missing. [E03, E05,
E11–E12, E20]

## O. Import Session readiness

| Future input | Present capability | Missing general intake contract |
| --- | --- | --- |
| One file/image | Picker, owned draft, validation/hash and upload lifecycle | Generic source/session identity, target-independent Save/confirmation and ACL |
| Multiple files | Photos/Files multiple selection, independent draft arrays and per-asset operations | Durable batch/session membership, partial failure/cancel/restart disposition and independent associations |
| Multiple images supporting one object | Receipt session combines up to three images | Domain-independent multi-source evidence and durable field provenance |
| PDF | Validated unchanged attachment and iOS preview | Page/text/image extraction, page evidence identity, multi-output grouping |
| Text | Ordinary editable fields and retained capture text schema | Source snapshot, acquisition/retention/processing/confirmation pipeline |
| URL | Scheme routing and legacy URL attributes | URL source acquisition/snapshot/version, offline policy, safe processing |
| Future email | Retained generic source/payload JSON can hold data only in theory | Actual authorized intake, MIME/body/attachments/provenance/retention; no current connector |

Current multi-file intake is **multiple independent receipt drafts/assets**, not a
generic durable Import Session. A transient ReceiptScanSession is one Expense's
one-to-three-image evidence set, no mixed inputs or multi-object result graph.
Recovered image references require re-OCR; reviewed field values do not resume.
The three limit appears in UI capacity, domain validator, draft restore, scan
session, evidence parser and server attachment trigger; none is a justified
generic Import limit. PDF pages, travellers, candidates and source files also
need distinct counts. [E01–E05, E11–E12]

## P. Provenance requirements

| Required question | Current useful pattern | Gap for future Trip |
| --- | --- | --- |
| Which source produced candidate? | Stable draft-derived document ID; prefixed observation/line IDs and parser version | Evidence IDs are transient; persist source/representation/version association if approved. |
| Which sources support a field? | Candidate evidence arrays include observation/line/span and multiple documents | Receipt Confirm drops span/field-support map; no canonical field-to-source relation. |
| User-entered or extracted? | Review owner SYSTEM_SUGGESTED/USER_EDITED; manual/candidate selection state | Selection also marks USER_EDITED; not a durable distinction between typed and selected extracted values. |
| Confirmed by user? | Explicit Confirm validates latest values/session revision and IDs | Actor/time/confirmed candidate/support/version not retained as field provenance; business Save audit is separate. |
| Multiple artifacts support one Booking? | Expense accepts multiple attachments; combined candidates merge evidence | Booking and generic links absent; receipt fields/limit are specific. |
| One artifact produces multiple Trip objects? | SQL legacy action arrays and link ideas exist | No supported output mapping, per-output confirmation/idempotency or shared-source retention. |

Future responsibilities should distinguish source bytes hash from interpretation,
parser/extractor version from source revision, and confirmed business revision from
new extraction candidates. Support may refer to a PDF page, image region, text span
or email part, not only an entire file. Removal must preserve historical confirmation
and report unavailable evidence rather than cascade-delete business truth.
Uploader Account attribution stays separate from traveller `TripPersonId`; candidates
must not guess person identity by names. These requirements do not change Track A.
[E01, E09–E12; A1-I1]

## Q. Real-world case gap analysis

| Case | Current infrastructure contribution | Exposed gaps / output boundary |
| --- | --- | --- |
| A. Air New Zealand booking PDF → flight | Select/hash/store/upload/preview PDF | No PDF evidence extraction, flight/date/year/timezone/endpoint/booking-reference parser or Booking confirmation command; “8 Oct” alone cannot infer year/zone. |
| B. Airbnb screenshot, custom property title → stay | Own image, Vision text/geometry, manual confirmation pattern | No stay span semantics or booking field model. Preserve supplied property title and unresolved/free-text location; merchant-header ranking/POI match cannot define stay truth. |
| C. Water Taxi email/PDF → two transport occurrences + notes | PDF byte lifecycle; image OCR if user separately provides screenshot | Email intake absent; no one-source/many-occurrences/notes grouping, temporal model or provenance/partial confirmation. |
| D. One PDF, multiple travellers/tickets | One stored PDF and preview | No page/ticket segmentation, stable traveller assignment or credential object; one payment/Expense parent cannot model ticket relationships. Names cannot mint/merge Trip Persons. |
| E. Itinerary PDF with bookings, optional POIs and notes | Source bytes and human-review pattern | No heterogeneous output set or per-item acceptance; optional idea must not auto-create confirmed Booking. Itinerary, Candidate/Pool and Note lifecycles are not supplied by receipt parser. |

All five are gap lenses, not extracted examples or newly approved product scope.
No provider match is needed to preserve a user-supplied title; enrichment cannot
become the identity/confirmation authority. This audit does not solve temporal or
spatial semantics owned by Track B.

## R. Sync/background reuse

Reusable foundations: locally committed intent, account-owned selection,
claim/lease recovery, stable request identity, authenticated transport, upload
integrity, retry classification and due-time wakeups. Receipt operations have a
five-minute process lease. Coordinator recovers interrupted claims, handles due
PENDING/RETRYABLE work, and completes each independently; errors use the shared
classifier/backoff. Normal exponential jitter progresses to sparse long-lived
retry; auth returns pending/paused evidence, known domain failures are actionable.
Operational sync coalesces runs, sequences Expense sync before receipt sync,
schedules due queue work and pauses across account changes. Foreground/connectivity
and bootstrap paths reuse the nonblocking app lifecycle. [E02, E05, E17]

Limits: receipt dependencies are worker preconditions (parent server ID, completed
upload, pending replacement deletion), not a general Import action graph. Generic
dependency columns in schema do not make association-key or parent semantics
generic. Current upload buffers a single ≤15 MiB object through Backend; provider
stat downloads bytes to calculate SHA. There is no demonstrated resumable/chunked
upload, native background URLSession/WorkManager file transfer or arbitrary-size
document processing. Lifecycle wakeups do not guarantee completion while the OS
suspends/kills the app. [E05–E07, E17]

**Upload lifecycle ≠ semantic extraction lifecycle.** A future extraction job needs
its own source/representation/version input, processing receipt/result, cancellation,
retry/reprocessing and stale-output/confirmation rules. Reusing OCR_RECEIPT would
mix request-synchronous stub completion and transient local image recognition with
multi-object semantic work. Reuse queue mechanics only after an approved domain
contract; do not activate retained AI tables merely to obtain status names.

## S. UI coupling

`LedgerExpenseEntryScreen` owns Expense draft, Journey currency, capacity, staged
attachments, scan queue/session/review, background suspension, recovery and the
Confirm-to-form transfer. `ReceiptReviewSheet` receives receipt candidates and
exactly three Expense fields plus currency controls. `receiptReview.ts` imports
Expense amount formatting/validation. `useReceiptCapture` reads Ledger route
parameters and edit/finality gates; its screen navigates in Ledger. These are
not drop-in generic Import components. [E12, E15]

Lower layers can be reused without bringing that navigation/form: file verification,
staging, native recognition observations, byte provider/transport mechanics and
preview rendering patterns. Even native OCR/Quick Look are currently restricted to
receipt directories, and viewer labels name receipts. Any later user-facing change
must use canonical OTR UI primitives and terminology. No UI is designed or edited
here. Payment evidence has lower-layer support/hydration, but current payment
section is a payment timeline/form, not a generic document picker. [E10, E13, E19]

## T. Risks

| Risk | Evidence-backed impact / future guard |
| --- | --- |
| Rename receipts into Artifact without compatibility | Expense-only FK/tombstone/limit/OCR/feed assumptions break. Preserve existing behavior and version affected contracts explicitly. E02/E04/E06/E07 |
| Global three limit | Rejects real multi-ticket/multi-file inputs for an unrelated financial UI rule. Separate source/page/object counts. E03/E11/E12 |
| Private access broadened by generic link | Expense association grants shared Journey reads; payment evidence is record-specific. Decide each target's visibility before linking. E06/E09 |
| SQL-only many-to-many | API PK, content maybeSingle, local parent and queue uniqueness still fail. All layers must represent associations. E02/E04/E06 |
| Link/tombstone projection loss | Local target overwrite, general pull clearing payment parent, protected Expense delete vs payment unlink differ. Not a generic link/remove protocol. E02/E18 |
| Purge before recovery | Offline original lost if upload status alone replaces HEAD/GET integrity proof. Keep last-copy protection and define travel pin policy. E08 |
| Normalization treated as original | Resize/JPEG conversion may lose QR/detail/source fidelity; local original metadata does not make original bytes recoverable. E01 |
| OCR confused with semantic correctness | Vision text/confidence and receipt ranking do not extract flight/stay/ticket truth; PDF isn't recognized at all. E10–E14 |
| Stub/retained AI assumed operational | SUCCEEDED null suggestion, queued schema defaults and fixture values overstate extraction readiness. E14/E16/E17 |
| Transient evidence mistaken for durable provenance | Confirmation/source support not persisted; one source producing several outputs cannot be traced reliably. E11/E12 |
| Source delete cascades business effects | Future booking must survive source/link deletion; current receipt deletion preserves parent. E02/E06/N |
| Shared cache used as private source authority | Account/record entitlement not represented per synced asset; normal callers supply context. Generic direct access needs explicit proof. E02/E19 |
| Long-running processing assumed to survive suspension | App lifecycle wakeups and short file leases are not native background document jobs. E05/E17 |
| Track A/B scope silently expanded | Source extraction cannot change Person/access or resolve time/place semantics by inference. A1-I1/Q |

## U. Unknowns

| Item | Disposition / later evidence |
| --- | --- |
| Current deployed release, Storage objects, remote schema/provider drift | UNKNOWN; no device/network/Production/Hosted Dev access. Repository map does not need those reads. |
| External legacy media/AI/parser/share workers | UNKNOWN; retained schema only; legacy Web source not inspected. |
| Supported Expense+Payment same-asset flow | UNKNOWN end-to-end; narrower source constraints and read/delete consequences proven in F. |
| Arbitrary cross-account private receipt lookup safety | PENDING proof before generic reuse; ordinary payment caller chain is scoped, cache itself is not a generic entitlement model. |
| Byte-exact original retention / travel offline pinning | PENDING design policy; current receipt normalization and eviction rules known. |
| Text/URL/email privacy, raw OCR retention and QR/credential policy | PENDING product/security decision; no invented retention or parser. |
| Future source assignment, link ACL algebra and source deletion scope | PENDING C-I1; no new Track A authority assumed. |
| PDF decoding/rasterization/embedded-text approach | PENDING evaluation after scope approval; no dependency or proof implementation added. |
| Android OCR and PDF preview parity | OCR explicitly unavailable; iOS Quick Look demonstrated in source; device parity not tested here. |
| Fresh test execution in this worktree | PENDING: `npm test -- <17 focused paths>` exited 127, `vitest: command not found`; dependencies not installed. Existing tests inspected but no new PASS claimed. |

No unresolved competing byte-storage authority or fundamental storage contradiction
was established. Generalization options are evaluable without changing Expense or
accessing a remote environment. Cache/association limitations are documented, not
refactored. Unrelated workspace changes were absent at baseline; final scope is
checked below. If review requires implementation, live Production evidence or
Track A access changes, stop and request a separately scoped phase.

## V. Recommended next C-track phase

**C-I1 — Source / Artifact association and provenance contract, DESIGN ONLY**, after
human review of C-I0. This is a recommendation, not authorization to begin it.

1. Decide bounded B/D vs C against the five cases, retaining receipts as-is.
2. Define original/derived/source identity, mixed-input and multi-output semantics,
   source-to-field confirmation evidence and independent business truth.
3. Specify association IDs/cardinality, lossless local projection, per-target ACL,
   uploader accounting, unlink vs source delete and offline retention/recovery.
4. Separate file transfer from extraction/reprocessing state and idempotency;
   record PDF and inbound intake as explicit gaps rather than assumed capabilities.
5. Produce a narrow future slice/compatibility proposal and review gates. No SQL,
   AI, Import Session, Share Extension, UI, provider swap or deployment in C-I1
   without a later explicit implementation request.

## W. Acceptance matrix

PASS means a requested audit question is answered with source evidence, including
absent/limited capability. It does not mean that feature exists, tests ran, remote
deployment was verified or the proposed architecture was approved.

| # | Criterion | Evidence | Result |
| --- | --- | --- | --- |
| 1 | Current file acquisition architecture mapped | C; E01/E03/E12/E15 | PASS |
| 2 | Camera path mapped | C Camera row; E12/E15 | PASS |
| 3 | Photos path mapped | C Photos row and batch flow; E03/E12 | PASS |
| 4 | Files/PDF path mapped | C/I; E01/E12/E15 | PASS |
| 5 | Local durable file behavior mapped | C/D; E01/E03/E08 | PASS |
| 6 | Hash/MIME/size behavior mapped | B/C/I; E01/E05–E07 | PASS |
| 7 | Upload worker/retry path mapped | C/D/R; E02/E05/E17 | PASS |
| 8 | Private storage authorization mapped | E; E06/E07/E09 | PASS |
| 9 | Expense attachment cardinality mapped | F; E02/E06/E07 | PASS |
| 10 | Personal Payment association mapped | E/F; E02/E06/E09/E19 | PASS |
| 11 | Multi-object reuse limitation proven | F SQL/API/cache/queue/content layers | PASS |
| 12 | OCR provider architecture mapped | G; E10/E14 | PASS |
| 13 | Native OCR vs backend stub distinguished | G; E10/E14/server wiring | PASS |
| 14 | Receipt semantic parser mapped | H; E11 | PASS |
| 15 | Human review/confirmation pattern mapped | H/N; E12 | PASS |
| 16 | PDF capabilities/limitations proven | I; explicit native/feature rejection and runtime search | PASS |
| 17 | Inbound Share support proven or absent | J; checked-in config/module/plugin/route search | PASS |
| 18 | URL/text/email intake mapped | J; E15/E16 | PASS |
| 19 | AI/background schema vs runtime separated | K; E14–E17 | PASS |
| 20 | Generic reusable primitives classified | L; E01–E20 | PASS |
| 21 | Expense-specific constraints identified | F/H/L/O | PASS |
| 22 | Future Artifact options compared | M, conceptual A–D; no schema | PASS |
| 23 | Artifact/business-truth boundary defined | N; E03/E05/E12 | PASS |
| 24 | Import Session infrastructure gaps identified | O; E01–E05/E11/E12 | PASS |
| 25 | Provenance requirements identified | P; E01/E11/E12/A1-I1 | PASS |
| 26 | Multi-file implications identified | C/O/P; file vs page vs output limits | PASS |
| 27 | Real-world booking cases evaluated | Q, all five cases | PASS |
| 28 | Sync/background reuse bounded | R; E02/E05/E17 | PASS |
| 29 | UI coupling identified | S; E12/E13/E15/E19 | PASS |
| 30 | Risks listed | T | PASS |
| 31 | Unknowns explicit | U | PASS |
| 32 | No Trip identity/permission code modified | Only this report added; final Git scope check | PASS |
| 33 | No schema/application/test/config change | Tracked/staged diff empty; only report untracked | PASS |
| 34 | No migration created/applied | No migration command/file change; test runner never started | PASS |
| 35 | No remote access/mutation | Local source/Git reads, report write and failed local test command only | PASS |

Required audit matrix: **35 PASS / 0 PENDING / 0 BLOCKED** for source coverage and
scope. Separate gates: **human audit/design review PENDING; fresh test execution
PENDING** (missing local Vitest). Existing source/test assertions are evidence,
not newly executed results. No FULL PASS or implementation readiness claim.

Validation: inspected source and existing focused tests; attempted existing local
command below, which failed before any suite executed. No install/config repair
or database/remote test command followed.

```sh
npm test -- src/data/files/receiptFileStore.test.ts src/data/operations/expenseReceiptDraft.test.ts src/data/operations/openReceiptAsset.test.ts src/data/operations/ledgerMaintenance.test.ts src/data/repositories/ledgerReceiptRepository.test.ts src/data/repositories/ledgerReceiptLifecycle.test.ts src/data/sync/ledgerReceiptSyncWorker.test.ts src/data/sync/ledgerReceiptTransport.test.ts src/native/receiptOcr.test.ts src/features/ledger/expenseReceiptOcr.test.ts src/features/ledger/receiptScanSession.test.ts src/features/ledger/receiptReview.test.ts src/domain/receipt/parseReceipt.test.ts src/domain/receipt/parseReceiptEvidenceSet.test.ts backend/src/attachmentStorageProvider.test.ts backend/src/receiptProviderGateway.test.ts backend/src/receiptOcrProvider.test.ts
```

Report verification: A–W sections, 35 acceptance rows and evidence paths checked;
new-file whitespace checked with `git diff --no-index --check /dev/null <report>`;
tracked/staged diffs and final `git status --short` checked. No UI edits, so no
UI guard/device visual result is claimed. No commit made.

Files changed: `docs/architecture/TRIP_CANONICAL_C_I0_IMPORT_ARTIFACT_AUDIT.md` only.
No sibling worktree modified.

Production accessed: **NO**. Hosted Dev mutated: **NO**. Remote access: **NO**.
Migration created/applied: **NO**. Application code changed: **NO**.
Deployment: **NO**. Artifact/Import Session/AI implementation: **NONE**.

**C-I0 AUDIT COMPLETE — REVIEW PENDING. STOP.**
