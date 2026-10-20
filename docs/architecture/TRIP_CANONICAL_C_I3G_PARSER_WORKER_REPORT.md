# C-I3G Credential-Free Parser Worker First Slice

Date: 2026-10-05 (Pacific/Auckland).
Status: **C-I3G FULL PASS / ACCEPTED / CLOSED**.

## Scope and authority

Startup: clean `/Users/xoery/Project/otr-mobile-import`, branch `trip/import`,
HEAD `2c81c548f9dfbe38a80ad3ee8e8c7ff18d8fa6ca`. Every repository command used
explicit import workdir; pwd/branch/HEAD/status checks preceded writes.
Read C-I3C–F; their accepted semantics remain authoritative. No sibling edited.

Only `scripts/trip-source-parser/`, this report and a short current-state handoff
change. No product import, HTTP/upload route, SQL/role/grant/gate, API, provider
connector, Source queue, credential or semantic authority is added. The portable
worker/protocol is implemented, with a local Docker preflight adapter. The latter
hard-binds this worktree/HEAD and is **test-only**, not the future authenticated
runtime owner, durable journal or multi-worker quota implementation.

## Independent-review P2: startup/wall-timeout lifecycle correction

Review found that the initial local adapter's one-shot `docker kill` could fail
before create/start completed, leave a later-starting worker unsupervised and
wait indefinitely for its attach CLI. The initial 78-test evidence did not cover
that race. This correction changes only `local-preflight.mjs`, its focused tests
and report/handoff wording. PNG worker/decode/profile/protocol/Dockerfile/archive
bytes, limits, fingerprint and immutable image remain exactly unchanged.

The adapter now separates create from start/attach. A monotonic, exact-run
termination-requested flag starts with the wall timer and also handles cancellation/
output limits; it survives failed kill, absent-container and pending-start states.
After a late create acknowledgement, a requested termination **withholds start**.
Already-issued start is joined while repeated exact inspection/kill handles its
later runnable transition. A test-only delayed atomic run reproduces the original
race rather than merely avoiding it with the new split-create path.

Each run owns one random exact name, immutable container ID when known and matching
`org.otr.run-token` label. Inspection checks name/ID/label before operating on an
existing object; all successful kills/removals address that immutable ID. The
pre-existence negative kill uses only this run's unique exact name. No prefix,
pattern, list-and-kill or other worker identity is used. Label/identity mismatch
is unknown and cannot authorize kill/cleanup. Launch settlement plus positive
exact `State.Running=false` is required before container removal or normal return.
A not-found inspection while launch remains pending is **not** terminality proof.

The 5-second profile wall budget is unchanged. The first correction introduced a
bounded wall + 10-second caller convergence budget and 1-second control CLI limits.
Independent re-review reproduced a second defect: an accepted start delayed
16 seconds outlived the roughly 15-second settle deadline. UNKNOWN retained the
input/slot but dropped active termination responsibility. The prior 85-test suite
proved the 6-second race, not this later handoff boundary. Correction #2 closes
that process-local supervision gap; the earlier manual-reconciliation description
is superseded by the active owner below.

## Independent-review P2 #2: active termination handoff

Before `runOwned` rejects with `PARSER_TERMINALITY_UNKNOWN`, it synchronously
registers an exact termination obligation in the process-local supervisor and
starts its reconciliation promise. The obligation retains the reservation,
name/token/immutable ID, pending create/start promise and child process, and the
monotonic termination request. UNKNOWN expires only the caller's wait, never the
obligation or cleanup protection. PARSER_TIMEOUT still requires settled launch
and positive exact `State.Running=false`; no finite deadline proves terminality.

