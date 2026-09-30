# Current Implementation State

Date: 2026-09-30

## Expense Search convergence — iPhone and Simulator acceptance

- `/expenses/search` remains the sole production Search route and `LedgerSearchScreen` the sole production screen. The unused prototype Search screen was removed. Existing Ledger, Analysis, Settlement Shares and Paid route parameters normalize to Mine, Person, Group or fixed-payer Group in one screen; stack routing is unchanged.
- Search uses the existing local reporting repository. Positive effective shares select Mine/Person rows, including original shares awaiting Journey value. Rows show Journey-currency share or full Group value first, original amount second only when useful; missing Journey value is explicit and excluded from the summary. The existing Settlement `shareOnly` query retains its prior semantics.
- Filters have Time, Details and More levels; Participant is Group-only, Needs attention accepts both conditions, and only restrictive conditions count as active. No schema, Backend, API, sync, or dependency change. Decision: `docs/adr/0019-expense-search-scope.md`.
- Signed Release builds were installed in place on the owner's iPhone 16 Pro and the isolated Local QA iOS 26.5 Simulator. The iPhone verified Ledger Mine/Group, member category, Analysis category, Settlement Shares/Paid, Expense Detail/back, Time/Currency/Needs attention filters, chips, counts and amounts. Two active filters show a fully visible badge inside the Search header button on both devices; default Any/None values are neutral gray. The QA Simulator preserved its local fixtures: a waiting-value Journey showed 3 Expenses, 0 included, 3 without Journey value and NZ$0.00; the no-expenses Journey showed an empty Search state. Large accessibility text remained navigable. No phone data was cleared and Production was not accessed.
- Six related suites / 53 tests passed for the convergence; after device polish, 3 focused suites / 26 tests, TypeScript, scoped lint, both signed Release builds and diff check passed. Android and an offline mode toggle were not device-tested in this checkpoint.

## Settlement Summary layout — Simulator PASS (normal state)

- Balance breakdown, Changes since last confirmation, Last confirmed, and Group review status now use captions outside their white cards. Their internals use clearer amount, metadata, count, and action hierarchy. The balance hero and warning card remain distinct. No financial, review, route, API, schema, or dependency change.
- Isolated worktree `600611b` was cherry-picked as `64ae7c2` after verifying the shared branch was clean and had not changed the Summary file. TypeScript, scoped lint, 17 relevant tests, diff check, and iPhone 17 Pro Simulator Release visual review passed. The selected fixture had no current-vs-confirmed diff, so the Changes card was source-checked but not visually exercised with live data.
- During Simulator navigation, the Dev fixture Journey `Settlement Final Versions Acceptance e6e0955d` had its current user's review state unintentionally saved as `LOOKS_GOOD` (previously `NOT_REVIEWED`). This append-only checkpoint was not altered directly or rolled back; other agents using that fixture should account for it.

## Expense inclusion sync and Settlement pending changes — Dev/iPhone verified

- `f7f3dd4` runs Expense sync alongside Personal Payment sync, preserves accepted valuation and splits for participation-only edits, and keeps pending local Settlement changes visible. Dev migration `20260930000100_expense_participation_preserve_valuation.sql` is applied.
- Subsequent causal receipt fixes (`32e0c89`, `5f9d6b8`, `431f19f`, `8cd682a`, `13c5db3`) recover a failed predecessor, preserve its verified revision during conflict review, and permit a participation-only rebase across automatic valuation. A failed conflict choice can be retried after review. Backend source and signed iPhone Release are updated; existing phone data was preserved.
- The owner's `安抚` Expense is now Hosted Dev revision 7 / ACCEPTED / INCLUDED. Revision 6→7 kept the same valuation ID, NZ$3.59 accepted amount, and equal splits. The iPhone Settlement Summary shows current NZ$53.20 against confirmed NZ$55.00, “Added: 1 expense”, and −NZ$1.80; Review Settlement Changes names `安抚`. No new Settlement version was confirmed. No Production changes.
- Focused Expense contract/backend tests (35), TypeScript, scoped lint, and Dev health pass. The temporary safe diagnostic logging used to identify the skipped causal read was removed. The Dev backend is healthy. The iPhone remains on the signed build with the conflict retry UI.

## Settlement Paid category and search polish — Simulator PASS

- Paid now follows the Shares category layout: selected payer's Expense count, a compact three-row recent preview, and light category/all-expenses links. The organizer's member selector updates the totals, counts and action wording.
- Paid search fixes the selected payer while allowing other filters, includes Expenses the payer paid without taking a split, and shows each full paid amount in the Trip settlement currency. Empty Paid/Shares totals use that currency too. Confirmed Final links explicitly open current expenses.
- iPhone 17 Pro Simulator Release visual review covered Paid collapsed/expanded cards, mixed currencies, long titles, member switching and category search. Focused reporting tests, TypeScript and scoped lint pass. No schema, API, sync or dependency changes.

## Settlement Shares category and search polish — Simulator PASS

- Shares category cards show the selected member's positive-share Expense count. Expanded cards use the Analysis-style compact three-row preview, sorted by Expense date, with a light category search link. The bottom action is a light `View all my expenses` link and follows organizer member selection.
- Shares search now filters to positive splits for that member. Result-row amounts use the member's settlement share; the summary uses the same query. When a confirmed Final snapshot is shown, category search explicitly says it opens current expenses, since the current browser can contain later changes.
- iPhone 17 Pro Simulator Release visual review covered collapsed/expanded categories, mixed currencies, long titles, member switching and category-filtered search. Three focused suites / 43 tests, TypeScript, scoped ESLint and diff check pass. No schema, API, sync or dependency changes. Existing unrelated working-tree changes were not included in this checkpoint.

## Content visual language v1 — Simulator and iPhone visual review PASS

- Ledger content now shares small typography, surface, radius, spacing and amount
  tokens. Spending, Analysis and Settlement use a bounded 44/40/36/32pt Hero amount
  ladder. Standard Expense rows, section headings and expandable groups are aligned;
  Payments keeps transfer-direction arrows and adds a separate expand chevron.
- Review, Search, Expense Detail and My Ledger received limited presentation alignment.
  Routes, navigator structure, local reads, sync, calculations and decisions are
  unchanged. No schema/API/package changes or Hosted Dev/Production access.
- TypeScript, affected-file ESLint/Prettier and 10 focused suites / 73 tests pass.
  iPhone 17 Pro Simulator and iPhone 16 Pro signed Release builds installed and
  launched. Spending, Analysis, Settlement Summary, Paid, Shares and Payments
  were inspected on Simulator; Spending, Analysis, Settlement Summary and Paid
  were inspected on iPhone. The device review caught and fixed a tiny short
  amount in expanded Analysis and a missing Settlement eyebrow. Large JPY
  totals, mixed-language long titles and expanded rows now display correctly.
  Simulator access initially failed because the command sandbox could not reach
  CoreSimulatorService; device-service access resolved it. No direct Hosted Dev
  or Production access for this visual review. Warning states, Dynamic Type and
  exact EUR/NZD large-amount fixtures were not visually exercised.

## Navigation title color rule — implementation and iPhone check PASS

- Product rule: navigation and Sheet/Modal titles use primary dark text;
  subtitles use secondary text. Accent green is for actions, selection,
  links/CTAs and deliberate semantic emphasis.
- Root, Tabs and Ledger Stack now explicitly set native title color. New/Edit
  Expense no longer overrides its title to green. Existing custom and Sheet
  title components already use the primary text token; action tint is unchanged.
- iPhone 16 Pro Dev Release shows dark Today/Ledger/New Expense titles and green
  menu, add, Cancel and disabled Save actions. TypeScript, scoped lint/format,
  nine related suites (74 tests) and diff check passed. iPhone 17 Pro Simulator
  Release also shows dark New Expense title with green Cancel/disabled Save.
  No Production access.

## Sheet / modal chrome unification — checks PASS, iPhone visual review partial

- `LedgerSheetHeader` now supplies centered 17pt semibold one-line titles,
  16pt semibold actions with 44pt hit height, balanced 112pt side slots,
  and unchanged typography for disabled actions. Large accessibility text
  retains a deliberate two-line title variant. Native date wheels remain native.
- Ordinary selector sheets no longer carry per-call-site `titleBold` or unused
  right-side Done labels; Expense Sharing uses Apply for its existing draft
  action. Routes, modal lifecycles, data loading, repositories and sync are unchanged.
- iPhone 16 Pro Dev Release visual checks covered Journey chooser, Expense
  currency/category/date/sharing, Search Filter and payment-record editing.
  Simulator Release built, installed and launched; the Simulator UI application
  is unavailable on this host, so deeper Simulator sheets were not inspected.
  Remaining data-dependent sheet flows retain the shared header but were not
  all opened for visual review. Eight focused suites (72 tests), TypeScript,
  scoped lint/format and diff check passed. No Production access.

## Navigation chrome unification — 2026-09-30 source validation PASS

- Existing Root Stack / Tabs / Ledger Stack and route paths are unchanged. Tabs now
  derive bottom-bar visibility from the current path: primary destinations and the
  Journey workspace show it; Ledger deep, detail, task, dashboard and utility routes
  hide it. Analysis no longer mutates parent tab options on focus.
- Shared two-line title and 44pt icon action styles cover Ledger, Analysis and
  Review. Review receives the current local Journey title through its existing
  navigation entry points; no header read, sync trigger or backend request was added.
  Search Filter is icon-only with an active indicator. Obvious repeated body titles
  were removed, and sheets without a distinct right action no longer show Done.
- Product navigation direction is updated in `docs/PRODUCT.md`. TypeScript, scoped
  lint/format, navigation/Review/Analysis/Expense/Settlement tests and diff check
  passed. Simulator visual validation was unavailable because CoreSimulatorService
  could not be reached. Hosted Dev and Production were not accessed.

## Settlement review after confirmation — fix gate PASS

- Europe owner's successful confirmation created version #3, but the subsequent
  Looks good submitted the prior confirmed head's review fingerprint. Replacing only
  current statement lineage fields reproduces the failed fingerprint exactly; no
  financial source divergence. Server `STALE_REVIEW_CHECKPOINT` rejection was correct.
- Personal review refresh follows confirmed-head changes, waits before enabling
  selection and binds choices to the displayed fingerprint checked in the queue-write
  transaction. Late old reads cannot overwrite current hook state; offline review of
  the matching head remains supported. No Backend/API/migration or financial changes.
- 7 affected suites / 26 tests, TypeScript, scoped lint/format, signed Release PASS.
  Original iPhone shows green Looks good / Review saved; Hosted Dev checkpoint matches
  the current fingerprint, coverage LOOKS_GOOD, delta null. Final reinstall / cold
  re-entry retains green Looks good and no review errors, observed by owner and agent.
  See `docs/ledger/SETTLEMENT_REVIEW_HEAD_REFRESH_FIX_GATE.md`.
- Earlier endless checking cleared after restart, but its exact hung await is still
  unproven; this fix does not claim to solve it. Independent 28 Review items retained.
  No automated Settlement Confirm or Production access.

## Large Journey Ledger freeze — batch-read fix, iPhone / Simulator PASS

- Owner reported Small Screen QA frozen on Journey switching, Settlement and
  Spending Group. Captured App at 276% CPU / 1.2GB footprint; Hermes microtasks
  and GC busy while the native main thread waited. Restart preserved all data.
- Existing Expense aggregate listing launched 4 child reads per Expense with
  unbounded Promise.all; Spending/Settlement also reload that dataset. Shared
  repository hydration now batches participants/splits/active valuations/payments
  by the authorized parent IDs: one parent + four child reads, independent of N.
  Journey/account/deletion/correction filtering and child ordering stay intact.
- Real SQLite regression covers 2001 aggregates, five reads, child data parity,
  participant/split order, hidden local ownership, deleted inclusion and empty scope.
  11 affected suites / 120 tests, typecheck, scoped lint/format PASS. No migration,
  packages, remote access or financial-rule changes.
- Updated only the isolated 375pt Simulator with existing 2003-record Journey.
  Large/small/large switching, Spending Group NZ$39,990 and Settlement Summary
  +NZ$0.78 complete. After repeated navigation CPU 0–1.2%, RSS ~430–452MB;
  no persistent saturation. Samples are observations, not a formal UI latency test.
- Normal Dev signed Release installed/launched on owner's iPhone 16 Pro with
  existing data intact. Europe Mine/Group (146 Group Expenses), Settlement Summary
  and Europe -> Final Versions Acceptance -> Europe switching PASS. Bundle endpoint
  and batched SQL verified. Fix included in the owner-requested Git revision.
  See latest Analysis implementation-report section for evidence.

## Spending Analysis owner review — iPhone / Simulator acceptance PASS

- Approved refinements implemented: Journey subtitle, fixed inline-icon Mine/Group,
  compact Journey-currency rows, recent category previews, contrasting colors / <3%
  Other union, and excluded-record gray ⓘ popup beside included count.
- Timeline fits viewport; automatic outlier log scale has no button or label.
  Useful zoom controls share Average row; zoom-in guarantees 44pt bar columns.
  Floating brief pins date/close and View Expenses footer around a scrolling body.
  Calendar is green. Traveller ranks use badges without percentages/progress text;
  category-filtered traveller and payer clicks open exact existing Search routes.
- Return refresh keeps the existing dashboard visible with one consolidated local
  read; no temporary loading row/layout jump. Mine/Group store independent offsets.
  Final Expense row has no bottom separator. Midnight calendar bounds now match
  both date-only and ISO occurred_at rows across repository and domain filtering.
- 8 focused suites / 72 tests, typecheck, scoped lint/format and diff check PASS.
  Entry/range/return read once; toggles, chart/filter interactions and idle remain
  zero extra reads in the event harness. No migration/package/API/polling changes.
- Final signed normal Dev Release updated on iPhone 16 Pro. Real Jul 7 brief and
  Search both show 5 Expenses / ¥8,334.69; Search/Detail return preserves position,
  final row separator removed, independent Mine/Group positions verified.
  375pt isolated Simulator verifies green calendar, fixed 10-category popup/footer,
  exact Jan 2024 drilldown (93 Expenses / NZ$254.82), stable return and scope switch.
- Two-finger pinch remains event-harness validated; CUA cannot inject multi-touch.
  Android untested. No Hosted Dev validation or Production access. Revision included
  in the owner-requested Git commit; latest implementation report records evidence.

## Spending Analysis 2.0 — implementation and iOS Simulator acceptance PASS

- Owner-approved Analysis-only redesign and Performance / Database Guardrails are
  implemented. Mine/Group dashboards, Category Top 3/union drilldown, zero-filled
  daily/weekly/monthly Timeline, Top 5 Expenses, traveller/payer breakdown, completeness,
  range icon, Analysis-only material/sticky scope and tab hiding use existing routes.
- One local `loadSpendingAnalysisProjection` SQL read supplies every section. Toggle,
  category filter/expansion/chart renders are memory-only; range/focus return read once.
  No migrations, new packages, Backend/API changes, polling or financial-rule change.
- 8 related suites / 59 tests, TypeScript and scoped ESLint PASS. 10,003 Expenses:
  one projection 39ms, CPU 15ms on this development machine. Full architecture guard
  retains one existing failure in untouched LedgerStage6Screen's API import.
- iOS Release and isolated large/one-day/incomplete fixtures passed core visual and
  interaction checks; local synthetic Expense edit refreshes all sections correctly.
  375pt iPhone SE checks also pass: wrapped long titles/amounts, sticky scope, range
  visibility, hidden tabs and no-expenses state. Android fallback is not device-tested.
  Large-fixture foreground observation for 191 seconds remains visually stable;
  idle zero-read counts are from the runnable hook harness, not a native SQL profiler.
- Large fixture QA clone and Small Screen QA use loopback-only acceptance builds;
  do not install those builds on the owner's phone or treat them as normal Dev releases.
  Production was not accessed; no Settlement Confirm or Hosted Dev data validation.
- Owner-requested iPhone 16 Pro update installed and launched successfully using a
  signed Release with normal `api-dev.xoery.art` configuration. Compiled bundle
  verifies Analysis 2.0 is present and loopback QA endpoint is absent. Same-bundle
  update; no uninstall, data clearing or synthetic fixture injection on the phone.
- Acceptance evidence and limitations: `docs/ledger/SPENDING_ANALYSIS_2_0_IMPLEMENTATION.md`.
  Original functionality reference: `docs/ledger/SPENDING_ANALYSIS_CURRENT_FUNCTIONS_ZH.md`.

## Settlement Payments current projection — fix gate PASS

- Payments now derives current recommendations from the latest confirmed Adjustment's
  full immutable inputs using existing balance/transfer helpers. Adjustment delta
  transfers remain historical; ROOT/legacy transfer identity and personal-payment
  records/progress are preserved. No Backend, API or migration change.
- 9 related suites / 65 tests, TypeScript, scoped ESLint/format/diff checks and signed
  original-iPhone Release build PASS. Regression includes zero/nonzero deltas, latest
  snapshot replacement, cold snapshot reload and existing payment progress.
- Original iPhone Mine/Everyone shows NZ$55.00, Received NZ$37.09 / 67%, and existing
  payment history. Summary → Payments remains stable. Normal pull retains source
  fingerprint, 9 effective inputs, head sequence 3 and all stored payment financial
  records. See `docs/ledger/SETTLEMENT_PAYMENTS_PROJECTION_FIX_GATE.md`.
- Read-only follow-up confirms the owner's post-precision-release confirmation
  succeeded: head `c9e746e7-f47d-47e0-907c-9159a459b602`, sequence 3. No agent
  confirmation/payment write or Production access. Owner requested this fix commit.

## Workspace commit checkpoint

- Owner requested committing all remaining workspace changes. This checkpoint includes
  Settlement review/feedback, diagnostics, receipt pull binding, correction-aware source,
  lossless confirmation proof, migrations, regressions and acceptance documentation.
  Expense Consistency Closure remains separately preserved in `019c389`.
- Precommit validation: 17 relevant suites / 166 tests, TypeScript, Backend build,
  changed-file ESLint/format and diff checks PASS. Latest local SQL evidence remains
  33 suites / 655 assertions PASS. No new deployment or push in this commit step.
- Subsequent read-only Payments investigation verified the owner's post-release
  original-iPhone confirmation; see the current Payments gate above.

## Settlement confirmation precision — Hosted Dev read-only fix gate PASS

- Owner subsequently pressed Confirm: Simulator confirmed sequence 3 successfully;
  original iPhone LAWSON Journey was rejected with `SETTLEMENT_INPUT_STALE`, no new
  confirmed head. This was owner action, not automated acceptance.
- Read-only evidence identifies SQL numeric `0.011189760712298275` rounding to
  JS `0.011189760712298274` in the source proof. Preview agreement remains correct;
  strict transaction JSONB equality rejects this transport precision loss.
- Minimal prepared fix: migration `20260929000400_adjustment_lossless_source_transport.sql`
  adds a service-only JSON-text read RPC; Backend sends exact numeric proof with
  Node 24 standard JSON raw tokens. Existing source/mutation semantics and guards
  unchanged. No financial/operation data patches or automated Confirm.
- 8 suites / 106 tests, 33 SQL suites / 655 assertions, TypeScript/build/scoped checks
  PASS. Owner separately authorized release; Dev tail now 00400 and release
  `adjustment-lossless-source-20260929` is healthy. Exact numeric proof equality at
  original/current/root cutoffs PASS; no head/valuation/audit writes during acceptance.
  Final post-release confirmation remains owner action, untested by the agent.
  Client contract unchanged; exit/reopen clears the old in-memory rejection message.
  See `docs/ledger/SETTLEMENT_CONFIRMATION_PRECISION_GATE.md`.

## Settlement current-source follow-up — fix gate PASS

- Expense Consistency Closure checkpoint is commit `019c389`; this separately
  authorized source/UI fix remains outside it. No push requested.
- Confirmed-root ordinary Preview now uses the existing correction-aware
  `ledger_adjustment_source_current_7_2c`; initial settlement retains its prior
  source. No migration or guard relaxation. Diagnostics require explicit Debug Mode;
  verification failure copy does not invent an Expense conflict.
- Local regression: 16 affected suites / 192 tests, 32 SQL suites / 649 assertions,
  TypeScript, Backend build, scoped lint/format PASS. Generic multiple-chain and
  cold-refresh coverage included. See `docs/ledger/SETTLEMENT_CURRENT_SOURCE_FIX_GATE.md`.
- Hosted Dev release `settlement-current-source-20260929` is healthy; migration tail
  remains `20260929000300`. Both previously affected Journey APIs and exact local
  sources agree: LAWSON 9/9/9 inputs, Added6/NEW6, net NZ$55.00; ce SHi22 6/6/6,
  Added3/NEW3, net NZ$34.72. Stored financial/audit identities unchanged.
- Original iPhone and Simulator formal screens enable Confirm after ordinary refresh
  and entering a reason. Both cold restart/reopen checks PASS; exact local fingerprints
  remain stable. No local-only repair or confirmation submission.
- Stop at this fix gate. No Settlement Confirm or Production access. Existing
  “Settlement updated with the latest changes” preview-refresh copy is separately
  recorded as potentially misleading; it does not indicate a confirmation mutation.

## Expense Consistency Closure — Phase 6 PASS / closure PASS

- Owner accepted Phases 1–5, authorized Hosted Dev real recovery and separately
  authorized generic legacy equivalent admission release. Final gate:
  `docs/ledger/EXPENSE_CONSISTENCY_PHASE_6_REAL_RECOVERY_GATE.md`; scoped before/after
  evidence is in `docs/ledger/evidence/expense-consistency-phase6-{before,after}.json`.
- Actual original iPhone LAWSON recovered through **Continue deletion / CONFIRM_DELETE**:
  server/local tombstone revision 3, DELETE RESOLVED, earlier valuation SUPERSEDED,
  OPEN 0, immutable confirmed receipt. No rate acceptance prerequisite.
- Actual original Simulator ce SHi22 recovered through **Use latest value /
  ACCEPT_EQUIVALENT**: preserves USD2300 → NZD4056 REFERENCE_RATE, revision 2,
  legacy UPDATE RESOLVED, OPEN 0, one new closure audit and no new valuation.
- New migration `20260929000300_legacy_expense_equivalent_resolution.sql` validates
  original server-stored 409 submission against successful historical evidence;
  UTC normalization, empty equivalent only. Legacy writes retain strict CAS.
  No incident data patch, ID/name special case or guard relaxation.
- Equal-revision canonical metadata now accumulates audit IDs and keeps later server
  aggregate/audit times; formal chain reads reconcile through the shared boundary.
  Final full canonical/UTC equality, projection, audit IDs, active valuation identity,
  receipts, zero deferred/pending/terminal incident operations and restart/pull PASS.
  Both Settlement Preview and Adjustment Preview return 200 / blockers [].
  Same original keys replay twice each with exact response and unchanged counts.
- Final **18 suites / 264 tests**, **31 SQL suites / 640 assertions**, TypeScript,
  scoped lint/format, Backend build, signed normal original-device Release builds PASS.
  Reuses accepted Phases 1–5 Hosted fixtures with explicit Phase E/supplement mapping.
  Neither incident needed Data Health local-only repair. Other old synthetic account
  attention and previously documented global architecture/RN loading failures remain.
- Dev project `tuqigdxrvrerfewsxqgm`, healthy `https://api-dev.xoery.art`, tail
  **20260929000300**, SQLite v41. Release `legacy-equivalent-20260929`; image
  `sha256:5542e19321def80f8d4e0463af1f5b3a92e3f79cf533651dc86eefd6cbcd19b4`.
  Exact source/migration/native hashes and rollback are in the Phase 6 gate.
- macOS iPhone Mirroring scroll input crashed in UniversalHID; stopped mirror
  scrolling and owner completed phone check/read-only verification. OTR data retained.
- **Stop at Phase 6 gate. Production untouched; Settlement Confirm not executed.**
  Owner authorized this Closure checkpoint commit. No push requested; independent
  pre-existing Settlement changes remain in the working tree.

## Prior checkpoint — Phase 5 automated + Hosted Dev PASS

- Owner accepted Phases 1–4 and authorized Phase 5, then separately authorized its
  Hosted Dev migration / Backend release / isolated acceptance. Approved checkpoint
  and ADR 0056 remain authoritative. Latest gate:
  `docs/ledger/EXPENSE_CONSISTENCY_PHASE_5_LATEST_STATE_RATE_ACCEPTANCE_GATE.md`.
- Rate choices bind displayed Expense revisions, original Money, economicDate,
  Journey currency/scale and displayed rate/date. Existing reconciliation and fresh
  reference reads validate online choices; material drift requires reconfirmation.
  Compatible newer automatic reference valuation is accepted without an artificial
  conflict; valid MANUAL_AGREED remains protected from automatic replacement.
- Offline choices use existing durable commands and receipt reconciliation. Batch
  outcomes are per Expense, allow partial success and show actual pending / confirmed /
  conflict / retryable / terminal states. Later local intent and account boundaries
  remain protected. Routine reference refresh and reconciliation stay silent.
- Phase 5 Hosted/local migration tail was `20260929000200_latest_state_rate_acceptance`;
  SQLite remains v41. Additive typed binding and narrow transactional VALUATION_REBASE
  keep historical evidence, legacy strict CAS, frozen/permission/chain and replay guards.
- Dev project `tuqigdxrvrerfewsxqgm`, healthy `https://api-dev.xoery.art`; release
  `latest-state-rates-20260929`. Backend source SHA-256
  `922832df8d37c33002c8e05fc18d46db4c9c85bbcd86c752356147e1d48aed39`, image
  `sha256:61339996dcb83503896a91392fe947516f66a30161ef29b853336e85a592997a`.
  Exact migration, rollback and fixture evidence are in the Phase 5 gate.
- 11 affected suites / 170 tests, 30 SQL suites / 623 assertions, TypeScript,
  scoped lint/format, Backend build and signed normal Simulator Release build PASS.
  Nine Hosted acceptance scenarios PASS. Same-key response-loss replay kept revision
  3 / audits 3 / valuations 2. No new native UI acceptance claim or device install.
- Phase 4 formal native entrances remain accepted; its gate records that evidence
  and pre-existing LedgerStage6 global architecture guard failures. No new dependencies
  or FX policy changes. Shared pre-existing work retained on HEAD `d7e3fff`.
- **Stop at Phase 5 gate. Phase 6 recovery requires separate authorization.**
  At that prior gate LAWSON / ce SHi22 were untouched. Phase 6 authorization and
  completed recovery supersede that stop; no Settlement Confirm or Production access.

## Expense Consistency Closure — Hosted Phase 3 and formal Phase 4 PASS

- Phase 1/2 accepted by Owner. Approved checkpoint and ADR 0056 remain authoritative;
  new gate: `docs/ledger/EXPENSE_CONSISTENCY_PHASE_3_BACKEND_SQL_GATE.md`.
- Forward migration `20260929000100_expense_consistency_v2.sql` adds immutable
  successful revision evidence, v2 conflict outcomes/original-command receipts,
  complete chain digest/read metadata, guarded atomic command/resolution RPC and
  completed v2 receipt immutability. This was the Phase 3 migration tail; the current tail is recorded above.
- Existing Expense CREATE/PUT/DELETE/RESTORE/valuation and conflict-resolution
  endpoints accept the additive typed branch. Historical base comes from server
  evidence; compatible descriptive merge preserves valuation identity. DELETE stays
  DELETE, only RESTORE revives tombstones, and legacy full aggregates stay strict CAS.
- Covered closure, mutation, audit and receipt commit in one SQL transaction;
  uncovered conflicts stay OPEN. Same-key resolution replay returns the original
  response. Only verified APPLIED proof can advance a causal execution base.
- Final local SQL gate: 29 suites / 604 assertions PASS, including 60 Phase 3 checks.
  Backend/HTTP/affected client gate: 9 suites / 136 tests PASS. Clean migration reset,
  TypeScript, scoped lint/format, Backend build and diff checks PASS.
- Hosted Dev deployment/acceptance PASS: tail `20260929000100`, Dev project
  `tuqigdxrvrerfewsxqgm`, healthy `api-dev.xoery.art`. Release
  `expense-v2-20260929`; exact artifacts/fixture/evidence in Phase 3 gate report.
  Current v40 contract compatibility verified. Rollback source/image retained.
- Phase 4 implements all three ordinary entrances, local tombstones, real Hosted
  typed contract, durable explicit decision and atomic confirmation. SQLite v41
  adds account chain cache/immutable resolution responses; no extra Hosted migration.
  10 affected suites / 167 tests, TypeScript, scoped lint/format PASS.
- Formal native Hosted acceptance PASS after Owner unlock: Detail, Needs Attention
  (including local deletion), Data & Sync and real Settlement blocker entrances.
  Explicit decision pending/retryable/confirmed/failure states were observed.
  Lost-response same-key replay preserved revision/mutation/audit counts; uncovered
  financial conflict stayed OPEN. Stale choice remained disabled until a fresh read;
  a new decision confirmed without reviving tombstones or overriding later intent.
