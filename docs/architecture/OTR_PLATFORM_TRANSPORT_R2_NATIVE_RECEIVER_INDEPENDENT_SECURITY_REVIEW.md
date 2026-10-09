# Transport R2-Native Receiver Independent Security Review

Date: 2026-10-09 (Pacific/Auckland). Role: Independent Native / Transport Security Reviewer, separate from the Builder session.

**Verdict: PASS WITH REQUIRED CORRECTIONS.**
**Findings: CRITICAL 0 / IMPORTANT 1 / MINOR 0.**
**Ready for Dormant-Code Final Owner Acceptance: NO.**

| Requested result                               | Independent determination                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native receive bound independently verified    | **NO for the complete admitted identity/gzip contract.** Callback-body retention accounting is independently **YES** at 4,194,304 / 8,192 bytes; F1 permits a gzip representation exceeding the success limit to return a truncated successful catalog. |
| Expo bridge integration independently verified | **LIMITED.** Discovery, podspec, actual Expo conversion/lifecycle source and standalone iOS bridge compilation/linking verified; application integration and actual JS/native execution unverified.                                                     |
| New regressions                                | **YES: new native encoding-admission defect F1.** No failures in the existing 19-suite / 498-test affected matrix.                                                                                                                                      |
| Dormant-code final Owner acceptance ready      | **NO.** Correct F1 and independently recheck before acceptance.                                                                                                                                                                                         |

The receiver bounds retained callback bytes correctly. Its reliance on URLSession's automatic gzip decoding does not prove that every encoded member was decoded or that malformed compression was rejected. This is an integrity/completeness defect, not a reproduced retained-buffer overflow or live Hosted exploit.

## Source, scope and independence

Reviewed the exact requested worktree:
`/Users/xoery/.codex/worktrees/publication-r2-native-resumed/otr-mobile-canonical`.
HEAD, local main and local origin/main independently equal
`b35b369e4e206f7f295e59d8e3baa4a5f289eaf2`. Its parents are accepted canonical
`2a42ec6009bc784a5e4e80a9199719c43fb44640` and SQL Driver closure
`505991baddb396aa4526c2a519b5004825a4d6af`. No remote freshness claim: this reviewer did not contact GitHub, fetch or advance refs.

Read current state/instructions, accepted R1 native requirements, Builder report, ADR/API contract, original Authenticated Transport review and accepted F1 recheck, canonical Transport integration and accepted R2-SQL integration evidence. Installed Expo **57.0.26**, React Native **0.86.3**, Expo Modules Core **57.0.20** were independently checked. The installed implementations, rather than generic documentation or stock fetch's stream interface, govern the bridge conclusions.

Accepted R1 was recovered read-only at
`/private/tmp/otr-platform-transport-r1-20261009/docs/architecture/OTR_PLATFORM_TRANSPORT_ROLLOUT_R1_PREFLIGHT.md`;
SHA-256 independently matches
`60930226bfc295e729180e658f05cda3232bb83aff10814f0212889b427dee2f`.

Exactly **14 Builder paths**, all inspected:

1. `.gitignore`
2. `modules/publication-catalog-receive/expo-module.config.json`
3. `modules/publication-catalog-receive/ios/PublicationCatalogReceive.podspec`
4. `modules/publication-catalog-receive/ios/PublicationCatalogReceiveModule.swift`
5. `modules/publication-catalog-receive/ios/PublicationCatalogReceiver.swift`
6. `modules/publication-catalog-receive/tests/main.swift`
7. `modules/publication-catalog-receive/tests/run.py`
8. `src/native/publicationCatalogReceive.ts`
9. `src/native/publicationCatalogReceive.test.ts`
10. `src/data/api/tripPublicationCatalogTransport.ts`
11. `docs/adr/2026-10-09-publication-native-bounded-receive.md`
12. `docs/API_CONTRACT.md`
13. `docs/CURRENT_IMPLEMENTATION_STATE.md`
14. `docs/architecture/OTR_PLATFORM_TRANSPORT_R2_NATIVE_RECEIVER_BUILDER_REPORT.md`

