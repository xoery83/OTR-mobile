# Expense Attachments & Receipt Scan 1.0 — Phase 1 Attachment Foundation

Date: 2026-09-27  
Status: Phase 1 Attachment Foundation accepted on safe synthetic iPhone/Hosted Dev evidence; Personal Payment device evidence remains a release item  
Contracts: `docs/EXPENSE_ATTACHMENTS_RECEIPT_SCAN_1_0_DESIGN.md`, ADR 0048

## Slice 4.1 upload diagnosis and device acceptance (2026-09-27)

- Bounded iPhone diagnostic of one synthetic PNG asset showed a synced Expense,
  an intact local prepared file (5,833,339 B, `image/png`), and matching stored
  file/metadata SHA-256 prefix. Its `UPLOAD_RECEIPT` operation remained
  `RETRYABLE`, with `ERR_ARGUMENT_CAST` from Expo Crypto: the native `digest`
  function expected a `TypedArray`. No Backend request ID existed. The shared
  `receiptBytesSha256` helper passed an `ArrayBuffer` during upload verification,
  before remote metadata creation. The same helper caused the temporary
  diagnostic to fail until fixed. Original source metadata was not involved.
- The helper now passes a `Uint8Array`. A regression mock that enforces the
  native TypedArray requirement failed before the fix and passed after it;
  it covers pre-upload verification, draft recovery, and bounded file evidence.
  A signed Release build containing the fix and final draft-recovery code was
  installed on the authorized iPhone 16 Pro without iPhone Mirroring. The
  isolated synthetic JPEG subsequently uploaded and passed exact remote hash
  verification.
  The user needs the phone hotspot for normal Internet access; offline test
  intervals must be brief, with OTR force-closed before reconnecting until the
  intended single test asset is isolated.
- The Backend contract already accepts `image/jpeg`, `image/png`, and PDF; it
  validates the uploaded bytes against stored size/SHA metadata and uses stored
  MIME for Storage. Source MIME/size never enter that validation. No Backend or
  Supabase code change or deploy was needed for this failure.
- For controlled JPEG re-acceptance, the old three synthetic assets were
  removed offline from their synced QA Expense; exactly one new synthetic JPEG
  was added while offline. OTR was force-closed before restoring the phone
  hotspot. On one online launch, the upload operation completed and the
  attachment showed Available. The physical diagnostic reported a readable
  local JPEG file of 385,817 B with SHA prefix `bb955386228d3324`.
  The matching Hosted Dev row and the exact Storage object both measured
  385,817 B and SHA-256
  `bb955386228d33244abff27ca87ff15466c5cc042474ca1f14002e7ad8e053bb`.
  Only that synthetic object was downloaded in memory for hashing; its bytes
  were discarded, and unrelated objects were not read. This proves the
  normalized durable representation reached remote Storage intact.
- The JPEG diagnostic showed source metadata as unknown after sync. A targeted
  read found that `applyReceipt` in the normal bootstrap/change projection
  replaced the local row without retaining the new nullable source fields.
  It now preserves them, matching the existing Personal Payment projection;
  focused pull regression tests pass. The corrected Release build is installed
  for subsequent HEIC/PNG/PDF measurements. The already synchronized JPEG's
  source fields cannot be reconstructed from its cleaned temporary source.
- After that fix, a new safe synthetic HEIC was added to the same synced QA
  Expense while online. Device diagnostic: `image/heic` source 393,412 B,
  stored `image/jpeg` 385,817 B (1.93% smaller), operation COMPLETED on its
  first attempt, and intact local file matching the stored SHA prefix. The
  iPhone viewer displayed the synthetic English receipt text legibly. The
  exact Hosted Dev Storage object measured 385,817 B and SHA-256
  `bb955386228d33244abff27ca87ff15466c5cc042474ca1f14002e7ad8e053bb`,
  matching both metadata hashes. The source field survived the server pull.
- A synthetic PNG with an alpha channel was then added as the third attachment.
  The device retained PNG: source 8,485,602 B, prepared 5,833,339 B (31.26%
  smaller), with local signature/size/SHA matching stored metadata. The upload
  operation completed on its first attempt. The exact Hosted Dev object was
  `image/png`, 5,833,339 B, SHA-256
  `bc05b9035423c58a9857092ee88fac7853b75e9a4e38e957cd46707a9301b01f`,
  matching both server hashes. The native share preview exposed readable
  English test lines; this workflow opens iOS's share panel rather than an
  in-app full-screen viewer.
