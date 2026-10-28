# P3 Daily Base correction / DayHeader source gap — 27 October

## Cause and correction

The reported 27–30 October pattern is reproduced with the actual pure Core writer
and `projectCoreDay`: 28 October without another activity emits `TONIGHT` once;
29 October with P1 emits **two roles of the same Stay**, `BASE_FROM` and
`BASE_RETURN`; 30 October emits `CHECKOUT` once. LocalManualDayFeed and the Core
Stay renderer previously converted both legacy Base roles into identical Daily
base rows. The final P3 package expressly calls out this W0 compatibility delta:
P3-02 and §4 require a single end-of-day Daily Base through G2 presentation
adaptation while retaining the Core projection.

`stayBasePresentationRows` now selects one original Base occurrence by Item UUID
and civil date, preferring the existing tail `BASE_RETURN`. The same adapter is
used by local display ordering and the accepted Core Stay renderer. It preserves
the original owning key/row, leaves distinct Items even with equal titles alone,
and preserves check-in/out, day-use and P2/P4 endpoints. Focus falls back to the
remaining occurrence when the old Base alias changes. No stored item is deleted,
no Core authority changed, and no calendar or pagination workaround introduced.

Accepted/local duplicate overlay is already prevented by `DayFeed.queryForDate`
filtering local pending Item IDs out of accepted rows. That is unchanged. The
three supplied screenshots match the deterministic legacy-role issue; they do
not expose actual Item IDs. No physical database or device was read, so the exact
user record identities are **not independently attested** by this repair.

## Apple/location gap, checked again at current Native source

Existing `corePlaceSchema` **already has** accepted locality, region, country,
Place ID, coordinates, location-input revision and spatial provenance fields.
This is not a missing-SQL-table problem. Current Native paths lose or omit them:

| Existing seam                                                     | Current fact                                                                                                                                                                                                                                         | Minimum owning change                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/place-search/ios/ApplePlaceSearchEngine.swift:candidate` | General POI results flatten raw placemark locality into address; they return address/point/providerPlaceId, not structured locality. The opt-in `destinationArea.area` is transient Create Trip display eligibility, explicitly not Canonical proof. | Native Place writer retains structured provider facts with the existing selection/session fences; never parses the display address.                                                                                                           |
| `P3StayLocationField:onSelectHotel` → `manualStayFieldsSchema`    | Only hotel title and address string survive; `location` is a string. Save builds a null Core Place and sets `authored_label` only.                                                                                                                   | Manual Form/Place owner preserves the confirmed selected metadata and uses existing CREATE_ITEM/SET_ITEM_PLACE only under the established Place qualification/provenance rules. Do not mark a transient Apple suggestion accepted by UI fiat. |
| `CorePlaceView/corePlaceView` → `projectCoreItem`                 | Coordinates/POI ID/display strings are projected; accepted structured geography and explicit visibility are omitted. WHOLE_GROUP participation is not GROUP visibility.                                                                              | Core Reader unique writer exposes existing qualified geographic identity/label and explicit shared-safe eligibility; retain Account/revision fences and real Stay/ordered transport relations.                                                |

Formal Header therefore remains the exact unresolved fallback, with no address,
airport-code, hotel-name or Trip-level destination guess. Once the owning inputs
are supplied, the Native pure selector can implement the frozen Stay/route/
activity precedence without introducing a schema or independent authority.

## Validation

Directed suites cover real W0 projection reproduction, both local and accepted
renderer adaptation, stable identity across same-name/different Items and dates,
exact-role duplicates, day-use, Focus alias transition and original open action.
The run also includes local display/read, Composer, WindowedDayList, TripScreen
and existing Core Views regression: **8 suites / 159 assertions PASS**. Typecheck,
UI guard, scoped lint/format and whitespace checks pass.

**Device/Vision NOT_RUN:** Owner is using the phone; no Metro, installation,
Mirror, AD5, Backend or data mutation was performed. Parent schedules the next
normal build; verify 29 October now has one Daily Base at the end and both same-day
check-in/out remain independently usable.
