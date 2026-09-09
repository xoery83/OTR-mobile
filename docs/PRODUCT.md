# OTR Mobile 2.0 Product Scope

## Positioning

OTR Mobile 2.0 is a Group Travel Operations App. It helps a travel group answer practical, repeated questions during a real trip:

- Where are we going today?
- What is the next stop?
- How do we open navigation quickly?
- Where are the tickets, PDFs, QR codes, and confirmations?
- Who paid, who participated, and how do we settle fairly?
- How does the group keep working when the network is weak or unavailable?

It is not a travel social network, content creation platform, chat-first app, or Web product port.

## Target Users

Primary users are small travel groups, often families or friend groups, travelling across multiple cities with bookings, tickets, shared expenses, and unreliable connectivity.

The app must work for tired travellers in sunlight, in queues, at train stations, and with older travellers who need clear labels, large touch targets, high contrast, and minimal modal chains.

## Roles

Organizer:

- Plans and edits itinerary details.
- Adds members.
- Records and corrects expenses.
- Manages tickets and documents.
- Handles settlement and export.

Traveller:

- Checks Today.
- Opens navigation.
- Opens tickets and QR codes fast.
- Checks personal balance.
- Captures simple updates.

Organizer Mode and Traveller Mode are product directions, not Phase 1 implementation requirements.

## Core Modules

Today / Itinerary:

- Today-first view of the trip.
- Ordered events, next stop, location, navigation, attachments, tickets, QR codes, and offline access.

Ledger / Expenses:

- Payer, participants, equal split, custom split, group/household split, exclusions, multi-currency, base settlement currency, exchange rate snapshot, edit history, permissions, settlement, and export.

Travel Documents / Tickets:

- Tickets, QR codes, boarding passes, train tickets, museum tickets, hotel confirmations, PDFs, and images.
- Can be linked to itinerary events.
- Must be available offline once cached.
- Must support quick fullscreen access.

Capture:

- A unified quick input entry point, not a separate heavy module.
- Future inputs include text, voice, camera, photo, and document.
- Parser routes captured content to Itinerary, Expense, or Travel Document.

## MVP Scope

Phase 1 should validate:

- Offline-readable Today.
- Offline-readable tickets and cached assets.
- Local-first expense create/edit.
- Multi-currency expense model.
- Backend API boundary.
- Persistent sync and upload queues.
- Basic capture routing.

## Phase 2A Expense Vertical Slice

Phase 2A validates one deliberately narrow business flow before full Ledger work:

- Create one expense locally with a title, integer minor-unit amount, and currency.
- Show it immediately from SQLite with an explicit sync state.
- Persist a `CREATE_EXPENSE` mutation in the existing durable sync queue.
- Preserve both the expense and mutation across an app restart.
- Reconcile a successful transport response to a local `server_id` and `SYNCED` state.

Phase 2A excludes splits, settlement, exchange rates, receipt capture, categories beyond a placeholder, deletion, and conflict UI.

## Phase 2B Itinerary Create Vertical Slice

Phase 2B validates the same local-first lifecycle for a Journey-scoped itinerary item:

- Create a title and date, with optional start time, location, and notes, inside one Journey.
- Persist the item and one `CREATE_ITINERARY` operation atomically.
- Keep Journey queries scoped in the repository rather than filtering global data in UI.
- Preserve offline-created items and their operations across restart, then reconcile a fake server response.

Phase 2B excludes full planner behavior, edits, deletes, ordering, maps, structured reservations, capture, AI, notifications, collaboration conflict UI, media, and Memory. Memory remains Product Redesign Pending.

## Non-Goals

Frozen in Phase 1:

- Chat.
- Story.
- Poster.
- Highlights.
- Independent Map home.
- Social features.
- Complex Album.
- Travel content creation.
- P2P transfer.
- Face recognition.
- Full Photo Drop.

Maps exist only as itinerary location, navigation launch, and route context.

## Future Photo Drop

Future photo architecture should support:

- Local photo references before upload.
- User marks "Share to Trip".
- SQLite records local asset metadata.
- Thumbnail or preview upload before original upload.
- Server indexing.
- Optional face recognition and clustering.
- Delayed original upload with Wi-Fi-only, charging-only, retry, resume, deduplication, and possible nearby transfer.

Initialization must not block this path, but should not implement it.
