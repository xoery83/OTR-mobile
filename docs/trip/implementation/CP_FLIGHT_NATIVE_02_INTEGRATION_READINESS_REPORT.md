# CP-FLIGHT-NATIVE-02 — Native canonical integration readiness

2026-10-12 (Pacific/Auckland). Isolated preparation only. Branch:
`codex/flight-native-02-integration-prep`; worktree:
`/Users/xoery/.codex/worktrees/flight-native-integration-prep/otr-mobile-canonical`.

## Result and exact prepared tree

**PREPARED FOR OWNER INTEGRATION REVIEW. Native app-build/runtime readiness remains
conditional; PDF qualification remains unauthorized REVIEW.** No canonical merge,
push, Hosted/Provider/paid LLM/Production activation or Agent3 contract change.

- Canonical checkout `/Users/xoery/Project/otr-mobile` HEAD verified before/after:
  `12693e3c1513d678bd3fe0190bb830d79f262b49`. Local main and cached origin/main agree.
  No remote fetch or actual remote network verification was performed.
- Accepted Native commit/branch verified:
  `b10e0768fb61f6acb6b2b8f8847d3b0941b3af23` / `codex/flight-native-capture`;
  parent `6af3aff1fbfb136b087512589aa94b2c9d4640fc`.
- The accepted32-file manifest exactly equals its Git commit delta. Native original
  custody, identities, extraction, evidence, bridge, SQLite55 and repository files
  remain byte-identical: **30/32 accepted blobs unchanged**; only the two conflicts
  listed below are reconciled. No new product implementation was added.
- Prepared implementation commit: `06df5de7bfe228519ad3f375964505e4bbd2ba98`.
- Prepared implementation tree: `73178e094092abeed3f4bac7e7ae85a614df8ab3`.
- Its direct parent is exact canonical12693e3 and its delta is exactly32 paths.
  A separate documentation commit adds this report/evidence/manifest and prepends
  the current-state checkpoint. Final documentation tip/tree are returned with the
  completion response; implementation code is unchanged by that commit.
- Final review scope:35 paths in `CP_FLIGHT_NATIVE_02_INTEGRATION_CHANGED_FILES.txt`.
  Every accepted blob/hash and conflict disposition is retained in the adjacent
  `CP_FLIGHT_NATIVE_02_INTEGRATION_EVIDENCE.json`.

## Canonical/Core/Backend/G2 overlap and resolution

Current canonical advances Native's6af3aff parent by Backend implementation
b612357 and its readiness docs12693e3. These introduce19 changed paths. Exactly
**two** overlap the Native manifest and produced actual cherry-pick conflicts:

