# B-T3E Backend Read Integration

Status: **B-T3E ROUTE CORRECTION COMPLETE — REVIEW PENDING** (2026-10-04).
Canonical commands enabled: **NO**. Activation gate open: **NO**.

## Public receipt route correction

B-T3C's authoritative exact lookup path is restored:
`GET /v2/trips/:tripId/canonical-event-operations/:operationKey`.
Backend dispatch and Mobile transport use that single path. The unintended,
unshipped `event-operations` route is removed; no compatibility alias exists.
Authentication, Actor derivation, Trip admission, exact-key privacy, STATUS_ONLY,
READ_UNAVAILABLE/REPLAY_UNAVAILABLE and timezone-stable verification are unchanged.
Capability discovery and canonical mutation activation are unchanged. No receipt
schema, SQL/migration or SQLite changes were needed.

Correction validation: B-T3E boundary/transport tests (36 cases), auth/privacy/
historic replay, old-route rejection, unavailable recovery and disabled mutations
PASS; typecheck, Backend build, scoped lint, format and whitespace PASS.
The validation table below records the original B-T3E integration evidence;
SQL was not rerun for this path-only correction.

## Baseline and scope

Worktree `/Users/xoery/Project/otr-mobile-temporal`, branch `trip/temporal`,
clean starting HEAD `45eed53880263633afeb0b9c8f7bb20469eff5f6` (`45eed53`).
Canonical and import siblings were clean at startup. Final status shows two
externally appearing untracked files: canonical's
`TRIP_CANONICAL_A1_I2C1_LIFECYCLE_COMMAND_CONTRACT.md` and import's
`TRIP_CANONICAL_C_I3D_PROTECTED_SOURCE_COMMAND_FOUNDATION_REPORT.md`, both under
`docs/architecture/`. This task neither created, opened nor modified them;
all task edits are confined to temporal. The siblings are no longer clean, but
were not modified by this task.
Authority: accepted B-T3A/B-T3B/B-T3C/B-T3D, Account-generation/apply contract,
and current C-I3C contract. No new product scope, UI, dependency, migration,
SQLite write, semantic queue operation, adoption or backfill is introduced.
The 69-migration B-T3D signature remains authoritative.

## Gateway seam and runtime status

`CanonicalReadGatewayConfig` accepts an optional dedicated connection with only
three operations: actual database `sessionUser`, installed-state discovery, and
exact `trip_event_receipt_lookup(actor, trip, operation)` read. It exposes no SQL
executor, route selector, mutation method or gate setter. The future connector
must execute these fixed operations in read-only transactions and obtain identity
from the database, not caller metadata. `session_user` must be exactly
`otr_trip_event_command_gateway`; service_role is rejected without lookup.

No driver/credential provisioning or live connection is supplied by `server.ts`.
Reserved roles stay NOLOGIN and existing grants/guards are unchanged. The current
service client reads only the already admitted Event/schema path; it is never
used for gate/receipt lookup or as semantic authority. B-T3D denies its private
receipt/gate access, so exact runtime recovery is **PENDING**, not implemented
through a broader fallback. A configured test connection proves the boundary;
it does not establish provisioned runtime access or activation acceptance.

## Capability projection

`GET /v2/trips/:tripId/canonical-events/capabilities` authenticates and read-admits
before discovery. It probes the exact installed Event columns and embedded endpoint
relation in a zero-row query, so missing columns/relation/read access disable the
read version, readable shapes and maximum precision. Supported backend read version
is 1, precision is at most 6, and all seven shapes can be preserved.

Command version and DB gate observation come only from dedicated installed-state
reads. Without that connection they are `null` and `UNKNOWN`, rather than fabricated
DB observations. The installed B-T3D gate is independently verified CLOSED by SQL;
HTTP cannot observe it through service_role. `activationState` is always DISABLED;
`enabledCommands`, `enabledShapes` and `enabledScopes` are empty, including if a test
connection reports an open DB gate. Resolver and Track C adapter availability are
false because neither adapter is installed in this backend. Missing gateway or
unknown state cannot grant commands. No capability endpoint changes state.

