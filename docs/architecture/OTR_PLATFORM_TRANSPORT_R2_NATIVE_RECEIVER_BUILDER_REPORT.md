# Transport rollout R2 native receiver Builder report

Date: 2026-10-09 (Pacific/Auckland).

**Implemented dormant iOS bounded receipt. Ready for Independent Review: YES.**
This is code-review readiness, not app/artifact/device or live-read acceptance.

## Accepted source and preservation

Accepted R1 was read directly from:
`/private/tmp/otr-platform-transport-r1-20261009/docs/architecture/OTR_PLATFORM_TRANSPORT_ROLLOUT_R1_PREFLIGHT.md`.
SHA-256: `60930226bfc295e729180e658f05cda3232bb83aff10814f0212889b427dee2f`.
The accepted capped-completion option was implemented; R1 was not redesigned.

Fresh managed isolated worktree:
`/Users/xoery/.codex/worktrees/publication-r2-native-resumed/otr-mobile-canonical`.
HEAD, local `main`, local `origin/main` and fresh read-only remote
`refs/heads/main` matched `b35b369e4e206f7f295e59d8e3baa4a5f289eaf2` at source recovery.
The initial sandbox DNS failure was resolved by an approved read-only
`git ls-remote`; no fetch or ref advancement occurred.

Previous blocked evidence remains at
`/Users/xoery/.codex/worktrees/publication-r2-native/otr-mobile-canonical/docs/architecture/OTR_PLATFORM_TRANSPORT_R2_NATIVE_RECEIVER_BUILDER_REPORT.md`,
SHA-256 `9b2fc0ae60ab42c9d4a1d86cbf6781f60acf90302cc00fc38994168027cf635f`.
The original dirty checkout and other worktrees received no source writes.
All tracked paths outside the exact scope below equal the accepted base. Existing
current-state sections are retained beneath one new checkpoint entry.

## Exact changed files

1. `.gitignore` — only new module Swift/podspec source exceptions; generated app native directories remain ignored.
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

No dependency/package/lockfile, Backend endpoint, SQL, migration, Auth, parser,
Membership/Composer owner, queue, scheduler, app config, UI or production caller
changed. Existing installed dependencies were reused through worktree-local ignored
symlinks; a clean dependency installation is not newly certified.

## Implementation and trust boundary

The Expo boundary exposes version1, fixed receive/cancel/release operations only.
Its request builder constructs exactly HTTPS DEV
`https://api-dev.xoery.art/v2/trips/<canonical-uuid>/source-import-catalogs`, GET,
version header1, bounded ASCII bearer, Accept JSON and gzip/identity. No JS-supplied
URL, method, arbitrary headers, body, credential store or native retry exists.
Internal URLRequest injection is used only by the standalone local Swift fixtures;
it is not exposed through Expo. Bearer acquisition/one401 refresh stays in the
unchanged JS Account-scoped authenticated client.

URLSession uses ephemeral state with no URL cache, cookie store, credential store
or cookie handling. Every redirect is refused with `completionHandler(nil)` before
following. Server trust uses platform default handling; other authentication
challenges are canceled. No trust exception, pinned test trust, TLS downgrade or
production HTTP path was added. Native outcomes contain finite codes or status plus
complete Data only; no URLs, headers, exception messages, private bodies or tokens
are logged or persisted. Transient task/session/body/completion references are
cleared on terminal outcome; this is not a cryptographic memory-erasure claim.

A serial URLSession delegate counts `Data.count` on delivered decoded bytes before
append, without dispatching body chunks to another queue or emitting them to JS.
Only status200 receives the4,194,304-byte allowance; error statuses receive8,192.
Other2xx/3xx and unsupported encoding headers withhold. The overflow check is
`data.count <= limit - body.count`; failure cancels the task/session and discards
all accumulated bytes. Content-Length is not used for admission. Identity and gzip
are the only admitted encodings; a platform decoder failure also withholds.

