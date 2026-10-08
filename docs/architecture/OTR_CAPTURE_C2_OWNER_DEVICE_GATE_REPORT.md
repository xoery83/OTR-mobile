# Capture C2 owner device gate report

Date: 2026-10-08 (Pacific/Auckland). **C2 FINAL OWNER REVIEW PASS — DEVICE TESTING AND PERSISTENCE AUDIT ACCEPTED.**

## Final Owner acceptance

On 2026-10-08 (Pacific/Auckland), the Owner explicitly issued **C2 FINAL OWNER
REVIEW PASS** and authorized one local checkpoint commit on
`codex/capture-c2-builder`. Acceptance covers C2 durable local intake, SQLite51,
native Files/Photos submission, atomic CP11 binding, idempotent recovery, offline
local acceptance and scoped Job read/reopen. Owner device testing and the final
read-only persistence audit are accepted: mixed4/4 and Owner-confirmed offline2/2
saved; 7 retained Jobs /11 ACCEPTED Inputs with verified CP11 bytes and scope.

Earlier waiting statements, no-device-PASS statements and uncommitted Git snapshots
below are historical stage evidence; this explicit Owner decision supersedes their
pending acceptance status. It does not upgrade unperformed checks or network
telemetry into measured results. The full suite retains its reproduced existing
architecture-boundary failure; **no global full-suite PASS is claimed**. C3 Activity,
AI processing, canonical admission and runtime/provider gates remain unauthorized.
Only the complete accepted C2 checkpoint may be locally committed; no push, merge,
rebase or cherry-pick. The resulting commit SHA is recorded by Git and the final
handoff rather than a self-referential hash inside the commit.

## Device and exact source

- Device: **Leon's iPhone16pro**, physical **iPhone 16 Pro**, model `iPhone17,1`.
- UDID: `00008140-001C2980269B001C`; iOS **27.0.1**, OS build **24A446**.
- Xcode **27.0**, build **27A266a**; wired, paired, Developer Mode enabled.
- Only implementation/build worktree: `/private/tmp/otr-capture-c2-builder`.
- Branch: `codex/capture-c2-builder`; starting HEAD and pre-commit device-gate evidence base:
  `b6daffecedab1616b173fde3f5e2de5d54770eff`.
- At entry the reviewed 27 changed/new files and tracked diff matched the prior
  report: 16 tracked files, 809 insertions /437 deletions. Entry tracked binary
  diff SHA-256: `87010ea705ae03732a0c2b2ff3e017e06dd7668e54bff44495d0e36732bb5f33`.
  All 27 file hashes and that diff were rechecked unchanged immediately before
  installation. All 88 historical migration files remained byte-identical.

## Signed Release build

Followed `docs/IOS_DEVICE_RUNBOOK.md`: regenerate the ignored native project with
existing plugins, prepare native dependencies, build Release with its embedded
JavaScript bundle, then separately verify and overwrite-install the signed app.
No app identity, product configuration or reviewed C2 code was changed.

- Scheme `OTRMobile`, configuration **Release**, product `Release-iphoneos`, arm64.
- Existing Apple Development signing with Team **U9D5C58Z94**, automatic provisioning.
  This is a signed device Release, not an App Store/distribution archive.
- Bundle ID `com.xoery.otrmobile`; application identifier
  `U9D5C58Z94.com.xoery.otrmobile`; app version `0.1.0`, bundle version `1` retained.
- Signature verified with `codesign --verify --deep --strict`; provisioning profile
  includes the exact target device. Existing Keychain identity is retained.
- Release contains its 6,136,318-byte Hermes bundle. Verified SQLite51 table names,
  immutable submission guards, `continuesFromInputId` and `NOT_INSTALLED` markers,
  together with unchanged reviewed source and actual device schema51.
- JavaScript bundle SHA-256: `5c3d40b312fa029a0900f927691bd28f904128fc4e1d5759c26bae27b3f6eceb`.
- Build-time `EXPO_NO_DOTENV=1`; existing diagnostics transport selector `dev` with
  API `http://127.0.0.1:9`. No Hosted Supabase credentials/config were loaded.
  This local device-gate build does not provide online DEV backend connectivity;
  retained local authentication and local C2 intake are available. No new runtime
  or provider gate was activated.

