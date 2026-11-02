# Registered directed Invite/Claim — exact DEV protected installation candidate

Status: PREPARED_NOT_AUTHORIZED. Hosted preflight requested from Root; no execution.
Project: `tuqigdxrvrerfewsxqgm` only. SQL SHA256: `2eec272c3551e4b8184621ec0728f7773cf2b363785ba08ba706c5189ce6d587`.
Marker: `OTR_MEMBER_CLAIM_REGISTERED_DEV_20261103_V1`.
This packet supersedes no earlier permission Gate. Earlier OAuth/Profile approvals do not cover it.

## Exact new permission / identity scope

- Two initially empty private tables: `trip_directed_invite_targets`, `trip_member_claim_receipts`.
- RLS enabled on both, zero policies, no direct grants to public/anon/authenticated/service/Core gateway.
- Three functions: `trip_member_claim_transaction(text,jsonb)` (SECURITY DEFINER),
  `trip_directed_invite_legacy_guard()` (SECURITY DEFINER),
  `trip_member_claim_receipt_immutable()` (SECURITY INVOKER); owner postgres, fixed search_path.
- One EXECUTE to existing NOLOGIN `otr_trip_core_v2_gateway`, dispatcher only.
- Two triggers: immutable receipt trigger; mapped-row-only guard on existing `journey_invites`.
  Existing generic invitations remain unchanged; new directed rows are legacy-inactive and cannot be reactivated through old APIs.
- The dispatcher authorizes the original Trip Owner to target an exact registered Account for an existing never-linked Person;
  that exact normally authenticated Account can explicitly connect the Person atomically with an immutable receipt.
  It writes existing `journey_invites` lifecycle/usage and `journey_members.user_id/status/linked_at` through the owning server transaction.
- No new database role, role membership, table privilege, generic member-removal right, role/Creator/private-Item grant,
  RLS relaxation, existing real-user migration or deletion.

## Execution limits

Installation itself creates metadata/empty tables only and activates no Backend route,
Native caller, policy window, Provider or QA Session. Current app port remains absent.
Normal Synthetic QA afterward still requires qualified normal Auth and separately
fixed server/Native composition within the existing authorized test scope; this file
cannot authorize a new raw SQL business operation or arbitrary Account connection.

Root is the unique protected SQL Writer. Before installing, Root must verify the
actual selected DEV project outside SQL, fresh catalog/ACL/dependencies and exact
bytes. SQL's project GUC is only an extra guard, not evidence of endpoint identity.
The candidate requires absence, fixed marker, safe role/dependencies, bounded locks
and statements, and exact post-install owner/ACL/RLS conditions. Any drift or
unexpected existing object stops/rolls back; no CREATE OR REPLACE, DROP or migration.
No install retry on UNKNOWN: reconcile exact objects/receipts first.

No Owner-only grant/identity execution has occurred. Fresh readback and protected
approval are still pending. Production and other Accounts/Trips are excluded.
Delegated Organizer, unregistered Claim, Switch/Reset, general expulsion, Invite
link/QR and private Profile are not enabled by this packet. Expiry must come from
an explicit trusted server configuration; no production lifetime is invented.

## Review and evidence

`INDEPENDENT_REVIEW.json` records scoped independent Review and five new unit tests.
Actual local PostgreSQL receipt includes explicit-target/foreign-Account denial,
real receipt-failure rollback, COMMIT-ack-loss read-only recovery, concurrent
Claim/Claim and Claim/Revoke in both orders, expiry, legacy-bypass denial and ACLs.
The fixture is pinned to the existing local Colima Unix daemon, network-none, 256MB,
and has been removed. No Hosted/Provider/Native or formal Member removal PASS.
