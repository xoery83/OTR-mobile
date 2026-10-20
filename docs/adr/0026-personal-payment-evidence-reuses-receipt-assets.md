# ADR 0026: Personal Payment Evidence Reuses Receipt Assets

Date: 2026-09-22
Status: Accepted for Settlement 2.0 Phase 2B

## Context

Personal Payment evidence needs offline file capture, durable retry, private
storage, multiple attachments, and historical owner/counterparty access. The
existing receipt asset pipeline already provides file hashing, local durable
storage, upload operations, a private bucket, and authenticated content routes.

## Decision

Reuse `receipt_assets`, the `ledger-receipts` private bucket, local receipt file
storage, and the existing asset-operation worker. Add only a nullable local
Personal Payment parent and link lifecycle state. Server relationships remain
in `personal_settlement_payment_attachments`, whose Phase 1 authorization and
historical grants decide list/content access. Payment mutation and binary upload
stay independently retryable. Personal Payment evidence does not request OCR.

## Consequences

There is one private binary lifecycle and no second uploader or bucket. An asset
may be linked to one Personal Payment in the current mobile flow, while each
Payment supports many assets. Link removal is a soft delete on the server; the
Payment record and uploaded private object remain auditable.
