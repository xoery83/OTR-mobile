# UI Foundation — Phase B–C code gate

Date: 2026-10-03. Historical initial code report. OWNER DEVICE VISUAL GATE
FAILED: complete tree coverage was insufficient. Superseded by
[Phase B–C remediation report](UI_FOUNDATION_PHASE_B_C_REMEDIATION_REPORT.md).
The findings/counts below describe the initial delivery, not current readiness.
Phase D has not started; automated verification does not establish visual PASS.

## Foundation architecture and fresh-session inheritance

- The single normative source is [ui-foundation.md](ui-foundation.md). Root
  [AGENTS.md](../../AGENTS.md) requires every fresh session to read it before
  creating or materially modifying user-facing UI, use canonical primitives and
  run the guard. Existing project instructions remain; nested instructions must
  retain the pointer. A fresh-session instruction read leads directly from root
  AGENTS to this specification and its runnable validation/migration boundaries.
- [ADR 0059](../adr/0059-ui-foundation.md) records the implementation choice.
  `src/ui/palette.ts` owns semantic Light/Dark roles; `theme.ts` uses the system
  color scheme and memoized style factories. Expo/native navigation receive the
  matching resolved colors. No app appearance preference was introduced.
- `src/ui/visual.ts` extracts accepted Ledger typography, spacing and radii.
  `controls.tsx` owns primary/secondary/text/destructive/disabled content buttons
  and sections. Native Back/toolbars remain native; shared SheetHeader,
  OverlayDismissAction, AppIcon and the existing MoneyText are extended/reused.
- `catalogs.ts`, `locale.ts` and `useUiLocale.ts` provide typed populated catalogs,
  named interpolation, English fallback and reactive locale/Intl formatting.
  No dependency was added. `native/uiLocalePreference.ts` uses existing SecureStore
  under a separate UI key, serializes preference writes and protects asynchronous
  hydration from overwriting newer choices. Bootstrap/auth are not gated.

## Representative migration

| Surface                    | Completed presentation work                                                                                                                            | Protected behavior                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Spending / Ledger          | Semantic surfaces/statuses/charts/text, localized visible controls/sections/ranges/amount captions and native actions                                  | Pager/selection, grouping, handlers, reads, routes and effect dependencies                |
| Expense Detail             | Semantic summary/status/attachment/FX/conflict presentation; localized details/edit/delete/attachment actions and shared date/money copy               | Edit/delete permission gates, attachment flows, settlement/FX/conflict operations         |
| Search + Advanced Filters  | Semantic results/inputs/filter sheet; localized search, date/filter options, counts, loading/empty/error and native actions                            | Filter enums/date keys, draft Apply/Cancel/Clear, badges, destinations                    |
| Settlement shared sections | Semantic tabs/status/summary/shared rate/payment children; localized core sections/actions/review snapshots; local content Action replaced by UiButton | Readiness/settlement calculations, Review/Payment/FX policy, permissions, calls and gates |

Immediate children receive semantic theme roles; they have not all received full
legacy copy migration. Accepted geometry is retained rather than redesigned.
AST comparisons against pre-migration sources preserved all four surfaces' route
sets, material calls, state/ref definitions and effect dependencies. Normalized
event/gate comparisons also match; the removed Settlement Action was a local
pass-through now supplied by UiButton. No new destinations or Trip business state.

## Locale switching and disposable fixture

Each locale contains **336 populated keys**, with identical key/parameter coverage.
The existing Menu → Language / 语言 presents English and 简体中文 and updates mounted
subscribers after durable preference storage. Tests verify switching, hydration
races/write failure, English fallback, dates and NZD/JPY/KWD precision/parts.
Representative translated content and the fixture subscribe to locale changes.
This is code verification; actual installed-device switching remains owner review.

The Dev-only fixture appears inside existing Diagnostics. Access: Menu → Settings
→ enable existing Debug Mode → UI Foundation sample. It demonstrates localized
text/date, semantic appearance, typography, canonical buttons/section, native
Stack toolbar plus existing route Back, a shared-header page sheet, MoneyText and
accessibility states/44pt targets. The sample has no Trip model, IA, navigation
hierarchy or product cards; the current Trip route is untouched. Historical
Diagnostics content below the fixture and Settings are not fully migrated.

## Guardrail implementation and debt

`npm run ui:guard` runs `scripts/ui/check.ts` and the TypeScript AST scanner;
`npm run lint` invokes it before ESLint. There is no CI workflow and no claim of
CI enforcement. Regression tests cover new JSX/message/color literals, content
sensitive baselines, machine comparisons, narrow exceptions, duplicate named
canonical controls and deprecated chrome.

