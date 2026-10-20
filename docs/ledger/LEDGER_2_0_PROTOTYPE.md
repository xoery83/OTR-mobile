# Ledger 2.0 Native Prototype

Date: 2026-09-11

## Purpose And Safety Boundary

This is a functionally fake, interaction-realistic iOS prototype for product review. It validates Ledger 2.0 information architecture and native interaction patterns before production schema or backend work begins.

- All prototype records live in an in-memory React provider under `src/features/ledger-prototype`.
- It does not read or write SQLite, Supabase Dev, Supabase Production, or the Phase 2A Expense repository.
- Actions such as sync, correction requests, receipt upload, deletion, sharing, and settlement finalization are simulated locally.
- Restarting the native process restores the deterministic fixtures. The prototype is disposable.
- The existing Phase 2A implementation remains available in source and tests, but this review surface does not invoke it.

## Navigation Map

```text
Ledger tab
├── Ledger overview
│   ├── Journey context -> native Journey chooser
│   │   └── My Ledger -> period-based personal cross-Journey summary
│   ├── Spending
│   │   ├── Mine / Group summary
│   │   ├── Spending Analysis -> category, day and traveller views
│   │   └── Search & Filter -> query and status/category filters
│   ├── Settlement
│   │   ├── personal position and blockers
│   │   └── transfer row -> Transfer Detail
│   │       ├── payer reports full or partial Paid amount
│   │       └── recipient confirms Received
│   ├── + / Add Expense -> New Expense sheet
│   │   ├── Paid by -> native action sheet
│   │   ├── Split -> Split sheet
│   │   ├── Currency & group value -> Currency sheet
│   │   └── Receipt -> Receipt sheet
│   ├── Expense row -> Expense detail
│   │   ├── Edit title
│   │   ├── Explain split and three financial truths
│   │   ├── Review receipt/payment evidence
│   │   ├── Resolve financial conflict
│   │   └── Audit history / tombstone preview
│   ├── Your Balance -> personal balance explanation
│   └── Settlement preview -> balances and minimized transfers
└── Expense long press -> view / duplicate / suggest correction
```

## Screen Inventory

| Screen            | Purpose                                             | Native interaction                                         |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Ledger            | Choose Journey and enter Spending or Settlement     | Large title, context menu, segments, list                  |
| My Ledger         | Review personal totals across a selected period     | Period segment and Journey-separated rows                  |
| Spending Analysis | Understand category, time and traveller patterns    | Mine/Group segment, bars and drill-down                    |
| Search Expenses   | Find and classify Journey spending                  | Native search input and horizontal filter controls         |
| New Expense       | One-handed fast entry with optional enrichment      | Numeric keyboard, bottom save action, modal sheet          |
| Split             | Include/exclude travellers and select split method  | Radio rows, checkbox rows, 44pt+ targets                   |
| Currency & Value  | Keep merchant, card and group values separate       | ISO currency choices, policy radio rows                    |
| Receipt           | Validate capture-first and attach-later paths       | Camera/library actions, OCR review fixture                 |
| Expense Detail    | Explain every financial number and revision         | Navigation drill-down, edit action, confirmation dialog    |
| Your Balance      | Explain creditor/debtor position per expense        | Exact personal shares and conversion source                |
| Settlement        | Review net positions and minimized transfers        | Transfer drill-down, blocking conflict, final confirmation |
| Transfer Detail   | Record partial Paid and separately confirm Received | Role preview, amount input, timeline, confirmation dialog  |

## Fixture Scenarios

1. `Dinner at Chez Janou`: EUR 100 receipt, NZD 199.43 Visa posting and NZD 197.80 Journey valuation.
2. `Taxi to Gare de Lyon`: equal split with Mia excluded.
3. `Lake cruise tickets`: adult 1 / child 0.5 family shares.
4. `Pizza in Naples`: simple equal dinner.
5. `Museum lockers`: pending offline expense saved on this iPhone.
6. `Apartment groceries`: financially material participant conflict.
7. Four settlement obligations: open, settled, and one split into two confirmed
   partial payments plus one awaiting recipient confirmation.
8. Four Journey contexts: two overlapping today, one upcoming, and one past.

All fixture allocations reconcile exactly in integer minor units and are covered by automated tests.

## Interaction Notes

- Fast path: tap `+`, enter amount and description, then `Save Expense`. The default payer, participant set and Journey rate make this reachable with one hand.
- Advanced path: review payer, split, currency valuation and receipt before saving.
- The original merchant amount, actual payer cost and group settlement value are visibly separate.
- Household choices are convenience inputs; saved allocations still resolve to exact member shares.
- A receipt may prefill a draft, or be attached after an expense exists. Its upload lifecycle is shown as independent.
- Financial conflicts never silently resolve. Settlement remains draft until the conflict is reviewed.
- Journey context is always visible. Overlapping active Journeys are selectable,
  while My Ledger preserves each Journey's financial boundary.
- Spending and Settlement are peer views because analysis and repayment answer
  different user questions even though they use the same accepted records.
