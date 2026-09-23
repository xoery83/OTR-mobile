# OTR Mobile 2.0 — Settlement 2.0 Product & UX Specification

**Document type:** Product / UX specification  
**Version:** 0.3  
**Date:** 2026-09-18  
**Status:** Product direction reviewed; ready for technical audit after owner approval  
**Scope:** Ledger → Settlement  
**Primary principle:** Keep financial rigor in the system, but expose only simple, human-readable concepts to travelers.

---

## 0. v0.2 Review Decisions

This revision incorporates the product review notes added on 2026-09-18.

Major changes from v0.1:

1. **Payment tracking is secondary, personal and non-authoritative.**  
   Each member may maintain their own records of what they paid or received. There is no single system-level payment truth that requires both sides to agree. Other members may view those records, but the records remain owned by the person who entered them and are optional.

2. **Member review is always optional.**  
   A regular member may never review anything in the app. Lack of review must not block normal journey use or final confirmation.

3. **All exceptions feed one Review system.**  
   A member tapping **Something looks wrong** creates the same kind of human-raised Review finding used elsewhere in Ledger. Settlement may surface it, but must not create a separate parallel anomaly workflow.

4. **Expense creator and organizer have different action responsibilities.**  
   A regular participant may raise a concern. The expense creator and organizer are the primary people who can correct the source record before final confirmation.

5. **Share inspection is inline-first.**  
   Users should be able to expand categories and scan key share details directly in Settlement without being pushed into a separate search browser for every check.

6. **Payment confirmation is simplified.**  
   Do not build a heavy payer↔receiver confirmation state machine. Payer and receiver can each record what they paid / received. Differences may exist in real life because of bank fees, intermediary charges or offline agreements.

7. **Payment evidence is optional.**  
   Either side may upload proof / screenshots / transfer slips when useful.

8. **FX reference must be instant.**  
   The payment screen must never make the user wait for a background 30-second rate worker. Show the best cached / most recent usable reference immediately and refresh asynchronously.

9. **“Looks good” is not a casual button on the dashboard.**  
   It belongs at the end of a compact personal settlement statement that the user intentionally opens to review.

10. **Settlement-change messages appear immediately on entry.**  
    If financially relevant information changed since the user's last review, Summary should surface that before anything else.

---

# 1. Purpose

Settlement is the place where a traveler answers four practical questions:

1. **As of now, how much do I owe or receive?**
2. **Why is that amount what it is?**
3. **Who should pay whom, and how much?**
4. **Is anything preventing the current numbers from being treated as final?**

Payment records are useful, but in many real journeys they are resolved outside OTR and participants already have bank, card, cash, WeChat or other transfer records.

Therefore Settlement should support:

- recording money paid or received;
- partial payments;
- multi-currency payments;
- optional payment evidence;

but **payment tracking must not dominate the primary page or feel compulsory**.

The user should feel that they are simply:

- checking the current numbers;
- understanding why;
- reviewing the parts that involve them when they care to;
- resolving anything that needs attention;
- optionally recording payments;
- confirming final amounts when the trip is effectively complete.

The backend may use revisions, snapshots, findings, settlement versions and audit records. Those concepts should not be exposed directly unless needed for support/debugging.

---

# 2. Product principles

## 2.1 Human language, not system language

User-facing UI should prefer:

- **Current balance**
- **You should receive**
- **You need to pay**
- **Paid for group**
- **Your share**
- **Needs attention**
- **Updated since you reviewed**
- **Nothing you need to do**
- **Ready to finish**
- **Review my settlement**
- **Looks good**
- **Confirm final amounts**
- **Make corrections**
- **Record payment**
- **Record amount received**

Avoid exposing terms such as:

- `DRAFT`
- `FINALIZED`
- `INVALIDATED`
- `PENDING_CONFIRMATION`
- `RATE_REQUIRED`
- `REOPENED`
- `BLOCKED`
- `SETTLEMENT_REVISION`

These may exist internally but should not be normal user vocabulary.

---

## 2.2 Always show the best current answer

Settlement should remain useful throughout the journey.

The primary balance answers:

> **Based on everything recorded so far, what is my current position?**

Before final confirmation:

