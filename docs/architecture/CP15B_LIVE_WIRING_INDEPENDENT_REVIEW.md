# CP15B-LIVE-W — Independent live wiring review

Date: 2026-10-07 (Pacific/Auckland). Review only.

**PASS WITH REQUIRED CORRECTIONS**

**New findings: 0 CRITICAL, 1 IMPORTANT. Ready for Final Owner Review: NO.**

Normal startup remains CLOSED; no unauthorized or duplicate provider handoff was demonstrated. The real-capable composition rejects TEST/PRODUCTION and retains Server84's fresh mark as its durable dispatch authority. However, private filesystem custody does not reject symlinked parents or replacement of its configured directory. Correct F1 and independently recheck before final acceptance. LIVE-1 remains unauthorized.

## Scope and independently preserved inputs

Reviewed worktree: `/private/tmp/otr-cp15b-live-wiring`; branch:
`intelligence/cp15b-live-wiring`; retained HEAD and accepted base:
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f`. The reviewed implementation includes
its pending tracked diff and new files, not HEAD alone.

Read the LIVE-W Builder report, exact implementation/deployment/test diff, LIVE-0
readiness in its retained worktree, accepted CP15B implementation and independent
review including the appended F1–F4 recheck, Server84, CP14 Final Closure including
its correction recheck, CP13A/B, current-state and relevant contracts/runbooks.
Historical superseded findings were distinguished from accepted corrections.
Builder YES answers were not used as independent test evidence.

An external disposable source copy, `/private/tmp/otr-live-w-independent`, retained
the reviewed bytes for testing. Review probes and adapted disposable-database
scripts exist only outside the review worktree. All delivered inputs were compared
again with that copy before report creation; there were zero differences. Entry
hashes are retained at `/private/tmp/live-w-review-entry-hashes.json`. Builder report
SHA-256: `7bd2a7fb71f449f6bd007e35c2a1aa5069447f553e70f4e94bc9c86469dd8d5d`.

Independently compared every Server migration and all `src/data/db` tracked files
with the accepted base: zero differences; Server count84; SQLite registry tail50.
All88 preservation-manifest entries match. Server84 SHA-256 remains
`46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
No Server85, SQLite51, new scheduler, canonical authority or dispatch authority.
The central queue and five unconditional C denials are byte-preserved and their
regressions pass. Only this report is added by the review; implementation, Builder
report and current-state are unchanged. No commit/push/deployment.

## F1 — IMPORTANT: custody path identity is not anchored

Location: `backend/src/flightPrivateCustody.ts:30–52,67–100`, shared by request,
response, result-index and acceptance custody.

`resolve(directory) === directory` checks lexical normalization. `lstat(directory)`
checks only the final component's owner/mode/type. Parent symlinks are followed;
parent permissions/identity are not checked. `O_NOFOLLOW` likewise protects only
an opened final component. Every operation resolves the pathname again, and
`checkRoot` accepts any new private directory owned by the process user. No retained
root device/inode or equivalent stable mount identity fences replacement.

Two independently executed defect witnesses:

1. Create a private real directory with a private `custody` child, then a symlink
   `alias` pointing to its parent. Construct custody at `alias/custody` and put
   synthetic private bytes. Construction and put succeed; the file appears through
   the real parent. The configured path's parent symlink is not rejected.
2. Put bytes X under Account A/reference R; rename the configured private directory
   away and create another mode0700 directory at the same path. Using the **same
   custody instance**, put different bytes Y under A/R with Y's correct hash/length.
   The second put is acknowledged and reads back Y. Both conflicting immutable
   associations have been accepted in different directory generations.

With a stable directory, exclusive hard-link installation correctly rejects
conflicting duplicate puts. That does not protect the namespace across replacement
or parent retargeting. The affected bytes can include raw evidence and responses;
retained acceptance/result bindings can disappear or be substituted by the new
namespace. This violates the requested directory-replacement/symlink-parent
fail-closed boundary. The comment declaring parents trusted and the runbook's
instruction not to replace the mount do not provide an enforced rejection.

**Required correction:** validate the configured custody path and parent trust
boundary without following parent symlinks; anchor operations to an admitted stable
private directory/mount identity, and fail closed on replacement/retargeting,
including across the supported restart boundary. Avoid check-then-use path races.
Add runnable parent-symlink, unsafe-parent, directory-replacement and concurrent
replacement checks. Preserve existing fsync, immutable association, content hash,
owner/mode and no-ephemeral-fallback behavior. Reconcile the custody assurance in
the implementation documentation after correction.

This finding does **not** demonstrate a second provider send, a new SQL authority,
or a credential leak. Server84 still rejects a second fresh mark for the retained
call. A filesystem-boundary correction is required; no Server85/SQLite51 or dispatch
architecture redesign is justified by this finding.

## Boundary results