Build command (native output under the specified worktree):

```sh
CI=1 EXPO_NO_DOTENV=1 EXPO_PUBLIC_OTR_SYNC_TRANSPORT=dev EXPO_PUBLIC_OTR_API_BASE_URL=http://127.0.0.1:9 xcodebuild -workspace ios/OTRMobile.xcworkspace -scheme OTRMobile -configuration Release -destination id=00008140-001C2980269B001C -derivedDataPath ios/build-c2 -allowProvisioningUpdates DEVELOPMENT_TEAM=U9D5C58Z94 CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY='Apple Development' PROVISIONING_PROFILE_SPECIFIER='' build
```

Result: **BUILD SUCCEEDED**. Dependencies were cloned into this worktree rather
than leaving the temporary dependency symlink; native tooling wrote only ignored
local build/dependency outputs. CocoaPods cached/official build artifacts and Apple
trust/CoreDevice services required sandbox escalation. Initial sandbox failures
were tooling-access failures, corrected without product code changes.

## Preservation before installation

1. Read the installed identity `com.xoery.otrmobile` and existing database version
   **50**. Orderly SIGTERM, with no forced kill/uninstall/reset, allowed a consistent
   private snapshot of Documents and Library before installation.
2. Snapshotted **288 files**, including all **99 Documents files**, local database,
   receipt drafts, Library assets and preferences. Private raw user files remain
   only in ignored `ios/device-gate`; no records or credentials are included here.
3. Rehearsed all unapplied reviewed migrations on a SQLite backup of the actual
   device database, never the device file. **50 → 51 passed**: all 84 prior data
   tables, **9,242 rows**, table definitions and 50 prior migration records remained
   exactly equal. Added only the two empty C2 tables. Integrity `ok`; zero FK issues.
4. After overwrite installation and **before first launch**, read Documents/Library
   back. **284 retained files exactly matched pre-install hashes**; no changed
   retained file. All Documents and Library user data/preferences were preserved.
   The installer removed four OS-generated `Library/SplashBoard/Snapshots` images;
   these are UI snapshot caches, not user evidence. No cleanup command was run.

## Actual migration and launch verification

- `devicectl device install app` completed successfully over the existing app.
  No uninstall, reset, SQLite clear, bundle switch, destructive test build or
  destructive submission was used.
- First launch succeeded and rendered the existing Today shell without Metro or
  network reauthentication. Retained local session was available.
- Existing read-only diagnostics showed **database initialized: yes**, **schema51**,
  **AUTHENTICATED_OFFLINE**, **pending sync0**, **pending Itinerary creates0**.
  Device networking itself was online; local access succeeded with no Hosted config.
- Capture opened from the installed tab and after an orderly restart via the
  existing `otrmobile://capture` route. Observed **selected0**, Files/Photos actions,
  disabled **Add0**, and Cancel. No picker was invoked; no Batch/Input/original was
  created. Final app was left running on the empty Capture page for the Owner.
- Read the actual migrated database back after orderly termination. **Schema51**,
  integrity `ok`, zero FK issues, all 84 prior table row counts and **9,242 rows**
  retained, all historical migration records exact. **83 prior data tables** retained
  exact typed-row hashes. Existing startup health scanning updated only
  `last_cheap_scan_at`, `run_generation`, and `updated_at` in one of two
  `data_health_state` rows; all other health fields/rows were preserved. This normal
  health metadata update is disclosed rather than claiming a byte-identical DB.
- All non-database Documents files remained byte-identical after launch.
  `capture_submission_batches=0` and `capture_submission_inputs=0` confirm no C2
  submission. No Source/Run/Import/provider/runtime activation occurred.

## Checks and remaining acceptance

- Actual-device-copy migration rehearsal and actual migrated DB preservation checks:
  **PASS**, with normal health metadata changes and OS splash caches disclosed.
- Fresh affected regression: **3 files /58 tests PASS** (`database`,
  `captureSubmissionRepository`, `captureUriReader`) with isolated dependencies.
- Signed Release build, signature/profile verification, overwrite install, startup,
  on-device diagnostics51 and Capture reachability: **verified**.