- The old synthetic JPEG was tombstoned to release a slot, then the safe
  601-byte synthetic PDF was added. The device kept `application/pdf` and 601 B
  for both source and stored file; the upload completed on its first attempt,
  and its native PDF content was readable. The exact Hosted Dev object was
  601 B with SHA-256
  `716edb30f7198b4964cbe4976b614b52bd0efa773f176b138f9509b4df7e49fd`,
  matching metadata and uploaded-byte hashes. JPEG, HEIC, PNG, and PDF online
  paths are device-accepted.
- Offline New Expense draft recovery was verified on iPhone after force-close
  and offline restart. The user saved the recovered draft offline as the
  synthetic `Slice41offline` Expense with exactly one JPEG; after another
  offline force-close/restart, the attachment remained saved locally.
  Reconnection initially showed `Upload failed` because the
  operational cycle launched Expense and receipt sync concurrently. The
  receipt worker correctly required a server Expense ID, but raced before
  Expense creation completed and scheduled a retry. The cycle now awaits
  Expense sync before starting receipt sync; a deferred-Expense regression
  test proves ordering. Existing retry state was preserved, and the updated
  Release app completed the same operation without re-adding the receipt.
  Device status became Available and the synthetic receipt preview was readable.
  The exact Hosted Dev Expense `782fdda2-b87a-4b1c-8dbe-766ab96ed54f`
  has one active receipt row. Its Storage object is 385,945 B, `image/jpeg`,
  SHA-256 `bd0326064130a6ded2c756a6ff974509a064fcf4e898c5aa3f899a06848117fa`,
  matching both stored and uploaded metadata hashes. No duplicate asset or
  unrelated object was observed/read.
- The normal Personal Payment receipt path retains shared file preparation and
  upload code; focused coordinator/worker tests passed. There is no established
  synthetic Personal Payment evidence fixture for this device test, so its
  end-to-end device result remains a release acceptance item. The image Open
  action uses iOS's share preview, not a dedicated in-app viewer. No iPhone
  Mirroring, Backend deploy, Supabase migration, or Production access occurred.
- Final validation: 12 focused Vitest files / 115 tests passed, including the
  SHA argument and Expense-before-receipt ordering regressions. TypeScript,
  affected ESLint, Prettier, and `git diff --check` passed. The signed Release
  build was installed directly over the existing iPhone app; its local data
  and pending operation were retained.
- A receipt attached to an Expense whose own sync remains delayed can still
  temporarily show Upload failed and wait for the durable retry timer; the
  original file and operation are retained. The ordering fix removes the
  observed successful-Expense race, while broader dependency-status UX is
  outside this diagnosis slice.

## Slice 4 implementation decision (2026-09-27)

The existing `mime_type`, `size_bytes`, and `sha256` fields describe the durable
uploaded representation. They cannot also describe a HEIC/HEIF/PNG/JPEG input
once it is normalized to JPEG. Slice 4 therefore adds only nullable source
filename, source MIME, source byte count, and stored image width/height to the
existing SQLite and `receipt_assets` rows. Existing rows retain their current
uploaded representation and read behavior. The shared file store validates
content signatures before preparing bytes; native image manipulation supplies
resize, orientation normalization, and JPEG encoding. PDF bytes remain intact
with a 10 MB limit for new inputs. No new attachment table or storage provider
is introduced.

## Slice 4 implementation and evidence (2026-09-27)

- New inputs are identified from file signatures, then checked against picker
  MIME when supplied: JPEG, PNG, HEIC, HEIF, and PDF. Unknown content and
  declared/content mismatches fail before a durable asset or upload intent is
  created. HEIC/HEIF depend on native decoding support. PDFs remain byte-for-byte
  PDFs and must be at most 10 MiB. Image sources must be at most 50 MiB and
  60 megapixels; the byte limit precedes decode, while the pixel check follows
  native decode. Prepared images must be at most 15 MiB. Existing legacy PDFs
  above the new input limit remain readable and uploadable.
- Native image manipulation normalizes orientation, resizes the long edge to at
  most 2200 px, and saves JPEG at quality 0.83. PNGs with an alpha channel or
  `tRNS` are kept as PNG to protect transparency; opaque PNGs become JPEG.
  Image re-encoding drops metadata not needed for the stored representation.
  These central constants are based on synthetic 4032×3024 receipt measurements
  and a visual iPhone preview. The alpha-channel check is conservative: a PNG
  whose alpha values are all opaque may still remain PNG.

  | Synthetic input (4032×3024)    | Source bytes | Prepared bytes (stored MIME) | Reduction | Evidence                                      |
  | ------------------------------ | -----------: | ---------------------------: | --------: | --------------------------------------------- |
  | JPEG receipt                   |    2,332,820 |       385,817 (`image/jpeg`) |    83.46% | iPhone pipeline; exact remote object verified |
  | HEIC receipt                   |      393,412 |       385,817 (`image/jpeg`) |     1.93% | iPhone pipeline; exact remote object verified |
  | PNG receipt with alpha channel |    8,485,602 |      5,833,339 (`image/png`) |    31.26% | iPhone pipeline; exact remote object verified |

  These are device measurements of safe synthetic fixtures, not permanent
  encoding guarantees. The native share previews showed legible English
  receipt text. No OCR quality benchmark was performed.

