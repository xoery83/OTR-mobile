# OTR Mobile — UI Foundation & Guardrails

## Execution constraints (apply to every phase)

Execute this work in phases. Complete Phase A audit first and report the proposed foundation/migration plan before broad code changes. If no blocking architectural issue is found, continue with Phase B–C. Do not begin full Ledger migration until the representative screens pass code verification and are ready for device visual review.

Initial supported UI locales for the foundation are `en` and `zh-Hans`. English remains the fallback locale. The architecture must allow additional locales without screen-level changes. Full migration of all legacy strings is not required in this phase. Demonstrate actual English/Simplified Chinese switching on representative screens; empty catalogs do not satisfy acceptance.

Validate appearance switching by changing the iPhone/iOS system appearance while the app is installed/running; no OTR appearance preference UI should be introduced.

The representative Trip screen must be disposable/minimal and must not establish Trip product IA, navigation, card hierarchy, or business data models. Trip UX will be designed separately.

## 0. Mission

We are entering a new development stage of OTR Mobile. Ledger is substantially implemented, and Trip will become a major next module.
Before expanding Trip, consolidate the UI/UX rules already established during Ledger development into a canonical, enforceable application foundation.
This is NOT primarily a visual redesign.
The objectives are:

1. Make system Light/Dark Mode a native app-wide capability.
2. Establish localization/i18n architecture before more UI is built.
3. Preserve and formalize the native iOS control/navigation conventions already established.
4. Canonicalize buttons, typography, navigation chrome, sheets, spacing and semantic UI behavior.
5. Migrate Ledger onto these foundations without changing business behavior.
6. Add engineering guardrails so future modules naturally comply.
7. Put the rules somewhere that every future Codex session can discover before implementing UI.
   The desired end state is:
   A developer should normally get Dark Mode, localization readiness, native navigation behavior and OTR visual conventions simply by using the canonical primitives.
   Correct implementation should be easier than bypassing the system.
   Do not solve this by adding repeated instructions to individual screens.

## 1. First: audit before modifying

Before changing implementation, inspect the repository and document the current state.
Specifically identify:

- existing theme/color systems
- hard-coded colors
- existing localization/i18n infrastructure
- hard-coded user-facing strings
- typography definitions
- navigation/header implementations
- native vs custom toolbar controls
- shared button components
- shared sheet headers
- OverlayDismissAction
- MoneyText
- cards/sections/inputs/tags
- icons
- loading/error/empty states
- native picker usage
- QuickLook/attachment preview behavior
- accessibility-related shared primitives
- duplicated implementations of the same UI concept
  Also inspect the recent Ledger implementation rather than rebuilding concepts that have already been standardized.
  Do not assume there is only one implementation of Search, header, sheet, button or screen chrome.
  Produce a short architecture/audit report before broad migration.

## 2. Create a permanent OTR UI Foundation specification

Create one canonical repository document for these rules.
Preferred concept:
docs/architecture/ui-foundation.md
If the repository already has an established location for engineering conventions, use that instead.
This document is normative, not merely descriptive.
It must cover:

- semantic colors / theme
- Dark Mode
- localization
- typography
- spacing
- icons
- native controls
- navigation chrome
- top bars
- sheets
- buttons
- destructive actions
- forms
- cards/sections
- money presentation
- loading/error/empty states
- accessibility
- future-module requirements
  Do not duplicate the same rule across many documents.
  There must be one canonical source of truth.

## 3. Make the specification visible to EVERY future Codex session

This is essential.
Inspect the repository's current Codex/project instruction mechanism, including root-level instruction files such as AGENTS.md or equivalent.
The persistent project instruction file should NOT contain the entire UI specification.
Instead add a concise mandatory rule similar to:
Before creating or materially modifying user-facing UI, read docs/architecture/ui-foundation.md and use the canonical OTR UI primitives. Do not introduce hard-coded colors, user-facing strings, ad-hoc navigation chrome, or duplicate UI primitives.
Also point to any relevant testing/architecture documents.
The goal is:
A fresh Codex chat starting with no previous conversation history must discover these rules before implementing a new screen.
Verify the actual Codex instruction hierarchy used by this repository rather than assuming a filename.
If nested instruction files exist, make sure Trip/Ledger directories cannot accidentally override or lose the root rule.
Document how future sessions inherit the requirement.

## 4. Semantic Theme Foundation

Implement a canonical semantic theme layer.
Pages should describe semantic intent rather than Light/Dark appearance.
Conceptually support tokens such as:

- background
- groupedBackground
- surface
- elevatedSurface
- textPrimary
- textSecondary
- textTertiary
- separator
- accent
- destructive
- warning
- success
- disabled
- selected
- overlay
  Exact naming should follow the existing architecture where appropriate.
  Rule
  Business screens should not introduce arbitrary:
- #FFFFFF
- #000000
- hard-coded gray values
- appearance-specific RGB/RGBA colors
  unless there is a documented exceptional reason.
  Prefer native/system semantic colors wherever technically appropriate.
  The semantic layer owns Light/Dark mapping.

## 5. Dark Mode behavior

Default behavior:
Follow iOS system appearance automatically.
Do NOT add an OTR-specific Light / Dark / System preference at this stage unless existing product requirements already require it.
The app should respond correctly when the user changes system appearance.
Dark Mode is not simply color inversion.
Audit:

- backgrounds
- surfaces/cards
- separators
- typography
- selected states
- disabled states
- tags
- warnings
- findings
- charts
- inputs
- native sheets
- toolbar icons
- search
- settlement states
- expense states
- receipt UI
  Photos, receipts and user media should preserve their actual content. Adapt the surrounding chrome, not the media itself.

## 6. Localization / i18n Foundation

Do NOT attempt to translate the entire product into multiple languages during this foundation phase.
The objective now is localization readiness.
All NEW user-facing UI strings must use the canonical localization mechanism.
Avoid new hard-coded strings inside screens/components.
Establish a clear key/namespace convention.
For example, organize strings around stable product concepts rather than individual component filenames where possible:

- common
- navigation
- trip
- ledger
- expense
- settlement
- review
- capture
- settings
  Do not create unnecessary fragmentation.

## 7. Domain values must remain language-neutral

Stored domain values must not depend on display language.
Examples:

- category IDs
- status values
- finding types
- payment states
- settlement states
- role identifiers
  should remain canonical machine values.
  Localization maps:
  canonical value -> localized display label
  Do not persist translated labels as business truth.

## 8. Locale-aware formatting

Centralize locale-sensitive formatting.
This includes:

- dates
- date ranges
- times
- numbers
- decimal separators
- percentages
- currencies
- pluralization where applicable
  Do not manually concatenate translated sentence fragments when normal localization can express the message.
  Money presentation must continue to use the established canonical Ledger money formatting architecture, including MoneyText where applicable.
  Do not create a second money formatter for Trip.

## 9. Native iOS controls — default principle

Preserve the native-control direction already established during Ledger UI work.
When iOS already provides the appropriate interaction, prefer the native control unless OTR has a concrete UX requirement that native behavior cannot satisfy.
Examples include:

- Back navigation
- toolbar items
- navigation titles
- native sheets
- picker behavior
- QuickLook dismissal
- search behavior
- standard menus
- system confirmation dialogs where appropriate
  Do not recreate an iOS control merely to make it look custom.
  Custom UI is appropriate when it expresses OTR-specific information or interaction, not simply to replace a standard platform control.

## 10. Navigation chrome / Top Bar

Canonicalize the navigation rules already proven in Ledger.
Preserve the established hierarchy:
Root/top-level areas
May use:

- Menu
- primary screen/module title
- appropriate contextual actions
- bottom tab bar where applicable
  Journey-level primary screens
  May expose Journey context where it is useful.
  Avoid unnecessarily repeating the Journey selector deeper in the hierarchy.
  Deeper task/detail screens
  Prefer:
- native Back
- clear task title
- contextual subtitle only where useful
- minimal right-side task actions
- hidden bottom tab bar where the existing navigation model requires it
  Do not create a second custom top bar just because a new module is being implemented.

## 11. Toolbar action principle

Prefer recognizable icons for conventional compact actions.
Examples:

- Edit
- Search
- Add
- Close
- More
- Filter where the icon is sufficiently clear
  Use text actions when the action meaning would otherwise be ambiguous or when the task itself benefits from explicit wording.
  Maintain adequate touch targets, including approximately 44pt interactive targets where applicable.
  Visual icon size and touch target size are separate concepts.

## 12. Back / Cancel / Close

Continue the established distinction:
Back

- navigation hierarchy
- use native Back whenever possible
  Cancel
- abandoning an in-progress task or selection
  Close
- dismissing an overlay, preview or modal context where Cancel is not semantically correct
  Reuse canonical dismissal primitives such as the existing OverlayDismissAction where appropriate.
  Do not create visually different dismiss controls screen by screen.

