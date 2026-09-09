# Expense Create Vertical Slice

## Purpose

Phase 2A proves the local-first path for one expense without introducing full Ledger behavior.

## Flow

```text
Save expense
  -> SQLite insert with PENDING_CREATE
  -> SQLite CREATE_EXPENSE queue insert in the same transaction
  -> list refreshes from repository
  -> worker marks SYNCING
  -> fake transport succeeds: server_id + SYNCED
  -> or transport fails: expense remains local, queue becomes RETRYABLE
```

## Local Model And Queue

`expenses` stores a local id, nullable server id, trip id, title, integer `amount_minor`, currency, nullable payer and occurrence fields, timestamps, status, and sync version. The existing `sync_operations` table stores one `CREATE_EXPENSE` operation per local create with the local id as its entity id and idempotency key.

## Transport

The transport is a development-only fake adapter, isolated under `src/data/sync/`. It is the only mocked portion of this slice. It returns a generated server id on success and exposes a controlled next-request failure for verification. Local persistence, operation queueing, reinitialization, and retries are real SQLite/repository behavior.

In a development build, the Expenses screen includes `Run pending sync` and `Fail next sync`. The latter makes the next fake request fail once; pressing `Run pending sync` again retries the existing queued operation and reconciles the same local row.

## Restart And Offline Behavior

Creation never waits for network. Closing and reopening the app reloads the expense and its pending operation from SQLite. Offline auth continues to pause normal sync while leaving local reads and writes available.

## Physical Device Validation

Validated on Leon's connected iPhone 16 Pro on 2026-09-09.

- An online expense appeared immediately from SQLite, then the fake worker reconciled it to `SYNCED`.
- In airplane mode, a second expense appeared immediately. Foundation Diagnostics reported DB initialized, schema version `2`, network `offline`, and `Pending sync: 1`.
- That pending expense survived full termination and relaunch without a login redirect. The Release local-bundle build was used for this cold-offline launch because it embeds JavaScript.
- The fake failure control left the local expense in place and surfaced `FAILED`; the following retry changed the same row to `SYNCED` without creating a duplicate.
- A read-only device SQLite inspection confirmed two non-null generated `server_id` values, `SYNCED` expense states with sync version `1`, and completed `CREATE_EXPENSE` operations retaining `attempt_count: 1`, next-attempt timestamps, and the controlled failure message.

## Development Build Note

The Debug Development Build intentionally sets `SKIP_BUNDLING=1` in its generated Xcode bundle phase and therefore requires Metro to cold-launch JavaScript. It displays `No script URL provided` if launched in airplane mode after termination. This is a development-client limitation, not an offline data failure. The embedded-bundle Release build is the appropriate artifact for verifying offline cold launch; the Debug build remains useful for Metro iteration and the development-only fake sync controls.

## Known Limitations

- The screen uses a development placeholder trip until trip selection and members exist.
- There is no production expense endpoint, authenticated transport, split, settlement, edit, delete, or conflict UI.
- The fake transport is only a Phase 2A validation harness and is not a release path.
- A production backend transport and authenticated sync scheduler remain required before shipping this flow.
