# Personal Payment FX cache and automatic conversion upgrade

Date: 2026-09-24
Status: Slice A accepted; Slice B implementation, physical-device acceptance, and the pre-checkpoint Personal Payment CREATE/edit sync-boundary fix completed on 2026-09-24. Second-account switching remains unavailable because the device has no other remembered account. Slice C has not started. Production deployment is not authorized.
Scope: Settlement 2.0 Personal Payment progress and its reference-rate presentation. Canonical Settlement calculation remains unchanged.

## 1. Executive summary

Personal Payment currently saves the user's original Money correctly, but a cross-currency record contributes to the Paid/Received progress only when the record already contains a comparable `recordedEquivalent`. Mobile can read an existing Journey rate quote, but its current read does not create a missing quote. The record therefore remains visible in its original currency while the progress total and percentage do not move. ISK is not unsupported: it is in the pinned ECB currency set and the observed ISK/CNY amount proves that a reference quote can be obtained. The missing piece is the acquisition, local-estimate, canonicalization, and refresh loop.

This upgrade adds two deliberately separate layers:

1. **Immediate local estimate.** Mobile persists a compact, account-scoped set of ECB working-day snapshots shared by all Journeys. It selects a snapshot relative to the payment economic date, derives ordinary cross-rates locally, and can show and aggregate an estimated Personal Payment immediately without waiting for a request.
2. **Server-confirmed FX projection.** When the Personal Payment syncs, Backend obtains or reuses a trusted historical quote for the payment date, calculates the comparable Money, stores immutable provenance in a target-currency projection, and returns it with the canonical record. That projection replaces the local estimate for the matching target currency.

The local estimate is a convenience projection only. It never becomes an Expense valuation, Settlement input, final balance, transfer obligation, or evidence that a bank used that rate. No manual exchange-rate entry is added.

## 2. Product outcome

- Adding USD, ISK, EUR, GBP, CNY, AUD, JPY, NZD, or another ECB-covered currency immediately updates the current user's Personal Payment progress when a usable local snapshot exists.
- Back-entering an older payment prefers the matching date or the nearest permitted previous ECB working day; it does not normally apply today's latest rate to an unrelated historical date.
- The UI never waits for a foreground provider call before accepting a payment record.
- Same-currency records continue to aggregate directly.
- A cached estimate is visibly but quietly distinguishable with the approved small status dot; normal screens do not show a leading `≈` or a long warning.
- Tapping the dot shows original Money, estimated settlement Money, reference date, source, and whether server confirmation is pending.
- Normal synchronization replaces the estimate with the server-confirmed historical equivalent and refreshes the total without a screen restart.
- Changing the Journey settlement currency preserves earlier confirmed FX evidence and creates/selects a separate projection for the new target currency.
- Offline entry remains fully available. Complete absence of a usable cache does not block saving and never causes a 1:1 conversion.
- Personal Payment progress remains separate from canonical Settlement.

## 3. Existing boundaries that remain fixed

The following approved rules do not change:

- Personal Payment records are independent assertions owned by the entering member.
- Only the viewer's own directionally relevant records contribute to that viewer's convenience progress.
- Another member's record is visible only where already authorized and never changes the viewer's progress.
- Personal Payments do not change `paidMinor`, `owedMinor`, `netMinor`, recommended transfers, settlement input digest, finalized versions, Expense valuation, or reporting truth.
- Mobile business UI uses repositories and coordinators; it does not call Supabase or Frankfurter directly.
- Original Money is always retained. No conversion may replace it.
- Money conversion uses exact decimal/integer helpers and ISO currency scale; JavaScript floating-point arithmetic is not permitted for financial values.
- A missing or unusable rate is not treated as zero or identity.
- The existing pinned source remains ECB delivered through Frankfurter. The default blended Frankfurter feed is not allowed.