- No code change was required. Report and current-state handoff are the only new
  documentation changes in this device gate. No commit, staging or push.
- This does **not** claim Owner device PASS or verify Files/Photos fidelity,
  real Add N submission, partial failures, recovery, accessibility or the complete
  Owner acceptance matrix. These interactions remain for the Owner. C3 and
  Hosted/runtime/provider gates remain closed.

## Evidence and final Git status

Private local proof JSON and safety copies: `ios/device-gate/` (Git ignored).
Build product: `ios/build-c2/Build/Products/Release-iphoneos/OTRMobile.app`.
Logs retained under `/private/tmp/otr-c2-device-*`, including
`otr-c2-device-release-build.log`, `otr-c2-device-install.log`,
`otr-c2-device-launch.log`, `otr-c2-device-final-launch.log`, and
`otr-c2-device-affected-tests.log`. Signed build/profile proof, installation hash
comparison and actual migration proof are preserved locally; user rows and secrets
were not published. The original C2 engineering reports remain unchanged.

Final exact Git status follows; all changes are unstaged. Product code is unchanged
from the reviewed C2 snapshot; current-state/report updates record this gate only.

```text
HEAD: b6daffecedab1616b173fde3f5e2de5d54770eff
Branch: codex/capture-c2-builder
Staged changes: NONE

$ git diff --stat
 app/(tabs)/capture.tsx                             |   6 +-
 docs/CURRENT_IMPLEMENTATION_STATE.md               | 338 +++++++--------------
 docs/DATA_MODEL.md                                 |  22 ++
 docs/OFFLINE_SYNC.md                               |  20 ++
 src/data/db/checkpoint11Integration.test.ts        |   3 +-
 src/data/db/database.test.ts                       |  19 +-
 src/data/db/migrations.ts                          |   2 +
 .../defaultLocalCaptureInboxRepository.ts          |  26 +-
 .../intelligenceContinuationRepository.test.ts     |   6 +-
 .../repositories/localCaptureInboxRepository.ts    | 308 ++++++++++---------
 .../tripCanonicalEventRepository.test.ts           |   2 +-
 src/features/capture/CaptureContent.test.ts        |  46 +++
 src/features/capture/CaptureContent.tsx            | 302 +++++++++++++++---
 src/features/capture/captureLifecycle.test.ts      | 101 +++++-
 src/features/capture/captureStaging.test.ts        |   3 +-
 src/ui/catalogs.ts                                 |  58 ++++
 16 files changed, 825 insertions(+), 437 deletions(-)

$ git status --short
 M app/(tabs)/capture.tsx
 M docs/CURRENT_IMPLEMENTATION_STATE.md
 M docs/DATA_MODEL.md
 M docs/OFFLINE_SYNC.md
 M src/data/db/checkpoint11Integration.test.ts
 M src/data/db/database.test.ts
 M src/data/db/migrations.ts
 M src/data/repositories/defaultLocalCaptureInboxRepository.ts
 M src/data/repositories/intelligenceContinuationRepository.test.ts
 M src/data/repositories/localCaptureInboxRepository.ts
 M src/data/repositories/tripCanonicalEventRepository.test.ts
 M src/features/capture/CaptureContent.test.ts
 M src/features/capture/CaptureContent.tsx
 M src/features/capture/captureLifecycle.test.ts
 M src/features/capture/captureStaging.test.ts
 M src/ui/catalogs.ts
?? docs/adr/2026-10-08-capture-c2-local-intake.md
?? docs/architecture/OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md
?? docs/architecture/OTR_CAPTURE_C2_INDEPENDENT_REVIEW.md
?? docs/architecture/OTR_CAPTURE_C2_OWNER_DEVICE_GATE_REPORT.md
?? src/data/db/migrations/captureSubmissions.ts
?? src/data/operations/captureSubmission.ts
?? src/data/operations/defaultCaptureSubmission.ts
?? src/data/repositories/captureSubmissionRepository.test.ts
?? src/data/repositories/captureSubmissionRepository.ts
?? src/domain/capture/captureSubmission.ts
?? src/native/captureUriReader.test.ts
?? src/native/captureUriReader.ts
```

STOP — WAIT FOR OWNER C2 DEVICE ACCEPTANCE.

