# UI Foundation — Phase D Ledger Migration

2026-10-03 · Owner-authorized migration/completeness gate.
Terminology Gate accepted. Uses UI Foundation and Owner Decisions v2 glossary.
Code verification is separate from owner device visual acceptance. No E/F or Trip work.

## Closeout

- **Device Visual Gate = PASS** — owner confirmed on 2026-10-03.
- **Phase D CLOSED; Ledger migration COMPLETE.** UI Foundation is active and
  the terminology gate is accepted.
- Fresh-session compliance was verified by reading repository mandatory guidance
  before creating `/ui-foundation-check`, reusing canonical primitives and
  localization, and passing the strict guard plus focused checks.
- Future user-facing UI must follow `docs/architecture/ui-foundation.md` and
  `docs/architecture/OTR_TERMINOLOGY_GLOSSARY.md`.
- Diagnostics and the temporary verification screen remain Dev transport +
  persisted Debug Mode only, including direct entry. No business, backend,
  schema, Production or unrelated historical-failure changes in closeout.

## Batches and coverage

| Surface / tree                                  | Phase D outcome                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger landing / Journey context / Spending     | Previously migrated foundation retained; complete route/child tree now strict. No chrome offsets or destination changes.                                                                                                                                                            |
| Settlement Summary / Paid / Shares / Payments   | Retained semantic cards, segmented roles, MoneyText and native navigation. Member-review feedback and computed blocker messages now use known catalog display adapters; generic traveller fallback localized.                                                                       |
| Transfer Detail / legacy repayment sheet        | Removed fixed colors; page and modal viewport inherit semantic backgrounds. Native prompts retained; fields use UiTextInput. Direction, receipt confirmation, repayment progress, errors and explanations are localized. Stored repayment evidence source remains original English. |
| Expense conflict decisions                      | Native Back/title retained. Semantic page/cards/notices/action/form roles. Complete localized labels/counts, status feedback and choice explanations. Names/notes/titles remain data. Category/status/split labels use display mapping.                                             |
| Search / Advanced Filters                       | Existing localized forms/categories/date/segmented foundation retained; complete route/child tree strict.                                                                                                                                                                           |
| Spending Analysis / My Ledger                   | Existing accepted geometry, charts, money fitting and scope controls retained. Analysis load errors now pass through known system-message adapter.                                                                                                                                  |
| Expense Detail / New / Edit / Correct confirmed | Accepted foundation retained. Early form errors use the display adapter. No correction history, save payload or permission changes.                                                                                                                                                 |
| Review / Finding                                | Display-copy configuration now stores keys and resolves at render, retaining human notes verbatim. Generated money/ratio/duplicate evidence localizes prose without rewriting evidence.                                                                                             |
| Rate Details / FX / Currency                    | Existing native picker/system appearance and formatting retained. Missing acceptance/error/estimate feedback mapped without altering calculations, provider evidence or acceptance policy.                                                                                          |
| Receipt / Attachment                            | Existing immersive viewer, count contrast, OCR review and attachment controls retained. Standalone capture uses UiButton and full semantic viewport. Receipt mismatch/confirmation validation feedback mapped at display boundary; OCR facts unchanged.                             |
| Settlement History / Statement / Changes        | Accepted operation-page migration retained; missing dynamic confirmation/payment feedback added to catalogs. Financial versions/digests remain original.                                                                                                                            |
| Sheets / pickers / empty/loading/error states   | Full TSX trees strict, including imported/re-exported routes. Native date/currency/form adapters retained.                                                                                                                                                                          |
| Debug Stage 2 compatibility slice               | Existing debug route remains gated and unchanged. Inputs themed/localized; amount display uses MoneyText with the original fixed two-decimal slice scale. No compatibility data migration.                                                                                          |
| Diagnostics fixture                             | Persisted Debug Mode + Dev transport gate retained; no ordinary-user exposure or Trip structure.                                                                                                                                                                                    |

## Localization and protected behavior

- 1,346 populated keys in each locale: 195 display messages added, reusing existing
  labels where possible. Prior 1,151 English/Chinese values and keys unchanged.
- Three normative terminology exceptions retained. No new terminology exemption.
  All 47 normative mappings and catalog parity/parameters pass.
- Known system-owned helper/hook messages translate at the display boundary.
  Names, expense titles, notes, filenames, IDs/codes, upstream evidence and custom
  categories stay raw. New entries do not translate stored values.
- Transfer save, amount parsing/input serialization and conflict choose handlers
  match pre-Phase D bodies after resolving translated literals and removing
  formatting/comments. Existing causal/settlement/payment tests exercise behavior.
- No schema, repository, business hook, backend contract, sync worker, domain
  financial calculation or permissions changes. Product navigation destinations
  are retained; the temporary verification route is a Dev + Debug utility.
  No Production resource accessed; no dependency introduced.

## Guard coverage and retained debt

- Strict coverage: **76 files**, all 26 Ledger routes and their TSX children,
  explicit conflict/settlement presentation helpers, plus B–C/global roots.