ECB publishes information-only EUR reference rates on working days, normally around 16:00 CET. They are not proof of an actual card or bank conversion. See [ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html). Frankfurter exposes the pinned ECB table through `/v2/providers/ecb/rates`; see [Frankfurter ECB provider](https://frankfurter.dev/providers/ecb/).

## 4. Terminology and trust levels

| Value                           | Source                                                 | Persistence                                                       | May update progress                     | May affect canonical Settlement |
| ------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------- | ------------------------------- |
| Original Personal Payment Money | User                                                   | Personal Payment record                                           | Yes when already in settlement currency | No                              |
| Local display estimate          | Latest trusted Mobile ECB snapshot                     | Shared local FX cache; derived value may be computed in memory    | Yes, with provisional indicator         | No                              |
| Server-confirmed FX projection  | Backend historical quote for the payment economic date | Separate projection/evidence keyed by payment and target currency | Yes, preferred over estimate            | No                              |
| Accepted Expense valuation      | Existing Stage 5/Phase C flow                          | Immutable valuation evidence                                      | Not a Personal Payment input            | Yes                             |

“Canonical” in this document means canonical **for that Personal Payment record's comparable presentation**, not canonical Settlement truth.

## 5. Local ECB snapshot design

### 5.1 Do not cache every pair

Cache one ECB table with EUR as the anchor instead of an `N × N` collection of pairs. If the snapshot expresses:

- `1 EUR = rateA A`
- `1 EUR = rateB B`

then:

`1 A = rateB / rateA B`

EUR is stored or implied as exact decimal `1`. Cross-rate calculation must use the existing exact decimal Money path, not `number` multiplication/division. This makes ISK→CNY, ISK→NZD, USD→NZD, and all other covered combinations available from one small snapshot.

### 5.2 Proposed SQLite cache

Add the next available forward-only SQLite migration with a repository-owned table similar to:

| Field                | Rule                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `account_id`         | Preserve current account isolation and repository conventions.          |
| `provider`           | `ECB`; part of the key.                                                 |
| `policy_version`     | New display policy such as `ECB_LOCAL_SNAPSHOT_V1`.                     |
| `reference_date`     | Actual provider date, never the device date.                            |
| `rates_json`         | Validated map of ISO code → positive decimal string, including EUR=`1`. |
| `source_reference`   | ECB attribution URL.                                                    |
| `provider_reference` | Exact pinned Frankfurter request.                                       |
| `observed_at`        | Backend/Mobile receipt timestamp.                                       |
| `expires_at`         | Refresh/lifecycle metadata; does not erase valid historical evidence.   |

The repository retains approximately the newest **32 ECB working-day snapshots**. The payload is only dozens of decimal strings per day, while this window materially improves offline entry of older travel payments. It exposes an economic-date-aware selector such as `bestSnapshotForEconomicDate(accountId, economicDate, today)` and remains the only Mobile persistence access point.

The first implementation remains account-scoped. Although ECB rates are public, duplicating a few kilobytes is preferable to weakening the established account-switching, offline-session, and repository ownership model. Device-global public storage is explicitly deferred.

### 5.3 Freshness policy

Snapshot trust/freshness and economic-date distance are separate decisions:

1. **Trust:** the row must come from the authenticated Backend, pass the pinned ECB schema/source checks, contain positive exact decimal strings, and retain provenance. `observedAt`/`expiresAt` control refresh, not historical truth.
2. **Economic-date distance:** for a snapshot on or before the payment economic date, use `economicDate - referenceDate`. Prefer distance 0, then the nearest previous working day.
3. **Rough-latest recency:** a snapshot newer than the payment date is never considered date-appropriate. It is allowed only as an explicitly rough fallback for a payment dated today or within the previous 7 calendar days when no on/before-date snapshot exists.

Selection windows:

- **0–7 calendar days before the economic date:** date-appropriate provisional estimate.
- **8–30 calendar days before the economic date:** stale estimate only when no closer on/before-date snapshot exists; the detail sheet names its older reference date.
- **More than 30 calendar days before the economic date:** do not include it in a single-currency progress total.
- **Newer than the economic date:** never use for an older payment outside the recent 7-day entry window; within that recent window it is `ROUGH_LATEST`, not a historical estimate.
- When the latest snapshot is older than 24 hours and a normal authenticated sync is already possible, schedule a background refresh. The page does not wait for it.
- Rate refresh is deduplicated per account/provider and throttled to at most one attempt in 24 hours. Failure keeps the prior cache and follows the normal retry mechanism.

This delivers the requested “roughly weekly” resilience while preventing a recently downloaded but economically unrelated rate from appearing date-appropriate.

### 5.4 Snapshot API

Add an authenticated read endpoint, proposed as:

`GET /v2/ledger/reference-rate-snapshots?provider=ECB`

Response:

```json
{
  "provider": "ECB",
  "policyVersion": "ECB_LOCAL_SNAPSHOT_V1",
  "baseCurrency": "EUR",
  "snapshots": [
    {
      "referenceDate": "2026-09-24",
      "rates": { "EUR": "1", "ISK": "...", "NZD": "...", "CNY": "..." },
      "observedAt": "...",
      "expiresAt": "..."
    }
  ],
  "sourceReference": "https://www.ecb.europa.eu/...",
  "providerReference": "https://api.frankfurter.dev/v2/providers/ecb/rates"
}
```

Backend fetches the pinned ECB time series for the bounded working-day window, validates each response shape, ISO currency, positive decimal text, provider date, ordering, uniqueness, and provenance, then returns only validated snapshots. A fresh install therefore receives useful recent history rather than needing to accumulate 32 launches. Mobile never contacts the provider directly. Backend may keep a short in-process cache; Mobile SQLite is the durable offline cache. A server database table is not required for the first slice unless deployment topology demonstrates duplicate provider load.

The window is fixed at 32 working days. Callers cannot widen it with a date range
or count parameter.

## 6. Personal Payment conversion selection

For each viewer-owned record relevant to a transfer, select one value in this order:

1. Same-currency original Money when `record.currency === settlementCurrency`.
2. Server-confirmed FX projection whose target currency and policy match the current Journey settlement currency.
3. Local estimate derived by `bestSnapshotForEconomicDate`.
4. No comparable value.

`bestSnapshotForEconomicDate` applies this deterministic order:

1. Exact `referenceDate === economicDate`.
2. Nearest snapshot with `referenceDate < economicDate` and distance 1–7 calendar days.
3. Nearest snapshot with `referenceDate < economicDate` and distance 8–30 calendar days, classified `STALE_DATE`.
4. Only when the payment economic date is within 7 days of today and no earlier candidate exists, the newest trusted snapshot available on the device, classified `ROUGH_LATEST`.
5. Otherwise no estimate.

It never selects a provider date after today. A snapshot later than the payment economic date is permitted only in the explicit recent-payment `ROUGH_LATEST` branch and is never described as date-matched. `observedAt` recency is not economic-date suitability.

The local estimate carries:

```ts
type PersonalPaymentDisplayEquivalent = {
  money: Money;
  source: "LOCAL_ECB_SNAPSHOT";
  referenceDate: string;
  observedAt: string;
  match: "EXACT_DATE" | "PREVIOUS_WORKING_DAY" | "STALE_DATE" | "ROUGH_LATEST";
  economicDistanceDays: number;
};
```

This is a presentation type, not a persisted Personal Payment field and not a sync payload. Reopening the app deterministically recomputes it from original Money plus the cached snapshots. `personalPaymentProgress` should accept comparable values already selected by a focused helper rather than learn network or repository behavior.

## 7. Server-confirmed Personal Payment FX

### 7.1 Projection/evidence model

The existing Personal Payment row has only one set of `recordedEquivalent*` and reference fields. Overwriting those fields cannot preserve evidence across Journey settlement-currency changes such as NZD → CNY → USD. Before Slice C, introduce an explicit logical and physical projection model rather than claiming that overwritten fields are historical evidence.

Proposed Backend table:

`personal_settlement_payment_fx_projections`

| Field group   | Required content                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity      | `id`, `payment_id`, `journey_id`, `target_currency`, `target_scale`, `policy_version`; unique active projection per payment + target currency + policy. |
| Input binding | Original currency/scale/amount digest, payment economic date, source payment revision used to calculate it.                                             |
| Result        | Positive `equivalent_minor`, target Money, exact `decimal_rate`.                                                                                        |
| Evidence      | `rate_quote_id`, economic date, actual reference date, provider, provider/source references, fallback classification.                                   |
| Lifecycle     | revision/timestamps, active/superseded status, resolver operation ID, audit linkage.                                                                    |

The Personal Payment row remains the owner-controlled original assertion. FX projections are Backend-derived evidence and are not writable by Mobile. Projection updates do not overwrite another target currency: when the Journey changes from NZD to CNY, the NZD projection remains readable and a CNY projection is created or selected.

Mobile receives authorized projections through create/update responses, list/bootstrap, and change feed, and mirrors them in a focused SQLite projection table keyed by payment + target currency + policy. Convenience progress selects only the projection matching the current Journey settlement currency. The existing single equivalent/reference columns remain read compatibility inputs during migration, are imported into a projection only when complete and valid, and are not the source of truth after cutover.

### 7.2 Mutation behavior

Extend the existing create/update Personal Payment Backend path:

1. Authenticate owner and validate Journey/counterparty exactly as today.
2. Preserve original Money and `occurredAt`.
3. For same currency, store the identity comparable Money without provider evidence.
4. For cross currency, resolve the existing `ECB_DAILY_V1` historical request using the payment date, pair, and Journey settlement currency.
5. Reuse a fresh matching `ledger_rate_quotes` row or the existing `fetchTrustedRateQuote` provider path.
6. Calculate the equivalent with the shared exact Money conversion.
7. Store equivalent Money, decimal rate, actual reference date, source, provider URL, quote identifier/policy, and fallback classification in the matching FX projection.
8. Return the resulting Personal Payment plus authorized FX projections; Mobile applies the response and immediately replaces any local estimate for the matching target currency.

Backend must immediately ignore client-submitted equivalent/reference fields and recompute trusted projections. Do not carry a compatibility release unless inspection proves that an already deployed supported client requires it. The revised create/update contract should carry original user-entered Money only; projections are response/read fields.

### 7.3 Publication and weekend policy

- A historical weekend/TARGET closing-day payment may canonically use the provider's previous working-day rate when it is within the existing seven-calendar-day policy. This is already represented by separate economic and reference dates.
- For **today before ECB publication**, the previous snapshot may drive the local estimate, but it is not silently accepted as final historical evidence. Backend keeps canonical equivalent pending and retries after publication.
- Once the requested day's quote becomes available, Backend supplies the confirmed target-currency projection. This preserves the existing B2 evidence boundary while avoiding an empty UI.

### 7.4 Pending acquisition and retry

The Personal Payment mutation must never fail solely because a reference provider is offline or has not published today's rate. It persists the original record, returns it without a confirmed target-currency projection, and creates/reuses a bounded demand keyed by:

`economicDate + originalCurrency + settlementCurrency + policyVersion`

Extend the existing lease, negative cache, retry categories, and periodic scanner rather than adding a second worker. When a quote becomes available, a guarded resolver:

- locks and rereads the current Personal Payment revision;
- verifies the original currency/date and Journey currency still match the demand;
- computes and stores the matching target-currency projection;
- increments the projection revision and writes audit/change feed once without rewriting the owner-controlled Personal Payment revision;
- is idempotent on replay;
- aborts cleanly if the user edited or deleted the record.

Mobile pull then replaces its estimate. Concurrent offline user edits continue through the existing revision/conflict behavior; no background resolver may overwrite changed original Money.

## 8. Existing-record backfill

After deployment, scan active cross-currency Personal Payments that lack a projection for the current Journey settlement currency and policy.

- Group identical date/pair/policy demands.
- Use the normal lease and retry system.
- Resolve in bounded batches.
- Never rewrite original Money, owner direction, note, attachment, or occurred time.
- Emit one projection revision/audit/change entry per successfully enriched payment/target pair without changing the user-owned payment revision.
- Import complete valid legacy `recordedEquivalent*` evidence into the corresponding target-currency projection once; never infer missing provenance.
- Leave unsupported or older-than-policy records intact and readable in original currency.
- Do not touch legacy `settlement_payments`, transfer discharges, or finalized Settlement data.

This backfills the USD/ISK records already visible in test Journeys without requiring delete/re-entry.

## 9. UI behavior

### Payment row and progress

- Confirmed comparable value: normal `Received/Paid amount · percentage`.
- Local estimated value: include it in the total and show one small colored dot beside the progress value.
- No usable comparison: keep the original timeline entry; omit it from the comparable sum and show a dot on the progress line only when at least one relevant record is waiting.
- Do not show raw `≈`, provider enum, retry status, or error message in normal mode.

### Dot detail sheet

The sheet lists affected records so the user can understand the estimate without manually entering a rate:

- original amount and currency;
- estimated settlement-currency amount;
- rate reference date;
- ECB source attribution;
- `Waiting for today's published reference rate` when applicable;
- `No supported reference rate` only for a genuine provider coverage failure.

Offline/cache age and raw provider errors remain Debug-only according to the previously approved visibility rules.

## 10. Failure matrix

| Situation                                    | Immediate UI                                                       | Persist/sync behavior                   | Later behavior                           |
| -------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- | ---------------------------------------- |
| Same currency                                | Exact progress update                                              | Normal record                           | No FX work                               |
| Cross currency, confirmed projection present | Exact progress update                                              | Normal record                           | No estimate used                         |
| Cross currency, recent local snapshot        | Immediate provisional progress + dot                               | Save original locally; normal queue     | Replace with confirmed projection        |
| Offline, snapshot 8–30 days old              | Provisional progress + stale detail                                | Save original locally                   | Refresh then confirm                     |
| Offline, no usable snapshot                  | Original record, pending dot, no false total                       | Save original locally                   | Resolve after reconnect                  |
| Today not yet published                      | Previous snapshot estimate + dot                                   | Backend records pending demand          | Confirm after publication                |
| Weekend/ECB holiday                          | Previous working-day quote                                         | Backend may confirm within 7-day policy | Stable unless source correction          |
| Unsupported currency                         | Original record only                                               | Backend classifies `UNSUPPORTED`        | Retry by existing policy; no manual rate |
| Temporary provider/API failure               | Cached estimate remains                                            | Original record remains valid           | Retry without duplicate payment          |
| Journey settlement currency changes          | Old target projection retained but not summed against new currency | Request new target projection           | New matching projection wins             |

## 11. Implementation slices

### Slice A — contracts and local snapshot cache

- Freeze snapshot schema and freshness rules in `docs/API_CONTRACT.md`, `docs/OFFLINE_SYNC.md`, and the relevant Ledger FX ADR.
- Add Zod contracts and exact-decimal validation.
- Add SQLite snapshot migration/repository, 32-working-day retention, account isolation, and tests.
- Add Backend snapshot endpoint using the existing provider boundary.

### Slice B — immediate Personal Payment estimates

- Add a pure cross-rate selector/converter using existing Money helpers.
- Load the snapshot through `useSettlementSections` or a data-layer hook; feature UI remains persistence-free.
- Extend Personal Payment progress to prefer the matching confirmed projection and otherwise use the economic-date-aware local estimate.
- Add the status dot and detail list.
- Confirm that same-currency behavior and Everyone visibility remain unchanged.

### Slice C — authoritative mutation and retry

- Add Backend/Mobile Personal Payment FX projection contracts and persistence; stop trusting client-derived equivalents.
- Extend rate demands/scanner and guarded resolver for missing Personal Payment FX.
- Return canonical enriched records through create/update/list/change feed.
- Ensure sync response/pull updates parent Payments state without a restart.

### Slice D — backfill and acceptance

- Run bounded Dev backfill for existing foreign Personal Payments.
- Verify USD, ISK, zero-scale currencies, weekend dates, current-day publication waiting, offline restart, reconnect, idempotency, and concurrent edit.
- Update `docs/CURRENT_IMPLEMENTATION_STATE.md` only after implementation and acceptance.
- Production remains excluded until a separate release approval.

## 12. Expected files and migrations

Likely Mobile changes:

- `src/data/api/ledgerReadContracts.ts`
- `src/data/sync/ledgerReadTransport.ts`
- `src/data/db/migrations.ts`
- a focused repository/operation beside the existing Ledger rate-quote cache
- `src/features/ledger/personalPaymentFx.ts`
- `src/features/ledger/settlementSections.ts`
- `src/features/ledger/PersonalPaymentSection.tsx`
- `src/hooks/useSettlementSections.ts`

Likely Backend changes:

- `backend/src/frankfurterRateProvider.ts`
- `backend/src/rateQuoteProvider.ts`
- `backend/src/app.ts`
- `backend/src/supabaseGateway.ts`
- one forward-only Supabase migration for Personal Payment FX projections plus demand/resolution/backfill support
- focused Backend and pgTAP tests

Reuse existing helpers and tables where their semantics fit. Do not add a new dependency, ORM, background framework, or second provider in this upgrade.

## 13. Required tests and acceptance gate

Automated coverage must include:

- exact snapshot parsing and rejection of blended/wrong-provider/wrong-base/malformed data;
- cross-rate direction for ISK→CNY, ISK→NZD, USD→NZD, and EUR on either side;
- ISO scales including ISK/JPY scale 0 and ordinary scale 2;
- deterministic integer rounding and overflow rejection;
- economic-date selection order, including exact, previous working day, stale-date, recent-only rough-latest, and no-match cases;
- independent cache trust/refresh and economic-distance boundaries at 7 and 30 days;
- matching confirmed projection precedence over local estimate;
- same-currency immediate update;
- estimate inclusion once and projection replacement without double counting;
- offline create/restart/reconnect;
- current-day pre-publication retry and weekend fallback;
- unsupported versus temporary failure classification;
- existing-record/projection backfill idempotency;
- NZD → CNY → USD Journey-currency changes preserving all prior target projections while selecting only the current target;
- edit/delete racing a resolver;
- account/Journey isolation and outsider Everyone visibility;
- unchanged canonical Settlement preview/digest/final values before and after all Personal Payment FX activity.

Device acceptance requires at least:

1. Fresh online snapshot, then physical-device offline restart.
2. Add USD and ISK Personal Payments offline and observe immediate provisional progress.
3. Reconnect and observe automatic confirmed replacement without duplicate records.
4. Repeat on iPhone 17 Pro Simulator.
5. Verify source detail, stale-cache detail, and Debug-only diagnostics.

The upgrade passes only when the UI responds immediately from cache, server confirmation converges automatically, and canonical Settlement remains byte-for-byte unaffected.

## 14. Review decisions incorporated

This revision treats the following as fixed implementation-plan requirements:

1. Snapshot selection is economic-date-aware and does not normally apply the latest rate to an older payment.
2. Local retention is approximately 32 ECB working-day snapshots.
3. Provider/cache trust, refresh age, and distance from the payment economic date are evaluated separately.
4. The first implementation remains account-scoped; device-global persistence is out of scope.
5. Confirmed values use a multi-target Personal Payment FX projection/evidence model. Journey currency changes do not overwrite prior target evidence.
6. Backend ignores and recomputes client-derived equivalent/reference fields immediately unless a concrete supported-client compatibility requirement is proven before Slice C.
7. Original Money remains owner-controlled; provider failure never blocks creation; no identity fallback or floating-point Money math is allowed; estimates never enter canonical Settlement; resolver writes are revision-guarded and idempotent.

## 15. Final implementation decisions

The final review approved these remaining choices:

1. `ROUGH_LATEST` remains available for payments dated within the previous 7 calendar days.
2. An 8–30-day on/before-date `STALE_DATE` estimate remains available as the last provisional fallback with a progress-line dot.
3. The projection business table keeps one current row per payment + target currency + policy; existing audit/change history preserves prior states instead of making the business table fully append-only.
4. The authenticated API returns a bounded 32-working-day snapshot bundle rather than exposing a caller-defined date range.
5. A valid confirmed projection is stable and is not automatically rewritten after later provider corrections. Invalid/corrupt evidence uses an explicit correction path.
6. The provisional indicator appears only on the affected transfer/progress line, not on the Payments tab.
7. A Journey settlement-currency change does not make an otherwise valid old-target projection invalid. If the underlying payment input changed, the demand is invalid and the resolver aborts. If only the Journey target changed, an already-started old-target projection may complete and remain as history while a new current-target demand is created. Cancelling an unstarted obsolete demand is optional provider-work optimization, not a correctness rule.

Implementation starts with Slice A only. Slice B does not begin until Slice A contracts, cache, endpoint, automated checks, and acceptance report pass. No Production environment is in scope.
