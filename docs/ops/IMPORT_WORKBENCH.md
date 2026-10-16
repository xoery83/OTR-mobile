# Local import diagnostic workbench

Owner-approved W1/W2 and limited W3. This is engineering tooling, not a product
intake route. No Auth, Repository mutations, Source authority, Admission, Remote
LLM, object storage or backend endpoints. Remote is always `NOT_USED`, cost `0`.

## Run on Mac (W1)

From the repository root with existing dependencies installed:

```sh
node --import tsx scripts/import-workbench/server.ts
```

Open **http://127.0.0.1:49184**. Choose/drop multiple PDF, JPEG, PNG or UTF-8 text
files; choose the run location and click **Run selected** or **Run all**. One click
runs the chosen inputs sequentially through the existing single-input endpoint;
each input retains its own Trace and failure state. Terminal failure permits the
next input; unresolved transport failure stops the batch to avoid overlapping
model calls. Saved inputs remain available for subsequent runs.
The first Mac run compiles the checked-in thin `Runner.swift` together with
**modules/receipt-ocr/ios/FlightPdfExtractor.swift** using the existing Xcode SDK.
It invokes the production PDFKit/Vision/FoundationModels implementations, not a
replacement parser. The Node caller invokes the same pure extractor validator,
20-second model deadline, deterministic builder and typed read projection as iOS.
No package downloads or new dependency are required.

Artifacts are fixed to `/private/tmp/otr-import-workbench-private-20261016`:
root `0700`, original bytes and JSON `0600`, native executable `0700`. They are
outside Git. Limits: 10 MiB/input, 64 saved inputs, 256 runs, 64 imported traces,
2 MB/Trace request, one active run. Original file names are display metadata only;
server paths use generated UUIDs. The server binds `127.0.0.1`, checks exact Host
and Origin for browser writes, provides no CORS, and accepts no executable or
arbitrary filesystem-path parameters. HTML exports escape all untrusted content
and forbid scripts. The same-origin read-only endpoint
`GET /api/input/:UUID/original` verifies retained byte pins and serves the fixed
MIME with a generated safe inline filename for PDF/image evidence viewing; no
filesystem path or Native token is exposed. Do not proxy/expose the server to
another interface.

Compare two completed runs of the **same original SHA/bytes**. It reports text
SHA/version differences, and added/removed field values, normalized values and
exact evidence. Model evidence changes are reported separately. `hostSourceManifest` pins the actual production-core local runtime import closure
(resolved with the existing esbuild metafile) and `package.json`/`package-lock.json`,
plus the formal Swift extractor/thin runner. Changes to transitive schemas or
normalizers also require restart. It is **host source provenance**, not executing
build attestation: Trace `executedVersion.native` and `.javascript` remain
`UNVERIFIED`, especially for an already-installed iOS binary or loaded Metro bundle.
Compare reports `sameHostSourceManifest`; legacy narrow maps have unknown coverage
and return null rather than claiming matching versions.
Saved C4/other JSON Trace imports are explicitly **IMPORTED_UNVERIFIED_VIEW_ONLY**;
viewing them cannot create a new verified run or participate in accuracy scoring.
JSON and safe static HTML exports preserve diagnostic scope.

## Existing isolated iOS App (W2)

Only the approved iOS26.5 Simulator
`418CF8AE-ED96-4E76-8D22-533EB6C08032`, installed bundle `com.xoery.otrmobile`.
No reinstall, Session copying or Auth changes. Coordinate with its owner before
replacing only Metro8084; leave A1A/AD5 and8081/8082/8083 unchanged.

Start the server with the explicit temporary gate:

```sh
node --import tsx scripts/import-workbench/server.ts --arm-ios
```

This uses `simctl get_app_container` for that exact device/bundle, writes only
`Library/Caches/import-workbench/gate.json` (0600 under0700) and records the exact
path in the private `ios-gate-manifest.json`. The random loopback diagnostic token
is not an Auth credential and never enters source, URLs, argv or logs. Gate
expires in one hour. It pins container, device, endpoint and the declared host source manifest. It does
not attest the installed Native binary or executing JS bundle. iOS Run is disabled
until the server has a valid arm window and a recently connected authenticated
caller; an unconnected caller is reported explicitly.

Use the existing approved public Dev configuration (only existing public URL and
publishable key, never a secret or Session) if required by normal App bootstrap.
Start a dedicated Metro from this worktree, without clearing shared caches:

