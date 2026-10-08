# Platform P2 / Capture C4a implementation report

Date: 2026-10-08 (Pacific/Auckland). Status: **IMPLEMENTED / STOP FOR INDEPENDENT REVIEW**.

## Scope and provenance

Owner authorization supersedes the attached document's earlier planning-only scope
for this pure C4a slice. The implementation follows the ten numbered constraints
and explicit boundaries in the authorization. The separate text of Capture's five
corrections was not supplied; this report does not invent their wording or claim
verification of an unseen artifact. The listed binding implementation constraints
are the executable acceptance basis here.

Fresh worktree: `/private/tmp/otr-p2-c4a-pure-assessment-20261008`.
Branch: `codex/p2-c4a-pure-assessment-20261008`.
HEAD, canonical `main`, cached `origin/main` and requested base are exactly
`b6daffecedab1616b173fde3f5e2de5d54770eff`. No fetch, commit or push.
The existing P2 preflight remains unchanged at
`/private/tmp/otr-p2-c4-semantic-preflight-20261008`.
No C2 implementation was taken from parallel worktrees as accepted evidence.

## Delivered delta

| File                                                 | Purpose                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `src/domain/capture/batchAssessment.ts`              | Pure strict schema validation and deterministic read-only assessment |
| `src/domain/capture/__fixtures__/batchAssessment.ts` | Synthetic C2 contract fixtures and test-only SHA-256 sealing         |
| `src/domain/capture/batchAssessment.test.ts`         | 64 focused positive/negative cases                                   |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`               | Short isolated C4a checkpoint handoff                                |
| This report                                          | Independent review evidence and limits                               |

No existing implementation file changes. No dependency or configuration changes.
No runtime caller, repository writer, provider, scheduler, network transport,
UI/Activity component or durable state was added.

## Contract and minimum handoff

`assessCaptureBatch(raw, sha256)` accepts a strict manifest, processing snapshot and
caller-supplied current pins. Hashing uses the existing CP13B `ImportHash` seam and
`importDigest`, with the existing canonical JSON implementation. Production-domain
code does not import Node crypto; fixtures use Node's standard library.

The immutable intake manifest carries separate Account/Batch/Job identities,
submission and per-Input replay keys, frozen sequential ordered Input roster,
explicit continuation references, context snapshot/digest and passive Trip prior.
It is hashed independently with `otr-capture-intake-manifest-v1`.

The separate processing snapshot carries the exact manifest version/digest,
assessment revision, every declared Input's observed revision, acquisition facts,
processing disposition, accepted original Capture/payload/revision/digest/size,
and bounded Run generation/Input mappings. Each mapping carries Account/Batch,
original digest and existing CP13B `flightInputSchema` Source/Representation pins.
It also retains findings, explicit dependencies, human decision receipts and
historical evidence pins. Its digest uses `otr-capture-processing-snapshot-v1`.
The current header fences Account, Batch, Job, both digests, manifest/assessment
revisions and complete per-Input revisions.

This is a synthetic domain contract, not a new installed C2 repository API.
The later adapter must supply trustworthy retained/current pins, current Account
invocation authorization, original custody and Run publication membership. This
pure function verifies supplied associations and digest consistency; it cannot
prove original payload bytes, reconstruct Run input-set hashes from absent Run
publication data, check permissions or validate historical continuation ancestry.
It rejects continuation references into the current roster and leaves historical
same-Account lineage validation with its existing custody owner. Trip prior
provides no assignment or domain authority.

## Coverage and dependency behavior

- Every declared Input must occur exactly once in the snapshot and current revision
  vector. Missing, duplicate, foreign, cross-Batch and cross-Account mappings fail.
  Run Input IDs have one declaration owner; one declaration can map to several
  Runs, and several declarations can support several candidates in a shared Run.
- Acquisition `FAILED`, `PENDING` and `UNKNOWN` are distinct from accepted
  processing `FAILED`, `UNSUPPORTED`, `DEFERRED`, `PENDING` and `UNKNOWN`.
  Unaccepted acquisition requires `NOT_APPLICABLE` processing and no Run bindings.
  Accepted `UNDERSTOOD` requires retained Run bindings.
- Each finding must explicitly cover the whole roster with `DEPENDS_ON`,
  `INDEPENDENT` with understood evidence, or `UNKNOWN`. Missing data never implies
  independence. A finding cannot disclaim dependency on its own supporting Input.
  Evidence locators must resolve understood mapped pins; text spans must be
  nonempty and within pinned bytes. Existing CP13B locator schemas validate the
  other locator shapes.
- Uncertain or failed dependent material produces explicit finding barrier reasons.
  Explicitly supported independent read-only findings remain visible. Independence
  is a supplied evidenced semantic assertion; C4a does not interpret evidence or
  generate that assertion. A future CP13B-backed adapter must establish it.
- Input-level operational uncertainty yields the aggregate `PENDING` barrier.
  Fully accounted known failures/unsupported/deferred observations can yield
  `ASSESSED_READ_ONLY`; that value means accounted read-only observation, never
  successful understanding of all material or action permission. Unknown semantic
  dependency still blocks the affected finding even without operational pending.
- Only a supported semantic question without an existing decision may expose
  `AVAILABLE_READ_ONLY` provisional Review metadata. Operational waits generate no
  questions. All findings always return `matureActionableAttention: false`.
  Every result always returns preparation and domain admission `NOT_AUTHORIZED`.
  There is no timeout, settling heuristic, retry clock or optimistic absence rule.

## Reuse and authority preservation

Reused existing `captureIdSchema`, revision and SHA schemas, Capture byte ceiling,
CP13B `flightInputSchema`, `flightLocatorSchema`, the candidate identity/hash subset
of `flightClosureCandidateSchema`, `importDigest` and canonical JSON. No second
interpretation engine or matching/resolution policy was introduced. CP13A and
SQLite49/50 remain untouched; no preparation/publication functions are called.

Decision IDs/revisions/proposal and decision hashes remain explicit retained
receipts. An existing answer suppresses repeated provisional questions. A changed
proposal against retained decision evidence yields `HUMAN_DECISION_CONFLICT`;
C4a neither rewrites nor supersedes that decision. Historical same-Account evidence
is retained, including evidence from earlier batches; it grants no current mapping
or action authority. Conflicting Candidate identity pins and Run generation/hash
associations fail validation.

The returned result is strict-schema validated and recursively frozen. Zod clones
and the module freezes its observation before awaiting hashing, preventing caller
mutation during the hash seam from transplanting the result. Coverage/reasons
follow roster order; findings and decisions use stable identity order. The exact
wire snapshot digest intentionally changes when supplied array ordering changes,
while derived coverage/finding ordering remains deterministic.

Finite ceilings: 64 declarations, 64 aggregate current Run bindings, 64 findings,
64 dependencies/locators per bounded list, 64 retained decisions/history groups,
and a 1 MiB canonical request ceiling before hashing. Existing schemas enforce
safe finite integer revisions/byte counts and valid IDs/digests. Invalid requests
reject with a Zod validation error or explicit `C4A_*` invariant error; partial
invalid results are never returned. Per-Input/finding barrier reasons are finite
schema enums rather than free-form actionable messages.

## Validation executed

| Check                                                            | Result                                         |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| Focused Vitest: new C4a, existing local Capture and CP13B Review | 3 files / 88 PASS: 64 new + 24 existing        |
| `npm run typecheck`                                              | PASS                                           |
| `npm run lint` including UI guard                                | PASS; UI guard checked 78 representative files |
| Prettier on all five delivered files                             | PASS                                           |
| Tracked whitespace and new-file whitespace                       | PASS                                           |
| Exact base / canonical and cached remote refs                    | PASS                                           |
| All 1,186 baseline tracked file bytes before handoff edit        | Identical to base                              |
| Final baseline bytes excluding the documented handoff            | Identical to base                              |

Focused command:

```sh
npm run test -- --configLoader runner --cache=false \
  src/domain/capture/batchAssessment.test.ts \
  src/domain/capture/localCapture.test.ts \
  src/domain/trip/flightImportReview.test.ts