- Final signed normal Release installed only on dedicated simulator, version
  `0.1.0 (1)`, SQLite v41, response-loss flag absent. JS bundle SHA-256
  `6574bf12df38acb41c28195583ad83b8e290d23fadf49a03bc1e2085fcc09a75`.
  Evidence/artifacts and known pre-existing global architecture guard failure:
  `docs/ledger/EXPENSE_CONSISTENCY_PHASE_4_FORMAL_UI_GATE.md`.
  Phase 4 accepted; Phase 5 is complete as recorded above. No incident recovery authorized.
- Normal reconciliation/FX refresh/retry/confirmation remains silent. Only human
  business choices get attention; explicit decisions show their actual result.
- LAWSON / ce SHi22 remain untouched until Phase 6; no Settlement Confirm or
  Production access. Shared pre-existing work retained on HEAD `d7e3fff`.

## Expense Consistency Closure — Phase 1 / Phase 2 local gates PASS

- Owner-approved contract: `docs/ledger/EXPENSE_CONSISTENCY_IMPLEMENTATION_CHECKPOINT.md`.
  Acceptance/file/test details: `docs/ledger/EXPENSE_CONSISTENCY_PHASE_1_2_ACCEPTANCE.md`;
  architecture decision: ADR 0056. Existing parallel Settlement, Journey and
  attachment changes retained on HEAD `d7e3fff`; no commit/push.
- Phase 1 implements typed intent/result/chain DTOs, user patches, UTC/split/no-op
  semantics, verified three-way eligibility and conservative legacy candidates.
  No-op/attachment-only Save creates zero Expense UPDATEs; existing guards remain.
- Phase 2 adds SQLite v40 account/Expense command sequence, predecessor, observed
  canonical base, immutable execution binding and receipts. Mutation/pull share
  protected reconciliation; older responses cannot erase later intent/tombstones.
  Receipt/projection/completion/dependency wake commit atomically. Only APPLIED
  receipts wake dependencies; COMPLETED alone never means SERVER_CONFIRMED.
- Historical missing baselines stay unverified; legacy pending/failed/conflict intent
  stays protected. Canonical-less feed events are deferred, not canonical versions.
  Local OPEN conflict supersession and Health-only OPEN closure have been removed.
- Affected-domain gate: 16 suites / 195 tests, TypeScript, scoped lint/format/diff
  and Backend build PASS. Full run has 138 suites / 959 tests passed; known Account
  Switching Flow-loading and LedgerStage6 architecture-import failures remain.
- Phase 3 Backend/SQL and Phase 4 formal UI are complete as recorded above;
  Phase 5 is complete above; Phase 6 recovery remains pending. Overall
  closure is not delivered or recovered yet. LAWSON / ce SHi22 remain untouched.
  Current Hosted Dev rollout and migration tail are recorded in the Phase 5 section above.
  No Production access or Settlement confirmation.

## Expense attachment thumbnail / preview repair — Simulator PASS

- Saved image rows resolve current local files or authenticated verified-download
  cache before rendering, avoiding stale container paths and failed-image races.
  Verified preview cache is reused offline; New/Edit/Detail retain shared rows.
- Fullscreen image Modal owns its SafeAreaProvider; Close/Previous/Next have
  48-point targets and safe padding. iPhone 17 Pro / iOS 26.5 ordinary point taps
  passed both directions and Close; app restart restores both thumbnails before
  opening a preview. Three focused suites / 24 tests, TypeScript, scoped ESLint,
  formatting and signed Simulator Release pass. No financial write, physical
  device access or push; concurrent Settlement changes remain separate.

## Journey selection route repair — Simulator PASS

- Manual Journey selection now takes priority over the previous fixed route during
  refresh; successful selection updates the route parameter. Incoming route changes
  clear the previous page’s manual override. Failed selection keeps prior context.
- Two focused suites / 13 tests, TypeScript, scoped ESLint, diff check and signed
  Simulator Release pass. iPhone 17 Pro: fixed Europe route → first Acceptance Trip
  → Settlement → Spending and Today → Ledger retain the new Trip; picker agrees.
  No financial action, physical device access or push. Concurrent Settlement changes
  remain separate; the other chat was notified to preserve this route repair.

## Expense Detail & Edit Consolidation — implemented, Simulator smoke passed

- Owner-approved Detail/Edit specification is recorded with the safety audit in
  `docs/ledger/EXPENSE_DETAIL_EDIT_CONSOLIDATION.md`; transaction decision: ADR 0055.
  Detail has compact Amount/FX sheet, inline Sharing, Notes/attachments, authorized
  header Edit and secondary Review flagging. New/Edit/Detail share receipt rows and
  image preview; PDFs retain native Quick Look. Edit reuses the New Expense form,
  loads linked receipts, stages removals/additions, and offers confirmed bottom
  Expense tombstone. Existing Expense never runs OCR.
- Save atomically commits Expense/receipt/queue intent with loaded revision and
  attachment-set checks. Cancel preserves existing assets and cleans unsaved files.
  Cached owner/group-member write permissions and finalized protection are checked
  locally; backend authorization is unchanged. Expense delete retains references
  and bytes. No backend, schema, dependency, Production, physical-device install, commit or push.
  Concurrent Settlement screens/calculation/confirmation/sync code was not changed;
  existing `applyValuation` acceptance changes in the shared Expense repository
  were preserved. Only Expense update/delete sections and imports/types changed.
- Fourteen focused suites / 119 tests, TypeScript, affected ESLint, Prettier and
  diff checks passed. Signed Release build and signature verification passed:
  `/private/tmp/otr-expense-detail-edit-build/Build/Products/Release-iphoneos/OTRMobile.app`.
  Full regression has 136 suites / 929 tests passed, with existing Account Switching
  React Native Flow loading and concurrent LedgerStage6 architecture-import failures
  left outside scope. Latest signed Release installed/launched on iPhone 17 Pro
  Simulator with cached accounts preserved. Simulator passed compact Amount, Sharing,
  FX sheet, image/PDF preview Close, staged remove/Cancel preservation, capacity
  source sheet and Delete confirmation/Cancel. PDF preview permits only app-owned
  draft/receipt paths and verified-download preview cache; OCR is unchanged.
  Final fix passed six suites / 57 tests, TypeScript and scoped ESLint. Large text,
  image gestures/navigation and native Save offline/reconnect remain open.
  Physical-device acceptance deferred by owner; no Expense Save/Delete performed.
  The earlier physical artifact predates the PDF fix. Next: remaining native gates.

- Owner follow-up: rate icon after amount, compact New Expense-style rate sheet,
  payer/split summary on separate lines, no repeated payer/total in expanded shares
  and no upload diagnostics. Four suites / 30 tests and Simulator smoke passed.
  Read-only finding: Journey quote precedence can choose Sep 24 despite an available
  Sep 25 snapshot; shared FX/Settlement selection code remains unchanged.

## Settlement review / explicit estimate acceptance — Dev deployed, device gate open

- Owner approved separating connectivity from sync failures, removing the Summary
  “Updated since you reviewed” card, independent member acknowledgement while FX
  is unresolved, and accepting earlier reference rates directly in confirmation.
  See ADR 0054. No schema or dependency change.
- Review fingerprints include personally relevant unresolved inputs; older queue
  responses cannot erase a newer choice. Confirmation lists eligible cached rates
  with dates and amounts and reuses audited MANUAL_AGREED valuations only after
  explicit acceptance, revision/amount checks, durable sync and fresh final checks.
- 24 related suites / 216 distinct tests passed, plus TypeScript, affected ESLint,
  formatting/diff checks, backend build and signed iPhone Release build. Latest
  Release installed on iPhone 16 Pro. Native checks verified three earlier-rate
  rows, the acceptance alert (cancelled), removed duplicate Summary card and
  Online shown separately from unavailable sync. No real FX/settlement submission.
- Owner explicitly approved deployment to `api-dev.xoery.art` / `178.105.151.143`.
  Only `otr-dev-backend` updated; health and authenticated GET review passed.
  Rollback source retained at
  `/opt/otr/dev-backend/source-before-settlement-review-20260928.tgz`.
- Follow-up: canonical preview/review head queries now use the same algorithm filter
  as finalized history; a regression first reproduced the 44-character Stage 4B guard
  digest and passes after filtering. Dev backend redeployed; public review validates
  at 64 characters and three consecutive reads have identical fingerprints.
- Owner's current Journey has no guard fixtures. Its three JPY expenses have no
  RATE_REQUIRED status; two agreed values reached Dev. LAWSON has an open
  APPLY_VALUATION revision conflict: local MANUAL_AGREED based on revision 1 versus
  server REFERENCE_RATE at revision 2 (automatic valuation preceded the stale
  acceptance by over two hours; see the audited timeline). Both
  canonical previews report this OPEN_CONFLICT. Do not resolve the financial choice
  automatically or claim rate acceptance alone permits confirmation.
- Device diagnostics identified the pull root cause: `applyReceipt` had 23 values
  for 22 SQLite columns. One placeholder removed in the shared bootstrap/pull path.
  A real SQLite regression reproduced the exact failure and now passes; signed
  Release installed with all local data retained. Native pull now completes.
- Review rejection has a separate numeric precision defect: internal PostgreSQL
  financial-source JSON rates rounded during JavaScript transport. Owner approved
  Dev function-only migration `20260928000100`; deployed and verified all four
  current source rates return exact strings. Original function retained at
  `/private/tmp/otr-review-source-rollback-20260928.sql`. Three SQL precision checks
  and 16 isolated checkpoint checks passed (including genuine stale-source rejection).
  Six focused code suites / 54 tests, TypeScript, scoped lint/format/diff checks passed.
- Confirmation still requires READY and source verification: LAWSON's financial conflict
  protects local/server alternatives. The latest signed build exposes authoritative
  blockers even while the local source differs. Blocked OPEN_CONFLICT previews can
  be displayed without bootstrap/hash repair; READY previews retain strict source
  verification, and both finalizers explicitly reject blocked states.
  Latest signed Release installed with cached data retained. Owner retry and native
  screenshot both confirm Looks good remains selected with “Review saved”; Summary
  reports the remaining single financial conflict. Native confirmation-page gate passed: LAWSON is named with a local/server
  conflict explanation and confirmation stays disabled. Latest signed build also
  skips adjustment-preview requests for blocked current previews. Owner subsequently
  deleted LAWSON locally; Dev rejected DELETE with base 1/current 2. Latest user intent
  is deletion, not preserving the previous manual valuation.
  No full device database export, conflict resolution, Git commit/push or real
  Settlement confirmation.

- Owner-requested read-only LAWSON audit is complete:
  `docs/ledger/LAWSON_SYNC_INCIDENT_AUDIT.md`. Dev timeline: automatic reference
  valuation seven seconds after CREATE, manual acceptance over two hours later and
  DELETE both stale at base 1/current 2; two unresolved server conflicts, no
  resolutions. Audit identified missing product resolution/failed-delete access,
  dropped DELETE lifecycle in conflict DTOs, local supersession versus independent
  server conflict closure, and acceptance without per-operation acknowledgement.
  An additional isolated SQLite check proves old canonical responses can overwrite
  newer pending tombstones (risk, not proven in this incident). Six existing suites /
  32 tests and three temporary audit suites / six checks passed. No app code/business
  records/deployment changed. Await owner review of the convergence/typed conflict
  proposal before implementation; preserve Journey fix commit `797e789`.

- Uncommitted Settlement patch compatibility review is recorded in the LAWSON
  report: retain verified pull/precision/review/blocker protections; explicit FX
  acceptance still lacks per-operation acknowledgement and partial-failure feedback.
  Second read-only audit `docs/ledger/CE_SHI22_SYNC_INCIDENT_AUDIT.md` covers the
  Simulator Trip `e6e0955d`: server auto-valued USD23 to NZD40.56, then an unchanged
  aggregate UPDATE at base 1 conflicted with current 2. Narrow local SQLite queries
  confirm cached quotes and canonical valuation deferred behind CONFLICT. Additional
  findings: no-op Save still queues full UPDATE, equal timestamp strings are falsely
  DESCRIPTIVE, and feed envelope/aggregate revisions differ (not proved causal).
  Temporary audit now has three suites/eight checks passed. Only documentation
  changed; no financial writes, repair, install, deployment or Git commit. Preserve
  concurrent attachment repair `d7e3fff`.
- Owner approved both audit conclusions and the complete closure scope, including
  production conflict UI, no-op/attachment-only patch semantics and both formal
  recoveries. Pre-code checkpoint is recorded in
  `docs/ledger/EXPENSE_CONSISTENCY_IMPLEMENTATION_CHECKPOINT.md`: operation results,
  per-Expense causal intents/shared reconciliation, server-atomic typed conflict
  chains, backward compatibility, migration/API range and six phase gates. It
  extends existing queue/repositories and tightens ADR 0040 local-only conflict
  closure; no new sync framework. Await checkpoint confirmation before code. Only
  design documentation changed; no migration, deployment or business repair.

## Receipt Review — Japanese yen recommendation

- Owner approved explicit currency first, then kana plus yen without competing
  symbols/codes, then Journey/default fallback. JPY inference remains a system
  suggestion; amount/parser ambiguity and financial acceptance are unchanged.
- Entry now tracks actual currency selection/accepted values separately from
  defaults. Editing title/amount alone does not freeze NZD; explicitly choosing
  NZD with an otherwise empty form is protected across OCR refresh.
- Four focused files / 61 tests, TypeScript, affected ESLint, formatting/diff
  checks, signed Release build and signature verification passed. Release installed
  on the authorized iPhone 16 Pro. Native checks passed: kana/yen sample recommends
  JPY while retaining a pre-entered title; re-scanning that sample after explicitly
  selecting NZD retains NZD. A sample with no extracted currency symbols still
  falls back to NZD with JPY offered, as specified. Temporary Review/New Expense
  cancelled, no Expense Save. No backend, dependency, commit or push changes.

## Receipt Review — split-only gradient suggestions installed

- Split comparison candidate rows fade from a near-opaque text surface at the
  left to the sheet's transparency at the right. Removed the field heading and
  placed a solid Close button on the left. Non-comparison suggestions use opaque
  sheets and rows. Uses existing React Native gradient support; no new dependency.
- Two focused files / 31 tests, TypeScript, affected ESLint, formatting, diff check,
  signed Release build and signature verification passed. Artifact:
  `/private/tmp/otr-receipt-review-build/Build/Products/Release-iphoneos/OTRMobile.app`.
- Owner confirmed installation after saving/exiting their draft. Release installed
  and launched on iPhone 16 Pro. Portrait native checks passed for opaque ordinary
  Title overflow, split Amount gradient with the receipt visible on the right,
  left solid Close button, no duplicate field heading and candidate selection.
  Temporary Review/New Expense were cancelled with no Expense Save; app left on
  Ledger. Prior hand-held rotation/pinch/accessibility gates remain open.
- Owner approved this installed version for a local Git checkpoint on
  `integration/ledger-polish-canonical`; remote push was not requested.

## Receipt Review / FX — second owner feedback installed

- Suggestions now use translucent sheets/rows without a dimming scrim. Comparison
  Currency Suggestions opens only ranked candidates; the Currency field retains
  the full picker. Hide image is a neutral icon/text control. Re-read remains an
  OCR recovery action for the same photo, not an enhancement operation.
- Recent Expenses uses `updated_at` descending before limiting; occurrence-based
  search/list behavior is unchanged. Saved pending FX values now reuse the trusted
  account-scoped ECB snapshot cache as an ephemeral fallback after Journey quotes,
  within the existing 30-day window. Details show the reference date. See ADR 0053.
  Existing cache refresh runs in the background; financial acceptance is unchanged.
- Ten focused files / 71 tests, TypeScript, affected ESLint, formatting, diff check,
  signed Release build and final signature verification passed. Artifact remains
  `/private/tmp/otr-receipt-review-build/Build/Products/Release-iphoneos/OTRMobile.app`.
- Latest Release installed/launched on iPhone 16 Pro. Native portrait checks passed
  for translucent Amount sheet with receipt visible, two-item Currency candidates
  and selection/close, neutral Hide image appearance, recent-modification ordering,
  and approximate list/detail amounts on two previously pending JPY entries with
  the latest published reference date shown in details.
- Temporary acceptance Review/New Expense were cancelled; no Expense Save was
  performed and the app is left on Ledger. Prior pinch/rotation/software-keyboard/
  accessibility gates remain open. No backend/schema/dependency, commit or push
  changes.

## Receipt Review UX 1.0 — owner feedback installed

- Implemented six requested refinements: clear Hide image/close controls, compact
  comparison-mode candidate dropdowns retaining parser rank, Currency overlay
  preserving the mounted native image view, direct Re-read action, removal of OCR
  diagnostic text, and an actionable currency-mismatch explanation. Existing
  money validation/manual correction semantics are unchanged; no conversion.
- Six focused files / 59 tests, TypeScript, affected ESLint, formatting, diff
  check, signed Release build and final signature verification passed.
- Final artifact remains
  `/private/tmp/otr-receipt-review-build/Build/Products/Release-iphoneos/OTRMobile.app`.
  Owner authorized installation after the unsaved-draft warning. The feedback
  Release was installed/launched successfully on iPhone 16 Pro, retaining existing
  app data. Physical portrait checks passed for Title/Amount dropdown selection,
  Currency selection/return preserving the comparison page, Hide image collapse
  and reopening, direct Re-read with busy disabling/completion and retained chosen
  fields, and absence of OCR diagnostics.
- The temporary one-image comparison Review was subsequently cancelled during the
  next feedback pass; no Confirm or Expense Save was performed.
- Next: physical pinch + Currency return to confirm zoom retention. Previous
  rotation/keyboard/accessibility gates remain open. No backend, dependency,
  commit or push changes.

## Receipt Review UX 1.0 — installed, portrait acceptance checked

- Approved behavior is captured in `docs/ledger/RECEIPT_REVIEW_UX_1_0_DESIGN.md`.
  Review now presents only Title/Amount/Currency with shared measured two-row
  candidate tags, selection matching, compact Title/Amount overflow and the
  existing full searchable Currency picker. Scan another part stays prominent
  and remains in place when disabled at the shared three-attachment limit.
- The right-edge 36 pt receipt stack uses stable draft order/document identity.
  Same-surface comparison retains an editable left form, numbered receipt tabs,
  native image zoom/pan, header right-swipe and explicit close/remove/retry.
  Landscape starts side by side and can still collapse; the image toolbar uses
  one row where width permits. iOS orientation eligibility is declared in Expo
  Info.plist config, while the main navigation retains portrait orientation.
- Existing multi-select source sheet, sequential OCR queue, conservative parser,
  USER_EDITED protection, offline drafts and C4 Confirm/Cancel transfer are reused.
  No backend, schema, Supabase, Production, dependency, commit or push changes.
- Focused regression: 14 files / 213 tests; TypeScript, affected ESLint, formatting
  and diff checks passed. New UI checks are model/source-wiring checks, not native
  rendered interaction acceptance. iOS Release compilation and signed Release
  build passed, and the app signature verified. Build artifact is
  `/private/tmp/otr-receipt-review-build/Build/Products/Release-iphoneos/OTRMobile.app`.
- The signed Release was installed/launched on the authorized iPhone 16 Pro,
  preserving existing app data. Physical portrait checks passed for 1/2/3 images,
  first/later multi-select, two-row tags and overflow/full currency picker,
  manual-value protection, capacity disabling, editable comparison, numbered
  switching, header collapse, retry/removal, Confirm transfer and Cancel cleanup.
  A removal exposed an ordinal/header mismatch; the header now uses the stable
  receipt number. The corrected Release was rebuilt, reinstalled and verified.
  Final fix checks: 3 files / 35 tests, TypeScript and affected ESLint passed.
- No Expense Save was performed; temporary acceptance drafts were discarded,
  source Photos remained intact, and the app was left on Ledger. Existing Debug
  Mode was enabled during observations; normal no-debug display was not checked.
- Next gate: owner hand-held rotation both ways, pinch/pan, software keyboard,
  larger text/VoiceOver and narrower-device layout. Mirroring cannot exercise
  rotation or multi-touch. Overall visual acceptance remains open.

## Expense Capture UX 1.0 — Slice 1.2 owner feedback

- Implemented native keyboard inset handling for Exact/Notes, removed duplicate avoidance/forced end scrolling, separated Group settlement heading/options/explanation, centered attachment filenames, and added an explanatory Scan receipt source sheet with remaining capacity and image-only multi-part selection. Newly selected scan parts read sequentially into the accepted Review; Camera stays single and Scan another part remains available. No parser/backend/schema changes.
- Seven focused files / 62 tests, TypeScript, affected ESLint, Prettier and diff check passed. Signed Release build succeeded and was installed/launched on the authorized iPhone 16 Pro. Owner checks on Exact/Notes keyboard positioning, settlement explanation, centered filenames, and first/later multi-image scan source selection remain the acceptance gate. Owner authorized a consolidated local Git commit of the UI changes through this checkpoint; no push requested.

## Expense Capture UX 1.0 — Slice 1.2

- Sharing clarity and attachment experience are implemented in Mobile: explicit settlement tag/info, wrapping people/split chips, Exact Total/Assigned/Remaining with the accepted allocator as Done gate, clean size-free attachment rows, closable image/PDF previews, capacity-bound multi-select import, and compact max-three state.
- `docs/EXPENSE_CAPTURE_UX_1_0_SLICE_1.md` records Slice 1.2 behavior and physical acceptance. Seven focused test files / 59 tests, TypeScript, affected lint, formatting, diff check, and signed Release build passed. The Release was installed and launched on the authorized iPhone 16 Pro. Owner visual interaction review remains the gate. OCR, Expense Detail, backend, Supabase, and Production remain unchanged. Stop after Slice 1.2.

## Expense Capture UX 1.0 — Slice 1.1

- Interaction cleanup implemented: Amount editing no longer inserts a premature validation row; attachment rows use file identity, image thumbnail/local preview and PDF Quick Look; Sharing is one staged inline editor; Date backdrop and sheet animate independently. OCR, receipt draft lifecycle, saved Expense detail, API and backend behavior remain unchanged.
- `docs/EXPENSE_CAPTURE_UX_1_0_SLICE_1.md` records the new rules and physical acceptance checklist. Seven focused test files / 57 tests, TypeScript, affected lint, formatting, diff check, and signed Release build passed. The final Release was installed and launched on the authorized iPhone 16 Pro. Owner visual interaction review remains the gate. Stop after Slice 1.1.

## Expense Capture UX 1.0 — Slice 1

- New Expense compact information architecture is implemented: Category/Date pair, one Sharing summary and editor, explicit Attachments action/list, and compact Notes. More Details is removed. Existing OCR, draft, save, sync, and backend behavior is unchanged.
- `docs/EXPENSE_CAPTURE_UX_1_0_SLICE_1.md` records scope and acceptance. Seven focused test files / 54 tests, TypeScript, affected lint, formatting, diff check, and signed Release build passed. Release was installed and launched on the authorized iPhone 16 Pro. Owner visual review is the next gate. Stop after Slice 1.

## Receipt OCR 1.0 — Phase C4 Confirm integration

- Confirm now validates current Review/session data and capacity, applies the
  reviewed Title/Amount/Currency to New Expense, and transfers scan images to
  its existing attachment drafts without file copies. Date and unrelated
  fields are untouched. Prior nonempty form Title/Amount and current Currency
  are visible as user-owned Review starting values. Review Cancel remains a
  separate discard path; Confirm clears OCR/session state without deleting
  transferred images. A second scan starts a new session if capacity allows.
- Temporary recovery metadata is changed to ordinary attachment status before
  the form update, with rollback attempted on write failure. After Confirm,
  restart restores image drafts but not unsaved form fields, matching existing
  New Expense recovery. Ordinary Save retains the local Expense/receipt-asset
  transaction and durable upload/link ordering. No OCR evidence persists.
- The device owner confirmed Confirm applies reviewed Title/Amount/Currency
  without changing Date, transfers one/two images, permits later edits, and
  Cancel leaves no Expense. Offline Save retained one Expense and one image
  through restart. The first reconnect check showed Upload failed because OTR
  Mobile cellular data was still disabled: its Expense create reported
  `AUTH_REFRESH_UNAVAILABLE`. After cellular data was enabled, the existing
  queue completed Expense create and attachment upload without duplication;
  the reopened detail showed one attachment as Available and it opened through
  the existing iOS share sheet. The Dev API health endpoint was healthy.
- Review now exposes ambiguous `¥` as selectable JPY/CNY candidates, and
  OCR text offers tentative currency choices without automatic selection:
  kana suggests JPY; Han-only text offers JPY/CNY/TWD/HKD because the script
  alone does not identify a country. A same-photo Japanese receipt rescan on
  the authorized iPhone displayed the JPY hint and JPY in Currency suggestions;
  its temporary draft was cancelled. Existing manual values remain protected.
  Later Expense Detail polish should open an image preview before sharing and
  clarify why prior manual values are retained. No Backend, Production,
  migration, live scanner or Foundation Models change. C4 is functionally
  accepted; stop after C4.
- Final focused regression: 13 files / 200 tests, TypeScript, affected ESLint,
  Prettier, diff check, and signed physical Release build passed.

## Receipt OCR 1.0 — Phase C3 multi-part Review implementation

- Review now adds up to three image parts within one session, subject to the
  shared Expense attachment maximum of three. Every add, OCR completion and
  removal reparses all successful images. User-edited or explicitly selected
  Title, Amount and Currency stay fixed; system suggestions and candidate
  lists refresh. Each field can return to the latest suggestion explicitly.
- Review shows image count and per-part Read/Remove. Removing a failed, blank
  or bad part and scanning again replaces it. Removed and cancelled scan
  drafts are cleaned locally; stale OCR cannot restore them. Restart recovery
  stores only draft session ID/order and offers Resume or Discard, with manual
  re-read. Confirm still does not apply values or images to the Expense form.
- Parser/OCR/draft/C1–C3 regression: 11 files and 170 tests passed; TypeScript,
  affected ESLint, Prettier and diff checks passed. The signed Release build
  succeeded, was installed over the existing app and launched on the authorized
  iPhone 16 Pro. The device owner confirmed the C3 main flow passed: a second
  image updated the same Review with combined amount evidence, a third image
  did not overwrite the edited Title, edited Amount survived removal and
  candidate refresh, full capacity blocked another scan, and Cancel preserved
  the original New Expense form and attachments. A separate force-close/restart
  offered Resume with both images, per-part Read worked without duplicates, and the
  two temporary scan drafts were absent after the user later exited/re-entered
  New Expense. The case with two ordinary attachments passed automated tests
  but was not separately observed on the device. C3 is functionally accepted.
  No Backend, cloud, migration, Production or Foundation Models change. C4
  is the next gate; it has not been implemented.

## Receipt OCR 1.0 — Phase C2 functional Review implemented

- New Expense Scan receipt opens a transient Review Sheet for Title, Amount and
  Currency only. OCR recognition, no-text and failure states retain manual
  entry. Ordinary Add Attachment and Edit Expense do not enter Review.
- Pure review state separates ranked candidates/suggestion classes from
  editable values. Strong Amount prepopulation requires same-line final label,
  exact supported currency and no conflicting interpretation; ambiguous
  amounts stay blank with selectable alternatives. Explicit receipt currency
  outranks Journey; selecting a candidate or editing any field marks
  USER_EDITED. Confirm returns typed session/field data without changing the
  Expense form. Cancel discards only this pending scan draft.
- Automated parser/C1/C2/A1/A2 tests (11 files, 166 tests), TypeScript,
  lint, formatting and diff check passed. The final signed Release build
  succeeded and was installed/launched on the authorized iPhone 16 Pro without
  clearing app data. The user confirmed all requested non-sensitive device
  checks: strong and ambiguous receipt suggestions, candidate choice, three
  editable fields, currency picker/keyboard, no-text manual entry, Cancel
  restoring the untouched form, and no Review from ordinary Add Attachment or
  Edit Expense. C2 is functionally accepted. C3 implementation is summarized
  above; C4 owns Confirm-to-Expense application.

## Receipt OCR 1.0 — Phase C1 foundation complete

- `parseReceiptEvidenceSet` composes one to three Vision documents through
  B1–B3 with stable document-scoped transient evidence IDs. Document-local
  geometry/adjacency stays isolated; combined ranked candidates preserve
  cross-part merchant, amount, currency and date evidence. Overlap does not
  earn cross-image duplicate points; strong conflicting totals stay ambiguous.
  `parseReceipt(OcrDocument)` remains the accepted B4.2 entry point.