- New Expense selection retains an account-scoped temporary file and a small
  account/Journey-scoped draft record. A restart restores intact drafts and
  excludes IDs already committed to SQLite. Preparation verifies source hash,
  writes a deterministic durable path, validates signature/size, then commits
  Expense, asset, and queue work through the existing SQLite transaction. A
  prepared file left by interrupted SQLite Save is reused on retry; the source
  remains until commit. Existing Expense and Personal Payment imports use the
  same safe temporary-copy/prepare/commit sequence. Only OTR-owned temporary
  copies are cleaned after commit; Photos/iCloud originals are never deleted.
- Durable `LOCAL_ONLY` and `UPLOADING` assets remain protected by their SQLite
  rows and queue work. Upload checks the exact stored MIME, byte count, and
  SHA-256 before server metadata creation; interrupted upload retries with the
  same asset identity and durable bytes. Remote-confirmed local files remain
  protected for viewing. Tombstoned assets remain hidden; existing delete
  operations retain their retry state and recovery does not restore them.
  Unreferenced prepared files, draft copies with unreadable records, and
  duplicate draft records after commit are orphan candidates only; this slice
  adds no automatic orphan deletion. Five historical Hosted Dev orphan
  candidates remain untouched. A crash between draft copy and record write
  can leave a safe file requiring manual recovery; no evidence is deleted.
- Additive **local SQLite migration 39** adds nullable original filename, input
  MIME, input bytes, width, and height to `ledger_receipt_assets`. Existing
  `mime_type`, `size_bytes`, and `sha256` continue to describe the exact stored
  and uploaded representation. No Backend contract, Supabase migration, Hosted
  Dev deploy, or Production change was made. Personal Payment uses the shared
  normalizer; its receipt repository and sync tests passed. Focused local
  validation: 11 test files / 87 tests, TypeScript, affected ESLint, Prettier,
  and `git diff --check` passed. No database-heavy suite was run.
- A Release build installed on the physical iPhone 16 Pro before the final
  draft-recovery edits; those final edits have not been rebuilt on device.
  Safe synthetic HEIC was
  selected and saved with a new Expense; safe JPEG and PNG were added to that
  Expense, previewed, and the three-item cap held. All three later showed
  **Upload failed**; the root cause and reconnect/reopen/download path were
  not verified. The synthetic PDF, offline/restart cycle, camera capture, and
  live Personal Payment path were not completed in this Slice 4 acceptance.
  iPhone Mirroring crashed twice, so device UI testing stopped. A request to
  copy the entire app SQLite database for diagnostics was rejected by automatic
  approval review because it could expose unrelated private data; it was not
  retried. The Attachment Foundation therefore cannot yet be marked fully
  accepted. Resume with a safe scoped diagnostic and device acceptance when
  reliable device interaction is available.

## Slice 3.1 integration acceptance (2026-09-27)

- Preflight found only intended Slice 1–3 work in the worktree. Hosted Dev
  `tuqigdxrvrerfewsxqgm` had migrations through `20260927000200` with no
  pending migration. Only the existing Hosted Dev Backend was rebuilt and
  restarted: image `sha256:86c3b06c7a221b261cd8a97f6fedad314eeb79cc2f792c22efd11c4b57795487`,
  bundle SHA-256 `43bc3c04d569b7fb6d98f69a87d3d0fd6a80364a0e67d4063c9c046eb4951870`.
  Local and public health checks returned development/ok. Production was not
  accessed. The signed Release app was built and installed on Leon's iPhone 16
  Pro (iOS 26.6, UDID ending `9B001C`), preserving its SQLite data.
- Hosted Dev HTTP checks passed: create/pre-bound upload/complete; same-key
  create replay returned the same asset; an authorized different Journey member
  downloaded identical bytes; outsider download was 403; view-only guest
  DELETE was 403; writer DELETE and repeat DELETE were successful/idempotent;
  deleted content returned 404; linked-Expense OCR returned 409
  `EXPENSE_SCAN_NOT_AVAILABLE`. The second member could list the physical-device
  test Expense and download its active image (200, 470296 bytes); the outsider
  received 403 and the second member received 404 for its deleted attachment.
  The second member's bootstrap returned the deleted row with `deletedAt`,
  allowing the existing local projection to hide it; a second physical device
  was not used.
