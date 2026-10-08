# Authenticated Publication Transport Preflight

Date: 2026-10-09 (Pacific/Auckland). Role: Platform Transport Architect.

## Verdict

**MINIMAL BACKEND DELTA REQUIRED.** Existing authentication and protected SQL are
reusable; no existing Backend HTTP route supplies the required complete private
catalog. **Ready for Builder authorization: YES**, for the dormant code and
negative-test scope below, subject to Owner acceptance of this proposed contract.
This is not readiness for Hosted deployment, credential provisioning, live
installation, Integrated C4 or runtime activation.

**STOP — AUTHENTICATED PUBLICATION TRANSPORT PREFLIGHT / OWNER REVIEW REQUIRED.**

## Source verification and audit boundary

Fresh isolated detached worktree:
`/Users/xoery/.codex/worktrees/publication-transport-preflight/otr-mobile-canonical`.
HEAD, local `main`, local `origin/main` and read-only remote `refs/heads/main` all
matched `7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`. Initial sandbox DNS failed;
the authorized read-only remote retry succeeded. No fetch/ref advancement occurred.
The original dirty checkout and other worktrees were preserved.

That canonical merge has parents `2128ec7c7dea9a12366a21f98b8722d4c1d75c38`
and accepted SQLite53 closure `792141a864b2c2687092789a1f67c36afe43336e`.
The membership repository, envelope contract, corrected migration and independent
review are byte-identical to the accepted closure. Registry imports/registers53;
corrected migration module SHA-256 is
`ccc5ce353b109e3ce1d2545181cc550ee95f36842dc979451454ee2beef586dc`.
One nullable Run column and four guards remain, including F1 protection across all
three replacement collisions with FK/recursive triggers OFF. Historical NULL is
unavailable, not an empty publication. Older pending/unallocated statements in
preserved reports are historical; the accepted53 source is authoritative.

Read current-state and mandatory project documents, then scoped inspection to
Backend HTTP/auth, Mobile auth/client, protected catalog SQL and its admission/
publication guards, membership/Import/Source stores and accepted review evidence.
No legacy Web inspection, Hosted query, provider call, credential read/change,
migration execution, business write, server launch, commit or push occurred.
Only this report and a short current-state entry are delivered. Findings are
source audit evidence; historical test results are not new execution claims.

## Existing boundaries and why routes do not suffice

| Boundary                           | Evidence and implication                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend bearer authentication      | `backend/src/app.ts` authenticates through `validateAccessToken`; `supabaseGateway.ts` uses the publishable Auth client and `auth.getUser(token)`. The returned user ID is the server actor. Client JWT decoding/local identity is not server authentication.                                                                                                      |
| Trip admission                     | `canReadTrip` recognizes Trip creator, legacy `trip_members`, or linked `journey_members`. SQL `trip_source_admission(actor,trip,false)` repeats those accepted read rules. `participation_active` is not an access switch. An early Backend check cannot replace SQL admission.                                                                                   |
| Existing HTTP reads                | Ledger/bootstrap/change feeds, canonical Event reads/collection snapshots, participation receipts and receipt content cannot disclose complete private Source/Run/Input/Candidate provenance. Canonical collection explicitly excludes private C content; no alias or generic RPC endpoint is acceptable.                                                          |
| Dedicated SQL connection precedent | Canonical collection/receipt gateways already use injected connections and exact `sessionUser` checks. Missing/wrong connection withholds reads; service-role REST lists are not substitutes. `server.ts` installs no Publication connection. Source execution recovery is an internal different-purpose seam, not a catalog route.                                |
| Protected catalog                  | `supabase/migrations/20261005000900_trip_import_private_catalog_reads.sql` defines the fixed `trip_source_read_import_catalogs(actor,trip)` root. It requires actual `session_user=otr_trip_source_command_gateway`, definer `current_user=otr_trip_source_writer` and current SQL Trip read admission. PUBLIC/anon/authenticated/service_role execute is revoked. |
| Local trusted seam                 | `createClosedPublicationMembershipReader` accepts only CLOSED and an injected fixed RPC; absent RPC fails. It validates the whole snapshot, projects READY/RETAINED Runs and mints frozen handles in a module-private WeakMap. `install` rejects copied/forged/raw handles and wrong original Account context.                                                     |

