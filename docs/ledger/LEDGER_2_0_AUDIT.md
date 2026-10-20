# Ledger 2.0 Legacy Audit

Date: 2026-09-11

## Purpose And Scope

This document audits the complete Ledger surface in the read-only legacy OTR
Web repository at `/Users/xoery/Project/otr` and compares it with the approved
OTR Mobile architecture and the Phase 2A/3B Expense vertical slice. It is an
input to a redesign, not a requirement to preserve the legacy schema or UI.

No legacy code, database, hosted Supabase project, or Mobile feature code was
changed during this audit.

## Executive Assessment

The legacy Ledger contains useful travel-domain learning but is not a safe
foundation to port directly.

- It models one payer, many Journey members, original/base currency, a Journey
  exchange-rate snapshot, links to itinerary/reservations/memory/place, and a
  client-side settlement suggestion.
- The schema advertises equal, custom-amount, and percentage splits, but the
  actual Web create/edit flow only produces equal splits. Editing deletes all
  participant rows and recreates equal rows.
- Expense creation, participant creation, updates, and deletes are separate
  browser-to-Supabase operations. They are not atomic and are not offline-safe.
- Money is converted to JavaScript `number`, rounded with `toFixed(2)`, and
  accumulated in floating point. Equal-share rounding can leave residual cents.
- Settlement records exist in SQL but the Web product does not create, confirm,
  pay, reconcile, or export them. Suggested transfers are recalculated in the
  browser and are not durable.
- Database RLS and Web UI authorization disagree. RLS lets an owner/admin edit
  an entry, while the client-side guard says only the creator can; participant
  row mutation is broadly available to any Journey member.
- Currency fallback rates are hard-coded estimates and a base-currency change
  destructively rebases historical converted amounts and participant shares.
- There is no immutable expense revision, financial audit history, conflict
  model, idempotent update/delete contract, or final statement.

The redesign should retain the useful concepts, replace the transaction and
precision model, and keep Supabase behind the OTR Backend API.

Real Europe-trip evidence adds four gaps that the legacy model cannot represent
safely: merchant amount versus actual payer posted cost versus agreed group
value; household/child shares; receipt-first evidence capture; and collaborative
correction without broad direct mutation authority.

## Source Inventory

Primary legacy sources:

- `supabase/migrations/020_journey_ledger.sql`
- `supabase/migrations/042_journey_exchange_rate_snapshots.sql`
- `supabase/migrations/043_place_resolution.sql`
- `src/lib/supabase/ledger.ts`
- `src/app/trips/[tripId]/ledger/page.tsx`
- `src/lib/exchange-rates.ts`
- `src/lib/ledger/date-allocation.ts`
- `src/types/index.ts`
- `src/components/CaptureModalProvider.tsx`
- `src/lib/capture-ai/actions.ts`
- `src/lib/capture2/journey-query.ts`
- `src/app/trips/[tripId]/planner/import/page.tsx`
- `src/app/trips/[tripId]/settings/page.tsx`
- `src/lib/supabase/trips.ts`

Ledger data is also read by Story recommendation, poster, Memory Shot, place
resolution, profile, planner, and Journey settings code. Those consumers show
that Ledger became a shared data source, but they must not dictate Mobile UI.

## Database Tables And Relationships

### `journey_ledgers`

One row per `trips.id` (`unique(journey_id)`). It stores:

- base and display currencies;
- snapshot date/source;
- one-time refresh timestamp, actor, and refresh count;
- created/updated timestamps.

A Journey ledger is normally created alongside a trip, with currency inferred
from destination text and an NZD fallback. `ensureJourneyLedger()` also lazily
creates a missing row with NZD.

### `ledger_entries`

The expense header references:

- required Journey (`trips`, cascade delete);
- optional itinerary event and reservation (set null);
- optional memory entry (set null);
- optional payer and creator Journey members (set null);
- optional creator profile (set null);
- optional resolved place (set null).

It contains title, description, category, accounting mode, expense/range dates,
original amount/currency, converted base amount/currency, rate/date/source,
location text and geocoding metadata, status, and timestamps.

The later place migration duplicates legacy location fields (`address_text`,
`latitude`, `longitude`, `location_source`) with a richer location-resolution
set. The Web Ledger mapper still reads only the older fields.

### `ledger_entry_participants`