- `ReceiptScanSession` keeps verified temporary-draft references, owner/Journey,
  per-document OCR revisions, a session revision and a derived combined parse
  only in memory. It supports add/remove/replace/retry, stale-result rejection,
  background suspension and cancellation. Shared attachment-capacity validation
  limits session parts plus existing drafts to three. Recovered drafts retain
  deterministic document identity and need fresh OCR. C1 does not delete
  returned drafts; C3 owns UI orchestration and cleanup.
- Focused C1/parser/A1/A2/draft tests, TypeScript, affected lint/format and
  `git diff --check` passed. No UI, Expense field write, native change,
  Foundation Models, migration, Backend or Production change. **Next approved
  checkpoint: C2 Review presentation and suggestion policy only.**

## Receipt OCR 1.0 — Phase C0 design/audit complete

- The approved product direction is a candidate-first Review Sheet for
  Title, Amount and Currency; no OCR Date field. One to three image parts
  contribute combined evidence. USER_EDITED review values survive add/remove
  rescans. Confirm copies values and images into New Expense; ordinary Save
  remains separate. Cancel discards only this Review session's pending scans.
- The design and C1–C4 plan are in
  docs/ledger/RECEIPT_OCR_1_0_PHASE_C0_REVIEW_DESIGN.md; PRODUCT and ADR
  0050 record the changed scope. C0 changed no code, parser rules, UI,
  Backend, Production or device state.
- Apple Foundation Models can provide optional iOS 26+ structured on-device
  candidate ranking on eligible, ready devices. The app still targets iOS
  16.4, so Vision plus deterministic candidates and Review is the required
  iOS baseline; Android still needs its own local OCR adapter. A semantic
  resolver is not required for C1–C4;
  remote AI is excluded from OCR 1.0. C1 foundation is now complete.

## Receipt OCR 1.0 — Parser B4.2 fixed-set reevaluation complete

- Version receipt-b4.2 adds bounded Chinese integer extraction after monetary
  labels, rejects distant same-line label/value associations, requires stronger
  amount evidence, abstains on a second plausible labeled amount, recognizes
  French August abbreviations, and excludes common slogan/screenshot control
  text from merchant candidates. Currency inference was not expanded.
- Synthetic parser/OCR tests: 126 passed; TypeScript, affected ESLint,
  Prettier, signed iPhone Release build, and the fixed 14-photo device rerun
  passed. The bank slip remains excluded from purchase-field metrics.
- On the same 13 receipts, amount top correct 7, lower correct 5, missing 1,
  **wrong clear 3** (unchanged); currency clear correct 3, cautious abstention
  10, wrong clear 0; date top correct 6, no-date abstention 4, known-date
  candidate missing 3, wrong clear 0; merchant top acceptable 5, lower 4,
  unknown-name abstention 1, no acceptable candidate 3, wrong clear 2.
- The amount safety objective was **not met**, so B4.2 is not an automatic
  amount decision engine. The later C0 product decision permits a
  candidate-first Review design with explicit user confirmation. The B4.1
  baseline and B4.2 results remain in the OCR plan. No private receipt text
  or images were retained; transient app state was cleared.

## Receipt OCR 1.0 — Parser B4.1 blind baseline complete

- Pure `parseReceipt()` composes B1/B2/B3 without changing accepted parser
  rules. The full B1–B3 synthetic suite now runs through it; 118 focused
  tests, TypeScript, affected ESLint/Prettier, and device Release build pass.
- User-approved private iPhone Photos set: 14 items, including 13 purchase
  receipts and one excluded bank-slip negative control. Visual ground truth
  preceded parser inspection and uncertain fields were confirmed by the user.
  The initial OCR pass had 2 repeatable malformed-result failures; native
  box clipping resolved them, and the frozen parser rerun returned
  14/14 OCR documents. No real image or recognized text entered Git/logs.
- On 13 eligible receipts, amount top candidate correct 7, correct lower 5,
  absent 1, with **3 incorrect confident selections**; currency clear-correct
  3 and safely abstained 10, with **0 incorrect confident**; date top correct 5,
  true absent-date abstention 4, known date absent from candidates 4, with
  **0 incorrect confident**; merchant acceptable top 5, lower 4, unknown-name
  abstention 1, no acceptable candidate 3, with 2 wrong clear selections.
- Privacy-safe failure taxonomy and ranked B4.2 proposal are in
  `docs/ledger/RECEIPT_OCR_1_0_IMPLEMENTATION_PLAN.md`. **Next checkpoint:
  review/approve B4.2 parser safety tuning before any Phase C suggestions.**

## Receipt OCR 1.0 — Parser B3 date and merchant implemented

- `src/domain/receipt/receiptParserB3.ts` adds pure transaction-date and
  merchant-display-name candidates over B1 line evidence. Valid calendar dates,
  ambiguous numeric order, bounded explicit context hints, positive/negative
  date labels, multilingual name text, generic/header/contact exclusions, and
  separate field abstention are covered. It does not touch Expense state or
  native/Backend paths. Structured synthetic evaluation: date 27 fixtures
  (20 correct clear tops, 7 correct abstentions); merchant 12 fixtures
  (8 acceptable clear tops, 4 correct abstentions); neither has an incorrect
  confident selection. Real-receipt quality is not yet measured. **Next
  isolated slice: B4 language tuning and evaluation only.**

## Receipt OCR 1.0 — Parser B2 total ranking implemented

- `src/domain/receipt/receiptParserB2.ts` ranks B1 monetary occurrences by
  nearby final-total/payment labels, penalizes non-final monetary lines, merges
  duplicate exact values with currency-sensitive evidence, and exposes
  `clear`/`ambiguous`/`none` without touching Expense state. Initial English,
  Simplified/Traditional Chinese, and Japanese amount labels are covered.
  The 30 synthetic amount fixtures yield 24 correct clear tops and 6 correct
  abstentions, with no incorrect confident selections. Split numeric
  observations and real-receipt accuracy remain unevaluated. **Next isolated
  slice: B3 date and merchant parsing only.**

## Receipt OCR 1.0 — Parser B1 extraction implemented

- `src/domain/receipt/receiptParserB1.ts` is a pure local parser over the A1
  `OcrDocument`. It groups transient line/fragment evidence, extracts exact
  decimal-text numeric alternatives, keeps ambiguous separators, extracts
  explicit/symbol/context currency evidence, and associates only nearby
  same-line currency/number tokens. It does not rank totals, convert all
  values to cents, parse date/merchant, or touch New Expense/Backend/storage.
- Structured synthetic tests cover EN/ZH/JA/mixed text, US/European grouping,
  bare symbols and Journey hints, duplicate values, non-money filters,
  ordering, and empty/noisy input. B1's deliberate limits and reason codes
  are documented in the OCR implementation plan. B2 now consumes this
  intermediate representation without changing its extraction semantics.

## Receipt OCR 1.0 — Parser B0 design complete

- The OCR implementation plan now defines the pure, local parser contract,
  evidence and ambiguity rules, amount/currency/date/merchant ranking, 27
  structured synthetic fixture cases, privacy-safe real-receipt evaluation,
  metrics, and B1–B4 stop points. No parser code, UI, native OCR, Backend,
  database, or Production state changed.
- **Recommended next coding slice: B1 only** (line grouping and bounded
  numeric/currency candidates). B0 is a design handoff; no Expense field
  suggestion or canonical write is authorized by this stage.

## Receipt OCR 1.0 — Phase A2 accepted on physical iPhone

- New Expense Scan receipt invokes local Apple Vision only after a verified
  temporary image draft exists. The current scan alone owns a transient OCR
  document; ordinary Attachment and existing Expense paths do not invoke OCR.
  PDF stays attachable without OCR. Removing/replacing a scan, leaving the form,
  or backgrounding cancels and invalidates stale results. A recovered draft may
  be explicitly rescanned without copying it again.
- Compact status/manual-entry and Debug Mode structural metrics are present.
  No parser, field prefill, OCR persistence, Backend OCR, or schema change.
  Focused tests, TypeScript, lint, and signed iPhone Release build passed;
  the build was installed and launched. The user confirmed a New Expense scan
  reached an OCR state, manual fields stayed usable, and removing the receipt
  cleared it. With OTR-only cellular access off and no phone Wi-Fi, the user
  confirmed offline OCR. After force-close/restart, one attachment recovered
  and explicit Read rescanned it without a duplicate; cellular was restored.
  The user also confirmed second-scan completion, removal clearing OCR status,
  and blank-image no-text/manual entry. Device Hub cannot share the iOS 26.6
  screen. A2-specific CJK/mixed UI checks were not repeated; A1 direct-provider
  fixture results stand. Low-contrast/thermal and EXIF-only rotation remain
  quality checks for later acceptance.
- **Stop after A2.** Receipt Parser Phase B remains separate.

## Receipt OCR 1.0 — Phase A1 native extraction implemented

- An iOS-only local Expo Module now runs Apple Vision revision 3 on app-owned
  image files, returning transient structured text observations through a
  validated TypeScript provider. The New Expense flow does not invoke it yet.
- Focused tests, TypeScript, affected lint/format, autolinking, CocoaPods,
  unsigned Release, and signed iPhone 16 Pro Release builds passed. Six bundled
  synthetic fixtures ran on the physical phone via the isolated A1 test route;
  results and limits are in the OCR plan. With the user-confirmed OTR Mobile
  cellular switch off and no phone Wi-Fi, English and mixed-language fixtures
  also passed on the device; CoreDevice cannot independently inspect that
  setting. Peak-memory measurement remains open. No Backend, database, or
  Production change.
- **Stop after A1.** A2 is the next possible slice after accepting the A1
  evidence and closing or explicitly carrying its device gaps. Device Storage
  Phase 3C+ remains deferred.

## Receipt OCR 1.0 — Phase A0 read-only audit complete

- Architecture findings, local Apple Vision contract, privacy/failure policy,
  tests, and A1–D slices are in
  `docs/ledger/RECEIPT_OCR_1_0_IMPLEMENTATION_PLAN.md`; ADR 0049 is proposed.
- No OCR code, SQLite, Backend, Supabase, Hosted Dev, Production, or device
  state changed. Next coding checkpoint is A1 (native extraction foundation)
  after this plan is reviewed. Device Storage Phase 3C+ remains deferred.

## Device Storage Management 1.0 — Phase 3B safety gate implemented; 3C+ deferred

- Legacy 250 MiB receipt eviction now requires an active uploaded receipt at its
  exact owned file path, no unfinished asset operation, fresh authenticated
  Backend provider `stat()` proof of key/size/SHA/MIME, and a matching GET byte
  hash. The conditional SQLite update clears the URI before deleting the file,
  so interruption cannot create a newly stale non-null path. Existing online
  redownload remains verified; offline missing-file error now asks to reconnect.
- No SQLite/Postgres migration or persistent confirmation: every eviction is
  independently verified. Hosted Dev Backend only was deployed and healthy
  (image `sha256:5106284653b9d45993778dbdf236162cead819b6cf3bf100d7bed4762f0bc28f`).
  An existing synthetic receipt passed authenticated HEAD/GET at 68 B with
  exact object key, MIME and SHA-256. Production and objects were untouched.
- Focused 11 files / 102 tests, TypeScript, Backend bundle build, affected
  ESLint, and formatting passed. Physical iPhone acceptance remains unverified:
  CoreDeviceService initialization timed out twice. See the Phase 3 plan for
  the exact gate and limitation. **Stop Device Storage work here; Phase 3C+
  is temporarily deferred. Next development area: Receipt OCR 1.0.**

## Device Storage Management 1.0 — Phase 3A audit/design drafted

- Read-only source audit and future OTR-wide design are in
  `docs/DEVICE_STORAGE_MANAGEMENT_1_0_PHASE_3_PLAN.md`. No code, schema,
  device files, Storage objects, Hosted Dev, or Production were changed.
- The existing operational cycle already invokes a 250 MiB receipt limit with
  a fresh authenticated download/hash check before eviction. It has no durable
  remote-confirmed class or global cache accounting. Treat its safety gate as
  the first Phase 3 coding checkpoint before adding the new cache manager.
- Future Album lifecycle and original-storage policy remain undecided. The
  proposed 500 MiB global disposable-cache budget is a design baseline only.

## Expense Attachments Phase 2A — ACCEPTED; 2B–2D deferred

- Phase 1 remains accepted. Backend upload, authorized download, and existing
  OCR binary read now use the narrow `AttachmentStorageProvider`; the only
  configured implementation uses the existing private Supabase bucket. Unknown
  providers fail closed. Mobile routes, SQLite, and object keys are unchanged.
- Additive Postgres migration `20260927000300_receipt_storage_provider.sql`
  adds a defaulted `storage_provider = 'supabase_storage'` to old and new
  `receipt_assets`. Local and Hosted Dev `tuqigdxrvrerfewsxqgm` are migrated.
  The Hosted Dev Backend image is
  `sha256:7bd88516063599575e06fe31a13ddb5e8f741030af24ebcd4200d107d43e96ba`
  and healthy. Production was not accessed; no binary was migrated or
  physically deleted.
- Focused Backend/receipt/Personal Payment tests, receipt pgTAP, TypeScript,
  lint, format, build, and diff checks passed. Hosted Dev synthetic acceptance
  covered historical read/hash, new upload/download and retry, outsider 403,
  unknown-provider 503 without bytes, restored read, and tombstone 404. The
  older Personal Payment pgTAP fixture collided with existing local FK data;
  focused Personal Payment Vitest passed. See the Phase 2 plan for exact
  evidence and limitations.
- Phases 2B, 2C, and 2D are intentionally deferred until OTR Mobile Album /
  shared object-storage infrastructure development begins. At 2B, evaluate
  Hetzner Object Storage and a shared low-level S3-compatible adapter for
  Expense attachments, Personal Payment evidence, and Album media. Attachment
  and Album domain lifecycles remain separate. Existing attachments stay on
  `supabase_storage`; no historical migration is needed before 2B, and future
  mixed-provider reads are the intended transition strategy.
- Before automatic local attachment cache eviction, Clear Attachment Cache, or
  switching to a provider whose upload acknowledgement is insufficient, require
  strong remote-durability confirmation. `provider.stat()` exists, but upload
  completion does not independently use it to verify remote persistence.
  This does not block accepted Supabase-backed behavior. Production remains
  untouched. See the Phase 2 plan for the 2B infrastructure prerequisites.

## Expense Attachments Phase 1 Slice 4.1 — Foundation accepted on synthetic device evidence

- A bounded diagnostic on the physical iPhone showed the synthetic PNG's
  prepared file and stored metadata matching in MIME, size, and SHA prefix.
  Its upload operation reported Expo Crypto `ERR_ARGUMENT_CAST`: the shared
  `receiptBytesSha256` passed an `ArrayBuffer` to native `digest`, which requires
  a `TypedArray`. This failure happened before Backend metadata creation.
  A native-compatible `Uint8Array` call fixed the helper; a regression test
  failed before the fix and passed afterward. The signed Release app with the
  fix is installed on the iPhone, and a bounded Debug Mode diagnostic is
  available per attachment. No iPhone Mirroring was used.
- The user needs the phone hotspot for normal Internet use. Keep offline test
  windows short. The isolated new synthetic JPEG uploaded on one online
  launch; its local file, Hosted Dev metadata, and exact Storage object all
  matched at 385,817 B and SHA-256. A second narrow fix preserves local source
  metadata through ordinary receipt pulls; its Release build is installed.
  HEIC→JPEG and transparency-preserving PNG device uploads also passed, with
  source/stored byte counts retained and exact Hosted Dev object hashes verified.
  PDF also uploaded and opened successfully, with exact remote bytes verified.
  The final New Expense draft reappeared after an offline force-close/restart,
  and the saved Expense/attachment survived another offline restart. On initial
  reconnect, Expense and receipt sync raced; the receipt retried before Expense
  had a server ID. The operational cycle now runs Expense sync before receipt
  sync. Its ordering regression passed, and the same offline receipt became
  Available without re-entry. Hosted Dev has exactly one active attachment
  for that Expense, with exact Storage size/SHA matching metadata; the user
  confirmed preview readability. Twelve focused files/115 tests, TypeScript,
  affected ESLint, and Prettier passed. Personal Payment device evidence lacks
  a synthetic fixture and remains a release acceptance item. No Backend/Supabase
  deploy or Production access. See the Phase 1 foundation plan for evidence.

## Expense Attachments Phase 1 Slice 4 — local media pipeline implemented; acceptance open

- JPEG, PNG, HEIC/HEIF, and PDF inputs now pass file-signature/MIME checks in
  the shared receipt store. Native image preparation targets a 2200 px long
  edge and JPEG quality 0.83, retaining PNG when transparency may matter.
  PDFs remain unchanged with a 10 MiB new-input limit; image sources have a
  50 MiB/60 MP limit. SHA-256, size, and MIME describe stored bytes and are
  rechecked before upload. Existing Expense and Personal Payment imports use
  the same safe temporary-copy path.
- Additive local SQLite migration 39 stores nullable original filename/MIME/
  bytes and prepared width/height. Account/Journey-scoped New Expense draft
  records allow intact drafts to reappear after restart without duplicating
  committed assets. No Backend/Supabase migration or deploy; Production was
  not accessed. See the Phase 1 foundation plan for measurements and exact
  recovery semantics.
- Focused local tests (11 files, 87 tests), TypeScript, affected ESLint,
  Prettier, and diff check passed at this checkpoint.
  An earlier Release build installed on the authorized iPhone 16 Pro; final
  draft-recovery edits were not rebuilt there. Safe synthetic
  HEIC, JPEG, and PNG saved locally and previewed, with max-three enforced,
  but all showed Upload failed. The remote cause, PDF/offline/restart/camera
  path, and Personal Payment device path remain unverified. iPhone Mirroring
  crashed twice and device UI testing stopped. Full Slice 4/Phase 1 acceptance
  remains open; next checkpoint is scoped upload diagnosis and completion of
  device acceptance without relying on unstable Mirroring.

## Expense Attachments Phase 1 Slice 3.1 — Hosted Dev/iPhone integration accepted

- Backend Slice 3 is deployed only to Hosted Dev `tuqigdxrvrerfewsxqgm`
  (image `sha256:86c3b06c7a221b261cd8a97f6fedad314eeb79cc2f792c22efd11c4b57795487`).
  Hosted Dev has migrations through `20260927000200`; Production was not
  accessed. The signed Release app was installed on the authorized iPhone 16
  Pro, iOS 26.6. HTTP and device acceptance covered online image add/open,
  native PDF view, max-three, online/offline deletion, app restarts, offline
  upload retry, cross-account authorized read, outsider denial, writer/view-only
  deletion rules, and linked-Expense OCR rejection.
- Two narrow device defects were fixed: Add attachment now has the actor and
  max-three guard (Edit Expense remains available), and existing-Expense
  receipt import wakes the operational sync after local save. An accidental
  personal-file picker selection was remediated in Dev: Backend tombstone,
  exact Storage object removal, 404 download verification, and iPhone pull;
  the original iCloud file was untouched. See the Phase 1 foundation plan for
  exact evidence and remaining limitations.
- Final Hosted Dev state: 20 receipt assets, maximum three active per Expense,
  no duplicate local keys; the device test Expense has two active and three
  tombstoned. Five historical orphan candidates remain untouched. No Hosted Dev
  Personal Payment row currently has a linked evidence asset; focused
  compatibility tests cover that path. Slice 3.1 is complete; Slice 4 requires
  its own instruction. No HEIC, OCR, cache, storage provider/accounting, or
  physical deletion work began.

## Expense Attachments Phase 1 Slice 3 — implementation and Hosted Dev database acceptance

- Existing Expense detail lists/opens/adds/removes active attachments; add uses
  durable offline receipt import without OCR. A local SQLite transaction
  tombstones an Expense asset and queues `DELETE_RECEIPT`; restart and later sync
  retain that intent. Pending local deletion is account-scoped, and replacement
  upload waits for remote deletion. Server `deleted_at` hides the asset and releases its slot
  without deleting private bytes. Stale receipt pulls cannot clear a local
  tombstone. Personal Payment evidence retains its separate link/read rules.
- Supabase migration `20260927000200_expense_attachment_tombstones.sql` is
  applied to local and Hosted Dev `tuqigdxrvrerfewsxqgm` only. Local SQLite
  migration 38 preserves prior asset operations while adding the delete type.
  Hosted Dev pgTAP: new 9/9, prior max-three 9/9, existing receipt 8/8.
  Local two-session add/delete showed the insert waiting on the Expense lock;
  both committed and final active count was three. Production was not touched.
- Backend download now allows a current Journey reader to fetch another
  uploader's active Expense attachment. Delete uses existing `canWriteTrip`
  (creator, legacy trip member, or linked owner/group member); local offline
  mutation requires cached owner/group_member role. Five historical uploaded
  unlinked orphan candidates remain protected. No physical deletion, OCR,
  cache, provider, HEIC or storage accounting work was started.
- At this checkpoint Backend/device acceptance was pending; Slice 3.1 above
  records its completion. The standalone
  Personal Payment repository Vitest suite still fails to parse React Native
  Flow; focused shared receipt and Personal Payment sync tests pass. Next work
  begins only with a new Slice 4 instruction. Full validation evidence is in
  `docs/ledger/EXPENSE_ATTACHMENTS_PHASE_1_FOUNDATION_PLAN.md`.

## Expense Attachments Phase 1 Slice 2 — local implementation

- New Expense holds 0–3 temporary receipt drafts with add/remove and a shared
  domain maximum. Save prepares all copies and commits the Expense, all asset
  rows, and UPLOAD/LINK intents in one SQLite transaction. Stable draft IDs
  make retries idempotent. Failure preserves source evidence.
- Additive Supabase migration `20260927000100_expense_attachment_limit.sql`
  locks the Expense row before counting attachments. The new upload request
  binds an Expense ID at metadata creation, so overlimit attempts fail before
  binary upload. Personal Payment evidence remains outside the Expense limit.
  No SQLite migration. Migration and two-session concurrency require local DB
  verification before deployment; no Hosted Dev or Production was touched.
- Focused tests: 11 files / 112 passing; TypeScript, affected ESLint,
  Prettier, and diff check passed. Personal Payment repository's standalone
  suite still cannot parse React Native Flow. Next approved work is
  Slice 3 only after a new instruction. Canonical design and ADR 0048 remain
  authoritative; see the Phase 1 foundation plan for failure semantics.

## Expense Attachments Phase 1 Slice 1 — local implementation

- New Expense receipt selection now creates only an account-scoped temporary
  file. Cancel/Remove attempts safe temporary cleanup; no asset or upload is
  queued before Save. The existing-Expense form hides the New Expense receipt
  action; the old Scan deep link cannot upload or request OCR.
- Save keeps the draft source through file preparation and one SQLite
  `withTransactionAsync` that commits Expense, receipt metadata, UPLOAD and LINK
  operations together. No schema migration or Backend change. A failed copy or
  transaction leaves the draft; an unreferenced prepared copy may remain for
  later conservative recovery. After commit, duplicate draft cleanup is best
  effort. Stable draft IDs make re-entry idempotent.
- Focused tests: 8 files / 49 passing; TypeScript, affected ESLint, and Prettier pass.
  Personal Payment repository's standalone Vitest suite still cannot parse
  React Native Flow, while its receipt repository/worker compatibility checks
  pass. No Simulator/device, Hosted Dev, or Production work was performed.
  Next approved checkpoint is Phase 1 Slice 2 only after a new instruction.

## Expense Attachments & Receipt Scan 1.0 — Phase 0 documentation complete

- Canonical design: `docs/EXPENSE_ATTACHMENTS_RECEIPT_SCAN_1_0_DESIGN.md`.
  `docs/PRODUCT.md` and the Ledger product spec now require on-device OCR for
  New Expense only; existing Expenses may manage attachments without OCR.
- ADR 0048 fixes reuse of `receipt_assets`, temporary scan drafts, atomic local
  Save/promotion, three-attachment limit, uploader byte ownership versus
  Expense/Journey read visibility, and protection of unconfirmed originals.
- `docs/ledger/EXPENSE_ATTACHMENTS_PHASE_1_FOUNDATION_PLAN.md` defines the
  additive migration, exact slices, tests, and later-phase exclusions. Phase 0
  changed documentation only; Slice 1 status is recorded above.

## Buglist 004 — Currency help and New Expense form (2026-09-27)

- Journey Currency info icon now aligns with its heading; tapping the icon again
  or the surrounding page closes its explanation. New Expense uses the same
  compact Cancel/Done date wheel as Currency.
- A sole participant needs no visible Split control; allocation remains automatic.
  Group settlement appears for multiple participants or one participant other
  than the current member, with an Include/Exclude segmented choice. More Details
  uses a disclosure control. Notes scrolls above the software keyboard.
- No attachment upload, API, schema or repository change. TypeScript, affected
  lint/format and diff check passed; signed Simulator and iPhone 16 Pro Release
  builds installed and launched. Simulator verified the date panel, participant
  conditions, choice state, disclosure, help dismissal and visible Notes above its
  software keyboard. Physical touch verified the help dismissal, date panel,
  single-other-participant control and choice state. iPhone Mirroring did not
  display a software keyboard for the physical Notes focus, so that particular
  device interaction remains unverified.

## Buglist 003 — Ledger form and Currency UI (2026-09-27)

- Currency uses a compact bottom date picker with a centered wheel. Journey
  Currency explanation opens from an info icon and explains original currency,
  historical valuation, change conditions, and permanent lock. Ledger sheet
  titles use regular weight; Spending's Needs attention matches Settlement.
- New Expense opens directly from Add. Currency and Scan receipt share a row;
  Category follows the title and suggests a stable category locally from English
  or Chinese keywords, while manual choice wins. The receipt appears under
  optional attachments. Split Expense shows only equal and exact amounts and
  does not report a missing amount before one is entered.
- No API, schema or repository change. Focused tests, TypeScript, affected lint,
  formatting, diff check, and signed Release builds passed. Simulator interaction
  verified the date wheel, scan Cancel return, category suggestion/override and
  split choices. The final signed app installed and launched on iPhone 16 Pro;
  New Expense and Currency were visually checked. Device Hub cannot control
  touch on this iOS 26.6 phone, so physical interaction with the new controls
  remains unverified. OCR and attachment upload are reserved for the next round.

## Buglist 002 — Ledger sheets, gestures and wording (2026-09-27)

- Currency selectors use reachable iOS page sheets. The date wheel uses a compact
  bottom sheet with Cancel/Done; Journey Currency help is shorter and sits below
  the currency row. Ledger sheets share bold green titles and white pill action
  buttons; a downward drag on the header closes them.
- A selected Journey disables Ledger's back gesture, including after switching
  Journeys. Spending total labels are larger and green. Spending and Settlement
  use the same owed/owing/settled wording.
- No API, schema or repository behavior changed. TypeScript, affected ESLint and
  Prettier, diff check, and 10 focused tests pass. The full suite runs 648 passing
  tests; the same three unrelated files cannot load React Native Flow syntax in
  Vitest. Final Release builds succeeded on iPhone 17 Pro Simulator and iPhone 16
  Pro; the simulator app launched. On the phone, Currency layout, white pill
  selector buttons, compact date panel, header swipe dismissal, Settlement wording,
  and selected-Journey swipe blocking were inspected.

## Buglist 001 — Ledger navigation and Currency polish (2026-09-27)

- Re-selecting the active Ledger tab preserves its current Journey/page. My Ledger
  Settlement rows open the matching Journey Settlement directly; owed, owing, and
  settled labels now use distinct colors and backgrounds.
- Account and Settings show an arrow-only back button. Currency explains when
  Journey Currency can change. Exchange Rate Lookup starts with From empty,
  Journey Currency as To, and the device-local current date; it makes no initial
  lookup until a From currency is chosen.
- TypeScript, ESLint, formatting, diff check, and 20 focused tests pass. The full
  suite passed 648 tests in 114 files; three unrelated suites could not load
  because Vitest/Rolldown rejected React Native Flow syntax. The corrected
  Release built, installed, and launched on iPhone 17 Pro Simulator; the paired
  iPhone 16 Pro verified the navigation, Account/Settings headers, My Ledger
  Settlement entry, and Currency defaults. No Backend or schema change.

## Current performance guardrail status

- Phase 1A PASS: the deployed Dev Backend scanner reached its 300-second idle
  cadence without destabilizing Hosted Dev.
- My Ledger Reporting 2.0 PASS: the controlled Hosted Dev YEAR bootstrap used
  the lightweight path and Hosted Dev remained Healthy.
- Phase 1B / 1B.1 PASS: Simulator validation and the physical-device short
  smoke both passed. A disconnected cold start and exhaustive request-level
  proof of zero duplicate reads were not repeated; both remain non-blocking
  unverified items for this checkpoint.

## Performance Guardrails Phase 1B — Simulator and physical smoke PASS

- Ordinary background Ledger pulls classify only exact HTTP 409
  `SETTLEMENT_REVIEW_BLOCKED` as a stable unavailable Review. Other Review
  errors remain incomplete; explicit Review-page behavior is unchanged.
