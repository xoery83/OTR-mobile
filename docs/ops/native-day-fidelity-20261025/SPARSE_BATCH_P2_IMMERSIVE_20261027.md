# Sparse Day window and P2 native detail repair — 27 October 2026

## Day window scope

Existing Day rows contain the lawful Trip calendar from the current data origin onward; this is local presentation virtualization, not one backend query per day. FlatList initial/batch render size is 8 rows and windowSize is 5 viewports. The missing range was the previous-date prefix: within 200pt of the native top, each deliberate drag previously prepended just one preceding date. Sparse dates contain only the heading/empty state row, so a drag often exposed less than a screen.

Previous-prefix selection now takes at least 8 existing rows, aligned to lawful date boundaries. Sparse cases prepend 8 dates; a dense previous day may supply the whole batch. Clamp to Trip start, preserve all row identities and the same native list, and retain the existing one-batch-per-drag compensation guard. No day membership/time/order change.

Native onScrollToTop also prepends one batch without requiring a drag. After the new origin commits its content size, scroll to its top so the newly loaded prefix is visible; ordinary drag/follow still preserves the visible row. Hidden Home/Day scrollsToTop ownership is exclusive. Late native completions and pending reposition are ignored/cleared when the Day becomes inactive or scope changes; a new deliberate drag cancels pending status-bar reposition.

## P2 comparison and read path

Compared Owner physical screenshot with frozen P2 V1 `screenshots/current/full-future-immersive.png` and P2_DESIGN_SPEC decisions35–43. The real Manual native route used an early layout: route plus flight-number heading, bare leg grid and actions. It missed final Flight journey title/count, the shared17pt flight surface and Participants/common footer. Empty association cards remain hidden per Owner's later instruction, superseding screenshot fixtures with zero counts.

P2Detail now reuses the existing FlightJourneyView via an explicit single-leg presentation input. No Journey ID/membership, connections, service, Seat, Booking or document is invented. Confirmed Journey rendering keeps its existing owning legs/services/connection checks. Real participation is validated and passed to the shared footer; description is shown only if present. Expense Trip/date/name and disabled unsupported actions remain unchanged.

For a P2 already present in the same current account/Trip/fingerprint read, the source screen now passes only the real Item ID to the existing detail route, avoiding its redundant resolveLocalItem/freshLocalRead before navigation. The destination still validates through owning readForForm. It publishes readable content before waiting on createDraft Edit qualification; Edit stays disabled until that owning permission succeeds. Focus refresh retains valid same-identity content while rereading, and clears it on denial; focus/account fences remain. No Core/Repository/Backend contract changes.

## Checks and resource boundary

Final directed set:6 suites149 tests PASS (P2Detail, FlightFidelityGrid, TripScreen.homeWidgets, dayFeedWindow, WindowedDayList, frozen flightFidelityFixture). TS/UIguard/scopedlint/diff PASS. Independent reviews closed stale hidden status-bar events; P2 review found no blocker and independently ran92 checks. No sum of overlapping test totals.

R27 exact-source dedicated C0 simulator build/install PASS; generic iOS Forms QA R27 exact-source build PASS after physical paired destination became unavailable. Physical Mirror reports iPhone in Use; update authorization/release requested, no install over the owner's phone. DeviceHub was returned to Universal for AD5 input registration before Native regression began, then re-leased for C0 after its explicit return. Native observations are recorded below; physical iPhone timing remains pending. No AD5/8097/main/Backend operation by this lane.

## R27 Native observations

Dedicated C0 / English / Light, normal local account and existing synthetic Trip:

- Calendar jump to empty final7Nov shows the short tail window. One deliberate upward pull prepended existing2–6Nov in a single batch, retained the same visible7Nov position, and made the older dates available for continued scroll.
- Native system status-bar activation (DeviceHub coordinate double tap at the clock) scrolled upward, loaded the next prefix and showed28Oct at the new top. Screenshot `native-status-bar-prefetch.png`; no JS/manual invocation of the callback used as Native evidence.
- Normal Create→Save added one local synthetic QA flight `QA2701`, AKL→NSN,21Oct2026 12:00→13:00, both airport-derived Pacific/Auckland. Existing QA data retained. This is local authored data, no physical/commercial qualification or Cloud E2E claim.
- Real Day Browse→Focus→native Immersive showed Flight journey/count, unified flight surface, both date/zone facts, Everyone and the four capability-gated actions. Native Back returned to the same expanded Focus and scroll position.
- The first click+AX observation returned complete content in2663ms, including automation and AX overhead; a repeat returned a transition frame at1933ms. These are not app-frame TTI or physical iPhone benchmarks, and do not establish a latency SLA.
- Independent Vision compared `p2-real-immersive-final-layout.png` with frozen `full-future-immersive.png`; prior title/container/common-module findings closed for this real single leg. Missing services/seat/documents/relations are not invented; empty cards follow Owner's later hide-empty rule. Confirmed multi-leg Journey and physical performance were not newly accepted.

Evidence: `/Users/xoery/.codex/visualizations/2026/10/25/01a17101-8b2d-7240-ab67-f4c34a5d90d9/native-r27-20261027/`.
GUI returned to Universal, CaptureKeyboard off, no open Draft. Physical build is prepared separately; Owner's iPhone remains unavailable/in use, no overwrite installation performed this turn.
