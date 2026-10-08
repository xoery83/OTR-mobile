# Authenticated Publication Transport dormant Builder report

Date: 2026-10-09 (Pacific/Auckland).

**Ready for Independent Review: YES — dormant implementation only.**
Live SQL principal/driver provisioning, Hosted contract verification, native transport
acceptance, local live installation and Integrated C4 are not certified or enabled.

## Source gate and scope

Fresh isolated detached worktree:
`/Users/xoery/.codex/worktrees/publication-transport-builder/otr-mobile-canonical`.
Initial/final HEAD, local main, origin/main and read-only remote main match exactly
`7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`. Main did not advance; no alternate base
was adopted. No fetch/ref advancement, commit, push, merge or rebase.

Accepted preflight is retained byte-for-byte from the original isolated preflight
worktree as `OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_PREFLIGHT.md` beside
this report. Original Builder/Review/preflight worktrees and the dirty chat checkout
remain preserved. Mandatory project documents were already read at this identical
base in this chat; current-state and exact affected dependencies were rechecked.

Accepted SQLite53 registry/migration and protected SQL remain unchanged. The corrected
module SHA-256 remains
`ccc5ce353b109e3ce1d2545181cc550ee95f36842dc979451454ee2beef586dc`.
The accepted migration/review closure remains in canonical ancestry. Historical
pending/allocation text is preserved as history, not current source status.

## Exact changed files

| Path                                                                                   | Change                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/app.ts`                                                                   | One exact GET boundary, strict method/UUID/body/query/version rejection, verified Actor and Trip admission, bounded phases, canonical complete response/private headers and safe error normalization.                                     |
| `backend/src/supabaseGateway.ts`                                                       | Optional dedicated connection; reuses existing Auth client with explicit verified/rejected/unavailable result; delegates fixed protected catalog read. Existing generic Auth and Trip admission are unchanged.                            |
| `backend/src/tripPublicationCatalogRead.ts`                                            | Narrow leased-session query interface, actual session_user observation, fixed parameterized SQL/read-only transaction, local SQL timeouts, full13-family schema/scope/size checks and finite safe errors.                                 |
| `backend/src/tripPublicationCatalogRead.test.ts`                                       | 58 synthetic route/Auth/gateway/schema/SQL-seam negatives and positives, including exact canonical4MiB boundary and native-independent authority/source checks.                                                                           |
| `src/data/api/requestBoundary.ts`                                                      | Small deadline/cancellation primitive and streamed UTF-8 byte accumulation before JSON parsing; observes late outcomes and refuses missing streams.                                                                                       |
| `src/data/api/client.ts`                                                               | Explicit bounded/signal request mode, full-operation deadline, one401 replay, redirect denial, actual-byte/error-body bounds, finite error-code retention and no private payload diagnostics. Ordinary requests retain the existing path. |
| `src/data/api/client.test.ts`                                                          | One timestamp-sensitive payload-redaction assertion excludes only its unrelated timestamp.                                                                                                                                                |
| `src/data/api/clientBounded.test.ts`                                                   | 15 actual-byte/deadline/cancel/late-result/401/native-shape/UTF-8/privacy cases.                                                                                                                                                          |
| `src/data/api/authenticatedClient.ts`                                                  | Supplies original Account-generation checks at asynchronous bounded request boundaries; existing expected-user/coalesced token provider remains.                                                                                          |
| `src/data/api/tripPublicationCatalogTransport.ts`                                      | Explicit original-context GET, HTTPS/version/scope checks,30s total budget,4MiB admission, final freshness check and early fail CLOSED without injected streaming capability. No default adapter.                                         |
| `src/data/api/tripPublicationCatalogTransport.test.ts`                                 | 9 exact-context/header/empty-complete, A→B→A, schema/scope, deadline and native capability negatives.                                                                                                                                     |
| `src/data/repositories/tripPublicationMembershipRepository.ts`                         | Optional original signal on CLOSED reads/handles,30s signal-scoped read/provenance deadline, canceled-handle rejection and final pre-COMMIT cancellation check. Existing membership projection/SQL/schema/owning guards remain.           |
| `src/data/repositories/tripPublicationMembershipRepository.test.ts`                    | 6 new authenticated synthetic HTTP→real SQLite53 cases: exact/cold replay, copied/stale generation, cancellation before/during installation, rollback and projection deadline. Total92 cases.                                             |
| `docs/API_CONTRACT.md`                                                                 | Incremental dormant route/transport/authority/driver/native contract.                                                                                                                                                                     |
| `docs/adr/2026-10-09-authenticated-publication-catalog-transport.md`                   | Owner-accepted transport decision, narrow cancellation extension and separate rollout gates.                                                                                                                                              |
| `docs/architecture/OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_PREFLIGHT.md`      | Exact accepted preflight copy; original preserved.                                                                                                                                                                                        |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`                                                 | Short Builder handoff prepended; historical handoffs retained.                                                                                                                                                                            |
| `docs/architecture/OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_BUILDER_REPORT.md` | This report.                                                                                                                                                                                                                              |