A native monotonic timer and per-callback deadline checks terminate the task while
JS is paused. The original absolute expiry is also checked at native dispatch,
including time waiting on Expo's queue; its remaining budget can only shorten the
30-second ceiling. Cancel, receipt, completion and deadline accounting are serialized.
Terminal/late callbacks cannot resolve again. The single native request/result slot
remains held until JS release, including after successful native completion; busy
receives cannot enqueue another private body. Wrong/stale release or cancellation
cannot affect the next owner; module destruction closes the slot permanently.

The dormant explicit JS factory verifies the actual iOS module/version/methods and
privately registers its function in a WeakMap. Only that exact function can bypass
the global RN Response streaming-shape guard. Arbitrary flags/copied wrappers do
not grant capability; unavailable registered adapters fail before token work.
The facade accepts only the fixed origin/GET/version contract and constructs a
minimal single bounded-byte reader after completion, with no network-backed
json/text/arrayBuffer fallback, clone or tee. Original UTF-8 fatal decoding and
strict original-text parsing remain unchanged. Original Account/Trip/generation,
whole-request deadline and cancellation fences remain at the existing handoff and
Membership installation boundaries. No factory is installed by app startup.

## Executed evidence

Installed source inspected: Expo **57.0.26**, RN **0.86.3**, Expo Modules Core
**57.0.20**, matching R1's versions. Stock Expo's native sink and JS push streams
remain unsuitable for this stronger receipt contract and were not modified.
Expo Modules Core source converts returned Data into Uint8Array; actual app bridge
ABI/linking/runtime acceptance remains unperformed.

| Check                                          | Actual result                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native policy and single-slot assertion groups | PASS: fixed request/UUID/token bounds; completed-unacknowledged BUSY; wrong release; stale cancel/release; new owner after acknowledgement; destruction denies new work.                                                                                                           |
| Native loopback fixtures                       | **19/19 PASS**, compiled Swift executable using the production receiver core and Apple URLSession on macOS.                                                                                                                                                                        |
| Exact success/error limits                     | 4,194,304 and8,192 complete bytes accepted; each limit+1 rejected with BODY_LIMIT and zero returned body.                                                                                                                                                                          |
| Gzip expansion                                 | Exact success/error and their limit+1 pass/fail respectively. The4MiB and4MiB+1 fixtures each have only4,098 encoded wire bytes; the counter observes decoded lengths.                                                                                                             |
| Missing/lying length                           | Missing length exact/overflow accepted/rejected; declared length larger than actual body returns NETWORK_FAILURE without partial bytes. A smaller declared HTTP framing length cannot prove extra bytes belong to that response; strict complete JSON admission remains mandatory. |
| Redirects and TLS                              | Same-host and cross-host redirect destinations received zero requests. Self-signed local HTTPS fails TLS_FAILURE with zero bytes. Positive HTTPS DEV and separate trusted-chain hostname mismatch are not newly exercised.                                                         |
| Slow/stalled/cancel/late                       | Native80ms deadline and explicit cancel stop slow bodies while the test main thread sleeps; server disconnects observed. Every fixture resolves once; explicit late data/cancel callbacks do not revive it. Slot tests simulate unacknowledged JS consumption.                     |
| UTF-8                                          | Exact4MiB multibyte body across chunk boundaries accepted; overflow rejected. JS fatal decoder rejects incomplete multibyte bytes; strict duplicate-key/number-token regressions pass.                                                                                             |
| JS affected matrix                             | **19 suites /498 tests PASS**, zero failures/skips,14.55s: original17-suite Backend/API/Auth/Transport/Membership/SQLite53 matrix plus dormant pg driver and new facade tests.                                                                                                     |
| Unsupported native capability                  | Android/web, absent module, incompatible version, lost module and copied/flagged callbacks reject before token/native send; RN buffered Response shape works only for the registered module.                                                                                       |
| Account/cancel/deadline                        | A→B→A native-result rejection; original parsing/owning regressions; one401 JS replay; remaining token-wait budget; clock-advanced stalled JS; late response and post-completion cancellation denial PASS.                                                                          |
| Typecheck, lint/UI guard, Backend build        | PASS. UI guard:473 baseline occurrences,80 representative files. Backend bundle produced locally; no server launch.                                                                                                                                                                |
| Native compilation                             | Swift6.4 / Swift5 mode: production core and slot compiled/ran on arm64 macOS; final core typecheck against iPhoneOS27.0 SDK / arm64 iOS16.4 target PASS. Expo bridge syntax parse PASS; full Expo bridge compilation/linking not performed.                                        |
| Module discovery                               | Apple autolinking resolves exactly one PublicationCatalogReceive pod/module; podspec Ruby syntax PASS. No prebuild or pod installation/app build.                                                                                                                                  |
| Formatting                                     | Changed supported files Prettier PASS; Swift format/lint PASS. Full `npm run format` retains28 violations, all byte-identical to base; no global formatting PASS claim.                                                                                                            |
| Preservation                                   | Exact14-path scope, Git whitespace and unchanged outside-scope tracked bytes PASS; R1 and blocked-report hashes retained.                                                                                                                                                          |

