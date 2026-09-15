# Ledger UI/UX Polish Plan V1

Status: planning only  
Date: 2026-09-14  
Primary inputs: `LEDGER_UI_UX_AUDIT.md`, current repository-backed Ledger UI, `Europe 2026 Replay`, `Europe 2026 UI Polish`, and the approved human directions captured for this plan.

## 1. Scope and non-negotiable boundaries

This plan changes the presentation and interaction model of Ledger 2.0. It does not change Ledger financial or domain semantics.

- Keep SQLite as the local UI source of truth and keep all reads/writes behind existing repositories, domain logic, and sync coordinators.
- Do not change Backend endpoints, schemas, Supabase data, settlement algorithms, split arithmetic, rate rules, conflict rules, revision rules, or payment lifecycle semantics to simplify UI work.
- Do not introduce a global state framework, FTS, a new cache, materialized analytics, or a new list implementation while current evidence does not require one.
- Do not copy legacy Web architecture or behavior. Legacy UI may only be consulted for limited visual hierarchy reference.
- Do not delete or mutate acceptance Journeys, synthetic Journeys, `Europe 2026 Replay`, or `Europe 2026 UI Polish` as part of polish work.
- Do not begin Production planning.

The central product promise for this work is:

> A person must always know which Journey and scope they are viewing, what the money means, what needs action, and whether the screen is showing current cached data or an update in progress.

## 2. Approved product direction

The following directions are treated as approved and do not need to be redesigned during implementation:

1. Ledger opens as a Journey Ledger dashboard, not a module toolbar followed by a long Expense list.
2. Spending and Settlement are the two primary Journey-level modes.
3. Mine and Group are subordinate scopes inside Spending. Use a compact, visually secondary system segmented control because the choice is frequent, binary, and benefits from one-tap comparison. Do not stack it as a second equal-weight top-level tab.
4. The navigation bar provides Search and Add Expense actions. Search is a dedicated Expense-results experience, not a permanent dashboard card.
5. Journey selection uses a searchable native sheet/list with title, date range, lifecycle, and selected state.
6. A top-left Ledger menu provides global destinations: My Ledger, Review, Ledger Settings, and Developer/Diagnostics when enabled.
7. Spending begins with scan-friendly summaries, then attention, then a limited Recent Expenses list.
8. Category buckets drill into the same filtered Expense-results model used by Search; filters remain visible and removable.
9. Filter is a toolbar action opening a sheet/form. Its active state is always visible through tint and count.
10. Settlement is transfer-first: who pays whom and how much. A transfer pushes to focused detail; implementation lineage stays out of normal UI.
11. Ordinary UI is quiet about healthy raw states such as `ACCEPTED` and `SYNCED`.
12. Raw IDs, revisions, cursors, queue state, fixture controls, and acceptance Journeys belong in a future Developer/Diagnostics Mode.
13. Selected context and its financial projection commit atomically. New context with old money is prohibited.
14. `+ Expense` begins with intent: `Add manually` or `Scan receipt`. Receipt-first OCR is a first-class entry path, but OCR suggestions never mutate financial facts without explicit review and confirmation.
15. Manual entry defaults to Today, the current member as payer and sole participant, the appropriate existing Journey/recent currency, the Ledger Settings split method, and canonical settlement participation `INCLUDED`. UI polish must not redefine those domain defaults.

## 3. Proposed information architecture

```text
Ledger
├─ Global Ledger menu
│  ├─ My Ledger
│  ├─ Review
│  ├─ Ledger Settings
│  └─ Developer / Diagnostics (when enabled)
├─ Journey selector sheet
└─ Journey Ledger
   ├─ Spending
   │  ├─ Mine / Group scope
   │  ├─ Dashboard
   │  │  ├─ Primary spending total
   │  │  ├─ Category summary
   │  │  ├─ Settlement snapshot
   │  │  ├─ Attention
   │  │  └─ Recent Expenses (12) → See All
   │  ├─ Search / filtered Expense results
   │  │  └─ Filter sheet
   │  ├─ Analysis → filtered Expense results
   │  └─ Expense
   │     ├─ Entry intent
   │     │  ├─ Add manually → Create
   │     │  └─ Scan receipt → OCR suggestions → Review & confirm
   │     ├─ Detail → Activity
   │     ├─ Create / Edit → More Details
   │     ├─ Payer / participants / split editor
   │     └─ Receipt capture / attachment
   └─ Settlement
      ├─ Overview
      ├─ Transfer detail
      │  └─ Payment sheet
      ├─ Adjustment
      └─ Statement / export
```

Twelve Recent Expenses is recommended. With the observed long multilingual titles and secondary metadata, 12 gives a useful recency scan without turning the dashboard into history. It is also well below the current 30-row dashboard query and 100-row Search mount. “See All” opens the complete virtualized result list. This count is presentation policy, not a repository limit.

## 4. Dashboard hierarchy

### Navigation and persistent context

- Navigation bar: top-left Ledger menu; title `Ledger`; top-right Search and Add Expense icons with accessibility labels.
- The Journey selector is the first content row and remains visible in the compact sticky dashboard header after scrolling. It shows Journey title plus concise date/lifecycle context.
- Spending/Settlement is the primary mode control. It remains with the Journey context when the large header collapses.
- Mine/Group appears only inside Spending, below the Spending heading or within the total card header. It uses smaller type/background treatment than the primary mode control.

### Spending content order

1. Primary total: one dominant amount and an explicit scope phrase, for example `You spent` or `Group spent`.
2. Category summary: top categories, proportional or ranked, each tappable. “See analysis” opens the full analysis view.
3. Settlement snapshot: compact `You owe`, `You are owed`, or `All settled` summary; tap opens Settlement. It must not imply a finalized result when only a preview exists.
4. Attention: render only actionable states, such as needs rate or conflict. Do not show a healthy-state banner.
5. Recent Expenses: 12 rows, then `See All`.

### Expense-row scan order

- Mine lists omit Expenses when the current member has no split or an explicit zero share;
  unresolved personal shares remain visible until their amount can be valued.
- Primary: merchant/title and amount.
- Secondary: category and user-friendly Expense date.
- Tertiary when useful: payer and participant count/context.
- Exceptional and only when actionable: `Needs exchange rate`, `Conflict—review required`, `Waiting to sync`.
- Receipt: subtle paperclip plus VoiceOver label when `hasReceipt` is true; no list thumbnail.
- Silent healthy states: accepted, synced, normal inclusion, raw rate source, revision.

## 5. State consistency and performance plan

### 5.1 Current cause of delayed and jumping values

The problem is state ownership and commit order, not slow arithmetic.

