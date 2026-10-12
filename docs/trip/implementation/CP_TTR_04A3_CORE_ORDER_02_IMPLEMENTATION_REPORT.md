# CP04A3-CORE-ORDER-02 implementation report

**SQLite allocation correction PASS: actual Flight56 → TTR57. STOP AT OWNER REVIEW.**

## SQLite allocation correction — Owner Review

Correction commit `c88796f284d5147324f705d918ee26d3f31ef524`; correction
implementation tree `ab49c6e459811edeb58ba0bbdab8e641a451e11a`.

Latest verification: local canonical `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016`,
remote canonical `b4ddd27d2352350b6d16617543d0f17a715dc077`.
All registered existing worktree migration definition files were scanned; SQLite57
was unallocated. The exact remote migration definitions also contained no57.

Flight56 is the actual accepted `capturePdfSourceHandoffMigration`, copied without
byte changes from the registered Flight Native worktree. The registry installs56
then `coreOrdinaryOrderMigration`57. TTR file differs only in its numeric ID; its
SQL body and authority semantics remain byte-identical. Existing version/fixture
expectations now follow the complete1–57 registry rather than omitting Flight56.

New real file-SQLite cases cover both fresh creation and upgrade from55 through
actual56/57, exact ledger sequence, both tables and Flight immutable trigger,
foreign-key integrity, cold reopen and idempotent migration replay. Existing
owning PostgreSQL→read2→SQLite tests verify accepted collection replay, offline
qualification and retention with both migrations installed.

Focused42 PASS/one existing skip across3 suites. Owning ordinary SQL2 PASS;
joined Flight SQL/SQLite/Day1 PASS on an isolated rerun. Typecheck, lint/UI guard,
Backend build, touched formatting and diff checks PASS. The initial concurrent
broad/focused/Flight runs produced timeout failures under load; isolated focused
and Flight reruns pass. Final limited-worker full run: **3892 PASS,25 skips,two exact baseline UI
failures only**. All extra timeout failures cleared.
No timeout or authority semantics were changed to obtain a pass.

The correction touches14 implementation/test files (including the unchanged
carried Flight56 module) and the three existing handoff documents. Exact final
candidate HEAD/tree and all changed-file hashes accompany the final handoff.
No canonical merge/push, Hosted install or activation occurred.

## Provenance and scope

Branch `codex/cp-ttr04a3-core-order-02`, isolated worktree
`/private/tmp/otr-cp-ttr04a3-core-order-02-20261013`.
Base `a878be35db92fb7e36edd5e89f26fe94f1bcb07a`.
Implementation commit `f58ab85b4afc8ca828166b26672714b1da06c86e`;
implementation tree `ce3bbf92a67632a71aca9ae16872bf707de26ef3`.
The subsequent documentation commit adds this report, the versioned interface and
a short current-state entry only; its exact final HEAD/tree is in the handoff.

Canonical allocation check observed local main
`54ecb4bad6b91827d3abb42f355fc1e0d1fc7016` and actual remote main
`b4ddd27d2352350b6d16617543d0f17a715dc077`. No merge, fetch-based integration,
canonical write or push was performed. Canonical Platform dirty file hashes remain
identical to the initial snapshot; Capture/Experience worktrees were read-only.

## Authority and interface

One private Trip/Person ordinary-order carrier, explicitly authored by the linked
participating actor through existing Core command/CAS/receipt authority. No new
writer, graph, Transition Event or cloud pair table. Complete accepted owning
facts determine safe actor projection; local SQLite qualifies adjacent pairs.
See `../contracts/CORE_ORDINARY_ORDER_TTR_INPUT_V1.md` for exact SET_ORDINARY_ORDER,
read2 negotiation, readTtr and transaction-compatible checker API.

A→B, B→C, C→D are independently qualified. Missing B endpoint fences A→B/B→C
while C→D survives. A private B is redacted into UNKNOWN A→C, without UUID/count
or Source leakage. Unplaced applicable unknown-day Items conservatively prevent
plausible completeness claims. Explicit leg coverage returns EXPLICIT_TRANSPORT;
NONE_PROVEN qualifies, UNKNOWN fails closed. Transport arrival→next ENTRY uses
DESTINATION coordinates and arrival terminal details. Reschedule preserves visit
identity; branch/Person/access changes invalidate captured authority.

Accepted coordinate pairs with null Place ID qualify. Coordinate equality/shared
venue still returns equivalence UNKNOWN. No accepted equivalence evidence exists
in current Core, so this port does not emit SAME_LOCATION or a distance-based
no-transition claim. Terminal/access annotations remain available.

## Migration allocation correction

Owner allocated Flight `20261013000100_source_pdf_upload_authority.sql`.
TTR is now **`20261013000200_core_ordinary_order.sql`**. Registry/all registered
worktree scans and remote tree inspection found 00200 unused before rename.
The old unintegrated TTR filename is absent. Rename and runner reference are the
only collision correction; no historical or Flight migration bytes changed.

TTR SHA-256 before/after:
`45c36ccf6f3d0ca92f30b3e78689fb95a6490e64a811bf2b670d521dfe8093c1`.
Flight accepted file SHA-256 (both registered upload worktrees):
`a8f39d530420b4769310ae9c431633aba3136be4d031bc0dd17fa0c433aaa1a4`.
Final migration-definition scan found a second collision: Flight PDF Native
`capturePdfSourceHandoff.ts` allocates SQLite56, name `capture_pdf_source_handoff`,
at worktree `/Users/xoery/.codex/worktrees/flight-pdf-native-01/otr-mobile-canonical`,
HEAD `ce8200a8218fb6251b2b7d9a4f85297b45868c93`.
The implementation stopped at that conflict; the Owner subsequently authorized
TTR57 allocation only. A fresh definition scan across all registered worktrees and
the exact remote tree found57 unused. Flight56 is carried byte-identically from
that accepted worktree and registered before TTR57. No Flight production semantics
or SQLite1–55 migrations are changed. The PostgreSQL00200 allocation is unchanged.

