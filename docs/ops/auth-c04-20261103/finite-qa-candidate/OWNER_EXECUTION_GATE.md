# AUTH-C04 — one finite Hosted DEV Invite/Claim QA window

Status: final candidate for independent review, NOT AUTHORIZED. No plan, timestamp,
QA timer, normal Session or business mutation has been created by this packet.
This request does not repeat the already-approved/installed `7c3250ef…` SQL Gate.

## Exact additional scope

One window on Supabase DEV `tuqigdxrvrerfewsxqgm`, Backend
`https://api-dev.xoery.art`, using the existing normal Auth and owning PG authority:

| Identity | Fixed value |
|---|---|
| Owner A | `26876e6e-a919-457d-bc00-78d76ba08043` |
| Claimant B | `1f3d7935-1bdc-4952-8d7f-0f72077368c1` |
| Trip | `fb2f0820-e429-404a-b4dd-7adcad814e45` |
| Owner Person | `b90c34ba-96d7-4b64-874a-b4f5525d64d8` |
| Claim target Person | `bcd1d48e-a9f7-445a-911b-0452ff8dc55a` |
| Original ISSUE operation | `b3299bda-8939-4e49-8377-338f8e619869` |
| Original CLAIM operation | `4028b673-9032-41c8-807e-c7d3592eae93` |

Runtime at most 1,800 seconds. Invite expiry at most 600 seconds from opening and
no later than close. No automatic renewal or second window. These are QA limits,
not production invitation policy. No new Schema, RLS, GRANT, role or permission rule.

Auth performs normal separate login for the two existing synthetic Accounts,
at most one OTP challenge/send per Account. The existing receiver matches exact
recipient and request time; normal `verifyOtp` and `/user` must prove identity.
No automatic registration, password fallback, copied Session/Keychain, fake JWT or
administrator substitute. Secrets/OTP remain in memory, never logs or repository.

Then: fresh scoped preflight → A ISSUE to registered B → independent receipt →
B explicit-consent CLAIM of that exact server-produced invite → independent
receipt → authorized A/B Core collection and B Person binding readback. Retain each
original command/digest before transmission in owner-only 0700/0600 QA custody.

After confirmed Claim receipt only, allow one identical CLAIM operation/digest
idempotency submission plus original-operation read-only recovery. Existing bounded
401 handling may retry only the identical command after a definitive Auth rejection;
it does not authorize replay after UNKNOWN. On a network/timeout/503 UNKNOWN, only
one recovery query for that original operation, never blind execution replay or a
replacement ID. Missing/mismatched receipt stops. The server-returned invitation ID
is bound to the fixed Trip/Person/B and expiry; it cannot be replaced arbitrarily.

Private Item absence is a negative only if a qualified existing A-private fixture
was actually visible to A. Otherwise report NOT_VERIFIED. Revoke only each test's
own temporary login session and prove its refresh revoked; no global logout.
Cleanup may finish after runtime closes, but no business call may continue.

## Root control and permitted plan substitution

Root remains sole shared Host Writer. After approval only, seal one execution plan
against this Gate hash, actual Owner approval receipt, fixed source hashes, actual
server UTC and qualified fresh baseline. Permitted substitutions are one new window
UUID, UTC open/expiry/close within the bounds, and the actual qualified current
CID/image/Config/Host/Env/mount/file hashes. They cannot change identity, operations,
capability scope or approved C04 source bytes. A changed C04 source/authority, foreign
configuration or failed baseline qualification stops for review rather than silently
expanding approval. A previously observed CID/time is not permanent authorization.

Root first confirms the coordinated service QA window is free of conflicting
Import/MCP runtime work; the short mutation lock alone does not grant that window.
Do not preempt another lane or change its Provider/OAuth/runtime configuration.
Root repeats actual DEV identity and preimage CAS before activation: A is original
Owner, Owner Person matches, target unlinked/linked_at null, B has no linked Person,
both original receipts absent, no prior directed invite, matching target payment/
grant and removed-user counts zero. Unexpected state stops for reconciliation;
do not erase data, select another fixture or manufacture a fresh operation.

Stage the same image/HostConfig/mounts as the retained healthy default, changing
only `OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG`. Arm and independently verify the exact
absolute-deadline systemd close timer and immutable plan before start. Stage/arm/
start unknowns require reconciliation, not blind repeated creation. No actual
activation is required to request approval. Close early on completion/failure;
the independent timer remains the backstop. Restore and independently read back
the exact healthy retained default with selector absent. Foreign deployment drift
must not be overwritten. Unconfirmed close is unresolved and stops business calls.

Closing runtime does not undo a committed Claim. Preserve Person/Creator/history,
original command/digest and immutable receipts; no unlink, deletion or data reset.
Recovery after the approved window needs separately qualified access, not reopening.

## Qualified evidence and remaining runtime limits

`OWNER_EXECUTION_MANIFEST.json` fixes source and preparation receipts: Auth scenario
`a0245ba2`; readback/normal callbacks `eb884c67`; Root controller `66b99173`, selector
`a403549f`, default-closed main integration reported `0e0cf906`; independent reviews.
The Host preparation receipt and mounted-file hashes require fresh execution CAS.
Root has executed the ten-field preflight SELECT on actual DEV; that is not A/B E2E.

Receiving GET permission passed at `2026-11-03T03:28:17.276Z`, without reading mail
body or sending OTP. Daily sending allowance/reset remains unknown. On quota,
429, failed delivery or Auth/Receiving rejection, stop with the actual reason;
do not repeatedly send or label it a code failure. The existing bounded receiver
may poll only that challenge; polling does not authorize another OTP send.

Member Revoke, pending-invite Revoke, role grants, public invitation links,
Native device operation/cold restoration, other Accounts/Trips and Production are
outside this Gate. Those C04 exit criteria remain NOT_RUN until separately proven.
No payment, Provider runtime change or additional SQL installation is authorized.
