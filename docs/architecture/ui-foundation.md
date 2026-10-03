# OTR UI Foundation

Normative specification. Read before creating or materially changing any
user-facing UI. Root `AGENTS.md` makes this mandatory in fresh Codex sessions;
nested instructions must retain it. This is the single source for UI conventions.
User-facing copy/localization also follows the normative
[OTR Terminology Glossary](OTR_TERMINOLOGY_GLOSSARY.md); read both before editing
labels or messages. Do not infer domain changes from display vocabulary.

## Theme and appearance

Use `useUiTheme` and `useThemedStyles` from `src/ui/theme.ts`. The system's
`useColorScheme` selects the semantic palette; screens never branch on appearance.
There is no OTR appearance preference or theme selector. Keep Expo automatic
appearance and the native navigation theme in agreement. Use semantic background,
surface, elevated surface, text, separator, accent, selected, disabled, destructive,
warning, success and informational roles. Only `src/ui/palette.ts` defines colors.
Pair status backgrounds with their matching foregrounds; state also needs text/icons.
Preserve photos/receipts; fixed media-stage colors require a narrow annotation.

Dark ordinary content has three neutral surface levels: background, surface and
elevated/interactive surface. Grouped backgrounds alias background and expanded
content aliases surface. Separators are subtle; ordinary cards must not gain both
a strongly raised surface and a prominent outline. Keep teal accent/status roles
for their existing meanings. Media-stage chrome retains immersive media roles.

Use the same roles for inputs, charts, tags, loading/error/empty states and sheet
chrome. Native controls keep their system behavior. Appearance changes must update
mounted screens without resetting drafts, scroll anchors, selection or data hooks.
Device acceptance changes iOS system appearance while the app is installed/running.

## Typography, spacing and containers

`src/ui/visual.ts` owns the roles extracted from accepted Ledger typography:
eyebrow, section, row/body, meta/secondary, action, metric, rowAmount,
secondaryAmount and percent, plus shared radii and spacing. Extend only for a
documented recurring need. Preserve native font scaling and accepted bounded money
fitting. Avoid disabling scaling or squeezing translated content into fixed heights.

Use `UiSection` and `UiButton` from `src/ui/controls.tsx` for equivalent recurring
content concepts. Button variants are primary, secondary, text and destructive;
disabled behavior includes interaction and accessibility state. Keep targets at
least 44pt. Do not wrap every View in a new primitive. Existing Ledger layouts can
retain geometry during migration; new modules use canonical roles rather than
inventing a card radius, divider, font hierarchy or spacing rhythm.

## Segmented selection

Use `segmentedControlTokens` from `src/ui/segmented.ts` for segmented controls,
including animated pagers, scope/period switches and in-content section tabs.
Track uses controlTrack (Light grouped gray; Dark neutral surface), visibly
separate from page background. Selected surface uses elevatedSurface, selected labels/icons use textPrimary,
and unselected labels/icons use textSecondary. Keep existing geometry and
border/indicator treatment; accent may remain an indicator, not a selected label.
Root/bottom navigation is separate: active icons/labels use accent, inactive
icons/labels use textSecondary. The diagnostics acceptance fixture requires both
Dev transport and persisted Debug Mode, even when reached directly.

## Localization and formatting

`src/ui/catalogs.ts` contains populated `en` and `zh-Hans` dictionaries with
concept-based keys (`common`, `navigation`, `ledger`, `expense`, `settlement`,
`search`, `format`, `currency`, `fixture`). English is the fallback. Add another dictionary
centrally without changing screens. Use `useUiLocale()` to subscribe a component,
and `t(key, params)` for whole messages. Do not concatenate translated fragments;
interpolate named values or use explicit plural message keys. Missing parameters
are errors. Dynamic business titles/names stay as supplied, not translated.

The existing Language menu switches locale. Preference storage is device-local,
outside screens and separate from account/auth/business data; hydration must not
block app launch. Locale changes must not trigger business mutations or reset
mounted screens. Stored IDs, enums, keys, dates and machine state remain neutral.
Canonical category/status values use `src/ui/domainLabels.ts` display mapping;
unknown custom business values remain unchanged. Do not translate stored enums,
audit reasons or evidence. Subscribe before rendering translated configuration;
never compute translated labels at module initialization. Every segment renders
exactly one localized label.
Historical English is temporarily allowed only outside covered trees through the checked-in baseline.
All new UI text, placeholders, accessibility labels and hints must be localized.

Use canonical Intl helpers in `src/ui/locale.ts` for dates, times, numbers and
percentages. Calendar dates must retain their date-only semantics; do not turn
display localization into a change to time zones or persisted keys.
Money always uses the existing `MoneyText` and `src/features/ledger/format.ts`:
same integer minor units, explicit scale, signs, currency hierarchy, original vs
Journey value and Hermes parts fallback. Never create a Trip money formatter.

## Native controls and navigation

Retain native Stack Back, navigation titles, direct `Stack.Toolbar.Button`
children, installed native date picker, system menus/confirmation dialogs and
QuickLook dismissal. Do not replace them with React Native imitations to theme
them. `AppIcon` owns SF Symbols. Icon-only actions need localized VoiceOver labels;
icon size is independent of the 44pt target. Text actions remain appropriate for
explicit task decisions. Shared `NavigationContextTitle` owns context subtitles.

Journey workspaces with floating/collapsing content chrome use the shared
`NavigationContentFrame` with `navigationContentFrameOptions`: native header
is explicitly overlaid, the frame reserves its measured height (including safe
area) once, and its content viewport clips collapsing chrome below that boundary.
Inner scroll views disable automatic top inset for that managed frame. Native
title/toolbar owns the top bar; chooser context remains content, never a second
native header. Do not add screen-specific header offsets.

