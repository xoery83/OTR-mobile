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
and forbid scripts. Do not proxy/expose the server to another interface.

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

## Limited human labels (W3)

Inspect a completed run, enter an exhaustive JSON array of `{ "path": "…",
"raw": "…" }`, choose `HUMAN_GROUND_TRUTH`, then save. Precision/recall compare
unique exact path/raw pairs; they do not score itinerary completeness or admission.
No labels gives `N/A`. `HYPOTHESIS` is explicit speculation and always gives `N/A`.
Synthetic unit labels are not real-world ground truth. Exported diagnostics do not
establish product-level flight accuracy.

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