```sh
EXPO_OFFLINE=1 EXPO_PUBLIC_OTR_IMPORT_WORKBENCH=1 \
  node node_modules/expo/bin/cli start --dev-client --localhost --port 8084
xcrun simctl terminate 418CF8AE-ED96-4E76-8D22-533EB6C08032 com.xoery.otrmobile
xcrun simctl launch 418CF8AE-ED96-4E76-8D22-533EB6C08032 com.xoery.otrmobile \
  -RCT_jsLocation localhost:8084
```

The Root lazily imports the caller only with DEV and this explicit flag. The
caller also requires exact iOS26.5 and the matching private container gate. It
polls only the fixed loopback URL, fetches one server-allowlisted diagnostic job,
checks input SHA/bytes and matching host declarations (not runtime attestation), calls the existing Native adapter and
shared core, then posts a Trace. The server revalidates extraction/model anchors
through production validators. Completed diagnostic inputs can be run again with
new diagnostic run IDs; normal Capture jobs and successful queue inputs are never
reclaimed. `IOS_DIAGNOSTIC_COMPONENT` is **not normal App Repository Runtime**.

After testing, remove only the exact gate file named by the private manifest,
confirm its absence, stop the diagnostic Metro/server and restart the usual
isolated preview without the enable flag if desired. Preserve App Auth/DB and
existing normal originals/results. Never delete the App container. Source can
stay committed: the caller is dormant without both DEV opt-in and private gate.

## V2.1 Universal Document Inspector

The [Owner V2.1 contract](IMPORT_WORKBENCH_V21_CONTRACT_20261016.md) replaces the
previous unsubmitted Flight-only UI specification. Existing W1/W2 runners,
production interpretation, retained originals and Trace identities are preserved.
See [actual capability boundaries](IMPORT_WORKBENCH_V21_CAPABILITIES_20261016.md).

Five Chinese/English workspaces:

1. **Inspect / 检查结果** opens the latest saved run by default. Choose a document
   and run, then inspect the actual original, interpretation observations and
   selected field's evidence chain in three columns. Text PDF pages have real
   raster previews/thumbnails/paging/zoom; image regions and UTF-8 snippets use
   actual recorded locators. Without geometry, page/snippet evidence is shown
   without fabricated highlighting. By Result, By Field and Stage Contribution
   views share the same saved Trace. Interpretation is never labelled Admission.
2. **Test / 测试** selects multiple files or reruns saved originals on Mac or the
   explicitly connected iOS caller. There is no silent runtime fallback.
3. **Compare / 运行对比** defaults to two different completed runs of the same
   original bytes. Changes in fields, evidence, partial structure, timing and
   host version are diagnostic differences, not automatic accuracy improvements.
4. **Ground Truth / 人工真值** stores zero/many diagnostic result groups,
   segments and optional participant labels through ordinary forms. Confirmed,
   not-provided and unchecked values remain distinct. Add/delete/split/merge
   affects annotations only. Multi-result/segment/participant identity matching
   is not implemented: precision/recall are N/A for those annotations. A single
   confirmed flat Flight result can use reviewed-path exact original-text-pair
   matching; this is not normalized domain accuracy. Unlabelled, incomplete,
   unsupported-type and hypothesis annotations are not scored.
5. **Runs / 运行历史** reopens existing runs. JSON and escaped static HTML exports
   retain full technical diagnostics; imported Traces remain unverified views.

IDs, hashes, technical errors, versions and full JSON are in Developer Details.
Apple observations remain advisory; rejected raw responses are not retained.
Combined parser/capability timings stay combined, unknown counts stay N/A, and
Not Run differs from Not Recorded. Typed missing-field hints use only existing
local-enrichment checks, not an invented full Admission-required-field list.

`GET /api/input/:UUID/preview?page=1` renders existing pinned PDFs with the installed
fixed `pdftoppm` executable; it is not an extraction engine. Page1–32, fixed argv,
15-second timeout, 4000px maximum side, 8MiB PNG output and bounded private cache
apply. Invalid pages, corrupt originals and mismatched fingerprints are rejected.
No executable, command or filesystem path is accepted from the browser.

## Verification and limits

```sh
npx vitest run --config scripts/import-workbench/vitest.config.ts
npm run typecheck
npm run ui:guard
```

Network-enabled test sandbox permission is needed only for an ephemeral loopback
HTTP listener. Mac model availability depends on the local OS/device/resources;
iOS capability is reported from its actual bridge. A process-first call is not
proof of evicted system model resources. Native generation has no cancellation;
a late iOS response is ignored by the unchanged JS20s deadline, while a Mac
component subprocess is closed after the result. Model failure preserves all
valid deterministic fields. iPhone16Pro/full-device-offline remain unverified.

## Observation lineage and business structure

