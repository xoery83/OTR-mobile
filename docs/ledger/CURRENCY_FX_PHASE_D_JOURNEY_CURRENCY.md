# Currency / FX Phase D — Journey Currency change

Status: implemented and validated on Hosted Dev. Phase E/F and Production deployment remain outside this phase.

## Phase D Acceptance Closure

The first QA Journey fixture had no start/end dates, so the standard picker classified it as neither current nor past. A second gap was real: My Ledger could discover an authorized new Journey but cached only its summary, while the picker requires a bootstrapped actor and member projection. `refreshMyLedger` now bootstraps newly discovered Journeys after caching their summaries. Bootstrap writes are sequential because concurrent SQLite bootstrap transactions caused a rollback on the first Simulator run. A regression test covers discovery and serialized writes. No schema or Backend change was required.

The signed iPhone 17 Pro Simulator selected the dated, owner-linked Dev QA Journey through the standard picker. Its NZD→EUR preview showed 3 affected Expenses, 1 same-currency candidate, 2 historical reference candidates, 0 missing dates, 0 missing quotes, 0 manual/payer-cost/other policy items, 0 conflicts, 0 expected unresolved, and 0 finalized settlements. UI Confirm succeeded. Hosted Dev revision advanced 1→2 with currency EUR, scale 2; one Journey currency audit entry, one change-feed entry and one successful idempotency receipt were recorded. EUR 100 remained original EUR 100 and became `SAME_CURRENCY` EUR 100.00; ISK 10,000 remained original and became `REFERENCE_RATE` EUR 69.60; NZD 100 remained original and became `REFERENCE_RATE` EUR 50.49. Both cross-currency rates use economic date 2026-07-12 and ECB's actual 2026-07-10 reference. Their old NZD snapshots remain inactive historical evidence, new snapshots supersede them, settlement splits are EUR, and no active NZD valuation remains.

After installing the corrected signed build over the app and cold restarting without clearing data, Mine and Group each showed EUR 220.09 across 3 valued Expenses. Category, Analysis category/payer/participant and settlement preview agreed; settlement said no transfers were needed and was not finalized. Review refreshed to 0 pending, 0 reviewed, 0 history; canonical QA Journey had no Findings, so retention of preexisting ACK/Dismiss state was not exercised by this fixture. A separate finalized Journey showed a disabled Journey Currency control with its permanent-lock explanation; local pgTAP verifies the Backend `JOURNEY_CURRENCY_FINALIZED_LOCK` rejection. Offline currency-change behavior remains pending because reliable Simulator network control was unavailable. Physical iOS 26.6 interaction remains pending due Device Hub support. The traceable Hosted Dev QA fixture remains because financial history is append-only and safe cleanup would require bypassing its guards. Production was not touched.

Closure gates: TypeScript, ESLint, Backend build, 79 Mobile test files/310 tests, local Supabase reset, 16 pgTAP files/301 checks, and touched-file formatting passed. Classification: **PASS WITH DEVICE ACCEPTANCE PENDING**.

## Product states

Journey Currency is `ledger_settings.settlement_currency`, with the ISO scale. With no Expenses, the same preview/commit command applies. With Expenses and no finalized settlement, the command may replace active settlement valuations while retaining original Money and historical evidence. An ephemeral settlement preview must be abandoned and rebuilt before confirmation. Any persisted finalized settlement, including later paid, adjusted or superseded history, locks the Journey Currency permanently. There are no currency epochs.

## Preview and confirmation

The server preview returns current/proposed currency and scale, settings revision, a digest of Expense revisions, active valuation policies, relevant quote revisions and settlement state, counts for same-currency identity, reference candidates, missing economic dates/quotes, manual agreement, actual payer cost, conflicts and expected unresolved Expenses. Totals are unavailable if required rates are missing. Confirmation sends that digest, base settings revision and an idempotency key; the server rechecks all inputs and authorization under the Journey settings lock. Any mismatch requires a new preview.

## Policy matrix

| Existing active policy                                          | New active state                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Any policy, original currency equals new Journey Currency       | New `SAME_CURRENCY` identity from original Money; prior evidence remains historical.                                           |
| `REFERENCE_RATE`, cross-currency, eligible historical candidate | New accepted `REFERENCE_RATE` from original Money and `economic_date`; superseding snapshots.                                  |
| `REFERENCE_RATE`, missing date or quote                         | `RATE_REQUIRED`; no active old-currency valuation.                                                                             |
| `SAME_CURRENCY`, original differs from the new currency         | Eligible historical `REFERENCE_RATE` from original Money; otherwise `RATE_REQUIRED`.                                           |
| `MANUAL_AGREED`                                                 | `RATE_REQUIRED` pending explicit review; never silently substitute a reference rate.                                           |
| `ACTUAL_PAYER_COST`                                             | `RATE_REQUIRED` pending explicit review, even if a posted record happens to use the new currency.                              |
| `LEGACY_IMPORTED` or unknown policy                             | `RATE_REQUIRED` pending explicit review.                                                                                       |
| `RATE_REQUIRED`                                                 | Identity if now same currency, otherwise reference candidate only when an explicit economic date exists; otherwise unresolved. |

Missing `economic_date` is surfaced as `ECONOMIC_DATE_REQUIRED`; `occurred_at` is never substituted. A quote is eligible only under the approved Phase B2/Phase C source, date, direction and freshness rules. Candidate changes never alter accepted history.
Manual, payer-cost and imported policies receive a revision-scoped `SEMANTIC` automatic-valuation block when unresolved, so the Phase C scanner cannot silently replace them later.

## Atomic visibility and offline behavior

The command must update settings, deactivate old valuations, create new snapshots, replace active settlement splits, revise Expenses, write audit/change-feed records and the idempotency receipt inside one PostgreSQL transaction. Readers see either the old committed state or the new committed state. A command failure rolls the entire transaction back. Mobile pulls the changed settings and Expenses in one SQLite transaction before exposing the new currency. Offline selection is an intent only; the financial setting stays unchanged until a new online preview is confirmed and committed. No automatic stale offline confirmation is allowed.

## Reporting, Review and settlement

Current reports consume the new active valuations and settlement splits. Unresolved Expenses have no converted total. Historical/finalized exports remain unchanged. Review recomputes findings after the committed batch and retains old generations and personal ACK/Dismiss history. An ephemeral settlement preview is stale after settings revision or Expense revision changes; the user must request a new one. The permanent finalized lock is checked again inside commit.

## Compatibility and rollback

Dev migrations `20260917000600` and `20260917000700` are forward-only; the latter fixes a PL/pgSQL output-column ambiguity in preview quote claiming found during Simulator validation. No SQLite migration is needed because the client does not persist an offline intent or a duplicate settings revision. Older Mobile builds must bootstrap a complete Journey snapshot before displaying changed currency; partial change-feed application is forbidden. Rollback is a new, explicit currency-change command where permitted, never deletion or editing of historical snapshots. Production remains untouched.