```text
Current balance
Based on expenses recorded so far
```

After final confirmation:

```text
Final balance
Confirmed 18 Sep 2026
```

The user should never need to infer whether a number is provisional.

---

## 2.3 Payment recording is optional, personal and independent

Members may pay one another at any time, including before final confirmation.

Each member may keep their own payment record:

- **I paid** — money I believe I sent;
- **I received** — money I believe I received.

These are personal records, not a system-wide confirmed payment ledger.

Examples:

- send an advance midway through a long trip;
- send a round-number amount to the main payer;
- make several partial payments;
- pay in another currency;
- pay completely offline and never record it in OTR.

Therefore:

- settlement calculation must not depend on payment records existing;
- absence of payment records is not an error;
- one member's payment record does not require the counterparty to confirm it;
- the counterparty may view the other person's record from the relevant payable/receivable relationship;
- the counterparty may independently record a different amount;
- disagreement between the two records does not automatically create a system exception;
- payment recording should not create pressure or warnings by default.

---

## 2.4 Review is lightweight, personal and never mandatory

A traveler should not be asked to review the whole journey.

Each member **may** review information relevant to them:

- expenses they paid;
- expenses in which they have a share;
- transfers involving them;
- changes affecting their own financial position.

Many members may never use review at all.

That is acceptable.

The experience should be:

> “Check my numbers if I want to”

not:

> “Approve the group ledger.”

Review coverage is most useful to:

- organizer;
- major payer;
- expense recorder;
- detail-oriented participants.

---

## 2.5 Changes after review trigger delta review only

A member's previous review is not permanent approval of every individual expense.

If financially meaningful information later changes:

```text
Your settlement changed

1 expense was updated since you last reviewed.
Your balance changed by +¥320.

Review changes >
```

This message should appear prominently on Settlement entry / Summary.

Only affected members should see the change.

Non-financial edits should not trigger settlement review.

---

## 2.6 Final history must remain trustworthy

Once final amounts have been confirmed, the system should not silently rewrite history.

If later corrections are needed:

- organizer chooses **Make corrections**;
- previous final version remains in history;
- corrections create an updated settlement result;
- existing payment records remain;
- the user sees the updated financial result.

---

# 3. Roles and permissions

## 3.1 Regular member

A regular member can:

- view their own current balance;
- view how much they paid for the group;
- view their own assigned shares;
- expand and scan share details inline;
- open an expense for full detail / receipt / attachment;
- optionally record payments they made;
- optionally record amounts they received;
- upload payment evidence when useful;
- review changes affecting their own settlement;
- intentionally open a personal settlement statement and mark it **Looks good**;
- raise **Something looks wrong** on a share, expense or payment involving them.

A regular member should not:

- confirm final amounts for the entire journey;
- reopen the journey-wide final settlement;
- silently overwrite another person's source expense unless existing Ledger permissions explicitly allow it.

---

## 3.2 Expense creator

The expense creator is distinct from an ordinary participant.

Before final confirmation, the creator is one of the primary people who may:

- edit the source expense;
- correct payer / amount / participants / split;
- respond to a human-raised issue about that expense.

If another participant raises an issue:

- the issue belongs to the shared Review system;
- the creator and organizer are the primary actionable recipients;
- affected participants may see that the item is under review;
- participants should not all be forced to take action.

Do not broadcast unnecessary action requests to every participant.

Notify or surface changes only where they financially affect a member.

---

## 3.3 Organizer / Owner

An organizer can do everything a regular member can, plus:

- inspect settlement views for other members;
- inspect group-wide payer/share/payment information;
- resolve settlement-affecting findings;
- edit/correct source data where authorized;
- confirm the journey's final amounts;
- proceed even if some members have not reviewed;
- make corrections after final confirmation;
- create an updated final settlement version.

The organizer does **not** manually “finalize an expense”.

An expense becomes protected because it is included in a confirmed settlement version.

---

# 4. One Review system, not two

Settlement must not create a second anomaly/dispute system.

When a member taps:

```text
Something looks wrong
```

OTR creates a **human-raised Review finding** in the existing Ledger Review system.

Examples:

- wrong participant;
- wrong split;
- wrong payer;
- wrong amount;
- payment record issue.