- Route traversal follows imports and module re-exports. The former conflict-route
  re-export blind spot is covered by a regression.
- Baseline only pruned: **663 → 473 occurrences**, removing 190.
  Remaining scanner totals: 385 string / 88 color occurrences. No new baseline
  keys or increased counts; no frozen file inventory expansion.
- **Zero scanner violations in strict product Ledger TSX trees.** Pure computation
  helpers receive classified review, not indiscriminate strict substitution.
- Six retained Ledger helper candidates: four Receipt Review machine enum values
  (STRONG_SUGGESTION, CANDIDATES_AVAILABLE, NO_SUGGESTION, USER_EDITED), and two
  missing-record title fallbacks in settlementSections and settlementSummaryProjection.
  These are data/projection boundaries; cached financial snapshot titles are preserved.
- Other candidates belong to old in-memory ledger-prototype screens,
  diagnostic/acceptance harnesses, Itinerary and existing global model copy.
  They are outside current product Ledger migration, and were not re-baselined.
- One line-specific string exception: PaymentSheet sourceLabel "Traveller agreement"
  is stored financial provenance. Localizing it changes the repayment payload;
  visible action/form wording is localized separately.
- Fixed immersive media roles and documented B–C exceptions remain.
  Static checks cannot certify contrast, layout, Dynamic Type or native behavior.

## Automated verification

| Check                                                          | Result                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| TypeScript                                                     | PASS                                                                                                      |
| ESLint / UI guard / terminology guard                          | PASS; 76 strict files, catalog parity/parameters and 47 mappings                                          |
| Focused Ledger/foundation/causality regressions                | PASS; 42 suites / 264 tests                                                                               |
| Full test suite                                                | 163 files passed, 2 pre-existing failures; 1,145 tests passed, 1 failed                                   |
| Formatting for changed files / diff whitespace                 | PASS                                                                                                      |
| Whole-repository formatting                                    | 7 untouched historical files fail                                                                         |
| Protected code paths / catalog preservation / baseline pruning | PASS; no protected-path edits, prior 1,151 bilingual entries unchanged, no new/increased baseline entries |

Pre-existing full-suite failures, reported separately:

- accountSwitchFoundation.test.ts: React Native Flow syntax fails during collection.
- architectureBoundary.test.ts: existing ExpenseDetail type-only ledgerMutationContracts import is rejected by the boundary regex.

Untouched formatting failures:

- docs/ledger/evidence/expense-consistency-phase6-after.json
- docs/ledger/evidence/expense-consistency-phase6-before.json
- docs/ledger/SETTLEMENT_2_0_PHASE_0_DECISIONS.md
- docs/ledger/SETTLEMENT_2_0_TECHNICAL_AUDIT.md
- src/data/db/database.test.ts
- src/domain/ledger/expenseIntent.ts
- src/hooks/useStage4BPhysicalSmoke.ts

Logs are retained locally under /private/tmp/otr-phase-d-* (focused-final,
fulltests-final, format-all, release-build, signature, install and launch).
No check was weakened to conceal a failure.

Closeout rerun: typecheck, full lint/UI/terminology guard, formatting for all
102 intended files and diff whitespace PASS. Full suite retains exactly the
two failures above: 163 suites / 1,145 tests pass. Latest log:
`/private/tmp/otr-foundation-closeout-tests.log`. Unrelated `docs/trip/*.docx`
design drafts are intentionally excluded from the Foundation commit.

## Signed Release delivery

- Xcode Release build PASS; embedded JavaScript bundle, strict codesign verification PASS.
- Final signature: 2026-10-03 16:46:44, team U9D5C58Z94, bundle com.xoery.otrmobile.
- Installed over the existing app on Leon's iPhone 16 Pro (00008140-001C2980269B001C).
  Installation and launch succeeded. No uninstall, data reset or schema migration.
- Final pre/post-install SQLite file metadata is identical: filenames, sizes and
  modification timestamps preserved. Receipt and receipt-draft directory metadata
  was also retained on the earlier install in this delivery. This is preservation
  evidence, not a device visual acceptance result.
- Artifact: /private/tmp/otr-ui-foundation-release/Build/Products/Release-iphoneos/OTRMobile.app.
- Owner-requested follow-up Release added `/ui-foundation-check`; build, signature,
  in-place installation and launch PASS. SQLite metadata remained identical.

## Full-Ledger owner device gate

**Device Visual Gate = PASS**, confirmed by the owner on 2026-10-03.
The owner accepted the product Ledger tree in both populated locales and
**iOS system appearance while the app runs**, including four Settlement subviews,
Transfer/repayment sheet, conflict decisions, Review/Finding, Search/filter sheets,
receipt/currency/date/FX sheets, disabled forms, money, native Back/toolbars,
Journey chooser hierarchy, root-tab accent, long copy, larger text and VoiceOver.
The Diagnostics sample remains Dev transport + persisted Debug Mode only.

**Phase D closed. No Phase E/F or Trip development authorized.**