- The active read cadence uses executable queue work instead of all unresolved
  rows. FAILED and CONFLICT remain visible in UI counts. Future RETRYABLE and
  processing leases have a separate account-scoped operational wake timer;
  completed dependencies signal the worker. Foreground reads no longer start
  operational sync on every cycle. See ADR 0045.
- Controlled Simulator validation observed immediate, 8, 15, 30, 60 and 60
  second idle cycles without overlap or an independent Settlement poll.
  Stable blocked Review and three terminal FAILED rows did not prevent idle
  backoff. One Expense uploaded promptly, and Hosted Dev stayed Healthy.
- Final local closure proved that a wake during a pending focused 60-second
  timer starts a read immediately, cancels the old timer, and resumes adaptive
  cadence. Embedded Personal Payment create/edit now use the existing kick
  signal while preserving their upload-completion refresh. Relevant local
  tests, TypeScript, affected lint/format and diff check pass.
- A signed Dev Release was overlaid onto the iPhone 16 Pro without clearing
  local data. The remembered session and cached Ledger opened normally. One
  CNY 1.00 Personal Payment and one CNY 1.00 Expense each received one Backend
  201 response; the embedded payment display updated immediately. The selected
  Settlement remained readable, and the idle window showed no separate fixed
  8-second payment poll or 409 retry loop. Hosted Dev remained Healthy with
  low overall CPU and no active Disk IO Budget warning. The App was closed
  after the smoke. A true disconnected cold launch was not exercised; the new
  Expense awaits today's CNY→NZD reference rate.

## My Ledger Reporting 2.0 Slice A+B — local SQL validation passed

- The new account-authorized, single-snapshot summary path replaces N full
  Journey reports for `/v2/me/ledger`. Existing summary semantics are reused;
  optional personal Spending facts feed SQLite v37 by account and period.
  Full/pending local Expense data wins over narrow facts. See ADR 0047.
- Normal My Ledger entry no longer issues a preceding ALL request or bootstraps
  every newly discovered Journey. A YEAR response carries all eligible Journey
  metadata, including zero-activity rows, so discovery is retained. Settlement
  still needs its saved local projection and remains explicitly unavailable
  when that material is absent.
- The snapshot SQL migration and Backend are deployed to Hosted Dev. A
  controlled Simulator YEAR read used the lightweight_2_0 path for 53 eligible
  Journeys with two attributable Gateway requests and a 1.578-second Backend
  response. Hosted Dev remained Healthy.
- The pending My Ledger migration now includes a partial 409-conflict index on
  `ledger_idempotency_keys(journey_id)`. Local small-account EXPLAIN changed from
  a 5,501-row global history scan to one eligible-Journey conflict lookup.
  Alternatives were larger without a better access path. Local SQL-to-Backend
  golden checks pass for ALL/YEAR/30D at 50/300, 50/1,000 and 100/3,000;
  normal reads use one snapshot RPC plus one membership recheck. Revocation,
  shared cancellation and failure recovery were exercised locally. The local
  gate is PASS; Hosted Dev deployment still needs its separate controlled step.

## My Ledger bootstrap safety — local implementation

- A linked Journey enters `/v2/me/ledger` reporting only when a batched
  `ledger_settings` lookup finds its Ledger configuration. Reporting is capped
  at two Journey jobs per Backend process; a failed batch starts no later
  Journey. Identical in-flight account/period/bounds requests share one read.
  Structured logs expose counts and failure class without identifiers. The
  response shape and financial rules are unchanged. See ADR 0046.
- The process-global concurrency ceiling of two is a temporary Hosted Dev
  incident-safety guardrail. Re-evaluate per-request and global limits from
  capacity measurements before Production to avoid cross-user queueing.
- This safety fix is deployed to Dev. The Phase 1B Simulator incident remains
  on HOLD. The dedicated lightweight reporting path is implemented locally in
  Slice A+B above and has not been deployed.

## Performance Guardrails Phase 1B — local implementation

- Foreground Ledger and standalone Settlement Personal Payment pulls now share
  one adaptive scheduling rule: successful empty cycles wait 8/15/30/60 seconds;
  changes and local kicks restore 8 seconds; failures wait 15/30/60 seconds.
  Embedded Settlement no longer owns an independent 8-second payment poll.
  Partial pull failures, account/Journey switches, offline transitions, and
  stale results remain guarded. See ADR 0045.
- Phase 1B is local only. No Dev deployment, Simulator or iPhone launch, schema,
  backend, Phase 1A or Phase 1C change. Phase 1A remains deployed and healthy.

## Performance Guardrails Phase 1A — local implementation

- Dev Backend historical rate scanner now runs once at startup, then uses a
  single-flight timer: empty scans wait 30/60/120/300 seconds, useful work
  resets to 30 seconds, and failures wait 60/120/300 seconds. Known Expense,
  Personal Payment, and Journey currency writes can coalesce an early wakeup;
  a failure retry delay stays in force. Scanner logs count-only work, timing,
  failure class, and wakeup fields. See ADR 0044.
- No FX, valuation, Mobile sync, API, schema, or Hosted Dev change. Phase 1B/C
  remain unimplemented. Local tests and checks are recorded in the Phase 1A task.

## Settlement Summary re-entry polish

- Switching from Settlement to Spending and back now immediately reuses the
  account/Journey-scoped balance projection as saved data, while fresh source
  verification continues in the background. A reused `CURRENT` projection is
  not presented as current until a new matching Preview arrives; Review still
  receives its original coherent preview separately.
- The physical Release shows version #2 and `¥8,549,363.27` immediately after
  the switch, without `Preparing your balance`. Full Vitest (111 files / 589
  tests), TypeScript, ESLint, Prettier and signed physical build pass. The same
  Release also builds, installs and launches on iPhone 17 Pro Simulator. Its
  same-Journey cache still shows version #1 because Hosted Dev Supabase Auth
  currently times out on `/auth/v1/health` and token validation; Dev API
  unauthenticated requests return promptly, but authenticated refreshes time
  out. Simulator version #2 verification remains blocked by that external
  service condition; no local data was manually changed. No Backend,
  migration, Settlement semantics or Production change.

## Settlement confirmation latency polish — physical saved-state check passed

- Review now locks the confirm action synchronously on tap, shows a spinner and
  `Confirming settlement…`, retains the reason, and restores interaction plus the
  user-safe failure message if confirmation does not succeed.
- Only after a new finalized head is observed locally does the Journey-scoped
  projection cache invalidate the old confirmation diff. Summary reconstructs
  the latest local Adjustment balance from its frozen inputs, so a cold start
  can show saved version #2 immediately even while fresh Preview is pending.
  If the new head is not locally complete, it shows `Refreshing confirmed
Settlement…` instead of the old Changes card.
- No Settlement semantics, Backend contract, SQL migration, or confirmation
  precondition changed. Full Vitest (111 files / 588 tests), TypeScript, ESLint,
  Backend build, `git diff --check`, and signed physical Release build pass. On
  the installed physical Release, a cold-start Journey entry immediately showed
  saved Last confirmed version #2 (`¥8,549,363.27`) and no old Changes card,
  before fresh server calculation completed. No #3, Git commit, or Production
  access.

## Settlement update source-range repair — Hosted Dev version #2 confirmed

- ADR 0043 and migration `20260925000300` make Review Preview, Adjustment
  Preview, and Confirm use the same current canonical source cutoff. The Backend
  rechecks raw source JSONB under the lineage lock; preview-only rate-string
  normalization no longer causes a false stale-input rejection.
- On the signed physical Dev fixture, Review showed Bakery Changed, eight later
  Expenses Added, and zero blockers. Confirm with reason `V2` returned 201 and
  created immutable Settlement version #2 (`5260457f-8550-449c-8d7b-7e80fcc5447a`).
  Its stored digest exactly matches the reviewed current source; current Backend
  Preview reports zero changes and blockers. The user's device eventually removed
  the Changes list after returning to Summary, but the delayed/silent transition
  remains a UX issue outside this source-range repair.
- The latest confirmed balance for an Adjustment is reconstructed from that
  version's immutable inputs, so Backend Summary now reports version #2 and the
  same `¥8,549,363.27` current/confirmed balance. Physical visual verification
  of the updated Last confirmed card is still pending.
- Root version #1, Bakery's frozen revision-1 input/valuation, and all four
  existing payment rows retain their pre-confirm byte hashes. Validation passes
  110 Vitest files / 584 tests, TypeScript, ESLint, Backend build, local pgTAP
  24 files / 519 assertions, touched-file Prettier, and `git diff --check`.
  No Git commit or Production access.

## My Ledger simplified portfolio slice implemented — Simulator visual check complete

- UI polish places Spending / Settlements first, then display currency and the
  compact period selector. Categories show share percentages, monthly bars fit
  the page width, and every Settlement row names its balance direction. On
  Settlements, the second row says Settlement Currency / Per Journey instead of
  showing an inactive Spending currency picker.
- This Year / All Time, analytical Display Currency, Spending total/category/month,
  and Journey-currency Settlements render from local repositories before the
  existing reporting refresh runs in the background. Spending uses
  original allocated shares and cached ECB cross/direct rates; missing rates omit
  only those expenses. Settlement reuses the saved Settlement Summary projection.
- This Year includes Journeys whose date interval overlaps the year or which have
  an Expense with an economic date in the year. All Time includes all locally
  accessible Journeys. No schema, API, sync, or remote FX change.
- A Journey with only the authorized narrow local summary remains listed, but its
  balance is shown as unavailable and its missing Expense detail is excluded from
  the Spending total until the ordinary Journey cache is hydrated.
- Local analytics and projection tests, TypeScript, ESLint, the full Vitest suite,
  architecture guard, and touched-file Prettier pass. Full-tree Prettier still
  reports unrelated pre-existing and concurrent-work formatting differences.
- iPhone 17 Pro / iOS 26.5 Simulator visual check passed for the Spending layout,
  all 12 monthly columns without horizontal scrolling, and Settlement rows in
  NZD/EUR/JPY with explicit You owe / You are owed / All settled labels. The
  unsigned Simulator build needed a temporary preview-only cached account ID
  because SecureStore requires a Keychain entitlement; that source patch was
  removed after bundling. No physical-device check was performed for this slice.

## Revision-aware economic-date recovery — Hosted Dev and physical acceptance complete

- ADR 0042, date-only Backend command/inspection, Data Health finding/recovery,
  durable Mobile operation, date-confirmation screen and Settlement Review route
  are implemented. Hosted Dev has migrations `20260925000100` and the forward
  guard correction `20260925000200`; the matching Dev Backend bundle is healthy.
- Bakery's normal physical UI confirmation saved `2026-07-25` at revision 4,
  then the existing automatic scanner accepted revision 5 `REFERENCE_RATE`:
  ISK 75 → CNY 4.04 using ECB/Frankfurter `0.05388` on July 24. The first
  attempt exposed an ambiguous SQL variable in the initial guard; the
  forward-only correction and normal retry resolved it, without a manual rate.
  Physical Summary reached `CURRENT` and Review shows Bakery as Changed without
  a date/rate blocker. No Settlement update was confirmed.
- Settlement #1 remains `PARTIALLY_PAID`; its row, Bakery revision-1 input,
  frozen valuation and four payments retain their pre-action SHA-256 values.
  TypeScript, ESLint, Backend build, 110 Vitest files/583 tests, local 24-file
  pgTAP/515 assertions, Release Simulator and signed physical Release pass.
  No Git commit or Production access.

## Settlement Changes UX and projection reuse implemented — awaiting acceptance

- Summary now shows bounded ADDED/CHANGED/REMOVED counts and a coherent personal delta, without Expense ID fragments. Review receives the exact account/Journey-scoped Summary projection and known titles on navigation, then refreshes authoritatively in the background without clearing the displayed balance or diff.
- Review labels the large amount as Current balance, shows paid/share and the complete named change list from that projection, distinguishes removal from deletion, and gives rate-required Expenses an action. Previously confirmed Expenses open the existing protected correction flow; unconfirmed Expenses open normal detail. A saved local rate-required Expense may explain a removed row while fresh verification is unavailable, but never enables Confirm. An `OPEN_CONFLICT` blocker is explained but has no safe conflict-resolution route yet.
- Adjustment Preview remains only for head/digest/blocker and final confirmation preconditions. Its diff/head/blockers must match the canonical Preview before Confirm enables. Confirmation rechecks the current source and adjustment head/digest; a stale result refreshes in place, and a queued operation is not reported as a completed version.
- No schema, Backend, financial formula, or Production change. Focused tests, full Vitest (107 files / 568 tests), TypeScript, ESLint, and Backend build pass. Release Simulator build/install/launch and signed physical Release build/install/launch pass. On the physical Dev Journey, Summary and Review immediately show the same saved balance (`¥8,549,360.58`) and named changes (8 added, 1 removed, `+¥5.17`); Bakery's missing-rate row opens the existing confirmed-Expense correction form with Bakery selected, and Confirm stays disabled. Physical fresh `CURRENT` verification, successful Confirm, and stale-write rejection were not exercised on this blocked fixture. `OPEN_CONFLICT` still lacks a safe resolution destination.

## Coherent Settlement source convergence implemented — awaiting acceptance

- The existing Settlement Preview response now returns balances/inputs, actual source
  cutoff, `SETTLEMENT_SOURCE_V1` fingerprint, latest confirmed reference, and
  `ADDED | CHANGED | REMOVED` confirmation diff from one
  `ledger_settlement_source_7_1` generation. `REMOVED` means no longer eligible, not
  necessarily deleted. No endpoint or parallel calculation was added.
- Mobile publishes one atomic `SettlementSummaryProjection`. Balance, paid/share,
  confirmation diff and `Your change` cannot mix generations. A coherent offline value
  is explicitly `SAVED`/`LOCAL_PENDING`; confirmed balance is never presented as current.
  Review/attention refresh remains independent.
- A `CURRENT` projection is published only after the synchronized local canonical source
  matches the Backend fingerprint under the same policy. Mismatch invokes the existing
  scoped bootstrap regardless of cursor position. Fresh canonical reads re-materialize
  only fully equal failed UPDATE mirrors; differing or terminal protected intent remains
  untouched and excluded from authoritative Settlement.
- Hosted Dev, Simulator and physical device each produce 79 canonical inputs and fingerprint
  `c0eafc9077d07a73853636dd463188250e6e42fd4eee6caba16847a95935188c`.
  Both devices render CURRENT `¥8,549,360.58`, `Removed: 1 expense`, and
  `Your change: +¥5.17`. Simulator `Good` and physical `4p hysical offline` remain
  protected `FAILED`; `guard 915` remains healthy `SYNCED` revision 3.
- Validation passes 107 Vitest files / 563 tests, TypeScript, ESLint, Backend build,
  touched-file Prettier, `git diff --check`, Release Simulator build/install/launch, and
  signed physical Release build/install/launch. Full Prettier still reports only the six
  pre-existing unrelated files. Schema remains 36; no migration, new worker, queue, or
  Production access.

## Ledger no-context destination landing implemented — awaiting acceptance

- With no selected/current Journey, Ledger now renders local destinations instead of an
  empty state: compact My Ledger first, then non-empty Active, Upcoming and Past sections
  using the existing canonical Journey classifier, ordering, metadata and status tags.
- Header search exposes and focuses local Journey filtering. Journey rows open a scoped
  Spending route with the Ledger menu and do not write the app-wide selected Journey;
  the existing Choose Journey modal retains its explicit selection semantics.
- The landing search control toggles open/closed, Add Expense is absent without a Journey,
  and Currency uses the same current-Journey resolution instead of a stale historical ID.
- Debug Mode restores the system-status panel at the bottom of Ledger, and Settlement
  diagnostics remain gated by the same preference. The Spending Settlement card reads
  the current saved Settlement projection instead of the payment-adjusted outstanding
  balance. No repository, schema, sync, Backend or Journey lifecycle behavior changed.

## Data Health UX Polish and final stale-state cleanup implemented — awaiting acceptance

- The System Health screen now shows real coordinator phases for saved-data scanning,
  existing sync/repair work, shared-data refresh, and verification. Leaving and reopening
  the route attaches to the same in-process manual run; no second health run is started.
- Completion uses only current-run convergence counts already produced by the coordinator:
  recovered changes, refreshed Journeys, and applied local repairs. Duplicate findings are
  intentionally summarized qualitatively rather than counted as product objects.
- Actionable input, genuine conflicts, and a missing receipt original are the only current
  user-attention mappings. Retryable, dependency-blocked, protected-local, provider-waiting,
  and sparse work remain automatic; other non-actionable diagnostics remain protected.
- Debug Mode exposes a collapsed Technical Details section containing only safe rule,
  category, target ID, and digest fields. It is absent when Debug Mode is off.
- One final generic `RECONCILE_STALE_CONFLICT_V1` action closes only canonically equal
  Expense conflict metadata with fresh scope/revision/equality proof. Any user-owned
  difference or missing canonical evidence retains the genuine-conflict hard veto. The
  active financial-work predicate now excludes protected historical `FAILED` and stale
  conflict history while retaining pending, processing, retryable, dependency-blocked and
  auth-paused work. Schema remains 36; there is no new worker, queue, Backend endpoint or
  Conflict Resolution UI. Settlement confirmation-change reporting remains independent.
- Validation passes 105 Vitest files / 549 tests, TypeScript, ESLint, Backend build,
  touched-file Prettier, and `git diff --check`. Full Prettier still reports only six
  pre-existing unrelated files. Release Simulator and signed physical-device builds both
  installed and launched. The five Simulator historical conflict operations satisfy the
  generic equality proof and reconcile to zero on an isolated copy; the installed Release
  opens System Health normally. On the physical Dev fixture, automatic health reconciled
  both stale conflicts to two verified repair events and zero active financial work.
  `4p hysical offline` remains an unchanged protected historical `FAILED` CREATE, `guard
915` remains unchanged and healthy, `Bakery receipt ready 📎` remains a server-synced
  change since confirmation, and canonical Settlement rows remain byte-stable.

## OTR Data Health & Self-Healing — Phase E implemented

- Started from accepted Phase D checkpoint `8ffa5e7d58cc044fd817c06508c0c215f333e6d1`.
  Phase E adds only `RECOVER_HISTORICAL_STRANDED_CREATE_V1`; schema remains 36.
- Eligibility requires one attempted historical unknown Expense CREATE, an unambiguous
  failed UPDATE chain, valid preserved/current requests, intact identities and
  idempotency keys, authorized account/Journey scope, and no mapped, audit, deferred,
  conflict, isolation, competing-operation, or missing-evidence signal.
- The repair changes queue metadata only. Existing sync replays the original CREATE
  payload/key, atomically adds one dependency-linked compacted current UPDATE after
  identity mapping, and uses scoped canonical revalidation before completing the retained
  historical UPDATEs. Existing errors and the `VERIFIED` repair event remain diagnostic.
- The retained physical fixture recovered to one Hosted Dev Expense. `guard 915` remains
  ISK 23,333 with economic date 2026-09-16, its participant/original split and description
  intact; the server supplied its normal reference valuation. Exactly one CREATE key and
  one recovery UPDATE key completed, all seven local operations converged, repeated manual
  health was a no-op, and canonical Settlement rows/transfers/balances stayed byte-stable
  under primary-key ordering. Production was not accessed.
- Focused classifier/coordinator/repository/worker tests, full Vitest, TypeScript, ESLint,
  Backend build, Prettier, `git diff --check`, Release Simulator install/launch, and signed
  physical Release/manual Data Health verification pass. Stop for Phase E acceptance;
  do not commit or begin any later rollout without approval.

## OTR Data Health & Self-Healing — Phase D accepted

- Start from integrated canonical checkpoint `78e8b741955a87cfb542a4f36ba1150296e330f6`.
- The existing B → C0 → C1 → C2 coordinator now receives non-blocking cold-start,
  foreground, 15-minute active-use, connectivity-restored, auth-recovered, and scoped
  post-sync signals through one process-local coalescer. Manual Settings health uses the
  same coordinator and safety policy.
- Automatic checks first query indexed account-local suspicious state, then scan only
  hinted/suspicious or at most two active/recent Journeys. Cheap scans are persisted at a
  15-minute cadence; deep safety-net scans are limited to a 24-hour cadence. Healthy cold
  start performs no Backend call, pull, bootstrap, or all-Journey scan.
- Only due work enters existing C1 repair and existing sync/C2 convergence. A 60-second
  network cooldown absorbs reconnect flaps, sync-origin suppresses recursive completion,
  and account/generation validation invalidates stale work. AUTH-paused, protected,
  conflict, actionable, historical unknown `FAILED`, and sparse-not-due work retain their
  existing policy.
- Phase D adds no migration, executable repair action, queue, worker, Backend endpoint,
  background guarantee, cache reset, or domain mutation authority. Schema remains 36.
- Automated validation passes 103 Vitest files / 517 tests, TypeScript, ESLint, Backend
  build, touched-file Prettier, `git diff --check`, and Release Simulator build/install/
  launch. A signed physical Release completed manual health on the authenticated Dev
  fixture without a generic failure. With OTR-only cellular access disabled, a disposable
  Expense became `RETRYABLE/NETWORK`; after connectivity restoration and a cold launch
  outside Ledger, it automatically reached one Hosted Dev row and local `SYNCED` revision
  1/`COMPLETED`. A second cold launch stayed converged.
- Physical before/after SQLite comparison shows zero changes to the `guard 915` Expense
  and its six-operation causal chain, and zero changes to canonical Settlement root,
  transfer, or member-balance rows. The retained source snapshot hash remains unchanged.
- `guard 915` remains reserved for Phase E: it may be detected as protected but must not
  be replayed, mutated, or reported recovered. Production remains out of scope. Stop for
  Phase D acceptance; do not start Phase E.

## OTR Data Health & Self-Healing — Phase C2 implemented

- Start from accepted C1 checkpoint `79e3fa9aafbdd166fe99189982ab1360495a871e`.
- Manual System Health now rebuilds protected intent, applies only the three C1 queue
  repairs, requests the existing operational sync, refreshes affected Journeys plus at
  most the highest-priority active/recent Journey, and rescans before reporting recovery.
- Existing sync retains due-time, sparse retry, auth, conflict, idempotency, dependency,
  account, and Journey policy. Existing repository transactions protect pending/failed
  domain state, Review actions and attachment originals and drain deferred Expense changes.
- Personal Payment now recovers structured `INVALID_CURSOR` with its existing scoped
  list/change flow. Ledger keeps its existing scoped invalid-cursor bootstrap. No global
  cursor reset, SQLite wipe, Backend repair endpoint, worker, queue, or migration was added.
- Settings reports up-to-date, verified recovered changes, shared-data refresh, waiting,
  attention, or protected outcomes without queue/cursor/bootstrap terminology.
- `guard 915` remains a protected historical unknown `FAILED` CREATE with zero executable
  actions and is not replayed or reported recovered. Phase D scheduling and Phase E
  historical recovery remain gated.
- Validation passes 102 Vitest files / 497 tests, TypeScript, ESLint, Backend build,
  touched-file Prettier, `git diff --check`, and a Release iOS Simulator build. Failure
  injection covers a process stop after push/before pull, lost-response due-time replay,
  stale generation/auth aborts, transactional bootstrap/pull, and deferred-change drain.
- A temporary migration-36 copy of the retained `guard 915` snapshot still reports seven
  `PROTECTED_LOCAL` findings, zero executable actions, and no guard queue/domain changes;
  its source snapshot remains unchanged at migration 34. Hosted Dev and Production were
  not accessed. Stop for C2 acceptance; do not enter later Phase C work.

## OTR Data Health & Self-Healing — Phase C1 implemented

- Start from accepted C0 checkpoint `07efd9b2e0307c168fc296c28aa68006026e98a4`.
- C1 executes only the three existing versioned queue-metadata actions for expired
  leases, completed dependencies with proven server identity, and sparse long-lived retryable
  operations. The existing sync engine remains the only network/domain executor.
- Every action must use scan, scope/generation and evidence revalidation, one conditional
  SQLite repair plus atomic `APPLIED` event, and a rescan verifier before `VERIFIED`.
- Migration 36 already contains the repair-event model. C1 adds no migration 37,
  Backend endpoint, worker, queue, pull/bootstrap orchestration, scheduler, or broader UI.
- `PROTECTED_LOCAL`, historical unknown `FAILED`, conflict, isolation, missing evidence,
  auth pause, and user-action-required state remain hard vetoes. `guard 915` remains
  read-only and reserved for Phase E.
- `APPLIED` commits atomically with the conditional queue repair; restart rescans and
  promotes it to `VERIFIED`. The newest 200 `VERIFIED` events per account are retained;
  unresolved `APPLIED` and `NEEDS_ATTENTION` records are never removed by this retention.
- Validation passes TypeScript, ESLint, Backend build, Prettier, `git diff --check`, and
  101 Vitest files / 485 tests. Failure injection covers rollback before commit and
  restart between `APPLIED` and `VERIFIED`.
- A temporary migration-36 copy of the retained guard 915 device snapshot still reports
  seven `PROTECTED_LOCAL` findings, zero executable actions and zero repair events, with
  stable domain/queue fingerprints. The source snapshot remains unchanged at migration 34.
- Stop for acceptance after C1; do not enter later Phase C work.

## OTR Data Health & Self-Healing — Phase C0 implemented

- Phase C0 is limited to deterministic repair policy and dry-run planning over the
  existing Phase B findings and protected-intent manifest.
- Plans bind account, generation, optional Journey, finding digest, disposition,
  evidence requirement, versioned action ID, and verifier ID. Eligibility comes only
  from the shared policy layer; UI and callers do not infer it from categories.
- `PROTECTED_LOCAL` and historical unknown `FAILED` are hard repair vetoes. C0 performs
  no mutation, sync, pull, bootstrap, remote reconciliation, repair-event write,
  migration, Backend change, scheduler, or repair UI.
- All nine Phase B rules have centralized dispositions. The only dry-run `AUTO_SAFE`
  candidates are expired operation leases, completed same-account/same-Journey causal
  dependencies, and supported scheduled `RETRYABLE` operations with complete evidence.
- The copied migration-36 guard 915 device snapshot remains seven `PROTECTED_LOCAL`
  findings, zero executable actions, stable across repeated planning, with unchanged
  domain and queue fingerprints and zero repair events.
- Validation: TypeScript, ESLint, Backend build, Prettier, and 476 Vitest tests pass.
  No migration 37, Backend endpoint, UI change, Hosted Dev access, or Production access.
- Stop for Phase C0 acceptance. C1 repair execution remains gated.

## Global Menu, Settings and Currency integration

- The contextual Global Menu now contains Current User, My Ledger, Currency, Settings,
  Language, and Log out. My Ledger keeps `/expenses/all-journeys`; Review remains inside
  Ledger. Diagnostics and Dev account switching remain available underneath but are not
  ordinary menu entries.
- Settings contains only `System → System Health` and the development-gated Debug Mode.
  System Health opens the existing `/data-sync` Phase B read-only scanner; no Data Health
  route, coordinator, repair behavior, table, or migration was added.
- Currency owns Journey Currency preview/commit and local-first Exchange Rate Lookup. The
  lookup API is a narrow adapter over the existing Stage 5 resolver, cache, provider,
  seven-day fallback, reference-date and provenance model. It creates no valuation
  snapshot and changes no Expense, Settlement, or Personal Payment state.

## OTR Data Health & Self-Healing — Phase B accepted

- Phase A was accepted and checkpointed at
  `25d513793191b2e65a8c9a2cc2cf2d80adcde691`.
- SQLite migration 36 adds only per-account health run/throttle/aggregate state and the
  future-compatible repair-event schema. Phase B creates no repair events and implements
  no repair lifecycle or retention job.
- One static `DataHealthCoordinator` builds a transactionally consistent protected-intent
  manifest and reports deterministic safe findings across operations, Expenses, Personal
  Payments, receipts, cursors, deferred changes, FX projections/valuations, Review state,
  and account/Journey isolation. Account identity and generation changes invalidate a run.
- Settings now links `System → System Health` to the existing `/data-sync` screen. Normal
  UI says only healthy, waiting, or needs attention; safe rule IDs appear only with Debug
  Mode enabled.
- The scan writes only health state. It never runs sync/bootstrap/pull, changes queue or
  domain rows, repairs/reclassifies operations, resets cursors, deletes files/caches, or
  contacts Backend specifically for recovery. Scope-priority and throttle APIs exist for
  future scheduling, but Phase D timers/triggers are not wired.
- Focused in-memory SQLite coverage passes for healthy/deterministic scans, protected
  local and historical failed CREATE intent, dependencies, actionable/auth/conflict,
  missing originals, cursor/deferred/FX/Review evidence, isolation/account switch, zero
  domain/queue mutations, and unchanged canonical Settlement. TypeScript, ESLint, Backend
  build, touched-file formatting/diff checks, and 99 Vitest files / 465 tests pass. A Release Simulator
  build, data-preserving launch, and Data & Sync UI smoke pass; the existing Simulator database reached migration 36. No physical-device install was required for this local-only scanner.