| Area                       | Independent result and practical limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal startup             | Seven environment combinations constructed the actual `server.ts` startup with its HTTP listener intercepted: no new env, transport only, fake secret only, custody only, trusted-session refs, malicious environment flags, and combined host flags. All reached normal listening construction with zero DeepSeek-secret reads. Direct module import and unprovisioned initializer likewise read no secret. Existing FX scanner requests were intercepted/denied, never sent. No live-AI configuration crash loop.                                                       |
| TEST / PRODUCTION          | Manually enabled construction and resolver reject both environments before transport. Actual Server84 structural CHECK/runtime-command denials independently pass. Calling DEV construction with a non-DEV verified host or SQL identity cannot override those checks.                                                                                                                                                                                                                                                                                                    |
| Trusted gateway            | No synthetic verifier import/default, service-role fallback, public RPC transport or direct business-table write is installed. Provisioning remains an explicitly trusted issuer/connector/workflow dependency. Wrong session role, environment, primary attestation, session reference, Account, request or workload session is denied. Existing gateway snapshots/digests bind requests; protected SQL roots remain authoritative. This is not provenance certification of an arbitrary injected verifier.                                                              |
| Secrets                    | Dedicated logical ref/provider/DEV/current-host checks pass. Missing, blank, whitespace, control characters, non-ASCII, oversized, rotated and revoked fake values deny. Wrong logical ref/provider/environment/Account deny. Final synchronous currentness checks and post-mark checks contain environment mutation. Tests supply fake getters; no developer-machine key is consumed. No tested key appears in logs, custody, reports or safe readback; Authorization is the private handoff.                                                                            |
| HTTPS                      | Fixed `https://api.deepseek.com/chat/completions`, POST, `redirect: error`, no SDK/retry loop. Returned redirects/destination changes, oversized responses, connection/response loss, excess chunks and timeout are contained. Deadline abort produces UNKNOWN and no repeat. Response errors are finite/redacted. The valid minimized envelope bounds the request; response is bounded at131072 bytes and1024 chunks, with a maximum30-second live deadline. Actual remote TLS/provider behavior was intentionally not exercised.                                        |
| Request custody            | Stable-root UUID/hash/length/size/owner/mode, final symlink-file and conflicting duplicate checks pass. Twelve concurrent equal puts agree; competing different contents produce one winner. Missing/relative/traversal/nonprivate roots deny. F1 prevents an unconditional safety claim. No missing-directory creation or ephemeral fallback.                                                                                                                                                                                                                            |
| Response custody / crashes | Partial writes and failure before file fsync produce no acknowledgment or installed material. Private orphan temporary files can remain after these failures; they are not indexed recovery content. Corrupted/truncated content, wrong association/hash/length and changed bytes deny recovery. Raw response precedes interpretation/usage; interruption before interpreted-index retention recovers by exact parsing/rebinding without sending. F1 also affects this store. These are process/I/O-failure probes, not physical power-loss testing of a deployed volume. |
| One-shot / restart         | Passive restart before mark sends zero. Lost mark ACK, committed mark followed by simulated death, possible execution, lost response, retained response, reset host latch, duplicate roots and existing queue/UNKNOWN regressions do not resend. Actual separate SQL connections concurrently mark the same call: one successful ACK. Server84 CAS, not the local latch, supplies authority. Unprovable actual send after mark stays UNKNOWN.                                                                                                                             |
| Kill / revoke races        | Host gate/one-shot/key changes after mark prevent handoff while retaining UNKNOWN. Pre-mark kill/config/scope/grant/budget/Trip denials and executing-pin substitutions pass. Actual owner/membership revoke-versus-mark barriers, rollback and concurrent kill/revoke/mark pass without deadlock. A→B→A and post-custody current disclosure/installation fences pass. No post-mark kill is interpreted as proof of provider nonexecution.                                                                                                                                |
| Model witness              | Exact `deepseek-flash` and `DeepSeek-V4.1-Flash` accept. Missing field, null/blank, alternate models, arbitrary/oversized text, case/whitespace variants and future alias-like strings reject. Rejection retains reported usage, prevents interpretation/install and does not retry; safe readback redacts the rejected value.                                                                                                                                                                                                                                            |
| Policy staleness           | The compiled version is a mutable-alias conformance witness, not immutable weights or live family discovery. The ADR/runbook require current official model/family/currency/pricing revalidation before LIVE-1; Server84 has separately expiring, versioned selected scopes. This operational boundary is present. The boolean policy marker is not an automatic expiry or proof of current provider weights; this review performed no external revalidation and grants no future activation.                                                                             |
| Safe readback / privacy    | Host readback reauthorizes after custody awaits and returns finite status, opaque IDs, accepted model witness, hashes/lengths and nullable usage. Rejected raw model/private errors stay out. Private recovery APIs intentionally return authorized evidence; they are not public operator readback routes. Existing Admin/Recovery and explicit operator-only SQL projections add no grants. Changed production code has no private payload/Authorization logging or generic serialization into telemetry.                                                               |
| Deployment                 | Examples are disabled/empty. Normal startup supplies no provisioning. Optional persistent bind mount is separate from static/public paths; it is not enabled by default. Dockerfile copies source/bundle, not env files or keys; no Production provider configuration is added. Backend bundle builds. Image construction was not run because its `npm ci` would require unavailable network/package provisioning; no deployed mount or image-layer inspection is claimed.                                                                                                |
| Accepted authorities       | CP15B F1–F4, old-CP14 denial, monetary/budget/UNKNOWN restrictions, inbound/outbound firewall and CP13A/B regressions pass. Interpretation creates no Event command. No adjacent provider, Vision, Apple, shadow, fallback or public inbound activation.                                                                                                                                                                                                                                                                                                                  |

## Network-denied E2E and real SQLite evidence

The delivered optional E2E was independently executed against **actual Server1–84
protected roots** in a newly created, task-owned cached-image PostgreSQL container,
`otr-live-w-server84`, with network none and no published ports. The production
composition, resolver, filesystem custody, transport wrapper and CP13B core ran;
only the HTTP boundary was injected. One call, START, hold and fresh mark produced
exactly one intercepted send. The companion fixture assertions verify:

```text
Flight=ZZ901; operating=YY902; route=AKL→CHC; date=2027-02-03; dep=~10:30; arr=12:00
SHA256 2c9b62e82d6740911fea8f61b18e27171a91a1ed79057de728b71ba0effd1a27
six exact spans; eight observations; one Candidate
ZZ901 MARKETING / YY902 OPERATING
departure 2027-02-03 10:30 ESTIMATED
arrival 12:00 EXACT, date null
zones/independent instants unresolved; no Event command/private passenger facts
schedule-derived cost ESTIMATED; missing usage UNKNOWN
```

The optional E2E's owning repository is synthetic; its install spy is **not** proof
of SQLite durability. Separately inspected and independently reran all nine
`CP15B F1 SQLite50 cold recovery` cases on real file-backed `node:sqlite`, actual
migration50 and `createIntelligenceContinuationRepository`. They verify exact
retained task/attempt/result association after close/reopen, current disclosure,
Account generation and Trip/material fences, real repository installation state,
retained responsibility after denial and clean FK checks. The full suite also runs
the remaining real SQLite continuation/installation and CP13B persistence tests.

**Real SQLite50 recovery independently verified: YES.** This is owning continuation
recovery/installation evidence, not a claim that the synthetic optional E2E itself
persisted its LIVE-0 Candidate through a fully provisioned Mobile/Backend workflow.
Actual issuer, dedicated SQL connector and owning-workflow deployment remain
unprovisioned LIVE-1 prerequisites.

## Independently executed validation

All Node execution used `/private/tmp/live-w-review-deny.cjs`: global fetch,
external DNS resolution, UDP and TCP—including localhost forwarding—denied.
Localhost/numeric address lookup is answered in memory for Vite configuration;
no DNS request is made. Unix IPC remains available for local tools. Explicit
negative controls verified these denials. HTTP fakes are injected into composition,
not allowed through global networking. Database tests use Docker Unix IPC and
network-none containers only; no Hosted Dev/Production connection or real credential.

| Check                                                        | Result                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Delivered LIVE-W full suite                                  | 203 files;2609 PASS,1 shared Ledger failure,1 optional skip                                                                          |
| Exact-base full suite, same dependencies/denials/thread pool | 202 files;2577 PASS,1 same Ledger failure                                                                                            |
| New full-suite failures                                      | **0**                                                                                                                                |
| Review-owned adversarial probes                              | **53 PASS**, including two explicit observed-F1 defect witnesses; these passing witness assertions document unsafe accepted behavior |
| Actual server startup/import and network-denial controls     | PASS;7 startup combinations;0 live secret reads                                                                                      |
| Partial write / pre-fsync failure probes                     | PASS;no material acknowledgment/installation                                                                                         |
| Actual Server84 production-composition E2E                   | PASS;1 selected test;one intercepted send                                                                                            |
| Fresh exact1→84 replay                                       | PASS;defaults CLOSED                                                                                                                 |
| Server84 security acceptance                                 | PASS;104 checks;provider calls0                                                                                                      |
| F2/F3/F4 targeted protected-root matrix                      | PASS;124 checks;provider calls0                                                                                                      |
| Server83 compatibility on84                                  | PASS;548 checks including75 residual checks                                                                                          |
| Unchanged Trip/Event/Source/Flight SQL                       | PASS;841 checks, plus actual C1 UNKNOWN/C2/C3 shared-lock barrier                                                                    |
| Explicit actual SQLite50 cold-recovery run                   | PASS;9 cases;165 unrelated deselections                                                                                              |
| Typecheck                                                    | PASS on delivered source copy, excluding review probes                                                                               |
| Lint / UI guard                                              | PASS;473 existing legacy occurrences,76 representative UI files                                                                      |
| Backend build                                                | PASS                                                                                                                                 |
| Changed supported-file Prettier / whitespace                 | PASS;`.env` has no Prettier parser, checked by diff/inspection                                                                       |
| Source/migration/report preservation                         | PASS                                                                                                                                 |

