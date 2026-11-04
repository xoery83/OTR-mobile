# Core Member Access v2

Owner 4 November 2026 / Auth contract6d91b6e9. Source development only; no DEV install or execution approval.

- Existing normal-auth Core HTTP namespace accepts `REVOKE_LINKED_MEMBER_ACCESS` through the formal owning-command branch. `TRIP_ACCESS` vectors use accessRevision, never Item/Person/participation revision. Existing Item command schema remains the graph-only subset.
- Exactly one current normal, linked, non-denied `journey_members.role=owner` authorizes a same-Trip linked non-Owner Person/Account target. Historical creator confers no authority. Retain membership identity, participation, roles, private Item and Ledger ownership.
- One authoritative PG transaction serializes Trip, Actor/operation, membership and actual Core reference; writes existing removed-user marker, advances actual Core revision and accessRevision, and inserts the existing immutable `trip_core_command_receipts` row. Existing v2 intent/receipt hash domains are unchanged.
- Exact original operation replay returns its immutable receipt before current CAS; changed intent collides. An original UNKNOWN is only queried until separately authorized; no absence-to-NoCommit inference. Conflicts have immutable CONFLICT receipts without mutation.
- Default-closed one-bit policy extends the existing Core activation row; no new permission framework. PG normal-account/Owner and the existing bounded Core scope Actor/Trip/time columns remain required. The sustained Item profile intentionally binds historical creators, so it is not reused as the Owner predicate. Runtime composition is explicit; installation/EXEC/activation are separate Root2 protected work.
- B-authenticated `core/access-loss` reports only B's explicit retained membership denial plus actual Core epoch/revision/accessRevision. Native uses its own AccountRequestContext with existing repository.revoke; never applies A's receipt to B. No denial is inferred from 404/503/network.
- Accepted denial markers cannot be erased or rebound by legacy invite acceptance or pending Claim. No regrant/transfer implementation. All compatible readers and retained receipts must remain after write closure.

## Consumer and installation boundary

`CoreHttpConnection.memberAccess` is optional; ordinary Item capabilities are unchanged. Explicit `createCorePgHttpConnection(..., {memberAccess:true})` composes it only after its SQL/EXEC dependencies are legally installed. There is no startup injection. A compatible reader must remain after write close.

- POST the unchanged v2 envelope to `/v2/trips/:trip/core/commands`; receive FULL original Core receipt with `accessTransition`. Graph-only `validateCoreCommand` remains the Item-family subset; normal HTTP uses `validateCoreOwningCommand` for the formal membership branch. Never enqueue it as an Item command.
- GET `/v2/trips/:trip/core/operations/:operation` reads the same immutable Core receipt. Missing/503 retains the original UNKNOWN; no automatic POST or replacement ID. The Actor is normal server Auth, never a request field.
- GET `/v2/trips/:trip/core/access-loss` returns only the requesting B Account's explicit retained denial. Validate `coreAccessLossSchema`, Account/Trip and current request generation, then call existing `createTripCoreV2Repository.revoke(B_context, loss.coreReference.accessRevision)`. Never consume A's receipt as B's cache mutation. Generic404/503 is not a denial observation.

Root2 must qualify the actual actor-scope definition/Owner/ACL, original write guard90457991 (invoker), and read-state15fb1641 (invoker, prior Claim nesting fix retained). Offline transformation refuses different anchors or old pre-fix read-state. No raw private function definition belongs in Git. Exact new private SQL hashes and fresh metadata are protected-install prerequisites, not implied by Source acceptance.

Default closed: add only `member_revoke_enabled=false` to the existing activation row, reuse its Actor/Trip/start/expiry columns, keep public/anonymous/authenticated/service roles without new EXEC. The Gateway requires only the exact RPC EXEC when separately approved. Internal guard proof functions remain Owner-only. No new role, RLS or member/financial ownership change. Closing writes sets only this owned capability false; accepted denials/receipts/readers and marker protection remain.

Before any reverse installation, prove no accepted Member receipt exists; once accepted, never drop denial protection or revert to incompatible readers. Existing old Schema/Role/Gate approval does not cover new column/EXEC/guard bytes. Root2 retains the exact protected authorization and installation responsibility.