Reproduce native evidence with:
`python3 modules/publication-catalog-receive/tests/run.py`.
The runner uses disposable loopback HTTP/self-signed TLS fixtures and synthetic
credentials only, deletes its private temporary certificate/build artifacts, and
uses no Hosted, app, Simulator or device API. Initial runner naming/decoder-outcome
assertions were corrected before the final PASS run; no production network fallback
was introduced to accommodate them.

Local evidence: `/private/tmp/otr-r2-native-fixtures.log`,
`otr-r2-native-regressions.log`, `otr-r2-native-typecheck.log`,
`otr-r2-native-lint.log`, `otr-r2-native-format.log`,
`otr-r2-native-autolinking.json` and `otr-r2-native-preservation.json`.

## Platform and remaining acceptance limits

**iOS:** dormant source, SDK core typecheck and autolinking verified; native app
integration is not certified. **Android/web/missing module:** unavailable, no fallback.
Expo Go lacks this local native module and cannot activate the receiver.

The retained-content bound is **not a total process-memory bound**. Final gzip
limit+1 fixture delivered one4,194,305-byte URLSession callback before rejection;
maximum application-accumulated body was zero for that fixture. Exact success
retained4,194,304; error maximum retained8,192. OS decompression/delivery scratch,
Data capacity/copies, Expo conversion and JS parser allocations need separate
measurements; larger compressed bombs/OS scratch limits are not certified. Nothing
in this report claims that native/JS process memory never exceeds4MiB.

Full Expo bridge ABI/linking, installed module/version, real paused-JS behavior,
real iOS TLS/decompression/callback sizes, memory measurements, lifecycle/foreground
transitions and device/native artifact acceptance remain separately gated. macOS
URLSession execution is useful native-core evidence, not iOS device acceptance.
The single busy slot intentionally withholds another request until acknowledgement;
it introduces no waiting queue or automatic retry.

No Hosted/device operation, SQL principal provisioning, Composer runtime, C5/C9,
provider activation, business write, commit, push or merge occurred. Accepted SQL
physical retirement evidence was not rerun; its source remains unchanged.

**Ready for Independent Review: YES — dormant receiver, with the limits above.**
**STOP — R2-NATIVE BUILDER / INDEPENDENT REVIEW REQUIRED.**

## F1 encoding completeness correction — 2026-10-09

This append supersedes the earlier gzip admission, native compile status and
readiness statements above. Owner selected identity-only receipt; no gzip decoder
or dependency was introduced. Worktree HEAD remains
`b35b369e4e206f7f295e59d8e3baa4a5f289eaf2`.

