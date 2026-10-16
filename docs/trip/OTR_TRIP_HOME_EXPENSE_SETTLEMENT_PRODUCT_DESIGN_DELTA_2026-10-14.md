# OTR Mobile 2.0 — Trip Home Expense & Settlement Widget Product Design Delta

**Date:** 2026-10-14  
**Status:** Owner-approved product design; subject to OTR Beta Main Product Chat integration review  
**Scope:** One Trip Home Contextual Workspace widget; no changes to Ledger business semantics.

## 1. Purpose and boundaries

Provide a useful Trip-level finance snapshot using **existing Ledger-owned data and calculations**. The widget does not implement a second Ledger, calculate settlement independently, or compel users to record payments. It uses the shared Trip Home large-widget shell, top tags and horizontal pager, consistent with OTR UI Foundation.

## 2. Approved product decisions

- **HOME-EXPENSE-01 — One lifecycle-adaptive widget.** Upcoming and Active share a spending-summary presentation; Past presents a financial recap with Settlement. Do not create separate Expense and Settlement carousel widgets.
- **HOME-EXPENSE-02 — Past settlement presentation.** Display available Settlement information as a summary, alongside Group and My Spending; do not treat Trip end as evidence that accounts are settled.
- **HOME-EXPENSE-03 — Spending semantics.** **My Spending is the amount attributable to the current user’s consumption during this Trip, regardless of who paid.** Read the existing Ledger Spending metric and its established permissions, currency, valuation and inclusion rules. It is NOT the user's paid/advanced amount and must not be silently replaced with My Share.
- **HOME-EXPENSE-04 — Counts.** Show total expense-entry count and dynamic category counts from Ledger's existing expense categories; do not derive categories from booking/item types. Show main categories within available space, with an honest remainder if needed.
- **HOME-EXPENSE-05 — Presence and priority.** Upcoming/Active: show when there are authorized recorded expenses. Past: show when authorized expenses or Settlement data exist. No finance data: omit this large widget. Active Today's Journey retains default first position. Past Journey Snapshot retains default first position; an outstanding Settlement balance does **not** promote finance ahead of Snapshot. Settlement is optional assistance, not a mandatory task or overdue alert.
- **HOME-EXPENSE-06 — Navigation and graceful degradation.** Recent expense rows open the existing Ledger expense detail. Spending opens Ledger Spending; Settlement opens the existing settlement view; Analyze appears only if the existing spending-analysis destination is implemented and available. Use Ledger-owned permissions, offline/sync and data availability; no fabricated zeros, settlement claims or new mandatory action.

## 3. Content by lifecycle

| Element | Upcoming | Active | Past |
|---|---|---|---|
| Group Spending | Yes, authorized Ledger metric | Yes | Yes |
| My Spending | Yes, Ledger's user-attributed consumption | Yes | Yes |
| Total expense count | Yes | Yes | Yes |
| Dynamic category counts | Yes | Yes | Yes |
| Recently recorded expenses | Up to 3, compact title and amount | Up to 3 | No |
| Settlement summary | Not primary | Not primary | Yes, if available |
| Primary navigation | Open Ledger/Spending | Open Ledger/Spending | Spending, Settlement, conditional Analyze |
| Add Expense inside widget | No | No | No |

**Upcoming nuance:** Expenses may be prepaid, expected, or otherwise recorded in advance. Widget labels must not imply all recorded amounts have been paid or are final. Use the existing Ledger semantics rather than inventing a separate future-spend metric.

**Past nuance:** Unrecorded offline payments, cash or other off-app settlements may exist. A recorded payable/receivable balance is information, not proof the person has failed to settle or must act. Do not display coercive calls to action.

## 4. Presentation contract

- Shared Contextual Workspace sizing and navigation: large approximately 420–550pt widget subject to adaptive accessibility sizing; top tags and horizontal paging owned by Trip Home framework.
- Upcoming/Active: concise header; two prominent metrics (Group Spending and My Spending); total and category counts; up to three recent expense rows; Ledger/Spending navigation.
- Past: concise header; two prominent metrics; counts; Settlement summary when available; Spending, Settlement and conditional Analyze shortcuts; no recent-expense list.
- Use existing OTR MoneyText, typography, colors, dark/light, spacing and currency display patterns. Do not create a separate finance design system.
- Preserve source-of-truth freshness and offline caveats as exposed by Ledger. Avoid implying remote verification where none exists.
- Only render amounts/counts within the current actor's allowed visibility. If Group Spending is not authorized, omit or use the existing Ledger-approved restricted state; never infer it from personal values.

## 5. Integration and dependencies

**Owning module:** Ledger (Spending, settlement, currency, expense categorization, payment records, permissions, sync).

**Trip Home responsibilities:** consume read-only authorized summaries, render the correct lifecycle layout, provide context links, obey carousel priority. No new financial persistence, FX calculations, payment logic, or generic review engine.

**Engineering preflight required:** verify actual Ledger Spending and Settlement APIs/selectors, Group/Mine scopes, category counts, creation timestamps, and existing Spending/Settlement/Analyze route availability. Do not infer these from labels. Where a particular field/route is absent, deliver only the supported subset and register the missing capability explicitly. This Delta does not authorize a Ledger redesign.

**No dependency on:** P3–P6 booking-expense linkage, Photos, Documents, Updates, embedded maps or AI/CXE.

## 6. Acceptance scenarios

1. Upcoming with prepaid and unpaid recorded expenses: labels do not imply all are paid; correct Group/My Spending.
2. Active with several expenses: show up to three recent entries, correct links; Today remains first widget.
3. Past with recorded settlement balance: show balance as informational; Journey Snapshot stays first.
4. Past with payments recorded: display the owning Ledger's settlement result, not a local calculation.
5. Past with possible off-app payments: no overdue/unpaid assertion or forced acknowledgement.
6. No authorized financial records: no empty 500pt widget or fabricated zero.
7. Multiple currencies and rate provenance: amounts match existing Ledger presentation.
8. Mine/Everyone and limited membership: no leakage of unauthorized totals or entries.
9. Category counts reflect Ledger categories, not Booking types; expense count avoids duplicated entries.
10. Recent expense item opens existing detail; Spending/Settlement links open their real pages; Analyze hidden when unavailable.
11. Offline or pending sync: data and freshness follow Ledger-owned behavior.
12. Light/Dark, long names, Dynamic Type and compact layouts: no clipping, no misleading truncation of amounts.

## 7. Handoff and decision status

This widget is **PRODUCT DESIGN APPROVED**, not evidence of completed implementation, live data integration or Visual QA acceptance. Send first to the **OTR Beta Main Product Chat** for contract reconciliation; that chat issues the Codex Beta Delivery Coordinator update. The Coordinator may queue a bounded implementation against actual existing Ledger capabilities, with missing selectors/routes explicitly deferred rather than fabricated.

### Related already approved work

- Trip Home Framework Implementation Contract (2026-10-14)
- Trip Home Preparation Widget Delta (2026-10-14)
- Today's Journey Widget Delta (2026-10-14)
- Journey Snapshot Widget Delta (2026-10-14)

Recent Imports remains dependent on Capture/Documents/Updates presentation contracts; Members, Tickets and Memories have their own owning-module dependencies.
