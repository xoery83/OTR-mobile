# C-I3F Parser Sandbox + Trusted Completion Architecture Contract

Date: 2026-10-05 (Pacific/Auckland).
Status: **C-I3F HUMAN PASS / ACCEPTED / CLOSED**.
Human acceptance includes the exclusive-attempt-before-staging correction; runtime blockers remain unchanged.
Source runtime activation remains **BLOCKED**; C-I3D gate stays CLOSED.

## Authority, scope and decision

Clean startup: import worktree, `trip/import`,
`4dc70958b9347d45c4decaa85150c85efe8f6b57`. Explicit import workdir and
pwd/branch/HEAD/status checks preceded writes. Authority: C-I3C F/G/H, accepted
C-I3D machinery and C-I3E local findings. No accepted contract is weakened.

Select two separate boundaries: a credential-free isolated parser worker and a
single durable Source execution owner. Parser PASS and provider completion are
independent evidence; neither alone permits VERIFIED. All actual PDF/JPEG/PNG/
HEIC/HEIF decoder profiles remain BLOCKED; provider post-crash terminality and
safe IO_UNKNOWN retry remain BLOCKED. Durable runtime identity/journal/provisioning
remain PENDING. Local isolation controls and deterministic model checks are
implementation-backed evidence, not completion of either runtime blocker.

Changes: this contract, test-only
`scripts/supabase/trip-source-parser-terminality-preflight.test.mjs` and a short
current-state update. Existing C-I3E harness/report and all product code, server/
SQLite migrations, manifest/verifier, API contracts, roles/grants remain unchanged.
No parser package, product endpoint, runtime credential, semantic worker or
provider call is added. No DB or Supabase process is started. Reuse of cached
`node:24-bookworm-slim` uses immutable local image ID and `--pull=never`.

## Threat model and trust boundaries

| Threat                                          | Required disposition                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mislabeled MIME / signature-only body           | Declared MIME must equal independently parsed accepted format; mismatch or incomplete parse never VERIFIED.                                                                        |
| Polyglot / ambiguous format                     | Require unambiguous container and reviewed trailing/incremental-data rules; two plausible formats or unconsumed ambiguous data reject. A magic-byte sweep is not a polyglot proof. |
| Malformed / truncated structure                 | Fully validate relevant container and decode dependencies; no partial-output success.                                                                                              |
| Image/decompression bomb / huge dimensions      | Bound input bytes, decoded pixels/channels/bit depth/frames, expanded streams and all intermediate allocations.                                                                    |
| Huge PDF pages/objects or recursive content     | Bound pages, indirect objects, object-stream/xref chains, nesting and expanded streams; cycles cannot recurse without a bound.                                                     |
| Embedded/active/external content                | Never execute scripts/actions or resolve external resources. Embedded files/media and unsupported features fail the reviewed policy.                                               |
| HEIC/HEIF brand/item ambiguity                  | Resolve brands plus actual item codec/properties/dependencies; generic mif1/msf1 alone is not format proof.                                                                        |
| CPU / memory / FD / PID / disk exhaustion       | OS sandbox plus independently enforced supervisor wall/output limits; resource failure never parser PASS.                                                                          |
| Oversized EXIF/XMP/ICC/PDF metadata             | Bound raw and expanded metadata; parse only structural needs, emit no metadata/material/filename in result/logs.                                                                   |
| Parser crash / invalid IPC / compromised output | Treat child output as untrusted; strict bounded protocol, profile/identity binding and independent parent byte hash. Parent stays alive.                                           |
| Parser temp cleanup vs live provider writer     | Parser process termination permits its scratch cleanup only; main staging still needs quiescence and no required reference.                                                        |

There is **no malware scanner** and no malware-free claim. Structural/decode
safety is narrower than malicious-content detection and does not authorize later
renderers/extractors to run without their own bounds.

## Format policy: fixed ceilings, pending decoder profiles

Accepted exact MIME strings and existing input ceilings remain unchanged:
`application/pdf` ≤10,485,760 bytes; `image/jpeg`, `image/png`, `image/heic`,
`image/heif` ≤52,428,800 bytes; binary length >0. No image normalization/transcode,
PDF rewrite or metadata stripping of originals. TEXT/LOCATOR remain metadata-only.

