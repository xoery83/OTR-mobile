# P3 Create/Edit parity with P1 and Trip — 25 October 2026

Owner requested P1 caption/input geometry, name-driven Apple suggestions below location, full-screen manual location matching, Trip-style calendar dates, quieter optional clocks and P1 Participants.

## Change

Only P3 editor/presentation, direct tests and one bilingual caption key changed. Existing P1/Trip source was read as reference. P3 now uses the exact P1 form/field spacing and caption role (`visual.type.action`,14pt/600), `UiTextInput`, `PlanParticipantsField`, and `TripCalendarRangeField`. Address immediately follows accommodation name; dates follow address. Optional clocks are secondary paired rows, opened in the existing native spinner/page-sheet pattern. No P1, Trip, global Shell, Auth, Core, repository, queue or backend code changes.

`P3StayLocationField` composes existing `PlaceSearchSession`, Apple provider and `PlaceSearchSheet`. Name typing starts debounced candidates below the location input. Only explicit selection fills address, preserving accommodation name. Location focus opens the existing full-screen immediate selection/manual-address flow. Search cancellation preserves prior fields; account generation, committed field snapshot, query lease, unmount and save/freeze checks reject late results. No parallel search engine or place authority; like P1, the existing Stay field stores selected address text, without claiming canonical geocoded coordinates.

## Actual Forms QA acceptance

Dedicated Forms QA / own8096 / normal Synthetic account and Trip retained. New process39158 consumed the UI; no AD5 action or new simulator. Native Light-mode checks:

- Name `Park Hyatt Auckland` returned real Apple SDK matches below location; selected hotel resolved to99HalseySt and dismissed keyboard, name unchanged. [Name results](evidence/apple-name-results.png).
- Location focus opened full-screen existing search; entered123QueenStreetAuckland returned real matches. Cancel restored original99HalseySt without changing name. [Full-screen address](evidence/full-screen-address.png).
- Trip calendar selected1–4November2026; Done committed required dates. [Range calendar](evidence/calendar-range.png). [Create layout](evidence/create-layout.png).
- P1 Participants sheet/search/checkbox displayed own Person; deselecting all disabled Done(0); selecting own Person and Done(1) returned1selected. [Participants](evidence/participants.png).
- Actual Create saved, Day/Details read date range and Apple address. Edit reused same Item, full-screen manual address confirmation changed only address to99HalseyStreet,Auckland,NewZealand; optional time sheet Cancel preserved unknown clock; Save and independent Details reopen retained edited address/dates. [Edited Details](evidence/edited-details.png).
- Existing Item Edit reopened with retained fields. Forms QA left on the clean Edit page for Owner validation; old DateTimePicker deprecation debug toast dismissed. [Owner-ready Edit](evidence/owner-edit-ready.png).

[Read-only own SQLite](LOCAL_READBACK.json) proves one new CREATE_ITEM and one SET_ITEM_PLACE on the same new Item; all5 queue rows for this isolated account remain attempt_count0. Local pending data only, not Server Accepted. [Hashes](EVIDENCE_SHA256.json).

## Checks and limits

63/63 directed tests across P3 editor/location, real SQLite Stay repository, shared calendar, Participants, search session and sheet PASS. Typecheck, scoped ESLint and UIguard140strictroots PASS. Independent change review and final lifecycle increment review PASS, no blocking finding; reviewer separately ran57tests before final increment. No new dependencies/migration/shared authority or Cloud access.

This increment validates actual Apple/name/full-screen flow and local Create/Edit. New Dark/Chinese/large-text/physical-offline matrix and a fresh native build were not rerun; prior P3 evidence remains separately scoped. Owner visual acceptance pending. P3 Cloud remains CLOSED/PENDING and existing Contact/Instructions owning-interface gaps remain unchanged.
