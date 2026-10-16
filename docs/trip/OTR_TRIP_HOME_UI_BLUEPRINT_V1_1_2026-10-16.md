# OTR Mobile 2.0 — Trip Home UI Blueprint V1.1

**Date:** 2026-10-16  
**Status:** Visual implementation blueprint; approved product contracts remain authoritative.  
**Scope:** Trip Home shell, Preparation, Today's Journey, Journey Snapshot, Expense & Settlement. No new domain state, backend, Capture, Day Feed or Ledger logic.

## 0. Authority and conflict resolution

Sources: `OTR_TRIP_HOME_FRAMEWORK_PRODUCT_IMPLEMENTATION_CONTRACT_2026-10-14.md`, `OTR_TRIP_HOME_PREPARATION_PRODUCT_DESIGN_DELTA_2026-10-14.md`, `OTR_TRIP_HOME_TODAYS_JOURNEY_PRODUCT_DESIGN_DELTA_2026-10-14.md`, `OTR_TRIP_HOME_JOURNEY_SNAPSHOT_PRODUCT_DESIGN_DELTA_2026-10-14.md`, `OTR_TRIP_HOME_EXPENSE_SETTLEMENT_PRODUCT_DESIGN_DELTA_2026-10-14.md`, and the approved Contextual Action Island/Navigation Delta. This blueprint specifies *presentation*, not new permissions, ranking authorities, or canonical facts. In conflicts, the product/domain contracts prevail. Illustrative screenshots never authorize fake content.

## 1. Shared shell: exact hierarchy

1. **Overlay top controls**: no separate opaque/white Top Bar and no centered `Trip Home` title. The native transparent circular Menu at upper left and Search (plus authorized Edit when supported) at upper right **float over the Hero image**, positioned within safe-area and readable against variable photography. Preserve native control styling; never simulate glass with ordinary views.
2. **Trip Hero**: true screen-width edge-to-edge image with **square corners (radius 0)**, extending to the **very top behind the status bar and overlay controls**, no top gutter or inset card frame. Target roughly **30% of screen height** for the visible Hero, adjusted for safe-area, device and text accessibility rather than a rigid clip. Add a restrained lower gradient and bottom-aligned Trip title / destination / dates; typography must use **the same My Trips Hero title and metadata tokens** (weights, sizes, colors, line-height, hierarchy). Text occupies no more than ~40% of image where practical; long localized text expands safely. The image scrolls with the Trip Home content; the floating controls retain correct safe-area placement. Never show a second identity card.
3. **Contextual Workspace**: a horizontal, *named-tag* selector above one large rich Widget page. All qualified widgets appear as tags in their actual selected order. Tap tag -> page; swipe page -> selected tag sync. Stable page/container geometry, target ~420–550 pt on typical phone, adapt to Dynamic Type/small devices without clipping. Manual paging; no unapproved auto-cycling. Do not place the full module page inside the widget or add a nested, tall scroll list.
4. **Core module access**: after the workspace, discoverable entries for Documents, Members, Photos and Trip Settings when functional. Disabled/unsupported destinations must be honest and must not masquerade as ready. Cover selection is an edit affordance, not a Photos module.
5. **Bottom Shell**: existing two-island grammar: left Home / Day / Ledger and Updates once available; right contextual Action Island. On Trip Home `+` opens **Add to this trip**: Import/Capture prominent and eligible quick adds Itinerary, Expense, Member, Photos. Not My Trips' `Start a Trip` menu. Avoid overlapping content; respect safe area.

### Geometry and visual tokens (design targets, not independent foundation overrides)

