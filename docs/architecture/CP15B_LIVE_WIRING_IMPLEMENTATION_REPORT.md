# CP15B-LIVE-W — implementation report

Date: 2026-10-07 (Pacific/Auckland). Status: COMPLETE / READY FOR INDEPENDENT REVIEW; normal live gates CLOSED.

Fresh worktree `/private/tmp/otr-cp15b-live-wiring`, branch
`intelligence/cp15b-live-wiring`, clean exact starting HEAD
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f`. Main and cached origin/main equal
that commit. No remote inspection was performed. All 88 accepted preservation
hashes match. Server tail/count 84, Server84 SHA-256
`46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`;
SQLite tail 50. Independent CP15B targeted F1–F4 recheck PASS is retained.
LIVE-0 is Owner-reviewed planning input from its retained worktree, not canonical
committed content. Existing dirty checkouts are preserved.

## Implemented changes mapped to LIVE-0 gaps

| Gap | Narrow change                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Explicit DEV/FLIGHT_IMPORT_V1 private composition; no route or worker                                                                           |
| B   | Existing verified gateway with provisioned trusted verifier and exact dedicated session contract; no synthetic default or service-role fallback |
| C   | Exact logical-reference environment resolver with rotation/currentness checks; injected environment getter, no secret read on import            |
| D   | Fixed HTTPS POST transport with redirects/retries disabled, abort/deadline/byte bounds                                                          |
| E   | Private immutable file custody implementing accepted put/verify/read contract; fsync before acknowledgement, exact immutable associations       |
| F   | Durable retained pins and existing executor recovery/current disclosure and installation fences                                                 |
| G   | One exact acceptance Account/task/attempt/call binding; Server84 fresh mark CAS remains the durable one-shot authority across restart           |
| H   | Versioned bounded returned-model conformance policy; missing/mismatch blocks success while preserving usage                                     |
| I   | Safe finite readback projections and existing protected/operator-only SQL procedure                                                             |

No Server85, SQLite51, scheduler, dispatch authority or canonical authority is
introduced. Private content custody is not control-plane authority. The configured
single call cannot be replaced during an acceptance session; MAY_HAVE_STARTED,
UNKNOWN and lost mark ACK never authorize another send. Actual workload/session
provisioning, persistent host mount, official conformance revalidation, secret,
monetary approval and LIVE-1 activation remain future separately authorized work.

Validation denied TCP/fetch externally to test injection, used synthetic identities
and fake environment secrets only, and compared full-suite failures to the exact base. No Hosted Dev/Production access, deployment, real provider traffic, Event
execution, commit or push is authorized.

## Implementation and limits

`flightLiveHost.ts` composes the existing private executor and protected gateway;
`flightPrivateCustody.ts` supplies durable private content, immutable acceptance and
result/raw-response pins. The adapter retains raw bounded response before parsing;
pure response parsing is reused for recovery. No commercial fallback or new dependency.
The normal server calls the initializer without provisioning and remains CLOSED even
when environment flags are accidentally enabled. Recovery is usable with transport
disabled. Missing/nonprivate/symlink custody mount fails closed; startup never creates
an ephemeral replacement directory.

The trusted issuer, dedicated primary SQL-session connector and owning workflow are
explicit host-provisioning dependencies. LIVE-W does not supply an actual issuer,
credentials or SQL driver; this is the permitted future provisioning boundary, not a
synthetic production implementation. Every protected invocation checks exact dedicated
session identity/reference and verified DEV Account. Ordinary startup cannot instantiate
an active root. Test-only synthetic verifiers/SQL administration live solely in fixtures.

Secret access is confined to an injected environment getter and closure; no import-time
secret reads or durable secret values. Missing/rotated/revoked values deny admission and
handoff. Native fetch uses fixed HTTPS destination, redirect error, total/connect bound,
abort, bounded streaming and no retry. Host gates independently restrict Server84;
Server84 fresh mark/START/hold remain durable authority. Process-local send state only
narrows this, and restarting cannot manufacture a fresh mark ACK.

Model conformance policy `deepseek-flash-live0-20261007-v1` is derived from Owner-reviewed
LIVE-0 planning. It requires exact returned `deepseek-flash` or `DeepSeek-V4.1-Flash`;
missing/mismatch blocks success/install and preserves available usage. It witnesses a
mutable alias family, never immutable weights. No external documentation/network query
was made; current official model/API/pricing revalidation remains mandatory before LIVE-1.
Raw provider fields are retained only privately. Safe readback returns finite projections;
unaccepted model strings are redacted. The runbook composes existing protected reports
and explicit authorized read-only SQL for START, hold, price header/units, usage and cost.

No live monetary policy/scope/grant was activated. The proposed maximum remains
4,915,200 USD nanos (USD0.0049152). Active synthetic fixture policy existed only inside
task-owned network-none disposable databases, removed after validation.

## Validation and exact-base comparison

All application validation uses the same installed dependencies and explicit TCP/fetch
denial preloader. Fake HTTP is injected at the transport boundary. Docker fixtures have
network none and no published ports; cached images only. No developer-process secret or
real provider response is consumed. Python fixture code compiles; formatting and diff
whitespace checks pass. Typecheck, lint including UI guard, and Backend build pass.

| Check                                                   | Result                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| Exact-base/full suite                                   | 2,577 passed, one existing failure, 202 files                |
| LIVE-W/full suite                                       | 2,609 passed, one same failure, one optional skip, 203 files |
| New full-suite failures                                 | **0**                                                        |
| Focused adapter/executor/CP13B/SQLite owning repository | PASS; 327 tests, one optional skip                           |
| Actual disposable Server84 production-composition E2E   | PASS; one test, 32 unrelated skips                           |
| Fresh Server1–84 replay                                 | PASS; defaults CLOSED                                        |
| Server84 security acceptance                            | PASS; 104 checks, final gates CLOSED, provider calls 0       |
| Typecheck / lint / UI guard / Backend build             | PASS                                                         |
| Server1–84 / SQLite1–50 / 88 preservation hashes        | byte-identical / PASS                                        |

The only full-suite failure is `src/domain/architectureBoundary.test.ts:41`, the Ledger
boundary source-import assertion. It reproduces on exact base
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f` with the same runner/dependencies/network denial.
It is unrelated and unchanged. No new LIVE-W failure is classified as baseline.