- On device, existing Expense showed no Scan Receipt action. An image appeared
  locally immediately, uploaded, reopened as Available, and opened in the
  native viewer with correct return navigation. The list reached three; Add
  disappeared while Edit Expense remained available, and the server never
  exceeded three. Online Remove immediately reduced the list to two; a
  replacement returned it to three. Force close/reopen retained the list and
  did not resurrect tombstones. A synthetic 601-byte PDF uploaded, reopened,
  and rendered its test text in the native PDF/Markup path.
- With only OTR Mobile cellular data disabled and Wi-Fi disconnected, a cached
  synthetic PDF was added to the same Expense. It appeared as saved locally;
  after force close/reopen it remained as an upload-failed/retryable local row.
  Restoring cellular data and relaunching produced exactly one uploaded server
  asset, returning the active count to three. With cellular data disabled again,
  removing that asset hid it locally and reduced the count to two; force
  close/reopen preserved the tombstone while Hosted Dev still had three active
  rows. Reconnection and relaunch set its server `deleted_at`, leaving two
  active rows. The app's coarse Network debug indicator briefly showed Online
  after an offline restart although iOS still blocked its cellular requests;
  the pending operation and server state gave the decisive offline evidence.
- Two narrow blocking device defects were found and reported during acceptance.
  The max-three/actor guard had accidentally been applied to Edit Expense
  instead of Add attachment; it is now on Add. The existing-Expense import
  queued upload work without waking the operational sync; it now kicks that
  coordinator after local import. Both fixes were rebuilt onto the iPhone and
  physically rechecked. No new subsystem or migration was introduced.
- One personal PDF was inadvertently selected from Files Recents during picker
  animation. Acceptance stopped for remediation: its Dev `receipt_asset` was
  tombstoned through the owner Backend route, its exact Dev Storage object was
  removed after confirming no Personal Payment evidence link, and authenticated
  download returned 404. The original iCloud file was untouched. A subsequent
  iPhone restart pulled the tombstone and showed two attachments. The Dev
  tombstone remains as an audit record. Subsequent selections used the exact
  synthetic test filename.
- Final read-only Hosted Dev verification: 20 receipt assets total, 9 active
  Expense-linked assets, maximum three per Expense, no over-limit Expense and
  no duplicate `(journey_id, created_by, local_id)` key. The physical test
  Expense has two active and three tombstoned rows (including the remediated
  picker mistake). There are seven uploaded unlinked rows; the five historical
  orphan candidates were not cleaned. Both `payment_records` and
  `settlement_payments` currently have zero non-null `evidence_asset_id` links
  in Hosted Dev, so direct Personal Payment evidence regression had no live
  fixture; the existing focused compatibility tests remain the evidence for
  that path. Private bytes for ordinary logical deletions remain retained for
  future recovery/cleanup policy.
- Final local validation: targeted Backend/receipt lifecycle/sync worker tests
  55/55 passed; TypeScript, affected ESLint, affected Prettier, and
  `git diff --check` passed. Backend build and the earlier focused 71-test
  predeployment run passed before Hosted Dev deployment. No unrelated database
  suite or Production operation was run.

## Slice 3 implementation and acceptance (2026-09-27)

- Existing Expense detail now lists active attachments, shows local/upload/failure
  state, and offers Open, Add, and Remove where allowed. Add uses the existing
  durable receipt copy/import/UPLOAD/LINK path with OCR disabled, including
  offline operation. The repository counts active local rows across an Expense's
  local and server IDs and refuses a fourth. The existing New Expense Scan draft
  path is not used. Open verifies a downloaded file's size and SHA-256, then
  opens the local/private-backend file through the native share viewer. No public
  object URL is issued. The Backend refuses direct OCR requests for already
  linked Expense receipts; no OCR path was added to existing-Expense UI. No
  device UI acceptance was performed in this slice.
- READ: the authenticated trip creator, a legacy `trip_members` member, or a
  currently linked `journey_members` member may download an active Expense
  attachment, including one uploaded by a different user. This mirrors the
  Backend Journey read gate. Personal Payment evidence keeps its separate
  payment-read grant; an unlinked receipt retains the prior uploader/current
  Journey-member fallback. Tombstoned Expense content returns 404. DELETE and
  upload/link mutations pass the existing Backend `canWriteTrip` gate: trip
  creator, legacy trip member, or linked owner/group member. The offline UI and
  repository conservatively require cached actor role owner/group_member before
  mutation; view-only/guest actors can read but cannot queue local deletion.