| Flow                | Current ownership/query behavior                                                                                                                                                                                                    | Visible risk                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spending Mine/Group | `scope`, `memberId`, `summary`, and `expenses` are independent state. The segment commits immediately; `summarize` and `listExpenses` then complete and commit separately from the selection.                                       | New Mine/Group selection can display old totals and rows. No request identity check means an older request may finish last and overwrite a newer selection. |
| Journey switch      | Selected Journey is stored and displayed before actor, summary, and recent Expenses are loaded. Background `refreshJourney`/`refreshPersonal`, `loadContext`, and `loadReport` can overlap the selection-triggered query.           | New Journey title can display the previous Journey's financial projection; overlapping refreshes can cause a second jump.                                   |
| Analysis            | `scope`, `dimension`, buckets, currency, and scale are independent. Each scope/dimension change starts an uncancelled query.                                                                                                        | New controls with old buckets; rapid changes can accept stale completion order.                                                                             |
| Search              | Every text/filter change re-runs rows, summary, filter options, and Journeys. Results and filter/query state commit independently; there is no debounce or stale-response protection.                                               | Excess work while typing, old result overwrite, and active controls that do not match totals/rows.                                                          |
| My Ledger           | Period changes before its rows reload and remote refresh can trigger another reload.                                                                                                                                                | New period can briefly show old cross-Journey positions.                                                                                                    |
| Settlement          | The hook has an effect-level `active` guard, so obsolete effects are less likely to commit after cleanup. However, prior Journey `finalized`, lineage, actor, and exports remain visible until the new Journey cache read resolves. | New Journey context can briefly contain the old Journey settlement. Remote refresh can make content jump without a clear updating state.                    |

The existing repository performance evidence rules out a new data architecture as the first response:

- Representative 10,000-Expense SQLite reporting query: about 62 ms, below the 250 ms target.
- Replay bootstrap: about 2.926 s; this is a first network/cache population case, so cached-first presentation matters.
- Replay Settlement preview: about 669 ms; this warrants local progress or a skeleton, not a new analytics/cache layer.
- `Europe 2026 UI Polish`: 133 Expenses. The data query is viable, but mounting 100 Search rows or all Review findings in `ScrollView` is not a scalable UI strategy.

### 5.2 Atomic projection rule

Use this invariant on every financial view:

> The committed selection key and the financial projection produced for that exact key are one UI state and commit together.

A projection key contains only inputs that change its meaning, for example:

```text
Spending:   journeyId + memberId + scope
Analysis:   journeyId + memberId + scope + dimension + date range
Search:     journeyId + memberId + scope + applied filters + debounced query
My Ledger:  memberId + period
Settlement: journeyId + settlement version/view kind
```

Implementation direction, without business-semantic changes:

1. Represent the committed view as one screen-local object: `{ key, data, status }`. Do not add a global store.
2. Keep a requested/pending key separately only for input feedback. The control must not present the pending choice as fully selected while old financial data remains underneath.
3. Fetch the complete projection for the requested key from existing repositories, preferably concurrently where independent.
4. Give each request a monotonically increasing token or compare its serialized key to the latest requested key. Ignore completions that are no longer current.
5. Commit `{ key, data }` with one state update only when all minimum screen data for that key is ready.
6. A same-key background refresh keeps cached content visible with a small `Updating…` affordance. A different-key transition must hide the prior financial projection or retain the prior committed selection until the new projection is ready.
7. Start with direct screen-local code. Extract a small shared keyed-projection helper only after at least three screens prove identical; do not create a state framework for hypothetical reuse.

Recommended interaction semantics:

- Mine/Group and Analysis changes: leave the committed segment selected, show progress on the requested option, then swap selection and projection together. If the query fails, retain the prior selection/data and announce the failure.
- Journey change: close the sheet after selection, show a compact skeleton for the new Journey financial sections, and never reuse another Journey's money. Commit Journey header and cached projection together. Persist the selected Journey after a valid local projection is available; a persistence error restores the previous committed context.
- Search field: text echoes immediately. Debounce 200 ms, then query only rows/summary. Filter options and Journey metadata load once per Journey. Invalidate stale requests. During the matching query, retain layout with result-row skeletons and suppress stale totals; do not label old rows as the new query's results.
- Filter sheet: edits are drafts. `Apply` starts one query; filter badges/chips and result projection become active together. Removing an active chip is also an applied transition with stale-response protection.
- My Ledger period: same atomic period/projection rule as Mine/Group.
- Settlement Journey switch: immediately prevent prior Journey settlement content from rendering under the new Journey. Read existing SQLite finalized state first, then show same-key cached content while remote refresh runs.

### 5.3 Loading, caching, list, and navigation policy

| Situation                 | Presentation                                                                                                                         | Data behavior                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| First local render        | Screen-shaped skeleton only for sections with no matching cached result. Navigation and context remain usable.                       | Read SQLite first. Do not wait for network authentication/refresh.                                                      |
| Warm tab return           | Restore matching cached projection and scroll immediately; small refresh indicator only if updating.                                 | Avoid redundant metadata/options reads; refresh through existing coordinator.                                           |
| Journey switch            | New Journey header plus matching skeleton, or keep prior committed context until cache is ready. Never cross-pair context and money. | Cancel/ignore stale work; local repository projection first, network second.                                            |
| Search typing             | Immediate text; results update after 200 ms debounce.                                                                                | Query rows/summary only; ignore older completions. No FTS until measured substring search fails its target.             |
| Filter application        | Draft in sheet; one atomic apply. Active count and removable chips remain visible on result screen.                                  | One keyed query after Apply; retain options for Journey.                                                                |
| Analysis scope/dimension  | Local progress in selected control; bucket skeleton if no matching cache; retain scroll only for the committed view.                 | Ignore stale completions; prefetch only the directly likely category drill-down if instrumentation later proves useful. |
| Settlement cached view    | Immediate matching SQLite settlement; `Updating…` for remote refresh.                                                                | Keep current-key content. Never show another Journey's cached settlement.                                               |
| Settlement remote preview | Transfer-row skeleton/local progress for the observed ~669 ms request; actions disabled only where their result depends on preview.  | Use existing preview endpoint/coordinator; no speculative cache layer.                                                  |
| Long Expense/Review lists | `FlatList`/existing native virtualized list, stable keys, repository pagination, empty/footer components.                            | Do not request/render the whole history. Dashboard stays at 12; results page paginates.                                 |
| Push → back               | Preserve query, applied filters, scope/dimension, and list scroll.                                                                   | Keep screen in navigation stack; no global store needed.                                                                |

Prefetch is not part of the first implementation slice. Add only a narrow prefetch for a demonstrated high-frequency next screen, such as the current Journey's filter options, after measuring navigation latency. Never prefetch remote Settlement previews because they have meaning, freshness, and potential authorization implications.

## 6. Screen specifications

### 6.1 Journey Ledger — Spending dashboard

- Purpose: answer which Journey, personal/group spending, categories, settlement picture, attention, and recent activity in one scan.
- Primary: committed Journey, committed Mine/Group scope, total, top categories, current settlement snapshot.
- Secondary: actionable attention and 12 Recent Expenses.
- Navigation bar: Ledger menu; Search; Add Expense.
- Sticky: compact Journey selector and Spending/Settlement context; Mine/Group remains visible near the Spending summary but visually subordinate.
- Scrollable: summary cards, categories, attention, recent list.
- Bottom toolbar: none; the primary create action stays in the navigation bar.
- Relationships: Journey selector is a sheet; categories/See All/search/Expense/Settlement are pushes.
- States: cached-first; screen-shaped skeleton only without matching cache; offline label preserves usable content; error retains last matching projection with Try Again; empty Journey offers Add Expense.

### 6.2 Journey selector