The sole full-suite failure is
`src/domain/architectureBoundary.test.ts:41`, the existing
`LedgerExpenseDetailScreen.tsx` direct-data-import assertion. It reproduces both
in an isolated exact-base run and the complete exact-base suite. No LIVE-W failure
was reclassified as baseline. Initial review-runner restrictions on worker IPC and
an overly broad DNS stub were corrected in the **external harness**; neither was
an application defect or a relaxed test assertion. An attempted replay of an
already-used disposable DB hit retained role ACLs; it was recreated from the cached
image before the successful fresh security run. Existing containers were preserved.

Logs and runnable reviewer probes remain outside Git under `/private/tmp`:
`live-w-review-{full,base-full-final,adversarial-final,e2e,sqlite50,security,targeted,server83,cp13sql,typecheck,lint,build,format}.log`.
The probe file is
`/private/tmp/otr-live-w-independent/backend/src/liveWIndependent.test.ts`;
run with Vitest `--configLoader runner --pool=threads --maxWorkers=1` and the review
network-denial preloader. Recreate/replay a new network-none fixture for SQL runs.
Review-owned disposable containers were closed/removed after validation; retained
synthetic response directories were cleaned by their test owners.

## Required answers

| Question                                              | Answer |
| ----------------------------------------------------- | ------ |
| Server1–84 unchanged                                  | YES    |
| SQLite1–50 unchanged                                  | YES    |
| Server85/SQLite51 required                            | NO     |
| Normal unconfigured startup can send provider request | NO     |
| TEST live composition possible                        | NO     |
| PRODUCTION live composition possible                  | NO     |
| Secret can leak to logs/custody/readback              | NO     |
| Redirect can leak Authorization                       | NO     |
| Automatic transport retry exists                      | NO     |
| Synthetic verifier reachable from live composition    | NO     |
| Generic service_role shortcut exists                  | NO     |
| Private request custody safe                          | NO     |
| Private response custody safe                         | NO     |
| Restart requires provider replay                      | NO     |
| Second send possible after MAY_HAVE_STARTED/UNKNOWN   | NO     |
| One-shot host latch became dispatch authority         | NO     |
| Response model witness safe                           | YES    |
| Model mismatch can publish/install                    | NO     |
| Alias treated as immutable weights identity           | NO     |
| Raw private data exposed by readback                  | NO     |
| External provider/network request made by review      | NO     |
| LIVE-0 fixture production-composition E2E             | PASS   |
| Real SQLite50 recovery independently verified         | YES    |
| CP15B F1–F4 preserved                                 | YES    |
| Inbound/outbound firewall preserved                   | YES    |
| CP13B authority preserved                             | YES    |
| CP13A authority preserved                             | YES    |
| sync_operations sole scheduler                        | YES    |
| Five C denials unchanged                              | YES    |
| Full-suite new failures                               | 0      |
| New CRITICAL findings                                 | 0      |
| New IMPORTANT findings                                | 1      |
| Runtime/provider gates remain CLOSED                  | YES    |
| Ready for Final Owner Review                          | NO     |
| Ready for LIVE-1 provider call now                    | NO     |

No Hosted Dev/Production access, real secret provisioning/read, real DeepSeek call,
deployment, implementation edit, Builder-report edit, commit or push occurred.

**STOP — CP15B-LIVE-W INDEPENDENT REVIEW COMPLETE.**

## TARGETED F1 RECHECK — RECOVERED AFTER INTERRUPTED REVIEW

Date: 2026-10-07 (Pacific/Auckland). Replacement Independent Reviewer; review only.

**TARGETED F1 RECHECK FAIL — ARCHITECTURE REVIEW REQUIRED**

The interrupted review is not an accepted result. Its provisional observation was
independently reproduced from the current source. The original filesystem F1 is
fixed on the admitted Linux path, but the portable custody seam bypasses that path
and still constructs a real-network-capable DEV live composition. There is **one
new IMPORTANT finding, zero new CRITICAL findings**. Final Owner Review readiness
is NO; LIVE-1 remains unauthorized.

### Scope, interruption recovery and preservation

Reviewed `/private/tmp/otr-cp15b-live-wiring`, branch
`intelligence/cp15b-live-wiring`, retained HEAD/accepted base
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f`, including pending implementation files.
Read the corrected custody/host/executor/adapter, corrected tests and fixtures,
Builder report, original Independent Review, Linux spike, deployment/runbook/ADR
changes, Server84 and the accepted CP15B authority/recovery contracts.

The existing review ended at its original STOP. There was **no partial or incomplete
interrupted append to mark**. Its original bytes are preserved as the prefix of
this report, SHA-256
`513e77836ad6ea7b152356f6bed8c01dba04651ff0ecef81cd7ee08030f1d240`.
The interrupted session's external artifacts/results were not adopted as evidence.
A fresh source copy `/private/tmp/otr-live-w-f1-recovered` and fresh task-owned
containers were used. New reviewer assertions were written outside the source
worktree. The existing external Linux runner adapter was inspected and reused only
to register the unchanged test sources with Node's test runner and installed
Vitest assertions/spies; all bundles and results were rebuilt/rerun.

All 1,163 source-entry hashes were unchanged before this append. Builder-report
SHA-256 remains
`b87f5df16fb9170fad3a1e7c3df53dc296196ee7e1b2df40161a9792987a8830`.
All 88 accepted preservation hashes match. All 155 tracked files under Server
migrations, SQLite/data-db and sync match the accepted base byte-for-byte. Server
count/tail remains84, SQLite registry tail50, and Server84 SHA-256 remains
`46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
Only this append changes the review source. Implementation, Builder report and
current-state handoff remain untouched; no commit or push.

### Original filesystem F1 — FIX VERIFIED on the Linux admission path

The real store rejects unsupported platforms before filesystem access, checks
procfs, walks each component from `/` through retained parent descriptors with
O_DIRECTORY/O_NOFOLLOW, validates opened ownership/mode and holds the final FD.
All normal generated-leaf reads, exclusive creates, hard links, unlinks and directory
fsyncs use that FD. Parent/intermediate/root symlinks reject. Root pathname
replacement, parent retargeting, deterministic replacement during write/before
publication, and50 replacement cycles concurrent with50 put/read cycles do not
switch the admitted namespace. Deleted/nonprivate roots fail closed.

Thirty-two equal puts succeed;32 conflicting puts produce one immutable winner.
The observed acknowledgment order is file fsync → directory fsync → temporary
unlink/directory fsync → ACK. Partial write, file fsync and directory fsync failures
never acknowledge. Acceptance/raw/result indexes retain the same anchor and exact
immutable associations. These are process/I/O-fault tests, not physical power-loss
or privileged mount-administrator tests.

Fresh child processes use separately supplied trusted expected identity and request
pins, with no inherited parent store handle. The original store admits and reads;
empty replacement, copied-marker replacement, wrong external UUID and missing
retained request deny. Reviewer-written independent vectors additionally reproduce
these results against the freshly bundled production custody module. A copied marker
cannot satisfy the old independently supplied device/inode expectation. Reboot or
restore still requires the documented explicit host reattestation; no broader
continuity assurance is inferred from dev/inode alone.

