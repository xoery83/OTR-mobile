# B-T3H Protected Collection Snapshot / Cursor Server Foundation

**B-T3H FULL PASS / ACCEPTED / CLOSED**

Date: 2026-10-05. Authority: accepted B-T3G collection contract, B-T3E individual
read contract and B-T3A revision-neutral Place cache loss. Implementation is local
and runtime-disabled. User acceptance closes B-T3H; dedicated connection provisioning
remains deferred.

## Focused P1 float-stability correction

**B-T3H FLOAT-STABILITY P1 CORRECTION — FULL PASS / ACCEPTED / CLOSED**

The sole observation SQL change pins float output inside the new function rather
than inheriting database, role, caller or pool state. Its exact configuration is:

```sql
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
SET timezone = 'UTC'
SET datestyle = 'ISO, YMD'
SET extra_float_digits = 3
```

The exact catalog proconfig is `search_path=pg_catalog`, `TimeZone=UTC`,
`DateStyle=ISO, YMD`, `extra_float_digits=3`. pg_get_functiondef SHA-256:
`efbf2bebaa3a4a9e183b027422c6b12315f88c772d1c6fe63fdd0f68797165e8`.
The manifest checksum changes only to account for this function definition/config;
object counts and privileges are unchanged. A new SQL assertion checks the entire
fixed proconfig, and the static foundation verifier requires the local float setting.
The hostile-reuse suite now also rejects a pre-existing same-signature observation
function with hostile EXECUTE while preserving the fixture on rollback; accepted
admission dependency hash checks continue to pass. No extra privilege is introduced.

New regression cases (10 subtests plus their parent) use separate psql connections:

1. Exact function config, caller-setting restoration and reviewer vector demonstrably
   rounded by unprotected EFD 0 compared with 3.
2. Root accepted latitude/longitude: `1.2345678901234567`, `-179.99999999999997`.
3. ORIGIN accepted latitude/longitude: `-1.2345678901234567`, `180`.
4. DESTINATION accepted latitude/longitude: `90`, `-1.2345678901234567`.
5. Same epoch/revision, 102 Events/order, canonical leaf bytes and fingerprint under
   caller EFD 3, 0 and -15. All six certified float8 fields reconstruct exactly.
6. Cursor created at 3 continues at 0 without writes.
7. Cursor created at 0 continues at 3 without writes.
8. Cursor created at 3 continues at -15 without writes.
9. Truly contradictory coordinate bytes at equal identity still fail with
   CANONICAL_EVENT_SNAPSHOT_INVALID.
10. An actual business coordinate change advances collection revision/fingerprint
    and rejects the old cursor.

The independent `/private/tmp/otr-bt3h-review-float.mjs` remains unchanged. Its
original assertion expecting different fingerprints now fails as expected. A copy
with only that bug expectation reversed and continuation success asserted passes:
both reads preserve latitude `1.2345678901234567`, fingerprints match, continuation
is valid. Its original SQL/fixtures remain intact. Independent Python reproduction
still matches all five B-T3G golden byte/hash vectors.

Byte comparisons against the pre-correction implementation confirm the complete
Backend fingerprint/cursor implementation, route/gateway, individual read/DTO and
B-T3F repository are unchanged. The historical 71 migrations and SQLite 44/45 are
also unchanged. Only the new B-T3H migration, its regression/security checks,
manifest definition checksum and reporting evidence are corrected. Candidate/provider
numeric data remains outside certified projection.

- same snapshot identity can vary with caller extra_float_digits: **NO**
- root float8 bytes stable across sessions: **YES**
- ORIGIN float8 bytes stable across sessions: **YES**
- DESTINATION float8 bytes stable across sessions: **YES**
- cross-session continuation cursor remains valid without writes: **YES**
- genuine same-identity contradictory bytes still fail closed: **YES**
- B-T3G golden fingerprints unchanged: **YES**
- B-T3G fingerprint algorithm / cursor semantics changed: **NO**
- historical migrations / SQLite 44/45 changed: **NO**
- runtime credentials added: **NO**

## Scope and baseline

- Worktree: `/Users/xoery/Project/otr-mobile-temporal`, branch `trip/temporal`.
- Clean starting HEAD: `2c81c548f9dfbe38a80ad3ee8e8c7ff18d8fa6ca`.
- Both canonical/import sibling worktrees were clean at startup and are untouched
  by this task. At final verification canonical remains clean; import contains
  concurrent C-I3G current-state/report/parser artifacts from other work. They
  were neither edited nor removed by this task.
- One additive server migration: `20261005000100_trip_event_collection_foundation.sql`.
  All 71 historical migration files remain byte-identical to HEAD.