- Paid and Received are separate actions. A payer may report several partial
  payments, but only recipient-confirmed payments reduce the obligation.
- Long-press offers contextual actions; destructive behavior uses confirmation and explains reversible tombstones.
- Text uses system fonts and supports Dynamic Type. Core controls have at least a 44pt target and accessibility roles, labels, state and hints where needed.
- The layout is single-column and avoids dense Web-style forms.

## Review Runbook

### 1. Journey Context And My Ledger

1. Open `Ledger` and confirm `Europe 2026`, dates, five people and NZD are visible.
2. Tap the Journey header and switch to `South Island Weekend`.
3. Open the chooser again, select `My Ledger`, and change the period.
4. Confirm each total remains grouped by Journey and no cross-Journey debt is
   presented as settled or netted.

### 2. Spending And Analysis

1. Return to `Europe 2026` and select `Spending`.
2. Switch between `Mine` and `Group`.
3. Open `See analysis`; inspect Category, By Day, and By Traveller.
4. Open `Search & Filter`, search for `Dinner`, then try Receipts and Needs
   attention filters.

### 3. Fast Expense

1. Open `Ledger`, tap `+`.
2. Enter `42.50` and `Lunch`.
3. Tap `Save Expense` without opening advanced settings.
4. Confirm the item appears first as `Saved locally`.

### 4. Split And Exclusion

1. Start another expense and open `Split`.
2. Deselect Mia and select `Equal per person`.
3. Re-open Split and compare `Equal per household` and `Family shares`.
4. Confirm every row is easy to tap and the included count updates.

### 5. Currency And Payment Evidence

1. Open `Dinner at Chez Janou`.
2. Compare merchant EUR 100, Visa NZD 199.43 and Journey NZD 197.80.
3. Start a new expense, open `Currency & group value`, and switch EUR/GBP/CHF/NZD.
4. Compare Journey reference and actual payer-cost policies.

### 6. Receipt-First Capture

1. Start a new expense and open `Receipt`.
2. Tap `Scan sample receipt`.
3. Confirm the draft is prefilled with Cafe Oberkampf, EUR 86.40 and an attached receipt.

### 7. Explainable Balance

1. Tap `You are owed $183.45`.
2. Review positive and negative expense contributions.
3. Open one row and confirm personal share, original amount, conversion and evidence are available.

### 8. Conflict And Audit

1. Open `Apartment groceries`.
2. Confirm the two participant versions are presented and no automatic winner is chosen.
3. Resolve with the confirmation dialog.
4. Confirm a conflict-resolution event appears in History and status becomes locally pending.

### 9. Settlement And Partial Repayment

1. Open `Settlement preview` before resolving the conflict and attempt to finalize.
2. Confirm finalization is blocked and links to the conflicting expense.
3. Resolve the conflict, return, and open `Dad pays Leon`.
4. Preview the payer role, enter a partial payment, and tap `Mark as Paid`.
5. Switch to the recipient role and confirm the awaiting payment as Received.
6. Confirm the payment timeline remains visible and only confirmed amounts
   reduce the remaining obligation.
7. Finalize the preview, open share preview, and review the cross-currency
   repayment explanation.

## Device Workflow

Use the existing signed Development Build workflow from `docs/IOS_DEVICE_RUNBOOK.md`:

```bash
npx expo run:ios --device
```

Keep Metro running for a Debug build. A Release build embeds the JavaScript bundle and is preferable for offline cold-start review. Installing the prototype does not alter its isolation boundary.

### Validation Result

Validated on 2026-09-11:

- iPhone 17 Pro Simulator on iOS 26.5: native build, install and Metro launch passed.
- Leon's iPhone 16 Pro on iOS 26.6: existing team/signing reused; build, install and Metro bundle delivery passed.
- Physical-device UDID was resolved through Xcode because the CoreDevice identifier is not accepted by Expo's `--device` option.
- Large-title and modal-sheet safe-area behavior was visually checked at the iPhone viewport.
- Main Ledger, New Expense, Split, Currency & Value, Receipt, Expense Detail, Your Balance and Settlement screens rendered without clipping or overlap after safe-area corrections.
- Revised Journey context, My Ledger, Spending Analysis, and Transfer Detail
  screens were visually checked in the iPhone 17 Pro Simulator without clipping
  or overlap.
- The revised build was rebuilt, signed, installed, and launched on Leon's
  physical iPhone on 2026-09-11 with zero Xcode errors or warnings; Metro
  delivered the updated Expo Router bundle successfully.
- Metro should remain running on `172.20.10.2:8081` for the current Development Build review session.

## Dependency Decision

`expo-symbols` is the official Expo module used for native SF Symbols in tabs, status indicators and actions. It avoids custom SVG assets and follows iOS accessibility/tint behavior. No general-purpose UI framework or state library was added.

## Review Exit

Prototype approval may inform later migrations, API contracts and production UI, but none are authorized by this artifact. Record findings first, then explicitly approve implementation scope.