No package/dependency, export barrel, startup/config/environment credential,
`backend/src/server.ts`, migration/registry, scheduler/worker/GET outbox, provider,
C4/C5/C9 implementation or domain-write change. A temporary dependency symlink reused
existing installed packages for validation and is removed from delivery. Build output
is ignored and was not deployed or executed.

## Implemented transport and authority evidence

Exactly GET `/v2/trips/:tripId/source-import-catalogs`, version header1; no query,
body, actor argument, run filter, pagination or generic RPC selector. Invalid
requests are rejected before SQL. Caller actor headers do not override bearer Auth.
Auth user ID comes only from existing `auth.getUser(token)` verification. Recognized
invalid JWT/user/session/ban errors and the SDK's explicit `AuthSessionMissingError`
are rejected401; infrastructure/rate/unknown Auth errors are unavailable503. Existing
other routes retain their previous Auth behavior. No local session mutation occurs.

Backend repeats existing Trip creator/legacy-member/linked-member read admission,
then invokes the protected SQL root under its independent current admission. No
participation-active reinterpretation. SQL denial winning after an early Backend
check withholds the catalog. The authenticated response is an observation, not
perpetual current authorization or C5/domain-write authority.

The injected driver leases one primary session. All commands use the same lease:
READ COMMITTED READ ONLY BEGIN; SET LOCAL statement_timeout5s/lock_timeout1s;
`SELECT session_user AS principal`; fixed
`SELECT public.trip_source_read_import_catalogs($1::uuid,$2::uuid) AS catalog`
with verified Actor/Trip parameters; COMMIT or ROLLBACK. Wrong/missing principal
withholds before catalog query. No dynamic caller SQL, SET ROLE, service-role
catalog REST listing or public RPC fallback exists. Source SQL's actual definer/
session identity, current Trip admission, revoked API grants, all13 limit65 probes,
64-family rejection and4MiB complete-result rejection remain exact.

The driver interface is a trusted unprovisioned dependency. Its future implementation
must abort/retire uncertain leased connections, complete rollback before reuse,
apply primary/TLS/session identity guarantees and honor cancellation. The caller
stops waiting within5s even if the driver/Auth ignores abort; this does not falsely
claim the underlying work terminated. No production SQL driver or principal is
installed. Same-lease tests use a synthetic recording driver; they prove command
selection/ordering/parameters, not a live database principal's ACL or termination.

The response is exactly existing strict version1 catalog, all13 families intact,
including historical/unreferenced rows; max64 rows/family and4,194,304 actual
canonical UTF-8 bytes. Overflow/schema/scope failures withhold the whole read.
Private/no-store and Vary: Authorization apply to success and failure. No filtering,
truncation, public URLs, payload log or complete:true witness is added. Empty catalog
and unavailable are distinct. Zero-Candidate READY semantics remain owned by the
unchanged complete Input/provenance projection, not an empty network success flag.

Mobile captures original Account/Trip/generation before token work. That context
remains through expected-user token refresh, every bounded await, body/schema
validation and handoff. A→B→A cannot rescue an old generation. One401 can trigger
one same-context refresh/replay; no retry loop. Refresh coalescing/secure persistence
and Account apply gates are unchanged. Cancellation/deadline races observe late
promises, preventing a late result from returning/minting authority; they do not
cancel another caller's shared owned token refresh.

The streaming reader counts actual decompressed Uint8Array bytes before JSON parse,
regardless of Content-Length, caps success4MiB/errors8KiB, rejects malformed UTF-8/
JSON, and retains only finite known error codes with generic messages. It does not
use text/json/arrayBuffer fallbacks for missing streams. HTTPS and redirect:error
are required. Accepted bytes are bounded accumulated content, not proof that an
arbitrary injected upstream adapter itself has bounded internal buffers.

## CLOSED handoff and transaction behavior

No default reader/transport/repository factory or runtime caller is installed.
Synthetic tests bind the RPC's consistency parameters to the exact original context
and use the new transport to supply the existing CLOSED reader. Only its private
WeakMap handle can install; hashes, raw/copied handles and new A generations cannot.
Complete Candidate/Input/scope/proposal/extractor/Run-generation and ancestry checks
remain unchanged, including unreferenced siblings and unique-root Capture support.