Accepted Independent Security Review is preserved byte-for-byte at
`docs/architecture/OTR_PLATFORM_TRANSPORT_R2_NATIVE_RECEIVER_INDEPENDENT_SECURITY_REVIEW.md`,
SHA-256 `fc3a8f89d5fcee2a2d16afcec6f857f430be14526859c16ae29c4b4c0a75d304`.
The accepted R1 source/hash and previous blocked Builder report remain unchanged.
The Builder report's entire pre-F1 byte sequence is retained as this file's prefix.

### Reproduction before correction

The original independent harness ran unchanged before source edits and exited1
with exactly these seven required rejection failures:

- Catalog concatenated with a gzip member expanding to4,194,305 extra bytes.
- Catalog gzip with its8-byte trailer removed.
- Catalog gzip with corrupted CRC.
- Small JSON gzip concatenated with an oversized second member.
- Small JSON gzip with truncated trailer.
- Small JSON gzip with corrupted CRC.
- Invalid gzip, reported as a complete empty body.

The first three returned the original44,598-byte Catalog with SHA-256
`6a8775cf4c42788c3bf899ef655b165795c3c1e8e93343d81d38877fd20aa293`.
Before-correction evidence: `/private/tmp/otr-r2-native-f1-before.log`.
An initial sandboxed attempt could not bind loopback; the authorized local-only
rerun produced the seven failures. Original independent `run.py` and `main.swift`
retain SHA-256 `7f23d760fbc23db85a19a9f59501fd78cf7757cf269f0edd3c37e64fae468df2`
and `5256de33f0d113b56489ecd1719c6628c97eea95049b7c61bd529f98575f9ea1`.

### Correction and exact changed files

F1 changes only these seven paths relative to the preserved pre-F1 Builder state:

- `modules/publication-catalog-receive/ios/PublicationCatalogReceiver.swift`
- `modules/publication-catalog-receive/tests/main.swift`
- `modules/publication-catalog-receive/tests/run.py`
- `docs/adr/2026-10-09-publication-native-bounded-receive.md`
- `docs/API_CONTRACT.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/architecture/OTR_PLATFORM_TRANSPORT_R2_NATIVE_RECEIVER_BUILDER_REPORT.md`

Production requests now send `Accept-Encoding: identity`. A response with a
present Content-Encoding value is admitted only when its trimmed, case-insensitive
value is exactly `identity`. Gzip, br, deflate, zstd, unknown, empty, chained and
combined duplicate values are canceled before body admission. Absence of the
header remains eligible; it is not inferred from the request preference alone.
Gzip's initial0x1f byte cannot start valid Catalog JSON and is denied before append,
even if the0x8b byte would arrive in a later callback. This is a signature exclusion,
not a decoder. One-byte, raw gzip and chunked gzip negatives return no bytes and
retain zero application body bytes. All other bytes still pass the existing actual
native byte-count check before append; complete original bytes alone reach the
unchanged fatal UTF-8/strict original-text parser.

No JS, Expo bridge, module registration, podspec, package, Backend, Driver,
Membership, Auth, Composer, SQLite, redirect/TLS, deadline/cancellation or slot
implementation changed. No default caller or global fetch replacement was added.

### URLSession evidence and admission limits

Nine repeatable native observation assertions allow decoding in a test-only
URLSession delegate and inspect both `value(forHTTPHeaderField:)` and
`allHeaderFields`, alongside delivered byte count/prefix. These observations use
identity requests and the JSON response media type. On the tested macOS runtime:

- Valid gzip, Brotli and deflate decode to the two original JSON bytes while their
  original Content-Encoding values remain exposed in both header views.
- Gzip/identity duplicates combine as `gzip, identity`; the opposite order combines
  as `identity, gzip`. Same-identity duplicates and mixed-case conflicting header
  names also combine. None is normalized to an acceptable single identity value.
- Genuine headerless JSON is delivered unchanged. Headerless gzip is delivered as
  the original22 wire bytes beginning0x1f8b; no silent decompression is observed.

