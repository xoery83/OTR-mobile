# ADR 0013: Ledger Stage 7.1 Settlement Preview And Finalization

Date: 2026-09-12
Status: Implemented and validated

## Decision

1. Settlement preview is a non-persistent `PREVIEW_BLOCKED` or `PREVIEW_READY`
   response. Canonical Settlement history begins at `FINALIZED`.
2. `RATE_REQUIRED` and open-conflict Expenses before the requested cutoff are
   excluded from amounts and returned as finalization blockers. Deleted and
   draft Expenses are explicit non-blocking exclusions.
3. Mobile prevents finalization while its own Journey financial queue is
   unresolved. The backend nevertheless locks and recomputes only canonical
   server state; local intent never changes an accepted Settlement.
4. Canonical input is sorted and serialized deterministically. Its SHA-256
   digest covers Journey settings revision, cutoff, currency/scale, algorithm
   version, member identity snapshots, and normalized settlement-relevant
   Expense facts.
5. Finalization atomically verifies the canonical source snapshot, inserts one
   immutable Settlement input/balance/transfer set, records a `FINALIZED`
   business audit event, and stores the idempotent result. Journey plus digest
   identifies one canonical Settlement across concurrent organizers.
6. Finalized inputs contain normalized payer, participant split, merchant and
   settlement Money, valuation/rate/payment evidence identities, rounding facts,
   and member display-name snapshots. They remain independently explainable
   when source records later change.
7. Expense update/delete/restore remains rejected while referenced by a
   non-superseded finalized Settlement. Rebuild and adjustment commands are
   deferred to Stage 7.2.
8. Stage 7.1 adds no SettlementPayment behavior, repayment conversion, dispute,
   adjustment, or export implementation.
9. Until Stage 7.2 supplies an explicit supersede/adjustment command, a Journey
   may have only one active finalized Settlement. A database unique constraint
   prevents later Expenses from accidentally producing duplicate obligations.

## Algorithm

For each eligible Expense, credit its payer by the accepted settlement value and
debit each participant by the saved settlement split. All values are integer
minor units. Group net must equal zero. Sort debtors and creditors by absolute
amount descending and stable member id ascending, then match in order. The plan
is deterministic and contains at most `n - 1` transfers for non-zero members;
global minimum-edge search is deliberately deferred.

## Consequences

Supabase receives a forward-only Stage 7.1 migration and SQLite advances from
schema 11 to 12. Existing Expense, valuation, conflict, idempotency, pull, Auth,
repository, and sync infrastructure remains authoritative.