- Purpose: choose the Journey Ledger without exposing test inventory to ordinary users.
- Primary: searchable Journey list with title, localized date/range, ACTIVE/UPCOMING/PAST, selected checkmark.
- Secondary: lifecycle sections or sensible recency ordering; no raw IDs.
- Navigation bar: title `Choose Journey`, search field, Done/Cancel according to native sheet behavior.
- Sticky: search and optional lifecycle scope.
- Scrollable: virtualized Journey rows.
- Bottom toolbar: none.
- Relationships: sheet from dashboard; selection returns to dashboard after matching cached projection is ready.
- States: local list first; empty explains there are no available Journeys; offline does not block cached Journeys; failed refresh is non-blocking.

Ordinary Release UI excludes acceptance/synthetic Journeys using an existing or narrowly added local presentation classification, not title substring heuristics. Dev builds may enable `Show test Journeys` automatically. Until a reliable classification is available, do not silently hide rows: gate the hiding change on the Developer Mode decision.

### 6.3 Global Ledger menu

- Purpose: reach cross-Journey or administrative destinations without competing with daily spending.
- Primary: My Ledger, Review, Ledger Settings.
- Secondary: Developer/Diagnostics only when enabled, with an obvious non-production visual treatment.
- Navigation bar/sticky/scroll: system menu from the top-left action; if descriptions or badges outgrow a menu, use a compact sheet/list rather than a custom drawer.
- Bottom toolbar: none.
- Relationships: destinations push; Developer Mode can be enabled from Settings after approval.
- States: Review badge appears only for actionable findings; no healthy-state counts.

### 6.4 Expense Search and filtered results

- Purpose: search all Expenses in the committed Journey/scope and host reusable filtered drill-down results.
- Primary: native search field, result count/summary, Expense rows.
- Secondary: active removable filter chips; result-origin label such as `Category: Food` when entered from Analysis.
- Navigation bar: Search title/back; Filter button with tint and active-count badge.
- Sticky: search field and a compact horizontal row of active filters only; not all available filters.
- Scrollable: virtualized paginated results.
- Bottom toolbar: none.
- Relationships: Filter sheet; Expense detail push; Analysis category/day buckets push into this same screen/model.
- States: 200 ms debounce and stale-response rejection; matching skeleton while query changes; offline cached results; empty gives Clear Filters or Add Expense; failure retains prior committed results and offers Try Again.

### 6.5 Filter sheet

- Purpose: build understandable Expense filters without crowding Search.
- Primary: date, category, payer, participant, currency.
- Secondary/Advanced: actionable business state only; raw sync/conflict dimensions move to diagnostics unless there is a user task.
- Navigation bar: Cancel and Apply; title includes active draft count if useful.
- Sticky: none; grouped native Form sections.
- Scrollable: form fields.
- Bottom toolbar: optional full-width Clear All only when filters exist; Apply remains navigation action.
- Relationships: date presets/pickers and searchable member/currency selectors may use nested sheets/pushes.
- States: draft changes never alter results until Apply; validation is inline; offline has no effect because options are local.

Date priority: exact date, custom range, Today, Yesterday, This Trip. `Last 30 days` may exist as a secondary preset but is not the primary interaction.

### 6.6 Analysis and drill-down

- Purpose: show where money went by category, day, payer, or participant and lead to verifiable underlying Expenses.
- Primary: committed scope/range/dimension and ranked or chronological buckets with amount/count.
- Secondary: percent of total where useful; no raw aggregate diagnostics.
- Navigation bar: title/back; Filter/date range action.
- Sticky: compact dimension control and range label. Use a segmented control only for the few most-used dimensions; put remaining dimensions in a Menu.
- Scrollable: bucket list/chart summary.
- Bottom toolbar: none.
- Relationships: bucket pushes the common filtered-results screen; back preserves dimension, range, scope, and scroll.
- States: keyed atomic projection; empty explains the selected range; offline uses SQLite; error retains matching data and Try Again.

Time buckets default to chronological order. If an explicit `Largest first` sort is later approved, label it. The drill-down chip must show the exact day/range, never `Last 30 days` for a day query.

### 6.7 Expense detail and Activity

- Purpose: understand an Expense and take relevant actions without exposing storage implementation.
- Primary: title/merchant, amount/currency, friendly Expense date, payer, split summary, user-relevant state.
- Secondary: category, notes, participants, receipt, rate explanation, settlement inclusion when exceptional.
- Navigation bar: back; Edit; overflow for rare actions.
- Sticky: none.
- Scrollable: detail sections and user-facing activity preview.
- Bottom toolbar: no permanent duplicate actions; context action only when one dominant unresolved task exists.
- Relationships: Edit modal; receipt preview; participant/split detail; Activity push; high-impact settlement participation opens explanatory confirmation sheet.
- States: cached detail first; locally queued edit reads as `Saved on this iPhone—will sync`; deleted/unavailable gives a clear return action; refresh failure never hides cached data.

Activity is a secondary push with human events such as `Amount changed by Alex · Today, 14:32`. Raw revision numbers, UUIDs, digests, and evidence fingerprints remain diagnostics-only.

### 6.8 Create/Edit Expense

- Purpose: begin from the person's intent, make manual entry fast, and retain exact advanced financial controls.
- Entry intent: tapping `+ Expense` first presents two clear native actions: `Add manually` and `Scan receipt`. This can be a compact action sheet/menu because it is a short, mutually exclusive choice. Manual opens the form. Scan opens the receipt-first flow in section 6.10.
- Primary manual hierarchy: Amount; Currency; Title/merchant; Expense date; Paid by; Participants; Split summary; settlement participation when materially relevant; More Details.
- Defaults: appropriate Journey/recent currency under existing approved semantics; Today at calendar-date precision; current member as payer; current member as the only participant; Ledger Settings default split method; canonical settlement participation remains `INCLUDED`.
- Secondary under `More Details`: category, attachment, Notes, and advanced rate/evidence fields when required. Notes are optional when the title already describes the Expense.
- Navigation bar: contextual `New Expense` or `Edit Expense`, Cancel, Save. Remove duplicate page title and duplicate bottom Save.
- Sticky: amount/title remain at the top; no sticky technical state.
- Scrollable: native Form sections with progressive disclosure.
- Bottom toolbar: none.
- Relationships: payer/participants/split, category, currency, and date use native menu/picker/sheet patterns; attachment uses the system source menu without implying OCR; Scan receipt uses its separate capture-first review flow.
- States: draft remains local; dirty dismissal confirms; saving disables only duplicate submission; local success dismisses immediately and shows queued-sync state in detail/list; validation is inline; offline is normal.

Quick entry uses current Journey/Ledger defaults and existing domain validation. It must not guess a split, rate, participant, or settlement rule that current semantics do not already define. Future Trip/Itinerary context may prefill the date and related context, but that integration is explicitly outside this Ledger polish.

Current implementation gaps to account for in P4:

| Area                     | Current behavior                                                                                            | P4 constraint                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry                    | `+ Expense` opens the form directly                                                                         | Add the intent choice before either path; no financial record is created by choosing a path.                                                                         |
| Participants             | A new Expense selects all active Journey members                                                            | Change UI draft initialization to current member only; do not alter stored split semantics.                                                                          |
| Split default            | New draft hard-codes equal per person; no implemented Ledger Settings source was found                      | Use an existing approved settings source if one exists by implementation time; otherwise stop for the narrow product/config decision rather than invent persistence. |
| Currency default         | New draft currently uses Journey settlement currency; supported ISO metadata supplies code/scale validation | Keep Journey currency as the safe fallback. Use recent currency only if an approved existing preference/precedence source exists; do not infer one heuristically.    |
| Date                     | New draft starts from the current instant and validates an ISO date-time                                    | Present Today as calendar-date input while preserving a contract-compatible stored value without claiming fabricated time precision in UI.                           |
| Settlement participation | Domain/form default is already `INCLUDED`                                                                   | Preserve it. Conditional control visibility changes comprehension only.                                                                                              |

### 6.9 Participant and split editor

- Purpose: select participants and verify exact shares before saving.
- Primary: participant selection and final amount per person; total/residual confirmation.
- Secondary: split mode and mode-specific values.
- Navigation bar: Cancel/Done; title `Split Expense`.
- Sticky: total Expense amount and allocated/remaining summary.
- Scrollable: virtualized member list, then mode-specific controls.
- Bottom toolbar: none unless Done cannot remain visible in the navigation bar.
- Relationships: the quick form shows only a compact participant summary and allocation summary. Tapping Participants opens a dedicated member-selection sheet with checkbox semantics; tapping Split opens this editor. Split mode uses a compact picker/menu rather than five expanded panels.
- States: invalid totals explain the exact remainder; no network dependency; long names and Dynamic Type reflow rather than shrink.

The initial participant is the current member only. Do not render the full Journey member list in quick entry. `Paid by` also defaults to the current member; long names truncate with an accessible full label or reflow at large text sizes instead of expanding the row without bound.

Apply the Ledger Settings default split method automatically and display the resulting member allocations as a compact summary. The dedicated Split editor contains the existing supported modes. It never changes the default method merely because the participant set changes.

Do not change canonical settlement participation from `INCLUDED` to `EXCLUDED` as a UI shortcut. For a one-person Expense, keep the domain value but omit or de-emphasize the control because there is no meaningful inter-member debt. Once multiple participants are selected, expose a clear choice:

- `Included in group settlement`: participant shares affect who owes whom.
- `Not included in group settlement`: the Expense and participant consumption remain in Spending/analysis, but do not create inter-member debt.

Changing this value is not a preference Switch. Use a disclosure row showing current meaning, then a confirmation sheet/dialog that states the consequence and requires explicit confirmation. If current domain rules require a reason, collect it there. Do not calculate a new impact preview in UI unless an existing repository/domain result already supplies it. Any change to the canonical default requires separate product approval.

### 6.10 Date, currency, category, and receipt controls

- Date: default ordinary entry to Today and calendar-date precision. Use a native date picker and do not require time. Preserve true date-time precision when editing a source that already has it; do not fabricate a time for new ordinary Expenses.
- Currency: searchable native sheet/list using the existing supported, versioned ISO 4217 metadata. Show code and any name/symbol already supplied by that metadata; do not create a second currency catalogue. Default according to existing approved Journey/recent-currency semantics.
- Category: use the approved category Menu/Picker and do not accept uncontrolled spelling variants. Future title-based category suggestions are desired but out of scope unless separately approved.
- Manual attachment: optional under More Details. Use the system source Menu (`Camera`, `Photo Library`, `Files` where supported) and native preview. Attaching a file does not automatically enqueue or require OCR.
- Scan receipt: first-class capture/import path. Save the selected image locally, run the existing Stage 5 upload/OCR lifecycle when available, show structured suggestions in a reviewable draft, and require the user to explicitly confirm fields through the existing Expense command path. Suggestions never choose or mutate payer, participants, split, rate, settlement participation, or any other financial fact automatically. Show Retry only after a relevant failure. Raw storage/upload/OCR enums remain diagnostics-only.

OCR review uses the same manual field hierarchy after prefilling supported suggestions. Every suggested value remains editable, and the final Save/Confirm is the only point at which a financial Expense is created or updated. OCR failure must still allow manual entry from the captured receipt.

The current receipt repository unconditionally enqueues both upload and OCR when importing an asset. That does not satisfy the approved distinction between manual attachment and Scan receipt. P4 therefore requires one narrow asset-pipeline change: receipt import/link must accept explicit OCR intent (or expose separate import-without-OCR and request-OCR operations). Manual attachment queues only the required asset upload/link work; Scan receipt also queues OCR. This changes no Expense financial fact, Backend/schema, or OCR suggestion semantics, but it is not a UI-only change and must receive focused repository/worker regression coverage.

### 6.11 Settlement overview

- Purpose: answer who should pay whom, how much, and what blocks completion.
- Primary: scannable transfer rows `Alex pays Sam` plus amount and user-facing status.
- Secondary: settlement currency, cutoff/date, unresolved rates/conflicts, preview/final state, personal net summary.
- Navigation bar: Journey context/back as appropriate; overflow for Statement/Export; primary `Preview` or `Confirm final settlement` only when valid under frozen semantics.
- Sticky: compact preview/final status and blocker count.
- Scrollable: transfer list first, then concise readiness explanations.
- Bottom toolbar: one context-valid primary action at most.
- Relationships: transfer detail push; adjustment and statement/export pushes; blockers link to Review/Expense when possible.
- States: matching cached finalized settlement first; transfer skeleton for uncached/remote preview; offline explains that preview/final actions need connection while cached information remains visible; errors preserve cached view and offer retry.

Do not expose root settlement, canonical state, lineage, digest, cursor, raw obligation IDs, or integer rounding traces here.

### 6.12 Transfer detail and Payment

- Purpose: explain one payer-to-receiver obligation and complete/confirm its payment lifecycle.
- Primary: payer, receiver, total obligation, paid, remaining, and one clear next action.
- Secondary: human timeline: proposed, marked paid, waiting for confirmation, received; underlying split/Expense explanation on demand.
- Navigation bar: back; overflow only for support/advanced actions.
- Sticky: remaining amount/status summary.
- Scrollable: lifecycle timeline and optional explanation.
- Bottom toolbar: `Mark as paid` or `Confirm received`, never both when the current actor cannot perform both.
- Relationships: payment entry is a focused sheet; underlying Expenses push to detail; evidence statement is a secondary disclosure.
- States: optimistic wording must not claim remote confirmation; offline queued action says `Saved on this iPhone—will sync`; failures retain lifecycle data and a retry path.

### 6.13 Adjustment and Statement/export

- Adjustment purpose: explain why a finalized settlement needs a revision and preview only the changed obligations. It is an organizer/authorized advanced flow, not dashboard content.
- Statement purpose: provide understandable evidence and export/share using existing generated formats.
- Primary: changed transfers/reason for Adjustment; people, amounts, dates, and status for Statement.
- Secondary: rate explanation and included Expense details. Raw lineage/digest can appear only in diagnostics/support export.
- Navigation: separate pushes from Settlement overflow; Cancel/Confirm only where frozen semantics allow.
- Sticky: impact summary for Adjustment; none for Statement.
- Scrollable: changed transfer list or statement sections.
- Bottom toolbar: single confirm for Adjustment; system Share for generated Statement.
- States: preview progress is local; offline generation uses existing capability only; no new export semantics.

### 6.14 Review