The accepted preflight expected no repository production change to be necessary.
Owner's cancellation/late-result conditions required a narrow optional signal
extension: cancellation stays attached to the admitted handle after transient
read timers/listeners are cleaned up, and is checked before writes and at final
owning pre-COMMIT admission. Signal-scoped CLOSED reads also bound the asynchronous
whole provenance projection at30s; absent-signal historical trusted callers retain
their existing interface/behavior. No membership authority or schema is redesigned.

Network I/O finishes before the existing Account-gated serialized transaction.
Catalog application, membership retention and whole readback either commit together
or roll back. Tests prove cancellation rollback with FK OFF and exact cold replay
on actual53 file-backed SQLite. Internal transaction activity is not ownership;
callers still must hold the accepted same-database owning transaction and apply gate.
Cancellation after final commit admission cannot undo an already committed observation.
Known Account/Trip/material/Capture loss continues to withhold usable current data
without deleting original/historical evidence or execution responsibility.

## Native body-limit capability and fail-closed limitation

**Native streaming capability: NOT INSTALLED / NOT CERTIFIED.** Installed React
Native `Libraries/Network/fetch.js` selects `whatwg-fetch`; its Response exposes
buffered `_bodyText`/Body methods, not the streaming body required here. Inspection
is dependency-source evidence, not a device run or every future native-runtime claim.

Publication refuses before token/network when no explicit fetch is injected,
ReadableStream is absent, or Response.prototype lacks body. A returned response
without getReader is likewise unavailable without any unbounded fallback. The
installed native shape is reproduced by a negative test proving zero token/fetch
calls. No native wrapper, native networking library or configuration was added.

Node standards-stream fixtures prove application byte/deadline enforcement; they
do not certify native receipt buffers, physical networking or a production adapter.
A future trusted adapter must demonstrate bounded upstream/native receive buffers,
decompressed-byte semantics, cancellation and no redirect credential forwarding
before explicit composition. Simply injecting a buffered fetch or a caller flag
is not native capability acceptance.

## Actual validation

| Check                                                       | Result                                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final affected Backend/API/Auth/Publication/SQLite53 matrix | **17 suites /415 PASS**, zero failures/skips;17.72s.                                                                                                                                                 |
| New security suites within that matrix                      | Backend58, bounded API15, Publication transport9; six new SQLite53 handoff cases within92 membership cases. Overlap is not added to415.                                                              |
| Typecheck                                                   | PASS.                                                                                                                                                                                                |
| Full lint/UI guard                                          | PASS, zero ESLint warnings/errors;80 representative UI files,473 retained legacy occurrences.                                                                                                        |
| Backend build                                               | PASS; local2.1MiB esbuild output only, no server launch/deployment.                                                                                                                                  |
| Changed-file Prettier and Git whitespace                    | PASS.                                                                                                                                                                                                |
| Accepted source/scope preservation                          | PASS: SQLite/server migrations and registry, protected catalog/admission SQL, unchanged Import/Source owning stores, Auth session/generation/apply gates, scheduler and server composition retained. |
| Initial/final remote-main verification                      | PASS, exact expected base unchanged.                                                                                                                                                                 |

Final regression command:

```sh
node_modules/.bin/vitest run \
  backend/src/app.test.ts backend/src/supabaseGateway.test.ts \
  backend/src/tripCanonicalRead.test.ts backend/src/tripEventCollection.test.ts \
  backend/src/tripPublicationCatalogRead.test.ts \
  src/data/api/client.test.ts src/data/api/clientBounded.test.ts \
  src/data/api/authenticatedClient.test.ts src/data/api/tripPublicationCatalogTransport.test.ts \
  src/data/auth/sessionAccessToken.test.ts src/data/auth/devSupabaseAuth.test.ts \
  src/data/auth/accountRequestContext.test.ts src/data/auth/accountSwitchCoordinator.test.ts \
  src/data/auth/accountSwitchFoundation.test.ts \
  src/data/repositories/tripPublicationMembershipRepository.test.ts \
  src/data/repositories/tripImportAdmissionRepository.test.ts \
  src/data/db/publicationMembershipMigration.test.ts \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism
```

Logs: `/private/tmp/otr-publication-transport-builder-regression.log`,
`otr-publication-transport-builder-typecheck.log`,
`otr-publication-transport-builder-lint.log`,
`otr-publication-transport-builder-build.log` and final scope/preservation manifest
`/private/tmp/otr-publication-transport-builder-preservation.json`.