- **Hero horizontal gutter: 0**, **Hero corner radius: 0**, including top and bottom corners. It reaches the screen edges; status-bar background is the image. Subsequent workspace and modules use OTR Foundation gutters (~16–20 pt); widget radius ~18–22 pt. No heavy shadow or nested card stacks.
- **Widget named tabs are secondary navigation**, visually understated: regular/medium **11–13 pt** (default target 12 pt, Dynamic Type responsive), compact horizontal padding (~8–10 pt), compact height (~26–30 pt), modest gap (~6–8 pt). Use subtle selected tint/underline or small soft pill, **never large solid primary-action buttons**. Preserve all qualified widget names, horizontal scrolling, tap selection and swipe synchronization; small dots may supplement but **must not replace** readable named tabs. Do not make tab count badges oversized.
- Widget title 17–19 pt semibold; primary metric 22–28 pt semibold/tabular for amounts; body 14–16 pt; metadata 12–14 pt subdued. Exact typography inherits existing Ledger/My Trips tokens and system Dynamic Type.
- Action buttons use existing OTR Primary/Secondary Native Control tokens; no blue/rainbow mockup palette. Type icons neutral, semantic success/alert only when meaningful.
- Widget page width uses full available horizontal space within outer gutter. One main surface; subtle dividers and whitespace rather than nested white cards.
- Avoid fixed empty vertical spacers. A shared large host may have spare space in sparse cases, but content should compose intentionally rather than leave an arbitrary blank half-page.

### V1.1 visual change control (Owner requested)

Only two design changes from V1: **(A) full-bleed square Hero with native controls over the photograph**, and **(B) smaller, visually quiet named Widget tabs**. Preserve the four widget contracts, contents, qualification, ordering, CTA behavior and core module navigation unchanged. The accompanying generated visual is composition guidance only: if it depicts dot-only navigation, decorative photos, invented counts or an incorrect `Plan Today` CTA, **this Blueprint and the approved Widget Deltas prevail**.

## 2. Qualification and default order

| Lifecycle | Default qualified order | Rules |
|---|---|---|
| Upcoming | Preparation, then Expense & Settlement if authorized finance records | Preparation **always** present, even empty; other approved widgets only when qualified. A confirmed actionable Review may affect ranking only once owning interfaces exist. |
| Active | Today's Journey, then Expense & Settlement if authorized records | Today's Journey supports free/sparse day; no fabricated NOW or activity. Newly imported actionable Review may temporarily preempt once only when owning integration is real. |
| Past | Journey Snapshot, then Expense & Settlement if expenses or settlement | Snapshot first even with outstanding settlement. Sparse/empty historical data uses truthful fallback. |
| Undated / unknown | Honest planning workspace required | Framework requires a planning fallback; exact full Preparation reuse is not separately approved. Do not force lifecycle classification. |

Never display an empty finance widget, unadmitted candidates as itinerary, or inaccessible private data. An absent widget is not the same as an empty read; use owning availability/status.

## 3. Preparation widget — Upcoming

### Empty Upcoming
- Header: `Prepare your trip` and concise neutral explanation.
- Two equally prominent **large** actions, in the main widget: `Import travel plans` and `Build your itinerary`. Both are real entry paths when authorized and available; the former opens selected-Trip Capture, the latter the supported Day Feed/add flow.
- Describe PDFs, images, files, text and future Email/AI capabilities only with honest enabled/disabled status. No example bookings, arbitrary progress percent, invented dates or fake item counts.

### Upcoming with admitted items
- Short headline and dynamic counts by actual supported business type (flight/stay/transport/rental/activity as applicable); don't hardcode fixed three types.
- Up to three **recently created/admitted** formal Trip Items ordered by persisted creation/admission time, not travel date. Row: neutral type icon, compact title, secondary date/context, chevron. Open owning Item detail or supported Day destination.
- Compact `Import more` and `Open Day` actions if allowed. No fake `Planning complete` status.

## 4. Today's Journey — Active

- First widget by default. Header includes Trip-local today date and a prominent `Open Today` action.
- One relevant primary/current-or-next *authorized* Item with trustworthy timing; max three later-today Items in existing Day Feed order. Optional single `Tonight stay` summary when a valid Stay covers tonight. Use no made-up times, attendance, or lodging warning.
- Sparse day: neutral summary. Empty day: intentional `Free day` state with `Open Today`, not `No contextual workspace`.
- Primary/later/stay rows open existing Immersive and **return to same Home widget**. `Open Today` opens today's Day Header (not NOW/Focus) without changing Day tab's saved date/position/Focus. Bottom Day tab separately resumes its bookmark.
- Ticket/Map shortcuts only when owning actions and permissions exist; no duplicated Day Feed timeline or separate NOW engine.

## 5. Journey Snapshot — Past

