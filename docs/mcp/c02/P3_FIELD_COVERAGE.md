Current S3 addition (3 November): structured manual Place mapping contract covers
nine authored leaves using full lawful Base; local Core/tests/Review PASS only.
Public handler remains unavailable for this structured candidate. Accepted/provider
fields remain blocked. See s3/STRUCTURED_PLACE_CONTRACT.md and STRUCTURED_PLACE_REVIEW.json.

# MCP-C02 — P3 field coverage baseline

Date: 2026-11-03. Scope: local source audit for a **new synthetic P3 Create/Edit**
slice. This is not Consumer/Hosted acceptance. Previous Claude/ChatGPT Notes
receipts qualify Notes only; completed Item `3616da44…` and Operation `2777810c…`
must not be reused. No Hosted configuration, authority or data changed for this audit.

## Evidence and classification

Canonical P3 storage: `src/domain/trip/tripCoreV2.ts:272` (property/windows),
`:280` (rooms), `tripCoreV2Commands.ts:95` (Create), `:228` (detail replacement).
The Native editor currently presents name, location, date range, planned clocks,
Notes and participation (`src/features/day-feed/P3StayEditor.tsx:416–537`). Its
repository also carries property/windows and preserves existing rooms
(`src/data/repositories/manualPlanRepository.ts:76`, `:728`, `:870`). Room editing
is therefore canonical capability, not an existing P3 editor control.

The eventual per-source fact ledger must use the Owner's exact classifications:

- `SUPPORTED_AND_SAVED`: only after APPLIED **and independent persisted readback**.
- `SUGGESTED_PENDING_CONFIRMATION`: a supported proposal awaiting exact confirmation,
  or an unaccepted amendment; it is not saved.
- `UNSUPPORTED_PRESERVED`: readable evidence retained in the source/preview handoff,
  with the unavailable owning capability and locator; not silently discarded or
  stuffed into an unrelated P3 field.
- `NOT_PRESENT_IN_SOURCE`: no evidence; omission is not a Clear instruction.

Before source extraction or a real receipt, this matrix describes **adapter
capability**, not `SUPPORTED_AND_SAVED`. Each extracted fact needs source identity,
locator, proposed path, before/after, uncertainty and the above classification.

## P3 matrix