Their SHA-256 values match the Builder preservation manifest and the reviewer before/after manifest. All **1,296 outside-scope tracked files** equal exact HEAD blobs. Original reports/contracts, parser, Auth/generation, Membership ownership, SQL Driver/server composition, package/lock/config, SQL and SQLite1–53 are preserved. No runtime caller of the native factory exists; only its definition and tests call it. The sole Transport source diff adds the private capability/deadline handoff, without parser or owning-admission changes.

Independent JS probes ran in an exact HEAD archive plus the unchanged 14-file overlay at `/private/tmp/otr-r2-native-review-js`. Native probes compiled the actual production Swift core against independent temporary harnesses. Builder production, tests, contracts, original reports and handoff were not edited. Delivery adds only this report. No commit, push, merge, rebase, Hosted access, device operation, app installation, principal provisioning or runtime activation occurred.

## IMPORTANT — F1: gzip decoding can silently admit incomplete or malformed representations

Locations: `PublicationCatalogReceiver.swift:120–128` admits gzip; `:131–141` counts only delivered decoded chunks; `:186–187` treats nil URLSession error as complete receipt. The Expo module then resolves status/Data, and the facade has no encoded-integrity/completeness information to check.

**Reproduced with the actual Apple URLSession production core on macOS:**

| Wire representation, exact Content-Length                           | Required result                              | Actual result                                                             |
| ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| gzip(valid synthetic catalog) followed by gzip(4,194,305 `x` bytes) | Withhold overflow/malformed complete catalog | 200, exactly the first 44,598-byte catalog returned; second member absent |
| gzip(valid catalog), final 8-byte trailer removed                   | Withhold incomplete encoding                 | 200, identical 44,598-byte catalog returned                               |
| gzip(valid catalog), CRC byte corrupted                             | Withhold malformed encoding                  | 200, identical 44,598-byte catalog returned                               |

The first case has **8,706 wire bytes** and **4,238,903 total decompressed bytes**, exceeding 4,194,304. Python's gzip construction creates a concatenated representation; URLSession delivers only the first member and completes without error. Gzip permits consecutive members under [RFC 1952 §2.2](https://www.rfc-editor.org/rfc/rfc1952#section-2.2). Even a restrictive single-member policy would need to reject the additional member rather than silently discard it.

All three returned bodies independently match the fixture SHA-256
`6a8775cf4c42788c3bf899ef655b165795c3c1e8e93343d81d38877fd20aa293`.
The independent JS probe feeds those exact first-member fixture bytes through the unchanged facade/Transport and confirms admission. This is composition through the test seam, not an actual installed Expo bridge or SQLite-write execution. The strict parser cannot detect compressed bytes/trailers/members that never reach it. It remains unchanged and correctly rejects malformed UTF-8/JSON it actually receives.

Three smaller `{}` encoding probes likewise return the first two bytes for concatenated gzip, missing trailer and bad CRC. Completely invalid gzip returns success with an empty body, which the existing JSON parser rejects; that last case is a native encoding-rejection failure but does not itself admit a catalog.

The final independent run preserves **seven failed expected-rejection assertions** and exits **1**. No rejection assertion was reclassified as a pass. The original early fail-fast concatenation run and subsequent full observations are also retained.

**Required correction:** Do not admit gzip based only on URLSession auto-decoding and nil task error. The smallest prospective correction is an identity-only receive policy that rejects every nonidentity response, including gzip sent despite an identity request; merely changing Accept-Encoding is insufficient. If gzip support is retained, independently establish complete member consumption, malformed/truncated encoding rejection and decoded limits before returning bytes. Any encoding-policy contract adjustment belongs to the separately authorized correction, not this review. Add the valid-catalog reproductions and rerun them unchanged against corrected code.

**Consequence if skipped:** A malformed or oversized compressed representation can be transformed into a valid smaller catalog before the accepted original-text integrity boundary. No retained-body count above the ceiling was observed. No attacker-controlled production response, live exploitation, cross-Account disclosure or current Backend emission of such gzip is claimed. Dormancy limits current exposure but does not close the required receiver boundary.

## Security requirement results