Create acknowledgements, child launch and launch settlement wake the owner.
Exact inspect/kill reconciliation uses individually bounded 1-second CLI calls
and 100-ms to 1-second capped backoff, with immediate lifecycle-event wakeups.
This is retained active responsibility, not a detached blind timer or a larger
caller timeout. Pending starts have no obligation-expiry deadline. Docker
kill/inspect transport failures retain UNKNOWN and protected input; recovery
continues through exact kill/join/inspection. Identity mismatches cannot authorize
kill/cleanup. Removal transport failures also retain the obligation. Only after
terminal proof and successful exact container removal does the owner mark the
local reservation terminal and remove its obligation. The test-only bounded
wait/reconciliation seam observes and wakes this already-running owner; it does
not create a second owner and is not required for autonomous termination.

The final **87/87** suite adds two cases and strengthens transport evidence:

- A real accepted start delayed **16 seconds** returns bounded UNKNOWN at about
  **15.0–15.1 seconds**, with one active obligation and no terminal/cleanup proof.
  The registered owner then autonomously kills the exact late worker, joins its
  launch, observes `Running=false`/`exited`, removes the container and obligation.
  No manual reconciliation call triggers that termination. A separate concurrent
  container survives and completes actual PNG decoding at 18 seconds; every
  successful kill addresses only the timed-out immutable container ID.
- An event-gated accepted start has no predetermined completion time. Both caller
  and subsequent observer deadlines expire while its obligation remains active
  and input protected. Releasing the gate later causes automatic exact termination
  and proof. This models arbitrarily later completion without lengthening limits.
- Persistent kill and inspect transport failures remain unresolved after caller
  return and a further delay; obligations stay registered and cleanup denied.
  Transport recovery permits the existing owner to converge and remove them.
- Final teardown awaits registered obligations, asserts **0 active obligations**
  and **0 dedicated parser containers**. All previous 6-second race, normal parse,
  timeout, cancellation, crash, OOM, flood and sandbox/isolation probes still pass.

Parent-process crash durability remains **outside C-I3G**. A process-local owner
cannot survive process death. C-I3F durable execution owner/journal, restart
reconciliation, staging/quota/provisioning remain PENDING; no C-I3D helper,
semantic transition, provider terminality or safe IO_UNKNOWN retry is added.

The first correction's seven regressions are retained in the final **87/87** suite:

- Real create delayed 6 seconds: first kill fails before existence; later created
  object never starts, and settled launch/terminal inspection precede removal.
- Real accepted start delayed 6 seconds: early created-not-running kills fail;
  later start is killed under the retained request; inspected terminal state and
  completed attach precede return.
- Original atomic create/start reproduction delayed 6 seconds: absent first kill
  fails; exact labelled container then appears/starts, is killed by immutable ID,
  inspected `Running=false` and removed. PARSER_TIMEOUT returns in about 6.3 seconds,
  within the asserted 15-second bound; late worker gets no unlimited lifetime.
- Concurrent independent container performs actual successful PNG decode while
  the delayed run is killed; successful kill targets are exclusively the latter ID.
  Only this synthetic unrelated-worker test extends its own wall to 9 seconds.
- Persistent injected kill transport failure rejects bounded with unknown
  terminality; fixture quiescence/cleanup fail until transport recovery and proof.
- Persistent injected inspect transport failure does the same; absence is never
  substituted for a transport error. Recovery kills/joins/inspects the exact run.
- Cancellation during startup/running retains supervision through terminal proof.

Normal parse, wall/CPU timeout, crash, OOM, flood, IPC and isolation cases still
pass. Dedicated parser containers are absent after the complete suite. Parser
profile semantics and provider/IO_UNKNOWN blockers are unchanged. No Source
runtime path, authority, route or credentials are introduced by this correction.

## Dependency and format selection