The following per-format decoder rules/ceilings are **proposal parameters,
PENDING review and executable decoder proof**, not newly accepted restrictions or
claims of implementation. If a format cannot satisfy the profile, it stays BLOCKED.

| Format / MIME         | Recognition and structural/decode depth                                                                                                                                                                                                                             | Proposed resource ceilings / metadata                                                                                                                                                 | Verification evidence and status                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PDF / application/pdf | Header/container parser, all retained incremental/xref/object-stream chains, page tree and dependent streams; strict trailer/EOF and bounded consumed-data rules; no active or external execution. Encrypted/embedded/unsupported features need an explicit policy. | Candidate 200 pages, 20,000 indirect objects, nesting 32, expanded streams total 64 MiB, bounded xref/stream recursion; metadata total 64 KiB. All decoder-specific ceilings PENDING. | Original SHA-256/count + complete structural result under approved parser/version/resource fingerprint; required non-rendering parse depth and library PENDING. BLOCKED. |
| JPEG / image/jpeg     | Validate all marker/segment lengths, scan structure, frame metadata and complete entropy decode to bounded output; no merely SOI/EOI success.                                                                                                                       | Candidate longest axis 8192, total pixels 16,777,216, single frame, raw/expanded metadata 64 KiB; component/bit-depth/progressive limits PENDING.                                     | Exact bytes plus consistent decoded dimensions/channels and approved full-decode result. BLOCKED.                                                                        |
| PNG / image/png       | Validate chunk lengths/order/CRC, required chunks and complete bounded IDAT decode; unsupported animation/features require explicit handling.                                                                                                                       | Same candidate pixel/axis bounds; decompressed scanline arithmetic checked before allocation; chunk/count, ancillary/ICC expansion and APNG policy PENDING.                           | Exact bytes plus structural/full-decode result; CRC/signature alone insufficient. BLOCKED.                                                                               |
| HEIC / image/heic     | Bounded ISO-BMFF box parse, item/property/reference graph and actual supported HEVC decode. heic/heix major-brand recognition is a candidate, not decode proof; collection/auxiliary/grid handling must be defined.                                                 | Same candidate image limits; item count candidate 256, graph depth 16, aggregate decoded pixels bounded across dependencies; metadata 64 KiB. Brand/codec/profile coverage PENDING.   | Container + codec + full-decode evidence, exact bytes; mixed/unknown/ambiguous brands fail closed. BLOCKED.                                                              |
| HEIF / image/heif     | Generic mif1/msf1 is insufficient; reviewed item codec/property/brand mapping must distinguish allowed HEIF from AVIF/other codecs and from HEIC MIME.                                                                                                              | Same candidate bounds; codec dependency, sequence/grid/auxiliary policy and metadata expansion PENDING.                                                                               | Deterministic actual-format/MIME mapping and full-decode proof from reviewed library absent. BLOCKED.                                                                    |

No currently installed Source-specific library provides the required reviewed
five-format profile. Existing receipt sniffing/Expo image normalization is not
reused: it recognizes signatures/brands and can convert original bytes. Existing
Backend request handling also accumulates the full body before dispatch; a future
bounded byte entrypoint cannot inherit that buffering path unchanged. Neither
helper is modified in this phase.

## Parser sandbox and bounded proof protocol

Design-selected: separate nonroot worker/container, no Source DB/semantic writer
or provider credentials, no network, no shared parent environment/secrets. Mount
only exact immutable staged input read-only, never the repository, staging root,
credential directory or Docker socket. Parent pins count/hash and trusted
Account/operation/attempt identities; worker gets an input descriptor/token,
not generic caller paths. Parent byte hash independently covers what is decoded.

Local control profile proven using benign synthetic probes: network none,
read-only root/input, UID/GID 65534, all Linux capabilities dropped,
no-new-privileges, one CPU with one-second CPU rlimit, 128 MiB memory and equal
memory+swap allowance, 16 PIDs, 32 FDs, zero core size, 8 MiB per-file bound,
16 MiB noexec/nosuid/nodev tmpfs, combined retained stdout/stderr ≤4096 bytes.
Supervisor wall bound 5 seconds (timeout probe 2.5 seconds). Parent kills the exact
container, waits for CLI exit and verifies `State.Running=false` before removal.
Docker transport failure is not worker death: inability to inspect/join must
retain input and mark process terminality unknown, never perform cleanup.