Production rejects those encoded headers at response admission, with zero body
callback bytes retained or emitted. The original seven negatives and64MiB/error
expansion probes now all withhold with `UNSUPPORTED_ENCODING` and zero retained
body bytes. The preference header alone is never the admission proof. No observed
case silently decoded while losing the encoding evidence; the accepted API was
not blocked on this tested runtime. This evidence does not certify all iOS OS
versions. Any iOS result that decodes while removing/rewriting the original
encoding evidence must fail the acceptance gate and block activation; the byte
counter cannot repair incomplete decoded representations.

For identity, exact4,194,304-byte success and8,192-byte error bodies are returned;
each limit+1 cancels with `BODY_LIMIT` and emits no body. Retained content never
exceeds its cap. Missing Content-Length exact/overflow and larger lying length
remain covered. HTTP framing and strict complete JSON checks remain necessary;
Content-Length is not an admission bound. There is no certified total process
memory ceiling or claim about OS decoder/bridge scratch allocations.

### Actual validation

- Native core: **43 body fixtures, nine encoding-header observations, fixed request
  policy and held-slot controls PASS** using the production core on arm64 macOS.
  Includes all seven original negatives, ordinary gzip despite identity, exact and
  oversized compressed success/error responses, br/deflate/zstd/unknown,
  empty/chained/duplicate/conflicting headers, absent-header identity/gzip,
  single-byte and chunked gzip prefixes, exact/overflow success/error, missing/lying
  length, multibyte UTF-8, redirect denial, self-signed TLS, timeout, cancellation,
  stalled test main thread and late-callback denial. Redirect forwarding count0.
- Independent fixture replay: **20 cases plus active-slot/50 stale-cancel-release
  controls PASS**. A separate copy of the harness changes only the three Catalog
  oracles from recording known acceptance failures to requiring rejection, and
  allows `UNSUPPORTED_ENCODING` for the old BODY_LIMIT compression probes. Every
  original required rejection is retained; the original harness is unchanged.
- JS/Backend Transport/Membership/Driver/Auth/parser regressions: **19 suites /
  498 tests PASS**, zero failures/skips,18.56s. Existing A→B→A, fatal UTF-8,
  strict JSON and zero-token/native-send unsupported-platform controls pass.
- Final production Swift core and real Expo bridge: **typecheck, compile and link
  PASS**, Swift6.4 in Swift5 mode, iPhoneOS27 SDK, arm64 iOS16.4 target. Uses the
  already-installed ExpoModulesCore57.0.20/ExpoModulesJSI and cached React framework;
  builds only a standalone local module library, no app or device artifact.
  `vtool` reports IOS/min16.4/sdk27; `otool` confirms ExpoModulesCore linkage.
  The link driver emits the existing incompatible-sysroot label warning; the
  resulting library's recorded platform is IOS. No runtime ABI execution is claimed.
- Apple autolinking: exactly one PublicationCatalogReceive pod and
  PublicationCatalogReceiveModule resolved. Podspec Ruby syntax PASS.
- Typecheck, lint/UI guard and Backend build PASS. UI guard retains473 baseline
  occurrences and checks80 representative files. No Backend server was launched.
- Changed-file Prettier, strict Swift format lint, whitespace and preservation
  checks PASS. Full-repository formatting was not rerun; the earlier28 unrelated
  base violations remain outside scope. No new dependency or protected-contract
  change occurred.

Final evidence files are `/private/tmp/otr-r2-native-f1-fixtures.log`,
`otr-r2-native-f1-header-probe.log`, `otr-r2-native-f1-independent-replay.log`,
`otr-r2-native-f1-regressions.log`, `otr-r2-native-f1-bridge.log`,
`otr-r2-native-f1-typecheck.log`, `otr-r2-native-f1-lint.log`,
`otr-r2-native-f1-backend-build.log`, `otr-r2-native-f1-autolinking.json`,
`otr-r2-native-f1-format.log` and `otr-r2-native-f1-preservation.json` under
`/private/tmp/`. Reproduce the committed-scope native fixture definitions with
`python3 modules/publication-catalog-receive/tests/run.py`.
A slot fixture initially omitted the identity request header; it was corrected to
match production. A network split-prefix assertion exposed URLSession coalescing;
the final smaller first-byte gate is additionally exercised by a one-byte response,
so its denial cannot depend on both signature bytes sharing a callback.

