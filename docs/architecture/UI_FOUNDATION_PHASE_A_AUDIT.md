# UI Foundation — Phase A audit and proposed migration

Date: 2026-10-03. Status: audit complete; no runtime changes made.
Task: [UI Foundation & Guardrails](UI_FOUNDATION_TASK.md), including the owner's
four execution constraints. This report is an implementation proposal, not the
normative UI specification or evidence of completed foundation/migration.

## Findings

| Area                | Current implementation                                                                                                                                                                                                                                              | Proposed treatment                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appearance          | `app.json` already declares `userInterfaceStyle: automatic`. Root, Tabs and Ledger Stack still use fixed colors.                                                                                                                                                    | Retain system appearance; supply semantic navigation/content colors. No appearance preference UI.                                                                                                               |
| Theme               | `src/features/ledger/contentVisual.ts` contains static Light colors, typography, spacing and radii. `src/components/navigationChrome.tsx` has another static palette. `ledger-prototype/theme.ts` belongs to the isolated prototype.                                | Extract the proven content roles into an app-wide foundation. Keep a temporary Ledger compatibility export; do not adopt the prototype theme.                                                                   |
| Localization        | No localization package/catalog/provider found in package dependencies or app composition. `GlobalMenu` Language only shows an alert. Currency and Expense surfaces contain independent `Intl` locale checks and inline Chinese/English branches.                   | Implement typed concept-based keys and populated `en`/`zh-Hans` catalogs, English fallback and reactive locale consumption. Reuse Language entry for real switching, with preference ownership outside screens. |
| Formatting          | `format.ts` uses Intl; MoneyText and `formatLedgerMoney` share precision and parts policy, including the iOS Hermes fallback. Date labels/ranges and attention labels contain English copy.                                                                         | Keep one money formatter and one MoneyText. Pass the active formatting locale through the canonical path. Translate date/attention copy without changing calendar keys or persisted values.                     |
| Navigation          | Native Stack Back and direct `Stack.Toolbar.Button` are accepted. Shared `NavigationContextTitle` handles two-line context. Tab visibility is defined by `bottomBarVisibility.ts`.                                                                                  | Retain routes, native action declarations, visibility gates, titles/subtitles and navigation hierarchy. Theme/localize presentation only.                                                                       |
| Sheets/dismissal    | Shared `SheetHeader` owns 17 accepted instances, large-text layout, action gates and drag dismissal. `OverlayDismissAction` owns labeled 44pt overlay Close.                                                                                                        | Extend these implementations; preserve handlers, target sizes, symmetric title flanks and dismissal behavior. No replacement sheet/navigation host.                                                             |
| Buttons             | No app-wide Button primitive found. Settlement has a local `Action`; other screens use styled Pressables.                                                                                                                                                           | Establish only recurring content-button variants (primary, secondary, text, destructive, disabled). Keep native toolbar controls native; migrate local actions only when equivalent behavior is verified.       |
| Containers/forms    | Cards, section headings, tags and form rows use recurring styles with local variants. CurrencyPicker is a custom searchable list; Expense date uses the installed native datetime picker.                                                                           | Reuse existing typography/spacing/radii. Add shared primitives only for recurring concepts, not each View. Preserve picker selection/commit/cancel contracts.                                                   |
| Icons/media         | AppIcon wraps native SF Symbols. Expense image preview has fixed dark media chrome; local PDFs use the ReceiptOcr native QuickLook adapter.                                                                                                                         | Theme surrounding chrome; keep media pixels unchanged. Document narrow media-stage color exceptions. Retain native QuickLook dismissal.                                                                         |
| Accessibility/state | MoneyText has full semantic amounts and bounded hero fitting. SheetHeader has large-text behavior; native toolbar and overlays retain labels/targets. Loading, empty, error and status copy/style remain distributed.                                               | Preserve accepted behavior. Canonical roles must support readable contrast, explicit status text/icons and loading/error/empty states in both locales.                                                          |
| Instructions/checks | Root `AGENTS.md` is the only instruction file discovered inside this checkout; no ancestor AGENTS file was found. It does not point to a UI specification. Existing architecture tests, typecheck, ESLint and Prettier are available; no `.github` workflow exists. | Add one mandatory root pointer to `docs/architecture/ui-foundation.md`; add a runnable baseline guard integrated into existing validation. Do not claim CI enforcement without a CI workflow.                   |