- Read-only acceptance ran twice against a temporary copy of the retained Phase A device
  snapshot containing `guard 915`. The scanner reported its local-only Expense plus one
  FAILED CREATE and five FAILED UPDATEs as seven `PROTECTED_LOCAL` findings. Both report
  digests matched, the domain/queue fingerprint stayed identical, and no repair event was
  written. The source snapshot, Hosted Dev, FX state, and Production were not modified.
- Stop after Phase B acceptance. Phase C repair, Phase D scheduling, Phase E historical
  recovery, and all `guard 915` mutation remain gated.

## OTR Data Health & Self-Healing — Phase A accepted

- SQLite migration 35 adds structured safe failure diagnostics, attempt timestamps,
  request correlation, causal dependency metadata, and focused queue indexes. It does
  not add health tables or reclassify historical `FAILED` rows.
- Unknown/plain, response-invalid, transport, rate-limit, and server failures remain
  retryable with sparse long-lived backoff. Only allow-listed structured validation or
  permission codes are terminal; 401 pauses and 409 conflicts.
- Expense pre-create edits coalesce into an unattempted CREATE. An attempted CREATE keeps
  its original payload/idempotency key, then wakes one compacted current UPDATE. Other
  dependent mutations make no request or error attempt until CREATE completes.
- Entity status now follows operation classification, and converged Ledger reads drain
  deferred Expense server changes. Personal Payment uses the same explicit dependency
  wake-up without changing its financial contract. Canonical Settlement is unchanged.
- TypeScript, ESLint, Backend build, `git diff --check`, and 98 Vitest files / 458 tests
  pass. A Release iOS simulator build, data-preserving install, launch, and read-only
  migration check pass; the existing database reached migration 35 with the expected
  queue fields. Phase A has no Backend/Supabase contract change, so Hosted Dev was not
  mutated or deployed. Production was not accessed. `guard 915` was not changed,
  deleted, restored, or used as an automated fixture.
- Stop after Phase A review. Health tables/retention, scanner/UI, repair coordinator,
  scheduling, historical recovery, and `guard 915` remain Phases B–E.

## Personal Payment FX legacy backfill — Slice D accepted on Hosted Dev

- Migration `20260924000300` adds reviewed economic-date provenance and a
  service-only, manifest/revision/digest/target guarded bounded backfill RPC.
  New Mobile records persist `EXPLICIT`; approved legacy rows persist
  `LEGACY_DERIVED_UTC`. Unknown historical provenance is never inferred.
- Hosted Dev Batch 1 created 28 identity projections with zero demands. Batch 2
  created 11 cross-currency projections and six deduplicated demands through the
  existing scanner. Three historical projections confirmed; eight current-day
  projections correctly remain pending publication.
- Both immediate batch replays and the final 39-row replay created zero mutations.
  Payment revisions and canonical Settlement remained unchanged. Seven deleted
  rows and eleven already-current rows were untouched. Production was not accessed.
- Full details: `docs/ledger/PERSONAL_PAYMENT_FX_SLICE_D_ACCEPTANCE.md`.

## Personal Payment authoritative FX projections — Slice C accepted

- Hosted Dev migration `20260924000200` adds first-class Personal Payment
  `economic_date`, Backend-owned current FX projections, immutable projection audit
  events, and projection change-feed entries. Existing rows deterministically use the
  UTC date of `occurred_at`; current Mobile writes the user/payment date explicitly.
- Projection state and revision are independent from the user-owned Payment. The
  Backend ignores deprecated client `recordedEquivalent*` evidence, performs exact
  numeric conversion from trusted `ledger_rate_quotes`, and preserves old-target
  evidence when Journey currency changes. No canonical Settlement table participates.
- The existing rate-demand claim, attempt/negative cache, 45-second lease, ECB provider
  and single 30-second scanner now also resolve Personal Payment projections. Current-day
  weekends accept the prior ECB working day; no holiday library or second worker was
  added. Unsupported pairs remain durable `UNAVAILABLE` demands with bounded retry.
- Mobile SQLite migration 33 mirrors account-scoped projections and their tombstones.
  Bootstrap, Personal Payment mutation responses and incremental changes all converge
  into the mirror. Matching confirmed projections replace Slice B estimates without
  changing original Money or double counting; a focused foreground pull makes the
  transition visible without restarting the app.
- Hosted Dev Journey `eae06f56-8e4b-4b46-9335-c82fa3a441ed` passed 27 acceptance checks:
  explicit economic date, ignored client equivalent, same-currency identity, USD cached
  and asynchronous paths, zero-scale ISK, Sunday-to-Friday fallback, unsupported BHD,
  edit/reconfirmation without resolver Payment revision, old/new target preservation,
  bootstrap/change feed, and zero canonical Settlement rows. USD 20.00 confirmed as
  NZD 34.90; ISK 1,500 confirmed as NZD 21.68.
- TypeScript, ESLint, Backend build, `git diff --check`, 97 Vitest files / 440 tests,
  two clean local resets, and the complete 22-file pgTAP / 478-test suite pass. Hosted
  Dev is migration-current and healthy. Production was not accessed. Slice D backfill
  has not started; old records receive projections only when an approved current path
  requests them.

## Personal Payment offline FX cache — Slice A+B device gate complete

- Hosted Dev now exposes the authenticated 32-working-day pinned-ECB snapshot bundle;
  the physical iPhone cache contains 32 account-scoped snapshots from 2026-08-11 through
  2026-09-23, including USD and ISK. Production was not accessed.
- With only OTR Mobile network access disabled, USD 2.50 and zero-scale ISK 1,500 records
  immediately changed the current transfer progress from NZ$10.87 to NZ$15.26 and then
  NZ$37.05. The amber detail showed original Money, estimated NZD, reference date and
  previous-working-day status without a provider call.
- Offline cold restart reproduced NZ$37.05 from SQLite. A date before cache coverage kept
  the ISK record but excluded it from progress (`NO_MATCH`); restoring the date restored
  the estimate. A different Journey did not inherit the records.
- After reconnect, the USD and ISK creates each reached Hosted Dev revision 1 exactly once;
  resaving the restored ISK record reached revision 2. Progress stayed NZ$37.05 with the
  provisional dot, as expected before Slice C, and canonical Summary stayed +NZ$55.00.
- The Personal Payment sync boundary now coalesces edits into an unattempted pending CREATE;
  an attempted CREATE instead replays idempotently before its dependent UPDATE. Successful
  reconciliation clears superseded CREATE/UPDATE queue errors. Physical-device verification
  reached ISK revision 4 with one remote entity, every related operation COMPLETED, and the
  same clean state after a cold restart.
- A physical second-account switch could not be exercised because the device has no other
  remembered account. Repository/account isolation and the focused automated coverage
  pass. Slice C has not started; no Production deployment occurred.

## Settlement Summary noise reduction and three-state member review — implemented

- Summary hides unchanged confirmation, routine source, cached/offline, refresh failure,
  operation-result and raw-error copy unless Debug Mode is enabled. The entire
  no-changes module is omitted when there is no delta, and the confirmed-expense
  correction flow no longer repeats Settlement history.
- Estimated currency values no longer show `≈` or persistent warning copy. An amber
  amount indicator expands to the exact affected Expenses and explains whether today's
  rate is not published yet, a recent reference rate is in use, or automatic rate support
  is unavailable and manual action is needed.
- Summary now has an inline group review-status card. Members can set `Looks good` or
  `Still checking`, expand the full Journey-member list without navigating away, and see
  `Not reviewed` before first action. A materially changed statement projects an earlier
  `Looks good` response as `Still checking`.
- SQLite migration 31 and Hosted Dev migration `20260924000100` carry review state through
  the existing offline repository, durable queue, API and immutable checkpoint path.
  Hosted Dev migration and Backend deployment are complete; the scoped acceptance suite
  passed 40 assertions. Production was not accessed.
- TypeScript, ESLint, Backend build, `git diff --check`, 94 Vitest files / 417 tests, two
  clean local database resets, two complete 21-file pgTAP / 458-test runs, empty schema
  diff and baseline verification all pass. The approved schema is 103 tables / 1,435
  columns with checksum `61259583b6c0662d2663b6422b071eda7b16c9e0d0b5f4582eaab5fbef38b521`.
- A signed Release was installed over the existing physical iPhone 16 Pro app without
  clearing data. The latest retained Trip visually confirmed the reduced Summary, hidden
  no-change/debug copy, absent FX indicator for an exact valuation, inline member list,
  colored `Looks good -> Still checking -> Looks good` controls, persisted refresh state,
  and a correction screen without duplicate Settlement history.

## Automatic OTR API access-token recovery — implementation complete

- Root cause confirmed: authenticated transports created the shared API client with a
  one-time SecureStore access-token snapshot. Background/foreground bootstrap refreshed
  only an already-expired session, while a long-running foreground app kept sending the
  stale token and exposed the Backend 401 to normal save operations.
- Authenticated JSON requests now use one shared session token provider. A token within
  60 seconds of expiry refreshes before the request; the first 401 forces one refresh and
  replays the same serialized body and headers exactly once. A second 401 is returned and
  cannot loop. Existing operation IDs, entity UUIDs and idempotency keys are unchanged.
- Concurrent requests share one account-scoped in-flight refresh. A refresh may persist
  only while the same user and refresh token remain active, so an Account A refresh cannot
  overwrite or supply Account B. A request that sees an account switch pauses with the
  existing auth-required handling.
- Network, timeout and temporary refresh failures preserve the local session and remain
  retryable; an invalid/revoked refresh session returns the existing auth-required result.
  Offline local reads/writes and durable queues are unchanged. Supabase remains the sole
  token store; successful rotated tokens are persisted through the existing repository.
- All authenticated JSON Expense, Personal Payment, Review, Settlement/checkpoint,
  currency and receipt-metadata transports use the shared path. Receipt binary upload and
  download retain their existing upload lifecycle: they receive a fresh preflight token
  but are intentionally excluded from generic body replay.
- TypeScript, ESLint, `git diff --check`, and **94 Vitest files / 416 tests** pass. Focused
  coverage includes valid/expired/near-expiry tokens, one-shot 401 recovery, second-401
  stop, identical body/idempotency replay, transient and invalid refresh failures, ten-way
  refresh coalescing and account-switch isolation.
- An arm64 Release Simulator build succeeded, was locally signed, installed over the
  existing iPhone 17 Pro Simulator app without uninstalling it, and launched to Today. A
  temporary, explicitly enabled Dev-only one-shot 401 injection then verified the real UI
  flow `Save -> 401 -> refresh -> identical retry -> success` in one running process.
  `Auth refresh direct UI Save` converged to local `SYNCED` revision 1 with exactly one
  completed queue operation (attempt count 0); Hosted Dev contains exactly one matching
  Expense, server id `f68429d7-39e0-4166-87cc-497078686d88`, revision 1. The injection was
  removed before commit. Physical-device acceptance was not run. No Backend, schema,
  Settlement semantics, Production environment or login UX changed.

## Settlement Final-version physical follow-up

- A physical pending-write state exposed two UI projection gaps. Summary now keeps
  Current Paid, Share, and Balance together from the same local estimate; `≈` is
  separately explained as estimated valuation rather than being conflated with sync.
- When the server Adjustment preview cannot exist until local writes sync, Summary and
  Review Changes compare current local Expense leaves with the latest immutable inputs,
  so the signed delta has corresponding Added/Changed/Removed Expense rows.
- Paid and Shares explicitly say `Current calculation`, or `Current · matches last
confirmation` when the immutable head is also the current source. Historical values
  remain confined to Summary/Settlement history.
- Confirmed correction is now a three-step flow: search/select an Expense, enter the
  reason, then open the successor editor. The immutable source is never directly
  edited; another member may provide corrected facts, but Organizer remains the only
  authority that records the protected successor under the current contract.
- Correction successors now use contract-valid UUIDs instead of prefixed local IDs.
  The post-Final update screen also tolerates a local Current estimate without a cached
  personal statement, so `View changes` no longer crashes before sync.
- Summary, Paid and Shares now derive Current totals and category rows from the same
  exact local-estimate input set. A signed Simulator Release visually verified Current
  Paid `¥10,005,160.56`, Share `¥1,455,822.98`, Balance `¥8,549,337.58`, and the exact
  Added/Changed Expense list behind delta `-¥17.83`.
- TypeScript, ESLint, `git diff --check`, and **93 Vitest files / 405 tests** pass.
  Matching signed Releases were installed and launched over the existing Simulator and
  physical iPhone apps without clearing data. Physical visual confirmation remains
  manual because iPhone Mirroring requires the user's Mac login.
- The retained automated clean Trip remains `e6e0955d-7f3c-4919-8801-8e6b4e05ce9f`.
  Its 49 checks are complete and both retained test accounts are members; a separate
  human two-account walkthrough has not begun.

## Settlement Final-version revision — implementation and Simulator gate complete

- Summary is now ordered as Current balance, changes since last confirmation, and Last
  confirmed. The Organizer's prominent post-Final action is inside the changes module;
  Last confirmed has only compact correction/history links.
- Summary, Paid, Shares, and Payments share one comparison identity and one current or
  confirmed source family. Current values are never labelled Final. Paid is the formal
  Settlement tab name.
- The existing Adjustment path now handles newly added/changed post-Final inputs. The
  focused update screen lists exact changed Expenses, keeps blocker state visible,
  requires a reason, and creates another immutable lineage version. Protected Expense
  correction remains the separate successor route.
- Settlement history opens a selected immutable version and can compare it with the
  previous version. Payments uses only the selected current head instead of flattening
  transfers from multiple historical versions.
- Fresh Hosted Dev Journey `e6e0955d-7f3c-4919-8801-8e6b4e05ce9f` passed 49 assertions:
  V1 ROOT (+NZ$30/-NZ$30), V2 Adjustment after E4 (+NZ$45/-NZ$45), V3 correction
  successor (+NZ$55/-NZ$55), exact ordered lineage/digests, protected-edit rejection,
  human Review attribution, E5 exclusion, and Personal Payment non-interference.
  Production was not touched. Evidence is in
  `docs/ledger/SETTLEMENT_FINAL_VERSION_REVISION_ACCEPTANCE.md`.
- The clean-device run exposed and closed one root defect: post-correction Current
  preview/personal statements used the initial source and double-counted the protected
  source plus successor. Hosted Dev Backend now reuses the existing leaf-aware
  Adjustment source after any Final; cached local Current reporting also excludes
  correction sources recorded in immutable lineage.
- Signed Simulator Release bootstrapped the clean Journey and visibly converged to V3:
  Paid NZ$150, Share NZ$95, balance +NZ$55, no changes since confirmation, and Last
  confirmed version #3 with compact organizer links. Exact source matching prevents a
  stale preview digest from creating a false changes banner; immutable Adjustment inputs
  also supply the confirmed member totals when no duplicate balance rows are cached.
- The same signed Release was installed over Leon's physical iPhone 16 Pro without
  uninstalling or clearing data. iOS denied automatic launch because the phone was
  locked, so physical visual/offline interaction is the only remaining manual gate.
- TypeScript, ESLint, Backend build, `git diff --check`, and **92 Vitest files / 402
  tests** pass; Production was not accessed.

## Previous Slice A checkpoint (superseded)

- The reusable Stage 9 compatibility Journey exposed a real source-selection defect:
  the Final-labelled Summary can prefer a newer Current personal statement while
  Paid/Shares use an immutable Final head. Device cache/conflict age can therefore
  present different numbers without identifying their sources.
- Slice A now selects one lightweight comparison identity for Summary, Paid, Shares,
  and Payments: `comparisonId`, projection time, Current/confirmed digests, confirmed
  head, display mode, and Current freshness. The formal secondary tab key is now
  `Paid`; the existing top-level Ledger area remains `Spending`.
- A Current server statement, cached Current statement, or local pending financial
  projection can no longer populate a card labelled `FINAL BALANCE`. When Current
  differs from the confirmed head, all four tabs use the Current family; they return
  to the immutable confirmed inputs only after digest/content convergence.
- Organizer refresh now obtains the Current preview even after a Final exists.
  Regular-member fallback compares personal contribution identity and totals against
  the confirmed head. Pending financial operations explicitly produce
  `CURRENT_LOCAL_PENDING`; successful and failed statement refreshes produce
  `CURRENT_SERVER` and `CURRENT_CACHED`.
- Focused regressions cover confirmed `+NZ$2` versus Current `+NZ$9`, digest
  convergence, local-pending freshness, and cached timestamp persistence. TypeScript,
  ESLint, `git diff --check`, and **92 Vitest files / 399 tests** pass. No schema,
  Backend, Hosted Dev fixture, or Production state changed.
- The approved direction remains immutable versioned Final history. A post-Final included
  Expense must make an Organizer `Review & confirm changes` action visible;
  confirmation creates a new Adjustment/version under the existing root. Correcting a protected
  Expense continues to create a successor Expense plus a new immutable version.
- Summary, Paid, and Shares will share one explicit Current/confirmed/history mode.
  When Current differs from latest confirmed they show latest, last confirmed, signed
  delta, and a `Review changes` path instead of silently mixing projections.
- Summary is explicitly ordered as Current/latest first, changes since confirmation
  second, and last confirmed third. The Organizer's prominent
  `Review & confirm changes` action belongs to the changes module; the last-confirmed
  module has only a small `Correct a confirmed expense` link instead of the current
  large correction button.
- The module-by-module revisions, action matrix, implementation slices, and a clean
  two-role Hosted Dev Trip with exact V1/V2/V3 arithmetic and two-device acceptance
  are specified in
  `docs/ledger/SETTLEMENT_2_0_FINAL_VERSION_REVISION_AND_CLEAN_TRIP_PLAN.md`.
- Stop before Slice B. The next checkpoint is UI review of Slice A, followed by
  explicit authorization for the ordered Current / changes / last-confirmed modules
  and the post-Final `Review & confirm changes` action. Do not create the clean Hosted
  Dev Trip yet.

## Post-Phase-6 Settlement navigation correction — Simulator accepted; physical recheck pending

- Settlement `Summary | Spending | Shares | Payments` now uses four independent tab views. Selecting a tab replaces the visible module without changing the current vertical scroll position; the previous continuous page, section anchors and scroll-following active-state logic were removed.
- The Trip title remains fixed below the Ledger header. On Settlement, the four-tab strip sticks directly below the Trip title after `Spending | Settlement` scrolls away; returning to the top reveals the primary selector again. While that selector is off-screen, the Ledger header shows `Spending` or `Settlement` in small gray text.
- Embedded Settlement content now uses the Ledger page's single horizontal inset instead of adding a second inset. Spending and Shares use a title-row member dropdown, with `Me` first, instead of a horizontal chip list.
- The secondary tabs are equal-width icon-plus-label controls: `Summary | Paid | Shares | Payments`, where `Paid` is the existing payer view. Content no longer repeats the tab name; all four pages begin with a consistent green semantic lead (`FINAL/CURRENT BALANCE`, `PAID BY…`, `… SHARE`, or `RECOMMENDED TRANSFERS`) and place the applicable member/scope control on that row.
- All four semantic leads now share the same pale-green rounded Hero container. Paid/Shares keep the member selector, total and count inside it; Payments keeps Recommended Transfers, Mine/Everyone and its explanation inside it. Detail rows remain below.
- Settlement cache messages now track live connectivity. Reconnection retries the Settlement/detail loads and clears stale Offline copy; a failure while online says refresh is unavailable while saved data remains visible, so it cannot contradict the Ledger Network status.
- Finalized Settlement consistency: Summary, Paid and Shares now read the same current Final-version snapshot. Paid/Shares totals, counts, categories and expanded rows are rebuilt from immutable Final inputs; only a Journey without Final uses the Current reporting projection. This removes the previous Final Summary versus Current Paid/Shares mismatch after later Expense changes.
- Spending now places its yellow Needs attention card directly below the Settlement snapshot. Review adds a `Raised by a person` filter and names the raising member. Expense detail shows active human-flag status near the heading, removes per-split concern actions, and keeps one bottom action whose optional native note becomes the Review title.
- This is UI-only: no repository projection, financial calculation, SQLite schema, API, sync behavior or dependency changed. TypeScript, ESLint, `git diff --check`, and **92 Vitest files / 395 tests** pass. A fresh Release was installed over the existing iPhone 17 Pro Simulator without clearing data. The populated `Europe 2026 UI Polish` Journey visually proved Paid `¥10,003,932.41` equals Summary's Paid for group and Shares `¥1,454,577.00` equals Summary's Your share; Final counts also correctly changed from Current `46/104` to snapshot `13/67`. Review visibly showed the new five-item human filter and `Raised by Leo`; flagged Expense detail showed one bottom action, no split actions, and the optional-note prompt. The same signed Release, including the network-status consistency fix, was installed over Leon's iPhone 16 Pro and launched without clearing data; physical touch verification remains pending.

## Settlement 2.0 Phase 6 — complete; ready with non-blocking limitations

- Automated validation passes TypeScript, ESLint, Backend build, `git diff --check`, **92 Vitest files / 390 tests**, two clean local Supabase resets, and two complete **21-file pgTAP / 455-assertion** runs. The approved schema remains **103 tables / 1,434 columns** with checksum `c85f4cad34cbdc8ec5bc4c10872db3b4cb0eb73474cd226c66a2974b370fce79`; schema diff is empty. Expo Doctor remains at the documented **20/21** because 13 installed Expo SDK 57 packages are behind expected patch releases. Repository-wide Prettier still reports only the five documented pre-existing files.
- Hosted Dev is healthy and migration dry-run is current. The running Backend bundle SHA-256 `1ef956364baffcff7a5ba964ab8dab3a19bf79adae12bd4f4e093a556cff9e84` matches the local Release artifact; image ID is `sha256:e11d4b4a48e95ea00c3f74bf30b58b2f6f0faf43df93cfcb4f584f40126a2a77`. The Phase 1B, 1C, 2, 3A, 3B and 4 Hosted Dev suites passed **144 assertions** across authorization, offline/durable queue, FX/evidence, Review/checkpoint/delta, final protection and immutable correction history. Production was not accessed.
- Clean Release builds succeeded for the iPhone 17 Pro Simulator and the physical iPhone 16 Pro. Both were installed over the existing app without uninstalling or clearing data. Simulator SQLite remained at v30 with 549 Expenses and 14 Journeys; physical Release retained its login, both remembered accounts and populated My Ledger history. Cold starts did not force login. Simulator and physical device both rendered the existing `Europe 2026 UI Polish` Settlement with final balance, needs-attention Review entry, organizer correction action, large values and long member names.
- Physical offline acceptance passed. Account A cold-started offline, created CNY 3.00 and CNY 4.00 Personal Payments locally across restart and A→B→A switching, and recovered both after reconnect exactly once as `Synced`. Account B entered `AUTHENTICATED_OFFLINE`, had zero pending operations and exposed only its own Journey. Account A's final balance remained `¥8,549,355.41`; the CNY 4.00 transfer remained Paid `¥1,452,930.40` / Remaining `¥0.00`, proving Personal Payment did not change canonical Settlement.
- One expired development provisioning profile interrupted launch during the device run. A fresh Xcode-managed profile was generated and trusted, then installed over the app with the same data container and all local data intact. No product code changed. Phase 6 is **READY WITH NON-BLOCKING LIMITATIONS**; the remaining items are the existing embedded-Ledger navigation limitation, Expo patch warning and five pre-existing Prettier files. Production remains untouched and requires separate explicit authorization. See `docs/ledger/SETTLEMENT_2_0_PHASE_6_ACCEPTANCE.md`.

## Settlement 2.0 Phase 5 — complete in source; Simulator first-pass accepted

- Phase 5A adds one repository-backed Settlement section projection over the existing reporting, Expense, Personal Payment, Review and Settlement repositories. It groups Spending/Shares in one pass, keeps Personal Payment outside canonical balances/transfers, scopes Mine by actor, and exposes Everyone/member selection only to organizers. No schema, API, Backend, sync protocol or financial algorithm changed.
- Phase 5B replaces the production Settlement readiness list with one continuous **Summary | Spending | Shares | Payments** page. Summary shows current/final balance, paid/share explanation, review delta, attention/waiting, optional review coverage and existing review/final/correction actions. Spending/Shares provide organizer member chips and collapsed category rows with inline original amount, payer, participant/split context and Expense detail links. Payments separates recommended transfers, personal records and legacy confirmed-transfer history, reusing Transfer Detail and the Phase 2 record flow.
- The standalone Settlement route uses a sticky secondary strip with scroll-following active state. The normal embedded Ledger `Spending | Settlement` path supports tap-to-section and keeps the vertical page, but its strip is not sticky and active state follows taps rather than free scrolling because it is nested in the existing Ledger outer `ScrollView`; this is the documented robust first-pass limitation rather than a navigation-shell rewrite.
- Phase 5C local validation passes TypeScript, ESLint, `git diff --check`, Expo Doctor, and **92 Vitest files / 390 tests**. A normally signed Release built, installed over the booted iPhone 17 Pro Simulator without clearing data, and opened under `com.xoery.otrmobile`.
- Simulator acceptance on the cached eight-member `Europe 2026 UI Polish` Journey verified the exact final balance and paid/share explanation, four-section anchor navigation, large values/long names, organizer member switching, inline category expansion, selected-member recalculation, Mine/Everyone switching, flow-oriented transfers, Personal Payment entry, and separate legacy transfer history. The fixture had no Personal Payment records or current review delta, so those populated states remain covered by existing repository/domain tests rather than this visual run. Offline mode, regular-member UI, and a physical iPhone were not exercised in Phase 5; they remain Phase 6 release-gate work. Hosted Dev and Production were not changed.
- Canonical Settlement, Personal Payment, legacy Payment, Review/checkpoint, correction/version history and finalized Expense protection are unchanged. Phase 6 may begin only with a new explicit instruction.

## Settlement 2.0 Phase 4 — complete on Hosted Dev; Simulator smoke passed

- Phase 4A adds ADR 0029 and migration `20260923000400`. A finalized Expense is never changed: confirmation creates a new Expense identity plus immutable old→successor lineage, and the current source projection excludes predecessors so replacement, reversal/removal and repeated corrections cannot double count. The existing root/Adjustment snapshots remain the version history. Phase 0.5 protection still rejects ordinary update/delete/restore.
- Phase 4B adds Organizer-only stateless preview and atomic confirm routes under `/settlements/:rootId/corrections`. Confirmation revalidates the lineage head/source/digest and creates the successor plus Adjustment in one idempotent transaction. SQLite is **v30** and caches correction source/successor IDs on each version while retaining every old Settlement row.
- Phase 4C renames the Organizer action to `Make corrections`, shows the historical-preservation warning, reuses the Expense editor to create a successor, previews affected-member deltas before `Confirm updated amounts`, and exposes Settlement history to all members. Personal Payment, legacy Payment and checkpoint rows are not migrated or rewritten.
- Phase 3 was committed first as `f2ae418`. Phase commits are 4A `0f0cc2d`, 4B `75f4ed0`, and 4C `b89e5aa`; Hosted acceptance then added snapshot parity/order fixes `fbdd3e9`/`87f4ab7`, Review-observation preservation `affded1`, and replay-before-preview `eb52808`.
- Local validation passes TypeScript, ESLint, Backend build, touched-file Prettier, **91 Vitest files / 387 tests**, two clean Supabase resets, and the full **21-file pgTAP suite / 455 assertions**. The Phase 4A file now has 16 assertions including Human Finding resolution without observation rewrite. Schema baseline is **103 tables / 1,434 columns**, checksum `c85f4cad34cbdc8ec5bc4c10872db3b4cb0eb73474cd226c66a2974b370fce79`.
- Hosted Dev `tuqigdxrvrerfewsxqgm` has migrations `20260923000400` and `20260923000500`; post-deploy dry-run has zero pending migrations. `api-dev.xoery.art` is healthy, image ID is `sha256:e11d4b4a48e95ea00c3f74bf30b58b2f6f0faf43df93cfcb4f584f40126a2a77`, and its bundle SHA-256 `1ef956364baffcff7a5ba964ab8dab3a19bf79adae12bd4f4e093a556cff9e84` matches local.
- Hosted Journey `c2024fbe-c883-4b7e-b3d3-8baaed5e064a` passed 25 real two-account assertions: member denial, Organizer preview/confirm/replay, frozen predecessor plus successor, current-source replacement without double count, unchanged root digest, immutable correction link, explicit Human Finding resolution, and zero mutation of legacy Payment, Personal Payment, or review checkpoints.
- A normally signed Release built for and installed over the booted iPhone 17 Pro Simulator without clearing data. It launched under `com.xoery.otrmobile` and the Phase 4 deep link rendered `Make Corrections`. The disposable Hosted QA Journey was not in that Simulator's local cache, so data-backed correction/history interaction was not fabricated there; Hosted acceptance supplies that end-to-end evidence. No physical-device run was performed. Production was not accessed.