- Header `Journey Snapshot`, restrained commemorative feel, not a colorful scrapbook.
- Three compact truthfully derived stats: Days / Places / Activities; omit unreliable numbers.
- Central stable, loosely arranged tag cloud of up to 20 **authorized canonical** Item labels spanning dates/types. Type icons neutral. Tags are deterministic, touchable, nonoverlapping and accessible; no random animation or rainbow category colors.
- Tap tag -> existing Past Item Immersive -> return restores Home/widget position and leaves Day bookmark untouched.
- Bottom CTA `Review Full Itinerary` -> first available Past Day Header; never auto-focus a Trip Item or infer actual attendance.
- With few/no Items, show only real tags or a neutral factual summary; never pad with invented destinations or experiences.

## 6. Expense & Settlement — lifecycle adaptive

- One widget, not separate Expense and Settlement pages in the Home pager.
- Upcoming/Active: Group Spending and **My Spending = current user's consumption attributed to them regardless of payer**, not paid/advanced amount. Show authorized expense count, dynamic category counts and up to 3 recent recorded expenses; compact Ledger handoff. Avoid labels implying prepaid or final status.
- Past: Group/My Spending, category/count summary, conditional Settlement recap; no recent expense list. Never imply an outstanding balance is overdue or proof of nonpayment.
- Existing Ledger selectors, currencies, MoneyText, permissions, sync/freshness and detail routes own truth. No new financial calculations. `Analyze` only when real destination exists.
- Preserve common large widget height without duplicating `Spending` header/button three times or leaving unexplained blank card area. Use two-column summary and concise list, generous but purposeful rhythm.
- No finance records: omit widget entirely.

## 7. Navigation and cross-module return

- Hero Edit -> authorized Trip basic editor -> return Home with position intact.
- Item row/tag -> owning Immersive -> return to exact Trip Home widget/page/scroll, without resetting Day tab bookmark.
- `Open Today` vs Day tab remain distinct navigation intents.
- Bottom Home/Day/Ledger/Updates and right Action Island retain existing shell semantics.
- Menu `All Trips` -> My Trips; no duplicate Home/Day/Ledger/Capture items in Trip Menu.
- Background updates should not suddenly move the visible widget while user is interacting; qualification/order refresh uses stable identities.

## 8. VQA fixture matrix / acceptance

| Scenario | Expected visual | Required evidence |
|---|---|---|
| Empty Upcoming | Preparation with two equal paths, no empty fake counts | native light/dark + actions |
| Upcoming rich Reference | Preparation counts + <=3 recent admitted Items; finance tag if qualified | real accepted Items, click-through |
| Active free day | Today's Journey `Free day` + Open Today; finance tag only if data | valid local date/rights |
| Active with schedule + expense | Today first, finance second; swipe/tag sync | real Day reader, 2-page Native video |
| Past rich | Snapshot first, finance second if qualified | authorized accepted snapshot, stable tags |
| Past sparse | truthful low-content Snapshot | no invented activity |
| Read-only actor | no unauthorized create/edit action | permissions |
| Offline cached | truthful local data, no fabricated availability | native offline run |
| Accessibility | no clipped content, tap targets, safe-area, VoiceOver, Dynamic Type | device checks |

## 9. Current implementation gap and agent ownership

Read-only inventory at HEAD `321ab89d2b1e064444f61a425c1fb4d26b88841f`: Frame/Host exists; Snapshot and Finance are conditionally wired; Preparation and Today's Journey are **not implemented**. Current production list is `[snapshot only when Past] + [finance when qualified]`. This blueprint does not certify runtime delivery.

**Coordinator/Core/Experience**: owns widget component creation where absent, accepted Day/Trip/Ledger selectors, permission gating, lifecycle qualification, navigation intents, production registry, integration and Native verification. **Independent UI Agent**: owns presentation, visual tokens, layout, tags/pager/safe area, and approved visual corrections only. Avoid parallel edits of business selectors or Capture/Ledger owning code. UI screenshots are illustrative, not implementation authority for new data or services.

## 10. Deferred / not implied

- Recent Imports/Review promotion needs owning Import/Updates integration and one-time discovery identity; do not fake.
- Tickets/Bookings, Members invitation, Photos memories, embedded map, CXE adaptive ordering are not authorized merely by their appearance in a concept illustration.
- No new Dashboard, third Today, new persisted readiness flag, or new Booking Immersive.