Settlement may surface relevant findings in context, but the canonical review workflow remains the existing **Review** area.

### Settlement → Review navigation

A Summary card such as:

```text
Needs attention

2 things may affect your settlement.

Review 2 items >
```

should open the existing **Review** section with filters such as:

- current Journey;
- settlement-impacting;
- relevant to current user where appropriate.

Inline issue rows may deep-link directly to the related finding or expense.

This gives the user one place to resolve abnormal data.

---

# 4.1 UI fidelity is intentionally deferred

This specification defines the product behavior and information model first.

Detailed visual decisions — spacing, card treatment, typography, exact sticky-header behavior, row density, gesture tuning and final component composition — may be adjusted after the first working Settlement 2.0 implementation is available on simulator/device.

The first implementation should prioritize:

- correct information hierarchy;
- correct data semantics;
- correct permissions;
- correct interaction paths;
- realistic mobile testability.

Do not over-freeze visual details before hands-on testing.

---

# 5. Information architecture

Settlement uses four user-facing sections:

**Summary | Paid | Shares | Payments**

They appear as four equal-width icon tabs, with a compact label below each icon.
`Paid` is the member-as-payer view previously labelled `Spending`; the internal
financial meaning is unchanged.

## 5.1 Sticky behavior

Approved mobile behavior after physical-device feedback:

- Summary, Paid, Shares and Payments are four independent views; selecting a
  tab replaces the visible module instead of scrolling one continuous page.
- The primary Ledger selector **Spending | Settlement** appears above the active
  view at the top of Ledger.
- When the user scrolls down, the secondary strip
  **Summary | Paid | Shares | Payments**
  becomes sticky beneath the Trip title.
- Scrolling back to the top reveals **Spending | Settlement** again.
- When **Spending | Settlement** is outside the viewport, the Ledger header shows
  the active primary view as a small secondary label.
- Tapping a Settlement tab replaces the visible module without changing the
  current vertical scroll position.

## 5.2 Swipe behavior

Do **not** use full-page left/right swipe gestures to switch between Summary / Paid / Shares / Payments.

Reason: horizontal gestures conflict with charts, category rows and horizontal
controls, and swipe navigation makes location/context less obvious.

Horizontal finger movement should only scroll the navigation strip or controls that visually indicate horizontal scrolling.

---

# 6. Section 1 — Summary

The page begins directly with the green `FINAL BALANCE` / `CURRENT BALANCE`
lead inside the balance module. Do not repeat `Summary` as a content heading.

All four Settlement views use this same pale-green lead-card treatment: rounded
container, consistent inset, green semantic heading, and any applicable selector
on the heading row. Lists and secondary detail remain below the lead card.

Summary is the primary personal settlement dashboard.

It answers immediately:

1. What is my current net position?
2. Why?
3. Has anything changed since I last checked?
4. Is anything preventing final confirmation?
5. Do I personally need to do something?

Payment progress is secondary and should only appear compactly when actual payment records exist.

---

## 6.1 Primary balance

### Net receivable

```text
You should receive

¥8,549,355
```

If payment records exist, a compact secondary line may appear:

```text
Recorded received    ¥2,100,000
```

### Net payable

```text
You need to pay

¥1,240,300
```

If payment records exist:

```text
Recorded paid          ¥500,000
```

Do not force zero-payment rows into the hero.

Do not make “Remaining” the dominant concept unless the user is actively tracking payments in OTR.

---

## 6.2 Calculation explanation

```text
Paid for group        ¥12,450,000
Your share             ¥3,900,645
────────────────────────────────
Current balance       +¥8,549,355
```

This is the core explanation.

Payments are shown separately and do not redefine the settlement calculation itself.

---

## 6.3 Settlement changed message

If the user has previously reviewed and financially relevant information changed:

```text
Updated since you reviewed

Your balance changed by +¥320
1 expense changed

Review changes >
```

This message should be near the top of Summary.

It should not be buried inside Review.

---

## 6.4 Needs attention

Only show this block when useful.

Example:

```text
Needs attention

2 things may affect the final amount.

Review 2 items >
```

`Review 2 items` opens the canonical Ledger Review area, filtered to relevant settlement findings.