| Requirements                          | Independent evidence/result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 20: base/scope/dormancy            | Exact base/14 paths and no factory startup caller. No global fetch replacement, stock fetch patch, generic networking service, scheduler/worker, Backend/SQL/Hosted injection, Composer/C5/C9/provider or business activation.                                                                                                                                                                                                                                                                                                        |
| 2–3: request/bridge boundary          | Actual Swift receiver and Expo definition inspected. Native builds fixed `https://api-dev.xoery.art/v2/trips/<lowercase canonical UUID>/source-import-catalogs`, GET, version1, Accept JSON. Bearer is nonempty ASCII33–126, max8,192 bytes; CR/LF/space/oversize rejected. No JS URL/method/header/body injection or native token store/retry. Request injection is internal fixture-only.                                                                                                                                           |
| 4: TLS/redirects                      | Default platform trust handling; no supplied credential, SecTrust override or trust bypass. Other challenges cancel. Independent301/302/303/307/308, including changed-host destinations, all deny; target requests0. Independent untrusted certificates under default TLS and TLS1.2 deny with no bytes. Trusted-chain hostname mismatch and positive DEV TLS remain unexecuted.                                                                                                                                                     |
| 5–8: counting/encoding/memory         | Serial delegate checks `data.count <= limit - body.count` before append, body dispatch or JS emission. Exact4,194,304 /8,192 and each+1 controls pass, including ordinary single-member gzip. Large compressed expansion rejects before retaining the oversized callback. **F1 fails complete encoded admission.** Process/decoder/bridge memory is outside the retention proof.                                                                                                                                                      |
| 9: Content-Length                     | Header is never an admission authority. Original missing length exact/overflow tests pass; declared length larger than available data yields NETWORK_FAILURE/no partial body. A smaller HTTP framing length cannot prove trailing bytes belong to the same response; complete JSON/schema checks still apply. F1 uses accurate wire lengths, so framing checks do not repair it.                                                                                                                                                      |
| 10–12: deadline/cancel/slot           | Monotonic native timer, callback deadline checks, task.cancel and invalidateAndCancel run without JS. Expo dispatch checks original absolute expiry and shortens its budget. Independent stalled-before-first-byte deadline/cancel yield zero returned bytes and disconnects; one completion. Active cancellation/release followed by a new owner survives50 stale cancel/release pairs. Completed unacknowledged result remains BUSY; destruction closes admission. No body-response waiting queue.                                  |
| 13: privacy                           | New native/facade code has no credential/body/URL/exception logging or persistence. Ephemeral session disables cookies, credential storage and caches. Terminal state clears its transient references; no secure-memory-erasure claim. Existing bounded API branch normalizes errors without ordinary diagnostic logging. Native outcomes are finite codes or bounded Data/status. OS diagnostics/memory were not audited.                                                                                                            |
| 14–15: Expo integration               | Installed `Conversions.swift:207–239` recursively converts dictionary Data to a new ArrayBuffer/Uint8Array copy. `Promise.swift` schedules conversion on the runtime; one slot holds the pending result while JS is unavailable. `AsyncFunctionDefinition.swift` uses the chosen queue in a scheduled runtime; its scheduler-less inline test path is not device concurrency evidence. `ModuleHolder.deinit` posts moduleDestroy; OnDestroy closes the slot asynchronously. Podspec/discovery/core/bridge compilation findings below. |
| 16–17: capability                     | Private WeakMap keys the exact factory function, checks actual module identity/version/methods and iOS. Original negatives plus independent module-object substitution/property-copy wrapper deny before token work. Android/web/missing/version-changed/lost module fail closed. Arbitrary adapters retain the original Response-shape guard; native exemption is not granted by flags/wrappers. This assumes trusted application JS and the Expo registry; it is not protection against arbitrary code execution.                   |
| 18–19: original parser/context/replay | Fatal original UTF-8 and lexical JSON parser preserved, including duplicate keys/fraction/exponent rejection. Original A→B→A, cancellation, stale result and deadline/install fences pass. One401 remains JS-owned; independent second401 stops after two sends and failed refresh does not replay. Additional invalid UTF-8 scalar probes reject. F1 occurs earlier in native decoding and is not a parser regression.                                                                                                               |

The 64MiB single-member expansion delivered a **16,701,632-byte callback** before BODY_LIMIT, with maximum retained body **0**. The error expansion delivered **16,683,314 bytes**, also retained0. This independently demonstrates why correct accumulation limits do not establish a4MiB total-process or delivery-scratch bound. Data capacity/copies, queued framework callbacks, decompressor allocation, bridge copies and JS parsing remain unmeasured.

