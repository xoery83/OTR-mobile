# ADR 0050: Candidate-first receipt Review before Expense entry

Date: 2026-09-28
Status: Accepted product direction for C0 design; implementation pending

## Decision

Receipt OCR 1.0 turns receipt entry into a user-confirmed Review of Title,
Amount and Currency. Vision OCR and the deterministic parser provide local
candidates; Review owns editable values and protects user edits when up to
three image parts are combined and reparsed. Confirm copies the three values
and image drafts into New Expense, while the existing Save remains the only
Expense creation action. OCR does not set Date. The parser is an
evidence/candidate engine, not an automatic financial decision maker.
Optional Apple on-device semantic ranking may be evaluated later, but the
baseline needs no model beyond Vision. Remote AI is excluded from v1.

## Why and consequences

The B4.2 fixed set still contains three wrong-clear amount selections.
Candidate alternatives plus an explicit human confirmation provide a useful
flow without treating parser status as financial truth. A pending scan session
must be separate from already selected attachments so Cancel can discard
only new scans. A multi-document parser contract needs document-scoped
evidence IDs and whole-session reranking. Existing storage/upload/Save rules
remain unchanged. Exact behavior, recovery and implementation slices:
docs/ledger/RECEIPT_OCR_1_0_PHASE_C0_REVIEW_DESIGN.md.
