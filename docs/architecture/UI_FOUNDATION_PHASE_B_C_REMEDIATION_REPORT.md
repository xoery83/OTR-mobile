# UI Foundation — Phase B–C device-gate remediation

Date: 2026-10-03. Initial remediation verified; see latest foundation-surface and
palette follow-up below for current verification/counts/installed Release.
OWNER DEVICE VISUAL GATE AWAITS RECHECK. No visual PASS; Phase D remains blocked.

## Root causes

- Initial migration covered parent screens but deferred existing child trees and
  siblings. My Ledger and Analysis consumed static light `contentVisual.color`;
  Entry form cards/rows/chips, receipt sheets and analysis styles had independent
  light surfaces. A receipt fade gradient also embedded white outside ordinary
  color properties. Dark navigation therefore did not imply dark content.
- Expense/rate native date pickers explicitly forced `themeVariant="light"`.
  A themed sheet header could not override that native body configuration.
- Spending/Settlement rendered localized base Text underneath static English
  Animated.Text. Both rendered labels occupied the same segment. Spacing was not
  the cause. Each segment now has one localized Animated.Text; its semantic color
  retains the existing pager animation. Other representative segments were checked.
- UI labels/configuration arrays, category/status presentation helpers and child
  sheet copy bypassed localization. Canonical values and user data were previously
  rendered alike; module-level translated snapshots could also freeze old locale.
- The first guard allowed historical baseline violations in migrated children,
  did not recursively establish covered trees, and missed Animated.Text,
  configuration copy, embedded gradients, static theme aliases and fixed native
  appearance. A literal-only guard could not prove semantic propagation.

## Shared foundation fixes

`src/ui/forms.tsx` owns UiTextInput, UiFormRow, UiChoiceChip and UiDatePicker.
Ordinary forms inherit semantic foreground/surface/placeholder/border/selection/
disabled/action roles, native input keyboard appearance and existing accessibility
and layout behavior. MoneyText still uses the canonical formatter and now directly
uses canonical visual geometry. No new dependency or money implementation.