Each row links one expense to one Journey member. The pair is unique. It stores
`split_method`, optional amount/percentage input, and a computed base-currency
share. Deleting an expense cascades to these rows.

### `journey_exchange_rates`

One mutable Journey snapshot row per Journey/base/quote currency tuple. It
stores the quote-to-base rate, date, source, and timestamps.

### `ledger_exchange_rates`

A global rate table keyed by from/to/date/source exists in the schema. The
current Ledger TypeScript module does not use it. Any authenticated user may
read and insert rows under the legacy policies.

### `ledger_settlements`

Stores Journey, from/to members, amount, currency, status (`suggested`,
`confirmed`, `paid`), notes, and timestamps. There is no unique/idempotency key,
payment evidence, expense-set snapshot, revision, or client code that uses it.

## Current Expense Fields

The Web form exposes title, category, original amount/currency, expense date,
optional start/end dates, accounting mode, payer, selected participants,
location text, and notes. The underlying input type can also accept itinerary,
reservation, and memory links, but the main Ledger form does not expose those
links.

Categories are fixed to flight, hotel, car, fuel, food, ticket, shopping,
transport, insurance, and other. Status can be draft, complete, or needs review.
The normal form requires a payer and at least one participant, so it generally
creates complete entries.

The Mobile Phase 2A/3B slice intentionally implements only local/server ids,
Journey, title, integer minor-unit amount, currency, optional payer, occurrence
time, timestamps, sync status, and version. It is validation scaffolding, not
the final Ledger model.

The current Dev backend maps that narrow command into a legacy
`ledger_entries` row with base currency equal to original currency,
`exchange_rate = 1`, and no participant rows. This was sufficient to prove
Auth, idempotency, queue durability, and reconciliation. It is not valid
multi-currency or settlement behavior and must be replaced by the aggregate
contract before broader Ledger use.

## Payer And Participant Model

- Exactly one payer is represented by nullable `payer_member_id`.
- Only active owner/group-member Journey members appear in the Web selectors;
  guests are excluded.
- New Web forms preselect all active members as participants.
- Changing payer seeds that payer as participant only when no participants are
  selected. A payer is not otherwise required to participate in the split.
- If lower-level callers omit participants for a shared expense, the data module
  silently uses the payer as the sole participant.
- Unlinked Journey members can participate because splits reference membership
  records rather than Auth users. This is worth retaining.

There is no household/family entity, participant preset, exclusion reason,
multi-payer support, or participant membership snapshot.
There is also no way to preserve household/member-share input while resolving
the final allocation to exact Journey-member minor units.

## Split Logic

The database and TypeScript types define:

- equal;
- custom amount;
- custom percentage.

Actual Web create/update behavior always writes `equal`. It divides the rounded
base amount by participant count, rounds each share to two decimals, and writes
the same value for every participant. It does not allocate the residual cent,
so participant shares need not sum exactly to the expense.

The read/preview/rebase paths contain branches for custom amount and percentage,
but no current Web form captures those inputs. On edit, all participant rows are
deleted and recreated as equal, which destroys any custom rows created by other
means. This is latent schema support, not a complete feature.

`stats_only` entries contribute to reports but not shared balances. This is a
useful distinction in some reports, but its name and user purpose are unclear
and it should not be carried forward without a concrete product case.

## Exchange-Rate Behavior

`getApproxExchangeRate()` calls Frankfurter directly from the Web application.
If unavailable, it uses a hard-coded table of approximate rates relative to NZD
and cross-converts through NZD. The returned rate is persisted with date and
source in a Journey snapshot row and copied onto each expense.

Important behavior and risks:

- A cached Journey pair is reused indefinitely unless explicitly refreshed.
- Owners may refresh Journey rates once; the one-refresh rule is a product
  convention, not a financial invariant.
- Same-currency rates are one.
- The expense form displays a rate but does not offer a manual override.
- The caller supplies `exchangeRate`, but create/update ignores that value and
  resolves the Journey rate again.
- Changing Journey base currency fetches rates and rewrites all historical
  expense base amounts and computed participant shares in many sequential
  Supabase calls. Failure can leave a partially rebased Ledger.
- A custom-amount participant is rebased by its prior ratio rather than by a
  preserved original-currency allocation.
- Historical meaning can change after a base-currency update; there is no
  immutable conversion snapshot revision or audit event.
