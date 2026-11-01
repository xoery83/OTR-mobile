# Local Form suggestion adapters

All adapters are opt-in, synthetic-only DEV previews. Ordinary product Forms have no Scan port enabled. The shared review control has no Repository, Queue, Parser, Provider or Core write. It binds a suggestion request to the current Form instance, Account generation, Trip, Item, mode and monotonically increasing UI revision. Async Cancel aborts the consumer request; stale/late results cannot become draft changes. Each explicit Apply targets one candidate/current draft. Save remains the original Form action and retains the original repository draft identity.

| Type | Prepared local fields | Preserved/excluded semantics | Golden evidence |
|---|---|---|---|
| P2 | Number/date, airport directory selection, local clocks/arrival date | Airport code/name/zone adopted together from existing directory; no flight proof, instant, Segment/Journey/Booking/Ticket identity created | Native Form Create + Edit review → existing Save tests; directory/proof-negative adapter tests |
| P3 | Property/title, raw address, check-in/out dates/clocks, Notes | Text address has no accepted Place proof; unchanged address retains existing pending Apple selection; Contact/Instructions/Person not inferred | Actual existing Form Create review → Save; Edit target check; Cancel, mutation-away-and-back and async Account/Trip/Draft invalidation |
| P4 | Name, independent Pickup/Return places/dates/clocks, Notes | Kept Return never overwritten by same-place checkbox; rental supplier/vehicle details untouched | Create and Edit Apply → original Save; pickup-only/kept-return test |
| P5 | Name, six existing legal subtypes, departure/arrival places/dates/clocks, Notes | Unsupported Taxi/Custom rejected; operator/service/check-in are not projected into Notes | Create and Edit Apply → original Save; unsupported field/type negatives |
| P6 | Activity name, Venue text, Schedule, Notes | Admission details retained; no inferred Ticket/Admission identity | Create and Edit Apply → original Save; admission retention/unsupported Ticket tests |

DEV preview: `/day-feed-lab?fidelity=p2-scan|p3-scan|p4-scan|p5-scan|p6-scan&tripId=<authorizedTrip>[&item=<ownedItem>]`. Routes validate UUIDs, require DEV and use normal repositories. Synthetic P2 preview suppresses real Flight Enrichment so reviewing a fixture cannot initiate a paid query. Fixed values reside only in explicit fixture JSON files. Normal Core Save may still reject incomplete/illegal business data; preview is never an authority bypass.

These are deterministic React-headless/TypeScript/SQLite-contract consumer checks, not screenshots/device/Hosted OCR or Provider E2E. Full multi-object batch save is not implemented: selecting one candidate cannot silently save other suggestions. Formal Import interpretation/candidate custody and optional owning fields remain in the central gap register. New batch independent review pending.