## 13. Buttons

Audit current button variants and reduce them to a canonical set.
Conceptually distinguish:

- primary
- secondary
- tertiary/text
- destructive
- disabled
  Do not allow arbitrary screen-specific button styling when a canonical variant exists.
  Destructive actions must be visually and interactionally distinct from ordinary actions.
  Do not put destructive actions prominently in navigation chrome unless immediate destructive access is genuinely required.
  For flows such as Expense deletion, preserve the safer pattern already established: destructive actions belong in the editing/task context rather than becoming an unnecessarily prominent detail-view toolbar action.

## 14. Typography

Create or confirm a canonical semantic typography system.
Prefer roles rather than page-specific font constants.
Conceptually:

- screen/title
- section heading
- headline/value
- body
- secondary
- caption
- button/action
- numeric/money variants where necessary
  Respect Dynamic Type/native scaling where technically appropriate.
  Do not let Trip establish a separate typography system.
  The typography hierarchy proven in Ledger should become app-wide unless a concrete Trip use case requires an extension.

## 15. Money

Preserve the recently established canonical MoneyText / Ledger money formatting architecture.
Do not fork it.
Trip, Ledger, Expense, Settlement, Analysis and future modules should all use the same canonical financial display rules where the same semantic money concept is being shown.
Preserve:

- financial precision
- locale-aware formatting
- currency hierarchy
- integer/fraction visual hierarchy
- sign behavior
- original vs Journey currency distinctions
  Do not let individual screens manually reproduce money typography.

## 16. Cards / Sections / Lists

Audit recurring containers and consolidate where useful.
A new module should not invent:

- another card radius
- another divider style
- another grouped background
- another section-header style
- another spacing rhythm
  unless there is a documented product reason.
  Avoid over-componentization: create shared primitives for recurring design concepts, not wrappers for every View.

## 17. Forms

Standardize common form behavior:

- labels
- values
- placeholder treatment
- validation
- disabled state
- errors
- helper text
- picker rows
- navigation rows
- destructive sections
  New Trip forms should reuse the same form language as Expense/Settlement where the interaction is equivalent.

## 18. Status / Tag semantics

Status colors must be semantic and Dark-Mode safe.
Do not rely on color alone to communicate important state.
Ensure adequate text/icon distinction for:

- findings
- warnings
- errors
- confirmed/final states
- pending states
- split/status tags
- Journey status
  Existing business semantics must not change during visual migration.

## 19. Accessibility baseline

The foundation should preserve or improve:

- Dynamic Type compatibility
- VoiceOver labels for icon-only actions
- adequate touch targets
- sufficient contrast in Light and Dark appearance
- state not represented by color alone
  Do not undertake a massive unrelated accessibility rewrite in this phase.
  Create primitives that make future compliance the default.

## 20. Ledger migration

Ledger is the reference implementation and also the first migration target.
Do NOT rewrite Ledger business logic.
Do NOT change:

- settlement calculations
- FX logic
- expense logic
- synchronization
- offline behavior
- Review semantics
- permissions
- payment behavior
- navigation destinations
  unless a genuine pre-existing bug is discovered and explicitly separated from this project.
  The migration should primarily affect presentation/foundation layers.
  Audit and migrate representative Ledger surfaces including:
- Ledger landing
- Spending
- Settlement
- Search
- Advanced Search/filter
- Spending Analysis
- Expense Detail
- Edit Expense
- New Expense where relevant
- Rate Details
- Review
- Payment/Transfer flows
- Settlement History
- attachment/receipt surfaces
- relevant sheets
  Replace local UI implementations with canonical primitives only where behavior can be preserved.

## 21. Do not blindly mass-replace Ledger

Do NOT perform uncontrolled global search/replace of colors or strings.
Use staged migration.
Recommended order:
Phase A — Audit
Map existing UI primitives, colors, strings and duplication.
Phase B — Foundation
Implement:

- theme
- semantic colors
- typography
- localization infrastructure
- canonical shared primitives
- guardrails
  Phase C — Representative screens
  Migrate a small but representative set first:
- Ledger/Spending
- Expense Detail
- Search
- Settlement
  Validate both Light and Dark appearance.
  Phase D — Ledger migration
  Apply proven patterns across remaining Ledger UI.
  Phase E — Localization readiness
  Move existing high-value/shared Ledger strings into the localization system where this can be done safely.
  Do not force complete translation of every historical string solely to satisfy this phase.
  Phase F — Guardrails
  Turn the rules into enforceable development constraints.

