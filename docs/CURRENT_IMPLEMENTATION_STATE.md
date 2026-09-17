# Current Implementation State

Date: 2026-09-17

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

Stop after canonical integration, static validation and commit. Do not install a
Simulator or physical-device Release without separate explicit approval. Do not begin
Round 2 Polish, Production planning or deployment. Stage 9 retention and rollback
rules remain unchanged.

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