## Settlement 2.0 Phase 3 — complete on Hosted Dev and iOS Simulator

- Phase 3A human concerns reuse Review v2 with immutable reporter, typed source/revision and existing personal decisions. Phase 3B derives the exact personal statement from canonical Settlement, stores append-only fingerprinted checkpoints and computes deterministic per-Expense deltas without reading Personal Payment. ADRs 0027 and 0028 remain authoritative.
- Phase 3C adds the deliberate `Review my settlement` flow. It shows paid-for-group, personal share, current/final balance, material changes since the user's checkpoint, Review/Expense deep links, local-first `Looks good`, stale/pending states and informational organizer-only coverage. Member review is optional and never gates organizer finalization.
- SQLite schema version **29** keeps account/Journey-scoped statement, checkpoint, delta and coverage state. `CREATE_SETTLEMENT_REVIEW_CHECKPOINT` still uses the existing durable queue and coordinator; offline pending, restart recovery, idempotent reconnect and visible stale conflict are retained without a second worker.
- Hosted Dev `tuqigdxrvrerfewsxqgm` has migrations `20260923000100` through `20260923000300`; final dry-run is up to date. `api-dev.xoery.art` is healthy and its running bundle SHA-256 `4879379a33d2bca96bc3c419baf1d84c86968967b1e96c9ad0515fe3582db9da` matches local; image ID is `sha256:b92dd55a8162b93f62fbeb84d78cd438cd11ec3af3dbbad7ca46317fc5d96df0`.
- Final local validation passes TypeScript, ESLint, Backend build, touched-file Prettier, **90 Vitest files / 378 tests**, and two clean local resets with the full **20-file pgTAP suite / 439 assertions**. The approved schema manifest is **102 tables / 1,425 columns** with checksum `bb68c4f43e0ee22722aff0bab93aded288bb5a103c537c9c01525921e0d72c9d`. Repository-wide Prettier still reports only five pre-existing untouched files; Expo Doctor passes 20/21 with the existing Expo SDK patch-version warning.
- The final Hosted Dev Journey `6e2e6ef9-440a-4722-b0a8-4154790ba464` passed **34 assertions** for exact/replayed checkpoints, affected-member targeting, cosmetic no-delta, stale rejection, Personal Payment separation and organizer-only coverage. A signed Release build installed over the existing iPhone 17 Pro Simulator without clearing data. It visibly proved a UUID-backed Human Finding reached queue `COMPLETED` and remained in unified Review; Stage 7.1 proved the intentional entry, exact totals, organizer coverage, persisted checkpoint, net-zero `Updated since you reviewed` banner, one-Expense old/new change detail, and re-review clearing the delta. Offline pending/stale behavior is covered by the SQLite repository test; Simulator network was not disabled, and no physical-device run was performed. Production was not accessed.

## Settlement 2.0 Phase 3A — human Findings accepted on Hosted Dev

- Human-raised concerns now reuse Review v2 with `origin = HUMAN`, immutable reporter, typed target, exact source revision, optional note, existing personal decisions and existing user-scoped projection. Supported targets are Expense, exact Expense share, Personal Payment and Settlement. System reconciliation is restricted to `SYSTEM`; ACK/DISMISS never means the source was fixed, while a later source revision explicitly resolves the human Finding into history.
- Mobile SQLite schema version **27** writes the Finding locally first with a stable UUID and queues one owner-bound `RAISE_LEDGER_REVIEW_FINDING` operation through the existing Review worker. Pending raises survive authoritative projection refresh and remain account/Journey isolated. Expense detail, exact shares and Personal Payment rows expose the minimal “Something looks wrong” action; no second dispute system or worker was added.
- Hosted Dev `tuqigdxrvrerfewsxqgm` has migrations `20260923000100` and `20260923000200`; post-deploy dry-run has zero pending migrations. The matching Backend is healthy at `api-dev.xoery.art`; running bundle SHA-256 is `c3f32452683553325f4dc92dba57b51f3b0242c34d2e09d4dc2183c873b10ea9` and image ID is `sha256:bd670302238e34d14d1c79c86a7c39b502e5a4d076f5fedd595dabb9781cdb5e`.
- Validation passes TypeScript, ESLint, Backend build, **88 Vitest files / 375 tests**, `git diff --check`, and the full **19-file pgTAP suite / 426 assertions**. Local migrations were applied forward and tested; a destructive local reset was not run. Hosted Dev acceptance passed 19 checks across two accounts for visibility/IDOR, replay, cross-Journey rejection, personal ACK semantics, system-refresh preservation and source-revision resolution. QA Journey `dcdfd5c4-143d-4df4-9e5e-7e384e1a42c4` is retained because append-only settlement evidence correctly prevents destructive cleanup.
- Production was not accessed. Phase 3B must remain gated on this accepted 3A baseline; ADR 0027 is authoritative for the reuse decision.

## Settlement 2.0 Phase 2 — personal payment UX and evidence complete

- Phase 2A adds the user-owned Personal Payment workflow to finalized Transfer Detail. Payer and receiver records remain independent; each owner can create, edit, and delete only their own `PAID` / `RECEIVED` assertions. Positive arbitrary amounts support partial, multiple, advance, and overpayment records without changing canonical transfer discharge.
- The form reuses existing Money, Currency, date, note, SQLite repository, and durable sync patterns. It saves locally first and presents pending/conflict/failure states in user language. Reference FX selection uses the requested economic date, then the latest prior quote within seven days, then older historical context, and never a future quote. No quote blocks reference-rate save; an optional user-recorded settlement equivalent remains available and is stored unchanged with its actual reference date.
- Phase 2B reuses the existing private `ledger-receipts` asset/upload queue instead of adding a second upload system. SQLite schema version **26** links multiple receipt assets to a Personal Payment; Backend routes list/link/unlink authorized evidence and protect raw content. Owner/current-member writes, owner/counterparty/current-organizer reads, historical counterparty grants, soft unlink, private-object access, and payment-before-evidence reconnect ordering are covered. ADR 0026 records this reuse decision; no OCR was added.
- Local validation passes TypeScript, ESLint, Backend build, **88 Vitest files / 374 tests**, `git diff --check`, and the focused Phase 1A pgTAP plan now contains 74 assertions. Docker was unavailable for a fresh local pgTAP run. Repository-wide Prettier still reports only the five previously known untouched files. Expo Doctor passes 20/21 checks; its sole warning is the existing Expo SDK patch-version mismatch across 13 installed Expo packages.
- Hosted Dev Backend only was deployed from implementation commit `f817803c0bab99a159d70019b427c8229903dcf1`; image digest `sha256:9f83188a93e71e1bcc7206c998cafaf94f442e11fd45db34d44f61729f549643`, public health `ok`, and uploaded source hashes match local. The prior Phase 1C 14-check suite passed again. A separate Phase 2 run on Journey `1116444f-4371-43b5-b07f-de0cdecc9abe` passed 18 checks for JPY no-FX save with manual NZD equivalent, two attachments, owner/counterparty/organizer and removed-counterparty reads, private storage, soft unlink, and canonical/legacy isolation. Production was not accessed.
- A signed Release build succeeded and installed over the existing iPhone 17 Pro Simulator data. On the existing finalized Stage 7.1 Journey, Transfer Detail showed the receiver-side `Record amount received` action plus separate own/other/legacy sections. A real CNY record saved with no local FX, retained its manual NZD equivalent, edited from ¥12.34 to ¥20.00, and converged through create/update queue operations to `SYNCED` revision 2; the canonical NZ$50 transfer remained unchanged. The private-file picker opened, but Simulator Files was empty, so actual evidence upload/read acceptance is supplied by the two-file Hosted Dev run rather than a fabricated device file. No physical-device run was attempted for this phase; that is not a Phase 2 blocker.
- Implementation commit: `f817803c0bab99a159d70019b427c8229903dcf1` (`Add Settlement 2.0 personal payment UX and evidence`). Phase 3 Review/correction/version workflow is not started and requires a new explicit instruction.

## Settlement 2.0 Phase 1C — Mobile SQLite, durable sync and pull complete

- Mobile SQLite schema version **25** adds account-projected `ledger_personal_payment_records` plus a separate user/Journey cursor. The projection key is `(projection_user_id, id)`, so owner, counterparty and organizer visibility can coexist without account leakage; owner identity remains canonical data. No attachment-local table was added because Phase 1C has no upload/link lifecycle.
- The focused repository derives owner user/member from the active account and `ledger_actor_context`, validates the cached counterparty, writes local state and enqueues `CREATE_PERSONAL_PAYMENT` / `UPDATE_PERSONAL_PAYMENT` / `DELETE_PERSONAL_PAYMENT` atomically, and preserves pending/conflict/failed rows against pull overwrite. Create/update/delete, restart, soft tombstone, authoritative projection cleanup and authorization revocation retain repairable user-owned history.
- The dedicated worker uses the Phase 1B routes, UUID record/operation/idempotency identities, canonical base revisions and deterministic replay reconciliation. Network/server failures retry, 401 pauses auth, stale/idempotency/identity conflicts remain conflict, and permission/invalid/not-found failures become terminal without pretending success. The active-user queue and entity/Journey filters prevent another account, another Journey, canonical Transfer Payment or legacy Payment operations from being sent.
- Generic Ledger bootstrap/change application now consumes `PERSONAL_SETTLEMENT_PAYMENT`; a dedicated historical-safe list/change coordinator owns its cursor and is invoked by normal Journey refresh. A removed member can refresh Personal Payment history even when shared Ledger bootstrap returns `TRIP_READ_FORBIDDEN`; a Personal Payment network failure does not block still-authorized shared Ledger refresh.
- Local validation passes TypeScript, ESLint, **87 Vitest files / 371 tests**, and `git diff --check`. All touched files pass Prettier. The repository-wide Prettier check still reports only the five previously documented untouched files (`AGENTS.md`, three approved Ledger docs, and `src/hooks/useStage4BPhysicalSmoke.ts`). Existing Settlement calculation/regression tests remain green.
- Hosted Dev run `19deabde-ee3d-463b-95f0-b7602c89d4e5` passed 14 real local-SQLite → durable queue → worker → API assertions: offline-like create/update/delete, independent NZ$300 `PAID` and NZ$295 `RECEIVED`, counterparty/history projection, incremental tombstone pull, and membership-loss local/queue failure preservation. Canonical Settlement tables were unchanged. The existing Phase 1B Hosted suite also exited successfully, retaining its 34 replay/conflict/history checks. Production was not accessed.
- Implementation commit: `19e853d` (`Add Settlement 2.0 Phase 1C mobile sync`). No UI, FX workflow, attachment upload/linking, Review, correction/version workflow, physical-device acceptance, API redesign or Supabase migration was added. Stop here; any Phase 2 work requires a new explicit instruction.

## Settlement 2.0 Phase 1B — Backend contracts, routes and change feed complete

- Shared Zod transport contracts now define user-owned Personal Payment records and strict create/update/delete inputs. The client supplies a stable record UUID plus a UUID `Idempotency-Key`, counterparty, `PAID` / `RECEIVED`, Money, occurrence time and optional note/equivalent/reference metadata; owner identity and server revision are response-only. Recorded equivalent values are passed unchanged and reference FX remains informational—no quote worker call is part of Personal Payment mutation.
- Authenticated Journey-scoped routes are live on the Dev Backend at `POST/GET /v2/trips/:tripId/ledger/personal-payments`, `GET/PATCH/DELETE .../:id`, and `GET .../changes`. Reads call the Phase 1A historical-grant RPC without a current-membership precheck; writes call only the Phase 1A owner/current-member mutation RPC. Counterparty changes are allowed and append the new grant without revoking prior historical grants. Soft deletion returns the canonical tombstone. Stable Backend errors cover malformed input, forbidden owner/write access, invalid counterparty/self-counterparty, not found, revision conflict and idempotency conflict.
- Current-member Ledger bootstrap and generic incremental pull now serialize authorized `PERSONAL_SETTLEMENT_PAYMENT` aggregates; inaccessible personal rows and attachment-link changes are filtered. The dedicated Personal Payment change endpoint preserves historical-grant reads for removed members with an actor/Journey-scoped cursor. Attachment upload/linking remains intentionally absent until Phase 2B.
- Local validation: TypeScript, ESLint, Backend build, 85 Vitest files/358 tests and the focused Phase 1A pgTAP file/72 assertions pass. Focused Phase 1B contract/route/gateway coverage is 62 tests. Touched files pass Prettier; the repository-wide check still reports only five pre-existing untouched files (`AGENTS.md`, three approved Ledger docs, and `src/hooks/useStage4BPhysicalSmoke.ts`).
- Implementation commit `58e541c` was deployed only to the existing Hosted Dev Backend; image `sha256:4c87873a57bb075140bf2b0fa1d8bfa9ff4759f51ad07296e5ec31b2bdae02f9` is healthy. An isolated Dev Journey/API run passed 34 checks covering owner/counterparty/organizer/IDOR, independent NZ$300 `PAID` and NZ$295 `RECEIVED`, exact equivalent/reference persistence, no-FX creation, replay/conflict/tombstone, removed-member historical read and later-record isolation, bootstrap and both change feeds. Canonical Settlement, recommended-transfer state, legacy `settlement_payments` and `settlement_payment_discharges` remained unchanged. Production is untouched.
- Phase 1C Mobile SQLite/repository/durable sync/bootstrap application is complete at the checkpoint above. Do not continue into UI, FX UI, attachments, Review, correction/version workflow or Phase 2 automatically.

## Settlement 2.0 Phase 1A — personal Payment Supabase foundation complete

- Migration `20260922000100_settlement_2_phase_1a_personal_payments.sql` is applied to local Supabase and Hosted Dev `tuqigdxrvrerfewsxqgm`; Production is untouched. It adds user-owned `PAID` / `RECEIVED` records, durable owner/counterparty historical read grants, append-only revision audit, soft-delete tombstones/change feed, and the attachment link schema over existing private receipt assets. It does not add Backend routes, Mobile SQLite/sync, upload flow, UI, Review, correction workflow, or legacy conversion.
- Forced RLS and revoked `anon` / `authenticated` table access keep business data behind service-role RPCs. The mutation RPC derives owner identity from the current linked actor, validates Journey/member/counterparty and optimistic revision, and is idempotent. Owner, named counterparty, and current organizer reads are explicit; ordinary membership removal preserves only previously granted record/attachment history while revoking new writes/uploads and later unrelated visibility.
- Local reset from all migrations passed. The focused Phase 1A pgTAP passed 72 assertions; the complete 18-file database suite passed 397 assertions, including Settlement, legacy Payment/Adjustment, Review, RLS, Journey Currency and Phase 0.5 finalized Expense protection. Schema diff is empty and the generated 101-table manifest passes baseline verification.
- Hosted Dev rollback-safe validation passed 26 assertions for schema/index/RLS/RPC, independent differing records, owner/counterparty/organizer/IDOR boundaries, replay, tombstone, historical-member access, later-record isolation, canonical/legacy zero-change and the final Expense guard. Post-deploy migration dry-run reports zero pending migrations. This remains the database foundation for the completed Phase 1B above.

## Settlement 2.0 Phase 0.5 — final Expense protection verified on Hosted Dev

- Migration `20260918000700_ledger_finalized_expense_mutation_guard.sql` is applied only to Hosted Dev `tuqigdxrvrerfewsxqgm`. A `BEFORE UPDATE OR DELETE` trigger on `public.expenses` now rejects mutation of Expenses in finalized settlement inputs with `FINALIZED_SETTLEMENT_PROTECTED`; completed idempotent replays return without mutating the row. Remote schema inspection confirmed the function and trigger. A rollback-safe Hosted Dev Expense mutation pgTAP run passed 20 assertions, including finalized rejections and non-finalized update.
- Local migration reset and 5 relevant Ledger pgTAP files/99 assertions passed, including valuation finalized protection, owner correction, splits/participants, audit/revision and replay. The Phase 0 final-protection blocker is cleared. Phase 0's Payment Option B remains a recommendation awaiting product/security decisions; Settlement 2.0 Payment, Review, UI and correction/version workflow remain unimplemented. Production is untouched. See `docs/ledger/SETTLEMENT_2_0_PHASE_0_DECISIONS.md` for the dated remediation record.

## Ledger local SQLite rollback presentation fix — local validation

- Recurrent raw `finalizeAsync` / `abort due to ROLLBACK` text on the Spending screen traced to concurrent async use of the shared SQLite connection: background Journey/My Ledger writes use non-exclusive Expo transactions while Ledger reads several projections in parallel. A read-only Simulator integrity/foreign-key check was `ok`, and reloading Group cleared the message without data loss.
- Post-migration shared-connection write transactions are now serialized, including after a failed transaction; Ledger retries one aborted read and otherwise keeps saved data with a plain, nontechnical refresh message. No schema, financial rule, Backend or Production change. TypeScript, ESLint and 84 Vitest files/337 tests pass. Signed Release installed without clearing data on iPhone 17 Pro and Pro Max Simulators and Leon’s iPhone 16 Pro; the physical app launched. The Pro reproduced Journey reloaded and Mine/Group toggled during sync without a raw exception; Pro Max showed its saved Ledger. Physical touch verification remains pending because Device Hub cannot screen-share iOS 26.6.

## Same-day FX publication pending — Hosted Dev rollout

- A synced, same-day cross-currency Expense with a recent cached quote shows an approximate Journey value marked “Estimated,” not “Updating…”. Without an estimate it waits for the day’s reference rate; genuinely unsynced processing retains “Updating…”. The prior-day quote remains display-only and can never become the canonical economic-date valuation.
- Hosted Dev forward migration `20260918000600` adds a service-role-only, Journey-scoped explicit retry for `NOT_YET_AVAILABLE` demands. The ordinary scanner retains its one-hour negative cache; Settlement preflight, Check again and Finalize can make one bounded immediate retry. Preflight distinguishes publication pending from terminal unavailability. Estimated Settlement Preview remains informational; Finalize continues to require authoritative values and shows publication-dependent blocking copy.
- Local validation: TypeScript, ESLint, Backend build, 83 Vitest files/335 tests, local migration-up and 17 pgTAP files/318 assertions pass. Migration `20260918000600` is applied only to Hosted Dev `tuqigdxrvrerfewsxqgm`; post-deploy migration dry-run reports zero pending and Dev Backend health is `ok`. Matching signed Release builds were installed on iPhone 17 Pro and Pro Max Simulators and Leon’s iPhone 16 Pro without clearing data. Both Simulators launched; the physical app was installed and launched, but touch verification remains pending because Device Hub cannot screen-share iOS 26.6. Production and Phase F are untouched.

## Expense Rate Details history presentation — local validation

- Expanded Rate Details now leads with the active per-Expense method and its own settlement Money; valuation history is a separate, collapsed user action without device-cache wording. Historical rows render the snapshot's original and settlement currencies/amounts, method, time, and available context. A prior CNY→CNY row on the reported NZD Expense was a genuine earlier `SAME_CURRENCY` canonical revision from before the original-currency correction, not a UI-invented NZD pair. Four ¥12.35 rows have distinct canonical IDs/revisions and are retained; only repeated local projections of one canonical snapshot are coalesced for display. Typecheck, lint, 83 Vitest files/334 tests and iPhone 17 Pro Max Simulator Release build pass. The installed UI showed current Reference rate/¥46.38/NZD→CNY first, history collapsed by default, then four distinct earlier CNY→CNY values with original-currency context and different times after expansion. A matching signed physical Release was built, installed over the existing OTR on Leon’s iPhone 16 Pro (iOS 26.6) without clearing data, and launched; physical Rate Details touch interaction remains pending due to Device Hub/iOS 26.6. No financial records, valuation rules, Backend, migration, Hosted Dev or Production changed.

## Cross-currency new-Expense reference default — Hosted Dev and Simulator PASS

- New cross-currency Expenses already persisted `RATE_REQUIRED` without a manual valuation. Two existing CNY Journeys retain legacy `valuation_policy=MANUAL_AGREED`; Detail and the Phase C/foreground selectors wrongly treated this Journey metadata as the method/eligibility of every new Expense. ADR 0025 and forward migration `20260918000500` remove that inheritance while retaining per-Expense accepted manual/actual evidence, Phase D semantic blocks, settings revision and finalized protections. Detail, local estimated Settlement and Backend terminal classification now follow per-Expense evidence/reference eligibility. Only an explicit manual action can create `MANUAL_AGREED`.
- Hosted Dev `tuqigdxrvrerfewsxqgm` has exactly that new migration applied and zero pending; matching Backend source/bundle deployed only to Dev, public health `ok`. Typecheck, lint, Backend build, 83 Vitest files/332 tests, two local migration rebuilds and 17 pgTAP files/314 tests pass. The aggregate `supabase:validate` script still fails its unrelated checked-in schema-manifest comparison (92 recorded tables vs 97 actual); no historical QA evidence was modified to mask this.
- Signed Release installed without clearing data on iPhone 17 Pro and Pro Max Simulators. On the Pro Max, an ordinary new NZD Expense in a legacy-manual CNY Journey first showed an estimated Reference rate, then synced and auto-accepted ECB 2026-09-16 rate 3.8649 at ¥3.86 (revision 3). Explicit manual override showed ¥3.50 and a reason (revision 4); restoring Reference rate returned to ¥3.86 (revision 5, `SYNCED`, one active valuation), with prior evidence retained. The older NZD250.40 Expense's manual acceptance predates this deployment and is not a new-default regression. Physical iPhone interaction for this correction remains pending; Phase F and Production were not touched.

## Post-Phase-E Currency / FX UX convergence — PASS WITH DEVICE ACCEPTANCE PENDING

- Display-only exact/recent trusted B2 quote estimates use exact Money conversion and a 30-calendar-day window; detail, recent list and Mine/Group display totals mark estimated components `≈`. Canonical reporting, Review, Stage 5 evidence and Stage 7 final inputs stay untouched. The normal Expense date Save confirmation, compact policy/actions and edit-navigation fixes are incorporated from the prior uncommitted UX pass; none is Phase F.
- Settlement now has a local informational position/transfer preview from accepted values plus eligible cached estimates. It cannot be finalized. Opening Settlement invokes bounded Journey-scoped B2/Phase C preflight through the existing shared lease, refreshes the local cache and automatically requests a new authoritative server preview when possible. Finalize repeats preflight and obtains a fresh digest; changed inputs force review, and server finalization remains authoritative. Two service-role-only forward migrations `20260918000300` and `20260918000400` are applied **only to Hosted Dev** `tuqigdxrvrerfewsxqgm`; 004 limits foreground priority to INCLUDED Expenses without changing the global scanner. After explicit user authorization, the latest two Backend source files were uploaded only to Hosted Dev and its Backend service rebuilt; local/remote source hashes and running bundle SHA-256 `1dc33cb1fe3a53cbbde926ba5a0c85edd7df2d491a93fdbb05f13ff8efc0d2f6` match, service health is `ok`, and a new migration dry-run reports zero pending. No Production access.
- Latest source checks: typecheck, ESLint, Backend build, 83 Vitest files/331 tests and signed Simulator Release build pass; local append-only migration-up and 17 pgTAP files/312 tests passed. The latest signed Release was installed over both iOS 26.5 Simulators without clearing saved data and visibly launches on both; on iPhone 17 Pro the blocked Stage 7.1 Settlement shows the new `Check again` action after the server preview, so repairs can be retried without leaving the screen. A narrow safety correction prevents display estimates from substituting today's date when `economic_date` is unconfirmed; another correction uses exact integer accumulation and rejects unsafe aggregate estimated balances. Both have focused tests. On the iPhone 17 Pro, CNY Journey showed three approximate list/total values (NZD/ISK/Bakery), no value for stale NOK; the ISK detail previously showed `≈ ¥67.64`. Phase E actual payer cost remains €1.25, with prior ECB/manual history and actions in Rate Details. A Dev QA 1,000 ISK Expense (2026-09-16) was saved by normal UI, then opening Settlement advanced it through foreground resolution to accepted `REFERENCE_RATE` €7.15 and authoritative `Ready to settle`; no finalization was performed. The Stage 7.1 blocker Journey links directly to its Expense and shows only the ordinary proposed Expense date; cancelling Edit left `economic_date` NULL. Synthetic Baseline Journey shows a local multi-member transfer preview and three actionable proposed-date blockers.
- A new clearly named 1,000 ISK / two-participant Synthetic Journey QA Expense was saved in the signed Simulator on 2026-09-18. It synced as `RATE_REQUIRED`, but the trusted provider returned `NOT_YET_AVAILABLE` for that day's ISK→NZD ECB quote; the only Journey-local cached ISK quote is from July and correctly fails the 30-day estimate window. It therefore remains `—` rather than showing a fabricated estimate; no final settlement was created. After repeated app installation/restart the earlier 2026-09-16 preflight QA Expense is still `ACCEPTED` with exactly one active valuation and one valuation row; the new 2026-09-18 QA Expense also persists. Local pgTAP was rerun: 17 files/312 tests pass. Repo-wide Prettier check flags pre-existing `AGENTS.md` and `useStage4BPhysicalSmoke.ts`; the sole touched flagged file was formatted.
- **PASS WITH DEVICE ACCEPTANCE PENDING:** implementation, automated checks, Hosted Dev and the executed Simulator scenarios pass; see the exact matrix in `docs/ledger/CURRENCY_FX_UX_AND_SETTLEMENT_ESTIMATES.md`. An unresolved cached estimate in an unfinalized multi-member Journey and full multi-Expense foreground convergence remain unverified because Device Hub's date wheel could not select the cache-supported historical day; the new QA Expense's same-day ECB quote was not yet available. True offline cold start and offline/reconnect preview remain unverified because the Simulator exposed no reliable Wi-Fi/airplane control and its Control Center gesture failed; no network setting was changed. A genuinely absent proposed date remains unverified through device UI (repository/unit coverage exists). Physical iOS 26.6 interaction remains constrained by Device Hub. These are acceptance-tooling gaps, not observed product failures. Phase E retains its separate `PASS WITH DEVICE ACCEPTANCE PENDING` classification. No Phase F.

## Currency / FX UX simplification — before Phase F

- Mobile-only presentation/input pass: the default cross-currency detail shows original Money and a compact Journey value; normal reference acquisition is inline “Updating…” rather than a yellow warning. Rate provenance, prior valuations, manual agreement and actual payer cost remain in collapsed Rate details. Missing confirmed date stays an action and opens the date control; finalized inputs show a read-only explanation without edit/date/settlement controls. Same-currency detail omits the duplicate value card.
- Expense amount entry accepts only the selected currency's decimal precision while typing (ISK whole, NZD two, KWD three). Currency correction keeps the numeric amount, normalizes it only when exactly representable, and otherwise keeps it visible with a short field error and disabled Save; exact split drafts follow the same safe normalization. One subtle local-save indicator replaces duplicated queue wording and is removed when repository state becomes synced. The normal Expense list no longer marks automatic FX acquisition as a warning; settlement blockers remain explicit.
- No financial formula, stored Money/economic date, evidence, sync queue, API, migration, Hosted Dev or Production change. Typecheck, ESLint and 80 Mobile files/317 tests pass. Signed iPhone 17 Pro Simulator checked accepted reference and expanded ECB history, same-currency, missing-date direct action, NZD/ISK/KWD input, non-representable correction and finalized read-only; no QA Expense edits were saved. Provider-exhaustion severity and true offline-saved interaction remain unverified because those states were not available from the existing simulator fixtures. Phase F has not started.
- Date interaction follow-up: an existing valid displayed legacy date is proposed in the ordinary Expense date field, without a separate confirmation row or yellow detail warning. Opening/canceling never writes; Save explicitly persists that day as `economic_date` through the audited Expense update, or stores the newly chosen day. An Expense without a usable date still shows Add date and cannot be saved until one is selected. The pending Journey value remains subtle until Save permits normal FX processing. No backend/date backfill or automatic FX rule changed. Typecheck, lint, 80 files/319 tests pass; signed iPhone 17 Pro Simulator showed the single date field and pending detail after cancel. A real Dev Save/automatic rate transition was not performed in this follow-up.
- Expense edit navigation follow-up: saving an existing Expense pops its editor back to the existing detail instead of replacing the editor with another detail; the detail reloads on focus. Repeated edit/save cycles therefore do not stack detail routes, so one Back returns to the originating Ledger screen. New Expense creation still replaces its editor with the first detail. Typecheck, lint and 80 files/319 tests pass; save-route device interaction remains unverified.

## Currency / FX Phase E — Simulator/Hosted Dev accepted; device checks pending

