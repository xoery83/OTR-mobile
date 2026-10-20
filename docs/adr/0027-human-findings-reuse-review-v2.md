# ADR 0027: Human Findings reuse Review v2

Date: 2026-09-23  
Status: Accepted for Settlement 2.0 Phase 3A

## Decision

Human-raised concerns are `ledger_review_findings` with `origin = HUMAN`, an
immutable reporter, typed target, source revision and optional note. They reuse
Review v2 lifecycle, eligibility snapshots, personal decisions, projection and
change feed. No Settlement dispute table or second Review worker is added.

Supported targets are an Expense, one exact Expense share, one Personal Payment
record, or one Settlement. The server derives the reporter from authentication,
validates target involvement and snapshots only the reporter, relevant source
owner/creator/counterparty, exact share member and Journey organizer. A source
revision change closes the human Finding through explicit Review reconciliation;
personal ACK/DISMISS never closes or edits the source.

Mobile creates the Finding in SQLite first with a client UUID and one owner-bound
durable operation. The existing Review projection preserves pending local raises
until the server accepts or rejects them. System rule reconciliation is restricted
to `origin = SYSTEM`, so it cannot supersede or resolve human Findings.

## Consequences

Phase 3A adds columns and RPCs but no parallel table, financial calculation, new
worker framework, or Production deployment. Finalized Expense protection remains
unchanged: a concern may be raised against a protected Expense, but ordinary
mutation remains forbidden.
