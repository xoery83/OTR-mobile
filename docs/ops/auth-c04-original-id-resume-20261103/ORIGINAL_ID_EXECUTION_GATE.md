# AUTH C04 — original-ID recovery-first finite execution Gate

READY FOR SCOPED REVIEW / NOT AUTHORIZED / NOT ARMED. No Session or clock starts from this document.

## Exact scope

Only DEV `tuqigdxrvrerfewsxqgm` / `https://api-dev.xoery.art`:
Account A `26876e6e-a919-457d-bc00-78d76ba08043`, B `1f3d7935-1bdc-4952-8d7f-0f72077368c1`,
Trip `fb2f0820-e429-404a-b4dd-7adcad814e45`, Person `bcd1d48e-a9f7-445a-911b-0452ff8dc55a`.
Original ISSUE `b3299bda-8939-4e49-8377-338f8e619869`, digest `27da9414669e8ecd83c826d39438c09f2ad9049bfcfcb829c6b300975164e7d1`;
original CLAIM `4028b673-9032-41c8-807e-c7d3592eae93`, bound only to that ISSUE's actual invitation.
No replacement IDs, invitation extension, deletion, unlink or reset of old UNKNOWN/receipts.

## One complete operation, not another read-only window

- Real Root `qualify-resume` must pass before any normal A/B Session, and again after login.
- Each Account may use at most one normal OTP; failed delivery/rate limit stops. Existing accepted receivers and normal identity checks only; credentials stay in the owning process.
- Recover original ISSUE first. Only an explicit new approval of this Gate permits at most one submission of the unchanged original ISSUE when absent. Absence is not NoCommit. The existing atomic authority rechecks its receipt.
- A failed initial recovery stops. A submission timeout/503/UNKNOWN permits one original receipt recovery, never a second submission; unconfirmed/mismatched outcome stops.
- Recover original CLAIM. A prior LINKED receipt is independently verified without making an old invitation usable. Before an absent CLAIM's one allowed submission, independently verify the actual invitation's exact ID/Trip/Person/B/PENDING state and unexpired server time. Expired/missing/ambiguous invitations stop; do not extend or replace them.
- Approval explicitly covers the synthetic B user's confirmation of joining only this Person/Trip through its own normal Session. No consent or identity is borrowed from A.
- After confirmed LINKED only, one same-operation idempotency check is allowed. Existing Core Member Read, independent receipt/readback and qualified Owner-private exclusion are verified; absence of a private fixture is reported, never fabricated.

## Fixed software and actual baseline

SOFTWARE_MANIFEST_SHA256 = e188a6f9fafa6aebb9fcc82be3d37a261c04f48b48cd268d467eb97183ae7980

Use the reviewed Auth411/Root7c/driver03d sources and existing bounded read-only SQL port. The launcher verifies actual Owner approval, manifest bytes and independently frozen expected case/image/staged CID/config/plan before invoking the driver. No zero-count preflight.

Expected software image is `sha256:68aa588ffd16f11b93e59e1fd3dafc54306dd995b2fadc476947768fbe9dd9fc`, with server/capture bundles7cbf/6f4 and existing Host6c9/Consent6040 unchanged. Latest observed default is CID0c723/configeb99. At actual readiness freeze a fresh healthy default and complete Config/Env/HostConfig/mount/file hashes in one immutable plan. No active Auth/MCP selector/mode is permitted. The only permitted baseline compatibility delta is the separately approved94a Import PNG runtime expiry/configuration within its original f4/825 scope, same68aa software; preserve it exactly. Any other drift stops. This Gate grants no Source/Provider authority.

Root `ORIGINAL_ID_RESUME` is plan-only metadata. It selects the existing exact fixed A/B QA authority with Backend MODE absent; it is not a new Backend mode or global feature enable. Old RECOVERY_ONLY remains false/15minutes and cannot grant this execution.

## Finite execution and closure

One unused window, bound once only after sources, normal receiving prerequisites, fresh baseline and close qualification are ready. T must be no later than2026-11-04T08:00:00Z; D=T+1800seconds maximum, constructor selector expiry no later thanT+600seconds. This selector expiry cannot rewrite an existing invitation. No clock reset/extension. Dual independent absolute timers close atD-120seconds andD, exact plan hash/argv/readback verified before start.

Stage/start/restore take only the actual short Backend Writer lock. Do not restart an in-flight Source/Provider or other protected operation. Release after each mutation; the business test does not reserve all DEV.

On success/failure/expiry close the exact temporary runtime and restore the retained fresh healthy default, verifying selector/MODE absence, Config/Env/mount/image hashes and health independently. Revoke only both newly owned Sessions and prove refresh rejection; preserve committed invitations/membership/receipts and every prior UNKNOWN. Disarm own timers only after closed verification. Failed close blocks further activation; never rollback business data.

No new SQL/schema/RLS/GRANT/role, OAuth/Issuer, Provider call/budget, Native operation, Member Revoke, other Account/Trip or Production access. Existing approved PG transaction/normal Auth/readback are reused. This approval is requested solely because both713/e930 one-shot windows were consumed and did not authorize this conditional recovery-first submission scope.