The focused tests cover production composition, missing config/secret/mount, disabled
gates, TEST/PRODUCTION rejection, session identity, model witness, raw response recovery,
secret rotation, mark ACK loss, UNKNOWN/restart, kill/grant/budget/config/scope/Trip revoke,
A→B→A, redirect/oversize/loss, safe readback and metering loss. The full suite also executes
accepted C2/A2/B2 firewall, CP13A/B, SQLite50 cold-reopen/FK, Account/Trip, sync and five C
denial tests. F1–F4 fences/cost semantics remain preserved.

The exact LIVE-0 fixture SHA is
`2c9b62e82d6740911fea8f61b18e27171a91a1ed79057de728b71ba0effd1a27`.
Production-composition tests produce six exact spans, eight observations, one CP13B
Candidate, ZZ901 marketing/YY902 operating, departure 2027-02-03 10:30 ESTIMATED,
arrival 12:00 EXACT with date null, unresolved zones/instants and no Event command.
The optional actual database E2E proves one real protected reserve/START/hold/mark,
one intercepted HTTP send, usage cost ESTIMATED and restart recovery/installation
**delegation to the existing owning repository seam**. Its owning repository is synthetic;
it does not independently prove a real SQLite installation. The unchanged full-suite
native SQLite owning-repository tests separately cover transactional install and its
current authority fences. No canonical Event is installed by LIVE-W validation.

Privacy inspection found no secret, raw request/response, full host context or evidence
logging/telemetry. Only the Authorization handoff carries the fake/injected secret;
private durable content intentionally holds request/response bytes. Normal startup
logs a finite CLOSED outcome. No actual secret/.env values/provider content artifacts
are in the intended scope.

## Exact modified/untracked scope

All changes remain unstaged and uncommitted. Existing other checkouts were preserved.
Temporary dependency symlinks/build output/database fixtures are removed after checks.

- MODIFIED `.env.backend.example`
- MODIFIED `backend/src/deepSeekFlight.ts`
- MODIFIED `backend/src/flightDevDispatch.test.ts`
- MODIFIED `backend/src/flightDevDispatch.ts`
- MODIFIED `backend/src/server.ts`
- MODIFIED `deploy/dev-backend/Dockerfile`
- MODIFIED `docs/API_CONTRACT.md`
- MODIFIED `docs/CURRENT_IMPLEMENTATION_STATE.md`
- MODIFIED `docs/DATA_MODEL.md`
- MODIFIED `docs/OFFLINE_SYNC.md`
- MODIFIED `docs/ops/DEV_BACKEND_DEPLOYMENT.md`
- MODIFIED `docs/ops/DEV_BACKEND_RUNBOOK.md`
- MODIFIED `src/data/interpretation/flightInterpretation.test.ts`
- NEW `backend/src/__fixtures__/flightExecutor.ts`
- NEW `backend/src/flightLiveHost.test.ts`
- NEW `backend/src/flightLiveHost.ts`
- NEW `backend/src/flightPrivateCustody.ts`
- NEW `deploy/dev-backend/compose.flight-custody.closed.yml`
- NEW `docs/adr/2026-10-07-cp15b-closed-live-host-wiring.md`
- NEW `docs/architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md`
- NEW `scripts/cp15/live-w-network-deny.cjs`
- NEW `scripts/cp15/live-w-server84-fixture.py`
- NEW `src/data/interpretation/__fixtures__/flightInterpretation.ts`

## Final required answers

| Required answer                                                           | Result |
| ------------------------------------------------------------------------- | ------ |
| Exact base verified                                                       | YES    |
| LIVE-W complete                                                           | YES    |
| Server1–84 unchanged                                                      | YES    |
| Server85 required                                                         | NO     |
| SQLite1–50 unchanged                                                      | YES    |
| SQLite51 required                                                         | NO     |
| DEV-only live composition implemented                                     | YES    |
| TEST live composition possible                                            | NO     |
| PRODUCTION live composition possible                                      | NO     |
| Host transport gate defaults CLOSED                                       | YES    |
| Host transport gate can bypass Server84                                   | NO     |
| Server84 can bypass disabled host transport                               | NO     |
| Real environment secret resolver implemented                              | YES    |
| Real secret value read/provisioned                                        | NO     |
| Secret can enter logs/control-plane/custody                               | NO     |
| Missing/revoked secret fails closed                                       | YES    |
| Real HTTPS transport implemented                                          | YES    |
| Normal startup can contact DeepSeek while unconfigured                    | NO     |
| Redirect can leak Authorization                                           | NO     |
| Automatic transport retry exists                                          | NO     |
| Commercial fallback exists                                                | NO     |
| Trusted Server84 live gateway composition implemented                     | YES    |
| Live composition uses synthetic verifier                                  | NO     |
| Generic service_role shortcut exists                                      | NO     |
| Public AI endpoint introduced                                             | NO     |
| Private durable request custody implemented                               | YES    |
| Private durable response custody implemented                              | YES    |
| Restart requires provider replay                                          | NO     |
| Raw request/response enters control-plane telemetry                       | NO     |
| One-shot host restriction implemented                                     | YES    |
| One-shot restriction is a second dispatch authority                       | NO     |
| Restart after MAY_HAVE_STARTED can authorize second send                  | NO     |
| Response model witness implemented                                        | YES    |
| Returned model/family mismatch can publish/install                        | NO     |
| Mutable alias is treated as immutable weights identity                    | NO     |
| Safe live readback implemented/composed                                   | YES    |
| Readback exposes raw secret/private evidence                              | NO     |
| LIVE-0 synthetic fixture passes production-composition network-denied E2E | YES    |
| Exactly one intercepted send in successful local E2E                      | YES    |
| External network/provider request made during LIVE-W                      | NO     |
| Mark ACK loss can cause resend after restart                              | NO     |
| Trip revoke fence preserved                                               | YES    |
| A→B→A disclosure fence preserved                                          | YES    |
| Schedule-derived cost remains ESTIMATED                                   | YES    |
| Missing usage remains UNKNOWN                                             | YES    |
| Live monetary policy activated                                            | NO     |
| Vision enabled                                                            | NO     |
| Apple enabled                                                             | NO     |
| Shadow enabled                                                            | NO     |
| Public B2 enabled                                                         | NO     |
| Inbound can automatically invoke outbound                                 | NO     |
| CP13B authority preserved                                                 | YES    |
| CP13A authority preserved                                                 | YES    |
| sync_operations sole scheduler                                            | YES    |
| Five C denials unchanged                                                  | YES    |
| Hosted Dev accessed                                                       | NO     |
| Production accessed                                                       | NO     |
| Deployment performed                                                      | NO     |
| Real DeepSeek call made                                                   | NO     |
| Commit                                                                    | NO     |
| Push                                                                      | NO     |
| Full-suite new failures                                                   | 0      |
| Ready for independent LIVE-W review                                       | YES    |
| Ready for LIVE-1 real provider call now                                   | NO     |

