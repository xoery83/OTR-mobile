# Current Implementation State

Date: 2026-09-23

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
