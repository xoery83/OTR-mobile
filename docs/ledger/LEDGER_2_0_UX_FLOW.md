# Ledger 2.0 Mobile UX Flow

Date: 2026-09-10
Status: Interaction proposal; no UI implementation authorized

## UX Objective

The common case should feel like recording a fact, not completing an accounting
form. The user must still see enough payer and split information to avoid a
financial mistake.

Target flow:

    + Expense
      -> amount + concise purpose
      -> payer/participants/split confirmation
      -> instant local save
      -> optional later enrichment
      -> silent background sync

## Entry Points

- Primary **+ Expense** command in Expenses.
- Global Capture action routed to an Expense draft.
- **Add expense** from an itinerary item/reservation with the link prefilled.
- **Add receipt** from camera/photo/document picker, producing a reviewable draft.
- Duplicate/repeat from an existing expense or split template.

All entry points converge on the same Expense draft and repository command.

## Fast Path

Designed for one-handed use in a queue, taxi, cafe, or station.

### Step 1: Amount First

Open a bottom sheet or focused full-screen composer with:

- large numeric amount input;
- visible currency button with recent/default currency;
- short merchant/purpose field;
- payer summary, defaulting to the current member/recent payer;
- split summary such as **Everyone equally** or **4 people equally**;
- primary Save action reachable by thumb.

The keyboard opens on amount. Currency, payer, and split summaries are tappable
rows, not hidden defaults. Large controls and dynamic type must not overlap.

### Step 2: Confirm The Financial Summary

If defaults are valid, the main composer itself is the confirmation:

    EUR 42.80  Dinner
    Paid by Leon
    Split equally: Leon, May, Mum, Dad
    EUR 10.70 each

The user taps Save. There is no separate success modal.

If the participant set changed, the rate is stale/manual, OCR confidence is
low, or exact rounding produces unequal last cents, show a compact confirmation
sheet before Save. It must explain the actual final allocations.

### Step 3: Instant Local Save

On Save:

1. validate and calculate the aggregate locally;
2. write Expense, participants, splits, rate evidence, audit event, and sync
   operation in one SQLite transaction;
3. close the composer immediately;
4. render the item from the repository-backed local query;
5. show a quiet Pending status only while relevant.

Network, rate refresh, receipt upload, OCR enrichment, and server response do
not block the local save.

### Step 4: Optional Enrichment

The expense detail offers non-blocking additions:

- category;
- notes;
- exact date/time;
- location;
- itinerary/reservation link;
- receipt/document;
- split correction;
- exchange-rate review.

An unobtrusive **Needs details** marker is allowed when important enrichment is
missing. It must not imply that the expense was lost.

## Advanced Path

Open by tapping payer/split/currency summaries or **More details**.

### Participants And Exclusions

- Start from the visible recent/default set.
- Provide Everyone, recent presets, and future Household shortcuts.
- Show each member as a large selectable row with avatar/name/checkmark.
- A compact summary says **Everyone except Alex** when clearer.
- Unlinked members remain selectable and are not shown as lesser participants.
- Changing selection updates the exact allocation preview immediately.

### Split Mode

Use a segmented control:

- Equal;
- Exact;
- Percentage;
- future Weighted under an Advanced menu.

Equal shows each member's final minor-unit amount, including residual cents.

Exact gives one amount input per included member, a remaining amount indicator,
and a **Distribute remainder** command. Save is disabled until remaining is zero.

Percentage gives one percentage per member and shows both total percentage and
calculated money. Save is disabled unless total is exactly 100 at accepted
precision.

Switching modes does not silently discard custom inputs. Ask before resetting
or preserve a draft per mode for the current editing session.

### Payer

Use a single-select member list with current/recent payer first. Multi-payer is
not shown in Ledger Phase 1. A payer may be excluded from participants, but the
summary must make that unusual combination obvious.

### Currency And Rate

The currency picker prioritizes Journey/recent currencies and supports search.
Below it, show:

    1 EUR = 1.96 NZD
    Rate dated 8 Sep - Provider snapshot

Offline stale rate:

    Using saved rate from 8 Sep

No rate:

    Saved locally - Rate needed before settlement

Manual override requires an explicit action, rate input, converted preview, and
reason. It must never look like routine amount editing.

### Details And Links

- Date/time defaults to Journey-local now.
- Category uses familiar icon + label, not a dense taxonomy screen.
- Location can use current/itinerary place but remains optional.
- Itinerary link shows context and can be removed independently.
- Receipt/document attachment saves a local asset immediately and displays its
  upload/cache status separately from Expense sync.

## Capture Flows

### Text Capture

Example: **Dinner 84 euros, I paid, everyone except Alex**.

Parser may prefill amount, currency, title, payer, and participant exclusions.
Before commit, show the same financial summary as manual entry. Unknown names or
ambiguous split language require selection; they are never guessed silently.

### Voice Capture