- Purpose: resolve concrete Ledger issues, not inspect an acceptance harness.
- Primary: human-readable finding title, affected Expense/Journey, why it matters, and next action.
- Secondary: created time and explanation; no global free-text reason before an action.
- Navigation bar: title/back; Filter only if measured volume needs it.
- Sticky: unresolved count/status scope.
- Scrollable: virtualized finding rows.
- Bottom toolbar: none.
- Relationships: row → finding detail → Expense; Acknowledge/Dismiss asks for a reason only after that action if required.
- States: empty is positive (`Nothing needs review`); offline supports cached review and queued supported actions; error retains rows and Try Again.

Each action remains a separate accessible element. Never mark a parent card containing buttons as one `accessible` element.

### 6.15 My Ledger

- Purpose: show the traveller's cross-Journey pre-settlement position over a selected period.
- Primary: understandable net position and Journey rows.
- Secondary: period and explanation of positive/negative direction.
- Navigation bar: back/title; no Journey-level Add Expense.
- Sticky: compact period selector.
- Scrollable: virtualized Journey positions.
- Bottom toolbar: none.
- Relationships: row pushes the corresponding Journey Ledger.
- States: period/projection commits atomically; cached-first; acceptance Journeys hidden only after Developer Mode strategy is approved.

### 6.16 Ledger Settings and Developer/Diagnostics

- Ledger Settings purpose: Ledger-wide or Journey Ledger configuration such as base/default currency, default split behavior, valuation preferences, `Households & Groups`, and future Ledger preferences. Only settings already supported by approved domain semantics may be exposed.
- Developer/Diagnostics purpose: isolate support and acceptance data from the product experience. Off by default in Release; Dev builds may default it on.
- Navigation: pushes from the global Ledger menu/Settings; grouped native Form.
- Diagnostics content: raw IDs, revisions, sync/queue states, cursors, backend diagnostics, raw rate provenance, acceptance/synthetic Journeys, fake failure controls, and support export.
- Safety: diagnostics must be visually distinct, must not bypass repositories, and must not add mutation controls unless separately approved. Implementation is staged last.

#### Household capability audit and gate

Current capabilities are sufficient to **consume an already configured Household** in Expense splitting:

- Bootstrap and incremental pull include Journey-scoped Household names and member IDs.
- SQLite stores Household/member rows, and `listMembers` exposes each member's `householdId` and `shareUnits`.
- The domain supports `EQUAL_HOUSEHOLD` and deterministic minor-unit residual allocation, then persists exact member-level splits with Household snapshot provenance.
- Expense read/write contracts support equal-household and household-share split methods.

Current capabilities are **not sufficient for a correct user-managed `Households & Groups` flow**:

- There is no Mobile Household management repository/write command or durable queue operation.
- There is no exposed Backend Household create/update/delete command contract or authorization/concurrency workflow.
- The current bootstrap Household contract exposes name/order/member IDs, but not the full documented management model (`defaultSplitStrategy`, editable `memberShares`, creator/revision metadata).
- The current Expense UI can consume member Household association, but cannot correctly create, edit, validate, synchronize, or resolve conflicts for Household definitions.

Therefore P4 may expose `Equal per household` only for valid Household data already available through existing reads. It must disable the mode with a human explanation when any selected participant lacks a Household. Do not build `Ledger → Ledger Settings → Households & Groups` management UI until the missing write contract, permissions, offline queue, revision/conflict behavior, and complete read model receive separate functional/architecture approval. No Household schema or semantic change belongs in UI polish.

## 7. Native interaction decisions

| Interaction            | Recommended semantic pattern                                   | OTR-specific element                           | Why                                                                             |
| ---------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Journey switcher       | Searchable sheet + native list/checkmark                       | Journey row with dates and lifecycle           | Scales beyond an Action Sheet and disambiguates same-title/test Journeys.       |
| Global Ledger menu     | System Menu; sheet/list only if badges/descriptions outgrow it | Review badge and conditional Diagnostics entry | Fast access without a custom drawer or dashboard clutter.                       |
| Search                 | Dedicated pushed screen with native search-field behavior      | Repository-backed Expense result row           | Search belongs to the list task and preserves back-stack state.                 |
| Filter                 | Toolbar button + grouped sheet/Form + Apply                    | Active count and removable filter chips        | Separates draft from applied state and makes filtering unmistakable.            |
| Mine/Group             | Small system segmented control                                 | Scope phrase in summary                        | Binary, frequent, one-tap comparison; subordinate styling preserves hierarchy.  |
| `+ Expense` intent     | Compact system action sheet/menu                               | `Add manually` / `Scan receipt`                | Makes capture-first a peer entry path without building a custom launcher.       |
| Expense create/edit    | Native modal/Form, Cancel/Save in navigation                   | Split summary and offline save message         | Matches iOS editing semantics and keeps the 80% path short.                     |
| Participants/split     | Sheet/push, checkbox rows, picker/Menu for split mode          | Allocated/remaining money summary              | Preserves exact financial confirmation without expanding all advanced controls. |
| Date/currency/category | DatePicker, searchable selection sheet, Menu/Picker            | Existing supported values/defaults             | Reduces invalid free text and respects locale.                                  |
| Scan receipt           | System camera/photo/file source → reviewable draft             | Existing Stage 5 OCR suggestion card           | Separates evidence capture from explicit financial confirmation.                |
| Settlement transfer    | Overview list → focused push                                   | OTR transfer status timeline                   | Makes payer/receiver/amount primary while retaining full lifecycle evidence.    |
| Payment                | Focused sheet with one actor-valid action                      | Offline queued-state copy                      | Prevents ambiguous competing actions and false confirmation.                    |
| Review                 | Virtualized task list → detail → Expense                       | Human finding explanation/actions              | Turns diagnostics into a resolvable workflow and fixes nested accessibility.    |
| Settings               | Grouped native Form                                            | Ledger/Journey configuration sections          | Keeps configuration separate from daily money tasks.                            |

## 8. Product language policy

English meanings are defined first. Localized strings are not finalized in this plan.

| Raw/domain term          | Normal user language                                                   | Advanced explanation                                                                  | Debug-only raw                     |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| `ACCEPTED`               | Silent; show the Expense normally                                      | `Included in Ledger totals` only when explaining eligibility                          | `ACCEPTED`                         |
| `SYNCED`                 | Silent                                                                 | `Saved to the group` if the user asks about availability                              | `SYNCED`, cursor/queue state       |
| `RATE_REQUIRED`          | `Needs exchange rate`                                                  | `Add or confirm a rate before this Expense can be included in converted totals`       | `RATE_REQUIRED`                    |
| `MANUAL_AGREED`          | `Agreed exchange rate`                                                 | `A traveller or organizer confirmed this rate`                                        | `MANUAL_AGREED`, raw provenance    |
| `REFERENCE_RATE`         | `Reference exchange rate`                                              | `An informational rate was used according to the Journey's valuation settings`        | `REFERENCE_RATE`, provider payload |
| canonical                | Avoid; state the concrete result                                       | `The latest group-confirmed server record used for settlement`                        | `canonical`                        |
| authoritative            | Avoid as a badge; say `Included in this total` or the actual exception | Explain whether split, rate, conflict, and settlement criteria are satisfied          | `isAuthoritative`                  |
| revision                 | `Updated` or a human Activity event                                    | `Version used to preserve edit history`                                               | revision number                    |
| conflict                 | `Conflict—review required`                                             | `Two edits cannot be safely combined; choose the correct version`                     | conflict enum/payload              |
| settlement participation | `Included in settlement` / `Not included in settlement`                | `Controls whether this Expense changes who owes whom; it does not delete the Expense` | participation enum                 |
| adjustment               | `Settlement update`                                                    | `A traceable change after final settlement; original records remain intact`           | `ADJUSTMENT`, lineage/root IDs     |
| awaiting confirmation    | `Waiting for [receiver] to confirm`                                    | `The payer marked it paid; the receiver has not confirmed receipt`                    | raw lifecycle state                |
| discharge                | `Payment credited` or `Amount settled`                                 | `The amount that reduces the outstanding transfer after valid confirmation`           | discharge records/IDs              |
| pre-settlement position  | `Before settling, you paid [more/less] than your share`                | `Payments made minus allocated shares before transfers are applied`                   | raw balance/position fields        |

