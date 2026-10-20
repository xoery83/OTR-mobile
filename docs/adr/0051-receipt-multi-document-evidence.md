# ADR 0051: Transient multi-document receipt evidence

Date: 2026-09-28
Status: Accepted for C1

## Decision

Parse each receipt image independently through B1, prefix every transient
evidence ID with a stable session document ID, then rerank the combined B1
evidence through B2/B3. Keep adjacency and layout cues within each image.
Combine matching candidates without cross-image duplicate-score bonuses;
retain incompatible strong candidates as ambiguous. Only a unique explicit
receipt currency code may supply an unmarked amount on another image.

The New Expense scan session holds up to three verified draft identities and
OCR documents in memory. Its stable document ID derives from the draft ID;
per-document and session revisions reject stale OCR results. The accepted
attachment validator counts existing drafts and scan parts together. Removal
and cancellation return draft references for the later UI layer to discard.
After restart, verified drafts may be recovered and re-OCRed, but OCR text and
parser results are never persisted as Ledger data.

## Consequences

The single-document parser retains its B4.2 contract. C2 can present ranked
candidates without writing Expense fields. C3 must orchestrate physical draft
cleanup, recovery choice and user-edit ownership. No schema or Backend change
is required for C1.
