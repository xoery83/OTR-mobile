# ADR 0048: Expense attachments and receipt draft lifecycle

Date: 2026-09-27
Status: Phase 0 decision; implementation pending

## Decision

The canonical product contract is
`docs/EXPENSE_ATTACHMENTS_RECEIPT_SCAN_1_0_DESIGN.md`. Evolve the existing
`receipt_assets` / `ledger_receipt_assets` metadata, file store, asset queue,
transport, and authenticated Backend routes. Do not rename the tables or build
a second uploader merely to change terminology. An Expense attachment is a
receipt asset linked to an Expense; Personal Payment evidence uses the same
binary infrastructure and its existing separate link and visibility rules.
The shared asset does not imply identical OCR, delete, or authorization behavior.
Future user-facing terminology may say “attachment” without renaming storage.

Receipt Scan exists only in New Expense. Its image starts as a temporary local
draft file and on-device OCR supplies editable suggestions. No remote upload or
durable asset operation is created while scanning or selecting. Cancel removes
the draft file. On Save, the Expense and promoted attachment metadata/upload
intent become durable together; the selected receipt consumes one of the
maximum three attachment slots. Existing Expenses may add, view, and delete
attachments without OCR. OCR output is transient draft assistance, not a
permanent Ledger object, Review finding, or financial mutation.

`uploaded_by_user_id` (the existing server `created_by` until an additive
rename/alias is justified) owns cloud byte accounting, not read visibility.
Expense attachment reads follow Expense/Journey authorization. Personal Payment
historical grants remain distinct. The Backend enforces the three-attachment
limit and visibility; the client mirrors the limit for usable offline entry.

Never automatically remove the last known local copy. A local file remains
protected until server-confirmed object existence, integrity, and metadata
completion prove a recoverable remote copy. Only then may it become disposable
cache. Supabase Storage remains the current provider. A future provider boundary
must keep vendor calls out of the attachment domain when the German/S3-compatible
provider is introduced. Actual stored bytes must remain attributable per asset
and reconstructable by uploader; a later projection and quotas derive from those
records.

## Implementation boundary

Phase 1 builds the attachment foundation and temporary draft lifecycle. It does
not introduce Apple Vision OCR, a new storage provider, cache eviction/UI, usage
projection, quota, or pricing. Until the on-device OCR phase is complete, no
screen may claim that offline OCR works. ADR 0011's durable receipt-first OCR
queue and server OCR path describe prior behavior and are superseded for New
Expense scanning; ADR 0026's Personal Payment evidence reuse remains in force.

The file system and SQLite cannot share one transaction. On Save, first copy
the selected draft to a durable staged path while retaining the draft, then
commit Expense, attachment metadata, and queued upload in one SQLite transaction.
After commit, remove the draft. An interrupted pre-commit copy can be cleaned
only after verifying it has no SQLite reference; an interrupted post-commit
cleanup may remove the duplicate draft, never the durable last copy. Failed
promotion must leave the draft available for retry and must not report a saved
Expense with a missing attachment.
