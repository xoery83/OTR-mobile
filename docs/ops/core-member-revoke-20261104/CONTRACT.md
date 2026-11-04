# Core Member Access v2

Owner 4 November 2026 / Auth contract6d91b6e9. Source development only; no DEV install or execution approval.

- Existing normal-auth Core HTTP namespace accepts `REVOKE_LINKED_MEMBER_ACCESS` through the formal owning-command branch. `TRIP_ACCESS` vectors use accessRevision, never Item/Person/participation revision. Existing Item command schema remains the graph-only subset.
- Exactly one current normal, linked, non-denied `journey_members.role=owner` authorizes a same-Trip linked non-Owner Person/Account target. Historical creator confers no authority. Retain membership identity, participation, roles, private Item and Ledger ownership.
- One authoritative PG transaction serializes Trip, Actor/operation, membership and actual Core reference; writes existing removed-user marker, advances actual Core revision and accessRevision, and inserts the existing immutable `trip_core_command_receipts` row. Existing v2 intent/receipt hash domains are unchanged.
- Exact original operation replay returns its immutable receipt before current CAS; changed intent collides. An original UNKNOWN is only queried until separately authorized; no absence-to-NoCommit inference. Conflicts have immutable CONFLICT receipts without mutation.
- Default-closed one-bit policy extends the existing Core activation row; no new permission framework. PG normal-account/Owner and the existing bounded Core scope Actor/Trip/time columns remain required. The sustained Item profile intentionally binds historical creators, so it is not reused as the Owner predicate. Runtime composition is explicit; installation/EXEC/activation are separate Root2 protected work.
- B-authenticated `core/access-loss` reports only B's explicit retained membership denial plus actual Core epoch/revision/accessRevision. Native uses its own AccountRequestContext with existing repository.revoke; never applies A's receipt to B. No denial is inferred from 404/503/network.
- Accepted denial markers cannot be erased or rebound by legacy invite acceptance or pending Claim. No regrant/transfer implementation. All compatible readers and retained receipts must remain after write closure.
