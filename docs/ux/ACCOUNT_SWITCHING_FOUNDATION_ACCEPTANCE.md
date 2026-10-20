# Account Switching Foundation Acceptance

Date: 2026-09-16
Status: Passed; UI not started

## Delivered

- Explicit account identity and independent remembered SecureStore sessions.
- Mobile SQLite v19 device-local user/owner scope only.
- Active-user actor, My Ledger, cursor, selected Journey, queue, and local-pending
  repository boundaries.
- Production-safe pause/drain/clear/select/bootstrap/restart switch lifecycle with
  rollback and logout behavior.
- Proven v18 single-account adoption; ambiguous unowned state remains parked.

Backend, Supabase, Hosted Dev data, current tabs, Replay identities, and Journey member
mappings were not changed.

## Automated Gate

The acceptance test creates A's offline Expense and durable operation, switches the
active identity to B, verifies that B sees the server-confirmed shared row but not A's
local row, and verifies that B's worker never calls transport. Switching back to A
restores the local row and sends the preserved A-owned operation.

Separate boundary tests prove that session selection waits for an in-flight old-user
sync, target bootstrap completes before restart, direct mutation kicks remain paused,
failed selection can roll back, and logout does not restart synchronization.

Validation: TypeScript passed, ESLint passed, all 69 test files / 249 tests passed, and
`git diff --check` passed.

## Gate Decision

Stop before Slice 5. Contextual menu UI and the Dev quick-account selector require the
next review/approval.