- Merchant amount, bank/card posted amount, explicit fees, and group settlement
  valuation are collapsed into the entry's original/base amount and one rate.
  The schema therefore cannot explain a legitimate difference between actual
  payer cost and an agreed fair Journey valuation.

## Settlement Model

Balances are calculated client-side:

`balance = shared amount paid - shared amount owed`

The suggestion algorithm sorts creditors and debtors by absolute balance and
greedily matches the largest values. It is deterministic only to the extent
input ordering and equal values are stable. It is duplicated in both the data
module and the page preview.

The Settlement tab shows balances and suggested transfers. It does not persist
the plan, mark a transfer paid, account for a real repayment, lock a statement,
or export/share it. `ledger_settlements` is therefore unused schema, not an
implemented settlement lifecycle.

## Permissions

Legacy database policy intends:

- Journey members can read/create Ledger entries;
- entry creators or Journey owner/admin can update/delete entries;
- Journey members can read/create/update/delete participant rows;
- Journey members can read/create/update settlement rows;
- only Journey owner/admin can update Journey Ledger settings/rates.

Legacy browser logic additionally blocks edit/delete unless current user/member
matches the entry creator. It does not recognize owner/admin authority. This
causes inconsistent behavior between UI, direct API use, and RLS.

The participant policies are too broad: any Journey member can mutate the split
rows of another creator's expense even when they cannot update the header. The
global exchange-rate insert policy is also broader than required. Ledger 2.0
must authorize a complete aggregate server-side and never rely on UI guards.

## Create, Edit, And Delete Behavior

Create is a browser insert of the expense followed by a second insert of
participant rows. A participant failure leaves an expense header behind.

Edit updates the header, deletes all participants, then inserts replacements.
These calls are not a server transaction. A failure can leave old/new header
and split data inconsistent or leave no participants. Editing also resets
resolved location metadata and custom split semantics.

Delete is a hard delete after a browser confirmation. There is no tombstone,
undo period, audit event, offline delete, or conflict check. Cascading deletes
remove participant rows. Creator/owner authorization differs as described
above.

## Links And Enrichment

- Itinerary and reservation links can supply date ranges for daily allocation.
- Memory linkage exists as a nullable foreign key but is not surfaced by the
  main form.
- Place resolution can attach structured place/geocoding metadata later.
- Capture and planner import can create expenses and attach itinerary or
  reservation ids.
- There is no first-class receipt/document relation. Media is not directly
  linked to an expense, and the memory link is not an adequate replacement.
- There is no PaymentRecord for authorization/posted evidence and no independent
  receipt upload/OCR lifecycle.
- Expense data is consumed by Story/poster/recommendation features. Mobile
  Ledger should expose privacy-safe backend projections rather than inherit
  those direct reads.

## Export And Reporting

The Web page provides four views: Expenses, Days, People, and Settlement. It
supports search, category filtering, needs-review filtering, category totals,
day allocation, per-member/category reports, and heuristic audit warnings for
coverage/outliers/unassigned entries. These are useful product signals but are
client-side heuristics without immutable finding identity, detector version,
acknowledgement, or a hard boundary preventing automated mutation.

No CSV/PDF/final-statement export, share link, immutable closeout, or recorded
settlement receipt was found. Reports are recomputed in browser memory from
live rows.

## Current UI Flow

The Ledger is one approximately 2,950-line client page. On mobile widths, add or
edit opens a full-screen form containing nearly every field. The default form
selects all members, but payer remains blank. Saving waits for remote Supabase
writes and a refresh before closing.

Strengths:

- participant selection is visible;
- original and base amounts are shown;
- personal and settlement summaries are understandable;
- days/people/settlement perspectives reflect real trip questions.

Weaknesses:

- too many fields before the first save;
- payer and participant selection are separate but not optimized for recent use;
- no custom split UI despite schema types;
- no local save, queue status, receipt shortcut, or one-handed fast path;
- network/rate resolution is part of entry completion;
- duplicated calculations and a monolithic page make correctness hard to test.

## Direct Supabase Dependencies

The Web browser directly selects/inserts/updates/deletes:

- Journey Ledgers;
- Ledger entries and participants;
- Journey exchange-rate snapshots;
- itinerary events/reservations used by Ledger;
- Journey members and current Auth identity.