## Final read only device persistence audit

Date: 2026-10-08 (Pacific/Auckland). **PASS — retained C2 persistence and scoped
repository reopening verified. STOP FOR OWNER FINAL REVIEW.** This is a persistence
audit result, not a declaration of final Owner acceptance.

### Read only method and unchanged device evidence

- Same physical iPhone 16 Pro, UDID `00008140-001C2980269B001C`, installed signed
  C2 Release `com.xoery.otrmobile`, SQLite51. No build/install or app navigation was
  performed in this audit. No device process termination/relaunch, new submission,
  picker invocation, migration, record mutation/deletion, configuration or code edit.
- Copied the device's `Documents/SQLite` three times using `devicectl device copy
from`. Each directory contained the database only, with no WAL/journal sidecar.
  All three complete **20,418,560-byte** database snapshots have identical SHA-256:
  `97442022c2eb01340604d7a5c0517f12807b150101e711e0cec6e76cc2f5cd28`.
  This includes a final copy after all local repository checks.
- All SQL checks used SQLite read-only connections and `query_only=ON`. Original
  production repository factories ran against a **local read-only device snapshot**;
  the mutation adapter throws on every write, and ID allocation/mutation timestamps
  throw. Zero write attempts, no migrations. Local snapshot hash unchanged afterward.
- Private proof files/scripts remain under ignored
  `ios/device-gate/persistence-audit/`; no content bytes, filenames or credentials
  are included in this report. Only this report was appended during the audit.

### Persisted Batch Job and Input outcomes

Exactly **7 Batch headers /7 distinct Job UUIDs /11 Inputs**, all scoped to Account
`00000000-0000-4000-8000-000000000001`. Every Input is **ACCEPTED**; **failed0,
pending0**. All accepted Inputs have revision3, accepted Capture revision1, a
content pin, Capture ID, payload ID and accepted timestamp, with no failure/pending
reason. The ordinal roster and immutable header digests passed production reader
validation. The pre-testing device-gate snapshot contained no Batch/Input records;
these are the subsequently retained Owner-testing submissions.

Times below are device-recorded creation timestamps converted from UTC to
Pacific/Auckland (**NZDT, UTC+13**); they are not network telemetry.

- **13:43:22.268 NZDT** — 4/4 ACCEPTED, Files2 + Photos2.
  Job `f3a6d446-14d1-4b74-814f-002bf654cbb8`;
  Batch `5250273d-c3bb-45ab-928b-ef571553364d`;
  submission key `7331948e-b53c-4010-a178-6a9cacb23300`.

- **13:45:37.257 NZDT** — 1/1 ACCEPTED, Files1 + Photos0.
  Job `a8f45dbd-7a77-4ea3-bf6b-83fc618512aa`;
  Batch `22233d2f-95a3-418a-a317-8f7b9b613ad2`;
  submission key `49ec0d16-006f-4749-97b7-cd5b12140ddc`.

- **13:46:06.390 NZDT** — 1/1 ACCEPTED, Files1 + Photos0.
  Job `7258e446-e1a7-4a2b-afd0-607042a61439`;
  Batch `838780c8-496c-45cd-9a58-2abda1532949`;
  submission key `68b3defe-f553-473b-ba49-b152da644c66`.

- **13:46:36.594 NZDT** — 1/1 ACCEPTED, Files1 + Photos0.
  Job `3ba87d4d-2c8e-4981-9937-a5b311195929`;
  Batch `4335ce4a-9aea-4d66-9801-5277081a423d`;
  submission key `3a4aac98-90bd-47dd-a8cd-bb749ea554c5`.

- **13:46:44.382 NZDT** — 1/1 ACCEPTED, Files0 + Photos1.
  Job `37073178-cf63-46b9-824a-3103c2a8c70f`;
  Batch `d4f4c68a-4415-46d7-bc51-3b58991cb2f0`;
  submission key `2bfd5b6c-552a-449f-9df4-5b9450c7dc1a`.

- **13:47:44.675 NZDT** — 1/1 ACCEPTED, Files1 + Photos0.
  Job `f2312111-bab6-4cff-9258-5c8bd8c6bc12`;
  Batch `780a4acc-2508-4b9c-a370-519177d0c21d`;
  submission key `cb2710db-a522-4dc9-9bf6-eeba95126c58`.

- **13:48:38.567 NZDT** — 2/2 ACCEPTED, Files1 + Photos1.
  Job `afd3c134-a31c-4267-88fe-15214444a951`;
  Batch `a9d96000-e9d9-47b2-938c-bd17567295a3`;
  submission key `0c19c323-6fb6-402a-892c-6a0dd13f319d`.
  **Owner-confirmed offline submission.**

The first 4/4 roster (Files2 + Photos2) matches the Owner's reported mixed intake.
The final 2/2 roster (File1 + Photo1, 13:48:38.567) was explicitly confirmed by the
Owner as the submission with networking disabled, described initially as around
13:49. Its actual retained outcome is **2 ACCEPTED, 0 FAILED, 0 PENDING**.

**Network provenance:** offline attribution is the Owner's explicit observation
and confirmation of that roster/time, not an inference from SQL. The schema stores
no online/offline flag. Other six Jobs have known accepted outcomes but their
individual network modes were not separately recorded/confirmed in this audit;
they are not automatically labeled online by time order or acquisition source.
Owner-reported iCloud acquisition success is separate from persisted local-custody
verification; provider identity/network fetch history cannot be reconstructed from
the generic Files declaration. Nothing in this audit invents an online result or
uses current reachability as proof of submission-time connectivity.

### Exact accepted Input Capture and payload bindings

All eleven mappings below were checked on the same Account. Each retained payload's
actual bytes match its own stored byte count/SHA-256 and the Input content pin.
CP11 `getForSourceHandoff` independently returned verified bytes for every mapping.

- Input `7c6d79db-6e29-49a2-a008-24a8f119da05`
  → Capture `c010cdad-d7b3-43ef-bfd1-bb781ae69152`
  → payload `4d66566a-2c3d-42b6-9b36-7a84de3eadca`; **382,667 bytes**,
  SHA-256 `aa8ca45ca133db4d25fb16f06658c9d8e501871d61f0ba2b099c08329c922aa0`.

- Input `429caec0-7336-46fb-84f7-d804b5fffa37`
  → Capture `ccc81dcf-7889-4112-a284-db20abbf9b64`
  → payload `a1db65e9-1038-4a2f-b06f-f35fc8645247`; **393,412 bytes**,
  SHA-256 `64f80b9af55271d8106081ae7703de89eed508bb1b9f498a810dab990692712d`.

- Input `7d9d6478-ca9b-411e-b1f8-e1fb307664d3`
  → Capture `c66e52fa-0092-4259-9001-88c24a22df13`
  → payload `1b087eea-c564-4f5f-9dbc-e8e5d260e353`; **3,921,957 bytes**,
  SHA-256 `fe1c8265753160e55ca30e63662bb13fc7e9794858f1a4508b370d71bd8a0625`.

- Input `f3f1b4be-fb74-4308-bd8d-8b36d1ef93d8`
  → Capture `eb9e9075-aef5-4de7-a4f2-e92ebc7d3899`
  → payload `e27fdae1-f303-463c-83d8-92ca303f2378`; **3,322,959 bytes**,
  SHA-256 `c72723c1bc51a00e316f528684e9a36bf6f36710055a4b0e976271d9500ddcec`.

- Input `e8048144-59a9-404b-818c-896a1251a812`
  → Capture `676e7d49-650b-4587-ab86-ff102a06979d`
  → payload `c85ed8eb-a307-477e-b0a0-be2666522946`; **58,172 bytes**,
  SHA-256 `3e325ba081835cf18bfd81c9509f89519c18691638f3de1f05491bdfaabc4550`.

- Input `2c2c7dbd-1f13-4171-a1f8-1017416e807e`
  → Capture `80924860-12ab-4f6a-9d26-43d79897a176`
  → payload `c85ed8eb-a307-477e-b0a0-be2666522946`; **58,172 bytes**,
  SHA-256 `3e325ba081835cf18bfd81c9509f89519c18691638f3de1f05491bdfaabc4550`.

- Input `0ca268d6-8629-4f06-a7fc-dd8535289e68`
  → Capture `4aa40b7f-5867-4cd2-8227-613a41524470`
  → payload `a1db65e9-1038-4a2f-b06f-f35fc8645247`; **393,412 bytes**,
  SHA-256 `64f80b9af55271d8106081ae7703de89eed508bb1b9f498a810dab990692712d`.

- Input `8fa744c6-c7bd-4880-ae77-85ede2870f24`
  → Capture `6407300f-4cda-4a4d-b5a6-980f844a6355`
  → payload `e27fdae1-f303-463c-83d8-92ca303f2378`; **3,322,959 bytes**,
  SHA-256 `c72723c1bc51a00e316f528684e9a36bf6f36710055a4b0e976271d9500ddcec`.

- Input `2b2cb61c-5ad6-4dc2-b9a8-c5607f7971d6`
  → Capture `a6f3db01-e7ad-49a7-9404-0556c504eaca`
  → payload `de835e8f-fc7f-43ee-baad-dba5bd021cc1`; **5,292,073 bytes**,
  SHA-256 `66ac6ae60a45635b0968a8e75b6f91eb21f20b0f109c6d06ea2dd71489e65ed1`.

- Input `dd7a6f43-5cf3-4a08-bd88-b3cb0dc36104`
  → Capture `5a28be36-4aa6-4d8e-8c2a-af2718a7659c`
  → payload `a16dd750-21de-42a5-868c-15406092f708`; **601 bytes**,
  SHA-256 `716edb30f7198b4964cbe4976b614b52bd0efa773f176b138f9509b4df7e49fd`.

- Input `a20aaf24-da14-41c6-86ee-948530c072f0`
  → Capture `15c270de-814f-482e-9ef0-88e630a03472`
  → payload `e27fdae1-f303-463c-83d8-92ca303f2378`; **3,322,959 bytes**,
  SHA-256 `c72723c1bc51a00e316f528684e9a36bf6f36710055a4b0e976271d9500ddcec`.

The 11 distinct Captures reference **7 unique payloads**, totaling **13,371,841
retained bytes**. No accepted Input reuses another Input's Capture reference.
Repeated selections in separate explicit submissions correctly create distinct
Input/Capture references while exact-byte duplicate originals share their retained
payload. This is CP11 deduplication, not duplicate submission corruption:

- Payload `a1db65e9-1038-4a2f-b06f-f35fc8645247`: 2 distinct Capture/Input references.
- Payload `e27fdae1-f303-463c-83d8-92ca303f2378`: 3 distinct Capture/Input references.
- Payload `c85ed8eb-a307-477e-b0a0-be2666522946`: 2 distinct Capture/Input references.

Integrity results: `PRAGMA integrity_check=ok`; **0 foreign-key violations**;
**0 orphaned accepted bindings**, **0 duplicate Input IDs/item keys/Capture
references**, **0 duplicate identical payload rows**. Every Capture and payload is
referenced by an accepted Input, with no orphan window or unbound CP11 original in
these Owner-testing records. All retained Captures are INBOX with null Trip prior
assignment; no canonical import or semantic completion is implied.

### Restart Account scope and repository reopening

- Owner explicitly reported successful app restart and returning to normal Capture.
  The gate's final observed process was PID24528; current read-only process inventory
  reports PID24581 for the same installed C2 executable, corroborating a later app
  process. This does not timestamp a particular Job's creation relative to restart.
- The snapshot taken after Owner-reported restart contains all exact Job/Batch/Input
  identities and Account scope above. Three identical complete snapshots prove no
  audit-time drift. No fresh device restart was induced by this read-only audit and
  no pre-Owner-restart per-Job identity snapshot existed; a device-level pre/post
  restart identity comparison is therefore not invented.
- Executed unchanged production `list`, `read`, `reopen`, and exact
  `recoverSubmission(submissionKey)` on all seven retained Jobs: **PASS**, identical
  Job/Batch/Input identities, accepted counts and verified immutable original data.
  Every Job projects `allInputsAccepted=true`, `intakeSettled=true`,
  `processing.capability=NOT_INSTALLED`, `canReopen=true`, and no reacquisition IDs.
- Closed/reopened the **local read-only SQLite connection**, reconstructed the
  repository and reopened all seven Jobs: **PASS**, identical read models.
- In-memory Account transition to another Account: `list=[]`, all seven Job reads
  rejected `NOT_FOUND`. Fresh transition back to the original Account: all seven
  exact Jobs reopened identically. This tests retained-record scope and fresh
  Account admission without changing device authentication or records.
- Measured **320 SELECTs /55 read-only transactions /0 attempted writes**. Cold
  repository reopening and Account checks are snapshot-level execution evidence,
  not claims that an installed C3 discoverability flow was exercised on the phone.

### Why normal Capture entry is empty

**Expected with the installed C2 scope.** `app/(tabs)/capture.tsx` passes a Job only
when an explicit `jobId` route parameter is supplied. Without it,
`CaptureContent.tsx` creates an empty volatile staging invocation; durable repository
reopen occurs only for an explicit Job ID. Hide/navigation/restart does not refill
a picker tray from accepted Jobs, and an empty tray does not mean retained originals
were deleted. The same behavior applies online and offline.

C3 Activity/Recent Imports discovery is not installed. The exact existing seam
`/capture?jobId=<Job UUID>` and scoped repository reopening can read these Jobs;
normal Capture is new intake, not their history view. No new discovery UI was added
or activated. Pending intake is not Review; accepted intake is not canonical import.

### Audit disposition and Git evidence

**PASS for the strictly read-only persistence audit.** Offline2/2 is Owner-attributed
and byte-verified; initial mixed4/4 and every other registered submission remain
accepted with valid CP11 custody. Full submission-time network telemetry and a new
controlled device restart were not part of the read-only method. No implementation
blocker, integrity finding or code correction is identified. Final Owner acceptance
remains pending; C3/runtime/provider gates stay closed.

Local exact evidence: `sql-integrity-proof.json`, `repository-proof.json`,
`raw-record-summary.json`, `source-status-at-audit.json`, and all three SQLite
snapshots under `ios/device-gate/persistence-audit/`. CoreDevice read-copy/inventory
receipts are `/private/tmp/otr-c2-final-audit-*.json` and matching logs.

HEAD/branch and tracked diff remain unchanged during this audit. Only this previously
untracked device report is appended; current-state handoff and production code were
not edited. No staging, commit or push.

```text
HEAD: b6daffecedab1616b173fde3f5e2de5d54770eff
Branch: codex/capture-c2-builder
Staged changes: NONE