- Supabase migration `20260927000200_expense_attachment_tombstones.sql` adds
  nullable `receipt_assets.deleted_at`, an active Expense index, and an updated
  trigger. Both add and tombstone lock the same Expense row. Only rows with
  matching `expense_id` and `deleted_at IS NULL` consume one of three slots;
  PENDING/FAILED uploads still count while active. A tombstone cannot be
  restored or moved by a stale update. Personal Payment evidence without an
  Expense link does not count. Active Personal Payment evidence blocks Expense
  deletion even if an asset was also linked to an Expense.
- SQLite migration 38 adds local `deleted_at` and extends the existing durable
  asset-operation table with `DELETE_RECEIPT`. It also tracks the account owning
  an unconfirmed local tombstone: that account immediately hides the asset,
  while another account on the same device can still see a server-backed active
  copy until remote confirmation. A competing local delete waits rather than
  stealing the first account's operation. Its CHECK expansion copies all
  prior operations in one migration transaction before replacing the table;
  no existing asset or operation is dropped semantically. Local delete commits
  the tombstone and operation together, hides the attachment immediately, and
  retains its local file. UPLOAD/LINK/OCR workers skip tombstoned rows; an
  in-flight upload is allowed to settle before a remote delete can complete.
  Replacement uploads wait for any unresolved same-Expense delete, so remote
  max-three rejection cannot permanently fail a valid offline replacement.
  Remote DELETE sets `deleted_at` idempotently and emits the existing receipt
  change feed. Bootstrap/pull preserve a pending local tombstone against stale
  active data and apply a server tombstone on another device. Retries never
  clear `deleted_at`.
- Logical deletion releases the three-item slot immediately; the private cloud
  object and local original remain for audit/recovery. There is no physical
  deletion worker or cleanup in this slice. The five historical uploaded,
  unlinked Hosted Dev assets remain untouched. A future orphan worker must
  prove no active Expense reference, no active Personal Payment evidence link,
  no pending/in-flight draft/upload/link, age beyond a conservative legacy
  upload-first protection window and tombstone recovery grace (target roughly
  30 days), and no unique local evidence copy before deleting bytes. An
  unlinked row alone is never sufficient proof.
- Local migration and pgTAP passed before Hosted Dev application. Hosted Dev
  project `tuqigdxrvrerfewsxqgm` received only migration `20260927000200`;
  post-apply dry-run found no pending migrations. New tombstone pgTAP 9/9,
  existing max-three pgTAP 9/9, and existing receipt pgTAP 8/8 passed on local
  and Hosted Dev. The existing receipt suite needed a temporary `service_role`
  copy for Hosted Dev's restricted CLI login; its source was unchanged.
  Two independent local PostgreSQL sessions began with three active metadata-only
  QA attachments. Session A tombstoned one and held the Expense lock; session B
  inserted a replacement and was observed as `active | Lock | transactionid`.
  After A committed, B committed, with no deadlock or partial row. Final active
  count was three. The QA rows have no binary objects; historical orphan
  candidates were not modified.
- Focused validation passed 123 tests across 10 application/Backend files.
  Real-SQLite lifecycle tests cover 0/1/2/3 list counts, offline add,
  delete/restart/later sync, max-three release, view-only local denial, retry,
  file retention and Personal Payment evidence. Backend and read-projection
  tests cover cross-uploader read, outsider denial, delete permission,
  idempotency and stale-change protection. TypeScript, affected ESLint,
  Prettier, and `git diff --check` passed. The existing
  standalone Personal Payment repository suite still cannot load React Native
  Flow through Vitest/Rolldown; its worker/coordinator and shared-receipt tests
  pass. Backend code was not deployed, so Hosted Dev HTTP and device acceptance
  remain for release validation. Production was not accessed.

## Slice 2.1 database acceptance (2026-09-27)

- Review passed before application. The trigger runs only when a receipt gains
  an `expense_id`, locks that same Journey's Expense row, and counts other rows
  linked to it. Repeating a link to the same Expense skips the count and does
  not consume another slot. Unlinked Personal Payment evidence is excluded.
  The table currently has no receipt tombstone, so every linked row counts,
  including PENDING/FAILED uploads. Existing four Hosted Dev linked assets were
  spread across Expenses (maximum one per Expense); no historical over-limit
  Expense needed remediation.