Capture, planner import, Journey settings, profile summaries, and query helpers
call the same direct module. Several server-side Story/place/report features
also query `ledger_entries` directly. This entire access pattern is prohibited
for OTR Mobile business data. Mobile must use repositories locally and typed OTR
Backend endpoints remotely.

## Logic Worth Reusing

Reuse or adapt the ideas, with new implementations:

- membership records independent of user accounts;
- one payer plus explicit included participants;
- original-currency preservation and per-expense conversion evidence;
- Journey settlement currency;
- itinerary/reservation and place linkage;
- category and per-person balance projections;
- deterministic net-balance-to-transfer planning;
- local-first idempotency already proven by the Mobile vertical slice;
- Capture parsing as a draft producer, never as an unreviewed financial commit.
- two-layer Ledger checking: deterministic financial invariants plus advisory,
  non-mutating heuristic review;
- explainable personal balance projections from saved member allocations.

Pure date-allocation logic may be adapted for reporting, with timezone and
residual-rounding tests. Category names can seed the new taxonomy but should not
be treated as immutable database enums.

## Logic To Retire

- direct browser/Mobile access to Supabase business tables;
- JavaScript floating-point money as the source of truth;
- equal-share rounding without deterministic residual allocation;
- sequential header/delete/reinsert participant mutations;
- destructive historical rebasing when base currency changes;
- global user-writable exchange-rate cache;
- silent fallback-rate use without visible provenance;
- hard delete without audit/tombstone semantics;
- duplicated settlement and summary calculations in UI/data modules;
- creator-only UI guard that disagrees with server policy;
- `stats_only` as a prominent mode until its user need is revalidated;
- the monolithic Web form/page and Web navigation structure;
- Ledger data leakage into social/story outputs by default.
- any model that treats card FX cost and fair group valuation as necessarily
  identical;
- a short hard-coded currency picker as the canonical currency definition;
- broad member mutation as the collaboration model.

## Europe Trip Findings And Design Consequences

| Observed travel reality                                                 | Legacy limitation                                                   | Ledger 2.0 consequence                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Receipt EUR amount, NZD card posting, and fair NZD group value differ   | One original/base pair and one rate                                 | Separate Expense merchant truth, PaymentRecord payer-cost truth, and SettlementValuationSnapshot group truth                         |
| Families and children need practical recurring treatment                | No Household; only latent equal/custom/percentage rows              | Household is Ledger Phase 1 and always expands to exact member shares                                                                |
| Receipts are captured before or after entry                             | No first-class expense evidence lifecycle                           | Support both workflow directions; asset upload/OCR stays independent of financial sync                                               |
| Group members notice mistakes in others' entries                        | UI creator-only while RLS participant writes are broad              | Add correction requests; creator accepts, organizer may override with reason                                                         |
| Travellers must trust the final bill                                    | Browser totals lack immutable drill-down                            | Every balance links to expense, own split, merchant amount, valuation, rate/payment evidence, and transfers                          |
| Real trips cross many currencies                                        | Short UI lists/fallback estimates are insufficient                  | ISO 4217 metadata, provider cache, immutable snapshots, and explicit cross-currency repayment                                        |
| Mistakes are visible through context and evidence                       | Existing audit is heuristic-only                                    | Add authoritative deterministic validation and advisory versioned heuristic findings; neither AI nor heuristics silently edits money |
| Each travel period has a different group and financial boundary         | Ledger opens as a page without a robust multi-Journey personal view | Keep every Ledger Journey-scoped, show context persistently, and add a Journey-separated My Ledger projection                        |
| Spending analysis and debt settlement answer different questions        | Balance and entry views dominate the experience                     | Make Spending and Settlement peer modules over the same accepted records, with search and analysis under Spending                    |
| Repayment can happen in several instalments and needs both sides' trust | Legacy settlement is only a calculated suggestion                   | Model a transfer obligation with child payments; payer records Paid and recipient confirms Received for each partial payment         |

## Redesign Constraints

Ledger 2.0 must treat an expense and its splits as one versioned aggregate,
store money in integer minor units, preserve immutable rate evidence, calculate
settlement deterministically, and route all remote mutations through the OTR
Backend. SQLite remains the Mobile source of truth, and network/auth failure may
pause sync but may not block local entry or access.

See the companion Product Spec, Domain Model, UX Flow, and Sync Conflict Model
for the proposed replacement.
