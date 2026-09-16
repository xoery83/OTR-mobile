# ADR 0019: Account Switching And Device-Local User Scope

Date: 2026-09-16
Status: Accepted; Slices 1–4 implemented and foundation gate passed

## Context

The Mobile session currently stores only one token pair. Ledger actor context,
My Ledger summaries, pull cursors, selected Journey state, and durable queues
are device- or Journey-scoped. Replacing the token without changing those
scopes could expose the previous user's personal projection or submit an old
mutation with the new user's token.

Account switching is a future Production capability. Development needs a fast
way to exercise real Organizer and Member sessions, but a separate fake role
switcher would preserve the underlying isolation defect.

## Decision

1. The app records an explicit authenticated identity for every secure session
   and one active account. Remembered sessions are stored independently in
   SecureStore. Passwords are never stored.
2. Account switching uses one shared Production-safe boundary: pause new sync,
   let old authenticated work settle, invalidate in-memory state, select and
   validate the target session, restore only target-scoped cache,
   bootstrap/reconcile when online, and resume only target-owned operations.
3. SQLite v19 is a device-local isolation migration only. It does not redefine
   server ownership, Journey membership, financial ownership, or authorization
   semantics. It implies no Backend or Supabase schema change.
4. Actor context, My Ledger cache, pull cursors, selected Journey state, and
   other personal permission projections are keyed by auth user.
5. Every durable authenticated mutation records the auth user that owned it at
   creation. A queued operation may be claimed and executed only while that
   exact user is active.
6. Local unconfirmed Expense, Itinerary, and receipt records record their local
   owner. Repository visibility follows this rule:

   ```text
   server-confirmed shared row authorized for the active Journey actor
   OR
   local unconfirmed row owned by the active user
   ```

   Reads must not reduce this to `owner_user_id = active_user`, because that
   would incorrectly hide canonical shared Journey facts.

7. Legacy operations whose owner cannot be proven remain durably parked and are
   visible only in diagnostics. The v18 single-account state is adopted only
   when its persisted actor context proves the same auth user; ownership is not
   guessed from a member id.
8. Development may expose a quick selector for real remembered Dev sessions.
   It is environment- and diagnostics-gated and never changes local role/member
   state.
9. Log out ends the current account's use and returns to the authentication
   boundary. Removing another remembered account is an explicit device action;
   switching accounts does not revoke the inactive remembered session.

## Foundation Gate

Before account/menu UI begins, automated foundation acceptance must prove:

```text
User A signs in
-> A creates a local unsynced Expense
-> switch to User B
-> B cannot see or sync A's local Expense
-> B sees authorized server-confirmed shared data
-> switch back to A
-> A's local Expense and operation remain
-> reconnect as A
-> A's operation syncs successfully
```

The negative queue invariant receives its own test: when A owns a pending
operation and B is active, the worker must not claim the operation or call the
transport.

## Consequences

- Mobile SQLite schema is v19.
- Shared financial aggregates are not duplicated per account.
- Repository and worker entry points need an explicit active user identity.
- Existing single-session installs require a safe v1-to-account-session
  adoption path.
- No global state framework, alternate sync engine, Backend endpoint, or
  Supabase migration is introduced.