These bounds are selected for the architecture; actual decoder feasibility and
deployment OS/cgroup/kernel/security policy remain PENDING. A benign Node probe
does not prove resistance to parser exploits or kernel escape. Default seccomp
plus cap-drop is not a reviewed decoder syscall profile. Sandbox worker scratch
limit is separate from the 50 MiB read-only input and durable Backend staging quota.

Successful runtime IPC is a single strict JSON result ≤4096 bytes: exact schema
version/profile hash, input token/hash/count, actual MIME, bounded dimensions/
page counts and PARSE_PASS or safe error. No arbitrary JSON, material, strings,
paths, metadata, exception stacks or credentials. Parent requires successful
terminal exit, exact field whitelist/types/bounds/profile, byte identity and
approved complete decoder result. Exit zero without valid IPC is not PASS.
Unknown/duplicate fields or extra/trailing output reject; downstream producer
does not trust a caller-provided parsed/verified Boolean.

Safe internal error families: FORMAT_MISMATCH, FORMAT_AMBIGUOUS, FORMAT_MALFORMED,
FORMAT_UNSUPPORTED, FORMAT_RESOURCE_LIMIT, PARSER_TIMEOUT, PARSER_OUTPUT_LIMIT,
PARSER_PROTOCOL, PARSER_RESOURCE_LIMIT and PARSER_CRASH. Only explicit OS evidence
classifies OOM/resource failure; unexplained abnormal exits remain PARSER_CRASH.
Codes are bounded internal diagnostics, **not additions to C-I3D receipt enums**.
All errors cause non-VERIFIED/logical quarantine; no provider object repair.
Logging records bounded code/profile/attempt correlation only.

Freeze a production profile only after reviewing actual parser/codec versions,
immutable worker image digest, executable/library hashes, IPC schema, recognition/
decode/metadata policy, numerical limits and deployment kernel/seccomp settings.
Fingerprint is SHA-256 of the canonical versioned manifest, not an image tag.
Unknown/stale profiles invalidate proof reuse. This preflight's control-profile
fingerprint is **not a decoder/VERIFIED profile**:

- Image: `sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`.
- Control-profile hash: `5c74cff1c07191893a09a12685be7865f081c167e0f3583cbbb95b9ab2b0651b`.

## One exact trusted execution-owner model

Select a dedicated, supervised, **single durable Source I/O execution owner**
separate from HTTP handlers and parser children. It owns the only future scoped
provider connector and private completion producer. HTTP request lifecycle, caller
AbortController and expiring worker lease cannot cancel/finalize its admitted
provider attempt or grant another worker write authority.

Owner binding: exact operation ID/key/digest and Actor/Trip/Source/Representation/
parent/bases; attempt UUID; safe attempt generation; stable authenticated DB
execution principal. C-I3D `worker_identity` equals **session_user**, not an OS PID,
JWT or fresh caller-supplied worker string. A protected owner journal additionally
binds supervisor run epoch and request identity. Epoch is execution provenance,
not a new C-I3D column or authority to change phase. A restarted process using the
same principal cannot manufacture terminality for an old attempt.

Required durable journal: append-only/atomic records under protected permissions,
payload-free, exact identities and profile/descriptor hashes, durable fsync +
directory-fsync ordering. One state owner and no split-brain dispatch; explicit
owner-start exclusion. Seal DISPATCH_INTENT before any provider send; no implicit
SDK/proxy redirect/retry or detached descendant may bypass that record. Retain
the live handle and a bounded response/collision observation; seal terminal result
before database bookkeeping. Retain references until semantic disposition and
cleanup eligibility. Journal corruption/missing epoch/uncertain sync is UNKNOWN.

The current installed standard-upload Supabase Storage adapter exposes an object
result/error, **no durable provider write-attempt ID plus terminal-status query**.
An object ID, ETag, upload URL or matching hash is not that operation handle.
C-I3E measured local completed responses, not an audited post-crash guarantee.
This contract makes no claim about untested provider products/features.

Accepted proof kinds for the selected owner model:

- DURABLE_NO_DISPATCH: intact audited journal proves dispatch was impossible
  (no DISPATCH_INTENT, exclusive connector ownership and write-ahead ordering);
  every execution descendant is terminal. This is a selected design, not proven
  crash-safe storage in the local in-memory model.
