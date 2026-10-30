# Native-06 — Realtime Trigger V1

Golden Slice: **BLOCKED at protected owning subscription/change-check ports**.
Client candidate is default-closed and unmounted. No live Realtime PASS claimed.

## Actual progress

Native05 Build127 runs normally on the reset physical iPad. Existing foreground
Downstream remains unchanged: account discovery followed by complete collections
every30s, with15s coalescing and failure backoff. Equal certified collections skip
SQLite writes. This is not a cheap revision check and not a Realtime mechanism.

First measurement attempt failed on receipt GET before P3 POST; exact bounded
Supabase read independently confirmed zero rows/receipts for the reserved test
identity. No APPLIED-to-visible latency can be calculated from that attempt.
Normal Host Session logout/refresh-invalid verification PASS. Same operation and
Item identities retained for a coordinated retry; no object was duplicated.

Retry reached original receipt404, then one POST timed out (19:26:09Z). That
operation is now UNKNOWN; no duplicate POST, Edit or new identity was issued.
Core Writer is classifying shared Gateway53300; no proven causal attribution or
role-limit change. Await same-operation readback before any subsequent mutation.

Same-operation recovery subsequently returned FULL/APPLIED receipta7caf546 with
committedAt19:26:07.622898Z. Independent Supabase row/intent/receipt hashes and
real iPad Day screenshot match one Item/revision1. Original POST took18s to commit;
recovery GET took10.038s. The screenshot confirms existing downstream delivery,
but interrupted observation/reconnect/Touch ID prevents a continuous foreground
latency measurement. No Edit was issued while the system modal blocks automation.

## Minimal client adapter

`tripRealtimeTrigger.ts` accepts an optional owning private subscription; absence
means no channel, timer or Pull. It subscribes before initial invalidation, fences
Account generation/foreground/connectivity, closes late subscriptions, ignores old
callbacks, and coalesces bursts with a trailing read. Failed subscription callbacks
cannot trigger Pull. Runtime lifecycle binding is deliberately not installed.

`tripDownstreamCoordinator.invalidate(context)` reuses the same scoped serial lane,
awaits an existing read before one trailing read, bypasses successful-read cooldown
and preserves failure backoff. It never authors a Mutation, Receipt or SQLite row
directly. During backoff it still relies on an existing lifecycle read or a later
qualified event; there is no independent delivery guarantee or new durable cursor.

No wire payload/protocol or Supabase channel is implemented. No public cache,
Service Role, Schema/RLS/GRANT/Trigger or Provider call. No fallback timer was
added: without the owning cheap revision port that would reproduce the full-Trip
download problem. Current shipped polling was not represented as final V1 behavior.

## Validation and review

- New trigger/coordinator tests:2 suites18 PASS; existing Downstream identity
  regression:1 suite3 PASS. Typecheck and scoped ESLint PASS.
- Covered default-closed, subscribe-before-Pull, burst/trailing read, denied Account,
  Account-generation stop/old callback, offline/background, reconnect, late open,
  failed early callback, cleanup failure and successful cooldown/failure backoff.
- Unique Core Writer bounded read-only Review: **NO_BLOCKER for unmounted adapter**.
  Reviewer inspected code/tests, did not execute them or edit this worktree.
  Review does not qualify private subscription/revocation/cursor or actual latency.

## Real acceptance remaining

| Property | Actual status |
| --- | --- |
| Private authorized channel / committed APPLIED publisher | Owning port absent; NOT ACTIVATED |
| 1–5s foreground latency / native Pull counts / server cost | NOT MEASURED |
| Real denied subscriber / A→B→A socket isolation | NOT TESTED; only deterministic adapter fences |
| Lost signal / cheap reconnect fallback | Owning revision/cursor read absent |
| Formal revocation / regrant | BLOCKED; ordinary404 is not revocation |
| Main integration and unified smoke | Pending acceptance of this bounded candidate |

See `REALTIME_OWNING_PORT_GAP.md` for the exact shared difference. Root/Core and
Auth both confirmed their current deliveries do not supply these ports. This is
the next owning decision; Native must not widen access to manufacture a PASS.
