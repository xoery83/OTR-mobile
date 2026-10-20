# ADR 0018: Expense Settlement Participation

Date: 2026-09-14
Status: Approved; Hosted Dev Backend/Mobile compatibility validated

## Context

The Europe replay proved that a valid Expense may belong in Spending and
consumption analysis while intentionally creating no member-to-member debt.
This is independent of lifecycle/review state and must not restore the legacy
`accounting_mode` abstraction.

## Decision

1. Every canonical Expense has `settlementParticipation = INCLUDED | EXCLUDED`.
   Existing and newly created Expenses default to `INCLUDED`.
2. Both values may be `ACCEPTED`. `EXCLUDED` Expenses retain payer,
   participants, exact original/settlement splits, valuation, receipts, audit,
   search, Spending, Group totals, and participant-consumption reporting.
3. Only `INCLUDED` Expenses enter pre-settlement debt, Settlement inputs,
   member balance vectors, Transfers, or Adjustment current-input/delta
   vectors. Intentional exclusions are non-blocking and use the stable reason
   `EXCLUDED_FROM_SETTLEMENT`.
4. `My spending` is consumption allocated to the member. `positionMinor` is
   the settlement position derived only from `INCLUDED` Expenses. These are
   separate projections.
5. Participation is part of Financial Core. Changes use the existing Expense
   revision, authorization, organizer-reason, conflict, idempotency, and audit
   paths. Frozen Settlement input snapshots explicitly record `INCLUDED`;
   post-finalization toggles therefore produce normal Adjustment deltas.
6. Stage 9 maps otherwise-valid legacy `shared` to `INCLUDED` and
   `stats_only` to `EXCLUDED`. Both may use the bounded
   `legacy-equal-rounding-normalization-v2` proof. Source mode and destination
   participation remain explicit provenance.

## Consequences

- `EXCLUDED` is not DRAFT, review, deletion, conflict, missing-rate, or sync
  state.
- Existing Stage 1–8 rows are preserved semantically by the `INCLUDED` default.
- Stage 9 transform contract advances to v3 because canonical output changes;
  the v2 rounding-normalization algorithm remains unchanged.
- No new framework or parallel settlement engine is introduced.
