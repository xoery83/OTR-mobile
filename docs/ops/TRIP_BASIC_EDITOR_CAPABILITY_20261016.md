# Trip Basic Editor — owning delivery and field matrix

Baseline `c472eba`, 2026-10-16. Owner subsequently authorized ordinary metadata
update contract/repository/queue/Backend engineering, so the initial cover-only
checkpoint `e621011` is a recovery point, not the completed Editor. No Hosted
migration/deployment, device installation or R2 frozen-tree modification occurred.

| Field                              | READ                                                                                                                 | EDIT                                                                                           | LOCAL SAVE                                                                 | SYNC                                                                                     | BLOCKER                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Name                               | Real account-local Trip and discovery summary                                                                        | Implemented for original local creator provenance                                              | Atomic row + durable update intent; offline and cold-reopen tested         | Ordered update queue, authenticated transport, receipt worker and normal lifecycle wired | Hosted update receipt/functions not installed; no cloud PASS                      |
| Start/end dates, including undated | Existing nullable calendar dates                                                                                     | Implemented with shared native date picker and Clear Date; original Create validation retained | Same atomic local transaction; no Item date or global lifecycle rewrite    | Same ordered queue                                                                       | Same finite Hosted capability gap                                                 |
| Destination                        | Existing nullable manual string                                                                                      | Implemented; no new summary/override field or inference                                        | Same local-first path                                                      | Same queue                                                                               | Same Hosted gap; automatic summary not implemented/authorized                     |
| Four bundled covers                | Account-local `selected_cover_asset_id`, bundled catalog and deterministic UUID fallback                             | Independently available on local Trip row                                                      | Existing account-fenced SQLite60 preference; immediate/offline/cold-reopen | Deliberately device-local; no sync claim                                                 | None for four assets; custom photos and cross-device cover remain unavailable     |
| Hosted cover URL                   | `public.trips.cover_image_url` exists in inherited baseline; absent from current Trip/discovery transport projection | Not exposed by this Editor                                                                     | Not used                                                                   | Not used                                                                                 | Owning photo/cover transport capability, separate from current bundled preference |

## Existing and new owning paths

- `src/domain/trip/types.ts` defines existing Trip fields. `tripCreateContract.ts`
  retains original validation through shared metadata field definitions.
  `tripMetadataContract.ts` adds a strict full-tuple before/after CAS update and
  actor-bound immutable receipt. This is not Source/Core admission authority.
- `tripRepository.createTrip` persists the initial container and immutable
  CREATE_TRIP. Changing a create operation's payload is still rejected.
  Existing create transport is `POST /v2/trips` plus receipt lookup. Normal
  Backend without its owning create port still returns `TRIP_CREATE_CLOSED`.
- `tripMetadataRepository` accepts updates only with the Account's original valid
  local CREATE provenance. This supports its own pending Trip and its own accepted
  creator Trip; it grants no Hosted membership. `canUpdateMetadata` withholds form
  editing when that provenance is unavailable. Remote-only cached Trips remain
  read-only, with no fabricated local row.
- One existing `sync_operations` UPDATE_TRIP_METADATA intent records stable identity,
  before/after values and preceding operation. CREATE payload stays unchanged.
  A first pending update depends on CREATE; later updates depend on the prior
  unfinished update. Row and queue write commit together and retain dirty values
  on failure. Stale local before-values and changed operation replays fail closed.
- Original local creator Ledger presentation title/dates are kept coherent while
  the Trip is unaccepted, under the existing LOCAL_CREATOR binding. No financial
  settings, Expenses, Item schedule, rights or lifecycle policy is changed.
- The existing discovery merge retains local metadata over stale Hosted summaries.
  Four cover IDs now survive its decoder, including `cultural-oldtown`.
- `tripMetadataSyncWorker/Transport/Coordinator` perform authenticated actor-bound
  receipt lookup, exact update replay and response validation. Earlier receipts
  complete their queue operation without overwriting later local edits. A pending
  metadata update on an accepted Trip reads PENDING_UPDATE rather than SYNCED.
