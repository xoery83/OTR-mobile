# ADR 0021 — Review v2 personal projection and protocol gate

Status: accepted for local Phase 2 foundation (2026-09-17). Hosted Dev rollout awaits approval.

## Decision

Keep Finding observation/lifecycle shared, but store ACK/DISMISS in `(finding_id,user_id)` decisions derived from append-only actor actions. Active eligibility is calculated against current canonical Expense roles and nonzero splits; historical v2 eligibility uses an observation-time linked-user snapshot, always bounded by current Journey membership. Backend Review reads, refreshes and actions use this eligibility. Normal APIs return only the caller's decision and actions.

Bootstrap and pull carry a complete caller-scoped Review projection; the old Journey-wide Review change records are suppressed. Mobile replaces only the authenticated user's visibility and decision cache, while preserving pending optimistic actions until terminal reconciliation. The full snapshot is intentionally simple; a per-user delta feed is deferred until Review volume warrants it.

Review endpoints require `X-Review-Protocol: 2`; old clients receive 426. General Ledger bootstrap/pull omit Review data for old clients. New clients require the `reviewProtocol: 2` response marker before accepting Review data. Deploy server migration and gate before new Mobile rollout; do not deploy Hosted Dev/Production without separate approval.

## Consequences

One user's decision cannot clear another's Review, and eligibility loss is reflected on the next successful pull. The full projection costs O(visible Findings) per pull; if this becomes expensive, introduce a user-specific delta stream while preserving the same authorization boundary. UI redesign and owner cross-user audit are separate decisions.