### Platform status and stop

**iOS:** dormant source and standalone SDK/Expo compilation verified; app-installed
bridge conversion, iOS encoding-header behavior, real paused JS/lifecycle, TLS and
memory/device acceptance remain unperformed and gated. **Android/web/missing
module:** fail CLOSED, with no token/network work and no fallback. Expo Go cannot
provide this local module. No Hosted, app build/install, device, SQL Principal,
Composer/C5/C9/provider/runtime operation, commit, push, merge or rebase occurred.

**F1 corrected: YES.** **Original seven failures closed: YES.**
**Native complete-representation admission verified: YES on the tested local
native runtime and identity-only policy; iOS device acceptance remains gated.**
**Ready for Targeted Independent Security Recheck: YES.**
**STOP — R2-NATIVE F1 CORRECTION COMPLETE / TARGETED INDEPENDENT SECURITY RECHECK REQUIRED.**

## Final Owner dormant closure — 2026-10-09

Final Owner accepted the dormant iOS receiver, including the F1 correction and
appended targeted Independent Security Recheck PASS. This authorizes exactly one
scoped local closure commit with parent
`b35b369e4e206f7f295e59d8e3baa4a5f289eaf2` and message
`feat(platform): add dormant iOS bounded publication catalog receiver`.
It supersedes the earlier no-commit stop for this local closure only.

The accepted14 implementation paths plus the Independent Security Review form the
exact15-path closure scope. Original review and all F1 review bytes are unchanged;
accepted appended review SHA-256 is `1f877dd20c3f94d1a0cc85fe9aed1f03f368ab693b0254a86ea41562bbf03a4d`.
The entire pre-closure Builder report remains this file's byte-identical prefix.
Only this final evidence append and the current-state Owner acceptance handoff are
added to the accepted source. No implementation, test or contract changes follow
the recheck.

Final rerun:43 native body fixtures, nine header observations and request/slot
controls PASS;19 suites/498 Transport/Membership/Driver/Auth/parser regressions
PASS, zero failures/skips,17.93s. Exact identity byte caps, nonidentity rejection,
redirect/TLS, deadline/cancel/late callbacks and generation controls remain intact.
Standalone iPhoneOS27/arm64 iOS16.4 Swift core/real Expo bridge typecheck and
compile/link PASS, retaining the previously disclosed sysroot-label warning.
Apple autolinking resolves one accepted pod/module; podspec syntax/evaluated
accepted evidence is preserved. Typecheck, lint/UI guard, Backend build, changed
supported-file formatting, Swift lint, whitespace and preservation PASS.

Closure evidence is under `/private/tmp/otr-r2-native-closure/`: `native.log`,
`regressions.log`, `bridge.log`, `autolinking.json`, `typecheck.log`, `lint.log`,
`backend.log`, `format.log`, `before.json` and `preservation.json`.
Dependency symlinks, temporary certificates/logs and build products are excluded.
SQLite1–53, Backend/SQL Driver, Auth/Membership/Composer and all other tracked
contracts remain exact base bytes apart from the approved Native facade/capability
and documentation paths. No default caller, business write, global fetch
replacement, Hosted/Principal or runtime activation was introduced.

Canonical main is unchanged; no push, merge or rebase is authorized or performed.
No Hosted or device operation occurred. The previously recorded installed Expo,
iOS encoding-header/runtime/device and memory acceptance limits remain gated.

**STOP — R2-NATIVE FINAL OWNER CLOSURE COMMIT COMPLETE.**
