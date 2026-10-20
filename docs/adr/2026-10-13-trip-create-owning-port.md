# Trip creation uses one owning receipt and existing creator triggers

Date: 2026-10-13. Status: local port implemented; runtime closed.

An offline Trip starts with one stable local Trip UUID and one durable create
operation UUID. The Backend authenticates the Account and passes that actor to a
dedicated PostgreSQL function. The function atomically stores an operation-bound
receipt, inserts the Trip, lets the existing creator triggers establish its owner
membership and linked Person, and initializes an empty Core read-state row. A
receipt lookup resolves ambiguous network outcomes before a retry. PostgreSQL
compares the exact persisted metadata on replay and rejects actor or payload reuse.

The Backend connection uses a dedicated dormant `NOLOGIN` principal with only
function execution rights. Provisioning that principal, installing the migration
in Hosted DEV, and activating the Core read/command capability remain separate
protected actions. The Mobile queue stays dependency blocked until its explicit
Trip coordinator runs; the generic executor excludes this operation type. The
returned Person is observed owning data, while currency and Ledger initialization
remain unset until their own approved inputs exist.

This keeps Trip identity stable across offline save, lost acknowledgement and
eventual accepted Core read without inventing authorization, a second member, or
a financial default.
