# EXPERIENCE-REVIEW-02 — finite preflight / ownership

2026-10-18. Owner-approved bounded correction, source package SHA256 `624f05b8684135d0c843b9427133ac46d2795b71cab03bc3cdcacf0fe879c2be`.
Original three Markdown files are preserved under `docs/beta/experience-review02-20261018/`.
Product Delta governs behavior; Blueprint governs layout. No P1–P6, Reader/Composer, TIME-01/NOW/TTR/NTC, Admission or schema redesign.

## Base and resources

- Latest main inspected: e81eeb9. Actual latest Owner preview integration: f87e119. New isolated correction base uses f87e119 to preserve Day/Create fixes absent from main.
- Parent integration tree: `/private/tmp/otr-experience-review02-20261018`, branch `codex/experience-review02-20261018`.
- AD5, A1A, both existing Metros and Hosted resources are untouched. Native acceptance remains pending an independently coordinated resource.
- Test fixtures may establish regression behavior, never Native acceptance.

## Writers

| Track | Writer | Exclusive files | Shared changes |
|---|---|---|---|
| A Day | day_shell_a | DayFeedShell, WindowedDayList, DayFeedCalendarSheet, window/anchor helpers + tests; TripScreen Day branches only | Coordinator serially integrates TripScreen/navigation changes |
| B Home | trip_home_b | Today/Preparation widgets and hooks, TripHomeWidgetHost, TripHomeFrame, Finance + direct tests | Root caller, menus, catalogs delivered as patches |
| C Edit | queued after Builder slot releases | TripBasicEditor, TripCalendarRangeField, TripMetadataFields + tests | LocalTripWorkspace editor branch/callback owned by Coordinator integration |
| Integration | Experience coordinator | LocalTripWorkspace, GlobalMenu/navigation shared root, locale catalogs, registers | No concurrent Agent writes |

## Initial issue matrix

These are code facts/targeted hypotheses, not completed root-cause claims where marked pending.

| ID | Current code / gap | Minimum correction / evidence required | Owner |
|---|---|---|---|
| TH-01 | TripBasicEditor resolves save by setting before=after (dirty=false); LocalTripWorkspace callback updates repo then load but never closes sheet | Close only after local transaction succeeds; no wait for Hosted; retain failed draft; header Save; integration test | C |
| TH-02 | Today stay eligibility and accepted local pending projection require bounded tracing | Checkout-exclusive active stay, checkout event preserved, pending local read; exact hotel regression | B |
| TH-03 | Projection loading/reset and widget key/mount behavior pending trace | Retain valid same-scope projection on refresh; invalidate Account/Trip/permission/version; stale-read tests | B |
| TH-04 | TodaysJourneyWidget empty/unavailable/timezone copy pending review | Human-readable honest empty vs unavailable; lawful Day action; no NOW invention | B |
| TH-05 | Preparation widget/reader already wired | Unmet-only real actions/counts/recent items; preserve unsupported entries as gaps | B |
| TH-06 | TripSetupRows already exposes namedCount, TripMembersSheet | Verify actual status availability; no false unavailable or fabricated connected state | B/C |
| TH-07 | GlobalMenu only Ledger contextual destinations; no Trip-specific Members/Documents section | Reuse lawful routes/callbacks; identify unavailable destinations | Integration |
| TH-08 | TripCurrencyRow uses setup currency + OWNER + NOT_OBSERVED lock + onOpen | Verify owning repository inputs and existing settings route; no second currency model | C |
| TH-09 | tripCovers.ts only four bundled assets; TripCoverPicker has no own-photo persistence contract | Preserve Cover Gallery/Tag Matching backlog; assess actual lawful library/photo path before implementation | C |
| TH-10 | Finance widget already wired, detail duplication pending presentation audit | Remove noise only; preserve Group/My amounts/category/authority | B |
| TH-11 | TripHomeFrame renders supplied metadata order; caller currently destination before dates | Name/date/destination; offscreen title behavior wired through root and tested | B/Integration |
| TH-12 | Native overlay action tint/glyph requires targeted inspection | Existing AppIcon/native toolbar; no alternate chrome | Integration |
| TH-13 | Debug presentation points pending exact Settings toggle audit | Gate internal details, retain user sync/failure/confirmation | B/Integration |
| ET-01 | Bottom Save, external SheetHeader only Close; same TH-01 cause | One canonical SheetHeader Cancel/Edit Trip/Save, no duplicate Save; async failure/closing tests | C |
| ET-02 | TripCalendarRangeField shows one month and Previous/Next links | Continuous month list across years, draft Done/Cancel/Clear; date-only preserved | C |
| ET-03 | Existing Trip Metadata destination is nullable string; free-text input | Preserve manual values; reuse existing chips/choice contract if available; no inference/schema change | C |
| ET-04 | Editor localFirst/debug copy currently always rendered | Hide developer diagnostics; retain honest permission/local save state | C |
| DS-01 | TripScreen today fallback path may show legacy page while resolving | Trace loading branches; stable Day loading shell; no root regression | A |
| DS-02 | Existing DayFeedShell/TripScreen introduction and overlay | Fix header visibility/state using measured introduction boundary | A |
| DS-03 | Existing formatDayFeedVisibleDates | Compact localized single-line ranges + legible glass; cross-month/year tests | A |
| DS-04 | Existing TripViewContext/WindowedDayList resume | Semantic Trip+Day bookmark; bounded native return QA | A |
| DS-05 | Existing direct far-date index algorithm preserved | Day1 header and empty/unmounted/out-of-range date anchor tests | A |
| DS-06 | WindowedDayList dynamic height/window logic | Measure actual anchor/compensation root cause; bounded mount/rapid scroll | A |
| DS-07 | Existing DayFeedCalendarSheet data-qualified cells | Continuous month sheet, truthful location transitions/dots | A |
| DS-08 | Existing reading-motion controller recently fixed | Actual gesture vs compensation + reverse restore; safe area/Capture persistent | A |
| DS-09 | My Trips root/Trip Home back established | Scoped route regression; no navigation redesign | A/Integration |

## Acceptance boundary

All rows IN_PROGRESS until exact fixes, tests and review are received. WIRED is not RENDERED; RENDERED is not NATIVE VERIFIED. No Native evidence produced by this package yet; UX Accepted is Owner-only.
