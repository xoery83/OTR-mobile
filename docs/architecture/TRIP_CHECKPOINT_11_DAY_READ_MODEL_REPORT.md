# Checkpoint 11 — Builder A certified Trip Day Read Model

Date: 2026-10-05. Worktree: `/Users/xoery/Project/otr-mobile-temporal`.
Branch: `trip/temporal`. Starting/retained HEAD:
`d295b5e232bbe1e2b2d8ca96a2ff61e57eb3ba34`.
Status: Builder implementation complete; wait for integration/review.

## SQLite 47 (authored, not registered)

`tripDayReadModelMigration` exports id 47, name and executable SQL independently
of the global registry. It adds exactly three normalized tables:

| Table                  | Identity                      | Retained facts                                                                                                                                                                                                                        |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trip_day_projections` | Account + Trip                | Format version 1, independent projection generation, exact source epoch/revision/fingerprint/applied generation, Event count                                                                                                          |
| `trip_day_events`      | Account + Trip + Event        | Certified membership, semantic revision, title/type/status, authored order and Trip Day ID, shape, UNASSIGNED scope, qualitative timing label/evidence, estimated flag and full current root spatial facts                            |
| `trip_day_boundaries`  | Account + Trip + Event + role | START/END or ORIGIN/DESTINATION, normalized instant, original source instant, date/clock/precision, quality/basis, IANA zone, supplied/resolution offsets, resolution and interpretation evidence, provenance; endpoint spatial facts |

Root spatial facts live once on the Event. Root boundaries carry null spatial
fields; transport boundaries retain each endpoint's independent spatial facts.
Opaque provenance maps are JSON in their specific columns; no arbitrary canonical
Event JSON, formatted display strings, legacy snapshots or device interpretations
are duplicated. Event and endpoint temporal strings preserve every original digit
and offset. Coordinates remain binary64, matching the accepted canonical contract.

Projection and source applied generations use storage-type-checked BLOB affinity
with INTEGER-only safe positive bounds, avoiding affinity coercion. Source revision
is bounded canonical decimal TEXT. Child foreign keys cascade only within the new
projection family. There is no dependency on mutable mirrors, certificates, Trip
rows or network availability. SQLite 1–46 and global registration are untouched.
The default factory is provided but unwired; integration must register 47 before
activating it.

## Coherent certified-source contract

The existing canonical repository gains only
`withCertifiedCollection(context, async source => ...)`. Its callback executes
under the existing Account apply gate and inside the same SQLite transaction as
all source reads. It must not open a nested transaction or perform network I/O.

The seam validates exact captured Account/Trip/generation, certificate versions,
complete marker, epoch/revision/hash/count and durable applied/watermark bounds.
It reads normalized membership, checks exact scoped root membership (including
absence of extra roots), rejects orphan endpoints, decodes every certified root
and its endpoint facts, verifies identity/Trip/UNASSIGNED scope, and recomputes the
unchanged B-T3G fingerprint. Individual member reads occur **inside** the still-open
transaction. There is no certificate-then-detached-member-read path.

Missing/unsupported/malformed/contradictory mirror or certificate facts yield null
(non-certifiable); database/crypto availability and Account fencing failures
propagate. A null source cannot create a complete projection. Source certificate,
refresh/apply semantics, membership fences and individual mirror behavior remain
unchanged. The existing focused test's repository-method inventory adds one entry.

## Build, independent generation and fencing

`prepare(tripId)` captures the existing Account request context and reads the
certified source plus prior projection generation in one coherent transaction.
It derives/validates the smaller projection outside that transaction and returns
an installation closure; mutable projection input is not exposed to its caller.
`rebuild(tripId)` performs both phases explicitly, without startup scheduling.

The installation closure repeats the entire certified-source read under the
existing Account apply gate/SQLite transaction, compares exact epoch, revision,
fingerprint, applied generation and membership, and CAS-checks the captured
projection generation. It deletes/replaces the scoped header and all children in
that transaction and reasserts Account context before commit. Failure rolls back
all replacement writes. A later accepted installation wins over an older builder,
even for an identical source. Reusing an installation closure fails the same CAS.

Projection generation increments independently for each successful installation;
it is neither Event semantic revision nor source applied generation. Overflow
rejects without replacing accepted data. Account A→B→A invalidates old closures
through the existing generation. A pending Account transition invalidates an apply
before commit; the transition itself waits for the gate. Trip IDs are captured,
never reread from a selected-Trip setting or redirected to another Trip.

## Temporal and Day query behavior

- Day queries require an explicit Gregorian calendar date plus IANA zone. Today
  and Tomorrow require explicit offset-bearing `now` plus zone. Tomorrow advances
  the calendar label; it does not add 24 elapsed hours.
- Intl with explicit zone/Gregorian/Latin-digit context derives query Day bounds.
  Spring/fall DST produce the actual 23/25-hour Day. Skipped Dates have empty
  physical intervals. These bounds are query derivations, never Event facts.
- Normalized accepted instants compare through exact BigInt microseconds, including
  offset equivalence and negative epoch values. Date receives only floored
  milliseconds for calendar formatting; no ordering or stored fact is rounded.
- CALENDAR stays an annotation. ALL_DAY with an accepted zone projects that named
  day's overlap into the requested zone (`NAMED_DAY` occupancy), including two
  other-zone Days when appropriate, without an appointment anchor. ALL_DAY without
  a zone remains an authored-date group, without claiming physical occupancy.
- WINDOW stays qualitative; no numeric window/midpoint is invented. Date-known
  untimed or unresolved clocks group by authored label, without cross-zone physical
  conversion. No date means no fabricated Day membership. The unresolved set keeps
  those candidates available separately.
- EXACT SPAN/STAY/TRANSPORT pairs use `[start,end)` overlap (`INSTANT_INTERVAL`).
  Equal boundaries give zero occupancy. Estimated anchors remain comparable and
  retain their estimate, but do not assert exact interval occupancy. Missing ends
  produce only supported milestones, never infinite occupancy.
- STAY with an ordered date pair but unresolved boundary clocks may retain
  half-open authored night intent (`CALENDAR_NIGHTS`), explicitly distinct from
  measured physical occupancy/duration. Checkout remains an authored milestone.
- ORIGIN/DESTINATION remain role-specific milestones; an Event appears at most
  once per Day query with its matching roles. Endpoint spatial/zone contexts remain
  independent. The same Event identity survives all multi-day projections.
- Chosen SOURCE_INSTANT must match its normalized slot; chosen resolved civil slots
  must match accepted date/clock/offset arithmetic. Reversed pairs and inconsistent
  transport root/endpoint slots reject derivation. Retained conflicting civil/source
  evidence remains available but is non-comparable for the combined schedule.
- Comparable items sort by exact real anchor, authored order then stable Event ID;
  next endpoint ties also use role. Occupancy-only timed items retain the real start
  anchor. Non-comparable items sort by authored order (null last) then identity.
  No total chronological ordering is claimed between those groups. Status is
  preserved; this foundation does not infer attendance or filter lifecycle states.

The domain/repository API provides `itemsForLocalDate`, `today`, `tomorrow`,
`nextComparableEvent` and `unresolvedCandidates`. Next means strictly after `now`
at microsecond precision; the result retains Event, endpoint role and original
anchor. It always includes a conservatively broad Trip-wide unresolved/non-comparable
candidate set, including date-only/all-day/qualitative entries. This set is not a
claim that all candidates happen today or before the selected comparable anchor.
A context-free unresolved inventory performs no calendar interpretation. Query
wrappers return projection metadata and source status alongside their result.

## Offline current versus historical

`getProjection(tripId)` reads the complete scoped immutable projection in one
Account-gated transaction, without a token, transport or network. Optional coherent
source revalidation compares exact association/membership, independently derives
the retained subset for fact equality, and verifies the projection generation is
still the one read. Only success marks `CURRENTLY_MATCHES_SOURCE`.

Missing, changed, corrupt or unavailable source data marks
`HISTORICAL_ACCEPTED_PROJECTION`; it does not discard accepted offline rows. Both
statuses retain exact source/version/generation metadata. Freshness is an observation
at the completed read transaction, not a promise of future mirror stability or
server freshness. A newer individual read cannot mutate projection rows. Corrupt
projection structure fails integrity validation; Account fencing is never swallowed
as an offline fallback. File-backed cold restart tests cover matching, changed and
removed source data, with no configured transport.

Participant completeness remains B-T3H's UNASSIGNED-only boundary. No membership,
participant-aware view, command, UI, polling or timer is introduced.

## Validation

Final verification PASS.

- Focused Day domain/repository: 2 files / 101 tests PASS (53 temporal/query,
  48 certification/install/migration/offline).
- Relevant regression selection: 15 files / 290 tests PASS (includes the 101
  focused tests). Includes B-T3I, B-T3F,
  canonical transport, Account fencing/switching/local state, auth repository/token,
  authenticated client and SQLite database/connection/error helpers.
- Typecheck, lint/UI guard, all ten changed-file formatting checks and
  `git diff --check`: PASS. UI guard reports its unchanged 473 legacy occurrences
  and checks 76 representative UI files without baseline forgiveness.
- Independent WAL writer test verifies a concurrent individual mirror mutation
  cannot mix certificate/member observations. Buffered builders revalidate before
  install. Trigger and pre-commit fault tests verify full rollback.
- Server migration/manifest suites are outside this local-only slice. No Hosted
  Dev/Production, server schema, commit, push or deployment was performed.

## Exact changed files

1. `src/data/db/migrations/tripDayReadModel.ts` (new)
2. `src/domain/trip/dayReadModel.ts` (new)
3. `src/domain/trip/dayReadModel.test.ts` (new)
4. `src/data/repositories/tripDayReadRepository.ts` (new)
5. `src/data/repositories/tripDayReadRepository.test.ts` (new)
6. `src/data/repositories/defaultTripDayReadRepository.ts` (new)
7. `src/data/repositories/tripCanonicalEventRepository.ts` (narrow new read seam)
8. `src/data/repositories/tripCanonicalEventRepository.test.ts` (method inventory only)
9. `docs/adr/2026-10-05-trip-day-read-model.md` (new)
10. `docs/architecture/TRIP_CHECKPOINT_11_DAY_READ_MODEL_REPORT.md` (new)

Integration-owned files, global migrations/count assertions, server schema and
B-T3I certification semantics are unchanged. Builder B is not integrated.

## Final attestations

```text
Builder A implementation complete: YES
SQLite47 authored: YES
SQLite47 globally registered: NO
global migration registry changed: NO
B-T3I certificate semantics changed: NO
partial/withheld collection can create complete Day projection: NO
mutable individual read silently mutates accepted projection: NO
device timezone implicitly used: NO
midnight fabricated for unknown time: NO
microsecond precision preserved: YES
Account/Trip isolation preserved: YES
A→B→A stale apply fenced: YES
offline cold-start supported: YES
participant membership inferred: NO
UI added: NO
polling/timer added: NO
server schema changed: NO
global integration-owned files changed: NO
Production/Hosted Dev accessed: NO
commit: NO
push: NO
```

Git status: two modified existing files and eight new untracked files, exactly the
ten files listed above. Branch and HEAD remain unchanged. No Builder B integration
or deploy was performed. Register SQLite 47 only in the Integration Agent's slice.

STOP — BUILDER COMPLETE / WAIT FOR INTEGRATION.
