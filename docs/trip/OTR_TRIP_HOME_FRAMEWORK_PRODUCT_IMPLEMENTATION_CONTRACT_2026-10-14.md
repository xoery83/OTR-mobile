# OTR Mobile 2.0 — Trip Home Framework Product Implementation Contract

**Date:** 2026-10-14  
**Status:** Product design handoff for OTR Beta Main Product Chat; **not direct implementation authorization**  
**Scope:** Trip Home shared shell, stable access routes, contextual workspace host, module entry rules, lifecycle policy and phased integration. Individual Widget contents are separate deltas.

## 1. Executive summary

Trip Home is the selected-Trip workspace, not My Trips (the Trip selector), and not a duplicate Day Feed. It provides a stable perimeter for navigation and management and a context-driven central workspace. The first release must work with currently available, authorized capabilities, degrade honestly when upstream reads are unavailable, and permit incremental module installation. The product design is **three layers**: (1) compact editable Trip identity Hero, (2) prominent large contextual Widget workspace, (3) stable core-module access. This contract records confirmed decisions separately from implementation proposals and unresolved points.

## 2. Decision status and precedence

- **OWNER APPROVED — Trip IA baseline:** My Trips → selected Trip Home → Day; Day Feed is Day's default, Today resolves to the same Day surface. Calendar is a future switchable Day Feed view, not a standalone Trip Home/Menu tab. Existing Expo Router authority remains.
- **OWNER APPROVED — Trip Hero:** reuse My Trips' full-photo presentation, with Trip name and essential metadata overlaid in the bottom portion, targeting no more than 40% of image height for the text zone. Hero shows basic Trip identity; editable name/date and other relevant fields offer direct edit entry. Top right Edit next to Search. Do not duplicate the photo and metadata in a separate tall panel.
- **OWNER APPROVED — Three layers:** Trip Identity / Contextual Workspace / Core Modules.
- **OWNER APPROVED — Bottom Shell:** left Navigation Island: Home, Day, Ledger (three stable Trip-level destinations). A fourth Notifications destination becomes persistent once the Notifications module is actually available; unread changes badge, not visibility. Right Action Island: Capture primary action. At most five icons across both islands. Bottom nav is stable across Trip-level secondary modules; full-screen immersive and editor behavior follows native presentation rules.
- **OWNER APPROVED — Menu principle:** global Trip menu does not duplicate Home/Day/Ledger/Capture; offers All Trips, Documents, Members, Photos and Trip Settings where functional. The top of the menu can show current module-specific actions subject to actual capability and permission. Unsupported destinations must not be fake active links.
- **OWNER APPROVED — Core modules:** Documents, Members, Photos and Settings have discoverable, prominent, stable entry points below the contextual workspace. Modules absent from the Bottom Shell must not become undiscoverable because they lack a current Widget.
- **OWNER APPROVED — Contextual Workspace:** prominent, rich, purpose-built Widget pager, not small navigation tiles. Reference minimum visual presence approximately the large App Store feature card shown by Owner; target approximately 420–550 pt on a typical phone and ~60–70% of available content viewport, adapted for device and accessibility. The Hero and Bottom Shell may mean lower modules require vertical scrolling. Widgets have consistent container height within the carousel, horizontal swipe, visible clickable named tags above, synchronized selection and no dependence on small dots alone. Widget designs are separately approved; do not implement speculative rich widgets.
- **OWNER APPROVED — Widget qualification:** task-driven, contextual, meaningful actual content, actionable capabilities, clear full-module handoff; permission filtered and truthfully sourced. No empty decorative cards. Fixed layout shell; only bounded content/order adapts.
- **OWNER APPROVED — Preparation Widget:** see `OTR_TRIP_HOME_PREPARATION_PRODUCT_DESIGN_DELTA_2026-10-14.md`; HOME-PREP-01..06. Upcoming always retains Preparation; Empty offers two large equal paths Import Travel Plans and Build Itinerary; describe PDFs/photos/files/text/Email Connect/AI Plugins while not advertising unsupported channels as working actions. With content show trustworthy dynamic counts by actual business type, plus at most three latest created/admitted items ordered by persisted admission time, clickable through to detail; actions filtered by permission.
- **OPEN / PROPOSED — Automatic carousel cycling:** Owner required named tags so users can discover pages without automatic cycling. No final explicit approval to enable auto-cycling; safest V1 proposal is manual-only with no automatic page transitions.
- **OPEN / PROPOSED — Context ranking and exact lifecycle widget catalogue:** discussed examples below are not blanket authorization to implement every Widget.
- **OPEN / PROPOSED — System back navigation:** native iOS edge-swipe Trip Home → My Trips, Menu All Trips fallback, restore Trips list position; protect horizontal Pager gestures. Owner explicitly requested this behavior; exact navigation implementation and deep-link fallback need product/integration reconciliation.
- **OPEN / DEFERRED — Search:** global Search icon placement next to Edit on top right is product direction. Search behavior is separate future design; latest Trips/Shell handoff omitted inactive Search, so do not wire a dead Search route or invent a Trips-only search.

