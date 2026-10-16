# Trip Basic Editor — bounded owning capability check

Baseline: `c472eba` (2026-10-16). No Hosted reads/writes, device changes or schema changes.
The frozen Trip Home R2 `191a557` is a separate candidate and is not modified here.

## Field-level result

| Field                              | READ / actual source                                                                                                   | EDIT                                                | LOCAL SAVE                                                                                               | SYNC                                                   | BLOCKER                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Name                               | `Trip.name`; account-scoped `local_trip_containers.name`; discovery fallback `trip_discovery_summaries.name`           | Create only; existing Trip read-only                | Initial create is durable; no metadata update method                                                     | Immutable `CREATE_TRIP` request/receipt only           | Missing update command, authorization/version/conflict policy, repository and worker                                  |
| Start/end dates, including undated | Nullable calendar strings `start_date/end_date` in the same local/discovery sources; null is not inferred              | Create only; existing Trip read-only                | Initial create is durable; no date-update method                                                         | Create only                                            | Same update gaps; date changes must refresh legitimate readers without rewriting Item temporal facts                  |
| Destination                        | Nullable single string `destination` in local/discovery summaries                                                      | Manual initial create only; existing Trip read-only | Initial create is durable                                                                                | Create only                                            | Same update gaps; no distinct automatic-summary/manual-override fields or inference capability                        |
| Built-in cover                     | `selected_cover_asset_id` on account-local Trip, mapped to four bundled assets; deterministic UUID fallback when unset | **Available** on an existing local Trip row         | **Available offline**, transactional and account-generation fenced; existing repository cold-reopen test | **Not applicable: explicitly device-local preference** | No owning blocker for four bundled choices; no remote-only row writer, custom photo import or cross-device cover sync |

These are separate capabilities. The Editor is not collectively BLOCKED. It can
read existing metadata and edit the device-local bundled cover now. A remote-only
cached Trip has no `local_trip_containers` row; do not fabricate one to enable edits.
No name/date/destination update can be unlocked solely by creating text inputs.

## Existing ownership and code evidence

- `src/domain/trip/types.ts`: existing `Trip` fields and `CreateTripInput`.
- `src/data/repositories/tripRepository.ts`: `getTrip/listTrips/createTrip`,
  `selectBuiltInCover`, `acceptCreate/resumeCreateTrips`; no metadata update method.
  Creation validates dates/range and bounded trimmed name/destination, persists
  local row plus exactly one stable `CREATE_TRIP`, and initializes local Ledger.
- `src/domain/trip/tripCreateContract.ts`: strict create/receipt schemas only.
  `src/data/sync/tripCreateTransport.ts`: `POST /v2/trips` and actor-bound receipt
  lookup. Reusing a create operation with different metadata is rejected.
  `src/data/sync/tripCreateSyncWorker.ts`: existing create worker; not an update worker.
- `backend/src/tripCreate.ts`: an absent owning port returns
  `503 TRIP_CREATE_CLOSED`. `backend/src/serverStartup.ts` injects that port only
  when explicitly supplied. This explains the default CLOSED implementation;
  this audit does not claim a newly verified deployment configuration.
- `src/domain/trip/tripCoreV2Commands.ts`: Item/Booking/Entitlement commands do not
  supply a Trip Root metadata update. Updating an Item title or Ledger Journey
  title is not a substitute for updating Trip metadata.
- `src/data/repositories/tripDiscoveryRepository.ts`: a complete account-scoped
  read snapshot; local containers win on equal UUID. Not a write/permission grant.
- `src/features/day-feed/tripCovers.ts` and `tripCoverSelection.ts`: bundled cover
  identity/fallback, no server cover field or automatic destination inference.
- Existing history: cover persistence `a01ae63`; discovery cache `1a0495a`;
  owning create port `588001f`; latest creation/person mapping `40c0da6`.
- `docs/DATA_MODEL.md` "Trips built-in cover choice — local SQLite60" explicitly
  defines cover selection as presentation-only, unsynced and not Core admission.
  `docs/API_CONTRACT.md` defines only create metadata writes.

## This candidate

- Add `TripBasicEditor.tsx` to the existing cover modal. It shows real existing
  name/destination/calendar dates as read-only, with an explicit capability message.
  The existing `TripCoverPicker` and parent `selectCover → selectBuiltInCover`
  remain the only update path. Cover help explicitly says local-only/no sync.
- Correct discovery's cover decoder to retain the already-supported
  `cultural-oldtown` choice instead of displaying a fallback in the merged list.
- No new save endpoint, queue operation, permission assumption, migration or model.
  The existing cover choice saves immediately, so there is no misleading whole-form
  Save button or editable field that silently discards changes.

## Shared Hero/identity entry handoff

No Router/Shell/TripScreen/WidgetHost writes are included. Current main's existing
`LocalTripWorkspace` cover modal hosts this Editor; the frozen R2 owns different
Hero wiring and must not be overwritten by a whole-file cherry-pick.

For the next coordinated R2 integration, use one local-Trip callback
`setCoverOpen(true)` (rename state to editorOpen only if useful). Pass/register
that same callback for both native Hero Edit and the Hero identity hit target.
The modal's header is `tripHome.edit`; the body is
`<TripBasicEditor trip={selected} onSelectCover={selectCover} />`.
Only enable this bounded Editor for an actual account-local Trip row. Keep
remote-only metadata read-only until an owning capability exists. Do not infer
Hosted organizer rights from this device-local cover capability. The full Editor
must not be advertised as available until the remaining fields have legal updates.

## One minimal Owner decision packet — remaining fields only

Approve one Trip Root metadata-update contract for **name, nullable start/end
calendar dates and the existing nullable manual destination string**. No automatic
summary, new destination field, cover sync or photo pipeline is included.

Required contract decisions, before its implementation:

1. Local creator may queue edits to its own unaccepted Trip; accepted Trip edits
   use actual owning Organizer/update capability. Cached membership alone does
   not create authority. Server rechecks permission before applying.
2. Use a distinct stable, idempotent update intent after immutable CREATE_TRIP;
   never mutate the persisted create payload/receipt. Local-first metadata and
   durable queued intent commit atomically, survive restart and remain account-fenced.
3. Specify authoritative version/CAS and stale-edit conflict behavior; preserve
   rejected/pending user edits rather than silently overwriting them on discovery.
   Reuse the existing owning version mechanism if supported; any schema gap must
   be reported separately before a migration is proposed or executed.
4. Keep date-only/null semantics and existing validation; refresh Trip summaries
   and lawful local Journey presentation. Do not rewrite Item dates, financial
   calculations, canonical membership or global lifecycle rules.

This is the missing product/interface decision, not a request for another audit
or a new security framework. Hosted deployment, if later necessary, retains its
existing finite authorization boundary. Once accepted, all three metadata fields
can share one ordinary repository/command/worker implementation rather than
three separate mechanisms.

## Verification limits

Focused repository tests exercise real SQLite file reopen, cover persistence,
account isolation and rollback on account generation change. Component tests
verify unsupported metadata stays read-only and the cover callback is forwarded.
These are code/local persistence checks, not Native UI or cloud-sync PASS.
