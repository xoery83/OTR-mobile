# C04 default-closed Backend wiring handoff

Root owns shared app/Bootstrap/Core connection factory. This patch is based on
Root e89dfddf `backend/src/app.ts` SHA434b8612777ba7907ca467fbee4adfed16ab236d090860d50d48ea83b5df78ee.
It preserves Root's requestId increment and all unrelated routes. Do not apply it
to another SHA silently: rebase only the exact new Options/import/destructure/route
lines under the unique Writer and rerun the affected route tests.

## Minimal app contract

`BackendDependencies.memberClaimPort?: MemberClaimAuthorityPort` is optional.
Existing `createDevBackendHandler` dispatches only
`POST /v2/trips/:tripId/member-claim-operations` and its `/recovery` suffix to the
existing Auth boundary, after existing `authenticateNormalAccount(request,gateway)`.
Other methods still fail405 in that boundary. No port means503/CLOSED. There is
no Trip Reader precondition for B: an invited new member has no Trip access yet;
the serialized authority checks exact invitation/Account/Person/consent. A request
body never supplies authenticated identity. Resource OAuth credentials remain
rejected by the unchanged ordinary Supabase Auth gateway, before getUser/business IO.

The patch does not change serverCapture, env, config mounts, credentials, Role,
SQL, startup factories, account/session storage, Provider or feature activation.
Root may consume this default-closed patch after its own current ordinary integration.
The actual shared file and owning worktree were never modified by Auth.

## Auth leaves to consume at their fixed hashes

`LOCAL_WIRING_EVIDENCE.json` lists exact four backend leaves: Authority, Recovery,
HTTP boundary and PG adapter. Root's baseline has the older Authority and lacks
Recovery/HTTP/PG, so imports must not be wired without those leaves. All are Auth
owned. Existing domain/request/auth helpers are reused. The installed7c/3bbe SQL
matches this PG adapter; no new SQL installation or additional privilege is requested.
New unit fixture/patch rendering files are test-only, not required in the image.

## Future explicit injection; NOT in this patch

The PG adapter constructor is
`createTripMemberClaimPgPort(rawCorePgConnection, {inviteExpiresAt})`.
It requires the existing **CorePgConnection.withLease** under the Core gateway,
not the `CoreHttpConnection` exposed as `trip.coreConnection`. The existing v3
`loadDevTripCreateRuntime` already creates `rawCoreConnection` internally before
building the HTTP wrapper. A later qualified composition can reuse it inside its
own lifecycle; never export/copy its password or create another credential store.
Root remains the factory's unique Writer. No new pool/Host image is assembled here.
The expiry is explicit trusted server configuration and is not supplied by Native.
No default/production lifetime policy is invented. Current startup injects nothing.

Before any runtime enablement, separately qualify the exact normal Synthetic A/B
scope, existing Core access/reader gates and independent normal login/cleanup path.
Root's installation readback already records A26876e6e/B1f3/Tripfb2/Personbcd's
registration and never-linked preimage; it is not a Session or B membership proof.
Use normal OTP/Google and own sessions; no App Session/Keychain transfer, admin login
substitute or stale MCP authority. Check Resend quota before any OTP requests.
Installation approval explicitly kept runtime closed and is not activation by this patch.

## Verification and limits

9 new tests passed independently on a generated **Auth-owned** temporary app copy
from the exact Root blob; temporary file removed. Normal getUser is mocked for
these unit checks, not a real Provider E2E. Renderer refuses unpinned source. Root
normal validator body and the auth classification/resource boundary match the
Auth test source despite unrelated Gateway file differences. Types/lint/parse pass.
Old PG/Review suites were not rerun. No actual app registration, bootstrap injection,
Hosted A/B Claim, member revocation, real route deployment or Native cold restore
is certified. `LOCAL_WIRING_EVIDENCE.json` records these boundaries.