Thus the historical filesystem F1 has zero remaining IMPORTANT findings. This does
not close the separate composition bypass below.

### F1-R1 — IMPORTANT: portable custody admission relies on fetch identity

Location: `backend/src/flightLiveHost.ts:127–165,233–236,273–294`.

The production module exports `createDevFlightLiveHost` with both arbitrary injected
`fetch` and structurally typed `protocolTestCustody`. Its only test-transport gate is:

```typescript
if (input.protocolTestCustody && (!input.fetch || input.fetch === globalThis.fetch))
  throw new Error("PROTOCOL_TEST_TRANSPORT_REQUIRED");
const stores = input.protocolTestCustody ?? (await createFlightPrivateCustody(...));
```

It tests injected-function presence and equality with the current global fetch.
It does not detect wrappers, bound functions, proxies or delegation. There is no
runtime provenance brand or explicit production capability produced exclusively by
successful Linux custody admission. A different function object is treated as enough
to use caller-supplied custody, skipping platform, procfs, root admission and trusted
store-identity verification. Later transport construction sets `DEV_FLIGHT_HTTPS`
and calls that function with the fixed provider URL, POST body and Authorization.
The resolver and live execution path are the normal production implementations.

Independent vectors ran on actual macOS/Node24.18.0 with fake secrets and synthetic
positive authority fixtures. Global native fetch was **preserved**, not replaced
with a fake; wrapper/delegate calls entered native fetch. A harness counter verified
native DNS-boundary entry, then denied resolution before any external packet.
The factory's process send latch became1, the executor retained UNKNOWN, and a
second execution rejected. The application did not reject handoff for unsupported
platform or absent Linux custody.

| Required vector                                          | Independent observed result                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Unsupported platform + direct native fetch            | With portable custody: PROTOCOL_TEST_TRANSPORT_REQUIRED. Omitted fetch likewise rejects. Without the seam, unsupported filesystem custody rejects. |
| B. Unsupported platform + wrapper around native fetch    | CONFIGURED; native network boundary reached after mark.                                                                                            |
| C. Unsupported platform + bound native fetch             | CONFIGURED; native network boundary reached after mark.                                                                                            |
| D. Unsupported platform + proxy/delegating function      | CONFIGURED; native network boundary reached after mark.                                                                                            |
| E. Injected function ultimately calling native fetch     | CONFIGURED; native network boundary reached after mark.                                                                                            |
| F. Missing configured root + wrapped native fetch        | CONFIGURED using a separate existing portable store; nonexistent configured pathname ignored; native network boundary reached.                     |
| G. Wrong trusted custody identity + wrapped native fetch | CONFIGURED with unrelated UUID and device/inode0; supplied identity ignored; native network boundary reached.                                      |

Negative controls distinguish missing custody **configuration** from missing custody
**filesystem**: omitted/empty `custodyDirectory` still returns CLOSED. An honest
portable store still rejects a missing required request and mismatched Account.
Those checks verify the injected store, not the configured Linux store or trusted
identity, and therefore do not restore the required invariant. A caller can also
supply an ordinary object implementing the custody methods; the TypeScript return
type is not runtime admission evidence.

**Actual reach:** callable by a caller with ordinary trusted Backend composition
and provisioning authority through the exported production module. Normal
unconfigured `server.ts` passes no provisioning or portable seam; its initializer
cannot accept the seam, and no HTTP endpoint, Mobile input or environment flag
alone exposes it. The built Backend bundle nevertheless retains the callable
function, `protocolTestCustody` branch and function-equality gate (observed bundle
lines55115–55117). The fixture implementation itself need not be bundled: the
caller-supplied structural object is enough. The bypass is production-code reachable,
but no unauthenticated remote exploit, unauthorized SQL activation, duplicate send
or credential disclosure was demonstrated. These limits support IMPORTANT rather
than CRITICAL severity.

**Required architectural correction, not implemented:** production live transport
eligibility must depend on successful Linux anchored custody admission through an
explicit capability that ordinary composition inputs cannot substitute. Remove the
portable override from the real-capable production factory. Portable protocol tests
can remain in a fixture-only factory using deterministic custody and fixture transport;
shared pure parsing/rebinding/executor contracts can still be reused. Production
exports/startup/bundles must not retain a callable route from arbitrary test custody
plus arbitrary transport to the normal live transport/resolver composition. Function
identity, mock appearance, wrapper shape and caller convention cannot establish
network-disabled transport. This requires review of the composition boundary, not a
new migration or dispatch authority. Network denial is validation containment only.

### Independently executed validation

macOS commands ran inside an OS sandbox profile denying outbound IP networking,
including localhost forwarding. A numeric-address TCP negative control returned
EPERM. Node harnesses additionally denied external DNS/UDP/TCP; native fetch was
preserved specifically for the bypass probes and its DNS boundary was intercepted.
Linux tests ran in cached Node24.21.0 containers with `--network none`, read-only
root, all capabilities dropped, no-new-privileges and UID10001:GID999. No image pull,
real environment file, provider credential or Hosted connection was used. PostgreSQL
fixtures had network none and no published ports; access used local Docker Unix IPC.

| Check                                                           | Observed result                                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Corrected Linux custody and LIVE-W protocol suites              | 48 PASS;2 intentional skips; fresh child-process continuity enabled with F1_CUSTODY_MODULE.                                    |
| Reviewer-written Linux custody/restart controls                 | 8 PASS; original admission, external UUID, symlink, empty/copied replacement, retained FD/conflict, missing request.           |
| Reviewer portable-seam A–G plus negative controls               | 8 PASS as defect-witness assertions; B–G are unsafe accepted behavior, not security acceptance.                                |
| Focused adapter/executor/CP13B/SQLite/host and startup suites   | 9 files;350 PASS;14 platform/optional skips; includes7 actual server-startup construction combinations.                        |
| Normal startup matrix                                           | 7 combinations reach intercepted listen construction; unprovisioned initializer CLOSED without calling its environment getter. |
| Fresh Server1–84 replay                                         | PASS in each of two new disposable databases; defaults CLOSED.                                                                 |
| Server84 representative security                                | 104 checks PASS; final gates CLOSED; provider calls0.                                                                          |
| Actual Server84 composition E2E                                 | 1 PASS;34 deselected; one intercepted HTTP send; protected reserve/START/hold/mark, CP13B and no-resend recovery.              |
| Explicit SQLite50 cold/reopen/current-authority selection       | 19 PASS;155 deselected; real file-backed SQLite and clean FK evidence.                                                         |
| CP13A native admission and Flight closure repositories          | 2 files;103 PASS.                                                                                                              |
| Central sync engine, including five permissive-filter C denials | 24 PASS.                                                                                                                       |
| Typecheck                                                       | PASS on the delivered copy with reviewer probes removed.                                                                       |
| Lint / UI guard                                                 | PASS;473 legacy occurrences,76 representative UI files; no reviewer-probe warnings in final run.                               |
| Backend build                                                   | PASS; confirms the bypass branch is retained in bundled production code.                                                       |
| Accepted schema/sync/manifest and source-entry preservation     | PASS.                                                                                                                          |

