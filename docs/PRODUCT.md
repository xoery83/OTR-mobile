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

- Payer, participants, equal split, custom split, group/household split,
  explicit settlement participation, multi-currency, base settlement currency,
  exchange rate snapshot, edit history, permissions, settlement, and export.
- An accepted Expense may be excluded from group settlement while remaining in
  Spending, search, receipts, history, and consumption analysis.
- New Expense opens directly in manual entry. Its title offers an offline,
  multilingual-ready category suggestion; unmatched titles use Other, and a
  manual category choice takes precedence. Receipt scanning remains available
  inside the form, with its original shown under optional attachments.
- Receipt OCR 1.0 is a quick **Title, Amount, Currency** review and confirmation
  flow, not automatic Expense entry. One to three scanned images may be
  combined as evidence; each confirmed image uses one of the existing three
  attachment slots. The person can edit every reviewed field, and a later
  scan must not overwrite a field they edited. Confirm copies the three
  values into New Expense; only the form's later Save creates the Expense.
  OCR does not change the Expense date in v1. Vision plus deterministic
  candidates is the offline baseline. Ambiguous currency symbols and
  Japanese/Chinese text may offer currencies for manual selection; text alone
  never changes Currency. On-device semantic ranking is optional
  and remote AI is outside OCR 1.0. The C0 behavior is specified in
  docs/ledger/RECEIPT_OCR_1_0_PHASE_C0_REVIEW_DESIGN.md. Receipt Review UX 1.0
  keeps the three editable fields, two-row candidate tags, a right-edge receipt
  stack and same-surface portrait/landscape comparison workspace; its approved
  behavior is in `docs/ledger/RECEIPT_REVIEW_UX_1_0_DESIGN.md`.
- Expense Attachments & Receipt Scan 1.0 is defined in
  `EXPENSE_ATTACHMENTS_RECEIPT_SCAN_1_0_DESIGN.md`. A New Expense may use
  on-device receipt OCR offline to suggest editable draft fields; scanning
  creates no durable upload before Save. An existing Expense may add, view,
  and delete attachments but never run OCR. Each Expense supports at most three
  attachments, including a scanned receipt. Upload failure never blocks the
  locally saved Expense. Attachment bytes and storage usage belong to the
  uploading user, while read access follows Expense/Journey authorization.
- During travel, unresolved FX may have clearly approximate, offline-capable
  display amounts, spending totals and informational settlement positions from
  trusted cached reference rates. These never become accepted financial evidence
  or final payment obligations. Opening Settlement proactively attempts eligible
  canonical FX resolution; finalization still requires accepted valuations and
  current authoritative digest, with actionable explanations for true blockers.
- Review is a financial attention inbox: shared versioned observations preserve
  evidence, while a future per-user decision records acknowledgement or dismissal
  without changing Expense or settlement truth. Review Engine v2 foundation is
  separate from the later personal-state, eligibility, and inbox UI phases.
- Settlement member review is optional and has three visible states: `Not reviewed`,
  `Still checking`, and `Looks good`. Every current Journey member may expand the
  group member names/statuses; it never gates Organizer confirmation. A material
  personal-statement change turns an earlier `Looks good` into `Still checking`.
- Approximate Settlement amounts are not marked with `≈`. A compact accessible
  indicator opens the affected Expense list and explains whether a reference rate is
  awaiting publication or needs user action.
- My Ledger is a secondary, local-first portfolio view. Its Spending section shows
  the user's allocated shares by total, category, and month in a selectable
  analytical display currency; estimates are marked `≈` and missing local FX
  excludes only affected expenses. Its Settlements section shows each Journey's
  existing balance in that Journey's settlement currency.

Travel Documents / Tickets:

- Tickets, QR codes, boarding passes, train tickets, museum tickets, hotel confirmations, PDFs, and images.
- Can be linked to itinerary events.
- Must be available offline once cached.
- Must support quick fullscreen access.

Capture:

- A unified quick input entry point, not a separate heavy module.
- Future inputs include text, voice, camera, photo, and document.
- Parser routes captured content to Itinerary, Expense, or Travel Document.

Data & Sync:

- App-level Settings provides one user-safe Data Health check for the active account.
- Phase B detects protected saved intent, waiting work, stale rebuildable mirrors, and
  conditions needing attention without repairing, retrying, deleting, or contacting the
  Backend for recovery.
- Normal UI shows only aggregate outcomes. Technical rule identifiers remain Debug-only.

## Approved Long-Term Navigation Direction

The approved primary navigation target is:

- Today.
- Ledger.
- Trip.
- Album.

Today is the daily cross-product dashboard. Ledger, Trip, and Album are the
three long-term product pillars. Capture remains a global creation/input action
rather than a permanent primary destination. Migrating the current bottom tabs
to this structure is a future task and is not part of the Global Menu and
Account Switching work.

The top-left menu is a contextual utility menu, not a second app launcher. It
combines the current account, Settings, Language, Log out, and low-frequency
actions for the current primary module. While Ledger is active, those actions
are My Ledger and Currency. Review remains inside the selected Journey's Ledger
experience. Developer diagnostics and test-account tools do not appear in the
normal menu. The menu must not repeat Today, Ledger, Trip, Album, or Capture as
navigation destinations.

## Account Switching

Account switching is a future Production capability, not a Dev-only role
simulation. The same device may remember more than one real authenticated
account, but each account keeps its own session identity, personal cache,
permission context, selected Journey, and durable mutation ownership.

Switching accounts must never submit one user's queued mutation with another
user's token or briefly expose the previous user's personal projection. Shared
server-confirmed Journey data remains shared for users whom the Backend
authorizes. Development builds may add a quick selector for remembered Dev
sessions, but it uses the same account-switching foundation and never changes a
local role or Journey member mapping.

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

## Ledger 2.0 Interaction Prototype

The review-only Ledger 2.0 prototype is an approved, isolated product-design surface. It uses in-memory fixture data to validate native navigation, explicit Journey context, personal cross-Journey reporting, separate spending analysis and settlement modes, fast entry, split selection, currency valuation, receipt capture, explainable balances, conflicts, audit history, partial repayment, and bilateral Paid/Received confirmation. It does not replace the Phase 2A repository flow, write SQLite, call the backend, or authorize production Ledger schema work. Its state may be discarded at any time.

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

## Approved Expense consistency closure

Owner approved the implementation checkpoint under `docs/ledger/`. Ordinary
Expense Detail, Review/Sync Issues and Settlement blockers will open one conflict
resolution flow, including locally deleted Expenses. This is a safety net only when
a human business choice is required. Routine reconciliation, automatic FX refresh,
compatible merge, retries and ordinary confirmation stay silent; provenance remains
under Rate details. Explicit choices show their actual waiting, confirmed or failed
result in business language. No generic Retry/Force Sync for 409. Delivery is gated
by ADR 0056; later FX/recovery phases remain separately gated.
