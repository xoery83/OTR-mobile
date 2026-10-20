# CP-FLIGHT-NATIVE-01 → Experience/G2 Lab handoff

Experience/G2 is the sole shared Native Day Feed Lab owner. This handoff adds no
Lab shell, fixture gallery, Trip/Date switcher, Composer, navigation or DEV DATA
activation. Focus/NOW/scroll/TTR ownership and production behavior are unchanged.

## Minimal fixture requirements

1. **Native PDF preparation / REVIEW:** use the checked-in synthetic PDF base64
   and PDFKit extraction packet at
   `src/data/interpretation/__fixtures__/nativeFlightPdf.json`. Actual C2 intake
   retains its original SHA-256 `f193cd842ed36779c9087d9c6c0a1bd7c3859dbafbf1807227d29afdeaacc12c`.
   Source contains two independently evidenced dates, `2026-12-17` and `2026-12-20`.
   Current owning SQL produces two REVIEW/CONTRACT_UNSUPPORTED Candidates and
   **zero accepted Items**. Expected accepted UUID/revision/date roster is `[]`.
   Do not inject the proposed Item IDs or Candidate facts into accepted Day data.
2. **Accepted Flight rendering regression:** reuse the existing joined ORIGINAL
   TEXT fixture (`python3 scripts/trip/core-v2-sql-acceptance.py --flight`), not a
   parallel Flight shell. It runs sole Core publication/preparation/commands,
   exact receipts/finalization and authenticated read2, then accepted SQLite/Day.
   The latest recorded exact fixture expectations are below. These are disposable
   synthetic SQL identities, not objects in Hosted DEV or real travel data.

Account: `00000000-0000-4000-8000-000000000001`.
Trip: `10000000-0000-4000-8000-000000000001`.

| Accepted Item UUID                     | Semantic revision | ORIGIN local date |
| -------------------------------------- | ----------------- | ----------------- |
| `6ea64af7-5a10-485f-9a61-8e18299d4332` | 2                 | `2026-12-17`      |
| `d0748b5d-d906-42d1-be9e-0c1c8b4f15d8` | 2                 | `2026-12-20`      |

These UUIDs are stable within the recorded fixture run/replay. A fresh runner
allocates a new Source/Run/Item roster and prints `itemDateExpectations`; G2 must
use that exact run's mapping with its matching certificate, not reuse IDs with
another run's certificate or manufacture acceptance from this table.

## Existing read/projection seam

- Use `createCoreV2Transport.collection(context)` → existing
  `tripCoreV2Repository.beginRefresh/install` (or `refresh`). Complete actor-scoped
  manifest/pages and matching current Person roster are required; UUIDs alone are
  insufficient. Accepted tables are owned by SQLite54; local preparation adds55.
- Reuse `createCoreFlightDayFeedReader(repository)` and production
  `readTripDayFeed` / `composeDayStream`. The v2 `CoreFlightDayProjection` includes
  certificate epoch/revision/access/generation and Person/roster hashes,
  accepted `events`/`items`, `flightFacts` and the existing `query(date,zone)` seam.
  G2 owns selection, injection and native presentation; Native Capture owns no
  alternate query/composition or navigation framework.
- Retain the exact accepted Item UUID/revision/occurrence dates. Missing terminals,
  canonical places and clocks remain null/unknown. Display airport labels/codes
  never grant accepted Place identity. Private Source locators must remain redacted
  from actor read2 and shared Lab presentation. Date selection is a query concern;
  it cannot manufacture temporal facts or change Focus/NOW behavior.

There is **no missing Core read DTO or Day reader seam** identified in this scope.
The missing native import seam precedes read2: owning PDF original admission and
Core derivative qualification are unsupported. The local preparation function is
explicit/dormant; neither a Capture UI action nor Lab invocation is activated.
G2 can consume the existing accepted text fixture under its own authorized fixture
injection workflow. This handoff does not authorize any Lab/app/DEV write.

## Separate acceptance categories

| Category        | Result                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture         | PASS: synthetic owning SQL REVIEW/recovery; separate accepted text SQL/read2/SQLite/production static Day rendering; full passing-domain regressions. |
| Simulator       | PASS only for standalone PDFKit extraction on designated iOS27 Harness; shared native Day Lab/installed Expo bridge not tested.                       |
| Physical Device | NOT RUN.                                                                                                                                              |
| Core DEV Read   | NOT RUN; no Hosted endpoint, principal or DEV DATA activation.                                                                                        |

Exact run certificate metadata and paired expectations are retained in
`CP_FLIGHT_NATIVE_01_EVIDENCE.json`. Implementation blockers/Owner decisions are
in `CP_FLIGHT_NATIVE_01_REPORT.md`. STOP at CP-FLIGHT-NATIVE-01 Owner Review.
