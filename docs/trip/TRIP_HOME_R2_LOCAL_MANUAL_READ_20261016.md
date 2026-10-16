# Trip Home R2 committed manual local read

Approved TH-R2-05/06 adds a separate local read authority. A durable, valid MANUAL
Core intent and its owning queue operation may supply pending Item/Day facts
before sync. This does not manufacture a Core certificate, Source, import
admission, or accepted collection. Drafts, import candidates, REVIEW/CONFLICT
intents and unpinned queue payloads cannot supply these facts.

`readTripDayFeed().trip(id)` retains `observed` for accepted/historical reads and
adds `localManual` plus `localManualStatus` (AVAILABLE, NONE, UNAVAILABLE).
`localManual` contains captured account/trip/generation scope,
`source: {kind: LOCAL_MANUAL_COMMITTED, fingerprint}`, operation digests, normal
Core Item views, `rows(date)` and `today(clock)`.

- `rows(date)` supplies only committed pending row replacements; remove accepted
  rows for the same Item before adding these rows. Pending rows retain localState
  PENDING and certificateGeneration 0. Do not pass this fingerprint as an epoch.
- Local creator reads verify the original CREATE_TRIP owning queue and creator
  binding. Certified Trips use the authenticated accepted actor. Both reuse the
  existing Core predictor and Day projection. Without a certificate, an empty
  graph is the starting point, so orphan cache rows cannot become accepted facts.
- `today(clock)` uses the same Today selector with the coherent accepted plus
  committed prediction graph. It requires an explicit trustworthy IANA zone;
  date-only Item facts, destination labels and device zone do not supply one.
  A valid empty read with a valid clock is FREE; missing clock/read is unavailable.
- `readTripTodaysJourney().readLocal(id, clock)` returns the distinct local source.
  `resolveLocalItem(id, itemId, {scope, source})` rereads and checks generation and
  fingerprint. Accepted Item resolution remains the existing separate path.
- Shared UI integration must invalidate its Day/Today read key after successful
  manual save and reread, retaining the captured Trip/account scope. A legitimate
  explicit TripViewContext zone can be reused; no device-zone fallback is added.

No schema, sync operation, network transport, write API or refresh lifecycle is
added. Targeted SQLite tests cover normal local saves, exact queue pins, digest
mismatch, refresh fingerprints, account changes, excluded intents and honest
clock availability. Desktop read-only diagnostics are not normal App Runtime.

## Shared UI integration

`DayFeed` accepts `localManual`, optional accepted `projection`, and
`onOpenLocalItem(itemId, expectedScopeAndSource)`. With a local read it renders
normal Core Day rows, civil P3 dates and visible pending state; no timezone is
required for authored date-only rows. Accepted rows for changed Items are replaced.
The callback should call the reader's `resolveLocalItem` before opening its
`{scope, source, item}` result. No certificate is present on this result.

`TodaysJourneyWidget` adds optional `refreshKey`, `onOpenLocalToday(read)`,
`onOpenLocalItem(resolved)`, and `onOpenDayChooser()`. It prefers a coherent local
read when committed changes exist. Existing accepted callbacks retain their old
types. Missing clock context leaves Open Today disabled and exposes the existing
Open Day action when supplied. All copy reuses existing catalog keys.

The parent TripScreen/LocalTripWorkspace writer supplies those callbacks and
increments `refreshKey` after successful saves. Native visual/runtime acceptance
remains a separate integrated check.