| Path                                     | Resolution                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`   | Retain the Native01 checkpoint ahead of the entire canonical tracked Backend/Core/G2 handoff. Canonical tracked content is an exact suffix. Formatting removes only join-boundary extra whitespace. No older status overwrites current Backend evidence.                                                                                                                   |
| `scripts/trip/core-v2-sql-acceptance.py` | Start with canonical's accepted TEXT runtime setup/loopback TLS/cleanup, then add Native's mutually exclusive `--native-flight` selector. Only two lines differ from canonical. Native/Flight/Source modes stay network-none; only explicit TEXT runtime creates the existing bounded local network/loopback port. No replacement of Backend lifecycle or security checks. |

All17 other canonical Backend paths remain byte-identical. Core owning Source
publisher, command writer, transports and read DTOs are unchanged. Historical
SQLite1–54 and all Server migrations retain their source bytes. Native's previously
accepted additive SQLite55 is retained for private local preparation; accepted
Core collection tables remain SQLite54-owned.

Canonical dirty handoff has an existing9695-byte owner suffix. HEAD, status inventory
SHA256 and handoff SHA256 are unchanged before/after. A local landing preview is
prepared as this candidate handoff plus that exact suffix; it was not written to
canonical or imported into a commit. Unrelated owner files and original chat's older
Platform checkout are untouched. No stash/reset/force operation was used.

Observed G2 DL1 isolated owner tip `81b21923ae431998bef60fa99c356ef8a29c0daa` has14 paths;
its only Native-manifest overlap is the handoff document. The Lab branch is not
imported here. Its shell, Trip/Date selection, catalog, optional fixed NOW and
production presentation remain exclusively Experience/G2-owned. No app/features/
Composer/navigation/sync/domain authority path changes exist in this preparation.
A later G2 landing must reconcile the handoff and recheck its then-current tip.

## Identity, custody, evidence and REVIEW verification

Actual C2 Files-equivalent submission commits exact synthetic original bytes/hash
and accepted Input before extraction. Cold SQLite reopen retains original PDF,
Source/original/derived/Run/Input/publication/plan identities, complete CandidateSet
and Candidate/Item/slot/operation identities. Failed extraction keeps originals and
preallocated IDs; retry never allocates a replacement. Historical replay retains
interpretation even after its original deadline. A→B→A/current generation, revoked
Trip and reassignment fences remain passing.

The accepted extractor supports unencrypted selectable-text PDFs only, at most
10MiB/32 pages/256KiB derived UTF-8. Exact derived text spans map to retained pages;
these offsets are never described as PDF binary offsets or invented visual regions.
Images/scans/encrypted/partially textless PDFs have no new decoder/OCR fallback.
Unknown clocks, terminals and canonical places stay unknown.

The owning disposable SQL scenario again returns two PDF-derived Candidates as
**REVIEW / CONTRACT_UNSUPPORTED**, zero ready commands, zero accepted local Items
and no Day rows. Lost publication response after commit recovers the same result
through exact original identity after local restart. Neither native extraction,
quality nor local Candidate facts grant Source/Core admission. The accepted
Backend acquisition schema remains TEXT/PASTE/UTF-8 only; current Core PG publisher
requires ORIGINAL TEXT. Agent3's pending PDF/derived authority contract is unchanged.

One Capture pipeline is reused: existing C1/C2 custody → explicit dormant Native
preparation → CP13B/accepted `captureFlightCoreV2` → existing Core transport/queue.
No new Publisher, Canonical writer, sync coordinator, retry engine or Day Feed Lab
is introduced. Production has no startup/UI caller of the Native extraction factory.

## Expo packaging and isolated simulator readiness

| Check                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo autolinking            | PASS: local `receipt-ocr` pod resolves to the prepared worktree; module class is `ReceiptOcrModule`.                                                                                                                                                                                                                                                                                                            |
| Module source packaging     | PASS static: existing podspec `**/*.swift` includes both ReceiptOcrModule and FlightPdfExtractor. Config/podspec/package dependencies remain unchanged.                                                                                                                                                                                                                                                         |
| Generated provider          | PASS: actual generated Swift imports ReceiptOcr and registers ReceiptOcrModule once. This is registration evidence, not linked-app evidence.                                                                                                                                                                                                                                                                    |
| Isolated offline prebuild   | PASS; generated-only bundle ID `com.xoery.otrmobile.nativeflightreadiness`, Scene-enabled iOS project. No package.json change, signing, app install or app launch. Build-only config removed from tracked review scope.                                                                                                                                                                                         |
| CocoaPods / linked app      | BLOCKED: default offline attempt fell back to Hermes source build with missing cmake/archive. A generated-build-only override reused the matching cached legacy Hermes archive; CocoaPods then required an unavailable trunk version index. Downloads stayed blocked; no dependency or tracked build-policy change was introduced. Full xcodebuild and installed Expo/Hermes bridge acceptance are NOT claimed. |
| PDFKit simulator executable | PASS: prepared byte-identical source compiled for arm64 iOS27 Simulator; vtool verifies IOSSIMULATOR/minos27/sdk27. Nine synthetic extraction/bounds/Unicode/encryption/textless-page checks pass on designated booted Harness4246352E-7631-4DD5-9E0D-3F35B3150494. No app/container/reset/private file/Day Lab operation.                                                                                      |

Cached canonical Pods were cloned only into the isolated generated directory;
canonical native projects were not modified. Generated artifacts, caches and logs
are not integration files. The offline packaging blockage is an environment gate,
not proof of a bridge source defect. Source/registration and standalone extraction
cannot substitute for a linked app or actual JS→native invocation.

## Targeted verification completed

- **15 suites /266 PASS /1 SQL-only SKIP**: Native bridge factory, C2/original
  custody, PDF extraction/preparation/restart, Flight interpretation/adapters,
  Core repository/read2/Day, G2 composition, Backend Source/driver/network and
  migration/restart compatibility. SQL-only native test passes in its own runner.
- **13 native suite tests PASS** under `--native-flight`, including actual owning
  PDF REVIEW/lost-publication recovery; **1 TEXT runtime test PASS**, **1 joined
  Flight SQL/read2/SQLite/Day test PASS**, **3 owning Source SQL tests PASS**.
- Each SQL clone preserves329 historical function fingerprints and restores
  CLOSED gates, then removes its owned resources. TEXT HTTP/Node pg/TLS is local
  synthetic bearer/principal evidence, not Hosted Auth/DEV activation.
- Typecheck, UI guard, Backend build, touched ESLint/format and runner syntax/diff
  checks PASS. Full lint result recorded in adjacent evidence. No full-suite rerun
  claim; the accepted Native01 report retains its documented baseline failures.

## G2 Lab minimum handoff and concrete missing seam

Reuse `CP_FLIGHT_NATIVE_01_G2_HANDOFF.md` for the retained original PDF fixture and
existing read contract. Native PDF **expected accepted UUID/revision/date roster is
empty**. Do not inject its prospective Item IDs as accepted canonical facts.

The latest accepted ORIGINAL TEXT joined fixture independently proves these exact
SQL/read2/SQLite54/production Day expectations:

Account `00000000-0000-4000-8000-000000000001`; Trip `10000000-0000-4000-8000-000000000001`.

| Accepted synthetic Item UUID           | Revision | ORIGIN local date |
| -------------------------------------- | -------- | ----------------- |
| `b3ab2057-246e-4be8-86f0-70b004c8016c` | 2        | `2026-12-17`      |
| `cc1b94ad-1d4b-42ed-b4a7-ee4a02a9bfe9` | 2        | `2026-12-20`      |

These are disposable fixture-run identities, not Hosted DEV records. A new runner
allocates a fresh roster; G2 must use that run's complete matching read2 manifest/
pages and epoch/access/Person/roster hashes. The paired mapping and certificate
metadata are retained in this checkpoint's evidence; UUIDs alone cannot create
acceptance or be mixed with another run's certificate.

Reuse existing `collection(context)` → `tripCoreV2Repository.beginRefresh/install`
(or refresh) → `createCoreFlightDayFeedReader` / production `readTripDayFeed`.
Production DayFeed already accepts the v2 projection and owns Flight facts through
its single Composer. Missing values remain null; private Source locators stay
redacted. G2 retains Focus/NOW/scroll and TTR boundaries.

Concrete Lab gap: observed DL1 catalog supplies synthetic v1 projections and has
no approved Core DEV data switch/read2 contribution adapter wired. G2's documented
DL2/Core DEV read adapter must connect the existing v2 Feed boundary under its own
scope. No new Core read DTO is needed and no parallel shell is built here.

| Acceptance category | Result                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| Fixture             | PASS: local custody/SQL/HTTP/TLS/accepted text read2/SQLite/production static Day.  |
| Simulator           | PASS only for standalone PDFKit extraction; shared Lab/installed bridge not tested. |
| Physical Device     | NOT RUN.                                                                            |
| Core DEV Read       | NOT RUN; Hosted access and DEV DATA mode remain off.                                |

## Integration and remaining gates — not executed

1. Owner reviews exact implementation commit/tree and final readiness-doc tip plus
   the35-path manifest. This is preparation, not canonical landing approval.
2. Before any later landing, recheck exact local/actual remote refs, Native/G2 tips,
   prepared hashes, dirty handoff suffix and caller/schema allocation. Any new
   canonical advancement needs a new isolated reconciliation, not a forced merge.
3. Under separate authorization, retain the verified dirty-note suffix and perform
   a normal canonical fast-forward only to the approved descendant. Do not bypass
   dirty-file protection or stage unrelated owner notes. Push remains separate.
4. Native build gate: allow the required pinned CocoaPods metadata/cache provisioning
   or supply a complete offline pod sandbox, then complete an isolated linked-app
   build and actual Expo/Hermes PDF invocation. No framework/pipeline redesign.
5. Agent3 authority gate: owning verified PDF custody/derivative registration and
   Core qualification contract remain pending. Keep REVIEW until separately accepted.
6. Native/DEV runtime gates: designated app build/install, explicit reviewed Capture
   action, real DEV principals/schema/auth/pg/TLS/read2 and G2 shared native/physical
   presentation require their own approvals. No provider/paid LLM/Production or
   automatic qualification/DEV DATA activation is implied.

**STOP: CP-FLIGHT-NATIVE-02 Owner Review.**