Record, transcribe, and produce a draft. Keep transcript available during review
but do not store or upload audio beyond the user's chosen retention policy.
Saving the Expense never waits for transcript/cloud cleanup.

### Receipt/Photo Capture

Camera/photo/document picker creates a local receipt asset and draft. OCR may
suggest merchant, amount, currency, date, and category with confidence markers.
Payer and participants remain user-confirmed. Original image/PDF upload follows
the durable asset queue and can be Wi-Fi constrained later.

## Expense List

The first screen is the usable Ledger, not a dashboard hero.

Each row prioritizes:

- purpose/merchant;
- original amount and currency;
- payer and participant summary;
- date;
- personal share where useful;
- status icon/label only when Pending, Failed, Rate needed, or Conflict.

Use filters for date/category/member/status only when needed. Search is secondary
to quick entry. Pending rows remain fully usable and editable offline.

## Expense Detail And Editing

Detail presents:

- original and settlement amount;
- payer;
- member-by-member split;
- rate provenance;
- notes/category/date/location;
- itinerary/document links;
- sync/conflict status;
- audit timeline.

Editing uses the same fast/advanced composer prefilled from a base revision.
Financial changes show a before/after summary before commit. Organizer edits to
someone else's expense require a reason.

Delete is a reversible local tombstone until synchronized. A finalized expense
cannot be deleted as an ordinary action; use correction/adjustment workflow.

## Offline And Sync UX

- Offline edit uses the same local repository transaction and durable queue as
  online edit.
- App launch always shows cached Ledger data when a valid local session exists.
- Creating/editing offline behaves like online until the quiet status label.
- Offline/token-refresh failure pauses sync; it never redirects to Login.
- Pending and Failed are not modal errors.
- Retry happens automatically on authenticated connectivity recovery.
- A persistent failure offers **Try again** and a concise reason.
- Conflict is a distinct state and opens a comparison/resolution flow.
- Receipt upload status is separate from Expense data sync status.

The development sync harness is not part of product UI.

## Conflict Resolution UX

For financial fields, show **Your version** and **Journey version** with changed
fields highlighted. Provide:

- Keep mine;
- Keep Journey version;
- Edit a resolved version;
- organizer-only override with reason.

Show amount, payer, participants, split allocations, currency, and rate together
as one financial summary. Never merge these fields invisibly.

For notes/category/link-only conflicts, the app may offer a pre-merged draft,
but must identify simultaneous removals/edits. The chosen result creates a new
revision and remains in audit history.

## Settlement UX

### Overview

The Settlement screen answers:

- What did each person pay?
- What does each person owe?
- What is each person's net balance?
- Which expenses/rates still need attention?
- Who should transfer what to whom?

Do not permit finalization while an included financial conflict or missing rate
exists. Provide links to resolve each blocker.

### Preview And Finalize

Organizer taps **Prepare settlement**. Show:

- settlement cutoff and currency;
- included expense count;
- excluded/unresolved items;
- member balances;
- suggested minimized transfers;
- rate snapshot summary.

Finalization requires a clear confirmation. It stores an immutable Settlement,
not a screenshot of current calculations.

### Record Transfers

Each suggested transfer is a stable row with payer, recipient, amount, and
status. A linked involved member may mark/confirm payment according to policy.
Organizer may correct with reason. Avoid notifications except when confirmation
from another member is genuinely required.

### Final Statement

When balanced, show **Settled** and offer:

- view explainable statement;
- export PDF;
- export CSV/data;
- share using a privacy-controlled mechanism.

The statement remains cached for offline access once generated.

## Accessibility And Travel Conditions

- Minimum 44pt touch targets; prefer 48pt for primary controls.
- Dynamic Type without clipped currency or member names.
- Numeric keyboard with locale-aware parsing but canonical storage.
- Screen-reader phrases include direction and meaning, not color.
- High contrast in sunlight and reduced-motion support.
- Payer/split status always shown as text, icon, or both.
- Avoid long modal chains; preserve drafts across interruptions.
- Warn before leaving an unsaved advanced edit.

## Navigation Recommendation

Expenses remains a primary tab. Within it:

- list and quick add are the default;
- Personal balance is one tap away;
- Settlement is prominent near trip end or when requested;
- settings/rates/history live in contextual screens, not the primary form.

Do not port the Web four-tab page wholesale. Mobile navigation should optimize
entry first, explanation second, and administration third.

## Validation Scenarios

1. Equal dinner for four with one residual cent.
2. Taxi excluding one traveller.
3. Hotel exact split between two households.
4. Percentage split that initially totals 99.99%.
5. Foreign-currency offline entry using a dated saved rate.
6. Offline entry with no rate, later resolved online.
7. Organizer correction of another member's synced expense.
8. Two devices edit amount/split concurrently.
9. Receipt asset remains pending after Expense data syncs.
10. Final settlement blocked by one conflict, then finalized and paid.
11. Older traveller completes fast path with Dynamic Type enabled.
12. App termination after local save; Expense and queue survive.