### Automatic waiting

If nothing is required from the user:

```text
Waiting for exchange rate

Nothing you need to do.
We'll update this automatically.
```

Do not mix “waiting automatically” with “you must act”.

---

## 6.5 Ready to finish

Organizer:

```text
Everything is ready

The final amounts can now be confirmed.

Confirm final amounts >
```

Regular member:

```text
Your settlement is ready to review

Review my settlement >
```

`Review my settlement` does **not** just scroll around the current page.

It opens a compact personal settlement statement.

See Section 12.

---

# 7. Section 2 — Spending

Purpose:

> Show how much a selected member paid as payer for shared/group expenses.

Default:

```text
[ Me ▼ ]
```

Organizer may select another member.

The member selector is a dropdown beside the section title. **Me** is always
the first option; do not use a horizontally scrolling row of member chips.

The content begins directly with the green dynamic lead (`PAID BY ME` or
`PAID BY {MEMBER}`) and the member dropdown on its right. Do not repeat
`Spending` or `Paid` as a content heading. The lead, dropdown, total and count
sit together in the shared pale-green lead card.

---

## 7.1 Spending summary

```text
Paid by me

¥12,450.00

24 shared expenses
```

Other member:

```text
Paid by Caroline

¥3,821.40

9 shared expenses
```

---

## 7.2 Category summary

```text
Accommodation       ¥5,420
Transport           ¥2,850
Food                ¥1,940
Activities          ¥1,220
Other               ¥1,020
```

The user may:

- expand a category inline for a quick scan;
- tap a row for the full expense;
- optionally choose **View all expenses** to open the existing Ledger browser with preset filters.

Suggested preset filter:

- Journey = current journey
- Payer = selected member
- Shared expense = yes

The search/browser is a secondary deep-dive tool, not the only way to inspect spending.

---

# 8. Section 3 — Shares

Purpose:

> Show how much the selected member is responsible for as a participant in shared expenses.

Default member:

```text
[ Me ▼ ]
```

Organizer may select another member.

The member selector follows the same dropdown behavior as Spending, with
**Me** first.

The content begins directly with the green dynamic share lead (`MY SHARE` or
`{MEMBER}'S SHARE`) and the member dropdown on its right. Do not repeat
`Shares` as a content heading. The lead, dropdown, total and count sit together
in the shared pale-green lead card.

---

## 8.1 Share summary

```text
My share

¥3,901.28

Across 31 shared expenses
```

---

## 8.2 Category accordion

Categories should be expandable inline.

Example:

```text
Accommodation                 ¥1,850   ˅

  Hotel Reykjavík
  ISK 24,800 total · Paid by Caroline
  6 people · Equal split
  Your share ISK 4,133 · ≈ ¥221.40
                                       >

  Apartment Akureyri
  ISK 18,600 total · Paid by Leo
  5 people · Custom split
  Your share ISK 5,200 · ≈ ¥278.60
                                       >

Food                            ¥720   >
Transport                       ¥685   >
Activities                      ¥510   >
Other                           ¥136   >
```

The user should be able to scan the important facts without opening every expense.

Tap a row to open full expense detail for:

- receipt;
- attachments;
- notes;
- complete split;
- audit/review actions.

---

## 8.3 Something looks wrong

Inline action:

```text
Something looks wrong
```

This does not create a Settlement-only dispute.

It creates a human-raised finding in the canonical Review system and links it to the source expense/share.

---

# 9. Section 4 — Payments

Payments answer two separate questions:

1. **According to the settlement calculation, who should pay whom?**
2. **What has each person personally recorded as paid or received?**

These must not be collapsed into a single “system truth”.

---

## 9.1 Recommended transfers

Default:

**Mine | Everyone**

Regular member: **Mine**

Organizer may switch to **Everyone**.

Use:

**payer → amount → receiver**

Example:

```text
Gudrún María    →   ¥1,457,753   →   You
Alexandra       →   ¥1,452,930   →   You
You             →       ¥8.38    →   Charlotte
```

These amounts come from the settlement calculation.

They are not payment confirmations.

---

## 9.2 Personal payment records

Each member owns their own payment records.

A user may add:

```text
I paid
```

or:

```text
I received
```

depending on their side of the relationship.

Example payer view:

```text
You → Leo

Current amount due
¥3,200

Your records
+ Record payment
```

Example receiver view:

```text
Leo → You

Current amount receivable
¥3,200

Your records
+ Record amount received
```

The record belongs to the person who entered it.

There is no requirement for the other side to approve or confirm it.

---

## 9.3 Visibility of the other side's records

Although records are personal, they are visible to the counterparty from the relevant receivable/payable relationship.

Example:

```text
You → Leo

Your records
Paid NZ$300

Leo's records
Received NZ$295
```

This visibility helps both people understand what has been entered.

It does **not** mean OTR decides which record is correct.

---

## 9.4 No system-wide payment truth

OTR should not derive a universal field such as:

```text
Confirmed paid = ...
```

from two members' entries.

The system may have:

- payer-entered records;
- receiver-entered records;
- optional attachments;
- timestamps;
- notes.

But it should not automatically merge them into one authoritative payment event.

If the two sides record different values, OTR may simply show both.

Example:

```text
You recorded paid
NZ$300

Leo recorded received
NZ$295
```

The difference may come from:

- intermediary-bank fees;
- receiving-bank fees;
- rounding;
- cash;
- currency conversion;
- offline verbal agreement;
- simple data-entry differences.

Participants resolve this offline if they care.

---

## 9.5 Payment records do not change the settlement result

This is a core rule.

The calculated amount:

```text
You should receive
¥8,549
```

must come from:

- expenses;
- payer amounts;
- shares;
- settlement calculation.

It must **not** change merely because someone did or did not enter payment records.

Payment records are an optional overlay showing what a member says happened in the real world.

Therefore:

- no payment record → settlement amount remains the same;
- one side records a payment → settlement amount remains the same;
- both sides record different payment values → settlement amount remains the same;
- removing a personal payment record → settlement amount remains the same.

If the product later wants to show a convenience figure such as **recorded remaining**, that must be clearly derived from that user's own records, not presented as the canonical settlement balance.

---

## 9.6 Optional evidence

When recording a payment or received amount, the user may add:

- screenshot;
- bank receipt;
- transfer confirmation;
- photo;
- note.

Either side can attach evidence to their own record.

Evidence is useful but optional.

---

## 9.7 No forced confirmation workflow

Do not require:

- receiver confirmation;
- payer confirmation;
- bilateral matching;
- dispute status;
- waiting-for-counterparty state.

Do not surface payment discrepancies as Review findings unless a user explicitly chooses:

```text
Something looks wrong
```

or otherwise raises it manually.

This keeps payment recording lightweight and consistent with real travel behavior.

---

# 10. Partial and advance payments

Payments may be entered before final confirmation.

Example payer perspective:

```text
Current amount you owe
¥3,200

You recorded paid
¥1,500 equivalent
```

Later new expenses increase the obligation:

```text
Current amount you owe
¥4,100

You recorded paid
¥2,000 equivalent
```

Do not tell the user that Settlement was “reopened”.

Just update the current amount.

---

# 11. Multi-currency payment UX

Each Journey may have a default settlement currency, but payment may occur in another currency.

Example:

```text
Amount due
CNY ¥1,000

Payment currency
[ NZD ▼ ]
```

---

## 11.1 Never wait for the 30-second rate worker

The payment screen must respond immediately.

Priority:

1. cached reference rate for the requested pair/date;
2. most recent usable reference already stored locally;
3. last available market reference with its actual date;
4. no reference available — still allow manual entry.

Example:

```text
Reference rate
1 NZD ≈ 4.12 CNY

18 Sep · cached
```

or:

```text
Latest available reference
1 NZD ≈ 4.11 CNY

17 Sep
```

The app should refresh in the background when online.

If a newer rate arrives while the screen is open, update the reference gently without resetting user input.

Provide an optional manual refresh control if useful.

Never make the user sit on the screen waiting for a scheduled worker.

---

## 11.2 Actual amount paid / received

Payer enters:

```text
Amount paid
NZ$240.00
```

Receiver may independently enter:

```text
Amount received
NZ$238.50
```