```

Coverage includes N-to-M candidate support, one Input across multiple Runs,
partial acceptance, all acquisition and processing dispositions, explicit unknown
versus evidenced independence, entirely failed intake, preservation of answered
and contradicted decisions/history, stale manifest/assessment/Input revisions,
malformed IDs/digests, malformed/foreign evidence, duplicate/inconsistent mappings,
Account A→B→A, cross-Batch mapping rejection, nonfinite and bounded inputs,
deterministic order and caller mutation during hashing.

Baseline failures: **none observed in the executed code checks**. The initial
standard bundled-config test startup encountered sandbox `EPERM` in the reused
installed dependencies' `.vite-temp` directory. Using Vite's supported config runner
with cache disabled passed without editing config or dependencies. This was a
local test harness permission limitation, not a baseline test failure. No full
suite, SQL, Hosted, network, device or integrated C2/C4 acceptance is claimed.

## Preservation and stop gate

Content fingerprints cover Git porcelain status, tracked binary diff against HEAD
and sorted untracked paths/content; newly observed symlinks use link-target bytes.
Ignored artifacts are outside this check. All protected HEADs remain at the base.
Canonical main, P2 preflight and P4 design fingerprints remained identical.
C2, R3 and P4a contents changed concurrently, so their byte-for-byte preservation
cannot be claimed. This builder made no writes or agent messages to those
worktrees and consumed none of their drift. Before/after evidence is saved locally
in `/private/tmp/otr-c4a-preservation-before.json` and
`/private/tmp/otr-c4a-preservation-after.json`.

Only the three new dormant domain/test files, this report and the current-state
handoff are delivered. All existing runtime source, SQLite/server migrations,
repositories, sync, C2, R3, P4 and production configuration are untouched by this
builder. No SQLite52/Server85, Source/Run publication, CP13A preparation, C5
confirmation, Event/Person/Booking/Ledger command, Hosted access, activation,
commit or push occurred.

**STOP: ready for independent C4a review. Integrated durable C4 and C5 require
separate authorization and accepted current C2/custody/publication adapters.**

## R1–R2 targeted correction addendum — 2026-10-08

**Current status: CORRECTIONS COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**
This addendum supersedes the original report's independence-promotion behavior and
object-input acceptance claims. The original report above remains historical
Builder evidence; the Independent Review remains byte-for-byte unchanged.

### Authorization and current Capture constraints

Authority: the current Owner message, **OWNER AUTHORIZATION — P2/C4a R1–R2
TARGETED CORRECTIONS**. The five constraints are now explicitly supplied by the
Owners and recorded as current constraints, not a fabricated historical artifact:

1. Complete truthful Input coverage and distinct acquisition/processing failure.
2. Dependency-aware UNKNOWN blocking without implicit partial admission.
3. Exact C2 identity and immutable manifest/snapshot binding.
4. Provisional Review only; no premature admission or overwrite of human decisions.
5. Local-first Hide/Reopen continuity; no timers, user Retry ritual or Hosted dependency.

The historical review's unavailable-artifact statement accurately records its own
review-time evidence. This addendum does not rewrite it or certify past evidence.
Constraints 1–4 retain their schema, coverage, digest/revision and denial checks;
R1 closes the semantic-label loophole. Constraint 5 is preserved through the absence
of timers, retry controls, Hosted dependencies or intake/Job lifecycle mutation.
This slice adds no Hide/Reopen UI or durable implementation and claims no new
integration acceptance of that continuity.

### R1 — conservative dependency closure

Reproduced the original reviewer script before edits: an unavailable Input B changed
from `UNKNOWN` to `INDEPENDENT` with an Input A locator promoted a finding to
`SUPPORTED_READ_ONLY` / `AVAILABLE_READ_ONLY`. That behavior was unsafe.

The corrected closure treats every caller-supplied `INDEPENDENT` declaration as
unproven and adds `DEPENDENCY_UNKNOWN`, exactly as for an `UNKNOWN` relation.
Structural locator validation remains necessary but grants no independence.
The finding's observed evidence remains visible, with `BLOCKED` dependency state
and `UNAVAILABLE` provisional Review. Fully understood Input data also cannot turn
a declaration into semantic independence. Fully explicit, understood `DEPENDS_ON`
coverage retains the existing positive behavior; no new interpretation engine,
policy callback or runtime authority was added. All preparation/domain admission
denials and `matureActionableAttention: false` remain unconditional.

Unsafe positive partial-acquisition/processing expectations were replaced by
negative assertions. New regression cases compare the exact reviewer
UNKNOWN→INDEPENDENT substitution and reject promotion even with fully understood
material. Retained observations remain provisional, not certified independent
semantic findings. Human decision receipts/history are untouched.

### R2 — strict serialized input grammar

Reproduced both original R2 cases before edits: hidden `authorize` and symbol
`authorize` fields disappeared during schema parsing and were accepted.

`assessCaptureBatch` now accepts **primitive JSON text only** at its raw boundary.
This is an intentional input-contract change from raw objects. The module rejects
all raw objects before inspecting/coercing them, including ordinary objects,
objects containing nested hidden/symbol fields, accessors, custom prototypes,
classes, arrays and transparent/trapping/revoked Proxies. It invokes no object
getter, proxy trap or hash callback during those rejections. Strings wrapped in
objects also cannot enter. No Node-only proxy inspection was added to mobile
`src/domain`; the backend host's `node:util` inspection is unsuitable for that
portable boundary. The recommended JSON-text option was presented to the Owner
and adopted as the stated default after the optional preference window.

The established `parseEventJson` strict lossless parser is reused before Zod or
hashing. It rejects duplicate members at any nesting level, malformed/trailing
JSON, nonfinite/fractional/exponent/negative-zero number spelling, invalid strings,
and excessive depth. A 1 MiB raw UTF-8 ceiling is enforced before parsing; the
existing canonical request bound remains. Strict schemas then reject enumerable
unknown wire keys and validate exact fields and types. Manifest/snapshot digest
namespaces and current pins remain unchanged.

Valid plain contract fixture data is accepted after `JSON.stringify` at the test
caller, preserving all existing semantic/digest checks. Only test callers exist;
no installed runtime caller needs migration. The fixture itself is unchanged.
The function does not certify a caller's pre-serialization object: future adapters
must serialize their owned data and must not use serialization to launder an
untrusted object into a trusted observation. No adapter, provider or new authority
was implemented in this correction.

### Reproduction and validation

Before correction, the unchanged reviewer script
`/private/tmp/otr-c4a-independent-negative.mts` completed its 16 checks and explicitly
reproduced R1 and both R2 cases. Its successful exit was reproduction, not a fix.
A separate Builder-owned copy at
`/private/tmp/otr-c4a-r1-r2-targeted-recheck.mts` adapts valid calls to JSON text and
changes the defect expectations to blocking/rejection. Its **16 checks PASS**,
including both hash-await mutation protection and the original rejection cases.
The original reviewer script and Independent Review were not edited; this is
Builder regression evidence, not a new independent reviewer verdict.

| Validation                                             | Result                                              |
| ------------------------------------------------------ | --------------------------------------------------- |
| Focused C4a tests                                      | **87 PASS**, including 2 new R1 and 21 new R2 cases |
| C4a + existing Capture + CP13B Review + sync denials   | **4 files / 135 PASS**                              |
| `npm run typecheck`                                    | PASS                                                |
| `npm run lint`, including UI guard                     | PASS; 78 representative UI files                    |
| Prettier on changed files and unchanged fixture/review | PASS                                                |
| Whitespace on tracked and untracked deliverables       | PASS                                                |
| Original Builder report prefix preservation            | PASS                                                |
| Independent Review SHA-256 preservation                | PASS                                                |
| Baseline tracked source/migration preservation         | PASS; only documented handoff differs               |

Commands executed:

```sh
node --import tsx /private/tmp/otr-c4a-independent-negative.mts
node --import tsx /private/tmp/otr-c4a-r1-r2-targeted-recheck.mts
npm run test -- --configLoader runner --cache=false \
  src/domain/capture/batchAssessment.test.ts \
  src/domain/capture/localCapture.test.ts \
  src/domain/trip/flightImportReview.test.ts \
  src/data/sync/syncEngine.test.ts