The Source gateway is reserved NOLOGIN in the accepted migration. A normal
publishable/service Supabase client cannot invoke this root. `SET ROLE` from
postgres/service_role does not satisfy its `session_user` predicate. Actual
connection provisioning is absent and remains separately gated; a new route alone
cannot make a live read succeed. Existing DEV acceptance does not certify this
function/role/ACL on the current Hosted database, especially after the R3 rebuild.
No credential, role-membership, LOGIN or grant change belongs in the Builder delta.

## Exact minimum proposed changes

One proposed route: **GET `/v2/trips/:tripId/source-import-catalogs`**, requiring
`X-OTR-Publication-Catalog-Version: 1`. No body, query, cursor, run filter, actor
parameter, pagination option, mutation or generic routine selector. Reject extra
query/body/version shapes and unsupported methods before SQL. An actor header
never supplies authority. The Trip path must be a strict canonical UUID.

1. Add `backend/src/tripPublicationCatalogRead.ts`: a narrow injected connection
   interface with `sessionUser()` and
   `readImportCatalogs(actor,trip,signal)`; fixed parameterized function call only,
   primary database, one READ COMMITTED read-only transaction/statement snapshot.
   Check actual session identity on the leased connection, not a caller string.
   Validate the complete strict schema and exact derived actor/path Trip before
   returning bounded JSON. No direct table reads or service-role fallback.
2. Extend the existing `DevBackendGateway` in `backend/src/app.ts` with optional
   `readPublicationImportCatalogs(actor,trip,signal)` and
   `validatePublicationAccessToken(token,signal)` (verified user / rejected /
   unavailable), and add the exact GET branch
   before the generic v2 read fallback. Authenticate bearer with existing verified
   Auth boundary; pass only that user ID. Early `canReadTrip` denial withholds;
   the protected SQL check remains authoritative. Missing injection returns503.
3. In `backend/src/supabaseGateway.ts`, add optional
   `publicationCatalogConnection` configuration and delegate through that narrow
   helper. Reuse existing Auth/Trip admission. No `service.rpc` implementation.
   Leave `backend/src/server.ts` unprovisioned; tests inject the connection.
4. Add `src/data/api/tripPublicationCatalogTransport.ts` with
   `createTripPublicationCatalogTransport(getAccountId,options,tokenProvider?)`.
   Its `read(context,signal?)` uses a context-bound
   `createAuthenticatedApiClient`, the exact route/header and shared
   `tripImportSnapshotSchema`; return bounded canonical catalog text to the
   existing CLOSED RPC adapter. Preserve the reader's original context rather
   than capturing a fresh generation inside the RPC callback.
5. Narrowly extend `ApiClientOptions` in `src/data/api/client.ts` with
   `signal?: AbortSignal` and `maxResponseBytes?: number`;
   `authenticatedClient.ts` passes these through. For this bounded transport,
   `timeoutMs: 30000` governs the whole operation as specified below;
   preserve ordinary callers' existing behavior. Reuse token provider and existing
   error types. Do not create a second auth/session implementation.
6. No production change to `tripPublicationMembershipRepository.ts`, its
   contract, Import/Source validation, SQLite53, scheduler or startup is required.
   A future trusted composition binds one original context and transport to
   `createClosedPublicationMembershipReader({mode:"CLOSED",rpc,...})`, verifies
   seam actor/trip consistency locally and calls the existing dormant repository.
   Provide tests of that composition; install no default factory or live caller.
7. Extend closest tests (`backend/src/app.test.ts`, `supabaseGateway.test.ts`,
   API client/authenticated tests and membership tests); add focused new transport/
   gateway tests. Update `docs/API_CONTRACT.md` and current-state; record the accepted
   transport decision in an ADR only after Owner authorization. No dependency,
   export barrel, environment credential or migration change is needed.