$ git status --short
 M app/(tabs)/capture.tsx
 M docs/CURRENT_IMPLEMENTATION_STATE.md
 M docs/DATA_MODEL.md
 M docs/OFFLINE_SYNC.md
 M src/data/db/checkpoint11Integration.test.ts
 M src/data/db/database.test.ts
 M src/data/db/migrations.ts
 M src/data/repositories/defaultLocalCaptureInboxRepository.ts
 M src/data/repositories/intelligenceContinuationRepository.test.ts
 M src/data/repositories/localCaptureInboxRepository.ts
 M src/data/repositories/tripCanonicalEventRepository.test.ts
 M src/features/capture/CaptureContent.test.ts
 M src/features/capture/CaptureContent.tsx
 M src/features/capture/captureLifecycle.test.ts
 M src/features/capture/captureStaging.test.ts
 M src/ui/catalogs.ts
?? docs/adr/2026-10-08-capture-c2-local-intake.md
?? docs/architecture/OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md
?? docs/architecture/OTR_CAPTURE_C2_INDEPENDENT_REVIEW.md
?? docs/architecture/OTR_CAPTURE_C2_OWNER_DEVICE_GATE_REPORT.md
?? src/data/db/migrations/captureSubmissions.ts
?? src/data/operations/captureSubmission.ts
?? src/data/operations/defaultCaptureSubmission.ts
?? src/data/repositories/captureSubmissionRepository.test.ts
?? src/data/repositories/captureSubmissionRepository.ts
?? src/domain/capture/captureSubmission.ts
?? src/native/captureUriReader.test.ts
?? src/native/captureUriReader.ts
```

STOP AFTER THE AUTHORIZED C2 COMMIT. C3 AND RUNTIME GATES REMAIN UNAUTHORIZED.
