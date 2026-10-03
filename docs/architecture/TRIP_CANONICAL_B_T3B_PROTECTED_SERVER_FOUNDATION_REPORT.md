# B-T3B Protected Server Persistence Foundation

Date: 2026-10-04 (Pacific/Auckland)
Status: **B-T3B IMPLEMENTATION COMPLETE — REVIEW PENDING**.
Canonical commands remain disabled. No commit, deployment or B-T3C work.

## Startup and scope

- Working directory: `/Users/xoery/Project/otr-mobile-temporal`.
- Branch: `trip/temporal`.
- Exact clean baseline: `5537eb6c7e57de13037d9c00d363259e9b0765c8`.
- Startup `pwd`, branch, HEAD, status and recent log passed before work.
- Authority: [B-T3A schema/writer contract](TRIP_CANONICAL_B_T3A_SCHEMA_WRITER_CONTRACT.md).
- The only database target was the disposable local project `otr-trip-bt3b`,
  container `supabase_db_otr-trip-bt3b`, PostgreSQL port 55362. The existing
  canonical stack was neither reset nor modified.

## Exact changed files

| File                                                                           | Change                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `supabase/migrations/20261004000100_trip_temporal_protected_foundation.sql`    | One atomic server foundation migration                                           |
| `supabase/tests/trip_temporal_protected_foundation.test.sql`                   | 145 adversarial/structural/legacy/financial assertions in a rollback transaction |
| `scripts/supabase/trip-temporal-writer-reuse.test.mjs`                         | Isolated pre-existing role/column-grant migration regression                     |
| `supabase/tests/rls_matrix.test.sql`                                           | Explained public table/column/RLS counts only; security assertions retained      |
| `supabase/schema-manifest.json`                                                | Independently replayed schema signature                                          |
| `scripts/supabase/verify-baseline-artifacts.mjs`                               | Exact expected signature/counts and delta comment; drift checks retained         |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`                                         | Short B-T3B handoff                                                              |
| `docs/architecture/TRIP_CANONICAL_B_T3B_PROTECTED_SERVER_FOUNDATION_REPORT.md` | This report                                                                      |

All 65 historical migration files are byte-identical to HEAD. The new migration
contains no business DML or backfill. No application implementation, SQLite,
Backend API, DTO, repository, UI, Source or Booking lifecycle file changed.

## Schema and privilege delta

The migration transaction installs all fields, constraints, guards, role and
privileges before commit. It adds 71 nullable columns without defaults to
`itinerary_events`: marker/version/shape, independent semantic revision, scope,
qualitative timing, literal legacy capture slots, both 14-field boundary families,
and the 33-field spatial family. Existing timestamps retain their values. Legacy
is exclusively `temporal_contract_version IS NULL`; every new field remains null.

`itinerary_transport_endpoints` has 50 columns, parent FK with CASCADE, composite
primary key `(event_id, role)`, only ORIGIN/DESTINATION, normalized `instant`, and
boundary/spatial families. There is no endpoint business UUID/revision, route,
stops, Source table, receipt or canonical command. Canonical TRANSPORT roots have
null new boundary/spatial families, with their compatibility instant slots checked
against both endpoint instants. Even entirely unknown transport has two rows.

| Manifest measure    | Before | After |           Delta |
| ------------------- | -----: | ----: | --------------: |
| Tables / RLS tables |    107 |   108 |         +1 each |
| Columns             |  1,490 | 1,611 |            +121 |
| Constraints         |    825 |   838 |             +13 |
| Indexes             |    349 |   350 | +1 composite PK |
| Functions           |    142 |   154 |             +12 |
| Triggers            |    115 |   125 |             +10 |
| Policies            |    178 |   179 |  +1 read policy |
| Storage buckets     |      3 |     3 |               0 |

The 13 constraints are five FKs, the endpoint composite PK, role and two structure
CHECKs, and four deferred aggregate/link constraint triggers. The ten triggers
are three row guards, three BEFORE TRUNCATE statement guards, and four deferred
validators. Endpoint RLS allows authenticated reads through existing parent Trip
membership/creator checks; service_role has SELECT. Endpoint DML/reference/bulk/
trigger grants are removed from runtime identities, PUBLIC and anon. Event and
participant existing normal row permissions/policies remain; TRUNCATE/TRIGGER are
revoked from PUBLIC/anon/authenticated/service_role, with inherited runtime
privileges checked at migration time.

`otr_trip_event_semantic_writer` is NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
NOINHERIT NOBYPASSRLS. It has no object write grants, app membership or owned
function. Unsafe reused roles fail atomically. PostgreSQL's automatic creator
administration entry for trusted `postgres` is allowed only without SET ROLE and
inheritance; other memberships or assumable bootstrap entries fail. This is
trusted role administration, not a runtime writer path. The reserved execution
identity itself is explicitly rejected until a later approved command phase.

## Guard and invariant behavior

- Ordinary legacy INSERT/UPDATE rejects any nonnull new field, including a marker,
  rather than normalizing it. Legacy row UPDATE/DELETE and participant cascades
  remain possible. Old unknown clock/date values receive no guessed semantics.
- Canonical INSERT/adoption and direct UPDATE/DELETE reject with SQLSTATE 42501,
  including no-op updates, revision downgrade, marker clearing, normalized slot,
  scope, creator/day/reservation changes and cascades. Row guards are invoker
  functions with `search_path=pg_catalog`, independent of JWT/GUC assertions and
  RLS bypass. Retained definer Member removal still reaches the guard.
- The sole maintenance exception nulls at least one nonnull optional Place pointer
  while preserving all other fields and semantic revision. Existing automatic
  `updated_at` maintenance is allowed on roots; accepted/candidate inline facts
  and endpoint identity stay unchanged. No trigger-depth or generic cascade bypass.
- Participant guards inspect both OLD and NEW parent IDs through one fixed,
  read-only canonical classifier. There is no mutation RPC. Canonical initial
  scope must be UNASSIGNED and have no participant rows.
- Deferred read-only validators require two transport endpoints, no endpoints on
  other shapes/legacy, normalized slot/quality agreement, ordered known transport
  instants, and same-Trip day/reservation links. Referenced day/reservation UPDATE
  also validates canonical links; relevant references are locked FOR SHARE.
- Structure CHECKs enforce version/revision bounds; shape/null combinations;
  active-boundary evidence objects; clock/source precision through microseconds;
  known quality/basis/resolution values; required reference bindings; accepted
  offsets and deterministic civil binding hash; finite/ranged coordinate pairs;
  bounded authored/accepted/candidate data; and current candidate input generation.
  Source-confirmed instants normalize from their independent source value; civil
  values normalize only from an accepted resolved offset. GAP/FOLD/PENDING do not
  fabricate instants. Retained conflicting source evidence does not replace the
  chosen basis. Test resolver identities are explicitly synthetic, never runtime
  tzdb identities.
- Statement guards reject bulk truncate, including cascades rooted elsewhere, even
  for legacy-only tables. Protection does not cover trusted DBA/superuser DDL,
  ownership changes or deliberate trigger disabling.

## Validation and acceptance matrix

Final isolated SQL run after the review correction: **35 files / 850 assertions
PASS**, including **145 B-T3B assertions**. Separate migration-reuse regression:
**23 Node tests PASS** (22 subcases plus their enclosing test). Existing Track A participation and all financial SQL suites pass.

| Required evidence                     | Result | Evidence                                                                                                                                 |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Existing rows unchanged            | PASS   | Populated forward snapshots byte-identical; literal midnight preserved                                                                   |
| 2. Legacy create stays legacy         | PASS   | Authenticated/service direct inserts: all 71 new fields null; Backend/queue/repository regression                                        |
| 3. Injection/adoption rejected        | PASS   | Both runtime roles: marker, fields, revision and adoption fail atomically                                                                |
| 4. Canonical edit/delete/downgrade    | PASS   | Both runtime roles plus trusted owner DML; no-op/clear/downgrade/flatten probes                                                          |
| 5. Endpoint CRUD/malformed aggregates | PASS   | Grants and owner guard probes; wrong shape/legacy parent/missing row/duplicate role/normalization checks                                 |
| 6. Participant/Member/Trip cascades   | PASS   | OLD/NEW participant moves, direct Member deletion, retained Member removal definer, Trip delete and Profile creator SET NULL             |
| 7. Runtime TRUNCATE                   | PASS   | Three protected tables, four runtime-role grant inventories, owner-rooted Trip TRUNCATE CASCADE                                          |
| 8. RLS bypass cannot bypass guard     | PASS   | Actual service_role BYPASSRLS flag plus rejected canonical DML                                                                           |
| 9. Private role isolation             | PASS   | Flags/membership/ownership and live-column effective grants; compromised reuse fails atomically; both runtime SET ROLE attempts rejected |
| 10. No executable canonical command   | PASS   | No private-role-owned functions or grants; new definer functions inspect/validate only                                                   |
| 11. Place null maintenance            | PASS   | Real Place FK deletion preserves every remaining root/endpoint fact and revision                                                         |
| 12. Same-Trip integrity               | PASS   | Root links and referenced Day/Reservation cross-Trip moves rejected                                                                      |
| 13. Reservations unchanged            | PASS   | Literal row comparison and populated forward snapshot                                                                                    |
| 14. Financial non-interference        | PASS   | Nonempty financial rows, permissions/FKs and sources unchanged; retained SQL/TS regression                                               |

The participant destructive defense test deliberately inserts an unreachable
inconsistent canonical child under trusted setup, then reenables the guard before
probes and removes the child under trusted cleanup. It proves cascade defenses;
it does not claim ASSIGNED canonical scope is admitted. All canonical fixtures use
owner-only trigger disabling inside rollback test transactions. No bypass ships.

The meaningful financial fixture contains an ACCEPTED Expense for NZD 1,200 minor
units, participant, split, active SAME_CURRENCY valuation, Ledger currency setting,
and a Personal Payment for NZD 100 minor units with private read grants. Before/
after forward migration snapshots compare all Member participation/link facts,
legacy membership, Member policy/grant/trigger and role/status facts, unchanged
financial FKs, Expense/Split/valuation/currency/Payment/grant rows, Settlement source
and Personal Financial Review source. The pgTAP test separately repeats this
comparison after adversarial operations. This is nonempty financial evidence.

## Replay, manifest and application checks

- Prior 65-migration clean replay matched the original manifest before changes.
- Two clean disposable **66-migration** replays of the finalized migration have
  identical manifests. The first SQL run passed 847 assertions; the second final
  run passed 849 after adding two direct legacy-create controls. A separate
  populated prior-baseline forward replay preserved all recorded facts byte-for-byte.
- Final checksum: `0f331b4e5f6ed5421c9ddf1a0c70bbe24b30c05977a90281534958374802900b`.
- Strict verifier PASS; normal negative drift test PASS for count and same-count
  checksum mutations. Comparator matches both clean replays. No suppression or
  drift-detection weakening.
- Full TypeScript run: **166 suites / 1,178 tests PASS; one test FAIL** in
  `src/domain/architectureBoundary.test.ts`: baseline
  `src/features/ledger/LedgerExpenseDetailScreen.tsx` imports `@/data/api`.
  Both files are byte-identical to HEAD. The failure is pre-existing and outside
  authorized B-T3B server work; the full repository test gate remains non-green.
- Focused Backend legacy itinerary and repository/queue/transport regression:
  4 suites / 63 tests PASS. Focused Track A Person repository and Backend bootstrap
  regression: 3 suites / 32 tests PASS.
- Typecheck and lint (including UI guard) PASS. Scoped verifier lint has zero
  warnings. Changed Markdown/JSON/JS formatting and whitespace checks PASS; SQL has no
  configured Prettier parser. Full repository format reports 15 unchanged baseline
  files; those are not rewritten in this phase.
- Validation uses existing dependencies read through local links. Vite/cache output
  stays in this worktree; no sibling dependency tree is written.
- Disposable B-T3B stack stopped without backup; its synthetic volumes removed.
  The original canonical database remains running.
- Private local evidence/logs: `/private/tmp/otr-bt3b-evidence`. No remote data,
  credentials or target was used.

## Independent-review correction: effective column privileges

The independent reviewer found that a pre-existing `GRANT UPDATE(title) ON
itinerary_events TO otr_trip_event_semantic_writer` escaped `has_table_privilege`
and survived the original migration's reuse check. This correction changes only
private-role preflight validation and its regression evidence; temporal/spatial
fields, guards, endpoint model, schema semantics and command state stay unchanged.

The same atomic migration now checks every live user column (`attnum > 0`, not
`attisdropped`) of public tables/views, matching the existing table-check scope. This includes
`itinerary_events`, `itinerary_transport_endpoints`, `itinerary_event_participants`,
and referenced `trip_days`/`itinerary_reservations`. PostgreSQL's native `has_column_privilege` rejects
any effective SELECT, INSERT, UPDATE or REFERENCES capability, including direct
column ACLs, PUBLIC, inherited and table-level grants. The existing membership,
SET ROLE isolation, role attributes/ownership and table INSERT/UPDATE/DELETE/
TRUNCATE/TRIGGER checks remain intact. A conflict raises
`UNSAFE_TRIP_EVENT_WRITER_COLUMN_GRANTS`; the migration never sanitizes the role.
Endpoint validation occurs after table creation and before endpoint grant/revoke
statements, so incompatible default grants fail instead of being silently fixed.

Correction files only:

- `supabase/migrations/20261004000100_trip_temporal_protected_foundation.sql`:
  native effective-column capability check in the existing reuse block.
- `supabase/tests/trip_temporal_protected_foundation.test.sql`: one live-column
  zero-capability assertion; all existing membership/SET ROLE/table checks retained.
- `scripts/supabase/trip-temporal-writer-reuse.test.mjs`: new local migration test.
- `docs/architecture/TRIP_CANONICAL_B_T3B_PROTECTED_SERVER_FOUNDATION_REPORT.md`:
  finding, correction, refreshed totals and acceptance evidence.

The migration test pre-creates the role with exactly the six required attributes.
It commits incompatible fixture grants before trying the full migration. Each
failure verifies the endpoint table and marker expansion are absent and the grant
still exists, proving transaction rollback and rejection without repair. Only the
trusted isolated test cleanup revokes fixture grants; migration code does not.

| New adversarial case                                                                | Result                                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Direct SELECT/INSERT/UPDATE/REFERENCES columns on events and participants (8 cases) | PASS; table-level checks false, effective column checks true; full migration rejects       |
| Direct UPDATE(title) on referenced Day/Reservation (2 cases)                        | PASS; full migration rejects unchanged column grants                                       |
| PUBLIC column UPDATE on events and SELECT on participants (2 cases)                 | PASS; native effective privileges reject, fixture ACLs preserved                           |
| Inherited UPDATE(title) with explicit INHERIT TRUE membership                       | PASS; PostgreSQL resolves capability and existing membership gate rejects unchanged        |
| Table DELETE/TRUNCATE/TRIGGER (3 cases)                                             | PASS; original table-level gate rejects unchanged                                          |
| PUBLIC default SELECT on newly created endpoint table                               | PASS; full migration fails before later privilege revokes; original default grant retained |
| Clean pre-created reserved role                                                     | PASS; full corrected migration succeeds, endpoint table empty                              |
| Direct SELECT/INSERT/UPDATE/REFERENCES(role) on installed endpoint (4 cases)        | PASS; exact migration validation block rejects each unchanged fixture grant                |

The endpoint does not exist at the prior baseline. Its default-grant case tests
actual full-migration failure; its direct-column cases execute the exact reuse
block extracted from the migration after clean installation, without duplicating
validation logic or pretending a pre-existing endpoint is a valid prior baseline.
The runner is fixed to disposable `supabase_db_otr-trip-bt3b` and requires a fresh
prior-baseline database, with the reserved role initially absent:
`node --test scripts/supabase/trip-temporal-writer-reuse.test.mjs`.

Requested revalidation after correction:

- Focused B-T3B SQL: **145 assertions PASS**.
- Complete SQL: **35 files / 850 assertions PASS** on both clean replays.
- Two clean 66-migration replays: PASS; both match each other and the unchanged
  canonical manifest `0f331b4e5f6ed5421c9ddf1a0c70bbe24b30c05977a90281534958374802900b`.
  No schema object delta, manifest/verifier refresh or unrelated baseline change.
- Strict verifier and normal negative count/same-count checksum drift test: PASS.
- Focused Backend itinerary/repository/transport and Track A Person/bootstrap:
  **7 suites / 95 tests PASS**.
- New runner zero-warning lint, changed-file formatting and whitespace: PASS.
- All 65 historical migrations and other pre-existing B-T3B files are unchanged
  from the correction's starting state. Evidence: `/private/tmp/otr-bt3b-review-evidence`.
- Disposable stack removed after checks. Hosted Dev/Production not accessed;
  no commit, sibling worktree changes or B-T3C work.

**Canonical commands remain disabled. STOP — REVIEW PENDING.**

## Risks and stopping point

The largest implementation risk is later activation of a canonical mutation path:
these storage checks cannot prove IANA/tzdb truth, source evidence authenticity,
authorization or operation-level CAS semantics. B-T3C must separately implement and
review those responsibilities before admitting the reserved writer; none is
implemented or claimed here. Trusted owner setup/DDL is outside runtime protection.
The unrelated existing architecture-boundary test failure also prevents claiming
a fully green repository regression gate.

Human and independent review remain pending. Do not start B-T3C or enable canonical
commands from this report. No commit was requested for this implementation.

- Production accessed: **NO**.
- Hosted Dev accessed/mutated: **NO**.
- Canonical command enabled: **NO**.
- Mobile SQLite changed: **NO**.
- Sibling worktrees modified: **NO**.
- Deployment / commit: **NO**.

**STOP.**
