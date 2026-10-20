# CP15B — stopped at prerequisite gate

Date: 2026-10-07 (Pacific/Auckland).

## Status

CP15B complete: **NO**. Server84 authored: **NO**. Ready for independent CP15B review: **NO**.

Fresh worktree: `/Users/xoery/.codex/worktrees/cp15b-real-dispatch-foundation/otr-mobile-canonical`.
Branch: `intelligence/cp15b-real-dispatch-foundation`.
Exact clean starting HEAD: `b973f039dfd6405d302409252ddbdc8f70584159`.

## Blocking prerequisite

The execution instruction requires reading `CP15_FIRST_INTELLIGENCE_ACTIVATION_PREFLIGHT.md`
and mapping every proposed Server84 change to approved CP15A requirements before SQL.
That preflight is absent from the exact base's file inventory and from Downloads.
Downloads contains only the supplied CP15B instruction. No substitute approval or
preflight was inferred. Execution stopped before proposing or authoring Server84 SQL.
Resume requires the approved CP15A preflight and its approval evidence; retain the exact base.

## Startup preservation evidence

- Fresh worktree initially clean; canonical checkout's existing changes untouched.
- Server chain contains83 migrations, ending at `20261006000100_external_integration_persistence.sql`.
- All82 historical Server hashes match the accepted CP14 baseline manifest.
- Server83 SHA256: `c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`.
- SQLite50 SHA256: `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
- Both tail hashes match the accepted Final Closure Review; its appended targeted recheck is PASS with zero remaining IMPORTANT findings.
- Server83 still structurally requires `runtime_enabled=false`.
- Exact preservation hashes are recorded in `CP15B_STARTUP_PRESERVATION_HASHES.json`.

## Work not reached

No implementation or runtime validation was performed. The Server84 mapping,
security/budget foundation, adapter fixtures, remote envelope/minimizer/rebinding,
and CP15B validation matrix remain pending. No conclusion about their compliance
or need for SQLite51 is claimed. No current-state/API/model/offline contract was
changed because no CP15B CLOSED implementation fact was introduced.

Server1–83 unchanged: **YES**. SQLite50 unchanged: **YES**. SQLite51 authored: **NO**.
Scheduler and five C denial code unchanged: **YES**. Runtime/provider gates activated: **NO**.
Real secret read/provisioned: **NO**. Real DeepSeek call: **NO**.
Hosted Dev/Production accessed: **NO**. Commit: **NO**. Push: **NO**.

**STOP — REQUIRED CP15A PREFLIGHT UNAVAILABLE / BEFORE SERVER84 SQL.**

## OWNER PREREQUISITE RESOLUTION

The original stop was valid. Owner supplied the normative CP15A source from its
retained `intelligence/cp15a-activation-preflight` worktree, verified at exact base
`b973f039dfd6405d302409252ddbdc8f70584159`. Its preflight is complete/ready for Owner
Review and records Server84 YES, SQLite51 NO, DeepSeek/deepseek-flash, Production
CLOSED and no real call/secret/migration/production change. Adopted byte-for-byte;
SHA256: `10140ecb152dd8beef392e35e38c6f59dfcc97ab65a46e8a21c952b25304f5d1`. Owner approved its architecture with
the CP15B overlay: DEV Flight only, 8192/2048 tokens, 1 concurrent/account,
20/account/day, 100/DEV/day and 100/DeepSeek/day. No live monetary values approved;
missing monetary policy denies dispatch. No activation is authorized. Existing
CP15B worktree/branch/base are unchanged. Server84 implementation may proceed
under the original instruction and hard gates.

## Server84 pre-implementation mapping

Normative references below are sections of the adopted CP15A preflight, modified
only by the recorded Owner overlay. No SQL has been authored at this gate.

| Proposed additive change                                                                                                       | Approved requirement                                                           |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| DEV-only runtime CHECK and dedicated SECURITY_ADMIN runtime command                                                            | §9.1, §9.6; TEST/Production structural closure, false/killed defaults          |
| Versioned inactive DEV/FLIGHT_IMPORT_V1/DeepSeek scope and explicit selection, exact immutable pins and hard resource ceilings | §5, §9.2; Owner 8192/2048, 1 concurrent, 20/100/100 calls                      |
| Account grant expiry/revocation/revision/CAS; current Trip authorization                                                       | §5, §9.2, §9.6                                                                 |
| Immutable holds tied to existing call+START, existing locks, UTC admission day, no automatic release                           | §9.3, §13; no second usage/cost ledger; absent monetary policy denies          |
| Workload-bound reserve/mark roots; old generic/inbound/synthetic calls never qualify                                           | §9.5, §14; fresh dispatch gate independent of reservation                      |
| Safe nullable provider request identity in existing usage events; old observations remain null                                 | §9.4, §12                                                                      |
| Role/RLS/request-binding/audit/CAS restrictions and actual-root compatibility tests                                            | §9.6, §17; dedicated gateway authentication remains CP14 VerifiedCallContextV1 |

Implementation must retain the old reserve/dispatch acceptance contract as CLOSED
for all old generic calls, even if DEV runtime is enabled by a fixture. No new
secret, scheduler, local migration, canonical authority, client route or deployed
runtime is proposed. If these changes require weakening accepted authority or
persisted evidence equality, stop before SQL. Security scope ceilings remain
independent of CONFIG_ADMIN generic configuration proposals.

## Remote Run persistence trace — before implementation

The existing CP13B local v1 request/response descriptor is strictly LOCAL_ONLY.
`interpretFlightBatch` additionally rejects network_required and every execution
location other than DETERMINISTIC_LOCAL. Its configuration digest is the exact
`flightInterpretationConfiguration(batch)` matching/lineage configuration. These
checks must remain unchanged for local v1.

The owning `trip_source_runs` SQLite49 and Server CP13A catalogs contain
extractor_key, extractor_version and extractor_options_sha256, not a descriptor
JSON column. The catalog DTO is a strict object. SQLite50's existing generic
attempt descriptor_snapshot JSON (16384 bytes), immutable request-material refs
and response-material refs can carry a versioned remote descriptor, and the
existing publication tuple can correlate the result. This is a potential reuse
path, not proof of a completed truthful remote Run implementation. No SQLite51
requirement has been established. Full conformance still must prove the exact
Run→attempt/config/evidence/execution/usage association and cold-restart recovery
without assigning canonical authority to an attempt or relabelling remote work.

No new hard-gate failure has been established by this trace. Server84 SQL and all
CP15B implementation/validation remain pending; there is no completion claim.

## CP15B implementation progress — Owner continuation executed

The Owner accepted prerequisite resolution and pre-implementation mapping and
explicitly authorized implementation in this existing worktree. No new hard-stop
condition has been established. Historical stop/resolution text above is unchanged.

Server84 is one forward migration; it seeds no active scope, grant, price or
credential. Runtime is DEV-only under dedicated Security Admin authority, with
independent scope/Account/Trip/config/resource gates. Calls, START and holds are
atomic under the existing locks; holds are immutable and retain UTC admission day.
Generic/synthetic/inbound calls cannot obtain dispatch merely by enabling DEV.

The network-disabled Backend adapter fixes destination/model/profile, sanitizes
finite failures, bounds payload/deadline, parses nullable usage and safe completion
ID, and exposes no live resolver/transport construction. Private request custody
is exact canonical JSON. Mark ACK is required before one transport; lost ACK is
UNKNOWN and zero fetch. Retention precedes meter/install, and recovery never fetches.

The remote v2 descriptor is truthful REMOTE_MODEL/REMOTE_ALLOWED; local v1 retains
its version/privacy grammar. The minimizer admits only deterministic whitelisted
Flight spans, excluding raw attachment/contact/booking/payment/instruction/URL
content from provider text. Unsupported private dimensions remain local deferred
evidence. Wire output cannot contain normalized canonical values or trusted IDs.
Host rebinding re-verifies pins and exact UTF-8 spans, normalizes deterministically,
and uses the existing CP13B matching/proposal core and CP13A authority boundary.

SQLite50 conformance passed with an actual file cold reopen, immutable descriptor/
request and response references, original evidence, call/usage correlation and
publication UUID/digests. Foreign keys remain clean and schema tail remains50.
This proves the accepted generic descriptor/material/publication reuse candidate;
no SQLite51, raw/evidence relaxation, second scheduler or canonical redesign was
needed. Final validation and required YES/NO answers follow after completion.

## CP15B final implementation results — CLOSED / independent review ready

This appended section is the current result; the prerequisite stop, resolution and
pre-implementation mapping above remain historical. All authorized CLOSED work is
complete. No new hard stop occurred. There is no live activation or deployment.

### Implemented boundaries and important files

- `supabase/migrations/20261007000100_flight_dev_dispatch_foundation.sql`: Server84
  additive DEV Security Admin roots, immutable selected scope/Account grants,
  budget/resource holds, workload-bound reserve and existing mark/usage guards.
  Only four existing protected function bodies are extended; historical migration
  sources remain byte-identical. No active scope, grant, price or credential is seeded.
- `backend/src/deepSeekFlight.ts`, `flightDevDispatch.ts`, `flightUsage.ts`:
  Backend-private injected resolver, fixed network-disabled adapter, acknowledged
  handoff, private custody/recovery, immutable schedule usage/cost and minimized
  operational facts. These modules have no installed live factory/public endpoint.
- `src/domain/intelligence/remoteFlightText.ts` and versioned descriptor/binding
  extensions: deterministic request minimization, strict remote schema, original
  UTF-8 evidence rebinding, host normalization and truthful REMOTE_MODEL metadata.
- Existing CP13B interpretation, SQLite50 generic attempt/material/publication
  and continuation repository facilities are extended narrowly. Existing
  `sync_operations` remains the sole scheduler. Local v1 remains LOCAL_ONLY.
- ADR `2026-10-07-cp15b-closed-dev-flight-dispatch.md` and incremental API/data/offline
  handoff updates describe only these implemented CLOSED facts.

### Validation results

| Validation                                                 | Result                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Fresh Server1→84 replay                                    | PASS; no active scope/grant/hold, DEV disabled/killed                                                    |
| Seeded Server83→84 replay                                  | PASS; old rows/columns and unaffected public functions preserved                                         |
| Unchanged Server83 acceptance against Server84             | PASS; 548 checks plus 75 residual checks                                                                 |
| Server84 actual protected roots/security torture           | PASS; 104 checks, 100 retained holds, 0 provider calls, all gates closed at end                          |
| UTC admission-day association / new API execute denial     | PASS; all 100 holds retain call admission UTC day; four roots deny public/API roles                      |
| Unchanged Trip/Event/source/Flight SQL tests               | PASS; 841 checks across seven acceptance files                                                           |
| Actual CP13A C1 UNKNOWN/C2/C3 shared-lock race             | PASS; both waiters serialize, rollback restores closed authority, no escaped writes/deadlock             |
| Existing A2 reservation bridge against Server84            | PASS; exact call+START/replay, real mark remains closed, fresh kill exclusion/history preserved          |
| Adapter/executor adversarial tests                         | PASS; 45 adapter plus 16 executor cases; explicit A→B→A test rerun passes                                |
| CP13B actual remote core / SQLite50 cold reopen            | PASS; truthful binding, exact original evidence, retained install-only recovery, FK clean, schema tail50 |
| Full application suite                                     | 2,557 PASS / 1 FAIL; 202 files, 2,558 tests                                                              |
| Exact-base comparison                                      | 2,494 PASS / same 1 FAIL; 200 files, 2,495 tests; no new failure                                         |
| Typecheck / lint / UI guard                                | PASS; guard checks 76 representative UI files, 473 existing legacy occurrences                           |
| Backend build / standalone closed Flight foundation bundle | PASS                                                                                                     |
| Changed-file formatting / whitespace                       | PASS                                                                                                     |
| Preservation hash manifest                                 | PASS; all 88 recorded baseline files unchanged                                                           |
| Normative CP15A preflight                                  | PASS; byte-identical to approved source                                                                  |
| Git                                                        | Exact base/branch retained; no staged files, commit or push                                              |

The full-suite failure is the pre-existing
`src/domain/architectureBoundary.test.ts:41` Ledger UI/data import boundary failure.
The exact-base archive reproduces it; CP15B introduces no additional failure.
Capture/Day/Ledger, Account/Trip, sync, B2 firewall, five C denials and unchanged
local migrations are exercised by the full suite and original protected SQL tests.

Security/adversarial coverage includes TEST/PRODUCTION structural rejection,
CONFIG_ADMIN activation denial, private-role/RLS/request binding, wrong workload/
provider/model/config/Account/Trip/revision/expiry, monetary denial, conservative
worst-case price bounds, concurrent Account second call, 21st Account-day and
101st DEV/DeepSeek-day denial, exact replay without duplicate START/hold, and
UNKNOWN without refund or redispatch. Fresh kill/config/scope/grant/budget/Trip
changes before mark deny transport. Lost mark ACK, concurrent execution, missing/
revoked secret and Account A→B→A retain responsibility without an unauthorized fetch.

HTTP/auth/redirect/deadline/cancellation/response-loss cases use only injected
network-disabled fixtures. Malformed/incomplete/semantic-invalid/oversized output,
invented evidence, instruction/URL injection, altered opaque maps, stale original
material and mismatched spans are rejected. Nullable partial/cache/reasoning usage,
safe request IDs, pinned rational costs and retained-response recovery are tested.
Original authority tests retain stale Candidate/Event/install fences and inbound
firewalls. No model output gains canonical, booking or participant authority.

Fixture harness adjustments are limited to task-owned network-none containers,
the historical SQL files' required login contexts, excluding the newly nullable
usage column from old strict fixture commands, and avoiding Python TextIO read-ahead
when observing the original race barrier. Original acceptance sources are unchanged.

### Final required answers

| Required answer                                  | YES/NO |
| ------------------------------------------------ | ------ |
| CP15B complete                                   | YES    |
| Server84 authored                                | YES    |
| Server1–83 unchanged                             | YES    |
| SQLite51 required                                | NO     |
| TEST real dispatch structurally CLOSED           | YES    |
| PRODUCTION real dispatch structurally CLOSED     | YES    |
| DEV runtime default CLOSED                       | YES    |
| SECURITY_ADMIN sole activation authority         | YES    |
| CONFIG_ADMIN can activate runtime                | NO     |
| FLIGHT_IMPORT_V1 exact scope enforced            | YES    |
| Account allowlist enforced                       | YES    |
| Input ceiling 8192                               | YES    |
| Output ceiling 2048                              | YES    |
| Concurrent/account 1                             | YES    |
| Account/day 20                                   | YES    |
| DEV/day 100                                      | YES    |
| DeepSeek/day 100                                 | YES    |
| Missing monetary policy denies dispatch          | YES    |
| Automatic refund on UNKNOWN possible             | NO     |
| Provider deepseek-flash pinned                   | YES    |
| Vision enabled                                   | NO     |
| Commercial fallback enabled                      | NO     |
| Real secret read/provisioned                     | NO     |
| Real DeepSeek call made                          | NO     |
| Network-disabled adapter conformance implemented | YES    |
| Remote envelope truthful/non-LOCAL_ONLY          | YES    |
| Text minimization implemented                    | YES    |
| Raw attachment default                           | NO     |
| Evidence rebinding uses original spans           | YES    |
| Model normalized values trusted directly         | NO     |
| CP13B authority preserved                        | YES    |
| CP13A authority preserved                        | YES    |
| Provider request ID safe/nullable                | YES    |
| Missing usage remains UNKNOWN                    | YES    |
| Server authoritative usage/cost preserved        | YES    |
| Inbound automatically invokes outbound           | NO     |
| Synthetic harness production reachable           | NO     |
| sync_operations sole scheduler                   | YES    |
| Five C denials unchanged                         | YES    |
| Runtime/provider gates activated                 | NO     |
| Hosted Dev/Production accessed                   | NO     |
| Commit                                           | NO     |
| Push                                             | NO     |
| Ready for independent CP15B review               | YES    |

Runtime probes temporarily exercised protected DEV roots only in disposable,
network-none synthetic databases, using explicitly synthetic monetary fixtures;
all gates were closed afterward. They do not constitute live gate activation or
approval of real monetary values. Missing approved real monetary policy continues
to deny real dispatch. CP15B-LIVE remains separately gated and CLOSED.

STOP — CP15B COMPLETE / READY FOR INDEPENDENT REVIEW.

## TARGETED F1–F4 CORRECTION

The Owner requested only the four independently reproduced findings. F1–F4 were
real defects in the initial delivery, not baseline failures. This appended section
supersedes the earlier initial readiness claim for these boundaries. The independent
review, historical prerequisite stop and resolution sections are unchanged.

### F1 — current recovery disclosure authority

`authorizeResultDisclosure` reuses the existing continuation repository transaction,
Account apply gate, owning task admission and material/source checks. Recovery reads
exact Account-scoped attempt identity, awaits private retained-reference/custody/hash
work, parses and correlates the retained report, then reauthorizes current owning
Account/Trip/material access and exact attempt/result identity. The owning admission
is repeated after all material/hash awaits. Immediately before evidence return the
executor applies a fresh Account generation fence, with no intervening await.

Retention remains historical and private; it is not disclosure permission. No
retention write is required for this check. Denial does not clear result/usage refs,
refund responsibility or enqueue execution. Installation retains its independent
existing current-material/publication fence. No SQLite schema change was needed.

Nine actual file-backed SQLite50 cold-reopen cases cover valid authority, A→B,
A→B→A, a generation change after owning admission completes, Trip revoke before recovery, revoke during custody, revoke during admission,
actual Source lifecycle revocation, and current attempt identity change during
custody. Each denial preserves stored bytes and responsibility and makes zero
transport calls. Fresh exact A recovery after reauthorization succeeds; revoked
Trip installation remains denied until separately reauthorized; a deleted Source
remains denied without resurrection while historical responsibility stays retained. FK checks
stay clean and the migration tail remains50.

### F2 — Trip revoke/mark serialization

Server84 now obtains the existing C scope admission lock and the existing
Trip→Account membership row-lock convention before authorizing durable mark.
The private lock helper returns no authority/data and is executable only by the
existing meter writer. Admission still uses the original `cp14_trip_access` and
`cp14_call_admission` predicates. The helper does not invent a new Trip grant.

Lock-order audit:

- Existing verified request/audit binding precedes CP14 environment→integration.
- Activation selection, Account grants and resource caps are serialized by those
  same environment/integration locks; they do not introduce another row-lock order.
- C shared activation/gate locks→existing Account/Trip admission advisory lock→Trip
  SHARE row→matching `trip_members` rows by ID→matching `journey_members` rows by ID.
- Existing call UPDATE lock follows Trip authorization locks; immutable hold/usage
  writes and resource counts follow. Reserve uses the same authority order.
- Config/kill/activation roots do not acquire a Trip lock after holding an inverse
  Trip→environment sequence. Owning Trip revoke follows the existing Trip→membership
  boundary and does not enter CP14 environment/integration authority. No new
  scheduler, gate, canonical command or cross-domain lock owner is introduced.

Actual PostgreSQL barriers prove ownership/membership revoke winning makes mark
wait then reject, while mark winning makes revoke wait and preserves
MAY_HAVE_STARTED responsibility. Rollback on either side restores the corresponding
state; current access is independently false after committed revoke. Concurrent
kill+revoke+mark completes without deadlock. The tests perform no provider transport.
The unchanged C1 UNKNOWN/C2/C3 shared-lock race and CP14/A2 behavior still pass.

### F3 — executing pins, not opaque selection metadata

The signed reserve command now carries exact `execution_pins` and their digest.
These include prompt, envelope version/digest, minimizer version/digest, privacy
profile/digest, policy, adapter, output schema, provider configuration and price.
Backend reconstructs the facts from the versioned request descriptor, verifies
compiled minimizer/prompt/envelope/privacy bytes and owning policy correlation,
and rejects substituted command facts even when their command digest is valid.

Reserve compares actual facts with the Security-selected scope and persists them
in the immutable hold alongside the signed admission association. Mark independently
compares that retained binding with the current selected scope/configuration.
Selected scope revision changes invalidate old unexecuted marks without rewriting
historical admitted facts. Actual config/model/price IDs retain their existing
separate checks. CONFIG_ADMIN still cannot select proposed pins for execution.

The matrix mutates every actual pin individually, rotates selected prompt/envelope/
output-schema/minimizer/privacy/policy pins, and rejects invalid selected adapter/
provider-config/price pins. Exact matching facts admit only the synthetic closed
fixture. New attempts require current selected facts; historical holds remain
byte-equal after rollback-only rotation probes. Twelve Backend command-substitution
cases also reject before transport. Server84 remains the same one uncommitted
additive migration; Server85 was not needed.

### F4 — token and cost quality

The mapper keeps valid provider token counters ACTUAL_REPORTED independently of
cost quality. Pinned-schedule arithmetic produces ESTIMATED cost, never actual.
Explicit unresolved billing applicability, duplicate/ambiguous required price
components and missing usage produce UNKNOWN cost. Cache slices remain disjoint,
reasoning remains included in output, currency remains the pinned currency, and
no FX or customer billing is introduced. This mapper does not admit actual billing.

Tests verify actual tokens→estimated cost, cache arithmetic, unresolved billing
bands→UNKNOWN, missing usage, semantic rejection retaining incurred estimated usage,
exact replay, and historical schedule ID preservation. Actual protected journal
observations separately demonstrate late admitted synthetic billing evidence
superseding an estimate without double cost on exact replay. No real monetary
policy, billing receipt, secret or provider call was used.

### Targeted validation

- F1 file-backed recovery plus executor tests: 202/202 PASS, including nine cold
  recovery cases and 28 executor cases.
- F2/F3/F4 actual protected PostgreSQL matrix: 124 checks PASS; 0 provider calls;
  fixture DEV gates closed at end.
- Complete Server84 security matrix: 104 checks PASS; 100 retained immutable holds;
  no quota/concurrency or UNKNOWN/refund behavior change.
- Fresh1→84 and seeded83→84: PASS. Accepted Server83 compatibility: 548+75 checks PASS.
- Unchanged Trip/Event/Source/Flight SQL: 841 checks PASS. Actual C1 UNKNOWN/C2/C3
  shared-lock race and A2 bridge: PASS.
- Full suite: 2,577 PASS / 1 unchanged exact-base Ledger architecture failure;
  202 files, 2,578 tests. The F1–F4 vectors pass and are not classified as baseline.
- Typecheck, lint/UI guard, Backend build and closed standalone foundation bundle: PASS.
- Preservation manifest: all88 hashes PASS; approved CP15A byte-identical;
  independent review SHA256 remains
  `76491dd34c2dc68880c321ea09d76836f567d0346c7a6a6b424597cc9bf1ce8a`.

The B2 Docker-backed run initially had two 5-second test timeouts under competing
validation load, with141 functional cases passing. The entire unchanged matrix was
rerun with a bounded15-second test budget: **143/143 PASS**.
No assertion or historical test source is relaxed or modified.

### Final preservation and readiness

Changed-artifact formatting and whitespace pass. All Server1–83, SQLite50/registry,
sole scheduler and accepted review preservation hashes still match. The exact
base/branch is unchanged and nothing is staged. Server84 remains one additive,
uncommitted migration. No SQLite51, Server85, authority redesign or activation was
needed. The independent review is unchanged and ready for targeted recheck.

TEST/PRODUCTION remain structurally closed and DEV defaults remain disabled/killed.
Missing monetary policy denies admission; 8192/2048, 1/20/100/100 bounds are unchanged.
UNKNOWN/lost ACK never authorize redispatch/refund. Old generic CP14 calls cannot
upgrade through a hold. The synthetic harness and normal-startup real adapter remain
unreachable. No real secret, network/provider, Hosted Dev/Production, Vision,
fallback, shadow or inbound paid invocation was used. Original evidence equality,
CP13B interpretation, CP13A canonical authority and five C denials are preserved.
Only task-owned network-none validation containers are stopped after validation;
private historical fixture responsibility remains stored.

### Final required answers

| Required answer                                                        | YES/NO |
| ---------------------------------------------------------------------- | ------ |
| F1 fixed                                                               | YES    |
| Recovery disclosure requires current Account generation                | YES    |
| Recovery disclosure requires current Trip/material authority           | YES    |
| A→B→A stale recovery can disclose evidence                             | NO     |
| Denied recovery erases retained responsibility                         | NO     |
| F2 fixed                                                               | YES    |
| Trip revoke winning before mark can still authorize mark               | NO     |
| Mark winning before revoke preserves possible-execution responsibility | YES    |
| New deadlock introduced                                                | NO     |
| F3 fixed                                                               | YES    |
| Prompt pin enforced at reserve/mark                                    | YES    |
| Envelope pin enforced                                                  | YES    |
| Minimizer pin enforced                                                 | YES    |
| Privacy pin enforced                                                   | YES    |
| Policy pin enforced                                                    | YES    |
| Security-selected pins can be bypassed by opaque scope ID alone        | NO     |
| F4 fixed                                                               | YES    |
| Schedule-derived cost labeled ACTUAL_REPORTED                          | NO     |
| Schedule-derived cost labeled ESTIMATED                                | YES    |
| Ambiguous billing applicability can claim actual cost                  | NO     |
| Server1–83 unchanged                                                   | YES    |
| Server84 still one additive migration                                  | YES    |
| SQLite51 required                                                      | NO     |
| TEST/PRODUCTION structurally CLOSED                                    | YES    |
| DEV default CLOSED                                                     | YES    |
| UNKNOWN protection preserved                                           | YES    |
| Real secret/provider call                                              | NO     |
| Inbound/outbound firewall preserved                                    | YES    |
| Raw evidence equality preserved                                        | YES    |
| CP13B/CP13A authority preserved                                        | YES    |
| sync_operations sole scheduler                                         | YES    |
| Five C denials unchanged                                               | YES    |
| Runtime/provider gates CLOSED                                          | YES    |
| New regression                                                         | NO     |
| Commit                                                                 | NO     |
| Push                                                                   | NO     |
| Ready for targeted independent recheck                                 | YES    |

STOP — CP15B F1–F4 CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.