For each record the system may show:

```text
Reference equivalent
≈ ¥988.80
```

The user may optionally edit the settlement-currency equivalent that this payment represents.

---

## 11.3 Reference FX is informative, not authoritative

Market FX is a reference.

A real-world payment should not be rejected because it differs from market FX.

The product may show:

```text
Reference rate
1 NZD ≈ 4.12 CNY
```

and optionally:

```text
Your recorded equivalent
1 NZD = 4.1667 CNY
```

Do not use alarming mismatch language for small or expected differences.

---

# 12. Personal Settlement Statement & “Looks good”

`Looks good` should not be a casual dashboard button.

The user first intentionally opens:

```text
Review my settlement
```

This opens a compact personal statement, preferably a full-screen sheet/page.

Example:

```text
Your settlement so far

Paid for group              ¥12,450
Your share                   ¥3,901
Current balance             +¥8,549

Payments you recorded
Paid / received                 ...

Changes since last review
1 expense changed             +¥320
```

Then provide links:

```text
View spending
View shares
View changes
```

At the bottom:

```text
[ Looks good ]
```

This means:

> I reviewed this personal statement at this point in time.

It does not mean every source expense is permanently approved.

---

## 12.1 After later changes

If relevant data changes:

```text
Updated since you reviewed

Your balance changed by +¥320
```

`Review changes` opens a concise delta statement:

```text
Since your last review

Hotel Reykjavík
Your share
¥820 → ¥1,140
Change +¥320

Reason
Split changed from 6 people to 5 people
```

After the user reviews the delta:

```text
[ Looks good ]
```

again.

No full re-review is required.

---

# 13. What changes trigger review impact

Financially meaningful:

- total amount;
- currency;
- payer;
- participant list;
- split method;
- split values;
- settlement valuation;
- payment record amount if the user tracks payments;
- recorded settlement equivalent.

Normally non-financial:

- description correction;
- note update;
- photo/receipt metadata;
- category name changes with no monetary effect.

Only affected members should see settlement-change messaging.

---

# 14. Final confirmation

Final confirmation means:

> The organizer confirms that the current settlement calculation should become a stable historical settlement version.

User-facing CTA:

```text
Confirm final amounts
```

---

## 14.1 Member review never blocks final confirmation

Example organizer view:

```text
Final amounts ready

Reviewed
✓ Leo
✓ Caroline
✓ TX

Not reviewed
• Bao
• Grace
• Mary
```

This is information only.

Organizer may continue.

Confirmation dialog:

```text
Confirm final amounts?

126 shared expenses are included.

3 members haven't reviewed their settlement.
You can still continue.

The confirmed result will remain in settlement
history. Later corrections create an updated version.

[ Cancel ]
[ Confirm final amounts ]
```

Default philosophy: **lenient**.

---

# 15. Expense protection after final confirmation

Do not expose:

```text
Finalize expense
```

Instead:

```text
Included in final settlement

This expense is part of the confirmed final amounts.
```

The source expense is protected because it contributes to a stable confirmed settlement version.

Protection is system-derived.

---

# 16. Corrections after final confirmation

Organizer can choose:

```text
Make corrections
```

Do not use:

```text
Unlock finalized settlement
```

Warning:

```text
This settlement has already been confirmed.

You can make corrections, but the previous confirmed
settlement will remain in history.

Any changes will create an updated settlement.
```

Payments/evidence remain preserved.

---

# 17. Settlement Transfer Detail

A transfer detail page should be simple.

Example:

```text
Gudrún María → Leo

Current amount
¥1,457,753
```

Then:

```text
Your records
Paid / received ...

Other member's records
...   (only if available)
```

Payment history:

```text
18 Sep
NZ$120,000
Attachment available

21 Sep
NZ$...
```

Primary actions depend on perspective:

```text
Record payment
```

or:

```text
Record amount received
```

Optional:

```text
Add attachment
```

Secondary:

```text
Why this amount?
```

Avoid turning Transfer Detail into a negotiation state machine.

---

# 18. Attention and Review relationship

Settlement should surface only Review findings that affect settlement understanding or final confirmation.

Examples:

### Exchange rate waiting