- `defaultBootstrapDependencies.refreshThenSync` reaches the existing operational
  cycle, which invokes metadata after Trip Create. The same queue timer aggregates
  enabled metadata due times separately from Ledger UI counts, including work
  queued during a running cycle. Cold-start/foreground/network/Auth recovery and
  retries share that owner; no additional timer. Metadata failure does not stop Ledger.
  Dispatch is CLOSED by default: no SQLite/transport work or attempt increment
  unless DEV transport and explicit `EXPO_PUBLIC_OTR_TRIP_METADATA_UPDATE=1` are
  installed. The flag was **not** enabled on any device by this task.
- Backend authenticated metadata POST/receipt GET routes and a CLOSED-by-default
  injected port are wired. `tripMetadataPgStorage` uses the existing finite lease
  and verifies scope before/after its transaction. It references proposed owning
  SQL functions which are **not installed**; it is not a working Hosted updater yet.
  Generic workers explicitly exclude UPDATE_TRIP_METADATA.

## Editor and Native handoff

`TripBasicEditor` is mounted in the normal existing local Trip modal. Name/manual
Destination and shared `TripCalendarField` save through the same local repository;
unsupported provenance keeps these fields read-only. Bundled cover retains its
independent existing writer and explains that it is not synced. Save failures keep
entered values. Date-only/null semantics are not converted into instants.

Coordinator's shared Hero commits are included in this candidate. Local workspace
publishes one generation-fenced `editTrip` callback; native Hero Edit and the
identity hit target open this same modal. No new Router/params or navigation shell
is introduced. The original Trip-cover More action remains another existing entry.

**Native entry after coordinated integration only:** Menu → All Trips → original
`Nelson summer` (`b67d35d9-f338-45b9-9344-5038f86a22d1`) → Hero Edit (or title/identity)
→ edit a field → Save → Close → normally reopen App/Trip. To preserve the original
regression case, use a separate ordinary QA-created Trip for destructive date/name
experiments; do not delete/recreate Nelson or change dates solely to manufacture
Active. For Undated, clear both dates and verify reopen on that separate QA Trip.
Cloud update stays visibly waiting; do not label local save as Hosted success.

AD5 currently retains frozen R2 signed Release `191a557`. **Do not install this
main-baseline worktree over it directly.** Coordinator first combines the owning
metadata changes and R2 Root/Day/Shell regression fixes on a new integration branch,
then performs Native acceptance. This task has not operated AD5, A1A or iOS26.5.

## One remaining protected Hosted difference

Exact non-secret review candidate, **not a migration and not applied**:
`/private/tmp/otr-trip-metadata-hosted-candidate-20261016/{up.sql,rollback.sql,manifest.json}`.

The candidate adds one private RLS-on receipt table, two finite creator/linked-owner
update/receipt functions on the existing gateway principal, and no new credential
or role. It proposes exact metadata-tuple CAS with immutable operation receipts.
It also makes CREATE receipt metadata read its original persisted create payload:
otherwise the existing CREATE result function rereads updated Trip metadata and
would incorrectly fail a later exact create retry. No broader member write right,
financial calculation, Source, Storage or Production change is included.

This requires protected Hosted schema/EXECUTE and finite Backend installation
approval after independent review and exact target/image verification. None is
claimed or executed here. Recovery disables Native dispatch, unbinds the new port
and revokes new EXECUTE; it retains user edits and receipt evidence, with no bulk
metadata undo or evidence table deletion. The corrected rollback restores the exact
current finite CREATE-result contract. Both SQL-level finite checks are retained
in the proposed replacement; only metadata values become immutable. SQL runtime itself remains unverified.

## Verification

Focused tests cover genuine SQLite close/reopen, Account isolation/ABA rollback,
immutable CREATE after edits, two-update ordering, stale before-values, changed-key
replay, failed queue writes, discovery merge, nullable/invalid calendar dates,
older receipts versus newer dirty fields, offline worker pause, exact mock transport
receipts, finite Backend leases, normal startup CLOSED and failure isolation.
These are engineering checks, not Native or Hosted Runtime PASS. Exact final test
counts are reported with the candidate handoff.

SQL review recovery pins (not executed): up.sql SHA-256 `96733200c3edae75fb2f2a527ed440a3bd1bd91043d6b5b76aac792ebaf5887f`; rollback.sql SHA-256 `8c83404cf8c2946bf1e0acb67630dcbcb2afdd289d5d4195f1e7071caa1b0679`.
