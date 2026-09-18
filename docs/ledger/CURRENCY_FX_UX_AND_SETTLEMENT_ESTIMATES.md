# Currency / FX UX and Settlement Estimates

Date: 2026-09-18. Scope: post-Phase-E display and foreground orchestration. Phase F and Production are excluded.

## Two boundaries

Accepted Journey values are canonical: Stage 5 freezes provenance, allocations,
revision and audit. Only those values enter reporting truth, Review evidence,
final settlement inputs, digest, exports and obligations. A display estimate is
computed from authorized local cache in memory and is never an Expense mutation,
stored valuation, audit event or settlement input. It always carries `≈`.

For an unresolved cross-currency Expense, use an exact matching trusted B2
candidate first, then the most recent trusted cached quote for that original→
Journey pair. A confirmed `economic_date` is required even for a display
estimate; a proposed legacy date is not replaced with the current day. The
reference date must not be after that confirmed date. Display estimates accept at most 30
calendar days of age. Preserve source and direction validation, candidate cache
expiry and exact decimal Money conversion. An accepted valuation wins. No new
provider or speculative cross-rate is needed.

## Presentation

Detail, list and display-only spending totals can combine accepted values and
marked estimates. Missing estimates show a quiet unavailable state. A synced
Expense with a trusted display estimate says “Estimated”, not “Updating…”;
same-day publication waiting is secondary context. “Updating…” is reserved for
an actual pending local write/sync, while missing or unusable reference evidence
remains distinct from accepted valuation. The reference default is per Expense;
manual/payer-cost evidence, conflicts, missing dates and finalization receive
their own user actions. Rate details name the current policy without exposing
enums, and retain explicit Stage 5 preview/confirm/supersession actions.

Legacy `occurred_at` may propose an ordinary Expense date. Opening or cancelling
does not populate `economic_date`; Save confirms the shown/changed calendar day
through the audited update. Truly absent dates require Add date.

## Settlement

The offline-capable estimated preview uses cached, account/Journey-scoped
Expenses, member allocations, accepted values and display estimates to show
approximate balances and transfers. It is informational only, not a server
SettlementPreviewResponse and never finalizable. Missing estimates are explicit
blockers rather than silently treated as zero.

Opening Settlement requests a bounded foreground preflight on Hosted Dev for
the selected Journey. It reuses the B2 lease/cache and Phase C acceptance path,
without replacing valid manual/payer evidence or bypassing conflict/finalized
guards. A fresh pull recomputes the display preview. Finalize runs preflight
again, obtains a new authoritative server preview/digest, and may proceed only
when canonical readiness is satisfied; changed inputs require user review and
stale digests remain rejected by Stage 7. The Dev-only service-role migration
`20260918000300` adds a Journey-filtered claimant and Phase C selector;
`20260918000400` limits foreground priority to included Expenses. Both
sharing existing rate-attempt leases/negative cache. At most four pair claims
and four acceptances are processed per request, with eight foreground batches
as a ceiling; larger Journeys can retry without bypassing the normal scanner.
`20260918000600` adds a service-role-only, Journey-scoped explicit retry for
same-day `NOT_YET_AVAILABLE` attempts. Only the first batch of a deliberate
preflight bypasses that pair's one-hour negative-cache wait; the normal scanner
still uses the shared lease and hourly publication retry. Pending publication
is returned separately from terminal provider unavailability. Estimated
preview remains informational; Finalize repeats canonical preflight and blocks
with plain publication-waiting copy while an input is only estimated.

Offline preview can reuse trusted local rates within the display window. Offline
finalization and authorization requirements do not change. No schema or
financial contract is weakened by the display projection.

## Acceptance (2026-09-18)

**PASS WITH DEVICE ACCEPTANCE PENDING.** Phase E retains the same separate
classification. Neither Production nor Phase F was touched.

| Check | Result / evidence |
| --- | --- |
| TypeScript, ESLint, Backend build, application and database tests | PASS: 83 files/331 application tests and 17 files/312 pgTAP tests; local migration-up/reset passed. |
| Hosted Dev Backend and migrations | PASS: source/runtime hash match, health `ok`; `20260918000300_ledger_settlement_fx_preflight.sql` precedes `20260918000400_ledger_settlement_fx_included_only.sql`, both applied to Hosted Dev, zero pending Dev migrations. |
| Approximate Expense display, Ledger list and Mine/Group total | PASS: signed iPhone 17 Pro Simulator displayed `≈` on eligible cached ISK/NZD values and totals; stale NOK and unconfirmed dates did not acquire estimates. |
| Settlement blocker direct navigation and Check again | PASS: blocked Stage 7.1 preview opened its Expense; returning showed Check again. Cancelling Edit did not populate the proposed `economic_date`. |
| Foreground canonical resolution and restart/idempotency | PASS: normal-UI 2026-09-16 ISK Expense advanced to accepted ECB reference €7.15 on opening Settlement; repeat install/restart retained exactly one active and one total valuation. No final settlement was created. |
| Signed simulator launch | PASS: latest signed Release installed over both iOS 26.5 Simulators without clearing data and launched. |
| True offline cold start and simulator offline/reconnect preview | PENDING: Settings exposed no reliable Wi-Fi/airplane control, Device Hub had no network menu, and the Control Center gesture failed. No network setting was changed. |
| Multi-member recent-cache estimate | PENDING: Device Hub date wheel could not select the cache-supported historical date. The new two-participant Sep 18 QA Expense received `NOT_YET_AVAILABLE` from ECB and the July cache is older than 30 days, so correctly displays `—`. |
| Full batch foreground FX convergence through normal UI | PENDING: the same date-wheel limitation prevented preparing multiple eligible dated Expenses together; single-Expense preflight and bounded batch tests passed. |
| Physical iPhone interaction | PENDING: Device Hub/iOS 26.6 interaction limitation prevented reliable acceptance. |

An Expense with genuinely no proposed date has an Add date action covered by
focused logic/repository tests; the available device fixture already has a
proposed date, so that exact UI branch was not marked as device PASS.