- OWNER_TERMINAL_RESPONSE: original owner observes a definitive response, seals it
  durably, disables any further dispatch for that attempt and supplies the reviewed
  provider completed-call guarantee. Without that supplier/deployment guarantee,
  this is still not runtime proof.
- PROVIDER_TERMINAL_ATTESTATION: exact provider-side operation terminality or
  equivalent audited provider execution/fencing guarantee. **Missing/BLOCKED**.

There is no caller proof API. A protected future producer validates the exact
journal record/response/proof kind and identity against C-I3D before invoking its
private operational helper. No client, service_role semantic shortcut, parser,
timer, arbitrary Boolean, GUC or JWT invokes it. Credential/capability provisioning
requires a separate reviewed checkpoint; no role/grant is created here.

A durable owner surviving HTTP-worker crashes solves only caller/HTTP-worker
loss. Its **own** crash after dispatch still leaves provider completion unknown.
Killing the old owner prevents future sends by that process but does not terminate
an already accepted remote PUT. A replacement owner must retain IO_UNKNOWN.
Missing component is an audited durable provider terminality/fencing mechanism
(or deployment-specific completed-call/old-request drain guarantee) integrated
with the journal and exact protected completion producer. Durable journaling
alone cannot supply this. No finite lease/wait, GET/HEAD or equal bytes is a
substitute. Runtime activation and safe UNKNOWN retry remain BLOCKED.

## Exact C-I3D state mapping and proof-time order

| Transition                             | Required boundary / proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admission / staging / parser           | Before ownership, allow only cheap bounded route/UUID/key/digest syntax, request/content-length ceiling, declared MIME allowlist and authentication sufficient to locate the operation. No full payload copy, staging, decode or sandbox. Resolve exact operation ID/key/digest and trusted Source/Representation/PREPARE pins; authorize current owner + canReadTrip + canWriteTrip; register/admit the exact operation under C-I3D before reserving the attempt.                                                                                                                                                                                        |
| ADMITTED → IO_ACTIVE                   | C-I3D exact operation registration/ownership transaction, fresh owner + canReadTrip + canWriteTrip, exact bases, UUID and generation, session_user identity and exclusive Representation slot. Acquire the exclusive Representation writer slot and bind fresh attempt UUID/generation/session_user execution owner before any expensive work. Commit ownership before bounded staging/hash/count and parser invocation; no DB lock spans staging/parser/provider I/O. Persist owner journal before work and DISPATCH_INTENT before provider send. Overlapping upload/recovery returns BUSY/existing operation state without staging/parsing its payload. |
| IO_ACTIVE → IO_UNKNOWN                 | Response/owner lifecycle uncertain: timeout/cancel/drop/crash/missing response. Exact attempt CAS; do not release slot, advance generation, finalize or clean staging. Caller disappearance alone need not mark a still-live owner terminal.                                                                                                                                                                                                                                                                                                                                                                                                              |
| IO_ACTIVE or IO_UNKNOWN → IO_QUIESCENT | Only original exact-owner operational completion with validated trusted terminality evidence and all required I/O/proof observations captured. New process possession of the same principal is insufficient.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| IO_QUIESCENT → new IO_ACTIVE           | Recheck current ownership/read/write admission and unchanged intent/bases; increment generation once within accepted bounds, allocate distinct attempt UUID, reacquire slot. No increment on duplicate completion; stale prior proof/owner fails CAS.                                                                                                                                                                                                                                                                                                                                                                                                     |
| IO_QUIESCENT → FINAL                   | Independent actual-byte/format proof, current owner + canReadTrip + canWriteTrip and exact Source/Representation states/revisions; immutable receipt semantics unchanged. FINAL admits no new I/O.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ADMITTED/QUIESCENT failure disposition | Follow existing approved command/helper capabilities only; do not invent a parser failure receipt enum, forge MATCH/MISMATCH/DEFINITE_MISSING or bypass helper restrictions. After staging/parser failure, do not dispatch provider I/O or release a live slot by timeout. Establish exact attempt/process terminality and no required reference before cleanup. Use only an already-approved ADMITTED/QUIESCENT failure disposition; if the exact pre-dispatch terminal rejection path is absent, keep it PENDING/BLOCKED, retain protection and do not invent an enum/helper.                                                                           |