Earlier test runs caught fixture/API-test issues and one genuine cancellation
propagation bug: detaching a successful read's deadline child signal from its parent
would have let a subsequently canceled handle install. Retaining the original
signal fixed it; canceled-before-write/FK-OFF-rollback tests now pass. Auth fixtures
were corrected to the installed SDK's response-version/error-code contract;4MiB
schema fixtures respect each text-cell's own bound; file fixtures preserve their
live database getter across reopen. The inherited API test's search for literal42
also matched timestamp minute42; only timestamp exclusion changed. Initial lint
import-order warnings were corrected. Final results above supersede those runs.

No full-suite/global-formatting claim. No new test framework or dependencies.

## Remaining provisioning and review gates

1. Independent Security Review of these exact dormant bytes and negative tests.
2. Separately approved dedicated driver/session provisioning: Source gateway is
   reserved NOLOGIN. No service-role/postgres/SET ROLE substitute satisfies SQL.
   Review principal creation/LOGIN/credentials, membership/ACL/definition compatibility
   separately rather than changing reviewed roles/roots in this Builder.
3. Owner-authorized Hosted read-only verification after R3 rebuild: exact function/
   owner/RLS/ACL/schema/primary/session and complete consistent catalog bounds.
   Historical migration sources and synthetic leases are not Hosted availability proof.
4. Actual database wrong-principal/direct-API/SET ROLE adversarial acceptance and
   driver timeout/cancel/lease-retirement tests. No role, grant or credential was
   created here to manufacture that evidence.
5. Separately accepted native bounded streaming adapter and device acceptance,
   then separately authorized local live installation and Integrated C4 read-set
   composition. Existing C5/C9, provider and domain-write gates stay CLOSED.

Failures preserve offline cached data, accepted envelopes, pending originals and
historical responsibilities. Safe future retry is a bounded authenticated read
under fresh owner admission; no scheduler/poll/outbox or alternate authority is
installed. Rollback withholds transport/consumer and retains53/schema/evidence;
no destructive migration, reset, provider fallback or new Run identity.

No Hosted DEV/Production access, device operation, credential/principal provisioning,
provider activation, live Publication install, commit, push or merge occurred.

**STOP — AUTHENTICATED PUBLICATION TRANSPORT BUILDER / INDEPENDENT SECURITY REVIEW REQUIRED.**

## F1 targeted correction evidence — 2026-10-09

**Correction complete. Ready for Targeted Independent Security Recheck: YES.**
Final dormant-code Owner acceptance and runtime activation remain pending. This
appendix supersedes the earlier Builder readiness statement for the F1 checkpoint;
the original report and Independent Security Review remain preserved.

### Original failures and unchanged probe replay

Before any correction, replayed the original independent sources on the review
snapshot: **20 cases /14 PASS /6 FAIL**, plus the separate **1 FAIL** durable
probe (92 existing cases filtered). All seven original failures reproduced,
including a correctly digested READY Run's two wire-present Candidates becoming
zero committed Candidates after file reopen. The pre-correction Builder18 hashes
match the independent manifest exactly; this snapshot reproduces the delivered
bytes rather than a different implementation.

After correction, replayed the exact same independent test source bytes in
`/private/tmp/otr-publication-f1-independent-replay`, overlaying only the four
changed production files. All six original text-rejection assertions now PASS.
The original durable probe now rejects with `INVALID_RESPONSE` at HTTP admission,
before obtaining its handle or reaching install/readback. Its unchanged assertion
expects installation to proceed and Candidate count to equal2, so the old harness
still reports a failure on this now-required early rejection. The new owning
negative test explicitly asserts rejection, zero writes, no transaction and exact
cold catalog preservation with FK ON and OFF, then installs an unambiguous control
and verifies two Candidates after reopen.

The full unchanged20-case replay reports **19 PASS /1 FAIL**: its remaining control
injects A→B→A only when whole-object `JSON.parse` returns a catalog object. That
operation no longer occurs in Publication parsing, so its injection is not
exercised. The replacement strict-parser control injects the transition while the
existing parser decodes the actor string, asserts that injection occurred, and
verifies that no CLOSED handle returns. Original probe sources were not edited,
and these harness outcomes are not described as an all-green independent review.

### Exact F1 changed files

- `backend/src/app.ts`: after the original4MiB UTF-8 bound, call existing
  `parseEventJson(body,4194304)` before schema/scope validation and serialization;
  lexical failures return503 `PUBLICATION_MEMBERSHIP_INTEGRITY` with private/no-store.
