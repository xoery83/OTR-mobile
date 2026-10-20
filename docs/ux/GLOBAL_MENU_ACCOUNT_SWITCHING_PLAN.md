# Global Menu And Account Switching Plan

Date: 2026-09-16
Status: Slices 0–4 complete; stopped at foundation gate before UI

## Boundaries

- Work only in the canonical Mobile repository.
- Do not redesign the bottom tabs in this task.
- Do not implement Album, My Trips, My Albums, Trip Settings, or Album Settings
  without real approved destinations.
- Do not change Backend or Supabase schema/authorization.
- Do not change Journey member mappings or fake a role.
- Do not modify either Europe Replay identity or the Europe 2026 UI Polish
  member mapping.
- Preserve shared canonical Journey facts and every durable local mutation.
- Add no state framework or dependency.

## Product Structure

The menu is a contextual utility menu.

### Fixed identity/global section

- Current account identity and current-Journey role when available.
- Settings.
- Language.
- Log out, visually separated.

### Current-module section

- Ledger: My Ledger, Review, Ledger Settings.
- Today: no secondary destination currently exists.
- Trip: omit future My Trips/Trip Settings until real routes exist.
- Capture: no secondary destination; Capture remains in the unchanged current
  tab bar until its future global-action migration.
- Album: future only; no current route or product implementation.

### Development section

- Switch test account.
- Diagnostics.

This section requires the Dev environment and enabled Diagnostics Mode. It is
not ordinary Production navigation.

## SQLite v19 Proposal

| State                                                                     | Change                                                  | Rule                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `ledger_actor_context`                                                    | Key by `user_id, journey_id`                            | Role/capabilities belong to a real auth user in one Journey.     |
| `ledger_my_journey_summaries`                                             | Add `user_id`; key by user, Journey, period             | Personal aggregate cache never crosses accounts.                 |
| `ledger_sync_cursors`                                                     | Add `user_id`; key by user and Journey                  | Backend cursor identity is user-bound.                           |
| `sync_operations`                                                         | Add `owner_user_id` and pending-owner index             | Only the owning active user may claim an authenticated mutation. |
| `ledger_asset_operations`                                                 | Add `owner_user_id` and pending-owner index             | Receipt upload/OCR/link follows the same invariant.              |
| `account_local_state`                                                     | New user-keyed selected Journey/account preferences row | Current projection is restored per account.                      |
| `ledger_expenses`, `expenses`, `itinerary_items`, `ledger_receipt_assets` | Add `local_owner_user_id`                               | Only pending/unconfirmed local records are owner-filtered.       |

Canonical pulled rows remain shared for locally authorized members. Existing
unowned operations are adopted only when ownership can be proven; otherwise
they stay parked.

## Ordered Slices

### Slice 0 — Design freeze

- Product and architecture direction.
- ADR 0019 and this plan.
- Navigation IA audit.
- No runtime or schema change.

### Slice 1 — Session identity

- Explicit current-user identity.
- Account index plus per-account SecureStore sessions.
- Adopt the existing single local session without losing offline access.
- Unit tests for store, adoption, refresh, failed selection, logout, and removal.

### Slice 2 — SQLite v19

- Apply only the table changes listed above.
- Test fresh creation and v18 upgrade.
- Preserve domain rows; park ambiguous legacy operations.

### Slice 3 — Repository and worker scoping

- Require active user on local writes.
- Apply canonical-shared-or-local-owned read rules.
- Claim only active-user operations in both queues.
- Scope actor, My Ledger, cursor, and selected Journey reads.

### Slice 4 — Switch boundary

- Pause/wait/swap/invalidate/remount/bootstrap/resume lifecycle.
- Cached offline remembered-account switching.
- Failed-switch rollback and normal logout boundary.
- Run the Account Switching Foundation gate and stop for review.

### Slice 5 — Contextual global menu

- Shared identity/global sections on primary tab roots.
- Ledger-only My Ledger, Review, Ledger Settings.
- Native list hierarchy, Dynamic Type, VoiceOver, reading order, and 44-point
  targets.

### Slice 6 — Dev quick selector

- Real remembered Dev sessions with current state and masked labels.
- One-time normal Dev authentication; never store passwords.
- Dev environment plus Diagnostics Mode visibility gate.

### Slice 7 — Device/backend acceptance

- Organizer -> Member -> Organizer stale-data and permission checks.
- Negative owner-queue test.
- Two independent containers through `api-dev.xoery.art`.
- Allowed mutation propagation and Backend rejection of an unauthorized action.
- Documentation, full validation, and final commit.

## Completion Criteria

- No old-user personal or locally pending projection appears after a switch.
- No operation is submitted with a different owner's token.
- Shared canonical Journey data remains visible to authorized accounts.
- Logout does not delete shared financial data or unrelated durable mutations.
- Global menu never duplicates Today, Ledger, Trip, Album, or Capture.
- My Ledger uses its existing implementation.
- Production contains no Dev selector or credential material.