Critical implementation detail: `trip_source_finalize` accepts only its exact
eight-field proof, kinds MATCH/DEFINITE_MISSING/MISMATCH and canonical UTC
microsecond `observed_at` within `[admitted_at,io_finished_at]`. Do not append parser/
terminality fields, backdate a proof or reinterpret missing as malformed bytes.

Safe sequence is cheap bounded ingress → exact operation/PREPARE pins and current
owner/read/write authorization → C-I3D operation admission → exclusive Representation
writer slot plus bound attempt UUID/generation/execution owner → bounded staging/
hash/count → pre-upload sandbox → recheck admission/bases → provider create-only → durable provider
completion evidence → bounded actual-byte readback/hash + sandbox → seal byte/
format observation → private definitive-completion bookkeeping (stamp
io_finished_at / IO_QUIESCENT) → separately checked semantic finalization.
Thus provider completion **evidence** precedes readback, but database IO_QUIESCENT
is delayed until required proof observations exist. Protection stays held and no
database lock spans I/O. This satisfies C-I3D's proof-time upper bound without
weakening the state machine. On readback/parser failure preserve bytes, retain
bounded internal failure and never invent a matching proof or VERIFIED.

Parse before upload to prevent unsafe/mislabeled input from entering the future
pipeline, and parse actual trusted readback to establish what is persisted.
Select both passes; no signature-only reuse optimization. Parser PASS cannot
prove the old writer is terminal, and provider success cannot establish format
safety. The future completion producer alone translates reviewed evidence into
the existing bounded C-I3D proof; it must not pass through child JSON blindly.

## Crash/restart decision table

| Cut / case                                          | Recovery rule                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before exclusive attempt ownership                  | Cheap bounded ingress only; no staged payload or parser exists. Resolve/admit exact operation and reserve exclusive slot before expensive work. Overlapping request observes BUSY/existing state, with zero payload staging/parser work.                                                                                          |
| Owner crashes during staging/parser before dispatch | Retain exact attempt/slot and staging references. Kill/join or independently establish exact staging/parser process terminality; audited DURABLE_NO_DISPATCH may establish no provider writer. Timeout alone never releases ownership; incomplete journal remains UNKNOWN. Missing approved rejection path stays PENDING/BLOCKED. |
| After dispatch / before response                    | UNKNOWN protected. Restart never auto-retries or cleans up.                                                                                                                                                                                                                                                                       |
| Provider success / before journal fsync             | UNKNOWN: object equality cannot replace the lost terminal-response record.                                                                                                                                                                                                                                                        |
| Terminal journal / before DB bookkeeping            | Only replay sealed exact proof with reviewed provider guarantee; then capture/seal readback observation before IO_QUIESCENT.                                                                                                                                                                                                      |
| DB quiescence / before semantic FINAL               | Recover previously sealed proof/time and perform current admission/bases CAS. New read after io_finished_at cannot be backdated; use a legitimately admitted fresh generation if new proof is required.                                                                                                                           |
| Duplicate worker start                              | Single Representation owner exclusion plus C-I3D exact phase/generation/UUID CAS rejects parallel staging/parser and dispatch; same principal alone confers no recovery proof.                                                                                                                                                    |
| Response loss                                       | Owner can retain its own terminal record only if response actually observed; missing owner/provider evidence stays UNKNOWN.                                                                                                                                                                                                       |
| Matching existing object                            | Byte identity after actual read only; collision is not old-writer terminality or parser proof.                                                                                                                                                                                                                                    |
| Mismatching existing object                         | Integrity incident/quarantine; never overwrite/delete/repoint; UNKNOWN protection remains if old attempt still uncertain.                                                                                                                                                                                                         |
| Old attempt completes after restart                 | Validate original identity/epoch evidence; may resolve that still-current UNKNOWN only with trusted proof. Reject old completion after a legitimately advanced generation; never use generation advance to fence an unproven remote writer.                                                                                       |
| Admission lost mid-I/O                              | Operational trusted bookkeeping may complete under original execution identity; semantic finalization still requires current acquiring owner + read/write admission.                                                                                                                                                              |
| Parser/staging failure before provider              | No provider I/O. Retain protected attempt until trusted exact process/no-dispatch proof and approved disposition; retry resolves existing operation/phase, never allocates parallel writer. Missing terminal rejection adapter stays PENDING/BLOCKED.                                                                             |
| Parser crash/timeout or oversized IPC               | Non-VERIFIED; parent survives, kills/joins worker and verifies terminality before scratch removal; required main staging/provider references remain protected.                                                                                                                                                                    |

