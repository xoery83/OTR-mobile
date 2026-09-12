# ADR 0011: Ledger Stage 5.2 Receipt Assets

Date: 2026-09-12
Status: Accepted for Stage 5.2 implementation

## Decision

1. Copy picker/camera input into the app document directory before inserting
   durable metadata. The original picker URI is never a recovery dependency.
2. Store restart-safe receipt metadata, structured OCR suggestions, and an
   independent asset-operation queue in SQLite schema v10. Queue payloads
   contain asset identifiers only, never bytes or OCR content.
3. Upload through an authenticated backend binary endpoint to one deterministic
   private object path. Completion validates receipt id, path, size, and SHA-256
   and is idempotent under response loss.
4. Keep Expense mutation and asset recovery independent. Linking is its own
   idempotent asset operation and never advances the Expense financial revision.
5. Use one injected OCR adapter. Persist only its narrow structured suggestion;
   never raw OCR text. A suggestion changes financial/domain facts only after a
   user invokes the existing Expense repository command.
6. Reuse Ledger bootstrap/pull/change-feed for canonical receipt metadata. Do
   not create another receipt data synchronization mechanism.

## Consequences

A synchronized Expense may have a failed upload and pending OCR. Receipt-first
imports survive restart before an Expense exists. Retrying upload, completion,
OCR, or linking cannot duplicate the Expense, receipt, or link.
