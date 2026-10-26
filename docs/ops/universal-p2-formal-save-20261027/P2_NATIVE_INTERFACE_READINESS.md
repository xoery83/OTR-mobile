# Native owning interface coordination

Native Feature thread01a17101-8b2d-7240-ab67-f4c34a5d90d9 reported read-only findings after P3 main c7d129c7 integration:

- Existing owning Reader `tripCoreV2DayFeed.ts` projection.items/events and flightFacts[itemId] expressSPARSE/QUALIFIED/BOOKING_EVIDENCED_ROUTE_TIME. Same ItemID with newer revision can refresh; no secondMutation/Reader required.
- Main c7d129c7 presentation excludesSPARSE (falls toP1Row); QUALIFIED has existing FlightRows/DayFeedImmersive. Date-onlyP2 Home fallback still excludesP2. Do not claim these Native gaps already fixed.
- Native separate candidatef7a979c3 has SPARSE/QUALIFIED FlightFidelityGrid; not itself HostedCloud acceptance. Do not cherry-pick whole P2/P4 chain. Native owns any minimal display repair.
- IndependentP2Details remains Manual-oriented. Source/Qualified acceptance does not grant edit authority. Prefer existing accepted DayFeed→Immersive path for first formal qualification.
- No Journey/PNR/Booking/Ticket inference. Universal owns Source/Evidence/Admission/Backend; Native owns DTO→display. Actual P2 candidate and Source command/proof must be fixed before a business Save Gate.