| Fact                                            | Approved destination / local MCP path                                                       | Create baseline                                                              | Edit baseline / preservation limit                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Item title                                      | `itinerary_events.title`; `item.title`                                                      | Supported, max200                                                            | `update_trip_item` TEXT `title`; omit unchanged source-backed title                               |
| Notes                                           | `itinerary_events.description`; `item.notes`                                                | Supported, nullable/max5000                                                  | TEXT `notes`; complete replacement, not append primitive; retain unrequested text                 |
| Check-in / check-out dates                      | root local dates; `item.dates.start_date/end_date`                                          | Supported; P3 end date required                                              | DATES/SCHEDULE; existing source/qualified temporal facts guarded                                  |
| Planned arrival/departure clocks                | root local clocks; `dates.start_time/end_time`                                              | Supported as authored civil HH:MM                                            | SCHEDULE; do not replace permitted windows or infer UTC instants                                  |
| Explicit timezone                               | root `start/end_zone_id`; `dates.start_zone/end_zone`                                       | IANA zone supported with clock                                               | SCHEDULE subject to preservation; no inferred exact instant/qualification                         |
| Hotel/property name                             | `trip_stay_details.property_name`; `item.property_name`                                     | Supported; aligned to Core max500 locally                                    | `update_trip_item_fields` STAY `details.property_name`, **only when rooms empty**                 |
| Hotel authored place label                      | canonical Item place; `item.place`                                                          | Supported; aligned to Core max500 locally                                    | S3 local simple-MANUAL TEXT_ONLY replacement supported; source/qualified/structured facts blocked |
| Hotel authored address                          | canonical Item place; `item.place_address`                                                  | Supported when place label supplied                                          | S3 omitted address retains; explicit null clears; qualified/source/structured facts blocked       |
| Qualified place, coordinates, provider identity | canonical place tuple / place qualification                                                 | Not exposed by current manual MCP create                                     | No arbitrary geocode/qualification claims; preserve existing tuple                                |
| Permitted check-in from                         | `trip_stay_details.permitted_checkin_from`; `item.stay.permitted_checkin_from`              | Supported                                                                    | STAY `details.permitted_checkin_from`; room-bearing Item blocked                                  |
| Permitted check-in until                        | analogous `_until`                                                                          | Supported                                                                    | Same STAY constraint; optional omission does not clear                                            |
| Permitted checkout by                           | analogous `permitted_checkout_by`                                                           | Supported                                                                    | Same STAY constraint; distinct from planned departure                                             |
| Room category                                   | `trip_stay_rooms.<room_id>.category`                                                        | Locally implemented: `item.rooms[]` via existing Core Create; Hosted NOT_RUN | **MCP gap**: no room-change input; detail edit with any existing rooms blocked                    |
| Room quantity                                   | room `quantity`, positive integer or null                                                   | Same gap                                                                     | Same gap; never use guest count as room quantity                                                  |
| Room capacity                                   | room `capacity`, positive integer or null                                                   | Same gap                                                                     | Same gap; capacity is not confirmed occupants                                                     |
| Stable room identity                            | room `room_id` UUID                                                                         | Client allocates stable unique UUIDs before Preview; adapter preserves them  | Retain identities; never reconstruct by array index or generate fresh IDs on replay               |
| Trip participation                              | root participation + Item participant relations                                             | `create_trip_item_fields.participation` available locally                    | `update_trip_item_fields` PARTICIPATION; existing visible Person UUIDs only, no access grant      |
| Named booking guests                            | owning Booking/guest association                                                            | Not a P3 room/participation substitute                                       | Resolve people separately; unsupported association preserved, no automatic AKA/Account link       |
| Booking reference/provider/status               | owning Booking, surfaced via `bookingSummaries`                                             | Not writable through P3 create                                               | No Booking mutation enabled by this slice; a P3 receipt proves no commercial Booking              |
| Booking price/deposit/balance/payment           | owning Booking/Ledger                                                                       | Not a P3 field                                                               | Preserve financial evidence separately; no duplicate Expense or fake paid status                  |
| Original attachment/source identity             | owning Document/Source admission                                                            | No source admission via P3 create                                            | Client citation is not durable Source/Document link; report unavailable explicitly                |
| Arrival directions / access instructions        | ordinary non-sensitive Item Notes **or** owning Instruction aggregate, according to meaning | Notes text supported; structured/private Instruction not exposed             | Do not claim Instruction save from Notes save; do not put secrets in shared plain Notes           |
| Nights                                          | derived from check-in/out local dates                                                       | Read-only derived `details.nights`                                           | Never author independently; verify after date edit                                                |
| Revision, status, visibility, capability flags  | server control state                                                                        | Server assigned / existing private defaults                                  | Not attachment facts or arbitrary mutable fields; Consumer authorization remains separate         |

Source support: `mcp/mutationContract.ts:48–144`, `mcp/mutation.ts:99–223`,
`mcp/fieldAdapter.ts:32–70`, `:161–226`, `mcp/contract.ts:229–246`,
`mcp/guide.ts:161–165`, `:199–222`. Existing local support is **not** current
Hosted enablement: `mcp/server.ts:154–169`, `:518–545`, `:612` and
`mcp/guide.ts:360–375` restrict the consumed `SLICE1_NOTES_EDIT` profile to Notes.
A new P3 slice must activate a separately reviewed minimal scope, not silently
remove that profile's safety restrictions or enable every assistant tool.

## Exact minimal adapter gaps

1. **P3 rooms on fresh Create: MCP gap fixed locally, not a missing Core Create API.**
   Core `CREATE_ITEM` already accepts up to64 typed rooms. Extend the existing
   create adapter/schema/Guide and independent readback expectation (implemented); use stable
   room UUIDs, nullable absent optional facts, and reject duplicate identities.
   Keep non-P3 room payloads invalid. No new parser or database schema is needed.