## 3. Information architecture / layout

```
Selected Trip Home
 ├─ Top chrome: Menu [left] | Edit Trip + Search [right, Search when usable]
 ├─ Layer 1: Compact Trip Hero (full photo, lower text gradient/overlay)
 │   ├─ Trip title, date, optional destination/member summary
 │   └─ Tap editable fields / Edit icon → authorized Trip basic editor
 ├─ Layer 2: Contextual Workspace
 │   ├─ horizontally scrollable, clickable named Widget tags
 │   └─ one large rich Widget page (horizontal swipe; fixed-height host)
 ├─ Layer 3: Stable module entries
 │   ├─ Documents     Members
 │   └─ Photos        Settings
 └─ Persistent Bottom Shell
     ├─ Navigation Island: Home | Day | Ledger | [Notifications once available]
     └─ Action Island: Capture
```

The Hero is a summary and basic edit affordance, not an additional module menu. Avoid extra duplicated Home/Day/Ledger generic cards in the body. The central workspace shows *work and content*; bottom nav provides *destinations*. Layer 3 provides reliable discovery of modules not present in bottom nav.

## 4. Navigation and authority

| Entry | Expected destination / action | Notes |
|---|---|---|
| My Trips card body | matching Trip Home | Trip context scoped to selected authorized Trip |
| Trip Home edge-back | My Trips | native stack semantics; do not steal horizontal pager gestures; reconcile deep-link case |
| Menu → All Trips | My Trips | always available, even without a prior back stack |
| Bottom Home | selected Trip Home | stable destination |
| Bottom Day | selected Trip Day Feed | Active defaults to Today only when qualified; no second Today renderer |
| Bottom Ledger | existing selected-Trip Ledger | preserve existing Ledger deep links, actor/account permissions and accounting authority |
| Bottom Notifications | notifications surface, once actually supported | fourth stable destination; badge conveys unread state |
| Action Island Capture | selected Trip Capture / add intake | do not assume all channels currently functional; use existing Capture capability |
| Top Edit / editable Hero fields | Trip basic edit | only if authorized; no fictitious save |
| Top Search | global Search when supported | pending independent design; don't implement local-only search |
| Menu Documents / Members / Photos / Settings | authorized module destinations | hide or honestly unavailable where capability absent; no dead controls |
| Current module actions in Menu top | actual module-specific actions | context/role-specific, no duplicated global destinations |

## 5. Lifecycle presentation contract

**Upcoming:** Prepare itinerary and available import results are central. Preparation Widget is always a candidate and may move behind more urgent, confirmed import review or member work. Do not infer completeness from empty days. No arbitrary readiness score.

**Active:** central work should prioritize today's authorized, actionable context and relevant documents/tickets where genuinely supported. Day tab reaches the same Day Feed. Do not create another live feed or invent NOW/event urgency from insufficient data.

