# ADR 0055: Save Expense edits and attachment intent together

Date: 2026-09-28
Status: Accepted implementation of the approved Detail/Edit consolidation

Edit reuses the New Expense form and stages receipt removal/new temporary files
in memory. The existing Expense repository update transaction accepts prepared
additions, removed receipt IDs and the loaded revision/active attachment IDs.
It rejects stale state, verifies the cached Journey write role and finalized
protection, then commits the Expense edit, receipt tombstones and upload/link
intent together. Cancel never mutates existing receipts. Edit temporary images
are not registered as recoverable New Expense drafts.

Receipt deletion reuses its existing transaction primitive. Pending deletions
already block replacement uploads, so offline three-slot replacement preserves
server capacity without a new queue or backend contract. Expense Delete reuses
the existing tombstone and audit/causal queue; references and storage remain
retained. Physical purge and a retention duration are outside this decision.

Settlement calculation, acceptance, correction and sync lifecycles are unchanged.