The RPC's actor argument remains an internal consistency assertion. The HTTP
request never transmits it as authority. The server exclusively derives actor
from the validated bearer session; the database accepts that trusted Backend
binding under the exact dedicated principal. Trust is this chain, not a body
hash, `complete:true`, caller-auth flag or arbitrary injected callback. The
injection seam is trusted application infrastructure: the WeakMap prevents
ordinary handle forgery, not malicious trusted code that replaces dependencies.
TEST fakes remain explicitly test-only and unreachable from production composition.

## Response and completeness contract

Successful200 body is **exactly the existing version1 `tripImportSnapshotSchema`**,
not a membership-only DTO or JSON-string wrapper. It contains `actor_account_id`,
`trip_id`, and all13 catalog arrays:

- Sources, revisions, representations, Runs, Inputs and Candidates;
- Confirmations, OutputSlots, Associations;
- Run predecessors, Candidate lineage, slot lineage dispositions and dependencies.

Each array is complete for the SQL's accepted Actor/Trip projection, at most64
rows. SQL reads up to65 to detect overflow and raises
`IMPORT_READ_RESOURCE_LIMIT` if any family exceeds64 or canonical UTF-8 exceeds
4,194,304 bytes. All families share one statement observation. Do not filter
FAILED, identity-only, historical, unreferenced Inputs/Candidates or sibling rows
in HTTP to manufacture smaller completeness. Source rows are actor-private;
other Trip members cannot read another actor's private catalogs.

Use canonical JSON serialization for the actual HTTP body and apply the same
4,194,304-byte ceiling to serialized wire bytes, not just the decoded object.
Response headers: `Content-Type: application/json`, `Cache-Control: private,
no-store`, `Vary: Authorization` and safe request ID. No CDN/shared cache, ETag/304
shortcut, redirect credential forwarding, public URL, signed download or source
payload logging. Strings may contain private text/locators; treat the entire body
as private and never dereference locator URIs during validation.

There is **no pagination** in v1. Overflow withholds the whole response; no
truncation, page merging, local-row completion or candidate subset workaround.
Supporting larger scopes requires a separately reviewed consistent snapshot
contract. A complete empty catalog is distinct from unavailable. An empty
`memberships` handle can also mean no eligible READY Run; it never proves a
requested Run succeeded or failed. A READY Run with zero Candidates is valid
only with its complete nonempty Input roster and all provenance.

The unchanged reader recomputes scope, proposal and complete Run Input digests,
checks retained selected material, complete ancestry/manifest Original roots,
Source scope, cycles and bounds, then seals at most64 Candidates per envelope
within32,768 bytes. Preserve Run operation/generation and extractor pins. Account
request generation and server Run generation are independent; never substitute
one for the other. Multi-root provenance can exist, while single-Capture support
requires the accepted unique Original root and current Source-owned binding.

## Timeouts, cancellation, Account fences and errors

Proposed fixed budgets: Mobile read **30 seconds total**, including token wait,
one401 refresh/replay, body receive and validation; each Backend Auth/Trip/SQL
phase **5 seconds maximum**, Backend whole request **15 seconds**, SQL
`statement_timeout=5000ms` and `lock_timeout=1000ms` transaction-local. Pool checkout
counts against the Backend deadline. Never leave pooled settings or transactions
behind. No new timer-based scheduler is involved.

The current client15-second timer covers fetch until headers only: token refresh
and `response.json()` are outside it, no external signal/size cap exists, and
parse failures can become generic network errors. Canonical collection's
`clone().text()` check already illustrates a byte check but allocates the body
first. Builder must implement actual bounded accumulation before JSON parse,
including missing/lying Content-Length and decompressed bytes. Where native fetch
cannot stream, enforce bounded native receipt or fail transport unavailable;
post-allocation length checking alone does not claim a memory bound. Cap error
bodies too (8 KiB); never retain arbitrary private server error bodies.