The SQL E2E uses the delivered portable fixture on macOS and intercepted HTTP; it
proves the protected SQL/protocol chain, not deployed Linux filesystem custody or a
fully provisioned native Mobile installation. Linux custody/protocol and real SQLite
recovery are separately executed evidence. No full-suite rerun is claimed or needed
for this targeted recheck; the historical exact-base Ledger failure remains outside
this result. No functional failures appeared in the required checks; the new security
regression is intentionally captured by passing defect-witness assertions.

Runnable reviewer probes are retained in `/private/tmp/f1-recovered-probes/`;
copy those three files into the review-copy `backend/src/` to rerun with Vitest
`--configLoader runner --pool=threads --maxWorkers=1` inside
`/private/tmp/f1-recovered.sb`, using `/private/tmp/f1-recovered-deny.cjs` for the
native-fetch seam witnesses. The independent Linux script/bundles and all fresh
logs use `/private/tmp/f1-recovered-*`. Source entry hashes and original review bytes
are `/private/tmp/f1-recovered-entry.json` and `/private/tmp/f1-recovered-original.bin`.
Review-owned containers/volumes were removed; unrelated/preexisting fixtures preserved.

### Preservation and required answers

Server84 retains dispatch authority and TEST/PRODUCTION SQL closure. Secret
currentness/redaction, response-model witness, safe authorized readback, UNKNOWN
no-resend, accepted CP15B F1–F4 disclosure/Trip/pin/cost fences, CP13B interpretation,
CP13A canonical ownership, `sync_operations` and all five C denials are preserved.
The new finding concerns LIVE-W Linux custody eligibility, not the accepted CP15B
F1 recovery disclosure finding with the same historical identifier. Runtime/provider
gates remain CLOSED outside isolated synthetic positive controls.

| Required answer                                                             | Result |
| --------------------------------------------------------------------------- | ------ |
| Original filesystem F1 fixed                                                | YES    |
| Parent/intermediate/root symlink rejected                                   | YES    |
| Retained-root replacement protection verified                               | YES    |
| Restart continuity verified                                                 | YES    |
| Portable seam can bypass Linux-only custody                                 | YES    |
| Wrapped native fetch can construct unsupported-platform live composition    | YES    |
| Missing/wrong custody can be bypassed through portable seam                 | YES    |
| Network denial is currently required to prevent real handoff in that vector | YES    |
| Production composition requires Linux anchored custody capability           | NO     |
| Transport identity/function-shape used as security boundary                 | YES    |
| Portable test seam production reachable                                     | YES    |
| Original IMPORTANT findings remaining                                       | 0      |
| New CRITICAL findings                                                       | 0      |
| New IMPORTANT findings                                                      | 1      |
| New regressions                                                             | YES    |
| Server1–84 unchanged                                                        | YES    |
| SQLite1–50 unchanged                                                        | YES    |
| Server85/SQLite51 required                                                  | NO     |
| Server84 remains dispatch authority                                         | YES    |
| Normal startup CLOSED                                                       | YES    |
| TEST/PRODUCTION CLOSED                                                      | YES    |
| UNKNOWN no-resend preserved                                                 | YES    |
| Secret boundary preserved                                                   | YES    |
| Response-model witness preserved                                            | YES    |
| Safe readback preserved                                                     | YES    |
| CP15B F1–F4 preserved                                                       | YES    |
| CP13B/CP13A preserved                                                       | YES    |
| sync_operations sole scheduler                                              | YES    |
| Five C denials unchanged                                                    | YES    |
| Runtime/provider gates CLOSED                                               | YES    |
| External network/provider call made                                         | NO     |
| Real secret accessed                                                        | NO     |
| Hosted access/deployment                                                    | NO     |
| Ready for Final Owner Review                                                | NO     |
| Ready for LIVE-1 provider call now                                          | NO     |

STOP — LIVE-W TARGETED F1 RECOVERY REVIEW COMPLETE.

## TARGETED F1-R1 RECHECK

Date: 2026-10-07 (Pacific/Auckland). Same Replacement Independent Reviewer; review only.

**TARGETED F1-R1 RECHECK PASS WITH REQUIRED CORRECTIONS**

**F1-R1 FIX VERIFIED: YES.** The production portable-custody/native-fetch bypass is
removed. All A–G vectors reject before configuration/secret getters or dispatch/
network handoff. Production composition requires real Linux anchored custody and
trusted continuity before internally constructing fixed HTTPS transport. Fixture
composition is excluded from production exports, imports and bundle.

One **LOW-priority input-contract correction** remains: the new unknown-field gate
checks only enumerable own string keys. Hidden/inherited/symbol capability-shaped
fields are ignored, rather than rejected as explicitly required by this recheck.
They cannot substitute custody or transport. This is not a remaining F1-R1 network
bypass or a new IMPORTANT/CRITICAL finding, but the strict input rejection requirement
must be completed before Final Owner Review. LIVE-1 remains unauthorized.

### Preserved inputs and independent execution

