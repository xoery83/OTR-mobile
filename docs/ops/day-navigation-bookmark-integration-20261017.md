# Day cold-resume navigation hint — Coordinator handoff

Repository-only candidate; no ScreenRoot, Context, routing or Native changes.

## Existing capability reused

`src/data/repositories/dayNavigationBookmarkRepository.ts` mirrors existing
`searchRecentRepository.ts`: SecureStore, active Account scope, generation/assert
checks and account apply gate. No new dependency, table, migration or Sync queue.

API:

```ts
export type DayNavigationBookmark = {
  tripId: string;
  date: string;
  zone: string; // Empty is valid Floating/NTC context; never infer device timezone.
  anchor?: { key: string; date: string; within: number };
};

dayNavigationBookmarkRepository.list(): Promise<DayNavigationBookmark[]>;
dayNavigationBookmarkRepository.record(hint): Promise<DayNavigationBookmark[]>;
dayNavigationBookmarkRepository.remove(tripId): Promise<DayNavigationBookmark[]>;
```

Only whitelisted navigation identity is persisted plus an internal local timestamp.
Generation, focus, raw absolute scroll offset, Trip title, account Session and Item
content are never stored. Scope key is current Account UUID. Bounds: newest8,
1800UTF8bytes,30days; corrupt/expired/future hints are ignored. Source Trip/date/zone
and same-date row anchor are validated. Storage read failure returns[] and cannot
overwrite an unread preference; write failure returns[]. Account/generation changes
still reject using the existing fence; caller must catch and discard them.

## Precise Root integration boundary

1. In TripViewProvider, hydrate on current generation using list(), with a captured
   generation/cancelled guard checked both before calling setState and inside its
   updater. Merge only missing current-generation bookmarks. Rebuild each view's
   generation from the current captured generation, not persisted data; reading is
   `{offset:0, focus:null, layout:'WHOLE_TRIP', anchoredDate:hint.date,
...(hint.anchor ? {anchor:hint.anchor} : {})}`.
2. Hydration must leave state.view, workingTrip, lastTrip, entry and route unchanged.
   Cold App launch remains MyTrips. Opening a Trip normally may consume its hint;
   the existing normal Reader still validates Trip access/date range/row identity.
   An inaccessible Trip or missing row is not made readable by this preference.
3. Explicit Today/header entry bypasses the saved reading exactly as enterTripDay
   already does; late hydration must never replace that entry. Existing live/current
   session bookmarks win over disk hints, including records updated while hydration
   was pending.
4. Persist only a saveTripReading result actually accepted by its revision/Trip/
   generation fences, and only for RESUME. Use its anchoredDate/actual anchor, not
   a guessed selected Calendar date. The Native verified jump already emits
   onAnchorChange. Do not call storage inside a React setState updater (StrictMode
   can run it twice), or queue a SecureStore write for every scroll frame. Root can
   coalesce ordinary reading writes and flush the accepted hint on normal navigation
   away; confirmed Calendar jump completion should persist promptly.
5. Fence any delayed/coalesced write with the captured generation before calling
   record; otherwise an old UI hint could be captured under a new Account. Clear
   local pending timers/state when generation changes. Repository independently
   fences actual read/write I/O. Do not persist unknown auth or fabricate an account.

Recommended narrow integration tests: cold hydration does not navigate; normal
same-account Trip open restores row/date; explicit Today wins; hydration cannot
replace current reading; logout/account switch discards late hydration and deferred
writes; unavailable SecureStore leaves normal Day usable; normal Reader rejects an
inaccessible/removed Trip or missing date without fake access. Native acceptance
still requires the same AD5 Japan/empty date/Focus/cold-resume flow, not repository
unit tests. Native candidate2ae98bb remains frozen and unchanged by this worktree.