npm run typecheck
npm run lint
```

Baseline failures: none observed in executed checks. No full suite, SQL, Hosted,
provider, device, integrated C2/C4 or runtime Account-generation acceptance is
claimed. Existing dependencies were temporarily reused through a local symlink,
with runner config loading/cache disabled; the symlink is removed from delivery.

### Preservation and final gate

Resumed worktree HEAD remains exactly
`b6daffecedab1616b173fde3f5e2de5d54770eff`. Canonical main and cached origin/main had
already advanced to `4f97bb6f96daaab7f96f19d192683f63846a413b` before this correction;
that external advancement was neither incorporated nor changed. No fetch/rebase.
Only the domain module, its tests, this append-only report and current-state
handoff were edited. The fixture and Independent Review remain unchanged.
Independent Review SHA-256:
`5e268bc64440e3a4ba2898e4691f34aa3884d3bb2b5dd86787b2eee1f1e53730`.
Before hashes and protected-worktree fingerprints are retained at
`/private/tmp/otr-c4a-r1-r2-before.json` and
`/private/tmp/otr-c4a-r1-r2-protected-before.json`; after evidence is retained beside
them. All six protected-worktree HEAD/content fingerprints were unchanged across
this correction: canonical main, P2 preflight, C2, R3, P4 design and P4a.
Baseline verification checked all 1,186 tracked files; 1,185 remain identical and
only the documented current-state handoff differs. The fixture and review hashes,
original report prefix and delivered-file whitespace checks all passed.

No C2 repository edit, migration, CP13A/B change, Hosted access, provider call,
scheduler, runtime activation, integrated C4/C5, commit or push.

**STOP — C4a R1–R2 CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**

## Final Owner closure authorization — 2026-10-08

Current Owner message: **FINAL OWNER REVIEW PASS — AUTHORIZE P2/C4a CLOSURE COMMIT.**
The original Independent Review and its appended **TARGETED R1–R2 RECHECK PASS**
remain preserved. Closure validation reran **135 focused tests**, **16 Builder
checks** and **25 independent targeted checks**, all PASS, alongside typecheck,
full lint/UI guard, formatting, whitespace and historical source/migration
preservation. The current-state handoff records Owner acceptance.

The authorized local commit contains only the C4a module, synthetic fixture, tests,
Builder report, Independent Review and handoff. No push, merge/rebase, main
advancement, C2 edit, migration, Hosted access, deployment, provider activation or
integrated C4/C5 is authorized by this closure.