## Decision matrix and local preflight evidence

| Item                                                                                                                                         | Status                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Nonroot/read-only/no-network/no-credential probe boundary                                                                                    | PROVEN locally with cached image; network attempt to TEST-NET address denied ENETUNREACH.                                    |
| Wall/CPU/cgroup-memory/FD/PID/file/output controls                                                                                           | PROVEN locally for synthetic probes; deployment/real-decoder resistance PENDING.                                             |
| Worker abnormal exit or malformed IPC fails closed; exact worker terminal check before cleanup                                               | PROVEN locally. Initial probe's empty IPC exception was corrected; final malformed-IPC probe rejects without parent failure. |
| Exclusive ownership before staging/parser, loser zero-work, pre-dispatch crash/failure, exact CAS and phase-aware retry/final/cleanup denial | PROVEN deterministic model checks only, not DB/provider guarantees.                                                          |
| Credential-free decoder architecture and single durable execution owner                                                                      | Design-selected; runtime provisioning/journal implementation PENDING.                                                        |
| PDF/JPEG/PNG/HEIC/HEIF approved actual parser profiles                                                                                       | BLOCKED, no reviewed decoder dependencies installed.                                                                         |
| Durable provider post-crash terminality; safe IO_UNKNOWN retry                                                                               | BLOCKED; supplier/adapter terminality component absent.                                                                      |
| Durable multi-worker staging/quota and authenticated Account isolation                                                                       | PENDING; C-I3E local mechanism is not production identity proof.                                                             |

Final preflight: **23/23 Node tests** (10 sandbox probes + 12 completion-model cases + parent). Crash exits nonzero; malformed exit-zero IPC maps to PARSER_PROTOCOL;
busy CPU killed, memory OOM explicitly observed, flood output killed, FD EMFILE,
file EFBIG and PID exhaustion denial observed. Every container was inspected
stopped before removal; all dedicated containers and temporary input/evidence/
log files removed. No provider request, DB credentials, SQL mutation or runtime
activation occurs. Completion model intentionally assumes a supplier guarantee
only in named model cases; it cannot prove durability, failover exclusion or
Supabase terminality and is never imported by Backend/Mobile.

Scoped ESLint/format/whitespace and baseline byte checks pass. Existing C-I3E
report/harness, all 71 server migrations, SQLite registrations 44→45, existing
manifest/verifier and all product implementation remain unchanged. No full SQL
or product regression rerun is claimed for this contract-only checkpoint.

## Proposed next implementation slice and activation blockers

Next separately approved slice: implement the **credential-free offline parser
worker/profile protocol first**, select reviewed decoder versions for a bounded
format subset without declaring other formats accepted, and run valid/invalid/
polyglot/bomb/crash/adversarial resource fixtures under pinned OS bounds. Freeze
per-format recognition, decode coverage and numerical limits only from that
evidence. Main staged originals remain immutable; no upload route or Source
command activation follows from parser-only completion.

In parallel, obtain a provider/deployment terminality contract or implement an
audited provider-side attempt ledger/fencing adapter; then separately implement
the single durable owner, fsync journal, trusted completion producer and real
crash/restart reconciliation tests. Test proof-time ordering and typed failure
disposition against unchanged C-I3D before provisioning any capability.

Activation remains blocked on all-format safe verification (or separately
approved scope restriction), exact provider terminality, safe UNKNOWN recovery,
durable authenticated owner/staging/quota, protected evidence producer and
reviewed runtime capability provisioning. No purge/redaction inference is made.

- Source commands enabled: **NO**.
- C-I3D gate open: **NO**.
- Product upload route: **NO**.
- Runtime credentials: **NO**.
- Purge/redaction: **NO**.
- Production/Hosted Dev: **NO**.
- Sibling modifications: **NO**.
- Commit: human-authorized task-only commit; no push.

**STOP — HUMAN PASS / ACCEPTED / CLOSED.**