Inspect defaults to **Business Structure / 业务结构**. Each local observation lists
its real fields, evidence, current host producer function and selected runner.
This is not executed-build attestation. Actual Input/observation/partial typed
projection identities remain distinct from formal Candidate, Booking, Segment
and Canonical Item; unexecuted consolidation is not inferred by the UI. Human
Expected Structure is displayed separately from saved diagnostic annotations.

Apple diagnostics separately show availability, invocation, output production
(recorded or explicitly inferred), evidence validation and retained contribution.
`LOCAL_MODEL_EVIDENCE_INVALID` means **模型输出证据校验失败**, not unavailable
hardware or engine. The existing error path proves a parseable response reached
validation, but rejected raw output is not retained; its exact literal and
not-found versus duplicate-match reason cannot be reconstructed. No validator
relaxation, parser change or new raw-output logging is part of this UI packet.

## Parser / Apple accuracy correction R1 — 2026-10-16

Reference extractor descriptor adapter3 reads explicit uppercase airport cells only
inside the existing validated flight table, and a booked title's explicitly printed
date on its physical next line. Blank paragraphs/unrelated headers do not bind.
An inline booked reference is retained as an unsupported `bookings` deferred
fragment; it does not establish Booking identity or a service-to-table association.

Shared Swift uses Foundation Models guided `@Generable` flight-number output and
serializes the same bounded bridge JSON. Exact literal/unique-source anchors and
JS deadline remain unchanged. Optional bounded `model.evidenceFailure` distinguishes
invalid designators, missing literals and duplicate matches; no raw model output
is retained, and old Traces remain readable.

Two original files were rechecked through formal Mac components. PDF fields20→25
(four printed airport fields plus explicit title date), one deferred reference;
three partial observations remain. Final Apple response1/4 service observations
passed evidence checks, but all duplicate existing deterministic services: zero
new model business facts. Two prompt-only failures plus two structured runs are
retained privately. No remote call, Storage, Admission or Canonical write. Exact
private receipts remain outside Git; iOS App/physical-device regression pending.

## Model invocation lifecycle and current-evidence ID fencing

Semantic Native calls now carry a unique invocation ID and absolute20s deadline;
model cancellation is separate from Vision cancellation. The Native actor records
cancel-before-begin, rejects expired/closed requests, permits one active model task,
and discards late output. JS deadline/AbortSignal cancels only that invocation;
responses must echo its ID. The Mac component closes only its own active process.
Old installed binaries without this model-specific cancel endpoint report
CAPABILITY_NOT_INSTALLED instead of starting an uncancellable request.

The existing PartB includes an exact Field/Evidence/Observation ID allowlist.
Native FoundationModels DynamicGenerationSchema derives enum choices and bounded
arrays from that same request; no globally available ID is admitted implicitly.
The unchanged deterministic Proposal Validator still decides reference/evidence
validity and readiness. Guided structure/IDs do not grant Admission.

Trace reasons distinguish LOCAL_MODEL_APP_TIMEOUT, LOCAL_MODEL_NATIVE_TIMEOUT
(framework timeout), LOCAL_MODEL_CANCELLED,
LOCAL_MODEL_GENERATION_ERROR / LOCAL_MODEL_GENERATION_DECODE,
LOCAL_MODEL_TRANSPORT_ERROR / LOCAL_MODEL_TRANSPORT_PARSE and
LOCAL_MODEL_EVIDENCE_REJECTED. Legacy Trace reasons remain readable. No original
text, prompt or Auth value is added to ordinary logs by this lifecycle correction.

## Recorded Remote LLM inspection (2026-10-17)

Inspect loads separately stored `remote-<uuid>.json` diagnostic receipts from the
existing private store. Each receipt must match the original bytes, baseline Run,
and exact Part A/B request digest reconstructed through production components.
Opening Inspect never reads a Provider key or dispatches a model call. Receipts
are not local Run results or normal Backend/Native acceptance evidence.

The panel separates HTTP/output, JSON parsing, Proposal schema, original recorded
validation, current Validator recheck, and business readiness. Revalidation does
not erase the historical result or constitute a new Provider call. Model basis,
conflict descriptions and Review questions remain unverified advice, including
questions about already supplied facts. Proposed field/segment references and
real source snippets are visible; technical request/output remains collapsible.

Provider input/output/total/cache counters are reported usage, not predictions;
cache is included in input. Unknown usage/cost is never zero. Text UTF-8 byte
upper bounds are estimates, not tokenizer measurements; image input is not
estimated. Output limit is a cap, not expected usage. Peak cache-miss price gives
an estimated USD upper cost using a dated official price snapshot, not an invoice.
Local-only runs and Apple without recorded token metrics remain separate/unknown.
JSON and HTML exports include the archived Remote diagnostics.