- Migration `20260927000100` was applied only to Hosted Dev project
  `tuqigdxrvrerfewsxqgm`, and separately to the running local test database.
  Hosted Dev post-apply dry-run reported zero pending migrations. Production was
  not accessed. Hosted Dev pgTAP passed: expanded attachment-limit suite 9/9
  (zero through three, idempotent link, fourth rejection, no fourth row,
  unlinked evidence, lock definition) and existing receipt suite 8/8. Hosted
  Dev's CLI login role cannot use the `extensions` schema; the new test switches
  to its existing `service_role` before `plan()`. The existing receipt suite
  ran from a temporary role-adjusted copy; its canonical file was unchanged.
- Real concurrency used two independent direct `psql` connections to the
  migrated local PostgreSQL, starting with exactly two linked rows. Session A
  inserted row three and held its Expense row lock for 30 seconds. While B
  attempted a distinct fourth insert, `pg_stat_activity` showed B as
  `active | Lock | transactionid`. After A committed, B received SQLSTATE
  `23514` / `EXPENSE_ATTACHMENT_LIMIT_REACHED`; its three assertions passed,
  including lock wait and final count. Both sessions completed without deadlock.
  Final count was three; rejected row ID `49000000-0000-4000-8000-000000000005`
  was absent locally and in the Hosted Dev fixture. These valid metadata-only
  QA fixtures remain in both test environments because immutable valuation
  snapshots prevent a straightforward physical Expense teardown; they are not
  user-uploaded binary objects.
- The new pre-bound Expense flow creates remote metadata before binary upload,
  so a fourth claim fails before the object is sent. Older unbound clients can
  still upload and then fail at LINK, leaving a private object and unlinked
  metadata. Hosted Dev currently has seven unlinked receipts: two active
  Personal Payment evidence records and five uploaded records with neither an
  Expense nor Personal Payment link. Those five are orphan _candidates_, not
  proven deletable files. This is a real potential storage leak; add a safe
  ownership/reference-aware cleanup or legacy pre-link guard before Slice 3
  release. Do not delete these records without proving they are unnecessary.
- Slice 3 can extend this trigger additively: introduce a nullable tombstone,
  count only `expense_id = target AND deleted_at IS NULL`, and serialize both
  tombstone/restore and new attachment claims on the same Expense row. A soft
  deleted row would **currently** still consume a slot. No deletion was
  implemented in Slice 2.1.

## Slice 2 local status (2026-09-27)

- New Expense holds an ordered array of 0–3 temporary receipt drafts. Each can
  be removed before Save; Edit Expense still does not expose Scan Receipt. The
  domain constant `MAX_EXPENSE_ATTACHMENTS` enforces three before file selection
  and again at the repository boundary. A stable Expense draft ID makes re-entry
  idempotent, including zero attachments. Identity is the draft ID, with SHA-256
  used to verify bytes rather than identify a user-visible attachment.
- Save prepares every durable copy while keeping each temporary source. The
  existing Expense `withTransactionAsync` then inserts the Expense/CREATE intent
  and all N `ledger_receipt_assets` plus UPLOAD/LINK operations. A preparation
  failure writes nothing to SQLite; a transaction failure rolls it all back.
  Both failures retain temporary source evidence and may leave prepared orphan
  candidates. After commit, temporary duplicates are removed best effort.
- Server enforcement is the additive Supabase migration
  `20260927000100_expense_attachment_limit.sql`. Its trigger locks the target
  Expense row before counting linked receipts, so competing claims serialize.
  It excludes receipts with no Expense ID, preserving Personal Payment evidence.
  The new client sends the target server Expense ID during metadata creation;
  a fourth is rejected with HTTP 409 before any binary upload or remote object.
  The existing LINK call is idempotent for an already linked receipt. Legacy
  unbound clients can still upload a pending object before a later fourth-link
  rejection; the trigger prevents overlimit linkage but cannot retroactively
  prevent that legacy object. No local SQLite migration or table rename was
  needed.
- Focused Expense, receipt file/repository/worker, Personal Payment sync,
  UI-domain, and Backend tests pass (11 files, 112 tests); TypeScript, affected
  ESLint, Prettier, and `git diff --check` pass. The standalone Personal Payment
  repository suite cannot load because Vitest/Rolldown rejects React Native
  Flow syntax. A pgTAP test for three allowed,
  fourth denied, and unlinked evidence was added but not run because no local
  PostgreSQL/`psql` was available. The trigger's parent-row lock is asserted by
  that test; two-session DB concurrency remains an unexecuted acceptance check.
  No Hosted Dev, Production, Simulator, or device run was performed.
- Remaining work starts at Slice 3: existing Expense attachment read/add/delete
  UX, tombstones, and authorization. HEIC/OCR, cache, storage accounting, and
  provider changes remain out of scope.