`useUiAppearance` follows iOS system state. The installed native date picker remains;
its adapter explicitly supplies system-derived themeVariant and semantic text/
accent colors. Spinner mode receives the selected UI formatting locale; other
modes keep iOS-owned locale behavior. The upstream API documents these mode limits:
[native picker API](https://github.com/react-native-datetimepicker/datetimepicker#themevariant-optional-ios-only).
Analysis GlassView follows the supported system color scheme with semantic tint:
[Expo GlassView API](https://docs.expo.dev/versions/latest/sdk/glass-effect/).
No app appearance setting or custom picker was introduced.

Semantic palettes now include chart series and media surfaces. Receipt images,
PDFs and user media pixels remain intact. The shared Analysis style factory,
receipt sheet/tags, currency picker, FX/payment/readiness presentation children,
input primitives, navigation titles and diagnostics shell consume the foundation.

## Representative coverage and screen-specific work

Spending, Settlement, Search/Advanced Filters, Expense Detail, New/Edit Expense,
My Ledger, Spending Analysis, their imported sheets/pickers and Diagnostics now
receive strict coverage: **34 UI source files**, recursively resolved from roots.
Route-based date/rate surfaces are explicitly registered as roots.

Screen work connects existing geometry and labels to shared roles/adapters; there
are no screen-local Light/Dark branches or special dark color patches. The
segment duplicate was removed at its actual renderer. Existing fields, draft
state, toolbar/Back, handlers and destinations remain. The disposable fixture adds
ordinary/disabled input, choice/row and native sheet/picker demonstrations without
Trip product IA, model, routes or persisted business data.

## Localization gaps fixed

Both catalogs contain **820 populated keys** with matching typed coverage and
English fallback. Mounted consumers subscribe to locale. New/Edit forms,
analysis ranges/charts/insights, category/status labels, receipt review, native
navigation actions, sheets, empty/error/loading states, accessibility and fixture
copy use catalog display labels. Canonical category/status mapping is centralized
in `src/ui/domainLabels.ts`; search option values and stored enums remain original.
Known system errors are mapped at display time, including catalog templates when
locale changes after an error occurred. Native formatting uses selected locale.

Journey/person names, expense titles, filenames, arbitrary custom categories and
user-entered content remain unchanged. Persisted FX evidence/reasons and audit
reasons are deliberately preserved. No translation of database/domain values.

## Guard improvements and historical debt

- Strict representative tree checks have **zero baseline forgiveness**. New UI
  files are also strict; a frozen pre-foundation file inventory distinguishes
  existing out-of-scope files even when they had no old scanner findings.
- Added detection for Animated.Text/configuration copy, gradients, static theme
  aliases/imports, fixed native appearance, module-initialized translated labels
  and raw inputs/date pickers bypassing canonical forms.
- Regressions cover hidden English overlay/configuration, static light aliases,
  native picker/input bypasses, frozen localization and embedded gradient colors.
- Baseline was only pruned after proving no new debt: **1,128 historical candidate
  occurrences remain (795 strings, 333 colors; 962 distinct baseline keys)**,
  outside strict covered trees. No newly discovered violation was baselined.
- Exact-line documented exceptions retain four legacy Review static color usages,
  its compatibility light-palette import and an internal unsupported-locale error.
  Review receives comments only, without business behavior changes.
- `npm run ui:guard` remains part of lint. No CI workflow/enforcement claim.
  Future module roots must be registered so reused legacy children receive strict
  coverage. Static checks cannot establish runtime contrast or detect all computed
  strings; pure presentation helpers require explicit review.

## Automated verification and behavior protection

- Typecheck and full lint/guard pass; changed-file formatting/diff checks pass.
  Repository-wide formatting still has seven unrelated existing failures.
- Foundation: **4 suites / 12 tests pass**. Targeted UI/presentation checks:
  **8 suites / 58 tests pass**. Render checks exercise both locales × both system
  appearances, canonical disabled/placeholder/selection roles and native picker
  appearance, locale, unchanged value and callback identity.
- Latest full test run: **161 suites pass / 2 existing suites fail;
  1,135 tests pass / 1 fails**. Existing failures: account-switch imports RN Flow
  syntax in the Node test environment; architectureBoundary rejects the unchanged
  Expense Detail type-only API-contract import. Neither check was weakened.
- One prior full run also hit the unchanged API client test's brittle assertion:
  it forbids `42` anywhere in diagnostic JSON and the timestamp contained `42`.
  Isolated retry (7 tests) and full retry pass that suite; client code unchanged.
- AST comparisons for 11 relevant sources preserve routes, material business call
  names/argument counts, state/ref and effect dependencies. Event differences are
  localized display labels/explanations or forwarding moved into shared form
  rows/chips; financial submit payloads remain unchanged. These structural checks
  support, but do not replace, device interaction review.
- `src/domain`, `src/data`, Backend and iOS native source have no changes. No
  SQLite/schema, backend, sync/offline, Settlement/FX policy, Review/Payments logic,
  permissions or navigation destination changes. Production was not accessed.

## Signed Release and next owner gate

Release build succeeded and strict signature verification passed (team
U9D5C58Z94, signed 2026-10-03 12:43:22). Embedded-bundle artifact:
`/private/tmp/otr-ui-foundation-release/Build/Products/Release-iphoneos/OTRMobile.app`.
Installed in place on owner's iPhone 16 Pro as `com.xoery.otrmobile`; install
reported success. No uninstall, app-data wipe or financial fixture write.

Review the expanded representative surfaces in English and 简体中文 while switching
**iOS system appearance** with the app running. Include New/Edit unsaved drafts,
receipt/currency/date/filter/rate sheets, disabled/selected/placeholder states,
charts, segment labels, native Back/toolbars, MoneyText and larger text. Existing
Dev Settings → Debug Mode → UI Foundation sample opens the disposable fixture.

Known exceptions: native non-spinner picker/system-owned copy follows device iOS
locale; unknown remote/technical error text and persisted business evidence remain
verbatim; legacy screens outside these trees retain documented debt. No visual
PASS is inferred from tests or installation. Stop here; owner acceptance is needed
before Phase D.

## Follow-up — app-foundation surfaces and central Dark palette

Owner re-review found the Dark architecture substantially working, with remaining
foundation surfaces and overly competing surface levels. This is still B–C;
Phase D remains blocked. The following supersedes earlier counts/build readiness.

- Global Menu and its directly opened Account screen, Settings/System Health,
  Currency (existing `expenses/currency` reuses `expenses/settings`), explanation
  popover and imported currency/rate/picker children now use canonical semantic
  styles and populated locale catalogs. Account login uses UiTextInput. Native
  Switch consumes semantic track roles; system thumb behavior is retained.
- Currency's device-language detection was replaced by subscribed UI locale.
  Existing confirmation, preview/counts, locked/organizer/offline labels, errors,
  help and picker actions are localized. Currency codes/Journey names and all
  preview/commit fields remain unchanged. MANUAL_AGREED/ACTUAL_PAYER_COST receive
  display labels; persisted policy values remain unchanged.
- Account copy, confirmations, accessibility and known errors are localized;
  user identity/email stays unchanged. Internal approved-test-account error text
  retains an exact-line exception because the existing classifier matches it;
  displayed error is localized. No auth/coordinator policy change.
- System Health maps existing generated stage/summary/attention/count copy at
  render time. Timing is localized with its original values. The data-health
  coordinator/scheduler/presentation source is unchanged. Internal finding IDs,
  categories, target IDs and digests remain technical data, verbatim.
- Shared system-message reverse mapping now excludes parameter-only templates:
  money/accessibility messages previously matched arbitrary text before specific
  generated messages could match. Checks cover numeric health templates, locale
  switching and unchanged custom/technical values.

Central palette refinement changes only `src/ui/palette.ts`:

| Dark role                           | Color / relationship              |
| ----------------------------------- | --------------------------------- |
| background / groupedBackground      | `#101112`                         |
| surface / expandedSurface           | `#1B1C1E`                         |
| elevated / interactive surface      | `#242628`                         |
| separator                           | `#2C2E30`, subtle outline/divider |
| primary / secondary / tertiary text | `#F3F4F6` / `#BCC0C4` / `#9EA3A8` |
| accent                              | existing teal `#78D6C5`           |
| selected / accent surface           | unified teal-tinted `#193A34`     |

Ordinary neutral surfaces have exactly three levels. Text hierarchy now decreases
in luminance; status colors, chart colors, Light palette and immersive media roles
remain unchanged. Existing layouts/typography/spacing/card border geometry remain;
subtle shared separator avoids competing strong outlines. Menu shadow consumes
semantic shadow rather than text color. No page-specific appearance branches.

Strict guard coverage is **40 UI files**, including explicit foundation route
roots and their `.tsx` import trees. Baseline only pruned: **919 historical
occurrences (667 strings, 252 colors), 799 keys**. No new debt baselined.
Both catalogs have **940 populated keys** with matching parameter coverage.

Verification: typecheck, full lint/guard, changed-file formatting and diff checks
pass; targeted **8 suites / 33 tests pass**, including contrast, three-level
palette hierarchy, generated localization, currency data, health presentation and
menu model. Full run: **161 suites pass / 2 existing fail, 1,136 tests pass / 1
fails** (same RN Flow account-switch and unchanged architectureBoundary import).
AST comparison confirms Currency/Account/System Health routes, material call
names/counts, state/ref and effect dependencies remain unchanged. Backend/data/
domain/native source have no changes; Production was not accessed.

Release build and strict signature verification passed, signed **2026-10-03
13:05:51** by the existing team. Installed in place on owner's iPhone 16 Pro as
`com.xoery.otrmobile`; no uninstall or app-data clearing. Artifact remains
`/private/tmp/otr-ui-foundation-release/Build/Products/Release-iphoneos/OTRMobile.app`.
Logs: `/private/tmp/otr-ui-app-foundation-{tests,full-tests,lint,typecheck-final,release-build}.log`.

Next owner check: Global Menu/Account, Settings/System Health/Debug Mode,
Currency/picker/help and the central Dark palette across existing representative
surfaces, in English/简体中文 and iOS system Light/Dark. No visual PASS; stop before Phase D.

## Final follow-up — segmented selection and Journey chrome boundary

Owner additionally reported inconsistent segment label selection and Journey
chooser chrome overlapping native navigation. Remain B–C; await device re-review.

`src/ui/segmented.ts` now supplies the single segmented selection contract:
neutral grouped track, elevated selected surface, primary selected label/icon,
secondary unselected label/icon, existing accent indicator. Existing renderers
consume these shared tokens, including animated Spending/Settlement, Mine/Group,
My Ledger sections/period, Analysis scope and Settlement section/scope controls.
Geometry, animation progress/handlers and border/indicator sizes remain. Root
Tabs explicitly retain accent active and secondary inactive icons/labels. Unused
`ledger-prototype` controls were inspected but are outside canonical runtime;
no app route imports them and they were not migrated.

The accepted Journey row geometry (48pt minimum, title/tag/chevron arrangement)
and NavigationContextTitle geometry are unchanged. Source comparison found that
Journey content chrome is an absolute transformed sibling of the ScrollView:
automatic content inset protects the scroll content, not that sibling. Upward
collapse also lacked a content-boundary clip. This ownership mismatch permits
content chrome to enter native-header space; changing row padding would not fix
ownership. The shared `NavigationContentFrame` explicitly pairs native overlaid
header options with a single measured native-header inset (safe area included)
and a clipped body viewport. Managed inner scrolls disable automatic top inset.
No Ledger-specific header padding, magic offset, route or chooser handler change.
Hierarchy remains native top navigation → Journey chooser → page segments.

Other NavigationContextTitle consumers were checked: Analysis already measures
native header height for its pinned scope and disables automatic inset; Review
places its context inside native header without a floating chooser. Those inset
strategies and native Back remain. Final position/collapse under actual iOS
navigation still requires owner device review, not inferred visual acceptance.

Fixture access now requires Dev transport **and persisted Debug Mode** at the
Diagnostics renderer, not only a hidden Settings link. Preferences are rechecked
on focus with cancellation/error defaults hiding the fixture; deep entry cannot
bypass Debug Mode. The existing diagnostic screen/route is retained.

Typecheck, lint/strict 40-file guard, formatting and focused checks pass. Focused
suite verifies shared selection roles, animated single label, root-tab accent,
measured frame inset/clipping at two header heights, Review title and Debug Mode
exposure. Full verification retains the two known failures only; a new Review
Node harness failure from importing the native header hook was resolved by mocking
that hook while retaining its existing assertions. Detailed final counts and
signed install timestamp are recorded in CURRENT_IMPLEMENTATION_STATE.md.
Production/protected business source remains untouched. Stop at owner device gate.

Final focused verification: **9 suites / 41 tests pass**; last full run: **161
suites pass / 2 existing fail, 1,139 tests pass / 1 fails**. Final Release signed
**2026-10-03 13:23:04**, signature verified and installed in place successfully on
the owner's iPhone with the same bundle/data container. No uninstall/data clearing.
Logs: `/private/tmp/otr-ui-final-gate-{target-tests,full-tests-confirmed,typecheck,lint,release-build}.log`.

Analysis tabs visual follow-up: remove the redundant pinned-container hairline,
this screen's native header shadow and standalone GlassView edge highlights.
Pinned scope uses canonical segment track surface with existing primary/secondary
labels, elevated selection and teal underline. Native header blur, measured inset,
layout and scope-switch handlers remain; other screens unchanged. Typecheck,
scoped lint/strict guard and 2 suites/27 tests pass. This supersedes the earlier
Analysis GlassView wrapper description; no dependency removed or added.

Dark segmented-track follow-up: groupedBackground aliases page background in
Dark Mode, so using it as the track erased the container boundary. Shared palette
now has controlTrack: Light retains `#F1F5F9`; Dark reuses the existing neutral
surface `#1B1C1E`, against page `#101112` and selection `#242628`. No fourth
ordinary surface shade, local appearance branch, border, spacing or typography
change. Shared segmented tokens propagate the role to existing consumers; active
root-tab accent and selected primary/unselected secondary labels remain. This
supersedes the earlier grouped-track assignment.

Verification: typecheck, scoped lint, strict guard, formatting and 6 suites/36
tests pass. Release signed 2026-10-03 15:04:44, verified and installed in place,
preserving app data. Owner visual gate remains pending; Phase D blocked.

Attachment preview contrast follow-up: count/navigation copy incorrectly used
onAccent (the foreground for a teal action background) on mediaBackground.
The existing shared viewer text style now uses mediaText, matching its Close
icon and retaining high contrast in both appearances. Image/zoom/swipe/selection
handlers and ordinary content palettes remain unchanged.

Category sheet follow-up: themed cards/header were drawn over an unthemed native
Modal ScrollView viewport. Category and Sharing sheet ScrollViews now reuse the
existing semantic flex/background style; CurrencyPicker already owns its themed
viewport. No category data, split state, selection/commit/cancel behavior, spacing
or typography changes. Normative guidance now distinguishes viewport style from
contentContainerStyle and theme outside a native Modal boundary.

Category follow-up verification: typecheck, scoped lint/strict guard, formatting
and 2 suites/14 tests pass. Release signed 2026-10-03 15:08:08 verified and
installed in place, retaining app data. Owner device gate remains pending.

Date-wheel backdrop follow-up: the full-screen dismissal Pressable reused the
opaque semantic page flex style, covering the translucent backdrop with solid
background. It now uses StyleSheet.absoluteFill with no background; the existing
semantic overlay alone dims the underlying page. Native picker, value/draft,
Cancel/Done, tap-to-dismiss and animation handlers remain unchanged. Normative
guidance distinguishes transparent hit-target fill from opaque modal body style.

Date backdrop verification: typecheck, scoped lint/strict guard, formatting and
2 suites/14 tests pass. Signed Release 2026-10-03 15:09:55 verified and installed
in place with app data retained. No visual PASS; Phase D remains blocked.

## 2026-10-03 Review / Settlement operation device findings

- Root cause: route-based Review inbox/finding, personal settlement preview, update,
  correction and history/statement retained static Light palettes and were missing
  strict representative roots. The four prior Review scope exceptions are removed
  because the owner explicitly expanded B–C coverage to these surfaces.
- Shared foundation: reuse reactive semantic roles, locale subscriptions, MoneyText
  and UiTextInput (including placeholder, selection, disabled and native keyboard
  appearance). No new palette, page-local Dark branch, dependency or native replacement.
- Screen integration: all six retain their existing geometry and operations. Cards,
  warning/balance surfaces, headings, money, separators, selected actions and empty
  viewports obtain canonical colors. Media preview's separate immersive roles remain.
- Localization: both catalogs now have 1,151 populated keys. Inbox category IDs and
  decisions stay neutral; UI shows localized labels. System finding titles/descriptions,
  evidence, counts/plurals, version/date copy, confirmation/correction/export prompts
  and known error messages switch at display time. Genuine human notes, expense titles,
  payer/member names and persisted values remain unchanged, including values whose
  text happens to match an English system label. Missing-title fallback is localized
  without translating an actual title named “Expense”.
- Guard: register all six route surfaces as strict roots; recursively check 46 UI
  files without baseline forgiveness. Extend coverage regression to require the six
  roots. Existing detector already rejects the exposed static literals/native form
  bypasses; missing coverage and obsolete scope exemptions were the gap. No baseline
  additions: prune 256 resolved occurrences, leaving 663 (509 string / 154 color),
  across 598 baseline keys. No CI enforcement claim.
- Verification: typecheck, lint/guard, changed-file formatting; 12 focused suites /
  44 tests pass. Dark/zh-Hans and Light/en rendering checks cover the new operations,
  warning and card colors, evidence, populated catalogs and preserved user content.
  Pre-change source comparison retains routes/state/effect dependencies and all 28
  normalized action handlers. Financial calculations, decision actions, correction
  params and confirmation predicates remain unchanged. Existing full-suite failures
  recorded above were not addressed by this presentation pass.
- Remaining exceptions: historical debt outside these approved trees remains;
  arbitrary upstream technical error details and unknown future domain values retain
  their raw fallback rather than receiving guessed translations. User/business data
  intentionally remains untranslated. No new per-screen color/string exceptions.
- Delivery: Release signed 2026-10-03 15:24:12 built and signature verified;
  installed in place on the owner’s iPhone 16 Pro. Installation returned the same
  database UUID as prior installs, preserving existing app data.
  Owner device re-review remains required; automated rendering is not visual PASS.
  STOP in Phase B–C; no Phase D or Production access.
