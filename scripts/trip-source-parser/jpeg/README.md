# JPEG decoder local candidate — CLOSED

This directory is a format adapter candidate for the existing trip-source-parser,
not a new Source/Task/Parser platform. It has no runtime registration, SQL,
Storage access, worker container, execution fingerprint or Source receipt issuer.
`decodeJpeg` returns local facts only. No `PARSE_PASS` Source proof is created.
Existing PNG files, fingerprints, image and defaults remain unchanged.

## Dependency decision

Reuse `jpeg-js@0.4.4`, pinned official npm tarball, 21,818 bytes, zero runtime
dependencies. Both archive integrity and loaded decoder source are checked.
No root/Native dependency or lockfile changes are needed. The upstream code
performs actual entropy/pixel decoding; the surrounding marker guard only
restricts eligible input before allocation. Do not replace decoding with SOF.

Primary sources checked 2026-11-02:

- https://registry.npmjs.org/jpeg-js/0.4.4 (published version/integrity/license)
- https://github.com/jpeg-js/jpeg-js/tree/v0.4.4
- https://github.com/jpeg-js/jpeg-js/blob/v0.4.4/README.md

Upstream documents synchronous decoding and the `tolerantDecoding`,
`maxResolutionInMP`, `maxMemoryUsageInMB` controls. Use strict decoding and finite
limits rather than its tolerant/default 100MP/512MiB configuration.
The package license is BSD-3-Clause; decoder source retains Apache-2.0 notices;
the encoder used only to generate the synthetic test image retains Adobe/BSD
notices. Preserve LICENSE, README and source copyright notices from the archive.
The pinned archive retains package LICENSE and source notices; the full Apache-2.0
text is also retained alongside this candidate. Preserve all notices at deployment.

## Deliberately narrow eligibility

One baseline SOF0, 8-bit, JFIF YCbCr three-component, one interleaved scan,
no trailing bytes/second image, dimensions <=2048 per axis and <=1,048,576
pixels, original <=1MiB, metadata <=4096B. Decode RGBA and compare dimensions
and exactly width*height*4 bytes. Canonical EXIF orientation1 or no EXIF only;
2–8, unknown direction/layout, ICC/Adobe colour transforms, progressive, CMYK,
grayscale, thumbnails and more elaborate metadata are unqualified, not declared
universally malformed. No auto-rotation/re-encoding or original hash changes.

The mature decoder is capped at 32MiB approximate allocation and 1.048576MP;
local tests run Node old-space <=64MiB. Existing sandbox limits (128MiB process,
1 CPU-second, 5-second wall, 16pids/FD32) are candidate constants only: they were
not enforced or qualified by a container in this task. Library limits do not
replace future process isolation. Do not load this synchronous decoder into the
normal Backend event loop.

## Local reproduction

Extract only the pinned archive into `decoder/package` in a disposable directory;
reject links/path traversal while extracting. Extracted files are not delivery
files. The preparation script uses Python 3.12+ safe selective extraction and checks
the pinned decoder again. Run inside this directory:

    python3 prepare-local.py
    node --max-old-space-size=64 --test --test-concurrency=1 decoder.test.mjs

Nine tests cover a real synthetic baseline JPEG, LE/BE orientation1, rotated and
unknown EXIF, full pixel decode (missing DQT must fail despite eligible SOF),
malformed/truncated/trailing input, modes and byte/dimension/metadata/memory bounds.
`fixtures/baseline-32x16.jpg` was generated using the pinned encoder from a fixed
32x16 RGB(40,90,150) raster at quality80. Independent `file` and macOS `sips`
identified baseline8/three-components/32x16/no orientation. It is a format fixture,
not travel evidence or an authorized model input. Existing large baseline city
asset exceeds the retained 1MiPixel policy and is only usable for IO tests.

## Still blocked for formal JPEG Golden Slice

No container/runtime/version/architecture execution manifest or Host worker port
is qualified. Reuse the existing bounded IPC envelope and sandbox owner lifecycle
when adding the JPEG format adapter; do not reuse a PNG hash/profile/receipt.
Typed JPEG worker facts must carry identity orientation, with Source-issued
terminal proof and real independent Storage GET verification. Admission must
still require original review and its normal human decisions.

Before activation Root must prepare the exact JPEG profile/CHECK, Source
acquire/pin/guard/broker/facts, manifest/provider-current/run-input and Core REGION
qualification differences. These are not installed here. Normal JPEG Capture,
Source upload, paid interpretation and Save remain disabled; no MIME wildcard or
PNG permission is broadened by this candidate.

## Local IPC candidate (not sandbox-qualified)

`jpeg-worker.mjs` reuses the existing PNG canonical framing, request validation
and finite safe codes, tightening the byte bound to 1MiB. The JPEG content hash
is separate and includes its adapter plus shared protocol bytes. The entrypoint
accepts no path, runtime override or profile selection. It uses only fixed
`/input` with O_NOFOLLOW, size/hash checks and finally-close before decoding.
The proposed Linux/x64 Node24.22.1 runtime must match exactly; no Docker image
or registered execution fingerprint is implied.

    node --max-old-space-size=64 --test --test-concurrency=1 worker.test.mjs

Seven local IPC tests use real temporary FileHandles mapped only to `/input`
through a test seam. They verify local facts and identity/closure/error handling;
actual subprocess tests reject malformed IPC and cannot decode on this unqualified
local runtime. This is not a container lifecycle, resource-isolation, Host callback
or Source receipt test. Existing sandbox owner/termination lifecycle is unchanged.
No production caller is connected; JPEG remains disabled.

Existing decoder evidence (Root independent review of `6471d917`): NO_BLOCKER,
9 focused tests PASS; 41 size/sampling/EXIF negatives rejected before decode and
16 entropy truncations not accepted. Those checks were not rerun for this IPC
slice and do not qualify its new entrypoint or sandbox.