**Past:** central work can prioritize authorized memories and settlement when modules are ready; never infer attendance/visitation from dates, photos or expenses. Historical Day Feed and Ledger remain available.

**Undated / unknown lifecycle:** keep an honest planning workspace; no fabricated Active/Past classification or timezone. This is a required fallback even though the initial lifecycle discussion focuses on Upcoming/Active/Past.

**Empty / unavailable / offline:** show authorized cached metadata and available actions, distinguish no Trip from unknown/incomplete read, and do not fabricate member counts, imports, tickets or photos. Core module entry points require a functioning destination, not a placeholder.

## 6. Contextual Widget host — reusable product contract

- Each Widget has a separately approved design delta covering: purpose, qualifying context, audience/permissions, rich content, actions, data source, empty/partial state, exit to full module, offline behavior, acceptance.
- The host uses a prominent common height on ordinary screens, with safe adaptive expansion/inner scrolling on small screens or enlarged text. No content clipping or CTA loss.
- Show the names of all current qualified Widgets as horizontally scrollable tags; tapping a tag selects its page, swiping a page updates the selected tag. Avoid surprise repositioning while the user is interacting.
- The first Widget may be selected deterministically by lifecycle, explicit outstanding work and recent action. Detailed ranking/decay rules are still **PROPOSED**, not approved. Do not implement remote LLM personalization or CXE dependency for V1.
- No automatically generated new business state or false task completion claim. The host may select presentation, never overwrite Canonical or Ledger truth.
- A Widget may contain a list, stats, photos, actions and View All; it must not merely repeat the bottom navigation or the core module tiles.
- No unsupported Widget should appear as a functional preview. Default fallback for Upcoming is the approved Preparation Widget; for other lifecycle states, use only qualified available content until their Widget contracts are approved.

## 7. Widget candidate registry (NOT blanket approval)

| Widget | Lifecycle | Status | Purpose / prerequisite |
|---|---|---|---|
| Preparation | Upcoming | OWNER APPROVED, separate delta | Empty/partial/established planning; imported/admitted items, actions |
| Recent Imports & Documents | Upcoming / Active | PROPOSED | recent batches, files, candidate review, View all; must not count unadmitted items as itinerary |
| Members & Invitations | Upcoming / Active | PROPOSED | invite/link/AKA only when authorized; don't infer missing people from current count |
| Today's Journey | Active | PROPOSED | real accepted Day/qualified NOW facts; no duplicate Day Feed |
| Tickets & Bookings | Active | PROPOSED | authorized current evidence; offline document support as available |
| Expense & Settlement | Active / Past | PROPOSED | actual Ledger facts, never synthetic totals |
| Travel Memories | Past | PROPOSED / dependent Photos | authorized linked media; no visit inference |
| Trip Review | Past | PROPOSED | historical Day and recorded material |

## 8. Cross-module contracts and Beta implementation boundaries

- **Core / Trip:** Trip identity, dates, membership and access authority are not owned by Home. Home reads authoritative, account-scoped facts; no new persisted `readiness` or `selectedTrip` entity implied.
- **Experience / Day Feed:** Day is one existing presentation/controller. Calendar is a future Day Feed view switch, not a standalone Home/Menu route.
- **Ledger:** separate financial authority; Home shows only properly authorized summaries; existing Ledger page and deep-link behavior preserved.
- **Capture / Import:** Capture is the persistent primary action. Batch intake/processing and document status belong to Import/Documents; accepted Trip Items and Candidates must not be conflated. Email Connect and AI Plugins may be described only with truthful availability.
- **Members:** member/organizer roles gate edit/invite/AKA actions; Home does not assume that every viewer is an organizer.
- **Documents / Photos:** remain visible in stable module access when their real destinations exist; no photo count/preview without authorized reads. Photos workstream is not a prerequisite for Home host.
- **Notifications:** fourth bottom destination activates only after actual module availability; unread badge is independent of tab visibility.
- **CXE:** not required; deterministic contextual presentation can be built now. Stable navigation shells and user control are preserved with CXE OFF.
- **Bottom Shell:** use existing navigation owner and accepted two-island grammar. No new second router or global navigation rewrite.