Additional terminology rules:

- Never collapse all `isAuthoritative=false` cases into `Excluded`. Show the actual user meaning: `Not in your share`, `Needs exchange rate`, or `Conflict—review required`.
- Settlement participation remains available in its dedicated control/detail context; excluded Expenses do not carry a warning in list rows.
- Healthy normal states remain silent. Show state only when it explains a limitation, an unresolved action, or an offline guarantee.
- Preview and final must be explicit: `Settlement preview` versus `Final settlement`.

## 9. Date and time display policy

Store and query dates exactly as current domain contracts require; this section changes display only. Use locale-aware formatters and source precision. Never show raw ISO in ordinary UI and never invent a time for date-only input.

| Source/use                     | Rule                                                                                          | Example output in an English locale          |
| ------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Expense today                  | Relative day; include time only if source has meaningful time and the screen benefits from it | `Today` or `Today, 14:32`                    |
| Expense yesterday              | Relative day; same precision rule                                                             | `Yesterday` or `Yesterday, 19:05`            |
| Normal trip Expense, same year | Localized short date, no fabricated time                                                      | `25 Jul`                                     |
| Expense in another year        | Include year                                                                                  | `25 Jul 2025`                                |
| True date-time Expense         | Convert instant to the chosen display timezone and show time where task-relevant              | `25 Jul, 14:32`                              |
| Audit/activity instant         | Relative when recent plus exact accessible/secondary value; otherwise date and time           | `Today, 14:32` or `25 Jul 2026, 14:32`       |
| Imported SQL `DATE` precision  | Treat as calendar date, not UTC midnight                                                      | `25 Jul 2026`, never `25 Jul 2026, 00:00`    |
| Single-date filter             | Exact localized label                                                                         | `25 Jul 2026`                                |
| Same-month range               | Compact localized range                                                                       | `20–25 Jul 2026`                             |
| Cross-month/year range         | Show both unambiguously                                                                       | `28 Dec 2025 – 3 Jan 2026`                   |
| Preset filter                  | Human preset plus optional exact range in sheet                                               | `This Trip`; sheet may show `12–28 Jul 2026` |

Timezone decision for true instants remains the existing domain behavior unless separately approved. The UI must not reinterpret date-only values through device timezone conversion.

## 10. Information visibility and diagnostics

### Remove immediately from normal UI

- Raw ISO strings, UUIDs, revision numbers, evidence fingerprints, input digests, lineage/root settlement labels, cursors, integer rounding traces.
- Raw `ACCEPTED`, `SYNCED`, `MANUAL_AGREED`, `REFERENCE_RATE`, raw upload/OCR/storage state, fixture reasons, and acceptance harness instructions.
- Permanent Retry controls when no error exists.
- Duplicate page/navigation titles and duplicate Save actions.
- Generic `Excluded` where several materially different reasons exist.

### Retain behind advanced explanation

- Human rate source and why a rate is needed.
- Human Activity history: who changed what and when.
- Settlement cutoff, currency, included/blocked counts, underlying Expenses, and understandable split explanation.
- Why an Expense is not included in a total or settlement.
- Adjustment reason and changed obligations.

### Reserve for Developer/Diagnostics Mode

- Raw IDs, revisions, enum values, queue rows, retry attempts, cursors, backend response details, canonical/lineage/digest data, support fingerprints, fixture controls, fake failures, and acceptance/synthetic Journey inventory.

### Dev-only Journey strategy

1. Developer/Diagnostics Mode is off by default in Release and may default on in Dev builds.
2. Test Journeys are hidden from the ordinary selector/My Ledger only when backed by a reliable explicit classification. Do not use display-name matching.
3. Diagnostics provides `Show test Journeys` and clearly marks them.
4. Existing fixture data remains untouched; this is visibility only.
5. If explicit classification requires a domain/schema change, stop and request approval rather than changing Backend/schema in a polish slice.

## 11. Ordered implementation slices

P3 and P4 from the suggested direction are intentionally swapped. Search/results precedes Expense polish because Dashboard category drill-down, See All, Analysis, and Review all depend on one trustworthy virtualized results/navigation pattern.

### P1 — Correctness and State Trust

Deliver:

- Atomic keyed projection for Spending Mine/Group, Journey switching, Analysis, Search applied state, My Ledger period, and Settlement Journey cache display.
- Stale-response rejection and 200 ms Search debounce; stop reloading filter options/Journey metadata per keystroke.
- Fix Analysis day drill-down label/range mismatch.
- Replace generic financial-state ambiguity with the approved distinct meanings.
- Replace settlement participation Switch with explanatory, explicit confirmation.
- Apply date/time formatter policy to the highest-risk ordinary UI surfaces.
- Remove obvious raw debug data from Ledger landing, Search, Expense detail, and Settlement overview.
- Add cached-first/local progress, offline, retry, and actionable empty states where touched.

Classification: UI-only plus navigation/state and repository-read orchestration; small performance improvement; no repository write semantic change. Existing write commands remain unchanged. Financial-semantic changes are prohibited.

Approval: atomic state, exact day label, debounce, cached-first states, and raw-debug hiding can proceed. Final user-facing wording for distinct financial states and the exact settlement-participation confirmation text require product sign-off before merge; the underlying meanings are not open for change.

Tests:

- `Europe 2026 UI Polish`: rapidly alternate Mine/Group, Journey, Analysis dimensions, Search text, and filters; assert no mismatched label/money frame and no stale overwrite.
- `Europe 2026 Replay`: read-only totals before/after each transition must match repository results.
- Synthetic edge Journeys: rate required, conflict, no personal share, settlement excluded, offline cache, and delayed/out-of-order repository responses.
- Release Simulator: offline launch/return and exact date/range labels.
- Physical iPhone: participation confirmation feel and VoiceOver announcement.
- Regression boundary: affected reporting repository tests, Ledger screen/state tests, settlement-participation revision tests, date formatting tests, targeted Stage 6/7/9/10 read paths. Do not rerun full Stage 1–10 unless a boundary test exposes a semantic regression.

### P2 — Dashboard and Navigation

Deliver:

- Journey Ledger dashboard hierarchy, 12 Recent Expenses, Search/Add navigation actions.
- Primary Spending/Settlement with subordinate Mine/Group.
- Searchable Journey sheet and global Ledger menu.
- Category summary drill-down, settlement snapshot, attention, See All.
- Stable sticky/compact context and receipt paperclip.

Classification: UI and navigation/state; fewer dashboard rows; existing repository summary/recent reads, with recent limit reduced to 12. No write behavior or financial semantics change.

Approval: structure above can proceed. Decisions still required for exact top-left menu presentation, lifecycle classification source, and which settlement snapshot fields are safe/meaningful before finalization.

Tests: UI Polish density and long names; Replay read-only category/total consistency; synthetic empty/attention/Journey lifecycle cases; Release Simulator scroll/sticky behavior; physical iPhone for reachability, icon comprehension, and Dynamic Type. Regression boundary: dashboard reporting reads/routes only.

### P3 — Search, Analysis, and Lists

Deliver:

- Dedicated native Search, Filter sheet with draft/Apply, active tint/count and removable chips.
- Exact/custom date filters and Today/Yesterday/This Trip presets.
- One filtered Expense result model for Search, category/day drill-down, and See All.
- `FlatList` virtualization and repository pagination for Search/Review; Analysis chronological Time order and correct pluralization.
- Back-stack query/filter/dimension/scroll retention.

Classification: UI/navigation/state plus measured UI performance work; existing repository filters/pagination only. No FTS, index, cache, or analytics change.

Approval: Search/filter structure, virtualization, and exact filter display can proceed. Product decision required for Analysis default dimensions/range and whether `Largest first` is offered for Time.

Tests: UI Polish 133-row searches, mixed filters, long multilingual content; Replay totals and exact drill-down sets; synthetic zero/one/10k test data for empty/pluralization/windowing; Release Simulator keyboard/back/scroll retention; physical iPhone for search/filter ergonomics and VoiceOver. Regression boundary: reporting query contract and Search/Analysis routes.

### P4 — Expense Experience

Deliver:

- `+ Expense` intent choice: Add manually or Scan receipt.
- Manual quick entry ordered as Amount, Currency, Title/merchant, Expense date, Paid by, Participants, Split summary, materially relevant settlement participation, and More Details.
- Today/current-member/current-member-only participants, existing Journey/recent currency, Ledger Settings split method, and canonical `INCLUDED` settlement defaults without redefining domain semantics.
- More Details for optional category, attachment, Notes, and advanced rate/evidence fields; one navigation title, Cancel, and Save.
- Native date/searchable ISO currency/category controls.
- Focused member-selection and split editors with exact allocation summary and all existing supported modes.
- First-class receipt capture/import, existing Stage 5 OCR suggestions, editable review, and explicit confirmation; independent optional manual attachment that does not force OCR.
- Detail hierarchy, receipt indicator, and human Activity view.
- Consume valid existing Household data for equal-household splitting; do not implement Household management until the documented functional gaps are separately approved.

Classification: primarily UI/navigation/state. Financial Expense repository writes and durable financial queue remain unchanged; local reads reuse members, Households, Journey metadata, supported currency metadata, and existing Expense data. One bounded non-financial repository/worker change is required so OCR is opt-in by entry intent instead of being enqueued for every manual attachment. No Backend/schema change. No new repository query unless Activity already has an approved source. Financial semantics are prohibited from changing.

Approval: the intent-first entry, manual hierarchy/defaults, calendar-date entry, optional category/attachment/Notes, member-selection sheet, compact split summary, settlement-participation behavior, searchable currency picker, suggestion-only OCR review, and opt-in OCR queue behavior can proceed as approved direction. Product decisions remain for the precise Journey/recent-currency precedence if it is not already unambiguous in current semantics, the Ledger Settings split-default persistence/source because none is currently implemented, Activity scope if current data cannot support a trustworthy timeline, and all missing Household management functionality identified in section 6.16.

Tests: execute the P4 acceptance matrix below using UI Polish for eight-member/long-name/receipt density, Replay for read-only detail rendering, synthetic Journeys for exact split/rate/offline/Household edges, Release Simulator for form keyboard/modal behavior, and physical iPhone for intent choice, capture handoff, quick-entry speed, VoiceOver, and Dynamic Type. Regression boundary: Expense draft/domain validation, repository write, queue/sync, receipt flow, and affected Stage 3/4/5/6/9 paths.

#### P4 acceptance matrix

| Case                                            | Fixture/device                                                                      | Acceptance result                                                                                                                                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry intent                                    | UI Polish; Release Simulator and physical iPhone                                    | `+ Expense` offers Add manually and Scan receipt; neither path creates an Expense before explicit Save/Confirm.                                                                                                                             |
| Manual defaults                                 | UI Polish, authenticated current member                                             | New form starts with Today at date precision, current member as payer and sole participant, approved currency/default split source, and canonical settlement participation `INCLUDED`.                                                      |
| Manual hierarchy                                | UI Polish; largest Dynamic Type                                                     | Core fields appear in the approved order; category, attachment, and Notes remain optional under More Details; full member/split controls are absent from quick entry.                                                                       |
| Currency                                        | UI Polish multi-currency data                                                       | Searchable picker permits only existing supported ISO metadata; correct scale is used; Journey/recent default follows approved existing precedence.                                                                                         |
| Date                                            | Simulator across timezone/day boundary                                              | New ordinary Expense displays and saves the selected calendar date without requiring or fabricating a user-visible time.                                                                                                                    |
| Paid by/participants                            | UI Polish eight long multilingual names                                             | Current member defaults for both; long names reflow/truncate accessibly; adding people occurs in the dedicated sheet and the quick form shows a compact summary.                                                                            |
| Settlement participation, one participant       | Synthetic single-person Expense                                                     | Domain value remains `INCLUDED`; quick form does not force an irrelevant debt decision; Spending/analysis remain correct.                                                                                                                   |
| Settlement participation, multiple participants | Synthetic two-plus-person Expense                                                   | Human choices explain debt impact; `Not included` retains Expense/consumption in Spending/analysis and creates no inter-member debt under existing semantics; changing value requires explicit confirmation.                                |
| Split default and editor                        | UI Polish and synthetic split defaults                                              | Ledger Settings default is applied without displaying all modes; summary allocations equal the Expense total; tapping opens the editor with existing modes.                                                                                 |
| Equal household—different sizes                 | Synthetic: Household A has two selected members, Household B one                    | Households receive equal shares, then each Household share resolves to its selected members; exact stored member allocations sum to the Expense total. Example baseline remains 1,200 → 300/300/600.                                        |
| Equal household—partial participation           | Synthetic: only a subset of members from one or more configured Households selected | Only selected participants consume each selected Household's share; unselected Household members receive no allocation; displayed and stored member totals remain exact. This matches the current domain allocator's selected-member input. |
| Equal household—missing Household               | Synthetic selected member without Household                                         | Mode is unavailable with a human explanation; UI does not invent membership or silently fall back to another split method.                                                                                                                  |
| Equal household—deterministic residual          | Synthetic odd minor-unit totals, different Household sizes/order                    | Original and settlement allocations sum exactly; repeated runs with stable inputs produce the same residual recipients according to existing deterministic domain ordering.                                                                 |
| Scan receipt success                            | UI Polish receipt fixture; physical iPhone                                          | Image is selected/captured first; OCR suggestions are visibly suggestions and editable; no payer/participant/split/rate/settlement fact changes until explicit confirmation.                                                                |
| Scan receipt offline/failure                    | Offline synthetic receipt                                                           | Local asset/draft remains recoverable; OCR failure permits manual completion; Retry appears only for the failed lifecycle step; Expense financial save and asset/OCR status remain independent.                                             |
| Manual attachment without OCR                   | Manual Expense, image/file attached under More Details                              | Attachment queues only required upload/link work; no OCR operation is created or run, and no Expense field changes.                                                                                                                         |
| Notes/category                                  | Manual and OCR-prefilled drafts                                                     | Notes remain optional; approved category picker is used; no title-based automatic category inference is introduced.                                                                                                                         |
| Dirty dismiss/local save                        | Offline Simulator and physical iPhone                                               | Dismissal confirms only when dirty; local Save returns promptly, prevents duplicate submit, and communicates queued synchronization without blocking access.                                                                                |