- Normal signed Simulator UI committed `MANUAL_AGREED` (€1,001.00), restored the eligible ECB `REFERENCE_RATE` (€0.01), then committed `ACTUAL_PAYER_COST` (€1.25) on one disposable 1 ISK Dev Expense. Hosted Dev revision 2→3→4→5, immutable supersession, reason, posted PaymentRecord link, audit, idempotency and change feed were verified; cold restart retained the active cost without duplicates. Mine/Group/Category/Analysis totals changed once per active valuation (€220.10 → €1,221.09 → €220.10 → €221.34). Review generated one rate outlier, retained its personal ACK/history after becoming stale, and settlement previews used distinct active-input digests without finalization. Weekend UI separated 12 July Expense from 10 July ECB reference and Frankfurter delivery.
- Acceptance exposed a proven Stage 7.2B override that had omitted the Stage 5 finalized-input server guard. Minimal forward migrations `20260918000100` and `20260918000200` were applied **only to Hosted Dev** `tuqigdxrvrerfewsxqgm`, restoring the guard and preserving completed-command replay. Direct stale, unauthorized and finalized probes now reject with their expected codes; an accepted command replays idempotently, and the Dev-only frozen DKK→CNY QA snapshot stayed unchanged. Local Supabase reset and 16 pgTAP files/303 checks pass; prior Phase E TypeScript, ESLint, Backend build and 80 Mobile files/316 tests remain valid because Mobile/Backend code is unchanged. Production is untouched.
- **PASS WITH DEVICE ACCEPTANCE PENDING.** Offline cold start was not claimed because this Simulator offered no reliable network isolation control; physical iOS 26.6 interaction remains blocked by Device Hub. No Phase F work. See `docs/ledger/CURRENCY_FX_PHASE_E_PROVENANCE_AND_EXCEPTIONS.md`.

## Currency / FX Phase D — Journey Currency change (Hosted Dev)

- **Phase D Acceptance Closure:** The first QA fixture had null trip dates and was filtered from the standard picker. A real discovery gap also existed: My Ledger cached authorized Journey summaries without actor/member bootstrap. Mobile now bootstraps newly discovered Journeys sequentially after caching My Ledger; its regression test covers discovery and serialized SQLite writes. A signed iPhone 17 Pro Simulator selected a dated Dev QA Journey normally, previewed NZD→EUR (3 affected, 1 same-currency, 2 historical reference, 0 unresolved/finalized), confirmed, and cold-started to consistent EUR 220.09 Mine/Group/Category/Analysis totals with three EUR active valuations. Hosted Dev revision 2, original EUR/ISK/NZD Money, superseded NZD evidence, EUR splits, audit, change feed and idempotency were verified. Review was 0/0/0 with no QA Findings, so ACK/Dismiss retention was not exercised. Finalized-lock UI and pgTAP Backend rejection passed. Offline Simulator and physical iOS 26.6 interaction remain pending; the append-only Dev QA fixture is retained. TypeScript, ESLint, Backend build, 79 files/310 tests, local reset and 16 pgTAP files/301 checks pass. **PASS WITH DEVICE ACCEPTANCE PENDING. Stop before Phase E/F.**
- A dedicated owner-authorized Preview/Commit flow uses the shared Currency Picker. The server commit is one revisioned, digest-checked, idempotent PostgreSQL transaction. It preserves original Money and old accepted snapshots, creates new identity or eligible historical reference valuations, and marks missing/explicit-agreement cases unresolved. Manual, payer-cost and imported evidence get a revision-scoped semantic block against Phase C automatic replacement. Any finalized settlement history permanently locks the Journey Currency.
- Dev migrations `20260917000600` and `20260917000700` add Journey audit, settings guard, candidate acquisition/fix for the proposed currency, and a change-feed bootstrap barrier. Backend bootstrap paginates Expenses, checks setting revision and change sequence, and Mobile applies the refreshed Journey and Expenses in one SQLite transaction. Offline change is unavailable until reconnect and a fresh preview; no SQLite migration is needed. See `docs/ledger/CURRENCY_FX_PHASE_D_JOURNEY_CURRENCY.md` and ADR 0023.
- The 10,000-Expense rolled-back integration run committed in 3.24 seconds, with 10,000 new-currency active valuations and zero mixed-currency active valuations. Hosted Dev `tuqigdxrvrerfewsxqgm` has both migrations and the updated Dev Backend; a rolled-back Dev smoke also verified the command, historical evidence and finalized lock. Expo Doctor previously passed 20/21 checks; the existing SDK patch-version mismatch remains. Production is untouched. **Do not start Phase E/F.**

## Currency / FX Phase C — automatic reference valuation (Hosted Dev)

- Phase C accepts the approved ECB daily candidate as a **reference estimate**, not actual bank/card FX. The Backend's durable scan selects canonical `RATE_REQUIRED` Expenses with explicit `economic_date`, current Journey reference policy, trusted fresh B2 quote and no active valuation/conflict/finalized input, then invokes the existing Stage 5 valuation command. The service-only `ledger_apply_valuation_c` wrapper atomically checks Expense/quote/request date equality, ≤7-day actual reference, current pair/settings revision, source and decimal; it freezes ECB provenance into an immutable snapshot. Already accepted manual, actual payer cost, imported and reference valuations are not auto-replaced. See `docs/ledger/CURRENCY_FX_PHASE_C_AUTO_VALUATION.md` and ADR 0022.
- Hosted Dev `tuqigdxrvrerfewsxqgm` has forward migration `20260917000500` and the updated Dev Backend. Mobile SQLite is v24 with accepted reference evidence cached for future UI. Local reset, 14 pgTAP files/274 checks, typecheck, lint, Backend build and 78 files/307 tests pass. The existing EUR12 B1 Expense advanced from `RATE_REQUIRED` revision 1 to accepted `REFERENCE_RATE` revision 2 at NZ$23.53, retaining both 2026-07-15 dates and ECB attribution. Six excluded-from-settlement Dev QA Expenses verify EUR/USD/JPY/ISK/DKK weekdays plus Sunday EUR→Friday fallback; each reached one accepted snapshot. A controlled DKK candidate price correction/restoration left its accepted snapshot unchanged. Group Categories includes the original B1 Expense exactly once; Review re-evaluation ran. Signed iPhone 17 Pro Simulator verified a new app-created EUR100 Expense auto-valued for 2026-07-07 at NZ$200.88, then in-app corrected to 2026-07-15 and revalued at NZ$196.08; old immutable evidence persisted, and Mine total/count converged once. Both accepted states survived separate cold restarts. Offline interaction and settlement preview remain unverified because the latter encountered pre-existing pending Ledger changes; physical iOS 26.6 screen sharing is unavailable in Device Hub. Production was not touched. **Stop before Phase D/E/F.**

## Currency / FX Phase B2 — historical candidate cache (Hosted Dev)

- B2 is implemented without automatic Expense valuation. The Backend scans durable cross-currency Expense demand only when `economic_date` is known; identical Journey/date/pair/policy requests share one leased acquisition. The pinned Frankfurter v2 ECB adapter validates direction, decimal text, actual reference date, and the approved latest-real rate within seven calendar days. A future/unpublished date remains unresolved. Bounded negative-cache retries distinguish unsupported, not-yet-available, no-reference, rate-limit, and temporary failures. See `docs/ledger/CURRENCY_FX_PHASE_B2_PROVIDER_REVIEW.md`, `docs/ledger/CURRENCY_FX_PHASE_B2_HISTORICAL_RATES.md`, and ADR 0021.
- Hosted Dev project `tuqigdxrvrerfewsxqgm` has forward migrations `20260917000300` and `20260917000400`; Mobile SQLite is v23. Server candidates retain requested `economic_date`, actual `reference_date`, source/provenance, policy, and exact decimal text, and flow through authorized Ledger reads/bootstrap/change feed to isolated local SQLite. A signed iPhone 17 Pro Simulator received the EUR→NZD 2026-07-15 ECB candidate `1.960800000000000000`, retained it after app restart, and its B1 Expense still has no accepted exchange-rate snapshot. Local reset, 13 pgTAP files/259 checks, typecheck, lint, Backend build, and 78 files/298 tests pass. Production was not touched. Phase C remains a separate approval/acceptance gate, including ECB reference-rate suitability for transaction valuation; true offline Simulator cold-start and physical interactive/offline acceptance remain unverified.

## Currency / FX Phase B1 — economic date foundation

- B1 adds explicit `economic_date` (selected local calendar `YYYY-MM-DD`) across the Ledger 2.0 local Expense, durable queue, `/v2` Backend, canonical Dev `public.expenses`, and bootstrap/pull. SQLite v22 and Dev migration `20260917000200` are forward-only and nullable; no historic rows are backfilled from `occurred_at`. Old-client omissions stay unknown; a date correction is financial-core and invalidates incompatible active FX valuation while retaining evidence. Cross-currency `RATE_REQUIRED` with missing date is explicitly distinguishable as `ECONOMIC_DATE_REQUIRED`; no provider or automatic rate flow was added.
- Local Supabase reset and pgTAP migration/regression testing passed (12 files/247 checks). Migration `20260917000200` was applied to Hosted Dev `tuqigdxrvrerfewsxqgm`, and only the Dev Backend service was rebuilt/restarted; public health returned development/ok. Typecheck, lint, Backend build, and 75 files/285 tests pass. A normally signed Release on iPhone 17 Pro Simulator saved an explicit EUR Expense dated `2026-07-15`, reached `SYNCED`, and retained that date after restart; the corresponding Hosted Dev canonical row independently returned `2026-07-15`. An older cross-currency Expense with unknown date showed the confirmation prompt. The B1 contract/policy is `docs/ledger/CURRENCY_FX_PHASE_B1_ECONOMIC_DATE.md` and ADR 0020. B2/C/D/E/F and Production remain out of scope; Phase A physical interactive/offline acceptance remains pending because Device Hub cannot screen-share iOS 26.6.

## Currency / FX Phase A — implemented, Phase B date gate (2026-09-17)

- Phase A implementation is complete in source; no FX provider, automatic market valuation, Journey Currency mutation, or database migration. Expense currency correction preserves visible digits, reparses exact target ISO scale, rejects unrepresentable inputs, and invalidates incompatible active valuation on a provable original Money/stored date-label change. Preferred Currency control is hidden, account-local data/repository retained. TypeScript, ESLint, 75 files/279 tests, signed Simulator and signed physical Release builds pass. Simulator verified invalid JPY precision, JPY/EUR new/edit correction, `RATE_REQUIRED` without invented NZD total, and hidden setting. Physical app was installed/launched without data reset, but Device Hub cannot screen-share iOS 26.6 (requires iOS 27); physical interactive/offline checks remain unverified. Global formatting still reports two pre-existing unrelated files (`AGENTS.md`, `src/hooks/useStage4BPhysicalSmoke.ts`).
- `docs/ledger/CURRENCY_FX_PHASE_A_DATE_FINDING.md` proves existing `occurred_at` cannot unambiguously recover every historical Journey-local calendar date. B1 addresses the explicit-date foundation; **stop before B2** and do not infer history from UTC or device timezone.
- Governing documents: `docs/ledger/CURRENCY_FX_DOMAIN_AUDIT.md` and `docs/ledger/CURRENCY_FX_CONVERGENCE_PLAN.md`. Future 7-day lookback and finalized Journey Currency lock are product-approved, but B2/C/D/E/F implementation is not authorized. No Production access.

## Review 2.0 Phase 3 — implementation underway

- Simulator identity recovery (2026-09-17): Currency Picker UI validation installed `CODE_SIGNING_ALLOWED=NO` Release builds on iPhone 17 Pro and 17e. Those builds had code-signing identifier `OTRMobile` instead of the normal `com.xoery.otrmobile`, so the Pro could not read its existing SecureStore session. A normal signed Release was built and installed over both apps without uninstalling or clearing data. Pro restored Owner plus remembered test Member, retained 394 local Expenses, and remained signed in after another app restart. The 17e has no remembered account, actor context, or Expense cache (all zero); it needs a first login. Preserve normal Simulator signing for future installs on devices with saved sessions.
- Currency Picker follow-up (2026-09-17): Expense entry and Ledger Settings now use one searchable picker. Empty search shows up to six wrapping Suggested chips above a virtualized complete list; search hides Suggested. Suggestions use locally available recent Journey Expense currencies, selected/Journey/default currency, then fixed fallback. iPhone 17 Pro and 17e simulator checks passed for English/Chinese names, long-name truncation, selected state, three/six chips, two-row maximum with six, and search-mode transition. Settings on a fresh simulator could not load preferences without an authenticated local account; Expense-entry save flow was not device-tested.
- 2026-09-17 UI fixes: Recent Expenses Mine now shows the actor's original-currency split beneath the settlement share; Group retains the full original amount. Account login scroll area now avoids the iOS keyboard. Typecheck, lint, 13 focused reporting tests, and `git diff --check` passed. Release was built and installed on both booted Simulators and the physical iPhone; both Simulator apps and the physical app launched successfully.
- Account keyboard follow-up: after the first device report, Account now scrolls to the login form when the keyboard appears or Password gains focus; Password exposes a Done key that dismisses the keyboard. Typecheck and lint pass. Corrected Release was rebuilt, installed, and launched on both Simulators and the physical iPhone; visual keyboard acceptance remains for device confirmation.
- Phase 1 and Phase 2 remain Hosted Dev Accepted/Complete; no underlying Review rules, authorization, migrations or Backend protocol were redesigned. Phase 3 is **Hosted Dev accepted/complete** on 2026-09-17; Production remains out of scope.
- Review inbox implementation now separates active personal pending from active personal reviewed, adds All plus nonzero-pending category chips and collapsed Reviewed/History sections. Detail reads immutable v2 observation context for five rules; Ledger attention uses repository pending count. A post-commit local notification and focus reload repair list/detail/banner navigation staleness. See `docs/ledger/REVIEW_2_0_PHASE_3_INBOX_AND_DETAIL_UX.md` for scope and acceptance matrix.
- Initial Phase 3 physical/simulator acceptance verified category filtering, collapsed Reviewed, Duplicate/Participants/Amount detail, immediate ACK/Dismiss, and local-decision list/banner reactivity. The physical zero-pending-chip build showed only All 14, Duplicate 2 and Participants 12. Physical offline ACK updated locally and converged in Hosted Dev to exactly one action/revision 1.
- Remaining-gate acceptance created three controlled Hosted Dev Expenses. Signed Simulator and physical iPhone Rate detail showed recorded rate 1001, USD→NZD, bounds >0/≤1000 and above-bound direction; physical Evidence showed NZ$25 Expense, NZ$24 posted payment, NZ$1 difference and the persisted payment-record ID. Physical single-pending ACK reached `All 0`/“Nothing needs review” on the first return frame and removed the Ledger banner without a gap. Real physical and signed Simulator A→B→A restored A's 15 pending/Reviewed 5 while B showed 0/0, no A decision leak.
- The first physical Expense-edit run exposed a stale Review return frame. A narrow Expense-save notification now gates Review rendering during operational sync/recheck. On signed physical Release retest, the first Review frame said “Updating Review after Expense change…” (no stale 16/Finding); the completed frame showed 15, no Evidence chip/OPEN row, and Ledger banner 15. Hosted Dev read-only projection confirmed both generations of the Evidence Finding resolved and retained for History. TypeScript, ESLint, 74 files/272 tests, `git diff --check`, and signed Simulator/physical Release builds pass. No Phase 1/2 architecture change or Production access.

## Review 2.0 Phase 1+2 — Accepted/Complete

Status: **Accepted/Complete** for Hosted Dev Phase 1+2 implementation, deployment, and multi-account/device acceptance. Phase 2 is not blocked. Phase 3 has not started and remains a separate scope.

- On 2026-09-17, approved Hosted Dev migration versions `20260916000100` then `20260917000100` were applied exactly once to Supabase `tuqigdxrvrerfewsxqgm`. The compatible Backend from implementation commit `179d2808234659dd1b196c99a24d9aa092110b70` was deployed to the existing `api-dev.xoery.art` Compose service; image digest `sha256:46d2d893ec1e0b5eb11ff5f88e26207ef423d685bb3e2fd438fa0ec09ad6e5b5`. Local and remote `server.mjs` SHA-256 match. Remote configuration points only to Hosted Dev Supabase; Production was not touched.
- Compatible Release Mobile installed on two simulators and a physical iPhone. Real Owner/Member/Guest Dev Auth → remote Backend checks passed for personal decision isolation, private reasons, owner/member/zero-allocation guest visibility, 403 exclusion, correction/reappearance generations, concurrent/no-reason actions, counts, idempotency, old-client gate and Review-free old pull. Simulator Owner ACK synced to Hosted Dev. See the Hosted Dev acceptance section in `docs/ledger/REVIEW_2_0_PHASE_2_PERSONAL_DECISIONS_AND_VISIBILITY.md` and `scripts/supabase/validate-review-v2-hosted.mjs`.
- A real test-only Hosted Dev Member `review2-device-member-20260917@otr.invalid` is linked to the synthetic baseline Journey. Its 16-character random password is stored only in the local macOS login Keychain service `com.xoery.otrmobile.review2.hosted-dev.20260917` (never in source/logs); Keychain readback and real password Auth sign-in passed. Real Auth → Backend checks passed Owner-no-split, Creator-only, Payer-only, split-eligibility loss, cross-date and cross-currency negatives, and cosmetic edit stability. The repeatable check is `scripts/supabase/validate-review-v2-remaining-hosted.mjs`. Eight incomplete first-run Expenses, three negative-rule Expenses, and the eight final eligibility Expenses were recoverably soft-deleted through Hosted Dev Backend; retain only the documented Auth/Journey-member test identity for reusable Dev acceptance.
- The iPhone 17 Pro Simulator completed genuine Owner → test Member → Owner switching through Account management; their Review decisions stayed separate, and Member's local active Split-only Finding disappeared after its split became zero while Owner still saw it. On the physical iPhone 16 Pro, OTR-only cellular access was disabled while the Mac hotspot remained online: a local ACK showed `Offline · showing cached Review`, Hosted Dev remained `NEEDS_REVIEW`/revision 0, then reconnect converged to `ACKNOWLEDGED`. Four intentional taps exposed missing selected-button feedback, not a retry duplicate. The minimal Mobile repository/UI safeguard now suppresses same-decision taps and labels the selected button; 73 Vitest files / 268 tests, typecheck, lint, signed Release builds and physical-device recheck passed. A second physical offline ACK on the patched build converged to exactly one remote action/revision 1. Normal Simulator signing preserved both accounts after an initial unsigned build could not read SecureStore. **Phase 2 Hosted Dev acceptance passed; Phase 3 remains a separate scope.**
- Current Mobile SQLite schema version: **21**. Older milestone notes below are retained as historical context, not current rollout status.

## Review 2.0 Phase 2 — foundation detail

- Phase 2 source now separates shared v2 Finding lifecycle from actor-specific
  ACK/DISMISS. Supabase migration `20260917000100` adds private decisions and
  observation-time eligibility snapshots; SQLite v21 adds user-scoped visibility
  and decision projections. Full specification and rollout boundary are in
  `docs/ledger/REVIEW_2_0_PHASE_2_PERSONAL_DECISIONS_AND_VISIBILITY.md`.
- Backend Review reads and normal action history use a linked-user eligibility
  RPC. Active eligibility is Owner OR creator OR payer OR canonical split with
  nonzero original/settlement minor; historical v2 uses a frozen snapshot plus
  current membership. Bootstrap/pull carry a full user-scoped Review snapshot,
  never Journey-wide `REVIEW_FINDING` change payloads. Old clients without
  `X-Review-Protocol: 2` get no Review data and Review endpoints return 426.
- Mobile applies the snapshot atomically per current authenticated user;
  local actions update only personal decision/count and queue a durable action.
  403 removes local Review visibility; terminal queue failures converge on the
  next successful Review projection. UI is minimally compatible, not redesigned.
- Local Supabase was rebuilt from migrations and seed; 12 pgTAP files / 245
  assertions pass. TypeScript, ESLint, Backend build and 73 Vitest files / 267
  tests pass. This is the pre-rollout local validation baseline.

## Review Engine v2 Phase 1 (local validation)

- Additive Supabase Review migration `20260916000100` and Mobile SQLite v20,
  versioned five-rule observation/evidence, lifecycle/episode reconciliation,
  same-currency amount cohort and same-day duplicate rule are implemented in
  source. Canonical Expense and payment/valuation success paths trigger a
  best-effort full-Journey re-evaluation; explicit refresh repairs missed runs.
- This paragraph describes the historical Phase 1 state; Phase 2 source now
  supersedes global human decisions and Journey-wide Review visibility.
  Legacy observation evidence/actions persist; first successful v2 reconciliation
  retires the legacy heuristic global status to STALE. At that earlier Phase 1
  checkpoint no Hosted Dev/Production migration had been applied; see the
  current Hosted Dev status above.
- The additive migration applied to local Supabase; all 11 pgTAP files / 214
  checks pass. The pre-existing date-sensitive Stage 5.1 FX fixture was made
  relative to test time without changing financial rules.
- TypeScript, ESLint, Backend build and 72 test files / 261 tests pass; the
  Backend create trigger test verifies Review failure cannot misreport a
  committed canonical financial write.
- This subsection is historical Phase 1 local-validation context. The current
  rollout and remaining gate are at the top of this file.

## Ledger Entry Page — Review and Member Spending Polish

- Follow-up member polish: Group member chips use a short first-name label with
  full-name accessibility text and sort by authoritative split-attributed total
  descending. Members with zero spending remain selectable.
- Category drill-down carries the selected member explicitly and labels the Search
  results with the full member name. Analysis retains the Group context, adds the
  same member selector, and preserves selection across dimensions, date ranges, and
  bucket drill-down. The report still uses the existing member split query.
- TypeScript, ESLint, 70 test files / 255 tests, and signed Simulator Release pass.
  On iPhone 17 Pro, an Élodie food category displays ¥1,429,064.79 in the entry,
  Search and Analysis drill-down, with 7 matching Expenses and full-name context.
- Spending shows a compact Review banner only when the current Journey has
  open or acknowledged findings; it opens the existing Review List.
- Mine Categories remain unchanged. Group adds a horizontal Group/member selector
  and uses the existing category bars for either the full Journey or the selected
  member's authoritative split-attributed spending. Each view uses its own total
  for percentages, and category drill-down carries the selected member context.
- See analysis remains available with a Group/member selector.
- SQLite, Backend, Supabase, sync protocol, and financial rules are unchanged.
- TypeScript, ESLint, 70 test files / 254 tests, `git diff --check`, and the
  generic iOS Simulator Release build pass.
- The final Release was installed on the booted iPhone 17 Pro Simulator and
  checked through Device Hub. The 31-item Review banner opens the existing
  Review List; a Journey with zero Review items has no banner or gap. Group
  defaults to Group, the member selector scrolls horizontally, and Group/member
  category totals and drill-down lists match their own contexts. See analysis
  carries the selected member's data, while its existing UI still says “Mine.”
- Final Mine, Group, Group total, member total and zero-review screenshots were
  saved outside Git under `/private/tmp/otr-ledger-entry-*-final.png`.

## Current Milestone

The Account Switching Foundation plus contextual global menu and Dev quick-account
selector are complete through Slices 5–6 on `integration/ledger-polish-canonical`.
Stop here for review; the bottom-tab migration remains deferred.

Mobile SQLite schema version at that earlier checkpoint: 19.

## Contextual Global Menu And Account Switching — Slices 0–6

- Account switching is a Production foundation; the Dev quick selector is only a
  gated convenience layer over real remembered sessions.
- SecureStore now keeps explicit identity, an account index, and independent sessions;
  passwords are never stored and the single-session format is adopted safely.
- SQLite v19 scopes actor context, My Ledger, cursors, selected Journey, both durable
  queues, and local unconfirmed Expense/Itinerary/receipt state.
- ADR 0019 defines device-local identity scope. It does not change Backend/Supabase
  ownership, membership, financial, or authorization semantics.
- Canonical Backend-confirmed Journey facts remain shared for an authorized active
  Journey actor. Local unconfirmed rows are visible only to their local owner.
- Every new authenticated operation records its owner. Both durable workers list and
  claim only the active user's operations; the negative transport test proves B cannot
  send A's queued mutation.
- The switch boundary pauses and drains all sync entry points, clears in-memory state,
  changes session, adopts only provably owned legacy state, bootstraps the target, then
  restarts sync. Failure rolls back; logout does not restart sync.
- Ambiguous legacy operations remain parked. Legacy state is adopted only when the
  v18 actor cache proves the same auth user.
- The automated A → B → A gate proves that B sees shared canonical data but neither
  sees nor sends A's local Expense; returning to A preserves and sends its operation.
- TypeScript, ESLint, all 69 test files / 249 tests, and `git diff --check` pass.
- Option A (Today / Ledger / Trip / Album) is the approved long-term bottom navigation;
  the current tabs remain unchanged in this task.
- The global menu now appears on every current primary root. It shows the real current
  identity, masked email and current Journey role; Ledger adds My Ledger, Review and
  Ledger Settings, while modules without real secondary destinations add none.
- Current User opens Production-shaped account management. Add/login, remembered-session
  switch, removal and logout all use the same safe account-switch boundary; passwords
  are never persisted.
- Switch test account and Diagnostics appear only with Dev transport plus Debug Mode.
  The quick selector admits only approved remembered Synthetic Owner/Member sessions and
  never fabricates a local role.
- Signed Release Simulator UI acceptance covered the Synthetic Owner on Synthetic
  Baseline Journey, contextual/global sections, Dev gating, accessibility labels and the
  no-other-remembered-account state. The second approved account was not present in either
  Simulator Keychain, so UI credentials were not invented; automated A → B → A coverage
  exercises the same coordinator path.
- TypeScript, ESLint, the architecture boundary, all 70 test files / 253 tests, focused
  Prettier, `git diff --check`, and the signed iOS Release Simulator build pass. Public
  Dev health returns `status: ok`, `environment: development`.
- Physical Release signing is blocked on this Mac because Xcode has no developer account
  or provisioning profile for `com.xoery.otrmobile`; no project signing setting changed.
- Foundation commit `8336e4bc4c85895e18fc498ec8ad465de6237216` has message
  `Add production account switching foundation`. The contextual UI commit uses message
  `Add contextual account menu and user switching`; its exact SHA is recorded in the
  completion report.
- Next checkpoint: review Slices 5–6. Production data, Backend behavior, Hosted Dev data,
  Supabase schema, SQLite v19, current tabs, Replay identities and Journey member mappings
  remain unchanged.
- Detailed evidence: `docs/ux/GLOBAL_MENU_ACCOUNT_SWITCHING_ACCEPTANCE.md`.

## Public Dev Backend

- `api-dev.xoery.art` resolves to the existing Hetzner host and serves the Node backend
  through Caddy-managed HTTPS. HTTP redirects to HTTPS and port 8787 is bound only to
  `127.0.0.1`.
- `/opt/otr/dev-backend/source` holds the deployable source snapshot;
  `/opt/otr/dev-backend/env/backend.env` is root-owned mode 0600 and remains outside Git.
- `otr-dev-backend` runs as non-root with a read-only filesystem, 384 MiB memory limit,
  bounded JSON logs, healthcheck, and `unless-stopped` restart policy.
- Container-only restart recovery, public/local health, TLS, direct-port isolation,
  existing `ai.xoery.art` / `media.xoery.art` health, log redaction, and unchanged Replay
  counts passed. The shared server and Docker daemon were not restarted.
- Canonical ignored Mobile config points Release builds to the public Dev domain with
  the real `dev` sync transport. Release bundle checks exclude test credentials and
  server-side secrets.
- Credential-free Release builds are installed on Simulator A, Simulator B, and the
  physical iPhone. Public-Backend acceptance passed for Dev Auth/token refresh,
  bootstrap/incremental pull, Journey switching, active polling, iPhone edit,
  background/foreground reconciliation, offline durable retry, Settlement, and focused
  Transfer detail.
- The explicit UI Polish acceptance Expense leaves final Hosted Dev counts at 134
  Expenses, 1 Settlement, 7 Transfers, 4 Payments, and 2 Discharges. Replay remained
  read-only at 126 Expenses and zero Settlement lifecycle rows.
- Operational documentation: `docs/ops/DEV_BACKEND_DEPLOYMENT.md` and
  `docs/ops/DEV_BACKEND_RUNBOOK.md`.

## Ledger UI Polish Round 2 — Entry Page Part 2

- Ledger uses a reusable, icon-anchored compact navigation menu with full-row links,
  selected state, persistent Settings/Language entries and outside-tap dismissal.
- Settings persist Default Currency and Debug Mode in SQLite. Exchange Rates has a
  truthful future Currency Module entry; no provider or unverified conversion was added.
- Choose Journey groups selectable records Active → Upcoming → Past, sorts each group,
  displays date/member/status and a distinct selected state, and hides incomplete or
  development/test records from normal mode without deleting data.