## 22. Guardrails

This is a critical deliverable.
Where technically practical, add automated detection for NEW violations such as:

- hard-coded UI colors
- hard-coded user-facing strings
- direct use of deprecated UI primitives
- duplicated canonical controls
  Do not introduce a noisy lint system that generates hundreds of unactionable legacy failures.
  If the existing codebase has substantial legacy debt, establish a baseline so:
  existing debt may temporarily remain, but new debt is rejected.
  Prefer CI/lint/static checks over documentation alone.

## 23. Escape hatch

There will occasionally be valid exceptions.
Provide a documented escape mechanism.
An exception should require:

- explicit local annotation/comment
- reason
- narrow scope
  Do not make the guardrail so rigid that developers start disabling it globally.

## 24. Trip readiness

Before large-scale Trip UI development begins, demonstrate that a newly created sample/representative Trip screen can obtain the following without inventing local conventions:

- Light/Dark support
- localized strings
- typography
- screen background
- sections/cards
- buttons
- toolbar actions
- native Back behavior
- money formatting if needed
- date formatting
- accessibility baseline
  This is the acceptance test for the foundation.
  The objective is not to design Trip now.
  The objective is to make Trip inherit OTR conventions automatically.

## 25. Fresh-session test

Perform a documentation/instruction review as though this were a completely new Codex conversation with no previous context.
From repository instructions alone, a developer should be able to determine:

1. where the UI specification lives;
2. that it is mandatory for user-facing UI;
3. which canonical primitives to use;
4. that new hard-coded colors are prohibited;
5. that new user-facing strings must be localized;
6. that native iOS controls are preferred where appropriate;
7. that navigation/topbar conventions already exist;
8. that new modules must not fork Ledger conventions.
   If this cannot be discovered quickly, the persistent instruction setup is insufficient.

## 26. Scope protection

This foundation project must NOT become an excuse to refactor unrelated architecture.
Specifically protect:

- SQLite behavior
- sync
- offline-first semantics
- Supabase contracts
- settlement logic
- FX
- Review engine
- payment records
- audit history
- permissions
  Avoid schema/backend migrations unless genuinely required for the UI foundation. They normally should not be required.
  Production must not be touched.

## 27. Testing

At minimum validate:

- Light appearance
- Dark appearance
- switching appearance
- representative native sheets
- navigation
- text contrast
- icon visibility
- forms
- money
- charts
- tags/status
- loading/error/empty states
- long localized strings
- larger Dynamic Type where practical
  Run existing:
- unit tests
- TypeScript checks
- lint
- formatting
- relevant UI/component tests
  Do not claim visual PASS based only on automated tests.
  Final representative screens require real-device visual verification.

## 28. Do not break currently accepted native behavior

Recent native-control work should be treated as intentional unless audit proves otherwise.
In particular preserve the direction already established around:

- native toolbar actions
- native Back
- SheetHeader reuse
- OverlayDismissAction
- native picker behavior
- QuickLook dismissal
- compact icon actions
- 44pt touch targets
- simplified navigation chrome
  Do not replace native controls with custom React Native imitations merely to make them easier to theme.

## 29. Deliverables

At completion provide:
A. Foundation architecture
Explain the canonical implementation for:

- theme
- colors
- typography
- localization
- controls
- navigation
- formatting
  B. Persistent specification
  Provide the path to the canonical UI Foundation document.
  C. Codex instruction integration
  Show exactly how future fresh Codex sessions are instructed to read and follow it.
  D. Ledger migration report
  Identify:
- migrated areas
- intentionally deferred legacy areas
- remaining exceptions
- any duplicated components removed
  E. Guardrail report
  Show which rules are automatically enforced and which remain review conventions.
  F. Verification
  Report automated results separately from simulator/device visual verification.

## 30. Stop conditions

Stop and report rather than broadening scope if:

- complying requires material business-logic changes;
- a proposed canonical primitive would alter established Ledger behavior;
- navigation semantics would change;
- localization requires changing persisted business values;
- Dark Mode would require a backend/schema change;
- the existing project instruction hierarchy cannot reliably expose the UI specification to fresh Codex sessions.
  Do not silently solve such problems with a larger refactor.

## Final architectural principle

The target is NOT:
“Remember to support Dark Mode and localization when building Trip.”
The target is:
OTR's normal development path already provides theme, localization, native controls, typography and navigation conventions. A developer has to deliberately step outside the system to violate them, and automated checks should catch common violations.
Ledger should become the first fully migrated reference implementation