Reviewed worktree `/private/tmp/otr-cp15b-live-wiring`, branch
`intelligence/cp15b-live-wiring`, retained accepted HEAD
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f`, including all pending corrections.
Read the exact live host, new protocol/shared/HTTPS modules, corrected adapter,
fixtures/tests, Builder F1-R1 appendix and ADR. Previously reviewed custody and
accepted authority contracts were retained; custody source/tests were independently
verified byte-identical to the recovered-review entry snapshot.

A fresh source copy `/private/tmp/otr-live-w-r1-review`, reviewer-owned probes and
fresh isolated SQL/Linux fixtures supplied all new execution results. No interrupted
or previous review result was reused as acceptance evidence. Before this append,
source and delivered validation copy matched all1,169 entry hashes. Existing review
prefix SHA-256:
`a52c3c1f4556bbbadbeebee8628f5bb6c989d5c47c3aa12aa2eb1acd5b03da1c`.
Builder report remains unchanged, SHA-256:
`9fbe6b970eb861a2324bd9fdd3424c2f010cda754951a4dc35bf3563b51c711b`.
All existing Independent Review text, including the recovered review, is preserved
byte-for-byte. Only this new section is appended; no implementation/current-state/
Builder edit, commit or push.

macOS execution used the independently verified OS sandbox denying outbound IP
networking, plus the DNS/TCP/UDP denial harness. Linux execution used cached Node24
containers with network none, read-only root, cap-drop ALL, no-new-privileges and
UID10001:GID999. The additional Linux production-host run preserved native fetch and
denied its external DNS boundary; networking remained denied at OS/container level.
No real secret, environment file, external request, Hosted connection or deployment.
All new review-owned containers/volumes were removed; preexisting fixtures preserved.

### Architectural fix and A–G

`createDevFlightLiveHost` has five supported inputs: environment, getter, acceptance,
custodyDirectory and trusted provisioning. Typed excess-property probes reject fetch,
protocolTestCustody, custody and transport. Runtime enumerable extra fields reject
LIVE_HOST_INPUT_CLOSED even when supplied through an untyped caller. There is no
portable branch, injected-fetch admission, function equality, wrapper detection or
transport override. The mandatory order is real Linux custody admission → trusted
identity/request verification → immutable acceptance → internal createFlightHttpsSend()
with its native default. Workflow spread inputs are overwritten by internal custody,
gateway, resolver and transport; they cannot reintroduce the removed override.

Reviewer-owned A–G used the actual production export with synthetic configured
positive inputs and caller-supplied native functions:

| Vector                                              | Independent result                                 |
| --------------------------------------------------- | -------------------------------------------------- |
| A unsupported platform/direct native fetch          | LIVE_HOST_INPUT_CLOSED; zero getter/handoff calls. |
| B unsupported platform/wrapped native fetch         | Same rejection and zero calls.                     |
| C bound native fetch                                | Same rejection and zero calls.                     |
| D proxy/delegating native fetch                     | Same rejection and zero calls.                     |
| E deferred function ultimately calling native fetch | Same rejection and zero calls.                     |
| F missing configured root plus wrapped native fetch | Same rejection and zero calls.                     |
| G wrong trusted identity plus wrapped native fetch  | Same rejection and zero calls.                     |

These assertions run on macOS and independently bundled Linux source. The injected
functions never execute, so the application rejection—not network containment—proves
these denials. Without injected capability fields, unsupported macOS fails at real
custody admission. On Linux, nonexistent roots and wrong external identity reject;
only the correctly admitted original root/request constructs production composition.
The successful Linux native-handoff control retains UNKNOWN on denied networking,
rejects a second execution and never invokes the portable response spy. Server84
fresh mark remains authority; the process-local latch only narrows sends.

### R1-C1 — LOW: unknown-key admission is incomplete

Location: `backend/src/flightLiveHost.ts:76–85`.

Object.keys(input) omits non-enumerable own properties, symbol properties and inherited
properties. Independently tested on a correctly provisioned Linux store:

1. Add a non-enumerable own fetch property using Object.defineProperty.
2. Give the input a custom prototype containing fetch and protocolTestCustody.
3. Add an enumerable symbol property representing transport.

Each construction returns CONFIGURED, after real Linux admission. On macOS the same
inputs reach CUSTODY_PLATFORM_CLOSED rather than the unknown-input rejection. The
injected functions are never called and the inherited custody is never used. All
nine ordinary enumerable unknown capability fields reject as intended.

**Required correction:** enforce the specified strict runtime input grammar for
all own keys and unsupported prototypes/inherited capability fields. Check complete
own-key presence, including symbols/non-enumerable keys, and define an allowed plain
or null-prototype input policy so custom inherited capability fields cannot be silently
admitted. Add a small runnable assertion that these cases reject before getter,
custody or handoff. Do not restore a portable branch or function-identity check.

This is an input-contract gap, not an architectural capability escape: hidden fields
are ignored, successful Linux admission remains mandatory, and no arbitrary transport
or custody is consumed. The original IMPORTANT F1-R1 finding is closed. No new
IMPORTANT/CRITICAL finding or functional regression was demonstrated. The correction
is required because the user explicitly requires unknown capability fields to fail
closed, rather than merely be ignored. No correction was implemented by this review.

### Fixture and HTTPS isolation

The only portable host constructor is in
`backend/src/__fixtures__/flightProtocolHost.ts`. It is not imported by server.ts,
re-exported by flightLiveHost or exposed by package exports. No environment path
enables it. Its private assembler is not exported. It constructs its own literal
fake credential resolver and fixture response transport; it neither imports nor
constructs the real environment resolver/HTTPS constructor. Reviewer-injected
resolver/send/transport/fetch extras do not replace those internally selected
fixture components; the deterministic response receives only the fixed fake key.
The fixture response callback is a test stub boundary, not a certificate that an
arbitrary JavaScript callback cannot perform I/O. It exists only in fixture source
and is excluded from the production dependency graph, which is the structural
security boundary requested here.

The Backend build/metafile contains197 inputs with **zero fixture or test modules**.
The production module has only its four legitimate runtime exports. The bundle
contains none of protocolTestCustody, PROTOCOL_TEST_TRANSPORT_REQUIRED,
createFlightProtocolTestHost, fixtureResponse or assembleFixture, and no fetch/native
identity comparison. The sole production importer of flightHttpsTransport is
flightLiveHost, calling its constructor without an override. No second portable
live composition was located. Shared witness/parser/recovery/executor logic and
fixture-kind string literals confer no custody or credential-acquisition capability.

The low-level createFlightHttpsSend(http) parameter remains usable for direct
transport units; the live factory cannot accept or install the returned send function.
It receives no custody, resolver or host provisioning. Fixed provider HTTPS origin,
POST/profile, redirect error/destination validation,30-second timeout/abort,131072-byte
streaming bound and reader cleanup pass. The higher adapter preserves1024-chunk and
deadline checks. Connection loss, timeout, redirects and oversize produce one HTTP
invocation with no retry. Authorization remains private; the production host and
executor's existing one-shot/Server84 fences preserve no-resend behavior.

### Filesystem, authority and baseline preservation

Representative Linux custody tests and independent fresh-process controls reconfirm
real procfs/retained-root anchoring, parent/intermediate/root symlink rejection,
pathname replacement/retargeting and concurrency protection, immutable hard-link
publication, equal/conflicting duplicates and fsync-before-ACK. A fresh process admits
the original trusted store; empty replacement, copied-marker replacement, wrong
external UUID and missing request reject. All private custody source/test bytes are
unchanged from the recovered review; original filesystem F1 remains fixed.

All88 accepted manifest hashes and all155 tracked Server migration/data-db/sync files
match the exact accepted base. Server count/tail84, SQLite tail50; no Server85/SQLite51.
Server84 hash remains
`46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
Protected SQL security, actual reserve/START/hold/mark protocol, UNKNOWN/no-resend,
secret currentness, model witness/readback, CP15B F1–F4, CP13A/B, central scheduler
and five unconditional C denials pass. No inbound/outbound startup/provider activation.

The Builder's reported baseline classification was independently checked using a
fresh exact-base archive and identical runner/dependencies/network denial. Both base
and corrected source produce the same LedgerExpenseDetailScreen direct-data-import
failure at architectureBoundary.test.ts:41, with3 other assertions passing. The
failing test and screen are byte-identical to base. Inspected final Builder full-run
artifacts show2,643 passes/one failure and exact-base2,577 passes/one failure, with
that same failure and no residual intermediate parse failures. Those aggregate counts
are Builder-run artifact evidence; this review independently reran the shared failure
and required affected checks, not the complete full suites. No targeted failure was
reclassified as baseline, and no new functional regression justified a full rerun.

### Independently executed validation