## Independent validation and bridge compilation

| Check                         | Executed result                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original native fixtures      | **19/19 PASS**, plus policy and slot assertions, production Swift/Apple URLSession on macOS; no iOS execution implied.                                                                                                                                                                                                                                                                                    |
| Independent native challenges | **20 network cases:13 required outcomes PASS /7 encoding-rejection FAIL**, plus independent active/stale-slot/destruction group PASS. Includes valid catalog F1,64MiB bomb, error bomb, encoding chains/duplicate headers, all redirect statuses, stalled deadline/cancel and two TLS failures. Final process exit1 intentionally preserves F1.                                                           |
| Affected matrix               | **19 suites /498 PASS**, zero skips/failures;14.88s. Same17-suite original Transport matrix plus pg Driver and native facade suites.                                                                                                                                                                                                                                                                      |
| Independent JS probes         | **7 PASS**: exact first-member admission control, second401, failed refresh, module substitution, copied wrapper and two invalid UTF-8 scalar encodings. Admission control reproduces F1's downstream feasibility; it is not an encoding-rejection pass.                                                                                                                                                  |
| Typecheck                     | PASS.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Lint/UI guard                 | PASS;473 baseline occurrences,80 representative files.                                                                                                                                                                                                                                                                                                                                                    |
| Backend build                 | PASS, compile-only local ignored bundle; no server launched.                                                                                                                                                                                                                                                                                                                                              |
| Changed-file formatting       | Prettier PASS for all supported14-scope files; Swift strict format lint PASS; Ruby podspec syntax PASS; git whitespace PASS. Full-repository formatting was not rerun; Builder's28 exact-base violations are not a new global PASS.                                                                                                                                                                       |
| iOS SDK core                  | Production core typecheck PASS: Swift6.4 in Swift5 mode, iPhoneOS27.0 SDK, arm64 iOS16.4 target. macOS executable fixtures compile/run separately.                                                                                                                                                                                                                                                        |
| Expo source/pod/discovery     | Source inspected; `pod ipc spec` evaluates exact16.4/static/Swift5.9/ExpoModulesCore/source-files configuration; Apple autolinking independently discovers exactly one PublicationCatalogReceive module/pod. No prebuild/pod install/config edit.                                                                                                                                                         |
| Full standalone Swift bridge  | **Compilation/typecheck and link PASS** with actual ExpoModulesCore prebuilt framework extracted from installed57.0.20, installed ExpoModulesJSI framework and available cached React framework. Exact two production Swift files link into a temporary standalone library. `vtool` verifies platform IOS/minimum16.4/SDK27.0; `otool` verifies ExpoModulesCore linkage. No app artifact built/installed. |
| Preservation                  | Exact14 hashes before/after;1,296 outside-scope tracked files match base. R1 hash and original reports intact; protected SQL, SQLite1–53, parser/Auth/owning/runtime/config/package bytes unchanged.                                                                                                                                                                                                      |

The first direct bridge attempt lacked ExpoModulesJSI/React framework search paths and failed. Supplying existing dependencies made the real bridge typecheck/link pass without stubs or production/config changes. Link output includes one Clang sysroot-label warning; the inspected Mach-O explicitly targets iOS16.4/SDK27.0. This standalone link does not validate CocoaPods application integration, registration into an app, actual Data→Uint8Array promise delivery, engine behavior or module destruction on a device. **Expo integration remains LIMITED.**

Reproducibility/evidence:

- Original runner: `python3 modules/publication-catalog-receive/tests/run.py`; independent runner: `python3 /private/tmp/otr-r2-native-independent-probes/run.py` (expected exit1 until F1 correction).
- Independent runner SHA-256: `7f23d760fbc23db85a19a9f59501fd78cf7757cf269f0edd3c37e64fae468df2`; harness `main.swift`: `5256de33f0d113b56489ecd1719c6628c97eea95049b7c61bd529f98575f9ea1`.
- Independent JS source at `/private/tmp/otr-r2-native-review-js/src/native/publicationCatalogReceive.independent.test.ts`, SHA-256 `ce6b4856389a13137a42ecc0ab875ae46a6c4b5e9bc3607a227ddb196645e85d`.
- Logs `/private/tmp/otr-r2-native-review-fixtures.log`, `otr-r2-native-review-regressions.log`, `otr-r2-native-review-independent-final.log`, `otr-r2-native-review-independent-js.log`, `otr-r2-native-review-typecheck.log`, `otr-r2-native-review-lint.log`, `otr-r2-native-review-backend.log`, `otr-r2-native-review-ios-core.log`, `otr-r2-native-review-full-bridge-attempt2.log`, `otr-r2-native-review-full-bridge-link.log`.
- Source manifest `/private/tmp/otr-r2-native-review-before.json`; discovery `/private/tmp/otr-r2-native-review-autolinking.json`; pod evaluation `/private/tmp/otr-r2-native-review-podspec.json`. Temporary evidence is local, not a committed test delivery.