## Exact receipt recovery

`GET /v2/trips/:tripId/canonical-event-operations/:operationKey` derives Actor from verified
Auth, requires current Trip read admission and a UUID exact operation key. Collection
reads and query filters are rejected; there is no search/enumeration, intent execution
or mutation fallback. Foreign/unavailable Trip or foreign/missing receipt produces
safe `404 READ_UNAVAILABLE`; unprovisioned lookup produces `503 REPLAY_UNAVAILABLE`,
which does not claim no commit. Existing requestId, no-store and normalized errors
are preserved. Backend logs use one fixed redacted route, never the operation key.

The dedicated installed SQL function verifies the stored full receipt hash and
returns immutable historic UTC microsecond output. Backend checks Actor/Trip/key
again and exposes a strict STATUS_ONLY allowlist: identity, command/intent/receipt
versions and hashes, target/base/result/observed revisions, outcome, safe error/status
and original committed_at. Intended payload, confirmations, result fields and Source
operational proofs are withheld because this slice adds no Source/Confirmation
read admission. The stored full hash is correlation, explicitly not a hash of the
filtered response. Later Event revisions cannot change that historic projection.

## Lossless Event contract and old clients

`GET /v2/trips/:tripId/canonical-events/:eventId` requires
`X-OTR-Canonical-Event-Read-Version: 1`. Missing/unknown client versions receive
WITHHELD without fetching an Event body. Legacy or unknown temporal versions are
explicitly withheld. No legacy scheduledDate or date/zone fallback is synthesized.

The strict schema retains original B-T3A snake_case names: stable IDs, temporal
version/shape/revision, text/type/status, grouping/reservation references, scope,
timing label/reference, every start/end temporal field, normalized planned slots,
estimated distinction, all four legacy snapshot fields and every authored/accepted
root spatial field/address component with accepted Place and opaque provenance.
Exact local/time/instant strings retain microseconds, offsets, clock precision,
basis, resolution/fold bindings and supporting source instants. No Date conversion
or inferred timezone occurs. Candidate bodies, Source content, financial records,
legacy confidence and booking payloads are not selected.

POINT, CALENDAR, ALL_DAY, SPAN, STAY and WINDOW use the full root representation.
TRANSPORT carries both complete endpoint temporal/spatial families in the same
PostgREST database statement/snapshot as the root; endpoint IDs/roles/cardinality
are checked. All shapes are explicitly READ_ONLY and legacyCompatible=false.
Rich shapes never pass through the old DTO. Accepted opaque refs follow existing
Event/Trip read policy; no dereference or Source content read is introduced.

Existing v1 creates and local reads stay on their original path. A deterministic
v1 create replay encountering any canonical version now rejects rather than returning
a fabricated v1 create receipt. Ordinary old full-save rejection remains enforced
by unchanged B-T3B guards and tested by the SQL regressions. All methods other than
GET on the new boundary return CANONICAL_WRITES_DISABLED after authentication/read
admission; unimplemented command URLs remain unavailable. There is no semantic
entrypoint invocation in HTTP code.

## Mobile transport and deferred local contract

`createTripCanonicalReadTransport` reuses authenticatedClient and the current
Account request context. It captures `{accountId, tripId, generation}` before
credentials, validates typed responses and exact Event/receipt scope, checks the
context again after network completion, and returns that immutable context with
the response. A→B→A responses reject even when Account identity returns to A.
The apply gate is not held across I/O; no persistent apply exists in this slice.

The existing itinerary_items table requires scheduled_date and cannot preserve
these facts. It is intentionally not used. This is transport readiness only,
not a claim of lossless offline mirroring or Mobile editing readiness. A later
reviewed SQLite contract needs Account/Trip-scoped storage of the exact root
snake_case fields, endpoint rows keyed by Event/role, semantic revision and temporal
strings through microseconds, accepted spatial/provenance refs and compatibility
markers. Atomic reconciliation must retain the captured context through commit under
the existing narrow apply gate. No broad SQLite migration has been improvised.

