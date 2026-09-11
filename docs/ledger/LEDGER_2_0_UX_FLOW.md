# Ledger 2.0 Mobile UX Flow

Date: 2026-09-11
Status: Approved interaction base with travel-feedback revision; no UI implementation authorized

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

## Journey Context And Ledger Modes

The Ledger root always displays the selected Journey name, dates, member count,
and settlement currency. Tapping it opens a native Journey chooser plus **My
Ledger**. With one active Journey, it opens directly; with multiple active
Journeys, it restores a valid recent choice or asks the user to choose; with no
active Journey, it opens My Ledger instead of pretending an arbitrary past trip
is current.

Within a Journey, a top segmented control separates:

- **Spending**: expense entry, list, search, filters, categories, time trends,
  payer/member views, receipts, and Mine/Group scope.
- **Settlement**: personal balance, member balances, blockers, recommended
  transfers, Paid/Received acknowledgements, and final statement.

My Ledger summarizes the current member across a selected period. Every row
retains its Journey label and opens that Journey. Debts are never netted across
Journeys. A reporting-currency total must show its conversion basis.

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
- Provide Everyone, recent presets, and Phase 1 Household shortcuts.
- Show each member as a large selectable row with avatar/name/checkmark.
- A compact summary says **Everyone except Alex** when clearer.
- Unlinked members remain selectable and are not shown as lesser participants.
- Changing selection updates the exact allocation preview immediately.

### Split Mode

Use a segmented control:

- Equal per person;
- Equal per household;
- Household/member shares, with editable values such as adult `1` and child
  `0.5`;
- Exact;
- Percentage;
- future general Weighted under an Advanced menu.

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

The financial summary separates three cards/rows only when evidence exists:

    Merchant: EUR 100.00
    Card posted: NZD 199.43 (Visa NZ, includes NZD 2.00 known fee)
    Group value: NZD 197.80 (Journey reference-rate policy)

The fast path shows merchant amount and group value; payer-cost detail remains
one tap away. Adding posted-cost evidence never silently changes group value.
The currency picker searches ISO 4217 metadata while prioritizing recent codes.

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

Receipt is a first-class two-way workflow:

1. **Expense first:** save the Expense immediately, then attach a receipt,
   statement crop, or payment evidence from detail.
2. **Receipt first:** camera/photo/document picker saves a local asset, OCR
   proposes merchant amount/currency/date/category, and the user confirms a
   prefilled Expense draft.

OCR may also propose authorization/posted amounts and fees when clearly labeled,
but these populate a reviewable PaymentRecord, never merchant or settlement
truth silently. Payer and participants remain user-confirmed. Original image/PDF
upload follows the durable asset queue and can be Wi-Fi constrained later.

Expense sync, receipt upload, and OCR each expose their own status. Failure in
one never rolls back or deletes the others.

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

- immutable merchant amount, optional payer posted cost, and accepted group
  settlement value as distinct values;
- payer;
- member-by-member split;
- rate provenance;
- notes/category/date/location;
- itinerary/document links;
- sync/conflict status;
- audit timeline.
- correction requests and their resolution state.

Editing uses the same fast/advanced composer prefilled from a base revision.
Financial changes show a before/after summary before commit. Organizer edits to
someone else's expense require a reason.

Delete is a reversible local tombstone until synchronized. A finalized expense
cannot be deleted as an ordinary action; use correction/adjustment workflow.

For someone else's Expense, an ordinary member sees **Suggest correction**.
They enter a proposed change and reason; the current financial record remains
unchanged. The creator may accept/reject, while an organizer may resolve or edit
directly with a mandatory audit reason.

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
- PaymentRecord, correction request, and heuristic-review operations are durable
  and remain available offline according to cached permissions.

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

Each member can tap their balance and follow this complete explanation path:

    balance -> creditor/debtor -> individual expense -> own exact split
      -> merchant amount -> settlement valuation -> rate/payment evidence

Show residual-cent adjustments and why the Journey policy selected the displayed
group value. No result may require organizer-only context to understand.

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

Each suggested transfer is a stable obligation row with payer, recipient,
original amount, confirmed amount, awaiting amount, remaining amount, and
status. The payer may record **Paid**, including a partial amount. The recipient
must separately mark that exact payment **Received** before it reduces the
confirmed obligation. Repeated partial payments form a visible timeline.
Rejected, disputed, and organizer-corrected records retain their history and
reason. Avoid notifications except when confirmation from the other member is
genuinely required.

The obligation is always shown in Journey settlement currency. When payer and
debtor agree to repay in another currency, a conversion sheet shows:

- settlement amount being discharged;
- actual payment amount/currency;
- rate source/date or manual agreement;
- any explicit fee and who bears it;
- confirmation required from both involved linked members.

Recording foreign-currency payment never silently replaces the settlement
obligation or hides an FX difference.

## Ledger Review UX

### Deterministic Checks

Inline validation blocks an invalid save or settlement and explains the exact
reconciliation problem: allocations, percentages, invalid members, currency or
valuation mismatch, non-zero settlement, idempotency collision, or revision
integrity. Offline-capable rules run before local acceptance and repeat on the
backend.

### Intelligent Review

A separate **Review** surface groups advisory findings such as likely duplicate,
unusual amount/currency/rate, participant-context mismatch, receipt/entered or
posted-cost mismatch, unusually large expense without evidence, and likely
missing expense. Each finding shows why it was raised and offers View, Suggest
correction, Acknowledge, or Dismiss.

AI and heuristics never edit, delete, merge, revalue, or settle an Expense. The
entry fast path is not interrupted by advisory findings unless the user opens
them; actionable high-severity findings may be listed before final settlement.

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

- Journey identity is always visible and switchable;
- Spending and Settlement are separate top-level modes;
- list, analysis/search, and quick add live under Spending;
- Personal balance is one tap away;
- Settlement is prominent near trip end or when requested;
- My Ledger provides date-scoped, Journey-separated personal history;
- settings/rates/history live in contextual screens, not the primary form.

Do not port the Web four-tab page wholesale. Mobile navigation should optimize
entry first, explanation second, and administration third.

## Validation Scenarios

1. Equal dinner for four with one residual cent.
2. Taxi excluding one traveller.
3. Hotel exact split between two households.
4. Household split using adult `1` and child `0.5`, resolved to exact members.
5. Percentage split that initially totals 99.99%.
6. EUR merchant amount, different NZD card-posted cost, and reference-rate group value.
7. Foreign-currency offline entry using a dated saved rate.
8. Offline entry with no rate, later resolved online.
9. Organizer correction of another member's synced expense with reason.
10. Ordinary member proposes a correction without mutating the Expense.
11. Two devices edit amount/split concurrently.
12. Receipt asset remains pending after Expense data syncs.
13. Receipt-first OCR draft remains local while upload is offline.
14. Cross-currency repayment shows payment and discharged settlement values.
15. Heuristic duplicate flag is dismissed without changing either Expense.
16. Final settlement blocked by one deterministic conflict, then finalized and paid.
17. Older traveller completes fast path with Dynamic Type enabled.
18. App termination after local save; Expense and queue survive.