## 9. Acceptance scenarios

1. My Trips → authorized Home → native edge-back / All Trips; list context retained when possible; deep link without back stack has All Trips.
2. Hero cover crops gracefully; title/date text overlaid in lower 40% target with legible gradient; editable fields open the correct authorized editor; long localized text/Dynamic Type do not clip.
3. Home/Day/Ledger remain stable and discoverable across Trip-level module pages; Capture stays right island; no duplicate entries in Menu.
4. Notifications absent before capability, persistent fourth tab after capability; unread changes badge only.
5. Documents/Members/Photos/Settings remain visible in the stable modules area when functional, even if no contextual Widget exists; nonfunctional destinations not faked.
6. Upcoming new Trip: large Preparation two-action Empty state; after admitted items, reliable category counts and up to three latest created/imported items; permissions and offline reads respected.
7. Tags expose all qualified Widgets; tag click and swipe stay synchronized; page does not jump unexpectedly on background updates; larger text is readable.
8. Active without a qualified Today context does not show fake NOW or privileged ticket; Past does not assert attendance.
9. Missing photos/imports/financial aggregates degrade quietly; no fake zeroes, completion percentage, placeholders or synthetic content in production.
10. Light/Dark, small/large screen, VoiceOver, touch target, hot text-size transition, safe-area and shell/gesture interactions verified by native QA.

## 10. Scope and implementation sequence (handoff recommendation, not an engineering order)

**Beta 0 / first vertical slice:** shared Home frame, compact Hero, menu/top controls, stable islands, four core-module entries where real, Widget host with tags/swipe, Preparation Widget, honest unavailable/empty states, route/deep-link behavior. Use existing modules; avoid implementing unapproved Widgets.

**Beta 1 / incremental:** independently approved Recent Imports, Members, Active, Past Widgets as owning capabilities become available. Search and Notifications only when their separate contracts/capabilities are ready.

**Phase 2:** CXE-driven ranking/adaptation, rich Photos memory experiences, optional embedded maps, advanced cross-module analytics. These must not block Beta 0.

## 11. Open product decisions / reconciliation

1. Exact native back-gesture behavior in nested Pager/deep-link cases; product intent is back to My Trips from Home, but avoid gesture conflicts.
2. Auto-advance: tag-based manual navigation is designed; no explicit approval for automatic cycling.
3. Widget selection/ranking and expiration thresholds beyond Preparation; requires per-Widget approval.
4. Global Search destination/availability: top-right placement requested; earlier coordinator handoff deliberately omitted inactive Search. Main Product Chat must reconcile before enabling icon.
5. Precise Home Hero edit hit targets and separation between basic Trip edit vs Members management.
6. Actual module availability, Trip-root read completeness, authenticated offline permissions and production Day/Today acceptance must be verified against current Git. Historical recovery reports are not present-day implementation certification.

## 12. Coordinator handoff instructions

1. Main Product Chat reconciles this contract with unified Decision Register, Interface Register, latest Trips/Shell revision and current repository before granting IMPLEMENTATION AUTHORIZED.
2. Keep **OWNER APPROVED**, **PROPOSED**, **DEFERRED** and **UNVERIFIED** distinctions; do not treat candidate Widget table as implementation scope.
3. Preserve prior approved Trips/Shell and Day Feed contracts. Do not use old Gallery fixtures as production data, duplicate routes or fabricate absent module authority.
4. Scope engineering into shell/host and independently approved Widget integrations; implementation owner handles technical design, coding, reviews, native Visual QA and integration.
5. Do not require Owner to adjudicate ordinary layout, migration, test or routing details. Escalate only genuine product conflicts or new capability promises.