Scoped inventory: 131 non-test `.ts`/`.tsx` files under `app/`,
`src/components/` and `src/features/ledger/` contain 812 quoted hex/RGB color
occurrences. This is a literal inventory, not 812 confirmed violations: media,
charts, existing token definitions and other legitimate exceptions need classification.

Representative files total 5,868 lines: Spending/Ledger 2,043 (73 color literals),
Expense Detail 760 (16), Search 1,120 (37), Settlement readiness 1,945 (72).
Search includes its advanced-filter sheet; Settlement readiness includes shared
section content. Migrating an entry screen alone will not cover its children.

## Proposed execution checkpoints

1. **A — report:** use this audit and the amended task as the starting handoff.
   Preserve unrelated untracked `docs/trip/` documents. No legacy Web reaudit.
2. **B — specification first:** create the single normative
   `docs/architecture/ui-foundation.md` and root mandatory read rule; record the
   actual theme/locale choice in the next ADR before implementation.
3. **B — foundation:** reuse contentVisual roles, MoneyText, AppIcon,
   NavigationContextTitle, SheetHeader and OverlayDismissAction. Implement system
   semantic appearance, populated typed locale catalogs and shared format access;
   add only necessary content controls. Validate installed native API/types before
   choosing how dynamic colors reach native navigation and React Native styles.
4. **B/F — guard:** capture existing UI debt by file, rule, offending content and
   occurrence count. A different new violation must fail even if old debt was
   removed. Use AST-aware string/color checks; exclude machine values and tests.
   Restrict palette/catalog exceptions and local escape annotations to a named
   reason and narrow node/line. Add scanner regression checks; never silently
   regenerate the baseline in normal validation.
5. **C — staged examples:** migrate Spending, Expense Detail, Search with filters,
   and Settlement shared sections, one surface at a time. Check direct child
   components; compare handlers, permission gates, destinations and state ownership
   against pre-migration sources. Migrate enough copy to demonstrate actual English
   and Simplified Chinese switching; list remaining historical English explicitly.
6. **C — disposable acceptance fixture:** show theme, localized text, typography,
   buttons/sections, native toolbar/Back, date and existing MoneyText together in
   a diagnostics-only sample. Do not replace the current Trip route, add Trip
   navigation/IA, establish a product card hierarchy, or create a business model.
7. **C — code gate:** run typecheck, scoped lint/format, foundation/locale/guard
   checks and existing money/navigation/pager/filter/expense/settlement regressions.
   Keep any pre-existing failing checks explicit; do not weaken architecture tests.
8. **C — device gate / D–E later:** report code verification separately from
   device acceptance. On the installed/running iPhone, change system appearance;
   verify both locales, native sheets/navigation, status/charts/inputs, long copy,
   money and larger Dynamic Type. Full Ledger migration cannot start before
   representative code verification and device-review readiness. Automated checks
   alone cannot establish visual PASS.

## Boundaries and readiness

No inspected requirement calls for a business model, schema, Backend, Supabase,
SQLite, auth, sync, settlement algorithm, FX policy or permission change. There is
no identified business-architecture blocker to the proposed presentation work.
Native dynamic-color/navigation compatibility and locale runtime behavior still
need code and device verification; this audit does not claim they already work.

Owner approved Phase A and authorized Phase B–C on 2026-10-03 without further
scope confirmation. This audit remains the historical proposal. Implementation,
verification, remaining debt and device readiness are recorded in
[Phase B–C report](UI_FOUNDATION_PHASE_B_C_REPORT.md). Phase D remains blocked by
the owner device visual gate; neither this audit nor automated checks claim visual PASS.
