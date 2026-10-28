# CREATE-TRIP-01 Stage 1 — bounded UI candidate

Baseline: `72ec39ae93f3d0a59c590889755ad2a1b1e9be55`.
Branch: `codex/create-trip01-ui-20261017`.
Worktree: `/private/tmp/otr-create-trip01-ui-20261017`.
Authority: original `CREATE_TRIP_01_DELIVERY` Product Delta > Blueprint > PNG.
Status: **CODE_READY_WITH_FIELD_GAPS; NOT_NATIVE_VERIFIED**.

## Dependency and integration

- Approved read-only Setup Reader `bc5a2802dabf3b8852c8720c90d9b1fc883eb599`
  was cherry-picked unchanged as `f399280`. Its owning review is
  `/private/tmp/otr-create-trip01-setup-reader-independent-20261017.md`.
  Integrate that owning dependency once, then the UI commit. If already present,
  skip its duplicate cherry-pick; UI does not modify the three dependency files.
- No TripScreen patch is required: existing `LocalTripWorkspace` props and
  `quickActions.editTrip` already supply these routes. Keep Coordinator's
  `86ebdf7` Calendar coverage and `dates={calendarDates}` change when integrating.
  No TripScreen, DayFeedCalendarSheet, Day scroll, ScreenRoot or Shell file changed.
- Existing TripSearchEntry uses the Ledger-style `square.and.pencil` native edit
  glyph and legal mounted Quick Actions. Its current regression suite passed.
  No replacement toolbar or second editor route was added.
- Shared current-state/tracker updates remain Coordinator-owned; this receipt
  must not replace their active Import, Calendar or Native runtime state.

## Implemented presentation

- Create is a native page sheet over the saved My Trips list, with the canonical
  SheetHeader, keyboard avoidance and one footer Create action. It exposes only
  Name, existing scalar Destination and optional Dates. Cancel invokes no writer;
  an in-flight save cannot be dismissed. The existing busy guard, stable UUID
  pair, account generation checks and local Repository creation remain intact.
  Successful local creation opens the same returned Trip, independent of cloud.
- Create and Edit share metadata controls and one range-calendar sheet. Start
  then End taps highlight the interval; Clear and Done are explicit. Cancel and
  swipe dismissal retain the previous form range. Cross-month/year, reversed and
  same-day selections remain date-only; existing nullable bounds are preserved.
  Month cells reuse the existing pure calendar cell generator, without changing
  the owning Day Calendar. Large text can horizontally scroll wider cells.
- Edit keeps its original metadata Repository callback and stable Trip ID,
  existing curated Cover selection with preview and its truthful immediate,
  device-only persistence notice. Save remains metadata-only. Actual currency
  opens the existing Ledger settings route only for an observed eligible owner.
  Dirty metadata is retained by default when leaving for Currency; only explicit
  Discard leaves, with no automatic Save. Locked, read-only and unknown settings
  are not editable currency controls.
- First Preparation retains equal Import / Build primary actions, adding date,
  destination, actual currency and Cover rows. Persistent Members summary sits
  below Home widgets for local and cached Trips, counting actual named Persons,
  including the separately required creator when present. It never labels this
  as the count of new Travelers, connected Accounts or invitations.
- Setup loading shares Preparation's request/account fence and focus/AppState
  refresh. Returning from Ledger settings rereads actual currency and locks.
  Unavailable Setup facts do not disable existing itinerary actions. Currency,
  roster and permissions come exclusively from the approved read-only aggregate;
  there is no inferred NZD, zero roster or fake unlocked status.

## Exact remaining field/product gaps

| Approved field/flow                                                   | Current boundary                                                                                                                                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-destination tokens and offline place recognition/disambiguation | Existing command stores one scalar string. No chips, lossy serialization or name-derived confirmed place is submitted. Needs owning token/lookup/precedence contract.                               |
| Traveler slots and name-only Person creation                          | No legal Create command/queue accepts names. Form does not accept names and pretend they were saved. Actual creator/financial identity is not repurposed as Traveler 1.                             |
| Manage Members and invitations                                        | No production Members destination/write flow. Summary is truthful read-only text, with no dead Manage/Invite link, invented pending counts or invitation side effect.                               |
| Guest creation/adoption                                               | Auth/Guest principal and adoption remain Stage 3 owning gaps. Authenticated local-first behavior is reused; no Guest acceptance claim.                                                              |
| Photo/file Cover and destination-aware automatic cover                | Existing curated library and stable UUID fallback only. No upload, photo persistence, image generation or automatic destination match is invented.                                                  |
| Atomic metadata + Cover Save/Cancel                                   | Existing Cover writer commits immediately and independently. Existing notice remains explicit. This candidate does not claim atomic combined save or that closing Edit reverts saved Cover choices. |
| Itinerary outside core range and Day 1–N                              | Coordinator/Core own lawful coverage and day-number presentation. This UI does not alter Item dates, expand Core bounds, infer a timezone or claim their Native gate.                               |
| Hosted metadata update / currency availability                        | Existing default-CLOSED services and settings authority remain unchanged. Currency route eligibility does not promise successful online preview for an unaccepted Trip.                             |

## Validation

- Nine targeted suites: **74 tests passed**. Includes real owning Trip Repository,
  Preparation Repository and Setup Reader SQLite checks, Create double-tap and
  Cancel, existing account fences, cross-year range selection/Clear/Cancel,
  truthful currency/roster/lock presentation, late refresh/account-result rejection,
  route-focus reread and explicit dirty-draft discard before Currency navigation.
- Typecheck, UI guard, scoped ESLint, Prettier and diff checks passed.
- Independent review found two P2s: stale currency after Settings Back, and dirty
  Editor draft loss on Currency navigation. Both were fixed, covered by targeted
  tests and independently re-reviewed with no remaining confirmed P1/P2.
- No Simulator/Metro/GUI, installation, account mutation, Hosted request, main
  merge or Push in this packet. No new Backend, Schema, Auth, Sync, Import or
  financial writer. Component/SQLite tests are not Native visual acceptance.
- Integration-only pending: keyboard/footer, nested range sheet, real settings
  round-trip and closing gestures on Native. Owner visual review remains separate.

After delivery, return UI file ownership to Coordinator and stop this packet.