## Slice 1 local status (2026-09-27)

- New Expense camera/photo/file selection now copies one JPEG/PNG/PDF to an
  account-scoped temporary draft file. It writes no `ledger_receipt_assets` row,
  asset operation, or remote object. The form keeps the draft metadata in state.
  Cancel/Remove attempts to delete only that known temporary path. The old
  deep-link Scan route no longer uploads or requests OCR; Edit Expense no longer
  shows the New Expense receipt action.
- Save verifies the temporary bytes and SHA-256, copies them to the existing
  durable receipt directory without removing the source, then calls the Expense
  repository. Its existing SQLite `withTransactionAsync` now writes the Expense
  aggregate and CREATE operation plus receipt metadata and UPLOAD/LINK operations
  in one transaction. No SQLite migration was required: the existing nullable
  `expense_id` and operation schema already represent this state. The existing
  Personal Payment receipt path remains separate and unchanged.
- On copy/validation or SQLite failure, the temporary source is kept for retry;
  a prepared but unreferenced durable copy may remain as a recoverable orphan
  candidate. Successful commit removes the duplicate temporary file when safe.
  If that cleanup fails, the committed durable copy remains and the duplicate
  temporary file is retained. Re-entry with the same draft ID verifies a durable
  copy if the temporary file is already gone, and the repository returns the
  existing Expense instead of inserting a second attachment. There is no
  automatic age-based orphan cleanup in Slice 1 because ownership/reference
  proof for abandoned candidates is not yet implemented.
- Focused receipt-file, draft-operation, Expense/receipt repository, Expense
  sync, receipt sync, Expense draft, and Personal Payment FX suites pass (8 files,
  49 tests). TypeScript, affected ESLint, and Prettier pass. The separate Personal Payment repository suite cannot load because
  the existing Vitest/Rolldown configuration rejects React Native Flow syntax;
  receipt worker and repository tests cover its unchanged evidence path.
- Limitations: one draft receipt in the New Expense form; no OCR, multi-attachment
  UI, deletion, HEIC conversion, cache management, or new server contract. No
  Simulator/device or Hosted Dev acceptance was run for this local slice.

## Existing model and minimum migrations

`receipt_assets.expense_id` and local `ledger_receipt_assets.expense_id` are
nullable many-to-one links with no unique constraint. They already represent
three attachments on one Expense; no table rename or new parent table is needed.
The present one-receipt limit is in `LedgerExpenseEntryScreen`'s `receiptId`
state, not the schema. Existing `created_by` and `uploaded_size_bytes` provide
uploader identity and actual uploaded size, although current DTOs do not expose
the latter for accounting. Existing Personal Payment links remain separate.

Deletion needs an additive tombstone on both receipt asset tables (for example
`deleted_at`), plus a durable unlink/delete operation and change-feed/projection
handling. Old rows default to active. Do not delete old objects or OCR suggestions
in the migration. A server-side count of active Expense attachments must be
serialized against concurrent links, preferably inside a database function or
trigger that locks the target Expense row before counting. A UI-only check or a
REST read-then-write count can exceed three. Existing Personal Payment links
must not count toward an Expense or inherit Expense deletion. If evidence shows
the asset also needs another parent simultaneously, retain separate link rows
rather than overloading `expense_id`.

HEIC/HEIF and camera/PNG images should be normalized locally to supported
JPEG or retained PNG before `importReceiptAsset`; PDF stays PDF. This avoids a
schema MIME expansion for archived files. Reject unsupported/oversize inputs at
the client and Backend. New PDFs target 10 MB; previously accepted 15 MB PDFs
remain readable. The image dimensions and quality are tuned against actual
receipts before the compression contract is fixed.

## Ordered implementation slices

1. **Local draft and atomic Save.** Update `src/hooks/useReceiptCapture.ts`,
   `src/components/ReceiptCaptureScreen.tsx`,
   `src/data/operations/importReceiptAsset.ts`, `src/data/files/receiptFileStore.ts`,
   `src/features/ledger/LedgerExpenseEntryScreen.tsx`,
   `src/data/repositories/ledgerExpenseRepository.ts`, and
   `ledgerReceiptRepository.ts`. Scan/select copies into an account-scoped
   temporary draft area, with no asset row or queue operation. New Expense owns
   up to three selected files. Save pre-copies selected files to durable staged
   paths while keeping drafts, then uses one SQLite transaction to insert the
   Expense aggregate/CREATE operation, asset rows, and UPLOAD operations. Use a
   narrow shared repository transaction helper; do not call one repository's
   transaction from inside another. On rollback, retain drafts for retry and
   remove unreferenced staged copies. On success, remove duplicate drafts.
   Cancel removes drafts. Startup cleanup removes only temporary or staged files
   proven unreferenced by SQLite, after a conservative age threshold and account
   check. It never deletes the only known copy. A saved Expense must never point
   to a missing durable file, and no cancelled draft may have an upload operation.
   Remove the capture hook's direct sync invocation; the existing worker owns
   upload/retry lifecycle after durable Save.