```text
Waiting for exchange rate

ISK 12,800 · 18 Sep

Nothing you need to do.
We'll update this automatically.
```

### Human-raised share issue

```text
This share was questioned

Hotel Reykjavík

Review >
```

### Expense inconsistency

```text
This expense needs review

Review >
```

Canonical resolution remains in **Ledger Review**.

---

# 19. Suggested screen hierarchy

```text
Ledger
└── Settlement
    ├── Summary
    │   ├── Current / Final balance
    │   ├── Updated since review
    │   ├── Calculation explanation
    │   ├── Needs attention
    │   └── Review my settlement / Confirm final amounts
    │
    ├── Spending
    │   ├── Member selector
    │   ├── Paid total
    │   ├── Category accordion
    │   └── Optional full expense browser
    │
    ├── Shares
    │   ├── Member selector
    │   ├── Share total
    │   ├── Category accordion
    │   ├── Inline share rows
    │   └── Expense detail
    │
    └── Payments
        ├── Mine / Everyone
        ├── Recommended transfers
        ├── Record payment / received
        ├── Optional evidence
        └── Transfer detail
```

External but linked:

```text
Ledger Review
└── settlement-impacting findings
    ├── system finding
    └── human-raised finding
```

---

# 20. Core journey scenarios

## Scenario A — Normal journey in progress

1. Expenses are being recorded.
2. User opens Settlement.
3. They see Current balance.
4. They may inspect Spending or Shares.
5. They may ignore review entirely.
6. They may never record payments in OTR.

---

## Scenario B — Member sends an advance payment

1. Current amount due = ¥3,200.
2. Member sends NZ$300 offline.
3. They may optionally record it.
4. They may attach proof.
5. New expenses later change current amount.
6. Existing payment record remains.

No confirmation loop is required.

---

## Scenario C — Receiver sees a different amount

1. Payer records NZ$300 sent.
2. Receiver records NZ$295 received.
3. OTR may display both records and the difference.
4. No forced in-app negotiation starts.
5. Participants resolve the difference offline if necessary.
6. Either side may attach evidence.

---

## Scenario D — User reviews, then an expense changes

1. User intentionally opens **Review my settlement**.
2. They inspect the personal statement.
3. They tap **Looks good**.
4. Later a split changes and affects them.
5. Summary immediately shows the delta.
6. They review only what changed.
7. They may tap **Looks good** again.

---

## Scenario E — Member questions a share

1. Member expands Shares.
2. They see the key information inline.
3. They tap **Something looks wrong**.
4. OTR creates a human-raised finding in Ledger Review.
5. Creator and organizer are the main actionable roles.
6. Affected participants see relevant updates if their financial result changes.

---

## Scenario F — Final confirmation with members not reviewed

1. System has no blocking settlement findings.
2. Some members reviewed; many did not.
3. Organizer sees the review coverage.
4. Organizer may still confirm final amounts.
5. Stable settlement history is created.

---

## Scenario G — Error found after final confirmation

1. Someone reports a mistake.
2. Organizer chooses **Make corrections**.
3. Previous final result remains in history.
4. Source data is corrected.
5. Updated final result is created.
6. Payment records and evidence are preserved.

---

# 21. UX copy guide

Prefer:

- Current balance
- Final balance
- You should receive
- You need to pay
- Paid for group
- Your share
- Updated since you reviewed
- Needs attention
- Nothing you need to do
- Review changes
- Review my settlement
- Looks good
- Record payment
- Record amount received
- Add attachment
- Ready to finish
- Confirm final amounts
- Make corrections
- Included in final settlement

Avoid:

- Draft settlement
- Settlement state
- Pending approval
- Invalidated review
- Finalized expense
- Locked expense
- Reopen state
- Rate required
- Blocking finding
- Pending counterparty confirmation
- Payment dispute state

---

# 22. Product rules to preserve

