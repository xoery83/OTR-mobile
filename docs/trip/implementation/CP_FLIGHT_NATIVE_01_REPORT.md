# CP-FLIGHT-NATIVE-01 — native gap assessment / implementation

Owner-authorized isolated baseline `6af3aff1fbfb136b087512589aa94b2c9d4640fc`.
Branch `codex/flight-native-capture`. Local implementation only; activation CLOSED.

## Phase 1: observed native boundary

- C1 Files stages arbitrary system file metadata without copying/reading it; Photos
  stages images. C2 reads only after SQLite51 roster registration, hashes exact bytes,
  and commits SQLite48 originals with accepted Input bindings. Files metadata/MIME
  does not establish a supported decoder. PNG/JPEG/HEIC/HEIF/PDF can be retained as
  opaque FILE/IMAGE bytes within the existing 10 MiB limit.
- Existing ReceiptOcr uses Apple Vision for JPEG/PNG/HEIC/HEIF in Ledger-owned paths,
  with normalized boxes. It cannot read Capture originals; no Flight PDFKit bridge
  exists. Its image OCR is not Flight admission authority.
- `readFlightSourcePayload` supports UTF-8 TEXT only. CP13B supports admitted TEXT,
  EMAIL_TEXT, OCR_TEXT and TABLE_TEXT plus validated derived ancestry; these names
  do not implement PDF decoding or native OCR. Evidence is UTF-8 text spans.
- `captureFlightCoreV2` already maps the complete CandidateSet to publication2 and
  receipt-dependent create/qualify slots. Caller IDs must precede I/O. Core queue,
  exact receipts, coordinator, SQLite54 collection and production Day reader exist.
- Two material blockers are actual source predicates: Capture admission's binary
  verifier admits only PNG_STATIC_RGB8_RGBA8_V1; Core PG `materials` requires the
  selected Input roster to equal all original representations and requires each to
  be ORIGINAL TEXT. PDF-derived text is not eligible. Missing DEV deployment does
  not explain or bypass these predicates.
- C2 explicit scoped reopen/resume already preserves offline originals and fences
  A→B→A generations. No Flight action invokes interpretation or Core from Capture.

## Bounded implementation decision

First native format: text-bearing, unencrypted PDF, all pages readable, up to
10 MiB / 32 pages / 256 KiB extracted UTF-8. PDFKit only; images/scanned PDF/OCR
fallback remain unavailable. Preserve original PDF hash and page-to-derived-byte
ranges; never describe derived text offsets as PDF byte offsets.

Add one local SQLite55 preparation record owned by Capture, referencing SQLite48
original custody. Persist prospective Source/original/derived/Run/Input/publication/
plan identities before extraction. Retain extraction and exact adapter preparation
immutably across restart. No authoritative Source/catalog rows or accepted Item
rows are authored by this repository. Existing Source owner must admit original
PDF and its derived text before interpretation can consume a registered catalog.
An explicit factory can process an already accepted C2 Input without startup,
UI, polling, provider or queue activation. The accepted Core adapter remains the
only publication/plan builder; queue/install use existing owning APIs.

This is a local custody/extraction/review preparation extension, not a new Source
publisher, Canonical writer, retry engine or Day Composer. Owning binary admission
and Core derivative qualification require a separate Core/Source contract decision.
Complete native PDF→accepted Day activation is blocked on that decision.

## Delivered interface status

**PARTIAL LOCAL IMPLEMENTATION / CLOSED CHECKS PASS / FULL NATIVE E2E BLOCKED.**

- `ReceiptOcr.extractFlightPdf` adds a bounded PDFKit capability to the existing
  native module. Ledger's Vision OCR and preview behavior are unchanged.
- `extractDefaultCaptureFlightPdf(tripId,jobId,inputId)` is an explicit, dormant
  handoff from an accepted C2 Input. It requires existing explicit Trip assignment;
  a prior Trip hint never authorizes assignment. No Capture UI action, startup or
  retry scheduler is enabled. The normal installed app therefore does not yet
  offer PDF-to-Core import.
- `captureFlightNativeRepository.extract` verifies SQLite48 originals and stores
  prospective identities before native extraction. Failure/restart keeps originals
  and the same IDs. Extraction packets are immutable after installation.
- `build` requires an owning admitted catalog with the original PDF root and its
  exact derived TEXT child. It uses CP13B interpretation/quality and the accepted
  `captureFlightCoreV2` builders. It persists the complete interpretation, immutable
  publication and plan plus Candidate/Item/slot/operation IDs before dispatch.
  Exact replay retains historical output even after the original extraction deadline.
  Synthetic catalog admission in tests is explicitly a seam; no local Source
  registration or owning Source certificate is fabricated.
- `prepareAndQueue` publishes and prepares through accepted Source interfaces and
  passes only Core-returned ready commands to `tripCoreV2Repository.enqueue`.
  Delivery stays with the existing Core coordinator. Local capture freshness and
  Account/Trip authority are checked across I/O. Same-Trip reassignment cannot
  silently allocate fresh replacement import identities.
- Additive SQLite55 stores only private local preparation. Accepted read2 tables,
  collection installation and Day remain SQLite54-owned. No historical SQLite or
  Server migration changes. Latest-version test expectations now include55.

## CLOSED verification