## Validation

| Check                                                                              | Result                                                         |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| New Backend/transport boundary tests                                               | 2 files / 30 cases PASS                                        |
| Backend, API, Auth, repositories and sync regressions                              | 86 files / 676 cases PASS                                      |
| Full isolated native SQL suite                                                     | 38 files / 1,196 assertions PASS; includes 87 B-T3D assertions |
| Reserved-role pollution/reuse                                                      | 78 node tests PASS                                             |
| Backend/PostgreSQL golden codec                                                    | PASS                                                           |
| Concurrent CAS, exact replay, timezone and isolation/gate-close regressions        | 3 node tests PASS                                              |
| Strict baseline verifier and count/same-count checksum negatives                   | PASS                                                           |
| Isolated schema manifest comparison                                                | Exact B-T3D match                                              |
| Typecheck, Backend build, scoped ESLint, UI guard, formatting and git diff --check | PASS                                                           |

New tests cover unknown POINT, date-only CALENDAR, ALL_DAY, source microseconds,
partial unzoned civil facts, accepted spatial fields/Place, four rich shapes,
old/missing/unknown client versions, withheld legacy/future versions, exact historic
receipt correlation, foreign scope, auth/enumeration denial, disabled mutations,
missing DB schema and gateway, service identity rejection, v1 canonical replay
rejection, Mobile lossless roundtrip, cross-Trip response denial and A→B→A fencing.
A catalog assertion compares every non-candidate B-T3B parent addition against
selected fields. Mocked real Supabase gateway tests prove GET-only access to only
admission/Event tables, with no finance/A/C operation, gate or receipt RPC fallback.

One early broad TS run hit the pre-existing client diagnostic assertion that rejects
any occurrence of `42`, including a wall-clock timestamp. Focused rerun and final
consolidated regression pass; that unrelated test was not changed. The known full
repository LedgerExpenseDetail API boundary issue remains outside this scope;
a full-repository green gate is not claimed.

SQL ran only in the independent local `otr-trip-bt3d` environment. A raw PG image
lacked the Supabase platform contract; migration fingerprint checks correctly
refused it. Proper isolated CLI platform initialization then replayed unchanged
migrations successfully. The existing canonical platform was inspected read-only
for schema definitions during diagnosis; no rows or credentials were exported.
The isolated environment was stopped after confirming the gate CLOSED and all
three reserved roles NOLOGIN. No safety check or fingerprint was weakened.

Manifest remains 114 tables/RLS, 1,706 columns, 949 constraints, 361 indexes,
175 functions, 139 triggers, 188 policies, four buckets; checksum
`487437eec9615630f0d1f7e76c58c69ccf11095975a1f8a99de437afd5870f6e`.
No schema, A participation, C Source, financial, queue or local mirror implementation
files changed.

## Changed files

- `backend/src/app.ts`
- `backend/src/supabaseGateway.ts`
- `backend/src/tripCanonicalRead.ts`
- `backend/src/tripCanonicalRead.test.ts`
- `src/data/api/tripCanonicalReadContracts.ts`
- `src/data/api/tripCanonicalReadTransport.ts`
- `src/data/api/tripCanonicalReadTransport.test.ts`
- `docs/API_CONTRACT.md`
- this report
- `docs/CURRENT_IMPLEMENTATION_STATE.md`

## Remaining acceptance prerequisites

Human/independent review, dedicated runtime credential/connection provisioning and
its live fixed read-only identity/transaction proofs remain PENDING. Lossless SQLite
mirroring/persistent reconciliation, Mobile offline acceptance, semantic durable
intent/queue/edit UI, resolver authority and Track C proof/read adapters remain
separately gated. None is authorized or activated by this slice.

Canonical commands enabled: NO. Activation gate open: NO.
Runtime credentials committed: NO. Production accessed: NO.
Hosted Dev accessed/mutated: NO. Sibling worktrees modified: NO. Commit: NO.

**STOP — REVIEW PENDING.**