Root areas keep their existing Menu/title/context actions/tabs. Journey primary
screens may show Journey context; detail/task screens use native Back and minimal
task actions. Keep `bottomBarVisibility` and all navigation destinations unchanged.
Do not introduce a second top bar or repeat Journey selection on deep pages.

`SheetHeader` owns existing sheet titles, action targets, disabled state and
large-text behavior. `OverlayDismissAction` owns lightweight Close. Back moves
through hierarchy; Cancel abandons a task/selection; Close dismisses a preview or
overlay. Preserve each caller's handlers and dismissal semantics. Destructive
actions belong in the appropriate editing/task context with safe confirmation.

## Forms, state and accessibility

Use `UiTextInput`, `UiFormRow`, `UiChoiceChip` and `UiDatePicker` from
`src/ui/forms.tsx` for ordinary forms. They supply semantic foreground, surface,
placeholder, separator, selected, disabled and action roles. Screen styles may
retain layout geometry; they must not override these with fixed appearance colors.
Use the native picker through this shared adapter: system-derived `themeVariant`,
semantic text/accent, and a locale override only for supported spinner mode. Other
native picker presentations retain iOS-owned locale behavior. Preserve the exact
value, callbacks and commit/cancel semantics.

Transparent overlay hit targets use layout-only fill (for example
StyleSheet.absoluteFill); do not reuse an opaque page/body style there.
Only the semantic translucent backdrop supplies dimming.

Every native Modal/sheet body must theme its entire viewport, including unused
space below short content. A themed parent outside Modal or a ScrollView
contentContainerStyle does not theme the native modal host; apply semantic
background to its flex body/ScrollView style as well as its children.

Reuse established form labels, values, placeholders, helper text, validation,
picker/navigation rows, disabled state and destructive sections. Do not change
commit/cancel behavior while migrating styles. Errors must be readable and
actionable; loading and empty states need localized copy. Financial, finding,
warning, pending and confirmed states retain their business meaning and display
text/icons alongside semantic colors.

Preserve Dynamic Type, VoiceOver labels and full money descriptions, adequate
contrast in both palettes and touch targets. Check long Chinese/English copy and
larger text on device. Automated palette/component checks cannot establish visual
PASS. Do not add a large unrelated accessibility rewrite.

## Guardrails and exceptions

Run `npm run ui:guard` (also included in lint). The TypeScript AST scanner checks
app, components, feature UI and the foundation. It rejects new color literals,
visible JSX copy, known text/accessibility props and UI message literals, and
deprecated canonical chrome imports. The per-file/rule/content/count baseline
allows existing debt; removing old debt never authorizes different new debt.
Complete representative `.tsx` import/re-export trees and every Ledger route are checked with zero baseline
forgiveness. Register every future module root (including Trip) in
`scripts/ui/guard.ts:representativeRoots` so its reused children are also checked.
New UI files are strict using the frozen pre-foundation `legacy-files.json` file
inventory; that inventory grants no exception for new literals. The guard also
checks Animated.Text/configuration copy, embedded gradient colors, static legacy
theme consumption, fixed native appearance, frozen translated configuration and
raw inputs/pickers bypassing the shared form layer. Pure presentation helpers
and computed runtime text still need explicit review.
Normal validation must never regenerate the baseline. Baseline pruning removes
resolved entries; adding debt requires owner review.

An escape is `// ui-foundation-exception: <rule> -- <specific reason>` immediately
above the exact affected source line (`color`, `string` or `static-theme`). It applies only to
that line, not a file, function or directory. Palette/catalog files are the only
central literal exemptions. Translation dictionaries, machine identifiers and
tests are not visible UI copy. Detection is static and bounded: computed strings,
duplicated layout/control semantics and actual contrast/behavior still require
review. No CI workflow is currently configured; claim runnable enforcement only.

## Migration and verification gates

Owner accepted the Terminology Gate and authorized Phase D on 2026-10-03.
Owner confirmed Device Visual Gate PASS on 2026-10-03; Phase D Ledger migration
is complete and UI Foundation is active for all future user-facing UI.
Apply the accepted B–C foundation to all remaining Ledger UI and direct children,
including operation flows, forms, sheets and state copy. This is a migration,
not a redesign. Preserve business handlers, permissions, data lifecycles, routes
and scroll state. Work in coherent batches; classify literals before migration.
All current Ledger routes are strict guard roots, including re-exported screens
and their imported children. Do not broaden this into Trip product development.

The disposable Trip acceptance fixture is diagnostics-only. It proves inherited
theme, localization, typography, controls, native toolbar/Back, dates, MoneyText
and accessibility; it establishes no Trip IA, navigation, card hierarchy or model.
Never replace the current Trip screen with it.

Run typecheck, scoped lint/format, guard regression checks and existing relevant
money/navigation/pager/filter/expense/settlement tests. Report existing failures
explicitly without weakening checks. Prepare a signed embedded-bundle iPhone
Release using `docs/IOS_DEVICE_RUNBOOK.md`; preserve app data. Report automated
results separately from device appearance/locale/sheet/form/chart/tag/large-text
acceptance. Stop at the full-Ledger Phase D device visual gate and wait for owner review.
Do not enter Phase E/F or Trip development without separate owner authorization.

UI foundation requires no SQLite/schema, Backend/Supabase, sync/offline, Settlement,
FX, Review, Payment or permission change. Do not access Production. Stop and report
if any such change or navigation semantic change becomes necessary.

Owner-expanded B–C device gate also covers Review inbox/finding, personal settlement
preview, Changes/update, confirmed-expense correction, and settlement history/statement
with their direct children. This authorizes presentation-only theme/localization
remediation, preserving all review decisions, confirmation gates and financial payloads.
These accepted B–C surfaces remain part of the full-Ledger Phase D device gate.