| Owner outcome                   | Evidence and boundary                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Source → two Candidates     | Actual iOS PDFKit output from a two-page synthetic round-trip PDF feeds CP13B through an explicitly synthetic admitted original/derived catalog. Two distinct Candidate and Item IDs; four adapter slots retained. Actual Source admission remains unavailable.                                                                 |
| Restart / offline originals     | C1-equivalent Files selection → actual C2 submission → SQLite48 BLOB + accepted Input; file close/reopen retains exact hash, bytes, extraction and all import IDs. Intake/extraction needs no token/network.                                                                                                                    |
| Retry / no duplicate allocation | Failed extraction, exact replay after restart/deadline and A→B→A keep original IDs. Reassignment fails stale rather than generating a new same-Trip Source.                                                                                                                                                                     |
| REVIEW / unknown fields         | Actual Core PostgreSQL publisher returns two REVIEW / CONTRACT_UNSUPPORTED results for the binary-root derivative. Source preparation returns zero ready commands and review slots. Times, terminals and accepted locations absent from evidence remain unknown.                                                                |
| Core lost response              | Drop publication response after actual owning SQL commit; cold local reopen and original publication ID recover exact result without another writer or new IDs.                                                                                                                                                                 |
| Accepted SQLite / Day boundary  | New PDF candidates create zero canonical/local accepted Items and no Day rows. Separate unchanged accepted ORIGINAL TEXT scenario proves owning Core commands/exact receipt finalization → read2 → SQLite54 → production Day, two UUID/revision2 pairs, replay and private-evidence redaction. It is not native PDF acceptance. |
| Account / Trip / evidence       | Old callbacks fail after A→B→A, account change during native extraction, foreign Trip and revoked membership. Original PDF hash and derived UTF-8 spans map to every intersecting page; offsets are never falsely presented as original PDF byte spans or visual regions.                                                       |
| Existing domains                | Full regression retains exactly the two documented baseline UI/navigation failures. Ledger/G2/TTR and other passing domains remain passing; no production business logic in those domains changed.                                                                                                                              |

Actual simulator: designated native Harness `4246352E-7631-4DD5-9E0D-3F35B3150494`,
previously Booted, iOS27.0. `vtool` confirms IOSSIMULATOR/minos27.0/sdk27.0.
Standalone Swift extraction executable only: **9 synthetic checks PASS** on iOS
and macOS. No app install/launch, reset, account access or reserved-device boot.
The Expo/Hermes bridge and product Capture UI were not exercised in an installed
app; simulator extraction success must not be reported as full app acceptance.

- Native/C2/SQLite/source SQL suite: **13 PASS**, including actual owning REVIEW
  and lost-publication recovery in a fresh network-none fixture clone. Only bounded
  fixture Core gates permit publication metadata writes; deployed gates untouched.
- Full Vitest: **3719 PASS / 2 baseline failures / 21 skipped**. Failures:
  `navigationLayout.test.ts` (existing wrapper assumption) and
  `architectureBoundary.test.ts` (existing UI-test infrastructure import).
  SQL-only native test is among the skips in ordinary full Vitest; it passes via
  `--native-flight`. No global full-suite PASS claim.
- Accepted joined SQL scenario: **1 PASS**, all **329 historical SQL functions
  unchanged**, Source finalization/receipt/collection/private evidence checks PASS.
- Typecheck, UI guard, full lint, backend build, touched ESLint with zero warnings,
  formatting and whitespace PASS. Latest-schema expectations corrected after the
  first full run exposed them; historical assertions were retained.

Exact synthetic identities/hash and validation classification are in
`CP_FLIGHT_NATIVE_01_EVIDENCE.json`; changed paths are in
`CP_FLIGHT_NATIVE_01_CHANGED_FILES.txt`. Reproduction instructions are in
`modules/receipt-ocr/tests/README.md`. All fixture databases/containers were owned,
local and disposable. No Hosted endpoint was probed; deployment success is unclaimed.

## Experience/G2 coordination addendum

Experience/G2 is the sole shared Native Day Feed Lab owner. No separate Flight
shell/switcher/gallery/Composer/navigation or DEV DATA mode was added. Minimum
fixture requirements and exact accepted UUID/revision/date mappings are in
`CP_FLIGHT_NATIVE_01_G2_HANDOFF.md`; telemetry now records paired dates in the
existing joined harness. The native PDF fixture expects zero accepted Items.
Existing production read2/SQLite54/Day interfaces suffice; the missing native
Source/Core admission seam precedes those readers.

Fixture PASS, standalone PDFKit Simulator PASS, Physical Device NOT RUN and
Core DEV Read NOT RUN are separately recorded. Full shared native presentation
acceptance remains G2-owned and unclaimed by this checkpoint.

## Remaining blockers and minimum Owner decisions

1. Authorize the owning Capture/Source work for one PDF profile: real retained
   original custody, decoder verification and registration of exact PDFKit-derived
   text ancestry. Current static-PNG Source admission cannot accept PDF bytes.
2. Authorize the bounded existing Core publisher to qualify the admitted derivative
   through owning original/transform proof. Current ORIGINAL TEXT-only predicate
   correctly keeps it REVIEW. This checkpoint does not weaken that authority rule.
3. After those owner contracts are accepted, separately authorize the designated
   DEV Core principal/schema/transport and rebuilt iOS app's explicit reviewed
   Capture action/coordinator/finalization/read2 path. No unrestricted runtime,
   Provider/paid LLM/Production or automatic policy is implied.

Real-device picker/security-scoped URI lifetime, installed Expo bridge, arbitrary
supplier layouts, hostile/large PDF stress, scanned PDFs/images/OCR, real private
files and real DEV auth/Node-pg/TLS/runtime remain untested. Native preparation and
accepted text downstream are independently verified; the requested complete PDF
→ accepted Day journey is **not delivered** and must stay blocked until owning
Source/Core changes are reviewed.

**STOP: CP-FLIGHT-NATIVE-01 Owner Review.** Local branch/commit only, no canonical
merge/push. This report does not claim activation or full Flight E2E readiness.