- Existing sync/network/environment copy now appears only in a low-priority Debug
  Information section when Debug Mode is enabled; disabled mode leaves no section gap.
- TypeScript, ESLint, all 66 test files / 230 tests and signed iOS Release builds pass.
  A dedicated `OTR Part2 QA` iPhone 17 Pro Simulator covered menu/settings/debug
  interaction without competing for the two shared Simulators. The same signed Release
  is installed and launched on Leon's physical iPhone 16 Pro. The online Dev Backend
  health endpoint returns `status: ok`, `environment: development`.
- Detailed evidence: `docs/ledger/LEDGER_UI_UX_POLISH_ENTRY_PART2_ACCEPTANCE.md`.

## Ledger UI Polish Round 2 — Entry Page

- The fixed full-width Trip bar now sits directly below the native top bar, uses a
  compact `TRIP` badge and single-line ellipsized title, and keeps the existing Journey
  selector. Spending / Settlement scrolls with page content.
- Mine / Group replaces one complete local projection in place; the layout-shifting
  update indicator is removed. Categories show compact percentage bars without a chart
  dependency.
- Need Attention is a warning-toned clickable conflict row with a chevron. Exchange-rate
  maintenance is no longer presented there as a user task.
- Recent Expenses use category symbols, default-currency primary amounts, optional
  original currency beneath the primary amount, conditional Mine totals after the date,
  compact split tags, silent settlement exclusions, dates without payer copy, and a
  bottom View more action. Mine lists omit absent and zero personal shares while retaining
  unresolved shares that still need valuation.
- Currency follow-up: a future Currency Module must own online retrieval, cached rates,
  offline fallback, missing-rate reconciliation, and background refresh. It was not
  implemented in this UI-only round.
- TypeScript, ESLint, all 66 test files / 227 tests, and the arm64 Release Simulator build
  pass. iPhone 17 Pro and 17 Pro Max visual checks cover long Trip names, Mine / Group,
  category counts, conflicts, split rows and compact layouts. The app has no established
  dark-theme token system, so this screen remains consistent with its existing light UI.
- The final Release is installed and launched on iPhone 17 Pro and 17 Pro Max Simulators
  plus Leon's physical iPhone 16 Pro (`com.xoery.otrmobile` `0.1.0 (1)`). The LAN Dev
  Backend health endpoint returns `status: ok`, `environment: development`.

## Mobile Sync Trigger And Multi-Device Dev Validation

- Expense Save now asynchronously kicks the existing durable worker after the local
  write; it never blocks navigation or creates another queue path.
- Ledger focus, foreground, Journey change and reconnect reconcile immediately. An
  active visible online Ledger also performs cursor-based pulls every 8 seconds.
- Active polling reuses the existing refresh-before-sync lifecycle path, so an expired
  Dev access token refreshes silently before push/pull. Concurrent foreground and
  Ledger triggers coalesce into one refresh/sync run.
- Per-Journey pull coalescing, one queued rerun and visibility/Journey generation
  checks prevent overlapping or stale projection updates.
- User-visible status is limited to Syncing, Up to date, Offline with saved-data
  reassurance, and Changes waiting; an unresolved conflict counts as waiting.
- Simulator A/B and the physical iPhone passed automatic propagation, offline durable
  convergence, foreground refresh, restart, Journey isolation and revision-conflict
  preservation. The final credential-free signed Release is installed on all three.
- Evidence and the remaining multi-account coverage gap are in
  `docs/ledger/LEDGER_MULTI_DEVICE_SYNC_ACCEPTANCE.md`.

## Canonical Workspace Recovery Validation

- The two divergent source workspaces are preserved by verified filesystem snapshots
  and recovery commits. The canonical integration is isolated at
  `/Users/xoery/Project/otr-mobile-canonical` on
  `integration/ledger-polish-canonical`.
- TypeScript, ESLint, all 64 test files / 215 tests, and the focused 23-file / 62-test
  recovery suite pass. The repository-wide Prettier check reports only the two
  pre-existing unrelated files `AGENTS.md` and
  `src/hooks/useStage4BPhysicalSmoke.ts`.
- Prototype-disabled Expo export and a non-signing Release Simulator build pass. The
  export bundle SHA-256 is
  `f3182a31a07c6cc8dd1bc5858b785c0c441db7fa7321549b9efc6b05644b619b`; the native
  Release `main.jsbundle` SHA-256 is
  `e836bc0ad4a69077c8be736195c05c342822e676198d7b6d7944135caced566a`.
- Both bundles exclude `ledger-prototype`, `LedgerPrototypeProvider`,
  `QuickExpenseScreen`, `Search & Filter`, and `RECENT EXPENSES`. The native Release
  bundle contains the P4 `Add manually` / `Scan receipt` entry and P2
  `Recent Expenses` presentation.
- No app was installed, no Hosted Dev command was run, and Production was not accessed
  during recovery. Stop before installation or Round 2 Polish.

## Europe Replay Recovery And Protection

- The retired Replay Journey is
  `ae2fb30d-6e31-8ff9-8b14-f8a1b275cf65`; its terminal documented fingerprint is
  `d69866ea72293f80d9201cd7020f3ae58e8ca0651db64f2daa41e81d9f8d797d`.
- The active immutable Replay Journey is
  `ec3ae448-3fa5-84a9-a986-655a243cf3ad`, with approved fingerprint
  `97fa314b965dd6af0f1337147301bdfb345e8a0060e1de0c56c6b421dcd83ce2`.
- The active fixture remains 126 ACCEPTED Expenses, 68 INCLUDED, 58 EXCLUDED,
  531 participants/splits, 126 rate/active valuations, and zero Settlement,
  Payment, Adjustment, Receipt, Household, Review or Expense-audit lifecycle facts.
- Exact-ID guards protect both Replay identities at Expense and Settlement
  repositories, coordinators, and queued Expense/Payment workers. Read-only
  reporting and preview remain available.
- Recovery evidence is in
  `docs/ledger/LEDGER_REPLAY_RECOVERY_ACCEPTANCE.md`.

## Europe 2026 UI Polish Settlement Fixture

- Journey `41076e49-0005-599f-af68-5062fd5695f8` was finalized through existing
  Backend/domain commands at approved preview digest
  `0fea678fa1dec0053de71b65b6449ff076204fd088aeab924f4013d9596e8aaa`.
- Hosted Dev contains exactly one root Settlement, seven persisted transfers,
  four Payments and two discharges. Transfer coverage is three OPEN, one SETTLED,
  one PARTIALLY_PAID, one AWAITING_CONFIRMATION and one DISPUTED.
- Fixture commands and idempotency keys are stable; the accepted rerun created no
  duplicate lifecycle facts. The five pre-existing terminal FAILED local operations
  were preserved and remain ineligible for automatic retry.
- The canonical focused-transfer route retains the P5 `TransferDetailScreen`, validates
  both persisted transfer and Journey UUIDs, checks Journey ownership, and renders a
  focused not-found state instead of falling back to the Settlement overview.
- Fixture evidence is in
  `docs/ledger/LEDGER_SETTLEMENT_TEST_FIXTURE_ACCEPTANCE.md`.

## Ledger UI/UX Polish P6

- Ledger-wide Dynamic Type fixes replace aggressive shrinking and crowded horizontal
  layouts with wrapping, flexible height and large-text stacking across dashboard,
  Search/Filter, Expense/member/split, Settlement/transfer and Review surfaces.
- Touched actions now meet the 44-point target baseline and expose explicit labels,
  roles and selected/disabled state. Ordinary UI copy no longer exposes the audited
  SQLite, canonical/authoritative or deterministic-validation terminology.
- Existing Stage 2 controls are isolated as Development-only Developer Diagnostics.
  Release Settings has no diagnostic entry and the direct Release route redirects to
  normal Ledger Settings. No new diagnostic or financial mutation path was added.
- TypeScript, targeted ESLint, all 59 test files / 204 tests, the architecture boundary,
  Stage 10 prototype-removability guard and final iOS Release builds pass. Normal runtime
  remains free of `ledger-prototype`.
- Final Release Simulator and Leon's iPhone 16 Pro accepted the representative P1-P5
  flows. Physical Accessibility XXXL found and narrowly fixed clipped Add Expense
  chooser actions and a mid-word Settlement label; final device revalidation passes.
- Direct physical iPhone VoiceOver verification completed without iPhone Mirroring.
  Labels, roles, selected state, focus order, actionable controls and modal focus return
  passed across the required Ledger flows with no blocking issue.
- The final Simulator Release is installed on iPhone 17 Pro and iPhone 17 Pro Max with
  identical installed/build bundle hashes. The final signed Release is reinstalled on
  the physical iPhone 16 Pro and confirmed as `com.xoery.otrmobile` `0.1.0 (1)`.
- P6 and Ledger UI/UX Polish P1-P6 are fully accepted. See
  `docs/ledger/LEDGER_UI_UX_POLISH_P6_ACCEPTANCE.md`. Stop before Production.

## Ledger UI/UX Polish P5

- Settlement is transfer-first: state/readiness and the personal position lead into a
  scannable `X pays Y` list with original amount and human status. Transfer detail owns
  original/paid/remaining amounts, the human payment timeline, explanation disclosure
  and one actor-valid primary action.
- Payment entry uses a focused native sheet while preserving the existing partial,
  cross-currency, queued-offline, confirmation, reject/dispute, correction, permission
  and overpayment semantics. Settlement update and Statement / Export are separate
  focused routes over the existing Stage 7 data and coordinators.
- Review is a virtualized task list with human copy, focused finding detail, contextual
  action reasons and direct related-Expense navigation. A final acceptance fix carries
  the selected Journey key through list/detail instead of reading the Stage 3 fallback.
- TypeScript, targeted ESLint, 14 targeted test files / 32 tests, the Stage 10
  prototype-removability guard, iOS export, Release Simulator and signed device builds
  pass. Final Release Simulator and Leon's iPhone 16 Pro accepted the transfer hierarchy,
  focused routes, received-payment timeline, offline wording and Dynamic Type spot check.
- The physical cache had no open transfer for which the signed-in member was payer, so
  actor-valid payment-sheet variants and no-write Cancel used an equivalent Release
  Simulator synthetic payer; the physical device covered final Settlement, transfer
  selection, payment history and invalid-action suppression.
- Acceptance found and narrowly fixed two P5 defects: Review was reading the wrong
  Journey, and settled overview rows displayed zero remaining instead of original
  transfer amount. No financial, Backend, schema, Supabase or payment-lifecycle semantic
  change was made.
- P5 is accepted. Its deferred VoiceOver/accessibility-wide follow-up was completed and
  accepted in P6. See `docs/ledger/LEDGER_UI_UX_POLISH_P5_ACCEPTANCE.md`.

## Ledger UI/UX Polish P4

- Add Expense now starts with Add manually or Scan receipt; neither navigation choice
  creates a financial record. New and Edit Expense use the real local repository and
  durable queue rather than prototype or in-memory state.
- Manual entry provides the approved short field order, Today/current-member defaults,
  searchable existing ISO currencies with scale-aware money parsing, native date
  selection, virtualized members, compact allocation, all existing split modes,
  explicit multi-person settlement confirmation, and progressive More Details.
- Existing true datetime, allocation snapshots, valuation, and business status are
  preserved when unrelated fields are edited. Household modes require valid existing
  membership and continue to use the established deterministic domain allocators.
- Receipt import now carries explicit OCR intent inside the existing repository/worker
  abstraction. Scan queues OCR; manual attachment only queues required upload/link
  work. Assets remain durable and OCR suggestions never become financial facts before
  Save.
- TypeScript, ESLint, all 58 test files / 203 tests, iOS export, and arm64 Release
  Simulator build pass. UI Polish Release smoke opens intent, manual, and edit screens
  without the former unavailable page; intent navigation preserved the 134-row count.
- Signed Release on Leon's iPhone 16 Pro (iOS 26.6) passed intent/manual, camera,
  Photo Library, Files/PDF, OCR-intent separation, offline local Save, attachment
  persistence, duplicate prevention, queued-sync wording, interaction feel and maximum
  Accessibility Dynamic Type. Final device SQLite integrity was `ok` with 349 Expenses
  and 12 receipt assets.
- Physical testing found and narrowly fixed dirty-Cancel bypass, same-frame double Save,
  non-scrollable maximum-text intent content, cramped large-text form/allocation rows,
  clipped amount/header text and missing selected/disabled accessibility state. The
  final Release build, typecheck, lint and focused 4-file / 9-test regression pass.
- Normal runtime remains free of `ledger-prototype`. P4 initially deferred direct,
  unmirrored VoiceOver verification to P6; that physical-device check is now complete
  with no blocking issue.
- Functional gaps remain deliberate: no persisted Settings split default (use
  `EQUAL_PERSON`), no recent-currency preference (use Journey settlement currency), no
  approved Activity read query, and no Household management.
- The deferred direct physical-device VoiceOver spot-check was completed in P6.

## Ledger UI/UX Polish P3

- Search is one dedicated repository-backed filtered-results screen shared by the
  top-right Search action, Dashboard category drill-down, Analysis drill-down and
  See All. It keeps a 200 ms debounce and keyed stale-response rejection.
- The Filter page sheet holds drafts until Apply, supports specific/custom dates,
  Today, Yesterday, This Trip, category, payer, participant, currency and supported
  actionable states, and shows committed filters through tint/count/removable labels.
- Expense results use `FlatList`, stable IDs and 50-row repository pagination; the
  touched Review list is also virtualized. Search fetches an exact matching count
  without changing reporting totals or financial semantics.
- Analysis keeps scope/dimension/range atomic, orders Time chronologically, uses exact
  localized drill-down dates and correct singular/plural wording. Stack preservation
  retains Search and Analysis state on push/back.
- A narrow post-P3 follow-up found that the Add Expense crash fix had remounted the old
  review prototype's in-memory business-state provider because `/expenses/new` still
  rendered `QuickExpenseScreen`. The provider and all normal-route prototype imports
  are removed again. Add Expense and title editing use a narrow repository-backed
  pre-P4 bridge; the P4 intent choice and full Expense-form redesign were not started.
- TypeScript, ESLint, iOS export and targeted regressions pass (9 files / 20 tests).
  The combined 10,000-Expense first-page/count/summary query completed in 69 ms,
  below the existing 250 ms baseline.
  Release Simulator accepted UI Polish 133-row windowing, filters, multilingual long
  rows, exact drill-down sets and state restoration. Signed Release on the connected
  iPhone accepted Search/Filter ergonomics and one-time maximum Dynamic Type; that
  pass found and fixed Filter-header overlap and Search amount wrapping.
- P3 is accepted. Stop before P4.

## Ledger UI/UX Polish P2

- Ledger opens as a Journey dashboard with navigation-bar Ledger menu, Search and
  Add Expense actions; sticky Journey plus Spending/Settlement context; subordinate
  Mine/Group scope; primary total; top-five category drill-down; conservative local
  Settlement snapshot; actionable attention; and 12 Recent Expenses with See All.
- Journey selection is a searchable native sheet with title, localized dates,
  selected state and only date-unambiguous Active/Upcoming/Past labels. The current
  model has no reliable lifecycle or test-Journey classification, so ambiguous
  lifecycle labels and title-based hiding were deliberately omitted.
- Settlement preview is never calculated or implied on Spending. The dashboard shows
  signed position only from an existing local finalized Settlement; otherwise it
  offers a clearly labelled readiness/preview entry.
- Receipt rows expose a quiet paperclip and accessible receipt label. Healthy
  ACCEPTED/SYNCED states remain silent. Category and See All navigation reuse the
  existing Search results route.
- TypeScript, ESLint, iOS Expo export and targeted reporting/navigation/domain tests
  pass (8 files / 18 tests). Release Simulator verified UI Polish multilingual
  density, Journey lifecycle presentation, menu/Search/category/Settlement routes,
  receipt indication, attention state, and the Replay read-only Mine total of
  CNY 46,379.79 with exactly 12 recent rows.
- The signed Release built, installed and launched on Leon's iPhone 16 Pro.
  Mirrored-device acceptance passed top-bar reachability, icon clarity, Journey
  selection, sticky scrolling and a process-scoped maximum Dynamic Type check. The
  check found and fixed a Journey-sheet header overlap; revalidation passed without
  changing the device's persistent text-size setting. P2 is accepted; stop before P3.

## Settlement Participation And Stage 9 v3 Gate Delivered

- Canonical Expenses now carry `settlementParticipation = INCLUDED | EXCLUDED`;
  existing and normal new Expenses default to `INCLUDED`.
- `EXCLUDED` remains canonical `ACCEPTED` spending/consumption truth while
  Settlement, Adjustment and pre-settlement debt vectors omit it with stable
  non-blocking reason `EXCLUDED_FROM_SETTLEMENT`.
- Participation changes reuse the revisioned Financial Core mutation,
  authorization, conflict and audit path. SQLite migration 17 and Hosted Dev
  migration `20260913000600` are applied; no Production schema changed.

- Fixed seven-table/column Production extractor with no arbitrary SQL, RPC,
  method, table, column, filter, Auth, Storage, Functions, or external endpoint
  input; the authenticated extractor completed one approved two-pass Production
  run and committed the matching raw bundle outside Git.
- Existing RLS intentionally denies the retired dedicated Session Pooler reader.
  The approved replacement uses one existing real Journey member/creator access
  token through the exact authenticated PostgREST origin, with GET-only CSV
  requests, no refresh capability, deterministic keyset pagination, and two-pass
  source-set consistency verification.
- Pass A writes only a private candidate. Transform requires an fsynced
  `COMMITTED` receipt and digest inside an atomically renamed read-only `raw/`
  directory; failed or interrupted candidates are not accepted.
- Deterministic HMAC/UUIDv8 transform, exact ISO minor-unit conversion,
  pseudonymization, DRAFT/accepted classification, and privacy rejection.
- Evidence-bounded `legacy-equal-rounding-normalization-v2` promotes only proven
  shared/equal independently rounded residuals. Stable mapped-member ordering
  and `ledger-largest-remainder-v1` produce exact destination splits while
  provenance binds the historical stored-share evidence and states that the
  normalized participant amounts are not claimed historical values.
- Separate private approval manifest with exact grouped financial totals and a
  repo-safe summary that omits all exact totals.
- Service-role-only transactional replay function and guarded local/Hosted Dev
  loader; migrations `20260913000500` and `20260913000600` are applied to the
  approved Hosted Dev project. The approved replay was imported once and its
  canonical second invocation was idempotent.
- Synthetic fixture covers accepted equal split, proven legacy residual, `stats_only`,
  custom split, missing payer, and inexact zero-decimal currency.
- Imported review DRAFTs, when present, retain participants for correction
  context but no authoritative splits or valuation and remain excluded from
  Spending, My Ledger, authoritative analysis, Settlement and Adjustment.

## Stage 8 Delivered

- authoritative structured deterministic validation, distinct from persisted
  versioned heuristic Review findings;
- immutable finding observation context plus append-only acknowledge/dismiss
  actor history; actions never mutate financial truth;
- Review v1 rules for possible duplicates, amount/rate outliers, evidence
  mismatch, and participant anomalies;
- scope-safe versioned Ledger cursors with stable `INVALID_CURSOR`, controlled
  bootstrap recovery, atomic page application, and multi-page continuation;
- durable-operation due-time enforcement, process claims/leases, interrupted
  operation recovery, exponential backoff with jitter, auth pause, and terminal
  domain failure classification;
- redacted backend routes and count/size-only support diagnostics;
- whitelist-only completed-operation cleanup and authenticated size/SHA-256
  receipt re-download proof before uploaded-copy eviction;
- coalesced foreground/background operational sync and non-blocking Release
  cold start using the embedded bundle and cached SQLite state;
- Hosted Dev review/action schema and `REVIEW_FINDING` feed, deployed only after
  compatible Mobile and Backend support.

No AI model, Production mutation/deployment, payment provider, Stage 10 scope,
or new architecture framework was added.

## Validation Status

- TypeScript, ESLint, and all 52 test files / 191 tests pass.
- A private PostgreSQL plain-SQL/COPY backup of all Hosted Dev `public` data was
  restored into an isolated local Supabase environment. All 92 tables and 1,860
  rows matched by count and deterministic content digest; 681 constraints were
  validated, 275 foreign keys had zero orphans, and all 21 migrations plus the
  sequence state matched. Auth credentials/session material and Storage object
  binaries remain outside the approved backup scope.
- Hosted Dev independently contains the approved 1 Journey / 8 members / 126
  Expenses / 531 participants / 531 splits / 126 rate snapshots / 126 active
  valuations, with 68 INCLUDED, 58 EXCLUDED, 69 normalization provenance rows,
  no DRAFTs, and no import Review findings or fabricated financial history.
  Exact split reconciliation, zero-sum INCLUDED settlement, deterministic IDs,
  duplicate checks, and privacy scans passed.
- The canonical second import produced zero new rows, updates, revision changes,
  or additional change-feed effects and retained the same target and financial
  fingerprints.
- Two Release Simulator clients passed normal Auth -> Backend -> Hosted Dev ->
  SQLite v17 bootstrap/pull. Spending, Search, and Analysis included all 126;
  Settlement used only 68 INCLUDED inputs and excluded 58; My Ledger server and
  cache agreed; incremental pull was empty and duplicate-free. With Backend and
  Metro stopped, both clients cold-started from the cached 126/68/58/531 state.
- The approved replay mapping contains one linked organizer and seven unlinked
  members. Both Simulator clients used that same approved linked identity; the
  unmapped creator was denied by the normal read path and no mapping was inferred.
- An isolated fresh Supabase instance replayed the complete migration chain and
  all 200 pgTAP checks passed. The canonical manifest is 92 tables / 1,293
  columns; all 92 public tables have RLS. Participation persistence, one-step
  revision, Financial Core audit, stale-toggle conflict and Stage 9 import
  mapping are covered.
- The final synthetic ETL run passed deterministic IDs, exact money, equal
  allocation, privacy rejection, dual-manifest generation, transactional local
  load, full rollback with zero residual rows, and idempotent replay with zero
  changes.
- The real v3 transform produced 126 ACCEPTED Expenses: 68 settlement-included
  and 58 settlement-excluded. There are zero loadable DRAFTs, one unloadable
  row and zero legacy-settlement exclusions. All 69 normalized rows passed the
  legacy evidence/provenance gate. All accepted original/settlement splits
  reconcile exactly; DRAFT authoritative rows and privacy hits are zero. The
  deterministic replay is byte-identical and the committed raw digest remained
  unchanged. Dataset digest:
  `be1fce8c0a4a681e2f520484401317a9ba3611cab1d0636f1c07bee754268a49`.
- Targeted iPhone 17 Pro Simulator Release acceptance passed Spending inclusion,
  Settlement exclusion, stable explanation, exact Adjustment delta and root/
  delta zero-sum behavior; the native OFF control displayed the approved copy.
- The compatible Backend ran on the existing LAN Dev endpoint against only the
  approved Hosted Dev project. A dedicated authenticated compatibility Journey
  passed create/read/update, default `INCLUDED`, explicit `EXCLUDED`, bootstrap,
  incremental pull, Spending/search/analysis, Settlement preview/finalization,
  participation-toggle Adjustment, and final `EXCLUDED` restoration checks.
- The compatible Mobile Release was built and installed on the iPhone 17 Pro
  Simulator. Normal Auth -> Backend -> Hosted Dev bootstrap and full pull both
  hydrated SQLite v17 as two `INCLUDED` and one `EXCLUDED` Expenses without
  dropping or coercing participation.
- Stage 6/7 targeted regression passed 11 files / 34 tests; affected Backend and
  repository regression passed 7 files / 49 tests; Stage 4B/7 database pgTAP
  passed 71 checks. TypeScript and targeted ESLint are green.
- The older Stage 7 acceptance Journey had eight pre-existing `CHANGED` items in
  a zero-transfer Adjustment preview. This gate did not finalize that unrelated
  state and used the isolated compatibility Journey instead; no product/API
  compatibility defect was found.
- The authenticated REST synthetic HTTP gate passes multi-page and composite
  keyset pagination; duplicate/missing/out-of-order rejection; Pass A/B
  insert/delete/update and presence-count drift detection; JWT TTL, role,
  issuer, and Journey visibility rejection; REST-only request construction;
  token-canary non-leakage; and candidate non-commit after failure.
- Hosted Dev migrations `20260913000300` and `20260913000400` were applied in
  order after the compatible Release Mobile and Stage 8 Backend were available.
- Hosted Dev generated 13 heuristic findings. One acknowledge action retained
  actor history, and the canonical financial fingerprint was identical before
  and after the action.
- Malformed, wrong-Journey, wrong-user/version, and impossible-continuation
  cursors return `INVALID_CURSOR`. A real 298-change pull completed in three
  pages with zero duplicates; interruption replay and controlled-bootstrap paths
  pass automated tests.
- Backoff, restart recovery, concurrent-wakeup single claim, cache/DB cleanup,
  protected receipt originals, and sensitive-canary redaction tests pass.
- Two Release Simulator clients authenticated as organizer and creator and each
  converged to SQLite v16, 13 findings, and the same one-row action history.
- With Backend stopped, both apps force-quit and cold-started from the embedded
  Release bundle, immediately rendering the same cached Review data without
  losing pending/conflict/durable state.
- Stage 4–7 affected regression tests pass. Existing stable financial state
  machines and Settlement/Adjustment/Payment/export lineage were unchanged.
- Leon's iPhone 16 Pro on iOS 26.6 passed Release online bootstrap, Review
  display/actions, force-quit persistence, offline cached cold start without
  Metro, retry/backoff restart, repeated background/foreground convergence,
  large Dynamic Type, long Chinese reason text, and critical VoiceOver checks.
- Final read-only device validation reported `integrity_check = ok`, SQLite v16,
  13 findings (2 acknowledged, 1 dismissed, 10 open), 3 append-only actions,
  zero duplicate actions/operation identities, and no `PENDING`, `PROCESSING`,
  or `RETRYABLE` residue. Completed operations had no residual due-time or lease.
- Financial, Settlement, Adjustment, and audit tables had zero row differences
  from the pre-action physical baseline. Three uploaded local receipt copies
  remained present because Hosted Dev returned no authenticated canonical
  content; the recovery gate correctly refused eviction.
- User-triggered count/size-only diagnostics passed schema, canary, and actual
  device-sensitive-value scans with no token, receipt/OCR content, person name,
  note, or financial amount exposure.
- Repository formatting still reports only the pre-existing unrelated
  `AGENTS.md` and `src/hooks/useStage4BPhysicalSmoke.ts` formatting debt.

## Authoritative Sources

- `docs/ledger/SETTLEMENT_2_0_FINAL_VERSION_REVISION_AND_CLEAN_TRIP_PLAN.md`
- `docs/ledger/LEDGER_UI_UX_POLISH_PLAN_V1.md`
- `docs/ledger/LEDGER_UI_UX_POLISH_P6_ACCEPTANCE.md`
- `docs/ledger/LEDGER_UI_UX_POLISH_P5_ACCEPTANCE.md`
- `docs/ledger/LEDGER_UI_UX_POLISH_P4_ACCEPTANCE.md`
- `docs/ledger/LEDGER_UI_UX_POLISH_P3_ACCEPTANCE.md`
- `docs/ledger/LEDGER_REPLAY_RECOVERY_ACCEPTANCE.md`
- `docs/ledger/LEDGER_SETTLEMENT_TEST_FIXTURE_ACCEPTANCE.md`
- `docs/ledger/LEDGER_WORKSPACE_RECOVERY_INTEGRATION.md`
- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/adr/0016-ledger-stage-8-review-and-hardening.md`
- `docs/ledger/LEDGER_2_0_STAGE_9_IMPORT_DESIGN.md`
- `docs/adr/0017-ledger-stage-9-import.md`
- `docs/adr/0018-ledger-settlement-participation.md`

## Next Checkpoint

Review the Final-version revision and clean-Trip acceptance plan. After explicit
implementation approval, execute Slice A source-selection consistency only and stop
for UI review before wiring the post-Final update action. Do not create the clean
Hosted Dev Journey until Slices A–C are ready for the full acceptance run. Do not
install another Simulator or physical-device Release without separate explicit
approval. Production remains out of scope; Stage 9 retention and rollback rules are
unchanged.

## Safety Notes

Legacy OTR Web was inspected read-only only for the Stage 9 writer semantics and
was not modified. Production extraction and mapping-only access were GET-only,
RLS-authorized, and are disconnected; their local token copies were removed.
SQLite remains the Mobile local source of truth. Pending/conflict durable
operations, receipt originals without proven canonical recovery, immutable
financial/audit/history facts, Settlement/Adjustment lineage, and required
offline exports are never cleanup candidates.

Further Stage 9 Production access is prohibited without new explicit approval.
No additional Stage 9 load or rollback is authorized. Exact Production totals
remain outside Git unless separately reviewed and approved.