2. **Multiple Expense attachments and authoritatively bounded links.** Replace
   the form's single `receiptId` with an ordered collection; a scanned receipt
   consumes one of three slots. Extend SQLite migrations in
   `src/data/db/migrations.ts`, repository list/link/tombstone methods, DTOs in
   `src/data/api/ledgerReceiptContracts.ts`, transport/worker, and Backend routes
   in `backend/src/app.ts` / `backend/src/supabaseGateway.ts`. Add an additive
   Supabase migration for tombstones and serialized active-count enforcement.
   Client and server reject a fourth active attachment, including concurrent
   requests and replays. Stable attachment IDs, hashes, deterministic object
   paths, and idempotency keys continue to prevent duplicate uploads. Expense
   financial revision and Settlement remain unchanged by link/delete actions.

3. **Read access and existing-Expense UX.** `LedgerExpenseDetailScreen.tsx`
   lists, opens, and offers offline-capable delete for authorized users; the
   Backend checks the actual Expense visibility policy before returning metadata
   or bytes. `created_by` is only accounting ownership. Preserve the distinct
   Personal Payment historical-grant branch. Remove Scan Receipt from the
   edit-existing-Expense form and reject OCR on linked existing Expense assets
   at the Backend, including direct API calls. Do not create Review findings.
   A deleted attachment becomes an idempotent soft tombstone; physical object
   deletion and grace-period recovery need a separate later policy. Show pending
   delete state honestly while offline.

4. **Format and recovery hardening.** Add local JPEG/HEIC/HEIF/PNG conversion
   and resize, PDF size enforcement, download/reopen behavior, and file-state
   checks in the existing asset store and worker. Keep unconfirmed originals
   protected; upload completion requires matching ID/path/size/SHA-256 and
   server metadata. Retain confirmed local files in Phase 1, as automatic
   eviction is later work. Reconcile stale pending links, deleted tombstones,
   interrupted promotions, and duplicate retries without touching financial
   data or Personal Payment evidence.

5. **Acceptance.** Add focused repository tests for atomic Save/rollback,
   cancel/restart/orphan cleanup, two and three attachments, fourth denial,
   account switching, upload retry, soft delete, and old-row migration. Add
   Backend/API and database tests for concurrent fourth-link rejection,
   idempotent replay, unauthorized reads/deletes, Journey access, and unchanged
   Personal Payment historical grants. Run typecheck, lint, focused/full tests,
   migration verification, and diff checks. On Simulator test offline New Expense
   with three files, cancel, restart, reconnect, view/delete, and authorized
   second-member download; confirm no OCR in edit. On a physical iPhone verify
   HEIC camera input, PDF picker, large-text/VoiceOver controls, storage survival
   across restart, and no remote operation from cancelled drafts. Device installs
   and Hosted Dev validation require their own approved execution checkpoint.

## Transaction and compatibility risks

Current `createExpense` commits Expense and its mutation, then the screen calls
`attachExpense` separately. This can leave a saved Expense without the intended
attachment or a durable upload for a cancelled draft. The shared transaction in
Slice 1 must replace that sequence for New Expense. File copy cannot be rolled
back by SQLite: keep the draft until commit, and recover unreferenced staged
copies conservatively. The existing `receipt_assets` row can carry multiple
Expense attachments, but active deletion and concurrent limit enforcement need
the additive migration above. Existing receipt rows, private URLs, Personal
Payment links, and persisted OCR suggestions remain readable. New OCR writes
move to the later on-device phase; the old server OCR endpoint must not remain
an unrestricted path for existing Expenses.

## Explicitly later than Phase 1

- German/S3-compatible storage and `AttachmentStorageProvider` implementation.
- Automatic cache eviction/LRU and Settings “Clear Attachment Cache”.
- Per-user storage-usage projection, quota enforcement, and pricing limits.
- Apple Vision OCR/parser and its offline acceptance. Phase 1 must not claim
  receipt scanning performs OCR while this is absent.
- Physical object deletion/grace-period recovery policy and broad Data Health
  storage reconciliation, beyond the safe local orphan cleanup above.

The next coding slice is **Slice 2**, after a separate implementation instruction.
