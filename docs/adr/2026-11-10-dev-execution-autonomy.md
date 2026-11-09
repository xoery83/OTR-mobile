# DEV execution autonomy

Accepted for routine shared Mobile DEV work on 10 November 2026. The scoped
database contract below is proposed for Owner review. Production is outside
this decision.

## Standard execution identities

- Root2 uses the existing DEV Host identity and single Writer for Backend
  releases, health verification and retained-container rollback.
- The existing linked DEV PostgreSQL management identity is separate. The
  observed `session_user` and `current_user` were both `postgres`. Only
  approved transactional migrations may use this identity. Confirm project,
  database identity and actual permission on each operation.
- The DEV CP14 Actor `f4b059c5…` has a Host-custodied Auth session. Normal
  session renewal does not grant database authority. Gateway commands require
  their actual database grant and dedicated gateway identity.

## Scoped gateway authority — pending one review

The guarded DEV catalog read at 08:02:23 NZDT found zero active
`CONFIG_ADMIN` and `SECURITY_ADMIN` grants, an admin gateway with NOLOGIN and
zero sessions, and workload scope revision 30 closed. Receipt SHA256
`59f4656be64293ea851826e845a7eaea433a81b5370029ef183f09234ac6dca3`.

The existing `cp14_context` checks Actor, environment, permission and validity. The issuer trigger separately enforces
grant revision. Its grant cannot constrain commands to a route or model. The current
SECURITY_ADMIN surface includes an environment-level kill operation. The
existing workload grant binds an Account, with no Trip pin. Directly granting
these existing roles would exceed the approved authority.

The proposed additive DEV change uses the existing grant row, postgres issuer,
Admin Gateway, ACL, CAS and audit. It consists of:

- A validated scope on the existing admin grant. CONFIG_ADMIN permits only
  `intelligence_provider_config_append` and `external_integration_price_append`
  for the exact DEV DeepSeek route, profile, model and allowed price bounds.
- SECURITY_ADMIN permits only `flight_activation_select` and
  `flight_activation_account_grant` for the exact DEV workload scope and
  synthetic Account/Trip pair. Scope selection rejects active workload grants
  outside that pair. Global kill, unrelated integrations and grant issuance
  remain outside the scoped authority.
- An optional Trip pin on the existing workload Account grant. Require it for
  scoped calls and enforce any stored pin at selection, reservation and
  dispatch, including callers that use legacy selectors. Existing unscoped
  callers retain their contract. The scoped Actor cannot have a parallel
  broad grant. Renewal or revocation cannot widen its scope.

One Owner review covers the additive migration, fixed issuer and two scoped
grant postimages, revokes, and exact forward/inverse preimages. Verify
revocation, foreign integration/model, global controls, non-synthetic account,
second Trip for the same account, and unchanged legacy behavior in isolation.
Verify the four allowed commands and workload close/readback. Revoke grants
and close the workload before any eligible inverse. Retain receipts and audit.

Relevant definitions are `cp14_context` and the admin-grant issuer trigger in
[CP14 persistence](../../supabase/migrations/20261006000100_external_integration_persistence.sql),
and the workload grants in
[dispatch foundation](../../supabase/migrations/20261007000100_flight_dev_dispatch_foundation.sql).

The normal release and session commands are in the
[DEV Backend Runbook](../ops/DEV_BACKEND_RUNBOOK.md). V3's pinned SQL remains
unsent. The prior closed-state Backend release and native four-image smoke are
valid. Real DeepSeek and QA178 E2E remain pending scoped authority and activation.
