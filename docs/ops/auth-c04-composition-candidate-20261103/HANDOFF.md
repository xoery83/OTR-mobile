# C04 default-closed raw-Core composition candidate

Base: fixed main10094d52 on isolated codex/root-auth-c04-main-20261103. Candidate
only; no main, Hosted, SQL, configuration, authority or device action.

Two production files change: tripCreateRuntime adds an optional internal third
argument `{memberClaim:{inviteExpiresAt}}`; only version3 can use it to construct
createTripMemberClaimPgPort from its existing rawCoreConnection. serverCapture
only passes through an existing returned memberClaimPort. Current serverCapture
loader calls do not pass that third argument, so no Claim port is constructed or
injected and authenticated Claim/Recovery still returns503 MEMBER_CLAIM_CLOSED.
No Env key, mount schema, new connection, credential, CoreHttpConnection reverse
adapter or default lifetime is added.

The trusted expiry remains a required explicit server value, parsed by the fixed
Auth PG adapter and passed unchanged. It controls invitation expiry; it is not a
runtime activation deadline, a registration identity proof, a membership renewal
or an already-linked member revoke. The existing owning transaction/SQL continues
to qualify server time, actor/Trip, invitation and receipt. No expiry is inferred
from the sustained v3 mount, whose lifetime is not finite.

The same local closed flag used by the v3 close lifecycle guards Claim before
entering atomic, again on entry to the held transaction, after its work and after
the result. Closing during callback work makes the callback reject before the
fixed PG adapter's commit; queued work cannot start after close. A close racing
an already-attempted commit can still mean UNKNOWN: retain original operation
and digest and follow Auth recovery, never execute again or grant from a receipt.
No generic member-removal port is introduced; revokeUnclaimed remains invitation
cancellation only.

Remaining exact activation gap: Auth/Root must qualify a trusted server selection
and invitation-expiry policy for the approved A/B case, then explicitly provide
it at the owning server composition call. This candidate deliberately does not
choose a config source, TTL, activation window, expiry extension or QA authority.
Existing normal A/B identity, Core Reader and cleanup qualification remain Auth
E2E work. This software change does not supply that execution approval.

Validation uses mocked mount/connection factories, not actual credentials/SQL:
existing runtime plus actual default-closed route tests; added checks prove no
port by default, exact raw connection/expiry reuse with no fifth connection,
close before/reaching callback completion, and queued callback refusal. Fixed
PG, all Auth and device suites are not repeated. See VALIDATION.json.