| Check                                                                                | Result                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer A–G, arbitrary inputs and fixture override probes                           | 3 PASS, covering7 bypass vectors,9 enumerable unknown fields,3 hidden-property witnesses and fixture extras; hidden-field acceptance is the R1-C1 witness, not strict-input acceptance. |
| Linux custody/host/direct transport plus reviewer probes                             | 66 PASS;2 intentional skips; unchanged production-owned source freshly bundled with inspected Node-test/Vitest adapter.                                                                 |
| Additional Linux original/empty/copied-marker/missing-request fresh-process controls | 8 PASS.                                                                                                                                                                                 |
| Native-fetch Linux production host run                                               | 41 PASS;2 skips; denied native network boundary, UNKNOWN/no resend, fixture spy unused.                                                                                                 |
| Focused host/adapter/startup/CP13B/SQLite/CP13A/sync suites                          | 12 files;489 PASS;2 optional/platform skips; includes seven actual server-startup combinations and five permissive-filter C denials.                                                    |
| Production bundle/export/source/fixture audit                                        | PASS;197 inputs, zero fixtures/tests; no portable branch or fetch identity gate.                                                                                                        |
| Direct HTTPS transport                                                               | 7 PASS, included in Linux/focused results.                                                                                                                                              |
| Fresh Server1–84 replay                                                              | PASS in two task-owned network-none databases; defaults CLOSED.                                                                                                                         |
| Actual Server84 representative security                                              | 104 checks PASS; final gates CLOSED; provider calls0.                                                                                                                                   |
| Protected actual Server84 protocol fixture E2E                                       | 1 PASS;42 deselected; one deterministic response; protected call/START/hold/mark, CP13B and recovery/install seam.                                                                      |
| Explicit real SQLite50 cold/reopen/current-authority selection                       | 19 PASS;155 deselected.                                                                                                                                                                 |
| Typed excess-property probes / final delivered typecheck                             | PASS.                                                                                                                                                                                   |
| Lint / UI guard                                                                      | PASS; no final warnings;473 legacy occurrences,76 representative UI files.                                                                                                              |
| Backend build                                                                        | PASS.                                                                                                                                                                                   |
| Correction-file formatting / whitespace                                              | PASS.                                                                                                                                                                                   |
| Schema/sync/manifest/source/prefix preservation                                      | PASS.                                                                                                                                                                                   |
| Exact-base baseline classification                                                   | Same Ledger failure independently reproduced on both sources; not a full-suite rerun.                                                                                                   |

The real Linux production/native-handoff control and portable positive protected-SQL
E2E are separate evidence. The latter intentionally uses the fixture-only factory;
its historical test title does not make it the production HTTPS composition. Neither
claims deployed issuer/session provisioning, physical power-loss durability, real
provider behavior or native Mobile installation of the Candidate. SQLite recovery
was independently run against the real owning repository.

Fresh logs/bundles/scripts use `/private/tmp/r1-review-*`; probes are retained in
`/private/tmp/r1-review-probes/`. Copy the three probe files into the disposable review
copy's backend/src to rerun tests/type assertions under the OS-denial profile
`/private/tmp/f1-recovered.sb` and reviewed denial preloader. Entry hashes/original
review bytes are `/private/tmp/r1-review-entry.json` and
`/private/tmp/r1-review-original.bin`. Docker fixtures are removed after validation.

### Required answers

“Accepts arbitrary capability” below means installs/consumes it as an override;
R1-C1 separately records hidden extra properties accepted syntactically but ignored.

| Required answer                                           | Result |
| --------------------------------------------------------- | ------ |
| F1-R1 FIX VERIFIED                                        | YES    |
| Production factory accepts protocolTestCustody            | NO     |
| Production factory accepts arbitrary custody              | NO     |
| Production factory accepts arbitrary fetch/transport      | NO     |
| Function identity remains security boundary               | NO     |
| A direct-native bypass possible                           | NO     |
| B wrapped-native bypass possible                          | NO     |
| C bound-native bypass possible                            | NO     |
| D proxy/delegate bypass possible                          | NO     |
| E deferred-native bypass possible                         | NO     |
| F missing-root bypass possible                            | NO     |
| G wrong-identity bypass possible                          | NO     |
| Production live transport requires Linux anchored custody | YES    |
| Portable test factory production reachable                | NO     |
| Portable test factory can use real secret resolver        | NO     |
| Portable test factory can construct real HTTPS transport  | NO     |
| Fixture code present in production bundle                 | NO     |
| Original filesystem F1 remains fixed                      | YES    |
| Restart continuity preserved                              | YES    |
| Original IMPORTANT findings remaining                     | 0      |
| New CRITICAL findings                                     | 0      |
| New IMPORTANT findings                                    | 0      |
| Unknown capability fields always reject before admission | NO |
| Required LOW input-contract corrections                   | 1      |
| New regressions                                           | NO     |
| Server1–84 unchanged                                      | YES    |
| SQLite1–50 unchanged                                      | YES    |
| Server85/SQLite51 required                                | NO     |
| Server84 sole dispatch authority                          | YES    |
| Normal startup CLOSED                                     | YES    |
| TEST/PRODUCTION CLOSED                                    | YES    |
| UNKNOWN no-resend preserved                               | YES    |
| Secret boundary preserved                                 | YES    |
| Response-model witness preserved                          | YES    |
| Safe readback preserved                                   | YES    |
| CP15B F1–F4 preserved                                     | YES    |
| Inbound/outbound firewall preserved                       | YES    |
| CP13B/CP13A preserved                                     | YES    |
| sync_operations sole scheduler                            | YES    |
| Five C denials unchanged                                  | YES    |
| Runtime/provider gates CLOSED                             | YES    |
| External network/provider call made                       | NO     |
| Real secret accessed                                      | NO     |
| Hosted access/deployment                                  | NO     |
| Ready for Final Owner Review                              | NO     |
| Ready for LIVE-1 provider call now                        | NO     |

STOP — LIVE-W TARGETED F1-R1 INDEPENDENT RECHECK COMPLETE.

## FINAL R1-C1 TARGETED RECHECK

**Verdict: FINAL TARGETED RECHECK PASS**