- `src/data/api/requestBoundary.ts`: the existing bounded reader accepts a text
  parser after fatal UTF-8 decoding; its default remains `JSON.parse`.
- `src/data/api/client.ts`: pass the optional bounded-success text parser; ordinary
  routes and error bodies retain existing parsing semantics.
- `src/data/api/tripPublicationCatalogTransport.ts`: fix that parser to
  `parseEventJson(text,4194304)` and exclude caller override from its options.
- `backend/src/tripPublicationCatalogRead.test.ts`: original duplicate actor,
  duplicate65-row family, rounded version, valid nested-row duplicate, unsafe
  integer/exponent, canonical positive and redaction cases.
- `src/data/api/tripPublicationCatalogTransport.test.ts`: matching original-text
  rejection through CLOSED handoff, canonical positive and strict-parser A→B→A.
- `src/data/api/clientBounded.test.ts`: ordinary/bounded non-Publication JSON keeps
  last-member and fractional-number behavior.
- `src/data/repositories/tripPublicationMembershipRepository.test.ts`: real
  file-backed SQLite53 zero-write/zero-transaction rejection and two-Candidate
  positive readback, with FK ON/OFF.
- This Builder report: append this F1 evidence without modifying original text.
- `docs/CURRENT_IMPLEMENTATION_STATE.md`: update only the current Transport handoff.

No new file, parser, dependency, schema, migration, credential or authority.
The reused strict parser rejects duplicate members at every object depth and
non-integer, rounded, exponent, unsafe-integer and negative-zero numeric tokens
before schema validation can normalize them. Rejection chooses neither duplicate.
Actor/Trip, all13 families, complete roster, Candidate/Input/ancestry validators,
CLOSED provenance and SQLite owning admission remain unchanged. No rejected text
is canonicalized into a trusted handle. Catalog receipt adds no domain-write or
current C5 authority, and no private raw payload is logged.

### Final validation and preservation

- **17 suites /433 tests PASS**, zero failures/skips,25.56s. Same affected
  Backend/API/Auth/Publication/SQLite53 matrix as the original Builder, plus18 F1
  cases; this count excludes disposable independent probes.
- Typecheck PASS; lint/UI guard PASS, no warnings/errors,80 UI files and473 retained
  legacy occurrences; Backend build PASS without launch.
- Formatting of all18 original Builder deliverable paths PASS; whitespace PASS.
- Preservation compares all pre-correction tracked/untracked bytes: only the10
  listed paths changed. The Independent Security Review remains byte-exact,
  SHA-256 `51cecabf27094f0f73db3e3a680a80e257d6b4aba7249ea130c318bb5f303642`.
  Original Builder report prefix, historical handoff, strict parser, contracts,
  SQLite53/registry, migrations, Auth gates, server composition and all other
  pre-correction files remain exact. HEAD remains the expected
  `7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0` base. Local main/origin main advanced
  externally during correction to `094cf3beb6b05f2a7f1c8cca1fa007ed630651c4`.
  Its five changed paths are the current-state handoff, two integrated Capture
  assessment reports and `captureBatchAssessmentAdapter.ts`/its test; none of the
  F1 parser/transport/Auth/Publication/SQLite dependencies changed. No base
  adoption, remote freshness claim or ref mutation is made here; no rebase occurred.

Evidence logs: `/private/tmp/otr-publication-f1-original-{probes,sqlite}.log`,
`/private/tmp/otr-publication-f1-replayed-{probes,sqlite}.log`,
`/private/tmp/otr-publication-f1-regression-final.log`,
`/private/tmp/otr-publication-f1-{typecheck-final,lint-final,build,format}.log`.
Preservation evidence: `/private/tmp/otr-publication-f1-before.json` and
`/private/tmp/otr-publication-f1-preservation-final.json`.

Actual streamed bytes remain bounded to4,194,304 before decoding/parsing, without
trusting Content-Length. Stream/UTF-8/overflow/cancel/deadline handling, one401 replay,
refresh coalescing, Account generation and stale-response fences remain in place.
Native streaming is still uninstalled and uncertified; unsupported native receive
continues to fail unavailable. Principal/driver provisioning, uncertain lease
retirement, Hosted verification and native/device acceptance require separate
Owner authorization. No Hosted access, native installation, live installation,
runtime activation, Integrated C4, provider/C5/C9, commit, push, merge or rebase.

**STOP — AUTHENTICATED PUBLICATION TRANSPORT F1 CORRECTION COMPLETE / TARGETED INDEPENDENT SECURITY RECHECK REQUIRED.**
