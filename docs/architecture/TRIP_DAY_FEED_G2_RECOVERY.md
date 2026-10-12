# G2 Day Feed recovery — 2026-10-12

Implementation baseline: canonical main/local origin/main `b5caa1f`; integrated
production routing `fa8b32a`. Recovery branch `codex/day-feed-g2-recovery` uses an
isolated checkout. Remote freshness is unverified (sandbox DNS unavailable).

## Execution boundary

G2 consumes the existing Day query and owns final presentation rows, keys, NOW
placement and one manually selected Focus. E1B's finite semantic manifest remains
an upstream semantic contract; it neither certifies a selected Day nor inserts
Transition rows. Keep existing P1/P2 geometry and omission behavior. No changes to
Core, schema, admission, sync, providers, or business lifecycles.

The old G2 Gallery at `codex/trip-day-feed-consolidation`/`301830c` is uncommitted
fixture source, not production authority. Its G2/G3 review reports partial native
interaction evidence, pending visual acceptance and unverified VoiceOver/real photos.
Do not import its Gallery controllers, assets or native boot configuration.

The same G2 composition function may accept synthetic Flexible affiliations and
TTR projection inputs. These are dormant preparation seams, with no production
caller. Explicit membership alone affiliates a row; no overlap inference. Scope
filters affect only Choices. Unknown or conflicting affiliations leave Items in
the ordinary stream. No Block model, deletion command, drag or workspace is added.

TTR consumer preparation follows the inspected `ttr-presentation/1` output from
accepted CP04A1/CP03A and Owner's supplied CP04A3 rules. A standalone CP04A3 file
was not located. Consume qualified facts and current row mappings only; relation
identity remains separate from date-bearing row identity. Retain straight-line
facts without mode, confirmed mode without ETA, and suppress only connector
decoration on NOW collision. Output only an `openTtr` intent. Never display provider
observations/Apple ETA. Core occurrence/continuity authority remains unavailable,
as documented by TTR CP04A2; no production TTR integration is authorized here.

Core v2 codecs, actor reads, `CoreDayRow` and `projectCoreDay` are integrated. The
Core-to-production-Feed adapter at `8e3916f` belongs to the concurrent Flight E2E
branch and is not in this baseline. Do not merge it here. Query-level composition
is intentionally compatible with that adapter; full P3–P6 read/render wiring stays
with the next approved Experience checkpoint. Existing v1 query semantics remain.

## Recovered capability inventory

| Capability                   | Baseline classification                                                       | Recovery candidate / limitation                                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final Day stream composition | COMMITTED_AND_INTEGRATED, inline production `DayFeed`                         | One `composeDayStream` path wired into candidate production screen; preserves upstream selectors. Candidate is not merged to main.                                                                                                        |
| E1B semantic composer        | COMMITTED_NOT_INTEGRATED, `57498d6` on `trip/experience`                      | Inspected, unchanged. No automatic semantic promotion or duplicate Event insertion.                                                                                                                                                       |
| P1/P2 Event rendering        | COMMITTED_AND_INTEGRATED, `fa8b32a` plus main fixes                           | Actual production P1Row/FlightRows reused; richer Gallery document/photo/Move actions remain FIXTURE_ONLY.                                                                                                                                |
| Browse geometry              | COMMITTED_AND_INTEGRATED                                                      | P1 and Flight Compact A unchanged; existing light/dark/large-text regressions PASS.                                                                                                                                                       |
| Focus controller             | COMMITTED_AND_INTEGRATED                                                      | One explicit selection, normalized against visible Items; Immersive keeps that Item focused. Clock never selects Focus.                                                                                                                   |
| NOW indicator                | COMMITTED_AND_INTEGRATED                                                      | Existing N1 `placeNow`, shared rail and overlap policy retained; placement now consumed centrally.                                                                                                                                        |
| Transition slot              | FIXTURE_ONLY in old G2; MISSING in production                                 | Synthetic projection consumer outputs slot/facts/connector decision and openTtr only; no production projection supplier or Transition renderer activated.                                                                                 |
| Flexible secondary container | FIXTURE_ONLY in old G2; CONTRACT_ONLY for product                             | Dormant read-only affiliation/Choice port, unique Item references and normal Item Focus/Immersive. Shell/header-to-Block-Immersive and owning business deletion remain CONTRACT_ONLY; no Block Focus created.                             |
| Stable DayRow identity       | COMMITTED_AND_INTEGRATED Event identity in v1; Core role/date keys integrated | G2 v1 composite Event/date key ignores title/revision enrichment; helper preserves explicit Core role/date key dimensions. No v2 row adapter or occurrence token invention. Rescheduling changes presentation key, not relation identity. |
| W0 v2 reads                  | COMMITTED_AND_INTEGRATED in Core                                              | Actor Item/collection/Day code exists. Production Feed in this pinned baseline still uses v1. Concurrent Flight E2E adapter `8e3916f` remains COMMITTED_NOT_INTEGRATED; exact rehearsal below.                                            |
| Feed scroll/date retention   | COMMITTED_AND_INTEGRATED with incomplete evidence                             | Native iOS dismissal callback restores captured nonzero offset once; Android retains its animation-frame fallback; mocked interaction regression covers NOW tick and revision enrichment. Selected view/context code unchanged.           |
| Native integration           | Historical Gallery FIXTURE_ONLY                                               | Earlier G2/G3 review: partial interaction PASS, layout REVIEW WITH LIMITATIONS, visual acceptance pending. No fresh candidate Simulator/device acceptance.                                                                                |