| Format | Inventory / decision                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PNG    | Existing shared transitive pngjs 3.4.0 is too old for this pinned slice and left untouched. Select isolated pngjs 7.0.0 for the strict static truecolor subset below. Actual full decode is exercised. This test-only profile is human accepted; runtime activation remains disabled. |
| JPEG   | No dedicated decoder installed. Segment/profile/full entropy decode and dependency review not proven; BLOCKED.                                                                                                                                                                        |
| PDF    | No dedicated parser installed. Object/page/stream/resource and encrypted/active-content policy not proven; BLOCKED.                                                                                                                                                                   |
| HEIC   | No reviewed installed item-graph/HEVC decoder. Native dependency and codec/grid/auxiliary bounds not proven; BLOCKED.                                                                                                                                                                 |
| HEIF   | No reviewed installed codec/brand/item-graph decoder or unambiguous MIME profile; BLOCKED.                                                                                                                                                                                            |

The project's [current package metadata](https://github.com/pngjs/pngjs/blob/main/package.json)
and the exact [npm registry version](https://registry.npmjs.org/pngjs/7.0.0)
identify pngjs 7.0.0. The vendored **160,939-byte** original npm archive is MIT,
with license included, zero runtime package dependencies and no native addon.
No install/build/package lifecycle script runs; development dependencies and the
browser bundle are not installed. No root package/lock/shared node_modules change.
Supply source: `https://registry.npmjs.org/pngjs/-/pngjs-7.0.0.tgz`.

- SHA-256: `c4b71873d48a692dd5eeb1dcb62185c7aafe40f2180c7cc7f30ec71e89a080be`.
- Registry SHA-512 integrity: `sha512-LKWqWJRhstyYo9pGvgor/ivk2w94eSjE3RGVuzLGlr3NmD8bf7RcYGze1mNdEHRP6TRP6rMuDHk5t44hnTRyow==`.
- Cached base image: `sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`.
- Runtime: Node **24.21.0**, zlib **1.3.2.1-motley-8002e91**, Linux **arm64**.
  Native zlib/libc/Node and their security update lifecycle belong to the pinned
  image; no new host/native/multi-format package was installed. Other architectures
  or runtime versions fail the current profile and need separate review.
- Final immutable worker image ID:
  `sha256:95bd75e07c0bdc5b792a44bff83082ab9a15633b2e028b781f26053117779da7`.
- Worker profile fingerprint:
  `526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5`.

Source review covered chunk parsing, sync inflate, filter reversal and complete
pixel mapping. pngjs's noninterlaced sync inflate can truncate at imageSize;
its return alone is insufficient. The wrapper first independently bounds/checks
all chunks/CRC, exact zlib stream consumption and exact inflated scanline length,
then invokes pngjs for full unfilter/bitmap decoding. No dependency is modified.
First run caught archive directory permissions lacking nonroot traversal; the
Docker build now sets readable/traversable permissions without changing decoder
file bytes. Negative tests were retained and the complete final suite rerun.
This is a source/fixture/sandbox review, not an upstream security audit or a
claim that no decoder/kernel vulnerabilities exist.

## Frozen profile: PNG_STATIC_RGB8_RGBA8_V1

The [PNG specification](https://www.w3.org/TR/png-3/) supplies container/filter
semantics; the following limits are deliberately stricter first-slice choices.
They do not redefine all valid PNG files as malformed or authorize acquisition.

| Property                 | Exact selection                                                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol/profile         | Versions 1/1; profile hash covers ordered manifest, all worker/protocol/profile/decode source hashes, Dockerfile and exact archive bytes. A changed profile invalidates reuse. Local adapter also requires the exact image ID and manifest label.                                                                          |
| Format/MIME              | PNG / `image/png`; exact 8-byte signature, CRC for every chunk; declared MIME must agree. No signature-only pass.                                                                                                                                                                                                          |
| Input                    | Positive exact SHA-256/count; ≤52,428,800 bytes (50 MiB). Parent streams ≤1 MiB chunks only after ownership. Worker stats fixed read-only descriptor, hashes actual bytes independently, compares count/hash.                                                                                                              |
| Container                | One first IHDR of length 13, ≥1 nonempty contiguous IDAT, one final empty IEND. Only these three chunk types. No missing/duplicate IHDR, malformed lengths, unknown/ancillary chunks or data after IEND.                                                                                                                   |
| Raster                   | Single frame; noninterlaced; compression/filter methods 0; bit depth 8; color type 2 RGB or 6 RGBA; 3 or 4 source channels. No palette/grayscale/16-bit/APNG/other modes.                                                                                                                                                  |
| Dimensions/allocation    | Width/height 1–2048, pixels ≤1,048,576. Full RGBA pixel buffer ≤4,194,304 bytes. Checked row arithmetic; complete inflated scanlines ≤4,196,352 bytes. Never allocate from unbounded dimensions.                                                                                                                           |
| Chunk/compressed budget  | ≤128 chunks total; ≤1,048,576 bytes per chunk; concatenated IDAT ≤8,388,608 bytes. Limits checked before decode.                                                                                                                                                                                                           |
| Decode depth             | Complete zlib stream/checksum with bounded maxOutputLength; all compressed bytes consumed; exactly `(width*channels+1)*height` inflated bytes; every row filter in 0–4; pngjs fully reverses filters/maps all pixels; exact final dimensions/depth/interlace/RGBA length checked. No partial/thumbnail/header-only decode. |
| Metadata                 | **Zero** ancillary metadata chunks accepted; tEXt/iTXt/zTXt/iCCP/EXIF/gamma/color-space/pHYs/tRNS/PLTE all excluded. They are rejected, never stripped/transcoded/expanded.                                                                                                                                                |
| Trailing/polyglot policy | Extra bytes/second PNG after IEND and unused compressed suffix/second zlib stream reject. Strict subset mitigates these ambiguity classes; it is not a universal polyglot detector or malware scan.                                                                                                                        |
| Result semantics         | `PARSE_PASS` proves only this format/profile over the bound bytes. No VERIFIED, provider completion, ownership, admission, extraction or semantic receipt inference. Original bytes never change.                                                                                                                          |

PNG outside this profile and PDF/JPEG/HEIC/HEIF remain **BLOCKED**. Human acceptance
of this worker/profile is pending. Runtime PNG verification is still disabled;
C-I3C's broader allowed format catalog does not silently shrink to this subset.

## Portable worker protocol and local isolation

`png-worker.mjs` accepts one canonical stdin JSON request ≤512 bytes with exactly
`protocol_version,profile_version,profile_sha256,input_token,input_sha256,
byte_count,declared_mime`. Token is opaque lowercase 32-hex; digest 64-hex. It
opens **only `/input`** with read-only/no-follow flags; no caller chooses a path.
The portable boundary can instead be deployed with an equivalent fixed read-only
FD; this local adapter fixes `/input`. Docker is not a product runtime dependency.

Exactly one canonical newline-terminated JSON result ≤4096 bytes contains
`protocol_version,profile_version,profile_sha256,input_token,input_sha256,
byte_count,actual_mime,format,facts,status`. Success facts are exactly
`width,height,pixels,frames,channels,bit_depth,interlace,decoded_byte_count`.
Failure sets MIME/format/facts null. No filename, original/decoded bytes, arbitrary
metadata, path, exception text, stack, credential or free-form diagnostic is emitted.
Parent checks exact types/keys/order/bounds/profile/byte identity, canonical bytes,
exit status and terminality. Duplicate/unknown fields, second result, arbitrary
stdout/stderr, count/hash/profile mismatch or exit-zero malformed output fail closed.
A parser's forged boolean never grants DB/provider authority.

Worker codes: PARSE_PASS, FORMAT_MISMATCH, FORMAT_AMBIGUOUS, FORMAT_MALFORMED,
FORMAT_UNSUPPORTED, FORMAT_RESOURCE_LIMIT, PARSER_INPUT_IDENTITY, PARSER_PROFILE,
PARSER_PROTOCOL. Parent adds fixed PARSER_TIMEOUT, PARSER_OUTPUT_LIMIT,
PARSER_RESOURCE_LIMIT (only inspected cgroup OOM evidence) and PARSER_CRASH for
other abnormal exits. Protocol violation is non-PASS; invalid worker ingress
exits nonzero and is classified as PARSER_CRASH by this local adapter. All these
are **internal diagnostics**, not new C-I3D receipt enums.

The image includes only public worker/profile/decoder code plus the pinned Node
base. Build has no network; `.dockerignore` excludes tests, parent adapter and all
repository context. Run has network none, readonly root, UID/GID 65534, cap-drop
ALL, no-new-privileges, default seccomp, CPU 1 + CPU RLIMIT 1 s, wall 5 s, memory
128 MiB including no extra swap, V8 heap 64 MiB, PIDs16, FD32, file RLIMIT8 MiB,
core0, tmpfs16 MiB noexec/nosuid/nodev and combined retained-output ceiling4096.
The only host bind mount is the exact staged input file readonly. No repository,
staging-root, sibling-stage, parent env/secret, Docker socket or arbitrary host
file mount. The Docker CLI uses an allowlisted local PATH/HOME environment;
worker receives no parent credential variables or env file. The supervisor must
remain alive to enforce wall/output kill and exact join; its own crash/restart
and staging reconciliation are future durable-owner work, not proven here.

Portable deployments must supply independently reviewed equivalent OS isolation,
network deny, read-only FD, resource/output controls, syscall policy, supervisor
terminality and private no-follow staging/quota/authenticated ownership. Default
Docker seccomp plus cap-drop does not prove exploit/kernel-escape resistance.
Managed service/platform constraints, immutable image distribution and hardened
production syscall profile remain **PENDING**. A differing rebuilt image ID is
not automatically admitted by a matching label; it requires reviewed pin update.

## Attempt ownership, references and cleanup

Accepted order stays cheap bounded ingress/auth syntax → exact operation ID/key/
digest and Source/Representation/PREPARE pins with current owner + canReadTrip +
canWriteTrip → C-I3D admission/exclusive Representation slot → exact attempt UUID/
generation/execution owner → bounded staging/hash/count → parser → fresh admission/
bases → **only future** provider dispatch. No DB locks span staging/parser/I/O.

Local adapter uses an opaque private WeakMap reservation and per-Representation
slot; supplier is called only afterward. Overlap receives BUSY/existing state and
zero full payload/parser work. Changed/forged handles and parallel reuse reject.
These are deterministic/test-local reservations over synthetic material; they
are **not** real authorization, C-I3D CAS or authenticated runtime evidence.
The exact owner/journal, crash-safe quota and durable staging stay PENDING.

PARSE_PASS/failure/timeout never calls a DB helper or advances a Source operation.
The slot and main staging remain protected after parser exit. Fixture cleanup
requires observed exact process terminality, explicit synthetic no-provider
quiescence and no fixture reference. That seam has no provider connector/operation
rows and is never imported by product code; its explicit fixture quiescence
setter is not a runtime completion producer or approved failure disposition.
Missing C-I3D pre-dispatch terminal rejection adapter remains PENDING/BLOCKED.
No real Source staging can be released merely by timeout or parse failure.

Full create/start settlement, worker kill/join and exact inspection Running=false
precede container removal. Unknown supervision never authorizes fixture cleanup. Parser
scratch removal alone does not authorize main staging cleanup. Main Source
staging would still require exact attempt terminality/quiescence and complete
reference checks. No provider object is deleted, repaired, overwritten or listed.
Provider post-crash terminality and safe **IO_UNKNOWN retry remain BLOCKED**;
object existence, GET/hash, parser PASS, cancellation and elapsed lease prove none.

## Validation and reproduction

- **87/87 Node tests**: 14 portable protocol checks + 71 real local parser,
  ownership, adversarial/isolation checks + two parent tests.
- Generated/license-safe valid fixtures cover minimum RGB/RGBA, each dimension
  ceiling, pixel ceiling, filters0–4, split IDAT, chunk-count and chunk-size boundaries.
  Exact 50 MiB input safely rejects trailing bytes; streaming excess stops under
  reserved ownership. No fixture retains personal/user document material.
- Invalid cases cover wrong MIME, signature fake, truncation, CRC, missing/duplicate
  chunks, trailing PDF/PNG, extra zlib suffix/second stream, bad filter/scanline,
  dimensions/pixels, metadata/ICC/APNG, chunk/count/aggregate IDAT and inflate bombs.
- Parent survives worker wall/CPU timeout, abort/crash, cgroup OOM, stdout/stderr
  floods and malformed/duplicate output. Protocol rejects duplicate/unknown fields,
  profile, input hash/count and unbounded/fabricated structural facts.
- Actual image denies TEST-NET egress and access to repository/canonical paths,
  sibling staging/host paths and Docker socket; fake parent secret and DB/provider
  credential env names absent; nonroot cannot modify root or readonly input.
  No hostile input supplies the test-only fault script selector.
- **C-I3F 23/23 regression PASS**. The accepted harness hard-binds old `4dc7095`;
  execution replaces only that HEAD literal **in memory** with verified `2c81c54`
  before importing the unchanged test source. No harness/schema/proof semantics
  change or runtime relaxation; its tracked bytes remain exact.
- Typecheck, Backend build, full ESLint/UI guard, scoped Prettier and whitespace
  checks PASS. Every existing tracked file except current-state compared
  byte-identical to baseline; the current-state change is the C-I3G handoff only. All **71 unique server migrations**,
  manifest/verifier, 00500/state-machine tests, old provider/C-I3F evidence,
  A/B/SQLite44→45/API/Backend/product bytes remain unchanged. Root dependency files
  and shared dependency tree were not modified. No full SQL rerun is claimed.
- All test containers stopped/removed after exact terminal inspection; import-local
  staging/evidence/log scratch removed after confirming no parser container remains.
  Frozen local image is retained for review/reproduction, with no running service.

Reproduce with explicit import cwd and the clean reviewed baseline above. First
build offline from the pinned cached base and vendored archive (no npm install):

```sh
cd /Users/xoery/Project/otr-mobile-import
docker build --network=none --pull=false --label "org.otr.parser-profile=$(node --input-type=module -e 'import {profileHash} from "./scripts/trip-source-parser/profile.mjs"; process.stdout.write(profileHash())')" --tag otr-ci3g-parser:local scripts/trip-source-parser
node --test scripts/trip-source-parser/preflight.test.mjs
```

An unavailable pinned base or different built image ID fails closed; do not pull
an unreviewed replacement or silently change the pin. The image is Linux arm64.
The test uses import-local `.ci3g/staging` only, with no provider/DB environment;
remove that synthetic scratch only after all dedicated containers are terminal.
Deployment installation/distribution is separately reviewed work.

## Next checkpoint and explicit closure boundaries

Human accepted this exact bounded PNG first slice and both supervision corrections.
Other format/profile support requires separately approved work; do not infer it
from PNG. A future runtime seam must prove real
Source/PREPARE authorization/CAS/ownership before payload ingress and preserve the
existing pre-dispatch failure blocker. Durable owner/journal/staging/quota and
provider terminality component remain separate blockers before any command gate.

- Selected profile: **PNG_STATIC_RGB8_RGBA8_V1 only**.
- Unproven formats/profiles remain BLOCKED: **YES**.
- Source commands enabled: **NO**.
- C-I3D gate open: **NO**.
- Product upload route: **NO**.
- Provider terminality still BLOCKED: **YES**.
- Safe IO_UNKNOWN retry enabled: **NO**.
- Runtime credentials: **NO**.
- Purge/redaction: **NO**.
- Production/Hosted Dev: **NO**.
- Sibling modifications: **NO**.
- Local C-I3G task-only commit: **AUTHORIZED**; push: **NO**.

**STOP — FULL PASS / ACCEPTED / CLOSED; runtime remains disabled.**