The baseline was captured from pre-change tracked source and subsequently only
pruned for resolved entries. Keys include file, rule, offending content and count;
removing one old literal cannot authorize a different literal. Normal checking
never regenerates the baseline. Current inventory: **1,877 occurrences**, consisting
of **557 color** and **1,320 string** candidates, across 1,522 baseline keys. These
are scanner candidates rather than an exhaustive, fully classified UI-debt count.

Remaining historical debt includes unmigrated Add/Edit/Review/Analysis/Capture,
older Settings/Diagnostics/Trip prototype surfaces, direct-child PersonalPayment,
RateAcceptance and Conflict copy, and compatibility light-only exports consumed
by unmigrated screens. Existing fixed media-stage colors remain baseline entries;
no broad new exception or directory exemption was introduced. A future exception
must be on the exact affected line with a documented reason, as specified by the
normative source. Remaining Settlement snapshot punctuation/captions are historical.

Known scanner limits: computed/aliased/inter-file messages and semantically
similar unnamed controls require review. Some native machine arguments (`plain-text`)
and lifecycle comparison candidates (`ADDED`/`CHANGED`/`REMOVED`) remain inventory
false positives. Palette/catalog exemptions are central and bounded; catalog
colors still fail. This guard does not prove accessibility or visual correctness.

## Automated verification

| Check                                                                          | Result                                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                                                                      | PASS                                                                                                                         |
| Runnable UI guard + whole-repository ESLint                                    | PASS; changed-file lint also has zero warnings                                                                               |
| Foundation/catalog/contrast/control render checks                              | PASS for both appearances × both locales, interpolation/fallback, 44pt/disabled/destructive states and complete money labels |
| Locale preference checks                                                       | PASS; offline hydration, stale-read protection, serialized writes and failure preservation                                   |
| Existing representative money/navigation/filter/pager/expense/settlement tests | PASS within full run                                                                                                         |
| Full Vitest                                                                    | 160 suites passed; 2 existing suites failed. 1,130 tests passed; 1 failed; one suite fails before collecting tests           |
| Changed/new-file Prettier + git diff whitespace                                | PASS                                                                                                                         |
| Whole-repository Prettier                                                      | Seven unrelated existing files remain unformatted; not rewritten in this UI scope                                            |
| Native Release / embedded bundle / signature / in-place device installation    | PASS                                                                                                                         |

Existing full-test failures were not weakened or hidden:

1. `src/data/auth/accountSwitchFoundation.test.ts`: React Native Flow source fails
   Vitest/Rolldown parsing during import, before test collection.
2. `src/domain/architectureBoundary.test.ts`: rejects the existing type-only
   `@/data/api/ledgerMutationContracts` import in Expense Detail. The same import
   is present in HEAD before this UI work; no direct business API access was added.

Unrelated formatting files: both `docs/ledger/evidence/expense-consistency-phase6-*.json`,
`docs/ledger/SETTLEMENT_2_0_PHASE_0_DECISIONS.md`,
`docs/ledger/SETTLEMENT_2_0_TECHNICAL_AUDIT.md`, `src/data/db/database.test.ts`,
`src/domain/ledger/expenseIntent.ts`, `src/hooks/useStage4BPhysicalSmoke.ts`.

Final targeted regression: **11 suites / 36 tests passed** (foundation, locale preference,
MoneyText, shared sheets, navigation composition/chrome and Settlement update).

Verification logs: `/private/tmp/otr-ui-full-tests-final.log`,
`/private/tmp/otr-ui-lint.log`, `/private/tmp/otr-ui-foundation-release-build.log`.
No SQLite/schema, Backend/Supabase, sync/offline, financial logic, permission or
navigation destination changes; Production was not accessed. User Trip documents
remain untouched. No commit was requested or created.

## Installed-device handoff and stop gate

Signed Release installed in place on owner's iPhone 16 Pro, bundle ID
`com.xoery.otrmobile`; existing app data retained. The embedded `main.jsbundle` is
present. Host signature verification passes with system certificate access.
Build artifact:
`/private/tmp/otr-ui-foundation-release/Build/Products/Release-iphoneos/OTRMobile.app`.
This is a Dev transport build using the approved Dev API/Supabase configuration.

Owner acceptance still required:

- Change iOS system appearance while the app is running; inspect mounted Light/Dark
  surfaces, chart/status/input/sheet chrome without an OTR theme selector.
- Select both menu locales; inspect Spending, Expense Detail, Search/Advanced
  Filters and shared Settlement sections, native titles/actions/Back and dates.
- Inspect NZD/JPY/KWD amounts, signs/currency hierarchy, long copy, larger Dynamic
  Type, VoiceOver/touch targets and unchanged photo/PDF previews as available.
- Inspect the disposable fixture and its native toolbar/shared-header sheet.
  Avoid manufacturing financial data or special states just for this gate.

STOP HERE. No visual PASS has been declared. Do not begin Phase D full Ledger
migration until the owner completes this device visual gate.