TTR SQLite module SHA-256 before allocation correction:
`82a064844c56bfeb7fc1198b051b8d8342f1b1fa01448e22824888039751d082`.
After only `id: 56` → `id: 57`:
`4bfa5c153fcc68f86cd79412fb65cfe7d06959cdea98cc3739b2834e30f71c40`.
Exact normalized bytes and SQL template equality verified.
Flight56 module SHA-256:
`a47a0b932d289c59ec14e6754c0d214bf447d36e8cdbc687e2be2ba3ed065065`.
Accepted source and carried candidate bytes match exactly.

Disposable PostgreSQL installed Core85–92, accepted PDF derivative/registration,
unchanged Flight00100, then TTR00200 successfully. No dependency conflict.
Runner supports an explicit local accepted Flight fixture path only for this
ordering check. Historical Core329 functions preserved; all377 installed functions
unchanged during the acceptance scenario; RLS and activation CLOSED PASS.

## Original pre-correction verification

- Full Vitest: **3890 PASS, 25 skipped, two existing baseline failures** only:
  navigationLayout tabBarActiveTintColor and architectureBoundary diagnostics import.
  SQLite latest-version expectations and one native fixture advanced to56; historical
  migration-specific tests retain their original target versions.
- Focused combined17 suites/285 tests PASS before filename correction; final full
  run covers those code paths, including12 dedicated ordinary domain tests.
- Actual owning PostgreSQL + file SQLite: **2 PASS**, including three pairs,
  author-self fences, CAS, exact replay/lost response, private receipt STATUS_ONLY,
  negotiated/default collection, replay counts1order/4Items, cold offline reopen,
  Account generation/Trip/access fences and inner transaction revalidation.
- Unknown B ENTRY zone returns unavailable while a personal selection sentinel
  remains unchanged. Tampered captured input with original key is rejected.
- Existing joined Flight SQL→read2→SQLite→Day: **1 PASS**, same two UUIDs/revisions,
  lost collection recovery, cold offline reopen and no private Source leakage.
- Typecheck, lint/UI guard (473 legacy/90 representative files), backend build,
  touched TypeScript formatting and git diff check PASS.

Evidence logs retained under `/private/tmp/otr-order-*`: `full2.log`,
`renamed-sql.log`, `flight-renamed.log`, `types-renamed.log`, `lint-renamed.log`
and `build-renamed.log`. Disposable network-none fixtures were removed by runner.
No Hosted/native/simulator acceptance is claimed.

## Remaining gates

Owner Review and separate normal integration decision; current canonical has
advanced independently. Hosted migration install and command negotiation activation
remain CLOSED. Explicit order-authoring product integration is not activated.
Real TTR consumer integration must honor spatial UNKNOWN/geometry distinction and
terminal/access exceptions before suppression. Same-day accepted supported endpoint
pairs are implemented; cross-day, repeated UUID visits, split/rejoin, Flight
connections, unsupported operative mappings and unknown-zone contexts remain
unavailable. No Flight Source/Publisher/Admission, G2 Composer, TTR personal state,
Provider or Production mutation.

## Exact implementation manifest (32 files)

```text
backend/src/coreOrdinaryOrder.sql.test.ts
backend/src/tripCoreV2Collection.ts
backend/src/tripCoreV2Http.ts
backend/src/tripCoreV2PgRead.ts
backend/src/tripCoreV2PgStorage.ts
scripts/trip/core-v2-sql-acceptance.py
src/data/api/tripCoreV2Transport.ts
src/data/bootstrap/participationWakeAcceptance.test.ts
src/data/db/checkpoint11Integration.test.ts
src/data/db/database.test.ts
src/data/db/migrations.ts
src/data/db/migrations/coreOrdinaryOrder.ts
src/data/db/publicationMembershipMigration.test.ts
src/data/foundation/diagnosticsReadOnly.test.ts
src/data/repositories/captureBatchAssessmentObservationRepository.test.ts
src/data/repositories/captureFlightNativeRepository.test.ts
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
src/data/repositories/tripCoreV2Repository.ts
src/data/repositories/tripPublicationMembershipRepository.test.ts
src/domain/trip/__fixtures__/coreOrdinaryOrder.ts
src/domain/trip/tripCoreOrdinaryOrder.ts
src/domain/trip/tripCoreTtr.test.ts
src/domain/trip/tripCoreTtr.ts
src/domain/trip/tripCoreV2.ts
src/domain/trip/tripCoreV2Commands.ts
src/domain/trip/tripCoreV2Day.ts
src/domain/trip/tripCoreV2Graph.ts
src/domain/trip/tripCoreV2Mutation.ts
src/domain/trip/tripCoreV2Read.ts
src/domain/trip/tripCoreV2Receipt.ts
supabase/migrations/20261013000200_core_ordinary_order.sql
```

Documentation follow-up adds exactly:

```text
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/trip/contracts/CORE_ORDINARY_ORDER_TTR_INPUT_V1.md
docs/trip/implementation/CP_TTR_04A3_CORE_ORDER_02_IMPLEMENTATION_REPORT.md
```

Allocation correction additionally carries the accepted unmodified dependency:
`src/data/db/migrations/capturePdfSourceHandoff.ts`.
Final combined scope: **36 files**. No historical migration modification.