## Readiness

No LIVE-W implementation hard stop remains. Actual issuer/session/workflow and durable
mount provisioning, real dedicated secret, current official conformance/pricing checks,
Owner monetary approval and LIVE-1 activation are intentionally unperformed prerequisites,
not authorization to call now. No Hosted Dev/Production access, deployment, real provider
call, commit or push occurred.

**STOP — CP15B-LIVE-W COMPLETE / READY FOR INDEPENDENT REVIEW.**
**Ready for LIVE-1 real provider call now: NO.**

## TARGETED F1 — CUSTODY PATH IDENTITY CORRECTION

Date: 2026-10-07. **STOP — BLOCKED; F1 NOT FIXED.** This section supersedes the
prior unconditional custody safety/readiness assertions. The independent review
is unchanged (SHA-256 `513e77836ad6ea7b152356f6bed8c01dba04651ff0ecef81cd7ee08030f1d240`).
Existing branch `intelligence/cp15b-live-wiring` and exact retained HEAD
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f` are preserved.

The review's parent-symlink and root-replacement witnesses expose the same shared
boundary for request, response, acceptance and result custody. Current root checks
are pathname-based, admit replacement private directories and protect only final
symlinks. Parent ownership/trust and stable root device/inode are not enforced.
The existing comment declaring the parent trusted is not a replacement-race proof.

Before editing production code, a synthetic local primitive probe opened a private
0700 directory with `O_DIRECTORY | O_NOFOLLOW` and attempted to open its child using
`/dev/fd/<directory-fd>/child` and `/proc/self/fd/<directory-fd>/child`. Both returned
`ENOENT` on **darwin, Node v24.18.0**. Node's public `node:fs` exports provide neither
`openat` nor `linkat`. Probe handles and the synthetic directory were cleaned up;
no dependency symlink/build output or fixture was created in the worktree.

Capturing dev/inode and walking `lstat` components could reject stable replacement,
but would not anchor later temporary-file creation, immutable hard-link installation,
read or directory fsync. Pre/post pathname checks cannot exclude transient namespace
replacement/restoration between checks. No such partial fix was installed or claimed
safe. Linux `/proc/self/fd` may support a Linux-only design, but the local macOS probe
does not provide that equivalent and it was not silently made a deployment dependency.

The request explicitly says: "If Node runtime cannot provide a sufficiently strong
primitive without native dependency/schema/architecture changes, STOP and report
rather than claim safety." That stop applies here. A complete correction needs an
approved descriptor-relative native filesystem facility (openat/linkat/unlinkat and
anchored parent traversal) or an explicitly approved narrower platform contract.
Neither is introduced under this targeted correction. No Server85/SQLite51 is needed.
The trusted host anchor and application-controlled private path must be specified
with that solution; there is currently no enforced full parent trust boundary.

Only this appended report and the current-state blocker handoff are changed by this
correction attempt. No production/test/runbook/ADR or independent-review edit was made.
The requested correction/regression/full suites were **not rerun**: implementation
stopped at the required primitive blocker before any code change. Prior validation
results remain historical evidence, not validation of a fixed F1. The local primitive
probe is the only new execution evidence. No regression was introduced by these docs;
the existing F1 defect remains. No independent recheck readiness is claimed.

### Required correction answers

| Required answer                                         | Result |
| ------------------------------------------------------- | ------ |
| F1 fixed                                                | NO     |
| Parent symlink accepted                                 | YES    |
| Intermediate symlink accepted                           | YES    |
| Root symlink accepted                                   | NO     |
| Original instance accepts replacement root              | YES    |
| Root device/inode identity anchored                     | NO     |
| Owner/mode identity preserved                           | NO     |
| Unsafe parent accepted                                  | YES    |
| Check-then-use replacement race remains                 | YES    |
| Concurrent replacement can acknowledge unadmitted bytes | YES    |
| Restart silently accepts symlinked/replaced unsafe root | YES    |
| fsync-before-ack preserved                              | YES    |
| Immutable association preserved                         | NO     |
| Hash/length verification preserved                      | YES    |
| No-ephemeral-fallback preserved                         | YES    |
| Server1–84 unchanged                                    | YES    |
| Server85 required                                       | NO     |
| SQLite1–50 unchanged                                    | YES    |
| SQLite51 required                                       | NO     |
| Normal startup CLOSED                                   | YES    |
| TEST/PRODUCTION CLOSED                                  | YES    |
| UNKNOWN/restart no-resend preserved                     | YES    |
| Response-model witness preserved                        | YES    |
| Safe readback preserved                                 | YES    |
| CP15B F1–F4 preserved                                   | YES    |
| CP13B/CP13A authority preserved                         | YES    |
| sync_operations sole scheduler                          | YES    |
| Five C denials unchanged                                | YES    |
| External provider/network call made                     | NO     |
| Real secret read/provisioned                            | NO     |
| Hosted access                                           | NO     |
| Deployment                                              | NO     |
| Commit                                                  | NO     |
| Push                                                    | NO     |
| New regression                                          | NO     |
| Ready for targeted independent recheck                  | NO     |
| Ready for LIVE-1 now                                    | NO     |

"Immutable association preserved: NO" refers to the demonstrated cross-directory
namespace replacement defect; stable-root immutable duplicate behavior is unchanged.
Owner/mode identity is not anchored even though current final-root/file owner/mode
checks remain. Existing authority preservation answers reflect byte-unchanged code,
not newly rerun tests. Root symlinks still reject; symlinked parents remain accepted.

**STOP — LIVE-W F1 CORRECTION BLOCKED / NOT READY FOR TARGETED INDEPENDENT RECHECK.**
**Ready for LIVE-1 now: NO.**

## TARGETED F1 — LINUX ANCHORED CUSTODY CORRECTION

Date: 2026-10-07. **COMPLETE / READY FOR TARGETED INDEPENDENT F1 RECHECK.**
This Owner-approved Linux-only contract resolves the primitive blocker above;
the earlier blocked attempt and Independent Review are preserved. The spike report
is adopted byte-for-byte at `CP15B_LIVE_W_LINUX_CUSTODY_SPIKE.md` for provenance.

### Enforced boundary and restart continuity

`flightPrivateCustody.ts` now rejects non-Linux before filesystem access. It checks
procfs magic0x9fa0, validates a normalized absolute path and opens every component
from trusted `/` through `/proc/self/fd/<parentfd>/<single-component>` with
O_DIRECTORY/O_NOFOLLOW. Each opened component is fstat-validated: directory,
root/service owner, no group/other write; final root service-owned exactly0700.
No configured pathname is used for ordinary custody I/O after admission. The final
FileHandle stays strongly retained; generated UUID leaves alone are accepted.
Read/create/link/unlink and directory fsync use that anchor. An existing instance
continues against the original admitted device/inode after pathname replacement,
parent symlink insertion or retargeting, or fails closed; it never changes namespace.
Deleted or nonprivate admitted roots fail. `close()` is an owning shutdown operation,
after operations finish, not a way to reopen/rebind an instance.

Admission exercises disposable anchored create, bounded read, hard-link publish,
file fsync, directory fsync and safe leaf cleanup under the final UID. Capability
failure has no pathname fallback. Normal writes exclusively create private0600
leaves, file-fsync before immutable hard-link publication, verify exact existing
content on EEXIST, directory-fsync, unlink temporary leaf, directory-fsync again,
then acknowledge. Reads open O_NOFOLLOW/O_NONBLOCK and validate regular-file,
UID/exact0600 mode, bounded bytes, hash/length/schema and immutable associations.
Failed partial writes/file fsync never publish; failed directory fsync never ACK.
Bytes already published before a later failure remain inspectable recovery evidence.
These are fault-injection/process tests, not physical power-loss guarantees.

Trusted `FlightLiveProvisioning.custody.identity` supplies an opaque store UUID
and expected mount device/inode **outside** the replaceable custody root. The
preprovisioned private `store-identity.json` must match that UUID; startup never
creates its marker or reads the authoritative expectation from it. Device/inode
add same-mount continuity evidence, not reboot/restore identity alone. Metadata
must describe the intended container mount namespace (host stat device values are
not assumed identical). Restore/reboot requires explicit authorized host
reattestation plus retained associations; no automatic replacement acceptance.
`requiredRequest` must verify exact existing private bytes before transport is
constructed, and executor load binds that pin to the owning attempt. Retained
response/result disclosure and installation continue through existing exact
association/current-authority checks. Missing bytes cannot reset Server84 or
permit replay. This is host content-provisioning identity, not another dispatch
journal, call authority, migration or secret. Real provisioning remains unperformed.

Host bind-source ancestry/ACLs are operator responsibility; container admission
cannot inspect/certify those ancestors. No protection is claimed against compromised
host root, Docker administrators or malicious code already running as Backend UID.
The Dockerfile supplies root-owned container ancestors. Optional bind uses
`create_host_path: false` with the approved host/container paths and drops ALL
capabilities. Runtime requires Linux Node24, UID10001 and the **built image's actual
GID**, private mount, read-only root, ordinary private procfs/PID namespace and no
privileged/extra capabilities. Validation used numeric10001:999 (cached Backend GID).
The override enables no runtime/transport/monetary gate and was not deployed.

macOS/Windows real filesystem admission rejects. Portable protocol tests explicitly
inject test custody **and** intercepted HTTP; that seam refuses a missing/default
native fetch. Normal startup never supplies it. It is not production filesystem
admission. The synthetic protocol fixture is test-only, retaining prior portable
protocol scenarios while Linux tests use the actual anchored production store.

### Validation evidence

| Check                                                 | Result                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Linux production custody + LIVE-W protocol suites     | **48 PASS**, 2 intentional skips, 50 cases                                   |
| Portable focused adapter/executor/CP13B/SQLite suites | 331 PASS, 14 platform/optional skips, 6 files                                |
| Actual SQLite50 cold/reopen/FK selection              | 19 PASS, 155 unrelated deselections                                          |
| Actual protected Server84 protocol E2E                | PASS; 1 selected, 34 deselected; one intercepted send                        |
| Fresh exact Server1–84 replay / Server84 security     | PASS / 104 checks PASS, provider calls0, final gates CLOSED                  |
| Corrected full suite                                  | 2,613 PASS, 1 existing Ledger failure, 14 platform/optional skips; 204 files |
| Repeated exact-base full suite                        | 2,577 PASS, same1 Ledger failure; 202 files                                  |
| New full-suite failures                               | **0**                                                                        |
| Typecheck / lint + UI guard / Backend build           | PASS                                                                         |
| Formatting / whitespace / preservation                | PASS                                                                         |

The full-suite failure remains `src/domain/architectureBoundary.test.ts:41`, reproduced
again against exact base `56a050c0063bd062cb0bac7f50b928dfeb79ca6f` with identical
installed dependencies, runner flags and TCP/fetch-denial preloader. No new failure
was classified baseline. Initial Linux assertions expecting older error classes were
corrected to the earlier fail-closed continuity/platform boundaries, then passed.

Linux validation ran in a task-owned Docker volume/container, cached Node24 image,
network none, read-only root, cap-drop ALL, no-new-privileges and UID10001:GID999.
Because the available Vitest native bundler installation is macOS-only, the same
production-owned test sources were bundled with installed esbuild for Linux. An
external Node-test adapter reused installed Vitest assertion/spy libraries; it changed
suite registration only, not production code or assertions. Normal Linux CI may run
these Vitest files directly with a Linux-compatible installed runner. The external
adapter is `/private/tmp/live-w-linux-vitest-adapter.ts`; bundles/logs are outside Git.
No new runtime/test dependency is added. TCP/fetch were additionally denied explicitly.

Linux native custody tests cover original review vectors, root/parent/intermediate
symlinks, lexical traversal, writable/wrong-owner/nonprivate/missing/non-directory
paths, copied-marker replacement restart, fresh child-process admission/replacement, equal/conflicting32-way puts,50 concurrent
replacement cycles, deterministic replacement during temp write/before link, all
acceptance/raw/result indexes, leaf symlinks, content bounds/hash/length/mode,
file/directory-fsync/partial-write failures, deleted roots and unavailable procfs/
capability. Protocol tests cover response retention/recovery, missing request pins,
restart/UNKNOWN/mark ACK loss, secret rotation, kill/grant/budget/scope/config/Trip
revocation, model witness, safe readback, one send and no retry/fallback.

The Linux production-composition E2E uses injected trusted SQL protocol fixtures;
the actual Server84 E2E uses synthetic portable custody plus intercepted HTTP on
macOS. The two checks validate the native custody/protocol chain and protected SQL
chain respectively; they do **not** claim an actual deployed Linux SQL connector,
mount or provider integration. Existing native SQLite owning-repository tests cover
real transactional installation/cold recovery; the protocol E2E checks its owning
installation seam. No canonical Event execution is performed.

All88 preservation hashes, all Server1–84 and SQLite migration/registry bytes match
exact base. No Server85/SQLite51. Independent Review SHA remains
`513e77836ad6ea7b152356f6bed8c01dba04651ff0ecef81cd7ee08030f1d240`.
No transport/resolver/gateway/dispatch redesign or secret/control-plane content change.
CP15B F1–F4, inbound/outbound firewall, CP13A/B, central scheduler/five C denials
remain preserved and their regressions pass in the focused/full suites.

### Exact additional scope for this correction

Modified: `backend/src/flightPrivateCustody.ts`, `backend/src/flightLiveHost.ts`,
`backend/src/flightLiveHost.test.ts`, `deploy/dev-backend/Dockerfile`,
`deploy/dev-backend/compose.flight-custody.closed.yml`,
`docs/adr/2026-10-07-cp15b-closed-live-host-wiring.md`,
`docs/ops/DEV_BACKEND_DEPLOYMENT.md`, `docs/ops/DEV_BACKEND_RUNBOOK.md`,
`docs/CURRENT_IMPLEMENTATION_STATE.md` and this Builder report.

New: `backend/src/flightPrivateCustody.test.ts`,
`backend/src/__fixtures__/flightProtocolCustody.ts`,
`docs/architecture/CP15B_LIVE_W_LINUX_CUSTODY_SPIKE.md` (byte-identical adoption).
Independent Review is untouched. Earlier LIVE-W pending scope remains unchanged
except these stated corrections. All work remains unstaged/uncommitted. Task-owned
containers/volume, dependency symlinks and build output are removed after checks.

### Final required answers

| Required answer                                         | Result |
| ------------------------------------------------------- | ------ |
| F1 fixed                                                | YES    |
| Linux-only live custody enforced                        | YES    |
| macOS real live custody possible                        | NO     |
| Windows real live custody possible                      | NO     |
| Procfs capability verified before live construction     | YES    |
| Parent symlink accepted                                 | NO     |
| Intermediate symlink accepted                           | NO     |
| Root symlink accepted                                   | NO     |
| All normal custody I/O uses retained root FD            | YES    |
| Original instance switches to replacement pathname      | NO     |
| Concurrent replacement can acknowledge unadmitted bytes | NO     |
| Immutable hard-link publish used                        | YES    |
| Ordinary rename used as immutable publish               | NO     |
| fsync-before-ack preserved                              | YES    |
| Equal duplicate idempotent                              | YES    |
| Conflicting duplicate rejected                          | YES    |
| Restart continuity independently verified               | YES    |
| Fresh owner/mode admission alone sufficient             | NO     |
| Replacement empty root can reopen live transport        | NO     |
| Missing retained content can authorize redispatch       | NO     |
| Native addon introduced                                 | NO     |
| Privileged container required                           | NO     |
| Extra Linux capability required                         | NO     |
| Server1–84 unchanged                                    | YES    |
| Server85 required                                       | NO     |
| SQLite1–50 unchanged                                    | YES    |
| SQLite51 required                                       | NO     |
| Normal startup CLOSED                                   | YES    |
| TEST/PRODUCTION CLOSED                                  | YES    |
| UNKNOWN no-resend preserved                             | YES    |
| Response-model witness preserved                        | YES    |
| Safe readback preserved                                 | YES    |
| CP15B F1–F4 preserved                                   | YES    |
| CP13B/CP13A authority preserved                         | YES    |
| sync_operations sole scheduler                          | YES    |
| Five C denials unchanged                                | YES    |
| External provider/network call                          | NO     |
| Real secret                                             | NO     |
| Hosted access                                           | NO     |
| Deployment                                              | NO     |
| Commit                                                  | NO     |
| Push                                                    | NO     |
| New regression                                          | NO     |
| Ready for targeted Independent F1 recheck               | YES    |
| Ready for LIVE-1 now                                    | NO     |

**STOP — LIVE-W F1 LINUX CUSTODY CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**
**Ready for LIVE-1 now: NO.**

Fresh-process continuity is additionally exercised by spawning a new Linux Node process
with separately supplied expected identity/request pin and a bundled production store
module (`F1_CUSTODY_MODULE` test-only path). It reads the original store successfully;
a replacement with the copied marker remains CLOSED. The child has no retained parent
FileHandle. The production module is bundled with installed esbuild, not rewritten.
To repeat this optional case, bundle `backend/src/flightPrivateCustody.ts` and provide
its absolute Linux path through that test variable. No Backend startup uses that env.

## TARGETED F1-R1 — PORTABLE TEST-SEAM CORRECTION

Date: 2026-10-07. **COMPLETE / READY FOR TARGETED F1-R1 INDEPENDENT RECHECK.**
Recovered targeted review read in full. Independent Review is untouched, SHA-256
`a52c3c1f4556bbbadbeebee8628f5bb6c989d5c47c3aa12aa2eb1acd5b03da1c`.
Earlier blocked/corrected F1 attempts remain historical; this section supersedes
claims that the portable seam was safe inside the real-capable production factory.

### Implemented boundary

`createDevFlightLiveHost` accepts only environment/getter/acceptance/custody path/
trusted provisioning. Its runtime key allowlist rejects legacy or arbitrary capability
inputs from untyped callers. There is no fetch/custody/transport/resolver override,
no portable branch and no function-identity/shape comparison. For configured DEV,
it always calls `createFlightPrivateCustody`, validates independent identity/request
continuity and immutable acceptance, then constructs `createFlightHttpsSend()` with
its native default. The acceptance remains frozen. No caller-supplied capability can
substitute Linux/procfs/anchored path/private mount admission. Unknown keys reject
before even reading configuration. Legitimate trusted issuer/session/workflow
provisioning remains the previously approved dependency boundary, unprovisioned in
normal startup; no synthetic verifier default/import is introduced.

Portable root `createFlightProtocolTestHost` is solely in
`backend/src/__fixtures__/flightProtocolHost.ts`. It uses its own fixture-only
credential literal, accepts deterministic response fixtures/test custody and tags
transport NETWORK_DISABLED_PROTOCOL. It has no real-resolver input and never imports
or constructs the real environment resolver or HTTPS transport. It is not exported
by live-host, imported by server, reachable through environment/Mobile/HTTP or included
in the Backend bundle. Tests cannot turn a function wrapper into production admission.
Network denial is validation containment, not an application security decision.

Compositions share the existing executor/adapter state machine and pure validation,
model witness, response parsing/rebinding plus exact recovery/readback logic under
`flightHostProtocol.ts`. That module exports no host composition constructor, secret
lookup or HTTP constructor. Capability acquisition/wiring is separate. The fixture
private assembler is excluded from production. The adapter's explicit protocol-fixture
tag retains test readiness/model/retention checks without representing real transport.

`flightHttpsTransport.ts` isolates the actual bounded HTTPS send. Its low-level injected
HTTP seam is used only for direct unit tests and cannot construct a production host.
Production calls its constructor without an override, downstream of custody continuity.
Fixed URL, POST, Authorization/redirect handling,30-second abort/deadline, bounded
streaming/cleanup and no retry remain unchanged.

### Validation

| Check                                                          | Result                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reviewer A–G                                                   | PASS; each rejects LIVE_HOST_INPUT_CLOSED before getter/handoff                                                        |
| Production exports/config/source/bundle audit                  | PASS; four legitimate runtime live-host exports; no fixture/package export route                                       |
| Actual normal server startup                                   | Seven combinations PASS; intercepted listen, zero provider send; initializer reads no environment without provisioning |
| Additional unprovisioned initializer matrix                    | Seven combinations PASS; CLOSED, zero getter calls                                                                     |
| Linux custody/protocol/direct HTTPS suites                     | **63 PASS**,2 intentional skips,65 cases                                                                               |
| Focused LIVE-W/CP13B/SQLite/transport/isolation/startup suites | 361 PASS,15 platform/optional skips;9 files                                                                            |
| Protected actual Server84 protocol E2E                         | 1 PASS,42 deselections; one deterministic intercepted response                                                         |
| Fresh Server1–84 / security matrix                             | PASS /104 checks PASS, final gates CLOSED, provider calls0                                                             |
| SQLite50 cold/reopen/FK selection                              | 19 PASS,155 unrelated deselections                                                                                     |
| Full application suite                                         | 2,643 PASS, one same Ledger failure,15 platform/optional skips;207 files                                               |
| Repeated exact-base full suite                                 | 2,577 PASS, same Ledger failure;202 files                                                                              |
| New final full-suite failures                                  | **0**                                                                                                                  |
| Typecheck / lint including UI guard / Backend build            | PASS; final lint no warnings                                                                                           |
| Formatting / whitespace / preservation                         | PASS                                                                                                                   |

A–G include direct, wrapped, bound, proxy/delegating and deferred native-fetch functions,
plus absent configured root and wrong identity. They are rejected as unsupported
capability inputs; zero environment/handoff calls. Additional Linux production checks
without those fields reject absent/wrong custody, then construct only after real
admission and request continuity. Under explicit denied global networking, the actual
production default send attempt retains UNKNOWN; a second execution rejects and the
portable response spy stays unused. This is production-composition network-denied
E2E evidence, not a successful provider call. Portable positive CP13B E2E and actual
protected SQL chain are separate test-root checks; neither is represented as deployed
issuer/session provisioning or real SQLite installation of that Candidate.

Direct transport units verify fixed destination/POST/Authorization, wrong origin,
redirect/destination mismatch, response bound/reader cleanup, timeout/abort and loss
with one call and no retry. Linux suites also rerun the original filesystem F1 vectors,
immutable duplicates, concurrency, failed writes/fsync and fresh child-process restart
continuity. Production custody source/tests and adopted spike remain byte-identical
against the recovered-review entry hashes. The Linux harness still uses the inspected
external Node-test registration adapter with installed Vitest assertions/spies, bundled
from production-owned sources; no dependency added. Runtime is cached Linux Node24,
UID10001:GID999, read-only root, cap-drop ALL, no-new-privileges, network none. Global
fetch/TCP denial adds containment. Native custody and transport tests use fake values
only; no process secret, provider, Hosted or deployment access.

The sole final full-suite failure is `src/domain/architectureBoundary.test.ts:41`,
reproduced on exact base `56a050c0063bd062cb0bac7f50b928dfeb79ca6f` with identical
installed dependencies/runner/network denial. An intermediate import cleanup produced
three module parse failures; those were corrected and affected/full checks rerun.
They were **not** classified baseline. Final results contain zero new failures.

Compiled-bundle audit builds server into a disposable directory, inspects dependency
inputs (no fixtures/tests) and rejects old branch/factory tokens or fetch-identity gates.
It also checks server imports, package exports and the production module surface.
Actual startup matrix imports server with synthetic env and intercepted HTTP listener;
existing unrelated scanner requests are denied. No environment flag can reach fixtures.

Server1–84, SQLite1–50 and central sync tracked bytes equal exact base; all88 preservation
hashes match. No Server85/SQLite51, native addon, new dispatch/scheduler/canonical
ownership or monetary activation. CP15B F1–F4, UNKNOWN/no-resend, model witness,
secret redaction/currentness, CP13A/B, firewall and five C denials remain preserved.
Real issuer/session/workflow/mount/secret/model-price revalidation and LIVE-1 approval
remain future prerequisites.

### Exact additional scope

Modified: `backend/src/flightLiveHost.ts`, `backend/src/deepSeekFlight.ts`,
`backend/src/flightLiveHost.test.ts`, `docs/adr/2026-10-07-cp15b-closed-live-host-wiring.md`,
`docs/CURRENT_IMPLEMENTATION_STATE.md` and this Builder report.

New: `backend/src/flightHostProtocol.ts`, `backend/src/flightHttpsTransport.ts`,
`backend/src/__fixtures__/flightProtocolHost.ts`, `backend/src/flightHostBoundary.test.ts`,
`backend/src/flightHttpsTransport.test.ts`, `backend/src/flightLiveStartup.test.ts`.
Prior pending LIVE-W files are otherwise preserved. No Independent Review edit.
Work remains unstaged/uncommitted. Temporary dependency links/build output and
all task-owned Linux/SQL containers/volume are removed after validation.

### Final required answers

| Required answer                                             | Result |
| ----------------------------------------------------------- | ------ |
| F1-R1 fixed                                                 | YES    |
| Production factory accepts protocolTestCustody              | NO     |
| Production factory accepts arbitrary custody override       | NO     |
| Production factory accepts arbitrary fetch override         | NO     |
| Production live transport requires Linux anchored custody   | YES    |
| Fetch identity/function shape remains a security boundary   | NO     |
| Portable test factory structurally separate                 | YES    |
| Portable test factory included in production bundle         | NO     |
| Portable test factory can use real secret resolver          | NO     |
| Portable test factory can construct real DeepSeek transport | NO     |
| Wrapped native fetch bypasses Linux custody                 | NO     |
| Bound native fetch bypasses Linux custody                   | NO     |
| Proxy fetch bypasses Linux custody                          | NO     |
| Missing custody root bypass possible                        | NO     |
| Wrong custody identity bypass possible                      | NO     |
| Original filesystem F1 remains fixed                        | YES    |
| Restart continuity preserved                                | YES    |
| Server1–84 unchanged                                        | YES    |
| SQLite1–50 unchanged                                        | YES    |
| Server85/SQLite51 required                                  | NO     |
| Normal startup CLOSED                                       | YES    |
| TEST/PRODUCTION CLOSED                                      | YES    |
| UNKNOWN no-resend preserved                                 | YES    |
| Secret boundary preserved                                   | YES    |
| Response-model witness preserved                            | YES    |
| Safe readback preserved                                     | YES    |
| CP15B F1–F4 preserved                                       | YES    |
| CP13B/CP13A preserved                                       | YES    |
| sync_operations sole scheduler                              | YES    |
| Five C denials unchanged                                    | YES    |
| External provider/network call                              | NO     |
| Real secret                                                 | NO     |
| Hosted access/deployment                                    | NO     |
| Commit                                                      | NO     |
| Push                                                        | NO     |
| New regression                                              | NO     |
| Ready for targeted F1-R1 independent recheck                | YES    |
| Ready for LIVE-1 now                                        | NO     |

**STOP — LIVE-W F1-R1 CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**
**Ready for LIVE-1 now: NO.**

## FINAL LOW R1-C1 — STRICT LIVE-HOST INPUT GRAMMAR

Date: 2026-10-07. Only the remaining LOW runtime input-contract finding is changed.
The production factory still has the same five supported field names: `environment`,
`getEnvironment`, `acceptance`, `custodyDirectory`, `provisioning`. Optional fields
remain optional. The intended input form is an ordinary plain data object whose
prototype is exactly `Object.prototype`; null-prototype records are unnecessary for
normal callers and rejected. Custom prototypes/classes and native-detectable proxies
(including revoked proxies) reject. The standard prototype may carry only its built-in
key names; added inherited unknown/capability/symbol fields reject too.

The guard uses complete `Reflect.ownKeys` inspection and own property descriptors,
rejecting every unknown string key (including hidden properties), every symbol and
all own accessors without evaluating them. Node's built-in `types.isProxy` rejects
proxy traps before prototype/key/property operations. Invalid input raises
`LIVE_HOST_INPUT_CLOSED` before reading the configuration getter, admitting custody,
reading a secret, constructing gateway/transport or dispatching. No function identity,
portable production composition or capability override is introduced. The existing
Linux custody/continuity → internally selected HTTPS chain is otherwise unchanged.

### Validation and scope

- A normal exact five-field plain input reaches the legitimate configuration gate
  (CLOSED for absent workload reference); ordinary startup call shapes still pass.
- Eighteen rejected strict-input cases cover required B–J, own/hidden accessors,
  symbol accessors, proxies/revocation, null prototype and standard-prototype
  pollution. All assert zero configuration/secret-key reads, accessor/trap calls,
  custody admission, gateway/transport construction, Server84 handoff and native fetch.
- Seven-file focused LIVE-W run: **204 PASS**,2 intentional platform/optional skips.
  Includes original A–G, export/bundle/fixture isolation, direct fixed HTTPS units,
  seven actual normal-startup combinations, adapter and CP13B regressions.
- Additional six-file CP13A/B/SQLite50/persistence/sync preservation run: **328 PASS**.
  This independently includes the final strict-input test bytes after lint comments;
  counts overlap the focused run and are not summed. Explicit cold/reopen selection:
  **12 PASS**,162 unrelated deselections, using real file-backed SQLite with FK enabled.
- Linux custody/host/HTTPS rerun: **63 PASS**,2 intentional skips. Original path
  symlinks/replacement/concurrency/immutable-publish and fresh-child restart checks
  pass. Actual production composition without overrides admits only correct trusted
  custody, then records UNKNOWN for denied native networking and refuses resend.
  Portable fixture response remains unused by that production control.
- Fresh unchanged Server1–84 replay PASS; actual protected Server84 security matrix:
  **104 checks PASS**, final gates CLOSED,100 synthetic holds, provider calls0.
- Central scheduler/five unconditional C denials: **24 PASS**.
- Typecheck, lint/UI guard (no warnings), Backend build, correction formatting and
  whitespace PASS. Compiled Backend contains no fixture/test root or legacy bypass.

Only `backend/src/flightLiveHost.ts`, `backend/src/flightHostBoundary.test.ts`, this
report and the current-state handoff change in this correction. Custody source/tests,
transport/shared/fixture composition, server/startup, accepted protocol/executor,
Server1–84, SQLite1–50 and sync remain byte-identical to the correction entry. All155
tracked migration/data-db/sync files also equal the exact accepted base. No dependency,
migration, second authority, endpoint or activation. Independent Review SHA-256 remains
`79979d7f1e0cfb96f45b0fd3ec150981d22020ab3a520305bcdbbe9cccb8dc88`.

Full suite was not rerun: this change only tightens invalid outer input grammar,
normal callers and affected checks pass, and no broader behavior change/regression
appeared. Prior independently confirmed exact-base Ledger failure is unchanged;
prior full counts are historical evidence, not a new full run for R1-C1.

Validation used synthetic data only, macOS outbound-IP denial plus the existing
TCP/fetch preloader, and cached Linux Node24 with network none, read-only root,
UID10001:GID999, cap-drop ALL and no-new-privileges. Initial nested-sandbox and Docker
file-staging setup errors were repaired before successful reruns; they were not
classified as application/baseline failures. The temporary local runner image contains
only copied synthetic bundles/denial code; no environment file or real credentials.
Task-owned containers/image, dependency link and build output are removed after
validation. No Hosted access, deployment, real secret/provider call, commit or push.

### Final required answers

| Required answer                                   | Result |
| ------------------------------------------------- | ------ |
| R1-C1 fixed                                       | YES    |
| Enumerable unknown own field accepted             | NO     |
| Non-enumerable unknown own field accepted         | NO     |
| Symbol field accepted                             | NO     |
| Custom prototype accepted                         | NO     |
| Inherited capability field accepted               | NO     |
| Class instance accepted                           | NO     |
| Rejected unknown input can invoke getter          | NO     |
| Rejected unknown input can reach custody          | NO     |
| Rejected unknown input can reach secret resolver  | NO     |
| Rejected unknown input can reach Server84 handoff | NO     |
| Rejected unknown input can reach network boundary | NO     |
| F1-R1 remains fixed                               | YES    |
| Original filesystem F1 remains fixed              | YES    |
| Portable fixture remains production unreachable   | YES    |
| Server1–84 unchanged                              | YES    |
| SQLite1–50 unchanged                              | YES    |
| Server85/SQLite51 required                        | NO     |
| Normal startup CLOSED                             | YES    |
| TEST/PRODUCTION CLOSED                            | YES    |
| UNKNOWN no-resend preserved                       | YES    |
| CP15B F1–F4 preserved                             | YES    |
| CP13B/CP13A preserved                             | YES    |
| sync_operations sole scheduler                    | YES    |
| Five C denials unchanged                          | YES    |
| Runtime/provider gates CLOSED                     | YES    |
| External provider/network call                    | NO     |
| Real secret                                       | NO     |
| Hosted access/deployment                          | NO     |
| Commit                                            | NO     |
| Push                                              | NO     |
| New regression                                    | NO     |
| Ready for final targeted Independent recheck      | YES    |
| Ready for LIVE-1 now                              | NO     |

**STOP — LIVE-W R1-C1 CORRECTION COMPLETE / READY FOR FINAL TARGETED INDEPENDENT RECHECK.**
**Ready for LIVE-1 now: NO.**