- SQLite migrations 44/45, B-T3F repository, B-T3E read implementation and DTO schema
  are byte-identical to HEAD. No new dependency, UI, command or Mobile collection apply.

## Protected counter and observation

`trip_event_collection_state` adds exactly three columns: Trip primary/FK,
random namespace epoch and positive bigint revision bounded by 9007199254740991.
Existing Trips receive initial namespace/revision; accepted Event facts are not
backfilled or adopted. Future Trip insertion initializes its namespace atomically.

Counter maintenance covers canonical root membership and positive read-field
changes, endpoint changes and participant rows/scope changes. Accepted Place UUID
loss to null changes collection revision and fingerprint without changing Event
semantic revision. Exact no-ops, timestamp/candidate-only changes and legacy-only
rows do not increment the counter. Native row updates serialize concurrent writers;
rollback also rolls back counter changes. Missing namespace or overflow rejects the
write. A→B→A and delete/reinsert cannot recover a prior cursor merely by recovering
identical read bytes. Epoch is stable within the namespace and revision is sent as
an exact decimal string; A, finance and Source counters are independent.

The fixed `trip_event_collection_observe(actor,trip)` function requires the actual
session identity `otr_trip_event_collection_gateway`, primary database and READ
COMMITTED. One authoritative statement with materialized CTEs observes current
admission, namespace/revision, all canonical roots/endpoints and participant-row
absence. It uses accepted admission and fact validators with fixed search path and
UTC/ISO serialization and function-local `extra_float_digits=3`. No transaction remains open across HTTP requests.

Eligibility examines the uncapped canonical set. Marker-null legacy Events remain
outside that set. Any unsupported temporal contract, non-UNASSIGNED scope or
unexpected participant row withholds the entire collection. Known invalid accepted
facts or invalid TRANSPORT aggregate fail closed. No unsupported Event is dropped
before counting or hashing. Root/endpoints form complete aggregates and the output
uses the B-T3E positive field allowlist; private Source, candidate, participant and
financial payloads are not exposed.

The SQL result is an internal coherent full observation. As required by B-T3G,
Backend applies the ECMAScript byte codec, validates the whole observation and
fingerprints it before slicing a page. PostgreSQL jsonb text is not substituted for
the normative codec. SQL enforces the Event count cap; Backend also enforces full
canonical read-byte and actual page-body bounds. There is no truncation fallback.

## Route, fingerprint and cursor

- Only `GET /v2/trips/:tripId/canonical-events/snapshot`; no alias.
- Both collection/read version headers must equal `1`. Unsupported client versions
  produce WITHHELD / UNSUPPORTED_CLIENT after authentication and admission.
- Query is absent or exactly one cursor. Page size is fixed at 100 complete Events.
- Limit: 10,000 Events, 64 MiB total canonical read bytes, 4 MiB actual page body.
- Every request rechecks verified Actor/current Trip read admission. Existing
  no-store responses and redacted canonical-read telemetry remain in effect.
- Missing/wrong dedicated connection returns WITHHELD /
  COLLECTION_CERTIFICATION_UNAVAILABLE. Service-role list fallback is absent.

The fingerprint implements B-T3G leaf and collection domain separators, lowercase
UUIDs, endpoint role ordering, recursive UTF-16 object-key sorting, ECMAScript
binary64/JSON.stringify number spelling and UTF-8 bytes. Malformed Unicode rejects;
accepted strings/maps are preserved. Event IDs sort in ASCII order. Account,
epoch/revision and page continuation do not alter content fingerprints.

Cursor JSON has the exact B-T3G ordered schema and canonical unpadded base64url
encoding. Strict UTF-8 decoding and re-encoding reject alternate representations,
duplicate/extra fields and unsupported versions. It binds Account, Trip, versions,
namespace/revision, full-set count/hash and EVENT_ID_ASC continuation. Ordinals must
be positive multiples of 100 strictly below the full count. Scope or stale identity
rejects with INVALID_EVENT_COLLECTION_CURSOR; contradictory bytes at equal snapshot
identity reject with CANONICAL_EVENT_SNAPSHOT_INVALID. Page retries are deterministic.

First, continuation, final and empty pages use the exact SNAPSHOT_PAGE envelope.
A final page is complete only as the end of the same validated snapshot; callers
still require contiguous prior pages and full fingerprint validation. Empty complete
is distinct from WITHHELD or error. Partial/withheld/stale output cannot certify
absence. No deletion command or local deletion/application path is added.

## Roles, privileges and hostile reuse

Three NOLOGIN, NOINHERIT, NOBYPASSRLS roles have narrowly separated capabilities:

- `otr_trip_event_collection_gateway`: schema USAGE and only the fixed observe
  entrypoint; no application-table/column access.
- `otr_trip_event_collection_reader`: owns observe, private SELECT policies on
  namespace/root/endpoint/participant tables, exact existing admission/validator
  EXECUTE capabilities and extension digest; no Event DML.
- `otr_trip_event_collection_maintainer`: owns namespace and two maintenance trigger
  functions; limited root classification SELECT; no Event DML.

No runtime principal receives these roles or credentials. Trusted postgres bootstrap
administration retains SET=false/INHERIT=false outside the migration. Temporary
creation privileges are revoked in the same transaction. New function PUBLIC/API
EXECUTE and new table API/PUBLIC privileges are revoked. Existing Event command
activation and writer grants remain unchanged.

Preflight checks exact flags, membership/SET paths, effective direct/PUBLIC/inherited
table and column privileges, sequences, schema CREATE, default ACLs and ownership
via pg_shdepend. Existing utility EXECUTE exceptions require exact accepted
signature plus definition hash. The six admission/validation dependencies also
have explicit owner/definition verification before capabilities are granted.
Hostile same-signature helper replacement rejects. Failed reuse leaves hostile
fixtures intact and rolls back all new objects instead of sanitizing the role.

## Validation evidence

All commands ran against local code or a new disposable local stack
`otr-trip-bt3h`; no Production/Hosted Dev connection was used.

| Check                                                       | Result                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Backend collection focused tests                            | 24 tests PASS                                                      |
| Full Backend suite                                          | 28 files / 328 tests PASS                                          |
| B-T3E/T3F plus auth/DB/repository/sync regression selection | 63 files / 527 tests PASS                                          |
| New SQL suite                                               | 37 assertions PASS                                                 |
| Full SQL after clean 72-migration replay, run 1             | 41 files / 1,428 assertions PASS                                   |
| Full SQL after independent clean replay, run 2              | 41 files / 1,428 assertions PASS                                   |
| Hostile reuse and populated forward install                 | 44 Node tests PASS, including parent                               |
| Live pagination/concurrency/ABA/Place loss integration      | 7 Node tests PASS, including parent                                |
| Independent Python golden codec reproduction                | All five B-T3G examples match exact hashes/bytes                   |
| Typecheck / Backend build / full lint / UI guard            | PASS                                                               |
| Manifest verifier / count and checksum drift negatives      | PASS                                                               |
| Public/storage schema diff                                  | No schema changes found                                            |
| Historical migration byte comparison                        | All 71 unchanged                                                   |
| Changed-file formatting / whitespace                        | PASS                                                               |
| Full-repository formatting                                  | 17 pre-existing, untouched files fail; each byte-identical to HEAD |

Coverage includes empty/one/1000+ collections, TRANSPORT ordering and validity,
current auth/Trip privacy, wrong/future/malformed/stale cursors, same-page retry,
semantic and set ABA, delete between pages, Place FK SET NULL, unsupported scope or
participant rows, overflow, whole-set limits beyond the first page, rollback,
concurrent writers, READ COMMITTED requirement and zero-row privilege probes.
Populated forward install compares every row of all 118 historical public tables
byte-for-byte and retains accepted expense/split/participant/valuation/payment and
Person fixtures. It changes no historical facts or unrelated cursor state.

The two independently generated manifests are identical: 119 tables, 1,775 columns,
370 indexes, 204 policies, 148 triggers, 212 functions, 119 RLS tables and 1,027
constraints. Four storage buckets remain unchanged. Checksum:
`cf0f9aa74557cfa256cf583b47c8fbd561f5969a4f7fd299194249a95607b80b`.
Relative to baseline, the deltas are +1 table, +3 columns, +1 index, +5 policies,
+4 triggers, +3 functions and +3 constraints. The retained chain now has 72 versions.

Local evidence logs live under `/private/tmp/otr-bt3h` and are not committed.
No runtime credential or local stack output is copied into repository artifacts.

## Review boundaries and next checkpoint

This is the protected server foundation. Dedicated runtime connector/credential
provisioning and live runtime acceptance remain pending. Mobile contiguous-page
validation, collection certificate/application/removal and central refresh/wake
integration are separate deferred work. Review does not open an activation gate.

- collection server foundation implemented: **YES**
- Mobile collection apply: **NO**
- Event commands enabled: **NO**
- deletion command enabled: **NO**
- participant adapter enabled: **NO**
- polling/timer: **NO**
- Production/Hosted Dev: **NO**
- sibling modifications: **NO**
- commit: authorized after user acceptance; see Git history.

**STOP — ACCEPTED / CLOSED.**