### P5 — Settlement and Review

Deliver:

- Transfer-first Settlement overview, focused Transfer detail, actor-valid Payment sheet.
- Separate Adjustment and Statement/export flows.
- Human lifecycle language and advanced evidence disclosure.
- Review list/detail/Expense navigation, contextual actions, and accessibility-container fix.

Classification: substantial UI/navigation restructuring; reuse current cached settlement repositories, preview/finalize/payment/adjustment/export coordinators unchanged. Virtualize Review. Financial semantics prohibited from changing.

Approval: transfer-first hierarchy and raw-data removal can proceed. Product sign-off required for exact preview/final language, transfer status wording, placement of organizer actions, adjustment presentation, and what advanced Statement evidence is user-visible.

Tests: UI Polish settlement/readiness density; Replay remote preview read-only and cached finalized rendering; synthetic payment lifecycle, adjustment, blockers, conflicts, offline queued payment, organizer/member roles, and Review actions; Release Simulator for push/sheet/back flows; physical iPhone for payment confirmation feel and complete VoiceOver task flow. Regression boundary: Stage 7 settlement/payment/adjustment/export and Review contracts, without full earlier-stage reruns unless failures cross boundaries.

### P6 — Accessibility, Visual Consistency, and Diagnostics

Deliver:

- Dynamic Type reflow without 0.5 amount shrinking, long-text layout breakpoints, VoiceOver order/actions, contrast, spacing/type/icon consistency.
- Developer/Diagnostics Mode shell and migration of remaining raw/test UI, only after its data-classification decision.
- Final ordinary-UI raw-term sweep and Dev Journey visibility behavior.

Classification: UI/accessibility/navigation; no financial semantics. Diagnostics reads existing data through existing repositories/support surfaces. No hidden direct database access.

Approval: accessibility corrections and style consistency can proceed. Developer Mode entry, enablement policy, Journey classification, and any diagnostic mutation/test control require explicit approval.

Tests: UI Polish multilingual and largest accessibility sizes; Replay read-only smoke; synthetic every empty/error/offline/exception state; Release Simulator light/dark where supported and keyboard navigation; physical iPhone mandatory for VoiceOver, Dynamic Type, touch target, scrolling, sheet detents, and perceived transition quality. Regression boundary: accessibility and visual snapshots/component tests plus targeted flow tests.

## 12. Finding coverage

| Audit findings                                                            | Planned slice |
| ------------------------------------------------------------------------- | ------------- |
| LUX-02, LUX-07, LUX-08, LUX-15, LUX-25 plus cross-screen stale projection | P1            |
| LUX-01, LUX-03, LUX-04, LUX-05, LUX-27                                    | P2            |
| LUX-06, LUX-09, LUX-10, LUX-24                                            | P3            |
| LUX-11, LUX-12, LUX-13, LUX-14, LUX-16, LUX-17, LUX-18                    | P4            |
| LUX-19, LUX-20, LUX-21, LUX-22, LUX-23                                    | P5            |
| LUX-26 and final cross-screen debug/accessibility consistency             | P6            |

All 27 audit findings are assigned. P1 deliberately pulls the state-trust parts of LUX-25 forward; P6 performs the final cross-screen verification rather than postponing critical accessibility fixes already touched in P4/P5.

## 13. Approval gates and remaining user decisions

### Can proceed without further product approval

- Atomic selection/projection commits, stale-response rejection, local cached-first rendering, same-key updating indicators.
- 200 ms Search debounce, metadata query deduplication, `FlatList` virtualization, repository pagination, state/scroll retention.
- Exact Analysis drill-down date labels, locale-aware display with source precision, no fabricated midnight.
- Removal of raw IDs/enums/digests from ordinary UI where no user meaning is lost.
- Duplicate title/action cleanup, obvious accessibility-container fixes, responsive reflow, receipt paperclip.
- Common filtered result model for Search, See All, and Analysis drill-down.

### Requires user decision/sign-off

1. Final English wording for the distinct `not in my share` / `needs rate` / `conflict` / `not included in settlement` meanings.
2. Exact top-left global Ledger menu form: system Menu or compact sheet if Review badge/descriptions are important.
3. Reliable source for Dev/acceptance Journey classification. If unavailable without schema/domain work, defer hiding rather than infer from names.
4. Exact Settlement snapshot shown on the Spending dashboard before versus after finalization.
5. Analysis defaults: initial range/dimensions and whether Time offers amount sorting.
6. Exact precedence for Journey versus recent currency and the existing source of the Ledger Settings default split method, if current approved semantics/configuration do not already resolve them.
7. Household management functional gap: complete read model, CRUD/authorization, offline queue, optimistic revision/conflict behavior, and settings ownership. This is outside UI polish and requires separate approval before `Households & Groups` can be user-managed.
8. Supported scope of Expense Activity history if current data cannot provide a trustworthy human timeline.
9. Final Settlement preview/final/payment/adjustment wording and organizer-action placement.
10. Developer/Diagnostics enablement policy and whether any diagnostic mutation/test controls are allowed.

## 14. Recommended first implementation slice and expected outcomes

Start with **P1 — Correctness and State Trust**. Visual redesign should not be layered over a screen that can pair a newly selected context with old money. P1 is narrow, testable, uses existing repositories, and establishes the transition contract every later screen needs.

Expected visible improvement by slice:

- P1: financial values stop jumping across Mine/Group, Journey, Analysis, Search, period, and Settlement transitions; dates and exceptional states become trustworthy; high-impact settlement inclusion cannot be changed by an accidental toggle.
- P2: Ledger becomes a scan-friendly Journey dashboard with obvious Journey context, Search/Add access, useful summaries, and a bounded recent list.
- P3: complete history and analysis become fast, native, filter-transparent, and stable on back navigation even with large data.
- P4: `+ Expense` starts from manual-versus-receipt intent; manual entry is short and predictable, while suggestion-only OCR, advanced splits, optional attachments, and Household-aware allocation remain explicit and reviewable.
- P5: Settlement clearly answers who pays whom and what happens next; Review becomes an actionable, accessible workflow.
- P6: large text, VoiceOver, multilingual content, and diagnostics separation feel intentional across the whole Ledger.

No product code, Backend, schema, Supabase data, or Ledger financial semantics are changed by this planning document.