2. **Place edit safe-manual adapter is implemented locally in S3.** The validated
   `get_trip_item_edit_base` already returns full Item child arrays and root
   `field_state` (`mcp/read.ts:151–176`; `tripCoreV2Read.ts:18–41`). The normal DTO
   is insufficient for provenance-preserving replacement. The mandatory full-record guard uses this read; qualified/source place edits
   must remain closed unless the owning contract preserves untouched leaves.
3. **Room-bearing Stay detail edits have a real replacement/provenance limit.**
   `SET_STAY_DETAILS` always replaces the room set. Core `detail()` reasserts every
   supplied leaf as MANUAL with new changed revision and null evidence, even when
   the value is unchanged (`tripCoreV2Mutation.ts:328–412`, `:916–922`). Copying
   rooms from the DTO/full record preserves values but can erase source lineage.
   Do not simply remove `STAY_ROOM_PROVENANCE_PRESERVATION_REQUIRES_OWNING_PORT`.
   A source-backed room detail edit needs a sparse/preservation-capable owning
   command; no such new Core command is implemented or requested here. Existing
   manual-room cases may be scoped separately with explicit provenance behavior.
4. MCP create name/place bounds are now aligned to approved Core max500. The prior narrower bounds were
   an input-fidelity mismatch, not a new model requirement. The focused test accepts exactly500 characters and rejects501; no silent truncation.
5. Booking/Source/Document/Expense/guest links are separate capabilities. Their
   absence must stay visible in the fact ledger and does not justify inventing
   P3 columns, Notes substitutes or a second domain implementation.

## Required focused verification for the main slice

- Full new-P3 Create adapter → real Core → receipt → independent root, stay,
  room and participation readback; assert exact strings, civil clocks, permitted
  windows, null omissions and stable room IDs on replay.
- Edit title/Notes/date/window/participation independently at the current revision;
  assert only intended leaves change, same Item ID and unrelated children remain.
- Room-bearing detail edit and place edit: either prove the exact supported manual
  preservation path, or expose the blocked field/fact before confirmation. Retain
  the existing source-backed room regression (`mcp/mutation.test.ts:217`).
- Pending checkout amendment never overwrites confirmed checkout. Missing optional
  fields never block otherwise valid candidates or become null/Clear implicitly.
- Test schema discoverability/Guide examples with a **fresh consumer chat**; local
  model/SDK fixtures are separate evidence. Record actual discovery, proposal,
  user confirmation, Apply, canonical receipt and independent readback.
- Native Day Feed/Detail/cold restore is independently PENDING until actually
  observed under a lawful device session; Cloud APPLIED is not Native PASS.

## Next P1–P6 coverage order

| Family       | Reuse already present                                                       | Main known local limit before full-field claim                                                                                              |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| P2 Flight    | sparse create then FLIGHT_DETAILS with per-segment explicit civil endpoints | Qualified/source flight replacement requires owning preservation; inspect all service/code-share facts, never merge segments by booking ref |
| P4 Rental    | supplier/class/or-similar/model/plate, pickup/return create                 | Existing place edit blocked; partial manual details supported; actual model/plate require evidence                                          |
| P5 Transport | subtype/operator/service/endpoints and independent check-in Create          | Service/endpoint edit blocked on replacement provenance; no invented exact clocks/qualified endpoints                                       |
| P1 Plan      | title/Notes/schedule/place Create; category/participation typed adapter     | Existing place edit blocked; source/qualified temporal preservation still applies                                                           |
| P6 Activity  | activity details/admission/session/entry Create                             | ACTIVITY/entry edit blocked; owning full-fidelity/preservation limit, not a new parser                                                      |

Recommend **P3 → P2 → P4 → P5 → P1 → P6**, matching Owner order; revisit only
when an actual owning dependency makes a later independent slice more productive.
No Delete/Archive consumer acceptance exists from the Notes proof or this audit.