1. **Current balance is useful throughout the journey.**
2. **Payment tracking is optional.**
3. **Payment records are personal records owned by the member who entered them.**
4. **There is no system-wide authoritative payment total that requires both sides to agree.**
5. **The counterparty may view the other side's entered records from the relevant payable/receivable relationship.**
6. **Payer and receiver may independently record different real-world amounts.**
7. **Those differences do not automatically create a dispute or Review finding.**
8. **Payment records do not change the canonical settlement calculation.**
9. **Payments can happen before final confirmation.**
10. **Partial and advance payments are supported.**
11. **Payment evidence is optional and may be added by either side to their own records.**
12. **Different payment currencies are allowed.**
13. **FX references appear immediately from cache / latest available data and refresh asynchronously.**
14. **Market FX is informative, not automatically authoritative.**
15. **Member review is always optional.**
16. **“Looks good” occurs only after intentionally opening a personal settlement statement.**
17. **Changes trigger targeted delta review, not full re-review.**
18. **All anomalies / objections use the canonical Ledger Review system.**
19. **Expense creator and organizer are the primary correction actors before final confirmation.**
20. **Organizer may confirm final amounts without unanimous review.**
21. **Final confirmation creates stable history.**
22. **Organizer may later make corrections.**
23. **Corrections do not silently rewrite previous final history.**
24. **Existing payment records and evidence survive corrections.**
25. **No user manually finalizes an individual expense.**
26. **Technical state-machine vocabulary stays out of normal UI.**

---

# 23. Technical concepts the product expects but does not expose

Implementation will likely need some form of:

- settlement calculation revision;
- final settlement snapshot/version;
- optional member review checkpoint;
- affected-member change detection;
- human-raised Review findings;
- system-generated Review findings;
- user-owned outgoing payment records;
- user-owned incoming/received payment records;
- counterparty visibility without bilateral confirmation;
- optional payment evidence;
- FX reference metadata and local cache;
- settlement-impacting finding filter;
- protected source expenses;
- reopen/correction versioning;
- audit history.

Exact implementation is a technical decision, but behavior must preserve this specification.

---

# 24. Items for technical audit

Before implementation, Codex should audit:

1. Current settlement calculation model.
2. Current `finalize` behavior.
3. Whether expenses are directly marked/locked as finalized.
4. Who currently has permission to finalize.
5. Existing settlement snapshot/version semantics.
6. Existing share model.
7. Existing payment / received records.
8. Whether payment records currently require bilateral confirmation.
9. Whether current schema assumes one authoritative payment event versus user-owned records.
10. Partial-payment support.
11. Current multi-currency payment support.
12. FX reference and 30-second background refresh behavior.
13. Local FX cache availability.
14. Review/finding integration.
15. Existing human-mark functionality and whether it can be reused for **Something looks wrong**.
16. Current creator/organizer edit and notification permissions.
17. Existing audit trail.
18. Current correction behavior after finalization.
19. SQLite / Supabase schema implications.
20. Offline behavior for settlement/payment/review.
21. Sync/conflict handling when a member edits their own payment records.
22. Visibility rules allowing the counterparty to view another member's payment records.
23. Attachment support for payment records.
24. How current Settlement UI maps onto this product spec.
25. Whether Spending/Settlement header and secondary sticky navigation can be implemented cleanly.
26. Whether inline expandable category/share lists can reuse existing Ledger row components.

The audit should identify:

- already-supported capabilities;
- incompatible current behavior;
- schema changes required;
- API changes required;
- UI-only changes;
- migration risks;
- backward compatibility concerns.

---

# 25. Recommended next document

After Product/UX approval, produce:

`docs/ledger/SETTLEMENT_2_0_IMPLEMENTATION_PLAN.md`

That document should be technical and must not redefine product behavior.

It should be derived from:

1. this Product & UX Specification;
2. a read-only audit of the current implementation.

---

# 26. Product acceptance test

A successful Settlement 2.0 should allow a traveler who knows nothing about internal state machines to immediately understand:

- what they currently owe or receive;
- why;
- what they paid for the group;
- what their own shares are;
- what changed since they last checked;
- whether anything needs attention;
- whether they personally need to do anything;
- who should pay whom;
- how to optionally record a real-world payment;
- how to use another currency without waiting for a background rate job;
- how to question a share using the same Review system as the rest of Ledger;
- and when the organizer can confirm final amounts.

If the UI requires the traveler to understand revisions, states, locks, confirmation workflows or accounting mechanics, the UX is too complex.

---

## End of v0.2
