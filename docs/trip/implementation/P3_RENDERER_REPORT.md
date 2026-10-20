# P3 Stay renderer candidate — 2026-10-13

This packet implements the approved P3 nine-state presentation on the existing Day Feed/G2 renderer seam. It does not activate the renderer in `TripScreen` or claim an authenticated production journey. `StayRow` accepts optional, authorized facts and owning callbacks; `createCoreStayRenderer` supplies only accepted Core Stay dates, name, permitted checkout time and known area. No new data authority, original-file opener, gallery, Ledger calculation, map view, or mutation is created here.

## Exact ownership

- Additive shared context pass-through: `src/features/day-feed/rendererContribution.ts`, `src/features/day-feed/DayFeed.tsx`.
- P3 row and accepted Core adapter: `src/features/day-feed/StayRow.tsx`, `src/features/day-feed/coreStayRenderer.tsx`.
- Existing lab P3 binding and typed facts: `src/features/day-feed-lab/StayFixtureRow.tsx`, `src/features/day-feed-lab/stayContribution.ts`.
- Focused regression: `src/features/day-feed/render.test.ts`.
- P3-only English/Simplified Chinese keys: `src/ui/catalogs.ts`.
- This report.

`TripScreen`, navigation, registries, schemas, repositories and other feature families are outside this packet. This contribution requires an independent functional review and Native Visual receipt before any UI integration. The existing G2 held gesture gate remains separate.

## Approved scenario trace

“Functional” describes this isolated renderer and existing trusted Core/G2 contracts. “Visual” is a separate, independent on-device gate; no lab render or test is visual proof.

| #   | Scenario                                                                    | Functional                                                                                                                       | Visual                     |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | Three-night Check-in, two middle-day Bases, Check-out; one Stay identity    | PASS for shared Core roles/identity and P3 role rendering; end-of-day order comes from existing Core composition                 | PENDING independent Native |
| 2   | Hotel A Check-out and Hotel B Check-in; single-night dual role              | PASS for selected row identity/dual-role copy; two-hotel Core ordering remains existing contract                                 | PENDING independent Native |
| 3   | Unknown clock time shows only known date/role                               | PASS; no invented time in P3 row                                                                                                 | PENDING independent Native |
| 4   | Future full dates and original Booking direct/chooser                       | PASS for date display and supplied authorized opener callbacks; actual Documents opener/association unavailable                  | PENDING independent Native |
| 5   | `Confirmed` only with source evidence                                       | PASS for explicit `confirmedBySource`; Core adapter does not infer it                                                            | PENDING independent Native |
| 6   | Precise map versus name + known-area search                                 | PASS for distinct Apple Maps URLs and Directions only from accepted exact location; external handoff needs on-device observation | PENDING independent Native |
| 7   | Today original instructions, internal-first/external fallback, absent-state | PASS for conditional direct/chooser intent; actual viewer/fallback belongs to Documents and is unavailable here                  | PENDING independent Native |
| 8   | Sourced registered guests, not Trip Members; room association               | PASS for conditional supplied names only; owning guest/room association unavailable                                              | PENDING independent Native |
| 9   | Past conditional photo/expense counts, no attendance                        | PASS for supplied authorized counts; owning Photos/Ledger linkage unavailable                                                    | PENDING independent Native |
| 10  | Past top three photos and View all, no empty gallery                        | PASS for supplied previews/actions; actual gallery unavailable                                                                   | PENDING independent Native |
| 11  | Ledger Total/My Share per-night and original-currency placement             | BLOCKED by absent accepted owning Ledger amounts/FX/share/visibility contract; entire amount group hidden, no fabricated zero    | PENDING independent Native |
| 12  | Conditional Add actions and owning cancellation/removal lifecycle           | PASS for only supplied callbacks; actual owning actions/lifecycle unavailable                                                    | PENDING independent Native |
| 13  | Offline local originals and honest remote unavailability, no AI             | PASS for no P3 AI call and hidden absent opener; offline original availability needs Documents capability/runtime proof          | PENDING independent Native |
| 14  | Shared Focus/NOW/date/scroll and P1/P2/TTR regression                       | PASS focused existing G2 renderer/regression tests; held gesture-specific Native gate remains pending                            | PENDING independent Native |

The approved Beta 0/Beta 1 cut remains governed by the [P3 design delta](../OTR_P3_PRODUCT_DESIGN_DELTA_2026-10-13.md). This candidate is review-ready renderer code, not Beta-ready P3. Source integration must preserve the separate `tripCreate` catalog namespace and gate P3 UI activation on the independent Visual result. Authenticated runtime, original document opening, Photos, Ledger, authorized guest data and management need their owning capabilities; none is represented by fixture data as an actual trip.