Installed source corroborates [Expo queue/lifecycle APIs](https://docs.expo.dev/modules/module-api/) and [module discovery configuration](https://docs.expo.dev/modules/module-config/). Neither documentation nor standalone linking is device acceptance.

## Remaining gates

1. **Dormant native code: NOT READY.** Separately authorize F1 correction, preserve this original report and independently rerun encoding negatives and the affected matrix. No correction was made here.
2. **Device/native artifact: CLOSED.** Exact-source authorized DEV Test artifact, real module/version/bridge, paused-JS/native cancellation, TLS/decompression/encoding cases, memory/callback measurements, lifecycle/foreground transitions, persistence/restart/offline and A→B→A acceptance remain required. No Simulator/device was operated.
3. **Hosted: CLOSED.** Actual DEV endpoint/deployed Auth/catalog/redirect/encoding behavior, complete roster and bounded live read-to-CLOSED-reader/SQLite53 acceptance remain unverified here. No DEV or Production request occurred.
4. **Principal/runtime: CLOSED.** SQL Driver's accepted dormant integration is preserved, not reprovisioned or physically retested. Dedicated read-only LOGIN/ACL/secret/expiry/rotation and direct-primary endpoint attestation remain separate; `server.ts` has no injection. No Hosted/SQL/Composer/default consumer, scheduler/worker, C5/C9/provider or business activation.

Not checked: installed-app bridge execution, iOS/device receive behavior, total memory, positive trusted TLS/hostname mismatch, Hosted/principal or full-repository tests. F1 requires correction before dormant-code Owner acceptance.

**STOP — R2-NATIVE INDEPENDENT SECURITY REVIEW COMPLETE.**

## F1 TARGETED RECHECK — PASS — 2026-10-09

Performed by the original R2-Native Independent Security Reviewer in the original review session under the Owner's targeted authorization. **The entire original review above is preserved byte-for-byte.** This appendix supersedes its unresolved F1, regression and dormant-code readiness determinations; it does not retrospectively change the original failed results.

| Requested result                                                    | Targeted independent determination                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 FIX VERIFIED                                                     | **YES** — identity-only request and admission, with raw gzip exclusion.                                                                                             |
| Original seven scenarios closed                                     | **YES**, separately labeled equivalent rejection probes7/7.                                                                                                         |
| Complete-representation admission verified on tested native runtime | **YES**, for the corrected identity-only contract on tested Apple URLSession/macOS, including final original-byte UTF-8/JSON admission. No iOS device verification. |
| Remaining CRITICAL / IMPORTANT / required MINOR                     | **0 /0 /0**.                                                                                                                                                        |
| New regressions                                                     | **NO** in498 affected tests and the corrected-equivalent/additional probes. Historical and obsolete replay failures are preserved below.                            |
| Ready for Dormant-Code Final Owner Acceptance                       | **YES**. Owner acceptance is still separate; no application/runtime activation is granted.                                                                          |

### Exact correction and preservation

HEAD remains exactly `b35b369e4e206f7f295e59d8e3baa4a5f289eaf2`. No Git refs or history were changed and no remote freshness claim is made.

Independently compared the preserved pre-correction snapshot and original14-path SHA-256 manifest with current bytes. Exactly **seven F1 paths** differ:

- `modules/publication-catalog-receive/ios/PublicationCatalogReceiver.swift`
- `modules/publication-catalog-receive/tests/main.swift`
- `modules/publication-catalog-receive/tests/run.py`
- `docs/adr/2026-10-09-publication-native-bounded-receive.md`
- `docs/API_CONTRACT.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/architecture/OTR_PLATFORM_TRANSPORT_R2_NATIVE_RECEIVER_BUILDER_REPORT.md`

Production core changes are limited to `Accept-Encoding: identity`, exact normalized identity response-header admission, and rejection of an initial0x1f before append. The last rule rejects gzip's first byte without waiting for0x8b in the same callback. No decompressor, dependency or framework was added.

Byte-count arithmetic/limits, fixed origin/route/bearer/version, TLS/default trust/redirect handling, ephemeral configuration, native timer/cancel/finish, single slot, Expo bridge/podspec/module config, JS facade/private capability gate, parser/Auth/Account/Membership/SQL/composition are unchanged. Tests add encoding observations/negatives and change obsolete gzip success expectations to rejection; identity limit tests remain. Builder documentation reflects the separately Owner-selected policy.

Original review SHA-256 is `fc3a8f89d5fcee2a2d16afcec6f857f430be14526859c16ae29c4b4c0a75d304`. The Builder report retains its original pre-F1 bytes as an exact prefix. Before/after hashes preserve all Builder delivery files; **1,296 outside-scope tracked files** independently match exact HEAD blobs. This reviewer modifies only this report by appending the recheck. Original native and JS reviewer harnesses remain unchanged.

### Original reproduction and unchanged replay — failures preserved

1. **Preserved pre-correction core:** independently verified its SHA-256 `0d6fe0b3a99be4e48a95c233f5ba8e60194fa3cb8061f99bdb0cc8aa49cb2f4a`. The unchanged original independent runner/harness reproduced exactly **seven required-rejection failures**, exiting1. A temporary launcher redirects only the compiler's receiver source argument to the verified archived original; fixture bytes, probes, assertions and harness are unchanged. Production worktree bytes were never replaced.
2. **Corrected core, exact unchanged original runner:** exits1 on the first Catalog probe's now-obsolete assertion requiring the formerly returned Catalog hash. Actual outcome is `UNSUPPORTED_ENCODING`, maximum delivered/retained0, no body. This is **not a claimed PASS or a completed20-case replay**. The old runner also contains obsolete BODY_LIMIT expectations for compressed bombs and unconditional historical failure recording; it remains unedited.
3. **Separately labeled corrected equivalents:** retain original fixture construction and original Swift harness, change the three Catalog acceptance-recording oracles to require rejection, and require `UNSUPPORTED_ENCODING` rather than old BODY_LIMIT for compression cases. All **20 network cases plus active/stale-slot controls PASS**, exit0. All seven original scenarios return `UNSUPPORTED_ENCODING`, no bytes, maximum retained/delivered0. The historical harness still requests gzip/identity in its injected fixture request; rejection remains response-based. Actual production identity preference is separately asserted in the43-fixture suite and additional identity-request probes.

The seven closures cover valid Catalog plus oversized second member, valid Catalog minus8-byte gzip trailer, valid Catalog with corrupted CRC, small JSON plus oversized second member, small JSON minus trailer, small JSON with bad CRC and invalid gzip. Invalid gzip no longer becomes a native successful empty response. Ordinary gzip sent despite identity preference is also rejected before body admission.

Retained original runner/harness hashes remain `7f23d760fbc23db85a19a9f59501fd78cf7757cf269f0edd3c37e64fae468df2` and `5256de33f0d113b56489ecd1719c6628c97eea95049b7c61bd529f98575f9ea1`. Corrected-equivalent runner hash is `c4f7256c8b56a8c232520f524d43d37382384b05dca7ec4016bc959e9fbac5d3`.

### Encoding evidence and complete original-byte admission

Independently reran **43 native body fixtures and nine header observations**. Gzip, br, deflate, zstd, unknown, empty, chained, duplicate identity, mixed-case conflicting and conflicting duplicate headers fail closed. Header observations inspect both `value(forHTTPHeaderField:)` and `allHeaderFields` while allowing decoding in a test-only delegate. On this runtime, gzip/br/deflate decode but retain their original encoding; duplicates remain combined strings rather than a whitelisted single identity. The production response gate rejects those values before body retention/emission.

Added **13 independent network observation/production-outcome pairs**, with body hashes, identity requests and varied encoding headers/media types. These challenge full Catalog bytes rather than just `{}`:

- Genuine headerless Catalog succeeds with all44,598 original bytes and SHA-256 `6a8775cf4c42788c3bf899ef655b165795c3c1e8e93343d81d38877fd20aa293`. Case/whitespace-normalized single identity also succeeds unchanged.
- Headerless gzip remains4,608 original compressed bytes, including a `.gz` URL and `application/gzip` media type. No automatic decoding without encoding evidence was observed. Production rejects before append, retained0.
- Gzip deliberately labeled identity remains raw gzip and rejects before append. Explicit gzip and x-gzip automatically decode in the observation delegate but retain those original header values; production rejects them before receiving body callbacks.
- Empty-plus-gzip duplicate headers in both orders retain combined evidence and reject. Together with the original nine observations, no challenged header combination silently becomes acceptable identity while decoded bytes are substituted.
- Deflate/Brotli deliberately labeled identity, a synthetic zstd-signature negative, and whitespace-prefixed headerless gzip remain original raw bytes. The native byte receiver can return these bounded opaque bytes; it does not parse JSON. **Four additional independent JS assertions reject those exact observed bytes as `INVALID_RESPONSE` at fatal UTF-8/original-text Catalog admission.** This is not a claim that the gzip first-byte rule recognizes every possible encoding.

The identity policy is therefore established on the tested runtime through original-header evidence plus original-byte/fatal-parser admission, not merely the request preference. No observed automatic transformation lost its original encoding evidence. This evidence is bounded to the tested cases/runtime; the public URLSession interface cannot reconstruct an encoding header if an OS actually removes or rewrites it before invoking the delegate. **Any such observation on iOS blocks device/runtime acceptance; the retained byte counter or gzip signature check cannot certify a silently transformed representation.**

Network chunked-gzip and one-byte-prefix negatives pass. Because URLSession may coalesce network writes, a separate deterministic delegate test drives response admission, a callback containing only0x1f, a late0x8b callback and a late successful completion. It yields one `UNSUPPORTED_ENCODING`, retained0, maximum delivered1; cancel/late completion do not revive it. This is explicitly a controlled callback test, not proof of iOS network callback segmentation.

### Bounds, ownership and regression preservation

Identity success4,194,304 and error8,192 are accepted; each+1 yields BODY_LIMIT/no returned body. Missing Content-Length exact/overflow and larger lying length pass their original outcomes. Content-Length is never an admission bound; incomplete framed bodies withhold. A smaller framing length cannot attribute extra bytes to that response, and complete original-text JSON/schema admission remains required. Compressed bombs now fail at encoding-header admission, including the64MiB success and error probes; original scratch-memory observations remain historical, not a newly certified total-memory ceiling.

Independent301/302/303/307/308 redirects yield no destination requests. Self-signed TLS under default negotiation and TLS1.2 withholds bytes; no custom trust handling changed. Native stalled deadline/cancel and server disconnects pass. Active cancel/release, new ownership,50 stale cancel/release pairs, unacknowledged BUSY result and destruction denial pass. Terminal guards and duplicate/late callback denial remain intact.

Unchanged498-test matrix covers exact trusted facade/forged flags/copied wrappers, unavailable Android/web/missing/version-changed modules before credential work, Account A→B→A, original fatal UTF-8/strict JSON, one401 refresh, whole-request deadline/cancellation, stale result and owning-install fences. Independent JS probes also verify module-object substitution, copied facade properties, second401 without third send, failed refresh without replay and invalid UTF-8 scalars. The existing first-member-byte admission control still passes because raw valid Catalog bytes remain valid; it is not relabeled as an encoded-rejection pass.

### Executed validation

| Check                                   | Independent result                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original pre-correction reproduction    | Seven failures reproduced, exit1; hashes and historical assertions preserved.                                                                                                                  |
| Unchanged original runner on correction | Obsolete acceptance-hash assertion fails after correct rejection; exit1 retained, not counted as PASS.                                                                                         |
| Corrected equivalents                   | 20 network cases and active/stale-slot group PASS.                                                                                                                                             |
| Corrected Builder native suite          | 43 body fixtures +9 header observations +policy/slot controls PASS.                                                                                                                            |
| Additional reviewer native probes       | 13 observation/outcome pairs and deterministic split/late-callback test PASS.                                                                                                                  |
| Additional JS                           | 11 PASS: original7 controls plus4 raw encoded-byte final-admission negatives.                                                                                                                  |
| Affected regressions                    | 19 suites /498 PASS, zero failures/skips,17.68s.                                                                                                                                               |
| Typecheck / lint / UI guard             | PASS;473 baseline occurrences,80 representative UI files.                                                                                                                                      |
| Backend build                           | PASS; compile-only ignored local bundle, no server launch.                                                                                                                                     |
| Core / actual Expo bridge               | iPhoneOS27 SDK, arm64 iOS16.4, Swift6.4 in Swift5 mode: core typecheck, real bridge typecheck and standalone module compile/link PASS. Existing frameworks only; no app build.                 |
| Autolinking / podspec                   | Exactly one PublicationCatalogReceive pod/module; evaluated static framework, iOS16.4, Swift5.9, ExpoModulesCore dependency/source glob unchanged.                                             |
| Formatting / whitespace / preservation  | Changed supported files Prettier, strict Swift format lint and git whitespace PASS. Original report prefix, Builder hashes and outside-scope base bytes verified. Global formatting not rerun. |

The standalone library's Mach-O records IOS/minimum16.4/SDK27.0 and links ExpoModulesCore. The existing Clang sysroot-label warning remains; it does not establish app/runtime failure or device success. Actual installed-app ABI/registration, Data→Uint8Array delivery and lifecycle execution remain **LIMITED**, despite compile/link evidence.

Evidence directory: `/private/tmp/otr-r2-native-f1-recheck/`. Logs: `original-on-preserved.log`, `original-on-corrected.log`, `corrected-equivalent.log`, `fixtures43-header9.log`, `extra.log`, `independent-js.log`, `regressions.log`, `typecheck.log`, `lint.log`, `backend.log`, `ios-core.log`, `bridge-typecheck.log`, `bridge-link.log`. Source manifest: `before.json`; original review copy: `original-review.md`; discovery/podspec: `autolinking.json`, `podspec.json`.

Independent additional native sources are under `extra/`; runner SHA-256 `d546ce4c6b3873c053499610a59a9928d1d23c48f3504e53538be9ba23dc2f06`. New JS source is `/private/tmp/otr-r2-native-review-js/src/native/publicationCatalogReceive.f1recheck.test.ts`, SHA-256 `b2dced1a6ea19f8554bbf1ed09a269411253eef76581a55e64ec8237eabab5b8`. Original independent JS source remains unchanged. These are local reviewer evidence, not production/test delivery edits.

### Remaining gates and readiness

- **Dormant-code Owner acceptance: READY.** F1 is closed on the tested native runtime; final Owner acceptance remains separate.
- **iOS app/device: CLOSED.** Exact authorized DEV Test artifact/installed bridge, actual iOS original-encoding preservation and identity receipt, paused-JS cancellation, lifecycle, TLS/decoder/callback/memory behavior, persistence/restart/offline/A→B→A acceptance remain required. No app build/install, Simulator or device operation occurred.
- **Hosted/Principal: CLOSED.** No DEV/Production request, deployed endpoint/roster/encoding verification, SQL LOGIN/ACL/credential/rotation provisioning, direct-primary attestation or live read-to-SQLite53 acceptance. Accepted dormant Driver remains preserved, not physically retested here.
- **Runtime/business gates: CLOSED.** No global fetch replacement, generic networking layer, default consumer, Composer/C5/C9/provider/scheduler/worker or business activation. No commit, push, merge or rebase.

Not checked: iOS installed-app/device execution, Hosted/Principal behavior, total process memory or full-repository tests. Dormant-code PASS does not authorize those gates.

**STOP — R2-NATIVE F1 TARGETED INDEPENDENT SECURITY RECHECK COMPLETE.**