Reuse refresh coalescing keyed by Account generation/user/refresh token, its
expected user guard and gate-protected secure persistence. Caller cancellation
can stop waiting for a shared refresh but must not cancel another caller's owned
refresh or persist a late stale session. Observe all late promise outcomes; no
unhandled rejection. Abort/deadline fences prevent a late read from creating a
handle or installing even if underlying Auth/fetch ignores abort. Require a
signal/deadline check at send, after body/validation and immediately before handoff.

Capture `{accountId,tripId,generation}` once before token work. Recheck after each
await and through reader projection/install. A→B→A advances generation: matching
UUID A again cannot rescue A's old request. Same-Account token rotation may replay
GET once after401, under the same captured context; a second401 pauses remote work.
No switch to B's token, new context capture or unlimited refresh loop. Latest-read
request epoch/cancellation belongs to the trusted owning caller; canceled or
superseded handles cannot be installed. Screen hide does not cancel durable C2
work; this read request is transient and has no new durable Job.

| Condition                                                         | Proposed classification / action                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing/invalid bearer, invalid refresh                           | 401 `INVALID_SESSION`/existing Auth codes; one allowed refresh, then auth pause. Only explicit invalid-session evidence can trigger existing reauth policy.                                                                                           |
| Auth service network/5xx                                          | 503 `PUBLICATION_AUTH_UNAVAILABLE`; preserve offline session. Existing `getUser` errors collapse to null, so this route needs a narrow transient-vs-rejected validation distinction; never interpret infrastructure failure as credential revocation. |
| Current Trip denial or SQL FORBIDDEN/42501                        | 403 `TRIP_READ_FORBIDDEN`; no catalog/foreign existence disclosure, no retry until authority changes. Distinguish missing gateway from actor denial.                                                                                                  |
| Bad UUID/request/header/method                                    | 400 typed request error,426 unsupported catalog version,405 method; no SQL or install.                                                                                                                                                                |
| Missing/wrong principal, missing function, unavailable connection | 503 `PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE`; CLOSED, no alternate reader.                                                                                                                                                                      |
| SQL65th row or actual byte ceiling                                | 503 `IMPORT_READ_RESOURCE_LIMIT`; withhold all, no hot retry/paging.                                                                                                                                                                                  |
| Timeout, disconnect, DNS,429/5xx                                  | Retryable read-unavailable; honor Retry-After, preserve accepted local evidence. No automatic loop.                                                                                                                                                   |
| Malformed JSON/schema/scope/provenance/digest                     | Validation/integrity unavailable; zero writes, retain old evidence. No automatic hot retry; fresh bounded read after correction is allowed. Never reinterpret as empty/not-found.                                                                     |
| Account switch, cancel, supersession                              | Local canceled/stale result; discard, no auth repair, install or automatic retry.                                                                                                                                                                     |

Do not change other routes' Auth behavior incidentally. The proposed optional
`validatePublicationAccessToken(token,signal)` returns verified / rejected /
unavailable for this route, backed by the same Auth client. Missing this method
withholds the route rather than falling back to the rejection-collapsing method. Builder
must test concrete Auth error/status mapping, rather than invent success from JWT
claims. Unknown Auth failures withhold without credential revocation.

## CLOSED local handoff and offline behavior

Network/Auth/SQL I/O finishes outside SQLite and the Account apply gate. Only the
trusted CLOSED reader can mint the process-local admitted handle. Its WeakMap
retains exact snapshot/original context; copying, serialization, hashes or raw
network rows cannot mint an install credential. Restart requires a fresh admitted
read to install; already committed envelopes support unchanged cold readback.

Existing `createDormantPublicationMembershipRepository.install(context,handle)`
owns the Account-gated transaction. It checks cached Trip actor/schema53, same DB
Import store and original context; applies catalogs, installs immutable Run
membership and revalidates whole retained roster/provenance before commit. Failure
rolls back catalogs and envelopes together. Internal transaction stores require
one serialized owning transaction and apply gate; `isInTransactionAsync` alone
proves activity, not ownership. No nested gate/transaction or network inside it.