Replacement Independent Reviewer; review-only recheck of the final R1-C1 correction
on `intelligence/cp15b-live-wiring`, accepted HEAD
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f`. This section supersedes only the prior
remaining LOW R1-C1 disposition and Owner-readiness answer. Earlier review text is
preserved byte-for-byte. Implementation, Builder report, and current-state handoff
were not edited by this review.

### Independent reproduction and boundary audit

R1-C1 is fixed. Reviewer-owned probes exercised exact five-field ordinary input,
enumerable and hidden unknown string properties, own symbols, own configuration
accessors, hidden acceptance accessors, custom prototypes, inherited fetch,
transport, custody, protocolTestCustody and arbitrary unknown fields, class
instances, null-prototype records, proxies with getter/prototype/key/descriptor
traps, and revoked proxies. Each invalid form rejected `LIVE_HOST_INPUT_CLOSED`;
configuration reads and accessor/proxy traps remained zero. Additional probes
polluted ordinary Object.prototype with each of those five inherited names and a
symbol getter, restoring it after each test: all rejected without evaluating the
getter. Unmodified ordinary input reached the legitimate CLOSED configuration gate;
fully provisioned ordinary input constructed the production host on Linux.

The guard uses Node `types.isProxy` before prototype/key operations, including for
revoked proxies; exact ordinary-prototype identity; complete `Reflect.ownKeys`
inspection of input and Object.prototype; and property-descriptor inspection
without evaluating accessors. Only the five approved names are admitted. Delivered
boundary tests independently observed zero custody, HTTPS transport, persistence
gateway, configuration/secret-key reads, handoff and fetch calls on rejected input.
The source order places all such capabilities after this guard. This review assesses
the accepted composition contract; it does not impose arbitrary subsequent mutation
or hostile replacement of trusted JavaScript intrinsics as a new requirement.

Reviewer A–G reruns rejected direct, wrapped, bound, proxy/delegate and deferred
native fetch overrides, missing-root override and wrong-identity override before
configuration/handoff. The production factory admits no fetch, transport, custody
or protocolTestCustody override. Separate override-free Linux probes constructed
only correct trusted custody and rejected a missing directory or wrong identity.
macOS rejected that same ordinary provisioned input at `CUSTODY_PLATFORM_CLOSED`.
F1-R1 remains fixed.

Original filesystem F1 remains fixed: Linux custody tests rechecked parent,
intermediate and root symlinks, retained-root replacement, immutable association,
request continuity and restart. Eight reviewer-owned separate-process checks
confirmed original-store restart, wrong UUID denial, parent-symlink denial,
empty replacement restart denial, copied-marker replacement restart denial,
retained descriptor reading the original after replacement, conflicting immutable
association denial, and missing retained request restart denial.

Production runtime exports remain the four previously approved exports. A fresh
server build/metafile has 197 inputs and zero fixture/test inputs; forbidden portable
factory, fixture response and legacy bypass tokens are absent. Fixed HTTPS is
constructed internally after anchored custody/request admission. The portable
fixture cannot enter the production export/import/bundle path.

### Validation and preservation evidence

All runtime validation used synthetic fixtures. macOS commands ran under OS
outbound-IP denial plus the reviewed TCP/fetch denial preloader. A numeric-IP TCP
control returned EPERM. Cached Linux Node24 ran with `--network none`, read-only
root, UID10001:GID999, dropped capabilities and no-new-privileges. Disposable
PostgreSQL also used network none; local Docker IPC is not provider networking.

| Fresh independent check                                                            | Result                                                                      |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Focused host/input/startup/HTTPS/adapter/executor/interpreter plus reviewer probes | 206 PASS, 2 intentional skips, 8 files.                                     |
| Linux custody/host/HTTPS plus reviewer strict-input/A–G probes                     | 65 PASS, 2 intentional skips.                                               |
| Additional reviewer separate-process custody checks                                | 8 PASS.                                                                     |
| Continuation repository / CP15B F1–F4 and inbound/outbound firewall                | 174 PASS.                                                                   |
| CP13A/B import admission/closure and central sync scheduler                        | 127 PASS, 3 files; includes 24 sync/five-C checks.                          |
| Explicit SQLite50 cold/reopen selection                                            | 19 PASS, 155 unrelated deselections; overlaps continuation run.             |
| Fresh unchanged Server1–84 replay                                                  | PASS.                                                                       |
| Protected Server84 security acceptance                                             | 104 checks PASS; 100 synthetic holds, final gates CLOSED, provider calls 0. |
| Final source typecheck                                                             | PASS.                                                                       |
| Lint / UI guard                                                                    | PASS, no lint warnings; 473 legacy occurrences, 76 representative UI files. |
| Backend build and production export/bundle audit                                   | PASS.                                                                       |
| Four correction files: formatting                                                  | PASS.                                                                       |
| Existing source whitespace (`git diff --check`) / new appendix formatting          | PASS.                                                                       |
| Preservation manifest / accepted-base migration-db-sync comparison                 | 88 manifest entries and 155 tracked files match.                            |

Server migration count remains 84; SQLite migration registry and all its migration
files remain accepted-base-identical through version50. Server84 remains sole
dispatch authority; no Server85/SQLite51 or second scheduler is introduced. The
unchanged host/executor/interpreter/custody/transport and scheduler tests reconfirm
normal startup CLOSED, TEST/PRODUCTION CLOSED, UNKNOWN no-resend, secret boundary,
response-model witness, safe readback, CP15B F1–F4, both firewalls, CP13B/CP13A,
sole sync_operations scheduling, five unconditional C denials, and closed gates.

Builder baseline/no-regression evidence was independently checked. Compared with
the prior recheck snapshot, only liveHost, boundary tests, Builder report and
current-state handoff changed; the additional Independent Review difference is the
prior reviewer's own append. Custody, transport, fixture/shared composition,
server/startup, protocol/executor and protected migration/scheduler bytes are
unchanged. Prior review SHA-256 at this recheck entry was
`79979d7f1e0cfb96f45b0fd3ec150981d22020ab3a520305bcdbbe9cccb8dc88`.

The known Ledger architecture-boundary failure at architectureBoundary.test.ts:41
was independently reproduced on exact accepted base and corrected source (each
3 PASS, 1 FAIL); its test and LedgerExpenseDetailScreen bytes equal the base. Whole
repository formatting was also run: 22 warnings exactly match the accepted baseline;
the sole additional warning is this previously preserved Independent Review, whose
prior text cannot be reformatted under the append-only instruction. Correction-file
formatting passes. These are existing baseline/review-text issues, not new R1-C1
required corrections. No full-suite rerun was needed or claimed; prior full counts
remain historical. No new regression appeared in the requested checks.

Fresh logs, bundles, fixture wrappers and preservation evidence are retained as
`/private/tmp/final-review-*`; reviewer probe sources are in
`/private/tmp/final-review-probes/`. The isolated source copy is
`/private/tmp/otr-live-w-final-review`; original review bytes and entry file hashes
are retained separately. Task-owned Docker fixtures are removed after checks.
Counts above overlap and must not be summed into a claimed full-suite total.

### Required answers

| Required answer                                   | Result |
| ------------------------------------------------- | ------ |
| R1-C1 FIX VERIFIED                                | YES    |
| Enumerable unknown own field accepted             | NO     |
| Non-enumerable unknown own field accepted         | NO     |
| Symbol field accepted                             | NO     |
| Accessor accepted/evaluated before rejection      | NO     |
| Custom prototype accepted                         | NO     |
| Inherited capability field accepted               | NO     |
| Class instance accepted                           | NO     |
| Null-prototype object accepted                    | NO     |
| Proxy/revoked proxy accepted                      | NO     |
| Rejected invalid input can reach getter           | NO     |
| Rejected invalid input can reach custody          | NO     |
| Rejected invalid input can reach secret resolver  | NO     |
| Rejected invalid input can reach Server84 handoff | NO     |
| Rejected invalid input can reach network boundary | NO     |
| F1-R1 remains fixed                               | YES    |
| Original filesystem F1 remains fixed              | YES    |
| Portable fixture remains production unreachable   | YES    |
| Remaining CRITICAL findings                       | 0      |
| Remaining IMPORTANT findings                      | 0      |
| Remaining LOW required corrections                | 0      |
| New regressions                                   | NO     |
| Server1–84 unchanged                              | YES    |
| SQLite1–50 unchanged                              | YES    |
| Server85/SQLite51 required                        | NO     |
| Server84 sole dispatch authority                  | YES    |
| Normal startup CLOSED                             | YES    |
| TEST/PRODUCTION CLOSED                            | YES    |
| UNKNOWN no-resend preserved                       | YES    |
| Secret boundary preserved                         | YES    |
| Response-model witness preserved                  | YES    |
| Safe readback preserved                           | YES    |
| CP15B F1–F4 preserved                             | YES    |
| Inbound/outbound firewall preserved               | YES    |
| CP13B/CP13A preserved                             | YES    |
| sync_operations sole scheduler                    | YES    |
| Five C denials unchanged                          | YES    |
| Runtime/provider gates CLOSED                     | YES    |
| External network/provider call made               | NO     |
| Real secret accessed                              | NO     |
| Hosted access/deployment                          | NO     |
| Commit/push                                       | NO     |
| Ready for Final Owner Review                      | YES    |
| Ready for LIVE-1 provider call now                | NO     |

STOP — LIVE-W FINAL TARGETED INDEPENDENT RECHECK COMPLETE.