The Flexible membership output is a secondary presentation mapping, not a new
Canonical container. Removing its supplied descriptor preserves all ordinary Item
rows. Choices are preauthorized upstream; My/Group changes their filtered subset
only. Conflicting affiliation or duplicate container identity fails closed to
ordinary rows. Soft windows are neither timestamps nor inferred affiliation inputs.

TTR validates supplied projection version, qualification, scope, useful-fact kind,
mode origin, current row mapping, relation/action identity and publication version.
Past/unknown contexts, missing ports, duplicate slot projections, mismatched or stale
anchors/actions fail closed. NOW collision suppresses only connector decoration.
Provider route observations and externalMaps actions are deliberately absent from
G2 output. The seam supports only adjacent same-day combined v1 Event rows; the
code records that limit. Authoritative cross-day/role-bearing occurrence placement
must await the owning Core port. Fixture coherence is not authorization proof.

## Validation evidence

- Static/fixture: **9 files / 164 tests PASS**, Day Feed/composition/render/clock,
  Day read repository, Day Feed repository, Day read model and Core v2 views/read.
  Includes 8 new composition tests and 3 interaction regressions. Existing suites
  remain intact; new render fixture Flight title is distinct to disambiguate taps.
- Production code integration (candidate source): **PASS**. Existing TripScreen
  calls the changed DayFeed; no routing, repository, import, sync or Canonical writes
  added. This is source/mock evidence, not a main merge or native runtime result.
- Typecheck, full lint (including UI guard), touched Prettier and whitespace: **PASS**.
  UI guard checked 86 representative files, retained 473 baseline occurrences.
- Exact concurrent Flight adapter rehearsal: archive of `8e3916f`, G2 composer,
  and three-way DayFeed merge. One query-selection overlap resolved by retaining
  `projection.version===2 ? projection.query(...) : itemsForLocalDate(...)`, removing
  only duplicate inline row composition. Owning `flightFacts` enrichment retained.
  **6 files / 53 tests + typecheck PASS** in disposable archive. No concurrent branch
  changed/merged. This proves bounded source compatibility, not owner acceptance.
- Owning TTR output type compatibility: actual archival CP04A1
  `TtrPresentationProjection` assigns to the G2 structural consumer type under tsc.
  No TTR implementation imported into this branch.
- Simulator visual: **NOT RUN**. Read-only `simctl list devices booted` failed with
  sandbox/CoreSimulator connection/log access errors. No executable native artifact
  was built or installed, no device booted, no display settings or app data changed.
- Physical-device: **NOT RUN**. Core v2 real-data integration: **NOT RUN**. No
  Hosted/Production/provider/network data operation, full-suite or readiness claim.

## Source provenance and preserved work

- Main/local origin/main: `b5caa1f61cad1d8c612ee40142f3289f69715b5a`, reconfirmed
  after checks. Remote SSH/DNS verification failed; no fresh remote-state claim.
- Integrated production source: `fa8b32a1ebbacb31a53281d837352f4a64a03f17`.
- Old G2 source: `codex/trip-day-feed-consolidation`, `301830c16e633fbc0193113ae9f4642258a9a7f5`,
  six tracked modifications plus untracked Gallery/domain/config work. Preserved.
- G2 archive SHA-256: `f5cfb047e4cdb2b5f93c804eeb5fd9dab263a2ea53fc02d34c86180a336658ab`.
  Archive and G2/G3 report are under the original Documents/Codex outputs directory;
  no Gallery source copied into the recovery branch.
- E1B source: `trip/experience` / `55c8a22`, composer commit `57498d6`.
- TTR source: `codex/ttr04a1-local-foundation` / `a45a5c6`; CP03A correction and
  CP04A2 integration-port report inspected read-only. CP04A3 file not found;
  supplied Owner instructions govern its output-port constraints.
- Flight E2E B observed HEAD `fdd5a5c`; reviewed adapter unit `8e3916f` is used only
  in the exact disposable compatibility rehearsal. No unrelated work incorporated.

Only recovery checkout source/tests/report/current-state handoff changed. Schema,
SQL, migrations, Backend, auth, admission, sync, catalogs, dependencies and native
configuration are unchanged. Recovery commit is recorded by this branch's Git log;
no push, main merge, deployment or runtime activation.

## Remaining seams and next checkpoint

1. **Core + Flight E2E/W7:** accept/integrate owning v2 Feed adapter and actual admitted
   data/native path. The query-selection overlap has a tested reconciliation.
2. **Core + TTR:** role-preserving endpoint qualification, safe provenance,
   actor applicability and edit-stable occurrence/continuity authority. G2 cannot
   certify these from display adjacency; production TTR stays BLOCKED_BY_CORE.
3. **Flexible owner:** owning Block affiliation, authorized Choices and Block workspace.
   Existing G2 preparation does not authorize that model or its UI lifecycle.
4. **Experience/G2 native acceptance:** exact candidate Simulator/physical validation,
   VoiceOver, live Dynamic Type, offline restart and permitted original media.

Recommended next Experience checkpoint: approved W6 supplemental v2 read/render
adapter plus the first P3 Stay vertical slice, using real CoreDayRow role keys and
existing G2 controller. Keep P4–P6 and full Flexible/TTR implementation separate.

**STOP — scoped G2 source integration complete / OWNER REVIEW.**
Main integration and native/Core real-data production acceptance remain open.