The response authenticates an observation at server read time, **not a perpetual
current authorization lease**. Revocation committed before SQL observation denies;
a concurrent later revoke cannot be ruled out by a previous response. Local
installation repeats current cached admission; subsequent owning use rechecks
Input/material/Capture and Account/Trip read sets. Known local revocation blocks
installation/use without deleting retained evidence. Any future server command
must reauthorize independently. If strict server authorization at local COMMIT is
required, this proposal is insufficient and needs separate protocol review; do
not imply that an extra HTTP check eliminates the race.

Offline launch, cached reads and local Capture remain available under existing
policy. Read failure keeps accepted historical data and pending responsibilities;
it grants no fresh membership or successful C4 outcome. Safe retry means a new
bounded authenticated GET under fresh owner admission/context, through an explicit
caller or a separately authorized existing central wake. Never fall back to raw
local catalogs, service-role lists, public RPC, checksum-only authority, provider
execution or new Candidate/Run identities. No new queue type, worker, scheduler,
startup hook, polling or C5/C9/provider permission is created.

## Minimum security tests and rollout gates

Required Builder tests:

1. Missing/forged/expired bearer, transient Auth failure, refresh failure, second401
   and supplied actor spoof: SQL receives only verified server user or is not called.
2. Creator/legacy member/linked member positives; revoked/unlinked/foreign Trip
   negatives; participation=false alone does not deny accepted access. Revoke
   between Backend check and SQL denies. Foreign actor data is never disclosed.
3. Actual disposable SQL dedicated/wrong-session tests, service_role/anon/
   authenticated/PUBLIC direct-call denial and `SET ROLE` substitution denial.
   Mock `sessionUser()` positives alone do not certify principal security.
4. Full13-family read:0/1/64 positive and65 negative; exact byte limit/one over,
   Unicode, lying/missing Content-Length, slow headers/body/refresh, abort-ignoring
   fetch, decompression bounds, unsupported schema, extra keys and foreign scope.
5. Correctly rehashed omissions/substitutions, unreferenced Input/Candidate loss,
   out-of-scope Source, missing/cyclic/foreign ancestry, wrong Original/proposal/
   Run generation/extractor pins, FAILED-only and zero-Candidate READY distinctions.
   Omitting a row from a fake server response cannot be detected by a checksum
   alone: prove completeness from protected SQL and prohibit filtering in the route.
6. A→B→A at refresh/HTTP/body/hash/preinstall/commit boundaries; stale token refresh
   cannot overwrite B; cancellation/supersession prevents late handle installation.
7. Actual SQLite53 same-database transactional install, schema unavailable/NULL,
   forged/copied/wrong-context handles, rollback/lost ACK/cold exact recovery,
   conflicting committed envelope and whole current roster/Capture binding checks.
   Keep existing F1/FK-OFF guards; never execute a live installation for this audit.
8. Error/log/cache/redirect redaction and no secret/raw evidence leakage; missing
   connection CLOSED, no startup/provider/scheduler activation or authority grants.

Gate order: Owner approves this preflight → dormant Builder/local tests → independent
security review → separate Hosted contract/principal/provisioning preflight and Owner
approval → bounded DEV read-only transport acceptance → separately authorized local
installation/native acceptance → separately reviewed Integrated C4 composition.
Reverify remote main/ancestry before Builder work. Current Hosted function presence,
RLS/ACL/role identity and bounded snapshot behavior must be proven, not inferred
from historical migration files. Provisioning the NOLOGIN session requires separate
security/compatibility review; do not change reviewed roles/roots ad hoc.

Roll back by removing/withholding the injected transport and disabling its consumer.
Keep SQLite53 history/envelopes/originals/responsibility. No destructive down migration,
credential substitution, public Catalog grant, service-role shortcut or provider
fallback. C5/C9 and all runtime/provider gates remain CLOSED.

Validation for this preflight: source/ancestry/accepted-byte checks, read-only remote
main verification, report formatting and Git whitespace/scope checks. No fresh
runtime test PASS is claimed; implementation and live transport remain unbuilt.

**Ready for Builder authorization: YES — dormant bounded authenticated read only.**
**STOP — AUTHENTICATED PUBLICATION TRANSPORT PREFLIGHT / OWNER REVIEW REQUIRED.**
